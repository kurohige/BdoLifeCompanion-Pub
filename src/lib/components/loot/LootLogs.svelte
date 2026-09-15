<!--
	Loot OCR · LOGS sub-tab.

	List view of finalized captures with a filter chip row (ALL / TODAY / WEEK /
	MONTH) and aggregate header (count / lifetime rows / lifetime time). Clicking
	a row drills into a read-only detail view (same ledger structure as TRACK,
	minus action buttons; EXPORT + DELETE in the title row).
-->
<script lang="ts">
	import {
		lootLogsStore,
		deleteLootLog,
		lootLogDetailIdStore,
		lootLogsRangeStore,
		lootCatalogStore,
		mergeMatchedRowsToInventory,
		setLootLogMergedAt,
	} from "$lib/stores";
	import { exportLootLog } from "$lib/utils/export-loot";
	import { showToast } from "$lib/stores/toast";
	import type { CaptureLog, CapturedRow, MatchSource } from "$lib/models/loot";
	import { railClass, sourceLabel } from "$lib/utils/loot-format";
	import { m } from "$lib/paraglide/messages";
	import { Button, StatTile } from "$lib/components/ui";
	import LootLedgerRow from "./LootLedgerRow.svelte";

	let confirmingDelete = $state<string | null>(null);
	let exportingLogId = $state<string | null>(null);
	let confirmingRemergeId = $state<string | null>(null);

	const detailId = $derived($lootLogDetailIdStore);
	const range = $derived($lootLogsRangeStore);
	const logs = $derived($lootLogsStore);
	const detail = $derived.by(() => {
		if (!detailId) return null;
		return logs.find((l) => l.id === detailId) ?? null;
	});

	const rangeMs: Record<string, number> = {
		today: 24 * 60 * 60 * 1000,
		week: 7 * 24 * 60 * 60 * 1000,
		month: 30 * 24 * 60 * 60 * 1000,
	};

	const visibleLogs = $derived.by(() => {
		const all = [...logs].sort((a, b) => b.startedAt - a.startedAt);
		if (range === "all") return all;
		const cutoff = Date.now() - rangeMs[range];
		return all.filter((l) => l.startedAt >= cutoff);
	});

	const aggregate = $derived.by(() => {
		const totalRows = visibleLogs.reduce((n, l) => n + l.rows.length, 0);
		const totalQty = visibleLogs.reduce(
			(n, l) => n + l.rows.reduce((m, r) => m + r.count, 0),
			0,
		);
		const totalSeconds = visibleLogs.reduce(
			(n, l) => n + Math.max(0, Math.floor((l.endedAt - l.startedAt) / 1000)),
			0,
		);
		return { totalRows, totalQty, totalSeconds };
	});

	const detailSortedRows = $derived.by(() => {
		if (!detail) return [];
		return [...detail.rows].sort((a, b) => b.count - a.count);
	});

	const detailMatched = $derived(
		detail ? detail.rows.filter((r) => r.matchedItemId).length : 0,
	);
	const detailTotalQty = $derived(
		detail ? detail.rows.reduce((n, r) => n + r.count, 0) : 0,
	);
	const detailDurationSeconds = $derived.by(() => {
		if (!detail) return 0;
		return Math.max(0, Math.floor((detail.endedAt - detail.startedAt) / 1000));
	});

	/**
	 * Drops the leading `00:` when there are no hours — the stat column is 92px
	 * and the hour slot is usually empty. Kept when there are hours (`1:02:40`).
	 */
	function fmtDuration(seconds: number): string {
		const h = Math.floor(seconds / 3600);
		const mm = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
		const ss = String(seconds % 60).padStart(2, "0");
		return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
	}

	/** Short date — "1 Sep", not "01/09/2026". The year is never the question. */
	function fmtDate(ms: number): string {
		const d = new Date(ms);
		return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
	}

	function fmtTime(ms: number): string {
		const d = new Date(ms);
		return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
	}

	const iconById = $derived.by(() => {
		const map = new Map<string, string>();
		for (const e of $lootCatalogStore) {
			if (e.iconPath) map.set(`${e.source}:${e.id}`, e.iconPath);
		}
		return map;
	});

	function rowIcon(r: CapturedRow): string | undefined {
		if (!r.matchedSource || !r.matchedItemId) return undefined;
		return iconById.get(`${r.matchedSource}:${r.matchedItemId}`);
	}

	/**
	 * "grinding, gathering, 1 unmatched" — what replaces the six-dot cluster.
	 * The sources are named, ordered by how much each contributed, so no legend
	 * is needed: the words are the legend. Unmatched rows are named as a count
	 * rather than as a source.
	 */
	function sourceSummary(rows: CapturedRow[]): string {
		const totals = new Map<MatchSource, number>();
		let unmatched = 0;
		for (const r of rows) {
			if (r.matchedSource) {
				totals.set(r.matchedSource, (totals.get(r.matchedSource) ?? 0) + r.count);
			} else {
				unmatched += 1;
			}
		}
		const parts = [...totals.entries()]
			.sort((a, b) => b[1] - a[1])
			.map(([source]) => sourceLabel(source));
		if (unmatched > 0) parts.push(m.loot_logs_sub_unmatched({ count: unmatched }));
		return parts.join(", ");
	}

	/**
	 * The source that contributed the most items to a log. Drives the row rail —
	 * replaces the legend-less cluster of six glowing dots the row used to end
	 * with. Unmatched rows don't vote; an all-unmatched log rails neutral.
	 */
	function dominantSource(rows: CapturedRow[]): MatchSource | undefined {
		const totals = new Map<MatchSource, number>();
		for (const r of rows) {
			if (!r.matchedSource) continue;
			totals.set(r.matchedSource, (totals.get(r.matchedSource) ?? 0) + r.count);
		}
		let best: MatchSource | undefined;
		let bestTotal = 0;
		for (const [source, total] of totals) {
			if (total > bestTotal) {
				best = source;
				bestTotal = total;
			}
		}
		return best;
	}

	function openDetail(id: string) {
		lootLogDetailIdStore.set(id);
	}

	function closeDetail() {
		lootLogDetailIdStore.set(null);
		confirmingDelete = null;
	}

	async function handleExport(log: CaptureLog) {
		if (exportingLogId === log.id) return;
		exportingLogId = log.id;
		try {
			const result = await exportLootLog(log);
			if (result.status === "saved") {
				showToast(m.loot_toast_export_success({ count: result.rowCount }), "success");
			} else if (result.status === "empty") {
				showToast(m.loot_toast_export_empty(), "info");
			}
		} catch (e) {
			showToast(m.loot_toast_export_fail({ error: String(e) }), "error", 5000);
		} finally {
			exportingLogId = null;
		}
	}

	function handleDelete(id: string) {
		if (confirmingDelete !== id) {
			confirmingDelete = id;
			setTimeout(() => {
				if (confirmingDelete === id) confirmingDelete = null;
			}, 3000);
			return;
		}
		confirmingDelete = null;
		deleteLootLog(id);
		if (detailId === id) closeDetail();
	}

	function handleRemerge(log: CaptureLog) {
		// Two-click confirm — same pattern as Delete — because re-merging
		// double-adds the row counts to inventory. Click once shows the
		// confirm copy; click again within 3s actually merges.
		if (confirmingRemergeId !== log.id) {
			confirmingRemergeId = log.id;
			setTimeout(() => {
				if (confirmingRemergeId === log.id) confirmingRemergeId = null;
			}, 3000);
			return;
		}
		confirmingRemergeId = null;
		const { itemsMerged } = mergeMatchedRowsToInventory(log.rows);
		if (itemsMerged > 0) {
			setLootLogMergedAt(log.id, Date.now());
			showToast(m.loot_logs_remerge_done({ merged: itemsMerged }), "success");
		} else {
			showToast(m.loot_logs_remerge_empty(), "info");
		}
	}
