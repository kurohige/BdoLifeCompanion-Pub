# Changelog

---

## v2.1.0 — 2026-03-19

### New Features

- **Hunting Tracker** — Session tracker for hunting with mastery, matchlock, and butchering knife fields. Same layout as the grinding tracker.
- **Activity Dashboard** — The Log tab is now a chart-based dashboard. See your stats across all activities:
  - Profit over time (line chart)
  - Silver per hour comparisons (bar chart)
  - Activity breakdown (doughnut chart)
  - Top items acquired (bar chart)
  - Cumulative silver earned (line chart)
  - Filter by time range: Today, 7 days, 30 days, or All Time
  - Drill down by activity type: Grinding, Hunting, or Crafting
- **Marketplace Price Fetch** — Hit the "Prices" button in the grinding tracker to pull current Central Market prices for your loot items.
- **Font Customization** — Change font family, weight, and size in Settings.

### Visual Changes

- **Glassmorphism UI** — Frosted glass effect across all panels, cards, inputs, and dropdowns with per-theme blur and tint variants.
- **Hunting sub-tab** — Added under the Grinding tab as `Tracker | Treasures | Hunting`.
- **Hunting Log** — Shows up as a third tab in the Dashboard alongside Grinding and Crafting logs.

### Technical

- Chart.js 4 added as a dependency (5 reusable chart components)
- Rust backend: `load_hunting_log` / `save_hunting_log` persistence commands
- Rust backend: `fetch_market_prices` command for BDO Central Market API
- 9 glassmorphism CSS utility classes with per-theme variants

---

## v2.0.0 — 2026-02-16

The initial Tauri release — a full rewrite from the original .NET WPF version.

### Core Features

- **Crafting Calculator** — 981 recipes (Cooking, Alchemy, Draughts) with search, filtering, ingredient navigation, "Used In" cross-references, and alternative ingredient support
- **Crafting Planner** — Dependency tree builder with inventory-aware shopping list and step-by-step crafting order
- **Inventory Manager** — Track item quantities with CSV import/export/merge
- **Grinding Tracker** — Session timer with countdown presets, loot tracking, AP/DP logging, grade-colored loot rows
- **Treasure Tracker** — Progress tracking for 5 treasure collections (~25 pieces)
- **Crafting Log** — Session history with mastery and life skill rank tracking
- **Grinding Log** — Session history with stats, search, and loot summaries
- **Boss Timer** — 14 boss spawn countdowns for EU and NA servers with sound alerts
- **Game Reset Timers** — Daily, weekly, node war, conquest war countdowns (DST-aware for PDT/CEST)
- **Announcements** — Remote announcement carousel with 3D cube rotation animation

### Overlay & Window

- **3 View Modes** — Full (560x680), Medium (560x170), Mini (180x260) — cycle via logo click
- **Medium Mode** — Compact horizontal dashboard with timer, boss countdown, reset timers, loot summary
- **Mini Mode** — Context-aware floating widget (shows boss timer, active grinding session, or recipe info depending on what you're doing)
- **Always-on-top** with adjustable transparency
- **Window state persistence** — Remembers size, position, and view mode between launches

### Customization

- **3 Themes** — Neon Cyberpunk (default), Dark Minimal, Light
- **Split Mastery** — Separate cooking (0–3000) and alchemy (0–3000) mastery values
- **Life Skill Ranks** — Beginner 1 through Guru 72 per skill
- **Server Region** — EU/NA setting for boss schedules

### Data

- 981 recipes across 3 catalogs
- 759 item images
- 98 grinding spots with 435 loot items
- 14 boss images and schedules
- Portable data storage — everything saves next to the executable

---

## Pre-Release

Originally built as a .NET WPF application. Rewritten in Tauri + Svelte — smaller binary, native performance, and the groundwork for macOS/Linux support down the road.
