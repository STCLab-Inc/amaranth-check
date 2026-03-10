import AppKit
import SwiftUI

// MARK: - Settings View

struct SettingsView: View {
    @State private var config = loadConfig()
    @State private var saved = false
    var onSave: ((AppConfig) -> Void)?

    var body: some View {
        TabView {
            accountTab.tabItem { Label("Account", systemImage: "person.circle") }
            appearanceTab.tabItem { Label("Appearance", systemImage: "paintbrush") }
            generalTab.tabItem { Label("General", systemImage: "gear") }
        }
        .frame(width: 480, height: 560)
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
            Spacer()
            saveBar
        }.padding(20)
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
                    Text("No data").frame(width: 100, alignment: .trailing)
                    TextField("", text: $config.labelNoData).textFieldStyle(.roundedBorder).frame(width: 80)
                    Text("").gridCellUnsizedAxes(.horizontal)
                }
                GridRow {
                    Text("Done emoji").frame(width: 100, alignment: .trailing)
                    TextField("", text: $config.emojiDone).textFieldStyle(.roundedBorder).frame(width: 80)
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

            Text("Time Colors — Light").font(.headline)
            HStack(spacing: 16) {
                colorField("Early (0-40%)", hex: $config.colorEarly)
                colorField("Mid (40-80%)", hex: $config.colorMid)
                colorField("Late (80%+)", hex: $config.colorLate)
            }

            Text("Time Colors — Dark").font(.headline)
            HStack(spacing: 16) {
                colorField("Early (0-40%)", hex: $config.colorEarlyDark)
                colorField("Mid (40-80%)", hex: $config.colorMidDark)
                colorField("Late (80%+)", hex: $config.colorLateDark)
            }

            Spacer()
            saveBar
        }.padding(20)
    }

    func colorField(_ label: String, hex: Binding<String>) -> some View {
        VStack(spacing: 4) {
            Text(label).font(.caption).foregroundColor(.secondary)
            HStack(spacing: 4) {
                TextField("", text: hex)
                    .textFieldStyle(.roundedBorder)
                    .frame(width: 80)
                    .font(.system(.body, design: .monospaced))
                ColorPicker("", selection: Binding(
                    get: { hexToColor(hex.wrappedValue) },
                    set: { hex.wrappedValue = colorToHex($0) }
                ), supportsOpacity: false)
                .labelsHidden()
                .frame(width: 24)
            }
        }
    }

    // MARK: General Tab

    var generalTab: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("General").font(.headline)
            Toggle("Launch at Login", isOn: $config.launchAtLogin)
            Toggle("Notify when done", isOn: $config.notifyOnDone)
            Spacer()
            saveBar
        }.padding(20)
    }

    // MARK: Save Bar

    var saveBar: some View {
        HStack {
            Spacer()
            if saved { Text("Saved!").foregroundColor(.green).font(.caption) }
            Button("Save") { doSave() }.keyboardShortcut(.defaultAction)
        }
    }

    func doSave() {
        // 디버그: 저장되는 색상 로깅
        print("[Settings] Saving colors: early=\(config.colorEarly) mid=\(config.colorMid) late=\(config.colorLate)")
        print("[Settings] Dark colors: early=\(config.colorEarlyDark) mid=\(config.colorMidDark) late=\(config.colorLateDark)")
        saveConfig(config)
        writeCheckScript() // 비밀번호 변경 반영
        // Launch at Login
        if config.launchAtLogin {
            if let bin = findBinaryPath() {
                installLaunchAgent(binPath: bin)
            }
        } else {
            removeLaunchAgent()
        }
        onSave?(config)
        saved = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { saved = false }
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
        w.makeKeyAndOrderFront(nil)
        w.isReleasedWhenClosed = false
        NSApp.activate(ignoringOtherApps: true)
        window = w
    }
}
