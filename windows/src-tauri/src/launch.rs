use std::path::PathBuf;

#[cfg(target_os = "macos")]
fn launch_agent_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_default()
        .join("Library/LaunchAgents/com.stclab.amaranth-check.plist")
}

#[cfg(target_os = "macos")]
pub fn set_launch_at_login(enable: bool) {
    if enable {
        install_launch_agent();
    } else {
        remove_launch_agent();
    }
}

#[cfg(target_os = "macos")]
fn install_launch_agent() {
    let bin_path = std::env::current_exe().unwrap_or_default();
    let plist = format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.stclab.amaranth-check</string>
    <key>ProgramArguments</key>
    <array>
        <string>{}</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <false/>
</dict>
</plist>"#,
        bin_path.display()
    );

    let path = launch_agent_path();
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let _ = std::fs::write(&path, plist);
    let _ = std::process::Command::new("launchctl")
        .args(["load", &path.to_string_lossy()])
        .output();
}

#[cfg(target_os = "macos")]
fn remove_launch_agent() {
    let path = launch_agent_path();
    let _ = std::process::Command::new("launchctl")
        .args(["unload", &path.to_string_lossy()])
        .output();
    let _ = std::fs::remove_file(&path);
}

#[cfg(target_os = "macos")]
pub fn is_launch_at_login() -> bool {
    launch_agent_path().exists()
}

// Windows: use registry Run key
#[cfg(target_os = "windows")]
pub fn set_launch_at_login(enable: bool) {
    let exe = std::env::current_exe().unwrap_or_default();
    let exe_str = exe.to_string_lossy().to_string();

    if enable {
        let _ = std::process::Command::new("reg")
            .args([
                "add",
                r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run",
                "/v",
                "AmaranthCheck",
                "/t",
                "REG_SZ",
                "/d",
                &exe_str,
                "/f",
            ])
            .output();
    } else {
        let _ = std::process::Command::new("reg")
            .args([
                "delete",
                r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run",
                "/v",
                "AmaranthCheck",
                "/f",
            ])
            .output();
    }
}

#[cfg(target_os = "windows")]
pub fn is_launch_at_login() -> bool {
    std::process::Command::new("reg")
        .args([
            "query",
            r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run",
            "/v",
            "AmaranthCheck",
        ])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub fn set_launch_at_login(_enable: bool) {}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub fn is_launch_at_login() -> bool {
    false
}
