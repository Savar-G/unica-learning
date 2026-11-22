import { describe, expect, it } from "vitest";
import { letteredChoices, letteredRegion } from "@/lib/workbook-lettered-choices";

describe("lettered choices", () => {
  it("splits the stem from the options and drops the Write A or B cue", () => {
    expect(letteredChoices("Which is prime? A) 22  B) 17  Write A or B.", ["A", "B"])).toEqual({
      stem: "Which is prime?", options: [{ letter: "A", text: "22" }, { letter: "B", text: "17" }],
    });
    expect(letteredChoices("12 crayons are shared equally among 4 friends. Which equation fits? A) 12 ÷ 4 = n  B) 12 × 4 = n", ["A", "B"])?.options)
      .toEqual([{ letter: "A", text: "12 ÷ 4 = n" }, { letter: "B", text: "12 × 4 = n" }]);
  });

  it("reads three options and options made of words", () => {
    expect(letteredChoices("Which had more? A) the first  B) the second  C) the same  Write A, B or C.", ["A", "B", "C"])?.options.map(o => o.text))
      .toEqual(["the first", "the second", "the same"]);
  });

  it("leaves a question alone when its options are not a lettered list", () => {
    const choices = ["A", "B"];
    expect(letteredChoices("Pattern A starts at 3. Pattern B starts at 4. Which is greater after 5 steps? Write A or B.", choices)).toBeNull();
    expect(letteredChoices("Which is prime? A) 22", choices)).toBeNull();
    expect(letteredChoices("A) 22  B) 17", choices)).toBeNull();
    expect(letteredChoices("Which is prime? A) 22  B)", choices)).toBeNull();
    // Text after the last option is question text, not part of the option.
    expect(letteredChoices("Which number is prime? A) 22  B) 17. Explain how you know.", choices)).toBeNull();
    expect(letteredChoices("Which is prime? A) 22  B) 17  Write A or B. Then explain.", choices)).toBeNull();
    expect(letteredChoices("True or false: 3 is prime.", ["true", "false"])).toBeNull();
    expect(letteredChoices("Which is prime? A) 22  B) 17", ["B", "A"])).toBeNull();
  });

  it("applies to circled regions only", () => {
    const region = (mark: "circle" | "tick") => ({ id: "a", kind: "choice" as const, mark, label: null, choices: ["A", "B"], answer: "B" });
    expect(letteredRegion("Which is prime? A) 22  B) 17", region("circle"))?.stem).toBe("Which is prime?");
    expect(letteredRegion("Which is prime? A) 22  B) 17", region("tick"))).toBeNull();
    expect(letteredRegion("Write 5.", { id: "a", kind: "box", label: null, answer: { type: "number", value: 5 } })).toBeNull();
  });
});
