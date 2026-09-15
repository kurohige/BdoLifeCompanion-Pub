/**
 * Loot OCR — live capture session store.
 *
 * Holds the one-at-a-time `CaptureSession`. Subscribes to the Rust scanner's
 * `loot-ocr` events (wired in Phase 4) and applies each through `applyOcrEvent`:
 * fuzzy-match against the unified catalog, dedup within a sliding window, then
 * upsert the matching row. User-edited rows are locked from automatic updates.
 */

import { writable, get } from "svelte/store";
import { generateId } from "$lib/utils/id";
import {
	normalizeForMatch,
	unmatchedKey,
	MAX_SCAN_LOG_ENTRIES,
	MAX_SESSION_ROWS,
	SCAN_LOG_WINDOW_MS,
	type CaptureLog,
	type CapturedRow,
	type CaptureSession,
	type MatchSource,
	type OcrEvent,
	type Region,
	type ScanLogEntry,
} from "$lib/models/loot";
import {
	findFuzzyRawKey,
	matchOcrName,
	shouldSeedPrior,
	toPriorEntry,
	type PriorEntry,
} from "$lib/services/ocr-matcher";
import { LootDedupPipeline } from "$lib/services/loot-dedup";
import { StabilityGate } from "$lib/services/loot-stability";
import { clearRecording, recordOcrEvent, type RecordVerdict } from "$lib/services/loot-recording";
import { isWindowBlurred } from "$lib/services/loot-diagnostic";
import { addToInventory } from "./inventory";
import { lootCatalogStore, getLootExactIndex, getQtyHint } from "./loot-catalog";
import { addLootLog } from "./loot-logs";

export const captureSessionStore = writable<CaptureSession | null>(null);

// ============== Counting pipeline ==============
//
// Re-read suppression, outlier guard and cluster merge live in
// `services/loot-dedup.ts` — a pure module so `services/loot-replay.ts` can
// run the identical code over recorded diagnostic logs. Every threshold in
// `DEFAULT_DEDUP_CONFIG` was validated there against ground truth before it
// shipped (docs/LOOT_OCR_ACCURACY.md); tune from a replay, never by eye.
//
// One instance per capture session. State is deliberately TS-side: the Rust
// scanner thread restarts on every pause/resume and would otherwise re-count
// popups still visible after a resume (lesson 2, feedback memory).

const pipeline = new LootDedupPipeline(undefined, getQtyHint);

// ============== Session prior + stability gate ==============
//
// Session prior (issue #4): items confirmed by a clean read this session.
// `matchOcrName` compares garbled reads against these with a looser,
// confusion-folded distance BEFORE the global fuzzy pass, so "wolfB100d" /
// "or Blood" / "harp Black Crystal Shard" route to the item that is actually
// dropping instead of an edit-distance neighbour (Ox Blood, Hard Shard).
// Reads matched this way carry the item key, which re-arms the entire dedup
// stack above — that, not label cosmetics, is the counting fix for issue #3.
//
// Seeding is strict (see `shouldSeedPrior`) because one poisoned prior would
// misroute every later garbled read. Deliberately NOT re-seeded from a
// restored session: restored rows don't carry their match distance, and this
// session's own data showed restored "matched" rows can be false matches
// (ox_blood from "or Blood"). Priors rebuild within seconds of real reads.
//
// Stability gate (issue #2): unmatched reads with no existing row must repeat
// identically before they may create one. See `loot-stability.ts`.

const sessionPrior = new Map<string, PriorEntry>();
const stabilityGate = new StabilityGate();

function clearPriorState(): void {
	sessionPrior.clear();
	stabilityGate.clear();
}

// ============== Elapsed ticker ==============

let elapsedTickId: ReturnType<typeof setInterval> | null = null;

function startElapsedTicker(): void {
	if (elapsedTickId !== null) return;
	elapsedTickId = setInterval(() => {
		captureSessionStore.update((s) => {
			if (!s || !s.running) return s;
			return { ...s, elapsedSeconds: s.elapsedSeconds + 1 };
		});
	}, 1000);
}

function stopElapsedTicker(): void {
	if (elapsedTickId !== null) {
		clearInterval(elapsedTickId);
		elapsedTickId = null;
	}
}

