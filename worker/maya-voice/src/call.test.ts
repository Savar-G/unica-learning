import { ReadableStream, type ReadableStreamDefaultController } from "node:stream/web";
import { initializeLogger, voice } from "@livekit/agents";
import { AudioFrame } from "@livekit/rtc-node";
import { afterEach, describe, expect, it, vi } from "vitest";
import { templateSkills } from "@/lib/assessment";
import { learningEvents } from "@/lib/learning-events";
import { memoryLearningEventStore } from "@/lib/learning-events-memory";
import { memoryWordingHistoryStore, PAUSES } from "@/lib/maya";
import { mayaCalls, type CallSeams } from "@/lib/maya-call";
import { memoryCallStore, memoryConnectionLog } from "@/lib/maya-call-memory";
import { ruleMayaModel } from "@/lib/maya-model-fake";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { checkTrace } from "@/lib/maya-trace";
import { RECONNECT_GRACE_MS, voiceProviders } from "@/lib/maya-voice";
import type { QuestionPackage } from "@/lib/question-package";
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
    advance(s: number) {
      now += s * 1000;
      for (const [h, t] of [...due].sort((a, b) => a[1].at - b[1].at)) {
        if (t.at > now) continue;
        due.delete(h);
        t.run();
      }
    },
  };
}

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

async function voiceCall() {
  const clock = handTimers();
  let n = 0;
  const store = memoryCallStore({ testFamilies: [PARENT] });
  const connections = memoryConnectionLog();
  const rebuild = vi.fn(async () => true);
  const seams: CallSeams = {
    store,
    connections,
    history: memoryWordingHistoryStore(),
    events: learningEvents(memoryLearningEventStore({ children: [{ id: CHILD, parentId: PARENT }], tests: [{ id: TEST, childId: CHILD }] })),
    rebuild,
    model: (id) => (id === null || id === "fake" ? ruleMayaModel() : null),
    isTestFamily: async (p) => p === PARENT,
    clock: clock.now,
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
  const session = voiceSession(providers, { endpointingMs: 20, aecWarmupDuration: 0 });
  const microphone = new SilentMicrophone();
  session.input.audio = microphone;
  session.output.audio = new Speaker();
  const updates: CallUpdate[] = [];
  const closed = vi.fn(async () => {});
  const run = new VoiceCallRun(session, opened.call, { timers: clock.timers, notify: (u) => updates.push(u), closed });
  await run.agentJoined();
  await session.start({ agent: run.agent });
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
  return { id: started.view.id, calls, store, connections, rebuild, run, session, said, childSays, clock, updates, closed, call: opened.call };
}

describe("a voice call through LiveKit with the fake providers", () => {
  it("opens when the child joins, carries each spoken turn to Maya and her words back, and stores the call", async () => {
    const c = await voiceCall();
    c.clock.advance(2);
    await c.run.childJoined();
    await waitFor(() => c.said().length === 1, "Maya's opening");
    expect(c.said()[0]).toMatch(/\bAI\b/);

    c.clock.advance(5);
    const reply = await c.childSays("I got 56.");
    expect(reply).not.toMatch(/66/);
    c.clock.advance(5);
    // An unsure number: Maya checks what she heard.
    await c.childSays("I got sixty six", { confidence: 0.3, alternatives: ["sixty", "fifty six"] });
    c.clock.advance(5);
    await c.childSays("No, I said 66.");
    expect(c.updates.length).toBeGreaterThanOrEqual(3);

    const live = (await c.calls.view(c.id))!;
    expect(live.transcript.filter((l) => l.speaker === "child").map((l) => l.text)).toEqual(["I got 56.", "I got sixty six", "No, I said 66."]);
    // Every word Maya spoke is a word the call stored for her, in order (the easier example's steps are one reply).
    const stored = live.transcript.filter((l) => l.speaker === "maya").map((l) => l.text.replaceAll("{name}", "Leah"));
    expect(c.said().join(" ")).toBe(stored.join(" "));

    c.clock.advance(10);
    await c.run.hangUp();
    const [row] = c.store.rows();
    expect(row).toMatchObject({ mode: "voice", status: "ended", speechToText: "fake", voice: "fake", connectedSeconds: 25 });
    expect(row.outcome?.mishearing.corrections).toBe(1);
    expect(row.outcome?.mishearing.confirmations).toBeGreaterThanOrEqual(1);
    expect(row.trace?.turns.find((t) => t.kind === "child" && t.text === "I got sixty six")).toMatchObject({ uncertain: true });
    expect(checkTrace(row.trace).ok).toBe(true);
    expect(row.learningEventId).not.toBeNull();
    expect(c.connections.rows().map((e) => e.kind)).toEqual(["agent_joined", "child_joined", "child_left", "agent_left"]);
    expect(c.updates.at(-1)).toMatchObject({ ended: true });
    expect(c.closed).toHaveBeenCalledTimes(1);
  });

  it("checks in after the child's silence, counted from the end of Maya's speech", async () => {
    const c = await voiceCall();
    await c.run.childJoined();
    await waitFor(() => c.said().length === 1, "Maya's opening");
    await waitFor(() => c.session.agentState !== "speaking", "the opening to finish");
    await c.call.settled();
    c.clock.advance(PAUSES.thinkCheckMs / 1000 - 1);
    expect(c.said()).toHaveLength(1);
    c.clock.advance(2);
    await waitFor(() => c.said().length === 2, "Maya's check-in");
    const stored = (await c.calls.view(c.id))!;
    expect(stored.transcript.some((l) => l.speaker === "note" && l.text === "The child stayed quiet.")).toBe(true);
  });

  it("ends as a technical issue when the child's connection drops and does not come back", async () => {
    const c = await voiceCall();
    await c.run.childJoined();
    await waitFor(() => c.said().length === 1, "Maya's opening");
    c.clock.advance(20);
    await c.run.childLeft("dropped");
    c.clock.advance(RECONNECT_GRACE_MS / 1000 + 1);
    await waitFor(() => c.closed.mock.calls.length === 1, "the call to close");
    const [row] = c.store.rows();
    expect(row.outcome?.reason).toBe("technical_issue");
    expect(row.connectedSeconds).toBe(20);
  });

  it("goes on when the child is back in time, and counts the gap out of the connected time", async () => {
    const c = await voiceCall();
    await c.run.childJoined();
    await waitFor(() => c.said().length === 1, "Maya's opening");
    c.clock.advance(10);
    await c.run.childLeft("dropped");
    c.clock.advance(5);
    await c.run.childJoined();
    c.clock.advance(RECONNECT_GRACE_MS / 1000 + 1);
    expect(c.closed).not.toHaveBeenCalled();
    await c.childSays("Is it 66?");
    await c.run.hangUp();
    const [row] = c.store.rows();
    expect(row.connectedSeconds).toBe(10 + RECONNECT_GRACE_MS / 1000 + 1);
    expect(row.outcome?.reason).not.toBe("technical_issue");
  });
});
