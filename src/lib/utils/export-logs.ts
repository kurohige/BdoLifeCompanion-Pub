/**
 * Log export utilities — export grinding, crafting, and hunting session logs as CSV or JSON.
 */

import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { get } from "svelte/store";
import { grindingLogStore } from "$lib/stores/grinding";
import { craftingLogStore } from "$lib/stores/crafting-log";
import { huntingLogStore } from "$lib/stores/hunting";

function formatDuration(seconds: number): string {
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = seconds % 60;
	return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function escapeCsv(val: string): string {
	if (val.includes(",") || val.includes('"') || val.includes("\n")) {
		return `"${val.replace(/"/g, '""')}"`;
	}
	return val;
}

// ── Grinding Log Export ──

function grindingLogToCsv(): string {
	const sessions = get(grindingLogStore);
	const headers = ["Date", "Spot", "Duration", "Total Items", "Total Silver", "AP", "DP", "Loot Details"];
	const rows = sessions.map((s) => {
		const totalItems = s.loot.reduce((sum, l) => sum + l.count, 0);
		const totalSilver = s.loot.reduce((sum, l) => sum + l.count * (l.value ?? 0), 0);
		const lootStr = s.loot.map((l) => `${l.itemName}:${l.count}`).join("; ");
		return [
			s.timestamp,
			escapeCsv(s.spotName),
			formatDuration(s.durationSeconds),
			String(totalItems),
			String(totalSilver),
			String(s.ap ?? ""),
			String(s.dp ?? ""),
			escapeCsv(lootStr),
		].join(",");
	});
	return [headers.join(","), ...rows].join("\n");
}

// ── Crafting Log Export ──

function craftingLogToCsv(): string {
	const sessions = get(craftingLogStore);
	const headers = ["Date", "Recipe", "Category", "Mastery", "Crafted", "Yielded", "Can Craft"];
	const rows = sessions.map((s) => [
		s.timestamp,
		escapeCsv(s.recipeName),
		s.category,
		String(s.mastery),
		String(s.crafted),
		String(s.yielded),
		String(s.canCraft),
	].join(","));
	return [headers.join(","), ...rows].join("\n");
}

// ── Hunting Log Export ──

function huntingLogToCsv(): string {
	const sessions = get(huntingLogStore);
	const headers = ["Date", "Spot", "Duration", "Total Items", "Mastery", "Matchlock", "Knife", "Loot Details"];
	const rows = sessions.map((s) => {
		const totalItems = s.loot.reduce((sum, l) => sum + l.count, 0);
		const lootStr = s.loot.map((l) => `${l.itemName}:${l.count}`).join("; ");
		return [
			s.timestamp,
			escapeCsv(s.spotName),
			formatDuration(s.durationSeconds),
			String(totalItems),
			String(s.mastery ?? ""),
			escapeCsv(s.matchlockTier ?? ""),
			escapeCsv(s.butcheringKnife ?? ""),
			escapeCsv(lootStr),
		].join(",");
	});
	return [headers.join(","), ...rows].join("\n");
}

// ── Public export functions ──

export type LogType = "grinding" | "crafting" | "hunting";
export type ExportFormat = "csv" | "json";

export async function exportLog(logType: LogType, format: ExportFormat): Promise<{ success: boolean; count: number }> {
	let content: string;
	let count: number;
	const defaultName = `bdo_${logType}_log`;

	if (logType === "grinding") {
		const sessions = get(grindingLogStore);
		count = sessions.length;
		content = format === "csv" ? grindingLogToCsv() : JSON.stringify(sessions, null, 2);
	} else if (logType === "crafting") {
		const sessions = get(craftingLogStore);
		count = sessions.length;
		content = format === "csv" ? craftingLogToCsv() : JSON.stringify(sessions, null, 2);
	} else {
		const sessions = get(huntingLogStore);
		count = sessions.length;
		content = format === "csv" ? huntingLogToCsv() : JSON.stringify(sessions, null, 2);
	}

	if (count === 0) return { success: false, count: 0 };

	const ext = format === "csv" ? "csv" : "json";
	const filePath = await save({
		defaultPath: `${defaultName}.${ext}`,
		filters: [
			format === "csv"
				? { name: "CSV Files", extensions: ["csv"] }
				: { name: "JSON Files", extensions: ["json"] },
		],
	});

	if (!filePath) return { success: false, count };

	await writeTextFile(filePath, content);
	return { success: true, count };
}
