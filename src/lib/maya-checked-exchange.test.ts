import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { applyBatch, boardTargets, createScene, type Batch } from "@/lib/board";
import { learningEvents } from "@/lib/learning-events";
import { memoryLearningEventStore } from "@/lib/learning-events-memory";
import { memoryWordingHistoryStore } from "@/lib/maya";
import { mayaCalls, type CallInput, type CallRecord, type CallResult, type CallSeams, type StartInput } from "@/lib/maya-call";
import { codeSentences, noteFacts } from "@/lib/maya-call-note";
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

/** The call question's event first, then its related question's (both have the call's end time). */
const byKey = <T extends { key: string }>(events: T[]) => [...events].sort((a, b) => a.key.localeCompare(b.key));

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

it.each(["I swapped 2 and 8", "I took two away from eight"])("does not credit 24 with reversed reasoning: %s", async (reason) => {
  const { calls, store } = setup();
  const started = ok(await calls.start(input));
  const turn = ok(await calls.input(started.view.id, started.view.revision, { type: "child", text: `My answer is 24 because ${reason}.` }, null));
  expect(turn.output.say.join(" ")).toMatch(/swapping the numbers changes the problem/i);
  const ended = ok(await calls.input(turn.view.id, turn.view.revision, { type: "end" }, null));
  expect(ended.view.outcome?.reason).toBe("child_stopped");
  expect(store.rows()[0].trace?.checkedExchange?.turns.some(t => t.observation?.skill === "difference")).toBe(false);
});

it("records sent chat help even if the board has not acknowledged it", async () => {
  const { calls } = setup();
  let turn = ok(await calls.start(input));
  for (const text of ["I don't know how to start.", "Five tens.", "I don't know.", "My answer is 24."]) {
    turn = ok(await calls.input(turn.view.id, turn.view.revision, { type: "child", text }, null));
  }
  const ended = ok(await calls.input(turn.view.id, turn.view.revision, { type: "end" }, null));
  expect(ended.view.outcome).toMatchObject({ reason: "solved", assistance: "hint" });
});

it.each(["interrupted", "finished"] as const)("preserves the evidence for %s voice help after replacement", async (playback) => {
  const { calls, events, store } = setup();
  const question = { ...SAMPLE_PACKAGES["subtract-52-28"], ref: { source: "workbook" as const, workbookId: parentId, page: 1, question: 1 } };
  const started = ok(await calls.startVoice({ ...input, kind: "family", package: question }));
  const open = async () => {
    const result = await calls.openVoice(started.view.id, { speechToText: "fake", voice: "fake" }, null);
    if (!result.ok) throw Error(result.error);
    return result.call;
  };
  const call = await open();
  await call.start();
  const reply = await call.child("Show me how to regroup.");
  await call.exchangePlayback!(reply.exchangeTurnId!, playback);
  await call.settled();
  const resumed = await open();
  await resumed.child("My answer is 24.");
  await resumed.end({ reason: "child_stopped" });
  const record = store.rows()[0];
  const observation = record.trace?.checkedExchange?.turns.find(t => t.observation?.skill === "difference")?.observation;
  expect(observation).toMatchObject({ result: "correct", assistance: playback === "finished" ? "demonstrated" : "uncertain" });
  const learned = await events.read(childId, { from: "2026-11-17T00:00:00Z", to: "2026-11-18T00:00:00Z" });
  expect(learned).toMatchObject([{ result: playback === "finished" ? "right_with_help" : "blank" }]);
  const finished = noteFacts({ outcome: record.outcome!, event: learned[0], package: question, question: question.ref });
  expect(finished.finished).toBe(playback === "finished" ? "with_help" : "help_unconfirmed");
  if (playback === "interrupted") expect(codeSentences(finished).join(" ")).toContain("gave the correct answer");
});

