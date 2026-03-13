import AppKit

// MARK: - CLI

let args = CommandLine.arguments

if args.contains("--setup") {
    // node 체크 (18+ 필요)
    guard let node = findBestNode() else {
        print("Error: Node.js 18+ is required but not found.")
        // 혹시 낮은 버전이 있는지 체크
        for path in ["/opt/homebrew/bin/node", "/usr/local/bin/node"] {
            if let info = getNodeVersionAt(path) {
                print("Found \(info.version) at \(path), but 18+ is required.")
            }
        }
        print("Install with: brew install node (or nvm install 18)")
        exit(1)
    }
    print("Using Node.js \(node.version) (\(node.path))")

    print("Amaranth Check Setup")
    print("====================")
    var config = loadConfig()

    print("Company code [\(config.company)]: ", terminator: "")
    if let line = readLine(), !line.isEmpty { config.company = line }

    print("User ID [\(config.userId)]: ", terminator: "")
    if let line = readLine(), !line.isEmpty { config.userId = line }

    print("Password: ", terminator: "")
    // 비밀번호 입력 시 에코 끄기
    let attrs = enableRawMode()
    if let line = readLine(), !line.isEmpty { config.password = line }
    restoreMode(attrs)
    print("")

    try? FileManager.default.createDirectory(atPath: AppPaths.configDir, withIntermediateDirectories: true)
    saveConfig(config)
    writeCheckScript()
    print("")
    print("Config saved to \(AppPaths.configFile)")
    print("Installing Playwright (this may take a minute)...")
    ensureScraperInstalled()
    // Launch at Login 기본 활성화
    if config.launchAtLogin, let bin = findBinaryPath() {
        installLaunchAgent(binPath: bin)
        print("Launch at Login enabled.")
    }
    print("Done! Starting Amaranth Check...")
    // setup 후 바로 실행
    if let bin = findBinaryPath() {
        let task = Process()
        task.executableURL = URL(fileURLWithPath: bin)
        task.arguments = []
        task.standardOutput = FileHandle.nullDevice
        task.standardError = FileHandle.nullDevice
        try? task.run()
    }
    exit(0)
}

if args.contains("--status") {
    guard let cache = loadCache(), let s = calculateWorkStatus(cache: cache) else {
        print("No check-in data for today")
        exit(0)
    }
    let config = loadConfig()
    let outTime = s.leave ?? s.leaveEst
    if s.leave != nil {
        print("In: \(s.come)  Out: \(outTime)  \(config.emojiDone) \(config.labelDone)")
    } else if let ot = s.overtime, ot > 0 {
        print("In: \(s.come)  Out: \(outTime)  \(config.emojiDone) +\(ot / 60)h\(ot % 60)m")
    } else if s.remain <= 0 {
        print("In: \(s.come)  Out: \(outTime)  \(config.emojiDone) \(config.labelDone)")
    } else {
        print("In: \(s.come)  Out: \(outTime)  \(s.remain / 60)h\(s.remain % 60)m \(config.labelLeft)")
    }
    exit(0)
}

if args.contains("--help") || args.contains("-h") {
    print("""
    amaranth-check - Amaranth attendance menu bar app

    Usage:
      amaranth-check           Start menu bar app
      amaranth-check --setup   Configure credentials
      amaranth-check --status  Show status in terminal
      amaranth-check --help    Show this help
    """)
    exit(0)
}

// MARK: - 설정 확인

let config = loadConfig()
if config.userId.isEmpty {
    print("No credentials configured. Run `amaranth-check --setup` first.")
    exit(1)
}

// MARK: - Menu Bar App

// --foreground가 없으면 자동 fork해서 터미널을 즉시 반환
if !args.contains("--foreground") {
    // 이미 실행 중이면 죽이고 새로 시작 (업데이트 반영)
    let kill = Process()
    kill.executableURL = URL(fileURLWithPath: "/usr/bin/pkill")
    kill.arguments = ["-f", "amaranth-check --foreground"]
    kill.standardOutput = FileHandle.nullDevice
    kill.standardError = FileHandle.nullDevice
    try? kill.run()
    kill.waitUntilExit()

    let execPath = ProcessInfo.processInfo.arguments[0]
    let task = Process()
    task.executableURL = URL(fileURLWithPath: execPath)
    task.arguments = ["--foreground"]
    task.standardOutput = FileHandle.nullDevice
    task.standardError = FileHandle.nullDevice
    try? task.run()
    print("Amaranth Check is running in the menu bar.")
    exit(0)
}

let app = NSApplication.shared
app.setActivationPolicy(.accessory)

withExtendedLifetime(StatusBarController()) {
    app.run()
}

// MARK: - Terminal helpers

#if canImport(Darwin)
import Darwin

func enableRawMode() -> termios {
    var raw = termios()
    tcgetattr(STDIN_FILENO, &raw)
    let original = raw
    raw.c_lflag &= ~UInt(ECHO)
    tcsetattr(STDIN_FILENO, TCSANOW, &raw)
    return original
}

func restoreMode(_ attrs: termios) {
    var a = attrs
    tcsetattr(STDIN_FILENO, TCSANOW, &a)
}
#endif
