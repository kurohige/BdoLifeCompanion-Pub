# Changelog

---

## Unreleased

---

## v2.8.0 — 2026-09-15

The biggest release so far. The whole interface moves to a new light theme, the grinding
tracker can read your loot log for you, and the ship upgrade tracker finally does the
arithmetic instead of leaving it to you.

### New Features

- **Loot OCR Tracker.** A new **OCR** sub-tab under Grinding. You draw a rectangle over your
  own loot log, and the app reads that region a few times a second and tallies drops as they
  scroll past — matching each line against a catalog of around 440 items built from the
  grinding, recipe, hunting, barter and treasure data. Lines it cannot match stay as raw text
  so you can rename them, link them to a catalog item, or delete them. The hard part was not
  reading the text but avoiding double counts: BDO redraws the same loot line as it fades and
  scrolls, so a single misread quantity would otherwise become a permanent error. Each new
  line now waits briefly, collects a reading per sighting, and commits the majority vote.
  Sessions survive a restart (paused), and finishing one snapshots it into a browsable history.
  It is strictly a reader — you start it, you draw the region, and it never sends input to
  the game or touches the game process.
- **Ship material totals and recipes.** Bartering ▸ Ships used to show requirements one stage
  at a time, so the numbers that actually decide whether a grind is worth starting — 500
  Sturdy Coral Support across the four Falasi stages — appeared nowhere. There is now a
  **Total Materials Needed** panel that sums every material across the stages sharing it,
  subtracts what you have entered, and skips stages you have marked done, with a **Full path**
  toggle for planning before you begin. Each craftable material expands into its recipe scaled
  to what is still missing, with the craft count, the Mass Process batch count, and the
  Lyngbakr horn exchange as an alternative. The raw ingredients are trackable too, and a
  **Raw Shopping List** at the bottom flattens every recipe into what you actually gather.
- **A craft queue.** Queue batches with editable quantities and get a per-batch ETA from a
  tunable seconds-per-craft figure, what each batch is short against your inventory, and a
  total finish time.
- **A live crafting session.** Start, pause and stop a session that tracks your crafted count
  and crafts per hour. Logging a craft feeds both the crafting log and the running session.
- **The Scratchpad — notes in their own window.** Notes moved out of a side tab into a
  free-floating pad that opens as its own always-on-top window, draggable by its header and
  remembering where you put it. Closing its window re-docks it into the main window, and
  whichever you chose is remembered. `Ctrl+N` focuses it.
- **A real note editor.** Creating a note opens a second window with a title, a body that
  grows as you type, an optional checklist and an optional reminder time. Saving is automatic.
- **A note can now hold prose, a checklist and a reminder at the same time.** Previously each
  note was exactly one of the three, which meant checkboxes silently did nothing on a text
  note and a reminder added to one never fired. Both now work.
- **Search across your whole note library** with `Ctrl+F` — titles, body text, checklist
  items, tags and category names, with matches highlighted.
- **Layout preferences.** A new Settings ▸ Layout section: put the boss and session strip at
  the top, dock it to the bottom, or hide it; choose whether the crafting screen leads with
  search or with the recipe detail; pick comfortable or compact density; toggle the last-kill
  line and the "Used in" panel; and scale the whole window between 90% and 125%.
- **Silver per hour** on the Grinding and Hunting trackers, projected from your loot value and
  elapsed time, next to Total Silver.
- **Two more server regions.** SEA and SA join NA and EU for boss schedules and war times,
  with a separate **Market Region** setting driving Central Market price lookups.
- **Event bosses expire on their own.** Boss entries can carry a validity date range, so a
  limited-time world boss goes inert when its window closes instead of needing a manual cleanup.

### Changed

- **Parchment — a new light theme, and the only one.** The app leaves Obsidian Dark for a warm
  parchment ground with a single teal accent. This is a full conversion rather than a new
  option: every screen was rebuilt on the new design, the window controls are now one
  consistent set everywhere (minimise, a size chevron that steps between view modes, close),
  the navigation rail is a slim floating card, and the boss strip spans the top of the window.
  The mini and medium widgets were rebuilt too — the mini bar grows a line and turns amber
  then rust as a spawn closes in, and fades when you leave it alone.
