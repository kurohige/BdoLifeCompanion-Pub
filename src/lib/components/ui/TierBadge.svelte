<script lang="ts">
	import type { BarterTier } from "$lib/models/bartering";

	interface Props {
		tier: BarterTier;
		sp?: boolean;
		size?: number;
	}

	let { tier, sp = false, size = 18 }: Props = $props();

	let label = $derived(sp ? "SP" : `T${tier}`);
	let colorVar = $derived(sp ? "var(--tsp)" : `var(--t${tier})`);
	let fontSize = $derived(sp ? Math.round(size * 0.46) : Math.round(size * 0.52));
</script>

<span
	class="tier-badge font-headline"
	style:width="{size}px"
	style:height="{size}px"
	style:font-size="{fontSize}px"
	style:--tier-color={colorVar}
>
	{label}
</span>

<style>
	.tier-badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		background: color-mix(in oklab, var(--tier-color) 18%, transparent);
		border: 1px solid color-mix(in oklab, var(--tier-color) 55%, transparent);
		color: var(--tier-color);
		font-weight: 700;
		letter-spacing: 0.02em;
		line-height: 1;
		border-radius: 3px;
	}
</style>
