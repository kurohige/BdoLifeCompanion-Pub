<script lang="ts">
	import { getCurrentWindow } from "@tauri-apps/api/window";
	import {
		settingsStore,
		setTransparency,
		setCookingTotalMastery,
		setAlchemyTotalMastery,
		setServerRegion,
		setMarketRegion,
		setBossSoundEnabled,
		setTimerSoundEnabled,
		setBossAlertMinutes,
		setFontBold,
		setFontSize,
		setBarterLevel,
		setValuePack,
		setAlwaysOnTop,
		setMiniShowClocks,
		setClockFormat24h,
		setLocale,
		setStripSlot,
		setCraftingLead,
		setCraftingDensity,
		setShowLastKill,
		setShowUsedIn,
		setUiScale,
	} from "$lib/stores/settings";
	import { m } from "$lib/paraglide/messages";
	import { UI_SCALE_STEPS } from "$lib/services/persistence";
	import type { Locale, StripSlot, CraftingLead, CraftingDensity } from "$lib/services/persistence";
	import { BARTER_LEVELS } from "$lib/models/bartering";
	import { clearInventory } from "$lib/stores/inventory";
	import { clearCraftingLog } from "$lib/stores/crafting-log";
	import { clearGrindingLog } from "$lib/stores/grinding";
	import { clearHuntingLog } from "$lib/stores/hunting";
	import {
		clearBarterLog,
		barterInventoryStore,
		shipProgressStore,
		sailorRosterStore,
	} from "$lib/stores/bartering";
	import {
		currentRouteStore,
		routeLogsStore,
		barterMapLayoutStore,
	} from "$lib/stores/bartering-routes";
	import { treasureProgressStore } from "$lib/stores/treasure";
	import { weeklyTasksProgressStore } from "$lib/stores/weekly-tasks";
	import { invoke } from "@tauri-apps/api/core";
	import { appVersionStore, settingsTabStore } from "$lib/stores";
	import {
		notesStore,
		noteCategoriesStore,
		addCategory,
		renameCategory,
		recolorCategory,
		deleteCategory,
	} from "$lib/stores/notes";
	import { STICKY_COLORS, STICKY_COLOR_KEYS } from "$lib/utils/sticky-colors";
	import { MAX_CATEGORIES, MAX_CATEGORY_NAME_LEN } from "$lib/models/notes";
	import type { StickyColor } from "$lib/models/notes";
	import BossSettingsPanel from "./BossSettingsPanel.svelte";
	import ToggleSwitch from "./ui/ToggleSwitch.svelte";
	import { Button } from "$lib/components/ui";
	import type { FontSize } from "$lib/services/persistence";

	const appWindow = getCurrentWindow();

	// Collapsible section state
	let openSections = $state<Record<string, boolean>>({
		display: true,
		layout: true,
		notifications: true,
		game: true,
		notes: false,
		data: false,
	});

	// ── Note categories ──
	// Rename, recolour and delete live here; the note editor only picks and
	// creates. Deleting a category takes every note in it, so it confirms.
	let confirmingCategory = $state<string | null>(null);

	function noteCountFor(key: string): number {
		return $notesStore.filter((n) => n.category_key === key).length;
	}
	function commitRename(key: string, current: string, el: HTMLInputElement) {
		const next = el.value.trim();
		// renameCategory ignores an empty name, so put the old one back rather
		// than leaving the field showing a value that was never stored.
		if (!next) {
			el.value = current;
			return;
		}
		if (next !== current) renameCategory(key, next);
	}
	function cycleColor(key: string, current: StickyColor) {
		const i = STICKY_COLOR_KEYS.indexOf(current);
		recolorCategory(key, STICKY_COLOR_KEYS[(i + 1) % STICKY_COLOR_KEYS.length]);
	}
	function doDeleteCategory(key: string) {
		deleteCategory(key);
		confirmingCategory = null;
	}
	function handleAddCategory() {
		addCategory("");
	}

	function toggleSection(key: string) {
		openSections[key] = !openSections[key];
	}

	// Local state for transparency slider
	let transparencyPercent = $state(Math.round($settingsStore.transparency * 100));

	// Apply transparency via CSS variable on document
	function applyTransparency(opacity: number) {
		document.documentElement.style.setProperty("--app-opacity", String(opacity));
	}

	$effect(() => {
		applyTransparency($settingsStore.transparency);
	});

	function handleTransparencyChange(e: Event) {
		const target = e.target as HTMLInputElement;
		const percent = parseInt(target.value, 10);
		transparencyPercent = percent;
		const opacity = percent / 100;
		setTransparency(opacity);
		applyTransparency(opacity);
	}

	const FONT_SIZES: { id: FontSize; name: string }[] = [
		{ id: "xs", name: "XS" },
		{ id: "small", name: "S" },
		{ id: "default", name: "M" },
		{ id: "large", name: "L" },
		{ id: "xl", name: "XL" },
		{ id: "xxl", name: "XXL" },
	];

	// Clear all data
	async function handleClearAllData() {
		if (!confirm(m.settings_data_clear_confirm())) return;

		try {
			await invoke("clear_all_data");
			clearInventory();
			clearCraftingLog();
			clearGrindingLog();
			clearHuntingLog();
			clearBarterLog();
			currentRouteStore.set(null);
			routeLogsStore.set([]);
			barterMapLayoutStore.set({ positionOverrides: {}, customNodes: [] });
			barterInventoryStore.set({ items: {}, crowCoins: 0, lastUpdated: "" });
			shipProgressStore.set([]);
			sailorRosterStore.set([]);
			treasureProgressStore.set([]);
			weeklyTasksProgressStore.set([]);
			settingsStore.update(s => ({ ...s, favorites: [] }));
		} catch (error) {
			console.error("Failed to clear data:", error);
		}
	}

	// Get data path on mount
	let dataPath = $state("Loading...");
	invoke<string>("get_data_path").then(path => { dataPath = path; }).catch(() => { dataPath = "Unknown"; });
