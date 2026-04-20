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
import { formatElapsed } from "$lib/utils/format";
import { settingsStore } from "./settings";

export { formatElapsed };

/** Join a spawn's boss display names with the given separator. */
export function getBossNames(spawn: BossSpawn, separator = " & "): string {
	return spawn.bosses.map((id) => BOSSES[id]?.name ?? id).join(separator);
}

export interface NextBossInfo {
	spawn: BossSpawn;
	remainingMs: number;
	spawnDate: Date;
}

export interface PreviousBossInfo {
	spawn: BossSpawn;
	elapsedMs: number;
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
 * Get the most recent past occurrence of a spawn time from a given reference time.
 * Mirror of getNextSpawnDate — walks backward instead of forward.
 */
function getMostRecentSpawnDate(spawn: BossSpawn, now: Date): Date {
	const [hours, minutes] = spawn.time.split(":").map(Number);
	const targetJsDay = scheduleToJsDay(spawn.day);
	const currentJsDay = now.getUTCDay();

	// Days since target day (0-6)
	let daysSince = currentJsDay - targetJsDay;
	if (daysSince < 0) daysSince += 7;

	const target = new Date(now);
	target.setUTCDate(target.getUTCDate() - daysSince);
	target.setUTCHours(hours, minutes, 0, 0);

	// If same day but time hasn't arrived yet today, the most recent occurrence is last week
	if (daysSince === 0 && target.getTime() > now.getTime()) {
		target.setUTCDate(target.getUTCDate() - 7);
	}

	return target;
}

/** Remove hidden boss IDs from a spawn's boss list. Returns null if all bosses were hidden. */
function filterSpawnBosses(spawn: BossSpawn, hidden: Set<BossId>): BossSpawn | null {
	if (hidden.size === 0) return spawn;
	const filtered = spawn.bosses.filter((id) => !hidden.has(id));
	if (filtered.length === 0) return null;
	if (filtered.length === spawn.bosses.length) return spawn;
	return { ...spawn, bosses: filtered };
}

/**
 * Find the next N boss spawns from now, excluding hidden bosses.
 */
function findNextSpawns(
	region: Region,
	now: Date,
	count: number,
	hidden: Set<BossId>,
): NextBossInfo[] {
	const schedule = getSchedule(region);
	const results: NextBossInfo[] = [];

	for (const rawSpawn of schedule) {
		const spawn = filterSpawnBosses(rawSpawn, hidden);
		if (!spawn) continue;
		const spawnDate = getNextSpawnDate(spawn, now);
		const remainingMs = spawnDate.getTime() - now.getTime();
		results.push({ spawn, remainingMs, spawnDate });
	}

	// Sort by remaining time and take the closest N
	results.sort((a, b) => a.remainingMs - b.remainingMs);
	return results.slice(0, count);
}

/**
 * Find the single most recent past spawn, excluding hidden bosses.
 * Returns null if the schedule is empty or every spawn is fully hidden.
 */
function findPreviousSpawn(
	region: Region,
	now: Date,
	hidden: Set<BossId>,
): PreviousBossInfo | null {
	const schedule = getSchedule(region);
	let best: PreviousBossInfo | null = null;

	for (const rawSpawn of schedule) {
		const spawn = filterSpawnBosses(rawSpawn, hidden);
		if (!spawn) continue;
		const spawnDate = getMostRecentSpawnDate(spawn, now);
		const elapsedMs = now.getTime() - spawnDate.getTime();
		if (elapsedMs < 0) continue;
		if (!best || elapsedMs < best.elapsedMs) {
			best = { spawn, elapsedMs, spawnDate };
		}
	}

	return best;
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
		const region = ($settings.server_region ?? "NA") as Region;
		const hidden = new Set<BossId>(($settings.hidden_bosses ?? []) as BossId[]);
		const now = new Date($tick);
		return findNextSpawns(region, now, 5, hidden);
	}
);

// Convenience: just the very next spawn
export const nextBossSpawn = derived(nextBossSpawns, ($spawns) => $spawns[0] ?? null);

// Most recent past spawn (for "last spawn X ago" indicator)
export const previousBossSpawn = derived(
	[tickStore, settingsStore],
	([$tick, $settings]) => {
		const region = ($settings.server_region ?? "NA") as Region;
		const hidden = new Set<BossId>(($settings.hidden_bosses ?? []) as BossId[]);
		const now = new Date($tick);
		return findPreviousSpawn(region, now, hidden);
	}
);

// Formatted "Xh Ym ago" string for the most recent spawn
export const previousBossElapsed = derived(previousBossSpawn, ($prev) =>
	$prev ? formatElapsed($prev.elapsedMs) : "",
);

// Joined boss names for the most recent spawn (e.g. "Kzarka & Karanda")
export const previousBossNames = derived(previousBossSpawn, ($prev) =>
	$prev ? getBossNames($prev.spawn) : "",
);

// Formatted countdown string for the next boss
export const nextBossCountdown = derived(nextBossSpawn, ($next) =>
	$next ? formatCountdown($next.remainingMs) : "--:--",
);

// Joined boss names for the next spawn (e.g. "Kzarka & Karanda")
export const nextBossNames = derived(nextBossSpawn, ($next) =>
	$next ? getBossNames($next.spawn) : "",
);
