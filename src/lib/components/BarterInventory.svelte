<script lang="ts">
	import {
		barterItemsStore,
		barterInventoryStore,
		updateBarterItemQuantity,
		setCrowCoins,
		getItemsByTier,
	} from "$lib/stores";
	import { formatSilverShort } from "$lib/constants/chart-theme";
	import { TIER_COLORS, type BarterTier } from "$lib/models/bartering";

	const TIERS = ([7, 6, 5, 4, 3, 2, 1] as const).map((tier) => ({
		tier,
		label: `Tier ${tier}`,
		...TIER_COLORS[tier],
	}));

	let collapsed = $state<Record<number, boolean>>({ 1: true, 2: true, 3: false, 4: false, 5: false, 6: false, 7: false });
	let crowCoinsInput = $state(String($barterInventoryStore.crowCoins || 0));

	// Reactive — reads $barterInventoryStore and $barterItemsStore directly
	let inventoryValue = $derived.by(() => {
		const inv = $barterInventoryStore;
		const data = $barterItemsStore;
		if (!data) return { total: 0, byTier: {} as Record<number, number> };
		const byTier: Record<number, number> = {};
		let total = 0;
		for (const item of data.items) {
			const qty = inv.items[item.id] ?? 0;
			if (qty <= 0) continue;
			const price = item.greatOcean ? data.t5GreatOceanNpcSellPrice : data.tierProperties[String(item.tier)].npcSellPrice;
			const value = qty * price;
			byTier[item.tier] = (byTier[item.tier] ?? 0) + value;
			total += value;
		}
		return { total, byTier };
	});

	let itemCounts = $derived.by(() => {
		const inv = $barterInventoryStore;
		const data = $barterItemsStore;
		if (!data) return {} as Record<number, number>;
		const counts: Record<number, number> = {};
		for (const item of data.items) {
			counts[item.tier] = (counts[item.tier] ?? 0) + (inv.items[item.id] ?? 0);
		}
		return counts;
	});

	function handleCrowCoinsChange() {
		const val = parseInt(crowCoinsInput || "0", 10);
		if (!isNaN(val)) setCrowCoins(val);
	}

	function handleQuantityChange(itemId: string, value: string) {
		const qty = parseInt(value || "0", 10);
		updateBarterItemQuantity(itemId, isNaN(qty) ? 0 : qty);
	}

	function incrementItem(itemId: string) {
		const current = $barterInventoryStore.items[itemId] ?? 0;
		updateBarterItemQuantity(itemId, current + 1);
	}

	function decrementItem(itemId: string) {
		const current = $barterInventoryStore.items[itemId] ?? 0;
		if (current > 0) updateBarterItemQuantity(itemId, current - 1);
	}

	function toggleTier(tier: number) {
		collapsed = { ...collapsed, [tier]: !collapsed[tier] };
	}
</script>

<div class="space-y-2">
	<!-- Header: Crow Coins + Total Value -->
	<div class="glass-card p-3 flex items-center justify-between">
		<div class="flex items-center gap-3">
			<div>
				<label class="text-[10px] text-muted-foreground">Crow Coins</label>
				<input
					type="number"
					bind:value={crowCoinsInput}
					onchange={handleCrowCoinsChange}
					min="0"
					class="glass-input text-[12px] font-mono px-2 py-1 w-28 no-spinner"
				/>
			</div>
		</div>
		<div class="text-right">
			<p class="text-[10px] text-muted-foreground">Total Inventory Value</p>
			<p class="text-sm font-mono font-bold text-accent">{formatSilverShort(inventoryValue.total)}</p>
		</div>
	</div>

	<!-- Tier Sections -->
	{#if $barterItemsStore}
		{#each TIERS as { tier, label, color, border }}
			{@const items = getItemsByTier(tier)}
			{@const tierValue = inventoryValue.byTier[tier] ?? 0}
			{@const tierCount = itemCounts[tier] ?? 0}
			<div class="glass-card overflow-hidden">
				<!-- Tier Header (clickable to collapse) -->
				<button
					onclick={() => toggleTier(tier)}
					class="w-full px-3 py-2 flex items-center justify-between hover:bg-white/[0.02] transition-colors cursor-pointer"
				>
					<div class="flex items-center gap-2">
						<span class="text-[10px] {collapsed[tier] ? 'rotate-0' : 'rotate-90'} transition-transform inline-block">&#9654;</span>
						<span class="text-xs font-headline font-bold {color}">{label}</span>
						<span class="text-[10px] text-muted-foreground">{tierCount} items</span>
					</div>
					<div class="flex gap-3 text-[10px]">
						{#if tierValue > 0}
							<span class="text-accent font-mono">{formatSilverShort(tierValue)}</span>
						{/if}
					</div>
				</button>

				<!-- Items List -->
				{#if !collapsed[tier]}
					<div class="border-t border-outline-variant/10">
						{#each items as item (item.id)}
							{@const qty = $barterInventoryStore.items[item.id] ?? 0}
							<div class="flex items-center gap-2 px-3 py-1.5 border-l-2 {border} hover:bg-white/[0.02] transition-colors">
								{#if item.image}
									<img src="/{item.image}" alt={item.name} class="w-6 h-6 shrink-0 rounded" />
								{/if}
								<span class="text-[11px] text-foreground flex-1">{item.name}</span>
								<button
									onclick={() => decrementItem(item.id)}
									class="w-5 h-5 flex items-center justify-center text-[11px] text-muted-foreground hover:text-foreground glass-input rounded"
								>-</button>
								<input
									type="number"
									value={qty}
									onchange={(e) => handleQuantityChange(item.id, (e.target as HTMLInputElement).value)}
									min="0"
									class="glass-input text-[11px] font-mono px-1 py-0.5 w-14 text-center no-spinner"
								/>
								<button
									onclick={() => incrementItem(item.id)}
									class="w-5 h-5 flex items-center justify-center text-[11px] text-muted-foreground hover:text-foreground glass-input rounded"
								>+</button>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		{/each}
	{:else}
		<div class="text-center py-6">
			<p class="text-[11px] text-muted-foreground">Loading barter items...</p>
		</div>
	{/if}
</div>
