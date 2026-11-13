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
import { memoryWordingHistoryStore, PROPOSAL_VERSION, SAFETY_GUIDANCE } from "@/lib/maya";
import { mayaCalls, type CallSeams } from "@/lib/maya-call";
import { memoryCallStore, memoryConnectionLog } from "@/lib/maya-call-memory";
import type { MayaModel } from "@/lib/maya-model";
import { ruleMayaModel } from "@/lib/maya-model-fake";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { fakeTalkReviewer } from "@/lib/maya-talk-review";
import { voiceProviders } from "@/lib/maya-voice";
import { ACK_HOLD_LIMIT_MS, ACK_LIMIT_MS, ACK_PHRASES } from "@/lib/maya-voice-ack";
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
  /** How many playbacks were cut short. */
  cut = 0;
  /** The seconds of audio each finished playback carried. */
  plays: number[] = [];
  /** When set, the next frames wait here, after this many more frames: audio that takes time to play. */
  private paced: { left: number; until: Promise<void>; open: () => void } | null = null;
  private captured = 0;
  private waiting = false;
  constructor() { super(24_000); }
  /** The next frames stop after `frames` more, until `play` is called. */
  pace(frames: number) {
    let open = () => {};
    const until = new Promise<void>((resolve) => { open = resolve; });
    this.paced = { left: frames, until, open };
  }
  get waitingToPlay() { return this.paced !== null && this.paced.left <= 0; }
  play() { const paced = this.paced; this.paced = null; paced?.open(); }
  override async captureFrame(frame: AudioFrame) {
    if (this.paced) {
      if (this.paced.left <= 0) await this.paced.until;
      else this.paced.left--;
    }
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
    if (interrupted && this.pendingPlayoutSegments > 0) this.cut++;
    if (this.pendingPlayoutSegments > 0) this.plays.push(this.captured);
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
  /**
   * A final transcript whose last word ends `wordEnd` seconds into the audio, as a real speech-to-text reports it. Its own
   * end time is `turnEnd`: through LiveKit Inference that is the turn's `start + duration`, which runs on while the
   * speech-to-text holds the turn.
   */
  sendTimed(text: string, wordEnd: number, turnEnd = wordEnd) {
    const words = text.split(/\s+/).map((w, i, all) => voice.createTimedString({ text: w, startTime: wordEnd * i / all.length, endTime: i === all.length - 1 ? wordEnd : wordEnd * (i + 1) / all.length }));
    this.events.emit("event", { type: stt.SpeechEventType.FINAL_TRANSCRIPT, alternatives: [{ language: normalizeLanguage("en"), text, startTime: 0, endTime: turnEnd, confidence: 0.95, words }] });
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

async function voiceCall(options: { model: MayaModel; ackLimitMs?: number; seams?: Partial<CallSeams>; board?: boolean; speech?: ProbeSTT; limitMs?: number; timestamps?: boolean }) {
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
  const started = await calls.startVoice({ kind: "admin_test", parentId: PARENT, childId: CHILD, childName: "Leah", package: PKG, startedBy: "admin-1", ...(options.limitMs ? { limitMs: options.limitMs } : {}) });
  if (!started.ok) throw new Error(started.error);
  const config = voiceProviders({});
  if (!config.ok) throw new Error("fake providers");
  const opened = await calls.openVoice(started.view.id, config.ids, "Leah");
  if (!opened.ok) throw new Error(opened.error);
  const providers = await makeProviders(config, { fakeMsPerChar: 1, fakeTimestamps: options.timestamps ?? true });
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
    // The answer is speech of its own after the phrase (its voice stream ended with the phrase, 2026-11-13), so Maya is
    // listening for a moment between them. Its turn still holds the silence timer, and the answer is the next thing said.
    expect(states.slice(-2)).toEqual(["speaking", "listening"]);
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
    // first proposal is refused, so a repair runs, and the repair's free talk needs a review. The talk is calm: D-310
    // refuses a cheerful exclamation before any review, which would leave no review to time.
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
        return { version: PROPOSAL_VERSION, act: "clarify", parts: [{ talk: "Oh, I like dogs too." }] };
      },
    };
    const reviewer = fakeTalkReviewer(() => ({ verdict: "pass" }));
    const c = await voiceCall({ model, ackLimitMs: 0, seams: {
      reviewer: () => ({ ...reviewer, review: (input, signal) => { clockMove(300); return reviewer.review(input, signal); } }),
    } });
    clockMove = c.clock.move;

    // The turn's own save moves the clock inside the controller's turn. The board's saves run beside the voice, so they
    // move nothing here (the next test holds the board's send).
    const update = c.store.update.bind(c.store);
    c.store.update = async (id, revision, change) => { if (asked > 0 && !change.boardHistory) c.clock.move(50); return update(id, revision, change); };
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
    // Nothing waits between the ready answer and its words reaching the voice: no later save, and no board answer.
    expect(s.parts).toEqual({ heardMs: 300, modelMs: 2000, repairMs: 700, reviewMs: 300, codeMs: 50, ackHoldMs: 0, boardMs: 0, voiceMs: 120 });
    expect(sum(s)).toBe(s.answerMs);
    expect(s.answerMs).toBe(3470);
    // The fake speech-to-text gives no word times; its end of speech came with its final transcript.
    expect(s).toMatchObject({ sttWaitMs: null, speechEnd: null, waitMs: null });
  });

  it("measure the speech-to-text's own wait from the child's last word, before the turn's clock starts", async () => {
    const speech = new ProbeSTT();
    const c = await voiceCall({ model: ruleMayaModel(), ackLimitMs: 0, speech });
    // The microphone's first frame (20 ms) went to the speech-to-text when the call started: the word times count from it.
    const inputStartedAt = Date.UTC(2026, 10, 1, 16, 0, 0) - 20;
    c.clock.move(5000);
    const lastWordEnd = Date.now() - 1100;
    speech.send(stt.SpeechEventType.START_OF_SPEECH);
    // The speech-to-text held the turn 1100 ms: the transcript's own end time is the final's, the last word's is not
    // (real calls of 2026-11-13 logged the transcript's end, and under-reported the wait by the hold).
    speech.sendTimed("I got 56.", (lastWordEnd - inputStartedAt) / 1000, (Date.now() - inputStartedAt) / 1000);
    speech.send(stt.SpeechEventType.END_OF_SPEECH);
    await waitFor(() => c.samples.length === 1, "the sample");
    const [s] = c.samples;
    expect(s).toMatchObject({ outcome: "answered", speechEnd: "stt_words", sttWaitMs: 1100 });
    // The whole wait is the speech-to-text's wait plus everything `answerMs` counts.
    expect(s.waitMs).toBe(1100 + s.answerMs!);
    await waitFor(() => c.session.agentState === "listening", "the answer's playout");

    // No word times: the end of speech LiveKit reported before the final transcript is the mark.
    c.clock.move(3000);
    speech.send(stt.SpeechEventType.START_OF_SPEECH);
    c.clock.move(400);
    speech.send(stt.SpeechEventType.END_OF_SPEECH);
    await pause();
    c.clock.move(700);
    speech.send(stt.SpeechEventType.FINAL_TRANSCRIPT, "Is it 66?");
    await waitFor(() => c.samples.length === 2, "the second sample");
    expect(c.samples[1]).toMatchObject({ speechEnd: "vad", sttWaitMs: 700 });
    expect(c.samples[1].waitMs).toBe(700 + c.samples[1].answerMs!);
  });
});

