/**
 * Rolls a ship upgrade path up into a single material list.
 *
 * The tracker stores a have-count per *stage material id* (`sturdy_coral_support_cannon`),
 * but the same item is consumed by several stages. Totals therefore group on `baseId`,
 * the canonical item key added to ship-upgrades.json v2.
 *
 * Pure functions only — no stores, no fetch. Keeps the arithmetic testable.
 */

import type {
	MaterialSource,
	ShipMaterialRecipe,
	ShipMaterialRecipesData,
	ShipProgress,
	ShipUpgradePathDef,
} from "$lib/models/bartering";

export interface ShipIngredientTotal {
	id: string;
	name: string;
	/** How many this recipe (or the whole list) needs */
	amount: number;
	/** How many the player has recorded holding */
	held: number;
	/** max(0, amount - held) — what is actually still missing */
	short: number;
	source: MaterialSource;
	image?: string;
}

export interface ShipMaterialTotal {
	baseId: string;
	name: string;
	source: MaterialSource;
	image?: string;
	/** Summed across every stage that is not marked complete */
	needed: number;
	/** Summed have-counts, each capped at that stage's requirement */
	have: number;
	/** max(0, needed - have) */
	remaining: number;
	/**
	 * The quantity the recipe expansion is computed from: `remaining` normally,
	 * `needed` when asked for the whole-path total — so the ingredient list always
	 * answers the same question as the header above it.
	 */
	basis: number;
	/** Stage ids still asking for this item */
	stageIds: string[];
	recipe?: ShipMaterialRecipe;
	/** Ingredients scaled to cover `basis`. Empty when the item has no recipe. */
	ingredients: ShipIngredientTotal[];
	/** Crafts required to cover `basis` */
	crafts: number;
	/**
	 * How many crafts the held ingredients can cover right now, capped at `crafts`.
	 *
	 * Optimistic when a reagent is shared: Starlight Hardener feeds all three coral
	 * recipes, and this figure assumes every one of them goes to THIS craft. The
	 * honest cross-recipe view is the `rollUpIngredients` shortfall.
	 */
	craftableNow: number;
	/**
	 * A stage in this same path that produces the item. Present for the +10 gear,
	 * whose materials are already tracked as their own stage — the UI links there
	 * rather than expanding, which would double-count.
	 */
	producedByStageId?: string;
}

/** Craft first (deepest chain), then the routes the player has least control over. */
const SOURCE_ORDER: Record<MaterialSource, number> = {
	craft: 0,
	barter: 1,
	crowCoin: 2,
	drop: 3,
	daily: 4,
	buy: 5,
};

/**
 * @param includeCompleted when true, completed stages still contribute their
 *        requirement (a gross "whole path" total instead of what is left)
 */
export function computeShipMaterialTotals(
	path: ShipUpgradePathDef | undefined,
	progress: ShipProgress,
	recipes: ShipMaterialRecipesData | null,
	includeCompleted = false,
	held: Record<string, number> = {},
): ShipMaterialTotal[] {
	if (!path) return [];

	const stageIdsInPath = new Set(path.stages.map((s) => s.id));
	const byBase = new Map<string, ShipMaterialTotal>();

	for (const stage of path.stages) {
		const stageDone = progress.completedStages[stage.id] ?? false;
		if (stageDone && !includeCompleted) continue;

		for (const mat of stage.materials) {
			const baseId = mat.baseId ?? mat.id;
			let total = byBase.get(baseId);
			if (!total) {
				total = {
					baseId,
					name: mat.name,
					source: mat.source,
					image: mat.image,
					needed: 0,
					have: 0,
					remaining: 0,
					basis: 0,
					stageIds: [],
					ingredients: [],
					crafts: 0,
					craftableNow: 0,
				};
				byBase.set(baseId, total);
			}
			total.needed += mat.needed;
			// A completed stage counts as fully stocked, matching the progress bars.
			total.have += stageDone
				? mat.needed
				: Math.min(progress.materials[mat.id] ?? 0, mat.needed);
			total.stageIds.push(stage.id);
		}
	}

	for (const total of byBase.values()) {
		total.remaining = Math.max(0, total.needed - total.have);
		total.basis = includeCompleted ? total.needed : total.remaining;

		const recipe = recipes?.recipes[total.baseId];
		if (!recipe) continue;
		total.recipe = recipe;

		const producedBy = recipe.producedByStage?.find((id) => stageIdsInPath.has(id));
		if (producedBy) total.producedByStageId = producedBy;

		if (recipe.ingredients.length > 0) {
			const perCraft = recipe.yield > 0 ? recipe.yield : 1;
			total.crafts = Math.ceil(total.basis / perCraft);
			total.ingredients = recipe.ingredients.map((ing) => {
				const amount = total.crafts * ing.amount;
				const have = Math.max(0, held[ing.id] ?? 0);
				return {
					id: ing.id,
					name: ing.name,
					amount,
					held: have,
					short: Math.max(0, amount - have),
					source: ing.source,
					image: ing.image,
				};
			});
			total.craftableNow = Math.min(
				total.crafts,
				...recipe.ingredients.map((ing) =>
					ing.amount > 0 ? Math.floor(Math.max(0, held[ing.id] ?? 0) / ing.amount) : total.crafts,
				),
			);
		}
	}

	return [...byBase.values()].sort((a, b) => {
		const bySource = SOURCE_ORDER[a.source] - SOURCE_ORDER[b.source];
		if (bySource !== 0) return bySource;
		if (b.basis !== a.basis) return b.basis - a.basis;
		return a.name.localeCompare(b.name);
	});
}

/**
 * Flattens every expanded recipe into one shopping list — what the player
 * actually has to gather, with intermediates dissolved away.
 */
export function rollUpIngredients(totals: ShipMaterialTotal[]): ShipIngredientTotal[] {
	const byId = new Map<string, ShipIngredientTotal>();

	for (const total of totals) {
		for (const ing of total.ingredients) {
			const existing = byId.get(ing.id);
			// `held` is one stack, so it must NOT accumulate the way `amount` does.
			if (existing) existing.amount += ing.amount;
			else byId.set(ing.id, { ...ing });
		}
	}

	// Shortfall is only meaningful once every recipe's demand is summed — this is
	// the figure that accounts for reagents shared between recipes.
	for (const ing of byId.values()) ing.short = Math.max(0, ing.amount - ing.held);

	return [...byId.values()].sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
}

/** Batches of `massProcess.batch` crafts, rounded up — what you queue in one go. */
export function massProcessBatches(total: ShipMaterialTotal): number | undefined {
	const batch = total.recipe?.massProcess?.batch;
	if (!batch || total.crafts <= 0) return undefined;
	return Math.ceil(total.crafts / batch);
}
