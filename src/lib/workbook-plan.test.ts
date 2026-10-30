import { describe, expect, it } from "vitest";
import { BC_SKILL_MAP, type StrandStatus } from "@/lib/assessment";
import { childProfileFacts, type ChildStandard } from "@/lib/child-profile";
import type { LearningEvent } from "@/lib/learning-events";
import { nextReview, planWorkbook, type PlanInput, type PlanLevel, type PlannedPage, type WorkbookPlan } from "@/lib/workbook-plan";
import { U10, U19, U2, U5 } from "@/lib/workbook-plan-levels.test-data";

// The two-week curriculum plan (#308, spec #296) through its public interface: fake child profiles and levels from the
// curriculum skeleton (round 2). The rules: .design/workbooks/CONTEXT.md sections 1, 4 and 5, DESIGN.md section 7.

type FakeStandard = Pick<ChildStandard, "code" | "status" | "assessment" | "events" | "evidence">;

const NO_EVENTS: ChildStandard["events"] = {
  right: 0, rightWithHelp: 0, wrong: 0, blank: 0, hints: 0, stuckSteps: [], mistakes: [],
  sources: { call: 0, marking: 0, assessment: 0 }, lastAt: null,
};

const TEST_ID = "00000000-0000-4000-8000-0000000000e1";
const TEST_DONE = "2026-10-20T18:00:00.000Z";

/** A standard of a fake profile: from the assessment test alone, unless events are given. */
const standard = (code: string, status: StrandStatus, over: Partial<FakeStandard> = {}): FakeStandard => ({
  code,
  status,
  assessment: { correct: status === "secure" ? 4 : 1, total: 4, status },
  events: NO_EVENTS,
  evidence: { assessmentId: TEST_ID, events: [] },
  ...over,
});

const input = (over: Partial<PlanInput> = {}): PlanInput => ({
  profile: { assessment: { completedAt: TEST_DONE }, standards: [standard("2.4", "secure"), standard("2.1", "secure")] },
  grade: 3,
  level: U10,
  passed: {},
  workbook: { number: 1, inLevel: 0 },
  reviews: [],
  since: null,
  ...over,
});

const plan = (i: PlanInput): WorkbookPlan => {
  const result = planWorkbook(i);
  if (!result.ok) throw new Error(result.reason);
  return result.plan;
};

const pages = (p: WorkbookPlan) => p.days.flatMap((d) => d.pages.map((page) => ({ day: d.day, ...page })));
const parts = (p: WorkbookPlan) => pages(p).flatMap((page) => page.parts.map((part) => ({ day: page.day, page: page.number, type: page.type, ...part })));
const types = (page: PlannedPage[]) => page.map((x) => x.type);
const kinds = (page: PlannedPage) => page.parts.map((x) => x.kind);

/** Every step a level's skills have passed: the level is done, and its test workbook is due. */
const allPassed = (level: PlanLevel) =>
  Object.fromEntries(level.units.flatMap((u) => u.skills.map((s) => [s.id, s.delivery === "activity" ? 1 : s.steps?.length || 3])));

