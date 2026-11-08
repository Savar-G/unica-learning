// B1b: the whole-turn readers of the bigger and place-worth steps. Synthetic numbers only.
import { describe, expect, it } from "vitest";
import type { WorkedStep } from "@/lib/question-package";
import { biggerTemplate, partsStepHeard, worthTemplate } from "./place-value-parts-turns";
import { wholeTurn } from "./numbers";

const BIGGER: Extract<WorkedStep, { kind: "bigger" }> = { id: "bigger", kind: "bigger", a: 8, b: 3, bigger: 8 };
const WORTH: Extract<WorkedStep, { kind: "place-worth" }> = { id: "worth-1", kind: "place-worth", place: "thousands", digit: 7, worth: 1000, value: 7000 };
const num = (value: number) => ({ type: "number" as const, value });
const heard = (text: string, step: typeof BIGGER | typeof WORTH, extra: Partial<Parameters<typeof partsStepHeard>[0]> = {}) =>
  partsStepHeard({ text, uncertain: false, step, value: num(step.kind === "bigger" ? 8 : 7000), copy: false, asked: null, ...extra });

describe("the bigger step's whole-turn templates", () => {
  it("credits the bigger digit in the child's own words", () => {
    for (const t of ["8", "Eight.", "It's 8.", "8 is bigger.", "8 is bigger than 3.", "The 8.", "8 is the bigger digit.", "So 8 is more."]) {
      expect(biggerTemplate(wholeTurn(t)!, BIGGER), t).toBe(8);
      expect(heard(t, BIGGER), t).toBe(true);
    }
  });
  it("credits nothing for a hedge, a question, another speaker, another digit, a copy or an unsure hearing", () => {
    for (const t of ["Maybe 8.", "Is it 8?", "My mom said 8.", "I copied 8.", "8 is bigger than 4.", "5", "8 and 3", "8 or 3"]) expect(heard(t, BIGGER), t).toBe(false);
    expect(heard("8", BIGGER, { copy: true })).toBe(false);
    expect(heard("8", BIGGER, { uncertain: true })).toBe(false);
  });
  it("credits a plain yes only to Maya's own 'Did you say 8?'", () => {
    expect(heard("Yes.", BIGGER)).toBe(false);
    expect(heard("Yes.", BIGGER, { asked: num(8) })).toBe(true);
    expect(heard("Yes.", BIGGER, { asked: num(3) })).toBe(false);
  });
});

describe("the place-worth step's whole-turn templates", () => {
  it("credits the value alone or in the child's own words", () => {
    for (const t of ["7000", "7,000", "7 000", "seven thousand", "It's 7000.", "It's worth 7000.", "The value is 7000.", "7000 is the value.", "7 times 1000 is 7000.", "7 × 1000 = 7000", "7 thousands is 7000."]) {
      expect(worthTemplate(wholeTurn(t)!, WORTH), t).toBe(7000);
      expect(heard(t, WORTH), t).toBe(true);
    }
  });
  it("credits nothing for a hedge, a question, another speaker, other numbers or a copy", () => {
    for (const t of ["Maybe 7000.", "Is it 7000?", "My mom said 7000.", "I copied 7000.", "6 times 1000 is 7000.", "7 times 100 is 7000.", "7 hundreds is 7000.", "7000 and 40"]) expect(heard(t, WORTH), t).toBe(false);
    expect(heard("7000", WORTH, { copy: true })).toBe(false);
  });
});
