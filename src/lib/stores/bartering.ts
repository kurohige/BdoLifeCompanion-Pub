import { writable, get } from "svelte/store";
import { invoke } from "@tauri-apps/api/core";
import { generateId } from "$lib/utils/id";
import { showToast } from "$lib/stores/toast";
import type {
	BarterItemsData,
	BarterItemDef,
	ParleyMasteryData,
	BarterInventory,
	BarterSession,
	BarterTier,
	ShipUpgradesData,
	ShipStatsData,
	ShipProgress,
	CarrackVariant,
	Sailor,
	SailorRoster,
	SailorStatus,
} from "$lib/models/bartering";

// ============== Debounce Utility ==============

// Label identifies what was being saved so a failure toast gives the user useful context
// (e.g. "Failed to save barter inventory") instead of a silent console error.
function createDebouncedSave(
	label: string,
	saveFn: () => Promise<void>,
	delay = 500,
): () => void {
	let timeout: ReturnType<typeof setTimeout> | null = null;
	return () => {
		if (timeout) clearTimeout(timeout);
		timeout = setTimeout(() => {
			saveFn().catch((e) => {
				console.error(`Failed to save ${label}:`, e);
				showToast(`Failed to save ${label}`, "error");
			});
		}, delay);
	};
}

// ============== Static Data ==============

export const barterItemsStore = writable<BarterItemsData | null>(null);
export const barterItemsLoadingStore = writable<boolean>(true);
export const parleyMasteryStore = writable<ParleyMasteryData | null>(null);

/** Cached items-by-tier lookup (computed once after load, since item data is static) */
let itemsByTierCache: Record<number, BarterItemDef[]> | null = null;

export async function loadBarterData(): Promise<void> {
	barterItemsLoadingStore.set(true);
	try {
		const [itemsRes, masteryRes] = await Promise.all([
			fetch("/data/bartering/barter-items.json"),
			fetch("/data/bartering/parley-mastery.json"),
		]);
		if (!itemsRes.ok) throw new Error(`HTTP ${itemsRes.status} loading barter items`);
		if (!masteryRes.ok) throw new Error(`HTTP ${masteryRes.status} loading parley mastery`);
		const itemsData: BarterItemsData = await itemsRes.json();
		const masteryData: ParleyMasteryData = await masteryRes.json();
		barterItemsStore.set(itemsData);
		parleyMasteryStore.set(masteryData);

		// Pre-compute tier groups since this data never changes
		itemsByTierCache = {};
		for (const item of itemsData.items) {
			(itemsByTierCache[item.tier] ??= []).push(item);
		}
	} catch (error) {
		console.error("Failed to load barter data:", error);
	} finally {
		barterItemsLoadingStore.set(false);
	}
}

export function getItemsByTier(tier: BarterTier): BarterItemDef[] {
	return itemsByTierCache?.[tier] ?? [];
}

// ============== Barter Inventory ==============

const DEFAULT_INVENTORY: BarterInventory = {
	items: {},
	crowCoins: 0,
	lastUpdated: "",
};

export const barterInventoryStore = writable<BarterInventory>(DEFAULT_INVENTORY);
export const barterInventoryLoadingStore = writable<boolean>(true);

export async function loadBarterInventory(): Promise<void> {
	barterInventoryLoadingStore.set(true);
	try {
		const data = await invoke<BarterInventory>("load_barter_inventory");
		barterInventoryStore.set(data);
	} catch (error) {
		console.error("Failed to load barter inventory:", error);
		barterInventoryStore.set(DEFAULT_INVENTORY);
	} finally {
		barterInventoryLoadingStore.set(false);
	}
}

const debouncedSaveInventory = createDebouncedSave("barter inventory", async () => {
	const data = get(barterInventoryStore);
	await invoke("save_barter_inventory", { data });
});

export function updateBarterItemQuantity(itemId: string, quantity: number): void {
	barterInventoryStore.update((inv) => {
		const items = { ...inv.items };
		if (quantity <= 0) {
			delete items[itemId];
		} else {
			items[itemId] = quantity;
		}
		return { ...inv, items, lastUpdated: new Date().toISOString() };
	});
	debouncedSaveInventory();
}

export function setCrowCoins(amount: number): void {
	barterInventoryStore.update((inv) => ({
		...inv,
		crowCoins: Math.max(0, amount),
		lastUpdated: new Date().toISOString(),
	}));
	debouncedSaveInventory();
}

// ============== Barter Session Log ==============

export const barterLogStore = writable<BarterSession[]>([]);
export const barterLogLoadingStore = writable<boolean>(true);

export async function loadBarterLog(): Promise<void> {
	barterLogLoadingStore.set(true);
	try {
		const sessions = await invoke<BarterSession[]>("load_barter_log");
		barterLogStore.set(sessions);
	} catch (error) {
		console.error("Failed to load barter log:", error);
		barterLogStore.set([]);
	} finally {
		barterLogLoadingStore.set(false);
	}
}

