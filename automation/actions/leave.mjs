import { goto, handoff } from "../lib/session.mjs";
import { SEL, ROUTES, pick } from "../lib/selectors.mjs";
import { log } from "../lib/log.mjs";

export const KINDS = ["연차", "시간연차", "연차(보상)", "시간연차(보상)"];

/** 탭에 이전 입력(2단계)이 남아 있으면 초기화한다. */
async function resetIfDirty(page) {
  if ((await page.locator(SEL.leave.step2Marker[0]).count()) > 0) {
    log.warn("이전 신청 입력이 남아 있어 초기화합니다 (이전단계 → 신청취소)");
    const prev = page.locator(SEL.leave.prevBtn[0]).filter({ hasNot: page.locator("[disabled]") }).last();
    if (await prev.count()) { await prev.click(); await page.waitForTimeout(1500); }
    const cancel = page.locator(SEL.leave.cancelBtn[0]).first();
    if (await cancel.count()) { await cancel.click(); await page.waitForTimeout(1000); }
    const ok = page.locator("button:text-is('확인')").last();
    if (await ok.count()) { await ok.click(); await page.waitForTimeout(1000); }
  }
}

// OBTDatePicker는 fill()로 넣은 값을 되돌린다 → 클릭·전체선택 후 숫자만 키 입력(자동 포맷) → Tab. 검증 실패 시 fill+Enter로 재시도.
async function setDate(page, loc, ymd) {
  const digits = ymd.replace(/-/g, "");
  for (const attempt of ["type", "fill"]) {
    await loc.click();
    await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
    if (attempt === "type") await loc.pressSequentially(digits, { delay: 30 }); else await loc.fill(ymd);
    await loc.press(attempt === "type" ? "Tab" : "Enter");
    await page.waitForTimeout(400);
    if ((await loc.inputValue()) === ymd) return;
  }
  throw new Error(`날짜 입력 실패: ${ymd} (현재 ${await loc.inputValue()})`);
}

/**
 * 휴가 신청 1단계 입력. complete=true면 '신청완료'로 2단계까지 진행(제출 아님).
 * '결재상신'은 절대 누르지 않는다 — headed 모드에서 사람에게 넘긴다.
 */
export async function applyLeave(page, { kind = "연차", from, to = from, reason = "", complete = false, screenshot, handoffMode = false }) {
  if (!KINDS.includes(kind)) throw new Error(`휴가구분은 ${KINDS.join(" | ")} 중 하나`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) throw new Error("날짜는 YYYY-MM-DD");
  await goto(page, ROUTES.attendanceForm);
  await resetIfDirty(page);
  await (await pick(page, SEL.leave.formCard)).click();
  await page.waitForTimeout(1500);
  // 휴가구분을 먼저 클릭해야 날짜 입력이 유지된다 (실측)
  await (await pick(page, SEL.leave.kindBtn(kind))).click();
  await page.waitForTimeout(800);
  const dates = page.locator(SEL.leave.dateInputs[0]);
  if ((await dates.count()) < 2) throw new Error("휴가기간 입력을 찾지 못함");
  await setDate(page, dates.nth(0), from);
  await setDate(page, dates.nth(1), to);
  await page.waitForTimeout(800);
  await (await pick(page, SEL.leave.reason)).fill(reason);
  const days = await (await pick(page, SEL.leave.days)).inputValue().catch(() => null);
  const toast = await page.locator(SEL.leave.toast[0]).innerText().catch(() => "");
  if (toast && /선택하여 주십시오|없습니다/.test(toast)) throw new Error(`화면 경고: ${toast}`);
  if (screenshot) await page.screenshot({ path: screenshot, fullPage: true });
  const result = { kind, from: await dates.nth(0).inputValue(), to: await dates.nth(1).inputValue(), reason, days, step: 1, submitted: false };
  if (complete) {
    await (await pick(page, SEL.leave.completeBtn)).click();
    await page.waitForSelector(SEL.leave.step2Marker[0], { timeout: 10000 });
    await page.waitForTimeout(800);
    result.step = 2;
    result.title = await page.locator("xpath=//*[normalize-space(text())='제목']/following::input[1]").inputValue().catch(() => null);
    result.approvalLine = await page.locator("xpath=//*[normalize-space(text())='결재라인']/following::*[1]").innerText().catch(() => null);
    if (screenshot) await page.screenshot({ path: screenshot.replace(/(\.\w+)$/, "-step2$1"), fullPage: true });
  }
  if (handoffMode) await handoff(page, result.step === 2 ? "내용을 확인하고 '결재상신'을 직접 누르세요." : "내용을 확인하고 '신청완료' → '결재상신'을 직접 누르세요.");
  return result;
}
