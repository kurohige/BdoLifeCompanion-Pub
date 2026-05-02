<script lang="ts">
	import type { BarterTier, IslandRegion } from "$lib/models/bartering";

	export interface IslandNodeData {
		name: string;
		tier: BarterTier;
		region: IslandRegion;
		count: number;
		isLast: boolean;
		isOpen: boolean;
		isCustom: boolean;
		onSelect: () => void;
	}

	interface Props {
		data: IslandNodeData;
	}

	let { data }: Props = $props();

	// 3D-marker dots: base 4px radius (8px diameter), grows to 8px (16px) at high counts.
	// Visibility comes from the dark halo + radial gradient, not raw size.
	let radius = $derived(4 + Math.min(4, data.count * 0.3));
	let visited = $derived(data.count > 0);
	let tierVar = $derived(`var(--t${data.tier})`);
</script>

<button
	type="button"
	class="island-node"
	class:visited
	class:open={data.isOpen}
	class:custom={data.isCustom}
	style:--tier-color={tierVar}
	style:--node-size="{radius * 2}px"
	onclick={data.onSelect}
	aria-label="{data.name} (Tier {data.tier})"
>
	<span class="ring" class:pulse={data.isLast}></span>
	<span class="dot">
		{#if visited && data.count > 0}
			<span class="count">{data.count}</span>
		{/if}
	</span>
	<span class="label">{data.name}</span>
</button>

<style>
	.island-node {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		font-family: 'Space Grotesk', system-ui, sans-serif;
	}
	.dot {
		width: var(--node-size);
		height: var(--node-size);
		border-radius: 50% !important;
		/* Radial gradient gives a 3D sphere look — bright top-left, full color elsewhere */
		background:
			radial-gradient(
				circle at 32% 30%,
				color-mix(in oklab, var(--tier-color) 40%, white),
				var(--tier-color) 70%
			);
		border: 1.5px solid color-mix(in oklab, var(--tier-color) 70%, black);
		/* Dark outer halo + drop shadow for separation from the map background */
		box-shadow:
			0 0 0 1px rgba(0, 0, 0, 0.85),
			0 1px 3px rgba(0, 0, 0, 0.7);
		display: flex;
		align-items: center;
		justify-content: center;
		transition: transform 0.15s ease-out, box-shadow 0.15s ease-out;
	}
	.island-node.visited .dot {
		/* Visited gets a brighter gradient + a colored glow on top of the halo */
		background:
			radial-gradient(
				circle at 32% 30%,
				color-mix(in oklab, var(--tier-color) 25%, white),
				var(--tier-color) 60%
			);
		box-shadow:
			0 0 0 1px rgba(0, 0, 0, 0.85),
			0 1px 3px rgba(0, 0, 0, 0.7),
			0 0 8px var(--tier-color);
	}
	.island-node.open .dot {
		border-width: 2.5px;
		transform: scale(1.4);
	}
	.island-node:hover .dot {
		transform: scale(1.35);
		box-shadow:
			0 0 0 1px rgba(0, 0, 0, 0.9),
			0 2px 4px rgba(0, 0, 0, 0.8),
			0 0 12px var(--tier-color);
	}
	.island-node.custom .dot {
		border-style: dashed;
	}
	.count {
		font-size: 7px;
		font-weight: 700;
		color: var(--bg, #0a0a0a);
		font-variant-numeric: tabular-nums;
		line-height: 1;
	}
	/* Labels are hidden by default to reduce cluster clutter.
	   Shown for: visited nodes, open popover, last visited (pulse), and on hover. */
	.label {
		position: absolute;
		top: 100%;
		left: 50%;
		transform: translateX(-50%);
		margin-top: 3px;
		font-size: 9px;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--outline-hud);
		white-space: nowrap;
		font-weight: 700;
		pointer-events: none;
		display: none;
	}
	.island-node.visited .label,
	.island-node.open .label {
		display: block;
		color: var(--tier-color);
	}
	.island-node:hover .label {
		display: block;
		color: var(--tier-color);
		background: color-mix(in oklab, var(--surface-lowest) 92%, transparent);
		padding: 1px 4px;
		z-index: 30;
	}
	.ring {
		position: absolute;
		top: 0;
		left: 50%;
		transform: translateX(-50%);
		width: var(--node-size);
		height: var(--node-size);
		border-radius: 50% !important;
		border: 1px solid var(--tier-color);
		opacity: 0;
		pointer-events: none;
	}
	.ring.pulse {
		animation: pulse-ring 1.6s ease-out infinite;
	}
	@keyframes pulse-ring {
		0% {
			width: var(--node-size);
			height: var(--node-size);
			opacity: 0.8;
		}
		100% {
			width: calc(var(--node-size) * 2.4);
			height: calc(var(--node-size) * 2.4);
			opacity: 0;
		}
	}
</style>
