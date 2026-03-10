import Foundation

func installLaunchAgent(binPath: String) {
    let plist = """
    <?xml version="1.0" encoding="UTF-8"?>
    <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
    <plist version="1.0">
    <dict>
        <key>Label</key>
        <string>com.stclab.amaranth-check</string>
        <key>ProgramArguments</key>
        <array>
            <string>\(binPath)</string>
        </array>
        <key>RunAtLoad</key>
        <true/>
        <key>KeepAlive</key>
        <false/>
    </dict>
    </plist>
    """

    let dir = NSHomeDirectory() + "/Library/LaunchAgents"
    try? FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
    FileManager.default.createFile(atPath: AppPaths.launchAgentPath, contents: plist.data(using: .utf8))
    runShell("launchctl load \(AppPaths.launchAgentPath) 2>/dev/null")
}

func removeLaunchAgent() {
    runShell("launchctl unload \(AppPaths.launchAgentPath) 2>/dev/null")
    try? FileManager.default.removeItem(atPath: AppPaths.launchAgentPath)
}

func isLaunchAgentInstalled() -> Bool {
    FileManager.default.fileExists(atPath: AppPaths.launchAgentPath)
}
