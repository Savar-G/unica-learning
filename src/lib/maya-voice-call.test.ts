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
import { limitsOf, memoryWordingHistoryStore, TIME_LIMITS } from "@/lib/maya";
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
  it("says how long a child's input spent on the model, and keeps the acknowledgements said across a new worker (#532)", async () => {
    const s = setup();
    const rule = ruleMayaModel();
    let asked = 0;
    s.seams.model = () => ({ ...rule, propose: async (input, signal) => { asked++; s.advance(2); return rule.propose(input, signal); } });
    const view = await newVoiceCall(s);
    const call = await open(s, view.id);
    await call.start();
    expect(call.acknowledged).toEqual([]);
    expect(await call.acknowledge("ack.see.plain")).toBe(true);
    expect(await call.acknowledge("ack.see.plain")).toBe(true);
    expect(call.acknowledged).toEqual(["ack.see.plain"]);
    asked = 0;
    const turn = await call.child("I got 56.");
    // The rule player's proposal can be refused, so a repair can run: each call is counted once, in its own place.
    expect(asked).toBeGreaterThan(0);
    expect(turn.time!.modelMs).toBeGreaterThanOrEqual(2000);
    expect(turn.time!.modelMs + turn.time!.repairMs).toBe(asked * 2000);
    expect(turn.time!.reviewMs).toBe(0);
    await call.settled();
    const next = await open(s, view.id);
    expect(next.acknowledged).toEqual(["ack.see.plain"]);
    // The transcript holds only what the session accepted.
    expect((await s.calls.view(view.id))!.transcript.map((l) => l.text).join(" ")).not.toContain("Let me see.");
  });

  it("#589: a solved child's reply that crosses the closing time keeps its priority, though it ends as solved", async () => {
    const s = setup();
    const rule = ruleMayaModel();
    let close = false;
    s.seams.model = () => ({ ...rule, propose: async (input, signal) => (close ? { version: 2, act: "close", parts: [{ warm: "closing" }] } : rule.propose(input, signal)) });
    const view = ok(await s.calls.startVoice({ kind: "admin_test", parentId: PARENT, childId: CHILD, childName: "Leah", package: PKG, startedBy: "admin-1", limitMs: 70_000 })).view;
    const call = await open(s, view.id);
    await call.start();
    const solved = await call.child("I got 66.");
    expect(call.session.solved).not.toBeNull();
    expect(solved.priority).toBe(false);
    close = true;
    // Not past the closing time: an ordinary close, which may wait for a phrase.
    s.advance(5);
    const before = await open(s, view.id);
    expect((await before.child("I wrote it.")).priority).toBe(false);
    const again = setup();
    again.seams.model = s.seams.model;
    close = false;
    const later = ok(await again.calls.startVoice({ kind: "admin_test", parentId: PARENT, childId: CHILD, childName: "Leah", package: PKG, startedBy: "admin-1", limitMs: 70_000 })).view;
    const crossing = await open(again, later.id);
    await crossing.start();
    await crossing.child("I got 66.");
    close = true;
    again.advance(11);
    const turn = await crossing.child("I wrote it.");
    expect(turn.ended).toBe(true);
    expect(crossing.session.outcome?.reason).toBe("solved");
    expect(turn.priority).toBe(true);
  });

  it("saves an acknowledgement before it is said, with no half-done turn, and a replaced worker cannot save one (R577-3)", async () => {
    const s = setup();
    const rule = ruleMayaModel();
    let release = () => {};
    let hold = false;
    let asked = 0;
    s.seams.model = () => ({ ...rule, propose: async (input, signal) => {
      asked++;
      if (hold) await new Promise<void>((r) => { release = r; });
      return rule.propose(input, signal);
    } });
    const view = await newVoiceCall(s);
    const call = await open(s, view.id);
    await call.start();
    await call.settled();
    const saved = () => s.store.rows()[0];
    const before = { revision: saved().revision, text: JSON.stringify(saved().live!.text) };
    // The model is still working: the phrase's save holds the last saved session, not the turn in progress.
    hold = true;
    const seen = asked;
    const turn = call.child("I got 56.");
    await vi.waitFor(() => expect(asked).toBeGreaterThan(seen));
    expect(await call.acknowledge("ack.see.plain")).toBe(true);
    expect(saved().revision).toBe(before.revision + 1);
    expect(saved().live!.acknowledged).toEqual(["ack.see.plain"]);
    expect(JSON.stringify(saved().live!.text)).toBe(before.text);
    // A second worker reads it at once. The first can then save nothing, and is told so.
    const next = await open(s, view.id);
    expect(next.acknowledged).toEqual(["ack.see.plain"]);
    expect(await call.acknowledge("ack.see.here")).toBe(false);
    expect(call.replaced).toBe(true);
    expect(next.acknowledged).toEqual(["ack.see.plain"]);
    expect(saved().live!.acknowledged).toEqual(["ack.see.plain"]);
    hold = false;
    release();
    await turn;
  });

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
  await board.connect();
  await board.stage("speech", turn.boardCues!);
  const scope = board.capture("speech")!;
  s.advance(2);
  if (shownPrefix) {
    const cue = turn.boardCues![0];
    await board.timing(scope, cue.word, 100, "word");
    await board.played(scope, 100);
    s.advance(1);
  }
  await board.interrupt(scope);
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


