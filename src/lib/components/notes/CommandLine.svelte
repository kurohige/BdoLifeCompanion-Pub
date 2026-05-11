<script lang="ts">
	import { onMount, onDestroy } from "svelte";
	import {
		notesCaptureCategoryStore,
		notesPanelOpenStore,
		addNote,
	} from "$lib/stores";
	import type { StickyTone } from "$lib/utils/sticky-colors";
	import { parseCapture } from "$lib/utils/note-parser";
	import { m } from "$lib/paraglide/messages";

	let { focusTone }: { focusTone: StickyTone } = $props();

	let inputEl: HTMLInputElement | undefined = $state();
	let value = $state("");

	function commit() {
		const cat = $notesCaptureCategoryStore;
		if (!cat) return;
		const note = parseCapture(value, cat);
		if (!note) return;
		addNote(note);
		value = "";
	}

	function onKey(e: KeyboardEvent) {
		if (e.key === "Enter") {
			e.preventDefault();
			commit();
		} else if (e.key === "Escape") {
			// Let the panel-level handler close on Escape, but blur the input first
			// so the keyboard event doesn't surprise the user.
			(e.target as HTMLElement).blur();
		}
	}

	// Ctrl+K / Cmd+K focuses the capture input while the panel is open.
	function onGlobalKey(e: KeyboardEvent) {
		if (!$notesPanelOpenStore) return;
		const k = e.key.toLowerCase();
		if ((e.ctrlKey || e.metaKey) && k === "k") {
			e.preventDefault();
			inputEl?.focus();
			inputEl?.select();
		}
	}

	onMount(() => {
		window.addEventListener("keydown", onGlobalKey);
	});
	onDestroy(() => {
		window.removeEventListener("keydown", onGlobalKey);
	});

	// Auto-focus on first open.
	$effect(() => {
		if ($notesPanelOpenStore) {
			queueMicrotask(() => inputEl?.focus());
		}
	});
</script>

<div class="cmd-wrap" style:border-top-color="{focusTone.fg}40">
	<div
		class="cmd-row"
		style:border-color="{focusTone.fg}30"
	>
		<span class="prompt" style:color={focusTone.fg}>›</span>
		<input
			bind:this={inputEl}
			bind:value
			onkeydown={onKey}
			placeholder={m.notes_capture_placeholder()}
			class="cmd-input"
		/>
		<span class="hint" style:color={focusTone.fg}>{m.notes_capture_hint()}</span>
	</div>
</div>

<style>
	.cmd-wrap {
		padding: 8px 10px 10px;
		border-top-style: solid;
		border-top-width: 1px;
		background: rgba(0, 0, 0, 0.5);
		flex-shrink: 0;
	}
	.cmd-row {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 10px;
		background: rgba(0, 0, 0, 0.4);
		border-style: solid;
		border-width: 1px;
		border-radius: 2px;
	}
	.prompt {
		font-family: var(--font-mono);
		font-size: 11px;
	}
	.cmd-input {
		flex: 1;
		min-width: 0;
		background: transparent;
		border: 0;
		outline: none;
		font-family: var(--font-mono);
		font-size: 11px;
		color: #e5e2e1;
	}
	.cmd-input::placeholder {
		color: #5a5662;
	}
	.hint {
		font-family: var(--font-display);
		font-size: 9px;
		letter-spacing: 0.18em;
		opacity: 0.7;
		white-space: nowrap;
	}
</style>
