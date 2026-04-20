/**
 * Boss schedule data for BDO world bosses.
 * Times are in UTC, reflecting the DST (summer) schedule.
 * NA: PDT (UTC-7), EU: CEST (UTC+2)
 * When BDO announces seasonal time changes, update the times here directly.
 */

export type BossId =
	| "garmoth"
	| "bulgasal"
	| "sangoon"
	| "karanda"
	| "kutum"
	| "kzarka"
	| "nouver"
	| "pigking"
	| "uturi"
	| "offin"
	| "quint"
	| "muraka"
	| "blackshadow"
	| "vell";

export type Region = "EU" | "NA" | "SEA" | "SA";

export interface BossInfo {
	id: BossId;
	name: string;
	image: string;
	color: string;
	isRare: boolean;
}

export interface BossSpawn {
	time: string; // "HH:MM" in UTC
	day: number; // 0=Monday, 1=Tuesday, ..., 6=Sunday
	bosses: BossId[];
}

export const BOSSES: Record<BossId, BossInfo> = {
	garmoth: { id: "garmoth", name: "Garmoth", image: "/bosses/garmoth.png", color: "#E85D75", isRare: false },
	bulgasal: { id: "bulgasal", name: "Bulgasal", image: "/bosses/bulgasal.png", color: "#E85D75", isRare: false },
	sangoon: { id: "sangoon", name: "Sangoon", image: "/bosses/sangoon.png", color: "#00FF9D", isRare: false },
	karanda: { id: "karanda", name: "Karanda", image: "/bosses/karanda.png", color: "#5B9FFF", isRare: false },
	kutum: { id: "kutum", name: "Kutum", image: "/bosses/kutum.png", color: "#C77DFF", isRare: false },
	kzarka: { id: "kzarka", name: "Kzarka", image: "/bosses/kzarka.png", color: "#E85D75", isRare: false },
	nouver: { id: "nouver", name: "Nouver", image: "/bosses/nouver.png", color: "#FF9D3D", isRare: false },
	pigking: { id: "pigking", name: "Golden Pig King", image: "/bosses/pigking.png", color: "#FFD700", isRare: false },
	uturi: { id: "uturi", name: "Uturi", image: "/bosses/uturi.png", color: "#A0A0A0", isRare: false },
	offin: { id: "offin", name: "Offin", image: "/bosses/offin.png", color: "#A0A0A0", isRare: true },
	quint: { id: "quint", name: "Quint", image: "/bosses/quint.png", color: "#A0A0A0", isRare: true },
	muraka: { id: "muraka", name: "Muraka", image: "/bosses/muraka.png", color: "#A0A0A0", isRare: true },
	blackshadow: { id: "blackshadow", name: "Black Shadow", image: "/bosses/blackshadow.png", color: "#A0A0A0", isRare: true },
	vell: { id: "vell", name: "Vell", image: "/bosses/vell.png", color: "#00E5FF", isRare: false },
};

// Day indices: 0=Monday, 1=Tuesday, 2=Wednesday, 3=Thursday, 4=Friday, 5=Saturday, 6=Sunday

