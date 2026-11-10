import { describe, expect, it } from "vitest";
import { buildDashboard, type DashboardRows, type RangeKey, type RawSubscription } from "@/lib/admin-dashboard";
import {
  DOT_CAP, NUDGES, PAYMENT_FAILING, barColumns, changeText, customerAction, customerLine, customersPanel, dotColumns, homeDate,
  lastDays, markingPanel, perDay, productionPanel, signupsPanel, sinceYesterday, spanOf, thisWeekDays, waitReason, whenShort,
  type WaitingAnswer,
} from "@/lib/admin-home";
import type { Book } from "@/lib/admin-production";

// Tuesday 2026-11-10, 13:00 Pacific (BC keeps UTC-7 all year from 2026; see family-time.ts)
const NOW = new Date("2026-11-10T20:00:00Z");
const DAY = 86_400_000;
const ago = (days: number, hours = 0) => new Date(NOW.getTime() - days * DAY - hours * 3_600_000).toISOString();

function rows(over: Partial<DashboardRows> = {}): DashboardRows {
  return { parents: [], children: [], tests: [], reports: [], cards: [], waitlist: [], emails: [], deliveries: [], subscriptions: [], testIds: [], stripeNote: null, stripeMode: null, ...over };
}
const parent = (id: string, created: string, name = `Parent ${id}`) => ({ id, created_at: created, name, email: `${id}@example.com`, postal: null, source: null });
const child = (id: string, parentId: string, name = `Kid ${id}`) => ({ id, created_at: ago(30), parent_id: parentId, first_name: name, grade: 3, province: "BC" as const });
const test = (id: string, parentId: string, started: string, completed: string | null) => ({
  id, created_at: started, status: completed ? "completed" as const : "in_progress" as const, parent_id: parentId, child_id: `k${parentId}`, grade: 3, province: "BC" as const,
  started_at: started, completed_at: completed, last_answer_at: completed ?? started, answered: 12,
});
const card = (parentId: string, saved: string | null, childId = `k${parentId}`) => ({
  id: `card_${parentId}_${childId}`, created_at: saved ?? ago(20), updated_at: saved ?? ago(20), parent_id: parentId, child_id: childId, plan: "one" as const, price: 79.99, stripe_customer_id: `cus_${parentId}`, card_saved_at: saved,
});
const sub = (customer: string, status: string, created: string, over: Partial<RawSubscription> = {}): RawSubscription => ({
  id: `sub_${customer}`, customer, status, created, endedAt: null, trialEnd: null, amount: 7999, quantity: 1, interval: "month", intervalCount: 1, currency: "cad", ...over,
});
const dash = (r: DashboardRows, range: RangeKey = "7d", withTests = false) => buildDashboard(r, range, NOW, { withTests });

const book = (o: Partial<Book> & { parentId: string; childId: string }): Book => ({ child: "Kid", family: null, test: false, number: 1, stage: "none", at: ago(1), tries: [], ...o });

describe("days", () => {
  it("lists the last 14 Pacific days, oldest first, ending today", () => {
    const days = lastDays(NOW);
    expect(days).toHaveLength(14);
    expect(days[0]).toBe("2026-10-28");
    expect(days[13]).toBe("2026-11-10");
  });

  it("knows how far into the week today is, Monday first", () => {
    expect(thisWeekDays("2026-11-09")).toBe(1); // Monday
    expect(thisWeekDays("2026-11-10")).toBe(2); // Tuesday
    expect(thisWeekDays("2026-11-15")).toBe(7); // Sunday
  });

  it("counts events per Pacific day and leaves out the future and the days outside", () => {
    const days = lastDays(NOW, 3);
    // 2026-11-10 06:30 UTC is still Nov 9 in Pacific time
    expect(perDay(days, ["2026-11-10T06:30:00Z", ago(0, 1), ago(0, 2), ago(20), new Date(NOW.getTime() + 60_000).toISOString(), null], NOW.toISOString())).toEqual([0, 1, 2]);
  });

  it("caps the dots of a day and shades the current week", () => {
    const days = lastDays(NOW, 4);
    const cols = dotColumns(days, [0, 1, DOT_CAP + 3, 2]);
    expect(cols.map((c) => [c.dots, c.more])).toEqual([[0, 0], [1, 0], [DOT_CAP, 3], [2, 0]]);
    expect(cols.map((c) => c.thisWeek)).toEqual([false, false, true, true]);
  });

  it("scales bars to the busiest day and never divides by zero", () => {
    expect(barColumns(lastDays(NOW, 3), [1, 0, 4]).map((c) => c.height)).toEqual([25, 0, 100]);
    expect(barColumns(lastDays(NOW, 2), [0, 0]).map((c) => c.height)).toEqual([0, 0]);
  });

  it("says the date and short times in Pacific time", () => {
    expect(homeDate(NOW)).toBe("Tuesday 10 November");
    expect(whenShort("2026-11-10T16:15:00Z", NOW.toISOString())).toBe("9:15 am");
    expect(whenShort("2026-11-10T02:42:00Z", NOW.toISOString())).toBe("Yesterday, 7:42 pm");
    expect(whenShort("2026-11-06T17:00:00Z", NOW.toISOString())).toBe("Nov 6, 10:00 am");
  });
});

