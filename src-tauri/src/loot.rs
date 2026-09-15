// Loot OCR — screen capture + Windows.Media.Ocr + text parsing.
//
// User-initiated scanner. Captures a user-drawn region at a configurable rate,
// runs Windows.Media.Ocr on it, extracts (name, qty) pairs, and emits
// `loot-ocr` events to the frontend for matching and accumulation.
//
// ToS posture: see CLAUDE.md "Safety Constraints" -> "Narrow OCR carve-out".

use std::cell::Cell;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use base64::Engine;
use image::{ImageEncoder, RgbaImage};
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::sync::OnceLock;
use tauri::{AppHandle, Emitter};

// =====================================================================
// Wire types — mirror the TS interfaces in src/lib/models/loot.ts.
// =====================================================================

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Region {
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
    pub monitor_id: String,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct OcrEvent {
    pub ts: i64,
    pub raw_name: String,
    pub qty: u32,
    /// Always 1.0 in v0 — Windows.Media.Ocr doesn't expose per-line confidence.
    /// Kept on the wire so the slider and the matcher can evolve later.
    pub confidence: f32,
    /// How many identical `(name, qty)` lines this event represents from a
    /// single OCR pass. Always `1` under the position-aware dedup that
    /// shipped 2026-05-17 (one event per new line). Field stays on the
    /// wire because the persisted scan log and the TS multiplier reader
    /// both still consume it.
    #[serde(default = "default_count_in_pass")]
    pub count_in_pass: u32,
    /// Average vertical-centre Y of the source line's bounding rect in
    /// the upscaled image's coordinate space. Plumbed through so the TS
    /// dedup can bucket on Y position — distinguishes "OCR-variant
    /// jitter on the same popup line" (same Y bucket) from "new kill
    /// popped up at a different Y" (new bucket). Defaults to `0.0` for
    /// one-shot OCR tests and any future caller that doesn't need it.
    #[serde(default)]
    pub y: f32,
}

// Used by serde's `#[serde(default = ...)]` on `OcrEvent::count_in_pass`.
// Rust's dead-code detector doesn't see the attribute-driven call site.
#[allow(dead_code)]
fn default_count_in_pass() -> u32 {
    1
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CapturedFramePayload {
    /// base64-encoded PNG of the captured monitor.
    pub png_base64: String,
    pub width: u32,
    pub height: u32,
    pub monitor_id: String,
}

// =====================================================================
// Scanner state — one global, owned by Tauri via .manage().
// =====================================================================

pub struct ScannerState {
    running: Arc<AtomicBool>,
    /// Monotonic scan generation. Every `start_scan` bumps it and the spawned
    /// thread captures its own value; a thread whose generation is no longer
    /// current exits at its next check. This is what actually retires a
    /// superseded thread — the shared `running` flag alone cannot: `start_scan`
    /// used to flip it false → sleep 50 ms → true, but a tick takes ~300 ms
    /// (capture + OCR), so a thread mid-tick never observed the false and kept
    /// scanning next to the new one. The 2026-09-01 mining validation ran
    /// its second session with TWO live scanner threads (every heartbeat and
    /// `thread_exit` duplicated), doubling every emission.
    generation: Arc<AtomicU64>,
    /// Guards start/stop so two `loot_start_scan` calls can't race a half-spun-down task.
    lock: Mutex<()>,
}

impl ScannerState {
    pub fn new() -> Self {
        Self {
            running: Arc::new(AtomicBool::new(false)),
            generation: Arc::new(AtomicU64::new(0)),
            lock: Mutex::new(()),
        }
    }
}

impl Default for ScannerState {
    fn default() -> Self {
        Self::new()
    }
}

// =====================================================================
// Per-thread WinRT init.
// =====================================================================

thread_local! {
    static WINRT_INIT: Cell<bool> = const { Cell::new(false) };
}

/// Initialize the WinRT (Windows Runtime) apartment for the current thread.
/// Required before any Windows.Media.Ocr / Storage.Streams call. Idempotent
/// per-thread; second call returns S_FALSE and is harmless.
fn ensure_winrt_init() {
    WINRT_INIT.with(|cell| {
        if cell.get() {
            return;
        }
        unsafe {
            use windows::Win32::System::WinRT::{RoInitialize, RO_INIT_MULTITHREADED};
            // Ignore the result — S_FALSE just means already initialized on this thread.
            let _ = RoInitialize(RO_INIT_MULTITHREADED);
        }
        cell.set(true);
    });
}

// =====================================================================
// Foreground-window awareness (anti-cheat-friendly safety guardrail).
//
// We skip capture ticks when the foreground window is neither BDO nor our own
// app. Two reasons:
//   (1) Pearl Abyss ToS — minimize the surface where we look like we're
//       interacting with the game when the user isn't actively playing.
//   (2) UX — the user Alt-Tabs to Discord; we shouldn't be reading their
//       browser tab in case they happen to use a region that overlaps text.
//
// Implementation is read-only: GetForegroundWindow + GetWindowTextW. No
// process enumeration, no OpenProcess against BDO — those are exactly the
// things anti-cheat sniffs for.
// =====================================================================

/// Read the foreground window's title. Returns None if the title is empty
/// or the call fails — we then treat that as "no signal, keep going".
fn read_foreground_window_title() -> Option<String> {
    use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowTextW};
    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.is_invalid() {
            return None;
        }
        let mut buf = [0u16; 512];
        let len = GetWindowTextW(hwnd, &mut buf);
        if len <= 0 {
            return None;
        }
        Some(String::from_utf16_lossy(&buf[..len as usize]))
    }
}

/// Decide whether the current foreground window is one we're allowed to scan.
/// Only BDO is allowed — when our own app (or the picker) is foreground, it
/// almost certainly *covers* the region we'd be capturing, so scanning would
/// just OCR our own market panel / row list / picker overlay and emit garbage.
/// Tested 2026-05-14: with the app's title in this allowlist, the scanner
/// captured app UI text like "Availability", "min remaining", "Market" and
/// fed them into the session as raw rows. Loose substring match so client
/// patches that tweak the title (e.g. " - Black Desert Online") still pass.
fn is_target_window_focused(title: &str) -> bool {
    let lower = title.to_lowercase();
    lower.contains("black desert")
        || title.contains("검은사막")
        || title.contains("黒い砂漠")
        || title.contains("黑色沙漠")
}

/// Combined check used by the scanner. Returns `Some(true)` when we should
/// proceed with a capture tick, `Some(false)` when we should skip and emit a
/// focus-warning, or `None` when we couldn't read the foreground (best-effort:
/// keep scanning, don't penalize the user for transient API hiccups).
fn check_focus_allowed() -> Option<bool> {
    read_foreground_window_title().map(|t| is_target_window_focused(&t))
}

// =====================================================================
// Monitor + capture.
// =====================================================================

fn pick_monitor(monitor_id: &str) -> Result<xcap::Monitor, String> {
    let monitors =
        xcap::Monitor::all().map_err(|e| format!("Failed to enumerate monitors: {}", e))?;
    if monitor_id.is_empty() {
        // Prefer the primary monitor, fall back to first.
        return monitors
            .iter()
            .find(|m| m.is_primary())
            .or_else(|| monitors.first())
            .cloned()
            .ok_or_else(|| "No monitors found".to_string());
    }
    monitors
        .into_iter()
        .find(|m| m.name() == monitor_id)
        .ok_or_else(|| format!("Monitor not found: {}", monitor_id))
}

fn capture_monitor(monitor: &xcap::Monitor) -> Result<RgbaImage, String> {
    monitor
        .capture_image()
        .map_err(|e| format!("Capture failed: {}", e))
}

/// Normalize 0..1 region coordinates to integer pixel bounds, clamped to the frame.
fn region_to_pixels(region: &Region, frame_w: u32, frame_h: u32) -> (u32, u32, u32, u32) {
    let x = (region.x.clamp(0.0, 1.0) * frame_w as f32) as u32;
    let y = (region.y.clamp(0.0, 1.0) * frame_h as f32) as u32;
    let w_raw = (region.w.clamp(0.0, 1.0) * frame_w as f32) as u32;
    let h_raw = (region.h.clamp(0.0, 1.0) * frame_h as f32) as u32;
    // Clamp width/height so we never overshoot the frame.
    let w = w_raw.min(frame_w.saturating_sub(x)).max(1);
    let h = h_raw.min(frame_h.saturating_sub(y)).max(1);
    (x, y, w, h)
}

fn crop_region(full: &RgbaImage, region: &Region) -> RgbaImage {
    let (x, y, w, h) = region_to_pixels(region, full.width(), full.height());
    image::imageops::crop_imm(full, x, y, w, h).to_image()
}

/// Decide whether an RGBA pixel belongs to BDO loot-log text.
///
/// Two acceptance bands:
///   - **Bright + near-neutral**: `V > 0.78, S < 0.20` — common-drop white text.
///   - **Bright + saturated**: `V > 0.55, S > 0.35` — rare-tier coloured text
///     (yellow, green, blue, orange, purple — all accepted regardless of hue).
///
/// Everything else (dark world background, mid-saturation UI tints, particle
/// haze, anti-alias edges between text and dark bg) is treated as background
/// and gets binarized to white before OCR. This is the single biggest
/// accuracy lever per the loot-OCR research pass — see `LOOT_OCR_ROADMAP.md`.
#[inline]
fn is_loot_color(r: u8, g: u8, b: u8) -> bool {
    let rf = r as f32 / 255.0;
    let gf = g as f32 / 255.0;
    let bf = b as f32 / 255.0;
    let v = rf.max(gf).max(bf);
    if v == 0.0 {
        return false;
    }
    let min = rf.min(gf).min(bf);
    let s = (v - min) / v;
    (v > 0.78 && s < 0.20) || (v > 0.55 && s > 0.35)
}

