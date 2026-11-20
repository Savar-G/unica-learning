import { ReadableStream, type ReadableStreamDefaultController } from "node:stream/web";
import { EventEmitter } from "node:events";
import { initializeLogger, llm, normalizeLanguage, stt, tts, voice } from "@livekit/agents";
import { AudioFrame, TrackPublishOptions } from "@livekit/rtc-node";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setProductObserver } from "@/lib/product-monitoring";
import { logBaselineTurn } from "@/lib/maya-baseline";
import { createBoardReceiver, createBoardSender, type BoardReceiver, type BoardTransport } from "@/lib/board-protocol";
import { createMemoryTransport } from "@/lib/board-protocol-memory";
import { boardRpcHandler, boardRpcTransport } from "@/lib/board-rpc";
import { createBoardSpeech, type CueMeasurement } from "@/lib/board-speech";
import { templateSkills } from "@/lib/assessment";
import { learningEvents } from "@/lib/learning-events";
import { memoryLearningEventStore } from "@/lib/learning-events-memory";
import { memoryWordingHistoryStore, openingLine, PAUSES, TIME_LIMITS } from "@/lib/maya";
import { mayaCalls, type CallSeams } from "@/lib/maya-call";
import { memoryCallStore, memoryConnectionLog } from "@/lib/maya-call-memory";
import type { MayaModel } from "@/lib/maya-model";
import { reply as v3Reply, ruleConversationalModel, ruleMayaModel } from "@/lib/maya-model-fake";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { callSpend, createSpendLedger, spendConfig, SPEND_CLOSE, WEEK_MICROS } from "@/lib/maya-spend";
import { memorySpendStore } from "@/lib/maya-spend-memory";
import { checkTrace } from "@/lib/maya-trace";
import { BOARD_CLOSE_SETTLE_MS, RECONNECT_GRACE_MS, REJOIN_AFTER_LEAVE_MS, voiceProviders } from "@/lib/maya-voice";
import type { QuestionPackage } from "@/lib/question-package";
import { mayaWorkbookFixture } from "@/lib/maya-workbook-fixture";
import { selectWorkbookQuestion } from "@/lib/maya-workbook-question";
import { spokenMath } from "@/lib/maya-voice-spoken";
import { VoiceCallRun, voiceSession, type CallUpdate, type Timers } from "./agent";
import { voiceBaselineTurn } from "./baseline";
import type { VoiceTurnSample } from "./turn-timing";
import { FakeTTS } from "./fake-providers";
import { makeProviders } from "./providers";

// A whole voice call through LiveKit Agents for Node with the fake speech-to-text and voice (#326): no room, no
// account, no network. The child's "speech" goes in through the fake speech-to-text, LiveKit's pipeline (turns,
// speech, playout) carries it to Maya's agent, the call module stores every turn, and the fake voice records what
// Maya said. The audio in and out are LiveKit's own interfaces (AudioInput, AudioOutput), as its tests use them.

initializeLogger({ pretty: false, level: "silent" });

const PARENT = "11111111-1111-4111-8111-111111111111";
const CHILD = "22222222-2222-4222-8222-222222222222";
const TEST = "33333333-3333-4333-8333-333333333333";
const T0 = Date.UTC(2026, 10, 1, 16, 0, 0);

const PKG: QuestionPackage = {
  ...SAMPLE_PACKAGES["add-27-39"],
  id: `${TEST}:s1-4`,
  ref: { source: "assessment", assessmentId: TEST, questionId: "s1-4" },
  templateId: "2-add-2-digit",
  skill: { standard: "2.4", skills: templateSkills("2-add-2-digit").map((k) => k.id) },
};

/** The child's microphone: silence, as frames. The fake speech-to-text hears the text given to FakeSpeech instead. */
class SilentMicrophone extends voice.AudioInput {
  private controller!: ReadableStreamDefaultController<AudioFrame>;
  constructor() {
    super();
    this.multiStream.addInputStream(new ReadableStream<AudioFrame>({ start: (c) => void (this.controller = c) }));
  }
  push(ms = 20) {
    const samples = (16_000 * ms) / 1000;
    this.controller.enqueue(new AudioFrame(new Int16Array(samples), 16_000, 1, samples));
  }
}

/** The child's speaker: plays each segment at once. */
class Speaker extends voice.AudioOutput {
  private captured = 0;
  constructor(private readonly clock = Date.now) {
    super(24_000);
  }
  override async captureFrame(frame: AudioFrame) {
    const before = this.capturedPlayoutSegments;
    await super.captureFrame(frame);
    this.captured += frame.samplesPerChannel / frame.sampleRate;
    if (this.capturedPlayoutSegments > before) this.onPlaybackStarted(this.clock());
  }
  override flush() {
    super.flush();
    if (this.pendingPlayoutSegments > 0) this.onPlaybackFinished({ playbackPosition: this.captured, interrupted: false });
    this.captured = 0;
  }
  override clearBuffer() {
    if (this.pendingPlayoutSegments > 0) this.onPlaybackFinished({ playbackPosition: 0, interrupted: true });
  }
}

/** A clock and timers the test moves by hand. */
function handTimers() {
  let now = T0;
  let next = 0;
  const due = new Map<number, { at: number; run: () => void }>();
  const timers: Timers = {
    now: () => now,
    set: (ms, run) => {
      due.set(++next, { at: now + ms, run });
      return next;
    },
    clear: (h) => void due.delete(h as number),
  };
  async function elapse(ms: number, step: number) {
    const end = now + ms;
    while (now < end) {
      now = Math.min(end, now + step);
      for (const [h, t] of [...due].sort((a, b) => a[1].at - b[1].at)) {
        if (t.at > now) continue;
        due.delete(h);
        t.run();
      }
      await new Promise<void>(resolve => setImmediate(resolve));
    }
  }
  return {
    timers,
    now: () => now,
    jump(s: number) { now += s * 1000; },
    advance: (s: number) => elapse(s * 1000, 1000),
    play: (ms: number) => elapse(ms, 10),
  };
}

/** A child's reply is a stream that returns at once (#532); it is done, and its board staged, when the stream ends. */
const readReply = async (reply: Awaited<ReturnType<VoiceCallRun["agent"]["llmNode"]>>) => {
  if (reply) for await (const chunk of reply) void chunk;
};

const waitFor = async (check: () => boolean, what: string, ms = 10_000) => {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 10));
  }
};

let cleanup: (() => Promise<void>) | null = null;
beforeEach(() => { vi.clearAllMocks(); setProductObserver(null); });
afterEach(async () => {
  await cleanup?.();
  cleanup = null;
  setProductObserver(null);
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs();
});

async function voiceCall(options: { spend?: (clock: () => number) => CallSeams["spend"]; speech?: ProbeSTT; speaker?: Speaker; seed?: number; model?: MayaModel; board?: boolean; timestamps?: boolean; workbookReference?: string; measureBaseline?: boolean; exchange?: boolean; transport?: (receiver: BoardReceiver) => BoardTransport } = {}) {
  const clock = handTimers();
  let n = 0;
  const store = memoryCallStore({ testFamilies: [PARENT] });
  const connections = memoryConnectionLog(store, clock.now);
  const rebuild = vi.fn(async () => true);
  const seams: CallSeams = {
    store,
    connections,
    // These calls raise no flag; the safety flag and its alert have their own tests (src/lib/maya-call-safety.test.ts).
    alerts: { send: async () => {}, list: async () => [] },
    history: memoryWordingHistoryStore(),
    events: learningEvents(memoryLearningEventStore({ children: [{ id: CHILD, parentId: PARENT }], tests: [{ id: TEST, childId: CHILD }] })),
    rebuild,
    model: (id) => (id === null || id === "fake" ? options.model ?? ruleMayaModel() : null),
    isTestFamily: async (p) => p === PARENT,
    checkedExchange: options.exchange,
    ...(options.spend ? { spend: options.spend(clock.now) } : {}),
    clock: clock.now,
    newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
    seed: () => options.seed ?? 42,
  };
  const calls = mayaCalls(seams);
  const fixture = options.workbookReference ? await mayaWorkbookFixture() : null;
  const selected = fixture ? await selectWorkbookQuestion({ childId: fixture.ids.child, workbookId: fixture.ids.workbook, reference: options.workbookReference }, fixture.reader) : null;
  if (selected && !selected.ok) throw Error(selected.error);
  const pkg = selected?.ok ? selected.package : options.exchange ? { ...SAMPLE_PACKAGES["subtract-52-28"], ref: PKG.ref } : PKG;
  const started = await calls.startVoice({ kind: "admin_test", parentId: PARENT, childId: CHILD, childName: "Leah", package: pkg, confirmWorkbook: !!selected?.ok, startedBy: "admin-1" });
  if (!started.ok) throw new Error(started.error);
  const config = voiceProviders({});
  if (!config.ok) throw new Error("fake providers");
  const opened = await calls.openVoice(started.view.id, config.ids, "Leah");
  if (!opened.ok) throw new Error(opened.error);
  const providers = await makeProviders(config, { fakeMsPerChar: 1, fakeTimestamps: options.timestamps });
  const session = voiceSession({ ...providers, stt: options.speech ?? providers.stt }, { endpointingMs: 20, aecWarmupDuration: 0 });
  const microphone = new SilentMicrophone();
  session.input.audio = microphone;
  session.output.audio = options.speaker ?? new Speaker();
  const updates: CallUpdate[] = [];
  const closed = vi.fn(async () => {});
  const receiver = createBoardReceiver({ sessionId: started.view.id, clock: clock.now });
  const sender = createBoardSender({ sessionId: started.view.id, senderId: "worker", transport: options.transport?.(receiver) ?? createMemoryTransport(receiver) });
  const samples: CueMeasurement[] = [];
  const board = createBoardSpeech({ sender, now: clock.now, observe: snapshot => opened.call.observeBoard(snapshot), measure: s => samples.push(s) });
  const turns: VoiceTurnSample[] = [];
  const boardPlans = new Map<string, { turnId: string; batchIds: readonly string[] }>();
  const run = new VoiceCallRun(session, opened.call, {
    ...(options.board ? { board } : {}), timers: clock.timers, notify: (u) => updates.push(u), closed,
    ...(options.measureBaseline ? {
      measureTurn: sample => turns.push(sample),
      measureBoardPlan: (id, turnId, batchIds) => { boardPlans.set(id, { turnId, batchIds }); },
    } : {}),
  });
  await run.agentJoined();
  await session.start({ agent: run.agent });
  run.attachBoardAudio();
  if (options.measureBaseline) run.attachTurnTiming();
  microphone.push();
  cleanup = async () => {
    await run.finish({ detail: "test over" });
  };
  const voiceOut = providers.tts as FakeTTS;
  const said = () => voiceOut.spoken;
  /** The child says `text`, and Maya answers (her next words are spoken). */
  const childSays = async (text: string, options?: { confidence?: number; alternatives?: string[] }) => {
    const before = said().length;
    expect(providers.fakeSpeech!.say(text, options)).toBe(true);
    await waitFor(() => said().length > before, `Maya's answer to "${text}"`);
    await opened.call.settled();
    return said().slice(before).join(" ");
  };
  return { sender, receiver, board, samples, turns, boardPlans, id: started.view.id, calls, store, connections, rebuild, run, session, said, childSays, clock, updates, closed, call: opened.call, seams, tts: voiceOut, speech: providers.fakeSpeech! };
}

