import { describe, expect, it } from "vitest";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { FIXTURES } from "@/lib/maya-gate/fixtures";
import { teachingPackage } from "@/lib/maya-teaching";
import { storedPlaceValue } from "@/lib/maya-teaching/place-value-samples";
import { conversationalFake, reply } from "@/lib/maya-model-fake";
import { fakeTalkReviewer } from "@/lib/maya-talk-review";
import { judgment } from "@/lib/maya/tutor";
import { fakeMathReviewer } from "@/lib/maya-math-review";
import { createTextSession } from "@/lib/maya-text";
import { workedSteps, type OperationPackage } from "@/lib/question-package";
import { createSession } from "./session";
import { checkTutorSay, tutorKind } from "./tutor";

// Pre-launch review of the tutor core, part B (true math), on main 2a6e4542d: each false sentence below passed every
// check and reached the child. Each finding has its binding case (refused now) and a true control (still said).

const sub = SAMPLE_PACKAGES["subtract-52-28"] as OperationPackage;
const add = SAMPLE_PACKAGES["add-27-39"] as OperationPackage;
const frac = createSession({ callId: "fraction", package: FIXTURES.COMPARE_FRACTIONS, conversational: true, tutor: true }).package!;
const pv = teachingPackage(storedPlaceValue({ variant: "1.2", n0: 48942, place: "ten thousands" })) as OperationPackage;
const divOp = { kind: "divide" as const, operands: [1340, 2] as [number, number] };
const easy = { kind: "divide" as const, operands: [8, 2] as [number, number] };
const div = {
  ...sub, id: "probe-div", text: "1340 ÷ 2 = ?", operation: divOp, steps: workedSteps(divOp),
  answer: { value: { type: "number" as const, value: 670 }, accepted: [], unit: null },
  wrongAnswers: [{ value: { type: "number" as const, value: 999 }, cause: "careless", description: "A made-up error.", step: null }],
  easierExample: { text: "8 ÷ 2 = ?", operation: easy, answer: { type: "number" as const, value: 4 }, steps: workedSteps(easy) },
} as OperationPackage;
const bigOp = { kind: "add" as const, operands: [102, 1] as [number, number] };
const big = {
  ...add, id: "add-102-1", text: "102 + 1 = ?", operation: bigOp, steps: workedSteps(bigOp),
  answer: { value: { type: "number" as const, value: 103 }, accepted: [], unit: null },
  wrongAnswers: [{ value: { type: "number" as const, value: 104 }, cause: "careless", description: "One too many.", step: null }],
} as OperationPackage;

/** The check context the session gives checkTutorSay for this question. */
function context(pkg: OperationPackage) {
  const k = tutorKind(pkg);
  const op = k.op?.(pkg);
  return { stance: "none" as const, claims: (s: string) => k.claimProblems(pkg, s), trades: k.workValues(pkg), ...(op ? { op } : {}), ...(pkg.answer.value.type === "number" ? { answer: pkg.answer.value.value } : {}) };
}

/** One tutor turn where the model says `text`: what the child hears. */
async function speak(pkg: OperationPackage, text: string) {
  let now = Date.UTC(2026, 10, 15);
  const model = conversationalFake({ answer: () => reply(text, "guide") });
  const s = createTextSession({ callId: "probe-" + text, package: pkg, model, clock: () => (now += 100), random: 3, mathReviewer: fakeMathReviewer(), reviewer: fakeTalkReviewer((input) => (judgment(input.line).any ? { verdict: "pass" } : { verdict: "fail", rules: ["math"], reason: "The math is false." })), tutor: true });
  await s.start();
  const out = await s.child("Please help me.");
  await s.finish({ reason: "child_stopped" });
  return out.say;
}

