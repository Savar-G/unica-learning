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
  tutorTeachingNow,
  tutorStream,
  tutorStreamReading,
  gateDisagrees,
  tutorStreamSentence,
  TUTOR_REVIEW_IGNORED,
  bindingReview,
  nextActs,
  step,
  streamPlan,
  plainMathTurn,
  expectedTurns,
  fitsExpected,
  streamSentence,
  codeStance,
  fillName,
  clearStop,
  LINES_VERSION,
  PROPOSAL_VERSION,
  type Outcome,
  type Session,
  type SessionEvent,
  type Severity,
  type WordingHistory,
} from "@/lib/maya";
import { modelInput, turnBrief, type MayaModel, type ModelInput, type TurnBrief } from "@/lib/maya-model";
import { tutorBrief } from "@/lib/maya/tutor-prompt";
import { preparedReplies, preparedKey, preparedKeys, sameTurn, MAX_PREPARES_PER_TURN, type PrepareHypothesis, type PreparedReply, type PrepareRecord } from "@/lib/maya-prepared";
import type { SpendHandle, SpendSeam } from "@/lib/maya-spend-seam";
import { readReuse, withReadReuse } from "@/lib/maya/read-reuse";
import { sentenceKey, sentencesOf } from "@/lib/maya/say-check";

/** The end of a JSON string that starts at `i` (its opening quote), or -1 before its closing quote has come. */
function stringEnd(text: string, i: number): number {
  for (let k = i + 1; k < text.length; k++) {
    if (text[k] === "\\") { k++; continue; }
    if (text[k] === '"') return k + 1;
  }
  return -1;
}

/** The end of the JSON value that starts at `i`, or -1 while it is not complete. */
function valueEnd(text: string, i: number): number {
  const c = text[i];
  if (c === undefined) return -1;
  if (c === '"') return stringEnd(text, i);
  if (c === "{" || c === "[") {
    let depth = 0;
    for (let k = i; k < text.length; k++) {
      const x = text[k];
      if (x === '"') { const e = stringEnd(text, k); if (e < 0) return -1; k = e - 1; continue; }
      if (x === "{" || x === "[") depth++;
      else if (x === "}" || x === "]") { depth--; if (depth === 0) return k + 1; }
    }
    return -1;
  }
  // A literal (true, false, null, a number) ends at the next "," or "}" of the object.
  const m = /^[^,}\s]+/.exec(text.slice(i));
  return m && i + m[0].length < text.length ? i + m[0].length : -1;
}

/**
 * The complete key-value pairs of a JSON object as it streams in, from `i` (just after "{" when `first`, else just after
 * a value), until the key `stop` or the first value that is not complete. `at` is the start of the value of `stop`, or
 * -1 when `stop` has not come (or the text is not an object).
 */
function keysFrom(text: string, i: number, first: boolean, stop: string | null): { keys: Record<string, unknown>; at: number } {
  const keys: Record<string, unknown> = {};
  for (let n = 0; ; n++) {
    if (n > 0 || !first) {
      const sep = /^\s*,\s*/.exec(text.slice(i));
      if (!sep) return { keys, at: -1 };
      i += sep[0].length;
    }
    if (text[i] !== '"') return { keys, at: -1 };
    const keyEnd = stringEnd(text, i);
    if (keyEnd < 0) return { keys, at: -1 };
    let key: unknown;
    try { key = JSON.parse(text.slice(i, keyEnd)); } catch { return { keys, at: -1 }; }
    const colon = /^\s*:\s*/.exec(text.slice(keyEnd));
    if (!colon) return { keys, at: -1 };
    i = keyEnd + colon[0].length;
    if (key === stop) return { keys, at: i };
    const end = valueEnd(text, i);
    if (end < 0) return { keys, at: -1 };
    try { keys[String(key)] = JSON.parse(text.slice(i, end)); } catch { return { keys, at: -1 }; }
    i = end;
  }
}

/**
 * The `say` string of a version 3 reply as it streams in: its text so far, with JSON escapes read, and whether its
 * closing quote has come. Null before the key. Final check 5 (2026-11-15): the keys before `say` are read whole, in any
 * order: `kind` (round 4, P2-7; "math" when `say` is the first key), and the tutor's `gate` (2026-11-15, after final
 * check 5): the value the model wrote before `say`, or null when `say` began before a complete gate (the tutor's stream
 * then sends nothing on that turn). `reading` is the model's reading as it wrote it, before `say` or, once `say` is
 * complete, after it; null while it is not complete.
 */
