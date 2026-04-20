/**
 * Crafting planner store — manages plans, tree resolution, shopping lists, and step tracking.
 *
 * Phase 2.1: Cross-catalog recipe index (derived from catalogsStore)
 * Phase 2.2: Tree resolution, shopping list aggregation, step generation, plan management
 */

import { writable, derived, get } from "svelte/store";
import { invoke } from "@tauri-apps/api/core";
import type { Recipe, RecipeCategory } from "$lib/models/recipe.js";
import type {
	PlannerNode,
	CraftingStep,
	ShoppingListItem,
	CraftingPlan,
} from "$lib/models/planner.js";
import type { RecipeCatalog } from "$lib/models/recipe-catalog.js";
import { catalogsStore } from "./recipes.js";
import { inventoryStore } from "./inventory.js";
import { generateId } from "$lib/utils/id.js";

// ============== Types ==============

export interface RecipeIndexEntry {
	recipe: Recipe;
	category: RecipeCategory;
}

export type PlannerView = "tree" | "shopping" | "steps";

// ============== Recipe Index (Phase 2.1) ==============

/** Cross-catalog recipe index for O(1) lookups by name or ID */
export const recipeIndexStore = derived(catalogsStore, ($catalogs) => {
	const index = new Map<string, RecipeIndexEntry>();
	for (const [category, catalog] of $catalogs) {
		for (const recipe of catalog.recipes) {
			const entry: RecipeIndexEntry = {
				recipe,
				category: category as RecipeCategory,
			};
			index.set(recipe.name.toLowerCase(), entry);
			index.set(recipe.id.toLowerCase(), entry);
		}
	}
	return index;
});

/** All recipes across catalogs, sorted by name (for goal selection dropdown) */
export const allRecipesStore = derived(catalogsStore, ($catalogs) => {
	const recipes: Array<{ recipe: Recipe; category: RecipeCategory }> = [];
	for (const [category, catalog] of $catalogs) {
		for (const recipe of catalog.recipes) {
			recipes.push({ recipe, category: category as RecipeCategory });
		}
	}
	return recipes.sort((a, b) => a.recipe.name.localeCompare(b.recipe.name));
});

// ============== Helper Functions ==============

/** Look up a recipe by ingredient itemId with fuzzy matching */
function lookupRecipe(
	itemId: string,
	index: Map<string, RecipeIndexEntry>,
): RecipeIndexEntry | undefined {
	const lower = itemId.toLowerCase();
	let entry = index.get(lower);
	if (entry) return entry;

	entry = index.get(lower.replace(/_/g, " "));
	if (entry) return entry;

	entry = index.get(lower.replace(/ /g, "_"));
	return entry;
}

/** Get inventory quantity with normalized key lookup */
function getInvQty(itemId: string, inventory: Map<string, number>): number {
	const lower = itemId.toLowerCase();
	return (
		inventory.get(lower) ??
		inventory.get(lower.replace(/_/g, " ")) ??
		inventory.get(lower.replace(/ /g, "_")) ??
		0
	);
}

/** Find item display info (name + image) across all catalogs */
function findItemInfo(
	itemId: string,
	catalogs: Map<string, RecipeCatalog>,
): { name: string; image?: string } {
	for (const catalog of catalogs.values()) {
		const item = catalog.itemFor(itemId);
		if (item.image) {
			return { name: item.name, image: item.image };
		}
	}
	return { name: itemId.replace(/_/g, " ") };
}

// ============== Plan State ==============

/** All saved plans */
export const plannerPlansStore = writable<CraftingPlan[]>([]);

/** Currently active plan ID */
export const activePlanIdStore = writable<string | null>(null);

/** Active plan derived from plans + active ID */
export const activePlanStore = derived(
	[plannerPlansStore, activePlanIdStore],
	([$plans, $activeId]) => $plans.find((p) => p.id === $activeId) ?? null,
);

/** Inventory-aware toggle: true = "Still Needed" (cascading deductions), false = "Total" */
export const inventoryAwareStore = writable<boolean>(true);

/** Active planner sub-view */
export const plannerViewStore = writable<PlannerView>("tree");

