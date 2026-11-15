import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { applyBatch, boardPaths, type Batch } from "@/lib/board";
import { chatBoardFates } from "@/lib/board-fate";
import { boardScene, createHistory, mayaSteps, mayaWrites } from "@/lib/board-history";
import { createBoardSession } from "@/lib/board-session";
import { createBoardReceiver, createBoardSender } from "@/lib/board-protocol";
import { createMemoryTransport } from "@/lib/board-protocol-memory";
import { createBoardSpeech, speechWords } from "@/lib/board-speech";
import { BATCH_GAP_MS, timeline } from "@/lib/board-svg";
import { learningEvents } from "@/lib/learning-events";
import { memoryLearningEventStore } from "@/lib/learning-events-memory";
import { memoryWordingHistoryStore, sentencesOf, type MathReviewInput, type MathReviewResult } from "@/lib/maya";
import { mayaCalls, type CallResult } from "@/lib/maya-call";
import { memoryCallStore, memoryConnectionLog } from "@/lib/maya-call-memory";
import { fakeMathReviewer } from "@/lib/maya-math-review";
import type { TurnBrief } from "@/lib/maya-model";
import { conversationalFake, reply } from "@/lib/maya-model-fake";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { fakeTalkReviewer } from "@/lib/maya-talk-review";
import { createTextSession } from "@/lib/maya-text";
import { checkTrace, TRACE_VERSION, type MayaTrace } from "@/lib/maya-trace";
import type { OperationPackage } from "@/lib/question-package";

// B2 ("draw while speaking") through the public interfaces: each drawing is tied to one sentence of Maya's message and is
// its own batch, in the order of her sentences. Chat plays the batches in that order; a voice call releases each one when
// Maya finishes saying its sentence. A drawing that does not match its sentence is dropped, never the sentence, and a
// refused message never releases its drawings. Fake models, fake reviews, the in-memory seams; no network.

const PKG = SAMPLE_PACKAGES["subtract-52-28"] as OperationPackage;
const T0 = Date.UTC(2026, 10, 15, 16, 0, 0);
const S1 = "You can't take 8 from 2, so we trade 1 ten for 10 ones.";
const S2 = "12 minus 8 is 4.";
const S3 = "What is 4 tens minus 2 tens?";
const SAY = `${S1} ${S2} ${S3}`;
const TRADE_AND_DIGIT = reply(SAY, "guide", { draw: [{ offer: "digit", place: "ones", sentence: 2 }, { offer: "trade", place: "", sentence: 1 }] });
const ASK = reply("How many ones are there now?", "guide");
const isTrade = (b: Batch) => b.commands.some((c) => (c as { op?: string }).op === "regroup");
const isDigit = (b: Batch) => b.commands.some((c) => (c as { op?: string }).op === "put");
const attempts = (trace: MayaTrace) => trace.turns.flatMap((t) => (t.kind === "maya" ? t.attempts : []));

function chat(script: unknown[], math?: (i: MathReviewInput) => MathReviewResult) {
  let now = T0;
  const model = conversationalFake({ answer: ((_: TurnBrief, n: number) => script[Math.min(n, script.length - 1)]) as unknown as (brief: TurnBrief, n: number) => unknown });
  const session = createTextSession({ callId: "speak-1", package: PKG, model, clock: () => (now += 500), random: 3, reviewer: fakeTalkReviewer(), mathReviewer: fakeMathReviewer(math), tutor: true });
  return { session, model };
}

