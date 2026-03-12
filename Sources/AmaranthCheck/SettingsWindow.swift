import AppKit
import SwiftUI

// MARK: - Settings View

struct SettingsView: View {
    @State private var config = loadConfig()
    var onSave: ((AppConfig) -> Void)?

    var body: some View {
        TabView {
            accountTab.tabItem { Label("Account", systemImage: "person.circle") }
            appearanceTab.tabItem { Label("Appearance", systemImage: "paintbrush") }
            generalTab.tabItem { Label("General", systemImage: "gear") }
        }
        .frame(width: 440, height: 480)
        .onChange(of: config) { _ in doSave() }
    }

    // MARK: Account Tab

    var accountTab: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Amaranth Login").font(.headline)
            Grid(alignment: .leading, horizontalSpacing: 12, verticalSpacing: 8) {
                GridRow {
                    Text("Company Code").frame(width: 120, alignment: .trailing)
                    TextField("stclab", text: $config.company).textFieldStyle(.roundedBorder)
                }
                GridRow {
                    Text("User ID").frame(width: 120, alignment: .trailing)
                    TextField("", text: $config.userId).textFieldStyle(.roundedBorder)
                }
                GridRow {
                    Text("Password").frame(width: 120, alignment: .trailing)
                    SecureField("", text: $config.password).textFieldStyle(.roundedBorder)
                }
            }
        }.padding(20).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    // MARK: Appearance Tab

    var appearanceTab: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Menu Bar Text").font(.headline)
            Grid(alignment: .leading, horizontalSpacing: 12, verticalSpacing: 8) {
                GridRow {
                    Text("Working").frame(width: 100, alignment: .trailing)
                    TextField("", text: $config.labelLeft).textFieldStyle(.roundedBorder).frame(width: 80)
                    Text("\(formatRemain(512, format: config.timeFormat)) \(config.labelLeft)").foregroundColor(.secondary).font(.caption)
                }
                GridRow {
                    Text("Done").frame(width: 100, alignment: .trailing)
                    TextField("", text: $config.labelDone).textFieldStyle(.roundedBorder).frame(width: 80)
                    Text("").gridCellUnsizedAxes(.horizontal)
                }
                GridRow {
                    Text("Done emoji").frame(width: 100, alignment: .trailing)
                    EmojiPicker(selection: $config.emojiDone)
                    Text("").gridCellUnsizedAxes(.horizontal)
                }
            }

            Divider()

            HStack {
                Text("Time format")
                Picker("", selection: $config.timeFormat) {
                    Text("8h32m").tag("hm")
                    Text("512m").tag("m")
                    Text("8:32").tag("colon")
                }.pickerStyle(.segmented).frame(width: 200)
            }

            Toggle("Show progress bar in dropdown", isOn: $config.showProgressBar)

            Divider()

            Text("Time Colors").font(.headline)
            Grid(alignment: .leading, horizontalSpacing: 12, verticalSpacing: 8) {
                GridRow {
                    Text("").frame(width: 50)
                    Text("Early").font(.caption).foregroundColor(.secondary).frame(width: 60)
                    Text("Mid").font(.caption).foregroundColor(.secondary).frame(width: 60)
                    Text("Late").font(.caption).foregroundColor(.secondary).frame(width: 60)
                }
                GridRow {
                    Text("Light").frame(width: 50, alignment: .trailing).font(.caption)
                    colorDot(hex: $config.colorEarly)
                    colorDot(hex: $config.colorMid)
                    colorDot(hex: $config.colorLate)
                }
                GridRow {
                    Text("Dark").frame(width: 50, alignment: .trailing).font(.caption)
                    colorDot(hex: $config.colorEarlyDark)
                    colorDot(hex: $config.colorMidDark)
                    colorDot(hex: $config.colorLateDark)
                }
            }

        }.padding(20).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    func colorDot(hex: Binding<String>) -> some View {
        ColorPicker("", selection: Binding(
            get: { hexToColor(hex.wrappedValue) },
            set: { hex.wrappedValue = colorToHex($0) }
        ), supportsOpacity: false)
        .labelsHidden()
        .frame(width: 60)
    }

    // MARK: General Tab

    @State private var copied = false

    var generalTab: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("General").font(.headline)
            Toggle("Launch at Login", isOn: $config.launchAtLogin)
            Toggle("Notify when done", isOn: $config.notifyOnDone)

            Divider()

            Text("Troubleshooting").font(.headline)
            HStack {
                Button(copied ? "Copied!" : "Copy Debug Info") {
                    let info = collectDebugInfo()
                    NSPasteboard.general.clearContents()
                    NSPasteboard.general.setString(info, forType: .string)
                    copied = true
                    DispatchQueue.main.asyncAfter(deadline: .now() + 2) { copied = false }
                }
                Text("Paste to Slack for support").font(.caption).foregroundColor(.secondary)
            }
        }.padding(20).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    func collectDebugInfo() -> String {
        let fm = FileManager.default
        let cache = loadCache()
        let cacheStr: String
        if let data = fm.contents(atPath: AppPaths.cacheFile),
           let json = String(data: data, encoding: .utf8) {
            cacheStr = json
        } else {
            cacheStr = "(no cache)"
        }

        let errorLog: String
        let errorPath = AppPaths.configDir + "/error.log"
        if let data = fm.contents(atPath: errorPath),
           let log = String(data: data, encoding: .utf8), !log.isEmpty {
            // 마지막 500자만
            errorLog = String(log.suffix(500))
        } else {
            errorLog = "(no errors)"
        }

        let version = appVersion

        let hasNode = fm.fileExists(atPath: "/usr/local/bin/node") || fm.fileExists(atPath: "/opt/homebrew/bin/node")
        let hasSession = fm.fileExists(atPath: AppPaths.sessionDir)
        let hasScript = fm.fileExists(atPath: AppPaths.checkScript)

        return """
        ```
        amaranth-check debug
        version: \(version)
        date: \(formatDate(Date()))
        cache: \(cacheStr)
        node: \(hasNode)
        session: \(hasSession)
        script: \(hasScript)
        error.log: \(errorLog)
        ```
        """
    }

    func doSave() {
        saveConfig(config)
        writeCheckScript()
        if config.launchAtLogin {
            if let bin = findBinaryPath() {
                installLaunchAgent(binPath: bin)
            }
        } else {
            removeLaunchAgent()
        }
        onSave?(config)
    }
}