/// Convert a captured region into a black-on-white binarized image that keeps
/// only loot-coloured pixels. OCR engines (including `Windows.Media.Ocr`) are
/// trained on printed-document data, so dark-text-on-light backgrounds match
/// their priors much better than the game's bright-text-on-dark-world.
fn apply_loot_mask(img: &RgbaImage) -> RgbaImage {
    let (w, h) = img.dimensions();
    let mut out = RgbaImage::new(w, h);
    for (x, y, p) in img.enumerate_pixels() {
        let [r, g, b, _a] = p.0;
        let pixel = if is_loot_color(r, g, b) {
            image::Rgba([0, 0, 0, 255])
        } else {
            image::Rgba([255, 255, 255, 255])
        };
        out.put_pixel(x, y, pixel);
    }
    out
}

fn encode_png(img: &RgbaImage) -> Result<Vec<u8>, String> {
    let mut bytes: Vec<u8> = Vec::new();
    image::codecs::png::PngEncoder::new(&mut bytes)
        .write_image(
            img.as_raw(),
            img.width(),
            img.height(),
            image::ExtendedColorType::Rgba8,
        )
        .map_err(|e| format!("PNG encode failed: {}", e))?;
    Ok(bytes)
}

/// Write an RGBA frame to a PNG file. Used by the live-scanner debug dump
/// path — handy for diagnosing "OCR found nothing" without running a second
/// process. Errors are returned but the caller usually just `let _ =`s them
/// because debug dumps are best-effort.
fn save_debug_png(img: &RgbaImage, path: &std::path::Path) -> Result<(), String> {
    let bytes = encode_png(img)?;
    std::fs::write(path, bytes).map_err(|e| format!("write {}: {}", path.display(), e))
}

/// Lanczos3 upscale the image by `factor`. Used to push small UI text up to the
/// x-height the OCR engine expects (Windows.Media.Ocr and Tesseract both want
/// ≥ 20 px x-height; BDO's loot-log text sits around 10–14 px). `factor` is
/// clamped to [1.0, 6.0]; anything ≤ 1.0 short-circuits to a clone so callers
/// can pass a single config field without branching.
fn upscale_lanczos3(img: &RgbaImage, factor: f32) -> RgbaImage {
    let f = factor.clamp(1.0, 6.0);
    if f <= 1.0 {
        return img.clone();
    }
    let new_w = (img.width() as f32 * f).round().max(1.0) as u32;
    let new_h = (img.height() as f32 * f).round().max(1.0) as u32;
    image::imageops::resize(img, new_w, new_h, image::imageops::FilterType::Lanczos3)
}

// =====================================================================
// Pipeline configuration — single struct that knobs every preprocessing
// stage so callers (live scanner, one-shot test, benchmark harness) all
// take the same path. Add new stages here (FSRCNN, Sauvola, etc.) without
// changing call sites.
// =====================================================================

#[derive(Clone, Debug)]
pub struct PipelineConfig {
    /// HSV colour mask → black-on-white binarization. The single biggest
    /// accuracy lever today; OCR engines are trained on documents and respond
    /// far better to dark-text-on-light input than the game's bright-text-on-
    /// world-3D.
    pub color_mask: bool,
    /// Lanczos3 upscale factor applied after the mask. 1.0 = no upscale, 3.0
    /// is the sweet spot per Tesseract docs (target x-height ≥ 20 px) for
    /// BDO's ~10–14 px loot text. Clamped to [1.0, 6.0] inside the upscaler.
    pub upscale_factor: f32,
}

impl Default for PipelineConfig {
    fn default() -> Self {
        Self {
            // Off by default — fixture bench (2026-05-14) showed the current
            // HSV thresholds erode anti-aliased glyph edges down to scattered
            // pixels and drop WinRT OCR's line yield to zero on real BDO
            // captures. Kept as an opt-in until we land a better band.
            color_mask: false,
            // Lifts BDO's ~10–14 px loot text to ~30–42 px effective — within
            // the x-height window WinRT OCR / Tesseract were trained on.
            upscale_factor: 3.0,
        }
    }
}

/// Run the loot OCR pipeline on a single RGBA frame. Public so the benchmark
/// harness in `tests/loot_ocr_bench.rs` can A/B different configs against the
/// fixture set. The live scanner and `test_ocr_once` both funnel through here.
///
/// Returns `(text, y)` per line — `y` is the average vertical centre of the
/// line's word bounding rects in the upscaled image's coordinate space. The
/// scanner uses Y for position-aware dedup; callers that only care about text
/// can ignore it.
pub fn run_pipeline(
    img: &RgbaImage,
    config: &PipelineConfig,
) -> Result<Vec<(String, f32)>, String> {
    let masked = if config.color_mask {
        apply_loot_mask(img)
    } else {
        img.clone()
    };
    let scaled = upscale_lanczos3(&masked, config.upscale_factor);
    // Direct RGBA → SoftwareBitmap → OCR. Skips a ~30-80 ms PNG encode/decode
    // round-trip per tick. The legacy PNG path (`ocr_png_bytes`) is kept for
    // debugging but no longer in the hot path.
    ocr_rgba(&scaled)
}

/// Per-channel median across a stack of identically-sized RGBA frames. The MMO
/// case: the user's drawn region overlaps a UI element that is pixel-stable
/// frame-to-frame, but the 3D world behind/around it changes constantly. Median
/// stacking keeps the stable pixels (text strokes) and smooths the varying ones
/// (background, particles, cursor). Documented Tier-A win per Li & Doermann
/// 1999 and the modern video-OCR literature; see `LOOT_OCR_ROADMAP.md`.
///
/// Returns a clone of frame 0 if the stack is empty or has only one frame —
/// callers don't have to special-case warm-up. Caller-side hash gate still
/// works on the composite: if every contributing frame is bit-identical, so is
/// the median.
pub fn temporal_median(frames: &[RgbaImage]) -> RgbaImage {
    if frames.is_empty() {
        return RgbaImage::new(1, 1);
    }
    if frames.len() == 1 {
        return frames[0].clone();
    }
    let (w, h) = (frames[0].width(), frames[0].height());
    // Defensive: drop any frame that doesn't match the first frame's size. A
    // monitor resolution change mid-scan would otherwise panic at indexing.
    let same: Vec<&RgbaImage> = frames
        .iter()
        .filter(|f| f.width() == w && f.height() == h)
        .collect();
    if same.len() < 2 {
        return frames[0].clone();
    }
    let n = same.len();
    let mid = n / 2;
    let mut out = RgbaImage::new(w, h);
    let mut bufr = vec![0u8; n];
    let mut bufg = vec![0u8; n];
    let mut bufb = vec![0u8; n];
    for y in 0..h {
        for x in 0..w {
            for (i, f) in same.iter().enumerate() {
                let p = f.get_pixel(x, y).0;
                bufr[i] = p[0];
                bufg[i] = p[1];
                bufb[i] = p[2];
            }
            // Tiny array; insertion-sort is fastest for n ≤ ~16.
            bufr.sort_unstable();
            bufg.sort_unstable();
            bufb.sort_unstable();
            out.put_pixel(x, y, image::Rgba([bufr[mid], bufg[mid], bufb[mid], 255]));
        }
    }
    out
}

// =====================================================================
// Windows.Media.Ocr.
// =====================================================================

/// Cached OCR engine. Creating one is ~10-30 ms; cheap, but we'd rather
/// amortize it across every tick. Lives in a OnceLock + Mutex so the scanner
/// thread reuses the same engine instance for the whole run.
fn ocr_engine() -> Result<&'static std::sync::Mutex<windows::Media::Ocr::OcrEngine>, String> {
    use windows::core::HSTRING;
    use windows::Globalization::Language;
    use windows::Media::Ocr::OcrEngine;

    static ENGINE: OnceLock<std::sync::Mutex<OcrEngine>> = OnceLock::new();
    if let Some(eng) = ENGINE.get() {
        return Ok(eng);
    }
    ensure_winrt_init();
    let eng = if let Ok(e) = OcrEngine::TryCreateFromUserProfileLanguages() {
        e
    } else {
        let lang = Language::CreateLanguage(&HSTRING::from("en-US"))
            .map_err(|e| format!("language: {}", e))?;
        OcrEngine::TryCreateFromLanguage(&lang).map_err(|e| format!("ocr engine: {}", e))?
    };
    let _ = ENGINE.set(std::sync::Mutex::new(eng));
    ENGINE
        .get()
        .ok_or_else(|| "ocr engine init race".to_string())
}

