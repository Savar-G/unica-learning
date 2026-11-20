import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { applyBatch, boardTargets, createScene, type Batch } from "@/lib/board";
import { learningEvents } from "@/lib/learning-events";
import { memoryLearningEventStore } from "@/lib/learning-events-memory";
import { memoryWordingHistoryStore } from "@/lib/maya";
import { mayaCalls, type CallInput, type CallResult, type CallSeams, type StartInput } from "@/lib/maya-call";
import { memoryCallStore, memoryConnectionLog } from "@/lib/maya-call-memory";
import { conversationalFake, reply } from "@/lib/maya-model-fake";
import { fakeMathReviewer } from "@/lib/maya-math-review";
import { workedSteps, type Operation } from "@/lib/question-package";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { checkTrace } from "@/lib/maya-trace";
import { fakeTalkReviewer } from "@/lib/maya-talk-review";

vi.mock("server-only", () => ({}));
beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

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
  return { calls: mayaCalls(seams), answer, store, events: seams.events };
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

it("lets the child exchange the highlighted ten and keeps the checked result after a retry", async () => {
  const { calls, answer, store } = setup();
  const chat = ok(await calls.start(input));
  const prompt = ok(await calls.input(chat.view.id, chat.view.revision, { type: "child", text: "How do I regroup?" }, null));
  const target = prompt.view.exchange!;
  expect(target).toMatchObject({ objectId: "exchange-before", boardRevision: expect.any(Number) });
  expect(prompt.output.say.join(" ")).toContain("Trade one ten");
  const show = prompt.view.batches.at(-1)!;
  expect(show.transactionId).toBe(target.batchId);
  const action = { type: "exchange" as const, target, fates: [{ batchId: show.transactionId, fate: "shown" as const }] };
  const result = ok(await calls.input(chat.view.id, prompt.view.revision, action, null));
  expect(result.output.say.join(" ")).toMatch(/4 tens and 12 ones.*still 52/);
  checkExchange(result.view.batches.slice(-2));
  expect(result.view.exchange).toBeUndefined();
  const retry = ok(await calls.input(chat.view.id, prompt.view.revision, action, null));
  expect(retry.output.say).toEqual([]);
  expect(retry.view.batches).toEqual(result.view.batches);
  const ended = ok(await calls.input(chat.view.id, retry.view.revision, { type: "end" }, null));
  expect(ended.view.outcome?.assistance).toBe("guided");
  expect(checkTrace(store.rows()[0].trace)).toMatchObject({ ok: true });
  expect(answer).not.toHaveBeenCalled();
});

it("requires the current lesson, turn, board revision and shown object", async () => {
  const { calls } = setup();
  const chat = ok(await calls.start(input));
  const prompt = ok(await calls.input(chat.view.id, chat.view.revision, { type: "child", text: "How do I regroup?" }, null));
  const first = prompt.view.exchange!;
  const shown = [{ batchId: first.batchId, fate: "shown" as const }];
  const submit = (action: CallInput, revision = prompt.view.revision) => calls.input(chat.view.id, revision, action, null);
  expect(await submit({ type: "exchange", target: first })).toEqual({ ok: false, error: "conflict" });
  for (const changes of [
    { lessonId: "another-lesson" }, { turnId: "another-turn" }, { boardRevision: first.boardRevision - 1 },
    { batchId: "another-batch" }, { objectId: "exchange-after" as typeof first.objectId },
  ]) {
    expect((await submit({ type: "exchange", target: { ...first, ...changes }, fates: shown })).ok).toBe(false);
  }
  const newer = ok(await submit({ type: "child", text: "Can I try regrouping?", fates: shown }));
  expect(newer.view.exchange).toMatchObject({ lessonId: first.lessonId, boardRevision: first.boardRevision, objectId: first.objectId });
  expect(newer.view.exchange!.turnId).not.toBe(first.turnId);
  expect(newer.view.batches).toEqual(prompt.view.batches);
  expect((await submit({ type: "exchange", target: first }, newer.view.revision)).ok).toBe(false);
  const action = { type: "exchange" as const, target: newer.view.exchange! };
  const attempts = await Promise.all([submit(action, newer.view.revision), submit(action, newer.view.revision)]);
  expect(attempts.filter((r) => r.ok && r.output.newBatches === 1)).toHaveLength(1);
  const reconciled = ok(await submit(action, newer.view.revision));
  expect(reconciled.output.newBatches).toBe(0);
  checkExchange(reconciled.view.batches.slice(-2));
});

