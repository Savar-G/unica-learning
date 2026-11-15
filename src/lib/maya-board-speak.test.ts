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

// B2 ("draw while speaking", derived from the sentence) through the public interfaces: code reads each accepted
// sentence of Maya's message and draws what it says, one batch per sentence that draws, in sentence order. Chat plays
// the batches in that order; a voice call releases each one when Maya finishes saying its sentence. A refused sentence,
// code's own line, a negated clause, a value that is not code's, earlier work the child's screen has not shown, and a
// repeat never draw. Fake models, fake reviews, the in-memory seams; no network.

const PKG = SAMPLE_PACKAGES["subtract-52-28"] as OperationPackage;
const T0 = Date.UTC(2026, 10, 15, 16, 0, 0);
const S1 = "You can't take 8 from 2, so we trade 1 ten for 10 ones.";
const S2 = "Write 4 in the ones.";
const S3 = "What is 4 tens minus 2 tens?";
const SAY = `${S1} ${S2} ${S3}`;
/** No `draw` at all: the drawings come from the sentences (default on). */
const TRADE_AND_DIGIT = reply(SAY, "guide");
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

describe("default on: the board draws what Maya says (B2)", () => {
  it("52 − 28: the trade and the ones digit, one batch per sentence, in order, tied in the trace", async () => {
    const { session } = chat([TRADE_AND_DIGIT, ASK]);
    await session.start();
    const out = await session.child("I don't get 2 minus 8.");
    expect(out.say.join(" ")).toBe(SAY);
    const [trade, digit] = out.board;
    expect(out.board).toHaveLength(2);
    expect(isTrade(trade) && !isDigit(trade)).toBe(true);
    expect(digit.commands).toMatchObject([{ op: "put", value: "4", target: { column: "ones" } }]);
    // The digit builds on the trade of the same message.
    expect(digit.after).toEqual([trade.transactionId]);
    const trace = await session.finish({ reason: "child_stopped" });
    expect(trace.version).toBe(TRACE_VERSION);
    expect(TRACE_VERSION).toBe(15);
    expect(out.board.map((b) => trace.board.find((x) => x.transactionId === b.transactionId)?.sentence)).toEqual([0, 1]);
    expect(trace.board[0].sentence).toBeUndefined();
    expect(attempts(trace).flatMap((a) => a.boardReads ?? [])).toEqual([
      { sentence: 0, clause: "we trade 1 ten for 10 ones", drew: true },
      { sentence: 1, clause: "write 4 in the ones", drew: true },
    ]);
    expect(trace.counts.clausesDrawn).toBe(2);
    expect(checkTrace(trace)).toMatchObject({ ok: true });
  });

  it("the tens digit on the next turn, once the screen showed the trade and the ones digit", async () => {
    const tens = reply("4 tens minus 2 tens is 2 tens. Write 2 in the tens.", "guide");
    const { session } = chat([TRADE_AND_DIGIT, tens, ASK]);
    await session.start();
    const out = await session.child("I don't get 2 minus 8.");
    session.boardFates(out.board.map((b) => ({ batchId: b.transactionId, fate: "shown" as const })));
    const next = await session.child("What about the tens?");
    expect(next.board.map((b) => b.commands)).toMatchObject([[{ op: "put", value: "2", target: { column: "tens" } }]]);
  });

  it("a sentence the model marks no draw stays still", async () => {
    const { session } = chat([{ ...TRADE_AND_DIGIT, noDraw: [1, 2] }, ASK]);
    await session.start();
    const out = await session.child("I don't get 2 minus 8.");
    expect(out.say.join(" ")).toBe(SAY);
    expect(out.board).toEqual([]);
  });

  it("a request with no sentence (a proposal from before B2) keeps the old rule: one batch at the end", async () => {
    const { session } = chat([reply(SAY, "guide", { draw: [{ offer: "trade", place: "" }, { offer: "digit", place: "ones" }] }), ASK]);
    await session.start();
    const out = await session.child("I don't get 2 minus 8.");
    expect(out.board).toHaveLength(1);
    expect(isTrade(out.board[0]) && isDigit(out.board[0])).toBe(true);
    const trace = await session.finish({ reason: "child_stopped" });
    expect(trace.board.at(-1)?.sentence).toBeUndefined();
    expect(checkTrace(trace)).toMatchObject({ ok: true });
  });
});

