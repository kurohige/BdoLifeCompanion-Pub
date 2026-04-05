/**
 * Crafting log store - manages crafting session history with persistence.
 * Sessions are stored in reverse-chronological order.
 */

import { writable, get } from "svelte/store";
import { invoke } from "@tauri-apps/api/core";
import { generateId } from "$lib/utils/id";

export interface CraftingSession {
	id: string;
	timestamp: string;
	recipeId: string;
	recipeName: string;
	category: string;
	mastery: number;
	crafted: number;
	yielded: number;
	canCraft: number;
	silverEarned?: number;
}

/** Persisted crafting session history */
export const craftingLogStore = writable<CraftingSession[]>([]);
export const craftingLogLoadingStore = writable<boolean>(true);

/** Load crafting log from disk via Tauri command */
export async function loadCraftingLog(): Promise<void> {
	craftingLogLoadingStore.set(true);
	try {
		const sessions = await invoke<CraftingSession[]>("load_crafting_log");
		craftingLogStore.set(sessions);
	} catch (error) {
		console.error("Failed to load crafting log:", error);
		craftingLogStore.set([]);
	} finally {
		craftingLogLoadingStore.set(false);
	}
}

async function saveCraftingLog(): Promise<void> {
	try {
		const sessions = get(craftingLogStore);
		await invoke("save_crafting_log", { sessions });
	} catch (error) {
		console.error("Failed to save crafting log:", error);
	}
}

/** Add a new crafting session and persist to disk */
export function addCraftingSession(
	recipeId: string,
	recipeName: string,
	category: string,
	mastery: number,
	crafted: number,
	yielded: number,
	canCraft: number
): void {
	const session: CraftingSession = {
		id: generateId(),
		timestamp: new Date().toISOString(),
		recipeId,
		recipeName,
		category,
		mastery,
		crafted,
		yielded,
		canCraft,
	};

	craftingLogStore.update((log) => [session, ...log]);
	saveCraftingLog();
}

/** Delete a crafting session by ID */
export function deleteCraftingSession(id: string): void {
	craftingLogStore.update((log) => log.filter((s) => s.id !== id));
	saveCraftingLog();
}

/** Clear all crafting sessions */
export function clearCraftingLog(): void {
	craftingLogStore.set([]);
	saveCraftingLog();
}

/** Get aggregate stats from the crafting log */
export function getCraftingStats(): {
	totalSessions: number;
	totalCrafted: number;
	totalYielded: number;
	avgYieldRate: number;
} {
	const sessions = get(craftingLogStore);

	if (sessions.length === 0) {
		return {
			totalSessions: 0,
			totalCrafted: 0,
			totalYielded: 0,
			avgYieldRate: 0,
		};
	}

	const totalSessions = sessions.length;
	const totalCrafted = sessions.reduce((sum, s) => sum + s.crafted, 0);
	const totalYielded = sessions.reduce((sum, s) => sum + s.yielded, 0);
	const avgYieldRate = totalCrafted > 0 ? totalYielded / totalCrafted : 0;

	return {
		totalSessions,
		totalCrafted,
		totalYielded,
		avgYieldRate,
	};
}
