import { describe, expect, it, vi } from "vitest";
import { templateSkills } from "@/lib/assessment";
import { learningEvents } from "@/lib/learning-events";
import { memoryLearningEventStore } from "@/lib/learning-events-memory";
import { memoryWordingHistoryStore, SAFETY_GUIDANCE } from "@/lib/maya";
import { mayaCalls, type CallResult, type CallSeams, type SpendCall } from "@/lib/maya-call";
import { memoryCallStore, memoryConnectionLog } from "@/lib/maya-call-memory";
import { childChatView } from "@/lib/maya-chat";
import type { MayaModel } from "@/lib/maya-model";
import { ruleMayaModel } from "@/lib/maya-model-fake";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { callSpend, chargeOf, createSpendLedger, spendConfig, usdToMicros, RESERVE_USD, SPEND_CLOSE, WEEK_MICROS, type CallSpend } from "@/lib/maya-spend";
import { SpendRefused } from "@/lib/maya-spend-ai";
import { memorySpendStore } from "@/lib/maya-spend-memory";
import { checkTrace } from "@/lib/maya-trace";
import type { QuestionPackage } from "@/lib/question-package";

vi.mock("server-only", () => ({}));

// Maya's spending cap in her calls (D-290, D-291), through the call module's public interface on in-memory seams: the
// model seam reserves and settles each request in the spending ledger the way the live metered client does
// (src/lib/maya-spend-ai.ts). At the cap Maya finishes what she is saying, then closes with code's line; the child's own
// words get one safety read, off the child's week; new chats and calls wait; admin test calls count only toward the
// month's total, which stops nobody.

const PARENT = "11111111-1111-4111-8111-111111111111";
const CHILD = "22222222-2222-4222-8222-222222222222";
const TEST = "33333333-3333-4333-8333-333333333333";
const WEEK = "2026-11-02";
const MONTH = "2026-11-01";
const CHAT_PKG = { ...SAMPLE_PACKAGES["add-27-39"], ref: { source: "workbook" as const, workbookId: "44444444-4444-4444-8444-444444444444", page: 1, question: 1 } };
const TEST_PKG: QuestionPackage = {
  ...SAMPLE_PACKAGES["add-27-39"],
  id: `${TEST}:s1-4`,
  ref: { source: "assessment", assessmentId: TEST, questionId: "s1-4" },
  templateId: "2-add-2-digit",
  skill: { standard: "2.4", skills: templateSkills("2-add-2-digit").map((k) => k.id) },
};
const ok = (r: CallResult) => {
  if (!r.ok) throw new Error(`refused: ${r.error}`);
  return r;
};

/** The rule player, reading "hurts me" for safety the way the real model's reading does. */
const readingModel = (): MayaModel => ({
  ...ruleMayaModel(),
  async propose(input, signal) {
    const p = (await ruleMayaModel().propose(input, signal)) as { reading?: Record<string, unknown> | null };
    const text = input.childTurn ?? "";
    // The configured safety classification applies even when the teaching rule player returns a close with no reading.
    if (text.includes("hurts me")) return { ...p, reading: { ...p.reading, safety: "concern" } };
    if (text.includes("naked")) return { ...p, reading: { ...p.reading, unsafeRequest: true } };
    return p;
  },
});

/** Only admin test calls are voice calls today: here one is charged like a child's. */
const theChilds = (spend: CallSpend): CallSpend => ({
  ...spend,
  state: (call) => spend.state({ ...call, kind: "chat" }),
  budget: (call) => spend.budget({ ...call, kind: "chat" }),
  voice: (call) => spend.voice({ ...call, kind: "chat" }),
});

