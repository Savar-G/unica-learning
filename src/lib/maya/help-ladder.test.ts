// The help ladder's way out (#735, the controller's decision (a)): help requests alone never lead to the given answer.
// After the top hint, the easier example; after the example, an honest close with no answer (close.stuck). A real miss
// keeps D-199. Each call here is driven by code's own fallbacks, as when the model is down, unless a test says otherwise.
import { describe, expect, it } from "vitest";
import { createSession, fallbacks, learningEvent, step, type Proposal, type Session, type SessionEvent } from "@/lib/maya";
import { TEMPLATES } from "@/lib/maya/lines";
import { modelInput } from "@/lib/maya-model";
import { FIXTURES } from "@/lib/maya-gate/fixtures";
import { checkQuestionPackage, workedSteps, type Operation, type QuestionPackage } from "@/lib/question-package";

const num = (value: number) => ({ type: "number" as const, value });
function pkgOf(text: string, operation: Operation, answer: number, easier: { text: string; operation: Operation; answer: number }): QuestionPackage {
  const pkg: QuestionPackage = {
    ...FIXTURES.A, id: `help-ladder-${text}`, text, operation, steps: workedSteps(operation), answer: { value: num(answer), accepted: [], unit: null },
    wrongAnswers: [{ value: num(answer + 1), cause: "O3", description: "One too many", step: null }],
    easierExample: { text: easier.text, operation: easier.operation, answer: num(easier.answer), steps: workedSteps(easier.operation) },
  };
  expect(checkQuestionPackage(pkg)).toMatchObject({ ok: true });
  return pkg;
}
/** The two reproductions of #735: a question with more than one step, and one whose only column is its final step. */
const DIVIDE = () => pkgOf("8 ÷ 2 = ?", { kind: "divide", operands: [8, 2] }, 4, { text: "6 ÷ 2 = ?", operation: { kind: "divide", operands: [6, 2] }, answer: 3 });
const ADD = () => pkgOf("2 + 1 = ?", { kind: "add", operands: [2, 1] }, 3, { text: "1 + 1 = ?", operation: { kind: "add", operands: [1, 1] }, answer: 2 });

const FAMILY = { parentId: "p", childId: "c" };
interface Said { act: string; text: string }

/** A call where code's fallbacks say every Maya turn, and the child says `turns` one by one. */
function byCode(pkg: QuestionPackage, turns: string[]): { said: Said[]; session: Session } {
  let s = createSession({ callId: "help-ladder", package: pkg });
  let at = 1000;
  const send = (event: SessionEvent) => { const r = step(s, event); s = r.session; return r; };
  const said: Said[] = [];
  const mayaTurns = () => {
    for (let n = 0; n < 8 && s.expect === "maya" && !s.outcome; n++) {
      const r = fallbacks(s).map((p) => send({ type: "proposal", at, proposal: p as Proposal })).find((x) => x.refusal === null);
      if (!r) throw new Error("No accepted fallback: Maya had no safe line");
      for (const e of r.effects) if (e.kind === "say") said.push({ act: e.act, text: e.text });
    }
  };
  send({ type: "start", at });
  mayaTurns();
  for (const text of turns) {
    if (s.outcome) break;
    send({ type: "child_turn", at: at += 4000, text });
    mayaTurns();
  }
  return { said, session: s };
}

const STUCK = Array.from({ length: 12 }, () => "I'm stuck.");
const CLOSES: readonly string[] = TEMPLATES["close.stuck"];

