// Maya's board batch protocol (#328, spec #297): how board batches travel from Maya's side (the sender, next to the
// session) to the child's browser (the receiver, next to the renderer). Pure TypeScript: no React, network, clock or
// randomness. The transport is a seam (LiveKit RPC later, #329; the in-memory transport in tests).
//
// The rules (LiveKit research, sections 3 and 4):
// - Serial: the sender sends one request at a time and waits for its answer.
// - Every batch has an id (its transaction id), a sequence number in its epoch, and the board revision it was planned on.
// - The receiver remembers what it decided for each batch id, so a retry after a lost answer never applies a batch twice.
// - Accepted is not shown: the receiver stages a batch, shows it on release (when Maya's speech reaches it) and reports
//   it presented when the child has seen it drawn. Unshown batches are cancelled on an interruption.
// - A connect starts a new epoch: the receiver drops what it staged, refuses anything from an older epoch, and rebuilds
//   the board from the sender's snapshot of what the child has seen.
import { addChildInk, applyBatch, createScene, type ApplyResult, type Batch, type GlyphSet, type Notice, type PageSize, type Refusal, type Scene, type TimedPath } from "@/lib/board";
import type { Stroke } from "@/lib/whiteboard";

// ---------- wire messages ----------

/** One thing the child has seen on the board, in order: a batch of Maya's that was shown, or a stroke of the child's. */
export type BoardEvent = { kind: "batch"; batchId: string; commands: unknown[] } | { kind: "ink"; page: number; stroke: Stroke; boardWidth: number };

/** What the child has seen, in order. Replaying it on an empty board gives the same board: the core is deterministic. */
export interface BoardSnapshot {
  events: BoardEvent[];
}

/** Where a batch is on the child's side. */
export type BatchState = "accepted" | "shown" | "presented" | "cancelled";

export type BoardRequest =
  | { type: "apply"; sessionId: string; epoch: number; sequence: number; baseRevision: number; batchId: string; utteranceId?: string; commands: unknown[] }
  | { type: "cancel"; sessionId: string; epoch: number }
  | { type: "status"; sessionId: string; since: number }
  | { type: "reset"; sessionId: string; epoch: number; snapshot: BoardSnapshot };

/** Who may write on the board now. The child takes the pen with "Take the pen" and gives it back. */
export type PenHolder = "maya" | "child";

/** The receiver's state, carried by every answer. */
export interface ReceiverStatus {
  epoch: number;
  /** Counts changes to the board Maya plans on: accepted and cancelled batches, the child's ink, the pen. A batch planned
   * on another revision is refused. */
  revision: number;
  pen: PenHolder;
  /** How many events the receiver's board log holds. */
  logLength: number;
}

/**
 * Why a request was not carried out. Only `refused` (the board core refused the batch) is a decision about the batch:
 * the receiver keeps it, and a retry gets the same answer. The others leave the batch id free to send again.
 */
export type ProtocolCode = "invalid_request" | "refused" | "duplicate_batch" | "out_of_order" | "stale_revision" | "stale_epoch" | "pen_with_child" | "wrong_session" | "too_large";

export type BoardResponse =
  | ({ ok: true; type: "apply"; batchId: string; state: BatchState } & ReceiverStatus)
  | ({ ok: true; type: "cancel"; cancelled: string[] } & ReceiverStatus)
  | ({ ok: true; type: "status"; log: BoardEvent[]; batches: { batchId: string; state: BatchState }[] } & ReceiverStatus)
  | ({ ok: true; type: "reset" } & ReceiverStatus)
  | ({ ok: false; code: ProtocolCode; reason: string; batchId?: string; refusal?: Refusal } & ReceiverStatus);

/** The most UTF-8 bytes an apply request may take, well under LiveKit's 15 KiB RPC limit. */
export const MAX_BATCH_BYTES = 8192;
function byteSize(value: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).length;
  } catch {
    return Infinity;
  }
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isCount = (v: unknown, min = 0): v is number => Number.isSafeInteger(v) && (v as number) >= min;
const isId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 64;
const isPoint = (v: unknown) => Array.isArray(v) && v.length === 2 && v.every((n) => Number.isFinite(n));
const isStroke = (v: unknown) => isObject(v) && typeof v.erase === "boolean" && Number.isFinite(v.w) && Array.isArray(v.pts) && v.pts.every(isPoint);

function isEvent(v: unknown): v is BoardEvent {
  if (!isObject(v)) return false;
  if (v.kind === "batch") return isId(v.batchId) && Array.isArray(v.commands);
  return v.kind === "ink" && isCount(v.page, 1) && Number.isFinite(v.boardWidth) && isStroke(v.stroke);
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
      return isCount(v.epoch, 1) && isObject(v.snapshot) && Array.isArray(v.snapshot.events) && v.snapshot.events.every(isEvent) ? (v as BoardRequest) : null;
    default:
      return null;
  }
}

