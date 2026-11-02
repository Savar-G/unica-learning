// Maya's calls (#323, spec #297): one call with Maya about one question, kept as a record from the first word to the
// outcome. Today only admin test calls exist: in admin, a team member picks a supported assessment question of a test
// family's child (D-099), types the child's turns and sees Maya's replies while the board draws
// (src/app/(product)/admin/maya). The voice calls (#326) and the parent's notes (#333) build on the same record.
//
// One request is one input. The call runs in Maya's text adapter (src/lib/maya-text.ts); after each input the module
// saves what the adapter needs to go on (`live`) at the next revision, so two requests never both change a call: the
// second finds a newer revision and is refused (conflict). When the call ends, the module stores the trace (transcript,
// board commands, outcome and versions, src/lib/maya-trace.ts), the board history (src/lib/board-history.ts), the
// outcome fields and counts, and drops `live`. Then it writes the call's one learning event for the target question
// (`learningEvent` of the session, key `call:<id>`, so a retry stores it once) and rebuilds the child's profile.
// "end" on an ended call whose event, rebuild or parent note failed runs those again.
//
// The child's wording history (D-196, #375): `start` reads it before the session is made, so Maya prefers the wordings
// the child has not heard lately; the session keeps it in its saved state for the call's later requests. When the call
// ends, the wordings it said are added to it (before the learning event; again on a retried "end" while the call keeps
// its state, which changes nothing, since each wording keeps its newest time). A history that cannot be read or written
// never stops a call: the call goes on with an empty history, or keeps its outcome without the record.
//
// The parent's note (#331, src/lib/maya-call-note.ts): when a call ends, the same write that stores its outcome keeps
// the note's inputs in `notePending` (the question package and the learning event as code built it). After the event
// and the rebuild, the `note` seam writes the note within NOTE_STEP_MS; once it says "done" (stored, or refused for
// good), `notePending` is cleared, without raising the call's revision (R403-5). A failed, refused-for-now or slow note leaves it, so a retried "end" of the call, or
// the end of a later call of the same child, writes it from those inputs (R403-3, R403-4). The note never holds up the
// learning event, and the call's answer waits for it at most NOTE_STEP_MS.
// Voice calls (#326): `startVoice` makes the call's record without starting it; Maya's voice worker (worker/maya-voice)
// opens it (`openVoice`) when the child joins the call's room, and keeps the session in memory for the whole call. The
// handle saves the call after each input, as a text call is saved after each request, so the record is current and a
// second writer is refused. It also stores when the child and Maya joined and left (`connections`, migration
// add_maya_call_connections), and the call's connected seconds when it ends. The speech-to-text and voice ids go on
// the record when the worker opens it. A live voice call takes no typed input; the admin may end one only before it
// started or once it cannot still be running (VOICE_CALL_STALE_MS).
//
// Test calls never touch a real family: `start` refuses a family the seam does not call a test family, the database
// refuses it again (migration add_maya_calls), and a test call never counts minutes.
//
// The safety flag (#333): when the controller's SAFETY interrupt fires, the call is flagged in the same write that saves
// the input, and then the internal alert goes through the alerts seam (src/lib/maya-call-alert.ts): one email per call
// and flag level, sent once. A request for harmful content (#383 C29) raises the flag UNSAFE_REQUEST_FLAG names. A flag
// only rises. Each later request on a flagged call sends its alert again if it was refused or never claimed, so a
// failed alert is retried by the next input, or by "end" on an ended call; an unknown one is never sent again.
//
// Seams: the call store (Supabase: src/lib/maya-call-store.ts; memory: src/lib/maya-call-memory.ts), the wording
// history (Supabase: src/lib/maya-wording-history-store.ts; memory: memoryWordingHistoryStore), the learning events, the
// profile rebuild, the alerts, the parent's note (#331), the model by id, the clock, ids and the seed. Pure otherwise: no Next.js, React,
// network or database; node:crypto through the trace's package hash.
import { voiceBoardHistory } from "@/lib/voice-board-history";
import type { BoardSnapshot } from "@/lib/board-protocol";
import { speechWords, type BoardCue } from "@/lib/board-speech";
import { applyBatch, boardView, createScene, type Batch } from "@/lib/board";
import { createHistory, mayaWrites, type BoardHistory } from "@/lib/board-history";
import { fitView, type PlayStep } from "@/lib/board-svg";
import type { LearningEvents, NewLearningEvent } from "@/lib/learning-events";
import type { NoteStep } from "@/lib/maya-call-note";
import { heardWordings, learningEvent, type Outcome, type WordingHistory, type WordingHistoryStore } from "@/lib/maya";
import { freeTalkFor } from "@/lib/maya-free-talk";
import type { MayaModel } from "@/lib/maya-model";
import type { TalkReviewer } from "@/lib/maya-talk-review";
import { createTextSession, type FinishOptions, type SavedTextSession, type TextOutput, type TextSession } from "@/lib/maya-text";
import { packageHash, type MayaTrace } from "@/lib/maya-trace";
import { checkQuestionPackage, type QuestionPackage, type QuestionRef } from "@/lib/question-package";
import { connectedSeconds, VOICE_CALL_STALE_MS, type ConnectionEvent, type ConnectionKind } from "@/lib/maya-voice";

/** The longest the note step of an ended call may take; after it the note stays pending. */
export const NOTE_STEP_MS = 20_000;
/** The most earlier calls of the child whose pending note a call's end picks up. */
export const NOTE_SWEEP = 3;

/** The version of the call record's shape (record_version). */
export const CALL_RECORD_VERSION = 1;

export type CallKind = "admin_test";
export type CallStatus = "live" | "ended";

/**
 * A call's flag levels, lowest first (#333). "unsafe_request": the child asked for content Maya does not give (#383
 * C29); "safety_concern" and "safety_immediate": the controller's SAFETY interrupt, by its severity.
 */
export const FLAG_LEVELS = ["unsafe_request", "safety_concern", "safety_immediate"] as const;
export type FlagLevel = (typeof FLAG_LEVELS)[number];

