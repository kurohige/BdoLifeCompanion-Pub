<script lang="ts">
	import type { Recipe } from "$lib/models";
	import {
		activeCatalogStore,
		activeCategoryStore,
		selectedRecipeStore,
		searchTextStore,
		showOnlyFavoritesStore,
		filteredRecipesStore,
		favoritesStore,
		inventoryStore,
		consumeFromInventory,
		addToInventory,
		setInventoryQuantity,
		catalogsStore,
	} from "$lib/stores";
	import { toggleFavorite as toggleSettingsFavorite, settingsStore } from "$lib/stores/settings";
	import { addCraftingSession } from "$lib/stores/crafting-log";
	import { getMaterialExplanation } from "$lib/constants/materials";

	// Crafting logger state
	let logCrafted = $state(1);
	let logYielded = $state(1);
	let showLogger = $state(false);

	// Search for recipes that use an ingredient
	function searchForIngredient(itemName: string) {
		searchTextStore.set(itemName);
		showOnlyFavoritesStore.set(false);
	}

	// Find a recipe by item ID across all catalogs
	function findRecipeByItemId(itemId: string): { recipe: Recipe; category: string } | null {
		const searchId = itemId.toLowerCase();

		for (const [category, catalog] of $catalogsStore.entries()) {
			for (const recipe of catalog.recipes) {
				if (recipe.id.toLowerCase() === searchId || recipe.name.toLowerCase() === searchId) {
					return { recipe, category };
				}
			}
		}
		return null;
	}

	// Navigate to a recipe (double-click handler)
	function navigateToRecipe(itemId: string) {
		const found = findRecipeByItemId(itemId);
		if (found) {
			selectedRecipeStore.set(found.recipe);
			searchTextStore.set(found.recipe.name);
		}
	}

	// Check if an ingredient has a recipe
	function hasRecipe(itemId: string): boolean {
		return findRecipeByItemId(itemId) !== null;
	}

	// Update ingredient quantity in inventory
	function updateIngredientQuantity(itemId: string, value: string) {
		const qty = parseInt(value, 10);
		if (!isNaN(qty) && qty >= 0) {
			setInventoryQuantity(itemId, qty);
		}
	}

	// Find recipes across all catalogs that use the current recipe as an ingredient
	function getUsedInRecipes(recipe: Recipe): Array<{ recipe: Recipe; category: string }> {
		const results: Array<{ recipe: Recipe; category: string }> = [];
		const searchName = recipe.name.toLowerCase();

		for (const [category, catalog] of $catalogsStore.entries()) {
			for (const r of catalog.recipes) {
				if (r.id === recipe.id) continue;
				for (const ingredient of r.ingredients) {
					if (ingredient.itemId.toLowerCase() === searchName) {
						results.push({ recipe: r, category });
						break;
					}
				}
			}
		}

		return results.slice(0, 10); // Limit to 10 results
	}

	// Calculate how many times we can craft the selected recipe
	// Checks alternatives: if primary ingredient is insufficient, uses the best alternative
	function calculateCanCraft(recipe: Recipe | null): number {
		if (!recipe) return 0;

		const catalog = $activeCatalogStore;
		if (!catalog) return 0;

		let minCrafts = Infinity;

		for (const ingredient of recipe.ingredients) {
			const itemId = ingredient.itemId.toLowerCase();
			const required = ingredient.amount;
			const available = $inventoryStore.get(itemId) ?? 0;

			let bestCanMake = required > 0 ? Math.floor(available / required) : 0;

			// Check alternatives for a better option (skip old string[] format)
			if (ingredient.alternatives && Array.isArray(ingredient.alternatives)) {
				for (const alt of ingredient.alternatives) {
					if (typeof alt === 'object' && alt !== null && alt.itemId && alt.amount > 0) {
						const altAvailable = $inventoryStore.get(alt.itemId.toLowerCase()) ?? 0;
						const altCanMake = Math.floor(altAvailable / alt.amount);
						bestCanMake = Math.max(bestCanMake, altCanMake);
					}
				}
			}

			minCrafts = Math.min(minCrafts, bestCanMake);
		}

		return minCrafts === Infinity ? 0 : minCrafts;
	}

	// Check if recipe is a favorite
	function isFavorite(recipeId: string | undefined): boolean {
		if (!recipeId) return false;
		return $favoritesStore.has(recipeId);
	}

	// Handle favorite toggle (settings store is the single source of truth)
	function handleToggleFavorite() {
		if ($selectedRecipeStore?.id) {
			toggleSettingsFavorite($selectedRecipeStore.id);
		}
	}

	// Log crafting session
	function handleLogSession() {
		if (!$selectedRecipeStore) return;

		const recipe = $selectedRecipeStore;
		const category = $activeCategoryStore;

		// Auto-read mastery from settings based on active category
		const mastery = category === "cooking"
			? $settingsStore.cooking_total_mastery
			: $settingsStore.alchemy_total_mastery;

		addCraftingSession(
			recipe.id,
			recipe.name,
			category,
			mastery,
			logCrafted,
			logYielded,
			canCraft
		);

		// Consume ingredients from inventory
		for (const ingredient of recipe.ingredients) {
			const totalNeeded = ingredient.amount * logCrafted;
			consumeFromInventory(ingredient.itemId, totalNeeded);
		}

		// Add crafted item to inventory
		addToInventory(recipe.id, logYielded);

		// Reset logger
		logCrafted = 1;
		logYielded = 1;
		showLogger = false;
	}

	// Reactive calculations
	const canCraft = $derived(calculateCanCraft($selectedRecipeStore));
	const ingredientCount = $derived($selectedRecipeStore?.ingredients.length ?? 0);
	const usedInRecipes = $derived($selectedRecipeStore ? getUsedInRecipes($selectedRecipeStore) : []);
