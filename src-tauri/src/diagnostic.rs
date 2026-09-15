//! Append-only diagnostic logger.
//!
//! Writes timestamped lines to `<app_data>/diagnostic.log`. Rotates when the
//! file passes 5 MB (renames to `diagnostic.log.old`, starts fresh). Each
//! write flushes immediately so a Task-Manager-kill recovery still preserves
//! the last lines before the freeze.
//!
//! Two entry points:
//! - `log(category, message)` for Rust call sites (scanner thread, commands).
//! - `diagnostic_log` Tauri command, exposed to the frontend for JS-side
//!   heartbeats + key-event logs.

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

static LOG_PATH: OnceLock<PathBuf> = OnceLock::new();
static LOG_MUTEX: Mutex<()> = Mutex::new(());

const ROTATE_BYTES: u64 = 5_000_000;

/// One-time init from the app entry point. After this returns, `log()` and
/// the Tauri command write to `<data_dir>/diagnostic.log`.
pub fn init(data_dir: PathBuf) {
    let path = data_dir.join("diagnostic.log");
    let _ = LOG_PATH.set(path);
    // Record session start so the log is easy to scan after a freeze.
    log("BOOT", "diagnostic logger initialized");
}

/// Append a single line. Best-effort — never panics, never errors out to the
/// caller. Categories are short uppercase tags (`SCANNER`, `JS`, `SAVE`, etc.)
/// to make grep'ing easier in the resulting file.
pub fn log(category: &str, message: &str) {
    let Some(path) = LOG_PATH.get() else {
        return;
    };
    let Ok(_guard) = LOG_MUTEX.lock() else {
        return;
    };

    // Rotate if the current file is too large. We keep at most one rotation
    // so the cap on disk usage is ~10 MB total.
    if let Ok(meta) = fs::metadata(path) {
        if meta.len() > ROTATE_BYTES {
            let rotated = path.with_extension("log.old");
            let _ = fs::remove_file(&rotated);
            let _ = fs::rename(path, &rotated);
        }
    }

    let stamp = fmt_timestamp();
    if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(f, "[{}] [{}] {}", stamp, category, message);
        let _ = f.flush();
    }
}

/// `HH:MM:SS.mmm` in UTC. Cheap; no external time crate needed. We render UTC
/// not local because the user copy-pastes this back to us and there's no need
/// to translate offsets when comparing to commit timestamps.
fn fmt_timestamp() -> String {
    let dur = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let total_secs = dur.as_secs();
    let ms = dur.subsec_millis();
    let h = (total_secs / 3600) % 24;
    let m = (total_secs / 60) % 60;
    let s = total_secs % 60;
    format!("{:02}:{:02}:{:02}.{:03} UTC", h, m, s, ms)
}

// =====================================================================
// Tauri command — exposed to the JS frontend.
// =====================================================================

#[tauri::command]
pub fn diagnostic_log(category: String, message: String) -> Result<(), String> {
    log(&category, &message);
    Ok(())
}

/// Read the current log content (for in-app display or copy-to-clipboard).
/// Returns up to the last `max_bytes` bytes so we don't ship a 10 MB string
/// back through Tauri IPC.
#[tauri::command]
pub fn diagnostic_log_read(max_bytes: Option<usize>) -> Result<String, String> {
    let Some(path) = LOG_PATH.get() else {
        return Ok(String::new());
    };
    let cap = max_bytes.unwrap_or(200_000);
    let content = fs::read(path).map_err(|e| format!("read diagnostic log: {}", e))?;
    if content.len() <= cap {
        return String::from_utf8(content).map_err(|e| format!("decode log: {}", e));
    }
    // Take the tail. from_utf8_lossy handles the case where we sliced mid-
    // multibyte char — for diagnostics we'd rather show a stray replacement
    // char than error out.
    let tail = &content[content.len() - cap..];
    Ok(String::from_utf8_lossy(tail).into_owned())
}