/** The call's highest flag so far, and when the call first reached it. */
export interface CallFlag {
  level: FlagLevel;
  at: string;
}

/**
 * What a request for harmful content raises (#383 C29: the model's reading `unsafeRequest`, answered with the decline
 * line "I can't talk about this. I'm here to help with math."). Savar approved "unsafe_request" on 2026-11-01 (D-203): a
 * lower flag with its own alert. The other options: "safety_concern" raises the same flag and alert as the SAFETY
 * interrupt; null no flag and no alert.
 */
export const UNSAFE_REQUEST_FLAG: FlagLevel | null = "unsafe_request";

/** Where an internal alert is: "sending" while a run holds its claim; "refused" did not go; "unknown" may have gone. */
export type AlertStatus = "sending" | "sent" | "refused" | "unknown";

/** A "sending" claim older than this was left by a run that stopped or an outcome write that failed. */
export const STALE_ALERT_MS = 10 * 60_000;

/**
 * An alert as the admin page shows it: a claim left "sending" past STALE_ALERT_MS is unknown, because its email may have
 * gone, and it is never sent again (R393-1-1, #143). Check the inbox, or the Resend log, for it.
 */
export function shownAlert(a: AlertState, now: number): AlertState {
  if (a.status !== "sending" || now - Date.parse(a.claimedAt) <= STALE_ALERT_MS) return a;
  return { ...a, status: "unknown", error: "The send did not finish, so the email may have gone. It is not sent again: check the inbox." };
}

/** One internal alert of a call, for the admin call page. */
export interface AlertState {
  level: FlagLevel;
  status: AlertStatus;
  /** When the latest send attempt claimed it. */
  claimedAt: string;
  /** Why it was refused, or why its delivery is unknown. */
  error: string | null;
}

/** What an alert says about its call: which call, its kind, and the flag. Never the child's words. */
export interface AlertCall {
  id: string;
  kind: CallKind;
  parentId: string;
  flag: CallFlag;
}

/** The alerts seam: the internal alert email through the email delivery module (src/lib/maya-call-alert.ts). */
export interface CallAlerts {
  /** Sends the alert of the call's flag at most once per call and flag level. Never throws. */
  send(call: AlertCall): Promise<void>;
  /** The call's alerts, oldest first. Throws when they cannot be read. */
  list(callId: string): Promise<AlertState[]>;
}

/** One call as stored. */
export interface CallRecord {
  id: string;
  createdAt: string;
  recordVersion: number;
  kind: CallKind;
  mode: "text" | "voice";
  startedBy: string | null;
  parentId: string;
  childId: string;
  question: QuestionRef;
  packageId: string;
  packageHash: string;
  questionText: string | null;
  status: CallStatus;
  revision: number;
  startedAt: string | null;
  endedAt: string | null;
  model: string;
  promptVersion: string;
  versions: { proposal: number; lines: number | string; session: number; trace: number };
  outcome: Outcome | null;
  counts: { mayaTurns: number; childTurns: number; fallbacks: number } | null;
  /** While live: what the text adapter needs to go on, with the package it runs on. Null once ended. */
  live: { package: QuestionPackage; text: SavedTextSession; cancelled?: true; pendingVoice?: VoiceTurn } | null;
  trace: MayaTrace | null;
  boardHistory: BoardHistory | null;
  learningEventId: string | null;
  profileRebuiltAt: string | null;
  /** An ended call whose parent note is not written yet: the note's inputs, kept for a retry. Null once done. */
  notePending: { package: QuestionPackage; event: NewLearningEvent | null } | null;

  /** Voice calls: the speech-to-text and voice ids (set when the worker opens the call), and the connected seconds. */
  speechToText: string | null;
  voice: string | null;
  connectedSeconds: number | null;
  /** The call's highest flag so far (#333), or null. */
  flag: CallFlag | null;
}

/** The fields an update may change. */
export type CallChange = Partial<Pick<CallRecord, "status" | "startedAt" | "endedAt" | "outcome" | "counts" | "live" | "trace" | "boardHistory" | "learningEventId" | "profileRebuiltAt" | "speechToText" | "voice" | "connectedSeconds" | "flag" | "notePending">>;

/** One connection event of a voice call, as stored. */
export interface CallConnection extends ConnectionEvent {
  callId: string;
  parentId: string;
  childId: string;
}

/** Where a voice call's connection events go (append only). */
export interface ConnectionLog {
  /** Checks ownership, raises the revision and appends atomically. Returns the store-clock time, or null on conflict. */
  append(event: CallConnection, revision: number): Promise<number | null>;
  /** Every stored event of a call, oldest first. */
  read(callId: string): Promise<ConnectionEvent[]>;
}

/** The store seam. */
export interface CallStore {
  insert(record: CallRecord): Promise<void>;
  get(id: string): Promise<CallRecord | null>;
  /** Writes the change and raises the revision by one, only when the stored revision is `revision`. False otherwise. */
  update(id: string, revision: number, change: CallChange): Promise<boolean>;
  /** The child's ended calls whose note is pending, oldest end first, at most `limit`. */
  pendingNotes(childId: string, limit: number): Promise<CallRecord[]>;
  /**
   * Clears an ended call's pending note without raising its revision (review R403-5): the note is not part of the
   * call's requests, so a clear that is still writing when the note time is up never makes the revision a request
   * holds stale. True when the call had a pending note.
   */
  clearNote(id: string): Promise<boolean>;
}

