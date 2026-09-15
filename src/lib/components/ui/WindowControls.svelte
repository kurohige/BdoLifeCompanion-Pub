<!--
	The three-button window-control set — one vocabulary everywhere (spec 9c).
	Minimise · step-the-cycle chevron · close. The cycle is full -> mini ->
	medium -> full, so the chevron points up in mini and medium (each grows)
	and down in full (it wraps to the smallest); long-press or right-click
	walks the cycle backwards. 20px buttons, 12px SVG icons, stroke 1.6.
	Variant sets the button ground: chip on the titlebar, overlay chip in the
	mini bar, transparent in the medium column.
-->
<script lang="ts">
	import { viewModeStore } from "$lib/stores/view-mode";
	import { stepMode, stepModeBack, minimizeWindow, closeApp } from "$lib/services/window-mode";
	import { m } from "$lib/paraglide/messages";

	let { variant = "titlebar" }: { variant?: "titlebar" | "mini" | "medium" } = $props();

	const chevronUp = $derived($viewModeStore !== "full");

	let pressTimer: ReturnType<typeof setTimeout> | null = null;
	let longPressed = false;

	function onChevronPointerDown() {
		longPressed = false;
		pressTimer = setTimeout(() => {
			longPressed = true;
			void stepModeBack();
		}, 500);
	}
	function cancelPressTimer() {
		if (pressTimer) {
			clearTimeout(pressTimer);
			pressTimer = null;
		}
	}
	function onChevronClick() {
		if (longPressed) {
			longPressed = false;
			return;
		}
		void stepMode();
	}
	function onChevronContextMenu(e: MouseEvent) {
		e.preventDefault();
		cancelPressTimer();
		longPressed = true; // swallow the click that follows on some platforms
		void stepModeBack();
	}
</script>

<div class="wc wc-{variant}">
	<button
		type="button"
		class="wc-btn wc-min"
		onclick={() => void minimizeWindow()}
		title={m.chrome_titlebar_minimize_title()}
		aria-label={m.chrome_titlebar_minimize_title()}
	>
		<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M2 6h8" /></svg>
	</button>
	<button
		type="button"
		class="wc-btn wc-step"
		onpointerdown={onChevronPointerDown}
		onpointerup={cancelPressTimer}
		onpointerleave={cancelPressTimer}
		onclick={onChevronClick}
		oncontextmenu={onChevronContextMenu}
		title={chevronUp ? m.chrome_control_grow() : m.chrome_control_shrink()}
		aria-label={chevronUp ? m.chrome_control_grow() : m.chrome_control_shrink()}
	>
		{#if chevronUp}
			<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 7.5 6 5l2.5 2.5" /></svg>
		{:else}
			<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 4.5 6 7l2.5-2.5" /></svg>
		{/if}
	</button>
	<button
		type="button"
		class="wc-btn wc-close"
		onclick={() => void closeApp()}
		title={m.chrome_titlebar_close_title()}
		aria-label={m.chrome_titlebar_close_title()}
	>
		<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M3.5 3.5l5 5M8.5 3.5l-5 5" /></svg>
	</button>
</div>

<style>
	.wc {
		display: flex;
		align-items: center;
		gap: 3px;
	}
	.wc-medium {
		flex-direction: column;
		gap: 5px;
	}
	.wc-btn {
		width: 20px;
		height: 20px;
		display: flex;
		align-items: center;
		justify-content: center;
		border: none;
		padding: 0;
		border-radius: 6px;
		cursor: pointer;
		transition: filter 0.15s, background 0.15s;
	}
	.wc-titlebar .wc-btn { background: var(--chip); }
	.wc-mini .wc-btn { background: var(--overlay-chip); }
	.wc-medium .wc-btn { background: transparent; }

	.wc-min { color: var(--ink-mid); }
	.wc-medium .wc-min { color: var(--ink-muted); }
	.wc-step { color: var(--teal); }
	.wc-close { color: var(--rust); }

	.wc-btn:hover { filter: brightness(0.95); }
	.wc-medium .wc-btn:hover { background: var(--overlay-chip); filter: none; }
	.wc-close:hover { background: var(--rust-tint); filter: none; }
</style>
