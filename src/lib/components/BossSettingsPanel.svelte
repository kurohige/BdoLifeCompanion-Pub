<script lang="ts">
	import {
		settingsStore,
		toggleBossHidden,
		setHiddenBosses,
		setBossSoundEnabled,
		setBossAlertMinutes,
		setBossSoundCustomName,
		showToast,
	} from "$lib/stores";
	import { BOSSES, type BossId } from "$lib/constants/boss-data";
	import { Button } from "$lib/components/ui";
	import { m } from "$lib/paraglide/messages";
	import { invoke } from "@tauri-apps/api/core";
	import { open } from "@tauri-apps/plugin-dialog";
	import { startBossAlertPreview, invalidateCustomBossSoundCache, type BossAlertPreviewHandle } from "$lib/utils/audio";
	import { onDestroy } from "svelte";

	// Event bosses drop out of the panel once their window has passed (checked at mount)
	const ALL_BOSS_IDS = (Object.keys(BOSSES) as BossId[]).filter((id) => {
		const ev = BOSSES[id].event;
		return !ev || Date.now() <= Date.parse(`${ev.until}T23:59:59.999Z`);
	});
	const regularBosses = ALL_BOSS_IDS.filter((id) => !BOSSES[id].isRare);
	const rareBosses = ALL_BOSS_IDS.filter((id) => BOSSES[id].isRare);

	let importing = $state(false);

	function isHidden(id: BossId): boolean {
		return ($settingsStore.hidden_bosses ?? []).includes(id);
	}

	function showAll() {
		setHiddenBosses([]);
	}

	function hideAll() {
		setHiddenBosses([...ALL_BOSS_IDS]);
	}

	async function chooseSoundFile() {
		if (importing) return;
		importing = true;
		try {
			const selected = await open({
				multiple: false,
				directory: false,
				filters: [
					{
						name: m.bosses_custom_sound_filter(),
						extensions: ["mp3", "wav", "ogg", "m4a", "aac", "flac"],
					},
				],
			});
			if (typeof selected !== "string") return;
			const destName = await invoke<string>("set_boss_alert_sound", {
				sourcePath: selected,
			});
			stopPreview();
			invalidateCustomBossSoundCache();
			setBossSoundCustomName(destName);
			showToast(m.bosses_custom_sound_imported({ name: destName }), "success");
		} catch (e) {
			console.error("Failed to import custom boss alert sound:", e);
			showToast(m.bosses_custom_sound_import_failed({ error: String(e) }), "error");
		} finally {
			importing = false;
		}
	}

	async function resetSound() {
		try {
			await invoke("clear_boss_alert_sound");
			stopPreview();
			invalidateCustomBossSoundCache();
			setBossSoundCustomName("");
			showToast(m.bosses_custom_sound_reset(), "success");
		} catch (e) {
			console.error("Failed to clear custom boss alert sound:", e);
			showToast(m.bosses_custom_sound_reset_failed({ error: String(e) }), "error");
		}
	}

	// Preview playback state — single in-flight handle so the button can toggle
	// between play and stop. Cleared when playback ends naturally or the user
	// stops it. Also cleared on component teardown so navigating away mid-clip
	// doesn't leave a stranded HTMLAudioElement playing.
	let previewing = $state(false);
	let previewHandle: BossAlertPreviewHandle | null = null;

	function stopPreview() {
		if (!previewHandle) return;
		previewHandle.stop();
		previewHandle = null;
		previewing = false;
	}

	async function togglePreview() {
		if (previewing) {
			stopPreview();
			return;
		}
		previewing = true;
		try {
			const handle = await startBossAlertPreview();
			previewHandle = handle;
			void handle.done.then(() => {
				if (previewHandle === handle) {
					previewHandle = null;
					previewing = false;
				}
			});
		} catch (e) {
			console.warn("Failed to start boss alert preview:", e);
			previewing = false;
			previewHandle = null;
		}
	}

	onDestroy(() => {
		previewHandle?.stop();
		previewHandle = null;
	});
</script>