describe("a voice call through LiveKit with the fake providers", () => {
  it("confirms a spoken workbook reference before teaching through fake audio and board transport", async () => {
    const c = await voiceCall({ workbookReference: "page four, number three", board: true });
    await c.run.childJoined();
    // The voice is given the sign as a word (spokenMath); the board and the transcript keep "27 + 39".
    await waitFor(() => c.said().join(" ").includes("27 plus 39."), "the workbook confirmation");
    expect(c.said().join(" ")).toBe("Hi, I'm Maya, an AI helper. Let's do page 4, number 3: 27 plus 39.");
    expect(c.store.rows()[0].question).toMatchObject({ source: "workbook", page: 4, question: 3 });
    const reply = await c.childSays("I don't know how to start.");
    expect(reply.length).toBeGreaterThan(0);
    await c.call.settled();
    expect(c.store.rows()[0].live!.text.session.confirmWorkbook).toBe(true);
    expect(c.said().join(" ").indexOf("Let's do page 4, number 3")).toBeLessThan(c.said().join(" ").lastIndexOf(reply));
  });
  it("opens when the child joins, carries each spoken turn to Maya and her words back, and stores the call", async () => {
    // The model every real call has now (D-341, src/lib/maya-call-seams.ts): its fake is the conversational rule player,
    // which does not check a number it heard badly. The two hearing turns are scripted as a real model answers them.
    const rule = ruleConversationalModel();
    const model: MayaModel = { ...rule, propose: async (input, signal, onText) => {
      const turn = (input as { childTurn?: string | null }).childTurn;
      if (turn === "I got sixty six") return v3Reply("Did you say 66?", "confirm");
      if (turn === "No, I said 66.") return v3Reply("Yes, 27 + 39 = 66. How did you work it out?", "accept_answer", { reading: { correctsHearing: true, answers: [{ value: { type: "number", value: 66 }, step: "result", problem: "target", verdict: "right" }] } });
      return rule.propose(input, signal, onText);
    } };
    const c = await voiceCall({ model });
    await c.clock.advance(2);
    await c.run.childJoined();
    await waitFor(() => c.said().length === 1, "Maya's opening");
    expect(c.said()[0]).toMatch(/\bAI\b/);

    await c.clock.advance(5);
    const reply = await c.childSays("I got 56.");
    expect(reply).not.toMatch(/66/);
    await c.clock.advance(5);
    // An unsure number: Maya checks what she heard.
    await c.childSays("I got sixty six", { confidence: 0.3, alternatives: ["sixty", "fifty six"] });
    await c.clock.advance(5);
    await c.childSays("No, I said 66.");
    expect(c.updates.length).toBeGreaterThanOrEqual(3);

    const live = (await c.calls.view(c.id))!;
    expect(live.transcript.filter((l) => l.speaker === "child").map((l) => l.text)).toEqual(["I got 56.", "I got sixty six", "No, I said 66."]);
    // Every word Maya spoke is a word the call stored for her, in order (the easier example's steps are one reply). The
    // stored text keeps its math signs; the voice was given them as words.
    const stored = live.transcript.filter((l) => l.speaker === "maya").map((l) => l.text.replaceAll("{name}", "Leah"));
    // D-341: the opening is code's own line, which names the question in spoken words (openingLine, spokenQuestion).
    expect(stored[0]).toBe(openingLine(PKG as Parameters<typeof openingLine>[0]));
    expect(stored.some((l) => l.includes("27 + 39"))).toBe(true);
    expect(c.said().join(" ")).toBe(spokenMath(stored.join(" ")));

    await c.clock.advance(10);
    await c.run.hangUp();
    const [row] = c.store.rows();
    expect(row).toMatchObject({ mode: "voice", status: "ended", speechToText: "fake", voice: "fake", connectedSeconds: 25 });
    expect(row.outcome?.mishearing.corrections).toBe(1);
    expect(row.outcome?.mishearing.confirmations).toBeGreaterThanOrEqual(1);
    expect(row.trace?.turns.find((t) => t.kind === "child" && t.text === "I got sixty six")).toMatchObject({ uncertain: true });
    expect(checkTrace(row.trace).ok).toBe(true);
    expect(row.learningEventId).not.toBeNull();
    expect(c.connections.rows().filter(e => e.kind !== "agent_joined").map(e => e.kind)).toEqual(["agent_left", "child_joined", "child_left", "agent_left"]);
    expect(c.updates.at(-1)).toMatchObject({ ended: true });
    expect(c.closed).toHaveBeenCalledTimes(1);
  });

  it("checks in after the child's silence, counted from the end of Maya's speech", async () => {
    const c = await voiceCall();
    await c.run.childJoined();
    await waitFor(() => c.said().length === 1, "Maya's opening");
    await waitFor(() => c.session.agentState !== "speaking", "the opening to finish");
    await c.call.settled();
    await c.clock.advance(PAUSES.thinkCheckMs / 1000 - 1);
    expect(c.said()).toHaveLength(1);
    await c.clock.advance(2);
    await waitFor(() => c.said().length === 2, "Maya's check-in");
    const stored = (await c.calls.view(c.id))!;
    expect(stored.transcript.some((l) => l.speaker === "note" && l.text === "The child stayed quiet.")).toBe(true);
  });

  it("ends as a technical issue when the child's connection drops and does not come back", async () => {
    const c = await voiceCall();
    await c.run.childJoined();
    await waitFor(() => c.said().length === 1, "Maya's opening");
    await c.clock.advance(20);
    await c.run.childLeft("dropped");
    await c.clock.advance(RECONNECT_GRACE_MS / 1000 + 1);
    await waitFor(() => c.closed.mock.calls.length === 1, "the call to close");
    const [row] = c.store.rows();
    expect(row.outcome?.reason).toBe("technical_issue");
    expect(row.connectedSeconds).toBe(20);
  });

  it("goes on when the child is back in time, and counts the gap out of the connected time", async () => {
    const c = await voiceCall();
    await c.run.childJoined();
    await waitFor(() => c.said().length === 1, "Maya's opening");
    await c.clock.advance(10);
    await c.run.childLeft("dropped");
    await c.clock.advance(5);
    await c.run.childJoined();
    await c.clock.advance(RECONNECT_GRACE_MS / 1000 + 1);
    expect(c.closed).not.toHaveBeenCalled();
    await c.childSays("Is it 66?");
    await c.run.hangUp();
    const [row] = c.store.rows();
    expect(row.connectedSeconds).toBe(10 + RECONNECT_GRACE_MS / 1000 + 1);
    expect(row.outcome?.reason).not.toBe("technical_issue");
  });
});

// #992: a LiveKit full reconnect (livekit-client 2.23.0) leaves with CLIENT_INITIATED, which main.ts reads as "hang_up",
// and joins again about 2 s later. A leave like that is a hang-up only when the child stays away; the button is the RPC.
describe("a leave the child's screen sent (#992)", () => {
  it("goes on when the child joins again 2 s after the leave, as a full reconnect does", async () => {
    const c = await voiceCall();
    await c.run.childJoined();
    await waitFor(() => c.said().length === 1, "Maya's opening");
    await c.clock.advance(14);
    await c.run.childLeft("hang_up", 1);
    await c.clock.advance(2);
    await c.run.childJoined();
    await c.clock.advance(REJOIN_AFTER_LEAVE_MS / 1000 + 1);
    expect(c.closed).not.toHaveBeenCalled();
    expect(c.store.rows()[0].status).toBe("live");
    expect((await c.childSays("Is it 66?")).length).toBeGreaterThan(0);
    await c.run.hangUp();
    expect(c.store.rows()[0].outcome?.reason).toBe("child_stopped");
  });

  it("ends as the child stopping when the child does not come back within the wait", async () => {
    const c = await voiceCall();
    await c.run.childJoined();
    await waitFor(() => c.said().length === 1, "Maya's opening");
    await c.clock.advance(14);
    await c.run.childLeft("hang_up", 1);
    await c.clock.advance(REJOIN_AFTER_LEAVE_MS / 1000 - 1);
    expect(c.closed).not.toHaveBeenCalled();
    expect(c.store.rows()[0].status).toBe("live");
    await c.clock.advance(1);
    await waitFor(() => c.closed.mock.calls.length === 1, "the call to close");
    const [row] = c.store.rows();
    expect(row).toMatchObject({ status: "ended", connectedSeconds: 14 });
    expect(row.outcome?.reason).toBe("child_stopped");
  });

  it("ends at once on the Hang up RPC, and the leave after it changes nothing", async () => {
    const c = await voiceCall();
    await c.run.childJoined();
    await waitFor(() => c.said().length === 1, "Maya's opening");
    await c.clock.advance(14);
    await c.run.hangUp();
    expect(c.closed).toHaveBeenCalledTimes(1);
    expect(c.store.rows()[0].status).toBe("ended");
    expect(c.store.rows()[0].outcome?.reason).toBe("child_stopped");
    await c.run.childLeft("hang_up", 1);
    await c.clock.advance(REJOIN_AFTER_LEAVE_MS / 1000 + 1);
    expect(c.closed).toHaveBeenCalledTimes(1);
  });

  it("keeps the full reconnect grace for a dropped connection, past the shorter wait", async () => {
    const c = await voiceCall();
    await c.run.childJoined();
    await waitFor(() => c.said().length === 1, "Maya's opening");
    await c.clock.advance(14);
    await c.run.childLeft("dropped", 9);
    await c.clock.advance(REJOIN_AFTER_LEAVE_MS / 1000 + 1);
    expect(c.closed).not.toHaveBeenCalled();
    await c.clock.advance(RECONNECT_GRACE_MS / 1000 - REJOIN_AFTER_LEAVE_MS / 1000 - 2);
    expect(c.store.rows()[0].status).toBe("live");
    await c.clock.advance(2);
    await waitFor(() => c.closed.mock.calls.length === 1, "the call to close");
    expect(c.store.rows()[0].outcome?.reason).toBe("technical_issue");
  });
});


// preflight.ts: a speculative transcript differs from the completed turn.
class ProbeSTT extends stt.STT {
  label = "probe.STT";
  events = new EventEmitter();
  constructor() { super({ streaming: true, interimResults: true }); }
  async _recognize(): Promise<stt.SpeechEvent> { throw new Error("stream only"); }
  stream() { return new ProbeStream(this); }
  send(type: stt.SpeechEventType, text = "", confidence = 0.95) {
    this.events.emit("event", { type, ...(text ? { alternatives: [{ language: normalizeLanguage("en"), text, startTime: 0, endTime: 0, confidence }] } : {}) });
  }
}
class ProbeStream extends stt.SpeechStream {
  label = "probe.Stream";
  constructor(readonly source: ProbeSTT) { super(source); }
  async run() {
    const put = (event: stt.SpeechEvent) => this.queue.put(event);
    this.source.events.on("event", put);
    try { for await (const frame of this.input) { void frame; if (this.abortSignal.aborted) break; } }
    finally { this.source.events.off("event", put); }
  }
}

class HeldSpeaker extends Speaker {
  held = false;
  finishPlayback() { this.held = false; super.flush(); }
  override flush() { if (!this.held) super.flush(); }
}

class HeldSentence extends tts.SynthesizeStream {
  label = "held.SynthesizeStream";
  readonly requested = Promise.withResolvers<string>();
  readonly cancelled = Promise.withResolvers<void>();
  constructor(source: FakeTTS) { super(source); }
  protected async run() {
    let text = "";
    for await (const part of this.input) {
      if (part === tts.SynthesizeStream.FLUSH_SENTINEL) break;
      text += part;
    }
    this.requested.resolve(text.trim());
    if (!this.abortSignal.aborted) {
      await new Promise<void>(resolve => this.abortSignal.addEventListener("abort", () => resolve(), { once: true }));
    }
    this.cancelled.resolve();
  }
}

it("retires a checked plan on an SDK cut before the first frame and without a new transcript", async () => {
  const c = await voiceCall({ model: ruleConversationalModel(), board: true, exchange: true });
  await c.run.childJoined();
  await waitFor(() => c.session.agentState === "listening" && c.said().length > 0, "opening");
  const active = new HeldSentence(c.tts);
  const handle = Promise.withResolvers<{ speech: voice.SpeechHandle }>();
  c.session.once(voice.AgentSessionEventTypes.SpeechCreated, event => handle.resolve({ speech: event.speechHandle }));
  vi.spyOn(c.tts, "stream").mockReturnValueOnce(active);
  try {
    expect(c.speech.say("Show me how to regroup.")).toBe(true);
    await active.requested.promise;
    await c.board.settled();
    const ids = c.call.session.checkedExchange!.turns[0].actions.map(action => action.batchId);
    expect(c.receiver.staged().map(batch => batch.batchId)).toEqual(ids);
    (await handle.promise).speech.interrupt(true);
    await active.cancelled.promise;
    await waitFor(() => c.call.session.checkedExchange?.turns[0].actions.every(action => action.fate === "cancelled") === true,
      "both unplayed cues to be retired");
    expect(c.call.session.checkedExchange!.turns[0].playback).toBe("interrupted");
    expect(c.receiver.snapshot().events.some(e => e.kind === "batch" && ids.includes(e.batchId))).toBe(false);
    expect(c.call.session.assistance).not.toContain("guided");
  } finally { active.close(); }
});

