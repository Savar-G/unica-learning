import { describe, expect, it } from "vitest";
import { BANKS, fillTemplate, toPublicQuestion, spokenChoices } from "@/lib/assessment";

const BANK = BANKS["6-7"].filter(t => t.grades.BC <= 9);
const SEEDS = Array.from({ length: 400 }, (_, i) => i * 7919 + 3);
const NOT_SPOKEN = /[=+−×÷<>%$²³√π/()●■▲★◆▼▬▮]|\s\?|-\d|\d:\d(?!\d)/;

describe.each(BANK.map((t) => [t.id, t] as const))("%s", (_, template) => {
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
});

it.each([
  ["v2-11-rational-power-1", "81³ᐟ⁴", "81 to the power of 3 over 4"],
  ["v2-12-exponential-equation-1", "(1/2)ᵗ", "1 over 2 to the power of t equals 4"],
  ["v2-12-logarithmic-equation-1", "log₂(x − 1)", "log base 2 of x minus 1 equals 3"],
  ["v2-12-log-product-and-quotient-1", "log base b", "log base b of open bracket x squared divided by y close bracket"],
  ["v2-11-radical-equation-1", "√", "square root of open bracket x plus 5 close bracket"],
  ["v2-10-sine-ratio-1", "sin θ", "sine of theta"],
])("shows and reads the notation for %s", (id, written, spoken) => {
  const q = fillTemplate(BANKS["6-7"].find(t => t.id === id)!, 1);
  expect(q.prompt.replaceAll("\u00a0", " ")).toContain(written);
  expect(q.readAloud).toContain(spoken);
});

it("speaks every upper-grade prompt and choice without raw notation", () => {
  for (const template of BANKS["6-7"].filter(t => t.grades.BC >= 10)) {
    const q = toPublicQuestion(fillTemplate(template, 1));
    for (const text of [q.readAloud, ...spokenChoices(q, q.choices ?? [])]) {
      expect(text, template.id).not.toMatch(/[ᐟᵗ₀-₉⁰¹²³⁴⁵⁶⁷⁸⁹θ√=+−×÷%/()]/);
    }
  }
});
