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
  type PackageCheck,
  type WorkedStep,
} from "@/lib/question-package";
import { teachingLimits } from "@/lib/maya-teaching/limits";
import { partsClaim } from "@/lib/maya-teaching/topic-claim";
import { checkMissingNumber, frameState, isMissingNumber, type FrameState } from "./missing-number";
import { shownNumbers, trialHeard } from "./trial-factor";
import { talkMath } from "./claims";
import { closeExpressionContainsAnswer } from "./backup-close";
import { mathClaimIn, outsideConfirmation, scopeReason, scopeValue, type ScopeReading, type ScopeReason, type ScopeRefusal } from "./scope";
import { speechWords, saidAsApproved } from "./speech";
import { compensations, findOffer, normalSlots, openingLine, packageLines, stepEquation, workbookOpening, WORKBOOK_OPENING, fixedOffers, areaOffers, spokenOffer, heldOffers, heldSentences, LINE_IDS, type LineOffer } from "./lines";
import { freeTalkProblem, hardFeeling, CALM_PHRASES, replyFor, workProblem, FALLBACK_GROUP, FEELING_SMALLTALK, NEUTRAL_SMALLTALK, PHRASE_ACTS, PHRASE_GROUPS, PHRASES, type PhraseGroup } from "./phrases";
import { chooseWording, heardInCall, nameNow, newVariety, withName, type Variety, type WordingHistory } from "./variety";
import { kindOf, writtenFractions, claimWordsOnly, committedText, confirmWordsOnly, echoedClaim, echoesShown, falseEquationResults, nextStepQuestion, numberSentences, onlyNextStepQuestions, plainNumber, stepTurnBody, withoutNextStepQuestions, wholeSum, wholeTurn, wholeValue, wholeYes, retainedText, readAnswer, showsDoubt, readNumbers, additionSetup, saysDone, saysGuess, saysStuck, saysYes, saysWritten, takenBack, unreadableAnswer, valuesIn, withoutExplanations, type AnswerRead, type ReadOptions } from "./numbers";
import { isEqualForm, readOptionsFor, rightForQuestion, simplestWords, teachSteps, untaughtSteps } from "./fractions";
import { patternOf, patternRows } from "./pattern";
import { frameOwed, topicQuestion } from "./topic-frame";
import { clockAnswers, clockValues } from "./clock-lines";
import { isPlaceValue, placeAutoDraw, placeBoardOffers, WHY_KEYS } from "./place-value-lines";
import { asksPlace, digitTemplate, placeStepHeard } from "./place-value-turns";
import { biggerTemplate, partsStepHeard, partsStepTotal, worthTemplate } from "./place-value-parts-turns";
import { partsChartFits } from "./place-value-parts-lines";
import { isPartsOperation } from "@/lib/question-package-place-parts";
import { claimActs, claimAnswers, claimCommitted, claimConfirm, claimQuestionAsked, claimRead, claimResultDone, claimReveals, claimSaid, claimStepConfirmable, claimStepHeard, claimSessionPackage, claimUnclear, sessionClaim, type ClaimTurn } from "./claim";
import { closeParts, compareEquationSaid, currentPart, evaluateSteps, evaluateTeaching, partBoards, partCovered, partEquationSaid, partIdOf, stepsBeforeLastPart, withEvaluateExample } from "./evaluate";
import { isSpot, spotAnswers, spotReveals, spotSessionPackage, spotStepHeard } from "./spot-error";
import { ACTS, PART_LIMITS, PROPOSAL_VERSION, isModelOutput, readModelOutput, withoutDefaults, withoutNulls, type Act, type ChildAnswer, type HintLevel, type ModelOutput, type Proposal, type Reading, type Severity } from "./proposal";
import { checkSay, checkSentence, trimSay, equationKeysOf, equationsOf, sentencesOf, fractionValue, numberValue, timeValue, valuesOf, sameSayValue, type SayReason, type SayRules, type SayValue } from "./say-check";
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
  // B1a: the digit in a place, and its value (src/lib/maya/place-value*.ts).
  "place-value",
  // A multi-step expression in the order of operations, part by part (evaluate.ts).
  "evaluate",
  // A clock-time question (clock-lines.ts, C3c): count on to the next hour, then the minutes left.
  "time-add",
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

/** maya_closed (2026-11-12): Maya ended an unsolved call on her own (the D-199 two-miss close, the "This one is hard" close), not the child. */
export type Reason = "solved" | "child_stopped" | "time_limit" | "no_response" | "technical_issue" | "content_issue" | "safety" | "maya_closed";
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
  | { type: "proposal"; at: number; proposal: unknown; talkReviews?: TalkReview[]; fallback?: boolean; sent?: string[] }
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
  | { kind: "say"; act: Act; text: string; talkReplaced?: number; talk?: TalkCheck[]; planned?: string }
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
  | "board_wrong_problem"
  /** D-341: the model's own words failed a say check (say-check.ts), or the review of a non-math turn. */
  | "say_check"
  | "say_review";

