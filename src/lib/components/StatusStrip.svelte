<!--
	Status strip module (spec 5a / 4b) — one white card: next boss with the
	last kill beneath the countdown, a divider, the live session with its rate,
	and the session actions. Reused by any screen that slots it; the session
	side follows whichever session is running.
-->
<script lang="ts">
	import {
		nextBossSpawn,
		previousBossSpawn,
		previousBossNames,
		previousBossElapsed,
		getBossNames,
		activeCategoryStore,
		pauseGrindingTimer,
		resumeGrindingTimer,
		settingsStore,
	} from "$lib/stores";
	import { formatCountdownClock } from "$lib/stores/boss-timer";
	import { activeSessionStore } from "$lib/stores/active-session";
	import {
		craftingSessionStore,
		craftingSessionRate,
		startCraftingSession,
		pauseCraftingSession,
		resumeCraftingSession,
		stopCraftingSession,
	} from "$lib/stores/crafting-session";
	import { BOSSES } from "$lib/constants/boss-data";
	import { Button } from "$lib/components/ui";
	import { m } from "$lib/paraglide/messages";

	// When true (the Crafting screen), an idle strip offers "Start session"
	// and a crafting session gets Stop & log.
	let { craftingActions = false }: { craftingActions?: boolean } = $props();

	const primaryBoss = $derived(
		$nextBossSpawn ? (BOSSES[$nextBossSpawn.spawn.bosses[0]] ?? null) : null,
	);
	const bossNames = $derived($nextBossSpawn ? getBossNames($nextBossSpawn.spawn, " · ") : "");
	const countdown = $derived($nextBossSpawn ? formatCountdownClock($nextBossSpawn.remainingMs) : "--:--");
	const spawnState = $derived.by(() => {
		const ms = $nextBossSpawn?.remainingMs;
		if (ms == null) return "teal";
		if (ms <= 5 * 60_000) return "rust";
		if (ms <= 15 * 60_000) return "amber";
		return "teal";
	});

	const sessionLabel = $derived.by(() => {
		const s = $activeSessionStore;
		if (!s) return "";
		if (s.kind === "crafting") {
			const cat = $craftingSessionStore?.category;
			return cat === "alchemy" ? m.log_filter_alchemy() : cat === "draughts" ? m.log_filter_draughts() : m.log_filter_cooking();
		}
		return m.nav_grinding();
	});

	function handlePauseResume() {
		const s = $activeSessionStore;
		if (!s) return;
		if (s.kind === "crafting") {
			if (s.paused) resumeCraftingSession();
			else pauseCraftingSession();
		} else if (s.kind === "grinding") {
			if (s.paused) resumeGrindingTimer();
			else pauseGrindingTimer();
		}
	}
</script>

<div class="strip">
	<!-- Boss cluster -->
	<div class="flex items-center gap-2.5 min-w-0">
		<div class="boss-circle">
			{#if primaryBoss}
				<img src={primaryBoss!.image} alt={primaryBoss!.name}
					class="w-full h-full object-cover {primaryBoss!.isRare ? 'opacity-50' : ''}" />
			{:else}
				<img src="/logo.png" alt="" class="w-full h-full object-contain p-1" />
			{/if}
		</div>
		<div class="min-w-0">
			<div class="eyebrow">{m.medium_card_next_boss()}</div>
			<div class="boss-names">{bossNames || m.mini_no_boss()}</div>
		</div>
	</div>

	<div class="min-w-0">
		<div class="boss-countdown state-{spawnState}">{countdown}</div>
		{#if $previousBossSpawn && $settingsStore.show_last_kill}
			<div class="last-kill" title={m.medium_recent_spawn_title()}>{$previousBossNames} · {$previousBossElapsed}</div>
		{/if}
	</div>

	{#if $activeSessionStore}
		<div class="v-rule"></div>

		<!-- Live session -->
		<div class="flex items-center gap-2 min-w-0">
			<span class="live-dot {$activeSessionStore.paused ? 'dot-paused' : ''}"></span>
			<span class="eyebrow">{sessionLabel}</span>
			<span class="session-elapsed">{$activeSessionStore.display}</span>
			{#if $craftingSessionStore && $activeSessionStore.kind === "crafting"}
				<span class="session-meta">{m.strip_crafted_count({ count: $craftingSessionStore.crafted })}</span>
				{#if $craftingSessionRate != null}
					<span class="session-rate">{m.strip_rate_hr({ rate: $craftingSessionRate })}</span>
				{/if}
			{/if}
		</div>
	{/if}

	<div class="ml-auto flex gap-2 flex-none">
		{#if $activeSessionStore}
			{#if $activeSessionStore.kind === "crafting" && craftingActions}
				<Button variant="primary" size="sm" onclick={stopCraftingSession}>{m.strip_stop_log()}</Button>
			{/if}
			<Button variant="secondary" size="sm" onclick={handlePauseResume}>
				{$activeSessionStore.paused ? m.medium_timer_play() : m.medium_timer_pause()}
			</Button>
		{:else if craftingActions}
			<Button variant="secondary" size="sm" onclick={() => startCraftingSession($activeCategoryStore)}>
				{m.strip_start_session()}
			</Button>
		{/if}
	</div>
</div>

<style>
	.strip {
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 11px 14px;
		background: var(--card-bg);
		border: 1px solid var(--card-border);
		border-radius: 14px;
		box-shadow: var(--card-shadow);
	}

	.boss-circle {
		box-sizing: border-box;
		width: 30px;
		height: 30px;
		flex: none;
		border-radius: 50%;
		overflow: hidden;
		background: var(--chip);
		border: 1px solid var(--card-border);
	}

	.boss-names {
		font-size: 12px;
		font-weight: 600;
		white-space: nowrap;
		margin-top: 1px;
	}

	.boss-countdown {
		font: 600 17px 'IBM Plex Mono', monospace;
		font-variant-numeric: tabular-nums;
		line-height: 1.1;
		white-space: nowrap;
		color: var(--teal);
	}
	.boss-countdown.state-amber { color: var(--amber); }
	.boss-countdown.state-rust { color: var(--rust); }

	.last-kill {
		font: 400 12px 'IBM Plex Sans', sans-serif;
		color: var(--ink-faint);
		margin-top: 2px;
		white-space: nowrap;
	}

	.v-rule {
		width: 1px;
		height: 26px;
		background: var(--divider);
		flex: none;
	}

	.live-dot {
		width: 7px;
		height: 7px;
		flex: none;
		border-radius: 50%;
		background: var(--live-dot);
	}
	.dot-paused { background: var(--ink-faint); }

	.session-elapsed {
		font: 600 15px 'IBM Plex Mono', monospace;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	.session-meta {
		font: 500 12px 'IBM Plex Mono', monospace;
		color: var(--ink-muted);
		white-space: nowrap;
	}
	.session-rate {
		font: 500 12px 'IBM Plex Mono', monospace;
		color: var(--teal);
		white-space: nowrap;
	}
</style>
