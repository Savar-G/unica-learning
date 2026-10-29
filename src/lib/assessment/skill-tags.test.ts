import { describe, expect, it } from "vitest";
import { BANKS, BC_SKILL_MAP, SKILL_TAGS, skillTagProblems, templateSkills, type BcStandard, type SkillMap } from "@/lib/assessment";

/** A small map: standards as [code, grade, skills as [id, ...requires]]. */
const tiny = (...standards: [string, number, [string, ...string[]][]][]): SkillMap => ({
  status: "draft",
  drafted: "test",
  standards: standards.map(([code, grade, skills]): BcStandard => ({
    code, grade: grade as BcStandard["grade"], strand: "N", text: code,
    skills: skills.map(([id, ...requires]) => ({ id, text: id, requires })),
  })),
});

const MAP = tiny(["2.1", 2, [["2.1-a"], ["2.1-b", "2.1-a"]]], ["3.1", 3, [["3.1-a", "2.1-b"], ["3.1-b"]]], ["3.2", 3, [["3.2-a"]]]);

describe("skillTagProblems", () => {
  it("finds a skill id that is not in the map, and names the template", () => {
    const problems = skillTagProblems([{ id: "t1", standard: "3.1" }], { t1: ["3.1-a", "3.1-nowhere"] }, MAP);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("t1");
    expect(problems[0]).toContain("3.1-nowhere");
  });

  it("finds a template with no tag, and a template whose tag holds no skill", () => {
    const problems = skillTagProblems([{ id: "t1", standard: "3.1" }, { id: "t2", standard: "3.1" }, { id: "t3", standard: "3.1" }], { t2: [], t3: ["3.1-a"] }, MAP);
    expect(problems).toHaveLength(2);
    expect(problems[0]).toContain("t1");
    expect(problems[1]).toContain("t2");
  });

  it("needs a skill of the template's own standard, or a prerequisite of that standard with a note", () => {
    const ok = skillTagProblems([
      { id: "own", standard: "3.1" },
      { id: "prereq", standard: "3.1" },
      { id: "deep-prereq", standard: "3.1" },
      { id: "own-and-other", standard: "3.1" },
    ], {
      own: ["3.1-b", "3.1-a"],
      prereq: { skills: ["2.1-b"], note: "Only the comparison step is tested" },
      "deep-prereq": { skills: ["2.1-a"], note: "Counting on is all the question needs" },
      "own-and-other": { skills: ["3.1-a", "3.2-a"], note: "The story also needs 3.2" },
    }, MAP);
    expect(ok).toEqual([]);

    const problems = skillTagProblems([
      { id: "not-prereq", standard: "3.1" },
      { id: "no-note", standard: "3.1" },
      { id: "other-no-note", standard: "3.1" },
      { id: "blank-note", standard: "3.1" },
    ], {
      "not-prereq": { skills: ["3.2-a"], note: "Close enough" },
      "no-note": ["2.1-b"],
      "other-no-note": ["3.1-a", "3.2-a"],
      "blank-note": { skills: ["2.1-b"], note: " " },
    }, MAP);
    expect(problems).toHaveLength(4);
    for (const [i, id] of ["not-prereq", "no-note", "other-no-note", "blank-note"].entries()) expect(problems[i]).toContain(id);
  });
});

describe("templateSkills", () => {
  it("gives a template's skills from the map, main skill first, with their standard", () => {
    const skills = templateSkills("t1", { t1: { skills: ["3.1-b", "2.1-a"], note: "Also counts on" } }, MAP);
    expect(skills).toEqual([
      { id: "3.1-b", text: "3.1-b", standard: "3.1" },
      { id: "2.1-a", text: "2.1-a", standard: "2.1" },
    ]);
  });

  it("gives no skill for a template with no tag, such as one removed from the bank since a test was stored", () => {
    expect(templateSkills("gone", {}, MAP)).toEqual([]);
  });
});

describe("the bank's skill tags", () => {
  const templates = [...new Map(Object.values(BANKS).flat().map((t) => [t.id, t])).values()];

  it("tag every template with skills of the BC skill map, from its own standard or a noted prerequisite", () => {
    expect(templates.length).toBeGreaterThan(500);
    expect(skillTagProblems(templates, SKILL_TAGS, BC_SKILL_MAP)).toEqual([]);
  });

  it("tag no template that the banks do not hold", () => {
    const ids = new Set(templates.map((t) => t.id));
    expect(Object.keys(SKILL_TAGS).filter((id) => !ids.has(id))).toEqual([]);
  });

  it.each(["g67-8-add-fractions", "g67-8-add-mixed-numbers", "g67-8-subtract-fractions"])(
    "tags %s with the skill for unlike denominators",
    (id) => {
      expect(templateSkills(id).map((skill) => skill.id)).toEqual(["8.5-add-subtract-unlike"]);
    },
  );
});
