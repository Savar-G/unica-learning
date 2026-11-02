// Maya's board batch protocol (#328, spec #297): how board batches travel from Maya's side (the sender, next to the
// session) to the child's browser (the receiver, next to the renderer). Pure TypeScript: no React, network, clock or
// randomness. The transport is a seam (LiveKit RPC, #329; the in-memory transport in tests).
//
// The rules (LiveKit research, sections 3 and 4):
// - Serial: the sender sends one request at a time and waits for its answer.
// - Every batch has an id (its transaction id), a sequence number in its epoch, and the board revision it was planned on.
// - The receiver remembers what it decided for each batch id, so a retry after a lost answer never applies a batch twice.
// - Accepted is not shown: the receiver stages a batch, shows it on release (when Maya's speech reaches it) and logs it
//   presented when the child has seen it drawn. Unshown batches are cancelled on an interruption.
// - A connect starts a new epoch: the receiver drops what it staged, refuses anything from an older epoch, and rebuilds
//   the board from the sender's copy of the board log. The log only grows: a connect never takes back what was shown,
//   and a copy that differs from the receiver's log in any event it already holds is refused.
// - A connect claims the epoch it read: a newer claim by another sender in between makes it fail, and the sender stops.
//   After its reset the sender reads the whole log again before it plans: the child may have written in between.
// - Every answer fits in one RPC answer: a log event too large for one answer travels in ordered parts.
import { addChildInk, applyBatch, createScene, type ApplyResult, type Batch, type GlyphSet, type Notice, type PageSize, type Refusal, type Scene, type TimedPath } from "@/lib/board";
import type { SpeechScope } from "@/lib/board-speech";
import type { Stroke } from "@/lib/whiteboard";

// ---------- wire messages ----------

/** A finished stroke of the child's, as the board core takes it. */
export interface Ink {
  page: number;
  stroke: Stroke;
  boardWidth: number;
}

/**
 * The board log, in order: a batch of Maya's that was shown, a stroke of the child's, a shown batch the child has seen
 * drawn, and staged batches cancelled before the child saw them. The first two make the board; the others are its
 * history.
 */
export type BoardEvent = (
  | { kind: "batch"; batchId: string; commands: unknown[] }
  | ({ kind: "ink" } & Ink)
  | { kind: "presented"; batchId: string }
  | { kind: "cancelled"; batchIds: string[]; cancelId?: string }
) & { /** Receiver clock, in epoch milliseconds, when this change became visible or was cancelled. */ at?: number };

/** The board log. Replaying it on an empty board gives the same board: the core is deterministic. */
export interface BoardSnapshot {
  events: BoardEvent[];
}

/** Where a batch is on the child's side. */
export type BatchState = "accepted" | "shown" | "presented" | "cancelled";

/** Who may write on the board now. The child takes the pen with "Take the pen" and gives it back. */
export type PenHolder = "maya" | "child";

export type BoardRequest =
  | { type: "apply"; sessionId: string; epoch: number; sequence: number; baseRevision: number; batchId: string; utteranceId?: string; scope: SpeechScope; commands: unknown[] }
  /**
   * Cancels the staged batches numbered up to `through` in this epoch. The id makes it safe to deliver twice: the receiver
   * keeps what each cancel did, and a cancel it has seen changes nothing and gets the same answer.
   */
  | { type: "stop"; sessionId: string; epoch: number; scope: SpeechScope }
  | { type: "release"; sessionId: string; epoch: number; batchId: string; scope: SpeechScope }
  | { type: "cancel"; sessionId: string; epoch: number; cancelId: string; through: number; scope: SpeechScope }
  /** The log from event `since`. `part`: the next part of the event at `since`, when it travels in parts. */
  | { type: "status"; sessionId: string; since: number; part?: number }
  /**
   * Starts `epoch`, when the board is still on `observedEpoch`, the epoch the sender read before it claimed: a claim by
   * another sender in between makes this one stale. Large snapshots travel in bounded RPC parts.
   */
  | { type: "reset"; sessionId: string; senderId: string; epoch: number; observedEpoch: number; scope: SpeechScope | null; snapshot: BoardSnapshot };

/** The receiver's state, carried by every answer. */
export interface ReceiverStatus {
  epoch: number;
  /** The plan observed in this epoch. A reset must claim this same plan. */
  scope: SpeechScope | null;
  /**
   * Counts changes to the board Maya plans on: accepted and cancelled batches, the child's ink, the pen. A batch planned
   * on another revision is refused.
   */
  revision: number;
  pen: PenHolder;
  /** How many events the receiver's board log holds. */
  logLength: number;
}

/**
 * Why a request was not carried out. Only `refused` (the board core refused the batch) is a decision about the batch:
 * the receiver keeps it, and a retry gets the same answer. The others leave the batch id free to send again.
 * `behind`: the reset's log is shorter than the receiver's; the sender reads the rest and tries again.
 * `conflict`: the reset's log differs from the receiver's in an event the receiver holds; nothing changes.
 */
export type ProtocolCode =
  | "invalid_request"
  | "refused"
  | "duplicate_batch"
  | "out_of_order"
  | "stale_revision"
  | "stale_epoch"
  | "pen_with_child"
  | "wrong_session"
  | "too_large"
  | "behind"
  | "conflict";