it.each([true, false])("cuts a spoken demonstration after its first shown cue and keeps the child's words (timestamps=%s)", async timestamps => {
  let now = () => T0;
  const speaker = new HeldSpeaker(() => now());
  const c = await voiceCall({ speaker, model: ruleConversationalModel(), board: true, timestamps, exchange: true });
  now = c.clock.now;
  try {
    await c.run.childJoined();
    await waitFor(() => c.session.agentState === "listening" && c.said().length > 0, "opening");
    speaker.held = true;
    const stopped = vi.spyOn(speaker, "clearBuffer");
    const stream = c.tts.stream.bind(c.tts);
    const active = new HeldSentence(c.tts);
    const ahead = new HeldSentence(c.tts);
    vi.spyOn(c.tts, "stream").mockImplementationOnce(stream).mockReturnValueOnce(active).mockReturnValueOnce(ahead);
    await c.childSays("Show me how to regroup.");
    expect(await active.requested.promise).toBe("Trade 1 ten for 10 ones.");
    expect(await ahead.requested.promise).toBe("Now we have 4 tens and 12 ones, which is still 52.");
    await waitFor(() => speaker.pendingPlayoutSegments > 0, "the first sentence to enter playout");
    await c.clock.play(40);
    const [shown, future] = c.call.session.checkedExchange!.turns[0].actions;
    const oldScope = c.receiver.scope()!;
    await waitFor(() => c.receiver.snapshot().events.some(e => e.kind === "batch" && e.batchId === shown.batchId), "the first cue");
    await c.board.settled();
    expect(c.samples.find(s => s.batchId === shown.batchId)?.source).toBe(timestamps ? "word" : "sentence");
    const state = voice.AgentSessionEventTypes.UserStateChanged;
    c.session.emit(state, { type: state, newState: "speaking", oldState: "listening", createdAt: Date.now() });
    await c.board.settled();
    expect(c.receiver.staged().map(b => b.batchId)).toContain(future.batchId);
    expect(stopped).not.toHaveBeenCalled();
    c.session.emit(state, { type: state, newState: "listening", oldState: "speaking", createdAt: Date.now() });
    const correction = "I need a second.";
    expect(c.speech.say(correction)).toBe(true);
    await Promise.all([active.cancelled.promise, ahead.cancelled.promise]);
    await waitFor(() => stopped.mock.calls.length > 0, "the SDK to clear playout");
    await c.board.settled();
    speaker.finishPlayback();
    await waitFor(() => c.call.session.turns.some(t => t.speaker === "child" && t.text === correction) &&
      c.call.session.checkedExchange?.turns[0].playback === "interrupted", "the transcript and playout outcome to settle");
    expect(c.said()).not.toContain("What changed when we traded a ten?");
    expect(c.call.session.checkedExchange!.turns[0]).toMatchObject({
      playback: "interrupted", actions: [{ fate: "shown" }, { fate: "cancelled" }],
    });
    expect(c.call.session.done).toEqual([]);

    await c.run.childLeft("dropped");
    const oldEpoch = c.receiver.epoch();
    await c.run.childJoined();
    expect(c.receiver.handle({ type: "release", sessionId: c.id, epoch: oldEpoch, scope: oldScope, batchId: future.batchId }))
      .toMatchObject({ ok: false, code: "stale_epoch" });
    const oldTurn = c.call.session.checkedExchange!.turns[0];
    await c.call.exchangePlayback!(oldTurn.id, "finished");
    expect(c.call.session.checkedExchange!.turns[0].playback).toBe("interrupted");
    const log = c.receiver.snapshot().events;
    expect(log.filter(e => e.kind === "batch" && e.batchId === shown.batchId)).toHaveLength(1);
    expect(log.some(e => e.kind === "batch" && e.batchId === future.batchId)).toBe(false);
    expect(c.call.session.checkedExchange!.turns[0].support).toBe("hinted");
    expect(c.call.session.assistance).toContain("hint");
    expect(c.call.session.assistance).not.toContain("guided");
  } finally { speaker.finishPlayback(); }
});

it("interrupts a regrouping prompt in playout and shows the child's exchange once", async () => {
  let now = () => T0;
  const speaker = new HeldSpeaker(() => now());
  const c = await voiceCall({ speaker, model: ruleConversationalModel(), board: true, timestamps: true, exchange: true });
  now = c.clock.now;
  try {
    await c.run.childJoined();
    await waitFor(() => c.said().length > 0 && c.session.agentState === "listening", "opening");
    speaker.held = true;
    const stopped = vi.spyOn(speaker, "clearBuffer");
    const oldSpeech = c.childSays("How do I regroup?");
    await oldSpeech;
    await waitFor(() => speaker.pendingPlayoutSegments > 0, "the prompt audio to reach the speaker");
    await c.clock.advance(1);
    await waitFor(() => c.session.agentState === "speaking" && c.receiver.snapshot().events.some(
      e => e.kind === "batch" && JSON.stringify(e.commands).includes("52 = 50 + 2"),
    ), "the shown tens while the prompt is playing");
    const target = (await c.calls.view(c.id))!.exchange!;
    expect(stopped).not.toHaveBeenCalled();
    const attemptsInFlight = [c.run.exchange(target), c.run.exchange(target)];
    const state = voice.AgentSessionEventTypes.UserStateChanged;
    c.session.emit(state, { type: state, newState: "speaking", oldState: "listening", createdAt: Date.now() });
    c.session.emit(state, { type: state, newState: "listening", oldState: "speaking", createdAt: Date.now() });
    const attempts = await Promise.all(attemptsInFlight);
    expect(attempts).toContain("accepted");
    expect(stopped).toHaveBeenCalled();
    expect(c.receiver.snapshot().events.filter(e => e.kind === "batch" && JSON.stringify(e.commands).includes("52 = 40 + 12"))).toHaveLength(1);
    await waitFor(() => c.said().join(" ").includes("4 tens and 12 ones"), "Maya's reply to the exchange");
    expect(c.call.session.done).toEqual([]);
    expect(c.call.session.checkedExchange?.turns.filter(t => t.childAction)).toHaveLength(1);
    expect(c.call.session.checkedExchange?.turns.find(t => t.prompt)?.playback).toBe("interrupted");
    const latest = (await c.calls.view(c.id))!;
    expect(latest.exchange).toBeUndefined();
    expect(await c.run.exchange(target)).toBe("done");
  } finally { speaker.finishPlayback(); }
});

it("cuts a regrouping prompt in playout when the child points to the blocks, and answers the tap once", async () => {
  let now = () => T0;
  const speaker = new HeldSpeaker(() => now());
  const c = await voiceCall({ speaker, model: ruleConversationalModel(), board: true, timestamps: true, exchange: true });
  now = c.clock.now;
  try {
    await c.run.childJoined();
    await waitFor(() => c.said().length > 0 && c.session.agentState === "listening", "opening");
    speaker.held = true;
    const stopped = vi.spyOn(speaker, "clearBuffer");
    await c.childSays("How do I regroup?");
    await waitFor(() => speaker.pendingPlayoutSegments > 0, "the prompt audio to reach the speaker");
    await c.clock.advance(1);
    await waitFor(() => c.session.agentState === "speaking" && c.receiver.snapshot().events.some(
      e => e.kind === "batch" && JSON.stringify(e.commands).includes("52 = 50 + 2"),
    ), "the shown tens while the prompt is playing");
    const view = (await c.calls.view(c.id))!;
    const blocks = c.receiver.snapshot().events.find(e => e.kind === "batch" && JSON.stringify(e.commands).includes("exchange-before"));
    const target = { ...view.selection!, objectId: "exchange-before", batchId: blocks!.kind === "batch" ? blocks!.batchId : "", selectionId: "tap-1" };
    const batchesBefore = c.receiver.snapshot().events.filter(e => e.kind === "batch").length;
    expect(stopped).not.toHaveBeenCalled();
    const taps = await Promise.all([c.run.select(target), c.run.select(target)]);
    expect(taps.sort()).toEqual(["accepted", "busy"]);
    expect(stopped).toHaveBeenCalled();
    await waitFor(() => c.said().join(" ").includes("They show 5 tens and 2 ones, which is 52."), "Maya's answer about the blocks");
    expect(c.call.session.checkedExchange?.turns.find(t => t.prompt)?.playback).toBe("interrupted");
    expect(c.receiver.snapshot().events.filter(e => e.kind === "batch")).toHaveLength(batchesBefore);
    expect(c.call.session.done).toEqual([]);
    expect(c.call.session.solved).toBeNull();
    expect(await c.run.select(target)).toBe("done");
    expect(c.call.session.boardSelections).toHaveLength(1);
  } finally { speaker.finishPlayback(); }
});

it("drops deadline audio when the child starts speaking before the first frame reaches output", async () => {
  const speaker = new Speaker();
  const c = await voiceCall({ speaker, board: true, timestamps: true });
  await c.run.childJoined();
  await waitFor(() => c.said().length > 0 && c.session.agentState === "listening", "the opening");
  await c.board.settled();
  const output = vi.spyOn(speaker, "captureFrame");
  const adapter = c.session.output.audio!;
  const capture = adapter.captureFrame.bind(adapter);
  const deadlineMark = 2_200;
  let spoke = false;
  vi.spyOn(adapter, "captureFrame").mockImplementation(frame => {
    const forwarded = capture(frame);
    if (!spoke && frame.data[0] === deadlineMark) {
      spoke = true;
      c.session.emit(voice.AgentSessionEventTypes.UserStateChanged, {
        type: voice.AgentSessionEventTypes.UserStateChanged, oldState: "listening", newState: "speaking", createdAt: c.clock.now(),
      });
    }
    return forwarded;
  });
  c.tts.amplitude = deadlineMark;
  c.clock.jump(TIME_LIMITS.closingAtMs / 1000);
  await c.run.tick();
  await waitFor(() => c.closed.mock.calls.length === 1, "the deadline call to close");
  expect(c.call.session.outcome?.reason).toBe("time_limit");
  expect(spoke).toBe(true);
  expect(output.mock.calls.filter(([frame]) => frame.data[0] === deadlineMark)).toHaveLength(0);
});

it.each(["checked move", "legacy", "legacy disconnect", "hard cutoff"])("plays deadline frames with a board ACK held (%s)", async mode => {
  const exchange = mode === "checked move";
  let now = () => T0;
  const speaker = new HeldSpeaker(() => now());
  const c = await voiceCall({ speaker, model: exchange ? ruleConversationalModel() : undefined, board: true, timestamps: true, exchange });
  now = c.clock.now;
  const unblock = Promise.withResolvers<void>();
  let moveBatch = "";
  let holding = false;
  let acknowledged = false;
  let move: Promise<unknown> | undefined;
  try {
    await c.run.childJoined();
    await waitFor(() => c.said().length > 0 && c.session.agentState === "listening", "the opening");
    await c.board.settled();
    const adapter = c.session.output.audio!;
    const tagged = vi.spyOn(adapter, "captureFrame");
    const output = vi.spyOn(speaker, "captureFrame");
    const transport = createMemoryTransport(c.receiver);
    c.sender.useTransport({ async call(request) {
      const result = await transport.call(request);
      if (exchange && request.type === "apply" && JSON.stringify(request.commands).includes("52 = 40 + 12")) moveBatch = request.batchId;
      if (request.type === "release" && (!exchange || request.batchId === moveBatch)) {
        holding = true;
        await unblock.promise;
      }
      return result;
    } });
    c.tts.amplitude = 1_100;
    speaker.held = true;
    const cut = vi.spyOn(speaker, "clearBuffer");
    await c.childSays(exchange ? "How do I regroup?" : "I don't know.");
    await waitFor(() => speaker.pendingPlayoutSegments > 0, "the prompt reaching output");
    expect(output.mock.calls.some(([frame]) => frame.data[0] === 1_100)).toBe(true);
    if (exchange) {
      await c.clock.advance(1);
      const target = (await c.calls.view(c.id))!.exchange!;
      expect(target).toBeDefined();
      const visible = () => c.receiver.snapshot().events.some(e => e.kind === "batch" && e.batchId === target.batchId);
      await waitFor(visible, "the prompt on the receiver");
      move = c.run.exchange(target);
    } else {
      await waitFor(() => c.receiver.staged().length > 0, "the legacy board plan");
      const scope = c.receiver.scope()!;
      await c.board.timing(scope, 10_000, 100, "word");
      void c.board.played(scope, 100).catch(() => {});
    }
    await waitFor(() => holding, "the held release ACK", 2_000);
    const boardScope = c.receiver.scope();
    if (exchange) await waitFor(() => cut.mock.calls.length > 0, "the move cutting the prompt");
    c.tts.amplitude = 2_200;
    await c.clock.advance(TIME_LIMITS.closingAtMs / 1000);
    expect(c.speech.say("Could you show me another step?")).toBe(true);
    await waitFor(() => c.call.session.outcome?.reason === "time_limit", "the deadline outcome");
    const words = spokenMath(c.call.session.turns.at(-1)!.text);
    await waitFor(() => {
      const cleared = cut.mock.invocationCallOrder[0];
      return cleared !== undefined && c.said().join(" ").includes(words) && output.mock.calls.some(([frame], i) =>
        frame.data[0] === 2_200 && output.mock.invocationCallOrder[i] > cleared);
    }, "new deadline PCM after the prompt clears, still without the board ACK", 2_000);
    expect(acknowledged).toBe(false);
    const afterCut = output.mock.calls.filter((_, i) => output.mock.invocationCallOrder[i] > cut.mock.invocationCallOrder[0]);
    expect(afterCut.every(([frame]) => frame.data[0] === 2_200)).toBe(true);
    if (exchange) {
      expect(c.receiver.snapshot().events.filter(e => e.kind === "batch" && e.batchId === moveBatch)).toHaveLength(1);
      expect(c.receiver.scope()).toEqual(boardScope);
    } else expect(c.call.session.checkedExchange).toBeUndefined();
    if (mode === "legacy disconnect" || mode === "hard cutoff") {
      const old = tagged.mock.calls.find(([frame]) => frame.data[0] === 2_200)![0];
      if (mode === "hard cutoff") {
        const close = vi.spyOn(c.session, "close");
        await c.clock.advance((TIME_LIMITS.endAtMs - TIME_LIMITS.closingAtMs) / 1000 + 1);
        expect(close).toHaveBeenCalled();
        expect(acknowledged).toBe(false);
      } else await c.run.childLeft("dropped");
      const captures = output.mock.calls.length;
      await adapter.captureFrame(old);
      expect(output.mock.calls).toHaveLength(captures);
    }
    acknowledged = true;
    unblock.resolve();
    await move;
    speaker.finishPlayback();
    if (mode !== "legacy disconnect") {
      await waitFor(() => c.closed.mock.calls.length === 1, "deadline call closed");
      expect(await c.calls.view(c.id)).toMatchObject({ status: "ended", outcome: { reason: "time_limit" } });
    }
  } finally {
    acknowledged = true;
    unblock.resolve();
    await move;
    speaker.finishPlayback();
  }
});