async function refused(pkg: OperationPackage, line: string) {
  expect(checkTutorSay(line, context(pkg)), line).toMatchObject({ ok: false, reason: "false_equation" });
  expect(await speak(pkg, line), line).not.toEqual([line]);
}
async function said(pkg: OperationPackage, line: string) {
  expect(checkTutorSay(line, context(pkg)), line).toMatchObject({ ok: true });
  expect(await speak(pkg, line), line).toEqual([line]);
}

describe("pre-launch review B: false math the child heard is refused", () => {
  it("F01: the whole answer value, in words, decimals and expressions, and its negation", async () => {
    for (const line of ["The answer is twenty-five.", "The answer is not 24.", "The answer is 24 plus 1.", "The answer is 24.5.", "Twenty-five is the answer.", "The answer is about 25."]) await refused(sub, line);
    for (const line of ["The answer is twenty-four.", "The answer is 24.", "The answer is not 25.", "The answer is 2 tens and 4 ones."]) await said(sub, line);
  });
  it("F02: a comparison that does not hold is refused before any count exemption", async () => {
    for (const line of ["12 is 5 more than 8.", "12 is 4 less than 8.", "4 is greater than 8.", "8 is not bigger than 2.", "2 ones is more than 8 ones."]) await refused(sub, line);
    for (const line of ["12 is 4 more than 8.", "Since 2 is smaller than 8, we take a ten and the 2 becomes 12.", "12 is greater than 8.", "8 is not less than 2."]) await said(sub, line);
  });
  it("F03: an object count times the object's stated unit", async () => {
    for (const line of ["4 tens is 4 sticks of one.", "4 tens is 4 sticks of a hundred."]) await refused(sub, line);
    await said(sub, "Let's use a picture: 4 tens is 4 sticks of ten, and we take away 2 of those sticks.");
  });
  it("F04: spoken fractions in equality and negation", async () => {
    for (const line of ["Five sixths is three sixths.", "Five sixths is not five sixths.", "Three sixths is greater than five sixths."]) await refused(frac, line);
    for (const line of ["5/6 is greater than 3/6.", "Five sixths is greater than three sixths."]) await said(frac, line);
  });
  it("F05: \"which is\" and \"that's\" name the quantity before them", async () => {
    for (const line of ["12 minus 8 is 4 ones, which is 40.", "We borrow 1 ten, that's 100 ones."]) await refused(sub, line);
    await said(sub, "Yes, that's it: we borrow 1 ten, which is 10 ones, so 2 ones became 12 ones.");
    await said(add, "So 7 + 9 = 16, which is 1 ten and 6 ones.");
  });
  it("F06: brackets are read", async () => {
    for (const line of ["2 times (3 plus 4) is 7.", "(3 plus 4) times 2 is 10."]) await refused(sub, line);
    await said(sub, "2 times (3 plus 4) is 14.");
  });
  it("F09: a trade with no units follows the operation", async () => {
    await refused(add, "When we carry, 16 becomes 26.");
    await said(add, "When we carry, 16 becomes 6.");
    await said(sub, "The 2 becomes 12.");
  });
});

describe("pre-launch review B: true math the reader refused", () => {
  it("F16: both whole sides of an equation", async () => {
    for (const line of ["12 minus 8 equals 2 plus 2.", "12 minus 8 is not 4 plus 1."]) await said(sub, line);
    await refused(sub, "12 minus 8 equals 2 plus 3.");
  });
  it("F17: a remainder in number words", async () => {
    await said(div, "Thirteen divided by two is six remainder one.");
    await refused(div, "Thirteen divided by two is six remainder two.");
  });
  it("F18: the value of a digit in a named number", async () => {
    await said(pv, "In 48,942, the value of the 4 is 40,000.");
    await said(pv, "In 48,942, the value of the 8 is 8,000.");
    await refused(pv, "In 48,942, the value of the 8 is 800.");
  });
  it("F19: compound number words are one value", async () => {
    await said(big, "One hundred and two plus one is 103.");
    await refused(big, "One hundred and two plus one is 104.");
  });
});
