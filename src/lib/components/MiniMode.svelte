<script lang="ts">
	import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
	import { exit } from "@tauri-apps/plugin-process";
	import {
		setViewMode,
		settingsStore,
		nextBossSpawn,
		nextBossCountdown,
		getBossNames,
		selectedSpotStore,
		grindingTimerStore,
		grindingTimerDisplay,
	} from "$lib/stores";
	import { BOSSES } from "$lib/constants/boss-data";
	import { fmt24, fmt12, fmtServer, fmtServer12 } from "$lib/utils/time";

	const appWindow = getCurrentWindow();

	// Window drag handler
	async function startDrag(e: MouseEvent) {
		if (e.button === 0 && !(e.target as HTMLElement).closest("button")) {
			await appWindow.startDragging();
		}
	}

	// Expand to medium mode
	async function expandToMedium() {
		await appWindow.setMinSize(new LogicalSize(140, 40));
		await appWindow.setSize(new LogicalSize(460, 150));
		setViewMode("medium");
	}

	// Expand to full mode — restore saved size or use default
	async function expandToFull() {
		const saved = $settingsStore.window_state;
		const w = saved?.view_mode === "full" && saved?.width ? saved.width : 560;
		const h = saved?.view_mode === "full" && saved?.height ? saved.height : 680;
		await appWindow.setMinSize(new LogicalSize(480, 500));
		await appWindow.setSize(new LogicalSize(w, h));
		setViewMode("full");
	}

	// Minimize to taskbar
	async function minimize() {
		await appWindow.minimize();
	}

	// Close app
	async function close() {
		try {
			await exit(0);
		} catch {
			await appWindow.close();
		}
	}

	// Primary boss image
	const primaryBoss = $derived(
		$nextBossSpawn ? (BOSSES[$nextBossSpawn.spawn.bosses[0]] ?? null) : null
	);

	// Boss names (supports multi-boss: "Kzarka & Karanda")
	const bossNames = $derived(
		$nextBossSpawn ? getBossNames($nextBossSpawn.spawn) : "",
	);

	// Multi-boss count badge
	const extraBossCount = $derived(
		$nextBossSpawn ? Math.max(0, $nextBossSpawn.spawn.bosses.length - 1) : 0
	);

	// Whether a grinding session is active
	const hasActiveSession = $derived(
		$grindingTimerStore.isRunning || $grindingTimerStore.isPaused
	);

	// Selected spot name (truncated for mini bar)
	const spotName = $derived(
		$selectedSpotStore?.name ?? ""
	);

	// Live wall clock — only ticks while MiniMode is mounted (this view).
	let now = $state(new Date());
	$effect(() => {
		const id = setInterval(() => { now = new Date(); }, 1000);
		return () => clearInterval(id);
	});

	const showClocks = $derived($settingsStore.mini_show_clocks ?? true);
	const use24h = $derived($settingsStore.clock_format_24h ?? true);
	const localTime = $derived(use24h ? fmt24(now) : fmt12(now));
	const serverTime = $derived(use24h ? fmtServer(now) : fmtServer12(now));
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
	role="banner"
	onmousedown={startDrag}
	class="mini-bar"
