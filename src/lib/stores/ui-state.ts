/**
 * UI state that survives tab switches within a session but is NOT persisted to disk.
 * For sub-tab selection, search fields, etc. — anything the user would expect to
 * find still set when they navigate away and come back during the same session.
 */

import { writable } from "svelte/store";
import type { CarrackVariant, RecipeCategory } from "$lib/models";

// ── Bartering sub-tab selection ──
// "tracker" remains in the type for back-compat with persisted state from older versions;
// we remap it to "routes" on read in BarteringView.
export type BarterSubTab = "routes" | "logs" | "tracker" | "inventory" | "ships" | "parley" | "sailors";
export const barterSubTabStore = writable<BarterSubTab>("routes");

// ── Ship Progress pane (Bartering → Ships) ──
/** Which Carrack/Panokseon path the user is looking at. */
export const shipSelectedVariantStore = writable<CarrackVariant>("advance");
/** stageId -> explicit collapse override. Absent = the default (open only if tracked). */
export const shipStageCollapsedStore = writable<Record<string, boolean>>({});
/** Material-totals panel open/closed. Open by default — it carries the path-wide
 *  numbers the per-stage rows cannot show. */
export const shipTotalsOpenStore = writable<boolean>(true);
/** true = whole-path requirement, false = what is still missing. */
export const shipTotalsGrossStore = writable<boolean>(false);
/** materialBaseId -> recipe row expanded. */
export const shipTotalsExpandedStore = writable<Record<string, boolean>>({});

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

// ─── Crafting screen (Parchment redesign) ───
export type CraftingSubTab = "cooking" | "alchemy" | "draughts" | "planner";
export const craftingSubTabStore = writable<CraftingSubTab>("cooking");
/** "Craftable now" filter pill on the crafting search field. */
export const craftingCraftableOnlyStore = writable<boolean>(false);

// ── Loot OCR sub-tab + filters ──
/** SETUP / TRACK / LOGS — three-screen split inside the OCR pane. */
export type LootSubTab = "setup" | "track" | "logs";
export const lootSubTabStore = writable<LootSubTab>("setup");
export const lootHideUnmatchedStore = writable<boolean>(false);
/**
 * Pass 7.2 — ledger source filter. Empty array = no filter (show everything);
 * otherwise only rows whose matchedSource is in the list are shown (raw rows
 * hidden while a filter is active).
 */
export const lootSourceFilterStore = writable<string[]>([]);
/** R1.3 — scan-log source filter: all events, matched-only, or raw-only. */
export type LootScanLogFilter = "all" | "matched" | "raw";
export const lootScanLogFilterStore = writable<LootScanLogFilter>("all");
/** R1.5 — scan-log layout: chronological (false) or grouped by item (true). */
export const lootScanLogGroupedStore = writable<boolean>(false);
/** Which log is expanded in the LOGS list (null = list view, id = detail view). */
export const lootLogDetailIdStore = writable<string | null>(null);
/** Time-window filter for the LOGS list: ALL / TODAY / WEEK / MONTH. */
export type LootLogsRange = "all" | "today" | "week" | "month";
export const lootLogsRangeStore = writable<LootLogsRange>("all");

/**
 * Whether the foreground window is one the scanner is allowed to act on
 * (BDO across locales, or our own app). Updated by the Rust scanner each tick.
 * `true` = scanning, `false` = paused because user Alt-Tabbed to e.g. Discord.
 */
export const lootFocusInGameStore = writable<boolean>(true);
