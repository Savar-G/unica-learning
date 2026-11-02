import { describe, expect, it, vi } from "vitest";
import { boardPaths } from "@/lib/board";
import { boardScene, replayFrame } from "@/lib/board-history";
import { createBoardReceiver, createBoardSender } from "@/lib/board-protocol";
import { createMemoryTransport } from "@/lib/board-protocol-memory";
import { createBoardSpeech } from "@/lib/board-speech";
import { callReplay } from "@/lib/maya-call-review";
import { templateSkills } from "@/lib/assessment";
import { learningEvents } from "@/lib/learning-events";
import { memoryLearningEventStore } from "@/lib/learning-events-memory";
import { memoryWordingHistoryStore, TIME_LIMITS } from "@/lib/maya";
import { mayaCalls, recordView, boardHistoryOf, type CallResult, type CallSeams } from "@/lib/maya-call";
import { memoryCallStore, memoryConnectionLog } from "@/lib/maya-call-memory";
import { ruleMayaModel } from "@/lib/maya-model-fake";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { checkTrace } from "@/lib/maya-trace";
import type { QuestionPackage } from "@/lib/question-package";

// Maya's voice calls (#326) in the call module, through its public interface on the in-memory seams: the web server
// makes the call, the worker opens it, speaks with the child, stores the connection events, and ends it. What is
// stored: the transcript, the outcome with the signs of mishearing, the providers, and the connected seconds.

const PARENT = "11111111-1111-4111-8111-111111111111";
const CHILD = "22222222-2222-4222-8222-222222222222";
const TEST = "33333333-3333-4333-8333-333333333333";
const T0 = Date.UTC(2026, 10, 1, 16, 0, 0);
const PROVIDERS = { speechToText: "assemblyai/universal-3-6-pro", voice: "inworld/inworld-tts-2/Maya" };

const PKG: QuestionPackage = {
  ...SAMPLE_PACKAGES["add-27-39"],
  id: `${TEST}:s1-4`,
  ref: { source: "assessment", assessmentId: TEST, questionId: "s1-4" },
  templateId: "2-add-2-digit",
  skill: { standard: "2.4", skills: templateSkills("2-add-2-digit").map((k) => k.id) },
};

function setup() {
  let now = T0;
  let n = 0;
  const store = memoryCallStore({ testFamilies: [PARENT] });
  const connections = memoryConnectionLog(store, () => now);
  const eventStore = memoryLearningEventStore({ children: [{ id: CHILD, parentId: PARENT }], tests: [{ id: TEST, childId: CHILD }] });
  const rebuild = vi.fn(async () => true);
  const seams: CallSeams = {
    store,
    connections,
    // These calls raise no flag; the safety flag and its alert have their own tests (maya-call-safety.test.ts).
    alerts: { send: async () => {}, list: async () => [] },
    history: memoryWordingHistoryStore(),
    events: learningEvents(eventStore),
    rebuild,
    model: (id) => (id === null || id === "fake" ? ruleMayaModel() : null),
    isTestFamily: async (parentId) => parentId === PARENT,
    clock: () => now,
    newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
    seed: () => 42,
  };
  return { calls: mayaCalls(seams), seams, store, connections, eventStore, rebuild, advance: (s: number) => (now += s * 1000), now: () => now };
}

const ok = (r: CallResult) => {
  if (!r.ok) throw new Error(`refused: ${r.error}`);
  return r;
};

async function newVoiceCall(s: ReturnType<typeof setup>) {
  return ok(await s.calls.startVoice({ kind: "admin_test", parentId: PARENT, childId: CHILD, childName: "Leah", package: PKG, startedBy: "admin-1" })).view;
}

async function open(s: ReturnType<typeof setup>, id: string) {
  const r = await s.calls.openVoice(id, PROVIDERS, "Leah");
  if (!r.ok) throw new Error(r.error);
  return r.call;
}

