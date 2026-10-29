import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BANKS, BC_LEVEL_STANDARDS, BC_SKILL_MAP, skillMapProblems, type BcStandard, type SkillMap } from "@/lib/assessment";

/** A small map for the checker: standards as [code, grade, skills as [id, ...requires]]. */
const tiny = (...standards: [string, number, [string, ...string[]][]][]): SkillMap => ({
  status: "draft",
  drafted: "test",
  standards: standards.map(([code, grade, skills]): BcStandard => ({
    code, grade: grade as BcStandard["grade"], strand: "N", text: code,
    skills: skills.map(([id, ...requires]) => ({ id, text: id, requires })),
  })),
});

describe("skillMapProblems", () => {
  it("finds a prerequisite cycle and names the skills in it", () => {
    const map = tiny(["3.1", 3, [["3.1-a", "3.1-c"], ["3.1-b", "3.1-a"], ["3.1-c", "3.1-b"], ["3.1-d"]]]);
    const problems = skillMapProblems(map);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/cycle/);
    for (const id of ["3.1-a", "3.1-b", "3.1-c"]) expect(problems[0]).toContain(id);
    expect(problems[0]).not.toContain("3.1-d");
  });

  it("finds a prerequisite that is not a skill in the map", () => {
    const problems = skillMapProblems(tiny(["3.1", 3, [["3.1-a", "2.9-nowhere"]]]));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("3.1-a");
    expect(problems[0]).toContain("2.9-nowhere");
  });

  it("finds a prerequisite taught in a later grade than the skill that needs it", () => {
    const problems = skillMapProblems(tiny(["2.1", 2, [["2.1-a", "4.1-a"]]], ["4.1", 4, [["4.1-a"]]]));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("2.1-a");
    expect(problems[0]).toContain("4.1-a");
  });

  it("finds a skill whose id does not name its own standard", () => {
    const problems = skillMapProblems(tiny(["3.1", 3, [["3.10-a"]]], ["3.10", 3, [["3.10-b"]]]));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("3.10-a");
  });

  it("finds a skill id used twice, so no skill belongs to two standards", () => {
    const problems = skillMapProblems(tiny(["3.1", 3, [["3.1-a"], ["3.1-a"]]]));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("3.1-a");
  });

  it("finds a standard listed twice, and a standard with no skills", () => {
    const problems = skillMapProblems(tiny(["3.1", 3, [["3.1-a"]]], ["3.1", 3, [["3.1-b"]]], ["3.2", 3, []]));
    expect(problems).toHaveLength(2);
    expect(problems.join("\n")).toMatch(/3\.1/);
    expect(problems.join("\n")).toMatch(/3\.2/);
  });

  it("finds no problem in a map whose edges point back to earlier skills", () => {
    const map = tiny(["2.1", 2, [["2.1-a"], ["2.1-b", "2.1-a"]]], ["3.1", 3, [["3.1-a", "2.1-a", "2.1-b"]]]);
    expect(skillMapProblems(map)).toEqual([]);
  });
});

const mapCodes = () => new Set(BC_SKILL_MAP.standards.map((s) => s.code));
const research = (path: string) => readFileSync(new URL(`../../../.design/research/${path}`, import.meta.url), "utf8");

/** Rows of a CSV file with quoted fields ("" is a quote inside a field). */
function csvRows(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; } else if (c === '"') quoted = false; else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

