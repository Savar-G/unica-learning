// Maya's voice calls (#326, spec #297): the rules a voice call shares between the web server (which starts a call and
// mints its LiveKit token) and the voice worker (worker/maya-voice, which joins the call's room and runs Maya there).
// Pure: no network, no clock, no LiveKit packages.
//
// - Providers by configuration only (D-163, D-238): speech-to-text, the voice and the model each come from environment
//   variables. `inference`, the default (D-284), routes them through LiveKit Inference with the LiveKit project's own
//   key; `fake` (no account, for local runs and tests) and `assemblyai` and `inworld` (the direct LiveKit plugins) run
//   only when a variable names them. The model is Maya's model through OpenRouter (`AI_MODEL`), or the fake rule
//   player when the worker has no OPENROUTER_API_KEY (src/lib/maya-call-seams.ts).
// - One call, one room: the room's name holds the call id, and a token admits one participant, the child, to that room
//   only (src/lib/maya-voice-token.ts). The worker checks the joiner again against the call before it listens.
// - Connected time: the worker records when the child and Maya join and leave; the call's connected seconds are the
//   time both were in the room, counted on the server's clock.
// - When the worker gives the session a tick (`nextTickAt`): only when the session can act on it (the pause policy or
//   the time limits), never while Maya is still speaking.
import { limitsOf, PAUSES, TIME_LIMITS, type Session } from "@/lib/maya";

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
export const INFERENCE_TTS_DEFAULT: InferenceTtsModel = "inworld/inworld-tts-2";

/**
 * The operator's confirmations in MAYA_VOICE_PRIVACY_CONFIRMED (docs/maya-voice.md, "Privacy gate"). Each records a check
 * a person made outside the code; none can be verified by it. `child-use-approved` is still accepted in the list, so an
 * older setting keeps working, but no route needs it: written confirmations for children's use are not being sought for
 * now (D-282).
 */
export const PRIVACY_MARKERS = ["assemblyai-optout", "inworld-retention", "livekit-inference-zdr", "child-use-approved"] as const;
export type PrivacyMarker = (typeof PRIVACY_MARKERS)[number];

/** The markers a configuration needs: one per route that receives data. */
export function requiredMarkers(stt: SpeechToTextConfig["provider"], tts: VoiceConfig["provider"]): PrivacyMarker[] {
  const out: PrivacyMarker[] = [];
  if (stt === "assemblyai") out.push("assemblyai-optout");
  if (tts === "inworld") out.push("inworld-retention");
  if (stt === "inference" || tts === "inference") out.push("livekit-inference-zdr");
  return out;
}

export type ProvidersResult =
  | { ok: true; speechToText: SpeechToTextConfig; voice: VoiceConfig; ids: { speechToText: string; voice: string } }
  | { ok: false; problems: string[] };

const value = (env: Readonly<Record<string, string | undefined>>, name: string) => env[name]?.trim() || "";
/** A voice id as a provider names it (Inworld "Ashley", a Cartesia UUID): no colon, slash or space, which the model string uses. */
const VOICE_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/;
const has = <T extends string>(list: readonly T[], v: string): v is T => (list as readonly string[]).includes(v);

/**
 * The speech-to-text and the voice from the worker's environment.
 *
 * `MAYA_STT`: `inference` (default, D-284: LiveKit Inference with `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET`, model
 * `MAYA_STT_MODEL` from INFERENCE_STT_MODELS, default assemblyai/universal-3-6-pro); `fake` (tests and local runs); or
 * `assemblyai` (the direct plugin, `ASSEMBLYAI_API_KEY`, model `MAYA_STT_MODEL`, default universal-3-6-pro).
 *
 * `MAYA_TTS`: `inference` (default, D-284: the LiveKit key, voice `MAYA_VOICE`, model `MAYA_TTS_MODEL` from
 * INFERENCE_TTS_MODELS, default inworld/inworld-tts-2); `fake` (tests and local runs); or `inworld` (the direct plugin,
 * `INWORLD_API_KEY`, voice `MAYA_VOICE`, model `MAYA_TTS_MODEL`, default inworld-tts-2).
 *
 * A missing key or voice, a model off the allow list, an unknown privacy marker or a missing one is a problem, never a
 * silent fallback to the fake. The ids are what the call row stores; they hold no key.
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
  const stt = value(env, "MAYA_STT").toLowerCase() || "inference";
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
  const tts = value(env, "MAYA_TTS").toLowerCase() || "inference";
  if (tts === "inworld") {
    const apiKey = value(env, "INWORLD_API_KEY");
    const id = value(env, "MAYA_VOICE");
    if (!apiKey) problems.push("MAYA_TTS is inworld, but INWORLD_API_KEY is not set");
    if (!id) problems.push("MAYA_TTS is inworld, but MAYA_VOICE (the Inworld voice id) is not set");
    voice = { provider: "inworld", model: value(env, "MAYA_TTS_MODEL") || TTS_DEFAULT_MODEL, voice: id, apiKey };
  } else if (tts === "inference") {
    const { apiKey, apiSecret, missing } = livekit();
    if (missing) problems.push("MAYA_TTS is inference, but LIVEKIT_API_KEY and LIVEKIT_API_SECRET are not both set");
    const id = value(env, "MAYA_VOICE");
    if (!id) problems.push("MAYA_TTS is inference, but MAYA_VOICE (the voice id) is not set");
    else if (!VOICE_ID.test(id)) problems.push("MAYA_VOICE must be a voice id: letters, digits, '.', '_' or '-', at most 100");
    const model = value(env, "MAYA_TTS_MODEL") || INFERENCE_TTS_DEFAULT;
    if (has(Object.keys(INFERENCE_TTS_MODELS) as InferenceTtsModel[], model)) voice = { provider: "inference", model, voice: id, apiKey, apiSecret, modelOptions: INFERENCE_TTS_MODELS[model] };
    else problems.push(`MAYA_TTS is inference, but MAYA_TTS_MODEL "${model}" is not one of ${Object.keys(INFERENCE_TTS_MODELS).join(", ")}`);
  } else if (tts !== "fake") problems.push(`MAYA_TTS must be fake, inference or inworld, not "${tts}"`);
  const listed = value(env, "MAYA_VOICE_PRIVACY_CONFIRMED").split(",").map(s => s.trim()).filter(Boolean);
  for (const m of listed) if (!has(PRIVACY_MARKERS, m)) problems.push(`MAYA_VOICE_PRIVACY_CONFIRMED has an unknown marker "${m}"`);
  const confirmed = new Set(listed);
  const sttRoute = stt === "assemblyai" || stt === "inference" ? stt : "fake";
  const ttsRoute = tts === "inworld" || tts === "inference" ? tts : "fake";
  for (const m of requiredMarkers(sttRoute, ttsRoute)) if (!confirmed.has(m)) problems.push(`MAYA_VOICE_PRIVACY_CONFIRMED must include ${m}`);
  if (problems.length) return { ok: false, problems };
  return { ok: true, speechToText, voice, ids: { speechToText: providerId(speechToText), voice: providerId(voice) } };
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
