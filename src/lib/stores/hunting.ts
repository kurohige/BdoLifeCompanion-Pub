/**
 * Hunting store - manages hunting spot selection, loot tracking, session timer, and log.
 * Mirrors the grinding store pattern but with hunting-specific fields (mastery, matchlock, butchering knife).
 * Reuses the grinding timer (only one activity runs at a time).
 */

import { writable, derived, get } from "svelte/store";
import { invoke } from "@tauri-apps/api/core";
import { generateId } from "$lib/utils/id";
import {
	grindingTimerStore,
	stopGrindingTimer,
} from "./grinding";
import { settingsStore } from "./settings";

// ============== Types ==============

export interface HuntingSpot {
	id: string;
	name: string;
	source_id: number;
	image: string;
	loot: string[];
}

export interface HuntingItem {
	id: string;
	name: string;
	source_id: number;
	grade: string;
	image: string;
}

export interface HuntingSpotsData {
	version: number;
	category: string;
	total_spots: number;
	total_items: number;
	spots: HuntingSpot[];
	items: Record<string, HuntingItem>;
}

export interface HuntingLootEntry {
	itemId: string;
	itemName: string;
	count: number;
	value?: number;
}

export interface HuntingSession {
	id: string;
	timestamp: string;
	spotId: string;
	spotName: string;
	durationSeconds: number;
	loot: HuntingLootEntry[];
	mastery?: number;
	matchlockTier?: string;
	butcheringKnife?: string;
}

// ============== Equipment Tiers ==============

export const EQUIPMENT_TIERS = [
	{ value: "practice", label: "Practice" },
	{ value: "beginner", label: "Beginner" },
	{ value: "+0", label: "+0" },
	{ value: "+1", label: "+1" },
	{ value: "+2", label: "+2" },
	{ value: "+3", label: "+3" },
	{ value: "+4", label: "+4" },
	{ value: "+5", label: "+5" },
	{ value: "pri", label: "PRI" },
	{ value: "duo", label: "DUO" },
	{ value: "tri", label: "TRI" },
	{ value: "tet", label: "TET" },
	{ value: "pen", label: "PEN" },
] as const;

// ============== Data Store ==============

export const huntingDataStore = writable<HuntingSpotsData | null>(null);
export const huntingDataLoadingStore = writable<boolean>(true);

export async function loadHuntingData(): Promise<void> {
	huntingDataLoadingStore.set(true);
	try {
		const response = await fetch("/data/hunting/huntingspots.json");
		if (!response.ok) throw new Error(`HTTP ${response.status} loading hunting data`);
		const data: HuntingSpotsData = await response.json();
		huntingDataStore.set(data);
	} catch (error) {
		console.error("Failed to load hunting data:", error);
	} finally {
		huntingDataLoadingStore.set(false);
	}
}

// ============== Selection & Search ==============

export const huntingSearchStore = writable<string>("");
export const huntingSelectedSpotStore = writable<HuntingSpot | null>(null);

export const huntingFilteredSpotsStore = derived(
	[huntingDataStore, huntingSearchStore],
	([$data, $search]) => {
		if (!$data) return [];
		if (!$search.trim()) return $data.spots;
		const s = $search.toLowerCase();
		return $data.spots.filter((spot) => spot.name.toLowerCase().includes(s));
	}
);

export const huntingSelectedSpotItems = derived(
	[huntingDataStore, huntingSelectedSpotStore],
	([$data, $spot]) => {
		if (!$data || !$spot) return [];
		return $spot.loot
			.map((itemId) => $data.items[itemId])
			.filter((item): item is HuntingItem => !!item);
	}
);

export function selectHuntingSpot(spot: HuntingSpot): void {
	huntingSelectedSpotStore.set(spot);
	huntingSearchStore.set("");
	huntingLootCountsStore.set(new Map());
	huntingLootValuesStore.set(new Map());
}

export function clearHuntingSpot(): void {
	huntingSelectedSpotStore.set(null);
	huntingLootCountsStore.set(new Map());
	huntingLootValuesStore.set(new Map());
}

// ============== Loot Tracking ==============

export const huntingLootCountsStore = writable<Map<string, number>>(new Map());
export const huntingLootValuesStore = writable<Map<string, number>>(new Map());

export function setHuntingLootCount(itemId: string, count: number): void {
	huntingLootCountsStore.update((m) => {
		const newMap = new Map(m);
		if (count <= 0) {
			newMap.delete(itemId);
		} else {
			newMap.set(itemId, count);
		}
		return newMap;
	});
}

export function setHuntingLootValue(itemId: string, value: number): void {
	huntingLootValuesStore.update((m) => {
		const newMap = new Map(m);
		if (value <= 0) {
			newMap.delete(itemId);
		} else {
			newMap.set(itemId, value);
		}
		return newMap;
	});
}

export function resetHuntingLootCounts(): void {
	huntingLootCountsStore.set(new Map());
	huntingLootValuesStore.set(new Map());
}