</script>

<div class="loot-pane loot-logs">
	{#if !detail}
		<!-- ========== LIST VIEW ========== -->

		<div class="grid grid-cols-3 gap-2">
			<StatTile label={m.loot_logs_agg_logs()} value={String(visibleLogs.length)} />
			<StatTile label={m.loot_logs_agg_items()} value={String(aggregate.totalQty)} />
			<StatTile label={m.loot_logs_agg_time()} value={fmtDuration(aggregate.totalSeconds)} />
		</div>

		<div class="loot-filter-chips">
			{#each [
				{ id: "all" as const,   label: m.loot_logs_range_all() },
				{ id: "today" as const, label: m.loot_logs_range_today() },
				{ id: "week" as const,  label: m.loot_logs_range_week() },
				{ id: "month" as const, label: m.loot_logs_range_month() },
			] as opt}
				<button
					class="loot-filter-chip"
					class:loot-filter-chip-active={range === opt.id}
					onclick={() => lootLogsRangeStore.set(opt.id)}
				>
					{opt.label}
				</button>
			{/each}
		</div>

		<!-- name 1fr | items 92 | rows 62 | elapsed 92 -->
		<div class="loot-logs-rows">
			{#if visibleLogs.length === 0}
				<div class="loot-logs-empty">{m.loot_logs_empty()}</div>
			{:else}
				{#each visibleLogs as log, idx (log.id)}
					{@const totalQty = log.rows.reduce((n, r) => n + r.count, 0)}
					{@const durationSeconds = Math.max(0, Math.floor((log.endedAt - log.startedAt) / 1000))}
					<button
						class="loot-log-row {railClass(dominantSource(log.rows))}"
						class:loot-log-row-alt={idx % 2 === 1}
						onclick={() => openDetail(log.id)}
					>
						<div class="loot-log-name">
							<div class="loot-log-title">{log.label}</div>
							<!-- The dot cluster's replacement: the sources are named, so no
							     legend is needed — the words are the legend. -->
							<div class="loot-log-sub">
								{fmtDate(log.startedAt)} · {fmtTime(log.startedAt)} · {sourceSummary(log.rows)}
							</div>
						</div>
						<div class="loot-log-stat">
							<div class="loot-log-stat-value">{totalQty}</div>
							<div class="loot-log-stat-unit">{m.loot_unit_items()}</div>
						</div>
						<div class="loot-log-stat">
							<div class="loot-log-stat-value">{log.rows.length}</div>
							<div class="loot-log-stat-unit">{m.loot_unit_rows()}</div>
						</div>
						<div class="loot-log-stat">
							<div class="loot-log-stat-value">{fmtDuration(durationSeconds)}</div>
							<div class="loot-log-stat-unit">{m.loot_unit_elapsed()}</div>
						</div>
					</button>
				{/each}
			{/if}
		</div>
	{:else}
		<!-- ========== DETAIL VIEW ========== -->

		<div class="loot-detail-title-row">
			<button class="loot-detail-back" onclick={closeDetail} title={m.loot_logs_back()}>
				◂ {m.loot_logs_back()}
			</button>
			<div class="loot-detail-title-text">
				<div class="loot-detail-label">{detail.label}</div>
				<div class="loot-detail-date">
					{fmtDate(detail.startedAt)} · {fmtTime(detail.startedAt)}
					{#if detail.mergedAt}
						<span title={m.loot_logs_already_merged_title()}>
							· {m.loot_logs_already_merged({ when: fmtTime(detail.mergedAt) })}
						</span>
					{/if}
				</div>
			</div>
			<div class="flex items-center gap-2">
				<Button
					variant="secondary"
					size="sm"
					onclick={() => detail && handleRemerge(detail)}
					disabled={detailMatched === 0}
					title={detail.mergedAt
						? m.loot_logs_remerge_title_again()
						: m.loot_logs_remerge_title_first()}
				>
					{confirmingRemergeId === detail.id
						? m.loot_logs_remerge_confirm()
						: m.loot_logs_remerge()}
				</Button>
				<Button
					variant="secondary"
					size="sm"
					onclick={() => detail && handleExport(detail)}
					disabled={exportingLogId === detail.id || detail.rows.length === 0}
				>
					{exportingLogId === detail.id ? m.loot_action_export_running() : m.loot_action_export()}
				</Button>
				<Button
					variant="danger"
					size="sm"
					onclick={() => detail && handleDelete(detail.id)}
				>
					{confirmingDelete === detail.id ? m.loot_action_reset_confirm() : m.loot_logs_delete_short()}
				</Button>
			</div>
		</div>

		<div class="grid grid-cols-4 gap-2">
			<StatTile label={m.loot_logs_agg_items()} value={String(detailTotalQty)} />
			<StatTile label={m.loot_meta_rows()} value={String(detail.rows.length)} />
			<StatTile
				label={m.loot_meta_matched()}
				value={`${detailMatched}/${detail.rows.length}`}
			/>
			<StatTile label={m.loot_hero_elapsed()} value={fmtDuration(detailDurationSeconds)} />
		</div>

		<!-- The SHARED ledger with .loot-ledger-readonly. This component holds no
		     ledger CSS of its own. No footer, no legend strip. -->
		<div class="loot-ledger loot-ledger-readonly">
			<div class="loot-ledger-header">
				<span></span>
				<span></span>
				<span>{m.loot_ledger_col_item()}</span>
				<span class="loot-ledger-header-count">{m.loot_ledger_col_count()}</span>
			</div>
			<div class="loot-ledger-body">
				{#if detail.rows.length === 0}
					<div class="loot-ledger-empty">{m.loot_logs_empty()}</div>
				{:else}
					{#each detailSortedRows as r, idx (r.key)}
						<LootLedgerRow row={r} alt={idx % 2 === 1} icon={rowIcon(r)} />
					{/each}
				{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	/* Values: LOOT_OCR_SPEC.css §6. Structure: LOOT_OCR_MARKUP.md §4.
	   The ledger is defined once, :global, in LootView.svelte. It used to be
	   mirrored here, which is how the two copies drifted apart (six columns
	   against seven, no hover, no footer). Do not re-add a copy. */

	.loot-logs { gap: 10px; }

	/* The most-used control on this tab. Resting, hover and active are now
	   three distinguishable things — the hover used to be #20211f text on a
	   50% black wash. */
	.loot-filter-chips {
		display: flex;
		gap: 6px;
		flex-shrink: 0;
	}
	.loot-filter-chip {
		padding: 5px 12px;
		font: 500 12.5px 'IBM Plex Sans', sans-serif;
		letter-spacing: 0;
		text-transform: none;
		color: #3d3a34;
		background: transparent;
		border: 1px solid var(--card-border);
		border-radius: 999px;
		cursor: pointer;
		transition: color 120ms ease, background 120ms ease, border-color 120ms ease;
	}
	.loot-filter-chip:hover {
		color: var(--on-surface);
		background: #f4f2ed;
		border-color: #c2bcb0;
	}
	.loot-filter-chip-active {
		font-weight: 600;
		color: var(--teal);
		background: var(--teal-tint);
		border-color: var(--teal);
	}

	.loot-logs-rows {
		flex: 1;
		min-height: 0;
		overflow: auto;
		display: flex;
		flex-direction: column;
		gap: 6px;
		scrollbar-width: none;
	}
	.loot-logs-rows::-webkit-scrollbar { display: none; }

	/* Rail takes the dominant source. */
	.loot-log-row {
		display: grid;
		grid-template-columns: 1fr 92px 62px 92px;
		gap: 12px;
		align-items: center;
		padding: 11px 12px;
		background: var(--surface-low);
		border: 1px solid var(--card-border);
		border-left: 3px solid var(--rail, #d5d0c6);
		border-radius: 8px;
		text-align: left;
		color: inherit;
		cursor: pointer;
		flex-shrink: 0;
		transition: background 120ms ease, border-color 120ms ease;
	}
	.loot-log-row-alt { background: var(--surface); }
	/* Paper fill and a darker border. NOT var(--outline-hud) — a text ink used
	   as a border wraps the row in a near-black box. */
	.loot-log-row:hover,
	.loot-log-row-alt:hover {
		background: #f4f2ed;
		border-color: #c2bcb0;
		border-left-color: var(--rail, #d5d0c6);
	}

	.loot-log-name { min-width: 0; }
	.loot-log-title {
		font: 500 14px 'IBM Plex Sans', sans-serif;
		color: var(--on-surface);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.loot-log-sub {
		font: 400 12.5px 'IBM Plex Sans', sans-serif;
		color: var(--on-surface-variant);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* The stat stack, inverted: figure above, unit below. Three tracked 10.5px
	   caps per row × 14 rows was 42 shouted labels on one screen. */
	.loot-log-stat { text-align: right; }
	.loot-log-stat-value {
		font: 600 16px 'IBM Plex Mono', monospace;
		font-variant-numeric: tabular-nums;
		color: var(--on-surface);
	}
	.loot-log-stat-unit {
		font: 400 12px 'IBM Plex Sans', sans-serif;
		letter-spacing: 0;
		text-transform: none;
		color: var(--on-surface-variant);
	}

	/* Detail view title row. */
	.loot-detail-title-row {
		display: grid;
		grid-template-columns: auto 1fr auto;
		gap: 12px;
		align-items: center;
		padding: 7px 10px;
		background: var(--surface);
		border: 1px solid var(--card-border);
		border-radius: 8px;
		flex-shrink: 0;
	}
	.loot-detail-back {
		padding: 4px 12px;
		font: 500 12.5px 'IBM Plex Sans', sans-serif;
		letter-spacing: 0;
		text-transform: none;
		color: var(--on-surface);
		background: transparent;
		border: 1px solid var(--card-border);
		border-radius: 999px;
		cursor: pointer;
	}
	.loot-detail-back:hover { background: #f4f2ed; border-color: #c2bcb0; }
	.loot-detail-title-text { min-width: 0; }
	/* The title of the screen — it used to be smaller than the rows below it. */
	.loot-detail-label {
		font: 600 14px 'IBM Plex Sans', sans-serif;
		color: var(--on-surface);
	}
	.loot-detail-date {
		font: 400 12.5px 'IBM Plex Sans', sans-serif;
		color: var(--on-surface-variant);
	}
</style>
