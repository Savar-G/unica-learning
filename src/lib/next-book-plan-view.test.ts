import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { curriculumFor } from "@/lib/workbook-curriculum";
import { planLevel, planWorkbook, type PlanInput, type UnresolvedMiss } from "@/lib/workbook-plan";
import { sourceHash } from "@/lib/workbook-progress-hash";
import type { NextBookSnapshotRecord, PlanHeld, SavedPlan } from "@/lib/next-book-snapshot";
import { snapshotPlanView } from "@/lib/next-book-plan-view";

// #473 (S10b): the admin's read of a frozen next-book snapshot, through its one public function. The saved plan is the
// planner's real answer for a U10 book 2 with two skills under way; its hash follows the stored contract
// (workbook-next-book-snapshot.ts: sha256 of { planningInput, plan }).

const U10 = planLevel(curriculumFor("bc")!, "U10")!;
const BOOK = "00000000-0000-4000-8000-0000000000b1";
const miss = (skill: string, page: number, question: number, over: Partial<UnresolvedMiss> = {}): UnresolvedMiss => ({
  skill, question: { source: "workbook", workbookId: BOOK, page, question }, event: `e-${page}-${question}`, result: "wrong",
  mistake: null, stuckStep: null, ...over,
});
const planInput = (over: Partial<PlanInput> = {}): PlanInput => ({
  profile: { standards: [] }, grade: 3, level: U10, passed: { "3.1-place-value-1000": 1 }, workbook: { number: 2, inLevel: 1 },
  reviews: [{ skill: "3.1-place-value-1000", step: 1, interval: 1, due: 3 }],
  missedReviews: [{ skill: "3.6-increasing-pattern", step: 1, interval: 0, due: 1 }],
  misses: [miss("3.6-increasing-pattern", 12, 3, { result: "blank" }), miss("3.1-place-value-1000", 14, 2, { mistake: "O3" })],
  pausedWeeks: 0, support: null, unassessedUnits: [], ...over,
});
const saved = (input: PlanInput, held: PlanHeld[] = [], consumed = 4): SavedPlan => {
  const result = planWorkbook(input);
  if (!result.ok) throw new Error(result.reason);
  return { planHash: sourceHash(JSON.parse(JSON.stringify({ planningInput: input, plan: result.plan }))), planInput: input,
    consumed: Array.from({ length: consumed }, (_, i) => ({ key: `k${i}`, version: 1 })), held };
};
const record = (plan: SavedPlan | null, over: Partial<NextBookSnapshotRecord> = {}): NextBookSnapshotRecord => ({
  id: "s1", triggerId: "t1", reason: "day7_scanned", parentId: "p1", childId: "c1", workbookId: BOOK, number: 1, printedRevision: "r1",
  triggerAt: Date.parse("2026-11-10T18:00:00Z"), prepareFrom: Date.parse("2026-11-10T18:00:00Z"), revision: 1, draftId: null,
  receiptIds: [], deliveryAuditId: 1, held: null, actor: null,
  frozen: plan ? { frozenAt: Date.parse("2026-11-10T18:20:00Z"), scope: { kind: "day7", request: "day7", cutoff: Date.parse("2026-11-10T18:20:00Z"),
    days: [1, 2, 3, 4, 5, 6, 7], heldDays: [8, 9, 10], jobs: { captured: 3, waiting: 0, deadlineReached: false } },
    pending: [{ key: "x", day: 6, pageId: "pg6", reason: "pending" }] } as unknown as NextBookSnapshotRecord["frozen"] : null,
  snapshotHash: plan ? "h" : null, plan, runId: null, createdAt: Date.parse("2026-11-10T18:00:00Z"), ...over,
});

