import { AudioFrame, TrackPublishOptions } from "@livekit/rtc-node";
import { initializeLogger, voice } from "@livekit/agents";
import { expect, it, vi } from "vitest";
import { createBoardReceiver, createBoardSender } from "@/lib/board-protocol";
import { createMemoryTransport } from "@/lib/board-protocol-memory";
import { createBoardSpeech } from "@/lib/board-speech";
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
const frame = (ms: number) => new AudioFrame(new Int16Array(ms * 24), 24000, 1, ms * 24);
async function setup() {
  const timers = clock();
  const receiver = createBoardReceiver({ sessionId: "call", clock: timers.now });
  const sender = createBoardSender({ sessionId: "call", senderId: "worker", transport: createMemoryTransport(receiver) });
  const board = createBoardSpeech({ sender, now: timers.now });
  await board.reconnect();
  await board.stage("speech", [1, 2].map(word => ({ word, batch: { transactionId: `b${word}`, commands: [{ op: "write", id: `n${word}`, text: String(word), place: { region: "main" } }] } })));
  await board.timing("speech", 1, 100, "word");
  await board.timing("speech", 2, 1500, "word");
  const audio = new ContinuousAudio(timers.now);
  const failure = vi.fn();
  const output = new CuePlaybackOutput(audio, board, timers, () => "speech", p => { void p.catch(failure); }, () => { void board.interrupt(); });
  const shown = () => receiver.snapshot().events.filter(e => e.kind === "batch").map(e => e.batchId);
  return { timers, receiver, sender, board, output, audio, shown, failure };
}

it("R450-1 releases two cues during continuous playback before the final drain", async () => {
  const c = await setup();
  await c.output.captureFrame(frame(2000));
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
  await c.output.captureFrame(frame(2000));
  await c.timers.advance(100);
  c.output.cancelPending();
  await c.board.interrupt();
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
  await board.reconnect();
  await board.stage("speech", [1, 2].map(word => ({ word, batch: { transactionId: `b${word}`, commands: [{ op: "write", id: `n${word}`, text: String(word), place: { region: "main" } }] } })));
  await board.timing("speech", 1, 100, "word");
  await board.timing("speech", 2, 1500, "word");
  const failure = vi.fn();
  const output = new CuePlaybackOutput(native, board, { now: () => Date.now(), set: (ms, run) => setTimeout(run, ms), clear: h => clearTimeout(h as ReturnType<typeof setTimeout>) },
    () => "speech", p => { void p.catch(failure); }, () => { void board.interrupt(); });
  const started = Date.now();
  const capture = output.captureFrame(frame(2000)).then(() => output.flush());
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
  } finally { output.cancelPending(); native.clearBuffer(); await capture; await native.close(); }
});
