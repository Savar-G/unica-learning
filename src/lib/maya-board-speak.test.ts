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
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { checkTrace, TRACE_VERSION, type MayaTrace } from "@/lib/maya-trace";
import { workedSteps, type Operation, type OperationPackage } from "@/lib/question-package";

// B2 ("draw while speaking", derived from the sentence) through the public interfaces: code reads each accepted
// sentence of Maya's message and draws what it says, one batch per sentence that draws, in sentence order. Chat plays
// the batches in that order; a voice call releases each one when Maya finishes saying its sentence. A refused sentence,
// code's own line, a negated clause, a value that is not code's, earlier work the child's screen has not shown, and a
// repeat never draw. Fake models, fake reviews, the in-memory seams; no network.

const PKG = SAMPLE_PACKAGES["subtract-52-28"] as OperationPackage;
const FIXTURES = join(__dirname, "maya-board-speak-fixtures");
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

  it("a live message with an old-style draw list still derives: the list is ignored", async () => {
    const { session } = chat([reply(SAY, "guide", { draw: [{ offer: "trade", place: "" }, { offer: "digit", place: "ones" }] }), ASK]);
    await session.start();
    const out = await session.child("I don't get 2 minus 8.");
    expect(out.board.map((b) => b.commands.map((c) => (c as { op?: string }).op))).toEqual([["regroup"], ["put"]]);
  });
});

