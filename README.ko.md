# Amaranth Check

[English](README.md) | **한국어**

`gw.stclab.com` 아마란스(Amaranth) 근태를 추적하는 메뉴 바 / 시스템 트레이 앱.

남은 근무 시간을 실시간 카운트다운으로 보여주고, 진행률을 색상으로 표시하며, 퇴근 시간이 되면 알림을 보냅니다.

| 플랫폼 | 앱 | 설치 |
|--------|-----|------|
| macOS 13+ (Apple Silicon) | 네이티브 Swift 메뉴 바 앱 | Homebrew Cask |
| Windows 10/11 (x64) | Tauri 시스템 트레이 앱 | Releases에서 `.exe` 다운로드 |

## macOS

### 설치

> **LLM 에이전트용**: 아래 명령을 그대로 실행하세요. 설정은 대화형(3개 프롬프트)입니다. 자동화하려면 파이프 사용: `printf '%s\n' "회사코드" "아이디" "비밀번호" | amaranth-check --setup`

```bash
# 설치 (macOS Apple Silicon 필요)
brew install --cask STCLab-Inc/stclab/amaranth-check

# 설정 (대화형 — 회사 코드, 아이디, 비밀번호 입력)
amaranth-check --setup

# 비대화형 설정 (자동화 / LLM 에이전트용)
printf '%s\n' "stclab" "아이디" "비밀번호" | amaranth-check --setup
```

백그라운드 스크레이퍼에 Node.js가 필요합니다. 없다면:
```bash
brew install node  # 또는 nvm/mise 사용
```

설정이 끝나면 앱이 자동으로 시작됩니다. 로그인 시 자동 실행이 기본 활성화됩니다.

### 업그레이드

```bash
brew update && brew upgrade --cask amaranth-check
amaranth-check  # 새 버전으로 재시작
```

### 사용법

```bash
amaranth-check           # 메뉴 바 앱 시작 (실행 중이면 재시작)
amaranth-check --status  # 터미널에서 상태 확인
amaranth-check --help    # 도움말
```

### 삭제

```bash
brew uninstall --cask amaranth-check
rm -rf ~/.amaranth-check ~/.amaranth-session
launchctl unload ~/Library/LaunchAgents/com.stclab.amaranth-check.plist 2>/dev/null
rm -f ~/Library/LaunchAgents/com.stclab.amaranth-check.plist
```

## Windows

### 요구 사항