it("accepts an immediate exchange while the shown batch acknowledgement is still in flight", async () => {
  const releaseReceived = Promise.withResolvers<void>();
  const releaseAnswer = Promise.withResolvers<void>();
  let targetBatch = "";
  let now = () => T0;
  const speaker = new HeldSpeaker(() => now());
  const c = await voiceCall({
    model: ruleConversationalModel(), board: true, exchange: true, speaker,
    transport: receiver => ({
      async call(request) {
        const result = receiver.handle(request);
        if (request.type === "release" && request.batchId === targetBatch) {
          receiver.presented(targetBatch);
          receiver.presented(targetBatch);
          releaseReceived.resolve();
          await releaseAnswer.promise;
        }
        return result;
      },
    }),
  });
  now = c.clock.now;
  try {
    await c.run.childJoined();
    await waitFor(() => c.session.agentState === "listening" && c.said().length > 0, "opening");
    speaker.held = true;
    await c.childSays("How do I regroup?");
    const target = (await c.calls.view(c.id))!.exchange!;
    targetBatch = target.batchId;
    await waitFor(() => speaker.pendingPlayoutSegments > 0, "the prompt audio to reach the speaker");
    await c.clock.advance(1);
    await releaseReceived.promise;
    const action = c.run.exchange(target);
    await Promise.resolve();
    releaseAnswer.resolve();
    expect(await action).toBe("accepted");
    expect(await c.run.exchange({ ...target, boardRevision: target.boardRevision + 1 })).toBe("stale");
    expect(await c.run.exchange(target)).toBe("done");
    expect(c.receiver.snapshot().events.filter(e => e.kind === "presented" && e.batchId === targetBatch)).toHaveLength(1);
    expect(c.call.session.checkedExchange?.turns.filter(t => t.childAction)).toHaveLength(1);
    expect(c.call.session.done).toEqual([]);
  } finally { releaseAnswer.resolve(); speaker.finishPlayback(); }
});

it("plays the deadline close before a checked prompt acknowledgement returns", async () => {
  const held = Promise.withResolvers<void>();
  const answer = Promise.withResolvers<void>();
  let targetBatch = "";
  let now = () => T0;
  const speaker = new HeldSpeaker(() => now());
  const c = await voiceCall({ model: ruleConversationalModel(), board: true, exchange: true, speaker, timestamps: true,
    transport: receiver => ({ async call(request) {
      const result = receiver.handle(request);
      if (request.type === "release" && request.batchId === targetBatch) {
        held.resolve();
        await answer.promise;
      }
      return result;
    } }),
  });
  now = c.clock.now;
  try {
    await c.run.childJoined();
    await waitFor(() => c.session.agentState === "listening" && c.said().length > 0, "opening");
    speaker.held = true;
    await c.childSays("How do I regroup?");
    const target = (await c.calls.view(c.id))!.exchange!;
    targetBatch = target.batchId;
    await waitFor(() => speaker.pendingPlayoutSegments > 0, "prompt playout");
    await c.clock.play(40);
    await held.promise;
    const move = c.run.exchange(target);
    await c.clock.advance(TIME_LIMITS.closingAtMs / 1000);
    const cut = vi.spyOn(speaker, "clearBuffer");
    const played = vi.spyOn(speaker, "captureFrame");
    expect(c.speech.say("Could you show me another step?")).toBe(true);
    await waitFor(() => c.call.session.outcome?.reason === "time_limit", "the controller's deadline close");
    const words = spokenMath(c.call.session.turns.at(-1)!.text);
    await waitFor(() => {
      const stopped = cut.mock.invocationCallOrder[0];
      return stopped !== undefined && c.said().join(" ").includes(words) &&
        played.mock.invocationCallOrder.some(frame => frame > stopped);
    }, "deadline frames after the old prompt clears, with the ACK still held", 2500);
    answer.resolve();
    expect(await move).toBe("stale");
    speaker.finishPlayback();
    await waitFor(() => c.closed.mock.calls.length === 1, "closed deadline call");
    expect(await c.calls.view(c.id)).toMatchObject({ status: "ended", outcome: { reason: "time_limit" } });
    expect(c.receiver.snapshot().events.filter(e => e.kind === "batch" && e.batchId === targetBatch)).toHaveLength(1);
  } finally { answer.resolve(); speaker.finishPlayback(); }
});

it("cuts the prompt before the move is saved and plays the newer spoken reply after the move", async () => {
  let now = () => T0;
  const speaker = new HeldSpeaker(() => now());
  const releasingMove = Promise.withResolvers<void>();
  const releaseMove = Promise.withResolvers<void>();
  let moveBatch = "";
  const c = await voiceCall({
    speaker, model: ruleConversationalModel(), board: true, timestamps: true, exchange: true,
    transport: receiver => ({
      async call(request) {
        if (request.type === "apply" && JSON.stringify(request.commands).includes("52 = 40 + 12")) moveBatch = request.batchId;
        if (request.type === "release" && request.batchId === moveBatch) {
          releasingMove.resolve();
          await releaseMove.promise;
        }
        return receiver.handle(request);
      },
    }),
  });
  now = c.clock.now;
  const startedSave = Promise.withResolvers<void>();
  const releaseSave = Promise.withResolvers<void>();
  try {
    await c.run.childJoined();
    await waitFor(() => c.session.agentState === "listening" && c.said().length > 0, "opening");
    speaker.held = true;
    await c.childSays("How do I regroup?");
    const target = (await c.calls.view(c.id))!.exchange!;
    await waitFor(() => speaker.pendingPlayoutSegments > 0, "the prompt audio to reach the speaker");
    await c.clock.play(40);
    await waitFor(() => c.call.session.checkedExchange!.turns[0].actions[0].fate === "shown", "the prompt's shown batch");
    const stopped = vi.spyOn(speaker, "clearBuffer");
    const update = c.store.update.bind(c.store);
    let held = false;
    vi.spyOn(c.store, "update").mockImplementation(async (id, revision, change) => {
      if (!held && change.live?.text.session.checkedExchange?.turns.some(t => t.childAction)) {
        held = true;
        startedSave.resolve();
        await releaseSave.promise;
      }
      return update(id, revision, change);
    });
    const move = c.run.exchange(target);
    await startedSave.promise;
    await waitFor(() => stopped.mock.calls.length > 0, "the prompt audio to stop before the move save returns");
    expect(c.receiver.snapshot().events.some(e => e.kind === "batch" && JSON.stringify(e.commands).includes("52 = 40 + 12"))).toBe(false);
    expect(await c.run.exchange(target)).toBe("busy");

    const words = "I need a second.";
    const heard = Promise.withResolvers<void>();
    c.session.on(voice.AgentSessionEventTypes.UserInputTranscribed, event => {
      if (event.isFinal && event.transcript === words) heard.resolve();
    });
    expect(c.speech.say(words)).toBe(true);
    await heard.promise;
    releaseSave.resolve();
    await releasingMove.promise;
    await waitFor(() => c.call.session.turns.some(t => t.speaker === "child" && t.text === words) &&
      c.call.session.turns.at(-1)?.speaker === "maya", "the newer reply to be accepted while the board is waiting");
    const reply = spokenMath(c.call.session.turns.at(-1)!.text);
    const played = vi.spyOn(speaker, "captureFrame");
    expect(c.said().join(" ")).not.toContain(reply);
    releaseMove.resolve();
    expect(await move).toBe("accepted");
    speaker.finishPlayback();
    await waitFor(() => c.said().join(" ").includes(reply) && played.mock.calls.length > 0, "the newer reply to reach playout");
    expect(c.said().join(" ").split(reply)).toHaveLength(2);
    expect(c.said()).not.toContain("What changed when you traded a ten?");
    expect(c.receiver.snapshot().events.filter(e => e.kind === "batch" && JSON.stringify(e.commands).includes("52 = 40 + 12"))).toHaveLength(1);
    expect(await c.run.exchange(target)).toBe("done");
    expect(c.call.session.checkedExchange!.turns.filter(t => t.childAction)).toHaveLength(1);
    expect(c.call.session.done).toEqual([]);
  } finally { releaseSave.resolve(); releaseMove.resolve(); speaker.finishPlayback(); }
});

it.each([false, true])("shows a saved child move on worker replacement even after a normal close (closed=%s)", async closed => {
  const c = await voiceCall({ model: ruleConversationalModel(), exchange: true });
  await c.board.connect();
  const show = async (id: string, cues: NonNullable<Awaited<ReturnType<typeof c.call.start>>["boardCues"]>) => {
    await c.board.stage(id, cues);
    await c.board.show(c.board.capture(id)!);
  };
  await show("opening", (await c.call.start()).boardCues!);
  await show("prompt", (await c.call.child("How do I regroup?")).boardCues!);
  const target = (await c.calls.view(c.id))!.exchange!;
  const move = (await c.call.exchange!(target))!.boardCues!;
  await c.board.stage("unplayed-exchange", move);
  const id = move[0].batch.transactionId;
  expect(c.receiver.snapshot().events.some((e) => e.kind === "batch" && e.batchId === id)).toBe(false);
  if (closed) expect((await c.call.child("I want to stop now.")).ended).toBe(true);

  const replacement = await c.calls.openVoice(c.id, { speechToText: "fake", voice: "fake" }, null);
  if (!replacement.ok) throw Error(replacement.error);
  const sender = createBoardSender({ sessionId: c.id, senderId: "replacement", snapshot: replacement.call.boardSnapshot, transport: createMemoryTransport(c.receiver) });
  const board = createBoardSpeech({ sender, now: c.clock.now, observe: (snapshot) => replacement.call.observeBoard(snapshot) });
  const session = controlSession();
  const run = new VoiceCallRun(session as unknown as voice.AgentSession, replacement.call, { board, timers: c.clock.timers, notify: () => {} });
  try {
    await run.childJoined();
    const events = c.receiver.snapshot().events;
    expect(events.some((e) => e.kind === "cancelled" && e.batchIds.includes(id))).toBe(true);
    expect(events.filter((e) => e.kind === "batch" && e.batchId === id)).toHaveLength(1);
    expect(replacement.call.pendingExchange).toBeUndefined();
    if (closed) {
      expect(session.say).toHaveBeenCalledOnce();
      expect(session.say).not.toHaveBeenCalledWith(expect.stringContaining("4 tens and 12 ones"), expect.anything());
    } else {
      expect(await run.exchange(target)).toBe("done");
      expect(session.say).not.toHaveBeenCalled();
    }
  } finally { await run.hangUp(); }
});

