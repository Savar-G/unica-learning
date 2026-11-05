import { describe, expect, it } from "vitest";
import { nextBook } from "@/lib/next-book";

// The next book's date range (spec #544, "Next book range"; D-213, D-246), through its one function. Dates are calendar
// days in family time.

describe("the next book's range", () => {
  it("before the first book ships: a status, with no date", () => {
    expect(nextBook({ shippedOn: null, deliveredOn: null, today: "2026-11-05", ended: false })).toEqual({ kind: "first_book_coming" });
  });
  it("with a confirmed delivery: 14 days after shipping, to 28 days after delivery", () => {
    expect(nextBook({ shippedOn: "2026-11-02", deliveredOn: "2026-11-06", today: "2026-11-07", ended: false })).toEqual({ kind: "range", earliest: "2026-11-16", latest: "2026-12-04" });
  });
  it("with no confirmed delivery: 14 to 35 days after shipping", () => {
    expect(nextBook({ shippedOn: "2026-11-02", deliveredOn: null, today: "2026-11-03", ended: false })).toEqual({ kind: "range", earliest: "2026-11-16", latest: "2026-12-07" });
  });
  it("counts calendar days across a month, a year and a clock change", () => {
    expect(nextBook({ shippedOn: "2026-12-20", deliveredOn: "2026-12-24", today: "2026-12-24", ended: false })).toEqual({ kind: "range", earliest: "2027-01-03", latest: "2027-01-21" });
    expect(nextBook({ shippedOn: "2026-10-25", deliveredOn: null, today: "2026-10-26", ended: false })).toEqual({ kind: "range", earliest: "2026-11-08", latest: "2026-11-29" });
  });
  it("a delivery on the shipping day still gives a range, never one date", () => {
    const r = nextBook({ shippedOn: "2026-11-02", deliveredOn: "2026-11-02", today: "2026-11-02", ended: false });
    expect(r).toEqual({ kind: "range", earliest: "2026-11-16", latest: "2026-11-30" });
  });
  it("keeps the range while today is inside it, and on its last day", () => {
    const input = { shippedOn: "2026-11-02", deliveredOn: "2026-11-06", ended: false };
    expect(nextBook({ ...input, today: "2026-11-20" }).kind).toBe("range");
    expect(nextBook({ ...input, today: "2026-12-04" }).kind).toBe("range");
  });
  it("after the range has passed: a status, with no date", () => {
    expect(nextBook({ shippedOn: "2026-11-02", deliveredOn: "2026-11-06", today: "2026-12-05", ended: false })).toEqual({ kind: "past_estimate" });
    expect(nextBook({ shippedOn: "2026-11-02", deliveredOn: null, today: "2026-12-08", ended: false })).toEqual({ kind: "past_estimate" });
  });
  it("after the plan ended: no next book", () => {
    expect(nextBook({ shippedOn: "2026-11-02", deliveredOn: "2026-11-06", today: "2026-11-07", ended: true })).toEqual({ kind: "none" });
    expect(nextBook({ shippedOn: null, deliveredOn: null, today: "2026-11-07", ended: true })).toEqual({ kind: "none" });
  });
  it("refuses a day that is not a calendar date", () => {
    expect(() => nextBook({ shippedOn: "2026-11-31", deliveredOn: null, today: "2026-11-05", ended: false })).toThrow();
    expect(() => nextBook({ shippedOn: "2026-11-02", deliveredOn: "Nov 6", today: "2026-11-05", ended: false })).toThrow();
    expect(() => nextBook({ shippedOn: "2026-11-02", deliveredOn: null, today: "", ended: false })).toThrow();
  });
});
