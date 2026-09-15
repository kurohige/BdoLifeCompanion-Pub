<script lang="ts">
	import RoutesView from "./RoutesView.svelte";
	import LogsView from "./LogsView.svelte";
	import BarterInventory from "./BarterInventory.svelte";
	import ShipProgress from "./ShipProgress.svelte";
	import ParleyCalculator from "./ParleyCalculator.svelte";
	import SailorTracker from "./SailorTracker.svelte";
	import { barterSubTabStore, type BarterSubTab } from "$lib/stores";
	import { m } from "$lib/paraglide/messages";
	import SubTabs from "$lib/components/ui/SubTabs.svelte";

	// Migrate legacy "tracker" selection from older app versions to the new "routes" tab.
	$effect(() => {
		if ($barterSubTabStore === "tracker") barterSubTabStore.set("routes");
	});

	// Labels resolved at render so they re-translate on locale change.
	let subTabs = $derived([
		{ id: "routes", label: m.bartering_subtab_routes() },
		{ id: "logs", label: m.bartering_subtab_logs() },
		{ id: "inventory", label: m.bartering_subtab_inventory() },
		{ id: "ships", label: m.bartering_subtab_ships() },
		{ id: "parley", label: m.bartering_subtab_parley() },
		{ id: "sailors", label: m.bartering_subtab_sailors() },
	]);
</script>

<div class="flex flex-col flex-1 min-h-0">
	<!-- Sub-tabs (unified, sticky) -->
	<div class="sticky top-0 z-10 mb-2 -mx-2 px-2 border-b border-outline-variant flex-shrink-0" style="background: var(--surface-lowest);">
		<SubTabs
			tabs={subTabs}
			active={$barterSubTabStore}
			onSelect={(id) => barterSubTabStore.set(id as BarterSubTab)}
		/>
	</div>

	<div class="flex-1 min-h-0 flex flex-col">
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
	</div>
</div>
