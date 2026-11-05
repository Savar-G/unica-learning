import { describe, expect, it } from "vitest";
import { canCancel, parentPlan, type PlanSubscription } from "@/lib/parent-plan";

const day = 86_400;
const sub = (over: Partial<PlanSubscription>): PlanSubscription => ({
  status: "trialing", cancelAtPeriodEnd: false, trialEnd: 1_800_000_000, periodEnd: 1_800_000_000, cents: 7999, created: 1_797_000_000, ...over,
});
const when = (seconds: number) => new Date(seconds * 1000).toISOString();

describe("the parent's plan state", () => {
  it("shows no plan until the free month starts", () => {
    expect(parentPlan([])).toEqual({ kind: "not_started" });
  });
  it("shows the first charge during the free month", () => {
    expect(parentPlan([sub({})])).toEqual({ kind: "free_month", firstCharge: when(1_800_000_000), monthly: 79.99 });
  });
  it("shows the next charge on a paid plan", () => {
    expect(parentPlan([sub({ status: "active", trialEnd: null, periodEnd: 1_800_000_000 + 30 * day })])).toEqual({ kind: "paying", nextCharge: when(1_800_000_000 + 30 * day), monthly: 79.99 });
  });
  it("shows a free month cancelled as ending, with no charge", () => {
    expect(parentPlan([sub({ cancelAtPeriodEnd: true })])).toEqual({ kind: "ending", endsOn: when(1_800_000_000), free: true });
  });
  it("shows a paid plan cancelled as ending, at the end of the paid month and not at the old trial end", () => {
    const period = 1_800_000_000 + 30 * day;
    expect(parentPlan([sub({ status: "active", cancelAtPeriodEnd: true, periodEnd: period })])).toEqual({ kind: "ending", endsOn: when(period), free: false });
  });
  it.each(["past_due", "unpaid", "paused", "incomplete"])("lets a parent cancel a plan in %s", (status) => {
    const plan = parentPlan([sub({ status })]);
    expect(plan).toEqual({ kind: "payment_failed" });
    expect(canCancel(plan)).toBe(true);
  });
  it("treats a plan past_due with the cancel flag as still chargeable, so the button stays", () => {
    expect(canCancel(parentPlan([sub({ status: "past_due", cancelAtPeriodEnd: true })]))).toBe(true);
  });
  it("uses the newest running plan, and an old cancelled plan does not hide it", () => {
    const old = sub({ status: "canceled", created: 1 });
    expect(parentPlan([old, sub({ created: 2 })]).kind).toBe("free_month");
    expect(parentPlan([old])).toEqual({ kind: "ended" });
    expect(parentPlan([sub({ status: "incomplete_expired" })])).toEqual({ kind: "ended" });
    expect(parentPlan([sub({ status: "canceled", endedAt: 100 }), sub({ status: "canceled", endedAt: 200 })])).toEqual({ kind: "ended", endedOn: when(200) });
  });
  it("offers the button only when a plan can still charge the card", () => {
    expect(canCancel({ kind: "not_started" })).toBe(false);
    expect(canCancel({ kind: "ended" })).toBe(false);
    expect(canCancel({ kind: "unknown" })).toBe(false);
    expect(canCancel({ kind: "ending", endsOn: null, free: true })).toBe(false);
    expect(canCancel(parentPlan([sub({})]))).toBe(true);
  });
});
