export type BarterTier = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** Barter levels (Beginner 1 through Guru 50) — subset of LIFE_SKILL_RANKS */
export const BARTER_LEVELS: readonly string[] = [
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
] as const;

/** Shared tier color/style config */
export const TIER_COLORS: Record<BarterTier, { color: string; bg: string; border: string }> = {
	1: { color: "text-gray-300", bg: "bg-gray-500/20 border-gray-500/40", border: "border-l-gray-400" },
	2: { color: "text-green-400", bg: "bg-green-500/20 border-green-500/40", border: "border-l-green-400" },
	3: { color: "text-blue-400", bg: "bg-blue-500/20 border-blue-500/40", border: "border-l-blue-400" },
	4: { color: "text-yellow-400", bg: "bg-yellow-500/20 border-yellow-500/40", border: "border-l-yellow-400" },
	5: { color: "text-orange-400", bg: "bg-orange-500/20 border-orange-500/40", border: "border-l-orange-400" },
	6: { color: "text-purple-400", bg: "bg-purple-500/20 border-purple-500/40", border: "border-l-purple-400" },
	7: { color: "text-red-400", bg: "bg-red-500/20 border-red-500/40", border: "border-l-red-400" },
};

export interface BarterItemDef {
	id: string;
	name: string;
	tier: BarterTier;
	codexId?: number;
	image?: string;
	greatOcean?: boolean;
}

export interface TierProperties {
	weight: number;
	npcSellPrice: number;
}

export interface BarterItemsData {
	version: number;
	category: string;
	totalItems: number;
	tierProperties: Record<string, TierProperties>;
	t5GreatOceanNpcSellPrice: number;
	items: BarterItemDef[];
}

export interface ParleyMasteryEntry {
	level: string;
	reduction: number;
}

export interface ParleyBaseCosts {
	regular: number;
	crowCoin: number;
	kashuma: number;
	halmad: number;
	derko: number;
	hakoven: number;
	margoriaLow: number;
	margoriaHigh: number;
}

export interface ParleyMasteryData {
	version: number;
	baseCosts: ParleyBaseCosts;
	levels: ParleyMasteryEntry[];
}

export interface LandGood {
	id: string;
	name: string;
	marketId?: number;
	amountPer1: number;
	amountPer10: number;
}

export interface LandGoodsData {
	version: number;
	items: LandGood[];
}

// ============== Inventory ==============

export interface BarterInventory {
	items: Record<string, number>;
	crowCoins: number;
	lastUpdated: string;
}

// ============== Session Logging ==============

export interface BarterSession {
	id: string;
	date: string;
	timestamp: string;
	barterLevel: string;
	hasValuePack: boolean;
	parleyBudget: number;
	parleySpent: number;
	totalBarters: number;
	refreshesUsed: number;
	t1Barters?: number;
	t2Barters?: number;
	t3Barters?: number;
	t4Barters?: number;
	t5Barters?: number;
	t6Barters?: number;
	t7Barters?: number;
	t5Sold: number;
	t5SoldMargoria: number;
	t6Sold: number;
	t7Sold: number;
	crowCoinsEarned: number;
	silverEarned: number;
	silverInvested: number;
	netProfit: number;
	notes?: string;
}

// ============== Ship Progression ==============

export type CarrackVariant = "advance" | "balance" | "volante" | "valor";
export type MaterialSource = "barter" | "crowCoin" | "daily" | "craft" | "drop" | "buy";

export interface ShipMaterialDef {
	id: string;
	name: string;
	needed: number;
	source: MaterialSource;
}

export interface ShipUpgradeStageDef {
	id: string;
	name: string;
	pieceName: string;
	materials: ShipMaterialDef[];
}

export interface ShipUpgradePathDef {
	variant: CarrackVariant;
	baseShip: "caravel" | "galleass";
	label: string;
	description: string;
	stages: ShipUpgradeStageDef[];
}

export interface ShipUpgradesData {
	version: number;
	paths: ShipUpgradePathDef[];
}

export interface ShipStatsTier {
	hp: number;
	rations: number;
	weight: number;
	speed: number;
	accel: number;
	turn: number;
	brake: number;
	inventory: number;
	cabins: number;
	cannons: number;
	reloadSeconds: number;
}

export interface ShipVariantStats {
	variant: CarrackVariant;
	label: string;
	bestFor: string;
	tiers: {
		base: ShipStatsTier;
		"green+10": ShipStatsTier;
		"blue+10": ShipStatsTier;
	};
}

export interface ShipStatsData {
	version: number;
	variants: ShipVariantStats[];
}

// ============== Sailors ==============

export type SailorStatus = "below_average" | "average" | "above_average";

export interface Sailor {
	id: string;
	name: string;
	level: number;
	speed: number;
	status: SailorStatus;
	notes?: string;
}

export interface SailorRoster {
	sailors: Sailor[];
}

