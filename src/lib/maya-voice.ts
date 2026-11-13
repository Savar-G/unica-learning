// Maya's voice calls (#326, spec #297): the rules a voice call shares between the web server (which starts a call and
// mints its LiveKit token) and the voice worker (worker/maya-voice, which joins the call's room and runs Maya there).
// Pure: no network, no clock, no LiveKit packages.
//
// - Providers by configuration only (D-163, D-238): speech-to-text, the voice and the model each come from environment
//   variables. `fake` speech-to-text and voice need no account (local runs and tests). `inference` routes them through
//   LiveKit Inference with the LiveKit project's own key (D-238's preferred route); `assemblyai` and `inworld` are the
//   direct LiveKit plugins, kept as options. The model is Maya's model through OpenRouter (`AI_MODEL`), or the fake rule
//   player when the worker has no OPENROUTER_API_KEY (src/lib/maya-call-seams.ts).
// - One call, one room: the room's name holds the call id, and a token admits one participant, the child, to that room
//   only (src/lib/maya-voice-token.ts). The worker checks the joiner again against the call before it listens.
// - Connected time: the worker records when the child and Maya join and leave; the call's connected seconds are the
//   time both were in the room, counted on the server's clock.
// - When the worker gives the session a tick (`nextTickAt`): only when the session can act on it (the pause policy or
//   the time limits), never while Maya is still speaking.
import { limitsOf, PAUSES, TIME_LIMITS, type Session } from "@/lib/maya";
import type { AnswerValue, QuestionPackage } from "@/lib/question-package";

/** The worker's agent name: LiveKit sends a job to this worker only when the token's room asks for it. */
export const VOICE_AGENT_NAME = "maya-voice";
/** How long a token admits its holder to the room (seconds). A connected call goes on past it. */
export const VOICE_TOKEN_TTL_SECONDS = 5 * 60;
/** How long the worker waits for the child to come back after the connection drops (ms). */
export const RECONNECT_GRACE_MS = 30_000;
/** The maximum worker connection lease, including a crash gap (ms). */
export const CONNECTION_LEASE_MS = 15_000;
export const CONNECTION_RENEW_MS = 5_000;
/** How long the worker waits for the child to join a new room before it gives up (ms). */
export const JOIN_WAIT_MS = 2 * 60_000;
/**
 * How long the worker waits for the microphone of a child who is in the room without one (ms): the ticket's life. The
 * child's screen joins before the Connect tap and publishes the microphone at the tap (docs/maya-voice.md).
 */
export const MIC_WAIT_MS = VOICE_TOKEN_TTL_SECONDS * 1000;
/** A transcript the speech-to-text is less sure of than this is uncertain: Maya confirms a number in it. */
export const UNSURE_CONFIDENCE = 0.6;
/** A started voice call cannot still be running after this long (ms): the admin may end it by hand. */
export const VOICE_CALL_STALE_MS = TIME_LIMITS.endAtMs + 60_000;

// ---------- rooms and participants ----------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const voiceRoom = (callId: string) => `maya-call-${callId}`;
export const childIdentity = (childId: string) => `child-${childId}`;

/** The call id of a voice room's name, or null for any other name. */
export function callOfRoom(room: string): string | null {
  const m = /^maya-call-(.+)$/.exec(room);
  return m && UUID.test(m[1]) ? m[1] : null;
}

/** The attributes a token gives the child's participant. The participant cannot change them (no metadata grant). */
export const ATTR = { call: "maya.call", parent: "maya.parent", child: "maya.child" } as const;

/** The token's grant: join this one room, send the microphone and data, receive Maya. Nothing else. */
export function childGrant(callId: string) {
  return {
    room: voiceRoom(callId),
    roomJoin: true,
    roomCreate: false,
    roomList: false,
    roomRecord: false,
    roomAdmin: false,
    ingressAdmin: false,
    canPublish: true,
    canPublishSources: ["microphone"] as const,
    canSubscribe: true,
    canPublishData: true,
    canUpdateOwnMetadata: false,
    hidden: false,
    recorder: false,
    agent: false,
  };
}

/** What the child's screen gets to join a call: the LiveKit URL, the token, the room and who it admits. */
export interface VoiceTicket {
  url: string;
  token: string;
  room: string;
  identity: string;
  /** When the token stops admitting a new join (ISO). */
  expiresAt: string;
}

/** What the worker knows of a call when a participant joins. */
export interface VoiceCallFacts {
  id: string;
  parentId: string;
  childId: string;
  mode: "text" | "voice";
  status: "live" | "ended";
}

/**
 * Whether the worker may listen to this participant for this call: the room is the call's, and the participant is the
 * call's child with the call's family on the attributes its token gave it. Any other joiner is ignored.
 */