describe("the range and its change", () => {
  it("compares with the span just before, cut at the same time of day", () => {
    const d = dash(rows(), "today");
    const s = spanOf(d);
    expect(s.inCur(ago(0, 1))).toBe(true);
    expect(s.inCur(ago(1, 1))).toBe(false);
    expect(s.inPrev!(ago(1, 1))).toBe(true);
    // yesterday, but later in the day than now: not in the comparison
    expect(s.inPrev!(ago(0, 23))).toBe(false);
    expect(spanOf(dash(rows(), "all")).inPrev).toBeNull();
  });

  it("says the change in words, with nothing to compare for all time", () => {
    expect(changeText(3, 1, "7d")).toEqual({ text: "Up 2 on the 7 days before", tone: "up" });
    expect(changeText(1, 3, "today")).toEqual({ text: "Down 2 on yesterday", tone: "down" });
    expect(changeText(2, 2, "30d")).toEqual({ text: "Same as the 30 days before", tone: "same" });
    expect(changeText(2, null, "all")).toBeNull();
  });
});

describe("new customers", () => {
  const base = rows({
    parents: [parent("a", ago(20), "Mei Lin"), parent("b", ago(20), "Daniel Okafor"), parent("c", ago(40), "Priya Shah"), parent("t", ago(5), "Team Test"), parent("o", ago(40), "Old Card")],
    children: [child("ka", "a", "Ethan"), child("ka2", "a", "Chloe"), child("kb", "b", "Theo"), child("kc", "c", "Mira"), child("kt", "t", "Tess"), child("ko", "o", "Olly")],
    cards: [card("a", ago(0, 3), "ka"), card("a", ago(0, 2), "ka2"), card("b", ago(1)), card("c", ago(9)), card("t", ago(0, 1)), card("o", ago(25))],
    subscriptions: [sub("cus_c", "trialing", ago(4), { trialEnd: "2026-12-06T20:00:00Z" }), sub("cus_o", "past_due", ago(10))],
    testIds: ["t"],
  });

  it("counts real families whose first card was saved in the range, against the span before", () => {
    const c = customersPanel(dash(base));
    expect(c.count).toBe(2); // a and b; t is a test family, c saved 9 days ago
    expect(c.prev).toBe(1); // c, in the 7 days before
    expect(c.active).toBe(2); // c in its free month, o paying (past due is still paying)
  });

  it("draws one dot per card of a real family, the test family's card left out", () => {
    const c = customersPanel(dash(base));
    expect(c.cards14).toBe(4); // a twice, b, c; o saved 25 days ago
    expect(c.days.at(-1)).toMatchObject({ day: "2026-11-10", n: 2, dots: 2 });
    expect(c.days.filter((d) => d.thisWeek).map((d) => d.day)).toEqual(["2026-11-09", "2026-11-10"]);
  });

  it("lists the newest customers by first card, test families only while they show and never in a count", () => {
    expect(customersPanel(dash(base)).newest.map((f) => f.name)).toEqual(["Mei Lin", "Daniel Okafor", "Priya Shah"]);
    const shown = customersPanel(dash(base, "7d", true));
    expect(shown.newest.map((f) => f.name)).toEqual(["Team Test", "Mei Lin", "Daniel Okafor"]);
    expect(shown.count).toBe(2);
    expect(shown.cards14).toBe(4);
  });

  it("names the families whose payment is failing, from the dashboard's own list", () => {
    const d = dash(base);
    expect(d.needs.some((n) => n.title === PAYMENT_FAILING)).toBe(true);
    expect(customersPanel(d).failing.map((f) => f.name)).toEqual(["Old Card"]);
  });

  it("says where a customer stands, with Production's books", () => {
    const d = dash(base);
    const f = (id: string) => d.families.find((x) => x.id === id)!;
    expect(customerLine(f("a"), [book({ parentId: "a", childId: "ka" }), book({ parentId: "a", childId: "ka2" })])).toBe("Card saved. 2 children have no workbook yet.");
    expect(customerLine(f("b"), [book({ parentId: "b", childId: "kb", stage: "making" })])).toBe("Card saved. A workbook is being made.");
    expect(customerLine(f("b"), null)).toBe("Card saved. No plan started yet.");
    expect(customerLine(f("c"), [])).toBe("Free month. First charge Dec 6.");
    expect(customerLine(f("o"), [])).toBe("Paying CAD 79.99 a month.");
  });

  it("carries one action when one is due", () => {
    const d = dash(base);
    const f = (id: string) => d.families.find((x) => x.id === id)!;
    const one = book({ parentId: "b", childId: "kb" });
    expect(customerAction(f("b"), [one])).toEqual({ kind: "prepare", book: one });
    expect(customerAction(f("a"), [book({ parentId: "a", childId: "ka" }), book({ parentId: "a", childId: "ka2" })])).toEqual({ kind: "prepare-many", count: 2 });
    expect(customerAction(f("b"), [book({ parentId: "b", childId: "kb", stage: "delivered", cardSavedAt: ago(1) })])).toEqual({ kind: "start" });
    expect(customerAction(f("b"), [book({ parentId: "b", childId: "kb", stage: "delivered", cardSavedAt: ago(1), planStarted: true })])).toBeNull();
    expect(customerAction(f("b"), [book({ parentId: "b", childId: "kb", stage: "shipped", cardSavedAt: ago(1) })])).toBeNull();
    expect(customerAction(f("b"), null)).toBeNull();
  });
});

