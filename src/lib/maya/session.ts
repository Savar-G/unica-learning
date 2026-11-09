// Maya's teaching controller (#321, spec #297): the state machine of one call about one checked question. The model
// proposes Maya's next act and picks her words; this module decides whether that act is allowed now and refuses it
// with a reason when it is not. Code, not the model, owns the math check of every child answer, every sentence of math
// Maya says or writes (#372, D-195: code-written lines filled from the checked worked step; the model picks a line and
// may add warm talk with no math in it), the call clock, the hint ladder, the safety flag, the safety guidance and the
// outcome. Child speech and workbook text are data: nothing a child says changes the answer key, the states or the
// safety rules.
//
// One call: READY -> OPEN -> ASSESS -> (MODEL_EXAMPLE -> TRY_TARGET | TRY_TARGET | GUIDE_TARGET) -> CHECK ->
// WRITE_CLOSE -> CLOSE, or CONTENT_HOLD when the question package does not check or is a kind Maya cannot teach yet.
// A question held from the start ends at once in code's words (#605: hello, that Maya is an AI, and an invitation to
// pick another question on the page), with no model call; a hold during the
// call closes with the held lines only. A held call writes no learning event.
// The interrupts take over in this priority: SAFETY first, then a stop and the deadline (TIME_CLOSE), then a repair
// Maya owes (REPAIR_MAYA), then confirmation of what was heard (CONFIRM_HEARD), then teaching with WAIT_WRITE and
// REDIRECT. Every event is taken in that order: a safety signal, a stop request, an unclear number and the clock are
// kept even when the model's proposal for that turn is refused, and no answer is scored before them. Teaching research:
// `.design/research/ta-pedagogy-2026-10/maya-teaching.md`, section 5.
//
// Everything in and out is plain serializable data (the text adapter #322 and the board protocol #328 drive it): a
// Session value, events with the time they happened (the clock is passed in), effects to carry out, and a refusal.
// Pure TypeScript: no React, DOM, network, clock or randomness.
import { MAX_COMMANDS, PLACE_NAMES, type Batch, type Command, type Place, type Target } from "@/lib/board";
import { FRACTION_STRIP_LIMITS } from "@/lib/board/model-fraction-strip";
import { MAX_HINTS, MAX_TIME_MS, type NewLearningEvent } from "@/lib/learning-events";
import {
  checkQuestionPackage,
  equivalent,
  hasOperation,
  isRightAnswer,
  operationText,
  sameValue,
  stepText,
  valueText,
  type AnswerValue,
  type Operation,
  type OperationKind,
  type OperationPackage,
  type WorkedStep,
} from "@/lib/question-package";
import { talkMath } from "./claims";
import { closeExpressionContainsAnswer } from "./backup-close";
import { mathClaimIn, outsideConfirmation, scopeReason, scopeValue, type ScopeReading, type ScopeReason, type ScopeRefusal } from "./scope";
import { speechWords, saidAsApproved } from "./speech";
import { compensations, findOffer, normalSlots, packageLines, workbookOpening, WORKBOOK_OPENING, fixedOffers, areaOffers, spokenOffer, heldOffers, heldSentences, LINE_IDS, type LineOffer } from "./lines";
import { freeTalkProblem, hardFeeling, replyFor, workProblem, FALLBACK_GROUP, FEELING_SMALLTALK, NEUTRAL_SMALLTALK, PHRASE_ACTS, PHRASE_GROUPS, PHRASES, type PhraseGroup } from "./phrases";
import { chooseWording, heardInCall, nameNow, newVariety, withName, type Variety, type WordingHistory } from "./variety";
import { kindOf, writtenFractions, claimWordsOnly, committedText, confirmWordsOnly, echoedClaim, echoesShown, falseEquationResults, numberSentences, onlyNextStepQuestions, plainNumber, stepTurnBody, withoutNextStepQuestions, wholeSum, wholeTurn, wholeValue, wholeYes, retainedText, readAnswer, showsDoubt, readNumbers, additionSetup, saysDone, saysGuess, saysStuck, saysYes, saysWritten, takenBack, unreadableAnswer, valuesIn, type AnswerRead, type ReadOptions } from "./numbers";
import { isEqualForm, readOptionsFor, rightForQuestion, simplestWords, teachSteps, untaughtSteps } from "./fractions";
import { ACTS, PART_LIMITS, PROPOSAL_VERSION, withoutNulls, type Act, type ChildAnswer, type HintLevel, type Proposal, type Reading, type Severity } from "./proposal";
import type { TalkReviewResult } from "./talk-review";

/** Closing starts 9 minutes into the call; the call ends at 10 minutes. */
export const TIME_LIMITS = { closingAtMs: 9 * 60_000, endAtMs: 10 * 60_000 } as const;
/** How long before a shorter call's end its closing starts (#330): the same last minute as a full call. */
export const CLOSING_LEAD_MS = TIME_LIMITS.endAtMs - TIME_LIMITS.closingAtMs;

/**
 * A call's time limits: TIME_LIMITS, or a shorter end when the child's minutes left this week are fewer than 10 (#330,
 * src/lib/maya-minutes.ts). Closing starts CLOSING_LEAD_MS before the end, or at the start of a call under a minute.
 */
export function limitsOf(s: Pick<Session, "limits">): { closingAtMs: number; endAtMs: number } {
  return s.limits ?? TIME_LIMITS;
}

/**
 * The pause policy (proposals in the research, to test with children): a gentle check after this much silence while
 * the child thinks or writes, then a close for no response after the same wait again. Silence never raises the hint.
 */
export const PAUSES = { thinkCheckMs: 15_000, writeCheckMs: 30_000, noResponseMs: 30_000 } as const;

/**
 * The safety guidance (the research's proposed scripts, section 4). Code speaks it for every safety act, so guidance is
 * given only in these words, and keeps it on screen after the call.
 */
export const SAFETY_GUIDANCE = {
  concern: "Thank you for telling me. You do not have to explain more. Please tell a grown-up you trust who can help keep you safe.",
  immediate: "Your safety comes first. Go to a safe grown-up now. If you are in danger, call 911.",
} as const;

/**
 * The operation kinds Maya teaches: whole numbers and decimals, and adding and subtracting fractions (#407), whose steps
 * and answers code checks and whose spoken forms code reads. A question with a worked step Maya has no lines for is held
 * too (fractions.ts: a mixed or whole operand). Multiplying, dividing, simplifying and equivalent fractions are held.
 */
export const TEACHABLE_KINDS: readonly OperationKind[] = [
  "add", "subtract", "multiply", "divide", "decimal-add", "decimal-subtract", "decimal-multiply", "fraction-add", "fraction-subtract",
];

export const MAIN_STATES = ["READY", "OPEN", "ASSESS", "MODEL_EXAMPLE", "TRY_TARGET", "GUIDE_TARGET", "CHECK", "WRITE_CLOSE", "CLOSE", "CONTENT_HOLD"] as const;
export const INTERRUPTS = ["SAFETY", "CONFIRM_HEARD", "WAIT_WRITE", "REDIRECT", "REPAIR_MAYA", "TIME_CLOSE"] as const;
export type MainState = (typeof MAIN_STATES)[number];
export type Interrupt = (typeof INTERRUPTS)[number];
export type SessionState = MainState | Interrupt;
/** The teaching states an interrupt returns to. */
const TEACHING = ["OPEN", "ASSESS", "MODEL_EXAMPLE", "TRY_TARGET", "GUIDE_TARGET", "CHECK", "WRITE_CLOSE"] as const;
type Teaching = (typeof TEACHING)[number];
const isTeaching = (s: SessionState): s is Teaching => (TEACHING as readonly SessionState[]).includes(s);

/** Acts that may carry board commands. */
const BOARD_ACTS: readonly Act[] = ["clarify", "example_step", "try_target", "guide", "accept_answer", "ask_write", "repair"];
/** Acts whose proposal may score the child's answers. Safety, a stop, a confirmation or a wait never scores one. */
const SCORING_ACTS: readonly Act[] = ["clarify", "example_step", "try_target", "guide", "accept_answer", "ask_write", "close"];

export type Reason = "solved" | "child_stopped" | "time_limit" | "no_response" | "technical_issue" | "content_issue" | "safety";
/** Least help first: the outcome keeps the most help used, never less. */
export const ASSISTANCE = ["independent", "hint", "worked_example", "guided", "answer_given"] as const;
export type Assistance = (typeof ASSISTANCE)[number];
export type PaperStatus = "child_confirmed" | "declined" | "unknown";
export type Understanding = "evidence_observed" | "uncertain";
/** The child's question, or the easier example Maya works first. */
export type Problem = "target" | "example";

export type SessionEvent =
  | { type: "start"; at: number }
  /** A child turn as text. `final: false` is a partial transcript: Maya stops talking and nothing is judged. */
  | { type: "child_turn"; at: number; text: string; final?: boolean; uncertain?: boolean; alternatives?: string[] }
  /**
   * A model proposal. `talkReviews` (D-197): the review of each free-talk line the adapter had reviewed, by its text. A
   * free-talk line is said only when it passes the code guards and its review here passes; without a review it is
   * replaced by a bank phrase. `fallback`: code's own proposal after the model's were refused (`fallbacks`). The adapter
   * sets it, never the model. A fallback may raise help one level on a step the child is still stuck on (#605).
   */
  | { type: "proposal"; at: number; proposal: unknown; talkReviews?: TalkReview[]; fallback?: boolean }
  | { type: "tick"; at: number }
  /** The child starts or stops writing on the board. */
  | { type: "writing"; at: number; status: "started" | "done" }
  /** A safety signal from outside the model (a classifier or a person). */
  | { type: "safety"; at: number; severity: Severity }
  /**
   * What Maya actually said (the speech transcript): a sentence with math in it that is not a line code gave her
   * starts REPAIR_MAYA.
   */
  | { type: "maya_said"; at: number; text: string; approvedTurn?: number }
  /** The question's math turned out not to be trustworthy during the call. */
  | { type: "content_problem"; at: number; detail: string }
  /** The connection or a service failed: the call ends. */
  | { type: "technical"; at: number; detail: string }
  /**
   * The child hung up on purpose (#323; in the admin demo, the team member playing the child): the call ends now as
   * child_stopped, after the outcome's priority (safety, content, solved). Only a failure is a technical issue.
   */
  | { type: "hang_up"; at: number };

export interface Outcome {
  /**
   * Why the call ended. "solved": the question reached its checked answer, from the child or given by Maya (then
   * assistance is answer_given, and the learning event says whether the child said it). A safety flag or a content
   * issue comes before solved.
   */
  reason: Reason;
  assistance: Assistance;
  paperStatus: PaperStatus;
  understanding: Understanding;
  /** The highest hint level Maya gave on the target, or null. */
  highestHint: HintLevel | null;
  safetyFlag: boolean;
  safetySeverity: Severity | null;
  mishearing: { confirmations: number; corrections: number };
  /** Seconds from the start to the end, at most the 10-minute limit. */
  seconds: number;
}

/** The review of one free-talk line (D-197): the text as the model wrote it (trimmed), and the review's answer. */
export interface TalkReview {
  text: string;
  result: TalkReviewResult;
}

/** What happened to one piece of the model's own words (D-196 rule B, D-197), in order. Kept in the trace. */
export interface TalkCheck {
  /** The model's words, trimmed. */
  proposed: string;
  /** The code guards: null when they passed, else why not ("free talk is off" with the flag off). */
  code: string | null;
  /** The review: "not_run" when the code guards failed or no review was given for the text. */
  review: TalkReviewResult["verdict"] | "not_run";
  /** For a failed review: the rules it named (talk-review.ts, NEVER_SAY). */
  rules?: string[];
  /** For a failed or broken review: why. */
  reason?: string;
  /** What Maya said for it: the model's words when both checks passed, else the bank phrase. */
  shown: string;
}

export type Effect =
  /**
   * `talkReplaced`: how many pieces of the model's own warm words failed a check and were replaced (D-196 rule B).
   * `talk`: each piece, with both checks and what was said (D-197).
   */
  | { kind: "say"; act: Act; text: string; talkReplaced?: number; talk?: TalkCheck[] }
  | { kind: "board"; batch: Batch }
  /** Stop speaking and drop board batches not yet shown. */
  | { kind: "cancel_output" }
  /** Create the durable safety flag and alert (once per call, and again when the severity rises). */
  | { kind: "safety_flag"; severity: Severity; at: number }
  /** The call ends: audio stops. `safetyMessage`: the safety guidance to keep on screen after the call, or null. */
  | { kind: "end"; at: number; outcome: Outcome; safetyMessage: string | null };

export type RefusalCode =
  | "scope_first"
  | "turn_too_long"
  | "fixed_reply_first"
  | "invalid_event"
  | "invalid_proposal"
  | "ended"
  | "not_mayas_turn"
  | "act_not_allowed"
  | "safety_first"
  | "stop_first"
  | "confirm_first"
  | "repair_first"
  | "content_hold"
  | "accepts_wrong_answer"
  | "rejects_right_answer"
  | "answer_not_heard"
  | "answer_not_committed"
  | "wrong_step"
  | "hint_too_high"
  | "same_hint_again"
  | "wrong_math"
  | "math_in_talk"
  | "line_not_offered"
  | "free_talk_in_math_turn"
  | "math_line_not_last"
  | "board_not_code"
  | "decline_first"
  | "reveals_answer"
  | "missing_disclosure"
  | "board_not_allowed"
  | "board_wrong_problem";

export interface Refusal {
  code: RefusalCode;
  reason: string;
  /** The acts allowed now. */
  allowed: Act[];
}

export interface StepResult {
  session: Session;
  effects: Effect[];
  refusal: Refusal | null;
}

/** Whose turn it is: Maya's (call the model), the child's (listen), or no one's (not started, or ended). */
export type Expect = "maya" | "child" | "nothing";

export interface TranscriptTurn {
  at: number;
  speaker: "child" | "maya";
  text: string;
  /** The state after the turn. */
  state: SessionState;
  act?: Act;
  /** Other transcripts speech-to-text offered for a child turn, kept for review. */
  alternatives?: string[];
}

/** The child's words Maya has not answered yet, with what code already knows about them. */
interface ChildTurn {
  at: number;
  text: string;
  /** Needs confirming before any answer in it is judged. */
  uncertain: boolean;
}

/** The hint ladder of the current target step. `hint` is the highest level used, or -1 before any hint. */
interface Ladder {
  step: string;
  hint: number;
  unlocked: number;
  /** Unsuccessful child responses since the hint last went up. */
  failures: number;
}

/** One call. Plain data: store it, send it, compare it. Read it through this module. */
export interface Session {
  /** Admin workbook sessions confirm the printed reference in their code-owned opening. */
  confirmWorkbook?: boolean;
  version: 4;
  callId: string;
  /** A desk chat uses the workbook decline for an off-topic reading. */
  channel?: "chat";
  /** Which wording of each line and phrase to say: the call's random seed, what was heard, the child's name (variety.ts). */
  variety: Variety;
  /** D-196, D-197: whether the model's own warm words may be said, after the code guards and the review. */
  freeTalk: boolean;
  grade?: number;
  noBoard?: boolean;
  shorter?: boolean;
  /** Code replies still due, then the question. Survives refused proposals. */
  replies?: ("about.ai" | "about.no_secret" | "question.problem" | "shorter.prompt")[];
  /**
   * Whether the model's own board commands are read (R374-6-1). Only the board core's tests set it: Maya draws through
   * code's board offers (`draw`), with free talk on or off (D-197). A saved session from before has no field (off).
   */
  modelBoard?: boolean;
  state: SessionState;
  /** The teaching state an interrupt returns to. */
  resume: Teaching | null;
  package: OperationPackage | null;
  contentProblem: string | null;
  startedAt: number | null;
  now: number | null;
  expect: Expect;
  /** When Maya started waiting for the child, for the pause policy. */
  waitingSince: number | null;
  silence: "none" | "check_due" | "checked" | "close_due";
  /** The child's turns Maya has not answered yet, joined with a new line between turns. */
  turn: ChildTurn | null;
  /** The child asked to stop: only a close is allowed until the call ends. Nothing clears it. */
  stopRequested: boolean;
  opened: boolean;
  clarified: boolean;
  /** The child said they could not start: the easier example, then a fresh try, come before guided target work. */
  noStart: boolean;
  /** Easier-example steps shown, in order. */
  exampleShown: number;
  /** The easier example was named in a prior turn, before its first worked step. */
  exampleIntroduced?: boolean;
  /** Maya handed the question back after the whole easier example. */
  retried: boolean;
  /** Target steps the child has done. */
  done: string[];
  /** Maya named the child's own method back (namedMethod, C09): once per call. A saved session from before has no field. */
  methodNamed?: boolean;
  /**
   * Target steps Maya showed at H3 that the child then only copied or acknowledged (copiedStep; PR #698, C04): the ladder
   * goes past them, but they are not done, so no line calls them right and the learning event keeps the stuck step. A
   * saved session from before has no field (none).
   */
  passed?: string[];
  ladder: Ladder;
  highestHint: HintLevel | null;
  /** Hints given: guide turns from H1, and a given answer. */
  hints: number;
  /** Every kind of help given, in order. Nothing removes an entry. */
  assistance: Assistance[];
  /**
   * Who gave the checked final answer that stands now; the question is solved either way. A later checked wrong final
   * answer from the child clears it, and so does a take-back of the child's own checked answer (the assistance history
   * keeps answer_given).
   */
  solved: "child" | "maya" | null;
  /** The child's latest final answer, as code judged it; null again after the child takes back a right one. */
  lastResult: "right" | "wrong" | null;
  /** The answer was given by Maya before the child said it: understanding is never evidence then. */
  answerGivenFirst: boolean;
  understanding: Understanding;
  paper: PaperStatus;
  /**
   * The child wrote on paper (a writing event ended) after the answer was solved (#389): Maya does not ask them to
   * write it again. A saved session from before has no field (not written).
   */
  wrote?: boolean;
  /** Distinct child turns with at least one checked attempt. Incorrect attempts also count as observed work. */
  workAttempts?: number;
  /**
   * The child's checked wrong final answers once every work step is done (D-199). After the second one, the final step
   * has no more help to give: Maya gives the answer, with how the parts make it. A saved session from before has no
   * field (none).
   */
  finalMisses?: number;
  /**
   * The child's right final answer in the form they gave it, when it is an equal fraction code accepted (14/16 for 7/8,
   * #407): Maya says it back and asks for it on paper in that form. Null or missing: the package's answer.
   */
  answerForm?: AnswerValue | null;
  /**
   * The child's equal fraction when the question asks for the simplest form (#407): the final step's help simplifies it.
   * Null or missing: none.
   */
  equalForm?: AnswerValue | null;
  /**
   * Columns where the child lost a carry, denied carrying, or planned to write a two-digit sum in one column: the
   * regroup is explained (step.regroup) before any line refers to a carried digit. A saved session from before has no
   * field (none).
   */
  regroupDue?: string[];
  /** Columns whose regroup Maya explained (step.regroup). A saved session from before has no field (none). */
  regroupSaid?: string[];
  /** Carry requirements and explanations with separate source and destination ownership. Legacy column lists above
   * are retained for older trace readers, but never prove that a carry was explained. */
  regroup?: Regroup;
  writeAsked: boolean;
  /**
   * The one number Maya asked about in her last turn ("Did you say 66?"), so a plain yes gives that number (#605). Any other
   * act clears it. A saved session from before has no field.
   */
  heardAsked?: AnswerValue | null;
  /** The column total Maya asked about in that confirmation (stepConfirmable): the only number a yes credits for a step. */
  stepAsked?: AnswerValue | null;
  confirmTries: number;
  offeredOtherInput: boolean;
  redirects: number;
  scopeDue?: ScopeReason;
  mathClaim?: boolean;
  scopeRefusals?: ScopeRefusal[];
  safety: { flagged: boolean; severity: Severity | null; at: number | null; guided: boolean };
  mishearing: { confirmations: number; corrections: number };
  /** The first target step where the child needed help or failed. */
  stuckStep: string | null;
  /** Board objects Maya created, by id: the child's question or the easier example. */
  boardRoles: Record<string, Problem>;
  batches: number;
  turns: TranscriptTurn[];
  outcome: Outcome | null;
  /** A shorter call's limits (#330; see limitsOf). A full 10-minute call, and a saved session from before, has none. */
  limits?: { closingAtMs: number; endAtMs: number };
}

/**
 * `random` seeds the choice of wordings (pass a random 32-bit number; default: one made from the call id, for tests),
 * `history` is the child's wording history before this call (wording-history.ts), and `childName` the name code may say
 * now and then. The model never writes the name.
 */
export function createSession(input: {
  confirmWorkbook?: boolean;
  callId: string;
  channel?: "chat";
  package: unknown;
  random?: number;
  grade?: number;
  history?: WordingHistory;
  childName?: string | null;
  /**
   * D-196, D-197: read the model's own warm words in turns with no math line, said only when the code guards and the
   * review pass. Off by default: then every word Maya says comes from code.
   */
  freeTalk?: boolean;
  /** Read the model's own board commands (tests of the board core only; off by default). */
  modelBoard?: boolean;
  /** The call's end when it is shorter than 10 minutes (ms from the start; #330, the minutes left this week). */
  limitMs?: number;
}): Session {
  const { pkg, held } = teachableOf(input.package);
  const teachable = held === null;
  return {
    version: 4,
    callId: input.callId,
    ...(input.channel ? { channel: input.channel } : {}),
    ...(input.confirmWorkbook ? { confirmWorkbook: true } : {}),
    variety: newVariety({ random: input.random ?? hashOf(input.callId), history: input.history, name: input.childName }),
    freeTalk: input.freeTalk === true,
    grade: input.grade,
    ...(input.modelBoard === true ? { modelBoard: true } : {}),
    state: "READY",
    resume: null,
    package: teachable ? pkg : null,
    contentProblem: held,
    startedAt: null,
    now: null,
    expect: "nothing",
    waitingSince: null,
    silence: "none",
    turn: null,
    stopRequested: false,
    opened: false,
    clarified: false,
    noStart: false,
    exampleShown: 0,
    retried: false,
    done: [],
    ladder: { step: teachable ? workSteps(pkg!)[0]?.id ?? "result" : "result", hint: -1, unlocked: 0, failures: 0 },
    highestHint: null,
    hints: 0,
    assistance: [],
    solved: null,
    lastResult: null,
    answerGivenFirst: false,
    understanding: "uncertain",
    paper: "unknown",
    wrote: false,
    finalMisses: 0,
    writeAsked: false,
    confirmTries: 0,
    offeredOtherInput: false,
    redirects: 0,
    safety: { flagged: false, severity: null, at: null, guided: false },
    mishearing: { confirmations: 0, corrections: 0 },
    stuckStep: null,
    boardRoles: {},
    batches: 0,
    turns: [],
    outcome: null,
    ...shorterLimits(input.limitMs),
  };
}

/** The package Maya teaches from, or why she holds it (the content hold's reason). */
function teachableOf(raw: unknown): { pkg: OperationPackage | null; held: string | null } {
  const check = checkQuestionPackage(raw);
  if (!check.ok) return { pkg: null, held: check.reason };
  // An item with no operation (a place-value or a drawing item) has no worked steps to teach from: it is held.
  if (!hasOperation(check.package)) return { pkg: null, held: "Maya cannot teach items with no operation yet" };
  const pkg = structuredClone(check.package);
  const untaught = untaughtSteps(pkg);
  if (TEACHABLE_KINDS.includes(pkg.operation.kind) && TEACHABLE_KINDS.includes(pkg.easierExample.operation.kind) && untaught.length === 0) return { pkg, held: null };
  return { pkg: null, held: `Maya cannot teach ${untaught.length > 0 ? `the ${untaught.join(", ")} step of ${pkg.operation.kind} questions` : `${pkg.operation.kind} questions`} yet` };
}

/**
 * The pre-check of a question before any call (#527): why Maya holds this package (it does not check, has no operation,
 * or is a kind or step she cannot teach yet), or null when she can teach it. The same rule a new session uses, with no
 * model call, so the desk can say so before a chat starts.
 */
export function heldReason(raw: unknown): string | null {
  return teachableOf(raw).held;
}

function shorterLimits(limitMs: number | undefined): Pick<Session, "limits"> {
  if (limitMs === undefined || !Number.isFinite(limitMs) || limitMs >= TIME_LIMITS.endAtMs) return {};
  const endAtMs = Math.max(1000, Math.round(limitMs));
  return { limits: { closingAtMs: Math.max(0, endAtMs - CLOSING_LEAD_MS), endAtMs } };
}

// ---------- Reading the session ----------

/** Whose turn it is, and the acts Maya may propose now (before any reading of the child's turn). */
export function nextActs(session: Session): { expect: Expect; acts: Act[] } {
  if (session.expect !== "maya") return { expect: session.expect, acts: [] };
  return { expect: "maya", acts: (gate(session, {}) ?? teachingActs(session, {}, false, undefined, undefined, true)).acts };
}

/**
 * The learning event of an ended call (#302), for the learning record: null before the end or without a checked
 * question. A call's result is right (the child's final answer right, with no help), right_with_help (right after
 * help, even after Maya gave the answer), or blank (the call left the question unfinished, even after a wrong answer:
 * only the final answer counts). A call never records wrong, so it has no mistake.
 */
export function learningEvent(session: Session, family: { parentId: string; childId: string }): NewLearningEvent | null {
  const { outcome, package: pkg } = session;
  // A held question (#527) records nothing: Maya taught nothing she could trust, so the call says nothing about the child.
  // Any stored content problem counts, whatever the final reason (a safety concern after the hold ends as "safety").
  if (!outcome || !pkg || session.startedAt === null || session.contentProblem !== null || outcome.reason === "content_issue") return null;
  const right = session.lastResult === "right";
  const result = right ? (outcome.assistance === "independent" ? "right" : "right_with_help") : "blank";
  const first = workSteps(pkg)[0]?.id ?? null;
  return {
    key: `call:${session.callId}`,
    parentId: family.parentId,
    childId: family.childId,
    source: "call",
    question: pkg.ref,
    skill: pkg.skill,
    result,
    stuckStep: result === "right" ? null : result === "right_with_help" ? session.stuckStep ?? first : currentStep(pkg, session.done),
    mistake: null,
    hints: Math.min(session.hints, MAX_HINTS),
    timeMs: Math.min(endTime(session) - session.startedAt, MAX_TIME_MS),
    occurredAt: isoTime(endTime(session)),
    evidence: { kind: "call", id: session.callId },
  };
}

// ---------- Steps and math ----------

/** The worked steps a child does, without the result (fractions.ts: the steps Maya teaches for this question). */
const workSteps = (pkg: OperationPackage) => teachSteps(pkg);

/**
 * The child set this addition column up themselves, with no result yet ("Oh, so 2 plus 3 plus 1?", "Yes, the 1 ten. So 1
 * plus 2 plus 3?"): the turn's last sentence with numbers is exactly the column's addition (additionSetup), its digits
 * top to bottom then the carry, or the carry first; the turn has no negative and no answer. Every other form, and every
 * other step kind, is not read (#605, PR #624 review).
 */
