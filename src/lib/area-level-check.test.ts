import { describe, expect, it } from "vitest";
import { checkAreaLevels, reportShowsPlacement, type CheckedTest } from "@/lib/area-level-check";
import type { AreaAnswer, Level, Placement, ReportedStrand, StrandResult } from "@/lib/assessment";

const at = (area: ReportedStrand, level: Level, right: number, total: number): AreaAnswer[] =>
  Array.from({ length: total }, (_, i) => ({ area, level, correct: i < right }));

const strand = (s: ReportedStrand, status: StrandResult["status"], correct: number, total: number): StrandResult => ({ strand: s, status, correct, total });

// A placement holding only what the check reads, with levels and areas counted from the answers it is given.
function placement(grade: Level, workingLevel: Level, answers: AreaAnswer[], strands: StrandResult[]): Placement {
  const levels = [...new Set(answers.map((a) => a.level))].sort((a, b) => a - b).map((level) => {
    const here = answers.filter((a) => a.level === level);
    return { level, correct: here.filter((a) => a.correct).length, total: here.length };
  });
  return { grade, workingLevel, levels, strands } as unknown as Placement;
}

const test = (id: string, grade: Level, workingLevel: Level, answers: AreaAnswer[], strands: StrandResult[], group: CheckedTest["group"] = "real"): CheckedTest => ({
  id, group, answers, placement: placement(grade, workingLevel, answers, strands),
});

