/**
 * Recipe store - manages loaded recipe catalogs, search, and filtering.
 */

import { writable, derived } from "svelte/store";
import type { RecipeCatalog, Recipe, RecipeCategory } from "$lib/models";
import { settingsStore } from "./settings";

/** All loaded recipe catalogs keyed by category */
export const catalogsStore = writable<Map<string, RecipeCatalog>>(new Map());

/** Currently active recipe category (cooking/alchemy/draughts) */
export const activeCategoryStore = writable<RecipeCategory>("cooking");

/** Active catalog derived from catalogs + active category */
export const activeCatalogStore = derived(
	[catalogsStore, activeCategoryStore],
	([$catalogs, $activeCategory]) => $catalogs.get($activeCategory) ?? null
);

/** Currently selected recipe */
export const selectedRecipeStore = writable<Recipe | null>(null);

/** Recipe search text */
export const searchTextStore = writable<string>("");

/** Whether to show only favorited recipes */
export const showOnlyFavoritesStore = writable<boolean>(false);

/** Favorite recipe IDs, derived from the persisted settings store (single source of truth) */
export const favoritesStore = derived(settingsStore, ($s) => new Set($s.favorites));

/** Filtered recipes based on active catalog, search text, and favorites filter */
export const filteredRecipesStore = derived(
	[activeCatalogStore, searchTextStore, showOnlyFavoritesStore, favoritesStore],
	([$catalog, $searchText, $showOnlyFavorites, $favorites]) => {
		if (!$catalog) return [];

		let recipes = $catalog.recipes;

		// Filter by favorites
		if ($showOnlyFavorites) {
			recipes = recipes.filter((r) => $favorites.has(r.id));
		}

		// Filter by search text
		if ($searchText.trim()) {
			const searchLower = $searchText.toLowerCase();
			recipes = recipes.filter(
				(r) =>
					r.name.toLowerCase().includes(searchLower) ||
					r.tags?.some((tag) => tag.toLowerCase().includes(searchLower)) ||
					r.effect?.toLowerCase().includes(searchLower) ||
					r.ingredients.some((ing) => {
						const item = $catalog.itemFor(ing.itemId);
						return item.name.toLowerCase().includes(searchLower);
					})
			);
		}

		return recipes.sort((a, b) => a.name.localeCompare(b.name));
	}
);