export function checkJoiner(input: { room: string; call: VoiceCallFacts; identity: string; attributes: Readonly<Record<string, string>> }):
  | { ok: true }
  | { ok: false; reason: "wrong_room" | "not_voice" | "ended" | "wrong_child" | "wrong_family" } {
  const { call } = input;
  if (callOfRoom(input.room) !== call.id) return { ok: false, reason: "wrong_room" };
  if (call.mode !== "voice") return { ok: false, reason: "not_voice" };
  if (call.status !== "live") return { ok: false, reason: "ended" };
  if (input.identity !== childIdentity(call.childId) || input.attributes[ATTR.child] !== call.childId) return { ok: false, reason: "wrong_child" };
  if (input.attributes[ATTR.parent] !== call.parentId || input.attributes[ATTR.call] !== call.id) return { ok: false, reason: "wrong_family" };
  return { ok: true };
}

/** Where the call's child is for Maya's worker: not this call's child, in the room with no microphone yet, or here. */
export type ChildPresence = "other" | "joined" | "here";

/**
 * The call's child is here when the joiner fits the call (`checkJoiner`) and has a microphone track published. A child
 * in the room with no microphone is "joined": the screen joins before the Connect tap and publishes the microphone at
 * the tap, so nothing of the call starts until then. `microphone` is the SDK's value for the microphone source.
 */
export function childPresence(input: Parameters<typeof checkJoiner>[0] & { tracks: Iterable<{ source?: unknown }>; microphone: unknown }): ChildPresence {
  if (!checkJoiner(input).ok) return "other";
  for (const t of input.tracks) if (t.source === input.microphone) return "here";
  return "joined";
}

// ---------- providers by configuration ----------

export type SpeechToTextConfig =
  | { provider: "fake" }
  | { provider: "assemblyai"; model: string; apiKey: string }
  | { provider: "inference"; model: InferenceSttModel; apiKey: string; apiSecret: string };
export type VoiceConfig =
  | { provider: "fake" }
  | { provider: "inworld"; model: string; voice: string; apiKey: string }
  | { provider: "inference"; model: InferenceTtsModel; voice: string; apiKey: string; apiSecret: string; modelOptions: Readonly<Record<string, string | boolean>> };

export const STT_DEFAULT_MODEL = "universal-3-6-pro";
export const TTS_DEFAULT_MODEL = "inworld-tts-2";

/**
 * The speech-to-text models the worker may use through LiveKit Inference: an allow list, so a typo or a model nobody
 * checked is refused, never passed on. Each is listed on https://docs.livekit.io/agents/models/inference/ (read
 * 2026-11-04) and in the `inference.STT` model types of LiveKit Agents for Node 1.9.5.
 */
export const INFERENCE_STT_MODELS = ["assemblyai/universal-3-6-pro", "assemblyai/universal-3-5-pro", "assemblyai/universal-streaming", "deepgram/flux-general-en"] as const;
export type InferenceSttModel = (typeof INFERENCE_STT_MODELS)[number];
export const INFERENCE_STT_DEFAULT: InferenceSttModel = "assemblyai/universal-3-6-pro";

/**
 * The voices the worker may use through LiveKit Inference, each with the option that asks for word timings (the board
 * draws in time with them, #329). The options are what LiveKit Agents for Node 1.9.5 checks before it reads the
 * gateway's `output_alignment` events (`hasAlignedTranscript` in its inference/tts.js): Cartesia `add_timestamps`,
 * Inworld `timestamp_type: "WORD"`. The Inference page does not mention word timings, so whether the gateway sends them
 * is not verified until a real call or the listening-test kit runs with a key (docs/maya-voice.md). A sentence without
 * word times still gets its board batches at the sentence's audio end (worker/maya-voice/src/speech-audio.ts).
 * Only models whose word timings the Node SDK reads are listed. ElevenLabs is not on LiveKit Inference.
 */
export const INFERENCE_TTS_MODELS = {
  "inworld/inworld-tts-2": { timestamp_type: "WORD" },
  "cartesia/sonic-3.6": { add_timestamps: true },
} as const satisfies Record<string, Readonly<Record<string, string | boolean>>>;
export type InferenceTtsModel = keyof typeof INFERENCE_TTS_MODELS;
/** Maya's voice, D-338: Savar chose "Voice 12" from a 12-voice blind set on 2026-11-12, Cartesia Sonic 3.6 "Katie". */
export const INFERENCE_TTS_DEFAULT: InferenceTtsModel = "cartesia/sonic-3.6";
/** Katie's Cartesia voice id: the voice when `MAYA_VOICE` is not set and the model is the default. */
export const INFERENCE_VOICE_DEFAULT = "f786b574-daa5-4673-aa0c-cbe3e8534c02";

