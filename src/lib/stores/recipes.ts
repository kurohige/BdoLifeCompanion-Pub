/**
 * Recipe store - manages loaded recipe catalogs, search, and filtering.
 */

import { writable, derived, get } from "svelte/store";
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

/** Currently selected recipe (live — drives the UI) */
export const selectedRecipeStore = writable<Recipe | null>(null);

/**
 * Per-category recipe memory. Each crafting sub-tab remembers the last recipe
 * the user had open so switching cooking → alchemy → cooking restores state.
 * Runtime-only; not persisted.
 */
export const selectedRecipesByCategoryStore = writable<Partial<Record<RecipeCategory, Recipe | null>>>({});

/** Per-category recipe search text. Remembers filter state per sub-tab. */
export const searchTextByCategoryStore = writable<Partial<Record<RecipeCategory, string>>>({});

/**
 * Switch active crafting category, saving the current recipe+search to the
 * outgoing category's memory and restoring the incoming category's memory.
 */
export function setActiveCategory(category: RecipeCategory): void {
	const prevCat = get(activeCategoryStore);
	const prevRec = get(selectedRecipeStore);
	const prevSearch = get(searchTextStore);

	selectedRecipesByCategoryStore.update((m) => ({ ...m, [prevCat]: prevRec }));
	searchTextByCategoryStore.update((m) => ({ ...m, [prevCat]: prevSearch }));

	activeCategoryStore.set(category);

	const rememberedRec = get(selectedRecipesByCategoryStore)[category] ?? null;
	const rememberedSearch = get(searchTextByCategoryStore)[category] ?? "";
	selectedRecipeStore.set(rememberedRec);
	searchTextStore.set(rememberedSearch);
}

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
