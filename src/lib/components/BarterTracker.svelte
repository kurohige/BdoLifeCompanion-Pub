<script lang="ts">
	import {
		barterLogStore,
		barterInventoryStore,
		barterDraftStore,
		resetBarterDraft,
		logBarterSession,
		deleteBarterSession,
		updateBarterItemQuantity,
		barterItemsStore,
		getItemsByTier,
		settingsStore,
	} from "$lib/stores";
	import { formatSilverShort } from "$lib/constants/chart-theme";
	import { formatDateShort } from "$lib/utils/format";
	import { TIER_COLORS, type BarterTier } from "$lib/models/bartering";

	const TIERS = ([1, 2, 3, 4, 5, 6, 7] as const).map((tier) => ({ tier, label: `T${tier}`, ...TIER_COLORS[tier] }));
	const TIER_BARTER_KEYS = ["t1Barters", "t2Barters", "t3Barters", "t4Barters", "t5Barters", "t6Barters", "t7Barters"] as const;

	// Total barters derived from draft store
	let totalBarters = $derived(Object.values($barterDraftStore.tierCounts).reduce((sum, c) => sum + c, 0));

	let silverEarned = $derived.by(() => {
		const data = $barterItemsStore;
		const d = $barterDraftStore;
		if (!data) return 0;
		const t5Price = data.tierProperties["5"]?.npcSellPrice ?? 0;
		const goPrice = data.t5GreatOceanNpcSellPrice ?? 0;
		const t6Price = data.tierProperties["6"]?.npcSellPrice ?? 0;
		const t7Price = data.tierProperties["7"]?.npcSellPrice ?? 0;
		return (parseInt(d.t5Sold || "0", 10) * t5Price)
			+ (parseInt(d.t5SoldMargoria || "0", 10) * goPrice)
			+ (parseInt(d.t6Sold || "0", 10) * t6Price)
			+ (parseInt(d.t7Sold || "0", 10) * t7Price);
	});

	let netProfit = $derived(silverEarned - (parseInt($barterDraftStore.silverInvested || "0", 10) || 0));

	// Reactive stats
	let stats = $derived.by(() => {
		const sessions = $barterLogStore;
		const totalSessions = sessions.length;
		const totalBarters = sessions.reduce((sum, s) => sum + s.totalBarters, 0);
		const totalCrowCoins = sessions.reduce((sum, s) => sum + s.crowCoinsEarned, 0);
		const totalProfit = sessions.reduce((sum, s) => sum + s.netProfit, 0);
		const averageProfit = totalSessions > 0 ? Math.round(totalProfit / totalSessions) : 0;
		return { totalSessions, totalBarters, totalCrowCoins, totalProfit, averageProfit };
	});

	// Session history grouped by date
	let groupedSessions = $derived.by(() => {
		const groups: { date: string; label: string; sessions: typeof $barterLogStore }[] = [];
		const today = new Date().toISOString().split("T")[0];
		const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
		let currentDate = "";
		let currentGroup: typeof $barterLogStore = [];
		for (const session of $barterLogStore) {
			if (session.date !== currentDate) {
				if (currentGroup.length > 0) {
					const label = currentDate === today ? "Today" : currentDate === yesterday ? "Yesterday" : currentDate;
					groups.push({ date: currentDate, label, sessions: currentGroup });
				}
				currentDate = session.date;
				currentGroup = [];
			}
			currentGroup.push(session);
		}
		if (currentGroup.length > 0) {
			const label = currentDate === today ? "Today" : currentDate === yesterday ? "Yesterday" : currentDate;
			groups.push({ date: currentDate, label, sessions: currentGroup });
		}
		return groups;
	});

	function getItemNameForTier(tier: number): string {
		const selectedItem = $barterDraftStore.tierItemSelection[tier];
		if (selectedItem) {
			const items = getItemsByTier(tier as BarterTier);
			const item = items.find((i) => i.id === selectedItem);
			return item?.name ?? `T${tier} item`;
		}
		const items = getItemsByTier(tier as BarterTier);
		return items.length > 0 ? items[0].name : `T${tier} item`;
	}

	function updateDraft(partial: Partial<typeof $barterDraftStore>) {
		barterDraftStore.update((d) => ({ ...d, ...partial }));
	}

	function adjustTier(tier: number, amount: number) {
		const d = $barterDraftStore;
		if (amount < 0 && d.tierCounts[tier] <= 0) return;
		const itemName = getItemNameForTier(tier);
		barterDraftStore.update((draft) => {
			draft.activityLog.push({ tier, amount, itemName });
			return { ...draft, tierCounts: { ...draft.tierCounts, [tier]: draft.tierCounts[tier] + amount } };
		});
		applyInventoryDelta(tier, amount);
	}

	function setTierItem(tier: number, value: string) {
		const d = $barterDraftStore;
		updateDraft({ tierItemSelection: { ...d.tierItemSelection, [tier]: value } });
	}

	function applyInventoryDelta(tier: number, delta: number) {
		const selectedItem = $barterDraftStore.tierItemSelection[tier];
		if (!selectedItem) {
			const items = getItemsByTier(tier as BarterTier);
			if (items.length > 0) {
				const firstItem = items[0];
				const current = $barterInventoryStore.items[firstItem.id] ?? 0;
				updateBarterItemQuantity(firstItem.id, Math.max(0, current + delta));
			}
			return;
		}
		const current = $barterInventoryStore.items[selectedItem] ?? 0;
		updateBarterItemQuantity(selectedItem, Math.max(0, current + delta));
	}

	function handleSubmit() {
		if (totalBarters <= 0) return;
		const d = $barterDraftStore;
		const earned = silverEarned;
		const invested = parseInt(d.silverInvested || "0", 10) || 0;

		logBarterSession({
			date: new Date().toISOString().split("T")[0],
			barterLevel: $settingsStore.barter_level || "Beginner 1",
			hasValuePack: $settingsStore.has_value_pack,
			parleyBudget: 1_000_000,
			parleySpent: 0,
			totalBarters,
			refreshesUsed: parseInt(d.refreshesUsed || "0", 10),
			t1Barters: d.tierCounts[1] || undefined,
			t2Barters: d.tierCounts[2] || undefined,
			t3Barters: d.tierCounts[3] || undefined,
			t4Barters: d.tierCounts[4] || undefined,
			t5Barters: d.tierCounts[5] || undefined,
			t6Barters: d.tierCounts[6] || undefined,
			t7Barters: d.tierCounts[7] || undefined,
			t5Sold: parseInt(d.t5Sold || "0", 10),
			t5SoldMargoria: parseInt(d.t5SoldMargoria || "0", 10),
			t6Sold: parseInt(d.t6Sold || "0", 10),
			t7Sold: parseInt(d.t7Sold || "0", 10),
			crowCoinsEarned: parseInt(d.crowCoinsEarned || "0", 10),
			silverEarned: earned,
			silverInvested: invested,
			netProfit: earned - invested,
			notes: d.notes.trim() || undefined,
		});

		resetBarterDraft();
	}
