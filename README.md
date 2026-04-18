# BDO Life Companion

A lightweight desktop overlay for **Black Desert Online** that helps you track crafting, grinding, bartering, hunting, boss timers, weekly tasks, and session analytics — without ever touching the game.

> **This is a companion tool, not a cheat.** Everything is entered manually by you. No automation, no screen reading, no memory injection. Just a window sitting next to your game.

---

## Download

**Latest version: v2.5.0**

- [GitHub Releases](https://github.com/kurohige/BdoLifeCompanion-Pub/releases) — Portable `.zip`, no installer needed

Just extract the zip and run the `.exe`. That's it.

> **Note:** Windows Defender SmartScreen may show a warning because the app is not yet code-signed. Code-signing certificates cost **~$200–500/year** from a trusted certificate authority, which is more than a free hobby project can justify right now — so for the time being the build ships unsigned. This is normal for indie software. Click **"More info"** then **"Run anyway"** to proceed. **Only the source code is open-source** — you can inspect it or build it yourself. The in-app game assets (item icons, boss images, recipe data, etc.) are the property of **Pearl Abyss / Black Desert Online** and are not redistributed here, which is why the public repo ships code only and the runnable build is offered separately via Releases.

For a walkthrough of first launch and features, check the [User Guide](USER-GUIDE.md).

---

## What It Does

### Crafting

- **Recipe Browser** — 981 recipes across Cooking, Alchemy, and Draughts. Search, filter, and see ingredient breakdowns with item images.
- **Ingredient Navigation** — Click any ingredient to jump to its recipe. See a "Used In" section showing every recipe that uses the current item.
- **Alternative Ingredients** — Recipes with substitutable ingredients are marked so you know your options.
- **Crafting Planner** — Build a dependency tree for what you want to craft. It checks your inventory, calculates what you still need, and gives you a shopping list and step-by-step crafting order.
- **Inventory Tracker** — Keep track of how many of each item you have. Supports CSV import/export for backup or spreadsheet use.
- **Crafting Log** — Log your crafting sessions with yield, mastery, and life skill rank tracking.

### Grinding

- **Grinding Tracker** — Pick a spot, start a countdown timer, and log loot as you go. Supports AP/DP tracking per session.
- **Market Prices** — Fetch current Central Market prices for loot items to estimate silver/hour.
- **Treasure Tracker** — Track progress across 5 treasure collections and their ~25 pieces.

### Bartering

- **Barter Tracker** — Count barters by tier (T1–T7) with live activity log. Draft form persists across tab switches — log sessions whenever you're ready.
- **Barter Inventory** — Track 123 barter items across 7 tiers with collapsible tier sections, crow coin balance, and total value calculations.
- **Ship Crafting** — Track progress toward all 4 Carrack variants (Advance, Balance, Volante, Valor) with per-material tracking across 5 stages.
- **Parley Calculator** — Calculate barter costs based on mastery level and Value Pack, with route planner for 16 NPC routes.
- **Sailor Tracker** — Manage your ship's crew with speed projections at level 10.

### Hunting

- **Hunting Tracker** — Session tracking with mastery, matchlock, and butchering knife fields.

### Weekly Tasks

- **Altar of Blood** — Track your weekly progress across 21 stages with AP/DP requirements, boss stage highlighting, and first-clear reward tracking. Auto-resets on Sunday.

### Dashboard

- **Activity Dashboard** — Charts and stats across all your activities: profit over time, silver/hour comparisons, item breakdowns, and cumulative earnings. Filter by Grinding, Hunting, Crafting, or see everything at once.

### Timers & Alerts

- **Boss Timer** — Countdown to next boss spawn for 14 bosses, with EU/NA schedules and sound alerts.
- **Game Reset Timers** — Daily reset, weekly reset, node war, and conquest war countdowns (DST-aware).

### Overlay Modes

The app has 3 view modes:

| Mode | Size | What You See |
|------|------|-------------|
| **Full** | 560 x 680 | All tabs, full feature navigation, resizable window |
| **Medium** | 460 x 150 | Compact dashboard with timer, boss countdown, reset timers |
| **Mini** | 400 x 56 | Thin floating bar with boss countdown and announcements |

All modes support always-on-top (toggleable) and adjustable transparency. The window remembers its position and size between launches.

### Themes

Two built-in themes: **Obsidian Dark** (default — sharp corners, Space Grotesk, gold accents, neon hex particle background) and **Light** (warm off-white, readable).

---

## Is This Safe?

**Yes.** This app:

- Does **not** read the game's memory or screen
- Does **not** inject DLLs or modify game files
- Does **not** send keystrokes, mouse clicks, or macros
- Does **not** connect to your game account
- Does **not** collect any personal data

It's a standalone window that sits next to your game. You type in your own numbers. That's all it does.

The source code is public so you can verify this yourself. The Rust backend handles file I/O for saving your data locally — nothing leaves your machine except optional market price lookups to the BDO Central Market API (the same public API the game's marketplace uses).

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop Framework | [Tauri 2.0](https://tauri.app/) (Rust) |
| Frontend | [Svelte 5](https://svelte.dev/) with runes |
| Styling | [TailwindCSS](https://tailwindcss.com/) |
| Charts | [Chart.js 4](https://www.chartjs.org/) |
| Language | TypeScript (strict) |
| Persistence | Local JSON/CSV files via Rust |

No Electron, no web server, no external services. The portable zip is ~18MB.

---

## Building from Source

If you want to build it yourself instead of using the portable release:

### Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [Rust](https://rustup.rs/) 1.70+
- Visual Studio Build Tools (Windows, for C++ compilation)

### Steps

```bash
npm install
npm run tauri dev     # Development with hot reload
npm run tauri build   # Production build
```

> **Note**: The public repo contains source code only. Game data assets (recipe databases, item images, spot icons) are not included due to their origin from game resources. The portable release includes everything you need.

---

## Links

- [Changelog](CHANGELOG.md) — Version history and patch notes
- [User Guide](USER-GUIDE.md) — Installation, first launch, and feature walkthrough
- [GitHub Issues](https://github.com/kurohige/BdoLifeCompanion-Pub/issues) — Bug reports and feature requests

---

## Support

If you find this tool useful, consider supporting development:

[Buy Me a Coffee](https://buymeacoffee.com/jhidalgo_dev)

---

## License

MIT