describe("the voice does not wait for the board's saves", () => {
  // With word times a release already waits behind the plan; with none (sentence ends), only the plan's own wait holds
  // the audio, so both are run.
  it.each([true, false])("gives the words to the voice while the plan goes out, and the first sound waits for the plan (word times %s)", async (timestamps) => {
    const c = await voiceCall({ model: ruleMayaModel(), ackLimitMs: 0, timestamps });
    const send = c.sender.send.bind(c.sender);
    let releaseSend = () => {};
    const held = new Promise<void>((r) => { releaseSend = r; });
    let holding = false;
    vi.spyOn(c.sender, "send").mockImplementation(async (...args) => {
      if (!holding) { holding = true; await held; }
      return send(...args);
    });
    const before = c.said().length;
    const starts = c.speaker.starts.length;
    c.say("I don't know.");
    await waitFor(() => holding, "the plan's first send");
    // The voice has the first sentence already, and no sound has played.
    await waitFor(() => c.said().length > before, "the words at the voice");
    await pause();
    expect(c.speaker.starts.length).toBe(starts);
    expect(c.receiver.staged()).toEqual([]);
    c.clock.move(80);
    releaseSend();
    await waitFor(() => c.samples.length === 1, "the answer's sound");
    const [s] = c.samples;
    expect(s.outcome).toBe("answered");
    expect(s.parts!.boardMs).toBe(0);
    expect(s.stageMs).toBe(80);
    expect(s.parts!.voiceMs).toBe(80);
    expect(sum(s)).toBe(s.answerMs);
    // The batches were all on the receiver before the sound, and each shows at its word.
    await waitFor(() => c.session.agentState === "listening", "the answer's playout");
    await c.board.settled();
    expect(c.receiver.staged()).toEqual([]);
    expect(c.receiver.snapshot().events.some((e) => e.kind === "batch")).toBe(true);
  });

  it.each([true, false])("a reply that loses its turn while its plan goes out makes no sound and shows no batch (word times %s)", async (timestamps) => {
    const c = await voiceCall({ model: ruleMayaModel(), ackLimitMs: 0, timestamps });
    const send = c.sender.send.bind(c.sender);
    let releaseSend = () => {};
    const held = new Promise<void>((r) => { releaseSend = r; });
    let holding = false;
    const heldBatches: string[] = [];
    vi.spyOn(c.sender, "send").mockImplementation(async (batch, options) => {
      if (!holding) { holding = true; heldBatches.push(batch.transactionId); await held; }
      return send(batch, options);
    });
    const starts = c.speaker.starts.length;
    c.say("I don't know.");
    await waitFor(() => holding, "the plan's first send");
    // The child talks before the plan is out: the reply is cut, and its plan is retired.
    c.say("Is it 66?");
    await waitFor(() => c.samples.length === 1, "the first turn's sample");
    expect(c.samples[0].outcome).toBe("interrupted");
    releaseSend();
    await waitFor(() => c.samples.length === 2 && c.session.agentState === "listening", "the second answer");
    await c.board.settled();
    // Only the second answer made a sound, and the first plan's held batch never showed.
    expect(c.speaker.starts.length).toBe(starts + 1);
    const shown = c.receiver.snapshot().events.flatMap((e) => (e.kind === "batch" ? [e.batchId] : []));
    expect(shown).not.toContain(heldBatches[0]);
  });
});

