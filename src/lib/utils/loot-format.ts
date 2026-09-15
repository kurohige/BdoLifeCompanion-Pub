/**
 * Loot OCR presentation helpers.
 *
 * Shared by LootTrack / LootLogs / LootLedgerRow so the three can't drift —
 * the ledger's CSS and its `sourceColor` both used to exist twice, and both
 * copies had already fallen out of sync before anyone noticed.
 *
 * The colour half lives in `$lib/models/loot` (`sourceColor`) because it is
 * pure data. The label half lives here because it needs the message catalogue.
 */

import { m } from "$lib/paraglide/messages";
import type { MatchSource } from "$lib/models/loot";

/**
 * Human-readable, translated name for a catalog source.
 *
 * These strings are user-facing in four places (ledger row provenance, the
 * scan-log source column, the source filter chips, the LOGS row subtitle), so
 * they cannot be the raw `MatchSource` enum — that shipped the English enum
 * values into the Spanish build.
 */
/**
 * Rail class for a source: `loot-rail-grinding`, …, `loot-rail-unmatched`.
 *
 * The rail hue is carried by a CSS class that sets `--rail`, which the row,
 * the log row's left border and the source dot all read. That keeps the
 * palette in exactly one place — the stylesheet — instead of in a TS colour
 * function AND a stylesheet, which is the duplication that let the two ledger
 * copies drift apart in the first place.
 */
export function railClass(source: MatchSource | undefined): string {
	return `loot-rail-${source ?? "unmatched"}`;
}

export function sourceLabel(source: MatchSource | undefined): string {
	switch (source) {
		case "grinding":  return m.loot_source_grinding();
		case "recipe":    return m.loot_source_recipe();
		case "gathering": return m.loot_source_gathering();
		case "hunting":   return m.loot_source_hunting();
		case "barter":    return m.loot_source_barter();
		case "treasure":  return m.loot_source_treasure();
		default:          return m.loot_source_raw();
	}
}