describe("what never draws (B2)", () => {
  it("a refused message draws nothing; its repair draws only what it says", async () => {
    const bad = reply(`${S1} 12 minus 8 is 5.`, "guide");
    // The repair says only the trade: the refused message's note (and its own trade) never draw.
    const good = reply("We trade 1 ten for 10 ones. How many ones are there now?", "guide");
    const { session } = chat([bad, good, ASK]);
    await session.start();
    const out = await session.child("I don't get 2 minus 8.");
    expect(out.say.join(" ")).toBe("We trade 1 ten for 10 ones. How many ones are there now?");
    expect(out.board.map((b) => b.commands.map((c) => (c as { op?: string }).op))).toEqual([["regroup"]]);
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
    // The digit waits for the trade to be shown; the sentence draws as a whole or not at all, so its note waits too.
    expect(next.board).toEqual([]);
    const trace = await session.finish({ reason: "child_stopped" });
    // The note of the ones step needs the trade too (the kind declares what that step's digit needs).
    expect(attempts(trace).flatMap((a) => a.boardReads ?? []).filter((r) => !r.drew)).toEqual([
      { sentence: 0, clause: "12 minus 8 is 4", drew: false, reason: "needs_earlier" },
      { sentence: 0, clause: "write 4 in the ones", drew: false, reason: "needs_earlier" },
    ]);
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

describe("Sol review of the derived design (d76b6981e)", () => {
  const op = (kind: "multiply" | "subtract", a: number, b: number): OperationPackage => {
    const operation = { kind, operands: [a, b] } as Operation;
    const value = kind === "multiply" ? a * b : a - b;
    const skill = kind === "multiply" ? { standard: "4.8", skills: ["4.8-multiplication-facts"] } : PKG.skill;
    return { ...PKG, id: `${kind}-${a}-${b}`, text: `${a} ${kind === "multiply" ? "×" : "−"} ${b} = ?`, level: 12, skill, operation, steps: workedSteps(operation), answer: { value: { type: "number", value }, accepted: [], unit: null }, wrongAnswers: [{ value: { type: "number", value: value + 1 }, cause: "careless", description: "One more than the answer.", step: null }], easierExample: { text: kind === "multiply" ? "12 × 2 = ?" : "12 − 2 = ?", operation: { kind, operands: [12, 2] }, steps: workedSteps({ kind, operands: [12, 2] } as Operation), answer: { type: "number", value: kind === "multiply" ? 24 : 10 } } } as OperationPackage;
  };
  const session = (script: unknown[], pkg: OperationPackage) => {
    let now = T0;
    const model = conversationalFake({ answer: ((_: TurnBrief, n: number) => script[Math.min(n, script.length - 1)]) as unknown as (brief: TurnBrief, n: number) => unknown });
    return createTextSession({ callId: "sol-1", package: pkg, model, clock: () => (now += 500), random: 3, reviewer: fakeTalkReviewer(), mathReviewer: fakeMathReviewer(), tutor: true });
  };

  it("P1: on 23 × 4 the tens digit waits for the ones digit (declared), and names it in `after`", async () => {
    const alone = session([reply("Write 9 in the tens. What comes next?", "guide"), ASK], op("multiply", 23, 4));
    await alone.start();
    expect((await alone.child("Please help.")).board).toEqual([]);
    const both = session([reply("Write 2 in the ones. Write 9 in the tens. What comes next?", "guide"), ASK], op("multiply", 23, 4));
    await both.start();
    const out = await both.child("Please help.");
    expect(out.board).toHaveLength(2);
    expect(out.board[1].after).toEqual([out.board[0].transactionId]);
  });

  it("P1: an old saved message (draw []) replays exactly its stored batches and ids", async () => {
    const old = JSON.parse(readFileSync(join(FIXTURES, "old-draw-empty.json"), "utf8"));
    let now = T0 + 60_000;
    const resumed = createTextSession({ callId: "probe", package: PKG, model: conversationalFake({ answer: () => ASK }), clock: () => (now += 50), tutor: true, reviewer: fakeTalkReviewer(), mathReviewer: fakeMathReviewer(), resume: old });
    expect((await resumed.saved()).board).toEqual(old.board);
  });

  it("P1: an old shown note's fate never confirms a derived trade, so the 4 does not draw alone", async () => {
    const old = JSON.parse(readFileSync(join(FIXTURES, "old-note-shown.json"), "utf8"));
    let now = T0 + 60_000;
    const resumed = createTextSession({ callId: "probe", package: PKG, model: conversationalFake({ answer: () => reply("Write 4 in the ones. What is 4 tens minus 2 tens?", "guide") }), clock: () => (now += 50), tutor: true, reviewer: fakeTalkReviewer(), mathReviewer: fakeMathReviewer(), resume: old });
    expect((await resumed.saved()).board).toEqual(old.board);
    const out = await resumed.child("Please show me the ones digit.");
    expect(out.board).toEqual([]);
  });

  it("P2: a digit and its carry in separate sentences each draw, the carry after the digit", async () => {
    const add = SAMPLE_PACKAGES["add-27-39"] as OperationPackage;
    const s = session([reply("Write 6 in the ones. We trade 10 ones for 1 ten. What is 1 plus 2 plus 3?", "guide"), ASK], add);
    await s.start();
    const out = await s.child("Please help me.");
    expect(out.board.map((b) => b.commands.map((c) => (c as { op?: string }).op))).toEqual([["put"], ["regroup"]]);
    expect(out.board[1].after).toEqual([out.board[0].transactionId]);
  });

  it("P2: each trade across zeros draws in its own sentence (1002 − 4)", async () => {
    const s = session([reply("We trade 1 thousand for 10 hundreds. We trade 1 hundred for 10 tens. We trade 1 ten for 10 ones. What do we write in the ones?", "guide"), ASK], op("subtract", 1002, 4));
    await s.start();
    const out = await s.child("Please help me.");
    expect(out.board.map((b) => b.commands.map((c) => (c as { op?: string }).op))).toEqual([["regroup"], ["regroup"], ["regroup"]]);
    expect(out.board.map((b) => b.after ?? [])).toEqual([[], [out.board[0].transactionId], [out.board[1].transactionId]]);
  });

  it("P2: a streamed accepted sentence keeps its note when a later sentence fails and the message falls back", async () => {
    const lead = "12 minus 8 is 4.";
    const held = "The 12 ones come from the trade.";
    const parts: string[] = [];
    let early: string[] = [];
    // The trade is shown first (the note of the ones step needs it).
    const model = conversationalFake({ answer: (_b, n) => (n === 0 ? reply("We trade 1 ten for 10 ones. How many ones are there now?", "guide") : reply(`${lead} ${held}`, "guide")), stream: { chunk: 7, beforeEnd: async () => { for (let i = 0; i < 100; i++) await Promise.resolve(); early = [...parts]; } } });
    let now = T0;
    const s = createTextSession({ callId: "stream-1", package: PKG, tutor: true, clock: () => (now += 50), model, reviewer: fakeTalkReviewer(), mathReviewer: fakeMathReviewer((i) => (i.sentence === held ? { verdict: "false", reason: "refused for the test" } : { verdict: "true", reason: "true" })), onSayPart: (text) => parts.push(text) });
    await s.start();
    const traded = await s.child("Please help me.");
    s.boardFates(traded.board.map((b) => ({ batchId: b.transactionId, fate: "shown" as const })));
    parts.length = 0;
    const out = await s.child("Please help with 52 minus 28.");
    expect(early).toContain(lead);
    expect(out.say.join(" ")).toContain(lead);
    expect(out.say.join(" ")).not.toContain(held);
    expect(out.board.map((b) => b.commands)).toMatchObject([[{ op: "write", text: "12 − 8 = 4" }]]);
  });
});

describe("preview of 0e6cfeed0 (call fb9b7b10): the tens digit when Maya says it her way", () => {
  const SAID = "Yes, 4 tens minus 2 tens is 2 tens, so write 2 in the tens.";
  const first = reply("We trade 1 ten for 10 ones. Write 4 in the ones. What is 4 tens minus 2 tens?", "guide");
  it("draws the tens digit after the child's right answer (the \"Yes\" is validated)", async () => {
    const { session } = chat([first, reply(`${SAID} What is the whole answer?`, "guide"), ASK]);
    await session.start();
    const out = await session.child("12 minus 8 is 4.");
    expect(out.board).toHaveLength(2);
    session.boardFates(out.board.map((b) => ({ batchId: b.transactionId, fate: "shown" as const })));
    const next = await session.child("2");
    expect(next.say.join(" ")).toBe(`${SAID} What is the whole answer?`);
    expect(next.board.map((b) => b.commands)).toMatchObject([[{ op: "put", value: "2", target: { column: "tens" } }]]);
  });
  it("an unvalidated \"Yes\" (no right answer from the child) draws nothing", async () => {
    const { session } = chat([first, reply(`${SAID} What is the whole answer?`, "guide"), ASK]);
    await session.start();
    const out = await session.child("12 minus 8 is 4.");
    session.boardFates(out.board.map((b) => ({ batchId: b.transactionId, fate: "shown" as const })));
    const next = await session.child("I don't know.");
    expect(next.say.join(" ")).toBe(`${SAID} What is the whole answer?`);
    expect(next.board).toEqual([]);
  });
});

describe("review of #1094 (f4c382735) through the session: each clause binds to the action's step", () => {
  const first = reply("We trade 1 ten for 10 ones. Write 4 in the ones. What comes next?", "guide");
  for (const said of ["Now the tens: write 4 in the ones. What comes next?", "4 ones minus 2 ones is 2 ones, so write 2 in the tens. What comes next?"]) {
    it(`"${said}" draws nothing; the words go out`, async () => {
      const { session } = chat([reply("We trade 1 ten for 10 ones. What comes next?", "guide"), reply(said, "guide"), ASK]);
      await session.start();
      const a = await session.child("Please help me.");
      session.boardFates(a.board.map((b) => ({ batchId: b.transactionId, fate: "shown" as const })));
      if (said.includes("tens.")) {
        // The tens digit also needs the ones digit shown first: show it, so only the binding decides.
        const { session: s2 } = chat([first, reply(said, "guide"), ASK]);
        await s2.start();
        const b = await s2.child("Please help me.");
        s2.boardFates(b.board.map((x) => ({ batchId: x.transactionId, fate: "shown" as const })));
        const out = await s2.child("Please continue.");
        expect(out.say.join(" ")).toBe(said);
        expect(out.board).toEqual([]);
        return;
      }
      const out = await session.child("Please continue.");
      expect(out.say.join(" ")).toBe(said);
      expect(out.board).toEqual([]);
    });
  }
});

describe("review of #1094 (65c39133f): the board-state check, and the sentence as a whole", () => {
  const sub = (a: number, b: number): OperationPackage => {
    const operation = { kind: "subtract", operands: [a, b] } as Operation;
    return { ...PKG, id: `subtract-${a}-${b}`, text: `${a} − ${b} = ?`, operation, steps: workedSteps(operation), answer: { value: { type: "number", value: a - b }, accepted: [], unit: null } } as OperationPackage;
  };
  const div = (a: number, b: number): OperationPackage => {
    const operation = { kind: "divide", operands: [a, b] } as Operation;
    return { ...PKG, id: `divide-${a}-${b}`, text: `${a} ÷ ${b} = ?`, level: 12, skill: { standard: "4.8", skills: ["4.8-division-facts"] }, operation, steps: workedSteps(operation), answer: { value: { type: "number", value: a / b }, accepted: [], unit: null }, wrongAnswers: [{ value: { type: "number", value: a / b + 1 }, cause: "careless", description: "One more than the answer.", step: null }], easierExample: { text: "8 ÷ 2 = ?", operation: { kind: "divide", operands: [8, 2] }, steps: workedSteps({ kind: "divide", operands: [8, 2] } as Operation), answer: { type: "number", value: 4 } } } as OperationPackage;
  };
  const one = async (pkg: OperationPackage, said: string) => {
    let now = T0;
    const s = createTextSession({ callId: "state-1", package: pkg, model: conversationalFake({ answer: () => reply(said, "guide") }), clock: () => (now += 500), random: 3, reviewer: fakeTalkReviewer(), mathReviewer: fakeMathReviewer(), tutor: true });
    await s.start();
    const out = await s.child("Please help me.");
    expect(out.say.join(" ")).toBe(said);
    return out;
  };
  it("1002 − 4: a state the board will not show after the batch stops the sentence", async () => {
    expect((await one(sub(1002, 4), "The ones are now 12, so we trade 1 thousand for 10 hundreds. What comes next?")).board).toEqual([]);
    expect((await one(sub(1002, 4), "We trade 1 thousand for 10 hundreds. What comes next?")).board.flatMap((b) => b.commands)).toMatchObject([{ op: "regroup", from: "thousands", to: "hundreds" }]);
  });
  it("52 − 28: a state the batch makes true draws; a later state does not", async () => {
    expect((await one(PKG, "We trade 1 ten for 10 ones, so the ones are now 12. What comes next?")).board).toHaveLength(1);
    expect((await one(PKG, "We trade 1 ten for 10 ones, so 5 tens became 4 tens. What comes next?")).board).toHaveLength(1);
    expect((await one(PKG, "We trade 1 ten for 10 ones, so the ones are now 2. What comes next?")).board).toEqual([]);
  });
  it("first-person board writing through the session: \"I'll trade ...\", then \"I'll write ...\"", async () => {
    let now = T0;
    const lines = ["I'll trade 1 ten for 10 ones. What comes next?", "I'll write 4 in the ones. What comes next?"];
    const s = createTextSession({ callId: "first-person", package: PKG, model: conversationalFake({ answer: (_b, n) => reply(lines[Math.min(n, 1)], "guide") }), clock: () => (now += 500), random: 3, reviewer: fakeTalkReviewer(), mathReviewer: fakeMathReviewer(), tutor: true });
    await s.start();
    const a = await s.child("Please help me.");
    expect(a.board.flatMap((b) => b.commands)).toMatchObject([{ op: "regroup", from: "tens", to: "ones" }]);
    s.boardFates(a.board.map((b) => ({ batchId: b.transactionId, fate: "shown" as const })));
    const b = await s.child("Please continue.");
    expect(b.board.flatMap((x) => x.commands)).toMatchObject([{ op: "put", value: "4", target: { column: "ones" } }]);
  });
  it("84 ÷ 4: a layout with other values stops the right one; the right one alone draws", async () => {
    expect((await one(div(84, 4), "Share 84 into 5 groups, then share 84 into 4 groups. What comes next?")).board).toEqual([]);
    expect((await one(div(84, 4), "Share 84 into 4 groups. What comes next?")).board.length).toBeGreaterThan(0);
  });
  it("#1096: 96 ÷ 4 draws long-division clauses in order with explicit after dependencies and refuses wrong or unexplained steps", async () => {
    const out = await one(
      div(96, 4),
      "Share 96 into 4 groups. Write 2 above the tens, subtract 8, leaving 1 ten. Combine the 6 ones to make 16 ones. What is 16 divided by 4?",
    );
    expect(out.board).toHaveLength(3);
    expect(out.board[0].commands).toMatchObject([{ op: "division", dividend: "96", divisor: "4" }]);
    expect(out.board[1].after).toEqual([out.board[0].transactionId]);
    expect(out.board[1].commands).toMatchObject([
      { op: "put", target: { rowId: "quotient", column: "tens" }, value: "2" },
      { op: "put", target: { rowId: "product1" }, value: "8" },
      { op: "put", target: { rowId: "difference1" }, value: "1" },
    ]);
    expect(out.board[2].after).toEqual([out.board[1].transactionId]);
    expect(out.board[2].commands).toMatchObject([{ op: "put", target: { rowId: "bring2" }, value: "6" }]);
    // Unexplained bring-down draws nothing on top of step 1.
    const bad = await one(div(96, 4), "Share 96 into 4 groups. Write 2 above the tens, subtract 8, leaving 1 ten. Bring down 6. What comes next?");
    expect(bad.board).toHaveLength(2);
  });
});

describe("last re-check of b77c1db73: a step's note waits for that step's board work", () => {
  it("\"12 minus 8 is 4.\" with no trade on the board draws nothing", async () => {
    const { session } = chat([reply("12 minus 8 is 4. What comes next?", "guide"), ASK]);
    await session.start();
    expect((await session.child("Please help me.")).board).toEqual([]);
  });
  it("a note whose state needs a trade of the same message names it in `after`; ink that skips the trade skips the note", async () => {
    const line = "We trade 1 ten for 10 ones. The ones are now 12, so 12 minus 8 is 4. What comes next?";
    const { session } = chat([reply(line, "guide"), ASK]);
    const opening = await session.start();
    const out = await session.child("Please help me.");
    expect(out.say.join(" ")).toBe(line);
    expect(out.board).toHaveLength(2);
    expect(out.board[1].after).toEqual([out.board[0].transactionId]);
    let h = createHistory();
    for (const b of opening.board) { const r = mayaWrites(h, b, 0); if (!r.ok) throw new Error("opening"); h = r.history; }
    const trial = applyBatch(boardScene(h), out.board[0]);
    if (!trial.ok) throw new Error("trade");
    const prior = new Set(boardPaths(boardScene(h)).map((p) => p.id));
    const point = boardPaths(trial.scene).filter((p) => !prior.has(p.id)).flatMap((p) => p.pts)[0] as [number, number];
    let t = 10_000;
    const desk = createBoardSession({ initial: h, restored: true, noStore: true, clock: () => t, wall: () => t });
    desk.handBack();
    expect(desk.penDown(point, false, 800)).toBe(true);
    t += 100;
    desk.penMove([[point[0] + 0.003, point[1] + 0.003]]);
    desk.penUp();
    desk.mayaReply(out.board);
    const fates = chatBoardFates(desk.view().history);
    expect(fates.find((f) => f.batchId === out.board[0].transactionId)?.fate).toBe("skipped");
    expect(fates.find((f) => f.batchId === out.board[1].transactionId)?.fate).toBe("skipped");
  });
});

describe("#1103: code's own fallback message draws (decided 2026-11-15)", () => {
  it("a fallback turn draws the note of its streamed sentence, and the trace shows the fallback's reads", async () => {
    const lead = "12 minus 8 is 4.";
    const held = "The 12 ones come from the trade.";
    // The trade is shown first (the note of the ones step needs it).
    const model = conversationalFake({ answer: (_b, n) => (n === 0 ? reply("We trade 1 ten for 10 ones. How many ones are there now?", "guide") : reply(`${lead} ${held}`, "guide")), stream: { chunk: 7 } });
    let now = T0;
    const s = createTextSession({ callId: "fb-1", package: PKG, tutor: true, clock: () => (now += 50), model, reviewer: fakeTalkReviewer(), mathReviewer: fakeMathReviewer((i) => (i.sentence === held ? { verdict: "false", reason: "refused for the test" } : { verdict: "true", reason: "true" })), onSayPart: () => {} });
    await s.start();
    const traded = await s.child("Please help me.");
    s.boardFates(traded.board.map((b) => ({ batchId: b.transactionId, fate: "shown" as const })));
    const out = await s.child("Please help with 52 minus 28.");
    // Code's line after streamed words: the streamed sentence, then code's own question.
    expect(out.say.join(" ")).toMatch(/^12 minus 8 is 4\. /);
    expect(out.say.join(" ")).not.toContain(held);
    expect(out.board.map((b) => b.commands)).toMatchObject([[{ op: "write", text: "12 − 8 = 4" }]]);
    const trace = await s.finish({ reason: "child_stopped" });
    const fallback = attempts(trace).find((a) => a.source === "fallback")!;
    expect(fallback.drawMode).toBe("derive");
    expect(fallback.boardReads).toEqual([{ sentence: 0, clause: "12 minus 8 is 4", drew: true }]);
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