/** Tear down the ticker on app shutdown — exported for the layout cleanup. */
export function cleanupCaptureSession(): void {
	stopElapsedTicker();
}

// ============== Lifecycle ==============

export function startCaptureSession(region: Region | null, label?: string): void {
	const session: CaptureSession = {
		id: generateId(),
		startedAt: Date.now(),
		running: true,
		elapsedSeconds: 0,
		region,
		rows: [],
		scanLog: [],
		...(label ? { label } : {}),
	};
	captureSessionStore.set(session);
	pipeline.clear();
	clearPriorState();
	clearRecording();
	startElapsedTicker();
	startScanLogGc();
}

export function pauseCaptureSession(): void {
	captureSessionStore.update((s) => (s ? { ...s, running: false } : s));
	// Critical: stop the 1Hz elapsed ticker. Without this, the ticker keeps
	// calling captureSessionStore.update(s => s) every second after pause.
	// Svelte's writable.update fires subscribers regardless of identity-equal
	// returns, so the auto-save subscriber kept rescheduling a full-session
	// JSON write to disk forever after pause. With a multi-MB session (rows +
	// scanLog), that saturated the Tauri IPC bridge and froze WebView2's main
	// thread. Root cause of the 2026-05-15 freeze-on-pause regression.
	stopElapsedTicker();
	stopScanLogGc();
}

export function resumeCaptureSession(): void {
	captureSessionStore.update((s) => (s ? { ...s, running: true } : s));
	startElapsedTicker();
	startScanLogGc();
}

/**
 * Freeze the live session into a `CaptureLog` and clear the slot. Returns the
 * created log so callers can navigate to it.
 */
export function finalizeCaptureSession(): CaptureLog | null {
	const s = get(captureSessionStore);
	if (!s) return null;

	const endedAt = Date.now();
	const log: CaptureLog = {
		id: generateId(),
		label: s.label?.trim() || new Date(s.startedAt).toLocaleString(),
		startedAt: s.startedAt,
		endedAt,
		rows: s.rows,
		mergedAt: null,
	};
	addLootLog(log);
	captureSessionStore.set(null);
	pipeline.clear();
	clearPriorState();
	// Recording deliberately NOT cleared — the diagnostics export stays
	// available after the session is saved; the next start wipes it.
	stopElapsedTicker();
	stopScanLogGc();
	return log;
}

/**
 * Push each matched row's `count` into the global inventory under its
 * `matchedItemId`. Unmatched / raw rows are skipped (no inventory key to
 * target). Returns the number of rows actually merged so the caller can
 * surface a toast. Edited rows that the user manually linked to a catalog
 * item DO count as matched — they have `matchedItemId` set.
 */
export function mergeMatchedRowsToInventory(rows: CapturedRow[]): { itemsMerged: number } {
	let itemsMerged = 0;
	for (const r of rows) {
		if (!r.matchedItemId || r.count <= 0) continue;
		addToInventory(r.matchedItemId, r.count);
		itemsMerged++;
	}
	return { itemsMerged };
}

export function resetCaptureSession(): void {
	captureSessionStore.set(null);
	pipeline.clear();
	clearPriorState();
	stopElapsedTicker();
	stopScanLogGc();
}

export function setSessionLabel(label: string): void {
	captureSessionStore.update((s) => (s ? { ...s, label } : s));
}

export function setSessionRegion(region: Region | null): void {
	captureSessionStore.update((s) => (s ? { ...s, region } : s));
}

// ============== Scan log ==============

/**
 * Append a scan log entry to a session snapshot, returning the new snapshot.
 * Pure — does not touch the store. Used by applyOcrEvent so the scan-log
 * append + row update happen in a single captureSessionStore.update call
 * (cuts the reactive cascade rate in half on every OCR event).
 *
 * The log is a rolling 60-second window: entries with ts older than
 * `now - SCAN_LOG_WINDOW_MS` are trimmed from the head on every append.
 * MAX_SCAN_LOG_ENTRIES is a burst-safety hard cap on top.
 */