/** One part of a log event too large for one answer: its JSON text, cut in `count` parts, with a digest of the text. */
export interface EventPart {
  index: number;
  count: number;
  digest: string;
  data: string;
}

export type BoardResponse =
  | ({ ok: true; type: "apply"; batchId: string; state: BatchState } & ReceiverStatus)
  /** `at`: where this cancel's `cancelled` event is in the log, or null when it found nothing to cancel. */
  | ({ ok: true; type: "stop" } & ReceiverStatus)
  | ({ ok: true; type: "release"; batchId: string; state: BatchState } & ReceiverStatus)
  | ({ ok: true; type: "cancel"; cancelId: string; at: number | null } & ReceiverStatus)
  /** Whole events from `since`, or one part of the event at `since`. */
  | ({ ok: true; type: "status"; log: BoardEvent[]; part?: EventPart } & ReceiverStatus)
  | ({ ok: true; type: "reset" } & ReceiverStatus)
  | ({ ok: false; code: ProtocolCode; reason: string; batchId?: string; refusal?: Refusal } & ReceiverStatus);

/** The seam the sender talks through. A rejected call may still have reached the receiver and acted. */
export interface BoardTransport {
  call(request: BoardRequest): Promise<BoardResponse>;
}

/** The most UTF-8 bytes an apply request, or any answer, may take: well under LiveKit's 15 KiB. */
export const MAX_BATCH_BYTES = 8192;

function byteSize(value: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).length;
  } catch {
    return Infinity;
  }
}

/** The event's encoding with the keys of every object sorted: two encoders of the same event give the same text. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (isObject(value))
    return `{${Object.keys(value)
      .filter((k) => value[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)
      .join(",")}}`;
  return JSON.stringify(value);
}

/** FNV-1a over the UTF-16 code units: a check that the parts of an event come from one event. */
function digest(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, "0");
}

// The largest status answer frame, with every number at its widest: the bounds below hold whatever the state is.
const WIDEST = Number.MAX_SAFE_INTEGER;
const WIDEST_STATUS: ReceiverStatus = { epoch: WIDEST, scope: { utteranceId: "\u0000".repeat(64), generation: WIDEST }, revision: WIDEST, pen: "child", logLength: WIDEST };
/** A status answer with no events. */
const STATUS_FRAME_BYTES = byteSize({ ok: true, type: "status", log: [], ...WIDEST_STATUS });
/** An event of at most this many bytes travels whole; a larger one always travels in parts. */
const WHOLE_EVENT_BYTES = MAX_BATCH_BYTES - STATUS_FRAME_BYTES;
/** The most bytes of one part's data, escaped as a JSON string. */
const PART_BYTES = MAX_BATCH_BYTES - byteSize({ ok: true, type: "status", log: [], part: { index: WIDEST, count: WIDEST, digest: "ffffffff", data: "" }, ...WIDEST_STATUS });
/** The longest reason an answer carries: a refusal may quote the batch. */
const MAX_REASON = 300;

/** The UTF-8 bytes one character takes inside a JSON string. */
function escapedSize(ch: string): number {
  const escaped = JSON.stringify(ch).slice(1, -1);
  if (escaped.length > 1) return escaped.length;
  const code = ch.codePointAt(0)!;
  return code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
}

/** Cuts an event's JSON text into parts that each fit in one answer, never inside a character. */
function eventParts(text: string): string[] {
  const parts: string[] = [];
  let part = "";
  let bytes = 0;
  for (const ch of text) {
    const size = escapedSize(ch);
    if (bytes + size > PART_BYTES) {
      parts.push(part);
      part = "";
      bytes = 0;
    }
    part += ch;
    bytes += size;
  }
  parts.push(part);
  return parts;
}

// ---------- request checks ----------

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isCount = (v: unknown, min = 0): v is number => Number.isSafeInteger(v) && (v as number) >= min;
const isId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 64;
const isPoint = (v: unknown) => Array.isArray(v) && v.length === 2 && v.every((n) => Number.isFinite(n));
const isStroke = (v: unknown) => isObject(v) && typeof v.erase === "boolean" && Number.isFinite(v.w) && Array.isArray(v.pts) && v.pts.every(isPoint);

function isEvent(v: unknown): v is BoardEvent {
  if (!isObject(v) || (v.at !== undefined && (!Number.isFinite(v.at) || (v.at as number) < 0))) return false;
  switch (v.kind) {
    case "batch":
      return isId(v.batchId) && Array.isArray(v.commands);
    case "ink":
      return isCount(v.page, 1) && Number.isFinite(v.boardWidth) && isStroke(v.stroke);
    case "presented":
      return isId(v.batchId);
    case "cancelled":
      return Array.isArray(v.batchIds) && v.batchIds.every(isId) && (v.cancelId === undefined || isId(v.cancelId));
    default:
      return false;
  }
}

const isScope = (v: unknown): v is SpeechScope => isObject(v) && isId(v.utteranceId) && isCount(v.generation, 1);
const sameScope = (a: SpeechScope | null | undefined, b: SpeechScope) => a?.utteranceId === b.utteranceId && a.generation === b.generation;
const scopeKey = (scope: SpeechScope) => JSON.stringify([scope.utteranceId, scope.generation]);

