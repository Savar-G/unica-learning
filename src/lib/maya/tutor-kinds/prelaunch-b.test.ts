// Pre-launch review, part B (true math), the kind findings F07, F08, F10 to F15. Each case is the reviewer's own (it
// reached the child on main 2a6e4542d); each has a true control beside it, so a fix that refuses everything fails too.
import { describe, expect, it } from "vitest";
import { FIXTURES } from "@/lib/maya-gate/fixtures";
import { conversationalFake, reply } from "@/lib/maya-model-fake";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { fakeTalkReviewer } from "@/lib/maya-talk-review";
import { judgment } from "@/lib/maya/tutor";
import { fakeMathReviewer } from "@/lib/maya-math-review";
import { teachingPackage } from "@/lib/maya-teaching";
import { storedPlaceValue } from "@/lib/maya-teaching/place-value-samples";
import { createTextSession } from "@/lib/maya-text";
import { operationResult, workedSteps, type Operation, type OperationPackage } from "@/lib/question-package";
import { createSession } from "../session";
import { checkTutorSay } from "../tutor";
import { tutorKindOf } from "./index";

const sub = SAMPLE_PACKAGES["subtract-52-28"] as OperationPackage;
const add = SAMPLE_PACKAGES["add-27-39"] as OperationPackage;

/** A package of `operation` with its own worked steps (the reviewer's helper). */
function make(text: string, operation: Operation): OperationPackage {
  const easy: Operation = operation.kind === "divide" ? { kind: "divide", operands: [8, 2] } : operation.kind === "evaluate" ? { kind: "evaluate", operands: ["2 × 3 + 4"] } : { kind: "multiply", operands: [2, 2] };
  return {
    ...sub, id: `probe-${text}`, text, operation, answer: { value: operationResult(operation), accepted: [], unit: null }, steps: workedSteps(operation),
    wrongAnswers: [{ value: { type: "number", value: 999 }, cause: "careless", description: "A made-up error.", step: null }],
    easierExample: { text: "2 × 2 = ?", operation: easy, answer: operationResult(easy), steps: workedSteps(easy) },
  } as OperationPackage;
}

const mul = make("3 × 2 = ?", { kind: "multiply", operands: [3, 2] });
const div = make("1340 ÷ 2 = ?", { kind: "divide", operands: [1340, 2] });
const pv = teachingPackage(storedPlaceValue({ variant: "1.2", n0: 48942, place: "ten thousands" })) as OperationPackage;
const claim = createSession({ callId: "claim-gt", package: FIXTURES.CLAIM_GT, conversational: true, tutor: true }).package as OperationPackage;

/** Maya's check of one sentence on a package, with the kind's own facts. */
function say(pkg: OperationPackage, line: string) {
  const k = tutorKindOf(pkg)!;
  return checkTutorSay(line, { stance: "none", claims: (x) => k.claimProblems(pkg, x), trades: k.workValues(pkg), ...(k.op?.(pkg) ? { op: k.op(pkg)! } : {}), ...(pkg.answer.value.type === "number" ? { answer: pkg.answer.value.value } : {}) });
}

/** One turn through the text adapter: the model proposes `line` after the child's words. */
async function speak(pkg: unknown, line: string, child = "Please help me.") {
  let now = Date.UTC(2026, 10, 15);
  const model = conversationalFake({ answer: () => reply(line, "guide") });
  const s = createTextSession({ callId: `prelaunch-${line}`, package: pkg as OperationPackage, model, clock: () => (now += 100), random: 3, tutor: true, mathReviewer: fakeMathReviewer(), reviewer: fakeTalkReviewer((input) => (judgment(input.line).any ? { verdict: "pass" } : { verdict: "fail", rules: ["math"], reason: "The math is false." })) });
  await s.start();
  const out = await s.child(child);
  const trace = await s.finish({ reason: "child_stopped" });
  return { say: out.say, counts: trace.counts };
}

/** A false sentence: code refuses it, and the child never hears it. */
async function refused(pkg: OperationPackage, line: string, child?: string, source: unknown = pkg) {
  expect(say(pkg, line), line).toMatchObject({ ok: false });
  expect((await speak(source, line, child)).say, line).not.toEqual([line]);
}

/** A true sentence: code lets it through, and the child hears it. */
async function passes(pkg: OperationPackage, line: string, child?: string, source: unknown = pkg) {
  expect(say(pkg, line), line).toMatchObject({ ok: true });
  expect((await speak(source, line, child)).say, line).toEqual([line]);
}

/** Whether the tutor teaches the package (else the controller keeps it). */
const tutored = (pkg: OperationPackage) => createSession({ callId: `fit-${pkg.id}-${pkg.text}`, package: pkg, conversational: true, tutor: true }).tutor !== undefined;

