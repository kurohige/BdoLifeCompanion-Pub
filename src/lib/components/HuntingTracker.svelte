<script lang="ts">
	import {
		huntingDataStore,
		huntingSearchStore,
		huntingSelectedSpotStore,
		huntingFilteredSpotsStore,
		huntingSelectedSpotItems,
		selectHuntingSpot,
		clearHuntingSpot,
		huntingLootCountsStore,
		huntingLootValuesStore,
		setHuntingLootCount,
		setHuntingLootValue,
		huntingTotalLootCount,
		huntingTotalLootValue,
		huntingMarketPricesLoadingStore,
		fetchHuntingMarketPrices,
		endHuntingSession,
		EQUIPMENT_TIERS,
		type HuntingSpot,
	} from "$lib/stores";
	import {
		grindingTimerStore,
		grindingTimerDisplay,
		grindingTimerProgress,
		setGrindingTimerMinutes,
		setGrindingTimerSeconds,
		setGrindingTimerPreset,
		startGrindingTimer,
		pauseGrindingTimer,
		resumeGrindingTimer,
		stopGrindingTimer,
		resetGrindingTimer,
	} from "$lib/stores";

	let showDropdown = $state(false);
	let mastery = $state("");
	let matchlockTier = $state("");
	let butcheringKnife = $state("");
	let fetchPriceError = $state("");

	async function handleFetchPrices() {
		fetchPriceError = "";
		try {
			await fetchHuntingMarketPrices();
		} catch {
			fetchPriceError = "Failed to fetch prices";
			setTimeout(() => { fetchPriceError = ""; }, 3000);
		}
	}

	// SVG ring constants
	const RING_RADIUS = 42;
	const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

	function handleSpotSelect(spot: HuntingSpot) {
		selectHuntingSpot(spot);
		showDropdown = false;
	}

	function handleSearchFocus() {
		showDropdown = true;
	}

	function handleSearchBlur() {
		setTimeout(() => { showDropdown = false; }, 200);
	}

	function handleTimerToggle() {
		if ($grindingTimerStore.isRunning) {
			pauseGrindingTimer();
		} else if ($grindingTimerStore.isPaused) {
			resumeGrindingTimer();
		} else {
			startGrindingTimer();
		}
	}

	function handleEndSession() {
		const masteryVal = mastery.trim() ? parseInt(mastery, 10) : undefined;
		endHuntingSession(
			!isNaN(masteryVal as number) ? masteryVal : undefined,
			matchlockTier || undefined,
			butcheringKnife || undefined,
		);
		mastery = "";
		matchlockTier = "";
		butcheringKnife = "";
	}

	function handleStopTimer() {
		stopGrindingTimer();
	}

	function handleLootChange(itemId: string, value: string) {
		const qty = parseInt(value, 10);
		if (!isNaN(qty)) {
			setHuntingLootCount(itemId, qty);
		} else if (value === "") {
			setHuntingLootCount(itemId, 0);
		}
	}

	function handleLootValueChange(itemId: string, value: string) {
		const stripped = value.replace(/,/g, "");
		const val = parseInt(stripped, 10);
		if (!isNaN(val)) {
			setHuntingLootValue(itemId, val);
		} else if (stripped === "") {
			setHuntingLootValue(itemId, 0);
		}
	}

	function gradeColor(grade: string): string {
		switch (grade) {
			case "legendary": return "border-l-yellow-500 bg-yellow-500/5";
			case "epic": return "border-l-purple-400 bg-purple-400/5";
			case "rare": return "border-l-blue-400 bg-blue-400/5";
			case "uncommon": return "border-l-green-400 bg-green-400/5";
			default: return "border-l-border";
		}
	}

	const PRESETS = [
		{ label: "+1m", mins: 1 },
		{ label: "+3m", mins: 3 },
		{ label: "+5m", mins: 5 },
		{ label: "+10m", mins: 10 },
		{ label: "+15m", mins: 15 },
		{ label: "+30m", mins: 30 },
	];

	const ringOffset = $derived(RING_CIRCUMFERENCE * (1 - $grindingTimerProgress));
	const timerActive = $derived($grindingTimerStore.isRunning || $grindingTimerStore.isPaused);
	const hasElapsed = $derived($grindingTimerStore.totalSeconds - $grindingTimerStore.remainingSeconds > 0 || $grindingTimerStore.isFinished);
	const timerFontClass = $derived($grindingTimerDisplay.length > 5 ? "text-base" : "text-xl");

	function formatSilver(value: number): string {
		return value.toLocaleString();
	}
