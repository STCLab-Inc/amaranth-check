import { test } from "node:test";
import assert from "node:assert/strict";
import { toPickerTime, toMinutes } from "../lib/widgets.mjs";

test("toPickerTime: 24시 → 오전/오후·12시간제", () => {
  assert.deepEqual(toPickerTime("09:30"), ["오전", "09", "30"]);
  assert.deepEqual(toPickerTime("9:05"), ["오전", "09", "05"]);
  assert.deepEqual(toPickerTime("12:00"), ["오후", "12", "00"]);
  assert.deepEqual(toPickerTime("14:00"), ["오후", "02", "00"]);
  assert.deepEqual(toPickerTime("00:10"), ["오전", "12", "10"]);
  assert.deepEqual(toPickerTime("23:59"), ["오후", "11", "59"]);
});

test("toPickerTime: 잘못된 입력은 거부", () => {
  for (const bad of ["24:00", "12:60", "1230", "", undefined, "오후 2시"]) assert.throws(() => toPickerTime(bad));
});

test("toMinutes: 시작·종료 비교용", () => {
  assert.equal(toMinutes("9:30"), 570);
  assert.ok(toMinutes("9:30") < toMinutes("10:00"));   // 문자열 비교면 "9:30" > "10:00"으로 틀린다
});