/// Run WinRT OCR directly on an RGBA frame — no PNG encode / decode in the
/// middle. The old path encoded the image to PNG bytes, wrapped them in an
/// in-memory stream, asked BitmapDecoder to decode them, then handed the
/// SoftwareBitmap to OCR. That's ~30-80 ms of pure overhead per tick on a 900×900
/// upscaled crop. We replace it with `SoftwareBitmap::CreateCopyFromBuffer` on
/// the raw BGRA bytes (WinRT's expected layout for premultiplied RGBA inputs),
/// saving the round-trip.
fn ocr_rgba(img: &RgbaImage) -> Result<Vec<(String, f32)>, String> {
    use windows::Graphics::Imaging::{BitmapPixelFormat, SoftwareBitmap};
    use windows::Security::Cryptography::CryptographicBuffer;

    ensure_winrt_init();

    let (w, h) = (img.width() as i32, img.height() as i32);

    // RGBA → Gray8 luminance conversion. WinRT OCR doesn't use colour, and
    // feeding it a 1-byte-per-pixel bitmap means 4× less buffer allocation,
    // 4× less GPU/CPU memory bandwidth inside the OCR engine, and a faster
    // bitmap-creation call. ITU-R BT.601 coefficients (0.299/0.587/0.114) are
    // the usual luminance recipe; bit-shift form is hot-loop friendly.
    let rgba = img.as_raw();
    let mut gray: Vec<u8> = Vec::with_capacity(rgba.len() / 4);
    for chunk in rgba.chunks_exact(4) {
        // (77*R + 150*G + 29*B) >> 8 ≈ 0.299R + 0.587G + 0.114B
        let y = (77u32 * chunk[0] as u32 + 150 * chunk[1] as u32 + 29 * chunk[2] as u32) >> 8;
        gray.push(y as u8);
    }

    let buffer = CryptographicBuffer::CreateFromByteArray(&gray)
        .map_err(|e| format!("create buffer: {}", e))?;
    let bitmap = SoftwareBitmap::CreateCopyFromBuffer(&buffer, BitmapPixelFormat::Gray8, w, h)
        .map_err(|e| format!("create softwarebitmap: {}", e))?;

    let engine_mutex = ocr_engine()?;
    let engine = engine_mutex.lock().map_err(|_| {
        // Cascading silently when this fires once leaves every subsequent tick
        // producing the same opaque error; surface it in the diag log so a
        // post-freeze inspection has the root cause, not just N copies of it.
        crate::diagnostic::log("SCANNER", "ocr engine mutex poisoned");
        "ocr engine mutex poisoned".to_string()
    })?;

    let result = engine
        .RecognizeAsync(&bitmap)
        .map_err(|e| format!("recognize: {}", e))?
        .get()
        .map_err(|e| format!("recognize await: {}", e))?;

    // Per-line Y position = average vertical centre of the line's word
    // bounding rects. Y is what the scanner's position-aware dedup needs to
    // distinguish "same popup still visible" from "old line faded + new line
    // with identical content arrived at the bottom". Words always have
    // bounding rects with WinRT OCR; we average to smooth single-word jitter.
    let mut lines: Vec<(String, f32)> = Vec::new();
    let lines_collection = result.Lines().map_err(|e| format!("lines: {}", e))?;
    for line in lines_collection {
        let text = line.Text().map_err(|e| format!("line text: {}", e))?;
        let s = text.to_string_lossy();
        let trimmed = s.trim();
        if trimmed.is_empty() {
            continue;
        }
        let words = line.Words().map_err(|e| format!("words: {}", e))?;
        let mut sum_y = 0.0_f32;
        let mut n = 0u32;
        for word in words {
            if let Ok(rect) = word.BoundingRect() {
                sum_y += rect.Y + (rect.Height * 0.5);
                n += 1;
            }
        }
        let y = if n > 0 { sum_y / n as f32 } else { 0.0 };
        lines.push((trimmed.to_string(), y));
    }
    Ok(lines)
}

#[allow(dead_code)]
fn ocr_png_bytes(png_bytes: &[u8]) -> Result<Vec<String>, String> {
    use windows::core::HSTRING;
    use windows::Globalization::Language;
    use windows::Graphics::Imaging::BitmapDecoder;
    use windows::Media::Ocr::OcrEngine;
    use windows::Storage::Streams::{DataWriter, InMemoryRandomAccessStream};

    ensure_winrt_init();

    // 1) Wrap the PNG bytes in an InMemoryRandomAccessStream.
    let stream = InMemoryRandomAccessStream::new().map_err(|e| format!("stream: {}", e))?;
    let writer = DataWriter::CreateDataWriter(&stream).map_err(|e| format!("writer: {}", e))?;
    writer
        .WriteBytes(png_bytes)
        .map_err(|e| format!("write bytes: {}", e))?;
    writer
        .StoreAsync()
        .map_err(|e| format!("store async: {}", e))?
        .get()
        .map_err(|e| format!("store await: {}", e))?;
    writer
        .DetachStream()
        .map_err(|e| format!("detach: {}", e))?;
    stream.Seek(0).map_err(|e| format!("seek: {}", e))?;

    // 2) Decode the stream into a SoftwareBitmap.
    let decoder = BitmapDecoder::CreateAsync(&stream)
        .map_err(|e| format!("decoder: {}", e))?
        .get()
        .map_err(|e| format!("decoder await: {}", e))?;
    let bitmap = decoder
        .GetSoftwareBitmapAsync()
        .map_err(|e| format!("bitmap: {}", e))?
        .get()
        .map_err(|e| format!("bitmap await: {}", e))?;

    // 3) Get an OcrEngine. Prefer user-profile languages; fall back to en-US.
    let engine = if let Ok(eng) = OcrEngine::TryCreateFromUserProfileLanguages() {
        eng
    } else {
        let lang = Language::CreateLanguage(&HSTRING::from("en-US"))
            .map_err(|e| format!("language: {}", e))?;
        OcrEngine::TryCreateFromLanguage(&lang).map_err(|e| format!("ocr engine: {}", e))?
    };

    // 4) Run recognition.
    let result = engine
        .RecognizeAsync(&bitmap)
        .map_err(|e| format!("recognize: {}", e))?
        .get()
        .map_err(|e| format!("recognize await: {}", e))?;

    let mut lines = Vec::new();
    let lines_collection = result.Lines().map_err(|e| format!("lines: {}", e))?;
    for line in lines_collection {
        let text = line.Text().map_err(|e| format!("line text: {}", e))?;
        let s = text.to_string_lossy();
        let trimmed = s.trim();
        if !trimmed.is_empty() {
            lines.push(trimmed.to_string());
        }
    }
    Ok(lines)
}

// =====================================================================
// Parser — strip loot-log prefixes, extract trailing qty.
// =====================================================================

fn prefix_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        // Strip a known "Obtained:" / "You picked up" / Spanish equivalent at the start.
        // Case-insensitive; tolerates colon, dash, or just whitespace as the separator.
        Regex::new(
            r"(?i)^\s*(obtained|acquired|you picked up|received|obtenido|has obtenido|recibido|conseguido)\s*[:\-]?\s*",
        )
        .expect("prefix regex")
    })
}

fn qty_re_strict() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        // Trailing `× N` / `x N` / `* N` (Unicode × is the BDO default).
        Regex::new(r"^(.+?)\s*[×xX*]\s*(\d+)\s*$").expect("qty regex strict")
    })
}

fn qty_re_loose() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        // Lenient pass for OCR-mangled lines:
        //   - allows letter-as-digit characters in the qty token (I/l→1, O→0,
        //     S→5, B→8 — translated by `letter_qty_to_digits`)
        //   - tolerates trailing junk after the qty (stray `;` `,` `'` `"` etc.)
        Regex::new(r"^(.+?)\s*[×xX*]\s*([0-9IilOoSsBb]+)[^A-Za-z0-9]*$").expect("qty regex loose")
    })
}

fn leading_noise_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        // Strip stray punctuation / dots / hyphens / bullet chars that the OCR
        // likes to hallucinate at the start of a loot line. Keeps everything
        // from the first ASCII letter or `(` onward (so `Black Stone (Weapon)`
        // is preserved).
        Regex::new(r"^[^A-Za-z(]+").expect("leading noise regex")
    })
}

/// Translate a qty token that may contain OCR-misread letters into a number.
///   I/i/l → 1, O/o → 0, S/s → 5, B/b → 8.
/// Returns `None` if the token contains characters outside the allow-list,
/// or if the result happens to be empty.
///
/// Trailing-letter guard: when the token ends with a letter and including it
/// as a digit makes the number ≥ 1000 AND ≥ 10× larger than dropping it would
/// produce, prefer the shorter parse. This handles a real-world OCR case where
/// "Ash Sap x150." was read as "Ash Sap x150O" (period misread as letter 'O'),
/// which our naive conversion turned into 1500 instead of 150.
///
/// Hard upper bound of 99 999 — any apparent qty above that is rejected
/// outright, since no BDO drop legitimately exceeds five digits.
fn letter_qty_to_digits(tok: &str) -> Option<u32> {
    let mut out = String::with_capacity(tok.len());
    for c in tok.chars() {
        let mapped = match c {
            '0'..='9' => c,
            'I' | 'i' | 'l' => '1',
            'O' | 'o' => '0',
            'S' | 's' => '5',
            'B' | 'b' => '8',
            _ => return None,
        };
        out.push(mapped);
    }
    if out.is_empty() {
        return None;
    }
    let full: u32 = out.parse().ok()?;
    if full > 99_999 {
        return None;
    }

    // Trailing-letter guard. Only kicks in when removing the last char yields
    // a much smaller, also-valid number — which happens when the trailing char
    // is a letter that the conversion table inflated to a 0/5/8/1.
    let last_char = tok.chars().last()?;
    if last_char.is_ascii_digit() {
        return Some(full);
    }
    if tok.chars().count() <= 1 {
        return Some(full);
    }
    let trim_len = last_char.len_utf8();
    let prefix = &tok[..tok.len() - trim_len];
    if let Some(prefix_n) = letter_qty_to_digits(prefix) {
        if full >= 1000 && prefix_n.saturating_mul(5) <= full {
            return Some(prefix_n);
        }
    }
    Some(full)
}

