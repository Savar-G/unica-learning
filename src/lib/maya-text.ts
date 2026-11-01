// Maya's text adapter (#322, spec #297): one text session about one question, with no room and no audio. Child turns
// come in as text; Maya's words and board batches go out. It is the seam the voice agent (#326) plugs into, and the
// one the test bench (#323) and the admin demo (#324) drive.
//
// One rule: nothing reaches the child unless the session's `step` accepts it. For each Maya turn the model proposes
// (src/lib/maya-model.ts); `step` checks the proposal, and the board core (`applyBatch`) checks every board batch the
// session builds from it. A refused proposal is asked for again once, with the refusal's reason; a second refusal, or
// a model that fails, is replaced by a safe code fallback: a proposal code builds from the session's own offers (a
// code-written line or a bank phrase, no reading, no board), which `step` checks like any other. When no fallback is
// accepted, the call ends as a technical issue and Maya says nothing. `freeTalk` stays off (D-196): every word is a
// code line or a bank phrase.
//
// Every session writes a trace (src/lib/maya-trace.ts). The clock and the random seed are passed in.
import { applyBatch, createScene, type Batch, type Scene } from "@/lib/board";
import {
  createSession,
  lineOffers,
  nextActs,
  step,
  warmGroups,
  LINES_VERSION,
  PROPOSAL_VERSION,
  type Act,
  type Effect,
  type Outcome,
  type Session,
  type SessionEvent,
  type WordingHistory,
} from "@/lib/maya";
import { modelInput, type MayaModel } from "@/lib/maya-model";
import { classifyError, packageHash, redactText, redactTrace, traceCounts, TRACE_KIND, TRACE_VERSION, type MayaTrace, type TraceAttempt, type TraceBoardBatch, type TraceError, type TraceTurn } from "@/lib/maya-trace";

/** At most this many Maya turns in a row without the child (the easier example is up to four). */
export const MAX_MAYA_TURNS = 8;

export interface TextSessionOptions {
  callId: string;
  /** The question package (untrusted; the session checks it). */
  package: unknown;
  model: MayaModel;
  /** The clock, in milliseconds. */
  clock: () => number;
  /** The wording seed (a random 32-bit number). */
  random?: number;
  history?: WordingHistory;
  childName?: string | null;
  runner?: MayaTrace["runner"];
  /**
   * For local debugging only: each raw error, with where it happened. The trace keeps only an error code and its
   * fixed wording (R382-3-1); the command line prints these to stderr. Never write them to a stored record.
   */
  onError?: (error: unknown, where: { turn: number; source: "model" | "repair" } | "session") => void;
  /**
   * Goes on with a call saved by `saved()` on an earlier request (the admin demo, #323, runs one request per child
   * turn). The saved state must come from this adapter with the same package; it is the server's own record, never
   * input from a browser. The callId, package, model and options above must be the call's own.
   */
  resume?: SavedTextSession;
}

/**
 * What a text session needs to go on later: the session (plain data), its turns and board batches so far, and when it
 * ended. Plain JSON. The board scene is built again from the batches. It holds the child's words as said and the
 * child's name: keep it on the server, and drop it once the call has ended (the trace is the record).
 */
export interface SavedTextSession {
  v: 1;
  session: Session;
  endedAt: number | null;
  turns: TraceTurn[];
  board: TraceBoardBatch[];
}

/** How a call that has not ended yet ends when it is finished. */
export interface FinishOptions {
  reason?: "technical_issue" | "child_stopped";
  detail?: string;
  failed?: boolean;
}

/** What reached the child after one input: Maya's sentences and board batches, all accepted by the session. */
export interface TextOutput {
  say: string[];
  board: Batch[];
  /** The outcome when the call ended with this input. */
  ended: Outcome | null;
  /** The safety guidance to keep on screen after the call, or null. */
  safetyMessage: string | null;
}

