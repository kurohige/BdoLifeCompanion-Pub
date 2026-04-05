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
		setTheme,
		setBossSoundEnabled,
		setTimerSoundEnabled,
		setBossAlertMinutes,
		setFontFamily,
		setFontBold,
		setFontSize,
		LIFE_SKILL_RANKS,
	} from "$lib/stores/settings";
	import { clearInventory } from "$lib/stores/inventory";
	import { clearCraftingLog } from "$lib/stores/crafting-log";
	import { invoke } from "@tauri-apps/api/core";
	import { getVersion } from "@tauri-apps/api/app";
	import type { AppTheme, FontFamily, FontSize } from "$lib/services/persistence";

	const appWindow = getCurrentWindow();

	// Collapsible section state
	let openSections = $state<Record<string, boolean>>({
		display: true,
		notifications: true,
		game: true,
		data: false,
		about: false,
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
	const THEMES: { id: AppTheme; name: string; desc: string }[] = [
		{ id: "neon-cyberpunk", name: "Neon Cyberpunk", desc: "Dark with neon glows" },
		{ id: "dark-minimal", name: "Dark Minimal", desc: "Muted dark palette" },
		{ id: "light", name: "Light", desc: "Light background" },
	];

	// Font options
	const FONT_FAMILIES: { id: FontFamily; name: string }[] = [
		{ id: "system", name: "System Default" },
		{ id: "monospace", name: "Monospace" },
		{ id: "serif", name: "Serif" },
	];

	const FONT_SIZES: { id: FontSize; name: string }[] = [
		{ id: "small", name: "Small" },
		{ id: "default", name: "Default" },
		{ id: "large", name: "Large" },
	];

	function handleThemeChange(themeId: AppTheme) {
		setTheme(themeId);
		applyTheme(themeId);
	}

	function applyTheme(themeId: AppTheme) {
		const html = document.documentElement;
		html.classList.remove("theme-neon-cyberpunk", "theme-dark-minimal", "theme-light");
		if (themeId !== "neon-cyberpunk") {
			html.classList.add(`theme-${themeId}`);
		}
	}

	// Apply saved theme on mount
	$effect(() => {
		applyTheme($settingsStore.theme ?? "neon-cyberpunk");
	});

	// Clear all data
	function handleClearAllData() {
		if (confirm("Are you sure you want to clear ALL data?\n\nThis will delete:\n- All inventory items\n- All crafting log sessions\n- All favorites\n\nThis cannot be undone!")) {
			clearInventory();
			clearCraftingLog();
			settingsStore.update(s => ({ ...s, favorites: [] }));
		}
	}

	// Get data path and app version
	let dataPath = $state("Loading...");
	let appVersion = $state("...");

	$effect(() => {
		invoke<string>("get_data_path").then(path => {
			dataPath = path;
		}).catch(() => {
			dataPath = "Unknown";
		});

		getVersion().then(v => {
			appVersion = v;
		}).catch(() => {
			appVersion = "unknown";
		});
	});
</script>

<div class="space-y-1.5 max-h-[calc(100vh-150px)] overflow-auto pr-1">
	<h2 class="text-sm font-bold neon-text-cyan mb-1">Settings</h2>

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
				<!-- Transparency -->
				<div class="space-y-1">
					<div class="flex items-center justify-between">
						<span class="text-[10px] text-muted-foreground">Transparency</span>
						<span class="text-[10px] font-mono text-foreground">{transparencyPercent}%</span>
					</div>
					<input
						type="range"
						min="20"
						max="100"
						step="5"
						value={transparencyPercent}
						onchange={handleTransparencyChange}
						oninput={(e) => transparencyPercent = parseInt((e.target as HTMLInputElement).value, 10)}
						class="w-full h-1 bg-secondary rounded appearance-none cursor-pointer accent-primary"
					/>
				</div>

				<!-- Theme -->
				<div class="space-y-1">
					<span class="text-[10px] text-muted-foreground">Theme</span>
					<div class="grid grid-cols-3 gap-1">
						{#each THEMES as theme}
							<button
								onclick={() => handleThemeChange(theme.id)}
								class="flex flex-col items-center gap-0.5 px-1.5 py-1.5 rounded border transition-colors
									{($settingsStore.theme ?? 'neon-cyberpunk') === theme.id
										? 'border-primary bg-primary/10'
										: 'border-border hover:border-muted-foreground'}"
							>
								<!-- Theme preview swatch -->
								{#if theme.id === "neon-cyberpunk"}
									<div class="w-full h-4 rounded-sm bg-black border border-purple-500 flex items-center justify-center">
										<div class="w-1.5 h-1.5 rounded-full bg-[#c77dff] shadow-[0_0_4px_#c77dff]"></div>
									</div>
								{:else if theme.id === "dark-minimal"}
									<div class="w-full h-4 rounded-sm bg-[#181d27] border border-[#334155] flex items-center justify-center">
										<div class="w-1.5 h-1.5 rounded-full bg-[#6b8adb]"></div>
									</div>
								{:else}
									<div class="w-full h-4 rounded-sm bg-[#f5f5f7] border border-[#d1d5db] flex items-center justify-center">
										<div class="w-1.5 h-1.5 rounded-full bg-[#7c5cbf]"></div>
									</div>
								{/if}
								<span class="text-[9px] text-foreground font-medium leading-tight text-center">{theme.name}</span>
							</button>
						{/each}
					</div>
				</div>

				<!-- Font Family -->
				<div class="space-y-1">
					<span class="text-[10px] text-muted-foreground">Font</span>
					<select
						value={$settingsStore.font_family ?? "system"}
						onchange={(e) => setFontFamily((e.target as HTMLSelectElement).value as FontFamily)}
						class="w-full bg-input text-foreground border border-border rounded px-1 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
					>
						{#each FONT_FAMILIES as font}
							<option value={font.id}>{font.name}</option>
						{/each}
					</select>
				</div>

				<!-- Font Size -->
				<div class="space-y-1">
					<span class="text-[10px] text-muted-foreground">Font Size</span>
					<div class="grid grid-cols-3 gap-1">
						{#each FONT_SIZES as size}
							<button
								onclick={() => setFontSize(size.id)}
								class="px-1.5 py-1 rounded border text-[10px] font-medium transition-colors
									{($settingsStore.font_size ?? 'default') === size.id
										? 'border-primary bg-primary/10 text-primary'
										: 'border-border text-muted-foreground hover:border-muted-foreground'}"
							>
								{size.name}
							</button>
						{/each}
					</div>
				</div>

				<!-- Font Bold -->
				<div class="flex items-center justify-between">
					<span class="text-[10px] text-muted-foreground">Bold Text</span>
					<button
						onclick={() => setFontBold(!($settingsStore.font_bold ?? false))}
						title="Toggle bold text"
						class="relative w-8 h-4 rounded-full transition-colors {$settingsStore.font_bold ? 'bg-primary' : 'bg-secondary border border-border'}"
					>
						<div class="absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-foreground transition-transform {$settingsStore.font_bold ? 'translate-x-4' : ''}"></div>
					</button>
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
					</select>
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
						<p class="text-xs font-bold text-primary">v{appVersion}</p>
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

	<!-- ===== ABOUT SECTION ===== -->
	<div class="glass-card rounded overflow-hidden">
		<button
			onclick={() => toggleSection('about')}
			class="w-full flex items-center justify-between px-2 py-1.5 hover:bg-secondary/50 transition-colors"
		>
			<h3 class="text-xs font-bold neon-text-purple">About</h3>
			<svg
				viewBox="0 0 24 24"
				class="w-3.5 h-3.5 text-muted-foreground transition-transform duration-200 {openSections.about ? 'rotate-180' : ''}"
				fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"
			>
				<polyline points="6 9 12 15 18 9" />
			</svg>
		</button>
		{#if openSections.about}
			<div class="px-2 pb-2 border-t border-border/50 pt-1.5 space-y-2">
				<!-- App name + version -->
				<div>
					<p class="text-sm font-bold neon-text-cyan">BDO Life Companion</p>
					<p class="text-[11px] text-muted-foreground">v{appVersion}</p>
				</div>

				<div class="border-t border-border/30 pt-1.5">
					<p class="text-[9px] text-muted-foreground/60 uppercase tracking-wider">Developer</p>
					<p class="text-xs font-bold text-primary">jhidalgo_dev</p>
				</div>

				<div class="border-t border-border/30 pt-1.5">
					<p class="text-[10px] text-muted-foreground">A manual companion tool for Black Desert Online.</p>
					<p class="text-[10px] text-accent font-semibold">No automation, no OCR, no memory reading.</p>
				</div>
			</div>
		{/if}
	</div>
</div>
