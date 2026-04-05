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
    ├── settings.json           — Your preferences (theme, mastery, region, font, etc.)
    ├── inventory.csv           — Your item quantities
    ├── crafting_log.json       — Crafting session history
    ├── grinding_log.json       — Grinding session history
    ├── hunting_log.json        — Hunting session history
    ├── planner.json            — Your crafting plans
    ├── treasure_progress.json  — Treasure collection progress
    └── announcements_cache.json — Cached app announcements
```

### Good to know

- **Files are created as you use features.** If you've never used the crafting planner, there won't be a `planner.json` yet.
- **Backup** — Just copy the `data/` folder somewhere safe. To restore, paste it back.
- **Fresh start** — Delete the `data/` folder (or individual files) and the app will start clean.
- **Moving the app** — Move the entire folder (exe + data) together. Your data travels with it.
- **Nothing is stored in AppData**, the registry, or anywhere else on your system. Delete the folder and it's gone.

---

## First Launch

When you open the app for the first time:

1. You'll see the **Full mode** with tabbed navigation at the top
2. The default theme is **Neon Cyberpunk** — you can change this in Settings
3. Sample dashboard data is included so the charts aren't empty on day one

### Setting Up

Head to **Settings** (gear tab) and configure:

- **Server Region** — EU or NA (affects boss timer schedules)
- **Life Skill Ranks** — Your cooking and alchemy ranks (Beginner 1 → Guru 72)
- **Mastery** — Your cooking and alchemy mastery values (0–3000)
- **Theme** — Pick your visual style
- **Transparency** — How see-through the overlay is (useful when gaming)

---

## Features at a Glance

### Crafting Tab

The crafting tab has 4 sub-tabs:

**Cooking / Alchemy / Draughts** — Browse and search recipes. Click a recipe to see:
- Full ingredient list with images and quantities
- "Used In" section showing every recipe that uses this item
- Ingredients marked with `[alt]` have alternative substitutes (hover to see them)
- Double-click any ingredient to jump to its recipe
- Edit ingredient quantities directly in the recipe view

**Planner** — Build a crafting plan:
1. Search for a recipe and add it to your plan
2. The planner builds a dependency tree, checking your inventory
3. Switch between **Tree View** (visual breakdown), **Shopping List** (what to buy), and **Steps** (crafting order)

### Inventory Tab

Track how many of each item you have. Search for items by name, click a row to edit its quantity. Your inventory integrates with the crafting planner — when you build a plan, it checks what you already own and only lists what you still need.

- **CSV Import/Export** — Back up your inventory or load it from a spreadsheet
- **Merge** — Import without overwriting, just adds to existing quantities

### Grinding Tab

Three sub-tabs:

**Tracker** — Pick a grinding spot, set a countdown timer, and log loot:
- Search spots by name
- Set timer presets (1m, 3m, 5m, 10m, 15m, 30m) or enter custom times
- Track individual loot items with quantities
- Enter your AP/DP for the session
- **Prices** button fetches current Central Market values for your loot
- Hit **Log Session** when done to save everything

**Treasures** — Track your progress across 5 treasure collections. Each treasure shows its required pieces with checkboxes and hours spent.

**Hunting** — Same as the grinding tracker, but with fields for hunting mastery, matchlock, and butchering knife.

### Dashboard Tab

Your activity analytics:

- **Summary cards** — Total sessions, time spent, and silver earned with period-over-period comparisons
- **Charts** — Profit over time, silver/hr, activity breakdown, top items, cumulative silver
- **Time filters** — Today, 7 days, 30 days, All Time
- **Activity filters** — All Activities, Grinding, Hunting, Crafting
- **Session list** — Expandable log of all your sessions with details

### Settings Tab

Organized into sections:

- **Display** — Theme picker, transparency slider, font customization
- **Game** — Server region, life skill ranks, cooking/alchemy mastery
- **Notifications** — Sound alerts for boss spawns and timers
- **Data** — Import/export options
- **About** — App version and links

---

## View Modes

Click the logo in the top-left corner to cycle between modes:

### Full Mode (560 x 680)
The main interface with all tabs and features. The window is resizable.

### Medium Mode (560 x 170)
A compact horizontal strip showing:
- Active timer countdown
- Next boss spawn
- Game reset timers
- Loot summary (if grinding/hunting)
- Announcements

### Mini Mode (180 x 260)
A tiny floating widget that shows different content depending on what you were last doing:
- **Grinding/Hunting tab active** → Shows your session timer and spot
- **Crafting tab active** → Shows your current recipe
- **Default** → Shows next boss spawn with image and countdown

All modes stay on top of other windows and support transparency adjustment.

---

## Tips

- **Boss alerts** play a sound when a boss is about to spawn — toggle this in Settings > Notifications
- The **Medium mode** reset timers expand on hover to show all countdowns
- Your **window position and size** are saved automatically — the app opens right where you left it
- The dashboard **sample data** can be cleared by deleting the sample files from `data/` — your real sessions will replace them as you play

---

## Troubleshooting

**App won't start**
- Make sure you extracted the full zip (don't run it from inside the archive)
- Try running as administrator once — it shouldn't need it, but some systems are picky

**Boss times seem wrong**
- Check your server region in Settings (EU vs NA)
- Boss schedules account for DST automatically

**Data seems lost**
- Check that the `data/` folder is next to the `.exe`
- If you moved just the exe without the data folder, it'll start fresh

**Market prices won't load**
- The app connects to the BDO Central Market API — make sure you have internet access
- If the API is down (maintenance, etc.), try again later

---

## Links

- [Readme](README.md) — Project overview
- [Changelog](CHANGELOG.md) — Version history and patch notes
- [GitHub Issues](https://github.com/kurohige/BdoLifeCompanion-Pub/issues) — Bug reports and feature requests
- Discord — *Coming soon*
