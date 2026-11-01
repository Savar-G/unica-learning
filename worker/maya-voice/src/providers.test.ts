import { initializeLogger } from "@livekit/agents";
import { describe, expect, it } from "vitest";
import { voiceProviders } from "@/lib/maya-voice";
import { FakeSTT, FakeTTS } from "./fake-providers";
import { makeProviders } from "./providers";

// Providers change by configuration only (#326, D-163): the same worker builds the fakes or AssemblyAI and Inworld
// from the environment. The real plugins are only constructed here (no network, no account): whether they work is
// checked once the accounts exist (docs/maya-voice.md).

initializeLogger({ pretty: false, level: "silent" });

const build = async (env: Record<string, string>) => {
  const config = voiceProviders(env);
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
});
