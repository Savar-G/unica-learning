// The speech-to-text and the voice of Maya's voice worker, from configuration only (D-163, D-238, src/lib/maya-voice.ts):
// the fakes (no account); LiveKit Inference (`inference.STT` and `inference.TTS` of LiveKit Agents 1.9.5, with the
// LiveKit project's key); or AssemblyAI and Inworld through their direct LiveKit plugins. The direct plugins load only
// when they are chosen. Every real route is written against LiveKit Agents for Node 1.9.5 as installed (its types and
// its inference/tts.js) and is not verified until the accounts exist (docs/maya-voice.md).
//
// Word timings: the Inference voice asks for them with the model's option (INFERENCE_TTS_MODELS). LiveKit Agents 1.9.5
// reads the gateway's word alignment into timed transcripts for Cartesia and Inworld only when that option is set. That
// the gateway sends them is not verified: the listening-test kit (scripts/voice-listening-test.mjs) reports it per
// voice. Without them the board follows sentence ends (speech-audio.ts).
//
// Silence limits and keyterms (docs/maya-voice.md, "Tuning for children"): LiveKit Agents 1.9.5 sends no silence limit
// of its own through Inference (`connectWs` in inference/stt.js sends only the model options it is given), and the direct
// plugin sends 100 ms for both when no mode and no limit is set (`#connectWS` in the AssemblyAI plugin's stt.js). Every
// AssemblyAI model here gets the configuration's limits and the call's keyterms.
import type { stt, tts } from "@livekit/agents";
import { VOICE_TUNING_DEFAULTS, type SpeechToTextConfig, type TurnSilence, type VoiceConfig, type VoiceTuning } from "@/lib/maya-voice";
import { FakeSpeech, FakeSTT, FakeTTS } from "./fake-providers";

/** Changes how long the speech-to-text waits through a silence before it ends the child's turn, during the call. */
export interface TurnPatience {
  /** Sets `min_turn_silence` and `max_turn_silence` (ms) for the turns that follow. */
  setSilence(limits: TurnSilence): void;
}

export interface Providers {
  stt: stt.STT;
  tts: tts.TTS;
  /** Set with the fake speech-to-text: the child's screen sends what they "say" as text. */
  fakeSpeech: FakeSpeech | null;
  /** True when both are fakes: the worker uses no voice activity detection. */
  fake: boolean;
  /** The live silence limit of the real AssemblyAI routes. Null for the fake and for a model with no such limit. */
  patience: TurnPatience | null;
}

/** The AssemblyAI models of the direct plugin that take the Universal-3 Pro options (`languageCodes`). */
const DIRECT_U3 = new Set(["u3-rt-pro", "u3-rt-pro-beta-1", "universal-3-5-pro", "universal-3-6-pro"]);

export async function makeProviders(
  config: { speechToText: SpeechToTextConfig; voice: VoiceConfig; tuning?: VoiceTuning },
  options: { fakeMsPerChar?: number; fakeTimestamps?: boolean; keyterms?: readonly string[] } = {},
): Promise<Providers> {
  const tuning = config.tuning ?? VOICE_TUNING_DEFAULTS;
  const keyterms = options.keyterms ?? [];
  let speech: stt.STT;
  let fakeSpeech: FakeSpeech | null = null;
  let patience: TurnPatience | null = null;
  if (config.speechToText.provider === "inference") {
    const { inference } = await import("@livekit/agents");
    const c = config.speechToText;
    // The Inference docs name the AssemblyAI options `min_turn_silence` and `max_turn_silence` (LiveKit's `AssemblyAIOptions`
    // type still lists the old name, and the gateway reads what is sent), so the options go in as plain data.
    const modelOptions: Record<string, unknown> = {};
    if (c.model.startsWith("assemblyai/")) {
      modelOptions.min_turn_silence = tuning.sttMinSilenceMs;
      modelOptions.max_turn_silence = tuning.sttMaxSilenceMs;
      if (keyterms.length) modelOptions.keyterms_prompt = [...keyterms];
    } else if (c.model.startsWith("deepgram/") && keyterms.length) modelOptions.keyterm = [...keyterms];
    const inferenceStt = new inference.STT({ model: c.model, language: "en", apiKey: c.apiKey, apiSecret: c.apiSecret, modelOptions: modelOptions as never });
    speech = inferenceStt;
    // The SDK merges these into the model options it holds (`updateOptions` in inference/stt.js), so the keyterms stay.
    if (c.model.startsWith("assemblyai/")) patience = { setSilence: ({ minMs, maxMs }) => inferenceStt.updateOptions({ modelOptions: { min_turn_silence: minMs, max_turn_silence: maxMs } as never }) };
  } else if (config.speechToText.provider === "assemblyai") {
    const assemblyai = await import("@livekit/agents-plugin-assemblyai");
    // The model id is the configuration's (MAYA_STT_MODEL); AssemblyAI refuses an id it does not know at connection.
    const model = config.speechToText.model as NonNullable<ConstructorParameters<typeof assemblyai.STT>[0]>["speechModel"];
    const direct = new assemblyai.STT({
      apiKey: config.speechToText.apiKey,
      speechModel: model,
      minTurnSilence: tuning.sttMinSilenceMs,
      maxTurnSilence: tuning.sttMaxSilenceMs,
      ...(keyterms.length ? { keytermsPrompt: [...keyterms] } : {}),
      // The plugin has no `language`: a U3 Pro model detects it, so a child's mumble is steered to English.
      ...(DIRECT_U3.has(String(model)) ? { languageCodes: ["en"] } : {}),
    });
    speech = direct;
    // The plugin sends both in one UpdateConfiguration message.
    patience = { setSilence: ({ minMs, maxMs }) => direct.updateOptions({ minTurnSilence: minMs, maxTurnSilence: maxMs }) };
  } else {
    fakeSpeech = new FakeSpeech();
    speech = new FakeSTT(fakeSpeech);
  }
  let voice: tts.TTS;
  if (config.voice.provider === "inference") {
    const { inference } = await import("@livekit/agents");
    const c = config.voice;
    voice = new inference.TTS({ model: c.model, voice: c.voice, language: "en", apiKey: c.apiKey, apiSecret: c.apiSecret, modelOptions: { ...c.modelOptions } });
  } else if (config.voice.provider === "inworld") {
    const inworld = await import("@livekit/agents-plugin-inworld");
    // Word timestamps, for the board in time with speech (#329).
    voice = new inworld.TTS({ apiKey: config.voice.apiKey, model: config.voice.model, voice: config.voice.voice, timestampType: "WORD" });
  } else {
    voice = new FakeTTS(options.fakeMsPerChar, options.fakeTimestamps);
  }
  return { stt: speech, tts: voice, fakeSpeech, fake: config.speechToText.provider === "fake" && config.voice.provider === "fake", patience };
}
