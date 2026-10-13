import { describe, expect, it } from "vitest";
import { activities, buildDashboard, buildFamilies, dayKey, pickRange, rangeDays, shiftDay, type DashboardRows, type RawEmail } from "@/lib/admin-dashboard";

// 2026-10-12 19:00 Pacific (PDT, UTC-7)
const NOW = new Date("2026-10-13T02:00:00Z");
const DAY = 86_400_000;
const ago = (days: number, hours = 0) => new Date(NOW.getTime() - days * DAY - hours * 3_600_000).toISOString();

function rows(over: Partial<DashboardRows> = {}): DashboardRows {
  return { parents: [], children: [], tests: [], reports: [], cards: [], waitlist: [], emails: [], subscriptions: [], stripeNote: null, ...over };
}
const parent = (id: string, created: string) => ({ id, created_at: created, name: `Parent ${id}`, email: `${id}@example.com`, postal: "V3S 1A1", source: null });
const child = (id: string, parentId: string, province: "BC" | "ON" = "BC") => ({ id, created_at: ago(30), parent_id: parentId, first_name: `Kid ${id}`, grade: 3, province });
const test = (id: string, parentId: string, childId: string, started: string, completed: string | null, status: "in_progress" | "completed" | "expired" = completed ? "completed" : "in_progress") => ({
  id, created_at: started, status, parent_id: parentId, child_id: childId, grade: 3, province: "BC" as const, started_at: started, completed_at: completed, last_answer_at: completed ?? started, answered: 20,
});
const card = (id: string, parentId: string, created: string, saved: string | null, customer = `cus_${id}`) => ({
  id, created_at: created, updated_at: saved ?? created, parent_id: parentId, child_id: "c", plan: "one" as const, price: 99, stripe_customer_id: customer, card_saved_at: saved,
});
const email = (id: string, parentId: string, kind: RawEmail["kind"], at: string, status: RawEmail["status"] = "sent"): RawEmail => ({
  id, created_at: at, parent_id: parentId, child_id: "k1", assessment_id: null, kind, status, attempts: status === "failed" ? 3 : 1, sent_at: status === "sent" ? at : null, error: status === "failed" ? "429" : null,
});

describe("family stage", () => {
  const stageOf = (r: DashboardRows) => buildFamilies(r).map((f) => f.stage);

  it("is the furthest step each family reached", () => {
    const r = rows({
      parents: ["a", "b", "c", "d", "e", "f"].map((id) => parent(id, ago(10))),
      tests: [
        test("tb", "b", "kb", ago(9), null),
        test("tc", "c", "kc", ago(9), ago(9)),
        test("td", "d", "kd", ago(9), ago(9)),
        test("te", "e", "ke", ago(9), ago(9)),
        test("tf", "f", "kf", ago(9), ago(9)),
      ],
      cards: [card("d", "d", ago(8), null), card("e", "e", ago(8), ago(8)), card("f", "f", ago(8), ago(8))],
      subscriptions: [{ customer: "cus_f", status: "active", created: ago(2), amount: 9900 }],
    });
    expect(stageOf(r)).toEqual(["account", "started", "finished", "card_started", "card_saved", "paying"]);
  });

  it("counts only a live Stripe subscription as paying", () => {
    const r = rows({
      parents: [parent("a", ago(10)), parent("b", ago(10))],
      cards: [card("a", "a", ago(8), ago(8)), card("b", "b", ago(8), ago(8))],
      subscriptions: [
        { customer: "cus_a", status: "canceled", created: ago(3), amount: 9900 },
        { customer: "cus_b", status: "canceled", created: ago(1), amount: 9900 },
        { customer: "cus_b", status: "past_due", created: ago(5), amount: 9900 },
      ],
    });
    const [a, b] = buildFamilies(r);
    expect(a.stage).toBe("card_saved");
    expect(b.stage).toBe("paying");
    expect(b.subscription?.status).toBe("past_due");
  });

  it("puts a finished non-BC family on the waitlist, unless it went on to a card", () => {
    const r = rows({
      parents: [parent("a", ago(10)), parent("b", ago(10))],
      tests: [test("ta", "a", "ka", ago(9), ago(9)), test("tb", "b", "kb", ago(9), ago(9))],
      waitlist: [{ id: "w1", created_at: ago(8), parent_id: "a", child_id: "ka", province: "ON" }, { id: "w2", created_at: ago(8), parent_id: "b", child_id: "kb", province: "ON" }],
      cards: [card("b", "b", ago(7), null)],
    });
    expect(stageOf(r)).toEqual(["waitlist", "card_started"]);
  });

  it("dates the stage from the first time it was reached, and flags an expired-only family", () => {
    const r = rows({
      parents: [parent("a", ago(10))],
      tests: [test("t1", "a", "k1", ago(9), null, "expired"), test("t2", "a", "k1", ago(3), null, "expired")],
    });
    const [f] = buildFamilies(r);
    expect(f.stage).toBe("started");
    expect(f.stageAt).toBe(ago(9));
    expect(f.expired).toBe(true);
    expect(f.tests.map((t) => t.id)).toEqual(["t2", "t1"]);
  });

  it("names the source from utm_source, else the referrer's host", () => {
    const r = rows({ parents: [{ ...parent("a", ago(1)), source: { referrer: "https://www.google.com/search?q=x" } }, { ...parent("b", ago(1)), source: { utm_source: "facebook", referrer: "https://l.facebook.com/" } }, parent("c", ago(1))] });
    expect(buildFamilies(r).map((f) => f.source)).toEqual(["google.com", "facebook", null]);
  });
});

