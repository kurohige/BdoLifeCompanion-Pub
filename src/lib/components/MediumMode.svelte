<script lang="ts">
	import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
	import { exit } from "@tauri-apps/plugin-process";
	import {
		setViewMode,
		settingsStore,
		selectedSpotStore,
		grindingTimerStore,
		grindingTimerDisplay,
		grindingTimerProgress,
		startGrindingTimer,
		pauseGrindingTimer,
		resumeGrindingTimer,
		nextBossSpawn,
		nextBossSpawns,
		nextBossCountdown,
		previousBossSpawn,
		previousBossElapsed,
		previousBossNames,
		getBossNames,
	} from "$lib/stores";
	import { tickStore } from "$lib/stores/boss-timer";
	import { BOSSES } from "$lib/constants/boss-data";
	import { RESET_TIMERS, type ResetTimerId } from "$lib/constants/reset-data";
	import { getRegionUtcOffset } from "$lib/utils/dst";

	const appWindow = getCurrentWindow();

	async function startDrag(e: MouseEvent) {
		if (e.button === 0 && !(e.target as HTMLElement).closest("button")) {
			await appWindow.startDragging();
		}
	}
	async function expandToFull() {
		const saved = $settingsStore.window_state;
		const w = (saved?.view_mode === "full" && saved?.width) ? saved.width : 560;
		const h = (saved?.view_mode === "full" && saved?.height) ? saved.height : 680;
		await appWindow.setMinSize(new LogicalSize(480, 500));
		await appWindow.setSize(new LogicalSize(w, h));
		setViewMode("full");
	}
	async function close() { try { await exit(0); } catch { await appWindow.close(); } }
	async function minimize() { await appWindow.minimize(); }
	async function switchToMini() {
		await appWindow.setMinSize(new LogicalSize(140, 40));
		await appWindow.setSize(new LogicalSize(400, 56));
		setViewMode("mini");
	}

	// Boss
	const primaryBoss = $derived(
		$nextBossSpawn ? (BOSSES[$nextBossSpawn.spawn.bosses[0]] ?? null) : null
	);
	const bossNames = $derived($nextBossSpawn ? getBossNames($nextBossSpawn.spawn) : "");

	// Second upcoming boss
	const nextUpcoming = $derived.by(() => {
		const spawns = $nextBossSpawns;
		if (!spawns || spawns.length < 2) return null;
		const s = spawns[1];
		const names = getBossNames(s.spawn);
		const ms = s.remainingMs;
		const h = Math.floor(ms / 3600000);
		const m = Math.floor((ms % 3600000) / 60000);
		const sec = Math.floor((ms % 60000) / 1000);
		const countdown = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
		return { names, countdown };
	});

	// Timer ring
	const CIRC = 2 * Math.PI * 20;
	const ringOffset = $derived(() => {
		if (!$grindingTimerStore.isRunning && !$grindingTimerStore.isPaused) return CIRC;
		return CIRC * (1 - $grindingTimerProgress);
	});
	function handleTimerToggle() {
		if ($grindingTimerStore.isRunning) pauseGrindingTimer();
		else if ($grindingTimerStore.isPaused) resumeGrindingTimer();
		else if ($grindingTimerStore.minutes > 0 || $grindingTimerStore.seconds > 0) startGrindingTimer();
	}

	// Reset timers
	type Region = "EU" | "NA" | "SEA" | "SA";
	const NODE_WAR_HOUR: Record<Region, number> = { NA: 18, EU: 20, SEA: 21, SA: 21 };
	function getNextDaily(now: Date): Date { const t = new Date(now); t.setUTCHours(0,0,0,0); t.setUTCDate(t.getUTCDate()+1); return t; }
	function getNextWeekly(now: Date): Date { const t = new Date(now); t.setUTCHours(0,0,0,0); const d=(7-t.getUTCDay())%7||7; t.setUTCDate(t.getUTCDate()+d); return t; }
	function getNextWar(region: Region, now: Date, lh: number, satOnly: boolean): Date {
		for(let i=0;i<8;i++){const c=new Date(now);c.setUTCDate(c.getUTCDate()+i);const off=getRegionUtcOffset(region,c);const utcH=((lh-off)+24)%24;const t=new Date(c);t.setUTCHours(utcH,0,0,0);if(utcH<lh&&region==="NA")t.setUTCDate(t.getUTCDate()+1);if(t.getTime()<=now.getTime())continue;const ld=new Date(t.getTime()+off*3600000).getUTCDay();if(satOnly?ld===6:ld!==6)return t;}
		return new Date(now.getTime()+604800000);
	}
	const resetTimers = $derived.by(() => {
		const now = new Date($tickStore);
		const r = (($settingsStore as any).server_region ?? "NA") as Region;
		return [
			{ label: "Daily", ms: getNextDaily(now).getTime()-now.getTime() },
			{ label: "Weekly", ms: getNextWeekly(now).getTime()-now.getTime() },
			{ label: "Node War", ms: getNextWar(r,now,NODE_WAR_HOUR[r],false).getTime()-now.getTime() },
		];
	});
	function fmtReset(ms: number): string {
		if(ms<=0) return "Now";
		const h=Math.floor(ms/3600000); const m=Math.floor((ms%3600000)/60000);
		if(h>=24){const d=Math.floor(h/24); return `${d}d ${h%24}h`;}
		return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}h`;
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div role="banner" onmousedown={startDrag}
	class="med-container">

	<!-- CARDS ROW: 3 Glass Cards + Controls -->
	<div class="flex-1 flex gap-1.5 p-1.5 items-stretch overflow-hidden min-h-0">

		<!-- CARD 1: GRINDING TIMER -->
		<div class="glass-panel flex-1 border-l-2 border-[#ffee10] flex flex-col items-center p-2 gap-1">
			<div class="med-title text-center w-full">TIMER</div>
			<div class="relative flex items-center justify-center">
				<svg class="w-12 h-12 -rotate-90" viewBox="0 0 48 48">
					<circle cx="24" cy="24" r="20" fill="transparent" stroke="#2a2a2a" stroke-width="2" />
					<circle cx="24" cy="24" r="20" fill="transparent" stroke="#ffee10" stroke-width="2"
						stroke-dasharray={CIRC} stroke-dashoffset={ringOffset()}
						stroke-linecap="butt" style="transition:stroke-dashoffset 1s linear" />
				</svg>
				<div class="absolute inset-0 flex items-center justify-center text-[12px] font-bold text-[#ffee10]"
					style="font-family:'Space Grotesk',monospace;font-variant-numeric:tabular-nums">
					{$grindingTimerStore.isFinished ? "DONE" : $grindingTimerDisplay}
				</div>
			</div>
			{#if $selectedSpotStore}
				<span class="text-[8px] text-[#e5e2e1] text-center truncate w-full" style="font-family:'Manrope',sans-serif">{$selectedSpotStore.name}</span>
			{/if}
			{#if $grindingTimerStore.isRunning || $grindingTimerStore.isPaused || $grindingTimerStore.minutes > 0 || $grindingTimerStore.seconds > 0}
				<button onclick={handleTimerToggle}
					class="flex items-center gap-1 px-2 py-0.5 bg-[#2a2a2a] rounded-sm text-[#e5e2e1] hover:text-[#ffee10] transition-all mt-auto">
					<span class="text-[10px]">{$grindingTimerStore.isRunning ? "⏸" : "▶"}</span>
					<span class="text-[8px] font-bold uppercase">{$grindingTimerStore.isRunning ? "Pause" : "Play"}</span>
				</button>
			{/if}
		</div>

		<!-- CARD 2: BOSS INFO -->
		<div class="glass-panel flex-[1.3] border-l-2 border-[#ffee10] flex flex-col items-center p-2 gap-1">
			<div class="med-title text-center w-full">NEXT BOSS</div>
			<div class="w-10 h-10 rounded-full border-2 border-[#ffee10] overflow-hidden bg-[#2a2a2a] shrink-0">
				{#if primaryBoss}
					<img src={primaryBoss!.image} alt={primaryBoss!.name}
						class="w-full h-full object-cover {primaryBoss!.isRare ? 'opacity-50' : ''}" />
				{:else}
					<img src="/logo.png" alt="BDO" class="w-full h-full object-contain" />
				{/if}
			</div>
			<span class="text-[10px] font-bold text-[#e5e2e1] text-center truncate w-full leading-tight" style="font-family:'Manrope',sans-serif">{bossNames || "—"}</span>
			<div class="text-[16px] font-bold text-[#ffee10] leading-none"
				style="font-family:'Space Grotesk',monospace;font-variant-numeric:tabular-nums">
				{$nextBossCountdown || "—"}
			</div>
			<!-- Next upcoming boss -->
			{#if nextUpcoming}
				<div class="flex items-center gap-1.5 mt-auto pt-1 w-full" style="border-top:1px solid rgba(77,67,82,0.2)">
					<span class="text-[8px] text-[#e5e2e1] truncate" style="font-family:'Manrope',sans-serif">{nextUpcoming!.names}</span>
					<span class="text-[8px] font-bold text-[#dac839] shrink-0" style="font-family:'Space Grotesk',monospace;font-variant-numeric:tabular-nums">{nextUpcoming!.countdown}</span>
				</div>
			{/if}
			<!-- Last spawn -->
			{#if $previousBossSpawn}
				<div class="flex items-center gap-1.5 w-full opacity-60" title="Most recent spawn">
					<span class="text-[8px] text-[#e5e2e1] truncate" style="font-family:'Manrope',sans-serif">
						{$previousBossNames}
					</span>
					<span class="text-[8px] text-[#e5e2e1]/70 shrink-0 ml-auto" style="font-family:'Space Grotesk',monospace;font-variant-numeric:tabular-nums">{$previousBossElapsed}</span>
				</div>
			{/if}
		</div>

		<!-- CARD 3: RESETS -->
		<div class="glass-panel flex-1 border-l-2 border-[#ffee10] flex flex-col p-2 gap-1.5">
			<div class="med-title text-center w-full">RESETS</div>
			<div class="flex flex-col gap-2 flex-1 justify-center">
				{#each resetTimers as timer}
					<div class="flex justify-between items-center leading-none">
						<span class="text-[9px] text-[#e5e2e1] uppercase" style="font-family:'Manrope',sans-serif">{timer.label}</span>
						<span class="text-[10px] font-bold text-[#ffee10]" style="font-family:'Space Grotesk',monospace;font-variant-numeric:tabular-nums">{fmtReset(timer.ms)}</span>
					</div>
				{/each}
			</div>
		</div>

		<!-- RIGHT CONTROL COLUMN (all 4 buttons) -->
		<div class="w-[20px] shrink-0 flex flex-col items-center justify-center gap-1.5">
			<button onclick={expandToFull} class="p-0.5 text-[#e5e2e1]/60 hover:text-[#ffee10] transition-colors" title="Full mode">
				<span class="text-[11px]">⊞</span>
			</button>
			<button onclick={switchToMini} class="p-0.5 text-[#e5e2e1]/60 hover:text-[#ffee10] transition-colors" title="Mini mode">
				<span class="text-[11px]">⊟</span>
			</button>
			<button onclick={minimize} class="p-0.5 text-[#e5e2e1]/60 hover:text-[#e5e2e1] transition-colors" title="Minimize">
				<span class="text-[11px]">━</span>
			</button>
			<button onclick={close} class="p-0.5 text-[#e5e2e1]/60 hover:text-[#ffb4ab] transition-colors" title="Close">
				<span class="text-[11px]">✕</span>
			</button>
		</div>

	</div>

</div>

<style>
	.med-container {
		width: 100%;
		height: 100%;
		position: relative;
		display: flex;
		flex-direction: column;
		background: rgba(14, 14, 14, 0.75);
		box-shadow: 0 0 12px rgba(255, 238, 16, 0.12);
		overflow: hidden;
		border-radius: 0.5rem;
		user-select: none;
		cursor: move;
	}
	.med-title {
		font-family: 'Space Grotesk', monospace;
		font-size: 10px;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.8px;
		color: #ffee10;
		text-shadow: 0 0 6px rgba(255, 238, 16, 0.4);
	}
</style>
