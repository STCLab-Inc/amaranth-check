import { chromium } from "playwright";
import { rmSync, mkdirSync } from "fs";
import { join } from "path";
import { loadCredentials, SESSION_DIR, BASE_URL } from "./config.mjs";
import { SEL, ROUTES, pick } from "./selectors.mjs";
import { log } from "./log.mjs";

// persistent context = 로컬 자동화에 맞는 방식(공식 가이드). 프로필은 앱 스크레이퍼와 분리.
export async function openSession({ headed = false, sessionDir = SESSION_DIR } = {}) {
  mkdirSync(sessionDir, { recursive: true });
  try { rmSync(join(sessionDir, "SingletonLock")); } catch {}
  const context = await chromium.launchPersistentContext(sessionDir, {
    headless: !headed,
    viewport: { width: 1400, height: 900 },
    locale: "ko-KR",
  });
  const page = context.pages()[0] || (await context.newPage());
  return { context, page };
}

export async function needsLogin(page) {
  if (page.url().includes("login")) return true;
  return (await page.locator(SEL.login.userId[0]).count().catch(() => 0)) > 0;
}

// OBT 입력은 잠깐 disabled 상태를 거친다 → 활성화될 때까지 기다렸다가 채운다 (앱 스크레이퍼의 fill 타임아웃 원인).
async function fillWhenEnabled(page, candidates, value, { timeout = 8000 } = {}) {
  const loc = await pick(page, candidates, { timeout });
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await loc.isEnabled().catch(() => false)) { await loc.fill(value); return; }
    await page.waitForTimeout(200);
  }
  throw new Error(`입력 활성화 대기 초과: ${candidates}`);
}

export async function login(page) {
  const { company, userId, password } = loadCredentials();
  log.info(`로그인 시도 (${company}/${userId})`);
  const comp = page.locator(SEL.login.company[0]);
  if ((await comp.count()) && !(await comp.isDisabled())) await fillWhenEnabled(page, SEL.login.company, company);
  await fillWhenEnabled(page, SEL.login.userId, userId);
  await (await pick(page, SEL.login.nextBtn)).click();
  await page.waitForSelector(SEL.login.password[0], { state: "visible", timeout: 10000 });
  await fillWhenEnabled(page, SEL.login.password, password);
  await (await pick(page, SEL.login.loginBtn)).click();
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(2500);
  if (await needsLogin(page)) throw new Error("로그인 실패: 로그인 폼이 남아 있음 (자격증명/2차인증 확인)");
  log.info("로그인 성공");
}

/** 홈으로 이동해 세션을 확인하고, 필요하면 로그인한다. 1회 실패 시 프로필을 지우고 재시도. */
export async function ensureLoggedIn(page, { retry = true } = {}) {
  await page.goto(BASE_URL + ROUTES.home, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1500);
  if (!(await needsLogin(page))) return;
  try {
    await login(page);
  } catch (e) {
    if (!retry) throw e;
    log.warn(`${e.message} → 세션 초기화 후 1회 재시도`);
    await page.context().clearCookies();
    await page.goto(BASE_URL + ROUTES.login, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
    await login(page);
  }
}

/** SPA hash 라우트 이동. 내부 탭 상태가 남을 수 있어 networkidle + 짧은 대기. */
export async function goto(page, route) {
  await page.goto(BASE_URL + route, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2000);
  if (await needsLogin(page)) { await login(page); await page.goto(BASE_URL + route, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {}); await page.waitForTimeout(2000); }
}

/** 사람에게 브라우저를 넘기고 창이 닫히거나 Enter가 눌릴 때까지 기다린다. */
export async function handoff(page, message) {
  console.error(`\n[amaranth] 🖐 ${message}\n[amaranth]   끝나면 이 터미널에서 Enter 를 누르거나 브라우저를 닫으세요.`);
  await Promise.race([
    new Promise((r) => process.stdin.once("data", r)),
    page.waitForEvent("close").catch(() => {}),
    page.context().waitForEvent("close").catch(() => {}),
  ]);
}