/** The request's shape, checked: the board core checks the commands themselves. */
function parseRequest(v: unknown): BoardRequest | null {
  if (!isObject(v) || typeof v.sessionId !== "string") return null;
  switch (v.type) {
    case "apply":
      return isCount(v.epoch, 1) && isCount(v.sequence, 1) && isCount(v.baseRevision) && isId(v.batchId) && (v.utteranceId === undefined || isId(v.utteranceId)) && isScope(v.scope) && Array.isArray(v.commands)
        ? (v as BoardRequest)
        : null;
    case "stop":
      return isCount(v.epoch, 1) && isScope(v.scope) ? (v as BoardRequest) : null;
    case "release":
      return isCount(v.epoch, 1) && isId(v.batchId) && isScope(v.scope) ? (v as BoardRequest) : null;
    case "cancel":
      return isCount(v.epoch, 1) && isId(v.cancelId) && isCount(v.through) && isScope(v.scope) ? (v as BoardRequest) : null;
    case "status":
      return isCount(v.since) && (v.part === undefined || isCount(v.part)) ? (v as BoardRequest) : null;
    case "reset":
      return isId(v.senderId) && isCount(v.epoch, 1) && isCount(v.observedEpoch) && (v.scope === null || isScope(v.scope)) && isObject(v.snapshot) && Array.isArray(v.snapshot.events) && v.snapshot.events.every(isEvent)
        ? (v as BoardRequest)
        : null;
    default:
      return null;
  }
}

// ---------- receiver ----------

export interface Released {
  batchId: string;
  utteranceId?: string;
  drawn: TimedPath[];
  erased: string[];
  notices: Notice[];
}

interface Staged {
  scope: SpeechScope;
  batchId: string;
  sequence: number;
  utteranceId?: string;
  commands: unknown[];
  /** The core's answer on the board as planned: shown, plus the batches staged before this one. */
  result: Extract<ApplyResult, { ok: true }>;
}

export interface BoardReceiver {
  /** The request handler (the RPC handler). The request is untrusted: it is checked before anything changes. */
  handle(request: unknown): BoardResponse;
  /** The board the child sees. */
  scene(): Scene;
  snapshot(): BoardSnapshot;
  /** Accepted batches not shown yet, oldest first. */
  staged(): { batchId: string; utteranceId?: string }[];
  scope(): SpeechScope | null;
  /** Shows this staged batch and every one staged before it, in order, and returns what to draw. */
  release(batchId: string, scope: SpeechScope): Released[];
  /** The renderer has drawn this batch: the child has seen it. */
  presented(batchId: string): void;
  /** The child takes the pen: Maya's staged batches are cancelled, and new ones are refused until the pen comes back. */
  takePen(scope: SpeechScope | null): { cancelled: string[] };
  givePen(): void;
  /** A finished stroke of the child's. Only the child holding the pen writes. */
  addInk(ink: Ink): { ok: true; id: string } | { ok: false; reason: string };
  /** The epoch the board is on: the page keeps it across a reload. */
  epoch(): number;
}

type SceneOptions = { page?: PageSize; glyphs?: GlyphSet };

/**
 * `epoch`: the epoch the page held before a reload (kept in the page's session storage, #329). The board starts empty and
 * is restored from the sender's log; the kept epoch keeps a sender that was replaced before the reload from taking it.
 */
