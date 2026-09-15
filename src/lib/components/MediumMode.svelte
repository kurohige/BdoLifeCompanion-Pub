<!--
	Medium widget — 460×150 (spec 8c). Three overlay cards (SESSION ring ·
	NEXT BOSS with the last kill pinned · single soonest NEXT RESET) plus the
	20px control column. Medium never grows: at five minutes the boss card
	recolours in place. "Spawn after next" is deliberately gone.
-->
<script lang="ts">
	import { getCurrentWindow } from "@tauri-apps/api/window";
	import {
		settingsStore,
		selectedSpotStore,
		grindingTimerStore,
		grindingTimerDisplay,
		grindingTimerProgress,
		startGrindingTimer,
		pauseGrindingTimer,
		resumeGrindingTimer,
		nextBossSpawn,
		previousBossSpawn,
		previousBossElapsed,
		previousBossNames,
		getBossNames,
	} from "$lib/stores";
	import { tickStore, formatCountdownClock } from "$lib/stores/boss-timer";
	import WindowControls from "./ui/WindowControls.svelte";
	import { idleFade } from "$lib/utils/idle-fade";
	import { BOSSES } from "$lib/constants/boss-data";
	import { getRegionUtcOffset } from "$lib/utils/dst";
	import { m } from "$lib/paraglide/messages";

	const appWindow = getCurrentWindow();

	async function startDrag(e: MouseEvent) {
		if (e.button === 0 && !(e.target as HTMLElement).closest("button")) {
			await appWindow.startDragging();
		}
	}

	// ── Boss ──
	const primaryBoss = $derived(
		$nextBossSpawn ? (BOSSES[$nextBossSpawn.spawn.bosses[0]] ?? null) : null
	);
	const bossNames = $derived($nextBossSpawn ? getBossNames($nextBossSpawn.spawn, " · ") : "");
	const bossCountdown = $derived($nextBossSpawn ? formatCountdownClock($nextBossSpawn.remainingMs) : "—");
	const spawnState = $derived.by(() => {
		const ms = $nextBossSpawn?.remainingMs;
		if (ms == null) return "teal";
		if (ms <= 5 * 60_000) return "rust";
		if (ms <= 15 * 60_000) return "amber";
		return "teal";
	});
	const spawningSoon = $derived(spawnState === "rust" && $nextBossSpawn != null);

	// ── Session ring ──
	const hasTimer = $derived(
		$grindingTimerStore.isRunning || $grindingTimerStore.isPaused ||
		$grindingTimerStore.minutes > 0 || $grindingTimerStore.seconds > 0
	);
	const ringPct = $derived.by(() => {
		if (!$grindingTimerStore.isRunning && !$grindingTimerStore.isPaused) return 0;
		return Math.round((1 - $grindingTimerProgress) * 100);
	});
	function handleTimerToggle() {
		if ($grindingTimerStore.isRunning) pauseGrindingTimer();
		else if ($grindingTimerStore.isPaused) resumeGrindingTimer();
		else if (hasTimer) startGrindingTimer();
	}

	// ── Single soonest reset ──
	type Region = "EU" | "NA" | "SEA" | "SA";
	const NODE_WAR_HOUR: Record<Region, number> = { NA: 18, EU: 20, SEA: 21, SA: 21 };
	function getNextDaily(now: Date): Date { const t = new Date(now); t.setUTCHours(0,0,0,0); t.setUTCDate(t.getUTCDate()+1); return t; }
	function getNextWeekly(now: Date): Date { const t = new Date(now); t.setUTCHours(0,0,0,0); const d=(7-t.getUTCDay())%7||7; t.setUTCDate(t.getUTCDate()+d); return t; }
	function getNextWar(region: Region, now: Date, lh: number, satOnly: boolean): Date {
		for(let i=0;i<8;i++){const c=new Date(now);c.setUTCDate(c.getUTCDate()+i);const off=getRegionUtcOffset(region,c);const utcH=((lh-off)+24)%24;const t=new Date(c);t.setUTCHours(utcH,0,0,0);if(utcH<lh&&region==="NA")t.setUTCDate(t.getUTCDate()+1);if(t.getTime()<=now.getTime())continue;const ld=new Date(t.getTime()+off*3600000).getUTCDay();if(satOnly?ld===6:ld!==6)return t;}
		return new Date(now.getTime()+604800000);
	}
	const nextReset = $derived.by(() => {
		const now = new Date($tickStore);
		const r = ($settingsStore.server_region ?? "NA") as Region;
		const candidates = [
			{ label: m.medium_reset_daily(), at: getNextDaily(now) },
			{ label: m.medium_reset_weekly(), at: getNextWeekly(now) },
			{ label: m.medium_reset_node_war(), at: getNextWar(r, now, NODE_WAR_HOUR[r], false) },
		];
		candidates.sort((a, b) => a.at.getTime() - b.at.getTime());
		const soonest = candidates[0];
		const ms = soonest.at.getTime() - now.getTime();
		const h = Math.floor(ms / 3600000);
		const min = Math.floor((ms % 3600000) / 60000);
		const countdown = h >= 24
			? `${Math.floor(h / 24)}d ${h % 24}h`
			: `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
		const unit = h >= 24 ? m.medium_unit_days() : m.medium_unit_hours();
		const localTime = soonest.at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
		return { label: soonest.label, countdown, subline: `${unit} · ${m.medium_reset_local({ time: localTime })}` };
	});
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div role="banner" onmousedown={startDrag} use:idleFade class="med-shell state-{spawnState}">

	<!-- SESSION -->
	<div class="med-card items-center">
		<span class="med-eyebrow">{m.medium_card_session()}</span>
		<div class="ring" style="background: conic-gradient(var(--teal) 0 {ringPct}%, var(--overlay-chip) {ringPct}% 100%)">
			<div class="ring-hole">
				{$grindingTimerStore.isFinished ? m.medium_timer_done() : $grindingTimerDisplay}
			</div>
		</div>
		{#if $selectedSpotStore}
			<div class="place-row">
				<img src="/icons/grinding.png" alt="" class="h-[17px] w-auto flex-none object-contain" />
				<span class="place-name">{$selectedSpotStore.name}</span>
			</div>
		{/if}
		{#if hasTimer}
			<button onclick={handleTimerToggle} class="pause-chip">
				<span class="text-[8px]">{$grindingTimerStore.isRunning ? "⏸" : "▶"}</span>
				<span>{$grindingTimerStore.isRunning ? m.medium_timer_pause() : m.medium_timer_play()}</span>
			</button>
		{/if}
	</div>

	<!-- NEXT BOSS -->
	<div class="med-card med-card-boss items-center {spawningSoon ? 'boss-soon' : ''}">
		<span class="med-eyebrow {spawningSoon ? 'eyebrow-rust' : ''}">
			{spawningSoon ? m.medium_spawning_soon() : m.medium_card_next_boss()}
		</span>
		<div class="boss-portrait">
			{#if primaryBoss}
				<img src={primaryBoss!.image} alt={primaryBoss!.name}
					class="w-full h-full object-cover {primaryBoss!.isRare ? 'opacity-50' : ''}" />
			{:else}
				<img src="/logo.png" alt="" class="w-full h-full object-contain p-1" />
			{/if}
		</div>
		<span class="boss-names">{bossNames || m.mini_no_boss()}</span>
		<div class="boss-countdown">{bossCountdown}</div>
		{#if $previousBossSpawn}
			<div class="last-kill" title={m.medium_recent_spawn_title()}>
				<span class="last-kill-name">{$previousBossNames}</span>
				<span class="last-kill-ago">{$previousBossElapsed}</span>
			</div>
		{/if}
	</div>

	<!-- NEXT RESET -->
	<div class="med-card">
		<span class="med-eyebrow text-center">{m.medium_card_next_reset()}</span>
		<div class="flex-1 flex flex-col items-center justify-center gap-1">
			<div class="reset-label">{nextReset.label}</div>
			<div class="reset-countdown">{nextReset.countdown}</div>
			<div class="reset-subline">{nextReset.subline}</div>
		</div>
	</div>

	<!-- Controls column -->
	<div class="wc-col">
		<WindowControls variant="medium" />
	</div>
</div>

<style>
	.med-shell {
		box-sizing: border-box;
		width: 100%;
		height: 100%;
		display: flex;
		gap: 6px;
		padding: 6px;
		background: var(--overlay-paper);
		border-radius: 10px;
		box-shadow: var(--shadow-overlay);
		color: var(--ink);
		overflow: hidden;
		cursor: move;
		user-select: none;
		transition: opacity 0.4s;
	}
	.med-shell:global(.widget-idle) { opacity: 0.55; }
	.med-shell:global(.widget-idle) .wc-col { opacity: 0; pointer-events: none; }

	.med-card {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 5px;
		padding: 8px 6px;
		background: var(--overlay-row);
		border-left: 2px solid var(--teal);
		border-radius: 4px 10px 10px 4px;
	}
	.med-card-boss { flex: 1.3; gap: 3px; padding: 8px 7px; }
	.med-card-boss.boss-soon {
		background: #fbf1ec;
		border-left-color: var(--rust);
	}

	.med-eyebrow {
		font: 600 8.5px 'IBM Plex Sans', sans-serif;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--eyebrow-ink);
		text-align: center;
		width: 100%;
	}
	.eyebrow-rust { color: var(--rust); }

	/* ── Session ring ── */
	.ring {
		width: 48px;
		height: 48px;
		flex: none;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.ring-hole {
		width: 40px;
		height: 40px;
		border-radius: 50%;
		background: var(--overlay-row);
		display: flex;
		align-items: center;
		justify-content: center;
		font: 600 11.5px 'IBM Plex Mono', monospace;
		font-variant-numeric: tabular-nums;
		color: var(--teal);
	}
	.place-row {
		display: flex;
		align-items: center;
		gap: 5px;
		max-width: 100%;
	}
	.place-name {
		font-size: 9px;
		color: var(--ink-muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.pause-chip {
		margin-top: auto;
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 3px 8px;
		background: var(--overlay-chip);
		border: none;
		border-radius: 6px;
		color: var(--ink-mid);
		font: 700 8px 'IBM Plex Sans', sans-serif;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		cursor: pointer;
	}
	.pause-chip:hover { filter: brightness(0.95); }

	/* ── Boss card ── */
	.boss-portrait {
		box-sizing: border-box;
		width: 40px;
		height: 40px;
		flex: none;
		border-radius: 50%;
		overflow: hidden;
		background: var(--overlay-chip);
		border: 2px solid var(--teal);
	}
	.state-amber .boss-portrait { border-color: var(--amber); }
	.state-rust .boss-portrait { border-color: var(--rust); }
	.boss-names {
		font: 600 10px 'IBM Plex Sans', sans-serif;
		max-width: 100%;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.boss-countdown {
		font: 600 21px 'IBM Plex Mono', monospace;
		font-variant-numeric: tabular-nums;
		line-height: 1;
		color: var(--teal);
	}
	.state-amber .boss-countdown { color: var(--amber); }
	.state-rust .boss-countdown { color: var(--rust); }
	.last-kill {
		margin-top: auto;
		width: 100%;
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 6px;
		padding-top: 5px;
		border-top: 1px solid var(--card-border);
	}
	.last-kill-name {
		font: 500 9px 'IBM Plex Sans', sans-serif;
		color: var(--ink-muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.last-kill-ago {
		font: 500 9.5px 'IBM Plex Mono', monospace;
		font-variant-numeric: tabular-nums;
		color: var(--ink-faint);
		flex: none;
	}

	/* ── Reset card ── */
	.reset-label {
		font: 600 10px 'IBM Plex Sans', sans-serif;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink-mid);
	}
	.reset-countdown {
		font: 600 22px 'IBM Plex Mono', monospace;
		font-variant-numeric: tabular-nums;
		line-height: 1;
		color: var(--teal);
	}
	.reset-subline {
		font: 400 9px 'IBM Plex Sans', sans-serif;
		color: var(--ink-faint);
	}

	/* ── Controls ── */
	.wc-col {
		width: 20px;
		flex: none;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		transition: opacity 0.25s;
	}
</style>