describe("a voice call", () => {
  it("is made live and not started, and takes no typed turns while the worker holds it", async () => {
    const s = setup();
    const view = await newVoiceCall(s);
    expect(view).toMatchObject({ mode: "voice", status: "live", startedAt: null, transcript: [], voice: { speechToText: null, voice: null, connectedSeconds: null } });
    expect(await s.calls.input(view.id, view.revision, { type: "child", text: "66" }, "Leah")).toEqual({ ok: false, error: "voice_call" });
  });

  it("runs a whole call in the worker and stores it with its connected time and signs of mishearing", async () => {
    const s = setup();
    const view = await newVoiceCall(s);
    const call = await open(s, view.id);
    await call.connection("agent_joined");
    s.advance(2);
    await call.connection("child_joined");
    const opening = await call.start();
    expect(opening.say.join(" ")).toMatch(/\bAI\b/);
    await call.connection("agent_joined");
    s.advance(6);
    // A number the speech-to-text was unsure of: Maya confirms it.
    const unsure = await call.child("I got sixty-six", { uncertain: true, alternatives: ["sixteen"] });
    expect(unsure.say.length).toBeGreaterThan(0);
    await call.connection("agent_joined");
    s.advance(6);
    // The child corrects what Maya heard.
    await call.child("No, I said 66.");
    for (const text of ["Because the ones made a ten, so I carried it.", "I wrote it."]) {
      if (call.ended) break;
      await call.connection("agent_joined");
      s.advance(6);
      await call.child(text);
    }
    await call.settled();
    // While live, the record is saved after each turn: the admin screen reads the same transcript.
    const live = await s.calls.view(view.id);
    expect(live?.transcript.some((l) => l.speaker === "child" && l.text === "No, I said 66.")).toBe(true);
    s.advance(4);
    const leftAt = s.now();
    await call.connection("child_left");
    s.advance(1);
    await call.end({ reason: "child_stopped" });

    const [row] = s.store.rows();
    expect(row).toMatchObject({ mode: "voice", status: "ended", ...PROVIDERS, live: null });
    // Room time includes the final speech after the controller selects the solved outcome.
    expect(row.outcome?.reason).toBe("solved");
    expect(row.connectedSeconds).toBe(Math.round((leftAt - (T0 + 2000)) / 1000));
    expect(row.connectedSeconds).toBeGreaterThan(20);
    expect(row.outcome?.mishearing.corrections).toBe(1);
    expect(row.outcome?.mishearing.confirmations).toBeGreaterThanOrEqual(1);
    expect(checkTrace(row.trace).ok).toBe(true);
    expect(row.learningEventId).not.toBeNull();
    expect(s.rebuild).toHaveBeenCalledTimes(1);
    expect(s.connections.rows().filter((c, i) => c.kind !== "agent_joined" || i === 0).map((c) => c.kind)).toEqual(["agent_joined", "child_joined", "child_left"]);
    expect(s.connections.rows().every((c) => c.callId === view.id && c.parentId === PARENT && c.childId === CHILD)).toBe(true);

    const ended = await s.calls.view(view.id);
    expect(ended?.voice).toEqual({ ...PROVIDERS, connectedSeconds: row.connectedSeconds });
    // Ending again changes nothing.
    await call.end({ reason: "child_stopped" });
    expect(s.store.rows()[0].revision).toBe(row.revision);
  });

  it("ends as a hang-up when the child hangs up, and stores the turns so far", async () => {
    const s = setup();
    const call = await open(s, (await newVoiceCall(s)).id);
    await call.connection("agent_joined");
    await call.connection("child_joined");
    await call.start();
    s.advance(5);
    await call.child("Is it 56?");
    s.advance(5);
    await call.end({ reason: "child_stopped" });
    const [row] = s.store.rows();
    expect(row.outcome?.reason).toBe("child_stopped");
    expect(row.connectedSeconds).toBe(10);
    expect(row.trace?.turns.at(-1)?.kind).toBe("hang_up");
  });

  it("ends itself at the time limit from a tick", async () => {
    const s = setup();
    const call = await open(s, (await newVoiceCall(s)).id);
    await call.connection("agent_joined");
    await call.connection("child_joined");
    await call.start();
    for (let i = 0; i < TIME_LIMITS.endAtMs / 5000; i++) { s.advance(5); await call.connection("agent_joined"); }
    const last = await call.tick();
    expect(last.ended).toBe(true);
    await call.end({ reason: "child_stopped" });
    const [row] = s.store.rows();
    expect(row.outcome?.reason).toBe("time_limit");
    expect(row.connectedSeconds).toBe(TIME_LIMITS.endAtMs / 1000);
  });

  it("is opened by one worker only: a second open stops the first from writing", async () => {
    const s = setup();
    const id = (await newVoiceCall(s)).id;
    const first = await open(s, id);
    await first.start();
    await first.settled();
    const second = await open(s, id);
    s.advance(5);
    await first.child("66");
    await first.settled();
    expect(first.lost).toBe(true);
    expect((await first.child("66")).say).toEqual([]);
    s.advance(5);
    const turn = await second.child("66");
    expect(turn.say.length).toBeGreaterThan(0);
    await second.settled();
    expect(second.lost).toBe(false);
  });

  it("refuses to open a text call, an ended call, or an unknown call", async () => {
    const s = setup();
    const text = ok(await s.calls.start({ kind: "admin_test", parentId: PARENT, childId: CHILD, childName: "Leah", package: PKG, startedBy: null })).view;
    expect(await s.calls.openVoice(text.id, PROVIDERS, null)).toEqual({ ok: false, error: "not_voice" });
    expect(await s.calls.openVoice("00000000-0000-4000-8000-999999999999", PROVIDERS, null)).toEqual({ ok: false, error: "not_found" });
    const voice = await newVoiceCall(s);
    const call = await open(s, voice.id);
    await call.start();
    await call.end({ reason: "child_stopped" });
    expect(await s.calls.openVoice(voice.id, PROVIDERS, null)).toEqual({ ok: false, error: "ended" });
  });

  it("can be ended by the admin when Maya never joined, or when it cannot still be running", async () => {
    const s = setup();
    const never = await newVoiceCall(s);
    const r = ok(await s.calls.input(never.id, never.revision, { type: "end" }, "Leah"));
    expect(r.view).toMatchObject({ status: "ended", outcome: { reason: "technical_issue" }, learningEventId: null, voice: { connectedSeconds: 0 } });
    expect(s.store.rows().find((row) => row.id === never.id)?.live).toBeNull();

    const stuck = await newVoiceCall(s);
    const call = await open(s, stuck.id);
    await call.start();
    await call.settled();
    const current = (await s.calls.view(stuck.id))!;
    expect(await s.calls.input(stuck.id, current.revision, { type: "end" }, "Leah")).toEqual({ ok: false, error: "voice_call" });
    s.advance(TIME_LIMITS.endAtMs / 1000 + 61);
    const ended = ok(await s.calls.input(stuck.id, current.revision, { type: "end" }, "Leah"));
    expect(ended.view).toMatchObject({ status: "ended", outcome: { reason: "time_limit" } });
  });
});