/**
 * Expanded-node IDs keyed by plan ID. Stored as string[] (not Set) so writable
 * reactivity triggers cleanly and we can structured-clone. Runtime-only — not
 * persisted across app restarts.
 */
export const plannerExpandedNodesStore = writable<Record<string, string[]>>({});

/** Runtime-only recipe search text for the "new plan" flow. */
export const plannerRecipeSearchStore = writable<string>("");

/** Navigation target for jump-to-craft (consumed by +page.svelte) */
export const navigateToRecipeStore = writable<{
	recipe: Recipe;
	category: RecipeCategory;
} | null>(null);

// ============== Expansion Helpers ==============

export function getExpandedSet(planId: string | null): Set<string> {
	if (!planId) return new Set();
	const map = get(plannerExpandedNodesStore);
	return new Set(map[planId] ?? []);
}

export function setExpandedSet(planId: string | null, nodes: Set<string>): void {
	if (!planId) return;
	plannerExpandedNodesStore.update((m) => ({ ...m, [planId]: Array.from(nodes) }));
}

export function toggleExpanded(planId: string | null, nodeId: string): void {
	if (!planId) return;
	plannerExpandedNodesStore.update((m) => {
		const cur = new Set(m[planId] ?? []);
		if (cur.has(nodeId)) cur.delete(nodeId);
		else cur.add(nodeId);
		return { ...m, [planId]: Array.from(cur) };
	});
}

// ============== Tree Resolution Algorithm ==============

/**
 * Recursively resolve a recipe's dependency tree.
 *
 * In inventory-aware mode, quantities cascade: if you already have some of
 * an intermediate recipe, its children's quantities are proportionally reduced.
 */
function resolveTree(
	recipe: Recipe,
	quantity: number,
	index: Map<string, RecipeIndexEntry>,
	catalogs: Map<string, RecipeCatalog>,
	inventory: Map<string, number>,
	inventoryAware: boolean,
	visited: Set<string>,
): PlannerNode {
	// Circular dependency detection
	if (visited.has(recipe.id)) {
		return {
			id: recipe.id,
			name: `${recipe.name} (circular)`,
			image: recipe.image,
			quantityNeeded: quantity,
			quantityPerCraft: 0,
			inventoryQuantity: 0,
			deficit: quantity,
			isLeaf: true,
			isRecipe: false,
			children: [],
		};
	}

	visited.add(recipe.id);

	const entry = lookupRecipe(recipe.id, index);
	const category = entry?.category;
	const inventoryQty = getInvQty(recipe.name, inventory);

	// Cascading deduction: if we have some of this recipe, reduce child quantities
	const effectiveQuantity = inventoryAware
		? Math.max(0, quantity - inventoryQty)
		: quantity;

	const deficit = Math.max(0, quantity - inventoryQty);

	const children: PlannerNode[] = [];

	for (const ingredient of recipe.ingredients) {
		const childQuantity = ingredient.amount * effectiveQuantity;
		const childEntry = lookupRecipe(ingredient.itemId, index);

		if (childEntry) {
			// Craftable recipe — recurse
			const child = resolveTree(
				childEntry.recipe,
				childQuantity,
				index,
				catalogs,
				inventory,
				inventoryAware,
				visited,
			);
			child.quantityPerCraft = ingredient.amount;
			children.push(child);
		} else {
			// Leaf node — raw material
			const itemInfo = findItemInfo(ingredient.itemId, catalogs);
			const leafInvQty = getInvQty(ingredient.itemId, inventory);

			children.push({
				id: ingredient.itemId,
				name: itemInfo.name,
				image: itemInfo.image,
				quantityNeeded: childQuantity,
				quantityPerCraft: ingredient.amount,
				inventoryQuantity: leafInvQty,
				deficit: Math.max(0, childQuantity - leafInvQty),
				isLeaf: true,
				isRecipe: false,
				children: [],
			});
		}
	}

	visited.delete(recipe.id);

	return {
		id: recipe.id,
		name: recipe.name,
		image: recipe.image,
		category,
		quantityNeeded: quantity,
		quantityPerCraft: 1,
		inventoryQuantity: inventoryQty,
		deficit,
		isLeaf: false,
		isRecipe: true,
		children,
	};
}

