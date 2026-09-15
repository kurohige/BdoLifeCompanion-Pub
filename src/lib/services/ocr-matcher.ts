/**
 * OCR matcher — builds a unified item index from all of the app's existing data
 * sources and exposes `matchOcrName` for fuzzy lookup.
 *
 * Loaded once at startup (`buildUnifiedCatalog`), then queried synchronously from
 * the session store on every OCR event. Decoupled from individual data stores so
 * the matcher works regardless of which feature areas the user has opened.
 */

import { normalizeForMatch, type MatchSource } from "$lib/models/loot";

// ============== Types ==============

export interface CatalogEntry {
	id: string;
	name: string;
	source: MatchSource;
	/** Pre-computed `normalizeForMatch(name)` — keyed for both exact + fuzzy passes. */
	normalized: string;
	/** Optional URL-style path served from `static/` (e.g. `gathering/items/iron_ore.png`). */
	iconPath?: string;
}

export interface MatchResult {
	itemId: string;
	source: MatchSource;
	displayName: string;
	/** 0 = exact normalized match; otherwise Levenshtein edit distance. */
	distance: number;
	iconPath?: string;
	/** Which pass produced the match. Absent = exact (pre-prior legacy callers). */
	via?: "exact" | "prior" | "fragment" | "fuzzy";
	/**
	 * Distance of the second-best fuzzy candidate (fuzzy pass only). Used by
	 * the session-prior seeding rule: a distance-1 match with a runner-up at
	 * distance 1 ("harp …" between Sharp and Hard) must never seed the prior.
	 */
	runnerUpDistance?: number;
}

/**
 * A catalog item confirmed by a clean read this session. Prior entries get a
 * looser, confusion-folded comparison in `matchOcrName` because we KNOW the
 * item is dropping here — "wolfB100d" is Wolf Blood in a session that has
 * already read "Wolf Blood" exactly, even though globally it's too far from
 * anything to trust.
 */
export interface PriorEntry {
	itemId: string;
	source: MatchSource;
	displayName: string;
	/** `confusionFold(normalizeForMatch(displayName))` — precomputed. */
	folded: string;
	iconPath?: string;
}

/**
 * Source priority for tiebreaking when two entries share a normalized name.
 * Grinding wins because that's the loot-log domain we're primarily after; treasures
 * lose because their entries are usually weird "Upgraded Compass Parts (X #1)" labels
 * that aren't useful matches. Gathering slots between recipe and hunting — gatherable
 * items showing up in OCR are most likely gathering drops, but a few overlap recipe
 * ingredients ("Aloe", "Honey") which we prefer to keep tagged `recipe`.
 */
const SOURCE_PRIORITY: Record<MatchSource, number> = {
	grinding: 6,
	recipe: 5,
	gathering: 4,
	hunting: 3,
	barter: 2,
	treasure: 1,
};

// ============== Catalog loaders (per source) ==============

/** Reads one static JSON document by URL path (`/data/...`). Returns null on any failure. */
export type JsonLoader = <T>(url: string) => Promise<T | null>;

const fetchJson: JsonLoader = async <T>(url: string): Promise<T | null> => {
	try {
		const res = await fetch(url);
		if (!res.ok) return null;
		return (await res.json()) as T;
	} catch {
		return null;
	}
};

async function loadGrindingEntries(load: JsonLoader): Promise<CatalogEntry[]> {
	const data = await load<{
		items: Record<string, { id: string; name: string; image?: string | null }>;
	}>("/data/grinding/grindspots.json");
	if (!data?.items) return [];
	return Object.values(data.items).map((i) =>
		entry(i.id, i.name, "grinding", i.image ?? undefined),
	);
}

async function loadHuntingEntries(load: JsonLoader): Promise<CatalogEntry[]> {
	const data = await load<{
		items: Record<string, { id: string; name: string; image?: string | null }>;
	}>("/data/hunting/huntingspots.json");
	if (!data?.items) return [];
	return Object.values(data.items).map((i) =>
		entry(i.id, i.name, "hunting", i.image ?? undefined),
	);
}

