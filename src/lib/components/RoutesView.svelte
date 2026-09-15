<script lang="ts">
	import { onMount, onDestroy } from "svelte";
	import {
		SvelteFlow,
		SvelteFlowProvider,
		Background,
		ViewportPortal,
		type Node,
		type Edge,
		type NodeTypes,
	} from "@xyflow/svelte";
	import "@xyflow/svelte/dist/style.css";

	import {
		islandsDataStore,
		barterMapLayoutStore,
		currentRouteStore,
		routeTickStore,
		startRouteTicker,
		stopRouteTicker,
		pauseRoute,
		resumeRoute,
		elapsedSeconds,
		removeTrade,
		clearRoute,
		refillParley,
		totalParleySpent,
		PARLEY_MAX_DEFAULT,
		finalizeRoute,
		routeOpenNodeStore,
		showToast,
	} from "$lib/stores";
	import IslandNode, { type IslandNodeData } from "./IslandNode.svelte";
	import RouteTradePopover from "./RouteTradePopover.svelte";
	import TierBadge from "./ui/TierBadge.svelte";
	import { Button } from "./ui";
	import { formatSilverShort } from "$lib/constants/chart-theme";
	import type { IslandNode as IslandNodeType } from "$lib/models/bartering";
	import { m } from "$lib/paraglide/messages";

	// ==================== Map state ====================

	let nodes = $state<Node[]>([]);
	let edges = $state<Edge[]>([]);

	const nodeTypes: NodeTypes = { island: IslandNode as never };

	let effectiveNodes = $derived.by(() => {
		const data = $islandsDataStore;
		const layout = $barterMapLayoutStore;
		if (!data) return [];
		const shipped = data.nodes.map((n) => {
			const o = layout.positionOverrides[n.id];
			return o ? { ...n, x: o.x, y: o.y } : n;
		});
		const custom = layout.customNodes.map((c) => ({ ...c }));
		return [...shipped, ...custom];
	});

	let nodeById = $derived.by(() => {
		const m = new Map<string, IslandNodeType>();
		for (const n of effectiveNodes) m.set(n.id, n);
		return m;
	});

	let counts = $derived.by(() => {
		const c: Record<string, number> = {};
		const session = $currentRouteStore;
		if (!session) return c;
		for (const t of session.trades) c[t.nodeId] = (c[t.nodeId] ?? 0) + t.qty;
		return c;
	});

	let visitOrder = $derived.by(() => {
		const out: string[] = [];
		const session = $currentRouteStore;
		if (!session) return out;
		for (const t of session.trades) {
			if (out.at(-1) !== t.nodeId) out.push(t.nodeId);
		}
		return out;
	});

	let lastNodeId = $derived(visitOrder.at(-1) ?? null);

	// Sync the derived data into the SvelteFlow nodes/edges arrays.
	// zIndex tier — labels live below the dot, so nodes with visible labels need to win
	// the cross-node stacking battle (xyflow renders nodes as DOM siblings; default
	// z-index draws them in DOM order, which is why visited labels were randomly
	// landing under adjacent dots).
	$effect(() => {
		nodes = effectiveNodes.map((n) => {
			const count = counts[n.id] ?? 0;
			const isOpen = $routeOpenNodeStore === n.id;
			const isLast = lastNodeId === n.id;
			const data: IslandNodeData = {
				name: n.name,
				tier: n.tier,
				region: n.region,
				count,
				isLast,
				isOpen,
				isCustom: "custom" in n && (n as { custom?: boolean }).custom === true,
				onSelect: () => routeOpenNodeStore.set(n.id),
			};
			return {
				id: n.id,
				type: "island",
				position: { x: n.x, y: n.y },
				data: data as unknown as Record<string, unknown>,
				draggable: false,
				selectable: false,
				connectable: false,
				zIndex: isOpen ? 200 : isLast ? 150 : count > 0 ? 100 : 1,
			};
		});

		const newEdges: Edge[] = [];
		for (let i = 1; i < visitOrder.length; i++) {
			const a = visitOrder[i - 1];
			const b = visitOrder[i];
			newEdges.push({
				id: `${a}->${b}`,
				source: a,
				target: b,
				animated: false,
				style: "stroke: var(--secondary-container); stroke-width: 1.5; stroke-dasharray: 4 4; opacity: 0.7;",
				type: "straight",
			});
		}
		edges = newEdges;
	});

	// ==================== Timer ====================

	onMount(() => {
		startRouteTicker();
	});
	onDestroy(() => {
		stopRouteTicker();
	});

	let timerSeconds = $derived(
		$currentRouteStore ? elapsedSeconds($currentRouteStore, $routeTickStore) : 0
	);
	let isRunning = $derived(($currentRouteStore?.pausedAt ?? null) === null);

	function fmtTime(s: number): string {
		const h = Math.floor(s / 3600);
		const m = Math.floor((s % 3600) / 60);
		const sec = s % 60;
		return h > 0
			? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
			: `${m}:${String(sec).padStart(2, "0")}`;
	}

	let totalSilver = $derived.by(() => {
		const s = $currentRouteStore;
		if (!s) return 0;
		return s.trades.reduce((a, t) => a + t.silverPerUnit * t.qty, 0);
	});

	let silverPerHr = $derived.by(() => {
		if (timerSeconds <= 0) return 0;
		return Math.round((totalSilver / timerSeconds) * 3600);
	});

	function toggleRunning() {
		if (!$currentRouteStore) return;
		if (isRunning) pauseRoute();
		else resumeRoute();
	}

	function onReset() {
		if (!$currentRouteStore || $currentRouteStore.trades.length === 0) {
			clearRoute();
			return;
		}
		if (confirm(m.bartering_routes_clear_confirm())) {
			clearRoute();
		}
	}

	async function onLogRoute() {
		const log = await finalizeRoute();
		if (log) routeOpenNodeStore.set(null);
	}

	// ==================== Parley ====================

	let parleyTotalSpent = $derived(
		$currentRouteStore ? totalParleySpent($currentRouteStore) : 0
	);
	let parleyMax = $derived($currentRouteStore?.parleyMax ?? PARLEY_MAX_DEFAULT);
	let parleyRefilled = $derived($currentRouteStore?.parleyRefilled ?? 0);
	let parleyRem = $derived(
		Math.max(0, Math.min(parleyMax, parleyMax + parleyRefilled - parleyTotalSpent))
	);
	let parleyPct = $derived(parleyMax > 0 ? Math.round((parleyRem / parleyMax) * 100) : 0);

	let refillOpen = $state(false);
	let refillAmount = $state(250000);

	function onRefill() {
		const result = refillParley(refillAmount);
		const applied = (result.applied / 1000).toFixed(0);
		const capped = (result.capped / 1000).toFixed(0);
		if (result.applied <= 0 && result.capped > 0) {
			showToast(m.bartering_routes_toast_cap(), "info");
		} else if (result.capped > 0) {
			showToast(m.bartering_routes_toast_capped({ applied, capped }), "info");
		} else {
			showToast(m.bartering_routes_toast_added({ applied }), "success");
		}
		refillOpen = false;
	}

	// ==================== Popover ====================

	let openNode = $derived.by(() => {
		const id = $routeOpenNodeStore;
		if (!id) return null;
		return nodeById.get(id) ?? null;
	});

	function closePopover() {
		routeOpenNodeStore.set(null);
	}

	// Close popover on Esc
	function onWindowKeyDown(e: KeyboardEvent) {
		if (e.key === "Escape" && $routeOpenNodeStore) closePopover();
	}
	onMount(() => {
		window.addEventListener("keydown", onWindowKeyDown);
	});
	onDestroy(() => {
		window.removeEventListener("keydown", onWindowKeyDown);
	});

	// ==================== Ledger ====================

	let trades = $derived($currentRouteStore?.trades ?? []);
	let reversedTrades = $derived([...trades].reverse());
