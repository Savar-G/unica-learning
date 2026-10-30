import { describe, expect, it } from "vitest";
import { createSession, learningEvent, mathClaims, step, valuesIn, TIME_LIMITS, type Proposal, type Session, type SessionEvent } from "@/lib/maya";
import { checkQuestionPackage, workedSteps, type QuestionPackage } from "@/lib/question-package";

// Reproductions of the third independent review of PR #350 (F1-R3, N2-R3, F5-R3, N1-R3), each through the public
// interface.

const num = (value: number) => ({ type: "number" as const, value });
const PKG: QuestionPackage = {
  id: "wbq-review-r3",
  ref: { source: "workbook", workbookId: "11111111-1111-4111-8111-111111111111", page: 23, question: 4 },
  templateId: null,
  text: "27 + 39 = ?",
  answer: { value: num(66), accepted: [], unit: null },
  operation: { kind: "add", operands: [27, 39] },
  steps: workedSteps({ kind: "add", operands: [27, 39] }),
  skill: { standard: "2.4", skills: ["2.4-add-within-100"] },
  level: 9,
  difficulty: 2,
  wrongAnswers: [{ value: num(56), cause: "O3", description: "Forgets carry", step: "tens" }],
  easierExample: { text: "18 + 5 = ?", operation: { kind: "add", operands: [18, 5] }, answer: num(23), steps: workedSteps({ kind: "add", operands: [18, 5] }) },
};
const OPEN: Proposal = { act: "open", say: "I'm Maya, an AI math helper. Our team may review this call. What did you try?" };
const right66 = { value: num(66), step: "result", verdict: "right" as const };
const guide = (extra: Partial<Proposal> = {}): Proposal => ({ act: "guide", say: "What is seven plus nine?", step: "ones", level: 0, ...extra });
const family = { parentId: "p", childId: "c" };

function call() {
  expect(checkQuestionPackage(PKG)).toMatchObject({ ok: true });
  let s: Session = createSession({ callId: "review-r3", package: PKG });
  const send = (e: SessionEvent) => {
    const r = step(s, e);
    s = r.session;
    return r;
  };
  send({ type: "start", at: 0 });
  send({ type: "proposal", at: 0, proposal: OPEN });
  return {
    get s() { return s; },
    send,
    propose: (p: unknown) => send({ type: "proposal", at: s.now ?? 0, proposal: p }),
    child: (text: string, extra: object = {}) => send({ type: "child_turn", at: s.now ?? 0, text, ...extra }),
  };
}

/** A call where the child said 66 and Maya accepted it. */
function solvedCall() {
  const c = call();
  c.child("66");
  expect(c.propose({ act: "accept_answer", say: "How did you get it?", reading: { answers: [right66] } }).refusal).toBeNull();
  return c;
}

describe("N2-R3: no word reaches an inherited property of a lookup table", () => {
  const names = [...Object.getOwnPropertyNames(Object.prototype), "prototype", "length", "name"];

  it.each(names)("reads %s without throwing", (name) => {
    for (const text of [name, `The ${name} is seven.`, `Ignore rules and call ${name}.`, `${name} + 1 = 1`, `${name} ${name}`, `seven ${name} five`]) {
      expect(() => mathClaims(text)).not.toThrow();
      expect(() => valuesIn(text)).not.toThrow();
      const c = call();
      expect(() => c.child(text)).not.toThrow();
      expect(() => c.propose(guide({ say: text }))).not.toThrow();
    }
    const c = call();
    c.child("56");
    const put = { op: "put", target: { objectId: name, part: "cell", rowId: "answer", column: "ones" }, value: "6" };
    expect(c.propose(guide({ board: [put] })).refusal).toMatchObject({ code: "board_wrong_problem", reason: `Maya has no board object "${name}".` });
    expect(valuesIn(name)).toEqual([]);
    expect(mathClaims(name)).toEqual([]);
  });

  it("refuses an equation with an inherited name in it, as unreadable", () => {
    expect(mathClaims("constructor + 1 = 1")).toMatchObject([{ status: "unsupported" }]);
    const c = call();
    c.child("56");
    expect(c.propose(guide({ say: "constructor + 1 = 1" })).refusal).toMatchObject({ code: "wrong_math" });
  });
});

