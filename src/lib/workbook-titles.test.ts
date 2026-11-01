import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { BC_SKILL_MAP } from "@/lib/assessment/skill-map";
import { SKILL_TITLES } from "@/lib/workbook-skill-titles";
import { skillTitleProblems } from "@/lib/workbook-skill-title-check";
import { dayHeader } from "@/lib/workbook-book";
import { curriculumFor } from "@/lib/workbook-curriculum";
import { planWorkbook, type PlannedPage, type PlannedPart } from "@/lib/workbook-plan";
import { sampleChild, samplePlanInput } from "@/lib/workbook-sample-profiles";
import { pageTitle, TITLE_WORDS_MAX, titleProblem, titleWords, UNIT_TITLES, type TitleSkills } from "@/lib/workbook-titles";

// Page titles (D-201): at most 4 words, naming what every card of the page practises, written by code.

const BC = curriculumFor("bc")!;

const part = (kind: PlannedPart["kind"], skills: string[], items = 2): PlannedPart => ({ kind, unit: null, step: null, skills, items, hints: true });
const page = (parts: PlannedPart[], type = "parent-led"): Pick<PlannedPage, "type" | "parts"> => ({ type: type as PlannedPage["type"], parts });
/** Skills named "<unit>:<max>": their unit, strand N and largest number. */
const skills: TitleSkills = {
  unit: (s) => s.split(":")[0],
  strand: (u) => (u.startsWith("F") ? "F" : "N"),
  max: (s) => (s.split(":")[1] ? Number(s.split(":")[1]) : null),
};

