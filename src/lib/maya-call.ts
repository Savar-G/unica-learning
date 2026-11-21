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
// The child's ink in a chat (#534, #635): an append-only log, one event per change the child makes on the chat's board
// and per batch of Maya's as it reached that board (`InkEvent`, src/lib/board-history.ts), numbered by the desk from 1.
// The desk sends only the events the call does not hold yet (`appendInk`); the store appends them once each, by sequence,
// and answers with the last sequence it holds. Nothing raises the call's revision, so the chat's next message still goes
// in. The call's board (`callView`) is Maya's batches as the call recorded them with the child's ink from the log
// (`withInkLog`), as the admin replay plays it. Calls from before the log keep their whole-board copy (`childInk`).
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
// refuses it again (migration add_maya_calls).
//
// The safety flag (#333): when the controller's SAFETY interrupt fires, the call is flagged in the same write that saves
// the input, and then the internal alert goes through the alerts seam (src/lib/maya-call-alert.ts): one email per call
// and flag level, sent once. A request for harmful content (#383 C29) raises the flag UNSAFE_REQUEST_FLAG names. A flag
// only rises. Each later request on a flagged call sends its alert again if it was refused or never claimed, so a
// failed alert is retried by the next input, or by "end" on an ended call; an unknown one is never sent again.
//
// Maya's spending cap (D-290, D-291, src/lib/maya-spend.ts): the model, the review and the rebuild seams get the call, so
// each paid request is reserved and settled in the spending ledger for the right child (an admin test call only toward
// the month's total). A new call starts only while the ledger is "open". Before and after each input of a live call the
// module asks the ledger again: when the week is used up, or the ledger cannot be read, the call ends with code's closing
// line (SPEND_CLOSE) after what Maya has already said. The close ends the call as a technical stop with SPEND_CLOSE's
// detail in the trace; the record's outcome says "time_limit", and the transcript shows the closing line as Maya's.
// Safety comes before the cap. Only the model reads the child's words for danger, so words that the cap would leave unread
// get one safety read: it cannot be refused, it is off the child's week, and no words of the model are said unless it
// raises a flag. The read stands apart from the teaching session (`safetyRead`), so it also reads words that come after the
// call's own clock has run out: a danger then goes into the session as a safety signal (`TextSession.safety`), which is
// taken before the clock. From this path only code's guidance and closing line are said, whatever the session holds; a
// request for harmful content raises its flag and says nothing more. A flag then gives code's guidance, the alert and the
// safety close, as in any call. A voice call also
// counts its speech-to-text, renewed on the worker's own timer (`meter`), and its voice when it is made (`spoken`).
//
// Seams: the call store (Supabase: src/lib/maya-call-store.ts; memory: src/lib/maya-call-memory.ts), the wording
// history (Supabase: src/lib/maya-wording-history-store.ts; memory: memoryWordingHistoryStore), the learning events, the
// profile rebuild, the alerts, the parent's note (#331), the model by id, the clock, ids and the seed. Pure otherwise: no Next.js, React,
// network or database; node:crypto through the trace's package hash.
import { monitorProduct } from "@/lib/product-monitoring";
import { voiceBoardHistory } from "@/lib/voice-board-history";
import type { BoardSnapshot } from "@/lib/board-protocol";
import { speechWords, type BoardCue } from "@/lib/board-speech";
import { applyBatch, boardView, createScene, type Batch } from "@/lib/board";
import { createHistory, inkLog, mayaWrites, readInkEvent, withChildInk, withInkLog, type BoardHistory, type InkEvent } from "@/lib/board-history";
import { fitView, type PlayStep } from "@/lib/board-svg";
import type { LearningEvents, NewLearningEvent } from "@/lib/learning-events";
import type { NoteStep } from "@/lib/maya-call-note";
import { clearStop, heardWordings, learningEvent, transferLearningEvent, limitsOf, mayaPackageCheck, nextActs, SAFETY_GUIDANCE, sentenceCueWord, streamPlan, type Assistance, type Outcome, type Session, type Severity, type WordingHistory, type WordingHistoryStore } from "@/lib/maya";
import { createHandleDiagnosticIds } from "@/lib/maya-handle-diagnostic";
import type { PrepareRecord } from "@/lib/maya-prepared";
import { withRequestContext } from "@/lib/maya-request-trace";
import { modelInput, type MayaModel } from "@/lib/maya-model";
import type { TalkReviewer } from "@/lib/maya-talk-review";
import type { MathReviewer } from "@/lib/maya-math-review";
import { snapshotFates } from "@/lib/board-fate";
import { checkedExchangeProposal, childExchangeProposal, childExchangeTarget, fixedSafetyDisclosure, selectedObject, selectionOffer, selectionSeen } from "@/lib/maya/session";
import { readSelectionTarget, type SelectedObject, type SelectionOffer, type SelectionTarget } from "@/lib/maya/board-selection";
import { needsSafetyRead, SAFETY_PAUSE, sensitiveHearing, type ChildHearing } from "@/lib/maya/sensitive-input";
import { readExchangeTarget, sameExchangeTarget, type ExchangeTarget } from "@/lib/maya/checked-exchange";
import { createTextSession, readFateReports, withHelpLedger, type BoardFateReport, type FinishOptions, type SavedTextSession, type TextOutput, type TextSession, type TextSessionOptions } from "@/lib/maya-text";
import { packageHash, type MayaTrace } from "@/lib/maya-trace";
import { type QuestionPackage, type QuestionRef } from "@/lib/question-package";
import { teachingPackage } from "@/lib/maya-teaching";
import { BOARD_CLOSE_SETTLE_MS, connectedSeconds, VOICE_CALL_STALE_MS, type ConnectionEvent, type ConnectionKind } from "@/lib/maya-voice";
import { spendCloseOf, SPEND_CLOSE, type CallSpend, type SpendCall, type SpendState, type VoiceMeter } from "@/lib/maya-spend";
import { BLOCK_DRAIN_MS, type CallBudget, type Handle } from "@/lib/maya-spend-block";
import { SpendRefused } from "@/lib/maya-spend-ai";
export type { SpendCall } from "@/lib/maya-spend";

/** The longest the note step of an ended call may take; after it the note stays pending. */
export const NOTE_STEP_MS = 20_000;
/** The most earlier calls of the child whose pending note a call's end picks up. */
export const NOTE_SWEEP = 3;

/** The version of the call record's shape (record_version). */
export const CALL_RECORD_VERSION = 1;

export type CallKind = "admin_test" | "chat" | "family";
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
  /** The call's child, so the alert's send log row is deleted with the child. */
  childId: string;
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
  live: { package: QuestionPackage; text: SavedTextSession; cancelled?: true; pendingVoice?: VoiceTurn; acknowledged?: string[]; guidancePlayed?: Severity } | null;
  trace: MayaTrace | null;
  boardHistory: BoardHistory | null;
  /**
   * A text call's board as the child's desk last sent it (#534): its strokes are the child's ink of the call. Saved
   * without raising the revision; absent or null when the desk sent none.
   */
  childInk?: BoardHistory | null;
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

/** Emit only after the revision write succeeds. Recovery updates have no lifecycle transition. */
function monitorCallChange(record: CallRecord, change: CallChange): void {
  const attributes = { callId: record.id, kind: record.kind, mode: record.mode };
  const cancelledBeforeStart = record.startedAt === null && change.live?.cancelled === true;
  if (!cancelledBeforeStart && record.startedAt === null && change.startedAt != null) monitorProduct("maya.started", attributes);
  if (change.flag && change.flag.level !== record.flag?.level) monitorProduct("maya.safety_flagged", { ...attributes, flag: change.flag.level });
  if (record.status === "live" && change.status === "ended") {
    // Cancelling a voice ticket before Maya joins uses a technical outcome in the record. It is not a failed conversation.
    const started = !cancelledBeforeStart && (record.startedAt !== null || change.startedAt != null);
    monitorProduct(started && change.outcome?.reason === "technical_issue" ? "maya.failed" : "maya.ended", { ...attributes, count: change.counts?.childTurns });
  }
}

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
  /**
   * #1107: saves a live call's state inside a turn (a chat's streamed parts) only when the stored revision is `revision`
   * and the call is live, WITHOUT raising the revision: a message's claim stays pending until the turn's own save, and a
   * recovery that took the claim (a new revision) refuses every later checkpoint of the old turn. False otherwise.
   * A store without it streams no chat.
   */
  checkpoint?(id: string, revision: number, live: NonNullable<CallRecord["live"]>): Promise<boolean>;
  /** The child's ended calls whose note is pending, oldest end first, at most `limit`. */
  pendingNotes(childId: string, limit: number): Promise<CallRecord[]>;
  /**
   * Clears an ended call's pending note without raising its revision (review R403-5): the note is not part of the
   * call's requests, so a clear that is still writing when the note time is up never makes the revision a request
   * holds stale. True when the call had a pending note.
   */
  clearNote(id: string): Promise<boolean>;
  /**
   * Appends a chat's ink events (#635), in one step and without raising the call's revision: `events[i]` has sequence
   * `from + i`, and an event at a sequence the call holds already is left as it is. `closed`: the call ended more than
   * INK_AFTER_END_MS ago. `busy`: an append came less than INK_SAVE_GAP_MS ago. `gap`: `from` is past the next sequence.
   * `not_found`: no chat with this id of this parent and child. `held`: the last sequence the call holds. A chat from
   * before the log (R639-4) with no event yet has its whole-board copy turned into events first, in the same step.
   */
  appendInk(id: string, owner: InkOwner, from: number, events: readonly InkEvent[]): Promise<InkAppend>;
  /** A chat's ink log, in sequence order. */
  readInk(id: string): Promise<InkEvent[]>;
}

export interface CallModelOptions {
  safetyRead?: boolean;
  prepared?: { budget: CallBudget; handle: Handle; diagnosticHandleId?: string };
}

export interface CallSeams {
  /**
   * D-345: whether admin test calls teach with the tutor core (default on). False keeps every call on the controller,
   * for the controller's own tests.
   */
  tutor?: boolean;
  /**
   * D-345: whether family calls (desk chat, kind "chat", and family voice, kind "family") also teach with the tutor core.
   * The server's MAYA_TUTOR_FAMILIES switch (callSeams); only true turns it on. A resumed call keeps what it started with.
   */
  tutorFamilies?: boolean;
  /** Enables the checked exchange for newly created, supported tutor sessions. */
  checkedExchange?: boolean;
  checkedRoutine?: boolean;
  /**
   * #1107 reader-first release: saved sentence writes are off unless explicitly enabled by the server.
   * Enable only after all supported readers and end workers can restore parts and interrupted turns.
   */
  streamChat?: boolean;
  store: CallStore;
  /** The children's wording history: read before a call, added to when it ends. */
  history: WordingHistoryStore;
  events: LearningEvents;
  /** Rebuilds the child's profile; true when it was built. Never throws. */
  rebuild(childId: string, options?: { factsOnly?: boolean; call?: SpendCall }): Promise<boolean>;
  /**
   * The model to use: `null` asks for the model a new call uses now (the real one when the server has its key, else
   * the fake); an id asks for that model again, or null when it is no longer available. `safetyRead`: the model reads the
   * child's words for danger at the cap (src/lib/maya-spend-ai.ts).
   */
  model(id: string | null, call?: SpendCall, how?: CallModelOptions): MayaModel | null;
  /**
   * The free-talk review (D-197) for a call on this model, or null (then every free-talk piece becomes a bank phrase).
   * Optional: without it a call has no review.
   */
  reviewer?(modelId: string, call?: SpendCall): TalkReviewer | null;
  /**
   * Two-layer true math (2026-11-15): the tutor core's math-truth review for a call on this model, or null. Optional:
   * without it a tutor sentence whose math code did not read whole is refused (one repair, then code's line).
   */
  mathReviewer?(modelId: string, call?: SpendCall): MathReviewer | null;
  /** Maya's spending cap (src/lib/maya-spend.ts). Optional: without it nothing is charged or capped. */
  spend?: CallSpend;
  /** True when the family is marked as a test family (public.test_accounts). */
  isTestFamily(parentId: string): Promise<boolean>;
  /** Server authorization for a child chat. Absent means refused. */
  canChat?(parentId: string, childId: string): Promise<boolean>;
  /** Server authorization for a child's voice call from the family desk (kind "family"). Absent means refused. */
  canCallVoice?(parentId: string, childId: string): Promise<boolean>;
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
/**
 * `fates` (B1, chat): what the child's screen did with Maya's board batches since the call last heard (src/lib/board-fate.ts).
 * The session hears them before the child's words, so the brief for this turn counts only what the screen showed.
 */
export type CallInput = { type: "child"; text: string; fates?: BoardFateReport[] } |
  { type: "exchange"; target: ExchangeTarget; fates?: BoardFateReport[] } |
  { type: "select"; target: SelectionTarget; fates?: BoardFateReport[] } |
  { type: "tick" } | { type: "writing"; status: "started" | "done" } | { type: "end" };

/** The most characters of one typed child turn. */
export const MAX_CHILD_TEXT = 500;
/** The most ink events one request may append (#635); the desk sends more in turns. */
export const MAX_INK_EVENTS = 200;
/** The longest request of ink events, as JSON text: 200 long strokes fit. */
export const MAX_INK_TEXT = 1_000_000;
/** The most ink events one chat keeps (the database's limit too). */
export const MAX_INK_SEQ = 20_000;
/** One append a second per call at most (R625-6): the desk sends 1.5 s after a change, and again before the end. */
export const INK_SAVE_GAP_MS = 1000;
/** Ink is taken this long after the call ended, and not later (R625-6). */
export const INK_AFTER_END_MS = 5 * 60_000;
/** What one append of a chat's ink did (`CallStore.appendInk`), with the last sequence the call holds. */
export interface InkAppend { status: "saved" | "busy" | "closed" | "gap" | "not_found"; held: number }
/** Whose desk sends a chat's board: the store keeps it only for a chat of this parent and child. */
export interface InkOwner { parentId: string; childId: string }

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
  scopeRefusals?: import("@/lib/maya").ScopeRefusal[];
  freeTalk: { on: boolean; reviewer: string | null; lines: FreeTalkLine[] };
  /** Maya's board batches, in order. */
  batches: Batch[];
  exchange?: ExchangeTarget;
  exchangeResult?: string;
  /** #1152: what the child may point to now, and the object their last answered tap named. */
  selection?: SelectionOffer;
  selected?: SelectedObject;
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
  confirmWorkbook?: boolean;
  kind: CallKind;
  parentId: string;
  childId: string;
  childName: string | null;
  grade?: number;
  package: unknown;
  startedBy: string | null;
  /** The call's id when the caller made it first (a desk chat names its call before it exists). */
  id?: string;
  /** The call's end when it is shorter than 10 minutes (ms). A family voice call passes it when the child's week has less than 10 minutes left; tests use it for short calls. */
  limitMs?: number;
}