describe("what never draws (B2)", () => {
  it("a refused message draws nothing; its repair draws only what it says", async () => {
    const bad = reply(`${S1} 12 minus 8 is 5.`, "guide");
    const good = reply("12 minus 8 is 4. How many ones are there now?", "guide");
    const { session } = chat([bad, good, ASK]);
    await session.start();
    const out = await session.child("I don't get 2 minus 8.");
    expect(out.say.join(" ")).toBe("12 minus 8 is 4. How many ones are there now?");
    expect(out.board.filter(isTrade)).toEqual([]);
    expect(out.board.map((b) => b.commands)).toMatchObject([[{ op: "write", text: "12 − 8 = 4" }]]);
    const trace = await session.finish({ reason: "child_stopped" });
    expect(trace.counts.refusals).toBe(1);
    expect(checkTrace(trace)).toMatchObject({ ok: true });
  });

  it("a held sentence the math review refuses releases nothing; code's line draws nothing", async () => {
    const held = "So the 1 ten we trade is really 10 ones, and 2 and 10 make 12.";
    const msg = reply(`${S1} ${held}`, "guide");
    const { session } = chat([msg, msg, ASK], (i) => (i.sentence === held ? { verdict: "false", reason: "refused for the test" } : { verdict: "true", reason: "true" }));
    await session.start();
    const before = session.session.batches;
    const out = await session.child("I don't get 2 minus 8.");
    expect(out.say.join(" ")).toMatch(/^Let me say that another way\./);
    expect(out.board).toEqual([]);
    expect(session.session.batches).toBe(before);
    const trace = await session.finish({ reason: "child_stopped" });
    expect(trace.counts.fallbacks).toBe(1);
  });

  for (const said of ["Do not trade yet.", "If you are stuck, we trade 1 ten for 10 ones.", "We trade 2 tens for 20 ones.", "8 minus 2 is 6."]) {
    it(`"${said}" draws nothing; the words go out`, async () => {
      const { session } = chat([reply(`${said} How many ones are there now?`, "guide"), ASK]);
      await session.start();
      const out = await session.child("Please help me.");
      expect(out.say.join(" ")).toBe(`${said} How many ones are there now?`);
      expect(out.board).toEqual([]);
    });
  }

  it("review of #1094, round 5: a trade sent with no word from the screen is not earlier work for the next turn", async () => {
    const digit = reply("12 minus 8 is 4, so write 4 in the ones. What comes next?", "guide");
    const { session } = chat([reply(`${S1} How many ones are there now?`, "guide"), digit, ASK]);
    await session.start();
    const first = await session.child("Please help me.");
    expect(first.board.filter(isTrade)).toHaveLength(1);
    const next = await session.child("Please continue.");
    // The note is the step's own equation and draws; the digit waits for the trade to be shown.
    expect(next.board.filter(isDigit)).toEqual([]);
    const trace = await session.finish({ reason: "child_stopped" });
    expect(attempts(trace).flatMap((a) => a.boardReads ?? []).filter((r) => !r.drew)).toEqual([{ sentence: 0, clause: "write 4 in the ones", drew: false, reason: "needs_earlier" }]);
  });

  it("a repeat draws nothing: the trade said again after it was shown", async () => {
    const { session } = chat([TRADE_AND_DIGIT, reply(`${S1} How many ones are there now?`, "guide"), ASK]);
    await session.start();
    const out = await session.child("I don't get 2 minus 8.");
    session.boardFates(out.board.map((b) => ({ batchId: b.transactionId, fate: "shown" as const })));
    const next = await session.child("Say it again.");
    expect(next.board).toEqual([]);
  });
});

describe("review of #1094, round 5: a batch whose earlier batch the screen skipped is skipped too", () => {
  /** The child's desk board after the opening, with child ink where the trade would go. */
  async function inkedDesk(opening: Batch[], trade: Batch) {
    let h = createHistory();
    for (const b of opening) { const r = mayaWrites(h, b, 0); if (!r.ok) throw new Error("opening"); h = r.history; }
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
    return desk;
  }

  it("\"2 ones become 12 ones, so write 4 in the ones\": ink skips the trade, so the desk skips the 4 too", async () => {
    const said = `${S1} 2 ones become 12 ones, so write 4 in the ones. What is 4 tens minus 2 tens?`;
    const { session } = chat([reply(said, "guide"), reply(`${S1} 12 minus 8 is 4. How many ones are there now?`, "guide"), ASK]);
    const opening = await session.start();
    const out = await session.child("Please help me.");
    const [trade, digit] = out.board;
    expect(digit.after).toEqual([trade.transactionId]);
    const desk = await inkedDesk(opening.board, trade);
    // Nothing goes on the board: the trade would cover the ink, and the 4 builds on it.
    expect(desk.mayaReply(out.board)).toBe(0);
    const fates = chatBoardFates(desk.view().history);
    expect(fates.find((f) => f.batchId === trade.transactionId)?.fate).toBe("skipped");
    expect(fates.find((f) => f.batchId === digit.transactionId)?.fate).toBe("skipped");
    session.boardFates(fates);
    expect(session.session.tutor?.drawn).toEqual([]);
    // The server's board matches: both are off it, so the trade and the note draw on the next turn.
    const next = await session.child("Please show me the trade.");
    expect(next.board.filter(isTrade)).toHaveLength(1);
    expect(next.board.some((b) => b.commands.some((c) => (c as { op?: string }).op === "write"))).toBe(true);
    const trace = await session.finish({ reason: "child_stopped" });
    expect(checkTrace(trace)).toMatchObject({ ok: true });
  });

  it("an older desk that reports only the trade skipped: the server marks the 4 skipped too", async () => {
    const { session } = chat([TRADE_AND_DIGIT, ASK]);
    await session.start();
    const out = await session.child("Please help me.");
    session.boardFates([{ batchId: out.board[0].transactionId, fate: "skipped" }]);
    expect(session.session.tutor?.drawn).toEqual([]);
    expect(session.session.tutor?.sent).toBeUndefined();
    const trace = await session.finish({ reason: "child_stopped" });
    expect(trace.board.find((b) => b.transactionId === out.board[1].transactionId)?.fate).toBe("skipped");
  });

  it("a saved call rebuilds the same board: the skipped trade and its 4 stay off it", async () => {
    const { session } = chat([TRADE_AND_DIGIT, ASK]);
    await session.start();
    const out = await session.child("Please help me.");
    session.boardFates([{ batchId: out.board[0].transactionId, fate: "skipped" }, { batchId: out.board[1].transactionId, fate: "skipped" }]);
    const saved = await session.saved();
    const model = conversationalFake({ answer: (() => reply(`${S1} How many ones are there now?`, "guide")) as unknown as (brief: TurnBrief, n: number) => unknown });
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
