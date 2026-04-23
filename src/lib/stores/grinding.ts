/**
 * Grinding store - manages grinding spot selection, loot tracking, session timer, and log.
 * Handles the full grinding workflow: spot search -> loot tracking -> timed session -> log entry.
 */

import { writable, derived, get } from "svelte/store";
import { invoke } from "@tauri-apps/api/core";
import { playTimerAlert } from "$lib/utils/audio";
import { generateId } from "$lib/utils/id";
import { settingsStore } from "./settings";

// ============== Types ==============

export interface GrindingSpot {
	id: string;
	name: string;
	source_id: number;
	image: string;
	loot: string[];
}

export interface GrindingItem {
	id: string;
	name: string;
	source_id: number;
	grade: string;
	image: string;
}

export interface GrindingSpotsData {
	version: number;
	category: string;
	total_spots: number;
	total_items: number;
	spots: GrindingSpot[];
	items: Record<string, GrindingItem>;
}

export interface GrindingLootEntry {
	itemId: string;
	itemName: string;
	count: number;
	value?: number;
}

export interface GrindingSession {
	id: string;
	timestamp: string;
	spotId: string;
	spotName: string;
	durationSeconds: number;
	loot: GrindingLootEntry[];
	ap?: number;
	dp?: number;
}

// ============== Data Store ==============

/** Loaded grinding spots data (null until loaded) */
export const grindingDataStore = writable<GrindingSpotsData | null>(null);
export const grindingDataLoadingStore = writable<boolean>(true);

/** Load grinding spots data from static JSON */
export async function loadGrindingData(): Promise<void> {
	grindingDataLoadingStore.set(true);
	try {
		const response = await fetch("/data/grinding/grindspots.json");
		if (!response.ok) throw new Error(`HTTP ${response.status} loading grinding data`);
		const data: GrindingSpotsData = await response.json();
		grindingDataStore.set(data);
	} catch (error) {
		console.error("Failed to load grinding data:", error);
	} finally {
		grindingDataLoadingStore.set(false);
	}
}

// ============== Selection & Search ==============

/** Current search text for spot filtering */
export const grindingSearchStore = writable<string>("");
/** Currently selected grinding spot */
export const selectedSpotStore = writable<GrindingSpot | null>(null);

/** Filtered spots based on search text */
export const filteredSpotsStore = derived(
	[grindingDataStore, grindingSearchStore],
	([$data, $search]) => {
		if (!$data) return [];
		if (!$search.trim()) return $data.spots;
		const s = $search.toLowerCase();
		return $data.spots.filter((spot) => spot.name.toLowerCase().includes(s));
	}
);

/** Get items for the currently selected spot */
export const selectedSpotItems = derived(
	[grindingDataStore, selectedSpotStore],
	([$data, $spot]) => {
		if (!$data || !$spot) return [];
		return $spot.loot
			.map((itemId) => $data.items[itemId])
			.filter((item): item is GrindingItem => !!item);
	}
);

/** Select a grinding spot, clearing search and loot counts */
export function selectSpot(spot: GrindingSpot): void {
	selectedSpotStore.set(spot);
	grindingSearchStore.set("");
	lootCountsStore.set(new Map());
}

/** Clear spot selection and reset loot counts */
export function clearSpot(): void {
	selectedSpotStore.set(null);
	lootCountsStore.set(new Map());
}

// ============== Loot Tracking ==============

/** Map of item ID -> count for the current grinding session */
export const lootCountsStore = writable<Map<string, number>>(new Map());

/** Map of item ID -> silver value per unit for the current session */
export const lootValuesStore = writable<Map<string, number>>(new Map());

/** Increment loot count for an item by 1 */
export function incrementLoot(itemId: string): void {
	lootCountsStore.update((m) => {
		const newMap = new Map(m);
		newMap.set(itemId, (newMap.get(itemId) ?? 0) + 1);
		return newMap;
	});
}

