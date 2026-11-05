import { describe, expect, it } from "vitest";
import { createSession, PAUSES, TIME_LIMITS } from "@/lib/maya";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import {
  ATTR,
  callOfRoom,
  checkJoiner,
  childIdentity,
  childTurnFrom,
  connectedSeconds,
  livekitProject,
  nextTickAt,
  asksWordTimings,
  INFERENCE_TTS_MODELS,
  requiredMarkers,
  voiceProviders,
  voiceRoom,
  type ConnectionEvent,
} from "@/lib/maya-voice";

// The rules of Maya's voice calls (#326) shared by the web server and the voice worker, through their public functions.

const CALL = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_CALL = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PARENT = "11111111-1111-4111-8111-111111111111";
const CHILD = "22222222-2222-4222-8222-222222222222";
const OTHER_PARENT = "44444444-4444-4444-8444-444444444444";
const OTHER_CHILD = "55555555-5555-4555-8555-555555555555";

describe("providers by configuration", () => {
  it("D-284: sends speech-to-text and the voice through LiveKit Inference when neither is set", () => {
    const p = voiceProviders({ LIVEKIT_API_KEY: "lk-key", LIVEKIT_API_SECRET: "lk-secret", MAYA_VOICE: "Ashley", MAYA_VOICE_PRIVACY_CONFIRMED: "livekit-inference-zdr" });
    expect(p).toMatchObject({ ok: true, speechToText: { provider: "inference" }, voice: { provider: "inference" }, ids: { speechToText: "inference/assemblyai/universal-3-6-pro", voice: "inference/inworld/inworld-tts-2/Ashley" } });
    // With nothing set, it asks for the LiveKit key and the voice: never a quiet fake, never a direct plugin.
    const bare = voiceProviders({});
    expect(bare.ok).toBe(false);
    expect(!bare.ok && bare.problems.join("; ")).toMatch(/MAYA_STT is inference, but LIVEKIT_API_KEY/);
    expect(!bare.ok && bare.problems.join("; ")).not.toMatch(/assemblyai|inworld/i);
  });

  it("runs on the fakes only when both are set to fake", () => {
    const p = voiceProviders({ MAYA_STT: "fake", MAYA_TTS: "fake" });
    expect(p).toMatchObject({ ok: true, speechToText: { provider: "fake" }, voice: { provider: "fake" }, ids: { speechToText: "fake", voice: "fake" } });
  });

  it("chooses AssemblyAI and Inworld by configuration, and stores ids without keys", () => {
    const p = voiceProviders({ MAYA_VOICE_PRIVACY_CONFIRMED: "assemblyai-optout,inworld-retention", MAYA_STT: "assemblyai", ASSEMBLYAI_API_KEY: "aai-secret", MAYA_TTS: "inworld", INWORLD_API_KEY: "iw-secret", MAYA_VOICE: "Maya-warm" });
    expect(p).toMatchObject({
      ok: true,
      speechToText: { provider: "assemblyai", model: "universal-3-6-pro", apiKey: "aai-secret" },
      voice: { provider: "inworld", model: "inworld-tts-2", voice: "Maya-warm", apiKey: "iw-secret" },
      ids: { speechToText: "assemblyai/universal-3-6-pro", voice: "inworld/inworld-tts-2/Maya-warm" },
    });
    const other = voiceProviders({ MAYA_VOICE_PRIVACY_CONFIRMED: "assemblyai-optout,inworld-retention", MAYA_STT: "assemblyai", MAYA_STT_MODEL: "universal-streaming-english", ASSEMBLYAI_API_KEY: "k", MAYA_TTS: "inworld", MAYA_TTS_MODEL: "inworld-tts-2-flash", INWORLD_API_KEY: "k", MAYA_VOICE: "Ashley" });
    expect(other.ok && other.ids).toEqual({ speechToText: "assemblyai/universal-streaming-english", voice: "inworld/inworld-tts-2-flash/Ashley" });
    if (p.ok) expect(JSON.stringify(p.ids)).not.toMatch(/secret/);
  });

  it("refuses a real provider without its key or voice, and an unknown provider, never falling back to a fake", () => {
    expect(voiceProviders({ MAYA_STT: "assemblyai" })).toMatchObject({ ok: false, problems: expect.arrayContaining(["MAYA_STT is assemblyai, but ASSEMBLYAI_API_KEY is not set"]) });
    const tts = voiceProviders({ MAYA_TTS: "inworld", INWORLD_API_KEY: "k" });
    expect(tts.ok).toBe(false);
    expect(!tts.ok && tts.problems.join(" ")).toMatch(/MAYA_VOICE/);
    expect(voiceProviders({ MAYA_STT: "deepgram", MAYA_TTS: "eleven" })).toMatchObject({ ok: false, problems: [expect.stringMatching(/MAYA_STT/), expect.stringMatching(/MAYA_TTS/)] });
  });

  const LK = { LIVEKIT_API_KEY: "lk-key", LIVEKIT_API_SECRET: "lk-secret" };
  const INFERENCE_OK = "livekit-inference-zdr";

  it("routes speech-to-text and the voice through LiveKit Inference by configuration, with the LiveKit key", () => {
    const p = voiceProviders({ ...LK, MAYA_STT: "inference", MAYA_TTS: "inference", MAYA_VOICE: "Ashley", MAYA_VOICE_PRIVACY_CONFIRMED: INFERENCE_OK });
    expect(p).toMatchObject({
      ok: true,
      speechToText: { provider: "inference", model: "assemblyai/universal-3-6-pro", apiKey: "lk-key", apiSecret: "lk-secret" },
      voice: { provider: "inference", model: "inworld/inworld-tts-2", voice: "Ashley", modelOptions: { timestamp_type: "WORD" } },
      ids: { speechToText: "inference/assemblyai/universal-3-6-pro", voice: "inference/inworld/inworld-tts-2/Ashley" },
    });
    if (p.ok) {
      expect(JSON.stringify(p.ids)).not.toMatch(/lk-/);
      expect(asksWordTimings(p.voice)).toBe(true);
    }
    const cartesia = voiceProviders({ ...LK, MAYA_TTS: "inference", MAYA_TTS_MODEL: "cartesia/sonic-3.6", MAYA_VOICE: "a0e99841-438c-4a64-b679-ae501e7d6091", MAYA_STT: "inference", MAYA_STT_MODEL: "deepgram/flux-general-en", MAYA_VOICE_PRIVACY_CONFIRMED: INFERENCE_OK });
    expect(cartesia).toMatchObject({ ok: true, voice: { modelOptions: { add_timestamps: true } }, ids: { speechToText: "inference/deepgram/flux-general-en", voice: "inference/cartesia/sonic-3.6/a0e99841-438c-4a64-b679-ae501e7d6091" } });
    // Every voice on the allow list asks for word timings.
    for (const options of Object.values(INFERENCE_TTS_MODELS)) expect(Object.keys(options).length).toBeGreaterThan(0);
  });

  it("mixes routes: Inference speech-to-text with the direct Inworld voice needs both routes' markers", () => {
    const env = { ...LK, MAYA_STT: "inference", MAYA_TTS: "inworld", INWORLD_API_KEY: "iw", MAYA_VOICE: "Ashley" };
    expect(voiceProviders({ ...env, MAYA_VOICE_PRIVACY_CONFIRMED: INFERENCE_OK })).toMatchObject({ ok: false, problems: ["MAYA_VOICE_PRIVACY_CONFIRMED must include inworld-retention"] });
    expect(voiceProviders({ ...env, MAYA_VOICE_PRIVACY_CONFIRMED: `${INFERENCE_OK},inworld-retention` })).toMatchObject({ ok: true, ids: { speechToText: "inference/assemblyai/universal-3-6-pro", voice: "inworld/inworld-tts-2/Ashley" } });
  });

  it("refuses every real route without its key, even with all its privacy markers", () => {
    const ALL = "assemblyai-optout,inworld-retention,livekit-inference-zdr";
    const refused = (env: Record<string, string>, problem: RegExp) => {
      const p = voiceProviders({ MAYA_VOICE_PRIVACY_CONFIRMED: ALL, ...env });
      expect(p.ok).toBe(false);
      expect(!p.ok && p.problems.join("; ")).toMatch(problem);
    };
    refused({ MAYA_STT: "assemblyai" }, /ASSEMBLYAI_API_KEY is not set/);
    refused({ MAYA_TTS: "inworld", MAYA_VOICE: "Ashley" }, /INWORLD_API_KEY is not set/);
    refused({ MAYA_STT: "inference" }, /LIVEKIT_API_KEY and LIVEKIT_API_SECRET/);
    refused({ MAYA_STT: "inference", LIVEKIT_API_KEY: "k" }, /LIVEKIT_API_KEY and LIVEKIT_API_SECRET/);
    refused({ MAYA_TTS: "inference", MAYA_VOICE: "Ashley", LIVEKIT_API_SECRET: "s" }, /LIVEKIT_API_KEY and LIVEKIT_API_SECRET/);
    refused({ ...LK, MAYA_TTS: "inference" }, /MAYA_VOICE/);
  });

  it("refuses a real route without its privacy markers, and an unknown marker", () => {
    const env = { ...LK, MAYA_STT: "inference", MAYA_TTS: "inference", MAYA_VOICE: "Ashley" };
    expect(voiceProviders(env)).toMatchObject({ ok: false, problems: ["MAYA_VOICE_PRIVACY_CONFIRMED must include livekit-inference-zdr"] });
    expect(voiceProviders({ ...env, MAYA_VOICE_PRIVACY_CONFIRMED: "livekit-inference-zdr,inference-zdr" })).toMatchObject({ ok: false, problems: ['MAYA_VOICE_PRIVACY_CONFIRMED has an unknown marker "inference-zdr"'] });
    // The fakes need no marker.
    expect(voiceProviders({ MAYA_STT: "fake", MAYA_TTS: "fake" })).toMatchObject({ ok: true });
    expect(requiredMarkers("fake", "fake")).toEqual([]);
    expect(requiredMarkers("inference", "fake")).toEqual(["livekit-inference-zdr"]);
  });

  it("D-282: needs no child-use confirmation for a real route, and still accepts the old marker in the list", () => {
    const env = { ...LK, MAYA_STT: "inference", MAYA_TTS: "inference", MAYA_VOICE: "Ashley" };
    expect(voiceProviders({ ...env, MAYA_VOICE_PRIVACY_CONFIRMED: "livekit-inference-zdr" })).toMatchObject({ ok: true });
    expect(voiceProviders({ ...env, MAYA_VOICE_PRIVACY_CONFIRMED: "livekit-inference-zdr,child-use-approved" })).toMatchObject({ ok: true });
    for (const stt of ["fake", "inference", "assemblyai"] as const) for (const tts of ["fake", "inference", "inworld"] as const) expect(requiredMarkers(stt, tts)).not.toContain("child-use-approved");
  });

  it("refuses an Inference model off the allow list and a voice id that could change the model string", () => {
    const env = { ...LK, MAYA_VOICE_PRIVACY_CONFIRMED: INFERENCE_OK, MAYA_STT: "fake", MAYA_TTS: "fake" };
    expect(voiceProviders({ ...env, MAYA_STT: "inference", MAYA_STT_MODEL: "universal-3-6-pro" })).toMatchObject({ ok: false, problems: [expect.stringMatching(/MAYA_STT_MODEL "universal-3-6-pro" is not one of/)] });
    expect(voiceProviders({ ...env, MAYA_TTS: "inference", MAYA_VOICE: "Ashley", MAYA_TTS_MODEL: "elevenlabs/eleven_v4_turbo" })).toMatchObject({ ok: false, problems: [expect.stringMatching(/MAYA_TTS_MODEL "elevenlabs\/eleven_v4_turbo" is not one of/)] });
    expect(voiceProviders({ ...env, MAYA_TTS: "inference", MAYA_TTS_MODEL: "deepgram/aura-2", MAYA_VOICE: "x" })).toMatchObject({ ok: false });
    expect(voiceProviders({ ...env, MAYA_TTS: "inference", MAYA_VOICE: "Ashley:other" })).toMatchObject({ ok: false, problems: [expect.stringMatching(/MAYA_VOICE must be a voice id/)] });
  });

  it("knows the LiveKit project only with its URL, key and secret", () => {
    expect(livekitProject({})).toBeNull();
    expect(livekitProject({ LIVEKIT_URL: "wss://x.livekit.cloud", LIVEKIT_API_KEY: "k" })).toBeNull();
    expect(livekitProject({ LIVEKIT_URL: "https://x", LIVEKIT_API_KEY: "k", LIVEKIT_API_SECRET: "s" })).toBeNull();
    expect(livekitProject({ LIVEKIT_URL: "wss://x.livekit.cloud", LIVEKIT_API_KEY: "k", LIVEKIT_API_SECRET: "s" })).toEqual({ url: "wss://x.livekit.cloud", apiKey: "k", apiSecret: "s" });
  });
});

