import { describe, expect, it } from "vitest";
import {
  allLineTexts,
  createSession,
  drawOffers,
  fallbacks,
  isEqualForm,
  lineOffers,
  nextActs,
  plainLanguageProblem,
  readAnswer,
  readNumbers,
  readOptionsFor,
  rightForQuestion,
  step,
  TEACHABLE_KINDS,
  TEMPLATES,
  valuesIn,
  type LineOffer,
  type Session,
  type SessionEvent,
} from "@/lib/maya";
import { checkQuestionPackage, workedSteps, type AnswerValue, type Operation, type OperationPackage } from "@/lib/question-package";

// #407 (spec of #400): Maya teaches adding and subtracting fractions. Through the public interface only.

const frac = (numerator: number, denominator: number) => ({ type: "fraction" as const, numerator, denominator });
const mixed = (whole: number, numerator: number, denominator: number) => ({ type: "mixed" as const, whole, numerator, denominator });

function pkgOf(text: string, operation: Operation, easier: Operation, wrong: AnswerValue[] = [frac(1, 99)]): OperationPackage {
  const steps = workedSteps(operation);
  const easierSteps = workedSteps(easier);
  const last = <T extends { kind: string }>(xs: T[]) => xs[xs.length - 1] as unknown as { value: AnswerValue };
  const pkg = {
    id: `wbq-fractions-${text}`,
    ref: { source: "workbook", workbookId: "11111111-1111-4111-8111-111111111111", page: 3, question: 2 },
    templateId: null,
    text,
    answer: { value: last(steps).value, accepted: [], unit: null },
    operation,
    steps,
    skill: { standard: "8.5", skills: ["8.5-add-subtract-unlike"] },
    level: 26,
    difficulty: 2,
    wrongAnswers: wrong.map((value) => ({ value, cause: "F2", description: "Adds the denominators", step: null })),
    easierExample: { text: "An easier one.", operation: easier, answer: last(easierSteps).value, steps: easierSteps },
  } as OperationPackage;
  const check = checkQuestionPackage(pkg);
  if (!check.ok) throw new Error(`${text}: ${check.reason}`);
  return pkg;
}
const add = (a: AnswerValue, b: AnswerValue) => ({ kind: "fraction-add", operands: [a, b] }) as Operation;
const sub = (a: AnswerValue, b: AnswerValue) => ({ kind: "fraction-subtract", operands: [a, b] }) as Operation;
const EASY = add(frac(1, 5), frac(2, 5));

/** 3/4 + 1/8 = 7/8: one fraction changes (C38). */
const C38 = pkgOf("3/4 + 1/8 = ?", add(frac(3, 4), frac(1, 8)), EASY, [frac(4, 12)]);
const SIMPLEST = pkgOf("3/4 + 1/8 = ? Write your answer in simplest form.", add(frac(3, 4), frac(1, 8)), EASY, [frac(4, 12)]);
const PACKAGES = [
  C38,
  pkgOf("1/3 + 1/4 = ?", add(frac(1, 3), frac(1, 4)), EASY), // both change
  pkgOf("3/4 + 5/8 = ?", add(frac(3, 4), frac(5, 8)), EASY), // 11/8, then 1 3/8
  pkgOf("1/4 + 1/4 = ?", add(frac(1, 4), frac(1, 4)), EASY), // 2/4, then 1/2
  pkgOf("5/6 − 1/3 = ?", sub(frac(5, 6), frac(1, 3)), sub(frac(4, 5), frac(1, 5))), // 3/6, then 1/2
  pkgOf("7/8 − 3/8 = ?", sub(frac(7, 8), frac(3, 8)), sub(frac(4, 5), frac(1, 5))),
];

const READ = { fractions: true } as const;
const finalOf = (text: string) => readAnswer(text, READ).final;

