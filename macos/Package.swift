// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "amaranth-check",
    platforms: [.macOS(.v13)],
    targets: [
        .executableTarget(
            name: "amaranth-check",
            path: "Sources/AmaranthCheck"
        )
    ]
)
