import { afterEach, expect, it, vi } from "vitest";
import type { Batch } from "@/lib/board";
import { learningEvents } from "@/lib/learning-events";
import { memoryLearningEventStore } from "@/lib/learning-events-memory";
import { memoryWordingHistoryStore, type MathReviewInput, type MathReviewResult, type TalkReviewInput, type TalkReviewResult } from "@/lib/maya";
import { mayaCalls, type CallRecord, type CallResult, type CallSeams, type CallStore } from "@/lib/maya-call";
import { memoryCallStore, memoryConnectionLog } from "@/lib/maya-call-memory";
import { fakeMathReviewer } from "@/lib/maya-math-review";
import { conversationalFake, reply } from "@/lib/maya-model-fake";
import { checkTrace } from "@/lib/maya-trace";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { memorySpendStore } from "@/lib/maya-spend-memory";
import { fakeTalkReviewer } from "@/lib/maya-talk-review";
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
const PASS: TalkReviewResult = { verdict: "pass" };
const TRADE = "We trade 1 ten for 10 ones.";
const FIRST = "12 minus 8 is 4.";
const NEXT = "What do you get for 4 minus 2 in the tens?";
const STUCK = "I don't get 2 minus 8.";
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
  function worker(reader = false) {
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
      tutorFamilies: true, ...(opts.streamChat === null ? {} : { streamChat: reader ? false : opts.streamChat ?? true }), store, history: memoryWordingHistoryStore(),
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
const isTrade = (b: Batch) => b.commands.some((c) => (c as { op?: string }).op === "regroup");
const defer = () => Promise.withResolvers<void>();
afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

// All state and RPC seams are local fakes. The checkpoint uses the actual memory store's revision fence.
it.each(["before-correction", "during-correction", "failed-correction", "thrown-correction", "failed-both-saves", "failed-correction-final-ok", "corrected"] as const)("durable priority after %s", async (mode) => {
  const firstSaved = defer(), returnFirst = defer(), rawHeld = defer(), correctionEntered = defer(), returnCorrection = defer(), finishModel = defer();
  let saves = 0;
  let blockFinal = false;
  const s = setup({}, { store: base => ({ ...base, update: async (id, revision, change) => {
    if (blockFinal) return false;
    return base.update(id, revision, change);
  }, checkpoint: async (id, revision, live) => {
    const n = ++saves;
    if (n === 1) {
      const accepted = await base.checkpoint!(id, revision, live);
      firstSaved.resolve();
      await returnFirst.promise;
      return accepted;
    }
    correctionEntered.resolve();
    if (mode === "thrown-correction") throw Error("correction unavailable");
    if (mode === "during-correction") await returnCorrection.promise;
    if (["failed-correction", "thrown-correction", "failed-both-saves", "failed-correction-final-ok"].includes(mode)) return false;
    return base.checkpoint!(id, revision, live);
  } }) });
  const wholeProposal = reply(`${TRADE} ${FIRST}`, "guide", { gate: "none", reading: { safety: "concern" } });
  const whole = JSON.stringify(wholeProposal);
  let modelRequests = 0;
  s.first.model.propose = async (_input, _signal, onText) => {
    modelRequests++;
    onText?.(whole.slice(0, whole.indexOf(',"act"')));
    await firstSaved.promise;
    onText?.(whole);
    rawHeld.resolve();
    await finishModel.promise;
    return wholeProposal;
  };
  const view = await s.begin();
  const t = s.first.turn(view, STUCK);
  let oldResult: unknown;
  try {
    await rawHeld.promise;
    expect(t.heard).toEqual([]);
    const before = (await s.store.get(view.id))!;
    expect(before.live!.text.log?.some(e => e.kind === "part_pending" || e.kind === "part")).toBe(true);
    expect(before.live!.text.log?.some(e => e.kind === "stream_hold")).toBe(false);
    if (mode !== "before-correction") {
      returnFirst.resolve();
      await correctionEntered.promise;
      if (mode === "corrected") await vi.waitFor(async () => expect((await s.store.get(view.id))!.live!.text.log?.some(e => e.kind === "stream_hold")).toBe(true));
      if (["failed-correction", "thrown-correction", "failed-both-saves", "failed-correction-final-ok"].includes(mode)) await new Promise<void>(r => setImmediate(r));
    }
    if (mode === "failed-both-saves" || mode === "failed-correction-final-ok") {
      s.advance(121000); // Past the message lease, below the call limit.
      blockFinal = mode === "failed-both-saves";
      finishModel.resolve();
      oldResult = await t.result;
      blockFinal = false;
      const record = (await s.store.get(view.id))!;
      const fresh = s.worker(true);
      const recovered = mode === "failed-both-saves" ? ok(await fresh.api.input(view.id, record.revision, { type: "child", text: STUCK }, "Leah")) : ok(oldResult as CallResult);
      const ended = ok(await fresh.api.input(view.id, recovered.view.revision, { type: "end" }, "Leah"));
      const note = s.notes.at(-1)!;
    const checked = checkTrace(note.trace!);
    expect(checked.ok ? null : checked.reason).toBeNull();
      expect(ended.view.status).toBe("ended");
      expect(t.heard).toEqual([]);
      expect(fresh.briefs()).toEqual([]);
      if (mode === "failed-correction-final-ok") {
        expect(lastMaya(recovered.view)).toMatch(/^Thank you for telling me\./);
        expect(note.outcome?.safetyFlag).toBe(true);
      } else {
        expect(note.outcome?.reason).toBe("technical_issue");
        expect(note.trace?.turns).toContainEqual(expect.objectContaining({ kind: "technical", detail: expect.stringContaining("unknown") }));
        expect(note.outcome?.safetyFlag).toBe(false);
      }
      expect(recovered.view.transcript.map(x => x.text).join(" ")).not.toContain(TRADE);
      expect(recovered.view.batches.filter(isTrade)).toEqual([]);
      expect(note.outcome?.assistance).toBe("independent");
      return;
    }
    s.advance(121000); // Past the 2-minute claim lease.
    // A replacement claim obtains a new revision before the old request can repair or save its final result.
    expect(await s.store.update(view.id, view.revision, {})).toBe(true);
    const persisted = (await s.store.get(view.id))!;
    const fresh = s.worker(true);
    const recovered = ok(await fresh.api.input(view.id, persisted.revision, { type: "child", text: STUCK }, "Leah"));
    const ended = ok(await fresh.api.input(view.id, recovered.view.revision, { type: "end" }, "Leah"));
    returnFirst.resolve(); returnCorrection.resolve(); finishModel.resolve();
    oldResult = await t.result;
    const note = s.notes.at(-1)!;
    const checked = checkTrace(note.trace!);
    expect(checked.ok ? null : checked.reason).toBeNull();
    expect(fresh.briefs()).toEqual([]);
    expect(oldResult).toMatchObject({ ok: false, error: "conflict" });
    expect(t.heard).toEqual([]);
    expect(ended.view.transcript.filter(x => x.speaker === "child" && x.text === STUCK)).toHaveLength(1);
    // Falsifier: recovery treats pending teaching as delivered or invents an unstored safety reading.
    if (mode === "corrected") {
      expect(lastMaya(recovered.view)).toMatch(/^Thank you for telling me\./);
      expect(note.outcome?.safetyFlag).toBe(true);
    } else {
      expect(note.outcome?.reason).toBe("technical_issue");
      expect(note.trace?.turns).toContainEqual(expect.objectContaining({ kind: "technical", detail: expect.stringContaining("unknown") }));
      expect(note.outcome?.safetyFlag).toBe(false);
    }
    expect(modelRequests).toBe(1);
    const repeated = ok(await fresh.api.input(view.id, ended.view.revision, { type: "end" }, "Leah"));
    expect(repeated.view.revision).toBe(ended.view.revision);
    expect(s.notes).toHaveLength(1);
    expect(s.appended).toHaveLength(1);
    expect(recovered.view.transcript.map(x => x.text).join(" ")).not.toContain(TRADE);
    expect(recovered.view.batches.filter(isTrade)).toEqual([]);
    expect(note.outcome?.assistance).toBe("independent");
  } finally {
    returnFirst.resolve(); returnCorrection.resolve(); finishModel.resolve();
    await t.result;
  }
});

it.each(["before-dispatch", "after-dispatch", "confirmation-refused", "confirmation-threw", "confirmed", "confirmed-prefix"] as const)("recovery and direct end retain honest delivery after %s", async (mode) => {
  // Falsifier: a pending part becomes accepted, a confirmed prefix disappears, or the old owner sends a successor.
  const boundary = defer(), release = defer(), finish = defer();
  let saves = 0, failFinal = false;
  const cut = mode === "before-dispatch" ? 1 : mode === "confirmed-prefix" ? 3 : 2;
  const s = setup({}, { store: base => ({ ...base,
    update: (id, revision, change) => failFinal ? Promise.resolve(false) : base.update(id, revision, change),
    checkpoint: async (id, revision, live) => {
      const n = ++saves;
      if (n !== cut) return base.checkpoint!(id, revision, live);
      if (mode === "before-dispatch" || mode === "confirmed" || mode === "confirmed-prefix") {
        const accepted = await base.checkpoint!(id, revision, live);
        boundary.resolve();
        await release.promise;
        return accepted;
      }
      boundary.resolve();
      await release.promise;
      if (mode === "confirmation-threw") throw Error("confirmation unavailable");
      if (mode === "confirmation-refused") return false;
      return base.checkpoint!(id, revision, live);
    },
  }) });
  const proposal = reply(`${TRADE} ${FIRST}`, "guide");
  s.first.model.propose = async (_input, _signal, onText) => {
    const whole = JSON.stringify(proposal);
    onText?.(whole.slice(0, whole.indexOf(',"act"')));
    await finish.promise;
    return proposal;
  };
  const view = await s.begin();
  const old = s.first.turn(view, STUCK);
  try {
    await boundary.promise;
    const confirmed = mode === "confirmed" || mode === "confirmed-prefix";
    expect(old.heard.map(h => h.text)).toEqual(mode === "before-dispatch" ? [] : [TRADE]);
    const current = (await s.store.get(view.id))!;
    expect(current.live!.text.session.assistance.length > 0).toBe(confirmed);
    if (mode === "confirmation-refused" || mode === "confirmation-threw") {
      failFinal = true;
      release.resolve(); finish.resolve();
      expect(await old.result).toEqual({ ok: false, error: "conflict" });
      failFinal = false;
    } else {
      expect(await s.store.update(view.id, view.revision, {})).toBe(true);
    }
    const record = (await s.store.get(view.id))!;
    const fresh = s.worker(true);
    // Direct end is the same public boundary the sweep uses. No child replay is needed for that boundary.
    const direct = mode === "before-dispatch" || mode === "confirmed-prefix";
    const recovered = ok(await fresh.api.input(view.id, record.revision, direct ? { type: "end" } : { type: "child", text: STUCK }, "Leah"));
    const ended = direct ? recovered : ok(await fresh.api.input(view.id, recovered.view.revision, { type: "end" }, "Leah"));
    const note = s.notes.at(-1)!;
    const checked = checkTrace(note.trace!);
    expect(checked.ok ? null : checked.reason).toBeNull();
    expect(ended.view.status).toBe("ended");
    expect(note.outcome?.reason).toBe("technical_issue");
    expect(note.outcome?.safetyFlag).toBe(false);
    expect(note.outcome?.assistance).toBe(confirmed ? "hint" : "independent");
    expect(note.trace?.turns).toContainEqual(expect.objectContaining({ kind: "technical", detail: expect.stringContaining("unknown") }));
    const message = ended.view.transcript.map(t => t.text).join(" ");
    expect(message.includes(TRADE)).toBe(confirmed);
    expect(message).not.toContain(FIRST);
    expect(ended.view.batches.filter(isTrade)).toHaveLength(confirmed ? 1 : 0);
    if (confirmed) expect(ended.view.batches.filter(isTrade)).toEqual(old.heard[0].board);
    expect(ended.view.transcript.filter(t => t.speaker === "child" && t.text === STUCK)).toHaveLength(1);
    expect(fresh.briefs()).toEqual([]);
    expect(fresh.talk.requests).toEqual([]);
    expect(fresh.math.requests).toEqual([]);
    expect(await fresh.api.input(view.id, ended.view.revision, { type: "end" }, "Leah")).toMatchObject({ ok: true });
    expect(s.notes).toHaveLength(1);
    expect(s.appended).toHaveLength(1);
    release.resolve(); finish.resolve();
    expect(await old.result).toEqual({ ok: false, error: "conflict" });
    expect(old.heard.map(h => h.text)).toEqual(mode === "before-dispatch" ? [] : [TRADE]);
  } finally { release.resolve(); finish.resolve(); await old.result; }
});

it("a legacy accepted part retains its words, batch ids and help through public recovery and end", async () => {
  // Falsifier: a compatible reader drops legacy progress or asks a model to recover it.
  const boundary = defer(), release = defer(), finish = defer();
  let saves = 0;
  const s = setup({}, { store: base => ({ ...base, checkpoint: async (id, revision, live) => {
    const accepted = await base.checkpoint!(id, revision, live);
    if (++saves === 2) { boundary.resolve(); await release.promise; }
    return accepted;
  } }) });
  const proposal = reply(`${TRADE} ${FIRST}`, "guide");
  s.first.model.propose = async (_input, _signal, onText) => {
    const whole = JSON.stringify(proposal);
    onText?.(whole.slice(0, whole.indexOf(',"act"')));
    await finish.promise;
    return proposal;
  };
  const view = await s.begin();
  const old = s.first.turn(view, STUCK);
  try {
    await boundary.promise;
    const record = (await s.store.get(view.id))!;
    const live = record.live!;
    // An old saved-history fixture, read only through the public call boundary.
    live.text.log = live.text.log!.flatMap(e => e.kind === "part_confirmed" ? [] : [e.kind === "part_pending" ? { ...e, kind: "part" as const } : e]);
    expect(await s.store.update(view.id, record.revision, { live })).toBe(true);
    const fresh = s.worker(true);
    const recovered = ok(await fresh.api.input(view.id, record.revision + 1, { type: "child", text: STUCK }, "Leah"));
    expect(lastMaya(recovered.view).startsWith(TRADE)).toBe(true);
    expect(recovered.view.batches.filter(isTrade)).toEqual(old.heard[0].board);
    expect(fresh.briefs()).toEqual([]);
    const ended = ok(await fresh.api.input(view.id, recovered.view.revision, { type: "end" }, "Leah"));
    expect(ended.view.outcome?.assistance).toBe("hint");
    expect(s.notes).toHaveLength(1);
    expect(s.appended).toHaveLength(1);
  } finally { release.resolve(); finish.resolve(); await old.result; }
});