export const huntingTotalLootCount = derived(huntingLootCountsStore, ($counts) => {
	let total = 0;
	for (const count of $counts.values()) {
		total += count;
	}
	return total;
});

export const huntingTotalLootValue = derived(
	[huntingLootCountsStore, huntingLootValuesStore],
	([$counts, $values]) => {
		let total = 0;
		for (const [itemId, count] of $counts.entries()) {
			const value = $values.get(itemId) ?? 0;
			total += count * value;
		}
		return total;
	}
);

// ============== Market Prices ==============

export const huntingMarketPricesLoadingStore = writable<boolean>(false);

export async function fetchHuntingMarketPrices(): Promise<void> {
	const data = get(huntingDataStore);
	const spot = get(huntingSelectedSpotStore);
	if (!data || !spot) return;

	const items = spot.loot
		.map((itemId) => data.items[itemId])
		.filter((item): item is HuntingItem => !!item && item.source_id > 0);

	if (items.length === 0) return;

	const itemIds = items.map((i) => i.source_id).join(",");
	const s = get(settingsStore);
	const region = s.market_region || s.server_region || "NA";

	huntingMarketPricesLoadingStore.set(true);
	try {
		const result = await invoke<Array<{ id: number; price: number }>>(
			"fetch_market_prices",
			{ region, itemIds }
		);

		const priceMap = new Map<number, number>();
		for (const entry of result) {
			priceMap.set(entry.id, entry.price);
		}

		for (const item of items) {
			const price = priceMap.get(item.source_id);
			if (price != null && price > 0) {
				setHuntingLootValue(item.id, price);
			}
		}
	} catch (error) {
		console.error("Failed to fetch hunting market prices:", error);
		throw error;
	} finally {
		huntingMarketPricesLoadingStore.set(false);
	}
}

// ============== Hunting Log ==============

export const huntingLogStore = writable<HuntingSession[]>([]);
export const huntingLogLoadingStore = writable<boolean>(true);

export async function loadHuntingLog(): Promise<void> {
	huntingLogLoadingStore.set(true);
	try {
		const sessions = await invoke<HuntingSession[]>("load_hunting_log");
		huntingLogStore.set(sessions);
	} catch (error) {
		console.error("Failed to load hunting log:", error);
		huntingLogStore.set([]);
	} finally {
		huntingLogLoadingStore.set(false);
	}
}

async function saveHuntingLog(): Promise<void> {
	try {
		const sessions = get(huntingLogStore);
		await invoke("save_hunting_log", { sessions });
	} catch (error) {
		console.error("Failed to save hunting log:", error);
	}
}

export function endHuntingSession(
	mastery?: number,
	matchlockTier?: string,
	butcheringKnife?: string,
): void {
	const spot = get(huntingSelectedSpotStore);
	const timer = get(grindingTimerStore);
	const counts = get(huntingLootCountsStore);
	const values = get(huntingLootValuesStore);
	const data = get(huntingDataStore);

	if (!spot) return;

	const elapsed = timer.totalSeconds - timer.remainingSeconds;
	const hasLoot = Array.from(counts.values()).some((c) => c > 0);
	if (!hasLoot && elapsed <= 0 && !timer.isFinished) return;

	const loot: HuntingLootEntry[] = [];
	for (const [itemId, count] of counts.entries()) {
		if (count > 0) {
			const itemName = data?.items[itemId]?.name ?? itemId;
			const value = values.get(itemId);
			loot.push({ itemId, itemName, count, ...(value ? { value } : {}) });
		}
	}

	const session: HuntingSession = {
		id: generateId(),
		timestamp: new Date().toISOString(),
		spotId: spot.id,
		spotName: spot.name,
		durationSeconds: elapsed > 0 ? elapsed : timer.isFinished ? timer.totalSeconds : 0,
		loot,
		...(mastery != null ? { mastery } : {}),
		...(matchlockTier ? { matchlockTier } : {}),
		...(butcheringKnife ? { butcheringKnife } : {}),
	};

	huntingLogStore.update((log) => [session, ...log]);
	saveHuntingLog();

	// Reset state
	stopGrindingTimer();
	resetHuntingLootCounts();
}

export function deleteHuntingSession(id: string): void {
	huntingLogStore.update((log) => log.filter((s) => s.id !== id));
	saveHuntingLog();
}

export function clearHuntingLog(): void {
	huntingLogStore.set([]);
	saveHuntingLog();
}

export function getHuntingStats(): {
	totalSessions: number;
	totalDurationSeconds: number;
	totalItemsLogged: number;
} {
	const sessions = get(huntingLogStore);
	return {
		totalSessions: sessions.length,
		totalDurationSeconds: sessions.reduce((sum, s) => sum + s.durationSeconds, 0),
		totalItemsLogged: sessions.reduce(
			(sum, s) => sum + s.loot.reduce((ls, l) => ls + l.count, 0),
			0
		),
	};
}
