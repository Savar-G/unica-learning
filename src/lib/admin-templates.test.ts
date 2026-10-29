import { describe, expect, it } from "vitest";
import { BANKS, BC_SKILL_MAP, type Level, type Strand, type Template } from "@/lib/assessment";
import { WRONG_SHOWN, adminTemplatePath, parseTemplateFilters, skillMapStandardPath, templateStats, templateTable, type AnswerFact, type TemplateStat } from "@/lib/admin-templates";

const answer = (over: Partial<AnswerFact> = {}): AnswerFact => ({
  templateId: "add-within-10",
  correct: true,
  timeMs: 10_000,
  response: "7",
  misconception: null,
  grade: 2,
  province: "BC",
  testFamily: false,
  ...over,
});

const ALL = { withTests: false, grade: null, province: null } as const;

describe("templateStats", () => {
  it("counts an unanswered served question without changing answer accuracy or time", () => {
    const rows = [answer(), answer({ correct: null, response: null, timeMs: null })];
    const stats = templateStats(rows, ALL);
    expect(stats[0]).toMatchObject({ shown: 2, answered: 1, correct: 1, median_ms: 10_000, wrong: [] });
    const table = templateTable(stats, [template("add-within-10", 2)]);
    expect(table.grades[0].lines[0]).toMatchObject({ shown: 2, answered: 1, percentCorrect: 100 });
    expect(table.answers).toBe(1);
  });

  it("counts the times shown, the right answers, the median time and each wrong answer with its count", () => {
    const stats = templateStats([
      answer({ timeMs: 4_000 }),
      answer({ timeMs: 9_000 }),
      answer({ correct: false, response: "8", misconception: "O1", timeMs: 12_000 }),
      answer({ correct: false, response: "8", misconception: "O1", timeMs: 30_000 }),
      answer({ correct: false, response: "70", misconception: null, timeMs: 2_000 }),
      answer({ templateId: "count-to-20", timeMs: 6_000 }),
    ], ALL);
    const add = stats.find((s) => s.template_id === "add-within-10");
    expect(add).toMatchObject({ shown: 5, correct: 2, median_ms: 9_000 });
    expect(add?.wrong).toEqual(expect.arrayContaining([
      { response: "8", misconception: "O1", count: 2 },
      { response: "70", misconception: null, count: 1 },
    ]));
    expect(add?.wrong).toHaveLength(2);
    expect(stats.find((s) => s.template_id === "count-to-20")).toMatchObject({ shown: 1, correct: 1, median_ms: 6_000, wrong: [] });
  });

  it("takes the mean of the two middle times when the count is even", () => {
    const [s] = templateStats([answer({ timeMs: 1_000 }), answer({ timeMs: 3_000 }), answer({ timeMs: 5_000 }), answer({ timeMs: 100_000 })], ALL);
    expect(s.median_ms).toBe(4_000);
  });

  it("leaves test families out unless they are asked for", () => {
    const rows = [answer(), answer({ correct: null, response: null, timeMs: null }),
      answer({ testFamily: true, correct: false, response: "1" }),
      answer({ testFamily: true, correct: null, response: null, timeMs: null })];
    expect(templateStats(rows, ALL)[0]).toMatchObject({ shown: 2, answered: 1, correct: 1 });
    expect(templateStats(rows, { ...ALL, withTests: true })[0]).toMatchObject({ shown: 4, answered: 2, correct: 1 });
  });

  it("keeps only the answers of the chosen school grade and curriculum", () => {
    const rows = [answer({ grade: 2 }), answer({ grade: 3 }), answer({ grade: 3, province: "AB" })];
    expect(templateStats(rows, { ...ALL, grade: 3 })[0].shown).toBe(2);
    expect(templateStats(rows, { ...ALL, grade: 3, province: "AB" })[0].shown).toBe(1);
    expect(templateStats(rows, { ...ALL, grade: 5 })).toEqual([]);
  });

  it("keeps a served-only template in the selected cohort with no answer statistics", () => {
    const rows = [answer({ correct: null, response: null, timeMs: null, grade: 3, province: "BC" }),
      answer({ grade: 2 }), answer({ grade: 3, province: "AB" })];
    const stats = templateStats(rows, { ...ALL, grade: 3, province: "BC" });
    expect(stats).toEqual([{ template_id: "add-within-10", shown: 1, answered: 0, correct: 0, median_ms: null, wrong: [] }]);
    expect(templateTable(stats, [template("add-within-10", 2)]).grades[0].lines[0].percentCorrect).toBeNull();
  });
});

