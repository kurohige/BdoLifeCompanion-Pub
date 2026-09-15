<!--
	Loot OCR · TRACK sub-tab.

	Live-session ledger: hero block with scanning pulse + total qty, source-coded
	row rail (in lieu of tier rail — we don't have per-item tier data), inline
	row edits + link-to-catalog popover, footer total, and the action row
	(PAUSE / EXPORT / LOG / RESET). Mirrors the handoff's TRACK layout minus the
	silver/sparkline/price columns which are scoped to a future pass.
-->
<script lang="ts">
	import {
		captureSessionStore,
		pauseCaptureSession,
		resumeCaptureSession,
		finalizeCaptureSession,
		mergeMatchedRowsToInventory,
		resetCaptureSession,
		renameRow,
		setRowCount,
		setRowNote,
		addManualRow,
		deleteRow,
		linkRowToItem,
		unlinkRow,
		lootSettingsStore,
		lootFocusInGameStore,
		lootCatalogStore,
		lootHideUnmatchedStore,
		lootSourceFilterStore,
		lootScanLogFilterStore,
		lootScanLogGroupedStore,
		lootSubTabStore,
		lootLogDetailIdStore,
		setLootLogMergedAt,
		type CatalogEntry,
	} from "$lib/stores";
	import { startScanRust, stopScanRust } from "$lib/services/loot-persistence";
	import { diagLog } from "$lib/services/loot-diagnostic";
	import { exportLootCurrent, exportLootDiagnostics } from "$lib/utils/export-loot";
	import { recordingSize } from "$lib/services/loot-recording";
	import { showToast } from "$lib/stores/toast";
	import { clearScanLog } from "$lib/stores/loot-session";
	import { normalizeForMatch, type CapturedRow, type MatchSource } from "$lib/models/loot";
	import { railClass, sourceLabel } from "$lib/utils/loot-format";
	import { m } from "$lib/paraglide/messages";
	import { Button } from "$lib/components/ui";
	import LootLedgerRow from "./LootLedgerRow.svelte";

	// ============== Local UI state ==============
	let editingKey = $state<string | null>(null);
	let editName = $state("");
	let editCount = $state(0);
	let editNote = $state("");
	let linkQuery = $state("");
	let linkOpen = $state(false);
	let confirmingReset = $state(false);
	let exporting = $state(false);
	// Pass 7.1 — "+ ADD" manual-row pane
	let addOpen = $state(false);
	let addQuery = $state("");
	// R1.4 — two-step scan-log clear
	let confirmingClearLog = $state(false);
	// R1.5 — expanded groups in the grouped scan-log view (ephemeral by design)
	let expandedGroups = $state<Record<string, boolean>>({});

	// ============== Derived ==============
	const session = $derived($captureSessionStore);
	const settings = $derived($lootSettingsStore);
	const region = $derived(settings.region);
	const isRunning = $derived(session?.running === true);
	const hasSession = $derived(session !== null);
	const elapsedFormatted = $derived(formatElapsed(session?.elapsedSeconds ?? 0));
	const focusInGame = $derived($lootFocusInGameStore);
	const hideUnmatched = $derived($lootHideUnmatchedStore);

	const sortedRows = $derived.by(() => {
		if (!session) return [];
		return [...session.rows].sort((a, b) => b.lastSeenAt - a.lastSeenAt);
	});

	// Scan log — most recent at top so the user's eye lands on the latest event
	// without scrolling. Capped at the last 200 entries in the UI even though
	// the in-memory log can hold up to MAX_SCAN_LOG_ENTRIES — DOM rendering
	// thousands of rows at 6 Hz refresh starves the GPU.
	const SCAN_LOG_DISPLAY_CAP = 200;
	const scanLogFilter = $derived($lootScanLogFilterStore);
	const scanLogGrouped = $derived($lootScanLogGroupedStore);
	const recentScanLog = $derived.by(() => {
		if (!session) return [];
		let log = session.scanLog;
		if (scanLogFilter === "matched") log = log.filter((e) => e.matchedItemId);
		else if (scanLogFilter === "raw") log = log.filter((e) => !e.matchedItemId);
		if (log.length <= SCAN_LOG_DISPLAY_CAP) return [...log].reverse();
		return log.slice(-SCAN_LOG_DISPLAY_CAP).reverse();
	});

	// R1.5 — grouped view: one group per item (matched id, else raw name),
	// newest-first inside each group, groups ordered by most recent event.
	const groupedScanLog = $derived.by(() => {
		type Group = { key: string; name: string; source: MatchSource | undefined; total: number; entries: typeof recentScanLog };
		const map = new Map<string, Group>();
		for (const e of recentScanLog) {
			const key = e.matchedItemId ? `m:${e.matchedItemId}` : `r:${e.rawName}`;
			let g = map.get(key);
			if (!g) {
				g = { key, name: e.matchedDisplayName ?? e.rawName, source: e.matchedSource, total: 0, entries: [] };
				map.set(key, g);
			}
			g.total += e.qty;
			g.entries.push(e);
		}
		return [...map.values()];
	});

	function fmtClock(ts: number): string {
		const d = new Date(ts);
		const hh = String(d.getHours()).padStart(2, "0");
		const mm = String(d.getMinutes()).padStart(2, "0");
		const ss = String(d.getSeconds()).padStart(2, "0");
		return `${hh}:${mm}:${ss}`;
	}

	// Pass 7.2 — source filter chips. Empty selection = no filter; otherwise only
	// the selected sources are shown (raw rows hidden while a filter is active).
	const ALL_SOURCES: MatchSource[] = ["grinding", "recipe", "gathering", "hunting", "barter", "treasure"];
	const sourceFilter = $derived($lootSourceFilterStore);

	const visibleRows = $derived.by(() => {
		let rows = sortedRows;
		if (hideUnmatched) rows = rows.filter((r) => r.matchedItemId);
		if (sourceFilter.length > 0) {
			rows = rows.filter((r) => r.matchedSource && sourceFilter.includes(r.matchedSource));
		}
		return rows;
	});

	function toggleSourceChip(s: MatchSource) {
		lootSourceFilterStore.update((cur) =>
			cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s],
		);
	}

	/**
	 * Sources actually present in this session. The legend names only these —
	 * a colour key for six sources when the session contains two is noise, and
	 * filtering by a source with no rows does nothing.
	 */
	const presentSources = $derived.by(() => {
		const seen = new Set<MatchSource>();
		for (const r of sortedRows) if (r.matchedSource) seen.add(r.matchedSource);
		return ALL_SOURCES.filter((s) => seen.has(s));
	});

	/**
	 * How many events the diagnostic recorder is holding.
	 *
	 * Deliberately gated on the recording buffer rather than on `hasSession`:
	 * `resetCaptureSession` drops the session but keeps the buffer, and
	 * exporting right after a reset is a large part of why this button exists.
	 *
	 * `recordingSize()` is not reactive on purpose — `loot-recording.ts` keeps
	 * the buffer outside any store so per-event appends cause no reactive
	 * cascade (a 2026-05 freeze lesson; do not turn it into a store). It is
	 * written from `applyOcrEvent`, which updates the session store in the same
	 * call, so re-reading it whenever the session changes tracks it closely
	 * without adding anything to the hot path.
	 */
	const recordedEventCount = $derived.by(() => {
		void $captureSessionStore;
		return recordingSize();
	});

	const totalCount = $derived(sortedRows.reduce((n, r) => n + r.count, 0));
	const matchedCount = $derived(sortedRows.filter((r) => r.matchedItemId).length);
	const hiddenCount = $derived(sortedRows.length - visibleRows.length);

	const linkResults = $derived.by(() => {
		const q = normalizeForMatch(linkQuery);
		if (!q || q.length < 2) return [];
		const catalog = $lootCatalogStore;
		const out: CatalogEntry[] = [];
		for (const e of catalog) {
			if (e.normalized.includes(q)) {
				out.push(e);
				if (out.length >= 12) break;
			}
		}
		return out;
	});

	// Pass 7.1 — same lookup for the "+ ADD" pane
	const addResults = $derived.by(() => {
		const q = normalizeForMatch(addQuery);
		if (!q || q.length < 2) return [];
		const catalog = $lootCatalogStore;
		const out: CatalogEntry[] = [];
		for (const e of catalog) {
			if (e.normalized.includes(q)) {
				out.push(e);
				if (out.length >= 12) break;
			}
		}
		return out;
	});

	function handleAddItem(entry: CatalogEntry) {
		addManualRow(entry.id, entry.source, entry.name);
		addOpen = false;
		addQuery = "";
	}

	// R1.4 — two-step scan-log clear (same pattern as reset)
	function handleClearScanLog() {
		if (!confirmingClearLog) {
			confirmingClearLog = true;
			setTimeout(() => { confirmingClearLog = false; }, 3000);
			return;
		}
		confirmingClearLog = false;
		clearScanLog();
	}

	function toggleGroup(key: string) {
		expandedGroups = { ...expandedGroups, [key]: !expandedGroups[key] };
	}

	const iconById = $derived.by(() => {
		const m = new Map<string, string>();
		for (const e of $lootCatalogStore) {
			if (e.iconPath) m.set(`${e.source}:${e.id}`, e.iconPath);
		}
		return m;
	});

	// ============== Helpers ==============
	function formatElapsed(s: number): string {
		const h = Math.floor(s / 3600);
		const min = Math.floor((s % 3600) / 60);
		const sec = s % 60;
		return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
	}

	function rowIcon(r: CapturedRow): string | undefined {
		if (!r.matchedSource || !r.matchedItemId) return undefined;
		return iconById.get(`${r.matchedSource}:${r.matchedItemId}`);
	}

	// ============== Scan lifecycle ==============
	async function handleStart() {
		if (!region) return;
		try {
			await startScanRust(
				region,
				settings.freqHz,
				settings.minConfidence,
				settings.strictMode,
				settings.colorMask,
				settings.upscaleFactor,
				settings.temporalFrames,
			);
			if (session) resumeCaptureSession();
		} catch (e) {
			console.error("Failed to start scan:", e);
		}
	}

	async function handleStop() {
		// Pause the UI store FIRST so the user sees feedback even if WebView2's
		// IPC channel is saturated (the freeze-on-pause root cause: scanner
		// events flooding the channel can delay the stopScanRust ack arbitrarily).
		// applyOcrEvent's `!session.running` early-return drops any in-flight
		// events that arrive after this pause but before Rust acks the stop.
		diagLog("USER", "pause_clicked (LootTrack)");
		pauseCaptureSession();
		try {
			await stopScanRust();
			diagLog("USER", "stopScanRust ack received");
		} catch (e) {
			console.error("Failed to stop scan:", e);
			diagLog("USER", `stopScanRust threw: ${String(e)}`);
		}
	}

	async function handleSave() {
		pauseCaptureSession();
		try {
			await stopScanRust();
		} catch (e) {
			console.warn("stopScanRust during save failed:", e);
		}
		const log = finalizeCaptureSession();
		if (log) {
			lootLogDetailIdStore.set(log.id);
			lootSubTabStore.set("logs");
			let itemsMerged = 0;
			if ($lootSettingsStore.inventoryMergeOnSave) {
				itemsMerged = mergeMatchedRowsToInventory(log.rows).itemsMerged;
				if (itemsMerged > 0) {
					setLootLogMergedAt(log.id, Date.now());
				}
			}
			const msg =
				itemsMerged > 0
					? m.loot_toast_logged_and_merged({ count: log.rows.length, merged: itemsMerged })
					: m.loot_toast_logged({ count: log.rows.length });
			showToast(msg, "success");
		}
	}

	async function handleExport() {
		if (exporting) return;
		exporting = true;
		try {
			const result = await exportLootCurrent();
			if (result.status === "saved") {
				showToast(m.loot_toast_export_success({ count: result.rowCount }), "success");
			} else if (result.status === "empty") {
				showToast(m.loot_toast_export_empty(), "info");
			}
		} catch (e) {
			showToast(m.loot_toast_export_fail({ error: String(e) }), "error", 5000);
		} finally {
			exporting = false;
		}
	}

	async function handleExportDiagnostics() {
		if (exporting) return;
		exporting = true;
		try {
			const result = await exportLootDiagnostics();
			if (result.status === "saved") {
				showToast(m.loot_toast_diag_success({ count: result.eventCount }), "success");
			} else if (result.status === "empty") {
				showToast(m.loot_toast_diag_empty(), "info");
			}
		} catch (e) {
			showToast(m.loot_toast_export_fail({ error: String(e) }), "error", 5000);
		} finally {
			exporting = false;
		}
	}

	async function handleReset() {
		if (!confirmingReset) {
			confirmingReset = true;
			setTimeout(() => { confirmingReset = false; }, 3000);
			return;
		}
		confirmingReset = false;
		pauseCaptureSession();
		try {
			await stopScanRust();
		} catch (e) {
			console.warn("stopScanRust during reset failed:", e);
		}
		resetCaptureSession();
	}

	// ============== Row editing ==============
	function beginEdit(r: CapturedRow) {
		editingKey = r.key;
		editName = r.displayName;
		editCount = r.count;
		editNote = r.note ?? "";
		linkQuery = "";
		linkOpen = false;
	}

	function commitEdit() {
		if (!editingKey) return;
		const cur = session?.rows.find((r) => r.key === editingKey);
		if (cur) {
			if (editName.trim() && editName !== cur.displayName) renameRow(editingKey, editName);
			if (editCount !== cur.count) setRowCount(editingKey, editCount);
			if (editNote.trim() !== (cur.note ?? "")) setRowNote(editingKey, editNote);
		}
		editingKey = null;
		linkOpen = false;
	}

	function cancelEdit() {
		editingKey = null;
		linkOpen = false;
	}

	function handleLink(entry: CatalogEntry) {
		if (!editingKey) return;
		linkRowToItem(editingKey, entry.id, entry.source, entry.name);
		editingKey = null;
		linkOpen = false;
		linkQuery = "";
	}
