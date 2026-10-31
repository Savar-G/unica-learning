import { describe, expect, it } from "vitest";
import { createSession, mathClaims, step, type Proposal, type Session, type SessionEvent } from "@/lib/maya";
import { checkQuestionPackage, workedSteps, type QuestionPackage } from "@/lib/question-package";

// Reproductions of the fourth to ninth reviews of PR #350 (R350-4-1 to R350-9-1), each through the public interface.
// Round 6 took money out of the talk counts: only steps, tries and time are talk. Round 8 made a restatement an
// unchanged clause of the question, and bound every amount of money to the money the question states.

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
    for (const say of ["Wait 2 seconds.", "We have two steps.", "Two more tries, then we stop.", "Take 3 minutes.", "Sam has $27 and gets $39."]) {
      expect(c.refusal(show(say))).toBeNull();
    }
  });
});

describe("R350-7-1: a restatement of the question is no claim; an added or changed number still is", () => {
  const story = (text: string, operands: [number, number] = [27, 39], kind: "add" | "subtract" = "add"): QuestionPackage => {
    const operation = { kind, operands } as const;
    const result = kind === "add" ? operands[0] + operands[1] : operands[0] - operands[1];
    const example = kind === "add" ? PKG.easierExample! : { text: "32 - 5 = ?", operation: { kind: "subtract" as const, operands: [32, 5] as [number, number] }, answer: num(27), steps: workedSteps({ kind: "subtract", operands: [32, 5] }) };
    return {
      ...PKG, id: `wbq-review-r7-${kind}`, text, operation, steps: workedSteps(operation),
      answer: { value: num(result), accepted: [], unit: null },
      wrongAnswers: [{ value: num(result + 10), cause: "O3", description: "Slip", step: null }],
      easierExample: example,
    };
  };

  it.each<[string, QuestionPackage, string]>([
    ["gets", story("Sam has 27 dollars and gets 39 dollars. How many dollars now?"), "Sam has 27 dollars and gets 39 dollars."],
    ["has", story("Mia has 27 stickers. She has 39 more. How many now?"), "Mia has 27 stickers."],
    ["buys", story("Sam buys a toy for 27 dollars and a book for 39 dollars. How much does he spend?"), "Sam buys a toy for 27 dollars and a book for 39 dollars."],
    ["more than", story("Mia has 27 stickers. Leo has 39 more than Mia. How many does Leo have?"), "Leo has 39 more than Mia."],
    ["gives away", story("Sam has 52 stickers and gives away 17. How many are left?", [52, 17], "subtract"), "Sam has 52 stickers and gives away 17."],
    ["is left", story("There were 52 apples. 17 are eaten. How many are left?", [52, 17], "subtract"), "17 are eaten."],
  ])("accepts a restatement with %s", (_, pkg, say) => {
    expect(call(pkg).refusal(show(say))).toBeNull();
  });

  it.each<[QuestionPackage, string]>([
    [story("Sam has 27 dollars and gets 39 dollars. How many dollars now?"), "Sam has 27 dollars and gets 38 dollars."],
    [story("Sam has 27 dollars and gets 39 dollars. How many dollars now?"), "Sam has 39 dollars and gets 27 dollars."],
    [story("Sam has 27 dollars and gets 39 dollars. How many dollars now?"), "Sam has 27 dollars and gets 39 dollars, so he has 65 dollars now."],
    [story("Mia has 27 stickers. Leo has 39 more than Mia. How many does Leo have?"), "Leo has 38 more than Mia."],
    [story("Sam has 52 stickers and gives away 17. How many are left?", [52, 17], "subtract"), "Sam has 52 stickers and gives away 18."],
    [story("There were 52 apples. 17 are eaten. How many are left?", [52, 17], "subtract"), "There were 52 apples, and 18 are eaten."],
    // Round 9: a restatement never joins two sentences of the question.
    [story("There were 52 apples. 17 are eaten. How many are left?", [52, 17], "subtract"), "There were 52 apples, and 17 are eaten."],
    [story("There were 52 apples. 17 are eaten. How many are left?", [52, 17], "subtract"), "There were 52 apples, and 17 are eaten, so 34 are left."],
  ])("refuses a changed restatement: %#", (pkg, say) => {
    expect(call(pkg).refusal(show(say))).toMatchObject({ code: "wrong_math" });
  });
});

