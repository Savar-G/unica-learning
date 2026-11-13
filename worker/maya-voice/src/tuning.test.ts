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
import { memoryWordingHistoryStore, openingLine } from "@/lib/maya";
import { mayaCalls, type CallSeams } from "@/lib/maya-call";
import { memoryCallStore, memoryConnectionLog } from "@/lib/maya-call-memory";
import { ruleConversationalModel, ruleMayaModel } from "@/lib/maya-model-fake";
import type { MayaModel } from "@/lib/maya-model";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { asksForNumber, GREETING_ID, GREETING_TEXT, openingAsksForNumber, turnSilences, VOICE_TUNING_DEFAULTS, voiceProviders, type TurnSilence } from "@/lib/maya-voice";
import type { QuestionPackage } from "@/lib/question-package";
import { voiceOpening } from "./opening";
import { spokenMath } from "@/lib/maya-voice-spoken";
import type { VoiceCall } from "@/lib/maya-call";
import { VoiceCallRun, voiceSession, type Timers } from "./agent";
import { FakeTTS } from "./fake-providers";
import { makeProviders } from "./providers";

// The tuning of a voice call for children (docs/maya-voice.md, "Tuning for children"): the greeting, the longer wait for a
// number, and the extra wait after a number word that can go on. Through LiveKit's own pipeline with the fake voice and
// a speech-to-text the test drives one event at a time. The system clock is frozen and only the test moves it. The fakes
// prove the order of events. They prove nothing about how the real speech-to-text ends a turn.

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

/** The child's speaker: it plays at once and reports each playback. */
class Speaker extends voice.AudioOutput {
  private captured = 0;
  private pendingStarts = 0;
  constructor() { super(24_000); }
  override async captureFrame(frame: AudioFrame) {
    const before = this.capturedPlayoutSegments;
    await super.captureFrame(frame);
    this.captured += frame.samplesPerChannel / frame.sampleRate;
    if (this.capturedPlayoutSegments > before) {
      this.pendingStarts = this.capturedPlayoutSegments;
      this.onPlaybackStarted(Date.now());
    }
  }
  private finish(interrupted: boolean) {
    if (this.pendingPlayoutSegments > 0) this.onPlaybackFinished({ playbackPosition: interrupted ? 0 : this.captured, interrupted });
    this.captured = 0;
  }
  override flush() { super.flush(); this.finish(false); }
  override clearBuffer() { this.finish(true); }
}

/** A speech-to-text the test drives one event at a time. */
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

/** Timers on the frozen system clock. `advance` moves it and runs what is due. */
function handClock() {
  let next = 0;
  const due = new Map<number, { at: number; run: () => void }>();
  const timers: Timers = {
    now: () => Date.now(),
    set: (ms, run) => { due.set(++next, { at: Date.now() + ms, run }); return next; },
    clear: (h) => void due.delete(h as number),
  };
  const advance = async (ms: number) => {
    vi.setSystemTime(Date.now() + ms);
    for (const [h, t] of [...due].sort((a, b) => a[1].at - b[1].at)) {
      if (t.at > Date.now()) continue;
      due.delete(h);
      t.run();
    }
    await new Promise<void>((resolve) => setImmediate(resolve));
  };
  return { timers, advance, pending: () => due.size };
}

const waitFor = async (check: () => boolean, what: string) => {
  const end = performance.now() + 10_000;
  while (!check()) {
    if (performance.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 5));
  }
};
const pause = () => new Promise((r) => setTimeout(r, 120));

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

const GREETED = { greeting: GREETING_TEXT } as const;
/** The voice gets each sentence on its own, so the greeting reaches it in three pieces; the pieces joined are the words. */
const heard = (said: readonly string[]) => said.join(" ");
const times = (text: string, part: string) => text.split(part).length - 1;