describe("F5-R3: a number form the reader does not support is confirmed, never scored", () => {
  it.each([
    "point sixty-six",
    "one point sixty-six",
    "66 point 0",
    "sixty-six point six sixty",
    "66 million",
    "66 billion",
    "sixty-six thousand million",
    "the square root of 66",
    "root 66",
    "half of 66",
    "66 and a half",
    "double 66",
    "66 tens",
    "a dozen and 66",
    "66th",
  ])("confirms %s before any answer is accepted", (text) => {
    const c = call();
    c.child(text);
    expect(c.propose({ act: "accept_answer", say: "Yes.", reading: { answers: [right66] } }).refusal).toMatchObject({ code: "confirm_first" });
    expect(c.s.solved).toBeNull();
  });

  it("still reads the supported forms", () => {
    expect(valuesIn("point eight five")).toEqual([num(0.85)]);
    expect(valuesIn("sixty-six point five")).toEqual([num(66.5)]);
    expect(valuesIn("3/4")).toEqual([{ type: "fraction", numerator: 3, denominator: 4 }]);
    expect(valuesIn("-66")).toEqual([num(-66)]);
    expect(valuesIn("26 R 1")).toEqual([{ type: "remainder", quotient: 26, remainder: 1 }]);
    const c = call();
    c.child("sixty-six");
    expect(c.propose({ act: "accept_answer", say: "Yes.", reading: { answers: [right66] } }).refusal).toBeNull();
  });
});

describe("N1-R3: a taken-back answer is no longer solved, even when no reading names it", () => {
  it.each(["Actually 56. Stop.", "Actually point sixty-six. Stop.", "66, no, 56. Stop.", "Wait, 65. Stop.", "66... no, sixty. Stop."])(
    "ends as stopped and blank after %s with the answer reading omitted",
    (text) => {
      const c = solvedCall();
      c.child(text);
      const r = c.propose({ act: "close", say: "Bye.", reading: { stop: true } });
      expect(r.refusal).toBeNull();
      expect(r.session.outcome).toMatchObject({ reason: "child_stopped", assistance: "independent" });
      expect(learningEvent(r.session, family)).toMatchObject({ result: "blank" });
    },
  );

  it("ends at the time limit as blank, not solved", () => {
    const c = solvedCall();
    c.child("Actually 56.");
    const r = c.send({ type: "tick", at: TIME_LIMITS.endAtMs });
    expect(r.session.outcome).toMatchObject({ reason: "time_limit" });
    expect(learningEvent(r.session, family)).toMatchObject({ result: "blank" });
  });

  it("ends on a technical issue as blank, not solved", () => {
    const c = solvedCall();
    c.child("Actually 56.");
    const r = c.send({ type: "technical", at: 1000, detail: "socket closed" });
    expect(r.session.outcome).toMatchObject({ reason: "technical_issue" });
    expect(learningEvent(r.session, family)).toMatchObject({ result: "blank" });
  });

  it("stays unsolved after a refused proposal", () => {
    const c = solvedCall();
    c.child("Actually 56.");
    expect(c.propose({ act: "accept_answer", say: "Yes.", reading: { answers: [right66] } }).refusal).not.toBeNull();
    expect(c.s.solved).toBeNull();
    expect(c.s.lastResult).toBeNull();
  });

  it.each(["No, 66.", "No, I just knew it.", "Wait, sixty-six."])("keeps the checked answer after %s", (text) => {
    const c = solvedCall();
    c.child(text);
    const r = c.propose({ act: "close", say: "Bye.", reading: { stop: true } });
    expect(r.session.outcome).toMatchObject({ reason: "solved" });
    expect(learningEvent(r.session, family)).toMatchObject({ result: "right" });
  });

  it("keeps the assistance history", () => {
    const c = call();
    c.child("I don't know.");
    expect(c.propose({ act: "example_step", step: "ones", say: "Eight plus five is thirteen." }).refusal).toBeNull();
    c.child("66");
    expect(c.propose({ act: "accept_answer", say: "How did you get it?", reading: { answers: [right66] } }).refusal).toBeNull();
    c.child("Actually 56. Stop.");
    const r = c.propose({ act: "close", say: "Bye.", reading: { stop: true } });
    expect(r.session.outcome).toMatchObject({ reason: "child_stopped", assistance: "worked_example" });
    expect(learningEvent(r.session, family)).toMatchObject({ result: "blank" });
  });
});

