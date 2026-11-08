import { describe, expect, it } from "vitest";
import { METHOD_KINDS, STRATEGY_FAMILIES, checkMethodReading, differentStrategies, methodRuleFor, questionShape, suppliedMethodText, type QuestionShape } from "./scan-marking-methods";

const check = (text: string, rule: ReturnType<typeof methodRuleFor>, judgment: "solves" | "does-not-solve" | "unsure" | null = "solves") => checkMethodReading(text, rule, judgment);
const rule = (question: string, answer: string, operation: { kind: string; operands: number[] } | null = null) => methodRuleFor(question, operation, answer);

describe("question shapes", () => {
  it.each([
    ["36 + 47 = ?", null, { kind: "add", a: 36, b: 47 }],
    ["83 - 47 = ?", null, { kind: "subtract", a: 83, b: 47 }],
    ["83 − 47 = ?", null, { kind: "subtract", a: 83, b: 47 }],
    ["7 × 360 = ?", null, { kind: "multiply", a: 7, b: 360 }],
    ["64 ÷ 8 = ?", null, { kind: "divide", target: 64, by: 8 }],
    ["8 × ? = 800", null, { kind: "missing-factor", by: 8, target: 800 }],
    ["? × 8 = 800", null, { kind: "missing-factor", by: 8, target: 800 }],
    ["800 ÷ ? = 8", null, { kind: "missing-factor", by: 8, target: 800 }],
    ["36 + ? = 83", null, { kind: "missing-addend", a: 36, total: 83 }],
    ["36 - ? = 12", null, { kind: "missing-subtrahend", a: 36, rest: 12 }],
    ["? - 36 = 12", null, { kind: "missing-minuend", b: 36, rest: 12 }],
    ["? ÷ 4 = 5", null, { kind: "missing-dividend", by: 4, quotient: 5 }],
    ["12 500 + 3 400 = ?", null, { kind: "add", a: 12500, b: 3400 }],
    ["Liam shares 64 planet cards equally among 8 friends.", { kind: "divide", operands: [64, 8] }, { kind: "divide", target: 64, by: 8 }],
    ["Add 36, 47 and 5.", null, null],
    ["1.5 + 2.5 = ?", null, null],
    ["3/4 + 1/4 = ?", null, null],
  ] as const)("reads %s", (text, operation, shape) => {
    expect(questionShape(text, operation as never)).toEqual(shape);
  });
  it("names a fixed list of kinds for every shape", () => {
    expect(Object.keys(METHOD_KINDS).sort()).toEqual(["add", "divide", "missing-addend", "missing-dividend", "missing-factor", "missing-minuend", "missing-subtrahend", "multiply", "subtract"]);
    for (const kinds of Object.values(METHOD_KINDS)) expect(kinds.length).toBeGreaterThanOrEqual(2);
  });
});

