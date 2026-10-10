import { describe, expect, it } from "vitest";
import { MISCONCEPTIONS, REPORTED_STRAND, SAMPLE_BANK, fillTemplate, toPublicQuestion } from "@/lib/assessment";

const SEEDS = Array.from({ length: 300 }, (_, i) => i * 7919 + 1);
const asNumber = (s: string) => Number(s.replace(/,/g, ""));

describe("the sample bank", () => {
  it("covers levels 2-6 in all 4 reported strands, with no fractions below level 3", () => {
    const covered = new Set(SAMPLE_BANK.map((t) => `${t.grades.BC}:${REPORTED_STRAND[t.strand]}`));
    for (const level of [2, 3, 4, 5, 6]) {
      for (const strand of ["number", "fractions", "algebra", "shapes"]) {
        expect(covered.has(`${level}:${strand}`), `level ${level} ${strand}`).toBe(level >= 3 || strand !== "fractions");
      }
    }
  });

  it("has unique template ids", () => {
    expect(new Set(SAMPLE_BANK.map((t) => t.id)).size).toBe(SAMPLE_BANK.length);
  });

  describe.each(SAMPLE_BANK.map((t) => [t.id, t] as const))("%s", (_, template) => {
    it("gives a valid question for every seed, and no wrong answer equals the answer", () => {
      for (const seed of SEEDS) {
        const q = fillTemplate(template, seed);
        const text = `${q.prompt} ${q.readAloud} ${q.answer} ${q.wrong.map((w) => w.value).join(" ")}`;
        expect(text, `seed ${seed}`).not.toMatch(/undefined|NaN|Infinity|null/);
        expect(q.readAloud.length).toBeGreaterThan(0);
        expect(q.wrong.length).toBeGreaterThan(0);
        for (const w of q.wrong) expect(MISCONCEPTIONS[w.misconception], w.misconception).toBeDefined();

        if (q.format === "number") {
          const values = [q.answer, ...q.wrong.map((w) => w.value)].map(asNumber);
          expect(values.every(Number.isFinite), `seed ${seed}: ${values}`).toBe(true);
          expect(values[0], `seed ${seed}`).toBeGreaterThanOrEqual(0);
          expect(new Set(values).size, `seed ${seed}: ${values}`).toBe(values.length);
        } else {
          expect(new Set(q.choices).size, `seed ${seed}: ${q.choices}`).toBe(q.wrong.length + 1);
          expect(q.choices).toContain(q.answer);
        }
      }
    });

    it("the same seed gives the same question, and different seeds vary the numbers", () => {
      expect(fillTemplate(template, 5)).toEqual(fillTemplate(template, 5));
      const variants = new Set(SEEDS.slice(0, 50).map((seed) => {
        const q = fillTemplate(template, seed);
        return `${q.prompt} ${[...(q.choices ?? [])].sort()}`;
      }));
      expect(variants.size).toBeGreaterThan(1);
    });
  });

  it("the public view of a question never carries the answer", () => {
    for (const template of SAMPLE_BANK) {
      const view = JSON.stringify(toPublicQuestion(fillTemplate(template, 3)));
      expect(view).not.toMatch(/"answer"|"wrong"|misconception/);
    }
  });
});
