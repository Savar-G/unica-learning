import { describe, expect, it } from "vitest";
import { createSession, learningEvent, mathClaims, nextActs, step, valuesIn, type Proposal, type Session, type SessionEvent } from "@/lib/maya";
import { checkQuestionPackage, workedSteps, type QuestionPackage } from "@/lib/question-package";

// Reproductions of the second independent review of PR #350 (F1-R2, F2-R2, F5-R2, F9-R2, N1), each through the
// public interface.

const num = (value: number) => ({ type: "number" as const, value });
const PKG: QuestionPackage = {
  id: "wbq-review-r2",
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
const wrong56 = { value: num(56), step: "result", verdict: "wrong" as const };
const guide = (extra: Partial<Proposal> = {}): Proposal => ({ act: "guide", say: "What is seven plus nine?", step: "ones", level: 0, ...extra });

function call() {
  expect(checkQuestionPackage(PKG)).toMatchObject({ ok: true });
  let s: Session = createSession({ callId: "review-r2", package: PKG });
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

describe("F1-R2: every equation and number claim Maya says or writes is checked exactly", () => {
  it.each([
    "6 / 2 = 4",
    "7 + 9 = 16 = 15",
    "7 × (9 + 2) = 65",
    "Two tens plus three tens is five ones.",
    "The ones total is fifteen.",
    "The answer is sixty-five.",
    "0.1 + 0.2 = 0.30000000000000001",
    "1 + 1 = 0.0000001",
    "Twice 8 is 8.",
    "7 + 9 is 16 less 1.",
    "7 + 9 = 16²",
  ])("refuses %s", (say) => {
    const c = call();
    c.child("56");
    const r = c.propose(guide({ say }));
    expect(r.refusal).toMatchObject({ code: "wrong_math" });
    expect(r.effects).toEqual([]);
  });

  it.each(["Seven plus nine is sixteen.", "0.6 + 0.25 = 0.85", "2 + 3 + 1 = 6", "(7 + 9) × 2 = 32", "Two tens plus three tens is five tens.", "One ten and one ten make two tens.", "So 18 + 5 is 23."])(
    "accepts %s",
    (say) => {
      const c = call();
      c.child("56");
      expect(c.propose(guide({ say })).refusal).toBeNull();
    },
  );

  it("refuses a false grouped equation on the board, so it never reaches the board", () => {
    const c = call();
    c.child("56");
    const r = c.propose(guide({ board: [{ op: "write", id: "bad", text: "7 × (9 + 2) = 65", place: { region: "main" } }] }));
    expect(r.refusal).toMatchObject({ code: "wrong_math" });
    expect(r.effects).toEqual([]);
  });

  it("lets Maya restate the question, but not name another sum", () => {
    const c = call();
    c.child("What is the question?");
    expect(c.propose({ act: "clarify", say: "It is 27 plus 39." }).refusal).toBeNull();
    const d = call();
    d.child("What is the question?");
    expect(d.propose({ act: "clarify", say: "It is 27 plus 38." }).refusal).toMatchObject({ code: "wrong_math" });
  });

  it("reads compound number words exactly", () => {
    expect(mathClaims("Twenty-seven plus thirty-nine is sixty-six.").map((c) => c.status)).toEqual(["true"]);
    expect(mathClaims("Twenty-seven plus thirty-nine is sixty-five.").map((c) => c.status)).toEqual(["false"]);
    expect(mathClaims("Two hundred and five plus five is two hundred and ten.").map((c) => c.status)).toEqual(["true"]);
    expect(mathClaims("One thousand hundred is 1000.").map((c) => c.status)).toEqual(["unsupported"]);
    const c = call();
    c.child("56");
    c.propose(guide());
    c.child("I don't know");
    expect(c.send({ type: "maya_said", at: 0, text: "Twenty-seven plus thirty-nine is sixty-five." }).session.state).toBe("REPAIR_MAYA");
  });

  it.each(["Seven plus nine comes to fifteen.", "Seven plus nine, that's fifteen.", "7 + 9 \u2192 15", "7 + 9 isn't 16", "7 + 9 > 20", "Seven plus nine totals fifteen.", "Nine take away seven leaves three."])(
    "refuses a number claim with no equals word: %s",
    (say) => {
      const c = call();
      c.child("56");
      expect(c.propose(guide({ say })).refusal).toMatchObject({ code: "wrong_math" });
    },
  );

  it("refuses a very long chain without throwing", () => {
    const text = `${"1 + ".repeat(6000)}1 = 6001`;
    expect(() => mathClaims(text)).not.toThrow();
    const c = call();
    c.child("56");
    expect(c.propose(guide({ say: text })).refusal).toMatchObject({ code: "wrong_math" });
    c.propose(guide());
    c.child("ok");
    expect(() => c.send({ type: "maya_said", at: 0, text })).not.toThrow();
  });

  it("returns a result for every input and never throws", () => {
    const parts = ["1", "0", "-", "+", "×", "÷", "/", "=", "(", ")", "is", "R", "1e-7", "0.0000001", "99999999999999999999", "seven", "tens", "half", "²", ".", "?", "and", "x", "point", "minus"];
    for (const a of parts) for (const b of parts) for (const d of parts) {
      expect(() => mathClaims(`${a} ${b} ${d} = ${b}${a}`)).not.toThrow();
      expect(() => valuesIn(`${a}${b} ${d}`)).not.toThrow();
    }
    for (const a of parts) for (const b of parts) {
      const c = call();
      c.child(`${a} ${b}`);
      expect(() => c.propose(guide({ say: `${a} ${b} = ${b} ${a}` }))).not.toThrow();
    }
  });
});

describe("F2-R2: a stop request and pending input last until they are handled", () => {
  it("keeps a stop read in a proposal that fails its shape check", () => {
    const c = call();
    c.child("Stop.");
    expect(c.propose(guide({ board: "invalid" as unknown as unknown[], reading: { stop: true } })).refusal).toMatchObject({ code: "invalid_proposal" });
    expect(c.propose(guide()).refusal).toMatchObject({ code: "stop_first" });
  });

  it("keeps an unclear reading from a proposal that fails its shape check", () => {
    const c = call();
    c.child("fifty... sixty");
    c.propose(guide({ board: "invalid" as unknown as unknown[], reading: { unclear: true } }));
    expect(nextActs(c.s).acts).toEqual(["confirm"]);
  });

  it("keeps a stop through a repair Maya owes, and the close is allowed", () => {
    const c = call();
    c.child("Stop.");
    c.propose(guide({ reading: { stop: true } }));
    c.send({ type: "maya_said", at: 0, text: "Seven plus nine is fifteen." });
    expect(nextActs(c.s).acts).toEqual(["close"]);
    const r = c.propose({ act: "close", say: "Bye." });
    expect(r.refusal).toBeNull();
    expect(r.session.outcome).toMatchObject({ reason: "child_stopped" });
  });

  it("answers the child's pending turn after a repair", () => {
    const c = call();
    c.child("56", { uncertain: true });
    c.send({ type: "maya_said", at: 0, text: "Seven plus nine is fifteen." });
    expect(c.propose({ act: "repair", say: "Sorry, seven plus nine is sixteen." }).refusal).toBeNull();
    expect(nextActs(c.s)).toEqual({ expect: "maya", acts: ["confirm"] });
  });
});

describe("F5-R2: signs and turn boundaries are kept when the child's number is read", () => {
  it("reads a minus after a full stop as a sign", () => {
    expect(valuesIn("27. −66.")).toEqual([num(27), num(-66)]);
  });

  it.each([
    "27. −66.", "27 minus 66", "27 − 66", "minus uh 66", "negative um sixty-six", "27 take away 66", "27 multiplied by 66", "27 add 66",
    "27 subtract 66", "27 less 66", "27 added to 66", "27 and 66", "27 dash 66", "66 to the second power", "sixty-six to the second",
  ])("does not accept 66 from %s", (text) => {
    const c = call();
    c.child(text);
    expect(c.propose({ act: "accept_answer", say: "Yes.", reading: { answers: [right66] } }).refusal).not.toBeNull();
  });

  it("does not join a sign in a second final turn to the first turn's number", () => {
    const c = call();
    c.child("27");
    c.child("−66");
    expect(c.propose({ act: "accept_answer", say: "Yes.", reading: { answers: [right66] } }).refusal).not.toBeNull();
  });

  it("confirms a number form that changes the value", () => {
    const c = call();
    c.child("66 squared");
    expect(nextActs(c.s).acts).toEqual(["confirm"]);
  });

  it("still joins number words", () => {
    expect(valuesIn("two hundred and five")).toEqual([num(205)]);
    expect(valuesIn("sixty-six")).toEqual([num(66)]);
  });

  it("still accepts a kept answer after the child's working", () => {
    const c = call();
    c.child("7 plus 9 is 16, so I got 66.");
    expect(c.propose({ act: "accept_answer", say: "Yes.", reading: { answers: [right66] } }).refusal).toBeNull();
  });
});

describe("F9-R2: a child who cannot start after a confirmation still gets the example first", () => {
  it("requires the easier example and a retry", () => {
    const c = call();
    c.child("I did not ...", { uncertain: true });
    c.propose({ act: "confirm", say: "What did you try?" });
    c.child("I do not know how to start.");
    expect(c.propose(guide({ level: 2, reading: { start: "no_start" } })).refusal).toMatchObject({ code: "act_not_allowed" });
    expect(c.s.noStart).toBe(true);
    expect(c.propose({ act: "try_target", say: "Try your question." }).refusal).toMatchObject({ code: "act_not_allowed" });
    expect(c.propose({ act: "example_step", step: "ones", say: "Eight plus five is thirteen." }).refusal).toBeNull();
  });
});

describe("N1: a checked wrong final answer after a right one ends the solved status", () => {
  it("does not end as solved after the child takes back a right answer", () => {
    const c = call();
    c.child("66");
    c.propose({ act: "accept_answer", say: "How did you get it?", reading: { answers: [right66] } });
    c.child("Actually I got 56.");
    expect(c.propose(guide({ reading: { answers: [wrong56] } })).refusal).toBeNull();
    c.child("Stop");
    const r = c.propose({ act: "close", say: "Bye.", reading: { stop: true } });
    expect(r.session.outcome).toMatchObject({ reason: "child_stopped" });
    expect(learningEvent(r.session, { parentId: "p", childId: "c" })).toMatchObject({ result: "blank" });
  });

  it("scores a checked wrong final answer in the stop that closes the call", () => {
    const c = call();
    c.child("66");
    c.propose({ act: "accept_answer", say: "How did you get it?", reading: { answers: [right66] } });
    c.child("Actually 56. I stop.");
    const r = c.propose({ act: "close", say: "Bye.", reading: { stop: true, answers: [wrong56] } });
    expect(r.refusal).toBeNull();
    expect(r.session.outcome).toMatchObject({ reason: "child_stopped" });
    expect(learningEvent(r.session, { parentId: "p", childId: "c" })).toMatchObject({ result: "blank" });
  });

  it("is solved again when the child returns to the right answer", () => {
    const c = call();
    c.child("66");
    c.propose({ act: "accept_answer", say: "How did you get it?", reading: { answers: [right66] } });
    c.child("Actually I got 56.");
    c.propose(guide({ reading: { answers: [wrong56] } }));
    c.child("No, 66.");
    expect(c.propose({ act: "accept_answer", say: "Yes.", reading: { answers: [right66] } }).refusal).toBeNull();
    c.child("Stop");
    expect(c.propose({ act: "close", say: "Bye.", reading: { stop: true } }).session.outcome).toMatchObject({ reason: "solved" });
  });
});
