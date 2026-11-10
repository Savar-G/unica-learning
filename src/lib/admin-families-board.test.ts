import { describe, expect, it } from "vitest";
import { ALL_STAGES, buildDashboard, type DashboardRows, type RawSubscription } from "@/lib/admin-dashboard";
import {
  BOARD_COLUMNS, BOARD_LANES, buildBoard, familiesHref, groupOf, initials, isLive, isNewFamily, kidsLine, needsByFamily,
  pickStageFilter, statusLine, timeInStage,
} from "@/lib/admin-families-board";
import type { ProgressSnapshot, TestProgress } from "@/lib/admin-progress";

// 2026-10-12 19:00 Pacific (PDT, UTC-7)
const NOW = new Date("2026-10-13T02:00:00Z");
const DAY = 86_400_000;
const ago = (days: number, hours = 0) => new Date(NOW.getTime() - days * DAY - hours * 3_600_000).toISOString();

function rows(over: Partial<DashboardRows> = {}): DashboardRows {
  return { parents: [], children: [], tests: [], reports: [], cards: [], waitlist: [], emails: [], deliveries: [], subscriptions: [], testIds: [], stripeNote: null, stripeMode: null, ...over };
}
const parent = (id: string, created: string, name = `Parent ${id}`) => ({ id, created_at: created, name, email: `${id}@example.com`, postal: null, source: null });
const child = (id: string, parentId: string, grade = 3, province: "BC" | "ON" = "BC") => ({ id, created_at: ago(30), parent_id: parentId, first_name: `Kid ${id}`, grade, province });
const test = (id: string, parentId: string, started: string, completed: string | null, status: "in_progress" | "completed" | "expired" = completed ? "completed" : "in_progress") => ({
  id, created_at: started, status, parent_id: parentId, child_id: `k${parentId}`, grade: 3, province: "BC" as const, started_at: started, completed_at: completed, last_answer_at: completed ?? started, answered: 12,
});
const card = (parentId: string, created: string, saved: string | null, over: Partial<DashboardRows["cards"][number]> = {}) => ({
  id: `card_${parentId}`, created_at: created, updated_at: saved ?? created, parent_id: parentId, child_id: `k${parentId}`, plan: "one" as const, price: 79.99, stripe_customer_id: `cus_${parentId}`, card_saved_at: saved, ...over,
});
const sub = (customer: string, status: string, created: string): RawSubscription => ({
  id: `sub_${customer}`, customer, status, created, endedAt: status === "canceled" ? created : null, trialEnd: null, amount: 7999, quantity: 1, interval: "month", intervalCount: 1, currency: "cad",
});
const noProgress: ProgressSnapshot = { now: NOW.toISOString(), tests: {} };
const progressOf = (id: string, p: Partial<TestProgress>): ProgressSnapshot => ({ now: NOW.toISOString(), tests: { [id]: { open: true, lastActivityAt: NOW.toISOString(), text: "Next question: 18 of 40", ...p } as TestProgress } });
const dash = (r: DashboardRows, withTests = false) => buildDashboard(r, "7d", NOW, { withTests });
const familyOf = (r: DashboardRows, id: string) => dash(r, true).families.find((f) => f.id === id)!;

