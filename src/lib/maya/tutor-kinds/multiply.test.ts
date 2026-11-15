import { describe, expect, it } from "vitest";
import { conversationalFake, reply } from "@/lib/maya-model-fake";
import { fakeTalkReviewer } from "@/lib/maya-talk-review";
import { fakeMathReviewer } from "@/lib/maya-math-review";
import { createTextSession } from "@/lib/maya-text";
import { workedSteps, type Operation, type OperationPackage } from "@/lib/question-package";
import { missingWork } from "../missing-number";
import { checkTutorSay, plainTeaching } from "../tutor";
import { describeTutorKind } from "./contract";
import { tutorKindOf } from "./index";
import { multiplyKind } from "./multiply";

const num = (value: number) => ({ type: "number" as const, value });
const base = { ref: { source: "workbook" as const, workbookId: "test", page: 1, question: 1 }, templateId: null, level: 12, difficulty: 2 };
const skill = (op: Operation) => ({ standard: "4.8", skills: [op.kind === "multiply" ? "4.8-multiplication-facts" : "4.8-division-facts"] });
const wrongOf = (values: number[], description = "One more than the answer.") => values.map((w) => ({ value: num(w), cause: "careless", description, step: null }));
const printed = (op: Operation) => `${op.operands[0]} ${op.kind === "multiply" ? "×" : "÷"} ${op.operands[1]} = ?`;

/** A package from an operation, with its own worked steps. */
function opPkg(text: string, operation: Operation, easier: Operation, wrong: number[] = []): OperationPackage {
  const value = (op: Operation) => { const [a, b] = op.operands as [number, number]; return op.kind === "multiply" ? a * b : a / b; };
  return {
    ...base, id: `t-${text}`, text, skill: skill(operation),
    answer: { value: num(value(operation)), accepted: [], unit: null }, operation, steps: workedSteps(operation),
    wrongAnswers: wrongOf(wrong.length ? wrong : [value(operation) + 1]),
    easierExample: { text: printed(easier), operation: easier, answer: num(value(easier)), steps: workedSteps(easier) },
  } as OperationPackage;
}

/** A framed missing factor ("80 × ? = 11200"), as Maya's missing-number code builds it. */
function missingPkg(known: number, total: number, easier: [number, number]): OperationPackage {
  const w = missingWork({ sign: "×", known, unknownFirst: false, total })!;
  const e = missingWork({ sign: "×", known: easier[0], unknownFirst: false, total: easier[1] })!;
  return {
    ...base, id: `m-${known}-${total}`, text: `${known} × ? = ${total}`, operationSource: "maya-teaching",
    answer: { value: num(w.answer), accepted: [], unit: null }, operation: w.operation, steps: w.steps, skill: skill(w.operation), wrongAnswers: wrongOf([w.answer + 1]),
    easierExample: { text: `${easier[0]} × ? = ${easier[1]}`, operation: e.operation, answer: num(e.answer), steps: e.steps },
  } as OperationPackage;
}

const mul = (a: number, b: number): Operation => ({ kind: "multiply", operands: [a, b] });
const div = (a: number, b: number): Operation => ({ kind: "divide", operands: [a, b] });

const P = {
  fact: opPkg("3 × 2 = ?", mul(3, 2), mul(2, 2), [7]),
  factCarry: opPkg("9 × 4 = ?", mul(9, 4), mul(2, 4)),
  tens: opPkg("3 × 10 = ?", mul(3, 10), mul(2, 10)),
  partials: opPkg("6 × 440 = ?", mul(6, 440), mul(2, 20)),
  partials880: opPkg("8 × 880 = ?", mul(8, 880), mul(2, 20)),
  story: opPkg("Each jar has 373 toy cars. Amara has 6 of them. How many toy cars in all?", mul(373, 6), mul(12, 2)),
  tensByTens: opPkg("40 × 30 = ?", mul(40, 30), mul(20, 10)),
  divide: opPkg("2 × ? = 1340", div(1340, 2), div(8, 2)),
  divide60: opPkg("60 × ? = 4800", div(4800, 60), div(120, 60)),
  zeros: missingPkg(80, 11200, [20, 800]),
  trial: missingPkg(244, 1464, [122, 366]),
};

describeTutorKind(multiplyKind, Object.values(P));