describe("rooms and joiners", () => {
  const call = { id: CALL, parentId: PARENT, childId: CHILD, mode: "voice" as const, status: "live" as const };
  const attrs = { [ATTR.call]: CALL, [ATTR.parent]: PARENT, [ATTR.child]: CHILD };

  it("names one room per call, and reads the call back only from such a name", () => {
    expect(callOfRoom(voiceRoom(CALL))).toBe(CALL);
    expect(callOfRoom(`maya-call-${CALL}-x`)).toBeNull();
    expect(callOfRoom("lobby")).toBeNull();
  });

  it("lets the worker listen only to the call's own child, in the call's room", () => {
    expect(checkJoiner({ room: voiceRoom(CALL), call, identity: childIdentity(CHILD), attributes: attrs })).toEqual({ ok: true });
    expect(checkJoiner({ room: voiceRoom(OTHER_CALL), call, identity: childIdentity(CHILD), attributes: attrs })).toEqual({ ok: false, reason: "wrong_room" });
    expect(checkJoiner({ room: voiceRoom(CALL), call, identity: childIdentity(OTHER_CHILD), attributes: { ...attrs, [ATTR.child]: OTHER_CHILD } })).toEqual({ ok: false, reason: "wrong_child" });
    expect(checkJoiner({ room: voiceRoom(CALL), call, identity: childIdentity(CHILD), attributes: { ...attrs, [ATTR.parent]: OTHER_PARENT } })).toEqual({ ok: false, reason: "wrong_family" });
    expect(checkJoiner({ room: voiceRoom(CALL), call, identity: childIdentity(CHILD), attributes: { ...attrs, [ATTR.call]: OTHER_CALL } })).toEqual({ ok: false, reason: "wrong_family" });
    expect(checkJoiner({ room: voiceRoom(CALL), call: { ...call, status: "ended" }, identity: childIdentity(CHILD), attributes: attrs })).toEqual({ ok: false, reason: "ended" });
    expect(checkJoiner({ room: voiceRoom(CALL), call: { ...call, mode: "text" }, identity: childIdentity(CHILD), attributes: attrs })).toEqual({ ok: false, reason: "not_voice" });
  });
});