describe("reading spoken and typed fractions in a fraction call (#407)", () => {
  it.each([
    ["three quarters", frac(3, 4)],
    ["three fourths", frac(3, 4)],
    ["I got fourteen sixteenths.", frac(14, 16)],
    ["7 eighths", frac(7, 8)],
    ["It's twenty one sixteenths.", frac(21, 16)],
    ["3 over 4", frac(3, 4)],
    ["three over four", frac(3, 4)],
    ["3/4", frac(3, 4)],
    ["3 / 4", frac(3, 4)],
    ["one hundred fourteen over sixteen", frac(114, 16)],
    ["one hundred fourteen sixteenths", frac(114, 16)],
    ["a half", frac(1, 2)],
    ["one eighth", frac(1, 8)],
    ["one and three eighths", mixed(1, 3, 8)],
    ["2 and a half", mixed(2, 1, 2)],
    ["I got 1 and 3/4.", mixed(1, 3, 4)],
    ["1 3/8", mixed(1, 3, 8)],
    ["Four twelfths, no wait, six eighths.", frac(6, 8)],
    ["So I got seven eighths, because 6 plus 1 is 7.", frac(7, 8)],
  ])("reads %j as written", (said, value) => {
    expect(finalOf(said)).toEqual(value);
    expect(readAnswer(said, READ).sure).toBe(true);
  });

  it.each([
    "three quarter", // the plural is missing
    "one quarters",
    "7 8ths",
    "five twenty-fourths", // a denominator of two words
    "three quarters of 8", // an operation
    "six sixty sixteenths",
    "point five eighths",
  ])("leaves %j unread, so Maya confirms it", (said) => {
    expect(finalOf(said)).toBeNull();
  });

  it("reads an ordinal that is not a fraction as an ordinary word", () => {
    expect(finalOf("I tried a third time. I got 66.")).toEqual({ type: "number", value: 66 });
    expect(valuesIn("It's a quarter past 3.", READ)).toEqual([{ type: "number", value: 3 }]);
  });

  it("keeps the old reading outside a fraction call: a spoken fraction is confirmed there", () => {
    expect(readAnswer("three quarters").final).toBeNull();
    expect(readOptionsFor(C38)).toMatchObject({ fractions: true });
  });

  it.each([
    "I have seven over here. Eight.", "7 over here 8", "3 over\n4", "3. / 4",
    "one third of it", "a half of them", "of it, three quarters",
    "-1 3/8", "negative one and three eighths", "+1 3/8", "3/-4",
    "1 5/4", "1 0/4", "0 3/4", "1 and five quarters",
    "one hundred and fourteen sixteenths", "two thousand and three quarters",
    "3 over", "/4", "3/4/5", "3 over 0", "3/0", "3 over four over five",
    "3 over 4.5", "1.5 3/4", "three quarters/5",
    "minus, uh, 1 3/8", "negative I think one and three eighths", "3 over one hundred and fourteen",
    "three. quarters", "three\nquarters", "three over four and five", "1 and 0/4",
    "one whole three eighths", "1 whole 3/8", "one whole three over eight",
    "two full three eighths", "one entire three over eight", "2 unknown 3/8",
    "three eighths whole one", "three over eight full two",
  ])("confirms the complete unsupported expression %j without scoring its parts", (said) => {
    expect(readAnswer(said, READ)).toMatchObject({ kept: [], final: null, sure: false });
    expect(valuesIn(said, READ)).toEqual([]);
    const c = call(C38, said);
    expect(nextActs(c.s).acts).toEqual(["confirm"]);
  });

  it.each([
    ["I got 66", [66]], ["sixty-six", [66]], ["sixty six", [66]],
    ["sixty... no, sixty-six", [60, 66]], ["fifteen or fifty", [15, 50]],
    ["seven plus nine is sixteen", [7, 9, 16]], ["two hundred and five", [205]],
    ["one thousand two hundred", [1200]], ["1,234 and 7", [1234, 7]],
    ["0.85", [0.85]], ["zero point six", [0.6]], ["no numbers here", []],
    ["point eight five", [0.85]], ["negative point eight five", [-0.85]],
    ["27. -66.", [27, -66]], ["65, no, 66", [65, 66]],
    ["-172", [-172]], ["minus 172", [-172]], ["negative sixty six", [-66]],
    ["300 minus 128", [300, 128]], ["300-128", [300, 128]], ["three hundred minus one hundred", [300, 100]],
  ] as const)("keeps the whole-number reading of %j", (said, numbers) => {
    const expected = numbers.map((value) => ({ type: "number", value }));
    expect(readNumbers(said).values).toEqual(expected);
    expect(valuesIn(said)).toEqual(expected);
    expect(valuesIn(said, { fractions: false })).toEqual(expected);
  });

  it("limits the new mixed-number reading to fraction calls", () => {
    const before = [{ type: "number", value: 1 }, frac(3, 8)];
    expect(valuesIn("1 3/8")).toEqual(before);
    expect(readNumbers("1 3/8").values).toEqual(before);
    expect(valuesIn("1 3/8", READ)).toEqual([mixed(1, 3, 8)]);
  });

  it.each([
    "4/12, I mean 7/8", "four twelfths, I mean seven eighths", "1 3/8, I mean 7/8",
    "4/12, actually 7/8", "4/12, oops 7/8", "4/12, no wait, 7/8",
    ...["because", "since", "cause", "cuz", "coz"].map((word) => `7/8 ${word} 6 plus 1 is 7`),
  ])("preserves the supported correction or explanation in %j", (said) => {
    expect(readAnswer(said, READ)).toMatchObject({ final: frac(7, 8), sure: true });
    const c = call(C38, said);
    const r = c.propose({ act: "accept_answer", parts: [{ line: "answer.right" }], reading: { answers: [answer(frac(7, 8), "result", "right")] } });
    expect(r.refusal).toBeNull();
    expect(c.s.solved).toBe("child");
  });

  it.each([
    ...["actually", "oops", "wait", "I mean", "no,", "no wait,", "oh wait, I mean", "actually, I think it's"].map((correction) => [`3/4, ${correction} a half`, frac(1, 2)] as const),
    ["3/4, actually a quarter", frac(1, 4)],
    ["3/4, actually an eighth", frac(1, 8)],
    ["fourteen sixteenths, I mean a half", frac(1, 2)],
    ["1 3/8, I mean a quarter", frac(1, 4)],
    ["3/4, actually, a half", frac(1, 2)],
    ["3/4, actually one half", frac(1, 2)],
    ["3/4, actually 1/2", frac(1, 2)],
    ["3/4, actually two and a half", mixed(2, 1, 2)],
    ["3/4, I mean 2 1/2", mixed(2, 1, 2)],
  ] as const)("reads the same supported fraction grammar after a correction: %j", (said, value) => {
    expect(readAnswer(said, READ)).toMatchObject({ final: value, sure: true });
    const first = value.type === "mixed" ? frac(9, 4) : frac(1, value.denominator * 2);
    const second = value.type === "mixed" ? frac(1, 4) : first;
    const pkg = pkgOf("Add the fractions.", add(first, second), EASY);
    const c = call(pkg, said);
    expect(c.propose({ act: "accept_answer", parts: [{ line: "answer.right" }], reading: { answers: [answer(value, "result", "right")] } }).refusal).toBeNull();
    expect(c.s.solved).toBe("child");
  });

  it.each(["a half", "one half", "1/2", "two fourths"].flatMap((form) =>
    ["because", "since", "cause", "'cause", "’cause", "cuz", "coz"].flatMap((explanation) =>
      ["", "3/4, actually "].map((prefix) => `${prefix}${form} ${explanation} three plus one is four`))))("keeps a supported fraction before the shared explanation grammar: %s", (said) => {
    const value = said.includes("two fourths") ? frac(2, 4) : frac(1, 2);
    expect(readAnswer(said, READ)).toMatchObject({ final: value, sure: true });
    const pkg = pkgOf("3/8 + 1/8 = ?", add(frac(3, 8), frac(1, 8)), EASY);
    const c = call(pkg, said);
    expect(c.propose({ act: "accept_answer", parts: [{ line: "answer.right" }], reading: { answers: [answer(value, "result", "right")] } }).refusal).toBeNull();
    expect(c.s.solved).toBe("child");
  });
});

