<script lang="ts">
	import { fade } from "svelte/transition";
	import { getCurrentWindow, LogicalSize, PhysicalSize, PhysicalPosition } from "@tauri-apps/api/window";
	import { getCurrentWebview } from "@tauri-apps/api/webview";
	import { listen, type UnlistenFn } from "@tauri-apps/api/event";
	import TitleBar from "$lib/components/TitleBar.svelte";
	import MiniMode from "$lib/components/MiniMode.svelte";
	import MediumMode from "$lib/components/MediumMode.svelte";
	import CraftingScreen from "$lib/components/CraftingScreen.svelte";
	import InventoryView from "$lib/components/InventoryView.svelte";
	import GrindingTracker from "$lib/components/GrindingTracker.svelte";
	import TreasureTracker from "$lib/components/TreasureTracker.svelte";
	import HuntingTracker from "$lib/components/HuntingTracker.svelte";
	import LootView from "$lib/components/LootView.svelte";
	import BarteringView from "$lib/components/BarteringView.svelte";
	import WeeklyTasksView from "$lib/components/WeeklyTasksView.svelte";
	import AboutView from "$lib/components/AboutView.svelte";
	import CraftingLogView from "$lib/components/CraftingLogView.svelte";
	import DashboardView from "$lib/components/DashboardView.svelte";
	import SettingsView from "$lib/components/SettingsView.svelte";
	import StatusStrip from "$lib/components/StatusStrip.svelte";
	import Scratchpad from "$lib/components/Scratchpad.svelte";
	import ToastContainer from "$lib/components/ToastContainer.svelte";
	import SubTabs from "$lib/components/ui/SubTabs.svelte";
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
		loadIslandsData,
		loadBarterMapLayout,
		loadCurrentRoute,
		loadRouteLogs,
		loadShipData,
		loadShipProgress,
		loadSailorRoster,
		loadWeeklyTasksData,
		loadWeeklyTasksProgress,
		loadNotesData,
		initNotesSync,
		flushNotes,
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
		setReminderFireCallback,
		startReminderTick,
		stopReminderTick,
		showToast,
		type ActiveTab,
		type FontFamily,
		type FontSize,
	} from "$lib/stores";
	import { craftingSubTabStore } from "$lib/stores/ui-state";
	import { loadCraftQueue } from "$lib/stores/craft-queue";
	import { initLoot, type LootInitHandle } from "$lib/services/loot-init";
	import { openScratchpadWindow, teardownScratchpadWindowForExit } from "$lib/services/scratchpad-window";
	import { openNoteEditor, teardownNoteEditorForExit } from "$lib/services/note-window";
	import { positionIsOnScreen } from "$lib/services/window-bounds";
	import { cleanupCaptureSession } from "$lib/stores/loot-session";
	import { playBossAlert } from "$lib/utils/audio";
	import { m } from "$lib/paraglide/messages";

	const appWindow = getCurrentWindow();

	let loading = $state(true);
	let error = $state<string | null>(null);

	// Grinding sub-tab state
	let grindingSubTab = $state<"tracker" | "treasures" | "hunting" | "ocr">("tracker");
	// Active main tab (side nav)
	let activeTab = $state("crafting");
	let unlistenClickThrough: UnlistenFn | null = null;
	let lootHandle: LootInitHandle | null = null;
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

	// Font family CSS stacks — "system" is the Parchment default (bundled IBM Plex)
	const FONT_FAMILIES: Record<FontFamily, string> = {
		system: '"IBM Plex Sans", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
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

	// Apply font family + bold via CSS. Bold is a body class so a global rule can
	// override explicit font-weights throughout the app (Tailwind classes, inline
	// styles, etc.).
	//
	// Font SIZE is deliberately not applied here. It and UI scale are both webview
	// zoom, and when this function owned one of them the two fought: this runs from
	// a synchronous store subscription, the UI-scale $effect runs after it on the
	// same store write, and the effect's setZoom(ui_scale) silently wiped the font
	// zoom every time. The font-size buttons had been inert since UI scale shipped.
	// Both factors are now composed in one place — see the zoom effect below.
	function applyFontSettings(fontFamily: FontFamily, fontBold: boolean) {
		document.body.style.setProperty("--app-font-family", FONT_FAMILIES[fontFamily] ?? FONT_FAMILIES.system);
		document.body.classList.toggle("app-bold", fontBold);
	}

	// Save current window state to settings
	async function persistWindowState() {
		try {
			// A minimized window reports the Windows "iconic" sentinel position
			// (-32000,-32000) and a collapsed size; persisting that strands the
			// window off-screen on the next launch. Keep the last normal state.
			if (await appWindow.isMinimized()) return;
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
				loadIslandsData(),
				loadBarterMapLayout(),
				loadCurrentRoute(),
				loadRouteLogs(),
				loadShipData(),
				loadShipProgress(),
				loadSailorRoster(),
				loadWeeklyTasksData(),
				loadWeeklyTasksProgress(),
				loadNotesData().then(() => initNotesSync()),
				loadCraftQueue(),
				initAppVersion(),
				initLoot().then((h) => {
					lootHandle = h;
				}),
			]);

			catalogsStore.set(catalogs);

			// The scratchpad was detached when the app last closed (or the
			// detached-by-default migration just set it) — respawn its window.
			// focus:false — a boot spawn must not steal focus from the main window.
			if ($settingsStore.scratchpad_detached) {
				void openScratchpadWindow({ focus: false });
			}

			// The editor was open when the app last closed — reopen it on the
			// same note. teardownNoteEditorForExit skips the destroy handler
			// precisely so note_editing_id survives to be read here.
			const heldNote = $settingsStore.note_editing_id;
			if (heldNote) {
				void openNoteEditor(heldNote);
			}

			// Apply transparency, font, and always-on-top whenever settings change.
			// All fields are normalized by initSettings before the subscription fires,
			// so no `??` fallbacks needed here.
			unsubscribeSettings = settingsStore.subscribe((settings) => {
				document.documentElement.style.setProperty("--app-opacity", String(settings.transparency));
				applyFontSettings(settings.font_family, settings.font_bold);
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
					// Restore position if saved — but only when the point sits on a
					// connected monitor. setPosition() accepts off-screen coords
					// without throwing (disconnected monitor, or the -32000 minimized
					// sentinel older builds persisted), so validate instead of relying
					// on the catch.
					if (savedState.x != null && savedState.y != null) {
						const sx = savedState.x;
						const sy = savedState.y;
						try {
							if (await positionIsOnScreen(sx, sy)) {
								await appWindow.setPosition(new PhysicalPosition(sx, sy));
							} else {
								console.warn("Saved window position is off-screen; keeping default:", sx, sy);
							}
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

			// Wire reminder firing: toast + reuse the boss-alert sound. The store
			// only invokes this when a reminder's `when` time has arrived and
			// `fired` is still false. One-shot — see notes store.
			setReminderFireCallback((r) => {
				showToast(m.notes_reminder_fired({ title: r.title }), "info", 6000);
				void playBossAlert();
			});
			startReminderTick();

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
				await flushNotes();
				if (lootHandle) await lootHandle.flush();
				// Take the detached scratchpad down with the main window so the
				// app doesn't linger as an orphaned always-on-top pad. Listener
				// teardown keeps scratchpad_detached=true → respawns next launch.
				await teardownScratchpadWindowForExit();
				// Same treatment for the editor: destroy it without the destroy
				// handler, so note_editing_id survives and it reopens on the
				// same note next launch.
				await teardownNoteEditorForExit();
			});

			loading = false;
		} catch (e) {
			error = e instanceof Error ? e.message : "Failed to load data";
			loading = false;
		}
	});

	onDestroy(() => {
		stopBossTimer();
		stopReminderTick();
		cleanupGrindingTimer();
		cleanupCaptureSession();
		unlistenClickThrough?.();
		unlistenCloseRequested?.();
		unlistenResized?.();
		unlistenMoved?.();
		unsubscribeSettings?.();
		void lootHandle?.cleanup();
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
			void playBossAlert();
		}
	});

	// Watch for jump-to-craft navigation from CraftingPlanner. Setting the
	// category store directly (not setActiveCategory) bypasses the per-category
	// memory restore so the jumped-to recipe wins.
	$effect(() => {
		const nav = $navigateToRecipeStore;
		if (nav) {
			craftingSubTabStore.set(nav.category);
			activeCategoryStore.set(nav.category);
			selectedRecipeStore.set(nav.recipe);
			searchTextStore.set(nav.recipe.name);
			showOnlyFavoritesStore.set(false);
			navigateToRecipeStore.set(null);
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

	// Widget modes float a rounded paper shell on the transparent window —
	// keep the body ground from painting behind its corners.
	$effect(() => {
		document.body.classList.toggle("widget-mode", $viewModeStore !== "full");
	});

	// The ONE webview-zoom writer. Two settings ride on zoom and they compose:
	//   - UI scale (7.3), full window only — the mini/medium widgets are
	//     fixed-size shells whose layouts assume 1:1, so scale is pinned to 1.
	//   - Font size, which applies in every view mode.
	// Anything else that calls setZoom will fight this effect and lose, because
	// the effect re-runs on every settings write.
	$effect(() => {
		const uiScale = $viewModeStore === "full" ? ($settingsStore.ui_scale ?? 100) / 100 : 1;
		const fontZoom = parseFloat(FONT_ZOOM[$settingsStore.font_size] ?? "1");
		getCurrentWebview()
			.setZoom(uiScale * fontZoom)
			.catch((e) => console.warn("Failed to set zoom:", e));
	});
</script>

{#if $clickThroughStore}
	<div class="fixed inset-0 z-50 pointer-events-none rounded click-through-border">
		<div class="absolute top-0 left-1/2 -translate-x-1/2 bg-card/90 text-accent text-[10.5px] font-bold px-2 py-px rounded-b border border-t-0 border-accent/40">
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
	<div class="flex flex-col h-screen overflow-hidden relative z-[1]">
		<!-- Title Bar -->
		<div class="flex-shrink-0">
			<TitleBar />
		</div>

		<!-- Boss row — full-width status strip above the rail and content
		     (slot 0; strip_slot preference can dock it below the body or hide it) -->
		{#if !loading && !error && $settingsStore.strip_slot === "top"}
			<div class="flex-shrink-0 px-4 pt-3">
				<StatusStrip craftingActions={activeTab === "crafting"} />
			</div>
		{/if}

		<!-- Body: Side Nav + Content (16px page padding, 16px gap — spec 5a) -->
		<div class="flex flex-1 min-h-0 overflow-hidden p-4 pt-3 gap-4">

			<!-- Side Navigation -->
			{#if !loading && !error}
				<nav class="nav-rail z-30">
					{#each [
						{ id: "crafting", label: m.nav_crafting(), img: "/icons/crafting.png" },
						{ id: "timer", label: m.nav_grinding(), img: "/icons/grinding.png" },
						{ id: "bartering", label: m.nav_bartering(), img: "/icons/bartering.png" },
						{ id: "inventory", label: m.nav_inventory(), img: "/icons/inventory.png" },
						{ id: "weekly", label: m.nav_weekly(), img: "/icons/weekly.png" },
						{ id: "log", label: m.nav_dashboard(), img: "/icons/dashboard.png" },
						{ id: "settings", label: m.nav_settings(), img: "/icons/settings.png", bottom: true },
						{ id: "about", label: m.nav_about(), img: "/icons/about.png", glow: "neon" },
					] as tab}
						<button
							onclick={() => { activeTab = tab.id; activeTabStore.set(tab.id as ActiveTab); }}
							class="rail-btn {activeTab === tab.id ? 'rail-active' : ''} {tab.glow === 'neon' && activeTab !== tab.id ? 'rail-pulse' : ''} {tab.bottom ? 'mt-auto' : ''}"
							title={tab.label}
							aria-current={activeTab === tab.id ? "page" : undefined}
						>
							<img src={tab.img} alt={tab.label} class="rail-icon" />
						</button>
					{/each}
				</nav>
			{/if}

			<!-- Main Content Area -->
			<main class="flex-1 flex flex-col overflow-hidden min-w-0">
				<!-- Scrollable content — top row is the status strip (boss row), per spec 5a -->
				<div class="flex-1 overflow-auto flex flex-col min-h-0">
					{#if loading}
						<div class="text-center py-8">
							<p class="timer-accent text-sm">{m.chrome_loading()}</p>
							<p class="text-[var(--ink-faint)] text-xs mt-1">{m.chrome_loading_subtitle()}</p>
						</div>
					{:else if error}
						<div class="text-center py-8">
							<p class="text-destructive text-sm">{m.chrome_error()}</p>
							<p class="text-[var(--ink-faint)] text-xs mt-1">{error}</p>
						</div>
					{:else}
						<!-- Crafting -->
						{#if activeTab === "crafting"}
							<CraftingScreen />

						<!-- Inventory -->
						{:else if activeTab === "inventory"}
							<div class="paper-card p-3 flex-1 flex flex-col min-h-0">
								<InventoryView />
							</div>

						<!-- Dashboard -->
						{:else if activeTab === "log"}
							<div class="paper-card p-3 flex-1 flex flex-col min-h-0">
								<DashboardView />
							</div>

						<!-- Grinding -->
						{:else if activeTab === "timer"}
							<div class="paper-card p-3 flex-1 flex flex-col min-h-0">
								<!-- Sub-tabs (unified, sticky) -->
								<div class="sticky top-0 z-10 mb-2 -mx-2 px-2 border-b border-outline-variant flex-shrink-0" style="background: var(--surface-lowest);">
									<SubTabs
										tabs={[
											{ id: "tracker", label: m.grinding_subtab_tracker() },
											{ id: "treasures", label: m.grinding_subtab_treasures() },
											{ id: "hunting", label: m.grinding_subtab_hunting() },
											{ id: "ocr", label: m.grinding_subtab_ocr() },
										]}
										active={grindingSubTab}
										onSelect={(id) => grindingSubTab = id as "tracker" | "treasures" | "hunting" | "ocr"}
									/>
								</div>

								<div class="flex-1 flex flex-col min-h-0">
									{#if grindingSubTab === "tracker"}
										<GrindingTracker />
									{:else if grindingSubTab === "treasures"}
										<TreasureTracker />
									{:else if grindingSubTab === "hunting"}
										<HuntingTracker />
									{:else}
										<LootView />
									{/if}
								</div>
							</div>

						<!-- Bartering -->
						{:else if activeTab === "bartering"}
							<div class="paper-card p-3 flex-1 flex flex-col min-h-0">
								<BarteringView />
							</div>

						<!-- Weekly Tasks -->
						{:else if activeTab === "weekly"}
							<div class="paper-card p-3 flex-1 flex flex-col min-h-0">
								<WeeklyTasksView />
							</div>

						<!-- Settings -->
						{:else if activeTab === "settings"}
							<div class="paper-card p-3 flex-1 flex flex-col min-h-0">
								<SettingsView />
							</div>

						<!-- About -->
						{:else if activeTab === "about"}
							<div class="paper-card p-3 flex-1 flex flex-col min-h-0">
								<AboutView />
							</div>
						{/if}
					{/if}
				</div>

				<!-- Status footer -->
				<footer class="app-footer flex items-center justify-between px-3 flex-shrink-0">
					<span>BDO Life Companion v{$appVersionStore}</span>
				</footer>
			</main>
		</div>

		<!-- Boss row docked below the body (strip_slot = "bottom", spec order 9) -->
		{#if !loading && !error && $settingsStore.strip_slot === "bottom"}
			<div class="flex-shrink-0 px-4 pb-3">
				<StatusStrip craftingActions={activeTab === "crafting"} />
			</div>
		{/if}
	</div>
{/if}
</div>
{/key}

{#if $viewModeStore === "full" && !loading}
	<Scratchpad />
{/if}

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
