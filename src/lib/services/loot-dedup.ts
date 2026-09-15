/**
 * Loot OCR — the TS-side counting pipeline, as a pure, replayable module.
 *
 * Rust's scanner emits one `OcrEvent` per "new" OCR line (position-aware
 * match + consensus voting, see `src-tauri/src/loot.rs`). What it cannot
 * catch is the same physical loot line re-emitted after an OCR-variant flip
 * (`Rough Stone` → `Rdugh Stone`), usually while the line is being pushed up
 * the log by newer lines. This module decides, per event, whether it is a
 * re-read of a line already counted or a genuinely new drop.
 *
 * Pure on purpose: no store, no `Date.now()`, no Tauri. `loot-session.ts`
 * owns one instance for the live session; `loot-replay.ts` runs the SAME
 * code over recorded diagnostic logs so every threshold in `DedupConfig`
 * is validated against ground truth before it ships (project rule, see
 * docs/LOOT_OCR_ACCURACY.md). Keep it that way — a `Date.now()` in here
 * would silently break the replay.
 *
 * Layers, in order (every layer keys on the resolved catalog item id — a
 * read that fails to match disarms all of them, see issue #3):
 *
 *   1. Re-read suppression — one of two strategies (`config.strategy`):
 *      - `"bucket"` (shipped): same (item, 50 px Y bucket) within 3 s and a
 *        compatible qty → re-read. Unchanged since 2026-05; the 2026-09-02
 *        replay of the mining corpus confirmed it is still the better rule.
 *      - `"tracker"`: models the loot log as a stack of physical lines that
 *        only ever move up (see `LineTracker`). Replayed 2026-09-02 against
 *        the single-thread S2 session: Rough Stone −25 % / Copper Ore +38 %
 *        versus the bucket's −21.5 % / +30 %, i.e. WORSE on both. The
 *        reasons are in docs/LOOT_OCR_TODO.md § "MV.2 replay findings" —
 *        the scanner silently absorbs the new line when consecutive gathers
 *        put an identical line in the same slot, so a moved-up re-read is
 *        often the displaced OLD line, and the corpus's real errors sit
 *        upstream (parser keeps ~1 in 5 OCR lines; trailing junk digits
 *        inflate quantities). Kept selectable so the replay can re-evaluate
 *        it on the next corpus, which records raw lines and static runs.
 *   2. Qty outlier guard — unconditional hard cap, per-item catalog hint,
 *      then the median-window rule. Validated 2026-09-01 (single reads of
 *      5,515 and 3,007 against a median of 22 all rejected); do not loosen.
 *   3. Cluster merge — scroll-burst misread suppression: same item, within
 *      700 ms, new qty < 15 % of the previous one.
 *
 * Tuning rule: change a number here only with a replay table from
 * `loot-replay.test.ts` showing both sessions moving toward truth together.
 */

// ============== Config ==============

export type DedupStrategy = "tracker" | "bucket";

export interface DedupConfig {
	strategy: DedupStrategy;

	// --- shared qty-compatibility rule (both strategies) ---
	/** |Δqty| ≤ max(qtyToleranceMin, last × qtyTolerance) → same popup, OCR digit jitter. */
	qtyTolerance: number;
	qtyToleranceMin: number;

	// --- "bucket" strategy ---
	bucketWindowMs: number;
	bucketYPx: number;

	// --- "tracker" strategy ---
	/**
	 * Max gap between two sightings (emissions) of the same physical line.
	 * BDO loot lines are visible ~1 s and the scanner re-emits a flipped
	 * variant within a pass or two, so re-reads arrive well inside this.
	 */
	trackerRereadGapMs: number;
	/** Max age of a physical line, from its first emission, for any re-read. */
	trackerLifetimeMs: number;
	/** Y jitter (px, upscaled space) within which two reads share a slot. */
	trackerJitterPx: number;

	// --- cluster merge ---
	clusterEnabled: boolean;
	clusterWindowMs: number;
	clusterQtyRatio: number;

	// --- outlier guard ---
	outlierMultiplier: number;
	outlierFloor: number;
	outlierHardCap: number;
	outlierWindowSize: number;
	outlierMinSamples: number;
}

