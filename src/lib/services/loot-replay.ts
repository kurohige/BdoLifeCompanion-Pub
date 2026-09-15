/**
 * Loot OCR — replay harness over the scanner's diagnostic log.
 *
 * Runs the REAL frontend counting path (`matchOcrName` + session priors +
 * `LootDedupPipeline` + `StabilityGate`) over the `new_line` emissions in a
 * `diagnostic.log`, per scanner segment, and reports per-item totals with a
 * per-layer accounting. This is the evidence every threshold in
 * `DEFAULT_DEDUP_CONFIG` must be validated against before it ships.
 *
 * Log facts that shape the parser (see feedback memory, lesson 14):
 *   - lines carry `[HH:MM:SS.mmm UTC]` but no date, and one file spans days →
 *     segment on `[SCANNER] start:` and never on time-of-day;
 *   - `new_line sig="…" qty=N y=Y scroll=S` is the emission (post-vote qty);
 *     the `vote_emit` line that follows it (same sig + qty) carries the votes,
 *     sighting count and reason, and is absent for single-sighting emits;
 *   - `sig` is the scanner's whitespace-stripped signature, NOT the
 *     `raw_name` the live event carried. `reconstructRawName` restores the
 *     catalog spelling for reads whose spaceless form matches a catalog
 *     entry exactly; garbled reads stay spaceless, which costs the global
 *     fuzzy pass one edit per missing space (the session-prior pass folds
 *     spaces away, so the reads that matter route the same as live).
 *
 * Node-only helpers (`readFileSync`) live in the test file; this module is
 * importable from the app bundle without pulling Node built-ins.
 */

import { normalizeForMatch, unmatchedKey } from "$lib/models/loot";
import {
	buildExactIndex,
	findFuzzyRawKey,
	matchOcrName,
	shouldSeedPrior,
	toPriorEntry,
	type CatalogEntry,
	type PriorEntry,
	type RawRowLike,
} from "./ocr-matcher";
import { LootDedupPipeline, type DedupConfig, type DedupVerdict } from "./loot-dedup";
import { StabilityGate } from "./loot-stability";

// ============== Corpus parsing ==============

export interface ReplayEvent {
	/** ms since midnight UTC of the log's (unknown) day — only deltas matter. */
	ts: number;
	sig: string;
	qty: number;
	y: number;
	scroll: number;
	/** Sightings before emission (1 = emitted on a single read). */
	seen: number;
	/** `consensus` / `vanished` / `static-confirm` / `focus-flush`, or `single`. */
	reason: string;
	votes: number[];
}

/** One raw WinRT OCR line as the scanner saw it (logs from 2026-09-02 on). */
export interface RawOcrLine {
	y: number;
	/** Whether the scanner's parser turned it into a loot line. */
	parsed: boolean;
	text: string;
}

export interface RawOcrPass {
	ts: number;
	/** Total OCR lines in the pass (the trail may be truncated by the log budget). */
	n: number;
	parsed: number;
	lines: RawOcrLine[];
}

export interface ReplaySegment {
	/** `HH:MM:SS.mmm` of the `start:` line — the label the TODO tables use. */
	label: string;
	startTs: number;
	/** Scan generation from the `start:` line; 0 for logs older than 2026-09-02. */
	generation: number;
	events: ReplayEvent[];
	/** Raw OCR trail per pass (`ocr_lines`), empty for older logs. */
	rawPasses: RawOcrPass[];
	/** Pixel-identical tick runs (`static_run`), empty for older logs. */
	staticRuns: Array<{ ts: number; ticks: number; pending: number }>;
}

const TS_RE = /^\[(\d{2}):(\d{2}):(\d{2})\.(\d{3}) UTC\]/;
const START_RE = /\[SCANNER\] start:(?: gen=(\d+))?/;
const NEW_LINE_RE = /\[SCANNER\] new_line sig="([^"]*)" qty=(\d+) y=([\d.-]+) scroll=([\d.-]+)/;
const VOTE_RE = /\[SCANNER\] vote_emit sig="([^"]*)" votes=\[([^\]]*)\] qty=(\d+) seen=(\d+) reason=([a-z-]+)/;
const OCR_LINES_RE = /\[SCANNER\] ocr_lines n=(\d+) parsed=(\d+)(.*)$/;
const OCR_LINE_ITEM_RE = /\| ([\d.-]+) (ok|rej) "((?:[^"\\]|\\.)*)"/g;
const STATIC_RUN_RE = /\[SCANNER\] static_run ticks=(\d+) pending=(\d+)/;

