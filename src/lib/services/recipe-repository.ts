/**
 * Recipe repository service - loads and manages recipe data
 * Ported from BdoLifeCompanion.Services.RecipeRepository
 */

import type { RecipeFile, Recipe, Item, RecipeCategory } from "$lib/models/recipe.js";
import { RecipeCatalog } from "$lib/models/recipe-catalog.js";

export class RecipeRepository {
	/**
	 * Load recipe catalog from JSON data
	 */
	async loadFromUrl(url: string): Promise<RecipeCatalog> {
		const response = await fetch(url);
		if (!response.ok) {
			throw new Error(`Failed to load recipes from ${url}: ${response.statusText}`);
		}

		const file: RecipeFile = await response.json();
		return this.buildCatalog(file);
	}

	/**
	 * Load recipe catalog from a specific category
	 */
	async loadCategory(category: RecipeCategory): Promise<RecipeCatalog> {
		return this.loadFromUrl(`/data/recipes/${category}.json`);
	}

	/**
	 * Load all recipe catalogs
	 */
	async loadAll(): Promise<Map<string, RecipeCatalog>> {
		const categories: RecipeCategory[] = ["cooking", "alchemy", "draughts"];
		const catalogs = new Map<string, RecipeCatalog>();

		await Promise.all(
			categories.map(async (category) => {
				const catalog = await this.loadCategory(category);
				catalogs.set(category, catalog);
			})
		);

		return catalogs;
	}

	/**
	 * Build catalog from recipe file data
	 */
	private buildCatalog(file: RecipeFile): RecipeCatalog {
		const itemsById = new Map<string, Item>();

		// Add explicit items from JSON (case-insensitive keys) if they exist
		if (file.items && Array.isArray(file.items)) {
			for (const item of file.items) {
				itemsById.set(item.id.toLowerCase(), item);
			}
		}

		// Auto-generate items from recipe ingredients (including alternatives)
		const allIngredientIds = new Set<string>();
		for (const recipe of file.recipes) {
			for (const ingredient of recipe.ingredients) {
				allIngredientIds.add(ingredient.itemId);
				if (ingredient.alternatives && Array.isArray(ingredient.alternatives)) {
					for (const alt of ingredient.alternatives) {
						if (typeof alt === 'object' && alt !== null && alt.itemId) {
							allIngredientIds.add(alt.itemId);
						}
					}
				}
			}
		}

		// Generate items for ingredients not explicitly defined
		for (const ingredientId of allIngredientIds) {
			const lowerCaseId = ingredientId.toLowerCase();
			const underscoreId = lowerCaseId.replace(/ /g, "_");

			// Skip if already defined explicitly (check both space and underscore variants)
			if (itemsById.has(lowerCaseId) || itemsById.has(underscoreId)) {
				continue;
			}

			// Generate image path from ingredient ID
			const imagePath = this.convertItemIdToImagePath(ingredientId);

			itemsById.set(lowerCaseId, {
				id: ingredientId,
				name: ingredientId,
				image: imagePath,
			});
		}

		return new RecipeCatalog(file.category, file.recipes, itemsById);
	}

	/**
	 * Convert item ID to image path
	 * - Replace spaces with underscores
	 * - Remove apostrophes
	 * - Add .png extension
	 * - Prefix with "items/"
	 */
	private convertItemIdToImagePath(itemId: string): string {
		const filename = itemId
			.replace(/ /g, "_")
			.replace(/'/g, "")
			.replace(/'/g, ""); // Handle both straight and curly apostrophes

		return `items/${filename}.png`;
	}
}

/**
 * Singleton instance
 */
export const recipeRepository = new RecipeRepository();
