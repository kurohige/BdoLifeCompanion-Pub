# Changelog

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