async function loadRecipeEntries(load: JsonLoader): Promise<CatalogEntry[]> {
	const all: CatalogEntry[] = [];
	for (const cat of ["cooking", "alchemy", "draughts"]) {
		const data = await load<{
			recipes: Array<{
				id: string;
				name: string;
				image?: string | null;
				ingredients?: Array<{ itemId: string }>;
			}>;
		}>(`/data/recipes/${cat}.json`);
		if (!data?.recipes) continue;
		for (const r of data.recipes) {
			all.push(entry(r.id, r.name, "recipe", r.image ?? undefined));
			// Ingredient itemIds in this dataset are human-readable names ("Aloe", "Honey").
			// They aren't great catalog ids but they ARE useful match targets, so include them
			// using the name itself as the id (lowercased+slugged in normalize).
			for (const ing of r.ingredients ?? []) {
				if (ing?.itemId) all.push(entry(slugId(ing.itemId), ing.itemId, "recipe"));
			}
		}
	}
	return all;
}

async function loadBarterEntries(load: JsonLoader): Promise<CatalogEntry[]> {
	const data = await load<{
		items: Array<{ id: string; name: string; image?: string | null }>;
	}>("/data/bartering/barter-items.json");
	if (!data?.items) return [];
	return data.items.map((i) => entry(i.id, i.name, "barter", i.image ?? undefined));
}

async function loadTreasureEntries(load: JsonLoader): Promise<CatalogEntry[]> {
	const data = await load<{
		treasures: Array<{
			id: string;
			name: string;
			image?: string | null;
			pieces?: Array<{ id: string; name: string; image?: string | null }>;
		}>;
	}>("/data/treasures/treasures.json");
	if (!data?.treasures) return [];
	const all: CatalogEntry[] = [];
	for (const t of data.treasures) {
		all.push(entry(t.id, t.name, "treasure", t.image ?? undefined));
		for (const p of t.pieces ?? [])
			all.push(entry(p.id, p.name, "treasure", p.image ?? undefined));
	}
	return all;
}

async function loadGatheringEntries(load: JsonLoader): Promise<CatalogEntry[]> {
	const data = await load<{
		items: Record<string, { id: string; name: string; image?: string | null }>;
	}>("/data/gathering/gathering-items.json");
	if (!data?.items) return [];
	return Object.values(data.items).map((i) =>
		entry(i.id, i.name, "gathering", i.image ?? undefined),
	);
}

function entry(
	id: string,
	name: string,
	source: MatchSource,
	iconPath?: string,
): CatalogEntry {
	const e: CatalogEntry = { id, name, source, normalized: normalizeForMatch(name) };
	if (iconPath) e.iconPath = iconPath;
	return e;
}

function slugId(s: string): string {
	return normalizeForMatch(s).replace(/\s+/g, "_");
}

// ============== Build + dedupe ==============

/**
 * Fetch all six sources in parallel and dedupe by normalized name. On a normalized
 * collision the higher-priority source wins (see `SOURCE_PRIORITY`).
 * Returns an empty array if every source fails — callers should still function.
 *
 * `load` defaults to `fetch` against the app's static assets; the replay
 * harness passes a disk reader so the SAME catalog code runs under Node.
 */
export async function buildUnifiedCatalog(load: JsonLoader = fetchJson): Promise<CatalogEntry[]> {
	const results = await Promise.allSettled([
		loadGrindingEntries(load),
		loadRecipeEntries(load),
		loadGatheringEntries(load),
		loadHuntingEntries(load),
		loadBarterEntries(load),
		loadTreasureEntries(load),
	]);

	const dedup = new Map<string, CatalogEntry>();
	for (const r of results) {
		if (r.status !== "fulfilled") continue;
		for (const e of r.value) {
			if (!e.normalized) continue;
			const existing = dedup.get(e.normalized);
			if (!existing || SOURCE_PRIORITY[e.source] > SOURCE_PRIORITY[existing.source]) {
				dedup.set(e.normalized, e);
			}
		}
	}
	return Array.from(dedup.values());
}

export function buildExactIndex(catalog: CatalogEntry[]): Map<string, CatalogEntry> {
	const m = new Map<string, CatalogEntry>();
	for (const e of catalog) m.set(e.normalized, e);
	return m;
}

// ============== Levenshtein ==============

