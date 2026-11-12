import { describe, expect, it } from "vitest";
import { BC_SKILL_MAP, REPORTED_STRAND, strandCertainty, strandStatus, type Grade } from "@/lib/assessment";
import { childProfileFacts, type ChildLearnerProfile } from "@/lib/child-profile";
import { curriculumFor } from "@/lib/workbook-curriculum";
import { EMPTY_INSTRUCTIONS, instructionPicker, instructionsEmpty, instructionsProblem, workbookInstructions, type WorkbookInstructions } from "@/lib/workbook-instructions";
import { PLACEMENT_CEILING, planNextWorkbook, type PersonalWorkbookPlan, type PlacementInput } from "@/lib/workbook-placement";
import { dayDifficulty, type PlanInput } from "@/lib/workbook-plan";
import { workbookWhy } from "@/lib/workbook-why";
import { workbookCoverLine } from "@/lib/workbook-cover-line";
import { firstCustomerProfile } from "@/lib/workbook-sample-profiles";

const BC = curriculumFor("bc")!;
const set = (over: Partial<WorkbookInstructions>): WorkbookInstructions => ({ ...EMPTY_INSTRUCTIONS, ...over });

/** The first customer's profile with these standards (code, right, asked) and this working level. */
function profileWith(standards: readonly [string, number, number][], working: Grade = 4, grade: Grade = 4): ChildLearnerProfile {
  const original = firstCustomerProfile().assessment!.profile;
  original.level = { working, certainty: "clear", confidence: "normal", atCeiling: false };
  original.test.grade = grade;
  original.standards = standards.map(([code, correct, total]) => {
    const s = BC_SKILL_MAP.standards.find(s => s.code === code)!;
    return { code, text: s.text, grade: s.grade, strand: REPORTED_STRAND[s.strand], aboveGrade: s.grade > grade, correct, total, status: strandStatus(correct, total), certainty: strandCertainty(correct, total) };
  });
  original.strengths = original.standards.filter(s => s.status === "secure");
  original.struggles = original.standards.filter(s => !s.aboveGrade && s.status !== "secure").map(s => ({ ...s, wrong: [], misconceptions: [] }));
  return childProfileFacts({ grade, learning: null, events: [], assessment: { assessmentId: "", completedAt: null, buildId: null, profile: original } })!;
}

function plan(o: Partial<PlacementInput> & { instructions?: WorkbookInstructions | null }, number = 1, capture?: (i: PlanInput) => void): PersonalWorkbookPlan {
  const result = planNextWorkbook({ curriculum: BC, grade: 4, profile: firstCustomerProfile(), workbooks: [], ...o, number }, capture);
  if (!result.ok) throw new Error(result.reason);
  return result.plan;
}
const outcome = (p: PersonalWorkbookPlan, section: string, value: string) => p.instructions?.outcomes.find(o => o.section === section && o.value === value);
const checks = (p: PersonalWorkbookPlan, unit: string) => p.days.flatMap(d => d.pages.flatMap(pg => pg.parts.flatMap(part =>
  (part.weakChecks ?? []).filter(c => c.unit === unit && c.skills.length).map(c => ({ day: d.day, kind: part.kind, items: c.items })))));
const firstDay = (p: PersonalWorkbookPlan, unit: string) => p.newSteps.find(s => s.unit === unit)?.day;

