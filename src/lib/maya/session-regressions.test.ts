// Consolidated behavioral regressions for Maya's session core.

import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { applyBatch, createScene } from "@/lib/board";
import { learningEvents } from "@/lib/learning-events";
import { memoryLearningEventStore } from "@/lib/learning-events-memory";
import { createSession, fallbacks, learningEvent, type LineChoice, type LineId, nextActs, PHRASES, type Proposal, readAnswer, SAFETY_GUIDANCE, type Session, type SessionEvent, type Slots, step, talkMath, TIME_LIMITS, valuesIn } from "@/lib/maya";
import { FIXTURES } from "@/lib/maya-gate/fixtures";
import { type Behaviour, judge, memoryTraceStore, type Read, runBehaviour, scenarioModel, type Step } from "@/lib/maya-gate/gate";
import { fakeMayaModel } from "@/lib/maya-model-fake";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { createTextSession } from "@/lib/maya-text";
import { TEMPLATES } from "@/lib/maya/lines";
import { committedValue } from "@/lib/maya/session";
import { OK_TALK } from "@/lib/maya/talk-review";
import { type AnswerValue, checkQuestionPackage, type Operation, type QuestionPackage, workedSteps } from "@/lib/question-package";

vi.mock("server-only", () => ({}));

describe("session review regressions (set 1)", () => {
  // Reproductions of the independent review of PR #350 (findings F1 to F9), each through the public interface.

  const num = (value: number) => ({ type: "number" as const, value });

  const WORKBOOK = "11111111-1111-4111-8111-111111111111";

  function packageOf(operation: Operation, answer: AnswerValue, easier: Operation, easierAnswer: AnswerValue, standard: string, skills: string[] = []): QuestionPackage {
    const pkg: QuestionPackage = {
      id: "wbq-review",
      ref: { source: "workbook", workbookId: WORKBOOK, page: 23, question: 4 },
      templateId: null,
      text: "Work it out.",
      answer: { value: answer, accepted: [], unit: null },
      operation,
      steps: workedSteps(operation),
      skill: { standard, skills },
      level: 9,
      difficulty: 2,
      wrongAnswers: [{ value: num(56), cause: "O3", description: "Forgets to carry when adding", step: operation.kind === "add" ? "tens" : null }],
      easierExample: { text: "An easier one.", operation: easier, answer: easierAnswer, steps: workedSteps(easier) },
    };
    // Every fixture is a package the contract checks, so a hold below is the controller's own choice.
    expect(checkQuestionPackage(pkg)).toMatchObject({ ok: true });
    return pkg;
  }

  const PKG = packageOf({ kind: "add", operands: [27, 39] }, num(66), { kind: "add", operands: [18, 5] }, num(23), "2.4", ["2.4-add-within-100"]);

  /** A proposal without its version: `propose` adds version 2. */
  type Draft = Omit<Proposal, "version">;

  const t = (talk: string) => ({ talk });

  const ln = (line: LineId, slots: Slots = {}) => ({ line, slots });

  const v2 = (p: unknown) => (typeof p === "object" && p !== null && !Array.isArray(p) && !("version" in p) ? { version: 2, ...p } : p);

  const OPEN: Draft = { act: "open", parts: [ln("open.hello"), t("Our team may review this call. What did you try?")] };

  const right66 = { value: num(66), step: "result", verdict: "right" as const };

  const wrong56 = { value: num(56), step: "result", verdict: "wrong" as const };

  const guide = (extra: Partial<Draft> = {}): Draft => ({ act: "guide", parts: [ln("step.invite", { step: "ones" })], step: "ones", level: 0, ...extra });

  /** A call past its opening at time 0 (ms). `send` returns the result without asserting. */
  function call(pkg: unknown = PKG, modelBoard = false) {
    let s: Session = createSession({ callId: "review-call", package: pkg, modelBoard });
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
      propose: (p: unknown, at = s.now ?? 0) => send({ type: "proposal", at, proposal: v2(p) }),
      child: (text: string, extra: object = {}, at = s.now ?? 0) => send({ type: "child_turn", at, text, ...extra }),
    };
  }

  describe("F2: a refused proposal keeps the child's priority input and the clock", () => {
    it("keeps a safety escalation", () => {
      const c = call();
      c.send({ type: "safety", severity: "concern", at: 1 });
      c.propose({ act: "safety", parts: [] }, 1);
      c.child("It is happening now", {}, 2);
      const r = c.propose(guide({ reading: { safety: "immediate" } }), 2);
      expect(r.refusal).toMatchObject({ code: "safety_first" });
      expect(r.session.safety).toMatchObject({ severity: "immediate", guided: false });
      expect(r.effects).toContainEqual({ kind: "safety_flag", severity: "immediate", at: 2 });
      expect(nextActs(r.session).acts).toEqual(["safety"]);
    });

    it("keeps the nine-minute close and the clock", () => {
      const c = call();
      c.child("56");
      const r = c.propose(guide(), 540_000);
      expect(r.refusal).not.toBeNull();
      expect(r.session.state).toBe("TIME_CLOSE");
      expect(c.propose(guide(), 1000).refusal).toMatchObject({ code: "invalid_event" });
    });

    it("keeps a stop request when a retry leaves it out", () => {
      const c = call();
      c.child("Stop.");
      expect(c.propose(guide({ reading: { stop: true } })).refusal).toMatchObject({ code: "stop_first" });
      expect(c.propose(guide()).refusal).toMatchObject({ code: "stop_first" });
    });
  });

  describe("F3: safety guidance is the policy message", () => {
    it("speaks the policy guidance, not the model's words", () => {
      const c = call();
      c.send({ type: "safety", severity: "concern", at: 1 });
      const r = c.propose({ act: "safety", parts: [t("Okay.")] }, 1);
      expect(r.effects.filter((e) => e.kind === "say")).toEqual([{ kind: "say", act: "safety", text: SAFETY_GUIDANCE.concern }]);
    });

    it("gives pending guidance before a technical end and keeps the help message", () => {
      const c = call();
      c.send({ type: "safety", severity: "immediate", at: 1 });
      const r = c.send({ type: "technical", detail: "transport failed", at: 2 });
      expect(r.effects).toContainEqual({ kind: "say", act: "safety", text: SAFETY_GUIDANCE.immediate });
      expect(r.effects.at(-1)).toMatchObject({ kind: "end", safetyMessage: SAFETY_GUIDANCE.immediate });
    });
  });

  describe("F4: interrupts come before scoring", () => {
    it("never scores an answer in a confirmation", () => {
      const c = call();
      c.child("56", { uncertain: true });
      c.propose({ act: "confirm", parts: [t("Did you say fifty-six?")], reading: { answers: [wrong56] } });
      c.child("I want to stop.");
      c.propose({ act: "close", parts: [t("Bye.")], reading: { stop: true } });
      expect(learningEvent(c.s, { parentId: "p", childId: "c" })).toMatchObject({ result: "blank", mistake: null, hints: 0 });
    });

    it("does not let a bad verdict block a safety response", () => {
      const c = call();
      c.child("56", { uncertain: true });
      const r = c.propose({ act: "safety", parts: [], reading: { safety: "concern", answers: [{ ...wrong56, verdict: "right" }] } });
      expect(r.refusal).toBeNull();
    });

    it("does not let a bad verdict block a stop", () => {
      const c = call();
      c.child("56. Stop.");
      const r = c.propose({ act: "close", parts: [t("Bye.")], reading: { stop: true, answers: [{ ...wrong56, verdict: "right" }] } });
      expect(r.refusal).toBeNull();
      expect(r.session.outcome).toMatchObject({ reason: "child_stopped" });
    });
  });

  describe("F5: only the child's committed answer counts", () => {
    it.each(["−66", "66... no, I do not know", "You said sixty-six. I got fifty-six.", "negative sixty-six", "66 or 56?"])("does not accept 66 from %s", (text) => {
      const c = call();
      c.child(text);
      expect(c.propose({ act: "accept_answer", parts: [t("Yes.")], reading: { answers: [right66] } }).refusal).not.toBeNull();
    });

    it("offers a confirmation when the answer is not clear", () => {
      const c = call();
      c.child("66 or 56?");
      expect(c.propose({ act: "accept_answer", parts: [t("Yes.")], reading: { answers: [right66] } }).refusal?.allowed).toContain("confirm");
    });

    it("reads .85 and asks to confirm a number form code cannot read", () => {
      expect(valuesIn(".85")).toEqual([num(0.85)]);
      expect(valuesIn("negative point eight five")).toEqual([num(-0.85)]);
      const c = call();
      c.child("three quarters");
      expect(nextActs(c.s).acts).toEqual(["confirm"]);
    });
  });

  // Raw board commands are read only with the modelBoard flag (R374-6-1, D-197).
  describe("F6: board objects keep their role (modelBoard)", () => {
    const columns = (id: string, a: number, b: number) => ({ op: "columns", id, operation: "add", operands: [{ id: "top", value: String(a) }, { id: "bottom", value: String(b) }], place: { region: "main" } });
    const put = (objectId: string, column: string) => ({ op: "put", target: { objectId, part: "cell", rowId: "answer", column }, value: "6" });

    it("refuses an example step that draws the child's question", () => {
      const c = call(PKG, true);
      c.child("I can't start.");
      expect(c.propose({ act: "example_step", step: "ones", parts: [ln("example.intro")], reading: { start: "no_start" }, board: [columns("target", 27, 39), put("target", "tens")] }).refusal)
        .toMatchObject({ code: "board_wrong_problem" });
    });

    it("refuses an example step that writes on the question's board", () => {
      const c = call(PKG, true);
      let scene = createScene();
      c.child("What is the question?");
      const a = c.propose({ act: "clarify", parts: [ln("question.problem")], board: [columns("target", 27, 39)] });
      for (const e of a.effects) if (e.kind === "board") { const b = applyBatch(scene, e.batch); if (b.ok) scene = b.scene; }
      c.child("I cannot start. Show an example.");
      const r = c.propose({ act: "example_step", step: "ones", parts: [ln("example.intro")], reading: { start: "no_start" }, board: ["ones", "tens"].map((col) => put("target", col)) });
      expect(r.refusal).toMatchObject({ code: "board_wrong_problem" });
    });

    it("lets Maya read out a question whose answer is one of its numbers", () => {
      const zero = packageOf({ kind: "add", operands: [66, 0] }, num(66), { kind: "add", operands: [1, 0] }, num(1), "2.4", ["2.4-add-within-100"]);
      let s = createSession({ callId: "zero", package: zero });
      s = step(s, { type: "start", at: 0 }).session;
      expect(step(s, { type: "proposal", at: 0, proposal: v2({ act: "open", parts: [ln("open.hello"), ln("question.problem"), ln("assess.ask")] }) }).refusal).toBeNull();
    });
  });

  describe("F7: the expanded question contract", () => {
    it("teaches a long multiplication", () => {
      const c = call(packageOf({ kind: "multiply", operands: [47, 23] }, num(1081), { kind: "multiply", operands: [47, 3] }, num(141), "5.6"));
      c.child("7 times 3 is 21, so I got 1081.");
      expect(c.propose({ act: "accept_answer", parts: [t("Yes, how did you get it?")], reading: { answers: [{ value: num(21), step: "r1-ones", verdict: "right" }, { value: num(1081), step: "result", verdict: "right" }] } }).refusal).toBeNull();
    });

    it("hears a division answer with a remainder", () => {
      const c = call(packageOf({ kind: "divide", operands: [157, 6] }, { type: "remainder", quotient: 26, remainder: 1 }, { kind: "divide", operands: [57, 6] }, { type: "remainder", quotient: 9, remainder: 3 }, "5.6"));
      c.child("26 remainder 1");
      expect(c.propose({ act: "accept_answer", parts: [t("Yes. How did you do it?")], reading: { answers: [{ value: { type: "remainder", quotient: 26, remainder: 1 }, step: "result", verdict: "right" }] } }).refusal).toBeNull();
    });

    const frac = (n: number, d: number) => ({ type: "fraction" as const, numerator: n, denominator: d });
    const stateOf = (pkg: unknown) => step(createSession({ callId: "f", package: pkg }), { type: "start", at: 0 }).session;

    it("holds a fraction question it cannot teach yet: multiplying, or adding a mixed number (#407)", () => {
      expect(stateOf(packageOf({ kind: "fraction-multiply", operands: [frac(2, 3), frac(3, 4)] }, frac(1, 2), { kind: "fraction-multiply", operands: [frac(1, 2), frac(1, 3)] }, frac(1, 6), "6.5")).outcome?.reason).toBe("content_issue");
      const mixed = { type: "mixed" as const, whole: 1, numerator: 1, denominator: 2 };
      const held = stateOf(packageOf({ kind: "fraction-add", operands: [mixed, frac(1, 4)] }, { type: "mixed", whole: 1, numerator: 3, denominator: 4 }, { kind: "fraction-add", operands: [frac(1, 5), frac(2, 5)] }, frac(3, 5), "6.5"));
      expect(held.outcome?.reason).toBe("content_issue");
      expect(held.contentProblem).toContain("to-improper");
    });

    it("teaches adding fractions with unlike denominators (#407)", () => {
      expect(stateOf(packageOf({ kind: "fraction-add", operands: [frac(2, 3), frac(3, 4)] }, { type: "mixed", whole: 1, numerator: 5, denominator: 12 }, { kind: "fraction-add", operands: [frac(1, 5), frac(2, 5)] }, frac(3, 5), "6.5")).state).toBe("OPEN");
    });
  });

  describe("F8: the learning event follows the learning record's contract", () => {
    const parentId = "22222222-2222-4222-8222-222222222222";
    const childId = "33333333-3333-4333-8333-333333333333";
    const store = () => learningEvents(memoryLearningEventStore({ children: [{ id: childId, parentId }] }));

    it("records a wrong attempt the child left as blank, and it is stored", async () => {
      const c = call();
      c.child("56");
      c.propose(guide({ parts: [ln("check.not_yet", { step: "result" }), ln("step.invite", { step: "ones" })], reading: { answers: [wrong56] } }));
      c.child("Stop");
      c.propose({ act: "close", parts: [t("Bye.")], reading: { stop: true } });
      const event = learningEvent(c.s, { parentId, childId })!;
      expect(event).toMatchObject({ result: "blank", mistake: null, stuckStep: "ones", source: "call", key: "call:review-call", evidence: { kind: "call", id: "review-call" } });
      expect(await store().append(event)).toMatchObject({ ok: true });
    });

    it("stores a stopped call after a shown-step miss", async () => {
      const c = call();
      c.child("show me");
      c.propose(guide({ level: 3, parts: [ln("step.show", { step: "ones" })], reading: { help: "show" } }));
      // A miss after H3 gives the answer (help alone leads to the easier example, #735).
      c.child("15");
      c.propose({ act: "close", parts: [ln("close.stuck"), ln("close.together")], reading: { answers: [{ value: { type: "number", value: 15 }, step: "ones", verdict: "wrong" }] } });
      const event = learningEvent(c.s, { parentId, childId })!;
      expect(event).toMatchObject({ result: "blank", stuckStep: "ones" });
      expect(await store().append(event)).toMatchObject({ ok: true });
    });

    it("stores a corrected wrong answer as right, with no mistake", async () => {
      const c = call();
      c.child("56");
      c.propose(guide({ parts: [ln("check.not_yet", { step: "result" }), ln("step.invite", { step: "ones" })], reading: { answers: [wrong56] } }));
      c.child("66");
      c.propose({ act: "accept_answer", parts: [t("Yes. How did you do it?")], reading: { answers: [right66] } });
      c.child("I carried");
      c.propose({ act: "ask_write", parts: [ln("write.answer")], understanding: "evidence_observed" });
      c.child("done");
      c.propose({ act: "close", parts: [t("Bye.")] });
      const event = learningEvent(c.s, { parentId, childId })!;
      expect(event).toMatchObject({ result: "right", mistake: null, stuckStep: null });
      expect(await store().append(event)).toMatchObject({ ok: true });
    });
  });

  describe("F9: a child who cannot start gets the easier example first", () => {
    it("refuses guided target work before the example and a retry", () => {
      const c = call();
      c.child("I do not know how to start.");
      expect(c.propose(guide({ level: 2, reading: { start: "no_start" } })).refusal).toMatchObject({ code: "act_not_allowed" });
      expect(c.propose({ act: "try_target", parts: [t("Try your question.")] }).refusal).toMatchObject({ code: "act_not_allowed" });
    });
  });
});