describe("multiply kind: what it fits", () => {
  it("leaves a die question filed as a division to the controller", () => {
    expect(multiplyKind.fits(opPkg("Roll a die numbered 1 to 8. How many of the numbers are odd?", div(8, 2), div(4, 2)))).toBe(false);
    expect(multiplyKind.fits(opPkg("Roll a die numbered 1 to 12. How many of the numbers are even?", div(12, 2), div(4, 2)))).toBe(false);
  });
  it("leaves a package whose steps are not code's own to the controller", () => {
    const pkg = P.partials;
    expect(multiplyKind.fits({ ...pkg, steps: pkg.steps.slice(1) })).toBe(false);
    expect(multiplyKind.fits({ ...pkg, text: "6 × 441 = ?" })).toBe(false);
  });
  it("leaves a claim or a comparison to another family", () => {
    const pkg = P.fact;
    expect(multiplyKind.fits({ ...pkg, steps: [...pkg.steps.slice(0, -1), { id: "claim", kind: "claim-compare", relation: "equal", value: 6, shown: 6, holds: true }, pkg.steps.at(-1)!] } as OperationPackage)).toBe(false);
  });
  it("opens a tutor call on each shape (the session admits every test package)", async () => {
    for (const pkg of Object.values(P)) {
      let now = Date.UTC(2026, 10, 15);
      const session = createTextSession({ callId: `open-${pkg.id}`, package: pkg, model: conversationalFake({ answer: () => reply("What is the first step?", "guide") }), clock: () => (now += 100), mathReviewer: fakeMathReviewer(), reviewer: fakeTalkReviewer(), tutor: true });
      const opening = await session.start();
      expect(opening.ended, pkg.text).toBeNull();
      expect(session.session.tutor, pkg.text).toBeDefined();
    }
  });
  it("is the registry's kind for each shape", () => {
    for (const pkg of Object.values(P)) expect(tutorKindOf(pkg)?.id).toBe("multiply");
  });
});

describe("multiply kind: numberMeaning names real mistakes", () => {
  it("adding instead of multiplying", () => expect(multiplyKind.numberMeaning(P.fact, 5)).toMatch(/likely mistake: added 3 and 2/));
  it("a dropped zero and an extra zero", () => {
    expect(multiplyKind.numberMeaning(P.partials, 264)).toMatch(/likely mistake: a zero dropped/);
    expect(multiplyKind.numberMeaning(P.partials, 26400)).toMatch(/likely mistake: one zero too many/);
  });
  it("a partial product in the wrong place", () => {
    // 6 × 440: the tens row 240 written as 24, then 24 + 2400.
    expect(multiplyKind.numberMeaning(P.partials, 2424)).toMatch(/likely mistake: the tens row put in the wrong place/);
  });
  it("a carry forgotten in a product", () => {
    // 373 × 6 = 2238; with no carries 8, 2 and 8 are written: 828.
    expect(multiplyKind.numberMeaning(P.story, 828)).toMatch(/likely mistake: a carry left out/);
  });
  it("one group too many in a fact", () => expect(multiplyKind.numberMeaning(P.factCarry, 45)).toMatch(/one group too many/));
  it("a 0 left out of the quotient, and multiplying instead of dividing", () => {
    expect(multiplyKind.numberMeaning(P.divide, 67)).toMatch(/a 0 left out of the quotient/);
    expect(multiplyKind.numberMeaning(P.divide, 2680)).toMatch(/multiplied 1340 by 2 instead of dividing/);
  });
  it("zeros taken off one number only", () => expect(multiplyKind.numberMeaning(P.zeros, 1400)).toMatch(/zeros taken off only one number/));
  it("a wrong try", () => expect(multiplyKind.numberMeaning(P.trial, 7)).toMatch(/244 × 7 = 1708, which is too big/));
  it("the package's own wrong answers", () => expect(multiplyKind.numberMeaning(P.fact, 7)).toMatch(/likely mistake: one more than the answer/));
  it("right for a step", () => {
    expect(multiplyKind.numberMeaning(P.partials, 240)).toMatch(/right for the tens row/);
    expect(multiplyKind.numberMeaning(P.divide, 13)).toMatch(/number divided/);
    expect(multiplyKind.numberMeaning(P.divide, 670)).toMatch(/right answer/);
  });
});