describe("fraction expression and explanation boundaries", () => {
  it.each(["a half", "one half", "1/2", "two fourths"].flatMap((form) =>
    ["because", "since", "cause", "'cause", "’cause", "cuz", "coz"].flatMap((word) =>
      ["", "3/4, actually "].flatMap((prefix) =>
        ["3 - 1 is 2", "I used two of four"].flatMap((body) =>
          [" ", ". "].map((separator) => `${prefix}${form}${separator}${word} ${body}`))))))("keeps the answer before arithmetic in its explanation: %s", (said) => {
    const value = said.includes("two fourths") ? frac(2, 4) : frac(1, 2);
    const pkg = pkgOf("3/4 - 1/4 = ?", sub(frac(3, 4), frac(1, 4)), sub(frac(3, 5), frac(1, 5)));
    const proposal = { version: 2, act: "accept_answer", parts: [{ line: "answer.right" }], reading: { answers: [answer(value, "result", "right")] } };
    // PR #624 review round 3: an explanation in a sentence of its own with a number makes two sentences that hold numbers.
    // The answer still stands as the final one, and Maya confirms it before she accepts it.
    if (/\. \S/.test(said) && /\d|two|four/.test(said.slice(said.lastIndexOf(". ")))) {
      expect(readAnswer(said, READ)).toMatchObject({ final: value, sure: false });
      const asked = call(pkg, said);
      expect(asked.propose(proposal).refusal?.code).toBe("answer_not_committed");
      expect(asked.s.solved).toBeNull();
      return;
    }
    expect(readAnswer(said, READ)).toMatchObject({ final: value, sure: true });
    const direct = call(pkg, said);
    expect(direct.propose(proposal).refusal).toBeNull();
    expect(direct.s.solved).toBe("child");
    const fallback = call(pkg, said);
    const offers = fallbacks(fallback.s, [proposal, proposal]);
    expect(offers.length).toBeGreaterThan(0);
    expect(fallback.send({ type: "proposal", at: 2, proposal: offers[0] }).refusal).toBeNull();
    expect(fallback.s.solved).toBe("child");
  });

  it.each(["a half", "1/2"].flatMap((form) => [
    `${form} of it because 3 - 1 is 2`, `negative ${form} because 3 - 1 is 2`,
    `${form} because I am not sure`, `${form} because I doubt it`,
    `${form} because I reject this answer`,
  ]))("does not score an operation or a withdrawal across an explanation: %s", (said) => {
    const read = readAnswer(said, READ);
    expect(read.final === null || !read.sure).toBe(true);
    const pkg = pkgOf("3/4 - 1/4 = ?", sub(frac(3, 4), frac(1, 4)), sub(frac(3, 5), frac(1, 5)));
    const c = call(pkg, said);
    expect(c.propose({ act: "accept_answer", parts: [{ line: "answer.right" }], reading: { answers: [answer(frac(1, 2), "result", "right")] } }).refusal).not.toBeNull();
    expect(c.s.solved).toBeNull();
  });

  it.each([
    "1/2 +", "a half +", "two fourths +", "1/2 + because 3 - 1 is 2", "1/2 plus", "plus 1/2", "+ 1/2",
    "a half times", "1/2 + 1/4", "1/2 x",
  ])("does not score an unfinished calculation (R409-R7-1): %s", (said) => {
    const value = said.startsWith("two fourths") ? frac(2, 4) : frac(1, 2);
    const read = readAnswer(said, READ);
    expect(read.final === null || !read.sure).toBe(true);
    const pkg = pkgOf("3/4 - 1/4 = ?", sub(frac(3, 4), frac(1, 4)), sub(frac(3, 5), frac(1, 5)));
    const proposal = { version: 2, act: "accept_answer", parts: [{ line: "answer.right" }], reading: { answers: [answer(value, "result", "right")] } };
    const c = call(pkg, said);
    expect(c.propose(proposal).refusal).not.toBeNull();
    expect(c.s.solved).toBeNull();
    const fallback = call(pkg, said);
    for (const offer of fallbacks(fallback.s, [proposal, proposal])) {
      fallback.send({ type: "proposal", at: 2, proposal: offer });
      expect(fallback.s.solved).toBeNull();
    }
  });

  // A restated question ("3/4 - 1/4 is 1/2", "3/4 take away 1/4 is 1/2") asks for confirmation, as "-" did before.
  it.each(["1/2 because 3 plus 1 is 4", "a half because 3 + 1 is 4"])(
    "still reads the answer before arithmetic in its explanation: %s", (said) => {
      expect(readAnswer(said, READ)).toMatchObject({ final: frac(1, 2), sure: true });
    });
});

