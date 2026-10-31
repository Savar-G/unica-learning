import { describe, expect, it } from "vitest";
import { createSession, learningEvent, nextActs, SAFETY_GUIDANCE, step, TEMPLATES, valuesIn, type Effect, type LineId, type Proposal, type SessionEvent, type Slots } from "@/lib/maya";
import { workedSteps, type QuestionPackage } from "@/lib/question-package";

// Maya's teaching controller (#321): scripted child turns, model proposals and a passed-in clock, through the session's
// public interface only. The fixture is the research's binding example, 27 + 39 = 66, with the easier example 18 + 5.

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

const T0 = Date.UTC(2026, 9, 29, 16, 0, 0);
const num = (value: number) => ({ type: "number" as const, value });
const FAMILY = { parentId: "p", childId: "c" };
/** A proposal without its version: the helpers add version 2. */
type Draft = Omit<Proposal, "version">;
const t = (talk: string) => ({ talk });
const ln = (line: LineId, slots: Slots = {}) => ({ line, slots });
const v2 = (p: unknown) => (typeof p === "object" && p !== null && !Array.isArray(p) && !("version" in p) ? { version: 2, ...p } : p);
const OPEN: Draft = { act: "open", parts: [t("Hi Leah!"), ln("open.hello"), t("Our team may review this call. How are you today?")] };

/** One scripted call: every step must be accepted unless the test asks for a refusal. */
function call(pkg: unknown = PACKAGE) {
  let session = createSession({ callId: "call-1", package: pkg });
  let clock = T0;
  const send = (event: SessionEvent) => {
    const result = step(session, event);
    expect(result.refusal).toBeNull();
    session = result.session;
    return result;
  };
  return {
    get session() { return session; },
    get next() { return nextActs(session); },
    /** Moves the clock to `s` seconds after the start, without an event. */
    at(s: number) { clock = T0 + s * 1000; },
    start: () => send({ type: "start", at: clock }),
    child: (text: string, extra: Partial<Extract<SessionEvent, { type: "child_turn" }>> = {}) => send({ type: "child_turn", at: clock, text, ...extra }),
    maya: (proposal: Draft) => send({ type: "proposal", at: clock, proposal: v2(proposal) }),
    tick(s: number) { clock = T0 + s * 1000; return send({ type: "tick", at: clock }); },
    send,
    /** A proposal the session must refuse: the session does not change. */
    refused(proposal: unknown) {
      const result = step(session, { type: "proposal", at: clock, proposal: v2(proposal) });
      expect(result.refusal).not.toBeNull();
      expect(result.session).toEqual(session);
      return result.refusal!;
    },
  };
}

/** A call past its opening, waiting for the child's first words. */
function opened(pkg: unknown = PACKAGE) {
  const c = call(pkg);
  c.start();
  c.maya(OPEN);
  return c;
}

const said = (effects: Effect[]) => effects.flatMap((e) => (e.kind === "say" ? [e.text] : []));
const ended = (effects: Effect[]) => effects.find((e) => e.kind === "end");

describe("READY, OPEN and CONTENT_HOLD", () => {
  it("starts in READY and opens on a checked package", () => {
    const c = call();
    expect(c.session.state).toBe("READY");
    expect(c.next).toEqual({ expect: "nothing", acts: [] });
    c.start();
    expect(c.session.state).toBe("OPEN");
    expect(c.next).toEqual({ expect: "maya", acts: ["open"] });
    const { effects } = c.maya(OPEN);
    const [hello] = said(effects);
    expect(said(effects)).toHaveLength(1);
    expect(hello).toMatch(/^Hi Leah! .*\bAI\b.* Our team may review this call\. How are you today\?$/);
    expect(c.next).toEqual({ expect: "child", acts: [] });
  });

  it("refuses an opening that does not say Maya is an AI", () => {
    const c = call();
    c.start();
    expect(c.refused({ act: "open", parts: [t("Hi Leah, I'm Maya. What did you try?")] })).toMatchObject({ code: "missing_disclosure" });
  });

  it("refuses a proposal that is not a proposal", () => {
    const c = call();
    c.start();
    expect(c.refused({ act: "teleport", parts: [t("Hi")] })).toMatchObject({ code: "invalid_proposal" });
    expect(c.refused("open")).toMatchObject({ code: "invalid_proposal" });
  });

  it("holds a package that does not check, teaches nothing and closes as a content issue", () => {
    const c = call({ ...PACKAGE, answer: { value: num(56), accepted: [], unit: null } });
    c.start();
    expect(c.session.state).toBe("CONTENT_HOLD");
    expect(c.next).toEqual({ expect: "maya", acts: ["close"] });
    expect(c.refused(OPEN)).toMatchObject({ code: "content_hold", allowed: ["close"] });
    const { effects } = c.maya({ act: "close", parts: [t("I can't check this question right now. Please ask a grown-up to help.")] });
    expect(c.session.state).toBe("CLOSE");
    expect(ended(effects)).toMatchObject({ outcome: { reason: "content_issue", assistance: "independent", paperStatus: "unknown" } });
  });
});

const right66 = { value: num(66), step: "result", verdict: "right" as const };