export function createBoardReceiver(options: { sessionId: string; epoch?: number; snapshot?: BoardSnapshot; clock?: () => number } & SceneOptions): BoardReceiver {
  let epoch = options.epoch ?? 0;
  let currentScope: SpeechScope | null = null;
  /** The sender whose reset started this epoch: its retry of that reset changes nothing. */
  let epochSender: string | null = null;
  let revision = 0;
  const restored = options.snapshot ? restoreScene(options.snapshot, options) : createScene(options);
  if (!restored) throw new Error("The saved board does not replay.");
  let shown: Scene = restored;
  let staged: Staged[] = [];
  let log: BoardEvent[] = structuredClone(options.snapshot?.events ?? []);
  let states = new Map<string, BatchState>();
  /** Every batch id this epoch decided, with its sequence and the core's refusal when it refused it. */
  let decided = new Map<string, { sequence: number; scope: SpeechScope; refusal?: Refusal }>();
  /** Every cancel this epoch carried out, with where its event is in the log (null: it found nothing to cancel). */
  let cancels = new Map<string, { through: number; scope: SpeechScope; at: number | null }>();
  let nextSequence = 1;
  const stoppedUtterances = new Set<string>();
  let pen: PenHolder = "maya";
  /** The parts of each large log event, cut once: an event in the log never changes. */
  const partsOf = new WeakMap<BoardEvent, { parts: string[]; digest: string }>();

  const append = (event: BoardEvent) => log.push(options.clock ? { ...event, at: options.clock() } : event);
  const status = (): ReceiverStatus => ({ epoch, scope: currentScope ? { ...currentScope } : null, revision, pen, logLength: log.length });
  const planned = () => staged.at(-1)?.result.scene ?? shown;
  const clip = (text: string) => (text.length > MAX_REASON ? `${text.slice(0, MAX_REASON - 1)}…` : text);
  const fail = (code: ProtocolCode, reason: string, extra: { batchId?: string; refusal?: Refusal } = {}): BoardResponse => {
    const answer: BoardResponse = { ok: false, code, reason: clip(reason), ...extra, ...status() };
    if (!extra.refusal) return answer;
    // The targets the core offers instead may be many: the answer keeps as many as fit, in the core's order.
    const refusal = { ...extra.refusal, reason: clip(extra.refusal.reason) };
    const valid = [...(refusal.valid ?? [])];
    const fits = () => byteSize({ ...answer, refusal: { ...refusal, valid } }) <= MAX_BATCH_BYTES;
    while (valid.length > 0 && !fits()) valid.length = Math.floor(valid.length / 2);
    return { ...answer, refusal: refusal.valid ? { ...refusal, valid } : refusal };
  };

  function apply(req: Extract<BoardRequest, { type: "apply" }>): BoardResponse {
    if (req.epoch !== epoch) return fail("stale_epoch", `This batch is from epoch ${req.epoch}; the board is on epoch ${epoch}.`, { batchId: req.batchId });
    const before = decided.get(req.batchId);
    if (before) {
      if (!sameScope(before.scope, req.scope)) return fail("invalid_request", "The batch belongs to another speech generation.");
      if (before.sequence !== req.sequence) return fail("duplicate_batch", `Batch "${req.batchId}" was already sent as number ${before.sequence}.`, { batchId: req.batchId });
      // A retry: the answer to the first try was lost. Answer again with where the batch is now; never apply it twice.
      if (before.refusal) return fail("refused", before.refusal.reason, { batchId: req.batchId, refusal: before.refusal });
      return { ok: true, type: "apply", batchId: req.batchId, state: states.get(req.batchId)!, ...status() };
    }
    if (req.sequence !== nextSequence) return fail("out_of_order", `The next batch is number ${nextSequence}, not ${req.sequence}.`, { batchId: req.batchId });
    if (pen === "child") return fail("pen_with_child", "The child has the pen: Maya waits until it comes back.", { batchId: req.batchId });
    if (req.baseRevision !== revision)
      return fail("stale_revision", `The board changed after this batch was planned (revision ${revision}, not ${req.baseRevision}): read it again.`, { batchId: req.batchId });
    if (currentScope && !sameScope(currentScope, req.scope) && (req.scope.generation <= currentScope.generation || staged.length > 0))
      return fail("invalid_request", "Cancel the previous speech plan before staging its replacement.");
    currentScope = { ...req.scope };
    nextSequence++;
    if (stoppedUtterances.has(scopeKey(req.scope))) {
      decided.set(req.batchId, { sequence: req.sequence, scope: req.scope });
      states.set(req.batchId, "cancelled");
      append({ kind: "cancelled", batchIds: [req.batchId] });
      revision++;
      return { ok: true, type: "apply", batchId: req.batchId, state: "cancelled", ...status() };
    }
    const result = applyBatch(planned(), { transactionId: req.batchId, commands: req.commands });
    if (!result.ok) {
      decided.set(req.batchId, { sequence: req.sequence, scope: req.scope, refusal: result.refusal });
      return fail("refused", result.refusal.reason, { batchId: req.batchId, refusal: result.refusal });
    }
    decided.set(req.batchId, { sequence: req.sequence, scope: req.scope });
    staged.push({ batchId: req.batchId, sequence: req.sequence, utteranceId: req.utteranceId, scope: req.scope, commands: req.commands, result });
    states.set(req.batchId, "accepted");
    revision++;
    return { ok: true, type: "apply", batchId: req.batchId, state: "accepted", ...status() };
  }

  /**
   * Drops the staged batches numbered up to `through` (all of them by default): the child never sees them. A retry of
   * one gets "cancelled" and changes nothing. Returns where the `cancelled` event is in the log, or null.
   *
   * Each staged batch's result was worked out on the batches staged before it. The batches kept after a partial cancel
   * are worked out again on the shown board, in order, so a release never shows a cancelled command. The first one the
   * core now refuses (it built on a cancelled batch) is dropped with every batch after it, since those were planned on
   * it: they go in the same `cancelled` event, so the sender reads them as cancelled too.
   */
  function cancelStaged(scope: SpeechScope, through = Infinity, cancelId?: string): number | null {
    if (!sameScope(currentScope, scope)) return null;
    const dropped = staged.filter((s) => sameScope(s.scope, scope) && s.sequence <= through);
    if (dropped.length === 0) return null;
    const kept: Staged[] = [];
    let scene = shown;
    let rest = staged.filter((s) => s.sequence > through);
    while (rest.length > 0) {
      const [next, ...after] = rest;
      const result = applyBatch(scene, { transactionId: next.batchId, commands: next.commands });
      if (!result.ok) break;
      kept.push({ ...next, result });
      scene = result.scene;
      rest = after;
    }
    const cancelled = [...dropped, ...rest].map((s) => s.batchId);
    for (const id of cancelled) states.set(id, "cancelled");
    staged = kept;
    append(cancelId === undefined ? { kind: "cancelled", batchIds: cancelled } : { kind: "cancelled", batchIds: cancelled, cancelId });
    revision++;
    return log.length - 1;
  }

  function cancel(req: Extract<BoardRequest, { type: "cancel" }>): BoardResponse {
    if (req.epoch !== epoch) return fail("stale_epoch", `This cancel is from epoch ${req.epoch}; the board is on epoch ${epoch}.`);
    if (!sameScope(currentScope, req.scope)) return fail("invalid_request", "The cancellation belongs to another speech generation.");
    let done = cancels.get(req.cancelId);
    if (done && (done.through !== req.through || !sameScope(done.scope, req.scope))) return fail("invalid_request", `Cancel "${req.cancelId}" belongs to another request.`);
    // A cancel seen before (a retry, or a late copy): the same answer, and nothing changes.
    if (!done) {
      done = { through: req.through, scope: { ...req.scope }, at: cancelStaged(req.scope, req.through, req.cancelId) };
      cancels.set(req.cancelId, done);
    }
    return { ok: true, type: "cancel", cancelId: req.cancelId, at: done.at, ...status() };
  }

  function reset(req: Extract<BoardRequest, { type: "reset" }>): BoardResponse {
    // The same sender again on this epoch: a retry of the reset that started it, after a lost answer.
    if (req.epoch === epoch && req.senderId === epochSender) return { ok: true, type: "reset", ...status() };
    if (req.epoch <= epoch) return fail("stale_epoch", `The board is already on epoch ${epoch}.`);
    // Another sender claimed the board after this one read it.
    if (req.observedEpoch !== epoch) return fail("stale_epoch", `The board moved to epoch ${epoch} after epoch ${req.observedEpoch} was read.`);
    if (currentScope ? !req.scope || !sameScope(currentScope, req.scope) : req.scope !== null)
      return fail("invalid_request", "The reconnect observed another speech plan.");
    const events = req.snapshot.events;
    if (events.length < log.length) return fail("behind", `The board log has ${log.length} events; this reset has ${events.length}.`);
    // The reset may only add to the log: every event the receiver holds must be in it, unchanged and in its place.
    const differs = log.findIndex((e, i) => canonical(e) !== canonical(events[i]));
    if (differs >= 0) return fail("conflict", `Event ${differs} of this reset differs from the board log.`);
    const scene = restoreScene(req.snapshot, options);
    if (!scene) return fail("invalid_request", "The snapshot does not replay on an empty board.");
    epoch = req.epoch;
    epochSender = req.senderId;
    revision = 0;
    shown = scene;
    log = [...log, ...events.slice(log.length)];
    // A reconnect retires speech that did not become visible. Preserve that outcome in the receiver log.
    if (req.scope) cancelStaged(req.scope);
    currentScope = null;
    staged = [];
    states = new Map();
    decided = new Map();
    cancels = new Map();
    nextSequence = 1;
    stoppedUtterances.clear();
    // The pen stays where it is: the child may be writing through a blip on the line.
    return { ok: true, type: "reset", ...status() };
  }

  /**
   * Log events from `since`, as many whole ones as fit in one answer; when the event at `since` is too large for one
   * answer, its part number `part` instead. The sender reads on to `logLength`.
   */
  function logPage(since: number, part: number): BoardResponse {
    const out: BoardEvent[] = [];
    let bytes = STATUS_FRAME_BYTES;
    for (const e of log.slice(since)) {
      const size = byteSize(e);
      bytes += size + (out.length > 0 ? 1 : 0);
      if (size > WHOLE_EVENT_BYTES || bytes > MAX_BATCH_BYTES) break;
      out.push(e);
    }
    if (out.length > 0 || since >= log.length) return part === 0 ? { ok: true, type: "status", log: out, ...status() } : fail("invalid_request", `Event ${since} does not travel in parts.`);
    const event = log[since];
    let cut = partsOf.get(event);
    if (!cut) {
      const text = JSON.stringify(event);
      cut = { parts: eventParts(text), digest: digest(text) };
      partsOf.set(event, cut);
    }
    if (part >= cut.parts.length) return fail("invalid_request", `Event ${since} has ${cut.parts.length} parts.`);
    return { ok: true, type: "status", log: [], part: { index: part, count: cut.parts.length, digest: cut.digest, data: cut.parts[part] }, ...status() };
  }

  const release = (batchId: string, scope: SpeechScope): Released[] => {
    if (!isScope(scope) || !sameScope(currentScope, scope) || !sameScope(decided.get(batchId)?.scope, scope)) return [];
    const upTo = staged.findIndex((s) => s.batchId === batchId);
    if (upTo < 0) return [];
    const out: Released[] = [];
    for (const s of staged.splice(0, upTo + 1)) {
      shown = s.result.scene;
      states.set(s.batchId, "shown");
      append({ kind: "batch", batchId: s.batchId, commands: s.commands });
      out.push({ batchId: s.batchId, utteranceId: s.utteranceId, drawn: s.result.drawn, erased: s.result.erased, notices: s.result.notices });
    }
    return out;
  };

  return {
    handle(raw) {
      const req = parseRequest(raw);
      if (!req) return fail("invalid_request", "The request is not a board request.");
      if (req.sessionId !== options.sessionId) return fail("wrong_session", "This board belongs to another call.");
      switch (req.type) {
        case "apply":
          return byteSize(raw) > MAX_BATCH_BYTES ? fail("too_large", `A batch takes at most ${MAX_BATCH_BYTES} bytes.`, { batchId: req.batchId }) : apply(req);
        case "reset":
          return reset(req);
        case "stop": {
          if (req.epoch !== epoch) return fail("stale_epoch", "The interruption belongs to an older board connection.");
          // A stop may overtake the first apply. It may never retire a newer plan.
          if (currentScope && !sameScope(currentScope, req.scope) && (req.scope.generation <= currentScope.generation || staged.length > 0))
            return fail("invalid_request", "The interruption belongs to another speech generation.");
          currentScope = { ...req.scope };
          stoppedUtterances.add(scopeKey(req.scope));
          cancelStaged(req.scope);
          return { ok: true, type: "stop", ...status() };
        }
        case "release": {
          if (req.epoch !== epoch) return fail("stale_epoch", "The speech belongs to an older board connection.");
          if (!sameScope(currentScope, req.scope) || !sameScope(decided.get(req.batchId)?.scope, req.scope)) return fail("invalid_request", "The release belongs to another speech generation.");
          const state = states.get(req.batchId);
          if (!state) return fail("invalid_request", "The speech names an unknown batch.");
          release(req.batchId, req.scope);
          return { ok: true, type: "release", batchId: req.batchId, state: states.get(req.batchId)!, ...status() };
        }
        case "cancel":
          return cancel(req);
        case "status":
          return logPage(req.since, req.part ?? 0);
      }
    },
    scene: () => shown,
    snapshot: () => structuredClone({ events: log }),
    epoch: () => epoch,
    scope: () => currentScope ? { ...currentScope } : null,
    staged: () => staged.map(({ batchId, utteranceId }) => ({ batchId, utteranceId })),
    release,
    presented(batchId) {
      if (states.get(batchId) !== "shown") return;
      states.set(batchId, "presented");
      append({ kind: "presented", batchId });
    },
    takePen(scope) {
      if (currentScope ? !scope || !isScope(scope) || !sameScope(currentScope, scope) : scope !== null) return { cancelled: [] };
      if (pen === "child") return { cancelled: [] };
      const at = scope ? cancelStaged(scope) : null;
      pen = "child";
      revision++;
      const event = at === null ? undefined : log[at];
      return { cancelled: event?.kind === "cancelled" ? event.batchIds : [] };
    },
    givePen() {
      if (pen === "maya") return;
      pen = "maya";
      revision++;
    },
    addInk(ink) {
      if (pen !== "child") return { ok: false, reason: "Take the pen first." };
      // The log carries the stroke to the sender: one it would not read back would stop every later read.
      const event: BoardEvent = { kind: "ink", page: ink.page, stroke: ink.stroke, boardWidth: ink.boardWidth };
      if (!isEvent(event)) return { ok: false, reason: "The stroke is not a stroke the board can keep." };
      try {
        const added = addChildInk(shown, ink);
        shown = added.scene;
        append(event);
        revision++;
        return { ok: true, id: added.id };
      } catch (e) {
        return { ok: false, reason: e instanceof Error ? e.message : "The stroke is not on the board." };
      }
    },
  };
}

