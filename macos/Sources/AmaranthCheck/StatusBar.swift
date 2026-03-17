import AppKit

class StatusBarController: NSObject {
    let statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
    var displayTimer: Timer?
    var refreshTimer: Timer?
    var config = loadConfig()
    let settingsController = SettingsWindowController()
    var lastNotifiedDone = false
    var lastNotifiedLunch = false
    var isRefreshing = false
    var lastRefreshTime: Date?

    override init() {
        super.init()
        requestNotificationPermission()
        updateDisplay()

        // 다음 정분에 맞춰 갱신 시작
        let seconds = Calendar.current.component(.second, from: Date())
        let delay = TimeInterval(60 - seconds)
        Timer.scheduledTimer(withTimeInterval: delay, repeats: false) { [weak self] _ in
            self?.updateDisplay()
            self?.displayTimer = Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { [weak self] _ in
                self?.updateDisplay()
            }
        }

        // 10분마다 캐시 갱신
        refreshTimer = Timer.scheduledTimer(withTimeInterval: 600, repeats: true) { [weak self] _ in
            self?.safeRefresh()
        }

        // 초기 캐시 갱신
        if loadCache() == nil {
            safeRefresh()
        }
    }

    /// isRefreshing 가드를 통일한 단일 진입점
    func safeRefresh() {
        guard !isRefreshing else { return }
        isRefreshing = true
        refreshCache { [weak self] in
            self?.isRefreshing = false
            self?.lastRefreshTime = Date()
            self?.updateDisplay()
        }
    }

    // MARK: - Lunch time

    var isLunchTime: Bool {
        let cal = Calendar.current
        let now = Date()
        let nowMin = cal.component(.hour, from: now) * 60 + cal.component(.minute, from: now)
        return nowMin >= 690 && nowMin < 780  // 11:30 ~ 13:00
    }

    func notifyLunchIfNeeded() {
        guard config.notifyOnLunch, !lastNotifiedLunch else { return }
        let cal = Calendar.current
        let now = Date()
        let nowMin = cal.component(.hour, from: now) * 60 + cal.component(.minute, from: now)
        guard nowMin >= 690 && nowMin < 695 else { return }  // 11:30~11:34 사이에만
        lastNotifiedLunch = true
        sendNotification(config.lunchNotifyMessage)
    }

    // MARK: - Display

    func updateDisplay() {
        config = loadConfig()

        // 날짜가 바뀌면 알림 플래그 리셋
        let hour = Calendar.current.component(.hour, from: Date())
        if hour < 7 {
            lastNotifiedDone = false
            lastNotifiedLunch = false
        }

        // 점심 알림 체크
        notifyLunchIfNeeded()

        guard let cache = loadCache(),
              let status = calculateWorkStatus(cache: cache) else {
            setStatusTitle(config.labelNoData, color: .labelColor)
            statusItem.button?.image = NSImage(systemSymbolName: "clock", accessibilityDescription: nil)
            buildMenu(status: nil)
            // come이 없고 업무시간대(7~22시)면 출근 아직 안 잡힌 것 → 스크래핑
            if hour >= 7 && hour < 22 {
                safeRefresh()
            }
            return
        }

        statusItem.button?.image = nil

        // 점심시간 표시 모드
        if config.showLunchStatus && isLunchTime && !status.isDone {
            setStatusTitle("🍚 Lunch", color: .labelColor)
            buildMenu(status: status)
            return
        }

        if status.leave != nil {
            setStatusTitle("\(config.emojiDone) \(config.labelDone)", color: doneColor())
            notifyDoneIfNeeded()
        } else if let overtime = status.overtime, overtime > 0 {
            let otStr = formatRemain(overtime, format: config.timeFormat)
            setStatusTitle("\(config.emojiDone) +\(otStr)", color: doneColor())
            notifyDoneIfNeeded()
        } else if status.remain <= 0 {
            setStatusTitle("\(config.emojiDone) \(config.labelDone)", color: doneColor())
            notifyDoneIfNeeded()
        } else {
            let timeStr = formatRemain(status.remain, format: config.timeFormat)
            setStatusTitle("\(timeStr) \(config.labelLeft)", color: pctColor(status.pct))
        }

        buildMenu(status: status)
    }

    func setStatusTitle(_ text: String, color: NSColor) {
        statusItem.button?.title = ""
        let paragraph = NSMutableParagraphStyle()
        paragraph.alignment = .center
        statusItem.button?.attributedTitle = NSAttributedString(
            string: text,
            attributes: [
                .foregroundColor: color,
                .font: NSFont.monospacedDigitSystemFont(ofSize: 0, weight: .medium),
                .paragraphStyle: paragraph,
            ]
        )
    }

    var isDarkMode: Bool {
        NSApp.effectiveAppearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua
    }

