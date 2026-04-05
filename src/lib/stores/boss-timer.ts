/**
 * Boss timer store - calculates next boss spawn and countdown
 */

import { writable, derived, get } from "svelte/store";
import {
	type BossSpawn,
	type BossId,
	type Region,
	BOSSES,
	getSchedule,
} from "$lib/constants/boss-data";
import { settingsStore } from "./settings";

export interface NextBossInfo {
	spawn: BossSpawn;
	remainingMs: number;
	spawnDate: Date;
}

/** Tick store — updates every second to drive boss and reset timer reactivity */
export const tickStore = writable<number>(Date.now());
let tickInterval: ReturnType<typeof setInterval> | null = null;

/** Start the 1-second tick interval for boss countdown updates */
export function startBossTimer(): void {
	if (tickInterval) return;
	tickInterval = setInterval(() => {
		try {
			tickStore.set(Date.now());
		} catch (err) {
			console.error("Boss timer tick error:", err);
		}
	}, 1000);
}

/** Stop the boss timer tick interval */
export function stopBossTimer(): void {
	if (tickInterval) {
		clearInterval(tickInterval);
		tickInterval = null;
	}
}

/**
 * Convert a schedule day (0=Mon..6=Sun) to JS Date day (0=Sun..6=Sat)
 */
function scheduleToJsDay(scheduleDay: number): number {
	// scheduleDay: 0=Mon,1=Tue,2=Wed,3=Thu,4=Fri,5=Sat,6=Sun
	// JS day: 0=Sun,1=Mon,2=Tue,3=Wed,4=Thu,5=Fri,6=Sat
	return scheduleDay === 6 ? 0 : scheduleDay + 1;
}

/**
 * Convert JS Date day (0=Sun..6=Sat) to schedule day (0=Mon..6=Sun)
 */
function jsDayToSchedule(jsDay: number): number {
	return jsDay === 0 ? 6 : jsDay - 1;
}

/**
 * Get the next occurrence of a spawn time from a given reference time.
 * All schedule times are in UTC.
 */
function getNextSpawnDate(spawn: BossSpawn, now: Date): Date {
	const [hours, minutes] = spawn.time.split(":").map(Number);
	const targetJsDay = scheduleToJsDay(spawn.day);
	const currentJsDay = now.getUTCDay();

	// Calculate days until target day
	let daysUntil = targetJsDay - currentJsDay;
	if (daysUntil < 0) daysUntil += 7;

	// Create target date in UTC
	const target = new Date(now);
	target.setUTCDate(target.getUTCDate() + daysUntil);
	target.setUTCHours(hours, minutes, 0, 0);

	// If same day but time has passed, go to next week
	if (daysUntil === 0 && target.getTime() <= now.getTime()) {
		target.setUTCDate(target.getUTCDate() + 7);
	}

	return target;
}

/**
 * Find the next N boss spawns from now
 */
function findNextSpawns(region: Region, now: Date, count: number): NextBossInfo[] {
	const schedule = getSchedule(region);
	const results: NextBossInfo[] = [];

	for (const spawn of schedule) {
		const spawnDate = getNextSpawnDate(spawn, now);
		const remainingMs = spawnDate.getTime() - now.getTime();
		results.push({ spawn, remainingMs, spawnDate });
	}

	// Sort by remaining time and take the closest N
	results.sort((a, b) => a.remainingMs - b.remainingMs);
	return results.slice(0, count);
}

/**
 * Format milliseconds into countdown string
 */
export function formatCountdown(ms: number): string {
	if (ms <= 0) return "NOW!";

	const totalSeconds = Math.floor(ms / 1000);
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;

	if (hours > 0) {
		return `${hours}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
	}
	return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

/**
 * Format a spawn time for display
 */
export function formatSpawnTime(spawnDate: Date): string {
	return spawnDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// Derived store: next boss spawns (updates every second via tickStore)
export const nextBossSpawns = derived(
	[tickStore, settingsStore],
	([$tick, $settings]) => {
		const region = ($settings as any).server_region ?? "NA";
		const now = new Date($tick);
		return findNextSpawns(region as Region, now, 5);
	}
);

// Convenience: just the very next spawn
export const nextBossSpawn = derived(nextBossSpawns, ($spawns) => $spawns[0] ?? null);

// Formatted countdown string for the next boss
export const nextBossCountdown = derived(nextBossSpawn, ($next) => {
	if (!$next) return "--:--";
	return formatCountdown($next.remainingMs);
});

// Boss names for the next spawn
export const nextBossNames = derived(nextBossSpawn, ($next) => {
	if (!$next) return "";
	return $next.spawn.bosses
		.map((id) => BOSSES[id]?.name ?? id)
		.join(" & ");
});
