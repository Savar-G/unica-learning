import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { learningEvents } from "@/lib/learning-events";
import { memoryLearningEventStore } from "@/lib/learning-events-memory";
import { memoryWordingHistoryStore } from "@/lib/maya";
import { mayaCalls, type CallResult, type CallSeams, type StartInput } from "@/lib/maya-call";
import { memoryCallStore, memoryConnectionLog } from "@/lib/maya-call-memory";
import { conversationalFake, reply } from "@/lib/maya-model-fake";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { checkTrace } from "@/lib/maya-trace";
import { fakeTalkReviewer } from "@/lib/maya-talk-review";
import type { SelectionTarget } from "@/lib/maya/board-selection";

vi.mock("server-only", () => ({}));
beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

const parentId = "11111111-1111-4111-8111-111111111111";
const childId = "22222222-2222-4222-8222-222222222222";
const clock = () => Date.UTC(2026, 10, 20, 18);
const input: StartInput = {
  kind: "chat", parentId, childId, childName: null, startedBy: parentId,
  package: SAMPLE_PACKAGES["subtract-52-28"],
};

function setup(overrides: Partial<CallSeams> = {}) {
  let id = 0;
  const store = memoryCallStore({ clock, testFamilies: [parentId] });
  const answer = vi.fn(() => reply("Start with the ones.", "guide"));
  const seams: CallSeams = {
    checkedExchange: true, tutorFamilies: true,
    store, connections: memoryConnectionLog(store, clock), history: memoryWordingHistoryStore(),
    events: learningEvents(memoryLearningEventStore({ children: [{ id: childId, parentId }] })),
    rebuild: async () => true, model: () => conversationalFake({ answer }),
    reviewer: () => fakeTalkReviewer(), isTestFamily: async () => true, canChat: async () => true, canCallVoice: async () => true,
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

let taps = 0;
const tap = () => `33333333-3333-4333-8333-${String(++taps).padStart(12, "0")}`;

/** A chat whose board shows the blocks for 52, confirmed by the child's screen. */
async function shownBlocks() {
  const setupResult = setup();
  const { calls } = setupResult;
  const chat = ok(await calls.start(input));
  const prompt = ok(await calls.input(chat.view.id, chat.view.revision, { type: "child", text: "How do I regroup?" }, null));
  const show = prompt.view.batches.at(-1)!;
  const fates = prompt.view.batches.map((b) => ({ batchId: b.transactionId, fate: "shown" as const }));
  const offer = prompt.view.selection!;
  const target = (objectId: string, batchId = show.transactionId): SelectionTarget => ({ ...offer, objectId, batchId, selectionId: tap() });
  return { ...setupResult, chat, prompt, show, fates, offer, target };
}

it("answers in checked words about the object the child points to and shows it as selected", async () => {
  const { calls, answer, prompt, fates, offer, target, store } = await shownBlocks();
  expect(offer).toEqual({ lessonId: expect.any(String), turnId: expect.any(String), boardRevision: expect.any(Number), question: "52 - 28 = ?" });
  const picked = target("exchange-before");
  const result = ok(await calls.input(prompt.view.id, prompt.view.revision, { type: "select", target: picked, fates }, null));
  expect(result.output.say.join(" ")).toBe(
    "You pointed to the blocks. Each long block is one ten and each small square is one. " +
    "They show 5 tens and 2 ones, which is 52. What about it is confusing?",
  );
  expect(result.output.newBatches).toBe(0);
  expect(result.view.selected).toEqual({ objectId: "exchange-before", batchId: picked.batchId, boardRevision: offer.boardRevision });
  expect(answer).not.toHaveBeenCalled();
  const ended = ok(await calls.input(prompt.view.id, result.view.revision, { type: "end" }, null));
  expect(checkTrace(store.rows()[0].trace)).toMatchObject({ ok: true });
  expect(ended.view.outcome?.reason).not.toBe("solved");
});

it("asks which part the child means when the object was removed or the board moved on, and answers a retried tap once", async () => {
  const { calls, answer, prompt, fates, offer, target } = await shownBlocks();
  const blocks = target("exchange-before");
  const first = ok(await calls.input(prompt.view.id, prompt.view.revision, { type: "select", target: blocks, fates }, null));
  const retry = ok(await calls.input(prompt.view.id, prompt.view.revision, { type: "select", target: blocks, fates }, null));
  expect(retry.output.say).toEqual([]);
  expect(retry.view.revision).toBe(first.view.revision);

  // The child trades the ten: the blocks for 52 are gone from the board.
  const exchanged = ok(await calls.input(prompt.view.id, first.view.revision, { type: "exchange", target: first.view.exchange!, fates }, null));
  const removed = ok(await calls.input(prompt.view.id, exchanged.view.revision, { type: "select", target: target("exchange-before") }, null));
  expect(removed.output.say.join(" ")).toBe("That part is not on the board now. Point to something on the board, or tell me which part you mean.");
  expect(removed.view.selected).toBeUndefined();

  const after = exchanged.view.batches.at(-1)!.transactionId;
  const shownAfter = [{ batchId: after, fate: "shown" as const }];
  const current = { ...removed.view.selection!, objectId: "exchange-after", batchId: after, selectionId: tap() };
  const now = ok(await calls.input(prompt.view.id, removed.view.revision, { type: "select", target: current, fates: shownAfter }, null));
  expect(now.output.say.join(" ")).toContain("They show 4 tens and 12 ones, which is 52.");

  // A tap from a screen that still shows an earlier turn: the object is there, but Maya has spoken since.
  const old = { ...offer, objectId: "exchange-after", batchId: after, selectionId: tap() };
  const changed = ok(await calls.input(prompt.view.id, now.view.revision, { type: "select", target: old }, null));
  expect(changed.output.say.join(" ")).toBe("The board changed after you pointed. Point to the part again, or tell me which part you mean.");

  const foreign = { ...current, lessonId: "another-call:regrouping", selectionId: tap() };
  expect(await calls.input(prompt.view.id, changed.view.revision, { type: "select", target: foreign }, null)).toEqual({ ok: false, error: "conflict" });
  expect(answer).not.toHaveBeenCalled();
});

it("gives no credit for a tap and tells the tutor what the child pointed to for the next words", async () => {
  const control = await shownBlocks();
  const controlEnd = ok(await control.calls.input(control.prompt.view.id, control.prompt.view.revision, { type: "end" }, null));

  const { calls, answer, prompt, fates, target } = await shownBlocks();
  const picked = ok(await calls.input(prompt.view.id, prompt.view.revision, { type: "select", target: target("exchange-before"), fates }, null));
  const asked = ok(await calls.input(prompt.view.id, picked.view.revision, { type: "child", text: "Why are some of them long?" }, null));
  expect(answer).toHaveBeenCalled();
  const brief = (answer.mock.calls[0] as unknown[])[0] as { notes: string[] };
  expect(brief.notes).toContainEqual(expect.stringContaining("The child pointed to the blocks on the board (5 tens and 2 ones, which is 52)"));
  const ended = ok(await calls.input(prompt.view.id, asked.view.revision, { type: "end" }, null));
  for (const field of ["assistance", "highestHint", "reason"] as const) {
    expect(ended.view.outcome?.[field]).toEqual(controlEnd.view.outcome?.[field]);
  }
});

it("names the written work and the notation from the commands that drew them", async () => {
  const { calls, prompt, fates, target } = await shownBlocks();
  const question = prompt.view.batches[0].transactionId;
  const columns = ok(await calls.input(prompt.view.id, prompt.view.revision, { type: "select", target: target("question", question), fates }, null));
  expect(columns.output.say.join(" ")).toBe("You pointed to the column work. It shows 52 minus 28, with each place in its own column. What about it is confusing?");
  const notation = ok(await calls.input(prompt.view.id, columns.view.revision, { type: "select", target: { ...columns.view.selection!, objectId: "exchange-before-notation", batchId: prompt.view.batches[1].transactionId, selectionId: tap() } }, null));
  expect(notation.output.say.join(" ")).toBe("You pointed to the writing. It says 52 equals 50 plus 2. What about it is confusing?");
  // The batch must be the one that drew the object.
  const wrongBatch = ok(await calls.input(prompt.view.id, notation.view.revision, { type: "select", target: { ...notation.view.selection!, objectId: "question", batchId: prompt.view.batches[1].transactionId, selectionId: tap() } }, null));
  expect(wrongBatch.output.say[0]).toMatch(/^That part is not on the board now/);
});

it("answers the same tap in voice with the same words, once, and only for objects the screen showed", async () => {
  const { calls, answer } = setup();
  const started = ok(await calls.startVoice({ ...input, kind: "family" }));
  const opened = await calls.openVoice(started.view.id, { speechToText: "fake", voice: "fake" }, null);
  if (!opened.ok) throw Error(opened.error);
  const call = opened.call;
  const first = (await call.start()).boardCues![0].batch;
  const show = (await call.child("How do I regroup?")).boardCues![0].batch;
  const view = (await calls.view(started.view.id))!;
  const picked: SelectionTarget = { ...view.selection!, objectId: "exchange-before", batchId: show.transactionId, selectionId: tap() };
  // Not yet drawn on the child's screen: Maya asks which part they mean rather than guess.
  const early = await call.select!(picked);
  expect(early!.say.join(" ")).toMatch(/^That part is not on the board now/);
  const again = { ...(await calls.view(started.view.id))!.selection!, objectId: "exchange-before", batchId: show.transactionId, selectionId: tap() };
  await call.observeBoard({ events: [first, show].map((b) => ({ kind: "batch" as const, batchId: b.transactionId, commands: [...b.commands] })) });
  let accepted = 0;
  const said = await call.select!(again, () => { accepted++; });
  expect(said!.say.join(" ")).toBe(
    "You pointed to the blocks. Each long block is one ten and each small square is one. " +
    "They show 5 tens and 2 ones, which is 52. What about it is confusing?",
  );
  expect(said!.boardCues ?? []).toEqual([]);
  expect(accepted).toBe(1);
  expect(await call.select!(again)).toBeNull();
  await call.settled();
  expect((await calls.view(started.view.id))!.selected).toMatchObject({ objectId: "exchange-before" });
  expect(answer).not.toHaveBeenCalled();
});

it("lets Maya finish when a tap is stale, and asks to point again once for repeated stale taps", async () => {
  const { calls, answer, prompt, fates, offer, target, show } = await shownBlocks();
  const exchanged = ok(await calls.input(prompt.view.id, prompt.view.revision, { type: "exchange", target: prompt.view.exchange!, fates }, null));
  const pointAgain = (say: string[]) => say.filter((line) => line.startsWith("That part is not on the board now")).length;
  const stale = ok(await calls.input(prompt.view.id, exchanged.view.revision, { type: "select", target: target("exchange-before") }, null));
  expect(pointAgain(stale.output.say)).toBe(1);
  // The child taps the old blocks again: Maya has already asked, so she says nothing new.
  const again = ok(await calls.input(prompt.view.id, stale.view.revision, { type: "select", target: { ...offer, objectId: "exchange-before", batchId: show.transactionId, selectionId: tap() } }, null));
  expect(again.output.say).toEqual([]);
  expect(again.view.transcript.filter((t) => t.speaker === "maya" && t.text.startsWith("That part is not on the board now"))).toHaveLength(1);
  expect(again.view.transcript.some((t) => t.speaker === "maya" && t.text.includes("4 tens and 12 ones"))).toBe(true);
  // A tap on a current object is still answered.
  const after = exchanged.view.batches.at(-1)!.transactionId;
  const current = ok(await calls.input(prompt.view.id, again.view.revision, { type: "select", target: { ...again.view.selection!, objectId: "exchange-after", batchId: after, selectionId: tap() }, fates: [{ batchId: after, fate: "shown" }] }, null));
  expect(current.output.say.join(" ")).toContain("They show 4 tens and 12 ones");
  expect(answer).not.toHaveBeenCalled();
});

it("tells the voice worker to stop Maya only for a tap on a current object", async () => {
  const { calls } = setup();
  const started = ok(await calls.startVoice({ ...input, kind: "family" }));
  const opened = await calls.openVoice(started.view.id, { speechToText: "fake", voice: "fake" }, null);
  if (!opened.ok) throw Error(opened.error);
  const call = opened.call;
  const first = (await call.start()).boardCues![0].batch;
  const show = (await call.child("How do I regroup?")).boardCues![0].batch;
  await call.observeBoard({ events: [first, show].map((b) => ({ kind: "batch" as const, batchId: b.transactionId, commands: [...b.commands] })) });
  const offer = (await calls.view(started.view.id))!.selection!;
  const stops: boolean[] = [];
  const blocks = { ...offer, objectId: "exchange-before", batchId: show.transactionId };
  expect((await call.select!({ ...blocks, selectionId: tap() }, (stop) => { stops.push(stop); }))!.say[0]).toMatch(/^You pointed to the blocks/);
  const stale = await call.select!({ ...blocks, selectionId: tap() }, (stop) => { stops.push(stop); });
  expect(stale!.say[0]).toMatch(/^The board changed after you pointed/);
  expect((await call.select!({ ...blocks, selectionId: tap() }, (stop) => { stops.push(stop); }))!.say).toEqual([]);
  expect(stops).toEqual([true, false]);
  expect(call.session.boardSelections?.map((s) => s.result)).toEqual(["answer", "changed"]);
});

it("answers each tap once for the whole call, even after more than twenty newer taps", async () => {
  const { calls } = setup();
  const started = ok(await calls.startVoice({ ...input, kind: "family" }));
  const opened = await calls.openVoice(started.view.id, { speechToText: "fake", voice: "fake" }, null);
  if (!opened.ok) throw Error(opened.error);
  const call = opened.call;
  const first = (await call.start()).boardCues![0].batch;
  const show = (await call.child("How do I regroup?")).boardCues![0].batch;
  await call.observeBoard({ events: [first, show].map((b) => ({ kind: "batch" as const, batchId: b.transactionId, commands: [...b.commands] })) });
  const tapOn = async () => ({ ...(await calls.view(started.view.id))!.selection!, objectId: "exchange-before", batchId: show.transactionId, selectionId: tap() });
  const original = await tapOn();
  expect((await call.select!(original))!.say[0]).toMatch(/^You pointed to the blocks/);
  for (let i = 0; i < 21; i++) expect((await call.select!(await tapOn()))!.say[0]).toMatch(/^You pointed to the blocks/);
  // The original request arrives again, late: Maya does not answer it a second time.
  expect(await call.select!(original)).toBeNull();
});

it("keeps the child's name out of the saved trace when it is in a tap's request fields", async () => {
  const { calls, store } = setup();
  const chat = ok(await calls.start({ ...input, childName: "Zebulon" }));
  const prompt = ok(await calls.input(chat.view.id, chat.view.revision, { type: "child", text: "How do I regroup?" }, "Zebulon"));
  const fates = prompt.view.batches.map((b) => ({ batchId: b.transactionId, fate: "shown" as const }));
  const picked = { ...prompt.view.selection!, objectId: "exchange-before", batchId: prompt.view.batches.at(-1)!.transactionId, selectionId: "Zebulon-tap-1" };
  const answered = ok(await calls.input(chat.view.id, prompt.view.revision, { type: "select", target: picked, fates }, "Zebulon"));
  expect(answered.output.say[0]).toMatch(/^You pointed to the blocks\./);
  ok(await calls.input(chat.view.id, answered.view.revision, { type: "end" }, "Zebulon"));
  const trace = store.rows()[0].trace!;
  expect(JSON.stringify(trace)).not.toContain("Zebulon");
  expect(checkTrace(trace)).toMatchObject({ ok: true });
  expect(JSON.stringify(trace)).toContain("They show 5 tens and 2 ones, which is 52.");
});

it("tells a tap sent at an old call revision that the board changed, without applying it", async () => {
  const { calls, prompt, fates, target } = await shownBlocks();
  const moved = ok(await calls.input(prompt.view.id, prompt.view.revision, { type: "child", text: "How do I regroup?", fates }, null));
  expect(await calls.input(prompt.view.id, prompt.view.revision, { type: "select", target: target("exchange-before") }, null))
    .toEqual({ ok: false, error: "board_changed" });
  expect((await calls.view(prompt.view.id))!.revision).toBe(moved.view.revision);
  // Other inputs keep the plain conflict.
  expect(await calls.input(prompt.view.id, prompt.view.revision, { type: "child", text: "Hi" }, null)).toEqual({ ok: false, error: "conflict" });
});
