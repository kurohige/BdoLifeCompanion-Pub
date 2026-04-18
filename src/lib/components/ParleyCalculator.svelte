<script lang="ts">
	import {
		parleyMasteryStore,
		settingsStore,
	} from "$lib/stores";
	import { BARTER_LEVELS } from "$lib/models/bartering";
	import type { ParleyBaseCosts } from "$lib/models/bartering";

	// NPC route definitions
	const REGULAR_ROUTES: { id: string; name: string; costKey: string }[] = [
		{ id: "hakoven", name: "Hakoven", costKey: "hakoven" },
		{ id: "halmad", name: "Halmad", costKey: "halmad" },
		{ id: "kashuma", name: "Kashuma", costKey: "kashuma" },
		{ id: "derko", name: "Derko", costKey: "derko" },
	];

	const MARGORIA_ROUTES: { id: string; name: string; costKey: string }[] = [
		{ id: "shipwrecked_cargo", name: "Shipwrecked Cargo", costKey: "margoriaLow" },
		{ id: "old_moon", name: "Old Moon x3", costKey: "regular" },
		{ id: "incomplete_ship", name: "Incomplete Ship", costKey: "margoriaLow" },
		{ id: "lantinia", name: "Lantinia", costKey: "margoriaLow" },
	];

	const CROW_ROUTES: { id: string; name: string; costKey: string }[] = [
		{ id: "crows_nest", name: "Crow's Nest", costKey: "crowCoin" },
		{ id: "crow_merchant", name: "Crow Merchant", costKey: "margoriaHigh" },
		{ id: "rikkun", name: "Rikkun", costKey: "margoriaHigh" },
		{ id: "shipwrecked_pirate", name: "Shipwrecked Pirate", costKey: "margoriaHigh" },
		{ id: "shipwreck_naval", name: "Shipwreck Naval", costKey: "margoriaHigh" },
	];

	const LAND_ROUTES: { id: string; name: string; costKey: string }[] = [
		{ id: "pakio_raft", name: "Pakio Raft", costKey: "margoriaHigh" },
		{ id: "wandering_merc", name: "Wandering Merc x3", costKey: "margoriaHigh" },
		{ id: "cholace", name: "Cholace x3", costKey: "margoriaHigh" },
		{ id: "ancient_relic", name: "Ancient Relic x3", costKey: "margoriaHigh" },
	];

	// State
	let barterLevel = $state($settingsStore.barter_level || "Beginner 1");
	let hasValuePack = $state($settingsStore.has_value_pack || false);
	let parleyBudget = $state(1_000_000);

	// Route selections
	let selectedRegular = $state<Record<string, boolean>>({});
	let selectedMargoria = $state<Record<string, boolean>>({});
	let selectedCrow = $state<Record<string, boolean>>({});
	let selectedLand = $state<Record<string, boolean>>({});

	// Core calculation functions
	function getMasteryReduction(level: string): number {
		const data = $parleyMasteryStore;
		if (!data) return 0;
		const entry = data.levels.find((e) => e.level === level);
		return entry?.reduction ?? 0;
	}

	function calcCost(baseCost: number, reduction: number, vp: boolean): number {
		return Math.floor(baseCost * (1 - reduction) * (vp ? 0.9 : 1.0));
	}

	let masteryReduction = $derived(getMasteryReduction(barterLevel));
	let totalReductionPct = $derived((masteryReduction * 100) + (hasValuePack ? 10 : 0));

	let costs = $derived.by(() => {
		const data = $parleyMasteryStore;
		if (!data) return null;
		const bc = data.baseCosts;
		const r = masteryReduction;
		const vp = hasValuePack;
		return {
			regular: calcCost(bc.regular, r, vp),
			crowCoin: calcCost(bc.crowCoin, r, vp),
			kashuma: calcCost(bc.kashuma, r, vp),
			halmad: calcCost(bc.halmad, r, vp),
			derko: calcCost(bc.derko, r, vp),
			hakoven: calcCost(bc.hakoven, r, vp),
			margoriaLow: calcCost(bc.margoriaLow, r, vp),
			margoriaHigh: calcCost(bc.margoriaHigh, r, vp),
		};
	});

	let regularBartersAvailable = $derived(costs ? Math.floor(parleyBudget / costs.regular) : 0);
	let crowCoinBartersAvailable = $derived(costs ? Math.floor(parleyBudget / costs.crowCoin) : 0);

	function routeCost(routes: { id: string; costKey: string }[], selected: Record<string, boolean>): number {
		if (!costs) return 0;
		let total = 0;
		for (const route of routes) {
			if (selected[route.id]) {
				total += (costs as unknown as Record<string, number>)[route.costKey] ?? 0;
			}
		}
		return total;
	}

	let totalRouteCost = $derived.by(() => {
		return routeCost(REGULAR_ROUTES, selectedRegular)
			+ routeCost(MARGORIA_ROUTES, selectedMargoria)
			+ routeCost(CROW_ROUTES, selectedCrow)
			+ routeCost(LAND_ROUTES, selectedLand);
	});

	let parleyAfterRoutes = $derived(parleyBudget - totalRouteCost);

	let bartersAfterRoutes = $derived(
		costs && parleyAfterRoutes > 0 ? Math.floor(parleyAfterRoutes / costs.regular) : 0
	);

	const COST_TABLE: { label: string; key: string }[] = [
		{ label: "Regular Island", key: "regular" },
		{ label: "Crow Coin (T4)", key: "crowCoin" },
		{ label: "Kashuma", key: "kashuma" },
		{ label: "Halmad", key: "halmad" },
		{ label: "Derko", key: "derko" },
		{ label: "Hakoven", key: "hakoven" },
		{ label: "Margoria", key: "margoriaLow" },
		{ label: "Margoria (far)", key: "margoriaHigh" },
	];