describe("each drawing is tied to its sentence (B2)", () => {
  it("one batch per sentence that draws, in the order of the sentences, tied in the trace", async () => {
    const { session } = chat([TRADE_AND_DIGIT, ASK]);
    await session.start();
    const out = await session.child("I don't get 2 minus 8.");
    expect(out.say.join(" ")).toBe(SAY);
    // The model listed the digit first; the trade's sentence comes first, so its batch does too.
    const teaching = out.board.filter((b) => isTrade(b) || isDigit(b));
    expect(teaching.map((b) => (isTrade(b) ? "trade" : "digit"))).toEqual(["trade", "digit"]);
    const trace = await session.finish({ reason: "child_stopped" });
    expect(trace.version).toBe(TRACE_VERSION);
    expect(TRACE_VERSION).toBe(15);
    expect(teaching.map((b) => trace.board.find((x) => x.transactionId === b.transactionId)?.sentence)).toEqual([0, 1]);
    // The opening's question has no tie: it goes with the whole opening.
    expect(trace.board[0].sentence).toBeUndefined();
    expect(trace.counts.drawDrops).toBe(0);
    expect(checkTrace(trace)).toMatchObject({ ok: true });
  });

  it("draws at most one drawing per sentence, and the trace counts the drop", async () => {
    const { session } = chat([reply(SAY, "guide", { draw: [{ offer: "trade", place: "", sentence: 1 }, { offer: "note", place: "12 - 8 = 4", sentence: 1 }] }), ASK]);
    await session.start();
    const out = await session.child("I don't get 2 minus 8.");
    expect(out.say.join(" ")).toBe(SAY);
    expect(out.board.filter((b) => b.commands.some((c) => (c as { op?: string }).op === "write"))).toEqual([]);
    expect(out.board.filter(isTrade)).toHaveLength(1);
    const trace = await session.finish({ reason: "child_stopped" });
    expect(attempts(trace).flatMap((a) => a.drawDrops ?? [])).toEqual([{ offer: "note", sentence: 0, reason: "same_sentence" }]);
    expect(trace.counts.drawDrops).toBe(1);
    expect(checkTrace(trace)).toMatchObject({ ok: true });
  });

  it("a mismatch drops only the drawing: every sentence is still said", async () => {
    // The ones digit (4) tied to the trade sentence: the sentence does not say it.
    const { session } = chat([reply(SAY, "guide", { draw: [{ offer: "digit", place: "ones", sentence: 1 }] }), ASK]);
    await session.start();
    const out = await session.child("I don't get 2 minus 8.");
    expect(out.say.join(" ")).toBe(SAY);
    expect(out.board.filter((b) => isTrade(b) || isDigit(b))).toEqual([]);
    expect(session.session.tutor?.drawn).toEqual([]);
    const trace = await session.finish({ reason: "child_stopped" });
    expect(attempts(trace).flatMap((a) => a.drawDrops ?? [])).toEqual([{ offer: "digit", sentence: 0, reason: "mismatch" }]);
    // No refusal and no repair: the words went out on the first attempt.
    expect(trace.counts.refusals).toBe(0);
    expect(checkTrace(trace)).toMatchObject({ ok: true });
  });

  it("a request with no sentence keeps the old rule: one batch at the end of the message", async () => {
    const { session } = chat([reply(SAY, "guide", { draw: [{ offer: "trade", place: "" }, { offer: "digit", place: "ones" }] }), ASK]);
    await session.start();
    const out = await session.child("I don't get 2 minus 8.");
    const last = out.board.at(-1)!;
    expect(isTrade(last) && isDigit(last)).toBe(true);
    const trace = await session.finish({ reason: "child_stopped" });
    expect(trace.board.at(-1)?.sentence).toBeUndefined();
    expect(checkTrace(trace)).toMatchObject({ ok: true });
  });
});

describe("a refused or held sentence never releases its drawing (B2)", () => {
  it("a message the say check refuses draws nothing; its repair draws only its own ties", async () => {
    const bad = reply(`${S1} 12 minus 8 is 5.`, "guide", { draw: [{ offer: "trade", place: "", sentence: 1 }, { offer: "note", place: "12 - 8 = 4", sentence: 2 }] });
    const good = reply(`${S2} ${S3}`, "guide", { draw: [{ offer: "note", place: "12 - 8 = 4", sentence: 1 }] });
    const { session } = chat([bad, good, ASK]);
    await session.start();
    const out = await session.child("I don't get 2 minus 8.");
    expect(out.say.join(" ")).toBe(`${S2} ${S3}`);
    expect(out.board.filter(isTrade)).toEqual([]);
    expect(session.session.tutor?.drawn).not.toContain("trade:ones");
    const trace = await session.finish({ reason: "child_stopped" });
    expect(trace.counts.refusals).toBe(1);
    expect(checkTrace(trace)).toMatchObject({ ok: true });
  });

  it("a sentence held for the math review that the review refuses releases nothing; code's line draws nothing", async () => {
    // Every proposal holds a sentence the math review refuses: one repair, then code's own line.
    const held = "So the 1 ten we trade is really 10 ones, and 2 and 10 make 12.";
    const msg = reply(`${S1} ${held}`, "guide", { draw: [{ offer: "trade", place: "", sentence: 1 }] });
    const { session } = chat([msg, msg, ASK], (i) => (i.sentence === held ? { verdict: "false", reason: "refused for the test" } : { verdict: "true", reason: "true" }));
    await session.start();
    const before = session.session.batches;
    const out = await session.child("I don't get 2 minus 8.");
    expect(out.say.join(" ")).toMatch(/^Let me say that another way\./);
    expect(out.board).toEqual([]);
    expect(session.session.batches).toBe(before);
    expect(session.session.tutor?.drawn).toEqual([]);
    const trace = await session.finish({ reason: "child_stopped" });
    expect(trace.counts.fallbacks).toBe(1);
    expect(checkTrace(trace)).toMatchObject({ ok: true });
  });
});

