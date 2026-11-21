// Turn-bound telemetry of one voice call's worker (the latency audit of 2026-11-14, replaces the process-wide marks of
// the deep dive). Every identity is allocated once and its marks are kept under it, so a later final transcript, an
// interruption or an overlapping request can never reset or borrow them. Every ID starts with its immutable job scope:
//   final f<N>        one final transcript: its own marks (STT final, detector end, prepare).
//   turn t<N>         one reply to one or more finals (a paused answer joins two). Immutable `finalIds`.
//   request r<N>      one physical request to the model provider: source, owning turn (or none yet), and its own
//                     sent / response headers / first response body chunk marks. A body chunk is not a first token.
//   utterance u<N>    one speech of the voice: kind (ack, answer, guidance, opening, other), its TTS request, first
//                     audio frame and output playback time. `published` is a legacy alias of output playback start,
//                     not a network-publication or physical-sound mark. An acknowledgement is never an answer.
//   prepare p<N>      one interim hint the worker gave the call to prepare a reply.
// A request made before its turn is known (a prepared reply) stays `unbound`; the final that follows lists it as a
// CANDIDATE (`prepare_candidates`, selection `unreported`) and never as the turn's own: which request the controller
// used is the controller's to say (docs: logging-build/report.md, "Controller seam"). No link is made by time.
// preparation_decision d<N>  what the call's controller reported about one prepared reply (VoiceCall.onPreparation): kind,
// used|discarded, lead, closed reason, the exact diagnostic handle id, cost only when the record states it. `used` means
// SELECTED by the controller, never that its proposal passed validation: a selected proposal that is later refused stays
// "used" here. Silence is not "none" and not acceptance: with no decision a turn's `preparationSelection` stays
// `unreported`. A decision joins a physical prepared request ONLY by the exact handle id inside this registry; no id, an
// id this registry never saw, an evicted request or two requests with one id leave the request null. A decision made
// before its request keeps `binding: unresolved` and gets one `preparation_binding` update if that exact request comes.
// Logs hold ids, closed reason codes and clock times only: no words, prompts, model output, audio, keys, URLs or
// provider error text. Memory and output are bounded (`LIMITS`).
import { randomUUID } from "node:crypto";
import type { PrepareRecord } from "@/lib/maya-prepared";
import { requestContext, withRequestContext, type RequestSource } from "@/lib/maya-request-trace";

export const TELEMETRY_VERSION = 1;

export type UtteranceKind = "ack" | "answer" | "guidance" | "opening" | "other";
export type RequestOutcome = "ok" | "error" | "aborted";
export type StatusClass = "2xx" | "3xx" | "4xx" | "5xx" | "other";
export type SttRead = "none" | "cached" | "network";
export type AdmissionOutcome = "admitted" | "cap" | "inactive" | "error";
export type RequestMark = "sent" | "headers" | "firstBodyChunk" | "end";
export type UtteranceMark = "ttsRequest" | "ttsFirstFrame" | "playbackStarted" | "published";
export type TurnMark = "firstSentence" | "answerQueued" | "turnReady";

/** The admission/spend-gate interval of one turn, measured at its seam (src/lib/maya-call.ts `turn`). */
export interface AdmissionSample {
  startedAt: number;
  endedAt: number;
  /** The speech-to-text coverage: no meter, a cached state, or a network read (`meter.ensure`) that was awaited. */
  stt: SttRead;
  sttMs: number;
  /** The model block: synchronous in memory, or `awaited` (the allowance was 0 and the refill decided). */
  block: "memory" | "awaited";
  blockMs: number;
  outcome: AdmissionOutcome;
}

export type CloseEntry = "explicit_rpc" | "participant_disconnect" | "sdk_close" | "sdk_error" | "deadline" | "worker_shutdown" | "controller_end" | "finish" | "stand_down";
const CLOSE_REASONS = ["unknown", "client_initiated", "duplicate_identity", "server_shutdown", "participant_removed", "room_deleted", "state_mismatch", "join_failure", "migration", "signal_close", "room_closed", "user_unavailable", "user_rejected", "sip_trunk_failure", "connection_timeout", "media_failure", "agent_error", "error", "job_shutdown", "participant_disconnected", "user_initiated", "recoverable", "fatal", "no_response", "time_limit"] as const;
export type CloseReason = typeof CLOSE_REASONS[number];
export type CloseProbe = (entry: CloseEntry, reason?: unknown, phase?: "origin" | "observation" | "media_close") => void;

