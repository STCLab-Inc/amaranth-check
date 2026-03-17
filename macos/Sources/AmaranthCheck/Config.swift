import Foundation

// MARK: - Models

struct AppConfig: Codable, Equatable {
    var company: String
    var userId: String
    var password: String
    // UI 커스텀
    var labelLeft: String
    var labelDone: String
    var labelNoData: String
    var emojiDone: String
    var showProgressBar: Bool
    var colorEarly: String  // hex (light mode)
    var colorMid: String
    var colorLate: String
    var colorDone: String
    var colorEarlyDark: String
    var colorMidDark: String
    var colorLateDark: String
    var colorDoneDark: String
    var timeFormat: String   // "hm" = 8h32m, "m" = 512m, "colon" = 8:32
    var notifyOnDone: Bool
    var doneNotifyMessage: String
    var notifyOnLunch: Bool
    var lunchNotifyMessage: String
    var showLunchStatus: Bool
    var launchAtLogin: Bool

    static let `default` = AppConfig(
        company: "stclab",
        userId: "",
        password: "",
        labelLeft: "left",
        labelDone: "Done",
        labelNoData: "--:--",
        emojiDone: "🎉",
        showProgressBar: true,
        colorEarly: "#34C759",
        colorMid: "#FF9500",
        colorLate: "#FF3B30",
        colorDone: "#34C759",
        colorEarlyDark: "#30D158",
        colorMidDark: "#FFD60A",
        colorLateDark: "#FF453A",
        colorDoneDark: "#30D158",
        timeFormat: "hm",
        notifyOnDone: true,
        doneNotifyMessage: "퇴근 가능!",
        notifyOnLunch: true,
        lunchNotifyMessage: "점심시간입니다 🍚",
        showLunchStatus: false,
        launchAtLogin: true
    )
}

struct AttendanceCache: Codable {
    let date: String
    let come: String?
    let leave: String?
    let leaveMinutes: Int?  // 시간연차 분 (e.g. 120 = 2시간)
}

// MARK: - Paths

enum AppPaths {
    static let configDir = NSHomeDirectory() + "/.amaranth-check"
    static let configFile = configDir + "/config.json"
    static let cacheFile = configDir + "/cache.json"
    static let packageJson = configDir + "/package.json"
    static let checkScript = configDir + "/check.mjs"
    static let sessionDir = NSHomeDirectory() + "/.amaranth-session"
    static let launchAgentPath = NSHomeDirectory() + "/Library/LaunchAgents/com.stclab.amaranth-check.plist"
}
