// The checked readings of the "other-topic" questions with no teaching path yet (Maya coverage, Wave C): each needs the
// printed text, code's work and the stored template to agree. Synthetic packages with the book's template shapes.
import { describe, expect, it } from "vitest";
import type { QuestionPackage } from "@/lib/question-package";
import type { TemplateSource } from "@/lib/question-package-template";
import { readTopicQuestion } from "./topic-claims";
import { choicePrinted, printed } from "./topic-samples";

const int = (n: number) => ({ int: String(n) });
const slots = (values: Record<string, number>, max = 99) => Object.entries(values).map(([name, v]) => ({ name, value: int(v), domain: { min: 0, max } }));
const source = (answer: string, check: string | null, values: Record<string, number>, derived: [string, string][] = [], max?: number): TemplateSource =>
  ({ answer, check, slots: slots(values, max), derived, values: null });
const AREA: [string, string][] = [["a", "2 + a0 % 7"], ["b", "2 + b0 % min(7, 50 // a - 1)"], ["c", "2 + c0 % 7"], ["d", "2 + d0 % min(7, 50 // c - 1)"]];
const SCALE: [string, string][] = [["k", "2 + 8 * (u1 % 2)"], ["v", "10 * (2 + u2 % 9)"], ["shown", "(v + m * k) if flip == 0 else (v + m * k) + (k)"], ["lower", "v - k"], ["upper", "v + k"]];
const MONEY: [string, string][] = [["w", "b20 * 2000 + qu * 25"], ["shown", "str((w if flip == 0 else w + 50) // 100) + '.' + ('0' + str((w if flip == 0 else w + 50) % 100) if (w if flip == 0 else w + 50) % 100 < 10 else str((w if flip == 0 else w + 50) % 100))"]];
const ELAPSED: [string, string][] = [["t", "hr * 60 + mm"], ["e", "t + m"], ["ts", "str((t // 60 - 1) % 12 + 1) + ':' + ('00' if t % 60 == 0 else ('0' + str(t % 60) if t % 60 < 10 else str(t % 60)))"]];
const withText = (p: QuestionPackage, text: string) => ({ ...p, text });

describe("true/false claims", () => {
  it("a same-denominator compare: only the numerators decide", () => {
    const p = choicePrinted("4.3-same-denominator#3.4:true-false", "True or false: 3/8 > 5/8.", source("'true' if a > b else 'false'", "a != b", { d: 8, u1: 2, u2: 4 }, [["a", "1 + u1 % (d - 1)"], ["b", "1 + u2 % (d - 1)"]]), "false");
    expect(readTopicQuestion(p)).toEqual({ topic: "same-denominator", claim: { left: 3, right: 5, denominator: 8, relation: ">" }, answer: "false" });
    expect(readTopicQuestion(withText(p, "True or false: 3/8 > 5/9."))).toBeNull();
    expect(readTopicQuestion(withText(p, "True or false: 4/8 > 5/8."))).toBeNull();
  });

  it("a scale: the mark plus the intervals, checked against the claim", () => {
    // k = 10 (u1 odd), v = 60 (u2 = 4), 2 intervals above 60 is 80: true.
    const p = choicePrinted("4.16-many-to-one#3.4:true-false", "A scale's marks are 50, 60, 70. True or false: 2 intervals above 60 is 80.", source("'true' if flip == 0 else 'false'", null, { u1: 1, u2: 4, m: 2, flip: 0 }, SCALE), "true");
    expect(readTopicQuestion(p)).toEqual({ topic: "scale", work: { kind: "evaluate", operands: ["60 + 2 × 10"] }, claimed: 80, answer: "true" });
    expect(readTopicQuestion(withText(p, "A scale's marks are 50, 60, 70. True or false: 2 intervals above 60 is 90."))).toBeNull();
    const wrong = choicePrinted("4.16-many-to-one#3.4:true-false", "A scale's marks are 50, 60, 70. True or false: 2 intervals above 60 is 90.", source("'true' if flip == 0 else 'false'", null, { u1: 1, u2: 4, m: 2, flip: 1 }, SCALE), "false");
    expect(readTopicQuestion(wrong)).toMatchObject({ topic: "scale", claimed: 90, answer: "false" });
  });

  it("money: bills and quarters as a decimal sum, checked against the printed amount", () => {
    const p = choicePrinted("4.18-money-notation#3.3:true-false", "True or false: 2 $20 bills and 2 quarters is $40.50.", source("'true' if flip == 0 else 'false'", null, { b20: 2, qu: 2, flip: 0 }, MONEY), "true");
    expect(readTopicQuestion(p)).toEqual({ topic: "money", work: { kind: "evaluate", operands: ["2 × 20 + 2 × 0.25"] }, claimed: 40.5, answer: "true" });
    expect(readTopicQuestion(withText(p, "True or false: 2 $20 bills and 3 quarters is $40.50."))).toBeNull();
  });

  it("the minute hand: 5 minutes a number, plus the marks", () => {
    const p = choicePrinted("4.12-read-analog#3.4:true-false", "True or false: the minute hand 3 marks past the 7 shows 38 minutes.", source("'true' if flip == 0 else 'false'", "x >= 2", { x: 3, k: 7, flip: 0 }, [["shown", "k * 5 + x if flip == 0 else k * 5 + x - 1"]]), "true");
    expect(readTopicQuestion(p)).toEqual({ topic: "minute-hand", work: { kind: "evaluate", operands: ["7 × 5 + 3"] }, claimed: 38, answer: "true" });
  });

  it("marbles: red against the other colours added", () => {
    const p = choicePrinted("4.17-predict-outcome#3.3:true-false", "True or false: with 7 red, 2 blue and 1 green marbles, red is more likely than the other colours together.", source("'true' if a > b + c else 'false'", "a != b + c and 8 <= a + b + c <= 12", { a: 7, b: 2, c: 1 }), "true");
    expect(readTopicQuestion(p)).toEqual({ topic: "marbles", left: 7, work: { kind: "add", operands: [2, 1] }, relation: ">", answer: "true" });
  });

  it("areas: two products compared", () => {
    // a0 = 4 gives a = 6, b0 = 1 gives b = 3; c0 = 2 gives c = 4, d0 = 2 gives d = 4.
    const p = choicePrinted("3.9-area-square-units#4.3:true-false", "True or false: 6 by 3 squares is bigger than 4 by 4 squares.", source("'true' if a * b > c * d else 'false'", "a * b != c * d", { a0: 4, b0: 1, c0: 2, d0: 2 }, AREA, 8), "true");
    expect(readTopicQuestion(p)).toEqual({ topic: "area", work: [{ kind: "multiply", operands: [6, 3] }, { kind: "multiply", operands: [4, 4] }], relation: ">", answer: "true" });
  });

  it("a key that disagrees with code's work stays held", () => {
    const p = choicePrinted("4.3-same-denominator#3.4:true-false", "True or false: 3/8 > 5/8.", source("'true' if a > b else 'false'", "a != b", { d: 8, u1: 2, u2: 4 }, [["a", "1 + u1 % (d - 1)"], ["b", "1 + u2 % (d - 1)"]]), "true");
    expect(readTopicQuestion(p)).toBeNull();
  });
});

