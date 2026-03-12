import Foundation

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