describe("signups", () => {
  const base = rows({
    parents: [parent("a", ago(1)), parent("b", ago(5)), parent("c", ago(3)), parent("d", ago(0, 1)), parent("t", ago(0, 2)), parent("old", ago(10))],
    tests: [test("ta", "a", ago(1), ago(1)), test("tb", "b", ago(4), null), test("tc", "c", ago(3), ago(3)), test("tt", "t", ago(0, 2), null)],
    cards: [card("a", ago(1)), card("c", null)],
    testIds: ["t"],
  });

  it("counts real signups in the range and draws 14 days of them", () => {
    const s = signupsPanel(dash(base));
    expect(s.count).toBe(4);
    expect(s.prev).toBe(1);
    expect(s.total14).toBe(5);
    expect(s.days.at(-1)?.n).toBe(1); // d today; t is a test family
  });

  it("shows the funnel as shares of those who signed up", () => {
    expect(signupsPanel(dash(base)).funnel.map((f) => [f.label, f.n, f.pct])).toEqual([
      ["Signed up", 4, 100], ["Started the test", 3, 75], ["Report sent", 2, 50], ["Card saved", 1, 25],
    ]);
  });

  it("names who may need a nudge, from the dashboard's Needs you lists", () => {
    const d = dash(base);
    for (const n of NUDGES) expect(d.needs.map((x) => x.title)).toContain(n.title);
    expect(signupsPanel(d).nudges.map((n) => [n.words, n.families.map((f) => f.id)])).toEqual([["stuck in the test", ["b"]], ["left the payment page", ["c"]]]);
  });

  it("has an empty funnel with no division when no one signed up", () => {
    expect(signupsPanel(dash(rows(), "today")).funnel.map((f) => f.pct)).toEqual([0, 0, 0, 0]);
  });
});

