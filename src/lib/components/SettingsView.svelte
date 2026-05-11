<script lang="ts">
	import { getCurrentWindow } from "@tauri-apps/api/window";
	import {
		settingsStore,
		setTransparency,
		setCookingMastery,
		setAlchemyMastery,
		setCookingTotalMastery,
		setAlchemyTotalMastery,
		setServerRegion,
		setMarketRegion,
		setTheme,
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
		setThemeOverride,
		resetThemeOverrides,
		LIFE_SKILL_RANKS,
	} from "$lib/stores/settings";
	import { m } from "$lib/paraglide/messages";
	import type { Locale } from "$lib/services/persistence";
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
	import BossSettingsPanel from "./BossSettingsPanel.svelte";
	import ToggleSwitch from "./ui/ToggleSwitch.svelte";
	import type { AppTheme, FontSize } from "$lib/services/persistence";

	const appWindow = getCurrentWindow();

	// Collapsible section state
	let openSections = $state<Record<string, boolean>>({
		display: true,
		notifications: true,
		game: true,
		data: false,
	});

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

	// Theme options — names resolved via m.* at render time so they re-translate
	// when the locale changes
	const THEMES: { id: AppTheme; name: () => string }[] = [
		{ id: "obsidian", name: () => m.settings_theme_obsidian() },
		{ id: "light", name: () => m.settings_theme_light() },
	];

	const FONT_SIZES: { id: FontSize; name: string }[] = [
		{ id: "xs", name: "XS" },
		{ id: "small", name: "S" },
		{ id: "default", name: "M" },
		{ id: "large", name: "L" },
		{ id: "xl", name: "XL" },
		{ id: "xxl", name: "XXL" },
	];

	import { applyTheme } from "$lib/utils/theme";

	function handleThemeChange(themeId: AppTheme) {
		setTheme(themeId);
		applyTheme(themeId, $settingsStore.theme_overrides?.[themeId]);
	}

	// Apply saved theme on mount and on any override change for live preview.
	$effect(() => {
		const t = $settingsStore.theme ?? "obsidian";
		applyTheme(t, $settingsStore.theme_overrides?.[t]);
	});

	// Theme customization — derived defaults per theme. Picker values fall back
	// to these when the corresponding override slot is unset. Kept in lockstep
	// with the `:root` / `.theme-light` definitions in app.css so the swatches
	// match what would actually render.
	const THEME_DEFAULTS = {
		obsidian: { primary: "#c77dff", accent: "#00e3fd", gold: "#ffee10" },
		light:    { primary: "#6b46a0", accent: "#2ba076", gold: "#e6c700" },
	} as const;

	// Shared preset palette used by every color picker. Six tactically chosen
	// hues that read well as both glow and solid fills.
	const COLOR_PRESETS = [
		"#c77dff", "#00e3fd", "#ffee10",
		"#00ff9d", "#ff6b35", "#ff9eb4",
	];

	let activeTheme = $derived<AppTheme>($settingsStore.theme ?? "obsidian");
	let overrides = $derived($settingsStore.theme_overrides?.[activeTheme] ?? {});

	function colorFor(slot: "primary" | "accent" | "gold"): string {
		return overrides[slot] ?? THEME_DEFAULTS[activeTheme][slot];
	}

	function glowIntensityFor(): number {
		// Light theme baseline is 0 (no glow); Obsidian is 1. Override beats both.
		const stored = overrides.glow_intensity;
		if (typeof stored === "number" && !Number.isNaN(stored)) return stored;
		return activeTheme === "light" ? 0 : 1;
	}

	function isCustomized(slot: "primary" | "accent" | "gold"): boolean {
		return typeof overrides[slot] === "string";
	}

	function isGlowCustomized(): boolean {
		return typeof overrides.glow_intensity === "number";
	}

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
	<h2 class="text-sm font-bold neon-text-cyan mb-1">{m.settings_title()}</h2>

	<!-- Top tabs: General / Bosses -->
	<div class="flex gap-1 border-b border-outline-variant/30 mb-2">
		{#each [
			{ id: "general" as const, label: m.settings_tab_general() },
			{ id: "bosses" as const, label: m.settings_tab_bosses() },
		] as tab}
			<button
				onclick={() => settingsTabStore.set(tab.id)}
				class="px-3 py-1.5 text-[11px] font-bold transition-colors relative
					{$settingsTabStore === tab.id
						? 'text-[var(--gold-glow)]'
						: 'text-muted-foreground hover:text-foreground'}"
			>
				{tab.label}
				{#if $settingsTabStore === tab.id}
					<div class="absolute bottom-[-1px] left-0 right-0 h-0.5 bg-[var(--gold-glow)]"></div>
				{/if}
			</button>
		{/each}
	</div>

	{#if $settingsTabStore === "bosses"}
		<BossSettingsPanel />
	{:else}
	<!-- ===== DISPLAY SECTION ===== -->
	<div class="glass-card rounded overflow-hidden">
		<button
			onclick={() => toggleSection('display')}
			class="w-full flex items-center justify-between px-2 py-1.5 hover:bg-secondary/50 transition-colors"
		>
			<h3 class="text-xs font-bold neon-text-purple">{m.settings_section_display()}</h3>
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
						<span class="text-[10px] text-muted-foreground">{m.settings_display_opacity()}</span>
						<span class="text-[11px] font-mono font-bold text-foreground">{transparencyPercent}%</span>
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

				<!-- Theme -->
				<div class="space-y-1.5">
					<span class="text-[10px] text-muted-foreground">{m.settings_display_theme()}</span>
					<div class="grid grid-cols-2 gap-1.5">
						{#each THEMES as theme}
							<button
								onclick={() => handleThemeChange(theme.id)}
								class="flex items-center gap-2 px-3 py-2 rounded border-2 transition-all
									{($settingsStore.theme ?? 'obsidian') === theme.id
										? 'border-[var(--gold-glow)] bg-[rgba(255,238,16,0.08)] shadow-[0_0_8px_rgba(255,238,16,0.15)]'
										: 'border-outline-variant/30 hover:border-outline-variant/60'}"
							>
								{#if theme.id === "obsidian"}
									<div class="w-6 h-5 bg-[#0e0e0e] border border-[#4d4352] flex items-center justify-center gap-0.5 rounded-sm">
										<div class="w-1.5 h-1.5 bg-[#c77dff]"></div>
										<div class="w-1.5 h-1.5 bg-[#00e3fd]"></div>
									</div>
								{:else}
									<div class="w-6 h-5 bg-[#ebedf0] border border-[#b0b7c2] flex items-center justify-center rounded-sm">
										<div class="w-2 h-2 rounded-full bg-[#6b46a0]"></div>
									</div>
								{/if}
								<span class="text-[11px] text-foreground font-semibold">{theme.name()}</span>
							</button>
						{/each}
					</div>
				</div>

				<!-- Theme Customization -->
				<div class="space-y-1.5 pt-1 border-t border-border/40">
					<div class="flex items-center justify-between">
						<span class="text-[10px] text-muted-foreground">{m.settings_theme_customize()}</span>
						<button
							onclick={() => resetThemeOverrides(activeTheme)}
							title={m.settings_theme_reset_all_title()}
							class="text-[9px] text-muted-foreground hover:text-foreground transition-colors uppercase tracking-wider"
						>
							{m.settings_theme_reset_all()}
						</button>
					</div>

					{#each [
						{ slot: "primary" as const, label: m.settings_theme_color_primary() },
						{ slot: "accent" as const,  label: m.settings_theme_color_accent() },
						{ slot: "gold" as const,    label: m.settings_theme_color_gold() },
					] as row (row.slot)}
						{@const current = colorFor(row.slot)}
						{@const customized = isCustomized(row.slot)}
						<div class="space-y-1">
							<div class="flex items-center justify-between gap-2">
								<span class="text-[10px] text-muted-foreground flex items-center gap-1.5">
									<span class="w-3 h-3 rounded-sm border border-outline-variant/40" style="background: {current}"></span>
									{row.label}
								</span>
								<div class="flex items-center gap-1.5">
									<input
										type="color"
										value={current}
										oninput={(e) => setThemeOverride(activeTheme, row.slot, (e.target as HTMLInputElement).value)}
										class="w-6 h-5 bg-transparent border border-outline-variant/40 rounded cursor-pointer p-0"
									/>
									{#if customized}
										<button
											onclick={() => setThemeOverride(activeTheme, row.slot, undefined)}
											title={m.settings_theme_reset_slot_title()}
											class="text-[10px] text-muted-foreground hover:text-foreground w-4 h-4 flex items-center justify-center"
										>×</button>
									{:else}
										<span class="w-4 h-4"></span>
									{/if}
								</div>
							</div>
							<div class="flex gap-1">
								{#each COLOR_PRESETS as preset (preset)}
									{@const active = current.toLowerCase() === preset.toLowerCase()}
									<button
										onclick={() => setThemeOverride(activeTheme, row.slot, preset)}
										title={preset}
										class="w-4 h-4 rounded-sm border transition-all
											{active
												? 'border-[var(--gold-glow)] shadow-[0_0_4px_rgb(var(--gold-glow-rgb)_/_0.5)]'
												: 'border-outline-variant/30 hover:border-outline-variant/70'}"
										style="background: {preset}"
									></button>
								{/each}
							</div>
						</div>
					{/each}

					<!-- Glow intensity -->
					<div class="space-y-1">
						<div class="flex items-center justify-between">
							<span class="text-[10px] text-muted-foreground">{m.settings_theme_glow_intensity()}</span>
							<div class="flex items-center gap-1.5">
								<span class="text-[10px] font-mono font-bold text-foreground">{Math.round(glowIntensityFor() * 100)}%</span>
								{#if isGlowCustomized()}
									<button
										onclick={() => setThemeOverride(activeTheme, "glow_intensity", undefined)}
										title={m.settings_theme_reset_slot_title()}
										class="text-[10px] text-muted-foreground hover:text-foreground w-4 h-4 flex items-center justify-center"
									>×</button>
								{:else}
									<span class="w-4 h-4"></span>
								{/if}
							</div>
						</div>
						<input
							type="range"
							min="0"
							max="200"
							step="10"
							value={Math.round(glowIntensityFor() * 100)}
							oninput={(e) => setThemeOverride(activeTheme, "glow_intensity", parseInt((e.target as HTMLInputElement).value, 10) / 100)}
							class="settings-slider"
						/>
					</div>
				</div>

				<!-- Font Size -->
				<div class="space-y-1.5">
					<span class="text-[10px] text-muted-foreground">{m.settings_display_font_size()}</span>
					<div class="grid grid-cols-6 gap-1.5">
						{#each FONT_SIZES as size}
							{@const isActive = ($settingsStore.font_size ?? 'default') === size.id}
							<button
								onclick={() => setFontSize(size.id)}
								class="px-1.5 py-1.5 rounded border-2 text-[10px] font-bold transition-all
									{isActive
										? 'border-[var(--gold-glow)] bg-[var(--gold-glow)] text-black shadow-[0_0_8px_rgba(255,238,16,0.4)]'
										: 'border-outline-variant/30 text-muted-foreground hover:border-outline-variant/60 hover:text-foreground'}"
							>
								{size.name}
							</button>
						{/each}
					</div>
				</div>

				<!-- Font Bold -->
				<div class="flex items-center justify-between">
					<span class="text-[10px] text-muted-foreground">{m.settings_display_bold_text()}</span>
					<ToggleSwitch
						checked={$settingsStore.font_bold}
						onchange={setFontBold}
						title={m.settings_display_bold_title()}
					/>
				</div>

				<!-- Always on Top -->
				<div class="flex items-center justify-between">
					<span class="text-[10px] text-muted-foreground">{m.settings_display_always_on_top()}</span>
					<ToggleSwitch
						checked={$settingsStore.always_on_top}
						onchange={setAlwaysOnTop}
						title={m.settings_display_always_on_top_title()}
					/>
				</div>

				<!-- Mini Mode Clocks -->
				<div class="flex items-center justify-between">
					<div class="min-w-0">
						<span class="text-[10px] text-muted-foreground">{m.settings_display_mini_clocks()}</span>
						<p class="text-[9px] text-muted-foreground/70">{m.settings_display_mini_clocks_subtitle()}</p>
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
						<span class="text-[10px] text-muted-foreground">{m.settings_display_clock_format()}</span>
						<div class="grid grid-cols-2 gap-1.5">
							{#each [
								{ id: true, label: "24h", sample: "20:14" },
								{ id: false, label: "12h", sample: "8:14 PM" },
							] as opt}
								{@const isActive = ($settingsStore.clock_format_24h ?? true) === opt.id}
								<button
									onclick={() => setClockFormat24h(opt.id)}
									class="px-2 py-1.5 rounded border-2 text-[11px] font-bold transition-all flex items-center justify-center gap-2
										{isActive
											? 'border-[var(--gold-glow)] bg-[var(--gold-glow)] text-black shadow-[0_0_8px_rgba(255,238,16,0.4)]'
											: 'border-outline-variant/30 text-muted-foreground hover:border-outline-variant/60 hover:text-foreground'}"
								>
									<span>{opt.label}</span>
									<span class="text-[9px] font-mono opacity-70">{opt.sample}</span>
								</button>
							{/each}
						</div>
					</div>
				{/if}

				<!-- Language -->
				<div class="space-y-1.5">
					<span class="text-[10px] text-muted-foreground">{m.settings_language_label()}</span>
					<div class="grid grid-cols-2 gap-1.5">
						{#each [
							{ id: "en" as Locale, label: m.settings_language_english() },
							{ id: "es" as Locale, label: m.settings_language_spanish() },
						] as opt (opt.id)}
							{@const isActive = ($settingsStore.locale ?? "en") === opt.id}
							<button
								onclick={() => setLocale(opt.id)}
								class="px-2 py-1.5 rounded border-2 text-[11px] font-bold transition-all
									{isActive
										? 'border-[var(--gold-glow)] bg-[var(--gold-glow)] text-black shadow-[0_0_8px_rgba(255,238,16,0.4)]'
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

	<!-- ===== NOTIFICATIONS SECTION ===== -->
	<div class="glass-card rounded overflow-hidden">
		<button
			onclick={() => toggleSection('notifications')}
			class="w-full flex items-center justify-between px-2 py-1.5 hover:bg-secondary/50 transition-colors"
		>
			<h3 class="text-xs font-bold neon-text-purple">{m.settings_section_notifications()}</h3>
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
						<span class="text-[10px] text-muted-foreground">{m.settings_notifications_boss_alert()}</span>
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
							<span class="text-[9px] text-muted-foreground/70">{m.settings_notifications_alert()}</span>
							<input
								type="text"
								inputmode="numeric"
								pattern="[0-9]*"
								value={$settingsStore.boss_alert_minutes}
								oninput={(e) => {
									const val = parseInt(e.currentTarget.value, 10);
									if (!isNaN(val) && val >= 1 && val <= 30) setBossAlertMinutes(val);
								}}
								class="w-10 bg-input text-foreground border border-border rounded px-1 py-0.5 text-[10px] text-center focus:outline-none focus:ring-1 focus:ring-primary no-spinner"
							/>
							<span class="text-[9px] text-muted-foreground/70">{m.settings_notifications_min_before()}</span>
						</div>
					{/if}
				</div>

				<!-- Timer Completion Sound -->
				<div class="flex items-center justify-between">
					<span class="text-[10px] text-muted-foreground">{m.settings_notifications_timer_sound()}</span>
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
	<div class="glass-card rounded overflow-hidden">
		<button
			onclick={() => toggleSection('game')}
			class="w-full flex items-center justify-between px-2 py-1.5 hover:bg-secondary/50 transition-colors"
		>
			<h3 class="text-xs font-bold neon-text-purple">{m.settings_section_game()}</h3>
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
					<span class="text-[10px] text-muted-foreground">{m.settings_game_server_region()}</span>
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
					<span class="text-[9px] text-muted-foreground/60">{m.settings_game_server_region_subtitle()}</span>
				</div>

				<!-- Market Region -->
				<div class="space-y-0.5">
					<span class="text-[10px] text-muted-foreground">{m.settings_game_market_region()}</span>
					<select
						value={$settingsStore.market_region}
						onchange={(e) => setMarketRegion((e.target as HTMLSelectElement).value)}
						class="w-full bg-input text-foreground border border-border rounded px-1 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
					>
						<option value="NA">{m.settings_game_region_na()}</option>
						<option value="EU">{m.settings_game_region_eu()}</option>
						<option value="SEA">{m.settings_game_region_sea()}</option>
					</select>
					<span class="text-[9px] text-muted-foreground/60">{m.settings_game_market_region_subtitle()}</span>
				</div>

				<!-- Life Skill Ranks -->
				<div class="space-y-1">
					<span class="text-[10px] text-muted-foreground">{m.settings_game_life_skills()}</span>
					<div class="grid grid-cols-2 gap-2">
						<!-- Cooking -->
						<div class="space-y-0.5">
							<label for="cooking-rank" class="text-[9px] text-muted-foreground/70">{m.settings_game_cooking_rank()}</label>
							<select
								id="cooking-rank"
								value={$settingsStore.cooking_mastery}
								onchange={(e) => setCookingMastery((e.target as HTMLSelectElement).value)}
								class="w-full bg-input text-foreground border border-border rounded px-1 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
							>
								{#each LIFE_SKILL_RANKS as rank}
									<option value={rank}>{rank}</option>
								{/each}
							</select>
							<input
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
							<label for="alchemy-rank" class="text-[9px] text-muted-foreground/70">{m.settings_game_alchemy_rank()}</label>
							<select
								id="alchemy-rank"
								value={$settingsStore.alchemy_mastery}
								onchange={(e) => setAlchemyMastery((e.target as HTMLSelectElement).value)}
								class="w-full bg-input text-foreground border border-border rounded px-1 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
							>
								{#each LIFE_SKILL_RANKS as rank}
									<option value={rank}>{rank}</option>
								{/each}
							</select>
							<input
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
					<span class="text-[10px] text-muted-foreground">{m.settings_game_bartering()}</span>
					<div class="grid grid-cols-2 gap-2">
						<div class="space-y-0.5">
							<label for="barter-rank" class="text-[9px] text-muted-foreground/70">{m.settings_game_barter_level()}</label>
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
							<label class="flex items-center gap-1.5 text-[9px] text-muted-foreground/70 cursor-pointer py-1">
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

	<!-- ===== DATA SECTION ===== -->
	<div class="glass-card rounded overflow-hidden">
		<button
			onclick={() => toggleSection('data')}
			class="w-full flex items-center justify-between px-2 py-1.5 hover:bg-secondary/50 transition-colors"
		>
			<h3 class="text-xs font-bold neon-text-purple">{m.settings_section_data()}</h3>
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
					<span class="text-[10px] text-muted-foreground">{m.settings_data_storage_location()}</span>
					<input
						type="text"
						value={dataPath}
						readonly
						title={m.settings_data_storage_location_title()}
						class="w-full bg-input text-foreground border border-border rounded px-1 py-0.5 text-[10px] font-mono focus:outline-none opacity-70"
					/>
				</div>

				<!-- Statistics -->
				<div class="grid grid-cols-2 gap-1.5">
					<div class="bg-secondary rounded p-1 text-center">
						<p class="text-xs font-bold text-primary">{$settingsStore.favorites.length}</p>
						<p class="text-[9px] text-muted-foreground">{m.settings_data_favorites()}</p>
					</div>
					<div class="bg-secondary rounded p-1 text-center">
						<p class="text-xs font-bold text-primary">v{$appVersionStore}</p>
						<p class="text-[9px] text-muted-foreground">{m.settings_data_version()}</p>
					</div>
				</div>

				<!-- Danger Zone -->
				<div class="pt-1 border-t border-border/50">
					<button
						onclick={handleClearAllData}
						class="w-full py-1 text-[10px] bg-destructive text-destructive-foreground font-bold rounded hover:opacity-80 transition-opacity"
					>
						{m.settings_data_clear_all()}
					</button>
				</div>
			</div>
		{/if}
	</div>

	{/if}
	</div>
