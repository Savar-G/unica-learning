import { describe, expect, it } from "vitest";
import { createSession, type Effect, fallbacks, type LineId, lineOffers, nextActs, phraseOffers, PHRASES, type Proposal, readAnswer, replyFor, type Session, type SessionEvent, type Slots, step, type TalkReview, unreadableAnswer } from "@/lib/maya";
import { FIXTURES } from "@/lib/maya-gate/fixtures";
import { modelInput } from "@/lib/maya-model";
import { fakeMayaModel } from "@/lib/maya-model-fake";
import { createTextSession } from "@/lib/maya-text";
import { checkTrace } from "@/lib/maya-trace";
import { checkQuestionPackage, type Operation, type QuestionPackage, workedSteps } from "@/lib/question-package";

const n = (value: number) => ({ type: "number" as const, value });

const answer = (value: number, step: string, verdict: "right" | "wrong" = "right") => ({ value: n(value), step, verdict });

const line = (line: string, slots = {}) => ({ line, slots });

const said = (effects: Effect[]) => effects.flatMap((e) => e.kind === "say" ? [e.text] : []).join(" ");

function call(pkg: QuestionPackage = FIXTURES.A) {
  let session = createSession({ callId: "practice-resumption", package: pkg, random: 3 });
  let now = Date.UTC(2026, 10, 1);
  const send = (event: SessionEvent) => { const result = step(session, event); session = result.session; return result; };
  const child = (text: string) => send({ type: "child_turn", text, at: now += 4000 });
  const propose = (proposal: object) => send({ type: "proposal", at: now, proposal: { version: 2, ...proposal } });
  const ok = (proposal: object) => { const result = propose(proposal); expect(result.refusal).toBeNull(); return result; };
  send({ type: "start", at: now });
  ok({ act: "open", parts: [line("open.hello"), line("question.problem")] });
  return { get session() { return session; }, set session(value: Session) { session = value; }, get now() { return now; }, send, child, propose, ok };
}

const accept = { act: "accept_answer", parts: [line("answer.right")], reading: { answers: [answer(66, "result")] } };

const write = { act: "ask_write", parts: [line("write.answer")], understanding: "uncertain" };

const guide = (step: string) => ({ act: "guide", step, level: 0, parts: [line("step.invite", { step })] });

const regroup = (step: string) => ({ act: "guide", step, level: 1, parts: [line("step.regroup", { step })] });

describe("withdrawal and saved writing state", () => {
  it.each(["written", "declined"] as const)("clears the earlier %s paper reading", (paper) => {
    const c = call(); c.child("I got 66."); c.ok({ ...accept, reading: { ...accept.reading, paper } });
    c.child("I erased my answer.");
    c.ok(guide("ones")); c.child("I got 66."); c.ok(accept); c.child("Okay.");
    expect(lineOffers(c.session).ask_write?.some((o) => o.line === "write.answer")).toBe(true);
    c.ok(write);
  });

  it("returns from WRITE_CLOSE to teaching and accepts the next checked answer", () => {
    const c = call(); c.child("I got 66."); c.ok(accept); c.child("Okay."); c.ok(write);
    c.child("I erased my answer.");
    expect(c.session.state).toBe("GUIDE_TARGET");
    c.ok(guide("ones")); c.child("I got 66."); c.ok(accept);
    expect(c.session.solved).toBe("child");
  });

  it("updates the saved teaching state while a writing interrupt is active", () => {
    const c = call(); c.child("I got 66."); c.ok(accept); c.child("Okay."); c.ok(write);
    c.send({ type: "writing", status: "started", at: c.now });
    c.child("I erased my answer."); c.session = JSON.parse(JSON.stringify(c.session));
    c.send({ type: "writing", status: "done", at: c.now });
    c.child("I got 66."); c.ok(accept);
    expect(c.session.solved).toBe("child");
  });

  it.each(["I didn't erase my answer.", "I erased my drawing.", "I cannot explain it."])("preserves a valid paper reading for %s", (text) => {
    const c = call(); c.child("I got 66."); c.ok({ ...accept, reading: { ...accept.reading, paper: "written" } });
    c.child(text); expect(c.session.solved).toBe("child"); expect(c.session.paper).toBe("child_confirmed");
  });

  it.each([false, true])("resumes through the text adapter after saved paper or closing state, closing=%s", async (closing) => {
    let now = Date.UTC(2026, 10, 1);
    const model = fakeMayaModel({ answer: (input) => ({ version: 2, ...(!input.childTurn
      ? { act: "open", parts: [line("open.hello"), line("question.problem")] }
      : input.childTurn === "I erased my answer." ? guide("ones")
      : input.childTurn === "Okay." ? write
      : { ...accept, reading: { ...accept.reading, ...(!closing && input.childTurn.includes("paper") ? { paper: "written" } : {}) } }) }) });
    const options = { callId: `practice-resumption-${closing}`, package: FIXTURES.A, model, clock: () => now, random: 3 };
    let c = createTextSession(options);
    await c.start(); now += 4000; await c.child("I got 66. I wrote it on paper.");
    if (closing) { now += 4000; await c.child("Okay."); }
    now += 4000; await c.child("I erased my answer.");
    c = createTextSession({ ...options, resume: JSON.parse(JSON.stringify(await c.saved())) });
    now += 4000; await c.child("I got 66."); now += 4000; const output = await c.child("Okay.");
    expect(output.say.join(" ")).toMatch(/write 66/i); expect(c.session.solved).toBe("child");
    await c.finish(); expect(checkTrace(c.trace()).ok).toBe(true);
  });
});