function withScanLogEntry(s: CaptureSession, entry: ScanLogEntry): CaptureSession {
	const cutoff = Date.now() - SCAN_LOG_WINDOW_MS;
	// Find the first entry within the window. scanLog is append-ordered by ts
	// so a linear scan from the head finds the boundary quickly.
	let dropCount = 0;
	for (let i = 0; i < s.scanLog.length; i++) {
		if (s.scanLog[i].ts >= cutoff) break;
		dropCount++;
	}
	const base = dropCount === 0 ? s.scanLog : s.scanLog.slice(dropCount);
	const next = base.slice();
	next.push(entry);
	// Burst hard cap as a safety net for sub-window high-rate scenes.
	if (next.length > MAX_SCAN_LOG_ENTRIES) {
		next.splice(0, next.length - MAX_SCAN_LOG_ENTRIES);
	}
	return { ...s, scanLog: next };
}

/**
 * Periodic GC for the scan log so entries roll off during quiet periods
 * (no OCR events arriving). Without this, after a busy minute followed by
 * silence the log would visibly retain stale entries until the next event.
 */
let scanLogGcInterval: ReturnType<typeof setInterval> | null = null;

function startScanLogGc(): void {
	if (scanLogGcInterval !== null) return;
	scanLogGcInterval = setInterval(() => {
		// Skip the trim when the user is in another window (alt-tabbed to
		// BDO). They can't see the scan log anyway, and every store update
		// queues a reactive cascade for the renderer to flush when they
		// return — compounding those is the fingerprint of the focus-return
		// wedge. Document visibility isn't the right signal here: Chromium
		// treats a covered-but-not-minimized window as "visible", which is
		// most BDO sessions.
		if (isWindowBlurred()) return;
		captureSessionStore.update((s) => {
			if (!s || s.scanLog.length === 0) return s;
			const cutoff = Date.now() - SCAN_LOG_WINDOW_MS;
			let dropCount = 0;
			for (let i = 0; i < s.scanLog.length; i++) {
				if (s.scanLog[i].ts >= cutoff) break;
				dropCount++;
			}
			if (dropCount === 0) return s;
			return { ...s, scanLog: s.scanLog.slice(dropCount) };
		});
	}, 5_000);
}

function stopScanLogGc(): void {
	if (scanLogGcInterval !== null) {
		clearInterval(scanLogGcInterval);
		scanLogGcInterval = null;
	}
}

/** Wipe the scan log without touching the aggregated row totals. Used when
 * the user wants to start the log view fresh mid-session. */
export function clearScanLog(): void {
	captureSessionStore.update((s) => (s ? { ...s, scanLog: [] } : s));
}

// ============== OCR event application ==============

/**
 * Evict oldest unmatched rows when over the cap. Preserves matched rows (those
 * carry user/inventory value) and user-edited rows (manual data). Returns the
 * possibly-trimmed array. O(n) single pass.
 */
function enforceRowCap(rows: CapturedRow[]): CapturedRow[] {
	if (rows.length <= MAX_SESSION_ROWS) return rows;
	const excess = rows.length - MAX_SESSION_ROWS;
	// Build an index of unmatched-non-edited rows sorted by lastSeenAt ascending.
	// These are the eviction candidates.
	const candidateIndices: number[] = [];
	for (let i = 0; i < rows.length; i++) {
		const r = rows[i];
		if (!r.matchedItemId && !r.edited) candidateIndices.push(i);
	}
	if (candidateIndices.length === 0) return rows; // Nothing safe to evict.
	candidateIndices.sort((a, b) => rows[a].lastSeenAt - rows[b].lastSeenAt);
	const evict = new Set(candidateIndices.slice(0, Math.min(excess, candidateIndices.length)));
	const next: CapturedRow[] = [];
	for (let i = 0; i < rows.length; i++) {
		if (!evict.has(i)) next.push(rows[i]);
	}
	return next;
}

/**
 * Crude "how clean is this OCR string" score — fraction of chars that are
 * letters or spaces. Used to drift the display name of an unmatched fuzzy-
 * merged row toward the least-garbled variant we've seen.
 */
function cleanlinessScore(name: string): number {
	const trimmed = name.trim();
	if (!trimmed) return 0;
	let alpha = 0;
	for (let i = 0; i < trimmed.length; i++) {
		const c = trimmed.charCodeAt(i);
		if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 32) alpha++;
	}
	return alpha / trimmed.length;
}