// The book's 7 two-ways questions are multiplication and missing factors, so these shapes need kinds that fit on a page.
describe("two different kinds on each shape", () => {
  it.each([
    ["7 × 360 = ?", "2520", "7 × 300 = 2100\n7 × 60 = 420\n2100 + 420 = 2520", "split-factor", "7 × 36 = 252\n252 × 10 = 2520", "strip-zeros"],
    ["7 × 360 = ?", "2520", "360 + 360 + 360 + 360 + 360 + 360 + 360 = 2520", "repeated-addition", "360, 720, 1080, 1440, 1800, 2160, 2520", "skip-counting"],
    ["7 × 360 = ?", "2520", "7 × 400 = 2800\n7 × 40 = 280\n2800 - 280 = 2520", "round-and-adjust", "7 × 36 = 252\n252 × 10 = 2520", "strip-zeros"],
    ["50 × 80 = ?", "4000", "5 × 8 = 40\n40 × 100 = 4000", "strip-zeros", "50 × 8 = 400\n400 × 10 = 4000", "strip-zeros-from-one"],
    ["50 × 80 = ?", "4000", "5 × 8 = 40\n10 × 10 = 100\n40 × 100 = 4000", "strip-zeros", "5 × 80 = 400\n400 × 10 = 4000", "strip-zeros-from-one"],
    ["8 × ? = 800", "100", "800 ÷ 8 = 100", "inverse-division", "80 ÷ 8 = 10\n10 × 10 = 100", "division-with-tens"],
    ["8 × ? = 800", "100", "800 ÷ 8 = 100", "inverse-division", "8 × 10 = 80\n80 × 10 = 800\n10 × 10 = 100", "build-up"],
    ["60 × ? = 4800", "80", "4800 ÷ 60 = 80", "inverse-division", "480 ÷ 6 = 80", "division-with-tens"],
    ["70 × ? = 50400", "720", "50400 ÷ 70 = 720", "inverse-division", "5040 ÷ 7 = 720", "division-with-tens"],
    ["8 × ? = 40", "5", "40 ÷ 8 = 5", "inverse-division", "40 - 8 = 32\n32 - 8 = 24\n24 - 8 = 16\n16 - 8 = 8\n8 - 8 = 0\n5 times", "repeated-subtraction"],
    ["8 × ? = 40", "5", "40 ÷ 8 = 5", "inverse-division", "8, 16, 24, 32, 40\n5 times", "skip-counting"],
    ["8 × ? = 40", "5", "8 + 8 + 8 + 8 + 8 = 40\n5 times", "repeated-addition", "40 - 8 - 8 - 8 - 8 - 8 = 0\n5", "repeated-subtraction"],
    ["5 × ? = 25", "5", "25 ÷ 5 = 5", "inverse-division", "25 - 5 = 20\n20 - 5 = 15\n15 - 5 = 10\n10 - 5 = 5\n5 - 5 = 0\n5 times", "repeated-subtraction"],
    ["2 × ? = 8", "4", "8 ÷ 2 = 4", "inverse-division", "8 - 2 = 6\n6 - 2 = 4\n4 - 2 = 2\n2 - 2 = 0\n4 times", "repeated-subtraction"],
    ["64 ÷ 8 = ?", "8", "64 - 8 = 56\n56 - 8 = 48\n48 - 8 = 40\n40 - 8 = 32\n32 - 8 = 24\n24 - 8 = 16\n16 - 8 = 8\n8 - 8 = 0\n8 times", "repeated-subtraction", "8, 16, 24, 32, 40, 48, 56, 64\n8", "skip-counting"],
    ["83 - 47 = ?", "36", "83 - 40 = 43\n43 - 7 = 36", "split-subtrahend", "47 + 3 = 50\n50 + 33 = 83\n3 + 33 = 36", "counting-up"],
    ["83 - 47 = ?", "36", "83 - 50 = 33\n33 + 3 = 36", "compensation", "13 - 7 = 6\n7 - 4 = 3\n36", "column"],
    ["83 - 47 = ?", "36", "80 - 40 = 40\n3 - 7 = -4\n40 - 4 = 36", "partial-differences", "83 - 3 = 80\n80 - 44 = 36", "counting-back"],
    ["36 - ? = 12", "24", "36 - 12 = 24", "inverse-subtraction", "12 + 8 = 20\n20 + 16 = 36\n8 + 16 = 24", "counting-up"],
    ["36 + ? = 83", "47", "83 - 36 = 47", "inverse-subtraction", "36 + 4 = 40\n40 + 43 = 83\n4 + 43 = 47", "counting-up"],
    ["800 ÷ ? = 8", "100", "800 ÷ 8 = 100", "inverse-division", "80 ÷ 8 = 10\n10 × 10 = 100", "division-with-tens"],
    ["? - 36 = 12", "48", "12 + 36 = 48", "inverse-addition", "36 + 10 = 46\n46 + 2 = 48", "split-one-addend"],
    ["? ÷ 4 = 5", "20", "4 × 5 = 20", "inverse-multiplication", "5 + 5 + 5 + 5 = 20", "repeated-addition"],
    ["10 000 - ? = 2462", "7538", "10 000 - 2462 = 7538", "inverse-subtraction", "10 000 - 2000 = 8000\n8000 - 400 = 7600\n7600 - 60 = 7540\n7540 - 2 = 7538", "split-subtrahend"],
    ["36 + 47 = ?", "83", "36 + 40 = 76\n76 + 7 = 83", "split-one-addend", "36 + 50 = 86\n86 - 3 = 83", "compensation"],
  ])("%s = %s: %j and %j", (question, answer, one, kindOne, two, kindTwo) => {
    const r = rule(question, answer);
    expect(check(one, r)).toEqual({ verdict: "valid", kind: kindOne });
    expect(check(two, r)).toEqual({ verdict: "valid", kind: kindTwo });
    expect(kindOne).not.toBe(kindTwo);
    expect((METHOD_KINDS[r.shape!.kind] as readonly string[]).includes(kindOne)).toBe(true);
    expect((METHOD_KINDS[r.shape!.kind] as readonly string[]).includes(kindTwo)).toBe(true);
  });
  it("gives each of the book's 7 questions two made-up methods of different strategies", () => {
    for (const [question, answer] of [["8 × ? = 800", "100"], ["7 × 360 = ?", "2520"], ["60 × ? = 4800", "80"], ["70 × ? = 50400", "720"], ["50 × ? = 1000", "20"], ["20 × ? = 3000", "150"], ["50 × 80 = ?", "4000"], ["8 × ? = 3440", "430"]]) {
      const r = rule(question, answer), one = check(suppliedMethodText(r, 0), r), two = check(suppliedMethodText(r, 1), r);
      expect([question, one.verdict, two.verdict]).toEqual([question, "valid", "valid"]);
      expect([question, differentStrategies(r.shape!, one.kind!, two.kind!)]).toEqual([question, true]);
    }
  });
});