describe("board columns", () => {
  it("puts every stage in exactly one column or lane, in funnel order", () => {
    const groups = [...BOARD_COLUMNS, ...BOARD_LANES];
    for (const s of ALL_STAGES) expect(groups.filter((g) => g.stages.includes(s)).map((g) => g.key)).toEqual([groupOf(s)]);
    expect(BOARD_COLUMNS.map((c) => c.label)).toEqual(["Signed up", "Taking the test", "Report sent", "Card saved", "Customer"]);
    expect(BOARD_LANES.map((c) => c.key)).toEqual(["waitlist", "cancelled"]);
    expect(ALL_STAGES.map(groupOf)).toEqual(["signed", "testing", "report", "report", "card", "customer", "customer", "cancelled", "waitlist"]);
  });

  it("counts only real families; test families show beside the count", () => {
    const r = rows({ parents: [parent("a", ago(1)), parent("b", ago(2)), parent("t", ago(1))], testIds: ["t"] });
    const off = dash(r);
    const offBoard = buildBoard(off.families, { needs: needsByFamily(off), progress: noProgress, now: off.now });
    expect(offBoard.columns[0]).toMatchObject({ key: "signed", count: 2, tests: 0, total: 2 });
    const on = dash(r, true);
    const onBoard = buildBoard(on.families, { needs: needsByFamily(on), progress: noProgress, now: on.now });
    expect(onBoard.columns[0]).toMatchObject({ count: 2, tests: 1, total: 3 });
    expect(onBoard.columns[0].cards.find((c) => c.id === "t")).toMatchObject({ test: true, needs: [], isNew: false });
  });

  it("shows families that need the team first, then the most recent, up to the column limit", () => {
    const r = rows({
      parents: ["a", "b", "c", "d"].map((id) => parent(id, ago(10))),
      cards: [card("a", ago(9), ago(9)), card("b", ago(9), ago(1)), card("c", ago(9), ago(3)), card("d", ago(9), ago(2))],
      subscriptions: [sub("cus_a", "active", ago(8))],
    });
    const d = dash(r);
    const board = buildBoard(d.families, { needs: needsByFamily(d), progress: noProgress, now: d.now }, 2);
    const cardCol = board.columns.find((c) => c.key === "card")!;
    // b, c and d saved a card and have no subscription: the dashboard's "Start a subscription"
    expect(cardCol).toMatchObject({ count: 3, total: 3 });
    expect(cardCol.cards.map((c) => c.id)).toEqual(["b", "d"]);
    expect(cardCol.cards[0].needs).toEqual(["Start a subscription"]);
    expect(board.columns.find((c) => c.key === "customer")!.cards[0]).toMatchObject({ id: "a", stageLabel: "Paying", needs: [] });
    expect(cardCol.cards[0].stageLabel).toBeNull();
  });

  it("marks a family stuck in the test with the dashboard's reason", () => {
    const r = rows({ parents: [parent("a", ago(6)), parent("b", ago(1))], tests: [test("ta", "a", ago(5), null), test("tb", "b", ago(0, 3), null)] });
    const d = dash(r);
    const col = buildBoard(d.families, { needs: needsByFamily(d), progress: noProgress, now: d.now }).columns.find((c) => c.key === "testing")!;
    expect(col.cards.map((c) => [c.id, c.needs])).toEqual([["a", ["Stuck in the test"]], ["b", []]]);
  });
});

describe("new families", () => {
  it("is a card the site recorded in the last 7 days, as the sidebar badge counts", () => {
    const r = rows({
      parents: ["a", "b", "c", "t"].map((id) => parent(id, ago(20))),
      cards: [card("a", ago(9), ago(6)), card("b", ago(9), ago(8)), card("c", ago(9), ago(1), { saved_in_stripe_only: true }), card("t", ago(9), ago(1))],
      testIds: ["t"],
    });
    const now = NOW.getTime();
    expect(["a", "b", "c", "t"].map((id) => isNewFamily(familyOf(r, id), now))).toEqual([true, false, false, false]);
  });
});

