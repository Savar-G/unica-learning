import { ReadableStream, type ReadableStreamDefaultController } from "node:stream/web";
import { EventEmitter } from "node:events";
import { initializeLogger, normalizeLanguage, stt, voice } from "@livekit/agents";
import { AudioFrame } from "@livekit/rtc-node";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBoardReceiver, createBoardSender } from "@/lib/board-protocol";
import { createMemoryTransport } from "@/lib/board-protocol-memory";
import { createBoardSpeech } from "@/lib/board-speech";
import { templateSkills } from "@/lib/assessment";
import { learningEvents } from "@/lib/learning-events";
import { memoryLearningEventStore } from "@/lib/learning-events-memory";
import { memoryWordingHistoryStore, PROPOSAL_VERSION } from "@/lib/maya";
import { mayaCalls, type CallSeams } from "@/lib/maya-call";
import { memoryCallStore, memoryConnectionLog } from "@/lib/maya-call-memory";
import type { MayaModel } from "@/lib/maya-model";
import { ruleMayaModel } from "@/lib/maya-model-fake";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { fakeTalkReviewer } from "@/lib/maya-talk-review";
import { voiceProviders } from "@/lib/maya-voice";
import { ACK_LIMIT_MS, ACK_PHRASES } from "@/lib/maya-voice-ack";
import type { QuestionPackage } from "@/lib/question-package";
import { VoiceCallRun, voiceSession, type Timers } from "./agent";
import { FakeTTS } from "./fake-providers";
import { makeProviders } from "./providers";
import { TURN_PARTS, voiceTurnReport, type VoiceTurnSample } from "./turn-timing";

// Maya's silence (#532), through LiveKit's own pipeline with the fake speech-to-text and voice: no room, no account, no
// network. The system clock is frozen and only the test moves it, so every time below is exact. The fakes prove the
// order of events and the sums. They prove nothing about how long a real model, speech-to-text or voice takes.

initializeLogger({ pretty: false, level: "silent" });

const PARENT = "11111111-1111-4111-8111-111111111111";
const CHILD = "22222222-2222-4222-8222-222222222222";
const TEST = "33333333-3333-4333-8333-333333333333";
const PKG: QuestionPackage = {
  ...SAMPLE_PACKAGES["add-27-39"],
  id: `${TEST}:s1-4`,
  ref: { source: "assessment", assessmentId: TEST, questionId: "s1-4" },
  templateId: "2-add-2-digit",
  skill: { standard: "2.4", skills: templateSkills("2-add-2-digit").map((k) => k.id) },
};

class SilentMicrophone extends voice.AudioInput {
  private controller!: ReadableStreamDefaultController<AudioFrame>;
  constructor() {
    super();
    this.multiStream.addInputStream(new ReadableStream<AudioFrame>({ start: (c) => void (this.controller = c) }));
  }
  push() { this.controller.enqueue(new AudioFrame(new Int16Array(320), 16_000, 1, 320)); }
}

/** The child's speaker. It holds a playback while `held`, as a real phrase takes time to play. */
class Speaker extends voice.AudioOutput {
  held = false;
  /** Moves the clock before each first frame: the voice's own delay. */
  delay = () => {};
  /** The test's own stopwatch: when each playback began, on the system clock. */
  starts: number[] = [];
  private captured = 0;
  private waiting = false;
  constructor() { super(24_000); }
  override async captureFrame(frame: AudioFrame) {
    const before = this.capturedPlayoutSegments;
    if (before === this.pendingStarts) this.delay();
    await super.captureFrame(frame);
    this.captured += frame.samplesPerChannel / frame.sampleRate;
    if (this.capturedPlayoutSegments > before) {
      this.pendingStarts = this.capturedPlayoutSegments;
      this.starts.push(Date.now());
      this.onPlaybackStarted(Date.now());
    }
  }
  private pendingStarts = 0;
  private finish(interrupted: boolean) {
    this.waiting = false;
    if (this.pendingPlayoutSegments > 0) this.onPlaybackFinished({ playbackPosition: interrupted ? 0 : this.captured, interrupted });
    this.captured = 0;
  }
  override flush() {
    super.flush();
    if (this.held) this.waiting = true;
    else this.finish(false);
  }
  release() {
    this.held = false;
    if (this.waiting) this.finish(false);
  }
  override clearBuffer() { this.finish(true); }
}