describe("what the child said", () => {
  it("joins the final transcripts of a turn and marks it uncertain below the confidence bar, with the alternatives", () => {
    expect(childTurnFrom([[{ text: "I got", confidence: 0.95 }], [{ text: "66.", confidence: 0.9 }]])).toEqual({ text: "I got 66.", uncertain: false, alternatives: [] });
    expect(childTurnFrom([[{ text: "fourteen", confidence: 0.4 }, { text: "forty" }, { text: "fourteen" }]])).toEqual({ text: "fourteen", uncertain: true, alternatives: ["forty", "fourteen"] });
    expect(childTurnFrom([[{ text: "six" }]])).toEqual({ text: "six", uncertain: false, alternatives: [] });
    expect(childTurnFrom([[{ text: "  " }], []])).toBeNull();
  });
});

describe("connected time", () => {
  const T = Date.UTC(2026, 10, 1, 16);
  const at = (s: number) => T + s * 1000;
  const renew = (end: number) => Array.from({ length: Math.floor(end / 5) }, (_, i) => ({ kind: "agent_joined" as const, at: at((i + 1) * 5) }));
  const ev = (kind: ConnectionEvent["kind"], s: number): ConnectionEvent => ({ kind, at: at(s) });

  it("counts only the time the child and Maya were both in the room", () => {
    expect(connectedSeconds([...renew(65), ev("agent_joined", 0), ev("child_joined", 5), ev("child_left", 65), ev("agent_left", 70)], at(70))).toBe(60);
    // Maya joins after the child.
    expect(connectedSeconds([...renew(40).filter(e => e.at >= at(10)), ev("child_joined", 0), ev("agent_joined", 10), ev("child_left", 40)], at(50))).toBe(30);
  });

  it("counts a reconnect once, without the gap, and runs to the end for anyone still there", () => {
    const events = [...renew(200), ev("agent_joined", 0), ev("child_joined", 0), ev("child_left", 100), ev("child_joined", 130), ev("child_joined", 140)];
    expect(connectedSeconds(events, at(200))).toBe(170);
    expect(connectedSeconds([...events].reverse(), at(200))).toBe(170);
  });

  it("ignores a leave with no join, and events after the end", () => {
    expect(connectedSeconds([...renew(60), ev("child_left", 1), ev("agent_joined", 0), ev("child_joined", 10), ev("child_left", 900)], at(60))).toBe(50);
    expect(connectedSeconds([], at(60))).toBe(0);
  });
});

