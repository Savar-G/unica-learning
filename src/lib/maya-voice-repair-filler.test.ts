import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { learningEvents } from "@/lib/learning-events";
import { memoryLearningEventStore } from "@/lib/learning-events-memory";
import { memoryWordingHistoryStore, type MathReviewInput, type MathReviewResult } from "@/lib/maya";
import { mayaCalls } from "@/lib/maya-call";
import { memoryCallStore, memoryConnectionLog } from "@/lib/maya-call-memory";
import { fakeMathReviewer } from "@/lib/maya-math-review";
import { conversationalFake, reply } from "@/lib/maya-model-fake";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { fakeTalkReviewer } from "@/lib/maya-talk-review";
import { createTextSession, TUTOR_REPAIR_BUDGET_MS, VOICE_REPAIR_BUDGET_MS } from "@/lib/maya-text";
import { checkTrace, TRACE_VERSION, type MayaTrace } from "@/lib/maya-trace";
import { ACK_PHRASES, nextAcknowledgement } from "@/lib/maya-voice-ack";
import { operationResult, workedSteps, type OperationPackage } from "@/lib/question-package";

// After #1072 (2026-11-15), the Chief of Staff rule: a child must not sit in silence for up to 10 s. On a voice turn,
// when a refused tutor message gets its repair, the worker's thinking phrase is said at once (only when nothing of the
// turn was said yet), and the repair with its reviews ends inside VOICE_REPAIR_BUDGET_MS, else code's line. Chat keeps
// TUTOR_REPAIR_BUDGET_MS for the model. Fake models and fake reviews; the budgets run on the real clock.

const SUB = SAMPLE_PACKAGES["subtract-52-28"] as OperationPackage;
const op = { kind: "subtract" as const, operands: [83, 34] as [number, number] };
const P83 = { ...SUB, id: "subtract-83-34", text: "83 − 34 = ?", operation: op, answer: { value: operationResult(op), accepted: [], unit: null }, steps: workedSteps(op) } as OperationPackage;
const TRUE: MathReviewResult = { verdict: "true", reason: "all true" };
const FALSE: MathReviewResult = { verdict: "false", reason: "the judgment is false" };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ACK_TEXT = new Set(ACK_PHRASES.map((p) => p.text));

/** Refused by the math review (#1074's case): the first attempt. */
const BAD = "You're right, so we trade.";
const FIRST = `${BAD} What is 13 minus 4?`;
const GOOD = "We trade 1 ten for 10 ones. What is 13 minus 4?";
/** A repair the math review must read (an agreement with a true fact): its review time counts in the voice budget. */
const REVIEWED = "You're right that 3 is too small to take 4 away. We trade 1 ten for 10 ones. What is 13 minus 4?";
const CHILD = "I don't get 3 minus 4";
const LINE = /^Let me say that another way\./;

interface Heard { text: string; at: number }

/**
 * One tutor session. `voice`: the hooks of a voice call (onSayPart and onRepairStart, modelRepair false); otherwise chat
 * (onRepairStart is still given, to prove chat never calls it). The worker fake picks a phrase by the worker's own rule
 * (`nextAcknowledgement`, no repeat) and returns null when `worker` says it said one already.
 */
function call(voice: boolean, says: (n: number, heard: Heard[]) => string | Promise<string>, opts: { math?: ReturnType<typeof fakeMathReviewer>; worker?: "says" | "said_already"; reviewTimeLimitMs?: number; reading?: Record<string, unknown> } = {}) {
  let now = Date.UTC(2026, 10, 15, 18, 0, 0);
  const heard: Heard[] = [];
  const used: string[] = [];
  let asked = 0;
  const math = opts.math ?? fakeMathReviewer((i: MathReviewInput) => (i.sentence === BAD ? FALSE : TRUE));
  const model = conversationalFake({ answer: async (_brief, n) => reply(await says(n, heard), "guide", opts.reading ? { reading: opts.reading } : {}) });
  const onRepairStart = () => {
    asked++;
    if (opts.worker === "said_already") return null;
    const phrase = nextAcknowledgement("voice-filler", used);
    if (!phrase) return null;
    used.push(phrase.id);
    heard.push({ text: phrase.text, at: Date.now() });
    return phrase.id;
  };
  const session = createTextSession({
    callId: "voice-filler", package: P83, model, clock: () => (now += 100), random: 3, tutor: true,
    reviewTimeLimitMs: opts.reviewTimeLimitMs ?? 10_000, reviewer: fakeTalkReviewer(), mathReviewer: math, onRepairStart,
    ...(voice ? { modelRepair: false, onSayPart: (text: string) => heard.push({ text, at: Date.now() }) } : {}),
  });
  return { session, heard, model, math, asked: () => asked };
}

