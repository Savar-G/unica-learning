import { describe, expect, it } from "vitest";
import { createSession, learningEvent, nextActs, step, valuesIn, type LineId, type Proposal, type Slots, type Session, type SessionEvent } from "@/lib/maya";
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
/** A proposal without its version: `propose` adds version 2. */
type Draft = Omit<Proposal, "version">;
const t = (talk: string) => ({ talk });
const ln = (line: LineId, slots: Slots = {}) => ({ line, slots });
const v2 = (p: unknown) => (typeof p === "object" && p !== null && !Array.isArray(p) && !("version" in p) ? { version: 2, ...p } : p);
const OPEN: Draft = { act: "open", parts: [ln("open.hello"), t("Our team may review this call. What did you try?")] };
const right66 = { value: num(66), step: "result", verdict: "right" as const };
const wrong56 = { value: num(56), step: "result", verdict: "wrong" as const };
const guide = (extra: Partial<Draft> = {}): Draft => ({ act: "guide", parts: [ln("step.invite", { step: "ones" })], step: "ones", level: 0, ...extra });

function call() {
  expect(checkQuestionPackage(PKG)).toMatchObject({ ok: true });
  let s: Session = createSession({ callId: "review-r2", package: PKG });
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
    const r = c.propose({ act: "close", parts: [t("Bye.")] });
    expect(r.refusal).toBeNull();
    expect(r.session.outcome).toMatchObject({ reason: "child_stopped" });
  });

  it("answers the child's pending turn after a repair", () => {
    const c = call();
    c.child("56", { uncertain: true });
    c.send({ type: "maya_said", at: 0, text: "Seven plus nine is fifteen." });
    expect(c.propose({ act: "repair", parts: [ln("repair.sorry")] }).refusal).toBeNull();
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
    expect(c.propose({ act: "accept_answer", parts: [t("Yes.")], reading: { answers: [right66] } }).refusal).not.toBeNull();
  });

  it("does not join a sign in a second final turn to the first turn's number", () => {
    const c = call();
    c.child("27");
    c.child("−66");
    expect(c.propose({ act: "accept_answer", parts: [t("Yes.")], reading: { answers: [right66] } }).refusal).not.toBeNull();
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
    expect(c.propose({ act: "accept_answer", parts: [t("Yes.")], reading: { answers: [right66] } }).refusal).toBeNull();
  });
});

describe("F9-R2: a child who cannot start after a confirmation still gets the example first", () => {
  it("requires the easier example and a retry", () => {
    const c = call();
    c.child("I did not ...", { uncertain: true });
    c.propose({ act: "confirm", parts: [t("What did you try?")] });
    c.child("I do not know how to start.");
    expect(c.propose(guide({ level: 2, reading: { start: "no_start" } })).refusal).toMatchObject({ code: "act_not_allowed" });
    expect(c.s.noStart).toBe(true);
    expect(c.propose({ act: "try_target", parts: [t("Try your question.")] }).refusal).toMatchObject({ code: "act_not_allowed" });
    expect(c.propose({ act: "example_step", step: "ones", parts: [ln("example.step", { step: "ones" })] }).refusal).toBeNull();
  });
});

describe("N1: a checked wrong final answer after a right one ends the solved status", () => {
  it("does not end as solved after the child takes back a right answer", () => {
    const c = call();
    c.child("66");
    c.propose({ act: "accept_answer", parts: [t("How did you get it?")], reading: { answers: [right66] } });
    c.child("Actually I got 56.");
    expect(c.propose(guide({ reading: { answers: [wrong56] } })).refusal).toBeNull();
    c.child("Stop");
    const r = c.propose({ act: "close", parts: [t("Bye.")], reading: { stop: true } });
    expect(r.session.outcome).toMatchObject({ reason: "child_stopped" });
    expect(learningEvent(r.session, { parentId: "p", childId: "c" })).toMatchObject({ result: "blank" });
  });

  it("scores a checked wrong final answer in the stop that closes the call", () => {
    const c = call();
    c.child("66");
    c.propose({ act: "accept_answer", parts: [t("How did you get it?")], reading: { answers: [right66] } });
    c.child("Actually 56. I stop.");
    const r = c.propose({ act: "close", parts: [t("Bye.")], reading: { stop: true, answers: [wrong56] } });
    expect(r.refusal).toBeNull();
    expect(r.session.outcome).toMatchObject({ reason: "child_stopped" });
    expect(learningEvent(r.session, { parentId: "p", childId: "c" })).toMatchObject({ result: "blank" });
  });

  it("is solved again when the child returns to the right answer", () => {
    const c = call();
    c.child("66");
    c.propose({ act: "accept_answer", parts: [t("How did you get it?")], reading: { answers: [right66] } });
    c.child("Actually I got 56.");
    c.propose(guide({ reading: { answers: [wrong56] } }));
    c.child("No, 66.");
    expect(c.propose({ act: "accept_answer", parts: [t("Yes.")], reading: { answers: [right66] } }).refusal).toBeNull();
    c.child("Stop");
    expect(c.propose({ act: "close", parts: [t("Bye.")], reading: { stop: true } }).session.outcome).toMatchObject({ reason: "solved" });
  });
});
