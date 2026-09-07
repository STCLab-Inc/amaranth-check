// 품의 본문 빌더 — 기결 문서 관례(돋움체 10pt 단락, 빈 줄 = <span><br></span>)를 그대로 재현한다.
const P = (inner) =>
  `<p style="font-family:돋움체;font-size:10pt;color:rgb(0, 0, 0);margin-top:0px;margin-bottom:0px;line-height:1.2;"><span style="font-size:13.3333px;">${inner}</span></p>`;

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** 평문(줄 단위)을 에디터 HTML로. 빈 줄은 빈 단락. */
export function textToHtml(text) {
  return String(text).replace(/\r\n?/g, "\n").split("\n").map((l) => P(l.trim() === "" ? "<br>" : esc(l))).join("");
}

/** 구조화 품의: 제목줄/대상/비용/결제/담당자 → 회사 관례 순서로 단락 생성. */
export function buildProposalBody({ headline, target = [], costs = [], payment = [], contact = [], extra = [] }) {
  const lines = [];
  if (headline) lines.push(headline, "");
  if (target.length) lines.push(...target, "");
  if (costs.length) lines.push("비용 내역", ...costs.map((c) => `- ${c}`), "");
  if (payment.length) lines.push("결제 정보", ...payment.map((c) => `- ${c}`), "");
  if (contact.length) lines.push("담당자", ...contact.map((c) => `- ${c}`), "");
  if (extra.length) lines.push(...extra);
  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  return textToHtml(lines.join("\n"));
}

/** 본문 합계와 첨부 금액이 다르면 반려된 사례가 있어, 숫자 금액을 뽑아 대조에 쓴다. */
export function extractAmounts(text) {
  return [...String(text).matchAll(/([\d,]{4,})\s*원/g)].map((m) => Number(m[1].replace(/,/g, "")));
}
