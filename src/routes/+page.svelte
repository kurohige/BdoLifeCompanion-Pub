<script lang="ts">
	import { fade } from "svelte/transition";
	import { getCurrentWindow, LogicalSize, LogicalPosition } from "@tauri-apps/api/window";
	import { listen, type UnlistenFn } from "@tauri-apps/api/event";
	import TitleBar from "$lib/components/TitleBar.svelte";
	import MiniMode from "$lib/components/MiniMode.svelte";
	import MediumMode from "$lib/components/MediumMode.svelte";
	import CraftingView from "$lib/components/CraftingView.svelte";
	import CraftingPlanner from "$lib/components/CraftingPlanner.svelte";
	import InventoryView from "$lib/components/InventoryView.svelte";
	import GrindingTracker from "$lib/components/GrindingTracker.svelte";
	import TreasureTracker from "$lib/components/TreasureTracker.svelte";
	import HuntingTracker from "$lib/components/HuntingTracker.svelte";
	import CraftingLogView from "$lib/components/CraftingLogView.svelte";
	import DashboardView from "$lib/components/DashboardView.svelte";
	import SettingsView from "$lib/components/SettingsView.svelte";
	import AnnouncementCarousel from "$lib/components/AnnouncementCarousel.svelte";
	import BossBar from "$lib/components/BossBar.svelte";
	import ToastContainer from "$lib/components/ToastContainer.svelte";
	// Tabs import removed — using side nav with direct state switching
	import { onMount, onDestroy } from "svelte";
	import { recipeRepository } from "$lib/services";
	import {
		catalogsStore,
		activeCategoryStore,
		selectedRecipeStore,
		searchTextStore,
		showOnlyFavoritesStore,
		initInventory,
		initSettings,
		settingsStore,
		loadCraftingLog,
		loadGrindingData,
		loadGrindingLog,
		loadPlannerData,
		loadTreasureData,
		loadTreasureProgress,
		loadHuntingData,
		loadHuntingLog,
		navigateToRecipeStore,
		viewModeStore,
		activeTabStore,
		clickThroughStore,
		startBossTimer,
		stopBossTimer,
		nextBossSpawn,
		cleanupGrindingTimer,
		saveWindowState,
		setViewMode,
		initAnnouncements,
		fetchAnnouncements,
		stopAnnouncementPolling,
		type ActiveTab,
		type AppTheme,
		type FontFamily,
		type FontSize,
	} from "$lib/stores";
	import { playBossAlert } from "$lib/utils/audio";

	const appWindow = getCurrentWindow();

	let loading = $state(true);
	let error = $state<string | null>(null);

	// Crafting sub-tab state (allows programmatic switching for jump-to-craft)
	let craftingSubTab = $state("cooking");
	// Grinding sub-tab state
	let grindingSubTab = $state<"tracker" | "treasures" | "hunting">("tracker");
	// Active main tab (side nav)
	let activeTab = $state("crafting");
	let jumpingToCraft = false;
	let unlistenClickThrough: UnlistenFn | null = null;

	// Boss alert tracking — prevent re-firing for the same spawn
	let lastAlertedSpawnTime: number | null = null;
	let bossAlertInitialized = false;

	// Apply theme class to HTML element
	function applyTheme(themeId: AppTheme) {
		const html = document.documentElement;
		html.classList.remove("theme-neon-cyberpunk", "theme-dark-minimal", "theme-light");
		if (themeId !== "neon-cyberpunk") {
			html.classList.add(`theme-${themeId}`);
		}
	}

	// Font family CSS stacks
	const FONT_FAMILIES: Record<FontFamily, string> = {
		system: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
		monospace: '"Consolas", "Courier New", monospace',
		serif: '"Georgia", "Times New Roman", serif',
	};

	const FONT_ZOOM: Record<FontSize, string> = {
		small: "0.92",
		default: "1",
		large: "1.08",
	};

	// Apply font settings via CSS variables
	function applyFontSettings(fontFamily: FontFamily, fontBold: boolean, fontSize: FontSize) {
		const root = document.documentElement;
		document.body.style.setProperty("--app-font-family", FONT_FAMILIES[fontFamily] ?? FONT_FAMILIES.system);
		document.body.style.setProperty("--app-font-weight", fontBold ? "bold" : "normal");
		root.style.setProperty("--app-zoom", FONT_ZOOM[fontSize] ?? "1");
	}

	// Save current window state to settings
	async function persistWindowState() {
		try {
			const size = await appWindow.outerSize();
			const pos = await appWindow.outerPosition();
			saveWindowState({
				width: size.width,
				height: size.height,
				x: pos.x,
				y: pos.y,
				view_mode: $viewModeStore,
			});
		} catch {
			// Window API may not be available during SSR
		}
	}

	onMount(async () => {
		try {
			// Load all data in parallel
			const [catalogs] = await Promise.all([
				recipeRepository.loadAll(),
				initInventory(),
				initSettings(),
				loadCraftingLog(),
				loadGrindingData(),
				loadGrindingLog(),
				loadPlannerData(),
				loadTreasureData(),
				loadTreasureProgress(),
				loadHuntingData(),
				loadHuntingLog(),
			]);

			catalogsStore.set(catalogs);

			// Apply transparency, theme, and font whenever settings change
			settingsStore.subscribe((settings) => {
				document.documentElement.style.setProperty("--app-opacity", String(settings.transparency));
				applyTheme(settings.theme ?? "neon-cyberpunk");
				applyFontSettings(
					settings.font_family ?? "system",
					settings.font_bold ?? false,
					settings.font_size ?? "default",
				);
			});

			// Restore saved window state
			const savedState = $settingsStore.window_state;
			if (savedState) {
				const mode = savedState.view_mode as "mini" | "medium" | "full";
				if (mode === "mini") {
					await appWindow.setMinSize(new LogicalSize(140, 40));
					await appWindow.setSize(new LogicalSize(400, 56));
					setViewMode("mini");
				} else if (mode === "medium") {
					await appWindow.setMinSize(new LogicalSize(140, 40));
					await appWindow.setSize(new LogicalSize(460, 150));
					setViewMode("medium");
				} else {
					// Full mode — restore saved size with min size enforced
					const w = savedState.width || 560;
					const h = Math.max(savedState.height || 680, 680);
					await appWindow.setMinSize(new LogicalSize(480, 500));
					await appWindow.setSize(new LogicalSize(w, h));
					setViewMode("full");
				}
				// Restore position if saved
				if (savedState.x != null && savedState.y != null) {
					await appWindow.setPosition(new LogicalPosition(savedState.x, savedState.y));
				}
			}

			// Start boss countdown timer
			startBossTimer();

			// Initialize announcements (loads cache, then fetches if URL set)
			initAnnouncements();

			// Listen for click-through toggle event from Rust (Ctrl+Shift+L global shortcut)
			unlistenClickThrough = await listen("toggle-click-through", async () => {
				const current = !$clickThroughStore;
				clickThroughStore.set(current);
				await appWindow.setIgnoreCursorEvents(current);
			});

			// Save window state periodically and on close
			const closeUnlisten = await appWindow.onCloseRequested(async () => {
				await persistWindowState();
			});

			loading = false;
		} catch (e) {
			error = e instanceof Error ? e.message : "Failed to load data";
			loading = false;
		}
	});

	onDestroy(() => {
		stopBossTimer();
		cleanupGrindingTimer();
		stopAnnouncementPolling();
		unlistenClickThrough?.();
	});

	// Save window state when view mode changes
	$effect(() => {
		const mode = $viewModeStore;
		// Debounce to let window resize settle before saving
		const timeout = setTimeout(() => {
			if (!loading) persistWindowState();
		}, 500);
		return () => clearTimeout(timeout);
	});


	// Boss spawn alert — play sound when remaining time crosses below threshold
	$effect(() => {
		const next = $nextBossSpawn;
		const settings = $settingsStore;
		if (!next || !settings.boss_sound_enabled || loading) return;

		const thresholdMs = settings.boss_alert_minutes * 60 * 1000;
		const spawnTime = next.spawnDate.getTime();

		// On first run, mark current spawn as alerted if already within threshold (no sound on launch)
		if (!bossAlertInitialized) {
			bossAlertInitialized = true;
			if (next.remainingMs <= thresholdMs) {
				lastAlertedSpawnTime = spawnTime;
			}
			return;
		}

		// Fire alert when we cross below the threshold for a new spawn
		if (next.remainingMs <= thresholdMs && lastAlertedSpawnTime !== spawnTime) {
			lastAlertedSpawnTime = spawnTime;
			playBossAlert();
			// Piggyback: also refresh announcements on boss alert
			fetchAnnouncements();
		}
	});

	// Handle crafting sub-tab changes (user clicks only clear recipe; jump-to-craft skips clearing)
	function handleCategoryChange(category: string) {
		if (category === "cooking" || category === "alchemy" || category === "draughts") {
			activeCategoryStore.set(category);
			if (jumpingToCraft) {
				jumpingToCraft = false;
			} else {
				selectedRecipeStore.set(null);
			}
		}
		// "planner" tab needs no category store change
	}

	// Watch for jump-to-craft navigation from CraftingPlanner
	$effect(() => {
		const nav = $navigateToRecipeStore;
		if (nav) {
			jumpingToCraft = true;
			craftingSubTab = nav.category;
			activeCategoryStore.set(nav.category);
			selectedRecipeStore.set(nav.recipe);
			searchTextStore.set(nav.recipe.name);
			showOnlyFavoritesStore.set(false);
			navigateToRecipeStore.set(null);
			// Safety: clear flag even if onValueChange doesn't fire
			requestAnimationFrame(() => {
				jumpingToCraft = false;
			});
		}
	});