it.each(["saved", "trace", "empty delivery"] as const)("R450-6 preserves the history contract for %s", async source => {
  const s = setup();
  const view = await newVoiceCall(s);
  const call = await open(s, view.id);
  await call.start();
  await call.child("I don't know.");
  await call.end({ reason: "child_stopped" });
  const row = s.store.rows()[0];
  const history = boardHistoryOf(row.trace!);
  const expected = callReplay({ boardHistory: history, transcript: [], outcome: null }).maya.strokes;
  expect(expected).toHaveLength(23);
  expect(history.delivery).toBeUndefined();
  const boardHistory = source === "saved" ? history : source === "trace" ? null : { v: 1 as const, revision: 0, events: [], delivery: { events: [] } };
  const saved = recordView({ ...row, boardHistory })!;
  expect(callReplay(saved).maya.strokes).toEqual(source === "empty delivery" ? [] : expected);
  expect(saved.batches).toHaveLength(source === "empty delivery" ? 0 : row.trace!.board.length);
  if (source === "saved") expect(saved.boardHistory).toEqual(history);
});

// A child's own voice call from the family desk (kind "family"): voice only, a workbook question, authorized by the
// server's canCallVoice seam, no free talk and no chat channel, and a time limit the server may shorten.
describe("a family voice call from the desk", () => {
  const BOOK_PKG: QuestionPackage = { ...SAMPLE_PACKAGES["add-27-39"], ref: { source: "workbook", workbookId: "44444444-4444-4444-8444-444444444444", page: 1, question: 1 } };
  const familyInput = (over: Partial<Parameters<ReturnType<typeof mayaCalls>["startVoice"]>[0]> = {}) =>
    ({ kind: "family" as const, parentId: PARENT, childId: CHILD, childName: "Leah", package: BOOK_PKG, startedBy: PARENT, ...over });

  it("is refused unless the server says this child may call, and nothing is stored", async () => {
    const s = setup();
    expect(await s.calls.startVoice(familyInput())).toEqual({ ok: false, error: "not_test_family" });
    const no = mayaCalls({ ...s.seams, canCallVoice: async () => false });
    expect(await no.startVoice(familyInput())).toEqual({ ok: false, error: "not_test_family" });
    expect(s.store.rows()).toHaveLength(0);
  });

  it("is voice only and a workbook question only", async () => {
    const s = setup();
    const calls = mayaCalls({ ...s.seams, canCallVoice: async () => true });
    expect(await calls.start(familyInput())).toEqual({ ok: false, error: "not_test_family" });
    expect(await calls.startVoice(familyInput({ package: PKG }))).toEqual({ ok: false, error: "invalid_question" });
    expect(s.store.rows()).toHaveLength(0);
    const made = ok(await calls.startVoice(familyInput())).view;
    expect(made).toMatchObject({ kind: "family", mode: "voice", status: "live", startedAt: null });
  });

  it("keeps free talk off, sets no chat channel and the normal limits, and asks no test-family check", async () => {
    const s = setup();
    const asked = vi.fn(async () => false);
    const calls = mayaCalls({ ...s.seams, isTestFamily: asked, canCallVoice: async () => true });
    ok(await calls.startVoice(familyInput()));
    const session = s.store.rows()[0].live!.text.session;
    expect(session.freeTalk).toBe(false);
    expect(session.channel).toBeUndefined();
    expect(session.limits).toBeUndefined();
    expect(asked).not.toHaveBeenCalled();
  });

  it("a shorter limit shortens the closing and the end that the worker and the session use", async () => {
    const s = setup();
    const calls = mayaCalls({ ...s.seams, canCallVoice: async () => true });
    const view = ok(await calls.startVoice(familyInput({ limitMs: 150_000 }))).view;
    expect(s.store.rows()[0].live!.text.session.limits).toEqual({ closingAtMs: 90_000, endAtMs: 150_000 });
    // The worker restores the saved session, so it reads the same limits (agent.ts: limitsOf(call.session)).
    const opened = await calls.openVoice(view.id, PROVIDERS, "Leah");
    if (!opened.ok) throw new Error(opened.error);
    expect(limitsOf(opened.call.session)).toEqual({ closingAtMs: 90_000, endAtMs: 150_000 });
    await opened.call.end({ reason: "child_stopped" });
  });

  it("is run by the worker like any voice call and ends as a family row", async () => {
    const s = setup();
    const calls = mayaCalls({ ...s.seams, canCallVoice: async () => true });
    const view = ok(await calls.startVoice(familyInput())).view;
    const opened = await calls.openVoice(view.id, PROVIDERS, "Leah");
    if (!opened.ok) throw new Error(opened.error);
    await opened.call.start();
    await opened.call.end({ reason: "child_stopped" });
    const row = s.store.rows()[0];
    expect(row).toMatchObject({ kind: "family", mode: "voice", status: "ended" });
    expect(row.trace && checkTrace(row.trace).ok).toBe(true);
    expect(row.trace?.freeTalk).toBe(false);
  });
});