</script>

<div class="space-y-1.5 max-h-[calc(100vh-150px)] overflow-auto pr-1">
	<h2 class="text-sm font-bold text-foreground mb-1">{m.settings_title()}</h2>

	<!-- Top tabs: General / Bosses -->
	<div class="flex gap-1 border-b border-outline-variant/30 mb-2">
		{#each [
			{ id: "general" as const, label: m.settings_tab_general() },
			{ id: "bosses" as const, label: m.settings_tab_bosses() },
		] as tab}
			<button
				onclick={() => settingsTabStore.set(tab.id)}
				class="px-3 py-1.5 text-[12.5px] font-bold transition-colors relative
					{$settingsTabStore === tab.id
						? 'text-foreground'
						: 'text-muted-foreground hover:text-foreground'}"
			>
				{tab.label}
				{#if $settingsTabStore === tab.id}
					<div class="absolute bottom-[-1px] left-0 right-0 h-0.5 bg-primary"></div>
				{/if}
			</button>
		{/each}
	</div>

	{#if $settingsTabStore === "bosses"}
		<BossSettingsPanel />
	{:else}
	<!-- ===== DISPLAY SECTION ===== -->
	<div class="paper-card rounded overflow-hidden">
		<button
			onclick={() => toggleSection('display')}
			class="w-full flex items-center justify-between px-2 py-1.5 hover:bg-secondary/50 transition-colors"
		>
			<h3 class="text-xs font-bold text-foreground">{m.settings_section_display()}</h3>
			<svg
				viewBox="0 0 24 24"
				class="w-3.5 h-3.5 text-muted-foreground transition-transform duration-200 {openSections.display ? 'rotate-180' : ''}"
				fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"
			>
				<polyline points="6 9 12 15 18 9" />
			</svg>
		</button>
		{#if openSections.display}
			<div class="px-2 pb-2 space-y-2 border-t border-border/50 pt-1.5">
				<!-- Opacity (how solid the window is — 100% = fully opaque) -->
				<div class="space-y-1.5">
					<div class="flex items-center justify-between">
						<span class="text-[12px] text-muted-foreground">{m.settings_display_opacity()}</span>
						<span class="text-[12.5px] font-mono font-bold text-foreground">{transparencyPercent}%</span>
					</div>
					<input
						type="range"
						min="20"
						max="100"
						step="5"
						value={transparencyPercent}
						onchange={handleTransparencyChange}
						oninput={(e) => transparencyPercent = parseInt((e.target as HTMLInputElement).value, 10)}
						class="settings-slider"
					/>
				</div>


				<!-- Font Size -->
				<div class="space-y-1.5">
					<span class="text-[12px] text-muted-foreground">{m.settings_display_font_size()}</span>
					<div class="grid grid-cols-6 gap-1.5">
						{#each FONT_SIZES as size}
							{@const isActive = ($settingsStore.font_size ?? 'default') === size.id}
							<button
								onclick={() => setFontSize(size.id)}
								class="px-1.5 py-1.5 rounded border-2 text-[12px] font-bold transition-all
									{isActive
										? 'border-primary bg-primary text-primary-foreground'
										: 'border-outline-variant/30 text-muted-foreground hover:border-outline-variant/60 hover:text-foreground'}"
							>
								{size.name}
							</button>
						{/each}
					</div>
				</div>

				<!-- Font Bold -->
				<div class="flex items-center justify-between">
					<span class="text-[12px] text-muted-foreground">{m.settings_display_bold_text()}</span>
					<ToggleSwitch
						checked={$settingsStore.font_bold}
						onchange={setFontBold}
						title={m.settings_display_bold_title()}
					/>
				</div>

				<!-- Always on Top -->
				<div class="flex items-center justify-between">
					<span class="text-[12px] text-muted-foreground">{m.settings_display_always_on_top()}</span>
					<ToggleSwitch
						checked={$settingsStore.always_on_top}
						onchange={setAlwaysOnTop}
						title={m.settings_display_always_on_top_title()}
					/>
				</div>

				<!-- Mini Mode Clocks -->
				<div class="flex items-center justify-between">
					<div class="min-w-0">
						<span class="text-[12px] text-muted-foreground">{m.settings_display_mini_clocks()}</span>
						<p class="text-[12px] text-muted-foreground/70">{m.settings_display_mini_clocks_subtitle()}</p>
					</div>
					<ToggleSwitch
						checked={$settingsStore.mini_show_clocks ?? true}
						onchange={setMiniShowClocks}
						title={m.settings_display_mini_clocks_title()}
					/>
				</div>

				<!-- Clock Format -->
				{#if ($settingsStore.mini_show_clocks ?? true)}
					<div class="space-y-1.5">
						<span class="text-[12px] text-muted-foreground">{m.settings_display_clock_format()}</span>
						<div class="grid grid-cols-2 gap-1.5">
							{#each [
								{ id: true, label: "24h", sample: "20:14" },
								{ id: false, label: "12h", sample: "8:14 PM" },
							] as opt}
								{@const isActive = ($settingsStore.clock_format_24h ?? true) === opt.id}
								<button
									onclick={() => setClockFormat24h(opt.id)}
									class="px-2 py-1.5 rounded border-2 text-[12.5px] font-bold transition-all flex items-center justify-center gap-2
										{isActive
											? 'border-primary bg-primary text-primary-foreground'
											: 'border-outline-variant/30 text-muted-foreground hover:border-outline-variant/60 hover:text-foreground'}"
								>
									<span>{opt.label}</span>
									<span class="text-[12px] font-mono opacity-70">{opt.sample}</span>
								</button>
							{/each}
						</div>
					</div>
				{/if}

				<!-- Language -->
				<div class="space-y-1.5">
					<span class="text-[12px] text-muted-foreground">{m.settings_language_label()}</span>
					<div class="grid grid-cols-2 gap-1.5">
						{#each [
							{ id: "en" as Locale, label: m.settings_language_english() },
							{ id: "es" as Locale, label: m.settings_language_spanish() },
						] as opt (opt.id)}
							{@const isActive = ($settingsStore.locale ?? "en") === opt.id}
							<button
								onclick={() => setLocale(opt.id)}
								class="px-2 py-1.5 rounded border-2 text-[12.5px] font-bold transition-all
									{isActive
										? 'border-primary bg-primary text-primary-foreground'
										: 'border-outline-variant/30 text-muted-foreground hover:border-outline-variant/60 hover:text-foreground'}"
							>
								{opt.label}
							</button>
						{/each}
					</div>
				</div>
			</div>
		{/if}
	</div>

	<!-- ===== LAYOUT SECTION (Parchment 7.3 — handoff "Configurable layout") ===== -->
	<div class="paper-card rounded overflow-hidden">
		<button
			onclick={() => toggleSection('layout')}
			class="w-full flex items-center justify-between px-2 py-1.5 hover:bg-secondary/50 transition-colors"
		>
			<h3 class="text-xs font-bold text-foreground">{m.settings_section_layout()}</h3>
			<svg
				viewBox="0 0 24 24"
				class="w-3.5 h-3.5 text-muted-foreground transition-transform duration-200 {openSections.layout ? 'rotate-180' : ''}"
				fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"
			>
				<polyline points="6 9 12 15 18 9" />
			</svg>
		</button>
		{#if openSections.layout}
			<div class="px-2 pb-2 space-y-2 border-t border-border/50 pt-1.5">
				<!-- Status strip slot -->
				<div class="space-y-1.5">
					<span class="text-[12px] text-muted-foreground">{m.settings_layout_strip()}</span>
					<div class="grid grid-cols-3 gap-1.5">
						{#each [
							{ id: "top" as StripSlot, label: m.settings_layout_strip_top() },
							{ id: "bottom" as StripSlot, label: m.settings_layout_strip_bottom() },
							{ id: "hidden" as StripSlot, label: m.settings_layout_strip_hidden() },
						] as opt (opt.id)}
							{@const isActive = $settingsStore.strip_slot === opt.id}
							<button
								onclick={() => setStripSlot(opt.id)}
								class="px-2 py-1.5 rounded border-2 text-[12.5px] font-bold transition-all
									{isActive
										? 'border-primary bg-primary text-primary-foreground'
										: 'border-outline-variant/30 text-muted-foreground hover:border-outline-variant/60 hover:text-foreground'}"
							>
								{opt.label}
							</button>
						{/each}
					</div>
				</div>

				<!-- Crafting lead module -->
				<div class="space-y-1.5">
					<span class="text-[12px] text-muted-foreground">{m.settings_layout_lead()}</span>
					<div class="grid grid-cols-2 gap-1.5">
						{#each [
							{ id: "list" as CraftingLead, label: m.settings_layout_lead_list() },
							{ id: "detail" as CraftingLead, label: m.settings_layout_lead_detail() },
						] as opt (opt.id)}
							{@const isActive = $settingsStore.crafting_lead === opt.id}
							<button
								onclick={() => setCraftingLead(opt.id)}
								class="px-2 py-1.5 rounded border-2 text-[12.5px] font-bold transition-all
									{isActive
										? 'border-primary bg-primary text-primary-foreground'
										: 'border-outline-variant/30 text-muted-foreground hover:border-outline-variant/60 hover:text-foreground'}"
							>
								{opt.label}
							</button>
						{/each}
					</div>
				</div>

				<!-- Crafting density -->
				<div class="space-y-1.5">
					<span class="text-[12px] text-muted-foreground">{m.settings_layout_density()}</span>
					<div class="grid grid-cols-2 gap-1.5">
						{#each [
							{ id: "comfortable" as CraftingDensity, label: m.settings_layout_density_comfortable() },
							{ id: "compact" as CraftingDensity, label: m.settings_layout_density_compact() },
						] as opt (opt.id)}
							{@const isActive = $settingsStore.crafting_density === opt.id}
							<button
								onclick={() => setCraftingDensity(opt.id)}
								class="px-2 py-1.5 rounded border-2 text-[12.5px] font-bold transition-all
									{isActive
										? 'border-primary bg-primary text-primary-foreground'
										: 'border-outline-variant/30 text-muted-foreground hover:border-outline-variant/60 hover:text-foreground'}"
							>
								{opt.label}
							</button>
						{/each}
					</div>
				</div>

				<!-- Last-kill line -->
				<div class="flex items-center justify-between">
					<div class="min-w-0">
						<span class="text-[12px] text-muted-foreground">{m.settings_layout_last_kill()}</span>
						<p class="text-[12px] text-muted-foreground/70">{m.settings_layout_last_kill_sub()}</p>
					</div>
					<ToggleSwitch
						checked={$settingsStore.show_last_kill}
						onchange={setShowLastKill}
						title={m.settings_layout_last_kill()}
					/>
				</div>

				<!-- Used-in panel -->
				<div class="flex items-center justify-between">
					<div class="min-w-0">
						<span class="text-[12px] text-muted-foreground">{m.settings_layout_used_in()}</span>
						<p class="text-[12px] text-muted-foreground/70">{m.settings_layout_used_in_sub()}</p>
					</div>
					<ToggleSwitch
						checked={$settingsStore.show_used_in}
						onchange={setShowUsedIn}
						title={m.settings_layout_used_in()}
					/>
				</div>

				<!-- UI scale -->
				<div class="space-y-1.5">
					<div class="min-w-0">
						<span class="text-[12px] text-muted-foreground">{m.settings_layout_ui_scale()}</span>
						<p class="text-[12px] text-muted-foreground/70">{m.settings_layout_ui_scale_sub()}</p>
					</div>
					<div class="grid grid-cols-4 gap-1.5">
						{#each UI_SCALE_STEPS as step (step)}
							{@const isActive = $settingsStore.ui_scale === step}
							<button
								onclick={() => setUiScale(step)}
								class="px-1.5 py-1.5 rounded border-2 text-[12.5px] font-bold font-mono transition-all
									{isActive
										? 'border-primary bg-primary text-primary-foreground'
										: 'border-outline-variant/30 text-muted-foreground hover:border-outline-variant/60 hover:text-foreground'}"
							>
								{step}%
							</button>
						{/each}
					</div>
				</div>
			</div>
		{/if}
	</div>

	<!-- ===== NOTIFICATIONS SECTION ===== -->
	<div class="paper-card rounded overflow-hidden">
		<button
			onclick={() => toggleSection('notifications')}
			class="w-full flex items-center justify-between px-2 py-1.5 hover:bg-secondary/50 transition-colors"
		>
			<h3 class="text-xs font-bold text-foreground">{m.settings_section_notifications()}</h3>
			<svg
				viewBox="0 0 24 24"
				class="w-3.5 h-3.5 text-muted-foreground transition-transform duration-200 {openSections.notifications ? 'rotate-180' : ''}"
				fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"
			>
				<polyline points="6 9 12 15 18 9" />
			</svg>
		</button>
		{#if openSections.notifications}
			<div class="px-2 pb-2 space-y-2 border-t border-border/50 pt-1.5">
				<!-- Boss Spawn Alert -->
				<div class="space-y-1">
					<div class="flex items-center justify-between">
						<span class="text-[12px] text-muted-foreground">{m.settings_notifications_boss_alert()}</span>
						<button
							onclick={() => setBossSoundEnabled(!$settingsStore.boss_sound_enabled)}
							title={m.settings_notifications_boss_alert_title()}
							class="relative w-8 h-4 rounded-full transition-colors {$settingsStore.boss_sound_enabled ? 'bg-primary' : 'bg-secondary border border-border'}"
						>
							<div class="absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-foreground transition-transform {$settingsStore.boss_sound_enabled ? 'translate-x-4' : ''}"></div>
						</button>
					</div>
					{#if $settingsStore.boss_sound_enabled}
						<div class="flex items-center gap-1.5">
							<span class="text-[12px] text-muted-foreground/70">{m.settings_notifications_alert()}</span>
							<input
								type="text"
								inputmode="numeric"
								pattern="[0-9]*"
								value={$settingsStore.boss_alert_minutes}
								oninput={(e) => {
									const val = parseInt(e.currentTarget.value, 10);
									if (!isNaN(val) && val >= 1 && val <= 30) setBossAlertMinutes(val);
								}}
								class="w-10 bg-input text-foreground border border-border rounded px-1 py-0.5 text-[12px] text-center focus:outline-none focus:ring-1 focus:ring-primary no-spinner"
							/>
							<span class="text-[12px] text-muted-foreground/70">{m.settings_notifications_min_before()}</span>
						</div>
					{/if}
				</div>

				<!-- Timer Completion Sound -->
				<div class="flex items-center justify-between">
					<span class="text-[12px] text-muted-foreground">{m.settings_notifications_timer_sound()}</span>
					<button
						onclick={() => setTimerSoundEnabled(!$settingsStore.timer_sound_enabled)}
						title={m.settings_notifications_timer_sound_title()}
						class="relative w-8 h-4 rounded-full transition-colors {$settingsStore.timer_sound_enabled ? 'bg-primary' : 'bg-secondary border border-border'}"
					>
						<div class="absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-foreground transition-transform {$settingsStore.timer_sound_enabled ? 'translate-x-4' : ''}"></div>
					</button>
				</div>
			</div>
		{/if}
	</div>

	<!-- ===== GAME SECTION ===== -->
	<div class="paper-card rounded overflow-hidden">
		<button
			onclick={() => toggleSection('game')}
			class="w-full flex items-center justify-between px-2 py-1.5 hover:bg-secondary/50 transition-colors"
		>
			<h3 class="text-xs font-bold text-foreground">{m.settings_section_game()}</h3>
			<svg
				viewBox="0 0 24 24"
				class="w-3.5 h-3.5 text-muted-foreground transition-transform duration-200 {openSections.game ? 'rotate-180' : ''}"
				fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"
			>
				<polyline points="6 9 12 15 18 9" />
			</svg>
		</button>
		{#if openSections.game}
			<div class="px-2 pb-2 space-y-2 border-t border-border/50 pt-1.5">
				<!-- Server Region -->
				<div class="space-y-0.5">
					<span class="text-[12px] text-muted-foreground">{m.settings_game_server_region()}</span>
					<select
						value={$settingsStore.server_region}
						onchange={(e) => setServerRegion((e.target as HTMLSelectElement).value)}
						class="w-full bg-input text-foreground border border-border rounded px-1 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
					>
						<option value="NA">{m.settings_game_region_na()}</option>
						<option value="EU">{m.settings_game_region_eu()}</option>
						<option value="SEA">{m.settings_game_region_sea()}</option>
						<option value="SA">{m.settings_game_region_sa()}</option>
					</select>
					<span class="text-[12px] text-muted-foreground/60">{m.settings_game_server_region_subtitle()}</span>
				</div>

				<!-- Market Region -->
				<div class="space-y-0.5">
					<span class="text-[12px] text-muted-foreground">{m.settings_game_market_region()}</span>
					<select
						value={$settingsStore.market_region}
						onchange={(e) => setMarketRegion((e.target as HTMLSelectElement).value)}
						class="w-full bg-input text-foreground border border-border rounded px-1 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
					>
						<option value="NA">{m.settings_game_region_na()}</option>
						<option value="EU">{m.settings_game_region_eu()}</option>
						<option value="SEA">{m.settings_game_region_sea()}</option>
					</select>
					<span class="text-[12px] text-muted-foreground/60">{m.settings_game_market_region_subtitle()}</span>
				</div>

				<!-- Life Skill Ranks -->
				<div class="space-y-1">
					<span class="text-[12px] text-muted-foreground">{m.settings_game_life_skills()}</span>
					<div class="grid grid-cols-2 gap-2">
						<!-- Cooking -->
						<div class="space-y-0.5">
							<label for="cooking-mastery" class="text-[12px] text-muted-foreground/70">{m.settings_game_cooking_mastery()}</label>
							<input
								id="cooking-mastery"
								type="text"
								inputmode="numeric"
								pattern="[0-9]*"
								value={$settingsStore.cooking_total_mastery}
								oninput={(e) => {
									const val = parseInt(e.currentTarget.value, 10);
									if (!isNaN(val) && val >= 0 && val <= 3000) setCookingTotalMastery(val);
									else if (e.currentTarget.value === '') setCookingTotalMastery(0);
								}}
								placeholder={m.settings_game_mastery_placeholder()}
								class="w-full bg-input text-foreground border border-border rounded px-1 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary no-spinner"
							/>
						</div>
						<!-- Alchemy -->
						<div class="space-y-0.5">
							<label for="alchemy-mastery" class="text-[12px] text-muted-foreground/70">{m.settings_game_alchemy_mastery()}</label>
							<input
								id="alchemy-mastery"
								type="text"
								inputmode="numeric"
								pattern="[0-9]*"
								value={$settingsStore.alchemy_total_mastery}
								oninput={(e) => {
									const val = parseInt(e.currentTarget.value, 10);
									if (!isNaN(val) && val >= 0 && val <= 3000) setAlchemyTotalMastery(val);
									else if (e.currentTarget.value === '') setAlchemyTotalMastery(0);
								}}
								placeholder={m.settings_game_mastery_placeholder()}
								class="w-full bg-input text-foreground border border-border rounded px-1 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary no-spinner"
							/>
						</div>
					</div>
				</div>

				<!-- Bartering -->
				<div class="space-y-1">
					<span class="text-[12px] text-muted-foreground">{m.settings_game_bartering()}</span>
					<div class="grid grid-cols-2 gap-2">
						<div class="space-y-0.5">
							<label for="barter-rank" class="text-[12px] text-muted-foreground/70">{m.settings_game_barter_level()}</label>
							<select
								id="barter-rank"
								value={$settingsStore.barter_level || "Beginner 1"}
								onchange={(e) => setBarterLevel((e.target as HTMLSelectElement).value)}
								class="w-full bg-input text-foreground border border-border rounded px-1 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
							>
								{#each BARTER_LEVELS as level}
									<option value={level}>{level}</option>
								{/each}
							</select>
						</div>
						<div class="space-y-0.5 flex flex-col justify-end">
							<label class="flex items-center gap-1.5 text-[12px] text-muted-foreground/70 cursor-pointer py-1">
								<input
									type="checkbox"
									checked={$settingsStore.has_value_pack}
									onchange={(e) => setValuePack((e.target as HTMLInputElement).checked)}
									class="w-3 h-3 accent-primary"
								/>
								{m.settings_game_value_pack()}
							</label>
						</div>
					</div>
				</div>
			</div>
		{/if}
	</div>

	<!-- ===== NOTES SECTION ===== -->
	<!-- Category rename/recolour/delete live here rather than in the note
	     editor: deleteCategory destroys every note in the category, which is
	     not something to sit one stray click from the dropdown you use to
	     switch category while typing. -->
	<div class="paper-card rounded overflow-hidden">
		<button
			onclick={() => toggleSection('notes')}
			class="w-full flex items-center justify-between px-2 py-1.5 hover:bg-secondary/50 transition-colors"
		>
			<h3 class="text-xs font-bold text-foreground">{m.settings_section_notes()}</h3>
			<svg
				viewBox="0 0 24 24"
				class="w-3.5 h-3.5 text-muted-foreground transition-transform duration-200 {openSections.notes ? 'rotate-180' : ''}"
				fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"
			>
				<polyline points="6 9 12 15 18 9" />
			</svg>
		</button>
		{#if openSections.notes}
			<div class="px-2 pb-2 space-y-2 border-t border-border/50 pt-1.5">
				<div class="space-y-0.5">
					<span class="text-[12px] text-muted-foreground">{m.settings_notes_categories()}</span>
					<p class="text-[12px] text-muted-foreground/70 leading-snug">{m.settings_notes_categories_subtitle()}</p>
				</div>

				<div class="space-y-1">
					{#each $noteCategoriesStore as cat (cat.key)}
						{@const count = noteCountFor(cat.key)}
						<div class="flex items-center gap-1.5">
							<!-- Colour: cycles the six sticky tones -->
							<button
								onclick={() => cycleColor(cat.key, cat.color)}
								title={m.settings_notes_recolor()}
								aria-label={m.settings_notes_recolor()}
								class="w-3 h-3 rounded-full flex-none border border-border"
								style="background:{STICKY_COLORS[cat.color].fg}"
							></button>
							<input
								type="text"
								value={cat.name}
								maxlength={MAX_CATEGORY_NAME_LEN}
								onblur={(e) => commitRename(cat.key, cat.name, (e.target as HTMLInputElement))}
								onkeydown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
								class="flex-1 min-w-0 bg-input text-foreground border border-border rounded px-1 py-0.5 text-[12px] focus:outline-none focus:ring-1 focus:ring-primary"
							/>
							<span class="text-[12px] font-mono text-muted-foreground/70 flex-none w-8 text-right">{count}</span>
							{#if confirmingCategory === cat.key}
								<button
									onclick={() => doDeleteCategory(cat.key)}
									class="text-[12px] font-bold text-destructive px-1.5 py-0.5 rounded hover:bg-destructive hover:text-destructive-foreground transition-colors flex-none"
								>{m.settings_notes_delete_yes()}</button>
								<button
									onclick={() => (confirmingCategory = null)}
									class="text-[12px] text-muted-foreground px-1.5 py-0.5 rounded hover:bg-secondary flex-none"
								>{m.note_remove_confirm_no()}</button>
							{:else}
								<button
									onclick={() => (confirmingCategory = cat.key)}
									disabled={$noteCategoriesStore.length <= 1}
									title={$noteCategoriesStore.length <= 1 ? m.settings_notes_delete_last() : m.settings_notes_delete({ count })}
									aria-label={m.settings_notes_delete({ count })}
									class="w-5 h-5 flex items-center justify-center rounded text-[12px] text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-30 disabled:cursor-not-allowed flex-none"
								>✕</button>
							{/if}
						</div>
					{/each}
				</div>

				{#if confirmingCategory}
					<p class="text-[12px] text-destructive leading-snug">
						{m.settings_notes_delete_warning({ count: noteCountFor(confirmingCategory) })}
					</p>
				{/if}

				<button
					onclick={handleAddCategory}
					disabled={$noteCategoriesStore.length >= MAX_CATEGORIES}
					class="text-[12px] font-bold text-primary hover:underline disabled:opacity-40 disabled:no-underline"
				>{m.settings_notes_add_category()}</button>
			</div>
		{/if}
	</div>

	<!-- ===== DATA SECTION ===== -->
	<div class="paper-card rounded overflow-hidden">
		<button
			onclick={() => toggleSection('data')}
			class="w-full flex items-center justify-between px-2 py-1.5 hover:bg-secondary/50 transition-colors"
		>
			<h3 class="text-xs font-bold text-foreground">{m.settings_section_data()}</h3>
			<svg
				viewBox="0 0 24 24"
				class="w-3.5 h-3.5 text-muted-foreground transition-transform duration-200 {openSections.data ? 'rotate-180' : ''}"
				fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"
			>
				<polyline points="6 9 12 15 18 9" />
			</svg>
		</button>
		{#if openSections.data}
			<div class="px-2 pb-2 space-y-2 border-t border-border/50 pt-1.5">
				<!-- Data Location -->
				<div class="space-y-0.5">
					<span class="text-[12px] text-muted-foreground">{m.settings_data_storage_location()}</span>
					<input
						type="text"
						value={dataPath}
						readonly
						title={m.settings_data_storage_location_title()}
						class="w-full bg-input text-foreground border border-border rounded px-1 py-0.5 text-[12px] font-mono focus:outline-none focus:ring-1 focus:ring-primary opacity-70"
					/>
				</div>

				<!-- Statistics -->
				<div class="grid grid-cols-2 gap-1.5">
					<div class="bg-secondary rounded p-1 text-center">
						<p class="text-xs font-bold text-primary">{$settingsStore.favorites.length}</p>
						<p class="text-[12px] text-muted-foreground">{m.settings_data_favorites()}</p>
					</div>
					<div class="bg-secondary rounded p-1 text-center">
						<p class="text-xs font-bold text-primary">v{$appVersionStore}</p>
						<p class="text-[12px] text-muted-foreground">{m.settings_data_version()}</p>
					</div>
				</div>

				<!-- Danger Zone -->
				<div class="pt-1 border-t border-border/50">
					<Button variant="danger" size="sm" onclick={handleClearAllData} class="w-full">
						{m.settings_data_clear_all()}
					</Button>
				</div>
			</div>
		{/if}
	</div>

	{/if}
	</div>