/** The seam the sender talks through. A rejected call may still have reached the receiver and acted. */
export interface BoardTransport {
  call(request: BoardRequest): Promise<BoardResponse>;
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
  addInk(ink: { page: number; stroke: Stroke; boardWidth: number }): { ok: true; id: string } | { ok: false; reason: string };
}

export function createBoardReceiver(options: { sessionId: string; page?: PageSize; glyphs?: GlyphSet }): BoardReceiver {
  const fresh = () => createScene({ page: options.page, glyphs: options.glyphs });
  let epoch = 0;
  let revision = 0;
  let shown = fresh();
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

  /** Log events from `since`, as many as fit in one answer (always one at least): the sender reads on to `logLength`. */
  function page(since: number): BoardEvent[] {
    const out: BoardEvent[] = [];
    let bytes = 0;
    for (const e of log.slice(since)) {
      bytes += byteSize(e);
      if (out.length > 0 && bytes > MAX_BATCH_BYTES) break;
      out.push(e);
    }
    return out;
  }

  /** Drops every staged batch: the child never sees them. A retry of one gets "cancelled" and changes nothing. */
  function cancelStaged(): string[] {
    const cancelled = staged.map((s) => s.batchId);
    for (const id of cancelled) states.set(id, "cancelled");
    staged = [];
    if (cancelled.length > 0) revision++;
    return cancelled;
  }

  function reset(req: Extract<BoardRequest, { type: "reset" }>): BoardResponse {
    if (req.epoch <= epoch) return fail("stale_epoch", `The board is already on epoch ${epoch}.`);
    const scene = restoreScene(req.snapshot, { page: options.page, glyphs: options.glyphs });
    if (!scene) return fail("invalid_request", "The snapshot does not replay on an empty board.");
    epoch = req.epoch;
    revision = 0;
    shown = scene;
    staged = [];
    log = [...req.snapshot.events];
    states = new Map();
    decided = new Map();
    nextSequence = 1;
    pen = "maya";
    return { ok: true, type: "reset", ...status() };
  }

  return {
    handle(raw) {
      const req = parseRequest(raw);
      if (!req) return fail("invalid_request", "The request is not a board request.");
      if (req.sessionId !== options.sessionId) return fail("wrong_session", "This board belongs to another call.");
      if (req.type === "apply" && byteSize(raw) > MAX_BATCH_BYTES) return fail("too_large", `A batch takes at most ${MAX_BATCH_BYTES} bytes.`, { batchId: req.batchId });
      if (req.type === "apply") return apply(req);
      if (req.type === "reset") return reset(req);
      if (req.type === "cancel") {
        if (req.epoch !== epoch) return fail("stale_epoch", `This cancel is from epoch ${req.epoch}; the board is on epoch ${epoch}.`);
        return { ok: true, type: "cancel", cancelled: cancelStaged(), ...status() };
      }
      return { ok: true, type: "status", log: page(req.since), batches: [...states].map(([batchId, state]) => ({ batchId, state })), ...status() };
    },
    scene: () => shown,
    staged: () => staged.map(({ batchId, utteranceId }) => ({ batchId, utteranceId })),
    release(batchId) {
      const upTo = staged.findIndex((s) => s.batchId === batchId);
      if (upTo < 0) return [];
      const out = staged.slice(0, upTo + 1);
      staged = staged.slice(upTo + 1);
      return out.map((s) => {
        shown = s.result.scene;
        states.set(s.batchId, "shown");
        log.push({ kind: "batch", batchId: s.batchId, commands: s.commands });
        return { batchId: s.batchId, utteranceId: s.utteranceId, drawn: s.result.drawn, erased: s.result.erased, notices: s.result.notices };
      });
    },
    presented(batchId) {
      if (states.get(batchId) === "shown") states.set(batchId, "presented");
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
export function restoreScene(snapshot: BoardSnapshot, options: { page?: PageSize; glyphs?: GlyphSet } = {}): Scene | null {
  let scene = createScene(options);
  for (const e of snapshot.events) {
    if (e.kind === "batch") {
      const r = applyBatch(scene, { transactionId: e.batchId, commands: e.commands });
      if (!r.ok) return null;
      scene = r.scene;
    } else {
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

/** `unreachable`: no answer came after the retries. The sender then needs a new `connect`. */
export type SendResult = { ok: true; batchId: string; state: BatchState } | { ok: false; code: ProtocolCode | "unreachable"; reason: string; refusal?: Refusal };

export interface BoardSender {
  /**
   * Starts a new epoch on the receiver with the board the child has seen: first, then after every lost line. It reads
   * what the receiver showed since the last sync, when the receiver still answers, so nothing the child saw is lost.
   * Batches staged and not shown are dropped: the speech they belonged to is over.
   */
  connect(): Promise<{ ok: true } | { ok: false; reason: string }>;
  /** Talks through another line from now on, for a reconnect. Call `connect` next. */
  useTransport(transport: BoardTransport): void;
  /** What the child has seen, as far as the sender knows: what a reconnect restores, and what the call stores. */
  snapshot(): BoardSnapshot;
  /** Sends one batch, after every request before it. The batch id is its transaction id. */
  send(batch: Batch, options?: { utteranceId?: string }): Promise<SendResult>;
  /** An interruption: the receiver drops every staged batch the child has not seen. Shown strokes stay. Then it syncs. */
  cancel(): Promise<{ ok: true; cancelled: string[] } | { ok: false; code: ProtocolCode | "unreachable"; reason: string }>;
  /** Reads what the child has seen since the last sync. */
  sync(): Promise<boolean>;
  batchState(batchId: string): BatchState | undefined;
  /** Who held the pen at the receiver's last answer. */
  pen(): PenHolder;
}

const UNREACHABLE = { ok: false, code: "unreachable", reason: "The child's board did not answer." } as const;

export function createBoardSender(options: { sessionId: string; transport: BoardTransport; retries?: number; snapshot?: BoardSnapshot }): BoardSender {
  const { sessionId } = options;
  let transport = options.transport;
  const retries = options.retries ?? 2;
  let epoch = 0;
  /** The sequence number of the next new batch. */
  let sequence = 1;
  let revision = 0;
  let connected = false;
  let pen: PenHolder = "maya";
  const log: BoardEvent[] = [...(options.snapshot?.events ?? [])];
  const states = new Map<string, BatchState>();

  const seen = (r: ReceiverStatus) => {
    revision = r.revision;
    pen = r.pen;
  };

  /** One operation at a time: the next request goes only after the answer to the one before it. */
  let queue: Promise<unknown> = Promise.resolve();
  function serial<T>(op: () => Promise<T>): Promise<T> {
    const run = queue.then(op);
    queue = run.catch(() => undefined);
    return run;
  }

  /** Reads the receiver's log from where the sender's ends, page by page, and the batches' states. */
  async function pull(): Promise<boolean> {
    for (;;) {
      const r = await call({ type: "status", sessionId, since: log.length });
      if (!r || !r.ok || r.type !== "status") return false;
      log.push(...r.log);
      for (const b of r.batches) states.set(b.batchId, b.state);
      if (r.log.length === 0 || log.length >= r.logLength) return true;
    }
  }

  /** Sends one request, and the same request again when its answer is lost: every request is safe to repeat. */
  async function call(request: BoardRequest): Promise<BoardResponse | null> {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const r = await transport.call(request);
        seen(r);
        return r;
      } catch {
        // Lost or timed out: the receiver may have acted. The same request again is safe.
      }
    }
    connected = false;
    return null;
  }

  return {
    connect: () => serial(async () => {
      // A receiver on this epoch still holds the board the child sees; a fresh one answers with its empty log.
      await pull();
      for (const [id, state] of states) if (state === "accepted") states.set(id, "cancelled");
      let r = await call({ type: "reset", sessionId, epoch: epoch + 1, snapshot: { events: [...log] } });
      // A receiver already past this epoch (the agent restarted): move past it.
      if (r && !r.ok && r.code === "stale_epoch") r = await call({ type: "reset", sessionId, epoch: r.epoch + 1, snapshot: { events: [...log] } });
      if (!r) return { ok: false, reason: UNREACHABLE.reason };
      if (!r.ok) return { ok: false, reason: r.reason };
      epoch = r.epoch;
      sequence = 1;
      connected = true;
      return { ok: true } as const;
    }),
    send: (batch, opts = {}) => serial(async (): Promise<SendResult> => {
      if (!connected) return UNREACHABLE;
      const request: BoardRequest = { type: "apply", sessionId, epoch, sequence, baseRevision: revision, batchId: batch.transactionId, utteranceId: opts.utteranceId, commands: [...batch.commands] };
      if (byteSize(request) > MAX_BATCH_BYTES) return { ok: false, code: "too_large", reason: `A batch takes at most ${MAX_BATCH_BYTES} bytes: split it.` };
      const r = await call(request);
      if (!r) return UNREACHABLE;
      // The receiver decided this batch: the next one gets the next number.
      if (r.ok || r.code === "refused") sequence++;
      if (!r.ok) return { ok: false, code: r.code, reason: r.reason, refusal: r.refusal };
      if (r.type !== "apply") return { ok: false, code: "invalid_request", reason: "The receiver answered another request." };
      states.set(r.batchId, r.state);
      return { ok: true, batchId: r.batchId, state: r.state };
    }),
    cancel: () =>
      serial(async () => {
        if (!connected) return UNREACHABLE;
        const r = await call({ type: "cancel", sessionId, epoch });
        if (!r) return UNREACHABLE;
        if (!r.ok) return { ok: false, code: r.code, reason: r.reason };
        if (r.type !== "cancel") return { ok: false, code: "invalid_request", reason: "The receiver answered another request." } as const;
        for (const id of r.cancelled) states.set(id, "cancelled");
        // Maya plans the next step on what the child saw: read it now.
        await pull();
        return { ok: true, cancelled: r.cancelled } as const;
      }),
    sync: () => serial(pull),
    useTransport(next) {
      transport = next;
    },
    snapshot: () => ({ events: [...log] }),
    batchState: (batchId) => states.get(batchId),
    pen: () => pen,
  };
}
