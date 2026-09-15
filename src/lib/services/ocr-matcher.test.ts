/**
 * OCR matcher — validated against the 2026-08-31 live wolf-butchering
 * session corpus (issues #3/#4). Every raw string below is a real read from
 * that session's persisted rows. Ground truth: Wolf Blood 4055, Sharp Black
 * Crystal Shard 20, Black Gem Fragment 50, Fairy's Breath 108 — and zero
 * Ox Blood / Worm Blood / Hard Black Crystal Shard.
 *
 * Project rule (docs/LOOT_OCR_ACCURACY.md): no threshold ships without
 * replay evidence. This file IS that evidence for the session-prior pass —
 * change a threshold, re-run `npm test`.
 */

import { describe, expect, it } from "vitest";

import { normalizeForMatch, type MatchSource } from "$lib/models/loot";
import {
	buildExactIndex,
	confusionFold,
	matchOcrName,
	shouldSeedPrior,
	toPriorEntry,
	type CatalogEntry,
	type PriorEntry,
} from "./ocr-matcher";

function cat(id: string, name: string, source: MatchSource): CatalogEntry {
	return { id, name, source, normalized: normalizeForMatch(name) };
}

// The items that were actually in play (or nearly matched) that session.
const CATALOG: CatalogEntry[] = [
	cat("wolf_blood", "Wolf Blood", "recipe"),
	cat("worm_blood", "Worm Blood", "grinding"),
	cat("ox_blood", "Ox Blood", "gathering"),
	cat("sharp_black_crystal_shard", "Sharp Black Crystal Shard", "gathering"),
	cat("hard_black_crystal_shard", "Hard Black Crystal Shard", "gathering"),
	cat("black_gem_fragment", "Black Gem Fragment", "recipe"),
	cat("black_gem", "Black Gem", "gathering"),
	cat("black_stone", "Black Stone", "grinding"),
	cat("fairy_powder", "Fairy Powder", "recipe"),
	cat("fairys_breath", "Fairy's Breath", "gathering"),
	cat("caphras_stone", "Caphras Stone", "grinding"),
	cat("trace_of_nature", "Trace of Nature", "grinding"),
	cat("ancient_spirit_dust", "Ancient Spirit Dust", "grinding"),
	cat("thin_essence_of_life", "Thin Essence of Life", "gathering"),
];
const EXACT = buildExactIndex(CATALOG);

function priorsOf(...ids: string[]): Map<string, PriorEntry> {
	const m = new Map<string, PriorEntry>();
	for (const id of ids) {
		const e = CATALOG.find((c) => c.id === id);
		if (!e) throw new Error(`unknown prior fixture id: ${id}`);
		m.set(id, toPriorEntry({ itemId: e.id, source: e.source, displayName: e.name }));
	}
	return m;
}

// Priors as they stood mid-session: all four real items plus Fairy Powder
// had exact reads on record.
const SESSION_PRIORS = priorsOf(
	"wolf_blood",
	"sharp_black_crystal_shard",
	"black_gem_fragment",
	"fairy_powder",
	"fairys_breath",
);

const match = (raw: string, priors = SESSION_PRIORS) =>
	matchOcrName(raw, CATALOG, EXACT, priors);

describe("confusionFold", () => {
	it("folds the observed digit confusions onto the clean form", () => {
		expect(confusionFold(normalizeForMatch("wolfB100d"))).toBe("wolfblood");
		expect(confusionFold(normalizeForMatch("Wolf Blood"))).toBe("wolfblood");
		expect(confusionFold(normalizeForMatch("W61fB100d"))).toBe("wolfblood");
	});
});

