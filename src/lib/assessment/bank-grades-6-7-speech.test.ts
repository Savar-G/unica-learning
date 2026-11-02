import { describe, expect, it } from "vitest";
import { BANKS, fillTemplate, toPublicQuestion, spokenChoices } from "@/lib/assessment";

const BANK = BANKS["6-7"];
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