describe("live and status", () => {
  const r = rows({ parents: [parent("a", ago(1))], children: [child("ka", "a")], tests: [test("ta", "a", ago(0, 1), null)] });

  it("is live only while a test is open and the child was seen in the last 3 minutes", () => {
    const f = familyOf(r, "a");
    expect(isLive(f, progressOf("ta", { lastActivityAt: new Date(NOW.getTime() - 60_000).toISOString() }))).toBe(true);
    expect(isLive(f, progressOf("ta", { lastActivityAt: new Date(NOW.getTime() - 5 * 60_000).toISOString() }))).toBe(false);
    expect(isLive(f, progressOf("ta", { open: false }))).toBe(false);
    expect(isLive(f, noProgress)).toBe(false);
  });

  it("says how far the test got, or that it expired", () => {
    const f = familyOf(r, "a");
    expect(statusLine(f, progressOf("ta", {}), NOW.toISOString())).toBe("Next question: 18 of 40.");
    expect(statusLine(f, noProgress, NOW.toISOString())).toBe("12 answers so far.");
    // a reminder time ends in "p.m.": one full stop, not two
    const waiting = familyOf(rows({ parents: [{ ...parent("n", ago(0, 1)), email: "n@mail.ca" }], children: [{ ...child("kn", "n"), created_at: ago(0, 1) }] }), "n");
    expect(statusLine(waiting, noProgress, NOW.toISOString())).toMatch(/^Test not started\. Start reminder due Oct 13, \d+:\d\d [ap]\.m\.$/);
    const gone = familyOf(rows({ ...r, tests: [test("ta", "a", ago(3), null, "expired")] }), "a");
    expect(statusLine(gone, noProgress, NOW.toISOString())).toBe("The test expired before the end.");
  });

  it("names a reminder turned off, and the curriculum a waitlist family waits for", () => {
    const off = rows({
      parents: [parent("a", ago(2)), parent("w", ago(5))], children: [child("ka", "a"), child("kw", "w", 4, "ON")],
      emails: [{ id: "u", created_at: ago(1), parent_id: "a", child_id: null, assessment_id: null, kind: "unsubscribe", status: "sent", attempts: 1, sent_at: ago(1), error: null, clicks: 0, first_clicked_at: null }],
      tests: [test("tw", "w", ago(4), ago(4))], waitlist: [{ id: "wl", created_at: ago(4), parent_id: "w", child_id: "kw", province: "ON" }],
    });
    expect(statusLine(familyOf(off, "a"), noProgress, NOW.toISOString())).toBe("Test not started. Turned reminders off.");
    expect(statusLine(familyOf(off, "w"), noProgress, NOW.toISOString())).toBe("Waiting for Ontario.");
  });
});

describe("words", () => {
  it("gives time in stage as a clock time today, else a span", () => {
    const today = familyOf(rows({ parents: [parent("a", "2026-10-12T16:15:00Z")] }), "a"); // 9:15 a.m. Pacific
    expect(timeInStage(today, NOW.toISOString())).toBe("since 9:15 a.m.");
    expect(timeInStage(familyOf(rows({ parents: [parent("a", ago(4))] }), "a"), NOW.toISOString())).toBe("4 days");
  });

  it("writes initials and children", () => {
    expect(initials("Arjun Mehta")).toBe("AM");
    expect(initials("  ")).toBe("?");
    const two = familyOf(rows({ parents: [parent("a", ago(1))], children: [child("k1", "a", 2), { ...child("k2", "a", 0), first_name: "Chloe" }] }), "a");
    expect(kidsLine(two)).toBe("Kid k1, Gr 2 · Chloe, K");
    const five = familyOf(rows({ parents: [parent("a", ago(1))], children: ["k1", "k2", "k3", "k4", "k5"].map((k) => child(k, "a", 1)) }), "a");
    expect(kidsLine(five)).toBe("Kid k1, Gr 1 · Kid k2, Gr 1 · Kid k3, Gr 1 and 2 more");
    expect(kidsLine(familyOf(rows({ parents: [parent("a", ago(1))], children: [child("k1", "a", 3)] }), "a"))).toBe("Kid k1, Grade 3");
  });
});

describe("addresses", () => {
  it("reads a column, a lane or a single stage as the list filter", () => {
    expect(pickStageFilter("report")).toMatchObject({ label: "Report sent", stages: ["finished", "card_started"] });
    expect(pickStageFilter("cancelled")).toMatchObject({ stages: ["cancelled"] });
    expect(pickStageFilter("card_started")).toMatchObject({ key: "card_started", stages: ["card_started"] });
    expect(pickStageFilter("nope")).toBeNull();
    expect(pickStageFilter(["report"])).toBeNull();
  });

  it("keeps the page's own keys and drops the rest", () => {
    const q = { q: "lin", view: "list", stage: "card", tests: "1", page: "3", range: "30d", family: "x" };
    expect(familiesHref("/admin/parents", q, { stage: "report", page: null })).toBe("/admin/parents?q=lin&view=list&stage=report&tests=1");
    expect(familiesHref("/admin/parents", {}, { view: null })).toBe("/admin/parents");
  });
});
