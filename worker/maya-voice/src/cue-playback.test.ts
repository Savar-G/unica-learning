import { AudioFrame, TrackPublishOptions } from "@livekit/rtc-node";
import { initializeLogger, voice } from "@livekit/agents";
import { expect, it, vi } from "vitest";
import { createBoardReceiver, createBoardSender } from "@/lib/board-protocol";
import { createMemoryTransport } from "@/lib/board-protocol-memory";
import { createBoardSpeech, SPEECH_SCOPE_DATA, type SpeechScope } from "@/lib/board-speech";
import { CuePlaybackOutput } from "./cue-playback";

initializeLogger({ pretty: false, level: "silent" });

function clock() {
  let now = 10000;
  let n = 0;
  const jobs = new Map<number, { at: number; run(): void }>();
  return {
    now: () => now,
    set(ms: number, run: () => void) { jobs.set(++n, { at: now + ms, run }); return n; },
    clear(id: unknown) { jobs.delete(id as number); },
    async advance(ms: number) {
      const end = now + ms;
      for (;;) {
        const next = [...jobs].sort((a, b) => a[1].at - b[1].at)[0];
        if (!next || next[1].at > end) break;
        now = next[1].at; jobs.delete(next[0]); next[1].run();
        await new Promise<void>(r => setImmediate(r));
      }
      now = end;
    },
    count: () => jobs.size,
  };
}

/** Buffered continuous output deliberately emits no completed-run events before its final drain. */
class ContinuousAudio extends voice.AudioOutput {
  constructor(private readonly now: () => number) { super(24000); }
  override async captureFrame(frame: AudioFrame) {
    const before = this.capturedPlayoutSegments;
    await super.captureFrame(frame);
    if (before !== this.capturedPlayoutSegments) this.onPlaybackStarted(this.now());
  }
  override clearBuffer() { this.onPlaybackFinished({ playbackPosition: 0, interrupted: true }); }
}
const frame = (ms: number, scope: SpeechScope) => {
  const frame = new AudioFrame(new Int16Array(ms * 24), 24000, 1, ms * 24);
  frame.userdata[SPEECH_SCOPE_DATA] = scope;
  return frame;
};
async function setup() {
  const timers = clock();
  const receiver = createBoardReceiver({ sessionId: "call", clock: timers.now });
  const sender = createBoardSender({ sessionId: "call", senderId: "worker", transport: createMemoryTransport(receiver) });
  const board = createBoardSpeech({ sender, now: timers.now });
  await board.connect();
  await board.stage("speech", [1, 2].map(word => ({ word, batch: { transactionId: `b${word}`, commands: [{ op: "write", id: `n${word}`, text: String(word), place: { region: "main" } }] } })));
  const scope = board.capture("speech")!;
  await board.timing(scope, 1, 100, "word");
  await board.timing(scope, 2, 1500, "word");
  const audio = new ContinuousAudio(timers.now);
  const failure = vi.fn();
  const output = new CuePlaybackOutput(audio, board, timers, p => { void p.catch(failure); }, scope => { void board.interrupt(scope); });
  const shown = () => receiver.snapshot().events.filter(e => e.kind === "batch").map(e => e.batchId);
  return { scope, timers, receiver, sender, board, output, audio, shown, failure };
}

it("R450-1 releases two cues during continuous playback before the final drain", async () => {
  const c = await setup();
  await c.output.captureFrame(frame(2000, c.scope));
  c.output.flush();
  await c.timers.advance(99);
  expect(c.shown()).toEqual([]);
  await c.timers.advance(1);
  expect(c.shown()).toEqual(["b1"]);
  await c.timers.advance(900);
  expect(c.shown()).toEqual(["b1"]);
  await c.timers.advance(500);
  expect(c.shown()).toEqual(["b1", "b2"]);
  expect(c.audio.pendingPlayoutSegments).toBe(1);
  await c.timers.advance(500);
  c.audio.onPlaybackFinished({ playbackPosition: 2, interrupted: false });
  await c.board.settled();
  expect(c.failure).not.toHaveBeenCalled();
  expect(c.timers.count()).toBe(0);
});

it("R450-1 cancels the cue clock and retains shown work on interruption", async () => {
  const c = await setup();
  await c.output.captureFrame(frame(2000, c.scope));
  await c.timers.advance(100);
  c.output.cancelPending(c.scope);
  await c.board.interrupt(c.scope);
  await c.timers.advance(2000);
  await c.board.settled();
  expect(c.shown()).toEqual(["b1"]);
  expect(c.receiver.staged()).toEqual([]);
  expect(c.timers.count()).toBe(0);
});


