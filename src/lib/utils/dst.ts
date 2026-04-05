/**
 * DST-aware timezone utilities for BDO server regions.
 *
 * NA servers follow America/Los_Angeles: PST (UTC-8) / PDT (UTC-7)
 * EU servers follow Europe/Berlin: CET (UTC+1) / CEST (UTC+2)
 */

/**
 * Check if a UTC date falls within US DST.
 * US DST: 2nd Sunday of March (2:00 AM local / 10:00 UTC) to
 *          1st Sunday of November (2:00 AM local / 9:00 UTC).
 */
export function isUsDst(date: Date): boolean {
	const year = date.getUTCFullYear();
	const month = date.getUTCMonth(); // 0-indexed

	// Jan, Feb, Dec: never DST
	if (month < 2 || month > 10) return false;
	// Apr-Oct: always DST
	if (month > 2 && month < 10) return true;

	// March: DST starts 2nd Sunday at 2:00 AM local (10:00 UTC)
	if (month === 2) {
		const firstDay = new Date(Date.UTC(year, 2, 1)).getUTCDay();
		const secondSunday = firstDay === 0 ? 8 : 15 - firstDay;
		const dstStart = Date.UTC(year, 2, secondSunday, 10, 0, 0);
		return date.getTime() >= dstStart;
	}

	// November: DST ends 1st Sunday at 2:00 AM local (9:00 UTC, since still PDT)
	if (month === 10) {
		const firstDay = new Date(Date.UTC(year, 10, 1)).getUTCDay();
		const firstSunday = firstDay === 0 ? 1 : 8 - firstDay;
		const dstEnd = Date.UTC(year, 10, firstSunday, 9, 0, 0);
		return date.getTime() < dstEnd;
	}

	return false;
}

/**
 * Check if a UTC date falls within EU DST.
 * EU DST: last Sunday of March (01:00 UTC) to
 *          last Sunday of October (01:00 UTC).
 */
export function isEuDst(date: Date): boolean {
	const year = date.getUTCFullYear();
	const month = date.getUTCMonth(); // 0-indexed

	// Jan, Feb, Nov, Dec: never DST
	if (month < 2 || month > 9) return false;
	// Apr-Sep: always DST
	if (month > 2 && month < 9) return true;

	// March: DST starts last Sunday at 1:00 UTC
	if (month === 2) {
		const lastDay = new Date(Date.UTC(year, 2, 31)).getUTCDay();
		const lastSunday = 31 - lastDay;
		const dstStart = Date.UTC(year, 2, lastSunday, 1, 0, 0);
		return date.getTime() >= dstStart;
	}

	// October: DST ends last Sunday at 1:00 UTC
	if (month === 9) {
		const lastDay = new Date(Date.UTC(year, 9, 31)).getUTCDay();
		const lastSunday = 31 - lastDay;
		const dstEnd = Date.UTC(year, 9, lastSunday, 1, 0, 0);
		return date.getTime() < dstEnd;
	}

	return false;
}

/**
 * Get UTC offset in hours for a BDO server region at a given date.
 * NA (America/Los_Angeles): -8 (PST) or -7 (PDT)
 * EU (Europe/Berlin): +1 (CET) or +2 (CEST)
 */
export function getRegionUtcOffset(region: string, date: Date): number {
	if (region === "NA") {
		return isUsDst(date) ? -7 : -8;
	}
	return isEuDst(date) ? 2 : 1;
}