describe("the main path", () => {
  it("takes a child who solved it to CHECK, WRITE_CLOSE and CLOSE as solved and independent", () => {
    const c = opened();
    c.child("I got 66. I added the ones first.");
    expect(c.session.state).toBe("ASSESS");
    c.maya({ act: "accept_answer", parts: [ln("answer.right"), ln("check.explain", { step: "tens" })], reading: { start: "has_work", answers: [right66] } });
    expect(c.session.state).toBe("CHECK");
    c.child("Seven plus nine is sixteen, so I carried a ten.");
    c.maya({ act: "ask_write", parts: [ln("write.answer")], understanding: "evidence_observed" });
    expect(c.session.state).toBe("WRITE_CLOSE");
    c.child("Done, I wrote it.");
    const { effects } = c.maya({ act: "close", parts: [t("Nice work today. Bye for now!")], reading: { paper: "written" } });
    expect(c.session.state).toBe("CLOSE");
    expect(c.next).toEqual({ expect: "nothing", acts: [] });
    expect(ended(effects)).toMatchObject({
      outcome: { reason: "solved", assistance: "independent", paperStatus: "child_confirmed", understanding: "evidence_observed", highestHint: null, safetyFlag: false },
      safetyMessage: null,
    });
  });

  it("allows only accepting a right answer the child said, not skipping past it", () => {
    const c = opened();
    c.child("I think it's 66.");
    const r = c.refused({ act: "example_step", step: "ones", parts: [ln("example.intro")], reading: { answers: [right66] } });
    expect(r).toMatchObject({ code: "act_not_allowed", allowed: ["accept_answer", "confirm"] });
  });

  it("does not close before asking the child to write the answer on paper", () => {
    const c = opened();
    c.child("66");
    c.maya({ act: "accept_answer", parts: [t("Yes. How do you know?")], reading: { answers: [right66] } });
    c.child("I don't know.");
    expect(c.refused({ act: "close", parts: [t("Bye!")] })).toMatchObject({ code: "act_not_allowed", allowed: ["ask_write", "guide", "confirm"] });
    c.maya({ act: "ask_write", parts: [ln("write.answer")], understanding: "uncertain" });
    c.child("No, I don't want to.");
    const { effects } = c.maya({ act: "close", parts: [t("That's okay. Bye for now!")], reading: { paper: "declined" } });
    expect(ended(effects)).toMatchObject({ outcome: { reason: "solved", paperStatus: "declined", understanding: "uncertain" } });
  });

  it("judges the child's last committed number: 'sixty... no, sixty-six'", () => {
    const c = opened();
    c.child("sixty... no, sixty-six");
    c.maya({ act: "accept_answer", parts: [{ warm: "encourage" }, ln("check.explain", { step: "tens" })], reading: { answers: [right66] } });
    expect(c.session.state).toBe("CHECK");
  });
});

describe("a wrong child answer is never accepted", () => {
  it("refuses accepting 56, whatever the model's verdict says", () => {
    const c = opened();
    c.child("I got 56.");
    const wrong56 = { value: num(56), step: "result", verdict: "right" as const };
    expect(c.refused({ act: "accept_answer", parts: [ln("answer.right")], reading: { answers: [wrong56] } })).toMatchObject({ code: "accepts_wrong_answer" });
    expect(c.refused({ act: "guide", step: "ones", level: 0, parts: [t("Good. What is next?")], reading: { answers: [wrong56] } })).toMatchObject({ code: "accepts_wrong_answer" });
    expect(c.refused({ act: "accept_answer", parts: [ln("answer.right")], reading: { answers: [{ ...wrong56, verdict: "wrong" }] } })).toMatchObject({ code: "accepts_wrong_answer" });
    expect(c.refused({ act: "accept_answer", parts: [ln("answer.right")] })).toMatchObject({ code: "accepts_wrong_answer" });
    c.maya({ act: "guide", step: "ones", level: 0, parts: [ln("step.invite", { step: "ones" })], reading: { answers: [{ ...wrong56, verdict: "wrong" }] } });
    expect(c.session.state).toBe("GUIDE_TARGET");
  });

  it("refuses an answer the child did not say", () => {
    const c = opened();
    c.child("I got 56.");
    expect(c.refused({ act: "accept_answer", parts: [ln("answer.right")], reading: { answers: [right66] } })).toMatchObject({ code: "answer_not_heard" });
  });

  it("refuses marking a right answer wrong, even when the child's teacher is quoted", () => {
    const c = opened();
    c.child("My teacher says it is 56, but I got 66.");
    expect(c.refused({ act: "guide", step: "ones", level: 0, parts: [t("Let's check again.")], reading: { answers: [{ ...right66, verdict: "wrong" }] } }))
      .toMatchObject({ code: "rejects_right_answer" });
    // Maya's math is only code's lines: a wrong sum cannot be said, and the line the act offers says 66.
    expect(c.refused({ act: "accept_answer", parts: [t("Your teacher is right: 27 plus 39 is 56."), ln("answer.right")], reading: { answers: [right66] } }))
      .toMatchObject({ code: "free_talk_in_math_turn" });
  });

  it("tells a right step apart from the whole answer: 16 is the ones, not the answer", () => {
    const c = opened();
    c.child("Seven plus nine is 16. So is the answer 16?");
    expect(c.refused({ act: "accept_answer", parts: [t("Yes!")], reading: { answers: [{ value: num(16), step: "result", verdict: "right" }] } }))
      .toMatchObject({ code: "accepts_wrong_answer" });
    c.maya({
      act: "guide", step: "tens", level: 0, parts: [ln("check.right_step", { step: "ones" }), ln("step.invite", { step: "tens" })],
      reading: { answers: [{ value: num(16), step: "ones", verdict: "right" }, { value: num(16), step: "result", verdict: "wrong" }] },
    });
    expect(c.session.state).toBe("GUIDE_TARGET");
  });

  it("refuses an equation in Maya's own words: math comes only from code's lines", () => {
    const c = opened();
    c.child("I don't know how to start.");
    // With a math line, the model's own words are refused; with none, they are replaced by a bank phrase (D-196).
    expect(c.refused({ act: "guide", step: "ones", level: 0, parts: [t("Seven plus nine is fifteen."), ln("step.invite", { step: "ones" })] }))
      .toMatchObject({ code: "free_talk_in_math_turn" });
    const { effects } = c.maya({ act: "guide", step: "ones", level: 0, parts: [t("Seven plus nine is fifteen.")] });
    expect(effects).toContainEqual({ kind: "say", act: "guide", text: expect.not.stringMatching(/seven|fifteen/i), talkReplaced: 1 });
  });
});

/** A no-start call that has worked the whole easier example (18 + 5 = 23) and handed the question back. */
function afterExample() {
  const c = opened();
  c.child("I don't know how to start.");
  c.maya({ act: "example_step", step: "ones", parts: [ln("example.intro"), ln("example.step", { step: "ones" })], reading: { start: "no_start" } });
  c.maya({ act: "example_step", step: "tens", parts: [ln("example.step", { step: "tens" })] });
  c.maya({ act: "example_step", step: "result", parts: [ln("example.step", { step: "result" })] });
  c.child("Okay.");
  c.maya({ act: "try_target", parts: [ln("try.target")] });
  return c;
}

