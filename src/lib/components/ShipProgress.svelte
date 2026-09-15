<script lang="ts">
	import {
		shipUpgradesStore,
		shipStatsStore,
		shipProgressStore,
		updateShipMaterial,
		toggleShipStage,
		barterInventoryStore,
	} from "$lib/stores";
	import {
		shipSelectedVariantStore,
		shipStageCollapsedStore,
	} from "$lib/stores/ui-state";
	import type { CarrackVariant, ShipUpgradePathDef } from "$lib/models/bartering";
	import { sourceBadge } from "$lib/constants/ship-sources";
	import { m } from "$lib/paraglide/messages";
	import { formatNumber } from "$lib/utils/format";
	import ShipMaterialTotals from "./ShipMaterialTotals.svelte";

	// Selection and per-stage collapse live in ui-state so they survive tab switches.
	let selectedVariant = $derived($shipSelectedVariantStore);
	let collapsed = $derived($shipStageCollapsedStore);

	// Derived: current path definition
	let currentPath = $derived<ShipUpgradePathDef | undefined>(
		$shipUpgradesStore?.paths.find((p) => p.variant === selectedVariant)
	);

	// Derived: current progress
	let currentProgress = $derived(
		$shipProgressStore.find((p) => p.variant === selectedVariant)
			?? { variant: selectedVariant, materials: {}, completedStages: {} }
	);

	// Calculate stage progress percentage
	function stageProgress(stage: { materials: { id: string; needed: number }[] }): number {
		if (!stage.materials.length) return 0;
		let totalNeeded = 0;
		let totalHave = 0;
		for (const mat of stage.materials) {
			totalNeeded += mat.needed;
			const have = Math.min(currentProgress.materials[mat.id] ?? 0, mat.needed);
			totalHave += have;
		}
		return totalNeeded > 0 ? Math.round((totalHave / totalNeeded) * 100) : 0;
	}

	let overallProgress = $derived.by(() => {
		if (!currentPath) return 0;
		let totalNeeded = 0;
		let totalHave = 0;
		for (const stage of currentPath.stages) {
			if (currentProgress.completedStages[stage.id]) {
				for (const mat of stage.materials) {
					totalNeeded += mat.needed;
					totalHave += mat.needed;
				}
			} else {
				for (const mat of stage.materials) {
					totalNeeded += mat.needed;
					totalHave += Math.min(currentProgress.materials[mat.id] ?? 0, mat.needed);
				}
			}
		}
		return totalNeeded > 0 ? Math.round((totalHave / totalNeeded) * 100) : 0;
	});

	function handleMaterialChange(materialId: string, value: string) {
		const qty = parseInt(value || "0", 10);
		updateShipMaterial(selectedVariant, materialId, isNaN(qty) ? 0 : qty);
	}

	function toggleCollapse(stageId: string, currentlyCollapsed: boolean) {
		shipStageCollapsedStore.update((c) => ({ ...c, [stageId]: !currentlyCollapsed }));
	}

	/** A stage counts as "tracked" once any of its materials has progress. */
	function isTracked(stage: { materials: { id: string }[] }): boolean {
		return stage.materials.some((m) => (currentProgress.materials[m.id] ?? 0) > 0);
	}

	const VARIANT_OPTIONS: { value: CarrackVariant; label: string; ship: string }[] = [
		{ value: "advance", label: "Advance", ship: "Caravel" },
		{ value: "balance", label: "Balance", ship: "Caravel" },
		{ value: "volante", label: "Volante", ship: "Galleass" },
		{ value: "valor", label: "Valor", ship: "Galleass" },
		{ value: "panokseon", label: "Panokseon", ship: "Panokseon" },
	];

	const BASE_SHIP_LABELS: Record<string, string> = {
		caravel: "Caravel",
		galleass: "Galleass",
		panokseon: "Panokseon",
	};

	// label is a thunk so it re-translates when locale changes
	const STAT_LABELS: { key: string; label: () => string; format?: (v: number) => string }[] = [
		{ key: "weight", label: () => m.bartering_ships_stat_weight(), format: (v) => formatNumber(v) },
		{ key: "speed", label: () => m.bartering_ships_stat_speed() },
		{ key: "accel", label: () => m.bartering_ships_stat_accel() },
		{ key: "turn", label: () => m.bartering_ships_stat_turn() },
		{ key: "brake", label: () => m.bartering_ships_stat_brake() },
		{ key: "hp", label: () => m.bartering_ships_stat_hp(), format: (v) => (v / 1000).toFixed(0) + "K" },
		{ key: "inventory", label: () => m.bartering_ships_stat_inventory() },
		{ key: "reloadSeconds", label: () => m.bartering_ships_stat_reload(), format: (v) => v + "s" },
	];
