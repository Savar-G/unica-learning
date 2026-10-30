// Maya's teaching controller (#321, spec #297): the state machine of one call about one checked question. The model
// writes Maya's words and proposes her next act; this module decides whether that act is allowed now and refuses it
// with a reason when it is not. Code, not the model, owns the math check of every child answer and every number Maya
// claims, the call clock, the hint ladder, the safety flag and the outcome. Child speech and workbook text are data:
// nothing a child says changes the answer key, the states or the safety rules.
//
// One call: READY -> OPEN -> ASSESS -> (MODEL_EXAMPLE -> TRY_TARGET | TRY_TARGET | GUIDE_TARGET) -> CHECK ->
// WRITE_CLOSE -> CLOSE, or CONTENT_HOLD when the question package does not check. The interrupts SAFETY,
// CONFIRM_HEARD, WAIT_WRITE, REDIRECT, REPAIR_MAYA and TIME_CLOSE take over in that priority: safety first, then a stop
// and the deadline, then confirmation of what was heard, then teaching. Teaching research:
// `.design/research/ta-pedagogy-2026-10/maya-teaching.md`, section 5.
//
// Everything in and out is plain serializable data (the text adapter #322 and the board protocol #328 drive it): a
// Session value, events with the time they happened (the clock is passed in), effects to carry out, and a refusal.
// Pure TypeScript: no React, DOM, network, clock or randomness.
import { MAX_COMMANDS, type Batch, type Command, type Target } from "@/lib/board";
import {
  checkQuestionPackage,
  equivalent,
  sameValue,
  type AnswerValue,
  type Operation,
  type QuestionPackage,
  type WorkedStep,
} from "@/lib/question-package";
import { committedText, offersChoice, valuesIn } from "./numbers";

/** Closing starts 9 minutes into the call; the call ends at 10 minutes. */
export const TIME_LIMITS = { closingAtMs: 9 * 60_000, endAtMs: 10 * 60_000 } as const;

/**
 * The pause policy (proposals in the research, to test with children): a gentle check after this much silence while
 * the child thinks or writes, then a close for no response after the same wait again. Silence never raises the hint.
 */
export const PAUSES = { thinkCheckMs: 15_000, writeCheckMs: 30_000, noResponseMs: 30_000 } as const;

/** What code says itself when a safety response is still due at the end of the call (from the research, section 4). */
export const SAFETY_GUIDANCE = {
  concern: "Thank you for telling me. You do not have to explain more. Please tell a grown-up you trust who can help keep you safe.",
  immediate: "Your safety comes first. Go to a safe grown-up now. If you are in danger, call 911.",
} as const;

export const MAIN_STATES = ["READY", "OPEN", "ASSESS", "MODEL_EXAMPLE", "TRY_TARGET", "GUIDE_TARGET", "CHECK", "WRITE_CLOSE", "CLOSE", "CONTENT_HOLD"] as const;
export const INTERRUPTS = ["SAFETY", "CONFIRM_HEARD", "WAIT_WRITE", "REDIRECT", "REPAIR_MAYA", "TIME_CLOSE"] as const;
export type MainState = (typeof MAIN_STATES)[number];
export type Interrupt = (typeof INTERRUPTS)[number];
export type SessionState = MainState | Interrupt;
/** The teaching states an interrupt returns to. */
const TEACHING = ["OPEN", "ASSESS", "MODEL_EXAMPLE", "TRY_TARGET", "GUIDE_TARGET", "CHECK", "WRITE_CLOSE"] as const;
type Teaching = (typeof TEACHING)[number];
const isTeaching = (s: SessionState): s is Teaching => (TEACHING as readonly SessionState[]).includes(s);

/** Maya's acts: one per turn. The model names one; the session allows it or refuses it. */
export const ACTS = [
  "open", "clarify", "example_step", "try_target", "guide", "accept_answer", "give_answer", "ask_write", "close",
  "safety", "confirm", "offer_other_input", "wait", "check_in", "redirect", "repair",
] as const;
export type Act = (typeof ACTS)[number];
/** Acts that may carry board commands. */
const BOARD_ACTS: readonly Act[] = ["clarify", "example_step", "try_target", "guide", "accept_answer", "give_answer", "ask_write", "repair"];

/** H0 invite, H1 point, H2 give the operation, H3 demonstrate the step, H4 give the result with a short reason. */
export type HintLevel = 0 | 1 | 2 | 3 | 4;
export type Severity = "concern" | "immediate";
export type Reason = "solved" | "child_stopped" | "time_limit" | "no_response" | "technical_issue" | "content_issue" | "safety";
/** Least help first: the outcome keeps the most help used, never less. */
export const ASSISTANCE = ["independent", "hint", "worked_example", "guided", "answer_given"] as const;
export type Assistance = (typeof ASSISTANCE)[number];
export type PaperStatus = "child_confirmed" | "declined" | "unknown";
export type Understanding = "evidence_observed" | "uncertain";
/** The child's question, or the easier example Maya works first. */
export type Problem = "target" | "example";

/** A number Maya claims: an equation ("7 + 9 = 16") or a problem's answer. Code computes both. */
export type MathClaim =
  | { kind: "equation"; operation: Operation; result: number }
  | { kind: "answer"; problem: Problem; value: AnswerValue };

