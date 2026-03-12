// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod config;
mod launch;
mod scraper;
mod tray;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use chrono::Timelike;
use tauri::Manager;

static SETTINGS_HAS_FOCUSED: AtomicBool = AtomicBool::new(false);

pub struct AppState {
    pub config: Mutex<config::AppConfig>,
    pub cache: Mutex<Option<config::AttendanceCache>>,
}

fn main() {
    let app_config = config::load_config();
    let cache = config::load_cache();

    let state = Arc::new(AppState {
        config: Mutex::new(app_config),
        cache: Mutex::new(cache),
    });

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(state.clone())
        .on_window_event(|window, event| {
            match event {
                tauri::WindowEvent::CloseRequested { api, .. } => {
                    let _ = window.hide();
                    api.prevent_close();
                    #[cfg(target_os = "macos")]
                    {
                        let handle = window.app_handle().clone();
                        let _ = handle.set_activation_policy(tauri::ActivationPolicy::Accessory);
                    }
                }
                tauri::WindowEvent::Focused(true) => {
                    SETTINGS_HAS_FOCUSED.store(true, Ordering::Relaxed);
                }
                tauri::WindowEvent::Focused(false) => {
                    // Only hide if window was actually focused before (not during creation)
                    if SETTINGS_HAS_FOCUSED.swap(false, Ordering::Relaxed) {
                        let _ = window.hide();
                        #[cfg(target_os = "macos")]
                        {
                            let handle = window.app_handle().clone();
                            let _ = handle.set_activation_policy(tauri::ActivationPolicy::Accessory);
                        }
                    }
                }
                _ => {}
            }
        })
        .setup(|app| {
            tray::create_tray(app)?;

            // macOS: remove icon immediately, show text only
            #[cfg(target_os = "macos")]
            {
                if let Some(tray) = app.tray_by_id("main") {
                    let _ = tray.set_icon(None::<tauri::image::Image<'_>>);
                    let _ = tray.set_icon_as_template(true);
                }
            }

            // Initial scrape
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                scraper::refresh_cache(&handle).await;
                tray::update_tray(&handle);
            });

            // Periodic refresh every 10 minutes
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let mut interval = tokio::time::interval(std::time::Duration::from_secs(600));
                loop {
                    interval.tick().await;
                    scraper::refresh_cache(&handle).await;
                    tray::update_tray(&handle);
                }
            });

            // Minute-aligned display update + auto-scrape
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                // Wait until next minute boundary
                let now = chrono::Local::now();
                let secs_until_next_min = 60 - now.second() as u64;
                tokio::time::sleep(std::time::Duration::from_secs(secs_until_next_min)).await;
                tray::update_tray(&handle);

                // Then tick every 60 seconds
                let mut interval = tokio::time::interval(std::time::Duration::from_secs(60));
                loop {
                    interval.tick().await;
                    // Auto-scrape if no data during business hours
                    if tray::should_auto_scrape(&handle) {
                        scraper::refresh_cache(&handle).await;
                    }
                    tray::update_tray(&handle);
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            cmd_get_config,
            cmd_save_config,
            cmd_get_status,
            cmd_refresh,
            cmd_debug_info,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
fn cmd_get_config(state: tauri::State<'_, Arc<AppState>>) -> config::AppConfig {
    state.config.lock().unwrap().clone()
}

#[tauri::command]
fn cmd_save_config(state: tauri::State<'_, Arc<AppState>>, new_config: config::AppConfig) {
    // Apply launch-at-login change
    launch::set_launch_at_login(new_config.launch_at_login);

    config::save_config(&new_config);
    *state.config.lock().unwrap() = new_config;
}

#[tauri::command]
fn cmd_get_status(state: tauri::State<'_, Arc<AppState>>) -> Option<tray::WorkStatusJson> {
    let cache = state.cache.lock().unwrap();
    cache.as_ref().and_then(|c| tray::calculate_work_status(c))
}

#[tauri::command]
async fn cmd_refresh(app: tauri::AppHandle, _state: tauri::State<'_, Arc<AppState>>) -> Result<(), String> {
    scraper::refresh_cache(&app).await;
    tray::update_tray(&app);
    Ok(())
}

#[tauri::command]
fn cmd_debug_info(state: tauri::State<'_, Arc<AppState>>) -> String {
    let cache_str = std::fs::read_to_string(config::cache_file())
        .unwrap_or_else(|_| "(no cache)".into());

    let error_log: String = std::fs::read_to_string(config::error_log_path())
        .map(|s| {
            if s.is_empty() {
                "(no errors)".into()
            } else {
                s.chars().rev().take(500).collect::<String>().chars().rev().collect()
            }
        })
        .unwrap_or_else(|_| "(no errors)".into());

    let has_session = config::session_dir().exists();
    let has_script = config::check_script_path().exists();
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let os = std::env::consts::OS;
    let arch = std::env::consts::ARCH;
    let launch = launch::is_launch_at_login();

    let cfg = state.config.lock().unwrap();

    format!(
        "```\namaranth-check debug\nversion: {} (tauri)\nplatform: {}-{}\ndate: {}\ncache: {}\nsession: {}\nscript: {}\nuser: {}\nlaunch_at_login: {}\nerror.log: {}\n```",
        env!("CARGO_PKG_VERSION"),
        os,
        arch,
        today,
        cache_str.trim(),
        has_session,
        has_script,
        if cfg.user_id.is_empty() { "(not set)" } else { &cfg.user_id },
        launch,
        error_log.trim()
    )
}
