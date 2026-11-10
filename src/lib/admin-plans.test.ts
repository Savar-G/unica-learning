import { describe, expect, it } from "vitest";
import { emailsToCheck, familyPlanCounts, needReasons, needsYou, planState } from "@/lib/admin-plans";
import type { WorkbookEmailRecord } from "@/lib/workbook-email";

const base = { id: "c1", parent_id: "p1", card_saved_at: "2026-11-01T00:00:00Z" as string | null, stripe_customer_id: "cus_1" as string | null, planStarted: false as boolean | null, planKind: null as string | null,
  stuckPlanStart: null as number | null, firstWorkbook: null as { id: string | null; delivered: boolean } | null, workbookEmails: [] as WorkbookEmailRecord[], workbookEmailsReadAt: 0 };
const card = (over: Partial<typeof base> = {}) => ({ ...base, ...over });
const email = (status: WorkbookEmailRecord["status"], claimed_at: string | null = null): WorkbookEmailRecord =>
  ({ id: `e-${status}`, kind: "welcome", workbook_number: 0, status, claimed_at, sent_at: null, delivery: {}, subject: null, text_body: null });
const none = () => false;

describe("planState", () => {
  it("reads the stored plan kind first", () => {
    expect(planState(card({ planKind: "free_month", planStarted: true }))).toBe("free_month");
    expect(planState(card({ planKind: "paying", planStarted: true }))).toBe("paying");
    expect(planState(card({ planKind: "payment_failed" }))).toBe("payment_failed");
    expect(planState(card({ planKind: "paused" }))).toBe("paused");
    expect(planState(card({ planKind: "ending" }))).toBe("cancelled");
    expect(planState(card({ planKind: "ended", card_saved_at: null }))).toBe("cancelled");
  });
  it("without a running plan: not saved, card saved, or check in Stripe", () => {
    expect(planState(card({ card_saved_at: null }))).toBe("not_saved");
    expect(planState(card({ planKind: "not_started" }))).toBe("card_saved");
    expect(planState(card())).toBe("card_saved");
    // a completed start with no stored running plan, or a failed read
    expect(planState(card({ planStarted: true }))).toBe("check");
    expect(planState(card({ planStarted: null, planKind: undefined }))).toBe("check");
  });
});

describe("familyPlanCounts", () => {
  it("counts each real family once, at its furthest child, and leaves test families out", () => {
    const cards = [
      card({ id: "a1", parent_id: "pa", planKind: "paying", planStarted: true }), card({ id: "a2", parent_id: "pa" }),
      card({ id: "b1", parent_id: "pb", planKind: "ended", planStarted: true }), card({ id: "b2", parent_id: "pb", planKind: "free_month", planStarted: true }),
      card({ id: "c1", parent_id: "pc" }),
      card({ id: "d1", parent_id: "pd", planKind: "ended", planStarted: true }),
      card({ id: "t1", parent_id: "test", planKind: "paying", planStarted: true }),
    ];
    const r = familyPlanCounts(cards, (id) => id === "test");
    expect(r.total).toBe(4);
    expect(Object.fromEntries(r.states.map((s) => [s.state, s.n]))).toEqual({ card_saved: 1, free_month: 1, paying: 1, cancelled: 1 });
  });
  it("always shows the four main states, and the others only when a family is in them", () => {
    expect(familyPlanCounts([], none).states.map((s) => s.state)).toEqual(["card_saved", "free_month", "paying", "cancelled"]);
    const r = familyPlanCounts([card({ card_saved_at: null }), card({ parent_id: "p2", planKind: "payment_failed" })], none);
    expect(r.states.map((s) => s.state)).toEqual(["card_saved", "free_month", "paying", "cancelled", "not_saved", "payment_failed"]);
  });
});

describe("needs you", () => {
  const now = Date.parse("2026-11-10T12:00:00Z");
  it("a free month is due only with book 1 delivered, a saved card, a Stripe customer and no start", () => {
    const delivered = { id: "w1", delivered: true };
    expect(needReasons(card({ firstWorkbook: delivered }), now)).toEqual(["start_due"]);
    expect(needReasons(card({ firstWorkbook: { id: "w1", delivered: false } }), now)).toEqual([]);
    expect(needReasons(card({ firstWorkbook: null }), now)).toEqual([]);
    expect(needReasons(card({ firstWorkbook: delivered, planStarted: null }), now)).toEqual([]);
    expect(needReasons(card({ firstWorkbook: delivered, stripe_customer_id: null }), now)).toEqual([]);
    expect(needReasons(card({ firstWorkbook: delivered, card_saved_at: null }), now)).toEqual([]);
  });
  it("a stuck start comes first and replaces the due start", () => {
    expect(needReasons(card({ stuckPlanStart: 2, firstWorkbook: { id: "w1", delivered: true } }), now)).toEqual(["start_stuck"]);
    expect(needReasons(card({ stuckPlanStart: 1, planStarted: true, workbookEmails: [email("failed")] }), now)).toEqual(["start_stuck", "email"]);
  });
  it("an email needs us when not sent or uncertain, including a send stuck for 10 minutes", () => {
    const read = Date.parse("2026-11-10T12:00:00Z");
    for (const s of ["failed", "unknown"] as const) expect(emailsToCheck({ workbookEmails: [email(s)], workbookEmailsReadAt: read }, now)).toHaveLength(1);
    for (const s of ["pending", "sent", "skipped"] as const) expect(emailsToCheck({ workbookEmails: [email(s)], workbookEmailsReadAt: read }, now)).toHaveLength(0);
    expect(emailsToCheck({ workbookEmails: [email("sending", "2026-11-10T11:55:00Z")], workbookEmailsReadAt: read }, now)).toHaveLength(0);
    expect(emailsToCheck({ workbookEmails: [email("sending", "2026-11-10T11:49:00Z")], workbookEmailsReadAt: read }, now)).toHaveLength(1);
  });
  it("groups each card once, under its first reason", () => {
    const groups = needsYou([
      card({ id: "due", firstWorkbook: { id: "w", delivered: true }, workbookEmails: [email("failed")] }),
      card({ id: "stuck", stuckPlanStart: 1 }), card({ id: "mail", planStarted: true, workbookEmails: [email("unknown")] }), card({ id: "calm" }),
    ], now);
    expect(groups.start_due.map((g) => [g.card.id, g.reasons])).toEqual([["due", ["start_due", "email"]]]);
    expect(groups.start_stuck.map((g) => g.card.id)).toEqual(["stuck"]);
    expect(groups.email.map((g) => g.card.id)).toEqual(["mail"]);
  });
});
