/**
 * Settings store - manages app settings with persistence
 */

import { writable, get } from "svelte/store";
import { loadSettings, saveSettings, DEFAULT_SETTINGS, UI_SCALE_STEPS, type AppSettings, type FontFamily, type FontSize, type Locale, type WindowState, type StripSlot, type CraftingLead, type CraftingDensity } from "$lib/services/persistence";
import { locale as osLocale } from "@tauri-apps/plugin-os";
import { setCurrentLocale } from "$lib/i18n/locale.svelte";

/**
 * Resolve the user's preferred locale. Empty string in settings.locale means
 * "never resolved yet" — query the OS via tauri-plugin-os and pick "es" if
 * the system locale starts with es, else fall back to "en". The result gets
 * persisted in the same initSettings pass so the empty branch only fires once
 * per install.
 */
async function resolveSystemLocale(): Promise<Locale> {
	try {
		const sys = await osLocale();
		if (sys && sys.toLowerCase().startsWith("es")) return "es";
	} catch (error) {
		console.warn("Failed to read system locale, defaulting to en:", error);
	}
	return "en";
}

// Life Skill Rank options (Beginner 1 - Guru 72)
export const LIFE_SKILL_RANKS = [
	"None",
	"Beginner 1", "Beginner 2", "Beginner 3", "Beginner 4", "Beginner 5",
	"Beginner 6", "Beginner 7", "Beginner 8", "Beginner 9", "Beginner 10",
	"Apprentice 1", "Apprentice 2", "Apprentice 3", "Apprentice 4", "Apprentice 5",
	"Apprentice 6", "Apprentice 7", "Apprentice 8", "Apprentice 9", "Apprentice 10",
	"Skilled 1", "Skilled 2", "Skilled 3", "Skilled 4", "Skilled 5",
	"Skilled 6", "Skilled 7", "Skilled 8", "Skilled 9", "Skilled 10",
	"Professional 1", "Professional 2", "Professional 3", "Professional 4", "Professional 5",
	"Professional 6", "Professional 7", "Professional 8", "Professional 9", "Professional 10",
	"Artisan 1", "Artisan 2", "Artisan 3", "Artisan 4", "Artisan 5",
	"Artisan 6", "Artisan 7", "Artisan 8", "Artisan 9", "Artisan 10",
	"Master 1", "Master 2", "Master 3", "Master 4", "Master 5",
	"Master 6", "Master 7", "Master 8", "Master 9", "Master 10",
	"Master 11", "Master 12", "Master 13", "Master 14", "Master 15",
	"Master 16", "Master 17", "Master 18", "Master 19", "Master 20",
	"Master 21", "Master 22", "Master 23", "Master 24", "Master 25",
	"Master 26", "Master 27", "Master 28", "Master 29", "Master 30",
	"Guru 1", "Guru 2", "Guru 3", "Guru 4", "Guru 5",
	"Guru 6", "Guru 7", "Guru 8", "Guru 9", "Guru 10",
	"Guru 11", "Guru 12", "Guru 13", "Guru 14", "Guru 15",
	"Guru 16", "Guru 17", "Guru 18", "Guru 19", "Guru 20",
	"Guru 21", "Guru 22", "Guru 23", "Guru 24", "Guru 25",
	"Guru 26", "Guru 27", "Guru 28", "Guru 29", "Guru 30",
	"Guru 31", "Guru 32", "Guru 33", "Guru 34", "Guru 35",
	"Guru 36", "Guru 37", "Guru 38", "Guru 39", "Guru 40",
	"Guru 41", "Guru 42", "Guru 43", "Guru 44", "Guru 45",
	"Guru 46", "Guru 47", "Guru 48", "Guru 49", "Guru 50",
	"Guru 51", "Guru 52", "Guru 53", "Guru 54", "Guru 55",
	"Guru 56", "Guru 57", "Guru 58", "Guru 59", "Guru 60",
	"Guru 61", "Guru 62", "Guru 63", "Guru 64", "Guru 65",
	"Guru 66", "Guru 67", "Guru 68", "Guru 69", "Guru 70",
	"Guru 71", "Guru 72",
] as const;

