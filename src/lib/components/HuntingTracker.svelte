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
	import { m } from "$lib/paraglide/messages";
	import { formatNumber } from "$lib/utils/format";
	import { formatSilverShort } from "$lib/constants/chart-theme";
	import { Button } from "$lib/components/ui";

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
			fetchPriceError = m.grinding_fetch_prices_error();
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

	// Grade colors for loot list left-borders — muted data colors, no bg tint
	// (rarity is data, not decoration: just a thin colored edge).
	function gradeColor(grade: string): string {
		switch (grade) {
			case "legendary": return "border-l-[#d9b24a]";
			case "epic": return "border-l-[#b98cff]";
			case "rare": return "border-l-[#5aa9e6]";
			case "uncommon": return "border-l-[#6fc28a]";
			default: return "border-l-outline-variant";
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

	// Silver/hr projection from loot value + timer elapsed (needs ≥1 min so a few
	// seconds of runtime don't extrapolate into an absurd rate)
	const elapsedSeconds = $derived($grindingTimerStore.totalSeconds - $grindingTimerStore.remainingSeconds);
	const silverPerHour = $derived(
		elapsedSeconds >= 60 ? Math.round(($huntingTotalLootValue * 3600) / elapsedSeconds) : 0,
	);

	function formatSilver(value: number): string {
		return formatNumber(value);
	}
</script>

<div class="flex flex-col gap-3 h-full">
	<!-- Top: Title (left) + Zone Search (right) -->
	<div class="flex items-start gap-4">
		<div class="flex-shrink-0">
			<h2 class="text-base font-bold text-foreground">{m.hunting_tracker_title()}</h2>
		</div>

		<div class="flex-1 min-w-0 space-y-1">
			<div class="relative">
				<input
					type="text"
					bind:value={$huntingSearchStore}
					placeholder={m.hunting_zone_search_placeholder()}
					onfocus={handleSearchFocus}
					onblur={handleSearchBlur}
					class="w-full paper-input text-foreground rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
				/>
				{#if showDropdown && $huntingFilteredSpotsStore.length > 0}
					<div class="absolute z-20 top-full left-0 right-0 mt-1 max-h-48 overflow-auto paper-dropdown rounded">
						{#each $huntingFilteredSpotsStore as spot (spot.id)}
							<button
								onmousedown={() => handleSpotSelect(spot)}
								class="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-secondary/50 transition-colors text-left"
							>
								<img src={"/" + spot.image} alt="" class="w-8 h-8 rounded object-cover icon-frame" />
								<span class="text-xs text-foreground">{spot.name}</span>
							</button>
						{/each}
					</div>
				{/if}
			</div>

			{#if $huntingSelectedSpotStore}
				<div class="flex items-center gap-2 bg-card border-l-2 border-l-primary border-y border-r border-outline-variant rounded px-2 py-1">
					<img src={"/" + $huntingSelectedSpotStore.image} alt="" class="w-8 h-8 rounded object-cover icon-frame" />
					<span class="text-xs font-bold text-foreground truncate flex-1">{$huntingSelectedSpotStore.name}</span>
					<button
						onclick={clearHuntingSpot}
						class="text-[12px] text-muted-foreground hover:text-destructive transition-colors"
						title={m.grinding_change_spot()}
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
					<circle cx="55" cy="50" r={RING_RADIUS} fill="none" stroke="var(--surface-high)" stroke-width="8" />
					<circle
						cx="55" cy="50" r={RING_RADIUS}
						fill="none"
						stroke={$grindingTimerStore.isRunning ? "var(--teal)" : "var(--teal)"}
						stroke-width="8"
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
						class="font-mono {timerFontClass} font-bold {$grindingTimerStore.isRunning ? 'text-accent' : $grindingTimerStore.isPaused ? 'text-primary' : $grindingTimerStore.isFinished ? 'text-accent' : 'text-muted-foreground'} hover:opacity-80 transition-opacity"
						title={$grindingTimerStore.isRunning ? m.grinding_timer_pause() : m.grinding_timer_start()}
					>
						{$grindingTimerDisplay}
					</button>
				</div>
			</div>

			<p class="text-[12px] text-muted-foreground uppercase tracking-wider font-bold">{m.grinding_timer_session()}</p>

			<div class="flex gap-3">
				<div class="flex flex-col items-center">
					<span class="text-[12px] text-muted-foreground">{m.grinding_timer_minutes()}</span>
					<input
						type="text" inputmode="numeric" pattern="[0-9]*"
						value={$grindingTimerStore.minutes}
						oninput={(e) => {
							const val = parseInt(e.currentTarget.value, 10);
							if (!isNaN(val)) setGrindingTimerMinutes(val);
							else if (e.currentTarget.value === '') setGrindingTimerMinutes(0);
						}}
						disabled={$grindingTimerStore.isRunning}
						class="w-[50px] bg-secondary text-foreground border border-border rounded px-1 py-1 text-lg font-mono text-center focus:outline-none focus:ring-1 focus:ring-primary no-spinner disabled:opacity-50"
					/>
				</div>
				<div class="flex flex-col items-center">
					<span class="text-[12px] text-muted-foreground">{m.grinding_timer_seconds()}</span>
					<input
						type="text" inputmode="numeric" pattern="[0-9]*"
						value={$grindingTimerStore.seconds}
						oninput={(e) => {
							const val = parseInt(e.currentTarget.value, 10);
							if (!isNaN(val)) setGrindingTimerSeconds(val);
							else if (e.currentTarget.value === '') setGrindingTimerSeconds(0);
						}}
						disabled={$grindingTimerStore.isRunning}
						class="w-[50px] bg-secondary text-foreground border border-border rounded px-1 py-1 text-lg font-mono text-center focus:outline-none focus:ring-1 focus:ring-primary no-spinner disabled:opacity-50"
					/>
				</div>
			</div>

			<div class="grid grid-cols-3 gap-1">
				{#each PRESETS as preset}
					<button
						onclick={() => setGrindingTimerPreset(preset.mins)}
						class="px-2 py-1 text-[12.5px] bg-secondary border border-border rounded hover:bg-primary hover:text-primary-foreground transition-colors"
					>
						{preset.label}
					</button>
				{/each}
			</div>

			<div class="flex gap-3 justify-center mt-1">
				<button
					onclick={handleTimerToggle}
					class="w-6 h-6 flex items-center justify-center rounded bg-secondary border border-border hover:border-primary transition-colors {$grindingTimerStore.isRunning ? 'text-accent' : 'text-foreground'}"
					title={$grindingTimerStore.isRunning ? m.grinding_timer_pause() : timerActive ? m.grinding_timer_resume() : m.grinding_timer_start()}
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
					title={m.grinding_timer_stop()}
				>
					<svg viewBox="0 0 24 24" class="w-4 h-4" fill="currentColor"><rect x="5" y="5" width="14" height="14"/></svg>
				</button>
				<button
					onclick={() => resetGrindingTimer()}
					disabled={$grindingTimerStore.isRunning}
					class="w-6 h-6 flex items-center justify-center rounded bg-secondary border border-border hover:border-primary transition-colors disabled:opacity-30"
					title={m.grinding_timer_reset()}
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
						<p class="text-[12px] text-muted-foreground uppercase tracking-wider font-bold">
							{m.grinding_items_header({ count: $huntingSelectedSpotStore.loot.length })} <span class="text-foreground font-mono">{$huntingTotalLootCount}</span>
						</p>
						<Button
							variant="secondary"
							size="sm"
							onclick={handleFetchPrices}
							disabled={$huntingMarketPricesLoadingStore}
							title={m.grinding_fetch_prices_title()}
						>
							{#if $huntingMarketPricesLoadingStore}
								<span class="inline-block animate-spin">⟳</span>
							{:else}
								{m.grinding_prices_btn()}
							{/if}
						</Button>
						{#if fetchPriceError}
							<span class="text-[12px] text-destructive">{fetchPriceError}</span>
						{/if}
					</div>
					<div class="flex gap-2 text-[10.5px] text-muted-foreground/60 uppercase">
						<span class="w-[42px] text-center">{m.grinding_col_qty()}</span>
						<span class="w-[58px] text-center">{m.grinding_col_value()}</span>
					</div>
				</div>
				<div class="flex-1 min-h-0 overflow-auto space-y-0.5">
					{#each $huntingSelectedSpotItems as item (item.id)}
						{@const count = $huntingLootCountsStore.get(item.id) ?? 0}
						{@const value = $huntingLootValuesStore.get(item.id) ?? 0}
						<div class="flex items-center gap-1.5 border border-border {gradeColor(item.grade)} border-l-2 rounded px-1.5 py-0.5">
							<img src={"/" + item.image} alt="" class="w-9 h-9 object-contain flex-shrink-0 icon-frame" />
							<span class="text-[12.5px] text-foreground truncate flex-1">{item.name}</span>
							<input
								type="text" inputmode="numeric" pattern="[0-9]*"
								value={count || ""}
								placeholder="0"
								oninput={(e) => handleLootChange(item.id, e.currentTarget.value)}
								class="w-[42px] bg-secondary text-foreground border border-border rounded px-1 py-0.5 text-[12.5px] font-mono text-center focus:outline-none focus:ring-1 focus:ring-primary no-spinner"
							/>
							<input
								type="text" inputmode="numeric"
								value={value ? formatNumber(value) : ""}
								placeholder={m.grinding_silver_placeholder()}
								oninput={(e) => handleLootValueChange(item.id, e.currentTarget.value)}
								class="w-[70px] bg-secondary text-foreground border border-border rounded px-1 py-0.5 text-[12.5px] font-mono text-center focus:outline-none focus:ring-1 focus:ring-accent/50 no-spinner"
							/>
						</div>
					{/each}
				</div>
			{:else}
				<div class="flex-1 flex items-center justify-center text-center text-muted-foreground">
					<div>
						<p class="text-2xl mb-1">🏹</p>
						<p class="text-sm">{m.hunting_select_zone()}</p>
						<p class="text-[12px] mt-1">{m.grinding_search_zones_above({ count: $huntingDataStore?.total_spots ?? 0 })}</p>
					</div>
				</div>
			{/if}
		</div>
	</div>

	<!-- Bottom Bar: Mastery + Equipment + Total Silver + Log Session -->
	{#if $huntingSelectedSpotStore}
		<div class="flex items-end gap-2 paper-card rounded p-2">
			<div class="flex gap-2 flex-wrap">
				<div>
					<label for="hunt-mastery" class="text-[12px] text-muted-foreground">{m.hunting_mastery_label()}</label>
					<input
						id="hunt-mastery"
						type="text" inputmode="numeric" pattern="[0-9]*"
						bind:value={mastery}
						placeholder="0"
						class="w-[55px] bg-secondary text-foreground border border-border rounded px-1 py-1 text-xs font-mono text-center focus:outline-none focus:ring-1 focus:ring-primary no-spinner"
					/>
				</div>
				<div>
					<label for="hunt-matchlock" class="text-[12px] text-muted-foreground">{m.hunting_matchlock_label()}</label>
					<select
						id="hunt-matchlock"
						bind:value={matchlockTier}
						class="w-[70px] bg-secondary text-foreground border border-border rounded px-1 py-1 text-[12px] focus:outline-none focus:ring-1 focus:ring-primary"
					>
						<option value="">—</option>
						{#each EQUIPMENT_TIERS as tier}
							<option value={tier.value}>{tier.label}</option>
						{/each}
					</select>
				</div>
				<div>
					<label for="hunt-knife" class="text-[12px] text-muted-foreground">{m.hunting_knife_label()}</label>
					<select
						id="hunt-knife"
						bind:value={butcheringKnife}
						class="w-[70px] bg-secondary text-foreground border border-border rounded px-1 py-1 text-[12px] focus:outline-none focus:ring-1 focus:ring-primary"
					>
						<option value="">—</option>
						{#each EQUIPMENT_TIERS as tier}
							<option value={tier.value}>{tier.label}</option>
						{/each}
					</select>
				</div>
				{#if $huntingTotalLootValue > 0}
					<div>
						<span class="text-[12px] text-muted-foreground">{m.grinding_total_silver()}</span>
						<p class="text-xs font-bold font-mono text-foreground">{formatSilver($huntingTotalLootValue)}</p>
					</div>
					{#if silverPerHour > 0}
						<div>
							<span class="text-[12px] text-muted-foreground">{m.grinding_silver_per_hour()}</span>
							<p class="text-xs font-bold font-mono text-foreground">{formatSilverShort(silverPerHour)}</p>
						</div>
					{/if}
				{/if}
			</div>
			<div class="flex-1"></div>
			<Button
				variant="primary"
				onclick={handleEndSession}
				disabled={!hasElapsed && $huntingTotalLootCount === 0}
			>
				{m.grinding_log_session()}
			</Button>
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
