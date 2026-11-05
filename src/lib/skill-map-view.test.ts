import { describe, expect, it } from "vitest";
import { BC_SKILL_MAP, type SkillTestResult, type StandardSkillState } from "@/lib/assessment";
import { skillMapView, skillWhy, type SkillMapViewInput } from "@/lib/skill-map-view";

// What a parent reads on the skill map: which standards show, under which area, and the plain line on each state.

const NEWER = "2026-10-30T18:00:00Z";
const OLDER = "2026-09-01T18:00:00Z";
const tally = (standard: string, correct: number, total: number, at = NEWER): SkillTestResult => ({ standard, correct, total, at });
const input = (over: Partial<SkillMapViewInput> = {}): SkillMapViewInput => ({
  firstName: "Leah", schoolGrade: 3, workingLevel: 3, tests: [], workbookStandards: [], workbookNumber: null, day: () => "October 30", ...over,
});
const tiles = (over: Partial<SkillMapViewInput> = {}) => skillMapView(input(over)).flatMap((a) => a.tiles);
const tile = (code: string, over: Partial<SkillMapViewInput> = {}) => tiles(over).find((t) => t.code === code)!;
const standardsAt = (grade: number) => BC_SKILL_MAP.standards.filter((s) => s.grade === grade).map((s) => s.code);

describe("which standards show", () => {
  it("shows every standard of the working level's grade, once, and no other grade", () => {
    expect(tiles().map((t) => t.code).sort()).toEqual(standardsAt(3).sort());
  });
  it("uses the working level, not the school grade", () => {
    expect(tiles({ schoolGrade: 3, workingLevel: 5 }).map((t) => t.code).sort()).toEqual(standardsAt(5).sort());
  });
  it("adds a standard of the current workbook from another grade, and marks its grade", () => {
    const view = tiles({ workbookStandards: ["2.1"], workbookNumber: 2 });
    expect(view.find((t) => t.code === "2.1")).toMatchObject({ grade: 2, state: "working_on" });
    expect(view.filter((t) => t.code === "2.1")).toHaveLength(1);
    expect(view).toHaveLength(standardsAt(3).length + 1);
  });
  it("leaves a code that is not a BC standard out", () => {
    expect(tiles({ workbookStandards: ["not-a-code"], workbookNumber: 1 }).map((t) => t.code)).not.toContain("not-a-code");
  });
  it("shows only the workbook's standards when there is no level", () => {
    expect(tiles({ workingLevel: null, workbookStandards: ["3.1", "3.2"], workbookNumber: 1 }).map((t) => t.code)).toEqual(["3.1", "3.2"]);
  });
  it("shows nothing with no level and no workbook", () => {
    expect(skillMapView(input({ workingLevel: null }))).toEqual([]);
  });
});

describe("the reported areas", () => {
  const names = (over: Partial<SkillMapViewInput>) => skillMapView(input(over)).map((a) => a.area);
  it("groups a Grade 3 child's map under the four areas, in the report's order", () => {
    expect(names({})).toEqual(["number", "fractions", "algebra", "shapes"]);
    expect(skillMapView(input())[0].name).toBe("Number and operations");
  });
  it("gives Kindergarten to Grade 2 three areas, with no fractions", () => {
    for (const schoolGrade of [0, 1, 2] as const) expect(names({ schoolGrade, workingLevel: schoolGrade })).toEqual(["number", "algebra", "shapes"]);
  });
  it("keeps three areas for a Grade 2 child working above Grade 2", () => {
    expect(names({ schoolGrade: 2, workingLevel: 4 })).toEqual(["number", "algebra", "shapes"]);
  });
  it("shows a fraction standard to a Grade 2 child only when the current workbook has it", () => {
    const view = skillMapView(input({ schoolGrade: 2, workingLevel: 4, workbookStandards: ["4.3"], workbookNumber: 1 }));
    expect(view.map((a) => a.area)).toEqual(["number", "fractions", "algebra", "shapes"]);
    expect(view[1].tiles.map((t) => t.code)).toEqual(["4.3"]);
  });
  it("puts a standard under the area its strand reports to", () => {
    const view = skillMapView(input());
    expect(view.find((a) => a.area === "number")?.tiles.map((t) => t.code)).toContain("3.5");
    expect(view.find((a) => a.area === "shapes")?.tiles.map((t) => t.code)).toContain("3.12");
  });
});

