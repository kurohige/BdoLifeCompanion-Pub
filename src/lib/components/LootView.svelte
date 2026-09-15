<!--
	Loot OCR — host component.

	Top-level pane under the Grinding → OCR sub-tab. Renders:
	  - First-run disclaimer gate (until acknowledged, nothing else is shown).
	  - Foreground-paused banner (only when a session exists and the game is not focused).
	  - Three-tab nav: SETUP / TRACK / LOGS.
	  - The selected sub-view.
	  - Global panic-stop hotkey hint footer.

	The shared pane, eyebrow, controls and the whole ledger live in `<style>`
	here as `:global(...)` so the three sub-tab components consume one
	definition. Component-specific styles stay scoped inside each sub-tab.

	Values come from `docs/mockups/design_handoff_bdo_life_companion/
	LOOT_OCR_SPEC.css`; structure from `LOOT_OCR_MARKUP.md`.
-->
<script lang="ts">
	import {
		lootSettingsStore,
		acknowledgeLootDisclaimer,
		lootFocusInGameStore,
		captureSessionStore,
		lootSubTabStore,
		type LootSubTab,
	} from "$lib/stores";
	import { m } from "$lib/paraglide/messages";
	import { Button } from "$lib/components/ui";
	import LootSetup from "./loot/LootSetup.svelte";
	import LootTrack from "./loot/LootTrack.svelte";
	import LootLogs from "./loot/LootLogs.svelte";

	const settings = $derived($lootSettingsStore);
	const disclaimerOk = $derived(settings.disclaimerAcknowledged === true);
	const focusInGame = $derived($lootFocusInGameStore);
	const session = $derived($captureSessionStore);
	const hasSession = $derived(session !== null);
	const tab = $derived($lootSubTabStore);

	const TABS: { id: LootSubTab; label: () => string }[] = [
		{ id: "setup", label: () => m.loot_tab_setup() },
		{ id: "track", label: () => m.loot_tab_track() },
		{ id: "logs",  label: () => m.loot_tab_logs() },
	];
</script>

