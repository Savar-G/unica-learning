import { describe, expect, it } from "vitest";
import { createSession, fallbacks, lineOffers, phraseOffers, step, type Proposal, type SessionEvent } from "@/lib/maya";
import { FIXTURES } from "@/lib/maya-gate/fixtures";
import { checkQuestionPackage, type QuestionPackage } from "@/lib/question-package";

const line = (line: string, slots = {}) => ({ line, slots });
const answer = (value: number, step: string) => ({ value: { type: "number", value }, step, verdict: "right" });
function call(pkg: QuestionPackage = FIXTURES.A) {
  expect(checkQuestionPackage(pkg)).toMatchObject({ ok: true });
  let s = createSession({ callId: "practice-repair", package: pkg });
  let at = 1000;
  const send = (event: SessionEvent) => { const r = step(s, event); s = r.session; return r; };
  const propose = (p: object) => send({ type: "proposal", at, proposal: { version: 2, ...p } });
  const ok = (p: object) => { const r = propose(p); expect(r.refusal).toBeNull(); return r; };
  send({ type: "start", at });
  ok({ act: "open", parts: [line("open.hello"), line("question.problem")] });
  return { get s() { return s; }, propose, ok,
    child(text: string) { return send({ type: "child_turn", at: at += 4000, text }); },
    fallback() { for (const p of fallbacks(s)) { const r = propose(p as Proposal); if (!r.refusal) return r; } throw new Error("No accepted fallback"); },
  };
}

