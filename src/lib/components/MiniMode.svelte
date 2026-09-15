<!--
	Mini widget — 400×56, "Mini B" layout (handoff README §3): the number is
	the object. Portrait → 20px countdown with boss names beneath → divider →
	session → bare clocks → the three-button control set. Spawn hairline along
	the bottom edge; under 5 minutes the window grows DOWNWARD by 26px to
	400×82 for the escalation line and the clocks yield the room.
-->
<script lang="ts">
	import { getCurrentWindow } from "@tauri-apps/api/window";
	import {
		settingsStore,
		nextBossSpawn,
		previousBossSpawn,
		getBossNames,
	} from "$lib/stores";
	import { formatCountdownClock, formatCountdownMinSec, tickStore } from "$lib/stores/boss-timer";
	import { activeSessionStore } from "$lib/stores/active-session";
	import { MINI_SIZE, MINI_ALERT_SIZE } from "$lib/services/window-mode";
	import WindowControls from "./ui/WindowControls.svelte";
	import { idleFade } from "$lib/utils/idle-fade";
	import { BOSSES } from "$lib/constants/boss-data";
	import { fmt24, fmt12, fmtServer, fmtServer12 } from "$lib/utils/time";
	import { m } from "$lib/paraglide/messages";

	const appWindow = getCurrentWindow();

	async function startDrag(e: MouseEvent) {
		if (e.button === 0 && !(e.target as HTMLElement).closest("button")) {
			await appWindow.startDragging();
		}
	}

	// ── Boss ──
	const primaryBoss = $derived(
		$nextBossSpawn ? (BOSSES[$nextBossSpawn.spawn.bosses[0]] ?? null) : null,
	);
	const bossNames = $derived($nextBossSpawn ? getBossNames($nextBossSpawn.spawn, " · ") : "");
	const extraBossCount = $derived(
		$nextBossSpawn ? Math.max(0, $nextBossSpawn.spawn.bosses.length - 1) : 0,
	);
	const countdown = $derived($nextBossSpawn ? formatCountdownClock($nextBossSpawn.remainingMs) : "--:--");

	// Spawn state (spec 8d): teal >15m, amber <15m, rust <5m.
	const spawnState = $derived.by(() => {
		const ms = $nextBossSpawn?.remainingMs;
		if (ms == null) return "teal";
		if (ms <= 5 * 60_000) return "rust";
		if (ms <= 15 * 60_000) return "amber";
		return "teal";
	});
	const escalated = $derived(spawnState === "rust" && $nextBossSpawn != null);

	// Hairline: progress from the previous spawn toward the next one.
	const spawnProgress = $derived.by(() => {
		const prev = $previousBossSpawn?.spawnDate?.getTime();
		const next = $nextBossSpawn?.spawnDate?.getTime();
		if (!prev || !next || next <= prev) return 0;
		return Math.min(1, Math.max(0, ($tickStore - prev) / (next - prev)));
	});

	// Grow downward while the escalation line shows; shrink back after.
	let appliedAlert = false;
	$effect(() => {
		if (escalated !== appliedAlert) {
			appliedAlert = escalated;
			appWindow.setSize(escalated ? MINI_ALERT_SIZE : MINI_SIZE).catch(() => {});
		}
	});

	// ── Clocks (yield to the escalation line) ──
	let now = $state(new Date());
	$effect(() => {
		const id = setInterval(() => { now = new Date(); }, 1000);
		return () => clearInterval(id);
	});
	const showClocks = $derived(($settingsStore.mini_show_clocks ?? true) && !escalated);
	const use24h = $derived($settingsStore.clock_format_24h ?? true);
	const localTime = $derived(use24h ? fmt24(now) : fmt12(now));
	const serverTime = $derived(use24h ? fmtServer(now) : fmtServer12(now));
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
	role="banner"
	onmousedown={startDrag}
	use:idleFade
	class="mini-shell state-{spawnState}"
