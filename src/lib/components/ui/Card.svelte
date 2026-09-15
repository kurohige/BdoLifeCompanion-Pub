<script lang="ts">
	import type { Snippet } from "svelte";
	import type { HTMLAttributes } from "svelte/elements";

	let {
		children,
		padding = "md",
		class: klass = "",
		...rest
	}: {
		children: Snippet;
		padding?: "none" | "sm" | "md";
		class?: string;
	} & HTMLAttributes<HTMLDivElement> = $props();
</script>

<div class="card pad-{padding} {klass}" {...rest}>
	{@render children()}
</div>

<style>
	.card {
		background: var(--card-bg);
		border: 1px solid var(--card-border);
		border-radius: 16px;
	}
	.pad-none { padding: 0; }
	.pad-sm { padding: 12px; }
	.pad-md { padding: 15px; }
</style>
