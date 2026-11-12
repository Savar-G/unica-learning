import { describe, expect, it } from "vitest";
import { createSession, PAUSES, TIME_LIMITS } from "@/lib/maya";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import {
  asksForNumber,
  ATTR,
  callKeyterms,
  CONFUSABLE_NUMBER_WORDS,
  endsInOpenNumber,
  GREETING_ID,
  GREETING_TEXT,
  MATH_KEYTERMS,
  MAX_KEYTERM_CHARS,
  MAX_KEYTERMS,
  VOICE_TUNING_DEFAULTS,
  voiceTuning,
  turnSilences,
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
  it("runs on the fakes with nothing set", () => {
    const p = voiceProviders({});
    expect(p).toMatchObject({ ok: true, speechToText: { provider: "fake" }, voice: { provider: "fake" }, ids: { speechToText: "fake", voice: "fake" } });
  });

  it("chooses AssemblyAI and Inworld by configuration, and stores ids without keys", () => {
    const p = voiceProviders({ MAYA_VOICE_PRIVACY_CONFIRMED: "assemblyai-optout,inworld-retention,child-use-approved", MAYA_STT: "assemblyai", ASSEMBLYAI_API_KEY: "aai-secret", MAYA_TTS: "inworld", INWORLD_API_KEY: "iw-secret", MAYA_VOICE: "Maya-warm" });
    expect(p).toMatchObject({
      ok: true,
      speechToText: { provider: "assemblyai", model: "universal-3-6-pro", apiKey: "aai-secret" },
      voice: { provider: "inworld", model: "inworld-tts-2", voice: "Maya-warm", apiKey: "iw-secret" },
      ids: { speechToText: "assemblyai/universal-3-6-pro", voice: "inworld/inworld-tts-2/Maya-warm" },
    });
    const other = voiceProviders({ MAYA_VOICE_PRIVACY_CONFIRMED: "assemblyai-optout,inworld-retention,child-use-approved", MAYA_STT: "assemblyai", MAYA_STT_MODEL: "universal-streaming-english", ASSEMBLYAI_API_KEY: "k", MAYA_TTS: "inworld", MAYA_TTS_MODEL: "inworld-tts-2-flash", INWORLD_API_KEY: "k", MAYA_VOICE: "Ashley" });
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
  const INFERENCE_OK = "livekit-inference-zdr,child-use-approved";

  it("routes speech-to-text and the voice through LiveKit Inference by configuration, with the LiveKit key", () => {
    // D-338: with no model and no voice, Cartesia Sonic 3.6 with Katie's voice.
    expect(voiceProviders({ ...LK, MAYA_STT: "inference", MAYA_TTS: "inference", MAYA_VOICE_PRIVACY_CONFIRMED: INFERENCE_OK })).toMatchObject({
      ok: true, voice: { provider: "inference", model: "cartesia/sonic-3.6", voice: "f786b574-daa5-4673-aa0c-cbe3e8534c02", modelOptions: { add_timestamps: true } },
    });
    expect(voiceProviders({ ...LK, MAYA_STT: "inference", MAYA_TTS: "inference", MAYA_TTS_MODEL: "inworld/inworld-tts-2", MAYA_VOICE_PRIVACY_CONFIRMED: INFERENCE_OK })).toMatchObject({ ok: false, problems: ["MAYA_TTS is inference, but MAYA_VOICE (the voice id) is not set"] });
    const p = voiceProviders({ ...LK, MAYA_STT: "inference", MAYA_TTS: "inference", MAYA_TTS_MODEL: "inworld/inworld-tts-2", MAYA_VOICE: "Ashley", MAYA_VOICE_PRIVACY_CONFIRMED: INFERENCE_OK });
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
    const ALL = "assemblyai-optout,inworld-retention,livekit-inference-zdr,child-use-approved";
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
    // The default model has a default voice (D-338); another model still needs its own.
    refused({ ...LK, MAYA_TTS: "inference", MAYA_TTS_MODEL: "inworld/inworld-tts-2" }, /MAYA_VOICE/);
  });

  it("refuses a real route without its privacy markers, child-use-approved included, and an unknown marker", () => {
    const env = { ...LK, MAYA_STT: "inference", MAYA_TTS: "inference", MAYA_VOICE: "Ashley" };
    expect(voiceProviders(env)).toMatchObject({ ok: false, problems: ["MAYA_VOICE_PRIVACY_CONFIRMED must include livekit-inference-zdr", "MAYA_VOICE_PRIVACY_CONFIRMED must include child-use-approved"] });
    expect(voiceProviders({ ...env, MAYA_VOICE_PRIVACY_CONFIRMED: "livekit-inference-zdr" })).toMatchObject({ ok: false, problems: ["MAYA_VOICE_PRIVACY_CONFIRMED must include child-use-approved"] });
    expect(voiceProviders({ ...env, MAYA_VOICE_PRIVACY_CONFIRMED: "livekit-inference-zdr,child-use-aproved" })).toMatchObject({ ok: false, problems: expect.arrayContaining(['MAYA_VOICE_PRIVACY_CONFIRMED has an unknown marker "child-use-aproved"', "MAYA_VOICE_PRIVACY_CONFIRMED must include child-use-approved"]) });
    // The fakes need no marker.
    expect(voiceProviders({})).toMatchObject({ ok: true });
    expect(requiredMarkers("fake", "fake")).toEqual([]);
    expect(requiredMarkers("inference", "fake")).toEqual(["livekit-inference-zdr", "child-use-approved"]);
  });

  it("refuses an Inference model off the allow list and a voice id that could change the model string", () => {
    const env = { ...LK, MAYA_VOICE_PRIVACY_CONFIRMED: INFERENCE_OK };
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


it("R408-4: refuses direct providers until privacy and child-use settings are confirmed", () => {
  const env = { MAYA_STT: "assemblyai", ASSEMBLYAI_API_KEY: "fake-key", MAYA_TTS: "inworld", INWORLD_API_KEY: "fake-key", MAYA_VOICE: "Ashley" };
  expect(voiceProviders(env).ok).toBe(false);
  expect(voiceProviders({ ...env, MAYA_VOICE_PRIVACY_CONFIRMED: "assemblyai-optout,inworld-retention" }).ok).toBe(false);
  expect(voiceProviders({ ...env, MAYA_VOICE_PRIVACY_CONFIRMED: "assemblyai-optout,inworld-retention,child-use-approved" }).ok).toBe(true);
});

it("R408-11: bounds a crashed worker's connection lease and starts a separate segment", () => {
  expect(connectedSeconds([
    { kind: "agent_joined", at: 0 }, { kind: "child_joined", at: 0 },
    { kind: "agent_left", at: 70_000 }, { kind: "agent_joined", at: 70_000 },
    { kind: "child_joined", at: 70_000 }, { kind: "child_left", at: 80_000 },
  ], 80_000)).toBeLessThanOrEqual(25);
});

// ---------- tuning for children (docs/maya-voice.md, "Tuning for children") ----------

describe("the tuning settings", () => {
  it("default to the documented values, and the providers carry them", () => {
    expect(VOICE_TUNING_DEFAULTS).toEqual({ sttMinSilenceMs: 400, sttMaxSilenceMs: 1600, sttNumberMinSilenceMs: 512, sttNumberSilenceMs: 4500, turnMinDelayMs: 100, numberContinueMs: 1500, interruptMinMs: 300, interruptMinWords: 0 });
    expect(voiceTuning({})).toEqual({ tuning: VOICE_TUNING_DEFAULTS, problems: [] });
    expect(voiceProviders({})).toMatchObject({ ok: true, tuning: VOICE_TUNING_DEFAULTS });
  });

  it("are read from their variables, an empty one keeping its default", () => {
    const env = { MAYA_STT_MIN_SILENCE_MS: "256", MAYA_STT_MAX_SILENCE_MS: "3500", MAYA_STT_NUMBER_MIN_SILENCE_MS: "800", MAYA_STT_NUMBER_SILENCE_MS: "5000", MAYA_TURN_MIN_DELAY_MS: "0", MAYA_NUMBER_CONTINUE_MS: "", MAYA_INTERRUPT_MIN_MS: "400", MAYA_INTERRUPT_MIN_WORDS: "1" };
    expect(voiceTuning(env)).toEqual({
      tuning: { sttMinSilenceMs: 256, sttMaxSilenceMs: 3500, sttNumberMinSilenceMs: 800, sttNumberSilenceMs: 5000, turnMinDelayMs: 0, numberContinueMs: 1500, interruptMinMs: 400, interruptMinWords: 1 },
      problems: [],
    });
    expect(voiceProviders(env)).toMatchObject({ ok: true, tuning: { sttMaxSilenceMs: 3500 } });
  });

  it("refuse a value outside its bounds, or not a whole number, instead of using a default", () => {
    for (const [name, bad] of [["MAYA_STT_MIN_SILENCE_MS", "2001"], ["MAYA_STT_NUMBER_MIN_SILENCE_MS", "2001"], ["MAYA_STT_MAX_SILENCE_MS", "99"], ["MAYA_STT_MAX_SILENCE_MS", "10001"], ["MAYA_STT_NUMBER_SILENCE_MS", "-1"], ["MAYA_TURN_MIN_DELAY_MS", "1.5"], ["MAYA_NUMBER_CONTINUE_MS", "3001"], ["MAYA_INTERRUPT_MIN_MS", "fast"], ["MAYA_INTERRUPT_MIN_WORDS", "6"]]) {
      const r = voiceProviders({ [name]: bad });
      expect(r, `${name}=${bad}`).toMatchObject({ ok: false, problems: [expect.stringContaining(name)] });
    }
  });

  it("refuse limits that contradict each other", () => {
    expect(voiceTuning({ MAYA_STT_MIN_SILENCE_MS: "1000", MAYA_STT_MAX_SILENCE_MS: "500" }).problems).toEqual(["MAYA_STT_MAX_SILENCE_MS must not be less than MAYA_STT_MIN_SILENCE_MS"]);
    expect(voiceTuning({ MAYA_STT_MAX_SILENCE_MS: "6000" }).problems).toEqual(["MAYA_STT_NUMBER_SILENCE_MS must not be less than MAYA_STT_MAX_SILENCE_MS"]);
    expect(voiceTuning({ MAYA_STT_NUMBER_MIN_SILENCE_MS: "1800", MAYA_STT_MAX_SILENCE_MS: "1600", MAYA_STT_NUMBER_SILENCE_MS: "1700" }).problems).toEqual(["MAYA_STT_NUMBER_SILENCE_MS must not be less than MAYA_STT_NUMBER_MIN_SILENCE_MS"]);
  });
});

describe("the silences of a turn", () => {
  it("are short for a normal turn and long for the one turn after a number question", () => {
    expect(turnSilences(VOICE_TUNING_DEFAULTS)).toEqual({ normal: { minMs: 400, maxMs: 1600 }, number: { minMs: 512, maxMs: 4500 } });
  });

  it("never make the number turn shorter than a normal turn", () => {
    const { tuning } = voiceTuning({ MAYA_STT_MIN_SILENCE_MS: "700", MAYA_STT_NUMBER_MIN_SILENCE_MS: "300" });
    expect(turnSilences(tuning)).toEqual({ normal: { minMs: 700, maxMs: 1600 }, number: { minMs: 700, maxMs: 4500 } });
  });
});

describe("a number question raises the limits for one turn only", () => {
  it("asks for a number only in a computing state, with a number question or a request to compute", () => {
    expect(asksForNumber("Try 27 + 39 the same way.", "TRY_TARGET")).toBe(true);
    expect(asksForNumber("Good. What is 7 + 9?", "GUIDE_TARGET")).toBe(true);
    // Not in a computing state, or not a number question: the normal limits stay.
    expect(asksForNumber("What is 7 + 9?", "CLOSE")).toBe(false);
    expect(asksForNumber("Shall we get going?", "TRY_TARGET")).toBe(false);
    expect(asksForNumber("That's right, well done.", "CHECK")).toBe(false);
  });
});

describe("keyterms for a call", () => {
  const add = SAMPLE_PACKAGES["add-27-39"];
  const lower = (terms: string[]) => terms.map((t) => t.toLowerCase());

  it("hold the right answer and the likely wrong answers together, as digits and as words", () => {
    const terms = callKeyterms(add);
    // The answer 66, the stored wrong answer 56, and the operands 27 and 39: digits and words, none favoured.
    for (const t of ["66", "sixty-six", "56", "fifty-six", "27", "twenty-seven", "39", "thirty-nine"]) expect(terms, t).toContain(t);
    // Near answers (plus and minus 1 and 10); the answer's digits reversed (66 reads the same, so none is added).
    for (const t of ["67", "65", "76", "sixty-seven", "sixty-five", "seventy-six"]) expect(terms, t).toContain(t);
    // The stored wrong answer comes before the near answers, so a full list drops the near answers first.
    expect(terms.indexOf("56")).toBeLessThan(terms.indexOf("67"));
  });

  it("reverse a number's digits, and read a subtraction's own wrong answers", () => {
    const terms = callKeyterms(SAMPLE_PACKAGES["subtract-83-46"]);
    // 83 - 46 = 37; wrong answers 43 and 47; reversed digits 73.
    for (const t of ["37", "thirty-seven", "43", "forty-three", "47", "forty-seven", "73", "seventy-three", "83", "46"]) expect(terms, t).toContain(t);
  });

  it("hold the confusable number words and the math words, whatever the question", () => {
    for (const terms of [callKeyterms(add), callKeyterms(null)]) {
      for (const w of [...CONFUSABLE_NUMBER_WORDS, ...MATH_KEYTERMS]) expect(terms, w).toContain(w);
    }
    expect([...CONFUSABLE_NUMBER_WORDS]).toEqual(expect.arrayContaining(["thirteen", "nineteen", "thirty", "ninety"]));
    expect(callKeyterms(null)).toEqual([...CONFUSABLE_NUMBER_WORDS, ...MATH_KEYTERMS]);
  });

  it("read the parts of a fraction answer and its wrong answers", () => {
    const terms = callKeyterms(SAMPLE_PACKAGES["add-fractions-3-4-1-8"]);
    // 7/8 is the answer, 4/12 the wrong answer: every number in them, and the operands' 3, 4, 1 and 8.
    for (const t of ["seven", "eight", "four", "twelve", "three", "one", "12"]) expect(terms, t).toContain(t);
  });

  it("keep to 100 terms of 50 characters, with no duplicate, and keep the fixed words when the question has too many terms", () => {
    const many = { ...add, wrongAnswers: Array.from({ length: 80 }, (_, i) => ({ value: { type: "number" as const, value: 1000 + i * 37 }, cause: "x", description: "x", step: null })) };
    const terms = callKeyterms(many);
    expect(terms.length).toBe(MAX_KEYTERMS);
    for (const t of terms) expect(t.length).toBeLessThanOrEqual(MAX_KEYTERM_CHARS);
    expect(new Set(lower(terms)).size).toBe(terms.length);
    for (const w of [...CONFUSABLE_NUMBER_WORDS, ...MATH_KEYTERMS]) expect(terms, w).toContain(w);
    expect(terms).toContain("66");
  });

  it("hold no name, and none of the question's text", () => {
    const named = { ...add, text: "Leah has 27 apples and gets 39 more. How many now? Leah" };
    const terms = callKeyterms(named);
    expect(terms.join(" ").toLowerCase()).not.toContain("leah");
    expect(terms.join(" ")).not.toContain("apples");
  });
});

describe("a number that may go on", () => {
  it("is a tens word, a hundred or an 'and' at the end of the transcript", () => {
    for (const t of ["fifty", "I think it's fifty.", "twenty-", "one hundred", "one hundred and", "70", "It's 50,", "Sixty!"]) expect(endsInOpenNumber(t), t).toBe(true);
  });

  it("is not a whole number, a teen or a word that only contains one", () => {
    for (const t of ["fifty six", "66", "sixteen", "I got fifty six.", "fifteen", "ninety nine", "it is forty-two", "120", "", "twentyish"]) expect(endsInOpenNumber(t), t).toBe(false);
  });
});

describe("Maya asks for a number", () => {
  it("in a state where she asks for a computed answer, with a question or a request to compute", () => {
    expect(asksForNumber("Now put it all together. What is 27 + 39?", "TRY_TARGET")).toBe(true);
    expect(asksForNumber("Add the ones: 7 + 9. What do you get?", "GUIDE_TARGET")).toBe(true);
    expect(asksForNumber("How many tens are there?", "ASSESS")).toBe(true);
    expect(asksForNumber("Can you add 7 + 9?", "GUIDE_TARGET")).toBe(true);
    expect(asksForNumber("Over to you! Try 27 + 39 the same way.", "TRY_TARGET")).toBe(true);
    expect(asksForNumber("Now multiply 3 × 4.", "MODEL_EXAMPLE")).toBe(true);
  });

  it("not for a question with a yes or no, in a state where she asks for none, or with no request", () => {
    expect(asksForNumber("Shall we get going?", "OPEN")).toBe(false);
    expect(asksForNumber("What do you get?", "OPEN")).toBe(false);
    expect(asksForNumber("Did you say 13 or 30?", "CONFIRM_HEARD")).toBe(false);
    expect(asksForNumber("Is that right?", "TRY_TARGET")).toBe(false);
    expect(asksForNumber("Are you still there?", "TRY_TARGET")).toBe(false);
    expect(asksForNumber("Nice work. That is 66.", "CHECK")).toBe(false);
    expect(asksForNumber("", "TRY_TARGET")).toBe(false);
  });
});

describe("the greeting", () => {
  it("is the exact fixed line, with an id of its own", () => {
    expect(GREETING_TEXT).toBe("I can make mistakes, so tell me if something sounds wrong.");
    expect(GREETING_ID).toBe("greeting.hello");
    expect(GREETING_TEXT).not.toContain(String.fromCharCode(0x2014));
  });
});