describe("the easier example and the child's own question", () => {
  it("works the example step by step, in order, then hands the question back", () => {
    const c = opened();
    c.child("I don't know how to start.");
    expect(c.refused({ act: "example_step", step: "tens", parts: [ln("example.step", { step: "tens" })] })).toMatchObject({ code: "wrong_step" });
    c.maya({ act: "example_step", step: "ones", parts: [ln("example.intro"), ln("example.step", { step: "ones" })], reading: { start: "no_start" } });
    expect(c.session.state).toBe("MODEL_EXAMPLE");
    expect(c.next).toEqual({ expect: "maya", acts: ["accept_answer", "example_step"] });
    expect(c.refused({ act: "try_target", parts: [t("Now try yours.")] })).toMatchObject({ code: "act_not_allowed" });
    expect(c.refused({ act: "guide", step: "ones", level: 1, parts: [ln("step.point", { step: "ones" })] })).toMatchObject({ code: "act_not_allowed" });
    c.maya({ act: "example_step", step: "tens", parts: [ln("example.step", { step: "tens" })] });
    expect(c.refused({ act: "example_step", step: "result", parts: [ln("example.step", { step: "result" }), t("Now write 66.")] })).toMatchObject({ code: "math_line_not_last" });
    expect(c.refused({ act: "example_step", step: "result", parts: [ln("answer.right")] })).toMatchObject({ code: "line_not_offered" });
    expect(c.refused({ act: "example_step", step: "result", parts: [t("So 18 + 5 is 24."), ln("example.step", { step: "result" })] }))
      .toMatchObject({ code: "free_talk_in_math_turn" });
    c.maya({ act: "example_step", step: "result", parts: [ln("example.step", { step: "result" })] });
    expect(c.next).toEqual({ expect: "child", acts: [] });
    c.child("Okay.");
    c.maya({ act: "try_target", parts: [ln("try.target")] });
    expect(c.session.state).toBe("TRY_TARGET");
  });

  it("solves after the example as a worked example, not independent", () => {
    const c = afterExample();
    c.child("I got 66!");
    c.maya({ act: "accept_answer", parts: [ln("answer.right"), ln("check.explain", { step: "tens" })], reading: { answers: [right66] } });
    c.child("I put it with the tens.");
    c.maya({ act: "ask_write", parts: [ln("write.answer")], understanding: "evidence_observed" });
    c.child("I wrote it.");
    const { effects } = c.maya({ act: "close", parts: [t("Great work. Bye!")], reading: { paper: "written" } });
    expect(ended(effects)).toMatchObject({ outcome: { reason: "solved", assistance: "worked_example", understanding: "evidence_observed" } });
    expect(learningEvent(c.session, FAMILY)).toMatchObject({ question: PACKAGE.ref, result: "right_with_help", stuckStep: "ones", mistake: null, hints: 0 });
  });
});

describe("the hint ladder", () => {
  it("rises one level per failed attempt, needs more help after two failures at one level, and gives the answer only at H4", () => {
    const c = afterExample();
    const wrong = (value: number, at: string) => ({ answers: [{ value: num(value), step: at, verdict: "wrong" as const }] });
    c.child("I got 56.");
    expect(c.refused({ act: "guide", step: "ones", level: 3, parts: [ln("step.show", { step: "ones" })], reading: wrong(56, "result") })).toMatchObject({ code: "hint_too_high" });
    c.maya({ act: "guide", step: "ones", level: 1, parts: [ln("step.point", { step: "ones" })], reading: wrong(56, "result") });
    c.child("16");
    // A right step moves on with less help: the tens start at H0.
    expect(c.refused({ act: "guide", step: "tens", level: 1, parts: [ln("step.point", { step: "tens" })], reading: { answers: [{ value: num(16), step: "ones", verdict: "right" }] } }))
      .toMatchObject({ code: "hint_too_high" });
    c.maya({ act: "guide", step: "tens", level: 0, parts: [ln("check.right_step", { step: "ones" }), ln("step.invite", { step: "tens" })], reading: { answers: [{ value: num(16), step: "ones", verdict: "right" }] } });
    c.child("Two plus three is 5.");
    expect(c.refused({ act: "guide", step: "tens", level: 2, parts: [ln("step.operation", { step: "tens" })], reading: wrong(5, "tens") })).toMatchObject({ code: "hint_too_high" });
    c.maya({ act: "guide", step: "tens", level: 1, parts: [ln("step.point", { step: "tens" })], reading: wrong(5, "tens") });
    c.child("5?");
    c.maya({ act: "guide", step: "tens", level: 1, parts: [ln("step.point", { step: "tens" })], reading: wrong(5, "tens") });
    c.child("Still 5.");
    expect(c.refused({ act: "guide", step: "tens", level: 1, parts: [ln("step.point", { step: "tens" })], reading: wrong(5, "tens") })).toMatchObject({ code: "same_hint_again" });
    c.maya({ act: "guide", step: "tens", level: 2, parts: [ln("step.operation", { step: "tens" })], reading: wrong(5, "tens") });
    c.child("Can you show me?");
    expect(c.refused({ act: "give_answer", parts: [ln("step.show", { step: "tens" })], reading: { help: "show" } })).toMatchObject({ code: "hint_too_high" });
    c.maya({ act: "guide", step: "tens", level: 3, parts: [ln("step.show", { step: "tens" })], reading: { help: "show" } });
    c.child("I'm still stuck.");
    const given = c.maya({ act: "give_answer", parts: [ln("step.show", { step: "tens" })], reading: { help: "more" } });
    const [givenText] = said(given.effects);
    const gives = TEMPLATES["answer.give"].map((x) => x.replaceAll("{answer}", "66"));
    expect(gives.some((g) => givenText.endsWith(`Add the tens: 2 + 3 + 1 = 6. Write 6. ${g}`))).toBe(true);
    expect(c.session.state).toBe("WRITE_CLOSE");

    // The child repeats it correctly: the answer was still given.
    c.child("66. I wrote 66.");
    const { effects } = c.maya({ act: "close", parts: [t("Well done for sticking with it. Bye!")], reading: { answers: [right66], paper: "written" } });
    expect(ended(effects)).toMatchObject({ outcome: { reason: "solved", assistance: "answer_given", understanding: "uncertain", highestHint: 4 } });
    expect(learningEvent(c.session, FAMILY)).toMatchObject({ result: "right_with_help", stuckStep: "ones", mistake: null, hints: 6 });
  });

  it("keeps answer_given and uncertain understanding after a later correct repeat in CHECK", () => {
    const c = opened();
    c.child("Just show me how.");
    c.maya({ act: "guide", step: "ones", level: 3, parts: [ln("step.show", { step: "ones" })], reading: { help: "show" } });
    c.child("I really don't get it.");
    c.maya({ act: "give_answer", parts: [ln("step.show", { step: "ones" })], reading: { help: "more" } });
    c.child("66!");
    c.maya({ act: "close", parts: [t("Bye for now!")], reading: { answers: [right66] } });
    expect(c.session.outcome).toMatchObject({ assistance: "answer_given", understanding: "uncertain", paperStatus: "unknown" });
  });

  it("never steps up on silence alone", () => {
    const c = opened();
    c.child("I got 56.");
    c.maya({ act: "guide", step: "ones", level: 0, parts: [ln("step.invite", { step: "ones" })], reading: { answers: [{ value: num(56), step: "result", verdict: "wrong" }] } });
    c.tick(5);
    expect(c.next).toEqual({ expect: "child", acts: [] });
    expect(c.refused({ act: "guide", step: "ones", level: 1, parts: [ln("step.point", { step: "ones" })] })).toMatchObject({ code: "not_mayas_turn" });
    c.tick(16);
    expect(c.next).toEqual({ expect: "maya", acts: ["check_in"] });
    expect(c.refused({ act: "guide", step: "ones", level: 1, parts: [ln("step.point", { step: "ones" })] })).toMatchObject({ code: "act_not_allowed", allowed: ["check_in"] });
    c.maya({ act: "check_in", parts: [t("Take your time. Do you want a hint?")] });
    c.child("Is it 15?");
    expect(c.refused({ act: "guide", step: "ones", level: 2, parts: [ln("step.operation", { step: "ones" })], reading: { answers: [{ value: num(15), step: "ones", verdict: "wrong" }] } }))
      .toMatchObject({ code: "hint_too_high" });
    c.maya({ act: "guide", step: "ones", level: 1, parts: [ln("check.not_yet", { step: "ones" }), ln("step.point", { step: "ones" })], reading: { answers: [{ value: num(15), step: "ones", verdict: "wrong" }] } });
  });

  it("closes for no response after a check-in and the same wait again", () => {
    const c = opened();
    c.tick(15);
    c.maya({ act: "check_in", parts: [t("Are you still there?")] });
    c.tick(44);
    expect(c.next).toEqual({ expect: "child", acts: [] });
    c.tick(45);
    expect(c.next).toEqual({ expect: "maya", acts: ["close"] });
    const { effects } = c.maya({ act: "close", parts: [t("Let's stop for now. Bye!")] });
    expect(ended(effects)).toMatchObject({ outcome: { reason: "no_response", seconds: 45 } });
  });
});

