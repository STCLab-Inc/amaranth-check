// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod config;
mod scraper;
mod tray;

use std::sync::{Arc, Mutex};
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
        .setup(|app| {
            tray::create_tray(app)?;

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

            // Update display every minute
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let mut interval = tokio::time::interval(std::time::Duration::from_secs(60));
                loop {
                    interval.tick().await;
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
