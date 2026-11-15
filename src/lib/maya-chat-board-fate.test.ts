import { describe, expect, it, vi } from "vitest";
import type { Batch } from "@/lib/board";
import { chatBoardFates, snapshotFates } from "@/lib/board-fate";
import { createHistory } from "@/lib/board-history";
import { createBoardSession } from "@/lib/board-session";
import { learningEvents } from "@/lib/learning-events";
import { memoryLearningEventStore } from "@/lib/learning-events-memory";
import { memoryWordingHistoryStore, type TutorBrief } from "@/lib/maya";
import { mayaCalls, type CallResult } from "@/lib/maya-call";
import { memoryCallStore, memoryConnectionLog } from "@/lib/maya-call-memory";
import type { TurnBrief } from "@/lib/maya-model";
import { conversationalFake, reply } from "@/lib/maya-model-fake";
import { fakeTalkReviewer } from "@/lib/maya-talk-review";
import { fakeMathReviewer } from "@/lib/maya-math-review";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { checkTrace } from "@/lib/maya-trace";

// B1 ("shown means shown") end to end, with the in-memory seams: the desk's own board session (src/lib/board-session.ts)
// takes Maya's batches, the child's ink makes it skip one, the desk reports each batch's fate with the next message
// (chatBoardFates), and the call's next brief counts only what the child saw. Voice: the worker's board log and a core
// refusal reach the session the same way. A fake model; no network.

const PARENT = "11111111-1111-4111-8111-111111111111";
const CHILD = "22222222-2222-4222-8222-222222222222";
const WORKBOOK = "44444444-4444-4444-8444-444444444444";
const T0 = Date.UTC(2026, 10, 15, 16, 0, 0);
const PKG = { ...SAMPLE_PACKAGES["subtract-52-28"], ref: { source: "workbook" as const, workbookId: WORKBOOK, page: 1, question: 1 } };
const TRADE = reply("You can't take 8 from 2, so we trade 1 ten for 10 ones. How many ones are there now?", "guide", { draw: [{ offer: "trade", place: "" }] });

