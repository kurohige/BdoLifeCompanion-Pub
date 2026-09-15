/**
 * Diagnostic logger — JS-side wrapper around the Rust `diagnostic_log` Tauri
 * command. Two patterns:
 *
 * 1. `diagLog(category, message)` — fire-and-forget single line. Errors are
 *    swallowed so logging never breaks the calling code path.
 *
 * 2. Heartbeat — a 5-second interval that snapshots current loot-session
 *    state and JS heap stats. If the log abruptly stops mid-heartbeat,
 *    you know exactly when the freeze hit and what the state looked like.
 *
 * The heartbeat is gated on a loot session being active so we don't spam the
 * log when nothing OCR-related is running.
 */

import { invoke } from "@tauri-apps/api/core";
import { get } from "svelte/store";
import { captureSessionStore } from "$lib/stores/loot-session";

/**
 * Fire-and-forget log line. Never throws. The Rust side handles file rotation
 * + flushing; here we just send and forget.
 */
export function diagLog(category: string, message: string): void {
	// Don't `await` — we want this to be effectively synchronous from the
	// caller's perspective. The promise will resolve when Rust acks; if Rust
	// is wedged, we lose the line but the caller doesn't block.
	void invoke("diagnostic_log", { category, message }).catch((e) => {
		// Last-resort console fallback so dev mode at least sees the line.
		console.warn("diagLog failed:", e);
	});
}

interface HeapStats {
	used?: number;
	total?: number;
	limit?: number;
}

/**
 * Chromium-specific. WebView2 supports `performance.memory` when the page is
 * loaded over http(s)/tauri://; returns undefined-shaped fields otherwise.
 */
function readHeapStats(): HeapStats {
	// @ts-expect-error — non-standard Chromium extension.
	const m = typeof performance !== "undefined" ? performance.memory : undefined;
	if (!m) return {};
	return {
		used: typeof m.usedJSHeapSize === "number" ? m.usedJSHeapSize : undefined,
		total: typeof m.totalJSHeapSize === "number" ? m.totalJSHeapSize : undefined,
		limit: typeof m.jsHeapSizeLimit === "number" ? m.jsHeapSizeLimit : undefined,
	};
}

let heartbeatId: ReturnType<typeof setInterval> | null = null;
let heartbeatCounter = 0;
// Tracks the prior heartbeat's heap_used so we can fire a separate
// `heap_spike` line when the delta is large (>100 MB by default). The
// regular per-heartbeat line still goes out; this is an additive alarm so
// the spike window can be located by grep even if the regular heartbeat
// rate (5 s) buries the transition inside one cell.
let lastHeapUsedBytes: number | null = null;
const HEAP_SPIKE_THRESHOLD_BYTES = 100 * 1_048_576; // 100 MB

/**
 * Snapshot of state the heartbeat reports — kept narrow so the lines stay
 * grep-friendly. Tracked separately from the heartbeat so callers (e.g. the
 * OCR-event batcher) can push their own counters into the per-heartbeat dump.
 */
const counters = {
	pendingOcrEvents: 0,
	drainCount: 0,
	eventsDrained: 0,
};

export function reportPendingOcrEvents(count: number): void {
	counters.pendingOcrEvents = count;
}
export function reportDrain(eventCount: number): void {
	counters.drainCount++;
	counters.eventsDrained += eventCount;
}

export function startDiagnosticHeartbeat(): void {
	if (heartbeatId !== null) return;
	diagLog("JS", "heartbeat_start");
	heartbeatCounter = 0;
	lastHeapUsedBytes = null;
	heartbeatId = setInterval(() => {
		heartbeatCounter++;
		const s = get(captureSessionStore);
		const heap = readHeapStats();
		const rows = s?.rows.length ?? 0;
		const scanLog = s?.scanLog.length ?? 0;
		const running = s?.running ? 1 : 0;
		const elapsed = s?.elapsedSeconds ?? 0;
		// Compact one-line dump — easy to grep, easy to scroll.
		const heapMb = (n?: number) =>
			typeof n === "number" ? `${(n / 1_048_576).toFixed(1)}MB` : "?";
		diagLog(
			"JS",
			`hb#${heartbeatCounter} running=${running} elapsed=${elapsed}s rows=${rows} scanlog=${scanLog} pending=${counters.pendingOcrEvents} drains=${counters.drainCount} drained=${counters.eventsDrained} heap_used=${heapMb(heap.used)} heap_total=${heapMb(heap.total)} heap_limit=${heapMb(heap.limit)}`,
		);
		// Heap-spike alarm. Compares this heartbeat's heap_used to the prior
		// one — any jump ≥ HEAP_SPIKE_THRESHOLD_BYTES gets its own log line.
		// Captures the actual 5-second window of an allocation event even
		// when the regular heartbeat is one of many in a row.
		if (typeof heap.used === "number") {
			if (
				lastHeapUsedBytes !== null &&
				heap.used - lastHeapUsedBytes >= HEAP_SPIKE_THRESHOLD_BYTES
			) {
				diagLog(
					"JS",
					`heap_spike hb#${heartbeatCounter} prev=${heapMb(lastHeapUsedBytes)} now=${heapMb(heap.used)} delta=${heapMb(heap.used - lastHeapUsedBytes)} rows=${rows} scanlog=${scanLog} pending=${counters.pendingOcrEvents}`,
				);
			}
			lastHeapUsedBytes = heap.used;
		}
	}, 5_000);
}

