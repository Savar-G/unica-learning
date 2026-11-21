import { beforeEach, expect, it, vi } from "vitest";
import { learningEvents } from "@/lib/learning-events";
import { memoryLearningEventStore } from "@/lib/learning-events-memory";
import { memoryWordingHistoryStore, SAFETY_GUIDANCE, TIME_LIMITS } from "@/lib/maya";
import { mayaCalls, type CallResult, type CallSeams, type StartInput } from "@/lib/maya-call";
import { memoryCallStore, memoryConnectionLog } from "@/lib/maya-call-memory";
import { conversationalFake, reply } from "@/lib/maya-model-fake";
import type { ModelInput } from "@/lib/maya-model";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { callSpend, createSpendLedger, spendConfig, SPEND_CLOSE, type SpendState } from "@/lib/maya-spend";
import { memorySpendStore } from "@/lib/maya-spend-memory";
import { SAFETY_PAUSE } from "@/lib/maya/sensitive-input";

beforeEach(() => { vi.clearAllMocks(); });

const PARENT = "11111111-1111-4111-8111-111111111111";
const CHILD = "22222222-2222-4222-8222-222222222222";
const PACKAGE = { ...SAMPLE_PACKAGES["subtract-83-46"], ref: { source: "workbook" as const, workbookId: "33333333-3333-4333-8333-333333333333", page: 1, question: 1 } };
const IDENTITY = "I'm not a real person. I'm an AI helper.";
const NO_SECRETS = "I can't be a secret friend. I don't keep secrets. A grown-up you trust is a good person to talk to.";

function ok(result: CallResult) {
  if (!result.ok) throw new Error(result.error);
  return result;
}

async function setup(mode: "chat" | "voice", opts: { checkedRoutine?: boolean; answer?: Parameters<typeof conversationalFake>[0]["answer"] } = {}) {
  let now = Date.UTC(2026, 10, 17, 18);
  let state: SpendState = "open";
  let ids = 0;
  const clock = () => now;
  const newId = () => `00000000-0000-4000-8000-${String(++ids).padStart(12, "0")}`;
  const store = memoryCallStore({ clock, testFamilies: [] });
  const ledger = createSpendLedger({ store: memorySpendStore({ clock }), config: spendConfig({}), clock, zone: async () => "America/Vancouver" });
  const spend = callSpend(ledger, { clock, newId });
  const model = conversationalFake({ answer: opts.answer ?? (() => reply("What is 13 minus 6?", "guide")) });
  const forced = vi.fn<(input: ModelInput, signal: AbortSignal) => Promise<{ reading: { safety: string } | null; say: string }>>(async (input) => ({
    reading: input.childTurn?.includes("emergency") || input.childTurn?.includes("hits me") ? { safety: "concern" } : null,
    say: "These model words must never be spoken.",
  }));
  const alert = vi.fn(async () => {});
  const seams: CallSeams = {
    checkedRoutine: opts.checkedRoutine ?? true, tutorFamilies: true, store, clock, newId, seed: () => 42,
    spend: { ...spend, state: async () => state, voice: () => {
      let stopped = false;
      const coverage = () => stopped ? "paused" as const : state;
      return { state: coverage, ensure: async () => coverage(), stop: async () => { stopped = true; }, spoken: async () => {} };
    } },
    connections: memoryConnectionLog(store, clock), history: memoryWordingHistoryStore(),
    events: learningEvents(memoryLearningEventStore({ children: [{ id: CHILD, parentId: PARENT }] })),
    rebuild: async () => true,
    model: (_id, _spend, options) => options?.safetyRead ? { ...model, propose: forced } : model,
    isTestFamily: async () => false, canChat: async () => true, canCallVoice: async () => true,
    alerts: { send: alert, list: async () => [] },
  };
  const calls = mayaCalls(seams);
  const input: StartInput = { kind: mode === "chat" ? "chat" : "family", parentId: PARENT, childId: CHILD, childName: null, startedBy: PARENT, package: PACKAGE };
  let view = ok(mode === "chat" ? await calls.start(input) : await calls.startVoice(input)).view;
  const opened = mode === "voice" ? await calls.openVoice(view.id, { speechToText: "fake", voice: "fake" }, null) : null;
  if (opened && !opened.ok) throw new Error(opened.error);
  const voice = opened?.call;
  await voice?.start();
  return {
    model, voice, forced, alert, store,
    reopen: () => calls.openVoice(view.id, { speechToText: "fake", voice: "fake" }, null),
    reachClock: () => { now += TIME_LIMITS.endAtMs; },
    reachCap: (reason: Exclude<SpendState, "open"> = "week_used") => { state = reason; },
    stored: () => store.rows()[0],
    async child(text: string, options?: { uncertain?: boolean; alternatives?: string[] }) {
      if (voice) return voice.child(text, options);
      const result = ok(await calls.input(view.id, view.revision, { type: "child", text }, null));
      view = result.view;
      return { ...result.output, ended: view.status === "ended" };
    },
  };
}