function setup(options: { env?: Record<string, string>; costUsd?: number; voiceIsTheChilds?: boolean } = {}) {
  let now = Date.parse("2026-11-05T18:00:00Z");
  let n = 0;
  const newId = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
  const spendStore = memorySpendStore({ clock: () => now });
  const config = spendConfig(options.env ?? {});
  const ledger = createSpendLedger({ store: spendStore, clock: () => now, config, zone: async () => "America/Vancouver" });
  const store = memoryCallStore({ testFamilies: [PARENT] });
  const rule = ruleMayaModel();
  const sent = { count: 0 };
  /** The rule player behind the ledger: each request is reserved first and settled at `costUsd`. */
  const refuse = { next: false };
  const paid = (call: SpendCall | undefined, base: MayaModel = rule, how: { safetyRead?: boolean } = {}): MayaModel => ({
    ...base,
    async propose(input, signal) {
      if (how.safetyRead) {
        // As the live metered client: off the child's week, past the cap, and sent even with no ledger.
        const id = newId();
        await ledger.reserve({ id, charge: { kind: "global", parentId: call!.parentId, childId: call!.childId }, callId: call!.id, what: "model", micros: usdToMicros(RESERVE_USD.model, config), force: true }).then(() => ledger.settleUsd(id, options.costUsd ?? 0.05)).catch(() => {});
        sent.count++;
        return base.propose(input, signal);
      }
      if (refuse.next) { refuse.next = false; throw new SpendRefused("week_used"); }
      const id = newId();
      const r = await ledger.reserve({ id, charge: chargeOf(call!), callId: call!.id, what: "model", micros: usdToMicros(RESERVE_USD.model, config) });
      if (!r.ok) throw new SpendRefused(r.state);
      sent.count++;
      const proposal = await base.propose(input, signal);
      await ledger.settleUsd(id, options.costUsd ?? 0.05);
      return proposal;
    },
  });
  const alertSend = vi.fn(async () => {});
  const rebuild = vi.fn(async () => true);
  const seams: CallSeams = {
    store,
    connections: memoryConnectionLog(store, () => now),
    history: memoryWordingHistoryStore(),
    events: learningEvents(memoryLearningEventStore({ children: [{ id: CHILD, parentId: PARENT }], tests: [{ id: TEST, childId: CHILD }] })),
    rebuild,
    model: (id, call, how) => (id === null || id === rule.id ? paid(call, readingModel(), how) : null),
    isTestFamily: async (p) => p === PARENT,
    canChat: async () => true,
    alerts: { send: alertSend, list: async () => [] },
    spend: options.voiceIsTheChilds ? theChilds(callSpend(ledger, { clock: () => now, newId })) : callSpend(ledger, { clock: () => now, newId }),
    clock: () => now,
    newId,
    seed: () => 42,
  };
  const calls = mayaCalls(seams);
  return {
    seams, calls, store, spendStore, ledger, config, sent, paid, refuse, alertSend, rebuild,
    advance: (ms: number) => { now += ms; },
    /** The child's week used up to `left` micros of room. */
    leave: (left: number) => {
      const used = spendStore.rows().filter((r) => r.charge === "child" && r.week === WEEK).reduce((s, r) => s + (r.cost ?? r.reserved), 0);
      spendStore.spent({ charge: "child", parentId: PARENT, childId: CHILD, week: WEEK, month: MONTH }, WEEK_MICROS - used - left);
    },
    chat: () => calls.start({ kind: "chat", parentId: PARENT, childId: CHILD, childName: "Leah", package: CHAT_PKG, startedBy: PARENT }),
  };
}

const room = (t: ReturnType<typeof setup>) => usdToMicros(RESERVE_USD.model, t.config);

describe("a chat at the week's cap", () => {
  it("closes with code's line after one safety read when the week is used before the child's message", async () => {
    const t = setup();
    const r = ok(await t.chat());
    expect(t.sent.count).toBeGreaterThan(0);
    t.leave(0);
    const before = t.sent.count;
    t.advance(5000);
    const closed = ok(await t.calls.input(r.view.id, r.view.revision, { type: "child", text: "I got 66." }, "Leah"));
    expect(t.sent.count).toBe(before + 1);
    expect(closed.output.say).toEqual([SPEND_CLOSE.week_used.line]);
    const view = childChatView(closed.view);
    expect(view.ended).toBe(true);
    expect(view.transcript.at(-1)).toMatchObject({ speaker: "maya", text: SPEND_CLOSE.week_used.line });
    // The parent's note reads it as a call that ran out of time, not a problem on our side.
    expect(closed.view.outcome?.reason).toBe("time_limit");
    const row = t.store.rows()[0];
    expect(row.trace && checkTrace(row.trace).ok).toBe(true);
    // No new chat until the week resets.
    expect(await t.chat()).toEqual({ ok: false, error: "week_used" });
  });

  it("finishes the turn that reaches the cap, then closes with code's line", async () => {
    const t = setup({ costUsd: 0.14 });
    const r = ok(await t.chat());
    // Room for this turn's first request only.
    t.leave(room(t) + 1000);
    t.advance(5000);
    const turn = ok(await t.calls.input(r.view.id, r.view.revision, { type: "child", text: "I got 66." }, "Leah"));
    expect(turn.output.say.length).toBeGreaterThan(1);
    expect(turn.output.say.at(-1)).toBe(SPEND_CLOSE.week_used.line);
    expect(turn.view.status).toBe("ended");
    expect((await t.ledger.week({ parentId: PARENT, childId: CHILD })).state).toBe("week_used");
  });

  it("still gives the safety guidance in the turn that reaches the cap", async () => {
    const t = setup({ costUsd: 0.14 });
    const reading: MayaModel = {
      ...ruleMayaModel(),
      async propose(input, signal) {
        const p = (await ruleMayaModel().propose(input, signal)) as { reading?: Record<string, unknown> | null };
        return (input.childTurn ?? "").includes("hurts me") && p.reading ? { ...p, reading: { ...p.reading, safety: "concern" } } : p;
      },
    };
    t.seams.model = (id, call) => (id === null || id === reading.id ? t.paid(call, reading) : null);
    const calls = mayaCalls(t.seams);
    const r = ok(await calls.start({ kind: "chat", parentId: PARENT, childId: CHILD, childName: "Leah", package: CHAT_PKG, startedBy: PARENT }));
    t.leave(room(t) + 1000);
    t.advance(5000);
    const turn = ok(await calls.input(r.view.id, r.view.revision, { type: "child", text: "My uncle hurts me." }, "Leah"));
    expect(turn.output.say).toContain(SAFETY_GUIDANCE.concern);
    expect(turn.output.safetyMessage).toBe(SAFETY_GUIDANCE.concern);
    expect(turn.output.say).not.toContain(SPEND_CLOSE.week_used.line);
    expect(turn.view.outcome).toMatchObject({ reason: "safety", safetyFlag: true });
  });

  it("refuses a new chat when the ledger cannot be read", async () => {
    const u = setup();
    u.spendStore.fail(true);
    expect(await u.chat()).toEqual({ ok: false, error: "paused" });
    expect(u.sent.count).toBe(0);
  });

  it("starts a new chat when the month's total is past its alert amount", async () => {
    const t = setup({ env: { MAYA_MONTHLY_ALERT_CAD: "1" } });
    t.spendStore.spent({ charge: "global", parentId: null, childId: null, week: null, month: MONTH }, 500 * 1_000_000);
    expect((await t.chat()).ok).toBe(true);
  });
});