describe("the two-week curriculum plan: the day", () => {
  it("plans ten days, five a week, with the pages a day of the level's band (D-186)", () => {
    for (const [level, grade, min, max] of [[U2, 0, 4, 6], [U5, 1, 8, 8], [U10, 3, 8, 8], [U19, 6, 6, 6]] as const) {
      const p = plan(input({ level, grade }));
      expect(p.days.map((d) => [d.week, d.day])).toEqual([[1, 1], [1, 2], [1, 3], [1, 4], [1, 5], [2, 6], [2, 7], [2, 8], [2, 9], [2, 10]]);
      expect(p.pagesADay).toEqual({ min, max });
      for (const day of p.days) {
        expect(day.pages.length, `U${level.number} day ${day.day}`).toBeGreaterThanOrEqual(min);
        expect(day.pages.length, `U${level.number} day ${day.day}`).toBeLessThanOrEqual(max);
        expect(day.pages.map((x) => x.number)).toEqual(day.pages.map((_, i) => i + 1));
      }
    }
    // Levels U1 to U3 are parent-led pages.
    expect(new Set(types(plan(input({ level: U2, grade: 0 })).days.flatMap((d) => d.pages)))).toEqual(new Set(["parent-led"]));
  });

  it("follows the 8-page day: warm-up, new idea, practice, practice 2, word problems, Unit B, Remember these + Mixed set, challenge", () => {
    const p = plan(input());
    expect(types(p.days[0].pages)).toEqual(["warm-up", "new-idea", "practice", "practice-2", "word-problems", "unit-b", "remember-these-mixed-set", "challenge"]);
    expect(kinds(p.days[0].pages[0])).toEqual(["warm-up", "in-your-head"]);
    expect(kinds(p.days[0].pages[1])).toEqual(["new-idea", "spot-the-error"]);
    expect(kinds(p.days[0].pages[3])).toEqual(["practice", "solve-it-two-ways", "spot-the-error"]);
    expect(kinds(p.days[0].pages[6])).toEqual(["remember-these", "mixed-set"]);
    // Faded practice: watch one, finish two, then on your own.
    expect(p.days[0].pages[2].parts[0].faded).toEqual({ watch: 1, finish: 2 });
  });

  it("keeps the level gates: warm-up from U8, Mixed set from U10, Try first from U19", () => {
    // Below U8, page 1 is a Remember these? picture review; below U10, page 7 is Remember these? with picture stories.
    const early = plan(input({ level: U5, grade: 1 }));
    expect(early.days[0].pages[0].type).toBe("remember-these");
    expect(kinds(early.days[0].pages[6])).toEqual(["remember-these", "picture-stories"]);
    expect(parts(early).some((x) => x.kind === "warm-up" || x.kind === "mixed-set" || x.kind === "try-first")).toBe(false);

    const middle = plan(input());
    expect(parts(middle).some((x) => x.kind === "warm-up")).toBe(true);
    expect(parts(middle).some((x) => x.kind === "mixed-set")).toBe(true);
    expect(parts(middle).some((x) => x.kind === "try-first")).toBe(false);

    // U19: Try first before each new idea, on a 6-page day.
    const upper = plan(input({ level: U19, grade: 6 }));
    expect(types(upper.days[0].pages)).toEqual(["warm-up", "new-idea", "practice", "word-problems", "unit-b", "remember-these-mixed-set"]);
    expect(kinds(upper.days[0].pages[1])).toEqual(["try-first", "new-idea", "spot-the-error"]);
    expect(kinds(upper.days[0].pages[5])).toEqual(["remember-these", "mixed-set", "challenge"]);
  });

  it("puts Math in the world on Days 4 and 9 from U19, in place of a practice page", () => {
    const upper = plan(input({ level: U19, grade: 6 }));
    expect(upper.days.filter((d) => d.pages.some((x) => x.type === "math-in-the-world")).map((d) => d.day)).toEqual([4, 9]);
    expect(upper.days[3].pages).toHaveLength(6);
    expect(pages(plan(input())).some((x) => x.type === "math-in-the-world")).toBe(false);
  });

  it("gives Days 5 and 10 a Friday 5 in place of the Mixed set: five questions, no hints", () => {
    for (const level of [U10, U19]) {
      const p = plan(input({ level, grade: level === U10 ? 3 : 6 }));
      const fridays = parts(p).filter((x) => x.kind === "friday-5");
      expect(fridays.map((x) => x.day)).toEqual([5, 10]);
      expect(fridays.every((x) => x.items === 5 && x.hints === false)).toBe(true);
      expect(parts(p).filter((x) => x.kind === "mixed-set").some((x) => x.day === 5 || x.day === 10)).toBe(false);
      expect(pages(p).filter((x) => x.type === "friday-5").map((x) => x.day)).toEqual([5, 10]);
    }
  });

  it("gives 1 to 2 challenge problems every day", () => {
    for (const [level, grade] of [[U2, 0], [U5, 1], [U10, 3], [U19, 6]] as const) {
      const p = plan(input({ level, grade }));
      for (const day of p.days) {
        const challenge = day.pages.flatMap((x) => x.parts).filter((x) => x.kind === "challenge");
        expect(challenge, `U${level.number} day ${day.day}`).toHaveLength(1);
        expect(challenge[0].items).toBeGreaterThanOrEqual(1);
        expect(challenge[0].items).toBeLessThanOrEqual(2);
      }
    }
  });

  it("ends every workbook with Show what you know on Day 10: each of its steps, and the hardest again", () => {
    const p = plan(input());
    const shows = parts(p).filter((x) => x.kind === "show-what-you-know");
    expect(shows.map((x) => x.day)).toEqual([10]);
    expect(new Set(shows[0].skills)).toEqual(new Set(p.newSteps.map((s) => s.skill)));
    expect(shows[0].items).toBeGreaterThan(p.newSteps.length);
  });
});