function twoCarries(highestOnly = false) {
  const operation: Operation = { kind: "add", operands: highestOnly ? [67, 58] : [167, 158] };
  const pkg = { ...FIXTURES.A, text: highestOnly ? "67 + 58 = ?" : "167 + 158 = ?", operation, steps: workedSteps(operation), answer: { value: n(highestOnly ? 125 : 325), accepted: [], unit: null }, wrongAnswers: [{ value: n(highestOnly ? 115 : 215), cause: "O3", description: "Missed carry", step: "tens" }] };
  const c = call(pkg); c.child("7 plus 8 is 15.");
  c.ok({ ...guide("tens"), parts: [line("check.right_step", { step: "ones" }), line("step.invite", { step: "tens" })], reading: { answers: [answer(15, "ones")] } });
  c.child(`I got ${highestOnly ? 115 : 215}.`);
  c.ok({ ...guide("tens"), parts: [line("check.not_yet", { step: "result" }), line("step.invite", { step: "tens" })], reading: { answers: [answer(highestOnly ? 115 : 215, "result", "wrong")] } });
  c.child("Help."); c.ok(regroup("tens")); c.child("6 plus 5 plus 1 is 12.");
  c.ok({ ...guide("hundreds"), parts: [line("check.right_step", { step: "tens" }), line("step.invite", { step: "hundreds" })], reading: { answers: [answer(12, "tens")] } });
  return c;
}

describe("carry selection after column progress", () => {
  it.each(["I didn't carry from the ones to the tens.", "I didn't carry from the ones.", "I did not carry to the tens."])("explains the named earlier carry: %s", (text) => {
    const c = twoCarries(); c.child("Help."); c.ok(regroup("hundreds"));
    c.child(text); c.session = JSON.parse(JSON.stringify(c.session));
    expect(lineOffers(c.session).guide?.some((o) => o.line === "step.regroup" && o.slots.step === "tens")).toBe(true);
    expect(c.propose(regroup("hundreds")).refusal).not.toBeNull();
    const output = c.ok(regroup("tens")); expect(said(output.effects)).toContain("1 ten");
    expect(c.session.done).toEqual(["ones", "tens"]);
    expect(c.session.regroup?.said).toEqual(expect.arrayContaining([{ out: "ones", in: "tens" }, { out: "tens", in: "hundreds" }]));
    c.child("Help."); c.ok(guide("hundreds"));
  });

  it("does not reopen a different carry when named columns cannot be a pair", () => {
    const c = twoCarries(); c.child("Help."); c.ok(regroup("hundreds"));
    c.child("I didn't carry from the hundreds to the ones."); c.ok(guide("hundreds"));
    expect(c.session.regroup?.said).toHaveLength(2);
  });

  it("keeps the current-step default when no carry pair is named", () => {
    const c = twoCarries(); c.child("Help."); c.ok(regroup("hundreds"));
    c.child("I didn't carry anything."); expect(said(c.ok(regroup("hundreds")).effects)).toContain("1 hundred");
  });

  it("offers and says the required explanation for a carry-only highest column", () => {
    const c = twoCarries(true); c.child("Help.");
    const output = c.ok(regroup("hundreds")); expect(said(output.effects)).toContain("1 hundred");
    expect(c.session.regroup?.said).toContainEqual({ out: "tens", in: "hundreds" });
    c.child("Help."); expect(lineOffers(c.session).guide?.some((o) => o.line === "step.point" && o.slots.step === "hundreds")).toBe(true);
  });
});