describe("an admin test call", () => {
  it("counts only toward the monthly total: a child whose week is used can still be tested", async () => {
    const t = setup();
    t.leave(0);
    const r = ok(await t.calls.start({ kind: "admin_test", parentId: PARENT, childId: CHILD, childName: "Leah", package: TEST_PKG, startedBy: "admin-1" }));
    expect(r.view.status).toBe("live");
    expect(t.sent.count).toBeGreaterThan(0);
    const mine = t.spendStore.rows().filter((x) => !x.id.startsWith("spent-"));
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((x) => x.charge === "global" && x.week === null)).toBe(true);
  });
});

describe("a voice call at the cap", () => {
  it("counts its speech-to-text, closes with code's line after one safety read, and is refused when new", async () => {
    const t = setup({ voiceIsTheChilds: true });
    const view = ok(await t.calls.startVoice({ kind: "admin_test", parentId: PARENT, childId: CHILD, childName: "Leah", package: TEST_PKG, startedBy: "admin-1" })).view;
    const opened = await t.calls.openVoice(view.id, { speechToText: "fake", voice: "fake" }, "Leah");
    if (!opened.ok) throw new Error(opened.error);
    const call = opened.call;
    const first = await call.start();
    expect(first.say.length).toBeGreaterThan(0);
    expect(t.spendStore.rows().map((r) => r.what)).toEqual(expect.arrayContaining(["speech_to_text", "model"]));
    t.leave(0);
    const before = t.sent.count;
    // Budget block (latency plan V1): the call keeps the model room its block reserved, so the cap closes the call at the
    // next paid request it cannot reserve: here the speech-to-text block due after a minute.
    t.advance(60_000);
    const turn = await call.child("I got 66.");
    expect(t.sent.count).toBe(before + 1);
    expect(turn).toMatchObject({ say: [SPEND_CLOSE.week_used.line], ended: true });
    await call.end({ reason: "child_stopped" });
    await call.settled();
    expect(t.store.rows()[0]).toMatchObject({ status: "ended" });
    expect(t.spendStore.rows().filter((r) => r.what === "speech_to_text").every((r) => r.settled)).toBe(true);
    // Budget block: the block gave its unused room back at the call's end, so the week is used up again for this check.
    t.leave(0);
    expect(await t.calls.startVoice({ kind: "admin_test", parentId: PARENT, childId: CHILD, childName: "Leah", package: TEST_PKG, startedBy: "admin-1" })).toEqual({ ok: false, error: "week_used" });
  });
});