/**
 * Apply a single OCR event to the active session. No-op when there is no
 * session, when the session is paused, or when the same (key,qty) tuple was
 * already seen within the dedup window. Min-confidence filtering happens in
 * Rust before this is called.
 *
 * Lookup priority for unmatched OCR events:
 *   1. Exact `unmatchedKey(rawName)` hit — same OCR string we've seen before.
 *   2. Fuzzy hit against another unmatched row (Levenshtein under threshold) —
 *      collapses OCR-noise variants like "Blush Leaf" / "BIüsh Le.af" onto a
 *      single row instead of one row per OCR variant.
 *   3. New row with `unmatchedKey(rawName)`.
 */
export function applyOcrEvent(ev: OcrEvent): void {
	const session = get(captureSessionStore);
	if (!session || !session.running) return;

	const catalog = get(lootCatalogStore);
	const match = matchOcrName(ev.rawName, catalog, getLootExactIndex(), sessionPrior);

	// Seed the session prior from clean reads only — see shouldSeedPrior for
	// why a distance-1 match with a close runner-up must never qualify.
	if (match && !sessionPrior.has(match.itemId)) {
		if (shouldSeedPrior(match, normalizeForMatch(ev.rawName).length)) {
			sessionPrior.set(match.itemId, toPriorEntry(match));
		}
	}

	let key: string;
	if (match) {
		key = match.itemId;
	} else {
		const exactKey = unmatchedKey(ev.rawName);
		const exactHit = session.rows.some((r) => r.key === exactKey);
		key = exactHit ? exactKey : (findFuzzyRawKey(session.rows, ev.rawName) ?? exactKey);
	}

	// Scan log entry — always emitted for visibility, even if dedup suppresses
	// the row update below.
	const scanEntry: ScanLogEntry = {
		ts: ev.ts,
		rawName: ev.rawName,
		qty: ev.qty,
		...(match
			? {
					matchedItemId: match.itemId,
					matchedSource: match.source,
					matchedDisplayName: match.displayName,
				}
			: {}),
		...((ev.countInPass ?? 1) > 1 ? { countInPass: ev.countInPass } : {}),
	};

	// Counting layers (re-read suppression → outlier guard → cluster merge),
	// keyed on the resolved item so every layer is armed only for matched
	// reads. Clocked on the scanner's `ev.ts`, not `Date.now()`, so the live
	// path and the log replay make identical decisions.
	const decision = pipeline.evaluate(key, ev.qty, ev.y, ev.ts);
	if (decision.verdict === "outlier") {
		console.warn(
			`[loot-ocr] qty outlier rejected (${decision.outlierReason}): key=${key} qty=${ev.qty} raw="${ev.rawName}"`,
		);
	} else if (decision.verdict === "cluster") {
		console.warn(`[loot-ocr] cluster-merge suppressed: key=${key} qty=${ev.qty}`);
	}
	const dedupPassed = decision.verdict !== "dedup";
	const outlier = decision.verdict === "outlier";
	const clusterPassed = decision.verdict === "applied";
	// Multiplicity from same-pass stack collapse on the Rust side. Defaults
	// to 1 for normal single-line events. When ≥ STACK_COLLAPSE_THRESHOLD
	// identical lines were seen in one OCR pass, Rust emits ONE event with
	// the original count, and the row should accumulate qty × countInPass.
	const multiplicity = Math.max(1, ev.countInPass ?? 1);
	let drop = ev.qty * multiplicity;
	let rowFirstSeenAt = ev.ts;

	// Line-stability gate (issue #2): an unmatched read with no existing row
	// is stashed until the identical normalized text repeats; the confirming
	// sighting retro-credits the stash. Runs AFTER dedup on purpose — a
	// dedup-suppressed re-read never reaches the gate, so it can't stash the
	// same physical line twice. Matched reads and reads folding into an
	// existing raw row are untouched.
	let gated = false;
	if (clusterPassed && !match && !session.rows.some((r) => r.key === key)) {
		const credit = stabilityGate.offer(normalizeForMatch(ev.rawName), drop, ev.ts);
		if (credit === null) {
			gated = true;
		} else {
			drop = credit.credit;
			rowFirstSeenAt = credit.firstTs;
		}
	}

	const shouldUpdateRow = clusterPassed && !gated;

	// Diagnostic recording (issue #5) — every event with its final verdict,
	// including the ones the pipeline suppressed. Plain array append, no
	// reactive work; safe while blurred.
	const verdict: RecordVerdict = !dedupPassed
		? "dedup"
		: outlier
			? "outlier"
			: !clusterPassed
				? "cluster"
				: gated
					? "gated"
					: "applied";
	recordOcrEvent({
		ts: ev.ts,
		rawName: ev.rawName,
		qty: ev.qty,
		...(typeof ev.y === "number" ? { y: ev.y } : {}),
		...((ev.countInPass ?? 1) > 1 ? { countInPass: ev.countInPass } : {}),
		...(match ? { matchedItemId: match.itemId, via: match.via ?? "exact", dist: match.distance } : {}),
		verdict,
	});
	// When the user is in another window (blurred), Chromium still runs
	// reactive cascades but the renderer batches their output. The
	// 2026-05-16 freeze happened when the user clicked back into our
	// window and the accumulated render queue had to flush in one go.
	// Counts must stay accurate, so we still update rows; but the scan
	// log is a UI-only visualization with no functional weight when
	// nobody is looking — skipping its append entirely while blurred
	// avoids piling those store updates onto the focus-return flush.
	const blurred = isWindowBlurred();

	if (blurred && !shouldUpdateRow) {
		// Nothing visible to update AND no count change — fully no-op so
		// the identity-equal save guard catches it and no subscribers fire.
		return;
	}

	// SINGLE store update — scan log + row work combined. Cuts subscriber
	// fire-rate in half versus the prior two-update pattern. Critical for
	// keeping WebView2's main thread breathable at high OCR rates.
	captureSessionStore.update((s) => {
		if (!s) return s;

		// Append the scan entry — but only when focused. When blurred, the
		// log isn't being read and the queued render work piles up.
		let next = blurred ? s : withScanLogEntry(s, scanEntry);
		if (!shouldUpdateRow) return next;

		const idx = next.rows.findIndex((r) => r.key === key);
		if (idx === -1) {
			const row: CapturedRow = {
				key,
				rawName: ev.rawName,
				normalizedRawName: normalizeForMatch(ev.rawName),
				...(match ? { matchedItemId: match.itemId, matchedSource: match.source } : {}),
				displayName: match ? match.displayName : ev.rawName,
				count: drop,
				firstSeenAt: rowFirstSeenAt,
				lastSeenAt: ev.ts,
			};
			const rowsWithNew = [row, ...next.rows];
			return { ...next, rows: enforceRowCap(rowsWithNew) };
		}

		const rows = next.rows.slice();
		const existing = rows[idx];
		if (existing.edited) {
			rows[idx] = { ...existing, lastSeenAt: ev.ts };
		} else {
			const nextDisplay =
				!existing.matchedItemId &&
				cleanlinessScore(ev.rawName) > cleanlinessScore(existing.displayName)
					? ev.rawName
					: existing.displayName;

			// Recompute the normalized cache when rawName actually changes —
			// this is rare (only on display-name drift) but cheap to keep correct.
			const nextNorm =
				ev.rawName === existing.rawName
					? existing.normalizedRawName
					: normalizeForMatch(ev.rawName);

			rows[idx] = {
				...existing,
				count: existing.count + drop,
				rawName: ev.rawName,
				normalizedRawName: nextNorm,
				displayName: nextDisplay,
				lastSeenAt: ev.ts,
			};
		}
		return { ...next, rows };
	});
}

