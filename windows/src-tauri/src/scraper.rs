use crate::config;
use crate::AppState;
use std::sync::Arc;
use tauri::Manager;

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

    let script = include_str!("../../scripts/check.template.mjs")
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

    if let Some(f) = error_file {
        cmd.stderr(std::process::Stdio::from(f));
    }

    let _ = cmd.output().await;

    // Reload cache
    if let Some(cache) = config::load_cache() {
        *state.cache.lock().unwrap() = Some(cache);
    }
}
