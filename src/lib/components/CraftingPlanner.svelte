<script lang="ts">
	import type { Recipe, RecipeCategory } from "$lib/models";
	import type { PlannerNode, CraftingStep } from "$lib/models/planner";
	import {
		allRecipesStore,
		plannerPlansStore,
		activePlanIdStore,
		activePlanStore,
		inventoryAwareStore,
		plannerViewStore,
		plannerExpandedNodesStore,
		plannerRecipeSearchStore,
		plannerTreeStore,
		shoppingListStore,
		craftingStepsStore,
		navigateToRecipeStore,
		createPlan,
		deletePlan,
		setActivePlan,
		setGoalQuantity,
		toggleStep,
		setExpandedSet,
		toggleExpanded,
		type PlannerView,
	} from "$lib/stores";
	import { inventoryStore, setInventoryQuantity } from "$lib/stores/inventory";
	import { m } from "$lib/paraglide/messages";

	function categoryName(cat: string): string {
		if (cat === "cooking") return m.crafting_category_cooking();
		if (cat === "alchemy") return m.crafting_category_alchemy();
		return m.crafting_category_draughts();
	}

	// ── Local UI State (truly per-render — not worth persisting across tabs) ──
	let showRecipeDropdown = $state(false);
	let creatingPlan = $state(false);
	let recipeHighlightIndex = $state(0);
	let recipeDropdownEl: HTMLDivElement | null = $state(null);

	// ── Derived expansion set for the active plan ──
	const expandedNodes = $derived(
		new Set($plannerExpandedNodesStore[$activePlanIdStore ?? ""] ?? []),
	);

	// ── Recipe search filter (min 2 chars) ──
	const filteredGoalRecipes = $derived(
		$plannerRecipeSearchStore.trim().length >= 2
			? $allRecipesStore
					.filter(({ recipe }) =>
						recipe.name.toLowerCase().includes($plannerRecipeSearchStore.toLowerCase()),
					)
					.slice(0, 15)
			: [],
	);

	// Keep the keyboard highlight in bounds + scroll into view
	$effect(() => {
		const len = filteredGoalRecipes.length;
		if (recipeHighlightIndex >= len) recipeHighlightIndex = 0;
	});

	$effect(() => {
		const idx = recipeHighlightIndex;
		if (!showRecipeDropdown || !recipeDropdownEl) return;
		requestAnimationFrame(() => {
			const el = recipeDropdownEl?.querySelector(`[data-idx="${idx}"]`) as HTMLElement | null;
			el?.scrollIntoView({ block: "nearest" });
		});
	});

	function handleGoalSearchKeyDown(e: KeyboardEvent) {
		if (!showRecipeDropdown || filteredGoalRecipes.length === 0) {
			if ((e.key === "ArrowDown" || e.key === "ArrowUp") && filteredGoalRecipes.length > 0) {
				e.preventDefault();
				showRecipeDropdown = true;
			}
			return;
		}
		if (e.key === "ArrowDown") {
			e.preventDefault();
			recipeHighlightIndex = Math.min(recipeHighlightIndex + 1, filteredGoalRecipes.length - 1);
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			recipeHighlightIndex = Math.max(recipeHighlightIndex - 1, 0);
		} else if (e.key === "Enter") {
			e.preventDefault();
			const match = filteredGoalRecipes[recipeHighlightIndex];
			if (match) handleSelectGoal(match.recipe, match.category);
		} else if (e.key === "Escape") {
			e.preventDefault();
			showRecipeDropdown = false;
		} else if (e.key === "Home") {
			e.preventDefault();
			recipeHighlightIndex = 0;
		} else if (e.key === "End") {
			e.preventDefault();
			recipeHighlightIndex = filteredGoalRecipes.length - 1;
		}
	}

	// ── Tree flattening for rendering ──
	interface TreeRow {
		node: PlannerNode;
		depth: number;
	}

	const treeRows = $derived.by(() => {
		const tree = $plannerTreeStore;
		if (!tree) return [];
		const rows: TreeRow[] = [];
		function flatten(node: PlannerNode, depth: number) {
			rows.push({ node, depth });
			if (node.children.length > 0 && expandedNodes.has(node.id)) {
				for (const child of node.children) flatten(child, depth + 1);
			}
		}
		flatten(tree, 0);
		return rows;
	});

	// ── Step grouping by depth ──
	interface StepGroup {
		label: string;
		steps: CraftingStep[];
	}

	const groupedSteps = $derived.by(() => {
		const steps = $craftingStepsStore;
		if (steps.length === 0) return [];

		const groups: StepGroup[] = [];
		let currentDepth = -1;

		for (const step of steps) {
			if (step.depth !== currentDepth) {
				currentDepth = step.depth;
				groups.push({ label: "", steps: [step] });
			} else {
				groups[groups.length - 1].steps.push(step);
			}
		}

		for (let i = 0; i < groups.length; i++) {
			const cat = groups[i].steps[0].category;
			const n = i + 1;
			if (i === groups.length - 1 && groups.length > 1) {
				groups[i].label = m.crafting_planner_step_final({ n });
			} else if (cat === "cooking") {
				groups[i].label = m.crafting_planner_step_cooking({ n });
			} else if (cat === "alchemy") {
				groups[i].label = m.crafting_planner_step_alchemy({ n });
			} else {
				groups[i].label = m.crafting_planner_step_draughts({ n });
			}
		}

		return groups;
	});

	// ── Progress ──
	const progress = $derived.by(() => {
		const steps = $craftingStepsStore;
		const done = steps.filter((s) => s.completed).length;
		const total = steps.length;
		return {
			done,
			total,
			pct: total > 0 ? Math.round((done / total) * 100) : 0,
		};
	});

	// ── Shopping list stats ──
	const shoppingStats = $derived.by(() => {
		const items = $shoppingListStore;
		const fulfilled = items.filter((i) => i.deficit === 0).length;
		return { total: items.length, fulfilled };
	});

	// ── Handlers ──
	function handleSelectGoal(recipe: Recipe, category: RecipeCategory) {
		createPlan(recipe.id, recipe.name, category, 1);
		plannerRecipeSearchStore.set("");
		showRecipeDropdown = false;
		creatingPlan = false;
	}

	function handleNewPlan() {
		creatingPlan = true;
		plannerRecipeSearchStore.set("");
	}

	function handleCancelNew() {
		creatingPlan = false;
		plannerRecipeSearchStore.set("");
		showRecipeDropdown = false;
	}

	function handleDelete() {
		if ($activePlanStore) deletePlan($activePlanStore.id);
	}

	function toggleNodeExpand(nodeId: string) {
		toggleExpanded($activePlanIdStore, nodeId);
	}

	function expandAll() {
		const tree = $plannerTreeStore;
		if (!tree) return;
		const ids = new Set<string>();
		function collect(node: PlannerNode) {
			if (node.isRecipe && node.children.length > 0) ids.add(node.id);
			for (const child of node.children) collect(child);
		}
		collect(tree);
		setExpandedSet($activePlanIdStore, ids);
	}

	function collapseAll() {
		setExpandedSet($activePlanIdStore, new Set());
	}

	function handleJumpToCraft(step: CraftingStep) {
		const entry = $allRecipesStore.find(({ recipe }) => recipe.id === step.recipeId);
		if (entry) {
			navigateToRecipeStore.set({
				recipe: entry.recipe,
				category: entry.category,
			});
		}
	}

	function updateHaveQty(itemId: string, value: string) {
		const qty = parseInt(value, 10);
		if (!isNaN(qty) && qty >= 0) setInventoryQuantity(itemId, qty);
	}

	function statusColor(deficit: number, needed: number): string {
		if (needed === 0) return "text-muted-foreground";
		if (deficit === 0) return "text-accent";
		if (deficit < needed) return "text-yellow-400";
		return "text-destructive";
	}

	function categoryEmoji(cat: string): string {
		if (cat === "cooking") return "🍳";
		if (cat === "alchemy") return "⚗️";
		return "🧪";
	}
