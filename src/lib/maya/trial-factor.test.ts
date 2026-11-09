import { describe, expect, it } from "vitest";
import { roundToHundred, showTrial, shownTry, trialEquation, trialFeedback, trialHeard, trialHelp, trialStep, wholeProduct, TRIAL_TEMPLATES } from "./trial-factor";
import { wholeTurn } from "./numbers";

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

describe("trialHeard: the try is heard on the whole turn only (#698)", () => {
  const step = trialStep(236, 1416)!;
  const six = { type: "number" as const, value: 6 };
  const heard = (text: string, asked: number | null = null, copy = false) =>
    trialHeard(step, wholeTurn(text) ?? "", six, asked === null ? null : { type: "number", value: asked }, copy);

  it("hears the value alone, in the child's own words, or the try's own product in any order", () => {
    for (const t of ["6", "It's 6.", "I got 6", "So six.", "236 times 6 is 1416", "6 × 236 = 1416", "two hundred thirty-six times six equals one thousand four hundred sixteen"]) expect(heard(t), t).toBe(true);
  });

  it("hears a plain yes only to Maya's own confirm of that number", () => {
    expect(heard("yes", 6)).toBe(true);
    expect(heard("yes 6", 6)).toBe(true);
    expect(heard("yes")).toBe(false);
    expect(heard("yes 7", 6)).toBe(false);
  });

  it("hears nothing else: another number, a false product, a hedge, a question, another speaker, or a copy after H3", () => {
    for (const t of ["7", "236 times 6 is 1417", "236 times 7 is 1416", "236 plus 6 is 1416", "Maybe 6", "Is it 6?", "My mom said 6", "6. I wrote it.", "6 tens"]) expect(heard(t), t).toBe(false);
    expect(heard("6", null, true)).toBe(false);
  });

  it("reads a whole product, never part of a turn", () => {
    expect(wholeProduct("236 x 6 makes 1416")).toEqual({ operands: [236, 6], product: 1416 });
    expect(wholeProduct("236 times 6 is 1416 i think")).toBeNull();
    expect(wholeProduct("236 times 6 times 1 is 1416")).toBeNull();
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

  it("shows the try next to the factor at H3, and the equation only once it is found", () => {
    expect(showTrial(step)).not.toMatch(/\b6\b/);
    expect(showTrial(trialStep(236, 236)!)).toBe("236 × 2 = 472. That is more than 236.");
    expect(trialEquation(step)).toBe("236 × 6 = 1416");
    expect(shownTry(step)).toBe(5);
    expect(showTrial(step)).toBe("236 × 5 = 1180. That is less than 1416.");
    expect(shownTry(trialStep(236, 236)!)).toBe(2);
  });

  it("uses plain words only (D-202)", () => {
    for (const t of Object.values(TRIAL_TEMPLATES).flat()) expect(t.replace(/\{\w+\}/g, "9")).not.toMatch(/in all|altogether|all together|total|left over|, so|, then|, because/i);
  });
});