/**
 * The operator's confirmations in MAYA_VOICE_PRIVACY_CONFIRMED (docs/maya-voice.md, "Privacy gate"). Each records a check
 * a person made outside the code; none can be verified by it.
 */
export const PRIVACY_MARKERS = ["assemblyai-optout", "inworld-retention", "livekit-inference-zdr", "child-use-approved"] as const;
export type PrivacyMarker = (typeof PRIVACY_MARKERS)[number];

/** The markers a configuration needs: one per route that receives data, and child-use-approved for any real provider. */
export function requiredMarkers(stt: SpeechToTextConfig["provider"], tts: VoiceConfig["provider"]): PrivacyMarker[] {
  const out: PrivacyMarker[] = [];
  if (stt === "assemblyai") out.push("assemblyai-optout");
  if (tts === "inworld") out.push("inworld-retention");
  if (stt === "inference" || tts === "inference") out.push("livekit-inference-zdr");
  if (stt !== "fake" || tts !== "fake") out.push("child-use-approved");
  return out;
}

// ---------- turn timing and interruption (docs/maya-voice.md, "Tuning for children") ----------

/**
 * The speech-to-text silence limits and the turn and interruption settings of a voice call. Each comes from one
 * environment variable, with its own bounds, and a value outside them is a problem, never a silent default.
 */
export interface VoiceTuning {
  /** AssemblyAI `min_turn_silence` (ms): silence before the model first checks whether the turn is over. */
  sttMinSilenceMs: number;
  /** AssemblyAI `max_turn_silence` (ms): silence after which the turn ends whatever the model thinks. */
  sttMaxSilenceMs: number;
  /** `min_turn_silence` while Maya waits for the child to say a number (ms): a pause after "fifty" must not end the turn. */
  sttNumberMinSilenceMs: number;
  /** `max_turn_silence` while Maya waits for the child to say a number (ms). */
  sttNumberSilenceMs: number;
  /** LiveKit endpointing `minDelay` (ms): added after the speech-to-text end of turn. */
  turnMinDelayMs: number;
  /** How long the worker waits once more when a transcript ends in a number word that can go on (ms); 0 is off. */
  numberContinueMs: number;
  /** LiveKit interruption `minDuration` (ms): speech this long stops Maya. */
  interruptMinMs: number;
  /** LiveKit interruption `minWords`: words the speech-to-text must have heard before speech stops Maya; 0 is none. */
  interruptMinWords: number;
  /**
   * A final transcript is dropped (never a child turn) only when the local voice activity detector heard no speech at
   * all since the previous final AND the input's peak stayed below this level (dBFS): words "heard" in digital silence
   * (a phantom "Yes!" on a silent microphone). Null: the rule is off. A quiet real answer has detector speech or a
   * louder peak, and is kept.
   */
  dropSilentPeakDbfs: number | null;
}

/**
 * The defaults. Each is a starting point to confirm with children's calls, not a measured result. The normal turn
 * (docs/maya-voice.md, "Tuning for children"): AssemblyAI ends a turn that reads complete at `min_turn_silence`, and holds
 * a turn that reads unfinished, or ends in a number that can go on, until `max_turn_silence`. 400 ms is between its
 * "balanced" 128 ms, which can cut a child's pause in a sentence, and "max_accuracy" 512 ms. 1600 ms is just above
 * "balanced" 1280 ms and near the 1.64 s AssemblyAI measured for its slowest tenth of held turns. A number answer keeps
 * the long limits (512 ms and 4500 ms), because a child thinks between "fifty" and "six".
 */
export const VOICE_TUNING_DEFAULTS: VoiceTuning = {
  sttMinSilenceMs: 400,
  sttMaxSilenceMs: 1600,
  sttNumberMinSilenceMs: 512,
  sttNumberSilenceMs: 4500,
  turnMinDelayMs: 100,
  numberContinueMs: 1500,
  interruptMinMs: 300,
  interruptMinWords: 0,
  // Real speech in two real calls peaked at -2.7 and -2.9 dBFS (mean level -26 and -29.3): -50 is far below any voice.
  dropSilentPeakDbfs: -50,
};

/** Each setting: its variable, the field it sets, and its bounds (both inclusive). */
const TUNING_SETTINGS = [
  { env: "MAYA_STT_MIN_SILENCE_MS", field: "sttMinSilenceMs", min: 0, max: 2000 },
  { env: "MAYA_STT_MAX_SILENCE_MS", field: "sttMaxSilenceMs", min: 100, max: 10_000 },
  { env: "MAYA_STT_NUMBER_MIN_SILENCE_MS", field: "sttNumberMinSilenceMs", min: 0, max: 2000 },
  { env: "MAYA_STT_NUMBER_SILENCE_MS", field: "sttNumberSilenceMs", min: 100, max: 10_000 },
  { env: "MAYA_TURN_MIN_DELAY_MS", field: "turnMinDelayMs", min: 0, max: 2000 },
  { env: "MAYA_NUMBER_CONTINUE_MS", field: "numberContinueMs", min: 0, max: 3000 },
  { env: "MAYA_INTERRUPT_MIN_MS", field: "interruptMinMs", min: 0, max: 2000 },
  { env: "MAYA_INTERRUPT_MIN_WORDS", field: "interruptMinWords", min: 0, max: 5 },
] as const satisfies readonly { env: string; field: Exclude<keyof VoiceTuning, "dropSilentPeakDbfs">; min: number; max: number }[];