</script>

<div class="space-y-3">
	<!-- Variant Selector -->
	<div class="paper-card p-3">
		<div class="flex items-center gap-3 mb-2">
			<span class="text-[12px] text-muted-foreground">{m.bartering_ships_carrack_path()}</span>
			<div class="flex gap-1 flex-1">
				{#each VARIANT_OPTIONS as opt}
					<button
						onclick={() => shipSelectedVariantStore.set(opt.value)}
						class="px-2 py-1 text-[12px] font-bold rounded transition-colors border
							{selectedVariant === opt.value
								? 'text-primary border-primary/40 bg-primary/10'
								: 'text-muted-foreground border-outline-variant/20 hover:bg-white/[0.03]'}"
					>
						{opt.label}
					</button>
				{/each}
			</div>
		</div>

		{#if currentPath}
			<div class="flex items-center justify-between text-[12px]">
				<span class="text-muted-foreground">
					{BASE_SHIP_LABELS[currentPath.baseShip] ?? currentPath.baseShip} &rarr; {currentPath.label}
				</span>
				<span class="text-muted-foreground/60">{currentPath.description}</span>
			</div>

			<!-- Overall Progress Bar -->
			<div class="mt-2">
				<div class="flex items-center justify-between text-[12px] mb-1">
					<span class="text-muted-foreground">{m.bartering_ships_overall_progress()}</span>
					<span class="font-mono font-bold text-foreground">{overallProgress}%</span>
				</div>
				<div class="w-full h-2 bg-surface-lowest rounded-full overflow-hidden">
					<div
						class="h-full rounded-full transition-all duration-300 bg-primary"
						style="width: {overallProgress}%"
					></div>
				</div>
				<div class="flex justify-between text-[12px] text-muted-foreground/60 mt-1">
					<span>{m.bartering_ships_crow_coins({ amount: formatNumber($barterInventoryStore.crowCoins) })}</span>
				</div>
			</div>
		{/if}
	</div>

	<!-- Rolled-up material totals + recipes -->
	<ShipMaterialTotals path={currentPath} progress={currentProgress} />

	<!-- Stages -->
	{#if currentPath}
		{#each currentPath.stages as stage (stage.id)}
			{@const progress = stageProgress(stage)}
			{@const isCompleted = currentProgress.completedStages[stage.id] ?? false}
			<!-- Default: collapsed. Only stages with entered material progress open themselves. -->
			{@const isCollapsed = collapsed[stage.id] ?? (isCompleted || !isTracked(stage))}
			<div class="paper-card overflow-hidden {isCompleted ? 'opacity-60' : ''}">
				<!-- Stage Header -->
				<button
					onclick={() => toggleCollapse(stage.id, isCollapsed)}
					class="w-full px-3 py-2 flex items-center gap-2 hover:bg-white/[0.02] transition-colors cursor-pointer"
				>
					<span class="text-[12px] {isCollapsed ? 'rotate-0' : 'rotate-90'} transition-transform inline-block">&#9654;</span>

					<!-- Completed checkbox -->
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<span
						role="checkbox"
						aria-checked={isCompleted}
						tabindex="0"
						onclick={(e: MouseEvent) => { e.stopPropagation(); toggleShipStage(selectedVariant, stage.id); }}
						onkeydown={(e: KeyboardEvent) => { if (e.key === ' ' || e.key === 'Enter') { e.stopPropagation(); toggleShipStage(selectedVariant, stage.id); } }}
						class="w-4 h-4 rounded border flex items-center justify-center text-[12px] shrink-0 cursor-pointer
							{isCompleted
								? 'bg-primary/20 border-primary/40 text-primary'
								: 'border-outline-variant/30 hover:border-primary/40'}"
						title={isCompleted ? m.bartering_ships_mark_incomplete() : m.bartering_ships_mark_complete()}
					>
						{#if isCompleted}&#10003;{/if}
					</span>

					{#if stage.image}
						<img src={"/" + stage.image} alt="" class="w-10 h-10 rounded-lg object-contain flex-shrink-0 icon-frame" />
					{/if}
					<span class="text-[12.5px] font-headline font-bold text-foreground flex-1 text-left">{stage.pieceName}</span>

					<!-- Progress -->
					<div class="flex items-center gap-2">
						<div class="w-16 h-1.5 bg-surface-lowest rounded-full overflow-hidden">
							<div
								class="h-full rounded-full bg-primary"
								style="width: {isCompleted ? 100 : progress}%"
							></div>
						</div>
						<span class="text-[12px] font-mono {isCompleted || progress >= 100 ? 'text-foreground' : 'text-muted-foreground'} w-8 text-right">
							{isCompleted ? 100 : progress}%
						</span>
					</div>
				</button>

				<!-- Materials List -->
				{#if !isCollapsed && !isCompleted}
					<div class="border-t border-outline-variant/10 px-3 py-1">
						{#each stage.materials as mat (mat.id)}
							{@const have = currentProgress.materials[mat.id] ?? 0}
							{@const pct = Math.min(100, Math.round((have / mat.needed) * 100))}
							{@const done = have >= mat.needed}
							{@const badge = sourceBadge(mat.source)}
							<div class="flex items-center gap-2 py-1">
								<!-- Source badge -->
								<span class="text-[10.5px] font-mono px-1 rounded {badge.chip}" title={badge.title()}>
									{badge.code}
								</span>

								{#if mat.image}
									<img src={"/" + mat.image} alt="" class="w-9 h-9 rounded-md object-contain flex-shrink-0 icon-frame" />
								{/if}

								<span class="text-[12px] text-foreground flex-1 {done ? 'line-through opacity-50' : ''}">{mat.name}</span>

								<!-- Quantity input -->
								<input
									type="number"
									value={have}
									onchange={(e) => handleMaterialChange(mat.id, (e.target as HTMLInputElement).value)}
									min="0"
									max={mat.needed}
									class="paper-input text-[12px] font-mono px-1 py-0.5 w-12 text-center no-spinner"
								/>
								<span class="text-[12px] text-muted-foreground">/</span>
								<span class="text-[12px] font-mono text-muted-foreground w-8">{mat.needed}</span>

								<!-- Mini progress -->
								<div class="w-10 h-1 bg-surface-lowest rounded-full overflow-hidden">
									<div class="h-full rounded-full {done ? 'bg-primary' : 'bg-primary/60'}" style="width: {pct}%"></div>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		{/each}
	{/if}

	<!-- Carrack Stats Comparison -->
	{#if $shipStatsStore}
		<div class="paper-card p-3">
			<h3 class="text-[12px] font-headline font-bold text-muted-foreground uppercase tracking-wider mb-2">{m.bartering_ships_comparison_title()}</h3>
			<div class="overflow-x-auto">
				<table class="w-full text-[12px]">
					<thead>
						<tr class="border-b border-outline-variant/10">
							<th class="text-left text-muted-foreground py-1 pr-2">{m.bartering_ships_stat_col()}</th>
							{#each $shipStatsStore.variants as v}
								<th class="text-center py-1 px-1 {v.variant === selectedVariant ? 'text-primary font-bold' : 'text-muted-foreground'}">
									{v.label.replace("Carrack ", "")}
								</th>
							{/each}
						</tr>
					</thead>
					<tbody>
						{#each STAT_LABELS as stat}
							{@const values = $shipStatsStore.variants.map((v) => (v.tiers["blue+10"] as unknown as Record<string, number>)[stat.key])}
							{@const maxVal = Math.max(...values)}
							<tr class="border-b border-outline-variant/5">
								<td class="text-muted-foreground py-0.5 pr-2">{stat.label()}</td>
								{#each $shipStatsStore.variants as v, i}
									{@const val = values[i]}
									<td class="text-center font-mono py-0.5 px-1
										{val === maxVal ? 'text-foreground font-bold' : 'text-foreground'}
										{v.variant === selectedVariant ? 'bg-primary/5' : ''}">
										{stat.format ? stat.format(val) : val}
									</td>
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			<div class="flex gap-3 mt-2 text-[12px] text-muted-foreground/60">
				{#each $shipStatsStore.variants as v}
					<span class="{v.variant === selectedVariant ? 'text-primary' : ''}">{v.label.replace("Carrack ", "")}: {v.bestFor}</span>
				{/each}
			</div>
		</div>
	{/if}
</div>