function setup() {
  let now = T0;
  let n = 0;
  const store = memoryCallStore({ testFamilies: [PARENT] });
  const model = conversationalFake({ id: "fake-v3", answer: (() => TRADE) as unknown as (brief: TurnBrief, n: number) => unknown });
  const calls = mayaCalls({
    tutorFamilies: true, store, history: memoryWordingHistoryStore(),
    events: learningEvents(memoryLearningEventStore({ children: [{ id: CHILD, parentId: PARENT }], tests: [] })),
    rebuild: vi.fn(async () => true), model: () => model, reviewer: () => fakeTalkReviewer(), mathReviewer: () => fakeMathReviewer(),
    isTestFamily: async (p) => p === PARENT, canChat: async () => true, canCallVoice: async () => true,
    connections: memoryConnectionLog(store, () => now), note: async () => "done" as const, alerts: { send: async () => {}, list: async () => [] },
    clock: () => now, newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`, seed: () => 42,
  });
  return { store, calls, briefs: model.briefs as unknown as TutorBrief[], advance: (s: number) => (now += s * 1000) };
}

const ok = (r: CallResult) => {
  if (!r.ok) throw new Error(`refused: ${r.error}`);
  return r;
};
const isTrade = (b: Batch) => b.commands.some((c) => (c as { op?: string }).op === "regroup");

/** The desk's board for a chat: the real board session, holding the board (no draft store). */
function deskBoard() {
  let t = 0;
  return createBoardSession({ initial: createHistory(), restored: false, clock: () => (t += 50), wall: () => T0 + t, noStore: true });
}

describe("a chat counts only the drawings the child's board showed (B1)", () => {
  it("a batch the desk skipped over the child's ink is not drawn in the next brief, and Maya draws it again", async () => {
    const s = setup();
    let view = ok(await s.calls.start({ kind: "chat", parentId: PARENT, childId: CHILD, childName: "Leah", grade: 3, package: PKG, startedBy: PARENT })).view;
    const board = deskBoard();
    // The question goes on the desk's board, then the child writes across the whole board.
    expect(board.mayaReply(view.batches)).toBe(view.batches.length);
    board.handBack();
    expect(board.penDown([0.01, 0.01], false, 1000)).toBe(true);
    board.penMove([[0.5, 0.35], [0.99, 0.66], [0.01, 0.66], [0.99, 0.01]]);
    board.penUp();
    s.advance(5);
    view = ok(await s.calls.input(view.id, view.revision, { type: "child", text: "I don't get 2 minus 8.", fates: chatBoardFates(board.view().history) }, "Leah")).view;
    const trade = view.batches.find(isTrade)!;
    expect(trade).toBeDefined();
    // The desk refuses the trade: it would cover the child's ink. The board records it as skipped.
    board.mayaReply(view.batches);
    const fates = chatBoardFates(board.view().history);
    expect(fates).toContainEqual({ batchId: trade.transactionId, fate: "skipped" });
    expect(fates.filter((f) => f.fate === "shown").map((f) => f.batchId)).toEqual(view.batches.filter((b) => !isTrade(b)).map((b) => b.transactionId));
    s.advance(5);
    view = ok(await s.calls.input(view.id, view.revision, { type: "child", text: "I still don't get it.", fates }, "Leah")).view;
    // The brief for that turn: the trade is neither drawn nor sent, so the kind offered it again, and it was drawn again.
    const brief = s.briefs.at(-1)!;
    expect(brief.drawn).not.toContain("trade:ones");
    expect(brief).not.toHaveProperty("sent");
    const again = view.batches.filter(isTrade);
    expect(again.length).toBe(2);
    ok(await s.calls.input(view.id, view.revision, { type: "end" }, "Leah"));
    const trace = (await s.store.get(view.id))!.trace!;
    expect(checkTrace(trace).ok).toBe(true);
    expect(trace.board.find((b) => b.transactionId === trade.transactionId)?.fate).toBe("skipped");
    expect(trace.counts.boardFates).toMatchObject({ skipped: 1, unreported: 1 });
    expect(trace.counts.boardFates!.shown).toBeGreaterThanOrEqual(1);
  });

  it("a batch the desk showed stays drawn; with no report it stays sent", async () => {
    const s = setup();
    let view = ok(await s.calls.start({ kind: "chat", parentId: PARENT, childId: CHILD, childName: "Leah", grade: 3, package: PKG, startedBy: PARENT })).view;
    const board = deskBoard();
    board.mayaReply(view.batches);
    s.advance(5);
    view = ok(await s.calls.input(view.id, view.revision, { type: "child", text: "I don't get 2 minus 8." }, "Leah")).view;
    // No report: the next brief lists the trade as sent.
    s.advance(5);
    view = ok(await s.calls.input(view.id, view.revision, { type: "child", text: "12?" }, "Leah")).view;
    expect(s.briefs.at(-1)!.sent).toEqual(["trade:ones"]);
    // The desk shows it: the next brief lists it as drawn.
    board.mayaReply(view.batches);
    s.advance(5);
    ok(await s.calls.input(view.id, view.revision, { type: "child", text: "12.", fates: chatBoardFates(board.view().history) }, "Leah"));
    expect(s.briefs.at(-1)!.drawn).toContain("trade:ones");
    expect(s.briefs.at(-1)).not.toHaveProperty("sent");
  });

  it("refuses a malformed report with the child's message", async () => {
    const s = setup();
    const view = ok(await s.calls.start({ kind: "chat", parentId: PARENT, childId: CHILD, childName: "Leah", grade: 3, package: PKG, startedBy: PARENT })).view;
    const r = await s.calls.input(view.id, view.revision, { type: "child", text: "Hi", fates: [{ batchId: "x", fate: "maybe" as never }] }, "Leah");
    expect(r).toEqual({ ok: false, error: "invalid_input" });
  });
});

describe("a voice call counts only the drawings the child's screen showed (B1)", () => {
  async function voice(s: ReturnType<typeof setup>) {
    const id = ok(await s.calls.startVoice({ kind: "family", parentId: PARENT, childId: CHILD, childName: "Leah", package: PKG, startedBy: PARENT })).view.id;
    const opened = await s.calls.openVoice(id, { speechToText: "fake", voice: "fake" }, "Leah");
    if (!opened.ok) throw new Error(opened.error);
    const opening = ((await opened.call.start()).boardCues ?? []).map((c) => c.batch);
    s.advance(5);
    const turn = await opened.call.child("I don't get 2 minus 8.");
    const trade = (turn.boardCues ?? []).map((c) => c.batch).find(isTrade)!;
    expect(trade).toBeDefined();
    return { call: opened.call, trade, opening };
  }

  it("a batch the child's screen cancelled (the child talked before its cue) leaves drawn", async () => {
    const s = setup();
    const { call, trade } = await voice(s);
    expect(call.session.tutor?.sent?.map((x) => x.batch)).toEqual([trade.transactionId]);
    const snapshot = { events: [{ kind: "cancelled" as const, batchIds: [trade.transactionId] }] };
    expect(snapshotFates(snapshot)).toEqual([{ batchId: trade.transactionId, fate: "cancelled" }]);
    await call.observeBoard(snapshot);
    expect(call.session.tutor?.drawn).not.toContain("trade:ones");
    expect(call.session.tutor?.sent).toBeUndefined();
    await call.settled();
  });

  it("a batch the child's screen showed stays drawn; a batch the core refused at staging is skipped", async () => {
    const s = setup();
    const { call, trade, opening } = await voice(s);
    await call.observeBoard({ events: [...opening, trade].map((b) => ({ kind: "batch" as const, batchId: b.transactionId, commands: [...b.commands] })) });
    expect(call.session.tutor?.drawn).toContain("trade:ones");
    expect(call.session.tutor?.sent).toBeUndefined();
    s.advance(5);
    const next = await call.child("I still don't get it.");
    const again = (next.boardCues ?? []).map((c) => c.batch).find(isTrade);
    // Shown, so the trade is not drawn twice.
    expect(again).toBeUndefined();
    const second = await voice(setup());
    second.call.boardRefused?.([second.trade.transactionId]);
    expect(second.call.session.tutor?.drawn).not.toContain("trade:ones");
    await call.settled();
    await second.call.settled();
  });
});
