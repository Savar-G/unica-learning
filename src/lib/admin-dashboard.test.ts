import { describe, expect, it } from "vitest";
import { activities, buildDashboard, buildFamilies, deliveryLine, emailFailed, dayKey, monthlyAmount, pickRange, rangeDays, shiftDay, type DashboardRows, type RawEmail, type RawSubscription } from "@/lib/admin-dashboard";

// 2026-10-12 19:00 Pacific (PDT, UTC-7)
const NOW = new Date("2026-10-13T02:00:00Z");
const DAY = 86_400_000;
const ago = (days: number, hours = 0) => new Date(NOW.getTime() - days * DAY - hours * 3_600_000).toISOString();

function rows(over: Partial<DashboardRows> = {}): DashboardRows {
  return { parents: [], children: [], tests: [], reports: [], cards: [], waitlist: [], emails: [], deliveries: [], subscriptions: [], testIds: [], stripeNote: null, stripeMode: null, ...over };
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

const sub = (customer: string, status: string, created: string, over: Partial<RawSubscription> = {}): RawSubscription => ({
  id: `sub_${customer}_${status}`, customer, status, created, endedAt: null, amount: 9900, quantity: 1, interval: "month", intervalCount: 1, currency: "cad", ...over,
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
      subscriptions: [sub("cus_f", "active", ago(2))],
    });
    expect(stageOf(r)).toEqual(["account", "started", "finished", "card_started", "card_saved", "paying"]);
  });

  it("counts only a live Stripe subscription as paying; an ended one is cancelled", () => {
    const r = rows({
      parents: [parent("a", ago(10)), parent("b", ago(10))],
      cards: [card("a", "a", ago(8), ago(8)), card("b", "b", ago(8), ago(8))],
      subscriptions: [
        sub("cus_a", "canceled", ago(3)),
        sub("cus_b", "canceled", ago(1)),
        sub("cus_b", "past_due", ago(5)),
      ],
    });
    const [a, b] = buildFamilies(r);
    expect(a.stage).toBe("cancelled");
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

describe("team and test families", () => {
  const r = rows({
    parents: [parent("a", ago(1)), parent("team", ago(1)), parent("t", ago(40))],
    tests: [test("ta", "a", "ka", ago(1), ago(1)), test("tt", "team", "kt", ago(1), ago(1))],
    testIds: ["team", "t"],
  });

  it("leaves them out of every number unless asked", () => {
    const d = buildDashboard(r, "all", NOW);
    expect(d.families.map((f) => f.id)).toEqual(["a"]);
    expect(d.kpis.find((k) => k.key === "finished")?.value).toBe(1);
    expect(d.activity.every((a) => a.familyId === "a")).toBe(true);
    expect(d.tests).toEqual({ count: 2, shown: false });
    expect(d.days).toHaveLength(14);
  });

  it("counts them when asked, and marks them", () => {
    const d = buildDashboard(r, "all", NOW, { withTests: true });
    expect(d.families).toHaveLength(3);
    expect(d.kpis.find((k) => k.key === "finished")?.value).toBe(2);
    expect(d.families.filter((f) => f.test).map((f) => f.id).sort()).toEqual(["t", "team"]);
    expect(d.days[0]).toBe(dayKey(ago(40)));
  });
});

describe("accuracy rules", () => {
  it("shows a family whose subscription ended as cancelled, never as one to start", () => {
    const r = rows({
      parents: [parent("a", ago(20)), parent("b", ago(20))],
      cards: [card("a", "a", ago(15), ago(15)), card("b", "b", ago(15), ago(15))],
      subscriptions: [sub("cus_a", "canceled", ago(10), { endedAt: ago(3) }), sub("cus_b", "incomplete_expired", ago(10))],
    });
    const d = buildDashboard(r, "all", NOW);
    const a = d.families.find((f) => f.id === "a")!;
    const b = d.families.find((f) => f.id === "b")!;
    expect(a.stage).toBe("cancelled");
    expect(a.stageAt).toBe(ago(3));
    expect(b.stage).toBe("card_saved");
    expect(b.subscriptions).toHaveLength(0);
    expect(d.needs.find((n) => n.title === "Start a subscription")?.families.map((f) => f.id)).toEqual(["b"]);
    expect(d.funnel.find((s) => s.stage === "paying")?.ever).toBe(1);
    expect(d.kpis.find((k) => k.key === "paying")?.value).toBe(0);
  });

  it("adds monthly revenue from paying subscriptions only, spread over their billing period", () => {
    expect(monthlyAmount(sub("x", "active", ago(1), { amount: 9900, quantity: 2 }))).toBe(198);
    expect(monthlyAmount(sub("x", "active", ago(1), { amount: 120000, interval: "year" }))).toBe(100);
    expect(monthlyAmount(sub("x", "active", ago(1), { amount: 9900, interval: "month", intervalCount: 3 }))).toBe(33);
    const r = rows({
      parents: [parent("a", ago(20)), parent("b", ago(20)), parent("c", ago(20))],
      cards: [card("a", "a", ago(15), ago(15)), card("b", "b", ago(15), ago(15)), card("c", "c", ago(15), ago(15))],
      subscriptions: [sub("cus_a", "active", ago(10)), sub("cus_b", "past_due", ago(10), { amount: 17900 }), sub("cus_c", "canceled", ago(10), { endedAt: ago(2) })],
    });
    const d = buildDashboard(r, "30d", NOW);
    const k = Object.fromEntries(d.kpis.map((x) => [x.key, x]));
    expect([k.paying.value, k.mrr.value, k.subscribed.value]).toEqual([2, 278, 3]);
    expect(d.needs.find((n) => n.title === "Payment failing")?.families.map((f) => f.id)).toEqual(["b"]);
  });

  it("counts each saved card, not each family", () => {
    const r = rows({ parents: [parent("a", ago(5))], cards: [card("a1", "a", ago(4), ago(4)), card("a2", "a", ago(3), ago(2))] });
    expect(buildDashboard(r, "7d", NOW).kpis.find((k) => k.key === "saved")?.value).toBe(2);
  });

  it("works out the finish rate from the tests started in the range, so it never passes 100%", () => {
    // started 9 days ago and finished 5 days ago: not in a 7-day cohort
    const r = rows({
      parents: [parent("a", ago(10))],
      tests: [test("old", "a", "k", ago(9), ago(5)), test("t1", "a", "k", ago(3), ago(3)), test("t2", "a", "k", ago(2), null)],
    });
    const k = Object.fromEntries(buildDashboard(r, "7d", NOW).kpis.map((x) => [x.key, x]));
    expect([k.finished.value, k.started.value, k.completion.value]).toEqual([2, 2, 50]);
  });

  it("compares today with yesterday up to the same time of day", () => {
    // NOW is 19:00 Pacific; yesterday at 17:00 counts, yesterday at 21:00 does not yet
    const r = rows({ parents: [parent("a", ago(0, 1)), parent("b", ago(1, 2)), parent("c", ago(1, -2))] });
    const k = buildDashboard(r, "today", NOW).kpis.find((x) => x.key === "accounts")!;
    expect([k.value, k.prev]).toEqual([1, 1]);
  });
});

// The next start reminder in the family drawer (D-102): the job's own rules, from the email log.
describe("next start reminder", () => {
  const H = 3_600_000;
  const added = ago(2);
  const family = (over: Partial<DashboardRows> = {}) =>
    rows({ parents: [{ ...parent("p", added), email: "priya@family.ca" }], children: [{ ...child("k1", "p"), created_at: added }], ...over });
  const next = (r: DashboardRows) => buildFamilies(r, NOW)[0].nextReminders;
  const startSent = (at: string) => email("e1", "p", "start", at);

  it("is the first one, 24 hours after the child was added, until it is logged", () => {
    expect(next(family())).toEqual([{ childName: "Kid k1", kind: "start", at: new Date(Date.parse(added) + 24 * H).toISOString() }]);
  });

  it("is the last one on day 3 once the first is logged, and none once both are", () => {
    const first = new Date(Date.parse(added) + 24 * H).toISOString();
    expect(next(family({ emails: [startSent(first)] }))).toEqual([{ childName: "Kid k1", kind: "start_followup", at: new Date(Date.parse(added) + 72 * H).toISOString() }]);
    expect(next(family({ emails: [startSent(first), email("e2", "p", "start_followup", ago(0))] }))).toEqual([]);
  });

  it("is 48 hours after a first one that went late", () => {
    const late = new Date(Date.parse(added) + 47 * H).toISOString();
    expect(next(family({ emails: [startSent(late)] }))).toMatchObject([{ kind: "start_followup", at: new Date(Date.parse(late) + 48 * H).toISOString() }]);
  });

  it("is none after an unsubscribe, for a child with a test, or for an address that cannot get email", () => {
    expect(next(family({ emails: [startSent(ago(1)), email("u", "p", "unsubscribe", ago(1))] }))).toEqual([]);
    expect(next(family({ tests: [test("t1", "p", "k1", ago(1), null)] }))).toEqual([]);
    expect(next(family({ parents: [parent("p", added)] }))).toEqual([]);
  });
});

// Resend's delivery events (D-104), joined to the email list through the kept copies.
describe("email delivery", () => {
  const report = { id: "r1", created_at: ago(1), assessment_id: "t1", parent_id: "p", child_id: "k1", emailed_at: ago(1), email_error: null, alerted_at: ago(1), alert_error: null };
  const r = (deliveries: DashboardRows["deliveries"]) => rows({
    parents: [parent("p", ago(5))], children: [child("k1", "p")], tests: [test("t1", "p", "k1", ago(2), ago(1))], reports: [report],
    emails: [email("e1", "p", "start", ago(3))], deliveries,
  });
  const at = (h: number) => ago(0, h);
  const log = { email_log_id: "e1", report_id: null, report_email: null };
  const byId = (d: DashboardRows) => Object.fromEntries(buildFamilies(d, NOW)[0].emails.map((e) => [e.id, e]));

  it("shows each email's newest event: a reminder, the report email and the alert each get their own", () => {
    const emails = byId(r([
      { ...log, type: "delivered", occurred_at: at(5), detail: null },
      { ...log, type: "complained", occurred_at: at(2), detail: null },
      { email_log_id: null, report_id: "r1", report_email: "parent", type: "bounced", occurred_at: at(3), detail: "Permanent: no such user" },
      { email_log_id: null, report_id: "r1", report_email: "alert", type: "delivered", occurred_at: at(3), detail: null },
    ]));
    expect(emails.e1.delivery).toEqual({ type: "complained", at: at(2), detail: null });
    expect(deliveryLine(emails["r1:report"])).toEqual({ text: "Bounced: Permanent: no such user", bad: true });
    expect(deliveryLine(emails["r1:alert"])).toEqual({ text: "Delivered", bad: false });
  });

  it("counts a bounced or spam-marked email as failed, and lists the family under Email failed", () => {
    const d = r([{ ...log, type: "bounced", occurred_at: at(2), detail: null }]);
    const e = byId(d).e1;
    expect(e.status).toBe("sent");
    expect(emailFailed(e)).toBe(true);
    expect(buildDashboard(d, "7d", NOW).needs.find((n) => n.title === "Email failed")?.families.map((f) => f.id)).toEqual(["p"]);
  });

  it("is nothing before an event arrives; a delay or a delivery is not a failure", () => {
    expect(byId(r([])).e1.delivery).toBeNull();
    expect(emailFailed(byId(r([{ ...log, type: "delivery_delayed", occurred_at: at(2), detail: null }])).e1)).toBe(false);
    expect(buildDashboard(r([{ ...log, type: "delivered", occurred_at: at(2), detail: null }]), "7d", NOW).needs.find((n) => n.title === "Email failed")).toBeUndefined();
  });
});