- **IBM Plex is now actually included.** The interface had been naming it in its font stack
  without shipping the files, so every install was quietly rendering system fallbacks instead.
- **The crafting screen is built around search.** A search field summons a filtered recipe list
  beneath it with full keyboard navigation; picking a recipe fills a detail card with editable
  held counts, shortage rows against your inventory, and chips showing what else the item is
  used in.
- **Bigger item icons** across crafting, grinding, loot and the ships tab, and a firmer panel
  outline so cards separate from the background.
- **Updated for the Inner Edania patch.** Six new grinding zones with their loot, the Lyngbakr
  Habitat zone, Falasi yellow-gear stages on all four Carrack paths, a new Panokseon —
  Cheongun path, new sailing consumables, combat draught durations moved from 15 to 20 minutes
  across 37 recipes, and 11 alchemy recipes that were simply missing.
- **Spanish keeps pace.** Every new string is translated, and the two catalogues are now kept
  in step by an automated check, so an untranslated label fails the build instead of showing
  up in the Spanish interface.

### Removed

- **Obsidian Dark, the theme colour pickers and the glow intensity slider.** Parchment replaces
  them. Your existing settings file still loads — the options it no longer needs are ignored.
- **The Notes side tab.** Your notes are unchanged and now live in the Scratchpad.
- **The announcement ticker and the in-app update check.** The whole announcements system is
  gone, which also means the app no longer tells you when a new version is out — watch the
  GitHub Releases page instead.
- **The Cooking Rank and Alchemy Rank dropdowns.** They saved a value nothing ever read; the
  mastery figure and progress bar come from the mastery fields directly beneath them and are
  unaffected.

### Fixed

- **The app could launch completely off-screen and look like it had failed to start.**
  Minimising fires the same events the app uses to remember its position, so closing while
  minimised saved the off-screen coordinates Windows reports for a minimised window. Placement
  is no longer recorded while minimised, and on launch a saved position is checked against the
  monitors actually connected — so a stale position from a display you have since unplugged
  falls back to the default instead of hiding the window.
- **The note editor and the detached Scratchpad had the same problem** and now get the same
  guard, keeping the size you had chosen.
- **The font size setting did nothing.** Two parts of the app were both setting the zoom level
  and the UI scale one always landed last, wiping the font size — which also meant any
  settings change reset your zoom. One place now owns it and combines both.
- **Unreadable text on the bartering map and route buttons.** Five places took their text
  colour from a value that was never defined, so they fell back to near-black — fine on the
  old dark theme, unreadable on teal and the darker tier colours.
- **Checkboxes and reminders on notes that were not created as to-dos** now work; see the note
  model change above.
- **The smallest view could not be reached from the main window.** The size chevron stepped
  large to medium and back; it now walks large, small, medium, and reverses on right-click.
- **The Cooking, Alchemy, Draughts and Planner sub-tabs show their icons**, which had been
  supported but never actually passed through.
- **Loot OCR accuracy**, across several passes: a scanner race that could run two readers at
  once, a cold-start gap that let a catastrophic first misread through unchallenged, and
  re-counts when BDO scrolls the log quickly.
- **Diagnostics export is disabled when there is nothing recorded**, instead of looking
  available and then reporting that there was nothing to export.

---

## v2.7.0 — 2026-05-11

### New Features