export const EU_SCHEDULE: BossSpawn[] = [
	// 21:15 UTC (23:15 CET → CEST)
	{ time: "21:15", day: 0, bosses: ["garmoth"] }, // Mon
	{ time: "21:15", day: 1, bosses: ["garmoth"] }, // Tue
	{ time: "21:15", day: 2, bosses: ["garmoth"] }, // Wed
	{ time: "21:15", day: 3, bosses: ["garmoth"] }, // Thu
	{ time: "21:15", day: 4, bosses: ["garmoth"] }, // Fri
	// Sat = no boss
	{ time: "21:15", day: 6, bosses: ["garmoth"] }, // Sun

	// 22:15 UTC (00:15 CET → prev day)
	{ time: "22:15", day: 6, bosses: ["uturi", "kutum"] }, // Sun (Mon 00:15 CET)
	{ time: "22:15", day: 0, bosses: ["sangoon", "karanda"] }, // Mon (Tue 00:15 CET)
	{ time: "22:15", day: 1, bosses: ["pigking", "kzarka"] }, // Tue (Wed 00:15 CET)
	{ time: "22:15", day: 2, bosses: ["uturi", "nouver"] }, // Wed (Thu 00:15 CET)
	{ time: "22:15", day: 3, bosses: ["pigking", "karanda"] }, // Thu (Fri 00:15 CET)
	{ time: "22:15", day: 4, bosses: ["bulgasal", "kzarka"] }, // Fri (Sat 00:15 CET)
	{ time: "22:15", day: 5, bosses: ["bulgasal", "nouver"] }, // Sat (Sun 00:15 CET)

	// 00:00 UTC (02:00 CET)
	{ time: "00:00", day: 0, bosses: ["sangoon", "karanda"] },
	// Tue = no boss
	// Wed = no boss
	{ time: "00:00", day: 3, bosses: ["pigking", "kzarka"] },
	{ time: "00:00", day: 4, bosses: ["bulgasal", "nouver"] },
	{ time: "00:00", day: 5, bosses: ["uturi", "offin"] },
	{ time: "00:00", day: 6, bosses: ["pigking", "kutum"] },

	// 10:00 UTC (12:00 CET)
	{ time: "10:00", day: 0, bosses: ["sangoon", "nouver"] },
	{ time: "10:00", day: 1, bosses: ["bulgasal", "kutum"] },
	{ time: "10:00", day: 2, bosses: ["sangoon", "karanda"] },
	// Thu = no boss
	{ time: "10:00", day: 4, bosses: ["uturi", "kutum"] },
	{ time: "10:00", day: 5, bosses: ["pigking", "nouver"] },
	{ time: "10:00", day: 6, bosses: ["uturi", "kzarka"] },

	// 12:00 UTC (14:00 CET)
	{ time: "12:00", day: 0, bosses: ["garmoth"] },
	{ time: "12:00", day: 1, bosses: ["garmoth"] },
	{ time: "12:00", day: 2, bosses: ["garmoth"] },
	{ time: "12:00", day: 3, bosses: ["garmoth"] },
	{ time: "12:00", day: 4, bosses: ["garmoth"] },
	{ time: "12:00", day: 5, bosses: ["garmoth"] },
	{ time: "12:00", day: 6, bosses: ["garmoth"] },

	// 14:00 UTC (16:00 CET)
	{ time: "14:00", day: 0, bosses: ["uturi", "kutum"] },
	{ time: "14:00", day: 1, bosses: ["pigking", "nouver"] },
	{ time: "14:00", day: 2, bosses: ["bulgasal", "offin"] },
	{ time: "14:00", day: 3, bosses: ["sangoon", "karanda"] },
	{ time: "14:00", day: 4, bosses: ["bulgasal", "kzarka"] },
	{ time: "14:00", day: 5, bosses: ["blackshadow"] },
	{ time: "14:00", day: 6, bosses: ["vell"] },

	// 17:00 UTC (19:00 CET)
	{ time: "17:00", day: 0, bosses: ["pigking", "nouver"] },
	{ time: "17:00", day: 1, bosses: ["uturi", "kzarka"] },
	{ time: "17:00", day: 2, bosses: ["vell"] },
	{ time: "17:00", day: 3, bosses: ["bulgasal", "kutum"] },
	{ time: "17:00", day: 4, bosses: ["sangoon", "offin"] },
	{ time: "17:00", day: 5, bosses: ["sangoon", "karanda"] },
	// Sun = no boss

	// 17:15 UTC (19:15 CET)
	// Mon-Sat = no boss
	{ time: "17:15", day: 6, bosses: ["garmoth"] },

	// 20:15 UTC (22:15 CET)
	{ time: "20:15", day: 0, bosses: ["bulgasal", "kzarka"] },
	{ time: "20:15", day: 1, bosses: ["quint", "muraka"] },
	{ time: "20:15", day: 2, bosses: ["uturi", "nouver"] },
	{ time: "20:15", day: 3, bosses: ["quint", "muraka"] },
	{ time: "20:15", day: 4, bosses: ["pigking", "kutum"] },
	// Sat = no boss
	{ time: "20:15", day: 6, bosses: ["sangoon", "karanda"] },
];

