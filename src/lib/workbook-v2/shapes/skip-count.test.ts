// What the harness does not say of count.skip: each question has an equal chance, and each choice of blanks shows its step.
import { describe, expect, it } from "vitest";
import { canonicalJson, pick, seedFrom } from "../hash";
import { skipCountRegistration } from "../testing/registrations/count-skip";
import type { LargeSpace } from "../testing/shape-registration";
import { skipCount, type SkipCountLimits } from "./skip-count";

const r = (min: number, max: number) => ({ min, max });
const WIDE: SkipCountLimits = { step: r(2, 10), direction: "either", start: r(0, 100), offStep: "allowed", terms: r(5, 10), blanks: r(1, 5), places: r(1, 10) };

describe("count.skip", () => {
  it.each<[string, SkipCountLimits]>([
    ["some steps and terms", { ...WIDE, step: r(3, 4), start: r(0, 24), terms: r(5, 6), blanks: r(1, 2), offStep: "never", places: r(3, 5) }],
    ["starts between the steps, down", { ...WIDE, direction: "down", step: r(9, 10), start: r(36, 44), terms: r(5, 5), places: r(4, 5) }],
  ])("gives each question of a small part about as often as another: %s", (_name, limits) => {
    const count = (skipCountRegistration.space as LargeSpace).count(limits as never);
    const times = new Map<string, number>();
    for (let i = 0; i < count * 60; i++) {
      const key = canonicalJson(skipCount.generate(limits, seedFrom("often", i)).question);
      times.set(key, (times.get(key) ?? 0) + 1);
    }
    expect(times.size).toBe(count);
    expect(count).toBeGreaterThan(25);
    expect(Math.min(...times.values())).toBeGreaterThan(25);
    expect(Math.max(...times.values())).toBeLessThan(110);
  });

  it("counts the whole space, with the independent count", () => {
    expect(skipCount.count(WIDE)).toBe((skipCountRegistration.space as LargeSpace).count(WIDE as never));
    expect(skipCount.count(WIDE)).toBeGreaterThan(1_000_000);
  });

  it("shows the step in two printed neighbours of each question, also when blanks may stand at the start", () => {
    for (let i = 0; i < 500; i++) {
      const { question, answer } = skipCount.generate(WIDE, `${pick(`shown-${i}`, 1_000_000)}`);
      const printed = Array.from({ length: question.terms }, (_, t) => !question.blanks.includes(t + 1));
      expect(printed.some((is, t) => is && printed[t + 1])).toBe(true);
      expect(answer.parts.map((p) => p.name)).toEqual(question.blanks.map((_, b) => `blank-${b + 1}`));
    }
  });
});
