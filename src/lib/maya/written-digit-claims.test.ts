import { describe, expect, it } from "vitest";
import { createSession, step, type LineChoice, type LineId, type Proposal, type SessionEvent, type Slots } from "@/lib/maya";
import { FIXTURES } from "@/lib/maya-gate/fixtures";
import { createTextSession } from "@/lib/maya-text";
import { fakeMayaModel } from "@/lib/maya-model-fake";

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
    // A sum and a claim are two templates: a right one is not heard (whole-turn rule), and code still tells it from a wrong one.
    expect(r.refusal?.code).toBe(right?"answer_not_committed":"accepts_wrong_answer");
    expect(r.session.done).not.toContain("ones");
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
    expect(result.refusal?.code).toBe("answer_not_committed");
    expect(result.session.done).not.toContain("ones");
  });
});

describe("R3-1: a pause must retain the named column", () => {
  it.each([
    "I wrote... 6...in the hundreds",
    "I carried... 1...from the tens",
    "I carried... 1...to the ones",
    "I wrote... 6 ... in the hundreds",
    "I carried... 1 ... from the tens",
    "I carried... 1 ... to the ones",
    "I carried 1, from the tens",
    "I carried 1. From the tens",
    "I carried 1...0 to the tens",
    "I carried 1..0 to the tens",
  ])("refuses credit for the wrong or unclear relation: %s", claim => {
    const c = call();
    c.child("7 plus 9 is 16, " + claim);
    const result = rightOnes(c);
    expect(result.refusal).not.toBeNull();
    expect(result.session.done).not.toContain("ones");
  });
  it.each(["I carried... 1 ... from the ones to the tens", "I wrote... 6 ... in the ones"])("keeps the checked relation across pauses: %s", claim => {
    const c = call();
    c.child("7 plus 9 is 16, " + claim);
    const result = rightOnes(c);
    expect(result.refusal?.code).toBe("answer_not_committed");
    expect(result.session.done).not.toContain("ones");
  });
});

describe("a carry source cannot be discarded by sentence punctuation", () => {
  for (const pause of ["...", "…", ",", ".", ";", "?", "!", "\n", ":", "-"]) {
    it.each([
      `I carried ${pause} 1 ${pause} from the tens`,
      `I carried 1 from ${pause} the tens`,
      `I carried 1 from the ${pause} tens`,
    ])("keeps the unsafe source visible: %s", claim => {
      const c = call();
      c.child("7 plus 9 is 16, " + claim);
      const result = rightOnes(c);
      expect(result.refusal).not.toBeNull();
      expect(result.session.done).not.toContain("ones");
    });
  }
});

describe("R4: incomplete relations and separate carry clauses", () => {
  it("does not save or restore credit from a discarded carry source", async () => {
    let at = 1000;
    const model = fakeMayaModel({ answer: (_input, n) => n === 0
      ? { version: 2, act: "open", parts: [line("open.hello"), line("question.problem")] }
      : { version: 2, act: "guide", step: "tens", level: 0,
        parts: [line("check.right_step", { step: "ones" }), line("step.invite", { step: "tens" })],
        reading: { answers: [{ step: "ones", value: value(16), verdict: "right" }] } } });
    const options = { callId: "r4-persistence", package: FIXTURES.A, model, clock: () => at, random: 7, freeTalk: true };
    const text = createTextSession(options); await text.start(); at += 4000;
    await text.child("7 plus 9 is 16, I carried 1, from, the tens.");
    const saved = JSON.parse(JSON.stringify(await text.saved()));
    expect(text.session.done).not.toContain("ones");
    expect(saved.session.done).not.toContain("ones");
    expect(createTextSession({ ...options, resume: saved }).session.done).not.toContain("ones");
  });
  for (const separator of [",", ".", ";", "!", "?"]) {
    it.each([
      `I carried 1${separator} from${separator} the tens`,
      `I carried 1${separator} to${separator} the ones`,
      `I wrote 6${separator} in${separator} the hundreds`,
    ])("keeps an interrupted relation unclear: %s", claim => {
      const c = call(); c.child("7 plus 9 is 16, " + claim);
      const result = rightOnes(c);
      expect(result.refusal).not.toBeNull();
      expect(result.session.done).not.toContain("ones");
    });
  }
  it.each(["I wrote 6", "it is written as 6"])("accepts a separate correct carry after %s", written => {
    const c = call(); c.child(`7 plus 9 is 16, ${written} in the ones and I carried 1 to the tens.`);
    const result = rightOnes(c);
    expect(result.refusal?.code).toBe("answer_not_committed");
    expect(result.session.done).not.toContain("ones");
  });
});

it.each([1, 2])("checks the incoming value in a backward carry reference: %s", carry => {
  const c = call();
  c.child("7 plus 9 is 16.");
  expect(rightOnes(c).refusal).toBeNull();
  c.child(`For the tens, I did 2 plus 3, that's 5, plus the ${carry} I carried. So I got 6 tens.`);
  const result = c.propose({ act: "guide", step: "result", level: 0,
    parts: [line("check.right_step", { step: "tens" }), line("step.invite", { step: "result" })],
    reading: { answers: [{ value: value(6), step: "tens", verdict: "right" }] },
  });
  expect(result.refusal?.code).toBe(carry === 1 ? "answer_not_committed" : "accepts_wrong_answer");
  expect(result.session.done).not.toContain("tens");
});

it.each([
  ["1 that I", true], ["one that we", true],
  ["2 that I", false], ["two that we", false],
] as const)("keeps the optional relative word outside the numeric reference: %s", (reference, correct) => {
  const c = call(); c.child("7 plus 9 is 16.");
  expect(rightOnes(c).refusal).toBeNull();
  c.child(`For the tens, I did 2 plus 3, that's 5, plus the ${reference} carried. So I got 6 tens.`);
  const result = c.propose({ act: "guide", step: "result", level: 0,
    parts: [line("check.right_step", { step: "tens" }), line("step.invite", { step: "result" })],
    reading: { answers: [{ value: value(6), step: "tens", verdict: "right" }] },
  });
  expect(result.refusal?.code).toBe(correct ? "answer_not_committed" : "accepts_wrong_answer");
  expect(result.session.done).not.toContain("tens");
});
