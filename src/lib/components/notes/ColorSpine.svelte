<script lang="ts">
	import {
		noteCategoriesStore,
		notesActiveCategoryStore,
		notesCaptureCategoryStore,
		notesStore,
		addCategory,
	} from "$lib/stores";
	import { STICKY_COLORS, type StickyTone } from "$lib/utils/sticky-colors";
	import { MAX_CATEGORIES } from "$lib/models/notes";
	import { m } from "$lib/paraglide/messages";

	let { focusTone }: { focusTone: StickyTone } = $props();

	let counts = $derived.by(() => {
		const map = new Map<string, number>();
		for (const n of $notesStore) map.set(n.category_key, (map.get(n.category_key) ?? 0) + 1);
		return map;
	});

	function selectShelf(key: string) {
		// Click toggles: tapping the active shelf clears the filter (back to "all")
		// but keeps capture bound to that category — matches the design spec.
		if ($notesActiveCategoryStore === key) {
			notesActiveCategoryStore.set(null);
		} else {
			notesActiveCategoryStore.set(key);
			notesCaptureCategoryStore.set(key);
		}
	}

	function addNew() {
		const cat = addCategory(m.notes_new_category_default_name());
		if (cat) {
			notesActiveCategoryStore.set(cat.key);
			notesCaptureCategoryStore.set(cat.key);
		}
	}

	let canAdd = $derived($noteCategoriesStore.length < MAX_CATEGORIES);
</script>

<div class="spine" style:border-right-color="{focusTone.fg}30">
	<!-- top cap: note glyph -->
	<div class="cap top" style:color={focusTone.fg} style:border-bottom-color="{focusTone.fg}20">
		<svg width="14" height="14" viewBox="0 0 14 14" fill="none">
			<path d="M2.5 2h6.5l3 3v7H2.5z" stroke="currentColor" stroke-width="1.2" />
			<path d="M9 2v3h3" stroke="currentColor" stroke-width="1.2" />
		</svg>
	</div>

	<!-- scrollable shelf stack -->
	<div class="shelves no-scrollbar">
		{#each $noteCategoriesStore as cat (cat.key)}
			{@const tone = STICKY_COLORS[cat.color]}
			{@const on = $notesActiveCategoryStore === cat.key}
			<button
				type="button"
				class="shelf"
				class:on
				onclick={() => selectShelf(cat.key)}
				style:background={on ? tone.bg : "transparent"}
				style:border-left-color={on ? tone.fg : "transparent"}
				title={cat.name}
			>
				<span
					class="shelf-label"
					style:color={on ? tone.fg : "#4d4352"}
				>{cat.name}</span>
				<span class="shelf-count" style:color={on ? tone.fg : "#4d4352"}>
					{counts.get(cat.key) ?? 0}
				</span>
			</button>
		{/each}
	</div>

	<!-- bottom cap: + add category -->
	<button
		type="button"
		class="cap bottom"
		onclick={addNew}
		disabled={!canAdd}
		style:color={focusTone.fg}
		style:border-top-color="{focusTone.fg}30"
		style:background="linear-gradient(180deg, transparent, {focusTone.fg}15)"
		title={canAdd ? m.notes_add_category_title() : m.notes_categories_cap_reached({ max: MAX_CATEGORIES })}
	>
		<svg width="12" height="12" viewBox="0 0 12 12" fill="none">
			<path d="M6 2v8M2 6h8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
		</svg>
	</button>
</div>

<style>
	.spine {
		flex: 0 0 34px;
		display: flex;
		flex-direction: column;
		background: rgba(0, 0, 0, 0.55);
		border-right-style: solid;
		border-right-width: 1px;
		overflow: hidden;
	}
	.cap {
		flex: 0 0 34px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-style: solid;
		border-width: 0;
		background: transparent;
		padding: 0;
	}
	.cap.top {
		border-bottom-width: 1px;
	}
	.cap.bottom {
		border-top-width: 1px;
		cursor: pointer;
	}
	.cap.bottom:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}
	.shelves {
		flex: 1;
		overflow-y: auto;
		overflow-x: hidden;
		position: relative;
	}
	.shelf {
		height: 96px;
		width: 100%;
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		border: 0;
		border-left: 2px solid transparent;
		padding: 0;
		background: transparent;
	}
	.shelf-label {
		writing-mode: vertical-rl;
		transform: rotate(180deg);
		font-family: var(--font-display);
		font-size: 9px;
		letter-spacing: 0.32em;
		text-transform: uppercase;
		padding: 6px 0;
		white-space: nowrap;
		max-height: 80px;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.shelf-count {
		position: absolute;
		bottom: 6px;
		font-family: var(--font-mono);
		font-size: 9px;
		font-variant-numeric: tabular-nums;
	}
	.no-scrollbar::-webkit-scrollbar {
		display: none;
	}
	.no-scrollbar {
		scrollbar-width: none;
	}
</style>