async function voiceCall(options: { greeting?: boolean; numberContinueMs?: number; patience?: { normal: TurnSilence; number: TurnSilence; set(limits: TurnSilence): void }; speech?: ProbeSTT; opening?: boolean; workerOpening?: boolean | string; model?: MayaModel; beforeJoin?(call: VoiceCall): void } = {}) {
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
    // The worker speaks the opening itself only in a conversational call (D-341), as every real call is now.
    model: (id) => (id === null || id === "fake" ? options.model ?? (options.workerOpening ? ruleConversationalModel() : ruleMayaModel()) : null),
    isTestFamily: async (p) => p === PARENT,
    clock: () => Date.now(),
    newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
    seed: () => 42,
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
  session.input.audio = microphone;
  session.output.audio = new Speaker();
  const receiver = createBoardReceiver({ sessionId: started.view.id, clock: () => Date.now() });
  const sender = createBoardSender({ sessionId: started.view.id, senderId: "worker", transport: createMemoryTransport(receiver) });
  const board = createBoardSpeech({ sender, now: () => Date.now(), observe: (snapshot) => opened.call.observeBoard(snapshot) });
  const stage = vi.spyOn(board, "stage");
  // A string is the worker's own line in place of code's (the run reads the words it says, not the start's).
  const workerOpening = typeof options.workerOpening === "string" ? options.workerOpening : options.workerOpening ? voiceOpening(opened.call.session) : null;
  const run = new VoiceCallRun(session, opened.call, {
    board, timers: clock.timers, notify: () => {},
    ...(options.greeting ? GREETED : {}),
    ...(options.numberContinueMs !== undefined ? { numberContinueMs: options.numberContinueMs } : {}),
    ...(options.patience ? { patience: options.patience } : {}),
    ...(workerOpening ? { opening: workerOpening } : {}),
  });
  await run.agentJoined();
  await session.start({ agent: run.agent });
  run.attachBoardAudio();
  run.attachTurnTiming();
  microphone.push();
  cleanup = async () => { await run.finish({ detail: "test over" }); };
  const said = () => (providers.tts as FakeTTS).spoken;
  options.beforeJoin?.(opened.call);
  await run.childJoined();
  if (options.opening !== false) await waitFor(() => heard(said()).length > (options.greeting ? GREETING_TEXT.length : 0) && session.agentState === "listening", "the opening");
  return { clock, said, session, run, stage, board, receiver, calls, call: opened.call, store, id: started.view.id, providers, workerOpening };
}

describe("the turn and interruption settings of a session", () => {
  const options = async (tuning?: Parameters<typeof voiceSession>[1]) => {
    const config = voiceProviders({});
    if (!config.ok) throw new Error("fake providers");
    const made = await makeProviders(config);
    const session = voiceSession(made, tuning);
    return (session as unknown as { sessionOptions: { turnHandling: { turnDetection: string; endpointing: { minDelay: number; maxDelay: number }; interruption: { minDuration: number; minWords: number; falseInterruptionTimeout: number; resumeFalseInterruption: boolean } } } }).sessionOptions.turnHandling;
  };

  it("keep LiveKit's defaults with no tuning (the fakes), where the end of the turn is 500 ms and speech of 500 ms stops Maya", async () => {
    const t = await options();
    expect(t.turnDetection).toBe("stt");
    expect(t.endpointing.minDelay).toBe(500);
    expect(t.interruption).toMatchObject({ minDuration: 500, minWords: 0, falseInterruptionTimeout: 2000, resumeFalseInterruption: true });
  });

  it("set the endpointing delay and the interruption options for a real call, and leave the false interruption alone", async () => {
    const t = await options({ turn: { turnMinDelayMs: 100, interruptMinMs: 300, interruptMinWords: 0 } });
    expect(t.turnDetection).toBe("stt");
    expect(t.endpointing.minDelay).toBe(100);
    expect(t.interruption).toMatchObject({ minDuration: 300, minWords: 0, falseInterruptionTimeout: 2000, resumeFalseInterruption: true });
    const words = await options({ turn: { turnMinDelayMs: 0, interruptMinMs: 400, interruptMinWords: 1 } });
    expect(words.endpointing.minDelay).toBe(0);
    expect(words.interruption).toMatchObject({ minDuration: 400, minWords: 1 });
  });

  it("let a test's own endpointing win", async () => {
    const t = await options({ endpointingMs: 20, turn: { turnMinDelayMs: 100, interruptMinMs: 300, interruptMinWords: 0 } });
    expect(t.endpointing).toMatchObject({ minDelay: 20, maxDelay: 20 });
  });
});