function saidSetup(pkg: OperationPackage, stepId: string, text: string): boolean {
  const st = workSteps(pkg).find((x) => x.id === stepId);
  if (!st || st.kind !== "add-column" || st.carryIn === 0 || NEGATIVE_TURN.test(text) || readAnswer(text).final !== null) return false;
  const last = text.split(/[.!?\n]+/).filter((x) => valuesIn(x).length > 0).at(-1);
  const said = last === undefined ? null : additionSetup(last);
  if (!said) return false;
  const orders = [[...st.digits, st.carryIn], [st.carryIn, ...st.digits]].map((xs) => xs.join(","));
  return orders.includes(said.join(","));
}
const NEGATIVE_TURN = /\b(?:not|no|never|minus|take away|less)\b|n['’]t\b|-/i;
const rank = (a: Assistance) => ASSISTANCE.indexOf(a);
const number = (value: number): AnswerValue => ({ type: "number", value });

/** The values that answer a worked step: the number the step makes (a column's total or the digit written). */
function stepAnswers(step: WorkedStep): AnswerValue[] {
  switch (step.kind) {
    case "add-column":
      return [number(step.total), number(step.write)];
    case "subtract-column":
      return [number(step.top - (step.lent ? 1 : 0) + (step.regrouped ? 10 : 0) - (step.bottom ?? 0))];
    case "multiply-digit":
      return [number(step.total), ...(step.write === null ? [] : [number(step.write)])];
    case "partial-product":
    case "place-point":
      return [number(step.value)];
    case "divide-digit":
      return [number(step.quotient)];
    // Fraction steps (#407), each in its exact written form: 6/8 answers the common denominator of 3/4 + 1/8, 3/4 does not.
    case "common-denominator": {
      const changed = step.to.filter((_, i) => step.factors[i] > 1);
      // With one fraction changed, its new numerator alone answers it too ("six" for 6/8).
      return [...changed.map(fraction), ...(changed.length === 1 ? [number(changed[0].numerator)] : [])];
    }
    case "combine-numerators":
      return [number(step.numerator), fraction({ numerator: step.numerator, denominator: step.denominator })];
    case "simplify":
      return [fraction(step.to)];
    default:
      return [];
  }
}
const fraction = ({ numerator, denominator }: { numerator: number; denominator: number }): AnswerValue => ({ type: "fraction", numerator, denominator });

/** The value answers a worked step: the same number, or for a fraction or mixed number the same written form. */
const answersStep = (st: WorkedStep, value: AnswerValue) =>
  stepAnswers(st).some((v) => (v.type === "number" && value.type === "number" ? equivalent(v, value) : sameValue(v, value)));

/** The value is the number a worked step of the child's question makes, and no known wrong final answer. */
const answersAStep = (pkg: OperationPackage, value: AnswerValue) =>
  workSteps(pkg).some((st) => answersStep(st, value)) && !pkg.wrongAnswers.some((w) => equivalent(w.value, value));

/** The number speech-to-text may mistake a teen or a ten for, to confirm what the child said ("fifteen or fifty?"). */
const soundsLike = (n: number): number[] => (n >= 13 && n <= 19 ? [(n - 10) * 10] : n >= 30 && n <= 90 && n % 10 === 0 ? [n / 10 + 10] : []);

const problemOf = (pkg: OperationPackage, problem: Problem) =>
  problem === "target"
    ? { operation: pkg.operation, steps: pkg.steps, answer: pkg.answer }
    : { operation: pkg.easierExample.operation, steps: pkg.easierExample.steps, answer: { value: pkg.easierExample.answer, accepted: [], unit: null } };

/** The first target step the child has not done ("result" when every step is done). */
const currentStep = (pkg: OperationPackage, done: readonly string[]) => workSteps(pkg).find((s) => !done.includes(s.id))?.id ?? "result";

/** The operation symbol of a kind, as equations write it. */
const SYMBOL: Partial<Record<OperationKind, string>> = {
  add: "+", subtract: "-", multiply: "×", divide: "÷", "decimal-add": "+", "decimal-subtract": "-", "decimal-multiply": "×",
};
/** The board's column layout for a kind, or none (division has no board layout yet). */
const BOARD_OPERATION: Partial<Record<OperationKind, string>> = {
  add: "add", subtract: "subtract", multiply: "multiply", "decimal-add": "add", "decimal-subtract": "subtract", "decimal-multiply": "multiply",
};

/** The two numbers of a whole-number or decimal operation. */
const operandsOf = (op: Operation): number[] => (op.operands as unknown[]).filter((n): n is number => typeof n === "number");

// ---------- Validation of untrusted input ----------

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isWholeAt = (v: unknown, min: number) => Number.isSafeInteger(v) && (v as number) >= min;
const isAnswerValue = (v: unknown): v is AnswerValue =>
  isObject(v) && ((v.type === "number" && Number.isFinite(v.value)) ||
    (v.type === "fraction" && Number.isSafeInteger(v.numerator) && isWholeAt(v.denominator, 1)) ||
    (v.type === "mixed" && isWholeAt(v.whole, 1) && isWholeAt(v.numerator, 0) && isWholeAt(v.denominator, 1)) ||
    (v.type === "remainder" && isWholeAt(v.quotient, 0) && isWholeAt(v.remainder, 0)));
const HINTS = [0, 1, 2, 3, 4];
const SEVERITIES: Severity[] = ["concern", "immediate"];

function proposalProblem(p: unknown): string | null {
  if (!isObject(p)) return "a proposal is an object";
  if (typeof p.act !== "string" || !(ACTS as readonly string[]).includes(p.act)) return `the act is one of ${ACTS.join(", ")}`;
  if (p.version !== PROPOSAL_VERSION) return `the proposal is version ${PROPOSAL_VERSION}: Maya's words are parts, not \`say\``;
  if (!Array.isArray(p.parts) || p.parts.length > PART_LIMITS.parts) return `the parts are a list of at most ${PART_LIMITS.parts} lines and talk`;
  for (const part of p.parts) {
    // Talk of any length is read: words that fail the guards are replaced, never a reason to fail the turn (D-196).
    const talk = isObject(part) && Object.keys(part).length === 1 && typeof part.talk === "string";
    const warm = isObject(part) && (PHRASE_GROUPS as readonly unknown[]).includes(part.warm) &&
      Object.keys(part).every((k) => k === "warm" || k === "echo" || k === "pick") && (part.echo === undefined || typeof part.echo === "string") &&
      (part.pick === undefined || (Number.isSafeInteger(part.pick) && (part.pick as number) >= 1 && (part.pick as number) <= PHRASES[part.warm as PhraseGroup].length));
    const line = isObject(part) && typeof part.line === "string" && (LINE_IDS as readonly string[]).includes(part.line) &&
      Object.keys(part).every((k) => k === "line" || k === "slots") && (part.slots === undefined || isObject(part.slots));
    if (!talk && !warm && !line) return `each part is { line, slots } with a line id, { warm } with a phrase group, or { talk }`;
  }
  if (p.step !== undefined && typeof p.step !== "string") return "the step is a step id";
  if (p.level !== undefined && !HINTS.includes(p.level as number)) return "the level is 0 to 4";
  if (p.understanding !== undefined && p.understanding !== "evidence_observed" && p.understanding !== "uncertain") return "understanding is evidence_observed or uncertain";
  if (p.draw !== undefined && (!Array.isArray(p.draw) || p.draw.length === 0 || p.draw.length > 4 ||
    !p.draw.every((d) => isObject(d) && typeof d.offer === "string" && (d.place === undefined || typeof d.place === "string") && Object.keys(d).every((k) => k === "offer" || k === "place")))) {
    return "draw is a list of 1 to 4 board offers: { offer, place? }";
  }
  if (p.board !== undefined && (!Array.isArray(p.board) || p.board.length === 0 || p.board.length > MAX_COMMANDS || !p.board.every((c) => isObject(c) && typeof c.op === "string"))) {
    return `the board is a list of 1 to ${MAX_COMMANDS} commands, each with an op`;
  }
  const r = p.reading;
  if (r === undefined) return null;
  if (!isObject(r)) return "the reading is an object";
  if (r.safety !== undefined && !SEVERITIES.includes(r.safety as Severity)) return "the reading's safety is concern or immediate";
  for (const flag of ["stop", "unclear", "writing", "offTopic", "mathClaim", "unsafeRequest", "noBoard", "shorter", "correctsHearing"] as const) {
    if (r[flag] !== undefined && typeof r[flag] !== "boolean") return `the reading's ${flag} is true or false`;
  }
  if (r.outsideScope !== undefined && !["outside_work", "other_person", "other_topic"].includes(r.outsideScope as string)) return "outsideScope is a reason code";
  if (r.mathRequests !== undefined && !Array.isArray(r.mathRequests)) return "mathRequests is a list of separate requested expressions";
  if (r.scopeSkill !== undefined && typeof r.scopeSkill !== "string") return "scopeSkill is a skill id";
  if (r.aboutMaya !== undefined && r.aboutMaya !== "identity" && r.aboutMaya !== "secret_friend") return "aboutMaya is identity or secret_friend";
  if (r.help !== undefined && r.help !== "more" && r.help !== "show") return "the reading's help is more or show";
  if (r.start !== undefined && r.start !== "has_work" && r.start !== "no_start") return "the reading's start is has_work or no_start";
  if (r.paper !== undefined && r.paper !== "written" && r.paper !== "declined") return "the reading's paper is written or declined";
  if (r.answers !== undefined) {
    if (!Array.isArray(r.answers)) return "the reading's answers are a list";
    for (const a of r.answers) {
      if (!isObject(a) || !isAnswerValue(a.value) || typeof a.step !== "string" || (a.verdict !== "right" && a.verdict !== "wrong") ||
        (a.problem !== undefined && a.problem !== "target" && a.problem !== "example")) {
        return "each answer needs a number, fraction, mixed number or remainder value, a step and a verdict";
      }
    }
  }
  return null;
}

/** The priority fields of a proposal's reading, each checked alone: a malformed field elsewhere does not drop them. */
function priorityOf(raw: unknown): Pick<Reading, "safety" | "stop" | "unclear" | "start" | "noBoard" | "shorter" | "aboutMaya"> {
  const r = isObject(raw) && isObject(raw.reading) ? raw.reading : {};
  return {
    safety: SEVERITIES.includes(r.safety as Severity) ? (r.safety as Severity) : undefined,
    stop: r.stop === true,
    noBoard: r.noBoard === true,
    shorter: r.shorter === true,
    aboutMaya: r.aboutMaya === "secret_friend" || r.aboutMaya === "identity" ? r.aboutMaya : undefined,
    unclear: r.unclear === true,
    start: r.start === "no_start" ? "no_start" : undefined,
  };
}

// ---------- Allowed acts and priority ----------

interface Allowed {
  acts: Act[];
  code: RefusalCode;
  reason: string;
}

/** An answer code has checked: the child said and kept it, and the verdict is right. */
interface Checked {
  answer: ChildAnswer;
  problem: Problem;
}

/**
 * The priority gates, in order: safety, a content hold, the child's turn, a stop, a repair, silence, and confirmation
 * of what was heard. A gate allows only its own acts, and none of them scores an answer. Null when teaching may go on.
 */
function gate(s: Session, reading: Reading): Allowed | null {
  if (s.outcome) return { acts: [], code: "ended", reason: "The call has ended." };
  if ((reading.safety && (!s.safety.flagged || (s.safety.severity === "concern" && reading.safety === "immediate"))) || (s.safety.flagged && !s.safety.guided)) {
    return { acts: ["safety"], code: "safety_first", reason: "Safety comes first: give the safety guidance before anything else." };
  }
  if (s.state === "SAFETY") return { acts: ["close"], code: "safety_first", reason: "No math after a safety concern: close." };
  if (s.state === "CONTENT_HOLD") return { acts: ["close"], code: "content_hold", reason: `Maya cannot teach this question (${s.contentProblem}): close with only the held lines, in order, and no other words.` };
  if (s.expect !== "maya") return { acts: [], code: "not_mayas_turn", reason: "It is the child's turn: wait for them." };
  if (s.stopRequested || reading.stop) return { acts: ["close"], code: "stop_first", reason: "The child asked to stop: close kindly, with no more questions." };
  if (s.state === "REPAIR_MAYA") return { acts: ["repair"], code: "repair_first", reason: "Maya said something the checked math does not support: correct it first." };
  if (s.scopeDue && s.turn && !reading.unsafeRequest) return { acts: ["redirect"], code: "scope_first", reason: "This request is outside the checked question. Use only redirect.workbook." };
  if (s.replies?.length) return { acts: ["redirect"], code: "fixed_reply_first", reason: "Say only the next code reply, with no warm or free talk." };
  if (s.silence === "close_due") return { acts: ["close"], code: "act_not_allowed", reason: "No answer after the check-in: close." };
  if (s.silence === "check_due" && !s.turn) return { acts: ["check_in"], code: "act_not_allowed", reason: "The child has been quiet: one short check-in, with no new help." };
  // Once the answer stands, the model's unclear reading does not hold the turn (practice: "I heard 66. Is that right?"
  // after "That's right: 27 + 39 = 66"); a number code cannot read still does.
  // The hello comes first: Maya says she is an AI before she asks anything about the child's turn.
  if (s.opened && (s.turn?.uncertain || (reading.unclear && s.solved === null))) {
    if (s.turn && s.package && outsideConfirmation(s.package, s.turn.text, s.exampleIntroduced === true || s.exampleShown > 0)) {
      return { acts: ["clarify"], code: "confirm_first", reason: "This turn contains outside arithmetic. Read the stored question instead of confirming any number from the turn." };
    }
    // A confirm that could credit nothing is no use: the normal help comes instead ("Is it 6?" on the ones, "I carried 1.").
    if (stepOnlyTurn(s) || claimJudgedWrong(s)) return null;
    if (s.confirmTries < 2) return { acts: ["confirm"], code: "confirm_first", reason: "What the child said is unclear: confirm it before judging any math." };
    return {
      acts: s.offeredOtherInput ? ["close"] : ["offer_other_input", "close"],
      code: "confirm_first",
      reason: "Two confirmations did not work: offer another way to answer, or close.",
    };
  }
  return null;
}

/** Teaching states where two committed final misses lead to the backup close. */
const FINAL_GIVE_STATES: readonly Teaching[] = ["ASSESS", "MODEL_EXAMPLE", "TRY_TARGET", "GUIDE_TARGET"];

const MAIN_ACTS: Record<Teaching, Act[]> = {
  OPEN: ["open"],
  ASSESS: ["accept_answer", "clarify", "example_step", "try_target", "guide"],
  MODEL_EXAMPLE: ["accept_answer", "example_step", "try_target", "guide"],
  TRY_TARGET: ["accept_answer", "guide"],
  GUIDE_TARGET: ["accept_answer", "guide"],
  CHECK: ["ask_write", "guide"],
  WRITE_CLOSE: ["ask_write", "close"],
};

/**
 * The teaching acts allowed now. `rightResult`: the child's turn holds a checked right final answer. `progress`: the
 * child has done a step of their question, before or in this turn (a checked right answer): then they have started,
 * so no easier example starts and a no-start no longer holds (#389). `misses`: the child's checked wrong final answers
 * once every work step is done, with this turn's (D-199).
 */
function asksForHelp(text: string): boolean {
  const turn = text.trim().replace(/’/g, "'").replace(/\s+/g, " ");
  return /^(?:(?:please|um|okay) )*(?:help(?: me)?(?: please)?|i need help|(?:can|could|will) you help(?: me)?|i(?:'m| am) stuck|show me|i don't know how|i don't get it)[.!?]?$/i.test(turn)
    || saysStuck(text) || /^(?:(?:can|could|would|will) you (?:please )?|please )?show me\b/i.test(turn);
}

/**
 * The child asks Maya about keeping, telling, sharing or having a secret ("Can you keep a secret?", "Can you tell me a
 * secret?", F02), as a question. Not a question about the word ("Is a secret a kind of number?"). Read by code.
 */
function asksSecret(text: string): boolean {
  return /\b(?:keep|tell|share|have|know)\b[^.?!\n]{0,24}\bsecrets?\b[^.!\n]*\?/i.test(text);
}

/**
 * The code replies a question about a secret gets (about.no_secret, then the question), never a thank-you that answers
 * nothing (F02). Read by `step` and by code's fallback alike, so a failed model call still says it (review of 6eb2b9e3).
 */
function secretReplies(s: Session): Session["replies"] | null {
  return s.turn && !s.scopeDue && !s.replies?.length && !s.safety.flagged && asksSecret(s.turn.text) ? ["about.no_secret", "question.problem"] : null;
}

function asksWhy(text: string): boolean {
  return /^\s*why\W*$/i.test(text) || /\b(?:why|where|what|how)\b[^.!\n]*\b(?:carry|carried|regroup\w*|trad\w*|ten|10|one|1)\b/i.test(text);
}

/**
 * The top help level Maya can say on the ladder's step now: the highest level of the guide lines code offers for it,
 * leaving out a line that would say the answer (revealsAnswer refuses it: "8 ÷ 2 = 4" is the H3 of 8 ÷ 2, so its top is
 * H2). The final step's simplify help counts too (#407).
 */
function sayableHints(s: Session): number[] {
  const pkg = s.package!;
  const answer = pkg.answer.value;
  const done = [...s.done];
  const after = regroupAfter(s, [], done);
  const view: View = { steps: [s.ladder.step], done, checked: [], rightResult: false, equal: null, regroup: pendingRegroup(after), regroupSaid: after.said, regroupTimes: after.times };
  const sayable = (o: LineOffer) => Object.values(o.filled ?? {}).every((v) => !valuesIn(String(v).split(operationText(pkg.operation)).join(""), readOptionsFor(pkg)).some((n) => equivalent(n, answer)));
  return offersFor(s, "guide", view).filter((o) => o.level !== undefined && (o.slots.step === undefined || o.slots.step === s.ladder.step) && sayable(o)).map((o) => o.level!);
}

function topHint(s: Session): number {
  return Math.max(0, ...sayableHints(s));
}

/** Skip help levels that cannot be said without revealing the answer. */
function helpHint(s: Session): number {
  if (!s.turn || !asksForHelp(s.turn.text)) return s.ladder.hint;
  const levels = sayableHints(s);
  let hint = s.ladder.hint;
  if (hint < 0) return hint;
  while (hint < 3 && !levels.includes((hint + 1) as HintLevel)) hint++;
  return hint;
}

/** Refuse an example if any of its offered words or board text can reveal the target answer. */
function exampleRevealsAnswer(s: Session): boolean {
  const pkg = s.package!;
  const lines = packageLines(pkg);
  const offers = [...lines.exampleIntro(), ...pkg.easierExample.steps.flatMap((step) => lines.exampleStep(step.id))];
  return offers.some((offer) => [...offer.texts, ...(offer.board ? [offer.board] : [])]
    .some((text) => valuesIn(text, readOptionsFor(pkg)).some((value) => equivalent(value, pkg.answer.value))));
}

/**
 * The way out of the help ladder (#735, decision (a); D-199 for misses). A turn that only asks for help ("I'm stuck.",
 * "Show me.", a reading of help), with no answer in it, after Maya gave this step's top hint, never gets the answer: first
 * the easier example ("example"), and once that is worked, an honest close with no answer ("close"). Null for any other
 * turn: a checked wrong answer follows the backup close rule, and a copy
 * of a shown step goes on (copiedStep). A final-only step ends the same way, so its top lines never repeat (8 ÷ 2, 2 + 1).
 */
function stuckWayOut(s: Session, reading: Reading, rightResult: boolean): "example" | "close" | null {
  const pkg = s.package;
  if (!pkg || !s.turn || s.solved !== null || rightResult) return null;
  const main = isTeaching(s.state) ? s.state : s.resume;
  if (!main || !["ASSESS", "MODEL_EXAMPLE", "TRY_TARGET", "GUIDE_TARGET"].includes(main)) return null;
  const steps = pkg.easierExample.steps.length;
  if (main === "MODEL_EXAMPLE" && s.exampleShown < steps) return null;
  if ((reading.answers ?? []).some((a) => (a.problem ?? "target") === "target" && (a.verdict !== "wrong" || committedValue(s, a)))) return null;
  if (reading.help === undefined && !asksForHelp(s.turn.text)) return null;
  if (copiedStep(s) !== null || helpHint(s) < topHint(s)) return null;
  return s.exampleShown < steps && !exampleRevealsAnswer(s) ? "example" : "close";
}

function teachingActs(s: Session, reading: Reading, rightResult: boolean, progress = s.done.length > 0, misses = s.finalMisses ?? 0, offering = false): Allowed {
  // Maya may check what she heard before she goes on, but not a third time in a row (practice run 6, F06: "16 or
  // 60?" eleven times after the child said 16 each time), and not once the answer is accepted (run 5, F05: "Just
  // checking, was that 66?" after "You got it!"). An unclear turn still gets its two confirmations (gate).
  // A doubtful yes to "Did you say 66?" that says 66 again gets a check of the work, never another "Did you say" (#605).
  const again = s.heardAsked != null && s.turn !== null && s.package !== null && sameFinal(s, s.heardAsked) && doubtfulRight(s);
  // ...and only for what was not clear (#605: "I carry the 1 to the tens" got "Was that 1?"): a turn code or the model
  // read as unclear, numbers speech heard two ways, a choice, or a final answer the child is not sure of.
  const confirm: Act[] = s.opened && s.turn && s.confirmTries < 2 && s.solved === null && !again && !claimJudgedWrong(s) && (stepSaidUnheard(s) || (notClear(s, reading) && !stepOnlyTurn(s))) ? ["confirm"] : [];
  if (s.state === "TIME_CLOSE") {
    const acts: Act[] = s.solved !== null ? (s.writeAsked ? ["close"] : ["ask_write", "close"])
      : rightResult ? ["accept_answer", "close"] : misses >= 2 ? ["close"] : (s.workAttempts ?? 0) > 0 ? ["ask_write", "close"] : ["close"];
    return { acts: [...acts, ...confirm], code: "act_not_allowed", reason: s.package && closeExpressionContainsAnswer(s.package.operation, s.package.answer.value) ? "Time is almost up: use close.stuck alone." : "Time is almost up: finish the question and close." };
  }
  // A child who says they wrote it is done writing, whatever the model reads (#605). "I'm writing" keeps its time.
  if (reading.writing && !saysWritten(s.turn?.text ?? "")) return { acts: ["wait"], code: "act_not_allowed", reason: "The child is writing: wait." };
  if (reading.unsafeRequest) {
    return {
      acts: s.redirects > 0 ? ["redirect", "close"] : ["redirect"],
      code: "decline_first",
      reason: "The child asked for content Maya never gives: say the decline line (redirect.decline), with no free talk, then go back to the question.",
    };
  }
  if (reading.offTopic) {
    return { acts: s.redirects > 0 ? ["redirect", "close"] : ["redirect"], code: "act_not_allowed", reason: "Off topic: bring the child back to this question." };
  }
  const main = isTeaching(s.state) ? s.state : s.resume;
  if (!main) return { acts: [], code: "act_not_allowed", reason: "No act fits now." };
  const steps = s.package!.easierExample.steps.length;
  const noStart = s.noStart && !progress;
  if (s.solved === null && !rightResult && exampleRevealsAnswer(s) && (noStart || reading.start === "no_start" || main === "MODEL_EXAMPLE")) {
    return { acts: ["close"], code: "act_not_allowed", reason: "The easier example cannot be said safely. Close without the answer." };
  }
  let acts = MAIN_ACTS[main].filter((act) => {
    switch (act) {
      case "open":
        return !s.opened;
      case "clarify":
        return !s.clarified;
      case "example_step":
        if (exampleRevealsAnswer(s)) return false;
        // The easier example starts only before the child has done a step of their question, and only for a child who
        // cannot start or asks for help (practice: "Okay, let's do 27 plus 39." got the example). The model is offered
        // it before it reads the turn (`offering`); its reading then decides.
        return main === "ASSESS" ? !progress && (offering || s.noStart || reading.start === "no_start" || reading.help !== undefined) : s.exampleShown < steps;
      case "try_target":
        // A child who could not start sees the whole example first. Never once the child has done a step of their
        // question (practice: "Now you try yours" after "I got 16 for 7 plus 9").
        return !progress && (main === "MODEL_EXAMPLE" ? s.exampleShown === steps : !noStart);
      case "guide":
        // After the whole example, a child who goes on with their own question is guided on from where they are.
        if (main === "MODEL_EXAMPLE") return s.exampleShown === steps && progress;
        // ...and tries their own question again before guided work.
        return !noStart || s.retried;
      case "ask_write":
        return main === "CHECK" || !s.writeAsked;
      case "close":
        return s.writeAsked && s.turn !== null;
      default:
        return true;
    }
  });
  // The answer stands and the child already wrote it: the close may come now, with no request to write (#605).
  if (main === "CHECK" && s.solved !== null && s.turn !== null && (s.wrote === true || s.paper === "child_confirmed" || reading.paper === "written")) acts = [...acts, "close"];
  // The answer stands and the child says they are done ("I'm done!"): a warm close, never the write or explain step
  // again (#605, Savar 2026-11-06). Read only in its exact forms (saysDone); any other turn keeps the check.
  if ((main === "CHECK" || main === "WRITE_CLOSE") && s.solved !== null && s.turn !== null &&
      saysDone(s.turn.text, s.package ? readOptionsFor(s.package) : undefined, s.package?.answer.value)) {
    return { acts: ["close"], code: "act_not_allowed", reason: "The answer stands and the child is done: close warmly, with no more questions." };
  }
  if (rightResult && s.solved === null && acts.includes("accept_answer")) acts = ["accept_answer"];
  // Help requests alone never lead to the answer (#735, decision (a)): after the top hint, the easier example, then an
  // honest close (stuckWayOut).
  const way = stuckWayOut(s, reading, rightResult);
  if (way === "example") {
    return { acts: ["example_step", ...confirm], code: "act_not_allowed", reason: "The child still only asks for help after the top hint: work the easier example (example_step). Help alone never gets the answer." };
  }
  if (way === "close") {
    return { acts: ["close"], code: "act_not_allowed", reason: "The child still only asks for help after the top hint and the easier example: close honestly with close.stuck, with no answer." };
  }
  // H3 already showed this step and the child misses it again: close without the answer. A turn that only copies or acknowledges the
  // shown step, or asks about the next one (copiedStep: "16", "Got it.", "Where does the 1 go?"), is no miss.
  const rightHere = reading.answers?.some(a => (a.problem ?? "target") === "target" && a.step === s.ladder.step && a.verdict === "right");
  const missed = reading.answers?.some(a => (a.problem ?? "target") === "target" && a.verdict === "wrong" && committedValue(s, a));
  if (s.solved === null && !rightResult && !rightHere && s.turn !== null && s.ladder.step !== "result" && copiedStep(s) === null &&
      s.ladder.hint >= 3 && missed && (!noStart || s.retried)) {
    return { acts: ["close"], code: "act_not_allowed", reason: "Close honestly without giving the answer." };
  }
  // Two wrong final answers once every column is done: the final step has only its gentlest help, already given, so
  // Maya closes without the answer (D-306). Never over a right answer.
  if (misses >= 2 && !rightResult && s.solved === null && FINAL_GIVE_STATES.includes(main)) {
    return {
      acts: ["close"], code: "act_not_allowed",
      reason: "Close honestly without giving the answer.",
    };
  }
  acts = [...acts, ...confirm.filter((a) => !acts.includes(a))];
  // Offered before the reading: a turn with no number may be off topic (flattery, a promise, a question about Maya), so
  // the model sees the redirect and its reply phrases. Before #605 it saw them through the confirmation offered on every
  // turn; a clear turn has none now. The redirect still needs the reading to say off topic.
  const teaching = acts.some((x) => ["accept_answer", "guide", "try_target", "example_step", "clarify", "ask_write"].includes(x));
  if (offering && teaching && s.turn && s.package && valuesIn(s.turn.text, readOptionsFor(s.package)).length === 0 && !acts.includes("redirect")) acts = [...acts, "redirect"];
  const why = noStart && !s.retried ? " The child could not start: show the whole easier example, then hand the question back."
    : main === "ASSESS" && !progress && !acts.includes("example_step") ? " The easier example is only for a child who cannot start (reading.start no_start) or asks for help." : "";
  return { acts, code: "act_not_allowed", reason: `In ${s.state} Maya may: ${acts.join(", ") || "nothing yet"}.${why}` };
}

// ---------- The step function ----------

/**
 * Applies one event. A refused proposal changes nothing but what the event itself brings: the clock, a safety signal,
 * and a stop request, an unclear number or a no-start the reading names for the child's turn.
 */
export function step(session: Session, event: SessionEvent): StepResult {
  if (!isObject(event) || typeof event.at !== "number" || !Number.isFinite(event.at)) {
    return refuse(session, "invalid_event", "An event needs a type and the time it happened.");
  }
  if (session.now !== null && event.at < session.now) return refuse(session, "invalid_event", "The clock went back.");
  if (session.outcome) return refuse(session, "ended", "The call has ended.");
  if (event.type !== "start" && session.startedAt === null) return refuse(session, "invalid_event", "The call has not started.");

  const s: Session = structuredClone(session);
  // Old saved sessions must not retain obsolete numeric context.
  Reflect.deleteProperty(s, "scopePending");
  Reflect.deleteProperty(s, "scopeCurrent");
  s.now = event.at;
  const effects: Effect[] = [];

  // Safety first: a safety signal is taken before the clock and before anything else in the same event.
  // Structured output sends null for an unused field: it reads as a missing one.
  const raw = event.type === "proposal" ? withoutNulls(event.proposal) : undefined;
  const shape = event.type === "proposal" ? proposalProblem(raw) : null;
  // The priority input is read field by field, so a malformed board or answer list cannot drop it.
  const priority = priorityOf(raw);
  const severity = event.type === "safety" ? event.severity : priority.safety;
  if (severity) raiseSafety(s, severity, event.at, effects);

  // The child's turn as the model read it: a stop, an unclear number and a no-start hold even if the proposal fails.
  if (priority.stop) s.stopRequested = true;
  if (s.turn && s.package && event.type === "proposal") {
    // Scope inputs are read separately from proposal shape. A bad board or a later retry cannot remove this duty.
    const r = isObject(raw) && isObject(raw.reading) ? raw.reading : {};
    if (mathClaimIn(s.turn.text, {
      mathClaim: r.mathClaim === true,
      mathRequests: Array.isArray(r.mathRequests) ? r.mathRequests : [],
    })) s.mathClaim = true;
    const reading: ScopeReading = {
      ...(typeof r.scopeSkill === "string" ? { scopeSkill: r.scopeSkill } : {}),
      ...(r.outsideScope === "outside_work" || r.outsideScope === "other_person" || r.outsideScope === "other_topic" ? { outsideScope: r.outsideScope } : {}),
      ...(Array.isArray(r.mathRequests) ? { mathRequests: r.mathRequests as ScopeReading["mathRequests"] } : {}),
    };
    const reason = scopeReason(s.package, s.turn.text, s.exampleIntroduced === true || s.exampleShown > 0, reading);
    if (reason) s.scopeDue ??= reason;
  }
  if (s.turn && priority.noBoard) s.noBoard = true;
  if (s.turn && priority.shorter) s.shorter = true;
  if (s.turn && !s.scopeDue && !s.replies?.length && priority.aboutMaya) {
    s.replies = ["about.ai", ...(priority.aboutMaya === "secret_friend" || asksSecret(s.turn.text) ? ["about.no_secret" as const] : []), "question.problem"];
  } else if (secretReplies(s)) {
    s.replies = secretReplies(s)!;
  } else if (s.turn && !s.scopeDue && priority.shorter && !s.replies?.length) s.replies = ["shorter.prompt"];
  if (priority.unclear && s.turn && s.solved === null) s.turn.uncertain = true;
  // From ASSESS, or from an interrupt (such as a confirmation) that returns to ASSESS, and never after the child has
  // done a step of their question (#389: practice run 9, F06, ran the easier example after the child did the ones).
  if (priority.start === "no_start" && (isTeaching(s.state) ? s.state : s.resume) === "ASSESS" && s.done.length === 0) s.noStart = true;

  if (s.startedAt !== null) {
    const elapsed = event.at - s.startedAt;
    const limits = limitsOf(s);
    if (elapsed >= limits.endAtMs) {
      end(s, "time_limit", effects, true);
      return { session: s, effects, refusal: event.type === "proposal" ? { code: "ended", reason: "The call reached its time limit.", allowed: [] } : null };
    }
    // A repair Maya owes is made first; it returns to the closing minute.
    if (elapsed >= limits.closingAtMs && !["TIME_CLOSE", "SAFETY", "REPAIR_MAYA", "CLOSE", "CONTENT_HOLD"].includes(s.state)) {
      moveTo(s, "TIME_CLOSE");
      s.expect = "maya";
      s.silence = "none";
    }
  }

  switch (event.type) {
    case "start":
      if (s.state !== "READY") return refuse(session, "invalid_event", "The call has already started.");
      s.startedAt = event.at;
      s.state = s.package ? "OPEN" : "CONTENT_HOLD";
      s.expect = "maya";
      // A held question (#605): code says hello, that she is an AI, and invites another question on the page, then
      // the call ends. No model is asked and nothing is taught.
      if (!s.package) {
        const text = heldSentences(true).join(" ");
        effects.push({ kind: "say", act: "close", text });
        s.turns.push({ at: event.at, speaker: "maya", text, state: "CLOSE", act: "close" });
        end(s, "child_stopped", effects, false);
      }
      break;
    case "child_turn": {
      if (typeof event.text !== "string") return refuse(session, "invalid_event", "A child turn needs its text.");
      if (event.final === false) {
        effects.push({ kind: "cancel_output" });
        break;
      }
      const alternatives = Array.isArray(event.alternatives) ? event.alternatives.filter((a) => typeof a === "string") : [];
      s.turns.push({ at: event.at, speaker: "child", text: event.text, state: s.state, ...(alternatives.length > 0 ? { alternatives } : {}) });
      // A number form code cannot read is confirmed, never guessed; one inside the child's explanation is never their
      // answer ("66, because six tens and six ones"), so it needs no confirmation (D-199).
      const operands = readNumbers(event.text, { fractions: true, operands: true });
      const readableQuestion = s.package && !operands.unreadable && operands.values.length >= 2 &&
        !scopeReason(s.package, event.text, s.exampleIntroduced === true || s.exampleShown > 0);
      const uncertain = event.uncertain === true || (!readableQuestion && unreadableAnswer(event.text, readOptionsFor(s.package)));
      // A new line keeps the turns apart, so a sign in the second turn is not read as a subtraction from the first.
      s.turn = s.turn
        ? { at: event.at, text: `${s.turn.text}\n${event.text}`, uncertain: s.turn.uncertain || uncertain }
        : { at: event.at, text: event.text, uncertain };
      // Each child turn starts with no numeric restriction from a prior turn.
      delete s.scopeDue;
      s.mathClaim = mathClaimIn(s.turn.text);
      if (s.package) {
        const reason = scopeReason(s.package, s.turn.text, s.exampleIntroduced === true || s.exampleShown > 0);
        if (reason) s.scopeDue = reason;
      }
      // A checked right answer the child takes back ("Actually 56", or a new answer code cannot read) stands no longer,
      // whatever a later reading names: the result waits for a new checked final answer. The help history stays. A
      // corrected number of a worked step ("15, no wait, 16" for the ones) answers that step, unless it is a known
      // wrong final answer.
      const back = s.package && s.lastResult === "right" ? takenBack(event.text, readOptionsFor(s.package)) : null;
      if (back && !(back.kept && (rightForQuestion(s.package!, back.kept) || answersAStep(s.package!, back.kept)))) {
        s.lastResult = null;
        if (s.solved === "child") s.solved = null;
        s.wrote = false;
        s.writeAsked = false;
        s.paper = "unknown";
        if (s.state === "CHECK" || s.state === "WRITE_CLOSE") moveTo(s, "GUIDE_TARGET");
        if (s.resume === "CHECK" || s.resume === "WRITE_CLOSE") s.resume = "GUIDE_TARGET";
      }
      if (s.state === "OPEN" && s.opened) s.state = "ASSESS";
      s.expect = "maya";
      s.silence = "none";
      break;
    }
    case "tick":
      if (s.expect === "child" && s.waitingSince !== null) {
        const quiet = event.at - s.waitingSince;
        const checkAfter = s.state === "WAIT_WRITE" ? PAUSES.writeCheckMs : PAUSES.thinkCheckMs;
        if (s.silence === "none" && quiet >= checkAfter) {
          s.silence = "check_due";
          s.expect = "maya";
        } else if (s.silence === "checked" && quiet >= PAUSES.noResponseMs) {
          s.silence = "close_due";
          s.expect = "maya";
        }
      }
      break;
    case "writing":
      // Writing that ends after the answer is solved is the child writing it: Maya does not ask for it again (#389).
      if (event.status === "done" && s.solved !== null) s.wrote = true;
      if (event.status === "started" && isTeaching(s.state) && s.state !== "OPEN") {
        enterInterrupt(s, "WAIT_WRITE");
        waitForChild(s);
      } else if (event.status === "done" && s.state === "WAIT_WRITE") {
        moveTo(s, s.resume!);
        waitForChild(s);
      }
      break;
    case "safety":
      break;
    case "maya_said":
      // Nothing is repaired before the opening, after a safety concern or a content hold, or twice at once.
      // The adapter may identify the utterance being spoken in a batch. Without that index, use the last turn.
      // An absent or non-Maya indexed turn approves no words. Both texts use the same speech normalization.
      if (typeof event.text !== "string") return refuse(session, "invalid_event", "What Maya said needs its text.");
      const spokenTurn = event.approvedTurn === undefined ? null : s.turns[event.approvedTurn];
      const approved = event.approvedTurn === undefined ? lastSaid(s) : spokenTurn?.speaker === "maya" ? spokenTurn.text : "";
      if (s.package && !["READY", "OPEN", "SAFETY", "CONTENT_HOLD", "REPAIR_MAYA"].includes(s.state) &&
        !saidAsApproved(event.text, approved)) {
        effects.push({ kind: "cancel_output" });
        // The repair returns to the teaching state (an interrupt's saved one), or to the closing minute (no resume). The
        // child's pending turn and a stop stay for after the repair (a stop comes first).
        if (isTeaching(s.state)) s.resume = s.state;
        s.state = "REPAIR_MAYA";
        s.expect = "maya";
      }
      break;
    case "content_problem":
      // Stored in every state, so a problem found after a safety concern still writes no learning event. Safety keeps the turn.
      s.contentProblem = event.detail;
      if (s.state !== "SAFETY") {
        moveTo(s, "CONTENT_HOLD");
        s.expect = "maya";
        effects.push({ kind: "cancel_output" });
      }
      break;
    case "technical":
      end(s, "technical_issue", effects, true);
      break;
    case "hang_up":
      end(s, "child_stopped", effects, true);
      break;
    case "proposal":
      if (shape) return { session: s, effects, refusal: { code: "invalid_proposal", reason: shape, allowed: (gate(s, {}) ?? teachingActs(s, {}, false)).acts } };
      return propose(s, raw as Proposal, effects, reviewsOf(event.talkReviews), event.fallback === true);
    default:
      return refuse(session, "invalid_event", "Unknown event type.");
  }
  return { session: s, effects, refusal: null };
}

/** The well-formed free-talk reviews of a proposal event: a text and a review answer. Anything else is left out (no pass). */
function reviewsOf(raw: unknown): TalkReview[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((r): r is TalkReview => isObject(r) && typeof r.text === "string" && isObject(r.result) &&
    (r.result.verdict === "pass" || (r.result.verdict === "fail" && Array.isArray(r.result.rules) && typeof r.result.reason === "string") ||
      (r.result.verdict === "error" && typeof r.result.reason === "string")));
}

/** A proposal on `base` (the session with the event's own input taken). A refusal returns `base` and its effects. */
function propose(base: Session, p: Proposal, effects: Effect[], reviews: readonly TalkReview[] = [], fallback = false): StepResult {
  const no = (code: RefusalCode, reason: string, allowed: Act[]): StepResult => ({ session: base, effects, refusal: { code, reason, allowed } });
  const s = structuredClone(base);
  const pkg = s.package;
  if (s.scopeDue && gate(s, p.reading ?? {})?.code === "scope_first") {
    if (p.act !== "redirect" || p.parts.length !== 1 || !("line" in p.parts[0]) || p.parts[0].line !== "redirect.workbook" || p.draw || p.board) {
      return no("scope_first", "Use only redirect.workbook for this outside request.", ["redirect"]);
    }
    // An outside request supplies no answers, paper status or teaching progress.
    p = { version: PROPOSAL_VERSION, act: "redirect", parts: [{ line: "redirect.workbook" }] };
  }
  // Once the child's right answer stands, a reading that says again what code already found right carries nothing new:
  // it is left out, never judged again (practice: "Yay, I got 66! I'm done." refused as not sure, then "I heard 66. Is that
  // right?"). A wrong answer is still judged: the child may change their answer.
  const said = s.solved !== null && s.lastResult === "right" && pkg ? withoutRepeats(pkg, p.reading ?? {}) : p.reading ?? {};
  // A plain yes to "Did you say 66?" gives 66, whatever the model reads: code checks it right, then only the accept fits.
  const yes = said.answers?.length ? null : yesAnswer(s);
  const reading: Reading = yes ? { ...said, answers: [yes] } : said;
  if (p.act === "give_answer") return no("act_not_allowed", "The answer is not offered.", (gate(s, reading) ?? teachingActs(s, reading, false)).acts);
  // Before the words: Maya never asks for what the child said they wrote or would not write (#605).
  if (reading.paper) s.paper = reading.paper === "written" ? "child_confirmed" : "declined";

  // 1. The priority gates, before any math: safety, content, turn, stop, repair, silence, confirmation.
  const blocked = gate(s, reading);
  if (blocked && !blocked.acts.includes(p.act)) return no(blocked.code, blocked.reason, blocked.acts);
  // A content hold (#527): the close says the held lines, all of them and in order, and nothing else.
  if (s.state === "CONTENT_HOLD" && p.act === "close") {
    const want = heldOffers(!s.opened).map((o) => o.line);
    const got = p.parts.map((x) => ("line" in x ? x.line : null));
    if (p.draw?.length || p.board?.length || got.length !== want.length || got.some((line, i) => line !== want[i])) {
      return no("content_hold", `Maya cannot teach this question: say only ${want.join(", ")}, in this order, with no other words.`, ["close"]);
    }
  }

  // 2. Teaching: the child's answers are judged only now, and only for an act that may score them.
  const checked: Checked[] = [];
  if (!blocked && SCORING_ACTS.includes(p.act) && (reading.answers ?? []).length > 0) {
    const problem = checkAnswers(s, reading.answers!, checked);
    if (problem) return no(problem.code, problem.reason, teachingActs(s, reading, false).acts);
  } else if (blocked?.code === "stop_first" && p.act === "close" && (reading.answers ?? []).length > 0) {
    // The close after a stop still records the child's final answer when it checks; a bad reading never blocks a stop.
    const finals: Checked[] = [];
    if (!checkAnswers(s, reading.answers!, finals)) checked.push(...finals.filter((c) => c.problem === "target" && c.answer.step === "result"));
  }
  // A step the child said in words code hears (stepTurnHeard) is never passed over by a reading that names no answer
  // (first-ship practice, F06: "Seven plus nine is sixteen." got "Thank you for telling me. Can you try 27 + 39?"). Only a
  // refusal: the credit comes, as before, from a reading or code's fallback that names it.
  if (!blocked && pkg && ["guide", "try_target", "example_step", "clarify"].includes(p.act) && (reading.answers ?? []).length === 0) {
    const missed = heardAnswers(s).find((a) => a.step !== "result");
    if (missed) return no("invalid_proposal", `The child said ${valueText(missed.value)} for "${missed.step}": read it in reading.answers and answer it.`, teachingActs(s, reading, false).acts);
  }
  const rightResult = checked.some((c) => c.problem === "target" && c.answer.step === "result" && c.answer.verdict === "right");
  // A checked wrong final answer takes back the solution that stood: the outcome follows the current result.
  if (checked.some((c) => c.problem === "target" && c.answer.step === "result" && c.answer.verdict === "wrong")) s.solved = null;
  // An equal fraction when the question asks for the simplest form (#407): the adding is done, not the form.
  const equal = equalIn(pkg, checked);
  // A checked right answer on the child's question shows they have started: a no-start no longer holds (#389).
  const progress = s.done.length > 0 || equal !== null || checked.some((c) => c.problem === "target" && c.answer.verdict === "right");
  if (progress) s.noStart = false;
  const misses = finalMisses(s, checked);
  const allowedNow = blocked ? blocked.acts : teachingActs(s, reading, rightResult, progress, misses).acts;
  const backupClose = !blocked && !rightResult && s.solved === null && allowedNow.length === 1 && allowedNow[0] === "close";
  if (!blocked && !allowedNow.includes(p.act)) {
    const allowed = teachingActs(s, reading, rightResult, progress, misses);
    return no(allowed.code, allowed.reason, allowed.acts);
  }

  // 3. The ladder after this reading: failures and requests raise what help is allowed; right steps move on.
  const scoring = !blocked;
  const ladder = { ...s.ladder };
  const done = [...s.done];
  const passed = [...(s.passed ?? [])];
  let failed = false;
  let regroup = regroupOf(s);
  if (pkg && scoring) {
    // A copy of the step Maya showed at H3 moves the ladder on, with no credit (copiedStep).
    const copied = copiedStep(s);
    if (copied && !passed.includes(copied)) passed.push(copied);
    for (const { answer: a, problem } of checked) {
      if (problem !== "target") continue;
      if (a.verdict === "right" && a.step !== "result" && !done.includes(a.step)) done.push(a.step);
      // An equal fraction is not a failed attempt (#407).
      if (a.verdict === "wrong" && committedValue(s, a) && !(a.step === "result" && isEqualForm(pkg, a.value))) failed = true;
    }
    // An equal fraction shows every work step done: the final step simplifies the child's own fraction (#407).
    if (equal) for (const st of workSteps(pkg)) if (!done.includes(st.id)) done.push(st.id);
    regroup = regroupAfter(s, checked, done);
    const next = guideStep(pkg, [...done, ...passed], regroup);
    if (next !== ladder.step) Object.assign(ladder, { step: next, hint: -1, unlocked: Math.max(0, ladder.hint - 1), failures: 0 });
    if (failed) {
      ladder.failures += 1;
      ladder.unlocked = Math.max(ladder.unlocked, Math.min(4, ladder.hint + 1));
    }
    if (reading.help === "more") ladder.unlocked = Math.max(ladder.unlocked, Math.min(4, ladder.hint + 1));
    // A child who says they are stuck asks for more help, read by code too: the model's reading often leaves it out
    // ("I don't know about the ten.", #605 practice run 2: C24-r2, C04-r1). A right answer to this step is not stuck.
    const rightHere = checked.some((c) => c.problem === "target" && c.answer.step === ladder.step && c.answer.verdict === "right");
    if (s.turn && asksForHelp(s.turn.text) && !rightHere) ladder.unlocked = Math.max(ladder.unlocked, Math.min(4, ladder.hint + 1));
    // A question about the carry ("What do I do with the 1 I carried?") asks for help too: Maya answers it with code's
    // line, never the same invitation again (first-ship practice, C26).
    if (s.turn && asksWhy(s.turn.text) && !rightHere) ladder.unlocked = Math.max(ladder.unlocked, Math.min(4, ladder.hint + 1));
    // "Show me" can unlock the shown step without counting a miss.
    if (reading.help === "show") ladder.unlocked = Math.max(ladder.unlocked, ladder.hint >= 3 ? 4 : 3);
    // A lost carry is a located error: its regroup line (H1) is allowed at once.
    if (pendingRegroup(regroup).some((c) => c.at === ladder.step)) ladder.unlocked = Math.max(ladder.unlocked, 1);
  }

  const main = isTeaching(s.state) ? s.state : s.resume;
  // The step a guide or an example step is about comes before its words: its lines are that step's lines.
  if (p.act === "example_step") {
    const next = pkg!.easierExample.steps[main === "ASSESS" ? 0 : s.exampleShown];
    if (p.step !== next.id) return no("wrong_step", `The next example step is "${next.id}".`, allowedNow);
  }
  const regroupNote = pendingRegroup(regroup).some((c) => c.at === ladder.step) ? ` The child has not regrouped there: say "step.regroup" for "${ladder.step}" before any line about a carried digit.` : "";
  if (p.act === "guide" && p.step !== ladder.step) return no("wrong_step", `Guide the next step or required carry explanation: "${ladder.step}".${regroupNote}`, allowedNow);
  if (p.act === "accept_answer" && !rightResult) return no("accepts_wrong_answer", "Only a right final answer the child said and kept can be accepted.", allowedNow);

  // 4. Maya's words and board: lines code writes for this act, step and level, and warm talk with no math in it.
  const view: View = { steps: [ladder.step], done, checked, rightResult, equal, regroup: pendingRegroup(regroup), regroupSaid: regroup.said, regroupTimes: regroup.times };
  const forcedOpening = p.act === "open" && s.confirmWorkbook && pkg ? workbookOpening(pkg) : null;
  // Do not select or record model wordings that this fixed opening will not say.
  const spoken: Spoken | { code: RefusalCode; reason: string } = forcedOpening
    ? { text: forcedOpening, lines: [], boards: [], replaced: 0, talk: [], segments: [{ kind: "math", text: forcedOpening }], chosen: [] }
    : p.act === "safety" ? { text: "", lines: [], boards: [], replaced: 0, talk: [], segments: [], chosen: [] } : speak(s, p, view, reviews);
  if ("code" in spoken) return no(spoken.code, spoken.reason, allowedNow);
  const say = spoken.text;
  if (say === "" && !["wait", "safety"].includes(p.act)) return no("invalid_proposal", "Maya needs words for this act.", allowedNow);
  if (s.noBoard && (p.draw?.length || p.board?.length)) return no("board_not_allowed", "The child cannot see the board. Use spoken help.", allowedNow);
  const role: Problem = p.act === "example_step" ? "example" : "target";
  // The board (R374-6-1, D-197): Maya picks board offers by id (`draw`) and code builds every command from the checked
  // worked step; a command the model built is refused, with free talk on or off. Only the board core's tests read the
  // model's own commands (`modelBoard`).
  if (p.board && !s.modelBoard) {
    return no("board_not_code", "Maya does not build board commands: pick code's board offers with `draw` (see drawOffers).", allowedNow);
  }
  const drawn = p.draw ? drawBoard(s, p, view, spoken) : [];
  if (typeof drawn === "string") return no("board_not_code", drawn, allowedNow);
  const commands = [...(p.board ?? []), ...drawn];
  const pb: Proposal = { ...p, board: commands.length > 0 ? commands : undefined };
  let roles: Record<string, Problem> = {};
  if (pb.board) {
    if (!BOARD_ACTS.includes(p.act)) return no("board_not_allowed", `Maya does not draw during ${p.act}.`, allowedNow);
    const board = boardRoles(s, role, pb.board);
    if (typeof board === "string") return no("board_wrong_problem", board, allowedNow);
    roles = board;
  }
  const released = s.solved !== null || s.assistance.includes("answer_given") || rightResult;
  if (pkg !== null && !released && p.act !== "safety" && revealsAnswer(s, pb, spoken, forcedOpening)) {
    return no("reveals_answer", "Maya may not give the answer yet.", allowedNow);
  }
  const bad = pb.board ? boardProblem(s, pb.board, role, spoken, done) : null;
  if (bad) return no(bad.code, bad.reason, allowedNow);

  // 5. The act.
  let text = say;
  switch (p.act) {
    case "open":
      if (!p.parts.some((part) => "line" in part && part.line === "open.hello")) return no("missing_disclosure", "The opening says Maya is an AI: use the open.hello line.", allowedNow);
      s.opened = true;
      break;
    case "clarify":
      s.clarified = true;
      moveTo(s, "ASSESS");
      break;
    case "example_step": {
      const index = main === "ASSESS" ? 0 : s.exampleShown;
      const next = pkg!.easierExample.steps[index];
      if (p.step !== next.id) return no("wrong_step", `The next example step is "${next.id}".`, allowedNow);
      // The child must hear that a new, easier problem starts (practice run 5, F06: "Like this. Add the ones: 8 + 5 = 13."
      // with no word that 18 + 15 is another problem).
      const intro = spoken.chosen.some((o) => o.line === "example.intro");
      const worked = spoken.chosen.some((o) => o.line === "example.step");
      if (index === 0 && !s.exampleIntroduced && !intro) {
        return no("line_not_offered", "The easier example starts with its intro line (example.intro), before its first step.", allowedNow);
      }
      if (!worked) {
        if (index !== 0 || s.exampleIntroduced || !intro) return no("line_not_offered", "Say the next worked example step.", allowedNow);
        s.exampleIntroduced = true;
        moveTo(s, "MODEL_EXAMPLE");
        break; // The introduction is not a worked step. The automatic first step is still owed.
      }
      s.exampleIntroduced = true;
      s.exampleShown = index + 1;
      s.assistance.push("worked_example");
      moveTo(s, "MODEL_EXAMPLE");
      break;
    }
    case "try_target":
      if (s.exampleShown === pkg!.easierExample.steps.length) s.retried = true;
      moveTo(s, "TRY_TARGET");
      break;
    case "guide": {
      if (p.step !== ladder.step) return no("wrong_step", `Guide the first step the child has not done: "${ladder.step}".`, allowedNow);
      if (p.level === undefined) return no("invalid_proposal", "A guide needs a hint level.", allowedNow);
      if (s.turn && asksForHelp(s.turn.text) && s.ladder.hint >= 0 && p.level === 0 && spoken.chosen.some((o) => o.line === "check.thinking")) return no("same_hint_again", "The child asked for help: move on to the next safe help.", allowedNow);
      // A child with a located error can start at H2 at most; otherwise help rises one level per failure or request.
      // Code's fallback for a child still stuck on this step rises one level per child turn (#605), never on silence.
      const stuck = fallback && s.turn !== null ? Math.min(3, helpHint(s) + 1) : -1;
      const feedbackHelp = checked.some((c) => c.problem === "target" && c.answer.verdict === "wrong") ? Math.min(3, ladder.hint + 1) : -1;
      const cap = Math.max(stuck, feedbackHelp, (main === "ASSESS" || main === "TRY_TARGET") && ladder.hint === -1 ? Math.max(ladder.unlocked, 2) : ladder.unlocked);
      // The operation line after the child said this step's own setup ("so 2 plus 3 plus 1?") only says it back: it
      // is allowed at any cap and is no new help (#605 practice run 1: C01-r2, F04-r3).
      // A check of the child's own right answer (check.together, check.guess, #605) may ask the step's question (up to
      // H2: "Let's check it together. What is 7 + 9?"); it checks an answer the child gave, so it is no new help either.
      const checking = spoken.chosen.some((o) => o.line === "check.together" || o.line === "check.guess") && p.level <= 2;
      const echo = checking || (s.turn !== null && spoken.chosen.length > 0 && spoken.chosen.every((o) => o.line === "step.operation") &&
        saidSetup(pkg!, ladder.step, s.turn.text));
      if (p.level > cap && !echo) return no("hint_too_high", `Help may rise to H${cap} now: more help needs a failed attempt or a request, not silence.`, allowedNow);
      if (echo) {
        moveTo(s, s.solved !== null ? "CHECK" : "GUIDE_TARGET");
        break;
      }
      // The regroup explanation is new help for a child who lost the carry, whatever level the ladder is on.
      const regroupNow = spoken.chosen.some((o) => o.line === "step.regroup" || o.line === "step.why" || o.line === "step.order");
      if (s.turn && asksWhy(s.turn.text) && offersFor(s, "guide", view).some(o => o.line === "step.why") &&
          !spoken.chosen.some(o => o.line === "step.why")) {
        return no("line_not_offered", "The child asked why the carry or trade works: use the offered step.why explanation before another prompt.", allowedNow);
      }
      // A question about the carried digit on the column that takes it ("What do I do with the 1 I carried?") is answered
      // with a line about that carry, never the same invitation again (first-ship practice, C26).
      const carryLine = (o: LineOffer) => o.line === "step.why" || o.line === "step.regroup" || (o.line === "step.point" && o.key === "point.add.carry");
      if (s.turn && asksWhy(s.turn.text) && offersFor(s, "guide", view).some((o) => carryLine(o) && o.slots.step === ladder.step && (o.level ?? 0) <= cap) &&
          !spoken.chosen.some(carryLine)) {
        return no("line_not_offered", "The child asked about the carried digit: answer with the offered line about it (step.point, step.regroup or step.why) before another prompt.", allowedNow);
      }
      if (ladder.failures >= 2 && p.level <= ladder.hint && !regroupNow) return no("same_hint_again", `Two attempts failed at H${ladder.hint}: give more help or offer to stop.`, allowedNow);
      if (p.level > ladder.hint) ladder.failures = 0;
      ladder.hint = Math.max(ladder.hint, p.level);
      ladder.unlocked = Math.max(ladder.unlocked, p.level);
      s.highestHint = Math.max(s.highestHint ?? 0, p.level) as HintLevel;
      if (p.level >= 1) {
        s.hints += 1;
        s.stuckStep ??= ladder.step;
        s.assistance.push(p.level >= 3 ? "guided" : "hint");
      }
      // Once the answer stands, a guide only explains (a carry at a completed column): the check, with its paper and
      // close acts, goes on (R410-6). GUIDE_TARGET would ask for an answer the child already gave.
      moveTo(s, s.solved !== null ? "CHECK" : "GUIDE_TARGET");
      break;
    }
    case "accept_answer":
      if (pkg && areaOffers(pkg).length) {
        // The number is accepted. Code supplies its square unit, even when the child used a length unit.
        spoken.segments = [{ kind: "math", text: areaOffers(pkg)[0].texts[0] }];
      }
      if (!rightResult) return no("accepts_wrong_answer", "Only a right final answer the child said and kept can be accepted.", allowedNow);
      // The answer alone says nothing of how the child got it, and "I'm done" next closes the call (first-ship practice,
      // C38-r1: "Well done!", then goodbye). So this turn asks, with code's own line, whatever the proposal's lines were.
      if (pkg && methodUnseen(s, done, spoken)) {
        const ask = packageLines(pkg).thinking()[0];
        const room = turnWordLimit(s) - speechWords(spoken.segments.map((o) => o.text).join(" "));
        const pool = ask.texts.map((_, i) => i).filter((i) => speechWords(ask.texts[i]) <= room);
        if (pool.length > 0) {
          const pick = pool[chooseWording(s.variety, pool.map((i) => ask.wordingIds?.[i] ?? `${ask.key}#${i}`), s.now!)];
          spoken.segments.push({ kind: "math", text: ask.texts[pick] });
        }
      }
      s.solved ??= "child";
      if (s.state !== "TIME_CLOSE") moveTo(s, "CHECK");
      break;
    case "ask_write": {
      // Once the answer stands, the act asks: for the answer on paper, or (in the check) about the work. "That's right"
      // alone asks nothing
      // (practice: "That's right: 27 + 39 = 66." after "I'm done", with no request to write).
      const writeOffered = offersFor(s, "ask_write", view).some((o) => o.line === "write.answer" || o.line === "write.yours");
      const asks = spoken.chosen.some((o) => ["write.answer", "write.yours", "check.explain", "check.thinking"].includes(o.line));
      if ((s.solved !== null || rightResult) && writeOffered && !asks) return no("invalid_proposal", "Ask the child to write the answer on paper (write.answer), or ask about their work: saying it is right again asks nothing.", allowedNow);
      if (main === "CHECK") {
        // No field reads as "uncertain", the value code's fallback uses: refusing it cost a repair that often lost the
        // write line (#605 practice run 2: 32 of 63 calls; C09-r2, F02-r2).
        const understanding = p.understanding ?? "uncertain";
        // A child who says they guessed showed no understanding, whatever the answer (#605).
        if (understanding === "evidence_observed" && s.turn && saysGuess(s.turn.text)) {
          return no("invalid_proposal", "The child says they guessed, so understanding stays uncertain.", allowedNow);
        }
        if (understanding === "evidence_observed" && (s.answerGivenFirst || s.solved !== "child")) {
          return no("invalid_proposal", s.answerGivenFirst ? "Maya gave the answer, so understanding stays uncertain."
            : "The child's answer is not the checked answer now, so understanding stays uncertain.", allowedNow);
        }
        s.understanding = understanding;
      }
      s.writeAsked = true;
      if (s.state !== "TIME_CLOSE") moveTo(s, "WRITE_CLOSE");
      break;
    }
    case "close":
      if (backupClose || p.parts.some((part) => "line" in part && part.line === "close.stuck")) {
        const alone = pkg !== null && closeExpressionContainsAnswer(pkg.operation, pkg.answer.value);
        if (p.parts.length !== (alone ? 1 : 2) || !("line" in p.parts[0]) || p.parts[0].line !== "close.stuck" ||
            (!alone && (!("line" in p.parts[1]) || p.parts[1].line !== "close.together"))) {
          return no("line_not_offered", alone ? "Close with close.stuck only." : "Close with close.stuck and close.together in order.", allowedNow);
        }
      }
      if (backupClose) s.stuckStep ??= ladder.step;
      // The honest close after help alone (#735): its own line, which holds no answer.
      if ((stuckWayOut(s, reading, rightResult) === "close" || (s.state === "TIME_CLOSE" && !blocked && s.solved === null)) && !spoken.chosen.some((o) => o.line === "close.stuck")) {
        return no("line_not_offered", "Close honestly with close.stuck: this one is hard, it is fine to stop, and what to try next. No answer.", allowedNow);
      }
      break;
    case "safety":
      // The guidance is code's policy message, never the model's words.
      delete s.scopeDue;
      text = SAFETY_GUIDANCE[s.safety.severity!];
      s.safety.guided = true;
      moveTo(s, "SAFETY");
      break;
    case "confirm": {
      s.confirmTries += 1;
      s.mishearing.confirmations += 1;
      const asked = spoken.chosen.filter((o) => o.line === "confirm.heard" || o.line === "confirm.which");
      // After a claim judged wrong (a confirm only an unclear hearing allows), a yes gives no number.
      s.heardAsked = !claimJudgedWrong(s) && asked.length === 1 && asked[0].line === "confirm.heard" && asked[0].slots.heard ? valuesIn(asked[0].slots.heard, readOptionsFor(pkg))[0] ?? null : null;
      const total = stepSaidUnheard(s) ? stepConfirmable(s) : null;
      s.stepAsked = total && s.heardAsked && saidAs(total, s.heardAsked) ? s.heardAsked : null;
      enterInterrupt(s, "CONFIRM_HEARD");
      break;
    }
    case "offer_other_input":
      s.offeredOtherInput = true;
      enterInterrupt(s, "CONFIRM_HEARD");
      break;
    case "wait":
      enterInterrupt(s, "WAIT_WRITE");
      break;
    case "check_in":
      break;
    case "redirect":
      // A request for harmful content gets the decline line (#383, C29); the decline is only for that.
      if (reading.unsafeRequest && !spoken.chosen.some((o) => o.line === "redirect.decline")) {
        return no("decline_first", "The child asked for content Maya never gives: say the decline line (redirect.decline).", allowedNow);
      }
      if (!reading.unsafeRequest && spoken.chosen.some((o) => o.line === "redirect.decline")) {
        return no("line_not_offered", "The decline line is only for a request for sexual, violent or other harmful content (reading.unsafeRequest).", allowedNow);
      }
      if (s.scopeDue && (reading.unsafeRequest || spoken.chosen.some(o => o.line === "redirect.workbook"))) {
        if (spoken.chosen.some(o => o.line === "redirect.workbook")) (s.scopeRefusals ??= []).push({ at: s.turn?.at ?? s.now!, reason: s.scopeDue });
        delete s.scopeDue;
      }
      s.redirects += 1;
      enterInterrupt(s, "REDIRECT");
      break;
    case "repair":
      moveTo(s, s.resume ?? "TIME_CLOSE");
      break;
  }

  // After the worked example, try_target hands the target back. It has no checking line for a target reading yet.
  if (scoring && checked.some(c => c.problem === "target" && c.answer.verdict === "wrong" &&
        !(c.answer.step === "result" && pkg && isEqualForm(pkg, c.answer.value))) &&
      ["guide", "try_target", "clarify"].includes(p.act) &&
      !(main === "MODEL_EXAMPLE" && p.act === "try_target") &&
      !spoken.chosen.some(o => ["check.not_yet", "step.point", "step.operation", "step.regroup", "step.why", "step.order"].includes(o.line) ||
        (o.line === "step.invite" && o.slots.step === "result") ||
        (o.line === "check.right_step" && checked.some(c => c.answer.step === o.slots.step && c.answer.verdict === "right")))) {
    return no("invalid_proposal", "Respond to the checked wrong work with check.not_yet or a concrete step question before a generic invitation.", allowedNow);
  }

  // The child's own method, named back once, in place of a warm reply (C09 at 361a05c9: "I hear you." after the child
  // explained 27 + 40 - 1): only a method code recognises (namedMethod), on the accept or after the answer stands.
  if (pkg && !s.methodNamed && (p.act === "accept_answer" ? rightResult : p.act === "ask_write" && s.solved !== null)) {
    const m = namedMethod(s);
    if (m) {
      const rest = spoken.segments.filter((x) => x.kind !== "warm" && x.kind !== "talk");
      const room = turnWordLimit(s) - speechWords(rest.map((o) => o.text).join(" "));
      const pool = m.texts.map((_, i) => i).filter((i) => speechWords(m.texts[i]) <= room);
      if (pool.length > 0) {
        const pick = pool[chooseWording(s.variety, pool.map((i) => m.wordingIds?.[i] ?? `${m.key}#${i}`), s.now!)];
        const at = p.act === "accept_answer" ? rest.findIndex((x) => x.kind === "math") + 1 : 0;
        spoken.segments = [...rest.slice(0, at), { kind: "math", text: m.texts[pick] }, ...rest.slice(at)];
        s.methodNamed = true;
      }
    }
  }

  // 6. The assembled turn, with every line code added, checked in one place before anything is said (D-196,
  // R374-3-1): a turn with math takes warm talk only from the bank, and only before its first math line.
  if (p.act !== "safety") {
    const order = assembledProblem(spoken.segments, CODE_MATH_ACTS.includes(p.act));
    if (order) return no(order.code, order.reason, allowedNow);
    text = spoken.segments.map((x) => x.text).join(" ");
    if (s.noBoard && /\b(?:board|look|watch|see|show me|follow along)\b/i.test(text)) return no("board_not_allowed", "Use only spoken help. No visual action is available.", allowedNow);
  }

  if (p.act !== "safety" && !backupClose && speechWords(text) > turnWordLimit(s)) {
    return no("turn_too_long", `This turn has ${speechWords(text)} spoken words. The limit is ${turnWordLimit(s)}.`, allowedNow);
  }
  if (s.replies?.length && p.act === "redirect") {
    s.replies.shift();
  }

  // 7. Committed: the reading counts now (its answers only when they were judged).
  if (reading.correctsHearing) s.mishearing.corrections += 1;
  if (s.turn && checked.length > 0) s.workAttempts = (s.workAttempts ?? 0) + 1;
  if (reading.paper) s.paper = reading.paper === "written" ? "child_confirmed" : "declined";
  for (const { answer: a, problem } of checked) {
    if (problem === "target" && a.step === "result") s.lastResult = a.verdict;
    // The child's own form of a right answer (#407): Maya says it back and asks for it on paper in that form.
    if (problem === "target" && a.step === "result" && a.verdict === "right" && pkg) s.answerForm = sameValue(a.value, pkg.answer.value) ? null : a.value;
  }
  if (equal) s.equalForm = equal;
  if (scoring) {
    if (failed) s.stuckStep ??= ladder.step;
    s.done = done;
    if (passed.length > 0) s.passed = passed.filter((id) => !done.includes(id));
    s.ladder = ladder;
    s.finalMisses = misses;
  }
  // Each explanation belongs to exactly one carry, not to either adjacent column's other carry.
  const explained = spoken.chosen.filter((o) => o.line === "step.regroup" && o.slots.step).flatMap((o) => pkg ? pairOf(pkg, o.slots.step!, o.slots.other === "carry") : []);
  const times = { ...regroup.times };
  for (const c of explained) times[carryKey(c)] = (times[carryKey(c)] ?? 0) + 1;
  // A subtraction's regroup line has no carry state: it is counted by its step.
  for (const o of spoken.chosen) if (o.line === "step.regroup" && o.slots.step && explained.length === 0) times[o.slots.step] = (times[o.slots.step] ?? 0) + 1;
  s.regroup = { due: regroup.due, said: [...regroup.said, ...explained.filter((c) => !regroup.said.some((v) => sameCarry(c, v)))], times };
  s.regroupDue = [...new Set(regroup.due.map((c) => c.at))];
  s.regroupSaid = [...new Set(s.regroup.said.map((c) => c.in))];
  if (p.act !== "confirm") {
    delete s.heardAsked;
    delete s.stepAsked;
  }
  if (p.act !== "confirm" && p.act !== "offer_other_input") {
    s.confirmTries = 0;
    s.offeredOtherInput = false;
  }
  s.boardRoles = { ...s.boardRoles, ...roles };
  // Repairs and the AI disclosure do not answer the child's pending turn.
  const doneAfterAnswer = p.act === "accept_answer" && s.turn !== null &&
    saysDone(s.turn.text, readOptionsFor(pkg), pkg?.answer.value);
  if (p.act !== "repair" && p.act !== "open" && !doneAfterAnswer) {
    s.turn = null;
    delete s.mathClaim;
  }

  if (text !== "") {
    effects.push({ kind: "say", act: p.act, text, ...(spoken.replaced > 0 ? { talkReplaced: spoken.replaced } : {}), ...(spoken.talk.length > 0 ? { talk: spoken.talk } : {}) });
    s.turns.push({ at: s.now!, speaker: "maya", text, state: p.act === "close" ? "CLOSE" : s.state, act: p.act });
  }
  if (pb.board) {
    s.batches += 1;
    effects.push({ kind: "board", batch: { transactionId: `${s.callId}-b${s.batches}`, commands: pb.board } });
  }

  if (s.replies?.length && p.act === "redirect") {
    s.expect = "maya";
    s.silence = "none";
  } else if (p.act === "close") {
    end(s, backupClose ? "child_stopped" : closeCause(base), effects, false);
  } else if (doneAfterAnswer || p.act === "safety" || (p.act === "example_step" && s.exampleShown < pkg!.easierExample.steps.length)) {
    s.expect = "maya";
    s.silence = "none";
  } else if ((p.act === "repair" || p.act === "open") && s.turn) {
    if (p.act === "open") moveTo(s, "ASSESS");
    s.expect = "maya";
    s.silence = "none";
  } else if (p.act === "check_in") {
    s.expect = "child";
    s.waitingSince = s.now;
    s.silence = "checked";
  } else {
    waitForChild(s);
  }
  return { session: s, effects, refusal: null };
}

/**
 * The child's turn shows how they got the answer with a number the question's columns never use ("I did 27 plus 40,
 * then took away one": 40), so they did not work it in columns: no column question doubts it (C09).
 */
function otherMethod(s: Session, text: string): boolean {
  const pkg = s.package;
  if (!pkg || !SHOWS_METHOD.test(text)) return false;
  const own = new Set<number>();
  const walk = (x: unknown) => {
    if (typeof x === "number") own.add(x);
    else if (Array.isArray(x)) x.forEach(walk);
    else if (x && typeof x === "object") Object.values(x).forEach(walk);
  };
  walk(pkg.steps);
  walk(pkg.operation.operands);
  walk(pkg.answer.value);
  return valuesIn(text, readOptionsFor(pkg)).some((v) => v.type === "number" && !own.has(v.value));
}

/** Words that show how the child got an answer, though they hold no number ("I used eighths"). */
const SHOWS_METHOD = /\b(?:because|since|cause|cuz|coz|used|using|carr(?:y|ied|ying)|regroup\w*|borrow\w*|trad(?:e|ed|ing)|add(?:ed|ing)|subtract\w*|multipl\w*|divid\w*|common|changed|counted|first|then)\b/i;

/**
 * The accept turn should ask how the child got the answer: no work step is done, the child's turn shows no working, the
 * lines chosen ask nothing, and the child is not done and time is not up (#605: "I'm done" gets a warm close).
 */
function methodUnseen(s: Session, done: readonly string[], spoken: Spoken): boolean {
  if (!s.turn || !s.package || done.length > 0 || s.state === "TIME_CLOSE") return false;
  // The area's reply is one fixed sentence with its square unit (C40); a turn of the model's own words holds no math line,
  // and adding one would refuse the turn.
  if (areaOffers(s.package).length > 0 || !spoken.chosen.some((o) => o.line === "answer.right")) return false;
  if (spoken.chosen.some((o) => o.line === "check.explain" || o.line === "check.thinking")) return false;
  const opts = readOptionsFor(s.package);
  if (saysDone(s.turn.text, opts, s.package.answer.value) || SHOWS_METHOD.test(s.turn.text)) return false;
  const read = turnRead(s);
  return read.final !== null && read.kept.every((v) => sameValue(v, read.final!));
}

/**
 * The compensation method in the child's own words (C09: "I did 27 plus 40, then took away one"), as the line that names
 * it back, or null. Only a form code recognises: the turn says an operand's nearest ten and how far apart they are, with a
 * word for taking away (the ten is more) or adding back (the ten is less), and no negation, hedge or other speaker. The
 * line's numbers come from the checked package (compensations), never from the turn.
 */
function namedMethod(s: Session): LineOffer | null {
  const pkg = s.package;
  if (!pkg || !s.turn) return null;
  const text = s.turn.text.toLowerCase().replace(/’/g, "'").trim();
  if (text.includes("?") || text.includes("\n")) return null;
  const number = "([a-z0-9-]+(?: [a-z0-9-]+)?)";
  const forms = compensations(pkg);
  const offers = packageLines(pkg).method();
  const at = forms.findIndex((m) => {
    const prefix = `(?:because ${number} is one less than ${number}\\. so )?`;
    const first = `(?:i added ${number}|i did ${number} plus ${number})`;
    const second = m.up ? `(?:added ${number}(?: back)?)` : `(?:took away ${number}|took ${number} away)`;
    const ending = `(?:[,.] (?:and )?i got ${number})?\\.?`;
    const match = new RegExp(`^${prefix}${first}(?:,? then |\\. then i | and )${second}${ending}$`).exec(text);
    if (!match) return false;
    const [, from, to, added, operand, rounded] = match;
    const correction = m.up ? match[6] : match[6] ?? match[7];
    const result = m.up ? match[7] : match[8];
    if (from && (plainNumber(from) !== m.b || plainNumber(to) !== m.round || m.diff !== 1 || m.up)) return false;
    if (plainNumber(added ?? rounded) !== m.round) return false;
    if (operand && (pkg.operation.kind !== "add" || !pkg.operation.operands.some((v) => typeof v === "number" && v !== m.b && v === plainNumber(operand)))) return false;
    if (plainNumber(correction) !== m.diff) return false;
    return !result || (pkg.answer.value.type === "number" && plainNumber(result) === pkg.answer.value.value);
  });
  return at >= 0 ? offers[at] : null;
}

/** The number a plain yes gives in this turn ("Did you say 66?", "Yes."), or null (#605). */
function yesValue(s: Session): AnswerValue | null {
  // Only a whole turn of plain yes. "Yes, 66." is read by readAnswer as usual; any other yes ("Yes, I think 66 is
  // right.") is not sure, so Maya asks again (PR #624 review: a wider yes accepted "Yes, I have no clue if 66 is right.").
  return s.heardAsked && s.turn && saysYes(s.turn.text) ? s.heardAsked : null;
}

/**
 * What a plain yes gives, as a reading's answer, or null: the right final answer, or the step's value that Maya asked about
 * (stepTurnHeard), whatever the model reads. A yes to a wrong number gives nothing here: the model judges it.
 */
function yesAnswer(s: Session): ChildAnswer | null {
  const value = yesValue(s);
  if (!value || s.solved !== null || !s.package) return null;
  if (rightForQuestion(s.package, value)) return { value, step: "result", verdict: "right" };
  const st = workSteps(s.package).find((x) => !behind(s).includes(x.id));
  return st && stepTurnHeard(s, st, value) ? { value, step: st.id, verdict: "right" } : null;
}

/**
 * Each sentence the child kept that holds this step value names only the question's own numbers (its operands and the
 * numbers of its worked steps), its answer, or a digit the child points at ("carry the ten"). Any other
 * number beside it ("I wrote 5") leaves the step not right: Maya asks (PR #624 review round 3).
 */
function ownSentences(pkg: OperationPackage, step: WorkedStep, value: AnswerValue, text: string): boolean {
  const own = new Set<number>();
  const walk = (x: unknown) => {
    if (typeof x === "number") own.add(x);
    else if (Array.isArray(x)) x.forEach(walk);
    else if (x && typeof x === "object") Object.values(x).forEach(walk);
  };
  walk(step);
  // The numbers the step shows ("12 − 8 = 4": the regrouped 12 is no field of the step), and the question's own numbers
  // (its operands and worked steps): one sentence may cover two columns ("I write 6 and carry 1, then 2 plus 3 plus 1 is 6").
  for (const v of valuesIn(stepText(step, pkg.operation))) if (v.type === "number") own.add(v.value);
  const opts = readOptionsFor(pkg);
  const operandOptions = { ...opts, operands: true };
  const ownFractions = [...readNumbers(operationText(pkg.operation), operandOptions).values, ...readNumbers(stepText(step, pkg.operation), operandOptions).values]
    .filter(v => v.type === "fraction" || v.type === "mixed");
  for (const n of opts.known ?? []) own.add(n);
  // A child may add a column's digits before adding its incoming carry.
  // These intermediate sums come from checked columns, never from model text.
  for (const st of pkg.steps) if (st.kind === "add-column") own.add(st.digits.reduce((a, b) => a + b, 0));
  return numberSentences(text, opts).every((sentence) => {
    // "1 ten", "6 ones": a place word after a number names its place, not another number.
    const r = readNumbers(sentence.replace(/(\d|\b(?:one|two|three|four|five|six|seven|eight|nine))\s+(?:tens?|ones?|hundreds?)\b/gi, "$1"), opts);
    if (!r.values.some((v) => saidAs(v, value))) return true;
    return !r.unreadable && r.values.every((v, i) => r.notAnswer[i] || (v.type === "number" && own.has(v.value)) || ownFractions.some(known => saidAs(v, known)) || saidAs(v, value) || saidAs(v, pkg.answer.value));
  });
}

const CLAIM_WORDS = "zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand";
const CLAIM_NUMBER = new RegExp(`^\\s+(?:(?:down|the|a|an|number|digit|it|as)\\s+)*([+-]?(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?|(?:${CLAIM_WORDS})(?:[ -](?:${CLAIM_WORDS}))*)\\b`, "i");
const CLAIM_VERB = /\b(?:write|writes|wrote|written|writing|put|puts|putting|carry|carried|carrying)\b/gi;
const COLUMN_WORDS = "ten thousands|hundred thousands|millions|ones|tens|hundreds|thousands|tenths|hundredths|thousandths";
const CLAIM_PLACE = new RegExp(`\\b(in|into|under|at|on|for|to|from)\\s+(?:the\\s+)?(${COLUMN_WORDS})\\b`, "gi");
const CLAIM_COLUMN = new RegExp(`\\b(${COLUMN_WORDS})\\b`, "gi");
const BARE_COLUMN = new RegExp(`^\\s*(?:the\\s+)?(${COLUMN_WORDS})\\b`, "i");
const CLAIM_RELATION = new RegExp(`^(?:${CLAIM_PLACE.source}|${BARE_COLUMN.source}|(?:in|into|under|at|on|for|to|from)\\b)`, "i");
const CARRIED_REFERENCE = /\bthe\s+([^\s.,;!?]+(?:[ -][^\s.,;!?]+)??)\s+(?:that\s+)?(?:i|we)\s+$/i;
const CLAIM_END = /[.,;!?\n]|\b(?:and|then)\b/i;
function claimPlaces(text: string) {
  const places = [...text.matchAll(CLAIM_PLACE)].map((m) => ({ prep: m[1].toLowerCase(), place: m[2].toLowerCase() }));
  const bare = BARE_COLUMN.exec(text);
  if (bare) places.unshift({ prep: "", place: bare[1].toLowerCase() });
  return places;
}
interface ColumnClaim { index: number; carry: boolean; incoming: boolean; numberText: string; value: number | null; tail: string }

/** One shared reader for written digits, totals and carries. A numeric claim it cannot read stays uncertain. */
function columnClaims(text: string): ColumnClaim[] {
  const verbs = [...text.matchAll(CLAIM_VERB)];
  return verbs.flatMap((verb, i) => {
    const before = text.slice(0, verb.index);
    const preceding = /^carried$/i.test(verb[0]) ? CARRIED_REFERENCE.exec(before) : null;
    const reference = preceding && CLAIM_NUMBER.exec(` ${preceding[1]}`)?.[0].trim() === preceding[1] ? preceding : null;
    const incoming = /^carried$/i.test(verb[0]) && (!!reference || /\bthe\s+$/i.test(before));
    let rest = (reference ? ` ${reference[1]}` : "") + text.slice(verb.index! + verb[0].length, verbs[i + 1]?.index);
    if (/\bwhere\s+$/i.test(before) && /^[\s?!.]*$/.test(rest)) return [];
    const joinedDigits = /\d(?:\.{2,}|…)\d/.test(rest);
    rest = rest.replace(/\.{2,}|…/g, " ");
    let continuation = false;
    const claims: ColumnClaim[] = [];
    while (rest.trim() || claims.length === 0) {
      // Read the number before cutting the clause, so punctuation inside it cannot hide its column.
      const match = CLAIM_NUMBER.exec(rest);
      const after = match ? rest.slice(match[0].length) : rest;
      const end = CLAIM_END.exec(after);
      const tail = end ? after.slice(0, end.index) : after;
      const remainder = end ? after.slice(end.index + end[0].length).replace(/^[\s.,;!?\n]+/, "") : "";
      const splitRelation = !!end && /^[.,;!?\n]$/.test(end[0]) && CLAIM_RELATION.test(remainder);
      if (continuation && /^\s*(?:i|we|add|added|subtract|subtracted|multiply|multiplied)\b/i.test(rest)) break;
      const expression = /^\s*(?:[+×−=]|\b(?:plus|minus|times|is|equals?|makes?)\b)/i.test(tail);
      if (continuation && expression) break; // The next arithmetic clause is not another written digit.
      const numbers = readNumbers(match ? match[1] : tail);
      const number = numbers.values[0];
      const value = match && !joinedDigits && !splitRelation && (!expression || incoming) && (!continuation || claimPlaces(tail).length > 0)
        && !numbers.unreadable && numbers.values.length === 1 && number?.type === "number" ? number.value : null;
      claims.push({ index: verb.index!, carry: /^(?:carry|carried|carrying)$/i.test(verb[0]), incoming, numberText: match?.[1] ?? "", value, tail });
      if (!end || end[0].toLowerCase() !== "and") break;
      rest = after.slice(end.index + end[0].length);
      continuation = true;
    }
    return claims;
  });
}

/** A written digit or carry has a role, even when its number occurs elsewhere in the question. */
function checkColumnClaims(pkg: OperationPackage, step: WorkedStep, steps: WorkedStep[], active: WorkedStep, text: string): "right" | "wrong" | "unclear" {
  if (!("place" in step) || !("write" in step)) return "right";
  const kept = retainedText(text, readOptionsFor(pkg));
  const claims = columnClaims(kept);
  if (claims.some((claim) => claim.value === null)) return "unclear";
  const namedColumn = (place: string) => {
    if (place === step.place) return step;
    const columns = steps.filter((s) => "place" in s && "write" in s && s.place === place);
    return columns.length === 1 ? columns[0] : null;
  };
  for (const claim of claims) {
    const n = claim.value!;
    const { tail, carry } = claim;
    const places = claimPlaces(tail);
    if ([...tail.matchAll(CLAIM_COLUMN)].length !== places.length) return "unclear";
    if (!carry && (places.length > 1 || places.some((p) => p.prep === "from"))) return "unclear";
    // An unnamed claim follows the latest column total in this turn, or the checked column when no total was stated.
    // This keeps "7 plus 9 is 16, carry the ten, 2 plus 3 plus 1 is 6" tied to the ones carry during a tens check.
    let implicit = active;
    const before = kept.slice(0, claim.index);
    const equations = [...before.matchAll(/\b(?:is|are|equals?|make|makes|got)\s+(?:equal\s+to\s+)?([^.,;!?\n]+)/gi)];
    const result = equations.at(-1);
    if (result) {
      const total = valuesIn(result[1])[0];
      const matching = steps.filter((s) => "total" in s && "write" in s && total?.type === "number" && s.total === total.value);
      if (matching.length === 1) implicit = matching[0];
    }
    const column = places.length ? namedColumn(places[0].place) : implicit;
    if (!column || !("write" in column)) return "unclear";
    if (!carry) {
      // Recording an intermediate total on paper does not say it was written in a column's answer position.
      const recorded = places.length === 0 && /\bon\s+(?:my|the)\s+paper\b/i.test(tail)
        && steps.some((s) => "total" in s && s.total === n);
      // The existing regroup path explains this mistake and removes this column from done before any progress.
      const regroup = column.kind === "add-column" && n === column.total && writesTotal(kept, column);
      if (n !== column.write && !regroup && !recorded) return "wrong";
    } else {
      // "Carry the ten" names one ten. Check every named source and destination against its own field.
      const amount = /^ten$/i.test(claim.numberText) ? 1 : n;
      if (places.length) {
        for (const end of places) {
          if (!end.prep) return "unclear";
          const target = namedColumn(end.place);
          if (!target || !("carryOut" in target)) return "unclear";
          if (amount !== (end.prep === "from" ? target.carryOut : target.carryIn)) return "wrong";
        }
      } else if (!("carryOut" in column) || amount !== (claim.incoming ? column.carryIn : column.carryOut)) return "wrong";
    }
  }
  return "right";
}

/**
 * What the child said is not clear enough to go on without asking (#605): the turn is uncertain (a form code cannot
 * read, or the adapter said so), the model read it as unclear, speech heard it two ways since Maya last spoke, it offers
 * a choice, or it holds a final answer the child is not sure of (doubt, or more than one sentence with numbers). A clear
 * step or a digit the child points at ("I carry the 1 to the tens") is none of these: Maya goes on.
 */
/** How this call reads a turn: the question's options, and what "I already said" may point back at (pointsBack). */
function readOptionsIn(s: Session): ReadOptions {
  const opts = readOptionsFor(s.package);
  const last = s.turns.map((t) => t.speaker).lastIndexOf("maya");
  const earlier = s.turns.slice(0, Math.max(0, last)).filter((t) => t.speaker === "child").flatMap((t) => valuesIn(t.text, opts));
  const done = s.package ? workSteps(s.package).filter((st) => s.done.includes(st.id)).flatMap(stepAnswers) : [];
  return { ...opts, saidBefore: [...earlier, ...done].flatMap((v) => (v.type === "number" ? [v.value] : [])) };
}

function notClear(s: Session, reading: Reading): boolean {
  if (!s.turn) return false;
  if (s.turn.uncertain || reading.unclear) return true;
  const last = s.turns.map((t) => t.speaker).lastIndexOf("maya");
  if (s.turns.slice(last + 1).some((t) => t.speaker === "child" && (t.alternatives?.length ?? 0) > 0)) return true;
  const read = readAnswer(s.turn.text, readOptionsIn(s));
  // A hedge ("I think it's 66", "maybe", a question) is not clear either, though the reader may find it sure.
  const hedged = showsDoubt(s.turn.text, readOptionsFor(s.package)) || /\b(?:i think|i guess|i believe|probably|maybe|might be)\b/i.test(s.turn.text);
  return read.choice || (read.final !== null && (!read.sure || hedged));
}

/** The child's final answer in this turn is this number ("Yes, I said 66. I'm not sure."). */
function sameFinal(s: Session, value: AnswerValue): boolean {
  const final = readAnswer(s.turn!.text, readOptionsFor(s.package!)).final;
  return final !== null && saidAs(final, value);
}

/** The child's final answer in this turn is right, but they are not sure of it (doubt, a guess, a question). */
function doubtfulRight(s: Session): boolean {
  if (!s.turn || !s.package) return false;
  const opts = readOptionsIn(s);
  const read = readAnswer(s.turn.text, opts);
  return read.final !== null && !read.sure && (showsDoubt(s.turn.text, opts) || saysGuess(s.turn.text)) && rightForQuestion(s.package, read.final);
}

/** What the child kept in this turn: their words as read, or the number their plain yes gives, which they then committed to. */
function turnRead(s: Session): AnswerRead {
  const yes = yesValue(s);
  return yes ? { kept: [yes], final: yes, choice: false, outside: [yes], sure: true } : readAnswer(s.turn!.text, readOptionsIn(s));
}

/** Whether this turn commits to a value for counting a miss or releasing an answer. */
export function committedValue(s: Session, a: ChildAnswer): boolean {
  if (!s.package || !s.turn || s.turn.uncertain) return false;
  const pkg = s.package;
  const last = s.turns.map((t) => t.speaker).lastIndexOf("maya");
  if (s.turns.slice(last + 1).some((t) => t.speaker === "child" && (t.alternatives?.length ?? 0) > 0)) return false;
  const at = problemOf(pkg, a.problem ?? "target").steps.find((step) => step.id === a.step);
  const addition = at?.kind === "add-column" && stepTurnHeard(s, at, a.value);
  const body = wholeTurn(s.turn.text);
  const bare = body?.replace(/^(?:still\s+|i got\s+|it's\s+|the answer is\s+)/, "") ?? "";
  const normalized = readOptionsFor(pkg).fractions ? writtenFractions(bare, readOptionsFor(pkg)) : bare;
  const tokens = normalized.replace(/([a-z])-(?=[a-z])/g, "$1 ").split(/\s+/).filter(Boolean);
  const numericForm = tokens.length > 0 && tokens.every((token) => /^(?:\d+(?:\.\d+)?|\.\d+|\d+\/\d+|\/)$/.test(token) || kindOf(token) !== null || token === "point" || token === "negative");
  const parsed = numericForm ? readAnswer(bare, readOptionsFor(pkg)) : null;
  if (!addition && !(parsed?.final && parsed.sure && valuesIn(normalized, readOptionsFor(pkg)).length === 1 && saidAs(parsed.final, a.value))) return false;
  if ((a.problem ?? "target") === "target") {
    if (workSteps(pkg).some((step) => (s.passed ?? []).includes(step.id) && stepAnswers(step).some((v) => equivalent(v, a.value)))) return false;
    if (s.exampleShown > 0) {
      const example = pkg.easierExample;
      const shown = [...valuesIn(example.text), ...example.steps.slice(0, s.exampleShown).flatMap(stepAnswers)];
      if (s.exampleShown >= example.steps.length) shown.push(example.answer);
      if (shown.some((v) => equivalent(v, a.value))) return false;
    }
  }
  return true;
}

/**
 * Checks the child's answers: each was said and kept in this turn (after anything taken back, not offered as a choice;
 * a final answer is the last number kept outside the child's explanations, readAnswer, D-199), and each verdict is what
 * code computes. Fills `checked`; returns the first problem.
 */
function checkAnswers(s: Session, answers: ChildAnswer[], checked: Checked[]): { code: RefusalCode; reason: string; unheard?: boolean } | null {
  const pkg = s.package!;
  if (!s.turn) return { code: "answer_not_heard", reason: "There is no child turn to read an answer from." };
  const read = turnRead(s);
  if (read.choice) return { code: "answer_not_committed", reason: "The child offered more than one answer: ask which one they mean." };
  const heard = read.kept;
  const falseResults = falseEquationResults(s.turn.text, readOptionsFor(pkg));
  for (const a of answers) {
    const problem = a.problem ?? "target";
    if (a.verdict === "wrong" && (s.turn.text.includes("?") || asksForHelp(s.turn.text) || /\b(?:help|show me)\b/i.test(s.turn.text) || showsDoubt(s.turn.text, readOptionsFor(pkg)) || saysGuess(s.turn.text))) {
      return { code: "answer_not_committed", reason: "A question or request for help does not commit to a wrong answer." };
    }
    const { operation, steps, answer } = problemOf(pkg, problem);
    const at = steps.find((x) => x.id === a.step);
    if (!at) return { code: "wrong_step", reason: `The ${problem} has no step "${a.step}".` };
    if (!heard.some((v) => saidAs(v, a.value))) return { code: "answer_not_heard", reason: `The child did not say ${valueText(a.value)}, or took it back.` };
    // A wrong final answer the child gave outside an explanation may be judged wrong although a later number is the
    // final one ("I got 56. I did 7 plus 9 is 16, so I wrote the 6. Then 2 plus 3 is 5."): never when the final one is
    // right or the answer stands, and never as right.
    // For the target, "right" follows the question's wording, and an equal fraction also stands ("14/16" for 7/8),
    // so an earlier wrong number is never scored over it (review R409-M1).
    const finalRight = read.final !== null && (problem === "target"
      ? rightForQuestion(pkg, read.final) || isEqualForm(pkg, read.final)
      : isRightAnswer(operation, answer, read.final));
    const loose = a.verdict === "wrong" && s.solved === null && !finalRight && read.outside.some((v) => saidAs(v, a.value));
    if (a.step === "result" && !saidAs(read.final ?? undefined, a.value) && !loose) {
      return { code: "answer_not_committed", reason: `${valueText(a.value)} is not the last answer the child kept (a number in their explanation is not their answer): ask which one they mean.` };
    }
    // The final answer by the question's wording (#407: an equal fraction may be right); a step by its own values.
    // PR #624 review rounds 2 and 3: a result the child states in a false equation ("7 plus 9 is 6") is never right, and a
    // step is right only in a turn with no false equation kept, where each sentence holding its value names nothing but
    // that step's own numbers ("7 plus 9 is 16, I wrote 5" is not a right ones step).
    const falseResult = falseResults.some((v) => saidAs(v, a.value));
    const active = problem === "target" ? steps.find((st) => !behind(s).includes(st.id)) ?? at : at;
    // A next-step question ("Do I put the 1 in the tens?") claims nothing written: the claims are read without it.
    const own = at.kind === "add-column" ? withoutNextStepQuestions(s.turn.text, at.carryOut) : s.turn.text;
    const claims = a.step === "result" ? "right" : checkColumnClaims(pkg, at, steps, active, own);
    if (claims === "unclear") return { code: "answer_not_committed", reason: "The written digit or carry is unclear: ask what the child wrote before judging this step." };
    const stepRight = a.step !== "result" && falseResults.length === 0 && claims === "right" && ownSentences(pkg, at, a.value, own) && answersStep(at, a.value);
    const right = !falseResult && (a.step === "result" ? (problem === "target" ? rightForQuestion(pkg, a.value) : isRightAnswer(operation, answer, a.value)) : stepRight);
    // A doubtful final answer cannot establish correct work, including an equal
    // fraction that still needs simplest form and therefore carries a "wrong" verdict.
    const checkedProgress = a.verdict === "right" || (problem === "target" && isEqualForm(pkg, a.value));
    if (checkedProgress && a.step === "result" && !read.sure) return { code: "answer_not_committed", reason: `The child was not sure of ${valueText(a.value)}: confirm it before treating it as checked progress.` };
    if (a.verdict === "right" && !right) return { code: "accepts_wrong_answer", reason: `${valueText(a.value)} is not right for ${a.step}: the checked math says otherwise.` };
    // A column step counts only when the whole turn is heard (stepTurnHeard). Beside a right final answer the child is sure
    // of ("Six, so 66."), the answer stands and the step gets no credit; any other turn goes to the confirm question.
    if (a.verdict === "right" && a.step !== "result" && problem === "target" && at.kind === "add-column" && !stepTurnHeard(s, at, a.value)) {
      // A copy of the step Maya showed at H3 is no credit and no refusal: the ladder goes past it (copiedStep).
      if (copiedStep(s) === a.step) continue;
      const answerToo = read.sure && read.final !== null && rightForQuestion(pkg, read.final) && answers.some((x) => x.step === "result" && x.verdict === "right" && (x.problem ?? "target") === "target");
      // A plan to write the two-digit sum is no credit and no hearing problem: its regroup line comes next (regroupAfter).
      if (answerToo || carryPairs(pkg).some((x) => writesTotal(s.turn!.text, x.out))) continue;
      const unheard = stepSaidUnheard(s);
      return { code: "answer_not_committed", reason: `The child's whole turn does not say ${valueText(a.value)} for ${a.step} clearly: ${unheard ? "confirm what they said (confirm)" : "help with this step, and do not say it is right"}.`, unheard };
    }
    if (a.verdict === "wrong" && right) return { code: "rejects_right_answer", reason: `${valueText(a.value)} is right for ${a.step}.` };
    // The child's sure final answer is right: never "not yet" for it as a step (practice: "I think the tens make 66."
    // got "Not yet" for the tens).
    if (a.verdict === "wrong" && a.step !== "result" && problem === "target" && read.sure && read.final && saidAs(read.final, a.value) && isRightAnswer(pkg.operation, pkg.answer, a.value)) {
      return { code: "rejects_right_answer", reason: `${valueText(a.value)} is the child's final answer, and it is right: accept it (step "result").` };
    }
    checked.push({ answer: a, problem });
  }
  return null;
}

/**
 * The child's checked wrong final answers once every work step is done, with this reading's (D-199): a wrong final
 * answer counts when the steps done, with the ones this reading checked right, are every work step.
 */
function finalMisses(s: Session, checked: readonly Checked[]): number {
  const before = s.finalMisses ?? 0;
  const pkg = s.package;
  // An equal fraction is not a wrong final answer (#407).
  if (!pkg || !checked.some((c) => c.problem === "target" && c.answer.step === "result" && c.answer.verdict === "wrong" && committedValue(s, c.answer) && !isEqualForm(pkg, c.answer.value))) return before;
  const done = [...behind(s), ...checked.filter((c) => c.problem === "target" && c.answer.verdict === "right").map((c) => c.answer.step)];
  return currentStep(pkg, done) === "result" ? before + 1 : before;
}

// ---------- Regrouping in addition ----------

/** The regroup state of a call: the columns that need it explained, and those where Maya explained it. */
interface CarryRef { out: string; in: string }
interface RegroupNeed extends CarryRef { at: string }
interface Regroup {
  due: RegroupNeed[];
  said: CarryRef[];
  /** How many times Maya said each carry's regroup line (#605). Missing in a saved session from before: none. */
  times?: Record<string, number>;
}

/** The most times Maya says one carry's regroup line (#605, practice C02: the same script again and again): once, and once more when the child denies the carry. */
const MAX_REGROUP_SAYS = 2;
const carryKey = (c: CarryRef) => `${c.out}>${c.in}`;

const sameCarry = (a: CarryRef, b: CarryRef) => a.out === b.out && a.in === b.in;

/** The columns whose regroup is due and not explained yet. */
const pendingRegroup = (r: Regroup) => r.due.filter((c) => !r.said.some((v) => sameCarry(c, v)));

/** A carry may need explaining again after its destination column is complete. Keep completed work intact. */
function guideStep(pkg: OperationPackage, done: readonly string[], regroup: Regroup): string {
  const pending = pendingRegroup(regroup);
  return workSteps(pkg).find((st) => !done.includes(st.id) || pending.some((c) => c.at === st.id))?.id ?? "result";
}

/** Old column-only explanation lists cannot distinguish adjacent carries. Restore their requirements conservatively. */
function regroupOf(s: Session): Regroup {
  if (s.regroup) return { due: s.regroup.due.map((c) => ({ ...c })), said: s.regroup.said.map((c) => ({ ...c })), times: { ...s.regroup.times } };
  const pairs = s.package ? carryPairs(s.package) : [];
  return { due: (s.regroupDue ?? []).flatMap((at) => pairs.filter((c) => c.out.id === at || c.in.id === at).map((c) => ({ out: c.out.id, in: c.in.id, at }))), said: [] };
}

/**
 * Each carry of an addition, as a pair of columns: the one whose sum makes the carry (`out`, "7 + 9 = 16" in the ones)
 * and the next one, which takes it (`in`, the tens). Empty for any other operation.
 */
function carryPairs(pkg: OperationPackage): { out: Extract<WorkedStep, { kind: "add-column" }>; in: Extract<WorkedStep, { kind: "add-column" }> }[] {
  const columns = pkg.steps.filter((st): st is Extract<WorkedStep, { kind: "add-column" }> => st.kind === "add-column");
  return columns.slice(0, -1).flatMap((out, i) => (out.carryOut > 0 && columns[i + 1].carryIn === out.carryOut ? [{ out, in: columns[i + 1] }] : []));
}

/** Both columns of the carry the line explains, without marking an adjacent carry as explained. */
function pairOf(pkg: OperationPackage, id: string, source: boolean): CarryRef[] {
  return carryPairs(pkg).filter((c) => source ? c.out.id === id : c.in.id === id).map((c) => ({ out: c.out.id, in: c.in.id }));
}

/**
 * The final answer of an addition worked with every carry left out ("27 + 39" makes 56): the answer of a child who
 * lost the carried ten. Null when the addition has no carry.
 */
function noCarryAnswer(pkg: OperationPackage): number | null {
  if (pkg.operation.kind !== "add" || carryPairs(pkg).length === 0) return null;
  const columns = pkg.steps.filter((st): st is Extract<WorkedStep, { kind: "add-column" }> => st.kind === "add-column" && st.digits.length > 0);
  return columns.reduce((n, st, i) => {
    const sum = st.digits.reduce((a, b) => a + b, 0);
    return n + (i < columns.length - 1 ? sum % 10 : sum) * 10 ** i;
  }, 0);
}

/**
 * The child says they did not carry, or asks what the carried digit is ("I didn't carry anything.", "What 1?", "What's
 * a carried one?", "I didn't write a 1"). Only ever adds an explanation, so a miss or an extra match costs nothing unsafe.
 */
const CARRY_DENIAL = /\b(?:didn'?t|did not|don'?t|do not|never|not)\b[^.!?\n]{0,30}\bcarr(?:y|ied|ying)\b|\bwhat(?:'s| is)?\s+(?:a |the |that )?(?:1|one|carr\w*)\b|\b(?:didn'?t|did not|never)\b[^.!?\n]{0,20}\bwr(?:ite|ote)\b[^.!?\n]{0,12}\b(?:1|one)\b/i;

/** The child plans to write (or wrote) a column's two-digit sum as one number ("I write 16 under the ones"). */
function writesTotal(text: string, column: Extract<WorkedStep, { kind: "add-column" }>): boolean {
  const { total, place } = column;
  if (total < 10) return false;
  const committed = committedText(text).replace(/’/g, "'");
  for (const claim of columnClaims(committed)) {
    if (claim.carry || claim.value !== total) continue;
    const before = committed.slice(0, claim.index).split(/[.!?;\n]|\bbut\b/i).at(-1) ?? "";
    if (/\b(?:not|never|no|don't|dont|didn't|didnt|won't|wont|wouldn't|shouldn't|can't|cannot)\b/i.test(before)) continue;
    if (/\b(?:should|shall|can|could|would|may|might)\s+(?:i|we)\s*$/i.test(before) || /^[^.!;\n]*\?/.test(committed.slice(claim.index))) continue;
    if (claimPlaces(claim.tail).some((p) => p.place === place && p.prep !== "from")) return true;
  }
  return false;
}

/** A writing question needs an explanation, but proves no written or completed work. */
function asksWriteTotal(text: string, column: Extract<WorkedStep, { kind: "add-column" }>): boolean {
  if (column.total < 10) return false;
  return text.replace(/’/g, "'").split(/[.!;\n]+/).some(sentence => sentence.includes("?") &&
    !/\b(?:not|no|never|don't|didn't|won't|can't|cannot)\b/i.test(sentence) &&
    columnClaims(sentence).some(claim => !claim.carry && claim.value === column.total));
}

/**
 * The regroup state after a checked reading (practice C01, C02: "What 1? I didn't carry." got "the 1 you carried"
 * again, and "I write 16 under the ones" was accepted). A column needs its regroup explained when the child's checked
 * answer for it is its sum without the carry, their final answer is the addition worked with no carry, they say they did
 * not carry, or they plan to write a column's two-digit sum as one number; that last column is not done, whatever the
 * reading says (it is taken out of `done`).
 */
function regroupAfter(s: Session, checked: readonly Checked[], done: string[]): Regroup {
  const pkg = s.package;
  const previous = regroupOf(s);
  const due = [...previous.due];
  let said = previous.said;
  const pairs = pkg ? carryPairs(pkg) : [];
  const times = previous.times ?? {};
  if (!pkg || pairs.length === 0) return { due, said, times };
  const requireCarry = (pair: (typeof pairs)[number], at: string, repeat = false) => {
    const ref = { out: pair.out.id, in: pair.in.id };
    if (!due.some((c) => sameCarry(c, ref) && c.at === at)) due.push({ ...ref, at });
    // Past its limit, the carry stays explained, so its line never comes again and no other help waits for it.
    if (repeat && (times[carryKey(ref)] ?? 0) < MAX_REGROUP_SAYS) said = said.filter((c) => !sameCarry(c, ref));
  };
  const text = s.turn?.text ?? "";
  const wrong = checked.filter((c) => c.problem === "target" && c.answer.verdict === "wrong" && c.answer.value.type === "number");
  for (const c of wrong) {
    const v = (c.answer.value as { value: number }).value;
    const pair = pairs.find((x) => x.in.id === c.answer.step);
    const sum = pair ? pair.in.digits.reduce((a, b) => a + b, 0) : null;
    if (pair && sum !== null && (v === sum || v === sum % 10)) requireCarry(pair, pair.in.id);
    if (c.answer.step === "result" && v === noCarryAnswer(pkg)) for (const x of pairs) if (!done.includes(x.in.id)) requireCarry(x, x.in.id);
  }
  const committed = committedText(text).replace(/’/g, "'");
  if (CARRY_DENIAL.test(committed)) {
    const from = /\bfrom\s+(?:the\s+)?([a-z]+)\b/i.exec(committed)?.[1].toLowerCase();
    const to = /\b(?:to|into)\s+(?:the\s+)?([a-z]+)\b/i.exec(committed)?.[1].toLowerCase();
    const first = from || to
      ? pairs.find((x) => (!from || x.out.place === from) && (!to || x.in.place === to))
      : pairs.find((x) => !done.includes(x.in.id));
    if (first) {
      requireCarry(first, first.in.id, true);
    }
  }
  for (const x of pairs) {
    if (!writesTotal(text, x.out)) {
      if (!done.includes(x.out.id) && asksWriteTotal(text, x.out)) requireCarry(x, x.out.id, true);
      continue;
    }
    requireCarry(x, x.out.id, true);
    const at = done.indexOf(x.out.id);
    if (at >= 0) done.splice(at, 1);
  }
  return { due, said, times };
}

/**
 * A reading without the answers code finds right, for when the answer already stands: they say again what is known.
 * Wrong answers stay, to be judged.
 */
function withoutRepeats(pkg: OperationPackage, reading: Reading): Reading {
  if (!reading.answers) return reading;
  const answers = reading.answers.filter((a) => {
    if (!isObject(a) || !isAnswerValue(a.value)) return true;
    const { operation, steps, answer } = problemOf(pkg, a.problem ?? "target");
    const at = steps.find((x) => x.id === a.step);
    if (!at) return true;
    return !(a.step === "result" ? isRightAnswer(operation, answer, a.value) : stepAnswers(at).some((v) => equivalent(v, a.value)));
  });
  return { ...reading, answers: answers.length > 0 ? answers : undefined };
}

// ---------- Code's fallback (#389) ----------

/** Safe acts first; then a checked right answer and the gentlest teaching; giving the answer and closing come last. */
const FALLBACK_ORDER: readonly Act[] = [
  "safety", "repair", "open", "accept_answer", "guide", "example_step", "try_target", "ask_write", "clarify", "confirm", "check_in", "wait", "redirect",
  "offer_other_input", "close",
];

/** The answers a raw proposal's reading names, each read alone: a malformed answer, or a malformed proposal, gives none. */
function answersOf(raw: unknown): ChildAnswer[] {
  const p = withoutNulls(raw);
  const answers = isObject(p) && isObject(p.reading) ? p.reading.answers : undefined;
  if (!Array.isArray(answers)) return [];
  return answers.flatMap((a): ChildAnswer[] =>
    isObject(a) && isAnswerValue(a.value) && typeof a.step === "string" && (a.verdict === "right" || a.verdict === "wrong") &&
    (a.problem === undefined || a.problem === "target" || a.problem === "example")
      ? [{ value: a.value, step: a.step, verdict: a.verdict, ...(a.problem ? { problem: a.problem } : {}) }]
      : []);
}

/**
 * What code keeps of the readings of refused proposals (#389): each answer code checks alone, as `step` checks the
 * answers of an accepted proposal. The child said it in this turn and kept it (not taken back, not offered as a
 * choice), the step is a worked step of that problem, a final answer is the child's final answer (readAnswer), and the
 * model's verdict is the one the answer key and the worked steps give. An answer whose verdict code does not confirm is
 * dropped, never turned round. `step` already took the safety, stop, unclear and no-start fields, and keptReading keeps
 * the fields that say less or follow the ladder.
 */
function keptAnswers(session: Session, refused: readonly unknown[]): ChildAnswer[] {
  if (!session.package || !session.turn || session.outcome) return [];
  const kept: ChildAnswer[] = [];
  for (const a of refused.flatMap(answersOf)) {
    const twice = kept.some((k) => k.step === a.step && (k.problem ?? "target") === (a.problem ?? "target") && k.verdict === a.verdict && equivalent(k.value, a.value));
    if (!twice && checkAnswers(session, [a], []) === null) kept.push(a);
  }
  return kept;
}

/**
 * A column step is heard only when the child's WHOLE turn is one template (wholeTurn), on the fallback and on a model's
 * reading alike, so the two cannot disagree: the value ("16", "It's 16", "I got 16", "I already got 16", "I got 16, like I
 * said"), a plain yes to Maya's own "Did you say 16?", the step's own sum with every operand in any order ("9 and 7 make
 * 16"), or a first-person written-digit or carry claim ("I wrote 6 and carried 1", also after Maya's number: "You said 16,
 * so I wrote 6 and carried 1"), which checkColumnClaims checks. Beside the one template the turn may hold only next-step
 * questions from a closed list (stepTurnBody, nextStepQuestion: "I got 16. Where does the 1 go?"; first-ship practice
 * C01). Any other question, another sentence, another number, another speaker, a hedge or a negation fits none of them. An allow-list over the whole turn, because six review rounds of reading one sentence each left a gap in the
 * rest of the turn ("7 plus 9 is 16. My mom told me."). After H3 the value and the sum only copy what Maya showed; a claim
 * about the child's own paper is still theirs. A step of any other kind has no templates: its callers keep their own rules.
 */
function stepTurnHeard(s: Session, step: WorkedStep, value: AnswerValue): boolean {
  const pkg = s.package;
  if (!pkg || !s.turn || step.kind !== "add-column") return false;
  // A turn code could not hear for sure is no step credit: it gets its confirm first.
  const body = s.turn.uncertain ? null : stepTurnBody(s.turn.text, step.carryOut);
  if (body === null) return false;
  // Only the first step not done or passed: no tens credit before the ones.
  if (workSteps(pkg).find((st) => !behind(s).includes(st.id))?.id !== step.id) return false;
  const copy = s.ladder.step === step.id && s.ladder.hint >= 3;
  // The value is the column's total: a lone written digit is not ("6" for 7 + 9 = 16).
  const total = saidAs(number(step.total), value);
  // A plain yes to Maya's own "Did you say 16?": the child now owns that number, as on the final answer's confirm (P11).
  const yes = wholeYes(body);
  if (yes) {
    const asked = s.stepAsked;
    return !!asked && !copy && total && saidAs(asked, value) && (yes.value === null || saidAs(number(yes.value), asked));
  }
  // The value and the sum only copy what Maya showed after H3; a claim about the child's own paper is still theirs.
  const form = stepForm(pkg, step, value, body);
  return form === "total" ? !copy : form === "claim";
}

/**
 * Which step template the whole body is, for this value of an addition column, or null: "total" for the column's total
 * alone or in the child's own words ("16", "It's 16", "I got 16") or the step's own sum with every operand ("9 and 7 make
 * 16"); "claim" for a first-person written-digit claim with its carry, or its column when it makes none ("I wrote 6 and
 * carried 1"), which checkColumnClaims checks. `body` is a whole turn as wholeTurn gives it. The one list of step forms:
 * stepTurnHeard credits with it.
 */
function stepForm(pkg: OperationPackage, step: Extract<WorkedStep, { kind: "add-column" }>, value: AnswerValue, body: string): "total" | "claim" | null {
  // The child's own claim after Maya's number ("You said 16, so I wrote 6 and carried 1.", "Like you said, I wrote 6 and
  // carried 1."): only a claim about their paper, never the value or the sum ("You said 16, so it's 16." is a copy).
  const echo = echoedClaim(body);
  if (echo) return (echo.said === null || echo.said === step.total) && stepForm(pkg, step, value, echo.claim) === "claim" ? "claim" : null;
  // The value is the column's total: a lone written digit is not ("6" for 7 + 9 = 16).
  const total = saidAs(number(step.total), value);
  const bare = wholeValue(body);
  if (bare !== null) return total && saidAs(number(bare), value) ? "total" : null;
  const sum = wholeSum(body);
  if (sum) {
    const sorted = (xs: readonly number[]) => [...xs].sort((a, b) => a - b).join(",");
    const operands = step.carryIn > 0 ? [...step.digits, step.carryIn] : step.digits;
    return total && sum.sum === step.total && sorted(sum.operands) === sorted(operands) ? "total" : null;
  }
  // A claim: the step's written digit, with its carry when it makes one ("I wrote 6 and carried 1", "6, carry the 1"). A
  // step that makes no carry has only the digit, so the claim names its column: "I wrote 6." may be any column's 6.
  if (!claimWordsOnly(body) || !saidAs(number(step.write), value)) return null;
  const claims = columnClaims(body);
  const written = claims.filter((c) => !c.carry);
  const carried = claims.filter((c) => c.carry);
  if (claims.length === 0 || written.some((c) => claimPlaces(c.tail).some((p) => p.place !== step.place))) return null;
  // A carry alone never credits, even where it equals the written digit (6 + 5 = 11, "I carried 1."). The digit may lead: "1, carry the 1".
  const lead = /^([^,\s]+)\s*,/.exec(body);
  if (written.length === 0 && !(lead && plainNumber(lead[1]) !== null && saidAs(number(plainNumber(lead[1])!), value))) return null;
  const named = written.some((c) => claimPlaces(c.tail).some((p) => p.place === step.place));
  if (step.carryOut > 0 ? !carried.some((c) => c.value === step.carryOut) : !named) return null;
  // Every number is the step's written digit (said alone before a carry: "6, carry the 1") or a claim's own carry.
  const r = readNumbers(body);
  if (!r.values.some((v) => saidAs(v, value)) || !r.values.every((v) => saidAs(v, value) || (v.type === "number" && carried.some((c) => c.value === v.value)))) return null;
  return checkColumnClaims(pkg, step, pkg.steps, step, body) === "right" ? "claim" : null;
}

/** The steps the ladder is past: done by the child, or passed after Maya showed them at H3 (copiedStep). */
const behind = (s: Session) => (s.passed?.length ? [...s.done, ...s.passed] : s.done);

/**
 * The step Maya showed at H3 that this turn only copies or acknowledges, so the ladder goes past it with no credit (PR
 * #698, C04-r2: "You said 16, so I wrote 6" got the ones again until Maya gave the answer). The step is the first one the
 * ladder is not past, an addition column, and the one Maya showed at H3. The turn is, as a whole (stepTurnBody, with
 * next-step questions beside it), the step's value or sum ("16.", "7 plus 9 is 16."), Maya's number said back ("You said
 * 16.", "You said 16, so it's 16."), a plain acknowledgement ("I see.", "Got it."), or only next-step questions ("Where does
 * the 1 go?"). A bare "Yes." or "Okay." is none of these: a yes moves Maya past nothing she did not ask about (j06-review,
 * P3). Null for any other turn: a help request or a failure keeps the H3 rule. A claim about the child's own paper is no
 * copy: it is credited as theirs (stepTurnHeard).
 */
function copiedStep(s: Session): string | null {
  const pkg = s.package;
  if (!pkg || !s.turn || s.turn.uncertain) return null;
  const st = workSteps(pkg).find((x) => !behind(s).includes(x.id));
  if (!st || st.kind !== "add-column" || s.ladder.step !== st.id || s.ladder.hint < 3) return null;
  if (onlyNextStepQuestions(s.turn.text, st.carryOut)) return st.id;
  const body = stepTurnBody(s.turn.text, st.carryOut);
  if (body === null) return null;
  return stepForm(pkg, st, number(st.total), body) === "total" || echoesShown(body, st.total) ? st.id : null;
}

/**
 * The turn holds a written digit or carry judged wrong ("7 plus 9 is 16. I wrote 16."), or a plan to write a column's two-digit
 * sum in one column. That is not a hearing problem: asking "Was that 16?" would let a yes pass over it, so Maya does not ask.
 */
function claimJudgedWrong(s: Session): boolean {
  if (!s.package || !s.turn) return false;
  const pkg = s.package;
  const st = workSteps(pkg).find((x) => !behind(s).includes(x.id));
  return !!st && (checkColumnClaims(pkg, st, pkg.steps, st, st.kind === "add-column" ? withoutNextStepQuestions(s.turn.text, st.carryOut) : s.turn.text) === "wrong" || carryPairs(pkg).some((x) => writesTotal(s.turn!.text, x.out)));
}

/** The turn's final answer is right for the question, sure or not: it keeps the final answer's confirm (P11). */
const rightFinalIn = (s: Session) => {
  const final = s.turn && s.package ? readAnswer(s.turn.text, readOptionsFor(s.package)).final : null;
  return !!final && rightForQuestion(s.package!, final);
};

/** The first step not done, when it is a column of an addition. */
function currentColumn(s: Session): Extract<WorkedStep, { kind: "add-column" }> | null {
  const st = s.package ? workSteps(s.package).find((x) => !behind(s).includes(x.id)) : undefined;
  return st?.kind === "add-column" ? st : null;
}

/**
 * The only turn Maya may ask a step's confirm about, and the number she asks: exactly one number, which is the column's full
 * total, and no other word but the short list of confirmWordsOnly. An allow-list on the words: any place, column, verb, speaker
 * or "answer" means no step confirm ("6 in the ones.", "The answer is 16.", "I wrote 6."), so she never asks about a number she
 * will not credit, and a claim about a column cannot pass as a hearing problem. Reviews of 6528f2ca and 66491fd5.
 */
function stepConfirmable(s: Session): AnswerValue | null {
  const st = currentColumn(s);
  if (!st || !s.turn || !s.package) return null;
  const opts = readOptionsFor(s.package);
  const values = valuesIn(s.turn.text, opts);
  const total = number(st.total);
  return values.length === 1 && readAnswer(s.turn.text, opts).kept.length === 1 && saidAs(values[0], total) && confirmWordsOnly(s.turn.text) ? total : null;
}

/**
 * The turn may get the step's confirm now: it is confirmable, it is not already heard, Maya has not shown the step, and it is
 * not a right final answer the child is sure of (that is judged as the answer).
 */
function stepSaidUnheard(s: Session): boolean {
  const st = currentColumn(s);
  const total = stepConfirmable(s);
  if (!st || !total || !s.turn || s.ladder.hint >= 3 && s.ladder.step === st.id || stepTurnHeard(s, st, total)) return false;
  const read = turnRead(s);
  return !(read.final && read.sure && rightForQuestion(s.package!, read.final));
}

/**
 * The turn is about the current column and may not have its confirm: it holds a claim, or its final number is a value of the
 * column, or it has no final number but says one. A turn whose final number is another answer keeps the final answer's confirm
 * (P11, P15); a yes to that credits no step, because only stepAsked does.
 */
function stepOnlyTurn(s: Session): boolean {
  const st = currentColumn(s);
  if (!st || !s.turn || !s.package || stepSaidUnheard(s)) return false;
  const opts = readOptionsFor(s.package);
  if (columnClaims(s.turn.text).length > 0) return !rightFinalIn(s);
  const final = readAnswer(s.turn.text, opts).final;
  return final ? answersStep(st, final) && !rightForQuestion(s.package, final) : valuesIn(s.turn.text, opts).some((v) => answersStep(st, v));
}

/**
 * The answers code reads in the child's own words, for a turn the model did not read (its call failed, or its reading named
 * none): first-ship practice, C28-r1 and C29-r1, where "7 plus 9 is 16." got "Find the ones." and "Yes, it's 66." got the
 * ones again. Only right answers, never a judgement of wrong work, and each is checked by `checkAnswers` like a model's.
 * Only a final answer the child is sure of, or a step whose whole turn is heard (stepTurnHeard). Any other turn gets the
 * help it would get anyway.
 */
function heardAnswers(session: Session): ChildAnswer[] {
  const pkg = session.package;
  if (!pkg || !session.turn || session.scopeDue) return [];
  const read = turnRead(session);
  if (read.choice) return [];
  const found: ChildAnswer[] = [];
  for (const st of workSteps(pkg)) {
    if (behind(session).includes(st.id)) continue;
    const value = stepAnswers(st).find((v) => stepTurnHeard(session, st, v));
    if (value) {
      found.push({ value, step: st.id, verdict: "right" });
      break;
    }
  }
  // A hedge ("I think it's 66") or a guess gets its own path (notClear, check.guess), not an accepted answer (#605).
  // "16 is 66." says one number is another: no answer code can credit.
  const body = wholeTurn(session.turn.text);
  const equated = body !== null && /^(.+?)\s+(?:is|equals|makes?)\s+(.+)$/.exec(body);
  const twoNumbers = !!equated && plainNumber(equated[1]) !== null && plainNumber(equated[2]) !== null;
  if (session.solved === null && read.final && read.sure && !twoNumbers && !notClear(session, {}) && !saysGuess(session.turn.text) && rightForQuestion(pkg, read.final)) found.push({ value: read.final, step: "result", verdict: "right" });
  // A plain final number on the last step is a committed miss, even when the model is unavailable.
  const copiedValue = read.final && workSteps(pkg).some((st) => (session.passed ?? []).includes(st.id) && stepAnswers(st).some((value) => equivalent(value, read.final!)));
  if (session.solved === null && session.ladder.step === "result" && body !== null && plainNumber(body) !== null && read.final && read.sure && !copiedValue && committedValue(session, { value: read.final, step: "result", verdict: "wrong" }) && !rightForQuestion(pkg, read.final)) {
    found.push({ value: read.final, step: "result", verdict: "wrong" });
  }
  return found.filter((a) => checkAnswers(session, [a], []) === null);
}

/**
 * What code keeps of the refused proposals' readings beside the answers (#605, F03: "Can you promise I will get an A?" lost
 * its off-topic reading and got a teaching step). Read field by field, the last reading that names a field wins. None of
 * these adds math or changes an answer: off topic and writing say less, a request for harmful content gets code's decline,
 * and a request for help follows the ladder. The paper counts only when the child's own words say it was written. A checked
 * answer in the turn comes before off topic and writing.
 */
function keptReading(session: Session, refused: readonly unknown[], answers: readonly ChildAnswer[]): Reading {
  if (!session.turn) return {};
  const kept: Reading = {};
  for (const raw of refused) {
    const p = withoutNulls(raw);
    const r = isObject(p) && isObject(p.reading) ? p.reading : {};
    if (r.offTopic === true) kept.offTopic = true;
    if (r.writing === true) kept.writing = true;
    if (r.unsafeRequest === true) kept.unsafeRequest = true;
    if (r.help === "more" || r.help === "show") kept.help = r.help;
    if (r.paper === "written") kept.paper = "written";
  }
  if (answers.length > 0) { delete kept.offTopic; delete kept.writing; }
  // A refused reading never clears a scope duty (gate: S19).
  if (session.scopeDue) delete kept.unsafeRequest;
  if (!saysWritten(session.turn.text)) delete kept.paper;
  return kept;
}

/**
 * Code's fallback proposals for the session now, safest first, for a turn whose model proposal was refused twice or
 * whose model failed (the text adapter tries them in order; `step` checks each like any proposal). Each is code-written
 * lines or a bank phrase, with no free talk and no board. Each carries what code keeps of the refused proposals'
 * readings (#389): the answers code checks alone. So a right step the child said is recorded and acknowledged, and
 * the help goes on from the first step still not done; Maya does not ask again for a step already done, start the
 * easier example after the child has made progress, or ask for a written answer the child already wrote. A turn the
 * model did not read gets code's own strict reading (heardAnswers). The rest of the
 * turn's reading is kept too (keptReading, #605), and help rises one level per child turn on a step still not done. Only
 * the model's words are replaced.
 */
export function fallbacks(given: Session, refused: readonly unknown[] = []): Proposal[] {
  if (given.outcome || given.expect !== "maya") return [];
  // The fixed reply to a question about a secret, as `step` will set it: a failed model call must still say it.
  const secret = secretReplies(given);
  const session: Session = secret ? { ...given, replies: secret } : given;
  const pkg = session.package;
  const yes = yesAnswer(session);
  const kept = yes ? [yes] : keptAnswers(session, refused);
  // A reading that named the turn off topic or harmful stands: code's own reading adds no answer to it.
  const named = keptReading(session, refused, kept);
  const heard = yes || named.offTopic || named.unsafeRequest ? [] : heardAnswers(session)
    .filter((a) => !kept.some((k) => k.step === a.step && (k.problem ?? "target") === "target"));
  const answers = [...kept, ...heard];
  const keptFields = keptReading(session, refused, answers);
  const reading: Reading | undefined = answers.length > 0 || Object.keys(keptFields).length > 0 ? { ...keptFields, ...(answers.length > 0 ? { answers } : {}) } : undefined;
  const checked: Checked[] = answers.map((answer) => ({ answer, problem: answer.problem ?? "target" }));
  const rightResult = checked.some((c) => c.problem === "target" && c.answer.step === "result" && c.answer.verdict === "right");
  // The session after the reading, as `step` will see it: a checked wrong final answer takes back the solution that
  // stood, and right steps are done; the ladder is on the first step still not done.
  const wrongResult = checked.some((c) => c.problem === "target" && c.answer.step === "result" && c.answer.verdict === "wrong");
  const s: Session = { ...session, ...(wrongResult ? { solved: null } : {}), ...(keptFields.paper ? { paper: "child_confirmed" as const } : {}) };
  const equal = equalIn(pkg, checked);
  const done = pkg ? workSteps(pkg).map((st) => st.id)
    .filter((id) => equal !== null || session.done.includes(id) || checked.some((c) => c.problem === "target" && c.answer.step === id && c.answer.verdict === "right")) : [];
  // As `step` will see it: a write plan takes its column out of `done`, and a lost carry makes the regroup due.
  const regroup = pkg ? regroupAfter(s, checked, done) : { due: [], said: [] };
  // As `step` will see it: a copy of the step Maya showed at H3 moves the ladder past it, with no credit (copiedStep).
  const copied = copiedStep(session);
  const passed = [...(session.passed ?? []), ...(copied ? [copied] : [])];
  const ladderStep = pkg ? guideStep(pkg, [...done, ...passed], regroup) : "result";
  const view: View = { steps: [ladderStep], done, checked, rightResult, equal, regroup: pendingRegroup(regroup), regroupSaid: regroup.said, regroupTimes: regroup.times };
  const misses = finalMisses(s, checked);
  const acts = (gate(s, {}) ?? teachingActs(s, reading ?? {}, rightResult, done.length > 0, misses)).acts;
  // A right final answer the child was not sure of: the confirmation comes before more help (#605).
  const read = session.turn && pkg ? turnRead(session) : null;
  const doubtful = !rightResult && s.solved === null && pkg !== null && read?.final != null && !read.sure && rightForQuestion(pkg, read.final) ? read.final : null;
  // Once the answer stands, the request to write it (or the close) comes before more help on a step. After two wrong
  // final answers on the final step, the backup close takes the place of more help (D-306).
  const solved = s.solved !== null || rightResult;
  // A step a model named, in a turn that is not heard: the confirm question comes before more help. Only that refusal: a
  // claim judged wrong is not a hearing problem (review of fec3dac4).
  const unheard = refused.flatMap(answersOf).some((a) => !answers.some((k) => k.step === a.step) && checkAnswers(session, [a], [])?.unheard === true);
  const rank = (a: Act) => ((solved && a === "ask_write") || ((doubtful || unheard) && a === "confirm") ? FALLBACK_ORDER.indexOf("guide") - 0.5 : FALLBACK_ORDER.indexOf(a));
  const order = [...new Set(unheard && s.opened && s.turn && s.confirmTries < 2 && s.solved === null && !rightResult ? [...acts, "confirm" as Act] : acts)].sort((a, b) => rank(a) - rank(b)).filter((a) => a !== "accept_answer" || rightResult);
  const make = (act: Act, offers: LineOffer[], extra: Partial<Proposal> = {}): Proposal => ({
    version: PROPOSAL_VERSION, act, parts: offers.map((o) => ({ line: o.line, slots: o.slots })), ...extra, ...(reading ? { reading } : {}),
  });
  const byLevel = (offers: LineOffer[]) => [...offers].sort((a, b) => (a.level ?? 0) - (b.level ?? 0));
  return order.flatMap((act) => {
    const offers = offersFor(s, act, view).filter((o) => !o.requires || meets(o.requires, view));
    const free = offers.filter((o) => !o.requires);
    let lineSets: Proposal[];
    switch (act) {
      case "guide": {
        // A step the child just did right is said first ("Yes! 7 + 9 = 16."), else a checked wrong answer on this step.
        const fresh = done.filter((id) => !session.done.includes(id)).at(-1);
        const judge = offers.find((o) => o.line === "check.equal") ?? offers.find((o) => o.line === "check.right_step" && o.slots.step === fresh) ??
          offers.find((o) => o.line === "check.not_yet" && o.slots.step === ladderStep);
        // A due regroup is said before any other help on its column.
        const due = (view.regroup ?? []).some((c) => c.at === ladderStep);
        // The next level up comes first on a step the child is still stuck on (#605), H3 for a child who asks to be shown,
        // then the levels above it, then the ones below: a line above what the session allows is refused and passed over.
        const hint = ladderStep === s.ladder.step ? helpHint(s) : -1;
        const target = reading?.help === "show" ? 3 : session.turn ? hint + 1 : 0;
        const lv = (o: LineOffer) => o.level ?? 0;
        const levelled = [...byLevel(free).filter((o) => lv(o) >= target), ...byLevel(free).filter((o) => lv(o) < target).reverse()];
        const why = s.turn !== null && asksWhy(s.turn.text);
        // A question about the carry gets the second way (step.why) when it is offered, else the line that says where the
        // carried digit goes (step.point), else where it comes from (step.regroup) (C26).
        const whyRank = (o: LineOffer) => (o.line === "step.why" ? 3 : o.line === "step.point" && (o.level ?? 0) <= hint + 1 ? 2 : o.line === "step.regroup" ? 1 : 0);
        const help = levelled.sort((a, b) => (due ? Number(b.line === "step.regroup") - Number(a.line === "step.regroup")
          : why ? whyRank(b) - whyRank(a) : 0));
        // A right final answer said with doubt or as a guess: check it together, with the step's question (#605).
        const lead = offers.find((o) => o.line === "check.guess") ?? offers.find((o) => o.line === "check.together");
        const asks = lead ? byLevel(free).filter((o) => o.slots.step === ladderStep && (o.line === "step.operation" || o.line === "step.invite")).reverse() : [];
        lineSets = [...asks.map((h) => [lead!, h]), ...(judge ? help.map((h) => [judge, h]) : []), ...help.map((h) => [h])]
          .map((set) => make(act, set, { step: ladderStep, level: (set.at(-1)!.level ?? 0) as HintLevel }));
        break;
      }
      case "example_step": {
        const at = offers.find((o) => o.line === "example.step") ?? offers.find((o) => o.line === "example.intro");
        lineSets = at ? [make(act, offers, { step: at.slots.step })] : [];
        break;
      }
      case "accept_answer":
        lineSets = offers.filter((o) => o.line === "answer.right").map((o) => make(act, [o]));
        break;
      case "ask_write":
        // After the check, understanding stays uncertain: code saw no evidence for it. The answer stands already, so
        // saying it is right again comes last (after the request to write it, or a question about the child's work).
        lineSets = [...offers.filter((o) => o.line !== "answer.right"), ...offers.filter((o) => o.line === "answer.right")]
          .map((o) => make(act, [o], { understanding: "uncertain" }));
        break;
      case "close":
        // A content hold (#527): the held lines together, in order.
        lineSets = s.state === "CONTENT_HOLD" ? [make(act, offers)] : [...(!gate(s, reading ?? {}) && acts.length === 1 && acts[0] === "close" && free.some((o) => o.line === "close.stuck") && free.some((o) => o.line === "close.together") ? [make(act, [free.find((o) => o.line === "close.stuck")!, ...(pkg && closeExpressionContainsAnswer(pkg.operation, pkg.answer.value) ? [] : [free.find((o) => o.line === "close.together")!])])] : []), ...byLevel(free).map((o) => make(act, [o], o.slots.step ? { step: o.slots.step } : {}))];
        break;
      case "confirm":
        // The child's doubtful final answer first (#605), then the number they said last.
        {
          const stepTotal = unheard ? stepConfirmable(s) : null;
          const first = doubtful ?? stepTotal;
          const fits = (o: LineOffer) => Number(o.line === "confirm.heard" && !!first && o.slots.heard === valueText(first));
          lineSets = [...free].reverse().sort((a, b) => fits(b) - fits(a)).map((o) => make(act, [o]));
        }
        break;
      default:
        lineSets = byLevel(free).map((o) => make(act, [o], o.slots.step ? { step: o.slots.step } : {}));
    }
    const group = PHRASE_GROUPS.find((g) => PHRASE_ACTS[g].includes(act));
    return [
      ...lineSets,
      ...(group ? [{ version: PROPOSAL_VERSION, act, parts: [{ warm: group }], ...(reading ? { reading } : {}) } as Proposal] : []),
      { version: PROPOSAL_VERSION, act, parts: [], ...(reading ? { reading } : {}) } as Proposal,
    ];
  });
}

// ---------- Helpers ----------

function refuse(session: Session, code: RefusalCode, reason: string): StepResult {
  return { session, effects: [], refusal: { code, reason, allowed: [] } };
}

function waitForChild(s: Session) {
  s.expect = "child";
  s.waitingSince = s.now;
  s.silence = "none";
}

/** Moves to a state that does not return anywhere. */
function moveTo(s: Session, state: SessionState) {
  s.state = state;
  s.resume = null;
}

function enterInterrupt(s: Session, state: Interrupt) {
  if (isTeaching(s.state)) s.resume = s.state;
  s.state = state;
}

function raiseSafety(s: Session, severity: Severity, at: number, effects: Effect[]) {
  const rises = !s.safety.flagged || (s.safety.severity === "concern" && severity === "immediate");
  if (!rises) return;
  s.safety = { flagged: true, severity, at, guided: false };
  if (s.state !== "SAFETY") {
    moveTo(s, "SAFETY");
    effects.push({ kind: "cancel_output" });
  }
  s.expect = "maya";
  effects.push({ kind: "safety_flag", severity, at });
}

/** Why Maya closes, from the session before the close, ahead of the outcome's priority (safety, content, solved). */
function closeCause(before: Session): Reason {
  if (before.stopRequested) return "child_stopped";
  if (before.silence === "close_due") return "no_response";
  if (before.state === "TIME_CLOSE") return "time_limit";
  if (before.state === "CONFIRM_HEARD") return "technical_issue";
  return "child_stopped";
}

/** When the call ended, or ends now: never after the call's limit. */
const endTime = (s: Session) => Math.min(s.now!, (s.startedAt ?? s.now!) + limitsOf(s).endAtMs);

function outcomeOf(s: Session, cause: Reason): Outcome {
  const reason: Reason = s.safety.flagged ? "safety" : s.state === "CONTENT_HOLD" ? "content_issue" : s.solved !== null ? "solved" : cause;
  const assistance = s.assistance.reduce<Assistance>((most, a) => (rank(a) > rank(most) ? a : most), "independent");
  return {
    reason,
    assistance,
    paperStatus: s.paper,
    understanding: s.understanding,
    highestHint: s.highestHint,
    safetyFlag: s.safety.flagged,
    safetySeverity: s.safety.severity,
    mishearing: { ...s.mishearing },
    seconds: s.startedAt === null || s.now === null ? 0 : Math.round((endTime(s) - s.startedAt) / 1000),
  };
}

/** Ends the call. Safety guidance still due is given first, in code's words, on every way a call ends. */
function end(s: Session, cause: Reason, effects: Effect[], cancel: boolean) {
  if (cancel) effects.push({ kind: "cancel_output" });
  if (s.safety.flagged && !s.safety.guided) {
    const text = SAFETY_GUIDANCE[s.safety.severity!];
    effects.push({ kind: "say", act: "safety", text });
    s.turns.push({ at: s.now!, speaker: "maya", text, state: s.state, act: "safety" });
    s.safety.guided = true;
  }
  s.outcome = outcomeOf(s, cause);
  moveTo(s, "CLOSE");
  s.expect = "nothing";
  s.turn = null;
  effects.push({ kind: "end", at: s.now!, outcome: s.outcome, safetyMessage: s.safety.flagged ? SAFETY_GUIDANCE[s.safety.severity!] : null });
}

/** Check filled line values, free words, and visible board values before releasing the answer. */
const REFERENCE_SLOTS = new Set(["page", "number", "workbook"]);

function revealsAnswer(s: Session, p: Proposal, spoken: Spoken, forcedOpening: string | null = null): boolean {
  const pkg = s.package!;
  const answer = pkg.answer.value;
  // An equal form the child said (14/16 for 7/8, #407) gives nothing away when Maya says it back; the answer's own
  // written form still does.
  const said = childValues(s);
  // A confirmation says back a number the child just said ("Did you say 66?", #605). It judges nothing and gives nothing
  // away. A number they did not say (a sounds-like, another transcript) still reveals it.
  const justSaid = p.act === "confirm" && s.turn ? valuesIn(s.turn.text, readOptionsFor(pkg)) : [];
  const reveals = (v: AnswerValue) => equivalent(v, answer) && !justSaid.some((c) => sameValue(c, v)) && (sameValue(v, answer) || !said.some((c) => sameValue(c, v)));
  const expression = operationText(pkg.operation);
  const withoutExpression = (text: string) => text.split(expression).join("");
  const filled = spoken.chosen.flatMap((offer) => Object.values(offer.filled ?? {}).map(String));
  const codeLines = new Set(spoken.chosen.flatMap((offer) => offer.texts));
  const other = spoken.segments.filter((segment) => segment.text !== forcedOpening && (segment.kind === "warm" || segment.kind === "talk" || !codeLines.has(segment.text))).map((segment) => segment.text);
  if (forcedOpening) {
    // Reference placeholders identify the printed question. Every other placeholder must be known and checked.
    const values: Record<string, string> = { expr: expression };
    let unknown = false;
    const checkedOpening = WORKBOOK_OPENING.replace(/\{(\w+)\}/g, (_match, slot: string) => {
      if (REFERENCE_SLOTS.has(slot)) return "";
      if (!Object.hasOwn(values, slot)) { unknown = true; return ""; }
      return values[slot];
    });
    if (unknown) return true;
    other.push(checkedOpening);
  }
  const board = boardVisible(p.board ?? []).map(([, value]) => value);
  if ([...filled, ...other, ...board].some((text) => valuesIn(withoutExpression(text), readOptionsFor(pkg)).some(reveals))) return true;
  const highest = answer.type === "number" ? PLACE_NAMES[String(Math.trunc(Math.abs(answer.value))).length - 1] : undefined;
  return (p.board ?? []).some((raw) => {
    const c = raw as Partial<Command>;
    if (c.op !== "put" || !isObject(c.target)) return false;
    const t = c.target as Target;
    if (!(Object.hasOwn(s.boardRoles, t.objectId) && s.boardRoles[t.objectId] === "target") && !createsTarget(p, t.objectId)) return false;
    return (t.part === "row" && t.rowId === "answer") || (t.part === "cell" && t.rowId === "answer" && t.column === highest);
  });
}

/** The proposal creates this object for the child's question in the same batch. */
const createsTarget = (p: Proposal, id: string) => p.act !== "example_step" && (p.board ?? []).some((c) => isObject(c) && c.op === "columns" && c.id === id);

/**
 * The board objects a batch creates, with their role, or why the batch mixes the problems: a new `columns` object shows
 * this turn's problem with its own numbers, and every command that writes on an object (put, regroup, remove) writes
 * on an object of this turn's problem. Marks, arrows and focus may point at either.
 */
function boardRoles(s: Session, role: Problem, board: unknown[]): Record<string, Problem> | string {
  const { operation } = problemOf(s.package!, role);
  const name = role === "target" ? "the child's question" : "the easier example";
  const created: Record<string, Problem> = {};
  for (const raw of board) {
    const c = raw as Record<string, unknown>;
    if ((c.op === "columns" || c.op === "write" || c.op === "model") && typeof c.id === "string") {
      if (c.op === "columns") {
        const operands = Array.isArray(c.operands) ? c.operands.map((o) => (isObject(o) ? Number(o.value) : NaN)) : [];
        const want = operandsOf(operation);
        const same = c.operation === BOARD_OPERATION[operation.kind] && operands.length === want.length && operands.every((n, i) => n === want[i]);
        if (!same) return `The board shows ${name} now: ${want.join(` ${SYMBOL[operation.kind]} `)}.`;
      }
      created[c.id] = role;
      continue;
    }
    const writesOn = c.op === "put" ? (c.target as Target | undefined)?.objectId : c.op === "regroup" || c.op === "remove" ? c.objectId : undefined;
    if (writesOn !== undefined) {
      // Own properties only: an id such as "constructor" is no board object.
      const owner = typeof writesOn !== "string" ? undefined : Object.hasOwn(created, writesOn) ? created[writesOn] : Object.hasOwn(s.boardRoles, writesOn) ? s.boardRoles[writesOn] : undefined;
      if (owner === undefined) return `Maya has no board object "${String(writesOn)}".`;
      if (owner !== role) return `This turn is about ${name}: it does not write on the other problem's board.`;
    }
  }
  return created;
}

// ---------- Maya's words ----------

/** What a proposal is judged against: the steps its step lines may be about, and the reading as code checked it. */
interface View {
  steps: string[];
  done: string[];
  checked: Checked[];
  rightResult: boolean;
  /** The child's equal fraction checked in this reading, when the question asks for the simplest form (#407). */
  equal?: AnswerValue | null;
  /** Columns whose regroup must be explained before any line about a carried digit (pendingRegroup). */
  regroup?: RegroupNeed[];
  /** Carries Maya has explained: their line comes again only when the child denies the carry (regroupAfter, #605). */
  regroupSaid?: readonly CarryRef[];
  /** How many times each regroup line was said (Regroup.times), to limit a subtraction's, which has no carry state. */
  regroupTimes?: Readonly<Record<string, number>>;
}

/** The equal fraction (#407) among a reading's checked final answers, or null. */
function equalIn(pkg: OperationPackage | null, checked: readonly Checked[]): AnswerValue | null {
  if (!pkg) return null;
  return checked.find((c) => c.problem === "target" && c.answer.step === "result" && c.answer.verdict === "wrong" && isEqualForm(pkg, c.answer.value))?.answer.value ?? null;
}

/** The words a proposal gives: the text Maya says, the lines in it, and the board texts those lines allow. */
interface Spoken {
  text: string;
  lines: string[];
  boards: string[];
  /** Pieces of the model's own warm words replaced by a bank phrase. */
  replaced: number;
  /** Each piece of the model's own warm words, with both checks (D-197). */
  talk: TalkCheck[];
  /** The turn's parts in order, with what each is; code adds its own lines here before the turn is checked. */
  segments: Segment[];
  /** The line offers said this turn. */
  chosen: LineOffer[];
}

/** One part of a turn as said: a math line, a line with no math (the hello), bank warm talk, or the model's own words. */
interface Segment {
  kind: "math" | "plain" | "warm" | "talk";
  text: string;
}

/** Acts where code adds a math line itself (the given answer): they are math turns by definition. */
const CODE_MATH_ACTS: readonly Act[] = [];

/**
 * The one check of a turn's order (D-196), on the assembled turn: when it holds math (a math line, or an act where code
 * adds one), none of its warm talk is the model's own words, and no warm talk comes after its first math line.
 */
function assembledProblem(segments: readonly Segment[], codeMath: boolean): { code: RefusalCode; reason: string } | null {
  const first = segments.findIndex((x) => x.kind === "math");
  if (first === -1 && !codeMath) return null;
  if (first !== -1 && segments.slice(first).some((x) => x.kind === "warm" || x.kind === "talk")) {
    return { code: "math_line_not_last", reason: "Warm talk comes before the math line: the math line is the last thing Maya says in a turn." };
  }
  if (segments.some((x) => x.kind === "talk")) {
    return { code: "free_talk_in_math_turn", reason: "A turn with math takes its warm talk from the bank: use { warm: <group> }, not { talk }." };
  }
  return null;
}

/** A 32-bit number from a text (FNV-1a), to seed the wordings of a call that passes no random number. */
function hashOf(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}

/** The wordings this call has said, with their times: add them to the child's wording history (wording-history.ts). */
export const heardWordings = (session: Session): WordingHistory => heardInCall(session.variety);

/** Bank choices keep their original pick ids when a state condition removes a wording. Repeated checked attempts,
 * right or wrong, support the new effort praise. A fresh or old uncounted session gets readiness and thank-you lines. */
/** A thank-you for being told something ("Thank you for telling me."): no answer to a question (F02). */
const THANKS_TOLD = /\b(?:telling me|told me|for sharing|you shared)\b/i;

/**
 * The child's turn asks a question, with no hard feeling and no safety concern in the call: a thank-you for being told
 * answers nothing, so it is not offered (first-ship practice, F02: "Maya, can you tell me a secret?" got "Thank you for
 * telling me."). The safety and concern paths keep it.
 */
const askedNow = (session: Session) => !!session.turn && /\?/.test(session.turn.text) && !hardFeeling(session.turn.text) && !session.safety.flagged;

/** The child's words this turn, else their last words in the call. */
const childTurnText = (session: Session): string | undefined => session.turn?.text ?? [...session.turns].reverse().find((t) => t.speaker === "child")?.text;

export function phraseOffers(session: Session, group: PhraseGroup): { pick: number; text: string }[] {
  const ready = new Set([1, 2, 3, 4, 8, 12]);
  const closingEffort = new Set([2, 7, 10, 13, 14]);
  const asked = askedNow(session);
  const hard = hardFeeling(childTurnText(session));
  return PHRASES[group].flatMap((text, i) => {
    if (asked && THANKS_TOLD.test(text)) return [];
    // A hard feeling never gets a cheerful wording ("Oh, your grandma! How nice.").
    if (hard && group !== "empathy" && !(group === "smalltalk" && [...FEELING_SMALLTALK, ...NEUTRAL_SMALLTALK].includes(text))) return [];
    if (group === "praise" && !ready.has(i + 1) && (session.workAttempts ?? 0) < 2) return [];
    if (group === "closing" && closingEffort.has(i + 1) && ((session.workAttempts ?? 0) < 2 || session.done.length === 0)) return [];
    return [{ pick: i + 1, text }];
  });
}

/** The warm-talk purposes each act Maya may take now can use (D-196), for the text adapter beside lineOffers. */
export function warmGroups(session: Session): Partial<Record<Act, PhraseGroup[]>> {
  return Object.fromEntries(nextActs(session).acts.map((act) => [act, session.replies?.length ? [] : PHRASE_GROUPS.filter((g) => PHRASE_ACTS[g].includes(act))]));
}

/** "{echo}" filled with the child's words, a capital first at the start of a sentence. */
function withEcho(text: string, echoed: string | null): string {
  if (echoed === null) return text;
  const capital = `${echoed[0].toUpperCase()}${echoed.slice(1)}`;
  return text.replace(/^\{echo\}/, capital).replace(/([.?!]\s+)\{echo\}/g, `$1${capital}`).replace(/\{echo\}/g, echoed);
}

/**
 * The child's own words for an echo frame (D-196): 1 to 3 words in a row from the child's last turn, with no
 * punctuation between them, matched after case is set aside and copied as the child wrote them, with no math, no work word and not the child's name. Null
 * when they fail, and code then picks a frame with no slot.
 */
/**
 * Words an echo never repeats: insults and rude words (practice run 5, F06: "This is dumb and you're dumb." gave
 * "Feeling dumb is okay.", which puts the insult on the child). A frame with no slot is said instead.
 */
const UNKIND_ECHO: ReadonlySet<string> = new Set([
  "dumb", "stupid", "idiot", "idiots", "idiotic", "silly", "hate", "hated", "ugly", "fat", "loser", "losers", "lame", "boring", "useless",
  "worst", "suck", "sucks", "sucky", "shut", "dummy", "moron", "crap", "crappy", "trash", "garbage", "annoying", "weird", "freak", "jerk",
  "mean", "bad", "terrible", "awful", "pathetic", "kill", "die", "dead",
]);

function echoOf(s: Session, raw: string): string | null {
  const last = s.turn?.text ?? [...s.turns].reverse().find((t) => t.speaker === "child")?.text ?? "";
  const want = (raw.match(/[\p{L}]+(?:['’][\p{L}]+)*/gu) ?? []).map((w) => w.toLowerCase());
  if (want.length < 1 || want.length > 3 || raw.replace(/[\p{L}'’\s]/gu, "") !== "") return null;
  // The run of words stays inside one stretch of the child's text with no punctuation in it: an echo never crosses a
  // sentence break or a comma ("Biscuit. Soccer" gives no "Biscuit Soccer").
  let echoed: string | null = null;
  for (const stretch of last.split(/[^\p{L}'’\s]+/u)) {
    const words = stretch.match(/[\p{L}]+(?:['’][\p{L}]+)*/gu) ?? [];
    const at = words.findIndex((_, i) => want.every((w, k) => words[i + k]?.toLowerCase() === w));
    if (at !== -1) {
      echoed = words.slice(at, at + want.length).join(" ");
      break;
    }
  }
  if (echoed === null) return null;
  const name = s.variety.name?.toLowerCase();
  if (talkMath(echoed) !== null || workProblem(echoed) !== null || (name && want.includes(name)) || want.some((w) => UNKIND_ECHO.has(w))) return null;
  return echoed;
}

/** What the child has said in this call: free talk may start a sentence with a name the child used (D-196). */
const childWords = (s: Session) => s.turns.filter((t) => t.speaker === "child").map((t) => t.text);
/** Every number the child said in the call, read as their turns are read. */
const childValues = (s: Session) => childWords(s).flatMap((t) => valuesIn(t, readOptionsFor(s.package)));

/** The approved text of Maya's last turn, or "" before she has said anything. */
const lastSaid = (s: Session) => [...s.turns].reverse().find((t) => t.speaker === "maya")?.text ?? "";

/** The numbers Maya may have heard in the child's pending turn, and the pairs that sound alike or were offered as alternatives. */
function heardIn(s: Session): [AnswerValue[], [AnswerValue, AnswerValue][]] {
  if (!s.turn) return [[], []];
  if (s.package && outsideConfirmation(s.package, s.turn.text, s.exampleIntroduced === true || s.exampleShown > 0)) return [[], []];
  const last = s.turns.map((t) => t.speaker).lastIndexOf("maya");
  const since = s.turns.slice(last + 1).flatMap((t) => (t.speaker === "child" ? t.alternatives ?? [] : []));
  const calculation = readNumbers(s.turn.text, { fractions: true, operands: true }).operand.some(Boolean) ||
    !readAnswer(s.turn.text, readOptionsFor(s.package)).sure;
  const readable = (v: AnswerValue) => !calculation || (s.package !== null && scopeValue(s.package, v, s.exampleIntroduced === true || s.exampleShown > 0));
  const permitted = (v: AnswerValue) => readable(v) && (s.package === null || !outsideConfirmation(s.package, s.turn!.text, s.exampleIntroduced === true || s.exampleShown > 0, v));
  const heard = valuesIn(s.turn.text, readOptionsFor(s.package)).filter(permitted);
  const alternatives = since.flatMap((t) => valuesIn(t, readOptionsFor(s.package))).filter(permitted);
  const pairs: [AnswerValue, AnswerValue][] = [
    ...heard.flatMap((v) => (v.type === "number" ? soundsLike(v.value).map((w) => [v, number(w)] as [AnswerValue, AnswerValue]) : [])),
    ...heard.flatMap((v) => alternatives.filter((a) => !equivalent(a, v)).map((a) => [v, a] as [AnswerValue, AnswerValue])),
  ];
  // A hearing pair has one candidate answer and an alternative. The candidate owns the one-number exception.
  return [[...heard, ...alternatives], pairs.filter(([a, b]) => permitted(a) && readable(b))];
}

/**
 * The lines an act may use now. `view.steps` are the steps of the child's question its help lines may be about: the
 * step the ladder is on (to check a proposal), or every step not done yet (to offer, as a reading may finish steps).
 */
function offersFor(s: Session, act: Act, view: View): LineOffer[] {
  const offers = rawOffersFor(s, act, view);
  const available = (s.noBoard ? offers.map(spokenOffer) : offers).filter((o) => o.texts.length > 0).filter((o) => {
    if (o.line !== "step.show" || !s.package) return true;
    const shownStep = s.package.steps.find((step) => step.id === o.slots.step);
    if (shownStep && stepAnswers(shownStep).some((value) => equivalent(value, s.package!.answer.value))) return false;
    return ![...o.texts, ...(o.board ? [o.board] : [])].some((text) =>
      valuesIn(text, readOptionsFor(s.package)).some((value) => equivalent(value, s.package!.answer.value)));
  });
  // The shorter setting needs to exclude the 26-word subtraction variants. Ordinary turns still receive
  // the final assembly check; avoid recounting every available wording at the 45-word setting.
  if (turnWordLimit(s) === 45) return available;
  return available.flatMap((o) => {
    // Some approved variants are longer than a younger child's limit. Keep their ids and choose among variants
    // that fit individually. The final assembly check still refuses combinations that exceed the limit.
    const indices = o.texts.map((_, i) => i).filter((i) => speechWords(o.texts[i]) <= turnWordLimit(s));
    return indices.length ? [{ ...o, texts: indices.map((i) => o.texts[i]), wordingIds: indices.map((i) => o.wordingIds?.[i] ?? `${o.key}#${i}`) }] : [];
  });
}

/** Calls saved before profile limits keep the earlier 45-word limit. */
export const turnWordLimit = (s: Pick<Session, "grade" | "shorter">): number =>
  !s.shorter && (s.grade === undefined || (Number.isInteger(s.grade) && s.grade >= 4 && s.grade <= 7)) ? 45 : 25;

function rawOffersFor(s: Session, act: Act, view: View): LineOffer[] {
  // A content hold (#527): only the held lines, with the hello when Maya has not said it.
  if (s.state === "CONTENT_HOLD") return act === "close" ? heldOffers(!s.opened) : [];
  const pkg = s.package;
  if (!pkg) return [];
  const l = packageLines(pkg);
  if (s.scopeDue && act === "redirect") return [...l.workbook(), ...l.decline(), ...l.redirect()];
  if (s.replies?.length && act === "redirect") {
    return [...fixedOffers(), ...l.question()].filter((o) => o.line === s.replies![0]);
  }
  const main = isTeaching(s.state) ? s.state : s.resume;
  const solved = s.solved ?? (view.rightResult ? "child" : null);
  const right = l.stepIds.flatMap(l.rightStep);
  switch (act) {
    case "open":
      return [...l.hello(), ...l.question(), ...l.assess()];
    case "clarify":
      return [...l.question(), ...l.assess()];
    case "example_step": {
      const index = main === "ASSESS" ? 0 : s.exampleShown;
      const next = pkg.easierExample.steps[index];
      if (index === 0 && !s.exampleIntroduced && turnWordLimit(s) === 25) {
        return l.exampleIntro().map((o) => ({ ...o, slots: { step: next.id } }));
      }
      return [...(index === 0 && !s.exampleIntroduced ? l.exampleIntro() : []), ...(next ? l.exampleStep(next.id) : [])];
    }
    case "try_target":
      return [...l.tryTarget(), ...l.question()];
    case "guide": {
      // An equal fraction when the question asks for the simplest form (#407): the equal-form check for each equal
      // fraction in the child's turn (it needs code to check that one), and the final step's help to simplify it.
      const opts = readOptionsFor(pkg);
      const candidates = view.equal ? [view.equal] : valuesIn(s.turn?.text ?? "", opts).filter((v) => isEqualForm(pkg, v));
      const simplify = view.steps.includes("result") ? view.equal ?? s.equalForm ?? null : null;
      const own = [...candidates.flatMap((v) => l.equal(v, simplestWords(pkg))), ...(simplify ? l.simplifyOwn(simplify) : [])];
      // A right final answer said with doubt or as a guess: a lead-in to check it together, before the step's line (#605).
      // Never once this step was shown at H3: that check asks the step's question at H2 or below, a step back from what the
      // child saw (first-ship practice, C04-r1, hint_skipped). The help goes on instead.
      const shownHere = view.steps[0] === s.ladder.step && s.ladder.hint >= 3;
      const check = s.solved === null && s.turn && !shownHere ? (saysGuess(s.turn.text) ? l.guess() : doubtfulRight(s) ? l.together() : []) : [];
      return [...check, ...view.steps.flatMap((id) => regroupHelp(l, id, view)), ...own, ...right, ...[...l.stepIds, "result"].flatMap(l.notYet), ...l.question(), ...l.thinking()];
    }
    case "accept_answer": {
      const form = view.checked.find((c) => c.problem === "target" && c.answer.step === "result" && c.answer.verdict === "right")?.answer.value ?? s.answerForm ?? undefined;
      // A child who already said how they got it (C09: "I did 27 plus 40, then took away one") is not asked about a
      // column they may not have used: that doubts a right method (first-ship practice, J02).
      const shown = s.turn !== null && otherMethod(s, s.turn.text);
      return [...l.thinking(), ...l.answerRight(form), ...(shown ? [] : l.explain()), ...right];
    }
    case "ask_write": {
      // Never a request to write what the child already wrote, or said they wrote or would not write (#389).
      const written = s.wrote === true || s.paper !== "unknown";
      // The child's own form of the answer when code accepted it (#407): "Please write 14/16 on your paper."
      const form = solved === "child" ? s.answerForm ?? undefined : undefined;
      const write = written ? [] : solved ? l.writeAnswer(form) : l.writeYours();
      // The check asks about a step the child has not shown: never about one they worked out aloud (practice: "Tell me
      // what you did for the tens." after the child said 2 + 3 + 1 = 6).
      const shown = (o: LineOffer) => o.slots.step !== undefined && view.done.includes(o.slots.step);
      const allShown = l.stepIds.length > 0 && l.stepIds.every((id) => view.done.includes(id));
      // A child who says they guessed hears one light check (#605); a wrong step after the answer stands is fixed.
      const guessed = main === "CHECK" && s.turn && saysGuess(s.turn.text) ? l.guess() : [];
      return [...guessed, ...write, ...(solved ? l.answerRight(form) : []), ...(main === "CHECK" ? [...(allShown && !guessed.length ? [] : l.thinking()), ...l.explain().filter((o) => !shown(o))] : [])];
    }
    case "close":
      // An unsolved close after the easier example may say the honest close (#735): it holds no answer.
      // An honest close by how much help the child had (C09 item iii): after the given answer, no claim that the child
      // finished it; after a shown step (guided), that their answer is right, not that they worked it out.
      return solved ? (solved === "maya" || s.assistance.includes("answer_given") ? l.closeGiven()
        : s.assistance.includes("guided") ? l.closeSolved("child", false) : l.closeSolved(solved, view.done.length > 0 || s.understanding === "evidence_observed"))
        : gate(s, {}) ? ((s.state === "TIME_CLOSE" || (s.turn !== null && s.exampleShown >= pkg.easierExample.steps.length)) ? l.closeStuck() : []) : [...l.closeStuck(), ...(closeExpressionContainsAnswer(pkg.operation, pkg.answer.value) ? [] : l.closeGiven())];
    case "confirm": {
      // With no safe number to say back, ask for the answer alone. No reread or inferred number.
      const heard = l.heard(...heardIn(s));
      return heard.length > 0 ? heard : l.answerOnly();
    }
    case "offer_other_input":
      return l.otherInput();
    case "redirect":
      return [...l.decline(), ...l.redirect(), ...l.question()];
    case "repair":
      return [...l.repair(), ...l.question(), ...view.steps.flatMap((id) => regroupHelp(l, id, view)).filter((o) => (o.level ?? 0) <= Math.max(0, s.ladder.hint))];
    default:
      return [];
  }
}

/**
 * The help lines of a step. While its regroup is due (view.regroup), the regroup line comes first: no other help but
 * the gentlest invite, so no line names a carried digit before the child hears where it comes from. The regroup line
 * of the column a carry comes from is offered only then (it says that column's sum).
 */
function regroupHelp(l: ReturnType<typeof packageLines>, id: string, view: View): LineOffer[] {
  const pending = (view.regroup ?? []).filter((c) => c.at === id);
  const own = l.help(id);
  // Once said, the line comes again only when the child denies the carry, which makes it pending (regroupAfter).
  const said = (view.regroupSaid ?? []).some((c) => c.in === id) || (view.regroupTimes?.[id] ?? 0) >= 1;
  // The second way (step.why, #605) comes only after the regroup line, for "why?" or when the first did not land.
  if (pending.length === 0) {
    return own.filter((o) => (o.line === "step.why" ? said
      : o.line !== "step.regroup" || !((view.regroupSaid ?? []).some((c) => c.in === id) || (view.regroupTimes?.[id] ?? 0) >= MAX_REGROUP_SAYS)));
  }
  // Explain an incoming carry before any outgoing explanation that uses it.
  const regroup = pending.some((c) => c.in === id) ? own.filter((o) => o.line === "step.regroup") : l.regroupOut(id);
  return [...own.filter((o) => (o.level ?? 0) === 0), ...regroup];
}

/** A line that judges the child's answer: code checked that answer, right (the step is done) or wrong. */
const meets = (requires: NonNullable<LineOffer["requires"]>, view: View) =>
  requires.answer === "right"
    ? view.done.includes(requires.step)
    : requires.answer === "equal"
      ? !!view.equal && (requires.heard === undefined || valueText(view.equal) === requires.heard)
      : view.checked.some((c) => c.problem === "target" && c.answer.step === requires.step && c.answer.verdict === "wrong");

/** The first two words of each sentence of a text, in lower case, to keep two sentences of one turn from starting alike. */
const openings = (text: string) =>
  text.split(/(?<=[.?!])\s+/).map((x) => (x.toLowerCase().match(/[\p{L}']+/gu) ?? []).slice(0, 2).join(" ")).filter((x) => x.includes(" "));

/** The equations in a text ("7 + 9 = 16"), to keep one turn from saying one twice. */
const equationsIn = (text: string) => text.match(/[\d./]+(?:\s*[-+−×÷]\s*[\d./]+)+\s*=\s*[\d./]*\d/g) ?? [];

/**
 * A line is math when any of its filled wordings holds what the no-math rule refuses in talk: a number, a sign, or an
 * operation, place, carry, write, answer or judgement word (R374-2-1). Decided from the filled text, not a list of
 * line ids, so a new line cannot be left out: only a line with no math in any wording (the hello) is not math.
 */
const isMathLine = (o: LineOffer) => o.texts.some((t) => talkMath(t) !== null);

/**
 * Renders a proposal's parts into the turn's segments. Each line must be offered now; the model's own warm words pass
 * the guards or are replaced by a bank phrase of the act's purpose. Which turns may hold them is checked once, on the
 * assembled turn (assembledProblem). Wordings are picked by variety.ts.
 */
function speak(s: Session, p: Proposal, view: View, reviews: readonly TalkReview[]): Spoken | { code: RefusalCode; reason: string } {
  const offers = offersFor(s, p.act, view);
  if (p.act === "redirect" && s.replies?.length && (p.parts.length !== 1 || !("line" in p.parts[0]) || p.parts[0].line !== s.replies[0])) {
    return { code: "fixed_reply_first", reason: "Use only the next fixed code line." };
  }
  const texts: string[] = [];
  const segments: Segment[] = [];
  const chosen: LineOffer[] = [];
  const lines: string[] = [];
  const turn = s.turns.filter((t) => t.speaker === "maya").length;
  let named = false;
  let replaced = 0;
  let replied = false;
  const talk: TalkCheck[] = [];
  /**
   * Picks a wording none of whose sentences starts with the same two words as a sentence already said in this turn
   * ("Let's look" twice reads as robotic); when every wording does, any of them.
   */
  const pickFresh = (wordings: readonly string[], id: (i: number) => string) => {
    const used = new Set(texts.flatMap(openings));
    // Never an equation already said in this turn (#605: "That's it: 7 + 9 = 16. 7 + 9 = 16.").
    const eqs = new Set(texts.flatMap(equationsIn));
    const unrepeated = wordings.map((_, i) => i).filter((i) => !equationsIn(wordings[i]).some((e) => eqs.has(e)));
    const fresh = unrepeated.filter((i) => !openings(wordings[i]).some((o) => used.has(o)));
    const pool = fresh.length ? fresh : unrepeated.length ? unrepeated : wordings.map((_, i) => i);
    return pool[chooseWording(s.variety, pool.map(id), s.now!)];
  };
  const phrase = (group: PhraseGroup, echoed: string | null = null, pick?: number, only?: readonly string[]): string => {
    if (!only && hardFeeling(childTurnText(s)) && phraseOffers(s, group).length === 0) return phrase("smalltalk", null, undefined, FEELING_SMALLTALK);
    const bank = PHRASES[group];
    const eligible = new Set(phraseOffers(s, group).map((o) => o.pick - 1));
    // A frame with the child's words when they check, else one with no slot (D-196 echo frames).
    const slotted = bank.flatMap((b, i) => (eligible.has(i) && b.includes("{echo}") ? [i] : []));
    const unslotted = bank.flatMap((b, i) => (!eligible.has(i) || b.includes("{echo}") || (only && !only.includes(b)) ? [] : [i]));
    const listed = unslotted.length > 0 || !only ? unslotted : bank.flatMap((b, i) => (only.includes(b) && !THANKS_TOLD.test(b) ? [i] : []));
    const pool = echoed !== null && slotted.length > 0 ? slotted : listed.length > 0 ? listed : unslotted;
    // The model may name the phrase that fits (R374-5): code keeps it when its slot can be filled, and records it.
    const chosen = pick !== undefined && pool.includes(pick - 1) ? pick - 1 : null;
    let index: number;
    if (chosen !== null) {
      index = chosen;
      s.variety.seq += 1;
      s.variety.heard[`phrase:${group}.${chosen + 1}`] = [s.variety.seq, s.now!];
    } else {
      index = pool[pickFresh(pool.map((i) => bank[i]), (i) => `phrase:${group}.${pool[i] + 1}`)];
    }
    const text = withEcho(bank[index], echoed);
    const name = text.includes("{name}") && !named && nameNow(s.variety, turn) ? s.variety.name : null;
    if (name !== null) {
      named = true;
      s.variety.nameAt = turn;
    }
    return withName(text, name);
  };
  const add = (kind: Segment["kind"], text: string) => {
    texts.push(text);
    segments.push({ kind, text });
  };
  for (const part of p.parts) {
    if ("warm" in part) {
      if (!PHRASE_ACTS[part.warm].includes(p.act)) {
        const groups = PHRASE_GROUPS.filter((g) => PHRASE_ACTS[g].includes(p.act));
        return { code: "line_not_offered", reason: `Warm talk "${part.warm}" does not fit ${p.act}. It fits: ${groups.join(", ") || "none"}.` };
      }
      if (part.pick !== undefined && !phraseOffers(s, part.warm).some((o) => o.pick === part.pick)) {
        return { code: "line_not_offered", reason: "This praise needs observed work in the call. Pick a currently offered phrase." };
      }
      const warm = s.mathClaim && part.warm !== "back"
        ? phrase("smalltalk", null, undefined, NEUTRAL_SMALLTALK)
        : phrase(part.warm, part.echo === undefined ? null : echoOf(s, part.echo), part.pick);
      // A hard feeling gets FEELING_SMALLTALK, never a cheerful wording, whatever the model picked (phraseOffers already
      // leaves those out; this holds when a group has nothing else left).
      add("warm", !s.mathClaim && hardFeeling(childTurnText(s)) && part.warm !== "empathy" && ![...FEELING_SMALLTALK, ...NEUTRAL_SMALLTALK].includes(warm) ? phrase("smalltalk", null, undefined, FEELING_SMALLTALK) : warm);
      continue;
    }
    if ("talk" in part) {
      // The model's own words are said only when they pass the code guards and the review (D-197); else a bank phrase
      // of the act's purpose. Either way they stay the model's part, so a turn with math refuses them
      // (assembledProblem).
      const proposed = part.talk.trim();
      const code = s.mathClaim ? "math claims use checked lines or neutral bank words"
        : s.freeTalk ? freeTalkProblem(part.talk, s.variety.name, childWords(s)) : "free talk is off";
      const review = code === null ? reviews.find((r) => r.text === proposed)?.result ?? null : null;
      if (code === null && review?.verdict === "pass") {
        add("talk", proposed);
        talk.push({ proposed, code, review: "pass", shown: proposed });
      } else {
        replaced += 1;
        const group = s.mathClaim ? "smalltalk" : FALLBACK_GROUP[p.act] ?? "encourage";
        const childText = s.turn?.text ?? [...s.turns].reverse().find((t) => t.speaker === "child")?.text;
        const neutral = !s.mathClaim && hardFeeling(childText) ? FEELING_SMALLTALK : NEUTRAL_SMALLTALK;
        // A question about Maya, a request for a promise, or praise gets the code-written reply that answers it, once a
        // turn; anything else the neutral phrase, which fits any child turn.
        const reply = !s.mathClaim && group === "smalltalk" && !replied ? replyFor(childText) : null;
        if (reply) replied = true;
        const shown = reply ? phrase(reply.group, null, reply.pick) : phrase(group, null, undefined, group === "smalltalk" ? neutral : undefined);
        add("talk", shown);
        talk.push({
          proposed, code, review: review?.verdict ?? "not_run",
          ...(review?.verdict === "fail" ? { rules: [...review.rules], reason: review.reason } : review?.verdict === "error" ? { reason: review.reason } : {}),
          shown,
        });
      }
      continue;
    }
    const o = findOffer(offers, { line: part.line, slots: normalSlots(part.slots ?? {}) });
    if (!o) {
      const ids = [...new Set(offers.map((x) => x.line))];
      return { code: "line_not_offered", reason: `"${part.line}" with these slots is not offered for ${p.act} now. Offered: ${ids.join(", ") || "no lines"}.` };
    }
    if (o.requires && !meets(o.requires, view)) {
      return { code: "line_not_offered", reason: `"${o.line}" needs an answer code checked ${o.requires.answer} for "${o.requires.step}".` };
    }
    if (p.act === "guide" && o.level !== undefined && o.level > (p.level ?? 0)) {
      return { code: "hint_too_high", reason: `"${o.line}" is H${o.level} help, above this guide's level H${p.level ?? 0}.` };
    }
    const text = o.texts[pickFresh(o.texts, (k) => o.wordingIds?.[k] ?? `${o.key}#${k}`)];
    // The decline counts as math (D-197): a turn that declines holds no free talk, and nothing follows it but code.
    add(isMathLine(o) || o.line === "redirect.decline" ? "math" : "plain", text);
    lines.push(text);
    chosen.push(o);
  }
  if (s.mathClaim && !chosen.length && !p.parts.some(part => "warm" in part && part.warm === "back") && PHRASE_ACTS.back.includes(p.act)) {
    add("warm", phrase("back"));
  }
  const level = Math.min(p.level ?? 0, 3);
  if (p.act === "guide" && level >= 1 && !chosen.some((o) => o.level === level)) {
    return { code: "invalid_proposal", reason: `A guide at H${p.level} says a step line of level H${level}.` };
  }
  return { text: texts.join(" "), lines, boards: chosen.flatMap((o) => (o.board ? [o.board] : [])), replaced, talk, segments, chosen };
}

/** One board representation code offers: an id the model names, and the commands code writes for a place. */
interface BoardOffer {
  id: string;
  /** What it draws, for the model. */
  shows: string;
  commands: (place: Place) => Command[];
}

/** The places Maya may put a new board object: code offers them; the model picks one by name. */
function boardPlaces(s: Session, batch: readonly string[], exampleStep: boolean): Record<string, Place> {
  // Keep the example's steps beside its sum, then put the target below that work.
  const last = batch.at(-1) ?? Object.keys(s.boardRoles).at(-1);
  const result = exampleStep && s.package?.easierExample.steps[s.exampleShown]?.kind === "result";
  const main: Place = result && Object.hasOwn(s.boardRoles, "example") ? { below: "example" }
    : exampleStep && last === "example" ? { rightOf: last } : last ? { below: last } : { region: "main" };
  const out: Record<string, Place> = { main };
  for (const id of ["question", "example"]) if (Object.hasOwn(s.boardRoles, id) || batch.includes(id)) out[`below:${id}`] = { below: id };
  return out;
}

/** The columns of a problem as code lays them out, with a code-made id ("question" or "example"). */
function columnsOf(s: Session, problem: Problem): Command | null {
  const pkg = s.package!;
  const { operation } = problemOf(pkg, problem);
  const layout = BOARD_OPERATION[operation.kind];
  if (!layout) return null;
  const [a, b] = operandsOf(operation);
  return { op: "columns", id: problem === "target" ? "question" : "example", operation: layout, operands: [{ id: "top", value: String(a) }, { id: "bottom", value: String(b) }], place: { region: "main" } } as unknown as Command;
}

/**
 * The board representations code offers for an act now (R374-6-1), each from the checked package: the question's
 * columns, the easier example's columns, a digit of the question's answer row once its step is done (or shown this
 * turn), and the expression or equation of a line said this turn as a note. Ids and every shown word are code's.
 */
function boardOffersFor(s: Session, act: Act, view: View, spoken: Pick<Spoken, "chosen"> | null): BoardOffer[] {
  const pkg = s.package;
  if (!pkg || !BOARD_ACTS.includes(act)) return [];
  const out: BoardOffer[] = [];
  const at = (c: Command | null, place: Place) => (c ? [{ ...c, place } as Command] : []);
  // Fraction strips (#407): each fraction of the problem as a strip of equal parts, the second below the first, so the
  // parts line up; for the child's question also the strips in the common denominator, once that step is done or shown.
  const strips = (id: string, of: readonly { numerator: number; denominator: number }[], shows: string) => {
    const ids = [`${id}-a`, `${id}-b`];
    if (of.length !== 2 || ids.some((x) => Object.hasOwn(s.boardRoles, x)) || !of.every((f) => f.denominator >= 1 && f.denominator <= FRACTION_STRIP_LIMITS.parts && f.numerator >= 0 && f.numerator <= f.denominator)) return;
    out.push({
      id: id.replace("-", "."), shows,
      commands: (place) => of.map((f, i) => ({ op: "model", id: ids[i], model: { kind: "fraction_strip", parts: f.denominator, shaded: f.numerator }, place: i === 0 ? place : { below: ids[0] } } as unknown as Command)),
    });
  };
  const fractionsOf = (op: Operation) => (op.kind === "fraction-add" || op.kind === "fraction-subtract") && op.operands.every((o) => o.type === "fraction")
    ? op.operands.map((o) => o as { numerator: number; denominator: number }) : [];
  if (act === "example_step") {
    const ex = columnsOf(s, "example");
    if (ex && !Object.hasOwn(s.boardRoles, "example")) out.push({ id: "example.columns", shows: `the easier example in columns: ${operationText(pkg.easierExample.operation)}`, commands: (place) => at(ex, place) });
    strips("example-strips", fractionsOf(pkg.easierExample.operation), `the easier example's fractions as strips: ${operationText(pkg.easierExample.operation)}`);
  } else {
    strips("question-strips", fractionsOf(pkg.operation), `the question's fractions as strips: ${operationText(pkg.operation)}`);
    const common = workSteps(pkg).find((st) => st.kind === "common-denominator");
    const shownNow = (spoken?.chosen ?? []).some((o) => o.line === "step.show" && o.slots.step === common?.id);
    if (common?.kind === "common-denominator" && (view.done.includes(common.id) || shownNow)) {
      strips("question-common", common.to, `the fractions with the common denominator as strips: ${common.to.map((f) => `${f.numerator}/${f.denominator}`).join(" and ")}`);
    }
    const q = columnsOf(s, "target");
    if (q && !Object.hasOwn(s.boardRoles, "question")) out.push({ id: "question.columns", shows: `the question in columns: ${operationText(pkg.operation)}`, commands: (place) => at(q, place) });
    // A written digit of a column step, once the child did the step or a line showed it this turn.
    const shown = new Set((spoken?.chosen ?? []).filter((o) => o.line === "step.show").map((o) => o.slots.step));
    if (q && (pkg.operation.kind === "add" || pkg.operation.kind === "subtract")) {
      for (const st of workSteps(pkg)) {
        if ((st.kind !== "add-column" && st.kind !== "subtract-column") || st.write === null) continue;
        if (!(PLACE_NAMES as readonly string[]).includes(st.place) || !(view.done.includes(st.id) || shown.has(st.id))) continue;
        const write = st.write;
        out.push({ id: `question.write.${st.id}`, shows: `write ${write} in the ${st.place} of the question's answer row`,
          commands: () => [{ op: "put", target: { objectId: "question", part: "cell", rowId: "answer", column: st.place }, value: String(write) } as unknown as Command] });
      }
    }
  }
  // A line's expression or equation said this turn, as a note with a code-made id.
  // The board core takes ids of letters, digits, "_" and "-" only, so the line id's dot becomes "-"; the part's index
  // keeps two notes of one line in one turn apart (#322).
  (spoken?.chosen ?? []).forEach((o, i) => {
    if (!o.board) return;
    const text = o.board;
    out.push({ id: `line.${o.line}`, shows: `the note "${text}"`, commands: (place) => [{ op: "write", id: `note-${s.batches + 1}-${i}-${o.line.replace(/\./g, "-")}`, text, place } as unknown as Command] });
  });
  return out;
}

/** The commands of the board offers a proposal draws, or why one is not offered. */
function drawBoard(s: Session, p: Proposal, view: View, spoken: Spoken): Command[] | string {
  const offers = boardOffersFor(s, p.act, view, spoken);
  const out: Command[] = [];
  const ids: string[] = [];
  for (const d of p.draw ?? []) {
    const o = offers.find((x) => x.id === d.offer);
    if (!o) return `"${d.offer}" is not a board offer for ${p.act} now. Offered: ${offers.map((x) => x.id).join(", ") || "none"}.`;
    if (ids.includes(o.id)) return `"${o.id}" is drawn twice.`;
    const places = boardPlaces(s, out.flatMap((command) => "id" in command && ["columns", "write", "model"].includes(command.op) ? [command.id] : []), p.act === "example_step");
    const place = places[d.place ?? "main"];
    if (!place) return `"${d.place}" is not a board place now. Places: ${Object.keys(places).join(", ")}.`;
    ids.push(o.id);
    out.push(...o.commands(place));
  }
  return out;
}

/**
 * The board offers each act Maya may take now can draw (R374-6-1), for the text adapter beside lineOffers: an id and
 * what it shows. `line.<line id>` offers appear in the turn a line with a board form is said.
 */
export function drawOffers(session: Session): Partial<Record<Act, { id: string; shows: string }[]>> {
  if (session.noBoard) return {};
  const pkg = session.package;
  const { acts } = nextActs(session);
  if (!pkg) return Object.fromEntries(acts.map((a) => [a, []]));
  // The regroup due now, with what the child's words show before any reading (a denial, a write plan).
  const done = [...session.done];
  const after = regroupAfter(session, [], done);
  const regroup = pendingRegroup(after);
  const view: View = { steps: openSteps(pkg, behind(session), regroup).filter((id) => !(session.passed ?? []).includes(id)), done, checked: [], rightResult: false, regroup, regroupSaid: after.said, regroupTimes: after.times };
  return Object.fromEntries(acts.map((act) => [act, [
    ...boardOffersFor(session, act, view, null).map(({ id, shows }) => ({ id, shows })),
    // Only an act that may draw is offered a line's note (#605: the opening offered one, then refused it).
    ...(BOARD_ACTS.includes(act) ? offersFor(session, act, view).filter((o) => o.board).map((o) => ({ id: `line.${o.line}`, shows: `the note "${o.board}" (with that line)` })) : []),
  ]]));
}

/** The fields of a board command a child sees as words. */
const BOARD_WORDS: ReadonlySet<string> = new Set(["text", "label"]);
/** The fields of a board command a child sees as numbers. */
const BOARD_NUMBERS: ReadonlySet<string> = new Set(["value", "dividend", "divisor", "numerator", "denominator", "whole", "min", "max", "tick", "fromValue", "toValue"]);

/** Every word or number field a child sees on the board, in any command, at any depth, with its field name. */
function boardVisible(v: unknown, key = ""): [string, string][] {
  if (typeof v === "string" || typeof v === "number") return BOARD_WORDS.has(key) || BOARD_NUMBERS.has(key) ? [[key, String(v)]] : [];
  if (Array.isArray(v)) return v.flatMap((x) => boardVisible(x, key));
  return isObject(v) ? Object.entries(v).flatMap(([k, x]) => boardVisible(x, k)) : [];
}

/**
 * Everything a child sees on the board, checked on every command (R374-5-1). Words are the expression, equation or
 * text of a line said this turn and nothing else, so every word on the board comes from code (D-197: free talk never
 * reaches the board). Only the board core's tests (`modelBoard`) let a note with no math pass the free-talk guards. Numbers are in a line said this turn, in the
 * problem's own numbers, or a digit of a done step.
 */
function boardProblem(s: Session, board: unknown[], role: Problem, spoken: Spoken, done: string[]): { code: RefusalCode; reason: string } | null {
  const pkg = s.package!;
  const { operation, steps } = problemOf(pkg, role);
  const finished = role === "target" ? steps.filter((st) => done.includes(st.id)) : steps.slice(0, s.exampleShown + 1);
  const allowed = [
    ...[...spoken.lines, ...spoken.boards].flatMap((t) => valuesIn(t)),
    ...operandsOf(operation).flatMap((n) => [number(n), ...[...String(n)].filter((c) => /\d/.test(c)).map((c) => number(Number(c)))]),
    ...finished.flatMap((st) => [...stepAnswers(st), ...("carryOut" in st ? [number(st.carryOut)] : [])]),
  ];
  const fromCode = new Set([...spoken.boards, ...spoken.lines].map((t) => t.trim()));
  for (const [key, raw] of boardVisible(board)) {
    const t = raw.trim();
    if (t === "") continue;
    if (BOARD_WORDS.has(key)) {
      if (fromCode.has(t)) continue;
      if (!s.modelBoard) return { code: "board_not_code", reason: `The board shows only a line's words said this turn, not "${t}".` };
      if (talkMath(t) !== null) return { code: "math_in_talk", reason: `The board writes math only as a line's expression or equation said this turn, not "${t}".` };
      // A note with no math passes the free-talk guards (D-196): nothing on the board points back or instructs the work.
      if (freeTalkProblem(/[.?!]$/.test(t) ? t : `${t}.`, s.variety.name, childWords(s)) !== null) {
        return { code: "math_in_talk", reason: `A board note does not instruct the work or point back to earlier words: "${t}".` };
      }
      continue;
    }
    const values = valuesIn(t);
    if (values.length === 0 || /\p{L}/u.test(t.replace(/\bR\b/g, ""))) return { code: "wrong_math", reason: `Code cannot read "${t}" as a number to show on the board.` };
    const off = values.find((x) => !allowed.some((a) => equivalent(a, x)));
    if (off) return { code: "wrong_math", reason: `Maya shows ${valueText(off)} on the board only after a line says it this turn.` };
  }
  return null;
}

/**
 * The steps whose help lines are offered: every work step not done yet and the final step ("result", #389), as the
 * model's reading of the child's turn may finish steps.
 */
const openSteps = (pkg: OperationPackage, done: readonly string[], regroup: readonly RegroupNeed[]) => [
  ...workSteps(pkg).map((st) => st.id).filter((id) => !done.includes(id) || regroup.some((c) => c.at === id)), "result",
];

/**
 * The lines Maya may say now, by act: what the text adapter (#322) offers the model. Help lines are offered for every
 * step of the child's question not done yet, and for the final step, as the model's reading of the child's turn may
 * finish steps; the session then accepts the ones for the step the ladder is on. Empty when it is not Maya's turn.
 */
export function lineOffers(session: Session): Partial<Record<Act, LineOffer[]>> {
  const { acts } = nextActs(session);
  const pkg = session.package;
  if (!pkg) return Object.fromEntries(acts.map((a) => [a, []]));
  // The regroup due now, with what the child's words show before any reading (a denial, a write plan).
  const done = [...session.done];
  const after = regroupAfter(session, [], done);
  const regroup = pendingRegroup(after);
  const view: View = { steps: openSteps(pkg, behind(session), regroup).filter((id) => !(session.passed ?? []).includes(id)), done, checked: [], rightResult: false, regroup, regroupSaid: after.said, regroupTimes: after.times };
  return Object.fromEntries(acts.map((act) => [act, offersFor(session, act, act === "accept_answer" ? { ...view, rightResult: true } : view)
    .filter((o) => act !== "guide" || o.slots.step === undefined || !(session.passed ?? []).includes(o.slots.step))]));
}

/** The child said this value: the same number (66 and 66.0), or a fraction or remainder written the same way. */
const saidAs = (heard: AnswerValue | undefined, value: AnswerValue) =>
  heard !== undefined && (heard.type === "number" && value.type === "number" ? equivalent(heard, value) : sameValue(heard, value));

/** A time in ms as an ISO time in UTC, without the platform clock or Date. */
function isoTime(ms: number): string {
  const day = 86_400_000;
  const days = Math.floor(ms / day);
  const rest = ms - days * day;
  // Days since 1970-01-01 to a civil date (the proleptic Gregorian calendar).
  const z = days + 719_468;
  const era = Math.floor(z / 146_097);
  const doe = z - era * 146_097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36_524) - Math.floor(doe / 146_096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  const y = yoe + era * 400 + (m <= 2 ? 1 : 0);
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  const [h, mi, sec, milli] = [Math.floor(rest / 3_600_000), Math.floor((rest % 3_600_000) / 60_000), Math.floor((rest % 60_000) / 1000), rest % 1000];
  return `${pad(y, 4)}-${pad(m)}-${pad(d)}T${pad(h)}:${pad(mi)}:${pad(sec)}.${pad(milli, 3)}Z`;
}
