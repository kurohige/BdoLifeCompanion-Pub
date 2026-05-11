<script lang="ts">
	import {
		noteCategoriesStore,
		notesActiveCategoryStore,
		notesStore,
		renameCategory,
		deleteCategory,
	} from "$lib/stores";
	import { STICKY_COLORS, type StickyTone } from "$lib/utils/sticky-colors";
	import { MAX_CATEGORY_NAME_LEN } from "$lib/models/notes";
	import { m } from "$lib/paraglide/messages";
	import { confirm as tauriConfirm } from "@tauri-apps/plugin-dialog";

	let { focusTone }: { focusTone: StickyTone } = $props();

	let activeCat = $derived(
		$noteCategoriesStore.find((c) => c.key === $notesActiveCategoryStore) ?? null,
	);
	let activeTone = $derived(activeCat ? STICKY_COLORS[activeCat.color] : focusTone);

	// Count of notes for whatever is showing.
	let displayCount = $derived(
		activeCat
			? $notesStore.filter((n) => n.category_key === activeCat.key).length
			: $notesStore.length,
	);

	let editing = $state(false);
	let draft = $state("");

	function startEdit() {
		if (!activeCat) return;
		draft = activeCat.name;
		editing = true;
	}

	function commitEdit() {
		if (!activeCat) return;
		renameCategory(activeCat.key, draft);
		editing = false;
	}

	function cancelEdit() {
		editing = false;
	}

	function onKey(e: KeyboardEvent) {
		if (e.key === "Enter") {
			e.preventDefault();
			commitEdit();
		} else if (e.key === "Escape") {
			e.stopPropagation();
			cancelEdit();
		}
	}

	function clearFilter() {
		notesActiveCategoryStore.set(null);
	}

	async function onDelete() {
		// Use Tauri's async dialog plugin — native confirm() does not block
		// reliably when called from within the notes overlay portal (z=61).
		if (!activeCat) return;
		if ($noteCategoriesStore.length <= 1) return;
		const msg = m.notes_delete_category_confirm({ name: activeCat.name });
		const ok = await tauriConfirm(msg, {
			title: m.notes_delete_category(),
			kind: "warning",
		});
		if (ok) deleteCategory(activeCat.key);
	}
</script>

<div
	class="strip"
	style:background="linear-gradient(90deg, {activeTone.fg}10, transparent 80%)"
>
	<span
		class="dot"
		style:background={activeTone.fg}
		style:box-shadow="0 0 8px {activeTone.fg}"
	></span>

	{#if activeCat}
		{#if editing}
			<!-- svelte-ignore a11y_autofocus -->
			<input
				bind:value={draft}
				onblur={commitEdit}
				onkeydown={onKey}
				maxlength={MAX_CATEGORY_NAME_LEN}
				class="name-input"
				style:color={activeTone.fg}
				style:border-bottom-color="{activeTone.fg}80"
				autofocus
			/>
		{:else}
			<button
				type="button"
				class="name-btn"
				onclick={startEdit}
				style:color={activeTone.fg}
				style:border-bottom-color="{activeTone.fg}40"
				title={m.notes_rename_category_title()}
			>{activeCat.name}</button>
		{/if}
		<span class="count">· {m.notes_count_notes({ count: displayCount })}</span>
		<div class="spacer"></div>
		{#if $noteCategoriesStore.length > 1}
			<button
				type="button"
				class="delete-btn"
				onclick={onDelete}
				title={m.notes_delete_category()}
				aria-label={m.notes_delete_category()}
			>×</button>
		{/if}
	{:else}
		<!-- "all" mode: clearing the filter shows every category. Compact label only. -->
		<span class="count" style:color={focusTone.fg}>· {m.notes_count_notes({ count: displayCount })}</span>
		<div class="spacer"></div>
	{/if}

	{#if activeCat}
		<button
			type="button"
			class="clear-btn"
			onclick={clearFilter}
			style:color={activeTone.fg}
		>{m.notes_clear_filter()}</button>
	{/if}
</div>

<style>
	.strip {
		padding: 6px 10px;
		display: flex;
		align-items: center;
		gap: 8px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.04);
		flex-shrink: 0;
		min-height: 30px;
	}
	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}
	.name-btn,
	.name-input {
		background: transparent;
		border: 0;
		border-bottom: 1px dashed transparent;
		font-family: var(--font-display);
		font-size: 11px;
		letter-spacing: 0.16em;
		padding: 0 0 2px;
		cursor: text;
		outline: none;
		min-width: 0;
		max-width: 180px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.name-btn {
		border-bottom-style: dashed;
		border-bottom-width: 1px;
	}
	.name-input {
		border-bottom-style: dashed;
		border-bottom-width: 1px;
	}
	.count {
		font-family: var(--font-mono);
		font-size: 10px;
		color: #998d9d;
		white-space: nowrap;
	}
	.spacer {
		flex: 1;
	}
	.clear-btn {
		font-family: var(--font-mono);
		font-size: 10px;
		opacity: 0.7;
		cursor: pointer;
		white-space: nowrap;
		background: transparent;
		border: 0;
		padding: 0;
	}
	.clear-btn:hover {
		opacity: 1;
	}
	.delete-btn {
		background: transparent;
		border: 0;
		color: #998d9d;
		font-size: 14px;
		line-height: 1;
		cursor: pointer;
		padding: 0 4px;
		border-radius: 2px;
	}
	.delete-btn:hover {
		color: #ffb4ab;
		background: rgba(255, 180, 171, 0.08);
	}
</style>
