import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeAiClient } from "@/lib/ai-client-fake";
import { allLineTexts, LINE_IDS, LINES_VERSION, PHRASE_GROUPS, PHRASES, SAFETY_GUIDANCE, TEMPLATES, type Proposal } from "@/lib/maya";
import { aiMayaModel, PROMPT_VERSION, SYSTEM_PROMPT, type ModelInput } from "@/lib/maya-model";
import { fakeMayaModel, ruleMayaModel } from "@/lib/maya-model-fake";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { createTextSession, type TextOutput } from "@/lib/maya-text";
import { checkTrace, classifyError, configuredSecrets, ERROR_MESSAGES, packageHash, redactText, TRACE_VERSION, type ErrorCode } from "@/lib/maya-trace";
import { valuesIn } from "@/lib/maya";
import type { OperationPackage } from "@/lib/question-package";

// Maya's text adapter (#322), through its public interface: a fake model, a passed-in clock and seed, no network.

const PKG = SAMPLE_PACKAGES["add-27-39"] as OperationPackage;
const T0 = Date.UTC(2026, 9, 31, 16, 0, 0);
type Draft = Omit<Proposal, "version">;
const v2 = (p: Draft | Record<string, unknown>) => ({ version: 2, ...p });
const OPEN = v2({ act: "open", parts: [{ line: "open.hello" }] });
const num = (value: number) => ({ type: "number" as const, value });

/** A text session whose model answers each request with the next scripted proposal (a function sees the input). */
function scripted(answers: (unknown | ((input: ModelInput) => unknown))[], pkg: unknown = PKG) {
  let now = T0;
  const model = fakeMayaModel({
    answer: (input, n) => {
      const a = answers[n];
      if (a === undefined) throw new Error(`no scripted answer ${n}`);
      return typeof a === "function" ? (a as (i: ModelInput) => unknown)(input) : a;
    },
  });
  const session = createTextSession({ callId: "call-1", package: pkg, model, clock: () => now, random: 7 });
  return { session, model, advance: (s: number) => (now += s * 1000) };
}

/** Every sentence Maya may say: code lines, bank phrases, the safety guidance. Checked against what reached the child. */
const SAFE = new Set([...allLineTexts(PKG, [num(56), num(66), num(16)]), ...Object.values(PHRASES).flat(), ...Object.values(SAFETY_GUIDANCE)].flatMap(sentences));
function sentences(text: string): string[] {
  return text.replace(/\{name\}/g, "").split(/(?<=[.!?])\s+/).map((s) => s.replace(/,\s*([.!?])$/, "$1").trim()).filter(Boolean);
}
const said = (out: TextOutput) => out.say.join(" ");

describe("a text session with the fake model", () => {
  it("runs a whole call and writes a trace in the shared format", async () => {
    const { session, model } = scripted([
      OPEN,
      v2({ act: "accept_answer", parts: [{ line: "answer.right" }, { line: "check.explain", slots: { step: "tens" } }], reading: { start: "has_work", answers: [{ value: num(66), step: "result", verdict: "right" }] }, draw: [{ offer: "question.columns" }] }),
      v2({ act: "ask_write", parts: [{ line: "write.answer" }], understanding: "evidence_observed" }),
      v2({ act: "close", parts: [{ warm: "closing" }], reading: { paper: "written" } }),
    ]);
    expect(said(await session.start())).toMatch(/\bAI\b/);
    const right = await session.child("I got 66. I added the ones first.");
    expect(right.board).toHaveLength(1);
    expect(right.board[0].commands[0]).toMatchObject({ op: "columns", id: "question" });
    await session.child("Seven plus nine is sixteen, so I carried a ten.");
    const end = await session.child("I wrote it.");
    expect(end.ended).toMatchObject({ reason: "solved", assistance: "independent", paperStatus: "child_confirmed" });
    expect(session.ended).toBe(true);

    // The model read the session's offers, never more than one act's worth of choices it was not given.
    expect(model.requests[0].offers.map((o) => o.act)).toEqual(["open"]);
    expect(model.requests[1].childTurn).toBe("I got 66. I added the ones first.");
    expect(model.requests[1].question?.answer).toBe("66");

    const trace = session.trace();
    const read = checkTrace(JSON.parse(JSON.stringify(trace)));
    expect(read.ok).toBe(true);
    expect(trace).toMatchObject({
      kind: "maya-trace",
      version: TRACE_VERSION,
      callId: "call-1",
      runner: "text",
      model: { id: "fake", promptVersion: PROMPT_VERSION },
      versions: { proposal: 2, lines: LINES_VERSION },
      question: { id: "add-27-39", text: "27 + 39 = ?", hash: packageHash(PKG) },
      freeTalk: false,
      outcome: { reason: "solved" },
      counts: { mayaTurns: 4, refusals: 0, repairs: 0, fallbacks: 0, silent: 0 },
    });
    expect(trace.startedAt).toBe(new Date(T0).toISOString());
    expect(trace.turns.map((t) => t.kind)).toEqual(["start", "maya", "child", "maya", "child", "maya", "child", "maya"]);
    expect(trace.board).toEqual([expect.objectContaining({ turn: 3, transactionId: "call-1-b1" })]);
    const maya = trace.turns.filter((t) => t.kind === "maya");
    expect(maya[1]).toMatchObject({ state: "ASSESS", stateAfter: "CHECK", output: { act: "accept_answer", board: ["call-1-b1"] } });
  });

  it("hashes the same package the same way, whatever its key order, and a changed package differently", () => {
    const shuffled = Object.fromEntries(Object.entries(PKG).reverse());
    expect(packageHash(shuffled)).toBe(packageHash(PKG));
    expect(packageHash({ ...PKG, text: "27 + 38 = ?" })).not.toBe(packageHash(PKG));
  });

  it("runs a call with the rule player alone, saying only code lines and bank phrases", async () => {
    let now = T0;
    const session = createTextSession({ callId: "rule-1", package: PKG, model: ruleMayaModel(), clock: () => (now += 3000), random: 3 });
    const outputs = [await session.start()];
    for (const text of ["I don't know how to start.", "Okay.", "16", "I got 66.", "Because 7 and 9 make 16, so I carried a ten.", "I wrote it."]) {
      if (session.ended) break;
      outputs.push(await session.child(text));
    }
    const all = outputs.flatMap((o) => o.say.flatMap(sentences));
    expect(all.length).toBeGreaterThan(5);
    for (const x of all) expect(SAFE.has(x), x).toBe(true);
    // The check can fail: a sentence code did not write is not in the set.
    expect(SAFE.has("27 plus 39 is 56.")).toBe(false);
    const trace = session.trace();
    expect(checkTrace(trace).ok).toBe(true);
    expect(trace.counts.silent).toBe(0);
    // The easier example was drawn: every board batch passed the board core.
    expect(trace.board.length).toBeGreaterThan(0);
  });
});

