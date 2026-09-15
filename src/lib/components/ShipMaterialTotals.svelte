<script lang="ts">
	/**
	 * Rolls the selected upgrade path up into one material list, with each
	 * craftable entry expandable into its recipe, and a flat raw-ingredient
	 * shopping list at the bottom.
	 *
	 * The arithmetic lives in services/ship-materials.ts (tested); this file only
	 * renders it.
	 */
	import type {
		ShipUpgradePathDef,
		ShipProgress,
		ShipRecipeNoteKey,
	} from "$lib/models/bartering";
	import { shipMaterialRecipesStore, shipIngredientsStore, updateShipIngredient } from "$lib/stores";
	import {
		shipTotalsOpenStore,
		shipTotalsGrossStore,
		shipTotalsExpandedStore,
	} from "$lib/stores/ui-state";
	import {
		computeShipMaterialTotals,
		rollUpIngredients,
		massProcessBatches,
		type ShipMaterialTotal,
	} from "$lib/services/ship-materials";
	import { sourceBadge } from "$lib/constants/ship-sources";
	import { m } from "$lib/paraglide/messages";
	import { formatNumber } from "$lib/utils/format";

	interface Props {
		path: ShipUpgradePathDef | undefined;
		progress: ShipProgress;
	}

	let { path, progress }: Props = $props();

	let totals = $derived(
		computeShipMaterialTotals(
			path,
			progress,
			$shipMaterialRecipesStore,
			$shipTotalsGrossStore,
			$shipIngredientsStore
		)
	);

	/** Rows worth showing: in remaining mode, hide anything already covered. */
	let visibleTotals = $derived(
		$shipTotalsGrossStore ? totals : totals.filter((t) => t.remaining > 0)
	);

	let rawList = $derived(rollUpIngredients(visibleTotals));

	let stageNames = $derived.by(() => {
		const map: Record<string, string> = {};
		for (const stage of path?.stages ?? []) map[stage.id] = stage.pieceName;
		return map;
	});

	const METHOD_LABELS: Record<string, () => string> = {
		manufacture: () => m.bartering_ships_recipe_method_manufacture(),
		simpleAlchemy: () => m.bartering_ships_recipe_method_simple_alchemy(),
		enhance: () => m.bartering_ships_recipe_method_enhance(),
	};

	// The recipe data ships untranslated, so it carries a key and the prose lives here.
	const NOTE_LABELS: Record<ShipRecipeNoteKey, () => string> = {
		enhance_stage: () => m.bartering_ships_recipe_note_enhance_stage(),
		untracked_chain: () => m.bartering_ships_recipe_note_untracked_chain(),
	};

	/** A row opens only if there is something behind the arrow. */
	function hasDetail(total: ShipMaterialTotal): boolean {
		return Boolean(total.recipe);
	}

	function toggleRow(baseId: string): void {
		shipTotalsExpandedStore.update((s) => ({ ...s, [baseId]: !s[baseId] }));
	}

	function handleIngredientChange(ingredientId: string, value: string): void {
		const qty = parseInt(value || "0", 10);
		updateShipIngredient(ingredientId, isNaN(qty) ? 0 : qty);
	}
</script>