export interface TextSession {
  /** Starts the call: Maya's opening. */
  start(): Promise<TextOutput>;
  /** One child turn as text. */
  child(text: string, options?: { uncertain?: boolean; alternatives?: string[] }): Promise<TextOutput>;
  /** The clock moved on with no input (the pause policy may make Maya check in). */
  tick(): Promise<TextOutput>;
  /** The child starts or stops writing. */
  writing(status: "started" | "done"): Promise<TextOutput>;
  /** The connection or a service failed: the call ends. */
  technical(detail: string): Promise<TextOutput>;
  /**
   * Ends the call if it has not ended (starting it first when it never started), and returns the finished trace. Call
   * it in a `finally`: every caller gets a trace with an outcome, whatever failed. Safe to call more than once.
   * `reason`: "child_stopped" when the child hung up on purpose (a `hang_up` turn; the outcome's priority still puts
   * safety, a content issue and a solved question first); "technical_issue" (the default) for everything else, with
   * `detail`, wording the caller writes, never an error's text, and `failed` when a local step failed (the trace
   * records the code "local"). The older form `finish(detail, failed)` still works and ends as a technical issue, so
   * callers written against trace version 1 (the behaviour gate, #384) need no change.
   */
  finish(end?: FinishOptions | string, failed?: boolean): Promise<MayaTrace>;
  /** The session now (plain data). */
  readonly session: Session;
  readonly ended: boolean;
  /** The trace so far, with the child's name as {name} and secrets removed: complete once the call has ended. */
  trace(): MayaTrace;
  /** The state to go on with later (`resume`), after the inputs so far have finished. */
  saved(): Promise<SavedTextSession>;
}

/** Safe acts first; then the gentlest teaching; giving or accepting the answer and closing come last. */
const FALLBACK_ORDER: readonly Act[] = [
  "safety", "repair", "open", "guide", "example_step", "try_target", "ask_write", "clarify", "confirm", "check_in", "wait", "redirect",
  "offer_other_input", "give_answer", "accept_answer", "close",
];

/** The fallback proposals for the session now, safest first: code-written lines and bank phrases, no reading, no board. */
function fallbacks(session: Session): unknown[] {
  const { acts } = nextActs(session);
  const lines = lineOffers(session);
  const warm = warmGroups(session);
  const order = [...acts].sort((a, b) => FALLBACK_ORDER.indexOf(a) - FALLBACK_ORDER.indexOf(b));
  return order.flatMap((act) => {
    // The gentlest line first; for a confirmation, the number the child said last.
    const free = (lines[act] ?? []).filter((o) => !o.requires);
    const offers = act === "confirm" ? free.reverse() : free.sort((a, b) => (a.level ?? 0) - (b.level ?? 0));
    const group = warm[act]?.[0];
    return [
      ...offers.map((o) => ({
        version: PROPOSAL_VERSION, act, parts: [{ line: o.line, slots: o.slots }],
        ...(o.slots.step ? { step: o.slots.step } : {}), ...(act === "guide" ? { level: o.level ?? 0 } : {}),
      })),
      ...(group ? [{ version: PROPOSAL_VERSION, act, parts: [{ warm: group }] }] : []),
      { version: PROPOSAL_VERSION, act, parts: [] },
    ];
  });
}

const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());