describe("R350-7-2: a price names a value of the problem; other numbers are references only", () => {
  // Round 8: a problem with no money in it supports no amount of money at all.
  it.each(["It costs 5 cents.", "It costs 18 dollars.", "Sam pays 5.", "It is worth 5.", "It costs two dollars.", "Sam has 27 dollars.", "It costs 39 dollars.", "Seven dollars and nine dollars."])("refuses %s for the ones step of 27 + 39", (say) => {
    expect(call().refusal(show(say))).toMatchObject({ code: "wrong_math" });
  });

  it.each(["Look at the 5 in 18 + 5.", "18 + 5 is easier.", "Look at the 27 in the question."])(
    "accepts %s for the ones step of 27 + 39",
    (say) => {
      expect(call().refusal(show(say))).toBeNull();
    },
  );
});

describe("R350-8: a restatement is an unchanged clause; money is only the question's money", () => {
  const MONEY: QuestionPackage = { ...PKG, id: "wbq-review-r8-money", text: "Sam has 27 dollars and gets 39 dollars. How many dollars altogether?" };

  it.each([
    "Sam has 27 dollars altogether.",
    "Sam has 39 dollars.",
    "Sam gets 27 dollars altogether.",
    "Sam gets 39 dollars altogether.",
    "Sam has 27 dollars and gets 39 dollars altogether.",
    "It costs one dollar.",
    "It costs 6 dollars.",
    "It costs 16 dollars.",
    "Sam has 27 dollars, so he gets 39 dollars.",
    "He has 27 dollars.",
    "Sam gets 39 dollars.",
  ])("refuses %s during the ones step", (say) => {
    expect(call(MONEY).refusal(show(say))).toMatchObject({ code: "wrong_math" });
  });

  it("refuses the answer as money before it is given", () => {
    expect(call(MONEY).refusal(show("Sam has 66 dollars."))?.code).toMatch(/^(?:reveals_answer|wrong_math)$/);
  });

  it.each([
    "Sam has 27 dollars and gets 39 dollars.",
    "Sam has 27 dollars, and gets 39 dollars.",
    "So, Sam has 27 dollars.",
    "Remember, Sam has 27 dollars and gets 39 dollars.",
    "The question says Sam has 27 dollars.",
    "How many dollars altogether?",
    "Look at the 27 dollars.",
    "Now add the 39 dollars.",
  ])("accepts %s during the ones step", (say) => {
    expect(call(MONEY).refusal(show(say))).toBeNull();
  });

  it("accepts the money result once the child has solved it", () => {
    let s: Session = createSession({ callId: "review-r8-solved", package: MONEY });
    s = step(s, { type: "start", at: 0 }).session;
    s = step(s, { type: "proposal", at: 0, proposal: OPEN }).session;
    s = step(s, { type: "child_turn", at: 0, text: "66" }).session;
    const r = step(s, { type: "proposal", at: 0, proposal: { act: "accept_answer", say: "Yes! Sam has 66 dollars.", reading: { answers: [{ value: num(66), step: "result", verdict: "right" }] } } });
    expect(r.refusal).toBeNull();
  });
});

describe("R350-9-1: every operation word is the operation of the problem it is about", () => {
  const MONEY: QuestionPackage = { ...PKG, id: "wbq-review-r9-money", text: "Sam has 27 dollars and gets 39 dollars. How many dollars altogether?" };
  const SUB: QuestionPackage = {
    ...PKG,
    id: "wbq-review-r9-sub",
    text: "Sam has 52 stickers and gives away 17. How many are left?",
    answer: { value: num(35), accepted: [], unit: null },
    operation: { kind: "subtract", operands: [52, 17] },
    steps: workedSteps({ kind: "subtract", operands: [52, 17] }),
    wrongAnswers: [{ value: num(45), cause: "S1", description: "Subtracts the smaller digit", step: "ones" }],
    easierExample: { text: "32 - 5 = ?", operation: { kind: "subtract", operands: [32, 5] }, answer: num(27), steps: workedSteps({ kind: "subtract", operands: [32, 5] }) },
  };

  it.each<[string, string, QuestionPackage]>([
    ["money addition", "Now subtract the 39 dollars.", MONEY],
    ["27 + 39", "Take away 5.", PKG],
    ["27 + 39", "Take away the 7.", PKG],
    ["27 + 39", "Find the difference.", PKG],
    ["27 + 39", "Multiply the ones.", PKG],
    ["27 + 39", "Share the ones.", PKG],
    ["27 + 39", "Seven minus nine is negative two.", PKG],
    ["52 - 17", "Now add the 7.", SUB],
    ["52 - 17", "What is the sum?", SUB],
    ["52 - 17", "Twelve plus seven is nineteen.", SUB],
  ])("refuses a wrong operation word in %s: %s", (_, say, pkg) => {
    expect(call(pkg).refusal(show(say))).toMatchObject({ code: "wrong_math" });
  });

  it.each<[string, string, QuestionPackage]>([
    ["money addition", "Now add the 39 dollars.", MONEY],
    ["27 + 39", "Take your time.", PKG],
    ["27 + 39", "Add the ones: seven plus nine is sixteen.", PKG],
    ["27 + 39", "Look at each column, one more time.", PKG],
    ["27 + 39", "Less work if you start with the ones.", PKG],
    ["52 - 17", "Take away 7 from the 12.", SUB],
    ["52 - 17", "Twelve minus seven is five.", SUB],
    ["52 - 17", "Sam has 52 stickers and gives away 17.", SUB],
    ["52 - 17", "Take a break if you need one.", SUB],
  ])("accepts in %s: %s", (_, say, pkg) => {
    expect(call(pkg).refusal(show(say))).toBeNull();
  });

  it("checks a sentence that names the easier example against the example's operation", () => {
    // An example of another operation is held by the package checker, so the named problem here is the same kind.
    expect(call().refusal(show("In 18 + 5, add the ones."))).toBeNull();
    expect(call().refusal(show("In 18 + 5, take away the ones."))).toMatchObject({ code: "wrong_math" });
  });

  it("repairs a wrong operation word Maya actually said", () => {
    const c = call(MONEY);
    c.send({ type: "proposal", at: 0, proposal: show("Seven plus nine is sixteen.") });
    c.send({ type: "maya_said", at: 0, text: "Now subtract the 39 dollars." });
    expect(c.s.state).toBe("REPAIR_MAYA");
  });
});

