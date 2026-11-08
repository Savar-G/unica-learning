// Maya's text adapter (#322, spec #297): one text session about one question, with no room and no audio. Child turns
// come in as text; Maya's words and board batches go out. It is the seam the voice agent (#326) plugs into, and the
// one the test bench (#323) and the admin demo (#324) drive.
//
// One rule: nothing reaches the child unless the session's `step` accepts it. For each Maya turn the model proposes
// (src/lib/maya-model.ts); `step` checks the proposal, and the board core (`applyBatch`) checks every board batch the
// session builds from it. A refused proposal is asked for again once, with the refusal's reason; a second refusal, or
// a model that fails, is replaced by a safe code fallback: a proposal the controller builds from the session's own
// offers (`fallbacks`: code-written lines or a bank phrase, no free talk, no board), which `step` checks like any
// other. It keeps what code can check of the refused proposals' readings, the child's answers (#389), so only the
// words are replaced. When no fallback is accepted, the controller ends the call and gives any safety guidance due.
//
// Free talk (D-196 rule B, D-197): with `freeTalk` on, the model's own words in a turn with no math line are said only
// when they pass the session's code guards and a separate review (`reviewer`, src/lib/maya-talk-review.ts) with a time
// limit. The adapter steps the proposal once with no reviews to learn which words the session would say, reviews those,
// and steps it again with the reviews. A failed, late or missing review means a bank phrase of the same purpose. The
// trace records each piece: what the model proposed, both checks and what was said.
//
// Three inputs come from the voice agent (#396): a partial transcript of the child talking over Maya (`partial`: her
// output stops and nothing is judged), what Maya actually said (`mayaSaid`: other words than her approved text start a
// repair) and a content problem found during the call (`contentProblem`: the content hold and a close). A content
// problem that comes while an input runs is taken before the next Maya turn of that input.
//
// Safety guidance never waits for a model (#589). Once the danger is known, a refused proposal goes straight to code's
// guidance with no repair call. The accepted guidance then goes out at once: through `onGuidance` for a voice call, whose
// close call comes after it; a chat answers one request, so its close is code's too, and no close call is made.
//
// Every session writes a trace (src/lib/maya-trace.ts). The clock and the random seed are passed in.
import { type Batch } from "@/lib/board";
import {
  createSession,
  fallbacks,
  nextActs,
  step,
  LINES_VERSION,
  PROPOSAL_VERSION,
  type Outcome,
  type Session,
  type SessionEvent,
  type Severity,
  type WordingHistory,
} from "@/lib/maya";
import { modelInput, type MayaModel } from "@/lib/maya-model";
import { reviewInput, runReview, REVIEW_TIME_LIMIT_MS, type TalkReviewer } from "@/lib/maya-talk-review";
import { classifyError, packageHash, redactText, redactTrace, traceCounts, TRACE_KIND, TRACE_VERSION, type MayaTrace, type TraceBoardBatch, type TraceTurn, type TraceObligation } from "@/lib/maya-trace";

/** At most this many Maya turns in a row without the child (the easier example is up to four). */
export const MAX_MAYA_TURNS = 8;

export interface TextSessionOptions {
  confirmWorkbook?: boolean;
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
  channel?: "chat";
  grade?: number;
  runner?: MayaTrace["runner"];
  /**
   * D-197: read the model's own warm words in turns with no math line (off by default). Each is said only when it
   * passes the code guards and `reviewer`; without a reviewer every piece becomes a bank phrase. A resumed call keeps
   * the flag it started with.
   */
  freeTalk?: boolean;
  /** The call's end when it is shorter than 10 minutes (ms; #330). A resumed call keeps the limits it started with. */
  limitMs?: number;
  /** The free-talk review (src/lib/maya-talk-review.ts), or null. */
  reviewer?: TalkReviewer | null;
  /** The time limit of one review (default REVIEW_TIME_LIMIT_MS); a late review fails the line. */
  reviewTimeLimitMs?: number;
  /**
   * For local debugging only: each raw error, with where it happened. The trace keeps only an error code and its
   * fixed wording (R382-3-1); the command line prints these to stderr. Never write them to a stored record.
   */
  onError?: (error: unknown, where: { turn: number; source: "model" | "repair" | "review" } | "session") => void;
  /**
   * Safety guidance the session accepted, as soon as it is accepted and before the model is asked for the close (#589).
   * What it gets counts as delivered: the input's own output holds only what comes after. Called with no await before it.
   */
  onGuidance?: (output: TextOutput) => void;
  /**
   * Goes on with a call saved by `saved()` on an earlier request (the admin demo, #323, runs one request per child
   * turn). The saved state must come from this adapter with the same package; it is the server's own record, never
   * input from a browser. The callId, package, model and options above must be the call's own.
   */
  resume?: SavedTextSession;
}