// ============== Row mutations ==============

function updateRow(key: string, fn: (row: CapturedRow) => CapturedRow): void {
	captureSessionStore.update((s) => {
		if (!s) return s;
		const idx = s.rows.findIndex((r) => r.key === key);
		if (idx === -1) return s;
		const rows = s.rows.slice();
		rows[idx] = fn(rows[idx]);
		return { ...s, rows };
	});
}

export function renameRow(key: string, newName: string): void {
	const trimmed = newName.trim();
	if (!trimmed) return;
	updateRow(key, (r) => ({ ...r, displayName: trimmed, edited: true }));
}

export function setRowCount(key: string, newCount: number): void {
	const c = Math.max(0, Math.floor(newCount));
	updateRow(key, (r) => ({ ...r, count: c, edited: true }));
}

/** Set or clear a free-text note. Deliberately does NOT set `edited` so OCR keeps updating the row. */
export function setRowNote(key: string, note: string): void {
	const trimmed = note.trim();
	updateRow(key, (r) => {
		if (!trimmed) {
			const { note: _note, ...rest } = r;
			return rest;
		}
		return { ...r, note: trimmed };
	});
}

/**
 * Pass 7.1 — manually add a catalog item as a row (`+ ADD ITEM`). Upsert: an
 * existing row with the same key gets +1; a new row starts at count 1 with
 * `edited: true` and no rawName (there was no OCR read behind it).
 */
