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
		setAnimationsEnabled,
		setMiniShowClocks,
		setClockFormat24h,
		LIFE_SKILL_RANKS,
	} from "$lib/stores/settings";
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

	// Theme options
	const THEMES: { id: AppTheme; name: string }[] = [
		{ id: "obsidian", name: "Obsidian Dark" },
		{ id: "light", name: "Light" },
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
		applyTheme(themeId);
	}

	// Apply saved theme on mount
	$effect(() => {
		applyTheme($settingsStore.theme ?? "obsidian");
	});

	// Clear all data
	async function handleClearAllData() {
		if (!confirm("Are you sure you want to clear ALL data?\n\nThis will delete:\n- Inventory\n- Crafting, Grinding, Hunting logs\n- Barter inventory, log, ship progress, sailors\n- Treasure progress, Weekly tasks\n- Planner, Favorites\n- Sample/seeded data\n\nSettings will be kept. This cannot be undone!")) return;

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
	<h2 class="text-sm font-bold neon-text-cyan mb-1">Settings</h2>

	<!-- Top tabs: General / Bosses -->
	<div class="flex gap-1 border-b border-outline-variant/30 mb-2">
		{#each [
			{ id: "general" as const, label: "General" },
			{ id: "bosses" as const, label: "Bosses" },
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
			<h3 class="text-xs font-bold neon-text-purple">Display</h3>
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
						<span class="text-[10px] text-muted-foreground">Opacity</span>
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
					<span class="text-[10px] text-muted-foreground">Theme</span>
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
								<span class="text-[11px] text-foreground font-semibold">{theme.name}</span>
							</button>
						{/each}
					</div>
				</div>

				<!-- Font Size -->
				<div class="space-y-1.5">
					<span class="text-[10px] text-muted-foreground">Font Size</span>
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
					<span class="text-[10px] text-muted-foreground">Bold Text</span>
					<ToggleSwitch
						checked={$settingsStore.font_bold}
						onchange={setFontBold}
						title="Toggle bold text"
					/>
				</div>

				<!-- Always on Top -->
				<div class="flex items-center justify-between">
					<span class="text-[10px] text-muted-foreground">Always on Top</span>
					<ToggleSwitch
						checked={$settingsStore.always_on_top}
						onchange={setAlwaysOnTop}
						title="Keep window above all other windows"
					/>
				</div>

				<!-- Background Animation -->
				<div class="flex items-center justify-between">
					<div class="min-w-0">
						<span class="text-[10px] text-muted-foreground">Background Animation</span>
						<p class="text-[9px] text-muted-foreground/70">Disable to save CPU on weaker hardware.</p>
					</div>
					<ToggleSwitch
						checked={$settingsStore.animations_enabled}
						onchange={setAnimationsEnabled}
						title="Toggle the animated hex particle background"
					/>
				</div>

				<!-- Mini Mode Clocks -->
				<div class="flex items-center justify-between">
					<div class="min-w-0">
						<span class="text-[10px] text-muted-foreground">Mini Mode Clocks</span>
						<p class="text-[9px] text-muted-foreground/70">Show local + server (UTC) time in the mini bar.</p>
					</div>
					<ToggleSwitch
						checked={$settingsStore.mini_show_clocks ?? true}
						onchange={setMiniShowClocks}
						title="Toggle the local + server clock cluster in mini mode"
					/>
				</div>

				<!-- Clock Format -->
				{#if ($settingsStore.mini_show_clocks ?? true)}
					<div class="space-y-1.5">
						<span class="text-[10px] text-muted-foreground">Clock Format</span>
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
			</div>
		{/if}
	</div>

	<!-- ===== NOTIFICATIONS SECTION ===== -->
	<div class="glass-card rounded overflow-hidden">
		<button
			onclick={() => toggleSection('notifications')}
			class="w-full flex items-center justify-between px-2 py-1.5 hover:bg-secondary/50 transition-colors"
		>
			<h3 class="text-xs font-bold neon-text-purple">Notifications</h3>
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
						<span class="text-[10px] text-muted-foreground">Boss Spawn Alert</span>
						<button
							onclick={() => setBossSoundEnabled(!$settingsStore.boss_sound_enabled)}
							title="Toggle boss spawn alert sound"
							class="relative w-8 h-4 rounded-full transition-colors {$settingsStore.boss_sound_enabled ? 'bg-primary' : 'bg-secondary border border-border'}"
						>
							<div class="absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-foreground transition-transform {$settingsStore.boss_sound_enabled ? 'translate-x-4' : ''}"></div>
						</button>
					</div>
					{#if $settingsStore.boss_sound_enabled}
						<div class="flex items-center gap-1.5">
							<span class="text-[9px] text-muted-foreground/70">Alert</span>
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
							<span class="text-[9px] text-muted-foreground/70">min before spawn</span>
						</div>
					{/if}
				</div>

				<!-- Timer Completion Sound -->
				<div class="flex items-center justify-between">
					<span class="text-[10px] text-muted-foreground">Timer Completion Sound</span>
					<button
						onclick={() => setTimerSoundEnabled(!$settingsStore.timer_sound_enabled)}
						title="Toggle timer completion sound"
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
			<h3 class="text-xs font-bold neon-text-purple">Game</h3>
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
					<span class="text-[10px] text-muted-foreground">Server Region</span>
					<select
						value={$settingsStore.server_region}
						onchange={(e) => setServerRegion((e.target as HTMLSelectElement).value)}
						class="w-full bg-input text-foreground border border-border rounded px-1 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
					>
						<option value="NA">NA (North America)</option>
						<option value="EU">EU (Europe)</option>
						<option value="SEA">SEA (Southeast Asia)</option>
						<option value="SA">SA (South America)</option>
					</select>
					<span class="text-[9px] text-muted-foreground/60">Boss schedule, war times</span>
				</div>

				<!-- Market Region -->
				<div class="space-y-0.5">
					<span class="text-[10px] text-muted-foreground">Market Region</span>
					<select
						value={$settingsStore.market_region}
						onchange={(e) => setMarketRegion((e.target as HTMLSelectElement).value)}
						class="w-full bg-input text-foreground border border-border rounded px-1 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
					>
						<option value="NA">NA (North America)</option>
						<option value="EU">EU (Europe)</option>
						<option value="SEA">SEA (Southeast Asia)</option>
					</select>
					<span class="text-[9px] text-muted-foreground/60">Central Market price source</span>
				</div>

				<!-- Life Skill Ranks -->
				<div class="space-y-1">
					<span class="text-[10px] text-muted-foreground">Life Skill Ranks</span>
					<div class="grid grid-cols-2 gap-2">
						<!-- Cooking -->
						<div class="space-y-0.5">
							<label for="cooking-rank" class="text-[9px] text-muted-foreground/70">Cooking Rank</label>
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
								placeholder="Mastery 0-3000"
								class="w-full bg-input text-foreground border border-border rounded px-1 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary no-spinner"
							/>
						</div>
						<!-- Alchemy -->
						<div class="space-y-0.5">
							<label for="alchemy-rank" class="text-[9px] text-muted-foreground/70">Alchemy Rank</label>
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
								placeholder="Mastery 0-3000"
								class="w-full bg-input text-foreground border border-border rounded px-1 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary no-spinner"
							/>
						</div>
					</div>
				</div>

				<!-- Bartering -->
				<div class="space-y-1">
					<span class="text-[10px] text-muted-foreground">Bartering</span>
					<div class="grid grid-cols-2 gap-2">
						<div class="space-y-0.5">
							<label for="barter-rank" class="text-[9px] text-muted-foreground/70">Barter Level</label>
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
								Value Pack Active
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
			<h3 class="text-xs font-bold neon-text-purple">Data</h3>
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
					<span class="text-[10px] text-muted-foreground">Storage Location</span>
					<input
						type="text"
						value={dataPath}
						readonly
						title="Data storage location"
						class="w-full bg-input text-foreground border border-border rounded px-1 py-0.5 text-[10px] font-mono focus:outline-none opacity-70"
					/>
				</div>

				<!-- Statistics -->
				<div class="grid grid-cols-2 gap-1.5">
					<div class="bg-secondary rounded p-1 text-center">
						<p class="text-xs font-bold text-primary">{$settingsStore.favorites.length}</p>
						<p class="text-[9px] text-muted-foreground">Favorites</p>
					</div>
					<div class="bg-secondary rounded p-1 text-center">
						<p class="text-xs font-bold text-primary">v{$appVersionStore}</p>
						<p class="text-[9px] text-muted-foreground">Version</p>
					</div>
				</div>

				<!-- Danger Zone -->
				<div class="pt-1 border-t border-border/50">
					<button
						onclick={handleClearAllData}
						class="w-full py-1 text-[10px] bg-destructive text-destructive-foreground font-bold rounded hover:opacity-80 transition-opacity"
					>
						Clear All Data
					</button>
				</div>
			</div>
		{/if}
	</div>

	{/if}
	</div>