/** Undo Rust's `{:?}` string escaping (only the escapes it emits for text). */
function unescapeDebug(s: string): string {
	return s.replace(/\\(u\{([0-9a-fA-F]+)\}|.)/g, (_m, body: string, hex?: string) => {
		if (hex) return String.fromCodePoint(parseInt(hex, 16));
		switch (body) {
			case "n":
				return "\n";
			case "t":
				return "\t";
			case "r":
				return "\r";
			default:
				return body; // \" \\ \'
		}
	});
}

function tsOf(line: string): number | null {
	const m = TS_RE.exec(line);
	if (!m) return null;
	return (Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])) * 1000 + Number(m[4]);
}

/** Split a diagnostic log into scanner segments, each with its emissions in order. */
export function parseDiagnosticLog(text: string): ReplaySegment[] {
	const segments: ReplaySegment[] = [];
	let cur: ReplaySegment | null = null;
	for (const line of text.split("\n")) {
		const start = START_RE.exec(line);
		if (start) {
			const ts = tsOf(line);
			cur = {
				label: line.slice(1, 13),
				startTs: ts ?? 0,
				generation: start[1] ? Number(start[1]) : 0,
				events: [],
				rawPasses: [],
				staticRuns: [],
			};
			segments.push(cur);
			continue;
		}
		if (!cur) continue;
		const ocr = OCR_LINES_RE.exec(line);
		if (ocr) {
			const ts = tsOf(line);
			if (ts === null) continue;
			const items: RawOcrLine[] = [];
			for (const m of ocr[3].matchAll(OCR_LINE_ITEM_RE)) {
				items.push({ y: Number(m[1]), parsed: m[2] === "ok", text: unescapeDebug(m[3]) });
			}
			cur.rawPasses.push({ ts, n: Number(ocr[1]), parsed: Number(ocr[2]), lines: items });
			continue;
		}
		const sr = STATIC_RUN_RE.exec(line);
		if (sr) {
			const ts = tsOf(line);
			if (ts !== null) cur.staticRuns.push({ ts, ticks: Number(sr[1]), pending: Number(sr[2]) });
			continue;
		}
		const nl = NEW_LINE_RE.exec(line);
		if (nl) {
			const ts = tsOf(line);
			if (ts === null) continue;
			const qty = Number(nl[2]);
			cur.events.push({
				ts,
				sig: nl[1],
				qty,
				y: Number(nl[3]),
				scroll: Number(nl[4]),
				seen: 1,
				reason: "single",
				votes: [qty],
			});
			continue;
		}
		const v = VOTE_RE.exec(line);
		if (v) {
			const last = cur.events[cur.events.length - 1];
			if (last && last.sig === v[1] && last.qty === Number(v[3])) {
				last.seen = Number(v[4]);
				last.reason = v[5];
				last.votes = v[2]
					.split(",")
					.map((s) => Number(s.trim()))
					.filter((n) => Number.isFinite(n));
			}
		}
	}
	return segments;
}

// ============== Raw-name reconstruction ==============

/** `normalizeForMatch(name)` with spaces removed → entry, for restoring spelling from a sig. */
export function buildSpacelessIndex(catalog: readonly CatalogEntry[]): Map<string, CatalogEntry> {
	const m = new Map<string, CatalogEntry>();
	for (const e of catalog) m.set(e.normalized.replace(/\s+/g, ""), e);
	return m;
}

export function reconstructRawName(sig: string, spaceless: Map<string, CatalogEntry>): string {
	const hit = spaceless.get(normalizeForMatch(sig).replace(/\s+/g, ""));
	return hit ? hit.name : sig;
}

// ============== Replay ==============

