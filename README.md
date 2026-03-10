# Amaranth Check

macOS menu bar app for tracking Amaranth (아마란스) attendance.

Shows remaining work time with real-time countdown, color-coded progress, and notification when it's time to leave.

## Install

```bash
brew tap STCLab-Inc/stclab git@github.com:STCLab-Inc/homebrew-stclab.git
brew install amaranth-check
```

## Setup

```bash
amaranth-check --setup
```

Prompts for Amaranth credentials and installs Playwright automatically.

## Usage

```bash
amaranth-check           # Start menu bar app
amaranth-check --status  # Show status in terminal
amaranth-check --help    # Help
```

## Features

- **1-minute countdown** in menu bar (e.g. `7h32m left`)
- **Auto background refresh** every 10 minutes via headless browser
- **Notification** when work time is done
- **Settings window** (menu bar → Settings...)
  - Account: credentials
  - Appearance: time format (8h32m / 512m / 8:32), labels, emoji, progress bar, colors
  - General: launch at login, notification toggle
- **Launch at Login** via LaunchAgent
- `brew upgrade amaranth-check` to update

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
git clone git@github.com:STCLab-Inc/amaranth-check.git
cd amaranth-check
swift build
.build/debug/amaranth-check --foreground
```

### Requirements

- macOS 13+
- Xcode 15+ (for building)
- Node.js (for Playwright scraper)

## Contributing

1. Fork or create a branch
2. Make changes
3. `swift build` to verify
4. Open a PR

After merging, bump the version in [homebrew-stclab](https://github.com/STCLab-Inc/homebrew-stclab) Formula.

## Uninstall

```bash
brew uninstall amaranth-check
rm -rf ~/.amaranth-check ~/.amaranth-session
```
