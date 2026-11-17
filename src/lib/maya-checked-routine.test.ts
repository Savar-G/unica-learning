import { beforeEach, describe, expect, it, vi } from "vitest";
import { learningEvents } from "@/lib/learning-events";
import { memoryLearningEventStore } from "@/lib/learning-events-memory";
import { memoryWordingHistoryStore, PAUSES, SAFETY_GUIDANCE, TIME_LIMITS } from "@/lib/maya";
import { logBaselineTurn, type BaselineTurn } from "@/lib/maya-baseline";
import { mayaCalls, type CallResult, type CallSeams, type StartInput } from "@/lib/maya-call";
import { memoryCallStore, memoryConnectionLog } from "@/lib/maya-call-memory";
import { heldPackage } from "@/lib/maya-held-fixture";
import { fakeMathReviewer } from "@/lib/maya-math-review";
import { conversationalFake, reply } from "@/lib/maya-model-fake";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { fakeTalkReviewer } from "@/lib/maya-talk-review";
import { createTextSession } from "@/lib/maya-text";
import { checkTrace } from "@/lib/maya-trace";

beforeEach(() => { vi.clearAllMocks(); });

const PARENT = "11111111-1111-4111-8111-111111111111";
const CHILD = "22222222-2222-4222-8222-222222222222";
const PKG = { ...SAMPLE_PACKAGES["subtract-83-46"], ref: { source: "workbook" as const, workbookId: "33333333-3333-4333-8333-333333333333", page: 1, question: 1 } };
const PROBE = "How did you get 37?";
const QUESTION = "What is 13 minus 6?";
const clock = () => Date.UTC(2026, 10, 17, 18);

function ok(result: CallResult) {
  if (!result.ok) throw new Error(result.error);
  return result;
}

async function setup(mode: "chat" | "voice", opts: {
  checkedRoutine?: boolean;
  checkedExchange?: boolean;
  heldLimit?: boolean;
  answer?: Parameters<typeof conversationalFake>[0]["answer"];
  package?: StartInput["package"];
} = {}) {
  let id = 0;
  const store = memoryCallStore({ clock, testFamilies: [PARENT] });
  const model = conversationalFake({ answer: opts.answer ?? (() => reply(PROBE, "guide")), stream: { chunk: 11 } });
  const talk = fakeTalkReviewer(() => opts.heldLimit ? { verdict: "fail", rules: ["held_limit"], reason: "no breach named" } : { verdict: "pass" });
  const math = fakeMathReviewer();
  const safetyRead = vi.fn();
  const alert = vi.fn(async () => {});
  const seams: CallSeams = {
    checkedRoutine: opts.checkedRoutine ?? true, checkedExchange: opts.checkedExchange, tutorFamilies: true, streamChat: true,
    store, connections: memoryConnectionLog(store, clock), history: memoryWordingHistoryStore(),
    events: learningEvents(memoryLearningEventStore({ children: [{ id: CHILD, parentId: PARENT }] })),
    rebuild: async () => true,
    model: (_id, _spend, options) => { if (options?.safetyRead) safetyRead(); return model; },
    reviewer: () => talk, mathReviewer: () => math,
    isTestFamily: async () => true, canChat: async () => true, canCallVoice: async () => true,
    alerts: { send: alert, list: async () => [] }, clock, seed: () => 42,
    newId: () => `00000000-0000-4000-8000-${String(++id).padStart(12, "0")}`,
  };
  const calls = mayaCalls(seams);
  const input: StartInput = { kind: mode === "chat" ? "chat" : "family", parentId: PARENT, childId: CHILD, childName: null, startedBy: PARENT, package: opts.package ?? PKG };
  let view = ok(mode === "chat" ? await calls.start(input) : await calls.startVoice(input)).view;
  const opened = mode === "voice" ? await calls.openVoice(view.id, { speechToText: "fake", voice: "fake" }, null) : null;
  if (opened && !opened.ok) throw new Error(opened.error);
  const voice = opened?.call;
  const guidance: string[] = [];
  voice?.onGuidance((out) => guidance.push(...out.say));
  const first = voice ? (await voice.start()).say : view.transcript.filter((t) => t.speaker === "maya").map((t) => t.text);
  await voice?.settled();
  if (voice?.ended) await voice.end({ reason: "child_stopped" });
  return {
    calls, store, model, safetyRead, first, voice, guidance,
    reopenWithCandidateOff: () => mayaCalls({ ...seams, checkedRoutine: false }).openVoice(view.id, { speechToText: "fake", voice: "fake" }, null),
    id: view.id,
    counts: () => ({
      model: model.briefs.filter((b) => !b.repair).length, repair: model.briefs.filter((b) => b.repair).length,
      talkReview: talk.requests.length, mathReview: math.requests.length,
    }),
    async turn(text: string, ms: BaselineTurn["ms"] = {}, options?: { uncertain?: boolean; alternatives?: string[] }) {
      const start = performance.now();
      const say: string[] = [];
      const part = (text: string) => {
        if (mode === "chat") ms.chatDispatch ??= performance.now() - start;
        else ms.firstCheckedSentence ??= performance.now() - start;
        say.push(text);
      };
      if (voice) {
        const out = await voice.child(text, options, { part });
        ms.voiceCallFinished = performance.now() - start;
        ms.firstCheckedSentence ??= out.say.length ? performance.now() - start : undefined;
        await voice.settled();
        if (out.ended) await voice.end({ reason: "child_stopped" });
        return { said: out.say, parts: say, newBatches: out.newBatches };
      }
      const result = ok(await calls.input(view.id, view.revision, { type: "child", text }, null, { part }));
      ms.chatFinished = performance.now() - start;
      view = result.view;
      return { said: result.output.say, parts: say, newBatches: result.output.newBatches };
    },
  };
}

