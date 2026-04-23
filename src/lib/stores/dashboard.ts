/**
 * Dashboard store - aggregates data from crafting, grinding, and hunting logs
 * for cross-activity analytics. Does NOT store its own data — reads from existing log stores.
 */

import { writable, get } from "svelte/store";
import { craftingLogStore, type CraftingSession } from "./crafting-log";
import {
	grindingLogStore,
	type GrindingSession,
	type GrindingLootEntry,
} from "./grinding";
import {
	huntingLogStore,
	type HuntingSession,
	type HuntingLootEntry,
} from "./hunting";

// ============== Types ==============

export type TimeRange = "today" | "7d" | "30d" | "all";
export type ActivityType = "grinding" | "hunting" | "crafting";
export type DashboardTab = "all" | ActivityType;

export interface DashboardSummary {
	totalSessions: number;
	totalDurationSeconds: number;
	totalSilver: number;
	sessionsDelta: number;
	durationDelta: number;
	silverDelta: number;
}

export interface ActivityBreakdown {
	activity: ActivityType;
	sessions: number;
	durationSeconds: number;
	silver: number;
	silverPerHour: number;
}

export interface ProfitDataPoint {
	date: string;
	silver: number;
	activity: ActivityType;
}

export interface ItemAcquisition {
	itemId: string;
	itemName: string;
	grade: string;
	totalCount: number;
	activity: ActivityType;
}

export interface UnifiedSession {
	id: string;
	timestamp: string;
	activity: ActivityType;
	locationName: string;
	durationSeconds: number;
	silver: number;
	icon: string;
}

export interface SpotBreakdown {
	name: string;
	sessions: number;
	durationSeconds: number;
	silver: number;
	silverPerHour: number;
}

// ============== State ==============

export const dashboardTimeRangeStore = writable<TimeRange>("all");
export const dashboardTabStore = writable<DashboardTab>("all");

// ============== Helpers ==============

function getTimeRangeStart(range: TimeRange): Date | null {
	if (range === "all") return null;
	const now = new Date();
	switch (range) {
		case "today": {
			const start = new Date(now);
			start.setHours(0, 0, 0, 0);
			return start;
		}
		case "7d":
			return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
		case "30d":
			return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
	}
}

function getPreviousPeriodRange(range: TimeRange): { start: Date; end: Date } | null {
	const currentStart = getTimeRangeStart(range);
	if (!currentStart) return null;
	const now = new Date();
	const periodMs = now.getTime() - currentStart.getTime();
	return {
		start: new Date(currentStart.getTime() - periodMs),
		end: currentStart,
	};
}

function isInRange(timestamp: string, rangeStart: Date | null): boolean {
	if (!rangeStart) return true;
	return new Date(timestamp).getTime() >= rangeStart.getTime();
}

function isInPeriod(timestamp: string, start: Date, end: Date): boolean {
	const t = new Date(timestamp).getTime();
	return t >= start.getTime() && t < end.getTime();
}

function grindingSessionSilver(session: GrindingSession): number {
	return session.loot.reduce((sum, l) => sum + l.count * (l.value ?? 0), 0);
}

function huntingSessionSilver(session: HuntingSession): number {
	return session.loot.reduce((sum, l) => sum + l.count * (l.value ?? 0), 0);
}

function dateKey(timestamp: string): string {
	return timestamp.slice(0, 10); // "YYYY-MM-DD"
}

// ============== Aggregation Functions ==============

export function getDashboardSummary(range: TimeRange, tab: DashboardTab): DashboardSummary {
	const rangeStart = getTimeRangeStart(range);
	const prevPeriod = getPreviousPeriodRange(range);

	let currentSessions = 0;
	let currentDuration = 0;
	let currentSilver = 0;
	let prevSessions = 0;
	let prevDuration = 0;
	let prevSilver = 0;

	// Grinding
	if (tab === "all" || tab === "grinding") {
		for (const s of get(grindingLogStore)) {
			if (isInRange(s.timestamp, rangeStart)) {
				currentSessions++;
				currentDuration += s.durationSeconds;
				currentSilver += grindingSessionSilver(s);
			}
			if (prevPeriod && isInPeriod(s.timestamp, prevPeriod.start, prevPeriod.end)) {
				prevSessions++;
				prevDuration += s.durationSeconds;
				prevSilver += grindingSessionSilver(s);
			}
		}
	}

	// Hunting
	if (tab === "all" || tab === "hunting") {
		for (const s of get(huntingLogStore)) {
			if (isInRange(s.timestamp, rangeStart)) {
				currentSessions++;
				currentDuration += s.durationSeconds;
				currentSilver += huntingSessionSilver(s);
			}
			if (prevPeriod && isInPeriod(s.timestamp, prevPeriod.start, prevPeriod.end)) {
				prevSessions++;
				prevDuration += s.durationSeconds;
				prevSilver += huntingSessionSilver(s);
			}
		}
	}

	// Crafting
	if (tab === "all" || tab === "crafting") {
		for (const s of get(craftingLogStore)) {
			if (isInRange(s.timestamp, rangeStart)) {
				currentSessions++;
				currentSilver += s.silverEarned ?? 0;
			}
			if (prevPeriod && isInPeriod(s.timestamp, prevPeriod.start, prevPeriod.end)) {
				prevSessions++;
				prevSilver += s.silverEarned ?? 0;
			}
		}
	}

	return {
		totalSessions: currentSessions,
		totalDurationSeconds: currentDuration,
		totalSilver: currentSilver,
		sessionsDelta: currentSessions - prevSessions,
		durationDelta: currentDuration - prevDuration,
		silverDelta: currentSilver - prevSilver,
	};
}