/**
 * An answer the model read in the child's turn: the value, the step it answers ("ones", "tens", ... or "result"), and
 * the model's verdict. Code checks that the child said it and that the verdict is right.
 */
export interface ChildAnswer {
  value: AnswerValue;
  step: string;
  problem?: Problem;
  verdict: "right" | "wrong";
}

/** What the model understood from the child's latest turn. */
export interface Reading {
  /** A possible harm or danger disclosure. Raises the safety flag even when the proposal is refused. */
  safety?: Severity;
  /** The child asks to stop. */
  stop?: boolean;
  /** The words or a number are unclear: confirm before judging. */
  unclear?: boolean;
  /** The child is writing or asks for more time. */
  writing?: boolean;
  /** A harmless off-topic request, or a request for another question. */
  offTopic?: boolean;
  /** An explicit request for more help, or for Maya to show the step. */
  help?: "more" | "show";
  /** At the opening: the child has work to show, or has not started. */
  start?: "has_work" | "no_start";
  answers?: ChildAnswer[];
  /** The child says they wrote the answer on paper, or will not. Maya never sees the paper. */
  paper?: "written" | "declined";
  /** The child says Maya heard them wrong ("no, I said fifteen"). */
  correctsHearing?: boolean;
}

/** A model proposal: Maya's next act, her words, and what she draws. Untrusted: every field is checked. */
export interface Proposal {
  act: Act;
  say: string;
  reading?: Reading;
  /** For guide and example_step: the step this turn is about. */
  step?: string;
  /** For guide: the hint level. */
  level?: HintLevel;
  /** For ask_write from CHECK: what the check showed. */
  understanding?: Understanding;
  /** Every number claim in `say`, for code to check. */
  claims?: MathClaim[];
  /** Board commands (the board core's vocabulary); the board core checks each one when it applies the batch. */
  board?: unknown[];
}

export type SessionEvent =
  | { type: "start"; at: number }
  /** A child turn as text. `final: false` is a partial transcript: Maya stops talking and nothing is judged. */
  | { type: "child_turn"; at: number; text: string; final?: boolean; uncertain?: boolean; alternatives?: string[] }
  | { type: "proposal"; at: number; proposal: unknown }
  | { type: "tick"; at: number }
  /** The child starts or stops writing on the board. */
  | { type: "writing"; at: number; status: "started" | "done" }
  /** A safety signal from outside the model (a classifier or a person). */
  | { type: "safety"; at: number; severity: Severity }
  /** A number claim found in what Maya actually said (after output): a wrong one starts REPAIR_MAYA. */
  | { type: "maya_claim"; at: number; claim: MathClaim }
  /** The question's math turned out not to be trustworthy during the call. */
  | { type: "content_problem"; at: number; detail: string }
  /** The connection or a service failed: the call ends. */
  | { type: "technical"; at: number; detail: string };

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
  /** Seconds from the start to the end. */
  seconds: number;
}

export type Effect =
  | { kind: "say"; act: Act; text: string }
  | { kind: "board"; batch: Batch }
  /** Stop speaking and drop board batches not yet shown. */
  | { kind: "cancel_output" }
  /** Create the durable safety flag and alert (once per call, or again when the severity rises). */
  | { kind: "safety_flag"; severity: Severity; at: number }
  /** The call ends: audio stops. `safetyHelp`: keep the safety help message on screen after the call. */
  | { kind: "end"; at: number; outcome: Outcome; safetyHelp: boolean };

export type RefusalCode =
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
  | "reveals_answer"
  | "missing_answer"
  | "missing_disclosure"
  | "missing_emergency"
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

interface ChildTurn {
  at: number;
  text: string;
  uncertain: boolean;
}

/** The hint ladder of the current target step. `hint` is -1 before any hint on this step. */
interface Ladder {
  step: string;
  hint: number;
  unlocked: number;
  /** Unsuccessful child responses since the hint last went up. */
  failures: number;
}

/** One call. Plain data: store it, send it, compare it. Read it through this module. */
export interface Session {
  version: 1;
  callId: string;
  state: SessionState;
  /** The teaching state an interrupt returns to. */
  resume: Teaching | null;
  package: QuestionPackage | null;
  contentProblem: string | null;
  startedAt: number | null;
  now: number | null;
  expect: Expect;
  /** When Maya started waiting for the child, for the pause policy. */
  waitingSince: number | null;
  silence: "none" | "check_due" | "checked" | "close_due";
  /** The child's words Maya has not answered yet. */
  turn: ChildTurn | null;
  opened: boolean;
  clarified: boolean;
  /** Easier-example steps shown, in order. */
  exampleShown: number;
  /** Target steps the child has done. */
  done: string[];
  ladder: Ladder;
  highestHint: HintLevel | null;
  /** Every kind of help given, in order. Nothing removes an entry. */
  assistance: Assistance[];
  /**
   * Who first gave the checked final answer: the question is solved either way (the outcome's assistance says how).
   * `childRight` says whether the child also said it.
   */
  solved: "child" | "maya" | null;
  childRight: boolean;
  /** The answer was given by Maya before the child said it: understanding is never evidence then. */
  answerGivenFirst: boolean;
  understanding: Understanding;
  paper: PaperStatus;
  writeAsked: boolean;
  confirmTries: number;
  offeredOtherInput: boolean;
  redirects: number;
  safety: { flagged: boolean; severity: Severity | null; at: number | null; guided: boolean };
  mishearing: { confirmations: number; corrections: number };
  /** The child's wrong final answers, for the mistake type. */
  wrongResults: AnswerValue[];
  /** The first target step where the child needed help or failed. */
  stuckStep: string | null;
  batches: number;
  turns: TranscriptTurn[];
  outcome: Outcome | null;
}