describe("right answers follow the question's wording (#407, research C38)", () => {
  it("takes an equal fraction when the question does not ask for the simplest form", () => {
    expect(rightForQuestion(C38, frac(7, 8))).toBe(true);
    expect(rightForQuestion(C38, frac(14, 16))).toBe(true);
    expect(isEqualForm(C38, frac(14, 16))).toBe(false);
    expect(rightForQuestion(C38, frac(4, 12))).toBe(false);
  });

  it("asks for the simplest form when the question does: an equal fraction is the right amount, not yet right", () => {
    expect(rightForQuestion(SIMPLEST, frac(14, 16))).toBe(false);
    expect(isEqualForm(SIMPLEST, frac(14, 16))).toBe(true);
    expect(rightForQuestion(SIMPLEST, frac(7, 8))).toBe(true);
    expect(isEqualForm(SIMPLEST, frac(4, 12))).toBe(false);
  });

  it("never takes a form the package lists as wrong", () => {
    const listed = pkgOf("3/4 + 1/8 = ?", add(frac(3, 4), frac(1, 8)), EASY, [frac(14, 16)]);
    expect(rightForQuestion(listed, frac(14, 16))).toBe(false);
    expect(isEqualForm(listed, frac(14, 16))).toBe(false);
    const c = call(listed, "14/16");
    expect(c.propose({ act: "guide", step: "result", level: 0, parts: [{ line: "check.equal", slots: { step: "result", heard: "14/16" } }], reading: { answers: [answer(frac(14, 16), "result", "wrong")] } }).refusal).not.toBeNull();
  });
});