export interface CallSeams {
  store: CallStore;
  /** The children's wording history: read before a call, added to when it ends. */
  history: WordingHistoryStore;
  events: LearningEvents;
  /** Rebuilds the child's profile; true when it was built. Never throws. */
  rebuild(childId: string): Promise<boolean>;
  /**
   * The model to use: `null` asks for the model a new call uses now (the real one when the server has its key, else
   * the fake); an id asks for that model again, or null when it is no longer available.
   */
  model(id: string | null): MayaModel | null;
  /**
   * The free-talk review (D-197) for a call on this model, or null (then every free-talk piece becomes a bank phrase).
   * Optional: without it a call has no review.
   */
  reviewer?(modelId: string): TalkReviewer | null;
  /** True when the family is marked as a test family (public.test_accounts). */
  isTestFamily(parentId: string): Promise<boolean>;
  /**
   * The parent's note of an ended call (#331, src/lib/maya-call-note.ts), run after the learning event. Optional.
   * "done" when the note is stored or refused for good (the note module refuses test calls and test families itself);
   * "pending", a throw or no answer within NOTE_STEP_MS keeps the call's `notePending` for a retry. Never changes the call
   * otherwise.
   */
  note?(ended: { call: CallRecord; package: QuestionPackage; event: NewLearningEvent | null }): Promise<NoteStep>;
  /** The note step's time limit in milliseconds; NOTE_STEP_MS when not set. */
  noteMs?: number;
  /** Voice calls: where the connection events go. Optional: without it a voice call cannot be opened. */
  connections?: ConnectionLog;
  /** The internal safety alerts (#333). */
  alerts: CallAlerts;
  /** What a request for harmful content raises; default UNSAFE_REQUEST_FLAG. */
  unsafeRequestFlag?: FlagLevel | null;
  clock(): number;
  newId(): string;
  /** A random 32-bit seed for the wording. */
  seed(): number;
}

/**
 * One input to a live call. "end" hangs up on purpose (the call ends as child_stopped, unless safety, content or a
 * solved question comes first), or finishes an ended call's steps.
 */
export type CallInput = { type: "child"; text: string } | { type: "tick" } | { type: "writing"; status: "started" | "done" } | { type: "end" };

/** The most characters of one typed child turn. */
export const MAX_CHILD_TEXT = 500;

/** One line of the transcript, as the admin reads it. */
export interface TranscriptLine {
  speaker: "maya" | "child" | "note";
  text: string;
  /** Seconds from the start of the call. */
  second: number;
}

/** One piece of Maya's own words in a call (D-197), as the admin reads it: both checks and what was said. */
export interface FreeTalkLine {
  /** Seconds from the start of the call. */
  second: number;
  proposed: string;
  /** The code guards: null when they passed, else why not. */
  code: string | null;
  review: "pass" | "fail" | "error" | "not_run";
  rules: string[];
  reason: string | null;
  shown: string;
  said: boolean;
}

/** What the admin screens show of a call: no saved session state. */
export interface CallView {
  id: string;
  kind: CallKind;
  mode: CallRecord["mode"];
  /** Voice calls: what carried the call, and the time the child and Maya were both connected. */
  voice: { speechToText: string | null; voice: string | null; connectedSeconds: number | null } | null;
  status: CallStatus;
  revision: number;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
  parentId: string;
  childId: string;
  question: QuestionRef;
  questionText: string | null;
  packageHash: string;
  model: { id: string; fake: boolean; promptVersion: string };
  versions: CallRecord["versions"];
  transcript: TranscriptLine[];
  /** D-197: whether free talk was on, the review's model, and every piece of Maya's own words with both checks. */
  freeTalk: { on: boolean; reviewer: string | null; lines: FreeTalkLine[] };
  /** Maya's board batches, in order. */
  batches: Batch[];
  /** Saved board times and child ink, for the admin replay. Older calls rebuild this from their trace. */
  boardHistory: BoardHistory;
  /** Service diagnostics belong only in the closed technical details. */
  technicalNotes: string[];
  outcome: Outcome | null;
  counts: CallRecord["counts"];
  learningEventId: string | null;
  profileRebuiltAt: string | null;
  /** The call's parent note is not written yet. */
  notePending: boolean;
  /** The call's highest flag so far (#333), and its internal alerts. */
  flag: CallFlag | null;
  alerts: AlertState[];
}

/** A new call. */
export interface StartInput {
  kind: CallKind;
  parentId: string;
  childId: string;
  childName: string | null;
  package: unknown;
  startedBy: string | null;
  /** The call's id when the caller made it first: a minutes grant names the call before it exists (#330). */
  id?: string;
  /** The call's end when it is shorter than 10 minutes (ms): the minutes the grant gave (#330, src/lib/maya-minutes.ts). */
  limitMs?: number;
}

export type CallResult =
  | { ok: true; view: CallView; output: { say: string[]; newBatches: number; safetyMessage: string | null } }
  | { ok: false; error: "not_found" | "not_test_family" | "invalid_question" | "invalid_input" | "conflict" | "model_unavailable" | "voice_call" };

/** What reached the child after one input of a voice call. */
export interface VoiceTurn {
  boardCues?: BoardCue[];
  say: string[];
  newBatches: number;
  safetyMessage: string | null;
  /** The call ended with this input. */
  ended: boolean;
}

/**
 * A voice call open in the worker. Inputs run one at a time, in order; each returns as soon as Maya's words are known
 * and the call is saved behind it (`settled` waits for the saves). Once a save is refused (another writer changed the
 * call) or fails, the handle is `lost`: inputs return nothing and nothing more is written.
 */
export interface VoiceCall {
  readonly id: string;
  /** The session now (plain data), for the tick planner. */
  readonly session: TextSession["session"];
  readonly ended: boolean;
  readonly lost: boolean;
  /** The store confirmed that this handle no longer owns its revision. A thrown save is only uncertain. */
  readonly replaced: boolean;
  /** The revision of the last save. */
  readonly revision: number;
  /** Saved accepted final words when this handle restored a controller that had already ended. */
  readonly pendingFinal: VoiceTurn | null;
  readonly boardSnapshot: BoardSnapshot;
  /** Persist receiver outcomes with their presentation times, under this worker's revision. */
  observeBoard(snapshot: BoardSnapshot): Promise<void>;
  start(): Promise<VoiceTurn>;
  child(text: string, options?: { uncertain?: boolean; alternatives?: string[] }): Promise<VoiceTurn>;
  tick(): Promise<VoiceTurn>;
  writing(status: "started" | "done"): Promise<VoiceTurn>;
  /** Ends from the last durable state without waiting for active model work. */
  limit(): Promise<void>;
  /** Stores a connection event (on the server's clock). Never throws. */
  connection(kind: ConnectionKind): Promise<void>;
  /**
   * Ends the call if it has not ended: "child_stopped" when the child hung up, else a technical issue with `detail`.
   * Stores the outcome, the connected seconds, the learning event and the profile rebuild. Safe to call twice.
   */
  end(how: FinishOptions): Promise<void>;
  /** Waits until every save so far is done. */
  settled(): Promise<void>;
}