describe("review of #1094: a drawing goes only with a positive statement of it", () => {
  for (const said of ["Do not trade yet.", "Don't trade 1 ten yet.", "The tens digit stays 5 for now."]) {
    it(`"${said}" with a trade: the words go out, the trade is not drawn`, async () => {
      const { session } = chat([reply(`${said} How many ones are there now?`, "guide", { draw: [{ offer: "trade", place: "", sentence: 1 }] }), ASK]);
      await session.start();
      const out = await session.child("Please help me.");
      expect(out.say.join(" ")).toBe(`${said} How many ones are there now?`);
      expect(out.board).toEqual([]);
      const trace = await session.finish({ reason: "child_stopped" });
      expect(attempts(trace).flatMap((a) => a.drawDrops ?? [])).toEqual([{ offer: "trade", sentence: 0, reason: "mismatch" }]);
      expect(checkTrace(trace)).toMatchObject({ ok: true });
    });
  }
  it("a positive trade sentence still draws the trade", async () => {
    const { session } = chat([reply(`${S1} How many ones are there now?`, "guide", { draw: [{ offer: "trade", place: "", sentence: 1 }] }), ASK]);
    await session.start();
    const out = await session.child("Please help me.");
    expect(out.board.filter(isTrade)).toHaveLength(1);
  });
});

describe("review of #1094: the server's board is rebuilt from the fates", () => {
  it("a skipped trade before a shown digit is off the server's board, so a later trade and a note both draw", async () => {
    const retry = reply(`${S1} ${S2} How many ones are there now?`, "guide", { draw: [{ offer: "trade", place: "", sentence: 1 }, { offer: "note", place: "12 - 8 = 4", sentence: 2 }] });
    const { session } = chat([TRADE_AND_DIGIT, retry, ASK]);
    const opening = await session.start();
    const out = await session.child("Please help me.");
    const [trade, digit] = out.board;
    expect(isTrade(trade) && !isTrade(digit) && isDigit(digit)).toBe(true);
    // The child's real desk board: the question, then the child writes where the trade would go.
    let h = createHistory();
    for (const b of opening.board) { const r = mayaWrites(h, b, 0); if (!r.ok) throw new Error("opening"); h = r.history; }
    const trial = applyBatch(boardScene(h), trade);
    if (!trial.ok) throw new Error("trade");
    const before = new Set(boardPaths(boardScene(h)).map((p) => p.id));
    const point = boardPaths(trial.scene).filter((p) => !before.has(p.id)).flatMap((p) => p.pts)[0] as [number, number];
    let t = 10_000;
    const desk = createBoardSession({ initial: h, restored: true, noStore: true, clock: () => t, wall: () => t });
    desk.handBack();
    expect(desk.penDown(point, false, 800)).toBe(true);
    t += 100;
    desk.penMove([[point[0] + 0.003, point[1] + 0.003]]);
    desk.penUp();
    t += 100;
    // The desk skips the trade (it would cover the ink) and shows the digit.
    expect(desk.mayaReply(out.board)).toBe(1);
    const fates = chatBoardFates(desk.view().history);
    expect(fates.find((f) => f.batchId === trade.transactionId)?.fate).toBe("skipped");
    expect(fates.find((f) => f.batchId === digit.transactionId)?.fate).toBe("shown");
    session.boardFates(fates);
    expect(session.session.tutor?.drawn).toEqual(["digit:ones"]);
    const next = await session.child("Please show me the trade.");
    expect(next.board.filter(isTrade)).toHaveLength(1);
    expect(next.board.some((b) => b.commands.some((c) => (c as { op?: string }).op === "write"))).toBe(true);
    const trace = await session.finish({ reason: "child_stopped" });
    expect(checkTrace(trace)).toMatchObject({ ok: true });
  });

  it("a saved call rebuilds the same board: the skipped trade stays off it", async () => {
    const { session } = chat([TRADE_AND_DIGIT, ASK]);
    await session.start();
    const out = await session.child("Please help me.");
    session.boardFates([{ batchId: out.board[0].transactionId, fate: "skipped" }, { batchId: out.board[1].transactionId, fate: "shown" }]);
    const saved = await session.saved();
    const model = conversationalFake({ answer: (() => reply(`${S1} How many ones are there now?`, "guide", { draw: [{ offer: "trade", place: "", sentence: 1 }] })) as unknown as (brief: TurnBrief, n: number) => unknown });
    let now = T0 + 60_000;
    const resumed = createTextSession({ callId: "speak-1", package: PKG, model, clock: () => (now += 500), random: 3, reviewer: fakeTalkReviewer(), mathReviewer: fakeMathReviewer(), tutor: true, resume: saved });
    const again = await resumed.child("Show me the trade.");
    expect(again.board.filter(isTrade)).toHaveLength(1);
  });
});