describe("session review regressions (set 2)", () => {
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
      expect(c.propose({ act: "example_step", step: "ones", parts: [ln("example.intro"), ln("example.step", { step: "ones" })] }).refusal).toBeNull();
    });
  });

  describe("N1: a checked wrong final answer after a right one ends the solved status", () => {
    it("does not end as solved after the child takes back a right answer", () => {
      const c = call();
      c.child("66");
      c.propose({ act: "accept_answer", parts: [t("How did you get it?")], reading: { answers: [right66] } });
      c.child("Actually I got 56.");
      expect(c.propose(guide({ parts: [ln("check.not_yet", { step: "result" }), ln("step.invite", { step: "ones" })], reading: { answers: [wrong56] } })).refusal).toBeNull();
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
      c.propose(guide({ parts: [ln("check.not_yet", { step: "result" }), ln("step.invite", { step: "ones" })], reading: { answers: [wrong56] } }));
      c.child("No, 66.");
      expect(c.propose({ act: "accept_answer", parts: [t("Yes.")], reading: { answers: [right66] } }).refusal).toBeNull();
      c.child("Stop");
      expect(c.propose({ act: "close", parts: [t("Bye.")], reading: { stop: true } }).session.outcome).toMatchObject({ reason: "solved" });
    });
  });
});