/** Standard two-row Levenshtein. Returns edit distance between `a` and `b`. */
export function levenshtein(a: string, b: string): number {
	if (a === b) return 0;
	if (!a.length) return b.length;
	if (!b.length) return a.length;
	const m = a.length;
	const n = b.length;
	const v0: number[] = new Array(n + 1);
	const v1: number[] = new Array(n + 1);
	for (let j = 0; j <= n; j++) v0[j] = j;
	for (let i = 0; i < m; i++) {
		v1[0] = i + 1;
		for (let j = 0; j < n; j++) {
			const cost = a.charCodeAt(i) === b.charCodeAt(j) ? 0 : 1;
			v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
		}
		for (let j = 0; j <= n; j++) v0[j] = v1[j];
	}
	return v0[n];
}

// ============== Confusion fold ==============

/**
 * Collapse the recurring WinRT OCR digit/letter confusions observed in the
 * 2026-08-31 live session (issue #4) and drop spaces, so systematically-
 * garbled reads land on the clean form: "wolfB100d" / "w61fb100d" both fold
 * to exactly "wolfblood". Applied to BOTH sides of the session-prior
 * comparison — never to the global catalog pass, where folding real digit-
 * bearing names would create collisions.
 */
const CONFUSION_MAP: Record<string, string> = {
	"0": "o",
	"1": "l",
	"2": "z",
	"3": "e",
	"4": "a",
	"5": "s",
	"6": "o",
	"7": "t",
	"8": "o",
	"9": "g",
};

export function confusionFold(normalized: string): string {
	let out = "";
	for (const ch of normalized) {
		if (ch === " ") continue;
		out += CONFUSION_MAP[ch] ?? ch;
	}
	return out;
}

export function toPriorEntry(m: {
	itemId: string;
	source: MatchSource;
	displayName: string;
	iconPath?: string;
}): PriorEntry {
	return {
		itemId: m.itemId,
		source: m.source,
		displayName: m.displayName,
		folded: confusionFold(normalizeForMatch(m.displayName)),
		...(m.iconPath ? { iconPath: m.iconPath } : {}),
	};
}

// ============== Session-prior match ==============

/**
 * Match a normalized read against the session's confirmed items only.
 *
 * Two passes:
 *  1. Confusion-folded Levenshtein with a looser threshold than the global
 *     pass — `min(5, ceil(len / 3))` on the folded strings. Justified because
 *     the candidate set is tiny (items already dropping in this session) and
 *     every entry in it was confirmed by a clean read.
 *  2. Fragment rule: a purely-alphabetic read of ≥ 4 chars that is a strict
 *     prefix or suffix of exactly ONE prior's folded name matches that prior
 *     ("Wolf", "lood" → Wolf Blood; "fragment" → Black Gem Fragment). Reads
 *     matching two priors are ambiguous and rejected.
 *
 * Clipped-read recovery (issue #4) falls out of pass 1: "harp black crystal
 * shard" is distance 1 from a prior "sharpblackcrystalshard" while the global
 * pass had it tied between Sharp and Hard.
 */
const PRIOR_FRAGMENT_MIN_LENGTH = 4;

/**
 * "ambiguous" means the read sits between two confirmed priors — the caller
 * must treat it as unmatched WITHOUT consulting the global fuzzy pass, which
 * would otherwise just re-guess between the same two items.
 */
