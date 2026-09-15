/**
 * Loot OCR — finalized session logs store.
 *
 * Pure in-memory list; persistence wires up in Phase 4.
 */

import { writable, get } from "svelte/store";
import type { CaptureLog } from "$lib/models/loot";

export const lootLogsStore = writable<CaptureLog[]>([]);
export const lootLogsLoadingStore = writable<boolean>(true);

/** Prepend a new log so the list is newest-first. */
export function addLootLog(log: CaptureLog): void {
	lootLogsStore.update((l) => [log, ...l]);
}

export function deleteLootLog(id: string): void {
	lootLogsStore.update((l) => l.filter((x) => x.id !== id));
}

export function renameLootLog(id: string, label: string): void {
	lootLogsStore.update((l) => l.map((x) => (x.id === id ? { ...x, label } : x)));
}

export function clearLootLogs(): void {
	lootLogsStore.set([]);
}

export function getLootLog(id: string): CaptureLog | undefined {
	return get(lootLogsStore).find((x) => x.id === id);
}

/** Mark a log as merged into inventory (now, or at the given timestamp). */
export function setLootLogMergedAt(id: string, ts: number): void {
	lootLogsStore.update((l) => l.map((x) => (x.id === id ? { ...x, mergedAt: ts } : x)));
}
