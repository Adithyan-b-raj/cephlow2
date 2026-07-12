import { test, expect } from "vitest";
import { getColumnName, cn } from "./utils.js";

test("cn - merges class names", () => {
  expect(cn("a", "b")).toBe("a b");
  expect(cn("a", false && "b")).toBe("a");
});

test("getColumnName - converts 0 to A", () => {
  expect(getColumnName(0)).toBe("A");
});

test("getColumnName - converts 2 to C", () => {
  expect(getColumnName(2)).toBe("C");
});

test("getColumnName - converts 25 to Z", () => {
  expect(getColumnName(25)).toBe("Z");
});

test("getColumnName - converts 26 to AA", () => {
  expect(getColumnName(26)).toBe("AA");
});

test("getColumnName - converts 27 to AB", () => {
  expect(getColumnName(27)).toBe("AB");
});

test("getColumnName - converts 701 to ZZ", () => {
  expect(getColumnName(701)).toBe("ZZ");
});
