import { describe, expect, it } from "vitest";
import { BANKS, fillTemplate, MISCONCEPTIONS } from "@/lib/assessment";

const BANK = BANKS["6-7"];
const SEEDS = Array.from({ length: 400 }, (_, i) => i * 7919 + 3);
// The number pad types digits and one decimal point, at most 12 keys (ANSWER_MAX in src/lib/test-api.ts).
const TYPEABLE = /^(?=.{1,12}$)\d+(\.\d+)?$/;
const valueOfChoice = (text: string): string => {
  const match = text.replace(/ /g, " ").match(/^(?:(\d+) )?(\d+)\/(\d+)$/);
  if (match) return String(Number(match[1] ?? 0) + Number(match[2]) / Number(match[3]));
  return text;
};

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
