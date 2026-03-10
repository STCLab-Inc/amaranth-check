import AppKit

class StatusBarController: NSObject {
    let statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
    var displayTimer: Timer?
    var refreshTimer: Timer?
    var config = loadConfig()
    let settingsController = SettingsWindowController()
    var lastNotifiedDone = false

    override init() {
        super.init()
        requestNotificationPermission()
        updateDisplay()

        // 1분마다 화면 갱신
        displayTimer = Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { [weak self] _ in
            self?.updateDisplay()
        }

        // 10분마다 캐시 갱신
        refreshTimer = Timer.scheduledTimer(withTimeInterval: 600, repeats: true) { [weak self] _ in
            refreshCache { self?.updateDisplay() }
        }

        // 초기 캐시 갱신
        if loadCache() == nil {
            refreshCache { [weak self] in self?.updateDisplay() }
        }
    }

    func updateDisplay() {
        config = loadConfig()

        guard let cache = loadCache(),
              let come = cache.come,
              let comeMin = parseTime(come) else {
            statusItem.button?.title = config.labelNoData
            statusItem.button?.image = NSImage(systemSymbolName: "clock", accessibilityDescription: nil)
            buildMenu(come: nil, leaveEst: nil, leave: nil, remain: nil, pct: nil)
            return
        }

        statusItem.button?.image = nil
        let leaveMin = comeMin + 540
        let leaveEst = formatMinutes(leaveMin)

        if let leave = cache.leave, !leave.isEmpty {
            statusItem.button?.title = "\(config.emojiDone) \(config.labelDone)"
            statusItem.button?.contentTintColor = nsColor(config.colorDone)
            buildMenu(come: come, leaveEst: leaveEst, leave: leave, remain: nil, pct: 100)
            notifyDoneIfNeeded()
            return
        }

        let cal = Calendar.current
        let nowMin = cal.component(.hour, from: Date()) * 60 + cal.component(.minute, from: Date())
        let remain = leaveMin - nowMin
        let elapsed = nowMin - comeMin
        let pct = min(100, max(0, elapsed * 100 / 540))

        if remain <= 0 {
            statusItem.button?.title = "\(config.emojiDone) \(config.labelDone)"
            statusItem.button?.contentTintColor = nsColor(config.colorDone)
            notifyDoneIfNeeded()
        } else {
            let timeStr = formatRemain(remain, format: config.timeFormat)
            statusItem.button?.title = "\(timeStr) \(config.labelLeft)"
            statusItem.button?.contentTintColor = pctColor(pct)
        }

        buildMenu(come: come, leaveEst: leaveEst, leave: nil, remain: remain > 0 ? remain : nil, pct: pct)
    }

    func pctColor(_ pct: Int) -> NSColor {
        if pct < 40 { return nsColor(config.colorEarly) }
        if pct < 80 { return nsColor(config.colorMid) }
        return nsColor(config.colorLate)
    }

    func nsColor(_ hex: String) -> NSColor {
        let c = hexColor(hex)
        return NSColor(red: c.r, green: c.g, blue: c.b, alpha: 1.0)
    }

    // MARK: - Menu

    func buildMenu(come: String?, leaveEst: String?, leave: String?, remain: Int?, pct: Int?) {
        let menu = NSMenu()

        // 날짜
        let dateItem = NSMenuItem(title: dateString(), action: nil, keyEquivalent: "")
        dateItem.isEnabled = false
        menu.addItem(dateItem)

        // 출퇴근 시간
        if let come = come {
            let outTime = leave ?? leaveEst ?? "–"
            let timeItem = NSMenuItem(title: "In: \(come)  Out: \(outTime)", action: nil, keyEquivalent: "")
            timeItem.isEnabled = false
            timeItem.attributedTitle = NSAttributedString(
                string: timeItem.title,
                attributes: [.font: NSFont.monospacedSystemFont(ofSize: 13, weight: .regular)]
            )
            menu.addItem(timeItem)
        } else {
            let noData = NSMenuItem(title: "No check-in today", action: nil, keyEquivalent: "")
            noData.isEnabled = false
            menu.addItem(noData)
        }

        // 진행바
        if config.showProgressBar, let pct = pct {
            let filled = pct / 10
            let empty = 10 - filled
            let bar = String(repeating: "█", count: filled) + String(repeating: "░", count: empty)
            let barItem = NSMenuItem(title: "\(bar)  \(pct)%", action: nil, keyEquivalent: "")
            barItem.isEnabled = false
            barItem.attributedTitle = NSAttributedString(
                string: barItem.title,
                attributes: [.font: NSFont.monospacedSystemFont(ofSize: 12, weight: .regular)]
            )
            menu.addItem(barItem)
        }

        menu.addItem(.separator())

        let openItem = NSMenuItem(title: "Open Amaranth", action: #selector(openAmaranth), keyEquivalent: "")
        openItem.target = self
        menu.addItem(openItem)

        let refreshItem = NSMenuItem(title: "Refresh", action: #selector(doRefresh), keyEquivalent: "r")
        refreshItem.target = self
        menu.addItem(refreshItem)

        menu.addItem(.separator())

        let settingsItem = NSMenuItem(title: "Settings...", action: #selector(openSettings), keyEquivalent: ",")
        settingsItem.target = self
        menu.addItem(settingsItem)

        let quitItem = NSMenuItem(title: "Quit", action: #selector(doQuit), keyEquivalent: "q")
        quitItem.target = self
        menu.addItem(quitItem)

        statusItem.menu = menu
    }

    func dateString() -> String {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd (E)"
        f.locale = Locale(identifier: "en_US")
        return f.string(from: Date())
    }

    // MARK: - Notification

    func requestNotificationPermission() {
        // osascript로 알림을 보내므로 별도 권한 불필요
    }

    func notifyDoneIfNeeded() {
        guard config.notifyOnDone, !lastNotifiedDone else { return }
        lastNotifiedDone = true
        let body = "퇴근 가능! \(config.emojiDone)"
        let script = "display notification \"\(body)\" with title \"Amaranth Check\" sound name \"default\""
        let task = Process()
        task.executableURL = URL(fileURLWithPath: "/usr/bin/osascript")
        task.arguments = ["-e", script]
        try? task.run()
    }

    // MARK: - Actions

    @objc func openAmaranth() {
        NSWorkspace.shared.open(URL(string: "https://gw.stclab.com/")!)
    }

    @objc func doRefresh() {
        statusItem.button?.title = "..."
        refreshCache { [weak self] in self?.updateDisplay() }
    }

    @objc func openSettings() {
        settingsController.show { [weak self] config in
            self?.config = config
            self?.updateDisplay()
        }
    }

    @objc func doQuit() {
        NSApplication.shared.terminate(nil)
    }
}
