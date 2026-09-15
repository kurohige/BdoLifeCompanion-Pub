<!--
	Crafting — full-window screen (spec 5a). Content column ordered by CSS
	`order` so slots stay configurable: status strip (0) · page head (1) ·
	search wrapper with the summoned list (3) · selected recipe detail (5) ·
	queued (7, Phase 4). No permanent table: the recipe list is summoned under
	the search field while it has focus / a query, and dismisses on pick, Esc
	or click-away.

	Economics (profit / market tiles, buy prices) is data-gated: the recipe
	catalog has no price data yet, so the detail card shows the computable
	block (stocked · craftable · mastery) instead. See PARCHMENT_REDESIGN_TODO.
-->
<script lang="ts">
	import type { Recipe } from "$lib/models";
	import {
		activeCatalogStore,
		activeCategoryStore,
		setActiveCategory,
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
	import { craftingSubTabStore, craftingCraftableOnlyStore, type CraftingSubTab } from "$lib/stores/ui-state";
	import { toggleFavorite as toggleSettingsFavorite, settingsStore } from "$lib/stores/settings";
	import { addCraftingSession } from "$lib/stores/crafting-log";
	import { recordCraftInSession, startCraftingSession, craftingSessionStore } from "$lib/stores/crafting-session";
	import {
		craftQueueStore,
		craftQueueSecPerCraftStore,
		addToQueue,
		removeFromQueue,
		setQueueQuantity,
		setSecPerCraft,
	} from "$lib/stores/craft-queue";
	import { tickStore } from "$lib/stores/boss-timer";
	import { createPlan } from "$lib/stores/planner";
	import { getMaterialExplanation } from "$lib/constants/materials";
	import CraftingPlanner from "./CraftingPlanner.svelte";
	import { SubTabs, Button } from "$lib/components/ui";
	import { m } from "$lib/paraglide/messages";

	// ── Sub-tab (segmented control in the page head) ──
	function handleSubTabSelect(id: string) {
		craftingSubTabStore.set(id as CraftingSubTab);
		if (id === "cooking" || id === "alchemy" || id === "draughts") {
			setActiveCategory(id);
		}
	}

	// ── Mastery for the page head + detail card ──
	const mastery = $derived(
		$activeCategoryStore === "cooking"
			? $settingsStore.cooking_total_mastery
			: $settingsStore.alchemy_total_mastery,
	);
	const MASTERY_CAP = 2000;

	// ── Craftable computation (checks object-format alternatives) ──
	function calculateCanCraft(recipe: Recipe | null): number {
		if (!recipe) return 0;
		let minCrafts = Infinity;
		for (const ingredient of recipe.ingredients) {
			const required = ingredient.amount;
			const available = $inventoryStore.get(ingredient.itemId.toLowerCase()) ?? 0;
			let bestCanMake = required > 0 ? Math.floor(available / required) : 0;
			if (ingredient.alternatives && Array.isArray(ingredient.alternatives)) {
				for (const alt of ingredient.alternatives) {
					if (typeof alt === "object" && alt !== null && alt.itemId && alt.amount > 0) {
						const altAvailable = $inventoryStore.get(alt.itemId.toLowerCase()) ?? 0;
						bestCanMake = Math.max(bestCanMake, Math.floor(altAvailable / alt.amount));
					}
				}
			}
			minCrafts = Math.min(minCrafts, bestCanMake);
		}
		return minCrafts === Infinity ? 0 : minCrafts;
	}

	// ── Reverse index: how many recipes use each recipe's output (all catalogs) ──
	const usedInCounts = $derived.by(() => {
		const counts = new Map<string, number>();
		for (const catalog of $catalogsStore.values()) {
			for (const r of catalog.recipes) {
				for (const ing of r.ingredients) {
					const key = ing.itemId.toLowerCase();
					counts.set(key, (counts.get(key) ?? 0) + 1);
				}
			}
		}
		return counts;
	});

	function usedInCountFor(recipe: Recipe): number {
		return usedInCounts.get(recipe.name.toLowerCase()) ?? 0;
	}

	// ── Summoned list ──
	let listOpen = $state(false);
	let highlightIndex = $state(0);
	let listEl: HTMLDivElement | null = $state(null);
	const LIST_CAP = 8;

	const matchesAll = $derived.by(() => {
		let list = $filteredRecipesStore;
		if ($craftingCraftableOnlyStore) list = list.filter((r) => calculateCanCraft(r) > 0);
		return list;
	});
	const matches = $derived(matchesAll.slice(0, LIST_CAP));

	$effect(() => {
		if (highlightIndex >= matches.length) highlightIndex = 0;
	});
	$effect(() => {
		const idx = highlightIndex;
		if (!listOpen || !listEl) return;
		requestAnimationFrame(() => {
			const el = listEl?.querySelector(`[data-idx="${idx}"]`) as HTMLElement | null;
			el?.scrollIntoView({ block: "nearest" });
		});
	});

	function pickRecipe(recipe: Recipe) {
		selectedRecipeStore.set(recipe);
		searchTextStore.set(recipe.name);
		listOpen = false;
	}

	function handleSearchKeyDown(e: KeyboardEvent) {
		if (!listOpen) {
			if ((e.key === "ArrowDown" || e.key === "ArrowUp") && matches.length > 0) {
				e.preventDefault();
				listOpen = true;
			}
			return;
		}
		if (e.key === "ArrowDown") {
			e.preventDefault();
			highlightIndex = Math.min(highlightIndex + 1, matches.length - 1);
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			highlightIndex = Math.max(highlightIndex - 1, 0);
		} else if (e.key === "Enter") {
			e.preventDefault();
			const recipe = matches[highlightIndex];
			if (recipe) pickRecipe(recipe);
		} else if (e.key === "Escape") {
			e.preventDefault();
			listOpen = false;
		} else if (e.key === "Home") {
			e.preventDefault();
			highlightIndex = 0;
		} else if (e.key === "End") {
			e.preventDefault();
			highlightIndex = matches.length - 1;
		}
	}

	function clearSearch() {
		searchTextStore.set("");
		listOpen = true;
	}

	// ── Cross-catalog lookups (navigate to an ingredient's own recipe) ──
	function findRecipeByItemId(itemId: string): Recipe | null {
		const searchId = itemId.toLowerCase();
		for (const catalog of $catalogsStore.values()) {
			for (const recipe of catalog.recipes) {
				if (recipe.id.toLowerCase() === searchId || recipe.name.toLowerCase() === searchId) {
					return recipe;
				}
			}
		}
		return null;
	}
	function navigateToRecipe(itemId: string) {
		const found = findRecipeByItemId(itemId);
		if (found) pickRecipe(found);
	}

	// ── Used-in list for the selected recipe (named chips, per-craft qty) ──
	const usedInRecipes = $derived.by(() => {
		const recipe = $selectedRecipeStore;
		if (!recipe) return [];
		const searchName = recipe.name.toLowerCase();
		const results: Array<{ recipe: Recipe; amount: number }> = [];
		for (const catalog of $catalogsStore.values()) {
			for (const r of catalog.recipes) {
				if (r.id === recipe.id) continue;
				const ing = r.ingredients.find((i) => i.itemId.toLowerCase() === searchName);
				if (ing) results.push({ recipe: r, amount: ing.amount });
			}
		}
		return results.slice(0, 6);
	});

	// ── Selected recipe derived data ──
	const canCraft = $derived(calculateCanCraft($selectedRecipeStore));
	const stockedCount = $derived.by(() => {
		const recipe = $selectedRecipeStore;
		if (!recipe) return 0;
		let stocked = 0;
		for (const ing of recipe.ingredients) {
			if (($inventoryStore.get(ing.itemId.toLowerCase()) ?? 0) >= ing.amount) stocked++;
		}
		return stocked;
	});
	function isFavorite(recipeId: string | undefined): boolean {
		if (!recipeId) return false;
		return $favoritesStore.has(recipeId);
	}

	// ── Log a craft ──
	let showLogger = $state(false);
	let logCrafted = $state(1);
	let logYielded = $state(1);

	function handleLogSession() {
		const recipe = $selectedRecipeStore;
		if (!recipe) return;
		addCraftingSession(
			recipe.id,
			recipe.name,
			$activeCategoryStore,
			mastery,
			logCrafted,
			logYielded,
			canCraft,
		);
		for (const ingredient of recipe.ingredients) {
			consumeFromInventory(ingredient.itemId, ingredient.amount * logCrafted);
		}
		addToInventory(recipe.id, logYielded);
		recordCraftInSession(logCrafted, logYielded);
		logCrafted = 1;
		logYielded = 1;
		showLogger = false;
	}

	function handleAddToPlanner() {
		const recipe = $selectedRecipeStore;
		if (!recipe) return;
		createPlan(recipe.id, recipe.name, $activeCategoryStore, 1);
		craftingSubTabStore.set("planner");
	}

	function updateHeld(itemId: string, value: string) {
		const qty = parseInt(value, 10);
		if (!isNaN(qty) && qty >= 0) setInventoryQuantity(itemId, qty);
	}

	// ── Craft queue (Phase 4) ──
	function findRecipeById(recipeId: string): Recipe | null {
		const searchId = recipeId.toLowerCase();
		for (const catalog of $catalogsStore.values()) {
			for (const recipe of catalog.recipes) {
				if (recipe.id.toLowerCase() === searchId) return recipe;
			}
		}
		return null;
	}

	function formatDuration(totalSeconds: number): string {
		const mins = Math.ceil(totalSeconds / 60);
		if (mins >= 60) return `${Math.floor(mins / 60)}h ${mins % 60}m`;
		return `${mins}m`;
	}

	const queueTotals = $derived.by(() => {
		const sec = $craftQueueSecPerCraftStore;
		const crafts = $craftQueueStore.reduce((sum, b) => sum + b.quantity, 0);
		const totalSeconds = crafts * sec;
		const finish = new Date($tickStore + totalSeconds * 1000);
		return {
			crafts,
			duration: formatDuration(totalSeconds),
			finish: finish.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }),
		};
	});

	function handleQueueSelected() {
		const recipe = $selectedRecipeStore;
		if (!recipe) return;
		addToQueue(recipe.id, recipe.name, $activeCategoryStore, 100);
	}

	function handleRunQueue() {
		const first = $craftQueueStore[0];
		if (!first) return;
		if (!$craftingSessionStore) startCraftingSession(first.category);
	}

	// Layout preference (7.3): detail-first pulls the detail card above the
	// search wrapper (order 3); list-first keeps the spec's order 5.
	const detailOrder = $derived($settingsStore.crafting_lead === "detail" ? 2 : 5);
