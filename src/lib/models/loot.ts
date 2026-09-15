/**
 * Loot OCR — minimal v0 types.
 *
 * Scope: capture text from a user-drawn region, extract (name, qty) pairs,
 * try to match against the unified item catalog, and accumulate counts.
 * No tier system, no silver totals, no spot tagging — those layer on later.
 */

// ============== Region ==============

/** Region coordinates normalized to the captured monitor's bounds (0..1). */
export interface Region {
	x: number;
	y: number;
	w: number;
	h: number;
	monitorId: string;
}

// ============== OCR pipeline ==============

/** Raw event emitted by the Rust scanner for each parsed OCR line. */
export interface OcrEvent {
	ts: number;
	/** What the OCR read, original casing + punctuation preserved. */
	rawName: string;
	qty: number;
	/** 0..1 — caller filters below `LootSettings.minConfidence`. */
	confidence: number;
	/**
	 * Always 1 under the position-aware dedup (shipped 2026-05-17): one
	 * event per new OCR line. The field stays on the wire because the
	 * persisted scan log payloads from earlier algorithm versions had
	 * `countInPass > 1` (stack-collapse events) and `applyOcrEvent`'s
	 * `Math.max(1, ev.countInPass ?? 1)` multiplier still applies.
	 */
	countInPass?: number;
	/**
	 * Average vertical-centre Y of the source line's bounding rect in the
	 * upscaled image's coordinate space. Used by the TS-side dedup to
	 * bucket on Y position — distinguishes "OCR-variant jitter on the
	 * same popup line" (same Y bucket) from "new kill popped up at a
	 * different Y" (new bucket). Optional because (a) older persisted
	 * scan-log entries predate this field and (b) the field is meaningful
	 * only for live emits, not for the persisted log.
	 */
	y?: number;
}

/** Which app catalog a row was matched against. `null` = unmatched (raw text). */
export type MatchSource =
	| "grinding"
	| "recipe"
	| "gathering"
	| "hunting"
	| "barter"
	| "treasure";

/** A row in the live capture session, keyed by matched item or fallback raw name. */
export interface CapturedRow {
	/** Stable key: `matchedItemId` when present, else `raw:${slug(rawName)}`. */
	key: string;
	/** The OCR string the user sees for this row (last-seen variant if multiple). */
	rawName: string;
	/**
	 * Pre-computed `normalizeForMatch(rawName)`. Cached on the row so
	 * `findFuzzyRawKey` doesn't have to re-normalize every unmatched row on
	 * every OCR event (which was O(n) per event × O(events_per_batch) =
	 * main-thread block at high event rates). Recomputed when `rawName`
	 * changes via the matcher's display-name drift logic.
	 */
	normalizedRawName: string;
	/** Resolved catalog item id, or undefined if no match cleared the threshold. */
	matchedItemId?: string;
	matchedSource?: MatchSource;
	/** Display name for matched rows; mirrors `rawName` when unmatched. */
	displayName: string;
	count: number;
	firstSeenAt: number;
	lastSeenAt: number;
	/** User flag: row was manually edited (locks future OCR from overwriting fields). */
	edited?: boolean;
	/** Free-text user note. Does NOT set `edited` — OCR keeps updating the row. */
	note?: string;
}

/** Cap on session.rows to keep findFuzzyRawKey + DOM iteration bounded. */
export const MAX_SESSION_ROWS = 300;

// ============== Session + Log ==============

export interface CaptureSession {
	id: string;
	startedAt: number;
	endedAt?: number;
	running: boolean;
	/** Accumulated seconds while `running` was true (ticks at 1 Hz). */
	elapsedSeconds: number;
	region: Region | null;
	rows: CapturedRow[];
	/**
	 * Chronological log of every `OcrEvent` the session has received from the
	 * Rust scanner since it started. Each entry is one delta-event after Rust's
	 * state-diff dedup, with its matched item id (if any) snapshot at receive
	 * time. Capped at MAX_SCAN_LOG_ENTRIES — older entries get dropped from the
	 * head so the array doesn't grow unbounded across multi-hour sessions.
	 */
	scanLog: ScanLogEntry[];
	/** Optional free-form label the user can set during or after capture. */
	label?: string;
}

export interface ScanLogEntry {
	ts: number;
	rawName: string;
	qty: number;
	/** Resolved at receive time so renaming a row later doesn't rewrite history. */
	matchedItemId?: string;
	matchedSource?: MatchSource;
	matchedDisplayName?: string;
	/**
	 * Set when this entry represents a same-pass stack collapse (≥ 8 identical
	 * lines in one OCR frame). The renderer should show the multiplicity
	 * (e.g. "× 1 (×20)") so the user can tell the row was a stack drop
	 * rather than a single-item drop. Undefined for normal entries.
	 */
	countInPass?: number;
}

/**
 * Scan log is a rolling 60-second window — entries older than this drop off
 * automatically. Total counts (hero + ledger) are unaffected; they aggregate
 * row state across the whole session. The window keeps the live log
 * narrowly-scoped to "what just happened" and prevents unbounded growth.
 */