it("does not credit a place value count with an unresolved transcript alternative", async () => {
  const { calls } = setup();
  const started = ok(await calls.startVoice({ ...input, kind: "family" }));
  const result = await calls.openVoice(started.view.id, { speechToText: "fake", voice: "fake" }, null);
  if (!result.ok) throw Error(result.error);
  const call = result.call;
  await call.start();
  const prompt = await call.child("I don't know how to start.");
  await call.exchangePlayback!(prompt.exchangeTurnId!, "finished");
  const reply = await call.child("Five tens.", { alternatives: ["Four tens."] });
  expect(reply.say.join(" ")).not.toMatch(/what can you trade/i);
  expect(call.session.checkedExchange?.turns.some(t => t.observation?.skill === "identify_tens")).toBe(false);
  await call.end({ reason: "child_stopped" });
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

it("starts a related question when the child accepts and keeps the original question's record", async () => {
  const { calls, answer, events, store } = setup();
  const question = { ...SAMPLE_PACKAGES["subtract-52-28"], ref: { source: "workbook" as const, workbookId: parentId, page: 1, question: 1 } };
  let turn = ok(await calls.start({ ...input, package: question }));
  const say = async (text: string) => {
    turn = ok(await calls.input(turn.view.id, turn.view.revision, { type: "child", text }, null));
    return turn.output.say.join(" ");
  };
  expect(await say("My answer is 24.")).toMatch(/you found the difference.*one more like this on your own\?$/i);
  const start = await say("Yes.");
  expect(start).toMatch(/63 minus 27/i);
  expect(start).not.toMatch(/\b36\b|thirty.six/i);
  const board = turn.view.batches.slice(-turn.output.newBatches);
  expect(board[0].commands[0]).toEqual({ op: "clear", scope: "maya_objects" });
  expect(board.flatMap((b) => b.commands)).toContainEqual(expect.objectContaining({ op: "write", text: "63 - 27 = ?" }));
  expect(turn.view.outcome).toBeNull();
  const closing = await say("36.");
  expect(closing).toMatch(/you found the difference/i);
  expect(closing).not.toMatch(/master|explain|\?/i);
  expect(turn.view.outcome).toMatchObject({ reason: "solved", assistance: "independent", transfer: { result: "right", assistance: "independent" } });
  await calls.input(turn.view.id, turn.view.revision, { type: "end" }, null);
  await calls.input(turn.view.id, turn.view.revision, { type: "end" }, null);
  const recorded = byKey(await events.read(childId, { from: "2026-11-17T00:00:00Z", to: "2026-11-18T00:00:00Z" }));
  expect(recorded).toMatchObject([
    { key: `call:${turn.view.id}`, result: "right", question: question.ref, evidence: { kind: "call", id: turn.view.id } },
    {
      key: `call:${turn.view.id}:transfer`, source: "call", result: "right", assistance: "independent", stuckStep: null, hints: 0,
      question: { source: "transfer", text: "63 - 27 = ?" }, skill: question.skill, evidence: { kind: "call", id: turn.view.id },
    },
  ]);
  expect(recorded[1].question).toEqual({ source: "transfer", relatedEventId: recorded[0].id, text: "63 - 27 = ?" });
  expect(recorded[0]).not.toHaveProperty("assistance");
  const trace = store.rows()[0].trace!;
  expect(checkTrace(trace)).toMatchObject({ ok: true });
  expect(trace.checkedExchange?.transfer).toMatchObject({ operands: [63, 27], state: "finished", eventKey: recorded[1].key });
  expect(trace.checkedExchange?.turns.filter((t) => t.observation?.skill === "difference").map((t) => [t.transfer === true, t.observation!.assistance]))
    .toEqual([[false, "independent"], [true, "independent"]]);
  expect(answer).not.toHaveBeenCalled();
});

it("closes normally when the child declines, and makes no offer without time for one", async () => {
  let now = clock();
  const { calls, store, events } = setup({ clock: () => now });
  const declined = ok(await calls.start({ ...input, package: { ...SAMPLE_PACKAGES["subtract-52-28"], ref: { source: "workbook", workbookId: parentId, page: 1, question: 1 } } }));
  const offer = ok(await calls.input(declined.view.id, declined.view.revision, { type: "child", text: "My answer is 24." }, null));
  const bye = ok(await calls.input(offer.view.id, offer.view.revision, { type: "child", text: "No thanks." }, null));
  expect(bye.output.say.join(" ")).toMatch(/great work today\. bye for now!$/i);
  expect(bye.output.newBatches).toBe(0);
  expect(bye.view.outcome).toMatchObject({ reason: "solved", assistance: "independent" });
  expect(bye.view.outcome).not.toHaveProperty("transfer");
  expect(checkTrace(store.rows()[0].trace)).toMatchObject({ ok: true });
  expect((await events.read(childId, { from: "2026-11-17T00:00:00Z", to: "2026-11-18T00:00:00Z" })).map((e) => e.key)).toEqual([`call:${bye.view.id}`]);

  const late = ok(await calls.start(input));
  now += 7 * 60_000 + 1;
  const solved = ok(await calls.input(late.view.id, late.view.revision, { type: "child", text: "My answer is 24." }, null));
  expect(solved.output.say.join(" ")).toBe("You found the difference.");
  const reply = ok(await calls.input(solved.view.id, solved.view.revision, { type: "child", text: "Yes." }, null));
  expect(reply.output.say.join(" ")).not.toMatch(/minus/i);
});

it("never offers a related question whose minuend Maya already worked as an example", async () => {
  const { calls } = setup();
  const operation: Operation = { kind: "subtract", operands: [52, 48] };
  let turn = ok(await calls.start({
    ...input, package: {
      ...SAMPLE_PACKAGES["subtract-52-28"], operation, steps: workedSteps(operation), text: "52 - 48 = ?",
      answer: { value: { type: "number", value: 4 }, accepted: [], unit: null },
    },
  }));
  const say = async (text: string) => {
    turn = ok(await calls.input(turn.view.id, turn.view.revision, {
      type: "child", text, fates: turn.view.batches.slice(turn.view.batches.length - turn.output.newBatches).map((b) => ({ batchId: b.transactionId, fate: "shown" as const })),
    }, null));
    return turn.output.say.join(" ");
  };
  expect(await say("Show me how to regroup.")).toMatch(/separate example: 63/i);
  expect(await say("My answer is 4.")).toMatch(/one more like this/i);
  const start = await say("Yes please.");
  expect(start).toMatch(/74 minus 38/i);
  expect(turn.view.batches.at(-1)!.commands).toEqual([
    { op: "clear", scope: "maya_objects" }, expect.objectContaining({ op: "write", text: "74 - 38 = ?" }),
  ]);
});

it("keeps hinted related work apart from the original success in the record and the parent note", async () => {
  const { calls, events, store } = setup();
  const question = { ...SAMPLE_PACKAGES["subtract-52-28"], ref: { source: "workbook" as const, workbookId: parentId, page: 1, question: 1 } };
  let turn = ok(await calls.start({ ...input, package: question, grade: 3 }));
  const said: string[] = [];
  const say = async (text: string) => {
    turn = ok(await calls.input(turn.view.id, turn.view.revision, { type: "child", text }, null));
    said.push(turn.output.say.join(" "));
    return said.at(-1)!;
  };
  await say("My answer is 24.");
  await say("Yes.");
  expect(await say("I don't know.")).toMatch(/what can you trade/i);
  expect(await say("Trade one ten for ten ones.")).toMatch(/take away 7 ones/i);
  expect(await say("6 ones.")).toMatch(/take away 2 tens/i);
  expect(await say("3 tens.")).toMatch(/put your tens and ones together/i);
  // Maya never gives the related answer, in one message or across messages.
  const maya = said.slice(0, -1).join(" ");
  expect(maya).not.toMatch(/\b36\b|thirty.six|\b3 tens\b|\b6 ones\b/i);
  expect(await say("36.")).toMatch(/you found the difference/i);
  expect(turn.view.outcome).toMatchObject({ reason: "solved", assistance: "independent", transfer: { result: "right", assistance: "hinted" } });
  await calls.input(turn.view.id, turn.view.revision, { type: "end" }, null);
  const [event, related] = byKey(await events.read(childId, { from: "2026-11-17T00:00:00Z", to: "2026-11-18T00:00:00Z" }));
  expect(event).toMatchObject({ result: "right", hints: 0, stuckStep: null });
  expect(related).toMatchObject({ result: "right_with_help", assistance: "hinted", hints: 4, stuckStep: "ones", question: { source: "transfer" } });
  const record = store.rows()[0];
  expect(record.trace?.checkedExchange?.turns.filter((t) => t.transfer && t.observation).map((t) => [t.observation!.skill, t.observation!.assistance]))
    .toEqual([["explain_exchange", "hinted"], ["subtract_ones", "hinted"], ["subtract_tens", "hinted"], ["difference", "hinted"]]);
  const sentences = codeSentences(noteFacts({ outcome: record.outcome!, event, package: question, question: question.ref })).join(" ");
  expect(sentences).toContain("finished it with no help.");
  expect(sentences).toContain("Then {child} tried a related question and got it right with hints.");
  expect(sentences).not.toMatch(/master|on (?:their|his|her) own/i);
});

it("reads corrections on both questions without letting the related answer change the original record", async () => {
  const { calls } = setup();
  // #1089 is a regression input: "24 plus 1." still keeps the original success (open), but it cannot answer the offer.
  for (const correction of ["Actually, my answer is 25.", "24 plus 1."]) {
    const started = ok(await calls.start(input));
    const offer = ok(await calls.input(started.view.id, started.view.revision, { type: "child", text: "My answer is 24." }, null));
    const changed = ok(await calls.input(offer.view.id, offer.view.revision, { type: "child", text: correction }, null));
    expect(changed.output.say.join(" ")).not.toMatch(/minus 27|one more like this/i);
    const late = ok(await calls.input(changed.view.id, changed.view.revision, { type: "child", text: "Yes." }, null));
    expect(late.output.say.join(" ")).not.toMatch(/minus 27/i);
    const ended = ok(await calls.input(late.view.id, late.view.revision, { type: "end" }, null));
    if (correction.startsWith("Actually")) expect(ended.view.outcome?.reason).not.toBe("solved");
    expect(ended.view.outcome).not.toHaveProperty("transfer");
  }
  let turn = ok(await calls.start(input));
  const say = async (text: string) => {
    turn = ok(await calls.input(turn.view.id, turn.view.revision, { type: "child", text }, null));
    return turn.output.say.join(" ");
  };
  await say("My answer is 24.");
  await say("Yes.");
  expect(await say("36, no, 37.")).not.toMatch(/found the difference/i);
  expect(turn.view.outcome).toBeNull();
  expect(await say("37, no wait, 36.")).toMatch(/found the difference/i);
  expect(turn.view.outcome).toMatchObject({ reason: "solved", assistance: "independent", transfer: { result: "right" } });
});

it("starts the related question once on a duplicate submit and resumes it after a voice reconnect", async () => {
  const { calls, store, events } = setup();
  const chat = ok(await calls.start(input));
  const offer = ok(await calls.input(chat.view.id, chat.view.revision, { type: "child", text: "My answer is 24." }, null));
  const yes = { type: "child" as const, text: "Yes." };
  const attempts = await Promise.all([calls.input(chat.view.id, offer.view.revision, yes, null), calls.input(chat.view.id, offer.view.revision, yes, null)]);
  expect(attempts.filter((r) => r.ok && r.output.newBatches === 1)).toHaveLength(1);
  expect((await calls.view(chat.view.id))!.batches.filter((b) => b.commands.some((c) => (c as { op?: string }).op === "clear"))).toHaveLength(1);

  const question = { ...SAMPLE_PACKAGES["subtract-52-28"], ref: { source: "workbook" as const, workbookId: parentId, page: 1, question: 1 } };
  const voice = ok(await calls.startVoice({ ...input, kind: "family", package: question }));
  const open = async () => {
    const opened = await calls.openVoice(voice.view.id, { speechToText: "fake", voice: "fake" }, null);
    if (!opened.ok) throw Error(opened.error);
    return opened.call;
  };
  const call = await open();
  await call.start();
  expect((await call.child("My answer is 24.")).say.join(" ")).toMatch(/one more like this/i);
  const start = await call.child("Yes.");
  expect(start.say.join(" ")).toMatch(/63 minus 27/i);
  expect(start.boardCues?.[0].batch.commands[0]).toEqual({ op: "clear", scope: "maya_objects" });
  await call.settled();
  const resumed = await open();
  expect(resumed.session.checkedExchange?.transfer?.state).toBe("started");
  const hint = await resumed.child("I don't know.");
  await resumed.exchangePlayback!(hint.exchangeTurnId!, "interrupted");
  const closing = await resumed.child("36.");
  expect(closing.say.join(" ")).toMatch(/found the difference/i);
  expect(closing.ended).toBe(true);
  await resumed.end({ reason: "child_stopped" });
  const record = store.rows().find((row) => row.id === voice.view.id)!;
  expect(record.outcome).toMatchObject({ reason: "solved", assistance: "independent", transfer: { result: "right", assistance: "uncertain" } });
  expect(record.trace?.checkedExchange?.turns.filter((t) => t.observation?.skill === "difference")).toHaveLength(2);
  const learned = byKey(await events.read(childId, { from: "2026-11-17T00:00:00Z", to: "2026-11-18T00:00:00Z" }));
  expect(learned).toMatchObject([
    { result: "right", evidence: { id: voice.view.id } },
    { result: "right_with_help", assistance: "uncertain", question: { source: "transfer" }, evidence: { id: voice.view.id } },
  ]);
  expect(codeSentences(noteFacts({ outcome: record.outcome!, event: learned[0], package: question, question: question.ref })).join(" "))
    .toContain("gave the correct answer to a related question. The amount of help is unknown.");
});

it("records a demonstrated related answer and draws the same related question in chat and voice", async () => {
  const { calls, store } = setup();
  let turn = ok(await calls.start(input));
  const say = async (text: string) => {
    turn = ok(await calls.input(turn.view.id, turn.view.revision, { type: "child", text }, null));
    return turn.output.say.join(" ");
  };
  await say("My answer is 24.");
  const typed = await say("Yes.");
  let scene = createScene();
  for (const batch of turn.view.batches) {
    const applied = applyBatch(scene, batch);
    if (!applied.ok) throw new Error(applied.refusal.reason);
    scene = applied.scene;
  }
  expect(boardTargets(scene).map((t) => t.value)).not.toContain("52");
  expect(await say("Show me how to regroup.")).toMatch(/5 tens and 13 ones.*still 63.*take away 7 ones/i);
  await say("6 ones.");
  await say("3 tens.");
  await say("36.");
  expect(turn.view.outcome).toMatchObject({ transfer: { result: "right", assistance: "demonstrated" } });
  expect(codeSentences(noteFacts({ outcome: turn.view.outcome!, event: null, package: SAMPLE_PACKAGES["subtract-52-28"], question: SAMPLE_PACKAGES["subtract-52-28"].ref })).join(" "))
    .toContain("Then Maya showed the trade again, and {child} got a related question right.");

  const voice = ok(await calls.startVoice({ ...input, kind: "family" }));
  const opened = await calls.openVoice(voice.view.id, { speechToText: "fake", voice: "fake" }, null);
  if (!opened.ok) throw Error(opened.error);
  await opened.call.start();
  await opened.call.child("My answer is 24.");
  expect((await opened.call.child("Yes.")).say.join(" ")).toBe(typed);
  await opened.call.end({ reason: "child_stopped" });
  expect(checkTrace(store.rows().find((row) => row.id === voice.view.id)!.trace)).toMatchObject({ ok: true });
});

it("ends an unfinished related question at the time limit with the original success intact", async () => {
  let now = clock();
  const { calls, events } = setup({ clock: () => now });
  let turn = ok(await calls.start({ ...input, package: { ...SAMPLE_PACKAGES["subtract-52-28"], ref: { source: "workbook", workbookId: parentId, page: 1, question: 1 } } }));
  turn = ok(await calls.input(turn.view.id, turn.view.revision, { type: "child", text: "My answer is 24." }, null));
  turn = ok(await calls.input(turn.view.id, turn.view.revision, { type: "child", text: "Yes." }, null));
  now += 10 * 60_000;
  const late = ok(await calls.input(turn.view.id, turn.view.revision, { type: "child", text: "Um, 40?" }, null));
  const ended = late.view.outcome ? late : ok(await calls.input(late.view.id, late.view.revision, { type: "end" }, null));
  expect(ended.view.outcome).toMatchObject({ reason: "solved", transfer: { result: "unfinished", assistance: "independent" } });
  expect(ended.view.outcome!.seconds).toBeLessThanOrEqual(600);
  await calls.input(ended.view.id, ended.view.revision, { type: "end" }, null);
  expect(byKey(await events.read(childId, { from: "2026-11-17T00:00:00Z", to: "2026-11-18T00:00:00Z" }))).toMatchObject([
    { result: "right" }, { result: "blank", assistance: "independent", stuckStep: "ones", question: { source: "transfer" } },
  ]);
  expect(codeSentences(noteFacts({ outcome: ended.view.outcome!, event: null, package: SAMPLE_PACKAGES["subtract-52-28"], question: SAMPLE_PACKAGES["subtract-52-28"].ref })).join(" "))
    .toContain("started a related question but did not finish it.");
});

it("keeps a correct answer saved by the code before the related question when the new code replays it", async () => {
  // Records saved by base commit fee7814e6 right after "My answer is 24." in chat and in voice.
  const saved = (await import("@/lib/maya/__fixtures__/checked-exchange-base-fee7814e6.json")).default.records as unknown as CallRecord[];
  const store = memoryCallStore({ clock, testFamilies: [parentId] });
  for (const record of saved) await store.insert(record);
  const { calls, events } = setup({ store, connections: memoryConnectionLog(store, clock) });
  const [chat, voice] = saved;
  const next = ok(await calls.input(chat.id, chat.revision, { type: "child", text: "Yes." }, null));
  expect(next.output.say.join(" ")).not.toMatch(/minus 27/i);
  const ended = ok(await calls.input(chat.id, next.view.revision, { type: "end" }, null));
  expect(ended.view.outcome).toMatchObject({ reason: "solved", assistance: "independent" });
  expect(ended.view.outcome).not.toHaveProperty("transfer");

  const opened = await calls.openVoice(voice.id, { speechToText: "fake", voice: "fake" }, null);
  if (!opened.ok) throw Error(opened.error);
  expect(opened.call.session).toMatchObject({ solved: "child", lastResult: "right" });
  await opened.call.end({ reason: "child_stopped" });
  const learned = await events.read(childId, { from: "2026-11-17T00:00:00Z", to: "2026-11-18T00:00:00Z" });
  expect(byKey(learned)).toMatchObject([{ key: `call:${chat.id}`, result: "right" }, { key: `call:${voice.id}`, result: "right" }]);
});

it.each([["36.", "right"], ["I'm done.", "blank"]] as const)("closes with a valid trace on %s right after a reconnect lost the related board", async (text, result) => {
  const { calls, events, store } = setup();
  const question = { ...SAMPLE_PACKAGES["subtract-52-28"], ref: { source: "workbook" as const, workbookId: parentId, page: 1, question: 1 } };
  const voice = ok(await calls.startVoice({ ...input, kind: "family", package: question }));
  const open = async () => {
    const opened = await calls.openVoice(voice.view.id, { speechToText: "fake", voice: "fake" }, null);
    if (!opened.ok) throw Error(opened.error);
    return opened.call;
  };
  const call = await open();
  const opening = (await call.start()).boardCues![0].batch;
  await call.child("My answer is 24.");
  const related = (await call.child("Yes.")).boardCues![0].batch;
  await call.settled();
  const resumed = await open();
  await resumed.observeBoard({ events: [
    { kind: "batch", batchId: opening.transactionId, commands: [...opening.commands] }, { kind: "cancelled", batchIds: [related.transactionId] },
  ] });
  const closing = await resumed.child(text);
  expect(closing.ended).toBe(true);
  expect(closing.boardCues ?? []).toEqual([]);
  await resumed.end({ reason: "child_stopped" });
  expect(checkTrace(store.rows()[0].trace)).toMatchObject({ ok: true });
  expect(byKey(await events.read(childId, { from: "2026-11-17T00:00:00Z", to: "2026-11-18T00:00:00Z" })))
    .toMatchObject([{ result: "right" }, { result, question: { source: "transfer" } }]);
});

it("shows the related question again when a voice reconnect lost its board batch", async () => {
  const { calls, events } = setup();
  const question = { ...SAMPLE_PACKAGES["subtract-52-28"], ref: { source: "workbook" as const, workbookId: parentId, page: 1, question: 1 } };
  const voice = ok(await calls.startVoice({ ...input, kind: "family", package: question }));
  const open = async () => {
    const opened = await calls.openVoice(voice.view.id, { speechToText: "fake", voice: "fake" }, null);
    if (!opened.ok) throw Error(opened.error);
    return opened.call;
  };
  const observe = (board: Batch) => ({ kind: "batch" as const, batchId: board.transactionId, commands: [...board.commands] });
  const call = await open();
  const opening = (await call.start()).boardCues![0].batch;
  await call.child("My answer is 24.");
  const related = (await call.child("Yes.")).boardCues![0].batch;
  expect(related.commands[0]).toEqual({ op: "clear", scope: "maya_objects" });
  await call.settled();

  const resumed = await open();
  expect(resumed.pendingExchange).toEqual(related);
  await resumed.observeBoard({ events: [observe(opening), { kind: "cancelled", batchIds: [related.transactionId] }] });
  const repeat = await resumed.child("Can you repeat that?");
  expect(repeat.say.join(" ")).toMatch(/63 minus 27/i);
  expect(repeat.boardCues?.map((cue) => cue.batch.commands)).toEqual([related.commands]);
  const again = repeat.boardCues![0].batch;
  expect(again.transactionId).not.toBe(related.transactionId);
  await resumed.observeBoard({ events: [observe(opening), { kind: "cancelled", batchIds: [related.transactionId] }, observe(again)] });
  expect(resumed.pendingExchange).toBeUndefined();
  expect((await resumed.child("What did you say?")).boardCues ?? []).toEqual([]);
  expect((await resumed.child("36.")).ended).toBe(true);
  await resumed.end({ reason: "child_stopped" });
  expect(byKey(await events.read(childId, { from: "2026-11-17T00:00:00Z", to: "2026-11-18T00:00:00Z" })))
    .toMatchObject([{ result: "right" }, { result: "right", assistance: "independent", question: { source: "transfer" } }]);
});

it("keeps the related question offer open through a patient line and a silence check-in", async () => {
  let now = clock();
  const { calls, events } = setup({ clock: () => now });
  const question = { ...SAMPLE_PACKAGES["subtract-52-28"], ref: { source: "workbook" as const, workbookId: parentId, page: 1, question: 1 } };
  const keys: string[] = [];
  for (const pause of ["thinking", "silence"] as const) {
    let turn = ok(await calls.start({ ...input, package: question }));
    const send = async (event: CallInput) => {
      turn = ok(await calls.input(turn.view.id, turn.view.revision, event, null));
      return turn.output.say.join(" ");
    };
    expect(await send({ type: "child", text: "My answer is 24." })).toMatch(/one more like this/i);
    if (pause === "thinking") expect(await send({ type: "child", text: "I'm thinking." })).not.toMatch(/minus/i);
    else {
      now += 16_000;
      expect(await send({ type: "tick" })).not.toBe("");
    }
    expect(await send({ type: "child", text: "Yes." })).toMatch(/63 minus 27/i);
    await send({ type: "child", text: "36." });
    await send({ type: "end" });
    keys.push(`call:${turn.view.id}`, `call:${turn.view.id}:transfer`);
  }
  const learned = await events.read(childId, { from: "2026-11-17T00:00:00Z", to: "2026-11-18T00:00:00Z" });
  expect(learned.map((e) => e.key).sort()).toEqual(keys.sort());
  expect(learned.filter((e) => e.question.source === "transfer").map((e) => [e.result, e.assistance])).toEqual([["right", "independent"], ["right", "independent"]]);
});

it.each(["I'm done.", "I want to stop."])("closes normally on %s during the related question and records it unfinished", async (text) => {
  const { calls, events } = setup();
  const question = { ...SAMPLE_PACKAGES["subtract-52-28"], ref: { source: "workbook" as const, workbookId: parentId, page: 1, question: 1 } };
  let turn = ok(await calls.start({ ...input, package: question }));
  for (const said of ["My answer is 24.", "Yes."]) turn = ok(await calls.input(turn.view.id, turn.view.revision, { type: "child", text: said }, null));
  const bye = ok(await calls.input(turn.view.id, turn.view.revision, { type: "child", text }, null));
  expect(bye.output.say.join(" ")).toMatch(/bye for now!$/i);
  expect(bye.output.say.join(" ")).not.toMatch(/minus/i);
  expect(bye.view.outcome).toMatchObject({ reason: "solved", transfer: { result: "unfinished", assistance: "independent" } });
  await calls.input(bye.view.id, bye.view.revision, { type: "end" }, null);
  expect(byKey(await events.read(childId, { from: "2026-11-17T00:00:00Z", to: "2026-11-18T00:00:00Z" })))
    .toMatchObject([{ result: "right" }, { result: "blank", stuckStep: "ones", question: { source: "transfer" } }]);
});

it("answers who Maya is during the related question and comes back to that question", async () => {
  const { calls, store, events } = setup();
  let turn = ok(await calls.start({ ...input, package: { ...SAMPLE_PACKAGES["subtract-52-28"], ref: { source: "workbook", workbookId: parentId, page: 1, question: 1 } } }));
  for (const said of ["My answer is 24.", "Yes."]) turn = ok(await calls.input(turn.view.id, turn.view.revision, { type: "child", text: said }, null));
  const batches = turn.view.batches.length;
  const reply = ok(await calls.input(turn.view.id, turn.view.revision, { type: "child", text: "Are you a real person?" }, null));
  const said = reply.output.say.join(" ");
  expect(said).toMatch(/\bAI\b/);
  expect(said).toMatch(/63 [-\u2212] 27/);
  expect(said).not.toMatch(/52/);
  expect(reply.view.batches).toHaveLength(batches);
  const closing = ok(await calls.input(reply.view.id, reply.view.revision, { type: "child", text: "36." }, null));
  expect(closing.view.outcome).toMatchObject({ reason: "solved", transfer: { result: "right", assistance: "independent" } });
  expect(checkTrace(store.rows()[0].trace)).toMatchObject({ ok: true });
  await calls.input(closing.view.id, closing.view.revision, { type: "end" }, null);
  expect(byKey(await events.read(childId, { from: "2026-11-17T00:00:00Z", to: "2026-11-18T00:00:00Z" })))
    .toMatchObject([{ result: "right" }, { result: "right", assistance: "independent", question: { source: "transfer" } }]);
});

// ---------- #1155: Checked division through sharing and exchange ----------

function divisionPackage(a: number, b: number, workbookId = "sample") {
  const operation: Operation = { kind: "divide", operands: [a, b] };
  const easier: Operation = { kind: "divide", operands: [8, 2] };
  return {
    id: `divide-${a}-${b}`,
    ref: { source: "workbook" as const, workbookId, page: 1, question: 1 },
    templateId: null,
    text: `${a} ÷ ${b} = ?`,
    answer: { value: { type: "number" as const, value: a / b }, accepted: [], unit: null },
    operation,
    steps: workedSteps(operation),
    skill: { standard: "4.5", skills: ["4.5-divide-1-digit"] },
    level: 14,
    difficulty: 2 as const,
    wrongAnswers: [{ value: { type: "number" as const, value: a - b }, cause: "wrong-op", description: "Subtracted instead of dividing", step: null }],
    easierExample: { text: "8 ÷ 2 = ?", operation: easier, answer: { type: "number" as const, value: 4 }, steps: workedSteps(easier) },
  };
}

function applyAll(batches: readonly Batch[]) {
  let scene = createScene();
  for (const batch of batches) {
    const applied = applyBatch(scene, batch);
    if (!applied.ok) throw new Error(`${batch.transactionId}: ${applied.refusal.reason}`);
    scene = applied.scene;
  }
  return scene;
}

it("84 ÷ 4: checks prerequisites, lets a proficient child solve independently, and guides a struggling child with Share the tens without bring-down", async () => {
  const { calls, answer, store, events } = setup();
  const pkg = divisionPackage(84, 4, parentId);
  // Proficient path: answers tens and equal-sharing checks -> skips demo -> solves -> optional transfer 69 ÷ 3
  let turn = ok(await calls.start({ ...input, package: pkg, grade: 4 }));
  const say = async (text: string) => {
    turn = ok(await calls.input(turn.view.id, turn.view.revision, { type: "child", text }, null));
    return turn.output.say.join(" ");
  };
  expect(await say("I don't know how to start.")).toMatch(/how many tens.*84/i);
  expect(await say("8 tens.")).toMatch(/share 8 tens equally into 4 groups/i);
  expect(await say("2 tens.")).toMatch(/try the whole division on your own/i);
  expect(turn.view.exchange).toBeUndefined();
  expect(await say("My answer is 21.")).toMatch(/you found the quotient.*one more like this on your own\?$/i);
  const transferStart = await say("Yes.");
  expect(transferStart).toMatch(/69 divided by 3/i);
  expect(transferStart).not.toMatch(/\b23\b|twenty.three/i);
  expect(turn.view.batches.at(-1)?.commands).toEqual([
    { op: "clear", scope: "maya_objects" },
    expect.objectContaining({ op: "write", text: "69 ÷ 3 = ?" }),
  ]);
  const transferDone = await say("23.");
  expect(transferDone).toMatch(/you found the quotient/i);
  expect(turn.view.outcome).toMatchObject({ reason: "solved", assistance: "independent", transfer: { result: "right", assistance: "independent" } });
  await calls.input(turn.view.id, turn.view.revision, { type: "end" }, null);
  expect(checkTrace(store.rows()[0].trace)).toMatchObject({ ok: true });
  expect(byKey(await events.read(childId, { from: "2026-11-17T00:00:00Z", to: "2026-11-18T00:00:00Z" }))).toMatchObject([
    { result: "right" },
    { result: "right", assistance: "independent", question: { source: "transfer", text: "69 ÷ 3 = ?" } },
  ]);

  // Struggling path: Share the tens action connects blocks to written division without saying "bring down" or revealing 21
  let guided = ok(await calls.start({ ...input, package: divisionPackage(84, 4), grade: 4 }));
  const send = async (event: CallInput) => {
    guided = ok(await calls.input(guided.view.id, guided.view.revision, event, null));
    return guided.output.say.join(" ");
  };
  await send({ type: "child", text: "I don't know how to start." });
  const gap = await send({ type: "child", text: "I don't know." });
  expect(gap).toMatch(/8 tens and 4 ones.*share the tens/i);
  const shareTarget = guided.view.exchange!;
  expect(shareTarget).toMatchObject({ objectId: "division-share" });
  const shared = await send({ type: "exchange", target: shareTarget, fates: [{ batchId: shareTarget.batchId, fate: "shown" }] });
  expect(shared).toMatch(/2 tens in each group.*written division.*4 ones/i);
  expect(shared).not.toMatch(/bring down|\b21\b|twenty.one|\b1 one\b/i);
  const scene = applyAll(guided.view.batches);
  expect(boardTargets(scene).some((t) => t.target.objectId === "division-written" && t.target.part === "cell" && t.target.rowId === "quotient" && t.target.column === "tens" && t.value === "2")).toBe(true);
  expect(await send({ type: "child", text: "1 one.", fates: [{ batchId: guided.view.batches.at(-1)!.transactionId, fate: "shown" }] })).toMatch(/whole quotient/i);
  expect(await send({ type: "child", text: "21." })).toMatch(/you found the quotient/i);
  expect(await send({ type: "child", text: "No thanks." })).toMatch(/bye for now/i);
  expect(guided.view.outcome).toMatchObject({ reason: "solved", assistance: "guided" });
  expect(checkTrace(store.rows()[1].trace)).toMatchObject({ ok: true });
  expect(answer).not.toHaveBeenCalled();
});

it("96 ÷ 4: guides Share the tens then Exchange one ten, preserves value 96 on the board, explains written 16 ones without bring-down, and offers an exchange transfer", async () => {
  const { calls, answer, store, events } = setup();
  const pkg = divisionPackage(96, 4, parentId);
  let turn = ok(await calls.start({ ...input, package: pkg, grade: 4 }));
  const send = async (event: CallInput) => {
    turn = ok(await calls.input(turn.view.id, turn.view.revision, event, null));
    return turn.output.say.join(" ");
  };
  const prompt = await send({ type: "child", text: "How do I divide?" });
  expect(prompt).toMatch(/9 tens and 6 ones.*share the tens/i);
  const shareTarget = turn.view.exchange!;
  expect(shareTarget).toMatchObject({ objectId: "division-share" });
  // Step 1 child action: Share the tens -> 1 remaining ten highlighted + written bracket shows 2, 8, 1 (no bring2 yet)
  const afterShare = await send({ type: "exchange", target: shareTarget, fates: [{ batchId: shareTarget.batchId, fate: "shown" }] });
  expect(afterShare).toMatch(/2 tens in each group.*1 ten left over.*written division.*exchange one ten/i);
  expect(afterShare).not.toMatch(/bring down|\b24\b|twenty.four|\b4 ones\b/i);
  const midScene = applyAll(turn.view.batches);
  expect(boardTargets(midScene).find((t) => t.target.objectId === "exchange-before" && t.target.part === "whole")?.value).toBe("96");
  expect(boardTargets(midScene).find((t) => t.target.objectId === "division-written" && t.target.part === "row" && t.target.rowId === "bring2")?.value).toBeNull();
  const exchangeTarget = turn.view.exchange!;
  expect(exchangeTarget).toMatchObject({ objectId: "exchange-before" });
  // Duplicate submit of share target is idempotent
  const dupShare = ok(await calls.input(turn.view.id, turn.view.revision, { type: "exchange", target: shareTarget }, null));
  expect(dupShare.output.newBatches).toBe(0);
  // Step 2 child action: Exchange one ten -> 8 tens and 16 ones = still 96, and written bracket records 6 beside 1
  const afterExchange = await send({ type: "exchange", target: exchangeTarget, fates: [{ batchId: exchangeTarget.batchId, fate: "shown" }] });
  expect(afterExchange).toMatch(/8 tens and 16 ones.*still 96.*written division.*16 ones/i);
  expect(afterExchange).not.toMatch(/bring down|\b24\b|twenty.four|\b4 ones\b/i);
  expect(turn.view.exchange).toBeUndefined();
  const finalScene = applyAll(turn.view.batches);
  expect(boardTargets(finalScene).find((t) => t.target.objectId === "exchange-after" && t.target.part === "whole")?.value).toBe("96");
  expect(boardTargets(finalScene).find((t) => t.target.objectId === "exchange-after" && t.target.part === "piece" && t.target.piece === "ones")?.value).toBe("16");
  expect(boardTargets(finalScene).find((t) => t.target.objectId === "division-written" && t.target.part === "row" && t.target.rowId === "bring2")?.value).toBe("6");
  // Ones -> combine -> solved -> optional related exchange division (75 ÷ 3)
  expect(await send({ type: "child", text: "4 ones.", fates: [{ batchId: turn.view.batches.at(-1)!.transactionId, fate: "shown" }] })).toMatch(/whole quotient/i);
  expect(await send({ type: "child", text: "My answer is 24." })).toMatch(/you found the quotient.*one more like this/i);
  const related = await send({ type: "child", text: "Yes." });
  expect(related).toMatch(/75 divided by 3/i);
  expect(related).not.toMatch(/\b25\b|twenty.five/i);
  expect(await send({ type: "child", text: "I don't know." })).toMatch(/share 7 tens equally into 3 groups/i);
  expect(await send({ type: "child", text: "2 tens." })).toMatch(/1 ten left over/i);
  expect(await send({ type: "child", text: "Trade 1 ten for 10 ones." })).toMatch(/share 15 ones into 3 equal groups/i);
  expect(await send({ type: "child", text: "5 ones." })).toMatch(/whole quotient/i);
  expect(await send({ type: "child", text: "25." })).toMatch(/you found the quotient/i);
  expect(turn.view.outcome).toMatchObject({ reason: "solved", assistance: "guided", transfer: { result: "right", assistance: "hinted" } });
  await calls.input(turn.view.id, turn.view.revision, { type: "end" }, null);
  expect(checkTrace(store.rows()[0].trace)).toMatchObject({ ok: true });
  const [origEvent, transEvent] = byKey(await events.read(childId, { from: "2026-11-17T00:00:00Z", to: "2026-11-18T00:00:00Z" }));
  expect(origEvent).toMatchObject({ result: "right_with_help", stuckStep: "tens" });
  expect(transEvent).toMatchObject({ result: "right_with_help", assistance: "hinted", question: { source: "transfer", text: "75 ÷ 3 = ?" } });
  expect(answer).not.toHaveBeenCalled();
});

it.each([
  ["drop remainder ten with right quotient", "My answer is 24 because 6 divided by 4 is 4.", /cannot leave the remaining ten out.*16 ones/i],
  ["treat remaining ten as 1 one", "My answer is 24 because 1 plus 6 is 7.", /1 ten, not 1 one.*16 ones/i],
  ["subtract instead of divide", "My answer is 92.", /shares 96 into 4 equal groups/i],
])("96 ÷ 4: gives division misconception feedback for %s without crediting wrong reasoning", async (_label, childText, expectedFeedback) => {
  const { calls, store } = setup();
  const started = ok(await calls.start({ ...input, package: divisionPackage(96, 4) }));
  const reply = ok(await calls.input(started.view.id, started.view.revision, { type: "child", text: childText }, null));
  expect(reply.output.say.join(" ")).toMatch(expectedFeedback);
  expect(reply.output.say.join(" ")).not.toMatch(/bring down|\b24\b|twenty.four/i);
  const ended = ok(await calls.input(reply.view.id, reply.view.revision, { type: "end" }, null));
  expect(ended.view.outcome?.reason).toBe("child_stopped");
  expect(store.rows()[0].trace?.checkedExchange?.turns.some((t) => t.observation?.skill === "quotient")).toBe(false);
  expect(store.rows()[0].trace?.checkedExchange?.turns.some((t) => t.observation?.skill === "division_misconception")).toBe(true);
});

it("96 ÷ 4 in voice: staggers show/share/exchange cues, recovers interrupted demo and pending child exchange across worker replacement, and runs transfer in voice", async () => {
  const { calls, store, events } = setup();
  const pkg = divisionPackage(96, 4, parentId);
  const voice = ok(await calls.startVoice({ ...input, kind: "family", package: pkg }));
  const open = async () => {
    const opened = await calls.openVoice(voice.view.id, { speechToText: "fake", voice: "fake" }, null);
    if (!opened.ok) throw new Error(opened.error);
    return opened.call;
  };
  const observe = (board: Batch) => ({ kind: "batch" as const, batchId: board.transactionId, commands: [...board.commands] });

  // Part 1: Demo interruption cancels unshown share and exchange; replacement retries only cancelled batches in order
  const call = await open();
  await call.start();
  const demo = await call.child("Show me how to divide.");
  expect(demo.boardCues).toHaveLength(3);
  expect(demo.boardCues![0].word).toBeLessThan(demo.boardCues![1].word);
  expect(demo.boardCues![1].word).toBeLessThan(demo.boardCues![2].word);
  const [show, share, exchange] = demo.boardCues!.map((c) => c.batch);
  expect(share.after).toEqual([show.transactionId]);
  expect(exchange.after).toEqual([share.transactionId]);
  await call.observeBoard({ events: [observe(show), { kind: "cancelled", batchIds: [share.transactionId, exchange.transactionId] }] });
  await call.exchangePlayback!(demo.exchangeTurnId!, "interrupted");
  const resumed = await open();
  const retry = await resumed.child("Show me how to divide again.");
  expect(retry.boardCues).toHaveLength(2);
  expect(retry.boardCues![0].batch.after).toEqual([show.transactionId]);
  expect(retry.boardCues![1].batch.after).toEqual([retry.boardCues![0].batch.transactionId]);
  await resumed.exchangePlayback!(retry.exchangeTurnId!, "finished");
  expect((await resumed.child("My answer is 24.")).say.join(" ")).toMatch(/one more like this/i);
  const startedTransfer = await resumed.child("Yes.");
  expect(startedTransfer.say.join(" ")).toMatch(/75 divided by 3/i);
  const doneTransfer = await resumed.child("25.");
  expect(doneTransfer.ended).toBe(true);
  await resumed.end({ reason: "child_stopped" });
  expect(checkTrace(store.rows()[0].trace)).toMatchObject({ ok: true });
  expect(byKey(await events.read(childId, { from: "2026-11-17T00:00:00Z", to: "2026-11-18T00:00:00Z" }))).toMatchObject([
    { result: "right_with_help" },
    { result: "right", assistance: "independent", question: { source: "transfer", text: "75 ÷ 3 = ?" } },
  ]);

  // Part 2: Pending second child action (Exchange one ten) survives worker replacement
  const voice2 = ok(await calls.startVoice({ ...input, kind: "family", package: divisionPackage(96, 4) }));
  const open2 = async () => {
    const opened = await calls.openVoice(voice2.view.id, { speechToText: "fake", voice: "fake" }, null);
    if (!opened.ok) throw new Error(opened.error);
    return opened.call;
  };
  const c2 = await open2();
  await c2.start();
  const p = await c2.child("How do I divide?");
  const bShow = p.boardCues![0].batch;
  await c2.observeBoard({ events: [observe(bShow)] });
  const tShare = (await calls.view(voice2.view.id))!.exchange!;
  const rShare = (await c2.exchange!(tShare))!;
  const bShare = rShare.boardCues![0].batch;
  await c2.observeBoard({ events: [observe(bShow), observe(bShare)] });
  const tEx = (await calls.view(voice2.view.id))!.exchange!;
  expect(tEx).toMatchObject({ objectId: "exchange-before" });
  const rEx = (await c2.exchange!(tEx))!;
  const bEx = rEx.boardCues![0].batch;
  // Worker disconnects before bEx is confirmed on the screen
  const recovered = await open2();
  expect(recovered.pendingExchange).toEqual(bEx);
  await recovered.observeBoard({ events: [observe(bShow), observe(bShare), observe(bEx)] });
  expect(recovered.pendingExchange).toBeUndefined();
  await recovered.end({ reason: "child_stopped" });
  expect(checkTrace(store.rows()[1].trace)).toMatchObject({ ok: true });
});

it("uses a separate division example when showing the target would disclose the answer, and formats division transfer parent notes accurately", async () => {
  const { calls } = setup();
  // 30 ÷ 3 = 10: showing "1 ten" and "0 ones" would disclose 10, so Maya picks a separate example without disclosing 10.
  const pkg30 = divisionPackage(30, 3);
  const chat = ok(await calls.start({ ...input, package: pkg30 }));
  const turn = ok(await calls.input(chat.view.id, chat.view.revision, { type: "child", text: "Show me how to divide." }, null));
  expect(turn.output.say.join(" ")).toMatch(/separate example: 84/i);
  expect(turn.output.say.join(" ")).not.toMatch(/\b10\b|\bten\b(?=\s|$)/i);

  // Demonstrated division transfer note says "sharing steps", not "the trade"
  const pkg84 = divisionPackage(84, 4);
  let t = ok(await calls.start({ ...input, package: pkg84 }));
  const say = async (text: string) => {
    t = ok(await calls.input(t.view.id, t.view.revision, { type: "child", text }, null));
    return t.output.say.join(" ");
  };
  await say("My answer is 21.");
  await say("Yes.");
  expect(await say("Show me how to divide.")).toMatch(/6 tens shared into 3 equal groups/i);
  await say("3 ones.");
  await say("23.");
  const note = codeSentences(noteFacts({ outcome: t.view.outcome!, event: null, package: pkg84, question: pkg84.ref })).join(" ");
  expect(note).toContain("Then Maya showed the sharing steps again, and {child} got a related question right.");
});

it("96 ÷ 4: handles misconception after sharing without naming a missing button, withholds bad free-form claims, preserves interrupted help evidence, and answers identity during transfer", async () => {
  // 1. Misconception typed right after Share the tens (before fate arrives) still gives feedback and never names Share the tens button
  const { calls, store, events } = setup();
  let turn = ok(await calls.start({ ...input, package: divisionPackage(96, 4) }));
  turn = ok(await calls.input(turn.view.id, turn.view.revision, { type: "child", text: "How do I divide?" }, null));
  const shareTarget = turn.view.exchange!;
  turn = ok(await calls.input(turn.view.id, turn.view.revision, {
    type: "exchange", target: shareTarget, fates: [{ batchId: shareTarget.batchId, fate: "shown" }],
  }, null));
  const misc = ok(await calls.input(turn.view.id, turn.view.revision, { type: "child", text: "1 plus 6 is 7." }, null));
  expect(misc.output.say.join(" ")).toMatch(/1 ten, not 1 one.*16 ones/i);
  expect(misc.output.say.join(" ")).not.toMatch(/share the tens button/i);

  // 2. Bad free-form model answer on 96 ÷ 4 falls back to checked division demo without leaking 24
  const badModel = conversationalFake({ answer: () => reply("Trade 1 ten for 20 ones and write 24.", "guide"), stream: { chunk: 8 } });
  const { calls: guardedCalls } = setup({ model: () => badModel, mathReviewer: () => fakeMathReviewer(), streamChat: true });
  const gStart = ok(await guardedCalls.start({ ...input, package: divisionPackage(96, 4) }));
  const gReply = ok(await guardedCalls.input(gStart.view.id, gStart.view.revision, { type: "child", text: "I need help." }, null));
  expect(gReply.output.say.join(" ")).not.toMatch(/20 ones|\b24\b/i);
  expect(gReply.output.say.join(" ")).toMatch(/9 tens and 6 ones.*1 remaining ten for 10 ones/i);

  // 3. Interrupted voice demo on 96 ÷ 4 preserves uncertain help evidence and help_unconfirmed note
  const pkg96 = divisionPackage(96, 4, parentId);
  const voice = ok(await calls.startVoice({ ...input, kind: "family", package: pkg96 }));
  const opened = await calls.openVoice(voice.view.id, { speechToText: "fake", voice: "fake" }, null);
  if (!opened.ok) throw new Error(opened.error);
  await opened.call.start();
  const demo = await opened.call.child("Show me how to divide.");
  await opened.call.exchangePlayback!(demo.exchangeTurnId!, "interrupted");
  await opened.call.child("My answer is 24.");
  await opened.call.end({ reason: "child_stopped" });
  const rec = store.rows().find((r) => r.id === voice.view.id)!;
  expect(rec.trace?.checkedExchange?.turns.find((x) => x.observation?.skill === "quotient")?.observation)
    .toMatchObject({ result: "correct", assistance: "uncertain" });
  const learned = await events.read(childId, { from: "2026-11-17T00:00:00Z", to: "2026-11-18T00:00:00Z" });
  expect(learned).toMatchObject([{ result: "blank" }]);
  expect(noteFacts({ outcome: rec.outcome!, event: learned[0], package: pkg96, question: pkg96.ref }).finished).toBe("help_unconfirmed");

  // 4. Identity question during division transfer discloses AI and restates 69 ÷ 3 (not 84 ÷ 4)
  let idTurn = ok(await calls.start({ ...input, package: divisionPackage(84, 4) }));
  idTurn = ok(await calls.input(idTurn.view.id, idTurn.view.revision, { type: "child", text: "My answer is 21." }, null));
  idTurn = ok(await calls.input(idTurn.view.id, idTurn.view.revision, { type: "child", text: "Yes." }, null));
  const ai = ok(await calls.input(idTurn.view.id, idTurn.view.revision, { type: "child", text: "Are you a real person?" }, null));
  expect(ai.output.say.join(" ")).toMatch(/\bAI\b.*69\s*÷\s*3/);
  expect(ai.output.say.join(" ")).not.toMatch(/84/);
});
