/**
 * View mode store - tracks which view mode the app is in.
 * Cycles: mini -> medium -> full -> mini
 */

import { writable } from "svelte/store";

export type ViewMode = "mini" | "medium" | "full";
export type ActiveTab = "crafting" | "inventory" | "log" | "timer" | "settings";

/** Current view mode (mini/medium/full) */
export const viewModeStore = writable<ViewMode>("full");

/** Whether click-through (mouse passthrough) mode is active */
export const clickThroughStore = writable<boolean>(false);

/** Last active tab in full mode, used for context-aware mini mode */
export const activeTabStore = writable<ActiveTab>("crafting");

/** Cycle to the next view mode: mini -> medium -> full -> mini */
export function cycleViewMode(): void {
	viewModeStore.update((current) => {
		switch (current) {
			case "mini":
				return "medium";
			case "medium":
				return "full";
			case "full":
				return "mini";
		}
	});
}

/** Set a specific view mode */
export function setViewMode(mode: ViewMode): void {
	viewModeStore.set(mode);
}
