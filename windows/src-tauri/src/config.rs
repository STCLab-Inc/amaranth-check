use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    pub company: String,
    pub user_id: String,
    pub password: String,
    pub label_left: String,
    pub label_done: String,
    pub label_no_data: String,
    pub emoji_done: String,
    pub show_progress_bar: bool,
    pub time_format: String,
    pub notify_on_done: bool,
    pub launch_at_login: bool,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            company: "stclab".into(),
            user_id: String::new(),
            password: String::new(),
            label_left: "left".into(),
            label_done: "Done".into(),
            label_no_data: "--:--".into(),
            emoji_done: "\u{1F389}".into(), // 🎉
            show_progress_bar: true,
            time_format: "hm".into(),
            notify_on_done: true,
            launch_at_login: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AttendanceCache {
    pub date: String,
    pub come: Option<String>,
    pub leave: Option<String>,
    pub leave_minutes: Option<i32>,
}

pub fn config_dir() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_default()
        .join(".amaranth-check")
}

pub fn config_file() -> PathBuf {
    config_dir().join("config.json")
}

pub fn cache_file() -> PathBuf {
    config_dir().join("cache.json")
}

pub fn check_script_path() -> PathBuf {
    config_dir().join("check.mjs")
}

pub fn _session_dir() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_default()
        .join(".amaranth-session")
}

pub fn load_config() -> AppConfig {
    let path = config_file();
    if let Ok(data) = fs::read_to_string(&path) {
        serde_json::from_str(&data).unwrap_or_default()
    } else {
        AppConfig::default()
    }
}

pub fn save_config(config: &AppConfig) {
    let path = config_file();
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if let Ok(json) = serde_json::to_string_pretty(config) {
        let _ = fs::write(&path, json);
    }
}

pub fn load_cache() -> Option<AttendanceCache> {
    let path = cache_file();
    let data = fs::read_to_string(&path).ok()?;
    let cache: AttendanceCache = serde_json::from_str(&data).ok()?;
    // Only return if today's date
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    if cache.date == today {
        Some(cache)
    } else {
        None
    }
}
