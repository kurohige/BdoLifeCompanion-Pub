/**
 * Settings store - manages app settings with persistence
 */

import { writable, get } from "svelte/store";
import { loadSettings, saveSettings, DEFAULT_SETTINGS, type AppSettings, type AppTheme, type FontFamily, type FontSize, type WindowState } from "$lib/services/persistence";

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
		// Migrate removed themes to obsidian
		if (settings.theme !== "obsidian" && settings.theme !== "light") {
			settings.theme = "obsidian";
		}
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
 * Set cooking mastery
 */
export function setCookingMastery(value: string): void {
	updateSetting("cooking_mastery", value);
}

/**
 * Set alchemy mastery
 */
export function setAlchemyMastery(value: string): void {
	updateSetting("alchemy_mastery", value);
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
 * Set server region (EU/NA)
 */
export function setServerRegion(value: string): void {
	updateSetting("server_region", value);
}

/**
 * Set app theme
 */
export function setTheme(value: AppTheme): void {
	updateSetting("theme", value);
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