export const SCAN_LOG_WINDOW_MS = 60_000;

/**
 * Hard cap on the in-memory scan log as a burst-safety net on top of the time
 * window. At 6Hz scan × ~10 events/tick burst, the array can reach ~600 in
 * a single second before the time window has had a chance to drop anything;
 * this cap keeps that bounded even mid-burst.
 */
export const MAX_SCAN_LOG_ENTRIES = 500;

export interface CaptureLog {
	id: string;
	label: string;
	startedAt: number;
	endedAt: number;
	rows: CapturedRow[];
	/**
	 * Epoch ms the matched rows were merged into the global inventory store.
	 * `null` means the log has never been merged. Set on first `Save to log`
	 * when `inventoryMergeOnSave` is true; updated on each LOGS-detail
	 * Re-merge so the user can see when they last applied counts.
	 */
	mergedAt: number | null;
}

// ============== Settings ==============

export interface LootSettings {
	freqHz: number;
	minConfidence: number;
	region: Region | null;
	savedRegions: Array<{ name: string; region: Region }>;
	/**
	 * True after the user has seen and accepted the OCR safety disclaimer. The
	 * scanner refuses to start until this is true, ensuring the user has been
	 * shown the ToS posture before any screen-reading happens.
	 */
	disclaimerAcknowledged: boolean;
	/**
	 * Reject OCR lines that have neither a known loot-log prefix (`Obtained:`)
	 * nor an explicit `×N` quantity marker. Filters player names / chat /
	 * ambient text that drifts through the captured region. Default `true`.
	 */
	strictMode: boolean;
	/**
	 * HSV-mask the cropped region before OCR: keep only bright-near-neutral
	 * or bright-saturated pixels (loot-log text colours), binarize to black-
	 * on-white. Default `false` — fixture bench showed the current thresholds
	 * erode anti-aliased glyph edges down to scattered pixels and drop
	 * WinRT OCR's line yield to zero. Kept as a toggle so we can re-enable it
	 * if a better band lands (or for users whose UI scale makes the strokes
	 * thick enough to survive). See `docs/LOOT_OCR_ACCURACY.md`.
	 */
	colorMask: boolean;
	/**
	 * Lanczos3 upscale factor applied to the cropped region before OCR. 1.0
	 * disables; 3.0 is the default and lifts BDO's ~10–14 px loot text up to
	 * the x-height (~20–30 px) that WinRT OCR / Tesseract / PaddleOCR are
	 * trained on. Clamped to [1.0, 6.0] in the Rust pipeline.
	 */
	upscaleFactor: number;
	/**
	 * Number of consecutive captures the scanner median-stacks before OCR.
	 *
	 * 1 (default) = single-frame OCR; median disabled. Higher values exploit
	 * pixel-stable UI over a moving background — median across N frames yields
	 * text-on-smoothed-background — but they actively destroy *transient* text
	 * (BDO's loot popup appears suddenly, lives ~3-5 s, then fades). Tested
	 * 2026-05-14 with N=5 against the live popup: the median wiped the
	 * just-appeared text because only 1-2 of the 5 buffered frames contained
	 * the popup. Keep at 1 unless you're capturing a permanent chat log that
	 * doesn't update mid-window.
	 */
	temporalFrames: number;
	/**
	 * When the user clicks "Save to log" on TRACK, also push each matched row's
	 * `count` into the global inventory store under its `matchedItemId`. Default
	 * `true` — addresses the user's 2026-05-13 rule that inventory totals only
	 * change when the session is logged (not mid-scan). Unmatched / raw rows are
	 * skipped since there's no inventory key to target.
	 */
	inventoryMergeOnSave: boolean;
}

export const DEFAULT_LOOT_SETTINGS: LootSettings = {
	freqHz: 6,
	minConfidence: 0.85,
	region: null,
	savedRegions: [],
	disclaimerAcknowledged: false,
	strictMode: true,
	colorMask: false,
	upscaleFactor: 3,
	temporalFrames: 1,
	inventoryMergeOnSave: true,
};

// ============== Helpers ==============

/**
 * Normalize a string for fuzzy matching: lowercase, strip diacritics, strip
 * punctuation, collapse whitespace. Use this for both catalog index keys and
 * OCR comparison so that OCR noise like "BlüSh" / "Blåsh" / "Élüfféf" still
 * normalizes to the same lowercase ASCII as "Blush" / "Bluffer".
 */
export function normalizeForMatch(s: string): string {
	return s
		.toLowerCase()
		// NFD decomposes accented chars to letter + combining mark, then we
		// strip the combining marks (Unicode category Mn). This collapses
		// "ü"→"u", "å"→"a", "é"→"e", "ñ"→"n", etc. before the punctuation pass.
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.replace(/['`'"]/g, "")
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

/** Stable key for an unmatched row, derived from its raw OCR text. */
export function unmatchedKey(rawName: string): string {
	return `raw:${normalizeForMatch(rawName).replace(/\s+/g, "_")}`;
}