const SAFE: Draft = { act: "safety", parts: [t("Thank you for telling me. You do not have to explain more. Please tell a grown-up you trust.")] };

describe("SAFETY comes before every other event", () => {
  /** Calls in every other situation, each waiting for Maya, to receive a safety disclosure. */
  const situations: [string, () => ReturnType<typeof call>][] = [
    ["the opening", () => { const c = call(); c.start(); return c; }],
    ["a stop request", () => { const c = opened(); c.child("I want to stop. Someone at home hits me."); return c; }],
    ["an unclear number", () => { const c = opened(); c.child("fifteen", { uncertain: true }); return c; }],
    ["a right answer", () => { const c = opened(); c.child("It's 66."); return c; }],
    ["an off-topic turn", () => { const c = opened(); c.child("Do you like my dog? He bites me when mom is mad."); return c; }],
    ["a writing pause", () => {
      const c = opened(); c.child("Wait, I'm writing."); c.maya({ act: "wait", parts: [], reading: { writing: true } }); c.child("Someone hurts me."); return c;
    }],
    ["the closing minute", () => { const c = opened(); c.tick(541); return c; }],
    ["a repair Maya owes", () => {
      const c = opened(); c.child("I got 56."); c.maya({ act: "guide", step: "ones", level: 0, parts: [ln("step.invite", { step: "ones" })] });
      c.send({ type: "maya_said", at: T0, text: "Seven plus nine is fifteen." }); return c;
    }],
    ["a content hold", () => { const c = opened(); c.send({ type: "content_problem", at: T0, detail: "the steps disagree" }); return c; }],
  ];

  it.each(situations)("in %s: only the safety response is allowed, and the flag is raised even by a refused proposal", (_name, make) => {
    const c = make();
    const before = c.session;
    const result = step(before, { type: "proposal", at: before.now!, proposal: v2({ act: "close", parts: [t("Bye!")], reading: { safety: "concern", stop: true } }) });
    expect(result.refusal).toMatchObject({ code: "safety_first", allowed: ["safety"] });
    expect(result.effects).toContainEqual({ kind: "safety_flag", severity: "concern", at: before.now });
    expect(result.session.safety.flagged).toBe(true);
    expect(result.session.state).toBe("SAFETY");
    const { effects } = step(result.session, { type: "proposal", at: before.now!, proposal: v2(SAFE) });
    expect(said(effects)).toEqual([SAFETY_GUIDANCE.concern]);
  });

  it("does not return to math after the guidance, keeps the flag when the child takes it back, and closes as safety", () => {
    const c = opened();
    const { effects } = c.send({ type: "safety", at: T0, severity: "concern" });
    expect(effects).toEqual([{ kind: "cancel_output" }, { kind: "safety_flag", severity: "concern", at: T0 }]);
    c.maya(SAFE);
    expect(c.next).toEqual({ expect: "maya", acts: ["close"] });
    c.child("I was joking. Can we do my math? It's 66.");
    expect(c.refused({ act: "accept_answer", parts: [ln("answer.right")], reading: { answers: [right66] } })).toMatchObject({ code: "safety_first" });
    const end = ended(c.maya({ act: "close", parts: [t("Okay. Please still talk to a grown-up you trust. Bye for now.")] }).effects);
    expect(end).toMatchObject({ outcome: { reason: "safety", safetyFlag: true, safetySeverity: "concern" }, safetyMessage: SAFETY_GUIDANCE.concern });
  });

  it("tells a child in immediate danger to call 911, in the policy's words", () => {
    const c = opened();
    c.child("Someone is hurting me right now.");
    const { effects } = c.maya({ act: "safety", parts: [t("Please tell a grown-up you trust.")], reading: { safety: "immediate" } });
    expect(effects).toContainEqual({ kind: "safety_flag", severity: "immediate", at: T0 });
    expect(said(effects)).toEqual([SAFETY_GUIDANCE.immediate]);
    expect(SAFETY_GUIDANCE.immediate).toContain("911");
    expect(c.session.outcome).toBeNull();
  });

  it("gives pending safety guidance in code's words at the 10-minute end", () => {
    const c = opened();
    c.at(595);
    c.send({ type: "safety", at: T0 + 595_000, severity: "immediate" });
    const { effects } = c.tick(600);
    expect(said(effects)).toEqual([SAFETY_GUIDANCE.immediate]);
    expect(ended(effects)).toMatchObject({ outcome: { reason: "safety", seconds: 600 }, safetyMessage: SAFETY_GUIDANCE.immediate });
  });

  it("raises the flag from a safety event that arrives after the deadline, before ending", () => {
    const c = opened();
    const { effects } = c.send({ type: "safety", at: T0 + 601_000, severity: "concern" });
    expect(effects.map((e) => e.kind)).toEqual(["cancel_output", "safety_flag", "cancel_output", "say", "end"]);
    expect(said(effects)).toEqual([SAFETY_GUIDANCE.concern]);
  });
});