export const DEFAULT_DEDUP_CONFIG: DedupConfig = {
	strategy: "bucket",

	qtyTolerance: 0.25,
	qtyToleranceMin: 2,

	bucketWindowMs: 3000,
	bucketYPx: 50,

	trackerRereadGapMs: 1500,
	trackerLifetimeMs: 4000,
	trackerJitterPx: 30,

	clusterEnabled: true,
	clusterWindowMs: 700,
	clusterQtyRatio: 0.15,

	outlierMultiplier: 10,
	outlierFloor: 500,
	outlierHardCap: 600,
	outlierWindowSize: 20,
	outlierMinSamples: 5,
};

/** Explicit bucket-strategy config for replay baselines and A/B tables. */
export const LEGACY_BUCKET_CONFIG: DedupConfig = {
	...DEFAULT_DEDUP_CONFIG,
	strategy: "bucket",
};

/** The physical-line tracker, for A/B replays (not shipped — see header). */
export const TRACKER_CONFIG: DedupConfig = {
	...DEFAULT_DEDUP_CONFIG,
	strategy: "tracker",
};

/** Verdict of the counting layers for one event. `applied` = count it. */
export type DedupVerdict = "applied" | "dedup" | "outlier" | "cluster";

// ============== Shared helpers ==============

function qtyCompatible(qty: number, last: number, cfg: DedupConfig): boolean {
	const tolerance = Math.max(cfg.qtyToleranceMin, last * cfg.qtyTolerance);
	if (Math.abs(qty - last) <= tolerance) return true;
	// Digit-tail misread: WinRT appends a trailing 0 to the qty (`x48 → x480`)
	// on the same physical popup. Exact 10× in either direction is the
	// fingerprint; legit follow-up drops rarely land on that ratio.
	return qty === last * 10 || last === qty * 10;
}

function medianOf(arr: number[]): number {
	const sorted = [...arr].sort((a, b) => a - b);
	const m = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 1 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
}

// ============== Strategy: Y-bucket (shipped) ==============
//
// Key `${item}:${floor(y / 50)}`; a same-key emission within 3 s whose qty is
// compatible is a re-read. The stored Y never updates. That looks like it
// should fail on mining bursts (a pushed-up line re-read in a new bucket is
// counted again; the next drop landing in the vacated slot is merged), and
// the 2026-09-02 replay went looking for exactly that — but the tracker
// that models the motion measured worse. The Y-bucket rule's blind spots
// happen to cancel against the scanner's own: when Rust pairs an old line
// with an identical new one in the same slot, the pushed copy shows up as
// "new" in a different bucket and gets counted, which is right by accident.

class BucketDedup {
	private recent = new Map<string, { qty: number; ts: number }>();

	constructor(private readonly cfg: DedupConfig) {}

	private bucketOf(y: number | undefined): number | "none" {
		if (typeof y !== "number" || !Number.isFinite(y)) return "none";
		return Math.floor(y / this.cfg.bucketYPx);
	}

	/** True = passes (new line). False = re-read, suppress. */
	check(key: string, qty: number, y: number | undefined, now: number): boolean {
		const k = `${key}:${this.bucketOf(y)}`;
		const last = this.recent.get(k);
		if (last !== undefined && now - last.ts < this.cfg.bucketWindowMs) {
			if (qtyCompatible(qty, last.qty, this.cfg)) {
				// Refresh ts so a long-lived flickering popup keeps suppressing,
				// keep the stored qty so a later correct re-read still compares
				// to the legit value.
				this.recent.set(k, { qty: last.qty, ts: now });
				return false;
			}
		}
		this.recent.set(k, { qty, ts: now });
		if (this.recent.size > 500) {
			for (const [otherKey, entry] of this.recent) {
				if (now - entry.ts > this.cfg.bucketWindowMs * 2) this.recent.delete(otherKey);
			}
		}
		return true;
	}

	clear(): void {
		this.recent.clear();
	}
}