describe("emails", () => {
  const r = rows({
    parents: [parent("a", ago(10))],
    children: [child("k1", "a")],
    tests: [test("t1", "a", "k1", ago(9), ago(5))],
    reports: [
      { id: "r1", created_at: ago(5), assessment_id: "t1", parent_id: "a", child_id: "k1", emailed_at: null, email_error: "Resend 500", alerted_at: ago(5), alert_error: null },
    ],
    emails: [email("e1", "a", "start", ago(9, 1)), email("e2", "a", "continue", ago(8), "failed"), email("e3", "a", "unsubscribe", ago(7), null)],
  });

  it("joins reminder emails, report emails and alerts, newest first, with their subjects", () => {
    const [f] = buildFamilies(r);
    expect(f.emails.map((e) => [e.kind, e.status])).toEqual([
      ["report", "failed"], ["alert", "sent"], ["unsubscribe", "sent"], ["continue", "failed"], ["start", "sent"],
    ]);
    expect(f.emails.find((e) => e.kind === "start")?.subject).toBe("Kid k1 has not started the free math test");
    expect(f.emails.find((e) => e.kind === "alert")?.subject).toBe("Test finished: Kid k1, grade 3, working at ...");
    expect(f.lastEmail?.kind).toBe("report");
    expect(f.unsubscribed).toBe(true);
  });

  it("sums each email kind: sent, failed and the last send", () => {
    const d = buildDashboard(r, "all", NOW);
    const row = (kind: string) => d.emailSummary.find((e) => e.kind === kind)!;
    expect(row("start")).toMatchObject({ sent: 1, failed: 0, last: ago(9, 1) });
    expect(row("continue")).toMatchObject({ sent: 0, failed: 1, last: null });
    expect(row("report")).toMatchObject({ sent: 0, failed: 1 });
    expect(d.needs.map((n) => n.title)).toContain("Email failed");
  });
});

describe("days and ranges", () => {
  it("uses Pacific days", () => {
    expect(dayKey("2026-10-13T06:59:00Z")).toBe("2026-10-12");
    expect(dayKey("2026-10-13T07:00:00Z")).toBe("2026-10-13");
  });

  it("steps calendar days across a DST change without skipping one", () => {
    expect(shiftDay("2026-11-02", -1)).toBe("2026-11-01");
    expect(shiftDay("2026-03-01", 1)).toBe("2026-03-02");
    // 23:30 Pacific: stepping back 24 h at a time would land on Nov 1 twice
    const days = rangeDays("7d", new Date("2026-11-03T07:30:00Z"), null);
    expect(days).toEqual(["2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
  });

  it("starts all time at the first signup, with at least 14 days", () => {
    expect(rangeDays("all", NOW, ago(3))).toHaveLength(14);
    const long = rangeDays("all", NOW, ago(40));
    expect(long[0]).toBe(dayKey(ago(40)));
    expect(long.at(-1)).toBe("2026-10-12");
    expect(rangeDays("today", NOW, null)).toEqual(["2026-10-12"]);
  });

  it("reads only known ranges from the address", () => {
    expect(pickRange("30d")).toBe("30d");
    expect(pickRange("toString")).toBe("7d");
    expect(pickRange(undefined)).toBe("7d");
  });
});

describe("dashboard numbers", () => {
  const r = rows({
    parents: [parent("a", ago(1)), parent("b", ago(2)), parent("c", ago(9)), parent("d", ago(40))],
    tests: [test("ta", "a", "ka", ago(1), ago(1)), test("tb", "b", "kb", ago(2), null), test("tc", "c", "kc", ago(9), ago(9))],
    cards: [card("c", "c", ago(9), ago(8))],
  });

  it("counts the range and the same number of days before it", () => {
    const d = buildDashboard(r, "7d", NOW);
    const k = Object.fromEntries(d.kpis.map((x) => [x.key, x]));
    expect([k.accounts.value, k.accounts.prev]).toEqual([2, 1]);
    expect([k.started.value, k.finished.value, k.completion.value]).toEqual([2, 1, 50]);
    expect([k.saved.value, k.saved.prev]).toEqual([0, 1]);
    expect(k.accounts.spark).toHaveLength(7);
    expect(d.series.reduce((n, s) => n + s.accounts, 0)).toBe(2);
  });

  it("has no previous period for all time", () => {
    const d = buildDashboard(r, "all", NOW);
    expect(d.kpis.every((k) => k.prev === null)).toBe(true);
    expect(d.kpis.find((k) => k.key === "accounts")?.value).toBe(4);
  });

  it("builds the funnel from families that got at least that far", () => {
    const d = buildDashboard(r, "all", NOW);
    expect(d.funnel.map((s) => s.ever)).toEqual([4, 3, 2, 1, 1, 0]);
    expect(buildDashboard(r, "7d", NOW).funnel.map((s) => s.inRange)).toEqual([2, 2, 1, 0, 0, 0]);
    expect(d.stageCounts).toMatchObject({ account: 1, started: 1, finished: 1, card_saved: 1, paying: 0 });
    expect(d.needs.find((n) => n.title === "Start a subscription")?.families.map((f) => f.id)).toEqual(["c"]);
  });

  it("lists the activity newest first, one event per step", () => {
    const events = activities(buildFamilies(r));
    expect(events[0]).toMatchObject({ familyId: "a" });
    expect(events.filter((e) => e.familyId === "c").map((e) => e.kind).sort()).toEqual(["account", "card_saved", "card_start", "test_finish", "test_start"]);
    expect(events.map((e) => e.at)).toEqual([...events.map((e) => e.at)].sort().reverse());
  });
});
