import { describe, expect, it } from "vitest";
import { BC_SKILL_MAP, type StrandStatus } from "@/lib/assessment";
import { childProfileFacts, type ChildStandard } from "@/lib/child-profile";
import type { LearningEvent } from "@/lib/learning-events";
import { planWorkbook, type PlanInput, type WorkbookPlan } from "@/lib/workbook-plan";

// The two-week curriculum plan (#308, spec #296) through its public interface, with fake child profiles.

const ADD = "3.3-add-within-1000";
const SUBTRACT = "3.3-subtract-within-1000";
const WORDS = "3.3-word-problems-1000";
const GROUPS = "3.5-equal-groups";
const SHARING = "3.5-equal-sharing";
const GROUPING = "3.5-grouping-division";
const FRACTION_OF_SET = "3.2-fraction-of-set";

/** A grade 3 level: addition and subtraction to 1000, then multiplication and division concepts. */
const LEVEL = { number: 11, skills: [ADD, SUBTRACT, WORDS, GROUPS, SHARING] };

type FakeStandard = Pick<ChildStandard, "code" | "status" | "assessment" | "events" | "evidence">;

const NO_EVENTS: ChildStandard["events"] = {
  right: 0, rightWithHelp: 0, wrong: 0, blank: 0, hints: 0, stuckSteps: [], mistakes: [],
  sources: { call: 0, marking: 0, assessment: 0 }, lastAt: null,
};

/** A standard of a fake profile: from the assessment test alone, unless events are given. */
const standard = (code: string, status: StrandStatus, over: Partial<FakeStandard> = {}): FakeStandard => ({
  code,
  status,
  assessment: { correct: status === "secure" ? 4 : 1, total: 4, status },
  events: NO_EVENTS,
  evidence: { assessmentId: TEST, events: [] },
  ...over,
});

const TEST = "00000000-0000-4000-8000-0000000000e1";
const TEST_DONE = "2026-10-20T18:00:00.000Z";

const input = (over: Partial<PlanInput> = {}): PlanInput => ({
  profile: { assessment: { completedAt: TEST_DONE }, standards: [standard("2.4", "secure"), standard("3.1", "secure")] },
  grade: 3,
  level: LEVEL,
  taught: [],
  since: null,
  ...over,
});

const plan = (i: PlanInput): WorkbookPlan => {
  const result = planWorkbook(i);
  if (!result.ok) throw new Error(result.reason);
  return result.plan;
};

/** Every skill of these standards in the skill map. */
const skillsOf = (...codes: string[]) => BC_SKILL_MAP.standards.filter((s) => codes.includes(s.code)).flatMap((s) => s.skills.map((k) => k.id));

const pages = (p: WorkbookPlan) => p.days.flatMap((d) => d.pages.map((page) => ({ day: d.day, ...page })));

const WEAK = ["2.1", "2.2", "2.3", "2.4", "2.5", "2.6", "2.7", "2.8", "2.9", "2.10", "2.11", "2.12", "3.1", "3.4", "3.6", "3.7", "3.8", "3.9", "3.10", "3.11"];

