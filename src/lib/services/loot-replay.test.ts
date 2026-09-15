/**
 * Loot OCR — corpus replay against ground truth (the standing rule: no
 * threshold ships without replay evidence).
 *
 * Corpus: `dist/diagnostic-mining-2026-09-01.log` — two consecutive ore-
 * grinding sessions with user-reported inventory deltas. `dist/` is
 * gitignored, so the file exists only on the machine that captured it; the
 * suite skips cleanly elsewhere. Override the path with `LOOT_REPLAY_LOG`.
 *
 * What the corpus can and cannot tell (docs/LOOT_OCR_TODO.md § "MV.2 replay
 * findings", 2026-09-02):
 *   - S2 (12:05:48) ran ONE scanner thread and is the calibration session.
 *   - S3 (12:27:22) ran TWO scanner threads for its whole length (the
 *     `start_scan` race fixed 2026-09-02), so every line was emitted twice;
 *     it is a duplicate-robustness check, not a calibration target.
 *   - Both sessions' remaining error is upstream of this pipeline (the
 *     strict parser kept ~1 in 5 OCR lines; trailing junk digits inflate
 *     quantities), which the log did not record. The ±10 % target waits for
 *     the next corpus, whose log carries raw OCR lines.
 *
 * Run with a table:   npx vitest run loot-replay
 * Parameter sweep:    LOOT_REPLAY_SWEEP=1 npx vitest run loot-replay
 * Verdict trail dump: LOOT_REPLAY_DUMP=<file.jsonl> npx vitest run loot-replay
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

import {
	DEFAULT_DEDUP_CONFIG,
	LEGACY_BUCKET_CONFIG,
	TRACKER_CONFIG,
	type DedupConfig,
} from "./loot-dedup";
import { driftPct, parseDiagnosticLog, replaySegment, type ReplaySegment } from "./loot-replay";
import { buildUnifiedCatalog, type CatalogEntry, type JsonLoader } from "./ocr-matcher";

const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const STATIC_ROOT = fileURLToPath(new URL("../../../static", import.meta.url));
const LOG_PATH =
	process.env.LOOT_REPLAY_LOG ?? `${REPO_ROOT}dist/diagnostic-mining-2026-09-01.log`;

const diskLoader: JsonLoader = async <T>(url: string): Promise<T | null> => {
	try {
		return JSON.parse(readFileSync(`${STATIC_ROOT}${url}`, "utf8")) as T;
	} catch {
		return null;
	}
};

/** Ground truth from the user's inventory deltas (docs/LOOT_OCR_TODO.md § SP.5). */
const SESSIONS: Array<{ name: string; startLabel: string; truth: Record<string, number> }> = [
	{
		name: "S2",
		startLabel: "12:05:48",
		truth: { rough_stone: 7629, copper_ore: 4298, gold_ore: 405, sharp_black_crystal_shard: 109 },
	},
	{
		name: "S3",
		startLabel: "12:27:22",
		truth: { rough_stone: 8885, copper_ore: 4651, gold_ore: 528 },
	},
];

/**
 * What the live app logged for these sessions (SP.5 table). The replay must
 * land within a few points of these or it is not replaying the live path.
 */
const LIVE_DRIFT: Record<string, number> = {
	"S2:rough_stone": -21.6,
	"S2:copper_ore": +31.8,
	"S3:rough_stone": -22.0,
	"S3:copper_ore": +35.3,
};
/** Tolerance vs the live numbers: the replay reconstructs raw names from spaceless sigs. */
const FIDELITY_PTS = 4;

const hasCorpus = existsSync(LOG_PATH);

let catalog: CatalogEntry[] = [];
let hints = new Map<string, number>();
let segments: ReplaySegment[] = [];

function segmentFor(startLabel: string): ReplaySegment {
	const seg = segments.find((s) => s.label.startsWith(startLabel));
	if (!seg) throw new Error(`segment starting ${startLabel} not found in ${LOG_PATH}`);
	return seg;
}

function fmtPct(p: number): string {
	return `${p >= 0 ? "+" : ""}${p.toFixed(1)}%`;
}

interface RunSummary {
	label: string;
	drifts: Record<string, number>;
	lines: string[];
}