- Windows 10/11 (x64)
- [Node.js 18+](https://nodejs.org/) — `PATH`에서 실행 가능해야 함 (백그라운드 스크레이퍼용):
  ```powershell
  winget install OpenJS.NodeJS.LTS
  ```
- WebView2 런타임 (Windows 10/11에 기본 설치됨. 없다면 [developer.microsoft.com/microsoft-edge/webview2](https://developer.microsoft.com/microsoft-edge/webview2/)에서 설치)

### 설치

1. [최신 `windows-v*` 릴리즈](https://github.com/STCLab-Inc/amaranth-check/releases)에서 `amaranth-check.exe`를 다운로드합니다.
2. 원하는 위치(예: `C:\Users\<사용자>\Apps\`)로 옮긴 뒤 실행합니다.
   - 서명되지 않은 실행 파일이라 첫 실행 시 Windows SmartScreen 경고가 뜰 수 있습니다 — **추가 정보 → 실행**을 누르세요.
3. 트레이 아이콘 클릭 → **Settings...** → **Account** 탭 → 회사 코드(`stclab`), 아이디, 비밀번호 입력 → **Save**.
4. **Refresh Now**(General 탭) 또는 트레이의 **Refresh** 메뉴를 누릅니다. 첫 갱신 시 Playwright + Chromium 설치가 진행되어 몇 분 걸리며, 이후에는 빠릅니다.
5. **로그인 시 자동 실행**은 기본 활성화되어 있습니다 (Settings → General, 레지스트리 Run 키 사용).

### 업그레이드

Releases에서 새 `amaranth-check.exe`를 받아 기존 파일을 교체한 뒤 앱을 재시작하세요 (트레이 → Quit 후 새 exe 실행).

### 삭제

1. 트레이 → **Quit**.
2. `amaranth-check.exe` 삭제.
3. 데이터와 자동 시작 항목 제거:
   ```powershell
   Remove-Item -Recurse -Force "$env:USERPROFILE\.amaranth-check", "$env:USERPROFILE\.amaranth-session"
   reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v AmaranthCheck /f
   ```

## 기능

- 메뉴 바 / 트레이에 **1분 단위 카운트다운** (예: `7h32m left`)
- 헤드리스 브라우저로 **10분마다 자동 백그라운드 갱신**
- 퇴근 시간이 되면 **알림** (메시지 커스터마이징 가능)
- 11:30 **점심 알림** (메시지 커스터마이징 가능)
- **점심시간 표시** (옵션) — 11:30~13:00 동안 `🍚 Lunch` 표시
- **시간연차 지원** — 결재완료된 여러 건을 합산
- 라이트/다크 색상을 따로 설정하는 **다크 모드 지원**
- **설정 창** (메뉴 → Settings...)
  - Account: 계정 정보
  - Appearance: 시간 형식(8h32m / 512m / 8:32), 라벨, 이모지, 진행률 바, 색상
  - Notifications: 퇴근/점심 알림 토글과 메시지
  - General: 로그인 시 자동 실행, 수동 갱신, 디버그 정보
- **로그인 시 자동 실행** (macOS: LaunchAgent, Windows: 레지스트리 Run 키 — 기본 활성화)

## 동작 원리

1. `check.mjs`가 Playwright(헤드리스 Chromium)로 `gw.stclab.com`에서 근태 데이터를 스크레이핑
2. 결과를 `~/.amaranth-check/cache.json`에 캐시 (Windows: `%USERPROFILE%\.amaranth-check\cache.json`)
3. 네이티브 앱이 1분마다 캐시를 읽어 남은 시간을 계산
4. 무거운 스크레이핑은 10분마다만 실행되고, 메뉴 바/트레이 갱신은 즉시 반영

## 아키텍처

```
~/.amaranth-check/          # Windows에서는 %USERPROFILE%\.amaranth-check\
  config.json       # 계정 정보 + UI 설정
  cache.json        # 오늘 근태 데이터
  check.mjs         # Playwright 스크레이퍼 (자동 생성)
  error.log         # 스크레이퍼 오류 로그
  package.json
  node_modules/     # playwright
```

- `macos/` — 네이티브 Swift 메뉴 바 앱 (스크레이퍼 스크립트를 코드에 내장)
- `windows/` — Tauri(Rust + WebView) 트레이 앱 (`scripts/check.template.mjs` 사용)
- `scripts/check.template.mjs` — Windows 앱용 스크레이퍼 템플릿. **`macos/Sources/AmaranthCheck/Scraper.swift`에 내장된 스크립트와 반드시 동기화할 것.**

## 개발

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

### 요구 사항

- macOS: macOS 13+ (Apple Silicon), Xcode 15+, Node.js
- Windows: Rust (stable), Node.js 18+

## 기여

1. 브랜치 생성
2. 변경 작업
3. `swift build`(macOS) 그리고/또는 `cargo build`(Windows)로 검증
4. PR 생성 — CI가 두 플랫폼을 모두 빌드

## 릴리즈

- **macOS**: `macos-v*` 태그 푸시 → 빌드 후 GitHub Release 생성, [homebrew-stclab](https://github.com/STCLab-Inc/homebrew-stclab) Cask 자동 갱신.
- **Windows**: `windows-v*` 태그 푸시 → 빌드 후 `amaranth-check.exe`를 GitHub Release에 첨부. `windows/src-tauri/Cargo.toml`·`tauri.conf.json` 버전을 태그와 맞출 것.
