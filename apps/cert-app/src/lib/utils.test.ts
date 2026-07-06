import { test } from "node:test";
import * as assert from "node:assert";
import { getColumnName } from "./utils.js";

test("getColumnName - converts 0 to A", () => {
  assert.strictEqual(getColumnName(0), "A");
});

test("getColumnName - converts 2 to C", () => {
  assert.strictEqual(getColumnName(2), "C");
});

test("getColumnName - converts 25 to Z", () => {
  assert.strictEqual(getColumnName(25), "Z");
});

test("getColumnName - converts 26 to AA", () => {
  assert.strictEqual(getColumnName(26), "AA");
});

test("getColumnName - converts 27 to AB", () => {
  assert.strictEqual(getColumnName(27), "AB");
});

test("getColumnName - converts 701 to ZZ", () => {
  assert.strictEqual(getColumnName(701), "ZZ");
});
