/**
 * Loot OCR — startup orchestration.
 *
 * `initLoot()` is called once from `+page.svelte` onMount. It loads all four
 * disk-backed pieces in parallel, validates them onto the typed stores, wires
 * debounced auto-save subscriptions, and registers the `loot-ocr` event
 * listener that feeds the session store from the Rust scanner.
 *
 * Returns a cleanup closure that unlistens + flushes pending saves — call from
 * onDestroy (and from any close-window handler that needs to await persistence).
 */

import { get } from "svelte/store";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import {
	DEFAULT_LOOT_SETTINGS,
	normalizeForMatch,
	type CaptureLog,
	type CaptureSession,
	type CapturedRow,
	type LootSettings,
	type OcrEvent,
	type Region,
} from "$lib/models/loot";
import { lootSettingsStore } from "$lib/stores/loot-settings";
import {
	captureSessionStore,
	applyOcrEvent,
	pauseCaptureSession,
} from "$lib/stores/loot-session";
import { lootLogsStore, lootLogsLoadingStore } from "$lib/stores/loot-logs";
import { loadLootCatalog } from "$lib/stores/loot-catalog";
import { lootFocusInGameStore } from "$lib/stores/ui-state";
import { showToast } from "$lib/stores/toast";
import { m } from "$lib/paraglide/messages";
import {
	loadLootSettingsFromDisk,
	saveLootSettingsToDisk,
	loadLootCurrentFromDisk,
	saveLootCurrentToDisk,
	loadLootLogsFromDisk,
	saveLootLogsToDisk,
} from "$lib/services/loot-persistence";
import {
	diagLog,
	reportDrain,
	reportPendingOcrEvents,
	startDiagnosticHeartbeat,
	stopDiagnosticHeartbeat,
	installVisibilityLogging,
	installLongTaskObserver,
	uninstallLongTaskObserver,
	isWindowBlurred,
} from "$lib/services/loot-diagnostic";

// ============== Validators ==============
// The Rust side passes JSON through opaquely (`serde_json::Value`), so the
// frontend is responsible for coercing back into typed shapes. Anything missing
// or malformed falls back to a safe default — never throw, the app must boot.