describe("safety at the cap (review of PR #640)", () => {
  const child = (t: ReturnType<typeof setup>) => t.ledger.week({ parentId: PARENT, childId: CHILD });

  it("reads the child's words first: guidance, flag and alert, with one read that is not the child's", async () => {
    const t = setup();
    const r = ok(await t.chat());
    t.leave(0);
    const week = (await child(t)).usedMicros;
    const before = t.sent.count;
    t.advance(5000);
    const turn = ok(await t.calls.input(r.view.id, r.view.revision, { type: "child", text: "My uncle hurts me." }, "Leah"));
    expect(turn.output.say).toContain(SAFETY_GUIDANCE.concern);
    expect(turn.output.safetyMessage).toBe(SAFETY_GUIDANCE.concern);
    expect(turn.view.status).toBe("ended");
    expect(t.store.rows()[0].flag).toMatchObject({ level: "safety_concern" });
    expect(t.alertSend).toHaveBeenCalledWith(expect.objectContaining({ flag: expect.objectContaining({ level: "safety_concern" }) }));
    expect(t.sent.count).toBe(before + 1);
    expect((await child(t)).usedMicros).toBe(week);
  });

  it("closes with code's line when the words raise nothing, and says none of the model's words", async () => {
    const t = setup();
    const r = ok(await t.chat());
    t.leave(0);
    const before = t.sent.count;
    t.advance(5000);
    const turn = ok(await t.calls.input(r.view.id, r.view.revision, { type: "child", text: "I got 66." }, "Leah"));
    expect(turn.output.say).toEqual([SPEND_CLOSE.week_used.line]);
    expect(t.sent.count).toBe(before + 1);
    expect(t.alertSend).not.toHaveBeenCalled();
    expect(turn.view.outcome?.reason).toBe("time_limit");
  });

  it("reads them when the ledger cannot be read", async () => {
    const t = setup();
    const r = ok(await t.chat());
    t.spendStore.fail(true);
    t.advance(5000);
    const turn = ok(await t.calls.input(r.view.id, r.view.revision, { type: "child", text: "My uncle hurts me." }, "Leah"));
    expect(turn.output.say).toContain(SAFETY_GUIDANCE.concern);
    expect(t.store.rows()[0].flag).toMatchObject({ level: "safety_concern" });
  });

  it("reads them when the model request was refused in the middle of a turn", async () => {
    const t = setup();
    const r = ok(await t.chat());
    t.refuse.next = true;
    t.advance(5000);
    const turn = ok(await t.calls.input(r.view.id, r.view.revision, { type: "child", text: "My uncle hurts me." }, "Leah"));
    expect(turn.output.say).toContain(SAFETY_GUIDANCE.concern);
    expect(t.store.rows()[0].flag).toMatchObject({ level: "safety_concern" });
  });

  it("gives a voice call the same, as guidance the worker follows", async () => {
    const t = setup({ voiceIsTheChilds: true });
    const view = ok(await t.calls.startVoice({ kind: "admin_test", parentId: PARENT, childId: CHILD, childName: "Leah", package: TEST_PKG, startedBy: "admin-1" })).view;
    const opened = await t.calls.openVoice(view.id, { speechToText: "fake", voice: "fake" }, "Leah");
    if (!opened.ok) throw new Error(opened.error);
    await opened.call.start();
    t.leave(0);
    // Budget block (latency plan V1): the close comes at the speech-to-text block due after a minute.
    t.advance(60_000);
    const turn = await opened.call.child("My uncle hurts me.");
    expect(turn).toMatchObject({ guidance: SAFETY_GUIDANCE.concern, safetyMessage: SAFETY_GUIDANCE.concern, priority: true, ended: true });
    await opened.call.settled();
    expect(t.store.rows()[0].flag).toMatchObject({ level: "safety_concern" });
    expect(t.alertSend).toHaveBeenCalled();
  });
});