describe("the allow-list fails closed", () => {
  it("refuses every shape it cannot read, even with a true sum and solves", () => {
    expect(check("36 + 47 + 5 = 88", rule("Add 36, 47 and 5.", "88"))).toMatchObject({ verdict: "unknown" });
    expect(check("2 + 2 = 4", rule("What is the sum?", "4"))).toMatchObject({ verdict: "unknown" });
  });
  it("does not read a copy past a number written with a space (review P2-6)", () => {
    const r = rule("12 500 + 3 400 = ?", "15900");
    for (const copy of ["12500 + 3400 = 15900", "12 500 + 3 400 = 15 900", "3 400 + 12 500 = 15 900"]) expect(check(copy, r)).toMatchObject({ verdict: "unknown" });
    expect(check("12 500 + 3000 = 15 500\n15 500 + 400 = 15 900", r)).toMatchObject({ verdict: "valid", kind: "split-one-addend" });
  });
  it("never drops a number at a trailing comma (review P2-6)", () => {
    expect(check("8, 16, 24, 32, 40,\n5 times", rule("8 × ? = 40", "5"))).toMatchObject({ verdict: "unknown" });
    expect(check("8, 16, 24, 32, 40\n5 times", rule("8 × ? = 40", "5"))).toMatchObject({ verdict: "valid", kind: "skip-counting" });
  });
  it("keeps fraction and decimal answers unsure in any form (review P2-7)", () => {
    for (const text of ["5/10", "0.5", "5/10 = 0.5", "1 ÷ 2 = 0.5"]) expect(check(text, rule("2 × ? = 1", "0.5"))).toMatchObject({ verdict: "unknown" });
    for (const text of ["5/4", "10/8", "5/4 × 1 = 5/4", "10 ÷ 8 = 5/4"]) expect(check(text, rule("8 × ? = 10", "5/4"))).toMatchObject({ verdict: "unknown" });
    expect(check("5/2 + 7/2 = 6", rule("2 × ? = 12", "6"))).toMatchObject({ verdict: "unknown" });
  });
  it("refuses the saved story's copies and keeps its repeated subtraction (review P1-2)", () => {
    const r = rule("Liam shares 64 planet cards equally among 8 friends. How many cards does each friend get?", "8", { kind: "divide", operands: [64, 8] });
    for (const text of ["8 × 8 = 64\n64 ÷ 8 = 8", "8 + 0 = 8", "8 × 8 ÷ 8 = 8", "64 ÷ 8 = 8", "8 ÷ 1 = 8"]) expect(check(text, r)).toMatchObject({ verdict: "unknown" });
    expect(check("64 - 8 = 56\n56 - 8 = 48\n48 - 8 = 40\n40 - 8 = 32\n32 - 8 = 24\n24 - 8 = 16\n16 - 8 = 8\n8 - 8 = 0\n8 times", r)).toMatchObject({ verdict: "valid", kind: "repeated-subtraction" });
  });
  it("applies the skip count rule: the step, the start, the end and the count", () => {
    const r = rule("8 × ? = 40", "5");
    for (const text of ["8, 16, 24, 32, 40", "4, 8, 12, 16, 20, 24, 28, 32, 36, 40\n10 times", "16, 24, 32, 40\n4 times", "8, 16, 24, 32\n4 times", "0, 8, 16, 24, 32, 40\n5 times", "40, 32, 24, 16, 8\n5 times", "8, 16, 24, 32, 40\n6 times", "8, 16, 25, 32, 40\n5 times", "8, 8, 8, 8, 8\n5 times"]) expect(check(text, r)).toMatchObject({ verdict: "unknown" });
  });
  it("applies the repeated subtraction rule: the divisor, down to 0, and the count", () => {
    const r = rule("8 × ? = 40", "5");
    for (const text of ["40 - 8 = 32\n32 - 8 = 24\n24 - 8 = 16\n16 - 8 = 8\n8 - 8 = 0", "40 - 8 = 32\n32 - 8 = 24\n24 - 8 = 16\n16 - 8 = 8\n5 times", "40 - 8 = 32\n32 - 8 = 24\n24 - 16 = 8\n8 - 8 = 0\n5 times", "40 - 20 = 20\n20 - 20 = 0\n2 times", "40 - 8 = 32\n32 - 8 = 24\n24 - 8 = 16\n16 - 8 = 8\n8 - 8 = 0\n6 times"]) expect(check(text, r)).toMatchObject({ verdict: "unknown" });
  });
  it("gives a last line words only for a count", () => {
    expect(check("36 + 40 = 76\n76 + 7 = 83\n83 is it", rule("36 + 47 = ?", "83"))).toMatchObject({ verdict: "unknown" });
    expect(check("36 + 40 = 76\n76 + 7 = 83\n83 times", rule("36 + 47 = ?", "83"))).toMatchObject({ verdict: "unknown" });
    expect(check("8, 16, 24, 32, 40\n5 cookies", rule("8 × ? = 40", "5"))).toMatchObject({ verdict: "unknown" });
  });
  it("refuses a flat line with a chunk taken off, and a column with the wrong carry", () => {
    const r = rule("36 + 47 = ?", "83");
    for (const text of ["36 + 46 + 1 = 83", "36 + 1 + 46 = 83", "6 + 7 = 13\n3 + 4 = 7\n83", "6 + 7 = 13\n3 + 4 + 1 = 8", "3 + 4 + 1 = 8\n6 + 7 = 13\n83"]) expect(check(text, r)).toMatchObject({ verdict: "unknown" });
    expect(check("6 + 7 = 13\n3 + 4 + 1 = 8\n83", r)).toEqual({ verdict: "valid", kind: "column" });
    expect(check("83 - 46 - 1 = 36", rule("83 - 47 = ?", "36"))).toMatchObject({ verdict: "unknown" });
  });
  it("marks a false step and does-not-solve invalid, and an AI verdict alone never valid", () => {
    const r = rule("36 + 47 = ?", "83"), good = "36 + 40 = 76\n76 + 7 = 83";
    expect(check(good, r)).toMatchObject({ verdict: "valid", kind: "split-one-addend" });
    expect(check(good, r, "does-not-solve")).toMatchObject({ verdict: "invalid" });
    for (const judgment of ["unsure", null] as const) expect(check(good, r, judgment)).toMatchObject({ verdict: "unknown" });
    expect(check("36 + 40 = 77\n77 + 6 = 83", r)).toMatchObject({ verdict: "invalid" });
  });
  it("does not treat a copy as the inverse on a plain division", () => {
    expect(check("64 ÷ 8 = 8", rule("64 ÷ 8 = ?", "8"))).toMatchObject({ verdict: "unknown" });
    expect(check("64 / 8 = 8", rule("64 ÷ 8 = ?", "8"))).toMatchObject({ verdict: "unknown" });
  });
});