export function createSession(input: { callId: string; package: unknown }): Session {
  const check = checkQuestionPackage(input.package);
  const pkg = check.ok ? structuredClone(check.package) : null;
  return {
    version: 1,
    callId: input.callId,
    state: "READY",
    resume: null,
    package: pkg,
    contentProblem: check.ok ? null : check.reason,
    startedAt: null,
    now: null,
    expect: "nothing",
    waitingSince: null,
    silence: "none",
    turn: null,
    opened: false,
    clarified: false,
    exampleShown: 0,
    done: [],
    ladder: { step: pkg ? columnSteps(pkg.steps)[0]?.id ?? "result" : "result", hint: -1, unlocked: 0, failures: 0 },
    highestHint: null,
    assistance: [],
    solved: null,
    childRight: false,
    answerGivenFirst: false,
    understanding: "uncertain",
    paper: "unknown",
    writeAsked: false,
    confirmTries: 0,
    offeredOtherInput: false,
    redirects: 0,
    safety: { flagged: false, severity: null, at: null, guided: false },
    mishearing: { confirmations: 0, corrections: 0 },
    wrongResults: [],
    stuckStep: null,
    batches: 0,
    turns: [],
    outcome: null,
  };
}

// ---------- Reading the session ----------

/** Whose turn it is, and the acts Maya may propose now (before any reading of the child's turn). */
export function nextActs(session: Session): { expect: Expect; acts: Act[] } {
  if (session.expect !== "maya") return { expect: session.expect, acts: [] };
  return { expect: "maya", acts: allowedActs(session, {}).acts };
}

export interface LearningEvent {
  questionId: string;
  result: "right" | "right_with_help" | "wrong" | "unfinished";
  /** The first step where the child needed help or went wrong, or null. */
  stuckStep: string | null;
  /** The cause of a known wrong answer the child gave ("O3"), or null. */
  mistake: string | null;
  highestHint: HintLevel | null;
  seconds: number;
}

/** The learning event of an ended call, for the learning record; null before the end or without a checked question. */
export function learningEvent(session: Session): LearningEvent | null {
  if (!session.outcome || !session.package) return null;
  const { assistance, highestHint, seconds } = session.outcome;
  const known = session.package.wrongAnswers.find((w) => session.wrongResults.some((v) => equivalent(v, w.value)));
  return {
    questionId: session.package.id,
    result: session.childRight
      ? (assistance === "independent" ? "right" : "right_with_help")
      : session.wrongResults.length > 0 ? "wrong" : "unfinished",
    stuckStep: session.stuckStep,
    mistake: known?.cause ?? null,
    highestHint,
    seconds,
  };
}

// ---------- Steps and math ----------

const columnSteps = (steps: WorkedStep[]) => steps.filter((s) => s.kind !== "result");
const rank = (a: Assistance) => ASSISTANCE.indexOf(a);

/** The values that answer a step: a column's total or the digit written, a result's answer and its accepted forms. */
function stepAnswers(step: WorkedStep, pkgAnswer?: { value: AnswerValue; accepted: AnswerValue[] }): AnswerValue[] {
  switch (step.kind) {
    case "add-column":
      return [{ type: "number", value: step.total }, { type: "number", value: step.write }];
    case "subtract-column": {
      const from = step.top - (step.lent ? 1 : 0) + (step.regrouped ? 10 : 0);
      return [{ type: "number", value: from - (step.bottom ?? 0) }];
    }
    case "result":
      return pkgAnswer ? [pkgAnswer.value, ...pkgAnswer.accepted] : [step.value];
  }
}

const problemOf = (pkg: QuestionPackage, problem: Problem) =>
  problem === "target"
    ? { operation: pkg.operation, steps: pkg.steps, answer: pkg.answer }
    : { operation: pkg.easierExample.operation, steps: pkg.easierExample.steps, answer: { value: pkg.easierExample.answer, accepted: [] } };

/** The first target step the child has not done ("result" when every column is done). */
function currentStep(pkg: QuestionPackage, done: readonly string[]): string {
  return columnSteps(pkg.steps).find((s) => !done.includes(s.id))?.id ?? "result";
}

function claimProblem(claim: unknown): string | null {
  if (!isObject(claim)) return "a claim is not an object";
  if (claim.kind === "equation") {
    const op = claim.operation;
    if (!isObject(op) || (op.kind !== "add" && op.kind !== "subtract") || !Array.isArray(op.operands) || op.operands.length !== 2 ||
      !op.operands.every((n) => Number.isFinite(n)) || !Number.isFinite(claim.result)) return "an equation claim needs an add or subtract operation on two numbers and a result";
    const [a, b] = op.operands as [number, number];
    return (op.kind === "add" ? a + b : a - b) === claim.result ? null : `${a} ${op.kind === "add" ? "+" : "-"} ${b} is not ${String(claim.result)}`;
  }
  if (claim.kind === "answer") return isAnswerValue(claim.value) && (claim.problem === "target" || claim.problem === "example") ? null : "an answer claim needs a problem and a value";
  return "a claim is an equation or an answer";
}

