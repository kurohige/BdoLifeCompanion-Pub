<!--
	Note editor window (/note — separate Tauri WebviewWindow).

	Frameless, transparent, always-on-top. Holds one note; which one comes from
	`note_editing_id` in settings, with the launch `?id=` as a cold-start
	fallback for the gap before settings load.

	initNotesSync() is mandatory here (rule 6.4): without it the editor never
	sees edits made in the list window.
-->
<script lang="ts">
	import { onMount, onDestroy } from "svelte";
	import NoteEditor from "$lib/components/NoteEditor.svelte";
	import { loadNotesData, initNotesSync, flushNotes } from "$lib/stores/notes";
	import { initSettings } from "$lib/stores/settings";
	import { tickStore } from "$lib/stores/boss-timer";

	let ready = $state(false);
	let fallbackId = $state<string | null>(null);
	let tickInterval: ReturnType<typeof setInterval> | null = null;

	onMount(async () => {
		// Transparent window: only the editor's own rounded card paints.
		document.body.classList.add("widget-mode");
		document.documentElement.style.background = "transparent";

		// Read the launch id before anything async, so the first render after
		// settings load already has a note to show.
		fallbackId = new URLSearchParams(window.location.search).get("id");

		// Settings first (resolves + applies the locale, and carries
		// note_editing_id), then notes.
		await initSettings();
		await loadNotesData();
		await initNotesSync();
		ready = true;

		// The main window's boss timer drives tickStore there; this window runs
		// its own 1s heartbeat for the due chip and the "edited/saved" stamps.
		tickInterval = setInterval(() => tickStore.set(Date.now()), 1000);

		// 4.16 — flush before the window goes, so a keystroke inside the last
		// 700ms of debounce is not lost.
		const { getCurrentWindow } = await import("@tauri-apps/api/window");
		await getCurrentWindow().onCloseRequested(async () => {
			await flushNotes();
		});
	});

	onDestroy(() => {
		// onDestroy also runs during the prerender pass, where no Tauri window
		// exists — bail there.
		if (typeof window === "undefined") return;
		if (tickInterval) clearInterval(tickInterval);
		void flushNotes();
	});
</script>

{#if ready}
	<NoteEditor {fallbackId} />
{/if}

<style>
	:global(html, body) {
		background: transparent !important;
		overflow: hidden;
	}
</style>