- **Customize your theme colors.** Settings → Display has a new **Customize Colors** block where you can recolor the **Primary** (buttons, active tabs, CTAs), **Accent** (focus rings, neon highlights), and **Gold Glow** (nav/active-state ring, gold accents) to whatever you like. Each color has a native color picker, six quick preset swatches (purple/cyan/gold/neon-green/orange-red/pink), and a one-click reset (`×`) that only appears when you've changed it. Plus a **Glow Intensity** slider (0–200%) to dim or boost every neon glow at once. Obsidian Dark and Light keep their own independent customizations — switching theme swaps which set you're editing. Click **Reset All** in the section header to wipe everything for the active theme.
- **Play/Stop preview for your boss alert sound.** The **Preview** button in Settings → Bosses → Custom Alert Sound is now a stateful toggle — click ▶ to start playing the sound, click ■ to stop it whenever you want. Especially useful for auditioning long imported clips without waiting for them to finish.
- **Notes side tab — Codex Library.** A new dockable overlay panel for player-managed notes, todos, and reminders, accessible from a new `📝 Note` button at the top-right of the main content area. Color-coded category shelves (Bosses, Bartering, Crafting, Reminders, Dailies, General to start — fully renameable and customizable up to 30 categories), three note types (plain text, multi-item todo, time-based reminder), pin/tag/search support, sections grouped by pinned/today/earlier, and a slash command bar at the bottom (`/todo X`, `/remind X`, `/note X`, plain text → text note, trailing `#tag` captured). Reminders fire as a toast plus your boss alert sound when their time arrives. Press `Ctrl+K` to focus the input from anywhere in the panel; ESC or click outside to close. Dock side (left/right) persists across launches.
- **Custom boss alert sound.** You can now pick your own audio file for the boss spawn alert instead of the built-in beep. Settings → Bosses → Alerts has a new **Custom Alert Sound** section with **Choose file…**, **Preview**, and **Reset** buttons. Supported formats: mp3, wav, ogg, m4a, aac, flac. Files up to 10 MB. The file is copied next to the app's data so the alert keeps working even if you move or delete the original.
- **Spanish UI translation.** The entire app interface can now be displayed in Spanish — every label, button, tab, tooltip, toast, and confirmation prompt. Toggle in **Settings → Display** ("Idioma / Language" — English / Español). On first launch, the app auto-detects your system language and picks the right one; after that it remembers your preference.
- **Live language switching.** Switching between English and Spanish flips the entire interface in place — no reload, no flash. Date and number formatting also follow the chosen language (Spanish uses `.` for thousands and `,` for decimals).
- **Vocabulary kept consistent**: BDO-specific terms like *Parley*, Carrack variants (Advance/Balance/Volante/Valor), Caravel, Galleass, Value Pack, and NPC names stay in English (they're proper nouns in-game). Common UI text uses idiomatic Spanish: Crafteo, Farmeo, Trueque, Maestría, etc.
- **Note**: Recipe names, item names, boss names, and grinding spot names are still in English — those are tied to the underlying game data and translating them would break inventory tracking. UI chrome (everything around the data) is what gets the Spanish treatment.

### Removed

- **Animated hex background in full mode.** The decorative particle animation in the main window has been removed along with its Settings → Display toggle. It was a fun experiment but didn't pull its weight — most users never noticed it, and it used real CPU/battery for what was essentially wallpaper.

### Fixed

- **Notes panel — delete prompt sometimes wiped the note before you could answer.** The native browser confirm dialog wasn't reliably blocking inside the overlay panel, so clicking the `×` on a note or category would occasionally delete it before showing the confirm. Switched to an OS-level dialog that properly waits for your answer.
- **Bartering map and other tab content didn't grow with the window.** When you enlarged the app window, the bartering map stayed at a small fixed height and the recipe ingredients list (and several other lists) stopped scaling. Now every tab fills the available space, and lists like the Crafting ingredients, Inventory items, Grinding/Hunting loot, and Treasure cards grow with the window.
- **Bartering map labels sometimes hid behind nearby dots.** Island name labels are positioned just below the dot, and depending on the order nodes were drawn, neighboring dots could overlap them. The map now layers nodes by importance (open node on top, then last-visited, then visited, then unvisited) and brings any hovered node to the front so its label is always readable.

---

## v2.6.0 — 2026-05-02

### New Features

- **Bartering Routes & Logs.** The flat barter tracker is replaced by two new sub-tabs:
  - **Routes** — a real map of all 90 official barter destinations drawn over the in-game sea map. Pan and zoom freely; click any island to log a trade (autocomplete by item name, tier picker fallback, qty stepper). Trades append to the active route; the parley bar tracks spend with a refill popover; the ledger lists every trade in order. Finishing a route auto-syncs the delivered tier counts into your inventory and saves a route log.
  - **Logs** — full per-route history with date filters (All / Today / Week / Month), an aggregate ribbon at the top, and per-route mini-maps. Click any log to open the full route detail with map + ledger.
  - Existing sub-tabs (Inventory, Ships, Parley, Sailors) are unchanged. Default sub-tab is now Routes. Old tracker state automatically remaps to the new Routes view.
- **Mini Mode dual-clock cluster.** The mini bar now shows local time and BDO server time (UTC) side-by-side with the existing controls. Live-ticking, mounts only when you're in mini mode.
- **Mini Mode Clocks toggle** (Settings → Display) — turn the cluster off if you prefer the original layout.
- **12h / 24h clock format selector** (Settings → Display) — drives both the LOCAL and SVR rows. Hidden when the clock cluster itself is off.

### Fixed

- **Fresh-install settings defaults were inverted.** On a brand-new install (no `settings.json` yet), every default-on toggle (background animation, always-on-top, boss alert sound, timer alert sound, and the new mini clocks + 24h format) was loading as **off** instead of on. The fix routes the no-file and corrupt-file branches through the same code path that respects per-field defaults, so first-run state matches the design intent.
- **Tier picker in the route popover sometimes reverted your choice.** If you opened a node, picked a different tier, then opened the same node again, the picker would snap back to the node's default tier. The seed value is now read once on mount and your override sticks until you close the popover.
- Five small accessibility improvements (label-for-input on Crow Coins, editable name in the sailor list is now a proper button, scoped lint suppressions where the violation is intentional).

### Behind the Scenes

- Repo cleanup reclaimed ~560 MB by removing the legacy WPF version (preserved in git history) and a large set of obsolete docs. No runtime impact — the public release zip is unaffected.

---

## v2.5.3 — 2026-04-24

### Fixed

- **Window position and size now persist reliably.** Previously, moving or resizing the window and then closing it would sometimes lose those changes — the save was scheduled but the app closed before it could write to disk. The app now captures position and size whenever you drag or resize, and forces a save before the window closes.
- **Logs and progress files self-heal from corruption.** If your crafting log, grinding log, hunting log, barter log, ship progress, sailor roster, weekly tasks, treasure progress, barter inventory, or planner file ever becomes corrupted (e.g. a power loss mid-write), the app now renames the bad file and loads defaults instead of refusing to open that feature. Matches how the settings file already recovered.
- **Silent save failures now surface as a toast.** If saving barter inventory, ship progress, or sailor roster fails, you'll now see an error message instead of losing data without warning.
- **Failed data downloads give clearer errors.** Hunting spots, grinding spots, treasures, weekly tasks, and barter items used to fail with an obscure parse error if the file couldn't be loaded. Now the error identifies what failed and why.

### Changed

- Dead code removed behind the scenes (two unused view components + an unused tab wrapper). No visible change — just less to maintain.
- Small internal cleanups: fixed a couple of listeners that weren't being cleaned up properly on window close, and tightened a few type casts.

---

## v2.5.2 — 2026-04-21

### Fixed

- **App no longer gets stuck on "Failed to load data" after close/reopen.** On some multi-monitor and high-DPI setups, the saved window position and size were being written in one coordinate system and read back in another, causing Tauri's window-restore call to fail and abort startup. Window state is now saved and restored in matching units, and any restore failure (e.g. a monitor that was disconnected since last run) just logs a warning and keeps the app booting.
- **Corrupt `settings.json` no longer bricks the app.** If the settings file can't be parsed at startup, the app now renames it to `settings.json.corrupt-<timestamp>` and boots with defaults. Previously users had to delete the file manually.

### Changed

- Simplified the Special Thanks line in the About tab and the README.

---

## v2.5.1 — 2026-04-20

### New Features

- **SEA + SA region support** — the app now works for Southeast Asia and South America players:
  - **Server Region** dropdown extended with SEA and SA options — drives the boss schedule, daily / weekly resets, and node / conquest war times. Schedules added for both regions in UTC with proper timezone offsets (SEA = GMT+8, SA = UTC-3, neither observes DST).
  - **Market Region** became its own independent setting (NA / EU / SEA) so you can play on one server while fetching prices from another. Existing users' market region auto-inherits from their server region on first load. SEA marketplace prices fetched via the Asia Pearl Abyss endpoint.
  - Per-region node / conquest war hours baked in (NA 18:00 / 20:00, EU 20:00 / 20:00, SEA 21:00 / 21:00, SA 21:00 / 21:00 local time).
- **Configurable boss visibility** — new Bosses tab in Settings with per-boss toggle cards (Regular / Rare groupings). Hide the bosses you don't care about and they disappear from the boss bar, mini / medium modes, and the next-spawn alerts. Show all / Hide all shortcuts.
- **Time-since-last-spawn** — boss bar now shows the most recent past spawn ("Xh Ym ago") alongside the next spawn, live-updating every second. Medium mode boss card gets the same line.
- **Recipe autocomplete** — Cooking / Alchemy / Draughts search opens a dropdown of matching recipes (with images + favorite star) as you type two or more characters. Full keyboard navigation: ↓ / ↑ to move, Enter to select, Esc to close, Home / End for endpoints. Same nav added to the Planner goal search.
- **Dismissible announcements** — the top message bar now has an ✕ button to dismiss the current message.
- **Background Animation toggle** — Settings → Display. Turn off the animated hex background for zero canvas overhead on weaker hardware or for battery savings.
- **Per-category recipe memory** — Cooking / Alchemy / Draughts each remember the recipe you had open and your search text. Switching between categories restores the previous state instead of dumping you on a blank page.
- **Per-tab state memory** — Planner expansion + search, Bartering sub-tab, Dashboard / Log sub-tab and filters, Settings tab — every navigational state now survives tab switches within a session.

### Improvements

- **Announcement bar** — the big card on the main view shrunk to a compact scrolling ticker; the inline tickers in Mini and Medium modes were removed entirely.
- **Boss bar** — reordered chronologically (`Previous | Next`) and dropped the cramped "boss after next" cluster. Names no longer overlap.
- **Crafting Planner** — tree, shopping, and steps panels now fill the available window height instead of capping at 340px. Deep recipes no longer force double-scroll.
- **Grinding timer** — Reset now restarts at the configured duration instead of zeroing your preset; preset buttons trimmed to `+15m`, `+30m`, `+1h`.
- **Settings → Display**:
  - "Transparency" renamed to "Opacity" (more accurate — 100% = fully opaque)
  - Font Size active button now has a clear gold fill with black text
  - Bold Text toggle now applies globally to the whole app (not just body text)
- **Hex particle background** — particle count reduced 50 → 30 (~40% fewer shadow-blurred draws per frame). Automatically pauses when the window is minimized. Visual density barely changes; CPU / battery cost drops noticeably.
- **Input hygiene** — spellcheck squiggles and browser saved-value / autofill popups disabled on every input across the app.

### Fixed

- **Always-on-Top toggle, theme choice, and window size/position** now persist across app restarts. The Rust settings struct was silently dropping those fields — settings roundtrip correctly now.
- **Empty-string settings** (server region, font size, font family) from older installs were leaving dropdowns un-selected on load. Values are now auto-normalized to safe defaults at startup.
- **Crafting Planner** no longer loses expanded nodes + recipe search when you switch tabs.
- **Boss Visibility panel** — Show all / Hide all buttons no longer overlap the heading description at narrow widths.

### Technical

- New `ui-state.ts` store module for session-only UI state (sub-tab selections, planner expansion keyed by plan ID, category memory). Not persisted to disk.
- New `BossSettingsPanel.svelte` component + `ToggleSwitch.svelte` shared toggle extracted from duplicate markup.
- Rust `AppSettings` struct filled out — `theme`, `window_state` (new `WindowState` struct), `always_on_top`, `hidden_bosses`, `animations_enabled` all serialize correctly now.
- `initSettings()` normalizes every enum and boolean field on load.
- Stronger types: `Set<BossId>` filtering, `Record<RecipeCategory, T>` memory keys, dropped `any` casts in boss-timer derived stores.
- Shared `getBossNames(spawn, separator)` helper + `formatElapsed()` moved to `utils/format.ts`.
- Dead `BossCountdown.svelte` removed.

---

## v2.5.0 — 2026-04-18

### New Features

- **Bartering System** — Full bartering life skill tracker:
  - T1–T7 barter counter with live activity log and date-grouped session history
  - 123-item inventory with collapsible tiers, crow coin balance, total value
  - Ship crafting progression for all 4 Carrack variants (Advance, Balance, Volante, Valor)
  - Parley calculator with mastery-based cost reduction and 16+ NPC route planner
  - Sailor tracker with speed projections at level 10
  - Draft form persists across tab switches — log sessions whenever you're ready
  - T6/T7 items added for the April 2026 patch (continental port trade routes)
- **Weekly Tasks** — Track weekly reset content with auto-reset:
  - Altar of Blood tracker (21 stages, AP/DP requirements, boss stage highlighting)
  - First-clear reward grid (persists across weekly resets)
  - Auto-resets progress on Sunday 00:00 UTC
- **About Tab** — Dedicated app info page with developer credit, Buy Me a Coffee link, safety statement, and source code links
- **Always on Top Toggle** — New setting to switch between overlay mode and normal window behavior
- **Clear All Data** — Deletes all app data (all logs, inventory, barter data, ships, sailors, treasures, weekly tasks, seeded data). Settings preserved.

### Visual Overhaul

- **Obsidian Dark theme** — Merged and refined from previous themes (sharp corners, Space Grotesk font, uppercase tactical labels, subtle neon glow)
- **Light theme** — Warmer off-white, less bright, better contrast
- **Theme consolidation** — Reduced from 4 themes to 2 well-polished options
- **Hex particle background** — Animated neon hexagon-forming particles behind all content
- **Gold accent system** — `#ffee10` gold glow on all navigation, buttons, and active states
- **Custom navigation icons** — All side nav tabs use custom icons with gold glow hover effect
- **Announcement carousel** — Spinning gradient border, glowing accent bars, staggered content entrance, shimmer sweep
- **Boss bar** — Brighter background, larger boss images with brightness filter
- **TitleBar** — Semi-transparent with version + "by jhidalgo_dev" branding
- **Semi-transparent panels** — Glass panels show hex animation through content areas
- **Mini mode** — Gold accents, semi-transparent bar
- **Medium mode** — Gold card borders/titles, semi-transparent panels

### Improvements

- **Barter sales layout** — CSS grid prevents text wrapping at any window width
- **Settings readability** — Custom gold slider, gold-bordered buttons, larger toggles
- **Empty state icons** — Custom icons replace emojis in all empty views
- **Carousel readability** — Stronger card background, bolder text, larger titles

### Technical

- Centralized `appVersionStore` (single getVersion() call shared across components)
- Single `DEFAULT_SETTINGS` source of truth
- Shared `applyTheme()` utility
- Weekly reset utilities in `utils/reset.ts`
- Debounced weekly tasks save
- Canvas hex background with MutationObserver theme detection and debounced resize
- `--gold-glow` CSS variable for centralized accent color

---

## v2.1.0 — 2026-03-19

### New Features

- **Hunting Tracker** — Session tracker for hunting with mastery, matchlock, and butchering knife fields.
- **Activity Dashboard** — Chart-based analytics across all activities with time and activity filters.
- **Marketplace Price Fetch** — Pull current Central Market prices for grinding loot items.
- **Font Customization** — Change font weight and size in Settings.

### Visual Changes

- **Glassmorphism UI** — Frosted glass effect across all panels and components.
- **Hunting sub-tab** and **Hunting Log** in Dashboard.

---

## v2.0.0 — 2026-02-16

The initial Tauri release — a full rewrite from the original .NET WPF version.

### Core Features

- **Crafting Calculator** — 981 recipes with search, filtering, ingredient navigation, "Used In" cross-references, and alternative ingredient support
- **Crafting Planner** — Dependency tree builder with inventory-aware shopping list
- **Inventory Manager** — Track item quantities with CSV import/export/merge
- **Grinding Tracker** — Session timer with countdown presets, loot tracking, AP/DP logging
- **Treasure Tracker** — Progress tracking for 5 treasure collections
- **Boss Timer** — 14 boss spawn countdowns for EU and NA servers with sound alerts
- **Game Reset Timers** — Daily, weekly, node war, conquest war countdowns (DST-aware)
- **3 View Modes** — Full, Medium, Mini — with always-on-top and transparency
- **Window state persistence** — Remembers size, position, and view mode

### Data

- 981 recipes across 3 catalogs
- 98 grinding spots with 435 loot items
- Portable data storage — everything saves next to the executable

---

## Pre-Release

Originally built as a .NET WPF application. Rewritten in Tauri + Svelte for smaller binary, native performance, and cross-platform groundwork.