// ---------- Validation of untrusted input ----------

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isAnswerValue = (v: unknown): v is AnswerValue =>
  isObject(v) && ((v.type === "number" && Number.isFinite(v.value)) ||
    (v.type === "fraction" && Number.isInteger(v.numerator) && Number.isInteger(v.denominator) && (v.denominator as number) > 0));
const HINTS = [0, 1, 2, 3, 4];
const SEVERITIES: Severity[] = ["concern", "immediate"];

function proposalProblem(p: unknown): string | null {
  if (!isObject(p)) return "a proposal is an object";
  if (typeof p.act !== "string" || !(ACTS as readonly string[]).includes(p.act)) return `the act is one of ${ACTS.join(", ")}`;
  if (typeof p.say !== "string") return "a proposal needs Maya's words in `say`";
  if (p.step !== undefined && typeof p.step !== "string") return "the step is a step id";
  if (p.level !== undefined && !HINTS.includes(p.level as number)) return "the level is 0 to 4";
  if (p.understanding !== undefined && p.understanding !== "evidence_observed" && p.understanding !== "uncertain") return "understanding is evidence_observed or uncertain";
  if (p.claims !== undefined && !Array.isArray(p.claims)) return "claims are a list";
  if (p.board !== undefined && (!Array.isArray(p.board) || p.board.length === 0 || p.board.length > MAX_COMMANDS || !p.board.every((c) => isObject(c) && typeof c.op === "string"))) {
    return `the board is a list of 1 to ${MAX_COMMANDS} commands, each with an op`;
  }
  const r = p.reading;
  if (r === undefined) return null;
  if (!isObject(r)) return "the reading is an object";
  if (r.safety !== undefined && !SEVERITIES.includes(r.safety as Severity)) return "the reading's safety is concern or immediate";
  for (const flag of ["stop", "unclear", "writing", "offTopic", "correctsHearing"] as const) {
    if (r[flag] !== undefined && typeof r[flag] !== "boolean") return `the reading's ${flag} is true or false`;
  }
  if (r.help !== undefined && r.help !== "more" && r.help !== "show") return "the reading's help is more or show";
  if (r.start !== undefined && r.start !== "has_work" && r.start !== "no_start") return "the reading's start is has_work or no_start";
  if (r.paper !== undefined && r.paper !== "written" && r.paper !== "declined") return "the reading's paper is written or declined";
  if (r.answers !== undefined) {
    if (!Array.isArray(r.answers)) return "the reading's answers are a list";
    for (const a of r.answers) {
      if (!isObject(a) || !isAnswerValue(a.value) || typeof a.step !== "string" || (a.verdict !== "right" && a.verdict !== "wrong") ||
        (a.problem !== undefined && a.problem !== "target" && a.problem !== "example")) {
        return "each answer needs a number or fraction value, a step and a verdict";
      }
    }
  }
  return null;
}

// ---------- Allowed acts and priority ----------

interface Allowed {
  acts: Act[];
  code: RefusalCode;
  reason: string;
}

const MAIN_ACTS: Record<Teaching, Act[]> = {
  OPEN: ["open"],
  ASSESS: ["accept_answer", "clarify", "example_step", "try_target", "guide"],
  MODEL_EXAMPLE: ["accept_answer", "example_step", "try_target"],
  TRY_TARGET: ["accept_answer", "guide"],
  GUIDE_TARGET: ["accept_answer", "guide", "give_answer"],
  CHECK: ["ask_write", "guide"],
  WRITE_CLOSE: ["ask_write", "close"],
};

/** The child's latest turn holds the right final answer to the question. */
const saysRightResult = (s: Session, reading: Reading) =>
  s.package !== null && (reading.answers ?? []).some((a) => (a.problem ?? "target") === "target" && a.step === "result" &&
    stepAnswers(s.package!.steps.at(-1)!, s.package!.answer).some((v) => equivalent(v, a.value)));

