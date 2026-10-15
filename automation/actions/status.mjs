import { goto } from "../lib/session.mjs";
import { ROUTES } from "../lib/selectors.mjs";

const num = (s) => (s == null ? null : Number(String(s).replace(/,/g, "")));

/** 오늘 출퇴근(HPD0210) — 앱 check.mjs와 같은 표 파싱 */
export async function attendanceToday(page) {
  await goto(page, ROUTES.attendanceStatus.replace("HPD0120/HPD0120", "HPD0210/HPD0210"));
  await page.waitForSelector("table", { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2000);
  return page.evaluate(() => {
    let t = null;
    for (const x of document.querySelectorAll("table")) { const c = x.querySelector("tr td, tr th"); if (c && c.innerText.trim() === "구분") { t = x; break; } }
    if (!t) return null;
    const rows = [...t.querySelectorAll("tr")]; if (rows.length < 3) return null;
    const cells = (r) => [...r.querySelectorAll("td,th")].map((c) => c.innerText.trim());
    const headers = cells(rows[0]), types = cells(rows[1]), times = cells(rows[2]);
    const d = new Date(), key = `${d.getMonth() + 1}월 ${d.getDate()}일`;
    for (let i = 1; i < headers.length; i++) {
      if (!headers[i].includes(key)) continue;
      const l = (times[i] || "").split("\n"); const m = (s) => (s && s.match(/\((\d{2}:\d{2})\)/) || [])[1] || null;
      return { come: m(l[0]), leave: m(l[1]), attendType: types[i] || null };
    }
    return null;
  });
}

/** 연차 현황(HPD0110 헤더) */
export async function annualLeave(page) {
  await goto(page, ROUTES.attendanceForm);
  await page.locator("text=연차휴가신청서").first().click().catch(() => {}); // 카드 선택 시 잔여일수현황(일반/보상) 표시
  await page.waitForTimeout(1500);
  const t = await page.locator("body").innerText();
  const pick = (label) => { const m = t.match(new RegExp(label + "\\s*\\n?\\s*([\\d.]+|-)")); return m ? (m[1] === "-" ? 0 : num(m[1])) : null; };
  return { granted: pick("부여일수"), used: pick("사용일수"), inProgress: pick("결재진행"), remaining: pick("잔여일수"), general: pick("일반연차"), compensatory: pick("보상휴가") };
}

/** 결재 HOME의 상신문서 최근 목록 (제목/기안일/결재자/상태 아이콘 alt) */
export async function recentApprovals(page) {
  await goto(page, ROUTES.eapHome);
  await page.waitForTimeout(2000);
  // 결재 HOME "상신문서" 섹션: [제목, 기안자 직위, 기안일, (상태 아이콘), 결재자, (결재일)] 반복. 상태는 img alt.
  return page.evaluate(() => {
    const sec = [...document.querySelectorAll("*")].find((e) => e.children.length === 0 && e.textContent.trim() === "상신문서");
    let root = sec; for (let i = 0; i < 8 && root && root.querySelectorAll("img[alt]").length < 2; i++) root = root.parentElement;
    if (!root) return [];
    const alts = [...root.querySelectorAll("img[alt]")].map((i) => i.alt);
    const lines = root.innerText.split("\n").map((s) => s.trim()).filter((s) => s && !["상신문서", "더보기"].includes(s));
    const out = []; let cur = null;
    for (const l of lines) {
      if (/\s(직원|임원|팀장|이사)$/.test(l)) { if (cur && !cur.drafter) cur.drafter = l; else if (cur) cur.approver = l; continue; }
      if (/^\d{4}-\d{2}-\d{2}/.test(l)) { if (cur) (cur.drafter && !cur.draftedAt ? (cur.draftedAt = l) : (cur.actedAt = l)); continue; }
      cur = { title: l }; out.push(cur);
    }
    out.forEach((o, i) => { o.status = alts[i] || null; });
    return out.slice(0, 10);
  });
}

// 결재 HOME 왼쪽 메뉴의 문서함별 건수 배지. 배지가 없으면 0건.
export const BOXES = ["미결문서", "기결문서(진행)", "수신참조문서", "수신문서", "시행문서"];

/** 결재 문서함 건수 (결재 HOME LNB 배지). 읽기 전용. */
export async function approvalBoxes(page) {
  await goto(page, ROUTES.eapHome);
  await page.waitForTimeout(1500);
  return page.evaluate((boxes) => {
    const out = {};
    const leaves = [...document.querySelectorAll("*")].filter((e) => e.children.length === 0);
    for (const label of boxes) {
      const el = leaves.find((e) => e.textContent.trim() === label && e.getBoundingClientRect().width > 0);
      if (!el) { out[label] = null; continue; }
      // 라벨과 같은 메뉴 항목(li) 안의 숫자만 있는 요소 = 배지
      // li가 하위 메뉴까지 품으면 다른 문서함 배지를 잘못 읽는다 → 다른 라벨을 포함하지 않는 가장 가까운 조상까지만 올라간다
      let item = el.parentElement;
      for (let p = item; p && p.tagName !== "UL"; p = p.parentElement) {
        if (boxes.some((b) => b !== label && p.textContent.includes(b))) break;
        item = p;
      }
      const badge = [...item.querySelectorAll("*")].find((e) => e.children.length === 0 && e !== el && /^\d+$/.test(e.textContent.trim()));
      out[label] = badge ? Number(badge.textContent.trim()) : 0;
    }
    return out;
  }, BOXES);
}

export async function status(page, { include = ["attendance", "leave", "approvals", "boxes"] } = {}) {
  const r = {};
  if (include.includes("attendance")) r.attendance = await attendanceToday(page);
  if (include.includes("leave")) r.annualLeave = await annualLeave(page);
  if (include.includes("approvals")) r.recentApprovals = await recentApprovals(page);
  if (include.includes("boxes")) r.approvalBoxes = await approvalBoxes(page);
  return r;
}