/** Set exact loot count for an item (removes entry if count <= 0) */
export function setLootCount(itemId: string, count: number): void {
	lootCountsStore.update((m) => {
		const newMap = new Map(m);
		if (count <= 0) {
			newMap.delete(itemId);
		} else {
			newMap.set(itemId, count);
		}
		return newMap;
	});
}

/** Set silver value per unit for an item */
export function setLootValue(itemId: string, value: number): void {
	lootValuesStore.update((m) => {
		const newMap = new Map(m);
		if (value <= 0) {
			newMap.delete(itemId);
		} else {
			newMap.set(itemId, value);
		}
		return newMap;
	});
}

/** Reset all loot counts and values to zero */
export function resetLootCounts(): void {
	lootCountsStore.set(new Map());
	lootValuesStore.set(new Map());
}

/** Total items logged this session */
export const totalLootCount = derived(lootCountsStore, ($counts) => {
	let total = 0;
	for (const count of $counts.values()) {
		total += count;
	}
	return total;
});

/** Total silver value of loot this session (sum of qty * value per item) */
export const totalLootValue = derived(
	[lootCountsStore, lootValuesStore],
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

/** Whether market prices are currently being fetched */
export const marketPricesLoadingStore = writable<boolean>(false);

/** Fetch marketplace prices for all items in the selected spot and auto-fill loot values */
export async function fetchMarketPrices(): Promise<void> {
	const data = get(grindingDataStore);
	const spot = get(selectedSpotStore);
	if (!data || !spot) return;

	// Collect source_ids from selected spot items
	const items = spot.loot
		.map((itemId) => data.items[itemId])
		.filter((item): item is GrindingItem => !!item && item.source_id > 0);

	if (items.length === 0) return;

	const itemIds = items.map((i) => i.source_id).join(",");
	const s = get(settingsStore);
	const region = s.market_region || s.server_region || "NA";

	marketPricesLoadingStore.set(true);
	try {
		const result = await invoke<Array<{ id: number; price: number }>>(
			"fetch_market_prices",
			{ region, itemIds }
		);

		// Build source_id -> price map from API response
		const priceMap = new Map<number, number>();
		for (const entry of result) {
			priceMap.set(entry.id, entry.price);
		}

		// Map back to item string IDs and set loot values
		for (const item of items) {
			const price = priceMap.get(item.source_id);
			if (price != null && price > 0) {
				setLootValue(item.id, price);
			}
		}
	} catch (error) {
		console.error("Failed to fetch market prices:", error);
		throw error;
	} finally {
		marketPricesLoadingStore.set(false);
	}
}

// ============== Session Timer (countdown) ==============

export interface GrindingTimerState {
	minutes: number;
	seconds: number;
	totalSeconds: number;
	remainingSeconds: number;
	isRunning: boolean;
	isPaused: boolean;
	isFinished: boolean;
}

/** Grinding countdown timer state */
export const grindingTimerStore = writable<GrindingTimerState>({
	minutes: 5,
	seconds: 0,
	totalSeconds: 300,
	remainingSeconds: 0,
	isRunning: false,
	isPaused: false,
	isFinished: false,
});

let timerIntervalId: ReturnType<typeof setInterval> | null = null;

/** Formatted timer display string (supports hours for long sessions) */
export const grindingTimerDisplay = derived(grindingTimerStore, ($timer) => {
	const total = $timer.isRunning || $timer.isPaused
		? $timer.remainingSeconds
		: $timer.minutes * 60 + $timer.seconds;
	const hrs = Math.floor(total / 3600);
	const mins = Math.floor((total % 3600) / 60);
	const secs = total % 60;
	if (hrs > 0) {
		return `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
	}
	return `${mins}:${secs.toString().padStart(2, "0")}`;
});

/** Progress ratio 0-1 (1 = full, 0 = done) for the SVG ring */
export const grindingTimerProgress = derived(grindingTimerStore, ($timer) => {
	if ($timer.totalSeconds === 0) return 0;
	return $timer.remainingSeconds / $timer.totalSeconds;
});

/** Set minutes input for grinding timer (ignored while running) */
export function setGrindingTimerMinutes(value: number): void {
	grindingTimerStore.update((s) => {
		if (s.isRunning) return s;
		const mins = Math.max(0, Math.min(999, value));
		return { ...s, minutes: mins, totalSeconds: mins * 60 + s.seconds, remainingSeconds: mins * 60 + s.seconds, isFinished: false };
	});
}

/** Set seconds input for grinding timer (ignored while running) */
export function setGrindingTimerSeconds(value: number): void {
	grindingTimerStore.update((s) => {
		if (s.isRunning) return s;
		const secs = Math.max(0, Math.min(59, value));
		return { ...s, seconds: secs, totalSeconds: s.minutes * 60 + secs, remainingSeconds: s.minutes * 60 + secs, isFinished: false };
	});
}

/** Add minutes to the grinding timer (works while running/paused to extend sessions) */
export function setGrindingTimerPreset(mins: number): void {
	grindingTimerStore.update((s) => {
		const addSecs = mins * 60;
		if (s.isRunning || s.isPaused) {
			// Add time to running/paused timer
			return {
				...s,
				totalSeconds: s.totalSeconds + addSecs,
				remainingSeconds: s.remainingSeconds + addSecs,
			};
		}
		// Not running: add to current input values
		const newTotal = s.minutes * 60 + s.seconds + addSecs;
		const newMins = Math.floor(newTotal / 60);
		const newSecs = newTotal % 60;
		return { ...s, minutes: newMins, seconds: newSecs, totalSeconds: newTotal, remainingSeconds: newTotal, isFinished: false };
	});
}

/** Start the grinding countdown timer */
export function startGrindingTimer(): void {
	const state = get(grindingTimerStore);
	if (state.isRunning) return;

	// If not resuming, initialize remaining from inputs
	if (!state.isPaused && state.remainingSeconds === 0) {
		const total = state.minutes * 60 + state.seconds;
		if (total <= 0) return;
		grindingTimerStore.update((s) => ({
			...s,
			remainingSeconds: total,
			totalSeconds: total,
			isFinished: false,
		}));
	}

	grindingTimerStore.update((s) => ({ ...s, isRunning: true, isPaused: false, isFinished: false }));

	timerIntervalId = setInterval(() => {
		try {
			grindingTimerStore.update((s) => {
				if (s.remainingSeconds > 1) {
					return { ...s, remainingSeconds: s.remainingSeconds - 1 };
				} else {
					// Timer finished
					if (timerIntervalId) {
						clearInterval(timerIntervalId);
						timerIntervalId = null;
					}
					if (get(settingsStore).timer_sound_enabled) {
					playTimerAlert();
				}
					return { ...s, remainingSeconds: 0, isRunning: false, isPaused: false, isFinished: true };
				}
			});
		} catch (err) {
			console.error("Grinding timer tick error:", err);
		}
	}, 1000);
}

/** Pause the grinding timer */
export function pauseGrindingTimer(): void {
	if (timerIntervalId) {
		clearInterval(timerIntervalId);
		timerIntervalId = null;
	}
	grindingTimerStore.update((s) => ({ ...s, isRunning: false, isPaused: true }));
}

/** Resume a paused grinding timer */
export function resumeGrindingTimer(): void {
	startGrindingTimer();
}

function clearTimerInterval(): void {
	if (timerIntervalId) {
		clearInterval(timerIntervalId);
		timerIntervalId = null;
	}
}

/** Stop the grinding timer and reset remaining time */
export function stopGrindingTimer(): void {
	clearTimerInterval();
	grindingTimerStore.update((s) => ({
		...s,
		remainingSeconds: 0,
		isRunning: false,
		isPaused: false,
		isFinished: false,
	}));
}

/**
 * Restart the grinding timer back to the beginning of its configured duration.
 * Preserves the minutes/seconds inputs and totalSeconds — only `remainingSeconds`
 * snaps back to `totalSeconds` and the running/paused/finished flags clear.
 * Use stopGrindingTimer() to fully zero the timer.
 */
export function resetGrindingTimer(): void {
	clearTimerInterval();
	grindingTimerStore.update((s) => ({
		...s,
		remainingSeconds: s.totalSeconds,
		isRunning: false,
		isPaused: false,
		isFinished: false,
	}));
}

/** Clean up the grinding timer interval on app unmount */
export function cleanupGrindingTimer(): void {
	if (timerIntervalId) {
		clearInterval(timerIntervalId);
		timerIntervalId = null;
	}
}

// ============== Grinding Log ==============

/** Persisted grinding session history */
export const grindingLogStore = writable<GrindingSession[]>([]);
export const grindingLogLoadingStore = writable<boolean>(true);

/** Load grinding log from disk */
export async function loadGrindingLog(): Promise<void> {
	grindingLogLoadingStore.set(true);
	try {
		const sessions = await invoke<GrindingSession[]>("load_grinding_log");
		grindingLogStore.set(sessions);
	} catch (error) {
		console.error("Failed to load grinding log:", error);
		grindingLogStore.set([]);
	} finally {
		grindingLogLoadingStore.set(false);
	}
}

async function saveGrindingLog(): Promise<void> {
	try {
		const sessions = get(grindingLogStore);
		await invoke("save_grinding_log", { sessions });
	} catch (error) {
		console.error("Failed to save grinding log:", error);
	}
}

/** End the current grinding session, save to log, and reset state */
export function endGrindingSession(ap?: number, dp?: number): void {
	const spot = get(selectedSpotStore);
	const timer = get(grindingTimerStore);
	const counts = get(lootCountsStore);
	const values = get(lootValuesStore);
	const data = get(grindingDataStore);

	if (!spot) return;

	// Calculate elapsed time: total - remaining
	const elapsed = timer.totalSeconds - timer.remainingSeconds;

	// Allow logging if there's loot OR timer has elapsed
	const hasLoot = Array.from(counts.values()).some((c) => c > 0);
	if (!hasLoot && elapsed <= 0 && !timer.isFinished) return;

	const loot: GrindingLootEntry[] = [];
	for (const [itemId, count] of counts.entries()) {
		if (count > 0) {
			const itemName = data?.items[itemId]?.name ?? itemId;
			const value = values.get(itemId);
			loot.push({ itemId, itemName, count, ...(value ? { value } : {}) });
		}
	}

	const session: GrindingSession = {
		id: generateId(),
		timestamp: new Date().toISOString(),
		spotId: spot.id,
		spotName: spot.name,
		durationSeconds: elapsed > 0 ? elapsed : timer.isFinished ? timer.totalSeconds : 0,
		loot,
		...(ap != null ? { ap } : {}),
		...(dp != null ? { dp } : {}),
	};

	grindingLogStore.update((log) => [session, ...log]);
	saveGrindingLog();

	// Reset state
	stopGrindingTimer();
	resetLootCounts();
}

/** Delete a grinding session by ID */
export function deleteGrindingSession(id: string): void {
	grindingLogStore.update((log) => log.filter((s) => s.id !== id));
	saveGrindingLog();
}

/** Clear all grinding sessions */
export function clearGrindingLog(): void {
	grindingLogStore.set([]);
	saveGrindingLog();
}

/** Get aggregate stats from the grinding log */
export function getGrindingStats(): {
	totalSessions: number;
	totalDurationSeconds: number;
	totalItemsLogged: number;
} {
	const sessions = get(grindingLogStore);
	return {
		totalSessions: sessions.length,
		totalDurationSeconds: sessions.reduce((sum, s) => sum + s.durationSeconds, 0),
		totalItemsLogged: sessions.reduce(
			(sum, s) => sum + s.loot.reduce((ls, l) => ls + l.count, 0),
			0
		),
	};
}
