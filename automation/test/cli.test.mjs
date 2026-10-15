import { test } from "node:test";
import assert from "node:assert/strict";
import { parseArgs } from "../cli.mjs";

test("parseArgs: 플래그·값·반복 --attach", () => {
  const a = parseArgs(["proposal", "--title", "T", "--attach", "a.pdf", "--attach", "b.pdf", "--no-save", "--json"]);
  assert.equal(a._[0], "proposal");
  assert.equal(a.title, "T");
  assert.deepEqual(a.attach, ["a.pdf", "b.pdf"]);
  assert.equal(a["no-save"], true);
  assert.equal(a.json, true);
});

test("parseArgs: expense 인자 (값에 공백·쉼표)", () => {
  const a = parseArgs(["expense", "--date", "2026-10-14", "--amount", "12,000", "--usage", "식대 - 기타", "--attach", "r.png", "--dry-run"]);
  assert.equal(a._[0], "expense");
  assert.equal(a.amount, "12,000");
  assert.equal(a.usage, "식대 - 기타");
  assert.deepEqual(a.attach, ["r.png"]);
  assert.equal(a["dry-run"], true);
});
