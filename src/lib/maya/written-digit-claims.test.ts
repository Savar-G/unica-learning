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


describe("R1-1: written digit claims",()=>{
 for(const written of ["I wrote", "I have written", "it is written as"]){
   it.each([true,false])("validates "+written+" correct=%s",right=>{
    const c=call();c.child(`7 plus 9 is 16, ${written} ${right?6:5} in the ones.`);
    const r=rightOnes(c);
    if(right)expect(r.refusal).toBeNull();
    else expect(r.refusal,JSON.stringify({done:r.session.done,effects:r.effects})).not.toBeNull();
   });
 }
});

describe("R2-1: pauses and unreadable writing claims", () => {
  it.each([
    "I have written... 5 in the ones",
    "it is written as ... 5 in the ones",
    "it is written as ? in the ones",
    "I have written ? in the ones",
    "I have written",
    "it is written as",
  ])("requires clarification for %s", claim => {
    const c = call();
    c.child("7 plus 9 is 16, " + claim);
    const result = rightOnes(c);
    expect(result.refusal).not.toBeNull();
    expect(result.session.done).not.toContain("ones");
  });
  it.each(["I have written... 6 in the ones", "it is written as ... 6 in the ones"])("keeps the correct digit after a pause: %s", claim => {
    const c = call();
    c.child("7 plus 9 is 16, " + claim);
    const result = rightOnes(c);
    expect(result.refusal).toBeNull();
    expect(result.session.done).toContain("ones");
  });
});
