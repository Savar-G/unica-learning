import { ReadableStream } from "node:stream/web";
import { AudioFrame } from "@livekit/rtc-node";
import { initializeLogger, tts, USERDATA_TIMED_TRANSCRIPT, voice } from "@livekit/agents";
import { afterEach, describe, expect, it } from "vitest";
import { boardPaths, type Batch } from "@/lib/board";
import { createBoardReceiver, createBoardSender } from "@/lib/board-protocol";
import { createMemoryTransport } from "@/lib/board-protocol-memory";
import { createBoardSpeech } from "@/lib/board-speech";
import { FakeTTS } from "./fake-providers";
import { boardAudio, countedSynthesis } from "./speech-audio";
import { configureDelivery, DELIVERY_DEFAULTS, deliverySettings, LeadTrim } from "./voice-delivery";

initializeLogger({ pretty: false, level: "silent" });

const RATE = 24_000;
/** A frame of `ms` at one sample value. */
const frame = (ms: number, value = 0, times?: voice.TimedString[]) => {
  const n = RATE * ms / 1000;
  const f = new AudioFrame(new Int16Array(n).fill(value), RATE, 1, n);
  if (times) f.userdata[USERDATA_TIMED_TRANSCRIPT] = times;
  return f;
};
const word = (text: string, start: number, end: number) => voice.createTimedString({ text, startTime: start, endTime: end });
const ms = (frames: AudioFrame[]) => frames.reduce((t, f) => t + f.samplesPerChannel / f.sampleRate * 1000, 0);
const run = (trim: LeadTrim, input: AudioFrame[]) => [...input.flatMap(f => trim.push(f)), ...trim.end()];
const SOUND = 1000;

afterEach(() => configureDelivery({ settings: DELIVERY_DEFAULTS, callId: null }));

describe("delivery settings", () => {
  it("default to the trim and the cache on, and take valid overrides only", () => {
    expect(deliverySettings({})).toEqual(DELIVERY_DEFAULTS);
    expect(deliverySettings({ MAYA_VOICE_TRIM_LEAD: "off", MAYA_VOICE_TRIM_FLOOR_MS: "30", MAYA_VOICE_TRIM_DBFS: "-60", MAYA_VOICE_CACHE: "off", MAYA_VOICE_CACHE_LINES: "4", MAYA_VOICE_CACHE_SECONDS: "10" }))
      .toEqual({ ...DELIVERY_DEFAULTS, trim: false, trimFloorMs: 30, trimDbfs: -60, cache: false, cacheLines: 4, cacheSeconds: 10 });
    expect(deliverySettings({ MAYA_VOICE_TRIM_FLOOR_MS: "-5", MAYA_VOICE_TRIM_DBFS: "12", MAYA_VOICE_CACHE_LINES: "2.5", MAYA_VOICE_TRIM_LEAD: "maybe" })).toEqual(DELIVERY_DEFAULTS);
  });
});