export type CallResult =
  | { ok: true; view: CallView; output: { say: string[]; newBatches: number; safetyMessage: string | null; exchangeTurnId?: string } }
  | { ok: false; error: "not_found" | "not_test_family" | "invalid_question" | "invalid_input" | "conflict" | "board_changed" | "model_unavailable" | "voice_call" | Exclude<SpendState, "open"> };

/** What reached the child after one input of a voice call. */
export interface VoiceTurn {
  boardCues?: BoardCue[];
  exchangeTurnId?: string;
  say: string[];
  newBatches: number;
  safetyMessage: string | null;
  /** The call ended with this input. */
  ended: boolean;
  /**
   * Safety guidance after a child's disclosure, or words past the closing time (`gate` and `step` in
   * src/lib/maya/session.ts): the worker says them at once and waits for nothing that came before them.
   */
  priority?: boolean;
  /** The exact safety guidance among `say`, which the worker says once more if it was cut (#589). */
  guidance?: string;
  /** How long this input spent on the model, its repair and the free-talk reviews (#532). Absent when no input ran. */
  time?: { modelMs: number; repairMs: number; reviewMs: number };
  /**
   * D-341: the child is thinking ("um", "wait"). `say` holds at most one short patient line, and nothing more is said
   * until the child speaks or the silence rule comes: no thinking phrase for this turn.
   */
  wait?: boolean;
}

/**
 * The worker's ear on one child turn while it runs (D-341, the streaming contract of src/lib/maya-text.ts). `begun`
 * comes once, when the child's words reached the session and before any model call: `model` false when no model call
 * is made (a thinking turn, a call that ended), `streams` false when the reply cannot stream, so its first words wait for
 * the whole reply (`conversational` false: a version 2 model, which never streams). `part` gives each checked sentence in index order, once; a sentence given is never taken back.
 * `cancel(fromIndex)` drops sentences from that index that were not given yet; `end` ends the output. The finished
 * turn (`VoiceTurn.say`) holds the same sentences in the same order, then any that follow.
 */
/**
 * What the spend gate waited for before one turn's input, measured at its seam (`turn`), for the worker's telemetry.
 * Times are the call's clock. It adds no read, no reservation and no wait: it only times the ones the gate makes.
 */
export interface AdmissionSample {
  startedAt: number;
  endedAt: number;
  /** Speech-to-text coverage: no meter, a state already held (cached), or a read that was awaited (network). */
  stt: "none" | "cached" | "network";
  sttMs: number;
  /** The model block: taken in memory with no wait, or awaited (its allowance was 0, so the refill decided). */
  block: "memory" | "awaited";
  blockMs: number;
  outcome: "admitted" | "cap" | "inactive" | "error";
}

export interface VoiceSay {
  /** The turn's admission interval, once, when the gate is done (also when it refuses the turn). */
  admission?(sample: AdmissionSample): void;
  begun?(plan: { model: boolean; streams: boolean; conversational: boolean }): void;
  part?(sentence: string, index: number): void;
  cancel?(fromIndex: number): void;
  end?(): void;
  checkedBoardSettled?(): Promise<void> | undefined;
  /**
   * After #1072: the turn's one repair starts (a tutor teaching message was refused) and nothing of the turn was said yet.
   * The worker may say its thinking phrase now, with its own choice rule, and returns the phrase's id, or null when it
   * said none. It must decide at once (no wait): the id goes into the repair attempt of the trace.
   */
  repairing?(): string | null;
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
  /** An input is still running: a close call can be out after its guidance went out (#589). */
  readonly working: boolean;
  /**
   * Hears safety guidance as soon as the session accepts it, before the model is asked for the close (#589). The input's
   * own turn then holds only what comes after it. The save follows behind, as `settled` shows.
   */
  onGuidance(listener: (turn: VoiceTurn) => void): void;
  guidancePlayback?(text: string): Promise<void>;
  safetyDeadline?(): Promise<VoiceTurn | null>;
  deferGuidance?(): Promise<boolean>;
  /** Diagnostic decisions from the controller, including discards outside a child turn. The observer gets a copy. */
  onPreparation?(listener: (record: PrepareRecord) => void): void;
  /** Saved last words and unplayed guidance when this handle restored a safety close. */
  readonly pendingFinal: VoiceTurn | null;
  readonly boardSnapshot: BoardSnapshot;
  /** The acknowledgement phrases this call has said (#532), kept across a worker replacement. */
  readonly acknowledged: readonly string[];
  /**
   * Saves a phrase before it is said, on the last saved session and never on a turn in progress, at the next revision
   * like any other save. False: this handle no longer owns the call, so the phrase must not be said.
   */
  acknowledge(id: string): Promise<boolean>;
  /**
   * Persist receiver outcomes with their presentation times, under this worker's revision. B1: the session hears what
   * the child's screen did with each batch in it (shown or cancelled), saved with the next turn.
   */
  observeBoard(snapshot: BoardSnapshot): Promise<void>;
  /** Reports worker playout for a checked turn. A finished handle does not prove the child heard it. */
  exchangePlayback?(turnId: string, playback: "finished" | "interrupted"): Promise<void>;
  reconcileExchange?(retiredTurns: readonly string[]): Promise<void>;
  /** B1: batches the board core refused at staging (board-speech `refused`): the session counts them as skipped. */
  boardRefused?(batchIds: readonly string[]): void;
  /** `openingSpoken`: the worker speaks the opening itself, so the turn comes back with no say (D-341). */
  start(options?: { openingSpoken?: boolean }): Promise<VoiceTurn>;
  /** Prepares an interim reply without speech, credit or a saved input. */
  prepare(input: { text: string; reason: "interim" }): boolean;
  /** `say` hears this turn's sentences while it runs (VoiceSay), before the save behind it. */
  child(text: string, options?: { uncertain?: boolean; alternatives?: string[] }, say?: VoiceSay): Promise<VoiceTurn>;
  exchange?(target: ExchangeTarget, onAccepted?: () => void): Promise<VoiceTurn | null>;
  /**
   * #1152: the child pointed to a board object. Null for a tap already answered or one this call cannot take now; a turn
   * with no words for a stale tap after Maya already asked to point again. `onAccepted` runs once the reply is committed,
   * before it is saved. `stopsSpeech` is true only for a current object: then the worker stops older speech first. A stale
   * tap's request to point again waits until Maya has finished.
   */
  select?(target: SelectionTarget, onAccepted?: (stopsSpeech: boolean) => void): Promise<VoiceTurn | null>;
  /** A durable child action whose board change the receiver has not confirmed yet. */
  readonly pendingExchange?: Batch;
  tick(): Promise<VoiceTurn>;
  writing(status: "started" | "done"): Promise<VoiceTurn>;
  /** Ends from the last durable state without waiting for active model work. */
  limit(): Promise<void>;
  /** Stores a connection event (on the server's clock). Never throws. */
  connection(kind: ConnectionKind): Promise<void>;
  /**
   * Renews speech-to-text ahead of its end, whatever the child is doing; the worker asks on its own timer. When no more
   * fits and no input is running, the call closes and this returns code's closing words. Else null.
   */
  meter(): Promise<VoiceTurn | null>;
  stopMeter(): Promise<void>;
  /** Counts the voice of words that became audio at the provider. Never throws, and nothing waits for it. */
  spoken(text: string): Promise<void>;
  /**
   * Ends the call if it has not ended: "child_stopped" when the child hung up, else a technical issue with `detail`.
   * Stores the outcome, the connected seconds, the learning event and the profile rebuild. Safe to call twice.
   */
  end(how: FinishOptions): Promise<void>;
  /** Waits until every save so far is done. */
  settled(): Promise<void>;
  /**
   * #1203: waits, under one deadline of BLOCK_DRAIN_MS (src/lib/maya-spend-block.ts), until the call's spend is written:
   * the budget blocks with their real totals (a prepared reply may still be asking its provider's receipt) and the
   * speech-to-text and voice rows. `end`, `limit` and the guidance close do not wait for these writes. For the worker's
   * exit, after the media closed and the child was told. Never throws.
   */
  spendSettled(): Promise<void>;
}

export type OpenVoiceResult = { ok: true; call: VoiceCall } | { ok: false; error: "not_found" | "not_voice" | "ended" | "conflict" | "model_unavailable" | "unavailable" };

/**
 * #1107: the desk's ear on one chat child turn while it runs (the streaming contract of src/lib/maya-text.ts, as a voice
 * call's `VoiceSay.part`): each checked sentence, with the child's name filled, in index order and once; a sentence given
 * is never taken back. The finished turn's reply holds the same sentences in the same order, then any that follow. A
 * listener that throws changes nothing of the turn.
 */
export interface TextSay { part(sentence: string, index: number, board?: Batch[]): void }

export interface MayaCalls {
  start(input: StartInput): Promise<CallResult>;
  /** Makes a voice call's record, not started: Maya's worker starts it when the child joins. */
  startVoice(input: StartInput): Promise<CallResult>;
  /** Opens a live voice call in the worker, with the providers that carry it. */
  openVoice(id: string, providers: { speechToText: string; voice: string }, childName: string | null): Promise<OpenVoiceResult>;
  /** `say` (#1107): hears a chat child turn's checked sentences while it runs; ignored for any other call or input. */
  input(id: string, revision: number, input: CallInput, childName: string | null, say?: TextSay): Promise<CallResult>;
  /**
   * Appends the child's ink events of a chat (#635): `events` (plain data, read here) at sequences `from`, `from + 1`, …;
   * the call keeps each sequence once. For a chat of this parent and child, live or ended a few minutes ago; never
   * raises the call's revision. `held` is the last sequence the call holds, which the desk sends on from.
   * `not_this_desk`: a chat of this family that is another child's (#652): an answer about the desk that asked, which
   * says nothing about the ink. `not_found`: no chat of this desk has this id (no call, another family's call or a call of
   * another kind, all alike, R654), so the ink can never go.
   */
  appendInk(id: string, owner: InkOwner, from: unknown, events: unknown): Promise<{ ok: true; held: number } | { ok: false; error: "invalid_input" | "not_found" | "not_this_desk" | "busy" | "closed" | "gap"; held: number }>;
  /**
   * A chat's ink log for its own desk (#635). `not_this_desk`: a chat of this family that is another child's (#652);
   * `not_found`: no chat of this desk has this id (another family's call and a call of another kind answer the same). A chat from before the log (R639-4) that has no event yet answers its
   * whole-board copy as a log; the store turns that copy into events before it appends the first new one, so the
   * sequences are the same.
   */
  readInk(id: string, owner: InkOwner): Promise<{ ok: true; events: InkEvent[] } | { ok: false; error: "not_found" | "not_this_desk" }>;
  view(id: string): Promise<CallView | null>;
}