</script>

<div class="flex flex-col h-full min-h-0 gap-2">
	<!-- ═══ Plan Selector Row ═══ -->
	<div class="flex items-center gap-1">
		{#if $plannerPlansStore.length > 0 && !creatingPlan}
			<select
				value={$activePlanIdStore ?? ""}
				onchange={(e) => setActivePlan(e.currentTarget.value || null)}
				class="flex-1 bg-input text-foreground border border-border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
			>
				<option value="">{m.crafting_planner_select_plan()}</option>
				{#each $plannerPlansStore as plan (plan.id)}
					<option value={plan.id}>
						{plan.goalQuantity}× {plan.goalRecipeName}
						({categoryEmoji(plan.goalCategory)})
					</option>
				{/each}
			</select>
		{/if}

		{#if creatingPlan}
			<button
				onclick={handleCancelNew}
				class="px-2 py-1 text-xs bg-secondary text-secondary-foreground rounded hover:bg-muted transition-colors"
			>
				{m.crafting_planner_cancel()}
			</button>
		{:else}
			<button
				onclick={handleNewPlan}
				class="px-2 py-1 text-xs bg-accent text-accent-foreground font-bold rounded hover:opacity-80 transition-opacity whitespace-nowrap"
			>
				{m.crafting_planner_new_plan()}
			</button>
		{/if}

		{#if $activePlanStore && !creatingPlan}
			<button
				onclick={handleDelete}
				class="px-2 py-1 text-xs bg-destructive/20 text-destructive rounded hover:bg-destructive/30 transition-colors"
				title={m.crafting_planner_delete()}
			>
				✕
			</button>
		{/if}
	</div>

	<!-- ═══ New Plan: Recipe Search ═══ -->
	{#if creatingPlan}
		<div class="relative">
			<label for="goal-search" class="text-[10px] font-bold neon-text-cyan">
				{m.crafting_planner_search_label()}
			</label>
			<input
				id="goal-search"
				type="text"
				bind:value={$plannerRecipeSearchStore}
				onfocus={() => (showRecipeDropdown = true)}
				onblur={() => setTimeout(() => (showRecipeDropdown = false), 200)}
				onkeydown={handleGoalSearchKeyDown}
				placeholder={m.crafting_planner_search_placeholder()}
				role="combobox"
				aria-expanded={showRecipeDropdown && filteredGoalRecipes.length > 0}
				aria-autocomplete="list"
				aria-controls="goal-search-listbox"
				aria-activedescendant={showRecipeDropdown && filteredGoalRecipes.length > 0 ? `goal-match-${recipeHighlightIndex}` : undefined}
				class="w-full bg-input text-foreground border border-border rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
			/>

			{#if showRecipeDropdown && filteredGoalRecipes.length > 0}
				<div
					bind:this={recipeDropdownEl}
					id="goal-search-listbox"
					role="listbox"
					class="absolute z-50 w-full mt-1 glass-dropdown rounded max-h-[200px] overflow-auto"
				>
					{#each filteredGoalRecipes as { recipe, category }, i (recipe.id)}
						<button
							id="goal-match-{i}"
							role="option"
							aria-selected={i === recipeHighlightIndex}
							data-idx={i}
							onmousedown={() => handleSelectGoal(recipe, category)}
							onmouseenter={() => (recipeHighlightIndex = i)}
							class="w-full flex items-center gap-2 px-2 py-1.5 text-left transition-colors border-b border-border last:border-b-0 {i === recipeHighlightIndex ? 'bg-primary/20 text-foreground' : 'hover:bg-secondary'}"
						>
							<div
								class="w-5 h-5 border border-muted rounded overflow-hidden bg-secondary flex-shrink-0 flex items-center justify-center"
							>
								{#if recipe.image}
									<img
										src="/{recipe.image}"
										alt={recipe.name}
										class="w-full h-full object-contain"
										onerror={(e) => {
											(e.currentTarget as HTMLImageElement).style.display = "none";
										}}
									/>
								{/if}
							</div>
							<span class="flex-1 text-xs truncate">{recipe.name}</span>
							<span class="text-[10px] text-muted-foreground">
								{categoryEmoji(category)} {categoryName(category)}
							</span>
						</button>
					{/each}
				</div>
			{/if}

			{#if $plannerRecipeSearchStore.trim().length >= 2 && filteredGoalRecipes.length === 0}
				<p class="text-[10px] text-muted-foreground mt-1">{m.crafting_planner_no_results()}</p>
			{/if}
		</div>
	{/if}

	<!-- ═══ Active Plan Content ═══ -->
	{#if $activePlanStore && !creatingPlan}
		{@const plan = $activePlanStore}

		<!-- Goal Info Row -->
		<div class="flex items-center gap-2 p-1.5 glass-card rounded">
			<div
				class="w-8 h-8 border border-primary rounded overflow-hidden bg-secondary flex-shrink-0 flex items-center justify-center"
			>
				{#if $plannerTreeStore?.image}
					<img
						src="/{$plannerTreeStore.image}"
						alt={plan.goalRecipeName}
						class="w-full h-full object-contain"
						onerror={(e) => {
							(e.currentTarget as HTMLImageElement).style.display = "none";
						}}
					/>
				{:else}
					<span class="text-muted-foreground text-sm">?</span>
				{/if}
			</div>

			<div class="flex-1 min-w-0">
				<p class="text-xs font-bold neon-text-purple truncate">
					{plan.goalRecipeName}
				</p>
				<p class="text-[10px] text-muted-foreground">
					{categoryEmoji(plan.goalCategory)}
					{categoryName(plan.goalCategory)}
				</p>
			</div>

			<!-- Quantity Input -->
			<div class="flex items-center gap-1">
				<span class="text-[10px] text-muted-foreground">{m.crafting_planner_qty()}</span>
				<input
					type="text"
					inputmode="numeric"
					pattern="[0-9]*"
					value={plan.goalQuantity}
					oninput={(e) => {
						const val = parseInt(e.currentTarget.value, 10);
						if (!isNaN(val) && val >= 1) setGoalQuantity(val);
					}}
					class="w-10 bg-input text-foreground border border-border rounded px-1 py-0.5 text-xs text-center focus:outline-none focus:ring-1 focus:ring-primary no-spinner"
				/>
			</div>

			<!-- Inventory Toggle -->
			<button
				onclick={() => inventoryAwareStore.update((v) => !v)}
				class="px-1.5 py-0.5 text-[10px] rounded border transition-colors whitespace-nowrap {$inventoryAwareStore
					? 'border-accent text-accent bg-accent/10'
					: 'border-border text-muted-foreground bg-secondary'}"
				title={$inventoryAwareStore
					? m.crafting_planner_inv_aware_on()
					: m.crafting_planner_inv_aware_off()}
			>
				{$inventoryAwareStore ? m.crafting_planner_still_needed() : m.crafting_planner_total()}
			</button>
		</div>

		<!-- View Toggle Bar -->
		<div class="flex gap-1">
			{#each [
				{ id: "tree", label: () => m.crafting_planner_view_tree() },
				{ id: "shopping", label: () => m.crafting_planner_view_shopping() },
				{ id: "steps", label: () => m.crafting_planner_view_steps() },
			] as view (view.id)}
				<button
					onclick={() => plannerViewStore.set(view.id as PlannerView)}
					class="flex-1 px-2 py-1 text-xs rounded transition-colors {$plannerViewStore ===
					view.id
						? 'bg-primary text-primary-foreground font-bold'
						: 'bg-secondary text-secondary-foreground hover:bg-muted'}"
				>
					{view.label()}
				</button>
			{/each}
		</div>

		<!-- ═══ Tree View ═══ -->
		{#if $plannerViewStore === "tree"}
			{#if $plannerTreeStore}
				<!-- Expand/Collapse Controls -->
				<div class="flex items-center justify-between">
					<p class="text-[10px] font-bold neon-text-cyan">
						{m.crafting_planner_tree_header({ qty: plan.goalQuantity, name: plan.goalRecipeName })}
					</p>
					<div class="flex gap-2">
						<button
							onclick={expandAll}
							class="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
							title={m.crafting_planner_expand_all()}
						>
							▼ All
						</button>
						<button
							onclick={collapseAll}
							class="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
							title={m.crafting_planner_collapse_all()}
						>
							▶ All
						</button>
					</div>
				</div>

				<!-- Column Headers -->
				<div class="flex items-center text-[9px] text-muted-foreground px-1">
					<span class="flex-1">{m.crafting_planner_col_recipe()}</span>
					<span class="w-12 text-right">{m.crafting_planner_col_need()}</span>
					<span class="w-12 text-center">{m.crafting_planner_col_have()}</span>
					<span class="w-12 text-right">{m.crafting_planner_col_deficit()}</span>
				</div>

				<!-- Tree Rows -->
				<div class="space-y-0 flex-1 min-h-[200px] overflow-auto">
					{#each treeRows as { node, depth }, i (i)}
						<div
							class="flex items-center gap-1 py-0.5 px-1 hover:bg-secondary/50 rounded transition-colors"
							style="padding-left: {depth * 16 + 4}px"
						>
							<!-- Expand/Collapse Arrow -->
							{#if node.isRecipe && node.children.length > 0}
								<button
									onclick={() => toggleNodeExpand(node.id)}
									class="w-4 text-xs text-muted-foreground hover:text-foreground flex-shrink-0"
								>
									{expandedNodes.has(node.id) ? "▼" : "▶"}
								</button>
							{:else}
								<span class="w-4 text-xs text-muted-foreground/30 flex-shrink-0 text-center">│</span>
							{/if}

							<!-- Image -->
							<div
								class="w-4 h-4 border border-muted rounded overflow-hidden bg-secondary flex-shrink-0 flex items-center justify-center"
							>
								{#if node.image}
									<img
										src="/{node.image}"
										alt={node.name}
										class="w-full h-full object-contain"
										onerror={(e) => {
											(e.currentTarget as HTMLImageElement).style.display = "none";
										}}
									/>
								{/if}
							</div>

							<!-- Name -->
							<span
								class="flex-1 text-xs truncate {node.isRecipe
									? 'font-medium'
									: 'text-muted-foreground'}"
							>
								{node.name}
								{#if node.quantityPerCraft > 1 && depth > 0}
									<span class="text-[10px] text-muted-foreground">
										×{node.quantityPerCraft}
									</span>
								{/if}
							</span>

							<!-- Stats -->
							<span class="w-12 text-right text-[10px] text-muted-foreground">
								{node.quantityNeeded}
							</span>
							<!-- svelte-ignore a11y_click_events_have_key_events -->
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<span class="w-12" onclick={(e) => e.stopPropagation()}>
								<input
									type="text"
									inputmode="numeric"
									pattern="[0-9]*"
									value={node.inventoryQuantity}
									oninput={(e) => {
										const val = e.currentTarget.value;
										if (val === "" || /^\d+$/.test(val)) {
											updateHaveQty(node.id, val || "0");
										}
									}}
									class="w-full bg-input text-foreground border border-border rounded px-1 py-0 text-[10px] text-center focus:outline-none focus:ring-1 focus:ring-primary no-spinner"
								/>
							</span>
							<span
								class="w-12 text-right text-[10px] font-bold {statusColor(
									node.deficit,
									node.quantityNeeded,
								)}"
							>
								{#if node.quantityNeeded === 0}
									—
								{:else if node.deficit === 0}
									✓
								{:else}
									-{node.deficit}
								{/if}
							</span>
						</div>
					{/each}
				</div>
			{:else}
				<div class="text-center py-4 text-muted-foreground">
					<p class="text-xs">{m.crafting_planner_could_not_resolve({ name: plan.goalRecipeName })}</p>
				</div>
			{/if}

		<!-- ═══ Shopping List View ═══ -->
		{:else if $plannerViewStore === "shopping"}
			<div class="flex items-center justify-between">
				<p class="text-[10px] font-bold neon-text-cyan">
					{m.crafting_planner_shopping_header({ qty: plan.goalQuantity, name: plan.goalRecipeName })}
				</p>
				<p class="text-[10px] text-muted-foreground">
					{m.crafting_planner_ready({ fulfilled: shoppingStats.fulfilled, total: shoppingStats.total })}
				</p>
			</div>

			<!-- Column Headers -->
			<div class="flex items-center text-[9px] text-muted-foreground px-1">
				<span class="flex-1">{m.crafting_planner_col_material()}</span>
				<span class="w-12 text-right">{m.crafting_planner_col_need()}</span>
				<span class="w-14 text-center">{m.crafting_planner_col_have()}</span>
				<span class="w-12 text-right">{m.crafting_planner_col_deficit()}</span>
			</div>

			<!-- Shopping Items -->
			<div class="space-y-0 flex-1 min-h-[200px] overflow-auto">
				{#each $shoppingListStore as item (item.itemId)}
					{@const fulfilled = item.deficit === 0}
					<div
						class="flex items-center gap-1 py-0.5 px-1 rounded transition-colors {fulfilled
							? 'opacity-60'
							: 'hover:bg-secondary/50'}"
					>
						<!-- Image -->
						<div
							class="w-5 h-5 border border-muted rounded overflow-hidden bg-secondary flex-shrink-0 flex items-center justify-center"
						>
							{#if item.image}
								<img
									src="/{item.image}"
									alt={item.name}
									class="w-full h-full object-contain"
									onerror={(e) => {
										(e.currentTarget as HTMLImageElement).style.display = "none";
									}}
								/>
							{/if}
						</div>

						<!-- Name -->
						<span class="flex-1 text-xs truncate {fulfilled ? 'line-through' : ''}">
							{item.name}
						</span>

						<!-- Need -->
						<span class="w-12 text-right text-[10px] text-muted-foreground">
							{item.quantityNeeded}
						</span>

						<!-- Have (editable) -->
						<input
							type="text"
							inputmode="numeric"
							pattern="[0-9]*"
							value={item.inventoryQuantity}
							oninput={(e) => {
								const val = e.currentTarget.value;
								if (val === "" || /^\d+$/.test(val)) {
									updateHaveQty(item.itemId, val || "0");
								}
							}}
							class="w-14 bg-input text-foreground border rounded px-1 py-0.5 text-[10px] text-center focus:outline-none focus:ring-1 focus:ring-primary no-spinner {fulfilled
								? 'border-accent/50'
								: 'border-border'}"
						/>

						<!-- Deficit -->
						<span
							class="w-12 text-right text-[10px] font-bold {statusColor(
								item.deficit,
								item.quantityNeeded,
							)}"
						>
							{#if item.deficit === 0}
								✓
							{:else}
								-{item.deficit}
							{/if}
						</span>
					</div>
				{/each}

				{#if $shoppingListStore.length === 0}
					<p class="text-center text-xs text-muted-foreground py-4">
						{m.crafting_planner_no_materials()}
					</p>
				{/if}
			</div>

		<!-- ═══ Steps View ═══ -->
		{:else if $plannerViewStore === "steps"}
			<div class="flex items-center justify-between">
				<p class="text-[10px] font-bold neon-text-cyan">
					{m.crafting_planner_steps_header({ qty: plan.goalQuantity, name: plan.goalRecipeName })}
				</p>
				<p class="text-[10px] text-muted-foreground">
					{m.crafting_planner_done({ done: progress.done, total: progress.total })}
				</p>
			</div>

			<!-- Progress Bar -->
			{#if progress.total > 0}
				<div class="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
					<div
						class="h-full bg-accent rounded-full transition-all duration-300"
						style="width: {progress.pct}%"
					></div>
				</div>
			{/if}

			<!-- Step Groups -->
			<div class="space-y-2 flex-1 min-h-[200px] overflow-auto">
				{#each groupedSteps as group, groupIdx (groupIdx)}
					<!-- Group Header -->
					<div class="border-b border-border pb-0.5">
						<p class="text-[10px] font-bold neon-text-purple">{group.label}</p>
					</div>

					<!-- Steps in Group -->
					{#each group.steps as step (step.recipeId)}
						{@const isCompleted = step.completed}
						<div
							class="flex items-start gap-1.5 py-1 px-1 rounded transition-colors {isCompleted
								? 'opacity-50'
								: 'hover:bg-secondary/50'}"
						>
							<!-- Checkbox -->
							<input
								type="checkbox"
								checked={isCompleted}
								onchange={() => toggleStep(step.recipeId)}
								class="w-3.5 h-3.5 mt-0.5 flex-shrink-0 accent-accent cursor-pointer"
							/>

							<!-- Step Content -->
							<div class="flex-1 min-w-0">
								<div class="flex items-center gap-1">
									<!-- Recipe Image -->
									<div
										class="w-5 h-5 border border-muted rounded overflow-hidden bg-secondary flex-shrink-0 flex items-center justify-center"
									>
										{#if step.image}
											<img
												src="/{step.image}"
												alt={step.recipeName}
												class="w-full h-full object-contain"
												onerror={(e) => {
													(e.currentTarget as HTMLImageElement).style.display =
														"none";
												}}
											/>
										{/if}
									</div>

									<!-- Recipe Name + Qty -->
									<span
										class="text-xs font-medium truncate {isCompleted
											? 'line-through'
											: ''}"
									>
										{m.crafting_planner_craft_step({ qty: step.quantity, name: step.recipeName })}
									</span>
								</div>

								<!-- Ingredients with inline Have inputs -->
								<div class="mt-0.5 pl-6 space-y-0.5">
									{#each step.ingredients as ing (ing.itemId)}
										{@const invQty = $inventoryStore.get(ing.itemId.toLowerCase()) ?? $inventoryStore.get(ing.itemId.toLowerCase().replace(/_/g, " ")) ?? $inventoryStore.get(ing.itemId.toLowerCase().replace(/ /g, "_")) ?? 0}
										<div class="flex items-center gap-1 text-[10px] text-muted-foreground">
											<span class="truncate">{ing.name} ×{ing.amount}</span>
											<span class="text-[9px] ml-auto shrink-0">{m.crafting_planner_have_inline()}</span>
											<input
												type="text"
												inputmode="numeric"
												pattern="[0-9]*"
												value={invQty}
												oninput={(e) => {
													const val = e.currentTarget.value;
													if (val === "" || /^\d+$/.test(val)) {
														updateHaveQty(ing.itemId, val || "0");
													}
												}}
												class="w-10 bg-input text-foreground border border-border rounded px-1 py-0 text-[10px] text-center focus:outline-none focus:ring-1 focus:ring-primary no-spinner shrink-0"
											/>
										</div>
									{/each}
								</div>
							</div>

							<!-- Jump to Craft -->
							<button
								onclick={() => handleJumpToCraft(step)}
								class="text-xs text-primary hover:text-primary/80 flex-shrink-0 mt-0.5 transition-colors"
								title={m.crafting_planner_jump()}
							>
								→
							</button>
						</div>
					{/each}
				{/each}

				{#if $craftingStepsStore.length === 0}
					<p class="text-center text-xs text-muted-foreground py-4">
						{m.crafting_planner_no_steps()}
					</p>
				{/if}
			</div>
		{/if}

	<!-- ═══ No Plan / Empty State ═══ -->
	{:else if !creatingPlan}
		<div class="text-center py-8 text-muted-foreground space-y-2">
			<p class="text-sm">{m.crafting_planner_empty_title()}</p>
			<p class="text-xs">
				{m.crafting_planner_empty_subtitle()}
			</p>
			<button
				onclick={handleNewPlan}
				class="px-4 py-1.5 text-xs bg-accent text-accent-foreground font-bold rounded hover:opacity-80 transition-opacity"
			>
				{m.crafting_planner_create_first()}
			</button>
		</div>
	{/if}
</div>
