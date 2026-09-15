/**
 * Loot OCR — region picker spawner.
 *
 * Opens the `/loot-picker` route as a separate fullscreen transparent Tauri
 * window and returns a Promise that resolves to the user's selected `Region`
 * (or `null` if cancelled). The picker route handles its own capture; this
 * file only owns the window lifecycle and event glue.
 */

import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import type { Region } from "$lib/models/loot";

const PICKER_LABEL = "loot-picker";
/// Time the main window stays minimized before the picker route fires its
/// screen capture. Must be long enough for Windows' minimize animation +
/// compositor flush so the captured frame doesn't still contain our chrome.
/// 600 ms is conservative; 400 ms also worked in testing but flickered.
const MAIN_WINDOW_HIDE_GRACE_MS = 600;

let inflight: Promise<Region | null> | null = null;

/**
 * Open the region picker. Re-entrant-safe: if a picker is already open, the
 * second call returns the same in-flight promise instead of stacking windows.
 */
export function openRegionPicker(): Promise<Region | null> {
	if (inflight) return inflight;
	inflight = runPicker().finally(() => {
		inflight = null;
	});
	return inflight;
}

async function runPicker(): Promise<Region | null> {
	// If a previous picker window is still around (e.g. orphaned from a crash),
	// close it before we try to create a new one with the same label.
	try {
		const existing = await WebviewWindow.getByLabel(PICKER_LABEL);
		if (existing) {
			await existing.close();
		}
	} catch {
		// No-op; getByLabel rejecting just means it isn't there.
	}

	// Minimize the main window so its chrome doesn't end up baked into the
	// picker's frozen frame. When BDO is fullscreen-windowed underneath, our
	// app's window otherwise covers part of BDO (including possibly the loot
	// log itself) → the captured frame would be unusable. We restore on
	// commit/cancel so the user lands back on the loot view automatically.
	const mainWindow = getCurrentWindow();
	let wasMinimized = false;
	try {
		await mainWindow.minimize();
		wasMinimized = true;
	} catch (e) {
		// Non-fatal — proceed with the picker anyway, just warn.
		console.warn("Failed to minimize main window before picker:", e);
	}
	// Wait for the OS to actually finish hiding the window before the picker
	// captures. Without this, the captured frame can still contain the chrome.
	await new Promise((r) => setTimeout(r, MAIN_WINDOW_HIDE_GRACE_MS));

	return new Promise<Region | null>((resolve) => {
		let settled = false;
		let unlistenCommit: UnlistenFn | null = null;
		let unlistenCancel: UnlistenFn | null = null;
		let unlistenDestroyed: UnlistenFn | null = null;
		let watchdog: ReturnType<typeof setTimeout> | null = null;

		const settle = (value: Region | null) => {
			if (settled) return;
			settled = true;
			unlistenCommit?.();
			unlistenCancel?.();
			unlistenDestroyed?.();
			if (watchdog) clearTimeout(watchdog);
			// Bring the main window back so the user doesn't have to fish it
			// out of the taskbar.
			if (wasMinimized) {
				mainWindow.unminimize().catch(() => undefined);
				mainWindow.setFocus().catch(() => undefined);
			}
			resolve(value);
		};

		// 1) Subscribe BEFORE creating the window so we can't miss a fast commit.
		(async () => {
			try {
				unlistenCommit = await listen<Region>("loot-picker-commit", (e) => {
					settle(e.payload);
				});
				unlistenCancel = await listen("loot-picker-cancel", () => {
					settle(null);
				});

				// 2) Create the picker window. Tauri 2's WebviewWindow constructor
				//    fires `tauri://created` on success and `tauri://error` on failure.
				// URL differs between modes:
				//   - prod (adapter-static): the route is prerendered as
				//     `loot-picker.html` at the bundle root.
				//   - dev (Vite + SvelteKit): the same route is served as
				//     `/loot-picker` (no .html); `/loot-picker.html` 404s.
				// Switch on `import.meta.env.DEV` so the picker works under
				// `npm run tauri dev` as well as in the shipped portable.
				const pickerUrl = import.meta.env.DEV ? "/loot-picker" : "/loot-picker.html";
				const win = new WebviewWindow(PICKER_LABEL, {
					url: pickerUrl,
					title: "BDO Life Companion — Pick OCR Region",
					fullscreen: true,
					transparent: true,
					decorations: false,
					alwaysOnTop: true,
					resizable: false,
					skipTaskbar: true,
					focus: true,
					visible: true,
				});

				// If the user closes the window via the OS (e.g. Alt+F4) without
				// emitting commit/cancel, the destroy event is our last-resort cleanup.
				unlistenDestroyed = await win.once("tauri://destroyed", () => {
					settle(null);
				});

				win.once("tauri://error", (e) => {
					console.error("Picker window failed to create:", e);
					settle(null);
				});

				// Safety net: if no commit/cancel within 30s the picker is likely broken
				// (window opened but blank, route 404, etc.) — drop it so the user
				// isn't stuck on a "Opening picker…" state forever.
				watchdog = setTimeout(() => {
					console.warn("Picker window timeout — auto-cancelling.");
					win.close().catch(() => undefined);
					settle(null);
				}, 30_000);
			} catch (e) {
				console.error("Failed to open region picker:", e);
				settle(null);
			}
		})();
	});
}