describe("F07: a remainder after \"goes into\" is read whole", () => {
  it("refuses \"2 goes into 13 6 times and 2 left over\"", () => refused(div, "2 goes into 13 6 times and 2 left over."));
  it("refuses a remainder said in a form code cannot read", async () => {
    for (const line of ["2 goes into 13 6 times and there are 2 left over.", "2 goes into 13 6 times, so the remainder is 2.", "2 goes into 13 6 times and the rest is 2."]) expect(say(div, line), line).toMatchObject({ ok: false });
  });
  it("lets the true remainder through", async () => {
    for (const line of ["2 goes into 13 6 times and 1 left over.", "2 goes into 13 6 times with 1 left over.", "2 goes into 13 6 times, remainder 1.", "2 goes into 13 6 times."]) expect(say(div, line), line).toMatchObject({ ok: true });
    await passes(div, "2 goes into 13 6 times and 1 left over.");
  });
});

describe("F08: \"the value of\" is read on each side of a comparison", () => {
  it("refuses the thousands digit (8) greater than the value of the ten thousands digit (40,000)", () => refused(pv, "The thousands digit is greater than the value of the ten thousands digit."));
  it("refuses the value of the thousands digit (8,000) the same as the ten thousands digit (4)", () => expect(say(pv, "The value of the thousands digit is the same as the ten thousands digit.")).toMatchObject({ ok: false }));
  it("lets true comparisons through", async () => {
    for (const line of ["The thousands digit is greater than the ten thousands digit.", "The value of the ten thousands digit is greater than the value of the thousands digit.", "The value of the ten thousands digit is greater than the thousands digit."]) expect(say(pv, line), line).toMatchObject({ ok: true });
    await passes(pv, "The value of the ten thousands digit is greater than the value of the thousands digit.");
  });
});

describe("F10: a carry that does not happen is not a value of the work", () => {
  it("does not affirm 0 on 3 × 2", async () => {
    expect(tutorKindOf(mul)!.workValues(mul)).not.toContain(0);
    expect(tutorKindOf(mul)!.numberMeaning(mul, 0)).not.toBe("a number of the work");
    expect((await speak(mul, "Yes, that is right.", "0")).say).not.toEqual(["Yes, that is right."]);
  });
  it("keeps a 0 that is a real result, and affirms the answer", async () => {
    const tens = make("5 × 2 = ?", { kind: "multiply", operands: [5, 2] });
    expect(tutorKindOf(tens)!.workValues(tens)).toContain(0);
    const carry = make("9 × 4 = ?", { kind: "multiply", operands: [9, 4] });
    expect(tutorKindOf(carry)!.workValues(carry)).toContain(3);
    expect((await speak(mul, "Yes, that is right.", "6")).say).toEqual(["Yes, that is right."]);
  });
});

describe("F11: a question at the end does not excuse an earlier statement", () => {
  it("refuses \"The answer is no, shall we circle it?\" when the answer is yes", () => refused(claim, "The answer is no, shall we circle it?", undefined, FIXTURES.CLAIM_GT));
  // Final check 12: a form the kind does not match is no proof that the sentence is false. It is refused, or it goes to
  // the math review; never passed by code alone.
  it("never passes \"The missing number is definitely 671, shall we write it?\" on code alone", () => {
    const line = "The missing number is definitely 671, shall we write it?";
    const r = say(div, line);
    expect(!r.ok || r.math.includes(line), line).toBe(true);
  });
  it("lets a true statement with a question, and a plain question, through", async () => {
    for (const line of ["Is the answer yes or no?", "Do you think the answer is no?", "What do we circle, yes or no?"]) expect(say(claim, line), line).toMatchObject({ ok: true });
    for (const line of ["What is the missing number?", "Can you find the missing number?"]) expect(say(div, line), line).toMatchObject({ ok: true });
    await passes(claim, "The answer is yes, shall we circle it?", undefined, FIXTURES.CLAIM_GT);
    await passes(div, "The missing number is 670, shall we write it?");
  });
});