const attempts = (trace: MayaTrace) => trace.turns.flatMap((t) => (t.kind === "maya" ? t.attempts : []));

describe("the thinking phrase when a voice repair starts", () => {
  it("is the first thing the child hears, before the repair's model answers, and the trace keeps its id", async () => {
    let fillerBeforeRepair = false;
    const c = call(true, async (n, heard) => {
      if (n === 0) return FIRST;
      // The repair's model call: the phrase is already said.
      fillerBeforeRepair = heard.length === 1 && ACK_TEXT.has(heard[0].text);
      await sleep(300);
      return GOOD;
    });
    await c.session.start();
    c.heard.length = 0;
    const out = await c.session.child(CHILD);
    expect(c.model.briefs).toHaveLength(2);
    expect(fillerBeforeRepair).toBe(true);
    expect(ACK_TEXT.has(c.heard[0].text)).toBe(true);
    expect(c.heard.slice(1).map((h) => h.text).join(" ")).toBe(GOOD);
    // The phrase came at the repair's start, the repair's words at least its model time later.
    expect(c.heard[1].at - c.heard[0].at).toBeGreaterThanOrEqual(250);
    // The phrase is the worker's, not a turn: it is not in Maya's saved words.
    expect(out.say.join(" ")).toBe(GOOD);
    const trace = await c.session.finish({ reason: "child_stopped" });
    expect(checkTrace(trace)).toMatchObject({ ok: true });
    expect(trace.version).toBe(TRACE_VERSION);
    expect(TRACE_VERSION).toBe(13);
    const repair = attempts(trace).find((a) => a.source === "repair")!;
    expect(repair.filler).toBe(ACK_PHRASES.find((p) => p.text === c.heard[0].text)!.id);
    expect(attempts(trace).filter((a) => a.filler)).toHaveLength(1);
    expect(trace.counts).toMatchObject({ repairs: 1, fillers: 1, fallbacks: 0 });
    // The trace contract: a phrase id only from version 13, only a known one, only on a repair attempt.
    expect(checkTrace({ ...trace, version: 12 } as never).ok).toBe(false);
    const bogus = structuredClone(trace);
    attempts(bogus).find((a) => a.source === "repair")!.filler = "ack.bogus";
    expect(checkTrace(bogus).ok).toBe(false);
    const onModel = structuredClone(trace);
    attempts(onModel).find((a) => a.source === "model")!.filler = repair.filler;
    expect(checkTrace(onModel).ok).toBe(false);
  });

  it("is not in chat: the hook is never called, and the repair is said with no phrase", async () => {
    const c = call(false, (n) => (n === 0 ? FIRST : GOOD));
    await c.session.start();
    const out = await c.session.child(CHILD);
    expect(c.asked()).toBe(0);
    expect(c.heard).toEqual([]);
    expect(out.say.join(" ")).toBe(GOOD);
    const trace = await c.session.finish({ reason: "child_stopped" });
    expect(checkTrace(trace)).toMatchObject({ ok: true });
    expect(attempts(trace).some((a) => a.filler !== undefined)).toBe(false);
    expect(trace.counts).toMatchObject({ repairs: 1, fillers: 0 });
  });

  it("is not recorded when the worker said none (a phrase already played in the turn)", async () => {
    const c = call(true, (n) => (n === 0 ? FIRST : GOOD), { worker: "said_already" });
    await c.session.start();
    c.heard.length = 0;
    await c.session.child(CHILD);
    expect(c.asked()).toBe(1);
    expect(c.heard.map((h) => h.text).join(" ")).toBe(GOOD);
    const trace = await c.session.finish({ reason: "child_stopped" });
    expect(checkTrace(trace)).toMatchObject({ ok: true });
    expect(trace.counts).toMatchObject({ repairs: 1, fillers: 0 });
  });

  it("is not asked for when no repair runs (the first message passes)", async () => {
    const c = call(true, () => GOOD);
    await c.session.start();
    c.heard.length = 0;
    await c.session.child(CHILD);
    expect(c.asked()).toBe(0);
    expect(c.heard.map((h) => h.text).join(" ")).toBe(GOOD);
  });

  // The AI disclosure, safety guidance and a stop are code's own turns: they come first, and a repair never follows them.
  const priority: [string, string, Record<string, unknown>][] = [
    ["the AI disclosure", "Are you an AI?", { aboutMaya: "identity" }],
    ["safety guidance", "Someone hurts me.", { safety: "concern" }],
    ["a stop", "I want to stop.", { stop: true }],
  ];
  for (const [what, child, reading] of priority) {
    it(`is never said on a turn of ${what}`, async () => {
      // The model reads the turn as the child said it, with words the math review refuses: a repair would call the hook.
      const c = call(true, () => FIRST, { math: fakeMathReviewer(() => FALSE), reading });
      await c.session.start();
      c.heard.length = 0;
      await c.session.child(child);
      expect(c.asked()).toBe(0);
      expect(c.heard.some((h) => ACK_TEXT.has(h.text))).toBe(false);
      const trace = await c.session.finish({ reason: "child_stopped" });
      expect(attempts(trace).some((a) => a.filler !== undefined)).toBe(false);
    });
  }
});