describe("multiply kind: claims in words and digits", () => {
  const ctx = (pkg: OperationPackage) => ({ stance: "none" as const, answer: (pkg.answer.value as { value: number }).value, claims: (x: string) => multiplyKind.claimProblems(pkg, x) });
  const ok = (pkg: OperationPackage, x: string) => checkTutorSay(x, ctx(pkg)).ok;
  it("passes true claims", () => {
    for (const x of ["6 times 440 is 2640.", "6 × 400 = 2400.", "3 tens times 2 is 6 tens.", "So 6 × 440 = 2640."]) expect(ok(P.partials, x), x).toBe(true);
    for (const x of ["1340 divided by 2 is 670.", "The missing number is 670.", "670 is the missing number.", "2 goes into 13 6 times.", "13 ÷ 2 = 6 R 1."]) expect(ok(P.divide, x), x).toBe(true);
    for (const x of ["11200 ÷ 80 is the same as 1120 ÷ 8.", "1120 ÷ 8 = 140.", "The missing number is 140."]) expect(ok(P.zeros, x), x).toBe(true);
  });
  it("reads equal groups, halves and doubles itself (the core reads groups, not halves or doubles)", () => {
    expect(multiplyKind.claimProblems(P.partials, "Double 670 is 1340.")).toEqual([]);
    expect(ok(P.partials, "6 groups of 440 is 2640.")).toBe(true);
    expect(ok(P.partials, "6 groups of 440 is 2600.")).toBe(false);
    expect(multiplyKind.claimProblems(P.divide, "Half of 1340 is 670.")).toEqual([]);
    for (const x of ["Double 670 is 1300.", "Half of 1340 is 680."]) expect(multiplyKind.claimProblems(P.divide, x).length, x).toBe(1);
  });
  it("refuses false claims, both ways", () => {
    for (const x of ["6 times 440 is 2650.", "6 × 440 = 2440.", "6 groups of 440 is 2600.", "3 tens times 2 is 5 tens."]) expect(ok(P.partials, x), x).toBe(false);
    for (const x of ["1340 divided by 2 is 680.", "The missing number is 67.", "67 is the missing number.", "Half of 1340 is 680.", "2 goes into 13 7 times.", "13 ÷ 2 = 6 R 2.", "2 goes into it a few times."]) expect(ok(P.divide, x), x).toBe(false);
    expect(ok(P.trial, "The missing number is 7.")).toBe(false);
    expect(ok(P.trial, "The missing number is 6.")).toBe(true);
  });
});

describe("multiply kind: the fallback question", () => {
  it("asks the next step in a closed plain math form with times or divided by", () => {
    expect(multiplyKind.stepQuestion(P.fact, [])).toBe("What is 3 times 2?");
    expect(multiplyKind.stepQuestion(P.partials, [])).toBe("What is 6 times 4?");
    expect(multiplyKind.stepQuestion(P.partials, ["r2-ones", "r2-tens"])).toBe("What is 6 times 40?");
    expect(multiplyKind.stepQuestion(P.divide, [])).toBe("What is 13 divided by 2?");
    expect(multiplyKind.stepQuestion(P.zeros, [])).toBe("What is 11 divided by 8?");
    expect(multiplyKind.stepQuestion(P.trial, [])).toBe("What is 244 times 7?");
    for (const pkg of Object.values(P)) {
      const q = multiplyKind.stepQuestion(pkg, []);
      expect(q, pkg.text).not.toBeNull();
      expect(plainTeaching(q!), q!).toBe(true);
    }
  });
  it("gives no question when every step is done", () => {
    expect(multiplyKind.stepQuestion(P.fact, multiplyKind.steps(P.fact).map((s) => s.id))).toBeNull();
  });
  it("asks the sum of the rows with plus", () => {
    const done = multiplyKind.steps(P.partials).filter((s) => !s.id.startsWith("sum")).map((s) => s.id);
    expect(multiplyKind.stepQuestion(P.partials, done)).toBe("What do you get for 0 plus 0?");
  });
});