describe("the greeting", () => {
  it("is said once, after the opening, with no board batch, and is not in the transcript", async () => {
    const c = await voiceCall({ greeting: true });
    await waitFor(() => heard(c.said()).includes(GREETING_TEXT), "the greeting");
    // The opening is Maya's first sound (Savar, 2026-11-13), and the greeting follows it.
    expect(heard(c.said()).startsWith(GREETING_TEXT)).toBe(false);
    expect(heard(c.said()).endsWith(GREETING_TEXT)).toBe(true);
    expect(times(heard(c.said()), GREETING_TEXT)).toBe(1);
    // It has an empty plan (as an acknowledgement does), staged after the opening's own plan.
    expect(c.stage.mock.calls.at(-1)![1]).toEqual([]);
    expect(c.stage.mock.calls.length).toBeGreaterThan(1);
    // It is saved before it is said, in the call's acknowledged list, as the acknowledgement phrases are.
    expect(c.call.acknowledged).toContain(GREETING_ID);
    expect((await c.store.get(c.id))!.live!.acknowledged).toContain(GREETING_ID);
    // It is not in the call's record of what was said.
    const view = (await c.calls.view(c.id))!;
    expect(view.transcript.map((l) => l.text).join(" ")).not.toContain("computer helper");
    // A turn after it does not say it again.
    c.providers.fakeSpeech!.say("I got 56.");
    const opened = c.said().length;
    await waitFor(() => c.said().length > opened && c.session.agentState === "listening", "the answer");
    expect(times(heard(c.said()), GREETING_TEXT)).toBe(1);
  });

  it("is not said when there is none to say, and not again by a worker that takes the call over", async () => {
    const plain = await voiceCall({});
    expect(heard(plain.said())).not.toContain("computer helper");
    await cleanup?.();
    cleanup = null;

    const c = await voiceCall({ greeting: true });
    await waitFor(() => heard(c.said()).includes(GREETING_TEXT), "the greeting");
    await c.call.settled();
    // The first worker is gone. A new one opens the saved call: the greeting is saved as said, and the call has started.
    const opened = await c.calls.openVoice(c.id, { speechToText: "fake", voice: "fake" }, null);
    if (!opened.ok) throw new Error(opened.error);
    expect(opened.call.acknowledged).toContain(GREETING_ID);
    const config = voiceProviders({});
    if (!config.ok) throw new Error("fake providers");
    const made = await makeProviders(config, { fakeMsPerChar: 1 });
    const session = voiceSession(made, { endpointingMs: 20, aecWarmupDuration: 0 });
    session.input.audio = new SilentMicrophone();
    session.output.audio = new Speaker();
    const run = new VoiceCallRun(session, opened.call, { timers: c.clock.timers, notify: () => {}, ...GREETED });
    await run.agentJoined();
    await session.start({ agent: run.agent });
    await run.childJoined();
    await pause();
    expect(heard((made.tts as FakeTTS).spoken)).not.toContain("computer helper");
    await run.finish({ detail: "test over" });
  });

  it("is not said twice when the child rejoins while it is being staged", async () => {
    const c = await voiceCall({ greeting: true });
    await waitFor(() => heard(c.said()).includes(GREETING_TEXT), "the greeting");
    await c.run.childLeft("dropped");
    await c.run.childJoined();
    await pause();
    expect(times(heard(c.said()), GREETING_TEXT)).toBe(1);
  });
});