describe("the area level check", () => {
  it("counts labels and reports no disagreement when the bars match the report", () => {
    const answers = [...at("number", 3, 5, 5), ...at("number", 4, 5, 5), ...at("algebra", 3, 4, 5)];
    const r = checkAreaLevels([test("a", 3, 4, answers, [strand("number", "secure", 5, 5), strand("algebra", "secure", 4, 5)])]);
    expect(r.groups.real).toMatchObject({ tests: 1, bars: 2, labels: { ahead: 1, "at-grade": 1, "building-up": 0 } });
    expect(r.groups.real.crossTab).toEqual({ "ahead/secure": 1, "at-grade/secure": 1 });
    expect(r.disagreements).toEqual([]);
    expect(r.inputMismatches).toEqual([]);
  });

  it("marks Building up beside a Secure report as a possible invented weakness", () => {
    // 3 of 3 is too few, so the bar falls back to a low overall level while the report says Secure.
    const answers = at("number", 3, 3, 3);
    const r = checkAreaLevels([test("a", 3, 2, answers, [strand("number", "secure", 3, 3)])]);
    expect(r.disagreements).toEqual([{ id: "a", group: "real", area: "number", kind: "invented-weakness", label: "building-up", status: "secure", basis: "overall", certainty: "early-sign", gradesFromSchool: -1, unreliable: false, correct: 3, total: 3 }]);
  });

  it("marks a bar at or above the grade beside a weaker report as overstated", () => {
    // A hole at the school grade with a clear grade above: the report counts only the school grade and below.
    const hole = [...at("number", 3, 1, 5), ...at("number", 4, 5, 5)];
    const atGrade = [...at("algebra", 3, 3, 4), ...at("algebra", 2, 0, 4)];
    const r = checkAreaLevels([test("a", 3, 3, [...hole, ...atGrade], [strand("number", "needs-attention", 1, 5), strand("algebra", "needs-attention", 3, 8)])]);
    expect(r.disagreements.map((d) => [d.area, d.kind, d.label, d.status])).toEqual([
      ["number", "overstated", "ahead", "needs-attention"],
      ["algebra", "overstated", "at-grade", "needs-attention"],
    ]);
  });

  it("marks Ahead beside Developing as overstated, and leaves Developing with At grade or Building up alone", () => {
    const answers = [...at("number", 3, 3, 5), ...at("number", 4, 5, 5), ...at("algebra", 3, 3, 4), ...at("shapes", 2, 4, 4), ...at("shapes", 3, 1, 4)];
    const r = checkAreaLevels([test("a", 3, 3, answers, [strand("number", "developing", 3, 5), strand("algebra", "developing", 3, 4), strand("shapes", "developing", 5, 8)])]);
    expect(r.disagreements.map((d) => [d.area, d.kind])).toEqual([["number", "overstated"]]);
  });

  it("marks a bar with no report status: its answers are all above the school grade", () => {
    const answers = at("number", 4, 4, 4);
    const r = checkAreaLevels([test("a", 3, 3, answers, [])]);
    expect(r.disagreements.map((d) => [d.kind, d.status])).toEqual([["no-status", "none"]]);
    expect(r.groups.real.crossTab).toEqual({ "ahead/none": 1 });
  });

  it("names a test whose answers do not add up to its stored placement", () => {
    const stored = placement(3, 3, at("number", 3, 5, 5), [strand("number", "secure", 5, 5)]);
    const wrongLevels: CheckedTest = { id: "levels", group: "real", answers: at("number", 3, 4, 5), placement: stored };
    const wrongAreas: CheckedTest = { id: "areas", group: "real", answers: at("number", 3, 5, 5), placement: { ...stored, strands: [strand("number", "secure", 4, 5)] } };
    const missing: CheckedTest = { id: "missing", group: "real", answers: at("number", 3, 5, 5), placement: { ...stored, strands: [] } };
    expect(checkAreaLevels([wrongLevels, wrongAreas, missing]).inputMismatches).toEqual(["levels", "areas", "missing"]);
  });

  it("does not call a level the score left out wholly a mismatch", () => {
    const stored = placement(3, 3, at("number", 3, 5, 5), [strand("number", "secure", 5, 5)]);
    const withEmpty: Placement = { ...stored, levels: [{ level: 2, correct: 0, total: 0 }, ...stored.levels] };
    expect(checkAreaLevels([{ id: "a", group: "real", answers: at("number", 3, 5, 5), placement: withEmpty }]).inputMismatches).toEqual([]);
  });

  it("names a test the report calls unreliable, on its bars and in its fallback count", () => {
    const answers = at("number", 3, 3, 3);
    const t = test("a", 3, 2, answers, [strand("number", "secure", 3, 3)]);
    const flagged: CheckedTest = { ...t, placement: { ...t.placement, pace: { veryFast: 30, answers: 36, leftOut: [], unreliable: true } } };
    const r = checkAreaLevels([flagged, test("b", 3, 2, answers, [strand("number", "secure", 3, 3)])]);
    expect(r.disagreements.map((d) => [d.id, d.unreliable])).toEqual([["a", true], ["b", false]]);
    expect(r.groups.real.basis.overall).toBe(2);
    expect(r.groups.real.overallOnUnreliable).toBe(1);
  });

  it("keeps the groups apart", () => {
    const answers = at("number", 3, 4, 4);
    const strands = [strand("number", "secure", 4, 4)];
    const r = checkAreaLevels([test("a", 3, 3, answers, strands), test("b", 3, 3, answers, strands, "test-family"), test("c", 3, 3, answers, strands, "copy-real")]);
    expect(r.groups.real.tests).toBe(1);
    expect(r.groups["test-family"].tests).toBe(1);
    expect(r.groups["copy-real"].tests).toBe(1);
    expect(r.groups["copy-test-family"].tests).toBe(0);
  });
});

describe("whether a stored report shows the stored score", () => {
  const stored = { ...placement(4, 4, at("number", 4, 5, 5), [strand("number", "secure", 5, 5)]), confidence: "normal", atCeiling: false } as Placement;
  const model = (p: Placement) => ({
    level: { working: p.workingLevel, grade: p.grade, atCeiling: p.atCeiling, confidence: p.confidence },
    strands: p.strands.map((s) => ({ ...s, name: s.strand })),
  });
  it("does when the report was made from it", () => {
    expect(reportShowsPlacement(model(stored), stored)).toBe(true);
  });
  it("does not after a rescore: another level, confidence, ceiling, area status or area count", () => {
    expect(reportShowsPlacement(model({ ...stored, workingLevel: 0 }), stored)).toBe(false);
    expect(reportShowsPlacement(model({ ...stored, confidence: "low" }), stored)).toBe(false);
    expect(reportShowsPlacement(model({ ...stored, atCeiling: true }), stored)).toBe(false);
    expect(reportShowsPlacement(model({ ...stored, strands: [strand("number", "developing", 5, 5)] }), stored)).toBe(false);
    expect(reportShowsPlacement(model({ ...stored, strands: [strand("number", "secure", 4, 5)] }), stored)).toBe(false);
    expect(reportShowsPlacement(model({ ...stored, strands: [] }), stored)).toBe(false);
  });
});
