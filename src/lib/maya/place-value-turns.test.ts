// B1a: how a child's turn is read on a place-value digit step, through the public readers. Synthetic numbers only.
import { describe, expect, it } from "vitest";
import { asksPlace, digitTemplate, placeStepHeard } from "./place-value-turns";

const step = { id: "digit", kind: "read-digit" as const, place: "ten thousands" as const, digit: 5, worth: 10000 };
const heard = (text: string, extra: Partial<{ uncertain: boolean; copy: boolean; asked: { type: "number"; value: number } | null }> = {}) =>
  placeStepHeard({ text, uncertain: false, copy: false, asked: null, step, value: { type: "number", value: 5 }, ...extra });

describe("a read-digit step is heard only from a whole-turn template", () => {
  it("credits each accepted form", () => {
    for (const t of ["5", "Five.", "It's 5.", "it is five", "It's a 5", "I got 5", "The digit is 5.", "5 is the digit", "The ten thousands digit is 5.", "5 ten thousands", "Um, 5.", "five ten thousand"]) {
      expect(heard(t), t).toBe(true);
    }
  });

  it("never credits a near miss", () => {
    for (const t of ["5?", "Is it 5?", "5 thousands", "5 hundred thousands", "maybe 5", "I think 5", "not 5", "5 and the value is 50,000", "50,000", "5. My mom said so.", "5\n5", "for", "fife", "55", "it's 6"]) {
      expect(heard(t), t).toBe(false);
    }
  });

  it("takes a plain yes only for Maya's own question about this digit", () => {
    expect(heard("Yes.", { asked: { type: "number", value: 5 } })).toBe(true);
    expect(heard("Yes, 5.", { asked: { type: "number", value: 5 } })).toBe(true);
    expect(heard("Yes.")).toBe(false);
    expect(heard("Yes.", { asked: { type: "number", value: 6 } })).toBe(false);
  });

  it("gives no credit after H3 showed the step, or for a turn code could not hear for sure", () => {
    expect(heard("5", { copy: true })).toBe(false);
    expect(heard("5", { uncertain: true })).toBe(false);
  });

  it("reads a zero only as zero or 0, never nothing or none", () => {
    expect(digitTemplate("zero", "hundreds")).toBe(0);
    expect(digitTemplate("0", "hundreds")).toBe(0);
    expect(digitTemplate("nothing", "hundreds")).toBeNull();
    expect(digitTemplate("none", "hundreds")).toBeNull();
  });
});

describe("a question about a place", () => {
  it("is read in its question forms", () => {
    for (const t of ["Which one is the thousands place?", "Where is the tens?", "What's the hundreds place?", "which column is the ones"]) expect(asksPlace(t), t).toBe(true);
  });
  it("is not read in an answer or a statement", () => {
    for (const t of ["5", "It's 5 ten thousands.", "I counted the places.", "I don't know."]) expect(asksPlace(t), t).toBe(false);
  });
});
