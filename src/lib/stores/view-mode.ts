/**
 * View mode store - tracks which view mode the app is in.
 * Cycles: mini -> medium -> full -> mini
 */

import { writable } from "svelte/store";

export type ViewMode = "mini" | "medium" | "full";
export type ActiveTab = "crafting" | "inventory" | "log" | "timer" | "bartering" | "weekly" | "settings" | "about";

/** Current view mode (mini/medium/full) */
export const viewModeStore = writable<ViewMode>("full");

/** Whether click-through (mouse passthrough) mode is active */
export const clickThroughStore = writable<boolean>(false);

/** Last active tab in full mode, used for context-aware mini mode */
export const activeTabStore = writable<ActiveTab>("crafting");

/** Set a specific view mode */
export function setViewMode(mode: ViewMode): void {
	viewModeStore.set(mode);
}
