import { goto, dismissNotices } from "../lib/session.mjs";
import { SEL, ROUTES, FORMS } from "../lib/selectors.mjs";

/** 로케이터 표를 라이브 화면에 대조한다. 자동 수정 없음 — 결과를 사람이 보고 selectors.mjs를 고친다. */
export async function doctor(page) {
  const report = [];
  const check = async (scope, group, name, candidates) => {
    const list = typeof candidates === "function" ? candidates(group === "leave" ? "연차" : FORMS.proposal.name) : candidates;
    // 화면이 늦게 그려지는 칸이 있어 한 번만 세면 거짓 실패가 난다 → 최대 5초 동안 다시 본다
    let hit = null;
    for (const deadline = Date.now() + 5000; !hit && Date.now() < deadline; ) {
      for (const c of list) { if ((await scope.locator(c).first().count().catch(() => 0)) > 0) { hit = c; break; } }
      if (!hit) await new Promise((r) => setTimeout(r, 300));
    }
    report.push({ group, name, ok: !!hit, matched: hit, primary: list[0] });
  };
  await goto(page, ROUTES.attendanceForm);
  await check(page, "leave", "formCard", SEL.leave.formCard);
  await page.locator(SEL.leave.formCard[0]).first().click().catch(() => {});
  await page.waitForTimeout(1500);
  for (const k of ["kindBtn", "dateInputs", "reason", "days", "completeBtn", "cancelBtn"]) await check(page, "leave", k, SEL.leave[k]);
  // 시간연차를 고르면 시작/종료 시각 칸이 생긴다 (입력만 바뀌고 저장되지 않음)
  await page.locator(SEL.leave.kindBtn("시간연차")[0]).first().click().catch(() => {});
  await page.waitForTimeout(1000);
  for (const k of ["timeInputs", "duration"]) await check(page, "leave", k, SEL.leave[k]);
  await goto(page, ROUTES.eapHome);
  await check(page, "proposal", "formCard", SEL.proposal.formCard);
  const [popup] = await Promise.all([
    page.context().waitForEvent("page", { timeout: 15000 }).catch(() => [null]),
    page.locator(`text=${FORMS.proposal.name}`).first().click().catch(() => {}),
  ]);
  if (popup) {
    await popup.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
    await popup.waitForTimeout(2500);
    for (const k of ["title", "editorOuter", "fileInput", "saveBtn", "submitBtn"]) await check(popup, "proposal", k, SEL.proposal[k]);
    const inner = popup.frameLocator(SEL.proposal.editorOuter[0]).locator(SEL.proposal.editorInner[0]);
    report.push({ group: "proposal", name: "editorInner", ok: (await inner.count().catch(() => 0)) > 0, primary: SEL.proposal.editorInner[0] });
    await popup.close().catch(() => {});
  } else {
    report.push({ group: "proposal", name: "popup", ok: false, primary: "window.open" });
  }
  // 지출결의: STEP2 → '신규' 다이얼로그를 열어 칸을 점검하고 '취소'로 닫는다 (확인·저장 안 함)
  await goto(page, ROUTES.eapHome);
  await check(page, "expense", "formCard", SEL.expense.formCard);
  await page.locator(SEL.expense.formCard[0]).first().click().catch(() => {});
  await page.waitForTimeout(3000);
  await dismissNotices(page);
  if (!(await page.locator(SEL.expense.newBtn[0]).count())) {
    await check(page, "expense", "step2Btn", SEL.expense.step2Btn);
    await page.locator(SEL.expense.step2Btn[0]).first().click().catch(() => {});
    await page.waitForTimeout(2500);
  }
  for (const k of ["newBtn", "claimMonth", "saveBtn"]) await check(page, "expense", k, SEL.expense[k]);
  await page.locator(SEL.expense.newBtn[0]).first().click().catch(() => {});
  const dlg = page.locator(SEL.expense.dialog[0]).last();
  await dlg.locator(SEL.expense.place[0]).waitFor({ state: "visible", timeout: 10000 }).catch(() => {});
  for (const k of ["title", "useTime", "useDate", "place", "amount", "usage", "memo", "fileInput", "attachCount", "confirmBtn", "cancelBtn"]) {
    await check(dlg, "expense", k, SEL.expense[k]);
  }
  await check(dlg, "expense", "evidence", SEL.expense.evidence("개인신용카드"));
  await dlg.locator(SEL.expense.cancelBtn[0]).last().click().catch(() => {});
  return report;
}
