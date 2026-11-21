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
  checkTutorSay,
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
  streamedDrawing,
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
import { continuedSay } from "@/lib/maya/tutor";
import { checkedExchangeProposal, checkedExchangeWaitingForBoard, childExchangeProposal } from "@/lib/maya/session";
import type { ExchangeTarget } from "@/lib/maya/checked-exchange";
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
/**
 * #1107 (prompt 13): `noDraw` is the model's "noDraw" when it came whole before "say" as a list of sentence numbers (each a
 * whole number from 1, at most 20); null when it is missing there, malformed, or written after "say".
 */
export function partialSay(soFar: string): { text: string; complete: boolean; kind: string | null; gate: string | null; reading: Record<string, unknown> | null; before: string[]; noDraw: number[] | null } | null {
  const open = /^\s*\{\s*/.exec(soFar);
  if (!open) return null;
  const head = keysFrom(soFar, open[0].length, true, "say");
  if (head.at < 0) return null;
  const before = head.keys;
  const i = head.at;
  if (soFar[i] !== '"') return null;
  const kind = typeof before.kind === "string" ? before.kind : Object.keys(before).length === 0 ? "math" : null;
  const gate = typeof before.gate === "string" ? before.gate : null;
  const nd = before.noDraw;
  const noDraw = Array.isArray(nd) && nd.length <= 20 && nd.every((n) => Number.isSafeInteger(n) && (n as number) >= 1) ? (nd as number[]) : null;
  const readingOf = (r: unknown) => (typeof r === "object" && r !== null && !Array.isArray(r) ? (r as Record<string, unknown>) : null);
  let text = "";
  for (let k = i + 1; k < soFar.length; k++) {
    const c = soFar[k];
    if (c === '"') {
      // The keys after `say`: the tutor's reading comes there (2026-11-15).
      const reading = readingOf(before.reading) ?? readingOf(keysFrom(soFar, k + 1, false, null).keys.reading);
      return { text, complete: true, kind, gate, reading, before: Object.keys(before), noDraw };
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
  return { text, complete: false, kind, gate, reading: readingOf(before.reading), before: Object.keys(before), noDraw };
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

import { reviewInput, runReview, CONVERSATION_REVIEW_TIME_LIMIT_MS, REVIEW_HEDGE_MS, REVIEW_TIME_LIMIT_MS, VOICE_REVIEW_HEDGE_MS, type TalkReviewer } from "@/lib/maya-talk-review";
import { MATH_REVIEW_HEDGE_MS, runMathReview, VOICE_MATH_REVIEW_HEDGE_MS, type MathReviewer } from "@/lib/maya-math-review";
import { BOARD_FATES, mathReviewInput, type BoardFate, type MathReview, type MathReviewInput, type MathReviewResult, type TalkReviewInput, type TalkReviewResult } from "@/lib/maya";
import { emittedHelpKind, type Assistance } from "@/lib/maya/session";
import { readFromFence } from "@/lib/ai-fenced";
import { ACK_PHRASES } from "@/lib/maya-voice-ack";
import { boardFateCounts, classifyError, packageHash, redactText, redactTrace, traceCounts, TRACE_KIND, TRACE_VERSION, type MayaTrace, type TraceBoardBatch, type TraceTurn, type TraceObligation } from "@/lib/maya-trace";

/** At most this many Maya turns in a row without the child (the easier example is up to four). */
export const MAX_MAYA_TURNS = 8;
/** D-341: the time one Maya turn may take in chat for the model and its repair, in ms. */
export const TURN_BUDGET_MS = 6_000;
/**
 * #1072 (2026-11-15): the model time reserved for the one repair of a refused tutor teaching message, in ms. The first
 * attempt and its reviews cannot spend it: the repair starts with this budget whatever time is left of the turn.
 */
export const TUTOR_REPAIR_BUDGET_MS = 6_000;
/**
 * After #1072 (2026-11-15, Chief of Staff rule: a child must not sit in silence for up to 10 s): the time of the one
 * repair on a voice turn (the session has `onSayPart`), in ms. It covers the repair's model call AND its reviews: a
 * review that starts later gets only the time left, and a repair that runs over ends in code's line. Chat keeps
 * TUTOR_REPAIR_BUDGET_MS for the model, with the review limit after it.
 */
export const VOICE_REPAIR_BUDGET_MS = 4_000;
/**
 * 2026-11-15 (fallback rate): the review time reserved inside VOICE_REPAIR_BUDGET_MS, in ms. The repair's model may use
 * the budget less this (2.5 s); its reviews end with the budget, so they always have at least this, and nothing of the
 * repair goes past the 4 s cap (a sample saw a repair's reviews get 76 ms, so every sentence timed out). Review of #1099
 * (P2): the floor is reserved inside the budget, never added after it.
 */
export const REVIEW_FLOOR_MS = 1_500;
/**
 * 2026-11-15 (fallback rate): the math-truth review's time limit on a tutor turn that is not voice (desk chat, admin text
 * calls), in ms. Chat sends the whole message at once, so a held sentence costs no silence in the middle of speech. In 10
 * desk-chat sessions the math review's p50 was 2.1 to 2.3 s and its p90 2.8 to 4.0 s: at 4 s, 7 of 58 teaching turns lost
 * their first message to a time-out; at 6 s, none of 166 reviews in 10 sessions. A stalled request is sent once more at
 * MATH_REVIEW_HEDGE_MS. Voice keeps CONVERSATION_REVIEW_TIME_LIMIT_MS.
 */
export const CHAT_MATH_REVIEW_TIME_LIMIT_MS = 6_000;
/**
 * Voice (call 21665dc6, 2026-11-15): a review that starts while the model still writes may run this much longer than its
 * own limit. The whole-message check waits for it only as long as for a review it starts itself, so the child waits no
 * longer than before; the early start gives the review the time the model still writes. On 30 voice tutor turns the math
 * review's p90 was 3.2 s against its 4 s limit, and 12 of 91 timed out.
 */
export const VOICE_EARLY_REVIEW_EXTRA_MS = 3_000;

/** A review started earlier, read for at most `ms` more; after that it counts as `late()` (a time-out never passes). */
function within<T>(result: Promise<T>, ms: number, late: () => T): Promise<T> {
  return new Promise<T>((resolve) => {
    let done = false;
    const end = (r: () => T) => { if (done) return; done = true; clearTimeout(timer); resolve(r()); };
    const timer = setTimeout(() => end(late), ms);
    result.then((r) => end(() => r), () => end(late));
  });
}

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
  checkedExchange?: boolean;
  /** #1153: teach addition with regrouping as a checked lesson too. */
  checkedAddition?: boolean;
  checkedRoutine?: boolean;
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
   * #1072: the model time reserved for the repair of a refused tutor teaching message (default TUTOR_REPAIR_BUDGET_MS;
   * VOICE_REPAIR_BUDGET_MS on a voice turn). The first attempt and its reviews never spend it. In chat the repair's
   * reviews keep the review time limit, so the turn is bounded by the turn budget, the repair budget and two review
   * limits. On a voice turn the repair's reviews end inside this budget too.
   */
  repairBudgetMs?: number;
  /**
   * After #1072: a voice turn's repair starts and nothing was said in the turn yet. The voice worker may say its thinking
   * phrase now (`ACK_PHRASES`, its own choice rule) and returns the phrase's id, or null when it said none. The id is kept
   * on the repair attempt in the trace (`filler`). Only a voice call sets it; it is called only when `onSayPart` is set.
   */
  onRepairStart?: () => string | null;
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
   * #1107: desk chat (`channel` "chat") sets it too, so its checked sentences reach the desk as they pass; chat keeps its
   * own review limits and repair budget (only a voice turn takes the voice ones).
   */
  onSayPart?: (sentence: string, index: number, boardCues: Batch[]) => void;
  /**
   * #1107 (chat): saves the session as it is now (the caller writes `saved()` to the call's store) and answers whether the
   * store took it. With it, each checked sentence is first pending with its drawing (`board`, given to
   * `onSayPart` as its one cue), and goes out only after the save. Confirmation is saved after server dispatch;
   * it does not prove child receipt. A refused or failed save stops successors. The rest of
   * the message reaches the caller only in the turn's output (no `onSayPart` after the whole check). A saved session
   * whose request stopped after its parts is `interrupted`; `settleInterrupted` ends that turn with no model call.
   */
  persist?: () => Promise<boolean>;
  onSayCancel?: (fromIndex: number) => void;
  onSayEnd?: () => void;
  checkedBoardSettled?: () => Promise<void> | undefined;
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
  exchangeTurnId?: string;
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
  /** Accepts an exchange on the shown board and commits its checked reply as one input. */
  exchange(target: ExchangeTarget): TextOutput | null;
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
  /**
   * B1 ("shown means shown"): what the child's screen did with Maya's board batches, by transaction id. Says nothing and
   * draws nothing. The first word for a batch she sent stands; a word for another batch, or a second word, changes
   * nothing. A skipped or cancelled drawing is no longer counted as drawn; a drawing with no word stays "sent".
   */
  boardFates(fates: readonly BoardFateReport[]): void;
  exchangePresented(batchIds: readonly string[]): void;
  exchangePlayback(turnId: string, playback: "finished" | "interrupted"): boolean;
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
  /**
   * #1107: a session saved in the middle of a child turn whose request stopped after saved parts (the process went away):
   * the child's words of that turn. Null otherwise.
   */
  readonly interrupted: { text: string } | null;
  /**
   * #1107: ends an interrupted turn from its saved parts, with no model or review call and no new child turn: the request
   * counts as stopped (an error), and code's own line follows the saved sentences, as after any request that fails once
   * its sentences went out (no repair). Their help and drawings stay. Answers the turn's output; a session that is not
   * interrupted answers an empty one.
   */
  settleInterrupted(): Promise<TextOutput>;
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

/** B1: one word from the child's screen about one of Maya's board batches. */
export interface BoardFateReport { batchId: string; fate: BoardFate }
/** The most words the session takes in one report. */
export const MAX_FATE_REPORTS = 32;
/** The words of a report the session can read: a transaction id it could have sent and a known fate, each batch once. */
export function readFateReports(raw: unknown): BoardFateReport[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_FATE_REPORTS) return null;
  const out: BoardFateReport[] = [];
  for (const x of raw) {
    if (typeof x !== "object" || x === null) return null;
    const { batchId, fate } = x as { batchId?: unknown; fate?: unknown };
    if (typeof batchId !== "string" || !batchId || batchId.length > 64 || !BOARD_FATES.includes(fate as BoardFate)) return null;
    if (!out.some((f) => f.batchId === batchId)) out.push({ batchId, fate: fate as BoardFate });
  }
  return out;
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
    session: resume ? structuredClone(resume.session) : createSession({ callId: options.callId, confirmWorkbook: options.confirmWorkbook, channel: options.channel, package: options.package, random: options.random, grade: options.grade, history: options.history, childName: options.childName, freeTalk: options.freeTalk === true, limitMs: options.limitMs, conversational: model.output === 3, tutor: options.tutor === true, checkedExchange: options.checkedExchange, checkedAddition: options.checkedAddition, checkedRoutine: options.checkedRoutine }),
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
  let needsRecovery = folded.request !== null || !!folded.output.exchangeTurnId;
  let settlingInterrupted = false;
  let active: AbortController | null = null;
  let generation = 0;
  let queue: Promise<unknown> = Promise.resolve();
  let turnEndsAt = Number.POSITIVE_INFINITY;
  // After #1072: on a voice repair the reviews end with the repair's budget (VOICE_REPAIR_BUDGET_MS); otherwise no end.
  let reviewEndsAt = Number.POSITIVE_INFINITY;
  /** A review's time limit: its own limit, or the time left of a voice repair when that is less. */
  const reviewLimit = (ms: number) => Math.min(ms, Math.max(0, reviewEndsAt - Date.now()));
  /**
   * #1107: a voice turn. Chat streams its checked sentences through the same hooks (`onSayPart`), but it keeps chat's
   * own review limits, hedges and repair budget, and never asks for a thinking phrase: only these timings tell them apart.
   */
  const voice = options.onSayPart !== undefined && options.channel !== "chat";
  /** The math review's own limit: a voice turn's is the conversational limit, a chat or text turn's is longer. */
  const mathLimit = (conversational: boolean) => options.reviewTimeLimitMs ?? (!conversational ? REVIEW_TIME_LIMIT_MS : voice ? CONVERSATION_REVIEW_TIME_LIMIT_MS : CHAT_MATH_REVIEW_TIME_LIMIT_MS);
  // Call 21665dc6 (2026-11-15): a voice review is sent once more at the voice p90; chat and text keep their delays (#1099).
  const talkHedge = voice ? VOICE_REVIEW_HEDGE_MS : REVIEW_HEDGE_MS;
  const mathHedge = voice ? VOICE_MATH_REVIEW_HEDGE_MS : MATH_REVIEW_HEDGE_MS;
  /** The own limit of a review started while the model still writes (only voice streams); a voice repair's end still caps it. */
  const earlyLimit = (ms: number) => reviewLimit(ms + VOICE_EARLY_REVIEW_EXTRA_MS);
  let quietOpening = false;
  let scheduled = 0;
  let prepareCount = 0;
  let preparationStopped = false;
  const preparations: PrepareRecord[] = structuredClone(resume?.preparations ?? []);
  const costs = new Map<PrepareRecord, PreparedReply>();
  const checkedRoutine = initial.session.checkedRoutine === true;
  const cache = options.spend && model.output === 3 && !checkedRoutine ? preparedReplies(model, options.spend, () => now(), options.prepareModel, options.prepareHandleId) : null;
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
    if (!plainMathTurn(copy.session) || copy.session.outcome || checkedExchangeProposal(copy.session)) return false;
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
  const streamReviews = new Map<string, { requestId: number; result: Promise<TalkReviewResult>; stop?: AbortController }>();
  const reviewKey = (input: TalkReviewInput) => JSON.stringify(input);
  /** Math-truth reviews the stream started (two-layer true math), by their whole input, used once by the whole-reply check. */
  type StreamMathReview = { requestId: number; result: Promise<MathReviewResult>; stop: AbortController; observed: MathReview | null };
  const streamMathReviews = new Map<string, StreamMathReview>();
  /**
   * Review of #1109 (money): the reviews a model request started while it streamed end when no one will read them: the
   * request was dropped, failed or ran out of time, the whole check stopped waiting for one, or the check is done. A
   * review that ends sends no copy (its hedge timer stops with it). One controller per request, by its id.
   */
  const reviewStops = new Map<number, AbortController>();
  /** The reviews of the turn that runs now (`schedule`); aborted with the turn's controller and when the turn is done. */
  let turnReviews = new AbortController();
  const stopReviews = (requestId?: number) => {
    for (const [id, c] of reviewStops) if (requestId === undefined || id === requestId) { c.abort(); reviewStops.delete(id); }
  };
  const mathKey = (input: MathReviewInput) => JSON.stringify(input);
  function startStreamMath(input: MathReviewInput, requestId: number, turn: number, ms: number, own: { stop: AbortController; signal: AbortSignal }) {
    const result = reviewMath(input, turn, ms, undefined, own.signal);
    const entry: StreamMathReview = { requestId, result, stop: own.stop, observed: null };
    streamMathReviews.set(mathKey(input), entry);
    void result.then(review => { if (!own.signal.aborted) entry.observed = { text: input.sentence, result: review }; });
    return result;
  }
  /**
   * Final check 9 (2026-11-15): every terminal math review result that is not "true" (false, unsure after its retry,
   * malformed, an error, a time-out) is final for its sentence for the rest of the child turn: no second call of any
   * kind, also when the repair says the sentence again, so the repaired message is refused and code's line follows.
   * Keyed by the child turn and the sentence. A "true" is never kept: the next input is reviewed again.
   * Final check 10 (2026-11-15): the sentence key ignores only the surface (sentenceKey: case, punctuation, spaces,
   * number words against digits), so a repair that changes only "." to "!" keeps the terminal result.
   */
  const finalMath = new Map<string, Promise<MathReviewResult>>();
  /**
   * Final check 12 (2026-11-15): the sentences refused by a terminal review in each child turn, with the reason: the
   * review of every later sentence of that turn reads them (MathReviewInput.refused, version 8), so a repair that says
   * the same math in another surface form is refused too.
   */
  const refusedMath = new Map<number, { sentence: string; reason: string }[]>();
  /** A math review read too late is a time-out, final for its sentence for the rest of the child turn (final check 9). */
  const mathLate = (turn: number, sentence: string): MathReviewResult => {
    const late: MathReviewResult = { verdict: "unsure", reason: "the math review did not answer in time" };
    const key = `${turn}|${sentenceKey(sentence)}`;
    if (!finalMath.has(key)) {
      finalMath.set(key, Promise.resolve(late));
      refusedMath.set(turn, [...(refusedMath.get(turn) ?? []), { sentence, reason: late.reason }]);
    }
    return late;
  };
  const reviewMath = (given: MathReviewInput, turn: number, ms: number, onError?: (e: unknown) => void, stop?: AbortSignal): Promise<MathReviewResult> => {
    const key = `${turn}|${sentenceKey(given.sentence)}`;
    const held = finalMath.get(key);
    if (held) return held;
    const earlier = (refusedMath.get(turn) ?? []).filter((x) => x.sentence !== given.sentence);
    const input = earlier.length ? { ...given, refused: earlier } : given;
    const started = runMathReview(options.mathReviewer!, input, ms, onError, mathHedge, stop);
    return started.then((r) => {
      // A stopped review was never read: it is no verdict on the sentence (review of #1109).
      if (r.verdict !== "true" && !finalMath.has(key) && !stop?.aborted) {
        finalMath.set(key, Promise.resolve(r));
        refusedMath.set(turn, [...(refusedMath.get(turn) ?? []), { sentence: given.sentence, reason: r.reason }]);
      }
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
  // A save can overlap raw priority and concurrent input. Compact after its ordered delivery decision.
  // Pending state is replayable and safe even when the process loses ownership before that decision.
  let partSaves = 0;
  function compact() {
    if (!partSaves && (log.length >= 64 || logBytes >= 65536)) {
      checkpoint = saveTextCheckpoint(folded);
      log.length = 0; logBytes = 0;
    }
  }
  function append(e: TextLogEvent) {
    const entry = structuredClone(e);
    log.push(entry);
    folded = read(() => foldTextEvent(folded, entry));
    logBytes += new TextEncoder().encode(JSON.stringify(e)).byteLength + 1;
    compact();
    return entry;
  }
  function recover() {
    if (!needsRecovery) return;
    needsRecovery = false;
    append({ kind: "recover", at: now() });
  }
  /** #1107: the child's words of a turn whose request stopped after its saved parts (restored from the store). */
  function interruptedTurn(): { text: string } | null {
    return needsRecovery && folded.request && !folded.candidate && ((folded.parts ?? 0) > 0 || folded.streamDelivery || folded.streamHold?.requestId === folded.request.id) && folded.session.turn ? { text: folded.session.turn.text } : null;
  }
  /** #1107: ends an interrupted turn with code's line after its saved parts; no model call (the pump finds a failed attempt). */
  async function settle(): Promise<TextOutput> {
    if (!interruptedTurn()) return Promise.resolve(newOutput());
    needsRecovery = false;
    const priority = folded.streamHold?.priority;
    if (folded.streamDelivery && !priority && !folded.session.safety.flagged) {
      append({ kind: "stream_interrupted", at: now(), requestId: folded.request!.id, detail: "Stream delivery or final priority is unknown. Teaching stopped before reconciliation." });
      return schedule(false);
    }
    append({ kind: "response", at: now(), requestId: folded.request!.id, error: classifyError(new Error("the request stopped before it finished"), "local"), ...(priority ? { priority } : {}), ms: 0 });
    settlingInterrupted = true;
    try { return await schedule(); } finally { settlingInterrupted = false; }
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
  async function request(source: "model" | "repair", controller: AbortController, filler: string | null = null) {
    const prepared = source === "model" ? preparedForTurn() : undefined;
    const requestId = nextRequestId++;
    const repair = source === "repair" && folded.attempts.at(-1)?.refusal ? {
      proposal: folded.attempts.at(-1)!.proposal,
      refusal: folded.attempts.at(-1)!.refusal!,
    } : null;
    // 2026-11-15 (voice fallbacks): a tutor repair after streamed sentences continues them. They are fixed: the brief names
    // them (`alreadySaid`) and asks only for the rest; the whole message (them, then the rest) is checked as one.
    const lead = source === "repair" && folded.session.tutor && folded.sent?.length ? [...folded.sent] : [];
    const input = read(() => model.output === 3
      ? (folded.session.tutor ? tutorBrief(folded.session, repair ? { said: repair.proposal, refusal: repair.refusal, ...(lead.length ? { alreadySaid: lead } : {}) } : null) : turnBrief(folded.session, repair ? { said: repair.proposal, refusal: repair.refusal } : null)) as unknown as ModelInput
      : modelInput(folded.session, repair));
    const at = Math.max(clock(), now());
    append({ kind: "request", at, requestId, source, ...(filler ? { filler } : {}), ...(lead.length ? { continuation: true as const } : {}) });
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
    // The reviews of an earlier request are out of the maps now, so no one reads them.
    stopReviews();
    const requestStop = new AbortController();
    reviewStops.set(requestId, requestStop);
    /** One review's own stop, which also ends with this request's and with the turn's controller. */
    const reviewStop = () => {
      const stop = new AbortController();
      return { stop, signal: AbortSignal.any([controller.signal, turnReviews.signal, requestStop.signal, stop.signal]) };
    };
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
    // Save pending, dispatch synchronously, then save confirmation. Only confirmation accepts words, drawing and help.
    // A refused save stops successors. Recovery never infers dispatch or final priority from an incomplete request.
    const persisting = options.persist !== undefined;
    let streamHeld = false;
    const holdStream = (priority?: Record<string, unknown> | null) => {
      streamHeld = true;
      streamDone = true;
      queue.length = 0;
      if (persisting && folded.request?.id === requestId && (!folded.streamHold || (priority && JSON.stringify(priority) !== JSON.stringify(folded.streamHold.priority)))) {
        append({ kind: "stream_hold", at: now(), requestId, ...(priority ? { priority } : {}) });
      }
    };
    let delivery: Promise<void> = Promise.resolve();
    let persistFailed = false;
    /** The model's "noDraw" when it came whole before "say" (prompt 13); null: no sentence of this request draws early. */
    let earlyNoDraw: number[] | null = null;
    /** Whether a saved part may still go to the desk: the request is this turn's own and nothing holds the turn. */
    const deliverable = () => !streamHeld && !controller.signal.aborted && folded.request?.id === requestId && folded.candidate === null &&
      folded.session.contentProblem === null && !folded.session.safety.flagged && !folded.session.outcome && folded.session.state !== "CONTENT_HOLD" &&
      !(folded.session.startedAt !== null && now() - folded.session.startedAt >= (folded.session.limits?.endAtMs ?? 600000));
    const emit = (sentence: string) => {
      if (!persisting) {
        firstSayMs ??= now() - at;
        options.onSayPart!(fillName(sentence, session), sent.length, []);
        sent.push(sentence);
        ledgerHelp(sent);
        return;
      }
      delivery = delivery.then(async () => {
        if (persistFailed || !deliverable()) return;
        const message = [...(folded.sent ?? []), sentence];
        const drawing = earlyNoDraw ? read(() => streamedDrawing(folded.session, message, (folded.streamBoard ?? []).map((b) => b.tied), earlyNoDraw!)) : null;
        partSaves++;
        append({ kind: "part_pending", at: now(), requestId, sentence, ...(drawing ? { board: { batch: drawing.batch, keys: drawing.keys, tied: drawing.tied } } : {}) });
        const persist = async () => { try { return await options.persist!(); } catch { return false; } };
        try {
          const saved = await persist();
          if (!saved || !deliverable()) {
            // The first durable snapshot is already safe if this correction fails or loses ownership.
            if (!saved) { persistFailed = true; holdStream(); }
            append({ kind: "part_discarded", at: now(), requestId });
            await persist();
            return;
          }
          // No await separates the ownership-fenced save, the hold check and server dispatch.
          // This callback does not acknowledge child receipt. A lost confirmation remains pending on disk.
          try { options.onSayPart!(fillName(sentence, session), message.length - 1, drawing ? [drawing.batch] : []); }
          catch {
            persistFailed = true; holdStream();
            append({ kind: "part_discarded", at: now(), requestId });
            await persist();
            return;
          }
          firstSayMs ??= now() - at;
          append({ kind: "part_confirmed", at: now(), requestId });
          ledgerHelp(folded.sent ?? []);
          if (!await persist()) { persistFailed = true; holdStream(); }
        } finally { partSaves--; compact(); }
      });
    };
    const flush = () => {
      while (queue.length && queue[0].state !== "pending" && live()) {
        const next = queue.shift()!;
        if (next.state === "drop") continue;
        emit(next.sentence);
      }
    };
    // D-345: a tutor message streams too. A plain teaching sentence goes out once every check passes on the words so
    // far; any other sentence is held, alone, while its safety review runs in parallel; a refused review or a failed
    // check stops the stream, and the rest waits for the whole message and its whole check.
    const tutor = model.output === 3 && options.onSayPart && !checkedRoutine && !folded.session.checkedExchange && !folded.sent?.length && folded.pending.length === 0 ? read(() => tutorStream(folded.session)) : null;
    // Final check 3: a refusal of a sentence that judges correctness is binding, whatever rules it names.
    const passes = (r: TalkReviewResult, sentence: string) => r.verdict === "pass" || (r.verdict === "fail" && r.rules.length > 0 && r.rules.every((id) => TUTOR_REVIEW_IGNORED.includes(id)) && !bindingReview(sentence, tutor?.wordAnswer, tutor?.stance));
    const flushTutor = () => {
      while (queue.length && queue[0].state !== "pending" && live()) {
        const next = queue.shift()!;
        if (next.state === "drop") { holdStream(); return; }
        emit(next.sentence);
      }
    };
    const onTutorText = tutor ? (soFar: string) => {
      if (!live()) return;
      const said = partialSay(soFar);
      if (!said || !said.kind) return;
      // A safety or stop turn never streams (code's guidance and close come first); any other kind streams, and its
      // sentences that are not plain teaching wait for their own review.
      if (said.kind === "safety" || said.kind === "stop") { holdStream(); return; }
      // 2026-11-15 (after final check 5): the small "gate" comes whole before "say". No word goes out before it: a "say"
      // that began before a complete gate (a model that ignores the order) streams nothing on this turn, and a gate
      // about Maya, safety or a stop holds the whole message, so code's own line goes first. Code's own read is the
      // second guard: `tutor` is null (no stream at all) unless code read the turn as plainly math, with no identity
      // word, no safety and no stop (tutorStream).
      if (said.gate !== "none") { holdStream(); return; }
      // Final check 6: the stream uses the same single gate and reading as final routing. Only "gate" then "kind" may
      // come before "say" (the schema's order); a key written twice makes the whole output malformed, so nothing further
      // streams; any priority value anywhere in the text (a copy of the reading, a cut-off reading) holds the rest.
      const seenSoFar = streamedPriority(soFar);
      if (seenSoFar.repeated || seenSoFar.priority) { holdStream(seenSoFar.priority); return; }
      // #1107 (prompt 13): "noDraw" may come third, before "say"; nothing else may.
      if (!["gate,kind", "gate,kind,noDraw"].includes(said.before.join(","))) { holdStream(); return; }
      // A "noDraw" missing before "say" or malformed allows no early drawing; the words still stream.
      if (seen === 0) earlyNoDraw = said.before.includes("noDraw") ? said.noDraw : null;
      // The full reading, once complete (after "say", or before it from a model that still writes it first), decides
      // as before: a reading about Maya, safety, a stop or any priority reading holds every sentence not yet sent, and
      // code's line follows the words already said. A gate that disagrees with it is recorded in the trace.
      if (said.reading && !read(() => tutorStreamReading(session, said.reading!))) { holdStream(); return; }
      const parts = sentencesOf(said.text);
      const complete = said.complete ? parts : parts.slice(0, -1);
      for (const sentence of complete.slice(seen)) {
        const how = read(() => tutorStreamSentence(sentence, complete.slice(0, seen), tutor));
        if (how === "stop" || (how !== "send" && ((how.talk && !options.reviewer) || (how.math && !options.mathReviewer)))) { holdStream(); return; }
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
            const own = reviewStop();
            const started = runReview(options.reviewer!, input, earlyLimit(options.reviewTimeLimitMs ?? CONVERSATION_REVIEW_TIME_LIMIT_MS), undefined, talkHedge, own.signal);
            streamReviews.set(reviewKey(input), { requestId, result: started, stop: own.stop });
            checks.push(started.then((r) => passes(r, sentence)));
          }
          if (how.math) {
            const input = read(() => mathReviewInput(session, sentence, before));
            const own = reviewStop();
            const started = startStreamMath(input, requestId, session.turns.length, earlyLimit(mathLimit(true)), own);
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
    // Call 21665dc6 (2026-11-15): on a voice tutor turn each sentence's reviews start, both at once, as soon as the
    // sentence is complete, also when the turn cannot stream (not plainly math) or the stream stopped. Nothing is sent
    // from here: the whole check finds the reviews running and reads them (no longer than a review it starts itself).
    // Which reviews a sentence needs is read as the stream reads it; a sentence that fails code's own check ends it.
    // A continuation's sentences start their reviews early too, each read after the fixed sentences (`lead`).
    // #1107: voice only. A chat turn reviews what its stream holds, and the whole check the rest, as before.
    const early = model.output === 3 && voice && !checkedRoutine && folded.session.tutor && (!folded.sent?.length || lead.length > 0) && folded.pending.length === 0 ? read(() => tutorStream(session, true)) : null;
    const earlyStance = early && session.conversational ? read(() => codeStance(session)) : "none";
    let earlySeen = 0;
    let earlyDone = false;
    /** A continuation that starts by saying the fixed sentences again: those are left out (continuedSay). */
    let echoed = 0;
    const onEarlyText = early ? (soFar: string) => {
      if (earlyDone || controller.signal.aborted || folded.request?.id !== requestId) return;
      const said = partialSay(soFar);
      if (!said || !said.kind) return;
      if (said.kind === "safety" || said.kind === "stop" || said.gate !== "none") { earlyDone = true; return; }
      const parts = sentencesOf(said.text);
      const complete = said.complete ? parts : parts.slice(0, -1);
      for (const sentence of complete.slice(earlySeen)) {
        if (earlySeen === echoed && echoed < lead.length && sentenceKey(sentence) === sentenceKey(lead[echoed])) { earlySeen++; echoed++; continue; }
        const before = [...lead, ...complete.slice(echoed, earlySeen)];
        earlySeen++;
        let how = read(() => tutorStreamSentence(sentence, before, early));
        // A sentence the stream may not send (a judgment, another number) may still pass the whole check: both reviews.
        if (how === "stop") {
          if (!read(() => checkTutorSay([...before, sentence].join(" "), early)).ok) { earlyDone = true; return; }
          how = { talk: true, math: true };
        }
        if (how === "send") continue;
        if (how.talk && options.reviewer) {
          const input = reviewInput(session, sentence, earlyStance);
          if (!streamReviews.has(reviewKey(input))) {
            const own = reviewStop();
            streamReviews.set(reviewKey(input), { requestId, result: runReview(options.reviewer, input, earlyLimit(options.reviewTimeLimitMs ?? CONVERSATION_REVIEW_TIME_LIMIT_MS), undefined, talkHedge, own.signal), stop: own.stop });
          }
        }
        if (how.math && options.mathReviewer) {
          const input = read(() => mathReviewInput(session, sentence, before));
          if (!streamMathReviews.has(mathKey(input))) {
            const own = reviewStop();
            startStreamMath(input, requestId, session.turns.length, earlyLimit(mathLimit(true)), own);
          }
        }
      }
    } : undefined;
    const onSentences = tutor ? onTutorText : plan ? (soFar: string) => {
      if (!live()) return;
      const said = partialSay(soFar);
      if (!said || !said.kind) return;
      if (said.kind === "safety") { holdStream(); return; }
      const reviewAll = said.kind !== "math" && said.kind !== "help" && !plan.greeting;
      const parts = sentencesOf(said.text);
      const complete = said.complete ? parts : parts.slice(0, -1);
      for (const sentence of complete.slice(seen)) {
        const how = read(() => streamSentence(sentence, plan, seen, words, reviewAll, complete.slice(0, seen)));
        if (how === "stop" || (how === "review" && !options.reviewer)) { holdStream(); return; }
        seen++;
        words += sentence.split(/\s+/).filter(Boolean).length;
        const item: { sentence: string; state: "ready" | "pending" | "drop" } = { sentence, state: how === "send" ? "ready" : "pending" };
        queue.push(item);
        if (how === "review") {
          const input = reviewInput(session, sentence, plan.stance);
          const own = reviewStop();
          const started = runReview(options.reviewer!, input, earlyLimit(options.reviewTimeLimitMs ?? CONVERSATION_REVIEW_TIME_LIMIT_MS), undefined, talkHedge, own.signal);
          streamReviews.set(reviewKey(input), { requestId, result: started, stop: own.stop });
          void started.then((result) => {
            if (!live()) return;
            item.state = result.verdict === "pass" ? "ready" : "drop";
            flush();
          });
        }
      }
      flush();
    } : undefined;
    const onText = onSentences || onEarlyText ? (soFar: string) => { onSentences?.(soFar); onEarlyText?.(soFar); } : undefined;
    const streamed = () => {
      streamDone = true;
      earlyDone = true;
      streamedThisOutput.push(...sent.map((x) => fillName(x, session)));
      return { ...(sent.length ? { sent: [...sent] } : {}), ...(firstSayMs !== undefined ? { firstSayMs } : {}) };
    };
    // The handler logs even a late response from a provider that ignores abort; a response after the budget is stale.
    // Final check 6: the raw text as it streamed in, so a priority value in it is kept even when the final parse fails,
    // and a key written twice is seen (a final parse keeps only the last copy). Every version 3 request reads its raw
    // text, also when no sentence may stream on this turn (then nothing is sent from it).
    let raw = "";
    const onRaw = onText || model.output === 3 ? (soFar: string) => {
      raw = soFar;
      // Read even after the parser stopped accepting sentences. Queued saves can still be in flight.
      if (persisting) {
        const scan = streamedPriority(soFar);
        if (scan.repeated || scan.priority) holdStream(scan.priority);
      }
      onText?.(soFar);
    } : undefined;
    const rawScan = () => (raw ? streamedPriority(raw) : { repeated: false, priority: null });
    const withPriority = (p: Record<string, unknown> | null) => (p ? { priority: p } : {});
    const answered = Promise.resolve().then(() => prepared ? prepared.use(onRaw, controller.signal) : attempt(source, () => model.propose(input, controller.signal, onRaw))).then((proposal) => ({ proposal }), (error: unknown) => ({ error }));
    const response = Promise.race([answered, budget]).then(async (got) => {
      clearTimeout(budgetTimer);
      // Ordinary completion drains the checked queue. A binding hold also reconciles a save already in flight.
      streamDone = true;
      const finalScan = rawScan();
      const finalPriority = got !== "budget" && "proposal" in got ? streamedPriority(JSON.stringify(got.proposal ?? null)).priority : null;
      if (got === "budget" || finalScan.repeated || finalScan.priority || finalPriority) holdStream(finalScan.priority ?? finalPriority);
      await delivery;
      if (got === "budget") {
        streamDone = true;
        stopReviews(requestId);
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
        stopReviews(requestId);
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
      stopReviews(requestId);
      const stale = folded.request?.id !== requestId;
      // Final check 6: a complete priority value seen in the stream is kept when the final parse fails (or the model
      // fails after it): its guidance or the disclosure is due, never a return to math. A stale request changes nothing.
      append({ kind: "response", at: now(), requestId, error: classifyError(got.error, "model"), ...withPriority(scan.priority), ms: now() - at, ...streamed() });
      if (!stale) options.onError?.(got.error, { turn: folded.turns.length, source });
    });
    if (await wait(response, controller) === stopped || controller.signal.aborted) { stopReviews(requestId); return; }
    if (folded.candidate?.requestId !== requestId) stopReviews(requestId);
    await reviewCandidate(controller);
  }
  async function reviewCandidate(controller: AbortController) {
    const candidate = folded.candidate;
    if (!candidate) return;
    const requestId = candidate.requestId;
    // Priority readings are already folded before any external free-talk review.
    // 2026-11-15 (voice fallbacks): a tutor repair after streamed sentences continues them (as the fold steps it).
    const continuation = candidate.continuation === true && candidate.source === "repair" && !!folded.sent?.length && !!folded.session.tutor;
    const first = read(() => step(folded.session, { type: "proposal", at: now(), proposal: candidate.proposal, ...(folded.sent?.length ? { sent: [...folded.sent] } : {}), ...(continuation ? { continuation: true } : {}) }));
    const texts = [...new Set(checkedRoutine || first.refusal ? [] : first.effects.flatMap((e) => e.kind === "say" ? e.talk ?? [] : []).filter((t) => t.code === null && t.review === "not_run").map((t) => t.proposed))];
    // Two-layer true math: the tutor sentences code did not read whole, each with the sentences before it in the message.
    const said = first.refusal ? [] : first.effects.flatMap((e) => (e.kind === "say" ? [e] : []));
    const mathTexts = checkedRoutine ? [] : [...new Set(said.flatMap((e) => (e.math ?? []).filter((m) => m.verdict === "not_run").map((m) => m.sentence)))];
    const t0 = now();
    const before = folded.session;
    const stance = before.conversational ? read(() => codeStance(before)) : "none";
    // Each review's time: its own limit, or the time left of a voice repair when that is less.
    const turnSignal = AbortSignal.any([controller.signal, turnReviews.signal]);
    const talkMs = reviewLimit(options.reviewTimeLimitMs ?? (before.conversational ? CONVERSATION_REVIEW_TIME_LIMIT_MS : REVIEW_TIME_LIMIT_MS));
    const mathMs = reviewLimit(mathLimit(before.conversational === true));
    // A sentence the stream of this request already sent to the same review is not reviewed twice (round 4). Every other
    // review starts now, all at once.
    const used: string[] = [];
    const reviews = options.reviewer ? Promise.all(texts.map((text) => {
      const input = reviewInput(before, text, stance);
      const key = reviewKey(input);
      const streamed = streamReviews.get(key);
      if (streamed && streamed.requestId === requestId) used.push(key);
      // Call 21665dc6: a review the stream started is read for no longer than a review started now would run.
      const result = streamed && streamed.requestId === requestId ? within(streamed.result, talkMs, (): TalkReviewResult => { streamed.stop?.abort(); return { verdict: "error", reason: "the review did not answer in time" }; }) : runReview(options.reviewer!, input, talkMs, reviewError, talkHedge, turnSignal);
      return result.then((r) => ({ text, result: r }));
    })) : Promise.resolve([]);
    // The math-truth reviews run beside the safety reviews; one the stream started for the same input is used once.
    const say = candidate.proposal && typeof candidate.proposal === "object" ? (candidate.proposal as { say?: unknown }).say : undefined;
    // A continuation's message is the fixed sentences, then its own: each sentence is reviewed after the ones before it.
    const message = typeof say === "string" ? sentencesOf(continuation ? continuedSay(folded.sent!, say)?.text ?? say.trim() : say.trim()) : [];
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
      const result = streamed && streamed.requestId === requestId ? within(streamed.result, mathMs, () => { streamed.stop?.abort(); return mathLate(before.turns.length, text); }) : reviewMath(input, before.turns.length, mathMs, reviewError, turnSignal);
      return result.then((r) => ({ text, result: r }));
    })).then((all) => mathTexts.map((text) => all.find((m) => m.text === text && m.result.verdict !== "true") ?? all.find((m) => m.text === text)!)) : Promise.resolve([]);
    const reviewed = Promise.all([reviews, mathReviews]).then(([results, maths]) => {
      for (const key of used) streamReviews.delete(key);
      for (const key of mathUsed) streamMathReviews.delete(key);
      // #1045: a complete review can be left unused when a later sentence fails the code check.
      const unusedMath = [...streamMathReviews.values()].flatMap(r => r.requestId === requestId && r.observed ? [r.observed] : []);
      append({ kind: "review", at: now(), requestId, reviews: results, mathReviews: maths, ...(unusedMath.length ? { unusedMath } : {}), ...((texts.length && options.reviewer) || (mathTexts.length && options.mathReviewer) ? { reviewMs: now() - t0 } : {}), drawMode: "derive" });
    });
    try { await wait(reviewed, controller); } finally { stopReviews(requestId); }
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
      append({ kind: "fallback", at: now(), proposal, drawMode: "derive" });
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
      const { state, safety, sensitiveHold, silence } = folded.session;
      const fixedClose = ((checkedRoutine || options.channel === "chat") && state === "SAFETY" && safety.guided) ||
        (sensitiveHold && silence === "close_due");
      if (fixedClose && !folded.candidate && !folded.attempts.length) {
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
          append({ kind: "fallback", at: now(), proposal, drawMode: "derive" });
          if (folded.session.safety.guided || folded.session.outcome) break;
        }
        if (!folded.session.safety.guided && !folded.session.outcome) append({ kind: "input", at: now(), event: { type: "technical", at: now(), detail: "Maya had no safe line to say" } });
        sendGuidance();
        continue;
      }
      // A recovered priority may have consumed the failed attempt when it cancelled teaching. Recovery still
      // finishes with code alone, including disclosure and safety; it never starts a replacement model request.
      if (settlingInterrupted && !folded.candidate && !folded.attempts.length) {
        const before = folded.pending.length;
        for (const proposal of read(() => fallbacks(folded.session))) {
          append({ kind: "fallback", at: now(), proposal, drawMode: "derive" });
          if (folded.pending.length > before || folded.session.outcome) break;
        }
        if (folded.pending.length === before && !folded.session.outcome) append({ kind: "input", at: now(), event: { type: "technical", at: now(), detail: "the interrupted turn had no safe line" } });
        sendGuidance();
        continue;
      }
      if (n === 0 && !urgent && options.checkedBoardSettled && read(() => checkedExchangeWaitingForBoard(folded.session))) {
        const board = options.checkedBoardSettled();
        if (board && await wait(board, controller) === stopped) break;
      }
      const exchange = !folded.candidate && !folded.attempts.length ? read(() => checkedExchangeProposal(folded.session)) : null;
      if (exchange) {
        append({ kind: "checked_exchange", at: now(), proposal: exchange });
        if (folded.output.exchangeTurnId) continue;
      }
      // D-345: on a tutor call, only a tutor teaching turn gets a repair (also in voice); any other turn is code's own line.
      const tutorTurn = folded.session.tutor ? read(() => tutorTeachingNow(folded.session)) : null;
      if (folded.candidate) await reviewCandidate(controller);
      else if (!folded.attempts.length) await request("model", controller);
      if (controller.signal.aborted) break;
      // With the danger known, a refused proposal gets code's guidance now, not a second model call.
      const safetyDue = folded.session.safety.flagged && !folded.session.safety.guided;
      // Words already streamed cannot be taken back: on a controller turn a refusal then goes straight to code's line after
      // them; on a tutor teaching turn the repair continues them (below). A turn a priority gate took after the model's reading (a scope redirect, a confirmation) is code's own line.
      const repairs = !checkedRoutine && (tutorTurn === null ? options.modelRepair !== false : tutorTurn && read(() => tutorTeachingNow(folded.session)));
      // 2026-11-15 (voice fallbacks): on a tutor teaching turn, words already streamed no longer end the turn in code's
      // line: the repair continues them (continuedSay), and the whole message is checked as one. The controller's turns
      // (and the AI disclosure, safety guidance and a stop, which are code's own and never stream) keep code's line.
      const refusedFirst = repairs && folded.attempts.at(-1)?.source === "model" && folded.attempts.at(-1)?.refusal && !folded.session.outcome && !safetyDue && (!folded.sent?.length || tutorTurn === true);
      // #1072 (2026-11-15): on a tutor teaching turn the repair has its own reserved budget. Production call 1b428d5b:
      // the model took 3,128 ms and the math review 2,804 ms of the 6,000 ms turn, so no repair ran and code's plain line
      // went out with no teaching. Now a refused tutor message always gets its one repair, with TUTOR_REPAIR_BUDGET_MS
      // of model time that the first attempt and its reviews cannot spend. After streamed words the repair continues them,
      // and its message is checked with them as one (continuedSay, 2026-11-15).
      if (refusedFirst && tutorTurn) {
        // After #1072 (Chief of Staff rule: no silence of up to 10 s). On a voice turn the repair and its reviews end
        // inside VOICE_REPAIR_BUDGET_MS, and the worker may say its thinking phrase at once, but only when nothing of this
        // turn was said or waits to be said: no streamed sentence and no accepted turn before it in this output (the AI
        // disclosure, safety guidance and a stop are code's own turns, and a repair never follows them).
        // Review of #1099 (P2): on a voice turn REVIEW_FLOOR_MS of the budget is the reviews' alone: the model stops that
        // much before the cap, and the reviews end at it.
        const budget = options.repairBudgetMs ?? (voice ? VOICE_REPAIR_BUDGET_MS : TUTOR_REPAIR_BUDGET_MS);
        const repairAt = Date.now();
        turnEndsAt = repairAt + (voice ? Math.max(0, budget - REVIEW_FLOOR_MS) : budget);
        if (voice) reviewEndsAt = repairAt + budget;
        // The phrase is asked for also after this message's own streamed sentences (a continuation); never after an
        // accepted turn before it. The worker applies its own rules (no phrase while a sentence still plays).
        const quiet = voice && folded.pending.length === 0 && streamedThisOutput.length === (folded.sent?.length ?? 0);
        let filler: string | null = null;
        if (quiet && options.onRepairStart) {
          try { filler = options.onRepairStart(); } catch { /* the worker's ear never fails the turn */ }
          if (!ACK_PHRASES.some((p) => p.id === filler)) filler = null;
        }
        try { await request("repair", controller, filler); } finally { reviewEndsAt = Number.POSITIVE_INFINITY; }
      } else if (refusedFirst && Date.now() < turnEndsAt) await request("repair", controller);
      if (controller.signal.aborted) break;
      if (folded.attempts.length && !folded.session.outcome) {
        const exchange = read(() => checkedExchangeProposal(folded.session, true));
        if (exchange) {
          append({ kind: "checked_exchange", at: now(), proposal: exchange });
          if (folded.output.exchangeTurnId) continue;
        }
        const refused = folded.attempts.filter((a) => a.refusal !== null).map((a) => a.proposal);
        for (const proposal of read(() => fallbacks(folded.session, refused))) {
          append({ kind: "fallback", at: now(), proposal, drawMode: "derive" });
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
      // Review of #1109: the turn owns its reviews. Every review it starts (early, final, repair; math and safety; each
      // hedge copy) takes this signal, so each ends, with its hedge timer, when the call ends or a new turn replaces this
      // one (the turn's controller aborts) and when the turn is done (finally).
      const reviews = new AbortController();
      controller.signal.addEventListener("abort", () => reviews.abort(), { once: true });
      turnReviews = reviews;
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
      } finally {
        if (active === controller) active = null;
        // The turn is done: a review still running is read by no one, so it ends and sends no copy.
        reviews.abort();
      }
    });
    const settled = next.finally(() => { scheduled--; });
    queue = settled.catch(() => undefined);
    return settled;
  }
  /** The streaming hooks (D-341): each sentence in order, once the whole reply passed its checks, then the end. */
  function sayParts(out: TextOutput, streamedSentences: readonly string[] = []) {
    if (quietOpening) { quietOpening = false; return; }
    // #1107: a chat that saves its parts sends only saved parts; the rest reaches the desk with the saved reply.
    if (options.persist) return;
    // Return the checked speech and its cues together, after the caller's save.
    if (out.exchangeTurnId || (checkedRoutine && options.onGuidance)) { options.onSayEnd?.(); return; }
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
      freeTalk: session.freeTalk, reviewer: !checkedRoutine && options.reviewer ? { id: options.reviewer.id, promptVersion: options.reviewer.promptVersion } : null,
      ...(session.tutor ? { mathReviewer: !checkedRoutine && options.mathReviewer ? { id: options.mathReviewer.id, promptVersion: options.mathReviewer.promptVersion, ...(options.mathReviewer.retry ? { retryId: options.mathReviewer.retry.id } : {}) } : null } : {}),
      scopeRefusals: structuredClone(session.scopeRefusals ?? []),
      ...(preparations.length ? { preparations: preparationRecords() } : {}),
      ...(session.checkedExchange ? { checkedExchange: structuredClone(session.checkedExchange) } : {}),
      obligations: structuredClone(obligations), turns: structuredClone(turns), board: structuredClone(board), outcome, counts: { ...traceCounts(turns), boardFates: boardFateCounts(board) },
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
    exchange(target) {
      recover();
      const at = now();
      const proposal = childExchangeProposal(folded.session, target, at);
      if (!proposal || folded.childState === "child_speaking" || folded.pending.length) return null;
      generation++;
      active?.abort();
      clearPrepares("stale");
      append({ kind: "checked_exchange", at, proposal });
      const out = textOutput(folded);
      if (!out.exchangeTurnId) return null;
      append({ kind: "delivered", at });
      return out;
    },
    partial: (text) => receive({ type: "child_turn", at: now(), text, final: false }, false),
    mayaSaid: (text) => receive({ type: "maya_said", at: now(), text }),
    contentProblem: (detail) => receive({ type: "content_problem", at: now(), detail: redactText(detail) }),
    tick: () => receive({ type: "tick", at: now() }),
    boardFates: (fates) => {
      const read = readFateReports(fates);
      if (!read?.length) return;
      // Only batches the call sent and has no word for yet (the fold checks again): no log entry for anything else.
      const known = read.filter((f) => folded.board.some((b) => b.transactionId === f.batchId && !b.fate) || folded.pending.some((p) => p.batches.some((b) => b.transactionId === f.batchId)));
      if (known.length) append({ kind: "fates", at: now(), fates: known });
    },
    exchangePlayback: (turnId, playback) => {
      const turn = folded.session.checkedExchange?.turns.find((turn) => turn.id === turnId);
      if (folded.session.outcome || !turn || turn.playback || !turn.actions.every((a) => a.delivery === "sent")) return false;
      append({ kind: "exchange_playback", at: Math.max(now(), folded.session.now ?? 0), turnId, playback });
      return true;
    },
    exchangePresented: (batchIds) => {
      if (folded.session.outcome || !folded.session.checkedExchange) return;
      for (const turn of folded.session.checkedExchange.turns) for (const action of turn.actions) {
        if (!action.presented && batchIds.includes(action.batchId) && (action.fate === "shown" ||
          folded.lateFates?.some((f) => f.batchId === action.batchId && f.fate === "shown"))) {
          append({ kind: "exchange_presented", at: Math.max(now(), folded.session.now ?? 0), batchId: action.batchId });
        }
      }
    },
    writing: (status) => receive({ type: "writing", at: now(), status }),
    technical: (detail) => receive({ type: "technical", at: now(), detail: redactText(detail) }, false),
    safety: (severity) => receive({ type: "safety", at: now(), severity }),
    get session() { return structuredClone(folded.session); },
    helpLedger: () => [...ledger],
    get ended() { return folded.session.outcome !== null; },
    get interrupted() { return interruptedTurn(); },
    settleInterrupted: () => settle(),
    finish: async (end = {}, oldFailed) => {
      const { reason = "technical_issue", detail = "the session was closed before the call ended", failed = false }: FinishOptions = typeof end === "string" ? { detail: end, failed: oldFailed ?? false } : end;
      // #1107: saved parts of a stopped request are said: their turn ends in code's line before the call ends.
      if (interruptedTurn()) await settle();
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