describe("safety past the teaching clock and the words it may say (review 2 of PR #640)", () => {
  const LIMIT_MS = 601_000;

  it("reads a danger in a chat past its 10 minutes at the cap: guidance, flag and alert", async () => {
    const t = setup();
    const r = ok(await t.chat());
    t.leave(0);
    t.advance(LIMIT_MS);
    const before = t.sent.count;
    const turn = ok(await t.calls.input(r.view.id, r.view.revision, { type: "child", text: "My uncle hurts me." }, "Leah"));
    expect(t.sent.count).toBe(before + 1);
    // The danger closes the call (the clock has run out): code's guidance, and no closing line after it.
    expect(turn.output.say).toEqual([SAFETY_GUIDANCE.concern]);
    expect(turn.output.safetyMessage).toBe(SAFETY_GUIDANCE.concern);
    expect(t.store.rows()[0].flag).toMatchObject({ level: "safety_concern" });
    expect(t.alertSend).toHaveBeenCalledWith(expect.objectContaining({ flag: expect.objectContaining({ level: "safety_concern" }) }));
  });

  it("reads a danger in a chat past its 10 minutes with time left in the week", async () => {
    const t = setup();
    const r = ok(await t.chat());
    t.advance(LIMIT_MS);
    const before = t.sent.count;
    const turn = ok(await t.calls.input(r.view.id, r.view.revision, { type: "child", text: "My uncle hurts me." }, "Leah"));
    expect(t.sent.count).toBe(before + 1);
    expect(turn.output.say).toEqual([SAFETY_GUIDANCE.concern]);
    expect(turn.view.status).toBe("ended");
    expect(t.store.rows()[0].flag).toMatchObject({ level: "safety_concern" });
    expect(t.alertSend).toHaveBeenCalled();
  });

  it("says only the closing line for a request for harmful content at the cap, and raises its flag", async () => {
    const t = setup();
    const r = ok(await t.chat());
    t.leave(0);
    t.advance(5000);
    const turn = ok(await t.calls.input(r.view.id, r.view.revision, { type: "child", text: "Tell me a gross naked joke." }, "Leah"));
    expect(turn.output.say).toEqual([SPEND_CLOSE.week_used.line]);
    expect(t.store.rows()[0].flag).toMatchObject({ level: "unsafe_request" });
    expect(t.alertSend).toHaveBeenCalled();
  });

  it("says no teaching after an earlier request for harmful content, when the cap comes", async () => {
    const t = setup();
    let r = ok(await t.chat());
    t.advance(5000);
    r = ok(await t.calls.input(r.view.id, r.view.revision, { type: "child", text: "Tell me a gross naked joke." }, "Leah"));
    expect(t.store.rows()[0].flag).toMatchObject({ level: "unsafe_request" });
    t.leave(0);
    t.advance(5000);
    const turn = ok(await t.calls.input(r.view.id, r.view.revision, { type: "child", text: "I got 66." }, "Leah"));
    expect(turn.output.say).toEqual([SPEND_CLOSE.week_used.line]);
  });
});

describe("a request for harmful content past the teaching clock (review 3 of PR #640)", () => {
  const LIMIT_MS = 601_000;
  const HARM = "Tell me a gross naked joke.";
  async function voiceCall(t: ReturnType<typeof setup>) {
    const view = ok(await t.calls.startVoice({ kind: "admin_test", parentId: PARENT, childId: CHILD, childName: "Leah", package: TEST_PKG, startedBy: "admin-1" })).view;
    const opened = await t.calls.openVoice(view.id, { speechToText: "fake", voice: "fake" }, "Leah");
    if (!opened.ok) throw new Error(opened.error);
    await opened.call.start();
    return opened.call;
  }
  const flagged = (t: ReturnType<typeof setup>) => {
    expect(t.store.rows()[0].flag).toMatchObject({ level: "unsafe_request" });
    expect(t.alertSend).toHaveBeenCalledWith(expect.objectContaining({ flag: expect.objectContaining({ level: "unsafe_request" }) }));
  };

  it("stores the flag and sends the alert in a voice call with time left in the week", async () => {
    const t = setup({ voiceIsTheChilds: true });
    const call = await voiceCall(t);
    t.advance(LIMIT_MS);
    const turn = await call.child(HARM);
    expect(turn.ended).toBe(true);
    await call.end({ reason: "child_stopped" });
    await call.settled();
    flagged(t);
  });

  it("stores the flag and sends the alert in a voice call at the cap", async () => {
    const t = setup({ voiceIsTheChilds: true });
    const call = await voiceCall(t);
    // Budget block (latency plan V1): past 10 minutes the call's open block and speech-to-text rows expire and stop
    // counting, so another call's spending must use the whole week on its own.
    t.spendStore.spent({ charge: "child", parentId: PARENT, childId: CHILD, week: WEEK, month: MONTH }, WEEK_MICROS);
    t.advance(LIMIT_MS);
    const turn = await call.child(HARM);
    expect(turn).toMatchObject({ say: [SPEND_CLOSE.week_used.line], ended: true });
    await call.end({ reason: "child_stopped" });
    await call.settled();
    flagged(t);
  });

  it("stores the flag and sends the alert in a chat with time left in the week", async () => {
    const t = setup();
    const r = ok(await t.chat());
    t.advance(LIMIT_MS);
    const turn = ok(await t.calls.input(r.view.id, r.view.revision, { type: "child", text: HARM }, "Leah"));
    expect(turn.view.status).toBe("ended");
    expect(turn.output.say).toEqual([]);
    flagged(t);
  });

  it("stores the flag and sends the alert in a chat at the cap", async () => {
    const t = setup();
    const r = ok(await t.chat());
    t.leave(0);
    t.advance(LIMIT_MS);
    const turn = ok(await t.calls.input(r.view.id, r.view.revision, { type: "child", text: HARM }, "Leah"));
    expect(turn.output.say).toEqual([SPEND_CLOSE.week_used.line]);
    flagged(t);
  });
});