// How children write. Each form keeps its expected mark, and none of these widens the list of kinds.
describe("common child forms", () => {
  it.each([
    ["36 + 47 = ?", "83", "36 + 40 = 76 + 7 = 83", "unknown", null],
    ["36 + 47 = ?", "83", "36 + 40 = 76, 76 + 7 = 83", "valid", "split-one-addend"],
    ["36 + 47 = ?", "83", "36 + 40 = 76\n76 + 7 = 83", "valid", "split-one-addend"],
    ["36 + 47 = ?", "83", "36 + 40 + 7 = 83", "valid", "split-one-addend"],
    ["36 + 47 = ?", "83", "36 → 76 → 83", "unknown", null],
    ["36 + 47 = ?", "83", "36 +40 → 76 +7 → 83", "valid", "split-one-addend"],
    ["36 + 47 = ?", "83", "36 + 4 = 40, 40 + 40 = 80, 80 + 3 = 83", "valid", "counting-on"],
    ["36 + 47 = ?", "83", "30 + 40 = 70, 6 + 7 = 13, 70 + 13 = 83", "valid", "partial-sums"],
    ["36 + 47 = ?", "83", "6 + 7 = 13\n3 + 4 + 1 = 8\n83", "valid", "column"],
    ["36 + 47 = ?", "83", "36\n+47\n83", "unknown", null],
    ["36 + 47 = ?", "83", "36 + 47 = 83", "unknown", null],
    ["36 + 47 = ?", "83", "47 + 36 = 83", "unknown", null],
    ["36 + 47 = ?", "83", "76 + 7 = 83", "unknown", null],
    ["36 + 47 = ?", "83", "36 + 40 = 76\n76 + 7 = 83 so 83", "valid", "split-one-addend"],
    ["36 + 47 = ?", "83", "I added the tens then the ones", "unknown", null],
    ["8 × ? = 40", "5", "8, 16, 24, 32, 40 so 5", "valid", "skip-counting"],
    ["8 × ? = 40", "5", "8, 16, 24, 32, 40\n5 times", "valid", "skip-counting"],
    ["8 × ? = 40", "5", "8, 16, 24, 32, 40 = 5", "unknown", null],
    ["8 × ? = 40", "5", "8, 16, 24, 32, 40", "unknown", null],
    ["8 × ? = 40", "5", "8 + 8 + 8 + 8 + 8 = 40 so 5", "valid", "repeated-addition"],
    ["8 × ? = 40", "5", "40 ÷ 8 = 5", "valid", "inverse-division"],
    ["8 × ? = 40", "5", "8 × 5 = 40", "unknown", null],
    ["8 × ? = 40", "5", "5 groups of 8", "unknown", null],
    ["7 × 360 = ?", "2520", "7 × 300 = 2100, 7 × 60 = 420, 2100 + 420 = 2520", "valid", "split-factor"],
    ["7 × 360 = ?", "2520", "360 × 7 = 2520", "unknown", null],
  ] as const)("%s %j is %s", (question, answer, text, verdict, kind) => {
    expect(check(text, rule(question, answer))).toEqual({ verdict, kind });
  });
});

