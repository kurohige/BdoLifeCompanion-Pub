/**
 * Shared formatting utilities for dates, durations, and rates.
 */

/**
 * Format an ISO date string for display as "MM/DD/YYYY HH:MM".
 * Falls back to the raw string if parsing fails.
 */
export function formatDate(isoString: string): string {
	try {
		const date = new Date(isoString);
		return date.toLocaleDateString() + " " + date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
	} catch {
		return isoString;
	}
}

/**
 * Format a duration in seconds as "Xh Xm Xs" or "Xm Xs".
 */
export function formatDuration(seconds: number): string {
	const hrs = Math.floor(seconds / 3600);
	const mins = Math.floor((seconds % 3600) / 60);
	const secs = seconds % 60;
	if (hrs > 0) {
		return `${hrs}h ${mins}m ${secs}s`;
	}
	return `${mins}m ${secs}s`;
}

/**
 * Format elapsed milliseconds as "Xm ago" / "Xh Ym ago" / "Xd Yh ago" (>24h).
 * Used for "last spawn ago" indicators.
 */
export function formatElapsed(ms: number): string {
	if (ms <= 0) return "just now";
	const totalMinutes = Math.floor(ms / 60000);
	if (totalMinutes < 1) return "just now";
	if (totalMinutes < 60) return `${totalMinutes}m ago`;
	const hours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;
	if (hours < 24) return `${hours}h ${minutes}m ago`;
	const days = Math.floor(hours / 24);
	const remHours = hours % 24;
	return `${days}d ${remHours}h ago`;
}

/**
 * Format a yield rate as a percentage string (e.g., "125.0%").
 * Returns "0%" if crafted is zero.
 */
/** Format an ISO timestamp as short date, e.g. "Apr 15" */
export function formatDateShort(isoString: string): string {
	const d = new Date(isoString);
	return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function formatYieldRate(crafted: number, yielded: number): string {
	if (crafted === 0) return "0%";
	const rate = (yielded / crafted) * 100;
	return rate.toFixed(1) + "%";
}
