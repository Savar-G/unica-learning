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
  it("runs on the fakes with nothing set", () => {
    const p = voiceProviders({});
    expect(p).toMatchObject({ ok: true, speechToText: { provider: "fake" }, voice: { provider: "fake" }, ids: { speechToText: "fake", voice: "fake" } });
  });

  it("chooses AssemblyAI and Inworld by configuration, and stores ids without keys", () => {
    const p = voiceProviders({ MAYA_STT: "assemblyai", ASSEMBLYAI_API_KEY: "aai-secret", MAYA_TTS: "inworld", INWORLD_API_KEY: "iw-secret", MAYA_VOICE: "Maya-warm" });
    expect(p).toMatchObject({
      ok: true,
      speechToText: { provider: "assemblyai", model: "universal-3-6-pro", apiKey: "aai-secret" },
      voice: { provider: "inworld", model: "inworld-tts-2", voice: "Maya-warm", apiKey: "iw-secret" },
      ids: { speechToText: "assemblyai/universal-3-6-pro", voice: "inworld/inworld-tts-2/Maya-warm" },
    });
    const other = voiceProviders({ MAYA_STT: "assemblyai", MAYA_STT_MODEL: "universal-streaming-english", ASSEMBLYAI_API_KEY: "k", MAYA_TTS: "inworld", MAYA_TTS_MODEL: "inworld-tts-2-flash", INWORLD_API_KEY: "k", MAYA_VOICE: "Ashley" });
    expect(other.ok && other.ids).toEqual({ speechToText: "assemblyai/universal-streaming-english", voice: "inworld/inworld-tts-2-flash/Ashley" });
    if (p.ok) expect(JSON.stringify(p.ids)).not.toMatch(/secret/);
  });

  it("refuses a real provider without its key or voice, and an unknown provider, never falling back to a fake", () => {
    expect(voiceProviders({ MAYA_STT: "assemblyai" })).toEqual({ ok: false, problems: ["MAYA_STT is assemblyai, but ASSEMBLYAI_API_KEY is not set"] });
    const tts = voiceProviders({ MAYA_TTS: "inworld", INWORLD_API_KEY: "k" });
    expect(tts.ok).toBe(false);
    expect(!tts.ok && tts.problems.join(" ")).toMatch(/MAYA_VOICE/);
    expect(voiceProviders({ MAYA_STT: "deepgram", MAYA_TTS: "eleven" })).toMatchObject({ ok: false, problems: [expect.stringMatching(/MAYA_STT/), expect.stringMatching(/MAYA_TTS/)] });
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
  const ev = (kind: ConnectionEvent["kind"], s: number): ConnectionEvent => ({ kind, at: at(s) });

  it("counts only the time the child and Maya were both in the room", () => {
    expect(connectedSeconds([ev("agent_joined", 0), ev("child_joined", 5), ev("child_left", 65), ev("agent_left", 70)], at(70))).toBe(60);
    // Maya joins after the child.
    expect(connectedSeconds([ev("child_joined", 0), ev("agent_joined", 10), ev("child_left", 40)], at(50))).toBe(30);
  });

  it("counts a reconnect once, without the gap, and runs to the end for anyone still there", () => {
    const events = [ev("agent_joined", 0), ev("child_joined", 0), ev("child_left", 100), ev("child_joined", 130), ev("child_joined", 140)];
    expect(connectedSeconds(events, at(200))).toBe(170);
    expect(connectedSeconds([...events].reverse(), at(200))).toBe(170);
  });

  it("ignores a leave with no join, and events after the end", () => {
    expect(connectedSeconds([ev("child_left", 1), ev("agent_joined", 0), ev("child_joined", 10), ev("child_left", 900)], at(60))).toBe(50);
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