describe("the two-week curriculum plan: units and steps", () => {
  it("starts a New idea only on a day a step starts: worked two ways, then one spot-the-error item", () => {
    const p = plan(input());
    for (const day of p.days) {
      const startsA = p.newSteps.some((s) => s.day === day.day && s.track === "A");
      const ideas = day.pages.flatMap((x) => x.parts).filter((x) => x.kind === "new-idea");
      expect(ideas.some((x) => x.unit === "A"), `day ${day.day}`).toBe(startsA);
      for (const page of day.pages.filter((x) => x.type === "new-idea")) {
        const k = kinds(page);
        expect(k.indexOf("spot-the-error")).toBe(k.indexOf("new-idea") + 1);
        expect(page.parts.find((x) => x.kind === "new-idea")?.methods).toEqual(["Method 1", "Method 2"]);
      }
      // A day with no new step practises on page 2 instead (Day 10: Show what you know).
      if (!startsA && day.day < 10) expect(day.pages[1].type).toBe("practice");
    }
    // Each new step's New idea teaches that step.
    for (const s of p.newSteps.filter((x) => x.track === "A")) {
      const idea = parts(p).find((x) => x.day === s.day && x.kind === "new-idea");
      expect(idea?.step).toEqual({ unit: s.unit, skill: s.skill, step: s.step });
    }
  });

  it("pairs unit A with the next unit of the level that does not depend on it, about 2 pages of A to 1 of B a day", () => {
    // U10: 3.3 needs 3.1 (place value), 3.4 is warm-up only, so B is 3.6 (patterns).
    const p = plan(input());
    expect(p.units).toEqual({ A: ["3.1"], B: "3.6" });
    for (const day of p.days.slice(0, 9)) {
      const a = day.pages.filter((x) => x.unit === "A").length;
      const b = day.pages.filter((x) => x.unit === "B").length;
      expect(a / b, `day ${day.day}`).toBe(2);
    }
    // No B step depends on an A step of the same workbook.
    const prerequisites = (id: string, seen = new Set<string>()): Set<string> => {
      for (const r of BC_SKILL_MAP.standards.flatMap((s) => s.skills).find((k) => k.id === id)?.requires ?? []) if (!seen.has(r)) prerequisites(r, seen.add(r));
      return seen;
    };
    const aSkills = p.newSteps.filter((s) => s.track === "A").map((s) => s.skill);
    for (const b of p.newSteps.filter((s) => s.track === "B")) for (const a of aSkills) expect(prerequisites(b.skill).has(a), `${b.skill} needs ${a}`).toBe(false);

    // U5: 1.5 needs 1.3 (subtracting within 20), so there is no unit B, and its page is spaced review.
    const early = plan(input({ level: U5, grade: 1 }));
    expect(early.units.B).toBeNull();
    expect(pages(early).some((x) => x.type === "unit-b")).toBe(false);
    expect(early.days[0].pages[5]).toMatchObject({ type: "remember-these", unit: null });
  });

  it("teaches each skill's steps in order from the first not passed, at most 8 new steps a workbook", () => {
    // 3.1-place-value-1000 has passed 2 of its 4 steps: the workbook starts at step 3.
    const p = plan(input({ passed: { "3.1-place-value-1000": 2 } }));
    expect(p.newSteps[0]).toMatchObject({ skill: "3.1-place-value-1000", step: 3, day: 1, track: "A" });
    for (const track of ["A", "B"] as const) {
      const steps = p.newSteps.filter((s) => s.track === track);
      steps.slice(1).forEach((s, i) => {
        const before = steps[i];
        if (s.skill === before.skill) expect(s.step).toBe(before.step + 1);
        else expect(s.step).toBe(1);
        expect(s.day).toBeGreaterThan(before.day);
      });
    }

    // Skills with a one-page step would start a step every day on both tracks: the cap stops at 8.
    const quick: PlanLevel = { ...U10, units: U10.units.map((u) => ({ ...u, skills: u.skills.map((s) => ({ ...s, pages: s.steps?.length ?? 1 })) })) };
    const capped = plan(input({ level: quick }));
    expect(capped.newSteps).toHaveLength(8);
    // The pages after the cap consolidate the last steps: no New idea.
    const lastStart = Math.max(...capped.newSteps.map((s) => s.day));
    expect(parts(capped).some((x) => x.kind === "new-idea" && x.day > lastStart)).toBe(false);
  });

  it("holds the level's review share, turning Unit B pages into Remember these? when the day falls short", () => {
    for (const [level, grade, target] of [[U2, 0, 0.1], [U5, 1, 0.15], [U10, 3, 0.25], [U19, 6, 0.3]] as const) {
      const p = plan(input({ level, grade }));
      expect(p.reviewShare.target).toBe(target);
      expect(p.reviewShare.planned, `U${level.number}`).toBeGreaterThanOrEqual(target);
    }
    // U10's day template holds its 25%: every Unit B page stays.
    expect(pages(plan(input())).filter((x) => x.type === "unit-b")).toHaveLength(10);
    // U19's 6-page day holds less than 30%: the last day's Unit B page is review.
    const upper = plan(input({ level: U19, grade: 6 }));
    expect(upper.days.map((d) => d.pages[4].type)).toEqual([...Array(9).fill("unit-b"), "remember-these"]);
  });

  it("brings each passed step back after 2 days, 1 week, 3 weeks and 2 months; a miss goes back to 2 days", () => {
    const review = { skill: "2.4-add-within-100", step: 2, interval: 0, due: 3 };
    expect(nextReview(review, 3, true)).toEqual({ skill: "2.4-add-within-100", step: 2, interval: 1, due: 8 });
    expect(nextReview({ ...review, interval: 1 }, 8, true)).toMatchObject({ interval: 2, due: 23 });
    expect(nextReview({ ...review, interval: 2 }, 23, true)).toMatchObject({ interval: 3, due: 63 });
    expect(nextReview({ ...review, interval: 3 }, 63, true)).toBeNull();
    expect(nextReview({ ...review, interval: 2 }, 23, false)).toMatchObject({ interval: 0, due: 25 });

    // A review due on Day 3 is in that day's Remember these?, then again a week later; the 3 weeks fall in a later book.
    const p = plan(input({ reviews: [review] }));
    const remembered = (day: number) => parts(p).filter((x) => x.day === day && x.kind === "remember-these").flatMap((x) => x.skills);
    expect(remembered(3)).toContain("2.4-add-within-100");
    expect(remembered(8)).toContain("2.4-add-within-100");
    expect(p.reviewsAfter).toContainEqual({ skill: "2.4-add-within-100", step: 2, interval: 2, due: 13 });

    // The workbook's own first step comes back 2 days after its last day.
    const first = p.newSteps[0];
    const next = p.newSteps.find((s) => s.track === first.track && s.day > first.day)!;
    expect(remembered(next.day - 1 + 2)).toContain(first.skill);
  });
});

