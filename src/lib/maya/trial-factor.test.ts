import { describe, expect, it } from "vitest";
import { roundToHundred, showTrial, trialEquation, trialFeedback, trialHelp, trialStep, TRIAL_TEMPLATES } from "./trial-factor";

describe("trialStep", () => {
  it("multiplies out every try from 1 to 10 and keeps the missing factor", () => {
    const step = trialStep(977, 4885)!;
    expect(step).toMatchObject({ id: "try", kind: "try-factor", factor: 977, total: 4885, round: 1000, value: 5 });
    expect(step.tries).toHaveLength(10);
    expect(step.tries.every((t) => t.product === 977 * t.value)).toBe(true);
  });

  it("is null for a missing factor that is not a whole number from 1 to 9", () => {
    expect(trialStep(236, 1417)).toBeNull();
    expect(trialStep(236, 2360)).toBeNull();
    expect(trialStep(236, 0)).toBeNull();
    expect(trialStep(0, 10)).toBeNull();
    expect(trialStep(1.5, 3)).toBeNull();
  });

  it("rounds to the nearest hundred, at least 100", () => {
    expect([104, 150, 236, 977, 49].map(roundToHundred)).toEqual([100, 200, 200, 1000, 100]);
  });
});

describe("the try lines", () => {
  const step = trialStep(236, 1416)!;

  it("helps H0 to H2: try a number, multiply it out, round to estimate", () => {
    expect(trialHelp(step).map((l) => [l.line, l.key, l.level])).toEqual([
      ["step.invite", "invite.try", 0], ["step.point", "trial.point", 1], ["step.operation", "trial.round", 2],
    ]);
    expect(trialHelp(step)[2].vars).toEqual({ factor: 236, round: 200, total: 1416 });
  });

  it("answers each wrong try with its product, too big or too small, never the right one", () => {
    const lines = trialFeedback(step);
    expect(lines.map((l) => l.heard)).toEqual(["1", "2", "3", "4", "5", "7", "8", "9", "10"]);
    expect(lines.find((l) => l.heard === "5")).toMatchObject({ key: "trial.small", vars: { guess: 5, product: 1180 } });
    expect(lines.find((l) => l.heard === "7")).toMatchObject({ key: "trial.big", vars: { guess: 7, product: 1652 } });
  });

  it("shows the tries on each side at H3, and the equation only once it is found", () => {
    expect(showTrial(step)).not.toMatch(/\b6\b/);
    expect(showTrial(trialStep(236, 236)!)).toBe("236 × 2 = 472. That is more than 236.");
    expect(trialEquation(step)).toBe("236 × 6 = 1416");
  });

  it("uses plain words only (D-202)", () => {
    for (const t of Object.values(TRIAL_TEMPLATES).flat()) expect(t.replace(/\{\w+\}/g, "9")).not.toMatch(/in all|altogether|all together|total|left over|, so|, then|, because/i);
  });
});