describe("the voice repair's own time (VOICE_REPAIR_BUDGET_MS)", () => {
  it("is 4 s on a voice turn and 6 s in chat", () => {
    expect(VOICE_REPAIR_BUDGET_MS).toBe(4_000);
    expect(TUTOR_REPAIR_BUDGET_MS).toBe(6_000);
  });

  it("a voice repair whose model runs past 4 s ends in code's line at the cap", async () => {
    const c = call(true, async (n) => { if (n === 0) return FIRST; await sleep(4_600); return GOOD; });
    await c.session.start();
    c.heard.length = 0;
    const t0 = Date.now();
    const out = await c.session.child(CHILD);
    const ms = Date.now() - t0;
    expect(ms).toBeGreaterThanOrEqual(3_900);
    expect(ms).toBeLessThan(4_500);
    expect(out.say.join(" ")).toMatch(LINE);
    // The phrase first, then code's line: never the late repair.
    expect(ACK_TEXT.has(c.heard[0].text)).toBe(true);
    expect(c.heard.slice(1).map((h) => h.text).join(" ")).toMatch(LINE);
    const trace = await c.session.finish({ reason: "child_stopped" });
    expect(checkTrace(trace)).toMatchObject({ ok: true });
    expect(attempts(trace).find((a) => a.source === "repair")).toMatchObject({ error: { code: "timeout" } });
    expect(trace.counts).toMatchObject({ repairs: 1, fallbacks: 1, fillers: 1 });
  }, 15_000);

  it("the same repair in chat still has its 6 s: it is said", async () => {
    const c = call(false, async (n) => { if (n === 0) return FIRST; await sleep(4_600); return GOOD; });
    await c.session.start();
    const out = await c.session.child(CHILD);
    expect(out.say.join(" ")).toBe(GOOD);
  }, 15_000);

  it("counts the repair's review in the 4 s on a voice turn: a review that ends past the cap gives code's line", async () => {
    // The repair's model takes 2.5 s and its math review 2.5 s more: 5 s in all, with a review limit of 10 s.
    const asked: string[] = [];
    const slow = (repairs: { n: number }) => {
      const math = fakeMathReviewer((i: MathReviewInput) => (i.sentence === BAD ? FALSE : TRUE));
      return Object.assign(Object.create(math), { review: async (i: MathReviewInput, sig: AbortSignal) => { asked.push(i.sentence); if (repairs.n > 0 && i.sentence !== BAD) await sleep(2_500); return math.review(i, sig); } }) as typeof math;
    };
    const voiceTurns = { n: 0 };
    const c = call(true, async (n) => { if (n === 0) return FIRST; voiceTurns.n++; await sleep(2_500); return REVIEWED; }, { math: slow(voiceTurns) });
    await c.session.start();
    const t0 = Date.now();
    const out = await c.session.child(CHILD);
    const ms = Date.now() - t0;
    expect(asked.some((sentence) => sentence.startsWith("You're right that 3"))).toBe(true);
    expect(out.say.join(" ")).toMatch(LINE);
    expect(ms).toBeLessThan(4_500);
    const trace = await c.session.finish({ reason: "child_stopped" });
    expect(checkTrace(trace)).toMatchObject({ ok: true });
    expect(trace.counts).toMatchObject({ repairs: 1, fallbacks: 1 });

    // Chat: the same timing passes (the review keeps its own limit after the model's 6 s).
    const chatTurns = { n: 0 };
    const chat = call(false, async (n) => { if (n === 0) return FIRST; chatTurns.n++; await sleep(2_500); return REVIEWED; }, { math: slow(chatTurns) });
    await chat.session.start();
    expect((await chat.session.child(CHILD)).say.join(" ")).toBe(REVIEWED);
  }, 30_000);
});

