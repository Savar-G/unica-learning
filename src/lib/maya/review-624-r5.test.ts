import { describe, expect, it } from "vitest";
import { createSession, step, type LineChoice, type LineId, type Proposal, type SessionEvent, type Slots } from "@/lib/maya";
import { FIXTURES } from "@/lib/maya-gate/fixtures";

const value = (n: number) => ({ type: "number" as const, value: n });
const line = (name: LineId, slots: Slots = {}): LineChoice => ({ line: name, slots });
type Input = SessionEvent extends infer E ? E extends SessionEvent ? Omit<E, "at"> : never : never;

function call() {
  let session = createSession({ callId: "review-r5", package: FIXTURES.A, freeTalk: true });
  let at = 1000;
  const send = (event: Input) => {
    const result = step(session, { ...event, at } as SessionEvent);
    session = result.session;
    return result;
  };
  send({ type: "start" });
  expect(send({ type: "proposal", proposal: { version: 2, act: "open", parts: [line("open.hello"), line("question.problem")] } }).refusal).toBeNull();
  return {
    get session() { return session; },
    child(text: string) { at += 4000; return send({ type: "child_turn", text }); },
    propose(proposal: Omit<Proposal, "version">) { return send({ type: "proposal", proposal: { ...proposal, version: 2 } }); },
  };
}

const rightOnes = (c: ReturnType<typeof call>, n = 16) => c.propose({
  act: "guide", step: "tens", level: 0,
  parts: [line("check.right_step", { step: "ones" }), line("step.invite", { step: "tens" })],
  reading: { answers: [{ value: value(n), step: "ones", verdict: "right" }] },
});

describe("PR624 round 5: explicit answers and column roles", () => {
  it.each([
    "2 plus 3 plus 1 is 6 equals 5, so I got 66.",
    "2 plus 3 plus 1 is 6 is 5, so I got 66.",
    "Two plus three plus one is six equals five, so I got sixty-six.",
  ])("does not skip a false equality after a true equation: %s", text => {
    const c = call(); c.child(text);
    const result = c.propose({ act: "accept_answer", parts: [line("answer.right")], reading: { answers: [{ value: value(66), step: "result", verdict: "right" }] } });
    expect(result.refusal?.code).toBe("answer_not_committed");
    expect(c.session.solved).toBeNull();
  });

  it("keeps a true equality after a true equation", () => {
    const c = call(); c.child("2 plus 3 plus 1 is 6 equals 6, so I got 66.");
    expect(c.propose({ act: "accept_answer", parts: [line("answer.right")], reading: { answers: [{ value: value(66), step: "result", verdict: "right" }] } }).refusal).toBeNull();
    expect(c.session.solved).toBe("child");
  });

  it.each([
    "I got 66, I added 7 and 9 so my final is 16.",
    "I got sixty-six, I added seven and nine so my final is sixteen.",
    "I got 66, I added 7 and 9 so I wrote 16.",
    "I got sixty-six, I added seven and nine so I wrote sixteen.",
  ])("does not hide the later wrong final: %s", (text) => {
    const c = call(); c.child(text);
    const result = c.propose({ act: "accept_answer", parts: [line("answer.right")], reading: { answers: [{ value: value(66), step: "result", verdict: "right" }] } });
    expect(result.refusal).not.toBeNull();
    expect(c.session.solved).toBeNull();
  });

  it.each(["Seven added to nine is six.", "7 plus 9 is equal to 6."])("does not complete a step from a false equation: %s", (text) => {
    const c = call(); c.child(text);
    expect(rightOnes(c, 6).refusal).not.toBeNull();
    expect(c.session.done).not.toContain("ones");
  });

  it.each([
    "7 plus 9 is 16, I wrote 2.",
    "Seven plus nine is sixteen, so I wrote two in the ones.",
    "7 plus 9 is 16, I wrote 6 and carried 2.",
    "7 plus 9 is 16, I wrote 6 and carried 0.",
  ])("does not complete ones with a wrong written digit: %s", (text) => {
    const c = call(); c.child(text);
    expect(rightOnes(c).refusal).not.toBeNull();
    expect(c.session.done).not.toContain("ones");
  });

  it.each([
    "2 plus 3 plus 1 is 6, so I wrote 1 in the tens.",
    "Two plus three plus one is six, so I wrote two in the tens.",
  ])("does not complete tens with a wrong written digit: %s", (text) => {
    const c = call(); c.child("Seven plus nine is sixteen.");
    expect(rightOnes(c).refusal).toBeNull();
    c.child(text);
    const result = c.propose({ act: "guide", step: "result", level: 0, parts: [line("check.right_step", { step: "tens" }), line("step.invite", { step: "result" })], reading: { answers: [{ value: value(6), step: "tens", verdict: "right" }] } });
    expect(result.refusal).not.toBeNull();
    expect(c.session.done).not.toContain("tens");
  });

  // Rule A (2026-11-12): right working in the child's own words is credited (it was "not one whole-turn template").
  it.each([
    "Seven added to nine is sixteen.", "7 plus 9 is equal to 16.",
    "7 plus 9 is 16, I wrote 6 and carried 1.",
    "Seven plus nine is sixteen, so I wrote six in the ones.",
    "7 plus 9 is 16, I put 6 in the ones and carry 1 to the tens.",
    "7 plus 9 is 16, I carry the ten.",
  ])("credits correct working in the child's own words: %s", (text) => {
    const c = call(); c.child(text);
    expect(rightOnes(c).refusal).toBeNull();
    expect(c.session.done).toContain("ones");
  });

  it("credits a false equation the child corrects in the same turn: 7 plus 9 is 6. No, I mean 7 plus 9 is 16, I wrote 6.", () => {
    const c = call(); c.child("7 plus 9 is 6. No, I mean 7 plus 9 is 16, I wrote 6.");
    expect(rightOnes(c).refusal).toBeNull();
    expect(c.session.done).toContain("ones");
  });
});
