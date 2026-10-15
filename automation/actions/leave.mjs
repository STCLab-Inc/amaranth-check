import { goto, handoff } from "../lib/session.mjs";
import { SEL, ROUTES, pick } from "../lib/selectors.mjs";
import { log } from "../lib/log.mjs";
import { setDatesStable, setTime, toMinutes } from "../lib/widgets.mjs";

export const KINDS = ["연차", "시간연차", "연차(보상)", "시간연차(보상)"];
export const isHourly = (kind) => kind.startsWith("시간연차");

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

/**
 * 휴가 신청 1단계 입력. complete=true면 '신청완료'로 2단계까지 진행(제출 아님).
 * '결재상신'은 절대 누르지 않는다 — headed 모드에서 사람에게 넘긴다.
 */
export async function applyLeave(page, { kind = "연차", from, to = from, start, end, reason = "", complete = false, screenshot, handoffMode = false }) {
  if (!KINDS.includes(kind)) throw new Error(`휴가구분은 ${KINDS.join(" | ")} 중 하나`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) throw new Error("날짜는 YYYY-MM-DD");
  // 시간연차는 시작·종료 시각이 필수. 기본값(09:00~18:00)으로 올라가거나 종료 00:00으로 반려된 사례가 있어 생략을 허용하지 않는다.
  if (isHourly(kind) && (!start || !end)) throw new Error(`${kind}는 --start HH:MM --end HH:MM 필요`);
  if (isHourly(kind) && from !== to) throw new Error(`${kind}는 하루 단위 (from = to)`);
  if (isHourly(kind) && toMinutes(start) >= toMinutes(end)) throw new Error(`종료 시각이 시작보다 늦어야 함: ${start}~${end}`);
  // 화면 규칙(2026-10 실측 토스트): "시간연차는 1시간 단위로 신청가능합니다." — 시작 분은 자유(09:14~10:14 승인 사례), 길이만 정시간
  if (isHourly(kind) && (toMinutes(end) - toMinutes(start)) % 60 !== 0) throw new Error(`시간연차는 1시간 단위로만 신청 가능: ${start}~${end}`);
  await goto(page, ROUTES.attendanceForm);
  await resetIfDirty(page);
  await (await pick(page, SEL.leave.formCard)).click();
  await page.waitForTimeout(1500);
  // 휴가구분을 먼저 클릭해야 날짜 입력이 유지된다 (실측)
  await (await pick(page, SEL.leave.kindBtn(kind))).click();
  // 휴가구분을 누르면 화면이 기본 정보를 다시 받아 기간을 오늘로 되돌린다(응답이 늦으면 입력한 날짜를 덮음) → setDatesStable
  await page.waitForTimeout(800);
  const dates = page.locator(SEL.leave.dateInputs[0]);
  if ((await dates.count()) < 2) throw new Error("휴가기간 입력을 찾지 못함");
  await setDatesStable(page, [[dates.nth(0), from], [dates.nth(1), to]], { onRetry: (got) => log.warn(`휴가기간이 되돌아감(${got.join("~")}) → 다시 입력`) });
  let duration = null;
  if (isHourly(kind)) {
    const times = page.locator(SEL.leave.timeInputs[0]);
    if ((await times.count()) < 6) throw new Error("시작/종료시간 입력을 찾지 못함");
    await setTime(page, times, 0, start);
    await setTime(page, times, 3, end);
    await page.waitForTimeout(800);
    duration = await (await pick(page, SEL.leave.duration)).inputValue().catch(() => null);
  }
  await (await pick(page, SEL.leave.reason)).fill(reason);
  const days = await (await pick(page, SEL.leave.days)).inputValue().catch(() => null);
  const toast = await page.locator(SEL.leave.toast[0]).innerText().catch(() => "");
  if (toast && /선택하여 주십시오|없습니다/.test(toast)) throw new Error(`화면 경고: ${toast}`);
  if (screenshot) await page.screenshot({ path: screenshot, fullPage: true });
  const result = { kind, from: await dates.nth(0).inputValue(), to: await dates.nth(1).inputValue(), reason, days, step: 1, submitted: false };
  if (isHourly(kind)) Object.assign(result, { start, end, duration });
  if (complete) {
    // 검증 경고는 잠깐 떴다 사라지는 토스트라 나중에 찾으면 없다 → 클릭 전에 새로 붙는 노드의 문구를 모아 둔다
    await page.evaluate(() => {
      window.__amrAdded = [];
      window.__amrObs?.disconnect();
      window.__amrObs = new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) { const t = (n.innerText || n.textContent || "").trim(); if (t && t.length < 200) window.__amrAdded.push(t); } });
      window.__amrObs.observe(document.body, { childList: true, subtree: true });
    });
    await (await pick(page, SEL.leave.completeBtn)).click();
    const moved = await page.waitForSelector(SEL.leave.step2Marker[0], { timeout: 10000 }).then(() => true, () => false);
    await page.evaluate(() => window.__amrObs?.disconnect()).catch(() => {});
    if (!moved) {
      // 화면이 검증 경고를 띄우고 1단계에 머문 경우 — 그 문구를 그대로 돌려준다 (버튼 라벨·숫자 등 잡음 제외)
      const msg = await page.evaluate(() => [...new Set(window.__amrAdded || [])].filter((t) => /니다|하세요|십시오|없습니다|불가|초과|입력/.test(t)).join(" / ")).catch(() => "");
      if (screenshot) await page.screenshot({ path: screenshot.replace(/(\.\w+)$/, "-blocked$1"), fullPage: true });
      throw new Error(`'신청완료' 후 2단계로 넘어가지 않음${msg ? ` — 화면 메시지: ${msg}` : " (화면 메시지 못 읽음, -blocked 스크린샷 확인)"}`);
    }
    await page.waitForTimeout(800);
    result.step = 2;
    result.title = await page.locator("xpath=//*[normalize-space(text())='제목']/following::input[1]").inputValue().catch(() => null);
    result.approvalLine = await page.locator("xpath=//*[normalize-space(text())='결재라인']/following::*[1]").innerText().catch(() => null);
    if (screenshot) await page.screenshot({ path: screenshot.replace(/(\.\w+)$/, "-step2$1"), fullPage: true });
  }
  if (handoffMode) await handoff(page, result.step === 2 ? "내용을 확인하고 '결재상신'을 직접 누르세요." : "내용을 확인하고 '신청완료' → '결재상신'을 직접 누르세요.");
  return result;
}