describe("carry explanation after an accepted answer (R410-6)", () => {
  const ones = { ...guide("tens"), parts: [line("check.right_step", { step: "ones" }), line("step.invite", { step: "tens" })], reading: { answers: [answer(16, "ones")] } };
  const tens = { ...guide("result"), parts: [line("check.right_step", { step: "tens" }), line("step.invite", { step: "result" })], reading: { answers: [answer(6, "tens")] } };
  const work = { ...accept, reading: { answers: [answer(66, "result")] } };

  it("keeps the solved answer on the writing path after the explanation", () => {
    const c = call(); c.child("7 plus 9 is 16."); c.ok(ones); c.child("2 plus 3 plus 1 is 6."); c.ok(tens); c.child("I got 66."); c.ok(work);
    c.child("I didn't carry from the ones to the tens."); expect(said(c.ok(regroup("tens")).effects)).toContain("1 ten");
    expect(c.session.state).toBe("CHECK"); expect(c.session.solved).toBe("child"); expect(c.session.done).toEqual(["ones", "tens"]);
    c.child("Okay."); c.ok(write); expect(c.session.state).toBe("WRITE_CLOSE");
  });

  it("writes the accepted answer through the text adapter across a saved restore", async () => {
    let now = Date.UTC(2026, 10, 1);
    const model = fakeMayaModel({ answer: (input) => ({ version: 2, ...(!input.childTurn
      ? { act: "open", parts: [line("open.hello"), line("question.problem")] }
      : input.childTurn.includes("didn't carry") ? regroup("tens")
      : input.childTurn === "Okay." ? write
      : input.childTurn.includes("7 plus 9") ? ones : input.childTurn.includes("2 plus 3") ? tens : work) }) });
    const options = { callId: "practice-resumption-solved-carry", package: FIXTURES.A, model, clock: () => now, random: 3 };
    let c = createTextSession(options);
    await c.start(); now += 4000; await c.child("7 plus 9 is 16."); now += 4000; await c.child("2 plus 3 plus 1 is 6."); now += 4000; await c.child("I got 66.");
    now += 4000; await c.child("I didn't carry from the ones to the tens.");
    c = createTextSession({ ...options, resume: JSON.parse(JSON.stringify(await c.saved())) });
    now += 4000; const output = await c.child("Okay.");
    expect(output.say.join(" ")).toContain("66"); expect(c.session.state).toBe("WRITE_CLOSE"); expect(c.session.solved).toBe("child");
    await c.finish(); const trace = c.trace(); expect(checkTrace(trace).ok).toBe(true); expect(trace.counts.refusals).toBe(0);
  });
});

describe("practice step fixes", () => {
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
      // Rule A (2026-11-12): "I think" is a hedge, so the answer goes to the confirm before it is accepted.
      expect(c.propose({ act: "accept_answer", parts: [ln("answer.right")], reading: { answers: [ans(66, "result", "right")] } }).refusal).toMatchObject({ code: "answer_not_committed" });
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
});