// No debounce — session logging is explicit user action, save immediately
async function saveBarterLog(): Promise<void> {
	try {
		const sessions = get(barterLogStore);
		await invoke("save_barter_log", { sessions });
	} catch (error) {
		console.error("Failed to save barter log:", error);
	}
}

export function logBarterSession(session: Omit<BarterSession, "id" | "timestamp">): void {
	const fullSession: BarterSession = {
		...session,
		id: generateId(),
		timestamp: new Date().toISOString(),
	};
	barterLogStore.update((log) => [fullSession, ...log]);
	saveBarterLog();
}

export function deleteBarterSession(id: string): void {
	barterLogStore.update((log) => log.filter((s) => s.id !== id));
	saveBarterLog();
}

export function clearBarterLog(): void {
	barterLogStore.set([]);
	saveBarterLog();
}

// ============== Ship Progress ==============

export const shipUpgradesStore = writable<ShipUpgradesData | null>(null);
export const shipStatsStore = writable<ShipStatsData | null>(null);
export const shipProgressStore = writable<ShipProgress[]>([]);
export const shipProgressLoadingStore = writable<boolean>(true);

export async function loadShipData(): Promise<void> {
	try {
		const [upgradesRes, statsRes] = await Promise.all([
			fetch("/data/bartering/ship-upgrades.json"),
			fetch("/data/bartering/ship-stats.json"),
		]);
		shipUpgradesStore.set(await upgradesRes.json());
		shipStatsStore.set(await statsRes.json());
	} catch (error) {
		console.error("Failed to load ship data:", error);
	}
}

export async function loadShipProgress(): Promise<void> {
	shipProgressLoadingStore.set(true);
	try {
		const data = await invoke<{ paths: ShipProgress[] }>("load_ship_progress");
		shipProgressStore.set(data.paths ?? []);
	} catch (error) {
		console.error("Failed to load ship progress:", error);
		shipProgressStore.set([]);
	} finally {
		shipProgressLoadingStore.set(false);
	}
}

const debouncedSaveShipProgress = createDebouncedSave("ship progress", async () => {
	const paths = get(shipProgressStore);
	await invoke("save_ship_progress", { data: { paths } });
});

/** Immutable find-or-create + mutate helper for ship progress */
function mutateShipProgress(variant: CarrackVariant, mutator: (progress: ShipProgress) => void): void {
	shipProgressStore.update((all) => {
		const idx = all.findIndex((p) => p.variant === variant);
		const progress: ShipProgress = idx >= 0
			? { ...all[idx], materials: { ...all[idx].materials }, completedStages: { ...all[idx].completedStages } }
			: { variant, materials: {}, completedStages: {} };
		mutator(progress);
		if (idx >= 0) {
			const updated = [...all];
			updated[idx] = progress;
			return updated;
		}
		return [...all, progress];
	});
	debouncedSaveShipProgress();
}

export function updateShipMaterial(variant: CarrackVariant, materialId: string, quantity: number): void {
	mutateShipProgress(variant, (p) => {
		if (quantity <= 0) {
			delete p.materials[materialId];
		} else {
			p.materials[materialId] = quantity;
		}
	});
}

export function toggleShipStage(variant: CarrackVariant, stageId: string): void {
	mutateShipProgress(variant, (p) => {
		p.completedStages[stageId] = !p.completedStages[stageId];
	});
}

// ============== Sailor Roster ==============

export const sailorRosterStore = writable<Sailor[]>([]);
export const sailorRosterLoadingStore = writable<boolean>(true);

export async function loadSailorRoster(): Promise<void> {
	sailorRosterLoadingStore.set(true);
	try {
		const data = await invoke<SailorRoster>("load_sailor_roster");
		sailorRosterStore.set(data.sailors ?? []);
	} catch (error) {
		console.error("Failed to load sailor roster:", error);
		sailorRosterStore.set([]);
	} finally {
		sailorRosterLoadingStore.set(false);
	}
}

const debouncedSaveSailors = createDebouncedSave("sailor roster", async () => {
	const sailors = get(sailorRosterStore);
	await invoke("save_sailor_roster", { data: { sailors } });
});

export function addSailor(name: string, level: number, speed: number, status: SailorStatus): void {
	sailorRosterStore.update((list) => [...list, {
		id: generateId(),
		name,
		level: Math.max(1, Math.min(10, level)),
		speed,
		status,
	}]);
	debouncedSaveSailors();
}

export function updateSailor(id: string, updates: Partial<Omit<Sailor, "id">>): void {
	sailorRosterStore.update((list) =>
		list.map((s) => (s.id === id ? { ...s, ...updates } : s))
	);
	debouncedSaveSailors();
}

export function removeSailor(id: string): void {
	sailorRosterStore.update((list) => list.filter((s) => s.id !== id));
	debouncedSaveSailors();
}
