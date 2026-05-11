<script lang="ts">
	import { fade, fly } from "svelte/transition";
	import { cubicOut } from "svelte/easing";
	import { onMount, onDestroy } from "svelte";
	import {
		notesPanelOpenStore,
		notesActiveCategoryStore,
		noteCategoriesStore,
		notesCaptureCategoryStore,
		settingsStore,
		setNotesPanelDockSide,
	} from "$lib/stores";
	import { STICKY_COLORS } from "$lib/utils/sticky-colors";
	import ColorSpine from "./notes/ColorSpine.svelte";
	import PanelHeader from "./notes/PanelHeader.svelte";
	import FilterStrip from "./notes/FilterStrip.svelte";
	import NotesList from "./notes/NotesList.svelte";
	import CommandLine from "./notes/CommandLine.svelte";

	const PANEL_WIDTH = 360;

	let dockSide = $derived($settingsStore.notes_panel_dock_side);
	let isLeft = $derived(dockSide === "left");

	// The "focus color" feeds the chrome accents + slab gradient. Use the active
	// filter's category color when set; otherwise the first category; final
	// fallback to slate so the panel still renders before categories load.
	let focusCategory = $derived(
		$noteCategoriesStore.find((c) => c.key === $notesActiveCategoryStore) ??
			$noteCategoriesStore[0] ??
			null,
	);
	let focusTone = $derived(focusCategory ? STICKY_COLORS[focusCategory.color] : STICKY_COLORS.slate);

	function close() {
		notesPanelOpenStore.set(false);
	}

	function flip() {
		setNotesPanelDockSide(dockSide === "right" ? "left" : "right");
	}

	function onBackdropClick() {
		close();
	}

	function onKeyDown(e: KeyboardEvent) {
		if (!$notesPanelOpenStore) return;
		if (e.key === "Escape") {
			e.preventDefault();
			close();
		}
	}

	onMount(() => {
		window.addEventListener("keydown", onKeyDown);
	});
	onDestroy(() => {
		window.removeEventListener("keydown", onKeyDown);
	});

	// When the panel opens, sync the capture-bound category to the active one
	// (if set) — otherwise leave whatever the user last picked.
	$effect(() => {
		if ($notesPanelOpenStore && $notesActiveCategoryStore) {
			notesCaptureCategoryStore.set($notesActiveCategoryStore);
		}
	});
</script>

{#if $notesPanelOpenStore}
	<!-- Backdrop: dim + click-out closes. Position fixed so it covers everything
	     below the title bar. -->
	<button
		type="button"
		class="notes-backdrop"
		onclick={onBackdropClick}
		aria-label="Close notes panel"
		transition:fade={{ duration: 150 }}
	></button>

	<!-- Panel slab: fixed positioned on the docked side. -->
	<aside
		class="notes-panel"
		class:left={isLeft}
		class:right={!isLeft}
		style:width="{PANEL_WIDTH}px"
		style:background="radial-gradient(140% 100% at {isLeft ? '100%' : '0%'} 0%, {focusTone.bg} 0%, #07060a 60%)"
		style:border-color="{focusTone.fg}66"
		transition:fly={{ x: isLeft ? -PANEL_WIDTH : PANEL_WIDTH, duration: 220, easing: cubicOut }}
		aria-label="Notes panel"
	>
		<ColorSpine {focusTone} />

		<div class="main-col">
			<PanelHeader {focusTone} onClose={close} onFlip={flip} />
			<FilterStrip {focusTone} />
			<NotesList {focusTone} />
			<CommandLine {focusTone} />
		</div>
	</aside>
{/if}

<style>
	.notes-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(5, 5, 8, 0.45);
		backdrop-filter: blur(5px) saturate(0.7) brightness(0.55);
		-webkit-backdrop-filter: blur(5px) saturate(0.7) brightness(0.55);
		z-index: 60;
		border: 0;
		cursor: default;
		padding: 0;
	}
	.notes-panel {
		position: fixed;
		top: 0;
		bottom: 0;
		display: flex;
		color: #e5e2e1;
		overflow: hidden;
		z-index: 61;
		border-style: solid;
		border-width: 0;
		font-family: var(--font-title);
	}
	.notes-panel.right {
		right: 0;
		border-left-width: 1px;
		box-shadow: -10px 0 60px rgba(0, 0, 0, 0.7);
	}
	.notes-panel.left {
		left: 0;
		border-right-width: 1px;
		box-shadow: 10px 0 60px rgba(0, 0, 0, 0.7);
	}
	.main-col {
		flex: 1;
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
</style>