>
	<div class="mini-row">
		<!-- Boss portrait: badge parent stays unclipped, image clips inside -->
		<div class="boss-wrap">
			<div class="boss-circle">
				{#if primaryBoss}
					<img
						src={primaryBoss!.image}
						alt={primaryBoss!.name}
						class="w-full h-full object-cover {primaryBoss!.isRare ? 'opacity-50' : ''}"
					/>
				{:else}
					<img src="/logo.png" alt="" class="w-full h-full object-contain p-1" />
				{/if}
			</div>
			{#if extraBossCount > 0}
				<span class="boss-badge">+{extraBossCount}</span>
			{/if}
		</div>

		<!-- The number is the object -->
		<div class="count-block">
			{#if $nextBossSpawn}
				<div class="count-timer">{countdown}</div>
				<div class="count-names">{bossNames}</div>
			{:else}
				<div class="count-names">{m.mini_no_boss()}</div>
			{/if}
		</div>

		<div class="v-divider"></div>

		<!-- Session cluster — the only cluster allowed to truncate -->
		{#if $activeSessionStore}
			<div class="session-cluster">
				<img src={$activeSessionStore.icon} alt="" class="session-icon" />
				<div class="min-w-0 leading-[1.15]">
					{#if $activeSessionStore.place}
						<div class="session-place">{$activeSessionStore.place}</div>
					{/if}
					<div class="session-timer">{$activeSessionStore.display}</div>
				</div>
			</div>
		{:else}
			<div class="flex-1 min-w-0"></div>
		{/if}

		{#if showClocks}
			<div class="clock-stack" title={m.mini_clock_cluster_title()}>
				<div class="clock-local">{localTime}</div>
				<div class="clock-server">{serverTime}</div>
			</div>
		{/if}

		<div class="wc-wrap">
			<WindowControls variant="mini" />
		</div>
	</div>

	{#if escalated}
		<div class="alert-line">
			<span class="alert-dot"></span>
			<span class="alert-text">{m.mini_spawn_soon({ names: bossNames })}</span>
			<span class="alert-count">{formatCountdownMinSec($nextBossSpawn?.remainingMs ?? 0)}</span>
		</div>
	{/if}

	<div class="spawn-hairline" style="width: {(spawnProgress * 100).toFixed(1)}%"></div>
</div>

<style>
	.mini-shell {
		--spawn-color: var(--teal);
		box-sizing: border-box;
		position: relative;
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		background: var(--overlay-paper);
		border-radius: 8px;
		box-shadow: var(--shadow-overlay);
		color: var(--ink);
		overflow: hidden;
		cursor: move;
		user-select: none;
		transition: opacity 0.4s;
	}
	.state-amber { --spawn-color: var(--amber); }
	.state-rust { --spawn-color: var(--rust); }

	/* Idle rule: fade the widget, hide the controls (spec 8d) */
	.mini-shell:global(.widget-idle) { opacity: 0.55; }
	.mini-shell:global(.widget-idle) .wc-wrap { opacity: 0; pointer-events: none; }
	.wc-wrap { transition: opacity 0.25s; flex: none; }

	.mini-row {
		flex: 1;
		min-height: 0;
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 0 8px;
	}

	/* ── Boss portrait ── */
	.boss-wrap {
		position: relative;
		width: 34px;
		height: 34px;
		flex: none;
	}
	.boss-circle {
		box-sizing: border-box;
		width: 34px;
		height: 34px;
		border-radius: 50%;
		overflow: hidden;
		background: var(--overlay-chip);
		border: 2px solid var(--spawn-color);
	}
	.boss-badge {
		position: absolute;
		bottom: -3px;
		right: -3px;
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: var(--spawn-color);
		color: #fff;
		font: 700 8px 'IBM Plex Sans', sans-serif;
		display: flex;
		align-items: center;
		justify-content: center;
		line-height: 1;
	}

	/* ── Countdown block ── */
	.count-block {
		flex: none;
		min-width: 0;
		line-height: 1.1;
	}
	.count-timer {
		font: 600 20px 'IBM Plex Mono', monospace;
		font-variant-numeric: tabular-nums;
		color: var(--spawn-color);
	}
	.state-rust .count-timer {
		animation: pulse-once 0.6s ease;
	}
	@keyframes pulse-once {
		0% { transform: scale(1); }
		40% { transform: scale(1.06); }
		100% { transform: scale(1); }
	}
	.count-names {
		/* Legibility pass: 9.5px was illegible under the 55% idle fade */
		font: 500 11px 'IBM Plex Sans', sans-serif;
		color: var(--ink-muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 110px;
	}

	.v-divider {
		width: 1px;
		height: 30px;
		background: var(--divider-strong);
		flex: none;
	}

	/* ── Session ── */
	.session-cluster {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.session-icon {
		width: 16px;
		height: 16px;
		flex: none;
		object-fit: contain;
	}
	.session-place {
		font: 500 9.5px 'IBM Plex Sans', sans-serif;
		color: var(--ink-muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.session-timer {
		font: 600 12.5px 'IBM Plex Mono', monospace;
		font-variant-numeric: tabular-nums;
		color: var(--ink);
	}

	/* ── Bare clocks — no labels (Mini B) ── */
	.clock-stack {
		flex: none;
		text-align: right;
		line-height: 1.2;
	}
	.clock-local {
		font: 600 11px 'IBM Plex Mono', monospace;
		font-variant-numeric: tabular-nums;
		color: var(--ink);
	}
	.clock-server {
		font: 500 10px 'IBM Plex Mono', monospace;
		font-variant-numeric: tabular-nums;
		color: var(--ink-faint);
	}

	/* ── 5-minute escalation line ── */
	.alert-line {
		height: 26px;
		flex: none;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 0 10px;
		background: #f7e7e0;
	}
	.alert-dot {
		width: 7px;
		height: 7px;
		flex: none;
		border-radius: 50%;
		background: var(--rust);
	}
	.alert-text {
		font: 600 11px 'IBM Plex Sans', sans-serif;
		color: var(--rust-deep);
		flex: 1;
		min-width: 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.alert-count {
		font: 600 11px 'IBM Plex Mono', monospace;
		font-variant-numeric: tabular-nums;
		color: var(--rust-deep);
	}

	/* ── Spawn hairline ── */
	.spawn-hairline {
		position: absolute;
		left: 0;
		bottom: 0;
		height: 2px;
		background: var(--spawn-color);
	}
</style>
