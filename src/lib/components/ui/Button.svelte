<script lang="ts">
	import type { Snippet } from "svelte";
	import type { HTMLButtonAttributes } from "svelte/elements";

	let {
		children,
		variant = "secondary",
		size = "md",
		class: klass = "",
		...rest
	}: {
		children: Snippet;
		variant?: "primary" | "secondary" | "ghost" | "danger";
		size?: "sm" | "md";
		class?: string;
	} & HTMLButtonAttributes = $props();
</script>

<button class="btn btn-{variant} size-{size} {klass}" {...rest}>
	{@render children()}
</button>

<style>
	/* Action pill — 8px 11-13px / 10.5-12px 600-700, radius 9-10 (pill scale). */
	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		font-family: "IBM Plex Sans", sans-serif;
		font-weight: 600;
		border: 1px solid transparent;
		border-radius: 10px;
		cursor: pointer;
		transition: background 0.15s, border-color 0.15s, filter 0.15s;
		white-space: nowrap;
	}
	.size-md { font-size: 12px; padding: 8px 13px; }
	.size-sm { font-size: 12.5px; padding: 7px 12px; border-radius: 9px; }

	.btn-primary {
		background: var(--teal);
		color: #ffffff;
		font-weight: 700;
	}
	.btn-primary:hover { filter: brightness(1.08); }

	.btn-secondary {
		background: var(--chip);
		color: var(--ink-mid);
	}
	.btn-secondary:hover {
		background: var(--track);
	}

	.btn-ghost {
		background: transparent;
		color: var(--ink-muted);
	}
	.btn-ghost:hover {
		background: var(--chip);
		color: var(--ink);
	}

	.btn-danger {
		background: transparent;
		color: var(--rust);
		border-color: #eccfc8;
	}
	.btn-danger:hover { background: var(--rust-tint); }

	.btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
		filter: none;
	}
</style>
