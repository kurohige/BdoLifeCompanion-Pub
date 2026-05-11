<script lang="ts">
	import { notesSearchStore } from "$lib/stores";
	import type { StickyTone } from "$lib/utils/sticky-colors";
	import { m } from "$lib/paraglide/messages";

	let {
		focusTone,
		onClose,
		onFlip,
	}: { focusTone: StickyTone; onClose: () => void; onFlip: () => void } = $props();

	let searchActive = $state(false);
	let searchEl: HTMLInputElement | undefined = $state();

	function toggleSearch() {
		searchActive = !searchActive;
		if (searchActive) {
			// Focus the input once it mounts. Microtask delay avoids the click
			// event also stealing focus back.
			queueMicrotask(() => searchEl?.focus());
		} else {
			notesSearchStore.set("");
		}
	}

	function onSearchKey(e: KeyboardEvent) {
		if (e.key === "Escape") {
			e.stopPropagation();
			toggleSearch();
		}
	}
</script>

<div class="header" style:border-bottom-color="{focusTone.fg}30">
	{#if searchActive}
		<!-- svelte-ignore a11y_autofocus -->
		<input
			bind:this={searchEl}
			bind:value={$notesSearchStore}
			placeholder={m.notes_search_placeholder()}
			onkeydown={onSearchKey}
			class="search-input"
			style:color={focusTone.fg}
			style:border-bottom-color="{focusTone.fg}40"
		/>
	{:else}
		<span class="title" style:color={focusTone.fg} style:text-shadow="0 0 8px {focusTone.fg}60">
			{m.notes_title()}
		</span>
	{/if}
	<div class="spacer"></div>

	<button type="button" class="chrome-btn" onclick={toggleSearch} title={m.notes_search_title()} aria-label={m.notes_search_title()}>
		<svg width="12" height="12" viewBox="0 0 12 12" fill="none">
			<circle cx="5" cy="5" r="3.2" stroke="currentColor" stroke-width="1.1" />
			<path d="M7.5 7.5l3 3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
		</svg>
	</button>

	<button type="button" class="chrome-btn" onclick={onFlip} title={m.notes_flip_title()} aria-label={m.notes_flip_title()}>
		<svg width="12" height="12" viewBox="0 0 12 12" fill="none">
			<path d="M2 6h8M4 4L2 6l2 2M8 4l2 2-2 2" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" />
		</svg>
	</button>

	<button type="button" class="chrome-btn danger" onclick={onClose} title={m.notes_close_title()} aria-label={m.notes_close_title()}>
		<svg width="12" height="12" viewBox="0 0 12 12" fill="none">
			<path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
		</svg>
	</button>
</div>

<style>
	.header {
		height: 38px;
		padding: 0 10px;
		display: flex;
		align-items: center;
		gap: 6px;
		border-bottom-style: solid;
		border-bottom-width: 1px;
		background: rgba(0, 0, 0, 0.45);
		flex-shrink: 0;
	}
	.title {
		font-family: var(--font-display);
		font-size: 9px;
		letter-spacing: 0.32em;
		white-space: nowrap;
	}
	.search-input {
		flex: 1;
		min-width: 0;
		background: transparent;
		border: 0;
		border-bottom-style: solid;
		border-bottom-width: 1px;
		font-family: var(--font-mono);
		font-size: 11px;
		padding: 2px 2px 4px;
		outline: none;
	}
	.search-input::placeholder {
		color: #5a5662;
	}
	.spacer {
		flex: 1;
	}
	.chrome-btn {
		width: 20px;
		height: 20px;
		border: 0;
		background: transparent;
		color: #998d9d;
		border-radius: 3px;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		padding: 0;
		transition: background 0.15s, color 0.15s;
	}
	.chrome-btn:hover {
		background: rgba(255, 255, 255, 0.06);
		color: #e5e2e1;
	}
	.chrome-btn.danger {
		color: #ffb4ab;
	}
	.chrome-btn.danger:hover {
		background: rgba(255, 180, 171, 0.12);
	}
</style>