// Keep MASTERY_RANKS as alias for backwards compatibility
export const MASTERY_RANKS = LIFE_SKILL_RANKS;

export type LifeSkillRank = typeof LIFE_SKILL_RANKS[number];
export type MasteryRank = LifeSkillRank; // Alias for backwards compatibility

// Settings store
export const settingsStore = writable<AppSettings>(DEFAULT_SETTINGS);

// Loading state
export const settingsLoadingStore = writable<boolean>(true);

// Debounce timer for auto-save
let saveTimeout: ReturnType<typeof setTimeout> | null = null;

/**
 * Initialize settings - load from disk
 */
export async function initSettings(): Promise<void> {
	settingsLoadingStore.set(true);
	try {
		const settings = await loadSettings();
		// Normalize fields to their defaults so UI consumers can read the store
		// without `??` fallbacks everywhere. Serde fills defaults only when a
		// field is MISSING — older settings.json files can contain empty strings
		// that would otherwise break dropdowns. Boolean fields that come back as
		// `undefined` (never saved before) also need defaulting here.
		if (!settings.server_region) settings.server_region = "NA";
		if (!settings.market_region) settings.market_region = settings.server_region;
		if (!settings.font_family) settings.font_family = "system";
		if (!settings.font_size) settings.font_size = "default";
		if (typeof settings.always_on_top !== "boolean") settings.always_on_top = true;
		if (typeof settings.font_bold !== "boolean") settings.font_bold = false;
		if (typeof settings.boss_sound_custom_name !== "string") settings.boss_sound_custom_name = "";
		if (typeof settings.mini_show_clocks !== "boolean") settings.mini_show_clocks = true;
		if (typeof settings.clock_format_24h !== "boolean") settings.clock_format_24h = true;
		if (typeof settings.scratchpad_open !== "boolean") settings.scratchpad_open = true;
		if (
			!settings.scratchpad_pos ||
			typeof settings.scratchpad_pos.x !== "number" ||
			typeof settings.scratchpad_pos.y !== "number"
		) {
			settings.scratchpad_pos = null;
		}
		if (typeof settings.scratchpad_detached !== "boolean") settings.scratchpad_detached = true;
		// One-time v2.8.2 migration (Part B6, user-approved): detached-by-default
		// reaches EXISTING installs once — their settings.json already holds
		// explicit false values a defaults change can't touch. Anyone closing
		// the pad afterwards keeps their choice; the marker never re-fires.
		if (settings.scratchpad_default_migrated !== true) {
			settings.scratchpad_open = true;
			settings.scratchpad_detached = true;
			settings.scratchpad_default_migrated = true;
			await saveSettings(settings);
		}
		if (settings.strip_slot !== "bottom" && settings.strip_slot !== "hidden") settings.strip_slot = "top";
		if (settings.crafting_lead !== "detail") settings.crafting_lead = "list";
		if (settings.crafting_density !== "compact") settings.crafting_density = "comfortable";
		if (typeof settings.show_last_kill !== "boolean") settings.show_last_kill = true;
		if (typeof settings.show_used_in !== "boolean") settings.show_used_in = true;
		if (!UI_SCALE_STEPS.includes(settings.ui_scale as (typeof UI_SCALE_STEPS)[number])) settings.ui_scale = 100;
		if (
			!settings.scratchpad_win ||
			typeof settings.scratchpad_win.x !== "number" ||
			typeof settings.scratchpad_win.y !== "number" ||
			typeof settings.scratchpad_win.w !== "number" ||
			typeof settings.scratchpad_win.h !== "number"
		) {
			settings.scratchpad_win = null;
		}
		if (
			!settings.note_win ||
			typeof settings.note_win.x !== "number" ||
			typeof settings.note_win.y !== "number" ||
			typeof settings.note_win.w !== "number" ||
			typeof settings.note_win.h !== "number"
		) {
			settings.note_win = null;
		}
		if (typeof settings.note_editing_id !== "string") settings.note_editing_id = null;
		// First-run locale detection: empty string from Rust means never set.
		// Resolve from OS, persist immediately, and apply to the reactive
		// locale signal before any component renders a translated string.
		if (settings.locale !== "en" && settings.locale !== "es") {
			settings.locale = await resolveSystemLocale();
			await saveSettings(settings);
		}
		setCurrentLocale(settings.locale);
		settingsStore.set(settings);
	} catch (error) {
		console.error("Failed to initialize settings:", error);
	} finally {
		settingsLoadingStore.set(false);
	}
}