<div class="flex flex-col gap-2 min-h-0 flex-1 text-on-surface loot-host">
	{#if !disclaimerOk}
		<!-- ========== FIRST-RUN DISCLAIMER ========== -->
		<div class="loot-disclaimer">
			<div class="loot-disclaimer-title">{m.loot_disclaimer_title()}</div>
			<div class="loot-disclaimer-body">
				<p>{m.loot_disclaimer_body_1()}</p>
				<p>{m.loot_disclaimer_body_2()}</p>
				<p class="loot-disclaimer-warn">{m.loot_disclaimer_body_3()}</p>
			</div>
			<Button variant="primary" size="sm" onclick={() => acknowledgeLootDisclaimer()}>
				{m.loot_disclaimer_accept()}
			</Button>
		</div>
	{:else}
		<!-- ========== SUB-TAB NAV ========== -->
		<div class="loot-subtabs">
			{#each TABS as t (t.id)}
				<button
					class="loot-subtab"
					class:loot-subtab-active={tab === t.id}
					onclick={() => lootSubTabStore.set(t.id)}
				>
					{t.label()}
				</button>
			{/each}
		</div>

		{#if hasSession && !focusInGame}
			<!-- Foreground-paused banner — shown on every sub-tab so the user
			     is never confused about why scanning stopped. -->
			<div class="loot-focus-warn">
				<span class="loot-focus-warn-icon">⏸</span>
				<div class="loot-focus-warn-text">
					<div class="loot-focus-warn-title">{m.loot_focus_warn_title()}</div>
					<div class="loot-focus-warn-sub">{m.loot_focus_warn_sub()}</div>
				</div>
			</div>
		{/if}

		<!-- ========== ACTIVE SUB-VIEW ========== -->
		{#if tab === "setup"}
			<LootSetup />
		{:else if tab === "track"}
			<LootTrack />
		{:else}
			<LootLogs />
		{/if}

		<!-- ========== HOTKEY HINT ========== -->
		<div class="loot-panic-hint">{m.loot_hotkey_hint()}</div>
	{/if}
</div>

<style>
	/* Shared chrome for the three OCR sub-tabs.
	   Values: docs/mockups/design_handoff_bdo_life_companion/LOOT_OCR_SPEC.css
	   §2 (shared) and §3 (the ledger). Structure: LOOT_OCR_MARKUP.md §1.

	   :global so LootSetup / LootTrack / LootLogs / LootLedgerRow consume one
	   definition. The ledger in particular used to exist twice by copy-paste,
	   and the two copies had already drifted to six columns against seven. */

	/* Every sub-tab root is this card. */
	:global(.loot-pane) {
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 10px;
		background: var(--surface-low);
		border: 1px solid var(--card-border);
		border-radius: 12px;
		font-family: 'IBM Plex Sans', sans-serif;
		color: var(--on-surface);
		/* Fills the host's remaining height so the ledger can scroll inside it. */
		flex: 1;
		min-height: 0;
	}

	/* One eyebrow spec for all three sub-tabs, replacing four different
	   uppercase treatments (.10em / .18em / .22em / none). */
	:global(.loot-eyebrow) {
		font: 700 10.5px 'IBM Plex Sans', sans-serif;
		letter-spacing: 0.10em;
		text-transform: uppercase;
		color: var(--outline-hud);
	}

	:global(.loot-btn-primary) {
		padding: 8px 13px;
		font: 700 12px 'IBM Plex Sans', sans-serif;
		color: #fff;
		background: var(--teal);
		border: none;
		border-radius: 9px;
		cursor: pointer;
	}
	:global(.loot-btn-primary:hover) { background: #135f5a; }

	:global(.loot-btn-ghost) {
		padding: 8px 13px;
		font: 600 12px 'IBM Plex Sans', sans-serif;
		color: var(--on-surface);
		background: var(--surface-low);
		border: 1px solid var(--card-border);
		border-radius: 9px;
		cursor: pointer;
	}
	:global(.loot-btn-ghost:hover) { background: #f4f2ed; border-color: #c2bcb0; }

	/* Slider. The spec draws track / fill / thumb as three divs; the app needs
	   a real control, so the native range input is styled to the same measures
	   — 4px track on #efece5, teal fill, 14px thumb ringed teal on white. Each
	   input sets `--fill` inline from its own value. */
	:global(.loot-slider) {
		appearance: none;
		-webkit-appearance: none;
		flex: 1;
		min-width: 0;
		height: 14px;
		background: transparent;
		cursor: pointer;
	}
	:global(.loot-slider::-webkit-slider-runnable-track) {
		height: 4px;
		border-radius: 3px;
		background: linear-gradient(
			to right,
			var(--teal) 0 var(--fill, 0%),
			#efece5 var(--fill, 0%) 100%
		);
	}
	:global(.loot-slider::-webkit-slider-thumb) {
		appearance: none;
		-webkit-appearance: none;
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: #fff;
		border: 2px solid var(--teal);
		margin-top: -5px;
	}
	/* Fixed-width value column so the numbers form a comparable column. */
	:global(.loot-slider-value) {
		min-width: 52px;
		font: 600 14px 'IBM Plex Mono', monospace;
		font-variant-numeric: tabular-nums;
		color: var(--on-surface);
		text-align: right;
	}

	/* Checkbox, both states — the native input styled to the spec's 15px box. */
	:global(.loot-check) {
		box-sizing: border-box;
		appearance: none;
		-webkit-appearance: none;
		flex: none;
		width: 15px;
		height: 15px;
		margin: 2px 0 0;
		border: 1.5px solid #c2bcb0;
		border-radius: 3px;
		background: transparent;
		cursor: pointer;
	}
	:global(.loot-check:checked) {
		background: var(--teal);
		border-color: var(--teal);
	}
	/* The tick, drawn rather than relying on the UA's own glyph. */
	:global(.loot-check:checked::after) {
		content: "";
		display: block;
		width: 3px;
		height: 7px;
		margin: 1px auto 0;
		border: solid #fff;
		border-width: 0 2px 2px 0;
		transform: rotate(45deg);
	}

	/* Toggle "On" state — teal text on tint, no border. */
	:global(.loot-toggle-state-on) {
		padding: 1px 7px;
		font: 600 12px 'IBM Plex Sans', sans-serif;
		color: var(--teal);
		background: var(--teal-tint);
		border: none;
		border-radius: 999px;
	}

	:global(.loot-input) {
		background: var(--surface-lowest);
		color: var(--on-surface);
		font: 400 12.5px 'IBM Plex Sans', sans-serif;
		padding: 5px 8px;
		border: 1px solid var(--card-border);
		border-radius: 7px;
		outline: none;
	}
	:global(.loot-input:focus) { border-color: var(--teal); }

	/* ========== The ledger — shared by TRACK and the LOGS detail view ========== */

	:global(.loot-ledger) {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
		overflow: hidden;
		background: var(--surface-low);
		box-shadow: inset 0 0 0 1px var(--card-border);
	}

	/* THE COLUMN CONTRACT — header, every row and the footer share it exactly.
	   ind 24 | icon 26 | name 1fr | count 78 | actions 76 */
	:global(.loot-ledger-header),
	:global(.loot-ledger-row),
	:global(.loot-ledger-footer) {
		display: grid;
		grid-template-columns: 24px 26px 1fr 78px 76px;
		gap: 10px;
		align-items: center;
	}
	/* LOGS: the same grid minus the actions column. One modifier, not a second
	   grid definition. */
	:global(.loot-ledger-readonly .loot-ledger-header),
	:global(.loot-ledger-readonly .loot-ledger-row),
	:global(.loot-ledger-readonly .loot-ledger-footer) {
		grid-template-columns: 24px 26px 1fr 78px;
	}
	:global(.loot-ledger-readonly .loot-row-actions) { display: none; }

	:global(.loot-ledger-header) {
		padding: 7px 10px;
		border-bottom: 1px solid var(--card-border);
		font: 700 10.5px 'IBM Plex Sans', sans-serif;
		letter-spacing: 0.10em;
		text-transform: uppercase;
		color: var(--outline-hud);
	}
	:global(.loot-ledger-header-count) { text-align: right; }
	/* "Hide raw" is a control living in the header row, not a label. */
	:global(.loot-ledger-header-toggle) {
		padding: 3px 7px;
		text-align: right;
		font: inherit;
		color: var(--on-surface-variant);
		background: transparent;
		border: none;
		box-shadow: inset 0 0 0 1px var(--card-border);
		cursor: pointer;
	}
	:global(.loot-ledger-header-toggle:hover) {
		color: var(--on-surface);
		background: #f4f2ed;
	}
	:global(.loot-ledger-header-toggle-active) {
		color: var(--teal);
		background: var(--teal-tint);
		box-shadow: inset 0 0 0 1px var(--teal);
	}

	:global(.loot-ledger-body) {
		flex: 1;
		overflow: auto;
		min-height: 0;
		scrollbar-width: none;
	}
	:global(.loot-ledger-body::-webkit-scrollbar) { display: none; }

	/* The rail is a 3px inset box-shadow, so it costs no layout width. */
	:global(.loot-ledger-row) {
		padding: 7px 10px;
		background: var(--surface-low);
		box-shadow: inset 3px 0 0 var(--rail, #d5d0c6);
	}
	:global(.loot-ledger-row-alt) { background: var(--row-alt); }
	:global(.loot-ledger-row:hover),
	:global(.loot-ledger-row-alt:hover) { background: #f4f2ed; }

	/* Match indicator. ✓ teal, ✎ amber (edited), ? quiet (unmatched). */
	:global(.loot-row-ind) {
		text-align: center;
		font: 700 13px 'IBM Plex Sans', sans-serif;
	}
	:global(.loot-row-ind-matched)   { color: var(--teal); }
	:global(.loot-row-ind-edited)    { color: #c07c2c; }
	:global(.loot-row-ind-unmatched) { color: var(--outline-hud); }

	:global(.loot-row-icon) {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		background: #e4e0d6;
	}
	/* An unmatched row has no art, so the cell is an empty dashed box rather
	   than a coloured swatch standing in for one. */
	:global(.loot-row-icon-empty) {
		box-sizing: border-box;
		background: transparent;
		border: 1px dashed var(--card-border);
	}
	:global(.loot-row-icon img) {
		max-width: 24px;
		max-height: 24px;
		image-rendering: pixelated;
		filter: none;
	}

	/* Name cell. Two lines: the catalog name, then the evidence. min-width:0 is
	   load-bearing — without it the 1fr column cannot shrink and the ellipsis
	   never fires. */
	:global(.loot-row-name) { min-width: 0; }
	:global(.loot-row-name-primary) {
		display: block;
		/* Load-bearing inside .loot-row-name-line: a flex item defaults to
		   min-width:auto, which stops the ellipsis firing. */
		min-width: 0;
		font: 500 14px 'IBM Plex Sans', sans-serif;
		color: var(--on-surface);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	/* An unmatched row has no catalog name, so the OCR string is promoted into
	   the primary slot — mono, 400, body ink, so it still reads as a raw string
	   and not as a name. */
	:global(.loot-row-name-primary-raw) {
		font: 400 14px 'IBM Plex Mono', monospace;
		color: #3d3a34;
	}
	/* The primary line becomes a flex row when a badge sits beside the name. */
	:global(.loot-row-name-line) {
		display: flex;
		align-items: center;
		gap: 6px;
		min-width: 0;
	}
	:global(.loot-row-name-secondary) {
		display: block;
		font: 400 12px 'IBM Plex Sans', sans-serif;
		color: var(--on-surface-variant);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	:global(.loot-row-name-connector) { color: #756f66; }

	/* The count is the datum. Largest thing in the row. No × prefix. */
	:global(.loot-row-count) {
		font: 600 16px 'IBM Plex Mono', monospace;
		font-variant-numeric: tabular-nums;
		color: var(--on-surface);
		text-align: right;
	}

	:global(.loot-row-actions) {
		display: flex;
		justify-content: flex-end;
		gap: 4px;
		font: 400 13px 'IBM Plex Sans', sans-serif;
		color: var(--on-surface-variant);
	}
	:global(.loot-row-btn) {
		font: inherit;
		line-height: 1;
		padding: 2px 3px;
		background: transparent;
		border: none;
		color: var(--on-surface-variant);
		cursor: pointer;
	}
	:global(.loot-row-btn:hover) { color: var(--on-surface); }
	:global(.loot-row-danger:hover) { color: var(--rust); }

	/* EDITED badge, inline after the name. Replaces the 7px .loot-edit-chip. */
	:global(.loot-row-badge) {
		flex: none;
		padding: 1px 5px;
		font: 700 10.5px 'IBM Plex Sans', sans-serif;
		letter-spacing: 0.10em;
		color: #8a5a10;
		background: #f7edd9;
		border-radius: 3px;
	}

	:global(.loot-row-note) {
		font: 400 12px 'IBM Plex Sans', sans-serif;
		color: var(--on-surface-variant);
	}

	/* Footer. Same grid; the label sits in the name column and the total in the
	   count column, so the total aligns under the numbers above it. */
	:global(.loot-ledger-footer) {
		padding: 9px 10px;
		background: var(--surface);
		border-top: 1px solid #e9e4da;
	}
	:global(.loot-ledger-footer-label) {
		font: 700 12.5px 'IBM Plex Sans', sans-serif;
		letter-spacing: 0.10em;
		text-transform: uppercase;
		color: var(--on-surface);
	}
	:global(.loot-ledger-footer-total) {
		font: 600 16px 'IBM Plex Mono', monospace;
		font-variant-numeric: tabular-nums;
		color: var(--on-surface);
		text-align: right;
	}

	/* Empty state — no opacity, no italic. */
	:global(.loot-ledger-empty),
	:global(.loot-logs-empty) {
		padding: 18px 10px;
		font: 400 12.5px 'IBM Plex Sans', sans-serif;
		font-style: normal;
		color: var(--on-surface-variant);
		text-align: center;
	}

	/* Inline row editor. Was rgba(32,31,31,.3) — a 30% black scrim on paper. */
	:global(.loot-row-edit-pane) {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 8px 10px;
		background: var(--row-alt);
		border-bottom: 1px solid #f1eee8;
	}

	/* Source rail — the ONE place the palette lives. Each row/dot/log row takes
	   a rail class; the rules above read --rail from it. Unmatched is the
	   var() fallback. barter and treasure come from the brief's Part 8 table;
	   the spec stylesheet lists only five of the seven. */
	:global(.loot-rail-grinding)  { --rail: #7a5bb5; }
	:global(.loot-rail-recipe)    { --rail: #a2731a; }
	:global(.loot-rail-gathering) { --rail: #6b8f2e; }
	:global(.loot-rail-hunting)   { --rail: #2f7d63; }
	:global(.loot-rail-barter)    { --rail: #2a6fa8; }
	:global(.loot-rail-treasure)  { --rail: #8a5a2b; }
	:global(.loot-rail-unmatched) { --rail: #d5d0c6; }

	/* Source dot. The unmatched dot is HOLLOW, not a grey fill — that is what
	   carries the matched/unmatched distinction now. */
	:global(.loot-source-dot) {
		display: inline-block;
		width: 7px;
		height: 7px;
		margin-right: 6px;
		border-radius: 50%;
		background: var(--rail, #d5d0c6);
		flex: none;
	}
	:global(.loot-source-dot-hollow) {
		box-sizing: border-box;
		background: transparent;
		border: 1px solid #c2bcb0;
	}

	:global(.font-mono) {
		font-family: 'IBM Plex Mono', monospace;
		font-variant-numeric: tabular-nums;
	}

	/* Local — host-only styles. */

	.loot-host {
		font-family: 'IBM Plex Sans', sans-serif;
	}

	.loot-subtabs {
		display: grid;
		grid-template-columns: 1fr 1fr 1fr;
		box-shadow: inset 0 0 0 1px var(--card-border);
		flex-shrink: 0;
	}
	.loot-subtab {
		padding: 9px 12px 11px;
		text-align: center;
		font: 600 12.5px 'IBM Plex Sans', sans-serif;
		letter-spacing: 0.10em;
		text-transform: uppercase;
		color: var(--on-surface-variant);
		background: transparent;
		border: none;
		cursor: pointer;
		transition: color 150ms ease;
	}
	.loot-subtab:hover { color: var(--on-surface); }
	.loot-subtab-active {
		position: relative;
		font-weight: 700;
		color: var(--on-surface);
	}
	/* 2px teal underline, inset 12px each side. Not a background fill. */
	.loot-subtab-active::after {
		content: '';
		position: absolute;
		left: 12px;
		right: 12px;
		bottom: 0;
		height: 2px;
		background: var(--teal);
	}

	.loot-disclaimer {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 14px 16px;
		background: var(--surface-low);
		border: 1px solid var(--card-border);
		border-radius: 12px;
	}
	.loot-disclaimer-title {
		font: 700 15px 'IBM Plex Sans', sans-serif;
		color: var(--on-surface);
	}
	.loot-disclaimer-body {
		display: flex;
		flex-direction: column;
		gap: 6px;
		font: 400 12.5px/1.5 'IBM Plex Sans', sans-serif;
		color: #3d3a34;
	}
	.loot-disclaimer-body p { margin: 0; }
	/* A legal notice was the least readable text in the pane at #ffb4ab
	   (~1.8:1 on white). Rust is the alert colour in Parchment. */
	.loot-disclaimer-warn { color: var(--rust-deep); }

	.loot-focus-warn {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 12px;
		background: var(--surface);
		border: 1px solid var(--card-border);
		border-left: 3px solid var(--tertiary);
		border-radius: 8px;
		flex-shrink: 0;
	}
	.loot-focus-warn-icon {
		font-size: 16px;
		color: var(--tertiary);
	}
	.loot-focus-warn-text {
		display: flex;
		flex-direction: column;
	}
	.loot-focus-warn-title {
		font: 600 14px 'IBM Plex Sans', sans-serif;
		color: var(--on-surface);
	}
	.loot-focus-warn-sub {
		font: 400 12.5px 'IBM Plex Sans', sans-serif;
		color: var(--on-surface-variant);
	}

	/* The pane-level panic-stop line. Distinct from SETUP's CTA key badge,
	   which the spec also calls .loot-hotkey-hint — that one is scoped to
	   LootSetup.svelte. */
	.loot-panic-hint {
		text-align: center;
		padding: 4px 10px;
		font: 400 12px 'IBM Plex Sans', sans-serif;
		color: var(--on-surface-variant);
		flex-shrink: 0;
	}
</style>
