import { describe, expect, it, vi } from "vitest";
import type { Batch } from "@/lib/board";
import { learningEvents } from "@/lib/learning-events";
import { memoryLearningEventStore } from "@/lib/learning-events-memory";
import { memoryWordingHistoryStore, type MathReviewInput, type MathReviewResult, type TalkReviewInput, type TalkReviewResult } from "@/lib/maya";
import { mayaCalls, type CallRecord, type CallResult, type CallSeams, type CallStore } from "@/lib/maya-call";
import { memoryCallStore, memoryConnectionLog } from "@/lib/maya-call-memory";
import { fakeMathReviewer } from "@/lib/maya-math-review";
import { conversationalFake, reply } from "@/lib/maya-model-fake";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { RESERVATION_TTL_MS } from "@/lib/maya-spend";
import { memorySpendStore } from "@/lib/maya-spend-memory";
import { fakeTalkReviewer } from "@/lib/maya-talk-review";
import { createTextSession, REVIEW_FLOOR_MS, VOICE_REPAIR_BUDGET_MS } from "@/lib/maya-text";
import { checkTrace } from "@/lib/maya-trace";
import type { TutorBrief } from "@/lib/maya/tutor-prompt";
import type { OperationPackage } from "@/lib/question-package";

// #1107: desk chat says Maya's checked sentences as they pass, each with the drawing fixed for it, and saves each one in
// the call before the desk gets it. Tested at the call module's public interface with the in-memory seams. Fake models
// and fake reviewers only; the model is held open with `beforeEnd`, so each test sees what reached the desk (and the
// store) while the reply was still coming in.

const PARENT = "11111111-1111-4111-8111-111111111111";
const CHILD = "22222222-2222-4222-8222-222222222222";
const WORKBOOK = "44444444-4444-4444-8444-444444444444";
const SUB52 = { ...(SAMPLE_PACKAGES["subtract-52-28"] as OperationPackage), ref: { source: "workbook" as const, workbookId: WORKBOOK, page: 1, question: 1 } };
const TRUE: MathReviewResult = { verdict: "true", reason: "all true" };
const FALSE: MathReviewResult = { verdict: "false", reason: "it is not true" };
const PASS: TalkReviewResult = { verdict: "pass" };
const TRADE = "We trade 1 ten for 10 ones.";
const FIRST = "12 minus 8 is 4.";
const NEXT = "What do you get for 4 minus 2 in the tens?";
const BAD = "Try again: what is 2 minus 8 in the ones?";
const STUCK = "I don't get 2 minus 8.";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const WEEK = { childId: CHILD, week: "2026-11-09", month: "2026-11-01" };

/** Maya's outputs for a child's words: the first, then the repair. */
type Script = Record<string, (string | Record<string, unknown>)[]>;
type Heard = { text: string; board: Batch[] };

