import { beforeEach, expect, it, vi } from "vitest";
import { applyBatch, boardTargets, createScene, type Batch } from "@/lib/board";
import { learningEvents } from "@/lib/learning-events";
import { memoryLearningEventStore } from "@/lib/learning-events-memory";
import { memoryWordingHistoryStore } from "@/lib/maya";
import { mayaCalls, type CallResult, type CallSeams, type StartInput } from "@/lib/maya-call";
import { memoryCallStore, memoryConnectionLog } from "@/lib/maya-call-memory";
import { conversationalFake, reply } from "@/lib/maya-model-fake";
import { fakeMathReviewer } from "@/lib/maya-math-review";
import { workedSteps, type Operation } from "@/lib/question-package";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { checkTrace } from "@/lib/maya-trace";
import { fakeTalkReviewer } from "@/lib/maya-talk-review";

vi.mock("server-only", () => ({}));
beforeEach(() => { vi.clearAllMocks(); });

const parentId = "11111111-1111-4111-8111-111111111111";
const childId = "22222222-2222-4222-8222-222222222222";
const clock = () => Date.UTC(2026, 10, 17, 18);
const input: StartInput = {
  kind: "chat", parentId, childId, childName: null, startedBy: parentId,
  package: SAMPLE_PACKAGES["subtract-52-28"],
};

function setup(overrides: Partial<CallSeams> = {}) {
  let id = 0;
  const store = memoryCallStore({ clock, testFamilies: [parentId] });
  const answer = vi.fn(() => reply("Start with the ones.", "guide"));
  const review = vi.fn(() => fakeTalkReviewer());
  const seams: CallSeams = {
    checkedExchange: true, tutorFamilies: true,
    store, connections: memoryConnectionLog(store, clock), history: memoryWordingHistoryStore(),
    events: learningEvents(memoryLearningEventStore({ children: [{ id: childId, parentId }] })),
    rebuild: async () => true, model: () => conversationalFake({ answer }),
    reviewer: review, isTestFamily: async () => true, canChat: async () => true, canCallVoice: async () => true,
    alerts: { send: async () => {}, list: async () => [] }, clock, seed: () => 42,
    newId: () => `00000000-0000-4000-8000-${String(++id).padStart(12, "0")}`,
    ...overrides,
  };
  return { calls: mayaCalls(seams), answer, store };
}

function ok(result: CallResult) {
  if (!result.ok) throw new Error(result.error);
  return result;
}

function checkExchange(batches: Batch[]) {
  expect(batches).toHaveLength(2);
  expect(batches[1].after).toEqual([batches[0].transactionId]);
  expect(batches[0].commands).toContainEqual(expect.objectContaining({ op: "write", text: "52 = 50 + 2" }));
  expect(batches[1].commands).toContainEqual(expect.objectContaining({ op: "write", text: "52 = 40 + 12" }));
  let scene = createScene();
  for (const [index, batch] of batches.entries()) {
    const result = applyBatch(scene, batch);
    if (!result.ok) throw new Error(result.refusal.reason);
    scene = result.scene;
    const values = boardTargets(scene).map((t) => [t.target.part === "piece" ? t.target.piece : t.target.part, t.value]);
    expect(values).toEqual(expect.arrayContaining([
      ["whole", "52"], ["tens", index === 0 ? "5" : "4"], ["ones", index === 0 ? "2" : "12"],
    ]));
  }
}

it("delivers one checked exchange through chat and voice with the same words and dependent board actions", async () => {
  const { calls, answer } = setup();
  const chat = ok(await calls.start(input));
  const voice = ok(await calls.startVoice({ ...input, kind: "family" }));
  const open = await calls.openVoice(voice.view.id, { speechToText: "fake", voice: "fake" }, null);
  if (!open.ok) throw new Error(open.error);
  await open.call.start();
  const text = "Can you show me how to regroup?";
  const [typed, spoken] = await Promise.all([
    calls.input(chat.view.id, chat.view.revision, { type: "child", text }, null).then(ok),
    open.call.child(text),
  ]);
  expect(typed.output.say).toEqual(spoken.say);
  expect(typed.output.say.join(" ")).toMatch(/5 tens and 2 ones.*1 ten for 10 ones.*4 tens and 12 ones.*52/i);
  expect(typed.output.say.join(" ")).not.toMatch(/24|twenty.four/i);
  checkExchange(typed.view.batches.slice(-typed.output.newBatches));
  checkExchange(spoken.boardCues!.map((cue) => cue.batch));
  expect(spoken.boardCues![0].word).toBeLessThan(spoken.boardCues![1].word);
  expect(answer).not.toHaveBeenCalled();
});

