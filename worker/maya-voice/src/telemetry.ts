// Turn-bound telemetry of one voice call's worker (the latency audit of 2026-11-14, replaces the process-wide marks of
// the deep dive). Every identity is allocated once and its marks are kept under it, so a later final transcript, an
// interruption or an overlapping request can never reset or borrow them:
//   final f<N>        one final transcript: its own marks (STT final, detector end, prepare).
//   turn t<N>         one reply to one or more finals (a paused answer joins two). Immutable `finalIds`.
//   request r<N>      one physical request to the model provider: source, owning turn (or none yet), and its own
//                     sent / response headers / first response body chunk marks. A body chunk is not a first token.
//   utterance u<N>    one speech of the voice: kind (ack, answer, guidance, opening, other), its TTS request, first
//                     audio frame, first playback and first published times. An acknowledgement is never an answer.
//   prepare p<N>      one interim hint the worker gave the call to prepare a reply.
// A request made before its turn is known (a prepared reply) stays `unbound`; the final that follows lists it as a
// CANDIDATE (`prepare_candidates`, selection `unreported`) and never as the turn's own: which request the controller
// used is the controller's to say (docs: logging-build/report.md, "Controller seam"). No link is made by time.
// Logs hold ids, closed reason codes and clock times only: no words, prompts, model output, audio, keys, URLs or
// provider error text. Memory and output are bounded (`LIMITS`).
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

export type TelemetryEvent =
  | { ev: "final"; finalId: string; at: number; detectorEndAt: number | null; detectorHeardAt: number | null; levelEndAt: number | null; prepareAt: number | null; hintIds: string[] }
  | { ev: "turn"; turnId: string; finalIds: string[]; at: number }
  | { ev: "prepare_hint"; prepareId: string; at: number }
  | { ev: "prepare_candidates"; finalId: string; prepareIds: string[]; requestIds: string[]; selection: "unreported" }
  | { ev: "request"; requestId: string; source: RequestSource | "unlabelled"; turnId: string | null; binding: "turn" | "unbound"; prepareId: string | null; ordinalInTurn: number | null; at: number }
  | { ev: "request_end"; requestId: string; outcome: RequestOutcome; status: StatusClass | null; at: number }
  | { ev: "utterance"; utteranceId: string; kind: UtteranceKind; turnId: string | null; at: number }
  | { ev: "sentence"; turnId: string; sentenceId: string; index: number; via: "stream" | "turn_end"; at: number }
  | { ev: "admission"; turnId: string; startedAt: number; endedAt: number; ms: number; stt: SttRead; sttMs: number; block: "memory" | "awaited"; blockMs: number; outcome: AdmissionOutcome }
  | { ev: "mark"; scope: "request" | "utterance" | "turn"; id: string; name: RequestMark | UtteranceMark | TurnMark; at: number }
  | { ev: "truncated"; dropped: number };

export type Emitted = TelemetryEvent & { v: typeof TELEMETRY_VERSION; seq: number; callId: string | null };

/** The bounds of one call's telemetry: entries kept in memory, and events written to the log. */
export const LIMITS = { finals: 64, turns: 64, requests: 128, utterances: 96, events: 4000 } as const;

interface FinalRecord {
  id: string;
  at: number;
  marks: Record<string, number>;
}
interface TurnRecord {
  id: string;
  finalIds: string[];
  /** Copies of the last final's marks at the turn's creation, plus the turn's own later marks. */
  marks: Record<string, number>;
  requestIds: string[];
  utteranceIds: string[];
  sentences: number;
}
interface RequestRecord {
  id: string;
  source: RequestSource | "unlabelled";
  turnId: string | null;
  prepareId: string | null;
  marks: Partial<Record<RequestMark, number>>;
  status: StatusClass | null;
  outcome: RequestOutcome | null;
}
interface UtteranceRecord {
  id: string;
  kind: UtteranceKind;
  turnId: string | null;
  marks: Partial<Record<UtteranceMark, number>>;
  ttsRequests: number;
}