/** The acts Maya may propose now, in priority order: safety, a stop and the deadline, confirmation, then teaching. */
function allowedActs(s: Session, reading: Reading): Allowed {
  if (s.outcome) return { acts: [], code: "ended", reason: "The call has ended." };
  if (reading.safety || (s.safety.flagged && !s.safety.guided)) {
    return { acts: ["safety"], code: "safety_first", reason: "Safety comes first: give the safety guidance before anything else." };
  }
  if (s.state === "SAFETY") return { acts: ["safety", "close"], code: "safety_first", reason: "No math after a safety concern: give guidance or close." };
  if (s.state === "CONTENT_HOLD") return { acts: ["close"], code: "content_hold", reason: `Maya cannot check this question (${s.contentProblem}): close without teaching.` };
  if (s.expect !== "maya") return { acts: [], code: "not_mayas_turn", reason: "It is the child's turn: wait for them." };
  if (reading.stop) return { acts: ["close"], code: "stop_first", reason: "The child asked to stop: close kindly, with no more questions." };
  if (s.state === "REPAIR_MAYA") return { acts: ["repair"], code: "repair_first", reason: "Maya said something the checked math does not support: correct it first." };
  if (s.silence === "close_due") return { acts: ["close"], code: "act_not_allowed", reason: "No answer after the check-in: close." };
  if (s.silence === "check_due" && !s.turn) return { acts: ["check_in"], code: "act_not_allowed", reason: "The child has been quiet: one short check-in, with no new help." };
  if (s.turn?.uncertain || reading.unclear) {
    if (s.confirmTries < 2) return { acts: ["confirm"], code: "confirm_first", reason: "What the child said is unclear: confirm it before judging any math." };
    return {
      acts: s.offeredOtherInput ? ["close"] : ["offer_other_input", "close"],
      code: "confirm_first",
      reason: "Two confirmations did not work: offer another way to answer, or close.",
    };
  }
  if (s.state === "TIME_CLOSE") {
    const acts: Act[] = s.solved !== null ? (s.writeAsked ? ["close"] : ["ask_write", "close"])
      : saysRightResult(s, reading) ? ["accept_answer", "close"] : ["give_answer", "ask_write", "close"];
    return { acts, code: "act_not_allowed", reason: "Time is almost up: finish the question and close." };
  }
  if (reading.writing) return { acts: ["wait"], code: "act_not_allowed", reason: "The child is writing: wait." };
  if (reading.offTopic) {
    return { acts: s.redirects > 0 ? ["redirect", "close"] : ["redirect"], code: "act_not_allowed", reason: "Off topic: bring the child back to this question." };
  }
  const main = isTeaching(s.state) ? s.state : s.resume;
  if (!main) return { acts: [], code: "act_not_allowed", reason: "No act fits now." };
  let acts = MAIN_ACTS[main].filter((act) => {
    if (act === "open") return !s.opened;
    if (act === "clarify") return !s.clarified;
    if (act === "example_step") return main === "ASSESS" || s.exampleShown < s.package!.easierExample.steps.length;
    if (act === "try_target") return main !== "MODEL_EXAMPLE" || s.exampleShown === s.package!.easierExample.steps.length;
    if (act === "ask_write") return main === "CHECK" || !s.writeAsked;
    if (act === "close") return s.writeAsked && s.turn !== null;
    return true;
  });
  if (saysRightResult(s, reading) && s.solved === null && acts.includes("accept_answer")) acts = ["accept_answer"];
  return { acts, code: "act_not_allowed", reason: `In ${s.state} Maya may: ${acts.join(", ") || "nothing yet"}.` };
}

// ---------- The step function ----------