describe("the BC skill map", () => {
  it("is sound: every skill belongs to one standard, every prerequisite exists, and the edges have no cycles", () => {
    expect(skillMapProblems(BC_SKILL_MAP)).toEqual([]);
  });

  it("holds every BC standard that a bank template uses", () => {
    const used = new Set(Object.values(BANKS).flat().map((t) => t.standard));
    const missing = [...used].filter((code) => !mapCodes().has(code));
    expect(missing).toEqual([]);
  });

  it("holds the 106 grade 1-7 standards with the exact text and grade of the research file", () => {
    const expected = csvRows(research("assessment-audit-2026-10-15/bc-math-standards.csv")).map((r) => {
      const [, grade, n] = /^BC-G(\d)-(\d+)$/.exec(r.code)!;
      return { code: `${grade}.${Number(n)}`, grade: Number(grade), text: r.standard_text };
    });
    expect(expected).toHaveLength(106);
    const actual = BC_SKILL_MAP.standards.filter((s) => s.grade >= 1 && s.grade <= 7).map(({ code, grade, text }) => ({ code, grade, text }));
    expect(actual).toEqual(expected);
  });

  it("holds the K and grade 8 standards with the exact text of the curriculum map", () => {
    const expected = [...research("online-assessment/bc-math-curriculum-map.md").matchAll(/^- \*\*(K\d+|8\.\d+)\*\* (.+?)\. Elaboration:/gm)]
      .map(([, code, text]) => ({ code, grade: code.startsWith("K") ? 0 : 8, text }));
    expect(expected).toHaveLength(25);
    const actual = BC_SKILL_MAP.standards.filter((s) => s.grade === 0 || s.grade === 8).map(({ code, grade, text }) => ({ code, grade, text }));
    expect(actual).toEqual(expected);
  });

  // BC Mathematics 9, Content (https://curriculum.gov.bc.ca/curriculum/mathematics/9/core, read 2026-10-27). The em
  // dash of the financial literacy heading is " - ", as in the other grades.
  it("holds the grade 9 standards with the exact text of BC Mathematics 9", () => {
    const expected = [
      "operations with rational numbers (addition, subtraction, multiplication, division, and order of operations)",
      "exponents and exponent laws with whole-number exponents",
      "operations with polynomials, of degree less than or equal to 2",
      "two-variable linear relations, using graphing, interpolation, and extrapolation",
      "multi-step one-variable linear equations",
      "spatial proportional reasoning",
      "statistics in society",
      "financial literacy - simple budgets and transactions",
    ].map((text, i) => ({ code: `9.${i + 1}`, grade: 9, text }));
    const actual = BC_SKILL_MAP.standards.filter((s) => s.grade === 9).map(({ code, grade, text }) => ({ code, grade, text }));
    expect(actual).toEqual(expected);
  });

  it("builds each grade 9 standard on earlier grades: some skill of it needs a skill taught before grade 9", () => {
    const grade = new Map(BC_SKILL_MAP.standards.flatMap((s) => s.skills.map((k) => [k.id, s.grade] as const)));
    const unlinked = BC_SKILL_MAP.standards
      .filter((s) => s.grade === 9 && !s.skills.some((k) => k.requires.some((r) => grade.get(r)! < 9)))
      .map((s) => s.code);
    expect(unlinked).toEqual([]);
  });

  it("asks grade 9 only in level 9 templates, and never offers it as a next challenge (D-153 rule 2, D-158)", () => {
    const nine = Object.values(BANKS).flat().filter((t) => t.standard.startsWith("9."));
    expect(nine.length).toBeGreaterThan(40);
    expect(nine.filter((t) => Object.values(t.grades).some((g) => g !== 9)).map((t) => t.id)).toEqual([]);
    expect(BC_LEVEL_STANDARDS.filter((s) => s.grade > 8)).toEqual([]);
    expect(BC_LEVEL_STANDARDS).toEqual(BC_SKILL_MAP.standards.filter((s) => s.grade <= 8));
  });

  // D-153: BC Mathematics 8 shows two-step equations like 3x - 4 = -12; BC Mathematics 9 (9.5) "includes distribution".
  it("leaves equations with brackets to grade 9: no grade 8.8 skill has brackets, and 9.5-distribute builds on 8.8", () => {
    const skills = BC_SKILL_MAP.standards.flatMap((s) => s.skills);
    expect(skills.filter((k) => k.id.startsWith("8.8-") && /\d\(/.test(k.text))).toEqual([]);
    const distribute = skills.find((k) => k.id === "9.5-distribute");
    expect(distribute?.requires).toEqual(["8.8-solve-two-step-integers", "9.3-multiply-monomial"]);
  });
});
