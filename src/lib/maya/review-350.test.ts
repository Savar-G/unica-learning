import { describe, expect, it } from "vitest";
import { createSession, learningEvent, nextActs, SAFETY_GUIDANCE, step, valuesIn, type Proposal, type Session, type SessionEvent } from "@/lib/maya";
import { applyBatch, createScene } from "@/lib/board";
import { learningEvents } from "@/lib/learning-events";
import { memoryLearningEventStore } from "@/lib/learning-events-memory";
import { checkQuestionPackage, workedSteps, type AnswerValue, type Operation, type QuestionPackage } from "@/lib/question-package";

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
const OPEN: Proposal = { act: "open", say: "I'm Maya, an AI math helper. Our team may review this call. What did you try?" };
const right66 = { value: num(66), step: "result", verdict: "right" as const };
const wrong56 = { value: num(56), step: "result", verdict: "wrong" as const };
const guide = (extra: Partial<Proposal> = {}): Proposal => ({ act: "guide", say: "What is seven plus nine?", step: "ones", level: 0, ...extra });

/** A call past its opening at time 0 (ms). `send` returns the result without asserting. */
function call(pkg: unknown = PKG) {
  let s: Session = createSession({ callId: "review-call", package: pkg });
  const send = (e: SessionEvent) => {
    const r = step(s, e);
    s = r.session;
    return r;
  };
  send({ type: "start", at: 0 });
  send({ type: "proposal", at: 0, proposal: OPEN });
  return {
    get s() { return s; },
    send,
    propose: (p: unknown, at = s.now ?? 0) => send({ type: "proposal", at, proposal: p }),
    child: (text: string, extra: object = {}, at = s.now ?? 0) => send({ type: "child_turn", at, text, ...extra }),
  };
}

describe("F1: every equation Maya says or writes is checked by code", () => {
  it("refuses a false spoken equation with no declared claims", () => {
    const c = call();
    c.child("I got 56");
    expect(c.propose(guide({ say: "Seven plus nine is fifteen." })).refusal).toMatchObject({ code: "wrong_math" });
  });

  it("refuses a false equation written on the board", () => {
    const c = call();
    c.child("I got 56");
    const r = c.propose(guide({ board: [{ op: "write", id: "bad", text: "7+9=15", place: { region: "main" } }] }));
    expect(r.refusal).toMatchObject({ code: "wrong_math" });
    expect(r.effects).toEqual([]);
  });

  it("accepts true equations, chains and decimals", () => {
    const c = call();
    c.child("I got 56");
    expect(c.propose(guide({ say: "Two plus three plus one is six, and 0.6 + 0.25 = 0.85. Seven plus nine is what?", reading: { answers: [wrong56] } })).refusal).toBeNull();
  });
});

describe("F2: a refused proposal keeps the child's priority input and the clock", () => {
  it("keeps a safety escalation", () => {
    const c = call();
    c.send({ type: "safety", severity: "concern", at: 1 });
    c.propose({ act: "safety", say: "" }, 1);
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
    const r = c.propose({ act: "safety", say: "Okay." }, 1);
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
    c.propose({ act: "confirm", say: "Did you say fifty-six?", reading: { answers: [wrong56] } });
    c.child("I want to stop.");
    c.propose({ act: "close", say: "Bye.", reading: { stop: true } });
    expect(learningEvent(c.s, { parentId: "p", childId: "c" })).toMatchObject({ result: "blank", mistake: null, hints: 0 });
  });

  it("does not let a bad verdict block a safety response", () => {
    const c = call();
    c.child("56", { uncertain: true });
    const r = c.propose({ act: "safety", say: "", reading: { safety: "concern", answers: [{ ...wrong56, verdict: "right" }] } });
    expect(r.refusal).toBeNull();
  });

  it("does not let a bad verdict block a stop", () => {
    const c = call();
    c.child("56. Stop.");
    const r = c.propose({ act: "close", say: "Bye.", reading: { stop: true, answers: [{ ...wrong56, verdict: "right" }] } });
    expect(r.refusal).toBeNull();
    expect(r.session.outcome).toMatchObject({ reason: "child_stopped" });
  });
});

describe("F5: only the child's committed answer counts", () => {
  it.each(["−66", "66... no, I do not know", "You said sixty-six. I got fifty-six.", "negative sixty-six", "66 or 56?"])("does not accept 66 from %s", (text) => {
    const c = call();
    c.child(text);
    expect(c.propose({ act: "accept_answer", say: "Yes.", reading: { answers: [right66] } }).refusal).not.toBeNull();
  });

  it("offers a confirmation when the answer is not clear", () => {
    const c = call();
    c.child("66 or 56?");
    expect(c.propose({ act: "accept_answer", say: "Yes.", reading: { answers: [right66] } }).refusal?.allowed).toContain("confirm");
  });

  it("reads .85 and asks to confirm a number form code cannot read", () => {
    expect(valuesIn(".85")).toEqual([num(0.85)]);
    expect(valuesIn("negative point eight five")).toEqual([num(-0.85)]);
    const c = call();
    c.child("three quarters");
    expect(nextActs(c.s).acts).toEqual(["confirm"]);
  });
});