// ============== Strategy: physical-line tracker (A/B only) ==============
//
// BDO's loot log (as observed in the 2026-09-01 mining corpus, upscaled 3×):
//   - lines enter at the BOTTOM slot and every new line pushes the ones
//     already on screen up by one slot (~182 px here; the model does not
//     depend on the pitch);
//   - a line is visible for roughly a second, then fades (or is pushed off
//     the top); lines never move DOWN;
//   - the scanner reads a line several times while it is visible, and every
//     OCR-variant flip re-emits it — at its CURRENT position, which may be
//     one or more slots above where it was first emitted.
//
// So an event is a re-read of a tracked line L when: same item, qty
// compatible, within the re-read gap / lifetime, AND its Y is consistent
// with L's motion: either above L's last-known Y (L was pushed) or at the
// same slot while nothing has entered below it since. Every new line
// displaces everything already on screen, so a same-slot repeat AFTER any
// new line is a new drop in a re-used slot — the case the bucket rule got
// wrong. A Y below L's last-known Y is never a re-read.
//
// Tracked lines learn their new position from moved-up re-reads; when the
// scanner matched the line silently instead, the displaced flag alone is
// enough to keep the slot honest.

interface TrackedLine {
	key: string;
	/** Qty as first counted — the baseline for tolerance on re-reads. */
	qty: number;
	/** Last known Y, or undefined for events without a position. */
	y: number | undefined;
	firstTs: number;
	lastTs: number;
	/** A newer line entered at or below this one's last-known slot. */
	displaced: boolean;
}

export class LineTracker {
	private lines: TrackedLine[] = [];

	constructor(private readonly cfg: DedupConfig) {}

	/** True = new physical line (count it). False = re-read of a tracked line. */
	check(key: string, qty: number, y: number | undefined, now: number): boolean {
		const cfg = this.cfg;
		this.prune(now);

		let best: TrackedLine | null = null;
		let bestDy = Number.POSITIVE_INFINITY;
		for (const L of this.lines) {
			if (L.key !== key) continue;
			if (now - L.lastTs > cfg.trackerRereadGapMs) continue;
			if (!qtyCompatible(qty, L.qty, cfg)) continue;
			let dy: number;
			if (y === undefined || L.y === undefined) {
				dy = 0;
			} else {
				dy = y - L.y;
				if (dy > cfg.trackerJitterPx) continue; // moved down: never a re-read
				if (Math.abs(dy) <= cfg.trackerJitterPx && L.displaced) continue; // slot re-used
			}
			const score = Math.abs(dy);
			if (score < bestDy) {
				bestDy = score;
				best = L;
			}
		}

		if (best) {
			best.lastTs = now;
			if (y !== undefined && best.y !== undefined && best.y - y > cfg.trackerJitterPx) {
				// We now know where it is; anything that displaced it already
				// pushed it here. Later new lines will flag it again.
				best.y = y;
				best.displaced = false;
			}
			return false;
		}

		// New line entering the log pushes every line already on screen.
		for (const L of this.lines) L.displaced = true;
		this.lines.push({ key, qty, y, firstTs: now, lastTs: now, displaced: false });
		return true;
	}

	private prune(now: number): void {
		const cfg = this.cfg;
		if (this.lines.length === 0) return;
		this.lines = this.lines.filter(
			(L) => now - L.firstTs <= cfg.trackerLifetimeMs && now - L.lastTs <= cfg.trackerRereadGapMs,
		);
	}

	get size(): number {
		return this.lines.length;
	}

	clear(): void {
		this.lines = [];
	}
}

// ============== Cluster merge (scroll-aware) ==============
//
// Catches the OCR-misread-during-scroll pattern from the 2026-05-24
// gathering session: a single Copper Ore × 42 popup read as `x42` once, then
// re-read as `x3` three more times across a fast scroll. Within
// `clusterWindowMs`, same item (any Y), if the NEW qty is below
// `clusterQtyRatio` × the previous one, suppress. Directional on purpose:
// small → big within the window is the legit gathering mini-game proc
// (base popup + x6/x10/x12 special reward on the same tap).

class ClusterMerge {
	private recent = new Map<string, { qty: number; ts: number }>();

	constructor(private readonly cfg: DedupConfig) {}