export function partialSay(soFar: string): { text: string; complete: boolean; kind: string | null; gate: string | null; reading: Record<string, unknown> | null; before: string[] } | null {
  const open = /^\s*\{\s*/.exec(soFar);
  if (!open) return null;
  const head = keysFrom(soFar, open[0].length, true, "say");
  if (head.at < 0) return null;
  const before = head.keys;
  const i = head.at;
  if (soFar[i] !== '"') return null;
  const kind = typeof before.kind === "string" ? before.kind : Object.keys(before).length === 0 ? "math" : null;
  const gate = typeof before.gate === "string" ? before.gate : null;
  const readingOf = (r: unknown) => (typeof r === "object" && r !== null && !Array.isArray(r) ? (r as Record<string, unknown>) : null);
  let text = "";
  for (let k = i + 1; k < soFar.length; k++) {
    const c = soFar[k];
    if (c === '"') {
      // The keys after `say`: the tutor's reading comes there (2026-11-15).
      const reading = readingOf(before.reading) ?? readingOf(keysFrom(soFar, k + 1, false, null).keys.reading);
      return { text, complete: true, kind, gate, reading, before: Object.keys(before) };
    }
    if (c !== "\\") { text += c; continue; }
    const e = soFar[k + 1];
    if (e === undefined) break;
    if (e === "u") {
      const hex = soFar.slice(k + 2, k + 6);
      if (hex.length < 4) break;
      text += String.fromCharCode(parseInt(hex, 16));
      k += 5;
      continue;
    }
    text += ({ n: "\n", t: "\t", r: "\r", b: "\b", f: "\f" } as Record<string, string>)[e] ?? e;
    k += 1;
  }
  return { text, complete: false, kind, gate, reading: readingOf(before.reading), before: Object.keys(before) };
}
/**
 * Final check 7 (2026-11-15): every member of every object in a reply's raw text as it streams in, at any depth, in the
 * order written, each with its path from the top (["reading", "safety"]) and its value when it is a complete string,
 * number, boolean or null. Repeated keys are kept, so a caller sees every copy; `repeated` is true when any one object
 * holds a key twice, at any depth (a final parse keeps only the last copy). Stops at the first value that is not
 * complete; the members before it stay.
 */
function deepMembers(text: string): { members: { path: string[]; value: unknown }[]; repeated: boolean } {
  const members: { path: string[]; value: unknown }[] = [];
  let repeated = false;
  const ws = (i: number) => { while (i < text.length && /\s/.test(text[i])) i++; return i; };
  /** The end of the value at `i` (after its last character), or -1 when it is not complete or not JSON. */
  const value = (i: number, path: string[]): number => {
    i = ws(i);
    const c = text[i];
    if (c === undefined) return -1;
    if (c === "{") {
      const keys = new Set<string>();
      i = ws(i + 1);
      if (text[i] === "}") return i + 1;
      for (;;) {
        if (text[i] !== '"') return -1;
        const keyEnd = stringEnd(text, i);
        if (keyEnd < 0) return -1;
        let key: string;
        try { key = String(JSON.parse(text.slice(i, keyEnd))); } catch { return -1; }
        if (keys.has(key)) repeated = true;
        keys.add(key);
        i = ws(keyEnd);
        if (text[i] !== ":") return -1;
        const end = value(i + 1, [...path, key]);
        if (end < 0) return -1;
        i = ws(end);
        if (text[i] === ",") { i = ws(i + 1); continue; }
        if (text[i] === "}") return i + 1;
        return -1;
      }
    }
    if (c === "[") {
      i = ws(i + 1);
      if (text[i] === "]") return i + 1;
      for (;;) {
        const end = value(i, [...path, "[]"]);
        if (end < 0) return -1;
        i = ws(end);
        if (text[i] === ",") { i = ws(i + 1); continue; }
        if (text[i] === "]") return i + 1;
        return -1;
      }
    }
    const end = valueEnd(text, i);
    if (end < 0) return -1;
    let v: unknown;
    try { v = JSON.parse(text.slice(i, end)); } catch { return -1; }
    members.push({ path, value: v });
    return end;
  };
  value(0, []);
  return { members, repeated };
}

/** The fields whose values route a turn before any math (the gate and the priority readings). */
const PRIORITY_KEYS = new Set(["gate", "kind", "aboutMaya", "safety", "stop", "unsafeRequest"]);

/**
 * Final check 8 (2026-11-15): every complete `"key": value` pair of a priority field in raw text, at any place, in the
 * order written. A tolerant scan: JSON strings are read whole (with their escapes), and any other character that is no
 * JSON token (a fence, "NaN", prose) only breaks the pair it stands in. A value is a string or true, false or null.
 */
export function rawPriorityMembers(raw: string): { key: string; value: unknown }[] {
  type Tok = { t: "str"; v: string } | { t: "colon" } | { t: "lit"; v: unknown } | { t: "other" };
  const toks: Tok[] = [];
  for (let i = 0; i < raw.length;) {
    const c = raw[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '"') {
      const end = stringEnd(raw, i);
      if (end < 0) break;
      let v: unknown;
      try { v = JSON.parse(raw.slice(i, end)); } catch { v = null; }
      toks.push(typeof v === "string" ? { t: "str", v } : { t: "other" });
      i = end;
      continue;
    }
    if (c === ":") { toks.push({ t: "colon" }); i++; continue; }
    const lit = /^(?:true|false|null)\b/.exec(raw.slice(i, i + 6));
    if (lit) { toks.push({ t: "lit", v: JSON.parse(lit[0]) }); i += lit[0].length; continue; }
    toks.push({ t: "other" });
    i++;
  }
  const out: { key: string; value: unknown }[] = [];
  for (let k = 0; k + 2 < toks.length; k++) {
    const a = toks[k], b = toks[k + 1], v = toks[k + 2];
    if (a.t === "str" && PRIORITY_KEYS.has(a.v) && b.t === "colon" && (v.t === "str" || v.t === "lit")) out.push({ key: a.v, value: v.v });
  }
  return out;
}

/** Whether a parsed reading carries every priority value the raw text holds (a stronger or equal one counts). */
export function priorityCovered(parsed: Record<string, unknown> | null, raw: Record<string, unknown> | null): boolean {
  if (!raw) return true;
  if (!parsed) return false;
  const rank = (x: unknown) => (x === "immediate" ? 2 : x === "concern" ? 1 : 0);
  if (rank(raw.safety) > rank(parsed.safety)) return false;
  if (raw.aboutMaya && parsed.aboutMaya !== raw.aboutMaya && parsed.aboutMaya !== "secret_friend") return false;
  if (raw.stop && !parsed.stop) return false;
  if (raw.unsafeRequest && !parsed.unsafeRequest) return false;
  return true;
}

/**
 * Final check 6 (2026-11-15): what a reply's raw text, as streamed so far, says before any parse. `repeated`: a key comes
 * twice in one object, at ANY depth (a second "gate", a second "reading", or a second "safety" inside the reading; final
 * check 7), which makes the whole output malformed for routing, since a final parse keeps only the last value.
 * `priority`: every priority value in the text, from any copy of any key, whole or cut off, as one reading: a question
 * about Maya (the gate "identity" or aboutMaya), safety (the gate "safety", a severity, kind "safety"; the strongest
 * severity in any copy wins), a harmful request, or a stop (the gate "stop", the reading's stop, kind "stop"); null when
 * there is none. A complete priority value is never lost to a failed parse or to a later copy: it applies on its own
 * (fail closed).
 */
export function streamedPriority(raw: string): { repeated: boolean; priority: Record<string, unknown> | null } {
  const { repeated } = deepMembers(raw);
  // Final check 8 (2026-11-15): the priority fields are read from the RAW text, never only from parsed JSON: every
  // complete `"key": value` pair of a priority field wherever it stands, inside an outer Markdown fence, after an invalid
  // value ("gate": NaN) or in a cut-off copy. Text inside a JSON string (the `say` text) is one token, so a key written in
  // it is no member. Any non-"none" priority value seen anywhere applies; over-triggering only adds code's fixed line.
  const members = rawPriorityMembers(raw);
  const p: Record<string, unknown> = {};
  const raise = (severity: unknown) => {
    if (severity === "immediate") p.safety = "immediate";
    else if (severity === "concern" && p.safety !== "immediate") p.safety = "concern";
  };
  let gateSafety = false;
  for (const { key, value } of members) {
    if (key === "gate") {
      if (value === "identity") p.aboutMaya ??= "identity";
      if (value === "safety") gateSafety = true;
      if (value === "stop") p.stop = true;
    } else if (key === "kind") {
      if (value === "safety") raise("concern");
      if (value === "stop") p.stop = true;
    } else if (key === "aboutMaya") {
      if (value === "identity" || value === "secret_friend") p.aboutMaya = p.aboutMaya === "secret_friend" ? "secret_friend" : value;
    } else if (key === "safety") raise(value);
    else if (key === "stop" && value === true) p.stop = true;
    else if (key === "unsafeRequest" && value === true) p.unsafeRequest = true;
  }
  // A "safety" gate on a harmful request is the decline's (as priorityOf reads it); else it is a safety concern.
  if (gateSafety && !p.unsafeRequest) raise("concern");
  return { repeated, priority: Object.keys(p).length ? p : null };
}

import { reviewInput, runReview, CONVERSATION_REVIEW_TIME_LIMIT_MS, REVIEW_TIME_LIMIT_MS, type TalkReviewer } from "@/lib/maya-talk-review";
import { runMathReview, type MathReviewer } from "@/lib/maya-math-review";
import { mathReviewInput, type MathReview, type MathReviewInput, type MathReviewResult, type TalkReviewInput, type TalkReviewResult } from "@/lib/maya";
import { emittedHelpKind, type Assistance } from "@/lib/maya/session";
import { readFromFence } from "@/lib/ai-fenced";
import { classifyError, packageHash, redactText, redactTrace, traceCounts, TRACE_KIND, TRACE_VERSION, type MayaTrace, type TraceBoardBatch, type TraceTurn, type TraceObligation } from "@/lib/maya-trace";

/** At most this many Maya turns in a row without the child (the easier example is up to four). */
export const MAX_MAYA_TURNS = 8;
/** D-341: the time one Maya turn may take in chat for the model and its repair, in ms. */
export const TURN_BUDGET_MS = 6_000;

export interface TextSessionOptions {
  /** Budget owner refuses speculative takes when only two live attempts remain. No seam disables preparation. */
  spend?: SpendSeam;
  /** One request-bound model for the already paid handle. Normal turns still use `model`. */
  prepareModel?: (handle: SpendHandle) => MayaModel | null;
  /**
   * Diagnostics only: the id of a spend handle, from the ONE call-local getter the caller already uses to tag the
   * physical request (a WeakMap on the handle object; the session invents no id and mutates no handle). It is copied
   * into the used or discarded preparation record. A getter that throws or gives no plain token leaves the id missing.
   */
  prepareHandleId?: (handle: SpendHandle) => string;
  /**
   * Diagnostics only: called with a shallow copy of each preparation record right after the session stored it. It
   * cannot change the saved record; a throw or a rejected promise is ignored and changes no speech, credit or state.
   */
  onPreparation?: (record: PrepareRecord) => void | Promise<void>;
  /**
   * Diagnostics only: an optional envelope around ONLY the ordinary model request (`model.propose`) of a turn, with
   * its source (`model`, or `repair` after a refusal). `run` must be called synchronously by the wrapper, so an
   * async context it opens (the caller's request context) binds to the real dispatch. `run` sends at most one
   * request however often it is called, and a wrapper that throws or never calls it changes nothing: the session
   * uses the one cached result. A prepared reply is not wrapped (its request carries its own source).
   */
  withModelAttempt?: <T>(source: "model" | "repair", run: () => T) => T;
  /** Prepare expected and known-wrong values after a delivered turn. Default on when spend is supplied. */
  prepareExpected?: boolean;
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
  /** The call's end when it is shorter than 10 minutes (ms). A resumed call keeps the limits it started with. */
  limitMs?: number;
  /**
   * D-345: teach with the tutor core when the question is one it teaches (src/lib/maya/tutor.ts). A resumed call keeps
   * what it started with. On a tutor teaching turn a refused message gets one repair, also in voice.
   */
  tutor?: boolean;
  /** The free-talk review (src/lib/maya-talk-review.ts), or null. D-341: it reads each reply that is not plain math talk. */
  reviewer?: TalkReviewer | null;
  /**
   * Two-layer true math (2026-11-15): the math-truth review of the tutor core (src/lib/maya-math-review.ts), or null. It
   * reads each tutor sentence whose math code did not read whole; without it such a sentence is refused (one repair, then
   * code's line). It runs beside the free-talk review, with the same time limit.
   */
  mathReviewer?: MathReviewer | null;
  /**
   * D-341: the time one Maya turn may take for the model and its repair (default TURN_BUDGET_MS). When it is spent,
   * Maya says code's own line (fallbacks). Voice sets less.
   */
  turnBudgetMs?: number;
  /**
   * Whether a refused first proposal gets a second model request that fixes it (default true). A voice call sets false:
   * the repair costs two seconds of silence and failed in live practice (980571e0), so the first refusal goes straight
   * to code's own line. Chat and admin text calls keep the repair. Safety is code's guidance either way.
   */
  modelRepair?: boolean;
  /**
   * D-341, the streaming contract agreed with the voice lead. Each sentence of Maya's output goes to `onSayPart` in
   * index order, one at a time, only after it passed the per-sentence checks; a sentence sent is never cancelled.
   * `onSayCancel(fromIndex)` is only for indexes not sent yet; `onSayEnd` ends the output. Today the hooks are called
   * once the whole reply is checked (no token streaming yet); the saved turn holds exactly the spoken sentences in order.
   */
  onSayPart?: (sentence: string, index: number, boardCues: Batch[]) => void;
  onSayCancel?: (fromIndex: number) => void;
  onSayEnd?: () => void;
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
  preparations?: PrepareRecord[];
}

/** How a call that has not ended yet ends when it is finished. */
export interface FinishOptions {
  reason?: "technical_issue" | "child_stopped";
  detail?: string;
  failed?: boolean;
}

/** What reached the child after one input: Maya's sentences and board batches, all accepted by the session. */
export interface TextOutput {
  prepared?: "hit" | "miss" | "none";
  preparedLeadMs?: number;
  preparedKind?: "interim" | "expected";
  say: string[];
  board: Batch[];
  /** The outcome when the call ended with this input. */
  ended: Outcome | null;
  /** The safety guidance to keep on screen after the call, or null. */
  safetyMessage: string | null;
  /**
   * D-341, round 2: the child is thinking ("um", "wait"): Maya said at most a short patient line and now waits. A voice
   * worker may skip speech after the first patient line.
   */
  wait?: boolean;
  /**
   * Maya must stop talking now and drop board batches not yet shown (the session's `cancel_output`): the child talked
   * over her, she said words that were not her text, or the content hold began. `say` and `board` come after the stop.
   */
  cancelled?: boolean;
}

export interface TextSession {
  /**
   * Starts the call: Maya's opening. In a conversational call (D-341) it is code's opening line (openingLine) with the
   * question staged on the board, and no model call. `openingSpoken`: the voice worker speaks that line itself, so it
   * comes back with no say (the trace records it, the board batch comes back as usual).
   */
  start(options?: { openingSpoken?: boolean }): Promise<TextOutput>;
  /** Starts a speculative request. It never changes saved state or speaks. False means no request was needed or allowed. */
  prepare(hypothesis: PrepareHypothesis | string): boolean;
  /** Cancels pending model work and preparation when the caller stops or loses ownership. Changes no saved input. */
  cancelPending(): void;
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
  /** Final check 12: the help kinds of every sentence this text session emitted (the help ledger). */
  helpLedger(): Assistance[];

  readonly ended: boolean;
  /** The trace so far, with the child's name as {name} and secrets removed: complete once the call has ended. */
  trace(): MayaTrace;
  /** The authoritative log at invocation, plus a derived cache. It never waits for a provider. */
  saved(): Promise<SavedTextSession>;
}

const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());