describe("a stop request", () => {
  it("allows only a kind close, with no more questions, and records child_stopped", () => {
    const c = afterExample();
    c.child("I want to stop.");
    expect(step(c.session, { type: "proposal", at: T0, proposal: v2({ act: "guide", step: "ones", level: 0, parts: [t("Shall we try again?")], reading: { stop: true } }) }).refusal)
      .toMatchObject({ code: "stop_first", allowed: ["close"] });
    const { effects } = c.maya({ act: "close", parts: [t("That's okay. Bye for now!")], reading: { stop: true } });
    expect(ended(effects)).toMatchObject({ outcome: { reason: "child_stopped", assistance: "worked_example", paperStatus: "unknown" } });
  });
});

describe("CONFIRM_HEARD", () => {
  it("confirms an unclear number before judging it, then returns to teaching", () => {
    const c = opened();
    c.child("I got fifteen", { uncertain: true, alternatives: ["I got fifty"] });
    expect(c.next).toEqual({ expect: "maya", acts: ["confirm"] });
    expect(c.refused({ act: "guide", step: "ones", level: 0, parts: [ln("step.invite", { step: "ones" })], reading: { answers: [{ value: num(15), step: "result", verdict: "wrong" }] } }))
      .toMatchObject({ code: "confirm_first" });
    c.maya({ act: "confirm", parts: [ln("confirm.which", { heard: "15", other: "50" })] });
    expect(c.session.state).toBe("CONFIRM_HEARD");
    c.child("No, I said sixty-six.");
    c.maya({ act: "accept_answer", parts: [{ warm: "thinkaloud" }, ln("answer.right")], reading: { answers: [right66], correctsHearing: true } });
    expect(c.session.state).toBe("CHECK");
    c.child("I carried the ten.");
    c.maya({ act: "ask_write", parts: [ln("write.answer")], understanding: "evidence_observed" });
    c.child("Done.");
    c.maya({ act: "close", parts: [t("Bye!")], reading: { paper: "written" } });
    expect(c.session.outcome).toMatchObject({ reason: "solved", mishearing: { confirmations: 1, corrections: 1 } });
  });

  it("after two failed confirmations offers another way to answer, then closes as a technical issue", () => {
    const c = opened();
    c.child("fifteen", { uncertain: true });
    c.maya({ act: "confirm", parts: [ln("confirm.which", { heard: "15", other: "50" })] });
    c.child("fifteen", { uncertain: true });
    c.maya({ act: "confirm", parts: [t("Sorry, I did not catch that. Can you say it again slowly?")] });
    c.child("one five", { uncertain: true });
    expect(c.next).toEqual({ expect: "maya", acts: ["offer_other_input", "close"] });
    c.maya({ act: "offer_other_input", parts: [ln("input.other")] });
    c.child("mumble", { uncertain: true });
    expect(c.next).toEqual({ expect: "maya", acts: ["close"] });
    c.maya({ act: "close", parts: [t("I'm sorry I couldn't hear you well. Please ask a grown-up to help. Bye!")] });
    expect(c.session.outcome).toMatchObject({ reason: "technical_issue", mishearing: { confirmations: 2 } });
  });
});

describe("WAIT_WRITE", () => {
  it("waits quietly while the child writes, checks in once at 30 seconds, and resets on 'more time'", () => {
    const c = afterExample();
    c.child("Wait, I'm writing.");
    c.maya({ act: "wait", parts: [t("Take your time.")], reading: { writing: true } });
    expect(c.session.state).toBe("WAIT_WRITE");
    c.tick(20);
    expect(c.next).toEqual({ expect: "child", acts: [] });
    expect(c.refused({ act: "guide", step: "ones", level: 0, parts: [t("What did you get?")] })).toMatchObject({ code: "not_mayas_turn" });
    c.tick(30);
    expect(c.next).toEqual({ expect: "maya", acts: ["check_in"] });
    c.maya({ act: "check_in", parts: [t("Would you like more time?")] });
    c.child("Yes, more time.");
    c.maya({ act: "wait", parts: [], reading: { writing: true } });
    c.tick(55);
    expect(c.next).toEqual({ expect: "child", acts: [] });
    c.child("Done! 66.");
    c.maya({ act: "accept_answer", parts: [{ warm: "thinkaloud" }, ln("answer.right")], reading: { answers: [right66] } });
    expect(c.session.state).toBe("CHECK");
  });

  it("follows the board: writing starts and ends a pause, and the step is kept", () => {
    const c = afterExample();
    c.send({ type: "writing", at: T0, status: "started" });
    expect(c.session.state).toBe("WAIT_WRITE");
    c.send({ type: "writing", at: T0, status: "done" });
    expect(c.session.state).toBe("TRY_TARGET");
  });
});