describe("workbook production", () => {
  it("counts the real books that need the team, and says what to do", () => {
    const p = productionPanel([
      book({ parentId: "a", childId: "1", stage: "review" }),
      book({ parentId: "b", childId: "2", stage: "none" }),
      book({ parentId: "c", childId: "3", stage: "none" }),
      book({ parentId: "t", childId: "4", stage: "review", test: true }),
      book({ parentId: "d", childId: "5", stage: "delivered" }),
    ], NOW);
    expect([p.needYou, p.review, p.none, p.total]).toEqual([3, 1, 2, 4]);
    expect(p.line).toEqual({ bold: "3 books need you.", rest: "Review a draft or start a first workbook." });
    expect(p.next?.childId).toBe("1"); // a draft first
  });

  it("says when nothing needs the team, and when there are no books", () => {
    expect(productionPanel([book({ parentId: "a", childId: "1", stage: "printed" })], NOW).line.bold).toBe("Nothing needs you right now.");
    expect(productionPanel([], NOW).line.bold).toBe("No workbooks yet.");
    expect(productionPanel([book({ parentId: "t", childId: "1", stage: "none", test: true })], NOW).needYou).toBe(0);
  });

  it("shows a real running book before a test one, and counts the others", () => {
    const p = productionPanel([
      book({ parentId: "t", childId: "1", stage: "making", test: true, at: ago(0, 1) }),
      book({ parentId: "a", childId: "2", stage: "making", at: ago(0, 3) }),
      book({ parentId: "b", childId: "3", stage: "making", at: ago(0, 2) }),
    ], NOW);
    expect(p.running?.childId).toBe("3");
    expect(p.otherRunning).toBe(2);
  });
});

describe("marking", () => {
  const item = (o: Partial<WaitingAnswer>): WaitingAnswer => ({ parent: "a", child: "c1", childName: "Mira", book: 1, issue: null, since: ago(0, 3), testFamily: false, ...o });

  it("counts real answers only, with the oldest, the reasons and the books", () => {
    const m = markingPanel([
      item({ issue: "blurry", since: ago(0, 5) }),
      item({ issue: "unreadable" }),
      item({ issue: "unreadable", child: "c2", childName: "Theo" }),
      item({ issue: "blurry", parent: "t", testFamily: true, since: ago(3) }),
      item({ issue: "blurry", parent: "u", since: ago(4) }),
    ], 5, (p) => p === "u");
    expect(m.count).toBe(3);
    expect(m.more).toBe(false);
    expect(m.oldest).toBe(ago(0, 5));
    expect(m.reasons).toEqual([{ text: waitReason("unreadable"), n: 2 }, { text: waitReason("blurry"), n: 1 }]);
    expect(m.books).toEqual([{ childId: "c1", label: "Mira · Book 1", n: 2 }, { childId: "c2", label: "Theo · Book 1", n: 1 }]);
  });

  it("says when the read stopped at its limit, and words an unknown reason plainly", () => {
    expect(markingPanel([item({})], 140, () => false).more).toBe(true);
    expect(waitReason(null)).toBe("Waiting for a person to mark it.");
    expect(waitReason("blurry")).toBe("The photo is blurry here.");
  });
});

describe("since yesterday", () => {
  it("shows the latest events since the start of yesterday, oldest first, without emails", () => {
    const d = dash(rows({
      parents: [parent("a", ago(0, 2), "Arjun"), parent("b", ago(1, 2), "Bea"), parent("c", ago(3), "Cy")],
      emails: [{ id: "e1", created_at: ago(0, 1), parent_id: "a", child_id: null, assessment_id: null, kind: "start", status: "sent", attempts: 1, sent_at: ago(0, 1), error: null, clicks: 0, first_clicked_at: null }],
    }));
    expect(sinceYesterday(d).map((a) => [a.familyName, a.kind])).toEqual([["Bea", "account"], ["Arjun", "account"]]);
  });

  it("keeps the newest few", () => {
    const parents = Array.from({ length: 10 }, (_, i) => parent(`p${i}`, ago(0, i + 1), `P${i}`));
    expect(sinceYesterday(dash(rows({ parents })), 3).map((a) => a.familyName)).toEqual(["P2", "P1", "P0"]);
  });
});