const statusClass = (status: number): StatusClass => (status >= 200 && status < 300 ? "2xx" : status >= 300 && status < 400 ? "3xx" : status >= 400 && status < 500 ? "4xx" : status >= 500 && status < 600 ? "5xx" : "other");

/** The oldest entries leave when a map is over its bound. */
function bounded<V>(map: Map<string, V>, limit: number) {
  while (map.size > limit) map.delete(map.keys().next().value as string);
}

/** What the voice synthesis reports about one speech. Both calls are first-only; `request` runs once per synthesis call. */
export interface UtteranceProbe {
  request(): void;
  firstFrame(): void;
}

export class CallTelemetry {
  private seq = 0;
  private dropped = 0;
  private truncated = false;
  private ids = { f: 0, t: 0, r: 0, u: 0, p: 0 };
  private readonly finals = new Map<string, FinalRecord>();
  private readonly turns = new Map<string, TurnRecord>();
  private readonly requests = new Map<string, RequestRecord>();
  private readonly utterances = new Map<string, UtteranceRecord>();
  /** Hints given since the last final, and prepared requests sent with no turn since the last final. */
  private hintsSince: string[] = [];
  private unboundPrepared: string[] = [];

  constructor(private readonly options: { callId?: string | null; now?: () => number; sink?: (event: Emitted) => void } = {}) {}

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