/** Applies one event. A refused proposal leaves the session as it was, except that a safety reading still flags. */
export function step(session: Session, event: SessionEvent): StepResult {
  if (!isObject(event) || typeof event.at !== "number" || !Number.isFinite(event.at)) {
    return refuse(session, "invalid_event", "An event needs a type and the time it happened.");
  }
  if (session.now !== null && event.at < session.now) return refuse(session, "invalid_event", "The clock went back.");
  if (session.outcome) return refuse(session, "ended", "The call has ended.");
  if (event.type !== "start" && session.startedAt === null) return refuse(session, "invalid_event", "The call has not started.");

  const s: Session = structuredClone(session);
  s.now = event.at;
  const effects: Effect[] = [];

  // Safety first: a safety signal is taken before the clock and before anything else in the same event.
  const proposed = event.type === "proposal" && isObject(event.proposal) && isObject(event.proposal.reading) ? event.proposal.reading.safety : undefined;
  const severity = event.type === "safety" ? event.severity : SEVERITIES.includes(proposed as Severity) ? (proposed as Severity) : undefined;
  if (severity) raiseSafety(s, severity, event.at, effects);

  if (s.startedAt !== null) {
    const elapsed = event.at - s.startedAt;
    if (elapsed >= TIME_LIMITS.endAtMs) {
      if (s.safety.flagged && !s.safety.guided) {
        // Pending safety guidance is given before the call closes, in code's words.
        sayFixed(s, SAFETY_GUIDANCE[s.safety.severity!], effects);
        s.safety.guided = true;
      }
      end(s, "time_limit", effects, true);
      return { session: s, effects, refusal: null };
    }
    // A repair Maya owes is made first; it returns to the closing minute.
    if (elapsed >= TIME_LIMITS.closingAtMs && !["TIME_CLOSE", "SAFETY", "REPAIR_MAYA", "CLOSE", "CONTENT_HOLD"].includes(s.state)) {
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
      break;
    case "child_turn": {
      if (typeof event.text !== "string") return refuse(session, "invalid_event", "A child turn needs its text.");
      if (event.final === false) {
        effects.push({ kind: "cancel_output" });
        break;
      }
      const alternatives = Array.isArray(event.alternatives) ? event.alternatives.filter((a) => typeof a === "string") : [];
      s.turns.push({ at: event.at, speaker: "child", text: event.text, state: s.state, ...(alternatives.length > 0 ? { alternatives } : {}) });
      s.turn = s.turn
        ? { at: event.at, text: `${s.turn.text} ${event.text}`, uncertain: s.turn.uncertain || event.uncertain === true }
        : { at: event.at, text: event.text, uncertain: event.uncertain === true };
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
    case "maya_claim": {
      // No math is repaired before the opening, after a safety concern or a content hold, or twice at once.
      if (!s.package || ["READY", "OPEN", "SAFETY", "CONTENT_HOLD", "REPAIR_MAYA"].includes(s.state)) break;
      if (claimProblem(event.claim) ?? claimAnswerProblem(s, event.claim)) {
        effects.push({ kind: "cancel_output" });
        // The repair returns to the teaching state (an interrupt's saved one), or to the closing minute (no resume).
        if (isTeaching(s.state)) s.resume = s.state;
        s.state = "REPAIR_MAYA";
        s.expect = "maya";
        s.turn = null;
      }
      break;
    }
    case "content_problem":
      if (s.state !== "SAFETY") {
        moveTo(s, "CONTENT_HOLD");
        s.contentProblem = event.detail;
        s.expect = "maya";
        effects.push({ kind: "cancel_output" });
      }
      break;
    case "technical":
      end(s, "technical_issue", effects, true);
      break;
    case "proposal":
      return propose(session, s, event.proposal, effects);
    default:
      return refuse(session, "invalid_event", "Unknown event type.");
  }
  return { session: s, effects, refusal: null };
}

function propose(original: Session, s: Session, raw: unknown, effects: Effect[]): StepResult {
  // A refusal keeps the session, except for a safety flag the reading raised (and its effects).
  const flagged = s.safety.flagged && !original.safety.flagged;
  const kept = flagged ? { ...original, safety: s.safety, state: s.state, resume: s.resume, expect: s.expect, now: s.now } : original;
  const no = (code: RefusalCode, reason: string, allowed: Act[] = []): StepResult =>
    ({ session: kept, effects: flagged ? effects : [], refusal: { code, reason, allowed } });

  const problem = proposalProblem(raw);
  if (problem) return no("invalid_proposal", problem, allowedActs(s, {}).acts);
  const p = raw as Proposal;
  const reading = p.reading ?? {};

  // Safety is refused first; then a wrong verdict on the child's answers, the clearest reason; then the act itself.
  const allowed = allowedActs(s, reading);
  if (!allowed.acts.includes(p.act) && allowed.code === "safety_first") return no(allowed.code, allowed.reason, allowed.acts);
  const pkg = s.package;

  // The child's answers: said and kept in this turn (not taken back, not offered as a choice), and judged right only
  // when code agrees.
  const answers = reading.answers ?? [];
  if (answers.length > 0) {
    if (!pkg || !s.turn) return no("answer_not_heard", "There is no child turn to read an answer from.", allowed.acts);
    const committed = committedText(s.turn.text);
    if (offersChoice(committed)) return no("answer_not_committed", "The child offered more than one answer: ask which one they mean.", allowed.acts);
    const heard = valuesIn(committed);
    for (const a of answers) {
      const { steps, answer } = problemOf(pkg, a.problem ?? "target");
      const at = steps.find((x) => x.id === a.step);
      if (!at) return no("wrong_step", `The ${a.problem ?? "target"} has no step "${a.step}".`, allowed.acts);
      if (!heard.some((v) => saidAs(v, a.value))) return no("answer_not_heard", `The child did not say ${show(a.value)}, or took it back.`, allowed.acts);
      const right = stepAnswers(at, answer).some((v) => equivalent(v, a.value));
      if (a.verdict === "right" && !right) return no("accepts_wrong_answer", `${show(a.value)} is not right for ${a.step}: the checked math says otherwise.`, allowed.acts);
      if (a.verdict === "wrong" && right) return no("rejects_right_answer", `${show(a.value)} is right for ${a.step}.`, allowed.acts);
    }
  }

  if (!allowed.acts.includes(p.act)) return no(allowed.code, allowed.reason, allowed.acts);

  // Maya's number claims, checked by code.
  for (const claim of p.claims ?? []) {
    const why = claimProblem(claim) ?? (pkg ? claimAnswerProblem(s, claim) : null);
    if (why) return no("wrong_math", why, allowed.acts);
  }

  const say = p.say.trim();
  if (say === "" && p.act !== "wait") return no("invalid_proposal", "Maya needs words for this act.", allowed.acts);

  // The ladder after this reading: failures and requests raise what help is allowed; right steps move on.
  const ladder = { ...s.ladder };
  const done = [...s.done];
  let failed = false;
  if (pkg) {
    for (const a of answers.filter((x) => (x.problem ?? "target") === "target")) {
      if (a.verdict === "right" && a.step !== "result" && !done.includes(a.step)) done.push(a.step);
      if (a.verdict === "wrong") failed = true;
    }
    const next = currentStep(pkg, done);
    if (next !== ladder.step) {
      // A step done: the next one starts with less help than the last.
      Object.assign(ladder, { step: next, hint: -1, unlocked: Math.max(0, ladder.hint - 1), failures: 0 });
    }
    if (failed) {
      ladder.failures += 1;
      ladder.unlocked = Math.max(ladder.unlocked, Math.min(4, ladder.hint + 1));
    }
    if (reading.help === "more") ladder.unlocked = Math.max(ladder.unlocked, Math.min(4, ladder.hint + 1));
    if (reading.help === "show") ladder.unlocked = Math.max(ladder.unlocked, 3);
  }

  // The final answer stays unsaid until the child says it or Maya may give it.
  const released = s.solved !== null || saysRightResult(s, reading) || p.act === "give_answer";
  if (pkg && !released && revealsAnswer(pkg, p)) return no("reveals_answer", "Maya may not say the answer yet.", allowed.acts);

  if (p.board) {
    if (!BOARD_ACTS.includes(p.act)) return no("board_not_allowed", `Maya does not draw during ${p.act}.`, allowed.acts);
    const problem: Problem = p.act === "example_step" ? "example" : "target";
    const wrong = boardProblem(pkg!, problem, p.board);
    if (wrong) return no("board_wrong_problem", wrong, allowed.acts);
  }

  const main = isTeaching(s.state) ? s.state : s.resume;
  switch (p.act) {
    case "open":
      if (!/\bAI\b/.test(say)) return no("missing_disclosure", "The opening says Maya is an AI.", allowed.acts);
      s.opened = true;
      break;
    case "clarify":
      s.clarified = true;
      moveTo(s, "ASSESS");
      break;
    case "example_step": {
      const next = pkg!.easierExample.steps[main === "ASSESS" ? 0 : s.exampleShown];
      if (p.step !== next.id) return no("wrong_step", `The next example step is "${next.id}".`, allowed.acts);
      s.exampleShown = main === "ASSESS" ? 1 : s.exampleShown + 1;
      s.assistance.push("worked_example");
      moveTo(s, "MODEL_EXAMPLE");
      break;
    }
    case "try_target":
      moveTo(s, "TRY_TARGET");
      break;
    case "guide": {
      if (p.step !== ladder.step) return no("wrong_step", `Guide the first step the child has not done: "${ladder.step}".`, allowed.acts);
      if (p.level === undefined) return no("invalid_proposal", "A guide needs a hint level.", allowed.acts);
      // A child with a located error can start at H2 at most; otherwise help rises one level per failure or request.
      const cap = (main === "ASSESS" || main === "TRY_TARGET") && ladder.hint === -1 ? Math.max(ladder.unlocked, 2) : ladder.unlocked;
      if (p.level > cap) return no("hint_too_high", `Help may rise to H${cap} now: more help needs a failed attempt or a request, not silence.`, allowed.acts);
      if (ladder.failures >= 2 && p.level <= ladder.hint) return no("same_hint_again", `Two attempts failed at H${ladder.hint}: give more help or offer to stop.`, allowed.acts);
      if (p.level > ladder.hint) ladder.failures = 0;
      ladder.hint = p.level;
      ladder.unlocked = Math.max(ladder.unlocked, p.level);
      s.highestHint = Math.max(s.highestHint ?? 0, p.level) as HintLevel;
      if (p.level >= 1) s.stuckStep ??= ladder.step;
      if (p.level >= 1) s.assistance.push(p.level >= 3 ? "guided" : "hint");
      moveTo(s, "GUIDE_TARGET");
      break;
    }
    case "accept_answer":
      if (!saysRightResult(s, reading)) return no("accepts_wrong_answer", "Only a right final answer the child said can be accepted.", allowed.acts);
      s.solved ??= "child";
      if (s.state !== "TIME_CLOSE") moveTo(s, "CHECK");
      break;
    case "give_answer": {
      if (s.state !== "TIME_CLOSE" && ladder.unlocked < 4) return no("hint_too_high", `The answer comes after help up to H3 and another failed attempt or request (now H${ladder.unlocked}).`, allowed.acts);
      if (!valuesIn(say).some((v) => equivalent(v, pkg!.answer.value)) || !/\bpaper\b/i.test(say)) {
        return no("missing_answer", "Giving the answer means saying it and asking the child to write it on their paper.", allowed.acts);
      }
      if (s.solved === null) {
        s.solved = "maya";
        s.answerGivenFirst = true;
      }
      s.highestHint = 4;
      s.stuckStep ??= ladder.step;
      s.assistance.push("answer_given");
      s.writeAsked = true;
      if (s.state !== "TIME_CLOSE") moveTo(s, "WRITE_CLOSE");
      break;
    }
    case "ask_write":
      if (main === "CHECK") {
        if (p.understanding === undefined) return no("invalid_proposal", "Say what the check showed: evidence_observed or uncertain.", allowed.acts);
        if (p.understanding === "evidence_observed" && (s.answerGivenFirst || s.solved !== "child")) {
          return no("invalid_proposal", "Maya gave the answer, so understanding stays uncertain.", allowed.acts);
        }
        s.understanding = p.understanding;
      }
      s.writeAsked = true;
      if (s.state !== "TIME_CLOSE") moveTo(s, "WRITE_CLOSE");
      break;
    case "close":
      break;
    case "safety":
      if (s.safety.severity === "immediate" && !say.includes("911")) return no("missing_emergency", "In immediate danger, tell the child to get a safe grown-up and call 911.", allowed.acts);
      s.safety.guided = true;
      moveTo(s, "SAFETY");
      break;
    case "confirm":
      s.confirmTries += 1;
      s.mishearing.confirmations += 1;
      enterInterrupt(s, "CONFIRM_HEARD");
      break;
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
      s.redirects += 1;
      enterInterrupt(s, "REDIRECT");
      break;
    case "repair":
      moveTo(s, s.resume ?? "TIME_CLOSE");
      break;
  }

  // Committed: the reading counts now.
  if (reading.correctsHearing) s.mishearing.corrections += 1;
  if (reading.paper) s.paper = reading.paper === "written" ? "child_confirmed" : "declined";
  if (failed) s.stuckStep ??= ladder.step;
  for (const a of answers) {
    if ((a.problem ?? "target") !== "target" || a.step !== "result") continue;
    if (a.verdict === "wrong") s.wrongResults.push(a.value);
    else s.childRight = true;
  }
  if (p.act !== "confirm" && p.act !== "offer_other_input") {
    s.confirmTries = 0;
    s.offeredOtherInput = false;
  }
  s.done = done;
  s.ladder = ladder;
  s.turn = null;

  if (say !== "") {
    effects.push({ kind: "say", act: p.act, text: say });
    s.turns.push({ at: s.now!, speaker: "maya", text: say, state: p.act === "close" ? "CLOSE" : s.state, act: p.act });
  }
  if (p.board) {
    s.batches += 1;
    effects.push({ kind: "board", batch: { transactionId: `${s.callId}-b${s.batches}`, commands: p.board } });
  }

  if (p.act === "close") {
    end(s, closeCause(s, reading), effects, false);
  } else if (p.act === "safety" || (p.act === "example_step" && s.exampleShown < pkg!.easierExample.steps.length)) {
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

function sayFixed(s: Session, text: string, effects: Effect[]) {
  effects.push({ kind: "say", act: "safety", text });
  s.turns.push({ at: s.now!, speaker: "maya", text, state: s.state, act: "safety" });
}

/** Why Maya closes now, before the outcome's priority (safety, a content issue, then solved). */
function closeCause(s: Session, reading: Reading): Reason {
  if (reading.stop) return "child_stopped";
  if (s.silence === "close_due") return "no_response";
  if (s.state === "TIME_CLOSE") return "time_limit";
  if (s.state === "CONFIRM_HEARD") return "technical_issue";
  return "child_stopped";
}

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
    seconds: s.startedAt === null || s.now === null ? 0 : Math.round((s.now - s.startedAt) / 1000),
  };
}

function end(s: Session, cause: Reason, effects: Effect[], cancel: boolean) {
  if (cancel) effects.push({ kind: "cancel_output" });
  s.outcome = outcomeOf(s, cause);
  moveTo(s, "CLOSE");
  s.expect = "nothing";
  s.turn = null;
  effects.push({ kind: "end", at: s.now!, outcome: s.outcome, safetyHelp: s.safety.flagged });
}

/** Why an answer claim is wrong, or null: a problem's answer is what code computes, and the target's waits its turn. */
function claimAnswerProblem(s: Session, claim: MathClaim): string | null {
  if (claim.kind !== "answer" || !s.package) return null;
  const { steps, answer } = problemOf(s.package, claim.problem);
  const right = stepAnswers(steps.at(-1)!, answer).some((v) => equivalent(v, claim.value));
  return right ? null : `${show(claim.value)} is not the ${claim.problem === "target" ? "question's" : "example's"} answer`;
}

/**
 * Maya's words, claims or board would give the final answer: she says or writes it, claims it, or fills the answer
 * row's last digit (its highest place), which completes it. During the easier example the board holds the example.
 */
function revealsAnswer(pkg: QuestionPackage, p: Proposal): boolean {
  const answer = pkg.answer.value;
  const board = (p.board ?? []) as Partial<Command>[];
  const texts = [p.say, ...board.flatMap((c) => ("text" in c ? [c.text] : "value" in c ? [c.value] : []))];
  if (texts.some((t) => typeof t === "string" && valuesIn(t).some((v) => equivalent(v, answer)))) return true;
  if ((p.claims ?? []).some((c) => c.kind === "answer" && c.problem === "target")) return true;
  if (p.act === "example_step") return false;
  const last = [...pkg.steps].reverse().find((x) => x.kind === "add-column" || (x.kind === "subtract-column" && x.write !== null));
  const highest = last && last.kind !== "result" ? last.place.replace(" ", "_") : null;
  return board.some((c) => {
    if (c.op !== "put" || !isObject(c.target)) return false;
    const t = c.target as Target;
    return (t.part === "row" && t.rowId === "answer") || (t.part === "cell" && t.rowId === "answer" && t.column === highest);
  });
}

/** A board `columns` command shows the problem this turn is about, with its own numbers. */
function boardProblem(pkg: QuestionPackage, problem: Problem, board: unknown[]): string | null {
  const { operation } = problemOf(pkg, problem);
  for (const c of board as Record<string, unknown>[]) {
    if (c.op !== "columns") continue;
    const operands = Array.isArray(c.operands) ? c.operands.map((o) => (isObject(o) ? Number(o.value) : NaN)) : [];
    const same = c.operation === operation.kind && operands.length === 2 && operands[0] === operation.operands[0] && operands[1] === operation.operands[1];
    if (!same) return `The board shows the ${problem === "target" ? "child's question" : "easier example"} now: ${operation.operands.join(` ${operation.kind === "add" ? "+" : "-"} `)}.`;
  }
  return null;
}

/** The child said this value: the same number (66 and 66.0), or a fraction written the same way (14/16 is not 7/8). */
const saidAs = (heard: AnswerValue, value: AnswerValue) =>
  heard.type === "fraction" || value.type === "fraction" ? sameValue(heard, value) : equivalent(heard, value);

function show(v: AnswerValue): string {
  if (v.type === "fraction") return `${v.numerator}/${v.denominator}`;
  return String(v.value);
}
