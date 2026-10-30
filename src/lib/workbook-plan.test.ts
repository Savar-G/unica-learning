import { describe, expect, it } from "vitest";
import { BC_SKILL_MAP, type Grade, type StrandStatus } from "@/lib/assessment";
import { childProfileFacts } from "@/lib/child-profile";
import { curriculumFor } from "@/lib/workbook-curriculum";
import {
  A_TO_B,
  DEFAULT_STEPS,
  nextReview,
  planLevel,
  planWorkbook,
  type PlanInput,
  type PlanLevel,
  type PlannedPage,
  type UnresolvedMiss,
  type WorkbookPlan,
} from "@/lib/workbook-plan";

// The two-week curriculum plan (#308, spec #296) through its public interface, on the BC workbook curriculum (G0) and
// fake child profiles. The rules: .design/workbooks/CONTEXT.md sections 1, 2, 4 and 5, DESIGN.md section 7. Tests
// named R356-nn reproduce the cases of the independent review of PR #356.

const BC = curriculumFor("bc")!;
const level = (id: string) => planLevel(BC, id)!;
const [U1, U2, U4, U5, U9, U10, U19, U22] = ["U1", "U2", "U4", "U5", "U9", "U10", "U19", "U22"].map(level);
const ALL = BC.levels.map((l) => level(l.id));
/** The BC school grade of a level (three levels a grade from Kindergarten). */
const gradeOf = (l: PlanLevel) => Math.floor((l.number - 1) / 3) as Grade;

const standard = (code: string, status: StrandStatus) => ({ code, status });

const input = (over: Partial<PlanInput> = {}): PlanInput => ({
  profile: { standards: [standard("2.4", "secure"), standard("2.1", "secure")] },
  grade: 3,
  level: U10,
  passed: {},
  workbook: { number: 1, inLevel: 0 },
  reviews: [],
  missedReviews: [],
  misses: [],
  pausedWeeks: 0,
  support: null,
  unassessedUnits: [],
  ...over,
});
/** The first workbook of a level, for a child at its grade with no profile. */
const at = (l: PlanLevel, over: Partial<PlanInput> = {}) => input({ level: l, grade: gradeOf(l), profile: { standards: [] }, ...over });

const plan = (i: PlanInput): WorkbookPlan => {
  const result = planWorkbook(i);
  if (!result.ok) throw new Error(result.reason);
  return result.plan;
};

const pages = (p: WorkbookPlan) => p.days.flatMap((d) => d.pages.map((page) => ({ day: d.day, ...page })));
const parts = (p: WorkbookPlan) => pages(p).flatMap((page) => page.parts.map((part) => ({ day: page.day, page: page.number, type: page.type, ...part })));
const types = (list: PlannedPage[]) => list.map((x) => x.type);
const kinds = (page: PlannedPage) => page.parts.map((x) => x.kind);
const items = (page: PlannedPage) => page.parts.reduce((n, x) => n + x.items, 0);
/** The day's A and B, each page split evenly among its parts. */
const aToB = (list: PlannedPage[]) => {
  const sum = (t: "A" | "B") => list.reduce((n, page) => n + page.parts.filter((x) => x.unit === t).length / page.parts.length, 0);
  return { A: sum("A"), B: sum("B") };
};

/** Every step of a level passed: the level is done, and its test workbook is due. */
const allPassed = (l: PlanLevel) =>
  Object.fromEntries(l.units.flatMap((u) => u.skills.filter((s) => s.delivery !== "warm-up").map((s) => [s.id, s.delivery === "activity" ? 1 : s.steps.length || DEFAULT_STEPS])));

const unitSkills = (code: string) => BC_SKILL_MAP.standards.find((s) => s.code === code)!.skills.map((k) => k.id);
const miss = (skill: string, n: number, over: Partial<UnresolvedMiss> = {}): UnresolvedMiss => ({
  skill,
  question: { source: "workbook", workbookId: "00000000-0000-4000-8000-0000000000b1", page: 10 + n, question: n },
  event: `e-${n}`,
  result: "wrong",
  mistake: null,
  stuckStep: null,
  ...over,
});

describe("the curriculum adapter", () => {
  it("reads every level U1 to U30 from the BC workbook curriculum, and plans each", () => {
    for (const l of BC.levels) {
      const adapted = level(l.id);
      expect(adapted).toMatchObject({ number: l.number, workbooks: l.workbooks, pagesPerDay: l.pagesPerDay, reviewShare: l.reviewShare, lead: l.lead });
      expect(adapted.units.map((u) => u.code)).toEqual(l.units);
      expect(adapted.units.flatMap((u) => u.skills.map((s) => s.id)).sort()).toEqual(BC.levelSkills(l.id)!.map((s) => s.id).sort());
      // R356-02: a fluency skill for the warm-up at every level from U8, from the level or an earlier one.
      if (l.number >= 8) expect(adapted.fluency.length, l.id).toBeGreaterThan(0);
      for (const over of [{}, { workbook: { number: 4, inLevel: 2 } }, { passed: allPassed(adapted), workbook: { number: 5, inLevel: 3 } }]) {
        const result = planWorkbook(at(adapted, over));
        expect(result.ok ? "ok" : result.reason, l.id).toBe("ok");
      }
    }
    // The drafted step pages come through (Grade 3).
    expect(U10.units[0].skills[0].steps.map((s) => s.pages)).toEqual([7, 8, 7, 11]);
    expect(planLevel(BC, "U31")).toBeNull();
  });

  it("R356-02: aims every part with items at a skill: warm-up from an earlier level, U1's first review an Already know it? check", () => {
    // U9 has no fluency skill of its own: the warm-up uses U8's.
    expect(parts(plan(at(U9))).find((x) => x.kind === "warm-up")?.skills).toEqual(["2.3-facts-to-10"]);
    for (const l of ALL) {
      for (const x of parts(plan(at(l)))) if (x.items > 0) expect(x.skills.length, `U${l.number} day ${x.day} ${x.kind}`).toBeGreaterThan(0);
    }
    // U1, nothing behind the child: Remember these? comes back to the level's units.
    const first = parts(plan(at(U1, { workbook: { number: 2, inLevel: 1 } }))).find((x) => x.kind === "remember-these" && x.day === 1)!;
    expect(first.skills.every((id) => U1.units.some((u) => u.skills.some((s) => s.id === id)))).toBe(true);
    // A level with no fluency skill: the warm-up has nothing to aim at, and the plan is refused.
    expect(planWorkbook(input({ level: { ...U10, fluency: [] } }))).toEqual({ ok: false, reason: "day 1 page 1: warm-up has no skill to aim at" });
  });
});

