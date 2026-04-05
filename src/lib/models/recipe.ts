/**
 * Recipe data models
 * Ported from BdoLifeCompanion.Models.RecipeModels
 */

export interface RecipeFile {
	version: number;
	category: string;
	recipes: Recipe[];
	items?: Item[];
}

export interface Recipe {
	id: string;
	name: string;
	category: string;
	image?: string;
	ingredients: IngredientRef[];
	bdolytics_id?: number;
	altNames?: string[];
	effect?: string;
	duration?: string;
	tags?: string[];
}

export interface AlternativeIngredient {
	itemId: string;
	amount: number;
}

export interface IngredientRef {
	itemId: string;
	amount: number;
	alternatives?: AlternativeIngredient[];
}

export interface Item {
	id: string;
	name: string;
	image?: string;
}

/**
 * Type for recipe categories
 */
export type RecipeCategory = "cooking" | "alchemy" | "draughts";