it.each(["clock", "cap"] as const)("pauses an uncertain primary and a sensitive alternative at the voice %s", async (boundary) => {
  const hearings: [string, { uncertain?: boolean; alternatives?: string[] }][] = [
    ["I feel scared.", {}],
    ["He hits me.", { uncertain: true }],
    ["Eight minus three.", { alternatives: ["He hits me. Are you a real person?"] }],
  ];
  for (const [text, options] of hearings) {
    const s = await setup("voice");
    if (boundary === "clock") s.reachClock(); else s.reachCap();
    const out = await s.child(text, options);
    expect(out).toMatchObject({ ended: true, safetyMessage: null, newBatches: 0 });
    expect(out.say).toEqual(boundary === "clock" ? [SAFETY_PAUSE] : [SAFETY_PAUSE, SPEND_CLOSE.week_used.line]);
    expect(s.stored().flag).toBeNull();
    expect(s.forced).not.toHaveBeenCalled();
    expect(s.alert).not.toHaveBeenCalled();
  }
});

it("preserves hearing boundaries when a voice cap drops a turn in flight", async () => {
  const entered = Promise.withResolvers<void>();
  const late = Promise.withResolvers<ReturnType<typeof reply>>();
  const s = await setup("voice", { answer: () => { entered.resolve(); return late.promise; } });
  const prior = s.child("I need help.");
  await entered.promise;
  s.reachCap();
  try {
    const closing = await s.child("He hits me.", { uncertain: true });
    expect(closing).toMatchObject({ ended: true, say: [SAFETY_PAUSE, SPEND_CLOSE.week_used.line], safetyMessage: null, newBatches: 0 });
    expect(s.forced).not.toHaveBeenCalled();
    expect(s.stored().flag).toBeNull();
  } finally {
    late.resolve(reply("What is 13 minus 6?", "guide"));
  }
  expect((await prior).say).toEqual([]);
});

it.each([true, false])("does not close at the cap when an admitted turn sees an ordinary media cutoff (candidate %s)", async (checkedRoutine) => {
  const entered = Promise.withResolvers<void>();
  const late = Promise.withResolvers<ReturnType<typeof reply>>();
  const s = await setup("voice", { checkedRoutine, answer: () => { entered.resolve(); return late.promise; } });
  const call = s.voice!;
  const sent = vi.fn();
  call.onGuidance(sent);
  const pending = s.child("Can you help me?");
  await entered.promise;
  await call.stopMeter();
  late.resolve(reply("What is 13 minus 6?", "guide"));
  const finished = await pending;
  expect(finished.ended).toBe(false);
  expect(finished.say).not.toContain(SPEND_CLOSE.paused.line);
  expect(await call.meter()).toBeNull();
  expect(await s.child("My babysitter is hurting me right now.")).toMatchObject({ say: [], ended: false });
  expect(sent).not.toHaveBeenCalled();
  expect(s.stored()).toMatchObject({ status: "live", flag: null });
  await call.end({ reason: "child_stopped" });
  expect(s.stored().outcome?.reason).toBe("child_stopped");
});

it("keeps an admitted cap safety read when ordinary media cuts during the read", async () => {
  const s = await setup("voice");
  const call = s.voice!;
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<{ reading: { safety: string }; say: string }>();
  s.forced.mockImplementationOnce(() => { entered.resolve(); return release.promise; });
  const sent = vi.fn();
  call.onGuidance(sent);
  s.reachCap("paused");
  const closing = s.child("I saw a knife today.");
  try {
    await entered.promise;
    await call.stopMeter();
    expect(await call.meter()).toBeNull();
  } finally {
    release.resolve({ reading: { safety: "concern" }, say: "These words must not be spoken." });
  }
  expect(await closing).toMatchObject({ ended: true, safetyMessage: SAFETY_GUIDANCE.concern });
  expect(sent).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ say: [SAFETY_GUIDANCE.concern] }));
  await call.end({ reason: "child_stopped" });
  expect(s.stored().outcome?.reason).toBe("safety");
  expect(s.stored().flag?.level).toBe("safety_concern");
});

