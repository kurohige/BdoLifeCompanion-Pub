<!--
	Detached Scratchpad window (/scratchpad — separate Tauri WebviewWindow).

	Frameless, transparent, always-on-top; the Scratchpad component in
	`detached` mode fills it and drags the OS window by its header dots.
	Notes stay in sync with the main window via the `notes-changed` event
	(both windows share notes.json; whoever saves tells the other to reload).
-->
<script lang="ts">
	import { onMount, onDestroy } from "svelte";
	import Scratchpad from "$lib/components/Scratchpad.svelte";
	import { loadNotesData, initNotesSync, flushNotes } from "$lib/stores/notes";
	import { initSettings } from "$lib/stores/settings";
	import { tickStore } from "$lib/stores/boss-timer";

	let ready = $state(false);
	let tickInterval: ReturnType<typeof setInterval> | null = null;

	onMount(async () => {
		// Transparent window: only the pad's own rounded card paints.
		document.body.classList.add("widget-mode");
		document.documentElement.style.background = "transparent";

		// Settings first (resolves + applies the locale), then notes.
		await initSettings();
		await loadNotesData();
		await initNotesSync();
		ready = true;

		// The main window's boss timer drives tickStore there; this window
		// runs its own 1s heartbeat for reminder chips and "Saved Ns ago".
		tickInterval = setInterval(() => tickStore.set(Date.now()), 1000);

		// Flush any pending debounced note save before the window closes.
		const { getCurrentWindow } = await import("@tauri-apps/api/window");
		await getCurrentWindow().onCloseRequested(async () => {
			await flushNotes();
		});
	});

	onDestroy(() => {
		// onDestroy also runs server-side during the prerender pass (ssr=true
		// for this route) where no Tauri window exists — bail there.
		if (typeof window === "undefined") return;
		if (tickInterval) clearInterval(tickInterval);
		void flushNotes();
	});
</script>

{#if ready}
	<Scratchpad detached />
{/if}

<style>
	:global(html, body) {
		background: transparent !important;
		overflow: hidden;
	}
</style>
