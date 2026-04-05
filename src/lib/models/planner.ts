/**
 * Crafting planner data models
 * Used by the planner store for tree resolution, shopping lists, and step tracking.
 */

import type { RecipeCategory } from "./recipe.js";

/** Recursive dependency tree node */
export interface PlannerNode {
	id: string;
	name: string;
	image?: string;
	category?: RecipeCategory;
	quantityNeeded: number;
	quantityPerCraft: number;
	inventoryQuantity: number;
	deficit: number;
	isLeaf: boolean;
	isRecipe: boolean;
	children: PlannerNode[];
}

/** Ingredient summary within a crafting step */
export interface StepIngredient {
	itemId: string;
	name: string;
	amount: number;
	totalAmount: number;
}

/** A single crafting step (one recipe to craft) */
export interface CraftingStep {
	recipeId: string;
	recipeName: string;
	category: RecipeCategory;
	image?: string;
	quantity: number;
	ingredients: StepIngredient[];
	depth: number;
	completed: boolean;
}

/** Aggregated leaf material for the shopping list */
export interface ShoppingListItem {
	itemId: string;
	name: string;
	image?: string;
	quantityNeeded: number;
	inventoryQuantity: number;
	deficit: number;
}

/** Persisted plan (saved to data/planner.json) */
export interface CraftingPlan {
	id: string;
	goalRecipeId: string;
	goalRecipeName: string;
	goalCategory: RecipeCategory;
	goalQuantity: number;
	completedSteps: string[];
	createdAt: string;
	updatedAt: string;
}

/** Planner persistence file format */
export interface PlannerFile {
	plans: CraftingPlan[];
}