export type TelemetryEvent =
  | { ev: "close_origin"; workerId: string; segment: number; closeId: string; originId: string | null; entry: CloseEntry; reason: CloseReason; phase: "origin" | "observation" | "media_close"; at: number }
  | { ev: "final"; finalId: string; at: number; detectorEndAt: number | null; detectorHeardAt: number | null; levelEndAt: number | null; prepareAt: number | null; hintIds: string[] }
  | { ev: "turn"; turnId: string; finalIds: string[]; at: number }
  | { ev: "prepare_hint"; prepareId: string; at: number }
  | { ev: "prepare_candidates"; finalId: string; prepareIds: string[]; requestIds: string[]; selection: "unreported" }
  | { ev: "request"; requestId: string; source: RequestSource | "unlabelled"; turnId: string | null; binding: "turn" | "unbound"; prepareId: string | null; handleId: string | null; ordinalInTurn: number | null; at: number }
  | { ev: "request_end"; requestId: string; outcome: RequestOutcome; status: StatusClass | null; at: number }
  | { ev: "utterance"; utteranceId: string; kind: UtteranceKind; turnId: string | null; speechId: string; sentenceId: string; sentenceIndex: number; at: number }
  | { ev: "sentence"; turnId: string; sentenceId: string; index: number; via: "stream" | "turn_end"; at: number }
  | { ev: "admission"; turnId: string; startedAt: number; endedAt: number; ms: number; stt: SttRead; sttMs: number; block: "memory" | "awaited"; blockMs: number; outcome: AdmissionOutcome }
  | { ev: "mark"; scope: "request" | "utterance" | "turn"; id: string; name: RequestMark | UtteranceMark | TurnMark; at: number }
  | { ev: "preparation_decision"; decisionId: string; kind: PrepareRecord["kind"]; status: PrepareRecord["status"]; leadMs: number; reason: NonNullable<PrepareRecord["reason"]> | null; handleId: string | null; usd: number | null; estimated: true | null; turnId: string | null; requestId: string | null; binding: DecisionBinding; at: number }
  | { ev: "preparation_binding"; decisionId: string; requestId: string | null; binding: Exclude<DecisionBinding, "none"> }
  | { ev: "truncated"; dropped: number };

/** exact: one physical request carries the decision's handle id. unresolved: none seen yet. ambiguous: several do. none: the record named no usable handle. */
export type DecisionBinding = "exact" | "unresolved" | "ambiguous" | "none";

export type Emitted = TelemetryEvent & { v: typeof TELEMETRY_VERSION; seq: number; callId: string | null };

/** The bounds of one call's telemetry: entries kept in memory, and events written to the log. */
export const LIMITS = { finals: 64, turns: 64, requests: 128, utterances: 96, decisions: 64, events: 4000 } as const;

const KINDS: readonly string[] = ["interim", "expected"];
const STATUSES: readonly string[] = ["used", "discarded"];
const REASONS: readonly string[] = ["key", "text", "not_plain", "stale", "ended"];

type FinalClockMark = "sttFinal" | "detectorEnd" | "detectorHeard" | "levelEnd" | "prepare";

interface FinalRecord {
  id: string;
  at: number;
  marks: Partial<Record<FinalClockMark, number>>;
}
interface TurnRecord {
  id: string;
  finalIds: string[];
  admissionMs?: number;
  /** Copies of the last final's marks at the turn's creation, plus the turn's own later marks. */
  marks: Partial<Record<FinalClockMark | TurnMark | "turnStart", number>>;
  requestIds: string[];
  utteranceIds: string[];
  decisionIds: string[];
  decisionCount: number;
  sentences: number;
}
interface DecisionRecord {
  id: string;
  kind: PrepareRecord["kind"];
  status: PrepareRecord["status"];
  leadMs: number;
  reason: NonNullable<PrepareRecord["reason"]> | null;
  handleId: string | null;
  usd: number | null;
  estimated: true | null;
  turnId: string | null;
  requestId: string | null;
  binding: DecisionBinding;
}
interface RequestRecord {
  id: string;
  source: RequestSource | "unlabelled";
  reviewKind?: "talk" | "math";
  turnId: string | null;
  prepareId: string | null;
  handleId: string | null;
  marks: Partial<Record<RequestMark, number>>;
  status: StatusClass | null;
  timedOut?: true;
  outcome: RequestOutcome | null;
}
interface UtteranceRecord {
  id: string;
  kind: UtteranceKind;
  turnId: string | null;
  marks: Partial<Record<UtteranceMark, number>>;
  ttsRequests: number;
  speechId: string;
  sentenceId: string;
  sentenceIndex: number;
  cancelled: boolean;
  isCancelled?: () => boolean;
}

