use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Emitter;

pub mod diagnostic;
pub mod loot;

/// Get the app data directory path (portable - next to executable)
fn get_app_data_dir() -> PathBuf {
    // Try to get the executable's directory for portable mode
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            let data_dir = exe_dir.join("data");
            return data_dir;
        }
    }
    // Fallback to current directory
    PathBuf::from(".").join("data")
}

/// Ensure app data directory exists
fn ensure_app_data_dir() -> Result<PathBuf, String> {
    let dir = get_app_data_dir();
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| format!("Failed to create app data dir: {}", e))?;
    }
    Ok(dir)
}

/// Load a JSON file with corrupt-file recovery. If the file is missing, returns the
/// default. If present but unparseable, renames it to `<name>.corrupt-<unix-ts>` and
/// returns the default instead of failing — matches the v2.5.2 settings recovery pattern.
fn load_json_with_recovery<T, F>(path: &Path, label: &str, default: F) -> Result<T, String>
where
    T: serde::de::DeserializeOwned,
    F: FnOnce() -> T,
{
    if !path.exists() {
        return Ok(default());
    }

    let content =
        fs::read_to_string(path).map_err(|e| format!("Failed to read {}: {}", label, e))?;

    match serde_json::from_str::<T>(&content) {
        Ok(data) => Ok(data),
        Err(e) => {
            let ts = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0);
            let file_name = path.file_name().and_then(|n| n.to_str()).unwrap_or(label);
            let parent = path.parent().unwrap_or_else(|| Path::new("."));
            let backup = parent.join(format!("{}.corrupt-{}", file_name, ts));
            if let Err(re) = fs::rename(path, &backup) {
                eprintln!("Failed to back up corrupt {}: {}", label, re);
            }
            eprintln!(
                "Failed to parse {} ({}); moved to {} and loaded defaults.",
                label,
                e,
                backup.display()
            );
            Ok(default())
        }
    }
}

// ============== Inventory Commands ==============

#[derive(Serialize, Deserialize, Clone)]
pub struct InventoryItem {
    pub item_id: String,
    pub quantity: i32,
}

/// Load inventory from CSV file
#[tauri::command]
fn load_inventory() -> Result<Vec<InventoryItem>, String> {
    let dir = ensure_app_data_dir()?;
    let path = dir.join("inventory.csv");

    if !path.exists() {
        return Ok(Vec::new());
    }

    let mut items = Vec::new();
    let mut reader = csv::Reader::from_path(&path)
        .map_err(|e| format!("Failed to open inventory file: {}", e))?;

    for result in reader.records() {
        let record = result.map_err(|e| format!("Failed to read record: {}", e))?;
        if record.len() >= 2 {
            let item_id = record.get(0).unwrap_or("").to_string();
            let quantity: i32 = record.get(1).unwrap_or("0").parse().unwrap_or(0);

            if !item_id.is_empty() && quantity > 0 {
                items.push(InventoryItem { item_id, quantity });
            }
        }
    }

    Ok(items)
}

/// Save inventory to CSV file
#[tauri::command]
fn save_inventory(items: Vec<InventoryItem>) -> Result<(), String> {
    let dir = ensure_app_data_dir()?;
    let path = dir.join("inventory.csv");

    let mut writer = csv::Writer::from_path(&path)
        .map_err(|e| format!("Failed to create inventory file: {}", e))?;

    writer
        .write_record(["ItemId", "Quantity"])
        .map_err(|e| format!("Failed to write header: {}", e))?;

    for item in items {
        if item.quantity > 0 {
            writer
                .write_record([&item.item_id, &item.quantity.to_string()])
                .map_err(|e| format!("Failed to write record: {}", e))?;
        }
    }

    writer
        .flush()
        .map_err(|e| format!("Failed to flush: {}", e))?;
    Ok(())
}

// ============== Settings Commands ==============

// KEEP IN SYNC with `DEFAULT_SETTINGS.window_state` in
// tauri-svelte/src/lib/services/persistence.ts.
#[derive(Serialize, Deserialize, Clone)]
pub struct WindowState {
    pub width: u32,
    pub height: u32,
    pub x: Option<i32>,
    pub y: Option<i32>,
    pub view_mode: String,
}