describe("F6: board objects keep their role", () => {
  const columns = (id: string, a: number, b: number) => ({ op: "columns", id, operation: "add", operands: [{ id: "top", value: String(a) }, { id: "bottom", value: String(b) }], place: { region: "main" } });
  const put = (objectId: string, column: string) => ({ op: "put", target: { objectId, part: "cell", rowId: "answer", column }, value: "6" });

  it("refuses an example step that draws the child's question", () => {
    const c = call();
    c.child("I can't start.");
    expect(c.propose({ act: "example_step", step: "ones", say: "Here is an easier one.", reading: { start: "no_start" }, board: [columns("target", 27, 39), put("target", "tens")] }).refusal)
      .toMatchObject({ code: "board_wrong_problem" });
  });

  it("refuses an example step that writes on the question's board", () => {
    const c = call();
    let scene = createScene();
    c.child("What is the question?");
    const a = c.propose({ act: "clarify", say: "It is 27 plus 39.", board: [columns("target", 27, 39)] });
    for (const e of a.effects) if (e.kind === "board") { const b = applyBatch(scene, e.batch); if (b.ok) scene = b.scene; }
    c.child("I cannot start. Show an example.");
    const r = c.propose({ act: "example_step", step: "ones", say: "Here is an easier one.", reading: { start: "no_start" }, board: ["ones", "tens"].map((col) => put("target", col)) });
    expect(r.refusal).toMatchObject({ code: "board_wrong_problem" });
  });

  it("lets Maya read out a question whose answer is one of its numbers", () => {
    const zero = packageOf({ kind: "add", operands: [66, 0] }, num(66), { kind: "add", operands: [1, 0] }, num(1), "2.4", ["2.4-add-within-100"]);
    let s = createSession({ callId: "zero", package: zero });
    s = step(s, { type: "start", at: 0 }).session;
    expect(step(s, { type: "proposal", at: 0, proposal: { act: "open", say: "I'm Maya, an AI math helper. The question is 66 plus zero. What did you try?" } }).refusal).toBeNull();
  });
});

describe("F7: the expanded question contract", () => {
  it("teaches a long multiplication", () => {
    const c = call(packageOf({ kind: "multiply", operands: [47, 23] }, num(1081), { kind: "multiply", operands: [47, 3] }, num(141), "5.6"));
    c.child("7 times 3 is 21. I got 1081.");
    expect(c.propose({ act: "accept_answer", say: "Yes, how did you get it?", reading: { answers: [{ value: num(21), step: "r1-ones", verdict: "right" }, { value: num(1081), step: "result", verdict: "right" }] } }).refusal).toBeNull();
  });

  it("hears a division answer with a remainder", () => {
    const c = call(packageOf({ kind: "divide", operands: [157, 6] }, { type: "remainder", quotient: 26, remainder: 1 }, { kind: "divide", operands: [57, 6] }, { type: "remainder", quotient: 9, remainder: 3 }, "5.6"));
    c.child("26 remainder 1");
    expect(c.propose({ act: "accept_answer", say: "Yes. How did you do it?", reading: { answers: [{ value: { type: "remainder", quotient: 26, remainder: 1 }, step: "result", verdict: "right" }] } }).refusal).toBeNull();
  });

  it("holds a fraction question it cannot teach yet", () => {
    const frac = (n: number, d: number) => ({ type: "fraction" as const, numerator: n, denominator: d });
    let s = createSession({ callId: "f", package: packageOf({ kind: "fraction-add", operands: [frac(2, 3), frac(3, 4)] }, { type: "mixed", whole: 1, numerator: 5, denominator: 12 }, { kind: "fraction-add", operands: [frac(1, 5), frac(2, 5)] }, frac(3, 5), "6.5") });
    s = step(s, { type: "start", at: 0 }).session;
    expect(s.state).toBe("CONTENT_HOLD");
  });
});

describe("F8: the learning event follows the learning record's contract", () => {
  const parentId = "22222222-2222-4222-8222-222222222222";
  const childId = "33333333-3333-4333-8333-333333333333";
  const store = () => learningEvents(memoryLearningEventStore({ children: [{ id: childId, parentId }] }));

  it("records a wrong attempt the child left as blank, and it is stored", async () => {
    const c = call();
    c.child("56");
    c.propose(guide({ reading: { answers: [wrong56] } }));
    c.child("Stop");
    c.propose({ act: "close", say: "Bye.", reading: { stop: true } });
    const event = learningEvent(c.s, { parentId, childId })!;
    expect(event).toMatchObject({ result: "blank", mistake: null, stuckStep: "ones", source: "call", key: "call:review-call", evidence: { kind: "call", id: "review-call" } });
    expect(await store().append(event)).toMatchObject({ ok: true });
  });

  it("stores a call where Maya gave the answer", async () => {
    const c = call();
    c.child("show me");
    c.propose(guide({ level: 3, say: "Seven plus nine is sixteen: write 6, carry 1 ten. What do the tens make?", reading: { help: "show" } }));
    c.child("more");
    c.propose({ act: "give_answer", say: "Six tens and six ones.", reading: { help: "more" } });
    c.child("okay");
    c.propose({ act: "close", say: "Bye." });
    const event = learningEvent(c.s, { parentId, childId })!;
    expect(event).toMatchObject({ result: "blank", hints: 2 });
    expect(await store().append(event)).toMatchObject({ ok: true });
  });

  it("stores a corrected wrong answer as right, with no mistake", async () => {
    const c = call();
    c.child("56");
    c.propose(guide({ reading: { answers: [wrong56] } }));
    c.child("66");
    c.propose({ act: "accept_answer", say: "Yes. How did you do it?", reading: { answers: [right66] } });
    c.child("I carried");
    c.propose({ act: "ask_write", say: "Write it on paper.", understanding: "evidence_observed" });
    c.child("done");
    c.propose({ act: "close", say: "Bye." });
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
    expect(c.propose({ act: "try_target", say: "Try your question." }).refusal).toMatchObject({ code: "act_not_allowed" });
  });
});