/** A speech-to-text the test drives one event at a time: a child who starts talking and has not finished. */
class ProbeSTT extends stt.STT {
  label = "probe.STT";
  events = new EventEmitter();
  constructor() { super({ streaming: true, interimResults: true }); }
  async _recognize(): Promise<stt.SpeechEvent> { throw new Error("stream only"); }
  stream() { return new ProbeStream(this); }
  send(type: stt.SpeechEventType, text = "") {
    this.events.emit("event", { type, ...(text ? { alternatives: [{ language: normalizeLanguage("en"), text, startTime: 0, endTime: 0, confidence: 0.95 }] } : {}) });
  }
  says(text: string) {
    this.send(stt.SpeechEventType.START_OF_SPEECH);
    this.send(stt.SpeechEventType.FINAL_TRANSCRIPT, text);
    this.send(stt.SpeechEventType.END_OF_SPEECH);
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

/** Timers on the frozen system clock. `advance` moves it and runs what is due; `move` only moves it. */
function handClock() {
  let next = 0;
  const due = new Map<number, { at: number; run: () => void }>();
  const timers: Timers = {
    now: () => Date.now(),
    set: (ms, run) => { due.set(++next, { at: Date.now() + ms, run }); return next; },
    clear: (h) => void due.delete(h as number),
  };
  const move = (ms: number) => void vi.setSystemTime(Date.now() + ms);
  const advance = async (ms: number) => {
    move(ms);
    for (const [h, t] of [...due].sort((a, b) => a[1].at - b[1].at)) {
      if (t.at > Date.now()) continue;
      due.delete(h);
      t.run();
    }
    await new Promise<void>((resolve) => setImmediate(resolve));
  };
  return { timers, move, advance };
}

const waitFor = async (check: () => boolean, what: string) => {
  const end = performance.now() + 10_000;
  while (!check()) {
    if (performance.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 5));
  }
};
const pause = () => new Promise((r) => setTimeout(r, 120));

/** A model whose next answers wait until the test lets them go, and which counts what it was asked. */
function heldModel(inner: MayaModel = ruleMayaModel()) {
  let gate: Promise<void> = Promise.resolve();
  let open = () => {};
  const state = {
    asked: 0,
    hold() { gate = new Promise((resolve) => { open = resolve; }); },
    release() { open(); gate = Promise.resolve(); },
    model: { id: "fake", promptVersion: inner.promptVersion, propose: async (input, signal) => {
      state.asked++;
      await gate;
      return inner.propose(input, signal);
    } } as MayaModel,
  };
  return state;
}

let cleanup: (() => Promise<void>) | null = null;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(Date.UTC(2026, 10, 1, 16, 0, 0));
});
afterEach(async () => {
  await cleanup?.();
  cleanup = null;
  vi.useRealTimers();
});

