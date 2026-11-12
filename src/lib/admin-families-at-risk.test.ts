import { describe, expect, it } from "vitest";
import { readRiskRows, riskFamilies, riskSummary, type RiskRow } from "@/lib/admin-families-at-risk";

const NOW = new Date("2026-11-12T18:00:00Z");
const ago = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();
const row = (o: Partial<RiskRow> = {}): RiskRow => ({
  parentId: "p1", parentName: "Ana Lee", childId: "c1", childName: "Mia", planKind: "free_month", endingFree: false,
  nextChargeAt: ago(-20), endsAt: null, planSince: ago(60), lastActivityAt: ago(1), lastActivityKind: "scan",
  lastSignInAt: ago(1), heldBook: null, testFamily: false, ...o,
});
const one = (o: Partial<RiskRow>) => riskFamilies([row(o)], NOW)[0];

describe("Families at risk: the reasons", () => {
  it("calls a family with a recent scan fine", () => {
    expect(one({})).toMatchObject({ tone: "ok", reasons: [], next: null });
  });

  it("warns at 7 days quiet and calls 14 days at risk, counted from the last scan, chat or mark", () => {
    expect(one({ lastActivityAt: ago(6) }).tone).toBe("ok");
    expect(one({ lastActivityAt: ago(8) })).toMatchObject({ tone: "warn", quietDays: 8 });
    expect(one({ lastActivityAt: ago(15) })).toMatchObject({ tone: "bad", quietDays: 15 });
  });

  it("counts a family with no activity from the plan start, and gives a new plan a few days", () => {
    expect(one({ lastActivityAt: null, lastActivityKind: null, planSince: ago(9) })).toMatchObject({ tone: "warn", quietDays: 9 });
    expect(one({ lastActivityAt: null, lastActivityKind: null, planSince: ago(2) })).toMatchObject({ tone: "ok", quietDays: null });
  });

  it("calls a failed payment at risk and sends the team to the family page", () => {
    const f = one({ planKind: "payment_failed", nextChargeAt: null });
    expect(f.tone).toBe("bad");
    expect(f.next).toMatchObject({ href: "/admin/parents/p1" });
    expect(f.reasons.map((r) => r.key)).toEqual(["payment_failed"]);
  });

  it("calls a cancel in the free month at risk, and a paid cancel a watch", () => {
    expect(one({ planKind: "ending", endingFree: true, endsAt: ago(-5) }).reasons[0]).toMatchObject({ key: "cancelled_free", tone: "bad" });
    expect(one({ planKind: "ending", endingFree: false, endsAt: ago(-5) }).reasons[0]).toMatchObject({ key: "ending", tone: "warn" });
  });

  it("calls a book held for missing scans at risk and links Production", () => {
    const f = one({ heldBook: 2 });
    expect(f.tone).toBe("bad");
    expect(f.reasons[0].text).toContain("Book 2 is held");
    expect(f.next?.href).toBe("/admin/workbooks");
  });

  it("ignores activity from before this plan started, and counts nothing when the start is unknown", () => {
    // restarted yesterday, last scan 40 days ago: a new plan, not 40 quiet days
    expect(one({ planSince: ago(1), lastActivityAt: ago(40) })).toMatchObject({ tone: "ok", quietDays: null, reasons: [] });
    // same restart 9 days ago: quiet since the plan started
    expect(one({ planSince: ago(9), lastActivityAt: ago(40) })).toMatchObject({ tone: "warn", quietDays: 9 });
    expect(one({ planSince: null, lastActivityAt: null, lastActivityKind: null })).toMatchObject({ tone: "ok", quietDays: null });
    expect(one({ planSince: null, lastActivityAt: ago(20) })).toMatchObject({ tone: "bad", quietDays: 20 });
  });

  it("does not count quiet days for a plan that is not running", () => {
    expect(one({ planKind: "paused", lastActivityAt: ago(40) }).reasons.map((r) => r.key)).toEqual(["paused"]);
    expect(one({ planKind: "payment_failed", lastActivityAt: ago(40) }).reasons.map((r) => r.key)).toEqual(["payment_failed"]);
  });

  it("puts the worst reason first in the next action", () => {
    const f = one({ planKind: "ending", endingFree: false, endsAt: ago(-5), lastActivityAt: ago(20) });
    expect(f.reasons.map((r) => r.tone)).toEqual(["bad", "warn"]);
    expect(f.next?.text).toBe("Send a nudge or call to ask how it is going");
  });
});

describe("Families at risk: the order and the summary", () => {
  it("sorts the most at risk first, then by number of reasons, then by days quiet", () => {
    const list = riskFamilies([
      row({ childId: "a", parentName: "A fine" }),
      row({ childId: "b", parentName: "B watch", lastActivityAt: ago(9) }),
      row({ childId: "c", parentName: "C risk", lastActivityAt: ago(15) }),
      row({ childId: "d", parentName: "D risk twice", planKind: "payment_failed", lastActivityAt: ago(30) }),
      row({ childId: "e", parentName: "E risk", lastActivityAt: ago(20) }),
    ], NOW);
    expect(list.map((f) => f.parentName)).toEqual(["D risk twice", "E risk", "C risk", "B watch", "A fine"]);
  });

  it("counts real families only when there are any, and says when there are few", () => {
    const list = riskFamilies([row({ childId: "a" }), row({ childId: "b", testFamily: true, lastActivityAt: ago(30) })], NOW);
    expect(riskSummary(list)).toEqual({ total: 1, bad: 0, warn: 0, ok: 1, few: true });
    expect(riskSummary(riskFamilies([row({ testFamily: true, lastActivityAt: ago(30) })], NOW))).toMatchObject({ total: 1, bad: 1 });
  });

  it("reads database rows and leaves out a plan kind the page does not know", () => {
    const raw = { parent_id: "p", parent_name: "N", child_id: "c", child_name: "K", plan_kind: "free_month", ending_free: false, next_charge_at: null, ends_at: null, plan_since: ago(1), last_activity_at: null, last_activity_kind: null, last_sign_in_at: null, held_book: null, test_family: false };
    expect(readRiskRows([raw, { ...raw, plan_kind: "ended" }]).map((r) => r.planKind)).toEqual(["free_month"]);
  });
});