describe("chat plays the batches in the order of the sentences (B2)", () => {
  it("the trade's strokes end before the digit's start, with the board's own gap between them", async () => {
    const { session } = chat([TRADE_AND_DIGIT, ASK]);
    const opening = await session.start();
    const out = await session.child("I don't get 2 minus 8.");
    let h = createHistory();
    for (const b of [...opening.board, ...out.board]) {
      const r = mayaWrites(h, b, 0);
      if (!r.ok) throw new Error("refused");
      h = r.history;
    }
    const steps = mayaSteps(h);
    const t = timeline(steps);
    // Steps: the question, the trade, the digit (the existing animation timing).
    expect(steps).toHaveLength(3);
    const ids = (i: number) => new Set(steps[i].drawn.map((p) => p.id));
    const span = (i: number) => t.strokes.filter((s) => ids(i).has(s.path.id));
    const tradeEnd = Math.max(...span(1).map((s) => s.endMs));
    const digitStart = Math.min(...span(2).map((s) => s.startMs));
    expect(digitStart - tradeEnd).toBe(BATCH_GAP_MS);
  });
});

// ---------- Voice ----------

const PARENT = "11111111-1111-4111-8111-111111111111";
const CHILD = "22222222-2222-4222-8222-222222222222";
const WORKBOOK = "44444444-4444-4444-8444-444444444444";
const VPKG = { ...SAMPLE_PACKAGES["subtract-52-28"], ref: { source: "workbook" as const, workbookId: WORKBOOK, page: 1, question: 1 } };