</script>

<div class="routes-view">
	<!-- Timer strip -->
	<div class="timer-strip paper-card">
		<button
			type="button"
			class="play-btn"
			class:running={isRunning}
			onclick={toggleRunning}
			disabled={!$currentRouteStore}
			aria-label={isRunning ? m.bartering_routes_timer_pause() : m.bartering_routes_timer_resume()}
		>
			{isRunning ? "❚❚" : "▶"}
		</button>
		<div class="timer-info">
			<span class="timer-label">{m.bartering_routes_timer_label()}</span>
			<span class="timer-clock font-mono">{fmtTime(timerSeconds)}</span>
			<span class="timer-rate font-mono">{formatSilverShort(silverPerHr)}/h</span>
		</div>
		<Button variant="ghost" size="sm" onclick={onReset} disabled={!$currentRouteStore}>
			{m.bartering_routes_btn_reset()}
		</Button>
		<Button
			variant="primary"
			size="sm"
			onclick={onLogRoute}
			disabled={!$currentRouteStore || trades.length === 0}
		>
			{m.bartering_routes_btn_log()}
		</Button>
	</div>

	<!-- Map -->
	<div class="map-shell">
		<SvelteFlowProvider>
			<SvelteFlow
				bind:nodes
				bind:edges
				{nodeTypes}
				fitView
				minZoom={0.2}
				maxZoom={4}
				panOnDrag
				zoomOnScroll
				nodesDraggable={false}
				nodesConnectable={false}
				selectionOnDrag={false}
				proOptions={{ hideAttribution: true }}
				onpaneclick={closePopover}
			>
				<Background gap={40} />
				<!-- Source map underlay: 2560×2134 source image scaled by 0.52 to canvas units,
				     translated so Iliya's source pixel (1486.63, 1283.40) lands at canvas (700, 525).
				     Positioned via a wrapping div with transform: translate (xyflow-recommended pattern,
				     since putting position:absolute directly on the img doesn't anchor reliably to the
				     portal target). -->
				<ViewportPortal target="back">
					<div class="map-underlay-wrap" style:transform="translate(-73px, -142px)">
						<img
							src="/bartering/sailing-map.png"
							alt=""
							class="map-underlay"
							draggable="false"
						/>
					</div>
				</ViewportPortal>
			</SvelteFlow>
		</SvelteFlowProvider>

		{#if openNode}
			<div class="popover-anchor">
				<RouteTradePopover node={openNode} onClose={closePopover} />
			</div>
		{/if}
	</div>

	<!-- Parley bar -->
	<div class="parley-strip paper-card">
		<div class="parley-row">
			<span class="parley-label">{m.bartering_routes_parley_label()}</span>
			<span class="parley-amount font-mono" class:low={parleyPct < 25}>
				{Math.round(parleyRem / 1000)}K <span class="opacity-60">/ 1.0M</span>
			</span>
			{#if parleyRefilled > 0}
				<span class="parley-refilled font-mono">{m.bartering_routes_refilled_suffix({ amount: Math.round(parleyRefilled / 1000) })}</span>
			{/if}
			<button type="button" class="refill-btn" onclick={() => (refillOpen = !refillOpen)}>
				{m.bartering_routes_btn_refill()}
			</button>
		</div>
		<div class="parley-bar">
			<div
				class="parley-fill"
				class:low={parleyPct < 25}
				style:width="{parleyPct}%"
			></div>
		</div>
		{#if refillOpen}
			<div class="refill-pop paper-card">
				<label class="refill-label">
					{m.bartering_routes_refill_amount()}
					<input
						type="number"
						min="1"
						class="refill-input font-mono"
						bind:value={refillAmount}
					/>
				</label>
				<div class="refill-presets">
					{#each [100000, 250000, 500000, 1000000] as amt (amt)}
						<button type="button" class="refill-preset" onclick={() => (refillAmount = amt)}>
							{Math.round(amt / 1000)}K
						</button>
					{/each}
				</div>
				<button type="button" class="refill-confirm" onclick={onRefill}>{m.bartering_routes_refill_apply()}</button>
			</div>
		{/if}
	</div>

	<!-- Ledger -->
	<div class="ledger paper-card">
		<div class="ledger-head">
			<span class="ledger-title">{m.bartering_routes_ledger_title({ count: trades.length })}</span>
			{#if trades.length > 0}
				<span class="ledger-total font-mono">{formatSilverShort(totalSilver)}</span>
			{/if}
		</div>
		<div class="ledger-rows">
			{#if trades.length === 0}
				<div class="ledger-empty">{m.bartering_routes_ledger_empty()}</div>
			{:else}
				{#each reversedTrades as trade (trade.id)}
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
						<button
							type="button"
							class="row-remove"
							onclick={() => removeTrade(trade.id)}
							aria-label={m.bartering_routes_remove_trade()}
						>×</button>
					</div>
				{/each}
			{/if}
		</div>
	</div>
</div>

<style>
	.routes-view {
		display: flex;
		flex-direction: column;
		gap: 8px;
		height: 100%;
		min-height: 0;
	}

	/* Timer strip */
	.timer-strip {
		display: grid;
		grid-template-columns: auto 1fr auto auto;
		align-items: center;
		gap: 8px;
		padding: 6px 10px;
	}
	.play-btn {
		width: 28px;
		height: 28px;
		border: 0;
		border-radius: 50% !important;
		background: var(--surface-high);
		color: var(--secondary-container);
		font-family: 'IBM Plex Sans', system-ui, sans-serif;
		font-size: 12.5px;
		font-weight: 700;
		cursor: pointer;
	}
	.play-btn.running {
		background: var(--secondary-container);
		/* Teal on tint. Was `var(--bg, #0a0a0a)` — `--bg` is defined nowhere, a
		   leftover from the dark theme where the page ground was near-black and
		   made sense as the foreground on an accent fill. */
		color: var(--teal);
	}
	.play-btn:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}
	.timer-info {
		display: flex;
		align-items: baseline;
		gap: 8px;
	}
	.timer-label {
		font-family: 'IBM Plex Sans', system-ui, sans-serif;
		font-size: 12px;
		letter-spacing: 0.2em;
		color: var(--outline-hud);
	}
	.timer-clock {
		font-size: 18px;
		color: var(--on-surface);
	}
	.timer-rate {
		font-size: 12px;
		color: var(--outline-hud);
	}
	/* Map */
	.map-shell {
		position: relative;
		flex: 1;
		min-height: 200px;
		background: var(--surface-lowest);
		box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--outline-variant) 25%, transparent);
		overflow: hidden;
	}
	.map-shell :global(.svelte-flow) {
		background: transparent;
	}
	.map-shell :global(.svelte-flow__edge-path) {
		stroke: var(--secondary);
		stroke-width: 1.5;
	}
	/* Elevate hovered node above its neighbors so the hover label is never clipped
	   by an adjacent dot. Per-node zIndex (set in the $effect above) handles the
	   visited / open / last cases; this catches hover on unvisited nodes. */
	.map-shell :global(.svelte-flow__node:hover) {
		z-index: 300 !important;
	}
	.map-underlay-wrap {
		position: absolute;
		top: 0;
		left: 0;
		width: 1331px;
		height: 1110px;
		pointer-events: none;
		user-select: none;
	}
	.map-underlay {
		display: block;
		width: 100%;
		height: 100%;
		opacity: 0.85;
		-webkit-user-drag: none;
	}
	/* Light theme: source map is dark-themed, dim it more so dots stay readable */
	:global(.theme-light) .map-underlay {
		opacity: 0.55;
	}
	.popover-anchor {
		position: absolute;
		top: 8px;
		right: 8px;
		z-index: 10;
		max-height: calc(100% - 16px);
		overflow-y: auto;
	}

	/* Parley */
	.parley-strip {
		padding: 6px 10px;
		position: relative;
	}
	.parley-row {
		display: flex;
		align-items: baseline;
		gap: 8px;
		margin-bottom: 4px;
	}
	.parley-label {
		font-family: 'IBM Plex Sans', system-ui, sans-serif;
		font-size: 12px;
		letter-spacing: 0.2em;
		color: var(--outline-hud);
		font-weight: 600;
	}
	.parley-amount {
		font-size: 12.5px;
		color: var(--on-surface);
	}
	.parley-amount.low {
		color: var(--destructive);
	}
	.parley-refilled {
		font-size: 12px;
		color: var(--t2);
	}
	.refill-btn {
		margin-left: auto;
		padding: 3px 8px;
		background: var(--surface-lowest);
		color: var(--outline-hud);
		border: 0;
		font-family: 'IBM Plex Sans', system-ui, sans-serif;
		font-size: 12px;
		letter-spacing: 0.16em;
		font-weight: 700;
		box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--outline-variant) 35%, transparent);
		cursor: pointer;
	}
	.parley-bar {
		height: 4px;
		background: var(--surface-lowest);
	}
	.parley-fill {
		height: 100%;
		background: var(--primary-container);
		transition: width 0.25s ease-out;
	}
	.parley-fill.low {
		background: var(--destructive);
	}
	.refill-pop {
		position: absolute;
		top: 100%;
		right: 10px;
		margin-top: 4px;
		padding: 8px;
		display: flex;
		flex-direction: column;
		gap: 6px;
		width: 200px;
		z-index: 5;
	}
	.refill-label {
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-size: 12px;
		letter-spacing: 0.18em;
		color: var(--outline-hud);
	}
	.refill-input {
		padding: 5px 8px;
		background: var(--surface-lowest);
		color: var(--on-surface);
		border: 0;
		font-size: 12.5px;
		box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--outline-variant) 35%, transparent);
	}
	.refill-presets {
		display: flex;
		gap: 3px;
	}
	.refill-preset {
		flex: 1;
		padding: 4px 0;
		background: var(--surface-lowest);
		color: var(--outline-hud);
		border: 0;
		font-size: 12px;
		font-family: 'IBM Plex Mono', ui-monospace, monospace;
		cursor: pointer;
		box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--outline-variant) 30%, transparent);
	}
	.refill-confirm {
		padding: 6px 0;
		background: var(--primary-container);
		/* White on solid teal — near-black measured ~1.5:1 here. */
		color: #ffffff;
		border: 0;
		font-family: 'IBM Plex Sans', system-ui, sans-serif;
		font-size: 12px;
		font-weight: 700;
		letter-spacing: 0.16em;
		cursor: pointer;
	}

	/* Ledger */
	.ledger {
		flex: 0 1 180px;
		display: flex;
		flex-direction: column;
		min-height: 80px;
		max-height: 240px;
		padding: 6px 10px;
	}
	.ledger-head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		margin-bottom: 4px;
	}
	.ledger-title {
		font-family: 'IBM Plex Sans', system-ui, sans-serif;
		font-size: 12px;
		letter-spacing: 0.18em;
		color: var(--outline-hud);
		font-weight: 600;
	}
	.ledger-total {
		font-size: 12.5px;
		color: var(--on-surface);
	}
	.ledger-rows {
		flex: 1;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.ledger-empty {
		text-align: center;
		padding: 12px 0;
		font-size: 12px;
		color: var(--outline-hud);
		opacity: 0.6;
	}
	.ledger-row {
		display: grid;
		grid-template-columns: auto 70px auto 1fr auto auto auto;
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
		font-family: 'IBM Plex Sans', system-ui, sans-serif;
		font-size: 12px;
		color: var(--row-color);
		letter-spacing: 0.04em;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.row-name {
		font-size: 12.5px;
		color: var(--on-surface);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.row-qty {
		font-size: 12.5px;
		color: var(--row-color);
		min-width: 28px;
		text-align: right;
	}
	.row-silver {
		font-size: 12.5px;
		color: var(--on-surface);
		min-width: 56px;
		text-align: right;
	}
	.row-remove {
		background: none;
		border: 0;
		color: var(--outline-hud);
		font-size: 12px;
		opacity: 0.4;
		cursor: pointer;
	}
	.row-remove:hover {
		opacity: 0.9;
	}
</style>