>
	<!-- BOSS CLUSTER -->
	<div class="mini-cluster">
		<button
			onclick={expandToFull}
			class="mini-boss-circle"
			title="Expand to full"
		>
			{#if primaryBoss}
				<img
					src={primaryBoss!.image}
					alt={primaryBoss!.name}
					class="w-full h-full object-cover {primaryBoss!.isRare ? 'opacity-50' : ''}"
				/>
			{:else}
				<span class="text-[9px] font-extrabold text-[#ffee10] flex items-center justify-center w-full h-full">BDO</span>
			{/if}
			{#if extraBossCount > 0}
				<div class="mini-boss-badge">+{extraBossCount}</div>
			{/if}
		</button>

		<div class="mini-boss-info">
			{#if $nextBossSpawn}
				<span class="mini-label truncate max-w-[100px]">{bossNames}</span>
				<span class="mini-timer">{$nextBossCountdown}</span>
			{:else}
				<span class="mini-muted">No boss</span>
			{/if}
		</div>
	</div>

	{#if hasActiveSession && spotName}
		<!-- DIVIDER -->
		<div class="mini-divider"></div>

		<!-- ACTIVE GRINDING SESSION -->
		<div class="mini-cluster">
			<div class="mini-spot-icon">⚔</div>
			<div class="mini-boss-info">
				<span class="mini-label truncate max-w-[100px]">{spotName}</span>
				<span class="mini-timer">{$grindingTimerDisplay}</span>
			</div>
		</div>
	{/if}

	<!-- RIGHT CLUSTER (clocks + controls) -->
	<div class="mini-right">
		{#if showClocks}
			<div class="mini-divider mini-divider-clock"></div>
			<div class="mini-clock-cluster" title="Local · Server (UTC)">
				<div class="mini-clock-row">
					<span class="mini-clock-label">LOCAL</span>
					<span class="mini-clock-time">{localTime}</span>
				</div>
				<div class="mini-clock-row">
					<span class="mini-clock-label">SVR</span>
					<span class="mini-clock-time mini-clock-time-svr">{serverTime}</span>
				</div>
			</div>
		{/if}

		<!-- CONTROLS CLUSTER -->
		<div class="mini-controls">
			<button onclick={minimize} class="mini-btn" title="Minimize">
				<span class="text-[11px]">&#x2014;</span>
			</button>
			<button onclick={expandToMedium} class="mini-btn" title="Medium mode">
				<span class="text-[9px] font-bold">[+]</span>
			</button>
			<button onclick={expandToFull} class="mini-btn" title="Full mode">
				<span class="text-[11px]">&#x229E;</span>
			</button>
			<button onclick={close} class="mini-btn mini-btn-close" title="Close">
				<span class="text-[11px]">&#x2715;</span>
			</button>
		</div>
	</div>
</div>

<style>
	/* ── Main bar ── */
	.mini-bar {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 0 10px;
		background: rgba(14, 14, 14, 0.78);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		border-radius: 4px;
		box-shadow: 0 0 10px rgba(255, 238, 16, 0.12), inset 0 0 0 1px rgba(225, 182, 255, 0.08);
		cursor: move;
		user-select: none;
		overflow: hidden;
	}

	/* ── Cluster layout ── */
	.mini-cluster {
		display: flex;
		align-items: center;
		gap: 6px;
		flex-shrink: 0;
	}

	/* ── Boss circle ── */
	.mini-boss-circle {
		width: 32px;
		height: 32px;
		border-radius: 50%;
		overflow: hidden;
		border: 2px solid #ffee10;
		background: #0e0e0e;
		flex-shrink: 0;
		position: relative;
		cursor: pointer;
		transition: transform 0.15s, border-color 0.15s, box-shadow 0.15s;
	}
	.mini-boss-circle:hover {
		transform: scale(1.08);
		box-shadow: 0 0 8px rgba(255, 238, 16, 0.4);
	}

	/* ── Boss +N badge ── */
	.mini-boss-badge {
		position: absolute;
		bottom: -2px;
		right: -2px;
		background: #ffee10;
		color: #131313;
		font-size: 7px;
		font-weight: 700;
		border-radius: 50%;
		width: 14px;
		height: 14px;
		display: flex;
		align-items: center;
		justify-content: center;
		line-height: 1;
	}

	/* ── Boss info stack ── */
	.mini-boss-info {
		display: flex;
		flex-direction: column;
		min-width: 0;
		line-height: 1.2;
	}

	/* ── Labels and timers ── */
	.mini-label {
		font-family: 'Manrope', sans-serif;
		font-size: 11px;
		font-weight: 700;
		color: #e5e2e1;
	}
	.mini-timer {
		font-family: 'Space Grotesk', monospace;
		font-size: 14px;
		font-weight: 700;
		color: #ffee10;
		font-variant-numeric: tabular-nums;
		letter-spacing: 0.5px;
		text-shadow: 0 0 6px rgba(255, 238, 16, 0.3);
	}
	.mini-muted {
		font-family: 'Manrope', sans-serif;
		font-size: 10px;
		color: #b0a4b4;
	}

	/* ── Spot icon ── */
	.mini-spot-icon {
		width: 24px;
		height: 24px;
		border-radius: 4px;
		background: #201f1f;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 12px;
		flex-shrink: 0;
	}

	/* ── Divider ── */
	.mini-divider {
		width: 1px;
		height: 32px;
		background: #2a2a2a;
		flex-shrink: 0;
	}
	.mini-divider-clock {
		height: 28px;
	}

	/* ── Right cluster (clocks + controls) ── */
	.mini-right {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-left: auto;
		flex-shrink: 0;
	}

	/* ── Clock cluster ── */
	.mini-clock-cluster {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		line-height: 1.15;
		flex-shrink: 0;
	}
	.mini-clock-row {
		display: flex;
		align-items: baseline;
		gap: 6px;
	}
	.mini-clock-label {
		font-family: 'Space Grotesk', sans-serif;
		font-size: 8px;
		letter-spacing: 0.18em;
		color: #b0a4b4;
	}
	.mini-clock-time {
		font-family: 'JetBrains Mono', ui-monospace, monospace;
		font-size: 13px;
		font-weight: 700;
		color: #e5e2e1;
		letter-spacing: 0.5px;
		font-variant-numeric: tabular-nums;
	}
	.mini-clock-time-svr {
		font-size: 11px;
		font-weight: 600;
		color: #bdf4ff;
		opacity: 0.85;
	}

	/* ── Control buttons ── */
	.mini-controls {
		display: flex;
		align-items: center;
		gap: 4px;
		flex-shrink: 0;
	}
	.mini-btn {
		width: 20px;
		height: 20px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #201f1f;
		border-radius: 2px;
		color: #e5e2e1;
		cursor: pointer;
		transition: background 0.15s, box-shadow 0.15s;
		border: none;
		padding: 0;
	}
	.mini-btn:hover {
		background: #2a2a2a;
		box-shadow: 0 0 6px rgba(255, 238, 16, 0.4);
		color: #ffee10;
	}
	.mini-btn-close:hover {
		background: #93000a;
		box-shadow: 0 0 6px rgba(255, 0, 0, 0.4);
	}
</style>