// The reproductions from the review of PR #577, on the delays that review found.
describe("R577: what a delay can change while the phrase waits", () => {
  /** A model that answers a first child turn with danger, then holds the closing turn. */
  function dangerModel(severity: "concern" | "immediate" = "immediate") {
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
        return { version: PROPOSAL_VERSION, act: "safety", reading: { safety: severity }, parts: [] };
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

  // D-341 review, item B: the phrase waits for neither its board stage nor its save, so the two delays R577-2 covered
  // (danger known while one of them waited) cannot happen. What holds now: the phrase is queued at the limit with the
  // stage's answer or the save still out, and the guidance that comes after it stops it and goes first (R577-4).
  it("R577-2 the phrase does not wait for its board stage, and the guidance that comes after it stops it", async () => {
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
    c.speaker.held = true;
    c.say("Someone is hurting me.");
    await waitFor(() => d.calls() === 1, "the child turn's model call");
    await c.clock.advance(ACK_LIMIT_MS);
    // Queued while the stage's answer is still out.
    await waitFor(() => acksIn(c.said()).length === 1, "the phrase");
    expect(staging).toBe(true);
    d.releaseDanger();
    await waitFor(() => c.said().includes(SAFETY_GUIDANCE.immediate.split(/(?<=[.?!])\s+/)[0]) || c.said().includes(SAFETY_GUIDANCE.immediate), "the guidance");
    releaseStage();
    c.speaker.release();
    d.releaseClosing();
    await waitFor(() => c.samples.length === 2, "the turn's sample");
    expect(acksIn(c.said())).toHaveLength(1);
    expect(c.said().indexOf(acksIn(c.said())[0])).toBeLessThan(c.said().findIndex((t) => SAFETY_GUIDANCE.immediate.startsWith(t)));
  });

  it("R577-2 the phrase does not wait for its save: its id leaves the bank at once, and the save follows", async () => {
    const d = dangerModel();
    const c = await voiceCall({ model: d.model });
    d.arm();
    const update = c.store.update.bind(c.store);
    let releaseSave = () => {};
    const delayed = new Promise<void>((r) => { releaseSave = r; });
    let saving = false;
    c.store.update = async (id, revision, change) => {
      if (!saving && change.live?.acknowledged?.length) { saving = true; await delayed; }
      return update(id, revision, change);
    };
    c.say("Someone is hurting me.");
    await waitFor(() => d.calls() === 1, "the child turn's model call");
    await c.clock.advance(ACK_LIMIT_MS);
    await waitFor(() => acksIn(c.said()).length === 1, "the phrase, with its save still out");
    expect(saving).toBe(true);
    expect(c.call.acknowledged).toHaveLength(1);
    releaseSave();
    d.releaseDanger();
    await waitFor(() => c.call.session.safety.flagged, "the danger to be known");
    d.releaseClosing();
    await waitFor(() => c.samples.length === 1, "the turn's sample");
    await c.call.settled();
    expect((await c.store.get(c.id))!.live?.acknowledged ?? (await c.store.get(c.id))!.status).toBeTruthy();
    expect(acksIn(c.said())).toHaveLength(1);
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

  // D-341 review, item B: the save no longer comes before the phrase, so a replaced worker can say one phrase (the
  // accepted loss). Its save is refused, and from then on it says no phrase.
  it("R577-3 a worker that was replaced says at most one phrase: its save is refused, and it says no more", async () => {
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
    await waitFor(() => c.call.replaced, "the phrase's save to be refused");
    expect(acksIn(c.said()).length).toBeLessThanOrEqual(1);
    expect(replacement.call.acknowledged).toEqual([]);
    m.release();
    // The worker that lost the call stops: its turn ends the call's handle, and it says no further phrase.
    await waitFor(() => c.run.done !== null, "the replaced worker to stop");
    await c.run.done;
    await c.clock.advance(ACK_LIMIT_MS * 2);
    await pause();
    expect(acksIn(c.said()).length).toBeLessThanOrEqual(1);
  });

  /**
   * Watches a call from before the child speaks. `readyToQueued` lets the model answer and gives the time from the
   * controller's finished turn to the words being queued (given to `session.say`, or reaching the voice), on the clock
   * the phrase's hold runs on. The clock keeps moving, so a wait on any timer shows as its full length. The speaker
   * stays held, as a phrase still playing.
   */
  function watchQueue(c: Awaited<ReturnType<typeof voiceCall>>) {
    let readyAt: number | null = null;
    let queuedAt: number | null = null;
    const child = c.call.child.bind(c.call);
    c.call.child = async (...args) => { const turn = await child(...args); readyAt = Date.now(); return turn; };
    const say = c.session.say.bind(c.session);
    vi.spyOn(c.session, "say").mockImplementation((...args) => { queuedAt ??= Date.now(); return say(...args); });
    return async (release: () => void) => {
      const spoken = c.said().length;
      release();
      await waitFor(() => readyAt !== null, "the finished turn");
      for (let step = 0; step < 140 && queuedAt === null; step++) {
        if (c.said().length > spoken) queuedAt = Date.now();
        else await c.clock.advance(50);
      }
      return queuedAt === null ? Infinity : queuedAt - readyAt!;
    };
  }
  /** One step of the clock can pass between the turn and its queue, as the test's own loop runs. */
  const AT_ONCE_MS = 50;

  async function phrasePlaying(c: Awaited<ReturnType<typeof voiceCall>>, say: () => void, modelAsked: () => boolean) {
    c.speaker.held = true;
    say();
    await waitFor(modelAsked, "the model call");
    await c.clock.advance(ACK_LIMIT_MS);
    await waitFor(() => acksIn(c.said()).length === 1, "the phrase");
    await waitFor(() => c.speaker.starts.length > 1, "the phrase's sound");
  }

  it.each(["immediate", "concern"] as const)("R577-4 %s danger read by the model stops a playing phrase and queues the guidance at once", async (severity) => {
    const d = dangerModel(severity);
    const c = await voiceCall({ model: d.model });
    d.arm();
    d.releaseClosing();
    const readyToQueued = watchQueue(c);
    await phrasePlaying(c, () => c.say("Someone is hurting me."), () => d.calls() === 1);
    const cutBefore = c.speaker.cut;

    const waited = await readyToQueued(d.releaseDanger);
    expect(waited).toBeLessThanOrEqual(AT_ONCE_MS);
    // Heard with the speaker still held: the guidance did not wait for the phrase to end.
    await waitFor(() => c.said().join(" ").includes(SAFETY_GUIDANCE[severity].split(". ")[0]), "the guidance in the voice");
    expect(c.speaker.cut).toBeGreaterThan(cutBefore);
    expect(c.said().join(" ").indexOf(acksIn(c.said())[0])).toBeLessThan(c.said().join(" ").indexOf(SAFETY_GUIDANCE[severity].split(". ")[0]));
    await waitFor(() => c.samples.length === 1, "the sample");
    expect(c.samples[0]).toMatchObject({ outcome: "answered", ackHeard: true });
    expect(c.samples[0].parts!.ackHoldMs).toBe(0);
    expect(sum(c.samples[0])).toBe(c.samples[0].answerMs);
    c.speaker.release();
  });

  it("R577-4 the deadline close stops a playing phrase and is queued at once", async () => {
    const m = heldModel();
    // Closing starts 2 s into this call, so the phrase at 1.5 s starts before it and the turn finishes after it.
    const c = await voiceCall({ model: m.model, limitMs: 62_000 });
    const asked = m.asked;
    m.hold();
    const readyToQueued = watchQueue(c);
    await phrasePlaying(c, () => c.say("I got 56."), () => m.asked > asked);
    const cutBefore = c.speaker.cut;
    c.clock.move(1000);

    const waited = await readyToQueued(() => m.release());
    expect(waited).toBeLessThanOrEqual(AT_ONCE_MS);
    // Since #749 (011e14df) one miss with no work closes honestly at the deadline in this same turn (close.stuck), so
    // the session is closed, not left in TIME_CLOSE for a later turn. Before the deadline one miss gets a guide.
    expect(c.call.session.state).toBe("CLOSE");
    await waitFor(() => c.speaker.cut > cutBefore, "the phrase to stop");
    await waitFor(() => c.said().includes("It's okay to stop here."), "the honest close in the voice");
    expect(c.said().indexOf(acksIn(c.said())[0])).toBeLessThan(c.said().indexOf("It's okay to stop here."));
    await waitFor(() => c.samples.length === 1, "the sample");
    expect(c.samples[0].parts!.ackHoldMs).toBe(0);
    c.speaker.release();
  });

  it("R577-4 no phrase starts once the deadline close has begun", async () => {
    const m = heldModel();
    const c = await voiceCall({ model: m.model, limitMs: 60_500 });
    c.clock.move(600);
    const asked = m.asked;
    m.hold();
    c.say("I got 56.");
    await waitFor(() => m.asked > asked, "the model call");
    await c.clock.advance(ACK_LIMIT_MS);
    await pause();
    expect(acksIn(c.said())).toEqual([]);
    m.release();
    await waitFor(() => c.samples.length === 1, "the sample");
    expect(c.samples[0]).toMatchObject({ ack: null, ackSkipped: "closing" });
  });

  it("R577-4 the guidance does not wait for a phrase's board answer that has not come back", async () => {
    const d = dangerModel();
    const c = await voiceCall({ model: d.model });
    c.say("I don't know.");
    await waitFor(() => c.samples.length === 1 && c.session.agentState === "listening", "an answer that leaves a plan to cancel");
    await c.board.settled();
    d.arm();
    d.releaseClosing();
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
    const readyToQueued = watchQueue(c);
    c.say("Someone is hurting me.");
    await waitFor(() => d.calls() === 1, "the child turn's model call");
    await c.clock.advance(ACK_LIMIT_MS);
    await waitFor(() => staging, "the phrase's board stage");
    try {
      const waited = await readyToQueued(d.releaseDanger);
      expect(waited).toBeLessThanOrEqual(AT_ONCE_MS);
      await waitFor(() => c.said().join(" ").includes("Your safety comes first"), "the guidance in the voice, with the board answer still pending");
      expect(acksIn(c.said())).toEqual([]);
    } finally { releaseStage(); }
  });

  it("R577-4 guidance is queued even when the child's words stopped its reply, and plays when the child stops", async () => {
    const d = dangerModel();
    const speech = new ProbeSTT();
    const c = await voiceCall({ model: d.model, speech });
    d.arm();
    d.releaseClosing();
    const readyToQueued = watchQueue(c);
    speech.says("Someone is hurting me.");
    await waitFor(() => d.calls() === 1, "the child turn's model call");
    // Words that stop the reply, and no end of the child's turn yet, so no new turn has replaced this one.
    speech.send(stt.SpeechEventType.START_OF_SPEECH);
    speech.send(stt.SpeechEventType.FINAL_TRANSCRIPT, "Please help.");
    await waitFor(() => c.session.userState === "speaking", "the child talking");
    await pause();
    const waited = await readyToQueued(d.releaseDanger);
    expect(waited).toBeLessThanOrEqual(AT_ONCE_MS);
    // LiveKit holds new speech while the child is talking.
    expect(c.said().join(" ")).not.toContain("Your safety comes first");
    speech.send(stt.SpeechEventType.END_OF_SPEECH);
    await waitFor(() => c.said().join(" ").includes("Your safety comes first"), "the guidance in the voice");
  });

  it("R577-4 an ordinary answer waits for the phrase, but at most 3 s if its end never comes", async () => {
    const m = heldModel();
    const c = await voiceCall({ model: m.model });
    const stages = vi.spyOn(c.board, "stage");
    const asked = m.asked;
    m.hold();
    await phrasePlaying(c, () => c.say("I don't know."), () => m.asked > asked);
    const plans = () => stages.mock.calls.filter((a) => a[1].length > 0).length;
    m.release();
    await pause();
    expect(c.speaker.cut).toBe(0);
    await c.clock.advance(ACK_HOLD_LIMIT_MS - 1);
    await pause();
    expect(plans()).toBe(0);
    await c.clock.advance(1);
    await waitFor(() => plans() > 0, "the answer's plan");
    expect(ACK_HOLD_LIMIT_MS).toBe(3000);
    c.speaker.release();
  });
});

// #589: danger known to guidance queued, with the close call hanging on the model's 30 s limit. Fakes only: this proves
// the order of events and when the words are given to the voice, on the clock the test moves. It proves nothing about a
// real model, speech-to-text, voice or speaker.
describe("#589: the safety guidance does not wait for the close", () => {
  const WORDS = { concern: "Thank you for telling me.", immediate: "Your safety comes first." } as const;
  const LAST = { concern: "Please tell a grown-up you trust who can help keep you safe.", immediate: "If you are in danger, call 911." } as const;
  /** What the immediate guidance's sentences carry at 1 ms a character, in 20 ms frames. */
  const WHOLE_GUIDANCE_S = 0.12;
  const MODEL_LIMIT_MS = 30_000;

  /** The first child call reads danger when released. Every later call hangs until it is released or the limit fails it. */
  function closeHangs(severity: "concern" | "immediate" = "immediate") {
    const inner = ruleMayaModel();
    let armed = false;
    let timers: Timers | null = null;
    let releaseDanger = () => {};
    const danger = new Promise<void>((r) => { releaseDanger = r; });
    const open = new Set<() => void>();
    const state = {
      asked: 0, knownAt: null as number | null, closesFailed: 0,
      get hanging() { return open.size; },
      releaseDanger: () => releaseDanger(),
      releaseClose: () => { for (const r of [...open]) r(); },
      arm(t: Timers) { armed = true; timers = t; },
      model: { id: "fake", promptVersion: inner.promptVersion, propose: async (input, signal) => {
        if (!armed || !input.transcript.some((l) => l.speaker === "child")) return inner.propose(input, signal);
        state.asked++;
        if (state.asked === 1) {
          await danger;
          state.knownAt = Date.now();
          return { version: PROPOSAL_VERSION, act: "safety", reading: { safety: severity }, parts: [] };
        }
        // As `withTimeLimit` in the real model: it answers, or it fails at the limit.
        await new Promise<void>((resolve, reject) => {
          const done = () => { open.delete(done); resolve(); };
          open.add(done);
          timers!.set(MODEL_LIMIT_MS, () => {
            if (!open.delete(done)) return;
            state.closesFailed++;
            reject(new Error("the model did not answer in time"));
          });
        });
        return inner.propose(input, signal);
      } } as MayaModel,
    };
    return state;
  }

  /** The time from danger known to the guidance given to `session.say`, moving the clock as the close call hangs. */
  function watchGuidance(c: Awaited<ReturnType<typeof voiceCall>>, m: ReturnType<typeof closeHangs>, words: string) {
    let queuedAt: number | null = null;
    const say = c.session.say.bind(c.session);
    vi.spyOn(c.session, "say").mockImplementation((...args) => {
      if (typeof args[0] === "string" && args[0].includes(words)) queuedAt ??= Date.now();
      return say(...args);
    });
    return async () => {
      m.releaseDanger();
      await waitFor(() => m.knownAt !== null, "the danger to be known");
      // Real time for the work between the two marks. The clock does not move, so it costs 0 ms on this clock.
      await pause();
      for (let step = 0; queuedAt === null && step * 50 < MODEL_LIMIT_MS + 2000; step++) await c.clock.advance(50);
      return queuedAt === null ? Infinity : queuedAt - m.knownAt!;
    };
  }
  const count = (said: readonly string[], text: string) => said.filter((t) => t === text).length;

  /** When the voice session closed (the call hung up), on the test's clock; null while it is open. */
  function watchClose(session: voice.AgentSession) {
    let at: number | null = null;
    const close = session.close.bind(session);
    vi.spyOn(session, "close").mockImplementation(() => { at ??= Date.now(); return close(); });
    return () => at;
  }

  /**
   * The close after the guidance adds no words (e00cf1f8: no model words, no bank phrase). So the guidance is the last
   * thing the child hears, and the call hangs up when the close is known: the session closes with no wait on the
   * test's clock, and the stored call ends. The child is never left in an open, silent call.
   */
  async function endsAfterGuidance(c: { said: () => readonly string[]; id: string; store: Awaited<ReturnType<typeof voiceCall>>["store"] }, o: { closedAt: () => number | null; knownAt: number; before: number; last?: string }) {
    expect(c.said().slice(o.before)).toEqual([]);
    expect(c.said().at(-1)).toBe(o.last ?? LAST.immediate);
    expect(o.closedAt()).toBe(o.knownAt);
    expect((await c.store.get(c.id))!.status).toBe("ended");
  }

  it.each(["immediate", "concern"] as const)("%s: guidance is queued at once, and heard while the close call hangs", async (severity) => {
    const m = closeHangs(severity);
    const c = await voiceCall({ model: m.model });
    m.arm(c.clock.timers);
    const measure = watchGuidance(c, m, WORDS[severity]);
    c.say("Someone is hurting me.");
    await waitFor(() => m.asked === 1, "the child turn's model call");

    expect(await measure()).toBe(0);
    await waitFor(() => m.hanging === 1, "the close call");
    await waitFor(() => c.said().includes(LAST[severity]), "the whole guidance in the voice");
    expect(m.hanging).toBe(1);
    // The transcript the child's screen reads holds it too, before the close.
    await waitFor(() => c.call.revision > 0, "the save");
    await c.call.settled();
    const line = () => c.calls.view(c.id).then((v) => v!.transcript.map((t) => t.text).join(" "));
    expect(await line()).toContain(WORDS[severity]);

    // The close comes after it, with no words, and the call ends as a safety call.
    const before = c.said().length;
    const closedAt = watchClose(c.session);
    m.releaseClose();
    const knownAt = Date.now();
    await waitFor(() => c.run.done !== null, "the call's end");
    await c.run.done;
    await endsAfterGuidance(c, { closedAt, knownAt, before, last: LAST[severity] });
    expect(count(c.said(), WORDS[severity])).toBe(1);
    expect((await c.calls.view(c.id))!.outcome).toMatchObject({ reason: "safety" });
    expect(c.samples[0]).toMatchObject({ outcome: "answered" });
    expect(sum(c.samples[0])).toBe(c.samples[0].answerMs);
  });

  it("the close call failing at its limit still closes after the guidance", async () => {
    const m = closeHangs();
    const c = await voiceCall({ model: m.model });
    m.arm(c.clock.timers);
    const measure = watchGuidance(c, m, WORDS.immediate);
    c.say("Someone is hurting me.");
    await waitFor(() => m.asked === 1, "the child turn's model call");
    expect(await measure()).toBe(0);
    await waitFor(() => m.hanging === 1, "the close call");
    await waitFor(() => c.said().includes(LAST.immediate), "the whole guidance in the voice");
    const before = c.said().length;
    const closedAt = watchClose(c.session);
    await c.clock.advance(MODEL_LIMIT_MS);
    const knownAt = Date.now();
    await waitFor(() => c.run.done !== null, "the call's end");
    await c.run.done;
    expect(m.closesFailed).toBe(1);
    await endsAfterGuidance(c, { closedAt, knownAt, before });
    expect(count(c.said(), WORDS.immediate)).toBe(1);
    expect((await c.calls.view(c.id))!.outcome).toMatchObject({ reason: "safety" });
  });

  it("a refused proposal with the danger in its reading gets the guidance with no repair call", async () => {
    const inner = ruleMayaModel();
    let armed = false;
    const asks: string[] = [];
    let releaseClose = () => {};
    const closing = new Promise<void>((r) => { releaseClose = r; });
    const model: MayaModel = { id: "fake", promptVersion: inner.promptVersion, propose: async (input, signal) => {
      if (!armed || !input.transcript.some((l) => l.speaker === "child")) return inner.propose(input, signal);
      asks.push(input.childTurn ?? "");
      if (asks.length === 1) return { version: PROPOSAL_VERSION, act: "guide", step: "ones", level: 4, reading: { safety: "immediate" }, parts: [{ talk: "Hmm." }] };
      await closing;
      return inner.propose(input, signal);
    } };
    const c = await voiceCall({ model });
    armed = true;
    c.say("Someone is hurting me.");
    await waitFor(() => c.said().includes(LAST.immediate), "the guidance, with no answer from the second call");
    // The one call after the refusal is the close, and it is still out.
    await pause();
    expect(asks).toHaveLength(2);
    releaseClose();
    await waitFor(() => c.run.done !== null, "the call's end");
    await c.run.done;
    const trace = (await c.store.get(c.id))!.trace!;
    const guided = trace.turns.find((t) => t.kind === "maya" && t.output?.act === "safety");
    expect(guided).toMatchObject({ kind: "maya", attempts: [{ source: "model" }, { source: "fallback" }] });
  });

  it("danger known with a phrase playing: the phrase stops, and the guidance does not wait for the close", async () => {
    const m = closeHangs();
    const c = await voiceCall({ model: m.model });
    m.arm(c.clock.timers);
    const measure = watchGuidance(c, m, WORDS.immediate);
    c.speaker.held = true;
    c.say("Someone is hurting me.");
    await waitFor(() => m.asked === 1, "the child turn's model call");
    await c.clock.advance(ACK_LIMIT_MS);
    await waitFor(() => acksIn(c.said()).length === 1, "the phrase");
    await waitFor(() => c.speaker.starts.length > 1, "the phrase's sound");
    const cut = c.speaker.cut;
    expect(await measure()).toBe(0);
    await waitFor(() => c.said().includes(LAST.immediate), "the guidance with the speaker still held");
    expect(c.speaker.cut).toBeGreaterThan(cut);
    expect(m.hanging).toBe(1);
    c.speaker.release();
    m.releaseClose();
  });

  // Item 2: decided, not assumed. An interruptible speech waits for `userSilenceEvent` in LiveKit's `ttsTask`, so words the
  // child is talking through are held. `allowInterruptions: false` would skip that wait and talk over the child.
  it("a child who is talking is heard first: queued at once, and played when they stop", async () => {
    const m = closeHangs();
    const speech = new ProbeSTT();
    const c = await voiceCall({ model: m.model, speech });
    m.arm(c.clock.timers);
    const measure = watchGuidance(c, m, WORDS.immediate);
    speech.says("Someone is hurting me.");
    await waitFor(() => m.asked === 1, "the child turn's model call");
    speech.send(stt.SpeechEventType.START_OF_SPEECH);
    await waitFor(() => c.session.userState === "speaking", "the child talking");
    const starts = c.speaker.starts.length;

    expect(await measure()).toBe(0);
    await pause();
    expect(c.said().join(" ")).not.toContain(WORDS.immediate);
    expect(c.speaker.starts.length).toBe(starts);
    speech.send(stt.SpeechEventType.END_OF_SPEECH);
    await waitFor(() => c.said().includes(LAST.immediate), "the guidance after the child stopped");
    expect(count(c.said(), WORDS.immediate)).toBe(1);
    m.releaseClose();
  });

  // Item 3. The start of the child's speech retires the board plan, and a retired plan's frames never reach the output.
  it("a noise during the guidance cuts it, so it plays once more, whole, and the call ends after that", async () => {
    const m = closeHangs();
    const speech = new ProbeSTT();
    const c = await voiceCall({ model: m.model, speech });
    m.arm(c.clock.timers);
    speech.says("Someone is hurting me.");
    await waitFor(() => m.asked === 1, "the child turn's model call");
    c.speaker.pace(1);
    m.releaseDanger();
    await waitFor(() => c.speaker.waitingToPlay && c.said().includes(WORDS.immediate), "the guidance's first frame");
    // A noise that never becomes words.
    speech.send(stt.SpeechEventType.START_OF_SPEECH);
    await waitFor(() => c.session.userState === "speaking", "the noise");
    c.speaker.play();
    await pause();
    speech.send(stt.SpeechEventType.END_OF_SPEECH);
    await waitFor(() => c.session.userState === "listening", "the noise's end");
    await waitFor(() => c.speaker.plays.at(-1)! >= WHOLE_GUIDANCE_S, "the whole guidance on the speaker");
    // What the noise cut: one playback that did not carry it whole, which nothing but the repeat makes up for.
    expect(c.speaker.plays.at(-2)).toBeLessThan(WHOLE_GUIDANCE_S);
    expect(count(c.said(), WORDS.immediate)).toBe(2);
    await waitFor(() => c.said().at(-1) === LAST.immediate, "the whole repeat in the voice");
    const before = c.said().length;
    await waitFor(() => m.hanging === 1, "the close call");
    const closedAt = watchClose(c.session);
    m.releaseClose();
    const knownAt = Date.now();
    await waitFor(() => c.run.done !== null, "the call's end");
    await c.run.done;
    await endsAfterGuidance(c, { closedAt, knownAt, before });
    expect(count(c.said(), WORDS.immediate)).toBe(2);
  });

  it("a second noise during the repeat does not start a third", async () => {
    const m = closeHangs();
    const speech = new ProbeSTT();
    const c = await voiceCall({ model: m.model, speech });
    m.arm(c.clock.timers);
    const noise = async (paceNext = false) => {
      speech.send(stt.SpeechEventType.START_OF_SPEECH);
      await waitFor(() => c.session.userState === "speaking", "the noise");
      c.speaker.play();
      if (paceNext) c.speaker.pace(1);
      await pause();
      speech.send(stt.SpeechEventType.END_OF_SPEECH);
      await waitFor(() => c.session.userState === "listening", "the noise's end");
    };
    speech.says("Someone is hurting me.");
    await waitFor(() => m.asked === 1, "the child turn's model call");
    c.speaker.pace(1);
    m.releaseDanger();
    await waitFor(() => c.speaker.waitingToPlay && count(c.said(), WORDS.immediate) === 1, "the guidance's first frame");
    await noise(true);
    await waitFor(() => c.speaker.waitingToPlay && count(c.said(), WORDS.immediate) === 2, "the repeat's first frame");
    await noise();
    await pause();
    await pause();
    expect(count(c.said(), WORDS.immediate)).toBe(2);
    m.releaseClose();
    await waitFor(() => c.run.done !== null, "the call's end");
    await c.run.done;
  });

  it("guidance cut by a dropped connection plays when the child is back", async () => {
    const m = closeHangs();
    const c = await voiceCall({ model: m.model });
    m.arm(c.clock.timers);
    c.say("Someone is hurting me.");
    await waitFor(() => m.asked === 1, "the child turn's model call");
    c.speaker.pace(1);
    m.releaseDanger();
    await waitFor(() => c.speaker.waitingToPlay && c.said().includes(WORDS.immediate), "the guidance's first frame");
    await c.run.childLeft("dropped");
    c.speaker.play();
    await pause();
    await pause();
    expect(count(c.said(), WORDS.immediate)).toBe(1);
    await c.run.childJoined();
    await waitFor(() => count(c.said(), WORDS.immediate) === 2, "the guidance again");
    await waitFor(() => c.speaker.plays.at(-1)! >= WHOLE_GUIDANCE_S, "the whole guidance on the speaker");
    await waitFor(() => m.hanging === 1, "the close call");
    m.releaseClose();
    await waitFor(() => c.run.done !== null, "the call's end");
    await c.run.done;
  });

  it("danger known while the child is away: they hear it when they are back", async () => {
    const m = closeHangs();
    const c = await voiceCall({ model: m.model });
    m.arm(c.clock.timers);
    c.say("Someone is hurting me.");
    await waitFor(() => m.asked === 1, "the child turn's model call");
    await c.run.childLeft("dropped");
    m.releaseDanger();
    await waitFor(() => m.hanging === 1, "the close call");
    await pause();
    expect(c.said().join(" ")).not.toContain(WORDS.immediate);
    await c.run.childJoined();
    await waitFor(() => c.said().includes(LAST.immediate), "the guidance on return");
    expect(count(c.said(), WORDS.immediate)).toBe(1);
    m.releaseClose();
    await waitFor(() => c.run.done !== null, "the call's end");
    await c.run.done;
  });

  it("the call ended while the child was away: they hear the guidance when they are back, and the call ends", async () => {
    const m = closeHangs();
    const c = await voiceCall({ model: m.model });
    m.arm(c.clock.timers);
    c.say("Someone is hurting me.");
    await waitFor(() => m.asked === 1, "the child turn's model call");
    await c.run.childLeft("dropped");
    m.releaseDanger();
    await waitFor(() => m.hanging === 1, "the close call");
    m.releaseClose();
    await waitFor(() => c.call.ended, "the close");
    await pause();
    await c.run.childJoined();
    await waitFor(() => c.run.done !== null, "the call's end");
    await c.run.done;
    expect(c.said()).toContain(LAST.immediate);
    expect(count(c.said(), WORDS.immediate)).toBe(1);
    expect((await c.store.get(c.id))!.status).toBe("ended");
  });

  it("all at once: the child's words cut the guidance with the close call out, and the repeat comes before the call ends", async () => {
    const m = closeHangs();
    const speech = new ProbeSTT();
    const c = await voiceCall({ model: m.model, speech });
    m.arm(c.clock.timers);
    const says = vi.spyOn(c.session, "say");
    speech.says("Someone is hurting me.");
    await waitFor(() => m.asked === 1, "the child turn's model call");
    c.speaker.pace(1);
    m.releaseDanger();
    await waitFor(() => c.speaker.waitingToPlay && c.said().includes(WORDS.immediate), "the guidance's first frame");
    await waitFor(() => m.hanging === 1, "the close call");
    // Real words over the guidance, which end the child's turn, and start a new close call beside the first.
    speech.says("He is in the kitchen.");
    await waitFor(() => m.asked === 3, "the new turn's close call");
    c.speaker.play();
    await waitFor(() => c.speaker.plays.at(-1)! >= WHOLE_GUIDANCE_S, "the whole guidance, with the close call still out");
    expect(m.hanging).toBeGreaterThan(0);
    expect(count(c.said(), WORDS.immediate)).toBe(2);
    expect(says.mock.calls.map(([text]) => text)).toEqual([SAFETY_GUIDANCE.immediate, SAFETY_GUIDANCE.immediate]);
    await waitFor(() => c.said().at(-1) === LAST.immediate, "the whole repeat in the voice");
    const before = c.said().length;
    const closedAt = watchClose(c.session);
    m.releaseClose();
    const knownAt = Date.now();
    await waitFor(() => c.run.done !== null, "the call's end");
    await c.run.done;
    // Both close calls answer with no words: nothing is queued after the repeat.
    expect(says.mock.calls.map(([text]) => text)).toEqual([SAFETY_GUIDANCE.immediate, SAFETY_GUIDANCE.immediate]);
    await endsAfterGuidance(c, { closedAt, knownAt, before });
    expect(count(c.said(), WORDS.immediate)).toBe(2);
    expect((await c.calls.view(c.id))!.outcome).toMatchObject({ reason: "safety" });
  });

  it("danger that rises during the close call: the new guidance stops the old one and goes first", async () => {
    const inner = ruleMayaModel();
    let armed = false;
    let asks = 0;
    const model: MayaModel = { id: "fake", promptVersion: inner.promptVersion, propose: async (input, signal) => {
      if (!armed || !input.transcript.some((l) => l.speaker === "child")) return inner.propose(input, signal);
      asks++;
      if (asks === 1) return { version: PROPOSAL_VERSION, act: "safety", reading: { safety: "concern" }, parts: [] };
      if (asks === 2) return { version: PROPOSAL_VERSION, act: "close", reading: { safety: "immediate" }, parts: [{ warm: "closing" }] };
      return inner.propose(input, signal);
    } };
    const c = await voiceCall({ model });
    armed = true;
    const says = vi.spyOn(c.session, "say");
    const closedAt = watchClose(c.session);
    c.say("Someone is hurting me.");
    await waitFor(() => c.run.done !== null, "the call's end");
    await c.run.done;
    // The close that read the worse danger adds no words of its own: the new guidance is the last thing said.
    expect(says.mock.calls.map(([text]) => text)).toEqual([SAFETY_GUIDANCE.concern, SAFETY_GUIDANCE.immediate]);
    expect(c.said().at(-1)).toBe(LAST.immediate);
    expect(closedAt()).not.toBeNull();
    expect((await c.store.get(c.id))!.status).toBe("ended");
    expect((await c.calls.view(c.id))!.outcome).toMatchObject({ reason: "safety", safetySeverity: "immediate" });
  });

  it("a worker that takes over after the guidance closes the call, with no second guidance", async () => {
    const m = closeHangs();
    const c = await voiceCall({ model: m.model });
    m.arm(c.clock.timers);
    c.say("Someone is hurting me.");
    await waitFor(() => m.asked === 1, "the child turn's model call");
    m.releaseDanger();
    await waitFor(() => c.said().includes(LAST.immediate), "the guidance");
    await waitFor(() => m.hanging === 1, "the close call");
    await c.call.settled();
    // The first worker's process is gone, with its close call. Its saved record has the guidance as said.
    const opened = await c.calls.openVoice(c.id, { speechToText: "fake", voice: "fake" }, null);
    if (!opened.ok) throw new Error(opened.error);
    const providers = voiceProviders({});
    if (!providers.ok) throw new Error("fake providers");
    const made = await makeProviders(providers, { fakeMsPerChar: 1 });
    const session = voiceSession(made, { endpointingMs: 20, aecWarmupDuration: 0 });
    session.input.audio = new SilentMicrophone();
    session.output.audio = new Speaker();
    const run = new VoiceCallRun(session, opened.call, { timers: c.clock.timers, notify: () => {} });
    await run.agentJoined();
    await session.start({ agent: run.agent });
    await run.childJoined();
    expect(opened.call.session.state).toBe("SAFETY");
    expect(opened.call.session.safety.guided).toBe(true);
    await c.clock.advance(0);
    await waitFor(() => m.hanging === 2, "the new worker's close call");
    m.releaseClose();
    await waitFor(() => run.done !== null, "the new worker's end of the call");
    await run.done;
    expect((made.tts as FakeTTS).spoken.join(" ")).not.toContain(WORDS.immediate);
    expect((await c.store.get(c.id))!.status).toBe("ended");
    expect((await c.calls.view(c.id))!.outcome).toMatchObject({ reason: "safety" });
  });

  // P1 of the review of PR #616: a check-in or close from the silence clock went past the guidance's wait.
  it("a takeover whose close call reads worse danger: the close does not take the new guidance's audio", async () => {
    const inner = ruleMayaModel();
    let armed = false;
    let asks = 0;
    let releaseFinal = () => {};
    const final = new Promise<void>((r) => { releaseFinal = r; });
    const never = new Promise<never>(() => {});
    const model: MayaModel = { id: "fake", promptVersion: inner.promptVersion, propose: async (input, signal) => {
      if (!armed || !input.transcript.some((l) => l.speaker === "child")) return inner.propose(input, signal);
      asks++;
      if (asks === 1) return { version: PROPOSAL_VERSION, act: "safety", reading: { safety: "concern" }, parts: [] };
      // The first worker's close call. Its process is gone, so this never comes back.
      if (asks === 2) return never;
      if (asks === 3) return { version: PROPOSAL_VERSION, act: "close", reading: { safety: "immediate" }, parts: [{ warm: "closing" }] };
      await final;
      return inner.propose(input, signal);
    } };
    const c = await voiceCall({ model });
    armed = true;
    c.say("Someone is hurting me.");
    await waitFor(() => c.said().includes(LAST.concern) && asks === 2, "the concern guidance, with the close call out");
    await waitFor(() => c.session.agentState === "listening", "the concern guidance's end");
    await c.call.settled();

    const opened = await c.calls.openVoice(c.id, { speechToText: "fake", voice: "fake" }, null);
    if (!opened.ok) throw new Error(opened.error);
    const config = voiceProviders({});
    if (!config.ok) throw new Error("fake providers");
    const made = await makeProviders(config, { fakeMsPerChar: 1 });
    const session = voiceSession(made, { endpointingMs: 20, aecWarmupDuration: 0 });
    const speaker = new Speaker();
    session.input.audio = new SilentMicrophone();
    session.output.audio = speaker;
    const receiver = createBoardReceiver({ sessionId: c.id, clock: () => Date.now() });
    const sender = createBoardSender({ sessionId: c.id, senderId: "worker-2", transport: createMemoryTransport(receiver) });
    const board = createBoardSpeech({ sender, now: () => Date.now(), observe: (snapshot) => opened.call.observeBoard(snapshot) });
    const run = new VoiceCallRun(session, opened.call, { board, timers: c.clock.timers, notify: () => {} });
    await run.agentJoined();
    await session.start({ agent: run.agent });
    run.attachBoardAudio();
    const says = vi.spyOn(session, "say");
    speaker.pace(1);
    await run.childJoined();
    await c.clock.advance(0);
    const spoken = () => (made.tts as FakeTTS).spoken;
    await waitFor(() => asks === 4 && speaker.waitingToPlay && spoken().includes(WORDS.immediate), "the immediate guidance's first frame, with the last close call out");

    // The close comes back with the guidance still playing.
    const closedAt = watchClose(session);
    releaseFinal();
    await pause();
    expect(says.mock.calls.map(([text]) => text)).toEqual([SAFETY_GUIDANCE.immediate]);
    // The guidance still plays, so nothing has closed the session under it.
    expect(closedAt()).toBeNull();
    speaker.play();
    await waitFor(() => run.done !== null, "the new worker's end of the call");
    await run.done;
    expect(speaker.plays.filter((seconds) => seconds >= WHOLE_GUIDANCE_S).length).toBeGreaterThan(0);
    // The close adds no words, so it cannot take the guidance's audio: the guidance is the last speech, and the call hangs up.
    expect(says.mock.calls.map(([text]) => text)).toEqual([SAFETY_GUIDANCE.immediate]);
    expect(spoken().at(-1)).toBe(LAST.immediate);
    expect(closedAt()).not.toBeNull();
    expect(count(spoken(), WORDS.immediate)).toBe(1);
    expect((await c.store.get(c.id))!.status).toBe("ended");
    expect((await c.calls.view(c.id))!.outcome).toMatchObject({ reason: "safety", safetySeverity: "immediate" });
  });

  // P2 of the review of PR #616: with the close dropped and no guidance owed, nothing ended the stored call.
  it("the child hears the guidance, leaves during the close call and comes back after it: the call ends with no more words", async () => {
    const m = closeHangs();
    const c = await voiceCall({ model: m.model });
    m.arm(c.clock.timers);
    const says = vi.spyOn(c.session, "say");
    c.say("Someone is hurting me.");
    await waitFor(() => m.asked === 1, "the child turn's model call");
    m.releaseDanger();
    await waitFor(() => c.said().includes(LAST.immediate) && c.session.agentState === "listening", "the whole guidance");
    await waitFor(() => m.hanging === 1, "the close call");
    await c.run.childLeft("dropped");
    m.releaseClose();
    await waitFor(() => c.call.ended, "the controller's close");
    await pause();
    await c.call.settled();
    expect(says).toHaveBeenCalledTimes(1);
    expect((await c.store.get(c.id))!.status).toBe("live");
    expect(c.call.pendingFinal).toBeNull();

    const before = c.said().length;
    const closedAt = watchClose(c.session);
    await c.run.childJoined();
    const knownAt = Date.now();
    await waitFor(() => c.run.done !== null, "the call's end, long before the deadline");
    await c.run.done;
    // The owed close has no words: the child is back to a call that hangs up at once, not an open, silent one.
    expect(says).toHaveBeenCalledTimes(1);
    await endsAfterGuidance(c, { closedAt, knownAt, before });
    expect(count(c.said(), WORDS.immediate)).toBe(1);
    const stored = (await c.store.get(c.id))!;
    expect(stored.status).toBe("ended");
    expect(stored.trace!.outcome).toMatchObject({ reason: "safety" });
    expect(stored.learningEventId).not.toBeNull();
  });

  it("an ordinary close that ends while the child is away plays when they are back, and the call ends", async () => {
    const m = heldModel();
    const c = await voiceCall({ model: m.model, ackLimitMs: 0 });
    // The rule player's whole ending, as a saved call replays it: the answer, the writing, then the close.
    for (const [n, text] of ["66", "I wrote it."].entries()) {
      c.say(text);
      await waitFor(() => c.samples.length === n + 1 && c.session.agentState === "listening", `the answer to "${text}"`);
    }
    const before = c.said().length;
    const says = vi.spyOn(c.session, "say");
    const asked = m.asked;
    m.hold();
    c.say("yes");
    await waitFor(() => m.asked > asked, "the slow model call");
    await c.run.childLeft("dropped");
    m.release();
    await waitFor(() => c.call.ended, "the controller's close");
    await pause();
    await c.call.settled();
    expect(c.said().length).toBe(before);
    expect((await c.store.get(c.id))!.status).toBe("live");
    await c.run.childJoined();
    await waitFor(() => c.run.done !== null, "the call's end");
    await c.run.done;
    expect(says).toHaveBeenCalledTimes(1);
    expect(c.said().length).toBeGreaterThan(before);
    expect((await c.calls.view(c.id))!.outcome).toMatchObject({ reason: "solved" });
    expect((await c.store.get(c.id))!.status).toBe("ended");
  });

  it("a late transcript while the child is away does not erase the close they are owed", async () => {
    const m = heldModel();
    const c = await voiceCall({ model: m.model, ackLimitMs: 0 });
    for (const [n, text] of ["66", "I wrote it."].entries()) {
      c.say(text);
      await waitFor(() => c.samples.length === n + 1 && c.session.agentState === "listening", `the answer to "${text}"`);
    }
    const before = c.said().length;
    const asked = m.asked;
    m.hold();
    c.say("yes");
    await waitFor(() => m.asked > asked, "the slow model call");
    await c.run.childLeft("dropped");
    m.release();
    await waitFor(() => c.call.ended, "the controller's close");
    await pause();
    await c.call.settled();
    // The ended call answers this with no words; the saved close must survive it.
    c.say("are you there");
    await pause();
    await c.call.settled();
    await c.run.childJoined();
    await waitFor(() => c.run.done !== null, "the call's end");
    await c.run.done;
    expect(c.said().length).toBeGreaterThan(before);
    expect((await c.store.get(c.id))!.status).toBe("ended");
  });

  it("a silence close that ends while the child is away plays when they are back, and the call ends", async () => {
    const m = heldModel();
    const c = await voiceCall({ model: m.model, ackLimitMs: 0 });
    c.say("I don't know.");
    await waitFor(() => c.samples.length === 1 && c.session.agentState === "listening", "the answer");
    // The check-in after the quiet, then the tick that closes for no response, held at the model. The tick saves
    // "checked" before the voice has the check-in's words, so wait until the child has heard it: the clock jump below
    // must not reach the close while the check-in is still on its way (#622).
    const saidBefore = c.said().length;
    const playedBefore = c.speaker.plays.length;
    await c.clock.advance(15_000);
    await waitFor(() => c.call.session.silence === "checked" && c.said().length > saidBefore
      && c.speaker.plays.length > playedBefore && c.session.agentState === "listening", "the check-in, heard");
    const asked = m.asked;
    m.hold();
    await c.clock.advance(30_000);
    await waitFor(() => m.asked > asked, "the close's model call");
    const before = c.said().length;
    await c.run.childLeft("dropped");
    m.release();
    await waitFor(() => c.call.ended, "the controller's close");
    await pause();
    await c.call.settled();
    expect(c.said().length).toBe(before);
    expect((await c.store.get(c.id))!.status).toBe("live");
    await c.run.childJoined();
    await waitFor(() => c.run.done !== null, "the call's end");
    await c.run.done;
    expect(c.said().length).toBeGreaterThan(before);
    expect((await c.store.get(c.id))!.status).toBe("ended");
  });

  it("a deadline close whose connection changed during the model call still plays, and the call ends", async () => {
    const inner = ruleMayaModel();
    let writing = false;
    let release = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    let asked = 0;
    const model: MayaModel = { id: "fake", promptVersion: inner.promptVersion, propose: async (input, signal) => {
      if (!writing) return inner.propose(input, signal);
      asked++;
      await gate;
      return { version: PROPOSAL_VERSION, act: "close", parts: [{ warm: "closing" }] };
    } };
    const c = await voiceCall({ model, ackLimitMs: 0, limitMs: 62_000 });
    c.say("I got 66.");
    await waitFor(() => c.samples.length === 1 && c.session.agentState === "listening", "the accepted answer");
    writing = true;
    const says = vi.spyOn(c.session, "say");
    c.say("I wrote it.");
    await waitFor(() => asked === 1, "the slow model call");
    await c.run.childLeft("dropped");
    await c.run.childJoined();
    c.clock.move(3000);
    release();
    await waitFor(() => c.run.done !== null, "the call's end");
    await c.run.done;
    expect(says).toHaveBeenCalledTimes(1);
    expect((await c.store.get(c.id))!.status).toBe("ended");
  });

  it("guidance heard whole plays once, whatever the child says after it", async () => {
    const m = closeHangs();
    const speech = new ProbeSTT();
    const c = await voiceCall({ model: m.model, speech });
    m.arm(c.clock.timers);
    speech.says("Someone is hurting me.");
    await waitFor(() => m.asked === 1, "the child turn's model call");
    m.releaseDanger();
    await waitFor(() => c.said().includes(LAST.immediate) && c.session.agentState === "listening", "the guidance");
    await waitFor(() => m.hanging === 1, "the close call");
    // The child talks, with the close call out. The new turn replaces the call, and the close answers it.
    speech.says("Okay.");
    await waitFor(() => m.hanging === 2 || m.asked === 3, "the new close call");
    m.releaseClose();
    await waitFor(() => c.run.done !== null, "the call's end");
    await c.run.done;
    expect(count(c.said(), WORDS.immediate)).toBe(1);
    expect((await c.calls.view(c.id))!.outcome).toMatchObject({ reason: "safety" });
  });

  it("the close call answering during the guidance does not take its audio", async () => {
    const m = closeHangs();
    const c = await voiceCall({ model: m.model });
    m.arm(c.clock.timers);
    const says = vi.spyOn(c.session, "say");
    c.say("Someone is hurting me.");
    await waitFor(() => m.asked === 1, "the child turn's model call");
    c.speaker.pace(1);
    m.releaseDanger();
    await waitFor(() => c.speaker.waitingToPlay && c.said().includes(WORDS.immediate), "the guidance's first frame");
    await waitFor(() => m.hanging === 1, "the close call");
    const closedAt = watchClose(c.session);
    m.releaseClose();
    await pause();
    // The close is back, and nothing is queued: a queued plan would retire this one. The guidance still plays, so the
    // session stays open under it.
    expect(says.mock.calls).toHaveLength(1);
    expect(closedAt()).toBeNull();
    await waitFor(() => c.said().at(-1) === LAST.immediate, "the whole guidance in the voice");
    const before = c.said().length;
    c.speaker.play();
    await waitFor(() => c.run.done !== null, "the call's end");
    await c.run.done;
    expect(c.speaker.plays.filter((seconds) => seconds >= WHOLE_GUIDANCE_S).length).toBeGreaterThan(0);
    expect(count(c.said(), WORDS.immediate)).toBe(1);
    expect(says.mock.calls).toHaveLength(1);
    await endsAfterGuidance(c, { closedAt, knownAt: Date.now(), before });
  });

  it.each([["with words", false], ["with no words", true]] as const)("the call's end waits for guidance that is still playing, the close %s", async (_name, silent) => {
    const m = closeHangs();
    const c = await voiceCall({ model: m.model });
    m.arm(c.clock.timers);
    if (silent) {
      const child = c.call.child.bind(c.call);
      c.call.child = async (...args) => ({ ...(await child(...args)), say: [] });
    }
    c.speaker.held = true;
    c.say("Someone is hurting me.");
    await waitFor(() => m.asked === 1, "the child turn's model call");
    m.releaseDanger();
    await waitFor(() => c.said().includes(LAST.immediate), "the guidance");
    await waitFor(() => m.hanging === 1, "the close call");
    m.releaseClose();
    await pause();
    await pause();
    // Still playing: nothing has closed the session under it.
    expect(c.run.done).toBeNull();
    c.speaker.release();
    await waitFor(() => c.run.done !== null, "the call's end");
    await c.run.done;
    expect((await c.calls.view(c.id))!.outcome).toMatchObject({ reason: "safety" });
  });

  it("a worker that lost the call to another says no guidance", async () => {
    const m = closeHangs();
    const c = await voiceCall({ model: m.model, board: false });
    m.arm(c.clock.timers);
    const says = vi.spyOn(c.session, "say");
    c.say("Someone is hurting me.");
    await waitFor(() => m.asked === 1, "the child turn's model call");
    const replacement = await c.calls.openVoice(c.id, { speechToText: "fake", voice: "fake" }, null);
    if (!replacement.ok) throw new Error(replacement.error);
    // The old worker learns it is replaced at its next save, which is the phrase's.
    await c.clock.advance(ACK_LIMIT_MS);
    await waitFor(() => c.call.replaced, "the old worker to learn");
    m.releaseDanger();
    await waitFor(() => m.hanging === 1 || m.knownAt !== null, "the danger");
    await pause();
    expect(says).not.toHaveBeenCalled();
    m.releaseClose();
  });

  it("no silence check-in starts between the guidance and the close", async () => {
    const m = closeHangs();
    const c = await voiceCall({ model: m.model });
    m.arm(c.clock.timers);
    const ticks = vi.spyOn(c.call, "tick");
    c.say("Someone is hurting me.");
    await waitFor(() => m.asked === 1, "the child turn's model call");
    m.releaseDanger();
    await waitFor(() => c.said().includes(LAST.immediate) && c.session.agentState === "listening", "the guidance");
    // The closing minute's tick falls inside the hanging close call.
    await c.clock.advance(9 * 60_000);
    await pause();
    expect(ticks).not.toHaveBeenCalled();
    m.releaseClose();
    await waitFor(() => c.run.done !== null, "the call's end");
    await c.run.done;
  });
});

// The re-review of PR #577, on #589.
describe("#589: the phrase that never ends, and a reply that crosses into the close", () => {
  it("the 3 s limit stops the phrase's speech and queues the answer on its own", async () => {
    const m = heldModel();
    const c = await voiceCall({ model: m.model });
    const says = vi.spyOn(c.session, "say");
    const asked = m.asked;
    m.hold();
    c.speaker.held = true;
    c.say("I don't know.");
    await waitFor(() => m.asked > asked, "the model call");
    await c.clock.advance(ACK_LIMIT_MS);
    await waitFor(() => acksIn(c.said()).length === 1, "the phrase");
    await waitFor(() => c.speaker.starts.length > 1, "the phrase's sound");
    const before = c.said().length;
    m.release();
    await pause();
    expect(c.speaker.cut).toBe(0);
    expect(says).not.toHaveBeenCalled();
    await c.clock.advance(ACK_HOLD_LIMIT_MS - 1);
    await pause();
    expect(c.speaker.cut).toBe(0);

    // The phrase's end never comes. The speaker is still held, so nothing below comes from a finished playback.
    await c.clock.advance(1);
    await waitFor(() => c.speaker.cut > 0, "the phrase's speech to stop");
    await waitFor(() => says.mock.calls.length === 1, "the answer as its own speech");
    await waitFor(() => c.said().length > before, "the answer in the voice");
    expect(acksIn(c.said().slice(before))).toEqual([]);
    await waitFor(() => c.samples.length === 1, "the sample");
    expect(c.samples[0]).toMatchObject({ outcome: "answered", ackHeard: true });
    expect(c.samples[0].parts!.ackHoldMs).toBe(ACK_HOLD_LIMIT_MS);
    expect(sum(c.samples[0])).toBe(c.samples[0].answerMs);
    c.speaker.release();
  });

  it("the 3 s limit stops the phrase with the model still working, and the answer comes on its own later", async () => {
    const m = heldModel();
    const c = await voiceCall({ model: m.model });
    const says = vi.spyOn(c.session, "say");
    const asked = m.asked;
    m.hold();
    c.speaker.held = true;
    c.say("I don't know.");
    await waitFor(() => m.asked > asked, "the model call");
    await c.clock.advance(ACK_LIMIT_MS);
    await waitFor(() => c.speaker.starts.length > 1, "the phrase's sound");
    const before = c.said().length;
    await c.clock.advance(ACK_HOLD_LIMIT_MS);
    await waitFor(() => c.speaker.cut > 0, "the phrase's speech to stop");
    expect(says).not.toHaveBeenCalled();
    m.release();
    await waitFor(() => says.mock.calls.length === 1, "the answer as its own speech");
    await waitFor(() => c.said().length > before, "the answer in the voice");
    c.speaker.release();
  });

  // Changed on 2026-11-13: the voice provider ends a stream about 1 s after its last audio, so an answer written into
  // the phrase's stream later was lost with no sound (Savar's call 01f456de). A phrase that played means a new speech.
  it("a phrase that ends in time sends the answer as speech of its own, after the phrase, without cutting it", async () => {
    const m = heldModel();
    const c = await voiceCall({ model: m.model });
    const says = vi.spyOn(c.session, "say");
    const asked = m.asked;
    m.hold();
    c.speaker.held = true;
    c.say("I don't know.");
    await waitFor(() => m.asked > asked, "the model call");
    await c.clock.advance(ACK_LIMIT_MS);
    await waitFor(() => c.speaker.starts.length > 1, "the phrase's sound");
    const before = c.said().length;
    m.release();
    await pause();
    // The answer waits for the phrase to end: nothing is queued while it plays.
    expect(says).not.toHaveBeenCalled();
    c.speaker.release();
    await waitFor(() => says.mock.calls.length === 1, "the answer as its own speech");
    await waitFor(() => c.said().length > before, "the answer in the voice");
    expect(acksIn(c.said().slice(before))).toEqual([]);
    await waitFor(() => c.samples.length === 1, "the sample");
    expect(c.samples[0]).toMatchObject({ outcome: "answered", ackHeard: true });
    expect(c.speaker.cut).toBe(0);
  });

  it("a solved child's slow reply that crosses into the close stops the phrase and is queued at once", async () => {
    const inner = ruleMayaModel();
    let writing = false;
    let release = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    let asked = 0;
    const model: MayaModel = { id: "fake", promptVersion: inner.promptVersion, propose: async (input, signal) => {
      if (!writing) return inner.propose(input, signal);
      asked++;
      await gate;
      return { version: PROPOSAL_VERSION, act: "close", parts: [{ warm: "closing" }] };
    } };
    // Closing starts 2 s into this call. The child has solved it before that, on a clock that has not moved.
    const c = await voiceCall({ model, limitMs: 62_000 });
    c.say("I got 66.");
    await waitFor(() => c.samples.length === 1 && c.session.agentState === "listening", "the accepted answer");
    expect(c.call.session.solved).not.toBeNull();
    expect(c.call.session.state).not.toBe("TIME_CLOSE");
    writing = true;
    const say = c.session.say.bind(c.session);
    let queuedAt: number | null = null;
    vi.spyOn(c.session, "say").mockImplementation((...args) => { queuedAt ??= Date.now(); return say(...args); });
    c.speaker.held = true;
    c.say("I wrote it.");
    await waitFor(() => asked === 1, "the slow model call");
    await c.clock.advance(ACK_LIMIT_MS);
    await waitFor(() => acksIn(c.said()).length === 1, "the phrase");
    await waitFor(() => c.speaker.starts.length > 1, "the phrase's sound");
    const cut = c.speaker.cut;
    // Past the closing time, with the phrase still playing, its 3 s limit far off, and the answer not back yet.
    c.clock.move(1000);
    const crossedAt = Date.now();
    release();
    await waitFor(() => c.call.session.outcome !== null, "the close");
    expect(c.call.session.outcome).toMatchObject({ reason: "solved" });
    await pause();
    for (let step = 0; queuedAt === null && step < 20; step++) await c.clock.advance(50);
    expect((queuedAt ?? Infinity) - crossedAt).toBeLessThanOrEqual(50);
    await waitFor(() => c.speaker.cut > cut, "the phrase to stop");
    c.speaker.release();
  });
});