describe("the leading-silence trim (LeadTrim)", () => {
  it("drops the near-silence before the first sound down to the floor", () => {
    const trim = new LeadTrim(DELIVERY_DEFAULTS);
    const out = run(trim, [frame(100), frame(100), frame(100, SOUND), frame(100, SOUND)]);
    expect(trim.leadMs).toBe(200);
    expect(trim.trimmedMs).toBe(180);
    expect(ms(out)).toBe(400 - 180);
    // The 20 ms floor of silence stays, then the sound starts.
    const first = out[0].data;
    expect(first.slice(0, RATE * 0.02).every(v => v === 0)).toBe(true);
    expect(first[RATE * 0.02]).toBe(SOUND);
  });

  it("reads the level: samples under -50 dBFS are near-silent, samples over it are sound", () => {
    // -50 dBFS is about 104 of 32768.
    const quiet = new LeadTrim(DELIVERY_DEFAULTS);
    run(quiet, [frame(100, 90), frame(100, SOUND)]);
    expect(quiet.leadMs).toBe(100);
    const loud = new LeadTrim(DELIVERY_DEFAULTS);
    run(loud, [frame(100, 120), frame(100, SOUND)]);
    expect(loud.leadMs).toBe(0);
    expect(loud.trimmedMs).toBe(0);
    // A negative sample counts by its size.
    const negative = new LeadTrim(DELIVERY_DEFAULTS);
    run(negative, [frame(50), frame(100, -SOUND)]);
    expect(negative.leadMs).toBe(50);
  });

  it("trims nothing when the lead is shorter than the floor", () => {
    const trim = new LeadTrim(DELIVERY_DEFAULTS);
    const input = [frame(10), frame(100, SOUND)];
    const out = run(trim, input);
    expect(trim.leadMs).toBe(10);
    expect(trim.trimmedMs).toBe(0);
    expect(out).toEqual(input);
  });

  it("moves every word time back by the trimmed time, held frames' times too", () => {
    const trim = new LeadTrim(DELIVERY_DEFAULTS);
    const out = run(trim, [
      frame(100, 0, [word("Write ", 0.2, 0.4)]),
      frame(100),
      frame(300, SOUND),
      frame(100, SOUND, [word("27 ", 0.4, 0.6)]),
    ]);
    expect(trim.trimmedMs).toBe(180);
    const times = out.flatMap(f => (f.userdata[USERDATA_TIMED_TRANSCRIPT] as voice.TimedString[] | undefined) ?? []);
    expect(times.map(t => [t.text, Number(t.startTime!.toFixed(3)), Number(t.endTime!.toFixed(3))])).toEqual([["Write ", 0.02, 0.22], ["27 ", 0.22, 0.42]]);
  });

  it("never trims inside a sentence: a pause after the first sound stays", () => {
    const trim = new LeadTrim(DELIVERY_DEFAULTS);
    const out = run(trim, [frame(100), frame(100, SOUND), frame(200), frame(100, SOUND)]);
    expect(trim.trimmedMs).toBe(80);
    expect(ms(out)).toBe(500 - 80);
  });

  it("plays a sentence that is all silence as it came", () => {
    const trim = new LeadTrim(DELIVERY_DEFAULTS);
    const input = [frame(100), frame(100), frame(100)];
    const out = run(trim, input);
    expect(out).toEqual(input);
    expect(trim.allSilent).toBe(true);
    expect(trim.leadMs).toBe(300);
    expect(trim.trimmedMs).toBe(0);
  });

  it("stops holding past its limit: a long silence plays whole", () => {
    const trim = new LeadTrim({ ...DELIVERY_DEFAULTS, trimHoldMs: 150 });
    expect(trim.push(frame(100))).toEqual([]);
    const released = trim.push(frame(100));
    expect(released).toHaveLength(2);
    expect(trim.push(frame(100, SOUND))).toHaveLength(1);
    expect(trim.trimmedMs).toBe(0);
  });

  it("with the trim off, measures only and holds nothing", () => {
    const trim = new LeadTrim({ ...DELIVERY_DEFAULTS, trim: false });
    const a = frame(100);
    expect(trim.push(a)).toEqual([a]);
    const b = frame(100, SOUND);
    expect(trim.push(b)).toEqual([b]);
    expect(trim.leadMs).toBe(100);
    expect(trim.trimmedMs).toBe(0);
  });

  it("gives a trimmed frame its own copy of the samples, never a view", () => {
    const trim = new LeadTrim(DELIVERY_DEFAULTS);
    const sound = frame(100, SOUND);
    const [out] = run(trim, [frame(100), sound]);
    expect(out.data.buffer).not.toBe(sound.data.buffer);
    expect(out.data.byteOffset).toBe(0);
    expect(out.data.length).toBe(out.samplesPerChannel);
  });
});

describe("a board cue after a trim, with the fake voice", () => {
  const columns: Batch = { transactionId: "columns", commands: [{ op: "columns", id: "sum", operation: "add", operands: [{ id: "top", value: "27" }, { id: "bottom", value: "39" }], place: { region: "main" } }] };
  /** The agent's default voice node, as LiveKit's: the provider's frames, with their word times on them. */
  const fakeVoice = (fake: FakeTTS) => async (input: ReadableStream<string>) => {
    const stream = fake.stream();
    stream.updateInputStream(input);
    return new ReadableStream<AudioFrame>({ async start(c) {
      for await (const ev of stream) {
        if (ev === tts.SynthesizeStream.END_OF_STREAM) break;
        if (ev.timedTranscripts?.length) ev.frame.userdata[USERDATA_TIMED_TRANSCRIPT] = ev.timedTranscripts;
        c.enqueue(ev.frame);
      }
      c.close();
      stream.close();
    } });
  };

  it("fires at its word's end less the trimmed lead", async () => {
    const receiver = createBoardReceiver({ sessionId: "call" });
    const board = createBoardSpeech({ sender: createBoardSender({ sessionId: "call", senderId: "worker", transport: createMemoryTransport(receiver) }), now: () => 0 });
    await board.connect();
    await board.stage("speech", [{ word: 2, batch: columns }]);
    const scope = board.capture("speech")!;
    const fake = new FakeTTS(10);
    fake.leadMs = 200;
    fake.amplitude = SOUND;
    const lines: Record<string, unknown>[] = [];
    configureDelivery({ callId: "call-1", log: (line, fields) => lines.push({ line, ...fields }) });
    const text = new ReadableStream<string>({ start(c) { c.enqueue("Write 27 now."); c.close(); } });
    const played: AudioFrame[] = [];
    for await (const f of boardAudio(text, input => countedSynthesis(input, fakeVoice(fake), () => {}), board, scope)) played.push(f);
    // "27" ends at 200 ms of lead + 8 characters of 10 ms. The trim keeps 20 ms of the lead, so it ends at 100 ms.
    expect(lines).toEqual([expect.objectContaining({ line: "voice lead", sentence: 0, leadMs: 200, trimmedMs: 180, allSilent: false, madeAhead: false })]);
    // (Word times are seconds as floats: 0.28 - 0.18 is a hair over 0.1.)
    await board.played(scope, 99);
    expect(boardPaths(receiver.scene())).toEqual([]);
    await board.played(scope, 101);
    expect(boardPaths(receiver.scene()).length).toBeGreaterThan(0);
    // The sentence's audio is 180 ms shorter: 200 ms of lead and 13 characters of 10 ms, less the trim.
    expect(Math.round(ms(played))).toBe(200 + 140 - 180);
  });
});
