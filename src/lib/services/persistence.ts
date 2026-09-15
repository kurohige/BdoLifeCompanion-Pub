/**
 * Persistence service - handles saving/loading data via Tauri
 */

import { invoke } from "@tauri-apps/api/core";

// ============== Types ==============

export interface InventoryItem {
	item_id: string;
	quantity: number;
}

export type FontFamily = "system" | "monospace" | "serif";
export type FontSize = "xs" | "small" | "default" | "large" | "xl" | "xxl";
export type Locale = "en" | "es";
export type StripSlot = "top" | "bottom" | "hidden";
export type CraftingLead = "list" | "detail";
export type CraftingDensity = "comfortable" | "compact";

/** UI scale steps (%) — applied as webview zoom on the full window only. */
export const UI_SCALE_STEPS = [90, 100, 110, 125] as const;

export interface WindowState {
	width: number;
	height: number;
	x: number | null;
	y: number | null;
	view_mode: string;
}

export interface AppSettings {
	transparency: number;
	cooking_total_mastery: number;
	alchemy_total_mastery: number;
	server_region: string;
	market_region: string;
	favorites: string[];
	window_state: WindowState;
	boss_sound_enabled: boolean;
	timer_sound_enabled: boolean;
	boss_alert_minutes: number;
	boss_sound_custom_name: string;
	font_family: FontFamily;
	font_bold: boolean;
	font_size: FontSize;
	barter_level: string;
	has_value_pack: boolean;
	always_on_top: boolean;
	hidden_bosses: string[];
	mini_show_clocks: boolean;
	clock_format_24h: boolean;
	locale: Locale;
	/** Scratchpad floating panel — open state and dragged position persist. */
	scratchpad_open: boolean;
	scratchpad_pos: { x: number; y: number } | null;
	/** Scratchpad detached into its own OS window */
	scratchpad_detached: boolean;
	/** One-time v2.8.2 flip to detached-by-default has been applied (B6). */
	scratchpad_default_migrated: boolean;
	/** Detached window bounds in physical px (outer position + inner size) */
	scratchpad_win: { x: number; y: number; w: number; h: number } | null;
	/** Note editor window bounds in physical px — its own record, not the pad's. */
	note_win: { x: number; y: number; w: number; h: number } | null;
	/**
	 * Which note the single editor window is holding. The list window writes it,
	 * the editor watches it — that is what makes opening a second note a content
	 * swap rather than a window reload. Survives app exit so the editor reopens
	 * on the same note; null means the editor is closed.
	 */
	note_editing_id: string | null;
	/** Layout preferences (Parchment 7.3 — handoff "Configurable layout") */
	strip_slot: StripSlot;
	crafting_lead: CraftingLead;
	crafting_density: CraftingDensity;
	show_last_kill: boolean;
	show_used_in: boolean;
	/** Webview zoom % for the full window; widgets stay 1:1 */
	ui_scale: number;
}

// ============== Inventory ==============

/**
 * Load inventory from disk
 */
export async function loadInventory(): Promise<Map<string, number>> {
	try {
		const items = await invoke<InventoryItem[]>("load_inventory");
		const inventory = new Map<string, number>();

		for (const item of items) {
			inventory.set(item.item_id.toLowerCase(), item.quantity);
		}

		return inventory;
	} catch (error) {
		console.error("Failed to load inventory:", error);
		return new Map();
	}
}

/**
 * Save inventory to disk
 */
export async function saveInventory(inventory: Map<string, number>): Promise<void> {
	try {
		const items: InventoryItem[] = [];

		for (const [itemId, quantity] of inventory) {
			if (quantity > 0) {
				items.push({ item_id: itemId, quantity });
			}
		}

		await invoke("save_inventory", { items });
	} catch (error) {
		console.error("Failed to save inventory:", error);
		throw error;
	}
}

// ============== Settings ==============

export const DEFAULT_SETTINGS: AppSettings = {
	transparency: 0.95,
	cooking_total_mastery: 0,
	alchemy_total_mastery: 0,
	server_region: "NA",
	market_region: "NA",
	favorites: [],
	window_state: { width: 560, height: 620, x: null, y: null, view_mode: "full" },
	boss_sound_enabled: true,
	timer_sound_enabled: true,
	boss_alert_minutes: 5,
	boss_sound_custom_name: "",
	font_family: "system",
	font_bold: false,
	font_size: "default",
	barter_level: "",
	has_value_pack: false,
	always_on_top: true,
	hidden_bosses: [],
	mini_show_clocks: true,
	clock_format_24h: true,
	locale: "en",
	scratchpad_open: true, // was false — detached-by-default (v2.8.2 Part B)
	scratchpad_pos: null,
	scratchpad_detached: true, // was false
	scratchpad_default_migrated: true, // fresh installs need no migration
	scratchpad_win: null,
	note_win: null,
	note_editing_id: null,
	strip_slot: "top",
	crafting_lead: "list",
	crafting_density: "comfortable",
	show_last_kill: true,
	show_used_in: true,
	ui_scale: 100,
};

/**
 * Load settings from disk
 */
export async function loadSettings(): Promise<AppSettings> {
	try {
		const settings = await invoke<AppSettings>("load_settings");
		return { ...DEFAULT_SETTINGS, ...settings };
	} catch (error) {
		console.error("Failed to load settings:", error);
		return DEFAULT_SETTINGS;
	}
}

/**
 * Save settings to disk
 */
export async function saveSettings(settings: AppSettings): Promise<void> {
	try {
		await invoke("save_settings", { settings });
	} catch (error) {
		console.error("Failed to save settings:", error);
		throw error;
	}
}

/**
 * Get the app data directory path
 */
export async function getDataPath(): Promise<string> {
	try {
		return await invoke<string>("get_data_path");
	} catch (error) {
		console.error("Failed to get data path:", error);
		return "";
	}
}