it.each([["voice", "clock"], ["voice", "cap"], ["chat", "clock"], ["chat", "cap"]] as const)(
  "gives fixed guidance and an identity answer from a final %s primary at the %s",
  async (mode, boundary) => {
    const s = await setup(mode);
    if (boundary === "clock") s.reachClock(); else s.reachCap();
    const out = await s.child("I got seven, but my babysitter is hurting me right now. Are you a real person?");
    expect(out).toMatchObject({ ended: true, safetyMessage: SAFETY_GUIDANCE.immediate, newBatches: 0 });
    expect(out.say).toEqual([SAFETY_GUIDANCE.immediate, IDENTITY]);
    expect(s.forced).not.toHaveBeenCalled();
    if (s.voice) await s.voice.end({});
    expect(s.stored().flag?.level).toBe("safety_immediate");
    expect(s.alert).toHaveBeenCalledOnce();
  },
);

it.each(["clock", "cap"] as const)("queues guidance before a held %s save and recovers it before the last disclosure", async (boundary) => {
  const s = await setup("voice");
  if (boundary === "clock") s.reachClock(); else s.reachCap();
  const sent = vi.fn();
  s.voice!.onGuidance(sent);
  const save = s.store.update.bind(s.store);
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  vi.spyOn(s.store, "update").mockImplementation(async (id, revision, change) => {
    if (change.live?.pendingVoice?.safetyMessage) {
      entered.resolve();
      await release.promise;
    }
    return save(id, revision, change);
  });
  const turn = s.child("My babysitter is hurting me right now. Are you a real person?");
  try {
    await entered.promise;
    expect(sent).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ say: [SAFETY_GUIDANCE.immediate], ended: false }));
    expect(s.stored().status).toBe("live");
  } finally { release.resolve(); }
  expect((await turn).say).toEqual([IDENTITY]);
  const recovered = await s.reopen();
  if (!recovered.ok) throw new Error(recovered.error);
  expect(recovered.call.pendingFinal?.say).toEqual([SAFETY_GUIDANCE.immediate, IDENTITY]);
  await recovered.call.guidancePlayback!(SAFETY_GUIDANCE.immediate);
  const next = await s.reopen();
  if (!next.ok) throw new Error(next.error);
  expect(next.call.pendingFinal?.say).toEqual([IDENTITY]);
  await next.call.end({});
  expect(s.alert).toHaveBeenCalledOnce();
});

it("queues known cap danger without waiting for an unrelated revision write", async () => {
  const s = await setup("voice");
  const call = s.voice!;
  const saved = s.store.update.bind(s.store);
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  vi.spyOn(s.store, "update").mockImplementation(async (id, revision, change) => {
    if (change.live?.acknowledged?.includes("some-phrase")) {
      entered.resolve();
      await release.promise;
    }
    return saved(id, revision, change);
  });
  const write = call.acknowledge("some-phrase");
  await entered.promise;
  s.reachCap();
  const dispatch = Promise.withResolvers<void>();
  let played: Promise<void> | undefined;
  call.onGuidance((turn) => {
    expect(turn.say).toEqual([SAFETY_GUIDANCE.immediate]);
    played = call.guidancePlayback!(SAFETY_GUIDANCE.immediate);
    dispatch.resolve();
  });
  const closing = s.child("My babysitter is hurting me right now.");
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([dispatch.promise, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Guidance waited for the unrelated write")), 800);
    })]);
  } finally {
    clearTimeout(timer);
    release.resolve();
  }
  await write;
  expect(await closing).toMatchObject({ ended: true, say: [], safetyMessage: SAFETY_GUIDANCE.immediate });
  await played;
  expect(s.stored().flag?.level).toBe("safety_immediate");
  expect(s.stored().live?.guidancePlayed).toBe("immediate");
});

