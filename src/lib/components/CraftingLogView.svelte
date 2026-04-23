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
		if (confirm("Delete this crafting session?")) {
			deleteCraftingSession(id);
		}
	}

	// Handle clear all
	function handleClearAll() {
		if (confirm("Are you sure you want to delete ALL crafting sessions? This cannot be undone.")) {
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
		if (confirm("Delete this grinding session?")) {
			deleteGrindingSession(id);
		}
	}

	function handleClearAllGrinding() {
		if (confirm("Are you sure you want to delete ALL grinding sessions? This cannot be undone.")) {
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
		if (confirm("Delete this hunting session?")) {
			deleteHuntingSession(id);
		}
	}

	function handleClearAllHunting() {
		if (confirm("Are you sure you want to delete ALL hunting sessions? This cannot be undone.")) {
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
			Crafting Log
			{#if $craftingLogStore.length > 0}
				<span class="ml-1 text-[9px] text-muted-foreground">({$craftingLogStore.length})</span>
			{/if}
			{#if $logSubTabStore === "crafting"}
				<div class="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"></div>
			{/if}
		</button>
		<button
			onclick={() => logSubTabStore.set("grinding")}
			class="px-3 py-1.5 text-xs font-bold transition-colors relative {$logSubTabStore === 'grinding' ? 'text-accent' : 'text-muted-foreground hover:text-foreground'}"
		>
			Grinding Log
			{#if $grindingLogStore.length > 0}
				<span class="ml-1 text-[9px] text-muted-foreground">({$grindingLogStore.length})</span>
			{/if}
			{#if $logSubTabStore === "grinding"}
				<div class="absolute bottom-0 left-0 right-0 h-0.5 bg-accent"></div>
			{/if}
		</button>
		<button
			onclick={() => logSubTabStore.set("hunting")}
			class="px-3 py-1.5 text-xs font-bold transition-colors relative {$logSubTabStore === 'hunting' ? 'text-accent' : 'text-muted-foreground hover:text-foreground'}"
		>
			Hunting Log
			{#if $huntingLogStore.length > 0}
				<span class="ml-1 text-[9px] text-muted-foreground">({$huntingLogStore.length})</span>
			{/if}
			{#if $logSubTabStore === "hunting"}
				<div class="absolute bottom-0 left-0 right-0 h-0.5 bg-accent"></div>
			{/if}
		</button>
	</div>

	{#if $logSubTabStore === "crafting"}
		<!-- ===== CRAFTING LOG ===== -->
		<div class="flex items-center justify-between">
			<h2 class="text-base font-bold neon-text-cyan">Crafting Log</h2>
			<button
				onclick={handleClearAll}
				disabled={$craftingLogStore.length === 0}
				class="px-2 py-1 text-[11px] bg-destructive text-destructive-foreground rounded hover:opacity-80 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
			>
				Clear All
			</button>
		</div>

		<!-- Stats Cards -->
		<div class="grid grid-cols-4 gap-2">
			<div class="glass-stats p-2 text-center">
				<p class="text-xl font-bold neon-text-cyan">{stats().totalSessions}</p>
				<p class="text-[10px] text-muted-foreground">Sessions</p>
			</div>
			<div class="glass-stats p-2 text-center">
				<p class="text-xl font-bold neon-text-purple">{stats().totalCrafted}</p>
				<p class="text-[10px] text-muted-foreground">Crafted</p>
			</div>
			<div class="glass-stats p-2 text-center">
				<p class="text-xl font-bold neon-text-green">{stats().totalYielded}</p>
				<p class="text-[10px] text-muted-foreground">Yielded</p>
			</div>
			<div class="glass-stats p-2 text-center">
				<p class="text-xl font-bold text-accent">
					{stats().avgYieldRate.toFixed(1)}x
				</p>
				<p class="text-[10px] text-muted-foreground">Avg Yield</p>
			</div>
		</div>

		<!-- Filters -->
		<div class="flex gap-2">
			<input
				type="text"
				bind:value={$logCraftingSearchStore}
				placeholder="Search by recipe name..."
				class="flex-1 glass-input text-foreground rounded px-2 py-1.5 text-[11px] focus:outline-none focus:ring-2 focus:ring-primary"
			/>
			<select
				bind:value={$logCraftingCategoryStore}
				class="bg-input text-foreground border border-border rounded px-2 py-1.5 text-[11px] focus:outline-none focus:ring-2 focus:ring-primary"
			>
				<option value="all">All Categories</option>
				<option value="cooking">Cooking</option>
				<option value="alchemy">Alchemy</option>
				<option value="draughts">Draughts</option>
			</select>
		</div>

		<!-- Sessions List -->
		<div class="space-y-2 max-h-[350px] overflow-auto">
			{#if filteredSessions().length === 0}
				<div class="text-center py-6 text-muted-foreground text-[11px]">
					{#if $craftingLogStore.length === 0}
						<p class="text-2xl mb-1">📜</p>
						<p>No crafting sessions recorded</p>
						<p class="mt-1">Log sessions from the Crafting tab</p>
					{:else}
						<p class="text-2xl mb-1">🔍</p>
						<p>No sessions match your filters</p>
					{/if}
				</div>
			{:else}
				{#each filteredSessions() as session (session.id)}
					<div class="glass-card rounded-lg p-2 hover:border-primary transition-colors">
						<div class="flex items-start justify-between gap-2">
							<div class="flex-1 min-w-0">
								<div class="flex items-center gap-2 mb-1">
									<span
										class="px-1.5 py-0.5 text-[9px] font-bold text-white rounded {getCategoryColor(
											session.category
										)}"
									>
										{session.category}
									</span>
									<span class="font-medium text-[13px] truncate">{session.recipeName}</span>
								</div>
								<div class="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
									<span>Mastery: <span class="text-foreground">{session.mastery}</span></span>
									<span>Crafted: <span class="text-foreground">{session.crafted}</span></span>
									<span>Yielded: <span class="text-accent">{session.yielded}</span></span>
									<span>
										Rate: <span class="text-accent">{formatYieldRate(session.crafted, session.yielded)}</span>
									</span>
								</div>
								<p class="text-[9px] text-muted-foreground mt-1">{formatDate(session.timestamp)}</p>
							</div>
							<button
								onclick={() => handleDelete(session.id)}
								class="w-5 h-5 flex items-center justify-center text-destructive hover:bg-destructive hover:text-destructive-foreground rounded transition-colors text-[11px]"
								title="Delete"
							>
								✕
							</button>
						</div>
					</div>
				{/each}
			{/if}
		</div>

		<!-- Summary -->
		<div class="text-[11px] text-muted-foreground text-center">
			Showing {filteredSessions().length} of {$craftingLogStore.length} sessions
		</div>

	{:else if $logSubTabStore === "grinding"}
		<!-- ===== GRINDING LOG ===== -->
		<div class="flex items-center justify-between">
			<h2 class="text-base font-bold neon-text-cyan">Grinding Log</h2>
			<button
				onclick={handleClearAllGrinding}
				disabled={$grindingLogStore.length === 0}
				class="px-2 py-1 text-[11px] bg-destructive text-destructive-foreground rounded hover:opacity-80 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
			>
				Clear All
			</button>
		</div>

		<!-- Stats Cards -->
		<div class="grid grid-cols-3 gap-2">
			<div class="glass-stats p-2 text-center">
				<p class="text-xl font-bold neon-text-cyan">{grindingStats().totalSessions}</p>
				<p class="text-[10px] text-muted-foreground">Sessions</p>
			</div>
			<div class="glass-stats p-2 text-center">
				<p class="text-xl font-bold neon-text-purple">{formatDuration(grindingStats().totalDurationSeconds)}</p>
				<p class="text-[10px] text-muted-foreground">Total Time</p>
			</div>
			<div class="glass-stats p-2 text-center">
				<p class="text-xl font-bold text-accent">{grindingStats().totalItemsLogged}</p>
				<p class="text-[10px] text-muted-foreground">Items Logged</p>
			</div>
		</div>

		<!-- Search -->
		<input
			type="text"
			bind:value={$logGrindingSearchStore}
			placeholder="Search by spot name..."
			class="w-full glass-input text-foreground rounded px-2 py-1.5 text-[11px] focus:outline-none focus:ring-2 focus:ring-primary"
		/>

		<!-- Grinding Sessions List -->
		<div class="space-y-2 max-h-[350px] overflow-auto">
			{#if filteredGrindingSessions().length === 0}
				<div class="text-center py-6 text-muted-foreground text-[11px]">
					{#if $grindingLogStore.length === 0}
						<p class="text-2xl mb-1">⚔️</p>
						<p>No grinding sessions recorded</p>
						<p class="mt-1">End a session from the Grinding tab to log it</p>
					{:else}
						<p class="text-2xl mb-1">🔍</p>
						<p>No sessions match your search</p>
					{/if}
				</div>
			{:else}
				{#each filteredGrindingSessions() as session (session.id)}
					<div class="glass-card rounded-lg p-2 hover:border-accent transition-colors">
						<div class="flex items-start justify-between gap-2">
							<div class="flex-1 min-w-0">
								<div class="flex items-center gap-2 mb-1">
									<span class="px-1.5 py-0.5 text-[9px] font-bold text-white rounded bg-accent/80">
										Grinding
									</span>
									<span class="font-medium text-[13px] truncate">{session.spotName}</span>
								</div>
								<div class="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
									<span>Duration: <span class="text-foreground">{formatDuration(session.durationSeconds)}</span></span>
									<span>Items: <span class="text-accent">{session.loot.reduce((sum, l) => sum + l.count, 0)}</span></span>
									{#if session.ap != null}
										<span>AP: <span class="text-foreground">{session.ap}</span></span>
									{/if}
									{#if session.dp != null}
										<span>DP: <span class="text-foreground">{session.dp}</span></span>
									{/if}
								</div>
								{#if session.loot.length > 0}
									<div class="flex flex-wrap gap-1 mt-1.5">
										{#each session.loot as lootEntry (lootEntry.itemId)}
											<span class="px-1.5 py-0.5 text-[9px] bg-secondary rounded text-foreground/70">
												{lootEntry.itemName}: <span class="text-accent font-medium">{lootEntry.count}</span>
											</span>
										{/each}
									</div>
								{/if}
								<p class="text-[9px] text-muted-foreground mt-1">{formatDate(session.timestamp)}</p>
							</div>
							<button
								onclick={() => handleDeleteGrinding(session.id)}
								class="w-5 h-5 flex items-center justify-center text-destructive hover:bg-destructive hover:text-destructive-foreground rounded transition-colors text-[11px]"
								title="Delete"
							>
								✕
							</button>
						</div>
					</div>
				{/each}
			{/if}
		</div>

		<!-- Summary -->
		<div class="text-[11px] text-muted-foreground text-center">
			Showing {filteredGrindingSessions().length} of {$grindingLogStore.length} sessions
		</div>

	{:else}
		<!-- ===== HUNTING LOG ===== -->
		<div class="flex items-center justify-between">
			<h2 class="text-base font-bold neon-text-green">Hunting Log</h2>
			<button
				onclick={handleClearAllHunting}
				disabled={$huntingLogStore.length === 0}
				class="px-2 py-1 text-[11px] bg-destructive text-destructive-foreground rounded hover:opacity-80 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
			>
				Clear All
			</button>
		</div>

		<!-- Stats Cards -->
		<div class="grid grid-cols-3 gap-2">
			<div class="glass-stats p-2 text-center">
				<p class="text-xl font-bold neon-text-cyan">{huntingStats().totalSessions}</p>
				<p class="text-[10px] text-muted-foreground">Sessions</p>
			</div>
			<div class="glass-stats p-2 text-center">
				<p class="text-xl font-bold neon-text-purple">{formatDuration(huntingStats().totalDurationSeconds)}</p>
				<p class="text-[10px] text-muted-foreground">Total Time</p>
			</div>
			<div class="glass-stats p-2 text-center">
				<p class="text-xl font-bold text-accent">{huntingStats().totalItemsLogged}</p>
				<p class="text-[10px] text-muted-foreground">Items Logged</p>
			</div>
		</div>

		<!-- Search -->
		<input
			type="text"
			bind:value={$logHuntingSearchStore}
			placeholder="Search by spot name..."
			class="w-full glass-input text-foreground rounded px-2 py-1.5 text-[11px] focus:outline-none focus:ring-2 focus:ring-accent"
		/>

		<!-- Hunting Sessions List -->
		<div class="space-y-2 max-h-[350px] overflow-auto">
			{#if filteredHuntingSessions().length === 0}
				<div class="text-center py-6 text-muted-foreground text-[11px]">
					{#if $huntingLogStore.length === 0}
						<p class="text-2xl mb-1">🏹</p>
						<p>No hunting sessions recorded</p>
						<p class="mt-1">End a session from the Hunting tab to log it</p>
					{:else}
						<p class="text-2xl mb-1">🔍</p>
						<p>No sessions match your search</p>
					{/if}
				</div>
			{:else}
				{#each filteredHuntingSessions() as session (session.id)}
					<div class="glass-card rounded-lg p-2 hover:border-accent transition-colors">
						<div class="flex items-start justify-between gap-2">
							<div class="flex-1 min-w-0">
								<div class="flex items-center gap-2 mb-1">
									<span class="px-1.5 py-0.5 text-[9px] font-bold text-white rounded bg-green-600/80">
										Hunting
									</span>
									<span class="font-medium text-[13px] truncate">{session.spotName}</span>
								</div>
								<div class="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
									<span>Duration: <span class="text-foreground">{formatDuration(session.durationSeconds)}</span></span>
									<span>Items: <span class="text-accent">{session.loot.reduce((sum, l) => sum + l.count, 0)}</span></span>
									{#if session.mastery != null}
										<span>Mastery: <span class="text-foreground">{session.mastery}</span></span>
									{/if}
									{#if session.matchlockTier}
										<span>Matchlock: <span class="text-foreground">{session.matchlockTier.toUpperCase()}</span></span>
									{/if}
									{#if session.butcheringKnife}
										<span>Knife: <span class="text-foreground">{session.butcheringKnife.toUpperCase()}</span></span>
									{/if}
								</div>
								{#if session.loot.length > 0}
									<div class="flex flex-wrap gap-1 mt-1.5">
										{#each session.loot as lootEntry (lootEntry.itemId)}
											<span class="px-1.5 py-0.5 text-[9px] bg-secondary rounded text-foreground/70">
												{lootEntry.itemName}: <span class="text-accent font-medium">{lootEntry.count}</span>
											</span>
										{/each}
									</div>
								{/if}
								<p class="text-[9px] text-muted-foreground mt-1">{formatDate(session.timestamp)}</p>
							</div>
							<button
								onclick={() => handleDeleteHunting(session.id)}
								class="w-5 h-5 flex items-center justify-center text-destructive hover:bg-destructive hover:text-destructive-foreground rounded transition-colors text-[11px]"
								title="Delete"
							>
								✕
							</button>
						</div>
					</div>
				{/each}
			{/if}
		</div>

		<!-- Summary -->
		<div class="text-[11px] text-muted-foreground text-center">
			Showing {filteredHuntingSessions().length} of {$huntingLogStore.length} sessions
		</div>
	{/if}
</div>