/** Sailor speed projection table — min/median/max per level */
export const SAILOR_SPEED_TABLE: { level: number; min: number; median: number; max: number; maxRoll: number; medianRoll: number }[] = [
	{ level: 1, min: 1.2, median: 1.2, max: 1.2, maxRoll: 0.2, medianRoll: 0.15 },
	{ level: 2, min: 1.3, median: 1.35, max: 1.4, maxRoll: 0.2, medianRoll: 0.15 },
	{ level: 3, min: 1.4, median: 1.5, max: 1.6, maxRoll: 0.3, medianRoll: 0.2 },
	{ level: 4, min: 1.5, median: 1.7, max: 1.9, maxRoll: 0.3, medianRoll: 0.2 },
	{ level: 5, min: 1.6, median: 1.9, max: 2.2, maxRoll: 0.4, medianRoll: 0.25 },
	{ level: 6, min: 1.7, median: 2.15, max: 2.6, maxRoll: 0.4, medianRoll: 0.25 },
	{ level: 7, min: 1.8, median: 2.4, max: 3.0, maxRoll: 0.4, medianRoll: 0.25 },
	{ level: 8, min: 1.9, median: 2.65, max: 3.4, maxRoll: 0.4, medianRoll: 0.25 },
	{ level: 9, min: 2.0, median: 2.9, max: 3.8, maxRoll: 0.5, medianRoll: 0.3 },
	{ level: 10, min: 2.1, median: 3.2, max: 4.3, maxRoll: 0, medianRoll: 0 },
];

/** User's material progress for a single upgrade path */
export interface ShipProgress {
	variant: CarrackVariant;
	/** materialId -> quantity the user currently has */
	materials: Record<string, number>;
	/** stageId -> completed flag */
	completedStages: Record<string, boolean>;
}

// ============== Routes & Logs (spatial route tracker) ==============

export type IslandRegion = "inner" | "alHalam" | "morningLight" | "margoria" | "kamasylvia";

/** Keys into ParleyBaseCosts — drives effective parley cost per node */
export type ParleyCostKey =
	| "regular"
	| "crowCoin"
	| "kashuma"
	| "halmad"
	| "derko"
	| "hakoven"
	| "margoriaLow"
	| "margoriaHigh";

/** A barter destination on the map (island, NPC vessel, etc.) */
export interface IslandNode {
	id: string;
	name: string;
	tier: BarterTier;
	region: IslandRegion;
	x: number;
	y: number;
	parleyCostKey: ParleyCostKey;
}

export interface IslandsData {
	version: number;
	nodes: IslandNode[];
}

/** A single barter trade row in the live ledger */
export interface Trade {
	id: string;
	ts: number;
	nodeId: string;
	receiveName: string;
	receiveTier: BarterTier;
	receiveSp?: boolean;
	qty: number;
	silverPerUnit: number;
	giveText?: string;
	/** barter-items.json item id, if the receive name matched a known item */
	receiveItemId?: string;
}

/** The in-progress route session — only one exists at a time */
export interface RouteSession {
	id: string;
	startedAt: number;
	trades: Trade[];
	parleyMax: number;
	parleyRefilled: number;
	barterLevelAtStart: string;
	hasValuePackAtStart: boolean;
	/** Total ms the timer was paused — subtracted from elapsed at finalize time */
	pausedMs: number;
	/** ms epoch of last pause start, or null if running */
	pausedAt: number | null;
}

/** A finalized route, persisted in the log */
export interface RouteLog {
	id: string;
	date: string;
	startedAt: number;
	endedAt: number;
	durationSeconds: number;
	trades: Trade[];
	totalSilver: number;
	totalQty: number;
	visitedNodeIds: string[];
	label?: string;
	parleyMax: number;
	parleySpent: number;
	parleyRefilled: number;
	barterLevelAtStart: string;
	hasValuePackAtStart: boolean;
	/** Migrated from pre-Routes barter_log.json — render with no map */
	legacy?: true;
}

/** User-added island not in the shipped data */
export interface CustomNode extends IslandNode {
	custom: true;
}

/** User-mutable map customization (positions + custom nodes).
 * `schemaVersion` bumps when shipped islands.json changes coordinate space,
 * triggering a one-shot wipe of stale positionOverrides on load. */
export interface BarterMapLayout {
	schemaVersion?: number;
	positionOverrides: Record<string, { x: number; y: number }>;
	customNodes: CustomNode[];
}

/** Bump whenever shipped islands.json coords change in a way that invalidates user overrides. */
export const BARTER_MAP_LAYOUT_SCHEMA_VERSION = 2;

/** Centroid coordinates per region — used by the region jump buttons.
 * Coords are in the 1400×1050 islands.json space (Iliya at 700,525). */
export const REGION_CENTROIDS: Record<IslandRegion, { x: number; y: number }> = {
	inner: { x: 700, y: 525 },        // Iliya neighborhood (canvas center)
	alHalam: { x: 1100, y: 480 },     // east cluster (Halmad..Arehaza)
	morningLight: { x: 130, y: 270 },  // northwest (Dallae Pier + Haemo)
	margoria: { x: 380, y: 200 },      // floating NPCs in the north
	kamasylvia: { x: 440, y: 890 },    // far south (Grandiha + Starry Midnight)
};

export const REGION_LABELS: Record<IslandRegion, string> = {
	inner: "Inner Sea",
	alHalam: "Al Halam",
	morningLight: "Morning Light",
	margoria: "Margoria",
	kamasylvia: "Kamasylvia",
};