describe("page titles", () => {
  it("has exactly one valid, distinct title per BC skill, in both the map and the curriculum", () => {
    expect(skillTitleProblems(SKILL_TITLES)).toEqual([]);
    const ids = BC_SKILL_MAP.standards.flatMap((u) => u.skills.map((s) => s.id)).sort();
    expect(Object.keys(SKILL_TITLES).sort()).toEqual(ids);
    expect(BC.levels.flatMap((l) => BC.levelSkills(l.id)!.map((s) => s.id)).sort()).toEqual(ids);
  });

  it("refuses missing, stale, duplicate and invalid skill title data", () => {
    const titles = { ...SKILL_TITLES };
    delete titles["K3-ten-frame"];
    expect(skillTitleProblems(titles)).toContain("K3-ten-frame: missing title");
    expect(skillTitleProblems({ ...SKILL_TITLES, unknown: "Unknown skill" })).toContain("unknown: not a skill in the BC map");
    expect(skillTitleProblems({ ...SKILL_TITLES, "K3-make-10": SKILL_TITLES["K3-ten-frame"] }).join("\n")).toMatch(/repeats .* within unit K3/);
    expect(skillTitleProblems({ ...SKILL_TITLES, "K3-ten-frame": "The total" }).join("\n")).toMatch(/banned phrase/);
  });

  it("uses the skill title when all parts share one skill, including worked examples with zero items", () => {
    for (const id of ["K3-ten-frame", "K3-benchmarks-5-10"]) {
      expect(pageTitle(page([part("new-idea", [id], 0), part("practice", [id]), part("spot-the-error", [id], 1)]), 3, {
        ...skills, unit: (s) => BC.skill(s)!.unit,
      })).toBe(SKILL_TITLES[id]);
    }
    expect(SKILL_TITLES["K3-ten-frame"]).not.toBe(SKILL_TITLES["K3-benchmarks-5-10"]);
    expect(() => pageTitle(page([part("practice", ["unknown"])]), 3, skills)).toThrow(/Missing workbook skill title/);
  });

  it("gives every BC unit a short title of at most 4 words", () => {
    const units = BC.levels.flatMap((l) => l.units);
    expect(units.length).toBeGreaterThan(100);
    for (const code of units) {
      expect(UNIT_TITLES[code], code).toBeTruthy();
      expect(titleProblem(UNIT_TITLES[code]), UNIT_TITLES[code]).toBeNull();
    }
  });

  it("titles U3 page 24 (six story cards, 2 on a ten-frame) by what every card practises: 'Number stories to 10'", () => {
    expect(pageTitle(page([part("picture-stories", ["K3-ten-frame", "K3-make-10", "K5-take-away-change"], 6)]), 3, {
      ...skills, unit: (s) => BC.skill(s)!.unit, max: () => 10,
    })).toBe("Number stories to 10");
  });

  it("titles stories from U13, or of skills with no number range, 'Word problems'", () => {
    expect(pageTitle(page([part("word-problems", ["N1:1000"])], "word-problems"), 13, skills)).toBe("Word problems");
    expect(pageTitle(page([part("word-problems", ["F1"])], "word-problems"), 12, skills)).toBe("Word problems");
    expect(pageTitle(page([part("word-problems", ["N1:20"]), part("mixed-set", ["N1:20"])], "word-problems"), 6, skills)).toBe("Number stories to 20");
  });

  it("titles a teaching page by its unit, a page of two units of one strand by the strand, anything else 'Mixed practice'", () => {
    expect(pageTitle(page([part("new-idea", ["K3-ten-frame"], 0), part("spot-the-error", ["K3-make-10"], 1)]), 3, { ...skills, unit: (s) => BC.skill(s)!.unit })).toBe("Number parts to 10");
    expect(pageTitle(page([part("practice", ["K3-ten-frame"]), part("practice", ["K1-how-many"])]), 3, { ...skills, unit: (s) => BC.skill(s)!.unit, strand: (u) => BC.unit(u)!.strand })).toBe("Numbers");
    expect(pageTitle(page([part("practice", ["K3-ten-frame"]), part("practice", ["K4-spot-pattern"])]), 3, { ...skills, unit: (s) => BC.skill(s)!.unit, strand: (u) => BC.unit(u)!.strand })).toBe("Mixed practice");
  });

  it("keeps a review page's own name, and calls review mixed with stories or a challenge 'Mixed review'", () => {
    expect(pageTitle(page([part("already-know-it", ["N1"])]), 3, skills)).toBe("Already know it?");
    expect(pageTitle(page([part("warm-up", ["N1"]), part("fix-it", ["N1"]), part("in-your-head", ["N1"])], "warm-up"), 12, skills)).toBe("Warm-up");
    expect(pageTitle(page([part("remember-these", ["N1"]), part("friday-5", ["N1"])], "friday-5"), 12, skills)).toBe("Review and Friday 5");
    expect(pageTitle(page([part("remember-these", ["N1"]), part("picture-stories", ["N1"]), part("challenge", ["N1"], 1)]), 3, skills)).toBe("Mixed review");
    expect(pageTitle(page([part("level-test", ["N1"])], "level-test"), 12, skills)).toBe("Level U12 test");
  });

  it("fails a title of more than 4 words, or none", () => {
    expect(titleProblem("Number stories to 10")).toBeNull();
    expect(titleProblem("Show and read a number to 10 on a ten-frame in stories")).toMatch(/12 words; a title has at most 4/);
    expect(titleProblem("")).toMatch(/empty/);
    for (const title of ["In all", "Altogether", "The total", "Left over", "Left-over pieces"]) expect(titleProblem(title)).toMatch(/banned phrase/);
    expect(titleProblem("less than 5")).toMatch(/capital letter/);
    expect(titleProblem("Less\nthan 5")).toMatch(/one line/);
  });

  it("writes a title of at most 4 words, and a day label with no skill, on every day page of a book at every level", () => {
    let pages = 0;
    for (const level of BC.levels) {
      const child = sampleChild(BC, level.id)!;
      const planned = planWorkbook(samplePlanInput(BC, child, "first"));
      if (!planned.ok) throw new Error(planned.reason);
      for (const d of planned.plan.days) {
        for (const p of d.pages) {
          const h = dayHeader(BC, p, planned.plan.level);
          expect(titleWords(h.title).length, `${level.id} day ${d.day} page ${p.number}: ${h.title}`).toBeLessThanOrEqual(TITLE_WORDS_MAX);
          expect(titleProblem(h.title)).toBeNull();
          pages++;
        }
      }
    }
    expect(pages).toBeGreaterThan(1000);
  });
});