<div class="space-y-3">
	<!-- Boss alert sound -->
	<div class="paper-card rounded p-2 space-y-2">
		<h3 class="text-[12.5px] font-bold text-muted-foreground uppercase tracking-wide">{m.bosses_alerts_section()}</h3>
		<label class="flex items-center justify-between gap-2 cursor-pointer">
			<div class="min-w-0">
				<p class="text-[12.5px] font-semibold text-foreground">{m.bosses_play_sound()}</p>
				<p class="text-[12px] text-muted-foreground">{m.bosses_play_sound_subtitle()}</p>
			</div>
			<input
				type="checkbox"
				checked={$settingsStore.boss_sound_enabled}
				onchange={(e) => setBossSoundEnabled((e.target as HTMLInputElement).checked)}
				class="settings-toggle flex-shrink-0"
			/>
		</label>

		{#if $settingsStore.boss_sound_enabled}
			<div class="flex items-center justify-between gap-2">
				<div class="min-w-0">
					<p class="text-[12.5px] font-semibold text-foreground">{m.bosses_alert_minutes()}</p>
					<p class="text-[12px] text-muted-foreground">{m.bosses_alert_minutes_subtitle()}</p>
				</div>
				<input
					type="number"
					min="1"
					max="30"
					value={$settingsStore.boss_alert_minutes}
					oninput={(e) => {
						const v = parseInt((e.target as HTMLInputElement).value, 10);
						if (!isNaN(v)) setBossAlertMinutes(v);
					}}
					class="w-14 bg-input border border-border rounded px-1.5 py-0.5 text-[12.5px] text-center text-foreground no-spinner flex-shrink-0"
				/>
			</div>

			<!-- Custom sound -->
			<div class="border-t border-outline-variant/20 pt-2 space-y-1.5">
				<div class="min-w-0">
					<p class="text-[12.5px] font-semibold text-foreground">{m.bosses_custom_sound()}</p>
					<p class="text-[12px] text-muted-foreground">{m.bosses_custom_sound_subtitle()}</p>
				</div>
				<div class="flex items-center justify-between gap-2">
					<span class="text-[12px] text-muted-foreground truncate" title={$settingsStore.boss_sound_custom_name || m.bosses_custom_sound_default()}>
						{$settingsStore.boss_sound_custom_name || m.bosses_custom_sound_default()}
					</span>
					<div class="flex gap-1.5 flex-shrink-0">
						<Button
							type="button"
							variant={previewing ? "primary" : "secondary"}
							size="sm"
							onclick={togglePreview}
							title={previewing ? m.bosses_custom_sound_stop_title() : m.bosses_custom_sound_preview_title()}
							aria-pressed={previewing}
						>
							{#if previewing}
								<svg viewBox="0 0 10 10" class="w-2.5 h-2.5" fill="currentColor" aria-hidden="true">
									<rect x="2" y="2" width="6" height="6" />
								</svg>
								{m.bosses_custom_sound_stop()}
							{:else}
								<svg viewBox="0 0 10 10" class="w-2.5 h-2.5" fill="currentColor" aria-hidden="true">
									<polygon points="2,1 9,5 2,9" />
								</svg>
								{m.bosses_custom_sound_preview()}
							{/if}
						</Button>
						<Button
							type="button"
							variant="secondary"
							size="sm"
							onclick={chooseSoundFile}
							disabled={importing}
							title={m.bosses_custom_sound_choose_title()}
						>
							{importing ? m.bosses_custom_sound_importing() : m.bosses_custom_sound_choose()}
						</Button>
						{#if $settingsStore.boss_sound_custom_name}
							<Button
								type="button"
								variant="danger"
								size="sm"
								onclick={resetSound}
								title={m.bosses_custom_sound_reset_title()}
							>
								{m.bosses_custom_sound_reset_button()}
							</Button>
						{/if}
					</div>
				</div>
			</div>
		{/if}
	</div>

	<!-- Boss Visibility -->
	<div class="space-y-2">
		<div class="space-y-0.5">
			<h2 class="text-sm font-bold text-foreground">{m.bosses_visibility_title()}</h2>
			<p class="text-[12px] text-muted-foreground">
				{m.bosses_visibility_subtitle()}
			</p>
		</div>
		<div class="flex gap-1.5">
			<Button variant="secondary" size="sm" onclick={showAll}>
				{m.bosses_show_all()}
			</Button>
			<Button variant="ghost" size="sm" onclick={hideAll}>
				{m.bosses_hide_all()}
			</Button>
		</div>

		<!-- Regular bosses -->
		<div class="space-y-1.5 pt-1">
			<h3 class="text-[12.5px] font-bold text-muted-foreground uppercase tracking-wide">{m.bosses_regular()}</h3>
			<div class="grid grid-cols-2 gap-1.5">
				{#each regularBosses as id (id)}
					{@const boss = BOSSES[id]}
					{@const hidden = isHidden(id)}
					<button
						onclick={() => toggleBossHidden(id)}
						class="flex items-center gap-2 p-1.5 rounded border transition-all text-left
							{hidden
								? 'border-outline-variant/20 bg-secondary/20 opacity-50'
								: 'border-l-2 border-l-primary border-outline-variant/40 bg-secondary/40 hover:border-outline-hud'}"
						title={hidden ? m.bosses_card_hidden_title() : m.bosses_card_visible_title()}
					>
						<img
							src={boss.image}
							alt={boss.name}
							class="w-7 h-7 rounded-full border border-outline-variant/30 object-cover {hidden ? 'grayscale' : ''}"
						/>
						<span class="flex-1 text-[12.5px] font-semibold text-foreground truncate">{boss.name}</span>
						{#if boss.event}
							<span
								class="text-[12px] px-1 rounded border border-primary/40 text-primary/90 uppercase tracking-wide flex-shrink-0"
								title={`${boss.event.from} → ${boss.event.until}`}>{m.bosses_event_tag()}</span
							>
						{/if}
						<span
							class="w-7 h-4 rounded-full border flex items-center flex-shrink-0 {hidden ? 'bg-secondary border-outline-variant/30 justify-start' : 'bg-primary/20 border-primary justify-end'}"
						>
							<span
								class="w-3 h-3 rounded-full mx-0.5 {hidden ? 'bg-muted-foreground' : 'bg-primary'}"
							></span>
						</span>
					</button>
				{/each}
			</div>
		</div>

		<!-- Rare bosses -->
		<div class="space-y-1.5">
			<h3 class="text-[12.5px] font-bold text-muted-foreground uppercase tracking-wide">{m.bosses_rare()}</h3>
			<div class="grid grid-cols-2 gap-1.5">
				{#each rareBosses as id (id)}
					{@const boss = BOSSES[id]}
					{@const hidden = isHidden(id)}
					<button
						onclick={() => toggleBossHidden(id)}
						class="flex items-center gap-2 p-1.5 rounded border transition-all text-left
							{hidden
								? 'border-outline-variant/20 bg-secondary/20 opacity-50'
								: 'border-l-2 border-l-primary border-outline-variant/40 bg-secondary/40 hover:border-outline-hud'}"
						title={hidden ? m.bosses_card_hidden_title() : m.bosses_card_visible_title()}
					>
						<img
							src={boss.image}
							alt={boss.name}
							class="w-7 h-7 rounded-full border border-outline-variant/30 object-cover {hidden ? 'grayscale' : 'opacity-70'}"
						/>
						<span class="flex-1 text-[12.5px] font-semibold text-foreground/80 truncate">{boss.name}</span>
						{#if boss.event}
							<span
								class="text-[12px] px-1 rounded border border-primary/40 text-primary/90 uppercase tracking-wide flex-shrink-0"
								title={`${boss.event.from} → ${boss.event.until}`}>{m.bosses_event_tag()}</span
							>
						{/if}
						<span
							class="w-7 h-4 rounded-full border flex items-center flex-shrink-0 {hidden ? 'bg-secondary border-outline-variant/30 justify-start' : 'bg-primary/20 border-primary justify-end'}"
						>
							<span
								class="w-3 h-3 rounded-full mx-0.5 {hidden ? 'bg-muted-foreground' : 'bg-primary'}"
							></span>
						</span>
					</button>
				{/each}
			</div>
		</div>
	</div>
</div>