export const NA_SCHEDULE: BossSpawn[] = [
	// 21:00 UTC (14:00 PT)
	{ time: "21:00", day: 6, bosses: ["vell"] }, // Sun
	// Mon-Wed = no boss
	{ time: "21:00", day: 3, bosses: ["quint", "muraka"] }, // Thu
	{ time: "21:00", day: 4, bosses: ["sangoon", "kutum"] }, // Fri
	{ time: "21:00", day: 5, bosses: ["blackshadow"] }, // Sat

	// 00:00 UTC (17:00 PT → next day)
	{ time: "00:00", day: 0, bosses: ["garmoth"] }, // Mon (Sun 17:00 PT)
	{ time: "00:00", day: 1, bosses: ["sangoon", "karanda"] }, // Tue (Mon 17:00 PT)
	{ time: "00:00", day: 2, bosses: ["bulgasal", "kzarka"] }, // Wed (Tue 17:00 PT)
	{ time: "00:00", day: 3, bosses: ["vell"] }, // Thu (Wed 17:00 PT)
	{ time: "00:00", day: 4, bosses: ["uturi", "offin"] }, // Fri (Thu 17:00 PT)
	{ time: "00:00", day: 5, bosses: ["pigking", "nouver"] }, // Sat (Fri 17:00 PT)
	{ time: "00:00", day: 6, bosses: ["quint", "muraka"] }, // Sun (Sat 17:00 PT)

	// 03:15 UTC (20:15 PT → next day)
	{ time: "03:15", day: 0, bosses: ["uturi", "karanda"] }, // Mon (Sun 20:15 PT)
	{ time: "03:15", day: 1, bosses: ["pigking", "kutum"] }, // Tue (Mon 20:15 PT)
	{ time: "03:15", day: 2, bosses: ["sangoon", "nouver"] }, // Wed (Tue 20:15 PT)
	{ time: "03:15", day: 3, bosses: ["sangoon", "karanda"] }, // Thu (Wed 20:15 PT)
	{ time: "03:15", day: 4, bosses: ["bulgasal", "kutum"] }, // Fri (Thu 20:15 PT)
	{ time: "03:15", day: 5, bosses: ["uturi", "kzarka"] }, // Sat (Fri 20:15 PT)
	// Sun = no boss

	// 04:15 UTC (21:15 PT → next day)
	{ time: "04:15", day: 0, bosses: ["garmoth"] }, // Mon (Sun 21:15 PT)
	{ time: "04:15", day: 1, bosses: ["garmoth"] }, // Tue (Mon 21:15 PT)
	{ time: "04:15", day: 2, bosses: ["garmoth"] }, // Wed (Tue 21:15 PT)
	{ time: "04:15", day: 3, bosses: ["garmoth"] }, // Thu (Wed 21:15 PT)
	{ time: "04:15", day: 4, bosses: ["garmoth"] }, // Fri (Thu 21:15 PT)
	{ time: "04:15", day: 5, bosses: ["garmoth"] }, // Sat (Fri 21:15 PT)
	// Sun = no boss

	// 05:15 UTC (22:15 PT → next day)
	{ time: "05:15", day: 0, bosses: ["bulgasal", "nouver"] }, // Mon (Sun 22:15 PT)
	{ time: "05:15", day: 1, bosses: ["bulgasal", "offin"] }, // Tue (Mon 22:15 PT)
	{ time: "05:15", day: 2, bosses: ["uturi", "karanda"] }, // Wed (Tue 22:15 PT)
	{ time: "05:15", day: 3, bosses: ["uturi", "kzarka"] }, // Thu (Wed 22:15 PT)
	{ time: "05:15", day: 4, bosses: ["pigking", "nouver"] }, // Fri (Thu 22:15 PT)
	{ time: "05:15", day: 5, bosses: ["sangoon", "karanda"] }, // Sat (Fri 22:15 PT)
	{ time: "05:15", day: 6, bosses: ["pigking", "kutum"] }, // Sun (Sat 22:15 PT)

	// 07:00 UTC (00:00 PT)
	{ time: "07:00", day: 0, bosses: ["pigking", "kzarka"] },
	{ time: "07:00", day: 1, bosses: ["sangoon", "nouver"] },
	{ time: "07:00", day: 2, bosses: ["pigking", "kutum"] },
	{ time: "07:00", day: 3, bosses: ["bulgasal", "karanda"] },
	{ time: "07:00", day: 4, bosses: ["uturi", "kzarka"] },
	{ time: "07:00", day: 5, bosses: ["bulgasal", "nouver"] },
	{ time: "07:00", day: 6, bosses: ["sangoon", "offin"] },

	// 17:00 UTC (10:00 PT)
	{ time: "17:00", day: 0, bosses: ["uturi", "nouver"] },
	{ time: "17:00", day: 1, bosses: ["pigking", "kutum"] },
	{ time: "17:00", day: 2, bosses: ["bulgasal", "nouver"] },
	{ time: "17:00", day: 3, bosses: ["sangoon", "kzarka"] },
	{ time: "17:00", day: 4, bosses: ["bulgasal", "karanda"] },
	{ time: "17:00", day: 5, bosses: ["uturi", "kzarka"] },
	{ time: "17:00", day: 6, bosses: ["pigking", "kutum"] },

	// 19:00 UTC (12:00 PT)
	{ time: "19:00", day: 0, bosses: ["garmoth"] },
	{ time: "19:00", day: 1, bosses: ["garmoth"] },
	{ time: "19:00", day: 2, bosses: ["garmoth"] },
	{ time: "19:00", day: 3, bosses: ["garmoth"] },
	{ time: "19:00", day: 4, bosses: ["garmoth"] },
	{ time: "19:00", day: 5, bosses: ["garmoth"] },
	{ time: "19:00", day: 6, bosses: ["garmoth"] },
];

