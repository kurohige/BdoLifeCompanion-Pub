/**
 * Loot OCR — export the current capture session to a plain-text file the user
 * picks via the OS save dialog. Mirrors the `export-logs.ts` pattern but writes
 * a human-readable layout (not CSV/JSON) so the file can be pasted into chat
 * for parser-noise discussion.
 */

import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { get } from "svelte/store";

import { captureSessionStore } from "$lib/stores/loot-session";
import { lootSettingsStore } from "$lib/stores/loot-settings";
import { recordedEvents, recordingSize } from "$lib/services/loot-recording";
import type {
	CapturedRow,
	CaptureLog,
	CaptureSession,
	Region,
} from "$lib/models/loot";

function pad2(n: number): string {
	return String(n).padStart(2, "0");
}

function formatTimestamp(ms: number): string {
	const d = new Date(ms);
	return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

function formatFilenameStamp(ms: number): string {
	const d = new Date(ms);
	return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}_${pad2(d.getHours())}-${pad2(d.getMinutes())}-${pad2(d.getSeconds())}`;
}

function formatElapsed(seconds: number): string {
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = seconds % 60;
	return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
}

function formatRegion(r: Region | null): string {
	if (!r) return "(none)";
	const pct = (v: number) => `${Math.round(v * 100)}%`;
	return `x=${r.x.toFixed(4)} y=${r.y.toFixed(4)} w=${r.w.toFixed(4)} h=${r.h.toFixed(4)}  (${pct(r.x)} ${pct(r.y)} → ${pct(r.x + r.w)} ${pct(r.y + r.h)})`;
}

function indicator(row: CapturedRow): string {
	if (row.edited) return "✎";
	if (row.matchedItemId) return "✓";
	return "?";
}

function sourceLabel(row: CapturedRow): string {
	return row.matchedSource ?? "raw";
}

function padRight(s: string, width: number): string {
	if (s.length >= width) return s;
	return s + " ".repeat(width - s.length);
}

/**
 * Build the text body. Pure function so it's easy to unit-test if we ever add tests.
 * - Header (session id, label, started, elapsed, region, scan params)
 * - Summary (rows, matched / unmatched, total qty)
 * - Sorted row table (newest first; matches the on-screen order)
 */
export function buildLootExportText(
	session: CaptureSession,
	scanParams: { freqHz: number; minConfidence: number },
): string {
	const sortedRows = [...session.rows].sort((a, b) => b.lastSeenAt - a.lastSeenAt);
	const totalQty = sortedRows.reduce((n, r) => n + r.count, 0);
	const matched = sortedRows.filter((r) => r.matchedItemId);
	const unmatched = sortedRows.filter((r) => !r.matchedItemId);
	const matchedQty = matched.reduce((n, r) => n + r.count, 0);
	const unmatchedQty = unmatched.reduce((n, r) => n + r.count, 0);

	const lines: string[] = [];
	lines.push("BDO Life Companion — Loot OCR Capture");
	lines.push("=======================================");
	lines.push("");
	lines.push(`Session ID:  ${session.id}`);
	lines.push(`Label:       ${session.label ?? "(untitled)"}`);
	lines.push(`Started:     ${formatTimestamp(session.startedAt)}`);
	lines.push(`Elapsed:     ${formatElapsed(session.elapsedSeconds)}`);
	lines.push(`Region:      ${formatRegion(session.region)}`);
	lines.push(`Scan:        ${scanParams.freqHz.toFixed(1)} Hz · min-conf ${scanParams.minConfidence.toFixed(2)}`);
	lines.push("");
	lines.push("Summary");
	lines.push("-------");
	lines.push(`Rows:           ${sortedRows.length}`);
	lines.push(`Matched:        ${matched.length} / ${sortedRows.length}`);
	lines.push(`Total qty:      ${totalQty}`);
	lines.push(`Matched qty:    ${matchedQty}`);
	lines.push(`Unmatched qty:  ${unmatchedQty}`);
	lines.push("");
	lines.push("Rows (newest first)");
	lines.push("-------------------");
	lines.push("Legend:  ✓ matched   ? unmatched   ✎ edited");
	lines.push("");

	if (sortedRows.length === 0) {
		lines.push("(empty)");
	} else {
		// Fixed-width columns so the file lines up in a monospace editor.
		const nameWidth = Math.min(
			48,
			Math.max(20, sortedRows.reduce((w, r) => Math.max(w, r.displayName.length), 0)),
		);
		const sourceWidth = 10; // longest is "gathering"
		for (const r of sortedRows) {
			const namePart = padRight(r.displayName, nameWidth);
			const sourcePart = padRight(sourceLabel(r), sourceWidth);
			const qty = `×${r.count}`;
			const rawSuffix =
				r.rawName && r.rawName !== r.displayName ? `   (raw: "${r.rawName}")` : "";
			const editedTag = r.edited ? "   [edited]" : "";
			const noteSuffix = r.note ? `   (note: ${r.note})` : "";
			lines.push(`${indicator(r)}  ${sourcePart}  ${namePart}  ${qty}${rawSuffix}${editedTag}${noteSuffix}`);
		}
	}

	lines.push("");
	lines.push("End of capture.");
	lines.push("");
	return lines.join("\n");
}

export interface ExportLootResult {
	status: "saved" | "cancelled" | "empty";
	path?: string;
	rowCount: number;
}

/**
 * Open the OS save dialog and write the current session as a `.txt` file.
 * - `cancelled`: user dismissed the dialog.
 * - `empty`: there is no session or the session has zero rows.
 * - `saved`: file was written; `path` is the chosen location.
 */
export async function exportLootCurrent(): Promise<ExportLootResult> {
	const session = get(captureSessionStore);
	if (!session || session.rows.length === 0) {
		return { status: "empty", rowCount: 0 };
	}

	const settings = get(lootSettingsStore);
	const content = buildLootExportText(session, {
		freqHz: settings.freqHz,
		minConfidence: settings.minConfidence,
	});

	const defaultName = `bdo_loot_${formatFilenameStamp(session.startedAt)}.txt`;
	const filePath = await save({
		defaultPath: defaultName,
		filters: [{ name: "Text Files", extensions: ["txt"] }],
	});

	if (!filePath) {
		return { status: "cancelled", rowCount: session.rows.length };
	}

	await writeTextFile(filePath, content);
	return { status: "saved", path: filePath, rowCount: session.rows.length };
}

/**
 * Same as `exportLootCurrent` but writes a finalized log. Logs have no
 * `elapsedSeconds`, so we derive it from `endedAt - startedAt`; freq/conf are
 * snapshots from the time the log was saved, so we pass the current settings
 * (good enough — they're informational in the export).
 */
export async function exportLootLog(log: CaptureLog): Promise<ExportLootResult> {
	if (log.rows.length === 0) {
		return { status: "empty", rowCount: 0 };
	}

	const settings = get(lootSettingsStore);
	const elapsedSeconds = Math.max(0, Math.floor((log.endedAt - log.startedAt) / 1000));
	const synthetic: CaptureSession = {
		id: log.id,
		startedAt: log.startedAt,
		endedAt: log.endedAt,
		running: false,
		elapsedSeconds,
		region: null,
		rows: log.rows,
		scanLog: [],
		label: log.label,
	};
	const content = buildLootExportText(synthetic, {
		freqHz: settings.freqHz,
		minConfidence: settings.minConfidence,
	});

	const defaultName = `bdo_loot_${formatFilenameStamp(log.startedAt)}.txt`;
	const filePath = await save({
		defaultPath: defaultName,
		filters: [{ name: "Text Files", extensions: ["txt"] }],
	});

	if (!filePath) {
		return { status: "cancelled", rowCount: log.rows.length };
	}

	await writeTextFile(filePath, content);
	return { status: "saved", path: filePath, rowCount: log.rows.length };
}

// ============== Diagnostics export (issue #5) ==============

export interface ExportDiagnosticsResult {
	status: "saved" | "cancelled" | "empty";
	path?: string;
	eventCount: number;
}

/**
 * Write the per-sighting recording buffer plus enough context to replay it
 * (settings, region, final rows) as JSON via the OS save dialog. This is the
 * corpus every dedup/matcher threshold gets validated against — export it
 * after any validation session, especially a bad one.
 */
export async function exportLootDiagnostics(): Promise<ExportDiagnosticsResult> {
	if (recordingSize() === 0) {
		return { status: "empty", eventCount: 0 };
	}
	const session = get(captureSessionStore);
	const settings = get(lootSettingsStore);

	const payload = {
		exportedAt: Date.now(),
		settings,
		session: session
			? {
					id: session.id,
					label: session.label ?? null,
					startedAt: session.startedAt,
					elapsedSeconds: session.elapsedSeconds,
					region: session.region,
					rows: session.rows,
				}
			: null,
		events: recordedEvents(),
	};

	const filePath = await save({
		defaultPath: `bdo_loot_diagnostics_${formatFilenameStamp(Date.now())}.json`,
		filters: [{ name: "JSON Files", extensions: ["json"] }],
	});
	if (!filePath) {
		return { status: "cancelled", eventCount: recordingSize() };
	}
	await writeTextFile(filePath, JSON.stringify(payload));
	return { status: "saved", path: filePath, eventCount: recordingSize() };
}
