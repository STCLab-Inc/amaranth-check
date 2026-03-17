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

func runShell(_ command: String, timeout: TimeInterval = 0) {
    let task = Process()
    task.executableURL = URL(fileURLWithPath: "/bin/bash")
    task.arguments = ["-lc", command]
    task.standardOutput = FileHandle.nullDevice
    task.standardError = FileHandle.nullDevice
    do {
        try task.run()
    } catch { return }

    if timeout > 0 {
        DispatchQueue.global().async {
            Thread.sleep(forTimeInterval: timeout)
            if task.isRunning { task.terminate() }
        }
    }
    task.waitUntilExit()
}

func getNodeVersionAt(_ path: String) -> (path: String, version: String, major: Int)? {
    let task = Process()
    task.executableURL = URL(fileURLWithPath: path)
    task.arguments = ["--version"]
    let pipe = Pipe()
    task.standardOutput = pipe
    task.standardError = FileHandle.nullDevice
    do {
        try task.run()
        task.waitUntilExit()
        guard task.terminationStatus == 0 else { return nil }
        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        guard let ver = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines),
              !ver.isEmpty else { return nil }
        let cleaned = ver.hasPrefix("v") ? String(ver.dropFirst()) : ver
        guard let major = Int(cleaned.split(separator: ".").first ?? "") else { return nil }
        return (path, ver, major)
    } catch {
        return nil
    }
}

func findBestNode() -> (path: String, version: String, major: Int)? {
    let fm = FileManager.default
    let home = fm.homeDirectoryForCurrentUser.path
    var candidates: [String] = [
        "/opt/homebrew/bin/node",
        "/usr/local/bin/node",
    ]

    // nvm: ~/.nvm/versions/node/v*/bin/node
    let nvmDir = home + "/.nvm/versions/node"
    if let dirs = try? fm.contentsOfDirectory(atPath: nvmDir) {
        for d in dirs.sorted().reversed() {
            candidates.append(nvmDir + "/\(d)/bin/node")
        }
    }

    // mise: ~/.local/share/mise/installs/node/*/bin/node
    let miseDir = home + "/.local/share/mise/installs/node"
    if let dirs = try? fm.contentsOfDirectory(atPath: miseDir) {
        for d in dirs.sorted().reversed() {
            candidates.append(miseDir + "/\(d)/bin/node")
        }
    }

    // fnm: ~/.local/share/fnm/node-versions/*/installation/bin/node
    let fnmDir = home + "/.local/share/fnm/node-versions"
    if let dirs = try? fm.contentsOfDirectory(atPath: fnmDir) {
        for d in dirs.sorted().reversed() {
            candidates.append(fnmDir + "/\(d)/installation/bin/node")
        }
    }

    // 후보 중 18+ 인 것만 모아서 가장 높은 버전 선택
    var best: (path: String, version: String, major: Int)?
    for c in candidates {
        guard fm.fileExists(atPath: c),
              let info = getNodeVersionAt(c),
              info.major >= 18 else { continue }
        if best == nil || info.major > best!.major {
            best = info
        }
    }
    return best
}

func getNodeVersion() -> String? {
    return findBestNode()?.version
}

func getNodePath() -> String? {
    return findBestNode()?.path
}

func jsonString(_ s: String) -> String {
    let escaped = s
        .replacingOccurrences(of: "\\", with: "\\\\")
        .replacingOccurrences(of: "\"", with: "\\\"")
    return "\"\(escaped)\""
}
