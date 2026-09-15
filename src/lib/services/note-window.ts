/**
 * Note editor window lifecycle.
 *
 * Opens the `/note` route as a small always-on-top Tauri window holding ONE
 * note at a time — which note lives in `note_editing_id` (settings). The list
 * window writes that id; the editor watches it and swaps its contents in place,
 * so opening a second note is not a window reload.
 *
 * Copied from `scratchpad-window.ts` and deliberately NOT merged with it. The
 * two differ in the one place that matters: the scratchpad's destroy handler
 * re-attaches the pad into the main window, and this one must not re-attach
 * anything. A shared factory would hide exactly that difference.
 */

import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { currentMonitor } from "@tauri-apps/api/window";
import { PhysicalPosition, PhysicalSize } from "@tauri-apps/api/dpi";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { get } from "svelte/store";

import { settingsStore, setNoteWin, setNoteEditingId } from "$lib/stores/settings";
import { positionIsOnScreen } from "./window-bounds";

const LABEL = "note-editor";
const DEFAULT_W = 380;
const DEFAULT_H = 540;

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
		// as the saved position and the editor opens off-screen next time.
		if (await win.isMinimized()) return;
		const pos = await win.outerPosition();
		const size = await win.innerSize();
		setNoteWin({ x: pos.x, y: pos.y, w: size.width, h: size.height });
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
 * Open the editor on `noteId`, or swap an already-open editor onto it.
 *
 * `focus: true` unconditionally — unlike the scratchpad's boot respawn, the
 * editor is only ever opened by a deliberate click.
 */
export async function openNoteEditor(noteId: string): Promise<void> {
	// The id goes first either way: the editor watches it, so an existing
	// window swaps contents the moment settings change, and a cold window
	// finds the right note as soon as it reads settings.
	setNoteEditingId(noteId);

	const existing = await WebviewWindow.getByLabel(LABEL).catch(() => null);
	if (existing) {
		await existing.setFocus().catch(() => undefined);
		return;
	}

	// Prod (adapter-static) serves the prerendered note.html; dev serves the
	// plain route — same split as the scratchpad and the loot picker. The
	// query param is a cold-start fallback only, for a window that boots
	// before settings are read.
	const base = import.meta.env.DEV ? "/note" : "/note.html";
	const win = new WebviewWindow(LABEL, {
		url: `${base}?id=${encodeURIComponent(noteId)}`,
		title: "BDO Life Companion — Note",
		width: DEFAULT_W,
		height: DEFAULT_H,
		minWidth: 320,
		minHeight: 380,
		decorations: false,
		transparent: true,
		alwaysOnTop: true,
		resizable: true,
		skipTaskbar: false,
		focus: true,
		visible: true,
	});

	win.once("tauri://created", async () => {
		// Restore saved bounds in PHYSICAL px (outerPosition/innerSize are
		// physical; feeding them back as logical shrinks/moves on scaled DPIs).
		const saved = get(settingsStore).note_win;
		// A saved position is only usable if a monitor still covers it. Bounds
		// left on a since-unplugged display — or a stale minimize sentinel from
		// before that guard existed — would otherwise open the editor where the
		// user cannot see it, and setPosition reports no error for it.
		const savedUsable = saved
			? await positionIsOnScreen(saved.x, saved.y, saved.w, saved.h)
			: false;
		if (saved && savedUsable) {
			await win.setPosition(new PhysicalPosition(Math.round(saved.x), Math.round(saved.y))).catch(() => undefined);
			await win.setSize(new PhysicalSize(Math.round(saved.w), Math.round(saved.h))).catch(() => undefined);
		} else {
			if (saved) {
				console.warn("Saved note editor position is off-screen; using the default:", saved.x, saved.y);
				// Keep the saved SIZE — only the position was unusable.
				await win.setSize(new PhysicalSize(Math.round(saved.w), Math.round(saved.h))).catch(() => undefined);
			}
			// Offset left of where the pad parks so the two windows don't land
			// on top of each other. Physical px, as above.
			const mon = await currentMonitor().catch(() => null);
			if (mon) {
				const scale = mon.scaleFactor || 1;
				const x = mon.position.x + mon.size.width - Math.round((DEFAULT_W + 340) * scale) - 24;
				const y = mon.position.y + mon.size.height - Math.round(DEFAULT_H * scale) - 24;
				await win.setPosition(new PhysicalPosition(x, y)).catch(() => undefined);
			}
		}
		unlisteners.push(await win.onMoved(() => schedulePersistBounds(win)));
		unlisteners.push(await win.onResized(() => schedulePersistBounds(win)));
	});

	win.once("tauri://error", (e) => {
		console.error("Note editor window failed to create:", e);
		cleanupListeners();
		setNoteEditingId(null);
	});

	// Closing the editor closes the editor. Unlike the scratchpad's handler
	// this re-attaches NOTHING — it just drops the held note so the list
	// clears its EDITING marker and releases the frozen sort.
	unlisteners.push(
		await win.once("tauri://destroyed", () => {
			cleanupListeners();
			setNoteEditingId(null);
		}),
	);
}

/** Close the editor window (the destroyed listener clears the held note). */
export async function closeNoteEditor(): Promise<void> {
	const win = await WebviewWindow.getByLabel(LABEL).catch(() => null);
	if (win) await win.close().catch(() => undefined);
}

/**
 * App-exit teardown: destroy the window WITHOUT the destroy-handler side
 * effects, so `note_editing_id` survives and the editor reopens on the same
 * note next launch.
 */
export async function teardownNoteEditorForExit(): Promise<void> {
	cleanupListeners();
	const win = await WebviewWindow.getByLabel(LABEL).catch(() => null);
	if (win) await win.destroy().catch(() => undefined);
}

/** Is the editor window currently up? */
export async function noteEditorIsOpen(): Promise<boolean> {
	const win = await WebviewWindow.getByLabel(LABEL).catch(() => null);
	return win != null;
}