</script>

{#if $clickThroughStore}
	<div class="fixed inset-0 z-50 pointer-events-none rounded click-through-border">
		<div class="absolute top-0 left-1/2 -translate-x-1/2 bg-card/90 text-accent text-[8px] font-bold px-2 py-px rounded-b border border-t-0 border-accent/40">
			Ctrl+Shift+L
		</div>
	</div>
{/if}
{#key $viewModeStore}
<div in:fade={{ duration: 150, delay: 50 }} out:fade={{ duration: 100 }}>
{#if $viewModeStore === "mini"}
	<!-- Mini Mode Widget -->
	<div class="h-screen w-screen">
		<MiniMode />
	</div>
{:else if $viewModeStore === "medium"}
	<!-- Medium Mode Widget -->
	<div class="h-screen w-screen">
		<MediumMode />
	</div>
{:else}
	<!-- Full Mode — Obsidian HUD layout -->
	<div class="flex flex-col h-screen overflow-hidden bg-surface-lowest">
		<!-- Title Bar -->
		<div class="flex-shrink-0">
			<TitleBar />
		</div>

		<!-- Boss Spawn Bar -->
		{#if !loading}
			<div class="flex-shrink-0 h-7 bg-surface-lowest/80 flex items-center px-4 gap-6 border-b border-outline-variant/10 z-40">
				<BossBar />
			</div>
		{/if}

		<!-- Body: Side Nav + Content -->
		<div class="flex flex-1 min-h-0 overflow-hidden">

			<!-- Side Navigation (w-9) -->
			{#if !loading && !error}
				<nav class="w-9 bg-surface-lowest/80 backdrop-blur-md flex flex-col items-center py-3 gap-1 z-30 flex-shrink-0">
					{#each [
						{ id: "crafting", icon: "⚒️", label: "Crafting" },
						{ id: "inventory", icon: "📦", label: "Inventory" },
						{ id: "log", icon: "📊", label: "Dashboard" },
						{ id: "timer", icon: "⚔️", label: "Grinding" },
						{ id: "settings", icon: "⚙️", label: "Settings" },
					] as tab}
						<button
							onclick={() => { activeTab = tab.id; activeTabStore.set(tab.id as ActiveTab); }}
							class="w-full h-8 flex items-center justify-center cursor-pointer transition-all duration-200
								{activeTab === tab.id
									? 'obsidian-nav-active'
									: 'obsidian-nav-item'}"
							title={tab.label}
						>
							<span class="text-[14px]">{tab.icon}</span>
						</button>
					{/each}
				</nav>
			{/if}

			<!-- Main Content Area -->
			<main class="flex-1 flex flex-col overflow-hidden min-w-0">
				<!-- Announcement bar -->
				{#if !loading}
					<div class="flex-shrink-0 px-2 pt-1">
						<AnnouncementCarousel />
					</div>
				{/if}

				<!-- Scrollable content -->
				<div class="flex-1 overflow-auto p-2" style="zoom: var(--app-zoom, 1)">
					{#if loading}
						<div class="text-center py-8">
							<p class="obsidian-timer text-sm">Loading...</p>
							<p class="text-[#b0a4b4] text-xs mt-1">Loading recipes and inventory...</p>
						</div>
					{:else if error}
						<div class="text-center py-8">
							<p class="text-destructive text-sm">Error</p>
							<p class="text-[#b0a4b4] text-xs mt-1">{error}</p>
						</div>
					{:else}
						<!-- Crafting -->
						{#if activeTab === "crafting"}
							<div class="glass-panel p-2 obsidian-accent">
								<!-- Sub-tabs: pill style (sticky) -->
								<div class="flex gap-2 mb-2 sticky top-0 z-10 bg-surface-lowest/95 backdrop-blur-sm py-1 -mx-2 px-2">
									{#each [
										{ id: "cooking", label: "🍳 Cooking" },
										{ id: "alchemy", label: "⚗️ Alchemy" },
										{ id: "draughts", label: "🧪 Draughts" },
										{ id: "planner", label: "📋 Planner" },
									] as sub}
										<button
											onclick={() => { craftingSubTab = sub.id; handleCategoryChange(sub.id); }}
											class="px-4 py-1 text-[11px] font-headline font-bold transition-colors
												{craftingSubTab === sub.id ? 'obsidian-pill-active' : 'obsidian-pill'}"
										>
											{sub.label}
										</button>
									{/each}
								</div>

								{#if craftingSubTab === "planner"}
									<CraftingPlanner />
								{:else}
									<CraftingView />
								{/if}
							</div>

						<!-- Inventory -->
						{:else if activeTab === "inventory"}
							<div class="glass-panel p-2 obsidian-accent">
								<InventoryView />
							</div>

						<!-- Dashboard -->
						{:else if activeTab === "log"}
							<div class="glass-panel p-2 obsidian-accent">
								<DashboardView />
							</div>

						<!-- Grinding -->
						{:else if activeTab === "timer"}
							<div class="glass-panel p-2 obsidian-accent">
								<!-- Sub-tabs: underline style (sticky) -->
								<div class="flex gap-4 mb-2 border-b border-outline-variant/10 sticky top-0 z-10 bg-surface-lowest/95 backdrop-blur-sm py-1 -mx-2 px-2">
									{#each [
										{ id: "tracker", label: "Tracker" },
										{ id: "treasures", label: "Treasures" },
										{ id: "hunting", label: "Hunting" },
									] as sub}
										<button
											onclick={() => grindingSubTab = sub.id as "tracker" | "treasures" | "hunting"}
											class="pb-2 px-1 text-[13px] font-headline font-medium transition-colors
												{grindingSubTab === sub.id
													? 'text-[#c77dff] font-semibold border-b-2 border-[#c77dff] shadow-[0_4px_10px_-2px_rgba(199,125,255,0.3)]'
													: 'text-[#b0a4b4] hover:text-[#cfc2d4]'}"
										>
											{sub.label}
										</button>
									{/each}
								</div>

								{#if grindingSubTab === "tracker"}
									<GrindingTracker />
								{:else if grindingSubTab === "treasures"}
									<TreasureTracker />
								{:else}
									<HuntingTracker />
								{/if}
							</div>

						<!-- Settings -->
						{:else if activeTab === "settings"}
							<div class="glass-panel p-2 obsidian-accent">
								<SettingsView />
							</div>
						{/if}
					{/if}
				</div>

				<!-- Status footer -->
				<footer class="obsidian-footer flex items-center justify-between px-3 flex-shrink-0">
					<span>BDO Life Companion v2.1</span>
				</footer>
			</main>
		</div>
	</div>
{/if}
</div>
{/key}
<ToastContainer />

<style>
	.click-through-border {
		border: 2px solid hsl(var(--accent) / 0.6);
		animation: click-through-pulse 1.5s ease-in-out infinite;
	}

	@keyframes click-through-pulse {
		0%, 100% { border-color: hsl(var(--accent) / 0.3); }
		50% { border-color: hsl(var(--accent) / 0.8); }
	}
</style>
