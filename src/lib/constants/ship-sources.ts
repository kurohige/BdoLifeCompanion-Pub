/**
 * How a ship material is obtained — the two-letter badge next to every material
 * row. Shared by ShipProgress (per-stage rows) and ShipMaterialTotals (rolled-up
 * rows) so the two lists cannot drift apart.
 *
 * `code` stays a short untranslated token; `title` is the translated tooltip.
 */

import type { MaterialSource } from "$lib/models/bartering";
import { m } from "$lib/paraglide/messages";

export interface SourceBadge {
	code: string;
	title: () => string;
	/** Tailwind classes for the badge chip */
	chip: string;
}

const NEUTRAL = "text-muted-foreground bg-surface-high";
const ACCENT = "text-blue-400 bg-blue-500/10";

export const SOURCE_BADGES: Record<MaterialSource, SourceBadge> = {
	barter: { code: "BT", title: () => m.bartering_ships_source_barter(), chip: ACCENT },
	crowCoin: { code: "CC", title: () => m.bartering_ships_source_crow_coin(), chip: NEUTRAL },
	craft: { code: "CR", title: () => m.bartering_ships_source_craft(), chip: ACCENT },
	buy: { code: "$", title: () => m.bartering_ships_source_buy(), chip: ACCENT },
	drop: { code: "DR", title: () => m.bartering_ships_source_drop(), chip: ACCENT },
	daily: { code: "DL", title: () => m.bartering_ships_source_daily(), chip: ACCENT },
};

export function sourceBadge(source: string): SourceBadge {
	return SOURCE_BADGES[source as MaterialSource] ?? SOURCE_BADGES.barter;
}