/**
 * Final check 12 (2026-11-15): a saved call with the help ledger of the live session added to its log, so a restore for
 * the end (a hang-up, the deadline, the cap) folds that help in before anything else can end it. Only rises: a kind the
 * saved session already holds adds nothing. A saved call with no log (version 1) is returned as it is.
 */
export function withHelpLedger(saved: SavedTextSession, kinds: readonly Assistance[]): SavedTextSession {
  if (saved.v !== 6 || !saved.log) return saved;
  const held = saved.session?.assistance ?? [];
  const add = kinds.filter((k, i) => !held.includes(k) && kinds.indexOf(k) === i);
  if (add.length === 0) return saved;
  const at = Math.max(saved.log.at(-1)?.at ?? 0, saved.session?.now ?? 0);
  return { ...saved, log: [...saved.log, ...add.map((assistance) => ({ kind: "help" as const, at, assistance }))] };
}

// The reducer owns all persistent state. The driver owns only promises and abort signals.
import { foldTextEvent, initialTextState, matchesApproval, textOutput, saveTextCheckpoint, restoreTextCheckpoint, type TextCheckpoint, type TextLogEvent, type TextLogInitial, type TextFold } from "@/lib/maya-text-log";

export function createTextSession(options: TextSessionOptions): TextSession {
  const { model, clock, resume } = options;
  if (resume?.v === 6 && (!resume.initial || !Array.isArray(resume.log))) throw new Error("maya text: the saved event log is missing");
  if (resume && (![1, 6].includes(resume.v) || (resume.v === 6 ? resume.initial!.session.callId : resume.session.callId) !== options.callId)) throw new Error("maya text: the saved session is not this call's");
  const initial: TextLogInitial = resume?.v === 6 && resume.initial ? structuredClone(resume.initial) : {
    session: resume ? structuredClone(resume.session) : createSession({ callId: options.callId, confirmWorkbook: options.confirmWorkbook, channel: options.channel, package: options.package, random: options.random, grade: options.grade, history: options.history, childName: options.childName, freeTalk: options.freeTalk === true, limitMs: options.limitMs, conversational: model.output === 3, tutor: options.tutor === true }),
    endedAt: resume?.endedAt ?? null, turns: resume?.turns ?? [], board: resume?.board ?? [],
    approved: resume?.approved, obligations: resume?.obligations, childState: resume?.childState, problems: resume?.problems,
  };
  const log: TextLogEvent[] = structuredClone(resume?.v === 6 ? resume.log ?? [] : []);
  let checkpoint = resume?.checkpoint ? structuredClone(resume.checkpoint) : undefined;
  let nextRequestId = resume?.nextRequestId ?? Math.max(0, ...log.flatMap((e) => e.kind === "request" ? [e.requestId + 1] : []));
  let logBytes = new TextEncoder().encode(JSON.stringify(log)).byteLength;
  // This call's own reads (read-reuse.ts): kept for this text session only, used only inside its synchronous steps.
  const reads = readReuse();
  const read = <T>(run: () => T): T => withReadReuse(reads, run);
  let folded: TextFold = checkpoint ? restoreTextCheckpoint(checkpoint) : initialTextState(initial);
  for (const e of log) folded = read(() => foldTextEvent(folded, e));
  let needsRecovery = folded.request !== null;
  let active: AbortController | null = null;
  let generation = 0;
  let queue: Promise<unknown> = Promise.resolve();
  let turnEndsAt = Number.POSITIVE_INFINITY;
  let quietOpening = false;
  let scheduled = 0;
  let prepareCount = 0;
  let preparationStopped = false;
  const preparations: PrepareRecord[] = structuredClone(resume?.preparations ?? []);
  const costs = new Map<PrepareRecord, PreparedReply>();
  const cache = options.spend && model.output === 3 ? preparedReplies(model, options.spend, () => now(), options.prepareModel, options.prepareHandleId) : null;
  let committing: { generation: number; entries: Map<string, PreparedReply>; at: number } | null = null;
  let preparedOutput: Pick<TextOutput, "prepared" | "preparedLeadMs" | "preparedKind"> = {};
  function record(entry: PreparedReply, value: PrepareRecord) {
    preparations.push(value); costs.set(value, entry);
    // Diagnostics only, after the record is stored: a copy, and no failure of the hook reaches the call.
    if (!options.onPreparation) return;
    try {
      const out = options.onPreparation({ ...value });
      if (out && typeof (out as Promise<void>).then === "function") (out as Promise<void>).then(undefined, () => undefined);
    } catch { /* the hook is an observer */ }
  }
  function discard(entries: Map<string, PreparedReply>, reason: NonNullable<PrepareRecord["reason"]>) {
    for (const entry of entries.values()) record(entry, cache!.discard(entry, reason, now()));
  }
  function clearPrepares(reason: NonNullable<PrepareRecord["reason"]>) {
    if (!cache) return;
    discard(cache.takeAll(), reason);
    if (committing) { discard(committing.entries, reason); committing = null; }
  }
  function prepare(hypothesis: PrepareHypothesis | string): boolean {
    if (preparationStopped || !cache || scheduled || active || needsRecovery || folded.session.startedAt === null || folded.session.outcome || folded.request || folded.candidate || folded.pending.length || folded.session.turn) return false;
    const h = typeof hypothesis === "string" ? { text: hypothesis, reason: "interim" as const } : hypothesis;
    if (!h.text.trim() || h.text.length > 1_000) return false;
    const at = now();
    const copy = foldTextEvent(restoreTextCheckpoint(saveTextCheckpoint(folded)), { kind: "input", at, event: { type: "child_turn", at, text: h.text } });
    if (!plainMathTurn(copy.session) || copy.session.outcome) return false;
    // D-345: a tutor call prepares its own brief; the reply still goes through the whole-message check.
    const brief = copy.session.tutor ? tutorBrief(copy.session) as unknown as TurnBrief : turnBrief(copy.session);
    const key = preparedKey(copy.session, brief);
    if (cache.get(key)) { cache.share(key, h); return false; }
    if (prepareCount >= MAX_PREPARES_PER_TURN) return false;
    const handle = options.spend!.take("speculative");
    if (!handle) return false;
    prepareCount++;
    return cache.start(key, brief, h, handle);
  }
  function prepareNext() {
    if (!cache || preparationStopped || options.prepareExpected === false) return;
    for (const h of expectedTurns(folded.session)) prepare({ text: h.text, reason: "expected" });
  }
  function preparedForTurn(): PreparedReply | undefined {
    const batch = committing;
    committing = null;
    if (!batch || !cache) return;
    const plain = plainMathTurn(folded.session);
    const tutor = folded.session.tutor !== undefined;
    const brief = tutor ? tutorBrief(folded.session) as unknown as TurnBrief : turnBrief(folded.session);
    const keys = tutor ? [preparedKey(folded.session, brief)] : preparedKeys(folded.session, brief);
    let selected: PreparedReply | undefined;
    for (const entry of batch.entries.values()) {
      if (!entry.available()) {
        record(entry, cache.discard(entry, "stale", batch.at));
        continue;
      }
      const keyFits = keys.includes(entry.key);
      const h = batch.generation === generation && plain && keyFits ? entry.hypotheses.find((h) => h.reason === "interim" ? sameTurn(h.text, brief.childTurn ?? "") : fitsExpected(folded.session, h.text)) : undefined;
      if (h && !selected) {
        selected = entry;
        const rec = cache.used(entry, batch.at);
        rec.kind = h.reason;
        record(entry, rec);
        preparedOutput = { prepared: "hit", preparedLeadMs: rec.leadMs, preparedKind: h.reason };
      } else record(entry, cache.discard(entry, !plain ? "not_plain" : !keyFits ? "key" : "text", batch.at));
    }
    if (!selected && batch.entries.size) preparedOutput = { prepared: "miss" };
    return selected;
  }
  /** Sentences streamed for the output being built (D-341), in the order they were sent. */
  const streamedThisOutput: string[] = [];
  /**
   * Final check 12 (2026-11-15), the help ledger: the help each emitted sentence gives is written to the log the moment
   * it goes out, with the turn it answers, so a cancellation, a deadline, a hang-up, a replacement turn and every saved
   * end read it. It only rises.
   */
  const ledger: Assistance[] = [];
  const ledgerHelp = (sent: readonly string[]) => {
    const kind = read(() => emittedHelpKind(folded.session, sent));
    if (!kind) return;
    if (!ledger.includes(kind)) ledger.push(kind);
    if (!folded.session.assistance.includes(kind)) append({ kind: "help", at: now(), assistance: kind });
  };
  /**
   * Reviews the stream started for its sentences (round 4), by the review's whole input (the line, the child's turn, the
   * turns and the stance): the whole-reply review of the same request uses each once, and never one of another input.
   */
  const streamReviews = new Map<string, { requestId: number; result: Promise<TalkReviewResult> }>();
  const reviewKey = (input: TalkReviewInput) => JSON.stringify(input);
  /** Math-truth reviews the stream started (two-layer true math), by their whole input, used once by the whole-reply check. */
  const streamMathReviews = new Map<string, { requestId: number; result: Promise<MathReviewResult> }>();
  const mathKey = (input: MathReviewInput) => JSON.stringify(input);
  /**
   * Final check 9 (2026-11-15): every terminal math review result that is not "true" (false, unsure after its retry,
   * malformed, an error, a time-out) is final for its sentence for the rest of the child turn: no second call of any
   * kind, also when the repair says the sentence again, so the repaired message is refused and code's line follows.
   * Keyed by the child turn and the sentence. A "true" is never kept: the next input is reviewed again.
   * Final check 10 (2026-11-15): the sentence key ignores only the surface (sentenceKey: case, punctuation, spaces,
   * number words against digits), so a repair that changes only "." to "!" keeps the terminal result.
   */
  const finalMath = new Map<string, Promise<MathReviewResult>>();
  const reviewMath = (input: MathReviewInput, turn: number, ms: number, onError?: (e: unknown) => void): Promise<MathReviewResult> => {
    const key = `${turn}|${sentenceKey(input.sentence)}`;
    const held = finalMath.get(key);
    if (held) return held;
    const started = runMathReview(options.mathReviewer!, input, ms, onError);
    return started.then((r) => {
      if (r.verdict !== "true" && !finalMath.has(key)) finalMath.set(key, Promise.resolve(r));
      return r;
    });
  };
  /** A review error goes to the observer; an observer that throws changes nothing. */
  const reviewError = (error: unknown) => {
    try { options.onError?.(error, { turn: folded.turns.length, source: "review" }); } catch { /* the observer is not the review */ }
  };
  const newOutput = (): TextOutput => ({ say: [], board: [], ended: null, safetyMessage: null, cancelled: false });
  const now = () => {
    let at = 0;
    try { at = clock(); } catch { /* Keep the last known time when the clock fails. */ }
    return Math.max(Number.isFinite(at) ? at : 0, log.at(-1)?.at ?? 0, folded.session.now ?? 0);
  };
  function append(e: TextLogEvent) {
    log.push(structuredClone(e));
    folded = read(() => foldTextEvent(folded, log.at(-1)!));
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
  /** One ordinary model request, labelled for the diagnostic envelope. The request is sent once, by the first call of `run`. */
  function attempt(source: "model" | "repair", send: () => Promise<unknown>): Promise<unknown> {
    const result = Promise.withResolvers<unknown>();
    let started = false;
    const run = (): Promise<unknown> => {
      if (!started) {
        started = true;
        try { result.resolve(send()); } catch (error) { result.reject(error); }
      }
      return result.promise;
    };
    if (options.withModelAttempt) {
      try {
        const seen = options.withModelAttempt(source, run) as unknown;
        if (seen && typeof (seen as Promise<unknown>).then === "function") (seen as Promise<unknown>).then(undefined, () => undefined);
      } catch { /* the envelope is an observer */ }
    }
    return run();
  }
  async function request(source: "model" | "repair", controller: AbortController) {
    const prepared = source === "model" ? preparedForTurn() : undefined;
    const requestId = nextRequestId++;
    const repair = source === "repair" && folded.attempts.at(-1)?.refusal ? {
      proposal: folded.attempts.at(-1)!.proposal,
      refusal: folded.attempts.at(-1)!.refusal!,
    } : null;
    const input = read(() => model.output === 3
      ? (folded.session.tutor ? tutorBrief(folded.session, repair ? { said: repair.proposal, refusal: repair.refusal } : null) : turnBrief(folded.session, repair ? { said: repair.proposal, refusal: repair.refusal } : null)) as unknown as ModelInput
      : modelInput(folded.session, repair));
    const at = Math.max(clock(), now());
    append({ kind: "request", at, requestId, source });
    if (folded.session.outcome || folded.request?.id !== requestId) return;
    // D-341: the turn's time budget. When it is spent, the request counts as a time-out and code's line follows.
    const left = Math.max(0, turnEndsAt - Date.now());
    let budgetTimer: ReturnType<typeof setTimeout> | undefined;
    const budget = new Promise<"budget">((resolve) => { budgetTimer = setTimeout(() => resolve("budget"), left); });
    // D-341: on a plain math turn, each sentence of `say` that passes the stream's checks goes to the child as it arrives.
    const sent: string[] = [];
    let firstSayMs: number | undefined;
    streamReviews.clear();
    streamMathReviews.clear();
    // Round 4: code's plan for the turn is settled before the call; the "kind" the model writes first decides how its
    // sentences go out: math or help stream (math-only sentences at once, others after their own review, started the
    // moment the sentence is complete); any other kind reviews every sentence first; safety streams nothing.
    // D-345: a tutor message is said only after its whole-message check: nothing streams.
    const plan = model.output === 3 && options.onSayPart && !folded.session.tutor && !folded.sent?.length && folded.pending.length === 0 ? read(() => streamPlan(folded.session)) : null;
    const session = folded.session;
    let streamDone = false;
    let words = 0;
    let seen = 0;
    const queue: { sentence: string; state: "ready" | "pending" | "drop" }[] = [];
    // The one guard of both streams (the controller's and the tutor's) for every sentence, held review and part.
    // Review of #1006: nothing goes out once the request is cancelled or another one took its place.
    // Review of #1006 (fourth check): a content hold, a safety flag or the end of the call stops the stream at once.
    // #1035: a held review that passes after code's safety guidance went out sends nothing.
    const live = () => !streamDone && !controller.signal.aborted && folded.request?.id === requestId &&
      folded.session.contentProblem === null && !folded.session.safety.flagged && !folded.session.outcome && folded.session.state !== "CONTENT_HOLD" &&
      // Review of #1006 (fifth check): never past the call's end, even while a tick waits behind the request.
      !(folded.session.startedAt !== null && now() - folded.session.startedAt >= (folded.session.limits?.endAtMs ?? 600000));
    const flush = () => {
      while (queue.length && queue[0].state !== "pending" && live()) {
        const next = queue.shift()!;
        if (next.state === "drop") continue;
        firstSayMs ??= now() - at;
        options.onSayPart!(fillName(next.sentence, session), sent.length, []);
        sent.push(next.sentence);
        ledgerHelp(sent);
      }
    };
    // D-345: a tutor message streams too. A plain teaching sentence goes out once every check passes on the words so
    // far; any other sentence is held, alone, while its safety review runs in parallel; a refused review or a failed
    // check stops the stream, and the rest waits for the whole message and its whole check.
    const tutor = model.output === 3 && options.onSayPart && !folded.sent?.length && folded.pending.length === 0 ? read(() => tutorStream(folded.session)) : null;
    // Final check 3: a refusal of a sentence that judges correctness is binding, whatever rules it names.
    const passes = (r: TalkReviewResult, sentence: string) => r.verdict === "pass" || (r.verdict === "fail" && r.rules.length > 0 && r.rules.every((id) => TUTOR_REVIEW_IGNORED.includes(id)) && !bindingReview(sentence, tutor?.wordAnswer, tutor?.stance));
    const flushTutor = () => {
      while (queue.length && queue[0].state !== "pending" && live()) {
        const next = queue.shift()!;
        if (next.state === "drop") { streamDone = true; queue.length = 0; return; }
        firstSayMs ??= now() - at;
        options.onSayPart!(fillName(next.sentence, session), sent.length, []);
        sent.push(next.sentence);
        ledgerHelp(sent);
      }
    };
    const onTutorText = tutor ? (soFar: string) => {
      if (!live()) return;
      const said = partialSay(soFar);
      if (!said || !said.kind) return;
      // A safety or stop turn never streams (code's guidance and close come first); any other kind streams, and its
      // sentences that are not plain teaching wait for their own review.
      if (said.kind === "safety" || said.kind === "stop") { streamDone = true; return; }
      // 2026-11-15 (after final check 5): the small "gate" comes whole before "say". No word goes out before it: a "say"
      // that began before a complete gate (a model that ignores the order) streams nothing on this turn, and a gate
      // about Maya, safety or a stop holds the whole message, so code's own line goes first. Code's own read is the
      // second guard: `tutor` is null (no stream at all) unless code read the turn as plainly math, with no identity
      // word, no safety and no stop (tutorStream).
      if (said.gate !== "none") { streamDone = true; return; }
      // Final check 6: the stream uses the same single gate and reading as final routing. Only "gate" then "kind" may
      // come before "say" (the schema's order); a key written twice makes the whole output malformed, so nothing further
      // streams; any priority value anywhere in the text (a copy of the reading, a cut-off reading) holds the rest.
      const seenSoFar = streamedPriority(soFar);
      if (seenSoFar.repeated || seenSoFar.priority) { streamDone = true; return; }
      if (said.before.join(",") !== "gate,kind") { streamDone = true; return; }
      // The full reading, once complete (after "say", or before it from a model that still writes it first), decides
      // as before: a reading about Maya, safety, a stop or any priority reading holds every sentence not yet sent, and
      // code's line follows the words already said. A gate that disagrees with it is recorded in the trace.
      if (said.reading && !read(() => tutorStreamReading(session, said.reading!))) { streamDone = true; return; }
      const parts = sentencesOf(said.text);
      const complete = said.complete ? parts : parts.slice(0, -1);
      for (const sentence of complete.slice(seen)) {
        const how = read(() => tutorStreamSentence(sentence, complete.slice(0, seen), tutor));
        if (how === "stop" || (how !== "send" && ((how.talk && !options.reviewer) || (how.math && !options.mathReviewer)))) { streamDone = true; return; }
        const before = complete.slice(0, seen);
        seen++;
        const item: { sentence: string; state: "ready" | "pending" | "drop" } = { sentence, state: how === "send" ? "ready" : "pending" };
        queue.push(item);
        if (how !== "send") {
          // The sentence is held, alone, while its reviews run in parallel: the safety review when it is not plain
          // teaching, the math-truth review when code did not read its math whole. Both must pass.
          const checks: Promise<boolean>[] = [];
          if (how.talk) {
            const input = reviewInput(session, sentence, tutor.stance);
            const started = runReview(options.reviewer!, input, options.reviewTimeLimitMs ?? CONVERSATION_REVIEW_TIME_LIMIT_MS);
            streamReviews.set(reviewKey(input), { requestId, result: started });
            checks.push(started.then((r) => passes(r, sentence)));
          }
          if (how.math) {
            const input = read(() => mathReviewInput(session, sentence, before));
            const started = reviewMath(input, session.turns.length, options.reviewTimeLimitMs ?? CONVERSATION_REVIEW_TIME_LIMIT_MS);
            streamMathReviews.set(mathKey(input), { requestId, result: started });
            checks.push(started.then((r) => r.verdict === "true"));
          }
          void Promise.all(checks).then((ok) => {
            if (!live()) return;
            item.state = ok.every(Boolean) ? "ready" : "drop";
            flushTutor();
          });
        }
      }
      flushTutor();
    } : undefined;
    const onText = tutor ? onTutorText : plan ? (soFar: string) => {
      if (!live()) return;
      const said = partialSay(soFar);
      if (!said || !said.kind) return;
      if (said.kind === "safety") { streamDone = true; return; }
      const reviewAll = said.kind !== "math" && said.kind !== "help" && !plan.greeting;
      const parts = sentencesOf(said.text);
      const complete = said.complete ? parts : parts.slice(0, -1);
      for (const sentence of complete.slice(seen)) {
        const how = read(() => streamSentence(sentence, plan, seen, words, reviewAll, complete.slice(0, seen)));
        if (how === "stop" || (how === "review" && !options.reviewer)) { streamDone = true; return; }
        seen++;
        words += sentence.split(/\s+/).filter(Boolean).length;
        const item: { sentence: string; state: "ready" | "pending" | "drop" } = { sentence, state: how === "send" ? "ready" : "pending" };
        queue.push(item);
        if (how === "review") {
          const input = reviewInput(session, sentence, plan.stance);
          const started = runReview(options.reviewer!, input, options.reviewTimeLimitMs ?? CONVERSATION_REVIEW_TIME_LIMIT_MS);
          streamReviews.set(reviewKey(input), { requestId, result: started });
          void started.then((result) => {
            if (!live()) return;
            item.state = result.verdict === "pass" ? "ready" : "drop";
            flush();
          });
        }
      }
      flush();
    } : undefined;
    const streamed = () => {
      streamDone = true;
      streamedThisOutput.push(...sent.map((x) => fillName(x, session)));
      return sent.length ? { sent: [...sent], firstSayMs } : {};
    };
    // The handler logs even a late response from a provider that ignores abort; a response after the budget is stale.
    // Final check 6: the raw text as it streamed in, so a priority value in it is kept even when the final parse fails,
    // and a key written twice is seen (a final parse keeps only the last copy). Every version 3 request reads its raw
    // text, also when no sentence may stream on this turn (then nothing is sent from it).
    let raw = "";
    const onRaw = onText || model.output === 3 ? (soFar: string) => { raw = soFar; onText?.(soFar); } : undefined;
    const rawScan = () => (raw ? streamedPriority(raw) : { repeated: false, priority: null });
    const withPriority = (p: Record<string, unknown> | null) => (p ? { priority: p } : {});
    const answered = Promise.resolve().then(() => prepared ? prepared.use(onRaw, controller.signal) : attempt(source, () => model.propose(input, controller.signal, onRaw))).then((proposal) => ({ proposal }), (error: unknown) => ({ error }));
    const response = Promise.race([answered, budget]).then((got) => {
      clearTimeout(budgetTimer);
      if (got === "budget") {
        streamDone = true;
        // Final check 6: a priority value the stream already holds applies even though the model did not finish.
        if (folded.request?.id === requestId) append({ kind: "response", at: now(), requestId, error: classifyError(new Error("the turn's time is up"), "model"), ...withPriority(rawScan().priority), ms: now() - at, ...streamed() });
        return;
      }
      const scan = rawScan();
      // Final check 8 (2026-11-15): a parsed proposal that does not carry every priority value of its raw text (one in a
      // fenced copy the parse dropped, or after an invalid value) is malformed for routing too: the raw value applies.
      const lost = "proposal" in got && !priorityCovered(streamedPriority(JSON.stringify(got.proposal ?? null)).priority, scan.priority);
      if ("proposal" in got && (scan.repeated || lost)) {
        // Final check 6: a key written twice makes the whole output malformed for routing: no part of it is used, and any
        // priority value in any copy applies (fail closed). It counts as output that is not valid JSON.
        streamDone = true;
        append({ kind: "response", at: now(), requestId, error: classifyError(new Error("the output repeats a key: not valid JSON"), "model"), ...withPriority(scan.priority), ms: now() - at, ...streamed() });
        return;
      }
      if ("proposal" in got) {
        // A proposal the client read from inside one code fence is counted in the trace (`fenced`), never told apart otherwise.
        streamDone = true;
        // 2026-11-15: a tutor gate that disagrees with the full reading is recorded (`gateDisagrees`).
        const disagrees = session.tutor && gateDisagrees(got.proposal);
        append({ kind: "response", at: now(), requestId, proposal: got.proposal, ...(readFromFence(got.proposal) ? { fenced: true as const } : {}), ...(disagrees ? { gateDisagrees: true as const } : {}), ms: now() - at, ...streamed() });
        return;
      }
      streamDone = true;
      const stale = folded.request?.id !== requestId;
      // Final check 6: a complete priority value seen in the stream is kept when the final parse fails (or the model
      // fails after it): its guidance or the disclosure is due, never a return to math. A stale request changes nothing.
      append({ kind: "response", at: now(), requestId, error: classifyError(got.error, "model"), ...withPriority(scan.priority), ms: now() - at, ...streamed() });
      if (!stale) options.onError?.(got.error, { turn: folded.turns.length, source });
    });
    if (await wait(response, controller) === stopped || controller.signal.aborted) return;
    await reviewCandidate(controller);
  }
  async function reviewCandidate(controller: AbortController) {
    const candidate = folded.candidate;
    if (!candidate) return;
    const requestId = candidate.requestId;
    // Priority readings are already folded before any external free-talk review.
    const first = read(() => step(folded.session, { type: "proposal", at: now(), proposal: candidate.proposal, ...(folded.sent?.length ? { sent: [...folded.sent] } : {}) }));
    const texts = [...new Set(first.refusal ? [] : first.effects.flatMap((e) => e.kind === "say" ? e.talk ?? [] : []).filter((t) => t.code === null && t.review === "not_run").map((t) => t.proposed))];
    // Two-layer true math: the tutor sentences code did not read whole, each with the sentences before it in the message.
    const said = first.refusal ? [] : first.effects.flatMap((e) => (e.kind === "say" ? [e] : []));
    const mathTexts = [...new Set(said.flatMap((e) => (e.math ?? []).filter((m) => m.verdict === "not_run").map((m) => m.sentence)))];
    const t0 = now();
    const before = folded.session;
    const stance = before.conversational ? read(() => codeStance(before)) : "none";
    // A sentence the stream of this request already sent to the same review is not reviewed twice (round 4). Every other
    // review starts now, all at once.
    const used: string[] = [];
    const reviews = options.reviewer ? Promise.all(texts.map((text) => {
      const input = reviewInput(before, text, stance);
      const key = reviewKey(input);
      const streamed = streamReviews.get(key);
      if (streamed && streamed.requestId === requestId) used.push(key);
      const result = streamed && streamed.requestId === requestId ? streamed.result : runReview(options.reviewer!, input, options.reviewTimeLimitMs ?? (before.conversational ? CONVERSATION_REVIEW_TIME_LIMIT_MS : REVIEW_TIME_LIMIT_MS), reviewError);
      return result.then((r) => ({ text, result: r }));
    })) : Promise.resolve([]);
    // The math-truth reviews run beside the safety reviews; one the stream started for the same input is used once.
    const say = candidate.proposal && typeof candidate.proposal === "object" ? (candidate.proposal as { say?: unknown }).say : undefined;
    const message = typeof say === "string" ? sentencesOf(say.trim()) : [];
    const mathUsed: string[] = [];
    // Each place a sentence stands in the message is reviewed with its own context, and a sentence passes only when every
    // place of it passes (final check of #1044: "The result we just computed is 4." said twice).
    const places = message.flatMap((text, at) => (mathTexts.includes(text) ? [{ text, at }] : []));
    for (const text of mathTexts) if (!places.some((p) => p.text === text)) places.push({ text, at: -1 });
    const mathReviews: Promise<MathReview[]> = options.mathReviewer ? Promise.all(places.map(({ text, at }) => {
      const input = read(() => mathReviewInput(before, text, at > 0 ? message.slice(0, at) : []));
      const key = mathKey(input);
      const streamed = streamMathReviews.get(key);
      if (streamed && streamed.requestId === requestId) mathUsed.push(key);
      const result = streamed && streamed.requestId === requestId ? streamed.result : reviewMath(input, before.turns.length, options.reviewTimeLimitMs ?? (before.conversational ? CONVERSATION_REVIEW_TIME_LIMIT_MS : REVIEW_TIME_LIMIT_MS), reviewError);
      return result.then((r) => ({ text, result: r }));
    })).then((all) => mathTexts.map((text) => all.find((m) => m.text === text && m.result.verdict !== "true") ?? all.find((m) => m.text === text)!)) : Promise.resolve([]);
    const reviewed = Promise.all([reviews, mathReviews]).then(([results, maths]) => {
      for (const key of used) streamReviews.delete(key);
      for (const key of mathUsed) streamMathReviews.delete(key);
      append({ kind: "review", at: now(), requestId, reviews: results, mathReviews: maths, ...((texts.length && options.reviewer) || (mathTexts.length && options.mathReviewer) ? { reviewMs: now() - t0 } : {}) });
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
    for (const proposal of read(() => fallbacks(folded.session))) {
      append({ kind: "fallback", at: now(), proposal });
      if (folded.session.outcome) return;
    }
    append({ kind: "input", at: now(), event: { type: "technical", at: now(), detail: "Maya had no safe line to say" } });
  }
  async function pump(controller: AbortController) {
    sendGuidance();
    for (let n = 0; n < MAX_MAYA_TURNS && !controller.signal.aborted; n++) {
      if (folded.session.outcome) break;
      turnEndsAt = Date.now() + (options.turnBudgetMs ?? TURN_BUDGET_MS);
      const urgent = folded.session.safety.flagged || folded.session.contentProblem !== null;
      if (folded.childState === "child_speaking" && !urgent) break;
      if (read(() => nextActs(folded.session)).expect !== "maya") break;
      const { state, safety } = folded.session;
      if (options.channel === "chat" && state === "SAFETY" && safety.guided && !folded.candidate && !folded.attempts.length) {
        closeByCode();
        break;
      }
      // D-341, round 3: a plain stop is closed in code's approved words at once, with no model call.
      if (folded.session.conversational && folded.session.stopRequested && !safety.flagged && folded.session.turn && clearStop(folded.session.turn.text) && !folded.candidate && !folded.attempts.length) {
        // The goodbye is two approved closing phrases: "Thanks for working on this with me. Bye for now!"
        append({ kind: "fallback", at: now(), proposal: { version: PROPOSAL_VERSION, act: "close", parts: [{ warm: "closing", pick: 8 }, { warm: "closing", pick: 4 }] } });
        if (!folded.session.outcome) closeByCode();
        break;
      }
      // Review of #1002: a known safety concern cuts in at once. Its guidance is code's own words, so no model call comes
      // first: a request still running for an earlier input is dropped (its late answer changes nothing), and code's
      // guidance goes out now. A model answer that already came is read first (a refused proposal needs no review).
      if (folded.session.safety.flagged && !folded.session.safety.guided && !folded.candidate && !folded.attempts.length) {
        if (folded.request) append({ kind: "recover", at: now() });
        for (const proposal of read(() => fallbacks(folded.session))) {
          append({ kind: "fallback", at: now(), proposal });
          if (folded.session.safety.guided || folded.session.outcome) break;
        }
        if (!folded.session.safety.guided && !folded.session.outcome) append({ kind: "input", at: now(), event: { type: "technical", at: now(), detail: "Maya had no safe line to say" } });
        sendGuidance();
        continue;
      }
      // D-345: on a tutor call, only a tutor teaching turn gets a repair (also in voice); any other turn is code's own line.
      const tutorTurn = folded.session.tutor ? read(() => tutorTeachingNow(folded.session)) : null;
      if (folded.candidate) await reviewCandidate(controller);
      else if (!folded.attempts.length) await request("model", controller);
      if (controller.signal.aborted) break;
      // With the danger known, a refused proposal gets code's guidance now, not a second model call.
      const safetyDue = folded.session.safety.flagged && !folded.session.safety.guided;
      // Words already streamed cannot be taken back: a refusal then goes straight to code's line after them.
      // A turn a priority gate took after the model's reading (a scope redirect, a confirmation) is code's own line.
      const repairs = tutorTurn === null ? options.modelRepair !== false : tutorTurn && read(() => tutorTeachingNow(folded.session));
      if (repairs && folded.attempts.at(-1)?.source === "model" && folded.attempts.at(-1)?.refusal && !folded.session.outcome && !safetyDue && Date.now() < turnEndsAt && !folded.sent?.length) await request("repair", controller);
      if (controller.signal.aborted) break;
      if (folded.attempts.length && !folded.session.outcome) {
        const refused = folded.attempts.filter((a) => a.refusal !== null).map((a) => a.proposal);
        for (const proposal of read(() => fallbacks(folded.session, refused))) {
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
    scheduled++;
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
        const out: TextOutput = { ...textOutput(folded), ...preparedOutput, ...((folded.session.thinking ?? 0) > 0 && !folded.session.outcome ? { wait: true } : {}) };
        if (out.ended) clearPrepares("ended");
        const streamedNow = [...streamedThisOutput];
        streamedThisOutput.length = 0;
        append({ kind: "delivered", at: now() });
        sayParts(out, streamedNow);
        return out;
      } catch (error) {
        options.onError?.(error, "session");
        append({ kind: "input", at: now(), event: { type: "technical", at: now(), detail: "the session failed" }, error: classifyError(error, "local") });
        throw error;
      } finally { if (active === controller) active = null; }
    });
    const settled = next.finally(() => { scheduled--; });
    queue = settled.catch(() => undefined);
    return settled;
  }
  /** The streaming hooks (D-341): each sentence in order, once the whole reply passed its checks, then the end. */
  function sayParts(out: TextOutput, streamedSentences: readonly string[] = []) {
    if (quietOpening) { quietOpening = false; return; }
    if (!options.onSayPart && !options.onSayEnd) return;
    // Sentences streamed while the reply came in were sent already, in order: the rest follow them.
    const queue = [...streamedSentences];
    let index = 0;
    for (const [k, said] of out.say.entries()) for (const sentence of sentencesOf(said)) {
      if (queue[0] === sentence) { queue.shift(); index++; continue; }
      options.onSayPart?.(sentence, index++, k === 0 && index === 1 ? out.board : []);
    }
    options.onSayEnd?.();
  }
  function receive(event: SessionEvent, respond = true): Promise<TextOutput> {
    recover();
    const nonInterrupting = event.type === "writing" || event.type === "tick" || event.type === "start" || event.type === "content_problem" || event.type === "maya_said";
    if (!nonInterrupting) { generation++; active?.abort(); }
    if (event.type === "child_turn" && event.final !== false) {
      if (committing && cache) discard(committing.entries, "stale");
      committing = cache ? { generation, entries: cache.takeAll(), at: event.at } : null;
      prepareCount = 0;
      preparedOutput = cache ? { prepared: "none" } : {};
    } else if (event.type !== "maya_said" && event.type !== "tick" && event.type !== "writing" && event.type !== "start") clearPrepares("stale");
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
  function preparationRecords() {
    for (const [rec, entry] of costs) Object.assign(rec, entry.cost() ?? {});
    return structuredClone(preparations);
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
      ...(session.tutor ? { mathReviewer: options.mathReviewer ? { id: options.mathReviewer.id, promptVersion: options.mathReviewer.promptVersion, ...(options.mathReviewer.retry ? { retryId: options.mathReviewer.retry.id } : {}) } : null } : {}),
      scopeRefusals: structuredClone(session.scopeRefusals ?? []),
      ...(preparations.length ? { preparations: preparationRecords() } : {}),
      obligations: structuredClone(obligations), turns: structuredClone(turns), board: structuredClone(board), outcome, counts: traceCounts(turns),
    }, options.childName ?? null);
  }
  return {
    start: async (opts = {}) => {
      quietOpening = opts.openingSpoken === true;
      const out = await receive({ type: "start", at: now() });
      // D-341: the voice worker speaks the opening itself; the trace keeps it and the board batch comes back.
      prepareNext();
      return opts.openingSpoken ? { ...out, say: [] } : out;
    },
    prepare,
    cancelPending: () => { preparationStopped = true; generation++; active?.abort(); clearPrepares("ended"); },
    child: (text, opts = {}) => {
      const pending = receive({ type: "child_turn", at: now(), text, ...structuredClone(opts) });
      const version = generation;
      return pending.then((out) => { if (version === generation && !out.cancelled) { if (committing) { discard(committing.entries, "not_plain"); committing = null; } prepareNext(); } return out; });
    },
    partial: (text) => receive({ type: "child_turn", at: now(), text, final: false }, false),
    mayaSaid: (text) => receive({ type: "maya_said", at: now(), text }),
    contentProblem: (detail) => receive({ type: "content_problem", at: now(), detail: redactText(detail) }),
    tick: () => receive({ type: "tick", at: now() }),
    writing: (status) => receive({ type: "writing", at: now(), status }),
    technical: (detail) => receive({ type: "technical", at: now(), detail: redactText(detail) }, false),
    safety: (severity) => receive({ type: "safety", at: now(), severity }),
    get session() { return structuredClone(folded.session); },
    helpLedger: () => [...ledger],
    get ended() { return folded.session.outcome !== null; },
    finish: async (end = {}, oldFailed) => {
      const { reason = "technical_issue", detail = "the session was closed before the call ended", failed = false }: FinishOptions = typeof end === "string" ? { detail: end, failed: oldFailed ?? false } : end;
      recover(); generation++; active?.abort(); clearPrepares("ended");
      if (folded.session.startedAt === null) append({ kind: "input", at: now(), event: { type: "start", at: now() } });
      append({ kind: "input", at: now(), event: reason === "child_stopped" ? { type: "hang_up", at: now() } : { type: "technical", at: now(), detail: redactText(detail) }, ...(failed ? { error: classifyError(null, "local") } : {}) });
      await schedule(false);
      return trace();
    },
    trace,
    saved: async () => structuredClone({ ...(preparations.length ? { preparations: preparationRecords() } : {}), v: 6 as const, initial, checkpoint, nextRequestId, log, session: folded.session, turns: folded.turns, board: folded.board, endedAt: folded.endedAt, approved: folded.approved, obligations: folded.obligations, childState: folded.childState }),
  };
}