describe("help requests alone: the easier example, then an honest close (#735, decision (a))", () => {
  it.each([["8 ÷ 2", DIVIDE], ["2 + 1", ADD], ["27 + 39", () => FIXTURES.A]] as const)("%s: never the answer, the top hint once, the example, then the close", (_name, make) => {
    const pkg = make();
    const { said, session } = byCode(pkg, STUCK);
    const acts = said.map((x) => x.act);
    expect(acts).not.toContain("give_answer");
    // The example follows the guided help, and the close follows the whole example.
    const firstExample = acts.indexOf("example_step");
    expect(firstExample).toBeGreaterThan(acts.indexOf("guide"));
    expect(acts.slice(firstExample, firstExample + pkg.easierExample!.steps.length).every((a) => a === "example_step")).toBe(true);
    expect(acts.at(-1)).toBe("close");
    // A final-only step does not repeat its top lines: no guide turn says the same words twice.
    const guides = said.filter((x) => x.act === "guide").map((x) => x.text);
    expect(new Set(guides).size).toBe(guides.length);
    expect(session.outcome).toMatchObject({ reason: "child_stopped" });
    expect(session.solved).toBeNull();
    expect(session.assistance).not.toContain("answer_given");
  });

  it.each([["8 ÷ 2", DIVIDE, 4], ["2 + 1", ADD, 3], ["27 + 39", () => FIXTURES.A, 66]] as const)("%s: the close says it is hard, that stopping is fine, names a next step, and holds no answer or part of one", (_name, make, answer) => {
    const pkg = make();
    const { said } = byCode(pkg, STUCK);
    const close = said.at(-1)!.text;
    expect(CLOSES.some((c) => close.endsWith(c))).toBe(true);
    expect(close).toMatch(/\b(?:hard|tricky|tough)\b/);
    expect(close).toMatch(/\bstop/);
    expect(close).toMatch(/easier one on paper/);
    expect(close).toMatch(/grown-up/);
    // No number at all: so no answer, no digit of it, no column total.
    expect(close).not.toMatch(/\d/);
    expect(close).not.toMatch(new RegExp(`\\b${answer}\\b`));
    for (const c of CLOSES) expect(c).not.toMatch(/\d|\b(?:two|three|four|five|six|seven|eight|nine|ten)\b/i);
  });

  it.each([["8 ÷ 2", DIVIDE], ["2 + 1", ADD], ["27 + 39", () => FIXTURES.A]] as const)("%s: writes the stuck step as a learning event", (_name, make) => {
    const { session } = byCode(make(), STUCK);
    expect(learningEvent(session, FAMILY)).toMatchObject({ source: "call", result: "blank", stuckStep: "ones", mistake: null });
  });

  it("refuses a model's given answer for help alone after the top hint, and its close without the honest line", () => {
    let s = createSession({ callId: "help-ladder-model", package: FIXTURES.A });
    let at = 1000;
    const send = (event: SessionEvent) => { const r = step(s, event); s = r.session; return r; };
    const ok = (p: Omit<Proposal, "version">) => { const r = send({ type: "proposal", at, proposal: { version: 2, ...p } as Proposal }); expect(r.refusal).toBeNull(); return r; };
    send({ type: "start", at });
    ok({ act: "open", parts: [{ line: "open.hello", slots: {} }, { line: "question.problem", slots: {} }] });
    send({ type: "child_turn", at: at += 4000, text: "Show me the ones." });
    ok({ act: "guide", step: "ones", level: 3, parts: [{ line: "step.show", slots: { step: "ones" } }], reading: { help: "show" } });
    send({ type: "child_turn", at: at += 4000, text: "I'm still stuck." });
    const asked = { version: 2, act: "give_answer", parts: [], reading: { help: "more" } } as Proposal;
    expect(send({ type: "proposal", at, proposal: asked }).refusal).toMatchObject({ code: "act_not_allowed", allowed: ["example_step"] });
    // The example, worked by code (keeping the refused reading's request for help), then the child still only asks for help.
    for (let n = 0; n < 6 && s.expect === "maya"; n++) {
      const r = fallbacks(s, n === 0 ? [asked] : []).map((p) => send({ type: "proposal", at, proposal: p as Proposal })).find((x) => x.refusal === null);
      expect(r?.effects.some((e) => e.kind === "say" && e.act === "example_step")).toBe(true);
    }
    expect(s.exampleShown).toBe(FIXTURES.A.easierExample!.steps.length);
    send({ type: "child_turn", at: at += 4000, text: "I'm stuck." });
    expect(send({ type: "proposal", at, proposal: { version: 2, act: "give_answer", parts: [], reading: { help: "more" } } }).refusal).toMatchObject({ allowed: ["close"] });
    expect(send({ type: "proposal", at, proposal: { version: 2, act: "close", parts: [{ warm: "closing" }] } }).refusal).toMatchObject({ code: "line_not_offered" });
    const closed = ok({ act: "close", parts: [{ line: "close.stuck", slots: {} }] });
    expect(closed.effects.some((e) => e.kind === "say" && CLOSES.includes(e.text))).toBe(true);
    expect(s.outcome).toMatchObject({ reason: "child_stopped" });
  });
});