// The fourth review (17d27f88). Each case is a test that must not be valid.
describe("copies hidden in a kind", () => {
  it.each([
    ["50 × 80 = ?", "4000", "80 × 100 = 8000\n80 × 50 = 4000\n8000 - 4000 = 4000"],
    ["50 × 80 = ?", "4000", "100 × 80 = 8000\n50 × 80 = 4000\n8000 - 4000 = 4000"],
    ["5 × 7 = ?", "35", "7 × 10 = 70\n7 × 5 = 35\n70 - 35 = 35"],
    ["6 × 100 = ?", "600", "6 × 1 = 6\n6 × 100 = 600"],
    ["? ÷ 8 = 100", "800", "8 × 1 = 8\n8 × 100 = 800"],
    ["20 × 10 = ?", "200", "2 × 10 = 20\n20 × 10 = 200"],
    ["20 × 10 = ?", "200", "20 × 1 = 20\n20 × 10 = 200"],
    ["8 × ? = 800", "100", "80 ÷ 8 → 10 × 10 → 100 - 1"],
    ["8 × ? = 800", "100", "8 ÷ 8 → 1 × 100 → 100 + 7"],
    ["8 × ? = 800", "100", "80 ÷ 8 → 10 × 10 → 100 100"],
    ["36 + 47 = ?", "83", "36 +40 → 76 +7 → 83 + 0"],
  ])("refuses %s %j", (question, answer, text) => {
    expect(check(text, rule(question, answer)).verdict).not.toBe("valid");
  });
  it("still accepts round and adjust that rounds to a different number, and a chain that ends on its landing", () => {
    expect(check("50 × 100 = 5000\n50 × 20 = 1000\n5000 - 1000 = 4000", rule("50 × 80 = ?", "4000"))).toEqual({ verdict: "valid", kind: "round-and-adjust" });
    expect(check("7 × 400 = 2800\n7 × 40 = 280\n2800 - 280 = 2520", rule("7 × 360 = ?", "2520"))).toEqual({ verdict: "valid", kind: "round-and-adjust" });
    expect(check("80 ÷ 8 → 10 × 10 → 100", rule("8 × ? = 800", "100"))).toEqual({ verdict: "valid", kind: "division-with-tens" });
    expect(check("36 +40 → 76 +7 → 83", rule("36 + 47 = ?", "83"))).toEqual({ verdict: "valid", kind: "split-one-addend" });
  });
  it("refuses any multiplication or division line that is the question on its own numbers, or uses the answer before the end", () => {
    for (const text of ["7 × 360 = 2520\n7 × 36 = 252\n252 × 10 = 2520", "7 × 36 = 252\n252 × 10 = 2520\n360 × 7 = 2520", "2520 ÷ 7 = 360\n7 × 36 = 252\n252 × 10 = 2520"])
      expect(check(text, rule("7 × 360 = ?", "2520")).verdict).not.toBe("valid");
    for (const text of ["4800 ÷ 60 = 80\n60 × 80 = 4800", "60 × 80 = 4800\n4800 ÷ 60 = 80"]) expect(check(text, rule("60 × ? = 4800", "80")).verdict).not.toBe("valid");
  });
  it("keeps a real but unlisted division with tens unsure (fail closed)", () => {
    expect(check("48 ÷ 6 = 8\n8 × 10 = 80", rule("60 × ? = 4800", "80")).verdict).toBe("unknown");
  });
  it("keeps repeated subtraction by the divisor valid when the answer is the same number", () => {
    expect(check("25 - 5 = 20\n20 - 5 = 15\n15 - 5 = 10\n10 - 5 = 5\n5 - 5 = 0\n5 times", rule("5 × ? = 25", "5"))).toEqual({ verdict: "valid", kind: "repeated-subtraction" });
  });
});