describe("the two-week curriculum plan", () => {
  it("plans ten days, five a week", () => {
    const p = plan(input());
    expect(p.days.map((d) => [d.week, d.day])).toEqual([[1, 1], [1, 2], [1, 3], [1, 4], [1, 5], [2, 6], [2, 7], [2, 8], [2, 9], [2, 10]]);
    expect(p.level).toBe(11);
    for (const day of p.days) {
      expect(day.pages.length).toBeGreaterThan(0);
      for (const page of day.pages) expect(page.questions).toBe(page.difficulty.length);
    }
  });

  it("starts each new idea with a worked example, then practice the same day, in prerequisite order", () => {
    // A fraction of a set needs equal sharing, which needs equal groups: all three in this level, given out of order.
    const p = plan(input({ level: { number: 11, skills: [FRACTION_OF_SET, SHARING, GROUPS, ADD] } }));
    expect(p.newIdeas).toEqual([ADD, GROUPS, SHARING, FRACTION_OF_SET]);
    for (const skill of p.newIdeas) {
      const first = pages(p).find((page) => page.skills.includes(skill))!;
      expect(first).toMatchObject({ type: "new-idea", workedExample: true, skills: [skill] });
      const practice = pages(p).find((page) => page.type === "practice" && page.skills.includes(skill));
      expect(practice?.day).toBe(first.day);
    }
    // Only a new idea's page opens with a worked example.
    expect(pages(p).filter((page) => page.workedExample).every((page) => page.type === "new-idea")).toBe(true);
  });

  it("builds each new idea from easy to harder in small steps", () => {
    const p = plan(input());
    for (const skill of p.newIdeas) {
      const ladder = pages(p).filter((page) => page.type !== "review" && page.skills.includes(skill)).flatMap((page) => page.difficulty);
      expect(ladder[0]).toBe(1);
      expect(ladder.at(-1)).toBe(3);
      ladder.slice(1).forEach((d, i) => expect(d - ladder[i]).toBeGreaterThanOrEqual(0));
      ladder.slice(1).forEach((d, i) => expect(d - ladder[i]).toBeLessThanOrEqual(1));
    }
  });

  it("ends the level with a level test in one sitting when this workbook teaches its last new ideas", () => {
    // Two of the five skills were taught by the last workbook: the other three fit, so the level ends here.
    const ends = plan(input({ taught: [ADD, SUBTRACT] }));
    expect(ends.newIdeas).toEqual([WORDS, GROUPS, SHARING]);
    expect(ends.levelTest).toBe(true);
    const last = ends.days[9];
    expect(last.pages).toHaveLength(1);
    expect(last.pages[0]).toMatchObject({ type: "level-test", standards: ["3.3", "3.5"], skills: [ADD, SUBTRACT, WORDS, GROUPS, SHARING] });
    expect(last.pages[0].difficulty.every((d) => d === 2)).toBe(true);
    expect(pages(ends).filter((page) => page.type === "level-test")).toHaveLength(1);

    // Five new ideas fill the two weeks: the test waits for the next workbook.
    const goesOn = plan(input());
    expect(goesOn.newIdeas).toHaveLength(5);
    expect(goesOn.levelTest).toBe(false);
    expect(pages(goesOn).some((page) => page.type === "level-test")).toBe(false);

    // Every skill already taught: nine days of practice, then the test.
    const allTaught = plan(input({ taught: LEVEL.skills }));
    expect(allTaught.newIdeas).toEqual([]);
    expect(allTaught.days.map((d) => d.pages.at(-1)!.type)).toEqual([...Array(9).fill("stories"), "level-test"]);
  });

  it("reviews earlier skills every day, never today's new idea or a later one", () => {
    const p = plan(input({ taught: [ADD, SUBTRACT] }));
    const reviewed = new Set<string>();
    // Day 10 is the level test.
    for (const day of p.days.slice(0, 9)) {
      const earlier = new Set([ADD, SUBTRACT, ...skillsOf("2.4", "3.1"), ...p.newIdeas.filter((_, k) => 2 * k + 1 < day.day)]);
      const today = day.pages.find((page) => page.type === "new-idea")?.skills[0] ?? day.pages.find((page) => page.type === "step-up")?.skills[0];
      const review = day.pages.filter((page) => page.type === "review");
      expect(review).toHaveLength(1);
      expect(review[0].questions).toBeGreaterThanOrEqual(3);
      for (const skill of review[0].skills) {
        expect(earlier.has(skill), `day ${day.day} reviews ${skill}`).toBe(true);
        expect(skill).not.toBe(today);
        reviewed.add(skill);
      }
    }
    // Over the two weeks, the review comes back to every skill of the level learned before.
    for (const skill of [ADD, SUBTRACT, WORDS, GROUPS, SHARING]) expect(reviewed.has(skill), skill).toBe(true);

    // A child with nothing learned before: the review starts once there is an earlier skill.
    const fresh = plan(input({ profile: { assessment: null, standards: [] } }));
    expect(fresh.days.map((d) => d.pages.some((page) => page.type === "review"))).toEqual([false, false, ...Array(8).fill(true)]);
  });

  it("puts last time's wrong and right-with-help standards in a Fix it box, with new questions", () => {
    const LAST_WORKBOOK = "2026-11-02T00:00:00.000Z";
    const helped = standard("3.3", "developing", {
      assessment: null,
      events: { ...NO_EVENTS, right: 2, rightWithHelp: 2, hints: 3, stuckSteps: ["tens"], sources: { call: 2, marking: 2, assessment: 0 }, lastAt: "2026-11-05T17:00:00.000Z" },
      evidence: { assessmentId: null, events: ["e-1", "e-2", "e-3", "e-4"] },
    });
    const wrong = standard("2.4", "needs-attention", {
      events: { ...NO_EVENTS, wrong: 2, mistakes: ["O3"], sources: { call: 0, marking: 2, assessment: 0 }, lastAt: "2026-11-06T17:00:00.000Z" },
      evidence: { assessmentId: TEST, events: ["e-5", "e-6"] },
    });
    // Wrong before the last workbook, and not touched since: not last time's.
    const older = standard("3.1", "developing", {
      events: { ...NO_EVENTS, wrong: 1, sources: { call: 1, marking: 0, assessment: 0 }, lastAt: "2026-10-25T17:00:00.000Z" },
      evidence: { assessmentId: TEST, events: ["e-0"] },
    });
    const secure = standard("2.1", "secure", { events: { ...NO_EVENTS, right: 3, wrong: 1, lastAt: "2026-11-06T17:00:00.000Z" } });
    const p = plan(input({ since: LAST_WORKBOOK, taught: [ADD, SUBTRACT, WORDS], profile: { assessment: { completedAt: TEST_DONE }, standards: [helped, wrong, older, secure] } }));

    const boxes = pages(p).filter((page) => page.type === "fix-it");
    expect(boxes).toHaveLength(1);
    // Worst first; each standard keeps what went wrong and the questions it came from, so none is asked again.
    expect(boxes[0]).toMatchObject({
      day: 1,
      standards: ["2.4", "3.3"],
      fixIt: [
        { standard: "2.4", mistakes: ["O3"], stuckSteps: [], avoid: { assessmentId: TEST, events: ["e-5", "e-6"] } },
        { standard: "3.3", mistakes: [], stuckSteps: ["tens"], avoid: { assessmentId: null, events: ["e-1", "e-2", "e-3", "e-4"] } },
      ],
    });
    expect(boxes[0].questions).toBe(4);
    expect(boxes[0].fixIt!.every((item) => item.newQuestions)).toBe(true);
    expect(boxes[0].skills).toEqual(expect.arrayContaining([ADD, SUBTRACT, WORDS, ...skillsOf("2.4")]));

    // The first workbook: last time is the assessment, so its standards with wrong answers that are not secure.
    const first = plan(input({ profile: { assessment: { completedAt: TEST_DONE }, standards: [standard("2.4", "developing"), standard("2.1", "needs-attention"), standard("3.1", "secure")] } }));
    expect(pages(first).filter((page) => page.type === "fix-it").map((page) => page.standards)).toEqual([["2.1", "2.4"]]);
  });

  it("spreads a long Fix it list over the days, two standards a box, and keeps what does not fit for later", () => {
    const weak = WEAK;
    const p = plan(input({ taught: [ADD, SUBTRACT, WORDS], profile: { assessment: { completedAt: TEST_DONE }, standards: weak.map((code) => standard(code, "needs-attention")) } }));
    const boxes = pages(p).filter((page) => page.type === "fix-it");
    expect(boxes.map((page) => page.day)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(boxes.every((page) => page.standards.length === 2)).toBe(true);
    expect(boxes.flatMap((page) => page.standards)).toEqual(weak.slice(0, 18));
    expect(p.fixItLater).toEqual(weak.slice(18));
  });

  it("never plans a standard above the child's school grade as a weakness", () => {
    // A strong Grade 3 child working ahead in a Grade 4 level.
    const ahead = { number: 13, skills: ["4.1-place-value-10000", "4.1-compare-order-10000", "4.1-expanded-form"] };
    const p = plan(input({
      grade: 3,
      level: ahead,
      profile: { assessment: { completedAt: TEST_DONE }, standards: [standard("4.3", "needs-attention"), standard("4.2", "secure"), standard("3.3", "developing")] },
    }));
    const planned = new Set(pages(p).filter((page) => page.type !== "level-test").flatMap((page) => page.standards));
    expect(planned.has("4.3")).toBe(false);
    // Above the school grade but secure: fine to review. At the school grade and not secure: a weakness.
    expect(planned.has("4.2")).toBe(true);
    expect(pages(p).find((page) => page.type === "fix-it")?.standards).toEqual(["3.3"]);
  });

  it("keeps every day between 15 and 30 minutes", () => {
    const weak = { assessment: { completedAt: TEST_DONE }, standards: WEAK.map((code) => standard(code, "needs-attention")) };
    const cases: PlanInput[] = [
      input(),
      input({ profile: { assessment: null, standards: [] } }),
      input({ profile: weak }),
      input({ profile: weak, taught: [ADD, SUBTRACT, WORDS] }),
      input({ taught: LEVEL.skills }),
      input({ level: { number: 11, skills: [ADD] }, profile: { assessment: null, standards: [] } }),
    ];
    for (const c of cases) {
      for (const day of plan(c).days) {
        expect(day.minutes).toBe(day.pages.reduce((n, page) => n + page.minutes, 0));
        expect(day.minutes, `day ${day.day}`).toBeGreaterThanOrEqual(15);
        expect(day.minutes, `day ${day.day}`).toBeLessThanOrEqual(30);
      }
    }
  });

  it("gives a child with many weak standards fewer new ideas and practice days on the weakest", () => {
    const weak = ["2.1", "2.4", "3.1", "3.4"];
    const p = plan(input({ profile: { assessment: { completedAt: TEST_DONE }, standards: [...weak.map((code) => standard(code, "needs-attention")), standard("2.3", "developing")] } }));
    expect(p.newIdeas).toEqual([ADD, SUBTRACT, WORDS]);
    expect(p.levelTest).toBe(false);
    // The four days after the new ideas practise the weak standards, worst first.
    const practice = p.days.slice(6).map((d) => d.pages.find((page) => page.type === "practice")!.standards);
    expect(practice).toEqual([["2.1"], ["2.4"], ["3.1"], ["3.4"]]);

    // With few weak standards, the two weeks are new ideas.
    expect(plan(input({ profile: { assessment: { completedAt: TEST_DONE }, standards: weak.slice(0, 3).map((code) => standard(code, "needs-attention")) } })).newIdeas).toHaveLength(5);
  });

  it("gives the same plan for the same input, whatever order the lists come in", () => {
    const profile = { assessment: { completedAt: TEST_DONE }, standards: [standard("2.4", "developing"), standard("2.1", "needs-attention"), standard("3.1", "secure"), standard("2.3", "needs-attention")] };
    const one = input({ profile, taught: [ADD, SUBTRACT] });
    expect(plan(one)).toEqual(plan(one));
    const shuffled = input({
      profile: { ...profile, standards: [...profile.standards].reverse() },
      level: { number: 11, skills: [...LEVEL.skills].reverse() },
      taught: [SUBTRACT, ADD],
    });
    expect(JSON.stringify(plan(shuffled))).toBe(JSON.stringify(plan(one)));
    // Ties go by curriculum order: of two standards equally weak, the earlier comes first.
    expect(pages(plan(one)).find((page) => page.type === "fix-it")?.standards).toEqual(["2.1", "2.3"]);
  });

  it("refuses a level it cannot plan", () => {
    expect(planWorkbook(input({ level: { number: 31, skills: [ADD] } }))).toEqual({ ok: false, reason: "the level is not U1 to U30" });
    expect(planWorkbook(input({ level: { number: 11, skills: [] } }))).toEqual({ ok: false, reason: "the level has no skills" });
    expect(planWorkbook(input({ level: { number: 11, skills: [ADD, "3.3-juggling"] } }))).toEqual({ ok: false, reason: "3.3-juggling is not a skill of the BC skill map" });
    expect(planWorkbook(input({ taught: [GROUPING] }))).toEqual({ ok: false, reason: `${GROUPING} is not a skill of this level` });
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
    const p = plan(input({ profile, since: "2026-11-02T00:00:00.000Z" }));
    expect(pages(p).find((page) => page.type === "fix-it")).toMatchObject({
      standards: ["2.4"],
      fixIt: [{ standard: "2.4", stuckSteps: ["tens"], avoid: { assessmentId: null, events: [helped(3).id, helped(4).id] } }],
    });
  });
});