export function matchAgainstPriors(
	norm: string,
	priors: Map<string, PriorEntry>,
): MatchResult | "ambiguous" | null {
	if (priors.size === 0) return null;
	const folded = confusionFold(norm);
	if (folded.length < PRIOR_FRAGMENT_MIN_LENGTH) return null;

	// Pass 1: folded fuzzy. Requires a 2-edit margin over the second-best
	// prior: when two confirmed items sit nearly equidistant from a garbled
	// read (co-dropping Wolf Blood / Worm Blood), guessing is worse than
	// leaving the read unmatched for the stability gate.
	const maxDist = Math.min(5, Math.ceil(folded.length / 3));
	let best: PriorEntry | null = null;
	let bestDist = maxDist + 1;
	let secondDist = Number.POSITIVE_INFINITY;
	for (const p of priors.values()) {
		if (Math.abs(p.folded.length - folded.length) > maxDist) continue;
		const d = levenshtein(folded, p.folded);
		if (d < bestDist) {
			if (best && best.itemId !== p.itemId) secondDist = Math.min(secondDist, bestDist);
			best = p;
			bestDist = d;
		} else if (best && best.itemId !== p.itemId) {
			secondDist = Math.min(secondDist, d);
		}
	}
	if (best && bestDist <= maxDist) {
		if (secondDist - bestDist < 2) return "ambiguous";
		return {
			itemId: best.itemId,
			source: best.source,
			displayName: best.displayName,
			distance: bestDist,
			via: "prior",
			...(best.iconPath ? { iconPath: best.iconPath } : {}),
		};
	}

	// Pass 2: unique prefix/suffix fragment, alphabetic reads only (a folded
	// digit read like "b100d"→"blood" already had its shot in pass 1).
	if (!/^[a-z]+$/.test(folded)) return null;
	let fragmentHit: PriorEntry | null = null;
	for (const p of priors.values()) {
		if (p.folded.length <= folded.length) continue;
		if (p.folded.startsWith(folded) || p.folded.endsWith(folded)) {
			if (fragmentHit && fragmentHit.itemId !== p.itemId) return "ambiguous";
			fragmentHit = p;
		}
	}
	if (!fragmentHit) return null;
	return {
		itemId: fragmentHit.itemId,
		source: fragmentHit.source,
		displayName: fragmentHit.displayName,
		distance: fragmentHit.folded.length - folded.length,
		via: "fragment",
		...(fragmentHit.iconPath ? { iconPath: fragmentHit.iconPath } : {}),
	};
}

/**
 * Seeding rule for the session-prior set. Strict on purpose: one poisoned
 * prior ("or Blood" seeding Ox Blood) would misroute every later garbled
 * read of the real item. Exact reads always qualify; a distance-1 fuzzy
 * match qualifies only when it's long enough that a 1-edit collision with a
 * different real item is implausible AND no runner-up sits within 2 edits
 * (kills the Sharp/Hard "harp …" tie).
 */
export function shouldSeedPrior(m: MatchResult, normLength: number): boolean {
	// Prior/fragment matches never seed — they'd bootstrap themselves. Checked
	// before the distance rule because a folded prior hit reports distance 0.
	if (m.via === "prior" || m.via === "fragment") return false;
	if (m.distance === 0) return true;
	return (
		m.distance === 1 &&
		normLength >= 10 &&
		(m.runnerUpDistance === undefined || m.runnerUpDistance >= m.distance + 2)
	);
}

// ============== Match ==============

/**
 * Match a raw OCR name against the unified catalog.
 *
 *   1. Normalize the input.
 *   2. Exact lookup in `exactIndex` — return immediately on hit.
 *   3. Fragment guard: too-short inputs (< 6 normalized chars) only match
 *      via exact lookup; they're rejected from the fuzzy pass. Otherwise a
 *      stray "Bark" gets fuzzy-routed onto "Old Tree Bark", "Shard" onto
 *      "Melted Iron Shard", etc., inflating those rows' counts with OCR
 *      fragments that should have stayed unmatched (see 2026-05-14 test
 *      where Melted Iron Shard read as ×28 vs actual 12).
 *   4. Fuzzy scan with Levenshtein. Threshold scales with input length:
 *      `min(4, ceil(len / 6))` — roughly 1 edit per 6 chars, capped at 4.
 *      Slightly tighter than the previous `len/5` to reduce false matches
 *      on short-ish names like "Iron Ore" vs "Tin Ore" (both 6-7 chars).
 *   5. Best-by-distance, breaking ties via `SOURCE_PRIORITY`.
 *   6. Length-similarity guard: reject if the matched entry's length differs
 *      from the input by more than (maxDist + 1). Stops "Shard" (5 chars)
 *      from matching "Melted Iron Shard" (16 chars) even when their edit
 *      distance happens to fall under the threshold.
 */

const MIN_FUZZY_LENGTH = 6;

