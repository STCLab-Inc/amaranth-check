import { goto, dismissNotices, handoff } from "../lib/session.mjs";
import { SEL, ROUTES, FORMS, pick } from "../lib/selectors.mjs";
import { setDatesStable, setSpanTime, pickCode } from "../lib/widgets.mjs";
import { log } from "../lib/log.mjs";

const S = SEL.expense;
export const EVIDENCE = ["법인신용카드", "개인신용카드", "개인체크카드", "개인현금영수증", "개인현금", "증빙없음"];

/** 결재 HOME → 업무경비청구서 → STEP2(지출정보등록). 팝업이 아니라 같은 탭에서 이동한다. */
async function openStep2(page) {
  await goto(page, ROUTES.eapHome);
  await (await pick(page, S.formCard)).click();
  await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2500);
  await dismissNotices(page);
  // 탭이 이미 STEP2에 머물러 있으면(같은 세션에서 재진입) '지출정보등록' 버튼이 없다
  if (!(await page.locator(S.newBtn[0]).count())) {
    await (await pick(page, S.step2Btn, { timeout: 15000 })).click();
    await page.waitForTimeout(2500);
    await dismissNotices(page);
  }
  return (await pick(page, S.claimMonth)).inputValue().catch(() => null);
}

async function openNewDialog(page) {
  await (await pick(page, S.newBtn)).click();
  const dlg = page.locator(S.dialog[0]).last();
  // 다이얼로그 루트는 크기 0(hidden)으로 잡힌다 → 안쪽 입력이 보일 때까지 기다린다
  await dlg.locator(S.place[0]).waitFor({ state: "visible", timeout: 10000 });
  await page.waitForTimeout(800);
  return dlg;
}

/** 용도 코드 목록(코드도움이 내려받는 목록 응답). 읽기 전용 — 다이얼로그는 열었다가 취소한다. */
export async function listUsage(page) {
  await openStep2(page);
  const dlg = await openNewDialog(page);
  const resp = page.waitForResponse((r) => r.url().includes("ApTypeCode"), { timeout: 10000 });
  await dlg.locator(S.usage[0]).locator("xpath=following-sibling::button[1]").click();
  const body = await (await resp).json();
  const rows = typeof body.resultData === "string" ? JSON.parse(body.resultData) : body.resultData;
  await page.locator(S.codeHelp.dialog).last().locator(S.codeHelp.cancel).last().click().catch(() => {});
  await dlg.locator(S.cancelBtn[0]).last().click().catch(() => {});
  return (rows || []).map((r) => ({ code: String(r.code), name: r.name }));
}

/**
 * 지출정보등록 다이얼로그 입력. 다이얼로그 '확인'(행 추가)·STEP2 '저장'·상신은 누르지 않는다 — 사람이 확인 후 누른다.
 * dryRun=true면 입력·검증·스크린샷 후 다이얼로그를 '취소'해 아무것도 남기지 않는다.
 */