</script>

<div class="space-y-3">
	<!-- Settings -->
	<div class="glass-card p-3 space-y-2">
		<div class="flex items-center justify-between">
			<h3 class="text-xs font-headline font-bold text-primary uppercase tracking-wider">Parley Calculator</h3>
			<label class="flex items-center gap-1 text-[10px] text-muted-foreground cursor-pointer" title="Active Value Pack (-10% parley cost)">
				<input type="checkbox" bind:checked={hasValuePack} class="w-3 h-3 accent-primary" />
				Value Pack
			</label>
		</div>

		<div class="flex gap-2 items-center">
			<span class="text-[10px] text-muted-foreground w-14 shrink-0">Level</span>
			<select bind:value={barterLevel} class="glass-input text-[11px] px-2 py-1 flex-1">
				{#each BARTER_LEVELS as level}
					<option value={level}>{level}</option>
				{/each}
			</select>
		</div>

		<div class="flex gap-2 items-center">
			<span class="text-[10px] text-muted-foreground w-14 shrink-0">Budget</span>
			<input
				type="number"
				bind:value={parleyBudget}
				min="0"
				step="100000"
				class="glass-input text-[11px] font-mono px-2 py-1 flex-1 no-spinner"
			/>
		</div>

		<!-- Reduction summary -->
		<div class="flex gap-4 text-[10px] pt-1 border-t border-outline-variant/10">
			<span class="text-muted-foreground">Mastery: <span class="text-accent font-mono">{(masteryReduction * 100).toFixed(2)}%</span></span>
			{#if hasValuePack}
				<span class="text-muted-foreground">+ Value Pack: <span class="text-accent font-mono">10%</span></span>
			{/if}
			<span class="text-muted-foreground">Total: <span class="text-primary font-mono font-bold">{totalReductionPct.toFixed(2)}%</span></span>
		</div>
	</div>

	<!-- Cost Per Barter Table -->
	{#if costs}
		<div class="glass-card p-3">
			<h3 class="text-[10px] font-headline font-bold text-muted-foreground uppercase tracking-wider mb-2">Cost Per Barter</h3>
			<div class="grid grid-cols-2 gap-x-4 gap-y-1">
				{#each COST_TABLE as { label, key }}
					<div class="flex items-center justify-between">
						<span class="text-[10px] text-muted-foreground">{label}</span>
						<span class="text-[11px] font-mono text-foreground">{((costs as Record<string, number>)[key]).toLocaleString()}</span>
					</div>
				{/each}
			</div>
			<div class="flex gap-4 mt-2 pt-2 border-t border-outline-variant/10 text-[10px]">
				<span class="text-muted-foreground">Regular barters: <span class="text-accent font-mono font-bold">{regularBartersAvailable}</span></span>
				<span class="text-muted-foreground">Crow coin barters: <span class="text-accent font-mono font-bold">{crowCoinBartersAvailable}</span></span>
			</div>
		</div>
	{/if}

	<!-- Route Planner -->
	<div class="glass-card p-3 space-y-2">
		<h3 class="text-[10px] font-headline font-bold text-muted-foreground uppercase tracking-wider">Route Planner</h3>
		<p class="text-[9px] text-muted-foreground/60">Select NPCs you plan to visit — see remaining parley</p>

		<!-- Regular Routes -->
		<div>
			<span class="text-[9px] text-muted-foreground uppercase tracking-wider">Regular Routes</span>
			<div class="grid grid-cols-2 gap-1 mt-1">
				{#each REGULAR_ROUTES as route}
					{@const cost = costs ? (costs as Record<string, number>)[route.costKey] : 0}
					<label class="flex items-center gap-1.5 text-[10px] cursor-pointer hover:bg-white/[0.02] px-1.5 py-1 rounded">
						<input type="checkbox" bind:checked={selectedRegular[route.id]} class="w-3 h-3 accent-primary" />
						<span class="flex-1 {selectedRegular[route.id] ? 'text-foreground' : 'text-muted-foreground'}">{route.name}</span>
						<span class="font-mono text-[9px] text-muted-foreground/60">{cost.toLocaleString()}</span>
					</label>
				{/each}
			</div>
		</div>

		<!-- Margoria Routes -->
		<div>
			<span class="text-[9px] text-muted-foreground uppercase tracking-wider">Margoria Routes</span>
			<div class="grid grid-cols-2 gap-1 mt-1">
				{#each MARGORIA_ROUTES as route}
					{@const cost = costs ? (costs as Record<string, number>)[route.costKey] : 0}
					<label class="flex items-center gap-1.5 text-[10px] cursor-pointer hover:bg-white/[0.02] px-1.5 py-1 rounded">
						<input type="checkbox" bind:checked={selectedMargoria[route.id]} class="w-3 h-3 accent-primary" />
						<span class="flex-1 {selectedMargoria[route.id] ? 'text-foreground' : 'text-muted-foreground'}">{route.name}</span>
						<span class="font-mono text-[9px] text-muted-foreground/60">{cost.toLocaleString()}</span>
					</label>
				{/each}
			</div>
		</div>

		<!-- Crow Coin Routes -->
		<div>
			<span class="text-[9px] text-muted-foreground uppercase tracking-wider">Crow Coin Routes</span>
			<div class="grid grid-cols-2 gap-1 mt-1">
				{#each CROW_ROUTES as route}
					{@const cost = costs ? (costs as Record<string, number>)[route.costKey] : 0}
					<label class="flex items-center gap-1.5 text-[10px] cursor-pointer hover:bg-white/[0.02] px-1.5 py-1 rounded">
						<input type="checkbox" bind:checked={selectedCrow[route.id]} class="w-3 h-3 accent-primary" />
						<span class="flex-1 {selectedCrow[route.id] ? 'text-foreground' : 'text-muted-foreground'}">{route.name}</span>
						<span class="font-mono text-[9px] text-muted-foreground/60">{cost.toLocaleString()}</span>
					</label>
				{/each}
			</div>
		</div>

		<!-- Land Coin Routes -->
		<div>
			<span class="text-[9px] text-muted-foreground uppercase tracking-wider">Land Coin Routes</span>
			<div class="grid grid-cols-2 gap-1 mt-1">
				{#each LAND_ROUTES as route}
					{@const cost = costs ? (costs as Record<string, number>)[route.costKey] : 0}
					<label class="flex items-center gap-1.5 text-[10px] cursor-pointer hover:bg-white/[0.02] px-1.5 py-1 rounded">
						<input type="checkbox" bind:checked={selectedLand[route.id]} class="w-3 h-3 accent-primary" />
						<span class="flex-1 {selectedLand[route.id] ? 'text-foreground' : 'text-muted-foreground'}">{route.name}</span>
						<span class="font-mono text-[9px] text-muted-foreground/60">{cost.toLocaleString()}</span>
					</label>
				{/each}
			</div>
		</div>

		<!-- Route Summary -->
		<div class="pt-2 border-t border-outline-variant/10 space-y-1">
			<div class="flex items-center justify-between text-[10px]">
				<span class="text-muted-foreground">Route Cost</span>
				<span class="font-mono font-bold {totalRouteCost > 0 ? 'text-yellow-400' : 'text-muted-foreground'}">{totalRouteCost.toLocaleString()}</span>
			</div>
			<div class="flex items-center justify-between text-[10px]">
				<span class="text-muted-foreground">Remaining Parley</span>
				<span class="font-mono font-bold {parleyAfterRoutes >= 0 ? 'text-accent' : 'text-destructive'}">{parleyAfterRoutes.toLocaleString()}</span>
			</div>
			{#if parleyAfterRoutes > 0}
				<div class="flex items-center justify-between text-[10px]">
					<span class="text-muted-foreground">Regular Barters Left</span>
					<span class="font-mono font-bold text-foreground">{bartersAfterRoutes}</span>
				</div>
			{/if}

			<!-- Parley usage bar -->
			{#if parleyBudget > 0}
				{@const usagePct = Math.min(100, Math.round((totalRouteCost / parleyBudget) * 100))}
				<div class="w-full h-2 bg-surface-lowest rounded-full overflow-hidden mt-1">
					<div
						class="h-full rounded-full transition-all duration-300 {usagePct > 90 ? 'bg-destructive' : usagePct > 60 ? 'bg-yellow-400' : 'bg-accent'}"
						style="width: {usagePct}%"
					></div>
				</div>
				<div class="text-[9px] text-muted-foreground/60 text-right">{usagePct}% of budget allocated to routes</div>
			{/if}
		</div>
	</div>
</div>