function setup(script: Script, opts: { kind?: "chat" | "admin_test"; streamChat?: boolean | null; math?: (i: MathReviewInput) => MathReviewResult; talk?: (i: TalkReviewInput) => TalkReviewResult; store?: (base: CallStore) => CallStore; extra?: Parameters<typeof reply>[2] } = {}) {
  let now = Date.UTC(2026, 10, 15, 16);
  let n = 0;
  const base = memoryCallStore({ testFamilies: [PARENT] });
  const store = opts.store ? opts.store(base) : base;
  const spend = memorySpendStore({ clock: () => now });
  const notes: CallRecord[] = [];
  const events = learningEvents(memoryLearningEventStore({ children: [{ id: CHILD, parentId: PARENT }], tests: [] }));
  const appended: unknown[] = [];
  let reservation = 0;
  /** One process: its own model (held open until `release`) and reviewers, on the shared store and ledger. */
  function worker() {
    let release: () => void = () => {};
    let hold = false;
    const calls = new Map<string, number>();
    const model = conversationalFake({
      answer: (brief) => {
        const child = (brief as unknown as TutorBrief).childTurn ?? "";
        const k = calls.get(child) ?? 0;
        calls.set(child, k + 1);
        const out = script[child]?.[k] ?? script[child]?.at(-1) ?? NEXT;
        return typeof out === "string" ? reply(out, "guide", opts.extra ?? {}) : out;
      },
      stream: { chunk: 9, beforeEnd: () => (hold ? new Promise<void>((r) => { release = r; }) : Promise.resolve()) },
    });
    // As a metered request (maya-spend-ai): reserved before it goes, settled when it answers.
    const send = model.propose.bind(model);
    model.propose = async (input, signal, onText, onCost) => {
      const id = `reservation-${++reservation}`;
      await spend.reserve({ id, charge: "child", parentId: PARENT, childId: CHILD, callId: null, what: "model", micros: 100, week: WEEK.week, weekMicros: 10_000_000, month: WEEK.month, force: false });
      // Let each network chunk arrive after the preceding chunk's saves and review callbacks. Separate tests hold
      // a save and deliver later metadata before releasing it, so both possible orders are covered.
      let chunks = Promise.resolve();
      const out = await send(input, signal, onText ? (text) => {
        chunks = chunks.then(async () => { onText(text); await new Promise<void>((resolve) => setImmediate(resolve)); });
      } : undefined, onCost);
      await chunks;
      await spend.settle(id, 100);
      return out;
    };
    const talk = fakeTalkReviewer((i) => (opts.talk ?? (() => PASS))(i));
    const math = fakeMathReviewer((i) => (opts.math ?? (() => TRUE))(i));
    const seams: CallSeams = {
      // Positive feature cases opt in. Null exercises the production default, which has no writer permission.
      tutorFamilies: true, ...(opts.streamChat === null ? {} : { streamChat: opts.streamChat ?? true }), store, history: memoryWordingHistoryStore(),
      events: { ...events, append: async (e) => { appended.push(e); return events.append(e); } } as typeof events,
      rebuild: vi.fn(async () => true), model: () => model,
      reviewer: () => talk, mathReviewer: () => math,
      isTestFamily: async (p) => p === PARENT, canChat: async () => true, canCallVoice: async () => true,
      connections: memoryConnectionLog(base, () => now), note: async ({ call }) => { notes.push(structuredClone(call)); return "done" as const; },
      alerts: { send: async () => {}, list: async () => [] },
      clock: () => now, newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`, seed: () => 42,
    };
    const api = mayaCalls(seams);
    /** One child turn with the desk's ear; the model stays open until `release`. */
    const turn = (view: { id: string; revision: number }, text: string) => {
      hold = true;
      now += 5000;
      const heard: Heard[] = [];
      let done = false;
      const result = api.input(view.id, view.revision, { type: "child", text }, "Leah", { part: (sentence, index, board) => { heard[index] = { text: sentence, board: board ?? [] }; } })
        .then((r) => { done = true; return r; });
      return { heard, result, done: () => done, release: () => { hold = false; release(); } };
    };
    return { api, model, talk, math, turn, briefs: () => model.briefs as unknown as TutorBrief[] };
  }
  const first = worker();
  const begin = async () => ok(await first.api.start({ kind: opts.kind ?? "chat", parentId: PARENT, childId: CHILD, childName: "Leah", grade: 3, package: SUB52, startedBy: PARENT })).view;
  return { store: base, spend, notes, appended, begin, first, worker, advance: (ms: number) => { now += ms; } };
}

function ok(r: CallResult): Extract<CallResult, { ok: true }> {
  if (!r.ok) throw new Error(`refused: ${r.error}`);
  return r;
}
const lastMaya = (view: { transcript: { speaker: string; text: string }[] }) => view.transcript.filter((t) => t.speaker === "maya").at(-1)!.text;
const count = (text: string, part: string) => text.split(part).length - 1;
const texts = (heard: Heard[]) => heard.filter(Boolean).map((h) => h.text);
const ids = (bs: readonly { transactionId: string }[]) => bs.map((b) => b.transactionId);
const isTrade = (b: Batch) => b.commands.some((c) => (c as { op?: string }).op === "regroup");
/** The stored session of a call, read back as a fresh process reads it. */
async function stored(store: CallStore, id: string) {
  const r = (await store.get(id))!;
  return { record: r, session: createTextSession({ callId: id, package: r.live!.package, model: conversationalFake({ answer: () => { throw Error("not asked"); } }), clock: () => 0, resume: r.live!.text }) };
}

describe("#1107: a chat child turn streams its checked sentences, each saved first", () => {
  it.each([null, false])("reader-first release (streamChat=%s) never saves parts, even with a streaming listener", async (streamChat) => {
    // Falsifier: enabling writes by a header or a listener creates a checkpoint a supported old reader cannot read.
    const checkpoint = vi.fn(async () => true);
    const s = setup({ [STUCK]: [`${TRADE} ${FIRST} ${NEXT}`] }, { streamChat, store: (base) => ({ ...base, checkpoint }) });
    const view = await s.begin();
    const turn = s.first.turn(view, STUCK);
    await vi.waitFor(() => expect(s.first.briefs().length).toBe(1));
    turn.release();
    const result = ok(await turn.result);
    expect(turn.heard).toEqual([]);
    expect(checkpoint).not.toHaveBeenCalled();
    expect(lastMaya(result.view)).toBe(`${TRADE} ${FIRST} ${NEXT}`);
    const saved = (await s.store.get(view.id))!.live!.text;
    expect(saved.log?.some((e) => e.kind === "part" || e.kind === "part_pending" || e.kind === "part_confirmed" || e.kind === "stream_hold")).toBe(false);
  });

  it("an early accepted sentence reaches the desk before the model resolves; the saved message and the parent note hold the same words", async () => {
    // Falsifier: with no hooks for chat (the JSON-only path), nothing reaches the desk while the model is held.
    const s = setup({ "Is it 36?": [`${FIRST} ${NEXT}`] });
    const view = await s.begin();
    const t = s.first.turn(view, "Is it 36?");
    await vi.waitFor(() => expect(t.heard[0]?.text).toBe(FIRST), { timeout: 2000, interval: 5 });
    expect(t.done()).toBe(false);
    t.release();
    const r = ok(await t.result);
    expect(lastMaya(r.view)).toBe(`${FIRST} ${NEXT}`);
    expect(count(texts(t.heard).join(" "), FIRST)).toBe(1);
    expect(`${FIRST} ${NEXT}`.startsWith(texts(t.heard).join(" "))).toBe(true);
    const ended = ok(await s.first.api.input(r.view.id, r.view.revision, { type: "end" }, "Leah"));
    expect(ended.view.status).toBe("ended");
    const noted = s.notes.at(-1)!;
    const said = noted.trace!.turns.flatMap((x) => (x.kind === "maya" && x.output ? [x.output.say.join(" ")] : []));
    expect(said).toContain(`${FIRST} ${NEXT}`);
    expect(checkTrace(noted.trace!)).toMatchObject({ ok: true });
  });

  it("each sentence goes with the drawing fixed for it, before the model resolves; the final snapshot holds each batch once, same id and commands", async () => {
    // Falsifier: a drawing that waits for the whole message (no board with the sentence), or a batch twice in the reply.
    const s = setup({ [STUCK]: [`${TRADE} ${FIRST} ${NEXT}`] });
    const view = await s.begin();
    const t = s.first.turn(view, STUCK);
    await vi.waitFor(() => expect(t.heard[0]?.board.some(isTrade)).toBe(true), { timeout: 2000, interval: 5 });
    expect(t.heard[0].text).toBe(TRADE);
    expect(t.done()).toBe(false);
    t.release();
    const r = ok(await t.result);
    const early = t.heard.flatMap((h) => h.board);
    const finalIds = ids(r.view.batches);
    expect(new Set(finalIds).size).toBe(finalIds.length);
    for (const b of early) expect(r.view.batches.filter((x) => x.transactionId === b.transactionId)).toEqual([b]);
    // The saved trace ties each early batch to its sentence.
    const board = (await stored(s.store, view.id)).session.trace().board;
    for (const [i, h] of t.heard.entries()) for (const b of h.board) expect(board.find((x) => x.transactionId === b.transactionId)?.sentence).toBe(i);
  });

  it("a sentence the model marked \"no draw\" goes with no drawing, and never draws later", async () => {
    const s = setup({ [STUCK]: [`${TRADE} ${NEXT}`] }, { extra: { noDraw: [1] } });
    const view = await s.begin();
    const t = s.first.turn(view, STUCK);
    await vi.waitFor(() => expect(t.heard[0]?.text).toBe(TRADE), { timeout: 2000, interval: 5 });
    expect(t.heard[0].board).toEqual([]);
    t.release();
    const r = ok(await t.result);
    expect(r.view.batches.filter(isTrade)).toEqual([]);
  });

  it.each([
    ["written after \"say\"", { lateNoDraw: true }],
    ["missing", { noDraw: null }],
    ["malformed", { noDraw: ["one"] as unknown as number[] }],
  ])("a \"noDraw\" %s allows no early drawing, and the streamed sentence never draws later", async (_, extra) => {
    // Falsifier: an early batch without a valid decision before "say", or a late decision that draws a sentence already sent.
    const s = setup({ [STUCK]: [`${TRADE} ${NEXT}`] }, { extra });
    const view = await s.begin();
    const t = s.first.turn(view, STUCK);
    await vi.waitFor(() => expect(t.heard[0]?.text).toBe(TRADE), { timeout: 2000, interval: 5 });
    t.release();
    const r = ok(await t.result);
    expect(t.heard.flatMap((h) => h.board)).toEqual([]);
    expect(r.view.batches.filter(isTrade)).toEqual([]);
  });

  it("a refused later sentence never streams; the repair continues the fixed sentence once; its drawing stays", async () => {
    const s = setup({ [STUCK]: [`${TRADE} ${BAD}`, NEXT] }, { math: (i) => (i.sentence === BAD ? FALSE : TRUE) });
    const view = await s.begin();
    const t = s.first.turn(view, STUCK);
    await vi.waitFor(() => expect(t.heard[0]?.text).toBe(TRADE), { timeout: 2000, interval: 5 });
    t.release();
    const r = ok(await t.result);
    expect(texts(t.heard)).toEqual([TRADE]);
    expect(lastMaya(r.view)).toBe(`${TRADE} ${NEXT}`);
    expect(s.first.briefs().at(-1)!.repair!.alreadySaid).toEqual([TRADE]);
    expect(t.heard[0].board.length).toBe(1);
    expect(r.view.batches.filter((x) => x.transactionId === t.heard[0].board[0].transactionId)).toEqual(t.heard[0].board);
    expect(r.view.batches.filter(isTrade)).toHaveLength(1);
  });

  it("a sentence held for its review that fails never reaches the desk", async () => {
    const HELD = "You are so smart and I like you a lot.";
    const s = setup({ "Is it 36?": [`${FIRST} ${HELD} ${NEXT}`, NEXT] }, { talk: (i) => (JSON.stringify(i).includes("I like you") ? { verdict: "fail", rules: ["untrue_self"], reason: "a feeling Maya does not have" } as TalkReviewResult : PASS) });
    const view = await s.begin();
    const t = s.first.turn(view, "Is it 36?");
    t.release();
    const r = ok(await t.result);
    expect(texts(t.heard).join(" ")).not.toContain("I like you");
    expect(lastMaya(r.view)).not.toContain("I like you");
    expect(lastMaya(r.view).startsWith(texts(t.heard).join(" "))).toBe(true);
  });

  it.each([
    ["Are you a real person?", { gate: "identity", reading: { aboutMaya: "identity" } }],
    ["Someone at home hurts me.", { gate: "safety", reading: { safety: "concern" } }],
  ] as const)("%s: nothing streams; code's own words come with the whole turn", async (child, extra) => {
    const s = setup({ [child]: [reply(`${FIRST} ${NEXT}`, "guide", extra as never)] });
    const view = await s.begin();
    const t = s.first.turn(view, child);
    await sleep(150);
    t.release();
    const r = ok(await t.result);
    expect(t.heard).toEqual([]);
    expect(r.output.say.join(" ")).not.toContain(FIRST);
  });

  it("a call that is not a chat ignores the ear (admin text calls never stream)", async () => {
    const s = setup({ "Is it 36?": [`${FIRST} ${NEXT}`] }, { kind: "admin_test" });
    const view = await s.begin();
    const t = s.first.turn(view, "Is it 36?");
    await sleep(150);
    t.release();
    ok(await t.result);
    expect(t.heard).toEqual([]);
  });
});

describe("#1107: progress is saved before the desk gets it, and a fresh process recovers it", () => {
  it.each(["refused", "threw"] as const)("a store that %s the save sends nothing early; the reply still holds the whole message", async (fail) => {
    // Falsifier: a part on the desk that the store did not take.
    const s = setup({ "Is it 36?": [`${FIRST} ${NEXT}`] }, { store: (b) => ({ ...b, checkpoint: async () => { if (fail === "threw") throw Error("store down"); return false; } }) });
    const view = await s.begin();
    const t = s.first.turn(view, "Is it 36?");
    await sleep(200);
    expect(t.heard).toEqual([]);
    t.release();
    const r = ok(await t.result);
    expect(t.heard).toEqual([]);
    expect(lastMaya(r.view)).toBe(`${FIRST} ${NEXT}`);
  });

  it("after the first saved part the process goes away; a fresh process recovers the same words and board with no model call, no second child turn and one record", async () => {
    // Falsifiers: the store holds nothing of the part while the model is held; the recovery asks a model or a review,
    // takes the child's words again, loses the sentence, its drawing or its help, credits a success, or writes a second
    // outcome, event or note; the old process writes or sends after the recovery took over.
    const s = setup({ [STUCK]: [`${TRADE} ${FIRST} ${NEXT}`] }, { math: (i) => (i.sentence === NEXT ? { verdict: "unsure", reason: "held" } as MathReviewResult : TRUE) });
    const view = await s.begin();
    const claim = view.revision;
    const old = s.first.turn(view, STUCK);
    await vi.waitFor(() => expect(old.heard[0]?.board.some(isTrade)).toBe(true), { timeout: 2000, interval: 5 });
    await sleep(50);
    const delivered = structuredClone(old.heard.filter(Boolean));
    // While held: the store holds every delivered part and its drawing, at the claim's own revision (still pending).
    const held = await stored(s.store, view.id);
    expect(held.record.revision).toBe(claim);
    expect(held.session.interrupted).toEqual({ text: STUCK });
    const savedHelp = held.session.session.assistance;
    expect(savedHelp.length).toBeGreaterThan(0);
    expect(s.spend.rows().filter((r) => !r.settled)).toHaveLength(1);
    // The process goes away (its final save never comes). The claim's recovery takes a new revision, then a fresh
    // process gives the same admitted message.
    expect(await s.store.update(view.id, claim, {})).toBe(true);
    const fresh = s.worker();
    s.advance(130_000);
    const r = ok(await fresh.api.input(view.id, claim + 1, { type: "child", text: STUCK }, "Leah"));
    expect(fresh.briefs()).toHaveLength(0);
    expect(fresh.talk.requests).toHaveLength(0);
    expect(fresh.math.requests).toHaveLength(0);
    expect(s.spend.rows()).toHaveLength(1);
    // The delivered words first, then code's line; each delivered drawing once, with the same id and commands.
    const said = lastMaya(r.view);
    expect(said.startsWith(texts(delivered).join(" "))).toBe(true);
    expect(count(said, TRADE)).toBe(1);
    for (const b of delivered.flatMap((h) => h.board)) expect(r.view.batches.filter((x) => x.transactionId === b.transactionId)).toEqual([b]);
    expect(r.view.transcript.filter((x) => x.speaker === "child" && x.text === STUCK)).toHaveLength(1);
    const saved = (await s.store.get(view.id))!;
    expect(saved.revision).toBe(r.view.revision);
    expect(saved.outcome?.reason).toBe("technical_issue");
    expect(saved.outcome?.assistance).not.toBe("independent");
    const checked = checkTrace(saved.trace!);
    expect(checked.ok ? null : checked.reason).toBeNull();
    // The dead request's reservation counts only until it expires (the ledger's rule); the recovery reserved nothing.
    const settled = s.spend.rows().filter((x) => x.settled).length;
    expect((await s.spend.used(WEEK)).week).toBe(100 * (settled + 1));
    s.advance(RESERVATION_TTL_MS + 1);
    expect((await s.spend.used(WEEK)).week).toBe(100 * settled);
    // The old process wakes: its save is refused, and the desk gets nothing more from it.
    old.release();
    expect(await old.result).toEqual({ ok: false, error: "conflict" });
    expect(old.heard.filter(Boolean)).toEqual(delivered);
    expect((await s.store.get(view.id))!.revision).toBe(r.view.revision);
    // One end: one outcome, one learning event, one note.
    const ended = ok(await fresh.api.input(view.id, r.view.revision, { type: "end" }, "Leah"));
    expect(ended.view.status).toBe("ended");
    expect(ended.view.outcome?.reason).not.toBe("solved");
    expect(s.appended).toHaveLength(1);
    expect(s.notes).toHaveLength(1);
    expect(checkTrace(s.notes[0].trace!)).toMatchObject({ ok: true });
    expect(await fresh.api.input(view.id, ended.view.revision, { type: "end" }, "Leah")).toMatchObject({ ok: true });
    expect(s.appended).toHaveLength(1);
    expect(s.notes).toHaveLength(1);
  });

  it("a recovered request with other words than the stopped turn's is a conflict, and the call is unchanged", async () => {
    const s = setup({ "Is it 36?": [`${FIRST} ${NEXT}`] });
    const view = await s.begin();
    const t = s.first.turn(view, "Is it 36?");
    await vi.waitFor(() => expect(t.heard[0]?.text).toBe(FIRST), { timeout: 2000, interval: 5 });
    expect(await s.store.update(view.id, view.revision, {})).toBe(true);
    const before = await s.store.get(view.id);
    expect(await s.worker().api.input(view.id, view.revision + 1, { type: "child", text: "Something else" }, "Leah")).toEqual({ ok: false, error: "conflict" });
    expect(await s.store.get(view.id)).toEqual(before);
  });

  it("an end of a call whose turn stopped after saved parts keeps them: the turn ends in code's line, then the call", async () => {
    const s = setup({ "Is it 36?": [`${FIRST} ${NEXT}`] }, { math: (i) => (i.sentence === NEXT ? { verdict: "unsure", reason: "held" } as MathReviewResult : TRUE) });
    const view = await s.begin();
    const t = s.first.turn(view, "Is it 36?");
    await vi.waitFor(() => expect(t.heard[0]?.text).toBe(FIRST), { timeout: 2000, interval: 5 });
    expect(await s.store.update(view.id, view.revision, {})).toBe(true);
    const fresh = s.worker();
    const ended = ok(await fresh.api.input(view.id, view.revision + 1, { type: "end" }, "Leah"));
    expect(fresh.briefs()).toHaveLength(0);
    expect(lastMaya(ended.view).startsWith(FIRST)).toBe(true);
    expect(s.notes).toHaveLength(1);
  });
});

describe("#1107: a streaming chat keeps chat's own timing; voice keeps voice's", () => {
  /** A tutor session as chat (channel "chat") or voice, both streaming, with a repair that takes `repairMs`. */
  function timed(voice: boolean, repairMs: number) {
    const heard: string[] = [];
    let k = 0;
    const model = conversationalFake({
      answer: async () => {
        if (k++ === 0) return reply(`${FIRST} ${BAD}`, "guide");
        await sleep(repairMs);
        return reply(NEXT, "guide");
      },
      stream: { chunk: 9 },
    });
    const s = createTextSession({
      callId: "timing", package: SUB52, model, clock: () => Date.now(), random: 3, tutor: true, reviewTimeLimitMs: 10_000,
      reviewer: fakeTalkReviewer(() => PASS), mathReviewer: fakeMathReviewer((i) => (i.sentence === BAD ? FALSE : TRUE)),
      onSayPart: (text) => heard.push(text), ...(voice ? { modelRepair: false } : { channel: "chat" as const }),
    });
    return { s, heard };
  }

  it("a chat repair past the voice budget still teaches (chat's repair budget), while voice ends in code's line", async () => {
    // Falsifier: chat that streams takes the voice repair budget (the old `onSayPart` test): its repair runs out.
    const repairMs = VOICE_REPAIR_BUDGET_MS - REVIEW_FLOOR_MS + 400;
    const chat = timed(false, repairMs);
    await chat.s.start();
    const said = (await chat.s.child("Is it 36?")).say.join(" ");
    expect(said).toBe(`${FIRST} ${NEXT}`);
    const voice = timed(true, repairMs);
    await voice.s.start();
    const spoken = (await voice.s.child("Is it 36?")).say.join(" ");
    expect(spoken.startsWith(FIRST)).toBe(true);
    expect(spoken).not.toContain(NEXT);
  }, 20_000);
});