<!-- Nothing to total until the path data has loaded; the stage list below guards the same way. -->
{#if path}
<div class="paper-card overflow-hidden">
	<!-- Panel header -->
	<div class="w-full px-3 py-2 flex items-center gap-2">
		<button
			onclick={() => shipTotalsOpenStore.set(!$shipTotalsOpenStore)}
			class="flex items-center gap-2 flex-1 text-left hover:bg-white/[0.02] transition-colors cursor-pointer -mx-1 px-1 py-0.5 rounded"
			title={$shipTotalsOpenStore ? m.bartering_ships_totals_hide() : m.bartering_ships_totals_show()}
		>
			<span class="text-[12px] {$shipTotalsOpenStore ? 'rotate-90' : 'rotate-0'} transition-transform inline-block">&#9654;</span>
			<h3 class="text-[12px] font-headline font-bold text-muted-foreground uppercase tracking-wider">
				{m.bartering_ships_totals_title()}
			</h3>
			<span class="text-[12px] font-mono text-muted-foreground/60">
				{visibleTotals.length}
			</span>
		</button>

		<!-- Remaining / full-path toggle -->
		<div class="flex gap-1 shrink-0">
			{#each [{ gross: false, label: m.bartering_ships_totals_toggle_remaining() }, { gross: true, label: m.bartering_ships_totals_toggle_gross() }] as opt}
				<button
					onclick={() => shipTotalsGrossStore.set(opt.gross)}
					class="px-2 py-0.5 text-[12px] font-bold rounded transition-colors border
						{$shipTotalsGrossStore === opt.gross
							? 'text-primary border-primary/40 bg-primary/10'
							: 'text-muted-foreground border-outline-variant/20 hover:bg-white/[0.03]'}"
				>
					{opt.label}
				</button>
			{/each}
		</div>
	</div>

	{#if $shipTotalsOpenStore}
		<div class="border-t border-outline-variant/10 px-3 py-2">
			<p class="text-[12px] text-muted-foreground/60 mb-2">
				{$shipTotalsGrossStore
					? m.bartering_ships_totals_subtitle_gross({ ship: path?.label ?? "" })
					: m.bartering_ships_totals_subtitle_remaining({ ship: path?.label ?? "" })}
			</p>

			{#if visibleTotals.length === 0}
				<p class="text-[12px] text-muted-foreground py-2">{m.bartering_ships_totals_all_done()}</p>
			{:else}
				{#each visibleTotals as total (total.baseId)}
					{@const badge = sourceBadge(total.source)}
					{@const expandable = hasDetail(total)}
					{@const expanded = ($shipTotalsExpandedStore[total.baseId] ?? false) && expandable}
					{@const batches = massProcessBatches(total)}
					<div class="border-b border-outline-variant/5 last:border-b-0">
						<!-- Material row. Always a button so keyboard/AT get real semantics;
						     disabled when there is no recipe behind the arrow. -->
						<button
							type="button"
							disabled={!expandable}
							onclick={() => toggleRow(total.baseId)}
							class="w-full text-left flex items-center gap-2 py-1 {expandable ? 'cursor-pointer hover:bg-white/[0.02]' : 'cursor-default'}"
						>
							<span class="text-[12px] w-3 shrink-0 {expanded ? 'rotate-90' : 'rotate-0'} transition-transform inline-block text-muted-foreground/50">
								{expandable ? "▶" : ""}
							</span>

							<span class="text-[10.5px] font-mono px-1 rounded shrink-0 {badge.chip}" title={badge.title()}>
								{badge.code}
							</span>

							{#if total.image}
								<img src={"/" + total.image} alt="" class="w-9 h-9 rounded-md object-contain flex-shrink-0 icon-frame" />
							{/if}

							<span class="text-[12px] text-foreground flex-1 min-w-0 truncate">{total.name}</span>

							<span class="text-[12px] text-muted-foreground/50 shrink-0 hidden sm:inline">
								{total.stageIds.length === 1
									? m.bartering_ships_totals_stage_count_one()
									: m.bartering_ships_totals_stage_count({ count: total.stageIds.length })}
							</span>

							<span class="text-[12.5px] font-mono font-bold text-foreground w-14 text-right shrink-0">
								{formatNumber(total.basis)}
							</span>
							<!-- In full-path mode the basis IS the requirement, so the "/ needed" half would just repeat it. -->
							<span class="text-[12px] font-mono text-muted-foreground/60 w-16 text-right shrink-0">
								{$shipTotalsGrossStore ? "" : `/ ${formatNumber(total.needed)}`}
							</span>
						</button>

						<!-- Recipe -->
						{#if expanded && total.recipe}
							{@const recipe = total.recipe}
							<div class="pl-8 pr-1 pb-2 pt-0.5">
								<div class="flex items-center gap-2 mb-1">
									<span class="text-[12px] text-muted-foreground uppercase tracking-wider font-bold">
										{(METHOD_LABELS[recipe.method] ?? METHOD_LABELS.manufacture)()}
									</span>
									{#if recipe.ingredients.length > 0 && total.crafts > 0}
										<span class="text-[12px] font-mono text-primary">
											{m.bartering_ships_recipe_crafts_needed({ count: formatNumber(total.crafts) })}
										</span>
									{/if}
								</div>

								{#if recipe.ingredients.length > 0}
									{#each total.ingredients as ing (ing.id)}
										{@const ingBadge = sourceBadge(ing.source)}
										{@const done = ing.short === 0}
										<div class="flex items-center gap-2 py-0.5">
											<span class="text-[10.5px] font-mono px-1 rounded shrink-0 {ingBadge.chip}" title={ingBadge.title()}>
												{ingBadge.code}
											</span>
											{#if ing.image}
												<img src={"/" + ing.image} alt="" class="w-7 h-7 rounded-md object-contain flex-shrink-0 icon-frame" />
											{/if}
											<span class="text-[12px] flex-1 min-w-0 truncate {done ? 'text-muted-foreground line-through opacity-50' : 'text-muted-foreground'}">
												{ing.name}
											</span>
											<input
												type="number"
												value={ing.held}
												onchange={(e) => handleIngredientChange(ing.id, (e.target as HTMLInputElement).value)}
												min="0"
												title={m.bartering_ships_ingredient_hint()}
												class="paper-input text-[12px] font-mono px-1 py-0.5 w-14 text-center no-spinner"
											/>
											<span class="text-[12px] text-muted-foreground">/</span>
											<span class="text-[12px] font-mono text-muted-foreground w-14 text-right shrink-0">
												{formatNumber(ing.amount)}
											</span>
										</div>
									{/each}

									{#if total.crafts > 0}
										<p class="text-[12px] text-primary font-mono mt-1">
											{m.bartering_ships_recipe_can_craft({ count: formatNumber(total.craftableNow) })}
										</p>
									{/if}
								{/if}

								{#if recipe.massProcess?.extra && batches}
									<div class="flex items-center gap-1.5 mt-1">
										{#if recipe.massProcess.extra.image}
											<img
												src={"/" + recipe.massProcess.extra.image}
												alt=""
												class="w-5 h-5 rounded object-contain flex-shrink-0 icon-frame"
											/>
										{/if}
										<p class="text-[12px] text-muted-foreground/60">
											{m.bartering_ships_recipe_mass_process({
												batch: recipe.massProcess.batch,
												amount: recipe.massProcess.extra.amount,
												extra: recipe.massProcess.extra.name,
												batches: formatNumber(batches),
											})}
										</p>
									</div>
								{/if}

								{#if recipe.alternative}
									<p class="text-[12px] text-muted-foreground/60 mt-1">
										{m.bartering_ships_recipe_alternative({
											source: recipe.alternative.exchangeWith,
											amount: formatNumber(recipe.alternative.gives),
										})}
									</p>
								{/if}

								{#if total.producedByStageId}
									<p class="text-[12px] text-muted-foreground/60 mt-1">
										{m.bartering_ships_recipe_built_by_stage({
											stage: stageNames[total.producedByStageId] ?? total.producedByStageId,
										})}
									</p>
								{:else if recipe.noteKey && NOTE_LABELS[recipe.noteKey]}
									<p class="text-[12px] text-muted-foreground/60 mt-1">
										{NOTE_LABELS[recipe.noteKey]()}
									</p>
								{/if}
							</div>
						{/if}
					</div>
				{/each}

				<!-- Flat raw ingredient roll-up -->
				{#if rawList.length > 0}
					<div class="mt-3 pt-2 border-t border-outline-variant/20">
						<h4 class="text-[12px] font-headline font-bold text-muted-foreground uppercase tracking-wider">
							{m.bartering_ships_raw_title()}
						</h4>
						<p class="text-[12px] text-muted-foreground/60">{m.bartering_ships_raw_subtitle()}</p>
						<p class="text-[12px] text-muted-foreground/60 mb-1">{m.bartering_ships_raw_shared_note()}</p>
						{#each rawList as ing (ing.id)}
							{@const ingBadge = sourceBadge(ing.source)}
							{@const covered = ing.short === 0}
							<div class="flex items-center gap-2 py-0.5">
								<span class="text-[10.5px] font-mono px-1 rounded shrink-0 {ingBadge.chip}" title={ingBadge.title()}>
									{ingBadge.code}
								</span>
								{#if ing.image}
									<img src={"/" + ing.image} alt="" class="w-7 h-7 rounded-md object-contain flex-shrink-0 icon-frame" />
								{/if}
								<span class="text-[12px] flex-1 min-w-0 truncate {covered ? 'text-foreground line-through opacity-50' : 'text-foreground'}">
									{ing.name}
								</span>
								<span class="text-[12px] font-mono w-20 text-right shrink-0 {covered ? 'text-muted-foreground/60' : 'text-primary'}">
									{covered
										? m.bartering_ships_raw_covered()
										: m.bartering_ships_raw_short({ count: formatNumber(ing.short) })}
								</span>
								<input
									type="number"
									value={ing.held}
									onchange={(e) => handleIngredientChange(ing.id, (e.target as HTMLInputElement).value)}
									min="0"
									title={m.bartering_ships_ingredient_hint()}
									class="paper-input text-[12px] font-mono px-1 py-0.5 w-14 text-center no-spinner"
								/>
								<span class="text-[12px] text-muted-foreground">/</span>
								<span class="text-[12.5px] font-mono font-bold text-foreground w-14 text-right shrink-0">
									{formatNumber(ing.amount)}
								</span>
							</div>
						{/each}
					</div>
				{/if}
			{/if}
		</div>
	{/if}
</div>
{/if}