describe("R350-10: an instruction about a number or a place uses an allowed verb and the problem's own sign", () => {
  const SUB: QuestionPackage = {
    ...PKG,
    id: "wbq-review-r10-sub",
    text: "52 - 17 = ?",
    answer: { value: num(35), accepted: [], unit: null },
    operation: { kind: "subtract", operands: [52, 17] },
    steps: workedSteps({ kind: "subtract", operands: [52, 17] }),
    wrongAnswers: [{ value: num(45), cause: "S1", description: "Subtracts the smaller digit", step: "ones" }],
    easierExample: { text: "32 - 5 = ?", operation: { kind: "subtract", operands: [32, 5] }, answer: num(27), steps: workedSteps({ kind: "subtract", operands: [32, 5] }) },
  };
  const wrong = [
    "Remove the 7.",
    "Decrease the 9 by 7.",
    "Double the 7.",
    "Count back 7.",
    "Use − on the ones.",
    "Use × on the ones.",
    "Use ÷ on the ones.",
    "Halve the 6.",
    "Split the 9.",
  ];

  it.each(wrong)("refuses %s during the ones step of 27 + 39", (say) => {
    expect(call().refusal(show(say))).toMatchObject({ code: "wrong_math" });
  });

  it.each(wrong)("repairs %s said aloud during 27 + 39", (say) => {
    const c = call();
    c.send({ type: "proposal", at: 0, proposal: show("Seven plus nine is sixteen.") });
    expect(c.s.state).not.toBe("REPAIR_MAYA");
    c.send({ type: "maya_said", at: 0, text: say });
    expect(c.s.state).toBe("REPAIR_MAYA");
  });

  it.each(["Look at the 7.", "Add the 7 and the 9.", "Count on 9 from 7.", "Carry the 1 to the tens.", "Write the 6 in the ones.", "Use + on the ones.", "Now, can you add the 7 and the 9?", "7 + 9 = 16"])(
    "accepts %s during the ones step of 27 + 39",
    (say) => {
      expect(call().refusal(show(say))).toBeNull();
    },
  );

  it("does not repair an allowed instruction said aloud", () => {
    const c = call();
    c.send({ type: "proposal", at: 0, proposal: show("Seven plus nine is sixteen.") });
    c.send({ type: "maya_said", at: 0, text: "Add the 7 and the 9." });
    expect(c.s.state).not.toBe("REPAIR_MAYA");
  });

  it.each(["Count back 7.", "Borrow from the tens.", "Use − on the ones."])("accepts %s during the ones step of 52 - 17", (say) => {
    expect(call(SUB).refusal(show(say))).toBeNull();
  });

  it.each(["Add the 7.", "Use + on the ones.", "Carry the 1 to the tens."])("refuses %s during the ones step of 52 - 17", (say) => {
    expect(call(SUB).refusal(show(say))).toMatchObject({ code: "wrong_math" });
  });
});
