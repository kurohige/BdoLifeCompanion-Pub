<script lang="ts">
	// Unified sub-tab row used across Crafting (icon + text), Grinding and
	// Bartering (text only). Segmented control: the active item takes the white
	// card ground and teal label. One style, everywhere — replaces the three
	// divergent pill styles.
	interface SubTabItem {
		id: string;
		label?: string;
		icon?: string;
		title?: string;
	}

	let {
		tabs,
		active,
		onSelect,
	}: {
		tabs: SubTabItem[];
		active: string;
		onSelect: (id: string) => void;
	} = $props();
</script>

<div class="subtabs-row" role="tablist">
	{#each tabs as tab (tab.id)}
		<button
			type="button"
			role="tab"
			aria-selected={active === tab.id}
			aria-label={tab.title ?? tab.label ?? tab.id}
			onclick={() => onSelect(tab.id)}
			title={tab.title ?? tab.label ?? tab.id}
			class="subtab {active === tab.id ? 'subtab-active' : ''}"
		>
			{#if tab.icon}<img src={tab.icon} alt="" class="subtab-icon" />{/if}
			{#if tab.label}<span>{tab.label}</span>{/if}
		</button>
	{/each}
</div>

<style>
	/* Segmented control — items on an #efece5 track, active item white with
	   teal text (spec: track padding 3 / radius 10, segments 5px 11px / 11px). */
	.subtabs-row {
		display: inline-flex;
		align-items: stretch;
		gap: 4px;
		padding: 3px;
		background: var(--track);
		border-radius: 10px;
	}
	.subtab {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		padding: 5px 11px;
		font-family: "IBM Plex Sans", sans-serif;
		font-size: 12.5px;
		font-weight: 500;
		color: var(--ink-muted);
		background: transparent;
		border: none;
		border-radius: 7px;
		cursor: pointer;
		transition: color 0.15s, background 0.15s;
	}
	.subtab:hover {
		color: var(--ink);
	}
	.subtab-active {
		color: var(--teal);
		background: var(--card-bg);
		font-weight: 600;
	}
	.subtab-active:hover {
		color: var(--teal);
	}
	/* Full-strength in every state: the active segment is already marked by the
	   white ground + teal label, so icons don't need a dimmed resting state. */
	.subtab-icon {
		height: 19px;
		width: auto;
		object-fit: contain;
	}
</style>
