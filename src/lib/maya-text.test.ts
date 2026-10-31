import { describe, expect, it } from "vitest";
import { fakeAiClient } from "@/lib/ai-client-fake";
import { allLineTexts, PHRASES, SAFETY_GUIDANCE, type Proposal } from "@/lib/maya";
import { aiMayaModel, PROMPT_VERSION, SYSTEM_PROMPT, type ModelInput } from "@/lib/maya-model";
import { fakeMayaModel, ruleMayaModel } from "@/lib/maya-model-fake";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { createTextSession, type TextOutput } from "@/lib/maya-text";
import { checkTrace, packageHash, redactText, TRACE_VERSION } from "@/lib/maya-trace";
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
      versions: { proposal: 2, lines: 1 },
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
    const fixed = v2({ act: "guide", step: "ones", level: 0, parts: [{ line: "step.invite", slots: { step: "ones" } }], reading: { answers: [{ value: num(56), step: "result", verdict: "wrong" }] } });
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
    // The fallback reads nothing, so it judges nothing: no answer is accepted on code's behalf.
    expect(session.session.lastResult).toBeNull();
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
      expect.objectContaining({ source: "model", proposal: null, error: "OpenRouter answered 503: busy" }),
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
    expect(await session.finish("again")).toEqual(trace);
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
    expect(json).not.toMatch(/sk-or-v1|Bearer s/);
    expect(json).toContain("[secret]");
    expect(trace.turns.find((t) => t.kind === "child")).toMatchObject({ text: "I'm {name} and my dog is {name}'s friend. I don't know." });
    expect(checkTrace(trace)).toMatchObject({ ok: true });
  });
});

describe("redactText", () => {
  it("leaves words that only contain the name, and an empty name, alone", () => {
    expect(redactText("Ann went to Annapolis with Ann.", "Ann")).toBe("{name} went to Annapolis with {name}.");
    expect(redactText("Hi there", "")).toBe("Hi there");
    expect(redactText("key whsec_abcdefghijklmnop and re_ABCDEFGHIJKLMNOPQRS", null)).toBe("key [secret] and [secret]");
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
