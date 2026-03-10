import Foundation

// MARK: - check.mjs 설치 및 실행

func ensureScraperInstalled() {
    let fm = FileManager.default
    // config dir
    try? fm.createDirectory(atPath: AppPaths.configDir, withIntermediateDirectories: true)

    // package.json
    if !fm.fileExists(atPath: AppPaths.packageJson) {
        let pkg = #"{"name":"amaranth-check","version":"1.0.0","type":"module","private":true}"#
        fm.createFile(atPath: AppPaths.packageJson, contents: pkg.data(using: .utf8))
    }

    // check.mjs
    writeCheckScript()

    // node_modules
    let nodeModules = AppPaths.configDir + "/node_modules"
    if !fm.fileExists(atPath: nodeModules) {
        runShell("cd \(AppPaths.configDir) && npm install playwright 2>/dev/null && npx playwright install chromium 2>/dev/null")
    }
}

func writeCheckScript() {
    let config = loadConfig()
    let script = """
    #!/usr/bin/env node
    import { chromium } from "playwright";
    import { join } from "path";
    import { homedir } from "os";
    import { rmSync, writeFileSync } from "fs";

    const USER_DATA_DIR = join(homedir(), ".amaranth-session");
    const COMPANY = \(jsonString(config.company));
    const USER_ID = \(jsonString(config.userId));
    const PASSWORD = \(jsonString(config.password));

    async function main() {
      try { rmSync(join(USER_DATA_DIR, "SingletonLock")); } catch {}
      const context = await chromium.launchPersistentContext(USER_DATA_DIR, { headless: true });
      const page = context.pages()[0] || (await context.newPage());

      await page.goto("https://gw.stclab.com/", { waitUntil: "networkidle", timeout: 20000 });

      if (page.url().includes("login")) {
        const compDisabled = await page.$eval("#reqCompCd", el => el.disabled).catch(() => false);
        if (!compDisabled) await page.fill("#reqCompCd", COMPANY);
        const idDisabled = await page.$eval("#reqLoginId", el => el.disabled).catch(() => false);
        if (!idDisabled) await page.fill("#reqLoginId", USER_ID);
        await page.click("button >> text=다음");
        await page.waitForTimeout(2000);
        await page.waitForSelector("#reqLoginPw", { state: "visible", timeout: 5000 });
        await page.fill("#reqLoginPw", PASSWORD);
        await page.click("button >> text=로그인");
        await page.waitForTimeout(5000);
      }

      await page.goto("https://gw.stclab.com/#/HP/HPD0210/HPD0210", {
        waitUntil: "networkidle", timeout: 20000,
      });
      await page.waitForSelector("table", { timeout: 15000 });
      await page.waitForTimeout(3000);

      const result = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll("table tr"));
        if (rows.length < 3) return null;
        const headers = Array.from(rows[0].querySelectorAll("td,th")).map(c => c.innerText.trim());
        const times = Array.from(rows[2].querySelectorAll("td,th")).map(c => c.innerText.trim());
        const today = new Date();
        const todayKey = (today.getMonth() + 1) + "월 " + today.getDate() + "일";
        for (let i = 1; i < headers.length; i++) {
          if (!headers[i].includes(todayKey)) continue;
          const lines = (times[i] || "").split("\\n");
          let come = null, leave = null;
          if (lines[0]) { const m = lines[0].match(/\\((\\d{2}:\\d{2})\\)/); if (m) come = m[1]; }
          if (lines[1]) { const m = lines[1].match(/\\((\\d{2}:\\d{2})\\)/); if (m) leave = m[1]; }
          return { come, leave };
        }
        return null;
      });

      await context.close();

      const cache = {
        date: new Date().toISOString().slice(0, 10),
        come: result?.come || null,
        leave: result?.leave || null,
      };
      writeFileSync(join(homedir(), ".amaranth-check", "cache.json"), JSON.stringify(cache));
    }

    main().catch(() => {});
    """

    FileManager.default.createFile(atPath: AppPaths.checkScript, contents: script.data(using: .utf8))
}

func refreshCache(completion: (() -> Void)? = nil) {
    DispatchQueue.global().async {
        runShell("cd \(AppPaths.configDir) && node check.mjs 2>/dev/null")
        DispatchQueue.main.async { completion?() }
    }
}

// MARK: - Helpers

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