describe("REDIRECT", () => {
  it("brings an off-topic child back and restores the step; offers to stop if they persist", () => {
    const c = afterExample();
    c.child("Do you like Minecraft?");
    expect(c.next.acts).toContain("accept_answer");
    expect(c.refused({ act: "guide", step: "ones", level: 0, parts: [ln("step.invite", { step: "ones" })], reading: { offTopic: true } })).toMatchObject({ allowed: ["redirect"] });
    c.maya({ act: "redirect", parts: [t("I can only help with this math question. Want to keep going?")], reading: { offTopic: true } });
    expect(c.session.state).toBe("REDIRECT");
    c.child("What about my dog?");
    expect(c.refused({ act: "guide", step: "ones", level: 0, parts: [t("Back to it.")], reading: { offTopic: true } })).toMatchObject({ allowed: ["redirect", "close"] });
    c.maya({ act: "redirect", parts: [{ warm: "smalltalk" }, ln("redirect.back")], reading: { offTopic: true } });
    c.child("Okay, I got 56.");
    c.maya({ act: "guide", step: "ones", level: 0, parts: [ln("step.invite", { step: "ones" })], reading: { answers: [{ value: num(56), step: "result", verdict: "wrong" }] } });
    expect(c.session.state).toBe("GUIDE_TARGET");
  });
});

describe("REPAIR_MAYA", () => {
  it("corrects a wrong number Maya said, then returns to the step", () => {
    const c = afterExample();
    const { effects } = c.send({ type: "maya_said", at: T0, text: "Seven plus nine is fifteen." });
    expect(effects).toEqual([{ kind: "cancel_output" }]);
    expect(c.session.state).toBe("REPAIR_MAYA");
    expect(c.next).toEqual({ expect: "maya", acts: ["repair"] });
    expect(c.refused({ act: "repair", parts: [t("Sorry, seven plus nine is fifteen."), ln("repair.sorry")] }))
      .toMatchObject({ code: "free_talk_in_math_turn" });
    c.maya({ act: "repair", parts: [ln("repair.sorry"), ln("step.invite", { step: "ones" })] });
    expect(c.session.state).toBe("TRY_TARGET");
  });

  /** A call where the child said 15 for the ones and Maya answered with a code-checked "not yet" and the H2 line. */
  function afterWrongStep() {
    const c = afterExample();
    c.child("Seven plus nine is 15.");
    const { effects } = c.maya({
      act: "guide", step: "ones", level: 0,
      parts: [{ warm: "pacing" }, ln("check.not_yet", { step: "ones" })],
      reading: { answers: [{ value: num(15), step: "ones", verdict: "wrong" }] },
    });
    return { c, approved: said(effects)[0] };
  }

  it("does not repair the exact approved speech of Maya's turn", () => {
    const { c, approved } = afterWrongStep();
    c.send({ type: "maya_said", at: T0, text: approved });
    expect(c.session.state).toBe("GUIDE_TARGET");
  });

  it("repairs unchecked approval with no math in it: \"Yes!\" after a wrong answer (R374-2)", () => {
    for (const text of ["Yes!", "You got it!", "Yes! Let's take it slowly."]) {
      const { c } = afterWrongStep();
      const { effects } = c.send({ type: "maya_said", at: T0, text });
      expect(effects).toEqual([{ kind: "cancel_output" }]);
      expect(c.session.state).toBe("REPAIR_MAYA");
    }
  });

  it("repairs approved words with anything added, dropped or from an earlier turn", () => {
    const { c, approved } = afterWrongStep();
    const earlier = c.session.turns.filter((x) => x.speaker === "maya").at(-2)!.text;
    for (const text of [`${approved} Yes!`, approved.split(" ").slice(1).join(" "), earlier]) {
      const { c: d } = afterWrongStep();
      d.send({ type: "maya_said", at: T0, text });
      expect(d.session.state, text).toBe("REPAIR_MAYA");
    }
  });

  it("does not repair the same words with numbers spoken, case, punctuation or contractions changed", () => {
    const c = afterExample();
    c.child("Show me.");
    const { effects } = c.maya({ act: "guide", step: "ones", level: 3, parts: [ln("step.show", { step: "ones" })], reading: { help: "show" } });
    const approved = said(effects)[0];
    expect(approved).toMatch(/Add the ones: 7 \+ 9 = 16\. Write 6 and carry 1 ten\.$/);
    const spoken = approved
      .replace("7 + 9 = 16", "seven plus nine equals sixteen").replace("Write 6", "write six").replace("carry 1 ten", "carry one ten")
      .replace("Let's", "let us").replace(/:/g, ",");
    c.send({ type: "maya_said", at: T0, text: spoken.toUpperCase() });
    expect(c.session.state).toBe("GUIDE_TARGET");
    // A different number is still a different line.
    c.send({ type: "maya_said", at: T0, text: spoken.replace("sixteen", "fifteen") });
    expect(c.session.state).toBe("REPAIR_MAYA");
  });

  it("repairs a true equation Maya said that was not her turn's words", () => {
    const c = afterExample();
    c.send({ type: "maya_said", at: T0, text: "So 18 + 5 is 23." });
    expect(c.session.state).toBe("REPAIR_MAYA");
  });
});