const template = (id: string, level: Level, strand: Strand = "N", standard = `${level}.1`): Template => ({
  id, strand, standard, grades: { BC: level }, format: "number", whiteboard: false,
  fill: () => ({ prompt: "1 + 1", readAloud: "1 plus 1", answer: "2", wrong: [], values: {} }),
});
const stat = (over: Partial<TemplateStat> & { template_id: string }): TemplateStat => ({ shown: 0, answered: over.shown ?? 0, correct: 0, median_ms: null, wrong: [], ...over });

describe("templateTable", () => {
  it("has one row per bank template, by BC grade, with the template and its BC standard as links", () => {
    const shared = template("count-to-20", 1);
    const table = templateTable(
      [stat({ template_id: "count-to-20", shown: 8, correct: 6, median_ms: 7_250 })],
      [template("fractions", 3, "F", "3.2"), shared, template("place-value", 1, "N", "1.1"), shared],
    );
    expect(table.grades.map((g) => g.level)).toEqual([1, 3]);
    const [first, third] = table.grades;
    expect(first.lines.map((l) => l.id)).toEqual(["count-to-20", "place-value"]);
    expect(first.lines[0]).toMatchObject({ shown: 8, percentCorrect: 75, medianMs: 7_250, standard: "1.1", href: adminTemplatePath("count-to-20") });
    expect(first.lines[0].standardHref).toBe(skillMapStandardPath("1.1"));
    expect(first.lines[1]).toMatchObject({ shown: 0, percentCorrect: null, medianMs: null });
    expect(third.lines[0]).toMatchObject({ id: "fractions", strand: "F", standard: "3.2" });
    expect(table.answers).toBe(8);
  });

  it("lists the wrong answers most chosen first, with the misconception, and sums the rest", () => {
    const wrong = Array.from({ length: WRONG_SHOWN + 2 }, (_, i) => ({ response: String(i), misconception: null as string | null, count: i + 1 }));
    wrong[WRONG_SHOWN + 1].misconception = "remainder-zero";
    const [line] = templateTable([stat({ template_id: "t", shown: 100, correct: 10, wrong })], [template("t", 4)]).grades[0].lines;
    expect(line.wrong).toHaveLength(WRONG_SHOWN);
    expect(line.wrong[0]).toEqual({ response: String(WRONG_SHOWN + 1), count: WRONG_SHOWN + 2, misconception: "remainder-zero", meaning: "Treats division as exact and reports no remainder" });
    expect(line.wrong[1]).toMatchObject({ response: String(WRONG_SHOWN), count: WRONG_SHOWN + 1, misconception: null });
    // the two least chosen: counts 1 and 2
    expect(line.moreWrong).toEqual({ answers: 2, times: 3 });
  });

  it("lists each template of the real bank once, linked to a standard the skill map has", () => {
    const bank = Object.values(BANKS).flat();
    const lines = templateTable([], bank).grades.flatMap((g) => g.lines);
    expect(lines.map((l) => l.id).sort()).toEqual([...new Set(bank.map((t) => t.id))].sort());
    const onTheMap = new Set(BC_SKILL_MAP.standards.map((s) => skillMapStandardPath(s.code)));
    expect(lines.filter((l) => !l.standardHref || !onTheMap.has(l.standardHref)).map((l) => l.id)).toEqual([]);
  });

  it("keeps the answers of templates that left the bank in their own list", () => {
    const table = templateTable([stat({ template_id: "old-template", shown: 3, correct: 1 })], [template("t", 2)]);
    expect(table.retired).toEqual([expect.objectContaining({ id: "old-template", shown: 3, percentCorrect: 33, standard: null, standardHref: null })]);
    expect(table.answers).toBe(3);
  });
});

describe("parseTemplateFilters", () => {
  it("reads the grade, the curriculum and the test families choice, and ignores anything else", () => {
    expect(parseTemplateFilters({})).toEqual({ withTests: false, grade: null, province: null });
    expect(parseTemplateFilters({ grade: "3", province: "BC", tests: "1" })).toEqual({ withTests: true, grade: 3, province: "BC" });
    expect(parseTemplateFilters({ grade: "10", province: "XX", tests: "yes" })).toEqual({ withTests: false, grade: null, province: null });
  });
});
