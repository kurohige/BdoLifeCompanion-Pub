<script lang="ts">
	// Compact label-over-value tile used for session/recipe summary rows.
	// `tone` colors the value: default = foreground, primary = accent emphasis,
	// live = cyan (use only for a running/active metric), danger = destructive.
	let {
		label,
		value,
		tone = "default",
		class: klass = "",
	}: {
		label: string;
		value: string;
		tone?: "default" | "primary" | "live" | "danger";
		class?: string;
	} = $props();
</script>

<div class="stat tone-{tone} {klass}">
	<span class="stat-label">{label}</span>
	<span class="stat-value">{value}</span>
</div>

<style>
	/* Economics-block tile — row surface, mono value (spec: 8px 10px on #faf9f6). */
	.stat {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 8px 10px;
		background: var(--row);
		border-radius: 10px;
	}
	.stat-label {
		font-size: 12px;
		color: var(--eyebrow-ink);
	}
	.stat-value {
		font-family: "IBM Plex Mono", ui-monospace, monospace;
		font-variant-numeric: tabular-nums;
		font-size: 15px;
		font-weight: 600;
		color: var(--ink);
	}
	.tone-primary .stat-value { color: var(--teal); }
	.tone-live .stat-value { color: var(--teal); }
	.tone-danger .stat-value { color: var(--rust); }
</style>
