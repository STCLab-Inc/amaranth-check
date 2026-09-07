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