</script>

<div class="flex flex-col gap-3 h-full">
	<!-- Top: Title (left) + Zone Search (right) -->
	<div class="flex items-start gap-4">
		<div class="flex-shrink-0">
			<h2 class="text-lg font-bold neon-text-green">Hunting Tracker</h2>
		</div>

		<div class="flex-1 min-w-0 space-y-1">
			<div class="relative">
				<input
					type="text"
					bind:value={$huntingSearchStore}
					placeholder="Type name of hunting zone"
					onfocus={handleSearchFocus}
					onblur={handleSearchBlur}
					class="w-full glass-input text-foreground rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-accent"
				/>
				{#if showDropdown && $huntingFilteredSpotsStore.length > 0}
					<div class="absolute z-20 top-full left-0 right-0 mt-1 max-h-48 overflow-auto glass-dropdown rounded">
						{#each $huntingFilteredSpotsStore as spot (spot.id)}
							<button
								onmousedown={() => handleSpotSelect(spot)}
								class="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-secondary/50 transition-colors text-left"
							>
								<img src={"/" + spot.image} alt="" class="w-6 h-6 rounded object-cover" />
								<span class="text-xs text-foreground">{spot.name}</span>
							</button>
						{/each}
					</div>
				{/if}
			</div>

			{#if $huntingSelectedSpotStore}
				<div class="flex items-center gap-2 bg-card border border-accent rounded px-2 py-1">
					<img src={"/" + $huntingSelectedSpotStore.image} alt="" class="w-6 h-6 rounded object-cover" />
					<span class="text-xs font-bold neon-text-green truncate flex-1">{$huntingSelectedSpotStore.name}</span>
					<button
						onclick={clearHuntingSpot}
						class="text-[10px] text-muted-foreground hover:text-destructive transition-colors"
						title="Change spot"
					>
						✕
					</button>
				</div>
			{/if}
		</div>
	</div>

	<!-- Main two-column layout -->
	<div class="flex gap-4 flex-1 min-h-0">
		<!-- LEFT: Timer Component (shared with grinding) -->
		<div class="w-[210px] flex-shrink-0 flex flex-col items-center gap-2">
			<div class="relative w-[110px] h-[100px]">
				<svg viewBox="0 0 110 100" class="w-full h-full">
					<circle cx="55" cy="50" r={RING_RADIUS} fill="none" stroke="#292929" stroke-width="8" />
					<circle
						cx="55" cy="50" r={RING_RADIUS}
						fill="none" stroke="#00FF9D" stroke-width="8"
						stroke-linecap="round"
						stroke-dasharray={RING_CIRCUMFERENCE}
						stroke-dashoffset={ringOffset}
						transform="rotate(-90 55 50)"
						class="timer-ring {$grindingTimerStore.isRunning ? 'timer-ring-running' : ''}"
					/>
				</svg>
				<div class="absolute inset-0 flex items-center justify-center">
					<button
						onclick={handleTimerToggle}
						class="font-mono {timerFontClass} font-bold {$grindingTimerStore.isRunning ? 'neon-text-green' : $grindingTimerStore.isPaused ? 'text-accent' : $grindingTimerStore.isFinished ? 'text-accent' : 'text-muted-foreground'} hover:opacity-80 transition-opacity"
						title={$grindingTimerStore.isRunning ? "Pause" : "Start"}
					>
						{$grindingTimerDisplay}
					</button>
				</div>
			</div>

			<p class="text-[9px] text-muted-foreground uppercase tracking-wider font-bold">Session Timer</p>

			<div class="flex gap-3">
				<div class="flex flex-col items-center">
					<span class="text-[10px] text-muted-foreground">Minutes</span>
					<input
						type="text" inputmode="numeric" pattern="[0-9]*"
						value={$grindingTimerStore.minutes}
						oninput={(e) => {
							const val = parseInt(e.currentTarget.value, 10);
							if (!isNaN(val)) setGrindingTimerMinutes(val);
							else if (e.currentTarget.value === '') setGrindingTimerMinutes(0);
						}}
						disabled={$grindingTimerStore.isRunning}
						class="w-[50px] bg-secondary text-foreground border border-border rounded px-1 py-1 text-lg font-mono text-center focus:outline-none focus:ring-1 focus:ring-accent no-spinner disabled:opacity-50"
					/>
				</div>
				<div class="flex flex-col items-center">
					<span class="text-[10px] text-muted-foreground">Seconds</span>
					<input
						type="text" inputmode="numeric" pattern="[0-9]*"
						value={$grindingTimerStore.seconds}
						oninput={(e) => {
							const val = parseInt(e.currentTarget.value, 10);
							if (!isNaN(val)) setGrindingTimerSeconds(val);
							else if (e.currentTarget.value === '') setGrindingTimerSeconds(0);
						}}
						disabled={$grindingTimerStore.isRunning}
						class="w-[50px] bg-secondary text-foreground border border-border rounded px-1 py-1 text-lg font-mono text-center focus:outline-none focus:ring-1 focus:ring-accent no-spinner disabled:opacity-50"
					/>
				</div>
			</div>

			<div class="grid grid-cols-3 gap-1">
				{#each PRESETS as preset}
					<button
						onclick={() => setGrindingTimerPreset(preset.mins)}
						class="px-2 py-1 text-[11px] bg-secondary border border-border rounded hover:bg-accent hover:text-accent-foreground transition-colors"
					>
						{preset.label}
					</button>
				{/each}
			</div>

			<div class="flex gap-3 justify-center mt-1">
				<button
					onclick={handleTimerToggle}
					class="w-6 h-6 flex items-center justify-center rounded bg-secondary border border-border hover:border-accent transition-colors {$grindingTimerStore.isRunning ? 'text-accent' : 'text-foreground'}"
					title={$grindingTimerStore.isRunning ? "Pause" : timerActive ? "Resume" : "Start"}
				>
					{#if $grindingTimerStore.isRunning}
						<svg viewBox="0 0 24 24" class="w-4 h-4" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
					{:else}
						<svg viewBox="0 0 24 24" class="w-4 h-4" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
					{/if}
				</button>
				<button
					onclick={handleStopTimer}
					disabled={!timerActive && !$grindingTimerStore.isFinished}
					class="w-6 h-6 flex items-center justify-center rounded bg-secondary border border-border hover:border-destructive transition-colors disabled:opacity-30"
					title="Stop & discard"
				>
					<svg viewBox="0 0 24 24" class="w-4 h-4" fill="currentColor"><rect x="5" y="5" width="14" height="14"/></svg>
				</button>
				<button
					onclick={() => resetGrindingTimer()}
					disabled={$grindingTimerStore.isRunning}
					class="w-6 h-6 flex items-center justify-center rounded bg-secondary border border-border hover:border-accent transition-colors disabled:opacity-30"
					title="Reset timer"
				>
					<svg viewBox="0 0 24 24" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
				</button>
			</div>
		</div>

		<!-- RIGHT: Loot List -->
		<div class="flex-1 min-w-0 flex flex-col">
			{#if $huntingSelectedSpotStore}
				<div class="flex items-center justify-between mb-1">
					<div class="flex items-center gap-2">
						<p class="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">
							Items ({$huntingSelectedSpotStore.loot.length}) — Total: <span class="text-accent">{$huntingTotalLootCount}</span>
						</p>
						<button
							onclick={handleFetchPrices}
							disabled={$huntingMarketPricesLoadingStore}
							class="px-1.5 py-0.5 text-[9px] bg-secondary border border-border rounded hover:border-accent hover:text-accent transition-colors disabled:opacity-50 disabled:cursor-wait"
							title="Fetch marketplace prices"
						>
							{#if $huntingMarketPricesLoadingStore}
								<span class="inline-block animate-spin">⟳</span>
							{:else}
								💰 Prices
							{/if}
						</button>
						{#if fetchPriceError}
							<span class="text-[9px] text-destructive">{fetchPriceError}</span>
						{/if}
					</div>
					<div class="flex gap-2 text-[8px] text-muted-foreground/60 uppercase">
						<span class="w-[42px] text-center">Qty</span>
						<span class="w-[58px] text-center">Value</span>
					</div>
				</div>
				<div class="flex-1 overflow-auto space-y-0.5 max-h-[280px]">
					{#each $huntingSelectedSpotItems as item (item.id)}
						{@const count = $huntingLootCountsStore.get(item.id) ?? 0}
						{@const value = $huntingLootValuesStore.get(item.id) ?? 0}
						<div class="flex items-center gap-1.5 border border-border {gradeColor(item.grade)} border-l-2 rounded px-1.5 py-0.5">
							<img src={"/" + item.image} alt="" class="w-6 h-6 object-contain flex-shrink-0" />
							<span class="text-[11px] text-foreground truncate flex-1">{item.name}</span>
							<input
								type="text" inputmode="numeric" pattern="[0-9]*"
								value={count || ""}
								placeholder="0"
								oninput={(e) => handleLootChange(item.id, e.currentTarget.value)}
								class="w-[42px] bg-secondary text-foreground border border-border rounded px-1 py-0.5 text-[11px] font-mono text-center focus:outline-none focus:ring-1 focus:ring-accent no-spinner"
							/>
							<input
								type="text" inputmode="numeric"
								value={value ? value.toLocaleString() : ""}
								placeholder="silver"
								oninput={(e) => handleLootValueChange(item.id, e.currentTarget.value)}
								class="w-[70px] bg-secondary text-foreground border border-border rounded px-1 py-0.5 text-[11px] font-mono text-center focus:outline-none focus:ring-1 focus:ring-accent/50 no-spinner"
							/>
						</div>
					{/each}
				</div>
			{:else}
				<div class="flex-1 flex items-center justify-center text-center text-muted-foreground">
					<div>
						<p class="text-2xl mb-1">🏹</p>
						<p class="text-sm">Select a hunting zone</p>
						<p class="text-[10px] mt-1">Search from {$huntingDataStore?.total_spots ?? 0} zones above</p>
					</div>
				</div>
			{/if}
		</div>
	</div>

	<!-- Bottom Bar: Mastery + Equipment + Total Silver + Log Session -->
	{#if $huntingSelectedSpotStore}
		<div class="flex items-end gap-2 glass-card rounded p-2">
			<div class="flex gap-2 flex-wrap">
				<div>
					<label for="hunt-mastery" class="text-[9px] text-muted-foreground">Mastery</label>
					<input
						id="hunt-mastery"
						type="text" inputmode="numeric" pattern="[0-9]*"
						bind:value={mastery}
						placeholder="0"
						class="w-[55px] bg-secondary text-foreground border border-border rounded px-1 py-1 text-xs font-mono text-center focus:outline-none focus:ring-1 focus:ring-accent no-spinner"
					/>
				</div>
				<div>
					<label for="hunt-matchlock" class="text-[9px] text-muted-foreground">Matchlock</label>
					<select
						id="hunt-matchlock"
						bind:value={matchlockTier}
						class="w-[70px] bg-secondary text-foreground border border-border rounded px-1 py-1 text-[10px] focus:outline-none focus:ring-1 focus:ring-accent"
					>
						<option value="">—</option>
						{#each EQUIPMENT_TIERS as tier}
							<option value={tier.value}>{tier.label}</option>
						{/each}
					</select>
				</div>
				<div>
					<label for="hunt-knife" class="text-[9px] text-muted-foreground">Knife</label>
					<select
						id="hunt-knife"
						bind:value={butcheringKnife}
						class="w-[70px] bg-secondary text-foreground border border-border rounded px-1 py-1 text-[10px] focus:outline-none focus:ring-1 focus:ring-accent"
					>
						<option value="">—</option>
						{#each EQUIPMENT_TIERS as tier}
							<option value={tier.value}>{tier.label}</option>
						{/each}
					</select>
				</div>
				{#if $huntingTotalLootValue > 0}
					<div>
						<span class="text-[9px] text-muted-foreground">Total Silver</span>
						<p class="text-xs font-bold font-mono text-accent">{formatSilver($huntingTotalLootValue)}</p>
					</div>
				{/if}
			</div>
			<div class="flex-1"></div>
			<button
				onclick={handleEndSession}
				disabled={!hasElapsed && $huntingTotalLootCount === 0}
				class="px-4 py-1.5 text-[11px] bg-accent text-accent-foreground font-bold rounded hover:opacity-80 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
			>
				Log Session
			</button>
		</div>
	{/if}
</div>

<style>
	.timer-ring-running {
		transition: stroke-dashoffset 1s linear;
	}
	.timer-ring {
		transition: stroke-dashoffset 0.3s ease-out;
	}
</style>