	/** True = passes. False = suppressed as a scroll-burst misread. */
	check(key: string, qty: number, now: number): boolean {
		const last = this.recent.get(key);
		if (last && now - last.ts < this.cfg.clusterWindowMs && qty < last.qty) {
			if (qty / last.qty < this.cfg.clusterQtyRatio) {
				// Refresh ts so a long burst of repeated misreads keeps
				// suppressing as long as they keep arriving within the window.
				this.recent.set(key, { qty: last.qty, ts: now });
				return false;
			}
		}
		this.recent.set(key, { qty, ts: now });
		return true;
	}

	clear(): void {
		this.recent.clear();
	}
}

// ============== Qty outlier guard ==============
//
// OCR digit-misread compensation: WinRT occasionally appends a stray digit
// (`x8 → x801`, `x2 → x248`). A read is rejected when it is at or above the
// unconditional hard cap (cold-start safe), above the item's catalog hint
// (`static/data/loot/qty-hints.json`, user-tunable), or — once the item has
// enough samples — at or above `outlierFloor` AND `outlierMultiplier` × the
// item's rolling median. Rationale for the numbers: docs/LOOT_OCR_ACCURACY.md.

class OutlierGuard {
	private windows = new Map<string, number[]>();

	constructor(
		private readonly cfg: DedupConfig,
		private readonly getHint: (key: string) => number | undefined,
	) {}

	/** Returns the reason a qty is rejected, or null when it passes. */
	reject(key: string, qty: number): "hard-cap" | "hint" | "median" | null {
		const cfg = this.cfg;
		if (qty >= cfg.outlierHardCap) return "hard-cap";
		const hint = this.getHint(key);
		if (hint !== undefined && qty > hint) return "hint";
		if (qty < cfg.outlierFloor) return null;
		const window = this.windows.get(key);
		if (!window || window.length < cfg.outlierMinSamples) return null;
		return qty >= medianOf(window) * cfg.outlierMultiplier ? "median" : null;
	}

	record(key: string, qty: number): void {
		let window = this.windows.get(key);
		if (!window) {
			window = [];
			this.windows.set(key, window);
		}
		window.push(qty);
		if (window.length > this.cfg.outlierWindowSize) window.shift();
	}

	clear(): void {
		this.windows.clear();
	}
}

// ============== Pipeline ==============

export interface DedupResult {
	verdict: DedupVerdict;
	/** Set when `verdict === "outlier"`. */
	outlierReason?: "hard-cap" | "hint" | "median";
}

/**
 * One instance per capture session. `evaluate` runs the layers in order and
 * returns the verdict; the caller applies the count only on `applied`.
 *
 * `raw:` keys (unmatched reads) have no stable identity across OCR variants,
 * so the outlier guard and cluster merge skip them; only the re-read layer
 * runs, keyed on whatever row key the caller resolved.
 */
export class LootDedupPipeline {
	private readonly bucket: BucketDedup;
	private readonly tracker: LineTracker;
	private readonly cluster: ClusterMerge;
	private readonly outlier: OutlierGuard;

	constructor(
		readonly config: DedupConfig = DEFAULT_DEDUP_CONFIG,
		getHint: (key: string) => number | undefined = () => undefined,
	) {
		this.bucket = new BucketDedup(config);
		this.tracker = new LineTracker(config);
		this.cluster = new ClusterMerge(config);
		this.outlier = new OutlierGuard(config, getHint);
	}

	evaluate(key: string, qty: number, y: number | undefined, now: number): DedupResult {
		const isRaw = key.startsWith("raw:");

		const fresh =
			this.config.strategy === "tracker"
				? this.tracker.check(key, qty, y, now)
				: this.bucket.check(key, qty, y, now);
		if (!fresh) return { verdict: "dedup" };

		// Outlier guard BEFORE cluster merge: a catastrophic misread caught
		// here must not become the cluster baseline, or the next legit small
		// emit for the same item would be suppressed against it.
		if (!isRaw) {
			const reason = this.outlier.reject(key, qty);
			if (reason) return { verdict: "outlier", outlierReason: reason };
		}

		if (this.config.clusterEnabled && !isRaw && !this.cluster.check(key, qty, now)) {
			return { verdict: "cluster" };
		}

		if (!isRaw) this.outlier.record(key, qty);
		return { verdict: "applied" };
	}

	clear(): void {
		this.bucket.clear();
		this.tracker.clear();
		this.cluster.clear();
		this.outlier.clear();
	}
}