describe("session review regressions (set 3)", () => {
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
      // A command the model built is refused before it is read (R374-6-1, D-197).
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
      expect(c.propose({ act: "example_step", step: "ones", parts: [ln("example.intro"), ln("example.step", { step: "ones" })], reading: { start: "no_start" } }).refusal).toBeNull();
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
});

describe("session step regressions (set 1)", () => {
  const n=(value:number)=>({type:"number" as const,value});

  const ln=(line:string,slots={})=>({line,slots});

  type NoAt=SessionEvent extends infer E?E extends SessionEvent?Omit<E,"at">:never:never;

  function call(){let s=createSession({callId:"review",package:FIXTURES.A,freeTalk:true});let at=1000;const send=(e:NoAt)=>{const r=step(s,{at,...e} as SessionEvent);s=r.session;return r;};send({type:"start"});const open=send({type:"proposal",proposal:{version:2,act:"open",parts:[ln("open.hello"),ln("question.problem")]}});expect(open.refusal).toBeNull();return {get s(){return s},child(text:string){at+=4000;return send({type:"child_turn",text})},p(p:Record<string,unknown>){return send({type:"proposal",proposal:{version:2,...p} as Proposal})}}}

  function tens(){const c=call();c.child("Seven plus nine is sixteen.");expect(c.p({act:"guide",step:"tens",level:0,parts:[ln("check.right_step",{step:"ones"}),ln("step.invite",{step:"tens"})],reading:{start:"has_work",answers:[{value:n(16),step:"ones",verdict:"right"}]}}).refusal).toBeNull();return c;}

  describe("independent review regressions",()=>{
   it("does not accept an earlier 66 over a later explicit answer of 56",()=>{const text="I got 66. I added 2 and 3 so my answer is 56.";const c=call();c.child(text);const r=c.p({act:"accept_answer",parts:[ln("answer.right")],reading:{answers:[{value:n(66),step:"result",verdict:"right"}]}});expect(r.refusal).not.toBeNull();expect(c.s.solved).toBeNull();});
   it("does not accept a yes followed by explicit uncertainty",()=>{const c=call();c.child("I think 66.");expect(c.p({act:"confirm",parts:[ln("confirm.heard",{heard:"66"})]}).refusal).toBeNull();c.child("Yes, I have no clue if 66 is right.");expect(readAnswer("Yes, I have no clue if 66 is right.").sure).toBe(false);const r=c.p({act:"accept_answer",parts:[ln("answer.right")],reading:{answers:[{value:n(66),step:"result",verdict:"right"}]}});expect(r.refusal).not.toBeNull();expect(c.s.solved).toBeNull();});
   it("does not treat a subtraction as an addition setup echo",()=>{const c=tens();c.child("So 2 plus 3 minus 1?");const r=c.p({act:"guide",step:"tens",level:2,parts:[ln("step.operation",{step:"tens"})]});expect(r.refusal?.code).toBe("hint_too_high");});
   it("does not unlock new help when the child says they are not stuck",()=>{const c=tens();c.child("I'm not stuck.");const r=c.p({act:"guide",step:"tens",level:1,parts:[ln("step.point",{step:"tens"})]});expect(r.refusal?.code).toBe("hint_too_high");});
  });

  describe("controls",()=>{
   it.each(["66","I got 66.","I'm sure it's 66."])("accepts plain correct answer %s",text=>{const c=call();c.child(text);expect(c.p({act:"accept_answer",parts:[ln("answer.right")],reading:{answers:[{value:n(66),step:"result",verdict:"right"}]}}).refusal).toBeNull();});
   it.each(["56","Not 66, so 56.","66 or 56?","I got 66. I added 2 and 3, so my answer is 56."])("does not accept 66 for %s",text=>{const c=call();c.child(text);expect(c.p({act:"accept_answer",parts:[ln("answer.right")],reading:{answers:[{value:n(66),step:"result",verdict:"right"}]}}).refusal).not.toBeNull();});
   it.each(["So 2 plus 3 plus 1?","Yes, I think 66 is right.","I don't know about the ten."])("safety blocks teaching after %s",text=>{const c=tens();c.child(text);const r=c.p({act:"guide",step:"tens",level:2,parts:[ln("step.operation",{step:"tens"})],reading:{safety:"immediate"}});expect(r.refusal?.code).toBe("safety_first");expect(r.effects.filter(e=>e.kind==="say")).toEqual([]);expect(c.s.safety.severity).toBe("immediate");});
   it("missing understanding stays uncertain",()=>{const c=call();c.child("66");expect(c.p({act:"accept_answer",parts:[ln("answer.right")],reading:{answers:[{value:n(66),step:"result",verdict:"right"}]}}).refusal).toBeNull();c.child("Okay.");expect(c.p({act:"ask_write",parts:[ln("write.answer")]}).refusal).toBeNull();expect(c.s.understanding).toBe("uncertain");});
  });
});