</script>

<div class="space-y-3">
	<!-- Quick Log Session Form -->
	<div class="glass-card p-3 space-y-2">
		<h3 class="text-xs font-headline font-bold text-primary uppercase tracking-wider">Log Barter Session</h3>

		<!-- Tier Barter Counters -->
		<div class="space-y-1.5">
			<span class="text-[10px] text-muted-foreground">Barters by Tier</span>
			{#each TIERS as { tier, label, color, bg }}
				{@const items = $barterItemsStore ? getItemsByTier(tier as BarterTier) : []}
				<div class="flex items-center gap-1.5">
					<span class="text-[10px] font-bold {color} w-6 text-center">{label}</span>

					<button
						onclick={() => adjustTier(tier, -1)}
						disabled={$barterDraftStore.tierCounts[tier] <= 0}
						class="w-6 h-6 flex items-center justify-center text-[12px] glass-input rounded disabled:opacity-30 hover:bg-white/5"
					>-</button>

					<span class="text-[12px] font-mono font-bold text-foreground w-8 text-center border {bg} rounded px-1 py-0.5">{$barterDraftStore.tierCounts[tier]}</span>

					<button
						onclick={() => adjustTier(tier, 1)}
						class="w-6 h-6 flex items-center justify-center text-[12px] glass-input rounded hover:bg-white/5"
					>+</button>

					<div class="flex gap-0.5">
						{#each [5, 10] as n}
							<button
								onclick={() => adjustTier(tier, n)}
								class="px-1.5 py-0.5 text-[9px] font-mono glass-input rounded hover:bg-white/5 {color}"
							>+{n}</button>
						{/each}
					</div>

					{#if items.length > 0}
						<select
							value={$barterDraftStore.tierItemSelection[tier]}
							onchange={(e) => setTierItem(tier, (e.target as HTMLSelectElement).value)}
							class="glass-input text-[9px] px-1 py-0.5 flex-1 min-w-0"
							title="Item to adjust in inventory"
						>
							<option value="">Auto (first)</option>
							{#each items as item}
								<option value={item.id}>{item.name}</option>
							{/each}
						</select>
					{/if}
				</div>
			{/each}

			<!-- Total barters display -->
			<div class="flex items-center gap-2 pt-1 border-t border-outline-variant/10">
				<span class="text-[10px] text-muted-foreground">Total Barters:</span>
				<span class="text-[12px] font-mono font-bold text-foreground">{totalBarters}</span>
			</div>
		</div>

		<!-- Live Activity Log -->
		{#if $barterDraftStore.activityLog.length > 0}
			<div class="max-h-[80px] overflow-y-auto border-t border-outline-variant/10 pt-1">
				{#each $barterDraftStore.activityLog as entry}
					{@const tierColor = TIER_COLORS[entry.tier as BarterTier]?.color ?? "text-foreground"}
					<div class="text-[9px] font-mono flex gap-1 py-0.5 text-muted-foreground/80">
						<span class="{tierColor} font-bold">{entry.amount > 0 ? `+${entry.amount}` : entry.amount} T{entry.tier}</span>
						<span class="text-muted-foreground/40">&rarr;</span>
						<span class="truncate">{entry.itemName}</span>
					</div>
				{/each}
			</div>
		{/if}

		<!-- Refreshes + Silver -->
		<div class="flex gap-2">
			<div class="flex-1">
				<span class="text-[10px] text-muted-foreground">Refreshes</span>
				<input type="number" value={$barterDraftStore.refreshesUsed} onchange={(e) => updateDraft({ refreshesUsed: (e.target as HTMLInputElement).value })} placeholder="0" min="0" class="glass-input text-[11px] px-2 py-1 w-full no-spinner" />
			</div>
			<div class="flex-1">
				<span class="text-[10px] text-muted-foreground">Silver Invested</span>
				<input type="number" value={$barterDraftStore.silverInvested} onchange={(e) => updateDraft({ silverInvested: (e.target as HTMLInputElement).value })} placeholder="0" min="0" class="glass-input text-[11px] px-2 py-1 w-full no-spinner" />
			</div>
		</div>

		<!-- Sales by Tier -->
		<div class="grid grid-cols-5 gap-1.5">
			<div>
				<span class="text-[9px] text-muted-foreground whitespace-nowrap">T5 <span class="text-orange-400/60">10M</span></span>
				<input type="number" value={$barterDraftStore.t5Sold} onchange={(e) => updateDraft({ t5Sold: (e.target as HTMLInputElement).value })} placeholder="0" min="0" class="glass-input text-[11px] px-1.5 py-1 w-full no-spinner" />
			</div>
			<div>
				<span class="text-[9px] text-muted-foreground whitespace-nowrap">Ocean <span class="text-orange-400/60">25M</span></span>
				<input type="number" value={$barterDraftStore.t5SoldMargoria} onchange={(e) => updateDraft({ t5SoldMargoria: (e.target as HTMLInputElement).value })} placeholder="0" min="0" class="glass-input text-[11px] px-1.5 py-1 w-full no-spinner" />
			</div>
			<div>
				<span class="text-[9px] text-muted-foreground whitespace-nowrap">T6 <span class="text-purple-400/60">50M</span></span>
				<input type="number" value={$barterDraftStore.t6Sold} onchange={(e) => updateDraft({ t6Sold: (e.target as HTMLInputElement).value })} placeholder="0" min="0" class="glass-input text-[11px] px-1.5 py-1 w-full no-spinner" />
			</div>
			<div>
				<span class="text-[9px] text-muted-foreground whitespace-nowrap">T7 <span class="text-red-400/60">100M</span></span>
				<input type="number" value={$barterDraftStore.t7Sold} onchange={(e) => updateDraft({ t7Sold: (e.target as HTMLInputElement).value })} placeholder="0" min="0" class="glass-input text-[11px] px-1.5 py-1 w-full no-spinner" />
			</div>
			<div>
				<span class="text-[9px] text-muted-foreground whitespace-nowrap">Crow Coins</span>
				<input type="number" value={$barterDraftStore.crowCoinsEarned} onchange={(e) => updateDraft({ crowCoinsEarned: (e.target as HTMLInputElement).value })} placeholder="0" min="0" class="glass-input text-[11px] px-1.5 py-1 w-full no-spinner" />
			</div>
		</div>

		<!-- Notes -->
		<div>
			<span class="text-[10px] text-muted-foreground">Notes (optional)</span>
			<input type="text" value={$barterDraftStore.notes} onchange={(e) => updateDraft({ notes: (e.target as HTMLInputElement).value })} placeholder="Route notes, special barters, etc." class="glass-input text-[11px] px-2 py-1 w-full" />
		</div>

		<!-- Profit Display + Submit -->
		<div class="flex items-center justify-between pt-1 border-t border-outline-variant/10">
			<div class="flex gap-4 text-[10px]">
				<span class="text-muted-foreground">Est. Earned: <span class="text-accent font-mono">{formatSilverShort(silverEarned)}</span></span>
				<span class="text-muted-foreground">Net Profit: <span class="font-mono {netProfit >= 0 ? 'text-accent' : 'text-destructive'}">{formatSilverShort(netProfit)}</span></span>
			</div>
			<button
				onclick={handleSubmit}
				disabled={totalBarters <= 0}
				class="px-3 py-1 text-[11px] font-bold rounded obsidian-cta disabled:opacity-40 disabled:cursor-not-allowed"
			>
				Log Session
			</button>
		</div>
	</div>

	<!-- Stats Bar -->
	{#if $barterLogStore.length > 0}
		<div class="flex gap-3 text-[10px] text-muted-foreground px-1 flex-wrap">
			<span>Sessions: <span class="text-foreground font-mono">{stats.totalSessions}</span></span>
			<span>Total Barters: <span class="text-foreground font-mono">{stats.totalBarters.toLocaleString()}</span></span>
			<span>Avg Profit: <span class="text-accent font-mono">{formatSilverShort(stats.averageProfit)}</span></span>
			<span>Crow Coins: <span class="text-foreground font-mono">{stats.totalCrowCoins.toLocaleString()}</span></span>
		</div>
	{/if}

	<!-- Session History (grouped by date) -->
	{#if $barterLogStore.length === 0}
		<div class="text-center py-6">
			<img src="/icons/bartering.png" alt="Bartering" class="w-8 h-8 mx-auto mb-1 opacity-60" />
			<p class="text-[11px] text-muted-foreground">No barter sessions logged yet</p>
			<p class="text-[10px] text-muted-foreground/60 mt-1">Use the tier buttons above to count your barters</p>
		</div>
	{:else}
		<div class="space-y-2 max-h-[300px] overflow-y-auto">
			{#each groupedSessions as group (group.date)}
				<div class="space-y-1">
					<h4 class="text-[9px] font-headline font-bold text-muted-foreground uppercase tracking-wider px-1">{group.label}</h4>
					{#each group.sessions as session (session.id)}
						<div class="glass-card px-3 py-2 flex items-center gap-3 group">
							<span class="text-[10px] text-muted-foreground w-12 shrink-0">{formatDateShort(session.timestamp)}</span>
							<span class="text-[11px] font-mono text-foreground w-8 text-center">{session.totalBarters}</span>
							<div class="flex gap-1 text-[9px] font-mono">
								{#each TIERS as { color }, i}
									{@const count = session[TIER_BARTER_KEYS[i]] as number | undefined}
									{#if count}<span class={color}>{count}</span>{/if}
								{/each}
							</div>
							<div class="flex-1 flex gap-3 text-[10px]">
								<span class="text-accent font-mono">{formatSilverShort(session.netProfit)}</span>
								{#if session.crowCoinsEarned > 0}
									<span class="text-muted-foreground">{session.crowCoinsEarned} CC</span>
								{/if}
							</div>
							<span class="text-[9px] text-muted-foreground/60">{session.barterLevel}</span>
							<button
								onclick={() => deleteBarterSession(session.id)}
								class="text-[10px] text-destructive/50 hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
								title="Delete session"
							>
								&#10005;
							</button>
						</div>
					{/each}
				</div>
			{/each}
		</div>
	{/if}
</div>