// ============== Leaf Aggregation (Shopping List) ==============

/** Recursively aggregate all leaf materials from the dependency tree */
function aggregateLeaves(
	node: PlannerNode,
	result: Map<string, ShoppingListItem>,
): void {
	if (node.isLeaf) {
		const key = node.id.toLowerCase();
		const existing = result.get(key);
		if (existing) {
			existing.quantityNeeded += node.quantityNeeded;
			existing.deficit = Math.max(
				0,
				existing.quantityNeeded - existing.inventoryQuantity,
			);
		} else {
			result.set(key, {
				itemId: node.id,
				name: node.name,
				image: node.image,
				quantityNeeded: node.quantityNeeded,
				inventoryQuantity: node.inventoryQuantity,
				deficit: node.deficit,
			});
		}
		return;
	}

	for (const child of node.children) {
		aggregateLeaves(child, result);
	}
}

// ============== Step Generation (Bottom-Up) ==============

/** Compute the maximum depth for each recipe node in the tree */
function computeDepths(
	node: PlannerNode,
	depth: number,
	depths: Map<string, number>,
): void {
	if (!node.isRecipe) return;

	const key = node.id.toLowerCase();
	depths.set(key, Math.max(depths.get(key) ?? 0, depth));

	for (const child of node.children) {
		computeDepths(child, depth + 1, depths);
	}
}

/** Collect all recipe nodes as crafting steps, aggregating duplicate recipes */
function collectSteps(
	node: PlannerNode,
	result: Map<string, CraftingStep>,
): void {
	if (!node.isRecipe) return;

	// Collect children first (deeper levels)
	for (const child of node.children) {
		collectSteps(child, result);
	}

	const key = node.id.toLowerCase();
	const existing = result.get(key);
	if (existing) {
		// Same recipe in multiple branches — aggregate quantities
		existing.quantity += node.quantityNeeded;
		for (const ing of existing.ingredients) {
			const matchChild = node.children.find(
				(c) => c.id.toLowerCase() === ing.itemId.toLowerCase(),
			);
			if (matchChild) {
				ing.totalAmount += matchChild.quantityNeeded;
			}
		}
	} else {
		result.set(key, {
			recipeId: node.id,
			recipeName: node.name,
			category: node.category!,
			image: node.image,
			quantity: node.quantityNeeded,
			ingredients: node.children.map((child) => ({
				itemId: child.id,
				name: child.name,
				amount: child.quantityPerCraft,
				totalAmount: child.quantityNeeded,
			})),
			depth: 0,
			completed: false,
		});
	}
}

// ============== Derived Computed Stores ==============

/** Resolved dependency tree for the active plan */
export const plannerTreeStore = derived(
	[
		activePlanStore,
		recipeIndexStore,
		catalogsStore,
		inventoryStore,
		inventoryAwareStore,
	],
	([$plan, $index, $catalogs, $inventory, $inventoryAware]) => {
		if (!$plan || $index.size === 0) return null;

		const entry =
			lookupRecipe($plan.goalRecipeId, $index) ??
			lookupRecipe($plan.goalRecipeName, $index);
		if (!entry) return null;

		return resolveTree(
			entry.recipe,
			$plan.goalQuantity,
			$index,
			$catalogs,
			$inventory,
			$inventoryAware,
			new Set(),
		);
	},
);

/** Aggregated shopping list of leaf materials, sorted by deficit */
export const shoppingListStore = derived(plannerTreeStore, ($tree) => {
	if (!$tree) return [];

	const leaves = new Map<string, ShoppingListItem>();
	aggregateLeaves($tree, leaves);

	return Array.from(leaves.values()).sort((a, b) => {
		// Deficit items first (most needed), then fulfilled, then alphabetical
		if (a.deficit !== b.deficit) return b.deficit - a.deficit;
		return a.name.localeCompare(b.name);
	});
});

