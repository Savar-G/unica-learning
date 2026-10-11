import { describe, expect, it } from "vitest";
import {
  BANKS,
  MISCONCEPTIONS,
  createSession,
  fillTemplate,
  toPublicQuestion,
  spokenChoices,
  REPORTED_STRAND,
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
const valueOfChoice = (text: string): string => {
  const match = text.replace(/ /g, " ").match(/^(?:(\d+) )?(\d+)\/(\d+)$/);
  if (match) return String(Number(match[1] ?? 0) + Number(match[2]) / Number(match[3]));
  return text;
};

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

  it.each([6, 7] as Grade[])("grade %i: every route has 10 suitable required-work questions and four report areas", (grade) => {
    for (const province of PROVINCES) {
      for (const seed of SEEDS.slice(0, 60)) {
        const session = createSession({ grade, province }, seed);
        for (const [route, stage2] of Object.entries(session.stage2)) {
          const questions = [...session.stage1, ...stage2];
          const label = `${province} ${route} seed ${seed}`;
          expect(questions.filter((q) => q.whiteboard).length, label).toBeGreaterThanOrEqual(10);
          expect(questions.filter((q) => q.showWork), label).toHaveLength(10);
          expect(questions.filter((q) => q.showWork).every((q) => q.whiteboard), label).toBe(true);
          expect(new Set(questions.map((q) => REPORTED_STRAND[q.strand])), label)
            .toEqual(new Set(["number", "fractions", "algebra", "shapes"]));
          expect(new Set(questions.map((q) => `${q.prompt}|${[...(q.choices ?? [])].sort().join("|")}`)).size, label).toBe(42);
        }
      }
    }
  });
});

describe("the grades 6-7 bank", () => {
  it("preserves multiplication and grouping when it speaks a bracketed choice", () => {
    const q = fillTemplate(BANK.find((t) => t.id === "g67-6-expression-words")!, 3);
    const bracketed = q.choices!.find((c) => c.startsWith("4("))!;
    expect(bracketed).toBe("4(n + 8)");
    expect(spokenChoices(q, [bracketed])).toEqual(["4 times open bracket n plus 8 close bracket"]);
  });

  it.each([
    ["g67-8-square-root", "What is the positive square root of 49?", "7"],
    ["g67-8-add-fractions", "2/8 + 2/7 = ?", "15/28"],
    ["g67-8-negative-equation", "6x + 12 = −18. What is x?", "−5"],
    ["g67-8-hypotenuse", "The two sides that meet at the right angle of a right triangle are 18 cm and 24 cm. How long is the longest side, in centimetres?", "30"],
    ["g67-8-mean", "Find the mean of these five values: 3, 13, 11, 5, 5.", "7.4"],
  ])("marks the worked example %s", (id, prompt, answer) => {
    const q = fillTemplate(BANK.find((t) => t.id === id)!, 3);
    expect(q.prompt).toBe(prompt);
    expect(q.answer).toBe(answer);
  });

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
        for (const shown of [q.prompt, ...(q.choices ?? [])]) expect(shown, `seed ${seed}`).not.toMatch(/\d [+−×÷=] | [+−×÷=] \d/);

        if (q.format === "number") {
          const values = [q.answer, ...q.wrong.map((w) => w.value)];
          for (const v of values) expect(v, `seed ${seed}: the pad cannot type ${v}`).toMatch(TYPEABLE);
          expect(new Set(values.map((v) => Number(v).toFixed(6))).size, `seed ${seed}: ${values}`).toBe(values.length);
        } else {
          expect(q.choices!.length, `seed ${seed}`).toBeGreaterThanOrEqual(3);
          expect(q.choices!.length, `seed ${seed}`).toBeLessThanOrEqual(4);
          expect(new Set(q.choices).size, `seed ${seed}: ${q.choices}`).toBe(q.choices!.length);
          expect(new Set(q.choices!.map(valueOfChoice)).size, `seed ${seed}: equivalent choices ${q.choices}`).toBe(q.choices!.length);
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

    it("speaks each displayed choice without raw mathematics symbols", () => {
      for (const seed of SEEDS.slice(0, 100)) {
        const q = toPublicQuestion(fillTemplate(template, seed));
        for (const said of spokenChoices(q, q.choices ?? [])) {
          expect(said, `seed ${seed}`).not.toMatch(/[=+−×÷<>%$²³√π/()]|\d:\d(?!\d|.*[ap]\.m\.)/);
        }
      }
    });

    it("never pairs 1 with a plural, as in '1 parts'", () => {
      for (const seed of SEEDS) {
        const q = fillTemplate(template, seed);
        for (const text of [q.prompt, q.readAloud, ...(q.choices ?? [])]) {
          expect(text, `seed ${seed}`).not.toMatch(/(^|[^\d.,/])1 (?:parts|units|centimetres|metres|litres|hours|minutes|dollars|cents|pages|cups|students)\b/);
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
