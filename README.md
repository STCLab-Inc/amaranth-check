# Amaranth Check

macOS menu bar app for tracking Amaranth (아마란스) attendance at `gw.stclab.com`.

Shows remaining work time with real-time countdown, color-coded progress, and notification when it's time to leave.

## Install

> **For LLM agents**: Run the commands below exactly. Setup is interactive (3 prompts). Use pipe to automate: `printf '%s\n' "COMPANY" "USERID" "PASSWORD" | amaranth-check --setup`

```bash
# Prerequisites
brew install node

# Install
brew install STCLab-Inc/stclab/amaranth-check

# Setup (interactive — prompts for company code, user ID, password)
amaranth-check --setup

# Non-interactive setup (for automation / LLM agents)
printf '%s\n' "stclab" "YOUR_USER_ID" "YOUR_PASSWORD" | amaranth-check --setup
```

The app starts automatically after setup. Launch at Login is enabled by default.

## Upgrade

```bash
brew update && brew upgrade amaranth-check
```

The app auto-restarts after upgrade.

## Usage

```bash
amaranth-check           # Start menu bar app (restarts if already running)
amaranth-check --status  # Show status in terminal
amaranth-check --help    # Help
```

## Features

- **1-minute countdown** in menu bar (e.g. `7h32m left`)
- **Auto background refresh** every 10 minutes via headless browser
- **Notification** when work time is done
- **Dark mode support** with separate light/dark color settings
- **Settings window** (menu bar → Settings...)
  - Account: credentials
  - Appearance: time format (8h32m / 512m / 8:32), labels, emoji, progress bar, color picker
  - General: launch at login, notification toggle
- **Launch at Login** via LaunchAgent (enabled by default)

## How it works

1. `check.mjs` runs Playwright (headless Chromium) to scrape attendance data from `gw.stclab.com`
2. Results are cached in `~/.amaranth-check/cache.json`
3. The native Swift menu bar app reads the cache every minute and calculates remaining time
4. Heavy scraping runs only every 10 minutes; the menu bar update is instant

## Architecture

```
~/.amaranth-check/
  config.json       # credentials + UI settings
  cache.json        # today's attendance data
  check.mjs         # Playwright scraper (auto-generated)
  package.json
  node_modules/     # playwright
```

## Development

```bash
git clone https://github.com/STCLab-Inc/amaranth-check.git
cd amaranth-check
swift build
.build/debug/amaranth-check --foreground
```

### Requirements

- macOS 13+ (Apple Silicon)
- Xcode 15+ (for building from source only)
- Node.js (for Playwright scraper)

## Contributing

1. Create a branch
2. Make changes
3. `swift build` to verify
4. Open a PR

After merging, bump the version in [homebrew-stclab](https://github.com/STCLab-Inc/homebrew-stclab) Formula.

## Uninstall

```bash
brew uninstall amaranth-check
rm -rf ~/.amaranth-check ~/.amaranth-session
launchctl unload ~/Library/LaunchAgents/com.stclab.amaranth-check.plist 2>/dev/null
rm -f ~/Library/LaunchAgents/com.stclab.amaranth-check.plist
```