const statusClass = (status: number): StatusClass => (status >= 200 && status < 300 ? "2xx" : status >= 300 && status < 400 ? "3xx" : status >= 400 && status < 500 ? "4xx" : status >= 500 && status < 600 ? "5xx" : "other");

/** A diagnostic handle id is logged only when it has the closed shape of src/lib/maya-handle-diagnostic.ts; any other text is dropped. */
const closedId = (id: string | null | undefined): string | null => (typeof id === "string" && /^[\w.:-]{1,80}#h\d{1,6}$/.test(id) ? id : null);

/** The oldest entries leave when a map is over its bound. */
function bounded<V>(map: Map<string, V>, limit: number) {
  while (map.size > limit) map.delete(map.keys().next().value as string);
}

/** What the voice synthesis reports about one speech. Both calls are first-only; `request` runs once per synthesis call. */
export interface UtteranceProbe {
  request(): void;
  firstFrame(): void;
  cancel?(): void;
}
export interface UtteranceOwner {
  turnId: string | null;
  kind: UtteranceKind | (() => UtteranceKind);
  cancelled?: () => boolean;
}

export class CallTelemetry {
  private seq = 0;
  private dropped = 0;
  private truncated = false;
  private ids = { f: 0, t: 0, r: 0, u: 0, p: 0, g: 0, d: 0, c: 0 };
  private readonly scopeId: string;
  private readonly finals = new Map<string, FinalRecord>();
  private readonly turns = new Map<string, TurnRecord>();
  private readonly requests = new Map<string, RequestRecord>();
  private readonly utterances = new Map<string, UtteranceRecord>();
  private readonly decisions = new Map<string, DecisionRecord>();
  /** Duplicate knowledge survives request eviction. Each handle keeps constant-size state, never an expanding ID list. */
  private readonly handleRequests = new Map<string, { requestId: string | null; ambiguous: boolean; historyKnown: boolean }>();
  /** Once the bounded handle history loses an entry, an unseen handle cannot be assumed new. */
  private handleHistoryLost = false;
  /** Hints given since the last final, and prepared requests sent with no turn since the last final. */
  private hintsSince: string[] = [];
  private unboundPrepared: string[] = [];
  private discardedPreparation = { decisions: 0, reported: 0, estimated: 0, unknown: 0, reportedUsd: 0, estimatedUsd: 0 };

  constructor(private readonly options: { callId?: string | null; scopeId?: string; now?: () => number; sink?: (event: Emitted) => void } = {}) {
    // Only a closed job identity or a random diagnostic scope can enter the log.
    this.scopeId = options.scopeId && /^[\w-]{1,80}$/.test(options.scopeId) ? options.scopeId : randomUUID();
  }

  private now() { return (this.options.now ?? Date.now)(); }

  private emit(event: TelemetryEvent) {
    if (this.seq >= LIMITS.events) {
      this.dropped++;
      if (!this.truncated) {
        this.truncated = true;
        this.write({ ev: "truncated", dropped: 0 });
      }
      return;
    }
    this.write(event);
  }
  private write(event: TelemetryEvent) {
    const out = { v: TELEMETRY_VERSION, seq: ++this.seq, callId: this.options.callId ?? null, ...event } as Emitted;
    try { (this.options.sink ?? ((e) => console.log("[maya voice] telemetry", JSON.stringify(e))))(out); } catch { /* A log never fails a call. */ }
  }
  /** Events that the log bound refused, for the closing line. */
  get droppedEvents() { return this.dropped; }

  private id(kind: keyof CallTelemetry["ids"]) { return `${this.scopeId}:${kind}${++this.ids[kind]}`; }

  /** One run captures this registry and owns its first close cause. Later SDK Close reentry is observation only.
   * The per-run cap also bounds repeated room/error callbacks. No global reset or call replacement can borrow it. */
  closeProbe(segment: number): CloseProbe {
    let originId: string | null = null;
    let count = 0;
    return (entry, rawReason = "unknown", requested = "origin") => {
      if (++count > 32) return;
      const phase = requested === "origin" && originId ? "observation" : requested;
      const closeId = this.id("c");
      if (phase === "origin") originId = closeId;
      const reason: CloseReason = CLOSE_REASONS.includes(rawReason as CloseReason) ? rawReason as CloseReason : "unknown";
      this.emit({ ev: "close_origin", workerId: this.scopeId, segment, closeId, originId, entry, reason, phase, at: this.now() });
    };
  }

  // ----- finals and hints -----

  /** An id for a hint about to be offered to the call. Nothing is logged until the call accepts the hint. */
  reserveHint(): string { return this.id("p"); }

  /** The call accepted the hint `prepareId`, so a prepared reply may be under way for it. */
  hintAccepted(prepareId: string, at = this.now()) {
    this.hintsSince.push(prepareId);
    this.emit({ ev: "prepare_hint", prepareId, at });
  }

  /** One final transcript reached the worker. Its marks are its own for good. */
  final(input: { at: number; detectorEndAt?: number | null; detectorHeardAt?: number | null; levelEndAt?: number | null; prepareAt?: number | null }): string {
    const id = this.id("f");
    const marks: FinalRecord["marks"] = { sttFinal: input.at };
    if (input.detectorEndAt != null) marks.detectorEnd = input.detectorEndAt;
    if (input.detectorHeardAt != null) marks.detectorHeard = input.detectorHeardAt;
    if (input.levelEndAt != null) marks.levelEnd = input.levelEndAt;
    if (input.prepareAt != null) marks.prepare = input.prepareAt;
    this.finals.set(id, { id, at: input.at, marks });
    bounded(this.finals, LIMITS.finals);
    const hintIds = this.hintsSince.splice(0);
    const requestIds = this.unboundPrepared.splice(0);
    this.emit({ ev: "final", finalId: id, at: input.at, detectorEndAt: input.detectorEndAt ?? null, detectorHeardAt: input.detectorHeardAt ?? null, levelEndAt: input.levelEndAt ?? null, prepareAt: input.prepareAt ?? null, hintIds });
    // Candidates, never a selection: nothing here says which request the controller used.
    if (hintIds.length || requestIds.length) this.emit({ ev: "prepare_candidates", finalId: id, prepareIds: hintIds, requestIds, selection: "unreported" });
    return id;
  }

  // ----- turns -----

  /** One reply. `finalIds` are the finals it answers (several when a paused answer joined them); missing ids are skipped. */
  turn(finalIds: readonly (string | null | undefined)[], at = this.now()): string {
    const id = this.id("t");
    const ids = finalIds.filter((x): x is string => typeof x === "string");
    const last = ids.length ? this.finals.get(ids[ids.length - 1]) : undefined;
    this.turns.set(id, { id, finalIds: ids, marks: { ...(last?.marks ?? {}), turnStart: at }, requestIds: [], utteranceIds: [], decisionIds: [], decisionCount: 0, sentences: 0 });
    bounded(this.turns, LIMITS.turns);
    this.emit({ ev: "turn", turnId: id, finalIds: ids, at });
    return id;
  }

  turnMark(turnId: string | null | undefined, name: TurnMark, at = this.now()) {
    const turn = turnId ? this.turns.get(turnId) : undefined;
    if (!turn || name in turn.marks) return;
    turn.marks[name] = at;
    this.emit({ ev: "mark", scope: "turn", id: turn.id, name, at });
  }

  /** A sentence of the turn passed the accepted-output seam (`VoiceSay.part`, or the turn's end for a whole reply). */
  sentence(turnId: string | null | undefined, index: number, via: "stream" | "turn_end", at = this.now()): string | null {
    const turn = turnId ? this.turns.get(turnId) : undefined;
    if (!turn) return null;
    // A whole reply's end adds a sentence only when no sentence streamed before it.
    if (via === "turn_end" && turn.sentences > 0) return null;
    turn.sentences++;
    const sentenceId = `${turn.id}.s${index + 1}`;
    if (turn.sentences === 1) this.turnMark(turn.id, "firstSentence", at);
    if (turn.sentences <= 8) this.emit({ ev: "sentence", turnId: turn.id, sentenceId, index, via, at });
    return sentenceId;
  }

  admission(turnId: string | null | undefined, sample: AdmissionSample) {
    const turn = turnId ? this.turns.get(turnId) : undefined;
    if (!turn) return;
    turn.admissionMs = Math.max(0, sample.endedAt - sample.startedAt);
    this.emit({ ev: "admission", turnId: turn.id, startedAt: sample.startedAt, endedAt: sample.endedAt, ms: Math.max(0, sample.endedAt - sample.startedAt), stt: sample.stt, sttMs: Math.max(0, sample.sttMs), block: sample.block, blockMs: Math.max(0, sample.blockMs), outcome: sample.outcome });
  }

  /** Runs `fn` so that model requests it starts belong to `turnId`. */
  runInTurn<T>(turnId: string, fn: () => T): T {
    return withRequestContext({ turnId }, fn);
  }

  // ----- requests -----

  /** Wraps fetch so requests to the model provider leave their own marks. Nothing in the request or response changes. */
  fetch(inner: typeof fetch, host = "openrouter.ai"): typeof fetch {
    return async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (!url.includes(host)) return inner(input, init);
      const record = this.openRequest();
      const signal = init?.signal ?? (typeof input === "object" && "signal" in input ? (input as Request).signal : undefined);
      let finished = false;
      const finish = (outcome: RequestOutcome, status: StatusClass | null) => {
        if (finished) return;
        finished = true;
        record.outcome = outcome;
        record.status = status;
        this.requestMark(record, "end");
        this.emit({ ev: "request_end", requestId: record.id, outcome, status, at: record.marks.end ?? this.now() });
      };
      signal?.addEventListener("abort", () => finish("aborted", record.status), { once: true });
      this.requestMark(record, "sent");
      let response: Response;
      try { response = await inner(input, init); }
      catch (e) {
        finish(signal?.aborted ? "aborted" : "error", null);
        throw e;
      }
      record.status = statusClass(response.status);
      if (response.status === 408 || response.status === 504) record.timedOut = true;
      this.requestMark(record, "headers");
      if (!response.body) { finish("ok", record.status); return response; }
      let seen = false;
      const status = record.status;
      const reader = response.body.getReader();
      const body = new ReadableStream<Uint8Array>({
        pull: async controller => {
          try {
            const { value, done } = await reader.read();
            if (done) { finish("ok", status); controller.close(); return; }
            if (!seen) { seen = true; this.requestMark(record, "firstBodyChunk"); }
            controller.enqueue(value);
          } catch (error) {
            finish(signal?.aborted ? "aborted" : "error", status);
            controller.error(error);
          }
        },
        cancel: async reason => { finish("aborted", status); await reader.cancel(reason); },
      }, { highWaterMark: 0 });
      return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
    };
  }

  private openRequest(): RequestRecord {
    const ctx = requestContext();
    const id = this.id("r");
    const turnId = ctx.turnId && this.turns.has(ctx.turnId) ? ctx.turnId : null;
    const reviewKind = ctx.source === "review" && (ctx.reviewKind === "math" || ctx.reviewKind === "talk") ? ctx.reviewKind : undefined;
    const record: RequestRecord = { id, source: ctx.source ?? "unlabelled", reviewKind, turnId, prepareId: ctx.prepareId ?? null, handleId: closedId(ctx.diagnosticHandleId), marks: {}, status: null, outcome: null };
    this.requests.set(id, record);
    bounded(this.requests, LIMITS.requests);
    const turn = turnId ? this.turns.get(turnId) : undefined;
    if (turn) turn.requestIds.push(id);
    else if (record.source === "prepared_interim" || record.source === "prepared_expected") this.unboundPrepared.push(id);
    this.emit({ ev: "request", requestId: id, source: record.source, turnId, binding: turnId ? "turn" : "unbound", prepareId: record.prepareId, handleId: record.handleId, ordinalInTurn: turn ? turn.requestIds.length : null, at: this.now() });
    if (record.handleId && (record.source === "prepared_interim" || record.source === "prepared_expected")) this.joinRequest(record.handleId, id);
    return record;
  }

  // ----- preparation decisions -----

  private requestOfHandle(handleId: string): { binding: Exclude<DecisionBinding, "none">; requestId: string | null } {
    const h = this.handleRequests.get(handleId);
    if (h?.ambiguous) return { binding: "ambiguous", requestId: null };
    if (!h?.historyKnown || !h.requestId || !this.requests.has(h.requestId)) return { binding: "unresolved", requestId: null };
    return { binding: "exact", requestId: h.requestId };
  }

  /** A prepared request appeared. Eviction can remove detail, but it cannot prove uniqueness. */
  private joinRequest(handleId: string, requestId: string) {
    const prior = this.handleRequests.get(handleId);
    const retainedDuplicate = [...this.decisions.values()].some(d => d.handleId === handleId &&
      (d.binding === "ambiguous" || (d.requestId !== null && d.requestId !== requestId)));
    const ambiguous = !!prior || retainedDuplicate;
    const state = { requestId: ambiguous ? null : requestId, ambiguous, historyKnown: prior?.historyKnown ?? !this.handleHistoryLost };
    this.handleRequests.delete(handleId);
    this.handleRequests.set(handleId, state);
    if (this.handleRequests.size > LIMITS.requests) {
      this.handleRequests.delete(this.handleRequests.keys().next().value as string);
      this.handleHistoryLost = true;
    }
    const match = this.requestOfHandle(handleId);
    for (const d of this.decisions.values()) {
      if (d.handleId !== handleId || d.binding === "ambiguous") continue;
      if (d.binding === match.binding && d.requestId === match.requestId) continue;
      d.binding = match.binding;
      d.requestId = match.requestId;
      this.emit({ ev: "preparation_binding", decisionId: d.id, requestId: d.requestId, binding: match.binding });
    }
  }

  /**
   * What the controller reported about one prepared reply (VoiceCall.onPreparation). Only closed fields are read and
   * kept; a record without a closed kind, status and lead is dropped whole. `used` is the controller's SELECTION: this
   * never says the proposal was accepted. The owning turn is the async request context's turn, when this registry has
   * it; a decision made at the call's end or outside a child turn keeps a null turn.
   */
  preparationDecision(input: unknown): string | null {
    if (!input || typeof input !== "object") return null;
    const r = input as Record<string, unknown>;
    if (typeof r.kind !== "string" || !KINDS.includes(r.kind) || typeof r.status !== "string" || !STATUSES.includes(r.status)) return null;
    if (typeof r.leadMs !== "number" || !Number.isFinite(r.leadMs) || r.leadMs < 0) return null;
    const reason = typeof r.reason === "string" && REASONS.includes(r.reason) ? (r.reason as NonNullable<PrepareRecord["reason"]>) : null;
    // A cost is known only when the record states one: absent stays null, a stated zero stays zero.
    const usd = typeof r.usd === "number" && Number.isFinite(r.usd) && r.usd >= 0 ? r.usd : null;
    const handleId = closedId(typeof r.diagnosticHandleId === "string" ? r.diagnosticHandleId : null);
    const ctxTurn = requestContext().turnId;
    const turnId = ctxTurn && this.turns.has(ctxTurn) ? ctxTurn : null;
    const matched = handleId ? this.requestOfHandle(handleId) : { binding: "none" as const, requestId: null };
    const binding: DecisionBinding = matched.binding;
    const d: DecisionRecord = { id: this.id("d"), kind: r.kind as PrepareRecord["kind"], status: r.status as PrepareRecord["status"], leadMs: r.leadMs, reason, handleId, usd, estimated: r.estimated === true ? true : null, turnId, requestId: matched.requestId, binding };
    if (d.status === "discarded") {
      const totals = this.discardedPreparation;
      totals.decisions++;
      if (usd === null) totals.unknown++;
      else if (d.estimated) { totals.estimated++; totals.estimatedUsd += usd; }
      else { totals.reported++; totals.reportedUsd += usd; }
    }
    this.decisions.set(d.id, d);
    bounded(this.decisions, LIMITS.decisions);
    if (turnId) {
      const turn = this.turns.get(turnId)!;
      turn.decisionCount++;
      turn.decisionIds.push(d.id);
      if (turn.decisionIds.length > LIMITS.decisions) turn.decisionIds.shift();
    }
    this.emit({ ev: "preparation_decision", decisionId: d.id, kind: d.kind, status: d.status, leadMs: d.leadMs, reason: d.reason, handleId: d.handleId, usd: d.usd, estimated: d.estimated, turnId: d.turnId, requestId: d.requestId, binding: d.binding, at: this.now() });
    return d.id;
  }

  private requestMark(record: RequestRecord, name: RequestMark) {
    if (name in record.marks) return;
    const at = this.now();
    record.marks[name] = at;
    this.emit({ ev: "mark", scope: "request", id: record.id, name, at });
  }

  // ----- utterances -----

  /**
   * One speech of the voice. `kind` can be decided when the first words reach the voice (a reply's stream carries the
   * acknowledgement or the answer, and only then is it known which). Each physical sentence synthesis has its own
   * probe under the TTS node's speech ID.
   */
  /** One TTS node's spoken sentences. These IDs describe synthesis, not the controller's checked sentence index. */
  speech(owner: UtteranceOwner): (sentenceIndex: number) => UtteranceProbe {
    const speechId = this.id("g");
    return sentenceIndex => this.utterance({ ...owner, speechId, sentenceIndex });
  }

  utterance(owner: UtteranceOwner & { speechId?: string; sentenceIndex?: number }): UtteranceProbe {
    let record: UtteranceRecord | null = null;
    const open = () => {
      if (record) return record;
      const kind = typeof owner.kind === "function" ? owner.kind() : owner.kind;
      const turnId = owner.turnId && this.turns.has(owner.turnId) ? owner.turnId : null;
      const speechId = owner.speechId ?? this.id("g");
      const sentenceIndex = owner.sentenceIndex ?? 0;
      record = { id: this.id("u"), kind, turnId, speechId, sentenceId: `${speechId}.s${sentenceIndex + 1}`, sentenceIndex, marks: {}, ttsRequests: 0, cancelled: false, isCancelled: owner.cancelled };
      this.utterances.set(record.id, record);
      bounded(this.utterances, LIMITS.utterances);
      if (turnId) this.turns.get(turnId)!.utteranceIds.push(record.id);
      this.emit({ ev: "utterance", utteranceId: record.id, kind, turnId, speechId, sentenceId: record.sentenceId, sentenceIndex, at: this.now() });
      return record;
    };
    return {
      request: () => { const u = open(); u.ttsRequests++; this.utteranceMark(u, "ttsRequest"); },
      firstFrame: () => { if (record) this.utteranceMark(record, "ttsFirstFrame"); },
      cancel: () => { if (record) record.cancelled = true; },
    };
  }

  private utteranceMark(u: UtteranceRecord, name: UtteranceMark) {
    if (name in u.marks) return;
    const at = this.now();
    u.marks[name] = at;
    this.emit({ ev: "mark", scope: "utterance", id: u.id, name, at });
  }

  /** The player started the first audio of a turn's `kind` speech: the turn's first such speech without that mark. */
  playbackStarted(turnId: string | null | undefined, kind: "ack" | "answer") {
    if (!turnId) return;
    const u = [...this.utterances.values()].find(x => x.turnId === turnId && x.kind === kind && !x.cancelled && !x.isCancelled?.() && !("playbackStarted" in x.marks));
    if (u) { this.utteranceMark(u, "playbackStarted"); this.published(u.id); }
  }

  /** Publication belongs only to a speech identified by actual output playback. A state change alone has no owner. */
  published(utteranceId?: string) {
    const u = utteranceId ? this.utterances.get(utteranceId) : undefined;
    if (u && !u.cancelled && !u.isCancelled?.() && "playbackStarted" in u.marks) this.utteranceMark(u, "published");
  }

  // ----- views -----

  /** Call level, including discarded work with no owning turn. Known amounts only. */
  discardedPreparationSummary() { return { ...this.discardedPreparation }; }

  /**
   * One turn's own clock for the "voice turn" log line: its own entities only, in milliseconds after its earliest
   * mark. Nothing of another turn can appear in it, however the finals interleaved. The legacy first-only names
   * (`modelSent`, `ttsRequest`...) are the turn's FIRST bound request and its first ANSWER speech: an acknowledgement's
   * audio is under `ackTts*`. Null when the turn has no marks.
   */
  turnClock(turnId: string | null | undefined) {
    const turn = turnId ? this.turns.get(turnId) : undefined;
    if (!turn) return null;
    const requests = turn.requestIds.map(id => this.requests.get(id)).filter((r): r is RequestRecord => !!r);
    const utterances = turn.utteranceIds.map(id => this.utterances.get(id)).filter((u): u is UtteranceRecord => !!u);
    const decisions = turn.decisionIds.map(id => this.decisions.get(id)).filter((d): d is DecisionRecord => !!d);
    const times: number[] = [...Object.values(turn.marks), ...requests.flatMap(r => Object.values(r.marks)), ...utterances.flatMap(u => Object.values(u.marks))];
    for (const id of turn.finalIds) times.push(...Object.values(this.finals.get(id)?.marks ?? {}));
    if (!times.length) return null;
    const t0 = Math.min(...times);
    const rel = <Key extends string>(m: Partial<Record<Key, number>>) =>
      Object.fromEntries(Object.entries(m).filter(([, v]) => v !== undefined).map(([k, v]) => [k, (v as number) - t0])) as Partial<Record<Key, number>>;
    const first = requests[0];
    const answer = utterances.find(u => u.kind === "answer");
    const ack = utterances.find(u => u.kind === "ack");
    return {
      t0,
      turnId: turn.id,
      finals: turn.finalIds.map(id => ({ id, ...rel(this.finals.get(id)?.marks ?? {}) })),
      ...rel(turn.marks),
      ...(turn.admissionMs !== undefined ? { admissionMs: turn.admissionMs } : {}),
      ...(first ? { modelSent: first.marks.sent !== undefined ? first.marks.sent - t0 : null, modelHeaders: first.marks.headers !== undefined ? first.marks.headers - t0 : null, modelFirstChunk: first.marks.firstBodyChunk !== undefined ? first.marks.firstBodyChunk - t0 : null } : {}),
      ...(answer ? { ttsRequest: answer.marks.ttsRequest !== undefined ? answer.marks.ttsRequest - t0 : null, ttsFirstFrame: answer.marks.ttsFirstFrame !== undefined ? answer.marks.ttsFirstFrame - t0 : null } : {}),
      ...(ack ? { ackTtsRequest: ack.marks.ttsRequest !== undefined ? ack.marks.ttsRequest - t0 : null, ackTtsFirstFrame: ack.marks.ttsFirstFrame !== undefined ? ack.marks.ttsFirstFrame - t0 : null } : {}),
      // Explicit decisions only. No decision: `unreported`, never "none" and never "accepted".
      preparationSelection: turn.decisionCount ? "reported" : "unreported",
      preparationDecisionCount: turn.decisionCount,
      preparationDetailsEvicted: Math.max(0, turn.decisionCount - decisions.length),
      requestDetailsEvicted: turn.requestIds.length - requests.length,
      utteranceDetailsEvicted: turn.utteranceIds.length - utterances.length,
      preparations: decisions.map(d => {
        const q = d.requestId ? this.requests.get(d.requestId) : undefined;
        return { id: d.id, kind: d.kind, status: d.status, leadMs: d.leadMs, reason: d.reason, handleId: d.handleId, usd: d.usd, estimated: d.estimated, binding: d.binding, requestId: q ? q.id : null, ...(q ? { request: { source: q.source, status: q.status, outcome: q.outcome, ...rel(q.marks) } } : {}) };
      }),
      requests: requests.map(r => ({ id: r.id, source: r.source, reviewKind: r.reviewKind, prepareId: r.prepareId, handleId: r.handleId, status: r.status, outcome: r.outcome, timedOut: r.timedOut, ...rel(r.marks) })),
      utterances: utterances.map(u => ({ id: u.id, kind: u.kind, speechId: u.speechId, sentenceId: u.sentenceId, sentenceIndex: u.sentenceIndex, ttsRequests: u.ttsRequests, ...rel(u.marks) })),
    };
  }
}

/** The telemetry of this process. One job process serves one call, as `globalThis.fetch` is the process's. */
let current = new CallTelemetry();
export const telemetry = (): CallTelemetry => current;
export function setTelemetry(next: CallTelemetry): CallTelemetry {
  current = next;
  return current;
}

/** Wraps fetch with the process's telemetry. Kept as the old name of ./marks.ts. */
export function markedFetch(inner: typeof fetch, host = "openrouter.ai", t?: CallTelemetry): typeof fetch {
  return (input, init) => (t ?? current).fetch(inner, host)(input, init);
}