describe("TIME_CLOSE and the end", () => {
  it("starts closing at 9 minutes and ends the call at 10", () => {
    const c = afterExample();
    c.child("Hmm, 56?");
    c.maya({ act: "guide", step: "ones", level: 0, parts: [ln("step.invite", { step: "ones" })], reading: { answers: [{ value: num(56), step: "result", verdict: "wrong" }] } });
    c.tick(539);
    expect(c.session.state).not.toBe("TIME_CLOSE");
    c.tick(540);
    expect(c.session.state).toBe("TIME_CLOSE");
    expect(c.next).toEqual({ expect: "maya", acts: ["give_answer", "ask_write", "close"] });
    expect(c.refused({ act: "guide", step: "ones", level: 1, parts: [ln("step.point", { step: "ones" })] })).toMatchObject({ code: "act_not_allowed" });
    c.maya({ act: "ask_write", parts: [t("We are almost out of time. Keep working on it on your paper.")] });
    c.tick(599);
    expect(c.session.outcome).toBeNull();
    const { effects } = c.tick(600);
    expect(effects.map((e) => e.kind)).toEqual(["cancel_output", "end"]);
    expect(ended(effects)).toMatchObject({ outcome: { reason: "time_limit", seconds: 600 }, safetyMessage: null });
    expect(step(c.session, { type: "proposal", at: T0 + 600_000, proposal: v2({ act: "close", parts: [t("Bye!")] }) }).refusal).toMatchObject({ code: "ended" });
  });

  it("may give the answer at the time close without climbing the ladder, and records it", () => {
    const c = afterExample();
    c.tick(540);
    c.maya({ act: "give_answer", parts: [{ warm: "empathy" }] });
    c.child("Okay, I wrote it.");
    c.maya({ act: "close", parts: [t("Bye for now!")], reading: { paper: "written" } });
    expect(c.session.outcome).toMatchObject({ reason: "solved", assistance: "answer_given", paperStatus: "child_confirmed" });
  });

  it("accepts a right answer said in the closing minute", () => {
    const c = afterExample();
    c.at(545);
    c.child("It's 66!");
    c.maya({ act: "accept_answer", parts: [ln("answer.right")], reading: { answers: [right66] } });
    c.child("Okay.");
    expect(c.next).toEqual({ expect: "maya", acts: ["ask_write", "close", "confirm"] });
    c.maya({ act: "close", parts: [t("Great work. Bye!")] });
    expect(c.session.outcome).toMatchObject({ reason: "solved", assistance: "worked_example" });
  });
});

describe("other events", () => {
  it("stops Maya talking on a partial child turn and judges nothing", () => {
    const c = afterExample();
    const before = c.session;
    const { effects, session } = step(before, { type: "child_turn", at: T0, text: "sixty", final: false });
    expect(effects).toEqual([{ kind: "cancel_output" }]);
    expect(session.turns).toEqual(before.turns);
    expect(nextActs(session)).toEqual({ expect: "child", acts: [] });
  });

  it("holds the content when the math turns out untrustworthy mid-call", () => {
    const c = afterExample();
    c.send({ type: "content_problem", at: T0, detail: "the answer and the steps disagree" });
    expect(c.next).toEqual({ expect: "maya", acts: ["close"] });
    c.maya({ act: "close", parts: [t("I can't check this question right now. Let's stop here.")] });
    expect(c.session.outcome).toMatchObject({ reason: "content_issue" });
  });

  it("ends on a technical failure", () => {
    const c = afterExample();
    const { effects } = c.send({ type: "technical", at: T0 + 30_000, detail: "the connection dropped" });
    expect(ended(effects)).toMatchObject({ outcome: { reason: "technical_issue", seconds: 30 } });
  });

  it("refuses events out of order", () => {
    const c = call();
    expect(step(c.session, { type: "tick", at: T0 }).refusal).toMatchObject({ code: "invalid_event" });
    c.start();
    expect(step(c.session, { type: "tick", at: T0 - 1 }).refusal).toMatchObject({ code: "invalid_event" });
    expect(step(c.session, { type: "start", at: T0 }).refusal).toMatchObject({ code: "invalid_event" });
  });

  it("keeps every input and output plain data", () => {
    const c = afterExample();
    expect(JSON.parse(JSON.stringify(c.session))).toEqual(c.session);
  });
});

describe("board commands in a proposal", () => {
  const columns = (a: number, b: number) => ({ op: "columns", id: "sum", operation: "add", operands: [{ id: "top", value: String(a) }, { id: "bottom", value: String(b) }], place: { region: "main" } });

  it("sends the board batch of an allowed act, with a call-scoped transaction id", () => {
    const c = opened();
    c.child("I can't start.");
    const { effects } = c.maya({ act: "example_step", step: "ones", parts: [ln("example.intro")], board: [columns(18, 5)] });
    expect(effects).toContainEqual({ kind: "board", batch: { transactionId: "call-1-b1", commands: [columns(18, 5)] } });
  });

  it("refuses the child's question on the board during the easier example, and the example after it", () => {
    const c = opened();
    c.child("I can't start.");
    expect(c.refused({ act: "example_step", step: "ones", parts: [ln("example.intro")], board: [columns(27, 39)] })).toMatchObject({ code: "board_wrong_problem" });
    const d = afterExample();
    d.child("I got 56.");
    expect(d.refused({ act: "guide", step: "ones", level: 0, parts: [ln("step.invite", { step: "ones" })], reading: { answers: [{ value: num(56), step: "result", verdict: "wrong" }] }, board: [columns(18, 5)] }))
      .toMatchObject({ code: "board_wrong_problem" });
  });

  it("refuses the answer written on the board before Maya may say it", () => {
    const c = opened();
    c.child("I don't know.");
    expect(c.refused({ act: "guide", step: "ones", level: 0, parts: [ln("step.invite", { step: "ones" })], board: [{ op: "write", id: "w", text: "66", place: { region: "main" } }] }))
      .toMatchObject({ code: "reveals_answer" });
  });

  it("refuses drawing during safety, confirmation or a close, and a board that is not a list of commands", () => {
    const c = opened();
    c.child("fifteen", { uncertain: true });
    expect(c.refused({ act: "confirm", parts: [ln("confirm.which", { heard: "15", other: "50" })], board: [{ op: "write", id: "w", text: "15 or 50?", place: { region: "main" } }] }))
      .toMatchObject({ code: "board_not_allowed" });
    expect(c.refused({ act: "confirm", parts: [ln("confirm.heard", { heard: "15" })], board: [] })).toMatchObject({ code: "invalid_proposal" });
    expect(c.refused({ act: "confirm", parts: [ln("confirm.heard", { heard: "15" })], board: ["write 15"] })).toMatchObject({ code: "invalid_proposal" });
  });
});