describe("the worker's own opening (the opening's speed, Savar 2026-11-13)", () => {
  /** Holds the call's start until `release`, or makes it fail. Records the words the start gave. */
  const heldStart = (fail = false) => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const started: string[][] = [];
    const hold = (call: VoiceCall) => {
      const real = call.start.bind(call);
      vi.spyOn(call, "start").mockImplementation(async (options) => {
        await gate;
        if (fail) throw new Error("the database is down");
        const turn = await real(options);
        started.push(turn.say);
        return turn;
      });
    };
    return { hold, release: () => release(), started };
  };

  it("is the first words in the voice, said once, and the start's own words are not said again", async () => {
    const start = heldStart();
    const c = await voiceCall({ workerOpening: true, opening: false, beforeJoin: start.hold });
    // The worker's line is code's own opening line (D-341), the one the start records.
    expect(c.workerOpening).toBe(openingLine(PKG as Parameters<typeof openingLine>[0]));
    const opening = spokenMath(c.workerOpening!);
    // Said before the call's start is saved: the start is still held.
    await waitFor(() => heard(c.said()).length >= opening.length, "the opening");
    expect(heard(c.said())).toBe(opening);
    expect(c.call.session.startedAt).toBeNull();
    start.release();
    await waitFor(() => c.call.session.startedAt !== null && c.session.agentState === "listening", "the start");
    await c.call.settled();
    await c.board.settled();
    await pause();
    expect(heard(c.said())).toBe(opening);
    expect(times(heard(c.said()), opening)).toBe(1);
    // D-341: the start is told the worker spoke the line (`openingSpoken`), so it gives no words to say again.
    expect(start.started).toEqual([[]]);
    // The stored call's first Maya line is the line the child heard.
    const view = (await c.calls.view(c.id))!;
    expect(view.transcript.find((l) => l.speaker === "maya")?.text).toBe(c.workerOpening);
    // The question's batch is on the child's board, shown under the opening's own plan: one plan was staged, the opening's.
    expect(c.call.session.batches).toBe(1);
    const shown = c.receiver.snapshot().events.flatMap((e) => (e.kind === "batch" ? [e.batchId] : []));
    expect(shown).toEqual([`${c.id}-b1`]);
    expect(c.receiver.staged()).toEqual([]);
    expect(c.stage).toHaveBeenCalledTimes(1);
  });

  it("does not cut the opening's audio to show the question's batch", async () => {
    // A start that comes back while the opening still plays: the batch shows and the opening is heard whole.
    const start = heldStart();
    const c = await voiceCall({ workerOpening: true, opening: false, beforeJoin: start.hold });
    const opening = spokenMath(c.workerOpening!);
    start.release();
    await waitFor(() => c.call.session.startedAt !== null && c.session.agentState === "listening", "the start");
    await c.board.settled();
    await pause();
    expect(heard(c.said())).toBe(opening);
    expect(c.receiver.snapshot().events.filter((e) => e.kind === "batch")).toHaveLength(1);
    expect(c.receiver.snapshot().events.some((e) => e.kind === "cancelled")).toBe(false);
  });

  it("is followed by the greeting", async () => {
    const c = await voiceCall({ workerOpening: true, greeting: true, opening: false });
    const opening = spokenMath(c.workerOpening!);
    await waitFor(() => heard(c.said()).includes(GREETING_TEXT), "the greeting");
    expect(heard(c.said()).startsWith(opening)).toBe(true);
    expect(heard(c.said())).toBe(`${opening} ${GREETING_TEXT}`);
  });

  it("makes a child turn that comes while the start is still saving wait for the start, and then answers it", async () => {
    const start = heldStart();
    const c = await voiceCall({ workerOpening: true, opening: false, beforeJoin: start.hold });
    const opening = spokenMath(c.workerOpening!);
    await waitFor(() => heard(c.said()) === opening && c.session.agentState === "listening", "the opening");
    const asked = vi.spyOn(c.call, "child");
    c.providers.fakeSpeech!.say("I got 56.");
    await pause();
    await pause();
    // The turn waits for the start: nothing goes to the call's session, and Maya says nothing more.
    expect(asked).not.toHaveBeenCalled();
    expect(heard(c.said())).toBe(opening);
    start.release();
    await waitFor(() => asked.mock.calls.length === 1, "the turn after the start");
    expect(asked.mock.calls[0][0]).toBe("I got 56.");
    await waitFor(() => heard(c.said()).length > opening.length && c.session.agentState === "listening", "the answer");
    expect(c.call.session.startedAt).not.toBeNull();
  });

  it("is not said twice to a child who drops and rejoins before the start is saved", async () => {
    const start = heldStart();
    const c = await voiceCall({ workerOpening: true, opening: false, beforeJoin: start.hold });
    const opening = spokenMath(c.workerOpening!);
    await waitFor(() => heard(c.said()) === opening && c.session.agentState === "listening", "the opening");
    await c.run.childLeft("dropped");
    await c.run.childJoined();
    start.release();
    await waitFor(() => c.call.session.startedAt !== null, "the start");
    await c.call.settled();
    await pause();
    expect(times(heard(c.said()), opening)).toBe(1);
    expect(heard(c.said())).toBe(opening);
    expect(start.started).toHaveLength(1);
  });

  it("ends the call with a technical outcome when the start fails", async () => {
    const start = heldStart(true);
    const c = await voiceCall({ workerOpening: true, opening: false, beforeJoin: start.hold });
    start.release();
    await waitFor(() => c.run.done !== null, "the end");
    await c.run.done;
    const record = (await c.store.get(c.id))!;
    expect(record.status).toBe("ended");
    expect(record.outcome?.reason).toBe("technical_issue");
  });
});