export function getActivityBreakdown(range: TimeRange): ActivityBreakdown[] {
	const rangeStart = getTimeRangeStart(range);
	const results: Record<ActivityType, { sessions: number; duration: number; silver: number }> = {
		grinding: { sessions: 0, duration: 0, silver: 0 },
		hunting: { sessions: 0, duration: 0, silver: 0 },
		crafting: { sessions: 0, duration: 0, silver: 0 },
	};

	for (const s of get(grindingLogStore)) {
		if (isInRange(s.timestamp, rangeStart)) {
			results.grinding.sessions++;
			results.grinding.duration += s.durationSeconds;
			results.grinding.silver += grindingSessionSilver(s);
		}
	}

	for (const s of get(huntingLogStore)) {
		if (isInRange(s.timestamp, rangeStart)) {
			results.hunting.sessions++;
			results.hunting.duration += s.durationSeconds;
			results.hunting.silver += huntingSessionSilver(s);
		}
	}

	for (const s of get(craftingLogStore)) {
		if (isInRange(s.timestamp, rangeStart)) {
			results.crafting.sessions++;
			results.crafting.silver += s.silverEarned ?? 0;
		}
	}

	return (["grinding", "hunting", "crafting"] as ActivityType[]).map((activity) => {
		const r = results[activity];
		const hours = r.duration / 3600;
		return {
			activity,
			sessions: r.sessions,
			durationSeconds: r.duration,
			silver: r.silver,
			silverPerHour: hours > 0 ? Math.round(r.silver / hours) : 0,
		};
	});
}

export function getProfitOverTime(range: TimeRange, tab: DashboardTab): ProfitDataPoint[] {
	const rangeStart = getTimeRangeStart(range);
	const points: ProfitDataPoint[] = [];

	if (tab === "all" || tab === "grinding") {
		for (const s of get(grindingLogStore)) {
			if (isInRange(s.timestamp, rangeStart)) {
				points.push({ date: dateKey(s.timestamp), silver: grindingSessionSilver(s), activity: "grinding" });
			}
		}
	}

	if (tab === "all" || tab === "hunting") {
		for (const s of get(huntingLogStore)) {
			if (isInRange(s.timestamp, rangeStart)) {
				points.push({ date: dateKey(s.timestamp), silver: huntingSessionSilver(s), activity: "hunting" });
			}
		}
	}

	if (tab === "all" || tab === "crafting") {
		for (const s of get(craftingLogStore)) {
			if (isInRange(s.timestamp, rangeStart) && (s.silverEarned ?? 0) > 0) {
				points.push({ date: dateKey(s.timestamp), silver: s.silverEarned!, activity: "crafting" });
			}
		}
	}

	// Sort by date
	points.sort((a, b) => a.date.localeCompare(b.date));
	return points;
}

export function getTopItems(range: TimeRange, tab: DashboardTab, limit = 8): ItemAcquisition[] {
	const rangeStart = getTimeRangeStart(range);
	const itemMap = new Map<string, ItemAcquisition>();

	function addLoot(loot: (GrindingLootEntry | HuntingLootEntry)[], activity: ActivityType) {
		for (const entry of loot) {
			const key = `${activity}:${entry.itemId}`;
			const existing = itemMap.get(key);
			if (existing) {
				existing.totalCount += entry.count;
			} else {
				itemMap.set(key, {
					itemId: entry.itemId,
					itemName: entry.itemName,
					grade: "common", // Will be overridden if we add grade to loot entries
					totalCount: entry.count,
					activity,
				});
			}
		}
	}

	if (tab === "all" || tab === "grinding") {
		for (const s of get(grindingLogStore)) {
			if (isInRange(s.timestamp, rangeStart)) {
				addLoot(s.loot, "grinding");
			}
		}
	}

	if (tab === "all" || tab === "hunting") {
		for (const s of get(huntingLogStore)) {
			if (isInRange(s.timestamp, rangeStart)) {
				addLoot(s.loot, "hunting");
			}
		}
	}

	const items = Array.from(itemMap.values());
	items.sort((a, b) => b.totalCount - a.totalCount);
	return items.slice(0, limit);
}