it("restores a saved voice action when its worker disconnects before the board confirms it", async () => {
  const { calls, events } = setup();
  const started = ok(await calls.startVoice({ ...input, kind: "family", package: {
    ...SAMPLE_PACKAGES["subtract-52-28"], ref: { source: "workbook", workbookId: "33333333-3333-4333-8333-333333333333", page: 1, question: 1 },
  } }));
  const open = async () => {
    const opened = await calls.openVoice(started.view.id, { speechToText: "fake", voice: "fake" }, null);
    if (!opened.ok) throw Error(opened.error);
    return opened.call;
  };
  const call = await open();
  const first = (await call.start()).boardCues![0].batch;
  const prompt = await call.child("How do I regroup?");
  const show = prompt.boardCues![0].batch;
  const target = (await calls.view(started.view.id))!.exchange!;
  expect(await call.exchange!(target)).toBeNull();
  const shown = [first, show].map((b) => ({ kind: "batch" as const, batchId: b.transactionId, commands: [...b.commands] }));
  await call.observeBoard({ events: shown });
  const result = await call.exchange!(target);
  const batch = result!.boardCues![0].batch;
  expect(await call.exchange!(target)).toBeNull();
  const recovered = await open();
  expect(recovered.pendingExchange).toEqual(batch);
  const cancelled = [...shown, { kind: "cancelled" as const, batchIds: [batch.transactionId] }];
  await recovered.observeBoard({ events: cancelled });
  expect(recovered.pendingExchange).toEqual(batch);
  await recovered.observeBoard({ events: [...cancelled, { kind: "batch", batchId: batch.transactionId, commands: [...batch.commands] }] });
  expect(recovered.pendingExchange).toBeUndefined();
  expect(recovered.session.checkedExchange?.turns.filter((turn) => turn.childAction)).toHaveLength(1);
  expect(recovered.session.done).toEqual([]);
  await recovered.end({ reason: "child_stopped" });
  await recovered.end({ reason: "child_stopped" });
  const logged = await events.read(childId, { from: new Date(clock() - 1).toISOString(), to: new Date(clock() + 1).toISOString() });
  expect(logged).toMatchObject([{ result: "blank", evidence: { kind: "call", id: started.view.id } }]);
});

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

it("keeps worker playout separate from confirmed board delivery and child progress", async () => {
  const { calls } = setup();
  const voice = ok(await calls.startVoice({ ...input, kind: "family" }));
  const opened = await calls.openVoice(voice.view.id, { speechToText: "fake", voice: "fake" }, null);
  if (!opened.ok) throw new Error(opened.error);
  const call = opened.call;
  await call.start();
  const first = await call.child("Can you show me how to regroup?");
  const turnId = first.exchangeTurnId!;
  await call.exchangePlayback!(turnId, "finished");
  const turn = call.session.checkedExchange!.turns[0];
  expect(turn).toMatchObject({ id: turnId, playback: "finished", actions: [{ delivery: "sent" }, { delivery: "sent" }] });
  expect(turn.actions.every(action => !action.fate && !action.presented)).toBe(true);
  expect(turn.childAction).toBeUndefined();
  expect(call.session.done).toEqual([]);
});

it("plans an immediate spoken retry from the confirmed board after a cut", async () => {
  const { calls } = setup();
  const voice = ok(await calls.startVoice({ ...input, kind: "family" }));
  const opened = await calls.openVoice(voice.view.id, { speechToText: "fake", voice: "fake" }, null);
  if (!opened.ok) throw new Error(opened.error);
  const { call } = opened;
  const opening = (await call.start()).boardCues![0].batch;
  const first = await call.child("Show me how to regroup.");
  const [show, trade] = first.boardCues!.map(cue => cue.batch);
  const reached = Promise.withResolvers<boolean>();
  const observed = Promise.withResolvers<void>();
  const retry = call.child("Show me how to regroup again.", undefined, {
    checkedBoardSettled: () => {
      reached.resolve(true);
      return observed.promise;
    },
  });
  try {
    expect(await Promise.race([reached.promise, retry.then(() => false)])).toBe(true);
    await call.observeBoard({ events: [
      ...[opening, show].map(b => ({ kind: "batch" as const, batchId: b.transactionId, commands: [...b.commands] })),
      { kind: "cancelled", batchIds: [trade.transactionId] },
    ] });
  } finally { observed.resolve(); }
  const answer = await retry;
  expect(answer.boardCues).toHaveLength(1);
  expect(answer.boardCues![0].batch.after).toEqual([show.transactionId]);
  expect(answer.boardCues![0].batch.transactionId).not.toBe(trade.transactionId);
});

