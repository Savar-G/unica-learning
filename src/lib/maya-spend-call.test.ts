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
import { callSpend, chargeOf, createSpendLedger, spendConfig, usdToMicros, MICROS_PER_CAD, RESERVE_USD, SPEND_CLOSE, WEEK_MICROS } from "@/lib/maya-spend";
import { SpendRefused } from "@/lib/maya-spend-ai";
import { memorySpendStore } from "@/lib/maya-spend-memory";
import { checkTrace } from "@/lib/maya-trace";
import type { QuestionPackage } from "@/lib/question-package";

vi.mock("server-only", () => ({}));

// Maya's spending cap in her calls (D-290, D-291), through the call module's public interface on in-memory seams: the
// model seam reserves and settles each request in the spending ledger the way the live metered client does
// (src/lib/maya-spend-ai.ts). At the cap Maya finishes what she is saying, then closes with code's line and asks the
// model nothing more; new chats and calls wait; safety guidance still plays; admin test calls count only toward the
// monthly total.

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

function setup(options: { env?: Record<string, string>; costUsd?: number } = {}) {
  let now = Date.parse("2026-11-05T18:00:00Z");
  let n = 0;
  const newId = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
  const spendStore = memorySpendStore();
  const config = spendConfig(options.env ?? {});
  const ledger = createSpendLedger({ store: spendStore, clock: () => now, config, zone: async () => "America/Vancouver" });
  const store = memoryCallStore({ testFamilies: [PARENT] });
  const rule = ruleMayaModel();
  const sent = { count: 0 };
  /** The rule player behind the ledger: each request is reserved first and settled at `costUsd`. */
  const paid = (call: SpendCall | undefined, base: MayaModel = rule): MayaModel => ({
    ...base,
    async propose(input, signal) {
      const id = newId();
      const r = await ledger.reserve({ id, charge: chargeOf(call!), callId: call!.id, what: "model", micros: usdToMicros(RESERVE_USD.model, config) });
      if (!r.ok) throw new SpendRefused(r.state);
      sent.count++;
      const proposal = await base.propose(input, signal);
      await ledger.settleUsd(id, options.costUsd ?? 0.05);
      return proposal;
    },
  });
  const seams: CallSeams = {
    store,
    connections: memoryConnectionLog(store, () => now),
    history: memoryWordingHistoryStore(),
    events: learningEvents(memoryLearningEventStore({ children: [{ id: CHILD, parentId: PARENT }], tests: [{ id: TEST, childId: CHILD }] })),
    rebuild: async () => true,
    model: (id, call) => (id === null || id === rule.id ? paid(call) : null),
    isTestFamily: async (p) => p === PARENT,
    canChat: async () => true,
    alerts: { send: async () => {}, list: async () => [] },
    spend: callSpend(ledger, { clock: () => now, newId }),
    clock: () => now,
    newId,
    seed: () => 42,
  };
  const calls = mayaCalls(seams);
  return {
    seams, calls, store, spendStore, ledger, config, sent, paid,
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
  it("closes with code's line and asks the model nothing when the week is used before the child's message", async () => {
    const t = setup();
    const r = ok(await t.chat());
    expect(t.sent.count).toBeGreaterThan(0);
    t.leave(0);
    const before = t.sent.count;
    t.advance(5000);
    const closed = ok(await t.calls.input(r.view.id, r.view.revision, { type: "child", text: "I got 66." }, "Leah"));
    expect(t.sent.count).toBe(before);
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

  it("refuses a new chat while Maya is paused for the month, and when the ledger cannot be read", async () => {
    const t = setup({ env: { MAYA_MONTHLY_CAP_CAD: "1" } });
    t.spendStore.spent({ charge: "global", parentId: null, childId: null, week: null, month: MONTH }, MICROS_PER_CAD);
    expect(await t.chat()).toEqual({ ok: false, error: "paused" });
    const u = setup();
    u.spendStore.fail(true);
    expect(await u.chat()).toEqual({ ok: false, error: "paused" });
    expect(u.sent.count).toBe(0);
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
  it("counts its speech-to-text and voice, closes with code's line after the words already said, and asks the model nothing", async () => {
    const t = setup({ env: { MAYA_MONTHLY_CAP_CAD: "2" } });
    const view = ok(await t.calls.startVoice({ kind: "admin_test", parentId: PARENT, childId: CHILD, childName: "Leah", package: TEST_PKG, startedBy: "admin-1" })).view;
    const opened = await t.calls.openVoice(view.id, { speechToText: "fake", voice: "fake" }, "Leah");
    if (!opened.ok) throw new Error(opened.error);
    const call = opened.call;
    const first = await call.start();
    expect(first.say.length).toBeGreaterThan(0);
    expect(t.spendStore.rows().map((r) => r.what)).toEqual(expect.arrayContaining(["speech_to_text", "model", "voice"]));
    // The month is used up by other calls.
    const used = t.spendStore.rows().reduce((s, r) => s + (r.cost ?? r.reserved), 0);
    t.spendStore.spent({ charge: "global", parentId: null, childId: null, week: null, month: MONTH }, 2 * MICROS_PER_CAD - used);
    const before = t.sent.count;
    t.advance(3000);
    const turn = await call.child("I got 66.");
    expect(t.sent.count).toBe(before);
    expect(turn).toMatchObject({ say: [SPEND_CLOSE.paused.line], ended: true });
    expect(t.spendStore.rows().filter((r) => r.what === "voice").length).toBeGreaterThanOrEqual(2);
    await call.end({ reason: "child_stopped" });
    await call.settled();
    expect(t.store.rows()[0]).toMatchObject({ status: "ended" });
    // No new call while Maya is paused.
    expect(await t.calls.startVoice({ kind: "admin_test", parentId: PARENT, childId: CHILD, childName: "Leah", package: TEST_PKG, startedBy: "admin-1" })).toEqual({ ok: false, error: "paused" });
  });
});