export const SEA_SCHEDULE: BossSpawn[] = [
	// SEA runs on GMT+8 (no DST). UTC = SEA - 8h.
	// Days: 0=Mon ... 6=Sun.

	// 00:00 SEA Thu = 16:00 UTC Wed
	{ time: "16:00", day: 2, bosses: ["vell"] }, // Wed (Thu 00:00 SEA)

	// 01:30 SEA = 17:30 UTC previous day
	{ time: "17:30", day: 6, bosses: ["karanda", "bulgasal"] }, // Sun (Mon 01:30 SEA)
	{ time: "17:30", day: 0, bosses: ["nouver", "sangoon"] }, // Mon (Tue 01:30 SEA)
	{ time: "17:30", day: 1, bosses: ["offin", "pigking"] }, // Tue (Wed 01:30 SEA)
	{ time: "17:30", day: 2, bosses: ["kutum", "uturi"] }, // Wed (Thu 01:30 SEA)
	{ time: "17:30", day: 3, bosses: ["nouver", "sangoon"] }, // Thu (Fri 01:30 SEA)
	// Sat = no boss (Sun 01:30 SEA has spawn, shown below)
	{ time: "17:30", day: 5, bosses: ["kzarka", "pigking"] }, // Sat (Sun 01:30 SEA)

	// 11:00 SEA = 03:00 UTC same day
	{ time: "03:00", day: 0, bosses: ["kzarka", "uturi"] }, // Mon
	{ time: "03:00", day: 1, bosses: ["kutum", "pigking"] }, // Tue
	{ time: "03:00", day: 2, bosses: ["nouver", "bulgasal"] }, // Wed
	{ time: "03:00", day: 3, bosses: ["kzarka", "sangoon"] }, // Thu
	{ time: "03:00", day: 4, bosses: ["kutum", "bulgasal"] }, // Fri
	{ time: "03:00", day: 5, bosses: ["karanda", "pigking"] }, // Sat
	{ time: "03:00", day: 6, bosses: ["nouver", "sangoon"] }, // Sun

	// 14:00 SEA = 06:00 UTC same day — Garmoth daily
	{ time: "06:00", day: 0, bosses: ["garmoth"] },
	{ time: "06:00", day: 1, bosses: ["garmoth"] },
	{ time: "06:00", day: 2, bosses: ["garmoth"] },
	{ time: "06:00", day: 3, bosses: ["garmoth"] },
	{ time: "06:00", day: 4, bosses: ["garmoth"] },
	{ time: "06:00", day: 5, bosses: ["garmoth"] },
	{ time: "06:00", day: 6, bosses: ["garmoth"] },

	// 15:00 SEA = 07:00 UTC same day
	{ time: "07:00", day: 0, bosses: ["kutum", "pigking"] }, // Mon
	{ time: "07:00", day: 1, bosses: ["kzarka", "sangoon"] }, // Tue
	{ time: "07:00", day: 2, bosses: ["karanda", "uturi"] }, // Wed
	{ time: "07:00", day: 3, bosses: ["nouver", "pigking"] }, // Thu
	{ time: "07:00", day: 4, bosses: ["karanda", "uturi"] }, // Fri
	{ time: "07:00", day: 5, bosses: ["kutum", "sangoon"] }, // Sat
	{ time: "07:00", day: 6, bosses: ["kutum", "bulgasal"] }, // Sun

	// 16:00 SEA Sun = 08:00 UTC Sun
	{ time: "08:00", day: 6, bosses: ["vell"] },

	// 17:00 SEA Sat = 09:00 UTC Sat
	{ time: "09:00", day: 5, bosses: ["blackshadow"] },

	// 18:00 SEA Sat = 10:00 UTC Sat — Garmoth (replaces usual 14:00 slot for Sat)
	{ time: "10:00", day: 5, bosses: ["garmoth"] },

	// 19:00 SEA = 11:00 UTC same day
	{ time: "11:00", day: 1, bosses: ["quint", "muraka"] }, // Tue
	{ time: "11:00", day: 5, bosses: ["quint", "muraka"] }, // Sat

	// 20:00 SEA = 12:00 UTC same day (Sun is 20:15 = 12:15)
	{ time: "12:00", day: 0, bosses: ["karanda", "sangoon"] }, // Mon
	{ time: "12:00", day: 1, bosses: ["kzarka", "uturi"] }, // Tue
	{ time: "12:00", day: 2, bosses: ["kutum", "bulgasal"] }, // Wed
	{ time: "12:00", day: 3, bosses: ["kzarka", "sangoon"] }, // Thu
	{ time: "12:00", day: 4, bosses: ["nouver", "pigking"] }, // Fri
	{ time: "12:00", day: 5, bosses: ["karanda", "bulgasal"] }, // Sat
	{ time: "12:15", day: 6, bosses: ["kzarka", "uturi"] }, // Sun 20:15

	// 23:15 SEA = 15:15 UTC same day — Garmoth (except Sat)
	{ time: "15:15", day: 0, bosses: ["garmoth"] }, // Mon
	{ time: "15:15", day: 1, bosses: ["garmoth"] }, // Tue
	{ time: "15:15", day: 2, bosses: ["garmoth"] }, // Wed
	{ time: "15:15", day: 3, bosses: ["garmoth"] }, // Thu
	{ time: "15:15", day: 4, bosses: ["garmoth"] }, // Fri
	// Sat = no boss
	{ time: "15:15", day: 6, bosses: ["garmoth"] }, // Sun

	// 23:30 SEA = 15:30 UTC same day
	{ time: "15:30", day: 0, bosses: ["offin", "uturi"] }, // Mon
	{ time: "15:30", day: 1, bosses: ["nouver", "bulgasal"] }, // Tue
	// Wed = no boss
	{ time: "15:30", day: 3, bosses: ["karanda", "uturi"] }, // Thu
	{ time: "15:30", day: 4, bosses: ["offin", "bulgasal"] }, // Fri
	// Sat = no boss
	{ time: "15:30", day: 6, bosses: ["nouver", "pigking"] }, // Sun
];

