/**
 * Craft queue — the Queued card on the Crafting screen (spec 5a, Phase 4).
 *
 * Batches are (recipe, quantity) rows. Per-batch ETA comes from a
 * user-tunable seconds-per-craft figure (persisted with the queue) because
 * the recipe catalog carries no craft-time data. Persistence mirrors the
 * planner: one JSON file via load/save commands, saves debounced 300ms.
 */

import { writable, get } from "svelte/store";
import { invoke } from "@tauri-apps/api/core";
import { generateId } from "$lib/utils/id";
import type { RecipeCategory } from "$lib/models/recipe";

export interface CraftQueueBatch {
	id: string;
	recipeId: string;
	recipeName: string;
	category: RecipeCategory;
	quantity: number;
}

export const craftQueueStore = writable<CraftQueueBatch[]>([]);
export const craftQueueSecPerCraftStore = writable<number>(10);

let saveTimeout: ReturnType<typeof setTimeout> | null = null;

function debouncedSave() {
	if (saveTimeout) clearTimeout(saveTimeout);
	saveTimeout = setTimeout(async () => {
		try {
			await invoke("save_craft_queue", {
				batches: get(craftQueueStore),
				secPerCraft: get(craftQueueSecPerCraftStore),
			});
		} catch (error) {
			console.error("Failed to save craft queue:", error);
		}
	}, 300);
}

export async function loadCraftQueue(): Promise<void> {
	try {
		const data = await invoke<{ batches: CraftQueueBatch[]; secPerCraft: number }>("load_craft_queue");
		craftQueueStore.set(data.batches ?? []);
		craftQueueSecPerCraftStore.set(data.secPerCraft > 0 ? data.secPerCraft : 10);
	} catch (error) {
		console.error("Failed to load craft queue:", error);
	}
}

/** Add a recipe to the queue; an existing batch for the same recipe grows instead. */
export function addToQueue(recipeId: string, recipeName: string, category: RecipeCategory, quantity: number): void {
	craftQueueStore.update((batches) => {
		const existing = batches.find((b) => b.recipeId === recipeId);
		if (existing) {
			return batches.map((b) => (b.recipeId === recipeId ? { ...b, quantity: b.quantity + quantity } : b));
		}
		return [...batches, { id: generateId(), recipeId, recipeName, category, quantity }];
	});
	debouncedSave();
}

export function removeFromQueue(batchId: string): void {
	craftQueueStore.update((batches) => batches.filter((b) => b.id !== batchId));
	debouncedSave();
}

export function setQueueQuantity(batchId: string, quantity: number): void {
	if (quantity <= 0) {
		removeFromQueue(batchId);
		return;
	}
	craftQueueStore.update((batches) =>
		batches.map((b) => (b.id === batchId ? { ...b, quantity } : b)),
	);
	debouncedSave();
}

export function setSecPerCraft(value: number): void {
	craftQueueSecPerCraftStore.set(Math.max(1, Math.min(600, value)));
	debouncedSave();
}

export function clearQueue(): void {
	craftQueueStore.set([]);
	debouncedSave();
}