describe("R408 recovery and privacy", () => {
  it("R408-3: keeps cancellation event-free after the live-state clear fails", async () => {
    const s = setup();
    const view = await newVoiceCall(s);
    const update = s.store.update.bind(s.store);
    let fail = true;
    s.store.update = async (id, revision, change) => {
      if (fail && change.live === null) { fail = false; throw new Error("clear failed"); }
      return update(id, revision, change);
    };
    await expect(s.calls.input(view.id, view.revision, { type: "end" }, "Leah")).rejects.toThrow("clear failed");
    const saved = (await s.calls.view(view.id))!;
    const retried = ok(await s.calls.input(view.id, saved.revision, { type: "end" }, "Leah"));
    expect(retried.view.learningEventId).toBeNull();
    expect(s.store.rows()[0].live).toBeNull();
    expect(s.rebuild).not.toHaveBeenCalled();
  });

  it("R408-5: excludes the child's name from every saved voice session and opening", async () => {
    const s = setup();
    s.seams.seed = () => 1;
    const view = await newVoiceCall(s);
    expect(JSON.stringify(s.store.rows()[0].live)).not.toContain("Leah");
    const call = await open(s, view.id);
    expect((await call.start()).say.join(" ")).not.toContain("Leah");
    await call.settled();
    expect(JSON.stringify(s.store.rows()[0].live)).not.toContain("Leah");
  });

  it("R408-5: removes personalization when an older saved voice call is opened", async () => {
    const s = setup();
    const view = await newVoiceCall(s);
    const row = s.store.rows()[0];
    row.live!.text.session.variety.name = "Leah";
    await s.store.update(row.id, row.revision, { live: row.live });
    const call = await open(s, view.id);
    expect(s.store.rows()[0].live?.text.session.variety.name).toBeNull();
    expect((await call.start()).say.join(" ")).not.toContain("Leah");
  });

  it("R408-7 R408-11: refuses connection renewals and leave events from a replaced worker", async () => {
    const s = setup();
    const view = await newVoiceCall(s);
    const first = await open(s, view.id);
    await first.connection("agent_joined");
    await first.connection("child_joined");
    const second = await open(s, view.id);
    const count = s.connections.rows().length;
    await first.connection("agent_joined");
    expect(first.lost).toBe(true);
    await first.connection("agent_left");
    expect(s.connections.rows()).toHaveLength(count);
    await second.connection("agent_left");
    await second.connection("agent_joined");
    await second.connection("child_joined");
    expect(second.lost).toBe(false);
  });
});


