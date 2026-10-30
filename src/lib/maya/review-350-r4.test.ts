import { describe, expect, it } from "vitest";
import { createSession, mathClaims, step, type Proposal, type Session, type SessionEvent } from "@/lib/maya";
import { checkQuestionPackage, workedSteps, type QuestionPackage } from "@/lib/question-package";

// Reproductions of the fourth to sixth reviews of PR #350 (R350-4-1, R350-4-2, R350-5-1, R350-6-1, R350-6-2), each
// through the public interface. Round 6 took money out of the talk counts: only steps, tries and time are talk.

const num = (value: number) => ({ type: "number" as const, value });
const PKG: QuestionPackage = {
  id: "wbq-review-r4",
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
/** A level 3 guide on the ones step of 27 + 39: digits 7 and 9, total 16, write 6, carry 1. */
const show = (say: string): Proposal => ({ act: "guide", say, step: "ones", level: 3, reading: { help: "show" } });

function call(pkg: QuestionPackage = PKG) {
  expect(checkQuestionPackage(pkg)).toMatchObject({ ok: true });
  let s: Session = createSession({ callId: "review-r4", package: pkg });
  const send = (e: SessionEvent) => {
    const r = step(s, e);
    s = r.session;
    return r;
  };
  send({ type: "start", at: 0 });
  send({ type: "proposal", at: 0, proposal: OPEN });
  send({ type: "child_turn", at: 0, text: "Show me." });
  return {
    get s() { return s; },
    send,
    /** The refusal of a proposal; a refused proposal changes nothing, so each check starts from the same turn. */
    refusal: (p: Proposal) => step(s, { type: "proposal", at: 0, proposal: p }).refusal,
  };
}

describe("R350-4-1: a whole carry or write instruction is bound to the checked step", () => {
  it.each([
    "Carry forward the 7.",
    "Write a small 7.",
    "Carry over a 7.",
    "Put a 7 on top.",
    "Write down 7 here.",
    "Carry the little 9 to the tens.",
    "Write 6 and 7.",
    "Write 6, then carry the 7 over.",
    "Now write the 16 in the ones.",
  ])("refuses %s", (say) => {
    expect(call().refusal(show(say))).toMatchObject({ code: "wrong_math" });
  });

  it.each([
    "Carry forward the 1.",
    "Write a small 6.",
    "Put a 1 on top of the tens.",
    "Write down 6 here.",
    "Write 6 and carry the 1.",
    "Write the 6 under the 7 and the 9.",
    "Carry the 1 to the tens, then look at the 7 and the 9.",
    "Write this one down: 6.",
    "Seven plus nine is sixteen. Write 6 and carry the 1.",
  ])("accepts %s", (say) => {
    expect(call().refusal(show(say))).toBeNull();
  });

  it("reports the whole instruction as false through mathClaims", () => {
    const step = { known: [7, 9, 0, 16, 6, 1, 27, 39], carry: [0, 1, 10], write: [6] };
    expect(mathClaims("Carry forward the 7.", [], step)).toEqual([{ text: "Carry forward the 7", status: "false", problem: null, result: false }]);
    expect(mathClaims("Write a small 7.", [], step)).toEqual([{ text: "Write a small 7", status: "false", problem: null, result: false }]);
  });

  it("repairs a wrong instruction Maya actually said", () => {
    const c = call();
    expect(c.refusal(show("Seven plus nine is sixteen."))).toBeNull();
    c.send({ type: "proposal", at: 0, proposal: show("Seven plus nine is sixteen.") });
    c.send({ type: "maya_said", at: 0, text: "Carry forward the 7." });
    expect(c.s.state).toBe("REPAIR_MAYA");
  });
});

describe("R350-4-2: counts of steps, tries and time are talk; the step's math stays bound", () => {
  it.each([
    "We have two steps.",
    "There are two steps.",
    "Wait 2 seconds.",
    "Two more tries, then we stop.",
    "Take 3 minutes.",
    "First, add the ones.",
    "Look at 27.",
  ])("accepts %s", (say) => {
    expect(call().refusal(show(say))).toBeNull();
  });

  it.each([
    "The answer is 65 dollars.",
    "The total is 15 seconds.",
    "2 dollars + 3 dollars = 6 dollars?",
    "Two apples plus three apples equals four apples?",
    "Take 120 steps.",
    "Look at the 4.",
    "Carry 2 steps.",
    "It costs 2 dollars.",
    "Carry the 1, then look at the 2 and the 3.",
  ])("refuses %s", (say) => {
    expect(call().refusal(show(say))).toMatchObject({ code: "wrong_math" });
  });

  it("keeps money bound in every problem, and time talk in a money problem", () => {
    const money: QuestionPackage = { ...PKG, id: "wbq-review-r4-money", text: "Sam has 27 dollars and gets 39 dollars. How many dollars now?" };
    expect(call(money).refusal(show("It costs 65 dollars."))).toMatchObject({ code: "wrong_math" });
    expect(call(money).refusal(show("Wait 2 seconds."))).toBeNull();
    expect(call().refusal(show("It costs 65 dollars."))).toMatchObject({ code: "wrong_math" });
  });
});

describe("main's items with no operation", () => {
  it("holds a checked item with no operation, with no teaching", () => {
    const tensAndOnes: QuestionPackage = {
      ...PKG,
      id: "wbq-review-r4-item",
      text: "47 = [ ] tens [ ] ones",
      answer: null,
      operation: null,
      steps: [],
      wrongAnswers: [],
      easierExample: null,
      item: {
        format: "boxes", scorable: true, parentChecked: false, error: null,
        regions: [{ id: "tens", kind: "box", label: "tens", answer: num(4) }, { id: "ones", kind: "box", label: "ones", answer: num(7) }],
        checks: [{ kind: "places", number: 47, parts: [{ region: "tens", place: "tens" }, { region: "ones", place: "ones" }] }],
      },
    };
    expect(checkQuestionPackage(tensAndOnes)).toMatchObject({ ok: true });
    const s = createSession({ callId: "review-r4-item", package: tensAndOnes });
    expect(s).toMatchObject({ package: null, contentProblem: "Maya cannot teach items with no operation yet" });
  });
});

describe("R350-5-1: money aliases are one unit, and a money problem has no money talk", () => {
  const story = (text: string): QuestionPackage => ({ ...PKG, id: "wbq-review-r5-money", text });

  it.each([
    "Sam has $27 and gets $39. How much now?",
    "Sam has 27 bucks and gets 39 bucks. How much now?",
    "Sam has 27 CAD and gets 39 CAD. How much now?",
    "Sam has 27¢ and gets 39¢. How much now?",
    "Sam has 27 pennies and gets 39 pennies. How many cents now?",
    "A toy costs 27 and a book 39. What is the total price?",
  ])("refuses a wrong amount for %s", (text) => {
    for (const say of ["It costs 65 dollars.", "It costs $65.", "That is 65 bucks.", "It costs 65 cents.", "It costs 65 pennies.", "It costs 2 dollars."]) {
      expect(call(story(text)).refusal(show(say))).toMatchObject({ code: "wrong_math" });
    }
  });

  it("still lets steps, tries and time be counts in a money problem", () => {
    const c = call(story("Sam has $27 and gets $39. How much now?"));
    for (const say of ["We have two steps.", "Wait 2 seconds.", "Two more tries, then we stop."]) expect(c.refusal(show(say))).toBeNull();
  });

  it("never takes money as talk, even in a problem with no money (round 6)", () => {
    const c = call();
    for (const say of ["It costs 2 dollars.", "That is 2 bucks.", "It costs 4 cents.", "It costs $65."]) expect(c.refusal(show(say))).toMatchObject({ code: "wrong_math" });
    expect(c.refusal(show("We have two steps."))).toBeNull();
  });
});

describe("R350-6: every money amount is math, and an amount named by a word is never accepted unread", () => {
  const story = (text: string): QuestionPackage => ({ ...PKG, id: "wbq-review-r6-money", text });

  it.each([
    "Sam spends 27 and 39. How much now?",
    "Sam saves 27 and then 39. How much now?",
    "Sam pays 27 and 39. How much in all?",
    "Her allowance is 27 and she gets 39 more. How much now?",
  ])("refuses a wrong price when only a word says money: %s", (text) => {
    for (const say of ["It costs 65 dollars.", "It costs sixty-five dollars.", "It costs 65 bucks.", "That is 65 cents."]) {
      expect(call(story(text)).refusal(show(say))).toMatchObject({ code: "wrong_math" });
    }
  });

  it.each([
    "It costs a quarter.",
    "That is a dime.",
    "Add a nickel.",
    "It costs a loonie.",
    "Two toonies.",
    "It costs half a dollar.",
    "Pay with a five-dollar bill.",
    "Is it a penny?",
    "Seven plus nine is a quarter.",
  ])("refuses the amount word in %s for $27 + $39", (say) => {
    expect(call(story("Sam has $27 and gets $39. How much now?")).refusal(show(say))).toMatchObject({ code: "wrong_math" });
  });

  it("still accepts steps, tries and time, and the problem's own amounts", () => {
    const c = call(story("Sam has $27 and gets $39. How much now?"));
    for (const say of ["Wait 2 seconds.", "We have two steps.", "Two more tries, then we stop.", "Take 3 minutes.", "Sam has 27 dollars, then 39 dollars more."]) {
      expect(c.refusal(show(say))).toBeNull();
    }
  });
});
