/**
 * Treasure store - manages treasure item tracking, progress persistence, and stats.
 * Tracks which treasure pieces have been obtained, hours spent grinding, and completion dates.
 */

import { writable, get } from "svelte/store";
import { invoke } from "@tauri-apps/api/core";

// ============== Types ==============

export interface TreasurePiece {
	id: string;
	itemId?: number;
	name: string;
	zone: string;
	type: "grind" | "craft" | "exchange";
	image?: string;
}

export interface TreasureDefinition {
	id: string;
	name: string;
	pieces: TreasurePiece[];
}

export interface TreasuresData {
	version: number;
	treasures: TreasureDefinition[];
}

export interface PieceProgress {
	pieceId: string;
	treasureId: string;
	hoursSpent: number;
	obtained: boolean;
	obtainedDate: string | null;
}

export interface TreasureProgressData {
	pieces: PieceProgress[];
}

// ============== Data Store ==============

/** Loaded treasure definitions (null until loaded) */
export const treasureDataStore = writable<TreasuresData | null>(null);
export const treasureDataLoadingStore = writable<boolean>(true);

/** Load treasure definitions from static JSON */
export async function loadTreasureData(): Promise<void> {
	treasureDataLoadingStore.set(true);
	try {
		const response = await fetch("/data/treasures/treasures.json");
		if (!response.ok) throw new Error(`HTTP ${response.status} loading treasure data`);
		const data: TreasuresData = await response.json();
		treasureDataStore.set(data);
	} catch (error) {
		console.error("Failed to load treasure data:", error);
	} finally {
		treasureDataLoadingStore.set(false);
	}
}

// ============== Progress Store ==============

/** User's treasure progress data */
export const treasureProgressStore = writable<PieceProgress[]>([]);
export const treasureProgressLoadingStore = writable<boolean>(true);

/** Load treasure progress from disk */
export async function loadTreasureProgress(): Promise<void> {
	treasureProgressLoadingStore.set(true);
	try {
		const data = await invoke<TreasureProgressData>("load_treasure_progress");
		treasureProgressStore.set(data.pieces);
	} catch (error) {
		console.error("Failed to load treasure progress:", error);
		treasureProgressStore.set([]);
	} finally {
		treasureProgressLoadingStore.set(false);
	}
}

/** Save current treasure progress to disk */
async function saveTreasureProgress(): Promise<void> {
	try {
		const pieces = get(treasureProgressStore);
		await invoke("save_treasure_progress", { data: { pieces } });
	} catch (error) {
		console.error("Failed to save treasure progress:", error);
	}
}

// ============== Progress Helpers ==============

/** Get or create a progress entry for a piece */
function getOrCreateProgress(pieceId: string, treasureId: string): PieceProgress {
	const pieces = get(treasureProgressStore);
	const existing = pieces.find((p) => p.pieceId === pieceId);
	if (existing) return existing;
	return {
		pieceId,
		treasureId,
		hoursSpent: 0,
		obtained: false,
		obtainedDate: null,
	};
}

/** Update a piece's progress in the store */
function updatePieceProgress(pieceId: string, treasureId: string, updater: (p: PieceProgress) => PieceProgress): void {
	treasureProgressStore.update((pieces) => {
		const idx = pieces.findIndex((p) => p.pieceId === pieceId);
		if (idx >= 0) {
			const updated = [...pieces];
			updated[idx] = updater(pieces[idx]);
			return updated;
		} else {
			const newEntry = updater(getOrCreateProgress(pieceId, treasureId));
			return [...pieces, newEntry];
		}
	});
	saveTreasureProgress();
}

/** Mark a piece as obtained (records current date) */
export function markPieceObtained(pieceId: string, treasureId: string): void {
	updatePieceProgress(pieceId, treasureId, (p) => ({
		...p,
		obtained: true,
		obtainedDate: new Date().toISOString().split("T")[0],
	}));
}

/** Unmark a piece as obtained (clears date) */
export function unmarkPieceObtained(pieceId: string, treasureId: string): void {
	updatePieceProgress(pieceId, treasureId, (p) => ({
		...p,
		obtained: false,
		obtainedDate: null,
	}));
}

/** Set hours spent grinding for a piece */
export function setHoursSpent(pieceId: string, treasureId: string, hours: number): void {
	updatePieceProgress(pieceId, treasureId, (p) => ({
		...p,
		hoursSpent: Math.max(0, hours),
	}));
}