    func pctColor(_ pct: Int) -> NSColor {
        let dark = isDarkMode
        if pct < 40 { return nsColor(dark ? config.colorEarlyDark : config.colorEarly) }
        if pct < 80 { return nsColor(dark ? config.colorMidDark : config.colorMid) }
        return nsColor(dark ? config.colorLateDark : config.colorLate)
    }

    func doneColor() -> NSColor {
        nsColor(isDarkMode ? config.colorDoneDark : config.colorDone)
    }

    func nsColor(_ hex: String) -> NSColor {
        let c = hexColor(hex)
        return NSColor(red: c.r, green: c.g, blue: c.b, alpha: 1.0)
    }

    // MARK: - Menu

    func buildMenu(status: WorkStatus?) {
        let menu = NSMenu()

        // 날짜
        let dateItem = NSMenuItem(title: dateString(), action: nil, keyEquivalent: "")
        dateItem.isEnabled = false
        menu.addItem(dateItem)

        // 출퇴근 시간
        if let s = status {
            let outTime = s.leave ?? s.leaveEst
            addMonoItem(menu, "In: \(s.come)  Out: \(outTime)")
        } else {
            let noData = NSMenuItem(title: "No check-in today", action: nil, keyEquivalent: "")
            noData.isEnabled = false
            menu.addItem(noData)
        }

        // 시간연차
        if let lm = status?.leaveMinutes, lm > 0 {
            let h = lm / 60, m = lm % 60
            let timeStr = h > 0 && m > 0 ? "\(h)h \(m)m" : h > 0 ? "\(h)h" : "\(m)m"
            addMonoItem(menu, "Leave: \(timeStr)")
        }

        // 진행바
        if config.showProgressBar, let pct = status?.pct {
            let filled = pct / 10
            let empty = 10 - filled
            let bar = String(repeating: "█", count: filled) + String(repeating: "░", count: empty)
            addMonoItem(menu, "\(bar)  \(pct)%", size: 12)
        }

        // 초과근무
        if let ot = status?.overtime, ot > 0 {
            let otStr = formatRemain(ot, format: config.timeFormat)
            addMonoItem(menu, "Overtime: +\(otStr)")
        }

        menu.addItem(.separator())

        let openItem = NSMenuItem(title: "Open Amaranth", action: #selector(openAmaranth), keyEquivalent: "")
        openItem.target = self
        menu.addItem(openItem)

        let refreshItem = NSMenuItem(title: "Refresh", action: #selector(doRefresh), keyEquivalent: "r")
        refreshItem.target = self
        menu.addItem(refreshItem)

        menu.addItem(.separator())

        // 마지막 갱신 시각
        let refreshStr: String
        if let t = lastRefreshTime {
            let f = DateFormatter()
            f.dateFormat = "HH:mm"
            refreshStr = "Last refresh: \(f.string(from: t))"
        } else {
            refreshStr = "Last refresh: --:--"
        }
        let refreshInfo = NSMenuItem(title: refreshStr, action: nil, keyEquivalent: "")
        refreshInfo.isEnabled = false
        menu.addItem(refreshInfo)

        let settingsItem = NSMenuItem(title: "Settings...", action: #selector(openSettings), keyEquivalent: ",")
        settingsItem.target = self
        menu.addItem(settingsItem)

        let quitItem = NSMenuItem(title: "Quit", action: #selector(doQuit), keyEquivalent: "q")
        quitItem.target = self
        menu.addItem(quitItem)

        statusItem.menu = menu
    }

    func addMonoItem(_ menu: NSMenu, _ title: String, size: CGFloat = 13) {
        let item = NSMenuItem(title: title, action: nil, keyEquivalent: "")
        item.isEnabled = false
        item.attributedTitle = NSAttributedString(
            string: title,
            attributes: [.font: NSFont.monospacedSystemFont(ofSize: size, weight: .regular)]
        )
        menu.addItem(item)
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

    func sendNotification(_ body: String) {
        let escaped = body.replacingOccurrences(of: "\"", with: "\\\"")
        let script = "display notification \"\(escaped)\" with title \"Amaranth Check\" sound name \"default\""
        let task = Process()
        task.executableURL = URL(fileURLWithPath: "/usr/bin/osascript")
        task.arguments = ["-e", script]
        try? task.run()
    }

    func notifyDoneIfNeeded() {
        guard config.notifyOnDone, !lastNotifiedDone else { return }
        lastNotifiedDone = true
        sendNotification("\(config.doneNotifyMessage) \(config.emojiDone)")
    }

    // MARK: - Actions

    @objc func openAmaranth() {
        NSWorkspace.shared.open(URL(string: "https://gw.stclab.com/")!)
    }

    @objc func doRefresh() {
        setStatusTitle("...", color: .labelColor)
        isRefreshing = false  // 수동 Refresh는 강제 실행
        safeRefresh()
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
