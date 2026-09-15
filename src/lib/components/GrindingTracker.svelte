<script lang="ts">
	import {
		grindingDataStore,
		grindingSearchStore,
		selectedSpotStore,
		filteredSpotsStore,
		selectedSpotItems,
		selectSpot,
		clearSpot,
		lootCountsStore,
		lootValuesStore,
		setLootCount,
		setLootValue,
		totalLootCount,
		totalLootValue,
		marketPricesLoadingStore,
		fetchMarketPrices,
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
		endGrindingSession,
		type GrindingSpot,
	} from "$lib/stores";
	import { m } from "$lib/paraglide/messages";
	import { formatNumber } from "$lib/utils/format";
	import { formatSilverShort } from "$lib/constants/chart-theme";
	import { Button } from "$lib/components/ui";

	let showDropdown = $state(false);
	let ap = $state("");
	let dp = $state("");
	let fetchPriceError = $state("");

	async function handleFetchPrices() {
		fetchPriceError = "";
		try {
			await fetchMarketPrices();
		} catch (err) {
			fetchPriceError = m.grinding_fetch_prices_error();
			setTimeout(() => { fetchPriceError = ""; }, 3000);
		}
	}

	// SVG ring constants
	const RING_RADIUS = 42;
	const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

	function handleSpotSelect(spot: GrindingSpot) {
		selectSpot(spot);
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
		const apVal = ap.trim() ? parseInt(ap, 10) : undefined;
		const dpVal = dp.trim() ? parseInt(dp, 10) : undefined;
		endGrindingSession(
			!isNaN(apVal as number) ? apVal : undefined,
			!isNaN(dpVal as number) ? dpVal : undefined,
		);
		ap = "";
		dp = "";
	}

	function handleStopTimer() {
		stopGrindingTimer();
	}

	function handleLootChange(itemId: string, value: string) {
		const qty = parseInt(value, 10);
		if (!isNaN(qty)) {
			setLootCount(itemId, qty);
		} else if (value === "") {
			setLootCount(itemId, 0);
		}
	}

	function handleLootValueChange(itemId: string, value: string) {
		const stripped = value.replace(/,/g, "");
		const val = parseInt(stripped, 10);
		if (!isNaN(val)) {
			setLootValue(itemId, val);
		} else if (stripped === "") {
			setLootValue(itemId, 0);
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

	// Timer presets (additive — each click adds time)
	const PRESETS = [
		{ label: "+15m", mins: 15 },
		{ label: "+30m", mins: 30 },
		{ label: "+1h", mins: 60 },
	];

	// Ring stroke offset for progress
	const ringOffset = $derived(RING_CIRCUMFERENCE * (1 - $grindingTimerProgress));
	const timerActive = $derived($grindingTimerStore.isRunning || $grindingTimerStore.isPaused);
	const hasElapsed = $derived($grindingTimerStore.totalSeconds - $grindingTimerStore.remainingSeconds > 0 || $grindingTimerStore.isFinished);
	// Responsive font class: smaller for hour-format timers
	const timerFontClass = $derived($grindingTimerDisplay.length > 5 ? "text-base" : "text-xl");

	// Silver/hr projection from loot value + timer elapsed (needs ≥1 min so a few
	// seconds of runtime don't extrapolate into an absurd rate)
	const elapsedSeconds = $derived($grindingTimerStore.totalSeconds - $grindingTimerStore.remainingSeconds);
	const silverPerHour = $derived(
		elapsedSeconds >= 60 ? Math.round(($totalLootValue * 3600) / elapsedSeconds) : 0,
	);

	// Format silver value with locale-aware thousands separator
	function formatSilver(value: number): string {
		return formatNumber(value);
	}
</script>

<div class="flex flex-col gap-3 h-full">
	<!-- Top: Title (left) + Zone Search (right) -->
	<div class="flex items-start gap-4">
		<!-- Title -->
		<div class="flex-shrink-0">
			<h2 class="text-base font-bold text-foreground">{m.grinding_tracker_title()}</h2>
		</div>

		<!-- Zone Search & Selection (right side) -->
		<div class="flex-1 min-w-0 space-y-1">
			<div class="relative">
				<input
					type="text"
					bind:value={$grindingSearchStore}
					placeholder={m.grinding_zone_search_placeholder()}
					onfocus={handleSearchFocus}
					onblur={handleSearchBlur}
					class="w-full paper-input text-foreground rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
				/>
				{#if showDropdown && $filteredSpotsStore.length > 0}
					<div class="absolute z-20 top-full left-0 right-0 mt-1 max-h-48 overflow-auto paper-dropdown rounded">
						{#each $filteredSpotsStore as spot (spot.id)}
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

			{#if $selectedSpotStore}
				<div class="flex items-center gap-2 bg-card border-l-2 border-l-primary border-y border-r border-outline-variant rounded px-2 py-1">
					<img src={"/" + $selectedSpotStore.image} alt="" class="w-8 h-8 rounded object-cover icon-frame" />
					<span class="text-xs font-bold text-foreground truncate flex-1">{$selectedSpotStore.name}</span>
					<button
						onclick={clearSpot}
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
		<!-- LEFT: Timer Component -->
		<div class="w-[210px] flex-shrink-0 flex flex-col items-center gap-2">
			<!-- Ring Timer -->
			<div class="relative w-[110px] h-[100px]">
				<svg viewBox="0 0 110 100" class="w-full h-full">
					<!-- BG ring -->
					<circle
						cx="55" cy="50" r={RING_RADIUS}
						fill="none"
						stroke="var(--surface-high)"
						stroke-width="8"
					/>
					<!-- Progress ring — cyan while running (live), primary otherwise -->
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
				<!-- Timer display centered in ring -->
				<div class="absolute inset-0 flex items-center justify-center">
					<button
						onclick={handleTimerToggle}
						class="font-mono {timerFontClass} font-bold {$grindingTimerStore.isRunning ? 'live-teal' : $grindingTimerStore.isPaused ? 'text-primary' : $grindingTimerStore.isFinished ? 'text-accent' : 'text-muted-foreground'} hover:opacity-80 transition-opacity"
						title={$grindingTimerStore.isRunning ? m.grinding_timer_pause() : m.grinding_timer_start()}
					>
						{$grindingTimerDisplay}
					</button>
				</div>
			</div>

			<!-- Session Timer Label -->
			<p class="text-[12px] text-muted-foreground uppercase tracking-wider font-bold">{m.grinding_timer_session()}</p>

			<!-- Minutes / Seconds Inputs -->
			<div class="flex gap-3">
				<div class="flex flex-col items-center">
					<span class="text-[12px] text-muted-foreground">{m.grinding_timer_minutes()}</span>
					<input
						type="text"
						inputmode="numeric"
						pattern="[0-9]*"
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
						type="text"
						inputmode="numeric"
						pattern="[0-9]*"
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

			<!-- Preset Buttons (additive — each click adds time) -->
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

			<!-- Timer Controls: Play/Pause, Stop, Reset -->
			<div class="flex gap-3 justify-center mt-1">
				<!-- Play / Pause -->
				<button
					onclick={handleTimerToggle}
					class="w-6 h-6 flex items-center justify-center rounded bg-secondary border border-border hover:border-primary transition-colors {$grindingTimerStore.isRunning ? 'text-cyan' : 'text-foreground'}"
					title={$grindingTimerStore.isRunning ? m.grinding_timer_pause() : timerActive ? m.grinding_timer_resume() : m.grinding_timer_start()}
				>
					{#if $grindingTimerStore.isRunning}
						<svg viewBox="0 0 24 24" class="w-4 h-4" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
					{:else}
						<svg viewBox="0 0 24 24" class="w-4 h-4" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
					{/if}
				</button>
				<!-- Stop -->
				<button
					onclick={handleStopTimer}
					disabled={!timerActive && !$grindingTimerStore.isFinished}
					class="w-6 h-6 flex items-center justify-center rounded bg-secondary border border-border hover:border-destructive transition-colors disabled:opacity-30"
					title={m.grinding_timer_stop()}
				>
					<svg viewBox="0 0 24 24" class="w-4 h-4" fill="currentColor"><rect x="5" y="5" width="14" height="14"/></svg>
				</button>
				<!-- Reset -->
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
			{#if $selectedSpotStore}
				<div class="flex items-center justify-between mb-1">
					<div class="flex items-center gap-2">
						<p class="text-[12px] text-muted-foreground uppercase tracking-wider font-bold">
							{m.grinding_items_header({ count: $selectedSpotStore.loot.length })} <span class="text-foreground font-mono">{$totalLootCount}</span>
						</p>
						<Button
							variant="secondary"
							size="sm"
							onclick={handleFetchPrices}
							disabled={$marketPricesLoadingStore}
							title={m.grinding_fetch_prices_title()}
						>
							{#if $marketPricesLoadingStore}
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
					{#each $selectedSpotItems as item (item.id)}
						{@const count = $lootCountsStore.get(item.id) ?? 0}
						{@const value = $lootValuesStore.get(item.id) ?? 0}
						<div class="flex items-center gap-1.5 border border-border {gradeColor(item.grade)} border-l-2 rounded px-1.5 py-0.5">
							<img src={"/" + item.image} alt="" class="w-9 h-9 rounded object-contain flex-shrink-0 icon-frame" />
							<span class="text-[12.5px] text-foreground truncate flex-1">{item.name}</span>
							<input
								type="text"
								inputmode="numeric"
								pattern="[0-9]*"
								value={count || ""}
								placeholder="0"
								oninput={(e) => handleLootChange(item.id, e.currentTarget.value)}
								class="w-[42px] bg-secondary text-foreground border border-border rounded px-1 py-0.5 text-[12.5px] font-mono text-center focus:outline-none focus:ring-1 focus:ring-primary no-spinner"
							/>
							<input
								type="text"
								inputmode="numeric"
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
						<img src="/icons/grinding.png" alt={m.grinding_alt_image()} class="h-11 w-auto mx-auto mb-1 opacity-90" />
						<p class="text-sm">{m.grinding_select_zone()}</p>
						<p class="text-[12px] mt-1">{m.grinding_search_zones_above({ count: $grindingDataStore?.total_spots ?? 0 })}</p>
					</div>
				</div>
			{/if}
		</div>
	</div>

	<!-- Bottom Bar: AP/DP + Total Value + Log Session -->
	{#if $selectedSpotStore}
		<div class="flex items-end gap-3 paper-card rounded p-2">
			<div class="flex gap-3">
				<div>
					<label for="ap-input" class="text-[12px] text-muted-foreground">{m.grinding_ap_label()}</label>
					<input
						id="ap-input"
						type="text"
						inputmode="numeric"
						pattern="[0-9]*"
						bind:value={ap}
						placeholder="0"
						class="w-[60px] bg-secondary text-foreground border border-border rounded px-1 py-1 text-xs font-mono text-center focus:outline-none focus:ring-1 focus:ring-primary no-spinner"
					/>
				</div>
				<div>
					<label for="dp-input" class="text-[12px] text-muted-foreground">{m.grinding_dp_label()}</label>
					<input
						id="dp-input"
						type="text"
						inputmode="numeric"
						pattern="[0-9]*"
						bind:value={dp}
						placeholder="0"
						class="w-[60px] bg-secondary text-foreground border border-border rounded px-1 py-1 text-xs font-mono text-center focus:outline-none focus:ring-1 focus:ring-primary no-spinner"
					/>
				</div>
				{#if $totalLootValue > 0}
					<div>
						<span class="text-[12px] text-muted-foreground">{m.grinding_total_silver()}</span>
						<p class="text-xs font-bold font-mono text-foreground">{formatSilver($totalLootValue)}</p>
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
				disabled={!hasElapsed && $totalLootCount === 0}
			>
				{m.grinding_log_session()}
			</Button>
		</div>
	{/if}
</div>

<style>
	/* Smooth linear transition when timer is running (continuous arc) */
	.timer-ring-running {
		transition: stroke-dashoffset 1s linear;
	}
	/* Instant snap when setting/resetting timer (no animation lag) */
	.timer-ring {
		transition: stroke-dashoffset 0.3s ease-out;
	}
</style>