/**
 * What a text session needs to go on later: the initial state and ordered event log, plus a derived cache. Plain JSON. The board scene is built again from the batches. It holds the child's words as said and the
 * child's name: keep it on the server, and drop it once the call has ended (the trace is the record).
 */
export interface SavedTextSession {
  v: 1 | 6;
  /** Version 6: initial state and the bounded input/response/delivery tail after the checkpoint. */
  initial?: TextLogInitial;
  log?: TextLogEvent[];
  /** Committed fold before the bounded log tail. Plain JSON, including pending work. */
  checkpoint?: TextCheckpoint;
  nextRequestId?: number;
  session: Session;
  endedAt: number | null;
  turns: TraceTurn[];
  board: TraceBoardBatch[];
  /** Unspoken utterances in the current output batch. Absent in older saved sessions. */
  approved?: string[];
  obligations?: TraceObligation[];
  childState?: "listening" | "child_speaking";
  problems?: string[];
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
  /**
   * Maya must stop talking now and drop board batches not yet shown (the session's `cancel_output`): the child talked
   * over her, she said words that were not her text, or the content hold began. `say` and `board` come after the stop.
   */
  cancelled?: boolean;
}

export interface TextSession {
  /** Starts the call: Maya's opening. */
  start(): Promise<TextOutput>;
  /** One child turn as text. */
  child(text: string, options?: { uncertain?: boolean; alternatives?: string[] }): Promise<TextOutput>;
  /**
   * A partial transcript of the child, who talks over Maya (`child_turn` with `final: false`): Maya's output stops
   * (`cancelled`) and nothing is judged. The full turn comes later through `child`.
   */
  partial(text: string): Promise<TextOutput>;
  /**
   * What Maya actually said in an unspoken utterance of the current batch. Words that are not her approved text stop her
   * output and start a repair, which comes first; then the teaching goes on.
   */
  mayaSaid(text: string): Promise<TextOutput>;
  /**
   * The question package turned out wrong during the call: the content hold, no more teaching, a close (content_issue).
   * In the safety state the safety path goes on. `detail` is wording the caller writes, never an error's text. Called
   * while an input runs, it is taken before that input's next Maya turn.
   */
  contentProblem(detail: string): Promise<TextOutput>;
  /** The clock moved on with no input (the pause policy may make Maya check in). */
  tick(): Promise<TextOutput>;
  /** The child starts or stops writing. */
  writing(status: "started" | "done"): Promise<TextOutput>;
  /** The connection or a service failed: the call ends. */
  technical(detail: string): Promise<TextOutput>;
  /**
   * A danger the session could not read itself (D-290): a read of the child's words outside the session found it, as when
   * the call's own clock has run out. Taken before the clock, so code's guidance is said even then.
   */
  safety(severity: Severity): Promise<TextOutput>;
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
  /** The controller fold now (a copy of plain data). */
  readonly session: Session;
  readonly ended: boolean;
  /** The trace so far, with the child's name as {name} and secrets removed: complete once the call has ended. */
  trace(): MayaTrace;
  /** The authoritative log at invocation, plus a derived cache. It never waits for a provider. */
  saved(): Promise<SavedTextSession>;
}

const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());

// The reducer owns all persistent state. The driver owns only promises and abort signals.
import { foldTextEvent, initialTextState, matchesApproval, textOutput, saveTextCheckpoint, restoreTextCheckpoint, type TextCheckpoint, type TextLogEvent, type TextLogInitial, type TextFold } from "@/lib/maya-text-log";