// The Sol review of #1014 (#1020): one binding test per item, each with a true-sentence or right-answer control.
describe("#1020 review fixes", () => {
  const ctx = (pkg: OperationPackage) => ({ stance: "none" as const, answer: (pkg.answer.value as { value: number }).value, claims: (x: string) => multiplyKind.claimProblems(pkg, x) });
  const ok = (pkg: OperationPackage, x: string) => checkTutorSay(x, ctx(pkg)).ok;

  it("1. reads claims with number words, and refuses a false one", () => {
    for (const x of ["The missing number is sixty-seven.", "Half of thirteen is thirteen.", "Double twenty is twenty.", "Twice twenty is thirty.", "Half of 1340 is 670 and half of 13 is 7."]) expect(ok(P.divide, x), x).toBe(false);
    // Controls: the same forms, true.
    // (The core's own reader refuses any "half of 20 is 10" today; the kind's reader passes the true forms.)
    for (const x of ["Half of twenty is ten.", "Double twenty is forty.", "Twice 20 is 40.", "Ten is half of twenty."]) expect(multiplyKind.claimProblems(P.divide, x), x).toEqual([]);
    expect(ok(P.divide, "What is the missing number?")).toBe(true);
    expect(ok(P.fact, "The missing number is six.")).toBe(true);
    expect(ok(P.divide, "The missing number is six hundred seventy.")).toBe(true);
  });

  it("2. checks every \"goes into\" claim and its remainder", () => {
    for (const x of ["2 goes into 13 6 times with a remainder of 2.", "2 goes into 13 6 times, and 2 goes into 14 8 times.", "2 goes into 13 6 times with 3 left over.", "2 goes into 13 6 times, remainder 2.", "2 goes into 13 6 times with some more."]) expect(ok(P.divide, x), x).toBe(false);
    // Controls: true, with and without the remainder.
    for (const x of ["2 goes into 13 6 times with a remainder of 1.", "2 goes into 13 6 times, and 2 goes into 14 7 times.", "2 goes into 13 6 times with 1 left over.", "2 goes into 14 7 times."]) expect(ok(P.divide, x), x).toBe(true);
  });

  it("3. keeps a right trial product as work, and the tried factor as not the answer", async () => {
    expect(multiplyKind.workValues(P.trial)).toContain(1708);
    expect(multiplyKind.numberMeaning(P.trial, 1708)).toMatch(/right for the try 244 × 7 = 1708, which is too big/);
    expect(multiplyKind.numberMeaning(P.trial, 7)).toMatch(/likely mistake/);
    expect(multiplyKind.workValues(P.trial)).not.toContain(7);
    // Through the call: Maya says the child's true try product is right, and it reaches the child.
    const say = "Yes, 244 times 7 is 1708. Try a smaller number.";
    let now = Date.UTC(2026, 10, 15);
    const session = createTextSession({ callId: "f2-trial", package: P.trial, model: conversationalFake({ answer: () => reply(say, "guide") }), clock: () => (now += 100), mathReviewer: fakeMathReviewer(), reviewer: fakeTalkReviewer(), tutor: true });
    await session.start();
    expect((await session.child("244 times 7 is 1708.")).say).toEqual([say]);
    // Control: a "yes" to the tried factor as the answer is still refused.
    const yesToSeven = "Yes, 7 is the missing number.";
    let later = Date.UTC(2026, 10, 15);
    const wrong = createTextSession({ callId: "f2-trial-wrong", package: P.trial, model: conversationalFake({ answer: () => reply(yesToSeven, "guide") }), clock: () => (later += 100), mathReviewer: fakeMathReviewer(), reviewer: fakeTalkReviewer(), tutor: true });
    await wrong.start();
    expect((await wrong.child("Is it 7?")).say).not.toEqual([yesToSeven]);
  });

  it("4. does not fit a story whose words are not its operation's", () => {
    expect(multiplyKind.fits(opPkg("A ribbon is 6 cm long. Each piece is 2 cm long. How many pieces can be cut?", mul(6, 2), mul(2, 2)))).toBe(false);
    expect(multiplyKind.fits(opPkg("Sam shares 12 apples equally with 3 friends. How many does each get?", div(12, 3), div(8, 2)))).toBe(false);
    // Pre-launch check 2: "How many in all?" of 12 apples and 3 pears asks for 15, not 12 × 3 (no closed product ask).
    expect(multiplyKind.fits(opPkg("12 apples and 3 pears are in a bag. How many in all?", mul(12, 3), mul(2, 2)))).toBe(false);
    // Controls: product stories fit.
    expect(multiplyKind.fits(P.story)).toBe(true);
    expect(multiplyKind.fits(opPkg("A bus carries 60 people. How many people can 100 buses carry?", mul(60, 100), mul(20, 10)))).toBe(true);
    expect(multiplyKind.fits(opPkg("Kai buys 20 packs of 3 books. How many books is that?", mul(20, 3), mul(2, 2)))).toBe(true);
  });
});