export function createTextSession(options: TextSessionOptions): TextSession {
  const { model, clock, resume } = options;
  if (resume && (resume.v !== 1 || resume.session.callId !== options.callId)) throw new Error("maya text: the saved session is not this call's");
  let session = resume
    ? structuredClone(resume.session)
    : createSession({ callId: options.callId, package: options.package, random: options.random, history: options.history, childName: options.childName, freeTalk: false });
  let scene: Scene = createScene();
  let endedAt: number | null = resume?.endedAt ?? null;
  const turns: TraceTurn[] = resume ? structuredClone(resume.turns) : [];
  const board: TraceBoardBatch[] = resume ? structuredClone(resume.board) : [];
  // The board scene again, from the batches the board core accepted before.
  for (const b of board) {
    const applied = applyBatch(scene, { transactionId: b.transactionId, commands: b.commands });
    if (!applied.ok) throw new Error(`maya text: the saved board batch ${b.transactionId} does not apply again`);
    scene = applied.scene;
  }
  const hash = packageHash(options.package);
  const raw = typeof options.package === "object" && options.package !== null ? (options.package as Record<string, unknown>) : {};
  let queue: Promise<unknown> = Promise.resolve();

  const newOutput = (): TextOutput => ({ say: [], board: [], ended: null, safetyMessage: null });

  /** Takes the effects that are not Maya's words: the end of the call. */
  function takeEnd(effects: Effect[], out: TextOutput) {
    for (const e of effects) {
      if (e.kind === "end") {
        out.ended = e.outcome;
        out.safetyMessage = e.safetyMessage;
        endedAt = e.at;
      }
    }
  }

  /** Steps a non-proposal event; Maya's words can only come from proposals. */
  function event(e: SessionEvent, out: TextOutput): boolean {
    const r = step(session, e);
    if (r.refusal) return false;
    session = r.session;
    takeEnd(r.effects, out);
    return true;
  }

  /**
   * Tries one proposal: accepted when `step` accepts it and the board core accepts every batch it makes. A refused
   * proposal keeps what the session keeps from it (a safety flag, a stop, an unclear number); nothing of it is output.
   */
  function tryProposal(proposal: unknown, out: TextOutput, turn: number): { refusal: TraceAttempt["refusal"]; said?: { act: Act; say: string[]; board: string[] } } {
    const r = step(session, { type: "proposal", at: Math.max(clock(), session.now ?? 0), proposal });
    if (r.refusal) {
      session = r.session;
      takeEnd(r.effects, out);
      return { refusal: r.refusal };
    }
    let next = scene;
    for (const e of r.effects) {
      if (e.kind !== "board") continue;
      const applied = applyBatch(next, e.batch);
      if (!applied.ok) {
        // The session accepted it but the board core did not: refuse the whole proposal, and keep only its priority
        // reading (a reading alone is not a proposal, so the session keeps the reading and refuses it).
        const reading = typeof proposal === "object" && proposal !== null ? (proposal as Record<string, unknown>).reading : undefined;
        const kept = step(session, { type: "proposal", at: r.session.now ?? clock(), proposal: { reading } });
        session = kept.session;
        takeEnd(kept.effects, out);
        const allowed: Act[] = nextActs(session).acts;
        return { refusal: { code: "board_refused", reason: `The board refused batch ${e.batch.transactionId}: ${applied.refusal.code} ${applied.refusal.reason ?? ""}`.trim(), allowed } };
      }
      next = applied.scene;
    }
    session = r.session;
    scene = next;
    const said: string[] = [];
    const ids: string[] = [];
    let act: Act | null = null;
    for (const e of r.effects) {
      if (e.kind === "say") {
        said.push(e.text);
        act = e.act;
      } else if (e.kind === "board") {
        ids.push(e.batch.transactionId);
        out.board.push(e.batch);
        board.push({ at: session.now ?? clock(), turn, transactionId: e.batch.transactionId, commands: e.batch.commands });
      }
    }
    out.say.push(...said);
    takeEnd(r.effects, out);
    const proposedAct = typeof proposal === "object" && proposal !== null ? (proposal as { act?: Act }).act : undefined;
    return { refusal: null, said: { act: act ?? proposedAct ?? "close", say: said, board: ids } };
  }

  /** One Maya turn: the model, one repair, then code's fallback. */
  async function mayaTurn(out: TextOutput) {
    const index = turns.length;
    const entry: Extract<TraceTurn, { kind: "maya" }> = { kind: "maya", at: clock(), state: session.state, stateAfter: session.state, attempts: [], output: null };
    turns.push(entry);
    const controller = new AbortController();

    const ask = async (source: "model" | "repair", repair: Parameters<typeof modelInput>[1]) => {
      const t0 = clock();
      try {
        const proposal = await model.propose(modelInput(session, repair), controller.signal);
        const tried = tryProposal(proposal, out, index);
        entry.attempts.push({ source, proposal, refusal: tried.refusal, ms: clock() - t0 });
        return { proposal, ...tried };
      } catch (e) {
        options.onError?.(e, { turn: index, source });
        entry.attempts.push({ source, proposal: null, refusal: null, error: classifyError(e, "model"), ms: clock() - t0 });
        return null;
      }
    };

    let result = await ask("model", null);
    if (result && result.refusal && !session.outcome && nextActs(session).expect === "maya") {
      result = await ask("repair", { proposal: result.proposal, refusal: { code: result.refusal.code, reason: result.refusal.reason, allowed: result.refusal.allowed } });
    }
    if (result?.said) {
      entry.output = result.said;
    } else if (!session.outcome && nextActs(session).expect === "maya") {
      for (const proposal of fallbacks(session)) {
        const tried = tryProposal(proposal, out, index);
        if (tried.said) {
          entry.attempts.push({ source: "fallback", proposal, refusal: null });
          entry.output = tried.said;
          break;
        }
      }
      if (!entry.output) {
        const at = Math.max(clock(), session.now ?? 0);
        turns.push({ kind: "technical", at, detail: "no safe fallback was accepted" });
        event({ type: "technical", at, detail: "no safe fallback was accepted" }, out);
      }
    }
    entry.stateAfter = session.state;
  }

  async function mayaTurns(out: TextOutput) {
    for (let n = 0; n < MAX_MAYA_TURNS && !session.outcome && nextActs(session).expect === "maya"; n++) await mayaTurn(out);
    return out;
  }

  /** The time for a record that must be written even when the clock fails: never before the last record. */
  function safeNow(): number {
    let t = Number.NaN;
    try {
      t = clock();
    } catch {
      // The clock failed: use the last known time.
    }
    return Math.max(Number.isFinite(t) ? t : 0, session.now ?? 0, turns.at(-1)?.at ?? 0);
  }

  /** Ends the call now, if it has not ended: a hang-up, or else a technical issue. */
  function endNow(detail: string, error?: TraceError, reason: FinishOptions["reason"] = "technical_issue") {
    // A Maya turn cut off before its first attempt has nothing to record.
    for (let i = turns.length - 1; i >= 0; i--) {
      const t = turns[i];
      if (t.kind === "maya" && t.attempts.length === 0) turns.splice(i, 1);
    }
    if (session.outcome) return;
    const at = safeNow();
    const out = newOutput();
    if (session.startedAt === null && event({ type: "start", at }, out)) turns.push({ kind: "start", at });
    if (reason === "child_stopped" && event({ type: "hang_up", at }, out)) {
      turns.push({ kind: "hang_up", at });
      return;
    }
    if (session.outcome) return;
    if (event({ type: "technical", at, detail }, out)) turns.push({ kind: "technical", at, detail, ...(error ? { error } : {}) });
  }

  /**
   * Runs inputs one at a time, in order. An input that throws ends the call as a technical issue, so the trace keeps
   * an outcome, and the error goes on to the caller.
   */
  function serial(run: (out: TextOutput) => Promise<TextOutput>): Promise<TextOutput> {
    const next = queue.then(async () => {
      try {
        return await run(newOutput());
      } catch (e) {
        options.onError?.(e, "session");
        endNow("the session failed", classifyError(e, "local"));
        throw e;
      }
    });
    queue = next.catch(() => undefined);
    return next;
  }

  function trace(): MayaTrace {
    const t: MayaTrace = {
      kind: TRACE_KIND,
      version: TRACE_VERSION,
      callId: options.callId,
      runner: options.runner ?? "text",
      startedAt: iso(session.startedAt),
      endedAt: iso(session.outcome ? endedAt ?? session.now : null),
      model: { id: model.id, promptVersion: model.promptVersion },
      versions: { proposal: PROPOSAL_VERSION, lines: LINES_VERSION, session: session.version },
      question: {
        id: typeof raw.id === "string" ? raw.id : null,
        ref: raw.ref ?? null,
        text: typeof raw.text === "string" ? raw.text : null,
        hash,
      },
      freeTalk: session.freeTalk,
      turns: structuredClone(turns),
      board: structuredClone(board),
      outcome: session.outcome,
      counts: traceCounts(turns),
    };
    return redactTrace(t, options.childName ?? null);
  }

  return {
    start: () =>
      serial(async (out) => {
        const at = clock();
        if (!event({ type: "start", at }, out)) return out;
        turns.push({ kind: "start", at });
        return mayaTurns(out);
      }),
    child: (text, opts = {}) =>
      serial(async (out) => {
        const at = clock();
        if (!event({ type: "child_turn", at, text, ...(opts.uncertain ? { uncertain: true } : {}), ...(opts.alternatives ? { alternatives: opts.alternatives } : {}) }, out)) return out;
        turns.push({ kind: "child", at, text, ...(opts.uncertain ? { uncertain: true } : {}) });
        return mayaTurns(out);
      }),
    tick: () =>
      serial(async (out) => {
        const at = clock();
        if (!event({ type: "tick", at }, out)) return out;
        turns.push({ kind: "tick", at });
        return mayaTurns(out);
      }),
    writing: (status) =>
      serial(async (out) => {
        const at = clock();
        if (!event({ type: "writing", at, status }, out)) return out;
        turns.push({ kind: "writing", at, status });
        return mayaTurns(out);
      }),
    technical: (detail) =>
      serial(async (out) => {
        const at = clock();
        if (event({ type: "technical", at, detail }, out)) turns.push({ kind: "technical", at, detail });
        return out;
      }),
    get session() {
      return session;
    },
    get ended() {
      return session.outcome !== null;
    },
    finish: async (end = {}, oldFailed) => {
      const { reason = "technical_issue", detail = "the session was closed before the call ended", failed = false }: FinishOptions =
        typeof end === "string" ? { detail: end, failed: oldFailed ?? false } : end;
      await queue;
      endNow(redactText(detail), failed ? classifyError(null, "local") : undefined, reason);
      return trace();
    },
    trace,
    saved: async () => {
      await queue;
      return structuredClone({ v: 1 as const, session, endedAt, turns, board });
    },
  };
}
