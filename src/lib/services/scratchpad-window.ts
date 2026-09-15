/**
 * Detached Scratchpad window lifecycle.
 *
 * Opens the `/scratchpad` route as a small always-on-top Tauri window so the
 * pad can be dragged anywhere on the screen (outside the main window). The
 * MAIN window owns this module: it creates/closes the window, persists its
 * bounds (physical px — see the window-mode DPI lesson), and clears the
 * detached flag when the window is destroyed. Notes stay in sync through the
 * `notes-changed` event (see stores/notes.ts).
 */

import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { currentMonitor } from "@tauri-apps/api/window";
import { PhysicalPosition, PhysicalSize } from "@tauri-apps/api/dpi";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { get } from "svelte/store";

import { settingsStore, setScratchpadDetached, setScratchpadOpen, setScratchpadWin } from "$lib/stores/settings";
import { positionIsOnScreen } from "./window-bounds";

const LABEL = "scratchpad";
const DEFAULT_W = 320;
const DEFAULT_H = 480;

let unlisteners: UnlistenFn[] = [];
let boundsTimeout: ReturnType<typeof setTimeout> | null = null;

function cleanupListeners(): void {
	for (const u of unlisteners) u();
	unlisteners = [];
	if (boundsTimeout) {
		clearTimeout(boundsTimeout);
		boundsTimeout = null;
	}
}

async function persistBounds(win: WebviewWindow): Promise<void> {
	try {
		// A minimized window reports the Windows iconic sentinel (-32000,-32000)
		// and minimizing fires onMoved, so without this the debounce writes that
		// as the saved position and the pad opens off-screen next time.
		if (await win.isMinimized()) return;
		const pos = await win.outerPosition();
		const size = await win.innerSize();
		setScratchpadWin({ x: pos.x, y: pos.y, w: size.width, h: size.height });
	} catch {
		// Window may already be gone — nothing to persist.
	}
}

function schedulePersistBounds(win: WebviewWindow): void {
	if (boundsTimeout) clearTimeout(boundsTimeout);
	boundsTimeout = setTimeout(() => {
		boundsTimeout = null;
		void persistBounds(win);
	}, 400);
}

/**
 * Open (or focus) the detached scratchpad window.
 *
 * `focus` defaults to true (right for the ⧉ click); the boot respawn passes
 * false — a window stealing focus during startup is how the first thing the
 * user types gets lost.
 */
export async function openScratchpadWindow(opts?: { focus?: boolean }): Promise<void> {
	const takeFocus = opts?.focus ?? true;
	const existing = await WebviewWindow.getByLabel(LABEL).catch(() => null);
	if (existing) {
		if (takeFocus) await existing.setFocus().catch(() => undefined);
		return;
	}

	// Prod (adapter-static) serves the prerendered scratchpad.html; dev serves
	// the plain route — same split as the loot picker.
	const url = import.meta.env.DEV ? "/scratchpad" : "/scratchpad.html";
	const win = new WebviewWindow(LABEL, {
		url,
		title: "BDO Life Companion — Scratchpad",
		width: DEFAULT_W,
		height: DEFAULT_H,
		minWidth: 280,
		minHeight: 240,
		decorations: false,
		transparent: true,
		alwaysOnTop: true,
		resizable: true,
		skipTaskbar: false,
		focus: takeFocus,
		visible: true,
	});

	win.once("tauri://created", async () => {
		// Restore saved bounds in PHYSICAL px (outerPosition/innerSize are
		// physical; feeding them back as logical shrinks/moves on scaled DPIs).
		const saved = get(settingsStore).scratchpad_win;
		// A saved position is only usable if a monitor still covers it. Bounds
		// left on a since-unplugged display — or a stale minimize sentinel from
		// before that guard existed — would otherwise open the pad where the
		// user cannot see it, and setPosition reports no error for it.
		const savedUsable = saved
			? await positionIsOnScreen(saved.x, saved.y, saved.w, saved.h)
			: false;
		if (saved && savedUsable) {
			await win.setPosition(new PhysicalPosition(Math.round(saved.x), Math.round(saved.y))).catch(() => undefined);
			await win.setSize(new PhysicalSize(Math.round(saved.w), Math.round(saved.h))).catch(() => undefined);
		} else {
			if (saved) {
				console.warn("Saved scratchpad position is off-screen; using the default:", saved.x, saved.y);
				// Keep the saved SIZE — only the position was unusable.
				await win.setSize(new PhysicalSize(Math.round(saved.w), Math.round(saved.h))).catch(() => undefined);
			}
			// Bottom-right of the current monitor, inset 24px, in PHYSICAL px
			// exactly like the restore path above (the window's logical 320×480
			// scales with the monitor's DPI).
			const mon = await currentMonitor().catch(() => null);
			if (mon) {
				const scale = mon.scaleFactor || 1;
				const x = mon.position.x + mon.size.width - Math.round(DEFAULT_W * scale) - 24;
				const y = mon.position.y + mon.size.height - Math.round(DEFAULT_H * scale) - 24;
				await win.setPosition(new PhysicalPosition(x, y)).catch(() => undefined);
			}
		}
		unlisteners.push(await win.onMoved(() => schedulePersistBounds(win)));
		unlisteners.push(await win.onResized(() => schedulePersistBounds(win)));
	});

	win.once("tauri://error", (e) => {
		console.error("Scratchpad window failed to create:", e);
		cleanupListeners();
		setScratchpadDetached(false);
	});

	// OS close (✕ inside the pad, Alt+F4, …) re-attaches: the panel comes back
	// in the main window so the notes are never unreachable.
	unlisteners.push(
		await win.once("tauri://destroyed", () => {
			cleanupListeners();
			setScratchpadDetached(false);
			setScratchpadOpen(true);
		}),
	);

	setScratchpadDetached(true);
}

/** Close the detached window (re-attach handled by the destroyed listener). */
export async function closeScratchpadWindow(): Promise<void> {
	const win = await WebviewWindow.getByLabel(LABEL).catch(() => null);
	if (win) await win.close().catch(() => undefined);
}

/**
 * App-exit teardown: close the detached window WITHOUT the re-attach side
 * effects (the destroyed listener would clear scratchpad_detached, which must
 * survive so the pad respawns detached on the next launch).
 */
export async function teardownScratchpadWindowForExit(): Promise<void> {
	cleanupListeners();
	const win = await WebviewWindow.getByLabel(LABEL).catch(() => null);
	if (win) await win.destroy().catch(() => undefined);
}

/** Focus the detached window if it exists. */
export async function focusScratchpadWindow(): Promise<void> {
	const win = await WebviewWindow.getByLabel(LABEL).catch(() => null);
	if (win) {
		await win.setFocus().catch(() => undefined);
	} else {
		// Flag says detached but the window is gone (crash?) — recover.
		setScratchpadDetached(false);
		setScratchpadOpen(true);
	}
}