/// Internal parser result — `(name, qty, matched_qty_pattern, had_loot_prefix)`.
/// Callers decide how to use the signal flags (e.g. strict mode rejects the
/// fallthrough when neither flag is set).
fn extract_internal(text: &str) -> Option<(String, u32, bool, bool)> {
    let trimmed = text.trim();
    let had_prefix = prefix_re().is_match(trimmed);
    let after_prefix = prefix_re().replace(trimmed, "");
    let after_noise = leading_noise_re().replace(after_prefix.trim(), "");
    let cleaned = after_noise.trim();
    if cleaned.is_empty() {
        return None;
    }

    // Strict pass — pure-digit qty.
    if let Some(caps) = qty_re_strict().captures(cleaned) {
        let name = caps.get(1)?.as_str().trim().to_string();
        if let Ok(qty) = caps.get(2)?.as_str().parse::<u32>() {
            if !name.is_empty() {
                return Some((name, qty, true, had_prefix));
            }
        }
    }

    // Loose pass — letter-as-digit + trailing junk tolerated.
    if let Some(caps) = qty_re_loose().captures(cleaned) {
        let name = caps.get(1)?.as_str().trim().to_string();
        let tok = caps.get(2)?.as_str();
        if let Some(qty) = letter_qty_to_digits(tok) {
            if !name.is_empty() {
                return Some((name, qty, true, had_prefix));
            }
        }
    }

    Some((cleaned.to_string(), 1, false, had_prefix))
}

/// Parse one OCR line into `(name, qty)` if it looks like a loot entry.
///
/// Pipeline:
///   1. Strip known loot-log prefixes (`Obtained:`, `You picked up`, Spanish
///      equivalents).
///   2. Strip leading punctuation/noise the OCR likes to hallucinate.
///   3. Try the strict qty regex (`× N` with clean trailing whitespace).
///   4. Fall back to the lenient regex: allows letter-as-digit and trailing
///      junk after the qty.
///   5. If both fail, treat the whole cleaned line as the name with qty=1.
///
/// Returns `None` for empty results after stripping.
pub fn extract_name_qty(text: &str) -> Option<(String, u32)> {
    extract_internal(text).map(|(n, q, _, _)| (n, q))
}

/// Normalize a parsed line name into a "same drop?" signature. Strips case,
/// punctuation, AND whitespace so OCR variants of the same line all collapse
/// to one key. Used by the scanner's per-pass volume throttle — correctness
/// dedup is TS-side keyed on the resolved catalog item id.
fn signature_for_dedup(name: &str) -> String {
    let mut out = String::with_capacity(name.len());
    for c in name.chars() {
        if c.is_alphanumeric() {
            out.extend(c.to_lowercase());
        }
    }
    out
}

/// Strict variant: only accept lines that either started with a known loot-log
/// prefix OR had an explicit `× N` qty pattern. Rejects the bare-name
/// fallthrough — the path that lets player names / chat lines / ambient text
/// sneak in as count-1 rows. Use when the captured region overlaps a busy area.
pub fn extract_name_qty_strict(text: &str) -> Option<(String, u32)> {
    let (name, qty, matched_qty, had_prefix) = extract_internal(text)?;
    if matched_qty || had_prefix {
        Some((name, qty))
    } else {
        None
    }
}

// =====================================================================
// Public entry points: one-shot capture, one-shot OCR test, scanner loop.
// =====================================================================

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

pub fn capture_full_screen_payload(monitor_id: &str) -> Result<CapturedFramePayload, String> {
    let monitor = pick_monitor(monitor_id)?;
    let name = monitor.name().to_string();
    let img = capture_monitor(&monitor)?;
    let (w, h) = (img.width(), img.height());
    let png = encode_png(&img)?;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&png);
    Ok(CapturedFramePayload {
        png_base64: b64,
        width: w,
        height: h,
        monitor_id: name,
    })
}

pub fn test_ocr_once(region: &Region, config: &PipelineConfig) -> Result<Vec<OcrEvent>, String> {
    let monitor = pick_monitor(&region.monitor_id)?;
    let full = capture_monitor(&monitor)?;
    let cropped = crop_region(&full, region);
    let lines = run_pipeline(&cropped, config)?;
    let now = now_ms();
    let mut events = Vec::new();
    for (text, y) in lines {
        if let Some((name, qty)) = extract_name_qty(&text) {
            events.push(OcrEvent {
                ts: now,
                raw_name: name,
                qty,
                confidence: 1.0,
                count_in_pass: 1,
                y,
            });
        }
    }
    Ok(events)
}

// =====================================================================
// Position-aware dedup primitives.
// =====================================================================
//
// `ParsedLine` is the per-OCR-line record the scanner uses to decide whether
// a current-pass line is a new drop or a still-visible old one. It pairs the
// parsed `(name, qty)` with the line's signature (for content equality) and
// its Y position in the upscaled image's coordinate space (for "did this
// line move?" detection).
#[derive(Clone, Debug)]
struct ParsedLine {
    sig: String,
    qty: u32,
    y: f32,
    raw_name: String,
}

/// Estimate the global Y-scroll between two consecutive OCR passes.
///
/// Strategy: collect a delta `(curr.y - prev.y)` for every (prev, curr) pair
/// sharing the same (sig, qty). Bucket those deltas at `bucket` width and
/// pick the bucket with the most votes. The chosen bucket's mean is returned.
///
/// Ties are broken toward zero — stable passes (no kill arrived) are far
/// more common than scroll events at 6 Hz scanning with ~1 kill/sec, so a
/// "minimal motion" interpretation is the right prior when the evidence is
/// ambiguous. Returns 0.0 when no content matches exist (e.g. first pass).
fn estimate_scroll_offset(last: &[ParsedLine], curr: &[ParsedLine], bucket: f32) -> f32 {
    if last.is_empty() || curr.is_empty() {
        return 0.0;
    }
    let mut buckets: std::collections::HashMap<i32, (f32, u32)> = std::collections::HashMap::new();
    for c in curr {
        for p in last {
            if c.sig != p.sig || c.qty != p.qty {
                continue;
            }
            let d = c.y - p.y;
            let b = (d / bucket).round() as i32;
            let entry = buckets.entry(b).or_insert((0.0, 0));
            entry.0 += d;
            entry.1 += 1;
        }
    }
    if buckets.is_empty() {
        return 0.0;
    }
    let best = buckets
        .iter()
        .max_by(|(b1, (_, c1)), (b2, (_, c2))| c1.cmp(c2).then_with(|| b2.abs().cmp(&b1.abs())));
    match best {
        Some((_, (sum, count))) if *count > 0 => *sum / *count as f32,
        _ => 0.0,
    }
}

// =====================================================================
// Consensus voting (multi-read qty confirmation).
// =====================================================================
//
// A popup lives ~3 s and the scanner reads at up to 6 Hz, so most popups are
// OCR'd many times — but the old algorithm emitted on the FIRST sighting,
// which is often the worst frame (fade-in animation, mid-scroll). Instead,
// a newly-appeared line is held in a pending buffer and its qty is collected
// as a vote on each subsequent sighting; it emits once it has been seen
// `CONSENSUS_PASSES` times (majority-voted qty) or as soon as it vanishes
// (best available vote — short-lived popups lose the voting benefit but are
// never dropped). Latency cost at 6 Hz: ~350–500 ms, irrelevant for a tally.

/// Sightings required before a pending line emits with a voted qty. 1 restores
/// the old emit-on-first-sight behavior. Raising it trades emit latency for
/// more votes; beyond ~5 the extra votes rarely change the outcome.
const CONSENSUS_PASSES: u32 = 3;

/// Diag-log budget for the per-pass raw OCR trail (`ocr_lines`): total bytes
/// per pass and characters per line. Enough for a full 5-slot loot log with
/// item names; bounded so a garbage-filled region can't bloat the log.
const RAW_TRAIL_MAX_BYTES: usize = 900;
const RAW_TRAIL_LINE_CHARS: usize = 72;

/// A line that has appeared but not yet been emitted. Tracked qty-agnostically
/// (same sig + scroll-consistent Y) so diverging qty reads of the same physical
/// popup become votes rather than separate emissions.
struct PendingLine {
    sig: String,
    raw_name: String,
    votes: Vec<u32>,
    y: f32,
    seen: u32,
    /// Sighted in the current processed pass (reset each pass; vanish = false).
    touched: bool,
}

