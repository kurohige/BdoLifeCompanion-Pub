/**
 * Loot OCR — line-stability gate for unmatched reads (issue #2).
 *
 * BDO's loot lines fade in/out; frames captured mid-fade OCR half-rendered
 * glyphs into one-off garbage ("WélfBiéöd", "raityßtreath") that fails the
 * catalog match. Before this gate, every such variant became its own session
 * row. The gate holds the FIRST sighting of an unmatched normalized text in a
 * pending buffer; only a second sighting of the *identical* normalized text
 * within the window confirms it and releases both counts (retro-credit — a
 * stable-but-unknown name, i.e. an item genuinely missing from the catalog,
 * loses nothing). Fade garbage almost never repeats byte-identically, so
 * one-off variants are suppressed at the source.
 *
 * Deliberately NOT applied to matched reads (they were never the spam source
 * and delaying them would fight the dedup-window timing), and NOT applied
 * once a raw row for the text already exists (the row's own accumulation +
 * dedup take over from there).
 *
 * WINDOW_MS is generous (60 s): the cost of a long window is zero for
 * garbage (it doesn't repeat regardless), while a short window would make a
 * rare unknown item that drops once a minute confirm never instead of late.
 */

export interface StabilityCredit {
	/** Total drop to apply now: the stashed first sighting plus the confirming one. */
	credit: number;
	/** Timestamp of the stashed first sighting — use as the row's firstSeenAt. */
	firstTs: number;
}

interface PendingRead {
	drop: number;
	firstTs: number;
	lastTs: number;
}

const WINDOW_MS = 60_000;
const MAX_PENDING = 300;

export class StabilityGate {
	private pending = new Map<string, PendingRead>();

	/**
	 * Offer an unmatched read. Returns `null` when the read was stashed as a
	 * first sighting (caller must NOT update the row), or a credit when a prior
	 * sighting confirmed it (caller applies `credit` as the row increment).
	 */
	offer(normKey: string, drop: number, ts: number): StabilityCredit | null {
		const existing = this.pending.get(normKey);
		if (existing && ts - existing.lastTs <= WINDOW_MS) {
			this.pending.delete(normKey);
			return { credit: existing.drop + drop, firstTs: existing.firstTs };
		}
		// Expired entry (if any) is replaced — its stashed count is dropped,
		// which is the point: it never repeated inside the window.
		this.pending.set(normKey, { drop, firstTs: ts, lastTs: ts });
		this.prune(ts);
		return null;
	}

	private prune(now: number): void {
		if (this.pending.size <= MAX_PENDING) return;
		for (const [key, entry] of this.pending) {
			if (now - entry.lastTs > WINDOW_MS) this.pending.delete(key);
			if (this.pending.size <= MAX_PENDING) return;
		}
		// Still over cap with nothing expired (burst): drop oldest first.
		const excess = this.pending.size - MAX_PENDING;
		const keys = [...this.pending.entries()]
			.sort((a, b) => a[1].lastTs - b[1].lastTs)
			.slice(0, excess)
			.map(([k]) => k);
		for (const k of keys) this.pending.delete(k);
	}

	get size(): number {
		return this.pending.size;
	}

	clear(): void {
		this.pending.clear();
	}
}