describe("the frozen next-book plan, per skill", () => {
  it("lists each skill's next steps, reviews due and missed, and its Fix it items", () => {
    const view = snapshotPlanView(record(saved(planInput())));
    expect(view.state).toBe("ready");
    if (view.state !== "ready") return;
    expect(view.matchesSaved).toBe(true);
    const place = view.skills.find(s => s.skill === "3.1-place-value-1000")!;
    expect(place.name).toBe("Hundreds, tens and ones");
    expect(place.newSteps.map(s => s.step)).toEqual(expect.arrayContaining([2]));
    expect(place.newSteps.every(s => s.day >= 1 && s.day <= 10)).toBe(true);
    expect(place.reviewsDue).toEqual([{ step: 1, every: "1 week", when: "Day 3" }]);
    expect(place.fixIt).toEqual([{ question: "Book page 14, question 2", result: "Wrong", mistake: "O3" }]);
    const pattern = view.skills.find(s => s.skill === "3.6-increasing-pattern")!;
    expect(pattern.reviewsMissed).toEqual([{ step: 1, every: "2 days" }]);
    expect(pattern.fixIt).toEqual([{ question: "Book page 12, question 3", result: "Left blank", mistake: null }]);
    // Skills follow the level's teaching order.
    expect(view.skills.map(s => s.skill).indexOf("3.1-place-value-1000")).toBeLessThan(view.skills.map(s => s.skill).indexOf("3.6-increasing-pattern"));
    expect(view.used).toBe(4);
    expect(view.pending).toBe(1);
    expect(view.days).toEqual({ used: [1, 2, 3, 4, 5, 6, 7], later: [8, 9, 10] });
  });

  it("keeps each held mark under its skill with its reason, and counts the rest by reason", () => {
    const view = snapshotPlanView(record(saved(planInput(), [
      { key: "a", skill: "3.6-increasing-pattern", step: 1, reason: "help" },
      { key: null, skill: "3.13-simulated-likelihood", step: 2, reason: "no review question in selected days" },
      { key: "b", version: 1, reason: "outside selected days" },
      { key: "c", version: 1, reason: "outside selected days" },
      { key: "second-try:9", reason: "after-cutoff" },
    ])));
    if (view.state !== "ready") throw new Error(view.state);
    expect(view.skills.find(s => s.skill === "3.6-increasing-pattern")!.held).toEqual([{ step: 1, reason: "Had help with the math" }]);
    // A skill with nothing but a held review still gets its own row.
    expect(view.skills.find(s => s.skill === "3.13-simulated-likelihood")!.held).toEqual([{ step: 2, reason: "No question for it in the scanned days" }]);
    expect(view.otherHeld).toEqual([
      { reason: "On a later day, kept for a later book", count: 2 },
      { reason: "Second try after the snapshot", count: 1 },
    ]);
  });

  it("shows no new steps when the planner now makes another plan than the saved one", () => {
    const good = saved(planInput());
    const view = snapshotPlanView(record({ ...good, planHash: "0".repeat(64) }));
    if (view.state !== "ready") throw new Error(view.state);
    expect(view.matchesSaved).toBe(false);
    const place = view.skills.find(s => s.skill === "3.1-place-value-1000")!;
    expect(place.newSteps).toEqual([]);
    // What the snapshot stored still shows.
    expect(place.reviewsDue).toEqual([{ step: 1, every: "1 week", when: "Day 3" }]);
  });

  it("says each skill's decision from the marks in plain words", () => {
    const decision = (skill: string, action: string, step: number) => ({ version: 1, priorPassedSteps: step - 1,
      decision: { selection: { unit: skill.split("-")[0], skill, step }, target: { unit: skill.split("-")[0], skill, step }, action } });
    const input = planInput({ previewDecisions: [decision("3.1-place-value-1000", "advance", 2), decision("3.6-increasing-pattern", "repeat-new-numbers", 1)] as unknown as PlanInput["previewDecisions"] });
    const view = snapshotPlanView(record({ planHash: "0".repeat(64), planInput: input, consumed: [], held: [] }));
    if (view.state !== "ready") throw new Error(view.state);
    expect(view.skills.find(s => s.skill === "3.1-place-value-1000")!.decision).toBe("Move on to step 2");
    expect(view.skills.find(s => s.skill === "3.6-increasing-pattern")!.decision).toBe("Repeat step 1 with new numbers");
    expect(view.skills.find(s => s.skill === "3.1-place-value-1000")!.reviewsDue.length).toBe(1);
  });

  it("names the state of a chain that has no plan yet", () => {
    expect(snapshotPlanView(null)).toEqual({ state: "none" });
    expect(snapshotPlanView(record(null, { held: { reason: "no-accepted-scans-at-backstop", at: 1 } }))).toEqual({ state: "held" });
    expect(snapshotPlanView(record(null, { revision: 2 }))).toEqual({ state: "waiting", revision: 2 });
    const frozenOnly = record(saved(planInput()));
    expect(snapshotPlanView({ ...frozenOnly, plan: null })).toEqual({ state: "no-plan", revision: 1, frozenAt: Date.parse("2026-11-10T18:20:00Z") });
  });
});