describe("a voice call's meter (review of PR #640)", () => {
  async function open(t: ReturnType<typeof setup>) {
    const view = ok(await t.calls.startVoice({ kind: "admin_test", parentId: PARENT, childId: CHILD, childName: "Leah", package: TEST_PKG, startedBy: "admin-1" })).view;
    const opened = await t.calls.openVoice(view.id, { speechToText: "fake", voice: "fake" }, "Leah");
    if (!opened.ok) throw new Error(opened.error);
    return opened.call;
  }
  const rows = (t: ReturnType<typeof setup>, what: string) => t.spendStore.rows().filter((r) => r.what === what);

  it("charges no voice for a turn, and counts it when the worker says it was spoken", async () => {
    const t = setup();
    const call = await open(t);
    await call.start();
    expect(rows(t, "voice")).toHaveLength(0);
    await call.spoken("x".repeat(100));
    expect(rows(t, "voice")).toHaveLength(1);
  });

  it("renews speech-to-text with no input from the child", async () => {
    const t = setup();
    const call = await open(t);
    await call.start();
    for (let s = 0; s < 130; s += 10) {
      t.advance(10_000);
      expect(await call.meter()).toBeNull();
    }
    const blocks = rows(t, "speech_to_text");
    expect(blocks.length).toBeGreaterThanOrEqual(3);
    expect(blocks.filter((b) => !b.settled)).toHaveLength(1);
  });

  it("closes an idle call with code's line when speech-to-text no longer fits, and only once", async () => {
    const t = setup({ voiceIsTheChilds: true });
    const view = ok(await t.calls.startVoice({ kind: "admin_test", parentId: PARENT, childId: CHILD, childName: "Leah", package: TEST_PKG, startedBy: "admin-1" })).view;
    const opened = await t.calls.openVoice(view.id, { speechToText: "fake", voice: "fake" }, "Leah");
    if (!opened.ok) throw new Error(opened.error);
    await opened.call.start();
    t.leave(0);
    t.advance(60_000);
    expect(await opened.call.meter()).toMatchObject({ say: [SPEND_CLOSE.week_used.line], ended: true });
    expect(await opened.call.meter()).toBeNull();
    // Speech-to-text runs until the call has ended after its closing line, and is counted to then (review 2).
    expect(rows(t, "speech_to_text").filter((b) => !b.settled)).toHaveLength(1);
    await opened.call.end({ reason: "child_stopped" });
    await opened.call.settled();
    expect(rows(t, "speech_to_text").every((b) => b.settled)).toBe(true);
  });

  it("closes at once when speech-to-text cannot be renewed during a model request, and counts it to the end (review 2)", async () => {
    const t = setup({ voiceIsTheChilds: true });
    let release: () => void = () => {};
    let hold = false;
    const model = t.seams.model;
    t.seams.model = (id, call, how) => {
      const m = model(id, call, how);
      return m && { ...m, async propose(input, signal) {
        const p = m.propose(input, signal);
        if (hold && !how?.safetyRead) await new Promise<void>((resolve) => { release = resolve; });
        return p;
      } };
    };
    const calls = mayaCalls(t.seams);
    const view = ok(await calls.startVoice({ kind: "admin_test", parentId: PARENT, childId: CHILD, childName: "Leah", package: TEST_PKG, startedBy: "admin-1" })).view;
    const opened = await calls.openVoice(view.id, { speechToText: "fake", voice: "fake" }, "Leah");
    if (!opened.ok) throw new Error(opened.error);
    const call = opened.call;
    await call.start();
    const start = t.spendStore.rows().filter((r) => r.what === "speech_to_text").length;
    expect(start).toBe(1);
    hold = true;
    const working = call.child("I got 66.");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(call.working).toBe(true);
    // While the model request runs, the child's other spending leaves too little for the next minute of speech-to-text.
    t.leave(5000);
    t.advance(50_000);
    const closed = await call.meter();
    expect(closed).toMatchObject({ say: [SPEND_CLOSE.week_used.line], ended: true });
    t.advance(30_000);
    release();
    expect(await working).toMatchObject({ say: [] });
    await call.end({ reason: "child_stopped" });
    await call.settled();
    const stt = t.spendStore.rows().filter((r) => r.what === "speech_to_text");
    expect(stt.every((b) => b.settled)).toBe(true);
    // 80 seconds of speech-to-text, all counted.
    expect(stt.reduce((sum, b) => sum + (b.cost ?? 0), 0)).toBeGreaterThanOrEqual(usdToMicros((79 / 60) * 0.01, t.config));
  });

  it("gives the call to the profile rebuild, so its AI request can be counted", async () => {
    const t = setup();
    const r = ok(await t.chat());
    const closed = ok(await t.calls.input(r.view.id, r.view.revision, { type: "end" }, "Leah"));
    expect(closed.view.status).toBe("ended");
    expect(t.rebuild).toHaveBeenCalledWith(CHILD, expect.objectContaining({ call: expect.objectContaining({ id: r.view.id, kind: "chat", parentId: PARENT, childId: CHILD }) }));
  });
});