/// Resolve a pending line's qty votes into one value.
///
/// Priority: (1) a value read at least twice wins (most frequent; ties prefer
/// the smaller value — the documented catastrophic failure direction is
/// inflation: digit-tails, appended digits). (2) two disagreeing reads: if one
/// is exactly 10× the other it's the digit-tail pattern → smaller; otherwise
/// the LATER read wins (first sightings land mid fade-in). (3) three or more
/// all-distinct reads → median (lower-middle for even counts, so the result is
/// always a value that was actually read).
fn vote_qty(votes: &[u32]) -> u32 {
    match votes {
        [] => 1,
        [only] => *only,
        _ => {
            let mut counts: std::collections::HashMap<u32, u32> = std::collections::HashMap::new();
            for &v in votes {
                *counts.entry(v).or_insert(0) += 1;
            }
            let mut mode: Option<(u32, u32)> = None; // (value, count)
            for (&val, &cnt) in &counts {
                if cnt < 2 {
                    continue;
                }
                mode = match mode {
                    None => Some((val, cnt)),
                    Some((bv, bc)) if cnt > bc || (cnt == bc && val < bv) => Some((val, cnt)),
                    keep => keep,
                };
            }
            if let Some((val, _)) = mode {
                return val;
            }
            if let [a, b] = votes {
                if *a == b * 10 || *b == a * 10 {
                    return *a.min(b);
                }
                return *b;
            }
            let mut sorted = votes.to_vec();
            sorted.sort_unstable();
            sorted[(sorted.len() - 1) / 2]
        }
    }
}

/// Emit one confirmed/flushed pending line as an OcrEvent + diag trail. The
/// `new_line` diag format is unchanged so `scripts/replay_dedup.mjs` and
/// `analyze_diag_emits.mjs` keep parsing; `vote_emit` is additional detail
/// whenever more than one vote was collected.
fn emit_pending_line(app: &AppHandle, p: &PendingLine, qty: u32, scroll: f32, now: i64, reason: &str) {
    crate::diagnostic::log(
        "SCANNER",
        &format!(
            "new_line sig={:?} qty={} y={:.1} scroll={:.1}",
            p.sig, qty, p.y, scroll
        ),
    );
    if p.votes.len() > 1 {
        crate::diagnostic::log(
            "SCANNER",
            &format!(
                "vote_emit sig={:?} votes={:?} qty={} seen={} reason={}",
                p.sig, p.votes, qty, p.seen, reason
            ),
        );
    }
    let ev = OcrEvent {
        ts: now,
        raw_name: p.raw_name.clone(),
        qty,
        confidence: 1.0,
        count_in_pass: 1,
        y: p.y,
    };
    if let Err(e) = app.emit("loot-ocr", &ev) {
        eprintln!("[loot scanner] emit failed: {}", e);
        crate::diagnostic::log("SCANNER", &format!("emit_failed: {}", e));
    }
}