it("recovers a checked demonstration saved before its board plan reached the browser", async () => {
  const c = await voiceCall({ model: ruleConversationalModel(), exchange: true });
  await c.board.connect();
  const opening = await c.call.start();
  await c.board.stage("opening", opening.boardCues!);
  await c.board.show(c.board.capture("opening")!);
  const abandoned = await c.call.child("Show me how to regroup.");
  expect(abandoned.boardCues).toHaveLength(2);

  const replacement = await c.calls.openVoice(c.id, { speechToText: "fake", voice: "fake" }, null);
  if (!replacement.ok) throw Error(replacement.error);
  const call = replacement.call;
  const sender = createBoardSender({ sessionId: c.id, senderId: "replacement", snapshot: call.boardSnapshot, transport: createMemoryTransport(c.receiver) });
  const board = createBoardSpeech({ sender, now: c.clock.now, observe: snapshot => call.observeBoard(snapshot) });
  const session = controlSession();
  const run = new VoiceCallRun(session as unknown as voice.AgentSession, call, { board, timers: c.clock.timers, notify: () => {} });
  try {
    await run.childJoined();
    expect(call.session.checkedExchange?.turns[0]).toMatchObject({
      playback: "interrupted", actions: [{ fate: "cancelled" }, { fate: "cancelled" }],
    });
    expect(call.session.assistance).not.toContain("guided");
    expect(c.receiver.snapshot().events.filter(e => e.kind === "batch").map(e => e.batchId)).toEqual(opening.boardCues!.map(cue => cue.batch.transactionId));
    expect(session.say).not.toHaveBeenCalled();
    const retry = await call.child("Show me how to regroup again.");
    expect(retry.boardCues).toHaveLength(2);
    expect(retry.boardCues![0].batch.transactionId).not.toBe(abandoned.boardCues![0].batch.transactionId);
    expect(call.session.done).toEqual([]);
  } finally { await run.hangUp(); }
});

function controlSession() {
  const emitter = new EventEmitter();
  return Object.assign(emitter, {
    agentState: "listening", userState: "listening", generateReply: vi.fn(),
    say: vi.fn(() => ({ waitForPlayout: async () => {} })), close: vi.fn(async () => {}),
  });
}

async function controlledRun(c: Awaited<ReturnType<typeof voiceCall>>, call = c.call) {
  const session = controlSession();
  const updates: CallUpdate[] = [];
  const closed = vi.fn(async () => {});
  const run = new VoiceCallRun(session as unknown as voice.AgentSession, call, { timers: c.clock.timers, notify: u => updates.push(u), closed });
  await run.agentJoined();
  await run.childJoined();
  return { run, session, updates, closed };
}

it("finishes a spoken stop during a move even when fresher sound suppresses its speech", async () => {
  const c = await voiceCall({ model: ruleConversationalModel(), exchange: true });
  const releasing = Promise.withResolvers<void>();
  const released = Promise.withResolvers<void>();
  const sender = createBoardSender({ sessionId: c.id, senderId: "stop", transport: {
    async call(request) {
      if (request.type === "release" && c.call.pendingExchange?.transactionId === request.batchId) {
        releasing.resolve();
        await released.promise;
      }
      return c.receiver.handle(request);
    },
  } });
  const board = createBoardSpeech({ sender, now: c.clock.now, observe: snapshot => c.call.observeBoard(snapshot) });
  const session = controlSession();
  const closed = vi.fn(async () => {});
  const run = new VoiceCallRun(session as unknown as voice.AgentSession, c.call, { board, timers: c.clock.timers, notify: () => {}, closed });
  const context = new llm.ChatContext();
  const runNode = async () => readReply(await run.agent.llmNode(context, llm.ToolContext.empty(), {}));
  try {
    await run.childJoined();
    await runNode();
    const prompt = await c.call.child("How do I regroup?");
    await board.stage("prompt", prompt.boardCues!);
    await board.show(board.capture("prompt")!);
    const move = run.exchange((await c.calls.view(c.id))!.exchange!);
    await releasing.promise;
    context.addMessage({ role: "user", content: "I want to stop now." });
    const reply = runNode();
    await waitFor(() => c.store.rows()[0].live?.text.session.outcome?.reason === "child_stopped", "the saved stop");
    session.userState = "speaking";
    session.emit(voice.AgentSessionEventTypes.UserStateChanged, { newState: "speaking", oldState: "listening" });
    released.resolve();
    await Promise.all([reply, move]);
    await waitFor(() => closed.mock.calls.length === 1, "normal terminal closure");
    expect(await c.calls.view(c.id)).toMatchObject({ status: "ended", outcome: { reason: "child_stopped" } });
    expect(session.say).not.toHaveBeenCalled();
    expect(c.receiver.snapshot().events.filter(e => e.kind === "batch" && JSON.stringify(e.commands).includes("52 = 40 + 12"))).toHaveLength(1);
  } finally { released.resolve(); await run.hangUp(); }
});

it.each(["before", "after"])("retires an unsaid retry stale %s staging without losing the next plan", async timing => {
  const c = await voiceCall({ model: ruleConversationalModel(), exchange: true });
  const staged = Promise.withResolvers<void>();
  const answered = Promise.withResolvers<void>();
  let hold = false;
  const sender = createBoardSender({ sessionId: c.id, senderId: "retry", transport: {
    async call(request) {
      const response = c.receiver.handle(request);
      if (hold && request.type === "apply") {
        hold = false;
        staged.resolve();
        await answered.promise;
      }
      return response;
    },
  } });
  const board = createBoardSpeech({ sender, now: c.clock.now, observe: snapshot => c.call.observeBoard(snapshot) });
  const session = controlSession();
  const run = new VoiceCallRun(session as unknown as voice.AgentSession, c.call, { board, timers: c.clock.timers, notify: () => {} });
  const context = new llm.ChatContext();
  const runNode = async () => readReply(await run.agent.llmNode(context, llm.ToolContext.empty(), {}));
  try {
    await run.childJoined();
    await runNode();
    context.addMessage({ role: "user", content: "Show me how to regroup." });
    await runNode();
    await board.settled();
    expect(c.receiver.staged()).toHaveLength(2);
    if (timing === "after") hold = true;
    else {
      const update = c.store.update.bind(c.store);
      let blocked = false;
      vi.spyOn(c.store, "update").mockImplementation(async (id, revision, change) => {
        if (!blocked && change.live?.text.session.checkedExchange?.turns.length === 2) {
          blocked = true;
          staged.resolve();
          await answered.promise;
        }
        return update(id, revision, change);
      });
    }
    context.addMessage({ role: "user", content: "Show me how to regroup again." });
    const retry = runNode();
    await Promise.race([staged.promise, retry.then(() => { throw Error("retry did not reach its test gate"); })]);
    session.userState = "speaking";
    session.emit(voice.AgentSessionEventTypes.UserStateChanged, { newState: "speaking", oldState: "listening" });
    answered.resolve();
    await retry;
    await board.settled();
    await waitFor(() => c.call.session.checkedExchange?.turns[1]?.playback === "interrupted", "the abandoned retry to retire");
    expect(c.receiver.staged()).toEqual([]);
    expect(c.call.session.checkedExchange?.turns[1]?.actions.map(action => action.fate)).toEqual(["cancelled", "cancelled"]);
    expect(session.say).not.toHaveBeenCalled();
    session.userState = "listening";
    context.addMessage({ role: "user", content: "Could you show me how to regroup again?" });
    await runNode();
    await board.settled();
    expect(c.receiver.staged().map(b => b.batchId)).toEqual(c.call.session.checkedExchange?.turns[2].actions.map(action => action.batchId));
  } finally { answered.resolve(); await run.hangUp(); }
});

it("keeps the newer reply when the abandoned retry's cancel is rejected", async () => {
  const c = await voiceCall({ model: ruleConversationalModel(), exchange: true });
  const cancelling = Promise.withResolvers<void>();
  const unblock = Promise.withResolvers<void>();
  const retired = Promise.withResolvers<void>();
  let hold = false;
  let delayedScope = 0;
  let rejected = false;
  const sender = createBoardSender({ sessionId: c.id, senderId: "overlap", transport: {
    async call(request) {
      const delayed = hold && request.type === "cancel";
      if (delayed) {
        hold = false;
        delayedScope = request.scope.generation;
        cancelling.resolve();
        await unblock.promise;
      }
      const reply = c.receiver.handle(request);
      if (request.type === "stop" && delayedScope && request.scope.generation > delayedScope) retired.resolve();
      if (delayed) rejected = !reply.ok && reply.code === "invalid_request";
      return reply;
    },
  } });
  const board = createBoardSpeech({ sender, now: c.clock.now, observe: snapshot => c.call.observeBoard(snapshot) });
  const session = controlSession();
  const run = new VoiceCallRun(session as unknown as voice.AgentSession, c.call, { board, timers: c.clock.timers, notify() {} });
  const context = new llm.ChatContext();
  const runNode = async () => readReply(await run.agent.llmNode(context, llm.ToolContext.empty(), {}));
  try {
    await run.childJoined();
    await runNode();
    context.addMessage({ role: "user", content: "Show me how to regroup." });
    await runNode();
    await board.settled();
    expect(c.receiver.staged()).toHaveLength(2);
    hold = true;
    context.addMessage({ role: "user", content: "Show me how to regroup again." });
    const retry = runNode();
    await cancelling.promise;
    context.addMessage({ role: "user", content: "Could you show me how to regroup again?" });
    const newer = runNode();
    await retired.promise;
    unblock.resolve();
    const settled = await Promise.allSettled([retry, newer]);
    expect(rejected).toBe(true);
    expect(run.done).toBeNull();
    expect(settled.map(result => result.status)).toEqual(["fulfilled", "fulfilled"]);
    await board.settled();
    expect(c.call.session.checkedExchange!.turns.at(-1)!.actions).toHaveLength(2);
    expect(c.receiver.staged().map(b => b.batchId)).toEqual(c.call.session.checkedExchange!.turns.at(-1)!.actions.map(a => a.batchId));
  } finally {
    unblock.resolve();
    await run.hangUp();
  }
});

it.each([false, true])("stores the flag-off hard close while board status is held (already recovering=%s)", async alreadyRecovering => {
  const c = await voiceCall();
  const held = Promise.withResolvers<void>();
  const unblock = Promise.withResolvers<void>();
  const session = controlSession();
  const updates: CallUpdate[] = [];
  const closed = vi.fn(async () => {});
  const run = new VoiceCallRun(session as unknown as voice.AgentSession, c.call, {
    board: c.board, timers: c.clock.timers, notify: update => updates.push(update), closed,
  });
  let stops = 0;
  let resets = 0;
  let recovering: Promise<unknown> | undefined;
  try {
    await run.agentJoined();
    await run.childJoined();
    const context = new llm.ChatContext();
    await readReply(await run.agent.llmNode(context, llm.ToolContext.empty(), {}));
    context.addMessage({ role: "user", content: "I don't know." });
    await readReply(await run.agent.llmNode(context, llm.ToolContext.empty(), {}));
    await c.board.settled();
    expect(c.call.session.checkedExchange).toBeUndefined();
    expect(c.receiver.staged().length).toBeGreaterThan(0);
    const scope = c.receiver.scope()!;
    const confirmed = c.call.boardSnapshot;
    const transport = createMemoryTransport(c.receiver);
    c.sender.useTransport({ async call(request) {
      if (request.type === "stop") {
        stops++;
        throw Error("lost stop");
      }
      if (request.type === "status" && stops >= 3) {
        held.resolve();
        await unblock.promise;
      }
      if (request.type === "reset") resets++;
      return transport.call(request);
    } });
    if (alreadyRecovering) {
      recovering = c.board.interrupt(scope).catch(() => {});
      await held.promise;
    }
    session.userState = "speaking";
    await c.clock.advance(TIME_LIMITS.endAtMs / 1000);
    expect(session.close).toHaveBeenCalledOnce();
    expect(stops).toBe(3);
    await held.promise;
    await waitFor(() => c.store.rows()[0].status === "ended", "the durable close with recovery held", 750);
    expect(resets).toBe(0);
    expect(c.store.rows()[0]).toMatchObject({ outcome: { reason: "time_limit" }, boardHistory: { delivery: confirmed } });
    expect(c.connections.rows().slice(-2).map(event => event.kind)).toEqual(["child_left", "agent_left"]);
    expect(updates.at(-1)).toMatchObject({ ended: true });
    await c.clock.advance(BOARD_CLOSE_SETTLE_MS / 1000);
    expect(closed).toHaveBeenCalledOnce();
  } finally {
    unblock.resolve();
    await recovering;
    await run.hangUp();
  }
  if (!alreadyRecovering) expect(resets).toBe(0);
});

