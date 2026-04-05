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

export type Region = "EU" | "NA";

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

export function getSchedule(region: Region): BossSpawn[] {
	return region === "EU" ? EU_SCHEDULE : NA_SCHEDULE;
}
