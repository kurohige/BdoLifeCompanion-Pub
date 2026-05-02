<script lang="ts">
	import RoutesView from "./RoutesView.svelte";
	import LogsView from "./LogsView.svelte";
	import BarterInventory from "./BarterInventory.svelte";
	import ShipProgress from "./ShipProgress.svelte";
	import ParleyCalculator from "./ParleyCalculator.svelte";
	import SailorTracker from "./SailorTracker.svelte";
	import { barterSubTabStore, type BarterSubTab } from "$lib/stores";

	// Migrate legacy "tracker" selection from older app versions to the new "routes" tab.
	$effect(() => {
		if ($barterSubTabStore === "tracker") barterSubTabStore.set("routes");
	});

	const SUB_TABS: { id: BarterSubTab; label: string }[] = [
		{ id: "routes", label: "Routes" },
		{ id: "logs", label: "Logs" },
		{ id: "inventory", label: "Inventory" },
		{ id: "ships", label: "Ships" },
		{ id: "parley", label: "Parley" },
		{ id: "sailors", label: "Sailors" },
	];
</script>

<!-- Sub-tabs: pill style (sticky) -->
<div class="flex gap-2 mb-2 sticky top-0 z-10 bg-surface-lowest/95 backdrop-blur-sm py-1 -mx-2 px-2">
	{#each SUB_TABS as sub (sub.id)}
		<button
			onclick={() => barterSubTabStore.set(sub.id)}
			class="pb-2 px-1 text-[13px] font-headline font-medium transition-colors
				{$barterSubTabStore === sub.id
					? 'obsidian-pill-active'
					: 'obsidian-pill'}"
		>
			{sub.label}
		</button>
	{/each}
</div>

{#if $barterSubTabStore === "routes" || $barterSubTabStore === "tracker"}
	<RoutesView />
{:else if $barterSubTabStore === "logs"}
	<LogsView />
{:else if $barterSubTabStore === "inventory"}
	<BarterInventory />
{:else if $barterSubTabStore === "ships"}
	<ShipProgress />
{:else if $barterSubTabStore === "parley"}
	<ParleyCalculator />
{:else}
	<SailorTracker />
{/if}
