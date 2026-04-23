use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Emitter;

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
    pub cooking_mastery: String,
    #[serde(default)]
    pub alchemy_mastery: String,
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
    #[serde(default = "default_theme")]
    pub theme: String,
    #[serde(default)]
    pub window_state: WindowState,
    #[serde(default)]
    pub dismissed_announcements: Vec<String>,
    #[serde(default = "default_true")]
    pub boss_sound_enabled: bool,
    #[serde(default = "default_true")]
    pub timer_sound_enabled: bool,
    #[serde(default = "default_boss_alert_minutes")]
    pub boss_alert_minutes: i32,
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
    #[serde(default)]
    pub total_barter_count: i32,
    #[serde(default = "default_true")]
    pub always_on_top: bool,
    #[serde(default)]
    pub hidden_bosses: Vec<String>,
    #[serde(default = "default_true")]
    pub animations_enabled: bool,
}

fn default_true() -> bool {
    true
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

fn default_theme() -> String {
    "obsidian".to_string()
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
        return Ok(AppSettings::default());
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
            Ok(AppSettings::default())
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
}

/// Load ship progress from JSON file
#[tauri::command]
fn load_ship_progress() -> Result<ShipProgressData, String> {
    let dir = ensure_app_data_dir()?;
    let path = dir.join("ship_progress.json");
    load_json_with_recovery(&path, "ship progress", || ShipProgressData {
        paths: Vec::new(),
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
        "treasure_progress.json",
        "barter_inventory.json",
        "barter_log.json",
        "ship_progress.json",
        "sailor_roster.json",
        "weekly_tasks.json",
        "announcements_cache.json",
    ];
    for file in &data_files {
        let path = dir.join(file);
        if path.exists() {
            fs::remove_file(&path).map_err(|e| format!("Failed to delete {}: {}", file, e))?;
        }
    }
    Ok(())
}

// ============== Announcements Commands ==============

/// Fetch announcements from a remote URL with optional bearer token auth
#[tauri::command]
async fn fetch_announcements(url: String, token: Option<String>) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let mut request = client.get(&url).header("Accept", "application/json");

    if let Some(ref t) = token {
        request = request.header("Authorization", format!("Bearer {}", t));
    }

    let response = request
        .send()
        .await
        .map_err(|e| format!("Failed to fetch announcements: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("HTTP error: {}", response.status()));
    }

    response
        .text()
        .await
        .map_err(|e| format!("Failed to read response body: {}", e))
}

/// Load announcements cache from JSON file
#[tauri::command]
fn load_announcements_cache() -> Result<String, String> {
    let dir = ensure_app_data_dir()?;
    let path = dir.join("announcements_cache.json");

    if !path.exists() {
        return Ok(String::new());
    }

    fs::read_to_string(&path).map_err(|e| format!("Failed to read announcements cache: {}", e))
}

/// Save announcements cache to JSON file
#[tauri::command]
fn save_announcements_cache(data: String) -> Result<(), String> {
    let dir = ensure_app_data_dir()?;
    let path = dir.join("announcements_cache.json");

    fs::write(&path, data).map_err(|e| format!("Failed to write announcements cache: {}", e))
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

// ============== App Entry ==============

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin({
            use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut, ShortcutState};
            let shortcut = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyL);
            tauri_plugin_global_shortcut::Builder::new()
                .with_shortcut(shortcut)
                .unwrap()
                .with_handler(move |app, scut, event| {
                    if scut == &shortcut && event.state() == ShortcutState::Pressed {
                        let _ = app.emit("toggle-click-through", ());
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
            load_treasure_progress,
            save_treasure_progress,
            fetch_announcements,
            load_announcements_cache,
            save_announcements_cache,
            fetch_market_prices,
            load_hunting_log,
            save_hunting_log,
            load_barter_inventory,
            save_barter_inventory,
            load_barter_log,
            save_barter_log,
            load_ship_progress,
            save_ship_progress,
            load_sailor_roster,
            save_sailor_roster,
            load_weekly_tasks,
            save_weekly_tasks,
            clear_all_data
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
