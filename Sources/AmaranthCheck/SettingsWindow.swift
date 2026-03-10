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
        .frame(width: 420, height: 340)
        .padding()
    }

    // MARK: Account Tab

    var accountTab: some View {
        Form {
            Section("Amaranth Login") {
                TextField("Company Code", text: $config.company)
                TextField("User ID", text: $config.userId)
                SecureField("Password", text: $config.password)
            }
            HStack {
                Spacer()
                if saved {
                    Text("Saved!").foregroundColor(.green).font(.caption)
                }
                Button("Save") { doSave() }.keyboardShortcut(.defaultAction)
            }
        }.padding()
    }

    // MARK: Appearance Tab

    var appearanceTab: some View {
        Form {
            Section("Menu Bar Text") {
                HStack {
                    Text("Working")
                    Spacer()
                    TextField("", text: $config.labelLeft).frame(width: 100).textFieldStyle(.roundedBorder)
                    Text("→ 8h32m \(config.labelLeft)").foregroundColor(.secondary).font(.caption)
                }
                HStack {
                    Text("Done")
                    Spacer()
                    TextField("", text: $config.labelDone).frame(width: 100).textFieldStyle(.roundedBorder)
                }
                HStack {
                    Text("No data")
                    Spacer()
                    TextField("", text: $config.labelNoData).frame(width: 100).textFieldStyle(.roundedBorder)
                }
                HStack {
                    Text("Done emoji")
                    Spacer()
                    TextField("", text: $config.emojiDone).frame(width: 100).textFieldStyle(.roundedBorder)
                }
            }
            Section("Progress Bar") {
                Toggle("Show in dropdown", isOn: $config.showProgressBar)
            }
            Section("Colors (hex)") {
                HStack {
                    colorRow("Early (0-40%)", hex: $config.colorEarly)
                    colorRow("Mid (40-80%)", hex: $config.colorMid)
                    colorRow("Late (80%+)", hex: $config.colorLate)
                }
            }
            HStack {
                Spacer()
                if saved { Text("Saved!").foregroundColor(.green).font(.caption) }
                Button("Save") { doSave() }.keyboardShortcut(.defaultAction)
            }
        }.padding()
    }

    func colorRow(_ label: String, hex: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).font(.caption2).foregroundColor(.secondary)
            TextField("", text: hex).frame(width: 80).textFieldStyle(.roundedBorder).font(.system(.caption, design: .monospaced))
        }
    }

    // MARK: General Tab

    var generalTab: some View {
        Form {
            Section {
                Toggle("Launch at Login", isOn: $config.launchAtLogin)
                Toggle("Notify when done", isOn: $config.notifyOnDone)
            }
            HStack {
                Spacer()
                if saved { Text("Saved!").foregroundColor(.green).font(.caption) }
                Button("Save") { doSave() }.keyboardShortcut(.defaultAction)
            }
        }.padding()
    }

    func doSave() {
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
