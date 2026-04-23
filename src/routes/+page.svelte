<script lang="ts">
	import { fade } from "svelte/transition";
	import { getCurrentWindow, LogicalSize, PhysicalSize, PhysicalPosition } from "@tauri-apps/api/window";
	import { getCurrentWebview } from "@tauri-apps/api/webview";
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
	import BarteringView from "$lib/components/BarteringView.svelte";
	import WeeklyTasksView from "$lib/components/WeeklyTasksView.svelte";
	import AboutView from "$lib/components/AboutView.svelte";
	import CraftingLogView from "$lib/components/CraftingLogView.svelte";
	import DashboardView from "$lib/components/DashboardView.svelte";
	import SettingsView from "$lib/components/SettingsView.svelte";
	import AnnouncementCarousel from "$lib/components/AnnouncementCarousel.svelte";
	import BossBar from "$lib/components/BossBar.svelte";
	import HexBackground from "$lib/components/HexBackground.svelte";
	import ToastContainer from "$lib/components/ToastContainer.svelte";
	// Tabs import removed — using side nav with direct state switching
	import { onMount, onDestroy } from "svelte";
	import { recipeRepository } from "$lib/services";
	import {
		catalogsStore,
		activeCategoryStore,
		selectedRecipeStore,
		selectedRecipesByCategoryStore,
		searchTextStore,
		searchTextByCategoryStore,
		setActiveCategory,
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
		loadBarterData,
		loadBarterInventory,
		loadBarterLog,
		loadShipData,
		loadShipProgress,
		loadSailorRoster,
		loadWeeklyTasksData,
		loadWeeklyTasksProgress,
		initAppVersion,
		appVersionStore,
		navigateToRecipeStore,
		viewModeStore,
		activeTabStore,
		clickThroughStore,
		startBossTimer,
		stopBossTimer,
		nextBossSpawn,
		cleanupGrindingTimer,
		saveWindowState,
		flushSettings,
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
	let unlistenCloseRequested: UnlistenFn | null = null;
	let unlistenResized: UnlistenFn | null = null;
	let unlistenMoved: UnlistenFn | null = null;
	let unsubscribeSettings: (() => void) | null = null;

	// Debounce window-state captures so a drag or resize doesn't spam disk writes.
	// persistWindowState() schedules a save; the 500ms debounce inside the settings
	// store coalesces multiple captures into a single write.
	let windowStateDebounce: ReturnType<typeof setTimeout> | null = null;
	function schedulePersistWindowState() {
		if (windowStateDebounce) clearTimeout(windowStateDebounce);
		windowStateDebounce = setTimeout(() => {
			if (!loading) persistWindowState();
		}, 300);
	}

	// Boss alert tracking — prevent re-firing for the same spawn
	let lastAlertedSpawnTime: number | null = null;
	let bossAlertInitialized = false;

	import { applyTheme } from "$lib/utils/theme";

	// Font family CSS stacks
	const FONT_FAMILIES: Record<FontFamily, string> = {
		system: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
		monospace: '"Consolas", "Courier New", monospace',
		serif: '"Georgia", "Times New Roman", serif',
	};

	const FONT_ZOOM: Record<FontSize, string> = {
		xs: "0.85",
		small: "0.92",
		default: "1",
		large: "1.10",
		xl: "1.25",
		xxl: "1.45",
	};

	// Apply font settings via CSS variables + native webview zoom.
	// Bold is applied as a body class so a global CSS rule can override explicit
	// font-weights throughout the app (Tailwind classes, inline styles, etc.).
	function applyFontSettings(fontFamily: FontFamily, fontBold: boolean, fontSize: FontSize) {
		document.body.style.setProperty("--app-font-family", FONT_FAMILIES[fontFamily] ?? FONT_FAMILIES.system);
		document.body.classList.toggle("app-bold", fontBold);
		const zoom = parseFloat(FONT_ZOOM[fontSize] ?? "1");
		getCurrentWebview().setZoom(zoom).catch(() => {});
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
				loadBarterData(),
				loadBarterInventory(),
				loadBarterLog(),
				loadShipData(),
				loadShipProgress(),
				loadSailorRoster(),
				loadWeeklyTasksData(),
				loadWeeklyTasksProgress(),
				initAppVersion(),
			]);

			catalogsStore.set(catalogs);

			// Apply transparency, theme, font, and always-on-top whenever settings change.
			// All fields are normalized by initSettings before the subscription fires,
			// so no `??` fallbacks needed here.
			unsubscribeSettings = settingsStore.subscribe((settings) => {
				document.documentElement.style.setProperty("--app-opacity", String(settings.transparency));
				applyTheme(settings.theme);
				applyFontSettings(settings.font_family, settings.font_bold, settings.font_size);
				appWindow.setAlwaysOnTop(settings.always_on_top).catch((e) => {
					console.warn("Failed to set always-on-top:", e);
				});
			});

			// Restore saved window state. The whole block is wrapped in try/catch
			// so a failing setSize/setPosition (e.g. saved coords on a monitor that
			// no longer exists) can't abort app startup — we just log and continue.
			// Note: persistWindowState saves PhysicalSize/PhysicalPosition, so we
			// restore with the same units to avoid DPI scaling drift.
			const savedState = $settingsStore.window_state;
			if (savedState) {
				try {
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
						await appWindow.setSize(new PhysicalSize(w, h));
						setViewMode("full");
					}
					// Restore position if saved. Guard against off-screen coords
					// (multi-monitor disconnected) with a per-call try/catch so
					// even an invalid position doesn't strand the user.
					if (savedState.x != null && savedState.y != null) {
						try {
							await appWindow.setPosition(
								new PhysicalPosition(savedState.x, savedState.y),
							);
						} catch (err) {
							console.warn("Failed to restore window position; ignoring:", err);
						}
					}
				} catch (err) {
					console.warn("Failed to restore window size/mode; ignoring:", err);
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

			// Capture window state on every resize/move, debounced so a drag doesn't
			// spam disk writes. persistWindowState() schedules the settings save;
			// flushSettings() in the close handler writes any pending change to disk
			// before the window process exits.
			unlistenResized = await appWindow.onResized(() => {
				schedulePersistWindowState();
			});
			unlistenMoved = await appWindow.onMoved(() => {
				schedulePersistWindowState();
			});

			// On close: capture final state, then force-flush the pending debounced
			// save. Tauri waits for this handler to resolve before destroying the
			// window, so the write completes before the process dies.
			unlistenCloseRequested = await appWindow.onCloseRequested(async () => {
				if (windowStateDebounce) {
					clearTimeout(windowStateDebounce);
					windowStateDebounce = null;
				}
				await persistWindowState();
				await flushSettings();
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
		unlistenCloseRequested?.();
		unlistenResized?.();
		unlistenMoved?.();
		unsubscribeSettings?.();
		if (windowStateDebounce) clearTimeout(windowStateDebounce);
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

	// Handle crafting sub-tab changes — per-category recipe memory is handled
	// inside setActiveCategory (saves outgoing, restores incoming).
	function handleCategoryChange(category: string) {
		if (category === "cooking" || category === "alchemy" || category === "draughts") {
			if (jumpingToCraft) {
				jumpingToCraft = false;
				activeCategoryStore.set(category);
			} else {
				setActiveCategory(category);
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

	// Mirror selectedRecipeStore + searchTextStore changes into per-category memory
	// so that when the user picks a recipe or types a search, the memory stays in sync.
	$effect(() => {
		const cat = $activeCategoryStore;
		const rec = $selectedRecipeStore;
		selectedRecipesByCategoryStore.update((m) => (m[cat] === rec ? m : { ...m, [cat]: rec }));
	});
	$effect(() => {
		const cat = $activeCategoryStore;
		const search = $searchTextStore;
		searchTextByCategoryStore.update((m) => (m[cat] === search ? m : { ...m, [cat]: search }));
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
	{#if $settingsStore.animations_enabled}
		<HexBackground />
	{/if}

	<!-- Full Mode — Obsidian HUD layout -->
	<div class="flex flex-col h-screen overflow-hidden relative z-[1]">
		<!-- Title Bar -->
		<div class="flex-shrink-0">
			<TitleBar />
		</div>

		<!-- Boss Spawn Bar -->
		{#if !loading}
			<div class="flex-shrink-0 z-40">
				<BossBar />
			</div>
		{/if}

		<!-- Body: Side Nav + Content -->
		<div class="flex flex-1 min-h-0 overflow-hidden">

			<!-- Side Navigation (w-9) -->
			{#if !loading && !error}
				<nav class="w-9 backdrop-blur-md flex flex-col items-center py-3 gap-3 z-30 flex-shrink-0" style="background: rgba(14, 14, 14, 0.3);">
					{#each [
						{ id: "crafting", label: "Crafting", img: "/icons/crafting.png" },
						{ id: "timer", label: "Grinding", img: "/icons/grinding.png" },
						{ id: "bartering", label: "Bartering", img: "/icons/bartering.png" },
						{ id: "inventory", label: "Inventory", img: "/icons/inventory.png" },
						{ id: "weekly", label: "Weekly", img: "/icons/weekly.png" },
						{ id: "log", label: "Dashboard", img: "/icons/dashboard.png" },
						{ id: "settings", label: "Settings", img: "/icons/settings.png" },
						{ id: "about", label: "About", img: "/icons/about.png", glow: "neon" },
					] as tab}
						<button
							onclick={() => { activeTab = tab.id; activeTabStore.set(tab.id as ActiveTab); }}
							class="nav-glow-btn {activeTab === tab.id ? 'nav-glow-active' : ''} {tab.glow === 'neon' && activeTab !== tab.id ? 'nav-neon-pulse' : ''}"
							title={tab.label}
						>
							<img src={tab.img} alt={tab.label} class="nav-glow-icon" />
						</button>
					{/each}
				</nav>
			{/if}

			<!-- Main Content Area -->
			<main class="flex-1 flex flex-col overflow-hidden min-w-0">
				<!-- Announcement ticker (compact marquee) -->
				{#if !loading}
					<div class="flex-shrink-0 px-2 pt-1">
						<AnnouncementCarousel compact />
					</div>
				{/if}

				<!-- Scrollable content -->
				<div class="flex-1 overflow-auto p-2 flex flex-col min-h-0">
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
							<div class="glass-panel p-2 obsidian-accent {craftingSubTab === 'planner' ? 'flex-1 flex flex-col min-h-0' : ''}">
								<!-- Sub-tabs: pill style (sticky) -->
								<div class="flex gap-2 mb-2 sticky top-0 z-10 backdrop-blur-sm py-1 -mx-2 px-2 items-center justify-center flex-shrink-0">
									{#each [
										{ id: "cooking", label: "", icon: "/icons/cooking.webp" },
										{ id: "alchemy", label: "", icon: "/icons/alchemy.webp" },
										{ id: "draughts", label: "", icon: "/icons/draught.webp" },
										{ id: "planner", label: "", icon: "/icons/planner.webp" },
									] as sub}
										<button
											onclick={() => { craftingSubTab = sub.id; handleCategoryChange(sub.id); }}
											class="craft-glow-btn {craftingSubTab === sub.id ? 'craft-glow-active' : ''}"
											title={sub.id}
										>
											<img src={sub.icon} alt={sub.id} class="w-7 h-7 relative z-[1]" />
										</button>
									{/each}
								</div>

								{#if craftingSubTab === "planner"}
									<div class="flex-1 flex flex-col min-h-0">
										<CraftingPlanner />
									</div>
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
								<div class="flex gap-4 mb-2 border-b border-outline-variant/10 sticky top-0 z-10 backdrop-blur-sm py-1 -mx-2 px-2">
									{#each [
										{ id: "tracker", label: "Tracker" },
										{ id: "treasures", label: "Treasures" },
										{ id: "hunting", label: "Hunting" },
									] as sub}
										<button
											onclick={() => grindingSubTab = sub.id as "tracker" | "treasures" | "hunting"}
											class="pb-2 px-1 text-[13px] font-headline font-medium transition-colors
												{grindingSubTab === sub.id
													? 'obsidian-pill-active'
													: 'obsidian-pill'}"
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

						<!-- Bartering -->
						{:else if activeTab === "bartering"}
							<div class="glass-panel p-2 obsidian-accent">
								<BarteringView />
							</div>

						<!-- Weekly Tasks -->
						{:else if activeTab === "weekly"}
							<div class="glass-panel p-2 obsidian-accent">
								<WeeklyTasksView />
							</div>

						<!-- Settings -->
						{:else if activeTab === "settings"}
							<div class="glass-panel p-2 obsidian-accent">
								<SettingsView />
							</div>

						<!-- About -->
						{:else if activeTab === "about"}
							<div class="glass-panel p-2 obsidian-accent">
								<AboutView />
							</div>
						{/if}
					{/if}
				</div>

				<!-- Status footer -->
				<footer class="obsidian-footer flex items-center justify-between px-3 flex-shrink-0">
					<span>BDO Life Companion v{$appVersionStore}</span>
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
