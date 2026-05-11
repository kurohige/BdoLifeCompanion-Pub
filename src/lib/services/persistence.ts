/**
 * Persistence service - handles saving/loading data via Tauri
 */

import { invoke } from "@tauri-apps/api/core";

// ============== Types ==============

export interface InventoryItem {
	item_id: string;
	quantity: number;
}

export type AppTheme = "obsidian" | "light";
export type FontFamily = "system" | "monospace" | "serif";
export type FontSize = "xs" | "small" | "default" | "large" | "xl" | "xxl";
export type Locale = "en" | "es";
export type NotesDockSide = "left" | "right";

/**
 * Per-theme color/glow overrides. All fields optional — an unset field means
 * "use the theme default" (the value baked into app.css). Colors are stored as
 * `#rrggbb` hex strings so the native <input type="color"> picker can read
 * them back without conversion; HSL/RGB fan-out happens at apply time in
 * `applyTheme()`.
 *
 * `glow_intensity` is a multiplier for the `--neon-glow` CSS var (0 = no
 * glow, 1 = stock obsidian, 2 = doubled). Light theme defaults to 0.
 */
export interface ThemeOverrides {
	primary?: string;
	accent?: string;
	gold?: string;
	glow_intensity?: number;
}

export interface ThemeOverridesByTheme {
	obsidian: ThemeOverrides;
	light: ThemeOverrides;
}

export interface WindowState {
	width: number;
	height: number;
	x: number | null;
	y: number | null;
	view_mode: string;
}

export interface AppSettings {
	transparency: number;
	cooking_mastery: string;
	alchemy_mastery: string;
	cooking_total_mastery: number;
	alchemy_total_mastery: number;
	server_region: string;
	market_region: string;
	favorites: string[];
	theme: AppTheme;
	window_state: WindowState;
	dismissed_announcements: string[];
	boss_sound_enabled: boolean;
	timer_sound_enabled: boolean;
	boss_alert_minutes: number;
	boss_sound_custom_name: string;
	font_family: FontFamily;
	font_bold: boolean;
	font_size: FontSize;
	barter_level: string;
	has_value_pack: boolean;
	total_barter_count: number;
	always_on_top: boolean;
	hidden_bosses: string[];
	mini_show_clocks: boolean;
	clock_format_24h: boolean;
	locale: Locale;
	notes_panel_dock_side: NotesDockSide;
	theme_overrides: ThemeOverridesByTheme;
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
	cooking_mastery: "",
	alchemy_mastery: "",
	cooking_total_mastery: 0,
	alchemy_total_mastery: 0,
	server_region: "NA",
	market_region: "NA",
	favorites: [],
	theme: "obsidian",
	window_state: { width: 560, height: 620, x: null, y: null, view_mode: "full" },
	dismissed_announcements: [],
	boss_sound_enabled: true,
	timer_sound_enabled: true,
	boss_alert_minutes: 5,
	boss_sound_custom_name: "",
	font_family: "system",
	font_bold: false,
	font_size: "default",
	barter_level: "",
	has_value_pack: false,
	total_barter_count: 0,
	always_on_top: true,
	hidden_bosses: [],
	mini_show_clocks: true,
	clock_format_24h: true,
	locale: "en",
	notes_panel_dock_side: "right",
	theme_overrides: { obsidian: {}, light: {} },
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
