/**
 * UI state that survives tab switches within a session but is NOT persisted to disk.
 * For sub-tab selection, search fields, etc. — anything the user would expect to
 * find still set when they navigate away and come back during the same session.
 */

import { writable } from "svelte/store";
import type { RecipeCategory } from "$lib/models";

// ── Bartering sub-tab selection ──
// "tracker" remains in the type for back-compat with persisted state from older versions;
// we remap it to "routes" on read in BarteringView.
export type BarterSubTab = "routes" | "logs" | "tracker" | "inventory" | "ships" | "parley" | "sailors";
export const barterSubTabStore = writable<BarterSubTab>("routes");

// ── Log view sub-tab + search filters ──
export type LogSubTab = "crafting" | "grinding" | "hunting";
export type LogCategoryFilter = "all" | RecipeCategory;
export const logSubTabStore = writable<LogSubTab>("crafting");
export const logCraftingSearchStore = writable<string>("");
export const logCraftingCategoryStore = writable<LogCategoryFilter>("all");
export const logGrindingSearchStore = writable<string>("");
export const logHuntingSearchStore = writable<string>("");

// ── Settings view top-tab ──
export type SettingsTab = "general" | "bosses";
export const settingsTabStore = writable<SettingsTab>("general");
