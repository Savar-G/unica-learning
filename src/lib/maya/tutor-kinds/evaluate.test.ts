import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { conversationalFake, reply } from "@/lib/maya-model-fake";
import { createTextSession } from "@/lib/maya-text";
import { fakeTalkReviewer } from "@/lib/maya-talk-review";
import { operationResult, workedSteps, type Operation, type OperationPackage } from "@/lib/question-package";
import { checkTutorSay, tutorFallbackText } from "../tutor";
import { describeTutorKind } from "./contract";
import { evaluateKind, patternOf } from "./evaluate";
import { testKind, tutorKindOf } from "./index";
import { timeAddKind } from "./time-add";

function pkgOf(id: string, text: string, operation: Operation): OperationPackage {
  // The session teaches a package only with an easier example of its own and a known wrong answer.
  const easier: Operation = operation.kind === "time-add" ? { kind: "time-add", operands: [clock(1, 0), { type: "quantity", value: 1, unit: "min" }] } : { kind: "evaluate", operands: ["3 × 4 − 2"] };
  const answer = operationResult(operation);
  return {
    id,
    ref: { source: "workbook", workbookId: "sample", page: 1, question: 1 },
    templateId: null,
    text,
    answer: { value: answer, accepted: [], unit: null },
    operation,
    steps: workedSteps(operation),
    skill: { standard: "4.1", skills: [] },
    level: 16,
    difficulty: 2,
    wrongAnswers: [{ value: { type: "number", value: 999 }, cause: "O9", description: "A made-up mistake", step: null }],
    easierExample: { text: "An easier one.", operation: easier, answer: operationResult(easier), steps: workedSteps(easier) },
  } as OperationPackage;
}

const evaluate = (id: string, text: string, expression: string) => pkgOf(id, text, { kind: "evaluate", operands: [expression] });
const clock = (hours: number, minutes: number) => ({ type: "time" as const, hours, minutes, period: null });
const timeAdd = (id: string, h: number, m: number, add: number) =>
  pkgOf(id, `What time is ${add} minutes after ${h}:${String(m).padStart(2, "0")}?`, { kind: "time-add", operands: [clock(h, m), { type: "quantity", value: add, unit: "min" }] });

const multiStep = evaluate("ms", "What is 9 × 880 + 9 × 40?", "9 × 880 + 9 × 40");
const missingFactor = evaluate("mf", "9 × ? = 8150 − 500", "(8150 − 500) ÷ 9");
const patternStep = evaluate("ps", "A pattern starts at 20 and adds ? each time. The 3rd term is 36.", "(36 − 20) ÷ 2");
const patternTerm = evaluate("pt", "A pattern starts at 44 and adds 11 each time. What is the 4th term?", "44 + 3 × 11");
const story = evaluate("st", "A shop has 5 boxes with 350 buttons in each. It sells 870 buttons. How many buttons are left?", "5 × 350 − 870");
const chain = evaluate("ch", "98378 + 1000 + 100 = ?", "98378 + 1000 + 100");
const bigChain = evaluate("bc", "A town has 941231 people. 30000 move in and 1000 move away. How many live there now?", "941231 + 30000 − 1000");
const perimeter = evaluate("pe", "A rectangle has length 245 m and width 126 m. What is its perimeter in m?", "2 × (245 + 126)");
const time = timeAdd("ta", 6, 13, 50);
const timeOnHour = timeAdd("tb", 9, 0, 40);

describeTutorKind(evaluateKind, [multiStep, missingFactor, patternStep, patternTerm, story, chain, bigChain, perimeter]);

const say = (pkg: OperationPackage, text: string) => checkTutorSay(text, { stance: "none", claims: (x) => tutorKindOf(pkg)!.claimProblems(pkg, x) });

describe("evaluate kind: what it fits", () => {
  it("keeps a package with a printed claim, a pattern it cannot read or an unknown with the controller", () => {
    const claim = { ...evaluate("cl", "True or false: 90 + 2 × 2 is 94.", "90 + 2 × 2") };
    claim.steps = [...claim.steps.slice(0, -1), { id: "claim", kind: "claim-compare", relation: "equal", value: 94, shown: 94, holds: true }, claim.steps.at(-1)!];
    expect(evaluateKind.fits(claim)).toBe(false);
    expect(evaluateKind.fits(evaluate("pu", "A pattern grows in a way. What is the 3rd term?", "20 + 2 × 8"))).toBe(false);
    expect(evaluateKind.fits(pkgOf("al", "3n + 2 when n is 4", { kind: "evaluate", operands: ["3n + 2"], values: { n: 4 } }))).toBe(false);
  });
  it("keeps a package whose step is not the true value", () => {
    const bad = evaluate("bad", "What is 9 × 880 + 9 × 40?", "9 × 880 + 9 × 40");
    bad.steps = bad.steps.map((s) => (s.kind === "operate" && s.id === "e1" ? { ...s, value: 7930 } : s));
    expect(evaluateKind.fits(bad)).toBe(false);
  });
  it("reads the pattern from the text and proves it", () => {
    expect(patternOf(patternStep)).toEqual({ start: 20, step: 8, term: 3, asks: "step" });
    expect(patternOf(patternTerm)).toEqual({ start: 44, step: 11, term: 4, asks: "term" });
  });
});