/** AssemblyAI's two end-of-turn silences (ms): `min_turn_silence` and `max_turn_silence`. */
export interface TurnSilence {
  minMs: number;
  maxMs: number;
}

/**
 * The silences of a normal child turn, and of the one turn after Maya asks for a number (`asksForNumber`). The number
 * turn is never shorter than a normal turn, also when the normal minimum is set above the number minimum.
 */
export function turnSilences(tuning: VoiceTuning): { normal: TurnSilence; number: TurnSilence } {
  const normal = { minMs: tuning.sttMinSilenceMs, maxMs: tuning.sttMaxSilenceMs };
  const minMs = Math.max(normal.minMs, tuning.sttNumberMinSilenceMs);
  return { normal, number: { minMs, maxMs: Math.max(tuning.sttNumberSilenceMs, minMs) } };
}

/** The tuning from the worker's environment, or the problems with it. An unset or empty variable keeps its default. */
export function voiceTuning(env: Readonly<Record<string, string | undefined>>): { tuning: VoiceTuning; problems: string[] } {
  const tuning: VoiceTuning = { ...VOICE_TUNING_DEFAULTS };
  const problems: string[] = [];
  for (const { env: name, field, min, max } of TUNING_SETTINGS) {
    const raw = value(env, name);
    if (!raw) continue;
    const n = Number(raw);
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(n) || n < min || n > max) problems.push(`${name} must be a whole number from ${min} to ${max}, not "${raw}"`);
    else tuning[field] = n;
  }
  // `off` turns the silent-transcript rule off; else a level from -120 to 0 dBFS.
  const drop = value(env, "MAYA_DROP_SILENT_PEAK_DBFS");
  if (drop === "off") tuning.dropSilentPeakDbfs = null;
  else if (drop) {
    const n = Number(drop);
    if (!/^-?\d+(?:\.\d+)?$/.test(drop) || n < -120 || n > 0) problems.push(`MAYA_DROP_SILENT_PEAK_DBFS must be "off" or a level from -120 to 0 (dBFS), not "${drop}"`);
    else tuning.dropSilentPeakDbfs = n;
  }
  if (!problems.length) {
    if (tuning.sttMaxSilenceMs < tuning.sttMinSilenceMs) problems.push("MAYA_STT_MAX_SILENCE_MS must not be less than MAYA_STT_MIN_SILENCE_MS");
    if (tuning.sttNumberSilenceMs < tuning.sttMaxSilenceMs) problems.push("MAYA_STT_NUMBER_SILENCE_MS must not be less than MAYA_STT_MAX_SILENCE_MS");
    if (tuning.sttNumberSilenceMs < tuning.sttNumberMinSilenceMs) problems.push("MAYA_STT_NUMBER_SILENCE_MS must not be less than MAYA_STT_NUMBER_MIN_SILENCE_MS");
  }
  return { tuning, problems };
}

export type ProvidersResult =
  | { ok: true; speechToText: SpeechToTextConfig; voice: VoiceConfig; tuning: VoiceTuning; ids: { speechToText: string; voice: string } }
  | { ok: false; problems: string[] };

const value = (env: Readonly<Record<string, string | undefined>>, name: string) => env[name]?.trim() || "";
/** A voice id as a provider names it (Inworld "Ashley", a Cartesia UUID): no colon, slash or space, which the model string uses. */
const VOICE_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/;
const has = <T extends string>(list: readonly T[], v: string): v is T => (list as readonly string[]).includes(v);

/**
 * The speech-to-text and the voice from the worker's environment.
 *
 * `MAYA_STT`: `fake` (default); `inference` (LiveKit Inference with `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET`, model
 * `MAYA_STT_MODEL` from INFERENCE_STT_MODELS, default assemblyai/universal-3-6-pro); or `assemblyai` (the direct plugin,
 * `ASSEMBLYAI_API_KEY`, model `MAYA_STT_MODEL`, default universal-3-6-pro).
 *
 * `MAYA_TTS`: `fake` (default); `inference` (the LiveKit key, voice `MAYA_VOICE`, model `MAYA_TTS_MODEL` from
 * INFERENCE_TTS_MODELS, default cartesia/sonic-3.6 with Katie's voice, D-338); or `inworld` (the direct plugin, `INWORLD_API_KEY`, voice
 * `MAYA_VOICE`, model `MAYA_TTS_MODEL`, default inworld-tts-2).
 *
 * The tuning settings (`voiceTuning`: the silence limits, the turn delay and the interruption options) are read here too.
 *
 * A missing key or voice, a model off the allow list, an unknown privacy marker or a missing one, or a tuning value
 * outside its bounds is a problem, never a silent fallback to the fake. The ids are what the call row stores; they hold
 * no key.
 */