export interface Refusal {
  code: RefusalCode;
  reason: string;
  /** D-341: the say check's reason, or "review" for the review of a non-math turn. */
  say?: SayReason | "review";
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
  /** D-341: code's own plan for a turn Maya said in the model's words (what code would have said). */
  planned?: string;
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
  /**
   * D-341: a conversational call. The opening is code's own (openingLine) at the start, with no model call, and the model
   * writes every other word Maya says (version 3 output, checked by say-check.ts). A saved session from before has none.
   */
  conversational?: boolean;
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
  /**
   * Maya closed with the honest close (lessons from review 10): only that close fitted (teachingActs), so the call ends
   * as the child stopping, also from a confirm (closeCause).
   */
  honestClose?: boolean;
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
  /**
   * How many times Maya showed each target step at H3 in this call (PR #698 round 4). The child's new try after the easier
   * example starts the ladder of its step again, so the show is kept here: a copy of a shown step still goes past it with
   * no credit, and a step is never shown a third time. A saved session from before has no field (read from the ladder).
   */
  shows?: Record<string, number>;
  /**
   * The steps where Maya checked a doubtful right answer together (check.guess, check.together; D-253 item 17, PR #698
   * round 4): once per step in a call, and after it the same doubtful answer is never confirmed again. A saved session
   * from before has no field (none).
   */
  doubtChecks?: string[];
  /**
   * How many of Maya's guides on each step said a carry or trade explanation (step.regroup, step.why, step.order; PR #698
   * round 5). The first two on a step answer the child's carry question as no new help (D-253 item 6); after them such a
   * guide counts in the loop guard's row like any other. A saved session from before has no field (none).
   */
  carryLines?: Record<string, number>;
  /**
   * The steps whose setup Maya said back (step.operation after the child said the column's addition; D-253 item 10, PR
   * #698 round 5): once per step it is no new help; after it the operation line counts like any other guide. A saved
   * session from before has no field (none).
   */
  setupEchoed?: string[];
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
  /**
   * A claim's result Maya asked about in that confirmation (claimResultAsked, claim.ts): the only number a yes credits for
   * the compare step. A confirm for any other reason ("My mom said 1440 or 1436.") leaves it null, so its yes credits nothing.
   */
  resultAsked?: AnswerValue | null;
  /** A claim's bare word Maya said back in her last turn (confirm.word, claim.ts): a plain yes commits it. Any other act clears it. */
  wordAsked?: string | null;
  /** Maya's last accepted turn asked the claim itself (claim.ts, claimQuestionAsked): only then is a bare word a claim turn. */
  claimAsked?: boolean;
  /**
   * The loop guard (PR #698): the current column whose total the child said in child turns in a row that code could not
   * credit (heldStepNow), how many, and whether Maya then asked its confirm. A saved session from before has no field.
   */
  heldStep?: { step: string; times: number; asked: boolean };
  /**
   * The loop guard's prompt count (PR #698, rounds 2 and 3): Maya's last guide prompt as its step, help level and step
   * lines ("ones|0|step.invite"), how many of her guides on that step in a row said no help above the row's highest
   * (`top`, round 3: counted by step and level, never by the exact lines, so H1 then H0 then H1 is a row of three), and
   * the lowest help she may give on the step after the guard made the help climb (`floor`). An act that moves the
   * teaching on ends the row (PROMPT_ROW_ENDS), and so does a credited step or a copy of the shown step; the floor stays
   * while the step is the same. `shown` (round 3): Maya showed the step (H3, with any other lines) and the child has made
   * no progress since; the row's end does not clear it, so the easier example and its new try never lead to a second
   * show. A saved session from before has no field, or no `top` (read as `level`) and no `shown`.
   */
  prompt?: { step: string; level: number; key: string; times: number; floor: number; top?: number; shown?: true };
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
  /** D-341: a conversational call (see Session.conversational). */
  conversational?: boolean;
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
    ...(input.conversational ? { conversational: true } : {}),
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

/**
 * The package check Maya teaches under: the default check, with Maya's wider operand limits only for a package her
 * session adapter made (src/lib/maya-teaching, operationSource "maya-teaching"). The adapter checks its output here too.
 */
export function mayaPackageCheck(raw: unknown): PackageCheck {
  // A missing number's framing steps are Maya's own: her check computes them again (missing-number.ts).
  return checkMissingNumber(raw, teachingLimits(raw)) ?? checkQuestionPackage(raw, undefined, teachingLimits(raw));
}

/**
 * The one rule for every miss count on a missing number and on a claim's word, a fail-closed allow-list (reviews of #732
 * at 5ad7cf4b and 2c25d53c, lesson 6, D-199, Savar Brain P6): a turn can be a miss only when the child's own words are a
 * committed answer in an allowed form. That is one sentence on one line with no question mark (wholeTurn, sentenceCount),
 * no help request in any clause (helpInWords), no hedge (hedgedTurn, the controller's one doubt check), and then:
 * - a missing number: nothing taken back (takenBack), no copy of what H3 showed (copiesShownTry), and a final answer the
 *   D-199 reader holds committed (readAnswer's `sure`: plain answer words only, as "7.", "It's 7.", "I got 7.",
 *   "7 centimetres" or the step's own equation "5 times 236 is 1170.");
 * - a claim: a word the claim reader holds committed (claimCommitted: "It's no.", "The answer is yes.", "I circle false.",
 *   a full comparison it accepts, "6 times 8 is 48, so it's true.", or a plain yes to Maya's "Is no the word you
 *   circle?" after a bare "No.").
 * - other-topic and place-value steps: a committed number, with no copy of a step H3 showed (copiesShown).
 * - place value (B1a, B1b): every answer as a missing number's; a
 *   compare's circled word as a claim's, and its digit steps as numbers (`step`: the step the checked answer is for).
 * Everything else is never a miss, whatever a model reads: help in any position ("Help, no.", "No, help me.", "I'm stuck,
 * but it's 7."), hedges, questions, copies, negation, corrections, mixed turns. Every other package: unchanged (true).
 */
function committedTurn(s: Session, step = "result"): boolean {
  const claim = sessionClaim(s.package);
  const place = isPlaceValue(s.package) || isSpot(s.package);
  const topic = !!s.package && (topicQuestion(s.package.text, s.package.operation) || !!patternOf(s.package));
  if (!isMissingNumber(s.package) && !claim && !place && !topic) return true;
  if (!s.turn) return false;
  const text = s.turn.text;
  if (wholeTurn(text) === null || sentenceCount(text) !== 1 || helpInWords(text) || hedgedTurn(s) || saysCopied(text)) return false;
  if (claim && !((place || topic) && step !== "result")) return claimCommitted(claimTurn(s));
  if (copiesShownTry(s) || ((place || topic) && copiesShown(s))) return false;
  const opts = readOptionsIn(s);
  if (takenBack(text, opts) !== null) return false;
  // A place-value step's own committed forms count as its answer ("The digit is 5.", "5 ten thousands"): the templates
  // that credit it (place-value-turns.ts, place-value-parts-turns.ts), whatever number they hold (review of 9884b94e, P2).
  if (place && placeTemplate(s, step, wholeTurn(text)!)) return true;
  const read = readAnswer(text, opts);
  return read.final !== null && read.sure;
}

/** The whole turn is one of this place-value step's own templates, with any number (a committed answer, right or wrong). */
function placeTemplate(s: Session, step: string, body: string): boolean {
  const at = s.package ? workSteps(s.package).find((x) => x.id === step) : undefined;
  if (at?.kind === "read-digit") return digitTemplate(body, at.place) !== null;
  if (at?.kind === "bigger") return biggerTemplate(body, at) !== null;
  if (at?.kind === "place-worth") return worthTemplate(body, at) !== null;
  return false;
}

/** The child says the number is a copy ("I copied 5.7.", "I'm copying it"): never their committed answer (review of 9884b94e, P2). */
const saysCopied = (text: string) => /\bcop(?:y|ied|ies|ying)\b/i.test(text);

/** The sentences of a turn: an end mark not inside a decimal ("3.45 plus 2.38 is 5.83." is one). */
const sentenceCount = (text: string) => text.split(/[.!?]+(?!\d)/).filter((x) => x.trim() !== "").length;

/**
 * The child's own words hold a number that answers neither the current step nor the question, as code checks them:
 * on a missing number at the top hint, it takes the way out even when no reading of it stands (a number taken back by
 * a negation or a correction: "I'm not stuck, it's 7.", "I'm stuck I mean 7"). Right work is never stray (round 10 of
 * #732): a number of a credited step's own equation or its value ("236 times 6 is 1416." again, once the try is
 * credited) keeps the call on the step Maya asks for.
 */
function strayNumber(s: Session): boolean {
  const pkg = s.package;
  if (!pkg || !s.turn) return false;
  const st = workSteps(pkg).find((x) => x.id === s.ladder.step);
  const credited = creditedNumbers(s);
  return valuesIn(s.turn.text, readOptionsFor(pkg)).some((v) => !rightForQuestion(pkg, v) && !(st && answersStep(st, v)) &&
    !(v.type === "number" && credited.includes(v.value)));
}

/** The numbers of the child's credited steps, as code writes them: each done step's equation and its values. */
function creditedNumbers(s: Session): number[] {
  const pkg = s.package;
  if (!pkg) return [];
  return workSteps(pkg).filter((st) => s.done.includes(st.id)).flatMap((st) => [
    ...(stepEquation(st, pkg)?.match(/\d+(?:\.\d+)?/g) ?? []).map(Number),
    ...stepAnswers(st).flatMap((v) => (v.type === "number" ? [v.value] : [])),
  ]);
}

/** The reading judged a number of the child's question wrong. */
const wrongTarget = (reading: Reading) => (reading.answers ?? []).some((a) => (a.problem ?? "target") === "target" && a.verdict === "wrong");

/** The turn holds a real miss on the child's question: a checked wrong answer in a committed turn (committedTurn). */
const realMissNow = (s: Session, reading: Reading) => committedTurn(s) && wrongTarget(reading);

/**
 * A missing number before two real misses (D-199): the current step's failed attempts, this turn's included, and the
 * wrong final answers, each fewer than two. Help requests and copies are never misses (lessons 7 and 13). Until then the
 * way out is the easier example and the honest close, never a given answer; after, the path's given answer stands.
 */
const missingWayOut = (s: Session, reading: Reading, misses: number) =>
  isMissingNumber(s.package) && s.ladder.failures + (realMissNow(s, reading) ? 1 : 0) < 2 && misses < 2;

/**
 * After H3 on a try step, the child's turn only says back what H3 showed ("236 times 5 is 1180.", "5."): every number in
 * it, as code reads the child's own words, is one H3 showed, and it names the try or its product (trial-factor.ts
 * shownNumbers). A copy of Maya's help, never a miss (lesson 13), whatever value a model reads in it: it sets no failure
 * and raises no unlock; on a missing number it leads to the easier example, then the honest close (missingWayOut).
 */
function copiesShownTry(s: Session): boolean {
  const st = s.package ? workSteps(s.package).find((x) => x.id === s.ladder.step) : undefined;
  if (st?.kind !== "try-factor" || s.ladder.hint < 3 || !s.turn) return false;
  const shown = shownNumbers(st);
  const said = valuesIn(s.turn.text, readOptionsFor(s.package));
  const number = (v: AnswerValue) => (v.type === "number" ? v.value : null);
  return said.length > 0 && said.every((v) => shown.all.includes(number(v) ?? NaN)) && said.some((v) => shown.own.includes(number(v) ?? NaN));
}

/** The package Maya teaches from, or why she holds it (the content hold's reason). */
function teachableOf(raw: unknown): { pkg: OperationPackage | null; held: string | null } {
  const check = mayaPackageCheck(raw);
  if (!check.ok) return { pkg: null, held: check.reason };
  // An item with no operation (a place-value or a drawing item) has no worked steps to teach from: it is held.
  if (!hasOperation(check.package)) return { pkg: null, held: "Maya cannot teach items with no operation yet" };
  // An evaluate question: held when a part cannot be taught; else with an easier example of its shape (evaluate.ts).
  const evaluate = evaluateTeaching(check.package);
  if (evaluate && "held" in evaluate) return { pkg: null, held: evaluate.held };
  const shaped = withEvaluateExample(check.package);
  // A claim question (claim.ts) is taught with its compare step and its circled word, or held.
  const claim = spotSessionPackage(shaped) ?? claimSessionPackage(shaped);
  if (claim && "held" in claim) return { pkg: null, held: claim.held };
  const pkg = structuredClone(claim ? claim.pkg : shaped);
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
  return { expect: "maya", acts: (gate(session, {}) ?? actsNow(session, {}, false, undefined, undefined, true)).acts };
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
    // A clock-time question's count (clock-lines.ts): the minutes it counts, or the time it reaches.
    case "count-on":
      return clockAnswers(step);
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
    case "try-factor":
    case "operate":
      return [number(step.value)];
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
    case "read-digit":
      return [number(step.digit)];
    // B1b: the bigger digit, and a digit's value (place-value-parts-turns.ts).
    case "bigger":
    case "place-worth":
      return [number(partsStepTotal(step))];
    // A claim's compare step (claim.ts): the result the child puts together.
    case "claim-compare":
      return [number(step.value)];
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
    // An evaluate question's steps are its parts' columns and the parts (evaluate.ts), then the result.
    ? { operation: pkg.operation, steps: pkg.operation.kind === "evaluate" ? [...teachSteps(pkg), ...pkg.steps.filter((st) => st.kind === "result")] : pkg.steps, answer: pkg.answer }
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
    (v.type === "remainder" && isWholeAt(v.quotient, 0) && isWholeAt(v.remainder, 0)) ||
    // A clock time of a clock-time question (clock-times.ts, C3c): the 24-hour clock with no period, as its package keeps it.
    (v.type === "time" && isWholeAt(v.hours, 0) && (v.hours as number) <= 23 && isWholeAt(v.minutes, 0) && (v.minutes as number) <= 59 && v.period === null));
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
        return "each answer needs a number, fraction, mixed number, remainder or clock-time value, a step and a verdict";
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
  /** Only the honest close fits (lessons from review 10): the close must say close.honest, and the call is the child stopping. */
  honestClose?: true;
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
    // A claim's result in another person's words or a copy ("My mom said 1440."): no confirm either (claim.ts, #737 P1).
    if (stepOnlyTurn(s) || claimJudgedWrong(s) || claimResultUnconfirmable(s)) return null;
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

/** Two wrong final answers once every work step is done, and no answer stands: the backup close, with no answer (D-326). */
function backupCloseDue(s: Session, rightResult: boolean, misses: number): boolean {
  const main = isTeaching(s.state) ? s.state : s.resume;
  return misses >= 2 && !rightResult && s.solved === null && !!main && FINAL_GIVE_STATES.includes(main);
}

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
  // A final "?" only on forms that are questions; "I'm stuck?" stays an unclear turn (controller-fixes #605 test).
  return /^(?:(?:please|um|okay) )*(?:(?:help(?: me)?(?: please)?|i need help|i(?:'m| am) stuck|show me|i don't know how|i don't get it)[.!]?|(?:can|could|will) you help(?: me)?[.!?]?)$/i.test(turn)
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

/**
 * A turn that only asks for help on an "other-topic" question (topic-frame.ts) not yet solved: the model reads help, or
 * code reads a help request, and there is no answer and no right result. The one test for the easier example and the
 * honest close after the top hint (lessons from review 7 and 10). A wrong answer is a miss, not a help request (D-199).
 */
function topicHelpOnly(s: Session, reading: Reading, rightResult: boolean): boolean {
  return !!s.package && topicQuestion(s.package.text, s.package.operation) && s.solved === null && !rightResult && s.turn !== null &&
    (reading.help !== undefined || asksForHelp(s.turn.text)) && !reading.answers?.length;
}

function asksWhy(text: string): boolean {
  return /^\s*why\W*$/i.test(text) || /\b(?:why|where|what|how)\b[^.!\n]*\b(?:carry|carried|regroup\w*|trad\w*|ten|10|one|1)\b/i.test(text);
}
/** After H3 on a work step, the child's turn only says back the step Maya showed (no credit, #698): still stuck (B1b). */
function copiesShown(s: Session): boolean {
  const st = s.package ? workSteps(s.package).find((x) => x.id === s.ladder.step) : undefined;
  // Only after Maya showed the step (H3): at a lower top help (a step with no H3) the child's number is their own.
  return !!st && s.ladder.hint >= 3 && s.turn !== null && valuesIn(s.turn.text, readOptionsFor(s.package)).some((v) => stepAnswers(st).some((a) => equivalent(a, v)));
}
/** The child asks why (asksWhy), or, on a place-value question, which place is which (asksPlace, J06). */
// F2 (practice 2026-11-12): on a pattern question any "why" ("Why do I divide by eight?", "Why only three steps?") asks
// for code's step.why, never the plan line again.
const asksWhyIn = (s: Session): boolean => s.turn !== null && (asksWhy(s.turn.text) || (isPlaceValue(s.package) && asksPlace(s.turn.text)) ||
  (!!s.package && !!patternOf(s.package) && /\bwhy\b/i.test(s.turn.text)));

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
  // Round 4: a step shown twice in the call has no show left (never a third).
  const showLeft = (s.shows?.[s.ladder.step] ?? 0) < 2;
  return offersFor(s, "guide", view).filter((o) => o.level !== undefined && (o.slots.step === undefined || o.slots.step === s.ladder.step) && sayable(o) && (o.level < 3 || showLeft)).map((o) => o.level!);
}

/**
 * The top help Maya can say on the ladder's step now: H3 for a work step, H2 on a place-value last step, H0 for a final
 * step with its one invite, below any level that would say the answer or a third show (sayableHints).
 */
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
  // A question type with its own way out (ownWayOut: the waves' top help, easier example and honest close) keeps it.
  if (ownWayOut(pkg)) return null;
  const main = isTeaching(s.state) ? s.state : s.resume;
  if (!main || !["ASSESS", "MODEL_EXAMPLE", "TRY_TARGET", "GUIDE_TARGET"].includes(main)) return null;
  const steps = pkg.easierExample.steps.length;
  if (main === "MODEL_EXAMPLE" && s.exampleShown < steps) return null;
  if ((reading.answers ?? []).some((a) => (a.problem ?? "target") === "target" && (a.verdict !== "wrong" || committedValue(s, a)))) return null;
  if (reading.help === undefined && !asksForHelp(s.turn.text)) return null;
  // Round 5: the easier example's end takes the ladder back below the show (afterExample), so the child's next turn is a
  // real turn. Decision (a) still holds for a turn that only asks for help right after the example, when this step's top
  // help (its show) came before it: the honest close.
  const topBefore = main === "MODEL_EXAMPLE" && s.exampleShown >= steps && (s.shows?.[s.ladder.step] ?? 0) > 0;
  if (copiedStep(s) !== null || (helpHint(s) < topHint(s) && !topBefore)) return null;
  return s.exampleShown < steps && !exampleRevealsAnswer(s) ? "example" : "close";
}

/** The acts allowed now (teachingActs), with a claim question's own adjustments (claim.ts). */
function actsNow(s: Session, reading: Reading, rightResult: boolean, progress = s.done.length > 0, misses = s.finalMisses ?? 0, offering = false): Allowed {
  // A claim question gives its word only as D-199 gives a number (claim.ts).
  const allowed = teachingActs(s, reading, rightResult, progress, misses, offering);
  if (!sessionClaim(s.package)) return allowed;
  // A child who only asks for help at the top of a claim's final step closes honestly (claim.ts, lesson 10).
  const helpOnly = claimHelpOnly(s, reading, rightResult);
  const stuck = s.ladder.step === "result" && s.ladder.hint >= 2 && helpOnly;
  // ...but first the easier example, when it was not worked and the child did nothing yet (lesson 10, #737 review P2).
  const acts = claimActs(s.package, allowed.acts, stuck, helpOnly && claimExampleDue(s));
  if (acts[0] === "example_step" && !allowed.acts.includes("example_step") && !acts.some((a) => a === "guide")) {
    return { acts, code: "act_not_allowed", reason: "The child only asks for help and has not seen the easier example: show it now (example_step), never the answer." };
  }
  return { ...allowed, acts };
}

/** A turn that only asks for help ("I'm stuck.", "Show me."), with no right answer in it, while nothing is solved. */
function claimHelpOnly(s: Session, reading: Reading, rightResult: boolean): boolean {
  return s.solved === null && !rightResult && s.turn !== null && (reading.help !== undefined || asksForHelp(s.turn.text)) &&
    !(reading.answers ?? []).some((a) => a.verdict === "right");
}

/**
 * A claim question whose easier example is not worked yet, and whose child has done no step of their own. A place-value
 * compare (a claim too, place-value-claim.ts) has its own way out, the place-value rule of teachingActs: the steps'
 * help up to the top help, then the easier example, then the honest close (B1b, PVC07, PVC09).
 */
function claimExampleDue(s: Session): boolean {
  return !!s.package && !!sessionClaim(s.package) && !isPlaceValue(s.package) && s.exampleShown < s.package.easierExample.steps.length && s.done.length === 0 && s.solved === null;
}

function teachingActs(s: Session, reading: Reading, rightResult: boolean, progress: boolean, misses: number, offering: boolean): Allowed {
  // Maya may check what she heard before she goes on, but not a third time in a row (practice run 6, F06: "16 or
  // 60?" eleven times after the child said 16 each time), and not once the answer is accepted (run 5, F05: "Just
  // checking, was that 66?" after "You got it!"). An unclear turn still gets its two confirmations (gate).
  // A doubtful yes to "Did you say 66?" that says 66 again gets a check of the work, never another "Did you say" (#605).
  // Round 4 (#698, F02-r1, F03-r3): once Maya checked a doubtful right answer together (doubtChecks), a right answer the
  // child is not sure of is never confirmed again in the call; the check (doubtCheckDue) or the help goes on.
  const again = s.turn !== null && s.package !== null && (
    (s.heardAsked != null && sameFinal(s, s.heardAsked) && doubtfulRight(s)) || ((s.doubtChecks?.length ?? 0) > 0 && unsureRight(s)));
  // ...and only for what was not clear (#605: "I carry the 1 to the tens" got "Was that 1?"): a turn code or the model
  // read as unclear, numbers speech heard two ways, a choice, or a final answer the child is not sure of.
  const confirm: Act[] = s.opened && s.turn && s.confirmTries < 2 && s.solved === null && !again && !claimJudgedWrong(s) && !claimResultUnconfirmable(s) &&
    (stepSaidUnheard(s) || claimResultUnheard(s) || (notClear(s, reading) && !stepOnlyTurn(s))) ? ["confirm"] : [];
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
  // Rule D (2026-11-12): a turn that says the right value and is held back only by its form ("7 + 9 is 16. Is that right?",
  // "I think it's 66.", "You said 16.") is no miss and no stuck turn: Maya asks her confirm, and the turn counts toward no
  // loop guard, way out or honest close. A request for help, a wrong value or a guess still counts as before.
  const held = !again && s.opened && s.confirmTries < 2 ? formHeld(s, reading) : null;
  if (held && !rightResult) {
    return { acts: ["confirm"], code: "confirm_first", reason: `The child said ${valueText(held)} but not as a committed answer: ask once if that is what they said (confirm.heard ${valueText(held)}).` };
  }
  // Help requests alone never lead to the answer (#735, decision (a)): after the top hint, the easier example, then an
  // honest close (stuckWayOut).
  const way = stuckWayOut(s, reading, rightResult);
  if (way === "example") {
    return { acts: ["example_step", ...confirm], code: "act_not_allowed", reason: "The child still only asks for help after the top hint: work the easier example (example_step). Help alone never gets the answer." };
  }
  if (way === "close") {
    return { acts: ["close"], code: "act_not_allowed", reason: `The child still only asks for help after the top hint and the easier example: close honestly with ${stuckCloseLine(s)}, with no answer.` };
  }
  // H3 already showed this step and the child misses it again: close without the answer. A turn that only copies or acknowledges the
  // shown step, or asks about the next one (copiedStep: "16", "Got it.", "Where does the 1 go?"), is no miss.
  const rightHere = reading.answers?.some(a => (a.problem ?? "target") === "target" && a.step === s.ladder.step && a.verdict === "right");
  const needsMore = reading.help !== undefined || (s.turn !== null && asksForHelp(s.turn.text)) ||
    (reading.answers?.some(a => (a.problem ?? "target") === "target" && a.verdict === "wrong") && !copiesShownTry(s));
  // A pattern has no given answer (lessons 7 and 10): a child still stuck at a step's top help (H3, or H2 on the last part),
  // or who only says back the step Maya showed (lesson 13), gets the easier example, then the honest close (pattern.close).
  const patternTop = s.package && patternOf(s.package) ? packageLines(s.package).patternTop(s.ladder.step) : null;
  if (patternTop !== null && s.solved === null && !rightResult && ((s.turn !== null && !rightHere && s.ladder.hint >= patternTop &&
      (needsMore || copiesShown(s))) || (misses >= 2 && FINAL_GIVE_STATES.includes(main)))) {
    return s.exampleShown < steps
      ? { acts: ["example_step", ...confirm], code: "act_not_allowed", reason: "The child is still stuck: show the easier pattern, step by step (example_step). No answer is given (D-306)." }
      : { acts: ["close"], code: "act_not_allowed", reason: "The child is still stuck after the easier pattern: close honestly (pattern.close), never with the answer." };
  }
  // An "other-topic" question (topic-frame.ts) whose one step is its answer has no H3 to show. A child who only asks for
  // help at its top hint gets the easier example, then an honest close with no answer (lessons from review 7 and 10;
  // controller decision (a)). A wrong answer is a miss, not a help request: D-199 is unchanged.
  if (topicHelpOnly(s, reading, rightResult) && (s.ladder.hint >= 2 || s.exampleShown >= steps)) {
    return s.exampleShown < steps
      ? { acts: ["example_step", ...confirm], code: "act_not_allowed", reason: "The child still only asks for help at the top hint: show the easier example, step by step (example_step)." }
      : {
        acts: ["close"], code: "act_not_allowed", honestClose: true,
        reason: "The child still only asks for help after the easier example: close honestly with the close.honest line (this one is hard, it's fine to stop), never with the answer.",
      };
  }
  // Place value has no given answer (parent lane, 2026-11-07): a child still stuck gets the easier example, then an honest close.
  // The step's top help is its highest line (topHint): H2 on a last step (and a zero digit's step), else H3 (review of #738:
  // "I'm stuck." again and again on a last step met H2 forever). `misses` counts only committed answers (committedTurn).
  if ((isPlaceValue(s.package) || isSpot(s.package)) && s.solved === null && !rightResult && ((s.turn !== null && !rightHere && s.ladder.hint >= topHint(s) && (needsMore || copiesShown(s))) ||
      (misses >= 2 && FINAL_GIVE_STATES.includes(main)))) {
    return s.exampleShown < steps
      ? { acts: ["example_step", ...confirm], code: "act_not_allowed", reason: "The child is still stuck: show the easier example, step by step (example_step). No answer is given (D-306)." }
      : { acts: ["close"], code: "act_not_allowed", reason: "The child is still stuck after the easier example: close kindly with its own honest close, never with the answer." };
  }
  // A missing number's way out (review of #732, lessons 7, 10 and 13, D-199): only a committed answer is a miss
  // (committedTurn). Before two real misses (missingWayOut), at the step's top hint a turn
  // that is no real miss but asks for help, copies, or holds a number (said or read) gets the easier example, then the
  // honest close. After two real misses, D-199 stands.
  if (missingWayOut(s, reading, misses) && isTeaching(s.state) && s.solved === null && !rightResult && s.turn !== null && !rightHere &&
      s.ladder.hint >= topHint(s) && !realMissNow(s, reading) &&
      (reading.help !== undefined || helpInWords(s.turn.text) || copiesShownTry(s) || wrongTarget(reading) || strayNumber(s))) {
    return s.exampleShown < steps
      ? { acts: ["example_step", ...confirm], code: "act_not_allowed", reason: "The child asks for help (or copies the hint) at the top hint: show the easier example, step by step (example_step). Help is never a miss." }
      : { acts: ["close"], code: "act_not_allowed", reason: "The child is still stuck after the easier example: close kindly, with no answer and no number of the question." };
  }
  // After the whole easier example, a committed wrong answer on a missing number is answered on the step (guide), as a
  // right one is: never a dead end (review of #732, MN14).
  if (isMissingNumber(s.package) && main === "MODEL_EXAMPLE" && s.exampleShown === steps && realMissNow(s, reading) && !acts.includes("guide")) acts = [...acts, "guide"];
  const missed = reading.answers?.some(a => (a.problem ?? "target") === "target" && a.verdict === "wrong" && committedValue(s, a));
  if (s.solved === null && !rightResult && !rightHere && s.turn !== null && s.ladder.step !== "result" && copiedStep(s) === null &&
      s.ladder.hint >= 3 && missed && (!noStart || s.retried)) {
    if (!ownWayOut(s.package)) return { acts: ["close"], code: "act_not_allowed", reason: "Close honestly without giving the answer." };
    // A question type with its own way out: after a second committed miss on the shown step (D-199's two misses), its
    // easier example, then its honest close, never the answer (D-306; as the review of 9884b94e asked for claims, P1).
    if (s.ladder.failures + 1 >= 2) {
      return s.exampleShown < steps && !exampleRevealsAnswer(s)
        ? { acts: ["example_step", ...confirm], code: "act_not_allowed", reason: "Two committed wrong answers after the shown step: show the easier example (example_step), never the answer." }
        : { acts: ["close"], code: "act_not_allowed", reason: `Two committed wrong answers after the easier example: close honestly with ${stuckCloseLine(s)}, never with the answer.` };
    }
  }
  // Two wrong final answers once every column is done: the final step has only its gentlest help, already given, so
  // Maya closes without the answer (D-326). Never over a right answer.
  if (backupCloseDue(s, rightResult, misses)) {
    // A question type with its own way out (ownWayOut) gets its easier example first, then its honest close, never the
    // answer or a claim's word (review of 9884b94e, P1: "It's no." twice on 4 × 360 > 1436 got "The answer is yes.").
    if (ownWayOut(s.package) && s.exampleShown < steps && !exampleRevealsAnswer(s)) {
      return { acts: ["example_step"], code: "act_not_allowed", reason: "Two committed wrong answers: show the easier example, step by step (example_step), never the answer." };
    }
    return {
      acts: ["close"], code: "act_not_allowed",
      reason: "Close honestly without giving the answer.",
    };
  }
  // The loop guard (PR #698): the same column's total twice in words code cannot credit gets the step confirm; after it,
  // and after the same step prompt twice in a row (once at H3), the next help up, and at the top help the stuck way out:
  // the easier example, then the honest close (loopGuard). Never over a step this turn did right.
  const loop = s.solved === null && !rightResult && !rightHere ? loopGuard(s) : null;
  if (loop === "confirm") {
    const total = heldStepNow(s)!;
    return { acts: ["confirm"], code: "confirm_first", reason: `The child said ${valueText(total.value)} for ${total.step} again in words code cannot credit: ask once if that is what they said (confirm.heard ${valueText(total.value)}).` };
  }
  if (loop === "climb" && s.ladder.step === heldStepNow(s)?.step && nextHint(s) === null) {
    return repeatWayOut(s) === "example_step"
      ? { acts: ["example_step"], code: "act_not_allowed", reason: "Maya gave this step's top help and it is still not clear: work the easier example (example_step), never the same help again." }
      : { acts: ["close"], code: "act_not_allowed", reason: `This step is still not clear after the top help and the easier example: close honestly with ${stuckCloseLine(s)}, with no answer.` };
  }
  // A repeated prompt ("repeat") is Maya's own words, not the turn's: propose refuses only that prompt again. At the top
  // help the way out is offered beside the other acts, and code's fallback takes it (fallbackProposals). Before the reading
  // (offering) a right answer may still come, so nothing is added.
  if (loop === "repeat" && !offering && nextHint(s) === null && acts.includes("guide") && !acts.includes(repeatWayOut(s))) acts = [...acts, repeatWayOut(s)];
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
  // D-341: a version 3 output (the model's own words in `say`) is read with its plain defaults left out.
  const v3 = event.type === "proposal" && isModelOutput(event.proposal);
  const raw = event.type === "proposal" ? (v3 ? readModelOutput(event.proposal) : plainReading(withoutNulls(event.proposal))) : undefined;
  const shape = event.type === "proposal" ? (v3 ? outputProblem(raw) : proposalProblem(raw)) : null;
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
      } else if (s.conversational) openConversation(s, effects);
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
      if (shape) return { session: s, effects, refusal: { code: "invalid_proposal", reason: shape, allowed: (gate(s, {}) ?? actsNow(s, {}, false)).acts } };
      {
        // D-341: sentences already streamed to the child (onSayPart) stay said: the turn's words start with them.
        const sent = Array.isArray(event.sent) ? event.sent.filter((x): x is string => typeof x === "string" && x.trim() !== "") : [];
        if (v3) return proposeV3(s, raw as ModelOutput, effects, event.talkReviews === undefined ? undefined : reviewsOf(event.talkReviews), sent);
        return withSent(propose(s, raw as Proposal, effects, reviewsOf(event.talkReviews), event.fallback === true), sent);
      }
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
  const heard: Reading = yes ? { ...said, answers: [yes] } : said;
  // A claim question's word is read by code, never by the model (claim.ts).
  // A spot-the-error word before its fix is known is no answer yet (spot-error.ts).
  const claimed = yes ? heard.answers : spotAnswers(pkg, claimAnswers(claimTurn(s), heard.answers, s.solved !== null && s.lastResult === "right"), s.done);
  const reading: Reading = sessionClaim(pkg) ? { ...heard, answers: claimed } : heard;
  if (p.act === "give_answer") return no("act_not_allowed", "The answer is not offered.", (gate(s, reading) ?? actsNow(s, reading, false)).acts);
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
    if (problem) return no(problem.code, problem.reason, actsNow(s, reading, false).acts);
  } else if (blocked?.code === "stop_first" && p.act === "close" && (reading.answers ?? []).length > 0) {
    // The close after a stop still records the child's final answer when it checks; a bad reading never blocks a stop.
    const finals: Checked[] = [];
    if (!checkAnswers(s, reading.answers!, finals)) checked.push(...finals.filter((c) => c.problem === "target" && c.answer.step === "result"));
  }
  // A step the child said in words code hears (stepTurnHeard) is never passed over by a reading that names no answer
  // (first-ship practice, F06: "Seven plus nine is sixteen." got "Thank you for telling me. Can you try 27 + 39?"). Only a
  // refusal: the credit comes, as before, from a reading or code's fallback that names it.
  if (!blocked && pkg && ["guide", "try_target", "example_step", "clarify"].includes(p.act) && (reading.answers ?? []).length === 0) {
    const missed = heardAnswers(s).find((a) => a.step !== "result" && a.verdict === "right");
    if (missed) return no("invalid_proposal", `The child said ${valueText(missed.value)} for "${missed.step}": read it in reading.answers and answer it.`, actsNow(s, reading, false).acts);
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
  const teaching = blocked ? null : actsNow(s, reading, rightResult, progress, misses);
  const allowedNow = blocked ? blocked.acts : teaching!.acts;
  const backupClose = !blocked && !rightResult && s.solved === null && allowedNow.length === 1 && allowedNow[0] === "close";
  if (teaching && !allowedNow.includes(p.act)) return no(teaching.code, teaching.reason, teaching.acts);

  // 3. The ladder after this reading: failures and requests raise what help is allowed; right steps move on.
  const scoring = !blocked;
  // The loop guard, as teachingActs read it for this turn (loopGuard), and the column the turn holds back (heldStepNow).
  const loop = scoring && s.solved === null && !rightResult ? loopGuard(base) : null;
  const heldNow = scoring ? heldStepNow(base) : null;
  const ladder = { ...s.ladder };
  const done = [...s.done];
  const passed = [...(s.passed ?? [])];
  let failed = false;
  let regroup = regroupOf(s);
  if (pkg && scoring) {
    // A copy of the step Maya showed at H3 moves the ladder on, with no credit (copiedStep).
    const copied = copiedStep(s);
    if (copied && !passed.includes(copied)) passed.push(copied);
    // On a missing number and a claim's word only a committed answer in an allowed form is a failed attempt
    // (committedTurn, the one rule; committedValue).
    for (const { answer: a, problem } of checked) {
      if (problem !== "target") continue;
      if (a.verdict === "right" && a.step !== "result" && !done.includes(a.step)) done.push(a.step);
      // An equal fraction is not a failed attempt (#407), and neither is a turn that does not commit to its answer
      // (committedValue: help, a hedge, a copy of what H3 showed, lesson 13).
      if (a.verdict === "wrong" && committedValue(s, a) && !(a.step === "result" && isEqualForm(pkg, a.value))) failed = true;
    }
    // An equal fraction shows every work step done: the final step simplifies the child's own fraction (#407).
    if (equal || claimResultDone(pkg, done)) for (const st of workSteps(pkg)) if (!done.includes(st.id)) done.push(st.id);
    closeParts(pkg, done);
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
    // D-341: a named misconception in the child's turn (turnFacts: 6 for 2 - 8) is a located error too: its regroup help
    // (H2) is allowed at once, so Maya names the mistake and guides the regroup.
    if (misconceptionAt(s, ladder.step)) ladder.unlocked = Math.max(ladder.unlocked, 2);
    // The loop guard climbs: the next help up is allowed now (loopGuard).
    const up = (loop === "climb" || loop === "repeat") && ladder.step === s.ladder.step ? nextHint(base) : null;
    if (up !== null) ladder.unlocked = Math.max(ladder.unlocked, up);
  }
  // A step this turn credited, or a copy of the shown step, is progress: the loop guard's row starts again (loopGuard).
  const progressed = done.some((id) => !base.done.includes(id)) || passed.some((id) => !(base.passed ?? []).includes(id));
  // A guide the loop guard lets through as no repeat (a check or echo of the child's own work, or the carry explanation,
  // each limited on its own) neither counts in its row nor ends it.
  let exempt = false;

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
  // The fixed safety guidance is complete. The following close adds no model or bank words.
  const safetyClose = p.act === "close" && s.state === "SAFETY" && s.safety.guided;
  // Do not select or record model wordings that this fixed opening will not say.
  const spoken: Spoken | { code: RefusalCode; reason: string } = forcedOpening
    ? { text: forcedOpening, lines: [], boards: [], replaced: 0, talk: [], segments: [{ kind: "math", text: forcedOpening }], chosen: [] }
    : p.act === "safety" || safetyClose ? { text: "", lines: [], boards: [], replaced: 0, talk: [], segments: [], chosen: [] } : speak(s, p, view, reviews);
  if ("code" in spoken) return no(spoken.code, spoken.reason, allowedNow);
  const say = spoken.text;
  if (say === "" && !safetyClose && !["wait", "safety"].includes(p.act)) return no("invalid_proposal", "Maya needs words for this act.", allowedNow);
  if (s.noBoard && (p.draw?.length || p.board?.length)) return no("board_not_allowed", "The child cannot see the board. Use spoken help.", allowedNow);
  const role: Problem = p.act === "example_step" ? "example" : "target";
  // The board (R374-6-1, D-197): Maya picks board offers by id (`draw`) and code builds every command from the checked
  // worked step; a command the model built is refused, with free talk on or off. Only the board core's tests read the
  // model's own commands (`modelBoard`).
  if (p.board && !s.modelBoard) {
    return no("board_not_code", "Maya does not build board commands: pick code's board offers with `draw` (see drawOffers).", allowedNow);
  }
  // A place-value line that says Maya drew the chart, a stripe or a circle comes with it, at any hint level (B1a).
  const auto = isPlaceValue(pkg) && !s.noBoard && BOARD_ACTS.includes(p.act) && p.act !== "example_step"
    ? placeAutoDraw(spoken.chosen, Object.hasOwn(s.boardRoles, "question"), (p.draw ?? []).map((d) => d.offer)).map((offer) => ({ offer })) : [];
  const drawn = p.draw || auto.length ? drawBoard(s, { ...p, draw: [...(p.draw ?? []), ...auto] }, view, spoken) : [];
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
  if (pkg !== null && !released && p.act !== "safety" && revealsAnswer(s, pb, spoken, forcedOpening, done)) {
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
      // Round 5 (#698, P1-3): the child's turn after the whole example is a real turn on the step they were on, with or
      // without the new try (try_target is not offered after progress on an earlier step).
      if (s.exampleShown === pkg!.easierExample.steps.length && !s.retried) afterExample(s, ladder);
      moveTo(s, "MODEL_EXAMPLE");
      break;
    }
    case "try_target":
      if (s.exampleShown === pkg!.easierExample.steps.length) {
        // Round 4 (#698, practice on 6a0581bd: C03-r1, C05-r1): the new try after the easier example is a real turn on the
        // child's own question (afterExample). Round 5 makes that reset when the example ends; nothing moves the ladder
        // between, so here it changes nothing, except for a session saved between the two.
        if (!s.retried) afterExample(s, ladder);
        s.retried = true;
      }
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
      // The answer to the child's question about a place (where.place, J06) answers what they asked: no new help either.
      const answersPlace = isPlaceValue(pkg) && s.turn !== null && asksPlace(s.turn.text) && spoken.chosen.some((o) => WHY_KEYS.includes(o.key)) && p.level <= 1;
      // Round 5 (#698, P1-2): the setup is said back once per step (D-253 item 10); after it the operation line is help like
      // any other, under the cap and in the loop guard's row ("So 2 plus 3 plus 1?" fourteen times got it fourteen times).
      const setupEcho = s.turn !== null && spoken.chosen.length > 0 && spoken.chosen.every((o) => o.line === "step.operation") &&
        saidSetup(pkg!, ladder.step, s.turn.text) && !(s.setupEchoed ?? []).includes(ladder.step);
      const echo = checking || answersPlace || setupEcho;
      if (p.level > cap && !echo) return no("hint_too_high", `Help may rise to H${cap} now: more help needs a failed attempt or a request, not silence.`, allowedNow);
      if (echo) {
        exempt = true;
        // Round 4: the check of a doubtful answer comes once per step in a call; after it, that answer is not confirmed again.
        if (checking && !(s.doubtChecks ?? []).includes(p.step)) s.doubtChecks = [...(s.doubtChecks ?? []), p.step];
        if (setupEcho && !checking) s.setupEchoed = [...(s.setupEchoed ?? []), p.step];
        moveTo(s, s.solved !== null ? "CHECK" : "GUIDE_TARGET");
        break;
      }
      // The regroup explanation is new help for a child who lost the carry, whatever level the ladder is on. Round 5 (#698,
      // P1-2): a carry or trade explanation (regroup, why, order) is no repeat only for the first two on a step in a call,
      // and a due regroup (its own limit, MAX_REGROUP_SAYS); after them it counts in the loop guard's row like any other
      // guide, so the help climbs and the stuck way out comes ("Why?" fourteen times got step.why eleven times).
      const regroupNow = spoken.chosen.some((o) => o.line === "step.regroup" || o.line === "step.why" || o.line === "step.order");
      const carryLeft = carryLinesLeft(s, ladder.step);
      const dueRegroup = pendingRegroup(regroup).some((c) => c.at === ladder.step) && spoken.chosen.some((o) => o.line === "step.regroup");
      const carryFree = regroupNow && (carryLeft || dueRegroup);
      exempt = carryFree;
      if (carryLeft && asksWhyIn(s) && offersFor(s, "guide", view).some(o => o.line === "step.why") &&
          !spoken.chosen.some(o => o.line === "step.why")) {
        return no("line_not_offered", "The child asked why the carry or trade works: use the offered step.why explanation before another prompt.", allowedNow);
      }
      // A question about the carried digit on the column that takes it ("What do I do with the 1 I carried?") is answered
      // with a line about that carry, never the same invitation again (first-ship practice, C26).
      const carryLine = (o: LineOffer) => o.line === "step.why" || o.line === "step.regroup" || (o.line === "step.point" && o.key === "point.add.carry");
      if (carryLeft && s.turn && asksWhy(s.turn.text) && offersFor(s, "guide", view).some((o) => carryLine(o) && o.slots.step === ladder.step && (o.level ?? 0) <= cap) &&
          !spoken.chosen.some(carryLine)) {
        return no("line_not_offered", "The child asked about the carried digit: answer with the offered line about it (step.point, step.regroup or step.why) before another prompt.", allowedNow);
      }
      if (ladder.failures >= 2 && p.level <= ladder.hint && !carryFree) return no("same_hint_again", `Two attempts failed at H${ladder.hint}: give more help or offer to stop.`, allowedNow);
      // The loop guard (rounds 2 and 3, P1 e): after two guides on the step with no progress and no help above the row's
      // highest, or after its show (H3) once, a guide on the step with no progress must give help above any in the row
      // (loopGuard): other lines with the show, or a lower level and back up, are the same loop. After the guard made the
      // help climb, help on the step never goes back below it: "How about the ones?" again after "Look at the ones column"
      // would start the same loop over.
      // A guide with no step line (only a check or a warm phrase) gives no help: it is never the next help up.
      const helps = spoken.chosen.some((o) => o.line.startsWith("step."));
      // Round 4: a step is shown at most twice in a call (once more after the easier example's new try), never a third time.
      if (p.level >= 3 && helps && (s.shows?.[p.step] ?? 0) >= 2) {
        return no("same_hint_again", `Maya already showed "${p.step}" twice in this call: give the easier example, or close honestly.`, allowedNow);
      }
      if (loop === "repeat" && s.prompt?.step === p.step && (!helps || p.level <= (s.prompt.shown ? 3 : s.prompt.top ?? s.prompt.level)) && !progressed && !carryFree) {
        return no("same_hint_again", `Maya said this help on "${p.step}" just before and it is still not clear: give the next help up${nextHint(base) === null ? ", or the easier example, or close honestly" : ""}.`, allowedNow);
      }
      if (s.prompt?.step === p.step && p.level < s.prompt.floor && !carryFree) return no("same_hint_again", `Maya already gave H${s.prompt.floor} on this step when the same help did not work: never go back below it.`, allowedNow);
      // The loop guard: after its confirm, the same step is never asked again at the same help (loopGuard).
      if (loop === "climb" && p.level <= ladder.hint) return no("same_hint_again", `Maya asked about this step and it is still not clear: give the next help up, above H${ladder.hint}.`, allowedNow);
      if (p.level > ladder.hint) ladder.failures = 0;
      ladder.hint = Math.max(ladder.hint, p.level);
      ladder.unlocked = Math.max(ladder.unlocked, p.level);
      s.highestHint = Math.max(s.highestHint ?? 0, p.level) as HintLevel;
      if (p.level >= 3 && helps) s.shows = { ...(s.shows ?? {}), [p.step]: (s.shows?.[p.step] ?? 0) + 1 };
      if (regroupNow) s.carryLines = { ...(s.carryLines ?? {}), [p.step]: (s.carryLines?.[p.step] ?? 0) + 1 };
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
      // A claim's word is confirmed in code's words: the result and the word the child circles (claim.ts).
      if (sessionClaim(pkg) && !spoken.chosen.some((o) => o.line === "answer.right")) return no("line_not_offered", "Say the child's word back with answer.right.", allowedNow);
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
    {
      // The honest close (#735; the waves' lessons 7, 10 and 13): one rule for every question (honestCloseLines). A
      // question type with its own honest close (a pattern, a claim, an other-topic question, place value, spot the
      // error) says that line, never close.stuck; every other question says close.stuck, then the close.together line
      // that claims no finish, or close.stuck alone when the expression holds the answer. A stop and silence keep their
      // own close; at the time close an unsolved question says close.stuck (#749).
      const own = honestCloseLines(s);
      const stuckSaid = p.parts.some((part) => "line" in part && part.line === "close.stuck");
      const wayOut = stuckWayOut(s, reading, rightResult) === "close";
      if (own.length > 0) {
        if (stuckSaid) return no("line_not_offered", `Close with this question's own honest close (${own[0].line}), not close.stuck.`, allowedNow);
        // A pattern or a claim closed as the way out for a stuck child (lessons 7 and 10) says its honest close in code's
        // words, not only warm talk; so does every close teachingActs gave alone (backupClose, the way out, honestClose).
        const purpose = backupClose || wayOut || teaching?.honestClose === true || (!!patternOf(pkg) && s.solved === null && !s.stopRequested && !reading.stop && s.silence !== "close_due");
        const needed = purpose || (sessionClaim(pkg) && s.solved === null && !s.stopRequested && !reading.stop && s.silence !== "close_due");
        if (needed && !spoken.chosen.some((c) => own.some((o) => o.line === c.line && o.key === c.key))) {
          return no("line_not_offered", `Close honestly with ${own[0].line}: this one is hard, it is fine to stop, and what to try next. No answer.`, allowedNow);
        }
        // The honest close is the child stopping, also when it comes while Maya waits on a confirm (closeCause).
        if (purpose) s.honestClose = true;
        if (backupClose) s.stuckStep ??= ladder.step;
      } else {
        if (backupClose || stuckSaid) {
          const alone = pkg !== null && closeExpressionContainsAnswer(pkg.operation, pkg.answer.value);
          if (p.parts.length !== (alone ? 1 : 2) || !("line" in p.parts[0]) || p.parts[0].line !== "close.stuck" ||
              (!alone && (!("line" in p.parts[1]) || p.parts[1].line !== "close.together"))) {
            return no("line_not_offered", alone ? "Close with close.stuck only." : "Close with close.stuck and close.together in order.", allowedNow);
          }
        }
        if (backupClose) s.stuckStep ??= ladder.step;
        // The honest close after help alone (#735): its own line, which holds no answer.
        if ((wayOut || (s.state === "TIME_CLOSE" && !blocked && s.solved === null)) && !stuckSaid) {
          return no("line_not_offered", "Close honestly with close.stuck: this one is hard, it is fine to stop, and what to try next. No answer.", allowedNow);
        }
        // A missing number closed as the way out for a stuck child says the honest close in code's words (review of #732),
        // never a warm phrase alone. A stop, the time limit and silence keep their own closes.
        if (isMissingNumber(pkg) && !isSpot(pkg) && s.solved === null && !s.stopRequested && s.state !== "TIME_CLOSE" && s.silence !== "close_due" && !stuckSaid) {
          return no("line_not_offered", "Close a missing number the child is stuck on with close.stuck and close.together.", allowedNow);
        }
      }
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
      const guarded = loop === "confirm" ? heldStepNow(base)!.value : null;
      // The loop guard's confirm asks the column's total, the one number its yes credits.
      if (guarded && !(s.heardAsked && saidAs(guarded, s.heardAsked))) return no("line_not_offered", `Ask if the child said ${valueText(guarded)}: confirm.heard with ${valueText(guarded)}.`, allowedNow);
      const total = stepSaidUnheard(s) ? stepConfirmable(s) : guarded;
      s.stepAsked = total && s.heardAsked && saidAs(total, s.heardAsked) ? s.heardAsked : null;
      const result = claimResultAsked(s);
      s.resultAsked = result && s.heardAsked && saidAs(result, s.heardAsked) ? s.heardAsked : null;
      // A claim's bare word said back (claim.ts): a plain yes to it commits that word.
      s.wordAsked = spoken.chosen.find((o) => o.line === "confirm.word")?.slots.heard ?? null;
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
      const pool = firstShipWordings(m.texts).filter((i) => speechWords(m.texts[i]) <= room);
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
    // The loop guard's count: the same column held back turn after turn, and whether Maya asked its confirm (loopGuard).
    if (heldNow && !done.includes(heldNow.step) && !(p.act === "confirm" && formHeld(base, reading))) {
      const prev = base.heldStep?.step === heldNow.step ? base.heldStep : undefined;
      s.heldStep = { step: heldNow.step, times: (prev?.times ?? 0) + 1, asked: (prev?.asked ?? false) || (p.act === "confirm" && loop === "confirm") };
    } else if (s.turn) delete s.heldStep;
    s.done = done;
    if (passed.length > 0) s.passed = passed.filter((id) => !done.includes(id));
    s.ladder = ladder;
    s.finalMisses = misses;
  }
  // The loop guard's prompt count: guides on the same step with no progress, Maya turn after Maya turn (loopGuard). A guide
  // above the row's highest help starts the count at one; any other guide in the row adds one, whatever its lines (round
  // 3). A guide with no step line (a check or a warm phrase only) gives no help, so it counts below every level. A guide
  // said on a turn the guard made climb sets the step's floor.
  const key = scoring && p.act === "guide" && !exempt ? promptKey(p, spoken.chosen) : null;
  if (key !== null) {
    const prev = base.prompt;
    const same = prev?.step === p.step;
    const row = same && prev!.times > 0 && !progressed;
    const top = row ? (prev!.top ?? prev!.level) : -1;
    const level = spoken.chosen.some((o) => o.line.startsWith("step.")) ? p.level! : -1;
    const floor = Math.max(same ? prev!.floor : -1, loop === "repeat" || loop === "climb" ? level : -1);
    const shown = level >= 3 || (same && !progressed && prev!.shown === true);
    s.prompt = { step: p.step!, level: p.level!, key, times: row && level <= top ? prev!.times + 1 : 1, floor, top: Math.max(top, level), ...(shown ? { shown: true as const } : {}) };
  } else if (s.prompt && (PROMPT_ROW_ENDS.includes(p.act) || (scoring && progressed))) {
    // An act that moves the teaching on, or a turn with progress, ends the row; the floor stays, and the show stays until
    // progress. Any other act (a confirm, a wait, a redirect, an exempt guide) neither counts nor ends it, so it cannot
    // reset the count between prompts.
    const { shown, ...rest } = s.prompt;
    s.prompt = { ...rest, key: "", times: 0, ...(shown && !(scoring && progressed) ? { shown } : {}) };
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
  // Only a turn that asks the claim itself lets a bare word answer it next (claim.ts).
  if (sessionClaim(pkg) && claimQuestionAsked(spoken.chosen)) s.claimAsked = true;
  else delete s.claimAsked;
  if (p.act !== "confirm") {
    delete s.heardAsked;
    delete s.stepAsked;
    delete s.resultAsked;
    delete s.wordAsked;
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
    // The backup close at the time limit is a time_limit end (closeCause), never the child stopping (#749). Before the
    // time limit it is Maya's own close (maya_closed, 2026-11-12), never the child stopping either.
    end(s, backupClose && base.state !== "TIME_CLOSE" ? "maya_closed" : closeCause(base, spoken.chosen.some((o) => o.line === "close.stuck") || s.honestClose === true), effects, false);
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
  // A claim's result, confirmed (claim.ts): "Did you say 1440?", "Yes."
  const claim = workSteps(s.package).find((x) => x.kind === "claim-compare" && !behind(s).includes(x.id));
  if (claim && stepTurnHeard(s, claim, value)) return { value, step: claim.id, verdict: "right" };
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
  // A clock-time count (clock-lines.ts, C3c): an hour's 60 minutes, and the times the count starts and stops at.
  const clockOwn = clockValues(step);
  for (const v of clockOwn) if (v.type === "number") own.add(v.value);
  return numberSentences(text, opts).every((sentence) => {
    // "1 ten", "6 ones": a place word after a number names its place, not another number.
    const r = readNumbers(sentence.replace(/(\d|\b(?:one|two|three|four|five|six|seven|eight|nine))\s+(?:tens?|ones?|hundreds?)\b/gi, "$1"), opts);
    if (!r.values.some((v) => saidAs(v, value))) return true;
    return !r.unreadable && r.values.every((v, i) => r.notAnswer[i] || (v.type === "number" && own.has(v.value)) || ownFractions.some(known => saidAs(v, known)) || clockOwn.some((k) => saidAs(v, k)) || saidAs(v, value) || saidAs(v, pkg.answer.value));
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
  if (s.turn.uncertain || reading.unclear || claimUnclear(claimTurn(s))) return true;
  const last = s.turns.map((t) => t.speaker).lastIndexOf("maya");
  if (s.turns.slice(last + 1).some((t) => t.speaker === "child" && (t.alternatives?.length ?? 0) > 0)) return true;
  // A claim's word the child committed to is their answer, whatever the numbers of their reason (claim.ts).
  if (turnRead(s).final?.type === "choice") return false;
  const read = readAnswer(s.turn.text, readOptionsIn(s));
  return read.choice || (read.final !== null && (!read.sure || hedgedTurn(s)));
}

/** A hedge ("I think it's 66", "maybe", a question) is not clear, though the reader may find it sure: the one doubt check. */
function hedgedTurn(s: Session): boolean {
  if (!s.turn) return false;
  return showsDoubt(s.turn.text, readOptionsFor(s.package)) || /\b(?:i think|i guess|i believe|probably|maybe|might be)\b/i.test(s.turn.text);
}

/**
 * The child's own words hold a clear help request, even beside a number ("I'm stuck, but it's 7."): one of the turn's
 * clauses is a help request by asksForHelp. Decided from the text, never the model's reading.
 */
const helpInWords = (text: string) => text.split(/[,;.!?\n]+|\bbut\b/i).some((part) => part.trim() !== "" && asksForHelp(part.trim()));

/** The child's final answer in this turn is this number ("Yes, I said 66. I'm not sure."). */
function sameFinal(s: Session, value: AnswerValue): boolean {
  const final = readAnswer(s.turn!.text, readOptionsFor(s.package!)).final;
  return final !== null && saidAs(final, value);
}

/** The child's final answer in this turn is right for the question, and the reader does not find it sure. */
function unsureRight(s: Session): boolean {
  if (!s.turn || !s.package) return false;
  const read = readAnswer(s.turn.text, readOptionsIn(s));
  return read.final !== null && !read.sure && rightForQuestion(s.package, read.final);
}

/**
 * The check of a doubtful right answer together (check.guess, check.together; D-253 item 17) is due on this step: the
 * child guessed, or said a right answer with doubt, or said it again unsure after Maya's "Did you say 66?" (round 4), and
 * Maya has not checked one together on this step in the call.
 */
function doubtCheckDue(s: Session, step: string): "guess" | "together" | null {
  if (s.solved !== null || !s.turn || !s.package || (s.doubtChecks ?? []).includes(step)) return null;
  if (saysGuess(s.turn.text)) return "guess";
  const yesAgain = s.heardAsked != null && sameFinal(s, s.heardAsked) && unsureRight(s);
  return doubtfulRight(s) || yesAgain ? "together" : null;
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
  // A claim question's circled word is the final answer (claim.ts); a plain yes to "Did you say 5220?" is not.
  return yes ? { kept: [yes], final: yes, choice: false, outside: [yes], sure: true } : claimRead(claimTurn(s), readAnswer(s.turn!.text, readOptionsIn(s)));
}

/** What claim.ts reads a turn with: the package, the child's words, and an open "Did you say ...?" or "Is no the word you circle?". */
const claimTurn = (s: Session): ClaimTurn => ({
  pkg: s.package, text: s.turn?.text ?? null, heardAsked: s.heardAsked != null, wordAsked: s.wordAsked ?? null, claimAsked: s.claimAsked === true,
});

/** #698's numeric form of a committed value (committedValue): the whole turn is that one number in an allowed form. */
function committedNumber(s: Session, a: ChildAnswer): boolean {
  if (!s.package || !s.turn || !heardOneWay(s)) return false;
  const pkg = s.package;
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

/** The child's turn was heard one way: not uncertain, and no turn since Maya's last had another transcript. */
function heardOneWay(s: Session): boolean {
  if (!s.turn || s.turn.uncertain) return false;
  const last = s.turns.map((t) => t.speaker).lastIndexOf("maya");
  return !s.turns.slice(last + 1).some((t) => t.speaker === "child" && (t.alternatives?.length ?? 0) > 0);
}

/**
 * A question type with its own allow-list for misses (committedTurn): a missing number, a claim's word, place value,
 * spot the error, an other-topic question and a pattern. A claim's operation columns keep the operation's own rule.
 */
function ownMissRule(s: Session, step: string): boolean {
  const pkg = s.package;
  if (!ownWayOut(pkg)) return false;
  const claim = !!sessionClaim(pkg);
  const place = isPlaceValue(pkg) || isSpot(pkg);
  const topic = !!pkg && (topicQuestion(pkg.text, pkg.operation) || !!patternOf(pkg));
  return !(claim && !place && !topic && step !== "result");
}

/**
 * A question type the waves teach with its own way out (a missing number, a claim, place value, spot the error, an
 * other-topic question, a pattern): its misses follow committedTurn, and after its easier example a child still stuck
 * at the top help gets its honest close (teachingActs), with no answer.
 */
function ownWayOut(pkg: OperationPackage | null): boolean {
  return !!pkg && (isMissingNumber(pkg) || !!sessionClaim(pkg) || isPlaceValue(pkg) || isSpot(pkg) || topicQuestion(pkg.text, pkg.operation) || !!patternOf(pkg));
}

/**
 * Whether this turn commits to a value, the one rule for counting a miss (a failed attempt or a wrong final answer) or
 * releasing an answer: a turn heard one way, and then the question type's own allow-list (committedTurn) or, for every
 * other question and a claim's operation columns, #698's numeric form (committedNumber). Both fail closed: help, a
 * hedge, a question or a copy is never a miss.
 */
export function committedValue(s: Session, a: ChildAnswer): boolean {
  if (!heardOneWay(s)) return false;
  return ownMissRule(s, a.step) ? committedTurn(s, a.step) : committedNumber(s, a);
}

/**
 * A question type's own honest close (lines.ts closeUnsolved: a pattern, a claim, an other-topic question, place value,
 * spot the error), said in place of close.stuck. None at the time close, where every unsolved question says close.stuck
 * (#749), and none for every other question, which closes with close.stuck (#735).
 */
function honestCloseLines(s: Session): LineOffer[] {
  return s.package && s.state !== "TIME_CLOSE" ? packageLines(s.package).closeUnsolved() : [];
}

/** The line of the honest close this question says now (honestCloseLines), for the reasons code gives the model. */
const stuckCloseLine = (s: Session): string => honestCloseLines(s)[0]?.line ?? "close.stuck";

/**
 * Checks the child's answers: each was said and kept in this turn (after anything taken back, not offered as a choice;
 * a final answer is the last number kept outside the child's explanations, readAnswer, D-199), and each verdict is what
 * code computes. Fills `checked`; returns the first problem.
 */
function checkAnswers(s: Session, given: ChildAnswer[], checked: Checked[], before: readonly string[] = []): { code: RefusalCode; reason: string; unheard?: boolean; held?: boolean } | null {
  const pkg = s.package!;
  if (!s.turn) return { code: "answer_not_heard", reason: "There is no child turn to read an answer from." };
  const read = turnRead(s);
  if (read.choice) return { code: "answer_not_committed", reason: "The child offered more than one answer: ask which one they mean." };
  const heard = read.kept;
  const falseResults = falseEquationResults(s.turn.text, readOptionsFor(pkg));
  const copied = copiedStep(s);
  // Rule A: several steps said in order credit each one, in order. The target's steps are checked in the question's
  // order (the final answer last), and each right step this turn credits counts as done for the next (`earlier`).
  const index = (a: ChildAnswer) => ((a.problem ?? "target") !== "target" ? -1 : a.step === "result" ? Infinity : workSteps(pkg).findIndex((st) => st.id === a.step));
  const answers = [...given].sort((x, y) => index(x) - index(y));
  const earlier: string[] = [...before];
  for (const a of answers) {
    const problem = a.problem ?? "target";
    // A reading of a step this turn only copies (copiedStep, round 4) is no credit, no miss and no refusal: the ladder
    // goes past the step, and the rest of the turn is read as it is.
    // A step code credits as the child's own (stepTurnHeard) keeps its credit.
    if (problem === "target" && a.step !== "result" && a.step === copied) {
      const own = workSteps(pkg).find((x) => x.id === a.step);
      if (!(a.verdict === "right" && own && stepTurnHeard(s, own, a.value, earlier))) continue;
    }
    if (a.verdict === "wrong" && (s.turn.text.includes("?") || asksForHelp(s.turn.text) || /\b(?:help|show me)\b/i.test(s.turn.text) || showsDoubt(s.turn.text, readOptionsFor(pkg)) || saysGuess(s.turn.text))) {
      return { code: "answer_not_committed", reason: "A question or request for help does not commit to a wrong answer." };
    }
    const { operation, steps, answer } = problemOf(pkg, problem);
    const at = steps.find((x) => x.id === a.step);
    if (!at) return { code: "wrong_step", reason: `The ${problem} has no step "${a.step}".` };
    // A spot-the-error result in a sentence with its word ("..., so it's wrong.") is heard by its own whole-turn forms.
    const spotHeard = problem === "target" && at.kind === "claim-compare" && isSpot(pkg) && stepTurnHeard(s, at, a.value);
    if (!spotHeard && !heard.some((v) => saidAs(v, a.value))) return { code: "answer_not_heard", reason: `The child did not say ${valueText(a.value)}, or took it back.` };
    // A wrong final answer the child gave outside an explanation may be judged wrong although a later number is the
    // final one ("I got 56. I did 7 plus 9 is 16, so I wrote the 6. Then 2 plus 3 is 5."): never when the final one is
    // right or the answer stands, and never as right.
    // For the target, "right" follows the question's wording, and an equal fraction also stands ("14/16" for 7/8),
    // so an earlier wrong number is never scored over it (review R409-M1).
    const finalRight = read.final !== null && (problem === "target"
      ? rightForQuestion(pkg, read.final) || isEqualForm(pkg, read.final)
      : isRightAnswer(operation, answer, read.final));
    const loose = a.verdict === "wrong" && s.solved === null && !finalRight && read.outside.some((v) => saidAs(v, a.value));
    // Rule A: the child's own right final answer stands though narration of the columns follows it ("Yes, 66! You said 2
    // plus 3 plus 1 is 6, so I wrote 6."): ownTurn allows no other answer beside it.
    const numeric = ["number", "fraction", "mixed"].includes(a.value.type);
    const ownFinal = numeric && a.verdict === "right" && problem === "target" && ownTurn(s, null, a.value) === null;
    if (a.step === "result" && !saidAs(read.final ?? undefined, a.value) && !loose && !ownFinal) {
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
    const claims = a.step === "result" ? "right" : checkColumnClaims(pkg, at, steps, active, problem === "target" ? claimText(own) : own);
    if (claims === "unclear") return { code: "answer_not_committed", reason: "The written digit or carry is unclear: ask what the child wrote before judging this step." };
    const stepRight = a.step !== "result" && falseResults.length === 0 && claims === "right" && ownSentences(pkg, at, a.value, own) && answersStep(at, a.value);
    const right = !falseResult && (a.step === "result" ? (problem === "target" ? rightForQuestion(pkg, a.value) : isRightAnswer(operation, answer, a.value)) : stepRight);
    // A doubtful final answer cannot establish correct work, including an equal
    // fraction that still needs simplest form and therefore carries a "wrong" verdict.
    const checkedProgress = a.verdict === "right" || (problem === "target" && isEqualForm(pkg, a.value));
    // Rule A: the final answer is the child's own when the turn states it with no blocker (ownTurn), or is a plain yes to it.
    // A word answer (a claim's "true") keeps the reader's own commit rule (readAnswer's sure).
    if (checkedProgress && a.step === "result" && problem === "target" && !numeric && !read.sure) return { code: "answer_not_committed", reason: `The child was not sure of ${valueText(a.value)}: confirm it before treating it as checked progress.` };
    if (checkedProgress && a.step === "result" && problem === "target" && numeric && !yesValue(s) && ownTurn(s, null, a.value) !== null) return { code: "answer_not_committed", reason: `The child was not sure of ${valueText(a.value)}, or did not say it as their own: confirm it before treating it as checked progress.` };
    if (checkedProgress && a.step === "result" && problem !== "target" && !read.sure) return { code: "answer_not_committed", reason: `The child was not sure of ${valueText(a.value)}: confirm it before treating it as checked progress.` };
    if (a.verdict === "right" && !right) return { code: "accepts_wrong_answer", reason: `${valueText(a.value)} is not right for ${a.step}: the checked math says otherwise.` };
    // A column step counts only when the whole turn is heard (stepTurnHeard). Beside a right final answer the child is sure
    // of ("Six, so 66."), the answer stands and the step gets no credit; any other turn goes to the confirm question.
    if (a.verdict === "right" && a.step !== "result" && problem === "target" && !(at.kind === "claim-compare" && !partsClaim(pkg)) && !stepTurnHeard(s, at, a.value, earlier)) {
      // A copy of the step Maya showed at H3 is no credit and no refusal: the ladder goes past it (copiedStep).
      if (copiedStep(s) === a.step) continue;
      const answerToo = read.sure && read.final !== null && rightForQuestion(pkg, read.final) && answers.some((x) => x.step === "result" && x.verdict === "right" && (x.problem ?? "target") === "target");
      // A plan to write the two-digit sum is no credit and no hearing problem: its regroup line comes next (regroupAfter).
      if (answerToo || carryPairs(pkg).some((x) => writesTotal(s.turn!.text, x.out))) continue;
      const unheard = stepSaidUnheard(s);
      return { code: "answer_not_committed", reason: `The child's whole turn does not say ${valueText(a.value)} for ${a.step} clearly: ${unheard ? "confirm what they said (confirm)" : "help with this step, and do not say it is right"}.`, unheard, held: true };
    }
    // A claim's result counts only from its whole-turn templates (claim.ts, claimStepHeard): never a hedge, a question,
    // another speaker or a copy of what Maya showed at H3. Beside the child's committed word, the word stands.
    if (a.verdict === "right" && problem === "target" && at.kind === "claim-compare" && !stepTurnHeard(s, at, a.value)) {
      if (read.final?.type === "choice") continue;
      const unheard = claimResultUnheard(s);
      return { code: "answer_not_committed", reason: `The child's whole turn does not say ${valueText(a.value)} for the result clearly: ${unheard ? "confirm what they said (confirm)" : "help with this step, and do not say it is right"}.`, unheard };
    }
    if (a.verdict === "wrong" && right) return { code: "rejects_right_answer", reason: `${valueText(a.value)} is right for ${a.step}.` };
    // The child's sure final answer is right: never "not yet" for it as a step (practice: "I think the tens make 66."
    // got "Not yet" for the tens).
    if (a.verdict === "wrong" && a.step !== "result" && problem === "target" && read.sure && read.final && saidAs(read.final, a.value) && isRightAnswer(pkg.operation, pkg.answer, a.value)) {
      return { code: "rejects_right_answer", reason: `${valueText(a.value)} is the child's final answer, and it is right: accept it (step "result").` };
    }
    checked.push({ answer: a, problem });
    if (problem === "target" && a.verdict === "right" && a.step !== "result") earlier.push(a.step);
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
  // Only a committed answer in an allowed form is a wrong final answer (committedTurn: missing numbers and claims).
  if (!committedTurn(s)) return before;
  // An equal fraction is not a wrong final answer (#407).
  if (!pkg || !checked.some((c) => c.problem === "target" && c.answer.step === "result" && c.answer.verdict === "wrong" && committedValue(s, c.answer) && !isEqualForm(pkg, c.answer.value))) return before;
  const done = closeParts(pkg, [...behind(s), ...checked.filter((c) => c.problem === "target" && c.answer.verdict === "right").map((c) => c.answer.step)]);
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
  // An evaluate question's additions are its parts' columns ("e1.ones", "e1.tens"): a carry pairs two columns of one
  // part, never the last column of one part with the first of the next (review of #760).
  const columns = (evaluateSteps(pkg) ?? pkg.steps).filter((st): st is Extract<WorkedStep, { kind: "add-column" }> => st.kind === "add-column");
  const partOf = (id: string) => (id.includes(".") ? id.slice(0, id.indexOf(".")) : "");
  return columns.slice(0, -1).flatMap((out, i) => (out.carryOut > 0 && columns[i + 1].carryIn === out.carryOut && partOf(out.id) === partOf(columns[i + 1].id) ? [{ out, in: columns[i + 1] }] : []));
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
  const order = (a: ChildAnswer) => ((a.problem ?? "target") !== "target" ? -1 : a.step === "result" ? Infinity : workSteps(session.package!).findIndex((st) => st.id === a.step));
  for (const a of refused.flatMap(answersOf).sort((x, y) => order(x) - order(y))) {
    const twice = kept.some((k) => k.step === a.step && (k.problem ?? "target") === (a.problem ?? "target") && k.verdict === a.verdict && equivalent(k.value, a.value));
    const before = kept.filter((k) => (k.problem ?? "target") === "target" && k.verdict === "right" && k.step !== "result").map((k) => k.step);
    if (!twice && checkAnswers(session, [a], [], before) === null) kept.push(a);
  }
  return kept;
}

/**
 * A worked step of any kind is heard as the child's own (rule A, 2026-11-12): the turn states its value with no blocker
 * (ownTurn), on the fallback and on a model's reading alike, so the two cannot disagree. Beside it, two forms stay as they
 * were for an addition column: a plain yes to Maya's own "Did you say 16?" (the child now owns that number, P11), and a
 * first-person written-digit or carry claim about the child's own paper ("I wrote 6 and carried 1", also after Maya's
 * number and after H3), which checkColumnClaims checks. A column's written digit alone ("6" for 7 + 9 = 16) is heard only
 * in a written-digit claim. `earlier` are the steps this turn credits before this one, in order.
 * The integration's step kinds keep their own whole-turn recognizers as one more way in (a place-value digit, a part of
 * an evaluate question, a clock count, a missing factor's try, a claim's result); rule A is the other.
 */
function stepTurnHeard(s: Session, step: WorkedStep, value: AnswerValue, earlier: readonly string[] = []): boolean {
  const pkg = s.package;
  if (!pkg || !s.turn || s.turn.uncertain) return false;
  // Rule A for a step of these kinds, after its own recognizer: in order, not after Maya showed it.
  const ruleA = (ordered = true) => answersStep(step, value) && ownTurn(s, step, value, { earlier, ordered }) === null;
  // A place-value digit step: its own templates (place-value-turns.ts), on the same rules: the first step not done, not after H3.
  if (step.kind === "read-digit") {
    return workSteps(pkg).find((st) => !s.done.includes(st.id) && !earlier.includes(st.id))?.id === step.id &&
      (placeStepHeard({ text: s.turn.text, uncertain: s.turn.uncertain, step, value, copy: s.ladder.step === step.id && s.ladder.hint >= 3, asked: s.stepAsked ?? null }) || ruleA());
  }
  // B1b's bigger and place-worth steps: the same rules, their own templates (place-value-parts-turns.ts).
  if (step.kind === "bigger" || step.kind === "place-worth") {
    return workSteps(pkg).find((st) => !s.done.includes(st.id) && !earlier.includes(st.id))?.id === step.id &&
      (partsStepHeard({ text: s.turn.text, uncertain: s.turn.uncertain, step, value, copy: s.ladder.step === step.id && s.ladder.hint >= 3, asked: s.stepAsked ?? null }) || ruleA());
  }
  // A claim's result (claim.ts). A scale, money or minute-hand claim (C3b, topic-claim.ts partsClaim) is heard from a
  // whole turn after its earlier parts (compareTurnHeard, review of #741 P1a); any other claim, marbles and area
  // included, through A4's own whole-turn templates, which may come before the columns, as a whole result.
  if (step.kind === "claim-compare") {
    if (partsClaim(pkg)) return compareTurnHeard(s, step, value);
    if (!saidAs(number(step.value), value)) return false;
    // Re-review: a step Maya showed with the claim's value ("6 × 8 = 48" shown, then "48.") makes the result a copy too.
    const shownValue = workSteps(pkg).some((st) => st.id !== step.id && shownStep(s, st) && stepAnswers(st).some((v) => saidAs(v, value)));
    const heard = { text: s.turn.text, uncertain: s.turn.uncertain, operation: pkg.operation, value: step.value, resultAsked: s.resultAsked ?? null, shown: (s.ladder.step === step.id && s.ladder.hint >= 3) || shownValue };
    return claimStepHeard(heard) || spotStepHeard({ ...heard, pkg });
  }
  if (step.kind === "operate" || step.kind === "count-on" || step.kind === "try-factor") {
    const body = wholeTurn(s.turn.text);
    // A missing factor's try (trial-factor.ts) is first when it is the first step not done; then its value, a yes to Maya's
    // own confirm, or its own product.
    if (step.kind === "try-factor") {
      if (workSteps(pkg).find((st) => !behind(s).includes(st.id) && !earlier.includes(st.id))?.id !== step.id) return false;
      return (body !== null && trialHeard(step, body, value, s.stepAsked ?? null, shownStep(s, step))) || (!shownStep(s, step) && ruleA());
    }
    if (step.kind === "count-on") {
      if (workSteps(pkg).find((st) => !behind(s).includes(st.id) && !earlier.includes(st.id))?.id !== step.id || shownStep(s, step)) return false;
      if (body !== null) {
        const bare = wholeValue(body.replace(/\s+minutes?$/, ""));
        if (bare !== null) return saidAs(number(bare), value);
        // A count to the hour can include the addition and the destination in one complete sentence.
        const m = /^(.+?)\s*,?\s+so\s+(.+?)\s+minutes?\s+to\s+(\d{1,2}:\d{2})$/.exec(body);
        const sum = m && wholeSum(m[1]);
        if (!!sum && step.id === "to-hour" && sum.sum === 60 && sum.operands.length === 2 &&
          sum.operands.includes(step.from.minutes) && sum.operands.includes(step.minutes) &&
          plainNumber(m![2]) === step.minutes && m![3] === `${step.to.hours}:${String(step.to.minutes).padStart(2, "0")}` && saidAs(number(step.minutes), value)) return true;
      }
      return ruleA();
    }
    // A part of an evaluate question: it is first while one of its columns is the first not done, whatever the column's
    // kind (currentPart). Its result, a yes to Maya's own confirm, or its own equation, its operands in its order (either
    // order for + and ×): "9 times 880 is 7920". Rule A then, with the part's own order.
    if (!currentSteps(s).some((st) => st.id === step.id)) return false;
    const copy = shownStep(s, step);
    const total = saidAs(number(step.value), value);
    if (body !== null) {
      const yes = wholeYes(body);
      if (yes) {
        const asked = s.stepAsked;
        return !!asked && !copy && total && saidAs(asked, value) && (yes.value === null || saidAs(number(yes.value), asked));
      }
      const bare = wholeValue(body);
      if (bare !== null) return !copy && total && saidAs(number(bare), value);
      if (!copy && total && partEquationSaid(body, step)) return true;
    }
    return !copy && total && ruleA(false);
  }
  if (!answersStep(step, value)) return false;
  // Only the first step not done or passed, or credited before it in this turn: no tens credit before the ones.
  if (workSteps(pkg).find((st) => !behind(s).includes(st.id) && !earlier.includes(st.id))?.id !== step.id) return false;
  // Round 4: a step Maya showed stays shown past the easier example's new try (shownStep).
  const copy = shownStep(s, step);
  if (step.kind === "add-column") {
    const total = saidAs(number(step.total), value);
    const body = stepTurnBody(s.turn.text, step.carryOut);
    // A plain yes to Maya's own "Did you say 16?": the child now owns that number, as on the final answer's confirm (P11).
    const yes = body === null ? null : wholeYes(body);
    if (yes) {
      const asked = s.stepAsked;
      if (!!asked && !copy && total && saidAs(asked, value) && (yes.value === null || saidAs(number(yes.value), asked))) return true;
    }
    // A claim about the child's own paper is still theirs after H3.
    if (body !== null && stepForm(pkg, step, value, body) === "claim") return true;
    // The written digit alone is no column total: only the child's own written-digit claim of it, with the column's carry
    // ("I wrote 6 and carried 1"), or naming the column when it makes none ("I wrote 6 in the tens"); "I wrote 6." may be
    // any column's 6.
    if (!total) {
      const claims = columnClaims(claimText(s.turn.text));
      const written = claims.some((c) => !c.carry && c.value === step.write);
      const tied = step.carryOut > 0 ? claims.some((c) => c.carry && c.value === step.carryOut) : claims.some((c) => !c.carry && claimPlaces(c.tail).some((p) => p.place === step.place));
      if (!written || !tied) return false;
    }
  }
  return ownTurn(s, step, value, { earlier }) === null;
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

// ---------- The commit rule (rule A, 2026-11-12, approved by Savar through the Chief of Staff) ----------
//
// One block-list for every step kind and the final answer, on the model's reading and code's fallback alike: a value is
// credited when the child's turn states it as their own and the turn has none of the blockers below. It replaces the
// allow-list of step templates (stepStatement and its harmless clauses), which refused 361 right turns in the practice
// pass of 2026-11-12 ("I got 66. I put the 6 from the ones with the 6 from the tens.").

/** Why a turn does not credit a value as the child's own, or null when it does (ownTurn). */
type Blocker = "uncertain" | "hedge" | "guess" | "negation" | "other_person" | "request" | "asks_value" | "echo" | "copy" | "order"
  | "not_said" | "other_number" | "operand_twice" | "false_sum" | "wrong_place" | "claim";

/** Doubt about the value: a hedge word, "or", or "not sure" and "don't know" that are not about what to do next. */
const OWN_HEDGE = /\b(?:think|thinks|thought|maybe|guess|guessed|guessing|probably|perhaps|possibly|believe|might|unsure|kind of|kinda|sort of|sorta|hope|hopefully|dunno|idk|no idea(?! (?:how|what|why|where|which))|no clue|or|would say|i'd say|could be|suppose|doubt|doubts)\b|\b(?:i'd|i would) (?:write|put|carry|say)\b|\bnot (?:so |really |very |too )?sure\b(?! (?:what|how|where|which|why|about)\b)|\b(?:don't|do not|dont) know\b(?! (?:what|how|where|which|why|about)\b)/;
/** A negation that withdraws or denies ("I don't add the ones", "that's wrong"). A next-step "don't know what" is no negation. */
const OWN_NEGATION = /\b(?:not|never|nope|nah|wrong|incorrect|mistake|mistaken|false|withdraw|reject|scratch|erase|changed my mind|change my answer|take (?:it|this|that) back|taking it back)\b|n't\b/;
const NEXT_STEP_DOUBT = /\b(?:(?:don't|do not|dont|didn't|did not) (?:know|get|understand|see)|not (?:so |really |very |too )?sure) (?:what|how|where|which|why|about)\b[^.!?]*/g;
/** A copied or looked-up number (review of 1b5c3b50, P1-1), whoever says it. */
const SOURCE = /\b(?:copied|copy|copying|looked (?:at the back|it up|up)|look(?:ed)? it up|checked the answer|answer key|answer sheet|back of the book|the app|an app|google|internet|calculator|ipad|tablet|siri|alexa|on the screen|in class|at school|according to|from the board|on the poster|poster|peeked|peek|peeking)\b/;
/** A subject that is no person or source: a number expression, a place or column, or a word for the numbers ("7 and 9 gives 16", "The ones have 16", "That gives 16"). */
/** Lead words a clause may start with before its subject ("so", "okay", "for the ones", "last time"). */
const CLAUSE_LEAD = /^(?:(?:result|product|answer|total|sum|difference|quotient)\s*:\s*|(?:so|and|then|okay|ok|um|uh|oh|yes|yeah|no|nope|well|but|like|now|first|next|because|cause|since|cuz|coz|also|just|fine|wait|hmm|right|sure|together|hi|hey|maya|actually|oops|i mean|sorry|maybe|probably|perhaps|possibly|likely|most likely|i think|i guess|i believe|i feel like|pretty sure|let's say|let's go with|about|around|roughly|almost|last time|this time|for the (?:ones|tens|hundreds|thousands|ten thousands|hundred thousands)(?: column)?|in the (?:ones|tens|hundreds|thousands)(?: column)?|for (?:that|this|mine|my question)|in my (?:head|paper|book))\b[,!\s]*)+/;
/** A clause with no subject: it starts with a number, a fraction word or an operation word ("16.", "7 plus 9 is 16", "a half"). */
const SUBJECTLESS = /^(?:\d|\.\d|\+|plus|minus|times|add|added|adding|take|carry|carried|the \d|a \d|(?:a|an)\s+(?:half|third|quarter|fourth|fifth|sixth|seventh|eighth|ninth|tenth|twelfth|sixteenth)|(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|half|negative|point)\b)/;
/** A clause that starts with its verb and so has the subject of the clause before it ("I added 7 and 9, and got 16"). */
const CONTINUES = /^(?:got|get|gets|wrote|write|writes|put|added|add|made|make|makes|carried|did|found|have|had|equals?|comes?|gives?|keep|kept|ended up with|came to|got to|took|take|subtracted|counted|multiplied|divided|rounded|changed|used|checked|worked)\b/;
/**
 * The allow-list of a clause's subject (re-review of dd794d02): empty (SUBJECTLESS), I or we (and their forms), it, that,
 * this, these, those, there, here, mine, a place or column ("the ones", "the top"), "adding them", "the total", "the
 * sum", "my answer", "the answer", Maya's own words said back ("you said", rule C reads them), and "they", "both" or
 * "all" with a math verb only ("They make 16.", not "They got 16."). After "I heard", "I saw" or "I know" the clause it
 * reports is checked too ("I heard Sam got 16.").
 */
function ownSubject(clause: string): boolean {
  const c = clause.replace(CLAUSE_LEAD, "").trim();
  if (c === "" || SUBJECTLESS.test(c)) return true;
  const reported = /^(?:i|we)\s+(?:heard|saw|know|knew|noticed|read|remember|found out|learned|learnt|was told|were told)\s+(?:that\s+)?(.+)$/.exec(c);
  if (reported) return ownSubject(reported[1]);
  if (/^(?:i|we|i've|we've|i'd|we'd|i'm|we're|i'll|we'll)(?:\s|$)/.test(c)) return true;
  if (/^(?:it|it's|its|that|that's|this|these|those|there|there's|here|here's|mine)\b/.test(c)) return true;
  if (/^(?:(?:the|my|our)\s+)?(?:ones|tens|hundreds|thousands|ten thousands|hundred thousands|tenths|hundredths|thousandths|top|bottom)\b/.test(c)) return true;
  if (/^(?:adding(?: them| those| these)?|(?:the|my|our) (?:total|sum|answer|final answer|result|product|difference|number)|my (?:work|paper))\b/.test(c)) return true;
  if (/^(?:like |as )?you\b/.test(c)) return true;
  return /^(?:(?:together\s+)?they|both(?: of them)?|all(?: of them)?|the two|these two|those two)\s+(?:together\s+)?(?:make|makes|made|add up to|adds up to|added up to|are|were|equal|equals|give|gives|is|come to|comes to)\b/.test(c);
}
/** Near the value, not the value (review of 1b5c3b50, P1-2). */
const NEAR = new RegExp(`\\b(?:about|around|almost|approximately|roughly|nearly|close to)\\s+(?:\\d|(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred)\\b)|-ish\\b|\\bish\\b|\\bfeel like\\b|\\breckon\\b|\\bsomething like\\b|\\bi suppose\\b|\\bi bet\\b|\\bpretty sure\\b|\\bapproximately\\b|\\broughly\\b|\\b(?:most )?likely\\b|\\blet'?s say\\b|\\blet'?s go with\\b|\\bsay,\\s*\\S|\\bsay\\s+\\S+\\s*\\?`);
/** Another person, or another source, of a number. Maya herself is "you": rule C reads her. */
const OTHER_PERSON = /\b(?:mom|mum|mommy|mummy|mother|dad|daddy|father|teacher|brother|sister|friend|grandma|grandpa|granny|nana|papa|aunt|auntie|uncle|cousin|parents?|tutor|classmate|someone|somebody|everyone|everybody|she|he|her|his|their|calculator|google|book)\b/;
/** Maya's words named as the source, with what she said after it ("You said 16", "you told me to add the ones"): rule C reads it. */
const ECHO_SAID = /\byou (?:said|say|told (?:me|us)|showed (?:me|us)|taught (?:me|us)|meant|asked|wrote|carried|put|got|added)(?: that| to)?\b/g;
/** Maya or her example named as the source with nothing after it ("like you said", "the 1 you carried", "like your example"). */
const ECHO_TAG = /\blike (?:you (?:said|showed(?: me| us)?|told (?:me|us)|taught (?:me|us)|did|wrote)|(?:in )?(?:your|the) (?:example|warm-?up|easier one|steps|way))\b|\byou (?:showed|did|gave|explained)\b|\byour (?:example|warm-?up|easier one|steps|way)\b/g;
/** Where an echoed clause ends: the end of its sentence, a semicolon, or "so", "and" or "then" that starts the child's own words. */
const ECHO_END = /[.!?;]|,?\s+(?:so|then)\s+(?=i\b|it\b|it's\b|that's\b|the answer\b|\d)|,?\s+and\s+(?=i\b|it's\b|that's\b)|,\s+(?=i\b|so\b|it's\b|that's\b)/;
/** A question that only checks what was said ("Is that right?", "Right?", "Is it?"). */
const VALUE_QUESTION = /^(?:(?:so|okay|ok|um|uh|oh|yes|yeah|and|but)\b[,\s]*)*(?:is (?:that|it|this|that one)(?: (?:right|correct|ok|okay|true|it))?|am i right|right|correct|really|did i get it(?: right)?|did i do it right|is that what you mean|yes|okay|ok|i'?m right)$/;
/** A question about the next step that may name the value ("What do I do with the 16?", "Where does the 1 go?"). */
const NEXT_QUESTION = /^(?:(?:so|okay|ok|um|uh|oh|and|but|then|now)\b[,\s]*)*(?:what do (?:i|we) do (?:with|about|next|now)|where (?:does|do|should) |do (?:i|we) (?:write|put|carry|keep) |how do (?:i|we) write |what happens to |what about )/;
const NUMBER_WORD = "zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million";
const NUMBER_RUN = new RegExp(`\\b(?:${NUMBER_WORD})(?:[\\s-]+(?:${NUMBER_WORD}))*\\b`, "g");
/** A place name the commit rule reads ("in the tens", "the ones are 6"). */
const OWN_PLACES = "ten thousands|hundred thousands|ones|tens|hundreds|thousands|tenths|hundredths|thousandths";

/** The digit text with a place word after a number left out ("1 ten", "6 ones" are 1 and 6), to read the numbers alone. */
const collapsed = (text: string) => text.replace(new RegExp(`(\\d)\\s+(?:${OWN_PLACES}|ten|one)\\b`, "g"), "$1");

/** The text with number words as digits ("seven plus nine is sixteen" is "7 plus 9 is 16"), for the rule's own reading. */
function digitWords(text: string): string {
  // "a ten" is one ten ("I carried a ten").
  // "10,000" is one number.
  return text.replace(/(\d),(?=\d{3}\b)/g, "$1").replace(/\b(?:a|an)\s+ten\b/g, "1 ten").replace(NUMBER_RUN, (m) => {
    // A lone "one" or "ten" ("the one I kept", "carry the ten") is a word for the carry, and a lone "hundred" or
    // "thousand" a place ("3 hundred thousands"): read as it is.
    if (["one", "ten", "hundred", "thousand", "million"].includes(m)) return m;
    const n = plainNumber(m);
    if (n !== null) return String(n);
    // "two three one": each word alone.
    const parts = m.split(/[\s-]+/).map((w) => plainNumber(w));
    return parts.every((p) => p !== null) ? parts.join(" ") : m;
  });
}

/** Every number a step holds: its fields, the numbers of its own sum ("12 − 8 = 4"), and an addition column's digit sum. */
function stepNumbers(pkg: OperationPackage, st: WorkedStep): number[] {
  const out: number[] = [];
  const walk = (x: unknown) => {
    if (typeof x === "number") out.push(x);
    else if (Array.isArray(x)) x.forEach(walk);
    else if (x && typeof x === "object") Object.values(x).forEach(walk);
  };
  walk(st);
  for (const v of valuesIn(stepText(st, pkg.operation))) if (v.type === "number") out.push(v.value);
  if (st.kind === "add-column") out.push(st.digits.reduce((a, b) => a + b, 0));
  return out;
}

/** The numbers that go into a column (its operands), as one pool for the whole turn: an addition's digits, a subtraction's top and bottom. */
function stepOperands(st: WorkedStep): number[] {
  if (st.kind === "add-column") return [...st.digits];
  if (st.kind === "subtract-column") return [st.top, ...(st.bottom === null ? [] : [st.bottom]), ...(st.regrouped ? [st.top + 10 - (st.lent ? 1 : 0)] : [])];
  return [];
}

/** The values a column may be said as with a place word: an addition's total and written digit, else its answers. */
function placeValues(st: WorkedStep): number[] {
  const values = stepAnswers(st).flatMap((v) => (v.type === "number" ? [v.value] : []));
  if ("write" in st && typeof st.write === "number") values.push(st.write);
  return values;
}

/** A sentence that asks: it ends in "?", or starts as a question does ("Is it 66 I followed the steps"). */
const isQuestion = (sentence: string) =>
  sentence.trim().endsWith("?") || /^(?:(?:so|okay|ok|um|uh|oh|and|but|yes|yeah)\b[,\s]*)*(?:is|are|am|was|did|does|can|could|should|would|will)\s+(?:it|that|this|i|my|the|you|we|there)\b/.test(sentence.trim());

/** An operation word between two numbers of a sum in the rule's digit text. */
const OP = "\\+|plus|and|added to|add|minus|-|−|take away|takeaway|times|x|×|divided by|÷";
/** A whole equation in the rule's digit text: numbers joined by operation words, then its result. */
const EQUATION = new RegExp(`(\\d+(?:\\.\\d+)?)((?:\\s*(?:${OP})\\s*(?:the\\s+)?\\d+(?:\\.\\d+)?)+)\\s*(?:is equal to|is|are|equals?|makes?|=|gives?)\\s*(\\d+(?:\\.\\d+)?)`, "g");
/** The child's own method, at the start of a clause ("I did 27 plus 40", "then took away one", "I made 39 into 40"). */
const METHOD = /^(?:(?:so|and|then|first|next|okay|ok|um)\b[,\s]*)*(?:i\s+(?:did|made|changed|rounded|used|took|counted|went|split|broke|started)\b|took\s+away\b|take\s+away\b|made\b|rounded\b)/;

/** A true equation, worked left to right, with "and" as plus. */
function trueEquation(m: RegExpMatchArray): boolean {
  const parts = [...`${m[1]}${m[2]}`.matchAll(new RegExp(`(?:^|\\s*(${OP})\\s*(?:the\\s+)?)(\\d+(?:\\.\\d+)?)`, "g"))];
  let total = Number(parts[0][2]);
  for (const p of parts.slice(1)) {
    const n = Number(p[2]);
    const op = p[1];
    total = /minus|-|−|take/.test(op) ? total - n : /times|x|×/.test(op) ? total * n : /divided|÷/.test(op) ? total / n : total + n;
  }
  // A division may leave a remainder: "1 divided by 2 is 0" is a step of long division.
  return Math.abs(total - Number(m[3])) < 1e-9 || (/divided|÷/.test(m[2]) && Math.floor(total) === Number(m[3]));
}

/**
 * The text with the child's working blanked out, for the rule's number check: true equations ("20 plus 30 is 50"), every
 * explanation ("because 3 - 1 is 2", to the end of the turn as readAnswer reads it), and clauses of the child's own
 * method ("I did 27 plus 40, then took away one"). In a fraction call only explanations: its equations are left to
 * falseEquationResults, and a method claim with a number ("7/8. I used two eighths.") is not the child's committed answer.
 */
function freeOfWorking(text: string, fractions: boolean, final = false): string {
  let out = withoutExplanations(text);
  if (fractions) return out;
  out = out.replace(EQUATION, (...m) => (trueEquation(m as unknown as RegExpMatchArray) ? " " : m[0]));
  // For the final answer the child may also tell what they added up ("I got 66. I added 20 and 40 and 6.").
  // A method clause goes on through "and 40 and 6" or "then took away one".
  let method = false;
  return out.split(/(?<=[.!?;,])\s+|\s+(?=(?:and|then|so)\s)/).map((clause) => {
    const c = clause.trim();
    method = METHOD.test(c) || (final && /^(?:(?:so|and|then|first)\b[,\s]*)*i\s+(?:added|add)\b/.test(c)) || (method && /^(?:and|then|plus)\b(?!.*\b(?:is|are|got|get|makes?|equals?)\b)/.test(c));
    return method ? " " : clause;
  }).join(" ");
}

/** A sum in the rule's digit text: its operands and its total ("2 plus 3 plus 1 is 6", "7 + 9 = 16"). */
const SUM = /(\d+)((?:\s*(?:\+|plus|and|add|minus|-|take away|times|x)\s*(?:the\s+)?\d+)+)\s*(?:is|are|equals?|makes?|=|gives?)\s*(\d+)/g;
function sumsIn(text: string): { operands: number[]; total: number; from: number; to: number; at: number }[] {
  return [...text.matchAll(SUM)].filter((m) => !/minus|-|take away|times|x/.test(m[2])).map((m) => ({
    operands: [m[1], ...[...m[2].matchAll(/\d+/g)].map((x) => x[0])].map(Number),
    total: Number(m[3]), from: m.index ?? 0, to: (m.index ?? 0) + m[0].length, at: (m.index ?? 0) + m[0].length - m[3].length,
  }));
}

/** The sum adds exactly this addition column's digits and carry, in any order. */
const sameOperands = (st: WorkedStep, operands: readonly number[]) =>
  st.kind === "add-column" && [...st.digits, ...(st.carryIn > 0 ? [st.carryIn] : [])].sort((a, b) => a - b).join(",") === [...operands].sort((a, b) => a - b).join(",");

/** The text with each echoed clause of Maya's ("you said add the ones first") taken out. */
function withoutEchoes(text: string): string {
  return text.replace(new RegExp(`(?:${ECHO_SAID.source})([^.!?;]*)`, "gi"), (whole, ...groups) => {
    const after = String(groups[groups.length - 3] ?? "");
    const end = ECHO_END.exec(after);
    return end ? ` ${after.slice(end.index)}` : " ";
  }).replace(new RegExp(ECHO_TAG.source, "gi"), " ");
}

/**
 * The child's own claims about their paper, for checkColumnClaims: Maya's words said back are left out (withoutEchoes),
 * a question claims nothing written ("Do I write all of it?"), "I wrote it on my paper" names no digit, "the carried 1"
 * names the carry, and "keep the one" is a carry.
 */
function claimText(text: string): string {
  const plain = withoutEchoes(text.trim().replace(/[’‘]/g, "'"));
  return plain.split(/(?<=[.!?])\s+/).filter((x) => !x.trim().endsWith("?")).join(" ")
    .replace(/\b(?:wrote|write|put)\s+(?:it|that|this|them)(?=\s*(?:down\b|on (?:my|the)\b|in (?:my|the) (?:paper|board|page|book|sheet)\b|already\b|[.,!?;]|$))(?:\s+down)?(?:\s+(?:on|in)\s+(?:my|the)\s+(?:paper|board|page|book|sheet))?/gi, "did it")
    .replace(/\b(?:wrote|write|put)\s+\d+\s+(?:on|in)\s+(?:my|the)\s+(?:paper|board|page|book|sheet)\b/gi, "did it")
    .replace(/\bthe carried\b/gi, "the carryover").replace(/\bkeep\b/gi, "carry").replace(/\bkept\b/gi, "carried");
}

/**
 * In this sentence (digit text), the value `n` is said at least once for `target` itself: not placed in another column
 * ("6 stays in the ones"), not inside a sum (its operand, or the total of another column's sum), and not a written digit
 * after another column's total in the same sentence ("7 plus 9 is 16, so I wrote the 6").
 */
function ownOccurrence(pkg: OperationPackage, target: WorkedStep, n: number, sentence: string): boolean {
  const steps = workSteps(pkg);
  const sums = sumsIn(sentence);
  const place = "place" in target ? target.place : null;
  for (const m of sentence.matchAll(new RegExp(`(?<![\\d.])${n}(?!\\d|\\.\\d)`, "g"))) {
    const at = m.index ?? 0;
    const after = sentence.slice(at + m[0].length);
    const placedIn = new RegExp(`^\\s+(?:(?:ten|one)s?\\s+)?(?:(?:is|are|was|goes|go|stays|stay|went)\\s+)?(?:in|for|into|to|under|on|at|from|with)\\s+(?:the\\s+)?(${OWN_PLACES})\\b`).exec(after);
    if (placedIn && placedIn[1] !== place) continue;
    const named = new RegExp(`\\b(?:the\\s+)?(${OWN_PLACES})(?:\\s+(?:column|part|digit))?\\s+(?:is|are|was|were|make|makes|made)\\s+$`).exec(sentence.slice(0, at));
    if (named && named[1] !== place) continue;
    const sum = sums.find((x) => at >= x.from && at < x.to);
    if (sum && (at !== sum.at || (target.kind === "add-column" ? !sameOperands(target, sum.operands) : steps.some((st) => st.id !== target.id && sameOperands(st, sum.operands))))) continue;
    const before = sentence.slice(0, at);
    const written = /\b(?:wrote|write|writes|put|puts)\s+(?:down\s+)?(?:the\s+|a\s+|just\s+)?$/.test(before);
    // A written digit with no column is this column's only right after its own total ("2 plus 3 plus 1 is 6, so I wrote
    // 6"): after another column's total it is that column's ("7 plus 9 is 16. I wrote the 6."), and alone it may be any.
    // A written-digit claim of this column's own digit (not its total) is the claim path's: checkColumnClaims checks it.
    // Only when another column writes the same digit ("I wrote 6." for 27 + 39 may be the ones' 6 or the tens').
    if (written && !placedIn && !("write" in target && target.write === n && !("total" in target && target.total === n))) {
      const lastTotal = [...before.matchAll(/\d+/g)].map((x) => Number(x[0])).at(-1);
      const shared = steps.some((st) => st.id !== target.id && (("write" in st && st.write === n) || ("total" in st && st.total === n)));
      if (shared && !("total" in target && target.total === lastTotal)) continue;
    }
    return true;
  }
  return false;
}

/**
 * Rule A: why this turn does not credit `value` for `target` (a worked step, or null for the final answer) as the child's
 * own, or null when it does. `earlier` are the steps this turn credits before it, in order ("Several steps said in order
 * credit each one"). `shownToo`: a step Maya showed is a copy (false only for copiedStep, which asks whether the turn
 * would credit but for the show). Blockers: a turn code could not hear for sure; another person's number; a hedge, "or",
 * a guess or a negation; a question about the value (it goes to the confirm); a request to Maya (asksMaya); "you said X"
 * where X is not the step's own numbers, or any echo of a step Maya showed (rule C); a number that is not the question's;
 * an operand described twice; a false sum or a sum of other numbers for a step's value; a value said in the wrong place
 * ("16 in the tens"); a written digit or carry checkColumnClaims finds wrong or unclear; a step before its turn.
 */
function ownTurn(s: Session, target: WorkedStep | null, value: AnswerValue, options: { earlier?: readonly string[]; shownToo?: boolean; text?: string; formToo?: boolean; ordered?: boolean } = {}): Blocker | null {
  const { earlier = [], shownToo = true, formToo = true, ordered = true } = options;
  const pkg = s.package;
  if (!pkg || !s.turn) return "not_said";
  if (s.turn.uncertain) return "uncertain";
  const last = s.turns.map((t) => t.speaker).lastIndexOf("maya");
  if (s.turns.slice(last + 1).some((t) => t.speaker === "child" && (t.alternatives?.length ?? 0) > 0)) return "uncertain";
  const opts = readOptionsFor(pkg);
  const raw = (options.text ?? s.turn.text).trim().replace(/[’‘]/g, "'").replace(/[“”]/g, "\"").replace(/'cause\b/gi, "because")
    // A stutter ("s-s-sixty-six") is the word it starts.
    .replace(/\b([a-z])(?:-\1)*-(?=\1)/gi, "");
  const lower = raw.toLowerCase();
  const steps = workSteps(pkg);
  // A step comes after every step before it: done, passed, or credited earlier in this turn.
  if (target && ordered) {
    const first = steps.find((st) => !behind(s).includes(st.id) && !earlier.includes(st.id));
    if (first?.id !== target.id) return "order";
  }
  // Whole-turn blockers, read on everything the child said.
 if (/\bmy\s+(?!answer\b|final\b|sum\b|total\b)[a-z]+\s+(?:is|was)\b/.test(lower)) return "other_person";
  // Review of 1b5c3b50 (P1-1): a number copied or looked up is not the child's own, whoever says it.
  if (SOURCE.test(lower)) return "other_person";
  // ...and a clause that holds the value is the child's own only with a first-person subject or none ("16.", "It's 16.",
  // "7 plus 9 is 16."): "Sam said 16.", "My iPad got 16.", "The answer sheet has 16." are another's. A name list never ends.
  // Re-review of dd794d02: the subject of a clause that holds the value is an allow-list (ownSubject): honest math talk
  // has a small closed class of subjects, and any other one ("Sam did 16.", "Sam's is 16.", "They got 16.") blocks. A value
  // clause with no subject hangs from the clause before it ("Sam was like, 16."), and a person who said it blocks anywhere
  // in the turn ("16, Sam said.").
  // A question is read by the question rules, not here ("Do I write the 6 in the tens?").
  for (const sentence of lower.split(/(?<=[.!?;\n])\s*/).filter((x) => !x.trim().endsWith("?"))) {
    const clauses = sentence.replace(/[.!;\n]+$/, "").split(/\s*,\s*|\s+(?:so|then|but)\s+/).map((c) => digitWords(c.trim())).filter(Boolean);
    // A clause that starts with its verb ("and got 16") goes on with the subject of the clause before it.
    const subjectOf = (k: number): boolean => (CONTINUES.test(clauses[k].replace(CLAUSE_LEAD, "").trim()) ? k === 0 || subjectOf(k - 1) : ownSubject(clauses[k]));
    for (const [k, clause] of clauses.entries()) {
      const holds = valuesIn(collapsed(clause), opts).some((v) => saidAs(v, value));
      const said = /\b(?:said|says|told|tells|saying)\b/.test(clause) && !/\byou (?:said|told)\b|\bi (?:said|told)\b/.test(clause);
      if ((holds || said) && !subjectOf(k)) return "other_person";
      if (holds && k > 0 && SUBJECTLESS.test(clause) && /\b(?:like|said|says|goes|went|saying|reckons|thinks|answered|told me|told us)$/.test(clauses[k - 1]) && !ownSubject(clauses[k - 1])) return "other_person";
    }
  }
  if (/(?:^|[.!?,]\s*)(?!ones|tens|hundreds|thousands|so|okay|ok|um|uh|oh|yes|yeah|well|first|then|answer|total|sum|step|result|product|difference|quotient|remainder|part|next|last|second|third|final|working|work)[a-z]+\s*:\s*\S/.test(lower)) return "other_person";
  // P1-2: more hedges: an amount near the value ("about 16", "around 16", "16-ish"), "I feel like", "I reckon".
  if (formToo && NEAR.test(lower)) return "hedge";
  if (OTHER_PERSON.test(lower) || /\bsays\b|\b(?:ms|mr|mrs|miss|dr)\.?\s+[a-z]/.test(lower)) return "other_person";
  if (formToo && (OWN_HEDGE.test(lower) || readAnswer(raw, opts).choice)) return "hedge";
  if (saysGuess(raw)) return "guess";
  // What the child kept after a take-back ("15, no, 16" keeps "16").
  const kept = committedText(raw).trim().toLowerCase();
  // A bare "I don't know", "not sure" or "or not" is a hedge (above), not a negation of the value.
  if (OWN_NEGATION.test(kept.replace(/^(?:[\s,.!]*(?:no|nope|nah)\b[,.!]?)+/, "").replace(NEXT_STEP_DOUBT, " ").replace(/\b(?:i\s+)?(?:don't|do not|dont) know\b|\bnot (?:so |really |very |too )?sure\b|\bor not\b/g, " "))) return "negation";
  if (![...valuesIn(kept, opts), ...valuesIn(withoutExplanations(kept), opts)].some((v) => saidAs(v, value))) return "not_said";
  // Spoken fractions keep their words ("fourteen sixteenths"): the fraction reader needs them.
  // A pause ("I wrote... 6 ... in the ones") is no sentence end.
  const text = (opts.fractions || /\bpoint\b/.test(kept) ? kept : digitWords(kept)).replace(/\s*(?:\.{2,}|…)\s*/g, " ");
  const sentences = text.split(/(?<=[.!?])\s+|\n+/).map((x) => x.trim()).filter(Boolean);
  // The numbers that belong to what this turn credits: for the final answer, every number of the question.
  const scope = target ? steps.filter((st) => st.id === target.id || earlier.includes(st.id)) : steps;
  const own = new Set<number>([...scope.flatMap((st) => stepNumbers(pkg, st)), ...(target ? [] : [...(opts.known ?? []), ...(pkg.answer.value.type === "number" ? [pkg.answer.value.value] : [])])]);
  const known = new Set<number>([...(opts.known ?? []), ...steps.flatMap((st) => stepNumbers(pkg, st)), ...(pkg.answer.value.type === "number" ? [pkg.answer.value.value] : [])]);
  const operandOptions = { ...opts, operands: true };
  const knownFractions = [...readNumbers(operationText(pkg.operation), operandOptions).values, ...steps.flatMap((st) => readNumbers(stepText(st, pkg.operation), operandOptions).values)]
    .filter((v) => v.type === "fraction" || v.type === "mixed");
  const isKnown = (v: AnswerValue) => saidAs(v, value) || saidAs(v, pkg.answer.value) || (v.type === "number" ? known.has(v.value) : knownFractions.some((k) => saidAs(v, k)));
  let echoed = false;
  for (const sentence of sentences) {
    const question = isQuestion(sentence);
    const body = sentence.replace(/[.!?]+$/, "").trim();
    // A request to Maya, clause by clause, with Maya's words named as the source taken out first: "You said add the ones"
    // is her instruction said back, not a request.
    for (const clause of withoutEchoes(body).split(/\s*[,;:]\s*/)) {
      const plain = clause.replace(/\bthank you\b/g, " ").replace(/\b(?:do|can|should|could|would|will|did) (?:i|we)\b/g, " ");
      const words = plain.replace(/[^\w'+]+/g, " ").split(/\s+/).filter(Boolean);
      if (/\b(?:can|could|will|would) you\b/.test(clause) || /\b(?:just say|say if|say whether|let me know|tell me if|tell me whether)\b/.test(clause) || asksMaya(words)) return "request";
    }
    const numbers = readNumbers(collapsed(body), opts);
    if (question && target) {
      // A next-step question names only the step's own carry ("Where does the 1 go?"); a sum in a question its operands.
      const next = NEXT_QUESTION.test(body);
      const allowed = [...operandsOf(pkg.operation), ...(next ? [] : [...stepOperands(target), ...("carryIn" in target && target.carryIn > 0 ? [target.carryIn] : [])]), ...("carryOut" in target && target.carryOut > 0 ? [target.carryOut, 10] : [])];
      if (numbers.values.some((v) => v.type === "number" && !saidAs(v, value) && !allowed.includes(v.value))) return "other_number";
    }
    if (question) {
      // A check of what was said, alone or as a tag at the end ("I put the 6 down and the 1 goes up, right?").
      if (formToo && (VALUE_QUESTION.test(body) || VALUE_QUESTION.test(body.split(/\s*,\s*/).at(-1) ?? ""))) return "asks_value";
      if (formToo && numbers.values.some((v) => saidAs(v, value)) && !NEXT_QUESTION.test(body)) return "asks_value";
    }
    // A value with a check tag at its end and no question mark ("66 right."): a check of the value too.
    if (formToo && !question && /(?:^|[\s,])(?:right|correct)$/.test(body) && numbers.values.some((v) => saidAs(v, value))) return "asks_value";
    // Rule C: "you said X" is the child's echo only when X holds this step's own numbers and Maya has not shown the step.
    if (new RegExp(ECHO_TAG.source).test(body)) echoed = true;
    for (const m of body.matchAll(ECHO_SAID)) {
      echoed = true;
      const after = body.slice((m.index ?? 0) + m[0].length);
      const end = ECHO_END.exec(after);
      const said = valuesIn(collapsed(end ? after.slice(0, end.index) : after), opts);
      if (formToo && !said.every((v) => saidAs(v, value) || (v.type === "number" && own.has(v.value)))) return "echo";
      // Review of 1b5c3b50 (P2-1): Maya never says the answer (D-326), so the final answer said back from her words is never
      // the child's; (P3) an echo that holds two of the step's values ("You said 6 and 16.") commits to neither.
      if (!target && said.some((v) => saidAs(v, value))) return "copy";
      if (target && new Set(said.flatMap((v) => (v.type === "number" && placeValues(target).includes(v.value) ? [v.value] : []))).size > 1) return "other_number";
    }
  }
  // The value is said in a statement (a question about it goes to the confirm), and at least once as this step's own:
  // not placed in another column ("the 6 stays in the ones" says no 6 for the tens), not inside another step's sum, and
  // not a digit written for an earlier column ("7 plus 9 is 16, so I wrote the 6").
  // No number beside it that is not the question's, outside a true sum, an explanation ("because 3 - 1 is 2") or the
  // child's own method ("I did 27 plus 40, then took away one"): "That's 15. I got 16." says another value.
  const outside = collapsed(freeOfWorking(text, !!opts.fractions, !target));
  const rest = readNumbers(outside, opts);
  if (rest.unreadable || !rest.values.every(isKnown)) return "other_number";
  const statements = sentences.filter((x) => !isQuestion(x));
  const inStatement = (x: string) => [...valuesIn(withoutExplanations(x), opts), ...(target ? valuesIn(x, opts) : [])].some((v) => saidAs(v, value));
  if (!(formToo ? statements : sentences).some(inStatement)) return "not_said";
  // Said outside an explanation: "Because 7 and 9 make 16." holds no answer of the child's, and neither does "I got 56
  // because 27 and 39 make 66." for 66. A step's value may be in the explanation of an answer ("I got 66 because 7 and 9
  // make 16").
  const outsideExplanation = valuesIn(collapsed(withoutExplanations(text)), opts);
  if (!target ? !outsideExplanation.some((v) => saidAs(v, value)) : outsideExplanation.length === 0) return "not_said";
  // For the final answer, said as an answer, not as a number in an operation ("27 add 66", "27 and 66").
  if (!target && value.type === "number" && !opts.fractions) {
    const plain = text.replace(/[.!?]/g, " ");
    const ats = [...plain.matchAll(new RegExp(`(?<![\\d.])${value.value}(?!\\d|\\.\\d)`, "g"))];
    if (ats.length > 0 && ats.every((m) => /(?:\+|plus|add|added to|and|minus|-|−|dash|subtract|take away|times|x|×|multiplied by|divided by|less)\s*$/.test(plain.slice(0, m.index ?? 0)) || /^\s*(?:to the|squared|cubed)\b/.test(plain.slice((m.index ?? 0) + m[0].length)))) return "not_said";
  }
  if (target && value.type === "number" && !ownOccurrence(pkg, target, value.value, digitWords((formToo ? statements : sentences).join(" ").replace(/\?/g, ".")))) return "not_said";
  // For the final answer, no sum after it that makes another number ("I got 66. 20 plus 30 plus 6 is 56.").
  if (!target && value.type === "number" && !opts.fractions) {
    const first = text.search(new RegExp(`(?<![\\d.])${value.value}(?!\\d|\\.\\d)`));
    for (const m of text.matchAll(EQUATION)) if ((m.index ?? 0) > first && !isKnown(number(Number(m[3])))) return "other_number";
  }
  // For the final answer, no other answer beside it: a number said as an answer ("It's 56", "my answer is 27") is the
  // value or a step's own value ("That's 6, so I get 66").
  if (!target) {
    const stepValues = new Set(steps.flatMap(placeValues));
    for (const x of statements) {
      for (const m of x.matchAll(/\b(?:my answer is|the answer is|answer's|final is|final answer is)\s+(\d+(?:\.\d+)?)(?!\d|[./]\d)/g)) {
        if (!saidAs(number(Number(m[1])), value)) return "other_number";
      }
      for (const m of x.matchAll(/\b(?:answer is|answer's|it's|it is|so it's|so i got|i got|i get|i have|i still got|i still get|that's|that is)\s+(\d+(?:\.\d+)?)(?!\d|[./]\d)(?!\s+(?:for|in|from|to|on|at|into|under|with)\b)/g)) {
        const n = Number(m[1]);
        if (!saidAs(number(n), value) && !stepValues.has(n)) return "other_number";
      }
    }
  }
  // A step Maya showed: the value is a copy (as before); an echo of it too.
  if (shownToo && target && shownStep(s, target)) return "copy";
  if (echoed && !target && steps.some((st) => (s.passed ?? []).includes(st.id))) return "copy";
  // Re-review (P2-b): the final answer with Maya's words tagged on it ("66, like you said.", "like you said, 66") is hers.
  if (!target && value.type === "number") {
    const v = value.value;
    const tag = "(?:(?:just )?(?:like|as) you (?:said|told me|showed me|showed)|you (?:said|told me|showed me)(?: so)?)";
    if (new RegExp(`(?<![\\d.])${v}(?!\\d|\\.\\d)[,\\s!]+${tag}\\s*(?:[.!?]|$)|\\b${tag}[,\\s]+(?:it's\\s+|it is\\s+)?${v}(?!\\d|\\.\\d)`).test(text)) return "copy";
  }
  // Each sum: true (falseEquationResults), and a sum that makes a column's total adds that column's own operands.
  // Every sum is true: in a fraction call by falseEquationResults, else worked out here ("2 and 3 make 6" is false).
  if (opts.fractions ? falseEquationResults(kept, opts).length > 0 : [...text.matchAll(EQUATION)].some((m) => !trueEquation(m))) return "false_sum";
  // One number said to be another ("16 is 66.", "9 is 16."); a listed sum ("2, 3, 1 is 6") is a sum.
  for (const m of text.matchAll(/\b(\d+)\s+(?:is|equals|makes?|=)\s+(\d+)(?!\d|[./]\d)/g)) {
    const before = text.slice(0, m.index ?? 0);
    if (/(?:\+|plus|and|add|added to|to|of|minus|-|−|take away|times|x|×|divided by|÷)\s*(?:the\s+)?$/.test(before)) continue;
    // "those two make 16": a count of the numbers, not a number said to be another.
    if (/\b(?:those|these|the|all|both|my|our)\s*$/.test(before)) continue;
    const list = /((?:\d+\s*,\s*)+)$/.exec(before);
    const sum = list ? [...list[1].matchAll(/\d+/g)].reduce((a, x) => a + Number(x[0]), Number(m[1])) : Number(m[1]);
    if (sum !== Number(m[2])) return "false_sum";
  }
  // A sentence of numbers alone ("16 and 3.", "9 and 16.", "The 1 and 6.", "66. 66."): no number in it says what it is.
  if (sentences.filter((x) => /^(?:(?:so|okay|ok|um|oh|yes|yeah)\b[,\s]*)*\d+(?:\.\d+)?[.!]*$/.test(x.trim())).length > 1) return "other_number";
  for (const x of sentences) {
    const words = collapsed(x.replace(/[.!?]+$/, "")).replace(/[,;]/g, " ").split(/\s+/).filter(Boolean);
    // "6, so 66." after the last step, and a column's own sum listed ("2 and 3 and 1, 6, so 66."), are no bare list.
    const ns = words.filter((w) => /^\d+(?:\.\d+)?$/.test(w)).map(Number);
    const answerN = pkg.answer.value.type === "number" ? pkg.answer.value.value : null;
    const soAnswer = words.length >= 3 && words.at(-2) === "so" && ns.at(-1) === answerN && (!target || steps.at(-1)?.id === target.id);
    const body = soAnswer ? ns.slice(0, -1) : ns;
    const column = target ?? (soAnswer ? steps.at(-1) : undefined);
    const listed = !!column && column.kind === "add-column" && body.length >= 2 && body.at(-1) === column.total && sameOperands(column, body.slice(0, -1));
    const answerAfter = (soAnswer && body.length === 1) || listed;
    if (!answerAfter && words.filter((w) => /^\d+(?:\.\d+)?$/.test(w)).length > 1 && words.every((w) => /^\d+(?:\.\d+)?$/.test(w) || /^(?:and|the|then|so|okay|ok|um|uh|oh|yes|yeah)$/.test(w))) return "other_number";
  }
  // "I already said 16" points back only at a number the child said before or a step done (as readAnswer reads it).
  const before = readOptionsIn(s).saidBefore ?? [];
  for (const m of text.matchAll(/\balready\s+(?:said|got|told you)\s+(\d+)\b/g)) if (!before.includes(Number(m[1])) && !saidAs(number(Number(m[1])), value)) return "other_number";
  for (const sum of sumsIn(text)) {
    const columns = steps.filter((st) => st.kind === "add-column" && st.total === sum.total);
    if (columns.length > 0 && !columns.some((st) => sameOperands(st, sum.operands))) return "false_sum";
  }
  // An operand described more than once in the turn ("I add 9. I add 9. That's 16.", "9 and 7 is 16, 9 and 7."), Maya's
  // words said back left out ("You said add 7 and 9. 7 + 9 is 16." describes each once).
  const valueish = new Set<number>([...steps.flatMap((st) => [...placeValues(st), ...("carryOut" in st ? [st.carryOut] : []), ...("carryIn" in st ? [st.carryIn] : [])]),
    ...operandsOf(pkg.operation), ...(pkg.answer.value.type === "number" ? [pkg.answer.value.value] : [])]);
  const pool = steps.flatMap(stepOperands).filter((n) => !valueish.has(n));
  if (pool.length > 0) {
    const described = collapsed(withoutEchoes(text));
    const count = new Map<number, number>();
    for (const m of described.matchAll(/\d+(?:\.\d+)?/g)) count.set(Number(m[0]), (count.get(Number(m[0])) ?? 0) + 1);
    for (const [n, times] of count) if (pool.includes(n) && times > pool.filter((x) => x === n).length) return "operand_twice";
  }
  // A value said with a place: it must be that column's ("16 in the tens" is not; "the 1 goes to the tens" is its carry).
  const placed = (place: string) => steps.find((st) => "place" in st && st.place === place);
  const PLACE = `(?:the\\s+)?(${OWN_PLACES})(?:\\s+(?:column|place|part|digit|spot))?`;
  // A question claims nothing written ("Do I put the 1 in the tens?").
  for (const sentence of statements) {
    for (const clause of sentence.split(/\s*[,;]\s*|\s+(?:and|but)\s+(?=(?:i\b|the\b|\d))/)) {
      const checks: { n: number; place: string; role: "value" | "write" | "carry" | "from" }[] = [];
      for (const m of clause.matchAll(new RegExp(`(?<![\\d.])(\\d+(?:\\.\\d+)?)\\s+(?:(?:ten|one)s?\\s+)?(?:(?:is|are|was|goes|go|stays|stay|went)\\s+)?(?:(in|for|into|to|under|on|at|from|with)\\s+)${PLACE}\\b`, "g"))) {
        const prep = m[2];
        // The verb right before the number says what the child did with it: "carried the 1 to the tens", "wrote 6 in the tens".
        const before = clause.slice(0, m.index ?? 0);
        const carries = /\b(?:carry|carried|carrying|kept|keep|added|add)\s+(?:over\s+|up\s+)?(?:the\s+|a\s+|that\s+)?$/.test(before);
        const writes = /\b(?:write|wrote|written|writing|put|puts|putting)\s+(?:down\s+)?(?:the\s+|a\s+|just\s+)?$/.test(before);
        // "in", "under", "at" or "on" a column with no verb of a result before it ("16 in the ones", "the 6 in the ones") is
        // where the digit is written; "I got 16 in the ones" is the column's result.
        const result = /\b(?:got|get|gets|have|has|had|make|makes|made|is|are|was|were|it's|that's|equals?)\s+(?:the\s+|a\s+)?$/.test(before);
        const role = prep === "from" ? "from" : prep === "with" || (carries && !writes) || (!writes && ["to", "into"].includes(prep)) ? "carry" : writes || (!result && ["in", "under", "at", "on"].includes(prep)) ? "write" : "value";
        checks.push({ n: Number(m[1]), place: m[3], role });
      }
      for (const m of clause.matchAll(new RegExp(`\\b${PLACE}\\s+(?:is|are|was|were|make|makes|made|gives?|equals?)\\s+(\\d+)\\b(?!\\s+(?:ten|one)s?\\b|\\s*(?:minus|plus|take away|times|[-+\u2212\u00d7]))`, "g"))) checks.push({ n: Number(m[2]), place: m[1], role: "value" });
      // "16 ones", "16 hundreds", "6 tens": the number as that column's digit.
      for (const m of clause.matchAll(new RegExp(`\\b(\\d+)\\s+(${OWN_PLACES})\\b(?!\\s+(?:plus|and|\\+|minus))`, "g"))) checks.push({ n: Number(m[1]), place: m[2], role: "write" });
      for (const m of clause.matchAll(new RegExp(`\\bfor\\s+${PLACE},?\\s+(?:i (?:got|get|have|wrote)|it's|it is|that's|that is)\\s+(\\d+)\\b`, "g"))) checks.push({ n: Number(m[2]), place: m[1], role: "value" });
      for (const c of checks) {
        // For the final answer, the answer itself said with a column ("and the tens make 66") is the whole answer.
        if (!target && pkg.answer.value.type === "number" && c.n === pkg.answer.value.value) continue;
        const st = placed(c.place);
        if (!st) return "wrong_place";
        // This column's written digit written in another column ("7 plus 9 is 16. I wrote the 6 in the tens."), unless that
        // column is done or credited before it with the same digit ("the 6 in the ones is still there" beside the tens' 6).
        if (target && "write" in target && "place" in target && c.role === "write" && c.n === target.write && c.place !== target.place
          && !(placeValues(st).includes(c.n) && (behind(s).includes(st.id) || earlier.includes(st.id)))) return "wrong_place";
        // "1 ten" and "ten" both name the one ten carried in.
        const ok = c.role === "carry" ? "carryIn" in st && (st.carryIn === c.n || (st.carryIn > 0 && (c.n === 1 || c.n === 10)))
          : c.role === "from" ? placeValues(st).includes(c.n) || ("carryOut" in st && st.carryOut === c.n)
            : c.role === "write" ? "write" in st && st.write === c.n
              : placeValues(st).includes(c.n);
        if (!ok) return "wrong_place";
      }
    }
  }
  if (target && "place" in target) {
    // Another column done first ("I add the tens first. 7 + 9 is 16."): not this column's work.
    const first = new RegExp(`\\b(?:add|added|do|did|start with|started with)\\s+(?:the\\s+)?(${OWN_PLACES})\\s+first\\b`).exec(text);
    if (first && first[1] !== target.place) return "order";
  }
  if (target) {
    // The child's own statements, with Maya's words said back left out ("you said the 1 on top is in the tens").
    const own = withoutEchoes(text).split(/(?<=[.!?])\s+|\n+/).map((x) => x.trim()).filter((x) => x && !isQuestion(x));
    const operands = scope.flatMap((st) => [...stepOperands(st), ...("carryIn" in st && st.carryIn > 0 ? [st.carryIn] : [])]);
    const answer = pkg.answer.value.type === "number" ? pkg.answer.value.value : null;
    const lastStep = steps.at(-1)?.id === target.id;
    // Re-review: the step's value said as the whole answer, in its clause or right after it ("16 is the whole answer.",
    // "16, the end.", "16. Done!"); "66 is my answer. I got 16 in the ones" says the 16 as a step.
    const whole = /\b(?:is|was) (?:the|my) (?:whole |final )?answer\b|\bthat's (?:the|my) (?:whole |final )?answer\b|\bthe whole answer\b|\bthe end\b|\b(?:i'?m|i am|we'?re|all) (?:done|finished)\b(?!\s+with)|^(?:(?:okay|ok|so|yay|and)[,\s]+)?(?:all )?(?:done|finished)[.!]*$|\b(?:everything|all of it|whole thing|that's it)\b/;
    const clauses = own.flatMap((x) => x.replace(/[.!?]+$/, "").split(/\s*[,;]\s*/)).map((c) => c.trim()).filter(Boolean);
    const holds = (c: string) => valuesIn(collapsed(c), opts).some((v) => saidAs(v, value));
    if (clauses.some((c, i) => whole.test(c) && (holds(c) || (i > 0 && holds(clauses[i - 1]) && !valuesIn(collapsed(c), opts).length)))) return "other_number";
    let valueSeen = false;
    for (const sentence of own) {
      const plain = sentence.replace(/[.!?]+$/, "");
      // The value said as the final answer, or with the whole question done: no step's value ("My answer is 16.",
      // "I got 16 for the whole thing.", "7 plus 9 is 16 and I'm done.", "7 plus 9 is 16 so it's 16.").
      if (value.type === "number") {
        const v = value.value;
        if (new RegExp(`\\b(?:answer is|answer's|whole (?:sum|thing|answer) is)\\s+${v}\\b|\\b${v}\\s+is\\s+(?:my|the)\\s+(?:final\\s+)?answer\\b|\\b${v}\\s+for\\s+(?:the\\s+)?(?:whole|everything|all)\\b|\\b${v}\\b.*\\bso\\s+(?:it's|it is)\\s+${v}\\b`).test(plain)) return "other_number";
      }
      // A digit moved in words the claims reader does not know: "9 goes down", "1 down, 6 up", "all of it goes under",
      // "the 1 goes on the 2", "I give the 6 to the 2". Down or under is the written digit, up or on top the carry.
      if (/\b(?:all of it|it all|the whole thing)\s+(?:goes|go|went)\b|\b(?:goes|go|went)\s+on\s+the\s+\d|\bgive\b/.test(plain)) return "claim";
      if ("write" in target && "carryOut" in target) {
        for (const m of plain.matchAll(new RegExp(`\\b(\\d+)\\s+(?:(?:goes|go|went|is)\\s+)?(down|under|below|at the bottom|up|on top|at the top|above|over)\\b(?!\\s+(?:the\\s+)?(?:${OWN_PLACES}))`, "g"))) {
          const n = Number(m[1]);
          if (/down|under|below|bottom/.test(m[2]) ? n !== target.write : n !== target.carryOut && !("carryIn" in target && target.carryIn > 0 && n === target.carryIn)) return "claim";
        }
      }
      // A bare number after the value ("7 plus 9 is 16, so 1.", "16. Then 5.", "16, 16, 16."): its role is not said. The
      // step's own operands may be listed ("It's 6. I added 2, 3, and the 1."), and "so" the right final answer may follow
      // the last step ("That's 6, so 66.").
      let bare = 0;
      for (const part of plain.split(/\s*[,;]\s*|\s+(?=(?:so|then|and)\s)/)) {
        const led = /^so\b/.test(part.trim());
        const words = part.replace(/^(?:(?:so|then|and|okay|ok|um|oh|yes|yeah)\b\s*)+/g, "").trim();
        if (valueSeen && /^\d+(?:\s+(?:then|and)\s+\d+)*$/.test(words)) {
          const ns = words.split(/\s+(?:then|and)\s+/).map(Number);
          const said = ns.every((x) => saidAs(number(x), value));
          bare += said ? 1 : 0;
          if (!said && !ns.every((x) => operands.includes(x)) && !(led && lastStep && ns.length === 1 && ns[0] === answer)) return "other_number";
          if (bare > 1) return "other_number";
        }
        if (valuesIn(collapsed(part), opts).some((v) => saidAs(v, value))) valueSeen = true;
      }
    }
  }
  // For the final answer, a written digit or carry with no column is one of the question's ("I carry 6. It's 66." is not).
  if (!target) {
    const carries = steps.flatMap((st) => ("carryOut" in st && st.carryOut > 0 ? [st.carryOut, 10] : []));
    const writes = [...steps.flatMap((st) => ("write" in st && typeof st.write === "number" ? [st.write] : [])), ...(pkg.answer.value.type === "number" ? [pkg.answer.value.value] : [])];
    for (const c of columnClaims(claimText(kept))) {
      // "I put the 1 with the tens" is the carry, said with a column.
      if (c.value === null || claimPlaces(c.tail).length > 0 || /^\s*with\b/.test(c.tail)) continue;
      if (c.carry ? !carries.includes(c.value) : !writes.includes(c.value)) return "claim";
    }
  }
  // Written digits and carries, as every reading of a column checks them.
  if (target && "place" in target && "write" in target) {
    const claims = checkColumnClaims(pkg, target, pkg.steps, target, claimText(kept));
    if (claims !== "right") return "claim";
  }
  return null;
}
const PLACE_WORDS = new Set(["ones", "tens", "hundreds", "thousands", "tenths", "hundredths", "thousandths"]);

/** Bare present imperatives: a clause that starts with one of them, with no subject, asks Maya to do it. */
const IMPERATIVES = new Set(["show", "add", "start", "help", "do", "tell", "check", "explain", "give"]);
/** Words a request may start with before its imperative ("Now show me."). */
const REQUEST_LEAD = new Set(["now", "okay", "ok", "um", "uh", "oh", "well"]);
/** Words that carry on the child's own steps ("then add 9"): after one, add or start with what it works on is narration. */
const STEP_LEAD = new Set(["then", "so", "and", "first", "next"]);
/** Verbs a step lead may carry on as narration, when what they work on follows. */
const NARRATED = new Set(["add", "added", "adding", "start", "started"]);

/**
 * The clause asks Maya to do or show something (review P2 and its re-checks, 2026-11-12). It does when:
 * (a) "you" comes before a word other than a past "showed" or "taught" ("You show me.", "Now you add.");
 * (b) it holds "show me", "show us", "help", "tell me", "give me", "explain" or "please" anywhere, with or without a lead
 *     word ("Then show me.", "7 and 9, then show me.");
 * (c) it starts, after filler (REQUEST_LEAD) and step leads (STEP_LEAD), with a bare present imperative (IMPERATIVES),
 *     except that after a step lead "add" or "start" followed by a number, a place, "the" or "with" is narration ("then
 *     add 9", "then add the ones", "then start with 7"); a bare "So add." stays a request.
 * A past or -ing form at the start ("Added 7 and 9.", "Adding 7 and 9") is never a request. `words` is the clause as the
 * child said it, with its lead word.
 */
function asksMaya(words: readonly string[]): boolean {
  for (let i = 0; i < words.length; i++) {
    if (words[i] === "you" && words[i + 1] !== "showed" && words[i + 1] !== "taught") return true;
    if (["show", "tell", "give"].includes(words[i]) && (words[i + 1] === "me" || words[i + 1] === "us")) return true;
    if (["help", "explain", "please"].includes(words[i])) return true;
  }
  let i = 0;
  let led = false;
  for (; i < words.length; i++) {
    if (STEP_LEAD.has(words[i])) led = true;
    else if (!REQUEST_LEAD.has(words[i])) break;
  }
  const verb = words[i];
  if (verb === undefined) return false;
  if (led && NARRATED.has(verb)) {
    const next = words[i + 1];
    return !(next !== undefined && (plainNumber(next) !== null || PLACE_WORDS.has(next) || next === "the" || next === "with"));
  }
  return IMPERATIVES.has(verb);
}

/** The steps the ladder is past: done by the child, or passed after Maya showed them at H3 (copiedStep). */
const behind = (s: Session) => (s.passed?.length ? [...s.done, ...s.passed] : s.done);

/**
 * The step Maya showed at H3 that this turn only copies or acknowledges, so the ladder goes past it with no credit (PR
 * #698, C04-r2: "You said 16, so I wrote 6" got the ones again until Maya gave the answer). The step is the first one the
 * ladder is not past, an addition column, and the one Maya showed at H3. The turn is, as a whole (stepTurnBody, with
 * next-step questions beside it), the step's value or sum ("16.", "7 plus 9 is 16."), Maya's number said back ("You said
 * 16.", "You said 16, so it's 16."), or, only right after the show (justShown, round 5), a plain acknowledgement ("I see.",
 * "Got it.") or only next-step questions ("Where does the 1 go?"). A bare "Yes." or "Okay." is none of these: a yes moves Maya past nothing she did not ask about (j06-review,
 * P3). Null for any other turn: a help request or a failure keeps the H3 rule. A claim about the child's own paper is no
 * copy: it is credited as theirs (stepTurnHeard).
 */
function copiedStep(s: Session): string | null {
  const pkg = s.package;
  if (!pkg || !s.turn || s.turn.uncertain) return null;
  const steps = workSteps(pkg);
  const st = steps.find((x) => !behind(s).includes(x.id));
  if (!st || st.kind !== "add-column" || s.ladder.step !== st.id) return null;
  // Round 5 (#698, P1-1): only a step of this question that Maya showed at H3 in this call. The easier example's steps
  // never pass a step of the child's own question: the example is another problem, and its carry ("Oh, so you carry the
  // 1.") or "I did that" after it says nothing about this one.
  if (!shownStep(s, st.id)) return null;
  // A turn with none of this step's numbers (an acknowledgement, a next-step question, "I did that", a carry alone) is a
  // copy only right after the show (justShown), never after the easier example or later help.
  const just = justShown(s, st.id);
  if (just && onlyNextStepQuestions(s.turn.text, st.carryOut)) return st.id;
  // A turn the commit rule would credit but for the show (ownTurn) only copies it.
  if (ownTurn(s, st, number(st.total), { shownToo: false }) === null) return st.id;
  const body = stepTurnBody(s.turn.text, st.carryOut);
  if (body !== null && (stepForm(pkg, st, number(st.total), body) === "total" || (echoesShown(body, st.total) && (just || valuesIn(body).length > 0)))) return st.id;
  // Round 4 (#698, practice on 6a0581bd and bef51538): a turn that restates the shown step in this step's own numbers, or
  // (right after the show) says it did it, with questions about the next column or work on it beside ("You said 7 plus 9
  // is 16. So I write the 6, right?", "I'd write the 6 and carry the 1 ten, like your example."). The example's own
  // numbers may come beside, after "in your example", as a tag.
  const after = steps[steps.indexOf(st) + 1];
  return copiesStep(st, after?.kind === "add-column" ? after : null, s.turn.text, exampleStepFor(s, st.id), just) ? st.id : null;
}

/**
 * Maya's last guide was her show (H3) of this step, and nothing has moved the teaching on since: no example, no new try, no
 * other guide (a confirm, a wait or a redirect between keeps it). Round 5: only then may a turn with none of the step's own
 * numbers pass it.
 */
function justShown(s: Session, id: string): boolean {
  const last = s.prompt;
  if (!last || last.step !== id || last.key === "" || last.times === 0) return false;
  return last.shown === true || (last.top ?? last.level) >= 3;
}

/**
 * The easier example is over (PR #698 rounds 4 and 5): the child's next turn is a real turn on their own question. The ladder
 * of the step they were on goes back below the show (to H1 at most, so the next help is H2, never the show twice in a
 * row), and the loop guard's row and show go with it; the show count stays (shows), so a copy of a shown step still goes
 * past it, and the step is never shown a third time. The floor stays at H1 at most, so the help never starts over at H0.
 * The example is offered once, so the call still ends: no progress up the ladder again leads to close.stuck. Round 4 made
 * this reset only with the new try (try_target), which is not offered after progress on an earlier step, so after the tens
 * were shown and the example worked, the child's next turn was closed at once (round 5, P1-3).
 */
function afterExample(s: Session, ladder: Ladder) {
  if (ladder.hint >= 3 && !(s.shows?.[ladder.step])) s.shows = { ...(s.shows ?? {}), [ladder.step]: 1 };
  // A question type with its own way out (ownWayOut) keeps its ladder: its honest close after the example reads it. The
  // loop guard's row still ends, so a child who goes on working is never closed for Maya's help before the example.
  if (!ownWayOut(s.package)) Object.assign(ladder, { hint: Math.min(ladder.hint, 1), unlocked: Math.min(ladder.unlocked, 2), failures: 0 });
  if (s.prompt) {
    const rest = { ...s.prompt, key: "", times: 0, floor: Math.min(s.prompt.floor, 1) };
    delete rest.shown;
    s.prompt = rest;
  }
}

/** The easier example's step with this id, when the example worked it before the child's new try and it is an addition column. */
function exampleStepFor(s: Session, id: string): Extract<WorkedStep, { kind: "add-column" }> | null {
  const at = s.package?.easierExample.steps.slice(0, s.exampleShown).find((x) => x.id === id);
  return at?.kind === "add-column" ? at : null;
}

type AddColumn = Extract<WorkedStep, { kind: "add-column" }>;
const escapeRe = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Filler words a clause of a copy may start with. */
const COPY_FILLER = /^(?:so|and|then|okay|ok|oh|um+|uh|yes|yeah|wait|now|but|alright|well)\b[,\s]*/;
/** Maya's words or her example named as the source, before the copy ("You said", "Like you said", "Like your example"). */
const COPY_SOURCE = /^(?:you said(?: that)?(?: to)?|like you said|like you showed(?: me)?|you showed(?: me)?(?: to)?|like (?:in )?(?:your|the) example|like you did(?: in the example)?)\b[,\s]*/;
/** A source or check tag after the copy ("like you said", "right"). */
const COPY_TAIL = /(?:,?\s*\b(?:like (?:you said|you showed(?: me)?|(?:in )?(?:your|the) example|you did)|right|first|too|again|already|now))+$/;
/** A whole clause that is only a check of what was said, in a question ("Is that right?", "Right?"). */
const CHECK_TAG = /^(?:is that right|is it right|right|correct|is that correct|did i get it right|am i right|is that it|okay)$/;
/** A whole clause that is only an acknowledgement ("Okay, I'm ready.", "I see."). */
const COPY_ACK = /^(?:i see|got it|i get it(?: now)?|i understand(?: now)?|i'?m ready|i'?ll try|thanks?|thank you|sorry)$/;
/** A first-person help statement ("I still don't know what to do with the tens."). */
const HELP_STATEMENT = /^(?:i (?:still )?(?:don't|do not|didn't) (?:know|get|understand|see)|i'?m (?:still )?(?:stuck|lost|not sure|confused))\b/;

/**
 * One clause restates this addition column in its own numbers (copiesStep), with its filler, source and check tag
 * removed: its sum ("7 plus 9 is 16"), its total ("16", "I got 16 for the ones"), its written digit ("I wrote the
 * 6", "So I write the 6", "the 6 goes in the ones"), its carry ("carry the 1 ten", "I carried the 1 up top"), both joined by
 * "and", or that the child did it ("I did that", "I already did the ones"). "copy" for one with its sum, total or written
 * digit; "weak" (round 5) for a carry alone or "I did that", which say none of the column's own numbers; "tag" for a
 * clause that says nothing ("Okay", "like your example", "right" in a question); null for anything else: another number,
 * a hedge, a negation, another speaker, another column.
 */
function copyClause(step: AddColumn, next: AddColumn | null, clause: string, question: boolean): "copy" | "weak" | "tag" | null {
  let c = clause.trim().replace(/[.!?]+$/, "").trim();
  for (let i = 0; i < 4; i++) c = c.replace(COPY_FILLER, "").replace(COPY_SOURCE, "");
  c = c.replace(COPY_TAIL, "").trim();
  if (c === "" || COPY_ACK.test(c) || (question && CHECK_TAG.test(c))) return "tag";
  c = c.replace(/^(?:so do i|then do i|do i|should i|can i|i should|i need to|i have to)\s+/, "");
  const place = escapeRe(step.place);
  if (new RegExp(`^(?:i (?:already )?(?:did|done|finished) (?:that|it|this|that one|that part|the ${place})|i've done (?:that|it|the ${place})|the ${place} (?:is|are) done)$`).test(c)) return "weak";
  const operands = (step.carryIn > 0 ? [...step.digits, step.carryIn] : step.digits).slice().sort((a, b) => a - b).join(",");
  const sum = wholeSum(c.replace(/^i (?:did|added|add)\s+/, ""));
  if (sum) return sum.sum === step.total && [...sum.operands].sort((a, b) => a - b).join(",") === operands ? "copy" : null;
  const total = new RegExp(`^(?:(?:i (?:already )?(?:got|get)|it's|it is|that's|that is|that makes|it makes)\\s+)?(.+?)(?: for (?:the ${place}|those|them|that))?$`).exec(c);
  if (total && plainNumber(total[1]) !== null) return plainNumber(total[1]) === step.total ? "copy" : null;
  const nextPlace = next ? escapeRe(next.place) : "tens";
  const parts = c.split(/\s+and\s+(?:then\s+)?/);
  const subject = "(?:(?:i|you)(?:'d| would| will|'ll| just| already| have| then)? )?";
  const write = new RegExp(`^${subject}(?:write|wrote|written|put)(?: down)? (?:the |a |just )?(\\S+)(?: down)?(?: (?:in|on|at|under|into) the (\\w+)(?: (?:column|place|spot))?)?$`);
  const goes = /^(?:the )?(\S+) goes (?:down|(?:in|at|under|on) the (\w+)(?: (?:column|place|spot))?)$/;
  const carry = new RegExp(`^${subject}(?:carry|carried|carrying|move|moved)(?: over| up)? (?:the |a )?(\\S+)(?: ten| one)?(?: (?:to|into|over to|up to|on|at|in|over) (?:the )?(\\w+)(?: (?:column|place|spot))?)?(?: (?:up top|on top|at the top))?$`);
  // Round 5: a carry alone is "weak" (the easier example may carry the same digit); a written digit makes it a copy.
  let written = false;
  for (const part of parts) {
    const w = write.exec(part) ?? goes.exec(part);
    if (w) {
      if (plainNumber(w[1]) !== step.write || (w[2] !== undefined && w[2] !== step.place)) return null;
      written = true;
      continue;
    }
    const k = carry.exec(part);
    if (k) {
      if (step.carryOut === 0 || plainNumber(k[1]) !== step.carryOut || (k[2] !== undefined && !new RegExp(`^(?:${nextPlace}|top)$`).test(k[2]))) return null;
      continue;
    }
    return null;
  }
  return written ? "copy" : "weak";
}

/**
 * The child's turn copies or acknowledges this addition column, which Maya showed at H3, in the column's own numbers (PR
 * #698 round 4: "You said 7 plus 9 is 16. So I write the 6, right?", "Okay, I wrote the 6. What do I do with the tens?",
 * "I'd write the 6 and carry the 1 ten, like your example." each got the ones again, until the stuck close). An allow-list
 * over the whole turn, fail-closed: at least one clause restates the column with its sum, total or written digit
 * (copyClause "copy"), or, only right after the show (`just`, round 5), with a carry alone or "I did that" ("weak"); and
 * every other sentence is one of:
 * - a filler, an acknowledgement or, in a question, a check tag ("Okay.", "Is that right?");
 * - a next-step question (nextStepQuestion), or any question whose only numbers are the carry or the next column's own
 *   numbers and which does not name this column ("Now the tens?", "Do I add the 1 ten to the tens now?");
 * - a help statement whose only number is the carry, not about this column ("But I still don't know the tens.");
 * - a clause about the easier example (`example`, its step with the same id) in that step's own numbers, led by "in your
 *   example": a tag, never a copy;
 * - work after it: a question, or a sentence led by "then", "next", "now", "so", "yes", "I think", "my answer" or "the
 *   answer", that does not name this column, say a carry, claim a digit written, or add this column's numbers, and whose
 *   numbers are the next column's sum or larger than this column can make ("Then 2 plus 3 is 5, so I got 56.", "Is it 66?").
 * A wrong total, digit, carry or column, a negation, a hedge before the copy, or another speaker fits none of them. A copy
 * is no credit: the ladder only goes past the column (copiedStep), and the reading judges the work after it.
 */
function copiesStep(step: AddColumn, next: AddColumn | null, text: string, example: AddColumn | null, just: boolean): boolean {
  const t = text.trim().replace(/[’‘]/g, "'").toLowerCase();
  if (t === "" || t.includes("\n")) return false;
  const place = new RegExp(`\\b${escapeRe(step.place)}\\b`);
  const nextNumbers = next ? [...next.digits, next.carryIn, next.total] : [];
  const most = 9 * step.digits.length + step.carryIn;
  const operands = (step.carryIn > 0 ? [...step.digits, step.carryIn] : step.digits).slice().sort((a, b) => a - b).join(",");
  // The numbers said, with "1 ten" read as the carried 1; NaN for a value that is not a whole number.
  const numbers = (x: string) => readNumbers(x.replace(/\b(\d+|one) tens?\b/g, "$1").replace(/\bthat one\b/g, "that")).values
    .map((v) => (v.type === "number" ? v.value : NaN));
  const asNext = (x: string) => {
    const stripped = x.replace(/^\s*(?:now|then|so|but|and|okay|ok)\b[,\s]*/, "");
    return [x, stripped, stripped.replace(/[,\s]+now(?=[?.!]*$)/, "")].some((y) => nextStepQuestion(y, step.carryOut));
  };
  const LEAD = /^(?:(?:and )?then|next|now|so|yes|yeah|i think|my answer|the answer)\b/;
  let copies = 0;
  let weak = 0;
  for (const sentence of t.split(/(?<=[.!?])\s+/).filter(Boolean)) {
    if (asNext(sentence)) continue;
    const question = /\?\s*$/.test(sentence);
    const body = sentence.replace(/[.!?]+$/, "").trim();
    const led = LEAD.test(body.replace(/^(?:okay|ok|oh|um+|uh)\b[,\s]*/, ""));
    for (const clause of body.split(/\s*[,;:]\s*|\s+(?=(?:so|then|but)\s)/).filter((c) => c.trim() !== "")) {
      const ex = /^(?:(?:so|and|okay|ok|oh)\b[,\s]*)*(?:like )?in (?:your|the) example,?\s*(?:you )?(.+)$/.exec(clause);
      const exampleKind = ex && example ? copyClause(example, null, ex[1], question) : null;
      const kind = ex ? (exampleKind === "copy" || exampleKind === "weak" ? "tag" : null) : copyClause(step, next, clause, question);
      if (kind === "copy") copies += 1;
      if (kind === "weak") weak += 1;
      if (kind !== null) continue;
      // Any other clause says nothing about this column: no place word, carry, written digit or this column's sum.
      const c = clause.replace(COPY_FILLER, "");
      const said = numbers(c);
      if (place.test(clause) || said.some((n) => Number.isNaN(n))) return false;
      if (HELP_STATEMENT.test(c) && said.every((n) => n === step.carryOut) && !/\bcarr(?!y part)/.test(c)) continue;
      if (question && said.every((n) => n === step.carryOut || nextNumbers.includes(n))) continue;
      if (/\bcarr|\b(?:write|wrote|written|put)\b/.test(c) && !question) return false;
      if (!question && !led && !LEAD.test(clause.trim())) return false;
      const sum = wholeSum(c.replace(/^(?:i (?:did|added|add)|what is)\s+/, ""));
      if (sum && [...sum.operands].sort((a, b) => a - b).join(",") === operands) return false;
      if (sum && sum.operands.every((n) => nextNumbers.includes(n))) continue;
      if (said.some((n) => n <= most && n !== step.carryOut && !nextNumbers.includes(n))) return false;
    }
  }
  // Round 5 (#698, P1-1): "I did that" or a carry alone passes only right after the show (`just`).
  return copies > 0 || (weak > 0 && just);
}

/**
 * A claim's compare step (claim.ts) is heard from a whole turn only, as a column is (review of #741, P1a): the computed
 * result alone ("80", "It's 80"), a plain yes to Maya's own "Did you say 80?", or the equation it checks ("60 plus 20 is
 * 80", compareEquationSaid), once every part before the last is done. A hedge, a question, another speaker or another
 * sentence fits none. After H3 on the last part or the compare, the value and the equation only copy what Maya showed.
 */
function compareTurnHeard(s: Session, step: Extract<WorkedStep, { kind: "claim-compare" }>, value: AnswerValue): boolean {
  const pkg = s.package;
  if (!pkg || !s.turn || s.turn.uncertain || s.done.includes(step.id)) return false;
  const body = wholeTurn(s.turn.text);
  const before = stepsBeforeLastPart(pkg);
  if (body === null || before.some((id) => !s.done.includes(id))) return false;
  const copy = s.ladder.hint >= 3 && !!s.ladder.step && !before.includes(s.ladder.step);
  const total = saidAs(number(step.value), value);
  if (copy || !total) return false;
  const yes = wholeYes(body);
  if (yes) return !!s.stepAsked && saidAs(s.stepAsked, value) && (yes.value === null || saidAs(number(yes.value), s.stepAsked));
  const bare = wholeValue(body);
  if (bare !== null) return saidAs(number(bare), value);
  return compareEquationSaid(pkg, body, step.value);
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

/** A step a whole-turn template may credit, with a total its confirm asks about. */
type CreditStep = Extract<WorkedStep, { kind: "add-column" | "operate" | "read-digit" | "bigger" | "place-worth" }>;

/**
 * The steps a whole-turn template may credit now: the first step not done when it is a column of an addition or a
 * place-value digit (read-digit, bigger, place-worth: its total is the digit, B1a and B1b), and in an evaluate question
 * the part whose column is the first step not done, of any kind (its result is a step answer with the same rules,
 * evaluate.ts). The part comes first: "85" for (47 + 38) × 3 is the part, never the ones column.
 */
function currentSteps(s: Session): CreditStep[] {
  const st = s.package ? workSteps(s.package).find((x) => !behind(s).includes(x.id)) : undefined;
  if (!st || !s.package) return [];
  const part = currentPart(s.package, st.id);
  const own = (st.kind === "operate" && !!patternOf(s.package)) || st.kind === "add-column" || st.kind === "read-digit" || st.kind === "bigger" || st.kind === "place-worth";
  return [...(part ? [part] : []), ...(own ? [st] : [])];
}

/** The first step not done or passed, when it is a column of an addition (currentSteps). */
const currentColumn = (s: Session): Extract<WorkedStep, { kind: "add-column" }> | null =>
  currentSteps(s).find((st): st is Extract<WorkedStep, { kind: "add-column" }> => st.kind === "add-column") ?? null;

/**
 * Maya showed this step at H3 in this call: kept past the easier example's new try, which starts its ladder again
 * (round 4), or the ladder is on it at H3, or, for a part of an evaluate question, on one of its columns (a row's show
 * says the part's result: "The tens row: 160 × 50 = 8000."). A value or a yes after it only copies her.
 */
function shownStep(s: Session, step: WorkedStep | string): boolean {
  const id = typeof step === "string" ? step : step.id;
  if ((s.shows?.[id] ?? 0) > 0 || (s.ladder.step === id && s.ladder.hint >= 3)) return true;
  return typeof step !== "string" && step.kind === "operate" && s.ladder.hint >= 3 && !!s.package && partIdOf(s.package, s.ladder.step) === step.id;
}

/** The total a step's confirm asks about: a column's total, a part's result, or a place-value step's digit or value. */
const totalOf = (st: CreditStep) =>
  number(st.kind === "operate" ? st.value : st.kind === "add-column" ? st.total : st.kind === "read-digit" ? st.digit : partsStepTotal(st));

/** The current step whose total is the turn's one number, with that total, for the step confirm. */
function confirmTarget(s: Session): { step: CreditStep; total: AnswerValue } | null {
  if (!s.turn || !s.package || (patternOf(s.package) && hedgedTurn(s))) return null;
  // A column statement followed only by a check of its value ("7 + 9 is 16. Is that right?"): the step's confirm
  // (sentence-level commit rule, 2026-11-12).
  const column = currentColumn(s);
  if (column && statementAsked(s, column, s.turn.text)) return { step: column, total: totalOf(column) };
  const opts = readOptionsFor(s.package);
  const values = valuesIn(s.turn.text, opts);
  if (values.length !== 1 || readAnswer(s.turn.text, opts).kept.length !== 1 || !confirmWordsOnly(s.turn.text)) return null;
  const step = currentSteps(s).find((st) => saidAs(values[0], totalOf(st)));
  return step ? { step, total: totalOf(step) } : null;
}

/**
 * The only turn Maya may ask a step's confirm about, and the number she asks: exactly one number, which is the column's full
 * total, and no other word but the short list of confirmWordsOnly. An allow-list on the words: any place, column, verb, speaker
 * or "answer" means no step confirm ("6 in the ones.", "The answer is 16.", "I wrote 6."), so she never asks about a number she
 * will not credit, and a claim about a column cannot pass as a hearing problem. Reviews of 6528f2ca and 66491fd5.
 */
function stepConfirmable(s: Session): AnswerValue | null {
  return confirmTarget(s)?.total ?? null;
}

/** A question that only checks the value the child just said: "Is that right?", "Am I right?", "Is it correct?", "Right?". */
const VALUE_CHECK = /^(?:(?:so|okay|ok|um|uh|oh)\b[,\s]*)?(?:is (?:that|it|this) (?:right|correct)|am i right|right|correct|did i get it right|did i do it right)$/;

/**
 * The turn is a step statement (the commit rule, ownTurn) followed only by questions that check
 * its value (VALUE_CHECK): "7 + 9 is 16. Is that right?" (2026-11-12). It is not credited as it is: it goes to the step's
 * confirm question ("Did you say 16?"), whose plain yes credits it (stepAsked). Any other question, or a value check
 * before the statement, is not this.
 */
function statementAsked(s: Session, step: Extract<WorkedStep, { kind: "add-column" }>, text: string): boolean {
  const t = text.trim().replace(/’/g, "'");
  if (t.includes("\n")) return false;
  const sentences = t.split(/(?<=[.!?])\s+/).filter(Boolean);
  let end = sentences.length;
  while (end > 0 && sentences[end - 1].trim().endsWith("?") && VALUE_CHECK.test(sentences[end - 1].trim().toLowerCase().replace(/[?]+$/, "").trim())) end--;
  return end > 0 && end < sentences.length && ownTurn(s, step, number(step.total), { text: sentences.slice(0, end).join(" ") }) === null;
}

/**
 * The turn may get the step's confirm now: it is confirmable, it is not already heard, Maya has not shown the step, and it is
 * not a right final answer the child is sure of (that is judged as the answer).
 */
function stepSaidUnheard(s: Session): boolean {
  const target = confirmTarget(s);
  if (!target || !s.turn || shownStep(s, target.step) || stepTurnHeard(s, target.step, target.total)) return false;
  const read = turnRead(s);
  return !(read.final && read.sure && rightForQuestion(s.package!, read.final));
}

/** A claim's result not done yet, whose turn may get the confirm (claimStepConfirmable): not heard already, not after H3. */
function claimResultUnheard(s: Session): boolean {
  return claimResultAsked(s) !== null;
}

/**
 * A claim turn whose only number is the claim's result, in words its confirm may not take ("My mom said 1440.", "I copied
 * 1440."): no confirm at all, so no yes can turn another person's number into the child's (#737 review, P1). A word the
 * child said unsure keeps its own confirm (claimConfirm), which names no number.
 */
function claimResultUnconfirmable(s: Session): boolean {
  const pkg = s.package;
  const st = pkg && s.turn ? workSteps(pkg).find((x) => x.kind === "claim-compare") : undefined;
  if (!pkg || !s.turn || st?.kind !== "claim-compare" || claimConfirm(claimTurn(s)) !== null) return false;
  const values = valuesIn(s.turn.text, readOptionsFor(pkg));
  return values.length === 1 && saidAs(number(st.value), values[0]) && !claimStepConfirmable(s.turn.text, st.value);
}

/** The claim's result to ask about ("Did you say 1440?"), or null (claim.ts, claimStepConfirmable). */
function claimResultAsked(s: Session): AnswerValue | null {
  const pkg = s.package;
  const st = pkg ? workSteps(pkg).find((x) => x.kind === "claim-compare" && !s.done.includes(x.id)) : undefined;
  if (!pkg || !s.turn || st?.kind !== "claim-compare" || s.solved !== null || (s.ladder.step === st.id && s.ladder.hint >= 3)) return null;
  const value = number(st.value);
  return claimStepConfirmable(s.turn.text, st.value) && !stepTurnHeard(s, st, value) ? value : null;
}

/**
 * The turn is about the current column and may not have its confirm: it holds a claim, or its final number is a value of the
 * column, or it has no final number but says one. A turn whose final number is another answer keeps the final answer's confirm
 * (P11, P15); a yes to that credits no step, because only stepAsked does.
 */
function stepOnlyTurn(s: Session): boolean {
  const steps = currentSteps(s);
  if (steps.length === 0 || !s.turn || !s.package || stepSaidUnheard(s)) return false;
  const opts = readOptionsFor(s.package);
  if (columnClaims(s.turn.text).length > 0) return !rightFinalIn(s);
  const final = readAnswer(s.turn.text, opts).final;
  return final ? steps.some((st) => answersStep(st, final)) && !rightForQuestion(s.package, final) : valuesIn(s.turn.text, opts).some((v) => steps.some((st) => answersStep(st, v)));
}

/**
 * The current column, when the child's turn says its total and code cannot credit it: the whole-turn refusal of
 * checkAnswers ("The child's whole turn does not say 16 for ones clearly"), read by code for the column's total whatever
 * the model reads. Null for any other turn: a step code credits, a copy after H3, a wrong claim, a plan to write the sum.
 */
function heldStepNow(s: Session): { step: string; value: AnswerValue } | null {
  const st = currentColumn(s);
  if (!st || !s.turn || !s.package || s.solved !== null) return null;
  const value = number(st.total);
  return checkAnswers(s, [{ value, step: st.id, verdict: "right" }], [])?.held ? { step: st.id, value } : null;
}

/** The blockers of rule A that are only the form of a turn, not its math: rule D asks the confirm for them. */
const FORM_BLOCKERS: readonly Blocker[] = ["hedge", "asks_value", "echo"];

/**
 * Rule D: the value this turn says right for the current step (its total) or the question, held back only by the form of
 * the turn (FORM_BLOCKERS), when Maya can say it back in her confirm. Null for a request for help, a stuck turn, a guess,
 * a wrong claim, a step Maya showed, or any turn whose value is not right.
 */
function formHeld(s: Session, reading: Reading): AnswerValue | null {
  const pkg = s.package;
  if (!pkg || !s.turn || s.solved !== null || reading.help || reading.stop || reading.safety) return null;
  const text = s.turn.text;
  if (asksForHelp(text) || saysStuck(text) || saysGuess(text) || claimJudgedWrong(s) || doubtCheckDue(s, s.ladder.step) !== null) return null;
  // A value said with a column ("16 tens?", "3 in the ones?") may mean where it is written: no confirm, as before.
  if (new RegExp(`\\b(?:${OWN_PLACES})\\b`, "i").test(text)) return null;
  // A question about why or how ("Why is 9 plus 7 sixteen?") claims no value.
  if (/\b(?:why|how|what|where|when|which)\b/i.test(text) && /\?/.test(text)) return null;
  const said = valuesIn(text, readOptionsFor(pkg));
  const st = workSteps(pkg).find((x) => !behind(s).includes(x.id));
  const candidates: [WorkedStep | null, AnswerValue][] = [
    ...(st && !shownStep(s, st) ? stepAnswers(st).slice(0, 1).map((v): [WorkedStep, AnswerValue] => [st, v]) : []),
    [null, pkg.answer.value],
  ];
  for (const [target, value] of candidates) {
    if (!said.some((v) => saidAs(v, value))) continue;
    const blocker = ownTurn(s, target, value);
    // Only the form: the same turn with no form check is right ("I add 9. I add 9. That's 16. Is that right?" is not).
    if (blocker === null || !FORM_BLOCKERS.includes(blocker) || ownTurn(s, target, value, { formToo: false }) !== null) continue;
    const offered = offersFor(s, "confirm", { steps: [], done: s.done, checked: [], rightResult: false, equal: null }).some((o) => o.line === "confirm.heard" && o.slots.heard === valueText(value));
    if (offered) return value;
  }
  return null;
}

/**
 * The loop guard (PR #698, practice at bef51538: Maya asked the ones again and again while the child said 16 in words
 * code could not credit). The second turn in a row that says the same column's total code cannot credit gets the step
 * confirm ("Did you say 16?"), whose plain yes credits it (stepAsked). After that confirm, such a turn goes up the ladder
 * ("climb"), and at the top help the honest close: never the same step line a third time. A turn that names a column or
 * claims a digit ("16 in the ones.") gets no confirm, as stepConfirmable: it climbs at once. Null for any other turn.
 */
function loopGuard(s: Session): "confirm" | "climb" | "repeat" | null {
  if (!s.turn || !s.package) return null;
  const prev = s.heldStep;
  const held = prev ? heldStepNow(s) : null;
  if (prev && held && held.step === prev.step) {
    if (prev.asked) return "climb";
    const text = s.turn.text;
    const offered = offersFor(s, "confirm", { steps: [], done: s.done, checked: [], rightResult: false, equal: null })
      .some((o) => o.line === "confirm.heard" && o.slots.heard === valueText(held.value));
    const named = columnClaims(text).length > 0 || claimPlaces(text).length > 0;
    return offered && !named && s.confirmTries < 2 && !claimJudgedWrong(s) ? "confirm" : "climb";
  }
  // Rounds 2 and 3 (#698, P1 e): any turn, credit or not. Two guides in a row on the ladder's step with no help above the
  // row's highest (any lines, any order of levels) are not followed by the same or lower help for a turn that moves
  // nothing on: the help climbs. After her H3 show of the step (with any other lines, before or after the easier example)
  // no guide on it comes again: the stuck way out. A copy of the shown step goes past it (copiedStep), so it is no repeat.
  const last = s.prompt;
  if (!last || last.step !== s.ladder.step || copiedStep(s) !== null) return null;
  if (last.shown) return "repeat";
  return last.times >= ((last.top ?? last.level) >= 3 ? 1 : 2) ? "repeat" : null;
}

/** The carry or trade explanations on a step that are no repeat in a call (round 5; D-253 item 6: once, and once more). */
const CARRY_LINES_FREE = 2;
/** Maya may still give a carry or trade explanation on this step as no repeat (carryLines, round 5). */
const carryLinesLeft = (s: Session, step: string) => (s.carryLines?.[step] ?? 0) < CARRY_LINES_FREE;

/** The acts that end the loop guard's row of prompts: each moves the teaching on (the example, a new try, the answer, the end). */
const PROMPT_ROW_ENDS: readonly Act[] = ["open", "clarify", "example_step", "try_target", "accept_answer", "give_answer", "ask_write", "close"];

/** A guide's prompt for the loop guard: its step, help level and lines ("ones|0|step.invite"; round 3: every guide, with or without a line), or null for any other act. */
function promptKey(p: Proposal, chosen: readonly { line: string }[]): string | null {
  const lines = chosen.map((o) => o.line);
  return p.act === "guide" && p.step !== undefined && p.level !== undefined ? `${p.step}|${p.level}|${lines.join(",")}` : null;
}

/** The stuck way out at the top help (#735, decision (a)): the easier example while it is not shown and safe, then the close. */
function repeatWayOut(s: Session): "example_step" | "close" {
  return s.package && s.exampleShown < s.package.easierExample.steps.length && !exampleRevealsAnswer(s) ? "example_step" : "close";
}

/** The first help level above the ladder's on its step that Maya can say, or null at the top. */
function nextHint(s: Session): number | null {
  const above = sayableHints(s).filter((level) => level > s.ladder.hint);
  return above.length > 0 ? Math.min(...above) : null;
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
  // A claim's whole result first ("7 plus 7 is 14." is the result, not only the ones): it shows every step done (claim.ts, J06).
  const steps = workSteps(pkg);
  // Rule A: the steps the child said in order, each heard on its own, from the first step not done.
  const earlier: string[] = [];
  for (const st of [...steps.filter((x) => x.kind === "claim-compare"), ...steps.filter((x) => x.kind !== "claim-compare")]) {
    if (behind(session).includes(st.id)) continue;
    const value = stepAnswers(st).find((v) => stepTurnHeard(session, st, v, earlier));
    // A step not heard leaves the next to its own order rule (a part of an evaluate question has its own, currentSteps).
    if (!value) continue;
    found.push({ value, step: st.id, verdict: "right" });
    earlier.push(st.id);
  }
  // A spot-the-error or pattern work step needs a strict wrong-number reading when the model is down.
  const current = steps.find((st) => st.id === session.ladder.step);
  if ((isSpot(pkg) || patternOf(pkg)) && current && found.length === 0 && committedTurn(session, current.id) && !notClear(session, {}) && read.final?.type === "number" &&
      !stepAnswers(current).some((value) => equivalent(value, read.final!))) {
    found.push({ value: read.final, step: current.id, verdict: "wrong" });
  }
  // Read a committed wrong final number after all work is complete, including when the model fails.
  // Claim words are read separately by claimAnswers. Do not turn copied help, another speaker or unresolved speech (alternatives) into a miss.
  // A value of a step Maya showed and the child copied (passed) is no miss either (#698).
  const copiedValue = read.final && workSteps(pkg).some((st) => (session.passed ?? []).includes(st.id) && stepAnswers(st).some((value) => equivalent(value, read.final!)));
  if (session.solved === null && currentStep(pkg, closeParts(pkg, behind(session))) === "result" && !sessionClaim(pkg) &&
      read.final && read.sure && !rightForQuestion(pkg, read.final) && !copiedValue && committedValue(session, { value: read.final, step: "result", verdict: "wrong" }) && !notClear(session, {}) &&
      wholeTurn(session.turn.text) !== null && sentenceCount(session.turn.text) === 1 && !helpInWords(session.turn.text) &&
      !hedgedTurn(session) && takenBack(session.turn.text, readOptionsIn(session)) === null && !copiesShown(session) && !copiesShownTry(session)) {
    found.push({ value: read.final, step: "result", verdict: "wrong" });
  }
  // A hedge ("I think it's 66") or a guess gets its own path (notClear, check.guess), not an accepted answer (#605).
  // "16 is 66." says one number is another: no answer code can credit.
  const body = wholeTurn(session.turn.text);
  const equated = body !== null && /^(.+?)\s+(?:is|equals|makes?)\s+(.+)$/.exec(body);
  const twoNumbers = !!equated && plainNumber(equated[1]) !== null && plainNumber(equated[2]) !== null;
  // The right final answer the child states as their own (rule A), though column narration may follow it.
  const final = [read.final, ...read.kept].find((v): v is AnswerValue => !!v && rightForQuestion(pkg, v));
  const numericFinal = !!final && ["number", "fraction", "mixed"].includes(final.type);
  if (session.solved === null && final && numericFinal && !twoNumbers && ownTurn(session, null, final) === null) found.push({ value: final, step: "result", verdict: "right" });
  // A word answer keeps the reader's own rule.
  if (session.solved === null && read.final && !["number", "fraction", "mixed"].includes(read.final.type) && read.sure && !twoNumbers && !notClear(session, {}) && !saysGuess(session.turn.text) && rightForQuestion(pkg, read.final)) found.push({ value: read.final, step: "result", verdict: "right" });
  const heard: ChildAnswer[] = [];
  for (const a of found) if (checkAnswers(session, [a], [], heard.filter((h) => h.step !== "result").map((h) => h.step)) === null) heard.push(a);
  return heard;
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
  return codeProposals(given, refused);
}

/**
 * Code's proposals for the session now. Without `plan`, the fallbacks above. With `plan` (D-341), the lines code plans
 * for the model's own act, step and help level, with the model's reading: the session checks them as any proposal, and
 * their words are what the model's `say` is checked against (proposeV3). The model picks no line.
 */
function codeProposals(given: Session, refused: readonly unknown[] = [], plan?: ModelOutput): Proposal[] {
  if (given.outcome || given.expect !== "maya") return [];
  // The fixed reply to a question about a secret, as `step` will set it: a failed model call must still say it.
  const secret = secretReplies(given);
  const session: Session = secret ? { ...given, replies: secret } : given;
  const pkg = session.package;
  const yes = yesAnswer(session);
  const modelAnswers = plan?.reading?.answers?.length ? plan.reading.answers : null;
  const kept = modelAnswers ?? (yes ? [yes] : plan ? [] : keptAnswers(session, refused));
  // A reading that named the turn off topic or harmful stands: code's own reading adds no answer to it.
  const named = plan ? (plan.reading ?? {}) : keptReading(session, refused, kept);
  const heard = plan || yes || named.offTopic || named.unsafeRequest ? [] : heardAnswers(session)
    .filter((a) => !kept.some((k) => k.step === a.step && (k.problem ?? "target") === "target"));
  const found = [...kept, ...heard];
  // A claim question's word is read by code (claim.ts), right or wrong; the model's final answers are left out.
  const answers = !yes && sessionClaim(pkg) ? spotAnswers(pkg, claimAnswers(claimTurn(session), found, session.solved !== null && session.lastResult === "right"), session.done) ?? [] : found;
  const keptFields: Reading = plan ? (({ answers: _a, ...rest }) => (void _a, rest))(plan.reading ?? {}) : keptReading(session, refused, answers);
  // A reading's answers are numbers: `step` reads a claim's word again itself.
  const said = answers.filter((a) => isAnswerValue(a.value));
  const reading: Reading | undefined = said.length > 0 || Object.keys(keptFields).length > 0 ? { ...keptFields, ...(said.length > 0 ? { answers: said } : {}) } : undefined;
  // A valid reading can carry no credit, for example a copied H3 step. Use the controller's checked results.
  const checked: Checked[] = [];
  if (pkg && answers.length > 0) checkAnswers(session, answers, checked);
  const rightResult = checked.some((c) => c.problem === "target" && c.answer.step === "result" && c.answer.verdict === "right");
  // The session after the reading, as `step` will see it: a checked wrong final answer takes back the solution that
  // stood, and right steps are done; the ladder is on the first step still not done.
  const wrongResult = checked.some((c) => c.problem === "target" && c.answer.step === "result" && c.answer.verdict === "wrong");
  const s: Session = { ...session, ...(wrongResult ? { solved: null } : {}), ...(keptFields.paper ? { paper: "child_confirmed" as const } : {}) };
  const equal = equalIn(pkg, checked);
  const done = pkg ? closeParts(pkg, workSteps(pkg).map((st) => st.id)
    .filter((id) => equal !== null || session.done.includes(id) || checked.some((c) => c.problem === "target" && c.answer.step === id && c.answer.verdict === "right")
      || claimResultDone(pkg, [...session.done, ...checked.filter((c) => c.problem === "target" && c.answer.verdict === "right").map((c) => c.answer.step)]))) : [];
  // As `step` will see it: a write plan takes its column out of `done`, and a lost carry makes the regroup due.
  const regroup = pkg ? regroupAfter(s, checked, done) : { due: [], said: [] };
  // As `step` will see it: a copy of the step Maya showed at H3 moves the ladder past it, with no credit (copiedStep).
  const copied = copiedStep(session);
  const passed = [...(session.passed ?? []), ...(copied ? [copied] : [])];
  const ladderStep = pkg ? guideStep(pkg, [...done, ...passed], regroup) : "result";
  const view: View = { steps: [ladderStep], done, checked, rightResult, equal, regroup: pendingRegroup(regroup), regroupSaid: regroup.said, regroupTimes: regroup.times };
  // The acts come from the reading `step` will check, a claim's word included (review of #740: a wrong word at a compare's
  // top help left only guide offers, which the place-value rule refuses, and the call ended with no safe line).
  const actsReading: Reading = { ...(reading ?? {}), ...(answers.length > 0 ? { answers } : {}) };
  const misses = finalMisses(s, checked);
  const allowedActs = (gate(s, {}) ?? actsNow(s, actsReading, rightResult, done.length > 0, misses)).acts;
  // The loop guard at the top help: after the same prompt (the show once), code takes the way out teachingActs offers, the
  // easier example or the honest close, never the same help again or a lower one (loopGuard, P1 e).
  // It takes the guide's place, so a confirm of a doubtful right answer still comes first.
  // Round 4: the check of a doubtful right answer together (doubtCheckDue) comes before the way out: it is no repeat.
  const checkDue = ladderStep === s.ladder.step && doubtCheckDue(s, ladderStep) !== null;
  const wayOut = !rightResult && s.solved === null && !checkDue && ladderStep === s.ladder.step && loopGuard(s) === "repeat" && nextHint(s) === null && allowedActs.includes(repeatWayOut(s)) ? repeatWayOut(s) : null;
  const acts = wayOut ? [...new Set(allowedActs.map((a) => (a === "guide" ? wayOut : a)))] : allowedActs;
  // A right final answer the child was not sure of: the confirmation comes before more help (#605).
  const read = session.turn && pkg ? turnRead(session) : null;
  const doubtful = !rightResult && s.solved === null && pkg !== null && read?.final != null && !read.sure && rightForQuestion(pkg, read.final) ? read.final : null;
  // Once the answer stands, the request to write it (or the close) comes before more help on a step. After two wrong
  // final answers on the final step, the backup close takes the place of more help (D-326).
  const solved = s.solved !== null || rightResult;
  // A step a model named, in a turn that is not heard: the confirm question comes before more help. Only that refusal: a
  // claim judged wrong is not a hearing problem (review of fec3dac4).
  // With no model reading, a step statement followed by a check of its value ("7 + 9 is 16. Is that right?", statementAsked)
  // goes to the same confirm question (sentence-level commit rule, 2026-11-12).
  const column = currentColumn(session);
  const askedStatement = !!column && answers.length === 0 && !!pkg && !!session.turn && statementAsked(session, column, session.turn.text) && stepSaidUnheard(session);
  const unheard = askedStatement || refused.flatMap(answersOf).some((a) => !answers.some((k) => k.step === a.step) && checkAnswers(session, [a], [])?.unheard === true);
  // A claim child who only asks for help and has not seen the easier example gets it first (lesson 10, #737 review P2).
  const claimPkg = sessionClaim(pkg) !== null;
  const exampleFirst = claimPkg && claimExampleDue(s) && claimHelpOnly(s, reading ?? {}, rightResult);
  const rank = (a: Act) => (exampleFirst && a === "example_step" ? -1 : (solved && a === "ask_write") || ((doubtful || unheard) && a === "confirm") ? FALLBACK_ORDER.indexOf("guide") - 0.5 : a === wayOut ? FALLBACK_ORDER.indexOf("guide") : FALLBACK_ORDER.indexOf(a));
  const order = plan ? [plan.act] : [...new Set(unheard && s.opened && s.turn && s.confirmTries < 2 && s.solved === null && !rightResult ? [...acts, "confirm" as Act] : acts)].sort((a, b) => rank(a) - rank(b)).filter((a) => a !== "accept_answer" || rightResult);
  const make = (act: Act, offers: LineOffer[], extra: Partial<Proposal> = {}): Proposal => ({
    version: PROPOSAL_VERSION, act, parts: offers.map((o) => ({ line: o.line, slots: o.slots })), ...extra, ...(reading ? { reading } : {}),
    ...(plan?.draw ? { draw: plan.draw } : {}),
  });
  const byLevel = (offers: LineOffer[]) => [...offers].sort((a, b) => (a.level ?? 0) - (b.level ?? 0));
  return order.flatMap((act) => {
    const offers = offersFor(s, act, view).filter((o) => !o.requires || meets(o.requires, view, s.package));
    const free = offers.filter((o) => !o.requires);
    let lineSets: Proposal[];
    switch (act) {
      case "guide": {
        // A step the child just did right is said first ("Yes! 7 + 9 = 16."), else a checked wrong answer on this step.
        const fresh = done.filter((id) => !session.done.includes(id) && !(pkg && partCovered(pkg, done, id))).at(-1);
        const judge = offers.find((o) => o.line === "check.equal") ?? offers.find((o) => o.line === "check.right_step" && o.slots.step === fresh) ??
          offers.find((o) => o.line === "check.not_yet" && o.slots.step === ladderStep) ??
          // A claim's wrong word while a column is on the ladder ("It's no." at the ones' top help): "Not quite." for the
          // answer first, which `step` requires for checked wrong work, so the help after it is not refused (#737 review).
          (claimPkg && checked.some((c) => c.problem === "target" && c.answer.step === "result" && c.answer.verdict === "wrong")
            ? offers.find((o) => o.line === "check.not_yet" && o.slots.step === "result") : undefined);
        // A due regroup is said before any other help on its column.
        const due = (view.regroup ?? []).some((c) => c.at === ladderStep);
        // The next level up comes first on a step the child is still stuck on (#605), H3 for a child who asks to be shown,
        // then the levels above it, then the ones below: a line above what the session allows is refused and passed over.
        const hint = ladderStep === s.ladder.step ? helpHint(s) : -1;
        // Another person's or a copied claim result ("My mom said 1440."): ask for the child's own work on this step, its
        // H0 invite, not more help (claim.ts, #737 review P3).
        const own = reading?.help === undefined && claimResultUnconfirmable(session);
        const target = reading?.help === "show" ? 3 : session.turn && !own ? hint + 1 : 0;
        const lv = (o: LineOffer) => o.level ?? 0;
        const levelled = [...byLevel(free).filter((o) => lv(o) >= target), ...byLevel(free).filter((o) => lv(o) < target).reverse()];
        // Round 5: only while a carry explanation on the step is still no repeat (carryLinesLeft); after that the help climbs.
        const why = asksWhyIn(s) && carryLinesLeft(s, ladderStep);
        // A question about the carry gets the second way (step.why) when it is offered, else the line that says where the
        // carried digit goes (step.point), else where it comes from (step.regroup) (C26).
        const whyRank = (o: LineOffer) => (o.line === "step.why" ? 3 : o.line === "step.point" && (o.level ?? 0) <= hint + 1 ? 2 : o.line === "step.regroup" ? 1 : 0);
        const help = levelled.sort((a, b) => (due ? Number(b.line === "step.regroup") - Number(a.line === "step.regroup")
          : why ? whyRank(b) - whyRank(a)
          // A claim's step help before its question lines: "Let's find 282 × 6 first." after the result asks for the step
          // again (claim.ts, #737 review P2, J06).
          : claimPkg ? Number(a.line.startsWith("question.")) - Number(b.line.startsWith("question.")) : 0));
        // A right final answer said with doubt or as a guess: check it together, with the step's question (#605).
        const lead = offers.find((o) => o.line === "check.guess") ?? offers.find((o) => o.line === "check.together");
        const asks = lead ? byLevel(free).filter((o) => o.slots.step === ladderStep && (o.line === "step.operation" || o.line === "step.invite")).reverse() : [];
        const sets = [...asks.map((h) => [lead!, h]), ...(judge ? help.map((h) => [judge, h]) : []), ...help.map((h) => [h])];
        // D-341: the model's own help level first, then lower, then higher; a located misconception's lines first.
        const want = plan?.level ?? null;
        const located = plan ? turnFacts(session).some((f) => f.misconception && f.step === ladderStep) : false;
        const levelOf = (set: LineOffer[]) => set.at(-1)!.level ?? 0;
        const score = (set: LineOffer[]) => (located && set.some((o) => o.line === "step.order" || o.line === "step.regroup") ? 0 : 100) +
          (want === null ? 0 : levelOf(set) === want ? 0 : levelOf(set) < want ? 10 + want - levelOf(set) : 20 + levelOf(set) - want);
        const ordered = plan ? sets.map((set, i) => ({ set, i })).sort((a, b) => score(a.set) - score(b.set) || a.i - b.i).map((x) => x.set) : sets;
        lineSets = ordered.map((set) => make(act, set, { step: ladderStep, level: levelOf(set) as HintLevel }));
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
        lineSets = s.state === "CONTENT_HOLD" ? [make(act, offers)] : [...(!gate(s, reading ?? {}) && ((acts.length === 1 && acts[0] === "close") || wayOut === "close") && free.some((o) => o.line === "close.stuck") && free.some((o) => o.line === "close.together") ? [make(act, [free.find((o) => o.line === "close.stuck")!, ...(pkg && closeExpressionContainsAnswer(pkg.operation, pkg.answer.value) ? [] : [free.find((o) => o.line === "close.together")!])])] : []), ...byLevel(free).map((o) => make(act, [o], o.slots.step ? { step: o.slots.step } : {}))];
        break;
      case "confirm":
        // The child's doubtful final answer first (#605), then the number they said last.
        {
          const stepTotal = unheard ? stepConfirmable(s) ?? claimResultAsked(s) : loopGuard(session) === "confirm" ? heldStepNow(session)!.value : null;
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

// ---------- Conversational turns (D-341) ----------

/** A reading with its plain defaults left out, so a version 3 reading reads like a version 2 one. */
function plainReading(raw: unknown): unknown {
  return isObject(raw) && isObject(raw.reading) ? { ...raw, reading: withoutDefaults(raw.reading) } : raw;
}

/** The shape check of a version 3 output: `say`, a known act, and the version 2 checks of its other fields. */
function outputProblem(raw: unknown): string | null {
  if (!isObject(raw) || typeof raw.say !== "string") return "the output is an object with `say`";
  const { say: _say, ...rest } = raw;
  void _say;
  return proposalProblem({ ...rest, version: PROPOSAL_VERSION, parts: [] });
}

/**
 * The code-written opening (D-341, approved by Savar 2026-11-12): said at the start, before the child speaks, with no
 * model call; the question is staged on the board. A workbook session keeps its printed-reference opening.
 */
function openConversation(s: Session, effects: Effect[]) {
  const pkg = s.package!;
  // A workbook session (it confirms the printed reference) names the page and the question number.
  const text = openingLine(pkg, s.confirmWorkbook && pkg.ref.source === "workbook" ? { page: pkg.ref.page, number: pkg.ref.question } : undefined);
  effects.push({ kind: "say", act: "open", text });
  s.turns.push({ at: s.now!, speaker: "maya", text, state: "OPEN", act: "open" });
  const columns = s.noBoard ? null : columnsOf(s, "target");
  if (columns) {
    s.batches += 1;
    effects.push({ kind: "board", batch: { transactionId: `${s.callId}-b${s.batches}`, commands: [columns] } });
    s.boardRoles = { ...s.boardRoles, question: "target" };
  }
  s.opened = true;
  waitForChild(s);
}

/** One fact code computed about a number in the child's turn, for the model's brief and the say check. */
export interface TurnFact {
  /** The fact in plain words, for the model. */
  text: string;
  /** The numbers the fact names: Maya may say them. */
  numbers: SayValue[];
  /** The step it is about. */
  step?: string;
  /** A named misconception (src/lib/assessment/misconceptions.ts): O1 smaller from larger, O3 forgot the carry. */
  misconception?: "O1" | "O3";
  /** The child's value, when code judged it wrong. */
  wrong?: SayValue;
}

/** The say values of an answer value. */
function sayValues(v: AnswerValue): SayValue[] {
  switch (v.type) {
    case "number":
    case "quantity":
      return [numberValue(v.value)];
    case "fraction":
      return [fractionValue(v.numerator, v.denominator)];
    case "mixed":
      return [fractionValue(v.whole * v.denominator + v.numerator, v.denominator), fractionValue(v.numerator, v.denominator)];
    case "remainder":
      return [numberValue(v.quotient), numberValue(v.remainder)];
    case "time":
      return [timeValue(v.hours, v.minutes)];
    case "compound":
      return v.parts.map((x) => numberValue(x.value));
    default:
      return [];
  }
}

/** The numbers printed in the question: its text, its operation, and each digit of a whole operand with its place value. */
function printedValues(pkg: OperationPackage): SayValue[] {
  const out = [...valuesOf(pkg.text), ...valuesOf(operationText(pkg.operation))];
  for (const n of operandsOf(pkg.operation)) {
    const digits = String(n).replace(/[^0-9]/g, "").split("").map(Number);
    const whole = String(Math.trunc(Math.abs(n))).length;
    digits.forEach((d, i) => {
      out.push(numberValue(d));
      if (i < whole) out.push(numberValue(d * 10 ** (whole - 1 - i)));
    });
  }
  return out;
}

const valueIn = (v: SayValue, list: readonly SayValue[]) => list.some((x) => sameSayValue(v, x));

/**
 * What code knows about each number the child said this turn: the step it fits and whether it is right, or the
 * misconception it shows, with the numbers (D-341): "6 is 8 - 2: the child took the smaller digit from the larger. In
 * the ones, 2 is smaller than 8, so the ones need a regroup: 12 - 8." A question ("Is 2 minus 8, 6?") counts too.
 */
export function turnFacts(s: Session): TurnFact[] {
  const pkg = s.package;
  if (!pkg || !s.turn) return [];
  const printed = printedValues(pkg);
  const steps = workSteps(pkg);
  const credited = new Set([...s.done, ...(s.passed ?? [])]);
  const facts: TurnFact[] = [];
  const seen: SayValue[] = [];
  const known = steps.flatMap((st) => [...stepAnswers(st).flatMap(sayValues), ...valuesOf(stepText(st, pkg.operation))]);
  const spoken = valuesOf(s.turn.text);
  const equations = sentencesOf(s.turn.text).flatMap((x) => equationsOf(x));
  const results = equations.map((e) => e.result);
  const said = equations.flatMap((e) => e.operands.filter((o) => !results.some((r) => sameSayValue(r, o))).map(({ key, q }) => ({ key, q })));
  for (const v of valuesIn(s.turn.text, readOptionsFor(pkg))) {
    if (v.type !== "number" && v.type !== "fraction" && v.type !== "mixed") continue;
    const sv = sayValues(v)[0];
    if (!sv || valueIn(sv, seen)) continue;
    seen.push(sv);
    const vt = valueText(v);
    // A number of the question itself, or an operand of an equation the child says ("Is 2 minus 8, 6?": 2 and 8), is
    // no answer, unless it is the child's whole turn.
    const bare = valuesIn(s.turn.text, readOptionsFor(pkg)).length === 1;
    if (!bare && (valueIn(sv, printed) || valueIn(sv, said))) continue;
    // A place said as a count ("I traded a ten", "this one") is no number the child gave.
    if (!valueIn(sv, spoken)) continue;
    if (rightForQuestion(pkg, v)) {
      facts.push({ text: `${vt} is the right final answer.`, numbers: [sv] });
      continue;
    }
    const fits = steps.find((st) => !credited.has(st.id) && stepAnswers(st).some((a) => equivalent(a, v)));
    if (fits) {
      facts.push({ text: `${vt} is right for the step "${fits.id}".`, numbers: [sv], step: fits.id });
      continue;
    }
    if (valueIn(sv, printed)) continue;
    const misread = misconceptionOf(s, v, sv, vt);
    if (misread) {
      facts.push(misread);
      continue;
    }
    // A number of the work itself (a done step's value, a regrouped digit) is no wrong answer.
    if (valueIn(sv, known)) continue;
    facts.push({ text: `${vt} is not right for the step "${s.ladder.step}".`, numbers: [sv], step: s.ladder.step, wrong: sv });
  }
  return facts;
}

/** The named misconception a number of the child's turn shows, or null (O1: the smaller digit from the larger; O3: the carry left out). */
function misconceptionOf(s: Session, v: AnswerValue, sv: SayValue, vt: string): TurnFact | null {
  const pkg = s.package!;
  const credited = new Set([...s.done, ...(s.passed ?? [])]);
  const steps = workSteps(pkg);
  {
    let found: TurnFact | null = null;
    for (const st of steps) {
      if (credited.has(st.id) || v.type !== "number") continue;
      if (st.kind === "subtract-column" && st.regrouped && st.bottom !== null) {
        const have = st.top - (st.lent ? 1 : 0);
        if (have >= 0 && have < st.bottom && v.value === st.bottom - have) {
          found = {
            text: `${vt} is ${st.bottom} - ${have}: the child took the smaller digit from the larger. In the ${st.place}, ${have} is smaller than ${st.bottom}, so the ${st.place} need a regroup: ${have + 10} - ${st.bottom}.`,
            numbers: [sv, numberValue(st.bottom), numberValue(have), numberValue(have + 10)], step: st.id, misconception: "O1", wrong: sv,
          };
          break;
        }
      }
      if (st.kind === "add-column" && st.carryIn > 0) {
        const without = st.total - st.carryIn;
        // Only a bare number: "2 plus 3 plus 1 is 5" added the carry and slipped, it did not leave it out.
        const bare = valuesIn(s.turn!.text, readOptionsFor(pkg)).length === 1;
        if (bare && (v.value === without || v.value === without % 10)) {
          found = { text: `${vt} leaves out the carried ${st.carryIn} in the ${st.place}.`, numbers: [sv, numberValue(st.carryIn)], step: st.id, misconception: "O3", wrong: sv };
          break;
        }
      }
    }
    return found;
  }
}

/** The child's turn shows a named misconception on this step (a located error: its regroup help may come at once). */
const misconceptionAt = (s: Session, step: string) => turnFacts(s).some((f) => f.misconception === "O1" && f.step === step);

/** Values and equations of the steps the child has not been credited with, and of the final answer while it is open. */
function hiddenOf(s: Session, released: boolean): { forbidden: SayValue[]; answer: SayValue[]; hidden: string[] } {
  // Once the answer stands, every step of it may be said ("4 minus 2 is 2, so 24").
  if (released) return { forbidden: [], answer: [], hidden: [] };
  const pkg = s.package!;
  const printed = printedValues(pkg);
  const credited = new Set([...s.done, ...(s.passed ?? [])]);
  const known = workSteps(pkg).filter((st) => credited.has(st.id)).flatMap((st) => [...stepAnswers(st).flatMap(sayValues), ...valuesOf(stepText(st, pkg.operation))]);
  const open = workSteps(pkg).filter((st) => !credited.has(st.id));
  const forbidden = open.flatMap((st) => stepAnswers(st).flatMap(sayValues)).filter((v) => !valueIn(v, printed) && !valueIn(v, known));
  const answer = released ? [] : sayValues(pkg.answer.value).filter((v) => !valueIn(v, printed));
  const hidden = [...open.flatMap((st) => equationKeysOf(stepText(st, pkg.operation))), ...(released ? [] : equationKeysOf(`${operationText(pkg.operation)} = ${valueText(pkg.answer.value)}.`))];
  return { forbidden, answer, hidden };
}

/** The limits of the model's words on a turn code planned (`after` is the session after the plan, `planned` its words). */
function sayRules(before: Session, after: Session, p: Proposal, planned: string): SayRules {
  const pkg = after.package;
  const facts = turnFacts(before);
  const released = after.solved !== null || after.lastResult === "right";
  const children = before.turns.filter((t) => t.speaker === "child").map((t) => t.text);
  const example = pkg && (after.exampleIntroduced || after.exampleShown > 0)
    ? [...valuesOf(operationText(pkg.easierExample.operation)), ...valuesOf(pkg.easierExample.text), ...pkg.easierExample.steps.slice(0, after.exampleShown).flatMap((st) => valuesOf(stepText(st, pkg.easierExample.operation)))] : [];
  const credited = pkg ? workSteps(pkg).filter((st) => after.done.includes(st.id) || (after.passed ?? []).includes(st.id))
    .flatMap((st) => [...stepAnswers(st).flatMap(sayValues), ...valuesOf(stepText(st, pkg.operation))]) : [];
  const { forbidden, answer, hidden } = pkg ? hiddenOf(after, released) : { forbidden: [], answer: [], hidden: [] };
  const wrong = [...(p.reading?.answers ?? []).filter((a) => a.verdict === "wrong" && (a.problem ?? "target") === "target").flatMap((a) => sayValues(a.value)),
    ...facts.flatMap((f) => (f.wrong ? [f.wrong] : []))];
  const show = (p.act === "guide" && (p.level ?? 0) >= 3) || p.act === "example_step";
  const asked = p.act === "confirm" && after.heardAsked ? sayValues(after.heardAsked)[0] ?? null : null;
  return {
    allowed: [
      ...(pkg ? printedValues(pkg) : []), ...credited, ...example, ...children.flatMap(valuesOf), ...facts.flatMap((f) => f.numbers),
      ...(released && pkg ? sayValues(pkg.answer.value) : []),
    ],
    shown: valuesOf(planned),
    shownEquations: equationKeysOf(planned),
    forbidden, answer, hidden,
    wrong: released ? [] : wrong,
    mustAsk: asked,
    // The prompt asks for about 30 words (SAY_WORDS); the check allows a few more before it refuses.
    wordLimit: before.shorter ? 25 : show ? 45 : 35,
    noBoard: after.noBoard === true,
    accepting: p.act === "accept_answer" || released,
    closing: p.act === "close",
    noIntro: before.conversational === true && before.opened && !p.reading?.aboutMaya,
  };
}

/** Words of a reply that is not plain math talk: the review reads it (D-341, item 4). */
const PERSONAL = /\b(?:mom|mum|dad|family|brother|sister|grandma|grandpa|granny|friend|friends|pet|dog|cat|school|teacher|home|house|birthday|secret|secrets|love|sad|scared|worried|hurt|sick|feel|feeling|feelings|tired|angry|upset|lunch|dinner|game|games|real|person|human|promise)\b/i;

/** A turn the review reads: the child's turn was off topic, about feelings, about Maya or personal, or the reply holds more than math and encouragement. */
function needsReview(s: Session, p: Proposal, say: string): boolean {
  const r = p.reading ?? {};
  return !!(r.offTopic || r.aboutMaya || r.outsideScope || r.unsafeRequest || r.safety || r.stop) || p.act === "redirect" || p.act === "check_in" ||
    hardFeeling(s.turn?.text) || PERSONAL.test(say) || (s.turn !== null && PERSONAL.test(s.turn.text));
}

/** Lines code says in its own words whatever the model wrote: the decline, the outside-work redirect and the fixed AI replies. */
const CODE_WORD_LINES: readonly string[] = ["redirect.workbook", "redirect.decline", "about.ai", "about.no_secret"];

/** Refusals that are about code's own choice of lines, not the model's act: the next planned set is tried. */
const PLAN_REFUSALS: readonly RefusalCode[] = ["line_not_offered", "free_talk_in_math_turn", "math_line_not_last", "invalid_proposal", "turn_too_long", "missing_disclosure", "fixed_reply_first", "hint_too_high", "same_hint_again", "board_not_code", "board_not_allowed", "board_wrong_problem"];

/**
 * A version 3 output (D-341): code plans the lines for the model's act, step and level (codeProposals) and steps the
 * first plan the session accepts, so the state machine, the credit rule, the help ladder and the loop guard stay
 * code's. Then the model's own `say` replaces the plan's words when it passes the say checks against them (and, on a
 * turn that is not plain math talk, the review). Code keeps its own words for safety, the content hold, the decline,
 * the outside-work redirect and the fixed AI replies. A failed check is a refusal with its typed reason: the adapter
 * asks the model once more, then says code's plan (fallbacks).
 */
function proposeV3(base: Session, out: ModelOutput, effects: Effect[], reviews: readonly TalkReview[] | undefined, sent: readonly string[] = []): StepResult {
  const reading = out.reading ?? {};
  const acts = () => (gate(base, reading) ?? actsNow(base, reading, false)).acts;
  const no = (code: RefusalCode, reason: string, allowed: Act[], say?: SayReason | "review"): StepResult => ({ session: base, effects, refusal: { code, reason, allowed, ...(say ? { say } : {}) } });
  const located = turnFacts(base).find((f) => f.misconception);
  if (located && (out.act === "confirm" || out.act === "accept_answer")) {
    return no("act_not_allowed", `The child's number shows a mistake: ${located.text} Name it plainly, say why, and guide that step. Never confirm it.`, acts().filter((a) => a !== "confirm" && a !== "accept_answer"));
  }
  // The model's reading is its bookkeeping, not Maya's words: a wrong answer the child did not commit to ("Is 2 minus 8,
  // 6?" is a question) is left out, so it counts as no miss, and the turn goes on without a repair.
  if (reading.answers?.length) {
    const unsaid = (a: ChildAnswer) => ["answer_not_committed", "answer_not_heard"].includes(checkAnswers(base, [a], [])?.code ?? "");
    // Beside a clear right final answer, a step the turn does not say clearly is left out too: the answer stands
    // ("The tens are 4 minus 2, that's 2. 24!").
    const final = reading.answers.some((a) => a.step === "result" && a.verdict === "right" && (a.problem ?? "target") === "target" && checkAnswers(base, [a], []) === null);
    const kept = reading.answers.filter((a) => (a.verdict === "right" && !(final && a.step !== "result")) || !unsaid(a));
    if (kept.length !== reading.answers.length) out = { ...out, reading: { ...reading, ...(kept.length ? { answers: kept } : { answers: undefined }) } };
  }
  const plans = codeProposals(base, [], out);
  let accepted: { r: StepResult; p: Proposal } | null = null;
  let refused: StepResult | null = null;
  for (const draw of [true, false]) {
    for (const plan of plans) {
      if (!draw && !plan.draw) continue;
      const p = draw ? plan : { ...plan, draw: undefined };
      const r = propose(base, p, [...effects], [], false);
      if (!r.refusal) { accepted = { r, p }; break; }
      if (!refused || (PLAN_REFUSALS.includes(refused.refusal!.code) && !PLAN_REFUSALS.includes(r.refusal.code))) refused = r;
    }
    if (accepted) break;
  }
  if (!accepted) {
    if (!refused) return no("act_not_allowed", `"${out.act}" does not fit now. Allowed acts: ${acts().join(", ")}.`, acts());
    const r = refused.refusal!;
    if (!PLAN_REFUSALS.includes(r.code)) return { ...refused, effects };
    return no(r.code, `"${out.act}"${out.act === "guide" ? ` at level ${out.level ?? 0} on "${out.step ?? base.ladder.step}"` : ""} does not fit now (${r.reason}) Allowed acts: ${r.allowed.join(", ") || acts().join(", ")}.`, r.allowed.length ? r.allowed : acts());
  }
  const { r, p } = accepted;
  const at = r.effects.findLastIndex((e) => e.kind === "say");
  if (at === -1) return r;
  const planned = (r.effects[at] as Extract<Effect, { kind: "say" }>).text;
  const codeWords = p.act === "safety" || base.state === "CONTENT_HOLD" || (p.act === "close" && base.state === "SAFETY") ||
    p.parts.some((x) => "line" in x && CODE_WORD_LINES.includes(x.line)) || (p.act === "open" && !!base.confirmWorkbook);
  if (codeWords) return withSent(r, sent);
  const rules = sayRules(base, r.session, p, planned);
  if (sent.length > 0) return withStreamed(base, r, at, planned, out.say, sent, rules);
  // Too long is cut, not repaired: the leading sentences that fit are kept, each still checked (round 2).
  const say = trimSay(out.say, rules.wordLimit);
  const verdict = checkSay(say, rules);
  if (!verdict.ok) return no("say_check", `Your say was refused (${verdict.reason}): ${verdict.detail}`, [p.act], verdict.reason);
  let talk: TalkCheck[] | undefined;
  if (needsReview(base, p, say)) {
    if (reviews === undefined) talk = [{ proposed: say, code: null, review: "not_run", shown: say }];
    else {
      const review = reviews.find((x) => x.text === say)?.result ?? null;
      if (review?.verdict !== "pass") {
        const why = review?.verdict === "fail" ? `${review.reason} (${review.rules.join(", ")})` : review?.verdict === "error" ? review.reason : "no review";
        return no("say_review", `The review refused your say: ${why}. Write a short, kind reply that answers the child, then go back to the question.`, [p.act], "review");
      }
      talk = [{ proposed: say, code: null, review: "pass", shown: say }];
    }
  }
  const text = p.act === "open" ? `${planned} ${say}` : say;
  const effectsOut = r.effects.map((e, i) => (i === at && e.kind === "say" ? { ...e, text, planned, ...(talk ? { talk } : {}) } : e));
  const turns = [...r.session.turns];
  const last = turns.findLastIndex((t) => t.speaker === "maya" && t.text === planned);
  if (last !== -1) turns[last] = { ...turns[last], text, planned };
  return { session: { ...r.session, turns }, effects: effectsOut, refusal: null };
}

/** A turn whose first sentences were already said (streamed): they lead its words, whatever code's plan says after them. */
function withSent(r: StepResult, sent: readonly string[]): StepResult {
  if (r.refusal || sent.length === 0) return r;
  const lead = sent.join(" ");
  const at = r.effects.findLastIndex((e) => e.kind === "say");
  if (at === -1) return r;
  const said = (r.effects[at] as Extract<Effect, { kind: "say" }>).text;
  const text = said.startsWith(lead) ? said : `${lead} ${said}`;
  const turns = [...r.session.turns];
  const last = turns.findLastIndex((t) => t.speaker === "maya" && t.text === said);
  if (last !== -1) turns[last] = { ...turns[last], text, planned: turns[last].planned ?? said };
  return { ...r, session: { ...r.session, turns }, effects: r.effects.map((e, i) => (i === at && e.kind === "say" ? { ...e, text } : e)) };
}

/**
 * A version 3 reply whose first sentences were streamed (D-341): those stay said. The rest of the reply follows them as
 * far as the checks pass on the whole; anything after the first failing sentence is dropped, never said. A rest that
 * needs the review (not plain math talk) is dropped too: the streamed sentences passed the stream's own checks.
 */
function withStreamed(base: Session, r: StepResult, at: number, planned: string, say: string, sent: readonly string[], rules: SayRules): StepResult {
  const all = sentencesOf(say);
  const rest = all.slice(0, sent.length).join(" ") === sent.join(" ") ? all.slice(sent.length) : [];
  let keep = rest.length;
  while (keep > 0 && (!checkSay([...sent, ...rest.slice(0, keep)].join(" "), rules).ok || PERSONAL.test(rest.slice(0, keep).join(" ")))) keep--;
  const text = [...sent, ...rest.slice(0, keep)].join(" ");
  const turns = [...r.session.turns];
  const last = turns.findLastIndex((t) => t.speaker === "maya" && t.text === planned);
  if (last !== -1) turns[last] = { ...turns[last], text, planned };
  void base;
  return { session: { ...r.session, turns }, effects: r.effects.map((e, i) => (i === at && e.kind === "say" ? { ...e, text, planned } : e)), refusal: null };
}

/**
 * The checks of a sentence streamed before the model's whole reply is in (D-341): code's own read of the turn, with no
 * plan yet. Numbers only from the question, the credited steps, the child and code's facts (nothing a plan may show);
 * no value code has not credited. Null when the turn may not stream: safety, a content hold, the closing minute, a
 * fixed reply or an outside request due, a stop, or a child turn that is not plain math talk (the review needs the
 * whole reply).
 */
export function streamRules(s: Session): (SayRules & { credits: boolean }) | null {
  const pkg = s.package;
  if (!pkg || !s.turn || s.safety.flagged || s.stopRequested || s.scopeDue || s.replies?.length) return null;
  if (!isTeaching(s.state) || hardFeeling(s.turn.text) || PERSONAL.test(s.turn.text)) return null;
  const credits = heardAnswers(s);
  const released = s.solved !== null || s.lastResult === "right" || credits.some((a) => a.step === "result" && a.verdict === "right");
  const done = [...s.done, ...credits.filter((a) => a.step !== "result" && a.verdict === "right").map((a) => a.step)];
  const view = { ...s, done };
  const credited = workSteps(pkg).filter((st) => done.includes(st.id) || (s.passed ?? []).includes(st.id)).flatMap((st) => [...stepAnswers(st).flatMap(sayValues), ...valuesOf(stepText(st, pkg.operation))]);
  const { forbidden, answer, hidden } = hiddenOf(view, released);
  const facts = turnFacts(s);
  const example = s.exampleIntroduced || s.exampleShown > 0
    ? [...valuesOf(operationText(pkg.easierExample.operation)), ...valuesOf(pkg.easierExample.text), ...pkg.easierExample.steps.slice(0, s.exampleShown).flatMap((st) => valuesOf(stepText(st, pkg.easierExample.operation)))] : [];
  return {
    allowed: [...printedValues(pkg), ...credited, ...example, ...s.turns.filter((t) => t.speaker === "child").flatMap((t) => valuesOf(t.text)), ...valuesOf(s.turn.text), ...facts.flatMap((f) => f.numbers), ...(released ? sayValues(pkg.answer.value) : [])],
    shown: [], shownEquations: [], forbidden, answer, hidden,
    wrong: released ? [] : facts.flatMap((f) => (f.wrong ? [f.wrong] : [])),
    wordLimit: s.shorter ? 25 : 35,
    noBoard: s.noBoard === true,
    accepting: released,
    noIntro: s.conversational === true && s.opened,
    credits: credits.some((a) => a.verdict === "right"),
  };
}

/**
 * Whether one sentence may be streamed now (D-341): its own checks pass, it is among the first SAY_SENTENCES and within
 * the word limit with the sentences before it, it holds no personal word (the review would read it), and it starts with
 * no yes unless code itself credited the child's answer in this turn.
 */
export function streamSentenceOk(sentence: string, rules: NonNullable<ReturnType<typeof streamRules>>, index: number, wordsBefore: number): boolean {
  if (index >= 3 || wordsBefore + sentence.split(/\s+/).filter(Boolean).length > rules.wordLimit) return false;
  if (PERSONAL.test(sentence) || (!rules.credits && /^(?:yes|yep|yeah|right|correct|exactly|that'?s (?:right|correct|it)|good job|well done|nice)\b/i.test(sentence.trim()))) return false;
  return checkSentence(sentence, rules, index).ok;
}

/** What code itself heard in the child's turn (D-341): the answers its own strict read credits, before any model call. */
export function codeVerdicts(s: Session): string[] {
  if (!s.package || !s.turn) return [];
  return heardAnswers(s).map((a) => `Code heard ${valueText(a.value)} as the child's clear answer for ${a.step === "result" ? "the whole question" : `the step "${a.step}"`}: it is ${a.verdict}.`);
}

/** What the model's brief says about the help now (D-341): the step, the level reached, and what each level may show. */
export function helpBrief(s: Session): { step: string; level: number; levels: { level: number; mayShow: string }[] } {
  const pkg = s.package;
  if (!pkg) return { step: s.ladder.step, level: s.ladder.hint, levels: [] };
  const done = [...s.done];
  const after = regroupAfter(s, [], done);
  const view: View = { steps: [s.ladder.step], done, checked: [], rightResult: false, regroup: pendingRegroup(after), regroupSaid: after.said, regroupTimes: after.times };
  const offers = offersFor(s, "guide", view).filter((o) => o.line.startsWith("step.") && (o.slots.step === undefined || o.slots.step === s.ladder.step));
  const levels = [...new Set(offers.map((o) => o.level ?? 0))].sort((a, b) => a - b)
    .map((level) => ({ level, mayShow: offers.filter((o) => (o.level ?? 0) === level).map((o) => o.texts[0]).filter(Boolean).slice(0, 3).join(" / ") }));
  return { step: s.ladder.step, level: s.ladder.hint, levels };
}

/** The numbers the model may say on this turn, and the ones it must keep secret, for the brief (D-341). */
export function numbersBrief(s: Session): { sayable: string[]; secret: string[] } {
  const pkg = s.package;
  if (!pkg) return { sayable: [], secret: [] };
  const released = s.solved !== null || s.lastResult === "right";
  const credited = workSteps(pkg).filter((st) => s.done.includes(st.id) || (s.passed ?? []).includes(st.id)).flatMap((st) => stepAnswers(st).flatMap(sayValues));
  const { forbidden, answer } = hiddenOf(s, released);
  const keys = (list: SayValue[]) => [...new Set(list.map((v) => v.key))];
  return {
    sayable: keys([...printedValues(pkg), ...credited, ...turnFacts(s).flatMap((f) => f.numbers), ...(released ? sayValues(pkg.answer.value) : [])]),
    secret: keys([...answer, ...forbidden]),
  };
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
function closeCause(before: Session, stuck = false): Reason {
  if (before.stopRequested) return "child_stopped";
  if (before.silence === "close_due") return "no_response";
  if (before.state === "TIME_CLOSE") return "time_limit";
  // A hearing that failed twice is a technical issue. A close Maya chose on purpose (close.stuck, or a question type's own
  // honest close as the way out) is never one, also while Maya waits on a confirm (round 4: F02-r1; re-review of #731, P1).
  if (before.state === "CONFIRM_HEARD" && !stuck) return "technical_issue";
  // Any other close is Maya's own (2026-11-12): the child did not ask to stop. A solved question is "solved" by the
  // outcome's priority (outcomeOf).
  return "maya_closed";
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

/**
 * Maya's words or board would give the final answer: a value code filled into a line, her own words, the opening, or
 * the board (the question's own expression left out, as in 66 + 0), or the answer row of the question's board in its
 * highest place. The lines that state the answer are offered only once it may be said; this is the net under them.
 */
function revealsAnswer(s: Session, p: Proposal, spoken: Spoken, forcedOpening: string | null = null, done: readonly string[] = s.done): boolean {
  const pkg = s.package!;
  // A claim's answer is a word (claim.ts); its result is a step, not the answer. Its check reads all of Maya's words
  // and every value the board shows.
  // A spot-the-error question's word to tick, and its fix before the child found it (spot-error.ts).
  const texts = [forcedOpening ? operationText(pkg.operation) : spoken.text, ...boardVisible(p.board ?? []).map(([, value]) => value)];
  if (sessionClaim(pkg)) return claimReveals(pkg, p.act, texts, claimSaid(claimTurn(s))) || spotReveals(pkg, p.act, texts, sessionClaim(pkg), done.includes("claim"),
    { word: claimSaid(claimTurn(s)), values: p.act === "confirm" && s.turn ? valuesIn(s.turn.text, readOptionsFor(pkg)) : [] });
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
const createsTarget = (p: Proposal, id: string) => p.act !== "example_step" && (p.board ?? []).some((c) => isObject(c) && (c.op === "columns" || c.op === "place_chart") && c.id === id);

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
    if ((c.op === "columns" || c.op === "write" || c.op === "model" || c.op === "place_chart") && typeof c.id === "string") {
      // A place-value chart shows this turn's problem's own number.
      if (c.op === "place_chart" && !(operation.kind === "place-value" && (isPartsOperation(operation) ? partsChartFits(c, operation) : c.number === String(operation.operands[0])))) return `The board shows ${name} now.`;
      if (c.op === "columns") {
        const operands = Array.isArray(c.operands) ? c.operands.map((o) => (isObject(o) ? Number(o.value) : NaN)) : [];
        const want = operandsOf(operation);
        const same = c.operation === BOARD_OPERATION[operation.kind] && operands.length === want.length && operands.every((n, i) => n === want[i]);
        // A part of an evaluate question in its own columns (evaluate.ts).
        const part = role === "target" && partBoards(s.package!).some((b) => b.id === c.id && b.operation === c.operation && operands.length === 2 && operands.every((n, i) => n === b.operands[i]));
        if (!same && !part) return `The board shows ${name} now: ${want.join(` ${SYMBOL[operation.kind]} `)}.`;
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

// D-310: the first-ship cheer backstop keeps only calm bank phrases.
const CHEER_AT_FIRST_SHIP = false;
/**
 * Fixed template wordings that celebrate ("Well done!", "Nice!", "Smart!"). While CHEER_AT_FIRST_SHIP is false (D-310)
 * they are never chosen: a template's other, calm wordings are. Correctness itself ("That's right: 27 + 39 = 66.") stays.
 * Final #698 re-check: answer.right, check.right_step.plain and check.method.* still celebrated.
 */
const CELEBRATORY_TEMPLATE = /\b(?:well done|nice|smart|great|awesome|amazing|hooray|yay|wonderful|fantastic|excellent|proud)\b|\byou did it\s*[:!]/i;
export const celebratoryTemplate = (text: string): boolean => CELEBRATORY_TEMPLATE.test(text);
/** The indices of a template's wordings that may be said at first ship: the calm ones, or all when cheer is on. */
export const firstShipWordings = (texts: readonly string[]): number[] =>
  texts.map((_, i) => i).filter((i) => CHEER_AT_FIRST_SHIP || !celebratoryTemplate(texts[i]));

// Match exclamations in non-calm bank positions, including filled echo and name slots.
const CHEER_EXCLAMATIONS = PHRASE_GROUPS.flatMap((group) => PHRASES[group].flatMap((text, index) => {
  if (CALM_PHRASES[group].includes(index + 1)) return [];
  return (text.match(/[^.!?]+!/g) ?? []).filter((sentence) => !/^\s*\{(?:echo|name)\}!$/.test(sentence)).map((sentence) => {
    const escaped = sentence.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\\\{(?:echo|name)\\\}/g, "[^.!?]+?");
    return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}`, "iu");
  });
}));
const cheerfulFreeTalk = (text: string) => /\b(?:yay|hooray|what a happy|how nice|how wonderful)\b/iu.test(text)
  || CHEER_EXCLAMATIONS.some((pattern) => pattern.test(text));

export function phraseOffers(session: Session, group: PhraseGroup): { pick: number; text: string }[] {
  const ready = new Set([1, 2, 3, 4, 8, 12]);
  const closingEffort = new Set([2, 7, 10, 13, 14]);
  const asked = askedNow(session);
  const hard = hardFeeling(childTurnText(session));
  const turn = ([...session.turns].reverse().find((t) => t.speaker === "child")?.text ?? "").replace(/’/g, "'");
  const positive = CHEER_AT_FIRST_SHIP && !hard && !/[,]/.test(turn)
    && /^[^.!?]*[.!?]?$/.test(turn.trim())
    && (turn.trim().match(/[\p{L}\p{N}]+(?:['’][\p{L}]+)*/gu) ?? []).length <= 6
    && /\b(?:happy|glad|excited|yay|awesome|hooray|won|proud)\b|\bi love\b|\bi feel great\b|\bgreat day\b/i.test(turn)
    && !/\b(?:not|no|never|nobody|nothing|no one|anymore|but|except|although|though|however|wish|miserable|devastated|downhearted|low|bad|gone|ridicule|neither|nor|none|cannot|without)\b|n['’]t\b/i.test(turn);
  return PHRASES[group].flatMap((text, i) => {
    if (!positive && !CALM_PHRASES[group].includes(i + 1)) return [];
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
  return Object.fromEntries(nextActs(session).acts.map((act) => [act, session.replies?.length ? [] : PHRASE_GROUPS.filter((g) => PHRASE_ACTS[g].includes(act) && (CALM_PHRASES[g].length > 0 || phraseOffers(session, g).length > 0))]));
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
  const offers = claimShortAck(s, rawOffersFor(s, act, view));
  const available = (s.noBoard ? offers.map(spokenOffer) : offers).filter((o) => o.texts.length > 0).filter((o) => {
    if (o.line !== "step.show" || !s.package) return true;
    // A step whose own value is the answer is never shown, except a missing factor's try: its show works one try, never
    // the answer (trial-factor.ts), and the text check below still holds.
    const shownStep = workSteps(s.package).find((step) => step.id === o.slots.step);
    if (shownStep && shownStep.kind !== "try-factor" && stepAnswers(shownStep).some((value) => equivalent(value, s.package!.answer.value))) return false;
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

/**
 * A claim's result acknowledged in its short wordings when its equation cannot fit beside the claim's shortest question
 * in one turn ("That's it: 282 × 6 = 1692." and "Is 282 × 6 greater than 1974? ..." is over 25 words): "Good, the result
 * is done." with the question, never a turn refused as too long and a fallback that asks for the step again (claim.ts,
 * #737 review P2, J06).
 */
function claimShortAck(s: Session, offers: LineOffer[]): LineOffer[] {
  const pkg = s.package;
  const st = pkg && sessionClaim(pkg) ? pkg.steps.find((x) => x.kind === "claim-compare") : undefined;
  if (!pkg || !st) return offers;
  const asks = offers.filter((o) => o.line === "step.invite" && o.slots.step === "result");
  if (asks.length === 0) return offers;
  const least = (o: LineOffer) => Math.min(...o.texts.map(speechWords));
  const room = turnWordLimit(s) - Math.min(...asks.map(least));
  return offers.map((o) => (o.line === "check.right_step" && o.slots.step === st.id && least(o) > room ? packageLines(pkg).rightStepShort(st.id)[0] ?? o : o));
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
  // A missing number's framing rides on the first step's hint until Maya has said it (missing-number.ts).
  const framing = frameState(pkg.steps, s.turns.filter((t) => t.speaker === "maya").map((t) => t.planned ?? t.text),
    [...s.turns.filter((t) => t.speaker === "child").map((t) => t.text), ...(s.turn ? [s.turn.text] : [])]);
  const right = l.stepIds.flatMap(l.rightStep);
  switch (act) {
    case "open":
      return [...l.hello(), ...l.question(), ...l.assess()];
    case "clarify":
      return [...l.question(), ...l.assess()];
    case "example_step": {
      const index = main === "ASSESS" ? 0 : s.exampleShown;
      const next = pkg.easierExample.steps[index];
      // A framed intro (an "other-topic" question's topic sentence, topic-frame.ts) is its own turn too.
      if (index === 0 && !s.exampleIntroduced && (turnWordLimit(s) === 25 || l.exampleIntro().some((o) => o.key === "example.framed"))) {
        return l.exampleIntro().map((o) => ({ ...o, slots: { step: next.id } }));
      }
      return [...(index === 0 && !s.exampleIntroduced ? l.exampleIntro() : []), ...(next ? l.exampleStep(next.id) : [])];
    }
    case "try_target": {
      // Checked wrong work after the easier example ("It's true." for a false claim) gets a line that answers it first:
      // the claim's own question again, or "not yet" for any other question. Without one every try_target is refused,
      // and a call with the model down had no safe line (reviews of #742 P1-a and #741 P1-2).
      const wrong = view.checked.some((c) => c.problem === "target" && c.answer.verdict === "wrong");
      const respond = !wrong ? [] : sessionClaim(pkg) ? l.help("result").filter((o) => o.line === "step.invite") : l.notYet("result");
      return [...respond, ...l.tryTarget(), ...l.question()];
    }
    case "guide": {
      // An "other-topic" question's topic sentence comes first, with the question, before any step line (topic-frame.ts),
      // but only on a help-only turn: a turn with work in it (a checked answer or any number) gets the normal guide
      // ("not yet", the right step), and the sentence stays owed for the next help-only turn (review of #731, P1).
      // A question ("Why do I divide by 2?", "Is it 4?") is not work: its numbers are the child asking, not answering. A
      // committed answer in it is checked, so it still counts (review of #731, P3).
      const opts = readOptionsFor(pkg);
      const turnText = s.turn?.text ?? "";
      const asking = asksWhy(turnText) || /\?\s*$/.test(turnText);
      const work = view.checked.some((c) => c.problem === "target") || (!asking && valuesIn(turnText, opts).length > 0);
      if (!work && frameOwed(pkg.text, pkg.operation, s.turns.flatMap((t) => (t.speaker === "maya" ? [t.planned ?? t.text] : [])))) return l.question().filter((o) => o.line === "question.problem");
      // An equal fraction when the question asks for the simplest form (#407): the equal-form check for each equal
      // fraction in the child's turn (it needs code to check that one), and the final step's help to simplify it.
      const candidates = view.equal ? [view.equal] : valuesIn(s.turn?.text ?? "", opts).filter((v) => isEqualForm(pkg, v));
      const simplify = view.steps.includes("result") ? view.equal ?? s.equalForm ?? null : null;
      const own = [...candidates.flatMap((v) => l.equal(v, simplestWords(pkg))), ...(simplify ? l.simplifyOwn(simplify) : [])];
      // A right final answer said with doubt or as a guess: a lead-in to check it together, before the step's line (#605).
      // Round 4 (#698, D-253 item 17): also after the step was shown at H3 (the answer is never given now, D-326, so the
      // check's step question below the show skips nothing), and only once per step in a call (doubtCheckDue).
      const due = doubtCheckDue(s, view.steps[0]);
      const check = due === "guess" ? l.guess() : due === "together" ? l.together() : [];
      // "How do you know?" after another person's claim result ("My mom said 1440.") asks about work the child did not do:
      // the step's invite asks for their own (claim.ts, #737 review P3).
      const thinking = sessionClaim(pkg) && claimResultUnconfirmable(s) ? [] : l.thinking();
      // Once the answer stands, a step the child explains wrongly is fixed with code's equation (check.fix, D-329).
      const fixes = solved ? l.stepIds.flatMap(l.fix) : [];
      return [...check, ...view.steps.flatMap((id) => regroupHelp(l, id, view, framing, turnWordLimit(s) === 25)), ...own, ...right, ...fixes, ...[...l.stepIds, "result"].flatMap(l.notYet), ...l.question(), ...thinking];
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
      // A wrong step after the answer stands is fixed (check.fix, D-329).
      const fixes = main === "CHECK" ? l.stepIds.flatMap(l.fix) : [];
      return [...guessed, ...fixes, ...write, ...(solved ? l.answerRight(form) : []), ...(main === "CHECK" ? [...(allShown && !guessed.length ? [] : l.thinking()), ...l.explain().filter((o) => !shown(o))] : [])];
    }
    case "close":
      // An unsolved close after the easier example may say the honest close (#735): it holds no answer.
      // While first-ship cheer is off (D-310), a solved close uses the calm close.checked wordings, never close.solved's
      // "Well done!" / "Nice work…" (final #698 review).
      // An honest close by how much help the child had (C09 item iii): after the given answer, no claim that the child
      // finished it; after a shown step (guided), that their answer is right, not that they worked it out.
      // A question type with its own honest close (honestCloseLines) offers it in place of close.stuck.
      return solved ? (solved === "maya" || s.assistance.includes("answer_given") ? l.closeGiven()
        : s.assistance.includes("guided") ? l.closeSolved("child", false) : l.closeSolved(solved, CHEER_AT_FIRST_SHIP && (view.done.length > 0 || s.understanding === "evidence_observed")))
        : honestCloseLines(s).length > 0 ? honestCloseLines(s)
        : gate(s, {}) ? ((s.state === "TIME_CLOSE" || (s.turn !== null && s.exampleShown >= pkg.easierExample.steps.length)) ? l.closeStuck() : []) : [...l.closeStuck(), ...(closeExpressionContainsAnswer(pkg.operation, pkg.answer.value) ? [] : l.closeGiven())];
    case "confirm": {
      // A claim's word said unsure or with both words: which word the child circles; a bare word: said back (claim.ts).
      const word = claimConfirm(claimTurn(s));
      if (word) return word.kind === "which" ? l.which() : l.said(word.word);
      // With no safe number to say back, ask for the answer alone. No reread or inferred number.
      const heard = l.heard(...heardIn(s));
      return heard.length > 0 ? heard : l.answerOnly();
    }
    case "offer_other_input":
      return l.otherInput();
    case "redirect":
      return [...l.decline(), ...l.redirect(), ...l.question()];
    case "repair":
      return [...l.repair(), ...l.question(), ...view.steps.flatMap((id) => regroupHelp(l, id, view, framing, turnWordLimit(s) === 25)).filter((o) => (o.level ?? 0) <= Math.max(0, s.ladder.hint))];
    default:
      return [];
  }
}

/**
 * The help lines of a step. While its regroup is due (view.regroup), the regroup line comes first: no other help but
 * the gentlest invite, so no line names a carried digit before the child hears where it comes from. The regroup line
 * of the column a carry comes from is offered only then (it says that column's sum).
 */
function regroupHelp(l: ReturnType<typeof packageLines>, id: string, view: View, framing: FrameState = "due", compact = false): LineOffer[] {
  const pending = (view.regroup ?? []).filter((c) => c.at === id);
  const own = l.help(id, framing, compact);
  // Once said, the line comes again only when the child denies the carry, which makes it pending (regroupAfter).
  const said = (view.regroupSaid ?? []).some((c) => c.in === id) || (view.regroupTimes?.[id] ?? 0) >= 1;
  // The second way (step.why, #605) comes only after the regroup line, for "why?" or when the first did not land.
  if (pending.length === 0) {
    // A place-value step.why (WHY_KEYS) and a missing number's (missing-number.ts: about its first step) are no regroup lines.
    return own.filter((o) => (o.line === "step.why" ? said || WHY_KEYS.includes(o.key) || o.key === "pattern.why" || o.key === "frame.why" || o.key === "trial.why"
      : o.line !== "step.regroup" || !((view.regroupSaid ?? []).some((c) => c.in === id) || (view.regroupTimes?.[id] ?? 0) >= MAX_REGROUP_SAYS)));
  }
  // Explain an incoming carry before any outgoing explanation that uses it.
  const regroup = pending.some((c) => c.in === id) ? own.filter((o) => o.line === "step.regroup") : l.regroupOut(id);
  return [...own.filter((o) => (o.level ?? 0) === 0), ...regroup];
}

/**
 * A line that judges the child's answer: code checked that answer, right (the step is done, and not only as a column of
 * a part the child gave the result of, evaluate.ts) or wrong.
 */
const meets = (requires: NonNullable<LineOffer["requires"]>, view: View, pkg: OperationPackage | null) =>
  requires.answer === "right"
    ? view.done.includes(requires.step) && !(pkg && partCovered(pkg, view.done, requires.step))
    : requires.answer === "equal"
      ? !!view.equal && (requires.heard === undefined || valueText(view.equal) === requires.heard)
      : view.checked.some((c) => c.problem === "target" && c.answer.step === requires.step && c.answer.verdict === "wrong"
        && (requires.heard === undefined || valueText(c.answer.value) === requires.heard));

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
    if (!only && phraseOffers(s, group).length === 0) return phrase("smalltalk", null, undefined, NEUTRAL_SMALLTALK);
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
  /** The fewest spoken words the line parts after `k` can take: room this part's wording must leave for them. */
  const laterWords = (k: number) => p.parts.slice(k + 1).reduce((n, q) => {
    const later = "line" in q ? findOffer(offers, { line: q.line, slots: normalSlots(q.slots ?? {}) }) : null;
    return n + (later && later.texts.length > 0 ? Math.min(...later.texts.map(speechWords)) : 0);
  }, 0);
  const fitClaim = sessionClaim(s.package) !== null;
  for (const [k, part] of p.parts.entries()) {
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
        : s.freeTalk ? freeTalkProblem(part.talk, s.variety.name, childWords(s)) ?? (!CHEER_AT_FIRST_SHIP && cheerfulFreeTalk(part.talk) ? "cheerful exclamation" : null) : "free talk is off";
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
    if (o.requires && !meets(o.requires, view, s.package)) {
      return { code: "line_not_offered", reason: `"${o.line}" needs an answer code checked ${o.requires.answer} for "${o.requires.step}".` };
    }
    if (p.act === "guide" && o.level !== undefined && o.level > (p.level ?? 0)) {
      return { code: "hint_too_high", reason: `"${o.line}" is H${o.level} help, above this guide's level H${p.level ?? 0}.` };
    }
    // While first-ship cheer is off, only a template's calm wordings may be said (D-310).
    const usable = firstShipWordings(o.texts);
    if (usable.length === 0) return { code: "line_not_offered", reason: `"${o.line}" has no calm wording while cheer is off.` };
    // In a claim question, only wordings that leave the lines still to come room in the turn's word limit, when some do
    // and some do not (#737 review P2: a claim's acknowledgement and question at 25 words); else every usable wording.
    const room = fitClaim ? turnWordLimit(s) - speechWords(texts.join(" ")) - laterWords(k) : Infinity;
    const fit = fitClaim ? usable.filter((i) => speechWords(o.texts[i]) <= room) : usable;
    const pool = fit.length > 0 && fit.length < usable.length ? fit : usable;
    const text = o.texts[pool[pickFresh(pool.map((i) => o.texts[i]), (j) => o.wordingIds?.[pool[j]] ?? `${o.key}#${pool[j]}`)]];
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
  const { operation, steps } = problemOf(pkg, problem);
  const layout = BOARD_OPERATION[operation.kind];
  // A missing factor found by trying numbers has no long division to lay out (trial-factor.ts).
  if (!layout || steps.some((st) => st.kind === "try-factor")) return null;
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
  // Pattern table rows are code-written. Unknown terms and a missing step stay hidden before acceptance.
  const role = act === "example_step" ? "example" : "target";
  const problem = role === "example" ? pkg.easierExample : pkg;
  const answered = role === "example" ? s.exampleShown >= problem.steps.length - 1 : s.solved !== null || view.rightResult;
  const pattern = patternOf(problem);
  const tableId = `${role}-pattern-${answered ? "done" : "start"}`;
  if (pattern && !Object.hasOwn(s.boardRoles, `${tableId}-terms`)) out.push({
    id: `${role === "target" ? "question" : "example"}.pattern`, shows: "the pattern terms and equal steps",
    commands: place => patternRows(problem, answered).map((text, i) => ({ op: "write", id: `${tableId}-${i === 0 ? "terms" : "step"}`, text,
      place: i === 0 ? place : { below: `${tableId}-terms` } })),
  });
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
  }
  if (isPlaceValue(pkg)) out.push(...placeBoardOffers({ pkg, act, roles: s.boardRoles, batch: s.batches, chosen: spoken?.chosen ?? [], exampleShown: s.exampleShown }));
  else if (act !== "example_step") {
    strips("question-strips", fractionsOf(pkg.operation), `the question's fractions as strips: ${operationText(pkg.operation)}`);
    const common = workSteps(pkg).find((st) => st.kind === "common-denominator");
    const shownNow = (spoken?.chosen ?? []).some((o) => o.line === "step.show" && o.slots.step === common?.id);
    if (common?.kind === "common-denominator" && (view.done.includes(common.id) || shownNow)) {
      strips("question-common", common.to, `the fractions with the common denominator as strips: ${common.to.map((f) => `${f.numerator}/${f.denominator}`).join(" and ")}`);
    }
    const q = columnsOf(s, "target");
    if (q && !Object.hasOwn(s.boardRoles, "question")) out.push({ id: "question.columns", shows: `the question in columns: ${operationText(pkg.operation)}`, commands: (place) => at(q, place) });
    // The columns of the part of an evaluate question the child is on (evaluate.ts): not done before this turn, every
    // part before it done, and not drawn yet. Never a later part, whose numbers come from the parts before it.
    for (const b of partBoards(pkg)) {
      if (s.done.includes(b.partId) || Object.hasOwn(s.boardRoles, b.id) || !b.after.every((id) => view.done.includes(id))) continue;
      out.push({ id: `part.columns.${b.partId}`, shows: `${b.expr} in columns`,
        commands: (place) => [{ op: "columns", id: b.id, operation: b.operation, operands: [{ id: "top", value: String(b.operands[0]) }, { id: "bottom", value: String(b.operands[1]) }], place } as unknown as Command] });
    }
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
    const places = boardPlaces(s, out.flatMap((command) => "id" in command && ["columns", "write", "model", "place_chart"].includes(command.op) ? [command.id] : []), p.act === "example_step");
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
const BOARD_NUMBERS: ReadonlySet<string> = new Set(["value", "dividend", "divisor", "numerator", "denominator", "whole", "min", "max", "tick", "fromValue", "toValue", "number"]);

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
    ...[...operandsOf(operation), ...(role === "target" ? partBoards(pkg).flatMap((b) => b.operands) : [])].flatMap((n) => [number(n), ...[...String(n)].filter((c) => /\d/.test(c)).map((c) => number(Number(c)))]),
    ...finished.flatMap((st) => [...stepAnswers(st), ...("carryOut" in st ? [number(st.carryOut)] : [])]),
  ];
  const fromCode = new Set([...spoken.boards, ...spoken.lines, ...patternRows(role === "target" ? pkg : pkg.easierExample, role === "example" ? s.exampleShown >= pkg.easierExample.steps.length - 1 : s.solved !== null || spoken.chosen.some(o => o.line === "answer.right"))].map((t) => t.trim()));
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
    // A place-value compare's circled word (B1b), in the turn Maya's answer line says it back.
    if (pkg.answer.value.type === "choice" && isPlaceValue(pkg) && t === pkg.answer.value.value && spoken.chosen.some((o) => o.line === "answer.right")) continue;
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