export function addManualRow(itemId: string, source: MatchSource, displayName: string): void {
	captureSessionStore.update((s) => {
		if (!s) return s;
		const idx = s.rows.findIndex((r) => r.key === itemId);
		const now = Date.now();
		const rows = s.rows.slice();
		if (idx !== -1) {
			rows[idx] = { ...rows[idx], count: rows[idx].count + 1, lastSeenAt: now, edited: true };
		} else {
			rows.push({
				key: itemId,
				rawName: "",
				normalizedRawName: "",
				matchedItemId: itemId,
				matchedSource: source,
				displayName,
				count: 1,
				firstSeenAt: now,
				lastSeenAt: now,
				edited: true,
			});
		}
		return { ...s, rows };
	});
}

export function deleteRow(key: string): void {
	captureSessionStore.update((s) =>
		s ? { ...s, rows: s.rows.filter((r) => r.key !== key) } : s,
	);
}

/**
 * Link a row to a catalog item. The row's key changes to `itemId`, so if a row
 * already exists with that key (the OCR matched the same item under a different
 * raw spelling), the two rows are merged — counts sum, firstSeenAt/lastSeenAt
 * unioned. Always sets `edited: true` so future OCR events don't overwrite.
 */
export function linkRowToItem(
	key: string,
	itemId: string,
	source: MatchSource,
	displayName: string,
): void {
	captureSessionStore.update((s) => {
		if (!s) return s;
		const sourceIdx = s.rows.findIndex((r) => r.key === key);
		if (sourceIdx === -1) return s;
		const sourceRow = s.rows[sourceIdx];
		const targetIdx = s.rows.findIndex((r) => r.key === itemId);

		let merged: CapturedRow = {
			...sourceRow,
			key: itemId,
			matchedItemId: itemId,
			matchedSource: source,
			displayName,
			edited: true,
		};

		if (targetIdx === -1 || targetIdx === sourceIdx) {
			const rows = s.rows.slice();
			rows[sourceIdx] = merged;
			return { ...s, rows };
		}

		const targetRow = s.rows[targetIdx];
		merged = {
			...merged,
			count: sourceRow.count + targetRow.count,
			firstSeenAt: Math.min(sourceRow.firstSeenAt, targetRow.firstSeenAt),
			lastSeenAt: Math.max(sourceRow.lastSeenAt, targetRow.lastSeenAt),
		};

		const rows = s.rows.filter((_, i) => i !== sourceIdx && i !== targetIdx);
		// Insert the merged row at the position of whichever original was newer,
		// so the user's eye doesn't lose it after the merge.
		const insertAt = Math.min(sourceIdx, targetIdx);
		rows.splice(insertAt, 0, merged);
		return { ...s, rows };
	});
}

/** Revert a previously-linked row back to unmatched (raw) state. */
export function unlinkRow(key: string): void {
	captureSessionStore.update((s) => {
		if (!s) return s;
		const idx = s.rows.findIndex((r) => r.key === key);
		if (idx === -1) return s;
		const row = s.rows[idx];
		const newKey = unmatchedKey(row.rawName);
		const next: CapturedRow = {
			key: newKey,
			rawName: row.rawName,
			normalizedRawName: row.normalizedRawName ?? normalizeForMatch(row.rawName),
			displayName: row.rawName,
			count: row.count,
			firstSeenAt: row.firstSeenAt,
			lastSeenAt: row.lastSeenAt,
			edited: true,
		};
		const rows = s.rows.slice();
		rows[idx] = next;
		return { ...s, rows };
	});
}

/** Clear the `edited` flag — re-allow OCR updates to mutate this row. */
export function unlockRow(key: string): void {
	updateRow(key, (r) => {
		const { edited: _edited, ...rest } = r;
		return rest;
	});
}
