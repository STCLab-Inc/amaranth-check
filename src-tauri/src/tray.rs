use crate::config::{self, AttendanceCache};
use crate::AppState;
use serde::Serialize;
use std::sync::Arc;
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::TrayIconBuilder;
use tauri::Manager;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkStatusJson {
    pub come: String,
    pub leave_est: String,
    pub leave: Option<String>,
    pub leave_minutes: Option<i32>,
    pub remain: i32,
    pub elapsed: i32,
    pub pct: i32,
    pub overtime: Option<i32>,
    pub is_done: bool,
}

pub fn calculate_work_status(cache: &AttendanceCache) -> Option<WorkStatusJson> {
    let come = cache.come.as_ref()?;
    let come_min = parse_time(come)?;

    let effective_start = come_min.max(480); // 8AM floor
    let required_min = 540 - cache.leave_minutes.unwrap_or(0);
    let leave_min = effective_start + required_min;
    let leave_est = format_minutes(leave_min);

    let now = chrono::Local::now();
    let now_min = now.hour() as i32 * 60 + now.minute() as i32;
    let remain = leave_min - now_min;
    let elapsed = now_min - effective_start;
    let pct = if required_min > 0 {
        (elapsed * 100 / required_min).clamp(0, 100)
    } else {
        100
    };

    let overtime = if remain < 0 { Some(-remain) } else { None };
    let is_done = cache.leave.is_some() || remain <= 0;

    Some(WorkStatusJson {
        come: come.clone(),
        leave_est,
        leave: cache.leave.clone(),
        leave_minutes: cache.leave_minutes,
        remain,
        elapsed,
        pct,
        overtime,
        is_done,
    })
}

fn parse_time(s: &str) -> Option<i32> {
    let parts: Vec<&str> = s.split(':').collect();
    if parts.len() != 2 {
        return None;
    }
    let h: i32 = parts[0].parse().ok()?;
    let m: i32 = parts[1].parse().ok()?;
    Some(h * 60 + m)
}

fn format_minutes(m: i32) -> String {
    format!("{:02}:{:02}", m / 60, m % 60)
}

fn format_remain(remain: i32, format: &str) -> String {
    let h = remain / 60;
    let m = remain % 60;
    match format {
        "m" => format!("{}m", remain),
        "colon" => format!("{}:{:02}", h, m),
        _ => format!("{}h{}m", h, m),
    }
}

use chrono::Timelike;

pub fn create_tray(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let open_amaranth = MenuItemBuilder::with_id("open", "Open Amaranth").build(app)?;
    let refresh = MenuItemBuilder::with_id("refresh", "Refresh").build(app)?;
    let settings = MenuItemBuilder::with_id("settings", "Settings...").build(app)?;
    let quit = MenuItemBuilder::with_id("quit", "Quit").build(app)?;

    let menu = MenuBuilder::new(app)
        .items(&[&open_amaranth, &refresh, &settings, &quit])
        .build()?;

    let _tray = TrayIconBuilder::new()
        .menu(&menu)
        .show_menu_on_left_click(true)
        .tooltip("Amaranth Check")
        .on_menu_event(move |app, event| match event.id().as_ref() {
            "open" => {
                let _ = open::that("https://gw.stclab.com/");
            }
            "refresh" => {
                let handle = app.clone();
                tauri::async_runtime::spawn(async move {
                    crate::scraper::refresh_cache(&handle).await;
                    update_tray(&handle);
                });
            }
            "settings" => {
                if let Some(win) = app.get_webview_window("settings") {
                    let _ = win.show();
                    let _ = win.set_focus();
                }
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .build(app)?;

    Ok(())
}

pub fn update_tray(app: &tauri::AppHandle) {
    let state = app.state::<Arc<AppState>>();

    // Reload cache from disk
    if let Some(cache) = config::load_cache() {
        *state.cache.lock().unwrap() = Some(cache);
    }

    let cache_guard = state.cache.lock().unwrap();
    let cfg = state.config.lock().unwrap();

    let tooltip = if let Some(ref cache) = *cache_guard {
        if let Some(status) = calculate_work_status(cache) {
            if status.leave.is_some() {
                format!(
                    "{} {}\nIn: {}  Out: {}",
                    cfg.emoji_done,
                    cfg.label_done,
                    status.come,
                    status.leave.as_deref().unwrap_or(&status.leave_est)
                )
            } else if let Some(ot) = status.overtime {
                let ot_str = format_remain(ot, &cfg.time_format);
                format!(
                    "{} +{}\nIn: {}  Est: {}",
                    cfg.emoji_done, ot_str, status.come, status.leave_est
                )
            } else if status.remain <= 0 {
                format!(
                    "{} {}\nIn: {}  Est: {}",
                    cfg.emoji_done, cfg.label_done, status.come, status.leave_est
                )
            } else {
                let time_str = format_remain(status.remain, &cfg.time_format);
                format!(
                    "{} {}\nIn: {}  Est: {}\nProgress: {}%",
                    time_str, cfg.label_left, status.come, status.leave_est, status.pct
                )
            }
        } else {
            cfg.label_no_data.clone()
        }
    } else {
        cfg.label_no_data.clone()
    };

    // Update tray tooltip
    if let Some(tray) = app.tray_by_id("main") {
        let _ = tray.set_tooltip(Some(&tooltip));
    }
}