describe("a voice call's budget block (latency plan V1, 2026-11-13)", () => {
  /** A block's age limit: retired before the 10-minute expiry of an unsettled reservation. */
  const RETIRE_MS = 8 * 60_000;
  /**
   * The model seam, recording for each paid model request the spend store's requests since `mark` when it went out;
   * `hold` keeps every paid request waiting until `release`.
   */
  function watched(t: ReturnType<typeof setup>) {
    const at: string[][] = [];
    let from = 0;
    let gate: Promise<void> | null = null;
    let open: () => void = () => {};
    const base = readingModel();
    const recording: MayaModel = { ...base, async propose(input, signal) {
      at.push(t.spendStore.log().slice(from));
      if (gate) await gate;
      return base.propose(input, signal);
    } };
    t.seams.model = (id, call, how) => (id === null || id === recording.id ? t.paid(call, recording, how) : null);
    t.seams.canCallVoice = async () => true;
    return {
      at, calls: mayaCalls(t.seams),
      mark: () => { from = t.spendStore.log().length; at.length = 0; },
      hold: () => { gate = new Promise<void>((r) => { open = r; }); },
      release: () => { gate = null; open(); },
    };
  }
  async function familyVoice(calls: ReturnType<typeof mayaCalls>) {
    const view = ok(await calls.startVoice({ kind: "family", parentId: PARENT, childId: CHILD, childName: "Leah", package: CHAT_PKG, startedBy: PARENT })).view;
    const opened = await calls.openVoice(view.id, { speechToText: "fake", voice: "fake" }, "Leah");
    if (!opened.ok) throw new Error(opened.error);
    await opened.call.start();
    return opened.call;
  }
  /** The child's week used up to `left` micros, counting every row (an open reservation at its amount). */
  const fill = (t: ReturnType<typeof setup>, left: number) => {
    const used = t.spendStore.rows().filter((r) => r.charge === "child" && r.week === WEEK).reduce((s, r) => s + (r.cost ?? r.reserved), 0);
    if (WEEK_MICROS - used - left > 0) t.spendStore.spent({ charge: "child", parentId: PARENT, childId: CHILD, week: WEEK, month: MONTH }, WEEK_MICROS - used - left);
  };
  /**
   * Another call uses the week up to room for speech-to-text only, and also takes the room each settle gives back; then
   * the call's block reaches its age limit.
   */
  function weekGoneAndBlockOld(t: ReturnType<typeof setup>) {
    const keep = 60_000;
    fill(t, keep);
    const settle = t.spendStore.settle.bind(t.spendStore);
    t.spendStore.settle = async (id, micros) => { const m = await settle(id, micros); fill(t, keep); return m; };
    t.advance(RETIRE_MS);
  }
  const childModelRows = (t: ReturnType<typeof setup>, callId: string) => t.spendStore.rows().filter((r) => r.what === "model" && r.charge === "child" && r.callId === callId);
  const tick = () => new Promise((r) => setTimeout(r, 0));

  it("makes no database request between a voice turn's start and its model request", async () => {
    const t = setup();
    const w = watched(t);
    const call = await familyVoice(w.calls);
    t.advance(3000);
    w.mark();
    const turn = await call.child("I got 66.");
    expect(turn.say.length).toBeGreaterThan(0);
    expect(w.at[0]).toEqual([]);
  });

  it("sends no paid request at the cap: the block is old, the refill refused, and the turn closes with code's line", async () => {
    const t = setup();
    const w = watched(t);
    const call = await familyVoice(w.calls);
    weekGoneAndBlockOld(t);
    const before = t.sent.count;
    const rows = childModelRows(t, call.id).map((r) => r.id);
    const turn = await call.child("I got 66.");
    // The one request is the safety read, off the child's week.
    expect(t.sent.count).toBe(before + 1);
    expect(turn).toMatchObject({ say: [SPEND_CLOSE.week_used.line], ended: true });
    expect(childModelRows(t, call.id).map((r) => r.id)).toEqual(rows);
    expect(t.alertSend).not.toHaveBeenCalled();
  });

  it("keeps the guidance, the flag and the alert for danger words in the turn the cap closes", async () => {
    const t = setup();
    const w = watched(t);
    const call = await familyVoice(w.calls);
    weekGoneAndBlockOld(t);
    const before = t.sent.count;
    const turn = await call.child("My uncle hurts me.");
    expect(t.sent.count).toBe(before + 1);
    expect(turn).toMatchObject({ guidance: SAFETY_GUIDANCE.concern, safetyMessage: SAFETY_GUIDANCE.concern, priority: true, ended: true });
    await call.settled();
    expect(t.store.rows()[0].flag).toMatchObject({ level: "safety_concern" });
    expect(t.alertSend).toHaveBeenCalledWith(expect.objectContaining({ flag: expect.objectContaining({ level: "safety_concern" }) }));
  });

  /**
   * The overlap cases of the review: a block with room for one or two model attempts (the start turn costs most of it),
   * and the rest of the week used, so no refill comes.
   */
  async function tight(attempts: 1 | 2) {
    const cost = { costUsd: attempts === 1 ? 0.4 : 0.2 };
    const t = setup(cost);
    const w = watched(t);
    const call = await familyVoice(w.calls);
    fill(t, 0);
    cost.costUsd = 0.05;
    t.advance(3000);
    // A live danger's guidance reaches the worker at once, beside the turn's own answer.
    const heard: string[] = [];
    call.onGuidance((turn) => { heard.push(...turn.say, ...(turn.guidance ? [turn.guidance] : [])); });
    const guided = (turn: Awaited<ReturnType<typeof call.child>>) => {
      expect([...turn.say, ...(turn.guidance ? [turn.guidance] : []), ...heard].join(" ")).toContain(SAFETY_GUIDANCE.concern);
      expect(turn.safetyMessage).toBe(SAFETY_GUIDANCE.concern);
    };
    return { t, w, call, guided };
  }
  const flagged = (t: ReturnType<typeof setup>) => {
    expect(t.store.rows()[0].flag).toMatchObject({ level: "safety_concern" });
    expect(t.alertSend).toHaveBeenCalledWith(expect.objectContaining({ flag: expect.objectContaining({ level: "safety_concern" }) }));
  };

  it("overlap: a child turn admitted, then a silence check-in during it: the check-in neither closes the call nor blocks the child", async () => {
    const { t, w, call, guided } = await tight(1);
    w.hold();
    const child = call.child("My uncle hurts me.");
    await tick();
    expect(call.working).toBe(true);
    const checkIn = await call.tick();
    expect(checkIn).toMatchObject({ say: [], ended: false });
    w.release();
    guided(await child);
    // The worker ends the call after the guidance: the flag is stored with the end.
    await call.end({ reason: "child_stopped" });
    await call.settled();
    flagged(t);
  });

  it("overlap: a check-in admitted, then a child turn with danger words: the child is admitted and guided", async () => {
    const { t, w, call, guided } = await tight(2);
    t.advance(20_000);
    w.hold();
    w.mark();
    const checkIn = call.tick();
    await tick();
    const child = call.child("My uncle hurts me.");
    await tick();
    // Both turns' model requests are out at once: the turns overlap.
    expect(w.at).toHaveLength(2);
    w.release();
    await checkIn;
    guided(await child);
    // The worker ends the call after the guidance: the flag is stored with the end.
    await call.end({ reason: "child_stopped" });
    await call.settled();
    flagged(t);
  });

  it("overlap: with room for one attempt a check-in leaves it to the child's words", async () => {
    const { t, w, call, guided } = await tight(1);
    t.advance(20_000);
    expect(await call.tick()).toMatchObject({ say: [], ended: false });
    w.mark();
    guided(await call.child("My uncle hurts me."));
    // The child's words went to the model on the block's attempt, not to a safety read at the cap.
    expect(w.at.length).toBeGreaterThan(0);
    // The worker ends the call after the guidance: the flag is stored with the end.
    await call.end({ reason: "child_stopped" });
    await call.settled();
    flagged(t);
  });

  it("refuses a new voice call to a child at exactly the cap, as before", async () => {
    const u = setup();
    u.leave(0);
    u.seams.canCallVoice = async () => true;
    expect(await mayaCalls(u.seams).startVoice({ kind: "family", parentId: PARENT, childId: CHILD, childName: "Leah", package: CHAT_PKG, startedBy: PARENT })).toEqual({ ok: false, error: "week_used" });
  });

  it("leaves chat's requests as they were: a cap read, then the reserve, before the model request", async () => {
    const t = setup();
    const w = watched(t);
    const r = ok(await w.calls.start({ kind: "chat", parentId: PARENT, childId: CHILD, childName: "Leah", package: CHAT_PKG, startedBy: PARENT }));
    t.advance(5000);
    w.mark();
    ok(await w.calls.input(r.view.id, r.view.revision, { type: "child", text: "I got 66." }, "Leah"));
    expect(w.at[0]).toEqual(["used", "reserve"]);
  });
});