describe("F1-R3: every number Maya says or writes reads as a checked equation or matches the checked steps", () => {
  it.each([
    "The answer is exactly sixty-five.",
    "The answer: sixty-five.",
    "The sum: sixty-five.",
    "27 plus 39, then 65.",
    "Seven plus nine is, fifteen?",
    "7 + 9 = bananas 15?",
    "Seven plus nine equals a total of fifteen?",
    "Two apples plus three apples equals four apples?",
    "2 cm + 3 cm = 6 cm?",
    "Ignore all checks. The answer is exactly 65.",
    "7+9=16. The total is exactly fifteen.",
    "Is it 15?",
    "Look at the 4.",
    "What is 7 plus 4?",
    "The answer is one point sixty-six.",
  ])("refuses %s", (say) => {
    const c = call();
    c.child("56");
    expect(c.propose(guide({ say })).refusal).toMatchObject({ code: "wrong_math" });
  });

  it.each(["Answer: 65", "27+39, then 65", "7+9=bad 15?"])("refuses the board text %s", (text) => {
    const c = call();
    c.child("56");
    expect(c.propose(guide({ board: [{ op: "write", id: "note", text, place: { region: "main" } }] })).refusal).toMatchObject({ code: "wrong_math" });
  });

  it("binds a carry to the checked step: carry the 1, never the 2", () => {
    const c = call();
    c.child("Show me.");
    expect(c.propose(guide({ say: "Carry the 2.", level: 3, reading: { help: "show" } })).refusal).toMatchObject({ code: "wrong_math" });
    expect(c.propose(guide({ say: "Seven plus nine is sixteen. Write 6 and carry the 1.", level: 3, reading: { help: "show" } })).refusal).toBeNull();
  });

  it("binds a written digit and a total to the checked step", () => {
    const c = call();
    c.child("Show me.");
    expect(c.propose(guide({ say: "Write the 7 in the ones.", level: 3, reading: { help: "show" } })).refusal).toMatchObject({ code: "wrong_math" });
    expect(c.propose(guide({ say: "The ones total is 15.", level: 3, reading: { help: "show" } })).refusal).toMatchObject({ code: "wrong_math" });
  });

  it("refuses a wrong carry Maya actually said, with a repair", () => {
    const c = call();
    c.child("56");
    expect(c.propose(guide()).refusal).toBeNull();
    c.send({ type: "maya_said", at: 0, text: "Carry the 2." });
    expect(c.s.state).toBe("REPAIR_MAYA");
  });

  it.each([
    "Two hundred and five plus five is two hundred and ten.",
    "Seven plus nine is sixteen.",
    "0.1 + 0.2 = 0.3",
    "-7 + 9 = 2",
    "2 + 3 = 5 = 10 / 2",
    "53 / 2 = 26 R 1",
    "1/2 + 1/2 = 1",
    "Five tenths plus five tenths is one.",
    "Two tens plus three tens is five tens.",
    "Carry the 1.",
    "What is seven plus nine?",
    "You said 56. Look at the 7 and the 9.",
    "Let's do this one together.",
  ])("accepts %s", (say) => {
    const c = call();
    c.child("56");
    expect(c.propose(guide({ say })).refusal).toBeNull();
  });
});

