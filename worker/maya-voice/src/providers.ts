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
import type { stt, tts } from "@livekit/agents";
import type { SpeechToTextConfig, VoiceConfig } from "@/lib/maya-voice";
import { FakeSpeech, FakeSTT, FakeTTS } from "./fake-providers";

export interface Providers {
  stt: stt.STT;
  tts: tts.TTS;
  /** Set with the fake speech-to-text: the child's screen sends what they "say" as text. */
  fakeSpeech: FakeSpeech | null;
  /** True when both are fakes: the worker uses no voice activity detection. */
  fake: boolean;
}

export async function makeProviders(config: { speechToText: SpeechToTextConfig; voice: VoiceConfig }, options: { fakeMsPerChar?: number; fakeTimestamps?: boolean } = {}): Promise<Providers> {
  let speech: stt.STT;
  let fakeSpeech: FakeSpeech | null = null;
  if (config.speechToText.provider === "inference") {
    const { inference } = await import("@livekit/agents");
    const c = config.speechToText;
    speech = new inference.STT({ model: c.model, language: "en", apiKey: c.apiKey, apiSecret: c.apiSecret });
  } else if (config.speechToText.provider === "assemblyai") {
    const assemblyai = await import("@livekit/agents-plugin-assemblyai");
    // The model id is the configuration's (MAYA_STT_MODEL); AssemblyAI refuses an id it does not know at connection.
    speech = new assemblyai.STT({ apiKey: config.speechToText.apiKey, speechModel: config.speechToText.model as NonNullable<ConstructorParameters<typeof assemblyai.STT>[0]>["speechModel"] });
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
  return { stt: speech, tts: voice, fakeSpeech, fake: config.speechToText.provider === "fake" && config.voice.provider === "fake" };
}