/**
 * Save settings with debounce
 */
function debouncedSave() {
	if (saveTimeout) {
		clearTimeout(saveTimeout);
	}
	saveTimeout = setTimeout(async () => {
		try {
			const settings = get(settingsStore);
			await saveSettings(settings);
		} catch (error) {
			console.error("Failed to save settings:", error);
		}
	}, 500);
}

/**
 * Cancel any pending debounced save and write to disk immediately.
 *
 * Must be awaited before the window closes — the debounced save's 500ms
 * timer is killed when the process dies, so a pending write would be lost.
 */
export async function flushSettings(): Promise<void> {
	if (saveTimeout) {
		clearTimeout(saveTimeout);
		saveTimeout = null;
	}
	try {
		const settings = get(settingsStore);
		await saveSettings(settings);
	} catch (error) {
		console.error("Failed to flush settings:", error);
	}
}

/**
 * Update a single setting
 */
export function updateSetting<K extends keyof AppSettings>(
	key: K,
	value: AppSettings[K]
): void {
	settingsStore.update((s) => ({ ...s, [key]: value }));
	debouncedSave();
}

/**
 * Set transparency
 */
export function setTransparency(value: number): void {
	updateSetting("transparency", Math.max(0.2, Math.min(1, value)));
}

/**
 * Set cooking total mastery level (0-3000)
 */
export function setCookingTotalMastery(value: number): void {
	updateSetting("cooking_total_mastery", Math.max(0, Math.min(3000, value)));
}

/**
 * Set alchemy total mastery level (0-3000)
 */
export function setAlchemyTotalMastery(value: number): void {
	updateSetting("alchemy_total_mastery", Math.max(0, Math.min(3000, value)));
}

/**
 * Set server region (EU/NA) — drives boss schedule, node/conquest war times
 */
export function setServerRegion(value: string): void {
	updateSetting("server_region", value);
}

/**
 * Set market region (NA/EU/SEA) — drives Central Market price endpoint
 */
export function setMarketRegion(value: string): void {
	updateSetting("market_region", value);
}

/**
 * Set boss spawn alert sound enabled/disabled
 */
export function setBossSoundEnabled(value: boolean): void {
	updateSetting("boss_sound_enabled", value);
}

/**
 * Set timer completion sound enabled/disabled
 */
export function setTimerSoundEnabled(value: boolean): void {
	updateSetting("timer_sound_enabled", value);
}

/**
 * Set boss alert threshold in minutes (1-30)
 */
export function setBossAlertMinutes(value: number): void {
	updateSetting("boss_alert_minutes", Math.max(1, Math.min(30, value)));
}

/**
 * Set the basename of the user's imported custom boss alert sound.
 * Empty string falls back to the built-in synth beep.
 */
export function setBossSoundCustomName(value: string): void {
	updateSetting("boss_sound_custom_name", value);
}

/**
 * Save window state (size, position, view mode)
 */
export function saveWindowState(state: WindowState): void {
	updateSetting("window_state", state);
}

/**
 * Set font bold
 */
export function setFontBold(value: boolean): void {
	updateSetting("font_bold", value);
}

/**
 * Set font size
 */
export function setFontSize(value: FontSize): void {
	updateSetting("font_size", value);
}

export function setBarterLevel(value: string): void {
	updateSetting("barter_level", value);
}

export function setValuePack(value: boolean): void {
	updateSetting("has_value_pack", value);
}

export function setAlwaysOnTop(value: boolean): void {
	updateSetting("always_on_top", value);
}