// Two ways means two different strategies. Kinds group into strategy families, and one family twice is unsure.
describe("strategy families", () => {
  const shape = (question: string, answer: string) => rule(question, answer).shape!;
  it("gives every kind of every shape a family", () => {
    for (const [name, kinds] of Object.entries(METHOD_KINDS)) for (const kind of kinds) expect([name, kind, typeof STRATEGY_FAMILIES[kind]]).toEqual([name, kind, "string"]);
  });
  it("classifies every pair of kinds the same way in both orders", () => {
    const shapes: Record<string, QuestionShape> = { add: shape("36 + 47 = ?", "83"), subtract: shape("83 - 47 = ?", "36"), multiply: shape("7 × 360 = ?", "2520"), divide: shape("64 ÷ 8 = ?", "8"),
      "missing-factor": shape("8 × ? = 800", "100"), "missing-addend": shape("36 + ? = 83", "47"), "missing-subtrahend": shape("36 - ? = 12", "24"), "missing-minuend": shape("? - 36 = 12", "48"), "missing-dividend": shape("? ÷ 4 = 5", "20") };
    for (const [name, kinds] of Object.entries(METHOD_KINDS)) for (const a of kinds) for (const b of kinds) {
      expect([name, a, b, differentStrategies(shapes[name], a, b)]).toEqual([name, a, b, differentStrategies(shapes[name], b, a)]);
      if (a === b) expect(differentStrategies(shapes[name], a, b)).toBe(false);
    }
  });
  it.each([
    ["50 × 80 = ?", "4000", "strip-zeros", "strip-zeros-from-one", false],
    ["7 × 360 = ?", "2520", "repeated-addition", "skip-counting", false],
    ["7 × 360 = ?", "2520", "split-factor", "strip-zeros", true],
    ["7 × 360 = ?", "2520", "round-and-adjust", "strip-zeros", true],
    ["8 × ? = 800", "100", "inverse-division", "division-with-tens", false],
    ["8 × ? = 800", "100", "inverse-division", "build-up", true],
    ["8 × ? = 40", "5", "inverse-division", "repeated-subtraction", true],
    ["8 × ? = 40", "5", "skip-counting", "repeated-addition", false],
    ["8 × ? = 40", "5", "skip-counting", "repeated-subtraction", true],
    ["36 + 47 = ?", "83", "split-one-addend", "counting-on", false],
    ["36 + 47 = ?", "83", "split-one-addend", "partial-sums", true],
    ["36 + 47 = ?", "83", "compensation", "column", true],
    ["83 - 47 = ?", "36", "split-subtrahend", "counting-back", false],
    ["83 - 47 = ?", "36", "split-subtrahend", "counting-up", true],
    ["36 + ? = 83", "47", "inverse-subtraction", "split-subtrahend", false],
    ["36 + ? = 83", "47", "inverse-subtraction", "column", false],
    ["36 + ? = 83", "47", "inverse-subtraction", "counting-up", true],
    ["36 - ? = 12", "24", "inverse-subtraction", "counting-up", true],
    ["? - 36 = 12", "48", "inverse-addition", "split-one-addend", false],
    ["? ÷ 4 = 5", "20", "inverse-multiplication", "strip-zeros", false],
    ["? ÷ 4 = 5", "20", "inverse-multiplication", "repeated-addition", true],
  ] as const)("on %s, %s and %s are %s strategies", (question, answer, a, b, different) => {
    expect(differentStrategies(shape(question, answer), a, b)).toBe(different);
  });
});