describe("through a voice call (openVoice): the worker's `repairing` hook", () => {
  it("is called when the repair starts, and the call's trace keeps the phrase id", async () => {
    const P = "11111111-1111-4111-8111-111111111111", C = "22222222-2222-4222-8222-222222222222", W = "44444444-4444-4444-8444-444444444444";
    let now = Date.UTC(2026, 10, 15), id = 0;
    const clock = () => now;
    const store = memoryCallStore({ testFamilies: [P], clock });
    const events = memoryLearningEventStore({ children: [{ id: C, parentId: P }] });
    const model = conversationalFake({ id: "fake-v3", answer: (_: unknown, n: number) => reply(n === 0 ? FIRST : GOOD, "guide") });
    const calls = mayaCalls({
      store, connections: memoryConnectionLog(store, clock), history: memoryWordingHistoryStore(), events: learningEvents(events), rebuild: async () => true,
      model: () => model, reviewer: () => fakeTalkReviewer(), mathReviewer: () => fakeMathReviewer((i: MathReviewInput) => (i.sentence === BAD ? FALSE : TRUE)),
      isTestFamily: async () => true, alerts: { send: async () => {}, list: async () => [] }, clock,
      newId: () => `00000000-0000-4000-8000-${String(++id).padStart(12, "0")}`, seed: () => 3,
    });
    const start = await calls.startVoice({ kind: "admin_test", parentId: P, childId: C, childName: "Ava", startedBy: "admin-1", package: { ...P83, ref: { source: "workbook", workbookId: W, page: 1, question: 1 } } });
    if (!start.ok) throw Error(start.error);
    const open = await calls.openVoice(start.view.id, { speechToText: "fake", voice: "fake" }, "Ava");
    if (!open.ok) throw Error(open.error);
    await open.call.start();
    now += 5000;
    const order: string[] = [];
    const phrase = ACK_PHRASES[2];
    const turn = await open.call.child(CHILD, undefined, {
      repairing: () => { order.push("phrase"); return phrase.id; },
      part: (sentence) => order.push(sentence),
    });
    await open.call.settled();
    expect(order[0]).toBe("phrase");
    expect(turn.say.join(" ")).toBe(GOOD);
    await open.call.end({ reason: "child_stopped" });
    const trace = store.rows().find((r) => r.id === start.view.id)!.trace!;
    expect(checkTrace(trace)).toMatchObject({ ok: true });
    expect(attempts(trace).find((a) => a.source === "repair")?.filler).toBe(phrase.id);
    expect(trace.counts.fillers).toBe(1);
  });
});
