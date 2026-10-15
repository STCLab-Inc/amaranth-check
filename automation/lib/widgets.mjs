// OBT(더존 Orbit) 입력 위젯 조작. 전부 "입력 → 화면 값 재확인"까지 한다 — 값이 조용히 되돌아가는 위젯이 있어서다.

// OBTDatePicker는 fill()로 넣은 값을 되돌린다 → 전체 선택 후 숫자만 키 입력(자동 포맷) → 확정 키. 확정 키가 화면마다 다르다(실측):
// 근태신청서는 Tab으로 확정, 지출정보등록 다이얼로그는 Tab이면 되돌리고 Enter로 확정. 순서대로 시도하고 화면 값으로 판정한다.
// 전체 선택은 selectText() — headed에서 click+Meta+A는 가끔 선택이 안 돼 숫자가 기존 값 사이에 끼어든다(`0261-02-1_`).
// 확정 직후 화면이 계산 요청(calculateApplicationDays 등)을 보내고 응답으로 값을 덮을 수 있어, 요청이 잦아든 뒤 판정한다.
export async function setDate(page, loc, ymd) {
  const digits = ymd.replace(/-/g, "");
  for (const [mode, key] of [["type", "Tab"], ["type", "Enter"], ["fill", "Enter"], ["type", "Tab"]]) {
    await loc.selectText();
    if (mode === "type") await loc.pressSequentially(digits, { delay: 30 }); else await loc.fill(ymd);
    await loc.press(key);
    await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(400);
    if ((await loc.inputValue()) === ymd) return;
  }
  throw new Error(`날짜 입력 실패: ${ymd} (현재 ${await loc.inputValue()})`);
}

/**
 * 화면이 뒤늦게 기본값으로 덮어쓰는 경우(휴가구분·증빙 구분을 누른 직후 기본 정보를 다시 받아 날짜를 오늘로 되돌림, headed에서 자주 실측)까지 견디는 날짜 입력.
 * 각 입력 후 요청이 잦아들 때까지 기다렸다가 모든 칸을 다시 확인하고, 되돌아간 칸이 있으면 전부 다시 넣는다.
 * pairs: [[locator, "YYYY-MM-DD"], ...]
 */
export async function setDatesStable(page, pairs, { attempts = 3, onRetry } = {}) {
  for (let i = 1; ; i++) {
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    for (const [loc, ymd] of pairs) await setDate(page, loc, ymd).catch((e) => { if (i >= attempts) throw e; });
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(800);
    const got = await Promise.all(pairs.map(([loc]) => loc.inputValue()));
    if (got.every((v, k) => v === pairs[k][1])) return;
    if (i >= attempts) throw new Error(`날짜가 계속 되돌아감: 원한 값 ${pairs.map((p) => p[1]).join("~")}, 화면 ${got.join("~")}`);
    onRetry?.(got);
  }
}

function parseTime(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ""));
  if (!m) throw new Error(`시간은 HH:MM (24시): ${hhmm}`);
  const h = Number(m[1]), min = Number(m[2]);
  if (h > 23 || min > 59) throw new Error(`시간 범위 밖: ${hhmm}`);
  return [h, min];
}
export const toMinutes = (hhmm) => { const [h, m] = parseTime(hhmm); return h * 60 + m; };

/** "HH:MM"(24시) → OBTTimePicker2 세 칸 값 [오전|오후, hh(12시), mm] */
export function toPickerTime(hhmm) {
  const [h, min] = parseTime(hhmm);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return [h < 12 ? "오전" : "오후", String(h12).padStart(2, "0"), String(min).padStart(2, "0")];
}

/**
 * OBTTimePicker2 = 입력 세 칸(오전/오후·시·분). `inputs`는 그 세 칸의 locator, `offset`은 첫 칸 인덱스.
 * 실측(2026-10): 오전/오후 칸은 ArrowUp=오전·ArrowDown=오후, 시는 12시간제로 키 입력.
 */