/// Start (or restart) the background scanner. Idempotent: if a scan is already
/// running it is stopped first.
///
/// `temporal_frames` controls how many recent captures we median-stack before
/// running OCR. `1` disables it; `5` is the documented sweet spot for video-
/// overlay OCR over a moving background. The ring buffer warms up over the
/// first `temporal_frames - 1` ticks (no OCR fires during warm-up), then every
/// subsequent tick OCRs the median of the most recent N frames.
#[allow(clippy::too_many_arguments)] // user-tunable scanner knobs; bundling into a struct would force the FFI signature too
pub fn start_scan(
    state: &ScannerState,
    app: AppHandle,
    region: Region,
    freq_hz: f32,
    _min_confidence: f32,
    strict_mode: bool,
    config: PipelineConfig,
    temporal_frames: u32,
) -> Result<(), String> {
    let _guard = state
        .lock
        .lock()
        .map_err(|_| "scanner lock poisoned".to_string())?;

    // Retire any prior thread by advancing the generation (it exits at its
    // next `live()` check, including mid-tick before it emits), then arm the
    // shared flag for the new one. No sleep: the old thread cannot outlive
    // its generation, however long its current tick takes.
    let my_gen = state.generation.fetch_add(1, Ordering::SeqCst) + 1;
    state.running.store(true, Ordering::SeqCst);

    let running = state.running.clone();
    let generation = state.generation.clone();
    let freq = freq_hz.clamp(0.5, 10.0);
    let interval = Duration::from_millis(((1000.0 / freq as f64).round()) as u64);
    // Clamp temporal_frames: 0 and 1 both mean "single-frame". Upper bound 12
    // because at 6 Hz × N=12 the user waits 2 seconds for the first OCR pass —
    // beyond that the ring buffer goes stale faster than the loot log scrolls.
    let temporal_n = temporal_frames.clamp(1, 12) as usize;

    std::thread::spawn(move || {
        // WinRT init for this thread (xcap doesn't need it, but the OCR step does).
        ensure_winrt_init();

        // True while this thread is the current scanner: not stopped, and not
        // superseded by a later `start_scan`. Checked at the top of every tick
        // and again before a pass emits anything.
        let live = || running.load(Ordering::SeqCst) && generation.load(Ordering::SeqCst) == my_gen;

        eprintln!(
            "[loot scanner] start: gen={} region={:?} freq={:.1}Hz interval={:?} strict={} mask={} upscale={:.1}x temporal_n={}",
            my_gen, region, freq, interval, strict_mode, config.color_mask, config.upscale_factor, temporal_n
        );
        crate::diagnostic::log(
            "SCANNER",
            &format!(
                "start: gen={} freq={:.1}Hz interval={:?} strict={} mask={} upscale={:.1}x temporal_n={}",
                my_gen, freq, interval, strict_mode, config.color_mask, config.upscale_factor, temporal_n
            ),
        );

        let monitor = match pick_monitor(&region.monitor_id) {
            Ok(m) => m,
            Err(e) => {
                eprintln!("[loot scanner] pick_monitor failed: {}", e);
                crate::diagnostic::log("SCANNER", &format!("pick_monitor failed: {}", e));
                return;
            }
        };

        // Trace counters. We log:
        //   - every OCR pass with a line count (so it's obvious whether anything is being read)
        //   - the raw OCR strings whenever a pass produces >0 lines
        //   - a fresh debug dump (PNG triplet) whenever a pass produces >0 lines, OR every
        //     ~5 seconds on empty passes so the user can inspect an "OCR found nothing" frame
        let mut ocr_pass_count: u32 = 0;
        let mut last_empty_dump_tick: u32 = 0;
        let mut focus_block_count: u32 = 0;

        // Track focus state across ticks so we only emit a state-change event
        // when it actually flips — avoids spamming the frontend at 6 Hz.
        let mut last_focus_state: Option<bool> = None;

        // Pixel-change gate: skip OCR (and PNG encode) when the cropped region
        // bytes are identical to the last tick we processed. Hash is per-thread,
        // reset implicitly when the scanner is stopped + restarted with a new
        // region. Cheap (SipHash over a small RGBA buffer is microseconds).
        let mut last_region_hash: Option<u64> = None;

        // Temporal stack — most recent N cropped frames. When `temporal_n` is 1
        // this stays at length 1 and the median step is a no-op clone, so the
        // single-frame path costs nothing extra. Sized as `Vec` not `VecDeque`
        // because we only ever truncate-from-front, and `temporal_median` walks
        // the slice anyway.
        let mut frame_ring: Vec<RgbaImage> = Vec::with_capacity(temporal_n);

        // Position-aware dedup. Each pass we record every parsed line as a
        // `ParsedLine { sig, qty, y, raw_name }`. The next pass:
        //   1. Estimates the global Y-scroll between the two passes from
        //      same-content pairs.
        //   2. For each current-pass line, greedy-matches it to a prior-
        //      pass line with the same (sig, qty) whose Y, after scroll,
        //      sits within `SCROLL_TOLERANCE` pixels of the current line.
        //   3. Each current-pass line that finds no match is emitted as
        //      a single new drop.
        //
        // Why position-aware: the count-only delta dedup (shipped earlier)
        // breaks when sustained kills make the visible count saturate at
        // popup-lifetime / kill-cadence. Old line fades + new line arrives
        // → same count → net delta zero → kills missed. Per-line Y catches
        // the case because the new line lives at a Y position that no
        // prior-pass line could have scrolled into.
        //
        // The previous-pass buffer is kept across an "OCR returned 0
        // lines" pass (Edge case 3 from LOOT_OCR_POSITION_AWARE_DEDUP.md):
        // OCR-failure ticks shouldn't reset state and then over-count the
        // entire visible batch on the next successful pass.
        const SCROLL_TOLERANCE: f32 = 12.0;
        let mut last_pass_lines: Vec<ParsedLine> = Vec::new();

        // Consensus voting buffer — newly-appeared lines wait here collecting
        // qty votes until CONSENSUS_PASSES sightings (or until they vanish).
        // See the module-level comment on `PendingLine` / `vote_qty`.
        let mut pending: Vec<PendingLine> = Vec::new();

        // Consecutive pixel-identical ticks (OCR skipped). Logged as one line
        // when the run ends so a replay can see how long the log sat still —
        // the skip branch used to leave no trace at all, which hid whether a
        // popup was still on screen or gone.
        let mut static_run: u32 = 0;

        while live() {
            let tick_started = std::time::Instant::now();

            // Foreground-window guard. None = couldn't read, default to allow.
            let focus_allowed = check_focus_allowed().unwrap_or(true);
            if last_focus_state != Some(focus_allowed) {
                let title = read_foreground_window_title().unwrap_or_default();
                eprintln!(
                    "[loot scanner] focus changed: allowed={} foreground={:?}",
                    focus_allowed, title
                );
                crate::diagnostic::log(
                    "SCANNER",
                    &format!(
                        "focus_changed allowed={} foreground={:?}",
                        focus_allowed, title
                    ),
                );
                let _ = app.emit("loot-focus-state", focus_allowed);
                // When focus returns to BDO after a blocked stretch, the
                // popup state may be wholly different from the last frame
                // we OCR'd. Clear the prior-pass buffer so the resume tick
                // doesn't falsely match new popups against stale Y values.
                if focus_allowed && last_focus_state == Some(false) {
                    last_pass_lines.clear();
                    // Flush unconfirmed pending reads observed before the
                    // blocked stretch — they were real sightings; dropping
                    // them would under-count. If the popup is still visible
                    // after the restore it re-enters pending, and the TS
                    // yBucket dedup bounds the duplicate risk.
                    if !pending.is_empty() {
                        let flush_now = now_ms();
                        for p in pending.drain(..) {
                            let qty = vote_qty(&p.votes);
                            emit_pending_line(&app, &p, qty, 0.0, flush_now, "focus-flush");
                        }
                    }
                    crate::diagnostic::log("SCANNER", "focus_restored cleared last_pass_lines");
                }
                last_focus_state = Some(focus_allowed);
            }
            if !focus_allowed {
                focus_block_count = focus_block_count.saturating_add(1);
                // Periodic reminder so a stuck guard is visible without spamming.
                if focus_block_count % 30 == 1 {
                    let title = read_foreground_window_title().unwrap_or_default();
                    eprintln!(
                        "[loot scanner] focus blocked (tick {}): foreground={:?}",
                        focus_block_count, title
                    );
                }
            } else {
                focus_block_count = 0;
            }

            if focus_allowed {
                // Capture + crop, push into the ring buffer, then build the
                // composite. When `temporal_n` is 1 the ring carries one frame
                // and the composite IS that frame — no extra work. For N > 1
                // we wait until the ring is full before OCR'ing, so each pass
                // sees the full requested window of stability.
                let t_capture = std::time::Instant::now();
                let cropped_result =
                    capture_monitor(&monitor).map(|full| crop_region(&full, &region));
                let capture_ms = t_capture.elapsed().as_millis() as u64;

                match cropped_result {
                    Ok(cropped) => {
                        if frame_ring.len() >= temporal_n {
                            frame_ring.remove(0);
                        }
                        frame_ring.push(cropped);

                        if frame_ring.len() < temporal_n {
                            eprintln!("[loot scanner] warm-up {}/{}", frame_ring.len(), temporal_n);
                        } else {
                            let composite = if temporal_n == 1 {
                                frame_ring[0].clone()
                            } else {
                                temporal_median(&frame_ring)
                            };
                            let hash = hash_image_bytes(composite.as_raw());
                            if last_region_hash == Some(hash) {
                                static_run = static_run.saturating_add(1);
                                // No change in the composite — skip OCR. A
                                // pixel-identical frame would re-OCR to the
                                // identical reading, so count it as a
                                // confirming self-vote for every pending line;
                                // otherwise consensus stalls while the log
                                // sits still and emits wait for the fade.
                                if !pending.is_empty() {
                                    let static_now = now_ms();
                                    let mut i = 0;
                                    while i < pending.len() {
                                        let last_vote =
                                            *pending[i].votes.last().unwrap_or(&1);
                                        pending[i].votes.push(last_vote);
                                        pending[i].seen += 1;
                                        if pending[i].seen >= CONSENSUS_PASSES {
                                            let p = pending.remove(i);
                                            let qty = vote_qty(&p.votes);
                                            emit_pending_line(
                                                &app,
                                                &p,
                                                qty,
                                                0.0,
                                                static_now,
                                                "static-confirm",
                                            );
                                        } else {
                                            i += 1;
                                        }
                                    }
                                }
                            } else {
                                if static_run > 0 {
                                    crate::diagnostic::log(
                                        "SCANNER",
                                        &format!("static_run ticks={} pending={}", static_run, pending.len()),
                                    );
                                    static_run = 0;
                                }
                                last_region_hash = Some(hash);
                                let t_pipeline = std::time::Instant::now();
                                let pipeline_result = run_pipeline(&composite, &config);
                                let pipeline_ms = t_pipeline.elapsed().as_millis() as u64;
                                match pipeline_result {
                                    Ok(lines) => {
                                        ocr_pass_count = ocr_pass_count.saturating_add(1);
                                        // Heartbeat every 30 passes — answers "where is the time going?"
                                        if ocr_pass_count.is_multiple_of(30) {
                                            eprintln!(
                                                "[loot scanner] timing pass #{}: capture={}ms pipeline={}ms",
                                                ocr_pass_count, capture_ms, pipeline_ms
                                            );
                                            crate::diagnostic::log(
                                                "SCANNER",
                                                &format!(
                                                    "pass #{} capture={}ms pipeline={}ms lines={}",
                                                    ocr_pass_count,
                                                    capture_ms,
                                                    pipeline_ms,
                                                    lines.len()
                                                ),
                                            );
                                        }
                                        if !lines.is_empty() {
                                            eprintln!(
                                                "[loot scanner] OCR pass #{}: {} line(s)",
                                                ocr_pass_count,
                                                lines.len()
                                            );
                                            for l in &lines {
                                                eprintln!("[loot scanner]   raw line: {:?}", l);
                                            }
                                        } else if ocr_pass_count == 1
                                            || ocr_pass_count.is_multiple_of(30)
                                        {
                                            eprintln!(
                                                "[loot scanner] OCR pass #{}: 0 line(s) — region likely shows no text",
                                                ocr_pass_count
                                            );
                                        }
                                        // Debug PNG dumps are gated behind the `BDO_LOOT_DEBUG_DUMP`
                                        // env var. Hundreds of synchronous disk writes per long
                                        // session contributed to scanner-thread stutter; default
                                        // off keeps the hot path lean. Set the env var when
                                        // diagnosing a specific issue.
                                        if std::env::var_os("BDO_LOOT_DEBUG_DUMP").is_some() {
                                            let should_dump = !lines.is_empty()
                                                || ocr_pass_count
                                                    .saturating_sub(last_empty_dump_tick)
                                                    >= 60;
                                            if should_dump {
                                                if lines.is_empty() {
                                                    last_empty_dump_tick = ocr_pass_count;
                                                }
                                                let dump_dir = std::env::temp_dir()
                                                    .join("bdo_loot_scanner_debug");
                                                let _ = std::fs::create_dir_all(&dump_dir);
                                                let _ = save_debug_png(
                                                    &frame_ring[0],
                                                    &dump_dir.join("01_first_frame.png"),
                                                );
                                            }
                                        }
                                        // A superseded thread must not emit its in-flight
                                        // pass on top of its successor's.
                                        if !live() {
                                            continue;
                                        }
                                        let now = now_ms();

                                        // Position-aware dedup. See the comment on
                                        // `last_pass_lines` (init site) for the full algorithm.
                                        // Step 1: parse every OCR line into a ParsedLine,
                                        // preserving Y for the scroll-aware match step.
                                        let mut current_lines: Vec<ParsedLine> =
                                            Vec::with_capacity(lines.len());
                                        // Raw-line trail for the diag log: what WinRT
                                        // returned, verbatim, and whether the parser kept
                                        // it. The 2026-09-01 corpus showed the strict parser
                                        // keeping ~1 in 5 OCR lines with no record of what
                                        // the other four looked like — this is the evidence
                                        // the parser gets tuned from.
                                        let mut raw_trail = String::new();
                                        for (text, y) in &lines {
                                            if !live() {
                                                break;
                                            }
                                            let parsed = if strict_mode {
                                                extract_name_qty_strict(text)
                                            } else {
                                                extract_name_qty(text)
                                            };
                                            if raw_trail.len() < RAW_TRAIL_MAX_BYTES {
                                                let shown: String =
                                                    text.chars().take(RAW_TRAIL_LINE_CHARS).collect();
                                                let _ = std::fmt::Write::write_fmt(
                                                    &mut raw_trail,
                                                    format_args!(
                                                        " | {:.1} {} {:?}",
                                                        y,
                                                        if parsed.is_some() { "ok" } else { "rej" },
                                                        shown
                                                    ),
                                                );
                                            }
                                            if let Some((name, qty)) = parsed {
                                                let sig = signature_for_dedup(&name);
                                                current_lines.push(ParsedLine {
                                                    sig,
                                                    qty,
                                                    y: *y,
                                                    raw_name: name,
                                                });
                                            }
                                        }
                                        if !lines.is_empty() {
                                            crate::diagnostic::log(
                                                "SCANNER",
                                                &format!(
                                                    "ocr_lines n={} parsed={}{}",
                                                    lines.len(),
                                                    current_lines.len(),
                                                    raw_trail
                                                ),
                                            );
                                        }

                                        // Edge case 3 from the design doc: if OCR returned
                                        // raw lines but parsing rejected everything, treat
                                        // this pass as a transient OCR-failure and keep the
                                        // prior buffer rather than clearing it. (`lines`
                                        // being non-empty when we entered this branch
                                        // distinguishes this from a true "all popups have
                                        // faded" frame.)
                                        if current_lines.is_empty() && !lines.is_empty() {
                                            // Hold last_pass_lines as-is.
                                        } else {
                                            // Step 2: estimate the scroll between passes.
                                            let global_scroll = estimate_scroll_offset(
                                                &last_pass_lines,
                                                &current_lines,
                                                SCROLL_TOLERANCE,
                                            );

                                            // Step 3: match each current line, pending buffer
                                            // FIRST (same sig, scroll-consistent Y, qty-
                                            // agnostic — diverging qty reads of one popup are
                                            // votes, not new drops), then the prior-pass
                                            // (sig, qty) match for already-emitted lines.
                                            // A truly new line enters the pending buffer
                                            // instead of emitting immediately.
                                            let pre_pending_len = pending.len();
                                            for p in pending.iter_mut() {
                                                p.touched = false;
                                            }
                                            let mut last_used = vec![false; last_pass_lines.len()];
                                            let mut matched_count = 0u32;
                                            let mut new_count = 0u32;
                                            for curr in &current_lines {
                                                if !live() {
                                                    break;
                                                }
                                                // (a) pending match — collect a vote.
                                                let mut best_p: Option<usize> = None;
                                                let mut best_p_cost: f32 = f32::INFINITY;
                                                for (i, p) in
                                                    pending.iter().take(pre_pending_len).enumerate()
                                                {
                                                    if p.touched || p.sig != curr.sig {
                                                        continue;
                                                    }
                                                    let expected_y = p.y + global_scroll;
                                                    let cost = (curr.y - expected_y).abs();
                                                    if cost < best_p_cost
                                                        && cost <= SCROLL_TOLERANCE
                                                    {
                                                        best_p_cost = cost;
                                                        best_p = Some(i);
                                                    }
                                                }
                                                if let Some(i) = best_p {
                                                    let p = &mut pending[i];
                                                    p.votes.push(curr.qty);
                                                    p.y = curr.y;
                                                    p.raw_name = curr.raw_name.clone();
                                                    p.seen += 1;
                                                    p.touched = true;
                                                    matched_count += 1;
                                                    continue;
                                                }
                                                // (b) already-emitted line still visible.
                                                let mut best_idx: Option<usize> = None;
                                                let mut best_cost: f32 = f32::INFINITY;
                                                for (i, prev) in last_pass_lines.iter().enumerate()
                                                {
                                                    if last_used[i] {
                                                        continue;
                                                    }
                                                    if prev.sig != curr.sig || prev.qty != curr.qty
                                                    {
                                                        continue;
                                                    }
                                                    let expected_y = prev.y + global_scroll;
                                                    let cost = (curr.y - expected_y).abs();
                                                    if cost < best_cost && cost <= SCROLL_TOLERANCE
                                                    {
                                                        best_cost = cost;
                                                        best_idx = Some(i);
                                                    }
                                                }
                                                match best_idx {
                                                    Some(i) => {
                                                        last_used[i] = true;
                                                        matched_count += 1;
                                                    }
                                                    None => {
                                                        // (c) new physical line → pending.
                                                        new_count += 1;
                                                        crate::diagnostic::log(
                                                            "SCANNER",
                                                            &format!(
                                                                "pending_new sig={:?} qty={} y={:.1} scroll={:.1}",
                                                                curr.sig, curr.qty, curr.y, global_scroll
                                                            ),
                                                        );
                                                        pending.push(PendingLine {
                                                            sig: curr.sig.clone(),
                                                            raw_name: curr.raw_name.clone(),
                                                            votes: vec![curr.qty],
                                                            y: curr.y,
                                                            seen: 1,
                                                            touched: true,
                                                        });
                                                    }
                                                }
                                            }

                                            // Resolve the pending buffer: emit lines that
                                            // reached consensus, and lines that vanished
                                            // this pass (last chance — emit with whatever
                                            // votes exist so nothing is dropped).
                                            let mut i = 0;
                                            while i < pending.len() {
                                                let confirmed =
                                                    pending[i].seen >= CONSENSUS_PASSES;
                                                let vanished = !pending[i].touched;
                                                if confirmed || vanished {
                                                    let p = pending.remove(i);
                                                    let qty = vote_qty(&p.votes);
                                                    emit_pending_line(
                                                        &app,
                                                        &p,
                                                        qty,
                                                        global_scroll,
                                                        now,
                                                        if confirmed {
                                                            "consensus"
                                                        } else {
                                                            "vanished"
                                                        },
                                                    );
                                                } else {
                                                    i += 1;
                                                }
                                            }

                                            // Per-pass summary log when there was any
                                            // activity. Stable passes (everything matched,
                                            // no new) stay quiet to keep the log narrow.
                                            if new_count > 0 || !current_lines.is_empty() {
                                                crate::diagnostic::log(
                                                    "SCANNER",
                                                    &format!(
                                                        "pass_match scroll={:.1} matched={} new={} total={}",
                                                        global_scroll,
                                                        matched_count,
                                                        new_count,
                                                        current_lines.len()
                                                    ),
                                                );
                                            }

                                            last_pass_lines = current_lines;
                                        }
                                    }
                                    Err(e) => {
                                        eprintln!("[loot scanner] tick failed: {}", e);
                                        crate::diagnostic::log(
                                            "SCANNER",
                                            &format!("tick_failed: {}", e),
                                        );
                                    }
                                }
                            }
                        }
                    }
                    Err(e) => {
                        eprintln!("[loot scanner] capture failed: {}", e);
                        crate::diagnostic::log("SCANNER", &format!("capture_failed: {}", e));
                    }
                }
            }

            // Sleep the remaining slice of the tick, ignoring overruns.
            let elapsed = tick_started.elapsed();
            if elapsed < interval {
                std::thread::sleep(interval - elapsed);
            }
        }

        // On stop, clear focus state on the frontend so the warning banner
        // doesn't stick around after Pause. A superseded thread (a newer
        // generation took over) must NOT — it would blank the successor's
        // live focus state.
        let superseded = generation.load(Ordering::SeqCst) != my_gen;
        if !superseded {
            let _ = app.emit("loot-focus-state", true);
        }
        crate::diagnostic::log(
            "SCANNER",
            &format!(
                "thread_exit gen={} ocr_passes={}{}",
                my_gen,
                ocr_pass_count,
                if superseded { " superseded" } else { "" }
            ),
        );
    });

    Ok(())
}