describe("evaluate kind: number meanings", () => {
  it("names the step values, a skipped step and the order of operations", () => {
    expect(evaluateKind.numberMeaning(multiStep, 7920)).toMatch(/right for step 1/);
    expect(evaluateKind.numberMeaning(multiStep, 7960)).toMatch(/skipped step 2/);
    // 9 × 880 + 9 × 40 worked left to right: ((9 × 880) + 9) × 40.
    expect(evaluateKind.numberMeaning(multiStep, (9 * 880 + 9) * 40)).toMatch(/left to right/);
    expect(evaluateKind.numberMeaning(perimeter, 2 * 245 + 126)).toMatch(/brackets/);
  });
  it("names the pattern's terms and its jump mistakes", () => {
    expect(evaluateKind.numberMeaning(patternStep, 28)).toMatch(/2nd term/);
    expect(evaluateKind.numberMeaning(patternTerm, 44 + 4 * 11)).toMatch(/4 jumps instead of 3/);
    const thirds = evaluate("p3", "A pattern starts at 10 and adds ? each time. The 4th term is 22.", "(22 − 10) ÷ 3");
    expect(evaluateKind.numberMeaning(thirds, 3)).toMatch(/shared the change into 4 jumps/);
  });
});

describe("evaluate kind: pattern claims", () => {
  it("lets a true term claim through and refuses a false one", () => {
    expect(say(patternStep, "The 3rd term is 36.")).toMatchObject({ ok: true });
    expect(say(patternStep, "The 2nd term is 28.")).toMatchObject({ ok: true });
    expect(say(patternStep, "The 3rd term is 28.")).toMatchObject({ ok: false, reason: "false_equation" });
    expect(say(patternStep, "The second term is 30.")).toMatchObject({ ok: false });
  });
  it("checks the jumps, the change each time and the start", () => {
    expect(say(patternStep, "The 3rd term is 2 jumps after the start.")).toMatchObject({ ok: true });
    expect(say(patternStep, "The 3rd term is 3 jumps after the start.")).toMatchObject({ ok: false });
    expect(say(patternStep, "It adds 8 each time.")).toMatchObject({ ok: true });
    expect(say(patternStep, "It adds 9 each time.")).toMatchObject({ ok: false });
    expect(say(patternStep, "It starts at 20.")).toMatchObject({ ok: true });
    expect(say(patternStep, "It starts at 18.")).toMatchObject({ ok: false });
  });
  it("refuses a term claim it cannot read, and any term claim on a question with no pattern", () => {
    expect(say(patternStep, "The 3rd term is the start plus 16.")).toMatchObject({ ok: false });
    expect(say(multiStep, "The 3rd term is 36.")).toMatchObject({ ok: false });
  });
});

describe("time-add kind (not registered for launch, run through testKind)", () => {
  let undo: () => void = () => {};
  beforeAll(() => { undo = testKind(timeAddKind); });
  afterAll(() => undo());
  describeTutorKind(timeAddKind, [time, timeOnHour]);
  it("lets a true clock claim through", () => {
    expect(timeAddKind.claimProblems(time, "50 minutes after 6:13 is 7:03.")).toEqual([]);
    expect(timeAddKind.claimProblems(time, "From 6:13 to 7:00 is 47 minutes.")).toEqual([]);
    expect(timeAddKind.claimProblems(time, "Count on 3 minutes from 7:00 to 7:03.")).toEqual([]);
    expect(timeAddKind.claimProblems(time, "The answer is 7:03.")).toEqual([]);
    expect(timeAddKind.claimProblems(time, "Start at 6:13.")).toEqual([]);
  });
  it("refuses a false clock claim, a time that is not a clock time and a form it cannot read", () => {
    expect(timeAddKind.claimProblems(time, "50 minutes after 6:13 is 6:63.")).not.toEqual([]);
    expect(timeAddKind.claimProblems(time, "50 minutes after 6:13 is 7:13.")).not.toEqual([]);
    expect(timeAddKind.claimProblems(time, "From 6:13 to 7:00 is 37 minutes.")).not.toEqual([]);
    expect(timeAddKind.claimProblems(time, "The answer is 7:13.")).not.toEqual([]);
    expect(timeAddKind.claimProblems(time, "It is 6:63 now.")).not.toEqual([]);
    expect(timeAddKind.claimProblems(time, "So 7:03 comes after the 47 minutes and 3 minutes.")).not.toEqual([]);
    expect(timeAddKind.claimProblems(time, "Then it is 8:15.")).not.toEqual([]);
  });
  it("names the trade mistake and falls back to the whole answer", () => {
    expect(timeAddKind.numberMeaning(time, 63)).toMatch(/only 60 minutes/);
    expect(timeAddKind.numberMeaning(time, 47)).toMatch(/right/);
    expect(tutorFallbackText(time, [], false)).toBe("Let me say that another way. So what is the whole answer?");
  });
});