describe("learning events", () => {
  it("records a wrong attempt the child left as blank, at the step where they stopped", () => {
    const c = opened();
    c.child("It's 56.");
    c.maya({ act: "guide", step: "ones", level: 1, parts: [ln("step.point", { step: "ones" })], reading: { answers: [{ value: num(56), step: "result", verdict: "wrong" }] } });
    c.child("I want to stop now.");
    c.maya({ act: "close", parts: [t("Okay, bye for now!")], reading: { stop: true } });
    expect(learningEvent(c.session, FAMILY)).toEqual({
      key: "call:call-1", parentId: "p", childId: "c", source: "call", question: PACKAGE.ref, skill: PACKAGE.skill,
      result: "blank", stuckStep: "ones", mistake: null, hints: 1, timeMs: 0, occurredAt: new Date(T0).toISOString(), evidence: { kind: "call", id: "call-1" },
    });
  });

  it("has none before the end", () => {
    expect(learningEvent(opened().session, FAMILY)).toBeNull();
  });
});

describe("valuesIn", () => {
  it.each([
    ["I got 66", [66]],
    ["sixty-six", [66]],
    ["sixty six", [66]],
    ["sixty... no, sixty-six", [60, 66]],
    ["fifteen or fifty", [15, 50]],
    ["seven plus nine is sixteen", [7, 9, 16]],
    ["two hundred and five", [205]],
    ["one thousand two hundred", [1200]],
    ["1,234 and 7", [1234, 7]],
    ["0.85", [0.85]],
    ["point eight five", [0.85]],
    ["zero point six", [0.6]],
    ["no numbers here", []],
  ])("reads %s", (text, numbers) => {
    expect(valuesIn(text)).toEqual(numbers.map(num));
  });

  it("reads fractions written or said", () => {
    expect(valuesIn("3/4")).toEqual([{ type: "fraction", numerator: 3, denominator: 4 }]);
    expect(valuesIn("fourteen over sixteen")).toEqual([{ type: "fraction", numerator: 14, denominator: 16 }]);
  });
});

describe("review follow-up", () => {
  it("judges the number the child kept, not one they took back", () => {
    const c = opened();
    c.child("sixty-six... no wait, sixty");
    expect(c.refused({ act: "accept_answer", parts: [ln("answer.right")], reading: { answers: [right66] } })).toMatchObject({ code: "answer_not_heard" });
    c.maya({ act: "guide", step: "ones", level: 0, parts: [ln("step.invite", { step: "ones" })], reading: { answers: [{ value: num(60), step: "result", verdict: "wrong" }] } });
  });

  it("does not pick the key's number out of a choice the child offers", () => {
    const c = opened();
    c.child("Is it 66 or 56?");
    expect(c.refused({ act: "accept_answer", parts: [ln("answer.right")], reading: { answers: [right66] } })).toMatchObject({ code: "answer_not_committed" });
  });

  it.each(["-66", "minus 66", "negative sixty-six"])("does not hear %s as 66", (text) => {
    const c = opened();
    c.child(text);
    expect(c.refused({ act: "accept_answer", parts: [t("Yes!")], reading: { answers: [right66] } })).toMatchObject({ code: "answer_not_heard" });
  });

  it("forgets a no-response close once the child speaks again", () => {
    const c = opened();
    c.tick(15);
    c.maya({ act: "check_in", parts: [t("Are you still there?")] });
    c.tick(45);
    c.child("Sorry, I'm here. I want to stop.");
    c.maya({ act: "close", parts: [t("Okay, bye for now!")], reading: { stop: true } });
    expect(c.session.outcome).toMatchObject({ reason: "child_stopped" });
  });

  it("repairs a wrong number in the closing minute, then returns to closing", () => {
    const c = afterExample();
    c.tick(541);
    c.send({ type: "maya_said", at: T0 + 541_000, text: "Seven plus nine is fifteen." });
    c.tick(545);
    expect(c.session.state).toBe("REPAIR_MAYA");
    c.maya({ act: "repair", parts: [ln("repair.sorry")] });
    expect(c.session.state).toBe("TIME_CLOSE");
  });

  it("says the given answer and asks for it on paper in code's words", () => {
    const c = afterExample();
    c.tick(540);
    const gives = TEMPLATES["answer.give"].map((x) => x.replaceAll("{answer}", "66"));
    expect(gives).toContain(said(c.maya({ act: "give_answer", parts: [] }).effects)[0]);
  });

  it("does not count an answer Maya gave as the child's right answer", () => {
    const c = opened();
    c.child("Just show me how.");
    c.maya({ act: "guide", step: "ones", level: 3, parts: [ln("step.show", { step: "ones" })], reading: { help: "show" } });
    c.child("I really don't get it.");
    c.maya({ act: "give_answer", parts: [ln("step.show", { step: "ones" })], reading: { help: "more" } });
    c.child("Okay.");
    c.maya({ act: "close", parts: [t("Bye for now!")] });
    expect(c.session.outcome).toMatchObject({ reason: "solved", assistance: "answer_given", highestHint: 4 });
    expect(learningEvent(c.session, FAMILY)).toMatchObject({ result: "blank", hints: 2 });
  });

  it("refuses filling the answer row's last digit before the answer may be given, but not the ones digit", () => {
    const c = opened();
    c.child("I don't know.");
    const sum = { op: "columns", id: "sum", operation: "add", operands: [{ id: "top", value: "27" }, { id: "bottom", value: "39" }], place: { region: "main" } };
    const put = (column: string) => ({ op: "put", target: { objectId: "sum", part: "cell", rowId: "answer", column }, value: "6" });
    expect(c.refused({ act: "guide", step: "ones", level: 0, parts: [ln("step.invite", { step: "ones" })], board: [sum, put("tens")] })).toMatchObject({ code: "reveals_answer" });
    // The ones digit is the step's own result: it goes on the board with the line that shows the step.
    expect(c.refused({ act: "guide", step: "ones", level: 0, parts: [ln("step.invite", { step: "ones" })], board: [sum, put("ones")] })).toMatchObject({ code: "wrong_math" });
    c.child("Show me.");
    c.maya({ act: "guide", step: "ones", level: 3, parts: [ln("step.show", { step: "ones" })], board: [sum, put("ones")], reading: { help: "show" } });
  });
});

describe("valuesIn signs", () => {
  it.each([
    ["-172", [-172]],
    ["minus 172", [-172]],
    ["negative sixty six", [-66]],
    ["300 minus 128", [300, 128]],
    ["300-128", [300, 128]],
    ["three hundred minus one hundred", [300, 100]],
  ])("reads %s", (text, numbers) => {
    expect(valuesIn(text)).toEqual(numbers.map(num));
  });
});