function runConfig(label: string, config: DedupConfig): RunSummary {
	const lines: string[] = [];
	const drifts: Record<string, number> = {};
	for (const s of SESSIONS) {
		const res = replaySegment(segmentFor(s.startLabel), catalog, hints, config);
		for (const [id, actual] of Object.entries(s.truth)) {
			const st = res.items.get(id);
			const counted = st?.counted ?? 0;
			const d = driftPct(counted, actual);
			drifts[`${s.name}:${id}`] = d;
			lines.push(
				`${s.name} ${id.padEnd(26)} actual=${String(actual).padStart(5)} counted=${String(counted).padStart(5)} ${fmtPct(d).padStart(7)}  raw=${String(st?.raw ?? 0).padStart(5)} (${st?.reads ?? 0} reads)  dedup=${st?.dedup ?? 0} outlier=${st?.outlier ?? 0} cluster=${st?.cluster ?? 0}`,
			);
		}
	}
	return { label, drifts, lines };
}

function printRun(r: RunSummary): void {
	console.log(`\n=== ${r.label} ===\n${r.lines.join("\n")}`);
}

describe.skipIf(!hasCorpus)("mining corpus replay (2026-09-01)", () => {
	beforeAll(async () => {
		catalog = await buildUnifiedCatalog(diskLoader);
		const hintDoc = await diskLoader<{ hints?: Record<string, number> }>("/data/loot/qty-hints.json");
		hints = new Map(Object.entries(hintDoc?.hints ?? {}));
		segments = parseDiagnosticLog(readFileSync(LOG_PATH, "utf8"));
		expect(catalog.length).toBeGreaterThan(100);
	});

	it("parses both sessions with the emission counts the SP.5 analysis saw", () => {
		expect(segmentFor("12:05:48").events.length).toBe(799);
		expect(segmentFor("12:27:22").events.length).toBe(1439);
		// Pre-2026-09-02 log: no raw trail, no generation stamps.
		expect(segmentFor("12:05:48").rawPasses.length).toBe(0);
		expect(segmentFor("12:05:48").generation).toBe(0);
	});

	it("replays the live path faithfully: the bucket rule reproduces the SP.5 drift", () => {
		const r = runConfig("bucket (= shipped DEFAULT_DEDUP_CONFIG)", LEGACY_BUCKET_CONFIG);
		printRun(r);
		for (const [key, live] of Object.entries(LIVE_DRIFT)) {
			expect(Math.abs(r.drifts[key] - live), `${key} live=${live}`).toBeLessThanOrEqual(FIDELITY_PTS);
		}
		if (process.env.LOOT_REPLAY_DUMP) {
			const out: string[] = [];
			for (const s of SESSIONS) {
				const res = replaySegment(segmentFor(s.startLabel), catalog, hints, DEFAULT_DEDUP_CONFIG);
				for (const t of res.trail) {
					out.push(JSON.stringify({ session: s.name, ...t.ev, key: t.key, verdict: t.verdict }));
				}
			}
			writeFileSync(process.env.LOOT_REPLAY_DUMP, out.join("\n"));
		}
	});

	it("shipped config is never worse than the bucket baseline on any ground-truth cell", () => {
		const base = runConfig("bucket baseline", LEGACY_BUCKET_CONFIG);
		const shipped = runConfig("shipped DEFAULT_DEDUP_CONFIG", DEFAULT_DEDUP_CONFIG);
		for (const key of Object.keys(base.drifts)) {
			expect(Math.abs(shipped.drifts[key]), key).toBeLessThanOrEqual(Math.abs(base.drifts[key]) + 0.01);
		}
	});

	it("the physical-line tracker stays an A/B candidate: documented worse on the clean session", () => {
		// Pinned so nobody flips the default without a new corpus: on S2 the
		// tracker loses on BOTH calibration items (see loot-dedup.ts header).
		const base = runConfig("bucket", LEGACY_BUCKET_CONFIG);
		const tracker = runConfig("tracker", TRACKER_CONFIG);
		printRun(tracker);
		expect(Math.abs(tracker.drifts["S2:rough_stone"])).toBeGreaterThan(Math.abs(base.drifts["S2:rough_stone"]));
		expect(Math.abs(tracker.drifts["S2:copper_ore"])).toBeGreaterThan(Math.abs(base.drifts["S2:copper_ore"]));
	});

	it.todo("next corpus (single thread, raw OCR lines, region with margin): Rough Stone and Copper Ore within ±10 % in every session");

	it.skipIf(!process.env.LOOT_REPLAY_SWEEP)(
		"parameter sweep (LOOT_REPLAY_SWEEP=1)",
		() => {
			const rows: string[] = [];
			const header = `${"config".padEnd(44)} ${"S2 rough".padStart(9)} ${"S3 rough".padStart(9)} ${"S2 copper".padStart(10)} ${"S3 copper".padStart(10)} ${"S2 gold".padStart(8)} ${"S3 gold".padStart(8)} ${"S2 sharp".padStart(9)}`;
			const line = (label: string, cfg: DedupConfig) => {
				const r = runConfig(label, cfg);
				const d = r.drifts;
				rows.push(
					`${label.padEnd(44)} ${fmtPct(d["S2:rough_stone"]).padStart(9)} ${fmtPct(d["S3:rough_stone"]).padStart(9)} ${fmtPct(d["S2:copper_ore"]).padStart(10)} ${fmtPct(d["S3:copper_ore"]).padStart(10)} ${fmtPct(d["S2:gold_ore"]).padStart(8)} ${fmtPct(d["S3:gold_ore"]).padStart(8)} ${fmtPct(d["S2:sharp_black_crystal_shard"]).padStart(9)}`,
				);
			};
			line("bucket (shipped)", LEGACY_BUCKET_CONFIG);
			for (const window of [1500, 2000, 4000]) {
				line(`bucket window=${window}`, { ...LEGACY_BUCKET_CONFIG, bucketWindowMs: window });
			}
			for (const tol of [0.15, 0.35]) {
				line(`bucket qtyTolerance=${tol}`, { ...LEGACY_BUCKET_CONFIG, qtyTolerance: tol });
			}
			line("bucket cluster=off", { ...LEGACY_BUCKET_CONFIG, clusterEnabled: false });
			for (const gap of [800, 1200, 1500, 2500]) {
				for (const life of [2500, 6000]) {
					line(`tracker gap=${gap} life=${life}`, {
						...TRACKER_CONFIG,
						trackerRereadGapMs: gap,
						trackerLifetimeMs: life,
					});
				}
			}
			console.log(`\n${header}\n${rows.join("\n")}`);
		},
		120_000,
	);
});