describe("F12: a story fits the column kind only when its words give the stored operation", () => {
  it("leaves \"gets 28 more ... in all\" stored as 52 − 28 to the controller", async () => {
    const pkg = { ...sub, text: "Mia has 52 counters and gets 28 more. How many counters does she have in all?" };
    expect(tutorKindOf(pkg)).toBeNull();
    expect(tutored(pkg)).toBe(false);
    expect((await speak(pkg, "The answer is 24.")).say).not.toEqual(["The answer is 24."]);
  });
  it("leaves a story with a third number, or a printed sign that disagrees, to the controller", () => {
    expect(tutorKindOf({ ...sub, text: "Mia has 52 counters. She gives 28 away and 5 more get lost. How many are left?" })).toBeNull();
    expect(tutorKindOf({ ...add, text: "Mia has 27 counters and gives 39 away. How many are left?" })).toBeNull();
    expect(tutorKindOf({ ...sub, text: "52 + 28 = ?" })).toBeNull();
  });
  it("still fits stories whose words agree", () => {
    for (const text of ["Mia has 52 counters and gives 28 away. How many counters are left?", "Mia scores 52 points. A friend scores 28 points. How many more points does Mia score?", "52 − 28 = ?", "52 - 28 = ?"]) expect(tutorKindOf({ ...sub, text })?.id, text).toBe("column");
    for (const text of ["Mia has 27 counters. Mia gets 39 more. How many counters does Mia have now?", "Mia collected 27 tickets and a friend collected 39. How many tickets is that in all?", "27 + 39 = ?", "27+39=?"]) expect(tutorKindOf({ ...add, text })?.id, text).toBe("column");
  });
});

describe("F13: a product story with an extra step does not fit", () => {
  it("leaves \"6 jars of 440, then 10 removed\" to the controller", async () => {
    const pkg = make("Each of 6 jars has 440 counters. 10 counters are removed. How many remain?", { kind: "multiply", operands: [6, 440] });
    expect(tutorKindOf(pkg)).toBeNull();
    expect(tutored(pkg)).toBe(false);
    expect((await speak(pkg, "The answer is 2640.")).say).not.toEqual(["The answer is 2640."]);
  });
  it("still fits a product story with only its two numbers", () => {
    for (const text of ["Each of 6 jars has 440 counters. How many counters in all?", "Each jar has 440 toy cars. Amara has 6 of them. How many toy cars in all?", "A bus carries 440 people. How many people can 6 buses carry?", "Omar buys 6 packs of 440 books. How many books is that?"]) expect(tutorKindOf(make(text, { kind: "multiply", operands: [6, 440] }))?.id, text).toBe("multiply");
  });
});

describe("F14: a printed expression must be the stored one", () => {
  it("leaves printed 9 × 880 + 9 × 40 stored as 9 × 880 + 9 × 50 to the controller", async () => {
    const pkg = make("What is 9 × 880 + 9 × 40?", { kind: "evaluate", operands: ["9 × 880 + 9 × 50"] });
    expect(tutorKindOf(pkg)).toBeNull();
    expect(tutored(pkg)).toBe(false);
    expect((await speak(pkg, "The answer is 8370.")).say).not.toEqual(["The answer is 8370."]);
  });
  it("leaves a printed missing factor that disagrees to the controller", () => {
    expect(tutorKindOf(make("9 × ? = 8150 − 400", { kind: "evaluate", operands: ["(8150 − 500) ÷ 9"] }))).toBeNull();
    expect(tutorKindOf(make("What is 9 × 880 − 9 × 40?", { kind: "evaluate", operands: ["9 × 880 + 9 × 40"] }))).toBeNull();
  });
  it("still fits a printed expression that agrees", () => {
    for (const [text, expression] of [["What is 9 × 880 + 9 × 40?", "9 × 880 + 9 × 40"], ["9 × ? = 8150 − 500", "(8150 − 500) ÷ 9"], ["98378 + 1000 + 100 = ?", "98378 + 1000 + 100"], ["What is 9 × 880 + 9 × 40?", "(9 × 880) + (9 × 40)"]]) expect(tutorKindOf(make(text, { kind: "evaluate", operands: [expression] }))?.id, text).toBe("evaluate");
  });
});

describe("F15: the printed number and places must be the stored ones", () => {
  it("leaves printed 58942 stored as 48942 to the controller", async () => {
    const pkg = { ...pv, text: "In 58942, what is the value of the digit in the ten thousands place?" };
    expect(tutorKindOf(pkg)).toBeNull();
    expect(tutored(pkg)).toBe(false);
    expect((await speak(pkg, "The answer is 40000.")).say).not.toEqual(["The answer is 40000."]);
  });
  it("leaves a printed place that disagrees to the controller", () => {
    expect(tutorKindOf({ ...pv, text: "In 48942, what is the value of the digit in the thousands place?" })).toBeNull();
    expect(tutorKindOf({ ...pv, text: "In 48,942, what is the value of the digit?" })).toBeNull();
  });
  it("still fits the stored text, with or without commas", () => {
    expect(tutorKindOf(pv)?.id).toBe("place-value");
    expect(tutored(pv)).toBe(true);
    for (const text of ["In 48942, what is the value of the digit in the ten thousands place?", "What is the value of the digit in the ten thousands place of 48,942?"]) expect(tutorKindOf({ ...pv, text })?.id, text).toBe("place-value");
  });
});
