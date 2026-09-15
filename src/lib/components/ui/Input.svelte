<script lang="ts">
	import type { HTMLInputAttributes } from "svelte/elements";

	let {
		value = $bindable(""),
		class: klass = "",
		...rest
	}: {
		value?: string;
		class?: string;
	} & HTMLInputAttributes = $props();
</script>

<input class="ui-input {klass}" bind:value {...rest} />

<style>
	.ui-input {
		width: 100%;
		background: var(--card-bg);
		border: 1px solid var(--card-border);
		border-radius: 11px;
		color: var(--ink);
		font-family: "IBM Plex Sans", system-ui, sans-serif;
		font-size: 13px;
		padding: 9px 13px;
		outline: none;
		transition: border-color 0.15s, box-shadow 0.15s;
	}
	.ui-input:focus {
		border-color: var(--teal);
		box-shadow: 0 0 0 1px rgb(var(--teal-rgb) / 0.3);
	}
	.ui-input::placeholder {
		color: var(--ink-faint);
	}
</style>