function voiceSetup() {
  let now = T0;
  let n = 0;
  const store = memoryCallStore({ testFamilies: [PARENT] });
  const model = conversationalFake({ id: "fake-v3", answer: (() => TRADE_AND_DIGIT) as unknown as (brief: TurnBrief, n: number) => unknown });
  const calls = mayaCalls({
    tutorFamilies: true, store, history: memoryWordingHistoryStore(),
    events: learningEvents(memoryLearningEventStore({ children: [{ id: CHILD, parentId: PARENT }], tests: [] })),
    rebuild: vi.fn(async () => true), model: () => model, reviewer: () => fakeTalkReviewer(), mathReviewer: () => fakeMathReviewer(),
    isTestFamily: async (p) => p === PARENT, canChat: async () => true, canCallVoice: async () => true,
    connections: memoryConnectionLog(store, () => now), note: async () => "done" as const, alerts: { send: async () => {}, list: async () => [] },
    clock: () => now, newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`, seed: () => 42,
  });
  return { calls, now: () => now, advance: (s: number) => (now += s * 1000) };
}

const ok = (r: CallResult) => {
  if (!r.ok) throw new Error(`refused: ${r.error}`);
  return r;
};

/** A voice turn with the trade tied to the first sentence and the digit to the second. */
async function voiceTurn() {
  const s = voiceSetup();
  const id = ok(await s.calls.startVoice({ kind: "family", parentId: PARENT, childId: CHILD, childName: "Leah", package: VPKG, startedBy: PARENT })).view.id;
  const opened = await s.calls.openVoice(id, { speechToText: "fake", voice: "fake" }, "Leah");
  if (!opened.ok) throw new Error(opened.error);
  const opening = (await opened.call.start()).boardCues ?? [];
  s.advance(5);
  const turn = await opened.call.child("I don't get 2 minus 8.");
  return { s, call: opened.call, turn, opening };
}

type Cues = Parameters<ReturnType<typeof createBoardSpeech>["stage"]>[1];

/**
 * The worker's board speech on a real receiver (the fake transport): the opening's question is shown first, then the
 * turn's utterance is staged. `shown`: the turn's batches the child's board shows.
 */
async function speech(opening: Cues, cues: Cues) {
  const receiver = createBoardReceiver({ sessionId: "call" });
  const sender = createBoardSender({ sessionId: "call", senderId: "worker", transport: createMemoryTransport(receiver) });
  const board = createBoardSpeech({ sender, now: () => 0 });
  await board.connect();
  await board.stage("opening", opening);
  await board.show(board.capture("opening")!);
  const before = new Set(receiver.snapshot().events.flatMap((e) => (e.kind === "batch" ? [(e as { batchId: string }).batchId] : [])));
  expect(before.size).toBe(opening.length);
  const staging = await board.stage("turn", cues);
  expect(staging.refused).toEqual([]);
  const scope = board.capture("turn")!;
  const shown = () => receiver.snapshot().events.flatMap((e) => (e.kind === "batch" && !before.has((e as { batchId: string }).batchId) ? [(e as { batchId: string }).batchId] : []));
  return { board, scope, shown, receiver };
}

describe("a voice call shows each drawing when Maya has said its sentence (B2)", () => {
  it("each batch's cue is the last word of its sentence, not the end of the message", async () => {
    const { turn, call } = await voiceTurn();
    const words = (t: string) => speechWords(t).length;
    expect(turn.say.join(" ")).toBe(SAY);
    expect(sentencesOf(turn.say.join(" "))).toEqual([S1, S2, S3]);
    expect((turn.boardCues ?? []).map((c) => [isTrade(c.batch) ? "trade" : "digit", c.word])).toEqual([["trade", words(S1)], ["digit", words(S1) + words(S2)]]);
    expect(words(S1) + words(S2)).toBeLessThan(words(SAY));
    await call.settled();
  });

  it("with word times: the trade shows at the end of its sentence, the digit at the end of its own", async () => {
    const { turn, call, opening } = await voiceTurn();
    const [trade, digit] = turn.boardCues!;
    const v = await speech(opening, turn.boardCues!);
    // The fake voice times every word: 100 ms each.
    const total = speechWords(SAY).length;
    for (let w = 1; w <= total; w++) await v.board.timing(v.scope, w, w * 100, "word");
    await v.board.played(v.scope, trade.word * 100 - 1);
    expect(v.shown()).toEqual([]);
    await v.board.played(v.scope, trade.word * 100);
    expect(v.shown()).toEqual([trade.batch.transactionId]);
    await v.board.played(v.scope, digit.word * 100 - 1);
    expect(v.shown()).toEqual([trade.batch.transactionId]);
    await v.board.played(v.scope, digit.word * 100);
    expect(v.shown()).toEqual([trade.batch.transactionId, digit.batch.transactionId]);
    // Both are on the board before the last sentence ends.
    expect(digit.word * 100).toBeLessThan(total * 100);
    expect(boardPaths(v.receiver.scene()).length).toBeGreaterThan(0);
    await call.settled();
  });

  it("with no word times: each batch shows at the end of its sentence's audio", async () => {
    const { turn, call, opening } = await voiceTurn();
    const [trade, digit] = turn.boardCues!;
    const v = await speech(opening, turn.boardCues!);
    // The fake voice gives no word times: the worker posts each sentence's end (speech-audio.ts), 1 s per sentence.
    let words = 0;
    for (const [i, sentence] of [S1, S2, S3].entries()) {
      words += speechWords(sentence).length;
      await v.board.timing(v.scope, words, (i + 1) * 1000, "sentence");
    }
    await v.board.played(v.scope, 999);
    expect(v.shown()).toEqual([]);
    await v.board.played(v.scope, 1000);
    expect(v.shown()).toEqual([trade.batch.transactionId]);
    await v.board.played(v.scope, 1999);
    expect(v.shown()).toEqual([trade.batch.transactionId]);
    await v.board.played(v.scope, 2000);
    expect(v.shown()).toEqual([trade.batch.transactionId, digit.batch.transactionId]);
    await call.settled();
  });

  it("every batch is on the child's screen before any audio: staged, not shown", async () => {
    const { turn, call, opening } = await voiceTurn();
    const v = await speech(opening, turn.boardCues!);
    await v.board.sent(v.scope);
    expect(v.receiver.staged().map((b) => b.batchId)).toEqual(turn.boardCues!.map((c) => c.batch.transactionId));
    expect(v.shown()).toEqual([]);
    await call.settled();
  });
});