function isObj(v: unknown): v is Record<string, unknown> {
	return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parseRegion(v: unknown): Region | null {
	if (!isObj(v)) return null;
	const x = typeof v.x === "number" ? v.x : null;
	const y = typeof v.y === "number" ? v.y : null;
	const w = typeof v.w === "number" ? v.w : null;
	const h = typeof v.h === "number" ? v.h : null;
	const monitorId = typeof v.monitorId === "string" ? v.monitorId : "";
	if (x === null || y === null || w === null || h === null) return null;
	return { x, y, w, h, monitorId };
}

function parseLootSettings(v: unknown): LootSettings {
	if (!isObj(v)) return { ...DEFAULT_LOOT_SETTINGS };
	const freqHz =
		typeof v.freqHz === "number" ? v.freqHz : DEFAULT_LOOT_SETTINGS.freqHz;
	const minConfidence =
		typeof v.minConfidence === "number"
			? v.minConfidence
			: DEFAULT_LOOT_SETTINGS.minConfidence;
	const region = parseRegion(v.region);
	const savedRegions = Array.isArray(v.savedRegions)
		? v.savedRegions.flatMap((entry: unknown) => {
				if (!isObj(entry)) return [];
				const name = typeof entry.name === "string" ? entry.name : "";
				const reg = parseRegion(entry.region);
				return name && reg ? [{ name, region: reg }] : [];
			})
		: [];
	const disclaimerAcknowledged = v.disclaimerAcknowledged === true;
	// Default ON when the field is missing from older settings files — the
	// strict-mode change ships with strict-on as the new safe default.
	const strictMode = v.strictMode === undefined ? true : v.strictMode === true;

	// Pre-accuracy-pass settings files don't have `temporalFrames`. We treat
	// the absence of that field as the marker for "old settings", and reset
	// `colorMask` + `upscaleFactor` to the new (bench-validated) defaults at
	// the same time. Without this, users with `colorMask: true` from the v0
	// release keep getting near-zero OCR yield because the mask erodes the
	// glyphs — see `docs/LOOT_OCR_ACCURACY.md`.
	const isPreAccuracyPass = v.temporalFrames === undefined;

	const colorMask = isPreAccuracyPass
		? DEFAULT_LOOT_SETTINGS.colorMask
		: v.colorMask === true;
	const upscaleFactorRaw = isPreAccuracyPass
		? DEFAULT_LOOT_SETTINGS.upscaleFactor
		: typeof v.upscaleFactor === "number"
			? v.upscaleFactor
			: DEFAULT_LOOT_SETTINGS.upscaleFactor;
	const upscaleFactor = Math.max(1, Math.min(6, upscaleFactorRaw));
	const temporalFramesRaw = isPreAccuracyPass
		? DEFAULT_LOOT_SETTINGS.temporalFrames
		: typeof v.temporalFrames === "number"
			? v.temporalFrames
			: DEFAULT_LOOT_SETTINGS.temporalFrames;
	const temporalFrames = Math.max(1, Math.min(12, Math.round(temporalFramesRaw)));
	// Default ON when missing — addresses the user's "inventory only updates
	// on save" rule. Pre-Pass-6 files don't have this field; we want it to
	// default on so users get the new behavior immediately.
	const inventoryMergeOnSave =
		v.inventoryMergeOnSave === undefined ? true : v.inventoryMergeOnSave === true;
	return {
		freqHz,
		minConfidence,
		region,
		savedRegions,
		disclaimerAcknowledged,
		strictMode,
		colorMask,
		upscaleFactor,
		temporalFrames,
		inventoryMergeOnSave,
	};
}

function parseRow(v: unknown): CapturedRow | null {
	if (!isObj(v)) return null;
	const key = typeof v.key === "string" ? v.key : null;
	const rawName = typeof v.rawName === "string" ? v.rawName : null;
	const displayName = typeof v.displayName === "string" ? v.displayName : rawName;
	const count = typeof v.count === "number" ? v.count : null;
	const firstSeenAt = typeof v.firstSeenAt === "number" ? v.firstSeenAt : null;
	const lastSeenAt = typeof v.lastSeenAt === "number" ? v.lastSeenAt : firstSeenAt;
	if (!key || !rawName || !displayName || count === null || firstSeenAt === null || lastSeenAt === null) {
		return null;
	}
	const row: CapturedRow = {
		key,
		rawName,
		// Compute the normalize cache at load time if missing. Persisted rows
		// from before the cache existed are silently upgraded; new saves carry
		// the field forward.
		normalizedRawName:
			typeof v.normalizedRawName === "string"
				? v.normalizedRawName
				: normalizeForMatch(rawName),
		displayName,
		count,
		firstSeenAt,
		lastSeenAt,
	};
	if (typeof v.matchedItemId === "string") row.matchedItemId = v.matchedItemId;
	if (
		v.matchedSource === "grinding" ||
		v.matchedSource === "recipe" ||
		v.matchedSource === "gathering" ||
		v.matchedSource === "hunting" ||
		v.matchedSource === "barter" ||
		v.matchedSource === "treasure"
	) {
		row.matchedSource = v.matchedSource;
	}
	if (v.edited === true) row.edited = true;
	return row;
}

function parseScanLogEntry(v: unknown): import("$lib/models/loot").ScanLogEntry | null {
	if (!isObj(v)) return null;
	const ts = typeof v.ts === "number" ? v.ts : null;
	const rawName = typeof v.rawName === "string" ? v.rawName : null;
	const qty = typeof v.qty === "number" ? v.qty : null;
	if (ts === null || rawName === null || qty === null) return null;
	const entry: import("$lib/models/loot").ScanLogEntry = { ts, rawName, qty };
	if (typeof v.matchedItemId === "string") entry.matchedItemId = v.matchedItemId;
	if (
		v.matchedSource === "grinding" ||
		v.matchedSource === "recipe" ||
		v.matchedSource === "gathering" ||
		v.matchedSource === "hunting" ||
		v.matchedSource === "barter" ||
		v.matchedSource === "treasure"
	) {
		entry.matchedSource = v.matchedSource;
	}
	if (typeof v.matchedDisplayName === "string") entry.matchedDisplayName = v.matchedDisplayName;
	if (typeof v.countInPass === "number" && v.countInPass > 1) {
		entry.countInPass = Math.floor(v.countInPass);
	}
	return entry;
}

function parseCaptureSession(v: unknown): CaptureSession | null {
	if (v === null || v === undefined) return null;
	if (!isObj(v)) return null;
	const id = typeof v.id === "string" ? v.id : null;
	const startedAt = typeof v.startedAt === "number" ? v.startedAt : null;
	if (!id || startedAt === null) return null;

	// Restore as paused — the Rust scanner is dead between launches, the user
	// must click RESUME to bring it back. This avoids the surprise of the app
	// resuming a hours-old session on its own.
	const session: CaptureSession = {
		id,
		startedAt,
		running: false,
		elapsedSeconds: typeof v.elapsedSeconds === "number" ? v.elapsedSeconds : 0,
		region: parseRegion(v.region),
		rows: Array.isArray(v.rows)
			? v.rows.flatMap((r: unknown) => {
					const parsed = parseRow(r);
					return parsed ? [parsed] : [];
				})
			: [],
		scanLog: Array.isArray(v.scanLog)
			? v.scanLog.flatMap((e: unknown) => {
					const parsed = parseScanLogEntry(e);
					return parsed ? [parsed] : [];
				})
			: [],
	};
	if (typeof v.endedAt === "number") session.endedAt = v.endedAt;
	if (typeof v.label === "string") session.label = v.label;
	return session;
}

function parseLogs(v: unknown): CaptureLog[] {
	if (!Array.isArray(v)) return [];
	return v.flatMap((entry: unknown) => {
		if (!isObj(entry)) return [];
		const id = typeof entry.id === "string" ? entry.id : null;
		const label = typeof entry.label === "string" ? entry.label : null;
		const startedAt = typeof entry.startedAt === "number" ? entry.startedAt : null;
		const endedAt = typeof entry.endedAt === "number" ? entry.endedAt : null;
		if (!id || !label || startedAt === null || endedAt === null) return [];
		const rows = Array.isArray(entry.rows)
			? entry.rows.flatMap((r: unknown) => {
					const parsed = parseRow(r);
					return parsed ? [parsed] : [];
				})
			: [];
		const mergedAt = typeof entry.mergedAt === "number" ? entry.mergedAt : null;
		return [{ id, label, startedAt, endedAt, rows, mergedAt }];
	});
}

// ============== Debounce ==============

const SAVE_DEBOUNCE_MS = 500;

function createDebounced(label: string, fn: () => Promise<void>): {
	schedule: () => void;
	flush: () => Promise<void>;
} {
	let timeout: ReturnType<typeof setTimeout> | null = null;
	let pending = false;
	const schedule = () => {
		pending = true;
		if (timeout) clearTimeout(timeout);
		timeout = setTimeout(() => {
			timeout = null;
			pending = false;
			fn().catch((e) => console.error(`Failed to save ${label}:`, e));
		}, SAVE_DEBOUNCE_MS);
	};
	const flush = async () => {
		if (timeout) {
			clearTimeout(timeout);
			timeout = null;
		}
		if (!pending) return;
		pending = false;
		try {
			await fn();
		} catch (e) {
			console.error(`Failed to flush ${label}:`, e);
		}
	};
	return { schedule, flush };
}

// ============== Public init ==============

export interface LootInitHandle {
	/** Unsubscribe Tauri listener and flush any pending saves. */
	cleanup: () => Promise<void>;
	/** Force-flush all pending debounced saves (e.g. before app close). */
	flush: () => Promise<void>;
}

/**
 * One-shot loot bootstrap. Safe to call from onMount alongside the other loaders.
 */
export async function initLoot(): Promise<LootInitHandle> {
	// 1) Load everything in parallel. Each loader catches its own errors so a
	//    bad file doesn't strand the app.
	lootLogsLoadingStore.set(true);
	const [, settingsRaw, currentRaw, logsRaw] = await Promise.all([
		loadLootCatalog(),
		loadLootSettingsFromDisk().catch((e) => {
			console.error("Failed to load loot settings:", e);
			return null;
		}),
		loadLootCurrentFromDisk().catch((e) => {
			console.error("Failed to load loot current session:", e);
			return null;
		}),
		loadLootLogsFromDisk().catch((e) => {
			console.error("Failed to load loot logs:", e);
			return null;
		}),
	]);

	lootSettingsStore.set(parseLootSettings(settingsRaw));
	captureSessionStore.set(parseCaptureSession(currentRaw));
	lootLogsStore.set(parseLogs(logsRaw));
	lootLogsLoadingStore.set(false);

	// 2) Wire debounced auto-save subscriptions. The `firstFire` skip is because
	//    Svelte's `subscribe` invokes the callback synchronously on subscribe;
	//    saving the just-loaded state to disk would be a wasted round-trip.
	const settingsSaver = createDebounced("loot settings", async () =>
		saveLootSettingsToDisk(get(lootSettingsStore)),
	);
	// scanLog is intentionally dropped from the persisted payload — it's
	// UI/debug data, can be MB-large after long sessions, and re-rendering
	// historical OCR events on app restart isn't useful. Stripping it keeps
	// the save fast even when the in-memory log is full.
	const sessionSaver = createDebounced("loot current session", async () => {
		const s = get(captureSessionStore);
		const persistable = s ? { ...s, scanLog: [] as typeof s.scanLog } : null;
		// Diagnostic probe: if the serialized session is unexpectedly large,
		// log it so we can correlate with heap spikes. Threshold (200 KB) is
		// well above a healthy session (a few KB) but below the megabyte
		// scale where this becomes a real perf issue. Cheap: we measure the
		// JSON we'd send anyway. Note that Tauri's invoke also serializes
		// internally; this probe doesn't add a second IPC payload.
		if (persistable) {
			try {
				const json = JSON.stringify(persistable);
				if (json.length > 200_000) {
					diagLog(
						"JS",
						`session_save_large bytes=${json.length} rows=${s?.rows.length ?? 0} scanlog=${s?.scanLog.length ?? 0}`,
					);
				}
			} catch {
				// JSON.stringify can throw on circular refs — that itself would
				// be a smoking gun for a Svelte 5 proxy cycle, so log it.
				diagLog("JS", "session_save_serialize_failed");
			}
		}
		await saveLootCurrentToDisk(persistable);
	});
	const logsSaver = createDebounced("loot log", async () =>
		saveLootLogsToDisk(get(lootLogsStore)),
	);

	let firstSettings = true;
	const unsubSettings = lootSettingsStore.subscribe(() => {
		if (firstSettings) {
			firstSettings = false;
			return;
		}
		settingsSaver.schedule();
	});

	// Identity-equal guard: writable.update fires subscribers even when the
	// reducer returns the same `s` ref. Without this guard, any
	// `update(s => s)` pattern (e.g. the elapsed-ticker's paused-branch early
	// return) would reschedule a full disk write every fire.
	let firstSession = true;
	let lastSessionRef: unknown = null;
	const unsubSession = captureSessionStore.subscribe((s) => {
		if (firstSession) {
			firstSession = false;
			lastSessionRef = s;
			return;
		}
		if (s === lastSessionRef) return;
		lastSessionRef = s;
		sessionSaver.schedule();
	});

	let firstLogs = true;
	const unsubLogs = lootLogsStore.subscribe(() => {
		if (firstLogs) {
			firstLogs = false;
			return;
		}
		logsSaver.schedule();
	});

	// 3) Register the OCR event listener — Rust scanner emits one of these per
	//    parsed loot line. The session store handles dedup + matching.
	//
	// Events are batched and drained at most every 250 ms (≤ 4 Hz) instead of
	// processed eagerly. Each applyOcrEvent triggers 2 captureSessionStore
	// updates, each fans subscribers + re-runs $derived in mounted components.
	// In high-activity scenes the Rust scanner emits well above 4 Hz, which
	// turned into a reactive cascade that starved WebView2's main thread and
	// stopped *every* setInterval in the app (including the boss timer).
	// Batching keeps the worst-case render budget steady. applyOcrEvent's own
	// dedup logic handles batched events correctly — it was already designed
	// to be call-rate-agnostic.
	const OCR_DRAIN_INTERVAL_MS = 250;
	// Coalesce drains aggressively while the user is in another window
	// (alt-tabbed to BDO). The 2026-05-16 freeze tail showed Rust still
	// emitting normally while JS heartbeats stopped right after a
	// window_focus flip; this cuts the queued reactive-update mass that
	// the renderer has to catch up on when focus returns. Document
	// visibility is the wrong signal here — BDO covering our window
	// keeps visibilityState === "visible".
	const OCR_DRAIN_INTERVAL_BLURRED_MS = 1_000;
	let pendingOcrEvents: OcrEvent[] = [];
	let ocrDrainTimer: ReturnType<typeof setTimeout> | null = null;

	function drainOcrEvents() {
		ocrDrainTimer = null;
		if (pendingOcrEvents.length === 0) return;
		const batch = pendingOcrEvents;
		pendingOcrEvents = [];
		const t0 =
			typeof performance !== "undefined" ? performance.now() : Date.now();
		for (const ev of batch) {
			applyOcrEvent(ev);
		}
		const t1 =
			typeof performance !== "undefined" ? performance.now() : Date.now();
		reportDrain(batch.length);
		reportPendingOcrEvents(pendingOcrEvents.length);
		// Only log drains that are big or slow so the file doesn't fill up. The
		// heartbeat captures the steady-state totals.
		if (batch.length >= 20 || t1 - t0 >= 80) {
			diagLog(
				"OCR",
				`drain batch=${batch.length} took=${(t1 - t0).toFixed(1)}ms`,
			);
		}
	}

	const unlistenOcr: UnlistenFn = await listen<OcrEvent>("loot-ocr", (event) => {
		pendingOcrEvents.push(event.payload);
		reportPendingOcrEvents(pendingOcrEvents.length);
		if (ocrDrainTimer === null) {
			const interval = isWindowBlurred()
				? OCR_DRAIN_INTERVAL_BLURRED_MS
				: OCR_DRAIN_INTERVAL_MS;
			ocrDrainTimer = setTimeout(drainOcrEvents, interval);
		}
	});

	// 4) Focus-state events from the Rust scanner. `true` means the foreground
	//    window is BDO or our app; `false` means the user has Alt-Tabbed to
	//    something else and the scanner is sitting idle to stay polite to the
	//    game's anti-cheat (read-only foreground check, no process enum).
	const unlistenFocus: UnlistenFn = await listen<boolean>(
		"loot-focus-state",
		(event) => {
			lootFocusInGameStore.set(event.payload === true);
		},
	);

	// 5) Panic-stop hotkey (Ctrl+Shift+End). Rust has already stopped the
	//    scanner by the time this fires; here we just pause the UI session
	//    and surface a toast confirming the kill.
	const unlistenPanic: UnlistenFn = await listen("loot-panic-stop", () => {
		pauseCaptureSession();
		showToast(m.loot_toast_panic_stop(), "info", 4000);
	});

	const flush = async () => {
		await Promise.all([
			settingsSaver.flush(),
			sessionSaver.flush(),
			logsSaver.flush(),
		]);
	};

	// Start the heartbeat so the log file has steady-state pulses even when
	// scanning is idle. If the heartbeat suddenly stops mid-stream, that's
	// the freeze moment.
	startDiagnosticHeartbeat();
	// Wire window visibility/focus into the diag log. Catches the trigger
	// window for visibility-return wedges — the per-line state stays in the
	// log even after a Task-Manager kill since we flush every write.
	installVisibilityLogging();
	// Long-task observer logs any main-thread block >= 80 ms. The last
	// `long_task` line before a heartbeat gap is the smoking gun for
	// CPU-bound freezes (no heap spike, no big save).
	installLongTaskObserver();
	diagLog("INIT", `loot init complete; current=${get(captureSessionStore) ? "restored" : "none"}`);

	const cleanup = async () => {
		try {
			unlistenOcr();
			unlistenFocus();
			unlistenPanic();
		} catch (e) {
			console.warn("Failed to unlisten loot events:", e);
		}
		if (ocrDrainTimer !== null) {
			clearTimeout(ocrDrainTimer);
			ocrDrainTimer = null;
		}
		pendingOcrEvents = [];
		stopDiagnosticHeartbeat();
		uninstallLongTaskObserver();
		unsubSettings();
		unsubSession();
		unsubLogs();
		await flush();
	};

	return { cleanup, flush };
}
