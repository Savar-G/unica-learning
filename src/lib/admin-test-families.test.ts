import { describe, expect, it } from "vitest";
import { ADMIN_TESTS_COOKIE, keepRows, notIn, testFamilies, testsCookie, testsShown } from "@/lib/admin-test-families";

// The one "Show test families" switch (D-313): off by default; off leaves test families out of lists, on lists them.

const TEST = "11111111-1111-4111-8111-111111111111";
const TEAM = "22222222-2222-4222-8222-222222222222";
const REAL = "33333333-3333-4333-8333-333333333333";

describe("the switch", () => {
  it("is off unless the cookie is 1 or the address asks with ?tests=1", () => {
    expect(testsShown(undefined)).toBe(false);
    expect(testsShown("")).toBe(false);
    expect(testsShown("0")).toBe(false);
    expect(testsShown("true")).toBe(false);
    expect(testsShown("1")).toBe(true);
    expect(testsShown(undefined, { tests: "1" })).toBe(true);
    expect(testsShown(undefined, { tests: "yes" })).toBe(false);
    expect(testsShown(undefined, { tests: ["1"] })).toBe(false);
  });

  it("writes a cookie for the admin pages only, and removes it when turned off", () => {
    expect(testsCookie(true, true)).toBe(`${ADMIN_TESTS_COOKIE}=1; Path=/admin; SameSite=Lax; Max-Age=31536000; Secure`);
    expect(testsCookie(false, false)).toBe(`${ADMIN_TESTS_COOKIE}=; Path=/admin; SameSite=Lax; Max-Age=0`);
  });
});

describe("the test family filter", () => {
  const rows = [{ id: "a", parent: REAL }, { id: "b", parent: TEST }, { id: "c", parent: TEAM }, { id: "d", parent: null }];

  it("off: leaves every test and team family out of a list", () => {
    const view = testFamilies([TEST, TEAM], false);
    expect(keepRows(rows, view, (r) => r.parent).map((r) => r.id)).toEqual(["a", "d"]);
    expect(view.hidden).toEqual([TEST, TEAM].sort());
    expect(view.isTest(TEST)).toBe(true);
    expect(view.isTest(REAL)).toBe(false);
    expect(view.isTest(null)).toBe(false);
  });

  it("on: lists them, still knows which they are, and leaves nothing out of a database read", () => {
    const view = testFamilies([TEST, TEAM], true);
    expect(keepRows(rows, view, (r) => r.parent).map((r) => r.id)).toEqual(["a", "b", "c", "d"]);
    expect(view.hidden).toEqual([]);
    expect(rows.filter((r) => view.isTest(r.parent)).map((r) => r.id)).toEqual(["b", "c"]);
  });

  it("puts only well formed ids into a database filter", () => {
    expect(notIn([])).toBeNull();
    expect(notIn([TEST, "x),parent_id.eq.(y"])).toBe(`(${TEST})`);
    expect(testFamilies([TEST, "not-an-id"], false).hidden).toEqual([TEST]);
  });
});