export async function fillExpense(page, {
  date, time, place, amount, usage, evidence = "개인신용카드", memo = "", attendees, bizNo, approvalNo,
  attachments = [], dryRun = false, screenshot, handoffMode = false,
}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) throw new Error("사용일은 YYYY-MM-DD");
  if (!place) throw new Error("사용처 필요");
  const amt = Number(String(amount ?? "").replace(/[,원\s]/g, ""));
  if (!Number.isInteger(amt) || amt <= 0) throw new Error(`청구금액은 양의 정수(원): ${amount}`);
  if (!usage) throw new Error("용도 필요 (코드 번호 또는 이름 — 'amaranth expense --list-usage')");
  if (!EVIDENCE.includes(evidence)) throw new Error(`증빙 구분은 ${EVIDENCE.join(" | ")} 중 하나`);

  const claimMonth = await openStep2(page);
  const dlg = await openNewDialog(page);

  // 증빙 구분을 먼저 고른다 — 바꾸면 아래 입력 항목이 달라질 수 있다
  await (await pick(dlg, S.evidence(evidence))).click();
  await page.waitForTimeout(600);

  if (time) await setSpanTime(page, await pick(dlg, S.useTime), time, { blurTarget: await pick(dlg, S.title) });
  // 증빙 구분을 바꾸면 다이얼로그가 기본값을 다시 받아 사용일을 오늘로 되돌릴 수 있다 → setDatesStable
  await setDatesStable(page, [[await pick(dlg, S.useDate), date]], { onRetry: (got) => log.warn(`사용일이 되돌아감(${got[0]}) → 다시 입력`) });
  await (await pick(dlg, S.place)).fill(place);

  const amountInput = await pick(dlg, S.amount);
  await amountInput.click(); await amountInput.fill(String(amt)); await amountInput.press("Tab");
  await page.waitForTimeout(300);
  const shownAmount = Number((await amountInput.inputValue()).replace(/[^\d]/g, ""));
  if (shownAmount !== amt) throw new Error(`청구금액 입력 실패: ${amt} → 화면 ${shownAmount}`);

  const code = /^\d+$/.test(String(usage)) ? String(usage) : null;
  const usageValue = await pickCode(page, await pick(dlg, S.usage), usage, {
    ...S.codeHelp,
    match: (v) => (code ? v.startsWith(`${code}.`) : v.replace(/^\d+\.\s*/, "") === usage),
  });

  if (memo) await (await pick(dlg, S.memo)).fill(memo);
  // 증빙 구분마다 칸 구성이 다르다(예: 개인현금에는 카드·사업자등록번호·승인번호 칸이 없음)
  const optional = async (sel, label) => {
    try { return await pick(dlg, sel, { timeout: 2000 }); } catch { throw new Error(`'${evidence}' 화면에는 ${label} 칸이 없음`); }
  };
  if (attendees) await (await optional(S.attendees, "참석자(식대 계열 용도에서만 나타남)")).fill(attendees);
  if (bizNo) {
    const loc = await optional(S.bizNo, "사업자등록번호");
    await loc.click(); await loc.pressSequentially(String(bizNo).replace(/\D/g, ""), { delay: 30 });
  }
  if (approvalNo) await (await optional(S.approvalNo, "승인번호")).fill(String(approvalNo));

  const attachedCount = async () => {
    const t = await dlg.locator(S.attachCount[0]).first().innerText().catch(() => "");
    return Number((/(\d+)\s*개/.exec(t.replace(/\s+/g, " ")) || [])[1] ?? NaN);
  };
  if (attachments.length) {
    const before = await attachedCount();
    await (await pick(dlg, S.fileInput)).setInputFiles(attachments);
    await page.waitForTimeout(2500);
    const after = await attachedCount();
    if (!(after >= (before || 0) + attachments.length)) throw new Error(`첨부 실패: ${attachments.length}개 올렸는데 화면 ${before}→${after}개`);
  }

  const finalDate = await (await pick(dlg, S.useDate)).inputValue();
  if (finalDate !== date) throw new Error(`사용일이 입력 도중 되돌아감: 원한 값 ${date}, 화면 ${finalDate}`);

  const result = {
    form: FORMS.expense.name, claimMonth, evidence, date, time: time || null, place, amount: shownAmount,
    usage: usageValue, memo, attendees: attendees || null, attachments: await attachedCount(), saved: false,
  };
  if (screenshot) await page.screenshot({ path: screenshot, fullPage: true });

  if (dryRun) {
    await dlg.locator(S.cancelBtn[0]).last().click();
    await page.waitForTimeout(800);
    result.cancelled = true;
    log.info("dry-run: 입력 확인 후 다이얼로그를 취소했습니다 (저장 없음)");
  } else if (handoffMode) {
    await handoff(page, "지출정보등록 내용을 확인하고 '확인' → '저장'을 직접 누르세요. 상신은 STEP3에서.");
  }
  return result;
}
