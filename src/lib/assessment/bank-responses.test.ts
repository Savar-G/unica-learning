import { describe, expect, it } from "vitest";
import { BANKS, RESPONSE_MAX, fillTemplate } from "@/lib/assessment";

// A choice answer is stored as the choice text (#165). A choice the answers table refuses fails the answer route,
// so no template may give one. Every grade and province draws from these banks, and the province changes only a
// question's level, never its choices (fillTemplate), so one scan per template covers them all.
const SEEDS = Array.from({ length: 400 }, (_, i) => i * 7919 + 3);

describe.each(Object.entries(BANKS))("the grades %s bank", (_, bank) => {
  it("gives only choices the answers table can store", () => {
    const tooLong = new Map<string, string>();
    for (const template of bank) {
      if (template.format !== "choice") continue;
      for (const seed of SEEDS) {
        for (const choice of fillTemplate(template, seed).choices ?? []) {
          if (choice.length > RESPONSE_MAX && !tooLong.has(template.id)) tooLong.set(template.id, choice);
        }
      }
    }
    expect(Object.fromEntries(tooLong)).toEqual({});
  });
});
