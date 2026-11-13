// How Maya's audio is delivered (latency plan V4, 2026-11-13; docs/maya-voice.md "Voice delivery"). The settings of the
// leading-silence trim and of the line cache, the worker's delivery log lines, and the trim itself.
//
// One job process serves one call (as ./marks.ts), so the call id for the log lines is kept here once per process.
import { USERDATA_TIMED_TRANSCRIPT, voice } from "@livekit/agents";
import { AudioFrame } from "@livekit/rtc-node";

export interface DeliverySettings {
  /** Trim near-silent audio at the start of each sentence. MAYA_VOICE_TRIM_LEAD=off turns it off. */
  trim: boolean;
  /** The level below which a sample is near-silent (dBFS). MAYA_VOICE_TRIM_DBFS. */
  trimDbfs: number;
  /** The near-silence kept before the first sound, so the start is not clipped (ms). MAYA_VOICE_TRIM_FLOOR_MS. */
  trimFloorMs: number;
  /** Near-silence held while waiting for the first sound; past this, nothing is trimmed (ms). MAYA_VOICE_TRIM_HOLD_MS. */
  trimHoldMs: number;
  /** Play code-written lines from audio made ahead. MAYA_VOICE_CACHE=off turns it off. */
  cache: boolean;
  /** At most this many sentences in the cache. MAYA_VOICE_CACHE_LINES. */
  cacheLines: number;
  /** At most this much audio in the cache (seconds). MAYA_VOICE_CACHE_SECONDS. */
  cacheSeconds: number;
}

export const DELIVERY_DEFAULTS: DeliverySettings = {
  trim: true, trimDbfs: -50, trimFloorMs: 20, trimHoldMs: 1000, cache: true, cacheLines: 24, cacheSeconds: 40,
};

/** The settings from the environment; a missing or invalid value keeps its default. */
export function deliverySettings(env: Record<string, string | undefined> = process.env): DeliverySettings {
  const num = (name: string, fallback: number, ok: (n: number) => boolean) => {
    const raw = env[name]?.trim();
    const n = raw ? Number(raw) : NaN;
    return raw && Number.isFinite(n) && ok(n) ? n : fallback;
  };
  const flag = (name: string, fallback: boolean) => {
    const raw = env[name]?.trim().toLowerCase();
    return raw === "off" || raw === "false" || raw === "0" ? false : raw === "on" || raw === "true" || raw === "1" ? true : fallback;
  };
  const d = DELIVERY_DEFAULTS;
  return {
    trim: flag("MAYA_VOICE_TRIM_LEAD", d.trim),
    trimDbfs: num("MAYA_VOICE_TRIM_DBFS", d.trimDbfs, n => n < 0 && n >= -96),
    trimFloorMs: num("MAYA_VOICE_TRIM_FLOOR_MS", d.trimFloorMs, n => n >= 0 && n <= 500),
    trimHoldMs: num("MAYA_VOICE_TRIM_HOLD_MS", d.trimHoldMs, n => n >= 0 && n <= 5000),
    cache: flag("MAYA_VOICE_CACHE", d.cache),
    cacheLines: num("MAYA_VOICE_CACHE_LINES", d.cacheLines, n => Number.isInteger(n) && n >= 0 && n <= 200),
    cacheSeconds: num("MAYA_VOICE_CACHE_SECONDS", d.cacheSeconds, n => n >= 0 && n <= 600),
  };
}

let settings: DeliverySettings = deliverySettings();
let callId: string | null = null;
// Silent until a job names its call (`configureDelivery`): tests and tools print nothing.
let sink: (line: string, fields: Record<string, unknown>) => void = (line, fields) => { if (callId !== null) console.info(`[maya voice] ${line}`, callId, fields); };

/** This process's call, for the log lines, and its settings (tests pass their own). */
export function configureDelivery(options: { callId?: string | null; settings?: DeliverySettings; log?: (line: string, fields: Record<string, unknown>) => void }) {
  if (options.callId !== undefined) callId = options.callId;
  if (options.settings) settings = options.settings;
  if (options.log) sink = options.log;
}
export const delivery = () => settings;
export const deliveryCallId = () => callId;

/** One log line of the delivery measures. It never throws: a log must not stop audio. No words of the speech. */
export function deliveryLog(line: string, fields: Record<string, unknown>) {
  try { sink(line, fields); } catch { /* The audio goes on. */ }
}

/** Shifts each word time back by `ms`; an end is never 0 or less, so the word still counts. */
export function shiftTimes(times: voice.TimedString[], ms: number): voice.TimedString[] {
  if (!ms) return times;
  const s = ms / 1000;
  return times.map(t => voice.createTimedString({ ...t,
    startTime: t.startTime === undefined ? undefined : Math.max(0, t.startTime - s),
    endTime: t.endTime === undefined ? undefined : Math.max(0.001, t.endTime - s),
  }));
}

/**
 * The near-silent audio at the start of one sentence: measured, and trimmed down to the floor. Frames go in as the voice
 * gives them and come out with the leading silence gone; nothing inside the sentence is ever trimmed. Until the first
 * sound, frames are held (at most `trimHoldMs`): a sentence that is silent for longer, or all silent, comes out whole.
 * The word times on every frame (held ones too) come out moved back by the trimmed time, so a board cue still meets its
 * word. Every frame that comes out of a trim is a new frame with copied samples.
 */