</script>

<div class="space-y-2">
	<!-- Search and Filters -->
	<div class="space-y-1">
		<label for="search" class="text-[10px] font-bold neon-text-cyan">
			Search Recipe or Ingredient
		</label>
		<input
			id="search"
			type="text"
			bind:value={$searchTextStore}
			placeholder="Type recipe or ingredient name..."
			class="w-full glass-input text-foreground rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
		/>
		<label class="flex items-center gap-1 text-[10px] font-bold neon-text-cyan cursor-pointer">
			<input type="checkbox" bind:checked={$showOnlyFavoritesStore} class="w-3 h-3" />
			<span>Favorites Only</span>
		</label>
	</div>

	<!-- Recipe Selector -->
	<div>
		<label for="recipe-select" class="sr-only">Select Recipe</label>
		<select
			id="recipe-select"
			bind:value={$selectedRecipeStore}
			class="w-full bg-input text-foreground border border-border rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
		>
			<option value={null}>-- Select Recipe ({$filteredRecipesStore.length}) --</option>
			{#each $filteredRecipesStore as recipe (recipe.id)}
				<option value={recipe}>{isFavorite(recipe.id) ? "★ " : ""}{recipe.name}</option>
			{/each}
		</select>
	</div>

	<!-- Selected Recipe Display -->
	{#if $selectedRecipeStore}
		{@const recipe = $selectedRecipeStore}
		<div class="glass-card border-primary rounded p-2 neon-glow-purple">
			<div class="flex gap-2">
				<!-- Recipe Image -->
				<div class="flex-shrink-0">
					<div
						class="w-10 h-10 border border-primary rounded overflow-hidden bg-secondary flex items-center justify-center"
					>
						{#if recipe.image}
							<img
								src="/{recipe.image}"
								alt={recipe.name}
								class="w-full h-full object-contain"
								onerror={(e) => {
									const img = e.currentTarget as HTMLImageElement;
									img.style.display = "none";
								}}
							/>
						{:else}
							<span class="text-muted-foreground text-lg">?</span>
						{/if}
					</div>
				</div>

				<!-- Recipe Info -->
				<div class="flex-1 min-w-0">
					<h3 class="text-sm font-bold neon-text-purple truncate">
						{recipe.name}
					</h3>
					<p class="text-xs neon-text-cyan">
						Can craft: <span class="text-accent font-bold">{canCraft}</span>
						<span class="text-muted-foreground">({ingredientCount} ingredients)</span>
					</p>
					{#if recipe.effect}
						<p class="text-[10px] text-yellow-400 mt-0.5 leading-tight">{recipe.effect}{#if recipe.duration} <span class="text-muted-foreground">({recipe.duration})</span>{/if}</p>
					{/if}
					{#if recipe.tags?.length}
						<div class="flex gap-1 mt-0.5 flex-wrap">
							{#each recipe.tags as tag}
								<span class="text-[9px] px-1.5 py-px rounded-full bg-primary/20 text-primary border border-primary/30">{tag}</span>
							{/each}
						</div>
					{/if}
				</div>

				<!-- Favorite & Log Buttons -->
				<div class="flex items-center gap-1">
					<button
						onclick={handleToggleFavorite}
						class="w-8 h-8 flex items-center justify-center text-xl transition-all hover:scale-110 {isFavorite(
							recipe.id
						)
							? 'text-yellow-400'
							: 'text-muted-foreground'}"
						title={isFavorite(recipe.id) ? "Remove from favorites" : "Add to favorites"}
					>
						{isFavorite(recipe.id) ? "★" : "☆"}
					</button>
					<button
						onclick={() => (showLogger = !showLogger)}
						class="px-2 py-1 text-xs bg-secondary text-secondary-foreground rounded hover:bg-primary hover:text-primary-foreground transition-colors"
						title="Log crafting session"
					>
						{showLogger ? "Hide" : "Log"}
					</button>
				</div>
			</div>

			<!-- Crafting Logger -->
			{#if showLogger}
				<div class="mt-2 p-2 bg-secondary rounded border border-border space-y-2">
					<div class="grid grid-cols-2 gap-1">
						<div>
							<label for="log-crafted" class="text-[10px] text-muted-foreground">Crafted</label>
							<input
								id="log-crafted"
								type="text"
								inputmode="numeric"
								pattern="[0-9]*"
								value={logCrafted}
								oninput={(e) => {
									const val = parseInt(e.currentTarget.value, 10);
									if (!isNaN(val) && val >= 1) logCrafted = val;
									else if (e.currentTarget.value === '') logCrafted = 1;
								}}
								class="w-full bg-input text-foreground border border-border rounded px-1 py-0.5 text-xs text-center focus:outline-none focus:ring-1 focus:ring-primary no-spinner"
							/>
						</div>
						<div>
							<label for="log-yielded" class="text-[10px] text-muted-foreground">Yielded</label>
							<input
								id="log-yielded"
								type="text"
								inputmode="numeric"
								pattern="[0-9]*"
								value={logYielded}
								oninput={(e) => {
									const val = parseInt(e.currentTarget.value, 10);
									if (!isNaN(val) && val >= 1) logYielded = val;
									else if (e.currentTarget.value === '') logYielded = 1;
								}}
								class="w-full bg-input text-foreground border border-border rounded px-1 py-0.5 text-xs text-center focus:outline-none focus:ring-1 focus:ring-primary no-spinner"
							/>
						</div>
					</div>
					<button
						onclick={handleLogSession}
						class="w-full py-1 text-xs bg-accent text-accent-foreground font-bold rounded hover:opacity-80 transition-opacity"
					>
						Save & Consume
					</button>
				</div>
			{/if}
		</div>

		<!-- Ingredients List -->
		<div class="space-y-1">
			<h4 class="text-[10px] font-bold neon-text-cyan">Ingredients (per craft)</h4>
			<div class="space-y-1 max-h-[180px] overflow-auto">
				{#each recipe.ingredients as ingredient (ingredient.itemId)}
					{@const item = $activeCatalogStore?.itemFor(ingredient.itemId)}
					{@const available = $inventoryStore.get(ingredient.itemId.toLowerCase()) ?? 0}
					{@const needed = ingredient.amount}
					{@const hasEnough = available >= needed}
					{@const canCraftWithThis = needed > 0 ? Math.floor(available / needed) : 0}
					{@const ingredientHasRecipe = hasRecipe(ingredient.itemId)}
					{@const materialExplanation = getMaterialExplanation(ingredient.itemId)}
					<div
						class="flex items-center gap-1 p-1 border border-border rounded bg-card hover:border-primary transition-colors {ingredientHasRecipe ? 'cursor-pointer' : ''}"
						ondblclick={() => ingredientHasRecipe && navigateToRecipe(ingredient.itemId)}
						role="button"
						tabindex="0"
						title={materialExplanation ? `${item?.name ?? ingredient.itemId}: ${materialExplanation}` : undefined}
					>
						<!-- Item Image -->
						<div
							class="w-6 h-6 border border-muted rounded overflow-hidden bg-secondary flex-shrink-0 flex items-center justify-center"
						>
							{#if item?.image}
								<img
									src="/{item.image}"
									alt={item.name}
									class="w-full h-full object-contain"
									onerror={(e) => {
										const img = e.currentTarget as HTMLImageElement;
										img.style.display = "none";
									}}
								/>
							{/if}
						</div>

						<!-- Item Info -->
						<div class="flex-1 min-w-0">
							<div class="flex items-center gap-1">
								<p class="font-medium text-xs truncate">{item?.name ?? ingredient.itemId}</p>
								{#if ingredientHasRecipe}
									<span class="text-primary text-xs" title="Double-click to view recipe">⚗️</span>
								{/if}
								{#if materialExplanation}
									<span class="text-accent text-xs" title={materialExplanation}>ℹ️</span>
								{/if}
								{#if ingredient.alternatives && Array.isArray(ingredient.alternatives) && ingredient.alternatives.some(a => typeof a === 'object' && a !== null && a.itemId)}
									{@const validAlts = ingredient.alternatives.filter(a => typeof a === 'object' && a !== null && a.itemId)}
									{@const altText = validAlts.map(a => `OR: ${a.itemId} x${a.amount}`).join(', ')}
									<span
										class="text-cyan text-[9px] cursor-help opacity-80"
										title={altText}
									>[alt]</span>
								{/if}
							</div>
						</div>

						<!-- Need Amount -->
						<span class="text-[10px] text-muted-foreground w-8 text-right">{needed}x</span>

						<!-- Quantity Input -->
						<input
							type="text"
							inputmode="numeric"
							pattern="[0-9]*"
							value={available}
							oninput={(e) => {
								const val = e.currentTarget.value;
								if (val === '' || /^\d+$/.test(val)) {
									updateIngredientQuantity(ingredient.itemId, val || '0');
								}
							}}
							onclick={(e) => e.stopPropagation()}
							class="w-12 bg-input text-foreground border rounded px-1 py-0.5 text-xs text-center focus:outline-none focus:ring-1 focus:ring-primary no-spinner {hasEnough ? 'border-border' : 'border-destructive'}"
						/>
						<span class="text-xs w-4 {hasEnough ? 'text-accent' : 'text-destructive'}">
							{hasEnough ? "✓" : "✗"}
						</span>
					</div>
				{/each}
			</div>
		</div>

		<!-- Used In Section -->
		{#if usedInRecipes.length > 0}
			<div class="space-y-1">
				<h4 class="text-[10px] font-bold neon-text-purple">Used In ({usedInRecipes.length})</h4>
				<div class="flex flex-wrap gap-1 max-h-[60px] overflow-auto">
					{#each usedInRecipes as { recipe: usedRecipe, category } (usedRecipe.id)}
						<button
							onclick={() => {
								searchTextStore.set(usedRecipe.name);
								selectedRecipeStore.set(usedRecipe);
							}}
							class="flex items-center gap-1 px-1 py-0.5 border border-border rounded bg-card hover:border-primary transition-colors text-left"
							title={`${usedRecipe.name} (${category})`}
						>
							<div class="w-4 h-4 border border-muted rounded overflow-hidden bg-secondary flex-shrink-0">
								{#if usedRecipe.image}
									<img
										src="/{usedRecipe.image}"
										alt={usedRecipe.name}
										class="w-full h-full object-contain"
										onerror={(e) => {
											const img = e.currentTarget as HTMLImageElement;
											img.style.display = "none";
										}}
									/>
								{/if}
							</div>
							<span class="text-xs truncate max-w-[80px]">{usedRecipe.name}</span>
						</button>
					{/each}
				</div>
			</div>
		{/if}
	{:else}
		<div class="text-center py-6 text-muted-foreground">
			<p class="text-2xl mb-1">⚒️</p>
			<p class="text-sm">Select a recipe to view ingredients</p>
			<p class="text-xs mt-1">
				{$filteredRecipesStore.length} recipes available
			</p>
		</div>
	{/if}
</div>
