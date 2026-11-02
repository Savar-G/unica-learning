import { describe, expect, it } from "vitest";
import { BANKS, fillTemplate, MISCONCEPTIONS } from "@/lib/assessment";

const BANK = BANKS["3-5"];
const NEW = BANK.filter((t) => t.id.startsWith("g35-"));
const SEEDS = Array.from({ length: 400 }, (_, i) => i * 7919 + 3);
const asNumber = (s: string) => Number(s.replace(/,/g, ""));

describe.each(NEW.map((t) => [t.id, t] as const))("%s", (_, template) => {
  it("gives a valid question for every seed: coded wrong answers, none equal to the answer", () => {
    for (const seed of SEEDS) {
      const q = fillTemplate(template, seed);
      const text = `${q.prompt} ${q.readAloud} ${q.answer} ${q.wrong.map((w) => w.value).join(" ")}`;
      expect(text, `seed ${seed}`).not.toMatch(/undefined|NaN|Infinity|null|\[object/);
      expect(q.readAloud.length, `seed ${seed}`).toBeGreaterThan(0);
      expect(q.wrong.length, `seed ${seed}`).toBeGreaterThan(0);
      for (const w of q.wrong) {
        expect(MISCONCEPTIONS[w.misconception], `seed ${seed}: ${w.misconception}`).toBeDefined();
        // The answers table stores misconception codes with a 20-character limit.
        expect(w.misconception.length, `seed ${seed}: ${w.misconception}`).toBeLessThanOrEqual(20);
      }
      // A sum or an equation never breaks across lines on screen.
      for (const shown of [q.prompt, ...(q.choices ?? [])]) expect(shown, `seed ${seed}`).not.toMatch(/ [+−×÷=]|[+−×÷=] /);

      if (q.format === "number") {
        // The number pad has digits and a decimal point: at most 4 digits before it (research, grades 3-5) and 3 after.
        expect(q.answer, `seed ${seed}`).toMatch(/^\d{1,4}(\.\d{1,3})?$/);
        const values = [q.answer, ...q.wrong.map((w) => w.value)].map(asNumber);
        expect(values.every((v) => Number.isFinite(v) && v >= 0), `seed ${seed}: ${values}`).toBe(true);
        expect(new Set(values).size, `seed ${seed}: ${values}`).toBe(values.length);
      } else {
        // Four large targets by default; three where only three make sense.
        expect(q.choices!.length, `seed ${seed}: ${q.choices}`).toBeGreaterThanOrEqual(3);
        expect(q.choices!.length, `seed ${seed}: ${q.choices}`).toBeLessThanOrEqual(4);
        expect(new Set(q.choices).size, `seed ${seed}: ${q.choices}`).toBe(q.choices!.length);
        expect(q.choices).toContain(q.answer);
      }
    }
  });

  it("the same seed gives the same question, and different seeds give at least 5 different questions", () => {
    expect(fillTemplate(template, 5)).toEqual(fillTemplate(template, 5));
    const variants = new Set(SEEDS.map((seed) => {
      const q = fillTemplate(template, seed);
      return `${q.prompt} ${[...(q.choices ?? [])].sort()} ${JSON.stringify(q.figure ?? null)}`;
    }));
    expect(variants.size).toBeGreaterThanOrEqual(5);
  });
});
