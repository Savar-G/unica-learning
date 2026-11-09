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
  // #735, decision (a): after a shown step, help alone leads to the easier example, never to the answer.
  it.each(["I do not know.", "Can you show me again?"])("ends the help loop after a shown step and %j with the easier example, not the answer", (text) => {
    const c = call();
    c.child("Can you show me the ones?");
    c.ok({ act: "guide", step: "ones", level: 3, parts: [line("step.show", { step: "ones" })], reading: { help: "show" } });
    c.child(text);
    expect(c.propose({ act: "guide", step: "ones", level: 0, parts: [line("step.invite", { step: "ones" })], reading: { help: "more" } }).refusal).not.toBeNull();
    const r = c.fallback();
    expect(r.effects.some(e => e.kind === "say" && e.act === "example_step")).toBe(true);
    expect(c.s.solved).toBeNull();
    expect(c.s.done).not.toContain("ones");
    expect(c.s.assistance).not.toContain("answer_given");
  });

  it("keeps the highest help level when a child asks for a gentler prompt", () => {
    const c = call();
    c.child("Show me the ones.");
    c.ok({ act: "guide", step: "ones", level: 3, parts: [line("step.show", { step: "ones" })], reading: { help: "show" } });
    c.child("Okay.");
    // #698 round 3: after the show, a gentler prompt on the same step with no progress is the same loop (loopGuard): it is
    // refused, the help level stays at the top, and code's fallback takes the easier example.
    expect(c.propose({ act: "guide", step: "ones", level: 0, parts: [line("step.invite", { step: "ones" })] }).refusal?.code).toBe("same_hint_again");
    expect(c.s.ladder.hint).toBe(3);
    expect(c.fallback().effects.some(e => e.kind === "say" && e.act === "example_step")).toBe(true);
  });

  it("does not replace new checked progress with an answer after H3", () => {
    const c = call();
    c.child("Show me the ones.");
    c.ok({ act: "guide", step: "ones", level: 3, parts: [line("step.show", { step: "ones" })], reading: { help: "show" } });
    // The sum Maya just showed is a copy; what the child wrote on their paper is theirs. A copy moves the ladder past the
    // shown step with no credit, so the line that calls it right is not offered (fault B of the practice run at 361a05c9).
    c.child("7 plus 9 is 16.");
    expect(c.propose({ act: "guide", step: "tens", level: 0, parts: [line("check.right_step", { step: "ones" }), line("step.invite", { step: "tens" })], reading: { answers: [answer(16, "ones")] } }).refusal).toMatchObject({ code: "line_not_offered" });
    expect(c.s.done).not.toContain("ones");
    const d = call();
    d.child("Show me the ones.");
    d.ok({ act: "guide", step: "ones", level: 3, parts: [line("step.show", { step: "ones" })], reading: { help: "show" } });
    d.child("I wrote 6 and carried 1.");
    d.ok({ act: "guide", step: "tens", level: 0, parts: [line("check.right_step", { step: "ones" }), line("step.invite", { step: "tens" })], reading: { answers: [answer(6, "ones")] } });
    expect(d.s.done).toContain("ones");
    expect(d.s.solved).toBeNull();
    expect(d.s.ladder.hint).toBe(0);
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

  // A sentence that only tells how the child worked is no second answer (C09 at 361a05c9): the right answer at its end
  // stands, with no "What is your final answer on its own?".
  it.each(["I did 27 plus 40, then took away one. I got 66.", "I did 27 plus 40. Then I took away one. I got 66.", "I made 39 into 40. Then I took one away. So it's 66."])("accepts %j with no confirm", (text) => {
    const c = call();
    c.child(text);
    expect(lineOffers(c.s).confirm ?? []).toEqual([]);
    c.ok({ act: "accept_answer", parts: [line("answer.right")], reading: { answers: [answer(66, "result")] } });
    expect(c.s.solved).toBe("child");
  });

  it.each(["My mom did 27 plus 40. I got 66.", "I did 27 plus 40. I got 66?", "I didn't do 27 plus 40. I got 66."])("still confirms %j", (text) => {
    const c = call();
    c.child(text);
    expect(c.propose({ act: "accept_answer", parts: [line("answer.right")], reading: { answers: [answer(66, "result")] } }).refusal).not.toBeNull();
    expect(c.s.solved).toBeNull();
  });

  it("asks for the answer alone when an unsupported method prevents confirmation", () => {
    const c = call();
    // A second result in the working ("27 plus 40 is 67") is a second answer: Maya asks for the final answer alone.
    c.child("I did 27 plus 40 is 67, then took away one. I got 66.");
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

  it.each(["Two plus three plus one is six.", "Two and three and one make six."])("keeps the checked tens result in %j", text => {
    const c = call();
    c.child("7 plus 9 is 16.");
    c.ok({ act: "guide", step: "tens", level: 0, parts: [line("step.invite", { step: "tens" })], reading: { answers: [answer(16, "ones")] } });
    c.child(text);
    c.ok({ act: "guide", step: "result", level: 0, parts: [line("check.right_step", { step: "tens" }), line("step.invite", { step: "result" })], reading: { answers: [answer(6, "tens")] } });
    expect(c.s.done).toEqual(["ones", "tens"]);
    expect(c.s.solved).toBeNull();
  });

  it("gives no credit to the ones in a turn with a wrong final answer beside them, and accepts neither as the final answer", () => {
    const c = call();
    c.child("I got 56. I did 7 plus 9 is 16, I wrote the 6, then 2 plus 3 is 5.");
    expect(c.propose({ act: "guide", step: "tens", level: 1, parts: [line("check.right_step", { step: "ones" }), line("step.regroup", { step: "tens" })], reading: { answers: [answer(16, "ones"), { ...answer(56, "result"), verdict: "wrong" }] } }).refusal).toMatchObject({ code: "answer_not_committed" });
    expect(c.s.done).toEqual([]);
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
