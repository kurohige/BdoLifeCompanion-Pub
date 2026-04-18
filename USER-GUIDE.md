# User Guide

---

## Installation

1. **Download** the latest portable release from [GitHub Releases](https://github.com/kurohige/BdoLifeCompanion-Pub/releases)
2. **Extract** the `.zip` to wherever you want (Desktop, a Games folder, wherever)
3. **Run** `BDO Life Companion.exe`

That's it. No installer, no admin rights, no registry changes.

> **Windows SmartScreen**: On first launch, Windows may show a "Windows protected your PC" popup. Click **More info** → **Run anyway**. This happens with any unsigned app — it's not a security issue. You can check the [source code](https://github.com/kurohige/BdoLifeCompanion-Pub) yourself if you want to verify.

---

## Your Data Folder

All your data is saved in a `data/` folder right next to the executable:

```
BDO Life Companion/
├── BDO Life Companion.exe
└── data/
    ├── settings.json             — Your preferences (theme, mastery, region, etc.)
    ├── inventory.csv             — Your item quantities
    ├── crafting_log.json         — Crafting session history
    ├── grinding_log.json         — Grinding session history
    ├── hunting_log.json          — Hunting session history
    ├── planner.json              — Your crafting plans
    ├── treasure_progress.json    — Treasure collection progress
    ├── barter_inventory.json     — Barter item quantities and crow coins
    ├── barter_log.json           — Barter session history
    ├── ship_progress.json        — Carrack upgrade material tracking
    ├── sailor_roster.json        — Your sailors
    ├── weekly_tasks.json         — Weekly task progress (Altar of Blood, etc.)
    └── announcements_cache.json  — Cached app announcements
```

### Good to know

- **Files are created as you use features.** If you've never bartered, there won't be a `barter_log.json` yet.
- **Backup** — Just copy the `data/` folder somewhere safe. To restore, paste it back.
- **Fresh start** — Use Settings > Data > "Clear All Data" to wipe everything (settings are preserved), or delete the `data/` folder manually.
- **Moving the app** — Move the entire folder (exe + data) together. Your data travels with it.
- **Nothing is stored in AppData**, the registry, or anywhere else on your system.

---

## First Launch

When you open the app for the first time:

1. You'll see the **Full mode** with icon-based side navigation
2. The default theme is **Obsidian Dark** — you can switch to Light in Settings
3. Sample dashboard data is included so the charts aren't empty on day one
4. The app starts **always on top** — you can toggle this off in Settings > Display

### Setting Up

Head to **Settings** (gear icon in the side nav) and configure:

- **Server Region** — EU or NA (affects boss timer schedules)
- **Life Skill Ranks** — Your cooking and alchemy ranks (Beginner 1 → Guru 72)
- **Mastery** — Your cooking and alchemy mastery values (0–3000)
- **Barter Level** — Your bartering rank
- **Value Pack** — Toggle if you have an active Value Pack
- **Theme** — Obsidian Dark or Light
- **Transparency** — How see-through the overlay is (useful when gaming)
- **Always on Top** — Toggle whether the window stays above other windows

---

## Navigation

The side navigation has 8 icon buttons, ordered by activity:

<!-- screenshot: side-navigation.png -->

| Icon | Tab | What It Does |
|------|-----|-------------|
| 1 | **Crafting** | Recipe browser, planner, crafting log |
| 2 | **Grinding** | Session tracker, treasure tracker, hunting |
| 3 | **Bartering** | Barter tracker, inventory, ships, parley, sailors |
| 4 | **Inventory** | Item quantity tracking with CSV import/export |
| 5 | **Weekly** | Weekly task tracking (Altar of Blood) |
| 6 | **Dashboard** | Charts and analytics across all activities |
| 7 | **Settings** | Display, notifications, game settings, data management |
| 8 | **About** | App info, developer credit, support links |

---

## Features

### Crafting Tab

The crafting tab has 4 sub-tabs (icon buttons):

**Cooking / Alchemy / Draughts** — Browse and search recipes. Click a recipe to see:
- Full ingredient list with images and quantities
- "Used In" section showing every recipe that uses this item
- Ingredients marked with `[alt]` have alternative substitutes (hover to see them)
- Double-click any ingredient to jump to its recipe

**Planner** — Build a crafting plan:
1. Search for a recipe and add it to your plan
2. The planner builds a dependency tree, checking your inventory
3. Switch between **Tree View** (visual breakdown), **Shopping List** (what to buy), and **Steps** (crafting order)

<!-- screenshot: crafting-planner.png -->

### Inventory Tab

Track how many of each item you have. Search for items by name, click a row to edit its quantity.

- **CSV Import/Export** — Back up your inventory or load it from a spreadsheet
- **Merge** — Import without overwriting, just adds to existing quantities

### Grinding Tab

Three sub-tabs:

**Tracker** — Pick a grinding spot, set a countdown timer, and log loot:
- Search spots by name from 98+ zones
- Set timer presets (1m, 3m, 5m, 10m, 15m, 30m)
- Track individual loot items with quantities
- **Prices** button fetches current Central Market values
- Hit **Log Session** when done to save everything

**Treasures** — Track your progress across 5 treasure collections with checkboxes and hours spent.

**Hunting** — Same as the grinding tracker, but with fields for hunting mastery, matchlock, and butchering knife.

<!-- screenshot: grinding-tracker.png -->

### Bartering Tab

Five sub-tabs:

**Tracker** — Count barters by tier (T1–T7) with +/- and +5/+10 buttons:
- Live activity log shows each barter action with item name
- Your draft form persists across tab switches — log whenever you're ready
- Sales section for T5/Great Ocean/T6/T7 with silver calculations
- Session history grouped by date (Today/Yesterday)

**Inventory** — View and edit quantities for all 123 barter items across 7 tiers, with crow coin balance and total value.

**Ships** — Track material progress toward all 4 Carrack variants with per-stage completion.

**Parley** — Calculate parley costs based on mastery and Value Pack, with route planner for 16+ NPC routes.

**Sailors** — Manage your ship's crew with speed projections at level 10.

<!-- screenshot: barter-tracker.png -->

### Weekly Tasks Tab

Track weekly reset content:

**Altar of Blood** — 21-stage progress tracker:
- Stage progress bar with boss stage highlighting (stages 3/6/9/12/15/18/21)
- AP/DP requirements table for each stage
- First-clear reward checkboxes (persist across weeks)
- Weekly progress auto-resets on Sunday 00:00 UTC

<!-- screenshot: weekly-tasks.png -->

### Dashboard Tab

Your activity analytics with time and activity filters:

- **Summary cards** — Total sessions, time spent, silver earned
- **Charts** — Profit over time, silver/hr, activity breakdown, top items, cumulative silver
- **Time filters** — Today, 7 days, 30 days, All Time
- **Activity filters** — All Activities, Grinding, Hunting, Crafting
- **Export** — Download your logs as CSV or JSON

<!-- screenshot: dashboard.png -->

### Settings Tab

- **Display** — Theme picker, transparency slider, font size, bold text, always-on-top toggle
- **Notifications** — Sound alerts for boss spawns and timer completion
- **Game** — Server region, life skill ranks, cooking/alchemy mastery, barter level, Value Pack
- **Data** — Storage location, statistics, Clear All Data button

### About Tab

- App version and developer credit
- **Buy Me a Coffee** support link
- Source code and bug report links
- Safety statement

---

## View Modes

### Full Mode (560 x 680)
The main interface with all tabs and features. The window is resizable.

### Medium Mode (460 x 150)
A compact dashboard strip showing:
- Active timer countdown with SVG ring
- Next boss spawn with image and countdown
- Game reset timers (daily, weekly, node war)
- Announcement ticker

### Mini Mode (400 x 56)
A thin floating bar showing:
- Next boss spawn with image and countdown
- Active grinding session (if running)
- Announcement ticker (if no session)

All modes support always-on-top (toggleable in Settings) and transparency adjustment.

<!-- screenshot: view-modes.png -->

---

## Tips

- **Boss alerts** play a sound when a boss is about to spawn — toggle in Settings > Notifications
- Your **window position and size** are saved automatically
- The **barter draft** persists across tabs — switch to Inventory and back without losing your session
- Use **Clear All Data** in Settings to remove sample data and start fresh with your own
- The **About tab** pulses with a cyan glow to draw your attention — check it out for support links

---

## Troubleshooting

**App won't start**
- Make sure you extracted the full zip (don't run it from inside the archive)
- Try running as administrator once

**Boss times seem wrong**
- Check your server region in Settings (EU vs NA)
- Boss schedules account for DST automatically

**Data seems lost**
- Check that the `data/` folder is next to the `.exe`
- If you moved just the exe without the data folder, it'll start fresh

**Market prices won't load**
- The app connects to the BDO Central Market API — make sure you have internet
- If the API is down, try again later

**Window won't go behind other apps**
- Toggle off "Always on Top" in Settings > Display

---

## Links

- [Readme](README.md) — Project overview
- [Changelog](CHANGELOG.md) — Version history and patch notes
- [GitHub Issues](https://github.com/kurohige/BdoLifeCompanion-Pub/issues) — Bug reports and feature requests
- [Buy Me a Coffee](https://buymeacoffee.com/jhidalgo_dev) — Support development
