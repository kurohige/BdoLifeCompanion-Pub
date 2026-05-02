import { writable, get } from "svelte/store";
import { invoke } from "@tauri-apps/api/core";
import { generateId } from "$lib/utils/id";
import { showToast } from "$lib/stores/toast";
import {
	barterInventoryStore,
	barterItemsStore,
	parleyMasteryStore,
} from "./bartering";
import { settingsStore } from "./settings";
import {
	BARTER_MAP_LAYOUT_SCHEMA_VERSION,
	type IslandsData,
	type IslandNode,
	type BarterMapLayout,
	type CustomNode,
	type RouteSession,
	type RouteLog,
	type Trade,
	type IslandRegion,
	type BarterTier,
	type BarterItemDef,
	type ParleyMasteryData,
	type BarterSession,
	type ParleyCostKey,
} from "$lib/models/bartering";

// ============== Debounce Utility ==============

function createDebouncedSave(label: string, saveFn: () => Promise<void>, delay = 500): () => void {
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

// ============== Constants ==============

export const PARLEY_MAX_DEFAULT = 1_000_000;

/** Items that get the gold "SP" badge instead of their numeric tier */
const SP_ITEM_IDS = new Set([
	"mysterious_rock",
	"elixir_of_youth",
	"golden_herb_102",
	"statues_tear",
]);

// ============== Static Islands Data ==============

export const islandsDataStore = writable<IslandsData | null>(null);
export const islandsDataLoadingStore = writable<boolean>(true);

export async function loadIslandsData(): Promise<void> {
	islandsDataLoadingStore.set(true);
	try {
		const res = await fetch("/data/bartering/islands.json");
		if (!res.ok) throw new Error(`HTTP ${res.status} loading islands`);
		const data: IslandsData = await res.json();
		islandsDataStore.set(data);
	} catch (error) {
		console.error("Failed to load islands data:", error);
		islandsDataStore.set({ version: 0, nodes: [] });
	} finally {
		islandsDataLoadingStore.set(false);
	}
}

// ============== Map Layout (position overrides + custom nodes) ==============

const DEFAULT_LAYOUT: BarterMapLayout = {
	schemaVersion: BARTER_MAP_LAYOUT_SCHEMA_VERSION,
	positionOverrides: {},
	customNodes: [],
};

export const barterMapLayoutStore = writable<BarterMapLayout>(DEFAULT_LAYOUT);
export const barterMapLayoutLoadingStore = writable<boolean>(true);

export async function loadBarterMapLayout(): Promise<void> {
	barterMapLayoutLoadingStore.set(true);
	try {
		const data = await invoke<BarterMapLayout>("load_barter_map_layout");
		const savedVersion = data.schemaVersion ?? 1;
		// Stale overrides from before the canvas was reshaped — wipe and bump.
		const positionOverrides =
			savedVersion < BARTER_MAP_LAYOUT_SCHEMA_VERSION ? {} : (data.positionOverrides ?? {});
		const next: BarterMapLayout = {
			schemaVersion: BARTER_MAP_LAYOUT_SCHEMA_VERSION,
			positionOverrides,
			customNodes: data.customNodes ?? [],
		};
		barterMapLayoutStore.set(next);
		if (savedVersion < BARTER_MAP_LAYOUT_SCHEMA_VERSION) {
			// Persist the wipe + version bump so it doesn't repeat next launch.
			invoke("save_barter_map_layout", { data: next }).catch((e) =>
				console.error("Failed to persist layout migration:", e)
			);
		}
	} catch (error) {
		console.error("Failed to load barter map layout:", error);
		barterMapLayoutStore.set({ ...DEFAULT_LAYOUT });
	} finally {
		barterMapLayoutLoadingStore.set(false);
	}
}

const debouncedSaveLayout = createDebouncedSave("map layout", async () => {
	const data = get(barterMapLayoutStore);
	await invoke("save_barter_map_layout", { data });
});

export function applyPositionOverride(nodeId: string, x: number, y: number): void {
	barterMapLayoutStore.update((l) => {
		// If this is a custom node, mutate its x/y in-place; else add an override.
		const customIdx = l.customNodes.findIndex((c) => c.id === nodeId);
		if (customIdx >= 0) {
			const updated = [...l.customNodes];
			updated[customIdx] = { ...updated[customIdx], x, y };
			return { ...l, customNodes: updated };
		}
		return { ...l, positionOverrides: { ...l.positionOverrides, [nodeId]: { x, y } } };
	});
	debouncedSaveLayout();
}

export function resetPositionOverrides(): void {
	barterMapLayoutStore.update((l) => ({ ...l, positionOverrides: {} }));
	debouncedSaveLayout();
}

export function addCustomNode(node: Omit<CustomNode, "custom">): void {
	barterMapLayoutStore.update((l) => ({
		...l,
		customNodes: [...l.customNodes, { ...node, custom: true }],
	}));
	debouncedSaveLayout();
}

export function removeCustomNode(id: string): void {
	barterMapLayoutStore.update((l) => ({
		...l,
		customNodes: l.customNodes.filter((c) => c.id !== id),
	}));
	debouncedSaveLayout();
}

/** Look up a node by id, considering shipped data + custom + overrides */
export function getEffectiveNode(id: string): IslandNode | null {
	const data = get(islandsDataStore);
	const layout = get(barterMapLayoutStore);
	const shipped = data?.nodes.find((n) => n.id === id);
	if (shipped) {
		const override = layout.positionOverrides[id];
		return override ? { ...shipped, x: override.x, y: override.y } : shipped;
	}
	const custom = layout.customNodes.find((c) => c.id === id);
	return custom ?? null;
}

// ============== Current Route Session ==============

export const currentRouteStore = writable<RouteSession | null>(null);
export const currentRouteLoadingStore = writable<boolean>(true);

/** Local timer tick — drives the elapsed display in RoutesView */
export const routeTickStore = writable<number>(Date.now());
let tickInterval: ReturnType<typeof setInterval> | null = null;

export function startRouteTicker(): void {
	if (tickInterval) return;
	tickInterval = setInterval(() => routeTickStore.set(Date.now()), 1000);
}

export function stopRouteTicker(): void {
	if (tickInterval) {
		clearInterval(tickInterval);
		tickInterval = null;
	}
}

export async function loadCurrentRoute(): Promise<void> {
	currentRouteLoadingStore.set(true);
	try {
		const data = await invoke<RouteSession | null>("load_barter_route_current");
		// On restart, force the timer to be paused even if it was running, so
		// closed-window time doesn't double-count toward the route duration.
		if (data && data.pausedAt === null) {
			data.pausedAt = Date.now();
		}
		currentRouteStore.set(data);
	} catch (error) {
		console.error("Failed to load current route:", error);
		currentRouteStore.set(null);
	} finally {
		currentRouteLoadingStore.set(false);
	}
}

const debouncedSaveCurrentRoute = createDebouncedSave("current route", async () => {
	const data = get(currentRouteStore);
	await invoke("save_barter_route_current", { data });
});

function startNewSession(): RouteSession {
	const settings = get(settingsStore);
	return {
		id: generateId(),
		startedAt: Date.now(),
		trades: [],
		parleyMax: PARLEY_MAX_DEFAULT,
		parleyRefilled: 0,
		barterLevelAtStart: settings.barter_level || "Beginner 1",
		hasValuePackAtStart: settings.has_value_pack ?? false,
		pausedMs: 0,
		pausedAt: null,
	};
}

export function pauseRoute(): void {
	currentRouteStore.update((s) => {
		if (!s || s.pausedAt !== null) return s;
		return { ...s, pausedAt: Date.now() };
	});
	debouncedSaveCurrentRoute();
}

export function resumeRoute(): void {
	currentRouteStore.update((s) => {
		if (!s || s.pausedAt === null) return s;
		const addedPause = Date.now() - s.pausedAt;
		return { ...s, pausedAt: null, pausedMs: s.pausedMs + addedPause };
	});
	debouncedSaveCurrentRoute();
}

/** Total elapsed seconds, accounting for pauses. Reactive via routeTickStore. */
export function elapsedSeconds(session: RouteSession, now: number): number {
	const total = now - session.startedAt;
	const ongoingPause = session.pausedAt !== null ? now - session.pausedAt : 0;
	const elapsedMs = total - session.pausedMs - ongoingPause;
	return Math.max(0, Math.floor(elapsedMs / 1000));
}

// ============== Trade mutations ==============

export interface AddTradePayload {
	nodeId: string;
	receiveName: string;
	receiveTier: BarterTier;
	qty: number;
	silverPerUnit: number;
	receiveSp?: boolean;
	giveText?: string;
	receiveItemId?: string;
}

export function addTrade(payload: AddTradePayload): void {
	currentRouteStore.update((session) => {
		const s = session ?? startNewSession();
		const trade: Trade = {
			id: generateId(),
			ts: Date.now(),
			nodeId: payload.nodeId,
			receiveName: payload.receiveName,
			receiveTier: payload.receiveTier,
			receiveSp: payload.receiveSp,
			qty: Math.max(1, payload.qty),
			silverPerUnit: payload.silverPerUnit,
			giveText: payload.giveText,
			receiveItemId: payload.receiveItemId,
		};
		return { ...s, trades: [...s.trades, trade] };
	});
	debouncedSaveCurrentRoute();
}

export function removeTrade(tradeId: string): void {
	currentRouteStore.update((s) => {
		if (!s) return s;
		return { ...s, trades: s.trades.filter((t) => t.id !== tradeId) };
	});
	debouncedSaveCurrentRoute();
}

export function clearRoute(): void {
	currentRouteStore.set(null);
	// Force-flush the empty state immediately rather than waiting for debounce
	invoke("save_barter_route_current", { data: null }).catch((e) =>
		console.error("Failed to clear current route:", e)
	);
}

export function refillParley(amount: number): { applied: number; capped: number } {
	const session = get(currentRouteStore);
	if (!session) return { applied: 0, capped: 0 };
	const totalCost = totalParleySpent(session);
	const currentRem = Math.max(0, session.parleyMax + session.parleyRefilled - totalCost);
	const headroom = session.parleyMax - currentRem;
	const applied = Math.min(amount, headroom);
	const capped = amount - applied;
	if (applied <= 0) return { applied: 0, capped: amount };
	currentRouteStore.update((s) => (s ? { ...s, parleyRefilled: s.parleyRefilled + applied } : s));
	debouncedSaveCurrentRoute();
	return { applied, capped };
}

// ============== Parley cost helpers (shared with ParleyCalculator) ==============

export function getMasteryReduction(level: string, mastery: ParleyMasteryData | null): number {
	if (!mastery) return 0;
	return mastery.levels.find((e) => e.level === level)?.reduction ?? 0;
}

export function effectiveParleyCost(
	costKey: ParleyCostKey,
	mastery: ParleyMasteryData | null,
	barterLevel: string,
	hasValuePack: boolean,
): number {
	if (!mastery) return 0;
	const base = mastery.baseCosts[costKey] ?? mastery.baseCosts.regular;
	const reduction = getMasteryReduction(barterLevel, mastery);
	const vpMul = hasValuePack ? 0.9 : 1.0;
	return Math.floor(base * (1 - reduction) * vpMul);
}

/** Sum of effective parley spent across all trades in a session, using session-snapshot level/VP */
export function totalParleySpent(session: RouteSession): number {
	const mastery = get(parleyMasteryStore);
	if (!mastery) return 0;
	let total = 0;
	for (const trade of session.trades) {
		const node = getEffectiveNode(trade.nodeId);
		if (!node) continue;
		const perBarter = effectiveParleyCost(
			node.parleyCostKey,
			mastery,
			session.barterLevelAtStart,
			session.hasValuePackAtStart,
		);
		total += perBarter * trade.qty;
	}
	return total;
}

// ============== Item lookup / autocomplete ==============

export interface TradeDefaults {
	tier: BarterTier;
	silverPerUnit: number;
	sp: boolean;
	itemId?: string;
}

/** Case-insensitive prefix-then-substring search, capped at `limit` */
export function findItemsByName(query: string, limit = 12): BarterItemDef[] {
	const data = get(barterItemsStore);
	if (!data || !query.trim()) return [];
	const q = query.trim().toLowerCase();
	const prefix: BarterItemDef[] = [];
	const sub: BarterItemDef[] = [];
	for (const item of data.items) {
		const lower = item.name.toLowerCase();
		if (lower.startsWith(q)) prefix.push(item);
		else if (lower.includes(q)) sub.push(item);
		if (prefix.length >= limit) break;
	}
	return [...prefix, ...sub].slice(0, limit);
}

/**
 * Resolve trade defaults from a known barter item id + the node's region.
 * Margoria-region nodes use the elevated great-ocean sell price for items flagged greatOcean.
 */
export function lookupTradeDefaults(itemId: string, nodeRegion: IslandRegion): TradeDefaults | null {
	const data = get(barterItemsStore);
	if (!data) return null;
	const item = data.items.find((i) => i.id === itemId);
	if (!item) return null;
	const tierProp = data.tierProperties[String(item.tier)];
	let silverPerUnit = tierProp?.npcSellPrice ?? 0;
	if (item.greatOcean && nodeRegion === "margoria") {
		silverPerUnit = data.t5GreatOceanNpcSellPrice ?? silverPerUnit;
	}
	return {
		tier: item.tier,
		silverPerUnit,
		sp: SP_ITEM_IDS.has(item.id),
		itemId: item.id,
	};
}

/** Default silver/unit for a tier when the user enters a freeform unknown item name */
export function tierDefaultSilver(tier: BarterTier): number {
	const data = get(barterItemsStore);
	if (!data) return 0;
	return data.tierProperties[String(tier)]?.npcSellPrice ?? 0;
}

// ============== Route Logs ==============

export const routeLogsStore = writable<RouteLog[]>([]);
export const routeLogsLoadingStore = writable<boolean>(true);

export async function loadRouteLogs(): Promise<void> {
	routeLogsLoadingStore.set(true);
	try {
		const logs = await invoke<RouteLog[]>("load_barter_route_log");
		routeLogsStore.set(logs);
		// One-shot legacy migration: if there's a legacy barter_log.json file, fold it in.
		await migrateLegacyLog();
	} catch (error) {
		console.error("Failed to load route logs:", error);
		routeLogsStore.set([]);
	} finally {
		routeLogsLoadingStore.set(false);
	}
}

async function saveRouteLogs(): Promise<void> {
	try {
		const logs = get(routeLogsStore);
		await invoke("save_barter_route_log", { logs });
	} catch (error) {
		console.error("Failed to save route logs:", error);
	}
}

export async function migrateLegacyLog(): Promise<void> {
	try {
		const legacy = await invoke<BarterSession[] | null>("migrate_legacy_barter_log");
		if (!legacy || legacy.length === 0) return;
		// Convert each old session into a no-trade RouteLog with legacy: true
		const converted: RouteLog[] = legacy.map((s) => {
			const startedAt = Date.parse(s.timestamp || s.date) || Date.now();
			return {
				id: s.id,
				date: s.date,
				startedAt,
				endedAt: startedAt,
				durationSeconds: 0,
				trades: [],
				totalSilver: s.silverEarned ?? 0,
				totalQty: s.totalBarters ?? 0,
				visitedNodeIds: [],
				label: undefined,
				parleyMax: s.parleyBudget || PARLEY_MAX_DEFAULT,
				parleySpent: s.parleySpent ?? 0,
				parleyRefilled: 0,
				barterLevelAtStart: s.barterLevel || "Beginner 1",
				hasValuePackAtStart: s.hasValuePack ?? false,
				legacy: true,
			};
		});
		routeLogsStore.update((logs) => [...converted, ...logs]);
		await saveRouteLogs();
		showToast(`Migrated ${converted.length} legacy session${converted.length === 1 ? "" : "s"}`, "success");
	} catch (error) {
		console.error("Legacy log migration failed:", error);
	}
}

export async function finalizeRoute(label?: string): Promise<RouteLog | null> {
	const session = get(currentRouteStore);
	if (!session || session.trades.length === 0) {
		showToast("No trades to log", "error");
		return null;
	}
	const now = Date.now();
	const durationSeconds = elapsedSeconds(session, now);
	const totalSilver = session.trades.reduce((a, t) => a + t.silverPerUnit * t.qty, 0);
	const totalQty = session.trades.reduce((a, t) => a + t.qty, 0);
	const parleySpent = totalParleySpent(session);
	const visitedNodeIds: string[] = [];
	for (const t of session.trades) {
		if (visitedNodeIds.at(-1) !== t.nodeId) visitedNodeIds.push(t.nodeId);
	}
	const log: RouteLog = {
		id: session.id,
		date: new Date(session.startedAt).toISOString().slice(0, 10),
		startedAt: session.startedAt,
		endedAt: now,
		durationSeconds,
		trades: session.trades,
		totalSilver,
		totalQty,
		visitedNodeIds,
		label: label?.trim() || undefined,
		parleyMax: session.parleyMax,
		parleySpent,
		parleyRefilled: session.parleyRefilled,
		barterLevelAtStart: session.barterLevelAtStart,
		hasValuePackAtStart: session.hasValuePackAtStart,
	};

	// Apply inventory auto-sync — only known item ids get credited
	const credits: { id: string; qty: number }[] = [];
	for (const t of session.trades) {
		if (t.receiveItemId) credits.push({ id: t.receiveItemId, qty: t.qty });
	}
	if (credits.length > 0) {
		barterInventoryStore.update((inv) => {
			const items = { ...inv.items };
			for (const c of credits) {
				items[c.id] = (items[c.id] ?? 0) + c.qty;
			}
			return { ...inv, items, lastUpdated: new Date().toISOString() };
		});
		// Persist inventory immediately after a route — bypasses the inventory store's debounce
		invoke("save_barter_inventory", { data: get(barterInventoryStore) }).catch((e) =>
			console.error("Failed to save inventory after route:", e)
		);
	}

	routeLogsStore.update((logs) => [log, ...logs]);
	await saveRouteLogs();
	clearRoute();
	showToast("Route logged", "success");
	return log;
}

export function deleteRouteLog(id: string): void {
	routeLogsStore.update((logs) => logs.filter((l) => l.id !== id));
	saveRouteLogs();
}

export function clearAllRouteLogs(): void {
	routeLogsStore.set([]);
	saveRouteLogs();
}

// ============== UI state (session-only, not persisted) ==============

export const routeEditModeStore = writable<boolean>(false);
export const routeRegionFocusStore = writable<IslandRegion | null>(null);
export const routeOpenNodeStore = writable<string | null>(null);

/** Last 4 unique (nodeId, receiveItemId|receiveName) chips for quick-add — derived from current route trades */
export interface QuickAddChip {
	nodeId: string;
	receiveName: string;
	receiveItemId?: string;
	receiveTier: BarterTier;
	silverPerUnit: number;
	receiveSp?: boolean;
	giveText?: string;
}

export function recentQuickAddChips(session: RouteSession | null): QuickAddChip[] {
	if (!session) return [];
	const seen = new Set<string>();
	const chips: QuickAddChip[] = [];
	for (let i = session.trades.length - 1; i >= 0 && chips.length < 4; i--) {
		const t = session.trades[i];
		const key = `${t.nodeId}::${t.receiveItemId ?? t.receiveName}`;
		if (seen.has(key)) continue;
		seen.add(key);
		chips.push({
			nodeId: t.nodeId,
			receiveName: t.receiveName,
			receiveItemId: t.receiveItemId,
			receiveTier: t.receiveTier,
			silverPerUnit: t.silverPerUnit,
			receiveSp: t.receiveSp,
			giveText: t.giveText,
		});
	}
	return chips;
}
