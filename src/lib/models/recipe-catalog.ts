/**
 * Recipe catalog - container for recipes and items
 * Ported from BdoLifeCompanion.Models.RecipeCatalog
 */

import type { Recipe, Item } from "./recipe.js";

export class RecipeCatalog {
	constructor(
		public readonly category: string,
		public readonly recipes: Recipe[],
		public readonly itemsById: Map<string, Item>
	) {}

	/**
	 * Get item by ID with fuzzy matching for underscores/spaces
	 */
	itemFor(id: string): Item {
		// Try exact match first (case-insensitive)
		const lowerCaseId = id.toLowerCase();
		for (const [key, item] of this.itemsById.entries()) {
			if (key.toLowerCase() === lowerCaseId) {
				return item;
			}
		}

		// Try with underscores replaced by spaces
		const withSpaces = id.replace(/_/g, " ");
		for (const [key, item] of this.itemsById.entries()) {
			if (key.toLowerCase() === withSpaces.toLowerCase()) {
				return item;
			}
		}

		// Try with spaces replaced by underscores
		const withUnderscores = id.replace(/ /g, "_");
		for (const [key, item] of this.itemsById.entries()) {
			if (key.toLowerCase() === withUnderscores.toLowerCase()) {
				return item;
			}
		}

		// Fallback: create item with normalized name (spaces instead of underscores)
		const normalizedName = id.replace(/_/g, " ");
		return {
			id,
			name: normalizedName,
		};
	}
}