/** The board a snapshot describes, or null when it does not replay. */
export function restoreScene(snapshot: BoardSnapshot, options: SceneOptions = {}): Scene | null {
  let scene = createScene(options);
  for (const e of snapshot.events) {
    if (e.kind === "batch") {
      const r = applyBatch(scene, { transactionId: e.batchId, commands: e.commands });
      if (!r.ok) return null;
      scene = r.scene;
    } else if (e.kind === "ink") {
      try {
        scene = addChildInk(scene, e).scene;
      } catch {
        return null;
      }
    }
  }
  return scene;
}

// ---------- sender ----------

/**
 * `unreachable`: no answer came after the retries; the sender needs a new `connect`. `superseded`: another sender has
 * started a newer epoch on this board; this one stops.
 */
export type SenderFailure = { ok: false; code: ProtocolCode | "unreachable" | "superseded"; reason: string; refusal?: Refusal };
export type SendResult = { ok: true; batchId: string; state: BatchState } | SenderFailure;

export interface BoardSender {
  /**
   * Starts a new epoch on the receiver with the board log: first, then after every lost line. It reads what the
   * receiver logged since the last sync, when the receiver still answers, so nothing the child saw is lost, claims the
   * epoch after the one it read, and reads the whole log again before Maya plans. Batches staged and not shown are
   * dropped: the speech they belonged to is over. `superseded`: another sender claimed the board; this one stops.
   */
  connect(): Promise<{ ok: true } | SenderFailure>;
  /** Talks through another line from now on, for a reconnect. Call `connect` next. */
  useTransport(transport: BoardTransport): void;
  /** The board log as far as the sender has read it: what a reconnect restores, and what the call stores. */
  snapshot(): BoardSnapshot;
  /**
   * Sends one batch, after every request before it. The batch id is its transaction id. The batch is planned on the
   * board as last read (connect, sync, cancel) plus Maya's own accepted batches: when the child changed the board since,
   * it is refused with `stale_revision` until Maya reads the board again with `sync`.
   */
  send(batch: Batch, options: { utteranceId?: string; scope: SpeechScope }): Promise<SendResult>;
  /** Releases a batch once its speech cue has played. Retries do not duplicate shown work. */
  release(batchId: string, scope: SpeechScope): Promise<SendResult>;
  /** Priority interruption, including requests still in flight. Does not wait for the serial request queue. */
  interrupt(scope: SpeechScope): Promise<{ ok: true } | SenderFailure>;
  /** Drops staged batches and reads the resulting log. Shown strokes stay. */
  cancel(scope: SpeechScope): Promise<{ ok: true; cancelled: string[] } | SenderFailure>;
  /** Reads the board log since the last sync: what the child saw and wrote, and where each batch is. */
  sync(): Promise<boolean>;
  batchState(batchId: string): BatchState | undefined;
  /** Who held the pen at the receiver's last answer. */
  pen(): PenHolder;
  epoch(): number;
}

