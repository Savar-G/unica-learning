// The speech-to-text and the voice of Maya's voice worker, from configuration only (D-163, src/lib/maya-voice.ts):
// the fakes (no account), or AssemblyAI and Inworld through their LiveKit plugins. The real plugins load only when they
// are chosen. They are written against the plugins' documented options (LiveKit Agents 1.9.5) and are not verified
// until the accounts exist (docs/maya-voice.md).
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
  if (config.speechToText.provider === "assemblyai") {
    const assemblyai = await import("@livekit/agents-plugin-assemblyai");
    // The model id is the configuration's (MAYA_STT_MODEL); AssemblyAI refuses an id it does not know at connection.
    speech = new assemblyai.STT({ apiKey: config.speechToText.apiKey, speechModel: config.speechToText.model as NonNullable<ConstructorParameters<typeof assemblyai.STT>[0]>["speechModel"] });
  } else {
    fakeSpeech = new FakeSpeech();
    speech = new FakeSTT(fakeSpeech);
  }
  let voice: tts.TTS;
  if (config.voice.provider === "inworld") {
    const inworld = await import("@livekit/agents-plugin-inworld");
    // Word timestamps, for the board in time with speech (#329).
    voice = new inworld.TTS({ apiKey: config.voice.apiKey, model: config.voice.model, voice: config.voice.voice, timestampType: "WORD" });
  } else {
    voice = new FakeTTS(options.fakeMsPerChar, options.fakeTimestamps);
  }
  return { stt: speech, tts: voice, fakeSpeech, fake: config.speechToText.provider === "fake" && config.voice.provider === "fake" };
}