export interface ReplayItemStats {
	displayName: string;
	/** Sum of every emitted qty that resolved to this key, before any layer. */
	raw: number;
	reads: number;
	/** What the pipeline would have put on the row. */
	counted: number;
	countedReads: number;
	/** Qty removed by each layer. */
	dedup: number;
	outlier: number;
	cluster: number;
	gated: number;
	via: Record<string, number>;
}

export interface ReplayResult {
	items: Map<string, ReplayItemStats>;
	/** Per-event verdict trail, for drilling into one item. */
	trail: Array<{ ev: ReplayEvent; key: string; verdict: DedupVerdict | "gated" }>;
}

interface ReplayRow extends RawRowLike {
	count: number;
}

/**
 * Replay one segment. Mirrors `applyOcrEvent` in `loot-session.ts` step for
 * step — keep the two in sync when the live flow changes.
 */
export function replaySegment(
	segment: ReplaySegment,
	catalog: readonly CatalogEntry[],
	hints: ReadonlyMap<string, number>,
	config: DedupConfig,
): ReplayResult {
	const exactIndex = buildExactIndex([...catalog]);
	const spaceless = buildSpacelessIndex(catalog);
	const priors = new Map<string, PriorEntry>();
	const pipeline = new LootDedupPipeline(config, (k) => hints.get(k));
	const gate = new StabilityGate();
	const rows = new Map<string, ReplayRow>();
	const items = new Map<string, ReplayItemStats>();
	const trail: ReplayResult["trail"] = [];

	const statsFor = (key: string, displayName: string): ReplayItemStats => {
		let s = items.get(key);
		if (!s) {
			s = {
				displayName,
				raw: 0,
				reads: 0,
				counted: 0,
				countedReads: 0,
				dedup: 0,
				outlier: 0,
				cluster: 0,
				gated: 0,
				via: {},
			};
			items.set(key, s);
		}
		return s;
	};

	for (const ev of segment.events) {
		const rawName = reconstructRawName(ev.sig, spaceless);
		const match = matchOcrName(rawName, [...catalog], exactIndex, priors);
		if (match && !priors.has(match.itemId)) {
			if (shouldSeedPrior(match, normalizeForMatch(rawName).length)) {
				priors.set(match.itemId, toPriorEntry(match));
			}
		}

		let key: string;
		if (match) {
			key = match.itemId;
		} else {
			const exactKey = unmatchedKey(rawName);
			key = rows.has(exactKey)
				? exactKey
				: (findFuzzyRawKey([...rows.values()], rawName) ?? exactKey);
		}

		const stats = statsFor(key, match ? match.displayName : rawName);
		stats.raw += ev.qty;
		stats.reads++;
		const via = match ? (match.via ?? "exact") : "none";
		stats.via[via] = (stats.via[via] ?? 0) + 1;

		const result = pipeline.evaluate(key, ev.qty, ev.y, ev.ts);
		let verdict: DedupVerdict | "gated" = result.verdict;
		let drop = ev.qty;

		if (verdict === "applied" && !match && !rows.has(key)) {
			const credit = gate.offer(normalizeForMatch(rawName), drop, ev.ts);
			if (credit === null) verdict = "gated";
			else drop = credit.credit;
		}

		switch (verdict) {
			case "dedup":
				stats.dedup += ev.qty;
				break;
			case "outlier":
				stats.outlier += ev.qty;
				break;
			case "cluster":
				stats.cluster += ev.qty;
				break;
			case "gated":
				stats.gated += ev.qty;
				break;
			case "applied": {
				stats.counted += drop;
				stats.countedReads++;
				const row = rows.get(key);
				if (row) row.count += drop;
				else {
					rows.set(key, {
						key,
						rawName,
						normalizedRawName: normalizeForMatch(rawName),
						...(match ? { matchedItemId: match.itemId } : {}),
						count: drop,
					});
				}
				break;
			}
		}
		trail.push({ ev, key, verdict });
	}

	return { items, trail };
}

/** `(counted − actual) / actual`, as a signed percentage. */
export function driftPct(counted: number, actual: number): number {
	return ((counted - actual) / actual) * 100;
}