/** A call on a package, past its opening, with a child turn waiting. */
function call(pkg: OperationPackage, said: string) {
  let s: Session = createSession({ callId: "fraction-call", package: pkg, random: 3 });
  const send = (e: SessionEvent) => {
    const r = step(s, e);
    s = r.session;
    return r;
  };
  send({ type: "start", at: 0 });
  expect(send({ type: "proposal", at: 0, proposal: { version: 2, act: "open", parts: [{ line: "open.hello" }] } }).refusal).toBeNull();
  send({ type: "child_turn", at: 1, text: said });
  return {
    get s() { return s; },
    send,
    child: (text: string) => send({ type: "child_turn", at: 2, text }),
    propose: (p: Record<string, unknown>) => send({ type: "proposal", at: 2, proposal: { version: 2, ...p } }),
    said: (r: ReturnType<typeof send>) => r.effects.flatMap((e) => (e.kind === "say" ? [e.text] : [])).join(" "),
  };
}
const answer = (value: AnswerValue, stepId: string, verdict: "right" | "wrong") => ({ value, step: stepId, verdict });

describe("the controller teaches fractions (#407)", () => {
  it("teaches adding and subtracting fractions, and holds the kinds it has no lines for", () => {
    expect(TEACHABLE_KINDS).toEqual(expect.arrayContaining(["fraction-add", "fraction-subtract"]));
    for (const kind of ["fraction-multiply", "fraction-divide", "fraction-simplify", "fraction-equivalent"]) expect(TEACHABLE_KINDS, kind).not.toContain(kind);
    expect(createSession({ callId: "x", package: C38 }).package).not.toBeNull();
    const withMixed = pkgOf("1 1/2 + 1/4 = ?", add(mixed(1, 1, 2), frac(1, 4)), EASY);
    expect(createSession({ callId: "x", package: withMixed }).contentProblem).toMatch(/to-improper/);
  });

  it("checks a step answer in the step's own written form: 6/8 or 6 is the common denominator, 3/4 is not", () => {
    const c = call(C38, "3/4");
    expect(c.propose({ act: "guide", step: "combine", level: 0, parts: [{ line: "step.invite", slots: { step: "combine" } }], reading: { answers: [answer(frac(3, 4), "common", "right")] } }).refusal).toMatchObject({ code: "accepts_wrong_answer" });
    for (const said of ["Six eighths.", "Six."]) {
      const d = call(C38, said);
      const value = said === "Six." ? { type: "number" as const, value: 6 } : frac(6, 8);
      const r = d.propose({ act: "guide", step: "combine", level: 0, parts: [{ line: "check.right_step", slots: { step: "common" } }, { line: "step.invite", slots: { step: "combine" } }], reading: { answers: [answer(value, "common", "right")] } });
      expect(r.refusal, said).toBeNull();
      expect(d.said(r)).toMatch(/3\/4 = 6\/8\./);
    }
  });

  it("says an accepted equal fraction back in the child's form", () => {
    const c = call(C38, "I got fourteen sixteenths.");
    const r = c.propose({ act: "accept_answer", parts: [{ line: "answer.right" }], reading: { answers: [answer(frac(14, 16), "result", "right")] } });
    expect(r.refusal).toBeNull();
    expect(c.said(r)).toContain("3/4 + 1/8 = 14/16");
    c.child("Okay.");
    const w = c.propose({ act: "ask_write", understanding: "uncertain", parts: [{ line: "write.answer" }] });
    expect(w.refusal).toBeNull();
    expect(c.said(w)).toContain("14/16");
    expect(c.said(w)).not.toContain("7/8");
  });

  it("asks to simplify an equal fraction when the question asks for it: no wrong answer, no failed attempt, no given answer", () => {
    const c = call(SIMPLEST, "I got 14/16.");
    expect(c.propose({ act: "accept_answer", parts: [{ line: "answer.right" }], reading: { answers: [answer(frac(14, 16), "result", "right")] } }).refusal).toMatchObject({ code: "accepts_wrong_answer" });
    const equal = { line: "check.equal", slots: { step: "result", heard: "14/16" } };
    const r = c.propose({ act: "guide", step: "result", level: 0, parts: [equal], reading: { answers: [answer(frac(14, 16), "result", "wrong")] } });
    expect(r.refusal).toBeNull();
    expect(c.said(r)).toMatch(/14\/16/);
    expect(c.said(r)).toMatch(/simplest form/);
    expect(c.s.ladder).toMatchObject({ step: "result", failures: 0 });
    // Said again: still the right amount, never a wrong final answer that releases the given answer.
    c.child("14/16.");
    expect(c.propose({ act: "guide", step: "result", level: 0, parts: [equal], reading: { answers: [answer(frac(14, 16), "result", "wrong")] } }).refusal).toBeNull();
    c.child("I don't know.");
    expect(c.propose({ act: "give_answer", parts: [], reading: { help: "more" } }).refusal).toMatchObject({ code: "hint_too_high" });
    const h1 = c.propose({ act: "guide", step: "result", level: 1, parts: [{ line: "step.point", slots: { step: "result" } }], reading: { help: "more" } });
    expect(h1.refusal).toBeNull();
    expect(c.said(h1)).toMatch(/14.*16/);
    c.child("It's 7/8.");
    expect(c.propose({ act: "accept_answer", parts: [{ line: "answer.right" }], reading: { answers: [answer(frac(7, 8), "result", "right")] } }).refusal).toBeNull();
  });

  it.each(["Maybe 14/16?", "14/16?", "I would say 14/16."])("confirms %j before equal-form progress, including code fallbacks", (said) => {
    const equal = { act: "guide", step: "result", level: 0, parts: [{ line: "check.equal", slots: { step: "result", heard: "14/16" } }], reading: { answers: [answer(frac(14, 16), "result", "wrong")] } };
    expect(readAnswer(said, READ).sure).toBe(false);
    const c = call(SIMPLEST, said);
    expect(c.propose(equal).refusal).toMatchObject({ code: "answer_not_committed" });
    expect(c.s.equalForm ?? null).toBeNull();
    expect(c.s.done).toEqual([]);
    expect(c.s.ladder.step).toBe("common");
    expect(c.s.finalMisses ?? 0).toBe(0);

    const f = call(SIMPLEST, said);
    const offers = fallbacks(f.s, [{ version: 2, ...equal }, { version: 2, ...equal }]);
    expect(offers.length).toBeGreaterThan(0);
    for (const offer of offers) {
      expect(offer.reading?.answers ?? []).toEqual([]);
      expect(offer.parts.some((part) => "line" in part && part.line === "check.equal")).toBe(false);
    }
    const code = f.send({ type: "proposal", at: 2, proposal: offers[0] });
    expect(code.refusal).toBeNull();
    expect(f.s.equalForm ?? null).toBeNull();
    expect(f.s.done).toEqual([]);

    expect(c.propose({ act: "confirm", parts: [{ line: "confirm.heard", slots: { heard: "14/16" } }] }).refusal).toBeNull();
    c.child("14/16.");
    expect(c.propose(equal).refusal).toBeNull();
    expect(c.s.equalForm).toEqual(frac(14, 16));
    expect(c.s.ladder).toMatchObject({ step: "result", failures: 0 });
    expect(c.s.finalMisses ?? 0).toBe(0);
    expect(c.s.done).toEqual(expect.arrayContaining(["common", "combine"]));
  });

  it("confirms a fraction form code does not read", () => {
    const c = call(C38, "three quarter");
    expect(nextActs(c.s).acts).toEqual(["confirm"]);
  });

  it("helps simplify the fractional part of a mixed answer and keeps its whole part", () => {
    const pkg = pkgOf("3/4 + 1/2 = ? Write your answer in simplest form.", add(frac(3, 4), frac(1, 2)), EASY);
    const c = call(pkg, "1 2/8");
    const r = c.propose({ act: "guide", step: "result", level: 0, parts: [{ line: "check.equal", slots: { step: "result", heard: "1 2/8" } }], reading: { answers: [answer(mixed(1, 2, 8), "result", "wrong")] } });
    expect(r.refusal).toBeNull();
    expect(c.said(r)).toContain("1 2/8");
    c.child("Help me.");
    const h1 = c.propose({ act: "guide", step: "result", level: 1, parts: [{ line: "step.point", slots: { step: "result" } }], reading: { help: "more" } });
    expect(h1.refusal).toBeNull();
    expect(c.said(h1)).toMatch(/2.*8/);
    c.child("More help.");
    const h2 = c.propose({ act: "guide", step: "result", level: 2, parts: [{ line: "step.operation", slots: { step: "result" } }], reading: { help: "more" } });
    expect(h2.refusal).toBeNull();
    expect(c.said(h2)).toMatch(/by 2|Use 2/);
    expect(c.s.equalForm).toEqual(mixed(1, 2, 8));
    expect(c.said(h1) + c.said(h2)).not.toContain("1 1/4");
    c.child("1 1/4");
    expect(c.propose({ act: "accept_answer", parts: [{ line: "answer.right" }], reading: { answers: [answer(mixed(1, 1, 4), "result", "right")] } }).refusal).toBeNull();
  });

  it("never scores an earlier wrong number over a right equal final fraction (R409-M1)", () => {
    for (const final of ["14/16", "7/8"]) {
      const c = call(C38, `I got 4/12. Now I got ${final}.`);
      const r = c.propose({ act: "guide", step: "common", level: 1, parts: [{ line: "step.point", slots: { step: "common" } }], reading: { answers: [answer(frac(4, 12), "result", "wrong")] } });
      expect(r.refusal, final).toMatchObject({ code: "answer_not_committed" });
      expect(c.s.lastResult, final).not.toBe("wrong");
    }
  });

  it("draws the fractions as strips, and the common denominator once that step is done", () => {
    const c = call(C38, "I got 4/12.");
    expect((drawOffers(c.s).guide ?? []).map((o) => o.id)).toContain("question.strips");
    expect((drawOffers(c.s).guide ?? []).map((o) => o.id)).not.toContain("question.common");
    const r = c.propose({ act: "guide", step: "common", level: 1, parts: [{ line: "step.point", slots: { step: "common" } }], draw: [{ offer: "question.strips" }], reading: { answers: [answer(frac(4, 12), "result", "wrong")] } });
    expect(r.refusal).toBeNull();
    const board = r.effects.find((e) => e.kind === "board");
    expect(board && board.kind === "board" ? board.batch.commands : []).toEqual([
      { op: "model", id: "question-strips-a", model: { kind: "fraction_strip", parts: 4, shaded: 3 }, place: { region: "main" } },
      { op: "model", id: "question-strips-b", model: { kind: "fraction_strip", parts: 8, shaded: 1 }, place: { below: "question-strips-a" } },
    ]);
    c.child("Six eighths.");
    expect((drawOffers(c.s).guide ?? []).map((o) => o.id)).not.toContain("question.strips");
    const common = c.propose({ act: "guide", step: "combine", level: 0, parts: [{ line: "step.invite", slots: { step: "combine" } }], draw: [{ offer: "question.common" }], reading: { answers: [answer(frac(6, 8), "common", "right")] } });
    expect(common.refusal).toBeNull();
  });
});