export function voiceProviders(env: Readonly<Record<string, string | undefined>>): ProvidersResult {
  const problems: string[] = [];
  let speechToText: SpeechToTextConfig = { provider: "fake" };
  let voice: VoiceConfig = { provider: "fake" };
  const livekit = () => {
    const apiKey = value(env, "LIVEKIT_API_KEY");
    const apiSecret = value(env, "LIVEKIT_API_SECRET");
    return { apiKey, apiSecret, missing: !apiKey || !apiSecret };
  };
  const stt = value(env, "MAYA_STT").toLowerCase() || "fake";
  if (stt === "assemblyai") {
    const apiKey = value(env, "ASSEMBLYAI_API_KEY");
    if (!apiKey) problems.push("MAYA_STT is assemblyai, but ASSEMBLYAI_API_KEY is not set");
    speechToText = { provider: "assemblyai", model: value(env, "MAYA_STT_MODEL") || STT_DEFAULT_MODEL, apiKey };
  } else if (stt === "inference") {
    const { apiKey, apiSecret, missing } = livekit();
    if (missing) problems.push("MAYA_STT is inference, but LIVEKIT_API_KEY and LIVEKIT_API_SECRET are not both set");
    const model = value(env, "MAYA_STT_MODEL") || INFERENCE_STT_DEFAULT;
    if (has(INFERENCE_STT_MODELS, model)) speechToText = { provider: "inference", model, apiKey, apiSecret };
    else problems.push(`MAYA_STT is inference, but MAYA_STT_MODEL "${model}" is not one of ${INFERENCE_STT_MODELS.join(", ")}`);
  } else if (stt !== "fake") problems.push(`MAYA_STT must be fake, inference or assemblyai, not "${stt}"`);
  const tts = value(env, "MAYA_TTS").toLowerCase() || "fake";
  if (tts === "inworld") {
    const apiKey = value(env, "INWORLD_API_KEY");
    const id = value(env, "MAYA_VOICE");
    if (!apiKey) problems.push("MAYA_TTS is inworld, but INWORLD_API_KEY is not set");
    if (!id) problems.push("MAYA_TTS is inworld, but MAYA_VOICE (the Inworld voice id) is not set");
    voice = { provider: "inworld", model: value(env, "MAYA_TTS_MODEL") || TTS_DEFAULT_MODEL, voice: id, apiKey };
  } else if (tts === "inference") {
    const { apiKey, apiSecret, missing } = livekit();
    if (missing) problems.push("MAYA_TTS is inference, but LIVEKIT_API_KEY and LIVEKIT_API_SECRET are not both set");
    const model = value(env, "MAYA_TTS_MODEL") || INFERENCE_TTS_DEFAULT;
    // The default model has a default voice (Katie, D-338); another model needs its own voice id.
    const id = value(env, "MAYA_VOICE") || (model === INFERENCE_TTS_DEFAULT ? INFERENCE_VOICE_DEFAULT : "");
    if (!id) problems.push("MAYA_TTS is inference, but MAYA_VOICE (the voice id) is not set");
    else if (!VOICE_ID.test(id)) problems.push("MAYA_VOICE must be a voice id: letters, digits, '.', '_' or '-', at most 100");
    if (has(Object.keys(INFERENCE_TTS_MODELS) as InferenceTtsModel[], model)) voice = { provider: "inference", model, voice: id, apiKey, apiSecret, modelOptions: INFERENCE_TTS_MODELS[model] };
    else problems.push(`MAYA_TTS is inference, but MAYA_TTS_MODEL "${model}" is not one of ${Object.keys(INFERENCE_TTS_MODELS).join(", ")}`);
  } else if (tts !== "fake") problems.push(`MAYA_TTS must be fake, inference or inworld, not "${tts}"`);
  const { tuning, problems: tuningProblems } = voiceTuning(env);
  problems.push(...tuningProblems);
  const listed = value(env, "MAYA_VOICE_PRIVACY_CONFIRMED").split(",").map(s => s.trim()).filter(Boolean);
  for (const m of listed) if (!has(PRIVACY_MARKERS, m)) problems.push(`MAYA_VOICE_PRIVACY_CONFIRMED has an unknown marker "${m}"`);
  const confirmed = new Set(listed);
  const sttRoute = stt === "assemblyai" || stt === "inference" ? stt : "fake";
  const ttsRoute = tts === "inworld" || tts === "inference" ? tts : "fake";
  for (const m of requiredMarkers(sttRoute, ttsRoute)) if (!confirmed.has(m)) problems.push(`MAYA_VOICE_PRIVACY_CONFIRMED must include ${m}`);
  if (problems.length) return { ok: false, problems };
  return { ok: true, speechToText, voice, tuning, ids: { speechToText: providerId(speechToText), voice: providerId(voice) } };
}

