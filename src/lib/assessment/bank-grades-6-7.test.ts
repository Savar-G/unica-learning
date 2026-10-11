import { describe, expect, it } from "vitest";
import {
  BANKS,
  MISCONCEPTIONS,
  createSession,
  fillTemplate,
  toPublicQuestion,
  type Grade,
  type Province,
  type TaggedProvince,
} from "@/lib/assessment";

const BANK = BANKS["6-7"];
const PROVINCES: Province[] = ["BC", "AB", "SK", "MB", "ON", "other"];
const TAGGED: TaggedProvince[] = ["BC", "AB", "SK", "MB", "ON"];
const SEEDS = Array.from({ length: 400 }, (_, i) => i * 7919 + 3);
// Symbols a browser voice reads badly: math signs, a "?" that marks a blank, a minus before a digit, brackets, and a
// ratio such as 3:5 (a time such as 2:50 p.m. reads well).
const NOT_SPOKEN = /[=+−×÷<>%$²³√π/()●■▲★◆▼▬▮]|\s\?|-\d|\d:\d(?!\d)/;
// The number pad types digits and one decimal point, at most 12 keys (ANSWER_MAX in src/lib/test-api.ts).
const TYPEABLE = /^(?=.{1,12}$)\d+(\.\d+)?$/;

describe("grade 6-7 tests from the default bank", () => {
  it.each([6, 7] as Grade[])("grade %i: 42 questions, 21 in stage 1 at the school grade, in every province", (grade) => {
    for (const province of PROVINCES) {
      const session = createSession({ grade, province }, 1);
      expect(session.stage1, province).toHaveLength(21);
      expect(session.stage1.every((q) => q.level === grade), province).toBe(true);
      for (const [route, level] of [["up", grade + 1], ["stay", grade], ["down", grade - 1]] as const) {
        expect(session.stage2[route], `${province} ${route}`).toHaveLength(21);
        expect(session.stage2[route].every((q) => q.level === level), `${province} ${route}`).toBe(true);
      }
    }
  });
});

describe("the grades 6-7 bank", () => {
  it("covers levels 5-8 with all five province tags", () => {
    for (const t of BANK) {
      expect(Object.keys(t.grades).sort(), t.id).toEqual([...TAGGED].sort());
      for (const p of TAGGED) {
        const level = t.grades[p as keyof typeof t.grades] as number;
        expect(level, `${t.id} ${p}`).toBeGreaterThanOrEqual(5);
        expect(level, `${t.id} ${p}`).toBeLessThanOrEqual(8);
      }
    }
  });

  it("has unique ids, and an id shared with another bank is the same template", () => {
    expect(new Set(BANK.map((t) => t.id)).size).toBe(BANK.length);
    for (const [band, other] of Object.entries(BANKS)) {
      if (band === "6-7") continue;
      for (const t of other) expect(BANK.some((m) => m.id === t.id), `${t.id} is also in bank ${band}`).toBe(false);
    }
  });

  describe.each(BANK.map((t) => [t.id, t] as const))("%s", (_, template) => {
    it("gives a valid question for every seed: coded wrong answers, none equal to the answer", () => {
      for (const seed of SEEDS) {
        const q = fillTemplate(template, seed);
        const text = `${q.prompt} ${q.readAloud} ${q.answer} ${q.wrong.map((w) => w.value).join(" ")}`;
        expect(text, `seed ${seed}`).not.toMatch(/undefined|NaN|Infinity|null|\[object|e[+-]\d/);
        expect(q.readAloud.length, `seed ${seed}`).toBeGreaterThan(0);
        expect(q.wrong.length, `seed ${seed}`).toBeGreaterThan(0);
        for (const w of q.wrong) expect(MISCONCEPTIONS[w.misconception], `seed ${seed}: ${w.misconception}`).toBeDefined();
        // An expression never breaks across lines on screen.
        for (const shown of [q.prompt, ...(q.choices ?? [])]) expect(shown, `seed ${seed}`).not.toMatch(/ [+−×÷=]|[+−×÷=] /);

        if (q.format === "number") {
          const values = [q.answer, ...q.wrong.map((w) => w.value)];
          for (const v of values) expect(v, `seed ${seed}: the pad cannot type ${v}`).toMatch(TYPEABLE);
          expect(new Set(values.map((v) => Number(v).toFixed(6))).size, `seed ${seed}: ${values}`).toBe(values.length);
        } else {
          expect(q.choices!.length, `seed ${seed}`).toBeGreaterThanOrEqual(3);
          expect(q.choices!.length, `seed ${seed}`).toBeLessThanOrEqual(4);
          expect(new Set(q.choices).size, `seed ${seed}: ${q.choices}`).toBe(q.choices!.length);
          expect(q.choices).toContain(q.answer);
        }
      }
    });

    it("read-aloud text has words, not symbols, and does not list the answer choices", () => {
      for (const seed of SEEDS.slice(0, 100)) {
        const q = fillTemplate(template, seed);
        expect(q.readAloud, `seed ${seed}`).not.toMatch(NOT_SPOKEN);
        if (q.format !== "choice") continue;
        // The screen speaks the choices after the question (#79): read-aloud text that names every choice says them twice.
        const said = (c: string) => [c, c.replace(/−/g, "negative ").replace(/\//g, " over ").replace(/%/g, " percent")]
          .some((form) => q.readAloud.toLowerCase().includes(form.replace(/\u00a0/g, " ").toLowerCase()));
        expect(q.choices!.every(said), `seed ${seed}: ${q.readAloud}`).toBe(false);
      }
    });

    it("never pairs 1 with a plural, as in '1 parts'", () => {
      for (const seed of SEEDS) {
        const q = fillTemplate(template, seed);
        for (const text of [q.prompt, q.readAloud, ...(q.choices ?? [])]) {
          expect(text, `seed ${seed}`).not.toMatch(/(^|[^\d.,/])1 ([a-z]+ )?(?!is\b|as\b|was\b|has\b|less\b|plus\b|minus\b|times\b|over\b|and\b|more\b)[a-z]+s\b/);
        }
      }
    });

    it("the same seed gives the same question, and different seeds give at least 6 different questions", () => {
      expect(fillTemplate(template, 5)).toEqual(fillTemplate(template, 5));
      // Same key as the session uses: the prompt and the set of choices.
      const variants = new Set(SEEDS.map((seed) => {
        const q = fillTemplate(template, seed);
        return `${q.prompt} ${[...(q.choices ?? [])].sort()}`;
      }));
      expect(variants.size).toBeGreaterThanOrEqual(6);
    });
  });

  it("the public view of a question never carries the answer", () => {
    for (const template of BANK) {
      const view = JSON.stringify(toPublicQuestion(fillTemplate(template, 3)));
      expect(view).not.toMatch(/"answer"|"wrong"|misconception/);
    }
  });
});
