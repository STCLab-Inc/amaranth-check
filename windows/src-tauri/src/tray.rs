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
    // Static initial menu (no state dependency)
    let date_item = MenuItemBuilder::with_id("_date", &date_string())
        .enabled(false)
        .build(app)?;
    let no_data = MenuItemBuilder::with_id("_nodata", "Loading...")
        .enabled(false)
        .build(app)?;
    let open_item = MenuItemBuilder::with_id("open", "Open Amaranth").build(app)?;
    let refresh_item = MenuItemBuilder::with_id("refresh", "Refresh").build(app)?;
    let settings_item = MenuItemBuilder::with_id("settings", "Settings...").build(app)?;
    let quit_item = MenuItemBuilder::with_id("quit", "Quit").build(app)?;
    let menu = MenuBuilder::new(app)
        .items(&[&date_item, &no_data])
        .separator()
        .items(&[&open_item, &refresh_item])
        .separator()
        .items(&[&settings_item, &quit_item])
        .build()?;

    let _tray = TrayIconBuilder::with_id("main")
        .icon(
            tauri::image::Image::from_bytes(include_bytes!("../icons/icon.png"))
                .expect("failed to load tray icon"),
        )
        .title("--:--")
        .menu(&menu)
        .tooltip("Amaranth Check")
        .show_menu_on_left_click(true)
        .on_menu_event(move |app, event| {
            match event.id().as_ref() {
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
                    // macOS: activate app before creating window
                    #[cfg(target_os = "macos")]
                    {
                        let handle = app.clone();
                        let _ =
                            handle.set_activation_policy(tauri::ActivationPolicy::Regular);
                    }
                    if let Some(win) = app.get_webview_window("settings") {
                        let _ = win.show();
                        let _ = win.set_focus();
                    } else {
                        let _ = tauri::WebviewWindowBuilder::new(
                            app,
                            "settings",
                            tauri::WebviewUrl::App("index.html".into()),
                        )
                        .title("Amaranth Check - Settings")
                        .inner_size(480.0, 520.0)
                        .resizable(false)
                        .center()
                        .build();
                    }
                }
                "quit" => {
                    app.exit(0);
                }
                _ => {}
            }
        })
        .build(app)?;

    Ok(())
}

fn date_string() -> String {
    chrono::Local::now().format("%Y-%m-%d (%a)").to_string()
}

fn build_menu<M: tauri::Manager<tauri::Wry>>(
    manager: &M,
    status: Option<&WorkStatusJson>,
) -> Result<tauri::menu::Menu<tauri::Wry>, Box<dyn std::error::Error>> {
    let cfg = {
        let state = manager.state::<Arc<AppState>>();
        let guard = state.config.lock().unwrap();
        let cfg = guard.clone();
        drop(guard);
        cfg
    };

    let mut builder = MenuBuilder::new(manager);

    // Date header
    let date_item = MenuItemBuilder::with_id("_date", &date_string())
        .enabled(false)
        .build(manager)?;
    builder = builder.item(&date_item);

    // In/Out times
    if let Some(s) = status {
        let out_time = s.leave.as_deref().unwrap_or(&s.leave_est);
        let info = MenuItemBuilder::with_id("_info", &format!("In: {}  Out: {}", s.come, out_time))
            .enabled(false)
            .build(manager)?;
        builder = builder.item(&info);

        // Leave time (시간연차)
        if let Some(lm) = s.leave_minutes {
            if lm > 0 {
                let h = lm / 60;
                let m = lm % 60;
                let time_str = if h > 0 && m > 0 {
                    format!("{}h {}m", h, m)
                } else if h > 0 {
                    format!("{}h", h)
                } else {
                    format!("{}m", m)
                };
                let leave_item =
                    MenuItemBuilder::with_id("_leave", &format!("Leave: {}", time_str))
                        .enabled(false)
                        .build(manager)?;
                builder = builder.item(&leave_item);
            }
        }

        // Progress bar
        if cfg.show_progress_bar {
            let filled = s.pct / 10;
            let empty = 10 - filled;
            let bar = format!(
                "{}{}  {}%",
                "█".repeat(filled as usize),
                "░".repeat(empty as usize),
                s.pct
            );
            let bar_item = MenuItemBuilder::with_id("_bar", &bar)
                .enabled(false)
                .build(manager)?;
            builder = builder.item(&bar_item);
        }

        // Overtime (only when still at work, not yet left)
        if s.leave.is_none() {
            if let Some(ot) = s.overtime {
                if ot > 0 {
                    let ot_str = format_remain(ot, &cfg.time_format);
                    let ot_item =
                        MenuItemBuilder::with_id("_overtime", &format!("Overtime: +{}", ot_str))
                            .enabled(false)
                            .build(manager)?;
                    builder = builder.item(&ot_item);
                }
            }
        }
    } else {
        let no_data = MenuItemBuilder::with_id("_nodata", "No check-in today")
            .enabled(false)
            .build(manager)?;
        builder = builder.item(&no_data);
    }

    builder = builder.separator();

    let open_item = MenuItemBuilder::with_id("open", "Open Amaranth").build(manager)?;
    let refresh_item = MenuItemBuilder::with_id("refresh", "Refresh").build(manager)?;
    builder = builder.item(&open_item).item(&refresh_item);

    builder = builder.separator();

    let settings_item = MenuItemBuilder::with_id("settings", "Settings...").build(manager)?;
    let quit_item = MenuItemBuilder::with_id("quit", "Quit").build(manager)?;
    builder = builder.item(&settings_item).item(&quit_item);

    Ok(builder.build()?)
}

