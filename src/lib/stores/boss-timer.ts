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

/** Parse a "YYYY-MM-DD" boundary as a UTC ms timestamp (start or end of that day). */
function parseUtcBoundary(date: string, endOfDay: boolean): number {
	const [y, m, d] = date.split("-").map(Number);
	return endOfDay ? Date.UTC(y, m - 1, d, 23, 59, 59, 999) : Date.UTC(y, m - 1, d);
}

/**
 * Get the next occurrence of a spawn time from a given reference time.
 * All schedule times are in UTC. Returns null when the spawn's event window
 * (validFrom/validUntil, inclusive UTC dates) has no occurrence left.
 */
function getNextSpawnDate(spawn: BossSpawn, now: Date): Date | null {
	// Before an event starts, look forward from the window start instead of now
	let ref = now;
	if (spawn.validFrom) {
		const windowStart = parseUtcBoundary(spawn.validFrom, false);
		if (now.getTime() < windowStart) ref = new Date(windowStart - 1000);
	}

	const [hours, minutes] = spawn.time.split(":").map(Number);
	const targetJsDay = scheduleToJsDay(spawn.day);
	const currentJsDay = ref.getUTCDay();

	// Calculate days until target day
	let daysUntil = targetJsDay - currentJsDay;
	if (daysUntil < 0) daysUntil += 7;

	// Create target date in UTC
	const target = new Date(ref);
	target.setUTCDate(target.getUTCDate() + daysUntil);
	target.setUTCHours(hours, minutes, 0, 0);

	// If same day but time has passed, go to next week
	if (daysUntil === 0 && target.getTime() <= ref.getTime()) {
		target.setUTCDate(target.getUTCDate() + 7);
	}

	if (spawn.validUntil && target.getTime() > parseUtcBoundary(spawn.validUntil, true)) {
		return null; // event is over — no further occurrences
	}

	return target;
}

/**
 * Get the most recent past occurrence of a spawn time from a given reference time.
 * Mirror of getNextSpawnDate — walks backward instead of forward. Returns null when
 * no occurrence falls inside the spawn's event window.
 */
function getMostRecentSpawnDate(spawn: BossSpawn, now: Date): Date | null {
	// After an event ends, look backward from the window end instead of now
	let ref = now;
	if (spawn.validUntil) {
		const windowEnd = parseUtcBoundary(spawn.validUntil, true);
		if (now.getTime() > windowEnd) ref = new Date(windowEnd);
	}

	const [hours, minutes] = spawn.time.split(":").map(Number);
	const targetJsDay = scheduleToJsDay(spawn.day);
	const currentJsDay = ref.getUTCDay();

	// Days since target day (0-6)
	let daysSince = currentJsDay - targetJsDay;
	if (daysSince < 0) daysSince += 7;

	const target = new Date(ref);
	target.setUTCDate(target.getUTCDate() - daysSince);
	target.setUTCHours(hours, minutes, 0, 0);

	// If same day but time hasn't arrived yet today, the most recent occurrence is last week
	if (daysSince === 0 && target.getTime() > ref.getTime()) {
		target.setUTCDate(target.getUTCDate() - 7);
	}

	if (spawn.validFrom && target.getTime() < parseUtcBoundary(spawn.validFrom, false)) {
		return null; // event hadn't started yet — no past occurrence
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
		if (!spawnDate) continue;
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
		if (!spawnDate) continue;
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
 * Format milliseconds as a fixed-width clock (`02:47:09`) — the Parchment
 * widgets and status strip render countdowns in tabular mono, so the string
 * must keep a constant shape.
 */
export function formatCountdownClock(ms: number): string {
	if (ms <= 0) return "NOW!";
	const totalSeconds = Math.floor(ms / 1000);
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;
	return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/** Format milliseconds as `MM:SS` — the mini bar's 5-minute escalation line. */
export function formatCountdownMinSec(ms: number): string {
	if (ms <= 0) return "00:00";
	const totalSeconds = Math.floor(ms / 1000);
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
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