export function createTextSession(options: TextSessionOptions): TextSession {
  const { model, clock, resume } = options;
  if (resume?.v === 6 && (!resume.initial || !Array.isArray(resume.log))) throw new Error("maya text: the saved event log is missing");
  if (resume && (![1, 6].includes(resume.v) || (resume.v === 6 ? resume.initial!.session.callId : resume.session.callId) !== options.callId)) throw new Error("maya text: the saved session is not this call's");
  const initial: TextLogInitial = resume?.v === 6 && resume.initial ? structuredClone(resume.initial) : {
    session: resume ? structuredClone(resume.session) : createSession({ callId: options.callId, confirmWorkbook: options.confirmWorkbook, channel: options.channel, package: options.package, random: options.random, grade: options.grade, history: options.history, childName: options.childName, freeTalk: options.freeTalk === true, limitMs: options.limitMs }),
    endedAt: resume?.endedAt ?? null, turns: resume?.turns ?? [], board: resume?.board ?? [],
    approved: resume?.approved, obligations: resume?.obligations, childState: resume?.childState, problems: resume?.problems,
  };
  const log: TextLogEvent[] = structuredClone(resume?.v === 6 ? resume.log ?? [] : []);
  let checkpoint = resume?.checkpoint ? structuredClone(resume.checkpoint) : undefined;
  let nextRequestId = resume?.nextRequestId ?? Math.max(0, ...log.flatMap((e) => e.kind === "request" ? [e.requestId + 1] : []));
  let logBytes = new TextEncoder().encode(JSON.stringify(log)).byteLength;
  let folded: TextFold = checkpoint ? restoreTextCheckpoint(checkpoint) : initialTextState(initial);
  for (const e of log) folded = foldTextEvent(folded, e);
  let needsRecovery = folded.request !== null;
  let active: AbortController | null = null;
  let generation = 0;
  let queue: Promise<unknown> = Promise.resolve();
  const newOutput = (): TextOutput => ({ say: [], board: [], ended: null, safetyMessage: null, cancelled: false });
  const now = () => {
    let at = 0;
    try { at = clock(); } catch { /* Keep the last known time when the clock fails. */ }
    return Math.max(Number.isFinite(at) ? at : 0, log.at(-1)?.at ?? 0, folded.session.now ?? 0);
  };
  function append(e: TextLogEvent) {
    log.push(structuredClone(e));
    folded = foldTextEvent(folded, log.at(-1)!);
    logBytes += new TextEncoder().encode(JSON.stringify(e)).byteLength + 1;
    if (log.length >= 64 || logBytes >= 65536) {
      checkpoint = saveTextCheckpoint(folded);
      log.length = 0; logBytes = 0;
    }
  }
  function recover() {
    if (!needsRecovery) return;
    needsRecovery = false;
    append({ kind: "recover", at: now() });
  }
  const stopped = Symbol("stopped");
  async function wait<T>(promise: Promise<T>, controller: AbortController): Promise<T | typeof stopped> {
    if (controller.signal.aborted) { void promise.catch(() => undefined); return stopped; }
    let abort: () => void = () => {};
    const stop = new Promise<typeof stopped>((resolve) => { abort = () => resolve(stopped); controller.signal.addEventListener("abort", abort, { once: true }); });
    try { return await Promise.race([promise, stop]); }
    finally { controller.signal.removeEventListener("abort", abort); }
  }
  async function request(source: "model" | "repair", controller: AbortController) {
    const requestId = nextRequestId++;
    const repair = source === "repair" && folded.attempts.at(-1)?.refusal ? {
      proposal: folded.attempts.at(-1)!.proposal,
      refusal: folded.attempts.at(-1)!.refusal!,
    } : null;
    const input = modelInput(folded.session, repair);
    const at = Math.max(clock(), now());
    append({ kind: "request", at, requestId, source });
    if (folded.session.outcome || folded.request?.id !== requestId) return;
    // The handler logs even a late response from a provider that ignores abort.
    const response = Promise.resolve().then(() => model.propose(input, controller.signal)).then((proposal) => {
      append({ kind: "response", at: now(), requestId, proposal, ms: now() - at });
    }, (error) => {
      const stale = folded.request?.id !== requestId;
      append({ kind: "response", at: now(), requestId, error: classifyError(error, "model"), ms: now() - at });
      if (!stale) options.onError?.(error, { turn: folded.turns.length, source });
    });
    if (await wait(response, controller) === stopped || controller.signal.aborted) return;
    await reviewCandidate(controller);
  }
  async function reviewCandidate(controller: AbortController) {
    const candidate = folded.candidate;
    if (!candidate) return;
    const requestId = candidate.requestId;
    // Priority readings are already folded before any external free-talk review.
    const first = step(folded.session, { type: "proposal", at: now(), proposal: candidate.proposal });
    const texts = [...new Set(first.refusal ? [] : first.effects.flatMap((e) => e.kind === "say" ? e.talk ?? [] : []).filter((t) => t.code === null && t.review === "not_run").map((t) => t.proposed))];
    const t0 = now();
    const before = folded.session;
    const reviews = options.reviewer ? Promise.all(texts.map(async (text) => ({ text, result: await runReview(options.reviewer!, reviewInput(before, text), options.reviewTimeLimitMs ?? REVIEW_TIME_LIMIT_MS, (error) => options.onError?.(error, { turn: folded.turns.length, source: "review" })) }))) : Promise.resolve([]);
    const reviewed = reviews.then((results) => {
      append({ kind: "review", at: now(), requestId, reviews: results, ...(texts.length && options.reviewer ? { reviewMs: now() - t0 } : {}) });
    });
    await wait(reviewed, controller);
  }
  /** Guidance the session accepted goes out now. A call that ended returns it with its outcome instead. */
  function sendGuidance() {
    if (!options.onGuidance || folded.session.outcome || !folded.pending.some((p) => p.act === "safety")) return;
    const out = textOutput(folded);
    append({ kind: "delivered", at: now() });
    options.onGuidance(out);
  }
  /** The close after the guidance, in code's words. Every fallback here is a close, which ends the call when accepted. */
  function closeByCode() {
    for (const proposal of fallbacks(folded.session)) {
      append({ kind: "fallback", at: now(), proposal });
      if (folded.session.outcome) return;
    }
    append({ kind: "input", at: now(), event: { type: "technical", at: now(), detail: "Maya had no safe line to say" } });
  }
  async function pump(controller: AbortController) {
    sendGuidance();
    for (let n = 0; n < MAX_MAYA_TURNS && !controller.signal.aborted; n++) {
      if (folded.session.outcome) break;
      const urgent = folded.session.safety.flagged || folded.session.contentProblem !== null;
      if (folded.childState === "child_speaking" && !urgent) break;
      if (nextActs(folded.session).expect !== "maya") break;
      const { state, safety } = folded.session;
      if (options.channel === "chat" && state === "SAFETY" && safety.guided && !folded.candidate && !folded.attempts.length) {
        closeByCode();
        break;
      }
      if (folded.candidate) await reviewCandidate(controller);
      else if (!folded.attempts.length) await request("model", controller);
      if (controller.signal.aborted) break;
      // With the danger known, a refused proposal gets code's guidance now, not a second model call.
      const safetyDue = folded.session.safety.flagged && !folded.session.safety.guided;
      if (folded.attempts.at(-1)?.source === "model" && folded.attempts.at(-1)?.refusal && !folded.session.outcome && !safetyDue) await request("repair", controller);
      if (controller.signal.aborted) break;
      if (folded.attempts.length && !folded.session.outcome) {
        const refused = folded.attempts.filter((a) => a.refusal !== null).map((a) => a.proposal);
        for (const proposal of fallbacks(folded.session, refused)) {
          append({ kind: "fallback", at: now(), proposal });
          if (!folded.attempts.length) break;
        }
        if (folded.attempts.length) append({ kind: "input", at: now(), event: { type: "technical", at: now(), detail: "Maya had no safe line to say" } });
      }
      sendGuidance();
    }
  }
  function schedule(respond = true): Promise<TextOutput> {
    const version = generation;
    const next = queue.then(async () => {
      if (version !== generation) return { ...newOutput(), cancelled: true };
      const controller = new AbortController();
      active = controller;
      try {
        if (respond) await pump(controller);
        if (controller.signal.aborted) return { ...newOutput(), cancelled: true };
        const blocked = folded.childState === "child_speaking" && !folded.session.outcome && !folded.session.safety.flagged && !folded.session.contentProblem && !(folded.session.startedAt !== null && now() - folded.session.startedAt >= (folded.session.limits?.endAtMs ?? 600000));
        if (blocked) {
          const out = { ...newOutput(), cancelled: folded.output.cancelled };
          append({ kind: "cancelled", at: now() });
          return out;
        }
        const out = textOutput(folded);
        append({ kind: "delivered", at: now() });
        return out;
      } catch (error) {
        options.onError?.(error, "session");
        append({ kind: "input", at: now(), event: { type: "technical", at: now(), detail: "the session failed" }, error: classifyError(error, "local") });
        throw error;
      } finally { if (active === controller) active = null; }
    });
    queue = next.catch(() => undefined);
    return next;
  }
  function receive(event: SessionEvent, respond = true): Promise<TextOutput> {
    recover();
    const nonInterrupting = event.type === "writing" || event.type === "tick" || event.type === "start" || event.type === "content_problem" || event.type === "maya_said";
    if (!nonInterrupting) { generation++; active?.abort(); }
    const approval = event.type === "maya_said" && matchesApproval(folded, event.text);
    append({ kind: "input", at: event.at, event });
    if (approval) return Promise.resolve(newOutput());
    if (event.type === "child_turn" && event.final === false) {
      const out = { ...newOutput(), cancelled: folded.output.cancelled };
      // A partial returns immediately. It cannot deliver protected speech while cancelling a request.
      append({ kind: "cancelled", at: now() });
      return Promise.resolve(out);
    }
    return schedule(respond);
  }
  function trace(): MayaTrace {
    const { session, turns, board, obligations, endedAt } = folded;
    const outcome = folded.pending.length ? null : session.outcome;
    const raw = typeof options.package === "object" && options.package !== null ? options.package as Record<string, unknown> : {};
    return redactTrace({ kind: TRACE_KIND, version: TRACE_VERSION, callId: options.callId, runner: options.runner ?? "text",
      startedAt: iso(session.startedAt), endedAt: iso(outcome ? endedAt ?? session.now : null),
      model: { id: model.id, promptVersion: model.promptVersion }, versions: { proposal: PROPOSAL_VERSION, lines: LINES_VERSION, session: session.version },
      question: { id: typeof raw.id === "string" ? raw.id : null, ref: raw.ref ?? null, text: typeof raw.text === "string" ? raw.text : null, hash: packageHash(options.package) },
      freeTalk: session.freeTalk, reviewer: options.reviewer ? { id: options.reviewer.id, promptVersion: options.reviewer.promptVersion } : null,
      scopeRefusals: structuredClone(session.scopeRefusals ?? []),
      obligations: structuredClone(obligations), turns: structuredClone(turns), board: structuredClone(board), outcome, counts: traceCounts(turns),
    }, options.childName ?? null);
  }
  return {
    start: () => receive({ type: "start", at: now() }),
    child: (text, opts = {}) => receive({ type: "child_turn", at: now(), text, ...structuredClone(opts) }),
    partial: (text) => receive({ type: "child_turn", at: now(), text, final: false }, false),
    mayaSaid: (text) => receive({ type: "maya_said", at: now(), text }),
    contentProblem: (detail) => receive({ type: "content_problem", at: now(), detail: redactText(detail) }),
    tick: () => receive({ type: "tick", at: now() }),
    writing: (status) => receive({ type: "writing", at: now(), status }),
    technical: (detail) => receive({ type: "technical", at: now(), detail: redactText(detail) }, false),
    safety: (severity) => receive({ type: "safety", at: now(), severity }),
    get session() { return structuredClone(folded.session); },
    get ended() { return folded.session.outcome !== null; },
    finish: async (end = {}, oldFailed) => {
      const { reason = "technical_issue", detail = "the session was closed before the call ended", failed = false }: FinishOptions = typeof end === "string" ? { detail: end, failed: oldFailed ?? false } : end;
      recover(); generation++; active?.abort();
      if (folded.session.startedAt === null) append({ kind: "input", at: now(), event: { type: "start", at: now() } });
      append({ kind: "input", at: now(), event: reason === "child_stopped" ? { type: "hang_up", at: now() } : { type: "technical", at: now(), detail: redactText(detail) }, ...(failed ? { error: classifyError(null, "local") } : {}) });
      await schedule(false);
      return trace();
    },
    trace,
    saved: async () => structuredClone({ v: 6 as const, initial, checkpoint, nextRequestId, log, session: folded.session, turns: folded.turns, board: folded.board, endedAt: folded.endedAt, approved: folded.approved, obligations: folded.obligations, childState: folded.childState }),
  };
}
