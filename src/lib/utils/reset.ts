/**
 * Next daily reset — 00:00 UTC. "Server time" throughout this app is UTC (see
 * `fmtServer` in utils/time.ts and the weekly reset below); this is the same
 * clock, not a second one.
 */
export function getNextDailyReset(now: Date): Date {
	const t = new Date(now);
	t.setUTCHours(0, 0, 0, 0);
	if (t <= now) t.setUTCDate(t.getUTCDate() + 1);
	return t;
}

/** Next Sunday 00:00 UTC from the given date */
export function getNextWeeklyReset(now: Date): Date {
	const t = new Date(now);
	t.setUTCHours(0, 0, 0, 0);
	const d = (7 - t.getUTCDay()) % 7 || 7;
	t.setUTCDate(t.getUTCDate() + d);
	return t;
}

/** Monday ISO date string (YYYY-MM-DD) for the current BDO week */
export function getCurrentWeekStartIso(): string {
	const now = new Date();
	const day = now.getUTCDay(); // 0=Sun
	const diffToMonday = day === 0 ? -6 : 1 - day;
	const monday = new Date(now);
	monday.setUTCDate(now.getUTCDate() + diffToMonday);
	return monday.toISOString().split("T")[0];
}