describe("parseDiagnosticLog (2026-09-02 log format)", () => {
	const sample = [
		"[12:00:00.000 UTC] [SCANNER] start: gen=3 freq=6.0Hz interval=167ms strict=true mask=false upscale=3.0x temporal_n=1",
		'[12:00:01.000 UTC] [SCANNER] ocr_lines n=3 parsed=1 | 457.7 ok "Copper Ore x22" | 640.2 rej "Rough Stone \\"x2" | 822.5 rej "Fa\\u{e9}ry"',
		"[12:00:01.100 UTC] [SCANNER] static_run ticks=7 pending=1",
		'[12:00:02.000 UTC] [SCANNER] new_line sig="copperore" qty=22 y=457.7 scroll=0.0',
		'[12:00:02.000 UTC] [SCANNER] vote_emit sig="copperore" votes=[22, 220, 22] qty=22 seen=3 reason=consensus',
		"[12:00:03.000 UTC] [SCANNER] thread_exit gen=3 ocr_passes=10",
	].join("\n");

	it("reads generation, raw OCR trail, static runs and voted emissions", () => {
		const [seg] = parseDiagnosticLog(sample);
		expect(seg.generation).toBe(3);
		expect(seg.rawPasses).toHaveLength(1);
		expect(seg.rawPasses[0]).toMatchObject({ n: 3, parsed: 1 });
		expect(seg.rawPasses[0].lines).toEqual([
			{ y: 457.7, parsed: true, text: "Copper Ore x22" },
			{ y: 640.2, parsed: false, text: 'Rough Stone "x2' },
			{ y: 822.5, parsed: false, text: "Faéry" },
		]);
		expect(seg.staticRuns).toEqual([{ ts: 43_200_000 + 1100, ticks: 7, pending: 1 }]);
		expect(seg.events).toHaveLength(1);
		expect(seg.events[0]).toMatchObject({ qty: 22, seen: 3, reason: "consensus", votes: [22, 220, 22] });
	});
});