describe("real misses keep D-199", () => {
  it("gives the answer after two wrong final answers once every column is done", () => {
    let s = createSession({ callId: "help-ladder-d199", package: FIXTURES.A });
    let at = 1000;
    const send = (event: SessionEvent) => { const r = step(s, event); s = r.session; return r; };
    const ok = (p: Omit<Proposal, "version">) => { const r = send({ type: "proposal", at, proposal: { version: 2, ...p } as Proposal }); expect(r.refusal).toBeNull(); return r; };
    send({ type: "start", at });
    ok({ act: "open", parts: [{ line: "open.hello", slots: {} }, { line: "question.problem", slots: {} }] });
    send({ type: "child_turn", at: at += 4000, text: "7 plus 9 is 16." });
    ok({ act: "guide", step: "tens", level: 0, parts: [{ line: "check.right_step", slots: { step: "ones" } }, { line: "step.invite", slots: { step: "tens" } }], reading: { answers: [{ value: num(16), step: "ones", verdict: "right" }] } });
    send({ type: "child_turn", at: at += 4000, text: "2 plus 3 plus 1 is 6." });
    ok({ act: "guide", step: "result", level: 0, parts: [{ line: "check.right_step", slots: { step: "tens" } }, { line: "step.invite", slots: { step: "result" } }], reading: { answers: [{ value: num(6), step: "tens", verdict: "right" }] } });
    send({ type: "child_turn", at: at += 4000, text: "It's 67." });
    ok({ act: "guide", step: "result", level: 0, parts: [{ line: "check.not_yet", slots: { step: "result" } }, { line: "step.invite", slots: { step: "result" } }], reading: { answers: [{ value: num(67), step: "result", verdict: "wrong" }] } });
    send({ type: "child_turn", at: at += 4000, text: "It's 65." });
    const given = ok({ act: "give_answer", parts: [], reading: { answers: [{ value: num(65), step: "result", verdict: "wrong" }] } });
    expect(given.effects.some((e) => e.kind === "say" && e.act === "give_answer")).toBe(true);
    expect(s.assistance).toContain("answer_given");
  });

  it.each([["15.", 15], ["Still 4.", 4]] as const)("gives the answer for %s at the shown step after H3", (text, value) => {
    // The model reads a wrong answer: code's fallback keeps it and gives the answer.
    let s = createSession({ callId: "help-ladder-miss", package: FIXTURES.A });
    let at = 1000;
    const send = (event: SessionEvent) => { const r = step(s, event); s = r.session; return r; };
    send({ type: "start", at });
    send({ type: "proposal", at, proposal: { version: 2, act: "open", parts: [{ line: "open.hello", slots: {} }, { line: "question.problem", slots: {} }] } });
    send({ type: "child_turn", at: at += 4000, text: "Show me the ones." });
    send({ type: "proposal", at, proposal: { version: 2, act: "guide", step: "ones", level: 3, parts: [{ line: "step.show", slots: { step: "ones" } }], reading: { help: "show" } } });
    send({ type: "child_turn", at: at += 4000, text });
    const refused = { version: 2, act: "guide", step: "ones", level: 3, parts: [{ line: "step.show", slots: { step: "ones" } }], reading: { answers: [{ value: num(value), step: "ones", verdict: "wrong" }] } } as Proposal;
    const refusal = send({ type: "proposal", at, proposal: refused }).refusal;
    if (value === 15) expect(refusal).toMatchObject({ allowed: ["give_answer"] });
    else expect(refusal?.allowed).toContain("give_answer");
    const r = fallbacks(s, [refused]).map((p) => send({ type: "proposal", at, proposal: p as Proposal })).find((x) => x.refusal === null)!;
    expect(r.effects.some((e) => e.kind === "say" && e.act === "give_answer")).toBe(true);
  });
});