describe("the two-week curriculum plan: the day", () => {
  it("plans ten days, five a week, with the pages a day of the level's band (D-186)", () => {
    for (const [l, min, max] of [[U2, 4, 6], [U5, 8, 8], [U10, 8, 8], [U19, 6, 6]] as const) {
      const p = plan(at(l));
      expect(p.days.map((d) => [d.week, d.day])).toEqual([[1, 1], [1, 2], [1, 3], [1, 4], [1, 5], [2, 6], [2, 7], [2, 8], [2, 9], [2, 10]]);
      expect(p.pagesADay).toEqual({ min, max });
      for (const day of p.days) {
        expect(day.pages.length, `U${l.number} day ${day.day}`).toBeGreaterThanOrEqual(min);
        expect(day.pages.length, `U${l.number} day ${day.day}`).toBeLessThanOrEqual(max);
        expect(day.pages.map((x) => x.number)).toEqual(day.pages.map((_, i) => i + 1));
      }
    }
  });

  it("follows the 8-page day: warm-up, new idea, practice, practice 2, word problems, Unit B, Remember these + Mixed set, challenge", () => {
    const p = plan(input());
    expect(types(p.days[0].pages)).toEqual(["warm-up", "new-idea", "practice", "practice-2", "word-problems", "unit-b", "remember-these-mixed-set", "challenge"]);
    expect(kinds(p.days[0].pages[0])).toEqual(["warm-up", "in-your-head"]);
    expect(kinds(p.days[0].pages[1])).toEqual(["new-idea", "spot-the-error"]);
    expect(kinds(p.days[0].pages[3])).toEqual(["practice", "solve-it-two-ways", "spot-the-error"]);
    expect(kinds(p.days[0].pages[6])).toEqual(["remember-these", "mixed-set"]);
    expect(p.days[0].pages[2].parts[0].faded).toEqual({ watch: 1, finish: 2 });
  });

  it("keeps the level gates: warm-up from U8, Mixed set from U10, Try first from U19", () => {
    const early = plan(at(U5));
    expect(early.days[0].pages[0].type).toBe("remember-these");
    expect(kinds(early.days[0].pages[6])).toEqual(["remember-these", "picture-stories"]);
    expect(parts(early).some((x) => x.kind === "warm-up" || x.kind === "mixed-set" || x.kind === "try-first")).toBe(false);

    const middle = plan(input());
    expect(parts(middle).some((x) => x.kind === "warm-up")).toBe(true);
    expect(parts(middle).some((x) => x.kind === "mixed-set")).toBe(true);
    expect(parts(middle).some((x) => x.kind === "try-first")).toBe(false);

    const upper = plan(at(U19));
    expect(types(upper.days[0].pages)).toEqual(["warm-up", "new-idea", "practice", "word-problems", "unit-b", "remember-these-mixed-set"]);
    expect(kinds(upper.days[0].pages[1])).toEqual(["try-first", "new-idea", "spot-the-error"]);
    expect(kinds(upper.days[0].pages[5])).toEqual(["remember-these", "mixed-set", "challenge"]);
  });

  it("R356-01: puts Math in the world on Days 4 and 9 from U19 in place of practice page 3, keeping word problems", () => {
    for (const l of [U19, U22]) {
      for (const day of plan(at(l)).days) {
        const world = day.day === 4 || day.day === 9;
        expect(day.pages).toHaveLength(6);
        expect(day.pages[2].type, `U${l.number} day ${day.day}`).toBe(world ? "math-in-the-world" : "practice");
        expect(day.pages[3].type).toBe("word-problems");
        // Solve it two ways stays every day.
        expect(day.pages.flatMap((x) => x.parts).filter((x) => x.kind === "solve-it-two-ways"), `day ${day.day}`).toHaveLength(1);
      }
    }
    expect(pages(plan(input())).some((x) => x.type === "math-in-the-world")).toBe(false);
  });

  it("gives Days 5 and 10 a Friday 5 in place of the Mixed set: five questions, no hints", () => {
    for (const l of [U10, U19]) {
      const p = plan(at(l));
      const fridays = parts(p).filter((x) => x.kind === "friday-5");
      expect(fridays.map((x) => x.day)).toEqual([5, 10]);
      expect(fridays.every((x) => x.items === 5 && x.hints === false)).toBe(true);
      expect(parts(p).filter((x) => x.kind === "mixed-set").some((x) => x.day === 5 || x.day === 10)).toBe(false);
    }
  });

  it("gives 1 to 2 challenge problems every day", () => {
    for (const l of [U2, U5, U10, U19]) {
      for (const day of plan(at(l)).days) {
        const challenge = day.pages.flatMap((x) => x.parts).filter((x) => x.kind === "challenge");
        expect(challenge, `U${l.number} day ${day.day}`).toHaveLength(1);
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
    expect(shows[0].items).toBe(p.newSteps.length + 3);
  });

  it("R356-12: keeps U1 to U3 pages to 6 to 10 items with icon instructions; Solve it two ways from U4", () => {
    for (const l of ["U1", "U2", "U3"].map(level)) {
      for (const over of [{}, { workbook: { number: 3, inLevel: 2 } }, { passed: allPassed(l), workbook: { number: 4, inLevel: 3 } }, { pausedWeeks: 3, workbook: { number: 3, inLevel: 1 } }]) {
        const p = plan(at(l, over));
        expect(p.lead).toBe("parent-led");
        for (const page of pages(p)) {
          expect(items(page), `U${l.number} day ${page.day} page ${page.number}`).toBeGreaterThanOrEqual(6);
          expect(items(page), `U${l.number} day ${page.day} page ${page.number}`).toBeLessThanOrEqual(10);
          expect(page.instructions).toBe("icons");
        }
        for (const day of p.days.filter((d) => d.kind === "teach" || d.kind === "remember")) {
          expect(day.pages.length).toBeGreaterThanOrEqual(4);
          expect(day.pages.length).toBeLessThanOrEqual(6);
        }
        // Answers are a circle, a match, a colour, a line or one numeral: no Solve it two ways below U4.
        expect(parts(p).some((x) => x.kind === "solve-it-two-ways")).toBe(false);
      }
    }
    // From U4, one Solve it two ways a teaching day.
    for (const l of [U4, U10, U19]) {
      for (const day of plan(at(l)).days.filter((d) => d.kind === "teach")) {
        expect(day.pages.flatMap((x) => x.parts).filter((x) => x.kind === "solve-it-two-ways"), `U${l.number} day ${day.day}`).toHaveLength(1);
      }
    }
    expect(plan(at(U4)).days[0].pages[0].instructions).toBe("icons");
    expect(plan(input()).days[0].pages[0].instructions).toBe("text");
  });
});

describe("the two-week curriculum plan: units and steps", () => {
  it("starts a New idea only on a day a step starts: worked two ways, then one spot-the-error item", () => {
    const p = plan(input());
    for (const day of p.days) {
      for (const track of ["A", "B"] as const) {
        const starts = p.newSteps.some((s) => s.day === day.day && s.track === track);
        expect(day.pages.flatMap((x) => x.parts).some((x) => x.kind === "new-idea" && x.unit === track), `day ${day.day} ${track}`).toBe(starts);
      }
      for (const page of day.pages.filter((x) => x.parts.some((y) => y.kind === "new-idea"))) {
        const k = kinds(page);
        expect(k.indexOf("spot-the-error")).toBe(k.indexOf("new-idea") + 1);
        expect(page.parts.find((x) => x.kind === "new-idea")?.methods).toEqual(["Method 1", "Method 2"]);
      }
    }
    for (const s of p.newSteps) {
      const idea = parts(p).find((x) => x.day === s.day && x.kind === "new-idea" && x.unit === s.track);
      expect(idea?.step).toEqual({ unit: s.unit, skill: s.skill, step: s.step });
    }
  });

  it("R356-08: puts Try first before a new step of unit B too, from U19", () => {
    const p = plan(at(U19));
    const bStarts = p.newSteps.filter((s) => s.track === "B");
    expect(bStarts.length).toBeGreaterThan(0);
    for (const s of bStarts) {
      const page = p.days[s.day - 1].pages.find((x) => x.type === "unit-b")!;
      expect(kinds(page)).toEqual(["try-first", "new-idea", "spot-the-error", "practice"]);
      expect(page.parts[0]).toMatchObject({ unit: "B", step: { skill: s.skill, step: s.step } });
    }
    expect(parts(plan(input())).some((x) => x.kind === "try-first")).toBe(false);
  });

  it("pairs unit A with the next unit that does not depend on it; no B step depends on an A step", () => {
    expect(plan(input()).units).toEqual({ A: ["3.1"], B: "3.6", support: null });
    const prerequisites = (id: string, seen = new Set<string>()): Set<string> => {
      for (const r of BC_SKILL_MAP.standards.flatMap((s) => s.skills).find((k) => k.id === id)?.requires ?? []) if (!seen.has(r)) prerequisites(r, seen.add(r));
      return seen;
    };
    for (const l of ALL) {
      const q = plan(at(l));
      const aSkills = q.newSteps.filter((s) => s.track === "A").map((s) => s.skill);
      for (const b of q.newSteps.filter((s) => s.track === "B")) for (const a of aSkills) expect(prerequisites(b.skill).has(a), `U${l.number}: ${b.skill} needs ${a}`).toBe(false);
    }
    // U5: 1.5 needs 1.3, so there is no unit B and its slot is Remember these?.
    const early = plan(at(U5));
    expect(early.units.B).toBeNull();
    expect(early.days[0].pages[5]).toMatchObject({ type: "remember-these", unit: null });
  });

  it("R356-09: keeps about 2 of A to 1 of B on every teaching day, review blocks included", () => {
    let checked = 0;
    for (const l of ALL) {
      for (const over of [{}, { workbook: { number: 3, inLevel: 1 } }]) {
        for (const day of plan(at(l, over)).days.filter((d) => d.kind === "teach")) {
          const { A, B } = aToB(day.pages);
          if (B === 0) continue;
          checked++;
          expect(A / B, `U${l.number} day ${day.day}`).toBeGreaterThanOrEqual(A_TO_B.min);
          expect(A / B, `U${l.number} day ${day.day}`).toBeLessThanOrEqual(A_TO_B.max);
        }
      }
    }
    expect(checked).toBeGreaterThan(300);
    // U10 keeps its Unit B page every day.
    expect(plan(input()).days.map((d) => d.pages[5].type)).toEqual(Array(10).fill("unit-b"));
  });

  it("teaches each skill's steps in order from the first not passed, at most 8 new steps a workbook", () => {
    const p = plan(input({ passed: { "3.1-place-value-1000": 2 } }));
    expect(p.newSteps[0]).toMatchObject({ skill: "3.1-place-value-1000", step: 3, day: 1, track: "A" });
    for (const track of ["A", "B"] as const) {
      const steps = p.newSteps.filter((s) => s.track === track);
      steps.slice(1).forEach((s, i) => {
        if (s.skill === steps[i].skill) expect(s.step).toBe(steps[i].step + 1);
        else expect(s.step).toBe(1);
        expect(s.day).toBeGreaterThan(steps[i].day);
      });
    }
    // One-page steps would start a step every day on both tracks: the cap stops at 8.
    const quick: PlanLevel = { ...U10, units: U10.units.map((u) => ({ ...u, skills: u.skills.map((s) => ({ ...s, steps: s.steps.map(() => ({ pages: 1 })) })) })) };
    const capped = plan(input({ level: quick }));
    expect(capped.newSteps).toHaveLength(8);
    const lastStart = Math.max(...capped.newSteps.map((s) => s.day));
    expect(parts(capped).some((x) => x.kind === "new-idea" && x.day > lastStart)).toBe(false);
  });

  it("R356-07: reads each drafted step's pages; with none drafted, splits the skill's pages evenly", () => {
    // U10's first skill: steps of 7, 8, 7 and 11 pages, 4 A pages a day: step 2 starts on Day 3, step 3 on Day 5.
    expect(plan(input()).newSteps.filter((s) => s.track === "A").slice(0, 3).map((s) => [s.step, s.day])).toEqual([[1, 1], [2, 3], [3, 5]]);
    // The same 33 pages as 30, 1, 1 and 1: step 1 takes eight days.
    const heavy: PlanLevel = { ...U10, units: U10.units.map((u, i) => (i > 0 ? u : { ...u, skills: u.skills.map((s, j) => (j > 0 ? s : { ...s, steps: [30, 1, 1, 1].map((pages) => ({ pages })) })) })) };
    expect(plan(input({ level: heavy })).newSteps.filter((s) => s.track === "A").map((s) => [s.step, s.day]).slice(0, 2)).toEqual([[1, 1], [2, 9]]);
    // U19's 6.1-place-value has no drafted steps: 16 pages over 3 steps, 6, 5 and 5; 3 A pages a day.
    expect(U19.units[0].skills[0]).toMatchObject({ id: "6.1-place-value", pages: 16, steps: [] });
    expect(plan(at(U19)).newSteps.filter((s) => s.track === "A").slice(0, 3).map((s) => [s.step, s.day])).toEqual([[1, 1], [2, 3], [3, 5]]);
  });
});

describe("the two-week curriculum plan: review", () => {
  it("R356-10: holds the level's review share at every level, Show what you know counted as review", () => {
    for (const l of ALL) {
      const p = plan(at(l));
      expect(p.reviewShare.target).toBe(l.reviewShare);
      expect(p.reviewShare.planned, `U${l.number}`).toBeGreaterThanOrEqual(l.reviewShare);
    }
    // U10 at 25%: spare room on teaching pages takes Remember these? blocks, last days first; Unit B stays.
    const blocks = parts(plan(input())).filter((x) => x.kind === "remember-these" && ["practice-2", "word-problems", "challenge"].includes(x.type));
    expect(blocks.length).toBeGreaterThan(0);
    expect(Math.min(...blocks.map((x) => x.day))).toBeGreaterThan(5);
  });

  it("brings each passed step back after 2 days, 1 week, 3 weeks and 2 months; a miss goes back to 2 days", () => {
    const review = { skill: "2.4-add-within-100", step: 2, interval: 0, due: 3 };
    expect(nextReview(review, 3, true)).toEqual({ skill: "2.4-add-within-100", step: 2, interval: 1, due: 8 });
    expect(nextReview({ ...review, interval: 1 }, 8, true)).toMatchObject({ interval: 2, due: 23 });
    expect(nextReview({ ...review, interval: 2 }, 23, true)).toMatchObject({ interval: 3, due: 63 });
    expect(nextReview({ ...review, interval: 3 }, 63, true)).toBeNull();
    expect(nextReview({ ...review, interval: 2 }, 23, false)).toMatchObject({ interval: 0, due: 25 });

    // This workbook's first step comes back 2 days after its last day.
    const p = plan(input());
    const first = p.newSteps[0];
    const next = p.newSteps.find((s) => s.track === first.track && s.day > first.day)!;
    const back = parts(p).filter((x) => x.kind === "remember-these").flatMap((x) => (x.reviews ?? []).map((r) => ({ ...r, day: x.day })));
    expect(back).toContainEqual({ skill: first.skill, step: first.step, interval: 0, day: next.day - 1 + 2 });
  });

  it("R356-03: keeps each spaced review's step and interval, and loses none", () => {
    // The four steps of 3.1-place-value-1000, all due on Day 2, and one due after Day 10.
    const due = [1, 2, 3, 4].map((step) => ({ skill: "3.1-place-value-1000", step, interval: 1, due: 2 }));
    const later = { skill: "2.1-count-to-100", step: 1, interval: 2, due: 12 };
    const p = plan(input({ passed: { "3.1-place-value-1000": 4 }, reviews: [...due, later] }));
    const placed = parts(p).filter((x) => x.kind === "remember-these").flatMap((x) => (x.reviews ?? []).map((r) => ({ ...r, day: x.day })));
    for (const r of due) {
      const found = placed.filter((x) => x.skill === r.skill && x.step === r.step && x.interval === r.interval);
      const carried = p.reviewsAfter.filter((x) => x.skill === r.skill && x.step === r.step);
      expect(found.length + carried.length, `step ${r.step}`).toBe(1);
      if (found[0]) expect(found[0].day).toBeGreaterThanOrEqual(2);
    }
    expect(p.reviewsAfter).toContainEqual({ ...later, due: 2 });
    // Each placed review holds 2 items of its part.
    for (const x of parts(p).filter((y) => y.kind === "remember-these")) expect((x.reviews ?? []).length * 2).toBeLessThanOrEqual(x.items);
  });

  it("R356-04: leaves out a carried review above the school grade that is not secure, and keeps a secure one", () => {
    // A Grade 2 child: 3.2 is developing (a weakness above the grade); 3.5 is secure.
    const fraction = { skill: "3.2-name-fraction-region", step: 1, interval: 0, due: 1 };
    const groups = { skill: "3.5-equal-groups", step: 1, interval: 0, due: 1 };
    const p = plan(input({ grade: 2, profile: { standards: [standard("3.2", "developing"), standard("3.5", "secure")] }, reviews: [fraction, groups] }));
    const reviewed = parts(p).flatMap((x) => [...x.skills, ...(x.reviews ?? []).map((r) => r.skill)]);
    expect(reviewed).not.toContain("3.2-name-fraction-region");
    expect(p.reviewsSkipped).toEqual([fraction]);
    expect(parts(p).flatMap((x) => x.reviews ?? []).map((r) => r.skill)).toContain("3.5-equal-groups");
  });

  it("R356-04: applies the school-grade rule to the child's own level too: no remedial review or Fix it above the grade", () => {
    // A Grade 2 child working ahead in U10 (Grade 3): 3.1 is developing. A carried review and a miss on its skill.
    const review = { skill: "3.1-place-value-1000", step: 1, interval: 1, due: 1 };
    const ahead = (status: StrandStatus) => input({
      grade: 2, profile: { standards: [standard("3.1", status)] }, passed: { "3.1-place-value-1000": 1 },
      reviews: [review], misses: [miss("3.1-place-value-1000", 1)], workbook: { number: 6, inLevel: 1 },
    });
    const p = plan(ahead("developing"));
    expect(parts(p).some((x) => x.kind === "fix-it")).toBe(false);
    expect(parts(p).flatMap((x) => x.reviews ?? [])).not.toContainEqual({ skill: review.skill, step: 1, interval: 1 });
    expect(p.reviewsSkipped).toEqual([review]);
    // The child still learns the level: teaching ahead of the grade is not a weakness.
    expect(p.newSteps[0]).toMatchObject({ skill: "3.1-place-value-1000", step: 2 });
    // Once 3.1 is secure, the review and the Fix it come back.
    const secure = plan(ahead("secure"));
    expect(parts(secure).find((x) => x.kind === "fix-it")?.fixIt?.map((f) => f.skill)).toEqual(["3.1-place-value-1000"]);
    expect(secure.reviewsSkipped).toEqual([]);
  });
});

describe("the two-week curriculum plan: Fix it, pauses and support", () => {
  it("R356-05: builds Fix it from the previous workbook's unresolved misses only: none in workbook 1, never from all-time counts", () => {
    const misses = ["2.1-count-to-100", "2.3-facts-to-10", "2.4-add-within-100", "2.4-subtract-within-100", "2.5-increasing-pattern", "2.6-missing-addend", "2.7-equal-sign"]
      .map((skill, i) => miss(skill, i, i === 0 ? { mistake: "O3", stuckStep: "tens" } : {}));
    expect(parts(plan(input({ misses }))).some((x) => x.kind === "fix-it")).toBe(false);

    const p = plan(input({ misses, workbook: { number: 2, inLevel: 1 } }));
    const boxes = parts(p).filter((x) => x.kind === "fix-it");
    expect(boxes.map((x) => [x.day, x.page])).toEqual([[1, 1], [2, 1], [3, 1], [4, 1], [5, 1]]);
    expect(boxes.every((x) => x.items >= 1 && x.items <= 3)).toBe(true);
    expect(boxes.flatMap((x) => x.fixIt!.map((f) => f.skill)).sort()).toEqual(misses.map((m) => m.skill).sort());
    expect(boxes[0].fixIt![0]).toEqual({
      skill: "2.1-count-to-100", standard: "2.1", mistakes: ["O3"], stuckSteps: ["tens"],
      avoid: { questions: [misses[0].question], events: ["e-0"] }, reviews: [],
    });
    // The warm-up makes room for the box.
    expect(parts(p).find((x) => x.day === 1 && x.kind === "warm-up")?.items).toBe(15);

    // A profile full of old weak standards and no unresolved miss: no Fix it.
    const weak = { standards: ["2.1", "2.3", "2.4", "2.5"].map((code) => standard(code, "needs-attention")) };
    expect(parts(plan(input({ profile: weak, workbook: { number: 2, inLevel: 1 } }))).some((x) => x.kind === "fix-it")).toBe(false);

    // More than 15 skills: the rest wait.
    const many = BC_SKILL_MAP.standards.filter((s) => s.grade === 2).flatMap((s) => s.skills).slice(0, 18).map((k, i) => miss(k.id, i));
    const full = plan(input({ misses: many, workbook: { number: 2, inLevel: 1 } }));
    expect(parts(full).filter((x) => x.kind === "fix-it").flatMap((x) => x.fixIt!)).toHaveLength(15);
    expect(full.fixItLater).toHaveLength(3);
  });

  it("R356-06: puts a missed spaced review in Fix it with its step", () => {
    const missed = { skill: "2.4-add-within-100", step: 2, interval: 1, due: 0 };
    const p = plan(input({ missedReviews: [missed], workbook: { number: 3, inLevel: 2 } }));
    expect(parts(p).find((x) => x.kind === "fix-it")?.fixIt).toEqual([
      { skill: "2.4-add-within-100", standard: "2.4", mistakes: [], stuckSteps: [], avoid: { questions: [], events: [] }, reviews: [{ step: 2, interval: 1 }] },
    ]);
  });

  it("R356-06: opens with 2 Remember these? days after a pause of 2 weeks or more, with no new step", () => {
    const p = plan(input({ pausedWeeks: 2, workbook: { number: 3, inLevel: 2 } }));
    expect(p.days.map((d) => d.kind).slice(0, 3)).toEqual(["remember", "remember", "teach"]);
    expect(Math.min(...p.newSteps.map((s) => s.day))).toBe(3);
    for (const day of p.days.slice(0, 2)) {
      expect(day.pages).toHaveLength(8);
      expect(day.pages.flatMap((x) => x.parts).some((x) => x.kind === "new-idea" || (x.unit === "A" && x.kind === "practice"))).toBe(false);
    }
    expect(plan(input({ pausedWeeks: 1, workbook: { number: 3, inLevel: 2 } })).days[0].kind).toBe("teach");
  });

  it("R356-06: gives the support unit the daily Review slot for 2 workbooks, with a 5-item mini-test in the second", () => {
    const first = plan(input({ support: "2.4", workbook: { number: 6, inLevel: 0 } }));
    expect(first.units).toMatchObject({ B: null, support: "2.4" });
    for (const day of first.days) {
      const slot = day.pages[5];
      expect(slot.type).toBe("remember-these");
      expect(slot.parts[0].skills.every((id) => id.startsWith("2.4-"))).toBe(true);
    }
    expect(parts(first).some((x) => x.kind === "mini-test")).toBe(false);

    const second = plan(input({ support: "2.4", workbook: { number: 7, inLevel: 1 } }));
    expect(parts(second).filter((x) => x.kind === "mini-test").map((x) => [x.day, x.items, x.hints])).toEqual([[6, 5, false]]);
    expect(parts(second).find((x) => x.kind === "mini-test")!.skills.every((id) => id.startsWith("2.4-"))).toBe(true);

    // R356-06: after a pause, the support unit keeps its page on both Remember these? days.
    for (const inLevel of [0, 1]) {
      const paused = plan(input({ support: "2.4", pausedWeeks: 2, workbook: { number: 6 + inLevel, inLevel } }));
      expect(paused.days.slice(0, 2).map((d) => d.kind)).toEqual(["remember", "remember"]);
      for (const day of paused.days) {
        const supportPages = day.pages.filter((x) => x.parts.length === 1 && x.parts[0].kind === "remember-these" && x.parts[0].skills.join() === unitSkills("2.4").join());
        expect(supportPages, `workbook ${inLevel + 1} day ${day.day}`).toHaveLength(day.day === 6 && inLevel === 1 ? 0 : 1);
      }
    }

    // From the third workbook, unit B is back.
    expect(plan(input({ support: "2.4", workbook: { number: 8, inLevel: 2 } })).units).toMatchObject({ B: "3.6", support: null });
  });

  it("never plans a standard above the child's school grade as a weakness", () => {
    // A strong Grade 2 child in a Grade 3 level: a miss on 3.2 (above the grade, not secure) is not fixed; 2.4 is.
    const p = plan(input({
      grade: 2,
      profile: { standards: [standard("3.2", "developing"), standard("3.5", "secure")] },
      misses: [miss("3.2-name-fraction-region", 1), miss("2.4-add-within-100", 2)],
      workbook: { number: 2, inLevel: 1 },
    }));
    expect(parts(p).find((x) => x.kind === "fix-it")?.fixIt?.map((f) => f.skill)).toEqual(["2.4-add-within-100"]);
    const reviewed = parts(p).filter((x) => x.kind === "remember-these").flatMap((x) => x.skills);
    expect(reviewed.some((id) => id.startsWith("3.2-"))).toBe(false);
    expect(reviewed.some((id) => id.startsWith("3.5-"))).toBe(true);
  });

  it("puts a unit the profile finds secure in review in the first workbook, not in teaching (CONTEXT 2)", () => {
    const p = plan(input({ profile: { standards: [standard("3.1", "secure")] } }));
    expect(p.units.A[0]).not.toBe("3.1");
    expect(p.newSteps.some((s) => s.unit === "3.1")).toBe(false);
    expect(parts(p).filter((x) => x.kind === "remember-these").flatMap((x) => x.skills).some((id) => id.startsWith("3.1-"))).toBe(true);
  });
});

describe("the two-week curriculum plan: the test workbook", () => {
  it("R356-11: builds the test workbook when every step is passed; Day 7 tests every unit, fluency units too", () => {
    expect(plan(input()).testWorkbook).toBe(false);
    const p = plan(input({ passed: allPassed(U10), workbook: { number: 5, inLevel: 4 } }));
    expect(p.testWorkbook).toBe(true);
    expect(p.newSteps).toEqual([]);
    const tested = p.days[6].pages.flatMap((x) => x.parts);
    expect(new Set(types(p.days[6].pages))).toEqual(new Set(["level-test"]));
    expect(tested.every((x) => x.hints === false && x.test?.sittings === 1)).toBe(true);
    expect(new Set(tested.flatMap((x) => x.test!.units))).toEqual(new Set(U10.units.map((u) => u.code)));
    expect(tested.flatMap((x) => x.skills)).toContain("3.4-recall-addition-20");
    expect(tested.reduce((n, x) => n + x.test!.contextQuestions, 0)).toBeGreaterThanOrEqual(1);
    for (const l of ALL) {
      const test = plan(at(l, { passed: allPassed(l), workbook: { number: 9, inLevel: 3 } }));
      const units = new Set(test.days[6].pages.flatMap((x) => x.parts.flatMap((y) => y.test!.units)));
      expect([...units].sort(), `U${l.number}`).toEqual([...l.units.map((u) => u.code)].sort());
    }

    // Day 8 light; Days 9 and 10 mixed; Day 10 still Show what you know; Days 1 to 6 review every unit.
    expect(p.days[7].pages).toHaveLength(4);
    expect(p.days[7].pages.flatMap((x) => x.parts).some((x) => x.kind === "new-idea")).toBe(false);
    expect(p.days.slice(8).map((d) => d.kind)).toEqual(["mixed", "mixed"]);
    expect(parts(p).filter((x) => x.kind === "show-what-you-know").map((x) => x.day)).toEqual([10]);
    const remembered = parts(p).filter((x) => x.day <= 6 && x.kind === "remember-these").flatMap((x) => x.skills);
    for (const unit of U10.units.map((u) => u.code)) expect(remembered.some((id) => id.startsWith(`${unit}-`)), unit).toBe(true);
    // With no new step, Show what you know takes one of each skill passed (12), and the hardest again.
    expect(parts(p).find((x) => x.kind === "show-what-you-know")).toMatchObject({ items: 15 });

    // Parent-led levels sit the test in two parts.
    const early = plan(at(U2, { passed: allPassed(U2), workbook: { number: 3, inLevel: 2 } }));
    expect(early.days[6].pages.flatMap((x) => x.parts).every((x) => x.test?.sittings === 2)).toBe(true);
  });

  it("builds the test workbook after the level's workbooks plus 2 even with steps left, with no new step after Day 6", () => {
    const p = plan(input({ workbook: { number: 7, inLevel: U10.workbooks + 2 } }));
    expect(p.testWorkbook).toBe(true);
    expect(p.newSteps.length).toBeGreaterThan(0);
    expect(Math.max(...p.newSteps.map((s) => s.day))).toBeLessThanOrEqual(6);
    expect(plan(input({ workbook: { number: 6, inLevel: U10.workbooks + 1 } })).testWorkbook).toBe(false);
  });
});

describe("the two-week curriculum plan: input", () => {
  it("gives the same plan for the same input, whatever order the profile's standards and misses come in", () => {
    const profile = { standards: [standard("2.4", "developing"), standard("2.1", "needs-attention"), standard("3.1", "secure"), standard("2.3", "needs-attention")] };
    const one = input({
      profile, passed: { "3.1-place-value-1000": 1 }, workbook: { number: 2, inLevel: 1 },
      misses: [miss("2.4-add-within-100", 1), miss("2.1-count-to-100", 2)], reviews: [{ skill: "2.4-add-within-100", step: 1, interval: 1, due: 2 }],
    });
    expect(plan(one)).toEqual(plan(one));
    const shuffled = { ...one, profile: { standards: [...profile.standards].reverse() }, misses: [...one.misses].reverse() };
    expect(JSON.stringify(plan(shuffled))).toBe(JSON.stringify(plan(one)));
  });

  it("reads the child's profile as P6 builds it", () => {
    const built = childProfileFacts({
      grade: 3, learning: null, assessment: null,
      events: [{
        id: "00000000-0000-4000-8000-000000000001", key: "call:1", parentId: "00000000-0000-4000-8000-0000000000a1", childId: "00000000-0000-4000-8000-0000000000c1",
        source: "call", question: { source: "workbook", workbookId: "00000000-0000-4000-8000-0000000000b1", page: 3, question: 1 },
        skill: { standard: "3.5", skills: [] }, result: "right", stuckStep: null, mistake: null, hints: 0, timeMs: 1, occurredAt: "2026-11-01T16:00:00.000Z", evidence: { kind: "call", id: "c" },
      }],
    })!;
    expect(planWorkbook(input({ profile: built })).ok).toBe(true);
  });

  it("refuses an input it cannot plan", () => {
    expect(planWorkbook(input({ level: { ...U10, number: 31 } }))).toEqual({ ok: false, reason: "the level is not U1 to U30" });
    expect(planWorkbook(input({ level: { ...U10, units: [] } }))).toEqual({ ok: false, reason: "the level has no skills" });
    expect(planWorkbook(input({ level: { ...U10, units: [{ code: "3.3", skills: [{ id: "3.3-juggling", delivery: "new-step", pages: 4, steps: [] }] }] } }))).toEqual({ ok: false, reason: "3.3-juggling is not a skill of the BC skill map" });
    expect(planWorkbook(input({ passed: { "3.5-equal-groups": 1 } }))).toEqual({ ok: false, reason: "3.5-equal-groups is not a skill of this level" });
    expect(planWorkbook(input({ passed: { "3.1-place-value-1000": 1.5 } }))).toEqual({ ok: false, reason: "the steps passed of 3.1-place-value-1000 is not a whole number" });
    expect(planWorkbook(input({ workbook: { number: 0, inLevel: 0 } }))).toEqual({ ok: false, reason: "the workbook number is not 1 or more" });
    expect(planWorkbook(input({ workbook: { number: 2, inLevel: -1 } }))).toEqual({ ok: false, reason: "the workbooks before in the level is not a whole number" });
    expect(planWorkbook(input({ pausedWeeks: 1.5 }))).toEqual({ ok: false, reason: "the weeks paused is not a whole number" });
    expect(planWorkbook(input({ support: "3.99" }))).toEqual({ ok: false, reason: "3.99 is not a BC standard" });
    expect(planWorkbook(input({ misses: [miss("3.3-juggling", 1)] }))).toEqual({ ok: false, reason: "3.3-juggling is not a skill of the BC skill map" });
    expect(planWorkbook(input({ unassessedUnits: ["3.99"] }))).toEqual({ ok: false, reason: "3.99 is not a BC standard" });
  });
});

describe("the two-week curriculum plan: placement checks (CONTEXT 2)", () => {
  it("R356-13: checks each unit with no assessment evidence with 4 items in the first workbook, before it counts as secure", () => {
    const p = plan(input({ unassessedUnits: ["3.6", "3.13", "2.4"] }));
    expect(p.checks).toEqual([
      { unit: "2.4", kind: "unit-check", day: 1 },
      { unit: "3.6", kind: "unit-check", day: 2 },
      { unit: "3.13", kind: "unit-check", day: 3 },
    ]);
    for (const c of p.checks) {
      const found = parts(p).filter((x) => x.kind === "unit-check" && x.check?.unit === c.unit);
      expect(found).toHaveLength(1);
      expect(found[0]).toMatchObject({ day: c.day, items: 4, hints: false, skills: unitSkills(c.unit) });
      // On the day's Remember these? page.
      expect(found[0].type).toBe("remember-these-mixed-set");
    }
    // A unit the profile calls secure but the assessment never asked is not placed as secure: it is checked and taught.
    const unproven = plan(input({ profile: { standards: [standard("3.1", "secure")] }, unassessedUnits: ["3.1"] }));
    expect(unproven.units.A[0]).toBe("3.1");
    expect(unproven.checks).toEqual([{ unit: "3.1", kind: "unit-check", day: 1 }]);
    // Only the first workbook checks.
    expect(plan(input({ unassessedUnits: ["3.6"], workbook: { number: 2, inLevel: 1 } })).checks).toEqual([]);
  });

  it("R356-13: gives each Kindergarten unit a 2-page parent-led Already know it? check in the first workbook", () => {
    for (const id of ["U1", "U2", "U3"]) {
      const l = level(id);
      const p = plan(at(l));
      const units = l.units.map((u) => u.code);
      expect(p.checks).toEqual(units.map((unit, i) => ({ unit, kind: "already-know-it", day: i + 1 })));
      for (const [i, unit] of units.entries()) {
        const day = p.days[i];
        expect(day.pages.slice(0, 2).map((x) => [x.type, x.parts[0].kind, x.parts[0].check])).toEqual([
          ["parent-led", "already-know-it", { unit, page: 1 }],
          ["parent-led", "already-know-it", { unit, page: 2 }],
        ]);
        const checked = day.pages.slice(0, 2).flatMap((x) => x.parts[0].skills);
        expect(new Set(checked)).toEqual(new Set(l.units[i].skills.map((s) => s.id)));
        expect(day.pages.slice(0, 2).every((x) => x.parts[0].hints === false && x.instructions === "icons")).toBe(true);
      }
      // No 4-item unit check in Kindergarten: Already know it? covers every unit.
      expect(plan(at(l, { unassessedUnits: [units[0]] })).checks.every((c) => c.kind === "already-know-it")).toBe(true);
      // Only the first workbook checks.
      expect(plan(at(l, { workbook: { number: 2, inLevel: 1 } })).checks).toEqual([]);
    }
  });
});
