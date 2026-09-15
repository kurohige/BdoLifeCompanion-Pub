<script lang="ts">
	import { onMount } from "svelte";
	import {
		craftingLogStore,
		loadCraftingLog,
		deleteCraftingSession,
		clearCraftingLog,
		getCraftingStats,
		type CraftingSession,
	} from "$lib/stores/crafting-log";
	import {
		grindingLogStore,
		deleteGrindingSession,
		clearGrindingLog,
		getGrindingStats,
		type GrindingSession,
		huntingLogStore,
		deleteHuntingSession,
		clearHuntingLog,
		getHuntingStats,
		type HuntingSession,
		logSubTabStore,
		logCraftingSearchStore,
		logCraftingCategoryStore,
		logGrindingSearchStore,
		logHuntingSearchStore,
	} from "$lib/stores";
	import { formatDate, formatDuration, formatYieldRate } from "$lib/utils/format";
	import { Button } from "$lib/components/ui";
	import { m } from "$lib/paraglide/messages";

	// Load crafting log on mount
	onMount(() => {
		loadCraftingLog();
	});

	// Filter sessions
	const filteredSessions = $derived(() => {
		let sessions = $craftingLogStore;

		// Filter by category
		const category = $logCraftingCategoryStore;
		if (category !== "all") {
			sessions = sessions.filter((s) => s.category.toLowerCase() === category);
		}

		// Filter by search text
		const search = $logCraftingSearchStore;
		if (search.trim()) {
			const q = search.toLowerCase();
			sessions = sessions.filter((s) => s.recipeName.toLowerCase().includes(q));
		}

		return sessions;
	});

	// Get stats
	const stats = $derived(() => getCraftingStats());

	// Handle delete
	function handleDelete(id: string) {
		if (confirm(m.log_delete_crafting_confirm())) {
			deleteCraftingSession(id);
		}
	}

	// Handle clear all
	function handleClearAll() {
		if (confirm(m.log_clear_crafting_confirm())) {
			clearCraftingLog();
		}
	}

	// Category badge color
	function getCategoryColor(category: string): string {
		switch (category.toLowerCase()) {
			case "cooking":
				return "bg-orange-500";
			case "alchemy":
				return "bg-purple-500";
			case "draughts":
				return "bg-blue-500";
			default:
				return "bg-gray-500";
		}
	}

	// === Grinding Log ===

	const filteredGrindingSessions = $derived(() => {
		let sessions = $grindingLogStore;
		const search = $logGrindingSearchStore;
		if (search.trim()) {
			const q = search.toLowerCase();
			sessions = sessions.filter((s) => s.spotName.toLowerCase().includes(q));
		}
		return sessions;
	});

	const grindingStats = $derived(() => getGrindingStats());

	function handleDeleteGrinding(id: string) {
		if (confirm(m.log_delete_grinding_confirm())) {
			deleteGrindingSession(id);
		}
	}

	function handleClearAllGrinding() {
		if (confirm(m.log_clear_grinding_confirm())) {
			clearGrindingLog();
		}
	}

	// === Hunting Log ===

	const filteredHuntingSessions = $derived(() => {
		let sessions = $huntingLogStore;
		const search = $logHuntingSearchStore;
		if (search.trim()) {
			const q = search.toLowerCase();
			sessions = sessions.filter((s) => s.spotName.toLowerCase().includes(q));
		}
		return sessions;
	});

	const huntingStats = $derived(() => getHuntingStats());

	function handleDeleteHunting(id: string) {
		if (confirm(m.log_delete_hunting_confirm())) {
			deleteHuntingSession(id);
		}
	}

	function handleClearAllHunting() {
		if (confirm(m.log_clear_hunting_confirm())) {
			clearHuntingLog();
		}
	}
</script>