  private id(kind: keyof CallTelemetry["ids"]) { return `${kind}${++this.ids[kind]}`; }

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
    const marks: Record<string, number> = { sttFinal: input.at };
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
    this.turns.set(id, { id, finalIds: ids, marks: { ...(last?.marks ?? {}) }, requestIds: [], utteranceIds: [], sentences: 0 });
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
      this.requestMark(record, "headers");
      if (!response.body) { finish("ok", record.status); return response; }
      let seen = false;
      const status = record.status;
      const body = response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
        transform: (chunk, controller) => {
          if (!seen) { seen = true; this.requestMark(record, "firstBodyChunk"); }
          controller.enqueue(chunk);
        },
        flush: () => finish("ok", status),
        // A cancelled reader ends the request. Runtimes without a transformer cancel hook rely on the abort signal.
        cancel: () => finish("aborted", status),
      } as Transformer<Uint8Array, Uint8Array>));
      return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
    };
  }

  private openRequest(): RequestRecord {
    const ctx = requestContext();
    const id = this.id("r");
    const turnId = ctx.turnId && this.turns.has(ctx.turnId) ? ctx.turnId : null;
    const record: RequestRecord = { id, source: ctx.source ?? "unlabelled", turnId, prepareId: ctx.prepareId ?? null, marks: {}, status: null, outcome: null };
    this.requests.set(id, record);
    bounded(this.requests, LIMITS.requests);
    const turn = turnId ? this.turns.get(turnId) : undefined;
    if (turn) turn.requestIds.push(id);
    else if (record.source === "prepared_interim" || record.source === "prepared_expected") this.unboundPrepared.push(id);
    this.emit({ ev: "request", requestId: id, source: record.source, turnId, binding: turnId ? "turn" : "unbound", prepareId: record.prepareId, ordinalInTurn: turn ? turn.requestIds.length : null, at: this.now() });
    return record;
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
   * acknowledgement or the answer, and only then is it known which). The probe is shared by every synthesis call of
   * the speech (a speech with several sentences makes one per sentence).
   */
  utterance(owner: { turnId: string | null; kind: UtteranceKind | (() => UtteranceKind) }): UtteranceProbe {
    let record: UtteranceRecord | null = null;
    const open = () => {
      if (record) return record;
      const kind = typeof owner.kind === "function" ? owner.kind() : owner.kind;
      const turnId = owner.turnId && this.turns.has(owner.turnId) ? owner.turnId : null;
      record = { id: this.id("u"), kind, turnId, marks: {}, ttsRequests: 0 };
      this.utterances.set(record.id, record);
      bounded(this.utterances, LIMITS.utterances);
      if (turnId) this.turns.get(turnId)!.utteranceIds.push(record.id);
      this.emit({ ev: "utterance", utteranceId: record.id, kind, turnId, at: this.now() });
      return record;
    };
    return {
      request: () => { const u = open(); u.ttsRequests++; this.utteranceMark(u, "ttsRequest"); },
      firstFrame: () => { if (record) this.utteranceMark(record, "ttsFirstFrame"); },
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
    const u = [...this.utterances.values()].find(x => x.turnId === turnId && x.kind === kind && !("playbackStarted" in x.marks));
    if (u) this.utteranceMark(u, "playbackStarted");
  }

  /** The session began to play audio. Speeches play in order: the oldest speech that has a frame and no such mark. */
  published() {
    const u = [...this.utterances.values()].find(x => "ttsFirstFrame" in x.marks && !("published" in x.marks));
    if (u) this.utteranceMark(u, "published");
  }

  // ----- views -----

  /**
   * One turn's own clock for the "voice turn" log line: its own entities only, in milliseconds after its earliest
   * mark. Nothing of another turn can appear in it, however the finals interleaved. The legacy first-only names
   * (`modelSent`, `ttsRequest`...) are the turn's FIRST bound request and its first ANSWER speech: an acknowledgement's
   * audio is under `ackTts*`. Null when the turn has no marks.
   */
  turnClock(turnId: string | null | undefined): Record<string, unknown> | null {
    const turn = turnId ? this.turns.get(turnId) : undefined;
    if (!turn) return null;
    const requests = turn.requestIds.map(id => this.requests.get(id)).filter((r): r is RequestRecord => !!r);
    const utterances = turn.utteranceIds.map(id => this.utterances.get(id)).filter((u): u is UtteranceRecord => !!u);
    const times: number[] = [...Object.values(turn.marks), ...requests.flatMap(r => Object.values(r.marks)), ...utterances.flatMap(u => Object.values(u.marks))];
    for (const id of turn.finalIds) times.push(...Object.values(this.finals.get(id)?.marks ?? {}));
    if (!times.length) return null;
    const t0 = Math.min(...times);
    const rel = (m: Record<string, number | undefined>) => Object.fromEntries(Object.entries(m).filter(([, v]) => v !== undefined).map(([k, v]) => [k, (v as number) - t0]));
    const first = requests[0];
    const answer = utterances.find(u => u.kind === "answer");
    const ack = utterances.find(u => u.kind === "ack");
    return {
      t0,
      turnId: turn.id,
      finals: turn.finalIds.map(id => ({ id, ...rel(this.finals.get(id)?.marks ?? {}) })),
      ...rel(turn.marks),
      ...(first ? { modelSent: first.marks.sent !== undefined ? first.marks.sent - t0 : null, modelHeaders: first.marks.headers !== undefined ? first.marks.headers - t0 : null, modelFirstChunk: first.marks.firstBodyChunk !== undefined ? first.marks.firstBodyChunk - t0 : null } : {}),
      ...(answer ? { ttsRequest: answer.marks.ttsRequest !== undefined ? answer.marks.ttsRequest - t0 : null, ttsFirstFrame: answer.marks.ttsFirstFrame !== undefined ? answer.marks.ttsFirstFrame - t0 : null } : {}),
      ...(ack ? { ackTtsRequest: ack.marks.ttsRequest !== undefined ? ack.marks.ttsRequest - t0 : null, ackTtsFirstFrame: ack.marks.ttsFirstFrame !== undefined ? ack.marks.ttsFirstFrame - t0 : null } : {}),
      requests: requests.map(r => ({ id: r.id, source: r.source, prepareId: r.prepareId, status: r.status, outcome: r.outcome, ...rel(r.marks) })),
      utterances: utterances.map(u => ({ id: u.id, kind: u.kind, ttsRequests: u.ttsRequests, ...rel(u.marks) })),
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