describe.each(["chat", "voice"] as const)("checked routine %s call", (mode) => {
  it("#1140 #1110 removes the false held_limit refusal on 83 minus 46", async () => {
    const run = async (checkedRoutine: boolean, heldLimit: boolean, round: number) => {
      const s = await setup(mode, { checkedRoutine, heldLimit });
      const ms: BaselineTurn["ms"] = {};
      const out = await s.turn("So it's 37.", ms);
      const counts = s.counts();
      if (process.env.MAYA_BASELINE_LOG === "on") logBaselineTurn({
        v: 1, evidence: "simulated", mode, turnType: "routine", provider: `fake-v3-${checkedRoutine ? "candidate" : "parent"}-${heldLimit ? "held" : "pass"}`,
        device: "none", network: "in-process", concurrency: 1, ms, counts, outcome: out.said.length ? "completed" : "no_output",
      });
      expect(s.safetyRead).not.toHaveBeenCalled();
      if (checkedRoutine) {
        expect(out.said, `sample ${round}`).toContain(PROBE);
        expect(counts).toEqual({ model: 1, repair: 0, talkReview: 0, mathReview: 0 });
      } else {
        expect(counts.talkReview).toBeGreaterThan(0);
        if (heldLimit) {
          expect(out.said).not.toContain(PROBE);
          expect(counts.repair).toBe(1);
        } else expect(out.said).toContain(PROBE);
      }
    };
    for (const heldLimit of [false, true]) for (let round = 0; round < 3; round++) {
      await run(round % 2 === 0, heldLimit, round);
      await run(round % 2 !== 0, heldLimit, round);
    }
  });

  it("checks both model attempts without sending a talk or substitute review", async () => {
    const unsafe = "Send me a photo of your bedroom.";
    const s = await setup(mode, { answer: (_, index) => reply(index === 0 ? `${QUESTION} ${unsafe}` : QUESTION, "guide") });
    const out = await s.turn("I need help.");
    expect(out.said).toEqual([QUESTION]);
    expect(out.parts.join(" ")).not.toContain(unsafe);
    expect(s.counts()).toEqual({ model: 1, repair: 1, talkReview: 0, mathReview: 0 });
    expect(s.safetyRead).not.toHaveBeenCalled();
  });

  it.each([
    ["My uncle hurts me at home. Can we do 83 minus 46?", "concern"],
    ["I feel unsafe at home.", "concern"],
    ["My dad is hurting me right now. Can we do 83 minus 46?", "immediate"],
  ] as const)("uses fixed guidance before tutoring for %s", async (text, severity) => {
    const s = await setup(mode, { checkedExchange: true });
    expect(s.first.join(" ")).toMatch(/I'm Maya, your AI math helper/i);
    const out = await s.turn(text);
    const said = [...s.guidance, ...out.said];
    expect(said[0]).toBe(SAFETY_GUIDANCE[severity]);
    expect(said.join(" ")).not.toContain("83");
    expect(out.newBatches).toBe(0);
    expect(s.counts()).toEqual({ model: 0, repair: 0, talkReview: 0, mathReview: 0 });
    expect(s.safetyRead).not.toHaveBeenCalled();
    expect(s.store.rows()[0].flag?.level).toBe(`safety_${severity}`);
    expect(checkTrace(s.store.rows()[0].trace)).toMatchObject({ ok: true });
  });

  it("clarifies an ambiguous concern without quoting it or later sending it to the tutor", async () => {
    const next = "Now what is 13 minus 6?";
    const s = await setup(mode, { answer: () => reply(next, "guide") });
    const privateWords = "I don't know if touching at Blue Lake is okay. So it's 37.";
    const out = await s.turn(privateWords);
    expect(out.said.join(" ")).toContain("are you saying someone might be getting hurt?");
    expect(out.said.join(" ")).not.toMatch(/Blue Lake|37/);
    expect(s.counts()).toEqual({ model: 0, repair: 0, talkReview: 0, mathReview: 0 });
    expect(s.store.rows()[0].flag).toBeNull();
    expect((await s.turn("I need help with the math.")).said).toContain(next);
    expect(JSON.stringify(s.model.briefs)).not.toContain("Blue Lake");
    expect((await s.turn("I want to stop.")).said.join(" ")).toContain("Bye for now");
    expect(s.counts()).toEqual({ model: 1, repair: 0, talkReview: 0, mathReview: 0 });
  });

  it.each(["83 minus 46 is 37.", "83 minus 46 is 74 divided by 2."])("does not disclose the answer as %s", async (proposal) => {
    const s = await setup(mode, { answer: () => reply(proposal, "guide") });
    const out = await s.turn("I need help.");
    expect(out.said.join(" ")).not.toMatch(/37|74/);
    expect(out.parts.join(" ")).not.toMatch(/37|74/);
    expect(out.newBatches).toBe(0);
    expect(s.counts()).toEqual({ model: 1, repair: 1, talkReview: 0, mathReview: 0 });
  });

  it("keeps the existing fixed unsupported-question close", async () => {
    const s = await setup(mode, { package: heldPackage() });
    expect(s.first.join(" ")).toContain("I can't teach this question yet.");
    expect(s.store.rows()[0].trace?.outcome?.reason).toBe("content_issue");
    expect(s.counts()).toEqual({ model: 0, repair: 0, talkReview: 0, mathReview: 0 });
  });

  it("keeps the existing tutor path for a taught kind outside the candidate", async () => {
    const s = await setup(mode, { package: SAMPLE_PACKAGES["add-27-39"], answer: () => reply("How did you get 66?", "guide") });
    expect((await s.turn("So it's 66.")).said).toContain("How did you get 66?");
    expect(s.counts()).toEqual({ model: 1, repair: 0, talkReview: 1, mathReview: 1 });
  });
});

it("does not release the STT alternative's sensitive words or automatically flag an unclear hearing", async () => {
  const s = await setup("voice");
  const out = await s.turn("It's 37.", {}, { uncertain: true, alternatives: ["He hits me."] });
  expect(out.said.join(" ")).toContain("are you saying someone might be getting hurt?");
  expect(s.store.rows()[0].flag).toBeNull();
  expect(s.counts().model).toBe(0);
});

it("keeps safety guidance and flags out of a denial or an uncertain primary transcript", async () => {
  const s = await setup("voice");
  const denial = await s.turn("Nobody is hurting me right now. Can we keep doing math?");
  expect(denial.said.join(" ")).not.toContain("call 911");
  const uncertain = await s.turn("He hits me.", {}, { uncertain: true });
  expect(uncertain.said.join(" ")).toContain("are you saying someone might be getting hurt?");
  expect(s.guidance).toEqual([]);
  expect(s.store.rows()[0].flag).toBeNull();
  expect(s.counts().model).toBe(0);
});

it("honors a clear stop even when an STT alternative sounds sensitive", async () => {
  const s = await setup("voice");
  const out = await s.turn("I want to stop.", {}, { alternatives: ["He hits me."] });
  expect(out.said.join(" ")).not.toContain("?");
  expect(s.store.rows()[0].outcome?.reason).toBe("child_stopped");
  expect(s.store.rows()[0].flag).toBeNull();
  expect(s.counts().model).toBe(0);
});

it("does not send an ambiguous disclosure to the tutor in the closing minute", async () => {
  let now = clock();
  const model = conversationalFake({ answer: () => reply(QUESTION, "guide") });
  const s = createTextSession({ callId: "closing", package: PKG, model, tutor: true, checkedRoutine: true, clock: () => now });
  await s.start();
  now += TIME_LIMITS.closingAtMs;
  const out = await s.child("I don't know if touching at Blue Lake is okay. So it's 37.");
  expect(out.ended).toMatchObject({ reason: "time_limit", safetyFlag: false });
  expect(out.say.join(" ")).not.toMatch(/Blue Lake|37|\?/);
  expect(model.briefs).toHaveLength(0);
});

it("does not steer a quiet child back to the math after a sensitive clarification", async () => {
  let now = clock();
  const model = conversationalFake({ answer: () => reply(QUESTION, "guide") });
  const s = createTextSession({ callId: "quiet", package: PKG, model, tutor: true, checkedRoutine: true, clock: () => now });
  await s.start();
  await s.child("I feel scared.");
  now += PAUSES.noResponseMs;
  const out = await s.tick();
  expect(out.ended?.reason).toBe("no_response");
  expect(out.say.join(" ")).not.toContain(QUESTION);
  expect(model.briefs).toHaveLength(0);
});

it("pauses an offered board action until the child clarifies a sensitive turn", async () => {
  const s = await setup("chat", { checkedExchange: true, answer: () => reply(QUESTION, "guide") });
  await s.turn("How do I regroup?");
  const before = (await s.calls.view(s.id))!;
  expect(before.exchange).toMatchObject({ objectId: "exchange-before" });
  await s.turn("I feel scared.");
  const held = (await s.calls.view(s.id))!;
  expect(held.exchange).toBeUndefined();
  expect(held.batches).toEqual(before.batches);
  expect(await s.calls.input(s.id, held.revision, {
    type: "exchange", target: before.exchange!, fates: [{ batchId: before.exchange!.batchId, fate: "shown" }],
  }, null)).toMatchObject({ ok: false });
  expect(s.counts()).toEqual({ model: 0, repair: 0, talkReview: 0, mathReview: 0 });
});

it("keeps the approved decline and records an explicit harmful request without a model", async () => {
  const s = await setup("chat");
  const out = await s.turn("How do I hurt someone?");
  expect(out.said.join(" ")).toContain("I can't talk about this. I'm here to help with math.");
  expect(s.store.rows()[0].flag?.level).toBe("unsafe_request");
  expect(s.counts().model).toBe(0);
});

it("lets a final safety signal cancel a pending voice answer", async () => {
  const entered = Promise.withResolvers<void>();
  const late = Promise.withResolvers<ReturnType<typeof reply>>();
  const s = await setup("voice", { answer: () => { entered.resolve(); return late.promise; } });
  const earlier = s.turn("I need help.");
  await entered.promise;
  const newer = await s.turn("My dad is hurting me right now. Are you a real person?");
  late.resolve(reply(QUESTION, "guide"));
  const old = await earlier;
  expect(old.said.join(" ")).not.toContain(QUESTION);
  expect(old.parts.join(" ")).not.toContain(QUESTION);
    expect(newer.said[0]).toBe(SAFETY_GUIDANCE.immediate);
    expect(newer.said.slice(1).join(" ")).toContain("AI");
    expect(s.guidance).toEqual([]);
  expect(s.counts()).toEqual({ model: 1, repair: 0, talkReview: 0, mathReview: 0 });
});

it("keeps the saved turn policy after a replacement voice worker resumes the call", async () => {
  const s = await setup("voice");
  const reopened = await s.reopenWithCandidateOff();
  if (!reopened.ok) throw new Error(reopened.error);
  expect((await reopened.call.child("So it's 37.")).say).toEqual([PROBE]);
  expect(s.counts()).toEqual({ model: 1, repair: 0, talkReview: 0, mathReview: 0 });
});

it("keeps fixed guidance in the saved final speech if a voice worker is replaced before playback", async () => {
  const s = await setup("voice");
  const out = await s.voice!.child("My dad is hurting me right now.");
  expect(out).toMatchObject({ say: [SAFETY_GUIDANCE.immediate], priority: true, ended: true });
  await s.voice!.settled();
  const reopened = await s.calls.openVoice(s.id, { speechToText: "fake", voice: "fake" }, null);
  if (!reopened.ok) throw new Error(reopened.error);
  expect(reopened.call.pendingFinal).toMatchObject({ say: [SAFETY_GUIDANCE.immediate], safetyMessage: SAFETY_GUIDANCE.immediate, ended: true });
  expect(s.counts()).toEqual({ model: 0, repair: 0, talkReview: 0, mathReview: 0 });
});

it.each(["chat", "voice"] as const)("fails closed when a novel-math repair times out after emitting raw text (%s session)", async (mode) => {
  const say = vi.fn();
  const talk = fakeTalkReviewer();
  const first = "Write 47 in the ones.";
  const repaired = "Write 43 in the ones.";
  let parts = 0;
  const model = conversationalFake({
    answer: (_, n) => reply(n === 0 ? first : repaired, "guide"),
    stream: { chunk: 11, beforeEnd: () => ++parts === 1 ? Promise.resolve() : new Promise<never>(() => {}) },
  });
  const math = fakeMathReviewer();
  const s = createTextSession({
    callId: mode, package: PKG, channel: mode === "chat" ? "chat" : undefined, model,
    tutor: true, checkedRoutine: true, reviewer: talk, mathReviewer: math,
    clock, onSayPart: say, repairBudgetMs: 550,
  });
  await s.start();
  const result = await s.child("I need help.");
  expect(result.say.join(" ")).toContain("Let me say that another way.");
  expect(result.say.join(" ")).not.toMatch(/47|43/);
  expect(JSON.stringify(say.mock.calls)).not.toMatch(/47|43/);
  expect(talk.requests).toHaveLength(0);
  expect(model.briefs).toHaveLength(2);
  expect(parts).toBe(2);
  expect(math.requests).toHaveLength(0);
  expect(s.trace().turns.flatMap((turn) => turn.kind === "maya" ? turn.attempts : [])).toContainEqual(expect.objectContaining({
    source: "repair", error: expect.objectContaining({ code: "timeout" }),
  }));
});