export type OpenVoiceResult = { ok: true; call: VoiceCall } | { ok: false; error: "not_found" | "not_voice" | "ended" | "conflict" | "model_unavailable" | "unavailable" };

export interface MayaCalls {
  start(input: StartInput): Promise<CallResult>;
  /** Makes a voice call's record, not started: Maya's worker starts it when the child joins. */
  startVoice(input: StartInput): Promise<CallResult>;
  /** Opens a live voice call in the worker, with the providers that carry it. */
  openVoice(id: string, providers: { speechToText: string; voice: string }, childName: string | null): Promise<OpenVoiceResult>;
  input(id: string, revision: number, input: CallInput, childName: string | null): Promise<CallResult>;
  view(id: string): Promise<CallView | null>;
}

const iso = (ms: number) => new Date(ms).toISOString();
/** The model id of the fake rule player (src/lib/maya-model-fake.ts). */
export const FAKE_MODEL_ID = "fake";

/** The board batches of a trace or a live session, as the board core took them. */
const batchesOf = (board: readonly { transactionId: string; commands: readonly unknown[] }[]): Batch[] => board.map((b) => ({ transactionId: b.transactionId, commands: b.commands }));

/** The transcript from a trace: the child's turns, Maya's words, and notes for writing, waits and failures. */
function transcriptOf(trace: MayaTrace): TranscriptLine[] {
  const start = trace.turns.find((t) => t.kind === "start")?.at ?? trace.turns[0]?.at ?? 0;
  const second = (at: number) => Math.max(0, Math.round((at - start) / 1000));
  const lines: TranscriptLine[] = [];
  for (const t of trace.turns) {
    if (t.kind === "child") lines.push({ speaker: "child", text: t.text, second: second(t.at) });
    else if (t.kind === "maya" && t.output && t.output.say.length) lines.push({ speaker: "maya", text: t.output.say.join(" "), second: second(t.at) });
    else if (t.kind === "writing") lines.push({ speaker: "note", text: t.status === "started" ? "The child started writing." : "The child finished writing.", second: second(t.at) });
    else if (t.kind === "tick") lines.push({ speaker: "note", text: "The child stayed quiet.", second: second(t.at) });
    else if (t.kind === "technical") lines.push({ speaker: "note", text: "The call stopped because of a connection or service problem.", second: second(t.at) });
    else if (t.kind === "hang_up") lines.push({ speaker: "note", text: "The child hung up.", second: second(t.at) });
  }
  return lines;
}

/** Every piece of Maya's own words in a trace, with both checks and what was said (D-197). */
function freeTalkOf(trace: MayaTrace): CallView["freeTalk"] {
  const start = trace.turns.find((t) => t.kind === "start")?.at ?? trace.turns[0]?.at ?? 0;
  const lines: FreeTalkLine[] = [];
  for (const t of trace.turns) {
    if (t.kind !== "maya" || !t.output) continue;
    for (const x of t.attempts.at(-1)?.talk ?? []) {
      lines.push({
        second: Math.max(0, Math.round((t.at - start) / 1000)), proposed: x.proposed, code: x.code, review: x.review, rules: x.rules ?? [],
        reason: x.reason ?? null, shown: x.shown, said: x.code === null && x.review === "pass",
      });
    }
  }
  return { on: trace.freeTalk, reviewer: trace.reviewer?.id ?? null, lines };
}

/** The board history of a finished call: Maya's batches at their times from the start (no child ink in a text call). */
export function boardHistoryOf(trace: MayaTrace): BoardHistory {
  const start = trace.turns.find((t) => t.kind === "start")?.at ?? 0;
  let h = createHistory();
  for (const b of trace.board) {
    const r = mayaWrites(h, { transactionId: b.transactionId, commands: b.commands }, Math.max(0, b.at - start));
    if (r.ok) h = r.history;
  }
  return h;
}

/** The board for the screen: each batch as the board core draws it, and a view box around all the work. */
export function boardPlayback(batches: readonly Batch[]): { steps: PlayStep[]; viewBox: string } {
  let scene = createScene();
  const steps: PlayStep[] = [];
  for (const b of batches) {
    const r = applyBatch(scene, b);
    if (!r.ok) break;
    scene = r.scene;
    steps.push({ drawn: r.drawn, erased: r.erased, view: boardView(r.scene) });
  }
  return { steps, viewBox: fitView(steps.flatMap((s) => s.drawn), 0.03) };
}

export function callView(record: CallRecord, trace: MayaTrace, alerts: AlertState[] = []): CallView {
  // A missing delivery field identifies the legacy contract. An explicit empty delivery is authoritative.
  const observed = record.mode === "voice" && record.boardHistory?.delivery !== undefined;
  const history = record.boardHistory ?? boardHistoryOf(trace);
  return {
    id: record.id,
    kind: record.kind,
    mode: record.mode,
    voice: record.mode === "voice" ? { speechToText: record.speechToText, voice: record.voice, connectedSeconds: record.connectedSeconds } : null,
    status: record.status,
    revision: record.revision,
    createdAt: record.createdAt,
    startedAt: record.startedAt,
    endedAt: record.endedAt,
    parentId: record.parentId,
    childId: record.childId,
    question: record.question,
    questionText: record.questionText,
    packageHash: record.packageHash,
    model: { id: record.model, fake: record.model === FAKE_MODEL_ID, promptVersion: record.promptVersion },
    versions: record.versions,
    transcript: transcriptOf(trace),
    freeTalk: freeTalkOf(trace),
    batches: observed ? history.events.flatMap(e => e.kind === "maya" ? [{ transactionId: e.batchId, commands: e.commands }] : []) : batchesOf(trace.board),
    boardHistory: history,
    technicalNotes: trace.turns.flatMap((t) => t.kind === "technical" ? [t.detail] : []),
    outcome: record.outcome ?? trace.outcome,
    counts: record.counts,
    learningEventId: record.learningEventId,
    profileRebuiltAt: record.profileRebuiltAt,
    notePending: record.notePending !== null,
    flag: record.flag,
    alerts,
  };
}

