import { describe, expect, it } from "vitest";
import {
  createSession, fallbacks, lineOffers, nextActs, PHRASES, readAnswer, replyFor, step, unreadableAnswer,
  type Effect, type LineId, type Proposal, type SessionEvent, type Slots, type TalkReview,
} from "@/lib/maya";
import { workedSteps, type Operation, type QuestionPackage } from "@/lib/question-package";

// The faults of the practice runs on the Claude subscription (2026-11-01, PR #401's table), through the session's public
// interface: empty replies to common requests, asking again for steps the child did, and talk about a carried 1 the child
// never wrote. The fixture is the research's 27 + 39 = 66, with the easier example 18 + 5.

const PACKAGE: QuestionPackage = {
  id: "wbq-27-39",
  ref: { source: "workbook", workbookId: "wb-1", page: 23, question: 4 },
  templateId: null,
  text: "27 + 39 = ?",
  answer: { value: { type: "number", value: 66 }, accepted: [], unit: null },
  operation: { kind: "add", operands: [27, 39] },
  steps: workedSteps({ kind: "add", operands: [27, 39] }),
  skill: { standard: "2.4", skills: ["2.4-add-within-100"] },
  level: 9,
  difficulty: 2,
  wrongAnswers: [{ value: { type: "number", value: 56 }, cause: "O3", description: "Forgets to carry when adding", step: "tens" }],
  easierExample: {
    text: "18 + 5 = ?",
    operation: { kind: "add", operands: [18, 5] },
    answer: { type: "number", value: 23 },
    steps: workedSteps({ kind: "add", operands: [18, 5] }),
  },
};

const T0 = Date.UTC(2026, 10, 1, 16, 0, 0);
const num = (value: number) => ({ type: "number" as const, value });
const ans = (value: number, at: string, verdict: "right" | "wrong") => ({ value: num(value), step: at, verdict });
type Draft = Omit<Proposal, "version">;
const ln = (line: LineId, slots: Slots = {}) => ({ line, slots });
const said = (effects: Effect[]) => effects.flatMap((e) => (e.kind === "say" ? [e.text] : [])).join(" ");

function call(freeTalk = false, pkg = PACKAGE) {
  let session = createSession({ callId: "fix-1", package: pkg, freeTalk });
  let clock = T0;
  const send = (event: SessionEvent) => {
    const result = step(session, event);
    if (result.refusal === null) session = result.session;
    return result;
  };
  const c = {
    get session() { return session; },
    get acts() { return nextActs(session).acts; },
    child(text: string) { clock += 4000; return send({ type: "child_turn", at: clock, text }); },
    propose(p: Draft, talkReviews: TalkReview[] = []) { return send({ type: "proposal", at: clock, proposal: { version: 2, ...p }, talkReviews }); },
    /** A proposal that must be accepted: its words. */
    maya(p: Draft, talkReviews: TalkReview[] = []) {
      const r = c.propose(p, talkReviews);
      expect(r.refusal, JSON.stringify(r.refusal)).toBeNull();
      return said(r.effects);
    },
  };
  send({ type: "start", at: clock });
  c.maya({ act: "open", parts: [ln("open.hello"), ln("question.problem")] });
  return c;
}

