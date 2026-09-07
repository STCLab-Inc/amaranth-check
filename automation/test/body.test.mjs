import { test } from "node:test";
import assert from "node:assert/strict";
import { textToHtml, buildProposalBody, extractAmounts } from "../lib/body.mjs";

test("textToHtml: 줄→단락, 빈 줄→<br>, HTML 이스케이프", () => {
  const html = textToHtml("a<b\n\nc");
  assert.equal((html.match(/<p /g) || []).length, 3);
  assert.ok(html.includes("a&lt;b"));
  assert.ok(html.includes("<span style=\"font-size:13.3333px;\"><br></span>"));
});

test("buildProposalBody: 회사 관례 순서(제목줄→대상→비용 내역→결제 정보→담당자)", () => {
  const html = buildProposalBody({ headline: "H", target: ["T1"], costs: ["c: 1,000원"], payment: ["p"], contact: ["k"] });
  const order = ["H", "T1", "비용 내역", "- c: 1,000원", "결제 정보", "- p", "담당자", "- k"].map((s) => html.indexOf(s));
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  assert.ok(order.every((i) => i >= 0));
  assert.ok(!html.endsWith("<br></span></p>"), "끝의 빈 단락 제거");
});

test("extractAmounts: 원 단위 금액 추출", () => {
  assert.deepEqual(extractAmounts("- 현장심사비: 3,000,000원\n- 합계: 3,300,000원 (VAT 포함)"), [3000000, 3300000]);
});
