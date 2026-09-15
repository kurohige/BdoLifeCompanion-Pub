/**
 * Loot OCR — always-on diagnostic recording buffer (issue #5).
 *
 * The scan log in the session store is a rolling 60-second UI window and is
 * intentionally dropped from persistence, so before this module a live
 * session left no per-sighting evidence to replay thresholds against. This
 * buffer records every OCR event with its full pipeline verdict; the export
 * lives in `utils/export-loot.ts` (`exportLootDiagnostics`).
 *
 * Perf constraints (2026-05-15/16 freeze lessons): the buffer is a plain
 * module-level array OUTSIDE any Svelte store — appends cause no reactive
 * cascade, no IPC, no renderer work. Hard-capped with head-drop. Cleared
 * when a new capture session starts. Zero imports on purpose: both the
 * session store and the export util pull from here, and a store import in
 * this file would close a cycle.
 */

export type RecordVerdict = "applied" | "dedup" | "outlier" | "cluster" | "gated";

export interface RecordedOcrEvent {
	ts: number;
	rawName: string;
	qty: number;
	y?: number;
	countInPass?: number;
	matchedItemId?: string;
	/** Which matcher pass resolved it: exact / prior / fragment / fuzzy. */
	via?: string;
	/** Edit distance of the match (0 = exact). */
	dist?: number;
	verdict: RecordVerdict;
}

const MAX_RECORDED_EVENTS = 50_000;
let buffer: RecordedOcrEvent[] = [];

export function recordOcrEvent(e: RecordedOcrEvent): void {
	buffer.push(e);
	if (buffer.length > MAX_RECORDED_EVENTS) {
		buffer.splice(0, buffer.length - MAX_RECORDED_EVENTS);
	}
}

export function clearRecording(): void {
	buffer = [];
}

export function recordingSize(): number {
	return buffer.length;
}

/** Read-only view for the export util. */
export function recordedEvents(): readonly RecordedOcrEvent[] {
	return buffer;
}