describe("code-written replies to common requests", () => {
  it("picks the reply that answers a question about Maya, a promise or praise, and none for anything else", () => {
    expect(replyFor("Okay. Where do you live?")).toEqual({ group: "mayafacts", pick: 2 });
    expect(replyFor("Are you a real person?")).toEqual({ group: "mayafacts", pick: 1 });
    expect(replyFor("Can you promise I'll get an A on my test?")).toEqual({ group: "promises", pick: 2 });
    expect(replyFor("Promise you'll talk to me again tomorrow?")).toEqual({ group: "promises", pick: 3 });
    expect(replyFor("Can you say I'm the smartest kid in the world?")).toEqual({ group: "praise", pick: 8 });
    expect(replyFor("You're the best teacher ever!")).toEqual({ group: "praise", pick: 1 });
    expect(PHRASES.mayafacts[1]).toBe("I'm an AI, so I don't live anywhere.");
    expect(PHRASES.promises[1]).toBe("I can't promise a grade. I can help you learn this.");
    expect(PHRASES.praise[7]).toBe("I can't say who is smartest. I'm glad you're ready to learn.");
    // Nothing to answer, or two kinds at once: the neutral phrase stays.
    expect(replyFor("I have a dog named Biscuit.")).toBeNull();
    expect(replyFor("My grandma is sick.")).toBeNull();
    expect(replyFor("Do you promise? Are you a real person?")).toBeNull();
  });

  it("answers what the child asked when the model's own words fail the guards, not with 'Thanks for telling me'", () => {
    const c = call(true);
    c.child("Okay. Where do you live?");
    // "computer" is refused by the code guards (a work word), so the review is never asked.
    const text = c.maya({ act: "redirect", parts: [{ talk: "Oh, I'm an AI, so I live inside the computer." }, { warm: "back" }], reading: { offTopic: true } });
    expect(text).toMatch(/^I'm an AI, so I don't live anywhere\. /);
    expect(text).not.toMatch(/thanks for telling me|glad you told me|i hear you/i);
  });

  it("answers a failed review the same way, and lets the model pick the reply itself", () => {
    const c = call(true);
    c.child("Can you promise I'll get an A on my test?");
    const line = "I'm an AI helper, so I can't promise a grade.";
    const text = c.maya(
      { act: "redirect", parts: [{ talk: line }, { warm: "back" }], reading: { offTopic: true } },
      [{ text: line, result: { verdict: "error", reason: "the review passed a line and named a rule or a reason" } }],
    );
    expect(text).toMatch(/^I can't promise a grade\. I can help you learn this\. /);
    c.child("Please say I'm the smartest kid in the world!");
    expect(c.maya({ act: "redirect", parts: [{ warm: "praise", pick: 8 }, { warm: "back" }], reading: { offTopic: true } }))
      .toMatch(/^I can't say who is smartest\. I'm glad you're ready to learn\. /);
  });
});

describe("steps the child already did are never asked again", () => {
  it("starts the easier example only for a child who cannot start or asks for help", () => {
    const c = call();
    c.child("Okay, let's do 27 plus 39.");
    const example = { act: "example_step" as const, step: "ones", parts: [ln("example.intro"), ln("example.step", { step: "ones" })] };
    expect(c.propose(example).refusal).toMatchObject({ code: "act_not_allowed", reason: expect.stringContaining("only for a child who cannot start") });
    expect(c.propose({ ...example, reading: { start: "no_start" } }).refusal).toBeNull();
  });

  it("guides the next step, never 'Now you try yours', when the child goes on with their question after the example", () => {
    const c = call();
    c.child("I don't want to.");
    c.maya({ act: "example_step", step: "ones", parts: [ln("example.intro"), ln("example.step", { step: "ones" })], reading: { start: "no_start" } });
    c.maya({ act: "example_step", step: "tens", parts: [ln("example.step", { step: "tens" })] });
    c.maya({ act: "example_step", step: "result", parts: [ln("example.step", { step: "result" })] });
    c.child("7 plus 9 is 16.");
    const reading = { start: "has_work" as const, answers: [ans(16, "ones", "right")] };
    expect(c.propose({ act: "try_target", parts: [ln("try.target")], reading }).refusal).toMatchObject({ code: "act_not_allowed" });
    const text = c.maya({ act: "guide", step: "tens", level: 0, parts: [ln("check.right_step", { step: "ones" }), ln("step.invite", { step: "tens" })], reading });
    expect(text).toMatch(/7 \+ 9 = 16/);
    expect(c.session.done).toEqual(["ones"]);
  });

  it("reads '6 tens' as the tens step, with no confirmation", () => {
    expect(readAnswer("So I got 6 tens.")).toMatchObject({ kept: [num(6)], final: null });
    expect(unreadableAnswer("So I got 6 tens.")).toBe(false);
    // A bigger number before a place word still changes its value: confirmed, never guessed.
    expect(unreadableAnswer("66 tens")).toBe(true);
    expect(readAnswer("6 tens and 6 ones make 66.").final).toEqual(num(66));
    const c = call();
    c.child("7 plus 9 is 16.");
    c.maya({ act: "guide", step: "tens", level: 0, parts: [ln("check.right_step", { step: "ones" }), ln("step.invite", { step: "tens" })], reading: { start: "has_work", answers: [ans(16, "ones", "right")] } });
    c.child("2 plus 3 plus 1 is 6.");
    expect(c.acts).not.toEqual(["confirm"]);
    c.maya({ act: "guide", step: "result", level: 0, parts: [ln("check.right_step", { step: "tens" }), ln("step.invite", { step: "result" })], reading: { answers: [ans(6, "tens", "right")] } });
    expect(c.session.done).toEqual(["ones", "tens"]);
  });

  it("never reads a digit the child points at as their final answer ('the one I carried')", () => {
    // Two sentences with numbers: the final stays 66, and Maya confirms it (PR #624 review round 3).
    expect(readAnswer("I think it's sixty-six. I added the one I carried.")).toMatchObject({ final: num(66), sure: false });
    expect(readAnswer("I think it's sixty-six, I added the one I carried.").final).toEqual(num(66));
    expect(readAnswer("I got 16, so I wrote the 6.").final).toEqual(num(16));
    expect(readAnswer("Yes, I carried the one from sixteen.").final).toEqual(num(16));
    // The answer's own sentence is still the one checked: a later sentence with a pointed-at digit hides nothing.
    expect(readAnswer("I would say 66. I added the one I carried.").sure).toBe(false);
    expect(readAnswer("The 5 is right.").final).toBeNull();
  });

  it("accepts a final answer said with where it was written and a thank-you", () => {
    expect(readAnswer("I got 66. I wrote it on my paper.").sure).toBe(true);
    expect(readAnswer("Yay, I got 66! I'm done. Thanks, Maya!").sure).toBe(true);
    expect(readAnswer("I got 66. Thank you!").sure).toBe(true);
    // Doubt still holds it: Maya confirms first.
    expect(readAnswer("I got 66. I think you're wrong.").sure).toBe(false);
    const c = call();
    c.child("I got 66. I wrote it on my paper.");
    expect(c.propose({ act: "accept_answer", parts: [ln("answer.right")], reading: { answers: [ans(66, "result", "right")] } }).refusal).toBeNull();
  });

  it.each([
    "Maybe 66. I wrote it on my paper.", "I got 66 or 56.", "I got 66. I withdraw it.",
    "66 isn't right.", "No 66.", "I would say 66. I added the one I carried.",
    "I got 66. I take that back.", "Because six tens and six ones make 66.",
  ])("never accepts an uncertain or withdrawn answer: %s", (text) => {
    const c = call();
    c.child(text);
    expect(c.propose({ act: "accept_answer", parts: [ln("answer.right")], reading: { answers: [ans(66, "result", "right")] } }).refusal).not.toBeNull();
    expect(c.session.solved).toBeNull();
  });

  it.each(["I take that back. I got 56.", "I withdraw it.", "That is wrong.", "66 isn't right."])("keeps an explicit withdrawal after acceptance: %s", (text) => {
    const c = call();
    c.child("I got 66.");
    c.maya({ act: "accept_answer", parts: [ln("answer.right")], reading: { answers: [ans(66, "result", "right")] } });
    c.child(text);
    expect(c.session.solved).toBeNull();
    expect(c.propose({ act: "accept_answer", parts: [ln("answer.right")], reading: { answers: [ans(66, "result", "right")] } }).refusal).not.toBeNull();
  });

  it("never confirms or judges again a right answer that stands", () => {
    const c = call();
    c.child("7 plus 9 is 16, carry the ten, 2 plus 3 plus 1 is 6, so I got 66.");
    c.maya({ act: "accept_answer", parts: [ln("answer.right")], reading: { start: "has_work", answers: [ans(16, "ones", "right"), ans(6, "tens", "right"), ans(66, "result", "right")] } });
    c.child("Yay, I got 66! Thanks, Maya, you're the best!");
    expect(c.acts).not.toContain("confirm");
    // The model's "unclear" and its repeated right answers carry nothing new once the answer stands.
    const r = c.propose({ act: "ask_write", parts: [ln("write.answer")], understanding: "evidence_observed", reading: { unclear: true, answers: [ans(66, "result", "right"), ans(16, "ones", "right")] } });
    expect(r.refusal).toBeNull();
    expect(c.session.solved).toBe("child");
  });

  it("asks for the answer on paper once it stands: 'That's right' alone is no request", () => {
    const c = call();
    c.child("I got 66.");
    c.maya({ act: "accept_answer", parts: [ln("answer.right")], reading: { answers: [ans(66, "result", "right")] } });
    c.child("Yay! Thanks, Maya!");
    expect(c.propose({ act: "ask_write", parts: [ln("answer.right")], understanding: "uncertain" }).refusal).toMatchObject({ code: "invalid_proposal" });
    expect(c.propose({ act: "ask_write", parts: [ln("write.answer")], understanding: "uncertain" }).refusal).toBeNull();
  });

  it("never says 'not yet' to the child's sure, right final answer read as a step", () => {
    const c = call();
    c.child("7 plus 9 is 16.");
    c.maya({ act: "guide", step: "tens", level: 0, parts: [ln("check.right_step", { step: "ones" }), ln("step.invite", { step: "tens" })], reading: { start: "has_work", answers: [ans(16, "ones", "right")] } });
    c.child("I think the tens make 66.");
    expect(c.propose({ act: "guide", step: "tens", level: 1, parts: [ln("check.not_yet", { step: "tens" }), ln("step.point", { step: "tens" })], reading: { answers: [ans(66, "tens", "wrong")] } }).refusal)
      .toMatchObject({ code: "rejects_right_answer" });
    expect(c.propose({ act: "accept_answer", parts: [ln("answer.right")], reading: { answers: [ans(66, "result", "right")] } }).refusal).toBeNull();
  });

  it("does not ask how the child did a step they worked out aloud", () => {
    const c = call();
    c.child("7 plus 9 is 16.");
    c.maya({ act: "guide", step: "tens", level: 0, parts: [ln("check.right_step", { step: "ones" }), ln("step.invite", { step: "tens" })], reading: { start: "has_work", answers: [ans(16, "ones", "right")] } });
    c.child("2 plus 3 plus 1 is 6.");
    c.maya({ act: "guide", step: "result", level: 0, parts: [ln("check.right_step", { step: "tens" }), ln("step.invite", { step: "result" })], reading: { answers: [ans(6, "tens", "right")] } });
    c.child("I got 66.");
    c.maya({ act: "accept_answer", parts: [ln("answer.right")], reading: { answers: [ans(66, "result", "right")] } });
    c.child("Yes!");
    const offered = (lineOffers(c.session).ask_write ?? []).map((o) => o.line);
    expect(offered).not.toContain("check.explain");
    expect(offered).not.toContain("check.thinking");
    expect(offered).toContain("write.answer");
    // A child who only said the answer is still asked how.
    const d = call();
    d.child("I got 66.");
    d.maya({ act: "accept_answer", parts: [ln("answer.right")], reading: { answers: [ans(66, "result", "right")] } });
    d.child("Yes!");
    expect((lineOffers(d.session).ask_write ?? []).map((o) => o.line)).toContain("check.explain");
  });

  it("judges a wrong final answer the child gave before their working, and keeps the right step in it", () => {
    const c = call();
    c.child("Hi! I got 56. I did 7 plus 9 is 16, so I wrote the 6. Then 2 plus 3 is 5.");
    // The whole turn is no template: the ones get no credit from it, and the wrong final answer is still judged.
    expect(c.propose({ act: "guide", step: "tens", level: 1, parts: [ln("check.right_step", { step: "ones" }), ln("check.not_yet", { step: "tens" }), ln("step.regroup", { step: "tens" })],
      reading: { start: "has_work", answers: [ans(56, "result", "wrong"), ans(16, "ones", "right"), ans(5, "tens", "wrong")] } }).refusal).toMatchObject({ code: "answer_not_committed" });
    c.maya({ act: "guide", step: "ones", level: 0, parts: [ln("check.not_yet", { step: "result" }), ln("step.invite", { step: "ones" })],
      reading: { start: "has_work", answers: [ans(56, "result", "wrong")] } });
    expect(c.session.lastResult).toBe("wrong");
    expect(c.session.done).toEqual([]);
    // Never a right answer accepted that way, and never once the final answer the child kept is right.
    const d = call();
    d.child("I got 56. No wait, I got 66.");
    expect(d.propose({ act: "guide", step: "ones", level: 0, parts: [ln("step.invite", { step: "ones" })], reading: { answers: [ans(56, "result", "wrong")] } }).refusal).not.toBeNull();
  });
});

describe("where a carried 1 comes from, before any line names it", () => {
  const regroupTexts = (c: ReturnType<typeof call>) => (lineOffers(c.session).guide ?? []).filter((o) => o.line === "step.regroup").flatMap((o) => o.texts);

  it("explains the ten and the ones in every wording without saying the final answer", () => {
    const c = call();
    c.child("7 plus 9 is 16. I write 16 under the ones.");
    const texts = [...new Set(regroupTexts(c))];
    expect(texts).toHaveLength(5);
    for (const text of texts) {
      expect(text).toMatch(/16 (?:is|into|has) 1 ten and 6 ones/);
      expect(text).not.toMatch(/\b66\b/);
    }
  });

  it("explains again when the child still denies carrying after an explanation", () => {
    const c = call();
    c.child("7 plus 9 is 16.");
    c.maya({ act: "guide", step: "tens", level: 0, parts: [ln("check.right_step", { step: "ones" }), ln("step.invite", { step: "tens" })], reading: { start: "has_work", answers: [ans(16, "ones", "right")] } });
    c.child("What 1? I didn't carry anything.");
    c.maya({ act: "guide", step: "tens", level: 1, parts: [ln("step.regroup", { step: "tens" })] });
    c.child("I still didn't write a one.");
    expect(c.propose({ act: "guide", step: "tens", level: 1, parts: [ln("step.point", { step: "tens" })] }).refusal).toMatchObject({ code: "line_not_offered" });
    expect(c.propose({ act: "guide", step: "tens", level: 1, parts: [ln("step.regroup", { step: "tens" })] }).refusal).toBeNull();
  });

  it("does not mark the next carry as explained when one column receives and makes a carry", () => {
    const operation: Operation = { kind: "add", operands: [67, 58] };
    const c = call(false, { ...PACKAGE, text: "67 + 58 = ?", operation, steps: workedSteps(operation), answer: { value: num(125), accepted: [], unit: null }, wrongAnswers: [{ value: num(115), cause: "O3", description: "Forgets the ten from the ones", step: "tens" }] });
    c.child("7 plus 8 is 15.");
    c.maya({ act: "guide", step: "tens", level: 0, parts: [ln("check.right_step", { step: "ones" }), ln("step.invite", { step: "tens" })], reading: { start: "has_work", answers: [ans(15, "ones", "right")] } });
    c.child("I got 115.");
    c.maya({ act: "guide", step: "tens", level: 1, parts: [ln("step.regroup", { step: "tens" })], reading: { answers: [ans(115, "result", "wrong")] } });
    // This line explained 15 as one ten and five ones, not the new carry from the tens to the hundreds.
    expect(c.session.regroupSaid).not.toContain("hundreds");
    expect(c.session.regroupDue).toContain("hundreds");
  });

  it("says the regroup line after a lost carry, before 'the 1 you carried'", () => {
    const c = call();
    c.child("I got 56.");
    c.maya({ act: "guide", step: "ones", level: 0, parts: [ln("check.not_yet", { step: "result" }), ln("step.invite", { step: "ones" })], reading: { start: "has_work", answers: [ans(56, "result", "wrong")] } });
    c.child("7 plus 9 is 16.");
    c.maya({ act: "guide", step: "tens", level: 0, parts: [ln("check.right_step", { step: "ones" }), ln("step.invite", { step: "tens" })], reading: { answers: [ans(16, "ones", "right")] } });
    c.child("I added the tens, 2 plus 3 is 5.");
    const reading = { answers: [ans(5, "tens", "wrong")] };
    expect(c.propose({ act: "guide", step: "tens", level: 1, parts: [ln("check.not_yet", { step: "tens" }), ln("step.point", { step: "tens" })], reading }).refusal)
      .toMatchObject({ code: "line_not_offered" });
    expect(c.propose({ act: "guide", step: "tens", level: 2, parts: [ln("step.operation", { step: "tens" })], reading }).refusal).not.toBeNull();
    const text = c.maya({ act: "guide", step: "tens", level: 1, parts: [ln("check.not_yet", { step: "tens" }), ln("step.regroup", { step: "tens" })], reading });
    expect(text).toMatch(/16/);
    expect(text).toMatch(/1 ten\b/);
    expect(text).not.toMatch(/you carried|carried 1/);
    // Once it is said, the carry lines come back.
    c.child("Still 5.");
    expect(c.propose({ act: "guide", step: "tens", level: 1, parts: [ln("step.point", { step: "tens" })], reading: { answers: [ans(5, "tens", "wrong")] } }).refusal).toBeNull();
  });

  it("explains the regroup when the child says they did not carry, even after a carry line at the same level", () => {
    const c = call();
    c.child("7 plus 9 is 16.");
    c.maya({ act: "guide", step: "tens", level: 0, parts: [ln("check.right_step", { step: "ones" }), ln("step.invite", { step: "tens" })], reading: { start: "has_work", answers: [ans(16, "ones", "right")] } });
    c.child("4.");
    c.maya({ act: "guide", step: "tens", level: 1, parts: [ln("step.point", { step: "tens" })], reading: { answers: [ans(4, "tens", "wrong")] } });
    c.child("What 1? I didn't carry anything.");
    expect(regroupTexts(c).length).toBeGreaterThan(0);
    expect(c.propose({ act: "guide", step: "tens", level: 1, parts: [ln("step.point", { step: "tens" })] }).refusal).toMatchObject({ code: "line_not_offered" });
    // Code's fallback says it first too.
    const first = fallbacks(c.session).find((p) => p.act === "guide");
    expect(first?.parts).toContainEqual({ line: "step.regroup", slots: { step: "tens" } });
    expect(c.propose({ act: "guide", step: "tens", level: 1, parts: [ln("step.regroup", { step: "tens" })] }).refusal).toBeNull();
  });

  it("never accepts a plan to write a two-digit sum in the ones", () => {
    const c = call();
    c.child("7 plus 9 is 16. I write 16 under the ones.");
    const reading = { start: "has_work" as const, answers: [ans(16, "ones", "right")] };
    expect(c.propose({ act: "guide", step: "tens", level: 0, parts: [ln("check.right_step", { step: "ones" }), ln("step.invite", { step: "tens" })], reading }).refusal)
      .toMatchObject({ code: "wrong_step", reason: expect.stringContaining("step.regroup") });
    const text = c.maya({ act: "guide", step: "ones", level: 1, parts: [ln("step.regroup", { step: "ones", other: "carry" })], reading });
    expect(text).toMatch(/6/);
    expect(c.session.done).toEqual([]);
    c.child("I write 6 and carry 1.");
    c.maya({ act: "guide", step: "tens", level: 0, parts: [ln("check.right_step", { step: "ones" }), ln("step.invite", { step: "tens" })], reading: { answers: [ans(6, "ones", "right")] } });
    expect(c.session.done).toEqual(["ones"]);
  });

  it("does not call for a regroup when the child carried", () => {
    const c = call();
    c.child("I wrote 6 and carried 1.");
    c.maya({ act: "guide", step: "tens", level: 0, parts: [ln("check.right_step", { step: "ones" }), ln("step.invite", { step: "tens" })], reading: { start: "has_work", answers: [ans(6, "ones", "right")] } });
    c.child("2 plus 3 is 4.");
    // A wrong tens sum that is not the lost carry: the ordinary hint ladder.
    expect(c.propose({ act: "guide", step: "tens", level: 1, parts: [ln("step.point", { step: "tens" })], reading: { answers: [ans(4, "tens", "wrong")] } }).refusal).toBeNull();
  });
});