export function getRecentSessions(tab: DashboardTab, limit = 5): UnifiedSession[] {
	const sessions: UnifiedSession[] = [];

	if (tab === "all" || tab === "grinding") {
		for (const s of get(grindingLogStore)) {
			sessions.push({
				id: s.id,
				timestamp: s.timestamp,
				activity: "grinding",
				locationName: s.spotName,
				durationSeconds: s.durationSeconds,
				silver: grindingSessionSilver(s),
				icon: "⚔️",
			});
		}
	}

	if (tab === "all" || tab === "hunting") {
		for (const s of get(huntingLogStore)) {
			sessions.push({
				id: s.id,
				timestamp: s.timestamp,
				activity: "hunting",
				locationName: s.spotName,
				durationSeconds: s.durationSeconds,
				silver: huntingSessionSilver(s),
				icon: "🏹",
			});
		}
	}

	if (tab === "all" || tab === "crafting") {
		for (const s of get(craftingLogStore)) {
			sessions.push({
				id: s.id,
				timestamp: s.timestamp,
				activity: "crafting",
				locationName: s.recipeName,
				durationSeconds: 0,
				silver: s.silverEarned ?? 0,
				icon: "🍳",
			});
		}
	}

	// Sort by timestamp descending (most recent first)
	sessions.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
	return sessions.slice(0, limit);
}

export function getSpotBreakdown(range: TimeRange, activity: ActivityType, limit = 6): SpotBreakdown[] {
	const rangeStart = getTimeRangeStart(range);
	const spotMap = new Map<string, SpotBreakdown>();

	function addSession(name: string, duration: number, silver: number) {
		const existing = spotMap.get(name);
		if (existing) {
			existing.sessions++;
			existing.durationSeconds += duration;
			existing.silver += silver;
		} else {
			spotMap.set(name, { name, sessions: 1, durationSeconds: duration, silver, silverPerHour: 0 });
		}
	}

	if (activity === "grinding") {
		for (const s of get(grindingLogStore)) {
			if (isInRange(s.timestamp, rangeStart)) {
				addSession(s.spotName, s.durationSeconds, grindingSessionSilver(s));
			}
		}
	} else if (activity === "hunting") {
		for (const s of get(huntingLogStore)) {
			if (isInRange(s.timestamp, rangeStart)) {
				addSession(s.spotName, s.durationSeconds, huntingSessionSilver(s));
			}
		}
	} else if (activity === "crafting") {
		for (const s of get(craftingLogStore)) {
			if (isInRange(s.timestamp, rangeStart)) {
				addSession(s.recipeName, 0, s.silverEarned ?? 0);
			}
		}
	}

	const spots = Array.from(spotMap.values());
	for (const spot of spots) {
		const hours = spot.durationSeconds / 3600;
		spot.silverPerHour = hours > 0 ? Math.round(spot.silver / hours) : 0;
	}

	spots.sort((a, b) => b.silver - a.silver);
	return spots.slice(0, limit);
}

/**
 * Get cumulative silver data for chart rendering.
 * Returns daily cumulative totals per activity (or single activity).
 */
export function getCumulativeSilver(
	range: TimeRange,
	tab: DashboardTab,
): Record<ActivityType, { date: string; cumulative: number }[]> {
	const profitPoints = getProfitOverTime(range, tab);

	// Group by activity and date, summing silver
	const dailyByActivity: Record<ActivityType, Map<string, number>> = {
		grinding: new Map(),
		hunting: new Map(),
		crafting: new Map(),
	};

	for (const p of profitPoints) {
		const map = dailyByActivity[p.activity];
		map.set(p.date, (map.get(p.date) ?? 0) + p.silver);
	}

	// Convert to cumulative arrays
	const result: Record<ActivityType, { date: string; cumulative: number }[]> = {
		grinding: [],
		hunting: [],
		crafting: [],
	};

	for (const activity of ["grinding", "hunting", "crafting"] as ActivityType[]) {
		const map = dailyByActivity[activity];
		const dates = Array.from(map.keys()).sort();
		let cumulative = 0;
		for (const date of dates) {
			cumulative += map.get(date)!;
			result[activity].push({ date, cumulative });
		}
	}

	return result;
}