describe("fallback availability after a shown step", () => {
  it("always accepts a fallback after H3 across copies, help requests and misses", () => {
    for (const first of ["16.", "I need help.", "15."]) for (const next of ["6.", "I need help.", "65."]) {
      let s = createSession({ callId: "fallback-grid", package: FIXTURES.A });
      let at = 1000;
      const send = (event: SessionEvent) => { const r = step(s, event); s = r.session; return r; };
      const fallback = () => {
        for (let n = 0; n < 8 && s.expect === "maya" && !s.outcome; n++) {
          const r = fallbacks(s).map((proposal) => send({ type: "proposal", at, proposal })).find((x) => !x.refusal);
          expect(r, `no fallback after ${first}, ${next}`).toBeDefined();
        }
      };
      send({ type: "start", at }); fallback();
      send({ type: "child_turn", at: at += 4000, text: "Show me the ones." });
      expect(send({ type: "proposal", at, proposal: { version: 2, act: "guide", step: "ones", level: 3, parts: [{ line: "step.show", slots: { step: "ones" } }], reading: { help: "show" } } }).refusal).toBeNull();
      for (const text of [first, next, "I need help."]) {
        if (s.outcome) break;
        send({ type: "child_turn", at: at += 4000, text }); fallback();
      }
    }
  });
});

describe("passed columns and final misses", () => {
  it("gives the answer after two wrong finals without crediting copied columns", () => {
    let s = createSession({ callId: "passed-finals", package: FIXTURES.A });
    let at = 1000;
    const send = (event: SessionEvent) => { const r = step(s, event); s = r.session; return r; };
    const ok = (proposal: Proposal) => expect(send({ type: "proposal", at, proposal }).refusal).toBeNull();
    const fallback = () => {
      let accepted: ReturnType<typeof step> | undefined;
      for (const proposal of fallbacks(s)) {
        const result = send({ type: "proposal", at, proposal });
        if (!result.refusal) { accepted = result; break; }
      }
      expect(accepted, "no accepted fallback").toBeDefined();
      return accepted!;
    };
    const child = (text: string) => send({ type: "child_turn", at: at += 4000, text });
    send({ type: "start", at });
    fallback();
    child("Show me the ones.");
    ok({ version: 2, act: "guide", step: "ones", level: 3, parts: [{ line: "step.show", slots: { step: "ones" } }], reading: { help: "show" } });
    child("16."); fallback();
    child("Show me the tens.");
    ok({ version: 2, act: "guide", step: "tens", level: 3, parts: [{ line: "step.show", slots: { step: "tens" } }], reading: { help: "show" } });
    child("6."); fallback();
    expect(s.passed).toEqual(["ones", "tens"]);
    expect(s.done).toEqual([]);
    child("67."); fallback(); expect(s.finalMisses).toBe(1);
    child("65.");
    expect(fallback().effects.some((e) => e.kind === "say" && e.act === "give_answer")).toBe(true);
    expect(s.done).toEqual([]);
    expect(s.assistance).toContain("answer_given");
  });
});