describe("session step regressions (set 2)", () => {
  const n=(value:number)=>({type:"number" as const,value});

  const ln=(line:string,slots={})=>({line,slots});

  type NoAt=SessionEvent extends infer E?E extends SessionEvent?Omit<E,"at">:never:never;

  function call(){let s=createSession({callId:"review",package:FIXTURES.A,freeTalk:true});let at=1000;const send=(e:NoAt)=>{const r=step(s,{at,...e} as SessionEvent);s=r.session;return r;};send({type:"start"});const open=send({type:"proposal",proposal:{version:2,act:"open",parts:[ln("open.hello"),ln("question.problem")]}});expect(open.refusal).toBeNull();return {get s(){return s},child(text:string){at+=4000;return send({type:"child_turn",text})},p(p:Record<string,unknown>){return send({type:"proposal",proposal:{version:2,...p} as Proposal})}}}

  describe("PR624 review requirements",()=>{
   it("does not hide an explicit final that is a known step value",()=>{const c=call();c.child("I got 66. I added 7 and 9 so my final is 16.");expect(c.p({act:"accept_answer",parts:[ln("answer.right")],reading:{answers:[{value:n(66),step:"result",verdict:"right"}]}}).refusal).not.toBeNull();});
   const rightOnes=(text:string,value=6)=>{const c=call();c.child(text);return c.p({act:"guide",step:"tens",level:0,parts:[ln("check.right_step",{step:"ones"}),ln("step.invite",{step:"tens"})],reading:{answers:[{value:n(value),step:"ones",verdict:"right"}]}});};
   it("does not skip a false equation before a carry",()=>{expect(rightOnes("7 plus 9 is 6 and I carry the 1.").refusal).not.toBeNull();});
   it("does not accept a digit from a false total",()=>{expect(rightOnes("7 plus 9 is 26, I put 6.").refusal).not.toBeNull();});
   it("does not ignore a wrong written digit",()=>{expect(rightOnes("7 plus 9 is 16, I wrote 5.",16).refusal).not.toBeNull();});
   it("asks about a corrected equation and its digit: the turn is not one template",()=>{expect(rightOnes("7 plus 9 is 6. No, I mean 7 plus 9 is 16, I wrote 6.").refusal?.code).toBe("answer_not_committed");});
   it("keeps an accepted result when a correction restates it with known working",()=>{const c=call();c.child("66");expect(c.p({act:"accept_answer",parts:[ln("answer.right")],reading:{answers:[{value:n(66),step:"result",verdict:"right"}]}}).refusal).toBeNull();c.child("Actually 66. 7 plus 9 is 16.");expect(c.s.solved).toBe("child");});
  });
});

describe("session step regressions (set 3)", () => {
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
});

describe("session step regressions (set 4)", () => {
  const operation: Operation = { kind: "add", operands: [18, 25] };

  const pkg = {
    ...SAMPLE_PACKAGES["add-27-39"], id: "review-roles-18-25", text: "18 + 25 = ?", operation,
    steps: workedSteps(operation), answer: { value: { type: "number", value: 43 }, accepted: [], unit: null },
    wrongAnswers: [{ value: { type: "number", value: 33 }, step: "tens", cause: "O3", description: "Forgets the carry" }],
  };

  const line = (id: LineId, slots: Slots = {}): LineChoice => ({ line: id, slots });

  type Input = SessionEvent extends infer E ? E extends SessionEvent ? Omit<E, "at"> : never : never;

  type Column = "ones" | "tens";

  function call(column: Column = "ones") {
    let session = createSession({ callId: "review-r6", package: pkg });
    let at = 1000;
    const send = (event: Input) => {
      const result = step(session, { ...event, at: at += 4000 } as SessionEvent);
      session = result.session;
      return result;
    };
    const judge = (part: Column, verdict: "right" | "wrong" = "right") => {
      const next = verdict === "wrong" ? part : part === "ones" ? "tens" : "result";
      const proposal: Proposal = {
        version: 2, act: "guide", step: next, level: 0,
        parts: [line(verdict === "right" ? "check.right_step" : "check.not_yet", { step: part }), line("step.invite", { step: next })],
        reading: { answers: [{ value: { type: "number", value: part === "ones" ? 13 : 4 }, step: part, verdict }] },
      };
      return send({ type: "proposal", proposal });
    };
    send({ type: "start" });
    expect(send({ type: "proposal", proposal: { version: 2, act: "open", parts: [line("open.hello"), line("question.problem")] } }).refusal).toBeNull();
    if (column === "tens") {
      send({ type: "child_turn", text: "8 plus 5 is 13." });
      expect(judge("ones").refusal).toBeNull();
    }
    return {
      get session() { return session; },
      child(text: string) { send({ type: "child_turn", text }); },
      judge(verdict: "right" | "wrong" = "right") { return judge(column, verdict); },
    };
  }

  /**
   * Rule A (2026-11-12): a turn with a sum and a right claim is the child's own and is credited; code still tells it from a
   * wrong one. The checks of this file stay what they were, only the credit moved (it was answer_not_committed).
   */
  const expectJudged = (refusal: { code: string } | null, right: boolean) => expect(refusal?.code).toBe(right ? undefined : "accepts_wrong_answer");

  describe("PR624 round 6: writing modifiers and column locations", () => {
    const forms = ["wrote the number", "wrote it as", "put the digit"];
    const cases = forms.flatMap((verb) => (["ones", "tens"] as const).flatMap((column) => [false, true].map((right) => ({
      verb, column, right, digit: right ? column === "ones" ? "three" : "four" : "two",
    }))));
    it.each(cases)("checks $verb $digit in $column", ({ verb, column, right, digit }) => {
      const c = call(column);
      c.child(`${column === "ones" ? "8 plus 5 is 13" : "1 plus 2 plus 1 is 4"}, I ${verb} ${digit} in the ${column}.`);
      expectJudged(c.judge().refusal, right);
      expect(c.session.done.includes(column)).toBe(right);
    });

    it.each(["in", "into", "under", "at", "for", "on"].flatMap((place) => [false, true].map((right) => ({ place, right }))))("checks another column $place the ones, correct=$right", ({ place, right }) => {
      const c = call("tens");
      c.child(`I wrote ${right ? 3 : 4} ${place} the ones, then 1 plus 2 plus 1 is 4.`);
      expectJudged(c.judge().refusal, right);
      expect(c.session.done.includes("tens")).toBe(right);
    });

    it.each([false, true])("checks both written digits in one clause, correct=%s", (right) => {
      const c = call("tens");
      c.child(`I wrote 3 in the ones and ${right ? 4 : 2} in the tens, then 1 plus 2 plus 1 is 4.`);
      expectJudged(c.judge().refusal, right);
      expect(c.session.done.includes("tens")).toBe(right);
    });

    it.each(["right", "wrong"] as const)("does not judge an unreadable column relation as %s", (verdict) => {
      const c = call("tens");
      c.child("I wrote 4 beside the ones, then 1 plus 2 plus 1 is 4.");
      expect(c.judge(verdict).refusal).not.toBeNull();
      expect(c.session.done).not.toContain("tens");
    });

    it.each(["right", "wrong"] as const)("clarifies a writing claim with two columns before judging %s", (verdict) => {
      const c = call("tens");
      c.child("I wrote 3 from the ones into the tens, then 1 plus 2 plus 1 is 4.");
      expect(c.judge(verdict).refusal).not.toBeNull();
      expect(c.session.done).not.toContain("tens");
    });

    it.each([false, true])("keeps the column after a decimal point, correct=%s", (right) => {
      const c = call("tens");
      c.child(`I wrote ${right ? "3.0" : "4.0"} under the ones, then 1 plus 2 plus 1 is 4.`);
      expectJudged(c.judge().refusal, right);
      expect(c.session.done.includes("tens")).toBe(right);
    });

    it.each(["two", "three"].flatMap((digit) => (["right", "wrong"] as const).map((verdict) => ({ digit, verdict }))))("does not judge an unreadable writing claim $digit as $verdict", ({ digit, verdict }) => {
      const c = call(); c.child(`8 plus 5 is 13, I wrote the new number ${digit} in the ones.`);
      expect(c.judge(verdict).refusal).not.toBeNull();
      expect(c.session.done).not.toContain("ones");
    });
  });

  describe("PR624 round 6: carry sources and destinations", () => {
    const routes = ["from the ones to the tens", "from the ones column to the tens column", "from the ones", "to the tens", "in the tens", "into the tens"];
    const cases = routes.flatMap((route) => (["ones", "tens"] as const).flatMap((column) => (["right", "wrong"] as const).map((verdict) => ({ route, column, verdict }))));
    it.each(cases)("checks $route in $column with verdict $verdict", ({ route, column, verdict }) => {
      const c = call(column);
      c.child(column === "ones" ? `8 plus 5 is 13, I carried one ${route} and wrote 3.` : `I carried one ${route}, and 1 plus 2 plus 1 is 4.`);
      expect(c.judge(verdict).refusal?.code).toBe(verdict === "right" ? undefined : "rejects_right_answer");
      expect(c.session.done.includes(column)).toBe(verdict === "right");
    });

    it.each(["from the tens to the ones", "from the ones to the ones", "from the ones to the hundreds"])("does not approve a wrong carry %s", (route) => {
      const c = call(); c.child(`8 plus 5 is 13, I carried one ${route} and wrote 3.`);
      expect(c.judge().refusal).not.toBeNull();
      expect(c.session.done).not.toContain("ones");
    });
  });
});