export function matchOcrName(
	rawName: string,
	catalog: CatalogEntry[],
	exactIndex: Map<string, CatalogEntry>,
	priors?: Map<string, PriorEntry>,
): MatchResult | null {
	const norm = normalizeForMatch(rawName);
	if (!norm) return null;

	const exact = exactIndex.get(norm);
	if (exact) {
		return {
			itemId: exact.id,
			source: exact.source,
			displayName: exact.name,
			distance: 0,
			via: "exact",
			...(exact.iconPath ? { iconPath: exact.iconPath } : {}),
		};
	}

	// Session-prior pass sits BETWEEN exact and global fuzzy on purpose: a
	// clean read of a genuinely different item still exact-matches above, but
	// a garbled read reaches the items known to be dropping here before the
	// global pass can misroute it ("or Blood" is 1 edit from Ox Blood yet 3
	// folded edits from the session's Wolf Blood — the prior must win).
	if (priors) {
		const priorHit = matchAgainstPriors(norm, priors);
		if (priorHit === "ambiguous") return null;
		if (priorHit) return priorHit;
	}

	if (norm.length < MIN_FUZZY_LENGTH) {
		return null;
	}

	const maxDist = Math.min(4, Math.ceil(norm.length / 6));
	const maxLenDiff = maxDist + 1;
	let bestEntry: CatalogEntry | null = null;
	let bestDist = maxDist + 1;
	let runnerUpDist: number | undefined;
	for (const e of catalog) {
		const lenDiff = Math.abs(e.normalized.length - norm.length);
		if (lenDiff > maxLenDiff) continue;
		const d = levenshtein(norm, e.normalized);
		if (d > maxDist) continue;
		if (
			d < bestDist ||
			(d === bestDist && bestEntry && SOURCE_PRIORITY[e.source] > SOURCE_PRIORITY[bestEntry.source])
		) {
			if (bestEntry && bestEntry.id !== e.id) {
				runnerUpDist = runnerUpDist === undefined ? bestDist : Math.min(runnerUpDist, bestDist);
			}
			bestEntry = e;
			bestDist = d;
		} else if (bestEntry && bestEntry.id !== e.id) {
			runnerUpDist = runnerUpDist === undefined ? d : Math.min(runnerUpDist, d);
		}
	}
	if (!bestEntry) return null;
	return {
		itemId: bestEntry.id,
		source: bestEntry.source,
		displayName: bestEntry.name,
		distance: bestDist,
		via: "fuzzy",
		...(runnerUpDist !== undefined ? { runnerUpDistance: runnerUpDist } : {}),
		...(bestEntry.iconPath ? { iconPath: bestEntry.iconPath } : {}),
	};
}

// ============== Unmatched-row fuzzy merge ==============

/** The subset of `CapturedRow` the raw-row merge needs. */
export interface RawRowLike {
	key: string;
	rawName: string;
	normalizedRawName?: string;
	matchedItemId?: string;
}

/**
 * Find an existing unmatched row whose `rawName` is fuzzy-close to the new
 * OCR string. Returns the row's key, or `null` if no row is close enough.
 *
 * Skipped for short strings (`norm.length < 4`) — at that length the
 * exact-key path already collapses identical reads, and a 1-edit fuzzy match
 * would conflate genuinely different short names (e.g. "Sap" vs "Sup").
 *
 * Threshold scales with length: `min(3, ceil(len / 5))` — tighter than the
 * catalog matcher's `min(4, ceil(len / 5))` because a false raw merge is
 * harder to spot than a wrong catalog tag.
 */
export function findFuzzyRawKey(rows: readonly RawRowLike[], rawName: string): string | null {
	const norm = normalizeForMatch(rawName);
	if (norm.length < 4) return null;

	const maxDist = Math.min(3, Math.ceil(norm.length / 5));
	let bestKey: string | null = null;
	let bestDist = maxDist + 1;

	for (const r of rows) {
		// Catalog-matched rows aren't candidates — their key is the itemId, so
		// any fuzzy collision should already have been caught by `matchOcrName`.
		if (r.matchedItemId) continue;
		// Use the cached normalized form. Falling back to a live normalize for
		// rows persisted from before the cache field existed keeps the load
		// path correct without forcing a migration.
		const rNorm = r.normalizedRawName ?? normalizeForMatch(r.rawName);
		if (Math.abs(rNorm.length - norm.length) > maxDist) continue;
		const d = levenshtein(norm, rNorm);
		if (d < bestDist) {
			bestDist = d;
			bestKey = r.key;
			if (d === 0) break;
		}
	}
	return bestDist <= maxDist ? bestKey : null;
}