</script>

<div class="screen" data-density={$settingsStore.crafting_density}>
	<!-- Slot 0 (status strip) now lives app-level above the nav rail -->

	<!-- Slot 1 · page head -->
	<div class="slot page-head" style="order:1">
		<div>
			<h2 class="page-title">{m.nav_crafting()}</h2>
			<p class="page-stat">{m.crafting_head_stat({ count: $filteredRecipesStore.length, mastery: mastery.toLocaleString() })}</p>
		</div>
		<SubTabs
			tabs={[
				{ id: "cooking", label: m.log_filter_cooking(), icon: "/icons/cooking.png" },
				{ id: "alchemy", label: m.log_filter_alchemy(), icon: "/icons/alchemy.png" },
				/* the asset is singular: draught.png, not draughts.png */
				{ id: "draughts", label: m.log_filter_draughts(), icon: "/icons/draught.png" },
				{ id: "planner", label: "Planner", icon: "/icons/planner.png" },
			]}
			active={$craftingSubTabStore}
			onSelect={handleSubTabSelect}
		/>
	</div>

	{#if $craftingSubTabStore === "planner"}
		<div class="slot planner-slot" style="order:5">
			<CraftingPlanner />
		</div>
	{:else}
		<!-- Slot 3 · search wrapper (holds the summoned list) -->
		<div class="slot search-wrap" style="order:3">
			<div class="search-field">
				<svg class="flex-none" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="var(--ink-faint)" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">
					<circle cx="6" cy="6" r="4.6" /><path d="M9.5 9.5 13 13" />
				</svg>
				<input
					id="crafting-search"
					type="text"
					bind:value={$searchTextStore}
					onfocus={() => (listOpen = true)}
					oninput={() => (listOpen = true)}
					onblur={() => setTimeout(() => (listOpen = false), 150)}
					onkeydown={handleSearchKeyDown}
					placeholder={m.crafting_search_placeholder()}
					role="combobox"
					aria-expanded={listOpen && matches.length > 0}
					aria-autocomplete="list"
					aria-controls="crafting-search-listbox"
					aria-activedescendant={listOpen && matches.length > 0 ? `crafting-match-${highlightIndex}` : undefined}
					class="search-input"
				/>
				{#if $searchTextStore}
					<button type="button" class="search-clear" onclick={clearSearch} aria-label="✕">✕</button>
				{/if}
				<button
					type="button"
					class="tag-pill {$showOnlyFavoritesStore ? 'tag-active' : ''}"
					onclick={() => showOnlyFavoritesStore.update((v) => !v)}
					aria-pressed={$showOnlyFavoritesStore}
				>{m.crafting_favorites_only()}</button>
				<button
					type="button"
					class="tag-pill {$craftingCraftableOnlyStore ? 'tag-active' : ''}"
					onclick={() => craftingCraftableOnlyStore.update((v) => !v)}
					aria-pressed={$craftingCraftableOnlyStore}
				>{m.crafting_craftable_now()}</button>
			</div>

			{#if listOpen && matches.length > 0}
				<div class="summoned" bind:this={listEl} id="crafting-search-listbox" role="listbox">
					<div class="list-header">
						<span class="flex-1 eyebrow">{m.crafting_col_recipe()}</span>
						<span class="w-[72px] text-right eyebrow">{m.crafting_col_craftable()}</span>
						<span class="w-[64px] text-right eyebrow">{m.crafting_col_used_in()}</span>
					</div>
					<div class="list-rows">
						{#each matches as recipe, i (recipe.id)}
							{@const rowCraftable = calculateCanCraft(recipe)}
							{@const selected = $selectedRecipeStore?.id === recipe.id}
							<button
								id="crafting-match-{i}"
								type="button"
								role="option"
								aria-selected={selected}
								data-idx={i}
								onmousedown={() => pickRecipe(recipe)}
								onmouseenter={() => (highlightIndex = i)}
								class="list-row {selected ? 'row-selected' : ''} {i === highlightIndex ? 'row-highlight' : ''}"
							>
								<div class="row-thumb">
									{#if recipe.image}
										<img src="/{recipe.image}" alt="" class="w-full h-full object-contain"
											onerror={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
									{/if}
								</div>
								<div class="flex-1 min-w-0 text-left">
									<div class="row-name {selected ? 'font-semibold' : ''}">{isFavorite(recipe.id) ? "★ " : ""}{recipe.name}</div>
									{#if recipe.effect}
										<div class="row-effect {selected ? 'text-[var(--teal-tint-ink)]' : ''}">{recipe.effect}</div>
									{/if}
								</div>
								<span class="w-[72px] text-right row-num {rowCraftable === 0 ? 'num-zero' : ''} {selected ? 'num-selected' : ''}">{rowCraftable}</span>
								<span class="w-[64px] text-right row-num-faint">{usedInCountFor(recipe)}</span>
							</button>
						{/each}
					</div>
					<div class="list-footer">
						<span>{m.crafting_showing({ shown: matches.length, total: matchesAll.length })}</span>
					</div>
				</div>
			{/if}
		</div>

		<!-- Slot 5 · selected recipe detail card (never stretches) -->
		{#if $selectedRecipeStore}
			{@const recipe = $selectedRecipeStore}
			<div class="slot detail-card" style="order:{detailOrder}">
				<!-- Hero row -->
				<div class="flex gap-3 items-start">
					<div class="hero-thumb">
						{#if recipe.image}
							<img src="/{recipe.image}" alt={recipe.name} class="w-full h-full object-contain"
								onerror={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
						{/if}
					</div>
					<div class="flex-1 min-w-0">
						<div class="flex items-center gap-1.5">
							<h3 class="hero-title truncate">{recipe.name}</h3>
							<button
								type="button"
								onclick={() => recipe.id && toggleSettingsFavorite(recipe.id)}
								class="fav-btn {isFavorite(recipe.id) ? 'fav-on' : ''}"
								title={isFavorite(recipe.id) ? m.crafting_remove_favorite() : m.crafting_add_favorite()}
							>{isFavorite(recipe.id) ? "★" : "☆"}</button>
						</div>
						<p class="hero-sub truncate">
							{[recipe.effect, recipe.duration, m.crafting_ingredient_count({ count: recipe.ingredients.length })].filter(Boolean).join(" · ")}
						</p>
					</div>
					<div class="flex gap-2 items-center flex-none">
						<Button variant="primary" onclick={() => (showLogger = !showLogger)}>{m.crafting_log_a_craft()}</Button>
						<Button variant="secondary" onclick={handleAddToPlanner}>{m.crafting_add_to_planner()}</Button>
					</div>
				</div>

				{#if showLogger}
					<div class="logger">
						<div class="grid grid-cols-2 gap-2">
							<div>
								<label for="log-crafted" class="logger-label">{m.crafting_logger_crafted()}</label>
								<input id="log-crafted" type="text" inputmode="numeric" pattern="[0-9]*" value={logCrafted}
									oninput={(e) => {
										const val = parseInt(e.currentTarget.value, 10);
										if (!isNaN(val) && val >= 1) logCrafted = val;
										else if (e.currentTarget.value === "") logCrafted = 1;
									}}
									class="logger-input no-spinner" />
							</div>
							<div>
								<label for="log-yielded" class="logger-label">{m.crafting_logger_yielded()}</label>
								<input id="log-yielded" type="text" inputmode="numeric" pattern="[0-9]*" value={logYielded}
									oninput={(e) => {
										const val = parseInt(e.currentTarget.value, 10);
										if (!isNaN(val) && val >= 1) logYielded = val;
										else if (e.currentTarget.value === "") logYielded = 1;
									}}
									class="logger-input no-spinner" />
							</div>
						</div>
						<Button variant="primary" onclick={handleLogSession} class="w-full">{m.crafting_logger_save()}</Button>
					</div>
				{/if}

				<!-- Ingredients -->
				<div class="section-head">
					<span class="eyebrow">{m.crafting_ingredients_header()}</span>
					<span class="section-meta">{m.crafting_stocked_line({ stocked: stockedCount, total: recipe.ingredients.length, craftable: canCraft })}</span>
				</div>
				<div class="ing-grid">
					{#each recipe.ingredients as ingredient (ingredient.itemId)}
						{@const item = $activeCatalogStore?.itemFor(ingredient.itemId)}
						{@const held = $inventoryStore.get(ingredient.itemId.toLowerCase()) ?? 0}
						{@const short = held < ingredient.amount}
						{@const explanation = getMaterialExplanation(ingredient.itemId)}
						{@const ingredientHasRecipe = findRecipeByItemId(ingredient.itemId) !== null}
						<div
							class="ing-row {short ? 'ing-short' : ''} {ingredientHasRecipe ? 'cursor-pointer' : ''}"
							ondblclick={() => ingredientHasRecipe && navigateToRecipe(ingredient.itemId)}
							role="button"
							tabindex="0"
							title={explanation ? `${item?.name ?? ingredient.itemId}: ${explanation}` : (ingredientHasRecipe ? m.crafting_double_click_recipe() : undefined)}
						>
							<div class="ing-thumb">
								{#if item?.image}
									<img src="/{item.image}" alt="" class="w-full h-full object-contain"
										onerror={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
								{/if}
							</div>
							<span class="ing-name">{item?.name ?? ingredient.itemId}</span>
							<span class="ing-count {short ? 'count-short' : ''}">
								<input
									type="text"
									inputmode="numeric"
									pattern="[0-9]*"
									value={held}
									style="width:{Math.min(Math.max(String(held).length, 2), 7)}ch"
									oninput={(e) => {
										const val = e.currentTarget.value;
										if (val === "" || /^\d+$/.test(val)) updateHeld(ingredient.itemId, val || "0");
									}}
									onclick={(e) => e.stopPropagation()}
									class="held-input no-spinner {short ? 'held-short' : ''}"
									aria-label={item?.name ?? ingredient.itemId}
								/><span class="needed">/ {ingredient.amount}</span>
							</span>
						</div>
					{/each}
				</div>

				<!-- Used in + mastery band -->
				<div class="band">
					{#if $settingsStore.show_used_in && usedInRecipes.length > 0}
						<div class="flex-1 min-w-0">
							<span class="eyebrow">{m.crafting_used_in_header({ count: usedInRecipes.length })}</span>
							<div class="chip-stack">
								{#each usedInRecipes as u (u.recipe.id)}
									<button type="button" class="entity-chip" onclick={() => pickRecipe(u.recipe)} title={u.recipe.name}>
										<span class="chip-thumb">
											{#if u.recipe.image}
												<img src="/{u.recipe.image}" alt="" class="w-full h-full object-contain"
													onerror={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
											{/if}
										</span>
										<span class="flex-1 min-w-0 truncate text-left">{u.recipe.name}</span>
										<span class="chip-qty">×{u.amount}</span>
									</button>
								{/each}
							</div>
						</div>
					{/if}
					<div class="flex-[1.3] min-w-0">
						<span class="eyebrow">{m.crafting_col_craftable().toUpperCase()} {canCraft}</span>
						<div class="mastery-block">
							<div class="mastery-line">
								<span>{m.crafting_mastery_line({ mastery: mastery.toLocaleString() })}</span>
								<span class="mastery-pct">{Math.min(100, Math.round((mastery / MASTERY_CAP) * 100))}%</span>
							</div>
							<div class="mastery-bar">
								<div class="mastery-fill" style="width:{Math.min(100, (mastery / MASTERY_CAP) * 100)}%"></div>
							</div>
						</div>
					</div>
				</div>
			</div>
		{:else}
			<div class="slot empty-card" style="order:{detailOrder}">
				<img src="/icons/crafting.png" alt="" class="h-11 w-auto mx-auto mb-2 opacity-90" />
				<p class="text-[14px] text-[var(--ink-muted)]">{m.crafting_select_to_view()}</p>
				<p class="text-[12.5px] text-[var(--ink-faint)] mt-1">{m.crafting_recipes_available({ count: $filteredRecipesStore.length })}</p>
			</div>
		{/if}

		<!-- Slot 7 · queued -->
		<div class="queued-card" style="order:7">
			<div class="flex items-baseline justify-between gap-2 flex-none">
				<span class="eyebrow">{m.crafting_queued().toUpperCase()}</span>
				<div class="flex items-baseline gap-3">
					<span class="section-meta">{m.crafting_queue_meta({ batches: $craftQueueStore.length, crafts: queueTotals.crafts })}</span>
					<label class="sec-label">
						<input
							type="text"
							inputmode="numeric"
							value={$craftQueueSecPerCraftStore}
							oninput={(e) => {
								const v = parseInt(e.currentTarget.value, 10);
								if (!isNaN(v) && v > 0) setSecPerCraft(v);
							}}
							class="sec-input no-spinner"
						/>
						{m.crafting_queue_sec_per_craft()}
					</label>
					{#if $selectedRecipeStore}
						<button type="button" class="queue-add" onclick={handleQueueSelected} title={m.crafting_queue_add_title()}>
							{m.crafting_queue_add()}
						</button>
					{/if}
				</div>
			</div>

			{#if $craftQueueStore.length === 0}
				<div class="queue-empty">{m.crafting_queue_empty()}</div>
			{:else}
				<div class="queue-rows">
					{#each $craftQueueStore as batch, i (batch.id)}
						{@const qRecipe = findRecipeById(batch.recipeId)}
						{@const qCraftable = qRecipe ? calculateCanCraft(qRecipe) : 0}
						{@const short = qCraftable < batch.quantity}
						<div class="queue-row">
							<div class="q-thumb {short ? 'q-thumb-short' : ''}">
								{#if qRecipe?.image}
									<img src="/{qRecipe.image}" alt="" class="w-full h-full object-contain"
										onerror={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
								{/if}
							</div>
							<span class="q-name">{batch.recipeName}</span>
							<span class="q-qty {short ? 'q-num-short' : ''}">×<input
								type="text"
								inputmode="numeric"
								value={batch.quantity}
								oninput={(e) => {
									const v = parseInt(e.currentTarget.value, 10);
									if (!isNaN(v)) setQueueQuantity(batch.id, v);
								}}
								class="qty-input no-spinner {short ? 'q-num-short' : ''}"
								aria-label={batch.recipeName}
							/></span>
							{#if short}
								<span class="q-eta q-num-short">{m.crafting_queue_short({ count: batch.quantity - qCraftable })}</span>
							{:else}
								<span class="q-eta {i === 0 ? 'q-eta-next' : ''}">{formatDuration(batch.quantity * $craftQueueSecPerCraftStore)}</span>
							{/if}
							<button type="button" class="q-remove" onclick={() => removeFromQueue(batch.id)} title={m.crafting_queue_remove()} aria-label={m.crafting_queue_remove()}>✕</button>
						</div>
					{/each}
				</div>
				<div class="queue-footer">
					<span class="section-meta">{m.crafting_queue_total_finishes({ duration: queueTotals.duration, time: queueTotals.finish })}</span>
					<button type="button" class="queue-run" onclick={handleRunQueue}>{m.crafting_queue_run()}</button>
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.screen {
		display: flex;
		flex-direction: column;
		gap: 11px;
		height: 100%;
		min-height: 0;
	}
	/* Compact density (7.3) — spec: comfortable gap:11/pad:15 vs compact gap:7/pad:12,
	   scaled to the post-legibility comfortable values (pad 17). */
	.screen[data-density="compact"] { gap: 7px; }
	.screen[data-density="compact"] .detail-card { padding: 13px; }
	.screen[data-density="compact"] .ing-grid { gap: 5px; margin-top: 7px; }
	.screen[data-density="compact"] .ing-row { padding: 6px 10px; }
	.slot { flex: none; }
	.planner-slot {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}

	/* ── Page head ── */
	.page-head {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: 12px;
	}
	.page-title {
		font: 600 22px 'IBM Plex Sans', sans-serif;
		letter-spacing: -0.02em;
		color: var(--ink);
	}
	.page-stat {
		font-size: 13px;
		color: var(--ink-muted);
		margin-top: 2px;
	}

	/* ── Search field ── */
	.search-wrap { position: relative; }
	.search-field {
		display: flex;
		align-items: center;
		gap: 9px;
		padding: 9px 13px;
		background: var(--card-bg);
		border: 1px solid var(--card-border);
		border-radius: 11px;
	}
	.search-field:focus-within {
		border-color: var(--teal);
		box-shadow: 0 0 0 1px rgb(var(--teal-rgb) / 0.3);
	}
	.search-input {
		flex: 1;
		min-width: 0;
		border: none;
		outline: none;
		background: transparent;
		font-size: 14px;
		color: var(--ink);
		font-family: 'IBM Plex Sans', sans-serif;
	}
	.search-input::placeholder { color: var(--ink-faint); }
	.search-clear {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 18px;
		height: 18px;
		flex: none;
		background: var(--chip);
		color: var(--eyebrow-ink);
		border: none;
		border-radius: 50%;
		font: 600 12px 'IBM Plex Sans', sans-serif;
		cursor: pointer;
	}
	.tag-pill {
		flex: none;
		padding: 3px 10px;
		background: var(--chip);
		color: var(--ink-muted);
		border: none;
		border-radius: 999px;
		font: 600 12px 'IBM Plex Sans', sans-serif;
		white-space: nowrap;
		cursor: pointer;
	}
	.tag-active {
		background: var(--teal-tint);
		color: var(--teal);
	}

	/* ── Summoned list ── */
	.summoned {
		position: absolute;
		top: calc(100% + 8px);
		left: 0;
		right: 0;
		max-height: 352px;
		z-index: 6;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		padding: 13px 16px;
		background: var(--card-bg);
		border: 1px solid var(--card-border);
		border-radius: 16px;
		box-shadow: var(--shadow-float);
	}
	.list-header {
		display: flex;
		align-items: center;
		flex: none;
	}
	.list-rows {
		display: flex;
		flex-direction: column;
		gap: 2px;
		margin-top: 8px;
		overflow-y: auto;
		min-height: 0;
	}
	.list-row {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 9px 0;
		background: transparent;
		border: none;
		border-top: 1px solid var(--divider);
		cursor: pointer;
	}
	.list-row:first-child { border-top: none; }
	.row-highlight { background: var(--row); }
	.row-selected {
		background: var(--teal-tint);
		box-shadow: inset 3px 0 0 0 var(--teal);
		border-radius: 10px;
		border-top-color: transparent;
		margin: 0 -10px;
		padding: 9px 10px;
	}
	.row-selected + .list-row { border-top-color: transparent; }
	/* Icon sizes are user-locked (40/38/36 + hero 64 + chips 38, per the
	   icons_handoff pass — boxes grew by the 3-4px tile inset; the art
	   inside stayed at the 2026-08-30 sizes) — do not change them in
	   styling passes without an explicit user request. */
	.row-thumb {
		border: 1px solid var(--thumb-border);
		width: 40px;
		height: 40px;
		flex: none;
		border-radius: 10px;
		background: var(--overlay-chip);
		padding: 3px;
		overflow: hidden;
	}
	.row-selected .row-thumb { background: #d8d3c6; }
	.row-selected .row-effect { color: #40615c; }
	.row-name {
		font-size: 14.5px;
		color: var(--ink);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.row-effect {
		font-size: 12px;
		color: var(--eyebrow-ink);
		margin-top: 1px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.row-num {
		font: 600 16px 'IBM Plex Mono', monospace;
		font-variant-numeric: tabular-nums;
		color: var(--ink);
		flex: none;
	}
	.num-zero { color: var(--rust-deep); }
	.num-selected { color: #0f544f; font-weight: 600; }
	.row-num-faint {
		font: 500 14px 'IBM Plex Mono', monospace;
		font-variant-numeric: tabular-nums;
		color: var(--ink-muted);
		flex: none;
	}
	.list-footer {
		flex: none;
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		padding-top: 10px;
		font-size: 12.5px;
		color: var(--ink-faint);
	}

	/* ── Detail card ── */
	.detail-card {
		padding: 17px;
		background: var(--card-bg);
		border: 1px solid var(--card-border);
		border-radius: 16px;
		box-shadow: var(--card-shadow);
	}
	.hero-thumb {
		border: 1px solid var(--thumb-border);
		width: 64px;
		height: 64px;
		flex: none;
		border-radius: 13px;
		background: var(--overlay-chip);
		padding: 4px;
		overflow: hidden;
	}
	.hero-title {
		font: 600 20px 'IBM Plex Sans', sans-serif;
		letter-spacing: -0.015em;
		color: var(--ink);
	}
	.fav-btn {
		border: none;
		background: transparent;
		font-size: 16px;
		line-height: 1;
		color: var(--ink-faint);
		cursor: pointer;
		padding: 2px;
	}
	.fav-on { color: var(--amber); }
	.hero-sub {
		font-size: 12.5px;
		color: var(--ink-muted);
		margin-top: 3px;
	}

	.logger {
		margin-top: 12px;
		padding: 10px 12px;
		background: var(--row);
		border-radius: 10px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.logger-label {
		font-size: 12px;
		color: var(--ink-muted);
	}
	.logger-input {
		width: 100%;
		background: var(--card-bg);
		border: 1px solid var(--card-border);
		border-radius: 8px;
		padding: 5px 8px;
		font: 500 13.5px 'IBM Plex Mono', monospace;
		text-align: center;
		color: var(--ink);
		outline: none;
	}
	.logger-input:focus { border-color: var(--teal); }

	.section-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		margin-top: 13px;
		padding-top: 12px;
		border-top: 1px solid var(--divider);
	}
	.section-meta {
		font-size: 12.5px;
		color: var(--ink-faint);
	}

	.ing-grid {
		display: grid;
		/* Answers to the CARD, not the viewport — the card is what narrows when
		   the scratchpad docks. 240px floor: at the 540px docked grid anything
		   240-266 lays the same two 266px columns, and the first floor that
		   widens the name box would drop the docked card to a single column. */
		grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
		gap: 7px;
		margin-top: 9px;
	}
	.ing-row {
		display: flex;
		align-items: center;
		gap: 11px;
		padding: 9px 12px;
		background: var(--row);
		border: 1px solid transparent;
		border-radius: 10px;
		min-width: 0;
	}
	.ing-short {
		background: var(--rust-tint);
		border-color: var(--rust-tint-border);
	}
	.ing-thumb {
		border: 1px solid var(--thumb-border);
		width: 38px;
		height: 38px;
		flex: none;
		border-radius: 9px;
		background: var(--overlay-chip);
		padding: 3px;
		overflow: hidden;
	}
	.ing-short .ing-thumb { background: #eed6cc; }
	.ing-name {
		flex: 1;
		min-width: 0;
		font-size: 14px;
		/* Wraps instead of truncating: alchemy names disambiguate by their LAST
		   token ("- Power" vs "- Ignore Resistance"), so neither ellipsis nor a
		   line-clamp is acceptable — both cut exactly the part that matters.
		   Two lines cost no row height (36px vs the 40px thumb); three-line
		   names are normal in Alchemy, not an edge case. 500 is the heaviest
		   weight that keeps every cooking name on one docked line (1.2px spare). */
		font-weight: 500;
		line-height: 1.3;
		overflow-wrap: break-word;
	}
	.ing-count {
		display: flex;
		align-items: baseline;
		font: 600 14px 'IBM Plex Mono', monospace;
		font-variant-numeric: tabular-nums;
		color: var(--ink);
		white-space: nowrap;
		flex: none;
	}
	.held-input {
		/* Width comes from the inline style (value-sized, 2-7ch): 4ch drew a
		   four-digit number that still looked valid for stacks like 500000.
		   ch is exact here — IBM Plex Mono + tabular-nums. */
		min-width: 2ch;
		background: transparent;
		border: none;
		outline: none;
		text-align: right;
		font: inherit;
		color: var(--ink);
		padding: 0;
	}
	.held-input:focus { color: var(--ink); }
	.held-short { color: var(--rust); }
	.needed { font: 400 12.5px 'IBM Plex Mono', monospace; color: var(--ink-faint); margin-left: 3px; }
	.ing-short .needed { color: #a2604e; }

	.band {
		display: flex;
		gap: 16px;
		margin-top: 12px;
		padding-top: 12px;
		border-top: 1px solid var(--divider);
	}
	.chip-stack {
		display: flex;
		flex-direction: column;
		gap: 5px;
		margin-top: 9px;
	}
	.entity-chip {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 4px 10px 4px 5px;
		background: var(--row);
		border: none;
		border-radius: 999px;
		font-size: 13.5px;
		color: var(--ink);
		cursor: pointer;
	}
	.entity-chip:hover { background: var(--chip); }
	.chip-thumb {
		border: 1px solid var(--thumb-border);
		width: 38px;
		height: 38px;
		flex: none;
		border-radius: 9px;
		background: var(--overlay-chip);
		padding: 3px;
		overflow: hidden;
	}
	.chip-qty {
		font: 600 12.5px 'IBM Plex Mono', monospace;
		color: var(--ink-muted);
		flex: none;
	}

	.mastery-block { margin-top: 10px; }
	.mastery-line {
		display: flex;
		justify-content: space-between;
		font-size: 12.5px;
		color: var(--ink-mid);
		margin-bottom: 5px;
	}
	.mastery-pct {
		font: 600 12.5px 'IBM Plex Mono', monospace;
		color: var(--ink-muted);
	}
	.mastery-bar {
		height: 8px;
		background: var(--hairline);
		border-radius: 4px;
		overflow: hidden;
	}
	.mastery-fill {
		height: 100%;
		background: var(--teal);
		border-radius: 4px;
	}

	.empty-card {
		padding: 28px 15px;
		background: var(--card-bg);
		border: 1px solid var(--card-border);
		border-radius: 16px;
		box-shadow: var(--card-shadow);
		text-align: center;
	}

	/* ── Queued card ── */
	.queued-card {
		order: 7;
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		padding: 13px 16px;
		background: var(--card-bg);
		border: 1px solid var(--card-border);
		border-radius: 16px;
		box-shadow: var(--card-shadow);
	}
	.queue-empty {
		margin-top: 10px;
		padding: 6px 10px;
		align-self: flex-start;
		border: 1px dashed var(--divider-strong);
		border-radius: 9px;
		font-size: 13px;
		color: var(--ink-faint);
	}
	.queue-rows {
		display: flex;
		flex-direction: column;
		gap: 2px;
		margin-top: 9px;
		overflow-y: auto;
		min-height: 0;
	}
	.queue-row {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 9px 0;
		border-top: 1px solid var(--divider);
	}
	.queue-row:first-child { border-top: none; }
	.q-thumb {
		border: 1px solid var(--thumb-border);
		width: 36px;
		height: 36px;
		flex: none;
		border-radius: 9px;
		background: var(--overlay-chip);
		padding: 3px;
		overflow: hidden;
	}
	.q-thumb-short { background: #eed6cc; }
	.q-name {
		flex: 1;
		min-width: 0;
		font-size: 14px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.q-qty {
		/* Fixed width, NOT value-sized like .held-input: this is a column in an
		   aligned table, and per-row widths would make the queue ragged. Same
		   digit-clipping bug as the ingredient row, opposite correct answer. */
		width: 84px;
		flex: none;
		text-align: right;
		font: 600 14px 'IBM Plex Mono', monospace;
		font-variant-numeric: tabular-nums;
		color: var(--ink-mid);
		display: flex;
		align-items: baseline;
		justify-content: flex-end;
	}
	.qty-input {
		width: 7ch;
		background: transparent;
		border: none;
		outline: none;
		text-align: right;
		font: inherit;
		color: inherit;
		padding: 0;
	}
	.qty-input:focus { color: var(--ink); }
	.q-eta {
		width: 60px;
		flex: none;
		text-align: right;
		font: 600 14px 'IBM Plex Mono', monospace;
		font-variant-numeric: tabular-nums;
		color: var(--ink-muted);
		white-space: nowrap;
	}
	.q-eta-next { color: #0f544f; }
	.q-num-short {
		color: var(--rust-deep);
		font-family: 'IBM Plex Sans', sans-serif;
		font-size: 12.5px;
		font-weight: 600;
	}
	.q-remove {
		flex: none;
		width: 20px;
		height: 20px;
		display: flex;
		align-items: center;
		justify-content: center;
		border: none;
		border-radius: 50%;
		background: transparent;
		color: var(--ink-faint);
		font-size: 12.5px;
		cursor: pointer;
	}
	.q-remove:hover { background: var(--rust-tint); color: var(--rust); }
	.queue-footer {
		margin-top: auto;
		padding-top: 10px;
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		border-top: 1px solid var(--divider);
		flex: none;
	}
	.queue-run {
		border: none;
		background: transparent;
		font-size: 12.5px;
		font-weight: 600;
		color: var(--teal);
		cursor: pointer;
		padding: 0;
	}
	.queue-run:hover { text-decoration: underline; }
	.queue-add {
		border: none;
		background: var(--teal-tint);
		color: #0f544f;
		font: 600 12px 'IBM Plex Sans', sans-serif;
		padding: 3px 10px;
		border-radius: 999px;
		cursor: pointer;
	}
	.sec-label {
		display: flex;
		align-items: baseline;
		gap: 3px;
		font-size: 12px;
		color: var(--ink-faint);
	}
	.sec-input {
		width: 3ch;
		background: transparent;
		border: none;
		border-bottom: 1px dashed var(--divider-strong);
		outline: none;
		text-align: right;
		font: 600 13px 'IBM Plex Mono', monospace;
		color: var(--ink-muted);
		padding: 0;
	}
</style>