describe("workbookInstructions", () => {
  it("keeps known topics once, in order, and refuses a wrong shape", () => {
    expect(workbookInstructions({ startLevel: "U19", teachMore: ["5.12", "5.12", "5.1"], difficulty: "harder" }))
      .toEqual({ version: 1, startLevel: "U19", teachMore: ["5.12", "5.1"], teachLess: [], addReview: [], difficulty: "harder" });
    for (const bad of [null, [], { startLevel: "U31" }, { startLevel: "19" }, { teachMore: ["9.99"] }, { addReview: "4.5" }, { difficulty: "easy" }, { version: 2 },
      { teachLess: Array.from({ length: 9 }, (_, i) => `4.${i + 1}`) }]) expect(workbookInstructions(bad), JSON.stringify(bad)).toBeNull();
  });
  it("tells an empty set and a set that cannot be saved", () => {
    expect(instructionsEmpty(EMPTY_INSTRUCTIONS)).toBe(true);
    expect(instructionsEmpty(set({ addReview: ["4.5"] }))).toBe(false);
    expect(instructionsProblem(set({ startLevel: "U28" }), PLACEMENT_CEILING)).toMatch(/at most U27/);
    expect(instructionsProblem(set({ teachMore: ["5.12"], teachLess: ["5.12"] }), PLACEMENT_CEILING)).toMatch(/both/);
    expect(instructionsProblem(set({ startLevel: "U27", teachMore: ["5.12"] }), PLACEMENT_CEILING)).toBeNull();
  });
  it("offers levels up to the ceiling, with the units code can review", () => {
    const levels = instructionPicker(BC, PLACEMENT_CEILING);
    expect(levels.map(l => l.id)).toEqual(Array.from({ length: 27 }, (_, i) => `U${i + 1}`));
    expect(levels.find(l => l.id === "U16")!.units.map(u => u.code)).toEqual([...BC.level("U16")!.units]);
    expect(levels.find(l => l.id === "U14")!.units.find(u => u.code === "4.5")).toMatchObject({ title: expect.any(String), reviewable: true });
  });
});