const rank = (flag: CallFlag | null) => (flag ? FLAG_LEVELS.indexOf(flag.level) : -1);

/**
 * The call's highest flag from its session: the SAFETY interrupt by its severity, and a request for harmful content
 * (any model reading with `unsafeRequest`, as with the safety reading, accepted or not) at the level `unsafe` names.
 */
function flagOf(session: TextSession, unsafe: FlagLevel | null): CallFlag | null {
  const safety = session.session.safety;
  const flags: CallFlag[] = [];
  if (safety.flagged && safety.severity && safety.at !== null) {
    flags.push({ level: safety.severity === "immediate" ? "safety_immediate" : "safety_concern", at: iso(safety.at) });
  }
  if (unsafe) {
    const asked = session.trace().turns.find((t) => t.kind === "maya" && t.attempts.some((a) => readsUnsafe(a.proposal)));
    if (asked) flags.push({ level: unsafe, at: iso(asked.at) });
  }
  return flags.reduce<CallFlag | null>((top, f) => (rank(f) > rank(top) ? f : top), null);
}

/** A model reading that names a request for harmful content (#383 C29). */
const readsUnsafe = (proposal: unknown): boolean => {
  const reading = typeof proposal === "object" && proposal !== null ? (proposal as { reading?: unknown }).reading : null;
  return typeof reading === "object" && reading !== null && (reading as { unsafeRequest?: unknown }).unsafeRequest === true;
};

/** The flag to store when the session's flag is higher than the stored one, else undefined (no change). */
function risen(stored: CallFlag | null, now: CallFlag | null): CallFlag | undefined {
  return now && rank(now) > rank(stored) ? now : undefined;
}

const countsOf = (trace: MayaTrace): NonNullable<CallRecord["counts"]> => ({
  mayaTurns: trace.turns.filter((t) => t.kind === "maya" && t.output).length,
  childTurns: trace.turns.filter((t) => t.kind === "child").length,
  fallbacks: trace.counts.fallbacks,
});

function checkInput(input: CallInput): boolean {
  if (input.type === "child") return typeof input.text === "string" && input.text.trim().length > 0 && input.text.length <= MAX_CHILD_TEXT;
  if (input.type === "writing") return input.status === "started" || input.status === "done";
  return input.type === "tick" || input.type === "end";
}

/** What the admin screens show of a stored call: an ended call from its trace, a live one from its saved session. */
export function recordView(record: CallRecord, alerts: AlertState[] = []): CallView | null {
  if (record.trace) return callView(record, record.trace, alerts);
  if (!record.live) return null;
  const session = createTextSession({ callId: record.id, package: record.live.package, model: idleModel(record), clock: () => 0, runner: "text", resume: record.live.text });
  return callView(record, session.trace(), alerts);
}

/** A stand-in for a call's model where no model is asked: reading a saved call, or ending it. */
const idleModel = (record: CallRecord): MayaModel => ({
  id: record.model,
  promptVersion: record.promptVersion,
  propose: async () => {
    throw new Error("the model is not asked here");
  },
});