describe("the speech-to-text's silence limit while Maya asks for a number", () => {
  const { normal, number } = turnSilences(VOICE_TUNING_DEFAULTS);
  const patienceLog = () => {
    const sets: TurnSilence[] = [];
    return { sets, patience: { normal, number, set: (limits: TurnSilence) => void sets.push(limits) } };
  };

  it("has short normal limits and keeps the number turn long", () => {
    expect(normal).toEqual({ minMs: 400, maxMs: 1600 });
    expect(number).toEqual({ minMs: 512, maxMs: 4500 });
  });

  it("is raised when she asks the child to try the question, and put back when the child's turn arrives", async () => {
    const log = patienceLog();
    const speech = new ProbeSTT();
    const c = await voiceCall({ patience: log.patience, speech });
    // The opening ends with "Shall we get going?": a question to answer yes or no, so the limit stays as it is.
    expect(c.said().at(-1)).toBe("I'm Maya, an AI math helper.");
    expect(log.sets).toEqual([]);
    // The child agrees, and Maya hands over the question: "Try 27 + 39 the same way." (the voice is given "plus"). The
    // next turn may wait longer.
    speech.says("Yes.");
    await waitFor(() => log.sets.length === 1 && c.session.agentState === "listening", "her request");
    expect(log.sets).toEqual([number]);
    expect(c.said().at(-1)).toBe("Try 27 plus 39 the same way.");
    // The child's turn arrives: the limits go back to the normal ones at once, before Maya's answer is known.
    speech.says("I got 56.");
    await waitFor(() => log.sets.length >= 2, "the turn");
    expect(log.sets[1]).toEqual(normal);
    await waitFor(() => c.session.agentState === "listening", "the answer");
    // Every long limit is followed by the normal one at the next child turn: the long wait is for one turn only.
    for (let i = 1; i < log.sets.length; i++) expect(log.sets[i]).not.toEqual(log.sets[i - 1]);
    // After her answer, the limits are the number ones only if her last words ask for a number.
    const asks = asksForNumber(c.said().join(" "), c.call.session.state);
    expect(log.sets.at(-1)).toEqual(asks ? number : normal);
  });

  it("stay normal after the worker's own opening, which asks for no number, and for the child's first turn", async () => {
    const log = patienceLog();
    const speech = new ProbeSTT();
    const c = await voiceCall({ patience: log.patience, speech, workerOpening: true, opening: false });
    // The opening ends "Where do you want to start?": the child's first words are usually "Hi Maya", not a number.
    expect(c.workerOpening!.trim().endsWith("Where do you want to start?")).toBe(true);
    await waitFor(() => c.call.session.startedAt !== null && c.session.agentState === "listening" && c.said().length > 0, "the opening");
    await c.call.settled();
    await pause();
    expect(openingAsksForNumber(c.workerOpening!)).toBe(false);
    expect(log.sets).toEqual([]);
    speech.says("Hi Maya.");
    await waitFor(() => c.session.agentState === "listening" && c.said().length > 1, "the answer");
    await c.call.settled();
    await pause();
    // No long limit was set before or during the child's first turn: only Maya's answer can ask for a number.
    const last = c.call.session.turns.filter((t) => t.speaker === "maya").at(-1)!.text;
    expect(log.sets).toEqual(asksForNumber(last, c.call.session.state) ? [number] : []);
  });

  it("are the number limits after a worker's opening that asks for a number, and normal again at the child's turn", async () => {
    const log = patienceLog();
    const speech = new ProbeSTT();
    const opening = "Hi Leah, I'm Maya. What is 27 plus 39?";
    const c = await voiceCall({ patience: log.patience, speech, workerOpening: opening, opening: false });
    await waitFor(() => c.call.session.startedAt !== null && log.sets.length >= 1, "the opening's limits");
    // The session is in OPEN, so the rule on Maya's words reads the opening as words only.
    expect(c.call.session.state).toBe("OPEN");
    expect(openingAsksForNumber(opening)).toBe(true);
    expect(log.sets).toEqual([number]);
    speech.says("I got 56.");
    await waitFor(() => log.sets.length >= 2, "the turn");
    expect(log.sets[1]).toEqual(normal);
  });

  it("is untouched when the route has no live update", async () => {
    const c = await voiceCall({ opening: true });
    c.providers.fakeSpeech!.say("I got 56.");
    await waitFor(() => c.session.agentState === "listening" && c.said().length > 1, "the answer");
    expect(c.said().length).toBeGreaterThan(1);
  });
});