it("drains a safety-only read admitted before the deadline closes and does not release its model words", async () => {
  const s = await setup("voice");
  s.reachClock();
  const call = s.voice!;
  const admitted = Promise.withResolvers<void>();
  const read = Promise.withResolvers<{ reading: { safety: string }; say: string }>();
  s.forced.mockImplementation(() => { admitted.resolve(); return read.promise; });
  const sent = vi.fn();
  call.onGuidance(sent);
  const child = s.child("There is an emergency outside. Are you a real person?");
  await admitted.promise;
  const deadline = call.safetyDeadline!();
  expect((await call.child("What is five minus two?")).say).toEqual([]);
  expect(sent).not.toHaveBeenCalled();
  read.resolve({ reading: { safety: "immediate" }, say: "Do not emit the model's words." });
  expect(await deadline).toMatchObject({ say: [IDENTITY], ended: true });
  expect(sent).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ say: [SAFETY_GUIDANCE.immediate] }));
  expect((await child).say).toEqual([]);
  await call.settled();
  expect(s.stored().flag?.level).toBe("safety_immediate");
  expect(await call.deferGuidance!()).toBe(true);
  expect((await s.reopen())).toMatchObject({ ok: true, call: { pendingFinal: { say: [SAFETY_GUIDANCE.immediate, IDENTITY] } } });
  expect(s.forced).toHaveBeenCalledOnce();
  expect(s.model.briefs).toEqual([]);
});

it("bounds the deadline even when the admitted safety read ignores its abort signal", async () => {
  const s = await setup("voice");
  s.reachClock();
  const started = Promise.withResolvers<void>();
  const late = Promise.withResolvers<{ reading: { safety: string }; say: string }>();
  let signal: AbortSignal | undefined;
  s.forced.mockImplementation((_input, abort) => { signal = abort; started.resolve(); return late.promise; });
  const call = s.voice!;
  const sent = vi.fn();
  call.onGuidance(sent);
  const child = s.child("There is an emergency outside.");
  await started.promise;
  await call.limit();
  expect(signal?.aborted).toBe(true);
  expect(s.stored().status).toBe("ended");
  late.resolve({ reading: { safety: "immediate" }, say: "Do not emit this." });
  expect((await child).say).toEqual([]);
  expect(sent).not.toHaveBeenCalled();
  expect(s.forced).toHaveBeenCalledOnce();
});

it("carries the saved disclosure past the deadline without replaying acknowledged guidance", async () => {
  const s = await setup("voice");
  const call = s.voice!;
  call.onGuidance(vi.fn());
  await s.child("My babysitter is hurting me right now. Are you a real person?");
  await call.guidancePlayback!(SAFETY_GUIDANCE.immediate);
  s.reachClock();
  const recovered = await s.reopen();
  if (!recovered.ok) throw new Error(recovered.error);
  const sent = vi.fn();
  recovered.call.onGuidance(sent);
  expect(await recovered.call.safetyDeadline!()).toMatchObject({ say: [IDENTITY], ended: true });
  await recovered.call.settled();
  expect(s.stored().live?.pendingVoice?.say).toEqual([SAFETY_GUIDANCE.immediate, IDENTITY]);
  expect(sent).not.toHaveBeenCalled();
});

it.each(["chat", "voice"] as const)("doesn't make a candidate safety read for ordinary math at the %s clock", async (mode) => {
  const s = await setup(mode);
  s.reachClock();
  expect(await s.child("Eight minus three is five.")).toMatchObject({ ended: true, say: [], newBatches: 0 });
  expect(s.forced).not.toHaveBeenCalled();
  expect(s.model.briefs).toEqual([]);
});

it.each([["voice", "clock"], ["chat", "cap"]] as const)("gives the secret-only disclosure at the %s %s", async (mode, boundary) => {
  const s = await setup(mode);
  if (boundary === "clock") s.reachClock(); else s.reachCap();
  const out = await s.child("He hits me. Can you keep a secret?");
  expect(out.say).toEqual([SAFETY_GUIDANCE.concern, NO_SECRETS]);
  expect(s.forced).not.toHaveBeenCalled();
});

it.each(["chat", "voice"] as const)("limits the dedicated %s read to the current unclassified primary", async (mode) => {
  const s = await setup(mode);
  await s.child("My private earlier words. I feel scared.");
  s.reachClock();
  const primary = "There is an emergency outside. Are you a real person?";
  const out = await s.child(primary, { alternatives: ["Other private words."] });
  expect(s.forced).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ childTurn: primary, transcript: [], question: null }), expect.any(AbortSignal));
  expect(JSON.stringify(s.forced.mock.calls)).not.toMatch(/private (?:earlier )?words/);
  expect(out).toMatchObject({ ended: true, say: [SAFETY_GUIDANCE.concern, IDENTITY], newBatches: 0 });
});

it("leaves the legacy clock read and guidance unchanged when the candidate was off at start", async () => {
  const s = await setup("voice", { checkedRoutine: false });
  s.reachClock();
  const out = await s.child("He hits me.", { uncertain: true });
  expect(s.forced).toHaveBeenCalledOnce();
  expect(out.say).toEqual([SAFETY_GUIDANCE.concern]);
});
