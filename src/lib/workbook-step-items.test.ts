import { describe, expect, it } from "vitest";
import { checkQuestionPackage, type ItemCheck } from "@/lib/question-package";
import { curriculumFor } from "@/lib/workbook-curriculum";
import { buildStepItem, choicesFor, stepBounds, stepOf, stepRangeProblem, stepRank, stepTemplateItem } from "@/lib/workbook-step-items";

const BC = curriculumFor("bc")!;
const place = (level: number, skill: string) => ({ id: "q1", workbookId: "00000000-0000-4000-8000-0000000000c1", page: 3, question: 1, level, skills: [skill] });
const item = (skill: string, step: number, slot: Parameters<typeof stepTemplateItem>[0]["place"], seed = 1, attempt = 0, level = 4) =>
  stepTemplateItem({ curriculum: BC, skill, step, place: slot, level, day: 1, seed, attempt, ordinal: 0 });

describe("step template items (#489)", () => {
  it("fills a template with numbers from its step's ranges and checks the key from the numbers", () => {
    const step = stepOf(BC, "1.1-count-on-back", 3)!;
    for (let seed = 1; seed <= 40; seed++) {
      const it = item("1.1-count-on-back", 3, "practice-row", seed)!;
      expect(it.ref).toMatchObject({ skill: "1.1-count-on-back", step: 3 });
      expect(stepRangeProblem(step, it.text)).toBeNull();
      for (const s of it.ref.source.slots) {
        const value = Number("int" in s.value ? s.value.int : "dec" in s.value ? s.value.dec : NaN);
        if (!Array.isArray(s.domain) && Number.isFinite(value)) {
          expect(value).toBeGreaterThanOrEqual(s.domain.min);
          expect(value).toBeLessThanOrEqual(s.domain.max);
        }
      }
      const built = buildStepItem(it.ref, it.text, place(4, it.ref.skill), "code");
      expect(built.check.status, it.text).toBe("checked");
    }
  });

  it("fails a stored item whose key or numbers were changed", () => {
    const it = item("1.1-count-on-back", 3, "practice-row", 5)!;
    const pkg = buildStepItem(it.ref, it.text, place(4, it.ref.skill), "code").package!;
    const region = pkg.item!.regions[0];
    const wrongKey = { ...pkg, item: { ...pkg.item!, regions: [region.kind === "box" ? { ...region, answer: { type: "text" as const, value: "999" } } : region.kind === "choice" ? { ...region, answer: region.choices.find((c) => c !== region.answer)! } : region] } };
    expect(checkQuestionPackage(wrongKey).status).toBe("failed");
    // A number outside its step's range fails, whatever the answer says.
    const check = pkg.item!.checks[0] as Extract<ItemCheck, { kind: "template" | "template-choice" }>;
    const outside = { ...check, source: { ...check.source, slots: check.source.slots.map((s, i) => (i === 0 ? { ...s, value: { int: "999" } } : s)) } };
    expect(checkQuestionPackage({ ...pkg, item: { ...pkg.item!, checks: [outside] } })).toMatchObject({ status: "failed", reason: expect.stringMatching(/outside its step's range/) });
  });

  it("gives each place its format: a story card, Spot the error, two ways, or a circle", () => {
    expect(item("1.1-count-on-back", 3, "word-problems", 2)!.ref.kind).toBe("story");
    const spot = item("1.1-count-on-back", 3, "spot-the-error", 2)!;
    expect(spot.ref.kind).toBe("spot");
    expect(spot.ref.shown).not.toBe(spot.ref.answer);
    expect(buildStepItem(spot.ref, spot.text, place(4, spot.ref.skill), "code").check.status).toBe("checked");
    expect(item("1.1-count-on-back", 3, "solve-it-two-ways", 2)!.ref.kind).toBe("two-ways");
    const likely = [1, 2, 3, 4, 5, 6].map((s) => item("1.10-likelihood-words", 1, "practice-row", s)).filter((x) => x?.ref.kind === "choice");
    expect(likely.length).toBeGreaterThan(0);
    for (const x of likely) expect(buildStepItem(x!.ref, x!.text, place(4, x!.ref.skill), "code").package!.item!.format).toBe("circle");
  });

  it("never prints a picture placeholder or a drawing task from U4", () => {
    for (const l of BC.levels.filter((l) => l.number >= 4)) for (const s of BC.levelSkills(l.id)!) for (const st of BC.skillSteps(s.id)!) {
      const it = stepTemplateItem({ curriculum: BC, skill: s.id, step: st.number, place: "practice-row", level: l.number, day: 1, seed: 3, attempt: 0, ordinal: 0 });
      if (it) expect(it.text, `${s.id}#${st.number}`).not.toMatch(/\(picture:|\bdraw\b|\btrace\b/i);
    }
  });

  it("reads the choices a text offers and ranks steps through the curriculum", () => {
    expect(choicesFor("Is it a cone or a cube?", "cone")).toEqual(["cone", "cube"]);
    expect(choicesFor("True or false: 8 comes after 7.", "True")).toEqual(["True", "false"]);
    expect(choicesFor("Which is right? A: 14  B: 15  C: 13", "A")).toEqual(["a", "b", "c"].map((x) => (x === "a" ? "A" : x)));
    expect(choicesFor("What is the name of a shape with 5 straight sides?", "pentagon")).toBeNull();
    expect(stepRank(BC, "1.1-count-to-20", 2)!).toBeGreaterThan(stepRank(BC, "1.1-count-to-20", 1)!);
    expect(stepRank(BC, "1.1-read-write-20", 1)!).toBeGreaterThan(stepRank(BC, "1.1-count-to-20", 4)!);
    expect(stepRank(BC, "2.1-count-tens-ones", 1)!).toBeGreaterThan(stepRank(BC, "1.10-likelihood-words", 2)!);
    expect(stepBounds(stepOf(BC, "1.1-count-on-back", 3)!)).toEqual({ min: 0, max: 20 });
  });
});