it("keeps shown work through worker replacement and retries only the cancelled exchange", async () => {
  const { calls, store } = setup();
  const voice = ok(await calls.startVoice({ ...input, kind: "family" }));
  const open = async () => {
    const result = await calls.openVoice(voice.view.id, { speechToText: "fake", voice: "fake" }, null);
    if (!result.ok) throw new Error(result.error);
    return result.call;
  };
  const call = await open();
  const opening = (await call.start()).boardCues![0].batch;
  const first = await call.child("Can you show me how to regroup?");
  const [show, trade] = first.boardCues!.map((cue) => cue.batch);
  const initial = call.session.checkedExchange!;
  expect(initial.turns[0]).toMatchObject({
    id: first.exchangeTurnId,
    actions: [{ delivery: "sent" }, { delivery: "sent" }],
  });
  expect(call.session.assistance).not.toContain("guided");
  await call.observeBoard({ events: [
    ...[opening, show].map((b) => ({ kind: "batch" as const, batchId: b.transactionId, commands: [...b.commands] })),
    { kind: "presented", batchId: show.transactionId },
    { kind: "cancelled", batchIds: [trade.transactionId] },
  ] });
  await call.exchangePlayback!(first.exchangeTurnId!, "interrupted");
  const resumed = await open();
  expect(resumed.session.checkedExchange).toMatchObject({
    id: initial.id,
    turns: [{ id: first.exchangeTurnId, playback: "interrupted", actions: [
      { fate: "shown", presented: true }, { fate: "cancelled" },
    ] }],
  });
  expect(resumed.session.done).toEqual([]);
  const retry = await resumed.child("Show me how to regroup again.");
  expect(retry.boardCues).toHaveLength(1);
  expect(retry.boardCues![0].batch.after).toEqual([show.transactionId]);
  expect(retry.boardCues![0].batch.transactionId).not.toBe(trade.transactionId);
  const lesson = resumed.session.checkedExchange!;
  expect(lesson.turns[1].actions[0].id).toBe(lesson.turns[0].actions[1].id);
  expect(retry.exchangeTurnId).not.toBe(first.exchangeTurnId);
  await resumed.exchangePlayback!(retry.exchangeTurnId!, "finished");
  await resumed.exchangePlayback!(retry.exchangeTurnId!, "interrupted");
  expect(resumed.session.checkedExchange!.turns[1].playback).toBe("finished");
  expect(resumed.session.assistance.filter((kind) => kind === "guided")).toEqual(["guided"]);
  expect(resumed.session.done).toEqual([]);
  await resumed.end({ reason: "child_stopped" });
  expect(checkTrace(store.rows()[0].trace)).toMatchObject({ ok: true });
});

it("uses a separate example when one of the target's shown quantities would give away the answer", async () => {
  const { calls } = setup();
  const operation: Operation = { kind: "subtract", operands: [52, 48] };
  const chat = ok(await calls.start({
    ...input, package: {
      ...SAMPLE_PACKAGES["subtract-52-28"], operation, steps: workedSteps(operation), text: "52 - 48 = ?",
      answer: { value: { type: "number", value: 4 }, accepted: [], unit: null },
    },
  }));
  const turn = ok(await calls.input(chat.view.id, chat.view.revision, { type: "child", text: "Show me how to regroup." }, null));
  expect(turn.output.say.join(" ")).toMatch(/separate example: 63.*5 tens and 13 ones.*63/i);
  expect(turn.output.say.join(" ")).not.toMatch(/\b(?:4|four)\b/i);
  const batches = turn.view.batches.slice(-turn.output.newBatches);
  expect(batches).toHaveLength(2);
  const models = batches.flatMap((b) => b.commands).filter((c) => (c as { op?: string }).op === "model");
  expect(models).toEqual([
    expect.objectContaining({ model: { kind: "base_ten", hundreds: 0, tens: 6, ones: 3 } }),
    expect.objectContaining({ model: { kind: "base_ten", hundreds: 0, tens: 5, ones: 13 } }),
  ]);
});

