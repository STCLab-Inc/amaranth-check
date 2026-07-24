use crate::config;
use crate::AppState;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::Manager;

// 중복 실행 가드 + 마지막 갱신 시각 (macOS safeRefresh 대응)
static REFRESHING: AtomicBool = AtomicBool::new(false);
static LAST_REFRESH: Mutex<Option<String>> = Mutex::new(None);

pub fn last_refresh_time() -> Option<String> {
    LAST_REFRESH.lock().unwrap().clone()
}

/// Generate check.mjs script with current config
fn write_check_script(cfg: &config::AppConfig) {
    let dir = config::config_dir();
    let _ = std::fs::create_dir_all(&dir);

    // package.json
    let pkg_path = dir.join("package.json");
    if !pkg_path.exists() {
        let _ = std::fs::write(
            &pkg_path,
            r#"{"name":"amaranth-check","version":"1.0.0","type":"module","private":true}"#,
        );
    }

    let script = include_str!("../../../scripts/check.template.mjs")
        .replace("__COMPANY__", &serde_json::to_string(&cfg.company).unwrap_or_default())
        .replace("__USER_ID__", &serde_json::to_string(&cfg.user_id).unwrap_or_default())
        .replace("__PASSWORD__", &serde_json::to_string(&cfg.password).unwrap_or_default());

    let script_path = config::check_script_path();
    let _ = std::fs::write(&script_path, script);
}

/// Ensure npm dependencies are installed
async fn ensure_dependencies() {
    let node_modules = config::config_dir().join("node_modules");
    if node_modules.exists() {
        return;
    }

    let dir = config::config_dir();
    let _ = tokio::process::Command::new("npm")
        .args(["install", "playwright"])
        .current_dir(&dir)
        .output()
        .await;

    let _ = tokio::process::Command::new("npx")
        .args(["playwright", "install", "chromium"])
        .current_dir(&dir)
        .output()
        .await;
}

/// Run check.mjs and reload cache
pub async fn refresh_cache(app: &tauri::AppHandle) {
    // 이미 실행 중이면 건너뜀 (macOS safeRefresh 가드 대응)
    if REFRESHING.swap(true, Ordering::Relaxed) {
        return;
    }
    run_refresh(app).await;
    REFRESHING.store(false, Ordering::Relaxed);
}

async fn run_refresh(app: &tauri::AppHandle) {
    let state = app.state::<Arc<AppState>>();
    let cfg = state.config.lock().unwrap().clone();

    if cfg.user_id.is_empty() {
        return;
    }

    write_check_script(&cfg);
    ensure_dependencies().await;

    let dir = config::config_dir();
    let script = config::check_script_path();
    let error_log = dir.join("error.log");

    let error_file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&error_log)
        .ok();

    let mut cmd = tokio::process::Command::new("node");
    cmd.arg(&script).current_dir(&dir);
    // 90초 타임아웃 시 프로세스가 남지 않도록
    cmd.kill_on_drop(true);

    if let Some(f) = error_file {
        cmd.stderr(std::process::Stdio::from(f));
    }

    // 스크래핑이 멈춘 채로 유지되지 않도록 90초 제한 (macOS와 동일)
    let _ = tokio::time::timeout(std::time::Duration::from_secs(90), cmd.output()).await;

    *LAST_REFRESH.lock().unwrap() =
        Some(chrono::Local::now().format("%H:%M").to_string());

    // Reload cache
    if let Some(cache) = config::load_cache() {
        *state.cache.lock().unwrap() = Some(cache);
    }
}
