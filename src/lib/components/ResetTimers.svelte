<script lang="ts">
	import { formatCountdown } from "$lib/stores/boss-timer";
	import { tickStore } from "$lib/stores/boss-timer";
	import { settingsStore } from "$lib/stores/settings";
	import { RESET_TIMERS, type ResetTimerId } from "$lib/constants/reset-data";
	import { getRegionUtcOffset } from "$lib/utils/dst";

	type Region = "EU" | "NA" | "SEA" | "SA";

	const NODE_WAR_HOUR: Record<Region, number> = { NA: 18, EU: 20, SEA: 21, SA: 21 };
	const CONQUEST_HOUR: Record<Region, number> = { NA: 20, EU: 20, SEA: 21, SA: 21 };

	interface ResetCountdown {
		id: ResetTimerId;
		name: string;
		icon: string;
		description: string;
		remainingMs: number;
	}

	function getNextDaily(now: Date): Date {
		const t = new Date(now);
		t.setUTCHours(0, 0, 0, 0);
		t.setUTCDate(t.getUTCDate() + 1);
		return t;
	}

	function getNextWeekly(now: Date): Date {
		const t = new Date(now);
		t.setUTCHours(0, 0, 0, 0);
		const d = (7 - t.getUTCDay()) % 7 || 7;
		t.setUTCDate(t.getUTCDate() + d);
		return t;
	}

	function getNextWar(region: Region, now: Date, localHour: number, satOnly: boolean): Date {
		for (let i = 0; i < 8; i++) {
			const c = new Date(now);
			c.setUTCDate(c.getUTCDate() + i);
			const off = getRegionUtcOffset(region, c);
			const utcH = ((localHour - off) + 24) % 24;
			const t = new Date(c);
			t.setUTCHours(utcH, 0, 0, 0);
			if (utcH < localHour && region === "NA") t.setUTCDate(t.getUTCDate() + 1);
			if (t.getTime() <= now.getTime()) continue;
			const localDay = new Date(t.getTime() + off * 3600000).getUTCDay();
			if (satOnly ? localDay === 6 : localDay !== 6) return t;
		}
		return new Date(now.getTime() + 604800000);
	}

	function calcTimers(now: Date, region: Region): ResetCountdown[] {
		const timers: ResetCountdown[] = [
			{ id: "daily", name: RESET_TIMERS.daily.name, icon: RESET_TIMERS.daily.icon, description: RESET_TIMERS.daily.description, remainingMs: getNextDaily(now).getTime() - now.getTime() },
			{ id: "weekly", name: RESET_TIMERS.weekly.name, icon: RESET_TIMERS.weekly.icon, description: RESET_TIMERS.weekly.description, remainingMs: getNextWeekly(now).getTime() - now.getTime() },
			{ id: "nodewar", name: RESET_TIMERS.nodewar.name, icon: RESET_TIMERS.nodewar.icon, description: RESET_TIMERS.nodewar.description, remainingMs: getNextWar(region, now, NODE_WAR_HOUR[region], false).getTime() - now.getTime() },
			{ id: "conquest", name: RESET_TIMERS.conquest.name, icon: RESET_TIMERS.conquest.icon, description: RESET_TIMERS.conquest.description, remainingMs: getNextWar(region, now, CONQUEST_HOUR[region], true).getTime() - now.getTime() },
		];
		timers.sort((a, b) => a.remainingMs - b.remainingMs);
		return timers;
	}

	let hovered = $state(false);

	// Reactive: recalculate every tick
	let timers = $derived.by(() => {
		const now = new Date($tickStore);
		const region = (($settingsStore as any).server_region ?? "NA") as Region;
		return calcTimers(now, region);
	});

	let nearest = $derived(timers[0] ?? null);
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="w-full h-full"
	onmouseenter={() => hovered = true}
	onmouseleave={() => hovered = false}
>
	{#if hovered}
		<div class="h-full flex flex-col justify-center gap-0.5">
			{#each timers as timer (timer.id)}
				<div class="flex items-center gap-1">
					<span class="text-sm leading-none flex-shrink-0">{timer.icon}</span>
					<div class="flex-1 min-w-0">
						<div class="flex items-center gap-1">
							<span class="text-[9px] text-foreground font-medium truncate">{timer.name}</span>
							<span class="text-[9px] font-mono neon-text-cyan ml-auto flex-shrink-0">{formatCountdown(timer.remainingMs)}</span>
						</div>
						<p class="text-[7px] text-muted-foreground truncate">{timer.description}</p>
					</div>
				</div>
			{/each}
		</div>
	{:else}
		<div class="h-full flex flex-col justify-center">
			<p class="text-[10px] text-muted-foreground uppercase tracking-wider font-bold mb-0.5">Timers / Resets</p>
			{#if nearest}
				<div class="flex items-center gap-1">
					<span class="text-sm leading-none">{nearest.icon}</span>
					<span class="text-[10px] text-foreground/80 truncate">{nearest.name}</span>
				</div>
				<span class="text-xs font-mono neon-text-cyan">{formatCountdown(nearest.remainingMs)}</span>
			{:else}
				<span class="text-xs text-muted-foreground/50">--:--</span>
			{/if}
		</div>
	{/if}
</div>