/** Toggle the local + server time cluster in the mini mode bar. */
export function setMiniShowClocks(value: boolean): void {
	updateSetting("mini_show_clocks", value);
}

/** Choose 24-hour (true) or 12-hour AM/PM (false) display for clock readouts. */
export function setClockFormat24h(value: boolean): void {
	updateSetting("clock_format_24h", value);
}

/** Scratchpad panel open/closed. Persists across launches. */
export function setScratchpadOpen(value: boolean): void {
	updateSetting("scratchpad_open", value);
}

/** Scratchpad dragged position (window-space px); null restores the default corner. */
export function setScratchpadPos(value: { x: number; y: number } | null): void {
	updateSetting("scratchpad_pos", value);
}

/** Scratchpad detached into its own OS window. Persists across launches. */
export function setScratchpadDetached(value: boolean): void {
	updateSetting("scratchpad_detached", value);
}

// Layout preferences (Parchment 7.3)
export function setStripSlot(value: StripSlot): void {
	updateSetting("strip_slot", value);
}

export function setCraftingLead(value: CraftingLead): void {
	updateSetting("crafting_lead", value);
}

export function setCraftingDensity(value: CraftingDensity): void {
	updateSetting("crafting_density", value);
}

export function setShowLastKill(value: boolean): void {
	updateSetting("show_last_kill", value);
}

export function setShowUsedIn(value: boolean): void {
	updateSetting("show_used_in", value);
}

export function setUiScale(value: number): void {
	updateSetting("ui_scale", value);
}

/** Detached scratchpad window bounds (physical px). */
export function setScratchpadWin(value: { x: number; y: number; w: number; h: number } | null): void {
	updateSetting("scratchpad_win", value);
}

/** Note editor window bounds (physical px) — its own record, not the pad's. */
export function setNoteWin(value: { x: number; y: number; w: number; h: number } | null): void {
	updateSetting("note_win", value);
}

/**
 * Point the single editor window at a note (null closes it). The list writes
 * this; the editor window watches it and swaps its contents in place.
 */
export function setNoteEditingId(value: string | null): void {
	updateSetting("note_editing_id", value);
}

/**
 * Switch the active UI language. Updates the reactive locale signal so every
 * template that calls m.foo() re-renders immediately — no page reload needed.
 * Settings are persisted via the standard debounced save.
 */
export function setLocale(value: Locale): void {
	updateSetting("locale", value);
	setCurrentLocale(value);
}

/**
 * Toggle whether a boss is hidden in the UI (boss bar, mini/medium modes).
 * Hidden bosses are filtered out of next/previous spawn lists.
 */
export function toggleBossHidden(bossId: string): void {
	settingsStore.update((s) => {
		const hidden = s.hidden_bosses ?? [];
		const next = hidden.includes(bossId)
			? hidden.filter((id) => id !== bossId)
			: [...hidden, bossId];
		return { ...s, hidden_bosses: next };
	});
	debouncedSave();
}

/** Set the full list of hidden bosses (bulk: show all / hide all shortcuts). */
export function setHiddenBosses(ids: string[]): void {
	updateSetting("hidden_bosses", ids);
}

/**
 * Add a favorite recipe
 */
export function addFavorite(recipeId: string): void {
	settingsStore.update((s) => {
		if (!s.favorites.includes(recipeId)) {
			return { ...s, favorites: [...s.favorites, recipeId] };
		}
		return s;
	});
	debouncedSave();
}

/**
 * Remove a favorite recipe
 */
export function removeFavorite(recipeId: string): void {
	settingsStore.update((s) => ({
		...s,
		favorites: s.favorites.filter((id) => id !== recipeId),
	}));
	debouncedSave();
}

/**
 * Toggle favorite status
 */
export function toggleFavorite(recipeId: string): void {
	const settings = get(settingsStore);
	if (settings.favorites.includes(recipeId)) {
		removeFavorite(recipeId);
	} else {
		addFavorite(recipeId);
	}
}

/**
 * Check if a recipe is a favorite
 */
export function isFavorite(recipeId: string): boolean {
	return get(settingsStore).favorites.includes(recipeId);
}

