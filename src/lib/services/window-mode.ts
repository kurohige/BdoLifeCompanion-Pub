/**
 * Window mode service — the ONE place that resizes the Tauri window between
 * mini / medium / full and keeps viewModeStore in sync. Replaces the three
 * divergent copies that lived in TitleBar, MiniMode and MediumMode (which
 * also disagreed on units: saved full-mode sizes are PHYSICAL pixels, but the
 * widget-side expanders fed them to LogicalSize — a real DPI bug on scaled
 * displays).
 */

import { getCurrentWindow, LogicalSize, PhysicalSize } from "@tauri-apps/api/window";
import { exit } from "@tauri-apps/plugin-process";
import { get } from "svelte/store";
import { settingsStore } from "$lib/stores/settings";
import { setViewMode, viewModeStore, type ViewMode } from "$lib/stores/view-mode";

export const MINI_SIZE = new LogicalSize(400, 56);
/** Mini grown downward by 26px while the 5-minute spawn line shows. */
export const MINI_ALERT_SIZE = new LogicalSize(400, 82);
export const MEDIUM_SIZE = new LogicalSize(460, 150);
const WIDGET_MIN_SIZE = new LogicalSize(140, 40);
const FULL_MIN_SIZE = new LogicalSize(480, 500);
const FULL_DEFAULT = new LogicalSize(560, 680);

export async function switchMode(mode: ViewMode): Promise<void> {
	const win = getCurrentWindow();
	try {
		if (mode === "mini") {
			await win.setMinSize(WIDGET_MIN_SIZE);
			await win.setSize(MINI_SIZE);
		} else if (mode === "medium") {
			await win.setMinSize(WIDGET_MIN_SIZE);
			await win.setSize(MEDIUM_SIZE);
		} else {
			const saved = get(settingsStore).window_state;
			await win.setMinSize(FULL_MIN_SIZE);
			if (saved?.view_mode === "full" && saved.width && saved.height) {
				// Saved sizes come from outerSize() and are physical pixels.
				await win.setSize(new PhysicalSize(saved.width, Math.max(saved.height, 680)));
			} else {
				await win.setSize(FULL_DEFAULT);
			}
		}
		setViewMode(mode);
	} catch (err) {
		console.warn("Failed to switch window mode:", err);
	}
}

/**
 * The chevron's primary action — the documented cycle (view-mode.ts):
 * full -> mini -> medium -> full. Full wraps DOWN to mini rather than stepping
 * back to medium: with a back-step there, mini was reachable only through the
 * long-press, so the smallest widget was effectively unreachable.
 */
const FORWARD: Record<ViewMode, ViewMode> = { full: "mini", mini: "medium", medium: "full" };

/** The reverse of FORWARD, for the chevron's long-press / right-click. */
const BACKWARD: Record<ViewMode, ViewMode> = { full: "medium", medium: "mini", mini: "full" };

export async function stepMode(): Promise<void> {
	await switchMode(FORWARD[get(viewModeStore)]);
}

/**
 * The chevron's secondary action (long-press / right-click): walk the same
 * cycle the other way, so every mode is one gesture from its neighbours.
 */
export async function stepModeBack(): Promise<void> {
	await switchMode(BACKWARD[get(viewModeStore)]);
}

export async function minimizeWindow(): Promise<void> {
	await getCurrentWindow().minimize();
}

export async function closeApp(): Promise<void> {
	try {
		await exit(0);
	} catch {
		await getCurrentWindow().close();
	}
}