describe("word answers", () => {
  it("which area is bigger, in the printed words", () => {
    const src = source("str(a) + ' by ' + str(b) if a * b > c * d else (str(c) + ' by ' + str(d) if c * d > a * b else 'the same')", "a * b != c * d", { a0: 4, b0: 1, c0: 2, d0: 2 }, AREA, 8);
    const p = printed("s", "3.9-area-square-units#4.1:compare", "3.9-area-square-units", "Which is bigger: 6 by 3 squares, or 4 by 4 squares?", src, { type: "text", value: "6 by 3" }, "write-words");
    expect(readTopicQuestion(p)).toEqual({ topic: "area-compare", work: [{ kind: "multiply", operands: [6, 3] }, { kind: "multiply", operands: [4, 4] }], words: ["6 by 3", "4 by 4"], answer: "6 by 3" });
  });

  it("which die outcome is more likely, by code's count of each", () => {
    const src = source("'even' if 3 > c - 1 else 'less than ' + str(c)", null, { u1: 3 }, [["c", "[2, 3, 5, 6][u1 % 4]"]], 9);
    const p = printed("s", "4.17-predict-outcome#3.4:compare", "4.17-predict-outcome", "Which is more likely when you roll a die: an even number or a number less than 6?", src, { type: "text", value: "less than 6" }, "write-words");
    expect(readTopicQuestion(p)).toEqual({ topic: "die-compare", counts: [3, 5], words: ["even", "less than 6"], answer: "less than 6" });
  });
});

describe("clock times", () => {
  it("minutes after a time, as the book writes the time", () => {
    const src = source("str((e // 60 - 1) % 12 + 1) + ':' + ('00' if e % 60 == 0 else ('0' + str(e % 60) if e % 60 < 10 else str(e % 60)))", null, { hr: 11, mm: 25, m: 40 }, ELAPSED, 59);
    const p = printed("s", "4.12-read-analog#3.5:bare", "4.12-read-analog", "What time is 40 minutes after 11:25?", src, { type: "text", value: "12:05" }, "write-words");
    expect(readTopicQuestion(p)).toMatchObject({ topic: "time", work: { kind: "time-add" }, answer: "12:05" });
    expect(readTopicQuestion(withText(p, "What time is 45 minutes after 11:25?"))).toBeNull();
    const top = source("str(h) + ':' + (('0' + str(m)) if m < 10 else str(m))", null, { h: 8, m: 35 }, [], 59);
    expect(readTopicQuestion(printed("s", "4.12-read-analog#3.2:bare", "4.12-read-analog", "What time is 35 minutes after 8:00?", top, { type: "text", value: "8:35" }, "write-words"))).toMatchObject({ topic: "time", answer: "8:35" });
  });
});
