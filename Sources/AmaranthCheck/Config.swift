import Foundation

struct AppConfig: Codable {
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
        launchAtLogin: true
    )
}

struct AttendanceCache: Codable {
    let date: String
    let come: String?
    let leave: String?
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

// MARK: - Config IO

func loadConfig() -> AppConfig {
    guard let data = FileManager.default.contents(atPath: AppPaths.configFile),
          let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
        return .default
    }
    let d = AppConfig.default
    return AppConfig(
        company: json["company"] as? String ?? d.company,
        userId: json["userId"] as? String ?? d.userId,
        password: json["password"] as? String ?? d.password,
        labelLeft: json["labelLeft"] as? String ?? d.labelLeft,
        labelDone: json["labelDone"] as? String ?? d.labelDone,
        labelNoData: json["labelNoData"] as? String ?? d.labelNoData,
        emojiDone: json["emojiDone"] as? String ?? d.emojiDone,
        showProgressBar: json["showProgressBar"] as? Bool ?? d.showProgressBar,
        colorEarly: json["colorEarly"] as? String ?? d.colorEarly,
        colorMid: json["colorMid"] as? String ?? d.colorMid,
        colorLate: json["colorLate"] as? String ?? d.colorLate,
        colorDone: json["colorDone"] as? String ?? d.colorDone,
        colorEarlyDark: json["colorEarlyDark"] as? String ?? d.colorEarlyDark,
        colorMidDark: json["colorMidDark"] as? String ?? d.colorMidDark,
        colorLateDark: json["colorLateDark"] as? String ?? d.colorLateDark,
        colorDoneDark: json["colorDoneDark"] as? String ?? d.colorDoneDark,
        timeFormat: json["timeFormat"] as? String ?? d.timeFormat,
        notifyOnDone: json["notifyOnDone"] as? Bool ?? d.notifyOnDone,
        launchAtLogin: json["launchAtLogin"] as? Bool ?? d.launchAtLogin
    )
}

func saveConfig(_ config: AppConfig) {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
    guard let data = try? encoder.encode(config) else { return }
    FileManager.default.createFile(atPath: AppPaths.configFile, contents: data)
}

// MARK: - Cache IO

func loadCache() -> AttendanceCache? {
    guard let data = FileManager.default.contents(atPath: AppPaths.cacheFile),
          let cache = try? JSONDecoder().decode(AttendanceCache.self, from: data) else {
        return nil
    }
    let today = formatDate(Date())
    guard cache.date == today else { return nil }
    return cache
}

func formatDate(_ date: Date) -> String {
    let f = DateFormatter()
    f.dateFormat = "yyyy-MM-dd"
    return f.string(from: date)
}

func parseTime(_ s: String) -> Int? {
    let parts = s.split(separator: ":").compactMap { Int($0) }
    guard parts.count == 2 else { return nil }
    return parts[0] * 60 + parts[1]
}

func formatMinutes(_ m: Int) -> String {
    String(format: "%02d:%02d", m / 60, m % 60)
}

func formatRemain(_ remain: Int, format: String) -> String {
    let h = remain / 60, m = remain % 60
    switch format {
    case "m": return "\(remain)m"
    case "colon": return "\(h):\(String(format: "%02d", m))"
    default: return "\(h)h\(m)m"
    }
}

func hexColor(_ hex: String) -> (r: Double, g: Double, b: Double) {
    let h = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
    guard h.count == 6, let val = UInt64(h, radix: 16) else {
        return (0, 0, 0)
    }
    return (
        Double((val >> 16) & 0xFF) / 255.0,
        Double((val >> 8) & 0xFF) / 255.0,
        Double(val & 0xFF) / 255.0
    )
}
