<script lang="ts">
	import { islandsDataStore, barterMapLayoutStore } from "$lib/stores";
	import type { IslandNode } from "$lib/models/bartering";

	interface Props {
		visitedNodeIds: string[];
		width?: number;
		height?: number;
		showLabels?: boolean;
	}

	let { visitedNodeIds, width = 96, height = 56, showLabels = false }: Props = $props();

	// Build effective node lookup
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

	let visitedNodes = $derived.by(() => {
		const out: IslandNode[] = [];
		for (const id of visitedNodeIds) {
			const n = nodeById.get(id);
			if (n) out.push(n);
		}
		return out;
	});

	// Compute viewBox tight to visited nodes (with padding)
	let viewBox = $derived.by(() => {
		const ns = visitedNodes;
		if (ns.length === 0) return { x: 0, y: 0, w: 2000, h: 1500 };
		let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
		for (const n of ns) {
			if (n.x < minX) minX = n.x;
			if (n.y < minY) minY = n.y;
			if (n.x > maxX) maxX = n.x;
			if (n.y > maxY) maxY = n.y;
		}
		// Pad by 10% of the larger axis (or fixed minimum for single-node sets)
		const span = Math.max(maxX - minX, maxY - minY, 200);
		const pad = span * 0.15;
		const cx = (minX + maxX) / 2;
		const cy = (minY + maxY) / 2;
		const half = (span / 2) + pad;
		// Maintain target aspect ratio
		const aspect = width / height;
		let w = half * 2;
		let h = half * 2;
		if (aspect >= 1) {
			w = h * aspect;
		} else {
			h = w / aspect;
		}
		return { x: cx - w / 2, y: cy - h / 2, w, h };
	});

	let polyPoints = $derived(visitedNodes.map((n) => `${n.x},${n.y}`).join(" "));

	let dotRadius = $derived(Math.max(3, Math.min(viewBox.w, viewBox.h) * 0.012));
</script>

<div class="map-preview" style:width="{width}px" style:height="{height}px">
	<svg
		viewBox="{viewBox.x} {viewBox.y} {viewBox.w} {viewBox.h}"
		preserveAspectRatio="xMidYMid meet"
		role="img"
		aria-label="Route map ({visitedNodes.length} stops)"
	>
		{#if visitedNodes.length > 1}
			<polyline
				points={polyPoints}
				fill="none"
				stroke="var(--secondary)"
				stroke-width={dotRadius * 0.4}
				stroke-dasharray="{dotRadius * 1.2} {dotRadius * 1.2}"
				stroke-linejoin="round"
				opacity="0.6"
			/>
		{/if}
		{#each visitedNodes as n, i (n.id + "-" + i)}
			<g>
				<circle
					cx={n.x}
					cy={n.y}
					r={dotRadius}
					fill="var(--t{n.tier})"
					style="filter: drop-shadow(0 0 {dotRadius * 0.6}px var(--t{n.tier}));"
				/>
				{#if showLabels}
					<text
						x={n.x}
						y={n.y + dotRadius * 2.5}
						text-anchor="middle"
						font-size={dotRadius * 2.2}
						font-family="Space Grotesk, system-ui"
						font-weight="600"
						fill="var(--outline-hud)"
						style="text-transform: uppercase;"
					>{n.name}</text>
				{/if}
			</g>
		{/each}
	</svg>
</div>

<style>
	.map-preview {
		background: var(--surface-lowest);
		box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--outline-variant) 25%, transparent);
		overflow: hidden;
	}
	svg {
		display: block;
		width: 100%;
		height: 100%;
	}
</style>