it("rejects a target answer in a free-form turn before it can stream or appear in a board batch", async () => {
  const bad = "Write two tens and four ones as your answer.";
  const model = conversationalFake({ answer: () => reply(bad, "guide"), stream: { chunk: 8 } });
  const { calls } = setup({ model: () => model, streamChat: true, mathReviewer: () => fakeMathReviewer() });
  const chat = ok(await calls.start(input));
  const part = vi.fn();
  const turn = ok(await calls.input(chat.view.id, chat.view.revision, { type: "child", text: "What should I write?" }, null, { part }));
  expect(model.briefs).not.toHaveLength(0);
  expect(part).not.toHaveBeenCalled();
  expect(turn.output.say.join(" ")).not.toMatch(/two tens and four ones|24/i);
  expect(turn.output.newBatches).toBe(0);
});

it.each([
  ["incorrect quantities", "Trade 1 ten for 20 ones."],
  ["false equivalence", "52 is 4 tens and 13 ones."],
  ["unsupported units", "The blocks represent an area of 52 square metres."],
])("withholds free-form claims with %s and may draw the true code-written fallback", async (_kind, bad) => {
  const model = conversationalFake({ answer: () => reply(bad, "guide"), stream: { chunk: 8 } });
  const math = fakeMathReviewer(() => ({ verdict: "false", reason: "These quantities or units do not match the facts." }));
  const { calls, store } = setup({ model: () => model, mathReviewer: () => math, streamChat: true });
  const chat = ok(await calls.start(input));
  const part = vi.fn();
  const turn = ok(await calls.input(chat.view.id, chat.view.revision, { type: "child", text: "I need help." }, null, { part }));
  expect(model.briefs.length).toBeGreaterThan(0);
  expect(part).not.toHaveBeenCalled();
  expect(turn.output.say.join(" ")).not.toContain(bad);
  checkExchange(turn.view.batches.slice(-turn.output.newBatches));
  if (_kind === "unsupported units") expect(math.requests.map((r) => r.sentence)).toContain(bad);
  const trace = store.rows()[0].live?.text.turns.at(-1);
  expect(trace).toMatchObject({ kind: "maya", attempts: expect.arrayContaining([{ source: "fallback", proposal: expect.objectContaining({ checkedExchange: 1 }), refusal: null }]) });
});

it("keeps the existing teaching path for unsupported packages and sessions created before opt-in", async () => {
  const { calls, store } = setup();
  const add = ok(await calls.start({ ...input, package: SAMPLE_PACKAGES["add-27-39"] }));
  const { calls: original } = setup({ checkedExchange: false, store, newId: () => "00000000-0000-4000-8000-000000000100" });
  const old = ok(await original.start(input));
  for (const chat of [add, old]) {
    const turn = ok(await calls.input(chat.view.id, chat.view.revision, { type: "child", text: "Show me how to regroup." }, null));
    expect(turn.output).not.toHaveProperty("exchangeTurnId");
    expect(turn.output.say.length).toBeGreaterThan(0);
  }
});

it("restores chat after an unknown delivery and applies only a new exchange when the client reports cancellation", async () => {
  const { calls } = setup();
  const chat = ok(await calls.start(input));
  const text = "Show me how to regroup.";
  const first = ok(await calls.input(chat.view.id, chat.view.revision, { type: "child", text }, null));
  const [show, trade] = first.view.batches.slice(-first.output.newBatches);
  const unknown = ok(await calls.input(chat.view.id, first.view.revision, { type: "child", text }, null));
  expect(unknown.output.newBatches).toBe(0);
  const retry = ok(await calls.input(chat.view.id, unknown.view.revision, {
    type: "child", text, fates: [
      { batchId: show.transactionId, fate: "shown" },
      { batchId: trade.transactionId, fate: "cancelled" },
    ],
  }, null));
  expect(retry.output.newBatches).toBe(1);
  expect(retry.view.batches.map((b) => b.transactionId)).not.toContain(trade.transactionId);
  expect(retry.view.batches.at(-1)?.after).toEqual([show.transactionId]);
  expect((await calls.view(chat.view.id))?.batches).toEqual(retry.view.batches);
});