describe("an unchecked number or board proposal never reaches the child", () => {
  it("repairs a wrong-answer acceptance by asking the model again once, with the refusal", async () => {
    const wrong = v2({ act: "accept_answer", parts: [{ line: "answer.right" }], reading: { answers: [{ value: num(56), step: "result", verdict: "right" }] } });
    const fixed = v2({ act: "guide", step: "ones", level: 0, parts: [{ line: "check.not_yet", slots: { step: "result" } }, { line: "step.invite", slots: { step: "ones" } }], reading: { answers: [{ value: num(56), step: "result", verdict: "wrong" }] } });
    const { session, model } = scripted([OPEN, wrong, fixed]);
    await session.start();
    const out = await session.child("I got 56.");
    expect(model.requests[2].repair).toMatchObject({ proposal: wrong, refusal: { code: "accepts_wrong_answer" } });
    expect(model.requests[2].repair?.refusal.reason).toBeTruthy();
    expect(said(out)).not.toMatch(/\b66\b|right/i);
    expect(out.say.flatMap(sentences).every((x) => SAFE.has(x))).toBe(true);
    const turn = session.trace().turns.filter((t) => t.kind === "maya")[1];
    expect(turn).toMatchObject({ kind: "maya", output: { act: "guide" } });
    if (turn.kind !== "maya") throw new Error("not a Maya turn");
    expect(turn.attempts.map((a) => [a.source, a.refusal?.code ?? null])).toEqual([["model", "accepts_wrong_answer"], ["repair", null]]);
    expect(session.trace().counts).toMatchObject({ refusals: 1, repairs: 1, repairedOk: 1, fallbacks: 0 });
  });

  it("replaces a twice-refused number with code's fallback: the wrong sum is never said", async () => {
    const bad = v2({ act: "accept_answer", parts: [{ talk: "27 plus 39 is 56." }, { line: "answer.right" }], reading: { answers: [{ value: num(66), step: "result", verdict: "right" }] } });
    const { session, model } = scripted([OPEN, bad, bad]);
    await session.start();
    const out = await session.child("I got 66.");
    expect(model.requests).toHaveLength(3);
    expect(out.say).toHaveLength(1);
    expect(said(out)).not.toMatch(/56/);
    expect(out.say.flatMap(sentences).every((x) => SAFE.has(x))).toBe(true);
    const turn = session.trace().turns.filter((t) => t.kind === "maya")[1];
    if (turn.kind !== "maya") throw new Error("not a Maya turn");
    expect(turn.attempts.map((a) => [a.source, a.refusal?.code ?? null])).toEqual([
      ["model", "free_talk_in_math_turn"], ["repair", "free_talk_in_math_turn"], ["fallback", null],
    ]);
    // The fallback keeps the answer code checks alone (#389): the child said 66 and kept it, and it is right. Only the
    // words are code's.
    expect(turn.attempts[2].proposal).toMatchObject({ act: "accept_answer", reading: { answers: [{ value: num(66), step: "result", verdict: "right" }] } });
    expect(session.session.lastResult).toBe("right");
  });

  it("refuses board commands the model built, and board offers it was not given, then repairs", async () => {
    const built = v2({ act: "guide", step: "ones", level: 0, parts: [{ line: "step.invite", slots: { step: "ones" } }], board: [{ op: "write", id: "n1", text: "7 + 9 = 15", place: { region: "main" } }] });
    const unknown = v2({ act: "guide", step: "ones", level: 0, parts: [{ line: "step.invite", slots: { step: "ones" } }], draw: [{ offer: "question.write.result" }] });
    const ok = v2({ act: "guide", step: "ones", level: 0, parts: [{ line: "step.invite", slots: { step: "ones" } }], draw: [{ offer: "question.columns" }] });
    const a = scripted([OPEN, built, ok]);
    await a.session.start();
    const out = await a.session.child("I don't know how to do the ones.");
    expect(a.model.requests[2].repair?.refusal.code).toBe("board_not_code");
    expect(out.board.flatMap((b) => b.commands)).toEqual([expect.objectContaining({ op: "columns", id: "question" })]);
    expect(JSON.stringify(out.board)).not.toMatch(/15/);

    const b = scripted([OPEN, unknown, unknown]);
    await b.session.start();
    const out2 = await b.session.child("I don't know how to do the ones.");
    expect(out2.board).toEqual([]);
    const turn = b.session.trace().turns.filter((t) => t.kind === "maya")[1];
    if (turn.kind !== "maya") throw new Error("not a Maya turn");
    expect(turn.attempts.map((x) => x.source)).toEqual(["model", "repair", "fallback"]);
    expect(turn.attempts[0].refusal?.code).toBe("board_not_code");
  });

  it("goes straight to the fallback when the model fails, and keeps the error in the trace", async () => {
    const { session, model } = scripted([OPEN, () => { throw new Error("OpenRouter answered 503: busy"); }]);
    await session.start();
    const out = await session.child("I don't know.");
    expect(model.requests).toHaveLength(2);
    expect(out.say).toHaveLength(1);
    expect(out.say.flatMap(sentences).every((x) => SAFE.has(x))).toBe(true);
    const turn = session.trace().turns.filter((t) => t.kind === "maya")[1];
    if (turn.kind !== "maya") throw new Error("not a Maya turn");
    expect(turn.attempts).toEqual([
      expect.objectContaining({ source: "model", proposal: null, error: { code: "http_5xx", message: ERROR_MESSAGES.http_5xx, status: 503 } }),
      expect.objectContaining({ source: "fallback", refusal: null }),
    ]);
    expect(session.trace().counts).toMatchObject({ modelErrors: 1, fallbacks: 1 });
  });

  it("keeps a safety signal from a refused proposal: the safety guidance is said, and the call is flagged", async () => {
    const refusedWithSafety = v2({ act: "guide", step: "ones", level: 4, parts: [{ talk: "Hmm." }], reading: { safety: "concern" } });
    const { session } = scripted([OPEN, refusedWithSafety, refusedWithSafety]);
    await session.start();
    const out = await session.child("Someone at home hurts me.");
    expect(said(out)).toContain(SAFETY_GUIDANCE.concern);
    expect(session.session.safety.flagged).toBe(true);
  });
});

describe("a twice-refused proposal keeps what code can check of its reading (#389)", () => {
  const answer = (value: number, step: string, verdict: "right" | "wrong", problem?: "target" | "example") => ({ value: num(value), step, verdict, ...(problem ? { problem } : {}) });
  /** The Maya turn after the last child turn, from the trace. */
  const lastMayaTurn = (session: ReturnType<typeof scripted>["session"]) => {
    const turn = session.trace().turns.filter((t) => t.kind === "maya").at(-1);
    if (!turn || turn.kind !== "maya") throw new Error("no Maya turn");
    return turn;
  };
  const sources = (session: ReturnType<typeof scripted>["session"]) => lastMayaTurn(session).attempts.map((a) => a.source);

  it("keeps a right step: the ones are recorded and said right, and the help goes on to the tens", async () => {
    // Practice run 9, F06: the model read the ones right but proposed accepting the whole question, twice.
    const refused = v2({ act: "accept_answer", parts: [{ line: "answer.right" }], reading: { answers: [answer(16, "ones", "right")] } });
    const { session, model } = scripted([OPEN, refused, refused, (input: ModelInput) => input]);
    await session.start();
    const out = await session.child("Seven plus nine is sixteen.");
    expect(sources(session)).toEqual(["model", "repair", "fallback"]);
    expect(session.session.done).toEqual(["ones"]);
    expect(lastMayaTurn(session).output?.act).toBe("guide");
    expect(lastMayaTurn(session).attempts[2].proposal).toMatchObject({ act: "guide", step: "tens", level: 0, reading: { answers: [answer(16, "ones", "right")] } });
    // "Yes! 7 + 9 = 16." then the gentlest help on the tens; never the ones again, never the answer.
    expect(said(out)).toContain("7 + 9 = 16");
    expect(said(out)).toMatch(/\btens\b/);
    expect(said(out)).not.toMatch(/\bones\b|\b66\b/);
    expect(out.say.flatMap(sentences).every((x) => SAFE.has(x))).toBe(true);
    // The next turn's offers start from the tens: the ones are done.
    await session.child("Hmm.");
    const input = model.requests[3];
    expect(input.done).toEqual(["ones"]);
    const guide = input.offers.find((o) => o.act === "guide")!;
    expect(guide.lines.some((l) => l.line.startsWith("step.") && l.slots.step === "ones")).toBe(false);
  });

  it("never records a wrong step read as right during a refusal, and keeps the right one beside it", async () => {
    // 2 + 3 = 5 is not the tens of 27 + 39 (the carried ten makes 6): code drops that answer, never turns it round.
    const refused = v2({ act: "accept_answer", parts: [{ line: "answer.right" }], reading: { answers: [answer(16, "ones", "right"), answer(5, "tens", "right")] } });
    const { session } = scripted([OPEN, refused, refused]);
    await session.start();
    const out = await session.child("Seven plus nine is sixteen. Two plus three is five.");
    expect(sources(session)).toEqual(["model", "repair", "fallback"]);
    expect(session.session.done).toEqual(["ones"]);
    expect(lastMayaTurn(session).attempts[2].proposal).toMatchObject({ reading: { answers: [answer(16, "ones", "right")] } });
    expect(said(out)).not.toMatch(/2 \+ 3 = 5|\b66\b/);

    // A reading with only a wrong step read as right keeps nothing: no reading, no step done, no "Yes".
    const wrongOnly = v2({ act: "accept_answer", parts: [{ line: "answer.right" }], reading: { answers: [answer(15, "ones", "right")] } });
    const b = scripted([OPEN, wrongOnly, wrongOnly]);
    await b.session.start();
    const out2 = await b.session.child("Seven plus nine is fifteen.");
    expect(lastMayaTurn(b.session).attempts.map((a) => a.source)).toEqual(["model", "repair", "fallback"]);
    expect(lastMayaTurn(b.session).attempts[2].proposal).not.toHaveProperty("reading");
    expect(b.session.session.done).toEqual([]);
    expect(said(out2)).not.toMatch(/\byes\b|right|15/i);
  });

  it("does not start the easier example after the child has made progress", async () => {
    // Practice run 9, F06: an earlier "no start" reading ran 18 + 5 after the child had done the ones.
    const noStart = v2({ act: "clarify", parts: [{ line: "assess.ask" }], reading: { start: "no_start" } });
    const example = v2({
      act: "example_step", step: "ones", parts: [{ line: "example.intro" }, { line: "example.step", slots: { step: "ones" } }], reading: { answers: [answer(16, "ones", "right")] },
    });
    const { session, model } = scripted([OPEN, noStart, example, example]);
    await session.start();
    await session.child("I don't want to.");
    expect(session.session.noStart).toBe(true);
    const out = await session.child("Okay. Seven plus nine is sixteen.");
    expect(lastMayaTurn(session).attempts.map((a) => a.refusal?.code ?? null)).toEqual(["act_not_allowed", "act_not_allowed", null]);
    expect(model.requests[3].repair?.refusal.allowed).not.toContain("example_step");
    expect(lastMayaTurn(session).output?.act).toBe("guide");
    expect(session.session).toMatchObject({ noStart: false, exampleShown: 0, done: ["ones"] });
    expect(said(out)).not.toMatch(/18 \+ 5|easier|smaller/i);

    // A refused "no start" after that is not kept: the help stays on the child's question.
    const refusedNoStart = v2({ act: "example_step", step: "ones", parts: [{ line: "example.intro" }, { line: "example.step", slots: { step: "ones" } }], reading: { start: "no_start" } });
    const c = scripted([OPEN, v2({ act: "guide", step: "tens", level: 0, parts: [{ line: "check.right_step", slots: { step: "ones" } }, { line: "step.invite", slots: { step: "tens" } }], reading: { answers: [answer(16, "ones", "right")] } }), refusedNoStart, refusedNoStart]);
    await c.session.start();
    await c.session.child("Seven plus nine is sixteen.");
    const out3 = await c.session.child("I don't know how to start.");
    expect(c.session.session.noStart).toBe(false);
    expect(lastMayaTurn(c.session).output?.act).toBe("guide");
    expect(said(out3)).not.toMatch(/18 \+ 5/);
  });

  it("does not ask for a written answer the child already wrote", async () => {
    // Practice run 9, F04: "Write 66 on your page, please." after the child wrote 66.
    const accept = v2({ act: "accept_answer", parts: [{ line: "answer.right" }], reading: { answers: [answer(66, "result", "right")] } });
    const writeAgain = v2({ act: "ask_write", understanding: "uncertain", parts: [{ line: "write.answer" }], reading: { answers: [answer(66, "result", "right")] } });
    const { session, model } = scripted([OPEN, accept, writeAgain, writeAgain]);
    await session.start();
    await session.child("I got 66!");
    await session.writing("started");
    await session.writing("done");
    const out = await session.child("66");
    expect(model.requests[2].offers.find((o) => o.act === "ask_write")!.lines.map((l) => l.line)).not.toContain("write.answer");
    expect(lastMayaTurn(session).attempts.map((a) => a.refusal?.code ?? null)).toEqual(["line_not_offered", "line_not_offered", null]);
    expect(lastMayaTurn(session).output?.act).toBe("ask_write");
    expect(said(out)).not.toMatch(/write|paper|page/i);
    expect(out.say.flatMap(sentences).every((x) => SAFE.has(x))).toBe(true);

    // Before the child writes, the request to write is still offered and said.
    const b = scripted([OPEN, accept, writeAgain]);
    await b.session.start();
    await b.session.child("I got 66!");
    expect(said(await b.session.child("Yay."))).toMatch(/write 66/i);
  });

  it("uses the final-step help line once every column is done: no workaround with the question line", async () => {
    const refused = v2({ act: "accept_answer", parts: [{ line: "answer.right" }], reading: { answers: [answer(6, "tens", "right")] } });
    const ones = v2({ act: "guide", step: "tens", level: 0, parts: [{ line: "check.right_step", slots: { step: "ones" } }, { line: "step.invite", slots: { step: "tens" } }], reading: { answers: [answer(16, "ones", "right")] } });
    const { session } = scripted([OPEN, ones, refused, refused]);
    await session.start();
    await session.child("Seven plus nine is sixteen.");
    const out = await session.child("Two plus three plus one is six.");
    expect(sources(session)).toEqual(["model", "repair", "fallback"]);
    expect(session.session.done).toEqual(["ones", "tens"]);
    expect(lastMayaTurn(session).attempts[2].proposal).toMatchObject({
      act: "guide", step: "result", level: 0, parts: [{ line: "check.right_step", slots: { step: "tens" } }, { line: "step.invite", slots: { step: "result" } }],
    });
    const finals = TEMPLATES["invite.result"].map((w) => w.replace("{expr}", "27 + 39"));
    expect(finals.some((f) => said(out).endsWith(f))).toBe(true);
    expect(said(out)).not.toMatch(/\b66\b/);
  });
});