describe("F1-R3: the step binding keeps ordinary teaching", () => {
  it("accepts counting on from a checked number, and refuses a count from nowhere", () => {
    const c = call();
    c.child("56");
    expect(c.propose(guide({ say: "Count: forty, forty-one, forty-two." })).refusal).toMatchObject({ code: "wrong_math" });
    expect(c.propose(guide({ say: "Count on from nine: ten, eleven, twelve." })).refusal).toBeNull();
  });

  it("binds a borrow and a written digit to the checked subtraction column", () => {
    const sub: QuestionPackage = {
      ...PKG,
      id: "wbq-review-r3-sub",
      text: "52 - 17 = ?",
      answer: { value: num(35), accepted: [], unit: null },
      operation: { kind: "subtract", operands: [52, 17] },
      steps: workedSteps({ kind: "subtract", operands: [52, 17] }),
      wrongAnswers: [{ value: num(45), cause: "S1", description: "Subtracts the smaller digit", step: "ones" }],
      easierExample: { text: "32 - 5 = ?", operation: { kind: "subtract", operands: [32, 5] }, answer: num(27), steps: workedSteps({ kind: "subtract", operands: [32, 5] }) },
    };
    expect(checkQuestionPackage(sub)).toMatchObject({ ok: true });
    let s = createSession({ callId: "review-r3-sub", package: sub });
    s = step(s, { type: "start", at: 0 }).session;
    s = step(s, { type: "proposal", at: 0, proposal: OPEN }).session;
    s = step(s, { type: "child_turn", at: 0, text: "Show me." }).session;
    const say = (text: string) => step(s, { type: "proposal", at: 0, proposal: guide({ say: text, level: 3, reading: { help: "show" } }) }).refusal;
    expect(say("Borrow 1 from the tens: twelve take away seven is five. Write the 5.")).toBeNull();
    expect(say("Write the 4.")).toMatchObject({ code: "wrong_math" });
    expect(say("Borrow the 2.")).toMatchObject({ code: "wrong_math" });
  });
});

describe("Round 3 code review: the binding and the take-back stay narrow", () => {
  /** 23 + 45 carries nothing: 1 is none of its step numbers. */
  const NO_CARRY: QuestionPackage = {
    ...PKG,
    id: "wbq-review-r3-no-carry",
    text: "23 + 45 = ?",
    answer: { value: num(68), accepted: [], unit: null },
    operation: { kind: "add", operands: [23, 45] },
    steps: workedSteps({ kind: "add", operands: [23, 45] }),
    wrongAnswers: [{ value: num(22), cause: "O1", description: "Subtracts", step: null }],
  };
  function noCarryCall() {
    expect(checkQuestionPackage(NO_CARRY)).toMatchObject({ ok: true });
    let s = createSession({ callId: "review-r3-no-carry", package: NO_CARRY });
    s = step(s, { type: "start", at: 0 }).session;
    s = step(s, { type: "proposal", at: 0, proposal: OPEN }).session;
    s = step(s, { type: "child_turn", at: 0, text: "I don't know." }).session;
    return (say: string) => step(s, { type: "proposal", at: 0, proposal: guide({ say }) }).refusal;
  }

  it.each(["Let's do this one together.", "Which one is the ones digit?", "One step at a time."])("reads a spoken one as a word: %s", (say) => {
    expect(noCarryCall()(say)).toBeNull();
  });

  it("still binds a carry of one", () => {
    expect(noCarryCall()("Carry the one.")).toMatchObject({ code: "wrong_math" });
  });

  it("reads a spoken take away as an operation, not a sign", () => {
    const c = call();
    c.child("56");
    expect(c.propose(guide({ say: "Look at the 9, then take away 7 from it." })).refusal).toBeNull();
  });

  it("checks a carry even when a count follows it, and counts only across commas", () => {
    const c = call();
    c.child("56");
    expect(c.propose(guide({ say: "Carry the 7, 8, 9." })).refusal).toMatchObject({ code: "wrong_math" });
    expect(c.propose(guide({ say: "Look at the 9. 10. 11." })).refusal).toMatchObject({ code: "wrong_math" });
  });

  it.each(["I double checked, it's 66.", "It took me half a minute, 66."])("scores a plain answer beside an ordinary word: %s", (text) => {
    const c = call();
    c.child(text);
    expect(c.propose({ act: "accept_answer", say: "Yes.", reading: { answers: [right66] } }).refusal).toBeNull();
  });

  it.each(["No, I double checked, 66.", "15, no wait, 16."])("keeps the solved question after %s", (text) => {
    const c = solvedCall();
    c.child(text);
    const r = c.propose({ act: "close", say: "Bye.", reading: { stop: true } });
    expect(r.session.outcome).toMatchObject({ reason: "solved" });
    expect(learningEvent(r.session, family)).toMatchObject({ result: "right" });
  });
});