describe("wave-ab session regressions", () => {
  const start = async (id: keyof typeof FIXTURES) => {
    const model = scenarioModel();
    const text = createTextSession({ callId: `review-760-${id}`, package: FIXTURES[id], model, clock: () => 1000, random: 1 });
    model.next([], undefined);
    await text.start();
    return { model, text };
  };

  describe("review of 9884b94e (#760)", () => {
    it("P1: two committed wrong words on a claim get the easier example, then the honest close, never the answer word", async () => {
      const { model, text } = await start("CLAIM_GT");
      model.next([{ throws: true }], { start: "has_work" });
      await text.child("360 times 4 is 1440.");
      const said: string[] = [];
      for (let i = 0; i < 2; i++) {
        model.next([{ throws: true }], undefined);
        said.push(...(await text.child("It's no.")).say);
      }
      expect(text.session.finalMisses).toBe(2);
      for (let i = 0; i < 12 && !text.session.outcome; i++) {
        model.next([{ throws: true }], undefined);
        said.push(...(await text.child("I'm stuck.")).say);
      }
      // The given word's lines (answer.give.claim, write.claim): "The answer is yes. Now circle yes." The easier example's
      // own word ("So in the end, we circle yes.", for 2 × 2 > 3) is another problem's.
      expect(said.join(" "), said.join(" | ")).not.toMatch(/answer is yes|so it's yes|that means yes|(?:now|please|can you) circle yes|circle yes on your/i);
      expect(text.session.solved).toBeNull();
      expect(text.session.assistance).not.toContain("answer_given");
      expect(text.session.assistance).toContain("worked_example");
      expect(text.session.outcome?.reason).toBe("maya_closed");
    });

    /** The session right after the child's turn, before Maya answers it. */
    const after = (id: keyof typeof FIXTURES, text: string) => {
      let s = createSession({ callId: `review-760-${id}`, package: FIXTURES[id] });
      s = step(s, { type: "start", at: 1000 }).session;
      s = step(s, { type: "proposal", at: 1000, proposal: { version: 2, act: "open", parts: [{ line: "open.hello" }, { line: "question.problem" }] } }).session;
      return step(s, { type: "child_turn", at: 5000, text }).session;
    };
    const miss = (id: keyof typeof FIXTURES, text: string, value: number) => {
      const s = after(id, text);
      return committedValue(s, { value: { type: "number", value }, step: s.ladder.step, verdict: "wrong" });
    };

    it.each([["5.", true], ["The digit is 5.", true], ["5 ten thousands", true], ["Help, 5.", false], ["I think the digit is 5.", false]] as const)(
      "P2: %j on the ten thousands digit of 785243 is a miss: %s", (text, counts) => {
        expect(miss("PVV", text, 5)).toBe(counts);
      });

    it.each([["5.7.", true], ["It's 5.7.", true], ["Help, 5.7.", false], ["I copied 5.7.", false], ["I'm copying 5.7.", false], ["Maybe 5.7.", false]] as const)(
      "P2: %j on 5 wholes and 8 tenths is a miss: %s", (text, counts) => {
        expect(miss("PVB", text, 5.7)).toBe(counts);
      });
  });
});

describe("example transition regressions", () => {
  it("always accepts a fallback across H3 and the example copy for grades 2 and 4", async () => {
    for (const grade of [2, 4]) {
      let at = 1000;
      const model = fakeMayaModel({ answer: (input) => {
        if (input.state === "OPEN") return { version: 2, act: "open", parts: [{ line: "open.hello" }, { line: "question.problem" }] };
        const id = input.childTurn === "Show me the ones." ? "ones" : input.childTurn === "Show me the tens." ? "tens" : null;
        if (id) return { version: 2, act: "guide", step: id, level: 3, parts: [{ line: "step.show", slots: { step: id } }], reading: { help: "show" } };
        throw new Error("review fake provider unavailable");
      } });
      const adapter = createTextSession({ callId: `adapter-${grade}`, package: FIXTURES.A, model, clock: () => at, grade });
      await adapter.start();
      for (const text of ["Show me the ones.", "16.", "Show me the tens.", "6.", "I'm stuck.", "33."]) {
        at += 4000;
        const output = await adapter.child(text);
        expect(output.ended?.reason, `grade ${grade}: ${text}`).not.toBe("technical_issue");
      }
    }
  });

  it("always finds a fallback for H3, passed columns and example readings", () => {
    const cases = ["", "Okay.", "Yes.", "I see.", "I'm stuck.", "Help.", "Maybe 15.", "16.", "6.", "33.", "65."];
    for (const stage of ["h3", "passed", "example"] as const) {
      for (const text of cases) {
        let session = createSession({ callId: `invariant-${stage}`, package: FIXTURES.A });
        let at = 1000;
        const send = (event: Record<string, unknown>) => {
          const result = step(session, { at, ...event } as SessionEvent);
          session = result.session;
          return result;
        };
        const child = (turn: string) => { at += 4000; send({ type: "child_turn", text: turn }); };
        const fallback = (refused: unknown[] = []) => {
          for (const proposal of fallbacks(session, refused)) {
            const result = send({ type: "proposal", proposal });
            if (!result.refusal) return true;
          }
          return false;
        };
        const show = (id: string) => {
          const result = send({ type: "proposal", proposal: { version: 2, act: "guide", step: id, level: 3,
            parts: [{ line: "step.show", slots: { step: id } }], reading: { help: "show" } } });
          expect(result.refusal).toBeNull();
        };
        send({ type: "start" });
        expect(fallback()).toBe(true);
        child("Show me the ones."); show("ones");
        if (stage !== "h3") {
          child("16."); expect(fallback()).toBe(true);
          child("Show me the tens."); show("tens");
          child("6."); expect(fallback()).toBe(true);
        }
        if (stage === "example") {
          child("I'm stuck.");
          for (let i = 0; i < 8 && session.expect === "maya" && !session.outcome; i++) expect(fallback()).toBe(true);
          expect(session.exampleShown).toBe(FIXTURES.A.easierExample!.steps.length);
        }
        if (session.outcome) continue;
        child(text);
        const wrong = { version: 2, act: "give_answer", parts: [], reading: { answers: [{ value: { type: "number", value: Number.parseInt(text, 10) }, step: "result", verdict: "wrong" }] } };
        const refused = stage === "example" && (text === "33." || text === "65.") ? [wrong] : [];
        expect(fallback(refused), `${stage}: ${text}`).toBe(true);
        expect(session.assistance, `${stage}: ${text}`).not.toContain("answer_given");
        if (stage === "example" && (text === "33." || text === "65.")) {
          expect(session.finalMisses, text).toBe(text === "65." ? 1 : 0);
          expect(["TRY_TARGET", "GUIDE_TARGET", "CLOSE"], text).toContain(session.state);
        }
      }
    }
  });
});

describe("session guard invariants", () => {
  it("keeps miss counting behind committed-value checks and refuses answer release", () => {
    const text = readFileSync(new URL("./session.ts", import.meta.url), "utf8");
    const source = ts.createSourceFile("session.ts", text, ts.ScriptTarget.Latest, true);
    const bodies = new Map<string, string>();
    const writes: string[] = [];
    function visit(node: ts.Node, owner = "") {
      if (ts.isFunctionDeclaration(node) && node.name && node.body) {
        owner = node.name.text;
        bodies.set(owner, node.body.getText(source));
      }
      if (ts.isBinaryExpression(node) && [ts.SyntaxKind.EqualsToken, ts.SyntaxKind.PlusEqualsToken].includes(node.operatorToken.kind)) {
        const target = node.left.getText(source);
        if (["s.finalMisses", "ladder.failures", "failed"].includes(target)) writes.push(`${owner}:${target}:${node.right.getText(source)}`);
      }
      ts.forEachChild(node, (child) => visit(child, owner));
    }
    visit(source);
    expect(writes.filter((x) => !x.startsWith("propose:"))).toEqual([]);
    expect(writes).toContain("propose:s.finalMisses:misses");
    expect(writes).toContain("propose:ladder.failures:1");
    for (const name of ["propose", "finalMisses", "teachingActs", "stuckWayOut", "heardAnswers"]) expect(bodies.get(name), name).toContain("committedValue(");
    expect(bodies.get("teachingActs")).toContain("misses >= 2");
    expect(bodies.get("propose")).toContain("finalMisses(s, checked)");
    expect(bodies.get("codeProposals")).toContain("finalMisses(s, checked)");
    expect(bodies.get("finalMisses")).toContain('c.answer.verdict === "wrong" && committedValue(s, c.answer)');
    expect(bodies.get("propose")).toContain('a.verdict === "wrong" && committedValue(s, a)');
    expect(bodies.get("propose")).toContain('p.act === "give_answer"');
    expect(bodies.get("propose")).toContain('"The answer is not offered."');
    expect(bodies.get("teachingActs")).toContain('a.verdict === "wrong" && committedValue(s, a)');
    expect(bodies.get("stuckWayOut")).toContain('a.verdict !== "wrong" || committedValue(s, a)');
  });
});

describe("verdict handling regressions", () => {
  const n=(value:number)=>({type:'number' as const,value});

  function rig(pkg=FIXTURES.A){
   let s=createSession({callId:'review698',package:pkg}); let at=1000;
   const send=(e:Record<string, unknown>)=>{if(typeof e.at === "number") at=e.at;const r=step(s,{at,...e} as SessionEvent);s=r.session;return r;};
   const child=(text:string)=>send({type:'child_turn',at:at+=4000,text});
   const prop=(p:Proposal | Record<string, unknown>)=>send({type:'proposal',proposal:Object.assign({version:2},p)});
   const tick=(t:number)=>{at=t;return send({type:'tick'});};
   const fb=(refused:unknown[]=[])=>{const rejects:unknown[]=[];for(const p of fallbacks(s,refused)){const r=prop(p);if(!r.refusal)return {act:p.act,say:r.effects.filter(x=>x.kind==='say'),reading:p.reading, rejects};rejects.push(r.refusal)}return {act:'DEAD',rejects};};
   const show=(id:string)=>{const r=prop({act:'guide',step:id,level:3,parts:[{line:'step.show',slots:{step:id}}],reading:{help:'show'}});expect(r.refusal).toBeNull();};
   send({type:'start'});fb();
   return {get s(){return s},child,prop,fb,show,send,tick};
  }

  function setup(kind='h3'){
   const r=rig();
   if(kind==='done'){
   r.child('7 plus 9 is 16.');r.fb();r.child('2 plus 3 plus 1 is 6.');r.fb();expect(r.s.done).toEqual(['ones','tens']);
   }else if(kind!=='open'){
   r.child('Show me the ones.');r.show('ones');
   if(kind==='passed'){r.child('16.');r.fb();r.child('Show me the tens.');r.show('tens');r.child('6.');r.fb();expect(r.s.passed).toEqual(['ones','tens']);}
   }
   return r;
  }

  it('uncommitted wrong readings cannot unlock H3 through direct, kept or fallback paths',()=>{
   for (const [text,value] of [['I think 15.',15],['My friend said 15.',15],['How do I get 15',15],['Is it 15',15],['7 plus 9.',9]] as const) for(const mode of ['direct','kept','fallback']) {
    const r=setup('h3');r.child(text);const p={act:'give_answer',parts:[],reading:{answers:[{value:n(value),step:'ones',verdict:'wrong'}]}};
    if(mode==='direct') expect(r.prop(p).refusal,`${mode} ${text}`).not.toBeNull();
    else {const got=r.fb(mode==='kept'?[p]:[]);expect(got.act,`${mode} ${text}`).not.toBe('DEAD');expect(got.act,`${mode} ${text}`).not.toBe('give_answer');}
    expect(r.s.assistance,`${mode} ${text}`).not.toContain('answer_given');expect(r.s.ladder.failures,`${mode} ${text}`).toBe(0);expect(r.s.ladder.unlocked,`${mode} ${text}`).toBeLessThan(4);
   }
   for(const mode of ['direct','kept','fallback']){
    const r=setup('h3');r.send({type:'child_turn',at:50000,text:'15.',alternatives:['16.']});
    const p={act:'give_answer',parts:[],reading:{answers:[{value:n(15),step:'ones',verdict:'wrong'}]}};
    if(mode==='direct') expect(r.prop(p).refusal).not.toBeNull(); else {const got=r.fb(mode==='kept'?[p]:[]);expect(got.act,`${mode}: ${JSON.stringify(got.rejects)}`).not.toBe('DEAD');expect(got.act).not.toBe('give_answer');}
    expect(r.s.ladder.failures).toBe(0);expect(r.s.assistance).not.toContain('answer_given');
   }
  });

  it('copies of passed columns and alternatives never count as final misses',()=>{
   for(const text of ['16.','6.']) for(const mode of ['direct','kept','fallback']){
    const r=setup('passed');r.child(text);const p={act:'give_answer',parts:[],reading:{answers:[{value:n(Number(text.slice(0,-1))),step:'result',verdict:'wrong'}]}};
    if(mode==='direct') expect(r.prop({ ...p, act:'guide', step:'result', level:0, parts:[{line:'check.not_yet',slots:{step:'result'}},{line:'step.invite',slots:{step:'result'}}] }).refusal,`${mode} ${text}`).toBeNull();else r.fb(mode==='kept'?[p]:[]);expect(r.s.finalMisses,`${mode} ${text}`).toBe(0);
   }
   const r=setup('passed');r.send({type:'child_turn',at:50000,text:'65.',alternatives:['66.']});r.fb();expect(r.s.finalMisses).toBe(0);
  });
});

describe("line phrasing regressions", () => {
  interface Told { act: string | undefined; step: string | undefined; lines: string[]; say: string; refusals: string[] }

  async function play(steps: Step[]) {
    const b: Behaviour = { id: "j06-review", title: "j06 review", fixture: "A", status: "passing", steps, expect: { outcome: {} } };
    const store = memoryTraceStore();
    await runBehaviour(b, store);
    const saved = store.load(b.id)!;
    const trace = JSON.parse(saved) as { turns: { kind: string; output?: { act: string; say: string[] } | null; attempts?: { refusal: { code: string } | null; proposal?: { step?: string; parts?: { line?: string }[] } | null }[] }[]; outcome: { reason: string } | null };
    const told: Told[] = trace.turns.filter((t) => t.kind === "maya" && t.output).map((t) => {
      const p = t.attempts!.at(-1)!.proposal ?? {};
      return { act: t.output!.act, step: p.step, lines: (p.parts ?? []).flatMap((x) => (x.line ? [x.line] : [])), say: t.output!.say.join(" "), refusals: t.attempts!.flatMap((a) => (a.refusal ? [a.refusal.code] : [])) };
    });
    const hard = judge(b, saved).failures.map((f) => `${f.code}: ${f.detail}`).filter((x) => /^(?:hint_skipped|answer_too_early|unchecked_output|math_not_from_code)/.test(x));
    return { told, hard, outcome: trace.outcome };
  }

  /** The model reads this right answer and wants to go on; its repair fails, so code decides the turn. */
  const named = (text: string, read: Read, step = "tens"): Step => ({ child: text, read, maya: [{ act: "guide", step, level: 0, lines: ["check.right_step", "step.invite"], repair: { throws: true } }] });

  const stated = named("I think 7 plus 9 is 16.", { start: "has_work", answers: [[16, "ones", "right"]] });

  /** The model reads nothing and goes on to the tens; its repair fails. */
  const onToTens = (text: string): Step => ({ child: text, maya: [{ act: "guide", step: "tens", level: 0, lines: ["step.invite"], repair: { throws: true } }] });

  describe("after check.stated, only an exact bare yes moves Maya past the column (P1-a)", () => {

    it.each([
      "Yes, I wrote 1 in the ones and carried 6.", "Yes, 9.", "Yes? Is it 7?", "Yeah I guess. Is it?", "Yes, 16 in the tens.", "Yes. I wrote 16 in the ones.",
      "Yes, I think so.", "Yes, but I don't know.", "Yes. Yes.", "Okay.", "Maybe.", "Yes!? ", "My mom says yes.",
    ])("stays on the ones after %j", async (reply) => {
      const { told } = await play([stated, onToTens(reply)]);
      expect(told[2].step ?? "ones").toBe("ones");
      expect(told.map((t) => t.say).join(" ")).not.toMatch(/Every part is done/);
    });

    // Rule A and B (2026-11-12): "Yes 16." states the ones' total as the child's own, with no blocker, so it is credited.
    it("credits the ones after \"Yes 16.\" (rule B: yes with the same value)", async () => {
      const { told } = await play([stated, onToTens("Yes 16.")]);
      expect(told[2].step).toBe("tens");
    });

    it("keeps the model's wrong verdict on the ones: 'Yes, I wrote 1 in the ones and carried 6.' gets 'not yet' for the ones", async () => {
      const wrong: Step = { child: "Yes, I wrote 1 in the ones and carried 6.", read: { answers: [[1, "ones", "wrong"]] }, maya: [{ act: "guide", step: "ones", level: 0, lines: ["check.not_yet", "step.invite"] }] };
      const { told } = await play([stated, wrong]);
      expect(told[2]).toMatchObject({ act: "guide", step: "ones", lines: ["check.not_yet", "step.invite"] });
      expect(told[2].refusals).toEqual([]);
    });

    it("keeps the help on the ones when the child gets them wrong after a yes: check.not_yet there is not refused", async () => {
      const wrongLater: Step = { child: "I wrote 1 in the ones.", read: { answers: [[1, "ones", "wrong"]] }, maya: [{ act: "guide", step: "ones", level: 0, lines: ["check.not_yet", "step.invite"] }] };
      const { told } = await play([stated, onToTens("Yes."), wrongLater]);
      expect(told[2].step ?? "ones").toBe("ones");
      expect(told[3]).toMatchObject({ act: "guide", step: "ones", lines: ["check.not_yet", "step.invite"] });
      expect(told[3].refusals).not.toContain("wrong_step");
    });

    it("never says 'Every part is done' to a child whose ones are wrong", async () => {
      const { told } = await play([stated, onToTens("Yes, I wrote 1 in the ones and carried 6."), onToTens("2 plus 3 plus 1 is 6."), onToTens("Yes.")]);
      expect(told.map((t) => t.say).join(" ")).not.toMatch(/Every part is done|put it all together|put the parts together/i);
    });
  });

  describe("a total in a named place is never said back as the column (P1-b)", () => {
    it.each(["16 in the tens.", "The tens make 16.", "7 plus 9 is 16 hundreds.", "9 plus 7 is 16, so 6 in the tens.", "Sixteen ones."])("gives %j no check.stated", async (text) => {
      const { told } = await play([named(text, { start: "has_work", answers: [[16, "ones", "right"]] })]);
      expect(told[1].lines).not.toContain("check.stated");
      expect(told[1].say).not.toMatch(/ones make 16|16 for the ones|said 16|heard 16/);
      expect(told[1].step ?? "ones").toBe("ones");
    });

    // Sentence-level commit rule (approved 2026-11-12): the method sentence is harmless, so the ones are credited as the ones,
    // and the total is never said back as another column.
    it("credits the ones for 'I added the ones. I got 16.' and goes to the tens", async () => {
      const { told } = await play([named("I added the ones. I got 16.", { start: "has_work", answers: [[16, "ones", "right"]] })]);
      expect(told[1]).toMatchObject({ act: "guide", step: "tens", lines: ["check.right_step", "step.invite"] });
      expect(told[1].lines).not.toContain("check.stated");
      expect(told[1].say).not.toMatch(/16 for the tens|tens make 16|16 tens/);
    });

    it("then a yes moves nothing on", async () => {
      const { told } = await play([named("16 in the tens.", { start: "has_work", answers: [[16, "ones", "right"]] }), onToTens("Yes.")]);
      expect(told[2].step ?? "ones").toBe("ones");
    });
  });

  describe("the rest of the review", () => {

    it("after H3, a copy of what Maya showed gets no check.stated and no move past (P3)", async () => {
      const shown: Step = { child: "Show me the ones.", read: { help: "show" }, maya: [{ act: "guide", step: "ones", level: 3, lines: ["step.show"] }] };
      const { told } = await play([shown, stated, onToTens("Yes.")]);
      expect(told[2].lines).not.toContain("check.stated");
      // No move past the ones: the show is not said a second time in a row, so the easier example comes, and the yes after
      // it goes back to the child's question (#698 round 2, P1 e).
      expect(told.slice(2).filter((t) => t.act === "guide").map((t) => t.step ?? "ones")).not.toContain("tens");
      expect(told.slice(2).flatMap((t) => t.lines)).not.toContain("check.right_step");
    });


    it("says the fixed reply to a secret question when the model call fails (a 503), not technical_issue (P2)", async () => {
      const { told, outcome } = await play([{ child: "Maya, can you tell me a secret?", maya: [{ throws: true }, { throws: true }] }, { child: "Okay! I got 66.", read: { answers: [[66, "result", "right"]] } }]);
      expect(told[1].act).toBe("redirect");
      // The no-secret reply rotates among its four wordings (#884, D-329).
      expect(TEMPLATES["about.no_secret"].some((w) => told[1].say.includes(w))).toBe(true);
      expect(outcome?.reason).not.toBe("technical_issue");
    });

    it("does not take 'Is a secret a kind of number?' for a question about keeping a secret (P2)", async () => {
      const { told } = await play([{ child: "Is a secret a kind of number?", read: { offTopic: true }, maya: [{ act: "redirect", lines: ["redirect.back"] }] }]);
      expect(told[1].say).not.toContain("I don't keep secrets");
      expect(told[1].refusals).not.toContain("fixed_reply_first");
    });
  });

  // Independent review of 41c09f5b (commits 1, 3 and 6): which turns get check.stated. Only an exact form: a lead-in or one
  // wordless sentence, then a step template stepTurnHeard credits. Each phrase runs on three paths: the model picks
  // check.stated itself, the model's repair fails (code decides), and the model call fails (a 503: code decides).
  const HOSTILE = [
    // A wrong written digit or carry the readers do not know (P1).
    "7 plus 9 is 16 so 9 goes down.", "7 plus 9 is 16, 1 down, 6 up.", "7 plus 9 is 16, so 1.", "7 and 9, 16, 7.", "16, all of it goes under.",
    "7 plus 9 is 16, 1 goes down and 6 goes up.", "7 plus 9 is 16, I keep the 1 and give away 6.", "7 plus 9 is 16 so I put down 7.", "7 plus 9 is 16 and I put 1 on top.",
    "7 plus 9 is 16, 6 carry.", "Seven and nine is sixteen, carry six.", "7 plus 9 is 16, then 9.", "7 plus 9 is 16, I wrote 7.", "16 so 1 goes on the 2.", "16, so I give the 6 to the 2.",
    "7 plus 9 is 16, I write the 9.", "9 and 7 is 16, 9 and 7.", "I put 16 at the bottom.",
    // A final answer said back and never judged (P2).
    "My answer is 16.", "the answer is 16.", "16 is my final answer.", "I got 16 for the whole thing.", "7 plus 9 is 16 and I'm done.", "7 plus 9 is 16 so the answer is 16.",
    "So 16 is my answer.", "16 is the answer.", "I added everything and got 16.", "The whole sum is 16.", "Sixteen. That's it, I'm finished.", "7 plus 9 is 16 so it's 16.",
    // The readers' own list (zz-probe): parsed phrases that must stay refused.
    "7 plus 9 is 16, I wrote 1 and carried 6.", "7 plus 9 is 16 and I carried 7.", "7 plus 9 is 16 and I carried 0.", "7 plus 9 is 16. I wrote 16.", "I wrote sixteen.",
    "Seven and nine is sixteen, I put 16 down.", "16 I mean 61", "7 plus 6 is 16.", "9 plus 9 is 16.", "7 plus 9 is 16 and 7 plus 9 is 9.", "I got 16 then 6 then 1", "16 or 16",
    "Grandpa 16.", "they told me 16", "Teacher: 16.", "Ms Lee says 16", "16, 16, 16.", "I wrote 1 and carried 6.", "I carried 1 and wrote 7.", "16. Then 5.", "I write 9 and carry 7.", "sixteen. sixty-six.", "16 then 66", "First 7 and 9 makes 16 then I put 16 under", "7 + 9 = 16, put down the 1", "7 + 9 = 16, write the 1, carry the 6",
    "wrote the 1 carried the 6, 16", "I wrote 1. 16.", "I write 1 carry 6 because 16", "7 plus 9 is 16 and 2 plus 3 is 6.",
  ];

  describe("a turn the review named never moves Maya past the ones, on every path (review of 41c09f5b)", () => {
    const paths: [string, (text: string) => Step][] = [
      ["the model moves on to the tens", (text) => ({ child: text, read: { start: "has_work" }, maya: [{ act: "guide", step: "tens", level: 0, lines: ["step.invite"], repair: { throws: true } }] })],
      ["the repair fails", (text) => named(text, { start: "has_work", answers: [[16, "ones", "right"]] })],
      ["the model call fails (503)", (text) => ({ child: text, maya: [{ throws: true }, { throws: true }] })],
    ];
    for (const [path, first] of paths) {
      it.each(HOSTILE)(`${path}: %j gets no check.stated, and a yes after it moves nothing on`, async (text) => {
        const { told } = await play([first(text), { child: "Yes.", maya: [{ throws: true }, { throws: true }] }]);
        expect(told[1].lines).not.toContain("check.stated");
        expect(told.slice(1).every((t) => t.step !== "tens")).toBe(true);
      });
    }

    // Rule A (2026-11-12): several steps said in order are each checked on their own. "I write 6, carry 1" is the ones'
    // written digit and carry, right; "then 2 plus 3 is 5" is a wrong tens, which blocks only the tens.
    it("credits the ones and not the tens for 'I write 6, carry 1, then 2 plus 3 is 5.' on code's fallback", async () => {
      const { told } = await play([{ child: "I write 6, carry 1, then 2 plus 3 is 5.", maya: [{ throws: true }, { throws: true }] }]);
      expect(told[1].step).toBe("tens");
      expect(told[1].lines).toContain("check.right_step");
      expect(told[1].lines).not.toContain("check.stated");
    });

    it("lets the model judge 'My answer is 16.' as a wrong final answer: no forced check.stated", async () => {
      const { told } = await play([{ child: "My answer is 16.", read: { start: "has_work", answers: [[16, "result", "wrong"]] }, maya: [{ act: "guide", step: "ones", level: 0, lines: ["check.not_yet", "step.invite"] }] }]);
      expect(told[1]).toMatchObject({ act: "guide", step: "ones", lines: ["check.not_yet", "step.invite"] });
      expect(told[1].refusals).toEqual([]);
    });


    it("starts no easier example after the child said the ones and a yes, in code's fallback (P3)", async () => {
      const { told } = await play([stated, { child: "Yes.", maya: [{ throws: true }, { throws: true }] }, { child: "I don't know.", maya: [{ throws: true }, { throws: true }] }]);
      expect(told[2].step ?? "ones").toBe("ones");
      expect(told.map((t) => t.act)).not.toContain("example_step");
    });
  });
});

describe("approved phrasing lines", () => {
  // Savar approved the #698 fix-round lines on 2026-11-08 ("approve maya lines"), exactly as worded in
  // docs/maya-practice-lines.md. These tests pin the code to those exact texts, so a later change to any of them fails here
  // and needs his approval again (D-202).

  const DOC = readFileSync(join(process.cwd(), "docs/maya-practice-lines.md"), "utf8").replace(/\r\n/g, "\n");

  /** The rows of the first table after a heading, as cells. */
  function table(heading: string): string[][] {
    const at = DOC.indexOf(heading);
    expect(at, heading).toBeGreaterThanOrEqual(0);
    const rows: string[][] = [];
    let started = false;
    for (const line of DOC.slice(at).split("\n").slice(1)) {
      if (line.startsWith("|")) {
        started = true;
        const cells = line.split("|").slice(1, -1).map((c) => c.trim());
        if (!/^-+$/.test(cells[0]) && !/^(Id|Id or location)$/.test(cells[0])) rows.push(cells);
      } else if (started) break;
    }
    return rows;
  }

  const unticked = (id: string) => id.replace(/`/g, "");

  describe("lines Savar approved on 2026-11-08 (#698 fix round)", () => {
    it("are marked approved in the doc", () => {
      expect(DOC).toContain("## Approved, #698 fix round 2026-11-08\n");
      expect(DOC).toContain("## Approved, #698 fix round 2026-11-08 (no feeling claims)\n");
      expect(DOC).not.toMatch(/## Pending Savar, #698 fix round/);
    });

    it("close.stuck: the honest close, exactly", () => {
      const rows = table("### The honest close after help alone");
      expect(rows.map((r) => r[0])).toEqual(["close.stuck.0", "close.stuck.1", "close.stuck.2", "close.stuck.3", "close.stuck.4"]);
      expect(TEMPLATES["close.stuck"]).toEqual(rows.map((r) => r[1]));
      expect(TEMPLATES["close.stuck"][0]).toBe("This one is hard, and it's okay to stop. Try the easier one on paper, or ask a grown-up for help.");
    });

    it("check.method.down and check.method.up: the child's method named back, exactly", () => {
      const rows = table("### The child's own method, named back");
      const of = (key: string) => rows.filter((r) => r[0].startsWith(`${key}.`)).map((r) => r[1]);
      expect(of("check.method.down")).toHaveLength(5);
      expect(of("check.method.up")).toHaveLength(5);
      expect(TEMPLATES["check.method.down"]).toEqual(of("check.method.down"));
      expect(TEMPLATES["check.method.up"]).toEqual(of("check.method.up"));
    });

    it("held.cannot.0: the short wording, exactly", () => {
      const rows = table("### New held line (D-327)");
      expect(rows.map((r) => unticked(r[0]))).toEqual(["held.cannot.0"]);
      expect(TEMPLATES["held.cannot"]).toEqual([rows[0][2]]);
      expect(TEMPLATES["held.cannot"]).toEqual(["Sorry, I can't teach this question yet."]);
    });

    it("the feeling rewrites, closing.14 and the two OK_TALK examples, exactly", () => {
      const rows = table("## Approved, #698 fix round 2026-11-08 (no feeling claims)");
      const okTalk = OK_TALK.map((o) => o.line);
      let phrases = 0;
      for (const [where, old, now] of rows) {
        if (where.startsWith("`OK_TALK`")) {
          expect(okTalk, now).toContain(now);
          expect(okTalk, old).not.toContain(old);
          continue;
        }
        const m = /^([a-z]+)\.(\d+)$/.exec(unticked(where));
        expect(m, where).not.toBeNull();
        const [group, n] = [m![1] as keyof typeof PHRASES, Number(m![2])];
        expect(PHRASES[group][n - 1], where).toBe(now);
        expect(PHRASES[group], `${where} old wording`).not.toContain(old);
        phrases += 1;
      }
      expect(phrases).toBe(34);
      expect(rows.filter((r) => r[0].startsWith("`OK_TALK`"))).toHaveLength(2);
    });

    it("the honest closes after help are the approved ones", () => {
      expect(TEMPLATES["close.together"]).toContain("We worked on {expr} together today.");
      expect(TEMPLATES["close.checked"]).toContain("Your answer for {expr} is right. Bye for now!");
    });
  });
});