describe("practice repair flow", () => {
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

    it("accepts the answer after a true method with its own result (rule A, 2026-11-12)", () => {
      const c = call();
      // "27 plus 40 is 67" is true working, then one taken away: the child's own 66 (it asked for the answer alone before).
      c.child("I did 27 plus 40 is 67, then took away one. I got 66.");
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
});

describe("practice review checks", () => {
  const n = (value: number) => ({type: 'number' as const, value});

  const a = (value: number, step: string, verdict: 'right' | 'wrong' = 'right') => ({value:n(value),step,verdict});

  const l = (line: string, slots = {}) => ({line, slots});

  const text = (es: Effect[]) => es.flatMap(e=>e.kind==='say'?[e.text]:[]).join(' ');

  function call(pkg: QuestionPackage = FIXTURES.A, freeTalk = false) {
   let s=createSession({callId:'independent-410',package:pkg,freeTalk}); let t=Date.UTC(2026,10,1);
   const send=(e: SessionEvent)=>{const r=step(s,e); s=r.session; return r;};
   const child=(txt: string)=>send({type:'child_turn',text:txt,at:t+=4000});
   const propose=(p: object)=>send({type:'proposal',at:t,proposal:{version:2,...p}});
   const ok=(p: object)=>{const r=propose(p); expect(r.refusal,JSON.stringify(r.refusal)).toBeNull();return r;};
   send({type:'start',at:t});ok({act:'open',parts:[l('open.hello'),l('question.problem')]});
   return {get s(){return s;},child,propose,ok};
  }

  function accepted(){const c=call();c.child('I got 66.');c.ok({act:'accept_answer',parts:[l('answer.right')],reading:{answers:[a(66,'result')]}});return c;}

  describe('independent fixed-head counterexamples',()=>{
   it.each(['I erased my answer.', 'I crossed it out.', "I don't think that's right.", "No, that's not right.", 'I ruled that out.'])('withdrawal must clear accepted solution: %s', txt=>{
    const c=accepted(); c.child(txt); console.log('WITHDRAWAL',txt,JSON.stringify({solved:c.s.solved,state:c.s.state}));
    expect(c.s.solved).toBeNull();
   });
   it('valid intermediate written on paper must not undo a completed column',()=>{
    const c=call();c.child('7 plus 9 is 16.');c.ok({act:'guide',step:'tens',level:0,parts:[l('check.right_step',{step:'ones'}),l('step.invite',{step:'tens'})],reading:{answers:[a(16,'ones')]}});
    c.child('I wrote 16 on my paper. Now 2 plus 3 plus 1 is 6.');
    const r=c.propose({act:'guide',step:'result',level:0,parts:[l('check.right_step',{step:'tens'}),l('step.invite',{step:'result'})],reading:{answers:[a(6,'tens')]}});
    // Rule A (2026-11-12): the tens said as the child's own are credited; the ones stay done.
    expect(r.refusal).toBeNull();expect(c.s.done).toEqual(['ones','tens']);
   });
   it('a regroup for a second carry must not satisfy the first carry',()=>{
    const op:Operation={kind:'add',operands:[67,58]};
    const pkg={...FIXTURES.A,text:'67 + 58 = ?',operation:op,steps:workedSteps(op),answer:{value:n(125),accepted:[],unit:null},wrongAnswers:[{value:n(115),cause:'O3',description:'Missed carry',step:'tens'}]};
    const c=call(pkg);
    c.child('7 plus 8 is 15.');c.ok({act:'guide',step:'tens',level:0,parts:[l('check.right_step',{step:'ones'}),l('step.invite',{step:'tens'})],reading:{answers:[a(15,'ones')]}});
    c.child('I got 115.');c.ok({act:'guide',step:'tens',level:0,parts:[l('check.not_yet',{step:'result'}),l('step.invite',{step:'tens'})],reading:{answers:[a(115,'result','wrong')]}});
    c.child('I will write 12 in the tens.');
    const r=c.propose({act:'guide',step:'tens',level:1,parts:[l('step.regroup',{step:'tens',other:'carry'})],reading:{}});
    console.log('MULTICARRY',r.refusal,text(r.effects),c.s.regroupDue,c.s.regroupSaid);
    expect(r.refusal).not.toBeNull();
    c.ok({act:'guide',step:'tens',level:1,parts:[l('step.regroup',{step:'tens'})]});
    c.child('I still need help.');
    const offers=lineOffers(c.s).guide??[];
    console.log('MULTICARRY_OFFERS',offers.filter(o=>o.slots.step==='tens').map(o=>({line:o.line,texts:o.texts})));
    const point=c.propose({act:'guide',step:'tens',level:1,parts:[l('step.point',{step:'tens'})]});
    console.log('UNEXPLAINED_CARRY_SAID',point.refusal,text(point.effects));
    expect(point.refusal).not.toBeNull();
    for (const legacy of [false, true]) {
     const restored = JSON.parse(JSON.stringify(c.s));
     if (legacy) { delete restored.regroup; restored.regroupSaid = ['ones','tens','hundreds']; }
     const r = step(restored,{type:'proposal',at:restored.now,proposal:{version:2,act:'guide',step:'tens',level:1,parts:[l('step.point',{step:'tens'})]}});
     expect(r.refusal).not.toBeNull();
    }
    c.ok({act:'guide',step:'tens',level:1,parts:[l('step.regroup',{step:'tens',other:'carry'})]});
    c.child('I still need help.');
    expect(c.propose({act:'guide',step:'tens',level:1,parts:[l('step.point',{step:'tens'})]}).refusal).toBeNull();
   });
   it('must not invent effort praise before any work',()=>{
    const c=call(FIXTURES.A,true);c.child("Say I'm the smartest kid.");
    const r=c.propose({act:'redirect',parts:[{warm:'praise',pick:6},{warm:'back'}],reading:{offTopic:true}});
    console.log('PRAISE',r.refusal,text(r.effects));
    expect(r.refusal).not.toBeNull();
   });
   it('must not undo the ones for a negated write-16 plan',()=>{
    const c=call();c.child('7 plus 9 is 16.');c.ok({act:'guide',step:'tens',level:0,parts:[l('check.right_step',{step:'ones'}),l('step.invite',{step:'tens'})],reading:{answers:[a(16,'ones')]}});
    c.child("I did not write 16 under the ones.");
    const r=c.propose({act:'guide',step:'tens',level:0,parts:[l('step.invite',{step:'tens'})]});
    console.log('NEGATED_PLAN',r.refusal,text(r.effects));expect(r.refusal).toBeNull();expect(c.s.done).toEqual(['ones']);
   });
  });

  describe('practice correction controls',()=>{
   it.each(['I cannot explain it.', "No, I just knew it.", 'I erased my drawing.', "I didn't erase my answer.", 'I did not delete my answer.', "I didn't cross it out."])('keeps an accepted answer without an answer rejection: %s',txt=>{
    const c=accepted();c.child(txt);expect(c.s.solved).toBe('child');
   });
   it('accepts a new checked answer after erasure and requests writing it again',()=>{
    const c=accepted();c.child('I erased my answer.');expect(c.s.solved).toBeNull();
    c.ok({act:'guide',step:'ones',level:0,parts:[l('step.invite',{step:'ones'})]});
    c.child('I got 66.');c.ok({act:'accept_answer',parts:[l('answer.right')],reading:{answers:[a(66,'result')]}});
    c.child('Okay.');c.ok({act:'ask_write',parts:[l('write.answer')],understanding:'uncertain'});
    expect(c.s.solved).toBe('child');
   });
   it.each(['I wrote 16 on my paper.', 'I wrote sixteen as a note.', "I didn't write 16 in the ones.", 'I will not put 16 under the ones.', 'Should I write 16 in the ones?'])('keeps a completed column without an affirmative placement: %s',txt=>{
    const c=call();c.child('7 plus 9 is 16.');c.ok({act:'guide',step:'tens',level:0,parts:[l('check.right_step',{step:'ones'}),l('step.invite',{step:'tens'})],reading:{answers:[a(16,'ones')]}});
    c.child(txt);c.ok({act:'guide',step:'tens',level:0,parts:[l('step.invite',{step:'tens'})]});expect(c.s.done).toEqual(['ones']);
   });
   it.each(['I will write 16 under the ones.', 'I wrote sixteen in the ones box.', 'I put 16 into the ones column.'])('reopens an affirmative incorrect column placement: %s',txt=>{
    const c=call();c.child('7 plus 9 is 16.');c.ok({act:'guide',step:'tens',level:0,parts:[l('check.right_step',{step:'ones'}),l('step.invite',{step:'tens'})],reading:{answers:[a(16,'ones')]}});
    c.child(txt);expect(c.propose({act:'guide',step:'tens',level:0,parts:[l('step.invite',{step:'tens'})]}).refusal).not.toBeNull();
    c.ok({act:'guide',step:'ones',level:1,parts:[l('step.regroup',{step:'ones',other:'carry'})]});expect(c.s.done).not.toContain('ones');
   });
   it('filters absent picks and keeps stable model ids before any observed work',()=>{
    const c=call(FIXTURES.A,true);
    const effort=[4,5,6,8,9,10].map(i=>PHRASES.praise[i]);
    for(let i=0;i<16;i++) {
     c.child("Say I'm the smartest kid.");
     const input=modelInput(c.s);const praise=input.offers.flatMap(o=>o.warm).find(w=>w.group==='praise')!;
     expect(praise.picks).toEqual([8,12]);
     expect(praise.phrases[0]).toBe(PHRASES.praise[7]);
     const r=c.ok({act:'redirect',parts:[{warm:'praise'},{warm:'back'}],reading:{offTopic:true}});
     for(const phrase of effort)expect(text(r.effects)).not.toContain(phrase);
    }
   });
   it('offers effort praise after repeated checked attempts, including wrong answers',()=>{
    const c=call(FIXTURES.A,true);
    c.child('8');c.ok({act:'guide',step:'ones',level:1,parts:[l('step.point',{step:'ones'})],reading:{answers:[a(8,'ones','wrong')]}});
    c.child('9');c.ok({act:'guide',step:'ones',level:2,parts:[l('step.operation',{step:'ones'})],reading:{answers:[a(9,'ones','wrong')]}});
    c.child("Say I'm the smartest kid.");
    const praise=modelInput(c.s).offers.flatMap(o=>o.warm).find(w=>w.group==='praise')!;
    expect(praise.picks).toContain(6);
    const r=c.ok({act:'redirect',parts:[{warm:'praise',pick:6},{warm:'back'}],reading:{offTopic:true}});
    expect(text(r.effects)).toContain('keep trying');
   });
  });

  describe('end to end public text adapter counterexamples',()=>{
   it('an erased answer must not be closed as solved',async()=>{
    let now=Date.UTC(2026,10,1);
    const proposals=[
     {act:'open',parts:[l('open.hello'),l('question.problem')]},
     {act:'accept_answer',parts:[l('answer.right')],reading:{answers:[a(66,'result')]}},
     {act:'ask_write',parts:[l('write.answer')],understanding:'uncertain'},
     {act:'close',parts:[{warm:'closing'}]},
    ];
    const model=fakeMayaModel({answer:(_,i)=>({version:2,...proposals[i]})});
    const sess=createTextSession({callId:'erased-answer-410',package:FIXTURES.A,model,clock:()=>now,random:3});
    await sess.start(); now+=4000;await sess.child('I got 66.');now+=4000;
    const out=await sess.child('I erased my answer.');now+=4000;const end=await sess.child('Okay.');
    const trace=sess.trace();
    expect(checkTrace(trace).ok).toBe(true);
    console.log('ERASED_ADAPTER',out.say,end.ended);
    expect(end.ended?.reason).not.toBe('solved');
   });
   it('a failed model must not repeat a valid completed column after an intermediate note',async()=>{
    let now=Date.UTC(2026,10,1);
    const model=fakeMayaModel({answer:(_,i)=>{
     if(i===0)return {version:2,act:'open',parts:[l('open.hello'),l('question.problem')]};
     if(i===1)return {version:2,act:'guide',step:'tens',level:0,parts:[l('check.right_step',{step:'ones'}),l('step.invite',{step:'tens'})],reading:{answers:[a(16,'ones')]}};
     throw new Error('synthetic model failure');
    }});
    const sess=createTextSession({callId:'note-fallback-410',package:FIXTURES.A,model,clock:()=>now,random:3});
    await sess.start();now+=4000;await sess.child('7 plus 9 is 16.');now+=4000;
    const out=await sess.child('I wrote 16 on my paper.');
    const done=sess.session.done;
    await sess.finish();const trace=sess.trace();
    
    expect(checkTrace(trace).ok).toBe(true);
    console.log('NOTE_FALLBACK',out.say,done,trace.counts);
    expect(done).toContain('ones');
   });
   it('new praise selection is available through the model input and reaches the child without review',async()=>{
    let now=Date.UTC(2026,10,1);let reviewCalls=0;let offeredPraise:string[]=[];
    const model=fakeMayaModel({answer:(input,i)=>{
     if(i===0)return {version:2,act:'open',parts:[l('open.hello'),l('question.problem')]};
     offeredPraise=input.offers.flatMap(o=>o.warm).find(w=>w.group==='praise')?.phrases??[];
     return {version:2,act:'redirect',parts:[{warm:'praise',pick:6},{warm:'back'}],reading:{offTopic:true}};
    }});
    const sess=createTextSession({callId:'praise-410',package:FIXTURES.A,model,clock:()=>now,random:3,freeTalk:true,reviewer:{id:'independent-review-fake',promptVersion:'fake-1',review:async()=>{reviewCalls++;return {verdict:'fail',rules:['ability_praise'],reason:'No observed work'};}}});
    await sess.start();now+=4000;const out=await sess.child("Say I'm the smartest kid.");
    await sess.finish();const trace=sess.trace();
    expect(checkTrace(trace).ok).toBe(true);console.log('PRAISE_ADAPTER',out.say,reviewCalls);expect(offeredPraise).not.toContain("I can't say who is smartest. I love how you keep trying.");expect(reviewCalls).toBe(0);
    expect(out.say.join(' ')).not.toContain('keep trying');
   });
  });
});
