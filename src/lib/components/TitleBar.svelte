<script lang="ts">
	import { getCurrentWindow } from "@tauri-apps/api/window";
	import { appVersionStore } from "$lib/stores";
	import { notesStore } from "$lib/stores/notes";
	import { settingsStore, setScratchpadOpen } from "$lib/stores/settings";
	import { focusScratchpadWindow } from "$lib/services/scratchpad-window";
	import { tickStore } from "$lib/stores/boss-timer";
	import WindowControls from "./ui/WindowControls.svelte";
	import { m } from "$lib/paraglide/messages";

	const appWindow = getCurrentWindow();

	async function startDrag(e: MouseEvent) {
		if (e.button === 0 && !(e.target as HTMLElement).closest('button')) {
			await appWindow.startDragging();
		}
	}

	// Orange dot only while a reminder is actually due (spec 5b).
	const reminderDue = $derived(
		$notesStore.some((n) => n.type === "reminder" && n.when != null && n.when <= $tickStore),
	);
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<!-- svelte-ignore a11y_no_redundant_roles -- explicit role="banner" required for the mousedown handler (a11y_no_static_element_interactions) -->
<header
	role="banner"
	onmousedown={startDrag}
	class="titlebar"
>
	<!-- Logo + Title + Version -->
	<div class="flex items-center gap-2.5">
		<img src="/logo.png" alt="" class="w-[18px] h-[18px] object-contain pointer-events-none" />
		<span class="titlebar-name pointer-events-none">Life Companion</span>
		<span class="titlebar-version pointer-events-none">{$appVersionStore}</span>
	</div>

	<div class="flex items-center gap-3 pointer-events-auto">
		<button
			type="button"
			class="pad-pill {$settingsStore.scratchpad_detached ? 'pad-pill-detached' : ''}"
			onclick={() => {
				if ($settingsStore.scratchpad_detached) {
					void focusScratchpadWindow();
				} else {
					setScratchpadOpen(!$settingsStore.scratchpad_open);
				}
			}}
			title={m.scratchpad_pill_title()}
			aria-pressed={$settingsStore.scratchpad_open}
		>
			<span class="pill-glyph" aria-hidden="true"><span class="glyph-line l1"></span><span class="glyph-line l2"></span></span>
			{#if $settingsStore.scratchpad_detached}
				<span class="pill-detach-glyph" aria-hidden="true">⧉</span>
			{/if}
			<span class="pill-count">{$notesStore.length}</span>
			{#if reminderDue}
				<span class="pill-dot" aria-hidden="true"></span>
			{/if}
		</button>
		<WindowControls variant="titlebar" />
	</div>
</header>

<style>
	.titlebar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		height: 40px;
		flex: none;
		padding: 0 16px;
		background: var(--card-bg);
		border-bottom: 1px solid var(--card-border);
		user-select: none;
		cursor: move;
		z-index: 50;
	}

	.titlebar-name {
		font-family: 'IBM Plex Sans', sans-serif;
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 0.04em;
		color: var(--ink);
	}

	.titlebar-version {
		font-family: 'IBM Plex Mono', ui-monospace, monospace;
		font-size: 12px;
		color: var(--eyebrow-ink);
	}

	/* ── Scratchpad pill ── */
	.pad-pill {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 3px 9px 3px 7px;
		background: var(--teal-tint);
		border: none;
		border-radius: 999px;
		cursor: pointer;
	}
	.pad-pill:hover { filter: brightness(0.97); }
	/* Detached (13b): the pad lives in its own window, so the pill is the only
	   trace in the main window — outline treatment + ⧉ says "it's elsewhere".
	   Padding drops 1px to absorb the border so both states are equal height.
	   There is deliberately no third state: focusScratchpadWindow() recovers a
	   missing window, so the user can never have no pad at all. */
	.pad-pill-detached {
		background: transparent;
		border: 1px solid #9cc4bf;
		padding: 2px 8px 2px 6px;
	}
	.pill-detach-glyph {
		font-size: 11px;
		line-height: 1;
		color: var(--teal);
	}
	.pill-glyph {
		position: relative;
		display: block;
		width: 12px;
		height: 13px;
		border: 1.5px solid var(--teal);
		border-radius: 2px 2px 3px 3px;
	}
	.glyph-line {
		position: absolute;
		left: 1.5px;
		width: 6px;
		height: 1.5px;
		background: var(--teal);
	}
	.l1 { top: 2px; }
	.l2 { top: 5.5px; }
	.pill-count {
		font: 600 12px 'IBM Plex Sans', sans-serif;
		color: var(--teal);
	}
	.pill-dot {
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: var(--orange);
	}
</style>