const iso = (ms: number) => new Date(ms).toISOString();
/** The model id of the fake rule player (src/lib/maya-model-fake.ts). */
export const FAKE_MODEL_ID = "fake";

/** The board batches of a trace or a live session, as the board core took them. */
// B2: `after` goes with a batch, so the desk can skip a batch whose earlier batch it skipped.
const batchesOf = (board: readonly { transactionId: string; commands: readonly unknown[]; after?: readonly string[] }[]): Batch[] => board.map((b) => ({ transactionId: b.transactionId, commands: b.commands, ...(b.after?.length ? { after: [...b.after] } : {}) }));

function replayableBoard(trace: MayaTrace): MayaTrace["board"] {
  if (!trace.checkedExchange) return trace.board;
  const excluded = new Set(trace.checkedExchange.turns.flatMap((turn) => turn.actions)
    .filter((action) => action.fate === "skipped" || action.fate === "cancelled").map((action) => action.batchId));
  for (const batch of trace.board) {
    if (batch.after?.some((id) => excluded.has(id))) excluded.add(batch.transactionId);
  }
  return trace.board.filter((batch) => !excluded.has(batch.transactionId));
}

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
    else if (t.kind === "technical") {
      const capped = spendCloseOf(t.detail);
      lines.push(capped ? { speaker: "maya", text: SPEND_CLOSE[capped].line, second: second(t.at) } : { speaker: "note", text: "The call stopped because of a connection or service problem.", second: second(t.at) });
    }
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
  for (const b of replayableBoard(trace)) {
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

/**
 * The latest time of the child's ink on a call's board, in ms from the call's start (R625-3): the call's end (or its last
 * turn while live), plus the time a board is still taken after the end.
 */
function inkWindowEnd(trace: MayaTrace): number {
  const start = trace.turns.find((t) => t.kind === "start")?.at ?? 0;
  const end = trace.endedAt ? Date.parse(trace.endedAt) : Math.max(start, ...trace.turns.map((t) => t.at));
  return Math.max(0, end - start) + INK_AFTER_END_MS;
}

export function callView(record: CallRecord, trace: MayaTrace, alerts: AlertState[] = [], ink: readonly InkEvent[] = []): CallView {
  // A missing delivery field identifies the legacy contract. An explicit empty delivery is authoritative.
  const observed = record.mode === "voice" && record.boardHistory?.delivery !== undefined;
  const recorded = record.boardHistory ?? boardHistoryOf(trace);
  // A text call's board carries the child's ink from the desk (#534); a voice call's ink is in its observed board.
  const window = { endMs: inkWindowEnd(trace) };
  const history = record.mode !== "text" ? recorded : ink.length > 0 ? withInkLog(recorded, ink, window) : withChildInk(recorded, record.childInk ?? null, window);
  const exchange = record.status === "live" && record.live ? childExchangeTarget(record.live.text.session) : undefined;
  const exchangeResult = trace.checkedExchange?.turns.find((t) => t.childAction)?.actions[0]?.batchId;
  const live = record.status === "live" && record.live ? record.live.text.session : null;
  const selection = live ? selectionOffer(live) : undefined;
  const selected = live ? selectedObject(live) : undefined;
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
    scopeRefusals: structuredClone(trace.scopeRefusals ?? []),
    batches: observed ? history.events.flatMap(e => e.kind === "maya" ? [{ transactionId: e.batchId, commands: e.commands }] : []) : batchesOf(replayableBoard(trace)),
    ...(exchange ? { exchange } : {}),
    ...(exchangeResult ? { exchangeResult } : {}),
    ...(selection ? { selection } : {}),
    ...(selected ? { selected } : {}),
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
    const asked = session.session.checkedRoutine ? undefined : session.trace().turns.find((t) => t.kind === "maya" && t.attempts.some((a) => readsUnsafe(a.proposal)));
    const at = session.session.unsafeRequestAt ?? asked?.at;
    if (at !== undefined) flags.push({ level: unsafe, at: iso(at) });
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
  if (input.type === "child") return typeof input.text === "string" && input.text.trim().length > 0 && input.text.length <= MAX_CHILD_TEXT && (input.fates === undefined || readFateReports(input.fates) !== null);
  if (input.type === "exchange") return readExchangeTarget(input.target) !== null && (input.fates === undefined || readFateReports(input.fates) !== null);
  if (input.type === "select") return readSelectionTarget(input.target) !== null && (input.fates === undefined || readFateReports(input.fates) !== null);
  if (input.type === "writing") return input.status === "started" || input.status === "done";
  return input.type === "tick" || input.type === "end";
}

/** What the admin screens show of a stored call: an ended call from its trace, a live one from its saved session. */
export function recordView(record: CallRecord, alerts: AlertState[] = [], ink: readonly InkEvent[] = []): CallView | null {
  if (record.trace) return callView(record, record.trace, alerts, ink);
  if (!record.live) return null;
  const session = createTextSession({ callId: record.id, package: record.live.package, model: idleModel(record), clock: () => 0, runner: "text", resume: record.live.text });
  return callView(record, session.trace(), alerts, ink);
}

/**
 * A text chat of the same family that is another child's (#652): the one case a desk is told "not this desk", so a
 * sibling's ink on a shared device is kept. Another family's call, a call of another kind and no call at all answer the
 * same `not_found`, so no desk learns whether another family's call exists (R654).
 */
const siblingChat = (record: CallRecord | null, owner: InkOwner): boolean =>
  !!record && record.kind === "chat" && record.mode === "text" && record.parentId === owner.parentId && record.childId !== owner.childId;

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

  /** What the spending ledger needs of a call. */
  const spendCall = (r: Pick<CallRecord, "id" | "kind" | "parentId" | "childId">): SpendCall => ({ id: r.id, kind: r.kind, parentId: r.parentId, childId: r.childId });

  /** Whether the call may make its next paid request ("open" without the seam). Never throws. */
  const spendState = async (r: CallRecord): Promise<SpendState> => (seams.spend ? seams.spend.state(spendCall(r)) : "open");

  /** The call's own clock has run out: any input now ends it, and the session reads no more words. */
  const pastClock = (session: Session): boolean => session.startedAt !== null && seams.clock() - session.startedAt >= limitsOf(session).endAtMs;

  /** What a safety read found in the child's words. */
  interface SafetyFound { proposal: unknown; severity: Severity | null; unsafe: boolean; pause?: boolean; known?: boolean }

  const safetyDrainMs = 2_000;
  function knownSafety(hearings: readonly ChildHearing[]): SafetyFound | null {
    const readings = hearings.map(sensitiveHearing);
    const severity = readings.includes("immediate") ? "immediate" : readings.includes("concern") ? "concern" : null;
    const unsafe = readings.includes("unsafe_request");
    const pause = readings.includes("clarify");
    return severity || unsafe || pause ? { proposal: null, severity, unsafe, pause, known: true } : null;
  }

  /**
   * The child's words, read once by the model for danger, apart from the teaching session: its clock and the cap do not
   * stop it. Null when the read could not be made. The read's words are never said.
   */
  async function safetyRead(record: CallRecord, hearings: readonly ChildHearing[]): Promise<SafetyFound | null> {
    const saved = record.live?.text.session;
    if (!saved || !hearings.length) return null;
    let known: SafetyFound | null = null;
    let text: string;
    if (saved.checkedRoutine) {
      known = knownSafety(hearings);
      if (known?.severity) return known;
      text = hearings.filter((h) => !h.uncertain && sensitiveHearing(h) === null && needsSafetyRead(h.text)).map((h) => h.text).join("\n");
    } else {
      text = hearings.map((h) => h.text).join(" ");
    }
    if (!text) return known;
    const model = seams.model(record.model, spendCall(record), { safetyRead: true });
    if (!model) return known;
    try {
      const at = seams.clock();
      const input = saved.checkedRoutine ? {
        promptVersion: model.promptVersion, question: null, state: "CLOSE", done: [], passed: [], ladderStep: "",
        childTurn: text, transcript: [], offers: [], repair: null, freeTalk: false, wordLimit: 0, noBoard: true, scopeSkills: [],
      } : modelInput({
        ...structuredClone(saved), expect: "maya", turn: { at, text, uncertain: false },
        turns: [...saved.turns, { at, speaker: "child", text, state: saved.state }],
      });
      const stop = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      let proposal: unknown;
      try {
        const read = model.propose(input, stop.signal);
        proposal = saved.checkedRoutine ? await Promise.race([read, new Promise<null>((resolve) => {
          timer = setTimeout(() => { resolve(null); stop.abort(); }, safetyDrainMs);
        })]) : await read;
      } finally { clearTimeout(timer); }
      const safety = (proposal as { reading?: { safety?: unknown } | null } | null)?.reading?.safety;
      // A proposal of kind "safety" with no severity is a concern (final check 1, 2026-11-15; as priorityOf in session.ts).
      const kindSafety = (proposal as { kind?: unknown } | null)?.kind === "safety";
      const severity = safety === "concern" || safety === "immediate" ? safety : kindSafety ? "concern" : null;
      const unsafeRequest = readsUnsafe(proposal);
      return !severity && !unsafeRequest && known ? known : { proposal, severity, unsafe: unsafeRequest };
    } catch {
      monitorProduct("maya.recovery_failed", { callId: record.id, step: "safety" });
      return known;
    }
  }

  /** A model that gives the safety read's proposal once and is asked nothing more. */
  const replay = (record: CallRecord, proposal: unknown): MayaModel => {
    let given = false;
    return { ...idleModel(record), propose: async () => {
      if (given) throw new Error("the model is not asked again after a safety read");
      given = true;
      return proposal;
    } };
  };

  /**
   * Gives a session what a safety read found: a danger flags it and code says the guidance (through the child's turn
   * while the clock runs, as a safety signal once it has run out). A request for harmful content raises its flag in the
   * change the call ends with. Returns the guidance to say: code's own, never the session's other words.
   */
  async function heed(record: CallRecord, session: TextSession, found: SafetyFound | null, hearings: readonly ChildHearing[]): Promise<{ guidance: string[]; change: CallChange }> {
    if (found?.severity) {
      await (session.session.checkedRoutine || pastClock(session.session)
        ? session.safety(found.severity)
        : session.child(hearings.map((h) => h.text).join(" ")));
      const s = session.session.safety;
      return { guidance: s.flagged && s.severity ? [SAFETY_GUIDANCE[s.severity]] : [], change: {} };
    }
    const flag = found?.unsafe && unsafe ? risen(record.flag, { level: unsafe, at: iso(seams.clock()) }) : undefined;
    return { guidance: [], change: flag ? { flag } : {} };
  }

  const fixedClosingWords = (saved: Session, hearings: readonly ChildHearing[], found: SafetyFound | null): string[] =>
    saved.checkedRoutine ? [
      ...[fixedSafetyDisclosure(hearings.map(({ text }) => text).join("\n"))].filter(Boolean),
      ...(!found?.severity && (found?.pause || saved.sensitiveHold) ? [SAFETY_PAUSE] : []),
    ] : [];

  /**
   * Ends a live call because of the cap, from its last saved state and with no teaching. Words of the child's that the cap
   * leaves unread get one safety read; guidance due comes first, then code's closing line, and nothing else is said.
   * What reached the child before stays as it was. Null on a conflict.
   */
  async function closeAtCap(record: CallRecord, state: Exclude<SpendState, "open">, childName: string | null, extra?: (endedAt: number) => Promise<CallChange>, hearings: readonly ChildHearing[] = [], help: readonly Assistance[] = [], stageSafety?: (session: TextSession, turn: VoiceTurn) => Promise<CallRecord | null>, alreadyRead?: Promise<SafetyFound | null>): Promise<{ record: CallRecord; say: string[]; safetyMessage: string | null; guidance?: string } | null> {
    const live = record.live!;
    const found = live.text.session.safety.flagged ? null : await (alreadyRead ?? safetyRead(record, hearings));
    // Final check 12: the help of every sentence the live session emitted (its ledger), also during the unsaved turn.
    const session = textSession(record, live.package, found?.severity && !live.text.session.checkedRoutine ? replay(record, found.proposal) : idleModel(record), childName, withHelpLedger(live.text, help));
    const before = session.session.safety;
    const owed = before.flagged && !before.guided && before.severity ? [SAFETY_GUIDANCE[before.severity]] : [];
    const heeded = found ? await heed(record, session, found, hearings) : { guidance: owed, change: {} };
    const withFlag = async (endedAt: number): Promise<CallChange> => ({ ...(extra ? await extra(endedAt) : {}), ...heeded.change });
    const closedAlready = session.ended;
    const say = [...heeded.guidance, ...fixedClosingWords(live.text.session, hearings, found), ...(closedAlready ? [] : [SPEND_CLOSE[state].line])];
    const safety = session.session.safety;
    const safetyMessage = safety.flagged && safety.severity ? SAFETY_GUIDANCE[safety.severity] : null;
    const guidance = heeded.guidance[0];
    if (stageSafety && closedAlready && guidance && safetyMessage) {
      const saved = await stageSafety(session, { say, safetyMessage, guidance, newBatches: 0, priority: true, ended: true });
      return saved ? { record: saved, say, safetyMessage, guidance } : null;
    }
    const ended = closedAlready ? await end(record, live.package, session, {}, withFlag) : await end(record, live.package, session, { detail: SPEND_CLOSE[state].detail }, withFlag, record.startedAt === null, true);
    if (!ended) return null;
    return { record: ended, say, safetyMessage, ...(guidance ? { guidance } : {}) };
  }

  /**
   * A child's words after the call's own clock has run out, with time left in the week: the session would end the call
   * without reading them, so they get the safety read first. Null when the clock still runs or the call is flagged.
   */
  async function closeAtClock(record: CallRecord, childName: string | null, hearing: ChildHearing): Promise<{ record: CallRecord; say: string[]; safetyMessage: string | null } | null> {
    const live = record.live!;
    if (!pastClock(live.text.session) || live.text.session.safety.flagged) return null;
    const found = await safetyRead(record, [hearing]);
    if (!live.text.session.checkedRoutine && !found?.severity && !found?.unsafe) return null;
    const session = textSession(record, live.package, idleModel(record), childName, live.text);
    const heeded = await heed(record, session, found, [hearing]);
    // The clock ends the call: with a danger, after code's guidance.
    if (!session.ended) await (live.text.session.checkedRoutine ? session.tick() : session.child(hearing.text));
    const ended = await end(record, live.package, session, {}, async () => heeded.change);
    if (!ended) return null;
    const safety = session.session.safety;
    return {
      record: ended, say: [...heeded.guidance, ...fixedClosingWords(live.text.session, [hearing], found)],
      safetyMessage: safety.flagged && safety.severity ? SAFETY_GUIDANCE[safety.severity] : null,
    };
  }

  /** The child's name a saved voice session says (its start's), so a trace stored from it hides that name. */
  const savedName = (text: SavedTextSession): string | null => text.initial?.session.variety.name?.trim() || text.session.variety.name?.trim() || null;

  /** The model, telling `refused` when the ledger refuses one of its requests in the middle of a turn. */
  const watched = (model: MayaModel, refused: (state: Exclude<SpendState, "open">) => void): MayaModel => ({
    ...model,
    // D-341: `onText` goes through, so a voice call's reply can stream (a chat passes none). #1203: so does `onGeneration`.
    async propose(input, signal, onText, onCost, onGeneration) {
      try {
        return await model.propose(input, signal, onText, onCost, onGeneration);
      } catch (e) {
        if (e instanceof SpendRefused) refused(e.state);
        throw e;
      }
    },
  });

  /** Sends the alert of a flagged call's flag when it has not gone (the seam sends each call and level once). */
  async function alert(record: CallRecord) {
    if (record.flag) await seams.alerts.send({ id: record.id, kind: record.kind, parentId: record.parentId, childId: record.childId, flag: record.flag });
  }

  /** A flagged call's alerts for the screen; none when they cannot be read (the call page reads them again). */
  async function alertsOf(record: CallRecord): Promise<AlertState[]> {
    if (!record.flag) return [];
    try {
      return await seams.alerts.list(record.id);
    } catch {
      monitorProduct("maya.recovery_failed", { callId: record.id, step: "safety" });
      return [];
    }
  }

  /** A call's text session. Admin test calls have free talk on (D-197), with the model's review, and the tutor core (D-345); chat has free talk off; family calls get the tutor core behind `tutorFamilies`. A resumed call keeps its flags. */
  function textSession(record: Pick<CallRecord, "id" | "parentId" | "childId"> & { kind: CallKind }, pkg: QuestionPackage, model: MayaModel, childName: string | null, saved?: SavedTextSession, seed?: number, history?: WordingHistory, limitMs?: number, grade?: number, confirmWorkbook?: boolean, onGuidance?: (output: TextOutput) => void, sayHooks?: Pick<TextSessionOptions, "onSayPart" | "onSayCancel" | "onSayEnd" | "onRepairStart" | "modelRepair" | "onPreparation" | "withModelAttempt" | "persist" | "checkedBoardSettled">, spend?: SpendCall, preparing?: Pick<TextSessionOptions, "spend" | "prepareModel" | "prepareHandleId">): TextSession {
    return createTextSession({
      onGuidance, ...sayHooks, ...preparing,
      callId: record.id, channel: record.kind === "chat" ? "chat" : undefined, package: pkg,
      model: { ...model, propose: async (...args) => {
        try { return await model.propose(...args); }
        catch (error) {
          if (!(error instanceof SpendRefused)) monitorProduct("maya.failed", { callId: record.id, kind: record.kind, step: "model" });
          throw error;
        }
      } }, clock: seams.clock, random: seed, history, childName, runner: "text", resume: saved, limitMs, grade, confirmWorkbook,
      // D-345: the tutor core teaches admin test calls, and family calls (desk chat and family voice) only when the
      // MAYA_TUTOR_FAMILIES switch is on. The core still decides per question (isTutorQuestion).
      tutor: seams.tutor !== false && (record.kind === "admin_test" || (seams.tutorFamilies === true && (record.kind === "chat" || record.kind === "family"))),
      checkedExchange: seams.checkedExchange,
      checkedRoutine: seams.checkedRoutine,
      freeTalk: record.kind !== "chat" && record.kind !== "family", reviewer: seams.reviewer?.(model.id, spend ?? spendCall(record)) ?? null,
      mathReviewer: seams.mathReviewer?.(model.id, spend ?? spendCall(record)) ?? null,
    });
  }

  /** The child's wording history before a new call; an empty one when it cannot be read. */
  async function readHistory(childId: string): Promise<WordingHistory> {
    try {
      return await seams.history.read(childId);
    } catch {
      monitorProduct("maya.recovery_failed", { step: "history" });
      return {};
    }
  }

  /** Adds the wordings an ended call said to the child's history. Never throws. */
  async function recordHeard(record: CallRecord, ended: TextSession) {
    const heard = heardWordings(ended.session);
    if (Object.keys(heard).length === 0) return;
    try {
      await seams.history.record(record.childId, heard);
    } catch {
      monitorProduct("maya.recovery_failed", { callId: record.id, step: "history" });
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
          if (appended.ok || appended.error === "key_conflict") {
            // #1144: the related question's own event, after the call question's (it names that event). Its key makes
            // a retry, a duplicate "yes" or a reconnect store one event; a throw retries both appends later.
            const related = transferLearningEvent(ended.session, { parentId: current.parentId, childId: current.childId }, appended.event.id);
            const relatedAppended = related ? await seams.events.append(related) : null;
            if (relatedAppended && !relatedAppended.ok && relatedAppended.error !== "key_conflict") {
              console.error("[maya call] related question event refused", current.id, relatedAppended.error, "reason" in relatedAppended ? relatedAppended.reason : "");
            }
            [eventId, done] = [appended.event.id, true];
          } else {
            // A refused event is refused again on a retry: the call goes on without one.
            console.error("[maya call] learning event refused", current.id, appended.error, "reason" in appended ? appended.reason : "");
            done = true;
          }
        } catch {
          monitorProduct("maya.recovery_failed", { callId: current.id, step: "learning" });
        }
      }
      if (done) {
        const change: CallChange = { learningEventId: eventId, live: null };
        if (!(await store.update(current.id, current.revision, change))) return current;
        current = { ...current, ...change, revision: current.revision + 1 };
      }
    }
    const rebuilt = () => current.kind === "admin_test" && current.model === FAKE_MODEL_ID && current.question.source === "workbook"
      ? seams.rebuild(current.childId, { factsOnly: true, call: spendCall(current) }) : seams.rebuild(current.childId, { call: spendCall(current) });
    if (current.learningEventId && !current.live && !current.profileRebuiltAt && (await rebuilt())) {
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
      } catch {
        monitorProduct("maya.recovery_failed", { callId: r.id, step: "note" });
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
        monitorProduct("maya.recovery_failed", { callId: record.id, step: "note" });
      }
    } catch {
      monitorProduct("maya.recovery_failed", { callId: record.id, step: "note" });
    } finally {
      clearTimeout(timer);
    }
    work.catch(() => {});
    return current;
  }

  /** Stores the outcome of a call that has just ended, then writes its event and rebuilds the profile. Null on a conflict. */
  async function end(record: CallRecord, pkg: QuestionPackage, session: TextSession, how: FinishOptions = {}, extra?: (endedAt: number) => Promise<CallChange>, noEvent = false, capped = false, noNote = false): Promise<CallRecord | null> {
    const trace = await session.finish(how);
    // The cap's close reads as a call that ran out of time, unless safety, content or a solved question comes first.
    const outcome = capped && trace.outcome?.reason === "technical_issue" ? { ...trace.outcome, reason: "time_limit" as const } : trace.outcome;
    const endedAt = trace.endedAt ?? iso(seams.clock());
    const flag = risen(record.flag, flagOf(session, unsafe));
    const change: CallChange = {
      ...(extra ? await extra(Date.parse(endedAt)) : {}),
      ...(flag && { flag }),
      status: "ended",
      // Kept until the learning event is written (afterEnd).
      live: { package: pkg, text: await session.saved(), ...(noEvent ? { cancelled: true as const } : {}) },
      // Kept until the parent's note is written (notes). A call Maya never joined has no learning event, and a voice call
      // she never joined has no note either (#904 review): no talk happened, and the child may have stopped it or the
      // weekly voice time refused it.
      notePending: seams.note && !noNote ? { package: pkg, event: noEvent ? null : learningEvent(session.session, { parentId: record.parentId, childId: record.childId }) } : null,
      trace,
      boardHistory: record.mode === "voice" ? record.boardHistory ?? boardHistoryOf(trace) : boardHistoryOf(trace),
      outcome,
      counts: countsOf(trace),
      startedAt: trace.startedAt,
      endedAt,
    };
    if (!(await store.update(record.id, record.revision, change))) return null;
    monitorCallChange(record, change);
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
    monitorCallChange(record, change);
    const saved = { ...record, ...change, revision: record.revision + 1 };
    await alert(saved);
    return saved;
  }

  /** Checks a new call's family and question, and stores its record with the session not started. */
  async function newCall(input: Parameters<MayaCalls["start"]>[0], mode: CallRecord["mode"]): Promise<{ ok: true; record: CallRecord; session: TextSession; pkg: QuestionPackage } | Extract<CallResult, { ok: false }>> {
    if (input.kind === "chat") {
      if (mode !== "text" || !(await seams.canChat?.(input.parentId, input.childId))) return { ok: false, error: "not_test_family" };
    } else if (input.kind === "family") {
      // A child's own voice call from the family desk: voice only, and only where the server says this child may call.
      if (mode !== "voice" || !(await seams.canCallVoice?.(input.parentId, input.childId))) return { ok: false, error: "not_test_family" };
    } else if (!(await seams.isTestFamily(input.parentId))) return { ok: false, error: "not_test_family" };
    // Every call (chat, voice, admin) teaches from the package Maya makes from the stored one; the stored one is unchanged.
    const check = mayaPackageCheck(teachingPackage(input.package));
    if (!check.ok) return { ok: false, error: "invalid_question" };
    const pkg = check.package;
    if ((input.kind === "chat" || input.kind === "family") && pkg.ref.source !== "workbook") return { ok: false, error: "invalid_question" };
    const id = input.id ?? seams.newId();
    const call: SpendCall = { id, kind: input.kind, parentId: input.parentId, childId: input.childId };
    if (seams.spend) {
      const state = await seams.spend.state(call);
      if (state !== "open") return { ok: false, error: state };
    }
    const model = seams.model(null, call);
    if (!model) return { ok: false, error: "model_unavailable" };
    const session = textSession({ id, kind: input.kind, parentId: input.parentId, childId: input.childId }, pkg, model, input.childName, undefined, seams.seed(), await readHistory(input.childId), input.limitMs, input.grade, input.confirmWorkbook);
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
    output: { say: out?.say ?? [], newBatches: out?.board.length ?? 0, safetyMessage: out?.safetyMessage ?? null, ...(out?.exchangeTurnId ? { exchangeTurnId: out.exchangeTurnId } : {}) },
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

    async openVoice(id, providers, childName) {
      const log = seams.connections;
      if (!log) return { ok: false, error: "unavailable" };
      const found = await store.get(id);
      if (!found) return { ok: false, error: "not_found" };
      if (found.mode !== "voice") return { ok: false, error: "not_voice" };
      if (found.status !== "live" || !found.live) return { ok: false, error: "ended" };
      // Refusals of the call's model requests, counted: a turn that saw the count move while it ran was refused. Per turn,
      // as turns can overlap (a silence check-in and a child turn); one shared flag lost a refusal (latency plan V1).
      let refusals = 0;
      let lastRefusal: Exclude<SpendState, "open"> = "week_used";
      const voiceSpend: SpendCall = { ...spendCall(found), budgetKey: seams.newId() };
      const asked = found.live.text.session.outcome ? idleModel(found) : seams.model(found.model, voiceSpend);
      if (!asked) return { ok: false, error: "model_unavailable" };
      const model = watched(asked, (state) => { refusals++; lastRefusal = state; });
      const restored = structuredClone(found.live.text);
      const checkedRoutine = restored.session.checkedRoutine === true;
      // Savar, 2026-11-12: Maya may say the child's first name on a voice call, as in chat. The session keeps the name
      // its start was given (startVoice, from the server). Every trace this handle stores hides it as {name}: the name
      // the session says, else the one the worker read from the database (`childName`).
      const name = savedName(restored) ?? childName?.trim() ?? null;
      const claim: CallChange = { speechToText: providers.speechToText, voice: providers.voice, live: { ...found.live, text: restored } };
      if (!(await store.update(found.id, found.revision, claim))) return { ok: false, error: "conflict" };
      let record: CallRecord = { ...found, ...claim, revision: found.revision + 1 };
      const pkg = found.live.package;
      // The call's speech-to-text and voice in the spending ledger (D-290).
      const meter: VoiceMeter | null = seams.spend ? seams.spend.voice(voiceSpend) : null;
      const stopMeter = () => meter?.stop() ?? Promise.resolve();
      // The call's model attempts are paid from its budget block (src/lib/maya-spend-block.ts, latency plan V1): the first
      // block is reserved now, in the background; the first turn waits for it only if it has not answered.
      const budget: CallBudget | null = seams.spend ? seams.spend.budget(voiceSpend) : null;
      void budget?.open();
      // One diagnostic id per handle object for this call, shared with the controller's prepareHandleId hook. Log labels only.
      const prepareHandleId = createHandleDiagnosticIds(voiceSpend.budgetKey ?? record.id);
      // C2 speculative requests use this budget through a request-bound model, without a second reservation.
      let hearGuidance: ((turn: VoiceTurn) => void) | null = null;
      let dispatchedGuidance: string | undefined;
      let hearPreparation: ((record: PrepareRecord) => void) | null = null;
      // Every trace turn before this index has been told to the worker in an earlier turn.
      let told = 0;
      /** The worker's ear on the child turn that runs now (VoiceSay). Other inputs give their words with their turn. */
      let listener: VoiceSay | null = null;
      const guidanceNow = (out: TextOutput) => {
        persist(out);
        const from = told;
        told = session.trace().turns.length;
        // Only a worker that lost the call to another stays silent.
        if (!replaced && record.status !== "ended") {
          const turn = voiceTurn(out, from);
          if (hearGuidance && (!checkedRoutine || turn.guidance !== dispatchedGuidance)) {
            dispatchedGuidance = turn.guidance;
            hearGuidance(turn);
          }
        }
      };
      const session = textSession(record, pkg, model, name, restored, undefined, undefined, undefined, undefined, undefined, guidanceNow, {
        onSayPart: (sentence, index) => listener?.part?.(sentence, index),
        onSayCancel: (fromIndex) => listener?.cancel?.(fromIndex),
        onSayEnd: () => listener?.end?.(),
        checkedBoardSettled: () => listener?.checkedBoardSettled?.(),
        // After #1072: the worker's thinking phrase when a repair starts (null: none said).
        onRepairStart: () => listener?.repairing?.() ?? null,
        // A voice call has no time for a second model request: a refused first proposal goes straight to code's line.
        // D-345: a tutor teaching turn still gets its one repair (createTextSession), paid from the same budget block.
        modelRepair: false,
        onPreparation: (record) => hearPreparation?.(record),
        withModelAttempt: (source, run) => withRequestContext({ source, prepareId: null, diagnosticHandleId: null }, run),
      }, voiceSpend, budget ? { spend: budget.seam, prepareHandleId, prepareModel: (handle) => seams.model(record.model, voiceSpend, { prepared: { budget, handle, diagnosticHandleId: prepareHandleId(handle) } }) } : undefined);
      told = session.trace().turns.length;
      const last = restored.turns.at(-1);
      const savedFinal: VoiceTurn | null = restored.session.outcome ? record.live?.pendingVoice ?? {
        say: last?.kind === "maya" && last.stateAfter === "CLOSE" ? [...(last.output?.say ?? [])] : [],
        newBatches: 0, safetyMessage: null, ended: true,
      } : null;
      const severity = restored.session.safety.severity;
      const fixedGuidance = checkedRoutine && severity && restored.session.safety.guided ? SAFETY_GUIDANCE[severity] : null;
      const pendingFinal: VoiceTurn | null = fixedGuidance ? (() => {
        const remaining = (savedFinal?.say ?? []).filter((text) => text !== fixedGuidance);
        const owed = found.live.guidancePlayed !== severity;
        if (!savedFinal && !owed) return null;
        return {
          say: owed ? [fixedGuidance, ...remaining] : remaining, newBatches: 0, ended: !!savedFinal,
          safetyMessage: fixedGuidance, priority: true, ...(owed ? { guidance: fixedGuidance } : {}),
        };
      })() : savedFinal;
      const acknowledged = [...(found.live.acknowledged ?? [])];
      let lost = false;
      let replaced = false;
      let boardAfterLimitUntil: number | null = null;
      let mediaCutAt: number | null = null;
      const stopBudget = () => { session.cancelPending(); return budget?.stop(); };
      const lose = (confirmed = false) => { lost = true; if (confirmed) replaced = true; void stopBudget(); };
      let queue: Promise<void> = Promise.resolve();
      const later = (work: () => Promise<void>) => {
        queue = queue.then(work).catch(() => {
          lose();
          monitorProduct("maya.recovery_failed", { callId: record.id, step: "voice" });
        });
      };
      /**
       * The connected seconds when the call ends: from every stored event of the call (a restarted worker's too). A read
       * that fails throws, which refuses the end: this worker's own events are not all of the call's (after a restart it
       * has none), so the call stays live and the sweep ends it from the stored times later (#586).
       */
      const connected = async (endedAt: number): Promise<CallChange> => {
        const events = await log.read(record.id);
        // The outcome can precede final playout. Count room time through the media close.
        return { connectedSeconds: connectedSeconds(events, mediaCutAt ?? Math.max(endedAt, seams.clock(), ...events.map((e) => e.at))) };
      };
      let acceptedSafetyClose: TextOutput | undefined;
      const persist = (out: TextOutput) => {
        if (checkedRoutine && out.ended && out.safetyMessage) acceptedSafetyClose = out;
        const accepted = checkedRoutine ? session.saved() : null;
        later(async () => {
          if (inactive()) return;
          // A final voice turn remains live until its speech handle completes.
          const pendingVoice: VoiceTurn | undefined = out.ended ? { say: [...out.say], newBatches: 0, safetyMessage: out.safetyMessage, ended: true } : undefined;
          const text = await (accepted ?? session.saved());
          const guidancePlayed = record.live?.guidancePlayed;
          const change: CallChange = { live: { package: pkg, text, ...(pendingVoice ? { pendingVoice } : {}), ...(acknowledged.length ? { acknowledged: [...acknowledged] } : {}), ...(guidancePlayed ? { guidancePlayed } : {}) }, startedAt: text.session.startedAt === null ? null : iso(text.session.startedAt) };
          const saved = await store.update(record.id, record.revision, change) ? { ...record, ...change, revision: record.revision + 1 } : null;
          if (!saved) {
            lose(true);
            console.error("[maya voice] the call changed elsewhere; this worker stops writing", record.id);
            return;
          }
          monitorCallChange(record, change);
          record = saved;
        });
      };
      const none: VoiceTurn = { say: [], newBatches: 0, safetyMessage: null, ended: false };
      const inactive = () => lost || record.status === "ended" || forcedClose || deadlineStarted;
      const admitting = () => mediaCutAt === null && !inactive();
      let forcedClose = false;
      let deadlineStarted = false;
      let deadline: Promise<VoiceTurn | null> | undefined;
      let reportedGuidance: string | undefined;
      const emitFixedGuidance = (guidance: string): boolean => {
        const acknowledged = record.live?.guidancePlayed;
        if (acknowledged && SAFETY_GUIDANCE[acknowledged] === guidance) return true;
        if (!hearGuidance || replaced || record.status !== "live") return false;
        if (dispatchedGuidance !== guidance) {
          if (dispatchedGuidance === SAFETY_GUIDANCE.immediate) return false;
          dispatchedGuidance = guidance;
          hearGuidance({ say: [guidance], newBatches: 0, safetyMessage: guidance, guidance, priority: true, ended: false });
        }
        return true;
      };
      const stageSafety = async (final: TextSession, pendingVoice: VoiceTurn): Promise<CallRecord | null> => {
        const live = record.live!;
        const text = await final.saved();
        const severity = text.session.safety.severity;
        const guidancePlayed = severity && reportedGuidance === SAFETY_GUIDANCE[severity] ? severity : live.guidancePlayed;
        const flag = risen(record.flag, flagOf(final, unsafe));
        const change: CallChange = {
          live: { ...live, text, pendingVoice, ...(guidancePlayed ? { guidancePlayed } : {}) },
          startedAt: final.trace().startedAt, ...(flag ? { flag } : {}),
        };
        if (!(await store.update(record.id, record.revision, change))) return null;
        monitorCallChange(record, change);
        forcedClose = true;
        return { ...record, ...change, revision: record.revision + 1 };
      };
      // Board and playback observations can arrive during a new turn. Persist only the observation on the last
      // durable session, so an in-flight request or an output that has yet to pass its save cannot leak into storage.
      const saveExchangeEvidence = async (observe: (saved: TextSession) => void): Promise<CallChange> => {
        const live = record.live;
        if (!live?.text.session.checkedExchange) return {};
        const saved = textSession(record, pkg, idleModel(record), name, live.text);
        observe(saved);
        return { live: { ...live, text: await saved.saved() } };
      };
      const persistExchangeEvidence = async (observe: (saved: TextSession) => void) => {
        if (inactive()) return;
        const change = await saveExchangeEvidence(observe);
        if (!(await store.update(record.id, record.revision, change))) { lose(true); return; }
        record = { ...record, ...change, revision: record.revision + 1 };
      };
      /** What the worker needs of one output: the trace turns from `before` on give its times and each batch's cue. */
      const voiceTurn = (out: TextOutput, before: number): VoiceTurn => {
        // Preserve the controller turn association. Do not spread batches evenly across an entire reply.
        // Each current board offer follows the last word of its accepted controller turn.
        let word = 0;
        const ends = new Map<string, number>();
        const time = { modelMs: 0, repairMs: 0, reviewMs: 0 };
        const { board, turns } = session.trace();
        for (const t of turns.slice(before)) {
          if (t.kind !== "maya") continue;
          for (const a of t.attempts) {
            if (a.source === "model") time.modelMs += a.ms ?? 0;
            if (a.source === "repair") time.repairMs += a.ms ?? 0;
            time.reviewMs += a.reviewMs ?? 0;
          }
          if (!t.output) continue;
          // The trace hides the name as {name}, one word; the voice says the name, which can be two ("Mary Ann").
          const said = name ? t.output.say.join(" ").replaceAll("{name}", name) : t.output.say.join(" ");
          const start = word;
          word += speechWords(said).length;
          // B2: a batch tied to a sentence is shown when Maya has said that sentence (its last word, or the sentence's end
          // when the voice gives no word times); any other batch at the end of its turn.
          for (const id of t.output.board) {
            const tie = board.find((b) => b.transactionId === id)?.sentence;
            ends.set(id, tie === undefined ? word : start + sentenceCueWord(said, tie));
          }
        }
        const boardCues = out.board.map(batch => ({ batch, word: ends.get(batch.transactionId) ?? speechWords(out.say.join(" ")).length }));
        const state = session.session;
        // The close keeps its priority after it ended the call: a reply that crosses the closing time can end as "solved".
        const closing = state.startedAt !== null && state.now !== null && state.now - state.startedAt >= limitsOf(state).closingAtMs;
        const priority = state.safety.flagged || state.state === "TIME_CLOSE" || state.outcome?.reason === "time_limit" || closing;
        // Round 4: a turn that streamed sentences and then turned into safety holds them and the guidance in one line.
        const guidance = (Object.values(SAFETY_GUIDANCE) as string[]).find((g) => out.say.some((text) => text === g || text.endsWith(` ${g}`)));
        return { say: out.say, newBatches: out.board.length, boardCues, safetyMessage: out.safetyMessage, ended: out.ended !== null, priority, time, ...(out.exchangeTurnId ? { exchangeTurnId: out.exchangeTurnId } : {}), ...(guidance ? { guidance } : {}), ...(out.wait ? { wait: true } : {}) };
      };
      let working = 0;
      /** The turns admitted and not done, each with the child's words it carries (a check-in carries none). */
      const inflight = new Set<{ hearing?: ChildHearing }>();
      /** Child words a refused turn left unread while another turn ran: the turn that closes the call reads them. */
      const owed: ChildHearing[] = [];
      /**
       * The words a closing safety read holds: `own`, the owed words, and the words of every other turn still in flight,
       * whose answers are lost when the call closes under them.
       */
      const unread = (own?: ChildHearing, me?: { hearing?: ChildHearing }): ChildHearing[] =>
        [...(own ? [own] : []), ...owed.splice(0), ...[...inflight].flatMap((t) => t !== me && t.hearing ? [t.hearing] : [])];
      const safetyReads = new Set<{ hearings: readonly ChildHearing[]; found: Promise<SafetyFound | null> }>();
      const startSafetyRead = (hearings: readonly ChildHearing[]) => {
        const read = { hearings, found: safetyRead(record, hearings) };
        safetyReads.add(read);
        return read;
      };
      const safetyDeadline = (): Promise<VoiceTurn | null> => deadline ??= (async () => {
        if (forcedClose && !lost) return record.live?.pendingVoice ?? null;
        if (inactive()) return null;
        deadlineStarted = true;
        const hearings = [...new Set([...unread(), ...[...safetyReads].flatMap((read) => read.hearings)])];
        const observed = session.session.safety.severity;
        void stopBudget();
        const known = knownSafety(hearings);
        let severity: Severity | null = known?.severity === "immediate" || observed === "immediate" ? "immediate" : known?.severity ?? observed;
        let harmful = known?.unsafe === true;
        let sent = severity ? emitFixedGuidance(SAFETY_GUIDANCE[severity]) : false;
        if (severity !== "immediate") await Promise.all([...safetyReads].map(async ({ found: reading }) => {
          const found = await reading;
          if (found?.severity && (!severity || (severity === "concern" && found.severity === "immediate"))) {
            severity = found.severity;
            sent = emitFixedGuidance(SAFETY_GUIDANCE[severity]);
          }
          harmful ||= found?.unsafe === true;
        }));
        if (lost || record.status !== "live" || !record.live) return null;
        const guidance = severity ? SAFETY_GUIDANCE[severity] : null;
        const prior = acceptedSafetyClose ?? record.live.pendingVoice;
        const say = [...new Set([
          ...(prior?.safetyMessage ? prior.say.filter((text) => text !== prior.safetyMessage) : []),
          ...fixedClosingWords(session.session, hearings, severity ? { proposal: null, severity, unsafe: harmful } : known),
        ])];
        const priority: VoiceTurn = {
          say: guidance && !sent ? [guidance, ...say] : say, ended: true, newBatches: 0, priority: true,
          safetyMessage: guidance, ...(guidance && !sent ? { guidance } : {}),
        };
        if (severity || harmful) later(async () => {
          if (lost || record.status !== "live" || !record.live || forcedClose) return;
          const final = textSession(record, pkg, idleModel(record), name, withHelpLedger(record.live.text, session.helpLedger()));
          if (severity && !final.ended) await final.safety(severity);
          if (severity && final.session.safety.guided) {
            const pendingVoice: VoiceTurn = { ...priority, say: [guidance!, ...say], guidance: guidance! };
            const saved = await stageSafety(final, pendingVoice);
            if (!saved) lose(true);
            else record = saved;
          } else if (harmful && unsafe) {
            const flag = risen(record.flag, { level: unsafe, at: iso(seams.clock()) });
            if (!flag) return;
            if (!(await store.update(record.id, record.revision, { flag }))) { lose(true); return; }
            monitorCallChange(record, { flag });
            record = { ...record, flag, revision: record.revision + 1 };
          }
        });
        return guidance || say.length ? priority : null;
      })();
      /** Speech-to-text reserved ahead (its own requests, only when its block is near its end). */
      const sttNow = async (seen?: (read: "none" | "cached" | "network") => void): Promise<SpendState> => {
        if (!meter) { seen?.("none"); return "open"; }
        const current = meter.state();
        if (current !== null) {
          seen?.("cached");
          // Keep valid admitted coverage while renewal runs on the worker's timer or beside this turn.
          if (current === "open") void meter.ensure();
          return current;
        }
        seen?.("network");
        const renewed = await meter.ensure();
        return renewed === "open" ? meter.state() ?? "paused" : renewed;
      };
      /** After a turn: speech-to-text, then the block (in memory unless its allowance is 0; then its refill decides). */
      const capAfterTurn = async (): Promise<SpendState> => {
        const stt = await sttNow();
        return stt !== "open" ? stt : budget ? budget.ensure() : "open";
      };
      /** Ends the call because of the cap after `said` (what this input already says), with code's closing line. */
      const capClose = async (state: Exclude<SpendState, "open">, said: VoiceTurn | null, hearings: readonly ChildHearing[]): Promise<VoiceTurn> => {
        if (!admitting()) return none;
        const alreadyRead = checkedRoutine && !record.live?.text.session.safety.flagged ? startSafetyRead(hearings) : undefined;
        if (checkedRoutine) void stopBudget();
        let closed: Awaited<ReturnType<typeof closeAtCap>> = null;
        let sent: string | undefined;
        if (alreadyRead) {
          const finding = await alreadyRead.found;
          if (inactive()) { safetyReads.delete(alreadyRead); return none; }
          if (finding?.severity && emitFixedGuidance(SAFETY_GUIDANCE[finding.severity])) sent = SAFETY_GUIDANCE[finding.severity];
        }
        later(async () => {
          if (inactive() || !record.live) return;
          // Close admission synchronously. A held settlement cannot delay the forced safety read or guidance.
          void stopBudget();
          closed = await closeAtCap(record, state, name, connected, hearings, session.helpLedger(), checkedRoutine ? stageSafety : undefined, alreadyRead?.found);
          if (!closed) { lose(true); }
          else record = closed.record;
        });
        // Speech-to-text runs until the worker ends the call after the closing line: `end` settles it then.
        await queue;
        if (alreadyRead) safetyReads.delete(alreadyRead);
        const done = closed as Awaited<ReturnType<typeof closeAtCap>>;
        if (!done) return said ?? none;
        const prior = session.session.checkedRoutine && (done.guidance || done.say.includes(SAFETY_PAUSE)) ? null : said;
        return {
          ...(prior ?? none), say: [...(prior?.say ?? []), ...done.say.filter((text) => text !== sent)], ended: true,
          safetyMessage: prior?.safetyMessage ?? done.safetyMessage,
          ...(prior && !done.guidance ? {} : { priority: done.safetyMessage !== null }),
          ...(done.guidance && !sent ? { guidance: done.guidance } : {}),
        };
      };
      /** Whether the input just given to the session asks the model, and whether its reply can stream (streamPlan). */
      const planOf = () => {
        const s = session.session;
        // D-341, round 3: a plain stop is code's goodbye with no model call (the text adapter's pump reads the same).
        const codeStop = s.conversational === true && s.stopRequested && !s.safety.flagged && !!s.turn && clearStop(s.turn.text);
        const codeClose = codeStop || (s.checkedRoutine && s.safety.flagged) || (s.sensitiveHold && s.silence === "close_due");
        const asks = s.outcome === null && nextActs(s).expect === "maya" && !codeClose && !checkedExchangeProposal(s);
        return { model: asks, conversational: model.output === 3, streams: asks && !s.checkedRoutine && !s.checkedExchange && model.output === 3 && streamPlan(s) !== null };
      };
      /**
       * One input. `need`: free model attempts the gate asks for, 2 for a turn with no child words (a check-in), so the
       * last attempt stays for the child.
       */
      const turn = async (run: () => Promise<TextOutput | null>, hearing?: ChildHearing, say?: VoiceSay, need: 1 | 2 = 1): Promise<VoiceTurn> => {
        if (!admitting()) return none;
        // The admission interval, timed at its own awaits (telemetry only; the gate itself is unchanged).
        const gate = say?.admission ? { startedAt: seams.clock(), stt: "none" as "none" | "cached" | "network", sttMs: 0, block: "memory" as "memory" | "awaited", blockMs: 0, done: false } : null;
        const report = (outcome: AdmissionSample["outcome"]) => {
          if (!gate || gate.done) return;
          gate.done = true;
          try { say!.admission!({ startedAt: gate.startedAt, endedAt: seams.clock(), stt: gate.stt, sttMs: gate.sttMs, block: gate.block, blockMs: gate.blockMs, outcome }); } catch { /* the worker's ear never fails the turn */ }
        };
        const sttStart = gate ? seams.clock() : 0;
        const stt = await sttNow(gate ? (read) => { gate.stt = read; } : undefined);
        if (gate) gate.sttMs = seams.clock() - sttStart;
        if (!admitting()) { report("inactive"); return none; }
        if (stt !== "open") { report("cap"); return capClose(stt, null, unread(hearing)); }
        const me = { hearing };
        inflight.add(me);
        let ticket: Handle | null = null;
        try {
          if (budget) {
            // The gate stays before the input, and is in memory and synchronous: no await between it and the session
            // taking the input. Beside the input, a paid request went out at the cap and the safety read lost its
            // guidance (tried 2026-11-13); a hold awaited before the input let overlapping turns lose the guidance
            // (review of 2026-11-13).
            ticket = budget.admit(need);
            if (!ticket) {
              // A check-in never closes the call under another turn, and never takes the child's last attempt.
              if (!hearing && (inflight.size > 1 || budget.attempts() >= 1)) return none;
              // The allowance is 0: the block's refill decides (the call is at the cap, or the ledger cannot answer).
              const ensureStart = gate ? seams.clock() : 0;
              const state = await budget.ensure();
              if (gate) { gate.block = "awaited"; gate.blockMs = seams.clock() - ensureStart; }
              if (!admitting()) { report("inactive"); return none; }
              // The model refill can outlast admitted STT coverage. Hold no model ticket during a new STT wait.
              if (state === "open" && meter && meter.state() !== "open") {
                const coverageStart = gate ? seams.clock() : 0;
                const coverage = await sttNow(gate ? (read) => { if (read === "network") gate.stt = "network"; } : undefined);
                if (gate) gate.sttMs += seams.clock() - coverageStart;
                if (!admitting()) { report("inactive"); return none; }
                const current = meter.state();
                if (coverage !== "open") { report("cap"); return capClose(coverage, null, unread(hearing, me)); }
                if (current !== "open") { report("cap"); return capClose(current ?? "paused", null, unread(hearing, me)); }
              }
              ticket = state === "open" ? budget.admit(need) : null;
              if (!ticket) {
                report("cap");
                if (!hearing && (inflight.size > 1 || budget.attempts() >= 1)) return none;
                return capClose(state === "open" ? "week_used" : state, null, unread(hearing, me));
              }
            }
            budget.newTurn();
          }
          report("admitted");
          return await admitted(me, ticket, run, say);
        } finally {
          // Left without a verdict (an exception before the input): not a refusal, not an admission.
          report("error");
          inflight.delete(me);
          if (ticket) budget?.release(ticket);
        }
      };
      /** An admitted input (`ticket`: its model attempt from the block). */
      const admitted = async (me: { hearing?: ChildHearing }, ticket: Handle | null, run: () => Promise<TextOutput | null>, say?: VoiceSay): Promise<VoiceTurn> => {
        const { hearing } = me;
        let input = run;
        if (hearing && pastClock(session.session) && !session.session.safety.flagged) {
          // Words after the call's clock: read for danger first, as the session would end the call unread.
          const atClose = session.session;
          const read = checkedRoutine ? startSafetyRead([hearing]) : null;
          const found = await (read?.found ?? safetyRead(record, [hearing]));
          if (read) safetyReads.delete(read);
          if (inactive()) return none;
          if (atClose.checkedRoutine && (!found?.known || found.unsafe)) {
            const fixed = fixedClosingWords(atClose, [hearing], found);
            input = async () => {
              const out = await (found?.severity ? session.safety(found.severity) : session.tick());
              return { ...out, say: [...out.say, ...fixed] };
            };
          } else if (!atClose.checkedRoutine && found?.severity) {
            const severity = found.severity;
            input = () => session.safety(severity);
          }
          if (!found?.severity && found?.unsafe && unsafe) {
            // A request for harmful content: the flag is stored and the alert goes now, before the clock ends the call.
            const level = unsafe;
            later(async () => {
              const flag = risen(record.flag, { level, at: iso(seams.clock()) });
              if (lost || record.status === "ended" || !flag) return;
              if (!(await store.update(record.id, record.revision, { flag }))) { lose(true); return; }
              monitorCallChange(record, { flag });
              record = { ...record, flag, revision: record.revision + 1 };
              await alert(record);
            });
            await queue;
            if (inactive()) return none;
          }
        }
        const seen = refusals;
        const before = session.trace().turns.length;
        working++;
        let out: TextOutput | null;
        listener = say ?? null;
        try {
          // The input is in the session once `input` returns its promise, before any model call.
          const running = input();
          if (say?.begun) { try { say.begun(planOf()); } catch { /* the worker's ear never fails the turn */ } }
          out = await running;
        } finally { working--; listener = null; }
        if (!out) return none;
        // The input's model requests are over: an admitted attempt none of them took goes back before the cap's check.
        if (ticket) budget?.release(ticket);
        // Refused in this turn's time (any refusal while it ran counts: the turns share one model).
        const stopped: Exclude<SpendState, "open"> | null = refusals !== seen ? lastRefusal : null;
        persist(out);
        const fixed = checkedRoutine && hearGuidance && out.ended && out.safetyMessage;
        if (fixed && out.say.includes(fixed) && emitFixedGuidance(fixed)) {
          out = { ...out, say: out.say.filter((text) => text !== fixed) };
        }
        // The cap's check after the turn runs beside the save. A request refused in the turn decides without it.
        const capAfter = session.ended || stopped || mediaCutAt !== null ? null : capAfterTurn();
        void capAfter?.catch(() => {});
        await queue;
        if (inactive()) return none;
        const from = Math.max(before, told);
        told = session.trace().turns.length;
        const said = voiceTurn(out, from);
        if (!session.ended && mediaCutAt === null) {
          // The words this input chose are said; then the cap closes the call when it is reached. A request refused in
          // the middle of the turn left the child's words unread, so they get the safety read. While another turn still
          // runs, that turn closes the call after its own words, and reads the words owed.
          const after = stopped ?? await (capAfter ?? capAfterTurn());
          if (mediaCutAt !== null) return said;
          if (after !== "open" || owed.length > 0) {
            if (inflight.size > 1) {
              if (stopped && hearing) owed.push(hearing);
              return said;
            }
            return capClose(after !== "open" ? after : lastRefusal, said, unread(stopped ? hearing : undefined, me));
          }
        }
        return said;
      };
      const call: VoiceCall = {
        id: record.id,
        get session() {
          return forcedClose && record.live ? structuredClone(record.live.text.session) : session.session;
        },
        get ended() {
          return forcedClose || session.ended;
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
        get working() { return working > 0; },
        onGuidance(listener) { hearGuidance = listener; },
        ...(checkedRoutine ? {
          safetyDeadline,
          async guidancePlayback(text: string) {
            if (text === dispatchedGuidance || text === pendingFinal?.guidance) reportedGuidance = text;
            later(async () => {
              const live = record.live;
              const safety = live?.text.session.safety;
              const severity = safety?.severity;
              if (lost || record.status === "ended" || !live || !safety?.guided || !severity || SAFETY_GUIDANCE[severity] !== text || live.guidancePlayed === severity) return;
              const change: CallChange = { live: { ...live, guidancePlayed: severity } };
              if (!(await store.update(record.id, record.revision, change))) { lose(true); return; }
              record = { ...record, ...change, revision: record.revision + 1 };
            });
            await queue;
          },
          async deferGuidance() {
            // #1203: admission closes now; the block rows are written in the background and drained before the
            // process exits (`spendSettled`), so the child's notice never waits for the ledger.
            void stopBudget();
            await queue;
            if (lost || record.status !== "live" || !record.live) return false;
            const { safety } = record.live.text.session;
            if (!safety.guided || !safety.severity || record.live.guidancePlayed === safety.severity) return false;
            const flag = risen(record.flag, { level: safety.severity === "immediate" ? "safety_immediate" : "safety_concern", at: iso(safety.at ?? seams.clock()) });
            if (flag) {
              if (!(await store.update(record.id, record.revision, { flag }))) { lose(true); return false; }
              monitorCallChange(record, { flag });
              record = { ...record, flag, revision: record.revision + 1 };
            }
            await alert(record);
            // #1203: the speech-to-text and voice writes are drained before the process exits (`spendSettled`).
            void stopMeter();
            return true;
          },
        } : {}),
        onPreparation(listener) { hearPreparation = listener; },
        prepare: (input) => !inactive() && !session.ended && !working && !pastClock(session.session) && !!budget && session.prepare(input),
        get pendingFinal() {
          return pendingFinal ? structuredClone(pendingFinal) : null;
        },
        get boardSnapshot() { return structuredClone(record.boardHistory?.delivery ?? { events: [] }); },
        get pendingExchange() {
          const saved = record.live?.text;
          if (inactive() || !saved) return undefined;
          // The child's exchange, then the related question's board (#1144): a saved batch the board never confirmed.
          const turns = saved.session.checkedExchange?.turns ?? [];
          const pending = [turns.find((t) => t.childAction)?.actions[0], turns.flatMap((t) => t.actions).findLast((a) => a.kind === "question")]
            .find((action) => action && action.fate !== "shown" && !record.boardHistory?.delivery?.events.some(e => e.kind === "batch" && e.batchId === action.batchId));
          return pending ? batchesOf(saved.board.filter((b) => b.transactionId === pending.batchId))[0] : undefined;
        },
        get acknowledged() { return [...acknowledged]; },
        async acknowledge(id) {
          if (acknowledged.includes(id)) return !lost;
          acknowledged.push(id);
          let saved = false;
          later(async () => {
            if (lost || record.status !== "live" || !record.live) return;
            const change: CallChange = { live: { ...record.live, acknowledged: [...acknowledged] } };
            if (!(await store.update(record.id, record.revision, change))) { lose(true); return; }
            record = { ...record, ...change, revision: record.revision + 1 };
            saved = true;
          });
          await queue;
          return saved;
        },
        async observeBoard(snapshot) {
          const copy = structuredClone(snapshot);
          const childBatch = session.session.checkedExchange?.turns.find((t) => t.childAction)?.actions[0]?.batchId;
          const fates = snapshotFates(copy).filter((f) => f.fate === "shown" || f.batchId !== childBatch).slice(-32);
          const presented = copy.events.flatMap((e) => e.kind === "presented" ? [e.batchId] : []);
          const observe = (s: TextSession) => { s.boardFates(fates); s.exchangePresented(presented); };
          // B1: the screen's word on each batch reaches the session at once (the next turn's brief reads it).
          if (!inactive() && !session.ended) observe(session);
          later(async () => {
            if (lost) return;
            if (record.status === "ended") {
              const now = seams.clock();
              const prior = record.boardHistory?.delivery;
              if (boardAfterLimitUntil === null || now >= boardAfterLimitUntil || !prior || copy.events.length <= prior.events.length) return;
              try {
                const boardHistory = voiceBoardHistory(copy, record.startedAt === null ? now : Date.parse(record.startedAt), now, record.boardHistory);
                if (await store.update(record.id, record.revision, { boardHistory })) {
                  record = { ...record, boardHistory, revision: record.revision + 1 };
                } else boardAfterLimitUntil = null;
              } catch {
                monitorProduct("maya.recovery_failed", { callId: record.id, step: "voice" });
              }
              return;
            }
            const boardHistory = voiceBoardHistory(copy, record.live?.text.session.startedAt ?? seams.clock(), seams.clock(), record.boardHistory);
            const change: CallChange = { boardHistory, ...await saveExchangeEvidence(observe) };
            if (!(await store.update(record.id, record.revision, change))) { lose(true); return; }
            record = { ...record, ...change, revision: record.revision + 1 };
          });
          await queue;
          if (lost) throw new Error("The observed board could not be saved.");
        },
        boardRefused(batchIds) {
          if (inactive() || session.ended) return;
          const fates = batchIds.slice(-32).map((batchId) => ({ batchId, fate: "skipped" as const }));
          session.boardFates(fates);
          if (session.session.checkedExchange?.turns.some((turn) => turn.actions.some((a) => batchIds.includes(a.batchId)))) {
            later(() => persistExchangeEvidence((s) => s.boardFates(fates)));
          }
        },
        async exchangePlayback(turnId, playback) {
          if (inactive() || !session.exchangePlayback(turnId, playback)) return;
          later(() => persistExchangeEvidence((s) => s.exchangePlayback(turnId, playback)));
          await queue;
        },
        async reconcileExchange(retiredTurns) {
          if (inactive() || !retiredTurns.length) return;
          later(async () => {
            if (inactive()) return;
            const waitingTurns = session.session.checkedExchange?.turns.filter(turn =>
              retiredTurns.includes(turn.id) && (!turn.playback || (!turn.childAction && turn.actions.some(action => !action.fate)))
            );
            if (!waitingTurns?.length) return;
            const reconcile = (text: TextSession) => {
              for (const turn of text.session.checkedExchange?.turns ?? []) {
                if (!waitingTurns.some(waiting => waiting.id === turn.id)) continue;
                if (!turn.childAction) text.boardFates(turn.actions.filter(a => !a.fate).map(a => ({ batchId: a.batchId, fate: "cancelled" })));
                text.exchangePlayback(turn.id, "interrupted");
              }
            };
            reconcile(session);
            await persistExchangeEvidence(reconcile);
          });
          await queue;
        },
        start: (options) => turn(() => session.start(options)),
        child: (text, options, say) => {
          const hearing = { text: text.trim().slice(0, MAX_CHILD_TEXT), uncertain: options?.uncertain, alternatives: options?.alternatives?.slice() };
          return turn(() => session.child(hearing.text, hearing), hearing.text ? hearing : undefined, say);
        },
        async exchange(raw, onAccepted) {
          const target = readExchangeTarget(raw);
          if (inactive() || !target || !childExchangeProposal(session.session, target, seams.clock())) return null;
          const out = await turn(async () => {
            const accepted = session.exchange(target);
            if (accepted) onAccepted?.();
            return accepted;
          });
          return out.exchangeTurnId || out.ended ? out : null;
        },
        async select(raw, onAccepted) {
          const target = readSelectionTarget(raw);
          if (inactive() || !target || selectionSeen(session.session, target.selectionId)) return null;
          let silent = false;
          const out = await turn(async () => {
            const accepted = session.select(target);
            if (accepted) {
              silent = !accepted.say.length && !accepted.ended;
              if (!silent) onAccepted?.(accepted.cancelled === true);
            }
            return accepted;
          });
          return out.say.length || out.ended || (silent && !inactive()) ? out : null;
        },
        tick: () => turn(() => session.tick(), undefined, undefined, 2),
        writing: (status) => turn(() => session.writing(status), undefined, undefined, 2),
        async limit() {
          if (checkedRoutine) {
            const fixed = await safetyDeadline();
            if (fixed?.safetyMessage && await call.deferGuidance!()) return;
          }
          const settleUntil = seams.clock() + BOARD_CLOSE_SETTLE_MS;
          // #1203: the meter's and the budget's writes are drained before the process exits (`spendSettled`).
          void stopMeter();
          void stopBudget();
          later(async () => {
            if (lost || record.status === "ended" || !record.live) return;
            // Restore only accepted, saved work. An outstanding model answer cannot delay the deadline.
            // Final check 12: the help ledger of the live session, also for a turn whose model answer never came.
            const final = textSession(record, pkg, idleModel(record), name, withHelpLedger(record.live.text, session.helpLedger()));
            await final.tick();
            const ended = await end(record, pkg, final, {}, connected, record.startedAt === null);
            if (!ended) { lose(true); }
            else {
              record = ended;
              boardAfterLimitUntil = settleUntil;
            }
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
              if (at === null) { lose(true); return; }
              record = { ...record, revision: record.revision + 1 };
            } catch (e) {
              lose();
              console.error("[maya voice] connection event not stored", record.id, kind, e instanceof Error ? e.message : String(e));
            }
          });
          await queue;
        },
        async meter() {
          if (mediaCutAt !== null) return null;
          // The worker's 10-second tick also renews and retires the budget block by age (in the background).
          budget?.tick();
          if (!meter || inactive() || session.ended) return null;
          const state = await meter.ensure();
          if (state === "open" || !admitting() || session.ended) return null;
          // Speech-to-text cannot be renewed: the call closes now, also during a model request (its answer is not said,
          // and the child's words it was reading get the safety read). Waiting for it would keep the room listening.
          return capClose(state, null, unread());
        },
        stopMeter() {
          mediaCutAt ??= seams.clock();
          return stopMeter();
        },
        spoken: (text) => meter?.spoken(text) ?? Promise.resolve(),
        async end(how) {
          // Stop admissions before waiting for a save or the STT meter. #1203: the block rows are written in the
          // background and drained before the process exits (`spendSettled`), so the child's notice never waits for them.
          void stopBudget();
          void stopMeter();
          await queue;
          if (lost) return;
          if (record.status === "live") {
            later(async () => {
              // A fatal close or hang-up must not wait for an unfinished model turn.
              // Final check 12: the help ledger of the live session, also for a turn whose model answer never came.
              const final = textSession(record, pkg, idleModel(record), name, withHelpLedger(record.live!.text, session.helpLedger()));
              const ended = await end(record, pkg, final, how, connected, record.startedAt === null);
              if (!ended) { lose(true); }
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
        // #1203: one deadline over the model budget's drain and the speech-to-text and voice writes.
        spendSettled: () => new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, BLOCK_DRAIN_MS);
          void Promise.all([budget?.drained(), stopMeter()]).catch(() => {}).then(() => { clearTimeout(timer); resolve(); });
        }),
      };
      return { ok: true, call };
    },

    async input(id, revision, input, childName, say) {
      if (!checkInput(input)) return { ok: false, error: "invalid_input" };
      const record = await store.get(id);
      if (!record) return { ok: false, error: "not_found" };
      if (input.type === "exchange" && record.mode === "text" && record.kind === "chat" &&
        (record.live?.text.session.checkedExchange ?? record.trace?.checkedExchange)?.turns.some((t) => sameExchangeTarget(t.childAction, input.target))) {
        const view = recordView(record);
        if (view) return { ok: true, view, output: { say: [], newBatches: 0, safetyMessage: null } };
      }
      // #1152: a retried tap is answered once.
      if (input.type === "select" && record.mode === "text" && record.kind === "chat" && record.live &&
        selectionSeen(record.live.text.session, input.target.selectionId)) {
        const view = recordView(record);
        if (view) return { ok: true, view, output: { say: [], newBatches: 0, safetyMessage: null } };
      }
      // #1152: a tap read from an older view is not applied. The screen tells the child the board changed.
      if (record.revision !== revision) return { ok: false, error: input.type === "select" ? "board_changed" : "conflict" };
      if (record.status === "ended") {
        if (input.type !== "end" || !record.trace) return { ok: false, error: "conflict" };
        // An ended call: send the alert, write the event and rebuild the profile when an earlier try did not.
        await alert(record);
        const final = record.live ? textSession(record, record.live.package, idleModel(record), savedName(record.live.text) ?? childName, record.live.text) : null;
        const done = await afterEnd(record, final);
        return result(done, done.trace!, null);
      }
      if (!record.live) return { ok: false, error: "conflict" };
      if (record.mode === "voice") {
        // The worker holds a live voice call. The admin may only end one that never started, or one that cannot still
        // be running (the worker stopped without ending it).
        const started = record.startedAt === null ? null : Date.parse(record.startedAt);
        if (input.type !== "end" || (started !== null && seams.clock() - started < VOICE_CALL_STALE_MS)) return { ok: false, error: "voice_call" };
        const session = textSession(record, record.live.package, idleModel(record), savedName(record.live.text) ?? childName, record.live.text);
        const detail = started === null ? "Maya did not join the voice call" : "the voice call stopped without an end";
        // Connection times that cannot be read refuse the end (the read throws), so a later end stores the connected
        // seconds from them rather than 0 seconds (#528 review). As in the worker's own end, the room time counts through the last
        // stored event: the final speech after the outcome (a "solved" close, say) is connected time too (#586 review).
        const stored = async (endedAt: number): Promise<CallChange> => {
          const events = seams.connections ? await seams.connections.read(record.id) : [];
          return { connectedSeconds: connectedSeconds(events, Math.max(endedAt, ...events.map((e) => e.at))) };
        };
        const ended = await end(record, record.live.package, session, { detail }, stored, started === null, false, started === null);
        return ended ? result(ended, ended.trace!, null) : { ok: false, error: "conflict" };
      }
      const { package: pkg, text: saved } = record.live;
      // The name the saved session holds hides itself in the stored trace when the caller gives none: the sweep and an
      // admin end pass no name, and the trace hid only the name it was given (a chat's trace kept the real name, 2026-11-13).
      const name = savedName(saved) ?? childName;
      if (input.type === "exchange" && (record.kind !== "chat" || !sameExchangeTarget(childExchangeTarget(saved.session), input.target))) {
        return { ok: false, error: "conflict" };
      }
      if (input.type === "select" && record.kind !== "chat") return { ok: false, error: "conflict" };
      if (input.type === "child" && record.kind === "chat") {
        // #1107: a chat turn whose request stopped after saved parts (its process went away): the recovered request for
        // the same message ends it from the saved parts, with code's line and no model call, before any spend or clock
        // path asks one. The child's words are not taken again. Other words while it waits are a conflict.
        const stopped = textSession(record, pkg, idleModel(record), name, saved);
        const was = stopped.interrupted;
        if (was) {
          if (was.text !== input.text.trim()) return { ok: false, error: "conflict" };
          const out = await stopped.settleInterrupted();
          const settled = await save(record, pkg, stopped);
          return settled ? result(settled, settled.trace ?? stopped.trace(), out) : { ok: false, error: "conflict" };
        }
      }
      if (input.type !== "end") {
        // At the cap Maya teaches no more, and only the child's own words are read, for safety.
        const state = await spendState(record);
        if (state !== "open") {
          const closed = await closeAtCap(record, state, name, undefined, input.type === "child" ? [{ text: input.text.trim() }] : []);
          if (!closed) return { ok: false, error: "conflict" };
          return { ok: true, view: callView(closed.record, closed.record.trace!, await alertsOf(closed.record)), output: { say: closed.say, newBatches: 0, safetyMessage: closed.safetyMessage } };
        }
      }
      if (input.type === "child") {
        // Words that come after the call's clock get their safety read before the clock ends the call.
        const late = await closeAtClock(record, name, { text: input.text.trim() });
        if (late) return { ok: true, view: callView(late.record, late.record.trace!, await alertsOf(late.record)), output: { say: late.say, newBatches: 0, safetyMessage: late.safetyMessage } };
      }
      let refusal: Exclude<SpendState, "open"> | null = null;
      const asked = seams.model(record.model, spendCall(record));
      const model = asked && watched(asked, (state) => { refusal = state; });
      if (!model) {
        // The model this call started with is gone (the key was removed): the call ends, recorded with its own model.
        const session = textSession(record, pkg, idleModel(record), name, saved);
        const ended = await end(record, pkg, session, { detail: "the model this call started with is no longer available" });
        return ended ? result(ended, ended.trace!, null) : { ok: false, error: "conflict" };
      }
      // #1107: a chat child turn streams its checked sentences to the desk through the voice path's hooks. Each one, with
      // the drawing fixed for it, is saved in the call (at the claim's revision, which stays) before the desk gets it.
      const checkpoint = store.checkpoint?.bind(store);
      const hear = seams.streamChat === true && say && checkpoint && record.kind === "chat" && input.type === "child" ? {
        onSayPart: (sentence: string, index: number, board: Batch[]) => say.part(sentence, index, board.length ? board : undefined),
        persist: async () => {
          if (!await checkpoint(record.id, record.revision, { package: pkg, text: await session.saved() })) return false;
          // A checkpoint acknowledgement can arrive after a replacement claim. Recheck before dispatch/successors.
          const owner = await store.get(record.id);
          return owner?.revision === record.revision && owner.status === "live";
        },
      } : undefined;
      const session = textSession(record, pkg, model, name, saved, undefined, undefined, undefined, undefined, undefined, undefined, hear);
      let out: TextOutput | null = null;
      let saved2: CallRecord | null = null;
      if (input.type === "end") {
        saved2 = await end(record, pkg, session, { reason: "child_stopped" });
      } else {
        try {
          // B1: the screen's word on Maya's batches first, so this turn's brief counts only what the child saw.
          if ((input.type === "child" || input.type === "exchange" || input.type === "select") && input.fates?.length) session.boardFates(input.fates);
          if (input.type === "exchange") out = session.exchange(readExchangeTarget(input.target)!);
          else if (input.type === "select") out = session.select(readSelectionTarget(input.target)!);
          else out = input.type === "child" ? await session.child(input.text.trim()) : input.type === "tick" ? await session.tick() : await session.writing(input.status);
        } finally {
          if ((input.type !== "exchange" && input.type !== "select") || out) saved2 = await save(record, pkg, session);
        }
      }
      if (!saved2) return { ok: false, error: "conflict" };
      if (saved2.status === "live" && input.type !== "end") {
        // The turn that reached the cap is said in full; then code's closing line ends the call. A request refused in the
        // middle of the turn left the child's words unread, so they get the safety read.
        const stopped: Exclude<SpendState, "open"> | null = refusal;
        const state = stopped ?? await spendState(saved2);
        if (state !== "open") {
          const closed = await closeAtCap(saved2, state, name, undefined, stopped && input.type === "child" ? [{ text: input.text.trim() }] : []);
          if (!closed) return { ok: false, error: "conflict" };
          const prior = session.session.checkedRoutine && (closed.guidance || closed.say.includes(SAFETY_PAUSE)) ? null : out;
          return {
            ok: true, view: callView(closed.record, closed.record.trace!, await alertsOf(closed.record)),
            output: { say: [...(prior?.say ?? []), ...closed.say], newBatches: prior?.board.length ?? 0, safetyMessage: prior?.safetyMessage ?? closed.safetyMessage },
          };
        }
      }
      return result(saved2, saved2.trace ?? session.trace(), out);
    },

    async appendInk(id, owner, from, events) {
      const read = Array.isArray(events) && events.length >= 1 && events.length <= MAX_INK_EVENTS ? events.map(readInkEvent) : null;
      const first = typeof from === "number" && Number.isInteger(from) ? from : 0;
      if (!read || read.some((e) => e === null) || first < 1 || first + read.length - 1 > MAX_INK_SEQ) return { ok: false, error: "invalid_input", held: 0 };
      const appended = await store.appendInk(id, owner, first, read as InkEvent[]);
      if (appended.status === "saved") return { ok: true, held: appended.held };
      // The store answers not_found for a sibling's chat too: tell that one apart (#652).
      if (appended.status === "not_found" && siblingChat(await store.get(id), owner)) return { ok: false, error: "not_this_desk", held: 0 };
      return { ok: false, error: appended.status, held: appended.held };
    },

    async readInk(id, owner) {
      const record = await store.get(id);
      if (siblingChat(record, owner)) return { ok: false, error: "not_this_desk" };
      if (!record || record.kind !== "chat" || record.mode !== "text" || record.parentId !== owner.parentId || record.childId !== owner.childId) return { ok: false, error: "not_found" };
      const log = await store.readInk(id);
      return { ok: true, events: log.length > 0 ? log : inkLog(record.childInk ?? createHistory()) };
    },

    async view(id) {
      const record = await store.get(id);
      return record && recordView(record, [], record.mode === "text" ? await store.readInk(id) : []);
    },
  };
}
