import { describe, expect, it } from "vitest";
import { BANKS, fillTemplate } from "@/lib/assessment";

// Structural checks across every band's bank (#187): the BC standards it covers, and how much a template varies.
const SEEDS = Array.from({ length: 50 }, (_, i) => i * 7919 + 3);
const TEMPLATES = [...new Map(Object.values(BANKS).flat().map((t) => [t.id, t])).values()];

describe("every bank", () => {
  it("has no template that asks the same prompt for every seed", () => {
    // A retake or a sibling should not meet a fixed question: the prompt itself must change, not only the choices.
    const fixed = TEMPLATES.filter((t) => new Set(SEEDS.map((seed) => fillTemplate(t, seed).prompt)).size < 2).map((t) => t.id);
    expect(fixed).toEqual([]);
  });
});
