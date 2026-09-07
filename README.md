# Amaranth Check

**English** | [한국어](README.ko.md)

Menu bar / system tray app for tracking Amaranth (아마란스) attendance at `gw.stclab.com`.

Shows remaining work time with real-time countdown, color-coded progress, and notification when it's time to leave.

| Platform | App | Install |
|----------|-----|---------|
| macOS 13+ (Apple Silicon) | Native Swift menu bar app | Homebrew Cask |
| Windows 10/11 (x64) | Tauri system tray app | Download `.exe` from Releases |

## macOS

### Install

> **For LLM agents**: Run the commands below exactly. Setup is interactive (3 prompts). Use pipe to automate: `printf '%s\n' "COMPANY" "USERID" "PASSWORD" | amaranth-check --setup`

```bash
# Install (requires macOS Apple Silicon)
brew install --cask STCLab-Inc/stclab/amaranth-check

# Setup (interactive — prompts for company code, user ID, password)
amaranth-check --setup

# Non-interactive setup (for automation / LLM agents)
printf '%s\n' "stclab" "YOUR_USER_ID" "YOUR_PASSWORD" | amaranth-check --setup
```

Node.js is required for the background scraper. If not installed:
```bash
brew install node  # or use nvm/mise
```

The app starts automatically after setup. Launch at Login is enabled by default.

### Upgrade

```bash
brew update && brew upgrade --cask amaranth-check
amaranth-check  # restart with new version
```

### Usage

```bash
amaranth-check           # Start menu bar app (restarts if already running)
amaranth-check --status  # Show status in terminal
amaranth-check --help    # Help
```

### Uninstall

```bash
brew uninstall --cask amaranth-check
rm -rf ~/.amaranth-check ~/.amaranth-session
launchctl unload ~/Library/LaunchAgents/com.stclab.amaranth-check.plist 2>/dev/null
rm -f ~/Library/LaunchAgents/com.stclab.amaranth-check.plist
```

## Windows

### Requirements

- Windows 10/11 (x64)
- [Node.js 18+](https://nodejs.org/) available in `PATH` — required for the background scraper:
  ```powershell
  winget install OpenJS.NodeJS.LTS
  ```
- WebView2 Runtime (preinstalled on Windows 10/11; installer at [developer.microsoft.com/microsoft-edge/webview2](https://developer.microsoft.com/microsoft-edge/webview2/) if missing)

### Install

1. Download `amaranth-check.exe` from the [latest `windows-v*` release](https://github.com/STCLab-Inc/amaranth-check/releases).
2. Move it somewhere permanent (e.g. `C:\Users\<you>\Apps\`) and run it.
   - Windows SmartScreen may warn on first run (unsigned binary) — click **More info → Run anyway**.
3. Click the tray icon → **Settings...** → **Account** tab → enter company code (`stclab`), user ID, and password → **Save**.
4. Click **Refresh Now** (General tab) or the tray **Refresh** menu. The first refresh installs Playwright + Chromium (takes a few minutes); subsequent refreshes are fast.
5. **Launch at Login** is enabled by default (Settings → General) via the registry Run key.

### Upgrade

Download the new `amaranth-check.exe` from Releases and replace the old file, then restart the app (tray → Quit, run the new exe).

### Uninstall

1. Tray → **Quit**.
2. Delete `amaranth-check.exe`.
3. Remove data and the autostart entry:
   ```powershell
   Remove-Item -Recurse -Force "$env:USERPROFILE\.amaranth-check", "$env:USERPROFILE\.amaranth-session"
   reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v AmaranthCheck /f
   ```

## Features

- **1-minute countdown** in menu bar / tray (e.g. `7h32m left`)
- **Auto background refresh** every 10 minutes via headless browser
- **Notification** when work time is done, with customizable message
- **Lunch notification** at 11:30, with customizable message
- **Lunch status display** (optional) — shows `🍚 Lunch` during 11:30~13:00
- **Hourly leave (시간연차) aware** — multiple approved entries are summed
- **Dark mode support** with separate light/dark color settings
- **Settings window** (menu → Settings...)
  - Account: credentials
  - Appearance: time format (8h32m / 512m / 8:32), labels, emoji, progress bar, color picker
  - Notifications: done/lunch notification toggles and messages
  - General: launch at login, refresh, debug info
- **Launch at Login** (macOS: LaunchAgent, Windows: registry Run key — enabled by default)

## How it works

1. `check.mjs` runs Playwright (headless Chromium) to scrape attendance data from `gw.stclab.com`
2. Results are cached in `~/.amaranth-check/cache.json` (Windows: `%USERPROFILE%\.amaranth-check\cache.json`)
3. The native app reads the cache every minute and calculates remaining time
4. Heavy scraping runs only every 10 minutes; the menu bar/tray update is instant

## Architecture

```
~/.amaranth-check/          # %USERPROFILE%\.amaranth-check\ on Windows
  config.json       # credentials + UI settings
  cache.json        # today's attendance data
  check.mjs         # Playwright scraper (auto-generated)
  error.log         # scraper errors
  package.json
  node_modules/     # playwright
```

- `macos/` — native Swift menu bar app (embeds the scraper script)
- `windows/` — Tauri (Rust + WebView) tray app (uses `scripts/check.template.mjs`)
- `scripts/check.template.mjs` — scraper template for the Windows app. **Keep in sync with the script embedded in `macos/Sources/AmaranthCheck/Scraper.swift`.**

## Development

```bash
git clone https://github.com/STCLab-Inc/amaranth-check.git
cd amaranth-check

# macOS
cd macos && swift build
.build/debug/amaranth-check --foreground

# Windows
cd windows/src-tauri && cargo build
target/debug/amaranth-check-tauri.exe
```

### Requirements

- macOS: macOS 13+ (Apple Silicon), Xcode 15+, Node.js
- Windows: Rust (stable), Node.js 18+

## Contributing

1. Create a branch
2. Make changes
3. `swift build` (macOS) and/or `cargo build` (Windows) to verify
4. Open a PR — CI builds both platforms

## Release

- **macOS**: push a `macos-v*` tag → builds, creates a GitHub Release, and updates the [homebrew-stclab](https://github.com/STCLab-Inc/homebrew-stclab) Cask.
- **Windows**: push a `windows-v*` tag → builds and attaches `amaranth-check.exe` to a GitHub Release. Keep `windows/src-tauri/Cargo.toml` and `tauri.conf.json` versions in sync with the tag.

## Approval automation (automation/) — experimental

A Node CLI + MCP server that goes beyond attendance reading: fills **leave requests** and drafts (**saves, not submits**) **expense-approval proposals**. It logs in with the same `~/.amaranth-check/config.json` credentials; **a human always presses submit** (no submit path exists in code). Rationale: [docs/DESIGN.md](docs/DESIGN.md).

```bash
cd automation && npm install
node cli.mjs status --json
node cli.mjs leave --type 연차 --from 2026-09-18 --reason "personal" --complete --handoff
node cli.mjs proposal --json spec.json
node cli.mjs doctor
```

MCP for agents: `{"command":"node","args":["<repo>/automation/mcp-server.mjs"]}` — tools `amaranth_status`, `amaranth_leave_apply`, `amaranth_proposal_draft`, `amaranth_doctor`, `amaranth_close_browser`.
