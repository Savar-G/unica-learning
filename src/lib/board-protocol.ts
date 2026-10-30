// Maya's board batch protocol (#328, spec #297): how board batches travel from Maya's side (the sender, next to the
// session) to the child's browser (the receiver, next to the renderer). Pure TypeScript: no React, network, clock or
// randomness. The transport is a seam (LiveKit RPC later, #329; the in-memory transport in tests).
//
// The rules (LiveKit research, sections 3 and 4):
// - Serial: the sender sends one request at a time and waits for its answer.
// - Every batch has an id (its transaction id), a sequence number in its epoch, and the board revision it was planned on.
// - The receiver remembers what it decided for each batch id, so a retry after a lost answer never applies a batch twice.
// - Accepted is not shown: the receiver stages a batch, shows it on release (when Maya's speech reaches it) and logs it
//   presented when the child has seen it drawn. Unshown batches are cancelled on an interruption.
// - A connect starts a new epoch: the receiver drops what it staged, refuses anything from an older epoch, and rebuilds
//   the board from the sender's copy of the board log. The log only grows: a connect never takes back what was shown.
import { addChildInk, applyBatch, createScene, type ApplyResult, type Batch, type GlyphSet, type Notice, type PageSize, type Refusal, type Scene, type TimedPath } from "@/lib/board";
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
export type BoardEvent =
  | { kind: "batch"; batchId: string; commands: unknown[] }
  | ({ kind: "ink" } & Ink)
  | { kind: "presented"; batchId: string }
  | { kind: "cancelled"; batchIds: string[] };

/** The board log. Replaying it on an empty board gives the same board: the core is deterministic. */
export interface BoardSnapshot {
  events: BoardEvent[];
}

/** Where a batch is on the child's side. */
export type BatchState = "accepted" | "shown" | "presented" | "cancelled";

/** Who may write on the board now. The child takes the pen with "Take the pen" and gives it back. */
export type PenHolder = "maya" | "child";

export type BoardRequest =
  | { type: "apply"; sessionId: string; epoch: number; sequence: number; baseRevision: number; batchId: string; utteranceId?: string; commands: unknown[] }
  | { type: "cancel"; sessionId: string; epoch: number }
  | { type: "status"; sessionId: string; since: number }
  | { type: "reset"; sessionId: string; senderId: string; epoch: number; snapshot: BoardSnapshot };

/** The receiver's state, carried by every answer. */
export interface ReceiverStatus {
  epoch: number;
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
  | "behind";

export type BoardResponse =
  | ({ ok: true; type: "apply"; batchId: string; state: BatchState } & ReceiverStatus)
  | ({ ok: true; type: "cancel"; cancelled: string[] } & ReceiverStatus)
  | ({ ok: true; type: "status"; log: BoardEvent[] } & ReceiverStatus)
  | ({ ok: true; type: "reset" } & ReceiverStatus)
  | ({ ok: false; code: ProtocolCode; reason: string; batchId?: string; refusal?: Refusal } & ReceiverStatus);

/** The seam the sender talks through. A rejected call may still have reached the receiver and acted. */
export interface BoardTransport {
  call(request: BoardRequest): Promise<BoardResponse>;
}

/** The most UTF-8 bytes an apply request, or the log in one status answer, may take: well under LiveKit's 15 KiB. */
export const MAX_BATCH_BYTES = 8192;

function byteSize(value: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).length;
  } catch {
    return Infinity;
  }
}

// ---------- request checks ----------

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isCount = (v: unknown, min = 0): v is number => Number.isSafeInteger(v) && (v as number) >= min;
const isId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 64;
const isPoint = (v: unknown) => Array.isArray(v) && v.length === 2 && v.every((n) => Number.isFinite(n));
const isStroke = (v: unknown) => isObject(v) && typeof v.erase === "boolean" && Number.isFinite(v.w) && Array.isArray(v.pts) && v.pts.every(isPoint);

function isEvent(v: unknown): v is BoardEvent {
  if (!isObject(v)) return false;
  switch (v.kind) {
    case "batch":
      return isId(v.batchId) && Array.isArray(v.commands);
    case "ink":
      return isCount(v.page, 1) && Number.isFinite(v.boardWidth) && isStroke(v.stroke);
    case "presented":
      return isId(v.batchId);
    case "cancelled":
      return Array.isArray(v.batchIds) && v.batchIds.every(isId);
    default:
      return false;
  }
}

