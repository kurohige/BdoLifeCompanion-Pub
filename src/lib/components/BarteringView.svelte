<script lang="ts">
	import BarterTracker from "./BarterTracker.svelte";
	import BarterInventory from "./BarterInventory.svelte";
	import ShipProgress from "./ShipProgress.svelte";
	import ParleyCalculator from "./ParleyCalculator.svelte";
	import SailorTracker from "./SailorTracker.svelte";
	import { barterSubTabStore, type BarterSubTab } from "$lib/stores";
</script>

<!-- Sub-tabs: pill style (sticky) -->
<div class="flex gap-2 mb-2 sticky top-0 z-10 bg-surface-lowest/95 backdrop-blur-sm py-1 -mx-2 px-2">
	{#each [
		{ id: "tracker", label: "Tracker" },
		{ id: "inventory", label: "Inventory" },
		{ id: "ships", label: "Ships" },
		{ id: "parley", label: "Parley" },
		{ id: "sailors", label: "Sailors" },
	] as sub}
		<button
			onclick={() => barterSubTabStore.set(sub.id as BarterSubTab)}
			class="pb-2 px-1 text-[13px] font-headline font-medium transition-colors
				{$barterSubTabStore === sub.id
					? 'obsidian-pill-active'
					: 'obsidian-pill'}"
		>
			{sub.label}
		</button>
	{/each}
</div>

{#if $barterSubTabStore === "tracker"}
	<BarterTracker />
{:else if $barterSubTabStore === "inventory"}
	<BarterInventory />
{:else if $barterSubTabStore === "ships"}
	<ShipProgress />
{:else if $barterSubTabStore === "parley"}
	<ParleyCalculator />
{:else}
	<SailorTracker />
{/if}
