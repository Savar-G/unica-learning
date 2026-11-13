import { ReadableStream, type ReadableStreamDefaultController } from "node:stream/web";
import { EventEmitter } from "node:events";
import { initializeLogger, normalizeLanguage, stt, VADEventType, voice, type VAD, type VADEvent } from "@livekit/agents";
import { AudioFrame } from "@livekit/rtc-node";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Batch } from "@/lib/board";
import { createBoardReceiver, createBoardSender } from "@/lib/board-protocol";
import { createMemoryTransport } from "@/lib/board-protocol-memory";
import { createBoardSpeech } from "@/lib/board-speech";
import { templateSkills } from "@/lib/assessment";
import { learningEvents } from "@/lib/learning-events";
import { memoryLearningEventStore } from "@/lib/learning-events-memory";
import { memoryWordingHistoryStore, SAFETY_GUIDANCE } from "@/lib/maya";
import { mayaCalls, type CallSeams, type VoiceSay, type VoiceTurn } from "@/lib/maya-call";
import { memoryCallStore, memoryConnectionLog } from "@/lib/maya-call-memory";
import type { MayaModel, TurnBrief } from "@/lib/maya-model";
import { reply, ruleConversationalModel } from "@/lib/maya-model-fake";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { voiceProviders } from "@/lib/maya-voice";
import { ACK_LIMIT_MS, ACK_PHRASES } from "@/lib/maya-voice-ack";
import { spokenMath } from "@/lib/maya-voice-spoken";
import type { QuestionPackage } from "@/lib/question-package";
import { VoiceCallRun, voiceSession, type Timers } from "./agent";
import { earlyRest } from "./early-speech";
import { FakeTTS } from "./fake-providers";
import { makeProviders } from "./providers";
import { TURN_PARTS, type VoiceTurnSample } from "./turn-timing";

// Maya's first sentences said before her turn is done (D-341, the streaming contract of src/lib/maya-text.ts), through
// LiveKit's own pipeline with the fake speech-to-text and voice. The model is stepped by the test: it streams its reply a
// sentence at a time and returns only when the test lets it, so the test sees what reached the voice while the turn ran.
// The fakes prove the order of events, never how long a real model or voice takes.

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
  push(amplitude = 0) { this.controller.enqueue(new AudioFrame(new Int16Array(320).fill(amplitude), 16_000, 1, 320)); }
}

/** The child's speaker. It holds a playback while `held`, as a real phrase takes time to play. */
class Speaker extends voice.AudioOutput {
  held = false;
  cut = 0;
  private captured = 0;
  private waiting = false;
  private pendingStarts = 0;
  constructor() { super(24_000); }
  override async captureFrame(frame: AudioFrame) {
    const before = this.capturedPlayoutSegments;
    await super.captureFrame(frame);
    this.captured += frame.samplesPerChannel / frame.sampleRate;
    if (this.capturedPlayoutSegments > before && this.capturedPlayoutSegments > this.pendingStarts) {
      this.pendingStarts = this.capturedPlayoutSegments;
      this.onPlaybackStarted(Date.now());
    }
  }
  private finish(interrupted: boolean) {
    this.waiting = false;
    if (interrupted && this.pendingPlayoutSegments > 0) this.cut++;
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
  return { timers, advance, move: (ms: number) => void vi.setSystemTime(Date.now() + ms) };
}

const waitFor = async (check: () => boolean, what: string) => {
  const end = performance.now() + 10_000;
  while (!check()) {
    if (performance.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 5));
  }
};
const pause = () => new Promise((r) => setTimeout(r, 120));

/**
 * A conversational model the test steps through (D-341). For a child turn `script` answers, the reply's JSON goes to
 * `onText` only when the test calls `stream(n)` (the first n sentences of `say`, whole), and the reply returns only on
 * `finish()`. Every other turn is the rule player's, at once.
 */