describe("book instructions in the plan", () => {
  it("leaves the plan unchanged with no instructions or an empty set", () => {
    const captured: PlanInput[] = [];
    const before = plan({});
    expect(plan({ instructions: EMPTY_INSTRUCTIONS }, 1, i => captured.push(i))).toEqual(before);
    expect(plan({ instructions: null })).toEqual(before);
    expect(before.instructions).toBeUndefined();
    expect(captured[0]).not.toHaveProperty("instructions");
  });

  it("start level replaces the automatic placement and records both", () => {
    const captured: PlanInput[] = [];
    const p = plan({ instructions: set({ startLevel: "U19" }) }, 1, i => captured.push(i));
    expect(p.level).toBe(19);
    expect(p.personal?.start).toMatchObject({ rule: "I1", level: "U19" });
    expect(outcome(p, "start-level", "U19")).toMatchObject({ applied: true, note: expect.stringContaining("automatic U16") });
    expect(p.instructions?.instructions).toEqual(set({ startLevel: "U19" }));
    expect(captured[0].instructions).toEqual({ teachMore: [], teachLess: [], addReview: [], weakBelowChecks: true });
    // The cover makes no claim that the assessment showed this level.
    expect(workbookCoverLine(p, "Leah", 1)).toMatch(/^This book gives Leah practice with /);
    expect(workbookWhy(p)!.start).toMatch(/team instruction/);
  });

  it("start level stays inside the ceiling and Kindergarten keeps U1", () => {
    const high = plan({ instructions: set({ startLevel: "U28" }) });
    expect(high.level).toBe(16);
    expect(outcome(high, "start-level", "U28")).toMatchObject({ applied: false, note: expect.stringMatching(/above U27, the highest level a book can start at.*automatic U16/) });
    const k = planNextWorkbook({ curriculum: BC, grade: 0, profile: null, workbooks: [], number: 1, instructions: set({ startLevel: "U4" }) });
    expect(k.ok && k.plan.level).toBe(1);
    expect(k.ok && k.plan.instructions?.outcomes[0]).toMatchObject({ applied: false, note: expect.stringMatching(/Kindergarten starts at U1/) });
  });

  it("start level applies to a later book too, counted in its own level", () => {
    const p = plan({ workbooks: [{ number: 1, levels: [13] }], instructions: set({ startLevel: "U16" }) }, 2);
    expect(p.level).toBe(16);
    expect(p.personal?.start).toMatchObject({ rule: "I1" });
    const again = plan({ workbooks: [{ number: 1, levels: [13] }, { number: 2, levels: [16] }], instructions: set({ startLevel: "U16" }) }, 3);
    expect(again.level).toBe(16);
  });

  it("a higher start keeps one level and checks the clear gap below it (P6), with no support slot", () => {
    const profile = profileWith([["3.3", 0, 2]], 4);
    const auto = plan({ profile });
    expect(auto.units.support).toBe("3.3");
    const p = plan({ profile, instructions: set({ startLevel: "U16" }) });
    expect(p.level).toBe(16);
    expect(p.units.support).toBeNull();
    expect(new Set(p.newSteps.map(s => BC.unit(s.unit)!.level))).toEqual(new Set(["U16"]));
    expect(checks(p, "3.3")).toEqual([{ day: 2, kind: "remember-these", items: 2 }, { day: 3, kind: "remember-these", items: 2 }, { day: 4, kind: "remember-these", items: 2 }, { day: 5, kind: "friday-5", items: 1 }]);
    expect(outcome(p, "start-level", "3.3")).toMatchObject({ applied: true });
  });

  it("add review gives topics below the level the P6 checks; removing it removes them", () => {
    const p = plan({ instructions: set({ addReview: ["4.5", "4.14"] }) });
    for (const code of ["4.5", "4.14"]) {
      expect(checks(p, code)).toEqual([{ day: 2, kind: "remember-these", items: 2 }, { day: 3, kind: "remember-these", items: 2 }, { day: 4, kind: "remember-these", items: 2 }, { day: 5, kind: "friday-5", items: 1 }]);
      expect(outcome(p, "add-review", code)?.applied).toBe(true);
    }
    expect(checks(plan({}), "4.5")).toEqual([]);
    expect(workbookWhy(p)!.pages.flatMap(x => x.choices).some(c => c.startsWith("Review the team asked for"))).toBe(true);
    // The teaching does not change: same steps on the same days.
    expect(p.newSteps).toEqual(plan({}).newSteps);
  });

  it("add review refuses topics of this level or later, and above-grade topics that are not secure (D-084)", () => {
    const p = plan({ instructions: set({ addReview: ["5.5", "6.1"] }) });
    expect(outcome(p, "add-review", "5.5")).toMatchObject({ applied: false, note: expect.stringMatching(/taught in this book's level/) });
    expect(outcome(p, "add-review", "6.1")).toMatchObject({ applied: false, note: expect.stringMatching(/taught in this book's level/) });
    const ahead = plan({ instructions: set({ startLevel: "U19", addReview: ["5.13"] }) });
    expect(outcome(ahead, "add-review", "5.13")).toMatchObject({ applied: false, note: expect.stringMatching(/above the school grade and not secure/) });
    expect(checks(ahead, "5.13")).toEqual([]);
  });

  it("add review drops the last topics that have no room, never the book", () => {
    const codes = ["4.1", "4.2", "4.3", "4.4", "4.5", "4.6", "4.7", "4.8"];
    const p = plan({ instructions: set({ addReview: codes }) });
    const kept = codes.filter(c => outcome(p, "add-review", c)?.applied);
    expect(kept.length).toBeGreaterThan(0);
    expect(kept).toEqual(codes.slice(0, kept.length));
    for (const c of codes.slice(kept.length)) expect(outcome(p, "add-review", c)).toMatchObject({ applied: false, note: expect.stringMatching(/No room/) });
    expect(p.instructions?.outcomes.filter(o => o.section === "add-review").map(o => o.value)).toEqual(codes);
  });

  it("add review needs a finished assessment", () => {
    const p = plan({ profile: null, instructions: set({ addReview: ["4.5"], difficulty: "harder" }) });
    expect(outcome(p, "add-review", "4.5")).toMatchObject({ applied: false, note: expect.stringMatching(/assessment/) });
    expect(outcome(p, "difficulty", "harder")).toMatchObject({ applied: false });
  });

  it("teach more puts the unit first with the extra practice page on its first day", () => {
    const auto = plan({});
    expect(firstDay(auto, "5.12")).toBeUndefined();
    const p = plan({ instructions: set({ teachMore: ["5.12"] }) });
    expect(firstDay(p, "5.12")).toBe(1);
    expect(p.days[0].pages.filter(pg => pg.weakPractice === "5.12")).toHaveLength(1);
    expect(p.days.map(d => d.pages.length)).toEqual(auto.days.map(d => d.pages.length));
    expect(outcome(p, "teach-more", "5.12")).toMatchObject({ applied: true, note: expect.stringContaining("extra practice page") });
  });

  it("teach more teaches a clear secure unit that would be skipped", () => {
    const profile = profileWith([["5.1", 4, 4]], 5, 5);
    const auto = plan({ profile, grade: 5 });
    expect(firstDay(auto, "5.1")).toBeUndefined();
    const p = plan({ profile, grade: 5, instructions: set({ teachMore: ["5.1"] }) });
    expect(firstDay(p, "5.1")).toBe(1);
  });

  it("explains why a secure own-level unit has no review in book 1 (#755)", () => {
    const profile = profileWith([["5.1", 4, 4]], 5, 5);
    const p = plan({ profile, grade: 5 });
    expect(p.level).toBe(16);
    expect(p.newSteps.some(s => s.unit === "5.1")).toBe(false);
    expect(p.personal?.notReviewed?.find(x => x.unit === "5.1")).toMatchObject({
      reason: "not reviewed: secure on the assessment; no review scheduled in this book",
    });
    const skipped = p.personal!.notReviewed!.find(x => x.unit === "5.1")!.skills;
    const reviews = p.days.flatMap(d => d.pages.flatMap(pg => pg.parts.flatMap(part => part.reviewSteps ?? [])));
    expect(reviews.some(review => skipped.includes(review.skill))).toBe(false);
  });

  it("teach more and teach less refuse units outside the level, warm-up units and a unit in both", () => {
    const p = plan({ instructions: set({ teachMore: ["4.5", "5.8", "5.10"], teachLess: ["5.10"] }) });
    expect(outcome(p, "teach-more", "4.5")).toMatchObject({ applied: false, note: expect.stringMatching(/not a unit of this book's level, U16/) });
    expect(outcome(p, "teach-more", "5.8")).toMatchObject({ applied: false, note: expect.stringMatching(/warm-up/) });
    expect(outcome(p, "teach-more", "5.10")).toMatchObject({ applied: false, note: expect.stringMatching(/both/) });
    expect(outcome(p, "teach-less", "5.10")).toMatchObject({ applied: false, note: expect.stringMatching(/both/) });
    expect(p.newSteps).toEqual(plan({}).newSteps);
  });

  it("teach less: the unit is not taught and keeps its review questions", () => {
    // The first customer's test found 5.1 secure (early sign), so a first book would teach it; Teach less reviews it instead.
    const auto = plan({});
    expect(auto.newSteps.some(s => s.unit === "5.1")).toBe(true);
    const p = plan({ instructions: set({ teachLess: ["5.1"] }) });
    expect(p.newSteps.some(s => s.unit === "5.1")).toBe(false);
    expect(checks(p, "5.1")).toEqual([{ day: 2, kind: "remember-these", items: 2 }, { day: 3, kind: "remember-these", items: 2 }, { day: 4, kind: "remember-these", items: 2 }, { day: 5, kind: "friday-5", items: 1 }]);
    expect(p.personal?.notReviewed?.some(x => x.unit === "5.1")).toBe(false);
    expect(outcome(p, "teach-less", "5.1")).toMatchObject({ applied: true, note: expect.stringContaining("Review only") });
    expect(p.testWorkbook).toBe(false);
  });

  it("teach less refuses a unit with nothing to review or no room for its checks, and teaches it as usual", () => {
    // 5.9 is not secure in the first customer's test and has not been taught: there is nothing to review.
    const all = ["5.1", "5.5", "5.9", "5.10", "5.12", "5.17"];
    const p = plan({ instructions: set({ teachLess: all }) });
    expect(outcome(p, "teach-less", "5.9")).toMatchObject({ applied: false, note: expect.stringMatching(/nothing to review. It is taught as usual/) });
    expect(outcome(p, "teach-less", "5.17")).toMatchObject({ applied: false, note: expect.stringMatching(/^No room.*taught as usual/) });
    for (const o of p.instructions!.outcomes) {
      // Applied means review questions are in the book; not applied means the unit is taught.
      expect(checks(p, o.value)).toHaveLength(o.applied ? 4 : 0);
      if (o.applied) expect(p.newSteps.some(s => s.unit === o.value)).toBe(false);
    }
    expect(p.instructions!.outcomes.map(o => o.value)).toEqual(all);
    // Without a test, nothing is known secure: every unit is still taught.
    const noTest = plan({ profile: null, instructions: set({ teachLess: ["5.1"] }) });
    expect(outcome(noTest, "teach-less", "5.1")).toMatchObject({ applied: false });
    expect(noTest.newSteps).toEqual(plan({ profile: null }).newSteps);
  });

  it("instruction reasons are plain words, with no rule or decision ids", () => {
    const sets = [set({ startLevel: "U19", addReview: ["5.13", "3.3"], teachLess: ["5.1", "5.9"], difficulty: "harder" }), set({ startLevel: "U28" }), set({ teachMore: ["4.5", "5.8", "5.12"], teachLess: ["5.12"] })];
    const notes = sets.flatMap(i => plan({ instructions: i }).instructions!.outcomes.map(o => o.note));
    const k = planNextWorkbook({ curriculum: BC, grade: 0, profile: null, workbooks: [], number: 1, instructions: set({ startLevel: "U4", teachLess: ["K.1"] }) });
    if (k.ok) notes.push(...(k.plan.instructions?.outcomes.map(o => o.note) ?? []));
    expect(notes.length).toBeGreaterThan(5);
    for (const note of notes) expect(note).not.toMatch(/\b(P\d+[a-z]?|I1|D-\d+|rule)\b/);
  });

  it("difficulty replaces the automatic stretch", () => {
    // The first customer is above grade and at the ceiling: the automatic stretch is 2 days and a hard Challenge.
    const usual = plan({ instructions: set({ difficulty: "usual" }) });
    expect(usual.days.map(d => d.difficulty!.numberRange)).toEqual(usual.days.map(d => dayDifficulty(16, d.day).numberRange));
    expect(usual.days.flatMap(d => d.pages.flatMap(p => p.parts)).some(p => p.templateDifficulty === "hard")).toBe(false);
    const onLevel = profileWith([["4.1", 2, 2]], 4);
    expect(plan({ profile: onLevel }).personal?.adjustments.stretchShift).toBe(0);
    const harder = plan({ profile: onLevel, instructions: set({ difficulty: "harder" }) });
    expect(harder.days[0].difficulty!.numberRange).toEqual(dayDifficulty(13, 3).numberRange);
    expect(harder.days.flatMap(d => d.pages.flatMap(p => p.parts)).filter(p => p.kind === "challenge").every(p => p.templateDifficulty === "hard")).toBe(true);
    expect(outcome(harder, "difficulty", "harder")?.applied).toBe(true);
  });

  it("is the same plan for the same input", () => {
    const i = set({ startLevel: "U17", teachMore: ["5.6"], addReview: ["4.5"], difficulty: "harder" });
    expect(plan({ instructions: i })).toEqual(plan({ instructions: structuredClone(i) }));
  });
});