export function stopDiagnosticHeartbeat(): void {
	if (heartbeatId !== null) {
		clearInterval(heartbeatId);
		heartbeatId = null;
		diagLog("JS", "heartbeat_stop");
	}
}

// ============== Visibility & focus instrumentation ==============
//
// WebView2 (Chromium) throttles render and timer fires when the document is
// hidden. Long background sessions accumulate deferred work; on visibility
// return, the renderer can wedge if the catch-up is large enough. Knowing
// exactly when visibility / focus flipped is essential to diagnosing those
// freezes — the 5s heartbeat is too coarse to catch the trigger window.

/**
 * `true` when the WebView is throttling our renderer (window minimized, tab
 * hidden, or another window covering us in some compositors). Cheap to check
 * — backed by `document.visibilityState`. Note: in our setup, BDO covering
 * the window does NOT flip this to hidden (Chromium treats covered windows
 * as visible). Use `isWindowBlurred()` for "user is in another app" gating.
 */
export function isDocumentHidden(): boolean {
	return typeof document !== "undefined" && document.visibilityState === "hidden";
}

// Tracks the actual focus state — flipped by the window focus/blur listeners
// installed by `installVisibilityLogging`. This is the right signal for "is
// the user looking at our window right now?" (vs. visibility, which is too
// permissive — see the 2026-05-16 finding where BDO covering our window
// kept `document.visibilityState === 'visible'` and the visibility gates
// never activated).
let windowBlurred = false;

/**
 * `true` when the user is NOT focused on our window — they've alt-tabbed to
 * BDO or some other app. Set by the focus/blur listeners. Initial value is
 * `false` (assume focused on init); the first blur event corrects this.
 */
export function isWindowBlurred(): boolean {
	return windowBlurred;
}

let visibilityListenersInstalled = false;

/**
 * Wire `visibilitychange` + `window.focus/blur` to the diagnostic log.
 * Idempotent. Safe to call from `initLoot`.
 */
export function installVisibilityLogging(): void {
	if (visibilityListenersInstalled) return;
	if (typeof document === "undefined") return;
	visibilityListenersInstalled = true;

	document.addEventListener("visibilitychange", () => {
		diagLog("JS", `visibility=${document.visibilityState}`);
	});

	if (typeof window !== "undefined") {
		window.addEventListener("focus", () => {
			windowBlurred = false;
			diagLog("JS", "window_focus");
		});
		window.addEventListener("blur", () => {
			windowBlurred = true;
			diagLog("JS", "window_blur");
		});
		// Initial state — `document.hasFocus()` returns whether our window
		// currently owns focus. Without this, the first 5+ seconds before the
		// first focus/blur event would have `windowBlurred = false` even when
		// the user launched the app and immediately alt-tabbed to BDO.
		windowBlurred = !document.hasFocus();
	}

	// Emit one line on install so the log records the initial state, not just
	// the first transition.
	diagLog("JS", `visibility_init=${document.visibilityState}`);
}

// ============== Long-task observer ==============
//
// Catches CPU-bound main-thread blocks that the 5-second heartbeat misses.
// `PerformanceObserver` for `longtask` entries fires whenever a single
// task on the main thread takes ≥ 50 ms (browser-defined). We log entries
// above our own threshold (80 ms) so the steady-state OCR work doesn't
// flood the log. If a freeze is CPU-bound (no heap spike, no big save),
// the last longtask logged before the heartbeat stops is the smoking gun.

let longTaskObserver: PerformanceObserver | null = null;
const LONG_TASK_LOG_THRESHOLD_MS = 80;

export function installLongTaskObserver(): void {
	if (longTaskObserver !== null) return;
	if (typeof PerformanceObserver === "undefined") return;
	// `longtask` requires the user-agent to support the API. Chromium does,
	// but the constructor will throw if the entry type is unknown — guard.
	try {
		const obs = new PerformanceObserver((list) => {
			for (const entry of list.getEntries()) {
				if (entry.duration < LONG_TASK_LOG_THRESHOLD_MS) continue;
				diagLog(
					"JS",
					`long_task duration=${entry.duration.toFixed(1)}ms start=${entry.startTime.toFixed(1)}ms name=${entry.name}`,
				);
			}
		});
		obs.observe({ entryTypes: ["longtask"] });
		longTaskObserver = obs;
		diagLog(
			"JS",
			`long_task_observer_installed threshold=${LONG_TASK_LOG_THRESHOLD_MS}ms`,
		);
	} catch (e) {
		diagLog("JS", `long_task_observer_unavailable: ${String(e)}`);
	}
}

export function uninstallLongTaskObserver(): void {
	if (longTaskObserver !== null) {
		longTaskObserver.disconnect();
		longTaskObserver = null;
	}
}