/** Every "a/b = c/d" in a text is a true equality, and every "a op b = c" (R r) of whole numbers holds. */
function falseFractionMath(text: string): string | null {
  // "a/b = c/d" alone, and "a/b + c/d = e/f" (or −), exactly.
  for (const m of text.matchAll(/(?<![\d/] [+−] |[\d/])(\d+)\/(\d+) = (\d+)\/(\d+)/g)) {
    const [, a, b, c, d] = m.map(Number);
    if (a * d !== b * c) return m[0];
  }
  for (const m of text.matchAll(/(\d+)\/(\d+) ([+−]) (\d+)\/(\d+) = (\d+)\/(\d+)/g)) {
    const [a, b, , c, d, e, f] = m.slice(1).map(Number);
    const top = m[3] === "+" ? a * d + c * b : a * d - c * b;
    if (top * f !== e * b * d) return m[0];
  }
  for (const m of text.matchAll(/(\d+) ([+−÷]) (\d+) = (\d+)(?: R (\d+))?/g)) {
    const [a, op, b, r, rest] = [Number(m[1]), m[2], Number(m[3]), Number(m[4]), Number(m[5] ?? 0)];
    const ok = op === "+" ? a + b === r : op === "−" ? a - b === r : a === r * b + rest && rest < b;
    if (!ok) return m[0];
  }
  return null;
}

