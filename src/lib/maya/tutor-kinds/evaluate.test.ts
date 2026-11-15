import { describe, expect, it } from "vitest";
import { operationResult, workedSteps, type Operation, type OperationPackage } from "@/lib/question-package";
import { checkTutorSay, tutorFallbackText } from "../tutor";
import { describeTutorKind } from "./contract";
import { evaluateKind, patternOf } from "./evaluate";
import { tutorKindOf } from "./index";
import { timeAddKind } from "./time-add";

function pkgOf(id: string, text: string, operation: Operation): OperationPackage {
  const answer = operationResult(operation);
  return {
    id,
    ref: { source: "workbook", workbookId: "sample", page: 1, question: 1 },
    templateId: null,
    text,
    answer: { value: answer, accepted: [], unit: null },
    operation,
    steps: workedSteps(operation),
    skill: { standard: "4.1", skills: ["4.1-multi-step"] },
    level: 16,
    difficulty: 2,
    wrongAnswers: [],
    easierExample: { text, operation, answer, steps: workedSteps(operation) },
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
describeTutorKind(timeAddKind, [time, timeOnHour]);

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

describe("time-add kind: clock claims", () => {
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