async function voiceCall(options: { model: MayaModel; ackLimitMs?: number; seams?: Partial<CallSeams>; board?: boolean; speech?: ProbeSTT }) {
  const clock = handClock();
  let n = 0;
  const store = memoryCallStore({ testFamilies: [PARENT] });
  const seams: CallSeams = {
    store,
    connections: memoryConnectionLog(store, () => Date.now()),
    alerts: { send: async () => {}, list: async () => [] },
    history: memoryWordingHistoryStore(),
    events: learningEvents(memoryLearningEventStore({ children: [{ id: CHILD, parentId: PARENT }], tests: [{ id: TEST, childId: CHILD }] })),
    rebuild: vi.fn(async () => true),
    model: (id) => (id === null || id === "fake" ? options.model : null),
    isTestFamily: async (p) => p === PARENT,
    clock: () => Date.now(),
    newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
    seed: () => 42,
    ...options.seams,
  };
  const calls = mayaCalls(seams);
  const started = await calls.startVoice({ kind: "admin_test", parentId: PARENT, childId: CHILD, childName: "Leah", package: PKG, startedBy: "admin-1" });
  if (!started.ok) throw new Error(started.error);
  const config = voiceProviders({});
  if (!config.ok) throw new Error("fake providers");
  const opened = await calls.openVoice(started.view.id, config.ids, "Leah");
  if (!opened.ok) throw new Error(opened.error);
  const providers = await makeProviders(config, { fakeMsPerChar: 1 });
  const session = voiceSession({ ...providers, stt: options.speech ?? providers.stt }, { endpointingMs: 20, aecWarmupDuration: 0 });
  const microphone = new SilentMicrophone();
  const speaker = new Speaker();
  session.input.audio = microphone;
  session.output.audio = speaker;
  const receiver = createBoardReceiver({ sessionId: started.view.id, clock: () => Date.now() });
  const sender = createBoardSender({ sessionId: started.view.id, senderId: "worker", transport: createMemoryTransport(receiver) });
  const board = createBoardSpeech({ sender, now: () => Date.now(), observe: (snapshot) => opened.call.observeBoard(snapshot) });
  const samples: VoiceTurnSample[] = [];
  const run = new VoiceCallRun(session, opened.call, {
    ...(options.board === false ? {} : { board }), timers: clock.timers, notify: () => {}, measureTurn: (s) => samples.push(s),
    ...(options.ackLimitMs !== undefined ? { ackLimitMs: options.ackLimitMs } : {}),
  });
  await run.agentJoined();
  await session.start({ agent: run.agent });
  run.attachBoardAudio();
  run.attachTurnTiming();
  microphone.push();
  cleanup = async () => { await run.finish({ detail: "test over" }); };
  const said = () => (providers.tts as FakeTTS).spoken;
  await run.childJoined();
  await waitFor(() => said().length > 0 && session.agentState === "listening", "the opening");
  const say = (text: string) => expect(providers.fakeSpeech!.say(text)).toBe(true);
  return { clock, say, said, session, speaker, sender, receiver, board, samples, run, id: started.view.id, calls, call: opened.call, store };
}

const ACKS = new Set(ACK_PHRASES.map((p) => p.text));
const acksIn = (said: readonly string[]) => said.filter((t) => ACKS.has(t));
const sum = (s: VoiceTurnSample) => TURN_PARTS.reduce((total, k) => total + s.parts![k], 0);