export function mayaCalls(seams: CallSeams): MayaCalls {
  const { store } = seams;
  const unsafe = seams.unsafeRequestFlag === undefined ? UNSAFE_REQUEST_FLAG : seams.unsafeRequestFlag;

  /** Sends the alert of a flagged call's flag when it has not gone (the seam sends each call and level once). */
  async function alert(record: CallRecord) {
    if (record.flag) await seams.alerts.send({ id: record.id, kind: record.kind, parentId: record.parentId, flag: record.flag });
  }

  /** A flagged call's alerts for the screen; none when they cannot be read (the call page reads them again). */
  async function alertsOf(record: CallRecord): Promise<AlertState[]> {
    if (!record.flag) return [];
    try {
      return await seams.alerts.list(record.id);
    } catch (e) {
      console.error("[maya call] alerts not read", record.id, e instanceof Error ? e.message : String(e));
      return [];
    }
  }

  /** A call's text session. Admin test calls have free talk on (D-197), with the model's review; a resumed call keeps its flag. */
  function textSession(record: Pick<CallRecord, "id">, pkg: QuestionPackage, model: MayaModel, childName: string | null, saved?: SavedTextSession, seed?: number, history?: WordingHistory, limitMs?: number): TextSession {
    return createTextSession({
      callId: record.id, package: pkg, model, clock: seams.clock, random: seed, history, childName, runner: "text", resume: saved, limitMs,
      freeTalk: freeTalkFor("admin_test"), reviewer: seams.reviewer?.(model.id) ?? null,
    });
  }

  /** The child's wording history before a new call; an empty one when it cannot be read. */
  async function readHistory(childId: string): Promise<WordingHistory> {
    try {
      return await seams.history.read(childId);
    } catch (e) {
      console.error("[maya call] wording history read failed", childId, e instanceof Error ? e.message : String(e));
      return {};
    }
  }

  /** Adds the wordings an ended call said to the child's history. Never throws. */
  async function recordHeard(record: CallRecord, ended: TextSession) {
    const heard = heardWordings(ended.session);
    if (Object.keys(heard).length === 0) return;
    try {
      await seams.history.record(record.childId, heard);
    } catch (e) {
      console.error("[maya call] wording history record failed", record.id, e instanceof Error ? e.message : String(e));
    }
  }

  /**
   * The wording history, the learning event and the profile rebuild of an ended call; the event and the rebuild run
   * until each has worked once. `ended` is the call's final session; the record keeps it in `live` until the event is
   * written, so a later "end" can try again (and adds the same wordings again, which changes nothing).
   */
  async function afterEnd(record: CallRecord, ended: TextSession | null, noEvent = false, sweep = false): Promise<CallRecord> {
    let current = record;
    if (ended) await recordHeard(current, ended);
    if (!current.learningEventId && ended) {
      // A voice call Maya never joined has no learning to record: the child never spoke.
      const event = noEvent || current.live?.cancelled ? null : learningEvent(ended.session, { parentId: current.parentId, childId: current.childId });
      let eventId: string | null = null;
      let done = event === null;
      if (event) {
        try {
          const appended = await seams.events.append(event);
          if (appended.ok || appended.error === "key_conflict") [eventId, done] = [appended.event.id, true];
          else {
            // A refused event is refused again on a retry: the call goes on without one.
            console.error("[maya call] learning event refused", current.id, appended.error, "reason" in appended ? appended.reason : "");
            done = true;
          }
        } catch (e) {
          console.error("[maya call] learning event failed", current.id, e instanceof Error ? e.message : String(e));
        }
      }
      if (done) {
        const change: CallChange = { learningEventId: eventId, live: null };
        if (!(await store.update(current.id, current.revision, change))) return current;
        current = { ...current, ...change, revision: current.revision + 1 };
      }
    }
    if (current.learningEventId && !current.live && !current.profileRebuiltAt && (await seams.rebuild(current.childId))) {
      const at = iso(seams.clock());
      if (await store.update(current.id, current.revision, { profileRebuiltAt: at })) current = { ...current, profileRebuiltAt: at, revision: current.revision + 1 };
    }
    return notes(current, sweep);
  }

  /**
   * The parent's notes after the event and the rebuild: this call's pending note, then (`sweep`, at a call's first end)
   * up to NOTE_SWEEP earlier calls of the child whose note is still pending. All of it within the note time limit: once
   * it is up the call answers, and no late result changes the call's revision (a written note is found on the next try).
   */
  async function notes(record: CallRecord, sweep: boolean): Promise<CallRecord> {
    const note = seams.note;
    if (!note || (!record.notePending && !sweep)) return record;
    let current = record;
    let late = false;
    const one = async (r: CallRecord): Promise<CallRecord> => {
      if (!r.notePending) return r;
      let step: NoteStep = "pending";
      try {
        step = await note({ call: r, package: r.notePending.package, event: r.notePending.event });
      } catch (e) {
        console.error("[maya call] note failed", r.id, e instanceof Error ? e.message : String(e));
      }
      if (step !== "done" || late || !(await store.clearNote(r.id))) return r;
      return { ...r, notePending: null };
    };
    const work = (async () => {
      const done = await one(current);
      if (!late) current = done;
      if (!sweep) return;
      for (const other of await store.pendingNotes(record.childId, NOTE_SWEEP + 1)) {
        if (late) return;
        if (other.id !== record.id && other.status === "ended") await one(other);
      }
    })();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeUp = new Promise<"late">((resolve) => {
      timer = setTimeout(() => resolve("late"), seams.noteMs ?? NOTE_STEP_MS);
    });
    try {
      if ((await Promise.race([work.then(() => "done" as const), timeUp])) === "late") {
        late = true;
        console.error("[maya call] note step ran out of time", record.id);
      }
    } catch (e) {
      console.error("[maya call] note step failed", record.id, e instanceof Error ? e.message : String(e));
    } finally {
      clearTimeout(timer);
    }
    work.catch(() => {});
    return current;
  }

  /** Stores the outcome of a call that has just ended, then writes its event and rebuilds the profile. Null on a conflict. */
  async function end(record: CallRecord, pkg: QuestionPackage, session: TextSession, how: FinishOptions = {}, extra?: (endedAt: number) => Promise<CallChange>, noEvent = false): Promise<CallRecord | null> {
    const trace = await session.finish(how);
    const endedAt = trace.endedAt ?? iso(seams.clock());
    const flag = risen(record.flag, flagOf(session, unsafe));
    const change: CallChange = {
      ...(extra ? await extra(Date.parse(endedAt)) : {}),
      ...(flag && { flag }),
      status: "ended",
      // Kept until the learning event is written (afterEnd).
      live: { package: pkg, text: await session.saved(), ...(noEvent ? { cancelled: true as const } : {}) },
      // Kept until the parent's note is written (notes). A call Maya never joined has no learning event.
      notePending: seams.note ? { package: pkg, event: noEvent ? null : learningEvent(session.session, { parentId: record.parentId, childId: record.childId }) } : null,
      trace,
      boardHistory: record.mode === "voice" ? record.boardHistory ?? boardHistoryOf(trace) : boardHistoryOf(trace),
      outcome: trace.outcome,
      counts: countsOf(trace),
      startedAt: trace.startedAt,
      endedAt,
    };
    if (!(await store.update(record.id, record.revision, change))) return null;
    const ended = { ...record, ...change, revision: record.revision + 1 };
    // Safety first: the alert goes before the learning record.
    await alert(ended);
    return afterEnd(ended, session, noEvent, true);
  }

  /** Saves a live call after an input, or ends it when the call has ended. Null on a conflict. */
  async function save(record: CallRecord, pkg: QuestionPackage, session: TextSession, extra?: (endedAt: number) => Promise<CallChange>): Promise<CallRecord | null> {
    if (session.ended) return end(record, pkg, session, {}, extra);
    const flag = risen(record.flag, flagOf(session, unsafe));
    const change: CallChange = { live: { package: pkg, text: await session.saved() }, startedAt: session.trace().startedAt, ...(flag && { flag }) };
    if (!(await store.update(record.id, record.revision, change))) return null;
    const saved = { ...record, ...change, revision: record.revision + 1 };
    await alert(saved);
    return saved;
  }

  /** Checks a new call's family and question, and stores its record with the session not started. */
  async function newCall(input: Parameters<MayaCalls["start"]>[0], mode: CallRecord["mode"]): Promise<{ ok: true; record: CallRecord; session: TextSession; pkg: QuestionPackage } | Extract<CallResult, { ok: false }>> {
    if (!(await seams.isTestFamily(input.parentId))) return { ok: false, error: "not_test_family" };
    const check = checkQuestionPackage(input.package);
    if (!check.ok) return { ok: false, error: "invalid_question" };
    const pkg = check.package;
    const model = seams.model(null);
    if (!model) return { ok: false, error: "model_unavailable" };
    const id = input.id ?? seams.newId();
    const session = textSession({ id }, pkg, model, mode === "voice" ? null : input.childName, undefined, seams.seed(), await readHistory(input.childId), input.limitMs);
    const empty = session.trace();
    const record: CallRecord = {
      id,
      createdAt: iso(seams.clock()),
      recordVersion: CALL_RECORD_VERSION,
      kind: input.kind,
      mode,
      startedBy: input.startedBy,
      parentId: input.parentId,
      childId: input.childId,
      question: pkg.ref,
      packageId: pkg.id,
      packageHash: packageHash(pkg),
      questionText: pkg.text,
      status: "live",
      revision: 0,
      startedAt: null,
      endedAt: null,
      model: model.id,
      promptVersion: model.promptVersion,
      versions: { ...empty.versions, trace: empty.version },
      outcome: null,
      counts: null,
      live: { package: pkg, text: await session.saved() },
      trace: null,
      boardHistory: mode === "voice" ? { ...createHistory(), delivery: { events: [] } } : null,
      learningEventId: null,
      profileRebuiltAt: null,
      notePending: null,
      speechToText: null,
      voice: null,
      connectedSeconds: null,
      flag: null,
    };
    await store.insert(record);
    return { ok: true, record, session, pkg };
  }

  const result = async (record: CallRecord, trace: MayaTrace, out: TextOutput | null): Promise<CallResult> => ({
    ok: true,
    view: callView(record, trace, await alertsOf(record)),
    output: { say: out?.say ?? [], newBatches: out?.board.length ?? 0, safetyMessage: out?.safetyMessage ?? null },
  });

  return {
    async start(input) {
      const made = await newCall(input, "text");
      if (!made.ok) return made;
      let { record } = made;
      const { session, pkg } = made;
      let out: TextOutput | null = null;
      try {
        out = await session.start();
      } finally {
        const saved = await save(record, pkg, session);
        if (saved) record = saved;
      }
      return result(record, record.trace ?? session.trace(), out);
    },

    async startVoice(input) {
      const made = await newCall(input, "voice");
      if (!made.ok) return made;
      return result(made.record, made.session.trace(), null);
    },

    async openVoice(id, providers) {
      const log = seams.connections;
      if (!log) return { ok: false, error: "unavailable" };
      const found = await store.get(id);
      if (!found) return { ok: false, error: "not_found" };
      if (found.mode !== "voice") return { ok: false, error: "not_voice" };
      if (found.status !== "live" || !found.live) return { ok: false, error: "ended" };
      const model = found.live.text.session.outcome ? idleModel(found) : seams.model(found.model);
      if (!model) return { ok: false, error: "model_unavailable" };
      const restored = structuredClone(found.live.text);
      restored.session.variety.name = null;
      restored.session.variety.nameAt = null;
      const claim: CallChange = { speechToText: providers.speechToText, voice: providers.voice, live: { ...found.live, text: restored } };
      if (!(await store.update(found.id, found.revision, claim))) return { ok: false, error: "conflict" };
      let record: CallRecord = { ...found, ...claim, revision: found.revision + 1 };
      const pkg = found.live.package;
      const session = textSession(record, pkg, model, null, restored);
      const last = restored.turns.at(-1);
      const pendingFinal: VoiceTurn | null = restored.session.outcome ? record.live?.pendingVoice ?? {
        say: last?.kind === "maya" && last.stateAfter === "CLOSE" ? [...(last.output?.say ?? [])] : [],
        newBatches: 0, safetyMessage: null, ended: true,
      } : null;
      const seen: ConnectionEvent[] = [];
      let lost = false;
      let replaced = false;
      let queue: Promise<void> = Promise.resolve();
      const later = (work: () => Promise<void>) => {
        queue = queue.then(work).catch((e) => {
          lost = true;
          console.error("[maya voice] save failed", record.id, e instanceof Error ? e.message : String(e));
        });
      };
      /** The connected seconds when the call ends: from every stored event of the call (a restarted worker's too). */
      const connected = async (endedAt: number): Promise<CallChange> => {
        let events: ConnectionEvent[] = seen;
        try {
          events = await log.read(record.id);
        } catch (e) {
          console.error("[maya voice] connections read failed", record.id, e instanceof Error ? e.message : String(e));
        }
        // The outcome can precede final playout. Count room time through the media close.
        return { connectedSeconds: connectedSeconds(events, Math.max(endedAt, seams.clock(), ...events.map((e) => e.at))) };
      };
      const persist = (out: TextOutput) =>
        later(async () => {
          if (lost || record.status === "ended") return;
          // A final voice turn remains live until its speech handle completes.
          const pendingVoice: VoiceTurn | undefined = out.ended ? { say: [...out.say], newBatches: 0, safetyMessage: out.safetyMessage, ended: true } : undefined;
          const change: CallChange = { live: { package: pkg, text: await session.saved(), ...(pendingVoice ? { pendingVoice } : {}) }, startedAt: session.trace().startedAt };
          const saved = await store.update(record.id, record.revision, change) ? { ...record, ...change, revision: record.revision + 1 } : null;
          if (!saved) {
            lost = true;
            replaced = true;
            console.error("[maya voice] the call changed elsewhere; this worker stops writing", record.id);
            return;
          }
          record = saved;
        });
      const none: VoiceTurn = { say: [], newBatches: 0, safetyMessage: null, ended: false };
      const inactive = () => lost || record.status === "ended";
      const turn = async (run: () => Promise<TextOutput>): Promise<VoiceTurn> => {
        if (inactive()) return none;
        const before = session.trace().turns.length;
        const out = await run();
        persist(out);
        await queue;
        if (inactive()) return none;
        // Preserve the controller turn association. Do not spread batches evenly across an entire reply.
        // Each current board offer follows the last word of its accepted controller turn.
        let word = 0;
        const ends = new Map<string, number>();
        for (const t of session.trace().turns.slice(before)) {
          if (t.kind !== "maya" || !t.output) continue;
          word += speechWords(t.output.say.join(" ")).length;
          for (const id of t.output.board) ends.set(id, word);
        }
        const boardCues = out.board.map(batch => ({ batch, word: ends.get(batch.transactionId) ?? speechWords(out.say.join(" ")).length }));
        return { say: out.say, newBatches: out.board.length, boardCues, safetyMessage: out.safetyMessage, ended: out.ended !== null };
      };
      const call: VoiceCall = {
        id: record.id,
        get session() {
          return session.session;
        },
        get ended() {
          return session.ended;
        },
        get lost() {
          return lost;
        },
        get replaced() {
          return replaced;
        },
        get revision() {
          return record.revision;
        },
        get pendingFinal() {
          return pendingFinal ? structuredClone(pendingFinal) : null;
        },
        get boardSnapshot() { return structuredClone(record.boardHistory?.delivery ?? { events: [] }); },
        async observeBoard(snapshot) {
          const copy = structuredClone(snapshot);
          later(async () => {
            if (lost || record.status === "ended") return;
            const boardHistory = voiceBoardHistory(copy, record.live?.text.session.startedAt ?? seams.clock(), seams.clock(), record.boardHistory);
            const change: CallChange = { boardHistory };
            if (!(await store.update(record.id, record.revision, change))) { lost = true; replaced = true; return; }
            record = { ...record, ...change, revision: record.revision + 1 };
          });
          await queue;
          if (lost) throw new Error("The observed board could not be saved.");
        },
        start: () => turn(() => session.start()),
        child: (text, options) => turn(() => session.child(text.trim().slice(0, MAX_CHILD_TEXT), options)),
        tick: () => turn(() => session.tick()),
        writing: (status) => turn(() => session.writing(status)),
        async limit() {
          later(async () => {
            if (lost || record.status === "ended" || !record.live) return;
            // Restore only accepted, saved work. An outstanding model answer cannot delay the deadline.
            const final = textSession(record, pkg, idleModel(record), null, record.live.text);
            await final.tick();
            const ended = await end(record, pkg, final, {}, connected, record.startedAt === null);
            if (!ended) { lost = true; replaced = true; }
            else record = ended;
          });
          await queue;
        },
        async connection(kind) {
          const event: ConnectionEvent = { kind, at: seams.clock() };
          later(async () => {
            if (lost) return;
            try {
              // The store serializes ownership and append with replacement claims.
              const at = await log.append({ ...event, callId: record.id, parentId: record.parentId, childId: record.childId }, record.revision);
              if (at === null) { lost = true; replaced = true; return; }
              record = { ...record, revision: record.revision + 1 };
              seen.push({ kind, at });
            } catch (e) {
              lost = true;
              console.error("[maya voice] connection event not stored", record.id, kind, e instanceof Error ? e.message : String(e));
            }
          });
          await queue;
        },
        async end(how) {
          await queue;
          if (lost) return;
          if (record.status === "live") {
            later(async () => {
              // A fatal close or hang-up must not wait for an unfinished model turn.
              const final = textSession(record, pkg, idleModel(record), null, record.live!.text);
              const ended = await end(record, pkg, final, how, connected, record.startedAt === null);
              if (!ended) { lost = true; replaced = true; }
              else record = ended;
            });
          } else if (!record.learningEventId || !record.profileRebuiltAt) {
            later(async () => {
              record = await afterEnd(record, record.live ? session : null);
            });
          }
          await queue;
        },
        settled: () => queue,
      };
      return { ok: true, call };
    },

    async input(id, revision, input, childName) {
      if (!checkInput(input)) return { ok: false, error: "invalid_input" };
      const record = await store.get(id);
      if (!record) return { ok: false, error: "not_found" };
      if (record.revision !== revision) return { ok: false, error: "conflict" };
      if (record.status === "ended") {
        if (input.type !== "end" || !record.trace) return { ok: false, error: "conflict" };
        // An ended call: send the alert, write the event and rebuild the profile when an earlier try did not.
        await alert(record);
        const final = record.live ? textSession(record, record.live.package, idleModel(record), childName, record.live.text) : null;
        const done = await afterEnd(record, final);
        return result(done, done.trace!, null);
      }
      if (!record.live) return { ok: false, error: "conflict" };
      if (record.mode === "voice") {
        // The worker holds a live voice call. The admin may only end one that never started, or one that cannot still
        // be running (the worker stopped without ending it).
        const started = record.startedAt === null ? null : Date.parse(record.startedAt);
        if (input.type !== "end" || (started !== null && seams.clock() - started < VOICE_CALL_STALE_MS)) return { ok: false, error: "voice_call" };
        const session = textSession(record, record.live.package, idleModel(record), childName, record.live.text);
        const detail = started === null ? "Maya did not join the voice call" : "the voice call stopped without an end";
        const ended = await end(record, record.live.package, session, { detail }, async (endedAt) => ({ connectedSeconds: connectedSeconds(await seams.connections?.read(record.id).catch(() => []) ?? [], endedAt) }), started === null);
        return ended ? result(ended, ended.trace!, null) : { ok: false, error: "conflict" };
      }
      const { package: pkg, text: saved } = record.live;
      const model = seams.model(record.model);
      if (!model) {
        // The model this call started with is gone (the key was removed): the call ends, recorded with its own model.
        const session = textSession(record, pkg, idleModel(record), childName, saved);
        const ended = await end(record, pkg, session, { detail: "the model this call started with is no longer available" });
        return ended ? result(ended, ended.trace!, null) : { ok: false, error: "conflict" };
      }
      const session = textSession(record, pkg, model, childName, saved);
      let out: TextOutput | null = null;
      let saved2: CallRecord | null = null;
      if (input.type === "end") {
        saved2 = await end(record, pkg, session, { reason: "child_stopped" });
      } else {
        try {
          out = input.type === "child" ? await session.child(input.text.trim()) : input.type === "tick" ? await session.tick() : await session.writing(input.status);
        } finally {
          saved2 = await save(record, pkg, session);
        }
      }
      if (!saved2) return { ok: false, error: "conflict" };
      return result(saved2, saved2.trace ?? session.trace(), out);
    },

    async view(id) {
      const record = await store.get(id);
      return record && recordView(record);
    },
  };
}
