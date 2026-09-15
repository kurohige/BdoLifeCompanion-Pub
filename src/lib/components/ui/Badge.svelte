<script lang="ts">
	import type { Snippet } from "svelte";

	// `tone` covers the common semantic chips. For data colors that aren't in the
	// semantic set (e.g. a barter tier or loot-rarity color), pass `color` with a
	// hex/CSS color and it's applied muted — text + faint tint + soft border.
	let {
		children,
		tone = "neutral",
		color,
		class: klass = "",
	}: {
		children: Snippet;
		tone?: "neutral" | "primary" | "info" | "success" | "warning" | "danger";
		color?: string;
		class?: string;
	} = $props();

	let style = $derived(
		color
			? `color:${color};background:color-mix(in srgb, ${color} 14%, transparent);border-color:color-mix(in srgb, ${color} 32%, transparent);`
			: "",
	);
</script>

<span class="badge {color ? '' : `tone-${tone}`} {klass}" {style}>
	{@render children()}
</span>

<style>
	/* Tag pill — 2px 8px / 10px 600, radius 999 (pill scale). */
	.badge {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-family: "IBM Plex Sans", sans-serif;
		font-size: 12px;
		font-weight: 600;
		line-height: 1.4;
		padding: 2px 8px;
		border: 1px solid transparent;
		border-radius: 999px;
		white-space: nowrap;
	}
	.tone-neutral {
		color: var(--ink-muted);
		background: var(--chip);
	}
	.tone-primary {
		color: var(--teal);
		background: var(--teal-tint);
	}
	.tone-info {
		color: #2f6fa8;
		background: color-mix(in srgb, #2f6fa8 12%, transparent);
	}
	.tone-success {
		color: var(--live-dot);
		background: color-mix(in srgb, #3f8560 12%, transparent);
	}
	.tone-warning {
		color: var(--amber);
		background: color-mix(in srgb, #c07c2c 12%, transparent);
	}
	.tone-danger {
		color: var(--rust);
		background: #f6ece7;
		border-color: var(--rust-tint-border);
	}
</style>