</script>

<div class="loot-pane">
	<!-- ========== HERO ========== -->
	<!-- dot 14 | figure block 1fr | Rows | Matched | Elapsed -->
	<div class="loot-hero">
		<span class="loot-hero-pulse-wrap">
			<span class="loot-hero-dot" class:loot-hero-dot-idle={!isRunning}></span>
			{#if isRunning}
				<span class="loot-hero-pulse-ring"></span>
			{/if}
		</span>

		<div class="loot-hero-text">
			<div class="loot-hero-state" class:loot-hero-state-idle={!isRunning}>
				{#if isRunning}
					{focusInGame ? m.loot_state_scanning() : m.loot_focus_warn_title()}
				{:else if hasSession}
					{m.loot_state_paused()}
				{:else}
					{m.loot_state_idle()}
				{/if}
			</div>
			<div class="loot-hero-total">{totalCount.toLocaleString("en-US").replace(/,/g, " ")}</div>
			<div class="loot-hero-totlabel">{m.loot_hero_items_this_session()}</div>
		</div>

		<div class="loot-hero-stat">
			<span class="loot-hero-stat-label">{m.loot_meta_rows()}</span>
			<span class="loot-hero-stat-value">{sortedRows.length}</span>
		</div>
		<div class="loot-hero-stat">
			<span class="loot-hero-stat-label">{m.loot_meta_matched()}</span>
			<span class="loot-hero-stat-value">
				{matchedCount}<span class="loot-hero-stat-of"> / {sortedRows.length}</span>
			</span>
		</div>
		<div class="loot-hero-stat">
			<span class="loot-hero-stat-label">{m.loot_hero_elapsed()}</span>
			<span class="loot-hero-stat-value">{elapsedFormatted}</span>
		</div>
	</div>

	<!-- Row actions, handed to the shared ledger row. LOGS passes none. -->
	{#snippet actions(r: CapturedRow)}
		<button class="loot-row-btn" title={m.loot_row_btn_edit()} onclick={() => beginEdit(r)}>✎</button>
		{#if r.matchedItemId}
			<button class="loot-row-btn" title={m.loot_row_btn_unlink()} onclick={() => unlinkRow(r.key)}>⊘</button>
		{/if}
		<button class="loot-row-btn loot-row-danger" title={m.loot_row_btn_delete()} onclick={() => deleteRow(r.key)}>×</button>
	{/snippet}

	<!-- ========== LEDGER ========== -->
	<!-- ind 24 | icon 26 | name 1fr | count 78 | actions 76 -->
	<div class="loot-ledger">
		<div class="loot-ledger-header">
			<span></span>
			<span></span>
			<span>{m.loot_ledger_col_item()}</span>
			<span class="loot-ledger-header-count">{m.loot_ledger_col_count()}</span>
			<button
				type="button"
				class="loot-ledger-header-toggle"
				class:loot-ledger-header-toggle-active={hideUnmatched}
				onclick={() => lootHideUnmatchedStore.set(!hideUnmatched)}
				title={m.loot_filter_hide_unmatched()}
			>
				{hideUnmatched ? m.loot_filter_showing_matched() : m.loot_filter_hide_unmatched()}
			</button>
		</div>

		<!-- Source legend — one chip per source present in this session. This is
		     the deleted chip strip's only real job: saying what the rail colours
		     mean. The chips stay interactive (they are also the source filter
		     that already shipped); clicking one narrows the ledger. -->
		{#if presentSources.length > 0}
			<div class="loot-source-legend">
				{#each presentSources as s (s)}
					<button
						type="button"
						class="loot-source-legend-chip {railClass(s)}"
						class:loot-source-legend-chip-active={sourceFilter.includes(s)}
						onclick={() => toggleSourceChip(s)}
					>
						<span class="loot-source-dot"></span>{sourceLabel(s)}
					</button>
				{/each}
			</div>
		{/if}

		<div class="loot-ledger-body">
			{#if sortedRows.length === 0}
				<div class="loot-ledger-empty">
					{#if !region}
						{m.loot_rows_no_region()}
					{:else if !hasSession}
						{m.loot_rows_idle()}
					{:else if isRunning}
						{m.loot_rows_waiting()}
					{:else}
						{m.loot_rows_idle()}
					{/if}
				</div>
			{:else if visibleRows.length === 0}
				<div class="loot-ledger-empty">{m.loot_filter_no_matched()}</div>
			{:else}
				{#each visibleRows as r, idx (r.key)}
					<LootLedgerRow row={r} alt={idx % 2 === 1} icon={rowIcon(r)} {actions} />

					{#if editingKey === r.key}
						<div class="loot-row-edit-pane">
							<div class="grid grid-cols-[1fr_auto] gap-2">
								<input type="text" class="loot-input" bind:value={editName} placeholder={m.loot_edit_name_placeholder()} />
								<input type="number" class="loot-input w-20 text-right font-mono" min="0" bind:value={editCount} />
							</div>
							<input
								type="text"
								class="loot-input"
								placeholder={m.loot_edit_note_placeholder()}
								bind:value={editNote}
							/>
							<input
								type="text"
								class="loot-input"
								placeholder={m.loot_edit_link_placeholder()}
								bind:value={linkQuery}
								onfocus={() => (linkOpen = true)}
							/>
							{#if linkOpen && linkResults.length > 0}
								<div class="loot-link-results">
									{#each linkResults as entry (entry.source + ":" + entry.id)}
										<button class="loot-link-result" onclick={() => handleLink(entry)}>
											<span class="truncate">{entry.name}</span>
											<span class="loot-link-badge {railClass(entry.source)}">
												<span class="loot-source-dot"></span>{sourceLabel(entry.source)}
											</span>
										</button>
									{/each}
								</div>
							{/if}
							<div class="flex gap-2 justify-end">
								<Button variant="ghost" size="sm" onclick={cancelEdit}>{m.loot_edit_cancel()}</Button>
								<Button variant="primary" size="sm" onclick={commitEdit}>{m.loot_edit_save()}</Button>
							</div>
						</div>
					{/if}
				{/each}
			{/if}
		</div>

		<!-- Footer: two empties put the label in the name column and the total in
		     the count column, so the total aligns under the numbers above it. -->
		{#if sortedRows.length > 0}
			<div class="loot-ledger-footer">
				<span></span>
				<span></span>
				<span class="loot-ledger-footer-label">
					{m.loot_ledger_footer_summary({ matched: matchedCount, rows: sortedRows.length })}
				</span>
				<span class="loot-ledger-footer-total">{totalCount}</span>
				<span></span>
			</div>
		{/if}
	</div>

	<!-- ========== SCAN LOG ========== -->
	{#if session && session.scanLog.length > 0}
		<div class="loot-scanlog">
			<div class="loot-scanlog-header">
				<span class="loot-scanlog-title" class:loot-scanlog-title-live={isRunning}>{m.loot_scanlog_title()}</span>
				<div class="loot-scanlog-chips" role="group">
					{#each [["all", m.loot_scanlog_filter_all()], ["matched", m.loot_scanlog_filter_matched()], ["raw", m.loot_scanlog_filter_raw()]] as [id, label] (id)}
						<button
							type="button"
							class="loot-scanlog-chip"
							class:loot-scanlog-chip-active={scanLogFilter === id}
							onclick={() => lootScanLogFilterStore.set(id as "all" | "matched" | "raw")}
						>
							{label}
						</button>
					{/each}
				</div>
				<button
					type="button"
					class="loot-scanlog-chip"
					class:loot-scanlog-chip-active={scanLogGrouped}
					onclick={() => lootScanLogGroupedStore.set(!scanLogGrouped)}
					title={scanLogGrouped ? m.loot_scanlog_chrono() : m.loot_scanlog_group()}
				>
					{m.loot_scanlog_group()}
				</button>
				<span class="loot-scanlog-count">
					{m.loot_scanlog_count({ shown: recentScanLog.length, total: session.scanLog.length })}
				</span>
				<button class="loot-scanlog-clear" onclick={handleClearScanLog} title={m.loot_scanlog_clear()}>
					{confirmingClearLog ? m.loot_scanlog_clear_confirm() : m.loot_scanlog_clear()}
				</button>
			</div>

			<div class="loot-scanlog-body">
				{#if scanLogGrouped}
					{#each groupedScanLog as g (g.key)}
						<button type="button" class="loot-scanlog-group {railClass(g.source)}" onclick={() => toggleGroup(g.key)}>
							<span class="loot-scanlog-caret">{expandedGroups[g.key] ? "▾" : "▸"}</span>
							<span class="loot-scanlog-name" class:loot-scanlog-name-matched={g.key.startsWith("m:")}>
								<span class="loot-source-dot" class:loot-source-dot-hollow={!g.source}></span>{g.name}
							</span>
							<span class="loot-scanlog-qty">×{g.total}</span>
							<span class="loot-scanlog-source">{g.entries.length}</span>
						</button>
						{#if expandedGroups[g.key]}
							{#each g.entries as entry (entry.ts + ":" + entry.rawName + ":" + entry.qty)}
								<div class="loot-scanlog-row loot-scanlog-row-nested">
									<span class="loot-scanlog-time">{fmtClock(entry.ts)}</span>
									<span class="loot-scanlog-name" class:loot-scanlog-name-matched={entry.matchedItemId}>
										{entry.matchedDisplayName ?? entry.rawName}
									</span>
									<span class="loot-scanlog-qty">×{entry.qty}</span>
									<span class="loot-scanlog-source">{sourceLabel(entry.matchedSource)}</span>
								</div>
							{/each}
						{/if}
					{/each}
				{:else}
					{#each recentScanLog as entry (entry.ts + ":" + entry.rawName + ":" + entry.qty)}
						<div class="loot-scanlog-row">
							<span class="loot-scanlog-time">{fmtClock(entry.ts)}</span>
							<span
								class="loot-scanlog-name {railClass(entry.matchedSource)}"
								class:loot-scanlog-name-matched={entry.matchedItemId}
							>
								<!-- Unmatched reads hollow, so the distinction survives on paper. -->
								<span class="loot-source-dot" class:loot-source-dot-hollow={!entry.matchedItemId}></span>{entry.matchedDisplayName ?? entry.rawName}
							</span>
							<span class="loot-scanlog-qty">×{entry.qty}</span>
							<span class="loot-scanlog-source">{sourceLabel(entry.matchedSource)}</span>
						</div>
					{/each}
				{/if}
			</div>
		</div>
	{/if}

	<!-- ========== ADD ITEM PANE ========== -->
	{#if addOpen}
		<div class="loot-row-edit-pane">
			<input
				type="text"
				class="loot-input"
				placeholder={m.loot_add_item_placeholder()}
				bind:value={addQuery}
			/>
			{#if addResults.length > 0}
				<div class="loot-link-results">
					{#each addResults as entry (entry.source + ":" + entry.id)}
						<button class="loot-link-result" onclick={() => handleAddItem(entry)}>
							<span class="truncate">{entry.name}</span>
							<span class="loot-link-badge {railClass(entry.source)}">
								<span class="loot-source-dot"></span>{sourceLabel(entry.source)}
							</span>
						</button>
					{/each}
				</div>
			{/if}
		</div>
	{/if}

	<!-- ========== ACTION ROW ========== -->
	<div class="loot-actions">
		{#if isRunning}
			<Button variant="danger" size="sm" onclick={handleStop}>❚❚ {m.loot_scan_pause()}</Button>
		{:else}
			<Button
				variant="primary"
				size="sm"
				onclick={handleStart}
				disabled={!region}
			>
				▶ {hasSession ? m.loot_scan_resume() : m.loot_scan_start()}
			</Button>
		{/if}
		<Button
			variant="secondary"
			size="sm"
			onclick={() => { addOpen = !addOpen; addQuery = ""; }}
			disabled={!hasSession}
		>
			{m.loot_action_add_item()}
		</Button>
		<Button
			variant="secondary"
			size="sm"
			onclick={handleExport}
			disabled={exporting || !hasSession || sortedRows.length === 0}
		>
			{exporting ? m.loot_action_export_running() : m.loot_action_export()}
		</Button>
		<Button
			variant="secondary"
			size="sm"
			onclick={handleExportDiagnostics}
			disabled={exporting || recordedEventCount === 0}
			title={recordedEventCount === 0 ? m.loot_toast_diag_empty() : undefined}
		>
			{m.loot_action_export_diag()}
		</Button>
		<Button
			variant="secondary"
			size="sm"
			onclick={handleSave}
			disabled={!hasSession || sortedRows.length === 0}
		>
			■ {m.loot_action_save()}
		</Button>
		<Button
			variant="danger"
			size="sm"
			onclick={handleReset}
			disabled={!hasSession}
		>
			{confirmingReset ? m.loot_action_reset_confirm() : m.loot_action_reset()}
		</Button>
	</div>
</div>

<style>
	/* The pane shell, the ledger and every shared control are defined :global
	   in LootView.svelte. Only TRACK's own chrome lives here.
	   Values: LOOT_OCR_SPEC.css §4. Structure: LOOT_OCR_MARKUP.md §2. */

	/* Hero — one grid, five cells. */
	.loot-hero {
		display: grid;
		grid-template-columns: 14px 1fr auto auto auto;
		gap: 14px;
		align-items: center;
		padding: 11px 12px;
		background: var(--surface);
		box-shadow: inset 0 0 0 1px var(--card-border);
		flex-shrink: 0;
	}
	/* The pulse dot and ring are unchanged per the brief's rule 5.2; only the
	   dot's own measures come from the spec. */
	.loot-hero-pulse-wrap {
		position: relative;
		display: block;
		width: 12px;
		height: 12px;
	}
	.loot-hero-dot {
		position: absolute;
		inset: 2px;
		border-radius: 50%;
		background: var(--teal);
	}
	.loot-hero-dot-idle { background: var(--outline-hud); }
	.loot-hero-pulse-ring {
		position: absolute;
		inset: 0;
		border: 1px solid var(--teal);
		border-radius: 50%;
		animation: pulseB 1.4s ease-out infinite;
	}
	@keyframes pulseB {
		0% { transform: scale(0.6); opacity: 0.95; }
		100% { transform: scale(2.6); opacity: 0; }
	}
	.loot-hero-text {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.loot-hero-state {
		font: 700 10.5px 'IBM Plex Sans', sans-serif;
		letter-spacing: 0.10em;
		text-transform: uppercase;
		color: var(--teal);
	}
	.loot-hero-state-idle { color: var(--on-surface-variant); }
	.loot-hero-total {
		font: 600 26px/1.05 'IBM Plex Mono', monospace;
		font-variant-numeric: tabular-nums;
		color: var(--on-surface);
	}
	.loot-hero-totlabel {
		font: 400 12.5px 'IBM Plex Sans', sans-serif;
		letter-spacing: 0;
		text-transform: none;
		color: var(--on-surface-variant);
	}
	.loot-hero-stat {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 2px;
	}
	.loot-hero-stat-label {
		font: 700 10.5px 'IBM Plex Sans', sans-serif;
		letter-spacing: 0.10em;
		text-transform: uppercase;
		color: var(--outline-hud);
	}
	.loot-hero-stat-value {
		font: 600 15px 'IBM Plex Mono', monospace;
		font-variant-numeric: tabular-nums;
		color: var(--on-surface);
	}
	/* The "/ 7" denominator — smaller and quieter than its numerator. */
	.loot-hero-stat-of {
		font-weight: 400;
		font-size: 12.5px;
		color: var(--on-surface-variant);
	}

	/* Source legend strip, under the ledger header. */
	.loot-source-legend {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		padding: 6px 10px;
		border-bottom: 1px solid #f1eee8;
	}
	.loot-source-legend-chip {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 3px 8px;
		font: 500 12px 'IBM Plex Sans', sans-serif;
		color: #3d3a34;
		background: transparent;
		border: 1px solid var(--card-border);
		border-radius: 999px;
		cursor: pointer;
		transition: background 120ms ease, border-color 120ms ease, color 120ms ease;
	}
	.loot-source-legend-chip:hover {
		background: #f4f2ed;
		border-color: #c2bcb0;
	}
	.loot-source-legend-chip-active {
		font-weight: 600;
		color: var(--teal);
		border-color: var(--teal);
	}

	/* ========== Scan log ========== */
	.loot-scanlog {
		margin-top: 8px;
		background: var(--surface-low);
		box-shadow: inset 0 0 0 1px var(--card-border);
	}
	.loot-scanlog-header {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 7px 10px;
		background: var(--surface);
		border-bottom: 1px solid #e9e4da;
	}
	.loot-scanlog-title {
		flex: 1;
		font: 700 12.5px 'IBM Plex Sans', sans-serif;
		letter-spacing: 0.10em;
		text-transform: uppercase;
		color: var(--on-surface);
	}
	/* The hsl() wrapper is required — --accent is a triplet, so the shipped
	   `color: var(--accent)` was invalid and this signal never once fired. */
	.loot-scanlog-title-live { color: hsl(var(--accent)); }

	.loot-scanlog-chips {
		display: inline-flex;
		gap: 4px;
	}
	.loot-scanlog-chip {
		padding: 3px 8px;
		font: 500 12px 'IBM Plex Sans', sans-serif;
		color: var(--on-surface-variant);
		background: transparent;
		border: 1px solid var(--card-border);
		border-radius: 999px;
		cursor: pointer;
	}
	.loot-scanlog-chip-active {
		font-weight: 600;
		color: var(--teal);
		border-color: var(--teal);
	}
	.loot-scanlog-count {
		font: 500 12.5px 'IBM Plex Mono', monospace;
		font-variant-numeric: tabular-nums;
		color: var(--on-surface-variant);
	}
	.loot-scanlog-clear {
		padding: 3px 8px;
		font: 500 12px 'IBM Plex Sans', sans-serif;
		color: var(--on-surface-variant);
		background: transparent;
		border: 1px solid var(--card-border);
		border-radius: 999px;
		cursor: pointer;
	}
	.loot-scanlog-clear:hover { border-color: #c2bcb0; color: var(--on-surface); }

	.loot-scanlog-body {
		max-height: 240px;
		overflow-y: auto;
		font-family: 'IBM Plex Mono', monospace;
	}

	/* time 68 | name 1fr | qty 56 | source 80 */
	.loot-scanlog-row {
		display: grid;
		grid-template-columns: 68px 1fr 56px 80px;
		gap: 8px;
		align-items: center;
		padding: 5px 10px;
		border-bottom: 1px solid #f4f2ed;
	}
	.loot-scanlog-row:nth-child(odd) { background: var(--row-alt); }
	.loot-scanlog-row:last-child { border-bottom: none; }
	.loot-scanlog-row-nested { padding-left: 28px; }

	/* Grouped view: caret replaces the timestamp column. */
	.loot-scanlog-group {
		width: 100%;
		display: grid;
		grid-template-columns: 68px 1fr 56px 80px;
		gap: 8px;
		align-items: center;
		padding: 5px 10px;
		text-align: left;
		font-family: 'IBM Plex Mono', monospace;
		background: var(--row-alt);
		border: none;
		border-bottom: 1px solid #f4f2ed;
		cursor: pointer;
	}
	.loot-scanlog-group:hover { background: #f4f2ed; }
	.loot-scanlog-caret {
		font-size: 12px;
		color: var(--on-surface-variant);
	}

	.loot-scanlog-time {
		font-size: 12.5px;
		color: var(--on-surface-variant);
	}
	/* This pair was a no-op — the base class had no valid colour, so both
	   states inherited the same ink. Matched is ink, unmatched is quiet. */
	.loot-scanlog-name {
		font-size: 13px;
		color: var(--on-surface-variant);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.loot-scanlog-name-matched { color: var(--on-surface); }
	.loot-scanlog-qty {
		font-size: 13px;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		color: var(--on-surface);
		text-align: right;
	}
	/* Sentence case sans. Was uppercase mono at .1em. */
	.loot-scanlog-source {
		font-family: 'IBM Plex Sans', sans-serif;
		font-size: 12px;
		letter-spacing: 0;
		text-transform: none;
		color: var(--on-surface-variant);
		text-align: right;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* Link-to-catalog results (not in the design pack — kept from the shipped
	   pane, restyled to the same vocabulary). */
	.loot-link-results {
		background: var(--surface-low);
		border: 1px solid var(--card-border);
		border-radius: 7px;
		max-height: 160px;
		overflow: auto;
	}
	.loot-link-result {
		width: 100%;
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 8px;
		padding: 5px 8px;
		background: transparent;
		border: none;
		cursor: pointer;
		color: var(--on-surface);
		font-size: 12.5px;
		text-align: left;
	}
	.loot-link-result:hover { background: #f4f2ed; }
	.loot-link-badge {
		display: inline-flex;
		align-items: center;
		flex: none;
		padding: 1px 8px;
		font: 500 12px 'IBM Plex Sans', sans-serif;
		color: var(--on-surface-variant);
		border: 1px solid var(--card-border);
		border-radius: 999px;
	}

	/* Six buttons. This was a five-column grid, so Reset dropped onto a second
	   implicit row at a fifth of the width. */
	.loot-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		flex-shrink: 0;
	}
	.loot-actions > :global(button) {
		flex: 1 1 0;
		min-width: 92px;
	}
</style>
