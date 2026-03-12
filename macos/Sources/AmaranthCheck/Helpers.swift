import Foundation

// MARK: - Time Formatting

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

// MARK: - Color

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

// MARK: - Shell

func runShell(_ command: String) {
    let task = Process()
    task.executableURL = URL(fileURLWithPath: "/bin/bash")
    task.arguments = ["-lc", command]
    task.standardOutput = FileHandle.nullDevice
    task.standardError = FileHandle.nullDevice
    try? task.run()
    task.waitUntilExit()
}

func jsonString(_ s: String) -> String {
    let escaped = s
        .replacingOccurrences(of: "\\", with: "\\\\")
        .replacingOccurrences(of: "\"", with: "\\\"")
    return "\"\(escaped)\""
}
