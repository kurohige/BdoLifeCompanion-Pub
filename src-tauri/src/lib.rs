use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
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
            let quantity: i32 = record
                .get(1)
                .unwrap_or("0")
                .parse()
                .unwrap_or(0);

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

    writer.flush().map_err(|e| format!("Failed to flush: {}", e))?;
    Ok(())
}

// ============== Settings Commands ==============

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
    pub favorites: Vec<String>,
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

/// Load settings from JSON file
#[tauri::command]
fn load_settings() -> Result<AppSettings, String> {
    let dir = ensure_app_data_dir()?;
    let path = dir.join("settings.json");

    if !path.exists() {
        return Ok(AppSettings::default());
    }

    let content = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read settings: {}", e))?;

    serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse settings: {}", e))
}

/// Save settings to JSON file
#[tauri::command]
fn save_settings(settings: AppSettings) -> Result<(), String> {
    let dir = ensure_app_data_dir()?;
    let path = dir.join("settings.json");

    let content = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;

    fs::write(&path, content)
        .map_err(|e| format!("Failed to write settings: {}", e))?;

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
    #[serde(rename = "silverEarned", default, skip_serializing_if = "Option::is_none")]
    pub silver_earned: Option<i64>,
}

/// Load crafting log from JSON file
#[tauri::command]
fn load_crafting_log() -> Result<Vec<CraftingSession>, String> {
    let dir = ensure_app_data_dir()?;
    let path = dir.join("crafting_log.json");

    if !path.exists() {
        return Ok(Vec::new());
    }

    let content = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read crafting log: {}", e))?;

    serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse crafting log: {}", e))
}

/// Save crafting log to JSON file
#[tauri::command]
fn save_crafting_log(sessions: Vec<CraftingSession>) -> Result<(), String> {
    let dir = ensure_app_data_dir()?;
    let path = dir.join("crafting_log.json");

    let content = serde_json::to_string_pretty(&sessions)
        .map_err(|e| format!("Failed to serialize crafting log: {}", e))?;

    fs::write(&path, content)
        .map_err(|e| format!("Failed to write crafting log: {}", e))?;

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

    if !path.exists() {
        return Ok(Vec::new());
    }

    let content = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read grinding log: {}", e))?;

    serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse grinding log: {}", e))
}

/// Save grinding log to JSON file
#[tauri::command]
fn save_grinding_log(sessions: Vec<GrindingSession>) -> Result<(), String> {
    let dir = ensure_app_data_dir()?;
    let path = dir.join("grinding_log.json");

    let content = serde_json::to_string_pretty(&sessions)
        .map_err(|e| format!("Failed to serialize grinding log: {}", e))?;

    fs::write(&path, content)
        .map_err(|e| format!("Failed to write grinding log: {}", e))?;

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

    if !path.exists() {
        return Ok(PlannerData {
            plans: Vec::new(),
            active_plan_id: None,
        });
    }

    let content = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read planner: {}", e))?;

    // Try new format first (PlannerData with activePlanId)
    if let Ok(data) = serde_json::from_str::<PlannerData>(&content) {
        return Ok(data);
    }

    // Fallback: old format was a plain array of plans
    let plans: Vec<CraftingPlan> = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse planner: {}", e))?;

    Ok(PlannerData {
        plans,
        active_plan_id: None,
    })
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

    fs::write(&path, content)
        .map_err(|e| format!("Failed to write planner: {}", e))?;

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
    #[serde(rename = "obtainedDate", default, skip_serializing_if = "Option::is_none")]
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

    if !path.exists() {
        return Ok(TreasureProgressData {
            pieces: Vec::new(),
        });
    }

    let content = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read treasure progress: {}", e))?;

    serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse treasure progress: {}", e))
}

/// Save treasure progress to JSON file
#[tauri::command]
fn save_treasure_progress(data: TreasureProgressData) -> Result<(), String> {
    let dir = ensure_app_data_dir()?;
    let path = dir.join("treasure_progress.json");

    let content = serde_json::to_string_pretty(&data)
        .map_err(|e| format!("Failed to serialize treasure progress: {}", e))?;

    fs::write(&path, content)
        .map_err(|e| format!("Failed to write treasure progress: {}", e))?;

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
    #[serde(rename = "matchlockTier", default, skip_serializing_if = "Option::is_none")]
    pub matchlock_tier: Option<String>,
    #[serde(rename = "butcheringKnife", default, skip_serializing_if = "Option::is_none")]
    pub butchering_knife: Option<String>,
}

/// Load hunting log from JSON file
#[tauri::command]
fn load_hunting_log() -> Result<Vec<HuntingSession>, String> {
    let dir = ensure_app_data_dir()?;
    let path = dir.join("hunting_log.json");

    if !path.exists() {
        return Ok(Vec::new());
    }

    let content = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read hunting log: {}", e))?;

    serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse hunting log: {}", e))
}

/// Save hunting log to JSON file
#[tauri::command]
fn save_hunting_log(sessions: Vec<HuntingSession>) -> Result<(), String> {
    let dir = ensure_app_data_dir()?;
    let path = dir.join("hunting_log.json");

    let content = serde_json::to_string_pretty(&sessions)
        .map_err(|e| format!("Failed to serialize hunting log: {}", e))?;

    fs::write(&path, content)
        .map_err(|e| format!("Failed to write hunting log: {}", e))?;

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

    let mut request = client
        .get(&url)
        .header("Accept", "application/json");

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

    fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read announcements cache: {}", e))
}

/// Save announcements cache to JSON file
#[tauri::command]
fn save_announcements_cache(data: String) -> Result<(), String> {
    let dir = ensure_app_data_dir()?;
    let path = dir.join("announcements_cache.json");

    fs::write(&path, data)
        .map_err(|e| format!("Failed to write announcements cache: {}", e))
}

// ============== Marketplace Commands ==============

#[derive(Serialize, Deserialize, Clone)]
pub struct MarketPriceEntry {
    pub id: i64,
    pub price: i64,
}

/// Fetch marketplace prices from BDO Central Market API
#[tauri::command]
async fn fetch_market_prices(region: String, item_ids: String) -> Result<Vec<MarketPriceEntry>, String> {
    let base_url = match region.to_uppercase().as_str() {
        "EU" => "https://eu-trade.naeu.playblackdesert.com/Trademarket/GetWorldMarketSearchList",
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
                .with_shortcut(shortcut).unwrap()
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
            save_hunting_log
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