it.each(["deadline", "deadline with lost replies", "hang-up", "hang-up with a frozen desk", "hang-up with delayed leaves", "hang-up with an admitted turn"])("preserves receiver-shown work in the flag-off %s replay", async close => {
  const deadline = close.startsWith("deadline");
  const loseReplies = close !== "deadline";
  const enteredModel = Promise.withResolvers<void>();
  const releaseModel = Promise.withResolvers<void>();
  const model = ruleMayaModel();
  let holdModel = false;
  const spend = memorySpendStore();
  const c = await voiceCall({ model: { ...model, propose: async (input, signal) => {
    if (holdModel) { enteredModel.resolve(); await releaseModel.promise; }
    return model.propose(input, signal);
  } }, spend: clock => {
    const config = spendConfig({ MAYA_STT_USD_PER_MINUTE: "0.06" });
    return callSpend(createSpendLedger({ store: spend, clock, config, zone: async () => "America/Vancouver" }), { clock, newId: () => crypto.randomUUID() });
  } });
  const shown = Promise.withResolvers<void>();
  const unblock = Promise.withResolvers<void>();
  const session = controlSession();
  const closed = vi.fn(async () => {});
  const updates: CallUpdate[] = [];
  let frozen = false;
  let transferId = 0;
  const handle = boardRpcHandler(c.receiver, {
    allowed: identity => identity === "worker" && (!updates.at(-1)?.ended || updates.at(-1)?.boardDrain === true),
    readOnly: () => frozen || updates.at(-1)?.ended === true,
    changed() {},
  });
  const rpc = boardRpcTransport({ performRpc: async ({ payload }) => handle("worker", payload) }, "child", () => String(++transferId));
  const run = new VoiceCallRun(session as unknown as voice.AgentSession, c.call, {
    board: c.board, timers: c.clock.timers, notify: update => updates.push(update), closed,
  });
  let releaseTries = 0;
  let stopTries = 0;
  let resets = 0;
  let closing: Promise<void> | null = null;
  let admitted: Promise<unknown> | undefined;
  try {
    await run.agentJoined();
    await run.childJoined();
    const context = new llm.ChatContext();
    await readReply(await run.agent.llmNode(context, llm.ToolContext.empty(), {}));
    context.addMessage({ role: "user", content: "I don't know." });
    await readReply(await run.agent.llmNode(context, llm.ToolContext.empty(), {}));
    await c.board.settled();
    expect(c.call.session.checkedExchange).toBeUndefined();
    const scope = c.receiver.scope()!;
    const batchId = c.receiver.staged()[0].batchId;
    c.sender.useTransport({ async call(request) {
      if (request.type === "stop") stopTries++;
      const response = await rpc.call(request);
      if (request.type === "reset") resets++;
      if (request.type === "stop") {
        if (loseReplies) throw Error("lost stop reply");
      }
      if (request.type === "release" && request.batchId === batchId) {
        releaseTries++;
        shown.resolve();
        await unblock.promise;
        if (loseReplies) throw Error("lost release reply");
      }
      return response;
    } });
    await c.board.timing(scope, 10_000, 100, "word");
    const release = c.board.played(scope, 100).catch(() => {});
    await shown.promise;
    const observed = (id: string) => c.store.rows()[0].boardHistory?.delivery?.events.filter(e => e.kind === "batch" && e.batchId === id) ?? [];
    expect(c.receiver.snapshot().events.filter(e => e.kind === "batch" && e.batchId === batchId)).toHaveLength(1);
    expect(observed(batchId)).toHaveLength(0);
    if (deadline) {
      session.userState = "speaking";
      await c.clock.advance(TIME_LIMITS.endAtMs / 1000);
      closing = run.done;
      await waitFor(() => updates.at(-1)?.ended === true, "the persisted deadline before the release ACK", 750);
      expect(updates.at(-1)?.boardDrain).toBe(true);
      expect(observed(batchId)).toHaveLength(0);
    } else {
      await c.clock.advance(1);
      if (close === "hang-up with delayed leaves") {
        const append = c.connections.append;
        vi.spyOn(c.connections, "append").mockImplementation(async (event, revision) => {
          if (event.kind === "child_left") await unblock.promise;
          return append(event, revision);
        });
      }
      if (close === "hang-up with an admitted turn") {
        holdModel = true;
        admitted = c.call.child("I got 56.");
        await enteredModel.promise;
      }
      frozen = close === "hang-up with a frozen desk";
      closing = run.hangUp();
      await waitFor(() => stopTries >= 3, "the lost hang-up stop replies", 750);
      releaseModel.resolve();
      await admitted;
      await c.clock.advance(7);
    }
    expect(session.close).toHaveBeenCalledOnce();
    const ended = c.store.rows()[0];
    unblock.resolve();
    await release;
    await closing;
    expect(closed).toHaveBeenCalledOnce();
    expect(observed(batchId)).toHaveLength(1);
    const replay = await c.calls.view(c.id);
    expect(replay?.batches.filter(b => b.transactionId === batchId)).toHaveLength(1);
    expect(replay?.outcome?.reason).toBe(deadline ? "time_limit" : "child_stopped");
    if (deadline) {
      expect(c.store.rows()[0]).toMatchObject({ endedAt: ended.endedAt, trace: ended.trace, outcome: ended.outcome, learningEventId: ended.learningEventId });
      expect(releaseTries).toBe(1);
      expect(resets).toBe(0);
    } else {
      expect(resets).toBe(frozen ? 0 : 1);
      expect(updates.at(-1)?.boardDrain).toBeUndefined();
      expect({
        connectedSeconds: c.store.rows()[0].connectedSeconds,
        speechToText: spend.rows().filter(row => row.what === "speech_to_text").map(row => row.cost),
      }).toEqual({ connectedSeconds: 1, speechToText: [1_400] });
    }
  } finally {
    releaseModel.resolve();
    unblock.resolve();
    await admitted;
    await (closing ?? run.hangUp());
  }
});

it.each([true, false])("recovers a reachable board after all stop replies are lost (stop arrived=%s)", async delivered => {
  let drop = false;
  let stops = 0;
  let now = () => T0;
  const speaker = new HeldSpeaker(() => now());
  const c = await voiceCall({ model: ruleConversationalModel(), board: true, exchange: true, speaker, timestamps: true,
    transport: receiver => ({ async call(request) {
      if (request.type === "stop" && drop) {
        if (delivered) receiver.handle(request);
        stops++;
        throw Error("synthetic lost stop reply");
      }
      return receiver.handle(request);
    } }),
  });
  now = c.clock.now;
  try {
    await c.run.childJoined();
    await waitFor(() => c.session.agentState === "listening" && c.said().length > 0, "opening");
    speaker.held = true;
    await c.childSays("Show me how to regroup.");
    await waitFor(() => speaker.pendingPlayoutSegments > 0, "demonstration playout");
    await c.clock.play(40);
    const [shown, future] = c.call.session.checkedExchange!.turns[0].actions;
    await waitFor(() => c.call.session.checkedExchange?.turns[0].actions[0].fate === "shown", "completed first batch");
    const previousEpoch = c.receiver.epoch();
    const old = c.receiver.scope()!;
    const replyStart = c.said().length;
    drop = true;
    expect(c.speech.say("Show me how to regroup again.")).toBe(true);
    await waitFor(() => c.said().length > replyStart && c.receiver.epoch() > previousEpoch, "the next reply after reconciliation", 2500);
    expect(stops).toBeGreaterThanOrEqual(3);
    expect(c.run.done).toBeNull();
    expect(c.call.session.checkedExchange?.turns[0]).toMatchObject({ actions: [{ fate: "shown" }, { fate: "cancelled" }] });
    expect(c.receiver.snapshot().events.filter(e => e.kind === "batch" && e.batchId === shown.batchId)).toHaveLength(1);
    expect(c.receiver.handle({ type: "release", scope: old, epoch: previousEpoch, batchId: future.batchId, sessionId: c.id }))
      .toMatchObject({ ok: false, code: "stale_epoch" });
  } finally { drop = false; speaker.finishPlayback(); }
});