describe("the fraction lines (#407)", () => {
  const KEYS = ["point.common", "operation.common", "operation.common.both", "point.combine", "operation.combine.add", "operation.combine.subtract",
    "point.simplify", "operation.simplify", "check.equal"] as const;

  it("has 5 to 8 wordings for every new line, each in plain language (D-202)", () => {
    for (const key of KEYS) {
      const wordings = TEMPLATES[key] as readonly string[];
      expect(wordings.length, key).toBeGreaterThanOrEqual(5);
      expect(wordings.length, key).toBeLessThanOrEqual(8);
      for (const w of wordings) {
        expect(plainLanguageProblem(w.replace(/\{\w+\}/g, "x")), w).toBeNull();
        expect(w, w).not.toMatch(/, (so|then|because|since) /);
      }
    }
  });

  it.each(PACKAGES.map((p) => [p.text, p] as const))("fills every line of %s, and every equation in it holds", (_text, pkg) => {
    const texts = allLineTexts(pkg, [frac(14, 16)]);
    for (const text of texts) {
      expect(text, text).not.toMatch(/[{}]|undefined|NaN|null/);
      expect(falseFractionMath(text), text).toBeNull();
      expect(plainLanguageProblem(text.replace("Now put it all together.", "")), text).toBeNull();
    }
  });

  it.each(PACKAGES.map((p) => [p.text, p] as const))("never says the answer of %s in a help line or a judged step", (_text, pkg) => {
    const c = call(pkg, "Show me.");
    const offers = (lineOffers(c.s).guide ?? []) as LineOffer[];
    expect(offers.length).toBeGreaterThan(3);
    // A right answer in any form, other than one of the question's own fractions.
    const reveals = (t: string) => valuesIn(t).some((v) => rightForQuestion(pkg, v) && !pkg.operation.operands.some((o) => JSON.stringify(o) === JSON.stringify(v)));
    for (const o of offers) for (const t of o.texts) expect(reveals(t), `${o.line}: ${t}`).toBe(false);
  });
});