function steppedModel(script: (brief: TurnBrief) => ReturnType<typeof reply> | null) {
  const rule = ruleConversationalModel();
  let current: { text: string; say: string; onText?: (soFar: string) => void; done: () => void } | null = null;
  const state = {
    asked: 0,
    get running() { return current !== null; },
    /** Streams the first `n` sentences of the reply's `say` as whole sentences. */
    stream(n: number) {
      const c = current!;
      const sentences = c.say.split(/(?<=[.?!])\s+/);
      const start = c.text.indexOf('"say":"') + 7;
      const shown = n >= sentences.length ? `${JSON.stringify(c.say).slice(1, -1)}"` : `${JSON.stringify(sentences.slice(0, n).join(" ")).slice(1, -1)} ${sentences[n][0]}`;
      c.onText?.(c.text.slice(0, start) + shown);
    },
    /** Streams the whole reply and returns it. */
    finish() { const c = current!; c.onText?.(c.text); current = null; c.done(); },
    model: { ...rule, propose: async (input, signal, onText) => {
      const brief = input as unknown as TurnBrief;
      const out = script(brief);
      if (!out) return rule.propose(input, signal, onText);
      state.asked++;
      await new Promise<void>((resolve) => { current = { text: JSON.stringify(out), say: out.say, onText, done: resolve }; });
      return out;
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

async function voiceCall(options: { model: MayaModel; ackLimitMs?: number; speech?: ProbeSTT; numberContinueMs?: number; dropSilentPeakDbfs?: number; heardVad?: VAD; childName?: string | null; note?: CallSeams["note"] }) {
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
    ...(options.note ? { note: options.note } : {}),
  };
  const calls = mayaCalls(seams);
  const started = await calls.startVoice({ kind: "admin_test", parentId: PARENT, childId: CHILD, childName: options.childName === undefined ? "Leah" : options.childName, package: PKG, startedBy: "admin-1" });
  if (!started.ok) throw new Error(started.error);
  const config = voiceProviders({});
  if (!config.ok) throw new Error("fake providers");
  const opened = await calls.openVoice(started.view.id, config.ids, options.childName === undefined ? "Leah" : options.childName);
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
    board, timers: clock.timers, notify: () => {}, measureTurn: (s) => samples.push(s), ackLimitMs: options.ackLimitMs ?? 0, numberContinueMs: options.numberContinueMs ?? 0, dropSilentPeakDbfs: options.dropSilentPeakDbfs ?? null, ...(options.heardVad ? { heardVad: options.heardVad } : {}),
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
  await opened.call.settled();
  const say = (text: string) => expect(providers.fakeSpeech!.say(text)).toBe(true);
  return { clock, say, said, session, speaker, receiver, board, samples, run, id: started.view.id, calls, call: opened.call, store, microphone };
}

const FIRST = "Let's think about the ones together.";
const SECOND = "What can you do with those two digits?";
const ACKS = new Set(ACK_PHRASES.map((p) => p.text));
const count = (said: readonly string[], text: string) => said.filter((t) => t === text).length;
const sum = (s: VoiceTurnSample) => TURN_PARTS.reduce((total, k) => total + s.parts![k], 0);
/** A plain math turn that streams (streamRules): a wrong answer, answered with a guide. */
const guideTurn = (say: string, draw?: (brief: TurnBrief) => { offer: string; place: string }[]) => (brief: TurnBrief) =>
  brief.childTurn === "I got 56." ? reply(say, "guide", { step: brief.help.step, level: 0, reading: { answers: [{ value: { type: "number", value: 56 }, step: "result", problem: "target", verdict: "wrong" }] }, ...(draw ? { draw: draw(brief) } : {}) }) : null;

describe("Maya's first sentence before her turn is done (D-341)", () => {
  it("is in the voice while the model still writes, and each sentence is said once", async () => {
    const m = steppedModel(guideTurn(`${FIRST} ${SECOND}`));
    const c = await voiceCall({ model: m.model });
    const before = c.said().length;
    c.say("I got 56.");
    await waitFor(() => m.running, "the model call");
    m.stream(1);
    // The model has not returned: the turn is still running, and the first sentence is already in the voice.
    await waitFor(() => c.said().slice(before).includes(FIRST), "the first sentence");
    expect(m.running).toBe(true);
    expect(c.call.working).toBe(true);
    expect(c.said().slice(before)).toEqual([FIRST]);
    m.finish();
    await waitFor(() => c.said().slice(before).includes(SECOND), "the second sentence");
    await waitFor(() => c.samples.length === 1 && c.session.agentState === "listening", "the turn's end");
    await c.call.settled();
    await pause();
    // Exactly once, and the stored turn holds exactly what the voice was given.
    expect(c.said().slice(before)).toEqual([FIRST, SECOND]);
    const view = (await c.calls.view(c.id))!;
    const maya = view.transcript.filter((l) => l.speaker === "maya").map((l) => l.text.replaceAll("{name}", "Leah"));
    expect(maya.at(-1)).toBe(`${FIRST} ${SECOND}`);
    expect(c.said().join(" ")).toBe(spokenMath(maya.join(" ")));
    // The sample marks the first streamed sentence: its parts add up to its answer time.
    const [s] = c.samples;
    expect(s).toMatchObject({ outcome: "answered", streamed: true });
    expect(s.firstPartMs).not.toBeNull();
    expect(s.answerMs).not.toBeNull();
    expect(sum(s)).toBe(s.answerMs);
  });

  it("starts no thinking phrase once the first sentence came", async () => {
    const m = steppedModel(guideTurn(`${FIRST} ${SECOND}`));
    const c = await voiceCall({ model: m.model, ackLimitMs: 1000 });
    const before = c.said().length;
    c.say("I got 56.");
    await waitFor(() => m.running, "the model call");
    m.stream(1);
    await waitFor(() => c.said().slice(before).includes(FIRST), "the first sentence");
    await c.clock.advance(5000);
    await pause();
    m.finish();
    await waitFor(() => c.samples.length === 1, "the sample");
    await pause();
    expect(c.said().slice(before).filter((t) => ACKS.has(t))).toEqual([]);
    expect(c.samples[0]).toMatchObject({ ack: null, ackSkipped: null });
    // No phrase was saved as said, and none took the first sentence's plan: the rest of the reply was heard.
    expect(c.call.acknowledged).toEqual([]);
    expect(c.said().slice(before)).toEqual([FIRST, SECOND]);
  });

  it("waits for a phrase that plays, then says the first sentence as a speech of its own", async () => {
    const m = steppedModel(guideTurn(`${FIRST} ${SECOND}`));
    const c = await voiceCall({ model: m.model, ackLimitMs: 500 });
    const before = c.said().length;
    c.say("I got 56.");
    await waitFor(() => m.running, "the model call");
    c.speaker.held = true;
    await c.clock.advance(500);
    await waitFor(() => c.said().slice(before).some((t) => ACKS.has(t)), "the phrase");
    m.stream(1);
    await pause();
    // The phrase still plays: the sentence waits for its end, and is not written into the phrase's stream.
    expect(c.said().slice(before).includes(FIRST)).toBe(false);
    c.speaker.release();
    await waitFor(() => c.said().slice(before).includes(FIRST), "the first sentence after the phrase");
    m.finish();
    await waitFor(() => c.said().slice(before).includes(SECOND), "the second sentence");
    await waitFor(() => c.samples.length === 1, "the sample");
    const after = c.said().slice(before);
    expect(after.filter((t) => ACKS.has(t))).toHaveLength(1);
    expect(after.slice(1)).toEqual([FIRST, SECOND]);
    expect(c.samples[0]).toMatchObject({ outcome: "answered", streamed: true, ackHeard: true });
  });

  it("stops when the child talks over it, and says no late sentence", async () => {
    const m = steppedModel(guideTurn(`${FIRST} ${SECOND}`));
    const c = await voiceCall({ model: m.model });
    const before = c.said().length;
    c.speaker.held = true;
    c.say("I got 56.");
    await waitFor(() => m.running, "the model call");
    m.stream(1);
    await waitFor(() => c.said().slice(before).includes(FIRST), "the first sentence");
    await waitFor(() => c.session.agentState === "speaking", "the first sentence to play");
    // The child talks over it: LiveKit stops the speech.
    c.session.interrupt();
    await waitFor(() => c.speaker.cut > 0, "the cut");
    c.speaker.release();
    m.finish();
    await waitFor(() => !c.call.working, "the turn's end");
    await c.call.settled();
    await pause();
    expect(c.said().slice(before)).toEqual([FIRST]);
  });

  it("gives way to safety guidance, which stops it", async () => {
    const m = steppedModel((brief) => brief.childTurn === "I got 56." ? reply(`${FIRST} ${SECOND}`, "guide", { step: brief.help.step, reading: { safety: "immediate" } }) : null);
    const c = await voiceCall({ model: m.model });
    const before = c.said().length;
    c.speaker.held = true;
    c.say("I got 56.");
    await waitFor(() => m.running, "the model call");
    m.stream(1);
    await waitFor(() => c.said().slice(before).includes(FIRST), "the first sentence");
    await waitFor(() => c.session.agentState === "speaking", "the first sentence to play");
    m.finish();
    const guidance = SAFETY_GUIDANCE.immediate.split(/(?<=[.?!])\s+/);
    await waitFor(() => c.said().slice(before).includes(guidance.at(-1)!), "the guidance");
    // The guidance stopped the first sentence's playback.
    expect(c.speaker.cut).toBeGreaterThan(0);
    c.speaker.release();
    await pause();
    const after = c.said().slice(before);
    expect(count(after, FIRST)).toBe(1);
    // Nothing of the reply follows the first sentence: the guidance comes next, whole, and the sentence is not said again.
    expect(after.includes(SECOND)).toBe(false);
    expect(after.slice(1, 1 + guidance.length)).toEqual(guidance);
  });

  it("keeps a sentence said when the turn fails after it, and the call ends as today", async () => {
    const m = steppedModel(guideTurn(`${FIRST} ${SECOND}`));
    const c = await voiceCall({ model: m.model });
    const before = c.said().length;
    c.say("I got 56.");
    await waitFor(() => m.running, "the model call");
    m.stream(1);
    await waitFor(() => c.said().slice(before).includes(FIRST), "the first sentence");
    // Another worker takes the call: this worker's save of the turn is refused.
    const record = (await c.store.get(c.id))!;
    await c.store.update(c.id, record.revision, { status: record.status });
    m.finish();
    await waitFor(() => c.run.done !== null, "the call's end");
    await c.run.done;
    expect(c.call.lost).toBe(true);
    expect(count(c.said().slice(before), FIRST)).toBe(1);
  });
});

describe("the parts of a turn as the worker hears them (VoiceSay)", () => {
  /** The call's own child turn replaced by one the test plays: parts, a cancel, and the finished turn it gives. */
  function playedTurn(c: Awaited<ReturnType<typeof voiceCall>>, play: (say: VoiceSay) => void, turn: VoiceTurn) {
    let finish = () => {};
    const done = new Promise<void>((resolve) => { finish = resolve; });
    vi.spyOn(c.call, "child").mockImplementation(async (_text, _options, say) => {
      play(say!);
      await done;
      return turn;
    });
    return finish;
  }

  it("drops a cancelled sentence that was not said, and says the replacement once", async () => {
    const c = await voiceCall({ model: ruleConversationalModel() });
    const before = c.said().length;
    const finish = playedTurn(c, (say) => {
      say.part!(FIRST, 0);
      say.part!("This one is cancelled.", 1);
      say.cancel!(1);
    }, { say: [`${FIRST} ${SECOND}`], newBatches: 0, boardCues: [], safetyMessage: null, ended: false });
    c.say("I got 56.");
    await waitFor(() => c.said().slice(before).includes(FIRST), "the first sentence");
    finish();
    await waitFor(() => c.said().slice(before).includes(SECOND), "the replacement");
    await pause();
    expect(c.said().slice(before)).toEqual([FIRST, SECOND]);
  });

  it("does not say early the parts given with the output's end: they wait for the turn and its plan", async () => {
    const c = await voiceCall({ model: ruleConversationalModel() });
    const before = c.said().length;
    const finish = playedTurn(c, (say) => {
      say.part!(FIRST, 0);
      say.part!(SECOND, 1);
      say.end!();
    }, { say: [`${FIRST} ${SECOND}`], newBatches: 0, boardCues: [], safetyMessage: null, ended: false });
    c.say("I got 56.");
    await pause();
    await pause();
    expect(c.said().slice(before)).toEqual([]);
    finish();
    await waitFor(() => c.said().length > before, "the answer");
    await pause();
    expect(c.said().slice(before).join(" ")).toBe(`${FIRST} ${SECOND}`);
  });

  it("says a turn's batches after the early sentence, with each cue moved, and the board ends as the turn says", async () => {
    const c = await voiceCall({ model: ruleConversationalModel() });
    // The question the opening drew (one batch), and a note below it that this turn draws.
    const question = (await c.store.get(c.id))!.live!.text.board[0];
    const target = (question.commands[0] as { id: string }).id;
    const note: Batch = { transactionId: `${c.id}-note`, commands: [{ op: "write", id: "note-ones", text: "ones", place: { below: target } }] };
    const third = "Start with the seven.";
    const sends: string[] = [];
    const realStage = c.board.stage.bind(c.board);
    vi.spyOn(c.board, "stage").mockImplementation((id, cues) => {
      sends.push(...cues.map((q) => `${q.batch.transactionId}@${q.word}`));
      return realStage(id, cues);
    });
    const before = c.said().length;
    // The cue is at "seven" (word 18 of the whole reply): 6 words were said early, so it is word 12 of the rest.
    const words = `${FIRST} ${SECOND} ${third}`.split(/\s+/);
    expect(words.indexOf("seven.") + 1).toBe(18);
    const finish = playedTurn(c, (say) => { say.part!(FIRST, 0); }, { say: [`${FIRST} ${SECOND} ${third}`], newBatches: 1, boardCues: [{ batch: note, word: 18 }], safetyMessage: null, ended: false });
    c.say("I got 56.");
    await waitFor(() => c.said().slice(before).includes(FIRST), "the first sentence");
    finish();
    await waitFor(() => c.said().slice(before).includes(third), "the rest");
    await c.board.settled();
    await waitFor(() => c.session.agentState === "listening", "the rest to play");
    await c.board.settled();
    // Speech A had an empty plan; speech B's plan holds the batch at its moved word, staged after A was said.
    expect(sends).toEqual([`${note.transactionId}@12`]);
    expect(c.said().slice(before)).toEqual([FIRST, SECOND, third]);
    const shown = c.receiver.snapshot().events.flatMap((e) => (e.kind === "batch" ? [e.batchId] : []));
    expect(shown).toEqual([question.transactionId, note.transactionId]);
    expect(c.receiver.staged()).toEqual([]);
  });
});

describe("what is left of a turn after its early sentences (earlyRest)", () => {
  const batch = (id: string): Batch => ({ transactionId: id, commands: [] });
  const turn = (say: string[], cues: { id: string; word: number }[] = []): VoiceTurn => ({ say, newBatches: cues.length, boardCues: cues.map((c) => ({ batch: batch(c.id), word: c.word })), safetyMessage: null, ended: false });

  it("moves a cue in sentence 2 of 3 back by the words said early", () => {
    // Sentence 1 has 4 words, sentence 2 has 3, sentence 3 has 2: a cue at "two" (word 6) is word 2 of the rest.
    const rest = earlyRest([turn(["One two three four. Five two seven. Eight nine."], [{ id: "b", word: 6 }])], ["One two three four."]);
    expect(rest.turns[0].say).toEqual(["Five two seven. Eight nine."]);
    expect(rest.cues).toEqual([{ batch: batch("b"), word: 2 }]);
    expect(rest).toMatchObject({ differ: false, unmatched: [] });
  });

  it("shows a cue inside the early words at the rest's first word, and clamps one past its end", () => {
    const rest = earlyRest([turn(["A b c. D e."], [{ id: "in", word: 2 }, { id: "end", word: 9 }])], ["A b c."]);
    expect(rest.cues.map((c) => c.word)).toEqual([1, 2]);
  });

  it("puts every cue at word 1 when no word is left", () => {
    const rest = earlyRest([turn(["A b c."], [{ id: "x", word: 3 }])], ["A b c."]);
    expect(rest.turns[0].say).toEqual([]);
    expect(rest.cues.map((c) => c.word)).toEqual([1]);
  });

  it("counts a later turn's cue after the words of the turns before it", () => {
    const rest = earlyRest([turn(["A b."]), turn(["C d e."], [{ id: "x", word: 2 }])], ["A b."]);
    // Word 2 of the second turn is word 4 of both; 2 words were said early.
    expect(rest.cues.map((c) => c.word)).toEqual([2]);
  });

  it("says the rest from where the turn differs, and reports it", () => {
    const rest = earlyRest([turn(["Other words. Then more."])], ["Said early."]);
    expect(rest.turns[0].say).toEqual(["Other words. Then more."]);
    expect(rest).toMatchObject({ differ: true, unmatched: ["Said early."] });
  });
});

describe("when the thinking phrase comes (D-341)", () => {
  it("counts its limit from when the worker has the turn, not from the child's end of speech", async () => {
    const m = steppedModel((brief) => brief.childTurn === "I got fifty" ? reply(`${FIRST} ${SECOND}`, "guide", { step: brief.help.step, level: 0, reading: { answers: [{ value: { type: "number", value: 50 }, step: "result", problem: "target", verdict: "wrong" }] } }) : null);
    // A number word that can go on ("fifty"): the worker holds the turn 1 s for more words before it answers.
    const c = await voiceCall({ model: m.model, ackLimitMs: ACK_LIMIT_MS, numberContinueMs: 1000 });
    const before = c.said().length;
    c.say("I got fifty");
    await pause();
    await c.clock.advance(1000);
    await waitFor(() => m.running, "the model call");
    // From the child's end of speech the limit would end in 500 ms; from the turn reaching the worker, in 1500 ms.
    await c.clock.advance(ACK_LIMIT_MS - 1);
    await pause();
    expect(c.said().slice(before).filter((t) => ACKS.has(t))).toEqual([]);
    await c.clock.advance(1);
    await waitFor(() => c.said().slice(before).some((t) => ACKS.has(t)), "the phrase at the limit");
    m.finish();
    await waitFor(() => c.samples.length === 1, "the sample");
    expect(c.samples[0].parts?.heardMs).toBe(1000);
  });

  it("comes at once for a turn code knows will not stream (a request for help)", async () => {
    const m = steppedModel((brief) => brief.childTurn === "Can you help me?" ? reply("Sure. Let's start with the ones.", "guide", { step: brief.help.step, level: 0, reading: { help: "more" } }) : null);
    const c = await voiceCall({ model: m.model, ackLimitMs: ACK_LIMIT_MS });
    const before = c.said().length;
    c.say("Can you help me?");
    await waitFor(() => m.running, "the model call");
    await c.clock.advance(1);
    await waitFor(() => c.said().slice(before).some((t) => ACKS.has(t)), "the phrase at once");
    m.finish();
    await waitFor(() => c.samples.length === 1, "the sample");
    expect(c.samples[0].ack).not.toBeNull();
  });

  it("does not come for a child who is thinking: only code's patient line is said", async () => {
    const m = steppedModel(() => null);
    const c = await voiceCall({ model: m.model, ackLimitMs: ACK_LIMIT_MS });
    const before = c.said().length;
    c.say("Um, let me think.");
    await waitFor(() => c.samples.length === 1, "the sample");
    await c.clock.advance(ACK_LIMIT_MS * 3);
    await pause();
    const after = c.said().slice(before);
    expect(after.filter((t) => ACKS.has(t))).toEqual([]);
    expect(after).toEqual(["Take your time, Leah."]);
    expect(m.asked).toBe(0);
  });
});

/** A detector whose events the test sends (as in ./heard-signals.test.ts). */
function fakeVad() {
  const queue: VADEvent[] = [];
  let wake: (() => void) | null = null;
  const event = (type: VADEventType, speechDuration: number, speaking: boolean): VADEvent =>
    ({ type, samplesIndex: 0, timestamp: 0, speechDuration, silenceDuration: 0, frames: [], probability: speaking ? 0.9 : 0.1, inferenceDuration: 1, speaking, rawAccumulatedSilence: 0, rawAccumulatedSpeech: 0 });
  const stream = {
    pushFrame: () => {},
    close: () => {},
    async *[Symbol.asyncIterator]() {
      for (;;) {
        while (queue.length) yield queue.shift()!;
        await new Promise<void>(r => (wake = r));
      }
    },
  };
  return {
    vad: { stream: () => stream } as unknown as VAD,
    async send(type: VADEventType, speechDuration: number, speaking: boolean) {
      queue.push(event(type, speechDuration, speaking));
      wake?.();
      for (let i = 0; i < 3; i++) await new Promise(r => setImmediate(r));
    },
  };
}

describe("a final transcript heard in silence (the drop rule)", () => {
  it("is dropped: no child turn, no answer, and the child is not left speaking", async () => {
    const speech = new ProbeSTT();
    const v = fakeVad();
    const c = await voiceCall({ model: ruleConversationalModel(), speech, heardVad: v.vad, dropSilentPeakDbfs: -50 });
    const before = c.said().length;
    const states: string[] = [];
    c.session.on(voice.AgentSessionEventTypes.UserStateChanged, (ev) => states.push(ev.newState));
    const warn = vi.spyOn(console, "warn");
    const asked = vi.spyOn(c.call, "child");
    for (let i = 0; i < 20; i++) c.microphone.push(0);
    await v.send(VADEventType.INFERENCE_DONE, 0, false);
    await pause();
    speech.send(stt.SpeechEventType.START_OF_SPEECH);
    speech.send(stt.SpeechEventType.INTERIM_TRANSCRIPT, "Yes");
    speech.send(stt.SpeechEventType.FINAL_TRANSCRIPT, "Yes!");
    speech.send(stt.SpeechEventType.END_OF_SPEECH);
    await pause();
    await pause();
    expect(asked).not.toHaveBeenCalled();
    expect(c.said().slice(before)).toEqual([]);
    expect(states).not.toContain("speaking");
    const view = (await c.calls.view(c.id))!;
    expect(view.transcript.filter((l) => l.speaker === "child")).toEqual([]);
    // Logged with its signals, and no words.
    const dropped = warn.mock.calls.find((a) => a[0] === "[maya voice] dropped transcript");
    expect(dropped?.[2]).toMatchObject({ words: 1, vadSpeechMs: 0, peakDbfs: -120 });
    expect(JSON.stringify(dropped)).not.toContain("Yes");
  });

  it("keeps a quiet real answer the detector heard, and answers it", async () => {
    const speech = new ProbeSTT();
    const v = fakeVad();
    const c = await voiceCall({ model: ruleConversationalModel(), speech, heardVad: v.vad, dropSilentPeakDbfs: -50 });
    const before = c.said().length;
    const asked = vi.spyOn(c.call, "child");
    // Soft speech: a level far below the limit (about -64 dBFS), and 120 ms the detector heard as speech.
    for (let i = 0; i < 20; i++) c.microphone.push(20);
    await v.send(VADEventType.START_OF_SPEECH, 60, true);
    await v.send(VADEventType.INFERENCE_DONE, 120, true);
    await pause();
    speech.send(stt.SpeechEventType.START_OF_SPEECH);
    speech.send(stt.SpeechEventType.FINAL_TRANSCRIPT, "Six.");
    speech.send(stt.SpeechEventType.END_OF_SPEECH);
    await waitFor(() => asked.mock.calls.length === 1, "the child's turn");
    expect(asked.mock.calls[0][0]).toBe("Six.");
    await waitFor(() => c.said().length > before, "Maya's answer");
  });
});

describe("the child's first name on a voice call (Savar, 2026-11-12)", () => {
  it("is in the spoken words, and hidden in the stored trace and the note's inputs", async () => {
    const note = vi.fn(async () => "pending" as const);
    const c = await voiceCall({ model: ruleConversationalModel(), note });
    const before = c.said().length;
    c.say("Um, let me think.");
    await waitFor(() => c.said().length > before, "the patient line");
    expect(c.said().slice(before)).toEqual(["Take your time, Leah."]);
    await c.run.hangUp();
    const row = (await c.store.get(c.id))!;
    expect(row.status).toBe("ended");
    expect(JSON.stringify(row.trace)).not.toContain("Leah");
    expect(row.trace!.turns.some((t) => t.kind === "maya" && t.output?.say.includes("Take your time, {name}."))).toBe(true);
    expect(note).toHaveBeenCalled();
    expect(row.notePending).not.toBeNull();
    expect(JSON.stringify(row.notePending)).not.toContain("Leah");
    expect(JSON.stringify(note.mock.calls)).not.toContain("Leah");
    const view = (await c.calls.view(c.id))!;
    expect(JSON.stringify(view.transcript)).not.toContain("Leah");
  });

  it("keeps the board cue on the right spoken word when the name has two words", async () => {
    // A reply that does not stream (a request for help), with the name in its first sentence and a board offer drawn.
    const say = "Mary Ann, let's look at the ones column. What can you do there?";
    const m = steppedModel((brief) => brief.childTurn === "Can you help me?"
      ? reply(say, "guide", { step: brief.help.step, level: 0, reading: { help: "more" }, draw: (brief.draw.guide ?? []).slice(0, 1).map((o) => ({ offer: o.id, place: "main" })) })
      : null);
    const c = await voiceCall({ model: m.model, childName: "Mary Ann" });
    const cues: number[] = [];
    const realStage = c.board.stage.bind(c.board);
    vi.spyOn(c.board, "stage").mockImplementation((id, staged) => { cues.push(...staged.map((q) => q.word)); return realStage(id, staged); });
    const before = c.said().length;
    c.say("Can you help me?");
    await waitFor(() => m.running, "the model call");
    m.finish();
    await waitFor(() => c.said().slice(before).join(" ").includes("What can you do there?"), "the reply");
    await c.call.settled();
    // The voice says both words of the name, and the math as words.
    expect(c.said().slice(before).join(" ")).toBe(spokenMath(say));
    // The batch's cue is the last spoken word of the reply: word 13, not the 12 of "{name}, let's look ...".
    expect(c.call.session.batches).toBe(2);
    expect(cues).toEqual([say.split(/\s+/).length]);
    await c.run.hangUp();
    const row = (await c.store.get(c.id))!;
    expect(JSON.stringify(row.trace)).not.toContain("Mary Ann");
    expect(JSON.stringify(row.trace)).toContain("{name}, let's look at the ones column.");
  });
});