describe("each tile's state and its line", () => {
  it("Mastered: every answer right, with the test's day", () => {
    expect(tile("3.1", { tests: [tally("3.1", 2, 2)] })).toMatchObject({ state: "mastered", why: "Leah got every question on this right on the test on October 30." });
  });
  it("Not started: one right answer alone", () => {
    expect(tile("3.1", { tests: [tally("3.1", 1, 1)] })).toMatchObject({ state: "not_started", why: "The test asked too few questions on this to say yet." });
  });
  it("Not started: most answers right, but not every one", () => {
    expect(tile("3.1", { tests: [tally("3.1", 9, 10)] })).toMatchObject({ state: "not_started", why: "Leah got most questions on this right on the test, but not every one." });
  });
  it("Not started: some answers right", () => {
    expect(tile("3.1", { tests: [tally("3.1", 3, 5)] })).toMatchObject({ state: "not_started", why: "Leah got some questions on this right on the test, but not every one." });
  });
  it("Not started: the test did not ask it", () => {
    expect(tile("3.1")).toMatchObject({ state: "not_started", why: "The test did not ask about this." });
    expect(tile("3.1", { workbookStandards: ["3.2"], workbookNumber: 2 }).why).toBe("The test did not ask about this, and it is not in Workbook 2.");
  });
  it("Working on: in the current workbook", () => {
    expect(tile("3.1", { workbookStandards: ["3.1"], workbookNumber: 2 })).toMatchObject({ state: "working_on", why: "This skill is in Workbook 2, Leah's current workbook." });
  });
  it("Mastered stays above Working on", () => {
    expect(tile("3.1", { tests: [tally("3.1", 2, 2)], workbookStandards: ["3.1"], workbookNumber: 2 }).state).toBe("mastered");
  });
  it("Needs review: Needs attention with Clear certainty on the test", () => {
    expect(tile("3.1", { tests: [tally("3.1", 0, 4)] })).toMatchObject({ state: "needs_review", why: "Leah's test showed that this needs more practice." });
  });
  it("Needs review: was Mastered, then a mistake on a newer test", () => {
    expect(tile("3.1", { tests: [tally("3.1", 2, 2, OLDER), tally("3.1", 1, 2)] })).toMatchObject({ state: "needs_review", why: "Leah had mastered this, then made a mistake on it on a newer test." });
  });
  it("above the school grade a low result is not a weakness (D-108)", () => {
    expect(tile("4.1", { workingLevel: 4, tests: [tally("4.1", 0, 4)] })).toMatchObject({ state: "not_started", why: "This is above Leah's school grade, so a mistake here is not a weakness." });
  });
  it("words the reasons that come only from marked pages", () => {
    const state = (over: Partial<StandardSkillState>): StandardSkillState => ({ standard: "3.1", state: "mastered", reason: "held_on_review", evidence: "pages", evidenceAt: NEWER, ...over });
    const context = { firstName: "Leah", workbookNumber: 2, day: () => "October 30" };
    expect(skillWhy(state({}), context)).toBe("Leah got this right on marked pages, and right again on a later review.");
    expect(skillWhy(state({ state: "needs_review", reason: "failed_review" }), context)).toBe("Leah had mastered this, then made a mistake on it on a marked page.");
  });
  it("says only one of the four states, and never she, her, a percent or a count of wrong answers", () => {
    const every = tiles({ tests: [tally("3.1", 2, 2), tally("3.2", 1, 1), tally("3.3", 9, 10), tally("3.4", 3, 5), tally("3.5", 0, 4)], workbookStandards: ["3.6"], workbookNumber: 1 });
    expect(new Set(every.map((t) => t.state))).toEqual(new Set(["mastered", "not_started", "working_on", "needs_review"]));
    for (const t of every) expect(t.why, t.code).not.toMatch(/\b(she|her|hers)\b|%|\d+ (wrong|of \d+)/i);
  });
});

describe("the panel's sections", () => {
  it("names the standard in the map's words, with a capital letter", () => {
    const map = BC_SKILL_MAP.standards.find((s) => s.code === "3.1")!;
    expect(tile("3.1").name).toBe(`${map.text[0].toUpperCase()}${map.text.slice(1)}`);
  });
  it("lists the skills inside the standard, from the skill map", () => {
    expect(tile("3.1").skills).toEqual(BC_SKILL_MAP.standards.find((s) => s.code === "3.1")!.skills.map((k) => k.text));
  });
  const buildingOn3_1 = BC_SKILL_MAP.standards.filter((s) => s.code !== "3.1" && s.skills.some((k) => k.requires.some((r) => r.startsWith("3.1-"))));
  it("after Mastered, names what builds on it, the same strand first, at most three", () => {
    const next = tile("3.3", { tests: [tally("3.3", 2, 2)] }).next;
    // 3.3 and 4.4 share a strand; 3.9 (measurement) is taught a grade earlier, but in another strand.
    const sameStrand = next.indexOf("Addition and subtraction to 10 000");
    const otherStrand = next.indexOf("Measurement, using standard units (linear, mass, and capacity)");
    expect(sameStrand).toBeGreaterThanOrEqual(0);
    expect(otherStrand).toBeGreaterThan(sameStrand);
    expect(next.length).toBeLessThanOrEqual(3);
    expect(buildingOn3_1.length).toBeGreaterThan(0);
  });
  it("names it for Working on too", () => {
    expect(tile("3.1", { workbookStandards: ["3.1"], workbookNumber: 1 }).next.length).toBeGreaterThan(0);
  });
  it("leaves out a next skill that is already Mastered", () => {
    const first = buildingOn3_1[0];
    const next = tile("3.1", { tests: [tally("3.1", 2, 2), tally(first.code, 2, 2)] }).next;
    expect(next.map((n) => n.toLowerCase())).not.toContain(first.text.toLowerCase());
  });
  it("has nothing next for Not started or Needs review: code does not know it", () => {
    expect(tile("3.1").next).toEqual([]);
    expect(tile("3.1", { tests: [tally("3.1", 0, 4)] }).next).toEqual([]);
  });
});