describe("the final answer and the final step (D-199)", () => {
  const answer = (value: number, step: string, verdict: "right" | "wrong") => ({ value: num(value), step, verdict });
  const lastMaya = (session: ReturnType<typeof scripted>["session"]) => {
    const turn = session.trace().turns.filter((t) => t.kind === "maya").at(-1);
    if (!turn || turn.kind !== "maya") throw new Error("no Maya turn");
    return turn;
  };

  it("accepts a right final answer followed by its explanation, with no confirmation (practice runs 9 and 10, F02, F06)", async () => {
    const accept = v2({ act: "accept_answer", parts: [{ line: "answer.right" }], reading: { start: "has_work", answers: [answer(66, "result", "right")] } });
    const { session, model } = scripted([OPEN, accept]);
    await session.start();
    const out = await session.child("So I got 66, because six tens and six ones.");
    // The model was offered the acceptance (the turn is not held for a confirmation), and it was not refused.
    expect(model.requests[1].offers.map((o) => o.act)).toContain("accept_answer");
    expect(lastMaya(session).attempts.map((a) => a.source)).toEqual(["model"]);
    expect(said(out)).toMatch(/27 \+ 39 = 66/);
    expect(session.session.lastResult).toBe("right");
  });

  it("gives the answer through code's fallback after two wrong final answers, when the model keeps asking the final question", async () => {
    const final = (value: number) => v2({ act: "guide", step: "result", level: 0, parts: [{ line: "step.invite", slots: { step: "result" } }], reading: { answers: [answer(value, "result", "wrong")] } });
    const { session } = scripted([
      OPEN,
      v2({ act: "guide", step: "tens", level: 0, parts: [{ line: "check.right_step", slots: { step: "ones" } }, { line: "step.invite", slots: { step: "tens" } }], reading: { answers: [answer(16, "ones", "right")] } }),
      v2({ act: "guide", step: "result", level: 0, parts: [{ line: "check.right_step", slots: { step: "tens" } }, { line: "step.invite", slots: { step: "result" } }], reading: { answers: [answer(6, "tens", "right")] } }),
      final(56),
      final(65),
      final(65),
      v2({ act: "close", parts: [{ line: "close.together" }] }),
    ]);
    await session.start();
    await session.child("Seven plus nine is sixteen.");
    await session.child("Two plus three plus one is six.");
    const once = await session.child("56?");
    expect(said(once)).not.toMatch(/\b66\b/);
    const out = await session.child("65?");
    expect(lastMaya(session).attempts.map((a) => [a.source, a.refusal?.code ?? null])).toEqual([["model", "act_not_allowed"], ["repair", "act_not_allowed"], ["fallback", null]]);
    expect(lastMaya(session).output?.act).toBe("give_answer");
    expect(said(out)).toMatch(/6 tens and 6 ones make 66\./);
    expect(said(out)).toMatch(/write 66 on your (paper|page)/i);
    expect(out.say.flatMap(sentences).every((x) => SAFE.has(x))).toBe(true);
    const end = await session.child("Okay.");
    expect(end.ended).toMatchObject({ reason: "solved", assistance: "answer_given", understanding: "uncertain", highestHint: 4 });
    expect(checkTrace(JSON.parse(JSON.stringify(session.trace()))).ok).toBe(true);
  });
});