it.each([false, true])("R450-3 voice replay follows the receiver after cancellation, shown prefix %s", async shownPrefix => {
  const s = setup();
  const view = await newVoiceCall(s);
  const call = await open(s, view.id);
  await call.start();
  const turn = await call.child("I don't know.");
  expect(turn.newBatches).toBeGreaterThan(1);
  const receiver = createBoardReceiver({ sessionId: call.id, clock: s.now });
  const sender = createBoardSender({ sessionId: call.id, senderId: "worker", transport: createMemoryTransport(receiver) });
  const board = createBoardSpeech({ sender, now: s.now, observe: snapshot => call.observeBoard(snapshot) });
  await board.reconnect();
  await board.stage("speech", turn.boardCues!);
  s.advance(2);
  if (shownPrefix) {
    const cue = turn.boardCues![0];
    await board.timing("speech", cue.word, 100, "word");
    await board.played("speech", 100);
    s.advance(1);
  }
  await board.interrupt();
  await board.settled();
  const observed = receiver.snapshot();
  expect(call.boardSnapshot).toEqual(observed);
  // A replacement worker starts with the durable observed snapshot, without accepted but unshown plans.
  const replacement = await open(s, view.id);
  expect(replacement.boardSnapshot).toEqual(observed);
  await replacement.end({ reason: "child_stopped" });
  const saved = (await s.calls.view(view.id))!;
  expect(boardPaths(boardScene(saved.boardHistory))).toEqual(boardPaths(receiver.scene()));
  expect(replayFrame(callReplay(saved), Infinity).maya.map(s => s.path.id)).toEqual(boardPaths(receiver.scene()).map(p => p.id));
  expect(saved.batches).toHaveLength(shownPrefix ? 1 : 0);
  expect(saved.boardHistory.delivery?.events).toEqual(observed.events);
  expect(s.store.rows()[0].trace!.board.length).toBe(turn.newBatches);
  const cancelled = observed.events.find(e => e.kind === "cancelled");
  expect(cancelled?.at).toBe(s.now());
  if (shownPrefix) expect(saved.boardHistory.events[0]).toMatchObject({ kind: "maya", t: 2000 });
});


it("R450-3 does not reconstruct a legacy voice board from unobserved teaching plans", async () => {
  const s = setup();
  const view = await newVoiceCall(s);
  const call = await open(s, view.id);
  await call.start();
  await call.child("I don't know.");
  await call.end({ reason: "child_stopped" });
  const row = s.store.rows()[0];
  expect(row.trace!.board.length).toBeGreaterThan(0);
  const legacy = recordView({ ...row, boardHistory: boardHistoryOf(row.trace!) })!;
  expect(legacy.batches).toEqual([]);
  expect(callReplay(legacy).maya.strokes).toEqual([]);
});
