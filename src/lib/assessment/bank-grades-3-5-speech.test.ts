import { describe, expect, it } from "vitest";
import { BANKS, fillTemplate } from "@/lib/assessment";

const BANK = BANKS["3-5"];
const NEW = BANK.filter((t) => t.id.startsWith("g35-"));
const SEEDS = Array.from({ length: 400 }, (_, i) => i * 7919 + 3);
const NOT_SPOKEN = /[=+−×÷●■▲★◆▼▬▮$%/<>]|\s\?|\d:\d/;
const ABBREVIATION = /\b(cm|mm|km|kg|mL)\b|\d ?(m|g|L)\b/;
const NAMES_CHOICES = new Set(["g35-3-most-least-likely"]);

describe.each(NEW.map((t) => [t.id, t] as const))("%s", (_, template) => {
  it("read-aloud text has words, not symbols or unit abbreviations", () => {
    for (const seed of SEEDS.slice(0, 150)) {
      const { readAloud } = fillTemplate(template, seed);
      expect(readAloud, `seed ${seed}`).not.toMatch(NOT_SPOKEN);
      expect(readAloud, `seed ${seed}`).not.toMatch(ABBREVIATION);
    }
  });

  it("read-aloud text does not list the choices: the test screen speaks them (#79)", () => {
    if (template.format !== "choice" || NAMES_CHOICES.has(template.id)) return;
    for (const seed of SEEDS.slice(0, 150)) {
      const q = fillTemplate(template, seed);
      const spoken = q.readAloud.toLowerCase();
      const named = q.choices!.filter((c) => {
        const label = c.replace(/\u00a0/g, " ").toLowerCase();
        const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        return new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`).test(spoken);
      });
      expect(named.length, `seed ${seed}: ${named}`).toBeLessThan(2);
    }
  });

  it("never pairs 1 with a plural, as in '1 red cubes'", () => {
    for (const seed of SEEDS) {
      const q = fillTemplate(template, seed);
      for (const text of [q.prompt, q.readAloud, ...(q.choices ?? [])]) {
        expect(text, `seed ${seed}`).not.toMatch(/(^|[^\d.,/])1 ([a-z]+ )?(?!is\b|was\b|has\b|gives\b|less\b|plus\b|times\b|minus\b)[a-z]+s\b/);
      }
    }
  });
});
