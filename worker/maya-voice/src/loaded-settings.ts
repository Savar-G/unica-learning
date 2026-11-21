// The speech settings a worker actually loaded (#1146), read back from the objects it built: the speech-to-text's model
// and model options, the voice's model and voice id, and the LiveKit session's resolved turn handling. A setting that
// went missing on the way (a model option the builder did not pass, a live change) shows here as it is, not as the
// configuration asked. The worker logs it at the start of each call (LOADED_SETTINGS_PREFIX) and the baseline harness
// checks it (scripts/maya-baseline-run). No key or secret is read.
//
// LiveKit Agents 1.9.5 keeps the Inference model options on the object (`opts` in inference/stt.js and tts.js, private
// in its types only); the direct AssemblyAI plugin keeps them in a true private field, so for it only the model shows.
import type { voice } from "@livekit/agents";
import type { SpeechToTextConfig, VoiceConfig, VoiceTuning } from "@/lib/maya-voice";
import type { Providers } from "./providers";

export const LOADED_SETTINGS_PREFIX = "[maya voice] loaded settings ";

export interface LoadedSettings {
  stt: {
    label: string;
    model: string;
    /** AssemblyAI `min_turn_silence` and `max_turn_silence` (ms) as the speech-to-text holds them; null when not readable. */
    minTurnSilenceMs: number | null;
    maxTurnSilenceMs: number | null;
    voiceFocus: string | null;
    /** How many keyterms it holds (the words, the call's numbers, are not logged). */
    keyterms: number;
  };
  tts: { label: string; model: string; voice: string | null };
  /** The LiveKit session's resolved turn handling (ms). */
  turn: { detection: unknown; minDelayMs: number | null; maxDelayMs: number | null; interruption: Record<string, number | string | boolean> };
}

type Held = { model?: unknown; voice?: unknown; modelOptions?: Record<string, unknown> };
const held = (o: unknown): Held => ((o as { opts?: Held }).opts ?? {});
const num = (v: unknown) => (typeof v === "number" ? v : null);

/** What the built session and providers hold now. */
export function loadedSettings(session: voice.AgentSession, providers: Pick<Providers, "stt" | "tts">): LoadedSettings {
  const sttHeld = held(providers.stt).modelOptions ?? {};
  const ttsHeld = held(providers.tts);
  const keyterms = sttHeld.keyterms_prompt ?? sttHeld.keyterm;
  const handling = session.sessionOptions.turnHandling;
  const interruption = Object.fromEntries(Object.entries(handling.interruption ?? {})
    .filter((e): e is [string, number | string | boolean] => ["number", "string", "boolean"].includes(typeof e[1])));
  return {
    stt: {
      label: providers.stt.label,
      model: providers.stt.label.startsWith("fake") ? "fake" : providers.stt.model,
      minTurnSilenceMs: num(sttHeld.min_turn_silence),
      maxTurnSilenceMs: num(sttHeld.max_turn_silence),
      voiceFocus: typeof sttHeld.voice_focus === "string" ? sttHeld.voice_focus : null,
      keyterms: Array.isArray(keyterms) ? keyterms.length : 0,
    },
    tts: {
      label: providers.tts.label,
      model: providers.tts.label.startsWith("fake") ? "fake" : providers.tts.model,
      voice: typeof ttsHeld.voice === "string" ? ttsHeld.voice : null,
    },
    turn: {
      detection: typeof handling.turnDetection === "string" ? handling.turnDetection : handling.turnDetection ? "model" : null,
      minDelayMs: num(handling.endpointing?.minDelay),
      maxDelayMs: num(handling.endpointing?.maxDelay),
      interruption,
    },
  };
}

/**
 * Each loaded setting that differs from the configuration, in words ("speech-to-text max_turn_silence is 2500, not
 * 1400"). Empty when the worker runs what it was asked to. The fakes take no tuning, so only their models are checked.
 */
export function settingsProblems(loaded: LoadedSettings, config: { speechToText: SpeechToTextConfig; voice: VoiceConfig; tuning: VoiceTuning }): string[] {
  const problems: string[] = [];
  const check = (what: string, got: unknown, want: unknown) => { if (got !== want) problems.push(`${what} is ${String(got)}, not ${String(want)}`); };
  const { speechToText: stt, voice: tts, tuning } = config;
  check("speech-to-text model", loaded.stt.model, stt.provider === "fake" ? "fake" : stt.model);
  check("voice model", loaded.tts.model, tts.provider === "fake" ? "fake" : tts.model);
  if (tts.provider === "inference") check("voice id", loaded.tts.voice, tts.voice);
  if (stt.provider === "inference" && stt.model.startsWith("assemblyai/")) {
    check("speech-to-text min_turn_silence", loaded.stt.minTurnSilenceMs, tuning.sttMinSilenceMs);
    check("speech-to-text max_turn_silence", loaded.stt.maxTurnSilenceMs, tuning.sttMaxSilenceMs);
    check("speech-to-text voice_focus", loaded.stt.voiceFocus, tuning.sttVoiceFocus ?? null);
  }
  if (stt.provider !== "fake" || tts.provider !== "fake") {
    check("turn endpointing minDelay", loaded.turn.minDelayMs, tuning.turnMinDelayMs);
    check("interruption minDuration", loaded.turn.interruption.minDuration, tuning.interruptMinMs);
    check("interruption minWords", loaded.turn.interruption.minWords, tuning.interruptMinWords);
  }
  return problems;
}

/**
 * Logs what the call's worker loaded, as one JSON line after LOADED_SETTINGS_PREFIX with the differences from the
 * configuration (`problems`), and a warning when there is any. Returns the line's content. A read that fails (an SDK
 * that holds its options elsewhere) is reported as a problem and never stops the call.
 */
export function logLoadedSettings(callId: string, session: voice.AgentSession, providers: Pick<Providers, "stt" | "tts">, config: Parameters<typeof settingsProblems>[1]): { callId: string; problems: string[] } & Partial<LoadedSettings> {
  let report: { callId: string; problems: string[] } & Partial<LoadedSettings>;
  try {
    const loaded = loadedSettings(session, providers);
    report = { callId, ...loaded, problems: settingsProblems(loaded, config) };
  } catch (e) {
    report = { callId, problems: [`the loaded settings could not be read: ${e instanceof Error ? e.message : String(e)}`] };
  }
  console.info(LOADED_SETTINGS_PREFIX + JSON.stringify(report));
  if (report.problems.length) console.warn("[maya voice] loaded settings differ from the configuration", callId, report.problems);
  return report;
}