/** Ordered crafting steps (deepest first = craft first) with completion status */
export const craftingStepsStore = derived(
	[plannerTreeStore, activePlanStore],
	([$tree, $plan]) => {
		if (!$tree || !$plan) return [];

		const depths = new Map<string, number>();
		computeDepths($tree, 0, depths);

		const stepsMap = new Map<string, CraftingStep>();
		collectSteps($tree, stepsMap);

		const steps = Array.from(stepsMap.values());
		for (const step of steps) {
			step.depth = depths.get(step.recipeId.toLowerCase()) ?? 0;
			step.completed = $plan.completedSteps.includes(step.recipeId);
		}

		// Filter out 0-quantity steps (already fulfilled in inventory-aware mode)
		// Sort by depth descending (deepest = craft first)
		return steps
			.filter((s) => s.quantity > 0)
			.sort((a, b) => b.depth - a.depth);
	},
);

// ============== Plan Management Actions ==============

/** Create a new plan and set it as active */
export function createPlan(
	goalRecipeId: string,
	goalRecipeName: string,
	goalCategory: RecipeCategory,
	goalQuantity: number,
): void {
	const plan: CraftingPlan = {
		id: generateId(),
		goalRecipeId,
		goalRecipeName,
		goalCategory,
		goalQuantity,
		completedSteps: [],
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
	};

	plannerPlansStore.update((plans) => [...plans, plan]);
	// Seed expansion with the goal recipe expanded so the tree opens useful by default
	plannerExpandedNodesStore.update((m) => ({ ...m, [plan.id]: [goalRecipeId] }));
	activePlanIdStore.set(plan.id);
	debouncedSavePlanner();
}

/** Delete a plan by ID */
export function deletePlan(planId: string): void {
	plannerPlansStore.update((plans) => plans.filter((p) => p.id !== planId));
	activePlanIdStore.update((id) => (id === planId ? null : id));
	plannerExpandedNodesStore.update((m) => {
		const { [planId]: _removed, ...rest } = m;
		return rest;
	});
	debouncedSavePlanner();
}

/** Set the active plan */
export function setActivePlan(planId: string | null): void {
	activePlanIdStore.set(planId);
	debouncedSavePlanner();
}

/** Update goal quantity for the active plan */
export function setGoalQuantity(quantity: number): void {
	const activeId = get(activePlanIdStore);
	if (!activeId) return;

	plannerPlansStore.update((plans) =>
		plans.map((p) =>
			p.id === activeId
				? {
						...p,
						goalQuantity: Math.max(1, quantity),
						updatedAt: new Date().toISOString(),
					}
				: p,
		),
	);
	debouncedSavePlanner();
}

/** Toggle step completion for the active plan */
export function toggleStep(recipeId: string): void {
	const activeId = get(activePlanIdStore);
	if (!activeId) return;

	plannerPlansStore.update((plans) =>
		plans.map((p) => {
			if (p.id !== activeId) return p;
			const completed = p.completedSteps.includes(recipeId)
				? p.completedSteps.filter((id) => id !== recipeId)
				: [...p.completedSteps, recipeId];
			return {
				...p,
				completedSteps: completed,
				updatedAt: new Date().toISOString(),
			};
		}),
	);
	debouncedSavePlanner();
}

// ============== Persistence ==============

let plannerSaveTimeout: ReturnType<typeof setTimeout> | null = null;

function debouncedSavePlanner(): void {
	if (plannerSaveTimeout) clearTimeout(plannerSaveTimeout);
	plannerSaveTimeout = setTimeout(async () => {
		try {
			const plans = get(plannerPlansStore);
			const activePlanId = get(activePlanIdStore) ?? null;
			await invoke("save_planner", { plans, activePlanId });
		} catch (error) {
			console.error("Failed to save planner:", error);
		}
	}, 500);
}

/** Load planner data from disk */
export async function loadPlannerData(): Promise<void> {
	try {
		const data = await invoke<{ plans: CraftingPlan[]; activePlanId: string | null }>("load_planner");
		plannerPlansStore.set(data.plans);
		if (data.activePlanId && data.plans.some((p) => p.id === data.activePlanId)) {
			activePlanIdStore.set(data.activePlanId);
		} else if (data.plans.length > 0) {
			activePlanIdStore.set(data.plans[0].id);
		}
	} catch (error) {
		console.error("Failed to load planner data:", error);
	}
}
