import { goto } from "../lib/session.mjs";
import { SEL, ROUTES, FORMS } from "../lib/selectors.mjs";

/** 로케이터 표를 라이브 화면에 대조한다. 자동 수정 없음 — 결과를 사람이 보고 selectors.mjs를 고친다. */
export async function doctor(page) {
  const report = [];
  const check = async (scope, group, name, candidates) => {
    const list = typeof candidates === "function" ? candidates(group === "leave" ? "연차" : FORMS.proposal.name) : candidates;
    let hit = null;
    for (const c of list) { if ((await scope.locator(c).first().count().catch(() => 0)) > 0) { hit = c; break; } }
    report.push({ group, name, ok: !!hit, matched: hit, primary: list[0] });
  };
  await goto(page, ROUTES.attendanceForm);
  await check(page, "leave", "formCard", SEL.leave.formCard);
  await page.locator(SEL.leave.formCard[0]).first().click().catch(() => {});
  await page.waitForTimeout(1500);
  for (const k of ["kindBtn", "dateInputs", "reason", "days", "completeBtn", "cancelBtn"]) await check(page, "leave", k, SEL.leave[k]);
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
  return report;
}