func hexToColor(_ hex: String) -> Color {
    let c = hexColor(hex)
    return Color(red: c.r, green: c.g, blue: c.b)
}

func colorToHex(_ color: Color) -> String {
    let ns = NSColor(color)
    // catalog/dynamic color를 sRGB로 변환 시도
    if let srgb = ns.usingColorSpace(.sRGB) {
        let r = Int(srgb.redComponent * 255)
        let g = Int(srgb.greenComponent * 255)
        let b = Int(srgb.blueComponent * 255)
        return String(format: "#%02X%02X%02X", r, g, b)
    }
    // fallback: CGColor 경로
    let cgColor = ns.cgColor
    if let comps = cgColor.components, comps.count >= 3 {
        let r = Int(comps[0] * 255)
        let g = Int(comps[1] * 255)
        let b = Int(comps[2] * 255)
        return String(format: "#%02X%02X%02X", r, g, b)
    }
    return "#000000"
}

func findBinaryPath() -> String? {
    let candidates = [
        "/opt/homebrew/bin/amaranth-check",
        "/usr/local/bin/amaranth-check",
        Bundle.main.executablePath
    ]
    return candidates.compactMap { $0 }.first { FileManager.default.fileExists(atPath: $0) }
}

// MARK: - Window Controller

class SettingsWindowController {
    var window: NSWindow?
    var deactivateObserver: Any?

    func show(onSave: @escaping (AppConfig) -> Void) {
        if let w = window, w.isVisible {
            w.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
            return
        }

        let view = SettingsView(onSave: onSave)
        let hostingController = NSHostingController(rootView: view)
        let w = NSWindow(contentViewController: hostingController)
        w.title = "Amaranth Check Settings"
        w.styleMask = [.titled, .closable]
        w.center()

        // Edit 메뉴 추가 (Cmd+V, Cmd+C, Cmd+X, 이모지 피커 지원)
        NSApp.setActivationPolicy(.regular)
        installEditMenu()
        w.makeKeyAndOrderFront(nil)
        w.isReleasedWhenClosed = false
        NSApp.activate(ignoringOtherApps: true)

        // 창 닫힐 때 다시 accessory로 복원
        NotificationCenter.default.addObserver(
            forName: NSWindow.willCloseNotification,
            object: w,
            queue: .main
        ) { [weak self] _ in
            self?.window = nil
            self?.deactivateObserver = nil
            NSApp.mainMenu = nil
            NSApp.setActivationPolicy(.accessory)
        }

        // 포커스 아웃 시 닫기
        deactivateObserver = NotificationCenter.default.addObserver(
            forName: NSApplication.didResignActiveNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            self?.window?.close()
        }
        window = w
    }
}

private func installEditMenu() {
    let mainMenu = NSMenu()
    let appMenuItem = NSMenuItem()
    mainMenu.addItem(appMenuItem)

    let editMenuItem = NSMenuItem()
    editMenuItem.title = "Edit"
    let editMenu = NSMenu(title: "Edit")
    editMenu.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
    editMenu.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
    editMenu.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
    editMenu.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
    editMenu.addItem(.separator())
    editMenu.addItem(withTitle: "Emoji & Symbols", action: #selector(NSApplication.orderFrontCharacterPalette(_:)), keyEquivalent: "")
    editMenuItem.submenu = editMenu
    mainMenu.addItem(editMenuItem)

    NSApp.mainMenu = mainMenu
}

// MARK: - Emoji Picker

struct EmojiPicker: View {
    @Binding var selection: String
    @State private var showGrid = false

    private let emojis = [
        "🎉", "✅", "🔥", "🏠", "👋", "🍺",
        "🚀", "⭐", "💪", "🎯", "✨", "🌈",
        "☕", "🍕", "😎", "💤", "🏃", "🎶",
    ]

    @State private var custom = ""

    var body: some View {
        HStack(spacing: 8) {
            Text(selection).font(.title2)
            Button("Change") { showGrid.toggle() }
                .popover(isPresented: $showGrid) {
                    VStack(spacing: 8) {
                        LazyVGrid(columns: Array(repeating: GridItem(.fixed(36)), count: 6), spacing: 8) {
                            ForEach(emojis, id: \.self) { emoji in
                                Button(emoji) {
                                    selection = emoji
                                    showGrid = false
                                }
                                .buttonStyle(.plain)
                                .font(.title2)
                                .frame(width: 36, height: 36)
                                .background(selection == emoji ? Color.accentColor.opacity(0.2) : Color.clear)
                                .cornerRadius(6)
                            }
                        }
                        Divider()
                        HStack {
                            Text("Custom:").font(.caption)
                            TextField("Paste emoji", text: $custom)
                                .textFieldStyle(.roundedBorder)
                                .frame(width: 80)
                            Button("OK") {
                                if !custom.isEmpty {
                                    selection = custom
                                    custom = ""
                                    showGrid = false
                                }
                            }.disabled(custom.isEmpty)
                        }
                    }
                    .padding(12)
                }
        }
    }
}

