import { goto } from "../lib/session.mjs";
import { SEL, ROUTES, FORMS, pick } from "../lib/selectors.mjs";
import { log } from "../lib/log.mjs";
import { extractAmounts } from "../lib/body.mjs";

/**
 * 품의(기안서) 초안: 팝업 열기 → 제목·본문·첨부 → '보관'(임시저장). '상신'은 절대 누르지 않는다.
 * 반환: { docId, title, attachments, saved }
 */
export async function draftProposal(page, { title, html, attachments = [], save = true, form = FORMS.proposal.name, screenshot }) {
  if (!title) throw new Error("--title 필요");
  if (!html) throw new Error("본문 필요 (--body-file 또는 --json)");
  await goto(page, ROUTES.eapHome);
  const context = page.context();
  // 추천양식 카드 클릭 → 새 팝업 페이지
  const [popup] = await Promise.all([
    context.waitForEvent("page", { timeout: 15000 }),
    (async () => { await (await pick(page, SEL.proposal.formCard(form))).click(); })(),
  ]);
  await popup.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
  await popup.waitForTimeout(2500);
  log.info(`팝업 열림: ${popup.url()}`);

  await (await pick(popup, SEL.proposal.title)).fill(title);

  // 본문: dzEditor(iframe 안 iframe)의 contenteditable body에 직접 주입 (setEditorHTMLCodeIframe는 이 팝업에서 무동작)
  const outer = popup.frameLocator(SEL.proposal.editorOuter[0]);
  const inner = outer.frameLocator(SEL.proposal.editorInner[0]);
  const body = inner.locator("body");
  await body.waitFor({ timeout: 15000 });
  await body.evaluate((el, h) => { el.innerHTML = h; el.dispatchEvent(new Event("input", { bubbles: true })); }, html);
  const bodyText = await body.innerText();
  if (!bodyText.trim()) throw new Error("본문 주입 실패");

  if (attachments.length) {
    await popup.locator("input[type=file]").first().setInputFiles(attachments);
    await popup.waitForTimeout(2500);
    const cnt = await popup.locator("text=/첨부파일\\s*\\d+\\s*개/").first().innerText().catch(() => "");
    const n = Number((cnt.match(/(\d+)\s*개/) || [])[1] || 0);
    if (n < attachments.length) throw new Error(`첨부 반영 실패 (${n}/${attachments.length}): ${cnt}`);
  }
  const amounts = extractAmounts(bodyText);
  if (screenshot) await popup.screenshot({ path: screenshot, fullPage: true });

  const result = { title, form, attachments: attachments.length, amountsInBody: amounts, saved: false, docId: null, popupUrl: popup.url() };
  if (save) {
    await (await pick(popup, SEL.proposal.saveBtn)).click();
    await popup.waitForURL(/docID=\d+/, { timeout: 20000 });
    result.docId = Number((popup.url().match(/docID=(\d+)/) || [])[1]);
    result.saved = true;
    result.popupUrl = popup.url();
    log.info(`보관(임시저장) 완료 docID=${result.docId}`);
    await popup.waitForTimeout(1500);
  }
  await popup.close().catch(() => {});
  return result;
}