describe("ticks", () => {
  const T = Date.UTC(2026, 10, 1, 16);
  const base = (over: Partial<ReturnType<typeof createSession>> = {}) => ({
    ...createSession({ callId: "tick", package: SAMPLE_PACKAGES["add-27-39"] }),
    startedAt: T,
    ...over,
  });

  it("asks for no tick before the call starts or after it ends", () => {
    expect(nextTickAt({ ...base(), startedAt: null }, { speechEndedAt: null, lastTickAt: null })).toBeNull();
    expect(nextTickAt({ ...base(), outcome: {} as never }, { speechEndedAt: null, lastTickAt: null })).toBeNull();
  });

  it("checks in after the child's silence, counted from the end of Maya's speech", () => {
    const waiting = base({ expect: "child", waitingSince: T + 10_000, silence: "none", state: "ASSESS" });
    expect(nextTickAt(waiting, { speechEndedAt: null, lastTickAt: null })).toBe(T + 10_000 + PAUSES.thinkCheckMs);
    expect(nextTickAt(waiting, { speechEndedAt: T + 18_000, lastTickAt: null })).toBe(T + 18_000 + PAUSES.thinkCheckMs);
    expect(nextTickAt({ ...waiting, state: "WAIT_WRITE" }, { speechEndedAt: null, lastTickAt: null })).toBe(T + 10_000 + PAUSES.writeCheckMs);
    expect(nextTickAt({ ...waiting, silence: "checked" }, { speechEndedAt: null, lastTickAt: null })).toBe(T + 10_000 + PAUSES.noResponseMs);
  });

  it("closes at 9 minutes and ends at 10, each once", () => {
    const talking = base({ expect: "maya", waitingSince: null });
    expect(nextTickAt(talking, { speechEndedAt: null, lastTickAt: null })).toBe(T + TIME_LIMITS.closingAtMs);
    expect(nextTickAt(talking, { speechEndedAt: null, lastTickAt: T + TIME_LIMITS.closingAtMs })).toBe(T + TIME_LIMITS.endAtMs);
    expect(nextTickAt(talking, { speechEndedAt: null, lastTickAt: T + TIME_LIMITS.endAtMs })).toBeNull();
  });
});


it("R408-4: refuses direct providers until their privacy settings are confirmed", () => {
  const env = { MAYA_STT: "assemblyai", ASSEMBLYAI_API_KEY: "fake-key", MAYA_TTS: "inworld", INWORLD_API_KEY: "fake-key", MAYA_VOICE: "Ashley" };
  expect(voiceProviders(env).ok).toBe(false);
  expect(voiceProviders({ ...env, MAYA_VOICE_PRIVACY_CONFIRMED: "assemblyai-optout" }).ok).toBe(false);
  expect(voiceProviders({ ...env, MAYA_VOICE_PRIVACY_CONFIRMED: "assemblyai-optout,inworld-retention" }).ok).toBe(true);
});

it("R408-11: bounds a crashed worker's connection lease and starts a separate segment", () => {
  expect(connectedSeconds([
    { kind: "agent_joined", at: 0 }, { kind: "child_joined", at: 0 },
    { kind: "agent_left", at: 70_000 }, { kind: "agent_joined", at: 70_000 },
    { kind: "child_joined", at: 70_000 }, { kind: "child_left", at: 80_000 },
  ], 80_000)).toBeLessThanOrEqual(25);
});
