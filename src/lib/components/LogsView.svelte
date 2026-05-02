<script lang="ts">
	import { routeLogsStore, deleteRouteLog, islandsDataStore, barterMapLayoutStore } from "$lib/stores";
	import { formatSilverShort } from "$lib/constants/chart-theme";
	import { formatDuration } from "$lib/utils/format";
	import RouteMapPreview from "./RouteMapPreview.svelte";
	import TierBadge from "./ui/TierBadge.svelte";
	import type { RouteLog, IslandNode } from "$lib/models/bartering";

	type Filter = "all" | "today" | "week" | "month";

	let filter = $state<Filter>("all");
	let openId = $state<string | null>(null);

	let nodeById = $derived.by(() => {
		const m = new Map<string, IslandNode>();
		const data = $islandsDataStore;
		const layout = $barterMapLayoutStore;
		if (data) {
			for (const n of data.nodes) {
				const o = layout.positionOverrides[n.id];
				m.set(n.id, o ? { ...n, x: o.x, y: o.y } : n);
			}
		}
		for (const c of layout.customNodes) m.set(c.id, c);
		return m;
	});

	let now = Date.now();
	let filteredLogs = $derived.by(() => {
		const logs = $routeLogsStore;
		const oneDay = 86_400_000;
		switch (filter) {
			case "today": {
				const todayStr = new Date().toISOString().slice(0, 10);
				return logs.filter((l) => l.date === todayStr);
			}
			case "week":
				return logs.filter((l) => now - l.startedAt <= 7 * oneDay);
			case "month":
				return logs.filter((l) => now - l.startedAt <= 30 * oneDay);
			default:
				return logs;
		}
	});

	let stats = $derived.by(() => {
		const logs = $routeLogsStore;
		return {
			count: logs.length,
			totalSilver: logs.reduce((a, l) => a + l.totalSilver, 0),
			totalDuration: logs.reduce((a, l) => a + l.durationSeconds, 0),
		};
	});

	let openLog = $derived(openId ? $routeLogsStore.find((l) => l.id === openId) ?? null : null);

	function logTime(log: RouteLog): string {
		const d = new Date(log.startedAt);
		return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
	}
	function logDateLabel(log: RouteLog): string {
		const d = new Date(log.startedAt);
		return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
	}
	function silverPerHour(log: RouteLog): number {
		if (log.durationSeconds <= 0) return 0;
		return Math.round((log.totalSilver / log.durationSeconds) * 3600);
	}

	function onDelete(log: RouteLog) {
		if (confirm(`Delete log "${log.label || logDateLabel(log)}"? This cannot be undone.`)) {
			deleteRouteLog(log.id);
			if (openId === log.id) openId = null;
		}
	}
</script>