it("R450-1 releases cues on the SDK's continuous native output before final drain", async () => {
  const native = new voice.ParticipantAudioOutput({ localParticipant: { publishTrack: async () => ({ sid: "local", waitForSubscription: async () => {} }) } } as unknown as ConstructorParameters<typeof voice.ParticipantAudioOutput>[0],
    { sampleRate: 24000, numChannels: 1, queueSizeMs: 100, trackPublishOptions: new TrackPublishOptions() });
  await native.start(new AbortController().signal);
  const receiver = createBoardReceiver({ sessionId: "native" });
  const sender = createBoardSender({ sessionId: "native", senderId: "worker", transport: createMemoryTransport(receiver) });
  const samples: { reachedAt: number }[] = [];
  const board = createBoardSpeech({ sender, now: () => Date.now(), measure: s => samples.push(s) });
  await board.connect();
  await board.stage("speech", [1, 2].map(word => ({ word, batch: { transactionId: `b${word}`, commands: [{ op: "write", id: `n${word}`, text: String(word), place: { region: "main" } }] } })));
  const scope = board.capture("speech")!;
  await board.timing(scope, 1, 100, "word");
  await board.timing(scope, 2, 1500, "word");
  const failure = vi.fn();
  const output = new CuePlaybackOutput(native, board, { now: () => Date.now(), set: (ms, run) => setTimeout(run, ms), clear: h => clearTimeout(h as ReturnType<typeof setTimeout>) },
    p => { void p.catch(failure); }, scope => { void board.interrupt(scope); });
  const started = Date.now();
  const capture = output.captureFrame(frame(2000, scope)).then(() => output.flush());
  try {
    await new Promise(r => setTimeout(r, 500));
    await board.settled();
    expect(receiver.snapshot().events.filter(e => e.kind === "batch").map(e => e.batchId)).toEqual(["b1"]);
    expect(samples[0].reachedAt - started).toBeLessThan(300);
    await capture;
    await output.waitForPlayout();
    await board.settled();
    expect(receiver.snapshot().events.filter(e => e.kind === "batch")).toHaveLength(2);
    expect(failure).not.toHaveBeenCalled();
  } finally { output.cancelPending(scope); native.clearBuffer(); await capture; await native.close(); }
});


it.each([true, false])("R450-8 an obsolete completion cannot stop a newer cue timer, old segment flushed %s", async flushed => {
  const c = await setup();
  await c.output.captureFrame(frame(2000, c.scope));
  if (flushed) c.output.flush();
  await c.board.interrupt(c.scope);
  await c.board.stage("next", [1, 2, 3].map(word => ({ word, batch: { transactionId: `next-${word}`, commands: [{ op: "write", id: `next-${word}`, text: String(word), place: { region: "main" } }] } })));
  const scope = c.board.capture("next")!;
  for (let word = 1; word <= 3; word++) await c.board.timing(scope, word, word * 100, "word");
  await c.output.captureFrame(frame(1000, scope));
  c.audio.onPlaybackFinished({ playbackPosition: 0, interrupted: true });
  await c.board.settled();
  expect(c.board.owns(scope)).toBe(true);
  expect(c.receiver.staged()).toHaveLength(3);
  expect(c.timers.count()).toBe(1);
  await c.timers.advance(300);
  expect(c.shown()).toEqual(["next-1", "next-2", "next-3"]);
  c.output.cancelPending(scope);
  expect(c.timers.count()).toBe(0);
});

it("R450-10 scoped media cleanup refuses an obsolete segment owner", async () => {
  const c = await setup();
  await c.output.captureFrame(frame(200, c.scope));
  c.output.flush();
  c.audio.onPlaybackFinished({ playbackPosition: 0.2, interrupted: false });
  await c.board.stage("next", [{ word: 1, batch: { transactionId: "next", commands: [{ op: "write", id: "next", text: "3", place: { region: "main" } }] } }]);
  const scope = c.board.capture("next")!;
  await c.board.timing(scope, 1, 100, "word");
  await c.output.captureFrame(frame(200, scope));
  c.output.clearBuffer(c.scope);
  c.output.pause(c.scope);
  c.output.cancelPending(c.scope);
  expect(c.output.pendingPlayoutSegments).toBe(1);
  expect(c.timers.count()).toBe(1);
  await c.timers.advance(100);
  expect(c.shown()).toContain("next");
  c.output.clearBuffer(scope);
  expect(c.output.pendingPlayoutSegments).toBe(0);
  expect(c.timers.count()).toBe(0);
});

it("R450-9 cancellation while native admission waits for startup creates no segment", async () => {
  const c = await setup();
  const native = new voice.ParticipantAudioOutput({ localParticipant: { publishTrack: async () => ({ sid: "local", waitForSubscription: async () => {} }) } } as unknown as ConstructorParameters<typeof voice.ParticipantAudioOutput>[0],
    { sampleRate: 24000, numChannels: 1, queueSizeMs: 100, trackPublishOptions: new TrackPublishOptions() });
  const output = new CuePlaybackOutput(native, c.board, c.timers, p => { void p.catch(c.failure); }, scope => { void c.board.interrupt(scope); });
  try {
    const captured = output.captureFrame(frame(100, c.scope));
    await Promise.resolve();
    output.cancelPending(c.scope);
    const stopping = c.board.interrupt(c.scope);
    output.clearBuffer(c.scope);
    await native.start(new AbortController().signal);
    await Promise.all([captured, stopping]);
    output.flush();
    expect(output.capturedPlayoutSegments).toBe(0);
    expect(output.capturedPlayoutSegments).toBe(native.capturedPlayoutSegments);
    expect(output.pendingPlayoutSegments).toBe(0);
    await output.waitForPlayout();
    expect(c.failure).not.toHaveBeenCalled();
  } finally { native.clearBuffer(); await native.close(); }
});
