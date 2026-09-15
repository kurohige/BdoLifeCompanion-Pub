<!--
	Loot OCR · SETUP sub-tab.

	Wires the region picker, OCR test preview, scan-rate slider, saved-regions
	chips, and the bottom "START SCAN" CTA. Mirrors the handoff's SETUP screen
	but uses our existing fullscreen region picker (the design's drag-in-viewport
	mock is replaced by the real picker overlay), and skips the per-spot drop
	down + resolution stat block (we don't have spot metadata yet).
-->
<script lang="ts">
	import {
		lootSettingsStore,
		setLootFreqHz,
		setLootRegion,
		setLootStrictMode,
		setLootInventoryMergeOnSave,
		setLootColorMask,
		setLootUpscaleFactor,
		setLootTemporalFrames,
		addSavedRegion,
		removeSavedRegion,
		captureSessionStore,
		startCaptureSession,
		resumeCaptureSession,
		pauseCaptureSession,
		lootSubTabStore,
	} from "$lib/stores";
	import { openRegionPicker } from "$lib/services/loot-picker";
	import { startScanRust, stopScanRust, testOcrRust } from "$lib/services/loot-persistence";
	import { diagLog } from "$lib/services/loot-diagnostic";
	import type { OcrEvent, Region } from "$lib/models/loot";
	import { m } from "$lib/paraglide/messages";

	// ============== Local UI state ==============
	let pickerOpen = $state(false);
	let testRunning = $state(false);
	let testRows = $state<OcrEvent[] | null>(null);
	let testError = $state("");
	let savingRegion = $state(false);
	let saveRegionName = $state("");

	// ============== Derived ==============
	const settings = $derived($lootSettingsStore);
	const region = $derived(settings.region);
	const hasRegion = $derived(region !== null);
	const session = $derived($captureSessionStore);
	const isRunning = $derived(session?.running === true);
	const savedRegions = $derived(settings.savedRegions);

	const regionDisplay = $derived.by(() => {
		if (!region) return "";
		const f = (v: number) => Math.round(v * 100);
		return `${f(region.x)}% ${f(region.y)}% → ${f(region.x + region.w)}% ${f(region.y + region.h)}%`;
	});

	// ============== Region picker ==============
	async function handlePickRegion() {
		if (pickerOpen) return;
		pickerOpen = true;
		try {
			const r = await openRegionPicker();
			if (r) {
				setLootRegion(r);
				// Stale preview belongs to the previous region.
				testRows = null;
				testError = "";
			}
		} finally {
			pickerOpen = false;
		}
	}

	async function handleTestOcr() {
		if (!region) return;
		testRunning = true;
		testError = "";
		try {
			testRows = await testOcrRust(region, settings.colorMask, settings.upscaleFactor);
		} catch (e) {
			testError = e instanceof Error ? e.message : String(e);
			testRows = null;
		} finally {
			testRunning = false;
		}
	}

	// ============== Saved regions ==============
	function beginSaveRegion() {
		if (!hasRegion) return;
		savingRegion = true;
		saveRegionName = `Region ${savedRegions.length + 1}`;
	}

	function commitSaveRegion() {
		const trimmed = saveRegionName.trim();
		if (!trimmed || !region) {
			savingRegion = false;
			return;
		}
		addSavedRegion(trimmed, region);
		savingRegion = false;
		saveRegionName = "";
	}

	function cancelSaveRegion() {
		savingRegion = false;
		saveRegionName = "";
	}

	function applySavedRegion(r: Region) {
		setLootRegion(r);
		testRows = null;
		testError = "";
	}

	// ============== Start / Stop scan CTA ==============
	async function handleStart() {
		if (!region) return;
		diagLog(
			"USER",
			`start_clicked freq=${settings.freqHz} strict=${settings.strictMode} mask=${settings.colorMask} upscale=${settings.upscaleFactor} temporal=${settings.temporalFrames}`,
		);
		try {
			await startScanRust(
				region,
				settings.freqHz,
				settings.minConfidence,
				settings.strictMode,
				settings.colorMask,
				settings.upscaleFactor,
				settings.temporalFrames,
			);
			if (session) {
				resumeCaptureSession();
			} else {
				startCaptureSession(region);
			}
			// Per the handoff: START SCAN jumps the user to TRACK.
			lootSubTabStore.set("track");
		} catch (e) {
			console.error("Failed to start scan:", e);
			diagLog("USER", `startScanRust threw: ${String(e)}`);
		}
	}

	async function handleStop() {
		// Optimistic — same reasoning as LootTrack.handleStop. Pause UI first so
		// the user sees feedback even if the await is gated on a saturated IPC
		// channel.
		diagLog("USER", "pause_clicked (LootSetup)");
		pauseCaptureSession();
		try {
			await stopScanRust();
			diagLog("USER", "stopScanRust ack received");
		} catch (e) {
			console.error("Failed to stop scan:", e);
			diagLog("USER", `stopScanRust threw: ${String(e)}`);
		}
	}

	function handleCtaClick() {
		if (isRunning) {
			void handleStop();
		} else {
			void handleStart();
		}
	}

	// ============== Slider ==============
	function onFreqChange(e: Event) {
		const v = parseFloat((e.target as HTMLInputElement).value);
		if (!Number.isNaN(v)) setLootFreqHz(v);
	}

	function onUpscaleChange(e: Event) {
		const v = parseFloat((e.target as HTMLInputElement).value);
		if (!Number.isNaN(v)) setLootUpscaleFactor(v);
	}

	function onTemporalChange(e: Event) {
		const v = parseInt((e.target as HTMLInputElement).value, 10);
		if (!Number.isNaN(v)) setLootTemporalFrames(v);
	}

	/**
	 * Filled portion of a slider track, as a percentage the CSS reads from
	 * `--fill`. Range inputs can't paint their own fill cross-browser.
	 */
	function fillPct(value: number, min: number, max: number): string {
		const p = ((value - min) / (max - min)) * 100;
		return `${Math.min(100, Math.max(0, p))}%`;
	}

	function fmtRegion(r: Region): string {
		const f = (v: number) => Math.round(v * 100);
		return `${f(r.x)},${f(r.y)} · ${f(r.w)}×${f(r.h)}`;
	}
</script>

<div class="loot-pane loot-setup">
	<!-- ========== 1 · REGION ========== -->
	<div>
		<div class="loot-setup-group-label">{m.loot_setup_group_region()}</div>

		<button
			class="loot-step1"
			class:loot-step1-unset={!hasRegion}
			class:loot-step1-picking={pickerOpen}
			onclick={handlePickRegion}
			disabled={pickerOpen}
		>
			<span class="loot-step1-glyph">⊡</span>
			<div class="loot-step1-text">
				<div class="loot-step1-title">
					{#if pickerOpen}
						{m.loot_setup_step1_picking_title()}
					{:else if hasRegion}
						{m.loot_setup_step1_reselect_title()}
					{:else}
						{m.loot_setup_step1_pick_title()}
					{/if}
				</div>
				<div class="loot-step1-sub">
					{#if pickerOpen}
						{m.loot_setup_step1_picking_sub()}
					{:else if hasRegion}
						{m.loot_setup_step1_reselect_sub()}
					{:else}
						{m.loot_setup_step1_pick_sub()}
					{/if}
				</div>
			</div>
			<span class="loot-step1-chip-set" class:loot-step1-chip-unset={!hasRegion}>
				{#if pickerOpen}
					● {m.loot_setup_step1_chip_picking()}
				{:else if hasRegion}
					✓ {m.loot_setup_step1_chip_set()}
				{:else}
					○ {m.loot_setup_step1_chip_unset()}
				{/if}
			</span>
		</button>

		<div class="loot-region-split">
			<!-- Map: label pinned top-left, rect absolute, coords bottom-right. -->
			<div class="loot-region-map">
				<span class="loot-region-map-label">
					{hasRegion ? m.loot_setup_region_viewport_label() : m.loot_setup_region_no_label()}
				</span>
				{#if region}
					<span class="loot-region-rect"></span>
					<span class="loot-region-coords">{regionDisplay}</span>
				{:else}
					<span class="loot-region-empty-msg">{m.loot_setup_region_empty_msg()}</span>
				{/if}
			</div>

			<!-- Test read: header / body / footer. No frame counter. -->
			<div class="loot-preview">
				<div class="loot-preview-header">
					<span class="loot-preview-header-label">{m.loot_setup_preview_title()}</span>
					{#if testRows !== null}
						<span class="loot-preview-header-count">
							{m.loot_setup_preview_lines({ count: testRows.length })}
						</span>
					{/if}
				</div>
				<div class="loot-preview-body">
					{#if !hasRegion}
						<div class="loot-preview-placeholder">{m.loot_setup_preview_placeholder()}</div>
					{:else if testRunning}
						<div class="loot-preview-placeholder">{m.loot_test_running()}</div>
					{:else if testError}
						<div class="loot-preview-error">{testError}</div>
					{:else if testRows === null}
						<div class="loot-preview-placeholder">{m.loot_setup_preview_idle()}</div>
					{:else if testRows.length === 0}
						<div class="loot-preview-placeholder">{m.loot_preview_empty()}</div>
					{:else}
						{#each testRows.slice(0, 6) as ev (ev.ts + ev.rawName)}
							<div class="loot-preview-row">
								<span class="truncate">{ev.rawName}</span>
								<span class="loot-preview-row-qty">×{ev.qty}</span>
							</div>
						{/each}
					{/if}
				</div>
				<div class="loot-preview-footer">
					<button
						class="loot-preview-test-btn"
						onclick={handleTestOcr}
						disabled={!hasRegion || testRunning}
					>
						{testRunning ? m.loot_test_running() : m.loot_test_button()}
					</button>
				</div>
			</div>
		</div>
	</div>

	<!-- ========== 2 · ACCURACY ========== -->
	<div>
		<div class="loot-setup-group-label">{m.loot_setup_group_accuracy()}</div>

		<div class="loot-accuracy-group">
			<!-- label + sub 1fr | control 150 -->
			<div class="loot-control-row">
				<div>
					<div class="loot-control-label">{m.loot_slider_freq()}</div>
					<div class="loot-control-sub">{m.loot_slider_freq_sub()}</div>
				</div>
				<div class="loot-control-slider">
					<input
						type="range"
						min="0.5"
						max="10"
						step="0.5"
						value={settings.freqHz}
						oninput={onFreqChange}
						class="loot-slider"
						style:--fill={fillPct(settings.freqHz, 0.5, 10)}
					/>
					<span class="loot-slider-value">{settings.freqHz.toFixed(1)} Hz</span>
				</div>
			</div>

			<div class="loot-control-row loot-control-row-alt">
				<div>
					<div class="loot-control-label">{m.loot_slider_upscale()}</div>
					<div class="loot-control-sub">{m.loot_slider_upscale_sub()}</div>
				</div>
				<div class="loot-control-slider">
					<input
						type="range"
						min="1"
						max="5"
						step="0.5"
						value={settings.upscaleFactor}
						oninput={onUpscaleChange}
						class="loot-slider"
						style:--fill={fillPct(settings.upscaleFactor, 1, 5)}
					/>
					<span class="loot-slider-value">{settings.upscaleFactor.toFixed(1)}×</span>
				</div>
			</div>

			<div class="loot-control-row">
				<div>
					<div class="loot-control-label">{m.loot_slider_temporal()}</div>
					<div class="loot-control-sub">{m.loot_slider_temporal_sub()}</div>
				</div>
				<div class="loot-control-slider">
					<input
						type="range"
						min="1"
						max="10"
						step="1"
						value={settings.temporalFrames}
						oninput={onTemporalChange}
						class="loot-slider"
						style:--fill={fillPct(settings.temporalFrames, 1, 10)}
					/>
					<span class="loot-slider-value">{settings.temporalFrames}f</span>
				</div>
			</div>

			<!-- checkbox rows: two cells, top-aligned, checkbox first -->
			<label class="loot-control-row loot-control-row-check loot-control-row-alt">
				<input
					type="checkbox"
					class="loot-check"
					checked={settings.strictMode}
					onchange={(e) => setLootStrictMode((e.currentTarget as HTMLInputElement).checked)}
				/>
				<div>
					<div class="loot-control-head">
						<span class="loot-control-label">{m.loot_strict_title()}</span>
						{#if settings.strictMode}
							<span class="loot-toggle-state-on">{m.loot_strict_state_on()}</span>
						{/if}
					</div>
					<div class="loot-control-sub">{m.loot_strict_sub()}</div>
				</div>
			</label>

			<label class="loot-control-row loot-control-row-check">
				<input
					type="checkbox"
					class="loot-check"
					checked={settings.colorMask}
					onchange={(e) => setLootColorMask((e.currentTarget as HTMLInputElement).checked)}
				/>
				<div>
					<div class="loot-control-head">
						<span class="loot-control-label">{m.loot_mask_title()}</span>
						{#if settings.colorMask}
							<span class="loot-toggle-state-on">{m.loot_strict_state_on()}</span>
						{/if}
					</div>
					<div class="loot-control-sub">{m.loot_mask_sub()}</div>
				</div>
			</label>
		</div>

		<!-- The inert Min-confidence control, demoted. The setting and its store
		     stay; only the slider is gone. -->
		<div class="loot-inert-note">
			<span class="loot-inert-badge">{m.loot_setup_confidence_badge()}</span>
			<span class="loot-inert-text">
				{m.loot_setup_confidence_note()}
				<span class="loot-inert-text-quiet">{m.loot_setup_confidence_note_quiet()}</span>
			</span>
		</div>
	</div>

	<!-- ========== 3 · SESSION ========== -->
	<div>
		<div class="loot-setup-group-label">{m.loot_setup_group_session()}</div>

		<div class="loot-session-group">
			<div class="loot-session-head">
				<span class="loot-control-label">{m.loot_setup_saved_header()}</span>
				{#if savingRegion}
					<div class="flex items-center gap-1">
						<input
							class="loot-input loot-saved-name-input"
							bind:value={saveRegionName}
							placeholder={m.loot_setup_saved_name_placeholder()}
							onkeydown={(e) => {
								if (e.key === "Enter") commitSaveRegion();
								if (e.key === "Escape") cancelSaveRegion();
							}}
						/>
						<button class="loot-session-action" onclick={commitSaveRegion} title={m.loot_setup_saved_save_btn()}>✓</button>
						<button class="loot-session-action" onclick={cancelSaveRegion} title={m.loot_edit_cancel()}>×</button>
					</div>
				{:else}
					<button
						class="loot-session-action"
						onclick={beginSaveRegion}
						disabled={!hasRegion}
						title={hasRegion ? m.loot_setup_saved_save_btn() : m.loot_setup_saved_save_disabled()}
					>
						+ {m.loot_setup_saved_save_current()}
					</button>
				{/if}
			</div>

			<div class="loot-saved-chips">
				{#if savedRegions.length === 0}
					<span class="loot-saved-empty">{m.loot_setup_saved_empty()}</span>
				{:else}
					{#each savedRegions as entry, idx (entry.name + ":" + idx)}
						<span class="loot-saved-chip">
							<button class="loot-saved-chip-body" onclick={() => applySavedRegion(entry.region)} title={m.loot_setup_saved_apply_title()}>
								<span class="loot-saved-chip-name">{entry.name}</span>
								<span class="loot-saved-chip-bbox">{fmtRegion(entry.region)}</span>
							</button>
							<button class="loot-saved-chip-del" onclick={() => removeSavedRegion(idx)} title={m.loot_setup_saved_delete()}>×</button>
						</span>
					{/each}
				{/if}
			</div>

			<label class="loot-session-merge-row">
				<input
					type="checkbox"
					class="loot-check"
					checked={settings.inventoryMergeOnSave}
					onchange={(e) => setLootInventoryMergeOnSave((e.currentTarget as HTMLInputElement).checked)}
				/>
				<div>
					<div class="loot-control-label">{m.loot_setting_merge_on_save()}</div>
					<div class="loot-control-sub">{m.loot_setting_merge_on_save_help()}</div>
				</div>
			</label>
		</div>
	</div>

	<!-- ========== CTA ========== three cells. -->
	<button
		class="loot-step2"
		class:loot-step2-disabled={!hasRegion && !isRunning}
		class:loot-step2-running={isRunning}
		disabled={!hasRegion && !isRunning}
		onclick={handleCtaClick}
	>
		<span class="loot-step2-glyph">{isRunning ? "■" : "▶"}</span>
		<div class="loot-step2-text">
			<div class="loot-step2-title">
				{#if isRunning}
					{m.loot_setup_step2_running_title()}
				{:else if hasRegion}
					{m.loot_setup_step2_ready_title()}
				{:else}
					{m.loot_setup_step2_disabled_title()}
				{/if}
			</div>
			<div class="loot-step2-sub">
				{#if isRunning}
					{m.loot_setup_step2_running_sub({ hz: settings.freqHz.toFixed(1) })}
				{:else if hasRegion}
					{m.loot_setup_step2_ready_sub({ hz: settings.freqHz.toFixed(1) })}
				{:else}
					{m.loot_setup_step2_disabled_sub()}
				{/if}
			</div>
		</div>
		<span class="loot-hotkey-hint">Ctrl+Shift+L</span>
	</button>
</div>

<style>
	/* Values: LOOT_OCR_SPEC.css §5. Structure: LOOT_OCR_MARKUP.md §3.
	   The pane shell, sliders, checkboxes and the "On" pill are :global in
	   LootView.svelte. */

	/* SETUP breathes more than TRACK: the groups are the structure now. */
	.loot-setup {
		gap: 14px;
		padding: 12px;
		overflow: auto;
	}
	.loot-setup-group-label {
		margin-bottom: 8px;
		font: 700 10.5px 'IBM Plex Sans', sans-serif;
		letter-spacing: 0.10em;
		text-transform: uppercase;
		color: var(--outline-hud);
	}

	/* --- 1 · Region --------------------------------------------------------- */

	/* 3px teal left border marks the step that is satisfied. */
	.loot-step1 {
		width: 100%;
		display: grid;
		grid-template-columns: 28px 1fr auto;
		gap: 10px;
		align-items: center;
		padding: 10px 12px;
		background: var(--surface);
		border: 1px solid var(--card-border);
		border-left: 3px solid var(--teal);
		border-radius: 8px;
		text-align: left;
		cursor: pointer;
	}
	.loot-step1-unset { border-left-color: var(--card-border); }
	/* #c2bcb0, NOT var(--outline-hud) — that token is a text ink and draws a
	   near-black box around the card. */
	.loot-step1:hover:not(:disabled) {
		border-color: #c2bcb0;
		border-left-color: var(--teal);
	}
	.loot-step1-unset:hover:not(:disabled) { border-left-color: #c2bcb0; }
	.loot-step1-picking { border-color: var(--teal); }
	.loot-step1-glyph {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 26px;
		height: 26px;
		font-size: 15px;
		color: var(--on-surface-variant);
		border: 1px solid var(--card-border);
		border-radius: 5px;
	}
	.loot-step1-text { min-width: 0; }
	.loot-step1-title {
		font: 600 14px 'IBM Plex Sans', sans-serif;
		letter-spacing: 0;
		text-transform: none;
		color: var(--on-surface);
	}
	.loot-step1-sub {
		font: 400 12.5px 'IBM Plex Sans', sans-serif;
		color: var(--on-surface-variant);
	}
	/* Was a purple 1px inset. Teal on tint, pill. */
	.loot-step1-chip-set {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 4px 9px;
		font: 600 12px 'IBM Plex Sans', sans-serif;
		color: var(--teal);
		background: var(--teal-tint);
		border: none;
		border-radius: 999px;
	}
	.loot-step1-chip-unset {
		color: var(--on-surface-variant);
		background: transparent;
		box-shadow: inset 0 0 0 1px var(--card-border);
	}

	/* Viewport map + test-read panel, side by side. The map is narrower. */
	.loot-region-split {
		display: grid;
		grid-template-columns: 1fr 1.4fr;
		gap: 8px;
		margin-top: 8px;
	}
	.loot-region-map {
		position: relative;
		box-sizing: border-box;
		min-height: 120px;
		padding: 10px;
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
		overflow: hidden;
		background: var(--surface);
		border: 1px solid var(--card-border);
		border-radius: 8px;
	}
	.loot-region-map-label {
		position: absolute;
		top: 7px;
		left: 9px;
		font: 700 10.5px 'IBM Plex Sans', sans-serif;
		letter-spacing: 0.10em;
		text-transform: uppercase;
		color: var(--outline-hud);
	}
	/* The selected rectangle. Keeps its teal marking — it is a live state.
	   Inset shadow, so it does not shift the box. */
	.loot-region-rect {
		position: absolute;
		inset: 24px 12px 30px 12px;
		background: var(--teal-tint);
		border-radius: 3px;
		box-shadow: inset 0 0 0 1.5px var(--teal);
	}
	/* 12px → 12.5px / 500 ink. These are the numbers the card is for. */
	.loot-region-coords {
		position: relative;
		font: 500 12.5px 'IBM Plex Mono', monospace;
		font-variant-numeric: tabular-nums;
		color: #3d3a34;
		text-align: right;
	}
	.loot-region-empty-msg {
		font: 400 12.5px/1.4 'IBM Plex Sans', sans-serif;
		color: var(--on-surface-variant);
		text-align: center;
	}
	/* .loot-region-scanline is DELETED — nothing animates on a settings screen
	   where nothing is happening. */

	.loot-preview {
		box-sizing: border-box;
		min-height: 120px;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		background: var(--surface-low);
		border: 1px solid var(--card-border);
		border-radius: 8px;
	}
	/* "Last test read · {n} lines" — the honest line that replaces
	   "● PREVIEW · FRAME 041". n comes from the last test, not a setInterval. */
	.loot-preview-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 8px;
		padding: 7px 9px;
		background: var(--surface);
		border-bottom: 1px solid #e9e4da;
	}
	.loot-preview-header-label {
		font: 700 10.5px 'IBM Plex Sans', sans-serif;
		letter-spacing: 0.10em;
		text-transform: uppercase;
		color: var(--outline-hud);
	}
	.loot-preview-header-count {
		font: 500 12px 'IBM Plex Mono', monospace;
		font-variant-numeric: tabular-nums;
		color: var(--on-surface-variant);
	}
	.loot-preview-body {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 5px 9px;
		font-family: 'IBM Plex Mono', monospace;
		font-size: 13px;
		overflow: auto;
	}
	.loot-preview-row {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 8px;
		color: var(--on-surface);
	}
	.loot-preview-row-qty { font-weight: 600; }
	.loot-preview-row:first-child {
		background: var(--teal-tint);
		box-shadow: inset 2px 0 0 var(--teal);
		margin: 0 -9px;
		padding: 0 9px 0 7px;
	}
	.loot-preview-placeholder {
		padding: 16px 8px;
		font: 400 12.5px 'IBM Plex Sans', sans-serif;
		color: var(--on-surface-variant);
		text-align: center;
	}
	.loot-preview-error {
		padding: 6px 4px;
		font: 400 12.5px 'IBM Plex Sans', sans-serif;
		color: var(--rust-deep);
	}
	.loot-preview-footer {
		display: flex;
		justify-content: flex-end;
		padding: 6px 8px;
		border-top: 1px solid #e9e4da;
	}
	.loot-preview-test-btn {
		padding: 5px 11px;
		font: 600 12.5px 'IBM Plex Sans', sans-serif;
		color: var(--teal);
		background: transparent;
		border: 1px solid var(--teal);
		border-radius: 7px;
		cursor: pointer;
	}
	.loot-preview-test-btn:hover:not(:disabled) { background: var(--teal-tint); }
	.loot-preview-test-btn:disabled {
		color: var(--on-surface-variant);
		border-color: var(--card-border);
		cursor: not-allowed;
	}

	/* --- 2 · Accuracy ------------------------------------------------------- */

	/* The four slider cards lose their individual chrome and become rows in
	   ONE bordered group. Hairlines between, alternating ground. */
	.loot-accuracy-group {
		overflow: hidden;
		border: 1px solid var(--card-border);
		border-radius: 8px;
	}
	.loot-control-row {
		display: grid;
		grid-template-columns: 1fr 150px;
		gap: 14px;
		align-items: center;
		padding: 10px 12px;
		border-bottom: 1px solid #f1eee8;
	}
	.loot-control-row-alt { background: var(--surface); }
	.loot-control-row:last-child { border-bottom: none; }
	/* Checkbox rows align to the top, because the sub-line wraps. */
	.loot-control-row-check {
		grid-template-columns: auto 1fr;
		gap: 10px;
		align-items: flex-start;
		cursor: pointer;
	}
	.loot-control-head {
		display: flex;
		align-items: center;
		gap: 7px;
	}
	.loot-control-label {
		font: 500 14px 'IBM Plex Sans', sans-serif;
		color: var(--on-surface);
	}
	.loot-control-sub {
		font: 400 12.5px/1.4 'IBM Plex Sans', sans-serif;
		color: var(--on-surface-variant);
	}
	.loot-control-slider {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	/* The inert Min-confidence control, demoted to a labelled note. It is not a
	   fourth slider that does nothing. */
	.loot-inert-note {
		display: flex;
		align-items: baseline;
		gap: 8px;
		margin-top: 7px;
		padding: 7px 10px;
		background: var(--surface);
		border: 1px solid #e9e4da;
		border-radius: 7px;
	}
	.loot-inert-badge {
		flex: none;
		padding: 1px 6px;
		font: 600 12px 'IBM Plex Sans', sans-serif;
		color: #8a5a10;
		background: #f7edd9;
		border-radius: 3px;
	}
	.loot-inert-text {
		flex: 1;
		font: 400 12.5px/1.45 'IBM Plex Sans', sans-serif;
		color: #3d3a34;
	}
	.loot-inert-text-quiet { color: var(--on-surface-variant); }

	/* --- 3 · Session -------------------------------------------------------- */

	.loot-session-group {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 10px 12px;
		border: 1px solid var(--card-border);
		border-radius: 8px;
	}
	.loot-session-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 8px;
	}
	.loot-session-action {
		font: 600 12.5px 'IBM Plex Sans', sans-serif;
		color: var(--teal);
		background: transparent;
		border: none;
		padding: 2px 4px;
		cursor: pointer;
	}
	.loot-session-action:disabled {
		color: var(--on-surface-variant);
		cursor: not-allowed;
	}
	.loot-saved-name-input { width: 140px; }
	.loot-saved-chips {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
	.loot-saved-empty {
		font: 400 12.5px 'IBM Plex Sans', sans-serif;
		color: var(--on-surface-variant);
	}
	.loot-saved-chip {
		display: inline-flex;
		align-items: stretch;
		background: var(--surface);
		border: 1px solid var(--card-border);
		border-radius: 7px;
		overflow: hidden;
	}
	.loot-saved-chip-body {
		display: flex;
		flex-direction: column;
		padding: 5px 10px;
		background: transparent;
		border: none;
		text-align: left;
		cursor: pointer;
	}
	.loot-saved-chip-body:hover { background: var(--teal-tint); }
	.loot-saved-chip-name {
		font: 500 13px 'IBM Plex Sans', sans-serif;
		letter-spacing: 0;
		color: var(--on-surface);
	}
	/* 7.5px → 12px. These four numbers are the only way to tell two saved
	   regions apart and were the smallest type in the app. */
	.loot-saved-chip-bbox {
		font: 400 12px 'IBM Plex Mono', monospace;
		font-variant-numeric: tabular-nums;
		color: var(--on-surface-variant);
	}
	/* 18px → 24px hit area. */
	.loot-saved-chip-del {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		align-self: stretch;
		font-size: 14px;
		color: var(--on-surface-variant);
		background: transparent;
		border: none;
		cursor: pointer;
	}
	.loot-saved-chip-del:hover { color: var(--rust); }
	.loot-session-merge-row {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		padding-top: 8px;
		border-top: 1px solid #f1eee8;
		cursor: pointer;
	}

	/* --- The CTA ------------------------------------------------------------ */

	/* Enabled: #fff on teal — not #0c0a10, and no opacity anywhere. The
	   sub-line carries the state, and it names where it takes you. */
	.loot-step2 {
		display: grid;
		grid-template-columns: auto 1fr auto;
		gap: 12px;
		align-items: center;
		margin-top: auto;
		padding: 12px 14px;
		background: var(--teal);
		border: none;
		border-radius: 10px;
		color: #fff;
		text-align: left;
		cursor: pointer;
	}
	.loot-step2:hover:not(:disabled) { background: #135f5a; }
	.loot-step2-glyph { font-size: 18px; line-height: 1; }
	.loot-step2-text { min-width: 0; }
	/* 700 15px, sentence case. The tracked .22em micro-cap is gone. */
	.loot-step2-title {
		font: 700 15px 'IBM Plex Sans', sans-serif;
		letter-spacing: 0.01em;
		text-transform: none;
	}
	.loot-step2-sub {
		font: 400 12.5px 'IBM Plex Mono', monospace;
		color: #cfe3e0;
	}
	/* Was .7 opacity on top of near-black on teal. Now a real bordered key. */
	.loot-hotkey-hint {
		padding: 4px 8px;
		font: 500 12.5px 'IBM Plex Mono', monospace;
		color: #fff;
		border: 1px solid rgba(255, 255, 255, 0.45);
		border-radius: 6px;
	}
	/* Disabled: ink on paper at FULL opacity. The sub-line says what is missing
	   — that is the whole point of the state. */
	.loot-step2-disabled {
		background: var(--surface-low);
		border: 1px solid var(--card-border);
		color: var(--on-surface-variant);
		cursor: not-allowed;
	}
	.loot-step2-disabled .loot-step2-title { color: var(--on-surface); }
	.loot-step2-disabled .loot-step2-sub { color: var(--on-surface-variant); }
	.loot-step2-disabled .loot-hotkey-hint {
		color: var(--on-surface-variant);
		border-color: var(--card-border);
	}
	/* Running keeps its teal glow — a live state, the one job a glow still has. */
	.loot-step2-running { box-shadow: 0 0 0 3px var(--teal-tint); }
</style>
