<script lang="ts">
	import type { Snippet } from "svelte";

	// Two roles: a plain secondary label (default) or an uppercase HUD eyebrow
	// (the opt-in tactical style — replaces the old global forced-uppercase).
	let {
		children,
		eyebrow = false,
		class: klass = "",
	}: {
		children: Snippet;
		eyebrow?: boolean;
		class?: string;
	} = $props();
</script>

{#if eyebrow}
	<span class="hud-eyebrow {klass}">{@render children()}</span>
{:else}
	<span class="ui-label {klass}">{@render children()}</span>
{/if}

<style>
	.ui-label {
		font-size: var(--text-label);
		color: hsl(var(--muted-foreground));
	}
</style>
