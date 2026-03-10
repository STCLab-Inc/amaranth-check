import AppKit

// MARK: - CLI

let args = CommandLine.arguments

if args.contains("--setup") {
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
    print("Done! Run `amaranth-check` to start the menu bar app.")
    exit(0)
}

if args.contains("--status") {
    guard let cache = loadCache(), let come = cache.come, let comeMin = parseTime(come) else {
        print("No check-in data for today")
        exit(0)
    }
    let config = loadConfig()
    let leaveMin = comeMin + 540
    let leaveEst = formatMinutes(leaveMin)
    if let leave = cache.leave, !leave.isEmpty {
        print("In: \(come)  Out: \(leave)  \(config.emojiDone) \(config.labelDone)")
    } else {
        let cal = Calendar.current
        let now = cal.component(.hour, from: Date()) * 60 + cal.component(.minute, from: Date())
        let remain = leaveMin - now
        if remain <= 0 {
            print("In: \(come)  Out: \(leaveEst)  \(config.emojiDone) \(config.labelDone)")
        } else {
            print("In: \(come)  Out: \(leaveEst)  \(remain / 60)h\(remain % 60)m \(config.labelLeft)")
        }
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