describe("R408 controlled probes through public interfaces", () => {
  it.each([true, false])("records a provider failure without its private diagnostic, recoverable=%s", async recoverable => {
    const c = await voiceCall(); const r = await controlledRun(c);
    const observer = vi.fn(); setProductObserver(observer);
    r.session.emit(voice.AgentSessionEventTypes.Error, voice.createErrorEvent({ type: "stt_error", timestamp: T0, label: "PRIVATE", error: Error("PRIVATE"), recoverable }));
    expect(observer).toHaveBeenCalledWith({ code: recoverable ? "maya.voice_provider_retry" : "maya.voice_provider_failed", attributes: { callId: c.id, step: "voice" } });
    expect(JSON.stringify(observer.mock.calls)).not.toContain("PRIVATE");
    if (recoverable) expect(r.run.done).toBeNull();
    else await r.run.done;
    await r.run.hangUp();
  });
  it("R408-1 preflight.ts: commits only the completed corrected child turn, once", async () => {
    const speech = new ProbeSTT();
    const c = await voiceCall({ speech });
    await c.run.childJoined();
    await waitFor(() => c.said().length > 0 && c.session.agentState === "listening", "opening");
    speech.send(stt.SpeechEventType.START_OF_SPEECH);
    speech.send(stt.SpeechEventType.PREFLIGHT_TRANSCRIPT, "I got 56.");
    await new Promise(r => setTimeout(r, 250));
    expect((await c.calls.view(c.id))!.transcript.filter(l => l.speaker === "child")).toEqual([]);
    speech.send(stt.SpeechEventType.FINAL_TRANSCRIPT, "I got 66.", 0.3);
    speech.send(stt.SpeechEventType.END_OF_SPEECH);
    await waitFor(() => c.said().length > 1, "corrected reply");
    await c.call.settled();
    expect((await c.calls.view(c.id))!.transcript.filter(l => l.speaker === "child").map(l => l.text)).toEqual(["I got 66."]);
  });

  it("R408-2 ending.ts: stores and announces the terminal outcome only after final playout", async () => {
    const speaker = new HeldSpeaker();
    const c = await voiceCall({ speaker });
    await c.run.childJoined();
    await waitFor(() => c.said().length > 0 && c.session.agentState === "listening", "opening");
    for (const text of ["66", "I wrote it."]) {
      await c.childSays(text);
      await waitFor(() => c.session.agentState === "listening", "playout");
    }
    speaker.held = true;
    await c.childSays("yes");
    await waitFor(() => c.call.ended, "terminal turn");
    expect((await c.calls.view(c.id))!.status).toBe("live");
    expect(c.updates.some(u => u.ended)).toBe(false);
    expect(c.closed).not.toHaveBeenCalled();
    await c.clock.advance(5);
    speaker.finishPlayback();
    await waitFor(() => c.closed.mock.calls.length === 1, "terminal update");
    expect((await c.calls.view(c.id))!.status).toBe("ended");
    expect(c.store.rows()[0].connectedSeconds).toBe(5);
  });

  it("R408-14 replays the restored terminal words through AgentSession before terminal persistence", async () => {
    const c = await voiceCall();
    await c.call.start();
    let final = await c.call.child("66");
    for (const text of ["I wrote it.", "yes"]) final = await c.call.child(text);
    expect(c.call.ended).toBe(true);
    const opened = await c.calls.openVoice(c.id, { speechToText: "fake", voice: "fake" }, null);
    if (!opened.ok) throw new Error(opened.error);
    const config = voiceProviders({});
    if (!config.ok) throw new Error("fake providers");
    const providers = await makeProviders(config, { fakeMsPerChar: 1 });
    let flushed!: () => void;
    const ready = new Promise<void>(resolve => { flushed = resolve; });
    class RestoreSpeaker extends HeldSpeaker {
      override flush() { if (this.held) flushed(); super.flush(); }
    }
    const speaker = new RestoreSpeaker();
    speaker.held = true;
    const session = voiceSession(providers, { endpointingMs: 20, aecWarmupDuration: 0 });
    const microphone = new SilentMicrophone();
    session.input.audio = microphone;
    session.output.audio = speaker;
    const updates: CallUpdate[] = [];
    let complete!: () => void;
    const done = new Promise<void>(resolve => { complete = resolve; });
    const closed = vi.fn(async () => { complete(); });
    const run = new VoiceCallRun(session, opened.call, { timers: c.clock.timers, notify: u => updates.push(u), closed });
    try {
      await run.agentJoined();
      await session.start({ agent: run.agent });
      microphone.push();
      const say = vi.spyOn(session, "say");
      const generate = vi.spyOn(session, "generateReply");
      await run.childJoined();
      await ready;
      expect(say).toHaveBeenCalledOnce();
      expect(say.mock.calls[0][0]).toBe(final.say.join(" "));
      expect(generate).not.toHaveBeenCalled();
      expect(c.store.rows()[0].status).toBe("live");
      expect(updates.some(u => u.ended)).toBe(false);
      expect(closed).not.toHaveBeenCalled();
      speaker.finishPlayback();
      await done;
      expect(c.store.rows()[0].status).toBe("ended");
      expect(updates.filter(u => u.ended)).toHaveLength(1);
      expect(closed).toHaveBeenCalledOnce();
    } finally { speaker.finishPlayback(); await run.hangUp(); }
  });

  it("R408-6 probe.ts: closes a fatal session with a technical outcome", async () => {
    const c = await voiceCall();
    const r = await controlledRun(c);
    await r.run.agent.llmNode(new llm.ChatContext(), {} as Parameters<VoiceCallRun["agent"]["llmNode"]>[1], {});
    r.session.emit(voice.AgentSessionEventTypes.Close, { reason: "error", error: new Error("provider failed") });
    expect(r.run.done).not.toBeNull();
    await r.run.done;
    expect((await c.calls.view(c.id))!.outcome?.reason).toBe("technical_issue");
    expect(r.closed).toHaveBeenCalledOnce();
  });

  it.each(["conflict", "exception"])("R408-7 more.ts: stops media and reports a failed save (%s)", async failure => {
    const c = await voiceCall();
    const r = await controlledRun(c);
    c.seams.store.update = async () => { if (failure === "exception") throw new Error("database unavailable"); return false; };
    const speech = await r.run.agent.llmNode(new llm.ChatContext(), {} as Parameters<VoiceCallRun["agent"]["llmNode"]>[1], {});
    await c.call.settled();
    expect(speech).toBeNull();
    await waitFor(() => r.closed.mock.calls.length === 1, "lost writer closed");
    expect(r.session.close).toHaveBeenCalled();
    if (failure === "exception") expect(r.updates.at(-1)).toMatchObject({ error: "technical_issue", segment: r.run.segment });
    else expect(r.updates).toEqual([]);
  });

  it("R408-8 probe.ts: rejoin during the leave save cannot end a healthy call", async () => {
    const c = await voiceCall();
    const r = await controlledRun(c);
    await r.run.agent.llmNode(new llm.ChatContext(), {} as Parameters<VoiceCallRun["agent"]["llmNode"]>[1], {});
    let release!: () => void;
    const blocked = new Promise<void>(resolve => release = resolve);
    const connection = c.call.connection.bind(c.call);
    c.call.connection = async kind => { if (kind === "child_left") await blocked; return connection(kind); };
    const leaving = r.run.childLeft("dropped");
    await r.run.childJoined();
    release();
    await leaving;
    r.session.userState = "speaking";
    await c.clock.advance(31);
    await new Promise(resolve => setTimeout(resolve, 20));
    await c.call.settled();
    expect(r.closed).not.toHaveBeenCalled();
    await r.run.hangUp();
  });

  it("R408-9 more.ts: pauses silence while the child is absent for less than the grace period", async () => {
    const c = await voiceCall();
    const r = await controlledRun(c);
    await r.run.agent.llmNode(new llm.ChatContext(), {} as Parameters<VoiceCallRun["agent"]["llmNode"]>[1], {});
    await c.clock.advance(15);
    await r.run.tick();
    await c.clock.advance(5);
    await r.run.childLeft("dropped");
    await c.clock.advance(25);
    await r.run.tick();
    expect(c.call.ended).toBe(false);
    await r.run.hangUp();
  });

  it("R408-10 probe.ts: schedules session timers when a worker restores a started call", async () => {
    const c = await voiceCall();
    await c.call.start();
    await c.call.settled();
    const reopened = await c.calls.openVoice(c.id, { speechToText: "fake", voice: "fake" }, "Leah");
    if (!reopened.ok) throw new Error(reopened.error);
    const r = await controlledRun(c, reopened.call);
    await c.clock.advance(16);
    expect(r.session.say).toHaveBeenCalled();
    await r.run.hangUp();
  });

  it.each(["child", "maya", "model"])("R408-12 probe.ts: enforces the deadline during continuous %s activity", async activity => {
    const c = await voiceCall();
    const r = await controlledRun(c);
    await r.run.agent.llmNode(new llm.ChatContext(), {} as Parameters<VoiceCallRun["agent"]["llmNode"]>[1], {});
    if (activity === "child") r.session.userState = "speaking";
    if (activity === "maya") r.session.agentState = "speaking";
    if (activity === "model") r.session.agentState = "thinking";
    await c.clock.advance(TIME_LIMITS.endAtMs / 1000);
    expect(r.session.close).toHaveBeenCalled();
    await waitFor(() => r.closed.mock.calls.length === 1, "hard deadline");
    expect((await c.calls.view(c.id))!.outcome?.reason).toBe("time_limit");
    expect(r.session.close).toHaveBeenCalled();
  });
});


it("R408-12: closes while the model has a real unfinished child turn, and refuses its late output", async () => {
  const model = ruleMayaModel();
  let block = false;
  let entered = false;
  let release!: () => void;
  const pending = new Promise<void>(resolve => release = resolve);
  const c = await voiceCall({ model: { ...model, propose: async (input, signal) => {
    if (block) { entered = true; await pending; }
    return model.propose(input, signal);
  } } });
  const r = await controlledRun(c);
  await r.run.agent.llmNode(new llm.ChatContext(), {} as Parameters<VoiceCallRun["agent"]["llmNode"]>[1], {});
  block = true;
  const child = c.call.child("I got 56.");
  await waitFor(() => entered, "model input");
  r.session.agentState = "thinking";
  let revision = 0;
  try {
    await c.clock.advance(TIME_LIMITS.endAtMs / 1000);
    expect(r.session.close).toHaveBeenCalled();
    await waitFor(() => r.closed.mock.calls.length === 1, "deadline during model work");
    const ended = (await c.calls.view(c.id))!;
    expect(ended.outcome?.reason).toBe("time_limit");
    revision = ended.revision;
  } finally { release(); }
  expect((await child).say).toEqual([]);
  expect((await c.calls.view(c.id))!.revision).toBe(revision);
});

it("R408-7: a save failure inside the real speech pipeline closes without waiting on its own speech", async () => {
  const c = await voiceCall();
  c.seams.store.update = async () => { throw new Error("synthetic persistence failure"); };
  await c.run.childJoined();
  await waitFor(() => c.call.lost, "lost writer");
  expect(c.run.done).not.toBeNull();
  await waitFor(() => c.closed.mock.calls.length === 1, "real pipeline lost writer");
  expect(c.said()).toEqual([]);
  expect(c.updates.at(-1)).toMatchObject({ error: "technical_issue" });
});

it("R408-6: a fatal close saves an outcome while a model turn is unfinished", async () => {
  const model = ruleMayaModel();
  let block = false;
  let entered = false;
  let release!: () => void;
  const pending = new Promise<void>(resolve => release = resolve);
  const c = await voiceCall({ model: { ...model, propose: async (input, signal) => {
    if (block) { entered = true; await pending; }
    return model.propose(input, signal);
  } } });
  const r = await controlledRun(c);
  await r.run.agent.llmNode(new llm.ChatContext(), {} as Parameters<VoiceCallRun["agent"]["llmNode"]>[1], {});
  block = true;
  const child = c.call.child("I got 56.");
  await waitFor(() => entered, "model input");
  try {
    r.session.emit(voice.AgentSessionEventTypes.Close, { reason: "error" });
    await new Promise<void>(resolve => setImmediate(resolve));
    expect((await c.calls.view(c.id))!.outcome?.reason).toBe("technical_issue");
    expect(r.closed).toHaveBeenCalledOnce();
  } finally { release(); }
  expect((await child).say).toEqual([]);
});

it("R408-12: bounds an unfinished opening before the first turn can be saved", async () => {
  const model = ruleMayaModel();
  let entered = false;
  let release!: () => void;
  const pending = new Promise<void>(resolve => release = resolve);
  const c = await voiceCall({ model: { ...model, propose: async (input, signal) => {
    entered = true;
    await pending;
    return model.propose(input, signal);
  } } });
  const r = await controlledRun(c);
  const opening = r.run.agent.llmNode(new llm.ChatContext(), {} as Parameters<VoiceCallRun["agent"]["llmNode"]>[1], {});
  await waitFor(() => entered, "opening model input");
  try {
    await c.clock.advance(TIME_LIMITS.endAtMs / 1000);
    expect(r.session.close).toHaveBeenCalled();
    await r.run.done;
    expect((await c.calls.view(c.id))!.status).toBe("ended");
    expect(c.store.rows()[0].learningEventId).toBeNull();
  } finally { release(); }
  expect(await opening).toBeNull();
});


it.each([true, false])("#1139 #329 carries accepted controller batches through AgentSession with fake timestamps %s", async timestamps => {
  const c = await voiceCall({ board: true, timestamps, measureBaseline: true });
  await c.run.childJoined();
  await waitFor(() => c.session.agentState === "listening" && c.said().length > 0, "opening playout");
  await c.board.settled();
  const openingCues = c.samples.length;
  await c.childSays("I don't know.");
  await waitFor(() => c.session.agentState === "listening", "example playout");
  await c.board.settled();
  expect(c.samples.length).toBeGreaterThan(1);
  expect(c.samples.map(s => s.source)).toEqual(c.samples.map(() => timestamps ? "word" : "sentence"));
  expect(c.samples.every(s => s.state === "shown")).toBe(true);
  expect(c.receiver.staged()).toEqual([]);
  expect(c.turns).toHaveLength(1);
  const [turn] = c.turns;
  const cues = c.samples.filter(cue => {
    const owner = c.boardPlans.get(cue.utteranceId);
    return owner && owner.turnId === turn.turnId && owner.batchIds.includes(cue.batchId);
  });
  expect(cues.length).toBeGreaterThan(0);
  expect(cues).toEqual(c.samples.slice(openingCues));
  const row = voiceBaselineTurn({
    evidence: "simulated", mode: "voice", turnType: "complex", provider: timestamps ? "fake-word-cues" : "fake-sentence-cues",
    device: "none", network: "in-process", concurrency: 1,
  }, turn, null, cues);
  expect(row).toMatchObject({ outcome: "completed", ms: { boardCueAcknowledgement: expect.any(Number) }, counts: { boardCues: cues.length } });
  if (process.env.MAYA_BASELINE_LOG === "on") logBaselineTurn(row);
});


// Call 01f456de (2026-11-13): an answer whose voice gave no audio left its batch staged and unseen, and the next plan,
// built on that batch, was refused, which ended the call. Now the batch is shown, the worker log says so, and the words
// are said once more.
it("a reply with no audio shows its board, is said once more, and the call goes on", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    const c = await voiceCall({ board: true });
    await c.run.childJoined();
    await waitFor(() => c.session.agentState === "listening" && c.said().length > 0, "opening playout");
    await c.board.settled();
    c.tts.silentNext = 1;
    const reply = await c.childSays("I don't know.");
    await waitFor(() => c.session.agentState === "listening", "the words said again");
    await c.board.settled();
    expect(c.tts.silenced).toHaveLength(1);
    expect(reply.startsWith(c.tts.silenced[0])).toBe(true);
    const stored = (await c.calls.view(c.id))!.transcript.filter(l => l.speaker === "maya").at(-1)!.text.replaceAll("{name}", "Leah");
    expect(c.said().join(" ").split(spokenMath(stored)).length - 1).toBe(1);
    expect(warn).toHaveBeenCalledWith("[maya voice] speech had no audio", c.id, expect.objectContaining({ heardAny: false, repeat: false }));
    // The reply's batches are on the child's board, as Maya's saved board says, and none is left waiting.
    const saved = c.store.rows()[0].live!.text.board.map(b => b.transactionId);
    expect(saved.length).toBeGreaterThan(0);
    const shown = c.receiver.snapshot().events.flatMap(e => e.kind === "batch" ? [e.batchId] : []);
    expect(shown).toEqual(saved);
    expect(c.receiver.staged()).toEqual([]);
    expect((await c.calls.view(c.id))!.status).toBe("live");
    await c.childSays("Is it 66?");
    expect((await c.calls.view(c.id))!.status).toBe("live");
  } finally { warn.mockRestore(); }
});