{#if openLog}
	<!-- Detail view -->
	<div class="detail-view">
		<div class="detail-head">
			<button type="button" class="back-btn" onclick={() => (openId = null)}>← LOGS</button>
			<span class="detail-title">{openLog.label || `${logDateLabel(openLog)} run`}</span>
			<span class="detail-when font-mono">{logDateLabel(openLog)} · {logTime(openLog)}</span>
			<button
				type="button"
				class="delete-btn"
				onclick={() => onDelete(openLog!)}
				aria-label="Delete this log"
			>🗑</button>
		</div>

		{#if openLog.legacy}
			<div class="legacy-banner">
				<span class="legacy-label">LEGACY SESSION</span>
				<span class="legacy-note">Migrated from pre-Routes tracker — no per-trade data</span>
			</div>
		{:else}
			<div class="detail-map">
				<RouteMapPreview
					visitedNodeIds={openLog.visitedNodeIds}
					width={520}
					height={220}
					showLabels={true}
				/>
			</div>
		{/if}

		<div class="stat-ribbon">
			<div class="stat-cell">
				<span class="stat-label">EARNED</span>
				<span class="stat-val font-mono" style:color="var(--tertiary)">
					{formatSilverShort(openLog.totalSilver)}
				</span>
			</div>
			<div class="stat-cell">
				<span class="stat-label">DURATION</span>
				<span class="stat-val font-mono" style:color="var(--secondary)">
					{openLog.legacy ? "—" : formatDuration(openLog.durationSeconds)}
				</span>
			</div>
			<div class="stat-cell">
				<span class="stat-label">SILVER/HR</span>
				<span class="stat-val font-mono" style:color="var(--primary-container)">
					{formatSilverShort(silverPerHour(openLog))}
				</span>
			</div>
			<div class="stat-cell">
				<span class="stat-label">PARLEY</span>
				<span class="stat-val font-mono">
					{Math.round(openLog.parleySpent / 1000)}K
				</span>
			</div>
		</div>

		{#if openLog.trades.length > 0}
			<div class="ledger glass-card">
				<div class="ledger-head">
					<span class="ledger-title">TRADE LEDGER · {openLog.trades.length}</span>
					<span class="ledger-meta font-mono">{openLog.visitedNodeIds.length} stops · {openLog.totalQty} items</span>
				</div>
				<div class="ledger-rows">
					{#each openLog.trades as trade, i (trade.id || `t-${i}`)}
						{@const node = nodeById.get(trade.nodeId)}
						<div
							class="ledger-row"
							style:--row-color={node ? `var(--t${node.tier})` : "var(--outline-hud)"}
						>
							<span class="row-dot"></span>
							<span class="row-node">{node ? node.name : trade.nodeId}</span>
							<TierBadge tier={trade.receiveTier} sp={trade.receiveSp} size={16} />
							<span class="row-name">{trade.receiveName}</span>
							<span class="row-qty font-mono">×{trade.qty}</span>
							<span class="row-silver font-mono">
								{trade.silverPerUnit > 0 ? formatSilverShort(trade.silverPerUnit * trade.qty) : "—"}
							</span>
						</div>
					{/each}
				</div>
			</div>
		{/if}
	</div>
{:else}
	<!-- List view -->
	<div class="logs-view">
		<div class="stat-ribbon">
			<div class="stat-cell">
				<span class="stat-label">LOGS</span>
				<span class="stat-val font-mono" style:color="var(--primary-container)">{stats.count}</span>
			</div>
			<div class="stat-cell">
				<span class="stat-label">TOTAL</span>
				<span class="stat-val font-mono" style:color="var(--tertiary)">
					{formatSilverShort(stats.totalSilver)}
				</span>
			</div>
			<div class="stat-cell">
				<span class="stat-label">ON WATER</span>
				<span class="stat-val font-mono" style:color="var(--secondary)">
					{formatDuration(stats.totalDuration)}
				</span>
			</div>
		</div>

		<div class="filter-row">
			{#each [["all", "ALL"], ["today", "TODAY"], ["week", "WEEK"], ["month", "MONTH"]] as [k, label] (k)}
				<button
					type="button"
					class="chip"
					class:active={filter === k}
					onclick={() => (filter = k as Filter)}
				>{label}</button>
			{/each}
		</div>

		<div class="log-list">
			{#if filteredLogs.length === 0}
				<div class="empty">No sessions in this range.</div>
			{:else}
				{#each filteredLogs as log (log.id)}
					<button type="button" class="log-row" onclick={() => (openId = log.id)}>
						<div class="log-map">
							{#if log.legacy}
								<div class="legacy-mini">LEGACY</div>
							{:else}
								<RouteMapPreview
									visitedNodeIds={log.visitedNodeIds}
									width={88}
									height={52}
								/>
							{/if}
						</div>
						<div class="log-meta">
							<div class="log-row1">
								<span class="log-label">{log.label || `${logDateLabel(log)} run`}</span>
								<span class="log-when font-mono">{logDateLabel(log)} · {logTime(log)}</span>
							</div>
							<div class="log-row2">
								<span class="log-silver font-mono">{formatSilverShort(log.totalSilver)}</span>
								{#if !log.legacy}
									<span class="log-rate font-mono">{formatSilverShort(silverPerHour(log))}/h</span>
									<span class="log-dur font-mono">· {formatDuration(log.durationSeconds)}</span>
								{/if}
							</div>
							{#if !log.legacy}
								<div class="log-dots">
									{#each log.visitedNodeIds.slice(0, 8) as nid, i (nid + "-" + i)}
										{@const n = nodeById.get(nid)}
										{#if n}
											<span class="dot" style:background="var(--t{n.tier})"></span>
										{/if}
									{/each}
									<span class="dots-meta">
										{log.visitedNodeIds.length} stops · {log.totalQty} items
									</span>
								</div>
							{/if}
						</div>
						<span class="log-arrow">›</span>
					</button>
				{/each}
			{/if}
		</div>
	</div>
{/if}

<style>
	.logs-view, .detail-view {
		display: flex;
		flex-direction: column;
		gap: 8px;
		height: 100%;
		min-height: 0;
	}
	.stat-ribbon {
		display: grid;
		grid-template-columns: repeat(var(--cells, 3), 1fr);
		gap: 4px;
	}
	.detail-view .stat-ribbon {
		--cells: 4;
	}
	.stat-cell {
		padding: 6px 8px;
		background: var(--surface-low);
		display: flex;
		flex-direction: column;
		gap: 2px;
		box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--outline-variant) 25%, transparent);
	}
	.stat-label {
		font-family: 'Space Grotesk', system-ui, sans-serif;
		font-size: 8px;
		letter-spacing: 0.18em;
		color: var(--outline-hud);
		font-weight: 600;
	}
	.stat-val {
		font-size: 14px;
		color: var(--on-surface);
	}

	.filter-row {
		display: flex;
		gap: 4px;
	}
	.chip {
		flex: 1;
		padding: 5px 0;
		background: var(--surface-lowest);
		color: var(--outline-hud);
		border: 0;
		font-family: 'Space Grotesk', system-ui, sans-serif;
		font-size: 9px;
		font-weight: 700;
		letter-spacing: 0.18em;
		box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--outline-variant) 20%, transparent);
		cursor: pointer;
	}
	.chip.active {
		background: var(--surface-container);
		color: var(--primary-container);
		box-shadow: inset 0 -2px 0 var(--primary-container);
	}

	.log-list {
		flex: 1;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.empty {
		text-align: center;
		padding: 24px 0;
		font-size: 11px;
		color: var(--outline-hud);
		opacity: 0.6;
	}
	.log-row {
		display: grid;
		grid-template-columns: 96px 1fr auto;
		gap: 10px;
		align-items: center;
		padding: 6px 8px;
		background: var(--surface-lowest);
		border: 0;
		text-align: left;
		box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--outline-variant) 18%, transparent);
		cursor: pointer;
	}
	.log-row:hover {
		background: var(--surface-low);
	}
	.log-map {
		width: 88px;
		height: 52px;
	}
	.legacy-mini {
		width: 88px;
		height: 52px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--surface-low);
		font-family: 'Space Grotesk', system-ui, sans-serif;
		font-size: 9px;
		letter-spacing: 0.16em;
		color: var(--outline-hud);
		font-weight: 700;
	}
	.log-meta {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.log-row1 {
		display: flex;
		align-items: baseline;
		gap: 6px;
	}
	.log-label {
		font-family: 'Manrope', system-ui, sans-serif;
		font-size: 12px;
		color: var(--on-surface);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.log-when {
		font-size: 9px;
		color: var(--outline-hud);
		opacity: 0.7;
	}
	.log-row2 {
		display: flex;
		align-items: baseline;
		gap: 8px;
	}
	.log-silver {
		font-size: 13px;
		color: var(--tertiary);
		text-shadow: 0 0 6px color-mix(in oklab, var(--tertiary) 40%, transparent);
	}
	.log-rate, .log-dur {
		font-size: 9px;
		color: var(--outline-hud);
	}
	.log-dots {
		display: flex;
		gap: 3px;
		align-items: center;
		margin-top: 2px;
	}
	.dot {
		width: 6px;
		height: 6px;
		border-radius: 50% !important;
	}
	.dots-meta {
		font-family: 'Space Grotesk', monospace;
		font-size: 9px;
		color: var(--outline-hud);
		margin-left: 4px;
	}
	.log-arrow {
		color: var(--outline-hud);
		font-size: 14px;
		opacity: 0.5;
	}

	/* Detail view */
	.detail-head {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.back-btn {
		padding: 4px 10px;
		background: var(--surface-lowest);
		color: var(--outline-hud);
		border: 0;
		font-family: 'Space Grotesk', system-ui, sans-serif;
		font-size: 9px;
		letter-spacing: 0.16em;
		font-weight: 700;
		box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--outline-variant) 30%, transparent);
		cursor: pointer;
	}
	.detail-title {
		font-family: 'Space Grotesk', system-ui, sans-serif;
		font-size: 12px;
		color: var(--on-surface);
		font-weight: 600;
	}
	.detail-when {
		font-size: 9px;
		color: var(--outline-hud);
		opacity: 0.7;
	}
	.delete-btn {
		margin-left: auto;
		background: none;
		border: 0;
		color: var(--outline-hud);
		font-size: 14px;
		cursor: pointer;
	}
	.delete-btn:hover {
		color: var(--destructive);
	}
	.detail-map {
		height: 220px;
	}
	.legacy-banner {
		padding: 12px;
		background: var(--surface-low);
		display: flex;
		flex-direction: column;
		gap: 4px;
		text-align: center;
		box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--outline-variant) 25%, transparent);
	}
	.legacy-label {
		font-family: 'Space Grotesk', system-ui, sans-serif;
		font-size: 10px;
		letter-spacing: 0.2em;
		color: var(--tertiary);
		font-weight: 700;
	}
	.legacy-note {
		font-size: 10px;
		color: var(--outline-hud);
	}

	/* Detail ledger (shared style with RoutesView ledger but read-only) */
	.ledger {
		flex: 1;
		display: flex;
		flex-direction: column;
		min-height: 0;
		padding: 6px 10px;
	}
	.ledger-head {
		display: flex;
		justify-content: space-between;
		margin-bottom: 4px;
	}
	.ledger-title {
		font-family: 'Space Grotesk', system-ui, sans-serif;
		font-size: 9px;
		letter-spacing: 0.18em;
		color: var(--outline-hud);
		font-weight: 600;
	}
	.ledger-meta {
		font-size: 9px;
		color: var(--outline-hud);
	}
	.ledger-rows {
		flex: 1;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.ledger-row {
		display: grid;
		grid-template-columns: auto 70px auto 1fr auto auto;
		align-items: center;
		gap: 8px;
		padding: 4px 8px;
		background: var(--surface-lowest);
		box-shadow: inset 2px 0 0 var(--row-color);
	}
	.row-dot {
		width: 6px;
		height: 6px;
		border-radius: 50% !important;
		background: var(--row-color);
	}
	.row-node {
		font-family: 'Space Grotesk', system-ui, sans-serif;
		font-size: 10px;
		color: var(--row-color);
		letter-spacing: 0.04em;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.row-name {
		font-size: 11px;
		color: var(--on-surface);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.row-qty {
		font-size: 11px;
		color: var(--row-color);
		min-width: 28px;
		text-align: right;
	}
	.row-silver {
		font-size: 11px;
		color: var(--tertiary);
		min-width: 56px;
		text-align: right;
	}
</style>