const UNREACHABLE = { ok: false, code: "unreachable", reason: "The child's board did not answer." } as const;
const SUPERSEDED = { ok: false, code: "superseded", reason: "Another sender has the board now." } as const;
const WRONG_ANSWER = { ok: false, code: "invalid_request", reason: "The receiver answered another request." } as const;
/** How often a connect reads on and tries again when the board log grew while it was under way. */
const MAX_CONNECT_TRIES = 5;

type StatusAnswer = Extract<BoardResponse, { ok: true; type: "status" }>;

/**
 * `senderId`: unique to this sender process (a restarted process takes a new one, #329). The receiver takes a reset from
 * the same id on its own epoch as a retry, so two processes under one id could both hold the board.
 */
export function createBoardSender(options: { sessionId: string; senderId: string; transport: BoardTransport; retries?: number; snapshot?: BoardSnapshot }): BoardSender {
  const { sessionId, senderId } = options;
  let transport = options.transport;
  const retries = options.retries ?? 2;
  /** The epoch this sender has the board on. */
  let epoch = 0;
  /** The newest epoch this sender has claimed, with or without an answer: a newer one on the board is another sender's. */
  let claimed = 0;
  /** The reset sent and not answered yet: the epoch it claims and the epoch it read. A later connect sends it again. */
  let pending: { epoch: number; observedEpoch: number } | null = null;
  let connected = false;
  /** Another sender took the board: this one never acts again. */
  let stopped = false;
  /** The sequence number of the next new batch. */
  let sequence = 1;
  let cancels = 0;
  /** The revision of the board Maya plans on. Only complete reads and her own accepted batches move it. */
  let revision = 0;
  let pen: PenHolder = "maya";
  const log: BoardEvent[] = [];
  const states = new Map<string, BatchState>();

  function record(events: BoardEvent[]) {
    for (const e of events) {
      log.push(e);
      if (e.kind === "batch") states.set(e.batchId, "shown");
      else if (e.kind === "presented") states.set(e.batchId, "presented");
      else if (e.kind === "cancelled") for (const id of e.batchIds) states.set(id, "cancelled");
    }
  }
  record(options.snapshot?.events ?? []);

  /** One operation at a time: the next request goes only after the answer to the one before it. */
  let queue: Promise<unknown> = Promise.resolve();
  function serial<T>(op: () => Promise<T>): Promise<T> {
    const run = queue.then(op);
    queue = run.catch(() => undefined);
    return run;
  }

  /** Sends one request, and the same request again when its answer is lost: every request is safe to repeat. */
  async function request(req: BoardRequest): Promise<BoardResponse | null> {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const r = await transport.call(req);
        pen = r.pen;
        return r;
      } catch {
        // Lost or timed out: the receiver may have acted, or may still get it later. The same request again is safe.
      }
    }
    connected = false;
    return null;
  }

  function supersede() {
    connected = false;
    stopped = true;
    return SUPERSEDED;
  }

  /**
   * Reads the receiver's log from where the sender's ends, page by page, and puts the parts of a large event together.
   * Returns the last answer when the sender has read the whole log, else null. Only a complete read of the epoch the
   * sender has moves the revision Maya plans on.
   */
  async function pull(): Promise<StatusAnswer | null> {
    let parts: string[] = [];
    let partDigest = "";
    for (;;) {
      const r = await request(parts.length > 0 ? { type: "status", sessionId, since: log.length, part: parts.length } : { type: "status", sessionId, since: log.length });
      if (!r || !r.ok || r.type !== "status") return null;
      if (r.part) {
        const p = r.part;
        if (p.index !== parts.length || p.index >= p.count || (parts.length > 0 && p.digest !== partDigest)) return null;
        partDigest = p.digest;
        parts.push(p.data);
        if (parts.length < p.count) continue;
        const text = parts.join("");
        parts = [];
        if (digest(text) !== partDigest) return null;
        let event: unknown;
        try {
          event = JSON.parse(text);
        } catch {
          return null;
        }
        if (!isEvent(event)) return null;
        record([event]);
      } else {
        if (parts.length > 0 || !r.log.every(isEvent)) return null;
        // No progress on a log that is longer than the sender's: never loop.
        if (r.log.length === 0 && log.length < r.logLength) return null;
        record(r.log);
      }
      if (log.length >= r.logLength) {
        if (r.epoch === epoch) revision = r.revision;
        return r;
      }
    }
  }

  async function connect(): Promise<{ ok: true } | SenderFailure> {
    if (stopped) return SUPERSEDED;
    connected = false;
    for (let tries = 0; tries < MAX_CONNECT_TRIES; tries++) {
      // A receiver that still answers holds the log from where the sender's ends; a fresh one answers with nothing.
      const read = await pull();
      if (!read) return UNREACHABLE;
      const seen = read.epoch;
      // The reset sent before still fits what the board shows: send it again. Else claim the epoch after the one read.
      if (!pending || (seen !== pending.epoch && seen !== pending.observedEpoch)) {
        // A sender that has claimed the board and finds a newer epoch was replaced: it never takes the board back.
        if (claimed > 0 && seen > claimed) return supersede();
        pending = { epoch: Math.max(claimed, seen) + 1, observedEpoch: seen };
        claimed = pending.epoch;
      }
      const r = await request({ type: "reset", sessionId, senderId, epoch: pending.epoch, observedEpoch: pending.observedEpoch, scope: read.scope, snapshot: { events: [...log] } });
      if (!r) return UNREACHABLE;
      if (!r.ok) {
        if (r.code === "behind") continue;
        // Another sender claimed the board after this one read it, or before its retry.
        if (r.code === "stale_epoch") return supersede();
        return { ok: false, code: r.code, reason: r.reason };
      }
      if (r.type !== "reset") return WRONG_ANSWER;
      pending = null;
      for (const [id, state] of states) if (state === "accepted") states.set(id, "cancelled");
      epoch = r.epoch;
      sequence = 1;
      // The child may have written after the reset acted (its answer may have come on a retry): Maya plans only on a
      // board she has read to the end.
      const synced = await pull();
      if (!synced) return UNREACHABLE;
      if (synced.epoch > epoch) return supersede();
      if (synced.epoch !== epoch) continue;
      connected = true;
      return { ok: true };
    }
    return { ok: false, code: "behind", reason: "The board kept changing while the connect was under way." };
  }

  async function send(batch: Batch, opts: { utteranceId?: string; scope: SpeechScope }): Promise<SendResult> {
    if (stopped) return SUPERSEDED;
    if (!connected) return UNREACHABLE;
    const req: BoardRequest = { type: "apply", sessionId, epoch, sequence, baseRevision: revision, batchId: batch.transactionId, utteranceId: opts.utteranceId ?? opts.scope.utteranceId, scope: opts.scope, commands: [...batch.commands] };
    if (byteSize(req) > MAX_BATCH_BYTES) return { ok: false, code: "too_large", reason: `A batch takes at most ${MAX_BATCH_BYTES} bytes: split it.` };
    const r = await request(req);
    if (!r) return UNREACHABLE;
    // The receiver decided this batch: the next one gets the next number.
    if (r.ok || r.code === "refused") sequence++;
    if (!r.ok) return { ok: false, code: r.code, reason: r.reason, refusal: r.refusal };
    if (r.type !== "apply") return WRONG_ANSWER;
    // Still staged, nothing else can have changed the board since it was accepted. A retry that finds it shown or
    // cancelled may carry later changes of the child's: Maya reads those with `sync`.
    if (r.state === "accepted") revision = r.revision;
    // A retry may answer with a later state the sender has read already: never move a batch back.
    if (r.state !== "accepted" || !states.has(r.batchId)) states.set(r.batchId, r.state);
    return { ok: true, batchId: r.batchId, state: r.state };
  }

  async function cancel(scope: SpeechScope): Promise<{ ok: true; cancelled: string[] } | SenderFailure> {
    if (stopped) return SUPERSEDED;
    if (!connected) return UNREACHABLE;
    // The batches sent so far, under one id: a late copy of this cancel never touches a batch sent after it.
    const cancelId = `cancel-${++cancels}`;
    const r = await request({ type: "cancel", sessionId, epoch, cancelId, through: sequence - 1, scope });
    if (!r) return UNREACHABLE;
    if (!r.ok) return { ok: false, code: r.code, reason: r.reason };
    if (r.type !== "cancel" || r.cancelId !== cancelId) return WRONG_ANSWER;
    // Maya plans the next step on what the child saw: read it now. The log holds what this cancel dropped.
    if (!(await pull())) return UNREACHABLE;
    if (r.at === null) return { ok: true, cancelled: [] };
    const event = log[r.at];
    if (event?.kind !== "cancelled" || event.cancelId !== cancelId) return WRONG_ANSWER;
    return { ok: true, cancelled: [...event.batchIds] };
  }

  return {
    connect: () => serial(connect),
    send: (batch, opts) => serial(() => send(batch, opts)),
    interrupt: async (scope) => {
      if (stopped) return SUPERSEDED;
      if (!connected) return UNREACHABLE;
      const r = await request({ type: "stop", sessionId, epoch, scope });
      if (!r) return UNREACHABLE;
      if (!r.ok) return { ok: false, code: r.code, reason: r.reason };
      return r.type === "stop" ? { ok: true } : WRONG_ANSWER;
    },
    release: (batchId, scope) => serial(async () => {
      if (stopped) return SUPERSEDED;
      if (!connected) return UNREACHABLE;
      const r = await request({ type: "release", sessionId, epoch, batchId, scope });
      if (!r) return UNREACHABLE;
      if (!r.ok) return { ok: false, code: r.code, reason: r.reason };
      if (r.type !== "release" || r.batchId !== batchId) return WRONG_ANSWER;
      if (!(await pull())) return UNREACHABLE;
      return { ok: true, batchId, state: r.state };
    }),
    cancel: scope => serial(() => cancel(scope)),
    sync: () => serial(async () => (await pull()) !== null),
    useTransport(next) {
      transport = next;
    },
    snapshot: () => ({ events: [...log] }),
    batchState: (batchId) => states.get(batchId),
    pen: () => pen,
    epoch: () => epoch,
  };
}