describe("a number word that can go on", () => {
  it("makes the worker wait once; more words are read with it as one answer", async () => {
    const speech = new ProbeSTT();
    const c = await voiceCall({ numberContinueMs: 1500, speech });
    const before = c.said().length;
    const asked = vi.spyOn(c.call, "child");
    speech.says("I think it is fifty");
    await waitFor(() => c.run.agent !== undefined && c.session.agentState === "thinking", "the wait");
    await pause();
    // Maya has not answered, and the turn has not gone to the controller.
    expect(asked).not.toHaveBeenCalled();
    expect(c.said().length).toBe(before);
    // The child goes on within the wait.
    await c.clock.advance(600);
    speech.send(stt.SpeechEventType.START_OF_SPEECH);
    speech.send(stt.SpeechEventType.INTERIM_TRANSCRIPT, "six");
    speech.send(stt.SpeechEventType.FINAL_TRANSCRIPT, "six");
    speech.send(stt.SpeechEventType.END_OF_SPEECH);
    await waitFor(() => asked.mock.calls.length === 1, "the joined turn");
    expect(asked.mock.calls[0][0]).toBe("I think it is fifty six");
    await waitFor(() => c.session.agentState === "listening" && c.said().length > before, "the answer");
  });

  it("goes on after the wait when nothing more comes, with the words as they were, and waits only once", async () => {
    const speech = new ProbeSTT();
    const c = await voiceCall({ numberContinueMs: 1500, speech });
    const before = c.said().length;
    const asked = vi.spyOn(c.call, "child");
    speech.says("fifty");
    await pause();
    expect(asked).not.toHaveBeenCalled();
    await c.clock.advance(1499);
    await pause();
    expect(asked).not.toHaveBeenCalled();
    await c.clock.advance(1);
    await waitFor(() => asked.mock.calls.length === 1, "the turn after the wait");
    expect(asked.mock.calls[0][0]).toBe("fifty");
    await waitFor(() => c.session.agentState === "listening" && c.said().length > before, "the answer");
    // The next answer that ends the same way waits once more: one extension for each answer.
    speech.says("twenty");
    await pause();
    expect(asked).toHaveBeenCalledTimes(1);
    await c.clock.advance(1500);
    await waitFor(() => asked.mock.calls.length === 2, "the second turn after its wait");
  });

  it("does not wait for a transcript that is done, or when the wait is off", async () => {
    const speech = new ProbeSTT();
    const c = await voiceCall({ numberContinueMs: 1500, speech });
    const asked = vi.spyOn(c.call, "child");
    speech.says("I got fifty six.");
    await waitFor(() => asked.mock.calls.length === 1, "the turn with no wait");
    await waitFor(() => c.session.agentState === "listening", "the answer");
    await cleanup?.();
    cleanup = null;

    const off = new ProbeSTT();
    const d = await voiceCall({ numberContinueMs: 0, speech: off });
    const askedOff = vi.spyOn(d.call, "child");
    off.says("fifty");
    await waitFor(() => askedOff.mock.calls.length === 1, "the turn with the wait off");
  });
});
