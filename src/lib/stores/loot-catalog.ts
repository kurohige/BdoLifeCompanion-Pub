/**
 * Loot OCR — unified catalog store.
 *
 * Wraps the OCR matcher: loads the catalog once at startup and caches both the
 * full entry list (for browsing in the row-link autocomplete) and an exact-name
 * index (for the hot path in `applyOcrEvent`). Callers retrieve the index via
 * `getLootExactIndex()` rather than subscribing — it's static after init.
 */

import { writable } from "svelte/store";
import {
	buildUnifiedCatalog,
	buildExactIndex,
	type CatalogEntry,
} from "$lib/services/ocr-matcher";
import type { MatchSource } from "$lib/models/loot";

export const lootCatalogStore = writable<CatalogEntry[]>([]);
export const lootCatalogLoadingStore = writable<boolean>(true);

let exactIndex: Map<string, CatalogEntry> = new Map();
let byIdIndex: Map<string, CatalogEntry> = new Map();
let qtyHints: Map<string, number> = new Map();

/**
 * Per-item max plausible single-popup qty, from `static/data/loot/qty-hints.json`
 * (user-tunable). Consumed by `isQtyOutlier` in loot-session — a read above the
 * hint is rejected outright, closing the mid-range misread band that sits under
 * the global outlier floor. Undefined = no hint for this item.
 */
export function getQtyHint(itemId: string): number | undefined {
	return qtyHints.get(itemId);
}

/** Returns the cached exact-match index. Empty Map until `loadLootCatalog()` resolves. */
export function getLootExactIndex(): Map<string, CatalogEntry> {
	return exactIndex;
}

/** Look up the catalog entry that a `CapturedRow` references. */
export function getCatalogEntry(
	source: MatchSource | undefined,
	itemId: string | undefined,
): CatalogEntry | undefined {
	if (!source || !itemId) return undefined;
	return byIdIndex.get(`${source}:${itemId}`);
}

export async function loadLootCatalog(): Promise<void> {
	lootCatalogLoadingStore.set(true);
	try {
		const catalog = await buildUnifiedCatalog();
		lootCatalogStore.set(catalog);
		exactIndex = buildExactIndex(catalog);
		byIdIndex = new Map(catalog.map((e) => [`${e.source}:${e.id}`, e]));
	} catch (error) {
		console.error("Failed to build loot catalog:", error);
	} finally {
		lootCatalogLoadingStore.set(false);
	}
	// Qty hints are optional tuning data — a missing/broken file must never
	// block the catalog, so this load is separate and failure-tolerant.
	try {
		const res = await fetch("/data/loot/qty-hints.json");
		if (res.ok) {
			const data = (await res.json()) as { hints?: Record<string, number> };
			qtyHints = new Map(Object.entries(data.hints ?? {}));
		}
	} catch {
		qtyHints = new Map();
	}
}