export const SA_SCHEDULE: BossSpawn[] = [
	// SA runs on UTC-3 (no DST since Brazil abolished DST in 2019). UTC = SA + 3h.
	// Days: 0=Mon ... 6=Sun.

	// 02:00 SA = 05:00 UTC same day
	{ time: "05:00", day: 0, bosses: ["kzarka", "bulgasal"] }, // Mon
	{ time: "05:00", day: 1, bosses: ["nouver", "uturi"] }, // Tue
	{ time: "05:00", day: 2, bosses: ["offin", "pigking"] }, // Wed
	// Thu = no boss
	{ time: "05:00", day: 4, bosses: ["karanda", "sangoon"] }, // Fri
	{ time: "05:00", day: 5, bosses: ["kutum", "bulgasal"] }, // Sat
	{ time: "05:00", day: 6, bosses: ["nouver", "sangoon"] }, // Sun

	// 11:00 SA = 14:00 UTC same day
	{ time: "14:00", day: 0, bosses: ["nouver", "sangoon"] }, // Mon
	{ time: "14:00", day: 1, bosses: ["kutum", "pigking"] }, // Tue
	{ time: "14:00", day: 2, bosses: ["nouver", "uturi"] }, // Wed
	{ time: "14:00", day: 3, bosses: ["kzarka", "sangoon"] }, // Thu
	{ time: "14:00", day: 4, bosses: ["offin", "bulgasal"] }, // Fri
	{ time: "14:00", day: 5, bosses: ["karanda", "uturi"] }, // Sat
	{ time: "14:00", day: 6, bosses: ["kutum", "bulgasal"] }, // Sun

	// 14:00 SA = 17:00 UTC same day — Garmoth daily
	{ time: "17:00", day: 0, bosses: ["garmoth"] },
	{ time: "17:00", day: 1, bosses: ["garmoth"] },
	{ time: "17:00", day: 2, bosses: ["garmoth"] },
	{ time: "17:00", day: 3, bosses: ["garmoth"] },
	{ time: "17:00", day: 4, bosses: ["garmoth"] },
	{ time: "17:00", day: 5, bosses: ["garmoth"] },
	{ time: "17:00", day: 6, bosses: ["garmoth"] },

	// 16:00 SA = 19:00 UTC same day
	{ time: "19:00", day: 0, bosses: ["kutum", "pigking"] }, // Mon
	{ time: "19:00", day: 1, bosses: ["nouver", "sangoon"] }, // Tue
	{ time: "19:00", day: 2, bosses: ["karanda", "sangoon"] }, // Wed
	{ time: "19:00", day: 3, bosses: ["nouver", "bulgasal"] }, // Thu
	{ time: "19:00", day: 4, bosses: ["kzarka", "uturi"] }, // Fri
	{ time: "19:00", day: 5, bosses: ["kzarka", "pigking"] }, // Sat
	{ time: "19:00", day: 6, bosses: ["karanda", "uturi"] }, // Sun

	// 17:00 SA = 20:00 UTC same day
	{ time: "20:00", day: 5, bosses: ["blackshadow"] }, // Sat
	{ time: "20:00", day: 6, bosses: ["vell"] }, // Sun

	// 17:30 SA Sun = 20:30 UTC Sun — Garmoth
	{ time: "20:30", day: 6, bosses: ["garmoth"] },

	// 19:00 SA = 22:00 UTC same day
	{ time: "22:00", day: 2, bosses: ["quint", "muraka"] }, // Wed
	{ time: "22:00", day: 4, bosses: ["vell"] }, // Fri
	{ time: "22:00", day: 5, bosses: ["quint", "muraka"] }, // Sat

	// 20:00 SA = 23:00 UTC same day
	{ time: "23:00", day: 0, bosses: ["karanda", "uturi"] }, // Mon
	{ time: "23:00", day: 1, bosses: ["kzarka", "bulgasal"] }, // Tue
	{ time: "23:00", day: 2, bosses: ["kutum", "pigking"] }, // Wed
	{ time: "23:00", day: 3, bosses: ["karanda", "uturi"] }, // Thu
	{ time: "23:00", day: 4, bosses: ["kutum", "pigking"] }, // Fri
	// Sat = no boss
	{ time: "23:00", day: 6, bosses: ["kzarka", "sangoon"] }, // Sun

	// 23:15 SA = 02:15 UTC next day — Garmoth (except Sat)
	{ time: "02:15", day: 1, bosses: ["garmoth"] }, // Tue UTC (Mon 23:15 SA)
	{ time: "02:15", day: 2, bosses: ["garmoth"] }, // Wed UTC (Tue 23:15 SA)
	{ time: "02:15", day: 3, bosses: ["garmoth"] }, // Thu UTC (Wed 23:15 SA)
	{ time: "02:15", day: 4, bosses: ["garmoth"] }, // Fri UTC (Thu 23:15 SA)
	{ time: "02:15", day: 5, bosses: ["garmoth"] }, // Sat UTC (Fri 23:15 SA)
	// Sat 23:15 SA = no boss
	{ time: "02:15", day: 0, bosses: ["garmoth"] }, // Mon UTC (Sun 23:15 SA)

	// 23:30 SA = 02:30 UTC next day
	{ time: "02:30", day: 1, bosses: ["offin", "bulgasal"] }, // Tue UTC (Mon 23:30 SA)
	{ time: "02:30", day: 2, bosses: ["karanda", "uturi"] }, // Wed UTC (Tue 23:30 SA)
	{ time: "02:30", day: 3, bosses: ["kzarka", "bulgasal"] }, // Thu UTC (Wed 23:30 SA)
	{ time: "02:30", day: 4, bosses: ["kutum", "pigking"] }, // Fri UTC (Thu 23:30 SA)
	{ time: "02:30", day: 5, bosses: ["nouver", "sangoon"] }, // Sat UTC (Fri 23:30 SA)
	// Sat 23:30 SA = no boss
	{ time: "02:30", day: 0, bosses: ["nouver", "pigking"] }, // Mon UTC (Sun 23:30 SA)
];

export function getSchedule(region: Region): BossSpawn[] {
	if (region === "EU") return EU_SCHEDULE;
	if (region === "SEA") return SEA_SCHEDULE;
	if (region === "SA") return SA_SCHEDULE;
	return NA_SCHEDULE;
}