describe("the acknowledgement in one call (#532)", () => {
  it("races a fast turn, a slow turn and two interruptions, and says each phrase once", async () => {
    const m = heldModel();
    const c = await voiceCall({ model: m.model });
    const sends = vi.spyOn(c.sender, "send");
    const stages = vi.spyOn(c.board, "stage");
    const listening = () => c.session.agentState === "listening";
    const states: string[] = [];
    c.session.on(voice.AgentSessionEventTypes.AgentStateChanged, (ev) => states.push(ev.newState));

    // A fast turn: the answer is ready before the limit, so nothing comes before it.
    let before = c.said().length;
    c.say("I got 56.");
    await waitFor(() => c.samples.length === 1, "the fast turn's sample");
    await waitFor(listening, "the fast answer's playout");
    expect(c.said().length).toBeGreaterThan(before);
    expect(acksIn(c.said())).toEqual([]);
    expect(c.samples[0]).toMatchObject({ outcome: "answered", ack: null, ackHeard: false, ackSkipped: null });
    expect(c.samples[0].firstSoundMs).toBe(c.samples[0].answerMs);

    // A slow turn: the phrase comes at the limit and not before, and the answer that gets ready during it waits for it.
    before = c.said().length;
    let asked = m.asked;
    m.hold();
    c.say("I don't know.");
    await waitFor(() => m.asked > asked, "the slow turn's model call");
    await c.clock.advance(ACK_LIMIT_MS - 1);
    await pause();
    expect(c.said().slice(before)).toEqual([]);
    c.speaker.held = true;
    const sendsBefore = sends.mock.calls.length;
    await c.clock.advance(1);
    await waitFor(() => c.said().length > before, "the acknowledgement");
    const firstAck = c.said().at(-1)!;
    expect(ACKS.has(firstAck)).toBe(true);
    expect(c.said().slice(before)).toEqual([firstAck]);
    // Its plan is empty: nothing goes to the board for it.
    expect(stages.mock.calls.at(-1)![1]).toEqual([]);
    expect(sends.mock.calls.length).toBe(sendsBefore);
    expect(c.receiver.staged()).toEqual([]);

    m.release();
    await pause();
    // The answer is ready and the phrase is still playing: no batch yet, and no answer in the voice yet.
    expect(c.said().slice(before)).toEqual([firstAck]);
    expect(sends.mock.calls.length).toBe(sendsBefore);
    c.clock.move(400);
    c.speaker.release();
    await waitFor(() => c.samples.length === 2, "the slow turn's sample");
    await waitFor(listening, "the slow answer's playout");
    // One reply: Maya does not go back to listening between the phrase and the answer, so no check-in can start there.
    expect(states.slice(-3)).toEqual(["thinking", "speaking", "listening"]);
    const answerWords = c.said().slice(before + 1).join(" ");
    expect(answerWords.length).toBeGreaterThan(0);
    expect(acksIn(c.said().slice(before + 1))).toEqual([]);
    // The answer's own batches are staged after the phrase, and shown by the answer's words: the phrase's words do not
    // move a cue, because the phrase is its own segment.
    const batches = sends.mock.calls.slice(sendsBefore).map(([batch]) => batch.transactionId);
    expect(batches.length).toBeGreaterThan(0);
    await c.board.settled();
    expect(c.receiver.staged()).toEqual([]);
    const shown = c.receiver.snapshot().events.flatMap((e) => (e.kind === "batch" ? [e.batchId] : []));
    expect(shown).toEqual(expect.arrayContaining(batches));
    const slow = c.samples[1];
    expect(slow).toMatchObject({ outcome: "answered", ackHeard: true, firstSoundMs: ACK_LIMIT_MS });
    expect(slow.answerMs).toBeGreaterThan(slow.firstSoundMs!);
    expect(slow.parts!.ackHoldMs).toBe(400);
    expect(sum(slow)).toBe(slow.answerMs);
    // The phrase is not in the call's record: the child's teaching transcript holds only what the session accepted.
    expect((await c.calls.view(c.id))!.transcript.map((l) => l.text).join(" ")).not.toContain(firstAck);

    // The child talks over a playing phrase: it stops, the turn behind it is dropped, and no board comes from it.
    before = c.said().length;
    asked = m.asked;
    m.hold();
    c.speaker.held = true;
    c.say("Is it 66?");
    await waitFor(() => m.asked > asked, "the third turn's model call");
    await c.clock.advance(ACK_LIMIT_MS);
    await waitFor(() => c.said().length > before, "the second acknowledgement");
    const secondAck = c.said().at(-1)!;
    expect(ACKS.has(secondAck)).toBe(true);
    expect(secondAck).not.toBe(firstAck);
    const sendsAtInterruption = sends.mock.calls.length;
    asked = m.asked;
    c.speaker.held = false;
    c.say("Wait, I think it's 66.");
    await waitFor(() => c.samples.length === 3, "the interrupted turn's sample");
    expect(c.samples[2]).toMatchObject({ outcome: "interrupted", ack: expect.any(String), ackHeard: true, answerMs: null, parts: null });
    await waitFor(() => m.asked > asked, "the new turn's model call");
    expect(sends.mock.calls.length).toBe(sendsAtInterruption);
    m.release();
    await waitFor(() => c.samples.length === 4, "the new turn's sample");
    await waitFor(listening, "the new answer's playout");
    expect(c.samples[3]).toMatchObject({ outcome: "answered", ack: null });

    // The child talks before the limit: the phrase never starts, for that turn or after it.
    before = c.said().length;
    asked = m.asked;
    const samplesBefore = c.samples.length;
    m.hold();
    c.say("Hmm.");
    await waitFor(() => m.asked > asked, "the fifth turn's model call");
    await c.clock.advance(ACK_LIMIT_MS / 2);
    asked = m.asked;
    c.say("Is it a big number?");
    await waitFor(() => c.samples.length > samplesBefore, "the cut turn's sample");
    expect(c.samples[samplesBefore]).toMatchObject({ outcome: "interrupted", ack: null, firstSoundMs: null });
    await waitFor(() => m.asked > asked, "the sixth turn's model call");
    await c.clock.advance(ACK_LIMIT_MS - 1);
    await pause();
    expect(acksIn(c.said().slice(before))).toEqual([]);
    m.release();
    await waitFor(() => c.samples.length > samplesBefore + 1, "the sixth turn's sample");
    await waitFor(listening, "the last answer's playout");

    // Across the whole call: no phrase twice, and the report counts what happened.
    const acks = acksIn(c.said());
    expect(acks).toHaveLength(2);
    expect(new Set(acks).size).toBe(2);
    await c.run.hangUp();
    const report = voiceTurnReport(c.samples);
    expect(report).toMatchObject({ turns: 6, answered: 4, interrupted: 2, noWords: 0, acksQueued: 2, acksHeard: 2 });
    expect(report.firstSound.count).toBe(5);
    expect(report.answer.count).toBe(4);
    for (const s of c.samples.filter((x) => x.parts)) expect(sum(s)).toBe(s.answerMs);
  });

  it("does not start while the child is still talking, and a noise during it does not lose the answer", async () => {
    const m = heldModel();
    const speech = new ProbeSTT();
    const c = await voiceCall({ model: m.model, speech });
    const speaking = () => c.session.userState === "speaking";

    // Talking with no words heard yet, as the limit passes: nothing starts, and nothing more starts for this turn.
    let before = c.said().length;
    let asked = m.asked;
    m.hold();
    speech.says("I got 56.");
    await waitFor(() => m.asked > asked, "the model call");
    speech.send(stt.SpeechEventType.START_OF_SPEECH);
    await waitFor(speaking, "the child talking");
    await c.clock.advance(ACK_LIMIT_MS);
    await pause();
    expect(c.said().slice(before)).toEqual([]);
    asked = m.asked;
    speech.send(stt.SpeechEventType.FINAL_TRANSCRIPT, "No wait.");
    speech.send(stt.SpeechEventType.END_OF_SPEECH);
    await waitFor(() => m.asked > asked, "the second model call");
    expect(c.samples[0]).toMatchObject({ outcome: "interrupted", ack: null, firstSoundMs: null });

    // The phrase is playing and the child makes a noise that never becomes words. The answer still comes after it.
    await c.clock.advance(ACK_LIMIT_MS);
    c.speaker.held = true;
    await waitFor(() => acksIn(c.said()).length === 1, "the phrase");
    before = c.said().length;
    speech.send(stt.SpeechEventType.START_OF_SPEECH);
    await waitFor(speaking, "the noise");
    m.release();
    await pause();
    speech.send(stt.SpeechEventType.END_OF_SPEECH);
    await waitFor(() => !speaking(), "the noise's end");
    c.speaker.release();
    await waitFor(() => c.said().length > before, "the answer");
    expect(acksIn(c.said().slice(before))).toEqual([]);
    await waitFor(() => c.samples.length === 2, "the sample");
    expect(c.samples[1]).toMatchObject({ outcome: "answered", ackHeard: true });
  });

  it("does not start after the child leaves, after a hang-up, or once the call is closing", async () => {
    const m = heldModel();
    const c = await voiceCall({ model: m.model });
    const before = c.said().length;
    let asked = m.asked;
    m.hold();

    // The call's state says it is closing (a safety flag came with an earlier turn).
    const realSession = c.call.session;
    const closing = vi.spyOn(c.call, "session", "get").mockImplementation(() => ({ ...structuredClone(realSession), safety: { ...realSession.safety, flagged: true } }));
    c.say("I got 56.");
    await waitFor(() => m.asked > asked, "the first model call");
    await c.clock.advance(ACK_LIMIT_MS);
    await pause();
    closing.mockRestore();
    expect(c.said().slice(before)).toEqual([]);
    asked = m.asked;
    c.say("No wait.");
    await waitFor(() => c.samples.length === 1, "the first sample");
    expect(c.samples[0]).toMatchObject({ ack: null, ackSkipped: "closing" });
    await waitFor(() => m.asked > asked, "the second model call");

    // The child's connection drops with the limit still running.
    await c.run.childLeft("dropped");
    await c.clock.advance(ACK_LIMIT_MS);
    await pause();
    expect(acksIn(c.said())).toEqual([]);

    // Back, and a hang-up with the limit still running.
    await c.run.childJoined();
    asked = m.asked;
    c.say("One more thing.");
    await waitFor(() => m.asked > asked, "the third model call");
    await c.run.hangUp();
    await c.clock.advance(ACK_LIMIT_MS);
    await pause();
    expect(acksIn(c.said())).toEqual([]);
    m.release();
  });

  it("says nothing more once the bank is used, keeps the list across a worker replacement, and reports why", async () => {
    const m = heldModel();
    const c = await voiceCall({ model: m.model, board: false });
    for (const p of ACK_PHRASES) await c.call.acknowledge(p.id);
    const before = c.said().length;
    const asked = m.asked;
    m.hold();
    c.say("I got 56.");
    await waitFor(() => m.asked > asked, "the model call");
    await c.clock.advance(ACK_LIMIT_MS);
    await pause();
    expect(c.said().slice(before)).toEqual([]);
    m.release();
    await waitFor(() => c.samples.length === 1, "the sample");
    expect(c.samples[0]).toMatchObject({ outcome: "answered", ack: null, ackSkipped: "bank_used" });
    await c.call.settled();
    // The list is saved, so a new worker on this call cannot start the bank again.
    const again = await c.calls.openVoice(c.id, { speechToText: "fake", voice: "fake" }, null);
    if (!again.ok) throw new Error(again.error);
    expect(new Set(again.call.acknowledged)).toEqual(new Set(ACK_PHRASES.map((p) => p.id)));
  });

  it("stays silent when the limit is 0", async () => {
    const m = heldModel();
    const c = await voiceCall({ model: m.model, ackLimitMs: 0 });
    const before = c.said().length;
    const asked = m.asked;
    m.hold();
    c.say("I got 56.");
    await waitFor(() => m.asked > asked, "the model call");
    await c.clock.advance(60_000);
    await pause();
    expect(c.said().slice(before)).toEqual([]);
    m.release();
    await waitFor(() => c.samples.length === 1, "the sample");
    expect(c.samples[0].ack).toBeNull();
  });
});