export async function setTime(page, inputs, offset, hhmm) {
  const want = toPickerTime(hhmm);
  const [ampm, hh, mm] = [0, 1, 2].map((i) => inputs.nth(offset + i));
  const selectAll = process.platform === "darwin" ? "Meta+A" : "Control+A";
  for (const [loc, v] of [[hh, want[1]], [mm, want[2]]]) {
    await loc.click(); await page.keyboard.press(selectAll);
    await loc.pressSequentially(v, { delay: 40 }); await page.keyboard.press("Tab");
    await page.waitForTimeout(300);
  }
  if ((await ampm.inputValue()) !== want[0]) {
    await ampm.click(); await page.keyboard.press(want[0] === "오전" ? "ArrowUp" : "ArrowDown");
    await page.keyboard.press("Tab"); await page.waitForTimeout(300);
  }
  const got = await Promise.all([ampm, hh, mm].map((l) => l.inputValue()));
  if (got.join(" ") !== want.join(" ")) throw new Error(`시간 입력 실패: ${hhmm} → 화면 ${got.join(" ")}`);
}

/**
 * 코드도움 입력(예: 용도) — 옆 아이콘으로 코드도움 다이얼로그를 열고 검색어로 좁힌 뒤 첫 행을 '확인'.
 * 결과 그리드는 canvas라 DOM으로 행을 못 고른다 → 검색어로 원하는 행이 첫 줄에 오게 하고, 선택된 입력값을 match()로 확인한다.
 * 코드도움 '확인'은 입력칸에 값을 넣을 뿐 서버 저장이 아니다.
 */
export async function pickCode(page, input, query, { dialog, search, confirm, cancel, match }) {
  await input.locator("xpath=following-sibling::button[1]").click();
  const dlg = page.locator(dialog).last();
  const q = dlg.locator(search).first();
  await q.waitFor({ state: "visible", timeout: 8000 });   // 다이얼로그 루트는 크기 0(hidden)으로 잡힌다
  await q.fill(String(query)); await q.press("Enter");
  await page.waitForTimeout(1200);
  await dlg.locator(confirm).last().click();
  await page.waitForTimeout(800);
  if (await page.locator(dialog).count()) {
    await page.locator(dialog).last().locator(cancel).last().click().catch(() => {});
    throw new Error(`코드도움에서 '${query}'를 고르지 못함 (검색 결과 없음?)`);
  }
  const v = await input.inputValue();
  if (!match(v)) throw new Error(`코드도움 선택 불일치: '${query}' → 화면 '${v}' (코드 번호로 지정하세요)`);
  return v;
}

/**
 * OBTTimePicker(구형, 지출정보등록의 사용시간) = input이 아니라 포커스 가능한 span 세 개(오전/오후·시·분).
 * 실측(2026-10): span 클릭 후 숫자 키 입력, 오전/오후는 ArrowUp=오전·ArrowDown=오후.
 */
export async function setSpanTime(page, picker, hhmm, { blurTarget } = {}) {
  const want = toPickerTime(hhmm);
  const spans = picker.locator("span[tabindex='0']");
  for (const [i, v] of [[1, want[1]], [2, want[2]]]) {
    await spans.nth(i).click(); await page.keyboard.type(v, { delay: 50 }); await page.waitForTimeout(200);
  }
  if ((await spans.nth(0).innerText()).trim() !== want[0]) {
    await spans.nth(0).click(); await page.keyboard.press(want[0] === "오전" ? "ArrowUp" : "ArrowDown"); await page.waitForTimeout(200);
  }
  const got = (await spans.allInnerTexts()).map((t) => t.trim());
  if (got.join(" ") !== want.join(" ")) throw new Error(`시간 입력 실패: ${hhmm} → 화면 ${got.join(" ")}`);
  // 입력 중 열린 시각 목록(ul)이 아래 입력칸 클릭을 가로막는다. Tab으로는 안 닫힌다 → 호출자가 빈 영역(blurTarget)을 클릭해 닫는다.
  // Escape는 다이얼로그까지 닫을 수 있어 쓰지 않는다.
  if (blurTarget) { await blurTarget.click(); await page.waitForTimeout(300); }
}