describe("bare final fallback boundary", () => {
  it.each(["Maybe 67.", "Is it 67?", "My friend said 67.", "You said 67.", "67, no I don't know.", "16.", "6."])("does not count %s as a committed miss", (text) => {
    let session = createSession({ callId: "boundary", package: FIXTURES.A });
    let at = 1000;
    const send = (event: SessionEvent) => { const r = step(session, event); session = r.session; return r; };
    const child = (text: string) => send({ type: "child_turn", at: at += 4000, text });
    const fallback = () => { const r = fallbacks(session).map((proposal) => send({ type: "proposal", at, proposal })).find((x) => !x.refusal); expect(r).toBeDefined(); };
    const show = (id: string) => expect(send({ type: "proposal", at, proposal: { version: 2, act: "guide", step: id, level: 3, parts: [{ line: "step.show", slots: { step: id } }], reading: { help: "show" } } }).refusal).toBeNull();
    send({ type: "start", at }); fallback();
    child("Show me the ones."); show("ones"); child("16."); fallback();
    child("Show me the tens."); show("tens"); child("6."); fallback();
    expect(session.passed).toEqual(["ones", "tens"]);
    child(text); fallback();
    expect(session.finalMisses).toBe(0);
    expect(session.assistance).not.toContain("answer_given");
  });
});

describe("numbers in help questions", () => {
  it.each(["Can you show me 7 plus 9?", "Is 9 right?"])("refuses a wrong reading of %s and keeps a safe fallback", (text) => {
    let s = createSession({ callId: "help-question", package: FIXTURES.A });
    let at = 1000;
    const send = (event: SessionEvent) => { const r = step(s, event); s = r.session; return r; };
    send({ type: "start", at });
    send({ type: "proposal", at, proposal: { version: 2, act: "open", parts: [{ line: "open.hello", slots: {} }, { line: "question.problem", slots: {} }] } });
    send({ type: "child_turn", at: at += 4000, text: "Show me the ones." });
    expect(send({ type: "proposal", at, proposal: { version: 2, act: "guide", step: "ones", level: 3, parts: [{ line: "step.show", slots: { step: "ones" } }], reading: { help: "show" } } }).refusal).toBeNull();
    send({ type: "child_turn", at: at += 4000, text });
    const proposal: Proposal = { version: 2, act: "give_answer", parts: [], reading: { help: "show", answers: [{ value: num(9), step: "ones", verdict: "wrong" }] } };
    expect(send({ type: "proposal", at, proposal }).refusal).not.toBeNull();
    let accepted: ReturnType<typeof step> | undefined;
    for (const p of fallbacks(s, [proposal])) {
      const r = send({ type: "proposal", at, proposal: p });
      if (!r.refusal) { accepted = r; break; }
    }
    expect(accepted).toBeDefined();
    expect(accepted!.effects.some((e) => e.kind === "say" && e.act === "give_answer")).toBe(false);
    expect(s.assistance).not.toContain("answer_given");
  });
});


describe("model input after a shown column", () => {
  it("exposes the passed step and current ladder step without offering passed help", () => {
    let s = createSession({ callId: "model-passed", package: FIXTURES.A });
    let at = 1000;
    const send = (event: SessionEvent) => { const r = step(s, event); s = r.session; return r; };
    const fallback = () => { const r = fallbacks(s).map((proposal) => send({ type: "proposal", at, proposal })).find((x) => !x.refusal); expect(r).toBeDefined(); };
    send({ type: "start", at }); fallback();
    send({ type: "child_turn", at: at += 4000, text: "Show me the ones." });
    expect(send({ type: "proposal", at, proposal: { version: 2, act: "guide", step: "ones", level: 3, parts: [{ line: "step.show", slots: { step: "ones" } }], reading: { help: "show" } } }).refusal).toBeNull();
    send({ type: "child_turn", at: at += 4000, text: "16." }); fallback();
    send({ type: "child_turn", at: at += 4000, text: "I need help." });
    const input = modelInput(s);
    expect(input).toMatchObject({ done: [], passed: ["ones"], ladderStep: "tens" });
    const guide = input.offers.find((o) => o.act === "guide");
    expect(guide?.lines.some((o) => o.line === "step.invite" && o.slots.step === "tens")).toBe(true);
    expect(guide?.lines.some((o) => o.slots.step === "ones")).toBe(false);
  });
});