describe("the parts of one turn (#532)", () => {
  it("add up to the total, each part exact, against the test's own stopwatch", async () => {
    // Each fake moves the clock by its own known amount, so a part given to the wrong place fails its exact value. The
    // first proposal is refused, so a repair runs, and the repair's free talk needs a review.
    const inner = ruleMayaModel();
    let clockMove = (ms: number) => void ms;
    let asked = 0;
    const model: MayaModel = {
      id: "fake", promptVersion: inner.promptVersion,
      propose: async (input, signal) => {
        const child = input.transcript.some((l) => l.speaker === "child");
        if (!child) return inner.propose(input, signal);
        asked++;
        if (asked === 1) { clockMove(2000); return { version: PROPOSAL_VERSION, act: "accept_answer", parts: [] }; }
        clockMove(700);
        return { version: PROPOSAL_VERSION, act: "clarify", parts: [{ talk: "Oh, I like dogs too!" }] };
      },
    };
    const reviewer = fakeTalkReviewer(() => ({ verdict: "pass" }));
    const c = await voiceCall({ model, ackLimitMs: 0, seams: {
      reviewer: () => ({ ...reviewer, review: (input, signal) => { clockMove(300); return reviewer.review(input, signal); } }),
    } });
    clockMove = c.clock.move;

    // The save moves the clock inside the controller's turn, and a board send outside it.
    const update = c.store.update.bind(c.store);
    c.store.update = async (...args) => { if (asked > 0) c.clock.move(50); return update(...args); };
    c.speaker.delay = () => { if (asked > 0) c.clock.move(120); };
    let stoppedAt = 0;
    c.session.on(voice.AgentSessionEventTypes.UserStateChanged, (ev) => {
      if (ev.newState !== "listening") return;
      stoppedAt = Date.now();
      c.clock.move(300);
    });
    const starts = c.speaker.starts.length;
    c.say("I have a dog.");
    await waitFor(() => c.samples.length === 1, "the sample");

    const [s] = c.samples;
    expect(c.speaker.starts.length).toBe(starts + 1);
    const stopwatch = c.speaker.starts.at(-1)! - stoppedAt;
    expect(s.answerMs).toBe(stopwatch);
    expect(s.firstSoundMs).toBe(stopwatch);
    expect(s.parts).toEqual({ heardMs: 300, modelMs: 2000, repairMs: 700, reviewMs: 300, codeMs: 50, ackHoldMs: 0, boardMs: expect.any(Number), voiceMs: 120 });
    expect(sum(s)).toBe(s.answerMs);
    expect(s.answerMs).toBe(3470 + s.parts!.boardMs);
  });
});