<div class="space-y-4">
	<!-- Sub-tab Selector -->
	<div class="flex items-center gap-1 border-b border-border">
		<button
			onclick={() => logSubTabStore.set("crafting")}
			class="px-3 py-1.5 text-xs font-bold transition-colors relative {$logSubTabStore === 'crafting' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}"
		>
			{m.log_subtab_crafting()}
			{#if $craftingLogStore.length > 0}
				<span class="ml-1 text-[12px] text-muted-foreground">({$craftingLogStore.length})</span>
			{/if}
			{#if $logSubTabStore === "crafting"}
				<div class="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"></div>
			{/if}
		</button>
		<button
			onclick={() => logSubTabStore.set("grinding")}
			class="px-3 py-1.5 text-xs font-bold transition-colors relative {$logSubTabStore === 'grinding' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}"
		>
			{m.log_subtab_grinding()}
			{#if $grindingLogStore.length > 0}
				<span class="ml-1 text-[12px] text-muted-foreground">({$grindingLogStore.length})</span>
			{/if}
			{#if $logSubTabStore === "grinding"}
				<div class="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"></div>
			{/if}
		</button>
		<button
			onclick={() => logSubTabStore.set("hunting")}
			class="px-3 py-1.5 text-xs font-bold transition-colors relative {$logSubTabStore === 'hunting' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}"
		>
			{m.log_subtab_hunting()}
			{#if $huntingLogStore.length > 0}
				<span class="ml-1 text-[12px] text-muted-foreground">({$huntingLogStore.length})</span>
			{/if}
			{#if $logSubTabStore === "hunting"}
				<div class="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"></div>
			{/if}
		</button>
	</div>

	{#if $logSubTabStore === "crafting"}
		<!-- ===== CRAFTING LOG ===== -->
		<div class="flex items-center justify-between">
			<h2 class="text-base font-bold text-foreground">{m.log_subtab_crafting()}</h2>
			<Button variant="danger" size="sm" onclick={handleClearAll} disabled={$craftingLogStore.length === 0}>
				{m.log_clear_all_btn()}
			</Button>
		</div>

		<!-- Stats Cards -->
		<div class="grid grid-cols-4 gap-2">
			<div class="paper-stats p-2 text-center">
				<p class="text-xl font-bold font-mono text-foreground">{stats().totalSessions}</p>
				<p class="text-[12px] text-muted-foreground">{m.log_stat_sessions()}</p>
			</div>
			<div class="paper-stats p-2 text-center">
				<p class="text-xl font-bold font-mono text-foreground">{stats().totalCrafted}</p>
				<p class="text-[12px] text-muted-foreground">{m.log_stat_crafted()}</p>
			</div>
			<div class="paper-stats p-2 text-center">
				<p class="text-xl font-bold font-mono text-foreground">{stats().totalYielded}</p>
				<p class="text-[12px] text-muted-foreground">{m.log_stat_yielded()}</p>
			</div>
			<div class="paper-stats p-2 text-center">
				<p class="text-xl font-bold font-mono text-foreground">
					{stats().avgYieldRate.toFixed(1)}x
				</p>
				<p class="text-[12px] text-muted-foreground">{m.log_stat_avg_yield()}</p>
			</div>
		</div>

		<!-- Filters -->
		<div class="flex gap-2">
			<input
				type="text"
				bind:value={$logCraftingSearchStore}
				placeholder={m.log_search_recipe_placeholder()}
				class="flex-1 paper-input text-foreground rounded px-2 py-1.5 text-[12.5px] focus:outline-none focus:ring-2 focus:ring-primary"
			/>
			<select
				bind:value={$logCraftingCategoryStore}
				class="bg-input text-foreground border border-border rounded px-2 py-1.5 text-[12.5px] focus:outline-none focus:ring-2 focus:ring-primary"
			>
				<option value="all">{m.log_filter_all_categories()}</option>
				<option value="cooking">{m.log_filter_cooking()}</option>
				<option value="alchemy">{m.log_filter_alchemy()}</option>
				<option value="draughts">{m.log_filter_draughts()}</option>
			</select>
		</div>

		<!-- Sessions List -->
		<div class="space-y-2 max-h-[350px] overflow-auto">
			{#if filteredSessions().length === 0}
				<div class="text-center py-6 text-muted-foreground text-[12.5px]">
					{#if $craftingLogStore.length === 0}
						<p class="text-2xl mb-1">📜</p>
						<p>{m.log_empty_no_crafting()}</p>
						<p class="mt-1">{m.log_empty_no_crafting_subtitle()}</p>
					{:else}
						<p class="text-2xl mb-1">🔍</p>
						<p>{m.log_empty_no_match_filters()}</p>
					{/if}
				</div>
			{:else}
				{#each filteredSessions() as session (session.id)}
					<div class="paper-card rounded-lg p-2 hover:border-primary transition-colors">
						<div class="flex items-start justify-between gap-2">
							<div class="flex-1 min-w-0">
								<div class="flex items-center gap-2 mb-1">
									<span
										class="px-1.5 py-0.5 text-[12px] font-bold text-white rounded {getCategoryColor(
											session.category
										)}"
									>
										{session.category}
									</span>
									<span class="font-medium text-[13px] truncate">{session.recipeName}</span>
								</div>
								<div class="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
									<span>{m.log_field_mastery()} <span class="text-foreground">{session.mastery}</span></span>
									<span>{m.log_field_crafted()} <span class="text-foreground">{session.crafted}</span></span>
									<span>{m.log_field_yielded()} <span class="text-foreground font-mono">{session.yielded}</span></span>
									<span>
										{m.log_field_rate()} <span class="text-foreground font-mono">{formatYieldRate(session.crafted, session.yielded)}</span>
									</span>
								</div>
								<p class="text-[12px] text-muted-foreground mt-1">{formatDate(session.timestamp)}</p>
							</div>
							<button
								onclick={() => handleDelete(session.id)}
								class="w-5 h-5 flex items-center justify-center text-destructive hover:bg-destructive hover:text-destructive-foreground rounded transition-colors text-[12.5px]"
								title={m.log_delete_title()}
							>
								✕
							</button>
						</div>
					</div>
				{/each}
			{/if}
		</div>

		<!-- Summary -->
		<div class="text-[12.5px] text-muted-foreground text-center">
			{m.log_showing_summary({ shown: filteredSessions().length, total: $craftingLogStore.length })}
		</div>

	{:else if $logSubTabStore === "grinding"}
		<!-- ===== GRINDING LOG ===== -->
		<div class="flex items-center justify-between">
			<h2 class="text-base font-bold text-foreground">{m.log_subtab_grinding()}</h2>
			<Button variant="danger" size="sm" onclick={handleClearAllGrinding} disabled={$grindingLogStore.length === 0}>
				{m.log_clear_all_btn()}
			</Button>
		</div>

		<!-- Stats Cards -->
		<div class="grid grid-cols-3 gap-2">
			<div class="paper-stats p-2 text-center">
				<p class="text-xl font-bold font-mono text-foreground">{grindingStats().totalSessions}</p>
				<p class="text-[12px] text-muted-foreground">{m.log_stat_sessions()}</p>
			</div>
			<div class="paper-stats p-2 text-center">
				<p class="text-xl font-bold font-mono text-foreground">{formatDuration(grindingStats().totalDurationSeconds)}</p>
				<p class="text-[12px] text-muted-foreground">{m.log_stat_total_time()}</p>
			</div>
			<div class="paper-stats p-2 text-center">
				<p class="text-xl font-bold font-mono text-foreground">{grindingStats().totalItemsLogged}</p>
				<p class="text-[12px] text-muted-foreground">{m.log_stat_items_logged()}</p>
			</div>
		</div>

		<!-- Search -->
		<input
			type="text"
			bind:value={$logGrindingSearchStore}
			placeholder={m.log_search_spot_placeholder()}
			class="w-full paper-input text-foreground rounded px-2 py-1.5 text-[12.5px] focus:outline-none focus:ring-2 focus:ring-primary"
		/>

		<!-- Grinding Sessions List -->
		<div class="space-y-2 max-h-[350px] overflow-auto">
			{#if filteredGrindingSessions().length === 0}
				<div class="text-center py-6 text-muted-foreground text-[12.5px]">
					{#if $grindingLogStore.length === 0}
						<p class="text-2xl mb-1">⚔️</p>
						<p>{m.log_empty_no_grinding()}</p>
						<p class="mt-1">{m.log_empty_no_grinding_subtitle()}</p>
					{:else}
						<p class="text-2xl mb-1">🔍</p>
						<p>{m.log_empty_no_match_search()}</p>
					{/if}
				</div>
			{:else}
				{#each filteredGrindingSessions() as session (session.id)}
					<div class="paper-card rounded-lg p-2 hover:border-outline-hud transition-colors">
						<div class="flex items-start justify-between gap-2">
							<div class="flex-1 min-w-0">
								<div class="flex items-center gap-2 mb-1">
									<span class="px-1.5 py-0.5 text-[12px] font-bold text-white rounded bg-accent/80">
										{m.log_badge_grinding()}
									</span>
									<span class="font-medium text-[13px] truncate">{session.spotName}</span>
								</div>
								<div class="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
									<span>{m.log_field_duration()} <span class="text-foreground">{formatDuration(session.durationSeconds)}</span></span>
									<span>{m.log_field_items()} <span class="text-foreground font-mono">{session.loot.reduce((sum, l) => sum + l.count, 0)}</span></span>
									{#if session.ap != null}
										<span>{m.log_field_ap()} <span class="text-foreground">{session.ap}</span></span>
									{/if}
									{#if session.dp != null}
										<span>{m.log_field_dp()} <span class="text-foreground">{session.dp}</span></span>
									{/if}
								</div>
								{#if session.loot.length > 0}
									<div class="flex flex-wrap gap-1 mt-1.5">
										{#each session.loot as lootEntry (lootEntry.itemId)}
											<span class="px-1.5 py-0.5 text-[12px] bg-secondary rounded text-foreground/70">
												{lootEntry.itemName}: <span class="text-foreground font-mono font-medium">{lootEntry.count}</span>
											</span>
										{/each}
									</div>
								{/if}
								<p class="text-[12px] text-muted-foreground mt-1">{formatDate(session.timestamp)}</p>
							</div>
							<button
								onclick={() => handleDeleteGrinding(session.id)}
								class="w-5 h-5 flex items-center justify-center text-destructive hover:bg-destructive hover:text-destructive-foreground rounded transition-colors text-[12.5px]"
								title={m.log_delete_title()}
							>
								✕
							</button>
						</div>
					</div>
				{/each}
			{/if}
		</div>

		<!-- Summary -->
		<div class="text-[12.5px] text-muted-foreground text-center">
			{m.log_showing_summary({ shown: filteredGrindingSessions().length, total: $grindingLogStore.length })}
		</div>

	{:else}
		<!-- ===== HUNTING LOG ===== -->
		<div class="flex items-center justify-between">
			<h2 class="text-base font-bold text-foreground">{m.log_subtab_hunting()}</h2>
			<Button variant="danger" size="sm" onclick={handleClearAllHunting} disabled={$huntingLogStore.length === 0}>
				{m.log_clear_all_btn()}
			</Button>
		</div>

		<!-- Stats Cards -->
		<div class="grid grid-cols-3 gap-2">
			<div class="paper-stats p-2 text-center">
				<p class="text-xl font-bold font-mono text-foreground">{huntingStats().totalSessions}</p>
				<p class="text-[12px] text-muted-foreground">{m.log_stat_sessions()}</p>
			</div>
			<div class="paper-stats p-2 text-center">
				<p class="text-xl font-bold font-mono text-foreground">{formatDuration(huntingStats().totalDurationSeconds)}</p>
				<p class="text-[12px] text-muted-foreground">{m.log_stat_total_time()}</p>
			</div>
			<div class="paper-stats p-2 text-center">
				<p class="text-xl font-bold font-mono text-foreground">{huntingStats().totalItemsLogged}</p>
				<p class="text-[12px] text-muted-foreground">{m.log_stat_items_logged()}</p>
			</div>
		</div>

		<!-- Search -->
		<input
			type="text"
			bind:value={$logHuntingSearchStore}
			placeholder={m.log_search_spot_placeholder()}
			class="w-full paper-input text-foreground rounded px-2 py-1.5 text-[12.5px] focus:outline-none focus:ring-2 focus:ring-primary"
		/>

		<!-- Hunting Sessions List -->
		<div class="space-y-2 max-h-[350px] overflow-auto">
			{#if filteredHuntingSessions().length === 0}
				<div class="text-center py-6 text-muted-foreground text-[12.5px]">
					{#if $huntingLogStore.length === 0}
						<p class="text-2xl mb-1">🏹</p>
						<p>{m.log_empty_no_hunting()}</p>
						<p class="mt-1">{m.log_empty_no_hunting_subtitle()}</p>
					{:else}
						<p class="text-2xl mb-1">🔍</p>
						<p>{m.log_empty_no_match_search()}</p>
					{/if}
				</div>
			{:else}
				{#each filteredHuntingSessions() as session (session.id)}
					<div class="paper-card rounded-lg p-2 hover:border-outline-hud transition-colors">
						<div class="flex items-start justify-between gap-2">
							<div class="flex-1 min-w-0">
								<div class="flex items-center gap-2 mb-1">
									<span class="px-1.5 py-0.5 text-[12px] font-bold text-white rounded bg-green-600/80">
										{m.log_badge_hunting()}
									</span>
									<span class="font-medium text-[13px] truncate">{session.spotName}</span>
								</div>
								<div class="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
									<span>{m.log_field_duration()} <span class="text-foreground">{formatDuration(session.durationSeconds)}</span></span>
									<span>{m.log_field_items()} <span class="text-foreground font-mono">{session.loot.reduce((sum, l) => sum + l.count, 0)}</span></span>
									{#if session.mastery != null}
										<span>{m.log_field_mastery()} <span class="text-foreground">{session.mastery}</span></span>
									{/if}
									{#if session.matchlockTier}
										<span>{m.log_field_matchlock()} <span class="text-foreground">{session.matchlockTier.toUpperCase()}</span></span>
									{/if}
									{#if session.butcheringKnife}
										<span>{m.log_field_knife()} <span class="text-foreground">{session.butcheringKnife.toUpperCase()}</span></span>
									{/if}
								</div>
								{#if session.loot.length > 0}
									<div class="flex flex-wrap gap-1 mt-1.5">
										{#each session.loot as lootEntry (lootEntry.itemId)}
											<span class="px-1.5 py-0.5 text-[12px] bg-secondary rounded text-foreground/70">
												{lootEntry.itemName}: <span class="text-foreground font-mono font-medium">{lootEntry.count}</span>
											</span>
										{/each}
									</div>
								{/if}
								<p class="text-[12px] text-muted-foreground mt-1">{formatDate(session.timestamp)}</p>
							</div>
							<button
								onclick={() => handleDeleteHunting(session.id)}
								class="w-5 h-5 flex items-center justify-center text-destructive hover:bg-destructive hover:text-destructive-foreground rounded transition-colors text-[12.5px]"
								title={m.log_delete_title()}
							>
								✕
							</button>
						</div>
					</div>
				{/each}
			{/if}
		</div>

		<!-- Summary -->
		<div class="text-[12.5px] text-muted-foreground text-center">
			{m.log_showing_summary({ shown: filteredHuntingSessions().length, total: $huntingLogStore.length })}
		</div>
	{/if}
</div>
