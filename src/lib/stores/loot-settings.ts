/**
 * Loot OCR — settings store.
 *
 * Holds the scan-rate, min-confidence, current region, and saved regions. Pure
 * in-memory writable; persistence wires up in Phase 4 (debouncedSave →
 * save_loot_settings via Tauri).
 */

import { writable } from "svelte/store";
import { DEFAULT_LOOT_SETTINGS, type LootSettings, type Region } from "$lib/models/loot";

export const lootSettingsStore = writable<LootSettings>({ ...DEFAULT_LOOT_SETTINGS });

export function setLootRegion(region: Region | null): void {
	lootSettingsStore.update((s) => ({ ...s, region }));
}

/** Clamp to the slider range from the design handoff: 0.5–10 Hz. */
export function setLootFreqHz(freq: number): void {
	lootSettingsStore.update((s) => ({
		...s,
		freqHz: Math.max(0.5, Math.min(10, freq)),
	}));
}

/** Clamp to 0.5–1.0 (handoff slider range). */
export function setLootMinConfidence(conf: number): void {
	lootSettingsStore.update((s) => ({
		...s,
		minConfidence: Math.max(0.5, Math.min(1, conf)),
	}));
}

export function addSavedRegion(name: string, region: Region): void {
	lootSettingsStore.update((s) => ({
		...s,
		savedRegions: [...s.savedRegions, { name, region }],
	}));
}

export function removeSavedRegion(idx: number): void {
	lootSettingsStore.update((s) => ({
		...s,
		savedRegions: s.savedRegions.filter((_, i) => i !== idx),
	}));
}

export function resetLootSettings(): void {
	lootSettingsStore.set({ ...DEFAULT_LOOT_SETTINGS });
}

export function acknowledgeLootDisclaimer(): void {
	lootSettingsStore.update((s) => ({ ...s, disclaimerAcknowledged: true }));
}

export function setLootStrictMode(strict: boolean): void {
	lootSettingsStore.update((s) => ({ ...s, strictMode: strict }));
}

export function setLootColorMask(mask: boolean): void {
	lootSettingsStore.update((s) => ({ ...s, colorMask: mask }));
}

/** Clamp to the Rust pipeline's accepted range. */
export function setLootUpscaleFactor(factor: number): void {
	lootSettingsStore.update((s) => ({
		...s,
		upscaleFactor: Math.max(1, Math.min(6, factor)),
	}));
}

/** Clamp to [1, 12] — the Rust scanner's accepted range for the ring buffer. */
export function setLootTemporalFrames(frames: number): void {
	lootSettingsStore.update((s) => ({
		...s,
		temporalFrames: Math.max(1, Math.min(12, Math.round(frames))),
	}));
}

export function setLootInventoryMergeOnSave(merge: boolean): void {
	lootSettingsStore.update((s) => ({ ...s, inventoryMergeOnSave: merge }));
}