it("does not hold a newer stop request behind the checked board acknowledgement", async () => {
  const { calls } = setup();
  const voice = ok(await calls.startVoice({ ...input, kind: "family" }));
  const opened = await calls.openVoice(voice.view.id, { speechToText: "fake", voice: "fake" }, null);
  if (!opened.ok) throw new Error(opened.error);
  const { call } = opened;
  await call.start();
  await call.child("Show me how to regroup.");
  const waiting = Promise.withResolvers<void>();
  const observed = Promise.withResolvers<void>();
  const retry = call.child("Show me how to regroup again.", undefined, {
    checkedBoardSettled: () => { waiting.resolve(); return observed.promise; },
  });
  try {
    await waiting.promise;
    expect((await call.child("I want to stop now.")).ended).toBe(true);
    expect((await retry).boardCues ?? []).toEqual([]);
  } finally { observed.resolve(); }
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
  const setupInput: StartInput = {
    ...input, package: {
      ...SAMPLE_PACKAGES["subtract-52-28"], operation, steps: workedSteps(operation), text: "52 - 48 = ?",
      answer: { value: { type: "number", value: 4 }, accepted: [], unit: null },
    },
  };
  const chat = ok(await calls.start(setupInput));
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

  const guided = ok(await calls.start(setupInput));
  const offer = ok(await calls.input(guided.view.id, guided.view.revision, { type: "child", text: "How do I regroup?" }, null));
  const target = offer.view.exchange!;
  const result = ok(await calls.input(guided.view.id, offer.view.revision, {
    type: "exchange", target, fates: [{ batchId: target.batchId, fate: "shown" }],
  }, null));
  expect(result.output.say.join(" ")).toMatch(/5 tens and 13 ones.*still 63/);
  expect(result.output.say.join(" ")).not.toMatch(/\b(?:4|four)\b/i);
  expect(result.view.batches.at(-1)?.commands).toContainEqual(expect.objectContaining({ op: "write", text: "63 = 50 + 13" }));
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

it("checks place value first and chooses support from the child's exchange reasoning", async () => {
  const { calls, answer } = setup();
  for (const [grade, explanation] of [[3, "I don't know."], [3, "Trade one ten for ten ones."]] as const) {
    let turn = ok(await calls.start({ ...input, grade }));
    const say = async (text: string) => {
      turn = ok(await calls.input(turn.view.id, turn.view.revision, { type: "child", text }, null));
      return turn.output.say.join(" ");
    };
    expect(await say("I don't know how to start.")).toMatch(/how many tens.*52/i);
    expect(await say("Five tens.")).toMatch(/what can you trade/i);
    const response = await say(explanation);
    if (explanation.startsWith("Trade")) {
      expect(response).toMatch(/try the whole subtraction/i);
      expect(turn.view.exchange).toBeUndefined();
    } else {
      expect(response).toMatch(/5 tens and 2 ones.*ten for ten ones/i);
      expect(turn.view.exchange).toBeDefined();
    }
  }
  expect(answer).not.toHaveBeenCalled();
});

it("responds to a reversal and coaches the written subtraction without supplying its result", async () => {
  const { calls, store, answer } = setup();
  let turn = ok(await calls.start({ ...input, grade: 3 }));
  const send = async (event: CallInput) => {
    turn = ok(await calls.input(turn.view.id, turn.view.revision, event, null));
    return turn.output.say.join(" ");
  };
  expect(await send({ type: "child", text: "24 because 2 minus 8 is 6." })).toMatch(/start with the top.*swapping/i);
  expect(turn.view.outcome).toBeNull();
  const target = turn.view.exchange!;
  expect(target).toBeDefined();
  const connection = await send({ type: "exchange", target, fates: [{ batchId: target.batchId, fate: "shown" }] });
  expect(connection).toMatch(/4 tens and 12 ones.*write.*tens.*ones.*take away 8 ones/i);
  expect(connection).not.toMatch(/24|twenty.four/i);
  expect(await send({ type: "child", text: "4 ones.", fates: [{ batchId: turn.view.batches.at(-1)!.transactionId, fate: "shown" }] })).toMatch(/take away 2 tens/i);
  expect(await send({ type: "child", text: "2 tens." })).toMatch(/whole difference/i);
  expect(await send({ type: "child", text: "I got 24." })).toMatch(/you found the difference/i);
  await send({ type: "end" });
  expect(turn.view.outcome).toMatchObject({ reason: "solved", assistance: "guided", understanding: "uncertain" });
  expect(checkTrace(store.rows()[0].trace)).toMatchObject({ ok: true });
  expect(answer).not.toHaveBeenCalled();
});

it.each(["independent", "hinted", "demonstrated"] as const)("saves %s answer evidence under the existing call event", async (assistance) => {
  const { calls, events, store } = setup();
  const question = { ...SAMPLE_PACKAGES["subtract-52-28"], ref: { source: "workbook" as const, workbookId: parentId, page: 1, question: 1 } };
  let turn = ok(await calls.start({ ...input, package: question }));
  const send = async (event: CallInput) => {
    turn = ok(await calls.input(turn.view.id, turn.view.revision, event, null));
  };
  if (assistance === "hinted") {
    for (const text of ["I don't know how to start.", "Five tens.", "I don't know."]) {
      await send({ type: "child", text });
    }
  }
  if (assistance === "demonstrated") {
    await send({ type: "child", text: "Show me how to regroup." });
  }
  await send({
    type: "child", text: "My answer is 24.",
    fates: turn.view.batches.slice(turn.view.batches.length - turn.output.newBatches).map((b) => ({ batchId: b.transactionId, fate: "shown" as const })),
  });
  await send({ type: "end" });
  await send({ type: "end" });
  const recorded = await events.read(childId, { from: "2026-11-17T00:00:00Z", to: "2026-11-18T00:00:00Z" });
  expect(recorded).toMatchObject([{
    result: assistance === "independent" ? "right" : "right_with_help",
    evidence: { kind: "call", id: turn.view.id },
  }]);
  expect(store.rows()[0].trace?.checkedExchange?.turns.flatMap((entry) => entry.observation ? [entry.observation] : []))
    .toContainEqual({ skill: "difference", result: "correct", assistance, at: clock() });
});

it("resumes the written step after interrupted voice playback without doing the exchange twice", async () => {
  const { calls, answer } = setup();
  const voice = ok(await calls.startVoice({ ...input, kind: "family", grade: 6 }));
  const open = async () => {
    const opened = await calls.openVoice(voice.view.id, { speechToText: "fake", voice: "fake" }, null);
    if (!opened.ok) throw Error(opened.error);
    return opened.call;
  };
  const observe = (board: Batch) => ({ kind: "batch" as const, batchId: board.transactionId, commands: [...board.commands] });
  const call = await open();
  const opening = (await call.start()).boardCues![0].batch;
  const prerequisite = await call.child("I don't know how to start.");
  expect(prerequisite.say.join(" ")).toMatch(/tens digit in 52/i);
  const prompt = await call.child("Two minus eight is six.");
  expect(prompt.say.join(" ")).toMatch(/start with the top.*swapping/i);
  const show = prompt.boardCues![0].batch;
  await call.observeBoard({ events: [opening, show].map(observe) });
  const target = (await calls.view(voice.view.id))!.exchange!;
  const exchange = (await call.exchange!(target))!;
  const trade = exchange.boardCues![0].batch;
  await call.observeBoard({ events: [opening, show, trade].map(observe) });
  await call.exchangePlayback!(exchange.exchangeTurnId!, "interrupted");

  const resumed = await open();
  expect(resumed.pendingExchange).toBeUndefined();
  const repeat = await resumed.child("Can you repeat that?");
  expect(repeat.say.join(" ")).toMatch(/4 tens and 12 ones.*columns.*take away 8 ones/i);
  expect(repeat.boardCues ?? []).toEqual([]);
  expect((await resumed.child("Four ones.")).say.join(" ")).toMatch(/take away 2 tens/i);
  expect(resumed.session.checkedExchange?.turns.filter((turn) => turn.observation?.skill === "perform_exchange")).toHaveLength(1);
  expect(answer).not.toHaveBeenCalled();
  await resumed.end({ reason: "child_stopped" });
});

it("clears a correct difference when the child replaces its reasoning with a false equation", async () => {
  const { calls } = setup();
  const started = ok(await calls.start(input));
  const solved = ok(await calls.input(started.view.id, started.view.revision, { type: "child", text: "My answer is 24." }, null));
  expect(solved.output.say.join(" ")).toMatch(/found the difference/i);
  const revised = ok(await calls.input(solved.view.id, solved.view.revision, {
    type: "child", text: "Actually, my answer is 24 because 12 minus 8 is 6.",
  }, null));
  const ended = ok(await calls.input(revised.view.id, revised.view.revision, { type: "end" }, null));
  expect(ended.view.outcome?.reason).toBe("child_stopped");
});

it("does not start a subtraction lesson when the child asks to learn an unrelated subject", async () => {
  const { calls, answer } = setup();
  const started = ok(await calls.start(input));
  const response = ok(await calls.input(started.view.id, started.view.revision, {
    type: "child", text: "Teach me to draw a horse.",
  }, null));
  expect(response.output.exchangeTurnId).toBeUndefined();
  expect(answer).toHaveBeenCalled();
});