describe("session-prior routing (issue #4 corpus)", () => {
	it("routes systematically-garbled Wolf Blood variants to wolf_blood", () => {
		for (const raw of [
			"wolfB100d", // 1,671 counts stranded on this raw row live
			"OolfB100d", // 126
			"w61iB100d", // 32
			"yolfB100d",
			"PW0JfB100d", // 138
			"WoifBJ80d", // 60
			"WojfBJö0d", // 72
			"WnifB100d", // 41
			"WolfBlb0d", // 22
			"WélfBiéöd", // 260
			"Woifßlopd",
			"MolfBlooå",
		]) {
			expect(match(raw)?.itemId, raw).toBe("wolf_blood");
		}
	});

	it("routes the clipped reads that false-matched live", () => {
		// Live: "or Blood" -> ox_blood ×64, "Woy Blood" -> worm_blood ×15,
		// "harp Black Crystal Shard" -> hard_black_crystal_shard ×4.
		expect(match("or Blood")?.itemId).toBe("wolf_blood");
		expect(match("Woy Blood")?.itemId).toBe("wolf_blood");
		expect(match("harp Black Crystal Shard")?.itemId).toBe("sharp_black_crystal_shard");
	});

	it("resolves clean fragments via the unique prefix/suffix rule", () => {
		expect(match("Wolf")?.itemId).toBe("wolf_blood"); // 8,434 counts live
		expect(match("lood")?.itemId).toBe("wolf_blood");
		expect(match("Blood")?.itemId).toBe("wolf_blood");
		expect(match("fragment")?.itemId).toBe("black_gem_fragment");
		expect(match("Powder")?.itemId).toBe("fairy_powder");
	});

	it("routes garbled Fairy variants", () => {
		expect(match("airy!sBreath")?.itemId).toBe("fairys_breath"); // 75 live
		expect(match("Fairy P09d€r")?.itemId).toBe("fairy_powder"); // 206 live
		expect(match("Fairyis Breath")?.itemId).toBe("fairys_breath");
	});

	it("still lets clean reads of other items exact-match past the priors", () => {
		expect(match("Ox Blood")?.itemId).toBe("ox_blood");
		expect(match("Worm Blood")?.itemId).toBe("worm_blood");
		expect(match("Hard Black Crystal Shard")?.itemId).toBe("hard_black_crystal_shard");
		expect(match("Caphras Stone")?.itemId).toBe("caphras_stone");
	});

	it("leaves unusable garbage unmatched for the stability gate", () => {
		for (const raw of ["oycdeö", "ent", "d", "z' : ' Jos", "EWeJfB!Qbd", "o Blob4", "e_€"]) {
			expect(match(raw), raw).toBeNull();
		}
	});

	it("rejects fragments that are ambiguous across priors", () => {
		const priors = priorsOf("black_gem_fragment", "black_stone");
		// "black" prefixes both -> ambiguous -> null (would need the global pass).
		expect(matchOcrName("black", CATALOG, EXACT, priors)).toBeNull();
	});

	it("rejects near-ties between two priors instead of guessing", () => {
		const priors = priorsOf("wolf_blood", "worm_blood");
		// "wprm blood" is 1 edit from worm and close to wolf; margin rule
		// requires a 2-edit gap — worm wins it (1 vs 3).
		expect(matchOcrName("Wprm Blood", CATALOG, EXACT, priors)?.itemId).toBe("worm_blood");
		// "wo blood" sits 1-2 edits from BOTH -> ambiguous -> null.
		expect(matchOcrName("wo Blood", CATALOG, EXACT, priors)).toBeNull();
	});

	it("keeps fuzzy matching working without priors (cold start unchanged)", () => {
		expect(match("Trqceof Nature", new Map())?.itemId).toBe("trace_of_nature");
		expect(match("Ancieht SpiritDust", new Map())?.itemId).toBe("ancient_spirit_dust");
		// Documented cold-start limitation: Sharp and Hard are both distance 1,
		// so without a prior the tie lands on whichever the scan saw first —
		// exactly why this read must never seed the prior set (test below).
		expect([
			"sharp_black_crystal_shard",
			"hard_black_crystal_shard",
		]).toContain(match("harp Black Crystal Shard", new Map())?.itemId);
	});
});

describe("shouldSeedPrior (poisoning guards)", () => {
	it("seeds on exact reads", () => {
		const m = match("Wolf Blood", new Map());
		expect(m?.distance).toBe(0);
		expect(shouldSeedPrior(m!, normalizeForMatch("Wolf Blood").length)).toBe(true);
	});

	it("never seeds from the Sharp/Hard tie", () => {
		const m = match("harp Black Crystal Shard", new Map());
		expect(m?.distance).toBe(1);
		expect(shouldSeedPrior(m!, normalizeForMatch("harp Black Crystal Shard").length)).toBe(
			false,
		);
	});

	it("never seeds short distance-1 matches (the or->Ox poison path)", () => {
		const m = match("or Blood", new Map());
		expect(m?.itemId).toBe("ox_blood"); // cold-start global behavior
		expect(shouldSeedPrior(m!, normalizeForMatch("or Blood").length)).toBe(false);
	});

	it("seeds long unambiguous distance-1 reads", () => {
		const m = match("Fairyis Breath", new Map());
		expect(m?.itemId).toBe("fairys_breath");
		expect(m?.distance).toBe(1);
		expect(shouldSeedPrior(m!, normalizeForMatch("Fairyis Breath").length)).toBe(true);
	});

	it("never seeds via prior or fragment matches", () => {
		const viaPrior = match("wolfB100d");
		expect(viaPrior?.via).toBe("prior");
		expect(shouldSeedPrior(viaPrior!, 9)).toBe(false);
		const viaFragment = match("Wolf");
		expect(viaFragment?.via).toBe("fragment");
		expect(shouldSeedPrior(viaFragment!, 4)).toBe(false);
	});
});