describe("the two-week curriculum plan: Fix it, review and the level test", () => {
  const LAST_WORKBOOK = "2026-11-02T00:00:00.000Z";
  const missed = (code: string, over: Partial<ChildStandard["events"]> = {}, events: string[] = ["e-1"]) =>
    standard(code, "developing", {
      assessment: null,
      events: { ...NO_EVENTS, wrong: 1, sources: { call: 0, marking: 1, assessment: 0 }, lastAt: "2026-11-05T17:00:00.000Z", ...over },
      evidence: { assessmentId: null, events },
    });

  it("has no Fix it in workbook 1; from workbook 2, last time's misses on page 1 of Days 1 to 5, up to 3 a box", () => {
    const weak = ["2.1", "2.2", "2.3", "2.4", "2.5", "2.6", "2.7"].map((code) => missed(code));
    const profile = { assessment: { completedAt: TEST_DONE }, standards: weak };
    expect(parts(plan(input({ profile }))).some((x) => x.kind === "fix-it")).toBe(false);

    const p = plan(input({ profile, workbook: { number: 2, inLevel: 1 }, since: LAST_WORKBOOK }));
    const boxes = parts(p).filter((x) => x.kind === "fix-it");
    expect(boxes.map((x) => [x.day, x.page])).toEqual([[1, 1], [2, 1], [3, 1], [4, 1], [5, 1]]);
    expect(boxes.every((x) => x.items >= 1 && x.items <= 3)).toBe(true);
    // Spread over the five days, worst first, each with its evidence so no question comes back.
    expect(boxes.map((x) => x.fixIt!.map((f) => f.standard))).toEqual([["2.1", "2.6"], ["2.2", "2.7"], ["2.3"], ["2.4"], ["2.5"]]);
    expect(boxes[0].fixIt![0]).toEqual({ standard: "2.1", mistakes: [], stuckSteps: [], avoid: { assessmentId: null, events: ["e-1"] } });
    // The warm-up makes room for the box.
    expect(parts(p).find((x) => x.day === 1 && x.kind === "warm-up")?.items).toBe(15);
  });

  it("counts right with help, keeps what went wrong, and lists what it cannot fix, never dropping one", () => {
    const helped = missed("2.4", { wrong: 0, rightWithHelp: 2, stuckSteps: ["tens"], mistakes: [] }, ["e-1", "e-2"]);
    const wrong = missed("2.1", { mistakes: ["O3"] }, ["e-3"]);
    // Wrong before the last workbook, and not touched since: not last time's.
    const older = missed("2.3", { lastAt: "2026-10-25T17:00:00.000Z" });
    // Grade 4: above this U10 level's grade; it comes with its own level.
    const ahead = missed("4.1");
    const many = Array.from({ length: 16 }, (_, i) => missed(["2.2", "2.5", "2.6", "2.7", "2.8", "2.9", "2.10", "2.11", "2.12", "1.1", "1.2", "1.3", "1.4", "1.5", "1.6", "1.7"][i]));
    const p = plan(input({ grade: 4, workbook: { number: 3, inLevel: 2 }, since: LAST_WORKBOOK, profile: { assessment: { completedAt: TEST_DONE }, standards: [helped, wrong, older, ahead, ...many] } }));
    const fixed = parts(p).filter((x) => x.kind === "fix-it").flatMap((x) => x.fixIt!);
    expect(fixed).toHaveLength(15);
    expect(fixed.find((f) => f.standard === "2.4")).toMatchObject({ stuckSteps: ["tens"], avoid: { events: ["e-1", "e-2"] } });
    expect(fixed.find((f) => f.standard === "2.1")).toMatchObject({ mistakes: ["O3"] });
    expect(fixed.some((f) => f.standard === "2.3")).toBe(false);
    expect(p.fixItLater).toContain("4.1");
    expect(p.fixItLater).toHaveLength(4);
  });

  it("never plans a standard above the child's school grade as a weakness", () => {
    // A strong Grade 2 child working ahead in a Grade 3 level: 3.2 is not secure, but it is above the school grade.
    const profile = { assessment: { completedAt: TEST_DONE }, standards: [missed("3.2"), standard("3.5", "secure"), missed("2.4")] };
    const p = plan(input({ grade: 2, profile, workbook: { number: 2, inLevel: 1 }, since: LAST_WORKBOOK }));
    const reviewed = parts(p).filter((x) => x.kind === "remember-these" || x.kind === "fix-it").flatMap((x) => x.skills);
    expect(reviewed.some((id) => id.startsWith("3.2-"))).toBe(false);
    expect(p.fixItLater).not.toContain("3.2");
    // Above the school grade but secure: fine to review. At the school grade and not secure: a weakness to fix.
    expect(reviewed.some((id) => id.startsWith("3.5-"))).toBe(true);
    expect(parts(p).find((x) => x.kind === "fix-it")?.fixIt?.map((f) => f.standard)).toEqual(["2.4"]);
  });

  it("builds the test workbook when every step is passed: Day 7 the level test, Day 8 light, Days 9 and 10 mixed", () => {
    expect(plan(input()).testWorkbook).toBe(false);
    const p = plan(input({ passed: allPassed(U10), workbook: { number: 5, inLevel: 4 } }));
    expect(p.testWorkbook).toBe(true);
    expect(p.newSteps).toEqual([]);

    const test = p.days[6];
    expect(new Set(types(test.pages))).toEqual(new Set(["level-test"]));
    expect(test.pages).toHaveLength(8);
    const tested = test.pages.flatMap((x) => x.parts);
    expect(tested.every((x) => x.hints === false && x.test?.sittings === 1)).toBe(true);
    expect(new Set(tested.flatMap((x) => x.test!.units))).toEqual(new Set(["3.1", "3.3", "3.6", "3.13"]));
    expect(tested.reduce((n, x) => n + x.test!.contextQuestions, 0)).toBeGreaterThanOrEqual(1);

    // Day 8 is light: half the pages, no new idea.
    expect(p.days[7].pages).toHaveLength(4);
    expect(p.days[7].pages.flatMap((x) => x.parts).some((x) => x.kind === "new-idea")).toBe(false);
    // Days 9 and 10 mix the whole level; Day 10 still ends with Show what you know.
    for (const day of p.days.slice(8)) expect(day.pages.filter((x) => x.type === "practice").flatMap((x) => x.parts[0].skills).length).toBeGreaterThan(5);
    expect(parts(p).filter((x) => x.kind === "show-what-you-know").map((x) => x.day)).toEqual([10]);
    // Days 1 to 6 bring back every unit of the level.
    const remembered = parts(p).filter((x) => x.day <= 6 && x.kind === "remember-these").flatMap((x) => x.skills);
    for (const unit of ["3.1", "3.3", "3.6", "3.13"]) expect(remembered.some((id) => id.startsWith(`${unit}-`)), unit).toBe(true);

    // Parent-led levels sit the test in two parts.
    const early = plan(input({ level: U2, grade: 0, passed: allPassed(U2), workbook: { number: 3, inLevel: 2 } }));
    expect(early.days[6].pages.flatMap((x) => x.parts).every((x) => x.test?.sittings === 2)).toBe(true);
  });

  it("builds the test workbook after the level's workbooks plus 2 even with steps left, with no new step after Day 6", () => {
    const p = plan(input({ workbook: { number: 7, inLevel: U10.workbooks + 2 } }));
    expect(p.testWorkbook).toBe(true);
    expect(p.newSteps.length).toBeGreaterThan(0);
    expect(Math.max(...p.newSteps.map((s) => s.day))).toBeLessThanOrEqual(6);
    expect(plan(input({ workbook: { number: 6, inLevel: U10.workbooks + 1 } })).testWorkbook).toBe(false);
  });

  it("gives the same plan for the same input, whatever order the profile's standards come in", () => {
    const profile = { assessment: { completedAt: TEST_DONE }, standards: [missed("2.4"), standard("2.1", "needs-attention"), standard("3.1", "secure"), missed("2.3")] };
    const one = input({ profile, passed: { "3.1-place-value-1000": 1 }, workbook: { number: 2, inLevel: 1 }, reviews: [{ skill: "2.4-add-within-100", step: 1, interval: 1, due: 2 }] });
    expect(plan(one)).toEqual(plan(one));
    const shuffled = { ...one, profile: { ...profile, standards: [...profile.standards].reverse() } };
    expect(JSON.stringify(plan(shuffled))).toBe(JSON.stringify(plan(one)));
    // Ties go by curriculum order: of two standards equally weak, the earlier first.
    expect(parts(plan(one)).filter((x) => x.kind === "fix-it").map((x) => x.fixIt![0].standard)).toEqual(["2.1", "2.3", "2.4"]);
  });

  it("refuses a level it cannot plan", () => {
    expect(planWorkbook(input({ level: { ...U10, number: 31 } }))).toEqual({ ok: false, reason: "the level is not U1 to U30" });
    expect(planWorkbook(input({ level: { ...U10, units: [] } }))).toEqual({ ok: false, reason: "the level has no skills" });
    expect(planWorkbook(input({ level: { ...U10, units: [{ code: "3.3", skills: [{ id: "3.3-juggling", delivery: "new-step", pages: 4 }] }] } }))).toEqual({ ok: false, reason: "3.3-juggling is not a skill of the BC skill map" });
    expect(planWorkbook(input({ passed: { "3.5-equal-groups": 1 } }))).toEqual({ ok: false, reason: "3.5-equal-groups is not a skill of this level" });
    expect(planWorkbook(input({ workbook: { number: 0, inLevel: 0 } }))).toEqual({ ok: false, reason: "the workbook number is not 1 or more" });
    expect(planWorkbook(input({ since: "last week" }))).toEqual({ ok: false, reason: "since is not a date" });
  });

  it("reads the child's profile as P6 builds it", () => {
    // Two calls where Maya helped on 2.4, after the last workbook began: back in a Fix it box with the stuck step.
    const helped = (n: number): LearningEvent => ({
      id: `00000000-0000-4000-8000-00000000000${n}`, key: `call:${n}`, parentId: "00000000-0000-4000-8000-0000000000a1", childId: "00000000-0000-4000-8000-0000000000c1",
      source: "call", question: { source: "workbook", workbookId: "00000000-0000-4000-8000-0000000000b1", page: 3, question: n },
      skill: { standard: "2.4", skills: ["2.4-add-within-100"] }, result: "right_with_help", stuckStep: "tens", mistake: null, hints: 2, timeMs: 60_000,
      occurredAt: `2026-11-0${n}T16:00:00.000Z`, evidence: { kind: "call", id: `call-${n}` },
    });
    const profile = childProfileFacts({ grade: 3, learning: null, assessment: null, events: [helped(3), helped(4)] })!;
    const p = plan(input({ profile, workbook: { number: 2, inLevel: 1 }, since: LAST_WORKBOOK }));
    expect(parts(p).find((x) => x.kind === "fix-it")?.fixIt).toEqual([
      { standard: "2.4", mistakes: [], stuckSteps: ["tens"], avoid: { assessmentId: null, events: [helped(3).id, helped(4).id] } },
    ]);
  });
});