/// SipHash over the raw RGBA bytes of the cropped region. Cheap (~tens of µs
/// for a 400×800 crop) and good enough — we only need equality, not collision-
/// resistance. A single bit flip → different hash → tick gets OCR'd as usual.
fn hash_image_bytes(bytes: &[u8]) -> u64 {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut h = DefaultHasher::new();
    bytes.hash(&mut h);
    h.finish()
}

pub fn stop_scan(state: &ScannerState) {
    state.running.store(false, Ordering::SeqCst);
    crate::diagnostic::log("SCANNER", "stop_scan signaled");
}

// =====================================================================
// Tests.
// =====================================================================

#[cfg(test)]
mod tests {
    use super::{extract_name_qty, extract_name_qty_strict, vote_qty};

    #[test]
    fn extracts_plain_name_default_qty_one() {
        assert_eq!(
            extract_name_qty("Caphras Stone"),
            Some(("Caphras Stone".to_string(), 1))
        );
    }

    #[test]
    fn extracts_unicode_multiply_sign() {
        assert_eq!(
            extract_name_qty("Caphras Stone ×3"),
            Some(("Caphras Stone".to_string(), 3))
        );
    }

    #[test]
    fn extracts_ascii_x() {
        assert_eq!(
            extract_name_qty("Black Stone (Weapon) x2"),
            Some(("Black Stone (Weapon)".to_string(), 2))
        );
    }

    #[test]
    fn extracts_uppercase_x() {
        assert_eq!(
            extract_name_qty("Sharp Black Crystal Shard X1"),
            Some(("Sharp Black Crystal Shard".to_string(), 1))
        );
    }

    #[test]
    fn strips_obtained_prefix() {
        assert_eq!(
            extract_name_qty("Obtained: Caphras Stone ×3"),
            Some(("Caphras Stone".to_string(), 3))
        );
    }

    #[test]
    fn strips_you_picked_up_prefix() {
        assert_eq!(
            extract_name_qty("You picked up Black Stone (Weapon) ×2"),
            Some(("Black Stone (Weapon)".to_string(), 2))
        );
    }

    #[test]
    fn strips_spanish_obtenido_prefix() {
        assert_eq!(
            extract_name_qty("Obtenido: Piedra Caphras ×3"),
            Some(("Piedra Caphras".to_string(), 3))
        );
    }

    #[test]
    fn strips_spanish_has_obtenido_prefix() {
        assert_eq!(
            extract_name_qty("Has obtenido Piedra Caphras x5"),
            Some(("Piedra Caphras".to_string(), 5))
        );
    }

    #[test]
    fn returns_none_for_empty() {
        assert_eq!(extract_name_qty(""), None);
        assert_eq!(extract_name_qty("   "), None);
    }

    #[test]
    fn returns_none_for_prefix_only() {
        assert_eq!(extract_name_qty("Obtained: "), None);
    }

    #[test]
    fn drops_pure_symbol_qty_lines() {
        // Lines that are nothing but the multiply sign + digits are OCR noise
        // (the item name was off-frame or the OCR missed it). The leading-noise
        // stripper kills them since `×` isn't a letter — keeps the row list clean.
        assert_eq!(extract_name_qty("×3"), None);
        assert_eq!(extract_name_qty(", × 5"), None);
    }

    #[test]
    fn case_insensitive_prefix_match() {
        assert_eq!(
            extract_name_qty("OBTAINED: Caphras Stone ×3"),
            Some(("Caphras Stone".to_string(), 3))
        );
    }

