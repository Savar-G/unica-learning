import { ReadableStream, type ReadableStreamDefaultController } from "node:stream/web";
import { EventEmitter } from "node:events";
import { initializeLogger, llm, normalizeLanguage, stt, voice } from "@livekit/agents";
import { AudioFrame, TrackPublishOptions } from "@livekit/rtc-node";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createBoardReceiver, createBoardSender } from "@/lib/board-protocol";
import { createMemoryTransport } from "@/lib/board-protocol-memory";
import { createBoardSpeech, type CueMeasurement } from "@/lib/board-speech";
import { templateSkills } from "@/lib/assessment";
import { learningEvents } from "@/lib/learning-events";
import { memoryLearningEventStore } from "@/lib/learning-events-memory";
import { memoryWordingHistoryStore, PAUSES, TIME_LIMITS } from "@/lib/maya";
import { mayaCalls, type CallSeams } from "@/lib/maya-call";
import { memoryCallStore, memoryConnectionLog } from "@/lib/maya-call-memory";
import type { MayaModel } from "@/lib/maya-model";
import { ruleMayaModel } from "@/lib/maya-model-fake";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { callSpend, createSpendLedger, spendConfig, SPEND_CLOSE, WEEK_MICROS } from "@/lib/maya-spend";
import { memorySpendStore } from "@/lib/maya-spend-memory";
import { checkTrace } from "@/lib/maya-trace";
import { RECONNECT_GRACE_MS, voiceProviders } from "@/lib/maya-voice";
import type { QuestionPackage } from "@/lib/question-package";
import { mayaWorkbookFixture } from "@/lib/maya-workbook-fixture";
import { selectWorkbookQuestion } from "@/lib/maya-workbook-question";
import { spokenMath } from "@/lib/maya-voice-spoken";
import { VoiceCallRun, voiceSession, type CallUpdate, type Timers } from "./agent";
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
  constructor() {
    super(24_000);
  }
  override async captureFrame(frame: AudioFrame) {
    const before = this.capturedPlayoutSegments;
    await super.captureFrame(frame);
    this.captured += frame.samplesPerChannel / frame.sampleRate;
    if (this.capturedPlayoutSegments > before) this.onPlaybackStarted(Date.now());
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
  return {
    timers,
    now: () => now,
    async advance(s: number) {
      const end = now + s * 1000;
      while (now < end) {
        now = Math.min(end, now + 1000);
        for (const [h, t] of [...due].sort((a, b) => a[1].at - b[1].at)) {
          if (t.at > now) continue;
          due.delete(h);
          t.run();
        }
        await new Promise<void>(resolve => setImmediate(resolve));
      }
    },
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
afterEach(async () => {
  await cleanup?.();
  cleanup = null;
});

async function voiceCall(options: { spend?: (clock: () => number) => CallSeams["spend"]; speech?: ProbeSTT; speaker?: Speaker; seed?: number; model?: MayaModel; board?: boolean; timestamps?: boolean; workbookReference?: string } = {}) {
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
    ...(options.spend ? { spend: options.spend(clock.now) } : {}),
    clock: clock.now,
    newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
    seed: () => options.seed ?? 42,
  };
  const calls = mayaCalls(seams);
  const fixture = options.workbookReference ? await mayaWorkbookFixture() : null;
  const selected = fixture ? await selectWorkbookQuestion({ childId: fixture.ids.child, workbookId: fixture.ids.workbook, reference: options.workbookReference }, fixture.reader) : null;
  if (selected && !selected.ok) throw Error(selected.error);
  const started = await calls.startVoice({ kind: "admin_test", parentId: PARENT, childId: CHILD, childName: "Leah", package: selected?.ok ? selected.package : PKG, confirmWorkbook: !!selected?.ok, startedBy: "admin-1" });
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
  const sender = createBoardSender({ sessionId: started.view.id, senderId: "worker", transport: createMemoryTransport(receiver) });
  const samples: CueMeasurement[] = [];
  const board = createBoardSpeech({ sender, now: clock.now, observe: snapshot => opened.call.observeBoard(snapshot), measure: s => samples.push(s) });
  const run = new VoiceCallRun(session, opened.call, { ...(options.board ? { board } : {}), timers: clock.timers, notify: (u) => updates.push(u), closed });
  await run.agentJoined();
  await session.start({ agent: run.agent });
  run.attachBoardAudio();
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
  return { sender, receiver, board, samples, id: started.view.id, calls, store, connections, rebuild, run, session, said, childSays, clock, updates, closed, call: opened.call, seams };
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
    const c = await voiceCall();
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

describe("R408 controlled probes through public interfaces", () => {
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


it.each([true, false])("#329 carries accepted controller batches through AgentSession with fake timestamps %s", async timestamps => {
  const c = await voiceCall({ board: true, timestamps });
  await c.run.childJoined();
  await waitFor(() => c.session.agentState === "listening" && c.said().length > 0, "opening playout");
  await c.board.settled();
  await c.childSays("I don't know.");
  await waitFor(() => c.session.agentState === "listening", "example playout");
  await c.board.settled();
  expect(c.samples.length).toBeGreaterThan(1);
  expect(c.samples.map(s => s.source)).toEqual(c.samples.map(() => timestamps ? "word" : "sentence"));
  expect(c.samples.every(s => s.state === "shown")).toBe(true);
  expect(c.receiver.staged()).toEqual([]);
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