describe("the clock and the end", () => {
  it("closes the call at its 10 minutes by the passed-in clock, and the trace has the outcome", async () => {
    const { session, advance } = scripted([OPEN, v2({ act: "guide", step: "ones", level: 0, parts: [{ line: "step.invite", slots: { step: "ones" } }] })]);
    await session.start();
    await session.child("I don't know.");
    advance(10 * 60);
    const out = await session.tick();
    expect(out.ended).toMatchObject({ reason: "time_limit" });
    const trace = session.trace();
    expect(trace.outcome).toMatchObject({ reason: "time_limit", seconds: 600 });
    expect(trace.endedAt).toBe(new Date(T0 + 600_000).toISOString());
  });

  it("holds a package that does not check and closes it as a content issue", async () => {
    const { session } = scripted([v2({ act: "close", parts: [{ warm: "closing" }] })], { ...PKG, answer: { value: num(56), accepted: [], unit: null } });
    const out = await session.start();
    expect(out.ended).toMatchObject({ reason: "content_issue" });
    expect(session.trace().question.hash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("finishes a call that never started: it is started, then ended, and the trace checks", async () => {
    const { session } = scripted([]);
    const trace = await session.finish();
    expect(checkTrace(trace)).toMatchObject({ ok: true });
    expect(trace.turns.map((t) => t.kind)).toEqual(["start", "technical"]);
    expect(trace.outcome).toMatchObject({ reason: "technical_issue", seconds: 0 });
    // A second finish changes nothing.
    expect(await session.finish({ detail: "again" })).toEqual(trace);
  });

  it("ends a hang-up as child_stopped, with a hang_up turn last and no technical turn (#323)", async () => {
    const { session, advance } = scripted([OPEN, v2({ act: "guide", step: "ones", level: 0, parts: [{ line: "step.invite", slots: { step: "ones" } }] })]);
    await session.start();
    advance(4);
    await session.child("I don't know.");
    advance(4);
    const trace = await session.finish({ reason: "child_stopped" });
    expect(checkTrace(JSON.parse(JSON.stringify(trace)))).toMatchObject({ ok: true });
    expect(trace.version).toBe(TRACE_VERSION);
    expect(trace.outcome).toMatchObject({ reason: "child_stopped", seconds: 8 });
    expect(trace.turns.at(-1)).toEqual({ kind: "hang_up", at: T0 + 8000 });
    expect(trace.turns.some((t) => t.kind === "technical")).toBe(false);
    // A second finish, of either kind, changes nothing.
    expect(await session.finish()).toEqual(trace);
  });

  it("keeps the outcome's priority on a hang-up: a call already solved stays solved", async () => {
    const { session, advance } = scripted([
      OPEN,
      v2({ act: "accept_answer", parts: [{ line: "answer.right" }, { line: "check.explain", slots: { step: "tens" } }], reading: { start: "has_work", answers: [{ value: num(66), step: "result", verdict: "right" }] } }),
    ]);
    await session.start();
    advance(4);
    await session.child("66");
    advance(4);
    const trace = await session.finish({ reason: "child_stopped" });
    expect(trace.outcome?.reason).toBe("solved");
    expect(trace.turns.at(-1)?.kind).toBe("hang_up");
    expect(checkTrace(JSON.parse(JSON.stringify(trace)))).toMatchObject({ ok: true });
  });

  it("still takes the older finish(detail, failed): a technical issue with that detail", async () => {
    const { session } = scripted([]);
    const trace = await session.finish("the script ended", true);
    expect(trace.outcome?.reason).toBe("technical_issue");
    expect(trace.turns.at(-1)).toMatchObject({ kind: "technical", detail: "the script ended", error: { code: "local" } });
  });

  it("hangs up a call that never started: started, then ended as child_stopped", async () => {
    const { session } = scripted([]);
    const trace = await session.finish({ reason: "child_stopped" });
    expect(trace.turns.map((t) => t.kind)).toEqual(["start", "hang_up"]);
    expect(trace.outcome).toMatchObject({ reason: "child_stopped", seconds: 0 });
  });
});

describe("inputs from the voice agent (#396)", () => {
  const GUIDE = v2({ act: "guide", step: "ones", level: 0, parts: [{ line: "check.not_yet", slots: { step: "result" } }, { line: "step.invite", slots: { step: "ones" } }], reading: { start: "has_work", answers: [{ value: num(56), step: "result", verdict: "wrong" }] } });
  const ACCEPT = v2({ act: "accept_answer", parts: [{ line: "answer.right" }], reading: { answers: [{ value: num(66), step: "result", verdict: "right" }] } });
  const CLOSE = v2({ act: "close", parts: [{ warm: "closing" }] });
  const checked = (t: unknown) => expect(checkTrace(JSON.parse(JSON.stringify(t)))).toMatchObject({ ok: true });

  it("a partial child turn stops Maya's output and is not judged; the full turn is", async () => {
    const { session, model } = scripted([OPEN, GUIDE, ACCEPT]);
    await session.start();
    await session.child("I got 56.");
    const partial = await session.partial("No, I meant");
    expect(partial).toMatchObject({ say: [], board: [], ended: null, cancelled: true });
    expect(model.requests).toHaveLength(2);
    const full = await session.child("No, I meant 66.");
    expect(full.cancelled).toBe(false);
    expect(model.requests[2].childTurn).toBe("No, I meant 66.");
    expect(said(full)).toMatch(/27 \+ 39 = 66/);
    const trace = session.trace();
    expect(trace.turns.map((t) => t.kind)).toEqual(["start", "maya", "child", "maya", "partial", "child", "maya"]);
    expect(trace.turns[4]).toMatchObject({ kind: "partial", text: "No, I meant", cancelled: true });
    checked(trace);
  });

  it("words Maya said that are not her text stop her output and start a repair, then the teaching goes on", async () => {
    const REPAIR = v2({ act: "repair", parts: [{ line: "repair.sorry" }] });
    const { session, model } = scripted([OPEN, GUIDE, REPAIR, ACCEPT]);
    await session.start();
    await session.child("I got 56.");
    const out = await session.mayaSaid("Seven plus nine is fifteen.");
    expect(out.cancelled).toBe(true);
    expect(model.requests[2].state).toBe("REPAIR_MAYA");
    expect(model.requests[2].offers.map((o) => o.act)).toEqual(["repair"]);
    expect(out.say.flatMap(sentences).every((x) => SAFE.has(x))).toBe(true);
    expect(session.session.state).toBe("GUIDE_TARGET");
    expect(said(await session.child("66."))).toMatch(/27 \+ 39 = 66/);
    const trace = session.trace();
    expect(trace.turns.filter((t) => t.kind === "maya").map((t) => t.kind === "maya" && t.output?.act)).toEqual(["open", "guide", "repair", "accept_answer"]);
    expect(trace.turns.find((t) => t.kind === "maya_said")).toMatchObject({ text: "Seven plus nine is fifteen.", cancelled: true });
    checked(trace);
  });

  it("Maya's approved text changes nothing: no stop, no repair, no model call", async () => {
    const { session, model } = scripted([OPEN, GUIDE]);
    await session.start();
    const guide = await session.child("I got 56.");
    const out = await session.mayaSaid(said(guide));
    expect(out).toMatchObject({ say: [], cancelled: false });
    expect(model.requests).toHaveLength(2);
    expect(session.trace().turns.at(-1)).toMatchObject({ kind: "maya_said", cancelled: false });
    checked(session.trace());
  });

  it("a content problem in the middle of teaching: no more teaching, a close, content_issue", async () => {
    const { session, model } = scripted([OPEN, GUIDE, CLOSE]);
    await session.start();
    await session.child("I got 56.");
    const out = await session.contentProblem("the answer key and the worked steps disagree");
    expect(out.cancelled).toBe(true);
    expect(model.requests[2].offers.map((o) => o.act)).toEqual(["close"]);
    expect(out.ended).toMatchObject({ reason: "content_issue" });
    const trace = session.trace();
    expect(trace.turns.find((t) => t.kind === "content_problem")).toMatchObject({ detail: "the answer key and the worked steps disagree", cancelled: true });
    checked(trace);
  });

  it("a content problem found while Maya gives the safety guidance: taken before her next turn, and the outcome stays safety", async () => {
    const SAFETY = v2({ act: "safety", parts: [], reading: { safety: "concern" } });
    const { session } = scripted([OPEN, () => {
      void session.contentProblem("the answer key and the worked steps disagree");
      return SAFETY;
    }, CLOSE]);
    await session.start();
    const out = await session.child("Someone at home hurts me.");
    expect(said(out)).toContain(SAFETY_GUIDANCE.concern);
    expect(out.ended).toMatchObject({ reason: "safety", safetyFlag: true });
    const trace = session.trace();
    // The content input arrived before the safety reading. Both inputs precede delivered guidance.
    expect(trace.turns.map((x) => x.kind)).toEqual(["start", "maya", "child", "content_problem", "maya", "maya"]);
    expect(trace.turns[3]).toMatchObject({ kind: "content_problem", cancelled: true });
    checked(trace);
  });

  it("R424-1: drops teaching and board output when content fails during a guide proposal", async () => {
    const { session } = scripted([OPEN, () => {
      void session.contentProblem("the answer key and the worked steps disagree");
      return { ...GUIDE, draw: [{ offer: "question.columns" }] };
    }, CLOSE]);
    await session.start();
    const out = await session.child("I got 56.");
    expect(out).toMatchObject({ cancelled: true, board: [], ended: { reason: "content_issue" } });
    const trace = session.trace();
    expect(out.say).toEqual(trace.turns.flatMap((t) => t.kind === "maya" && t.output?.act === "close" ? t.output.say : []));
    expect(trace.turns.flatMap((t) => t.kind === "maya" ? [t.output?.act] : [])).toEqual(["open", "close"]);
    expect(trace.board).toEqual([]);
    checked(trace);
  });

  it("R424-1: removes earlier buffered example turns when a later proposal finds a content problem", async () => {
    const base = ruleMayaModel();
    let calls = 0;
    const model = { ...base, propose: async (...args: Parameters<typeof base.propose>) => {
      if (++calls === 3) void session.contentProblem("the worked example is wrong");
      return base.propose(...args);
    } };
    const session = createTextSession({ callId: "buffered-example", package: PKG, model, clock: () => T0, random: 7 });
    await session.start();
    const out = await session.child("I don't know how to start.");
    expect(out).toMatchObject({ cancelled: true, board: [], ended: { reason: "content_issue", assistance: "independent" } });
    expect(session.trace().turns.flatMap((t) => t.kind === "maya" ? [t.output?.act] : [])).toEqual(["open", "close"]);
    expect(session.trace().board).toEqual([]);
    checked(session.trace());
  });

  it.each(["resolve", "reject"])("R424-2: a partial cancels a pending proposal before its late %s", async (settle) => {
    const entered = Promise.withResolvers<void>();
    const pending = Promise.withResolvers<unknown>();
    const base = fakeMayaModel({ answer: (input) => input.offers.some((o) => o.act === "open") ? OPEN : ACCEPT });
    let calls = 0;
    const model = { ...base, propose: async (...args: Parameters<typeof base.propose>) => {
      if (++calls === 2) { entered.resolve(); return pending.promise; }
      return base.propose(...args);
    } };
    const options = { callId: "partial-pending", package: PKG, model, clock: () => T0, random: 7 };
    const session = createTextSession(options);
    await session.start();
    const child = session.child("I got 56.");
    await entered.promise;
    // The model cannot finish until after both input results have returned. A queue wait fails this test.
    try {
      expect(await session.partial("No, I meant")).toMatchObject({ cancelled: true, say: [], board: [] });
      expect(await child).toMatchObject({ cancelled: true, say: [], board: [] });
      const saved = JSON.parse(JSON.stringify(await session.saved()));
      const resumed = createTextSession({ ...options, resume: saved });
      const next = await session.child("No, I meant 66.");
      expect(await resumed.child("No, I meant 66.")).toEqual(next);
      expect(said(next)).toContain("27 + 39 = 66");
      expect(base.requests.at(-1)?.childTurn).toBe("No, I meant 66.");
      expect(session.trace().turns.filter((t) => t.kind === "maya")).toHaveLength(2);
      const before = session.trace();
      if (settle === "resolve") pending.resolve({ ...GUIDE, draw: [{ offer: "question.columns" }] });
      else pending.reject(new Error("late model error"));
      await Promise.resolve();
      await Promise.resolve();
      expect(session.trace()).toEqual(before);
      expect(resumed.trace()).toEqual(before);
      checked(before);
    } finally { pending.resolve(GUIDE); }
  }, 1000);

  it("R424-2: cancels during a free-talk review, with no late turn or state change", async () => {
    const entered = Promise.withResolvers<void>();
    const pending = Promise.withResolvers<{ verdict: "pass" }>();
    const { model } = scripted([OPEN, v2({ act: "redirect", reading: { offTopic: true }, parts: [{ talk: "Thanks for telling me." }] }), ACCEPT]);
    const reviewer = { id: "held-review", promptVersion: "test", review: async () => { entered.resolve(); return pending.promise; } };
    const session = createTextSession({ callId: "partial-review", package: PKG, model, reviewer, freeTalk: true, clock: () => T0 });
    await session.start();
    const child = session.child("I have a dog.");
    await entered.promise;
    try {
      expect(await session.partial("No, I meant")).toMatchObject({ cancelled: true, say: [] });
      expect(await child).toMatchObject({ cancelled: true, say: [], board: [] });
      await session.child("66.");
      const before = session.trace();
      pending.resolve({ verdict: "pass" });
      await Promise.resolve();
      await Promise.resolve();
      expect(session.trace()).toEqual(before);
      expect(before.turns.filter((t) => t.kind === "maya")).toHaveLength(2);
      checked(before);
    } finally { pending.resolve({ verdict: "pass" }); }
  }, 1000);

  it("R424-2: a partial invalidates an input queued before it, with no delay", async () => {
    const { session, model } = scripted([OPEN, ACCEPT]);
    await session.start();
    const child = session.child("56.");
    expect(await session.partial("No, I meant")).toMatchObject({ cancelled: true });
    expect(await child).toMatchObject({ cancelled: true, say: [], board: [] });
    expect(model.requests).toHaveLength(1);
    expect(said(await session.child("66."))).toContain("27 + 39 = 66");
    checked(session.trace());
  });

  it("R424-2: a provider that signals the partial itself cannot commit or leak its rejection", async () => {
    const model = fakeMayaModel({ answer: (_input, n) => {
      if (n === 0) return OPEN;
      void session.partial("No, I meant");
      throw new Error("a cancelled provider error");
    } });
    const session = createTextSession({ callId: "provider-partial", package: PKG, model, clock: () => T0 });
    await session.start();
    expect(await session.child("56.")).toMatchObject({ cancelled: true, say: [], board: [] });
    expect(session.trace().turns.filter((t) => t.kind === "maya")).toHaveLength(1);
    checked(session.trace());
  });

  it.each([false, true])("R424-3: each approved example utterance is accepted once, with resume %s", async (resume) => {
    const options = { callId: "approved-batch", package: PKG, model: ruleMayaModel(), clock: () => T0, random: 7 };
    let session = createTextSession(options);
    await session.start();
    const out = await session.child("I don't know how to start.");
    expect(out.say).toHaveLength(3);
    const count = session.trace().turns.filter((t) => t.kind === "maya").length;
    for (const text of out.say) {
      const saved = JSON.parse(JSON.stringify(await session.saved()));
      const before = JSON.stringify(saved);
      if (resume) session = createTextSession({ ...options, resume: saved });
      expect(await session.mayaSaid(text)).toMatchObject({ cancelled: false, say: [], board: [] });
      expect(JSON.stringify(saved)).toBe(before);
    }
    expect(session.trace().turns.filter((t) => t.kind === "maya")).toHaveLength(count);
    // Consumed speech is not an approval for another utterance.
    expect((await session.mayaSaid(out.say.at(-1)!)).cancelled).toBe(true);
    checked(session.trace());
  });

  it.each([false, true])("R424-4: records content raised during a close, safety %s", async (safety) => {
    const { session } = scripted([OPEN, ...(safety ? [v2({ act: "safety", parts: [], reading: { safety: "concern" } })] : []), () => {
      void session.contentProblem("the answer key and the worked steps disagree");
      return { ...CLOSE, reading: { stop: true } };
    }, CLOSE]);
    await session.start();
    const out = await session.child(safety ? "Someone at home hurts me." : "I want to stop.");
    expect(out.ended).toMatchObject({ reason: safety ? "safety" : "content_issue", safetyFlag: safety });
    if (safety) expect(out.say).toContain(SAFETY_GUIDANCE.concern);
    const trace = session.trace();
    expect(trace.turns.filter((t) => t.kind === "content_problem")).toEqual([
      { kind: "content_problem", at: T0, detail: "the answer key and the worked steps disagree", cancelled: !safety },
    ]);
    checked(trace);
  });

  it("writes the child's name as {name} in partial turns and in what Maya said", async () => {
    let now = T0;
    const model = fakeMayaModel({ answer: (_input, n) => [OPEN, GUIDE, v2({ act: "repair", parts: [{ line: "repair.sorry" }] })][n] });
    const session = createTextSession({ callId: "call-n", package: PKG, model, clock: () => now, random: 7, childName: "Ava" });
    await session.start();
    now += 1000;
    await session.child("I got 56.");
    await session.partial("Ava says no");
    await session.mayaSaid("Ava, seven plus nine is fifteen.");
    const kinds = session.trace().turns.flatMap((x) => (x.kind === "partial" || x.kind === "maya_said" ? [x.text] : []));
    expect(kinds).toEqual(["{name} says no", "{name}, seven plus nine is fifteen."]);
  });
});

/** A finished, valid trace with a board batch, to break one field at a time. */
async function validTrace() {
  const { session } = scripted([
    OPEN,
    v2({ act: "guide", step: "ones", level: 0, parts: [{ line: "step.invite", slots: { step: "ones" } }], draw: [{ offer: "question.columns" }] }),
  ]);
  await session.start();
  await session.child("I don't know.");
  const trace = JSON.parse(JSON.stringify(await session.finish())) as Record<string, unknown> & { turns: Record<string, unknown>[] };
  expect(checkTrace(trace)).toMatchObject({ ok: true });
  return trace;
}
/** A bank phrase with no slot: what a free-talk piece that failed a check becomes. */
const BANK0 = Object.values(PHRASES).flat().find((p) => !p.includes("{"))!;
const mayaAt = (t: { turns: Record<string, unknown>[] }) => t.turns.findIndex((x) => x.kind === "maya" && Array.isArray((x.output as { board?: unknown[] } | null)?.board) && (x.output as { board: unknown[] }).board.length > 0);

describe("checkTrace refuses a trace that is not this version's shape", () => {
  const cases: [string, (t: Awaited<ReturnType<typeof validTrace>>) => void, RegExp][] = [
    ["a null attempt", (t) => { t.turns[mayaAt(t)].attempts = [null]; }, /attempts\[0\]/],
    ["no attempts", (t) => { t.turns[mayaAt(t)].attempts = []; }, /attempts/],
    ["an attempt of an unknown source", (t) => { (t.turns[mayaAt(t)].attempts as Record<string, unknown>[])[0].source = "guess"; }, /source/],
    ["a refusal with a bad act", (t) => { (t.turns[mayaAt(t)].attempts as Record<string, unknown>[])[0].refusal = { code: "x", reason: "y", allowed: ["fly"] }; }, /allowed/],
    ["output from a refused attempt", (t) => { (t.turns[mayaAt(t)].attempts as Record<string, unknown>[])[0].refusal = { code: "x", reason: "y", allowed: [] }; }, /output/],
    ["no output field", (t) => { delete t.turns[mayaAt(t)].output; }, /output/],
    ["an output act that is not an act", (t) => { (t.turns[mayaAt(t)].output as Record<string, unknown>).act = "sing"; }, /output\.act/],
    ["no state", (t) => { delete t.turns[mayaAt(t)].state; }, /state/],
    ["no stateAfter", (t) => { t.turns[mayaAt(t)].stateAfter = "NAP"; }, /stateAfter/],
    ["a child turn with no text", (t) => { delete t.turns.find((x) => x.kind === "child")!.text; }, /text/],
    ["an unknown turn kind", (t) => { t.turns[0].kind = "dance"; }, /kind/],
    ["turns out of order", (t) => { t.turns[1].at = 0; }, /at/],
    ["a null board batch", (t) => { (t.board as unknown[])[0] = null; }, /board\[0\]/],
    ["a board batch of no Maya turn", (t) => { (t.board as Record<string, unknown>[])[0].turn = 0; }, /board\[0\]\.turn/],
    ["a batch no output sent", (t) => { (t.turns[mayaAt(t)].output as { board: string[] }).board = []; }, /transactionId/],
    ["an output batch missing from the board list", (t) => { t.board = []; }, /output\.board/],
    ["no counts", (t) => { delete t.counts; }, /counts/],
    ["counts that do not match the turns", (t) => { (t.counts as Record<string, number>).mayaTurns += 1; }, /counts\.mayaTurns/],
    ["a hash with no digest", (t) => { (t.question as Record<string, unknown>).hash = "sha256:"; }, /question\.hash/],
    ["a hash that is not hex", (t) => { (t.question as Record<string, unknown>).hash = `sha256:${"z".repeat(64)}`; }, /question\.hash/],
    ["no model id", (t) => { (t.model as Record<string, unknown>).id = ""; }, /model/],
    ["no versions", (t) => { delete t.versions; }, /versions/],
    ["an unknown runner", (t) => { t.runner = "phone"; }, /runner/],
    ["an outcome reason that is not one", (t) => { (t.outcome as Record<string, unknown>).reason = "bored"; }, /outcome\.reason/],
    ["an outcome with no mishearing counts", (t) => { delete (t.outcome as Record<string, unknown>).mishearing; }, /mishearing/],
    ["an end time with no outcome", (t) => { t.outcome = null; }, /endedAt/],
    ["an end time that is not ISO", (t) => { t.endedAt = "yesterday"; }, /endedAt/],
    ["another version", (t) => { t.version = 99; }, /version/],
    ["freeTalk missing", (t) => { delete t.freeTalk; }, /freeTalk/],
    ["an attempt after an accepted one (the accepted opening twice)", (t) => { const a = t.turns.find((x) => x.kind === "maya")!.attempts as unknown[]; a.push(structuredClone(a[0])); }, /attempts/],
    ["a fallback after an accepted model proposal", (t) => { const a = t.turns.find((x) => x.kind === "maya")!.attempts as unknown[]; a.push({ source: "fallback", proposal: OPEN, refusal: null }); }, /attempts\[0\]/],
    ["a repair after a model error", (t) => { t.turns.find((x) => x.kind === "maya")!.attempts = [{ source: "model", proposal: null, refusal: null, error: { code: "unknown", message: ERROR_MESSAGES.unknown } }, { source: "repair", proposal: OPEN, refusal: null }]; }, /attempts\[1\]/],
    ["a fallback first", (t) => { (t.turns.find((x) => x.kind === "maya")!.attempts as Record<string, unknown>[])[0].source = "fallback"; }, /attempts/],
    ["two repairs", (t) => { const refused = { source: "model", proposal: OPEN, refusal: { code: "x", reason: "y", allowed: [] } }; t.turns.find((x) => x.kind === "maya")!.attempts = [refused, { ...refused, source: "repair" }, { ...refused, source: "repair" }, { source: "fallback", proposal: OPEN, refusal: null }]; }, /attempts/],
    ["an error that is text", (t) => { t.turns.find((x) => x.kind === "maya")!.attempts = [{ source: "model", proposal: null, refusal: null, error: "OpenRouter answered 401: sk-abc" }, { source: "fallback", proposal: OPEN, refusal: null }]; }, /attempts\[0\]\.error/],
    ["an error code not in the list", (t) => { t.turns.find((x) => x.kind === "maya")!.attempts = [{ source: "model", proposal: null, refusal: null, error: { code: "leak", message: ERROR_MESSAGES.unknown } }, { source: "fallback", proposal: OPEN, refusal: null }]; }, /error\.code/],
    ["an error message that is not the code's", (t) => { t.turns.find((x) => x.kind === "maya")!.attempts = [{ source: "model", proposal: null, refusal: null, error: { code: "http_401", message: "bad key sk-abc" } }, { source: "fallback", proposal: OPEN, refusal: null }]; }, /error\.message/],
    ["an error with another field", (t) => { t.turns.find((x) => x.kind === "maya")!.attempts = [{ source: "model", proposal: null, refusal: null, error: { code: "unknown", message: ERROR_MESSAGES.unknown, raw: "sk-abc" } }, { source: "fallback", proposal: OPEN, refusal: null }]; }, /error/],
    ["an error status the code does not allow", (t) => { t.turns.find((x) => x.kind === "maya")!.attempts = [{ source: "model", proposal: null, refusal: null, error: { code: "http_401", message: ERROR_MESSAGES.http_401, status: 500 } }, { source: "fallback", proposal: OPEN, refusal: null }]; }, /error\.status/],
    ["a technical turn whose error is text", (t) => { t.turns.push({ kind: "technical", at: Number(t.turns.at(-1)!.at), detail: "x", error: "ENOENT /home/key" }); }, /error/],
    ["a hang-up that is not the last turn", (t) => { const at = Number(t.turns.at(-1)!.at); t.turns[t.turns.length - 1] = { kind: "hang_up", at }; t.turns.push({ kind: "tick", at }); (t.outcome as Record<string, unknown>).reason = "child_stopped"; }, /hang-up only as the last turn/],
    ["a hang-up in a version 1 trace", (t) => { t.version = 1; delete t.reviewer; t.turns[t.turns.length - 1] = { kind: "hang_up", at: Number(t.turns.at(-1)!.at) }; (t.outcome as Record<string, unknown>).reason = "child_stopped"; }, /version 1/],
    ["a hang-up that ended as a technical issue", (t) => { t.turns[t.turns.length - 1] = { kind: "hang_up", at: Number(t.turns.at(-1)!.at) }; }, /outcome\.reason/],
    ["a reviewer in a version 2 trace", (t) => { t.version = 2; t.reviewer = { id: "x", promptVersion: "y" }; }, /reviewer/],
    ["a reviewer with another field", (t) => { t.reviewer = { id: "x", promptVersion: "y", key: "sk-1" }; }, /reviewer/],
    ["free talk on a refused attempt", (t) => { (t.turns[mayaAt(t)].attempts as Record<string, unknown>[])[0].talk = [{ proposed: "Hi!", code: null, review: "pass", shown: "Hi!" }]; (t.turns[mayaAt(t)].attempts as Record<string, unknown>[]).unshift({ source: "model", proposal: {}, refusal: { code: "x", reason: "y", allowed: [] }, talk: [{ proposed: "Hi!", code: null, review: "pass", shown: "Hi!" }] }); }, /talk|attempts/],
    ["free talk shown after a failed review", (t) => { (t.turns[mayaAt(t)].attempts as Record<string, unknown>[])[0].talk = [{ proposed: "I have a dog!", code: null, review: "fail", rules: ["untrue_self"], reason: "no dog", shown: "I have a dog!" }]; }, /shown/],
    ["free talk reviewed after the code guards failed", (t) => { (t.turns[mayaAt(t)].attempts as Record<string, unknown>[])[0].talk = [{ proposed: "Keep going.", code: "keep", review: "pass", shown: BANK0 }]; }, /review/],
    ["a failed review with an unknown rule", (t) => { (t.turns[mayaAt(t)].attempts as Record<string, unknown>[])[0].talk = [{ proposed: "Hi!", code: null, review: "fail", rules: ["rude"], reason: "x", shown: BANK0 }]; }, /rules/],
    ["free talk in a version 2 trace", (t) => { t.version = 2; delete t.reviewer; (t.turns[mayaAt(t)].attempts as Record<string, unknown>[])[0].talk = [{ proposed: "Hi!", code: null, review: "pass", shown: "Hi!" }]; }, /version 3/],
    ["a partial turn that did not stop Maya's output", (t) => { t.turns.push({ kind: "partial", at: Number(t.turns.at(-1)!.at), text: "No", cancelled: false }); }, /cancelled/],
    ["what Maya said with no text", (t) => { t.turns.push({ kind: "maya_said", at: Number(t.turns.at(-1)!.at), cancelled: true }); }, /text/],
    ["a content problem with no cancelled flag", (t) => { t.turns.push({ kind: "content_problem", at: Number(t.turns.at(-1)!.at), detail: "x" }); }, /cancelled/],
    ["a partial turn in a version 3 trace", (t) => { t.version = 3; t.turns.push({ kind: "partial", at: Number(t.turns.at(-1)!.at), text: "No", cancelled: true }); }, /version 4/],
    ["no output after an accepted last attempt", (t) => { const m = t.turns.find((x) => x.kind === "maya" && x.output !== null && (x.output as { board: unknown[] }).board.length === 0)!; m.output = null; }, /output/],
  ];
  for (const [name, breakIt, path] of cases) {
    it(`refuses ${name}`, async () => {
      const t = await validTrace();
      breakIt(t);
      const r = checkTrace(t);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toMatch(path);
    });
  }

  it("reads a version 1 trace, a version 2 hang-up and a version 3 trace", async () => {
    const t = await validTrace();
    expect(checkTrace({ ...t, version: 3 })).toMatchObject({ ok: true });
    const { reviewer: _reviewer, ...old } = t;
    void _reviewer;
    expect(checkTrace({ ...old, version: 1 })).toMatchObject({ ok: true });
    expect(checkTrace({ ...old, version: 2 })).toMatchObject({ ok: true });
    t.turns[t.turns.length - 1] = { kind: "hang_up", at: Number(t.turns.at(-1)!.at) };
    (t.outcome as Record<string, unknown>).reason = "child_stopped";
    expect(checkTrace(t)).toMatchObject({ ok: true });
  });

  it("takes every committed sample trace", async () => {
    const { readdirSync, readFileSync } = await import("node:fs");
    const dir = "docs/maya-traces";
    const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) expect(checkTrace(JSON.parse(readFileSync(`${dir}/${f}`, "utf8"))), f).toMatchObject({ ok: true });
  });
});

describe("the trace keeps the child's name and secrets out", () => {
  it("writes the profile name as {name} in child turns, Maya's words and proposals, and removes keys from errors", async () => {
    let now = T0;
    let n = 0;
    const model = fakeMayaModel({
      answer: () => {
        n += 1;
        if (n === 2) throw new Error("OpenRouter answered 401 for Bearer sk-or-v1-0123456789abcdef0123456789abcdef");
        return n === 1 ? OPEN : v2({ act: "guide", step: "ones", level: 0, parts: [{ warm: "pets", echo: "Leah" }, { line: "step.invite", slots: { step: "ones" } }] });
      },
    });
    const session = createTextSession({ callId: "name-1", package: PKG, model, clock: () => (now += 1000), childName: "Leah", random: 2 });
    await session.start();
    await session.child("I'm Leah and my dog is LEAH's friend. I don't know.");
    await session.child("Leah is stuck.");
    const trace = await session.finish();
    const json = JSON.stringify(trace);
    expect(json).not.toMatch(/leah/i);
    expect(json).not.toMatch(/sk-or-v1|Bearer/);
    expect(json).toContain(JSON.stringify(ERROR_MESSAGES.http_401));
    expect(trace.turns.find((t) => t.kind === "child")).toMatchObject({ text: "I'm {name} and my dog is {name}'s friend. I don't know." });
    expect(checkTrace(trace)).toMatchObject({ ok: true });
  });
});

/**
 * Secrets in every shape the redaction must catch. None is a real key; the prefixes are joined at run time so the
 * file holds no key-shaped text (GitHub push protection reads it as a leaked key).
 */
const fake = (...parts: string[]) => parts.join("");
const STRIPE_LIKE = fake("sk", "_live_", "1234567890abcdefghijklmnop");
const SECRET_SAMPLES = [
  STRIPE_LIKE,
  fake("sk", "-or-v1-", "0123456789abcdef0123456789abcdef0123456789abcdef"),
  fake("sk", "-ant-api03-", "AbCdEfGhIjKlMnOp"),
  fake("rk", "_test_", "51Habcdefghijk"),
  fake("pk", "_live_", "9876543210zyxw"),
  fake("wh", "sec_", "c2VjcmV0c2VjcmV0"),
  "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJtYXlhIn0.c2lnbmF0dXJlc2ln",
  "0123456789abcdef0123456789abcdef0123",
  "QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo0123+/",
];
const SECRET_CONTEXTS = [
  (x: string) => `bad key ${x}`,
  (x: string) => `Authorization: Bearer ${x}`,
  (x: string) => `authorization=${x}`,
  (x: string) => `GET https://openrouter.ai/x?api_key=${x}&b=1`,
  (x: string) => `GET /v1?key=${x}`,
  (x: string) => `token: ${x}`,
];
const CONFIGURED = "Zq!9 p@ss~word#7";

describe("redactText", () => {
  it("leaves words that only contain the name, and an empty name, alone", () => {
    expect(redactText("Ann went to Annapolis with Ann.", "Ann")).toBe("{name} went to Annapolis with {name}.");
    expect(redactText("Hi there", "")).toBe("Hi there");
  });

  it("removes keys of every shape, in every context, and a configured key whatever its shape", () => {
    expect(redactText(`bad key ${STRIPE_LIKE}`, null, [])).toBe("bad key [secret]");
    for (const x of SECRET_SAMPLES) for (const ctx of SECRET_CONTEXTS) {
      const out = redactText(ctx(x), null, []);
      expect(out, ctx(x)).not.toContain(x);
      expect(out, ctx(x)).toContain("[secret]");
    }
    // A short opaque value after "Bearer", "key=" or an Authorization header.
    for (const t of ["Bearer abc.def", "Authorization: Basic dXNlcjpwYXNz", "url?key=shortone", "api_key: hunter22"]) expect(redactText(t, null, [])).not.toMatch(/abc\.def|dXNlcjpwYXNz|shortone|hunter22/);
    expect(redactText(`OpenRouter said: ${CONFIGURED} is wrong`, null, [CONFIGURED])).toBe("OpenRouter said: [secret] is wrong");
    expect(configuredSecrets({ OPENROUTER_API_KEY: ` ${CONFIGURED} ` })).toEqual([CONFIGURED]);
  });

  it("leaves Maya's code-written sentences as they are", () => {
    for (const x of [...allLineTexts(PKG, [num(56)]), ...Object.values(PHRASES).flat()]) expect(redactText(x, null, [])).toBe(x);
  });
});

describe("a trace never stores an error's own text (R382-3-1)", () => {
  afterEach(() => vi.unstubAllEnvs());

  /** Key shapes no pattern list can be sure of: encoded, split by a newline or by a literal "\n", escaped. */
  const shapes = (k: string) => [
    k,
    encodeURIComponent(k).replace(/_/g, "%5F").replace(/-/g, "%2D"),
    `${k.slice(0, 6)}\n${k.slice(6)}`,
    `${k.slice(0, 6)}\\n${k.slice(6)}`,
    JSON.stringify(JSON.stringify(k)),
    k.split("").join("​"),
    Buffer.from(k).toString("base64"),
    [...k].reverse().join(""),
  ];

  it("keeps only fixed codes and their wording from model errors that hold keys in every shape", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", CONFIGURED);
    const keys = [...SECRET_SAMPLES, CONFIGURED];
    const payloads = keys.flatMap(shapes);
    const statuses = ["401", "403", "429", "500", "400 schema", "418"];
    const errors = payloads.map((p, i) => (i % 3 === 0 ? `OpenRouter answered ${statuses[(i / 3) % statuses.length]}: ${p}` : i % 3 === 1 ? `OpenRouter could not be reached: ${p}` : p));
    let now = T0;
    let n = 0;
    const model = fakeMayaModel({
      answer: (input) => {
        if (input.offers.some((o) => o.act === "open")) return OPEN;
        throw new Error(errors[n++ % errors.length]);
      },
    });
    const raw: unknown[] = [];
    // A fresh call for each pair of model failures keeps the full error matrix binding.
    // A single call now ends after H3, so later payloads would otherwise never reach the adapter.
    const traces = [];
    for (let i = 0; i < errors.length; i += 2) {
      const session = createTextSession({ callId: `secret-${i}`, package: PKG, model, clock: () => (now += 500), random: 4, onError: (e) => raw.push(e) });
      await session.start();
      await session.child("I don't know.");
      traces.push(await session.finish());
    }
    const json = JSON.stringify(traces);

    // Every error field is a known code with its fixed wording; the raw errors went only to the debug hook.
    const errorFields = traces.flatMap(trace => trace.turns.flatMap((t) => (t.kind === "maya" ? t.attempts.flatMap((a) => (a.error ? [a.error] : [])) : [])));
    expect(errorFields.length).toBeGreaterThanOrEqual(30);
    for (const e of errorFields) expect(e).toEqual({ code: e.code, message: ERROR_MESSAGES[e.code], ...(e.status !== undefined ? { status: e.status } : {}) });
    expect(new Set(errorFields.map((e) => e.code))).toEqual(new Set(["http_401", "http_403", "http_429", "http_5xx", "schema_invalid", "http_4xx", "network", "unknown"]));
    expect(raw.length).toBe(errorFields.length);
    for (const p of payloads) expect(json, p).not.toContain(p);
    for (const k of keys) for (const piece of [k.slice(0, 10), k.slice(-10)]) expect(json, piece).not.toContain(piece);
    expect(json).not.toMatch(/OpenRouter (answered|could not)/);
    for (const trace of traces) expect(checkTrace(trace)).toMatchObject({ ok: true });
  });

  it("classifies the AI client's errors into fixed codes, keeping only the status", () => {
    const cases: [string, string, number?][] = [
      ["OpenRouter answered 401: Missing Authentication header", "http_401", 401],
      ["OpenRouter answered 403: no", "http_403", 403],
      ["OpenRouter answered 408: slow", "http_408", 408],
      ["OpenRouter answered 429: rate limited", "http_429", 429],
      ["OpenRouter answered 400: response_format json_schema is invalid", "schema_invalid", 400],
      ["OpenRouter answered 404: no such model", "http_4xx", 404],
      ["OpenRouter answered 502: bad gateway", "http_5xx", 502],
      ["OpenRouter error 503: overloaded", "http_5xx", 503],
      ["time is up", "timeout"],
      ["OpenRouter did not answer in time (60000 ms)", "timeout"],
      ["OpenRouter could not be reached: ECONNRESET", "network"],
      ["the output is not valid JSON", "bad_json"],
      ["OpenRouter answered 200 with a body that is not JSON", "bad_json"],
      ["the model refused", "refused_by_provider"],
      ["the model stopped: length (max_tokens)", "cut_off"],
      ["no output", "no_output"],
      ["OpenRouter answered with no choices", "no_output"],
      ["something else", "unknown"],
    ];
    for (const [text, code, status] of cases) expect(classifyError(new Error(text), "model"), text).toEqual({ code, message: ERROR_MESSAGES[code as ErrorCode], ...(status ? { status } : {}) });
    expect(classifyError(new Error("OpenRouter answered 401: sk-xyz"), "local")).toEqual({ code: "local", message: ERROR_MESSAGES.local });
    expect(classifyError("not an error", "model")).toEqual({ code: "unknown", message: ERROR_MESSAGES.unknown });
  });
});

describe("the OpenRouter model", () => {
  it("sends the session's offers with the proposal schema, and its proposal goes through the same checks", async () => {
    const client = fakeAiClient({ model: "anthropic/claude-sonnet-5.5", answer: () => ({ ...OPEN, reading: null, step: null, level: null, understanding: null, draw: null, board: null, parts: [{ line: "open.hello", slots: { step: null, sentence: null, heard: null, other: null } }] }) });
    let now = T0;
    const session = createTextSession({ callId: "or-1", package: PKG, model: aiMayaModel(client), clock: () => (now += 1000) });
    const out = await session.start();
    expect(said(out)).toMatch(/\bAI\b/);
    const [request] = client.requests;
    expect(request).toMatchObject({ name: "maya_proposal", system: SYSTEM_PROMPT });
    expect(request.schema).not.toHaveProperty("$schema");
    expect(request.schema).toMatchObject({ type: "object", required: expect.arrayContaining(["version", "act", "parts", "draw"]) });
    const input = JSON.parse((request.content[0] as { text: string }).text) as ModelInput;
    expect(input.offers.map((o) => o.act)).toEqual(["open"]);
    expect(input.offers[0].lines.map((l) => l.line)).toContain("open.hello");
    expect(session.trace().model).toEqual({ id: "anthropic/claude-sonnet-5.5", promptVersion: PROMPT_VERSION });
    // The answer and the steps are in the input, so the model can judge; code still checks every verdict.
    expect(valuesIn(JSON.stringify(input.question))).toEqual(expect.arrayContaining([num(66)]));
  });
});

describe("a text session saved and resumed between inputs (#323)", () => {
  // scripts/maya-text/no-start.txt: the easier example, then the child's own question with hints.
  const TURNS = ["I don't know how to start.", "Okay.", "Is it 56?", "Can you help me?", "16", "66", "Because the ones made a ten, so I carried it.", "I wrote it."];

  async function run(resumeEachTurn: boolean) {
    let now = T0;
    const options = { callId: "call-r", package: PKG, model: ruleMayaModel(), clock: () => now, random: 11, childName: "Leah" };
    let session = createTextSession(options);
    const said: string[][] = [];
    said.push((await session.start()).say);
    for (const text of TURNS) {
      if (session.ended) break;
      now += 4000;
      if (resumeEachTurn) {
        // The saved state goes through JSON, as it does through the database.
        const saved = JSON.parse(JSON.stringify(await session.saved()));
        session = createTextSession({ ...options, resume: saved });
      }
      const out = await session.child(text);
      said.push(out.say, out.board.map((b) => b.transactionId));
    }
    return { said, trace: await session.finish() };
  }

  it("says and records the same as a session that never stopped", async () => {
    const straight = await run(false);
    const resumed = await run(true);
    expect(resumed.said).toEqual(straight.said);
    expect(resumed.trace).toEqual(straight.trace);
    expect(checkTrace(resumed.trace).ok).toBe(true);
    expect(resumed.trace.board.length).toBeGreaterThan(0);
    expect(resumed.trace.outcome?.reason).toBe("solved");
  });

  it("refuses a saved state from another call", async () => {
    const first = createTextSession({ callId: "call-a", package: PKG, model: ruleMayaModel(), clock: () => T0 });
    await first.start();
    const saved = await first.saved();
    expect(() => createTextSession({ callId: "call-b", package: PKG, model: ruleMayaModel(), clock: () => T0, resume: saved })).toThrow(/not this call's/);
  });
});

describe("the prompt names only real lines and groups (practice runs 6 and 7)", () => {
  it("tells the model the act for a right step, the easier example's intro and the back phrase, by ids that exist", () => {
    const lineIds = [...SYSTEM_PROMPT.matchAll(/"([a-z]+\.[a-z_]+)"/g)].map((m) => m[1]).filter((id) => !id.startsWith("reading."));
    expect(lineIds).toEqual(expect.arrayContaining(["check.right_step", "example.intro", "redirect.decline"]));
    for (const id of lineIds) expect(LINE_IDS as readonly string[], id).toContain(id);
    expect(SYSTEM_PROMPT).toContain('{"warm": "back", "echo": null, "pick": null}');
    expect(PHRASE_GROUPS).toContain("back");
    expect(SYSTEM_PROMPT).toMatch(/"accept_answer" is only for a right final answer/);
    expect(SYSTEM_PROMPT).toMatch(/Never guide a step the child has just done/);
    expect(SYSTEM_PROMPT).toMatch(/the next step is "result": guide "result" at level 0/);
    // The final step has its own help line (#389): the prompt no longer works around it with the question line.
    expect(SYSTEM_PROMPT).toMatch(/then the "step\.invite" line for "result"/);
    expect(SYSTEM_PROMPT).not.toMatch(/then a "question" line/);
    // D-199: after two wrong final answers, the model gives the answer and leaves its words to code.
    expect(SYSTEM_PROMPT).toMatch(/wrong a second time, code offers only "give_answer": use it with no line/);
    // D-202: own words follow the plain-language rules, and the code check refuses the banned phrases.
    expect(SYSTEM_PROMPT).toMatch(/plain-language rules \(D-202\).*Never "in all", "altogether", "all together", "total" or "left over": a code check refuses them/);
  });
});