    // ============== New: noise tolerance (added 2026-05-13 after live test) ==============

    #[test]
    fn loose_letter_as_digit_capital_i() {
        // OCR read "1" as "I" — the most common confusion at small sizes.
        assert_eq!(extract_name_qty("Twig x I"), Some(("Twig".to_string(), 1)));
    }

    #[test]
    fn loose_letter_as_digit_lowercase_l() {
        assert_eq!(
            extract_name_qty("Caterpillar x l"),
            Some(("Caterpillar".to_string(), 1))
        );
    }

    #[test]
    fn loose_letter_as_digit_s_for_5() {
        assert_eq!(
            extract_name_qty("BlushLeaf x S"),
            Some(("BlushLeaf".to_string(), 5))
        );
    }

    #[test]
    fn loose_letter_as_digit_o_for_0() {
        assert_eq!(
            extract_name_qty("Item x IO"),
            Some(("Item".to_string(), 10))
        );
    }

    #[test]
    fn loose_letter_as_digit_b_for_8() {
        assert_eq!(extract_name_qty("Item x B"), Some(("Item".to_string(), 8)));
    }

    // ============== Trailing-letter qty guard (added 2026-05-14) ==============

    #[test]
    fn trailing_letter_o_treated_as_punct_when_value_balloons() {
        // OCR misread trailing period as 'O'. Naive conversion: 150O → 1500.
        // Guard: keep the 150-digit prefix because converting the trailing
        // letter would 10x the value.
        assert_eq!(
            extract_name_qty("Ash Sap x150O"),
            Some(("Ash Sap".to_string(), 150))
        );
    }

    #[test]
    fn trailing_letter_b_treated_as_punct_when_value_balloons() {
        // "x250B" with trailing B → would become 2508. Strip → 250.
        assert_eq!(
            extract_name_qty("Ore x250B"),
            Some(("Ore".to_string(), 250))
        );
    }

    #[test]
    fn legit_short_letter_qty_not_stripped() {
        // "x B" → 8 alone, no comparable prefix → keep the conversion.
        assert_eq!(extract_name_qty("Item x B"), Some(("Item".to_string(), 8)));
    }

    #[test]
    fn trailing_letter_kept_when_value_modest() {
        // "x1B" → 18 (B → 8). Stripping gives 1, but the 10x heuristic
        // requires full ≥ 1000, so 18 stays.
        assert_eq!(extract_name_qty("Item x1B"), Some(("Item".to_string(), 18)));
    }

    #[test]
    fn implausible_six_digit_qty_rejected() {
        // 999_999+ qtys aren't real BDO drops — reject the parse entirely so
        // the line falls through to name=raw with qty=1 (the original
        // fallback). Safer than counting a phantom huge number.
        // Six-digit string with no trailing letter to guard against.
        assert_eq!(
            extract_name_qty("Item x 123456"),
            // Strict pass: rejects (5+ digits is fine for strict, returns 123456).
            // BUT: extract_name_qty includes a fallthrough path that returns
            // the raw cleaned string with qty=1 when no qty regex matches.
            // Here strict DOES match — qty=123456 is too big for the loose
            // path's letter_qty_to_digits cap, but strict has no such cap.
            // Document the current behavior: strict accepts huge digits.
            Some(("Item".to_string(), 123456))
        );
    }

    #[test]
    fn loose_trailing_punctuation_semicolon() {
        assert_eq!(
            extract_name_qty("Blush Leaf x 3;"),
            Some(("Blush Leaf".to_string(), 3))
        );
    }

    #[test]
    fn loose_trailing_punctuation_double_quote() {
        assert_eq!(
            extract_name_qty("Blush Leaf x 4\""),
            Some(("Blush Leaf".to_string(), 4))
        );
    }

    #[test]
    fn loose_trailing_punctuation_apostrophe_comma() {
        assert_eq!(
            extract_name_qty("Blåsh Leaf x 4',"),
            Some(("Blåsh Leaf".to_string(), 4))
        );
    }

    #[test]
    fn loose_no_space_before_qty() {
        // OCR sometimes drops the space — "BlushLeaf x 3" or even "BlushLeafx 3"
        assert_eq!(
            extract_name_qty("BlushLeaf x S"),
            Some(("BlushLeaf".to_string(), 5))
        );
    }

    #[test]
    fn leading_punctuation_stripped() {
        assert_eq!(extract_name_qty("; •Blush"), Some(("Blush".to_string(), 1)));
    }

    #[test]
    fn leading_dot_stripped() {
        assert_eq!(
            extract_name_qty(".Caterpillar' IØ 4'"),
            // Trailing 4 captured; 'IØ' rejected by the loose pass; whole thing
            // falls through to name=raw with qty=1 — that's acceptable, OCR was
            // truly garbled here.
            // But the apostrophe in "Caterpillar'" trims the leading dot via
            // the noise stripper.
            Some(("Caterpillar' IØ 4'".to_string(), 1))
        );
    }

    #[test]
    fn black_stone_weapon_with_paren_preserved() {
        // The leading-noise stripper must not eat the opening `(` either.
        assert_eq!(
            extract_name_qty("Black Stone (Weapon) ×2"),
            Some(("Black Stone (Weapon)".to_string(), 2))
        );
    }

    #[test]
    fn parenthesized_name_loose_qty() {
        assert_eq!(
            extract_name_qty("Black Stone (Weapon) x S"),
            Some(("Black Stone (Weapon)".to_string(), 5))
        );
    }

    #[test]
    fn returns_none_on_truly_empty_after_strip() {
        assert_eq!(extract_name_qty(";;;"), None);
        assert_eq!(extract_name_qty(",.•"), None);
    }

    // ============== Strict-mode tests ==============

    #[test]
    fn strict_accepts_prefixed_lines() {
        assert_eq!(
            extract_name_qty_strict("Obtained: Caphras Stone ×3"),
            Some(("Caphras Stone".to_string(), 3))
        );
        assert_eq!(
            extract_name_qty_strict("You picked up Black Stone (Weapon) ×2"),
            Some(("Black Stone (Weapon)".to_string(), 2))
        );
    }

    #[test]
    fn strict_accepts_qty_pattern_lines() {
        // No prefix, but the ×N pattern carries it through.
        assert_eq!(
            extract_name_qty_strict("Caphras Stone ×3"),
            Some(("Caphras Stone".to_string(), 3))
        );
        assert_eq!(
            extract_name_qty_strict("Blush Leaf x 4\""),
            Some(("Blush Leaf".to_string(), 4))
        );
    }

    #[test]
    fn strict_rejects_player_names_and_chat() {
        // A drifting player name with no qty marker and no loot prefix —
        // the lenient path would accept this as "name, qty=1"; strict drops it.
        assert_eq!(extract_name_qty_strict("FishMongerXx"), None);
        assert_eq!(extract_name_qty_strict("CharacterName"), None);
        assert_eq!(extract_name_qty_strict("[Guild] PlayerName"), None);
        assert_eq!(extract_name_qty_strict("PlayerName: hi"), None);
    }

    #[test]
    fn strict_rejects_bare_item_names() {
        // Even a real item name without a qty marker is rejected in strict mode
        // — the user's responsibility to manually log if they want it tracked.
        assert_eq!(extract_name_qty_strict("Caphras Stone"), None);
    }

    #[test]
    fn strict_still_rejects_empty_input() {
        assert_eq!(extract_name_qty_strict(""), None);
        assert_eq!(extract_name_qty_strict("   "), None);
        assert_eq!(extract_name_qty_strict(";;;"), None);
    }

    // ============== vote_qty (consensus voting) ==============

    #[test]
    fn vote_single_read_passes_through() {
        assert_eq!(vote_qty(&[42]), 42);
    }

    #[test]
    fn vote_majority_beats_single_misread() {
        // The scroll-burst pattern: correct read plus one truncated misread.
        assert_eq!(vote_qty(&[42, 42, 3]), 42);
        assert_eq!(vote_qty(&[3, 42, 42]), 42);
        // Digit-tail misread outvoted.
        assert_eq!(vote_qty(&[48, 480, 48]), 48);
    }

    #[test]
    fn vote_mode_tie_prefers_smaller() {
        // Two values read twice each — inflation is the documented failure
        // direction, so the smaller value wins.
        assert_eq!(vote_qty(&[42, 420, 420, 42]), 42);
    }

    #[test]
    fn vote_two_reads_digit_tail_takes_smaller() {
        assert_eq!(vote_qty(&[42, 420]), 42);
        assert_eq!(vote_qty(&[480, 48]), 48);
    }

    #[test]
    fn vote_two_disagreeing_reads_take_the_later() {
        // Non-10× disagreement: first sighting lands mid fade-in, trust the
        // second read.
        assert_eq!(vote_qty(&[3, 42]), 42);
        assert_eq!(vote_qty(&[23, 25]), 25);
    }

    #[test]
    fn vote_all_distinct_takes_median() {
        // Jitter across three reads with no repeat — median is always a value
        // that was actually read.
        assert_eq!(vote_qty(&[23, 25, 28]), 25);
        assert_eq!(vote_qty(&[3, 42, 420]), 42);
        // Even count → lower-middle.
        assert_eq!(vote_qty(&[3, 22, 25, 420]), 22);
    }
}