/** The stored id of a provider: what it is, never its key. Inference ids start with "inference/". */
export function providerId(p: SpeechToTextConfig | VoiceConfig): string {
  if (p.provider === "fake") return "fake";
  if (p.provider === "assemblyai") return `assemblyai/${p.model}`;
  if (p.provider === "inworld") return `inworld/${p.model}/${p.voice}`;
  return "voice" in p ? `inference/${p.model}/${p.voice}` : `inference/${p.model}`;
}

/** Whether the configured voice asks for word timings (the board then follows words, else sentence ends). */
export function asksWordTimings(v: VoiceConfig): boolean {
  return v.provider === "inworld" || (v.provider === "inference" && Object.keys(v.modelOptions).length > 0);
}

/** The LiveKit project the web server mints tokens for, or null when voice is not set up there. */
export function livekitProject(env: Readonly<Record<string, string | undefined>>): { url: string; apiKey: string; apiSecret: string } | null {
  const url = value(env, "LIVEKIT_URL");
  const apiKey = value(env, "LIVEKIT_API_KEY");
  const apiSecret = value(env, "LIVEKIT_API_SECRET");
  if (!url || !apiKey || !apiSecret || !/^wss?:\/\//.test(url)) return null;
  return { url, apiKey, apiSecret };
}

// ---------- what the child said ----------

/** One recognised alternative of a final transcript. */
export interface Heard {
  text: string;
  /** 0 to 1; a provider that gives none counts as sure. */
  confidence?: number;
}

/**
 * A child turn from the final transcripts of one turn: the words joined, uncertain when any part was below
 * UNSURE_CONFIDENCE, with the other alternatives of the unsure parts (so the session can confirm what it heard).
 */
export function childTurnFrom(finals: readonly (readonly Heard[])[]): { text: string; uncertain: boolean; alternatives: string[] } | null {
  const best = finals.map((alts) => alts[0]).filter((h): h is Heard => !!h && h.text.trim().length > 0);
  if (best.length === 0) return null;
  const unsure = finals.filter((alts) => alts[0] && alts[0].text.trim() && typeof alts[0].confidence === "number" && alts[0].confidence < UNSURE_CONFIDENCE);
  const alternatives = [...new Set(unsure.flatMap((alts) => alts.slice(1).map((h) => h.text.trim()).filter(Boolean)))].slice(0, 4);
  return { text: best.map((h) => h.text.trim()).join(" "), uncertain: unsure.length > 0, alternatives };
}

/**
 * Whether a transcript ends in a number word that can go on ("fifty", "twenty-", "one hundred", "and", or a tens number
 * written in digits: "50"), so a child who pauses between "fifty" and "six" is not cut off. The worker waits once more
 * for words when this is true (`numberContinueMs`). It reads only the end of the text, not the whole answer.
 */
export function endsInOpenNumber(text: string): boolean {
  const end = text.trim().replace(/[\s.,!?;:-]+$/, "");
  return /(?:^|[\s-])(?:twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|and|[2-9]0)$/i.test(end);
}

/** The states in which Maya's question can ask the child for a computed number (src/lib/maya/session.ts). */
const NUMBER_STATES: readonly Session["state"][] = ["ASSESS", "MODEL_EXAMPLE", "TRY_TARGET", "GUIDE_TARGET", "CHECK"];
/** A question for a number: "What is 27 + 39?", "How many tens?", "Can you add 7 + 9?". */
const NUMBER_QUESTION = /\b(?:what|how many|how much|which number|work out|can you (?:add|subtract|multiply|divide|find|do|try|solve))\b/i;
/** A request to compute, with no question mark: "Try 27 + 39 the same way.", "Now multiply 3 × 4.". */
const NUMBER_REQUEST = /\b(?:try|work out|find|solve|add|subtract|multiply|divide)\b/i;

/**
 * Whether Maya's last accepted words ask the child for a number: the session is in a state where she asks for a
 * computed answer, and her last sentence is a question that asks "what", "how many", "how much" or "which number" (or
 * asks the child to work something out), or a request to try, work out, add, subtract, multiply or divide. It is a rule
 * on her words, not a controller flag. A wrong yes only gives the child the longer limits for the next turn
 * (`sttNumberMinSilenceMs`, `sttNumberSilenceMs`); the worker puts the normal limits back when that turn arrives.
 */
export function asksForNumber(say: string, state: Session["state"]): boolean {
  if (!NUMBER_STATES.includes(state)) return false;
  const last = say.trim().split(/(?<=[.?!])\s+/).filter(Boolean).at(-1) ?? "";
  return (last.endsWith("?") ? NUMBER_QUESTION : NUMBER_REQUEST).test(last);
}

// ---------- keyterms (the words the speech-to-text is told to expect) ----------

/** AssemblyAI takes at most 100 keyterms, each at most 50 characters. */
export const MAX_KEYTERMS = 100;
export const MAX_KEYTERM_CHARS = 50;

/** The number words children confuse by sound: thirteen and thirty, fourteen and forty, and so on to nineteen and ninety. */
export const CONFUSABLE_NUMBER_WORDS = [
  "thirteen", "thirty", "fourteen", "forty", "fifteen", "fifty", "sixteen", "sixty", "seventeen", "seventy", "eighteen", "eighty", "nineteen", "ninety",
] as const;
/** A few words a child uses in math. */
export const MATH_KEYTERMS = [
  "carried", "regroup", "regrouped", "borrow", "ones", "tens", "hundreds", "plus", "minus", "times", "divided by", "equals", "remainder", "numerator", "denominator", "decimal",
] as const;

const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

/** A whole number from 0 to 9999 in words ("forty-seven", "one hundred five"), or null outside that. */
function wholeWords(n: number): string | null {
  if (!Number.isInteger(n) || n < 0 || n > 9999) return null;
  if (n < 20) return ONES[n];
  if (n < 100) return n % 10 ? `${TENS[Math.floor(n / 10)]}-${ONES[n % 10]}` : TENS[n / 10];
  if (n < 1000) return `${ONES[Math.floor(n / 100)]} hundred${n % 100 ? ` ${wholeWords(n % 100)}` : ""}`;
  return `${ONES[Math.floor(n / 1000)]} thousand${n % 1000 ? ` ${wholeWords(n % 1000)}` : ""}`;
}

/** A non-negative number as the words a child says: "0.85" is "zero point eight five". Null when code has no words for it. */
function spokenNumber(n: number): string | null {
  if (!Number.isFinite(n) || n < 0) return null;
  if (Number.isInteger(n)) return wholeWords(n);
  const [whole, decimals] = String(n).split(".");
  const head = wholeWords(Number(whole));
  if (head === null || !decimals || !/^\d{1,4}$/.test(decimals)) return null;
  return `${head} point ${[...decimals].map((d) => ONES[Number(d)]).join(" ")}`;
}

/** The numbers an answer value holds: a number or amount, the parts of a fraction, a remainder form, a time. */
function numbersOfValue(v: AnswerValue): number[] {
  switch (v.type) {
    case "number": case "quantity": return [v.value];
    case "fraction": return [v.numerator, v.denominator];
    case "mixed": return [v.whole, v.numerator, v.denominator];
    case "remainder": return [v.quotient, v.remainder];
    case "compound": return v.parts.map((p) => p.value);
    case "time": return [v.hours, v.minutes];
    default: return [];
  }
}

/** The number of an operand: a plain number, or an answer value; an expression (a string) holds none. */
const numbersOfOperand = (o: unknown): number[] =>
  typeof o === "number" ? [o] : o !== null && typeof o === "object" && "type" in o ? numbersOfValue(o as AnswerValue) : [];

/** The number written backwards: 47 is 74, 70 is 7. Null for a number with one digit, or one that reads the same. */
function reversed(n: number): number | null {
  if (!Number.isInteger(n) || n < 10) return null;
  const r = Number([...String(n)].reverse().join(""));
  return r === n ? null : r;
}

/**
 * The terms the speech-to-text is told to expect in a call, from the call's question package: the right answer AND the
 * wrong answers a child is likely to say, so no answer is favoured over another (a model told to expect only the right
 * answer can hear it in what was said). In order, each as digits and as words: the answer, the stored wrong answers, the
 * operands, the answer and its neighbours (plus or minus 1 and 10) and its digits reversed; then the number words that
 * sound alike (thirteen and thirty) and a few math words. At most MAX_KEYTERMS terms of MAX_KEYTERM_CHARS characters.
 * It reads only the package's numbers and codes, never its text, so no name can be in it. Null package: the fixed words.
 */
export function callKeyterms(pkg: QuestionPackage | null): string[] {
  const numbers: number[] = [];
  if (pkg) {
    const answers = pkg.answer ? numbersOfValue(pkg.answer.value) : [];
    numbers.push(...answers);
    for (const w of pkg.wrongAnswers) numbers.push(...numbersOfValue(w.value));
    for (const o of (pkg.operation?.operands ?? []) as unknown[]) numbers.push(...numbersOfOperand(o));
    const main = pkg.answer && (pkg.answer.value.type === "number" || pkg.answer.value.type === "quantity") ? pkg.answer.value.value : null;
    if (main !== null) {
      for (const near of [main + 1, main - 1, main + 10, main - 10]) numbers.push(near);
      const flipped = reversed(main);
      if (flipped !== null) numbers.push(flipped);
    }
  }
  const terms: string[] = [];
  const add = (term: string | null) => { if (term && term.length <= MAX_KEYTERM_CHARS) terms.push(term); };
  const fixed = CONFUSABLE_NUMBER_WORDS.length + MATH_KEYTERMS.length;
  const seenNumbers = new Set<string>();
  for (const n of numbers) {
    if (!Number.isFinite(n) || n < 0 || seenNumbers.has(String(n))) continue;
    seenNumbers.add(String(n));
    add(String(n));
    add(spokenNumber(n));
  }
  const questionTerms = [...new Set(terms.map((t) => t.toLowerCase()))].slice(0, MAX_KEYTERMS - fixed);
  const out = [...questionTerms];
  for (const w of [...CONFUSABLE_NUMBER_WORDS, ...MATH_KEYTERMS]) if (!out.includes(w)) out.push(w);
  return out.slice(0, MAX_KEYTERMS);
}

// ---------- the greeting ----------

/** The id the greeting is saved under in the call's `live.acknowledged`, so it is said once per call (docs/maya-voice.md). */
export const GREETING_ID = "greeting.hello";
/**
 * The first words of a voice call, code-written, before Maya's first teaching line: that she can be wrong. Her own
 * opening already says her name and that she is an AI, so the greeting does not say it again (Chief of Staff, 2026-11-12). The worker says it with the same speech path as other code lines. It stages no
 * board batch and is not in the call's transcript.
 */
export const GREETING_TEXT = "I can make mistakes, so tell me if something sounds wrong.";

// ---------- connected time ----------

export type ConnectionKind = "agent_joined" | "agent_left" | "child_joined" | "child_left";
export interface ConnectionEvent {
  kind: ConnectionKind;
  /** Milliseconds since 1970, from the server's clock. */
  at: number;
}

/**
 * The seconds the child and Maya were both in the room, from the connection events, up to `endAt` (the call's end) for
 * anyone still there. Worker joins renew a bounded lease. A worker leave closes that segment's child presence.
 */
export function connectedSeconds(events: readonly ConnectionEvent[], endAt: number): number {
  const sorted = [...events].filter(e => e.at <= endAt).sort((a, b) => a.at - b.at);
  let child = false;
  let agentUntil = -Infinity;
  let previous = sorted[0]?.at ?? endAt;
  let total = 0;
  for (const e of sorted) {
    if (child) total += Math.max(0, Math.min(e.at, agentUntil) - previous);
    if (e.kind === "child_joined") child = true;
    if (e.kind === "child_left") child = false;
    if (e.kind === "agent_joined") agentUntil = e.at + CONNECTION_LEASE_MS;
    if (e.kind === "agent_left") { agentUntil = -Infinity; child = false; }
    previous = e.at;
  }
  if (child) total += Math.max(0, Math.min(endAt, agentUntil) - previous);
  return Math.round(total / 1000);
}

// ---------- ticks ----------

/**
 * When the worker should next give the session a tick (ms since 1970), or null when no tick can change anything. The
 * pause policy counts the child's silence from when Maya started waiting; in a voice call, Maya may still be speaking
 * then, so the silence counts from the end of her speech (`speechEndedAt`) when that is later. The time limits come at
 * their fixed times from the start. A time at or before the last tick (`lastTickAt`) is left out: that tick covered it.
 */
export function nextTickAt(
  session: Pick<Session, "outcome" | "startedAt" | "expect" | "waitingSince" | "silence" | "state" | "limits">,
  at: { speechEndedAt: number | null; lastTickAt: number | null },
): number | null {
  if (session.outcome || session.startedAt === null) return null;
  const limits = limitsOf(session);
  const times: number[] = [session.startedAt + limits.closingAtMs, session.startedAt + limits.endAtMs];
  if (session.expect === "child" && session.waitingSince !== null) {
    const quietFrom = Math.max(session.waitingSince, at.speechEndedAt ?? 0);
    if (session.silence === "none") times.push(quietFrom + (session.state === "WAIT_WRITE" ? PAUSES.writeCheckMs : PAUSES.thinkCheckMs));
    else if (session.silence === "checked") times.push(quietFrom + PAUSES.noResponseMs);
  }
  const ahead = times.filter((t) => at.lastTickAt === null || t > at.lastTickAt);
  return ahead.length ? Math.min(...ahead) : null;
}