describe("repairs from the full subscription practice", () => {
  it.each(["I do not know.", "Can you show me again?"])("ends the help loop after a shown step and %j", (text) => {
    const c = call();
    c.child("Can you show me the ones?");
    c.ok({ act: "guide", step: "ones", level: 3, parts: [line("step.show", { step: "ones" })], reading: { help: "show" } });
    c.child(text);
    expect(c.propose({ act: "guide", step: "ones", level: 0, parts: [line("step.invite", { step: "ones" })], reading: { help: "more" } }).refusal).not.toBeNull();
    const r = c.fallback();
    expect(r.effects.some(e => e.kind === "say" && e.act === "give_answer")).toBe(true);
    expect(c.s.solved).toBe("maya");
    expect(c.s.done).not.toContain("ones");
    expect(c.s.assistance).toContain("answer_given");
  });

  it("keeps the highest help level when a child asks for a gentler prompt", () => {
    const c = call();
    c.child("Show me the ones.");
    c.ok({ act: "guide", step: "ones", level: 3, parts: [line("step.show", { step: "ones" })], reading: { help: "show" } });
    c.child("Okay.");
    c.ok({ act: "guide", step: "ones", level: 0, parts: [line("step.invite", { step: "ones" })] });
    expect(c.s.ladder.hint).toBe(3);
    c.child("I do not know.");
    expect(c.fallback().effects.some(e => e.kind === "say" && e.act === "give_answer")).toBe(true);
  });

  it("does not replace new checked progress with an answer after H3", () => {
    const c = call();
    c.child("Show me the ones.");
    c.ok({ act: "guide", step: "ones", level: 3, parts: [line("step.show", { step: "ones" })], reading: { help: "show" } });
    c.child("7 plus 9 is 16.");
    c.ok({ act: "guide", step: "tens", level: 0, parts: [line("check.right_step", { step: "ones" }), line("step.invite", { step: "tens" })], reading: { answers: [answer(16, "ones")] } });
    expect(c.s.done).toContain("ones");
    expect(c.s.solved).toBeNull();
    expect(c.s.ladder.hint).toBe(0);
  });

  it("refuses strong closing effort praise after one independent answer", () => {
    const c = call();
    c.child("I got 66.");
    c.ok({ act: "accept_answer", parts: [line("answer.right")], reading: { answers: [answer(66, "result")] } });
    c.child("I'm done.");
    expect(lineOffers(c.s).close?.some(o => o.key === "close.checked")).toBe(true);
    expect(phraseOffers(c.s, "closing").map(o => o.pick)).not.toContain(2);
    expect(c.propose({ act: "close", parts: [{ warm: "closing", pick: 2 }] }).refusal).not.toBeNull();
    expect(c.ok({ act: "close", parts: [{ warm: "closing", pick: 1 }] }).effects.some(e => e.kind === "end")).toBe(true);
  });

  it("asks for an answer alone when a mixed method also has uncertain hearing", () => {
    const c = call();
    c.child("I did 27 plus 40, then took away one. I got 66.");
    c.propose({ act: "confirm", parts: [line("question.read", { sentence: 0 })], reading: { unclear: true } });
    expect(lineOffers(c.s).confirm?.map(o => o.line)).toEqual(["confirm.answer"]);
    c.ok({ act: "confirm", parts: [line("confirm.answer")] });
    expect(c.s.solved).toBeNull();
    expect(c.s.done).toEqual([]);
  });

  it("asks for the answer alone when an unsupported method prevents confirmation", () => {
    const c = call();
    c.child("I did 27 plus 40, then took away one. I got 66.");
    expect(c.propose({ act: "accept_answer", parts: [line("answer.right")], reading: { answers: [answer(66, "result")] } }).refusal).not.toBeNull();
    expect(lineOffers(c.s).confirm?.some(o => o.line === "confirm.answer")).toBe(true);
    expect(c.propose({ act: "confirm", parts: [line("question.read", { sentence: 0 })] }).refusal).not.toBeNull();
    c.ok({ act: "confirm", parts: [line("confirm.answer")] });
    expect(c.s.heardAsked).toBeNull();
    expect(c.s.solved).toBeNull();
    c.child("66.");
    c.ok({ act: "accept_answer", parts: [line("answer.right")], reading: { answers: [answer(66, "result")] } });
    expect(c.s.solved).toBe("child");
  });

  it("answers a checked wrong answer with a correction or concrete work question", () => {
    const c = call();
    c.child("I got 56.");
    const reading = { answers: [{ ...answer(56, "result"), verdict: "wrong" }] };
    expect(c.propose({ act: "try_target", parts: [line("try.target")], reading }).refusal).not.toBeNull();
    expect(c.propose({ act: "guide", step: "ones", level: 0, parts: [line("step.invite", { step: "ones" })], reading }).refusal).not.toBeNull();
    c.ok({ act: "guide", step: "ones", level: 0, parts: [line("check.not_yet", { step: "result" }), line("step.invite", { step: "ones" })], reading });
    expect(c.s.solved).toBeNull();
  });

  it("closes after accepting an answer with an exact done statement in the same turn", () => {
    const c = call();
    c.child("Yes! The answer is 66. I'm done!");
    c.ok({ act: "accept_answer", parts: [line("answer.right")], reading: { answers: [answer(66, "result")] } });
    expect(c.s.expect).toBe("maya");
    expect(c.fallback().effects.some(e => e.kind === "end")).toBe(true);
  });

  it.each(["Should I write 16?", "7 plus 9 is 16. So I write 16?"])("explains the source column without scoring the writing question %j", text => {
    const c = call();
    c.child(text);
    const r = c.ok({ act: "guide", step: "ones", level: 1, parts: [line("step.regroup", { step: "ones", other: "carry" })] });
    expect(r.effects.some(e => e.kind === "say" && /16/.test(e.text) && /6/.test(e.text) && /tens/.test(e.text))).toBe(true);
    expect(c.s.done).not.toContain("ones");
    expect(c.s.solved).toBeNull();
  });

  it.each(["Two plus three is five, plus the one is six.", "Two plus three is five, and the carried one makes six."])("keeps the checked tens result in %j", text => {
    const c = call();
    c.child("7 plus 9 is 16.");
    c.ok({ act: "guide", step: "tens", level: 0, parts: [line("step.invite", { step: "tens" })], reading: { answers: [answer(16, "ones")] } });
    c.child(text);
    c.ok({ act: "guide", step: "result", level: 0, parts: [line("check.right_step", { step: "tens" }), line("step.invite", { step: "result" })], reading: { answers: [answer(6, "tens")] } });
    expect(c.s.done).toEqual(["ones", "tens"]);
    expect(c.s.solved).toBeNull();
  });

  it("keeps the correct ones step beside a wrong tens result without accepting either as the final answer", () => {
    const c = call();
    c.child("I got 56. I did 7 plus 9 is 16, I wrote the 6, then 2 plus 3 is 5.");
    c.ok({ act: "guide", step: "tens", level: 1, parts: [line("check.right_step", { step: "ones" }), line("step.regroup", { step: "tens" })], reading: { answers: [answer(16, "ones"), { ...answer(56, "result"), verdict: "wrong" }] } });
    expect(c.s.done).toEqual(["ones"]);
    expect(c.s.solved).toBeNull();
  });

  it.each(["Two plus three is five, and the carried two makes six.", "Two plus three is four, plus one is six.", "Two plus three plus one is six, I wrote 5."])("does not accept incorrect work beside the expected result in %j", text => {
    const c = call();
    c.child("7 plus 9 is 16.");
    c.ok({ act: "guide", step: "tens", level: 0, parts: [line("step.invite", { step: "tens" })], reading: { answers: [answer(16, "ones")] } });
    c.child(text);
    expect(c.propose({ act: "guide", step: "result", level: 0, parts: [line("step.invite", { step: "result" })], reading: { answers: [answer(6, "tens")] } }).refusal).not.toBeNull();
    expect(c.s.done).not.toContain("tens");
  });

  it("explains where the traded ones come from before a generic subtraction prompt", () => {
    const c = call(FIXTURES.B);
    c.child("Can you explain the ones?");
    c.ok({ act: "guide", step: "ones", level: 2, parts: [line("step.regroup", { step: "ones" })], reading: { help: "more" } });
    c.child("Where do the ten ones come from?");
    expect(lineOffers(c.s).guide?.some(o => o.line === "step.why")).toBe(true);
    expect(c.propose({ act: "guide", step: "ones", level: 0, parts: [line("step.invite", { step: "ones" })] }).refusal).not.toBeNull();
    const r = c.fallback();
    expect(r.effects.some(e => e.kind === "say" && /5 tens/.test(e.text) && /10 ones/.test(e.text) && /4 tens/.test(e.text) && /12 ones/.test(e.text))).toBe(true);
    expect(c.s.done).toEqual([]);
    expect(c.s.solved).toBeNull();
  });
});