export class LeadTrim {
  private held: AudioFrame[] = [];
  private heldSamples = 0;
  private heldTimes: voice.TimedString[] = [];
  private leading = true;
  private rate = 24_000;
  /** Leading near-silence measured (ms), or null before the first sound or the end. */
  leadMs: number | null = null;
  /** Audio dropped from the start (ms). */
  trimmedMs = 0;
  /** True when the whole sentence (or the hold limit) was near-silent. */
  allSilent = false;
  private readonly threshold: number;
  constructor(private readonly options: Pick<DeliverySettings, "trim" | "trimDbfs" | "trimFloorMs" | "trimHoldMs">) {
    this.threshold = 32768 * 10 ** (options.trimDbfs / 20);
  }

  /** The frames to play now. */
  push(frame: AudioFrame): AudioFrame[] {
    if (!this.leading) return [this.shifted(frame)];
    this.rate = frame.sampleRate;
    const first = this.firstSound(frame);
    if (!this.options.trim) {
      // Measure only: every frame plays at once, as before.
      if (first === null) this.heldSamples += frame.samplesPerChannel;
      else { this.leadMs = this.ms(this.heldSamples + first, frame.sampleRate); this.leading = false; this.heldSamples = 0; }
      return [frame];
    }
    const times = frame.userdata[USERDATA_TIMED_TRANSCRIPT] as voice.TimedString[] | undefined;
    if (first === null) {
      this.held.push(frame);
      this.heldSamples += frame.samplesPerChannel;
      if (times?.length) this.heldTimes.push(...times);
      if (this.heldSamples > frame.sampleRate * this.options.trimHoldMs / 1000) {
        // Too long to be a lead: this is a pause the voice meant, or silence. Nothing is trimmed.
        this.leadMs = this.ms(this.heldSamples, frame.sampleRate);
        this.allSilent = true;
        return this.release();
      }
      return [];
    }
    const lead = this.heldSamples + first;
    this.leadMs = this.ms(lead, frame.sampleRate);
    this.leading = false;
    // The complete lead can cross the hold limit inside this frame. Preserve it regardless of frame boundaries.
    if (lead > frame.sampleRate * this.options.trimHoldMs / 1000) {
      this.allSilent = true;
      return this.release(frame);
    }
    const floor = Math.round(frame.sampleRate * this.options.trimFloorMs / 1000);
    const drop = this.options.trim ? Math.max(0, lead - floor) : 0;
    if (drop === 0) return this.release(frame);
    this.trimmedMs = this.ms(drop, frame.sampleRate);
    const channels = frame.channels;
    const all = [...this.held, frame];
    const total = this.heldSamples + frame.samplesPerChannel;
    const data = new Int16Array((total - drop) * channels);
    let at = 0;
    let skip = drop * channels;
    for (const f of all) {
      const part = f.data.subarray(0, f.samplesPerChannel * channels);
      if (skip >= part.length) { skip -= part.length; continue; }
      data.set(part.subarray(skip), at);
      at += part.length - skip;
      skip = 0;
    }
    const out = new AudioFrame(data, frame.sampleRate, channels, total - drop);
    const allTimes = [...this.heldTimes, ...(times ?? [])];
    if (allTimes.length) out.userdata[USERDATA_TIMED_TRANSCRIPT] = shiftTimes(allTimes, this.trimmedMs);
    this.held = [];
    this.heldTimes = [];
    this.heldSamples = 0;
    return [out];
  }

  /** The voice's stream ended: what is still held comes out whole (an all-silent sentence is played as it came). */
  end(): AudioFrame[] {
    if (!this.leading) return [];
    if (this.held.length || this.heldSamples) {
      this.leadMs = this.ms(this.heldSamples, this.rate);
      this.allSilent = true;
    }
    return this.release();
  }

  /** Held frames (and one more), untrimmed, with their own word times. */
  private release(frame?: AudioFrame): AudioFrame[] {
    this.leading = false;
    const out = frame ? [...this.held, frame] : this.held;
    this.held = [];
    this.heldTimes = [];
    this.heldSamples = 0;
    return out;
  }

  private shifted(frame: AudioFrame): AudioFrame {
    const times = frame.userdata[USERDATA_TIMED_TRANSCRIPT] as voice.TimedString[] | undefined;
    if (this.trimmedMs && times?.length) frame.userdata[USERDATA_TIMED_TRANSCRIPT] = shiftTimes(times, this.trimmedMs);
    return frame;
  }

  /** The index (per channel) of the first sample at or above the level, or null. */
  private firstSound(frame: AudioFrame): number | null {
    const n = frame.samplesPerChannel * frame.channels;
    for (let i = 0; i < n; i++) if (Math.abs(frame.data[i]) >= this.threshold) return Math.floor(i / frame.channels);
    return null;
  }

  private ms(samples: number, rate: number) { return Math.round(samples / rate * 1000 * 10) / 10; }
}
