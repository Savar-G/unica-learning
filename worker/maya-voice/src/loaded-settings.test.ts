import { initializeLogger } from "@livekit/agents";
import { afterEach, describe, expect, it, vi } from "vitest";
import { turnSilences, voiceProviders } from "@/lib/maya-voice";
import { voiceSession } from "./agent";
import { LOADED_SETTINGS_PREFIX, loadedSettings, logLoadedSettings, readLoadedSettings, reportedSettingsProblems, settingsProblems } from "./loaded-settings";
import { makeProviders } from "./providers";

// #1146: the worker reports the speech settings it actually loaded, read back from the built speech-to-text, voice and
// LiveKit session (not from the configuration that asked for them), and names each one that differs from the request.
// The objects are only constructed here: no network, no account.

initializeLogger({ pretty: false, level: "silent" });
afterEach(() => { vi.restoreAllMocks(); });

const PRIVACY = { MAYA_VOICE_PRIVACY_CONFIRMED: "assemblyai-optout,inworld-retention,livekit-inference-zdr,child-use-approved" };
const INFERENCE = { MAYA_STT: "inference", MAYA_TTS: "inference", LIVEKIT_API_KEY: "test-key", LIVEKIT_API_SECRET: "test-secret" };
/** The staging recommendation from the 2026-11-20 comparison round (docs/maya-voice-endpointing.md). */
const STAGING = {
  MAYA_STT_MODEL: "assemblyai/assemblyai-stt-3-7-realtime-agent", MAYA_STT_VOICE_FOCUS: "near-field",
  MAYA_TURN_MIN_DELAY_MS: "0", MAYA_STT_MAX_SILENCE_MS: "1400", MAYA_STT_NUMBER_SILENCE_MS: "1400",
};

const build = async (env: Record<string, string>) => {
  const config = voiceProviders({ ...PRIVACY, ...env });
  if (!config.ok) throw new Error(config.problems.join("; "));
  const made = await makeProviders(config, { keyterms: ["sixteen", "sixty"] });
  const session = voiceSession(made, made.fake ? {} : { turn: config.tuning });
  return { config, made, session };
};

describe("the settings a worker loaded", () => {
  it("reads the staging settings back from the built providers and session, with no key in them", async () => {
    const { config, made, session } = await build({ ...INFERENCE, ...STAGING });
    const loaded = loadedSettings(session, made);
    expect(loaded).toMatchObject({
      stt: { model: "assemblyai/assemblyai-stt-3-7-realtime-agent", minTurnSilenceMs: 400, maxTurnSilenceMs: 1400, voiceFocus: "near-field", keyterms: 2 },
      tts: { model: "cartesia/sonic-3.6", voice: "f786b574-daa5-4673-aa0c-cbe3e8534c02" },
      turn: { detection: "stt", minDelayMs: 0, interruption: { minDuration: config.tuning.interruptMinMs, minWords: 0 } },
    });
    expect(settingsProblems(loaded, config)).toEqual([]);
    expect(JSON.stringify(loaded)).not.toMatch(/test-key|test-secret/);
    await made.stt.close();
    await made.tts.close();
  });

  it("reads the production defaults when nothing is set", async () => {
    const { config, made, session } = await build(INFERENCE);
    const loaded = loadedSettings(session, made);
    expect(loaded).toMatchObject({
      stt: { model: "assemblyai/universal-3-6-pro", minTurnSilenceMs: 400, maxTurnSilenceMs: 1600, voiceFocus: null },
      turn: { minDelayMs: 100 },
    });
    expect(settingsProblems(loaded, config)).toEqual([]);
    await made.stt.close();
    await made.tts.close();
  });

  it("names a setting the built speech-to-text holds that differs from the request", async () => {
    const { config, made, session } = await build({ ...INFERENCE, ...STAGING });
    made.patience!.setSilence({ minMs: 400, maxMs: 2500 });
    expect(settingsProblems(loadedSettings(session, made), config)).toEqual(["speech-to-text max_turn_silence is 2500, not 1400"]);
    await made.stt.close();
    await made.tts.close();
  });

  it("checks the reported settings against the runner's number-turn settings", async () => {
    const { config, made, session } = await build({ ...INFERENCE, ...STAGING, MAYA_STT_NUMBER_SILENCE_MS: "2500" });
    const expected = voiceProviders({ ...PRIVACY, ...INFERENCE, ...STAGING });
    if (!expected.ok) throw new Error(expected.problems.join("; "));
    expect(reportedSettingsProblems(undefined, expected)).toEqual(["the worker reported no loaded settings"]);
    expect(reportedSettingsProblems(readLoadedSettings("call", session, made, config), expected)).toEqual([]);
    made.patience!.setSilence(turnSilences(config.tuning).number);
    const number = readLoadedSettings("call", session, made, config, "number");
    expect(number.problems).toEqual([]);
    expect(reportedSettingsProblems(number, expected, "number")).toEqual(["speech-to-text max_turn_silence is 2500, not 1400"]);
    session.updateOptions({ turnHandling: { turnDetection: "manual" } });
    expect(reportedSettingsProblems(readLoadedSettings("call", session, made, config, "number"), config, "number"))
      .toEqual(["turn detection is manual, not stt"]);
    await made.stt.close();
    await made.tts.close();
  });

  it("logs one line a harness can read at the call's start, and a warning for each difference", async () => {
    const { config, made, session } = await build({ ...INFERENCE, ...STAGING });
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    logLoadedSettings("call-1", session, made, config);
    made.patience!.setSilence({ minMs: 400, maxMs: 2500 });
    logLoadedSettings("call-2", session, made, config);
    const lines = info.mock.calls.map(([line]) => String(line)).filter(l => l.startsWith(LOADED_SETTINGS_PREFIX));
    expect(lines.map(l => JSON.parse(l.slice(LOADED_SETTINGS_PREFIX.length)))).toMatchObject([
      { callId: "call-1", stt: { maxTurnSilenceMs: 1400 }, problems: [] },
      { callId: "call-2", stt: { maxTurnSilenceMs: 2500 }, problems: ["speech-to-text max_turn_silence is 2500, not 1400"] },
    ]);
    expect(warn).toHaveBeenCalledTimes(1);
    await made.stt.close();
    await made.tts.close();
  });

  it("never stops a call when the settings cannot be read: it reports that instead", async () => {
    const { config, made } = await build({});
    vi.spyOn(console, "info").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const report = logLoadedSettings("call-3", {} as never, made, config);
    expect(report).toMatchObject({ callId: "call-3", problems: [expect.stringMatching(/^the loaded settings could not be read/)] });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("does not expose read exceptions or stop the call if either log sink throws", async () => {
    const { config, made, session } = await build({});
    vi.spyOn(console, "info").mockImplementation(() => { throw new Error("info unavailable"); });
    vi.spyOn(console, "warn").mockImplementation(() => { throw new Error("warn unavailable"); });
    expect(logLoadedSettings("call-4", session, made, config).problems).toEqual([]);
    const unreadable = { get sessionOptions() { throw new Error("private provider detail"); } } as never;
    expect(logLoadedSettings("call-4", unreadable, made, config).problems).toEqual(["the loaded settings could not be read"]);
  });

  it("reports the fakes, which take no tuning", async () => {
    const { config, made, session } = await build({});
    const loaded = loadedSettings(session, made);
    expect(loaded.stt).toMatchObject({ model: "fake", maxTurnSilenceMs: null });
    expect(settingsProblems(loaded, config)).toEqual([]);
  });
});