impl Default for WindowState {
    fn default() -> Self {
        WindowState {
            width: 560,
            height: 680,
            x: None,
            y: None,
            view_mode: "full".to_string(),
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Default)]
pub struct AppSettings {
    #[serde(default = "default_transparency")]
    pub transparency: f64,
    #[serde(default)]
    pub cooking_total_mastery: i32,
    #[serde(default)]
    pub alchemy_total_mastery: i32,
    #[serde(default = "default_region")]
    pub server_region: String,
    #[serde(default)]
    pub market_region: String,
    #[serde(default)]
    pub favorites: Vec<String>,
    #[serde(default)]
    pub window_state: WindowState,
    #[serde(default = "default_true")]
    pub boss_sound_enabled: bool,
    #[serde(default = "default_true")]
    pub timer_sound_enabled: bool,
    #[serde(default = "default_boss_alert_minutes")]
    pub boss_alert_minutes: i32,
    /// Basename of the user-imported boss alert sound (e.g. `boss_alert_sound.mp3`)
    /// living in the app data dir. Empty string = use the built-in synth beep.
    #[serde(default)]
    pub boss_sound_custom_name: String,
    #[serde(default = "default_font_family")]
    pub font_family: String,
    #[serde(default)]
    pub font_bold: bool,
    #[serde(default = "default_font_size")]
    pub font_size: String,
    #[serde(default)]
    pub barter_level: String,
    #[serde(default)]
    pub has_value_pack: bool,
    #[serde(default = "default_true")]
    pub always_on_top: bool,
    #[serde(default)]
    pub hidden_bosses: Vec<String>,
    #[serde(default = "default_true")]
    pub mini_show_clocks: bool,
    #[serde(default = "default_true")]
    pub clock_format_24h: bool,
    #[serde(default = "default_locale")]
    pub locale: String,
    /// Scratchpad floating panel — open state persists across launches.
    #[serde(default = "default_true")]
    pub scratchpad_open: bool,
    /// Scratchpad dragged position (window-space px); None = default corner.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scratchpad_pos: Option<ScratchpadPos>,
    /// Scratchpad detached into its own OS window (default since v2.8.2).
    #[serde(default = "default_true")]
    pub scratchpad_detached: bool,
    /// One-time v2.8.2 detached-by-default migration marker. Deliberately
    /// plain `default` (false): a settings.json written before the field
    /// existed triggers the TS-side flip exactly once.
    #[serde(default)]
    pub scratchpad_default_migrated: bool,
    /// Detached scratchpad window bounds in physical px; None = default placement.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scratchpad_win: Option<ScratchpadWin>,
    /// Note editor window bounds in physical px; None = default placement.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub note_win: Option<ScratchpadWin>,
    /// Id of the note the single editor window holds; None = editor closed.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub note_editing_id: Option<String>,
    /// Layout preferences (Parchment 7.3): status-strip slot ("top"/"bottom"/"hidden"),
    /// which crafting module leads ("list"/"detail"), crafting density
    /// ("comfortable"/"compact"), panel toggles, and full-window UI scale (%).
    #[serde(default = "default_strip_slot")]
    pub strip_slot: String,
    #[serde(default = "default_crafting_lead")]
    pub crafting_lead: String,
    #[serde(default = "default_crafting_density")]
    pub crafting_density: String,
    #[serde(default = "default_true")]
    pub show_last_kill: bool,
    #[serde(default = "default_true")]
    pub show_used_in: bool,
    #[serde(default = "default_ui_scale")]
    pub ui_scale: u32,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct ScratchpadPos {
    pub x: f64,
    pub y: f64,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct ScratchpadWin {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

fn default_true() -> bool {
    true
}

fn default_strip_slot() -> String {
    "top".to_string()
}

fn default_crafting_lead() -> String {
    "list".to_string()
}

fn default_crafting_density() -> String {
    "comfortable".to_string()
}

fn default_ui_scale() -> u32 {
    100
}

fn default_boss_alert_minutes() -> i32 {
    5
}

fn default_transparency() -> f64 {
    0.9
}

fn default_region() -> String {
    "NA".to_string()
}

fn default_font_family() -> String {
    "system".to_string()
}

fn default_font_size() -> String {
    "default".to_string()
}

/// Empty string marks "never set yet" — TS-side `initSettings` detects this on
/// first launch and applies the system locale (or falls back to "en"). Once
/// resolved it gets saved back, so the empty branch only fires once per install.
fn default_locale() -> String {
    String::new()
}

/// Build an AppSettings via serde so `#[serde(default = "...")]` annotations
/// run. `AppSettings::default()` (from `#[derive(Default)]`) ignores those and
/// would yield `false` for every default-true bool — so a fresh install would
/// have animations/clocks/always-on-top off until the user discovered the
/// toggles. Going through `from_str("{}")` makes every field follow its serde
/// default.
fn defaulted_app_settings() -> AppSettings {
    serde_json::from_str("{}").unwrap_or_default()
}

/// Load settings from JSON file.
///
/// On parse failure, renames the bad file to `settings.json.corrupt-<unix-ts>`
/// and returns defaults. This way a malformed settings file can never brick
/// the app — the user gets a clean boot and the bad file is preserved for
/// inspection.
#[tauri::command]
fn load_settings() -> Result<AppSettings, String> {
    let dir = ensure_app_data_dir()?;
    let path = dir.join("settings.json");

    if !path.exists() {
        return Ok(defaulted_app_settings());
    }

    let content = match fs::read_to_string(&path) {
        Ok(c) => c,
        Err(e) => return Err(format!("Failed to read settings: {}", e)),
    };

    match serde_json::from_str::<AppSettings>(&content) {
        Ok(settings) => Ok(settings),
        Err(e) => {
            let ts = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0);
            let backup = dir.join(format!("settings.json.corrupt-{}", ts));
            if let Err(re) = fs::rename(&path, &backup) {
                eprintln!("Failed to back up corrupt settings: {}", re);
            }
            eprintln!(
                "Failed to parse settings.json ({}); moved to {} and loaded defaults.",
                e,
                backup.display()
            );
            Ok(defaulted_app_settings())
        }
    }
}

/// Save settings to JSON file
#[tauri::command]
fn save_settings(settings: AppSettings) -> Result<(), String> {
    let dir = ensure_app_data_dir()?;
    let path = dir.join("settings.json");

    let content = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;

    fs::write(&path, content).map_err(|e| format!("Failed to write settings: {}", e))?;

    Ok(())
}

/// Get app data directory path
#[tauri::command]
fn get_data_path() -> Result<String, String> {
    let dir = ensure_app_data_dir()?;
    Ok(dir.to_string_lossy().to_string())
}

// ============== Crafting Log Commands ==============

#[derive(Serialize, Deserialize, Clone)]
pub struct CraftingSession {
    pub id: String,
    pub timestamp: String,
    #[serde(rename = "recipeId")]
    pub recipe_id: String,
    #[serde(rename = "recipeName")]
    pub recipe_name: String,
    pub category: String,
    pub mastery: i32,
    pub crafted: i32,
    pub yielded: i32,
    #[serde(rename = "canCraft")]
    pub can_craft: i32,
    #[serde(
        rename = "silverEarned",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub silver_earned: Option<i64>,
}

/// Load crafting log from JSON file
#[tauri::command]
fn load_crafting_log() -> Result<Vec<CraftingSession>, String> {
    let dir = ensure_app_data_dir()?;
    let path = dir.join("crafting_log.json");
    load_json_with_recovery(&path, "crafting log", Vec::new)
}

/// Save crafting log to JSON file
#[tauri::command]
fn save_crafting_log(sessions: Vec<CraftingSession>) -> Result<(), String> {
    let dir = ensure_app_data_dir()?;
    let path = dir.join("crafting_log.json");

    let content = serde_json::to_string_pretty(&sessions)
        .map_err(|e| format!("Failed to serialize crafting log: {}", e))?;

    fs::write(&path, content).map_err(|e| format!("Failed to write crafting log: {}", e))?;

    Ok(())
}

// ============== Grinding Log Commands ==============

#[derive(Serialize, Deserialize, Clone)]
pub struct GrindingLootItem {
    #[serde(rename = "itemId")]
    pub item_id: String,
    #[serde(rename = "itemName")]
    pub item_name: String,
    pub count: i32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub value: Option<i32>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct GrindingSession {
    pub id: String,
    pub timestamp: String,
    #[serde(rename = "spotId")]
    pub spot_id: String,
    #[serde(rename = "spotName")]
    pub spot_name: String,
    #[serde(rename = "durationSeconds")]
    pub duration_seconds: i64,
    pub loot: Vec<GrindingLootItem>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ap: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub dp: Option<i32>,
}

/// Load grinding log from JSON file
#[tauri::command]
fn load_grinding_log() -> Result<Vec<GrindingSession>, String> {
    let dir = ensure_app_data_dir()?;
    let path = dir.join("grinding_log.json");
    load_json_with_recovery(&path, "grinding log", Vec::new)
}

/// Save grinding log to JSON file
#[tauri::command]
fn save_grinding_log(sessions: Vec<GrindingSession>) -> Result<(), String> {
    let dir = ensure_app_data_dir()?;
    let path = dir.join("grinding_log.json");

    let content = serde_json::to_string_pretty(&sessions)
        .map_err(|e| format!("Failed to serialize grinding log: {}", e))?;

    fs::write(&path, content).map_err(|e| format!("Failed to write grinding log: {}", e))?;

    Ok(())
}

// ============== Planner Commands ==============

#[derive(Serialize, Deserialize, Clone)]
pub struct CraftingPlan {
    pub id: String,
    #[serde(rename = "goalRecipeId")]
    pub goal_recipe_id: String,
    #[serde(rename = "goalRecipeName")]
    pub goal_recipe_name: String,
    #[serde(rename = "goalCategory")]
    pub goal_category: String,
    #[serde(rename = "goalQuantity")]
    pub goal_quantity: i32,
    #[serde(rename = "completedSteps")]
    pub completed_steps: Vec<String>,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    #[serde(rename = "updatedAt")]
    pub updated_at: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct PlannerData {
    pub plans: Vec<CraftingPlan>,
    #[serde(rename = "activePlanId")]
    pub active_plan_id: Option<String>,
}

/// Load planner data from JSON file (backward compat: plain array → PlannerData)
#[tauri::command]
fn load_planner() -> Result<PlannerData, String> {
    let dir = ensure_app_data_dir()?;
    let path = dir.join("planner.json");

    let default = || PlannerData {
        plans: Vec::new(),
        active_plan_id: None,
    };

    if !path.exists() {
        return Ok(default());
    }

    let content =
        fs::read_to_string(&path).map_err(|e| format!("Failed to read planner: {}", e))?;

    // Try new format first (PlannerData with activePlanId)
    if let Ok(data) = serde_json::from_str::<PlannerData>(&content) {
        return Ok(data);
    }

    // Fallback: old format was a plain array of plans
    if let Ok(plans) = serde_json::from_str::<Vec<CraftingPlan>>(&content) {
        return Ok(PlannerData {
            plans,
            active_plan_id: None,
        });
    }

    // Neither format parsed — treat as corrupt and recover (matches v2.5.2 pattern).
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let backup = dir.join(format!("planner.json.corrupt-{}", ts));
    if let Err(re) = fs::rename(&path, &backup) {
        eprintln!("Failed to back up corrupt planner: {}", re);
    }
    eprintln!(
        "Failed to parse planner (no known format matched); moved to {} and loaded defaults.",
        backup.display()
    );
    Ok(default())
}

/// Save planner data to JSON file
#[tauri::command]
fn save_planner(plans: Vec<CraftingPlan>, active_plan_id: Option<String>) -> Result<(), String> {
    let dir = ensure_app_data_dir()?;
    let path = dir.join("planner.json");

    let data = PlannerData {
        plans,
        active_plan_id,
    };

    let content = serde_json::to_string_pretty(&data)
        .map_err(|e| format!("Failed to serialize planner: {}", e))?;

    fs::write(&path, content).map_err(|e| format!("Failed to write planner: {}", e))?;

    Ok(())
}

// ============== Craft Queue Commands ==============

#[derive(Serialize, Deserialize, Clone)]
pub struct CraftQueueBatch {
    pub id: String,
    #[serde(rename = "recipeId")]
    pub recipe_id: String,
    #[serde(rename = "recipeName")]
    pub recipe_name: String,
    pub category: String,
    pub quantity: i32,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct CraftQueueData {
    #[serde(default)]
    pub batches: Vec<CraftQueueBatch>,
    #[serde(rename = "secPerCraft", default = "default_sec_per_craft")]
    pub sec_per_craft: f64,
}

fn default_sec_per_craft() -> f64 {
    10.0
}

/// Load the craft queue from JSON file
#[tauri::command]
fn load_craft_queue() -> Result<CraftQueueData, String> {
    let dir = ensure_app_data_dir()?;
    let path = dir.join("craft_queue.json");

    let default = || CraftQueueData {
        batches: Vec::new(),
        sec_per_craft: default_sec_per_craft(),
    };

    if !path.exists() {
        return Ok(default());
    }

    let content =
        fs::read_to_string(&path).map_err(|e| format!("Failed to read craft queue: {}", e))?;

    if let Ok(data) = serde_json::from_str::<CraftQueueData>(&content) {
        return Ok(data);
    }

    // Corrupt — back up and recover with defaults (matches the planner pattern).
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let backup = dir.join(format!("craft_queue.json.corrupt-{}", ts));
    if let Err(re) = fs::rename(&path, &backup) {
        eprintln!("Failed to back up corrupt craft queue: {}", re);
    }
    eprintln!(
        "Failed to parse craft queue; moved to {} and loaded defaults.",
        backup.display()
    );
    Ok(default())
}

/// Save the craft queue to JSON file
#[tauri::command]
fn save_craft_queue(batches: Vec<CraftQueueBatch>, sec_per_craft: f64) -> Result<(), String> {
    let dir = ensure_app_data_dir()?;
    let path = dir.join("craft_queue.json");

    let data = CraftQueueData {
        batches,
        sec_per_craft,
    };

    let content = serde_json::to_string_pretty(&data)
        .map_err(|e| format!("Failed to serialize craft queue: {}", e))?;

    fs::write(&path, content).map_err(|e| format!("Failed to write craft queue: {}", e))?;

    Ok(())
}

// ============== Treasure Progress Commands ==============

#[derive(Serialize, Deserialize, Clone)]
pub struct PieceProgress {
    #[serde(rename = "pieceId")]
    pub piece_id: String,
    #[serde(rename = "treasureId")]
    pub treasure_id: String,
    #[serde(rename = "hoursSpent")]
    pub hours_spent: f64,
    pub obtained: bool,
    #[serde(
        rename = "obtainedDate",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub obtained_date: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct TreasureProgressData {
    pub pieces: Vec<PieceProgress>,
}

/// Load treasure progress from JSON file
#[tauri::command]
fn load_treasure_progress() -> Result<TreasureProgressData, String> {
    let dir = ensure_app_data_dir()?;
    let path = dir.join("treasure_progress.json");
    load_json_with_recovery(&path, "treasure progress", || TreasureProgressData {
        pieces: Vec::new(),
    })
}

/// Save treasure progress to JSON file
#[tauri::command]
fn save_treasure_progress(data: TreasureProgressData) -> Result<(), String> {
    let dir = ensure_app_data_dir()?;
    let path = dir.join("treasure_progress.json");

    let content = serde_json::to_string_pretty(&data)
        .map_err(|e| format!("Failed to serialize treasure progress: {}", e))?;

    fs::write(&path, content).map_err(|e| format!("Failed to write treasure progress: {}", e))?;

    Ok(())
}

// ============== Hunting Log Commands ==============

#[derive(Serialize, Deserialize, Clone)]
pub struct HuntingLootItem {
    #[serde(rename = "itemId")]
    pub item_id: String,
    #[serde(rename = "itemName")]
    pub item_name: String,
    pub count: i32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub value: Option<i32>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct HuntingSession {
    pub id: String,
    pub timestamp: String,
    #[serde(rename = "spotId")]
    pub spot_id: String,
    #[serde(rename = "spotName")]
    pub spot_name: String,
    #[serde(rename = "durationSeconds")]
    pub duration_seconds: i64,
    pub loot: Vec<HuntingLootItem>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mastery: Option<i32>,
    #[serde(
        rename = "matchlockTier",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub matchlock_tier: Option<String>,
    #[serde(
        rename = "butcheringKnife",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub butchering_knife: Option<String>,
}

/// Load hunting log from JSON file
#[tauri::command]
fn load_hunting_log() -> Result<Vec<HuntingSession>, String> {
    let dir = ensure_app_data_dir()?;
    let path = dir.join("hunting_log.json");
    load_json_with_recovery(&path, "hunting log", Vec::new)
}

/// Save hunting log to JSON file
#[tauri::command]
fn save_hunting_log(sessions: Vec<HuntingSession>) -> Result<(), String> {
    let dir = ensure_app_data_dir()?;
    let path = dir.join("hunting_log.json");

    let content = serde_json::to_string_pretty(&sessions)
        .map_err(|e| format!("Failed to serialize hunting log: {}", e))?;

    fs::write(&path, content).map_err(|e| format!("Failed to write hunting log: {}", e))?;

    Ok(())
}

// ============== Bartering Commands ==============

#[derive(Serialize, Deserialize, Clone)]
pub struct BarterInventoryData {
    #[serde(default)]
    pub items: std::collections::HashMap<String, i32>,
    #[serde(rename = "crowCoins", default)]
    pub crow_coins: i32,
    #[serde(rename = "lastUpdated", default)]
    pub last_updated: String,
}

/// Load barter inventory from JSON file
#[tauri::command]
fn load_barter_inventory() -> Result<BarterInventoryData, String> {
    let dir = ensure_app_data_dir()?;
    let path = dir.join("barter_inventory.json");
    load_json_with_recovery(&path, "barter inventory", || BarterInventoryData {
        items: std::collections::HashMap::new(),
        crow_coins: 0,
        last_updated: String::new(),
    })
}

/// Save barter inventory to JSON file
#[tauri::command]
fn save_barter_inventory(data: BarterInventoryData) -> Result<(), String> {
    let dir = ensure_app_data_dir()?;
    let path = dir.join("barter_inventory.json");

    let content = serde_json::to_string_pretty(&data)
        .map_err(|e| format!("Failed to serialize barter inventory: {}", e))?;

    fs::write(&path, content).map_err(|e| format!("Failed to write barter inventory: {}", e))?;

    Ok(())
}

#[derive(Serialize, Deserialize, Clone)]
pub struct BarterSessionEntry {
    pub id: String,
    pub date: String,
    pub timestamp: String,
    #[serde(rename = "barterLevel")]
    pub barter_level: String,
    #[serde(rename = "hasValuePack")]
    pub has_value_pack: bool,
    #[serde(rename = "parleyBudget")]
    pub parley_budget: i64,
    #[serde(rename = "parleySpent")]
    pub parley_spent: i64,
    #[serde(rename = "totalBarters")]
    pub total_barters: i32,
    #[serde(rename = "refreshesUsed")]
    pub refreshes_used: i32,
    #[serde(rename = "t1Barters", default, skip_serializing_if = "Option::is_none")]
    pub t1_barters: Option<i32>,
    #[serde(rename = "t2Barters", default, skip_serializing_if = "Option::is_none")]
    pub t2_barters: Option<i32>,
    #[serde(rename = "t3Barters", default, skip_serializing_if = "Option::is_none")]
    pub t3_barters: Option<i32>,
    #[serde(rename = "t4Barters", default, skip_serializing_if = "Option::is_none")]
    pub t4_barters: Option<i32>,
    #[serde(rename = "t5Barters", default, skip_serializing_if = "Option::is_none")]
    pub t5_barters: Option<i32>,
    #[serde(rename = "t6Barters", default, skip_serializing_if = "Option::is_none")]
    pub t6_barters: Option<i32>,
    #[serde(rename = "t7Barters", default, skip_serializing_if = "Option::is_none")]
    pub t7_barters: Option<i32>,
    #[serde(rename = "t5Sold")]
    pub t5_sold: i32,
    #[serde(rename = "t5SoldMargoria")]
    pub t5_sold_margoria: i32,
    #[serde(rename = "t6Sold", default)]
    pub t6_sold: i32,
    #[serde(rename = "t7Sold", default)]
    pub t7_sold: i32,
    #[serde(rename = "crowCoinsEarned")]
    pub crow_coins_earned: i32,
    #[serde(rename = "silverEarned")]
    pub silver_earned: i64,
    #[serde(rename = "silverInvested")]
    pub silver_invested: i64,
    #[serde(rename = "netProfit")]
    pub net_profit: i64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
}

/// Load barter log from JSON file
#[tauri::command]
fn load_barter_log() -> Result<Vec<BarterSessionEntry>, String> {
    let dir = ensure_app_data_dir()?;
    let path = dir.join("barter_log.json");
    load_json_with_recovery(&path, "barter log", Vec::new)
}

/// Save barter log to JSON file
#[tauri::command]
fn save_barter_log(sessions: Vec<BarterSessionEntry>) -> Result<(), String> {
    let dir = ensure_app_data_dir()?;
    let path = dir.join("barter_log.json");

    let content = serde_json::to_string_pretty(&sessions)
        .map_err(|e| format!("Failed to serialize barter log: {}", e))?;

    fs::write(&path, content).map_err(|e| format!("Failed to write barter log: {}", e))?;

    Ok(())
}

// ============== Bartering Routes Commands (Routes/Logs feature) ==============

#[derive(Serialize, Deserialize, Clone)]
pub struct TradeEntry {
    pub id: String,
    pub ts: i64,
    #[serde(rename = "nodeId")]
    pub node_id: String,
    #[serde(rename = "receiveName")]
    pub receive_name: String,
    #[serde(rename = "receiveTier")]
    pub receive_tier: i32,
    #[serde(rename = "receiveSp", default, skip_serializing_if = "Option::is_none")]
    pub receive_sp: Option<bool>,
    pub qty: i32,
    #[serde(rename = "silverPerUnit")]
    pub silver_per_unit: i64,
    #[serde(rename = "giveText", default, skip_serializing_if = "Option::is_none")]
    pub give_text: Option<String>,
    #[serde(
        rename = "receiveItemId",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub receive_item_id: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct RouteSessionData {
    pub id: String,
    #[serde(rename = "startedAt")]
    pub started_at: i64,
    #[serde(default)]
    pub trades: Vec<TradeEntry>,
    #[serde(rename = "parleyMax")]
    pub parley_max: i64,
    #[serde(rename = "parleyRefilled", default)]
    pub parley_refilled: i64,
    #[serde(rename = "barterLevelAtStart")]
    pub barter_level_at_start: String,
    #[serde(rename = "hasValuePackAtStart", default)]
    pub has_value_pack_at_start: bool,
    #[serde(rename = "pausedMs", default)]
    pub paused_ms: i64,
    #[serde(rename = "pausedAt", default)]
    pub paused_at: Option<i64>,
}

/// Load the in-progress route session, or null if none exists
#[tauri::command]
fn load_barter_route_current() -> Result<Option<RouteSessionData>, String> {
    let dir = ensure_app_data_dir()?;
    let path = dir.join("barter_route_current.json");
    load_json_with_recovery(&path, "current route", || None)
}

/// Save (or clear with `null`) the in-progress route session
#[tauri::command]
fn save_barter_route_current(data: Option<RouteSessionData>) -> Result<(), String> {
    let dir = ensure_app_data_dir()?;
    let path = dir.join("barter_route_current.json");

    let content = serde_json::to_string_pretty(&data)
        .map_err(|e| format!("Failed to serialize current route: {}", e))?;

    fs::write(&path, content).map_err(|e| format!("Failed to write current route: {}", e))?;

    Ok(())
}

#[derive(Serialize, Deserialize, Clone)]
pub struct RouteLogEntry {
    pub id: String,
    pub date: String,
    #[serde(rename = "startedAt")]
    pub started_at: i64,
    #[serde(rename = "endedAt")]
    pub ended_at: i64,
    #[serde(rename = "durationSeconds")]
    pub duration_seconds: i64,
    #[serde(default)]
    pub trades: Vec<TradeEntry>,
    #[serde(rename = "totalSilver")]
    pub total_silver: i64,
    #[serde(rename = "totalQty")]
    pub total_qty: i32,
    #[serde(rename = "visitedNodeIds", default)]
    pub visited_node_ids: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(rename = "parleyMax")]
    pub parley_max: i64,
    #[serde(rename = "parleySpent")]
    pub parley_spent: i64,
    #[serde(rename = "parleyRefilled", default)]
    pub parley_refilled: i64,
    #[serde(rename = "barterLevelAtStart")]
    pub barter_level_at_start: String,
    #[serde(rename = "hasValuePackAtStart", default)]
    pub has_value_pack_at_start: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub legacy: Option<bool>,
}

#[tauri::command]
fn load_barter_route_log() -> Result<Vec<RouteLogEntry>, String> {
    let dir = ensure_app_data_dir()?;
    let path = dir.join("barter_route_log.json");
    load_json_with_recovery(&path, "route log", Vec::new)
}

#[tauri::command]
fn save_barter_route_log(logs: Vec<RouteLogEntry>) -> Result<(), String> {
    let dir = ensure_app_data_dir()?;
    let path = dir.join("barter_route_log.json");

    let content = serde_json::to_string_pretty(&logs)
        .map_err(|e| format!("Failed to serialize route log: {}", e))?;

    fs::write(&path, content).map_err(|e| format!("Failed to write route log: {}", e))?;

    Ok(())
}

#[derive(Serialize, Deserialize, Clone)]
pub struct PositionOverride {
    pub x: f64,
    pub y: f64,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct CustomNodeData {
    pub id: String,
    pub name: String,
    pub tier: i32,
    pub region: String,
    pub x: f64,
    pub y: f64,
    #[serde(rename = "parleyCostKey")]
    pub parley_cost_key: String,
    #[serde(default = "default_true")]
    pub custom: bool,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct BarterMapLayoutData {
    #[serde(
        rename = "schemaVersion",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub schema_version: Option<u32>,
    #[serde(rename = "positionOverrides", default)]
    pub position_overrides: std::collections::HashMap<String, PositionOverride>,
    #[serde(rename = "customNodes", default)]
    pub custom_nodes: Vec<CustomNodeData>,
}

#[tauri::command]
fn load_barter_map_layout() -> Result<BarterMapLayoutData, String> {
    let dir = ensure_app_data_dir()?;
    let path = dir.join("barter_map_layout.json");
    load_json_with_recovery(&path, "map layout", || BarterMapLayoutData {
        schema_version: None,
        position_overrides: std::collections::HashMap::new(),
        custom_nodes: Vec::new(),
    })
}

#[tauri::command]
fn save_barter_map_layout(data: BarterMapLayoutData) -> Result<(), String> {
    let dir = ensure_app_data_dir()?;
    let path = dir.join("barter_map_layout.json");

    let content = serde_json::to_string_pretty(&data)
        .map_err(|e| format!("Failed to serialize map layout: {}", e))?;

    fs::write(&path, content).map_err(|e| format!("Failed to write map layout: {}", e))?;

    Ok(())
}

/// One-shot migration: if the legacy barter_log.json still exists, return its
/// contents to the frontend (which folds them into the new route log) and
/// rename the file to barter_log.legacy.json so it's never read again. Returns
/// None if the file is already migrated or never existed.
#[tauri::command]
fn migrate_legacy_barter_log() -> Result<Option<Vec<BarterSessionEntry>>, String> {
    let dir = ensure_app_data_dir()?;
    let path = dir.join("barter_log.json");
    if !path.exists() {
        return Ok(None);
    }
    let content = match fs::read_to_string(&path) {
        Ok(c) => c,
        Err(e) => return Err(format!("Failed to read legacy barter log: {}", e)),
    };
    let sessions: Vec<BarterSessionEntry> = match serde_json::from_str(&content) {
        Ok(v) => v,
        Err(e) => {
            // Corrupt file — back it up and skip migration so the user isn't blocked
            let backup = dir.join("barter_log.json.corrupt-migration");
            let _ = fs::rename(&path, &backup);
            eprintln!("Legacy barter log unparseable ({}); backed up.", e);
            return Ok(None);
        }
    };
    // Rename so we never re-read the legacy file
    let archive = dir.join("barter_log.legacy.json");
    fs::rename(&path, &archive)
        .map_err(|e| format!("Failed to archive legacy barter log: {}", e))?;
    Ok(Some(sessions))
}

// ============== Ship Progress Commands ==============

#[derive(Serialize, Deserialize, Clone)]
pub struct ShipProgressEntry {
    pub variant: String,
    #[serde(default)]
    pub materials: std::collections::HashMap<String, i32>,
    #[serde(rename = "completedStages", default)]
    pub completed_stages: std::collections::HashMap<String, bool>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct ShipProgressData {
    #[serde(default)]
    pub paths: Vec<ShipProgressEntry>,
    /// Raw crafting-ingredient counts (Lyngbakr's Bone, Starlight Hardener, ...).
    /// Deliberately NOT per-path: the player has one pile of each, and every
    /// Carrack variant draws from it. Keyed by recipe ingredient id.
    #[serde(default)]
    pub ingredients: std::collections::HashMap<String, i32>,
}

/// Load ship progress from JSON file
#[tauri::command]
fn load_ship_progress() -> Result<ShipProgressData, String> {
    let dir = ensure_app_data_dir()?;
    let path = dir.join("ship_progress.json");
    load_json_with_recovery(&path, "ship progress", || ShipProgressData {
        paths: Vec::new(),
        ingredients: std::collections::HashMap::new(),
    })
}

/// Save ship progress to JSON file
#[tauri::command]
fn save_ship_progress(data: ShipProgressData) -> Result<(), String> {
    let dir = ensure_app_data_dir()?;
    let path = dir.join("ship_progress.json");

    let content = serde_json::to_string_pretty(&data)
        .map_err(|e| format!("Failed to serialize ship progress: {}", e))?;

    fs::write(&path, content).map_err(|e| format!("Failed to write ship progress: {}", e))?;

    Ok(())
}

// ============== Sailor Roster Commands ==============

#[derive(Serialize, Deserialize, Clone)]
pub struct SailorEntry {
    pub id: String,
    pub name: String,
    pub level: i32,
    pub speed: f64,
    pub status: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct SailorRosterData {
    #[serde(default)]
    pub sailors: Vec<SailorEntry>,
}

/// Load sailor roster from JSON file
#[tauri::command]
fn load_sailor_roster() -> Result<SailorRosterData, String> {
    let dir = ensure_app_data_dir()?;
    let path = dir.join("sailor_roster.json");
    load_json_with_recovery(&path, "sailor roster", || SailorRosterData {
        sailors: Vec::new(),
    })
}

/// Save sailor roster to JSON file
#[tauri::command]
fn save_sailor_roster(data: SailorRosterData) -> Result<(), String> {
    let dir = ensure_app_data_dir()?;
    let path = dir.join("sailor_roster.json");

    let content = serde_json::to_string_pretty(&data)
        .map_err(|e| format!("Failed to serialize sailor roster: {}", e))?;

    fs::write(&path, content).map_err(|e| format!("Failed to write sailor roster: {}", e))?;

    Ok(())
}

// ============== Weekly Tasks Commands ==============

#[derive(Serialize, Deserialize, Clone)]
pub struct WeeklyTaskProgressEntry {
    #[serde(rename = "taskId")]
    pub task_id: String,
    #[serde(rename = "highestStageCleared", default)]
    pub highest_stage_cleared: i32,
    #[serde(rename = "completedThisWeek", default)]
    pub completed_this_week: bool,
    #[serde(rename = "firstClearStages", default)]
    pub first_clear_stages: Vec<i32>,
    #[serde(rename = "weekStartIso", default)]
    pub week_start_iso: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct WeeklyTaskProgressData {
    #[serde(default)]
    pub tasks: Vec<WeeklyTaskProgressEntry>,
    #[serde(rename = "lastResetCheck", default)]
    pub last_reset_check: String,
}

#[tauri::command]
fn load_weekly_tasks() -> Result<WeeklyTaskProgressData, String> {
    let dir = ensure_app_data_dir()?;
    let path = dir.join("weekly_tasks.json");
    load_json_with_recovery(&path, "weekly tasks", || WeeklyTaskProgressData {
        tasks: Vec::new(),
        last_reset_check: String::new(),
    })
}

#[tauri::command]
fn save_weekly_tasks(data: WeeklyTaskProgressData) -> Result<(), String> {
    let dir = ensure_app_data_dir()?;
    let path = dir.join("weekly_tasks.json");

    let content = serde_json::to_string_pretty(&data)
        .map_err(|e| format!("Failed to serialize weekly tasks: {}", e))?;

    fs::write(&path, content).map_err(|e| format!("Failed to write weekly tasks: {}", e))?;

    Ok(())
}

// ============== Custom Boss Alert Sound Commands ==============

/// Whitelisted audio extensions for the custom boss alert sound.
const BOSS_SOUND_EXTENSIONS: &[&str] = &["mp3", "wav", "ogg", "m4a", "aac", "flac"];

/// Hard cap on the imported sound file size (10 MB). A boss alert is
/// supposed to be a short notification, not a song.
const BOSS_SOUND_MAX_BYTES: u64 = 10 * 1024 * 1024;

/// Copy a user-selected audio file into the app data dir as
/// `boss_alert_sound.<ext>`. Removes any previously imported sound files
/// first so the data dir stays clean. Returns the destination filename so
/// the front-end can persist it in settings.
#[tauri::command]
fn set_boss_alert_sound(source_path: String) -> Result<String, String> {
    let source = Path::new(&source_path);
    if !source.is_file() {
        return Err("Source file does not exist".to_string());
    }

    let ext = source
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .ok_or_else(|| "Source file has no extension".to_string())?;

    if !BOSS_SOUND_EXTENSIONS.contains(&ext.as_str()) {
        return Err(format!(
            "Unsupported audio extension '.{}'. Supported: {}",
            ext,
            BOSS_SOUND_EXTENSIONS.join(", ")
        ));
    }

    let metadata =
        fs::metadata(source).map_err(|e| format!("Failed to read source file: {}", e))?;
    if metadata.len() > BOSS_SOUND_MAX_BYTES {
        return Err(format!(
            "File too large ({:.1} MB). Maximum is {} MB.",
            metadata.len() as f64 / (1024.0 * 1024.0),
            BOSS_SOUND_MAX_BYTES / (1024 * 1024)
        ));
    }

    let dir = ensure_app_data_dir()?;
    remove_existing_boss_sound_files(&dir);

    let dest_name = format!("boss_alert_sound.{}", ext);
    let dest = dir.join(&dest_name);
    fs::copy(source, &dest).map_err(|e| format!("Failed to copy boss alert sound: {}", e))?;
    Ok(dest_name)
}

/// Remove any previously imported `boss_alert_sound.<ext>` files. Returns
/// silently if none are present.
#[tauri::command]
fn clear_boss_alert_sound() -> Result<(), String> {
    let dir = ensure_app_data_dir()?;
    remove_existing_boss_sound_files(&dir);
    Ok(())
}

/// Read the bytes of a previously imported boss alert sound by filename.
/// The front-end caches the resulting Blob URL so this is called at most
/// once per session per sound.
#[tauri::command]
fn load_boss_alert_sound(name: String) -> Result<Vec<u8>, String> {
    // Reject path-traversal — the filename must be a leaf in the data dir.
    if name.contains('/') || name.contains('\\') || name.contains("..") || name.is_empty() {
        return Err("Invalid sound filename".to_string());
    }
    if !name.starts_with("boss_alert_sound.") {
        return Err("Unexpected sound filename".to_string());
    }
    let dir = ensure_app_data_dir()?;
    let path = dir.join(&name);
    fs::read(&path).map_err(|e| format!("Failed to read boss alert sound: {}", e))
}

fn remove_existing_boss_sound_files(dir: &Path) {
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let name = entry.file_name();
            let name = name.to_string_lossy();
            if name.starts_with("boss_alert_sound.") {
                if let Err(e) = fs::remove_file(entry.path()) {
                    eprintln!("Failed to remove old boss sound {}: {}", name, e);
                }
            }
        }
    }
}

// ============== Notes (Codex Library) Commands ==============

#[derive(Serialize, Deserialize, Clone)]
pub struct NoteCategory {
    pub key: String,
    pub name: String,
    pub color: String,
    pub order: i32,
    pub created: i64,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct TodoItem {
    pub t: String,
    pub d: bool,
}

/// Distinguishes "key absent" from "key present and null" — see `Note::when`.
fn deserialize_double_option<'de, D, T>(de: D) -> Result<Option<Option<T>>, D::Error>
where
    D: serde::Deserializer<'de>,
    T: serde::Deserialize<'de>,
{
    Option::deserialize(de).map(Some)
}

/// Notes schema v2: one flat shape carrying every payload field as optional,
/// mirroring the TS `NoteBase`. `type` is kept as data (it drives how the list
/// summarises a note) but no longer selects which fields are legal.
///
/// This was a tagged enum with exact per-variant fields until 2026-09-01. That
/// was lossy in the WRITE direction and silently so: `save_notes` deserializes
/// the payload into this type and re-serializes it, so a text note carrying a
/// checklist had its `items` dropped on every save — the UI kept them (the TS
/// store updates optimistically) right up until the next reload. Any future
/// payload field must be added here as well, or it will not survive a save.
#[derive(Serialize, Deserialize, Clone)]
pub struct Note {
    pub id: String,
    pub category_key: String,
    pub pinned: bool,
    pub title: String,
    pub tag: Option<String>,
    pub created: i64,
    pub updated: i64,
    #[serde(rename = "type")]
    pub note_type: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub body: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub items: Option<Vec<TodoItem>>,
    /// Double Option on purpose: absent (`None`) means the note has no reminder
    /// section at all, `Some(None)` means the section exists with no time set.
    /// Collapsing the two would make a fresh reminder section vanish on reload.
    ///
    /// `deserialize_with` is required, not decoration: serde maps a JSON `null`
    /// straight to `None` on the OUTER Option, so without it an explicit null
    /// is indistinguishable from an absent key and the distinction above is
    /// lost. `deserialize_with` runs only when the key is present, so `default`
    /// still supplies `None` for an absent one.
    #[serde(
        default,
        deserialize_with = "deserialize_double_option",
        skip_serializing_if = "Option::is_none"
    )]
    pub when: Option<Option<i64>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fired: Option<bool>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct NotesData {
    pub schema_version: u32,
    pub categories: Vec<NoteCategory>,
    pub notes: Vec<Note>,
}

fn default_notes_data() -> NotesData {
    NotesData {
        schema_version: 2,
        categories: Vec::new(),
        notes: Vec::new(),
    }
}

#[tauri::command]
fn load_notes() -> Result<NotesData, String> {
    let dir = ensure_app_data_dir()?;
    let path = dir.join("notes.json");
    load_json_with_recovery(&path, "notes", default_notes_data)
}

#[tauri::command]
fn save_notes(data: NotesData) -> Result<(), String> {
    let dir = ensure_app_data_dir()?;
    let path = dir.join("notes.json");

    let content = serde_json::to_string_pretty(&data)
        .map_err(|e| format!("Failed to serialize notes: {}", e))?;

    fs::write(&path, content).map_err(|e| format!("Failed to write notes: {}", e))?;

    Ok(())
}

// ============== Clear All Data Command ==============

#[tauri::command]
fn clear_all_data() -> Result<(), String> {
    let dir = ensure_app_data_dir()?;
    let data_files = [
        "inventory.csv",
        "crafting_log.json",
        "grinding_log.json",
        "hunting_log.json",
        "planner.json",
        "craft_queue.json",
        "treasure_progress.json",
        "barter_inventory.json",
        "barter_log.json",
        "barter_log.legacy.json",
        "barter_route_current.json",
        "barter_route_log.json",
        "barter_map_layout.json",
        "ship_progress.json",
        "sailor_roster.json",
        "weekly_tasks.json",
        "announcements_cache.json",
        "notes.json",
    ];
    for file in &data_files {
        let path = dir.join(file);
        if path.exists() {
            fs::remove_file(&path).map_err(|e| format!("Failed to delete {}: {}", file, e))?;
        }
    }
    remove_existing_boss_sound_files(&dir);
    Ok(())
}

// ============== Marketplace Commands ==============

#[derive(Serialize, Deserialize, Clone)]
pub struct MarketPriceEntry {
    pub id: i64,
    pub price: i64,
}

/// Fetch marketplace prices from BDO Central Market API
#[tauri::command]
async fn fetch_market_prices(
    region: String,
    item_ids: String,
) -> Result<Vec<MarketPriceEntry>, String> {
    let base_url = match region.to_uppercase().as_str() {
        "EU" => "https://eu-trade.naeu.playblackdesert.com/Trademarket/GetWorldMarketSearchList",
        // SEA docs list trade.sea.playblackdesert.com, but that host 301s to this one.
        // Use the destination directly since POST redirects drop the body on most clients.
        "SEA" => {
            "https://asia-trade.blackdesert.pearlabyss.com/Trademarket/GetWorldMarketSearchList"
        }
        _ => "https://na-trade.naeu.playblackdesert.com/Trademarket/GetWorldMarketSearchList",
    };

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let body = serde_json::json!({ "searchResult": item_ids }).to_string();

    let response = client
        .post(base_url)
        .header("Content-Type", "application/json")
        .header("User-Agent", "BlackDesert")
        .body(body)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch market prices: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("HTTP error: {}", response.status()));
    }

    let resp_text = response
        .text()
        .await
        .map_err(|e| format!("Failed to read response: {}", e))?;

    let resp_json: serde_json::Value = serde_json::from_str(&resp_text)
        .map_err(|e| format!("Failed to parse response JSON: {}", e))?;

    let result_msg = resp_json
        .get("resultMsg")
        .and_then(serde_json::Value::as_str)
        .unwrap_or("");

    if result_msg.is_empty() {
        return Ok(Vec::new());
    }

    // Parse pipe-delimited entries: "itemId-stock-basePrice-totalTrades|..."
    let mut entries = Vec::new();
    for entry in result_msg.split('|') {
        let parts: Vec<&str> = entry.split('-').collect();
        if parts.len() >= 3 {
            if let (Ok(id), Ok(price)) = (parts[0].parse::<i64>(), parts[2].parse::<i64>()) {
                entries.push(MarketPriceEntry { id, price });
            }
        }
    }

    Ok(entries)
}

// ============== Greet Command (legacy) ==============

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

// ============== Loot OCR Commands ==============

#[tauri::command]
fn loot_capture_full_screen(
    monitor_id: Option<String>,
) -> Result<loot::CapturedFramePayload, String> {
    let id = monitor_id.unwrap_or_default();
    loot::capture_full_screen_payload(&id)
}

#[tauri::command]
fn loot_test_ocr(
    region: loot::Region,
    color_mask: bool,
    upscale_factor: Option<f32>,
) -> Result<Vec<loot::OcrEvent>, String> {
    let config = loot::PipelineConfig {
        color_mask,
        upscale_factor: upscale_factor.unwrap_or(3.0),
    };
    loot::test_ocr_once(&region, &config)
}

#[tauri::command]
#[allow(clippy::too_many_arguments)] // Tauri command: user-tunable scanner knobs; refactoring to a struct would force every TS caller to repackage
fn loot_start_scan(
    state: tauri::State<'_, loot::ScannerState>,
    app: tauri::AppHandle,
    region: loot::Region,
    freq_hz: f32,
    min_confidence: f32,
    strict_mode: bool,
    color_mask: bool,
    upscale_factor: Option<f32>,
    temporal_frames: Option<u32>,
) -> Result<(), String> {
    let config = loot::PipelineConfig {
        color_mask,
        upscale_factor: upscale_factor.unwrap_or(3.0),
    };
    loot::start_scan(
        &state,
        app,
        region,
        freq_hz,
        min_confidence,
        strict_mode,
        config,
        temporal_frames.unwrap_or(1),
    )
}

#[tauri::command]
fn loot_stop_scan(state: tauri::State<'_, loot::ScannerState>) -> Result<(), String> {
    loot::stop_scan(&state);
    Ok(())
}

#[tauri::command]
fn load_loot_settings() -> Result<serde_json::Value, String> {
    let dir = ensure_app_data_dir()?;
    let path = dir.join("loot_settings.json");
    load_json_with_recovery(&path, "loot settings", || {
        serde_json::json!({
            "freqHz": 6,
            "minConfidence": 0.85,
            "region": null,
            "savedRegions": [],
            "strictMode": true,
            "colorMask": false,
            "upscaleFactor": 3,
            "temporalFrames": 1
        })
    })
}

#[tauri::command]
fn save_loot_settings(settings: serde_json::Value) -> Result<(), String> {
    let dir = ensure_app_data_dir()?;
    let path = dir.join("loot_settings.json");
    let content = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("Failed to serialize loot settings: {}", e))?;
    fs::write(&path, content).map_err(|e| format!("Failed to write loot settings: {}", e))?;
    Ok(())
}

#[tauri::command]
fn load_loot_current() -> Result<serde_json::Value, String> {
    let dir = ensure_app_data_dir()?;
    let path = dir.join("loot_current.json");
    load_json_with_recovery(&path, "loot current session", || serde_json::Value::Null)
}

#[tauri::command]
fn save_loot_current(session: serde_json::Value) -> Result<(), String> {
    let dir = ensure_app_data_dir()?;
    let path = dir.join("loot_current.json");
    let content = serde_json::to_string_pretty(&session)
        .map_err(|e| format!("Failed to serialize loot current session: {}", e))?;
    fs::write(&path, content)
        .map_err(|e| format!("Failed to write loot current session: {}", e))?;
    Ok(())
}

#[tauri::command]
fn load_loot_log() -> Result<serde_json::Value, String> {
    let dir = ensure_app_data_dir()?;
    let path = dir.join("loot_log.json");
    load_json_with_recovery(&path, "loot log", || serde_json::json!([]))
}

#[tauri::command]
fn save_loot_log(logs: serde_json::Value) -> Result<(), String> {
    let dir = ensure_app_data_dir()?;
    let path = dir.join("loot_log.json");
    let content = serde_json::to_string_pretty(&logs)
        .map_err(|e| format!("Failed to serialize loot log: {}", e))?;
    fs::write(&path, content).map_err(|e| format!("Failed to write loot log: {}", e))?;
    Ok(())
}

// ============== App Entry ==============

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(loot::ScannerState::new())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_os::init())
        .plugin({
            use tauri::Manager;
            use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut, ShortcutState};
            let toggle_ct = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyL);
            // Loot OCR panic-stop: any time, anywhere, kills the scanner.
            // Picked End (rather than F8 or similar) because BDO uses every F-key.
            let loot_panic = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::End);
            tauri_plugin_global_shortcut::Builder::new()
                .with_shortcuts([toggle_ct, loot_panic])
                .unwrap()
                .with_handler(move |app, scut, event| {
                    if event.state() != ShortcutState::Pressed {
                        return;
                    }
                    if scut == &toggle_ct {
                        let _ = app.emit("toggle-click-through", ());
                    } else if scut == &loot_panic {
                        // Stop the scanner immediately (no roundtrip through the
                        // frontend), then signal the UI to pause the session +
                        // surface a toast confirming the kill.
                        let state = app.state::<loot::ScannerState>();
                        loot::stop_scan(&state);
                        let _ = app.emit("loot-panic-stop", ());
                    }
                })
                .build()
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            load_inventory,
            save_inventory,
            load_settings,
            save_settings,
            get_data_path,
            load_crafting_log,
            save_crafting_log,
            load_grinding_log,
            save_grinding_log,
            load_planner,
            save_planner,
            load_craft_queue,
            save_craft_queue,
            load_treasure_progress,
            save_treasure_progress,
            fetch_market_prices,
            load_hunting_log,
            save_hunting_log,
            load_barter_inventory,
            save_barter_inventory,
            load_barter_log,
            save_barter_log,
            load_barter_route_current,
            save_barter_route_current,
            load_barter_route_log,
            save_barter_route_log,
            load_barter_map_layout,
            save_barter_map_layout,
            migrate_legacy_barter_log,
            load_ship_progress,
            save_ship_progress,
            load_sailor_roster,
            save_sailor_roster,
            load_weekly_tasks,
            save_weekly_tasks,
            clear_all_data,
            set_boss_alert_sound,
            clear_boss_alert_sound,
            load_boss_alert_sound,
            load_notes,
            save_notes,
            loot_capture_full_screen,
            loot_test_ocr,
            loot_start_scan,
            loot_stop_scan,
            load_loot_settings,
            save_loot_settings,
            load_loot_current,
            save_loot_current,
            load_loot_log,
            save_loot_log,
            diagnostic::diagnostic_log,
            diagnostic::diagnostic_log_read,
        ])
        .setup(|app| {
            // Initialize the diagnostic logger as early as possible — anything
            // that wants to log during boot just calls diagnostic::log().
            if let Ok(dir) = ensure_app_data_dir() {
                diagnostic::init(dir);
            }
            let _ = app;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod notes_schema_tests {
    use super::*;

    /// A v1 file must survive load→save byte-for-byte in the fields that
    /// matter. This is the regression that motivated schema v2: the old tagged
    /// enum dropped any field its variant didn't declare, silently, on WRITE.
    #[test]
    fn v1_notes_round_trip_unchanged() {
        let v1 = r#"{"schema_version":1,"categories":[],"notes":[
            {"type":"text","id":"a","category_key":"c1","pinned":false,"title":"T","tag":null,"created":1,"updated":2,"body":"B"},
            {"type":"todo","id":"b","category_key":"c1","pinned":true,"title":"L","tag":"x","created":3,"updated":4,"items":[{"t":"one","d":false}]},
            {"type":"reminder","id":"c","category_key":"c1","pinned":false,"title":"R","tag":null,"created":5,"updated":6,"when":900,"body":"","fired":false}
        ]}"#;
        let data: NotesData = serde_json::from_str(v1).expect("v1 parses");
        let out = serde_json::to_value(&data).unwrap();
        let notes = out["notes"].as_array().unwrap();

        assert_eq!(notes[0]["body"], "B");
        assert!(notes[0].get("items").is_none(), "text note must not gain items");
        assert!(notes[0].get("when").is_none(), "text note must not gain when");
        assert_eq!(notes[1]["items"][0]["t"], "one");
        assert!(notes[1].get("body").is_none(), "todo note must not gain a body");
        assert_eq!(notes[2]["when"], 900);
        assert_eq!(notes[2]["fired"], false);
    }

    /// The v2 case the enum could not represent: one note carrying prose AND a
    /// checklist AND a time at once.
    #[test]
    fn v2_mixed_payload_survives_a_save() {
        let v2 = r#"{"schema_version":2,"categories":[],"notes":[
            {"type":"text","id":"a","category_key":"c1","pinned":false,"title":"T","tag":null,"created":1,"updated":2,
             "body":"prose","items":[{"t":"step","d":true}],"when":1234,"fired":false}
        ]}"#;
        let data: NotesData = serde_json::from_str(v2).expect("v2 parses");
        let out = serde_json::to_value(&data).unwrap();
        let n = &out["notes"][0];
        assert_eq!(n["body"], "prose");
        assert_eq!(n["items"][0]["t"], "step");
        assert_eq!(n["items"][0]["d"], true);
        assert_eq!(n["when"], 1234);
        assert_eq!(n["type"], "text", "type is data, not a shape selector");
    }

    /// Absent `when` and null `when` mean different things — no section versus
    /// a section with no time set — so they must not collapse into each other.
    #[test]
    fn absent_and_null_when_stay_distinct() {
        let json = r#"{"schema_version":2,"categories":[],"notes":[
            {"type":"text","id":"a","category_key":"c","pinned":false,"title":"","tag":null,"created":1,"updated":1,"body":""},
            {"type":"text","id":"b","category_key":"c","pinned":false,"title":"","tag":null,"created":1,"updated":1,"body":"","when":null}
        ]}"#;
        let data: NotesData = serde_json::from_str(json).expect("parses");
        assert!(data.notes[0].when.is_none(), "absent stays absent");
        assert_eq!(data.notes[1].when, Some(None), "explicit null is a set section");

        let out = serde_json::to_value(&data).unwrap();
        assert!(out["notes"][0].get("when").is_none(), "absent is not written");
        assert!(out["notes"][1]["when"].is_null(), "null is written back as null");
    }
}
