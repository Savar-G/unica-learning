import { inference, initializeLogger } from "@livekit/agents";
import { describe, expect, it } from "vitest";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { callKeyterms, voiceProviders } from "@/lib/maya-voice";
import { FakeSTT, FakeTTS } from "./fake-providers";
import { makeProviders } from "./providers";

// Providers change by configuration only (#326, D-163, D-238): the same worker builds the fakes, LiveKit Inference, or
// AssemblyAI and Inworld directly, from the environment. The real plugins are only constructed here (no network, no account): whether they work is
// checked once the accounts exist (docs/maya-voice.md).

initializeLogger({ pretty: false, level: "silent" });

const build = async (env: Record<string, string>) => {
  const config = voiceProviders({ MAYA_VOICE_PRIVACY_CONFIRMED: "assemblyai-optout,inworld-retention,livekit-inference-zdr,child-use-approved", ...env });
  if (!config.ok) throw new Error(config.problems.join("; "));
  return { config, providers: await makeProviders(config) };
};

describe("the worker's providers", () => {
  it("are the fakes with nothing set", async () => {
    const { providers } = await build({});
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
    const { providers, config } = await build({ MAYA_STT: "assemblyai", ASSEMBLYAI_API_KEY: "test-key", MAYA_STT_MODEL: "universal-streaming-english" });
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

  it("send the silence limits and the call's keyterms to AssemblyAI through Inference, and change the limit during the call", async () => {
    const lk = { MAYA_STT: "inference", LIVEKIT_API_KEY: "test-key", LIVEKIT_API_SECRET: "test-secret" };
    const config = voiceProviders({ MAYA_VOICE_PRIVACY_CONFIRMED: "livekit-inference-zdr,child-use-approved", ...lk });
    if (!config.ok) throw new Error(config.problems.join("; "));
    const keyterms = callKeyterms(SAMPLE_PACKAGES["add-27-39"]);
    const providers = await makeProviders(config, { keyterms });
    // The options as the SDK holds them for the connection: `settings.extra` of the session.create message (inference/stt.js).
    const options = () => (providers.stt as unknown as { opts: { modelOptions: Record<string, unknown>; language: string } }).opts;
    expect(options().language).toBe("en");
    expect(options().modelOptions).toEqual({ min_turn_silence: 512, max_turn_silence: 3000, keyterms_prompt: keyterms });
    expect(providers.patience).not.toBeNull();
    providers.patience!.setMaxSilenceMs(4500);
    expect(options().modelOptions).toMatchObject({ min_turn_silence: 512, max_turn_silence: 4500, keyterms_prompt: keyterms });
    providers.patience!.setMaxSilenceMs(3000);
    expect(options().modelOptions).toMatchObject({ max_turn_silence: 3000 });
    await providers.stt.close();

    // The settings and no keyterms when the call's question is not known; the configuration's own numbers.
    const set = voiceProviders({ MAYA_VOICE_PRIVACY_CONFIRMED: "livekit-inference-zdr,child-use-approved", MAYA_STT_MIN_SILENCE_MS: "256", MAYA_STT_MAX_SILENCE_MS: "2500", ...lk });
    if (!set.ok) throw new Error(set.problems.join("; "));
    const other = await makeProviders(set);
    expect((other.stt as unknown as { opts: { modelOptions: unknown } }).opts.modelOptions).toEqual({ min_turn_silence: 256, max_turn_silence: 2500 });
    await other.stt.close();

    // Deepgram Flux has no such limit: only its keyterms go, and there is no live silence limit to change.
    const flux = voiceProviders({ MAYA_VOICE_PRIVACY_CONFIRMED: "livekit-inference-zdr,child-use-approved", MAYA_STT_MODEL: "deepgram/flux-general-en", ...lk });
    if (!flux.ok) throw new Error(flux.problems.join("; "));
    const fluxed = await makeProviders(flux, { keyterms });
    expect((fluxed.stt as unknown as { opts: { modelOptions: unknown } }).opts.modelOptions).toEqual({ keyterm: keyterms });
    expect(fluxed.patience).toBeNull();
    await fluxed.stt.close();
  });

  it("build the direct AssemblyAI plugin with the silence limits, the keyterms and a live limit", async () => {
    const config = voiceProviders({ MAYA_VOICE_PRIVACY_CONFIRMED: "assemblyai-optout,child-use-approved", MAYA_STT: "assemblyai", ASSEMBLYAI_API_KEY: "test-key" });
    if (!config.ok) throw new Error(config.problems.join("; "));
    const providers = await makeProviders(config, { keyterms: ["sixty-six", "fifty-six"] });
    // The plugin keeps its options private: the constructor accepted them (it refuses a Universal-3 Pro-only option on
    // other models), and the live update is accepted too.
    expect(providers.stt.model).toBe("universal-3-6-pro");
    expect(providers.patience).not.toBeNull();
    expect(() => providers.patience!.setMaxSilenceMs(4500)).not.toThrow();
    await providers.stt.close();
    // A model with no Universal-3 Pro options still builds: no language codes are sent to it.
    const streaming = voiceProviders({ MAYA_VOICE_PRIVACY_CONFIRMED: "assemblyai-optout,child-use-approved", MAYA_STT: "assemblyai", ASSEMBLYAI_API_KEY: "test-key", MAYA_STT_MODEL: "universal-streaming-english" });
    if (!streaming.ok) throw new Error(streaming.problems.join("; "));
    const old = await makeProviders(streaming, { keyterms: ["sixty-six"] });
    expect(old.stt.model).toBe("universal-streaming-english");
    await old.stt.close();
  });

  it("have no live silence limit with the fakes", async () => {
    const { providers } = await build({});
    expect(providers.patience).toBeNull();
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