function session(pkg: OperationPackage, say: (i: number) => string) {
  let now = Date.UTC(2026, 10, 15);
  return createTextSession({ callId: "evaluate-kind", package: pkg, tutor: true, clock: () => (now += 100), model: conversationalFake({ answer: (_, i) => reply(say(i), "guide") }), reviewer: fakeTalkReviewer() });
}

describe("review of #1018", () => {
  it("P1: refuses a pattern claim with the wrong direction, a number in words or a remainder", () => {
    for (const text of ["It subtracts 8 each time.", "The third term is twenty eight.", "The 3rd term is 36 remainder 5.", "It does not add 8 each time.", "The 3rd term is 28 and it adds 8 each time."]) {
      expect(say(patternStep, text), text).toMatchObject({ ok: false });
    }
    // Control: the same claims, true.
    for (const text of ["It adds 8 each time.", "The third term is thirty six.", "The second term is twenty eight.", "So the 2nd term is 28, and the pattern adds 8 each time."]) {
      expect(say(patternStep, text), text).toMatchObject({ ok: true });
    }
  });
  it("P1: Maya never says a false pattern claim in a session", async () => {
    for (const text of ["The third term is twenty eight.", "It subtracts 8 each time."]) {
      const s = session(patternStep, () => text);
      await s.start();
      expect((await s.child("Please help me.")).say, text).not.toContain(text);
    }
    const s = session(patternStep, () => "The second term is twenty eight.");
    await s.start();
    expect((await s.child("Please help me.")).say).toContain("The second term is twenty eight.");
  });
  it("P1: clock-time adds are not in the registry, so the controller keeps them", () => {
    expect(tutorKindOf(time)).toBeNull();
    expect(session(time, () => "Yes.").session.tutor).toBeUndefined();
    // Control: an evaluate question still goes to the tutor core.
    expect(session(multiStep, () => "Yes.").session.tutor).toBeDefined();
  });
  it("P2: a story whose words do not give its operation keeps the controller", () => {
    const buys = evaluate("sb", "A shop has 5 boxes with 350 buttons in each. It buys 870 more buttons. How many buttons are there now?", "5 × 350 − 870");
    expect(evaluateKind.fits(buys)).toBe(false);
    expect(evaluateKind.fits(evaluate("sm", "A shop has 5 boxes with 350 buttons. It sells 870 buttons. How many are left?", "5 × 350 − 870"))).toBe(false);
    // Control: stories whose words give each operation.
    expect(evaluateKind.fits(story)).toBe(true);
    expect(evaluateKind.fits(evaluate("lk", "A lock code is 91963. He adds 1000 to it, then takes 10 off. What is the new code?", "91963 + 1000 − 10"))).toBe(true);
    expect(evaluateKind.fits(evaluate("sc", "A school orders 6 boxes of 412 pencils and 8 boxes of 385 pencils. How many pencils is that in all?", "6 × 412 + 8 × 385"))).toBe(true);
    expect(evaluateKind.fits(bigChain)).toBe(true);
    expect(evaluateKind.fits(evaluate("pl", "A plant is 30 cm tall and grows 4 cm each week. How tall is it after 3 weeks?", "30 + 4 × 3"))).toBe(true);
    expect(evaluateKind.fits(evaluate("bu", "A school sends 8 full buses of 80 people to a game, and 120 people leave early. How many people are still at the game?", "8 × 80 − 120"))).toBe(true);
    expect(evaluateKind.fits(evaluate("lv", "Ava has 50 leaves and gets 11 more each day. How many leaves does she have after 8 days?", "50 + 8 × 11"))).toBe(true);
    expect(evaluateKind.fits(evaluate("lw", "Ava has 50 leaves and loses 11 each day. How many leaves does she have after 4 days?", "50 + 4 × 11"))).toBe(false);
  });
  // P2 "28 for the second term got Not quite": the core fix of 2bddd9950 credits only the next open step's result (16
  // here), which the core credited before it too. A pattern's term (28) or a later step's result is a work value with
  // stance "none", so "Not quite" still passes on both heads. That needs a core change; this kind cannot give it.
  it.todo("core: no \"not quite\" to a pattern term the child names (28 for the 2nd term of 20, 28, 36)");
  it("no \"not quite\" to the next open step's own result", async () => {
    const s = session(patternStep, () => "Not quite.");
    await s.start();
    expect((await s.child("16")).say).not.toContain("Not quite.");
    // Control: a number that is no value of the question may still hear "Not quite".
    const t = session(patternStep, () => "Not quite.");
    await t.start();
    expect((await t.child("15")).say).toContain("Not quite.");
  });
});