// The reproductions from the review of PR #577, on the delays that review found.
describe("R577: what a delay can change while the phrase waits", () => {
  /** A model that answers a first child turn with immediate danger, then holds the closing turn. */
  function dangerModel() {
    const inner = ruleMayaModel();
    let armed = false;
    let childCalls = 0;
    let releaseDanger = () => {};
    let releaseClosing = () => {};
    const danger = new Promise<void>((r) => { releaseDanger = r; });
    const closing = new Promise<void>((r) => { releaseClosing = r; });
    const model: MayaModel = { id: "fake", promptVersion: inner.promptVersion, propose: async (input, signal) => {
      if (!armed || !input.transcript.some((l) => l.speaker === "child")) return inner.propose(input, signal);
      childCalls++;
      if (childCalls === 1) {
        await danger;
        return { version: PROPOSAL_VERSION, act: "safety", reading: { safety: "immediate" }, parts: [] };
      }
      await closing;
      return inner.propose(input, signal);
    } };
    return { model, arm: () => { armed = true; }, calls: () => childCalls, releaseDanger, releaseClosing };
  }

  it("R577-1 a late board answer of an interrupted phrase does not replace the next answer's board", async () => {
    const m = heldModel();
    const c = await voiceCall({ model: m.model });
    c.say("I don't know.");
    await waitFor(() => c.samples.length === 1 && c.session.agentState === "listening", "an answer that leaves a plan to cancel");
    await c.board.settled();
    const cancel = c.sender.cancel.bind(c.sender);
    let releaseCancel = () => {};
    const delayed = new Promise<void>((r) => { releaseCancel = r; });
    let waiting = false;
    vi.spyOn(c.sender, "cancel").mockImplementation(async (...args) => {
      const result = await cancel(...args);
      if (!waiting) { waiting = true; await delayed; }
      return result;
    });
    const stages = vi.spyOn(c.board, "stage");
    let asked = m.asked;
    m.hold();
    c.say("I don't know.");
    await waitFor(() => m.asked > asked, "the old turn's model call");
    await c.clock.advance(ACK_LIMIT_MS);
    await waitFor(() => waiting, "the phrase's board answer to be pending");
    asked = m.asked;
    c.say("Show me.");
    await waitFor(() => m.asked > asked, "the new turn's model call");
    m.release();
    await waitFor(() => stages.mock.calls.some((a) => a[1].length > 0), "the new answer's plan");
    const stagesAtNewPlan = stages.mock.calls.length;
    const intended = stages.mock.calls.find((a) => a[1].length > 0)![1].map((cue) => cue.batch.transactionId);
    releaseCancel();
    await waitFor(() => c.samples.filter((s) => s.outcome === "answered").length === 2, "the new answer's sound");
    await waitFor(() => c.session.agentState === "listening", "the new answer's playout");
    await c.board.settled();
    // Nothing staged after the new plan: the dropped turn did not take it over.
    expect(stages.mock.calls.length).toBe(stagesAtNewPlan);
    expect(intended.length).toBeGreaterThan(0);
    const shown = c.receiver.snapshot().events.flatMap((e) => (e.kind === "batch" ? [e.batchId] : []));
    expect(shown).toEqual(expect.arrayContaining(intended));
  });

  it("R577-2 danger reported while the phrase's board stage waits: no phrase before the safety guidance", async () => {
    const d = dangerModel();
    const c = await voiceCall({ model: d.model });
    c.say("I don't know.");
    await waitFor(() => c.samples.length === 1 && c.session.agentState === "listening", "an answer that leaves a plan to cancel");
    await c.board.settled();
    d.arm();
    const cancel = c.sender.cancel.bind(c.sender);
    let releaseStage = () => {};
    const delayed = new Promise<void>((r) => { releaseStage = r; });
    let staging = false;
    vi.spyOn(c.sender, "cancel").mockImplementation(async (...args) => {
      const result = await cancel(...args);
      staging = true;
      await delayed;
      return result;
    });
    c.say("Someone is hurting me.");
    await waitFor(() => d.calls() === 1, "the child turn's model call");
    await c.clock.advance(ACK_LIMIT_MS);
    await waitFor(() => staging, "the phrase's board stage");
    d.releaseDanger();
    await waitFor(() => c.call.session.safety.flagged && d.calls() === 2, "the danger to be known");
    releaseStage();
    await pause();
    expect(acksIn(c.said())).toEqual([]);
    // Stopped before its save, so the phrase stays in the bank.
    expect(c.call.acknowledged).toEqual([]);
    d.releaseClosing();
    await waitFor(() => c.samples.length === 2, "the turn's sample");
    expect(acksIn(c.said())).toEqual([]);
    expect(c.samples[1]).toMatchObject({ ack: null, ackSkipped: "closing" });
  });

  it("R577-2 danger reported while the phrase's save waits: no phrase before the safety guidance", async () => {
    const d = dangerModel();
    const c = await voiceCall({ model: d.model });
    d.arm();
    const update = c.store.update.bind(c.store);
    let releaseSave = () => {};
    const delayed = new Promise<void>((r) => { releaseSave = r; });
    let saving = false;
    c.store.update = async (id, revision, change) => {
      const result = await update(id, revision, change);
      if (!saving && change.live?.acknowledged?.length) { saving = true; await delayed; }
      return result;
    };
    c.say("Someone is hurting me.");
    await waitFor(() => d.calls() === 1, "the child turn's model call");
    await c.clock.advance(ACK_LIMIT_MS);
    await waitFor(() => saving, "the phrase's save");
    d.releaseDanger();
    await waitFor(() => c.call.session.safety.flagged, "the danger to be known");
    releaseSave();
    await pause();
    expect(acksIn(c.said())).toEqual([]);
    d.releaseClosing();
    await waitFor(() => c.samples.length === 1, "the turn's sample");
    expect(acksIn(c.said())).toEqual([]);
    expect(c.samples[0]).toMatchObject({ ack: null, ackSkipped: "closing" });
  });

  it("R577-3 a phrase heard before a worker replacement is already saved, so the new worker cannot pick it", async () => {
    const m = heldModel();
    const c = await voiceCall({ model: m.model });
    const asked = m.asked;
    m.hold();
    c.say("I don't know.");
    await waitFor(() => m.asked > asked, "the model call");
    await c.clock.advance(ACK_LIMIT_MS);
    await waitFor(() => acksIn(c.said()).length === 1, "the phrase");
    const [id] = c.call.acknowledged;
    const heard = ACK_PHRASES.find((p) => p.id === id)!;
    expect(c.said()).toContain(heard.text);
    const replacement = await c.calls.openVoice(c.id, { speechToText: "fake", voice: "fake" }, null);
    m.release();
    if (!replacement.ok) throw new Error(replacement.error);
    expect(replacement.call.acknowledged).toContain(id);
  });

  it("R577-3 a worker that was replaced cannot save a phrase, so it says none", async () => {
    const m = heldModel();
    // No board: its own save would stop this worker first, and this test is about the phrase's save.
    const c = await voiceCall({ model: m.model, board: false });
    const asked = m.asked;
    m.hold();
    c.say("I don't know.");
    await waitFor(() => m.asked > asked, "the model call");
    const replacement = await c.calls.openVoice(c.id, { speechToText: "fake", voice: "fake" }, null);
    if (!replacement.ok) throw new Error(replacement.error);
    await c.clock.advance(ACK_LIMIT_MS);
    await pause();
    expect(acksIn(c.said())).toEqual([]);
    expect(replacement.call.acknowledged).toEqual([]);
    expect(c.call.replaced).toBe(true);
    m.release();
    await waitFor(() => c.samples.length === 1, "the sample");
    expect(c.samples[0]).toMatchObject({ ack: null, ackSkipped: "save" });
  });
});
