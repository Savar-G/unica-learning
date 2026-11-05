import { inference, initializeLogger } from "@livekit/agents";
import { describe, expect, it } from "vitest";
import { voiceProviders } from "@/lib/maya-voice";
import { FakeSTT, FakeTTS } from "./fake-providers";
import { makeProviders } from "./providers";

// Providers change by configuration only (#326, D-163, D-238, D-286): the same worker builds LiveKit Inference (the
// default), the fakes, or AssemblyAI and Inworld directly, from the environment. The real plugins are only constructed here (no network, no account): whether they work is
// checked once the accounts exist (docs/maya-voice.md).

initializeLogger({ pretty: false, level: "silent" });

const build = async (env: Record<string, string>) => {
  const config = voiceProviders({ MAYA_VOICE_PRIVACY_CONFIRMED: "assemblyai-optout,inworld-retention,livekit-inference-zdr", ...env });
  if (!config.ok) throw new Error(config.problems.join("; "));
  return { config, providers: await makeProviders(config) };
};

describe("the worker's providers", () => {
  it("are LiveKit Inference with nothing chosen (D-286)", async () => {
    const { providers, config } = await build({ LIVEKIT_API_KEY: "test-key", LIVEKIT_API_SECRET: "test-secret", MAYA_VOICE: "Ashley" });
    expect(config.ids).toEqual({ speechToText: "inference/assemblyai/universal-3-6-pro", voice: "inference/inworld/inworld-tts-2/Ashley" });
    expect(providers.stt).toBeInstanceOf(inference.STT);
    expect(providers.tts).toBeInstanceOf(inference.TTS);
    expect(providers.fake).toBe(false);
    await providers.tts.close();
    await providers.stt.close();
  });

  it("are the fakes only when both are set to fake", async () => {
    const { providers } = await build({ MAYA_STT: "fake", MAYA_TTS: "fake" });
    expect(providers.stt).toBeInstanceOf(FakeSTT);
    expect(providers.tts).toBeInstanceOf(FakeTTS);
    expect(providers.fake).toBe(true);
    expect(providers.fakeSpeech).not.toBeNull();
  });

  it("are AssemblyAI and Inworld when the configuration says so, with the configured model and voice", async () => {
    const { providers } = await build({ MAYA_STT: "assemblyai", ASSEMBLYAI_API_KEY: "test-key", MAYA_TTS: "inworld", INWORLD_API_KEY: "test-key", MAYA_VOICE: "Ashley" });
    expect(providers.stt).not.toBeInstanceOf(FakeSTT);
    expect(providers.stt.model).toBe("universal-3-6-pro");
    expect(providers.stt.label).toMatch(/assemblyai/i);
    expect(providers.tts).not.toBeInstanceOf(FakeTTS);
    expect(providers.tts.label).toMatch(/inworld/i);
    expect(providers.tts.capabilities.alignedTranscript).toBe(true);
    expect(providers.fake).toBe(false);
    expect(providers.fakeSpeech).toBeNull();
    await providers.tts.close();
    await providers.stt.close();
  });

  it("mix: a real speech-to-text with the fake voice", async () => {
    const { providers, config } = await build({ MAYA_STT: "assemblyai", ASSEMBLYAI_API_KEY: "test-key", MAYA_STT_MODEL: "universal-streaming-english", MAYA_TTS: "fake" });
    expect(config.ids).toEqual({ speechToText: "assemblyai/universal-streaming-english", voice: "fake" });
    expect(providers.stt.model).toBe("universal-streaming-english");
    expect(providers.tts).toBeInstanceOf(FakeTTS);
    expect(providers.fake).toBe(false);
    await providers.stt.close();
  });

  it("are LiveKit Inference when the configuration says so, and the voice asks for word timings", async () => {
    const lk = { MAYA_STT: "inference", MAYA_TTS: "inference", LIVEKIT_API_KEY: "test-key", LIVEKIT_API_SECRET: "test-secret", MAYA_VOICE: "Ashley" };
    const { providers, config } = await build(lk);
    expect(config.ids).toEqual({ speechToText: "inference/assemblyai/universal-3-6-pro", voice: "inference/inworld/inworld-tts-2/Ashley" });
    expect(providers.stt).toBeInstanceOf(inference.STT);
    expect(providers.stt.model).toBe("assemblyai/universal-3-6-pro");
    expect(providers.tts).toBeInstanceOf(inference.TTS);
    expect(providers.tts.model).toBe("inworld/inworld-tts-2");
    // LiveKit Agents 1.9.5 reads the gateway's word alignment only with this capability (inference/tts.js).
    expect(providers.tts.capabilities.alignedTranscript).toBe(true);
    expect(providers.fake).toBe(false);
    await providers.tts.close();
    await providers.stt.close();

    const cartesia = await build({ ...lk, MAYA_TTS_MODEL: "cartesia/sonic-3.6" });
    expect(cartesia.providers.tts.model).toBe("cartesia/sonic-3.6");
    expect(cartesia.providers.tts.capabilities.alignedTranscript).toBe(true);
    await cartesia.providers.tts.close();
    await cartesia.providers.stt.close();
  });

  it("a voice Inference serves without the timing option would have no word timings: the board then uses sentence ends", () => {
    // Not a configuration the worker accepts (INFERENCE_TTS_MODELS), shown here so a change to the SDK's rule is seen.
    const plain = new inference.TTS({ model: "cartesia/sonic-3.6", voice: "v", apiKey: "k", apiSecret: "s" });
    expect(plain.capabilities.alignedTranscript).toBe(false);
    const deepgram = new inference.TTS({ model: "deepgram/aura-2", voice: "v", apiKey: "k", apiSecret: "s" });
    expect(deepgram.capabilities.alignedTranscript).toBe(false);
    void plain.close();
    void deepgram.close();
  });
});
