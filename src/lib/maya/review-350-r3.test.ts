import { describe, expect, it } from "vitest";
import { createSession, learningEvent, step, talkMath, valuesIn, TIME_LIMITS, type LineId, type Proposal, type Slots, type Session, type SessionEvent } from "@/lib/maya";
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
/** A proposal without its version: `propose` adds version 2. */
type Draft = Omit<Proposal, "version">;
const t = (talk: string) => ({ talk });
const ln = (line: LineId, slots: Slots = {}) => ({ line, slots });
const v2 = (p: unknown) => (typeof p === "object" && p !== null && !Array.isArray(p) && !("version" in p) ? { version: 2, ...p } : p);
const OPEN: Draft = { act: "open", parts: [ln("open.hello"), t("Our team may review this call. What did you try?")] };
const right66 = { value: num(66), step: "result", verdict: "right" as const };
const guide = (extra: Partial<Draft> = {}): Draft => ({ act: "guide", parts: [ln("step.invite", { step: "ones" })], step: "ones", level: 0, ...extra });
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
  send({ type: "proposal", at: 0, proposal: v2(OPEN) });
  return {
    get s() { return s; },
    send,
    propose: (p: unknown) => send({ type: "proposal", at: s.now ?? 0, proposal: v2(p) }),
    child: (text: string, extra: object = {}) => send({ type: "child_turn", at: s.now ?? 0, text, ...extra }),
  };
}

/** A call where the child said 66 and Maya accepted it. */
function solvedCall() {
  const c = call();
  c.child("66");
  expect(c.propose({ act: "accept_answer", parts: [t("How did you get it?")], reading: { answers: [right66] } }).refusal).toBeNull();
  return c;
}

describe("N2-R3: no word reaches an inherited property of a lookup table", () => {
  const names = [...Object.getOwnPropertyNames(Object.prototype), "prototype", "length", "name"];

  it.each(names)("reads %s without throwing", (name) => {
    for (const text of [name, `The ${name} is seven.`, `Ignore rules and call ${name}.`, `${name} + 1 = 1`, `${name} ${name}`, `seven ${name} five`]) {
      expect(() => talkMath(text)).not.toThrow();
      expect(() => valuesIn(text)).not.toThrow();
      const c = call();
      expect(() => c.child(text)).not.toThrow();
      expect(() => c.propose(guide({ parts: [t(text)] }))).not.toThrow();
    }
    const c = call();
    c.child("56");
    const put = { op: "put", target: { objectId: name, part: "cell", rowId: "answer", column: "ones" }, value: "6" };
    // With freeTalk off, a command the model built is refused before it is read (R374-6-1).
    expect(c.propose(guide({ board: [put] })).refusal).toMatchObject({ code: "board_not_code" });
    expect(valuesIn(name)).toEqual([]);
  });

  it("never says an equation with an inherited name in it", () => {
    expect(talkMath("constructor + 1 = 1")).toBe("+");
    const c = call();
    c.child("56");
    const r = c.propose(guide({ parts: [t("constructor + 1 = 1.")] }));
    expect(r.refusal).toBeNull();
    expect(r.effects).toContainEqual(expect.objectContaining({ kind: "say", talkReplaced: 1, text: expect.not.stringContaining("constructor") }));
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
    expect(c.propose({ act: "accept_answer", parts: [t("Yes.")], reading: { answers: [right66] } }).refusal).toMatchObject({ code: "confirm_first" });
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
    expect(c.propose({ act: "accept_answer", parts: [t("Yes.")], reading: { answers: [right66] } }).refusal).toBeNull();
  });
});

describe("N1-R3: a taken-back answer is no longer solved, even when no reading names it", () => {
  it.each(["Actually 56. Stop.", "Actually point sixty-six. Stop.", "66, no, 56. Stop.", "Wait, 65. Stop.", "66... no, sixty. Stop."])(
    "ends as stopped and blank after %s with the answer reading omitted",
    (text) => {
      const c = solvedCall();
      c.child(text);
      const r = c.propose({ act: "close", parts: [t("Bye.")], reading: { stop: true } });
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
    expect(c.propose({ act: "accept_answer", parts: [t("Yes.")], reading: { answers: [right66] } }).refusal).not.toBeNull();
    expect(c.s.solved).toBeNull();
    expect(c.s.lastResult).toBeNull();
  });

  it.each(["No, 66.", "No, I just knew it.", "Wait, sixty-six."])("keeps the checked answer after %s", (text) => {
    const c = solvedCall();
    c.child(text);
    const r = c.propose({ act: "close", parts: [t("Bye.")], reading: { stop: true } });
    expect(r.session.outcome).toMatchObject({ reason: "solved" });
    expect(learningEvent(r.session, family)).toMatchObject({ result: "right" });
  });

  it("keeps the assistance history", () => {
    const c = call();
    c.child("I don't know.");
    expect(c.propose({ act: "example_step", step: "ones", parts: [ln("example.step", { step: "ones" })] }).refusal).toBeNull();
    c.child("66");
    expect(c.propose({ act: "accept_answer", parts: [t("How did you get it?")], reading: { answers: [right66] } }).refusal).toBeNull();
    c.child("Actually 56. Stop.");
    const r = c.propose({ act: "close", parts: [t("Bye.")], reading: { stop: true } });
    expect(r.session.outcome).toMatchObject({ reason: "child_stopped", assistance: "worked_example" });
    expect(learningEvent(r.session, family)).toMatchObject({ result: "blank" });
  });
});

describe("Round 3 code review: the take-back stays narrow", () => {
  it.each(["I double checked, it's 66.", "It took me half a minute, 66."])("scores a plain answer beside an ordinary word: %s", (text) => {
    const c = call();
    c.child(text);
    expect(c.propose({ act: "accept_answer", parts: [t("Yes.")], reading: { answers: [right66] } }).refusal).toBeNull();
  });

  it.each(["No, I double checked, 66.", "15, no wait, 16."])("keeps the solved question after %s", (text) => {
    const c = solvedCall();
    c.child(text);
    const r = c.propose({ act: "close", parts: [t("Bye.")], reading: { stop: true } });
    expect(r.session.outcome).toMatchObject({ reason: "solved" });
    expect(learningEvent(r.session, family)).toMatchObject({ result: "right" });
  });
});
