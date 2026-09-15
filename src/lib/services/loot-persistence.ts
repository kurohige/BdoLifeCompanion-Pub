/**
 * Loot OCR — Rust IPC wrappers.
 *
 * Thin `invoke()` shells around the eleven Rust commands registered in
 * `src-tauri/src/lib.rs`. Each function trusts the Rust side's JSON shape;
 * `loot-init.ts` does the schema validation when loading from disk.
 */

import { invoke } from "@tauri-apps/api/core";
import type {
	CaptureLog,
	CaptureSession,
	LootSettings,
	OcrEvent,
	Region,
} from "$lib/models/loot";

// ============== Persisted state ==============

export async function loadLootSettingsFromDisk(): Promise<unknown> {
	return invoke<unknown>("load_loot_settings");
}

export async function saveLootSettingsToDisk(settings: LootSettings): Promise<void> {
	await invoke("save_loot_settings", { settings });
}

export async function loadLootCurrentFromDisk(): Promise<unknown> {
	return invoke<unknown>("load_loot_current");
}

export async function saveLootCurrentToDisk(
	session: CaptureSession | null,
): Promise<void> {
	await invoke("save_loot_current", { session });
}

export async function loadLootLogsFromDisk(): Promise<unknown> {
	return invoke<unknown>("load_loot_log");
}

export async function saveLootLogsToDisk(logs: CaptureLog[]): Promise<void> {
	await invoke("save_loot_log", { logs });
}

// ============== OCR pipeline ==============

export interface CapturedFramePayload {
	pngBase64: string;
	width: number;
	height: number;
	monitorId: string;
}

export async function captureFullScreenRust(
	monitorId?: string,
): Promise<CapturedFramePayload> {
	return invoke<CapturedFramePayload>("loot_capture_full_screen", {
		monitorId: monitorId ?? null,
	});
}

export async function testOcrRust(
	region: Region,
	colorMask: boolean,
	upscaleFactor: number,
): Promise<OcrEvent[]> {
	return invoke<OcrEvent[]>("loot_test_ocr", { region, colorMask, upscaleFactor });
}

export async function startScanRust(
	region: Region,
	freqHz: number,
	minConfidence: number,
	strictMode: boolean,
	colorMask: boolean,
	upscaleFactor: number,
	temporalFrames: number,
): Promise<void> {
	await invoke("loot_start_scan", {
		region,
		freqHz,
		minConfidence,
		strictMode,
		colorMask,
		upscaleFactor,
		temporalFrames,
	});
}

export async function stopScanRust(): Promise<void> {
	await invoke("loot_stop_scan");
}