pub fn update_tray(app: &tauri::AppHandle) {
    let state = app.state::<Arc<AppState>>();

    // Reload cache from disk
    if let Some(cache) = config::load_cache() {
        *state.cache.lock().unwrap() = Some(cache);
    }

    let cache_guard = state.cache.lock().unwrap();
    let cfg = state.config.lock().unwrap();

    let status = cache_guard.as_ref().and_then(|c| calculate_work_status(c));

    // Check if we should notify
    if let Some(ref s) = status {
        if s.is_done && cfg.notify_on_done {
            notify_done_if_needed(app, &cfg);
        }
    }

    let tooltip = if let Some(ref s) = status {
        if s.leave.is_some() {
            format!(
                "{} {}\nIn: {}  Out: {}",
                cfg.emoji_done,
                cfg.label_done,
                s.come,
                s.leave.as_deref().unwrap_or(&s.leave_est)
            )
        } else if let Some(ot) = s.overtime {
            let ot_str = format_remain(ot, &cfg.time_format);
            format!(
                "{} +{}\nIn: {}  Est: {}",
                cfg.emoji_done, ot_str, s.come, s.leave_est
            )
        } else if s.remain <= 0 {
            format!(
                "{} {}\nIn: {}  Est: {}",
                cfg.emoji_done, cfg.label_done, s.come, s.leave_est
            )
        } else {
            let time_str = format_remain(s.remain, &cfg.time_format);
            format!(
                "{} {}\nIn: {}  Est: {}\nProgress: {}%",
                time_str, cfg.label_left, s.come, s.leave_est, s.pct
            )
        }
    } else {
        cfg.label_no_data.clone()
    };

    let title = if let Some(ref s) = status {
        if s.leave.is_some() {
            format!("{} {}", cfg.emoji_done, cfg.label_done)
        } else if let Some(ot) = s.overtime {
            let ot_str = format_remain(ot, &cfg.time_format);
            format!("{} +{}", cfg.emoji_done, ot_str)
        } else if s.remain <= 0 {
            format!("{} {}", cfg.emoji_done, cfg.label_done)
        } else {
            let time_str = format_remain(s.remain, &cfg.time_format);
            format!("{} {}", time_str, cfg.label_left)
        }
    } else {
        cfg.label_no_data.clone()
    };

    // Drop locks before building menu (build_menu acquires its own locks)
    drop(cache_guard);
    drop(cfg);

    if let Some(tray) = app.tray_by_id("main") {
        let _ = tray.set_title(Some(&title));
        let _ = tray.set_tooltip(Some(&tooltip));

        // Update menu with status details
        if let Ok(menu) = build_menu(app, status.as_ref()) {
            let _ = tray.set_menu(Some(menu));
        }

        // macOS: remove icon, show text only
        #[cfg(target_os = "macos")]
        {
            let _ = tray.set_icon(None::<tauri::image::Image<'_>>);
            let _ = tray.set_icon_as_template(true);
        }
    }
}

// Auto-scrape if no data during business hours (7-22)
pub fn should_auto_scrape(app: &tauri::AppHandle) -> bool {
    let hour = chrono::Local::now().hour();
    if !(7..22).contains(&hour) {
        return false;
    }
    let state = app.state::<Arc<AppState>>();
    let cache_guard = state.cache.lock().unwrap();
    cache_guard.is_none()
}

// Notification (one-shot per session)
use std::sync::atomic::{AtomicBool, Ordering};
static NOTIFIED_DONE: AtomicBool = AtomicBool::new(false);

fn notify_done_if_needed(app: &tauri::AppHandle, cfg: &config::AppConfig) {
    if NOTIFIED_DONE.swap(true, Ordering::Relaxed) {
        return; // already notified
    }

    let emoji = cfg.emoji_done.clone();
    let _app = app.clone();
    std::thread::spawn(move || {
        send_notification(&emoji);
    });
}

#[cfg(target_os = "macos")]
fn send_notification(emoji: &str) {
    let body = format!("퇴근 가능! {}", emoji);
    let script = format!(
        "display notification \"{}\" with title \"Amaranth Check\" sound name \"default\"",
        body
    );
    let _ = std::process::Command::new("/usr/bin/osascript")
        .args(["-e", &script])
        .spawn();
}

#[cfg(target_os = "windows")]
fn send_notification(emoji: &str) {
    let body = format!("퇴근 가능! {}", emoji);
    // PowerShell toast notification
    let ps_script = format!(
        "[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null; \
         $template = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02); \
         $textNodes = $template.GetElementsByTagName('text'); \
         $textNodes.Item(0).AppendChild($template.CreateTextNode('Amaranth Check')) > $null; \
         $textNodes.Item(1).AppendChild($template.CreateTextNode('{}')) > $null; \
         $toast = [Windows.UI.Notifications.ToastNotification]::new($template); \
         [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('Amaranth Check').Show($toast)",
        body
    );
    let _ = std::process::Command::new("powershell")
        .args(["-Command", &ps_script])
        .spawn();
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn send_notification(emoji: &str) {
    let body = format!("퇴근 가능! {}", emoji);
    let _ = std::process::Command::new("notify-send")
        .args(["Amaranth Check", &body])
        .spawn();
}