it("logs the signals of each final transcript, never its words", async () => {
  const info = vi.spyOn(console, "info").mockImplementation(() => {});
  try {
    const c = await voiceCall();
    await c.run.childJoined();
    await waitFor(() => c.said().length > 0, "Maya's opening");
    await c.childSays("I got 56.", { confidence: 0.61 });
    const lines = info.mock.calls.filter(call => call[0] === "[maya voice] final transcript");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toEqual(["[maya voice] final transcript", c.id, expect.objectContaining({ words: 3, confidence: 0.61, vadSpeechMs: null, peakDbfs: -120 })]);
    expect(JSON.stringify(lines)).not.toMatch(/56|got/);
  } finally { info.mockRestore(); }
});

it("a reply whose words are silent twice is said again only once, and the call goes on", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    const c = await voiceCall({ board: true });
    await c.run.childJoined();
    await waitFor(() => c.session.agentState === "listening" && c.said().length > 0, "opening playout");
    await c.board.settled();
    const before = c.said().length;
    c.tts.silentNext = 2;
    // The reply and its one repeat both give no audio.
    expect(c.speech.say("I don't know.")).toBe(true);
    await waitFor(() => c.tts.silenced.length === 2 && warn.mock.calls.some(call => (call[2] as { repeat?: boolean } | undefined)?.repeat === true), "the second silence");
    await waitFor(() => c.session.agentState === "listening", "the repeat's end");
    await c.board.settled();
    expect(c.tts.silenced[1]).toBe(c.tts.silenced[0]);
    expect(c.said().length).toBe(before);
    expect(c.receiver.staged()).toEqual([]);
    expect((await c.calls.view(c.id))!.status).toBe("live");
    // The child is answered as usual after it.
    await c.childSays("Is it 66?");
  } finally { warn.mockRestore(); }
});

it("R450-2 keeps a dropped call recoverable when the board stop cannot reach the child", async () => {
  const c = await voiceCall();
  const session = controlSession();
  const run = new VoiceCallRun(session as unknown as voice.AgentSession, c.call, { board: c.board, timers: c.clock.timers, notify() {} });
  await run.childJoined();
  await run.agent.llmNode(new llm.ChatContext(), {} as Parameters<VoiceCallRun["agent"]["llmNode"]>[1], {});
  const context = new llm.ChatContext();
  context.addMessage({ role: "user", content: "I don't know." });
  await readReply(await run.agent.llmNode(context, {} as Parameters<VoiceCallRun["agent"]["llmNode"]>[1], {}));
  // The words go to the voice while the plan goes out; the plan is on the receiver before any of their audio plays.
  await c.board.settled();
  const pending = c.receiver.staged();
  expect(pending).toHaveLength(3);
  const scope = c.board.capture(pending[0].utteranceId!)!;
  c.sender.useTransport({ call: async () => { throw new Error("recipient disconnected"); } });
  await run.childLeft("dropped");
  await c.clock.advance(10);
  expect(run.done).toBeNull();
  expect((await c.calls.view(c.id))!.status).toBe("live");
  c.sender.useTransport(createMemoryTransport(c.receiver));
  await run.childJoined();
  await c.board.played(scope, 1000);
  await c.board.settled();
  expect(c.receiver.staged()).toEqual([]);
  expect(c.receiver.snapshot().events).toContainEqual(expect.objectContaining({ kind: "cancelled", batchIds: pending.map(b => b.batchId) }));
  expect(c.store.rows()[0].boardHistory?.delivery?.events).toEqual(c.receiver.snapshot().events);
  expect(run.done).toBeNull();
  await run.hangUp();
});


it("R450-8 old playback completion cannot cancel the next controller turn", async () => {
  const c = await voiceCall();
  const native = new voice.ParticipantAudioOutput({ localParticipant: { publishTrack: async () => ({ sid: "local", waitForSubscription: async () => {} }) } } as unknown as ConstructorParameters<typeof voice.ParticipantAudioOutput>[0],
    { sampleRate: 24000, numChannels: 1, queueSizeMs: 100, trackPublishOptions: new TrackPublishOptions() });
  await native.start(new AbortController().signal);
  const stages = vi.spyOn(c.board, "stage");
  const session = Object.assign(controlSession(), { output: { audio: native } });
  const run = new VoiceCallRun(session as unknown as voice.AgentSession, c.call, { board: c.board, timers: c.clock.timers, notify() {} });
  run.attachBoardAudio();
  try {
    await run.childJoined();
    await run.agent.llmNode(new llm.ChatContext(), {} as Parameters<VoiceCallRun["agent"]["llmNode"]>[1], {});
    const output = session.output.audio;
    const oldScope = c.board.capture(stages.mock.calls.at(-1)![0])!;
    const frame = new AudioFrame(new Int16Array(2400), 24000, 1, 2400);
    frame.userdata["unica.maya.speechScope"] = oldScope;
    await output.captureFrame(frame);
    output.flush();
    session.emit(voice.AgentSessionEventTypes.UserStateChanged, { newState: "speaking" });
    const context = new llm.ChatContext();
    context.addMessage({ role: "user", content: "I don't know." });
    await readReply(await run.agent.llmNode(context, {} as Parameters<VoiceCallRun["agent"]["llmNode"]>[1], {}));
    await c.board.settled();
    const expected = c.receiver.staged().map(b => b.batchId);
    expect(expected).toHaveLength(3);
    const newScope = c.board.capture(stages.mock.calls.at(-1)![0])!;
    output.clearBuffer();
    await output.waitForPlayout();
    await c.board.settled();
    expect(c.receiver.staged().map(b => b.batchId)).toEqual(expected);
    expect(c.board.owns(newScope)).toBe(true);
    await c.board.timing(newScope, 1000, 100, "word");
    await c.board.played(newScope, 100);
    expect(c.receiver.staged()).toEqual([]);
  } finally { await run.hangUp(); native.clearBuffer(); await native.close(); }
});

it("R450-9 an interrupt before native forwarding leaves no unmatched playback segment", async () => {
  const c = await voiceCall();
  const native = new voice.ParticipantAudioOutput({ localParticipant: { publishTrack: async () => ({ sid: "local", waitForSubscription: async () => {} }) } } as unknown as ConstructorParameters<typeof voice.ParticipantAudioOutput>[0],
    { sampleRate: 24000, numChannels: 1, queueSizeMs: 100, trackPublishOptions: new TrackPublishOptions() });
  await native.start(new AbortController().signal);
  const stages = vi.spyOn(c.board, "stage");
  const session = Object.assign(controlSession(), { output: { audio: native } });
  const run = new VoiceCallRun(session as unknown as voice.AgentSession, c.call, { board: c.board, timers: c.clock.timers, notify() {} });
  run.attachBoardAudio();
  try {
    await run.childJoined();
    await run.agent.llmNode(new llm.ChatContext(), {} as Parameters<VoiceCallRun["agent"]["llmNode"]>[1], {});
    const output = session.output.audio;
    const frame = new AudioFrame(new Int16Array(2400), 24000, 1, 2400);
    frame.userdata["unica.maya.speechScope"] = c.board.capture(stages.mock.calls.at(-1)![0])!;
    const capture = output.captureFrame(frame);
    session.emit(voice.AgentSessionEventTypes.UserStateChanged, { newState: "speaking" });
    await capture;
    output.clearBuffer();
    expect(native.capturedPlayoutSegments).toBe(0);
    expect(output.capturedPlayoutSegments).toBe(native.capturedPlayoutSegments);
    expect(output.pendingPlayoutSegments).toBe(0);
    await output.waitForPlayout();
    const context = new llm.ChatContext();
    context.addMessage({ role: "user", content: "I don't know." });
    await readReply(await run.agent.llmNode(context, {} as Parameters<VoiceCallRun["agent"]["llmNode"]>[1], {}));
    await c.board.settled();
    expect(c.receiver.staged()).toHaveLength(3);
    const scope = c.board.capture(stages.mock.calls.at(-1)![0])!;
    const next = new AudioFrame(new Int16Array(2400), 24000, 1, 2400);
    next.userdata["unica.maya.speechScope"] = scope;
    await output.captureFrame(next);
    output.flush();
    await native.waitForPlayout();
    expect(output.capturedPlayoutSegments).toBe(native.capturedPlayoutSegments);
    expect(output.pendingPlayoutSegments).toBe(native.pendingPlayoutSegments);
    expect(output.pendingPlayoutSegments).toBe(0);
    await output.waitForPlayout();
    expect(c.board.owns(scope)).toBe(true);
  } finally { await run.hangUp(); native.clearBuffer(); await native.close(); }
});

describe("Maya's spending in a voice call (review of PR #640)", () => {
  const WEEK = "2026-10-26";
  const MONTH = "2026-11-01";
  function spending() {
    const store = memorySpendStore({ clock: () => now() });
    let now = () => T0;
    let n = 0;
    const make = (clock: () => number) => {
      now = clock;
      const ledger = createSpendLedger({ store, clock, config: spendConfig({}), zone: async () => "America/Vancouver" });
      return callSpend(ledger, { clock, newId: () => `10000000-0000-4000-8000-${String(++n).padStart(12, "0")}` });
    };
    return { store, make };
  }

  it("counts the voice at the provider, for the words the child hears", async () => {
    const s = spending();
    const c = await voiceCall({ spend: s.make });
    const spoken = vi.spyOn(c.call, "spoken");
    await c.run.childJoined();
    await waitFor(() => c.said().length === 1, "Maya's opening");
    await waitFor(() => s.store.rows().some((r) => r.what === "voice"), "the voice's count");
    expect(spoken).toHaveBeenCalledWith(c.said()[0]);
    const voice = s.store.rows().filter((r) => r.what === "voice");
    expect(voice).toHaveLength(1);
    expect(voice[0].cost).toBeGreaterThan(0);
  });

  it("renews speech-to-text on its own timer while nobody speaks", async () => {
    const s = spending();
    const c = await voiceCall({ spend: s.make });
    const meter = vi.spyOn(c.call, "meter");
    await c.run.childJoined();
    await waitFor(() => c.said().length === 1, "Maya's opening");
    // Less than the silence the session allows: no input and no turn in this time would be enough on its own.
    await c.clock.advance(45);
    expect(meter.mock.calls.length).toBeGreaterThanOrEqual(4);
    expect(s.store.rows().filter((r) => r.what === "speech_to_text").length).toBeGreaterThanOrEqual(2);
  });

  it("stops the timer's renewals when the call ends", async () => {
    const s = spending();
    const c = await voiceCall({ spend: s.make });
    await c.run.childJoined();
    await waitFor(() => c.said().length === 1, "Maya's opening");
    await c.run.finish({ reason: "child_stopped" });
    const blocks = s.store.rows().filter((r) => r.what === "speech_to_text");
    expect(blocks.every((r) => r.settled)).toBe(true);
    await c.clock.advance(120);
    expect(s.store.rows().filter((r) => r.what === "speech_to_text")).toHaveLength(blocks.length);
  });

  it("says code's closing line and ends when the week runs out during silence", async () => {
    const s = spending();
    const c = await voiceCall({ spend: (clock) => {
      const spend = s.make(clock);
      return { ...spend, voice: (call) => spend.voice({ ...call, kind: "chat" }) };
    } });
    await c.run.childJoined();
    await waitFor(() => c.said().length === 1, "Maya's opening");
    s.store.spent({ charge: "child", parentId: PARENT, childId: CHILD, week: WEEK, month: MONTH }, WEEK_MICROS);
    await c.clock.advance(60);
    await waitFor(() => c.said().join(" ").includes(SPEND_CLOSE.week_used.line), "the closing line");
  });
});