/** The request's shape, checked: the board core checks the commands themselves. */
function parseRequest(v: unknown): BoardRequest | null {
  if (!isObject(v) || typeof v.sessionId !== "string") return null;
  switch (v.type) {
    case "apply":
      return isCount(v.epoch, 1) && isCount(v.sequence, 1) && isCount(v.baseRevision) && isId(v.batchId) && (v.utteranceId === undefined || isId(v.utteranceId)) && Array.isArray(v.commands)
        ? (v as BoardRequest)
        : null;
    case "cancel":
      return isCount(v.epoch, 1) ? (v as BoardRequest) : null;
    case "status":
      return isCount(v.since) ? (v as BoardRequest) : null;
    case "reset":
      return isId(v.senderId) && isCount(v.epoch, 1) && isObject(v.snapshot) && Array.isArray(v.snapshot.events) && v.snapshot.events.every(isEvent) ? (v as BoardRequest) : null;
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
  batchId: string;
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
  /** Accepted batches not shown yet, oldest first. */
  staged(): { batchId: string; utteranceId?: string }[];
  /** Shows this staged batch and every one staged before it, in order, and returns what to draw. */
  release(batchId: string): Released[];
  /** The renderer has drawn this batch: the child has seen it. */
  presented(batchId: string): void;
  /** The child takes the pen: Maya's staged batches are cancelled, and new ones are refused until the pen comes back. */
  takePen(): { cancelled: string[] };
  givePen(): void;
  /** A finished stroke of the child's. Only the child holding the pen writes. */
  addInk(ink: Ink): { ok: true; id: string } | { ok: false; reason: string };
}

type SceneOptions = { page?: PageSize; glyphs?: GlyphSet };

export function createBoardReceiver(options: { sessionId: string } & SceneOptions): BoardReceiver {
  let epoch = 0;
  /** The sender whose reset started this epoch: its retry of that reset changes nothing. */
  let epochSender: string | null = null;
  let revision = 0;
  let shown = createScene(options);
  let staged: Staged[] = [];
  let log: BoardEvent[] = [];
  let states = new Map<string, BatchState>();
  /** Every batch id this epoch decided, with its sequence and the core's refusal when it refused it. */
  let decided = new Map<string, { sequence: number; refusal?: Refusal }>();
  let nextSequence = 1;
  let pen: PenHolder = "maya";

  const status = (): ReceiverStatus => ({ epoch, revision, pen, logLength: log.length });
  const planned = () => staged.at(-1)?.result.scene ?? shown;
  const fail = (code: ProtocolCode, reason: string, extra: { batchId?: string; refusal?: Refusal } = {}): BoardResponse => ({ ok: false, code, reason, ...extra, ...status() });

  function apply(req: Extract<BoardRequest, { type: "apply" }>): BoardResponse {
    if (req.epoch !== epoch) return fail("stale_epoch", `This batch is from epoch ${req.epoch}; the board is on epoch ${epoch}.`, { batchId: req.batchId });
    const before = decided.get(req.batchId);
    if (before) {
      if (before.sequence !== req.sequence) return fail("duplicate_batch", `Batch "${req.batchId}" was already sent as number ${before.sequence}.`, { batchId: req.batchId });
      // A retry: the answer to the first try was lost. Answer again with where the batch is now; never apply it twice.
      if (before.refusal) return fail("refused", before.refusal.reason, { batchId: req.batchId, refusal: before.refusal });
      return { ok: true, type: "apply", batchId: req.batchId, state: states.get(req.batchId)!, ...status() };
    }
    if (req.sequence !== nextSequence) return fail("out_of_order", `The next batch is number ${nextSequence}, not ${req.sequence}.`, { batchId: req.batchId });
    if (pen === "child") return fail("pen_with_child", "The child has the pen: Maya waits until it comes back.", { batchId: req.batchId });
    if (req.baseRevision !== revision)
      return fail("stale_revision", `The board changed after this batch was planned (revision ${revision}, not ${req.baseRevision}): read it again.`, { batchId: req.batchId });
    nextSequence++;
    const result = applyBatch(planned(), { transactionId: req.batchId, commands: req.commands });
    if (!result.ok) {
      decided.set(req.batchId, { sequence: req.sequence, refusal: result.refusal });
      return fail("refused", result.refusal.reason, { batchId: req.batchId, refusal: result.refusal });
    }
    decided.set(req.batchId, { sequence: req.sequence });
    staged.push({ batchId: req.batchId, utteranceId: req.utteranceId, commands: req.commands, result });
    states.set(req.batchId, "accepted");
    revision++;
    return { ok: true, type: "apply", batchId: req.batchId, state: "accepted", ...status() };
  }

  /** Drops every staged batch: the child never sees them. A retry of one gets "cancelled" and changes nothing. */
  function cancelStaged(): string[] {
    const cancelled = staged.map((s) => s.batchId);
    if (cancelled.length === 0) return cancelled;
    for (const id of cancelled) states.set(id, "cancelled");
    staged = [];
    log.push({ kind: "cancelled", batchIds: cancelled });
    revision++;
    return cancelled;
  }

  function reset(req: Extract<BoardRequest, { type: "reset" }>): BoardResponse {
    // The same sender again on this epoch: a retry of the reset that started it, after a lost answer.
    if (req.epoch === epoch && req.senderId === epochSender) return { ok: true, type: "reset", ...status() };
    if (req.epoch <= epoch) return fail("stale_epoch", `The board is already on epoch ${epoch}.`);
    if (req.snapshot.events.length < log.length) return fail("behind", `The board log has ${log.length} events; this reset has ${req.snapshot.events.length}.`);
    const scene = restoreScene(req.snapshot, options);
    if (!scene) return fail("invalid_request", "The snapshot does not replay on an empty board.");
    epoch = req.epoch;
    epochSender = req.senderId;
    revision = 0;
    shown = scene;
    staged = [];
    log = [...req.snapshot.events];
    states = new Map();
    decided = new Map();
    nextSequence = 1;
    // The pen stays where it is: the child may be writing through a blip on the line.
    return { ok: true, type: "reset", ...status() };
  }

  /** Log events from `since`, as many as fit in one answer (always one at least): the sender reads on to `logLength`. */
  function logPage(since: number): BoardEvent[] {
    const out: BoardEvent[] = [];
    let bytes = 0;
    for (const e of log.slice(since)) {
      bytes += byteSize(e);
      if (out.length > 0 && bytes > MAX_BATCH_BYTES) break;
      out.push(e);
    }
    return out;
  }

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
        case "cancel":
          if (req.epoch !== epoch) return fail("stale_epoch", `This cancel is from epoch ${req.epoch}; the board is on epoch ${epoch}.`);
          return { ok: true, type: "cancel", cancelled: cancelStaged(), ...status() };
        case "status":
          return { ok: true, type: "status", log: logPage(req.since), ...status() };
      }
    },
    scene: () => shown,
    staged: () => staged.map(({ batchId, utteranceId }) => ({ batchId, utteranceId })),
    release(batchId) {
      const upTo = staged.findIndex((s) => s.batchId === batchId);
      if (upTo < 0) return [];
      const out: Released[] = [];
      for (const s of staged.splice(0, upTo + 1)) {
        shown = s.result.scene;
        states.set(s.batchId, "shown");
        log.push({ kind: "batch", batchId: s.batchId, commands: s.commands });
        out.push({ batchId: s.batchId, utteranceId: s.utteranceId, drawn: s.result.drawn, erased: s.result.erased, notices: s.result.notices });
      }
      return out;
    },
    presented(batchId) {
      if (states.get(batchId) !== "shown") return;
      states.set(batchId, "presented");
      log.push({ kind: "presented", batchId });
    },
    takePen() {
      if (pen === "child") return { cancelled: [] };
      const cancelled = cancelStaged();
      pen = "child";
      revision++;
      return { cancelled };
    },
    givePen() {
      if (pen === "maya") return;
      pen = "maya";
      revision++;
    },
    addInk(ink) {
      if (pen !== "child") return { ok: false, reason: "Take the pen first." };
      try {
        const added = addChildInk(shown, ink);
        shown = added.scene;
        log.push({ kind: "ink", page: ink.page, stroke: ink.stroke, boardWidth: ink.boardWidth });
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
   * receiver logged since the last sync, when the receiver still answers, so nothing the child saw is lost. Batches
   * staged and not shown are dropped: the speech they belonged to is over.
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
  send(batch: Batch, options?: { utteranceId?: string }): Promise<SendResult>;
  /** An interruption: the receiver drops every staged batch the child has not seen. Shown strokes stay. Then it syncs. */
  cancel(): Promise<{ ok: true; cancelled: string[] } | SenderFailure>;
  /** Reads the board log since the last sync: what the child saw and wrote, and where each batch is. */
  sync(): Promise<boolean>;
  batchState(batchId: string): BatchState | undefined;
  /** Who held the pen at the receiver's last answer. */
  pen(): PenHolder;
  epoch(): number;
}

const UNREACHABLE = { ok: false, code: "unreachable", reason: "The child's board did not answer." } as const;
const WRONG_ANSWER = { ok: false, code: "invalid_request", reason: "The receiver answered another request." } as const;
/** How often a connect reads on and tries again when the board log grew while it was under way. */
const MAX_CONNECT_TRIES = 5;

export function createBoardSender(options: { sessionId: string; senderId: string; transport: BoardTransport; retries?: number; snapshot?: BoardSnapshot }): BoardSender {
  const { sessionId, senderId } = options;
  let transport = options.transport;
  const retries = options.retries ?? 2;
  let epoch = 0;
  let everConnected = false;
  let connected = false;
  /** The sequence number of the next new batch. */
  let sequence = 1;
  /** The revision of the board Maya plans on. Only reads and her own accepted batches move it. */
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
        // Lost or timed out: the receiver may have acted. The same request again is safe.
      }
    }
    connected = false;
    return null;
  }

  /** Reads the receiver's log from where the sender's ends, page by page. */
  async function pull(): Promise<boolean> {
    for (;;) {
      const r = await request({ type: "status", sessionId, since: log.length });
      if (!r || !r.ok || r.type !== "status") return false;
      record(r.log);
      if (r.epoch === epoch) revision = r.revision;
      if (r.log.length === 0 || log.length >= r.logLength) return true;
    }
  }

  async function connect(): Promise<{ ok: true } | SenderFailure> {
    let next = epoch + 1;
    for (let tries = 0; tries < MAX_CONNECT_TRIES; tries++) {
      // A receiver that still answers holds the log from where the sender's ends; a fresh one answers with nothing.
      await pull();
      const r = await request({ type: "reset", sessionId, senderId, epoch: next, snapshot: { events: [...log] } });
      if (!r) return UNREACHABLE;
      if (r.ok) {
        for (const [id, state] of states) if (state === "accepted") states.set(id, "cancelled");
        epoch = r.epoch;
        revision = r.revision;
        sequence = 1;
        connected = everConnected = true;
        return { ok: true };
      }
      if (r.code === "behind") continue;
      // A new process (this sender never connected) moves past the epoch it finds. A sender that had the board and
      // finds a newer epoch was replaced: it never takes the board back.
      if (r.code === "stale_epoch" && !everConnected) {
        next = r.epoch + 1;
        continue;
      }
      connected = false;
      if (r.code === "stale_epoch") return { ok: false, code: "superseded", reason: "Another sender has the board now." };
      return { ok: false, code: r.code, reason: r.reason };
    }
    return { ok: false, code: "behind", reason: "The board kept changing while the connect was under way." };
  }

  async function send(batch: Batch, opts: { utteranceId?: string }): Promise<SendResult> {
    if (!connected) return UNREACHABLE;
    const req: BoardRequest = { type: "apply", sessionId, epoch, sequence, baseRevision: revision, batchId: batch.transactionId, utteranceId: opts.utteranceId, commands: [...batch.commands] };
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

  async function cancel(): Promise<{ ok: true; cancelled: string[] } | SenderFailure> {
    if (!connected) return UNREACHABLE;
    const r = await request({ type: "cancel", sessionId, epoch });
    if (!r) return UNREACHABLE;
    if (!r.ok) return { ok: false, code: r.code, reason: r.reason };
    if (r.type !== "cancel") return WRONG_ANSWER;
    // Maya plans the next step on what the child saw: read it now.
    await pull();
    return { ok: true, cancelled: r.cancelled };
  }

  return {
    connect: () => serial(connect),
    send: (batch, opts = {}) => serial(() => send(batch, opts)),
    cancel: () => serial(cancel),
    sync: () => serial(pull),
    useTransport(next) {
      transport = next;
    },
    snapshot: () => ({ events: [...log] }),
    batchState: (batchId) => states.get(batchId),
    pen: () => pen,
    epoch: () => epoch,
  };
}
