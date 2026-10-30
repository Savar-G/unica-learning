// Maya's teaching controller (#321, spec #297): the state machine of one call about one checked question. The model
// writes Maya's words and proposes her next act; this module decides whether that act is allowed now and refuses it
// with a reason when it is not. Code, not the model, owns the math check of every child answer and of every equation
// Maya says or writes, the call clock, the hint ladder, the safety flag, the safety guidance and the outcome. Child
// speech and workbook text are data: nothing a child says changes the answer key, the states or the safety rules.
//
// One call: READY -> OPEN -> ASSESS -> (MODEL_EXAMPLE -> TRY_TARGET | TRY_TARGET | GUIDE_TARGET) -> CHECK ->
// WRITE_CLOSE -> CLOSE, or CONTENT_HOLD when the question package does not check or is a kind Maya cannot teach yet.
// The interrupts take over in this priority: SAFETY first, then a stop and the deadline (TIME_CLOSE), then a repair
// Maya owes (REPAIR_MAYA), then confirmation of what was heard (CONFIRM_HEARD), then teaching with WAIT_WRITE and
// REDIRECT. Every event is taken in that order: a safety signal, a stop request, an unclear number and the clock are
// kept even when the model's proposal for that turn is refused, and no answer is scored before them. Teaching research:
// `.design/research/ta-pedagogy-2026-10/maya-teaching.md`, section 5.
//
// Everything in and out is plain serializable data (the text adapter #322 and the board protocol #328 drive it): a
// Session value, events with the time they happened (the clock is passed in), effects to carry out, and a refusal.
// Pure TypeScript: no React, DOM, network, clock or randomness.
import { MAX_COMMANDS, PLACE_NAMES, type Batch, type Command, type Target } from "@/lib/board";
import { MAX_HINTS, MAX_TIME_MS, type NewLearningEvent } from "@/lib/learning-events";
import {
  checkQuestionPackage,
  equivalent,
  isRightAnswer,
  sameValue,
  valueText,
  type AnswerValue,
  type Operation,
  type OperationKind,
  type QuestionPackage,
  type WorkedStep,
} from "@/lib/question-package";
import { committedText, equationsIn, offersChoice, readNumbers, valuesIn } from "./numbers";

/** Closing starts 9 minutes into the call; the call ends at 10 minutes. */
export const TIME_LIMITS = { closingAtMs: 9 * 60_000, endAtMs: 10 * 60_000 } as const;

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
 * The operation kinds Maya teaches: whole numbers and decimals, whose steps and answers code checks and children say as
 * numbers. A fraction question is held until spoken fraction forms are read.
 */
export const TEACHABLE_KINDS: readonly OperationKind[] = ["add", "subtract", "multiply", "divide", "decimal-add", "decimal-subtract", "decimal-multiply"];

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
/** Acts whose proposal may score the child's answers. Safety, a stop, a confirmation or a wait never scores one. */
const SCORING_ACTS: readonly Act[] = ["clarify", "example_step", "try_target", "guide", "accept_answer", "give_answer", "ask_write", "close"];

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

/**
 * An answer the model read in the child's turn: the value, the step it answers (a worked step id, or "result"), and the
 * model's verdict. Code checks that the child said it and kept it, and that the verdict is right.
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
  /** The child asks to stop. Kept for this turn even when the proposal is refused. */
  stop?: boolean;
  /** The words or a number are unclear: confirm before judging. Kept for this turn even when the proposal is refused. */
  unclear?: boolean;
  /** The child is writing or asks for more time. */
  writing?: boolean;
  /** A harmless off-topic request, or a request for another question. */
  offTopic?: boolean;
  /** An explicit request for more help, or for Maya to show the step. */
  help?: "more" | "show";
  /** At the opening: the child has work to show, or has not started (then the easier example comes first). */
  start?: "has_work" | "no_start";
  answers?: ChildAnswer[];
  /** The child says they wrote the answer on paper, or will not. Maya never sees the paper. */
  paper?: "written" | "declined";
  /** The child says Maya heard them wrong ("no, I said fifteen"). */
  correctsHearing?: boolean;
}

/**
 * A model proposal: Maya's next act, her words, and what she draws. Untrusted: every field is checked, and every
 * equation in `say` and in the board's text must hold. For `safety`, code speaks the safety guidance and `say` is not
 * used; for `give_answer`, `say` is the short reason and code adds the answer and the request to write it on paper.
 */
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
  /** What Maya actually said (the speech transcript): an equation in it that does not hold starts REPAIR_MAYA. */
  | { type: "maya_said"; at: number; text: string }
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
  /** Seconds from the start to the end, at most the 10-minute limit. */
  seconds: number;
}

export type Effect =
  | { kind: "say"; act: Act; text: string }
  | { kind: "board"; batch: Batch }
  /** Stop speaking and drop board batches not yet shown. */
  | { kind: "cancel_output" }
  /** Create the durable safety flag and alert (once per call, and again when the severity rises). */
  | { kind: "safety_flag"; severity: Severity; at: number }
  /** The call ends: audio stops. `safetyMessage`: the safety guidance to keep on screen after the call, or null. */
  | { kind: "end"; at: number; outcome: Outcome; safetyMessage: string | null };

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
  /** The child asked to stop. */
  stop: boolean;
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
  version: 2;
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
  turn: ChildTurn | null;
  opened: boolean;
  clarified: boolean;
  /** The child said they could not start: the easier example, then a fresh try, come before guided target work. */
  noStart: boolean;
  /** Easier-example steps shown, in order. */
  exampleShown: number;
  /** Maya handed the question back after the whole easier example. */
  retried: boolean;
  /** Target steps the child has done. */
  done: string[];
  ladder: Ladder;
  highestHint: HintLevel | null;
  /** Hints given: guide turns from H1, and a given answer. */
  hints: number;
  /** Every kind of help given, in order. Nothing removes an entry. */
  assistance: Assistance[];
  /** Who first gave the checked final answer; the question is solved either way. */
  solved: "child" | "maya" | null;
  /** The child's latest final answer, as code judged it. */
  lastResult: "right" | "wrong" | null;
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
  /** The first target step where the child needed help or failed. */
  stuckStep: string | null;
  /** Board objects Maya created, by id: the child's question or the easier example. */
  boardRoles: Record<string, Problem>;
  batches: number;
  turns: TranscriptTurn[];
  outcome: Outcome | null;
}

export function createSession(input: { callId: string; package: unknown }): Session {
  const check = checkQuestionPackage(input.package);
  const teachable = check.ok && TEACHABLE_KINDS.includes(check.package.operation.kind);
  const pkg = check.ok ? structuredClone(check.package) : null;
  return {
    version: 2,
    callId: input.callId,
    state: "READY",
    resume: null,
    package: teachable ? pkg : null,
    contentProblem: !check.ok ? check.reason : teachable ? null : `Maya cannot teach ${pkg!.operation.kind} questions yet`,
    startedAt: null,
    now: null,
    expect: "nothing",
    waitingSince: null,
    silence: "none",
    turn: null,
    opened: false,
    clarified: false,
    noStart: false,
    exampleShown: 0,
    retried: false,
    done: [],
    ladder: { step: teachable ? workSteps(pkg!.steps)[0]?.id ?? "result" : "result", hint: -1, unlocked: 0, failures: 0 },
    highestHint: null,
    hints: 0,
    assistance: [],
    solved: null,
    lastResult: null,
    answerGivenFirst: false,
    understanding: "uncertain",
    paper: "unknown",
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
  };
}

// ---------- Reading the session ----------

/** Whose turn it is, and the acts Maya may propose now (before any reading of the child's turn). */
export function nextActs(session: Session): { expect: Expect; acts: Act[] } {
  if (session.expect !== "maya") return { expect: session.expect, acts: [] };
  return { expect: "maya", acts: (gate(session, {}) ?? teachingActs(session, {}, false)).acts };
}

/**
 * The learning event of an ended call (#302), for the learning record: null before the end or without a checked
 * question. A call's result is right (the child's final answer right, with no help), right_with_help (right after
 * help, even after Maya gave the answer), or blank (the call left the question unfinished, even after a wrong answer:
 * only the final answer counts). A call never records wrong, so it has no mistake.
 */
export function learningEvent(session: Session, family: { parentId: string; childId: string }): NewLearningEvent | null {
  const { outcome, package: pkg } = session;
  if (!outcome || !pkg || session.startedAt === null) return null;
  const right = session.lastResult === "right";
  const result = right ? (outcome.assistance === "independent" ? "right" : "right_with_help") : "blank";
  const first = workSteps(pkg.steps)[0]?.id ?? null;
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

/** The worked steps a child does, without the result. */
const workSteps = (steps: WorkedStep[]) => steps.filter((s) => s.kind !== "result");
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
    default:
      // Fraction steps: their kinds are held (TEACHABLE_KINDS); the result is checked by isRightAnswer.
      return [];
  }
}

const problemOf = (pkg: QuestionPackage, problem: Problem) =>
  problem === "target"
    ? { operation: pkg.operation, steps: pkg.steps, answer: pkg.answer }
    : { operation: pkg.easierExample.operation, steps: pkg.easierExample.steps, answer: { value: pkg.easierExample.answer, accepted: [], unit: null } };

/** The first target step the child has not done ("result" when every step is done). */
const currentStep = (pkg: QuestionPackage, done: readonly string[]) => workSteps(pkg.steps).find((s) => !done.includes(s.id))?.id ?? "result";

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
    (v.type === "remainder" && isWholeAt(v.quotient, 0) && isWholeAt(v.remainder, 0)));
const HINTS = [0, 1, 2, 3, 4];
const SEVERITIES: Severity[] = ["concern", "immediate"];

function proposalProblem(p: unknown): string | null {
  if (!isObject(p)) return "a proposal is an object";
  if (typeof p.act !== "string" || !(ACTS as readonly string[]).includes(p.act)) return `the act is one of ${ACTS.join(", ")}`;
  if (typeof p.say !== "string") return "a proposal needs Maya's words in `say`";
  if (p.step !== undefined && typeof p.step !== "string") return "the step is a step id";
  if (p.level !== undefined && !HINTS.includes(p.level as number)) return "the level is 0 to 4";
  if (p.understanding !== undefined && p.understanding !== "evidence_observed" && p.understanding !== "uncertain") return "understanding is evidence_observed or uncertain";
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
        return "each answer needs a number, fraction or remainder value, a step and a verdict";
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
  if (reading.safety || (s.safety.flagged && !s.safety.guided)) {
    return { acts: ["safety"], code: "safety_first", reason: "Safety comes first: give the safety guidance before anything else." };
  }
  if (s.state === "SAFETY") return { acts: ["close"], code: "safety_first", reason: "No math after a safety concern: close." };
  if (s.state === "CONTENT_HOLD") return { acts: ["close"], code: "content_hold", reason: `Maya cannot teach this question (${s.contentProblem}): close without teaching.` };
  if (s.expect !== "maya") return { acts: [], code: "not_mayas_turn", reason: "It is the child's turn: wait for them." };
  if (s.turn?.stop || reading.stop) return { acts: ["close"], code: "stop_first", reason: "The child asked to stop: close kindly, with no more questions." };
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
  return null;
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

/** The teaching acts allowed now. `rightResult`: the child's turn holds a checked right final answer. */
function teachingActs(s: Session, reading: Reading, rightResult: boolean): Allowed {
  // Maya may always check what she heard before she goes on.
  const confirm: Act[] = s.turn ? ["confirm"] : [];
  if (s.state === "TIME_CLOSE") {
    const acts: Act[] = s.solved !== null ? (s.writeAsked ? ["close"] : ["ask_write", "close"])
      : rightResult ? ["accept_answer", "close"] : ["give_answer", "ask_write", "close"];
    return { acts: [...acts, ...confirm], code: "act_not_allowed", reason: "Time is almost up: finish the question and close." };
  }
  if (reading.writing) return { acts: ["wait"], code: "act_not_allowed", reason: "The child is writing: wait." };
  if (reading.offTopic) {
    return { acts: s.redirects > 0 ? ["redirect", "close"] : ["redirect"], code: "act_not_allowed", reason: "Off topic: bring the child back to this question." };
  }
  const main = isTeaching(s.state) ? s.state : s.resume;
  if (!main) return { acts: [], code: "act_not_allowed", reason: "No act fits now." };
  const steps = s.package!.easierExample.steps.length;
  let acts = MAIN_ACTS[main].filter((act) => {
    switch (act) {
      case "open":
        return !s.opened;
      case "clarify":
        return !s.clarified;
      case "example_step":
        return main === "ASSESS" || s.exampleShown < steps;
      case "try_target":
        // A child who could not start sees the whole example first.
        return main === "MODEL_EXAMPLE" ? s.exampleShown === steps : !s.noStart;
      case "guide":
      case "give_answer":
        // ...and tries their own question again before guided work.
        return !s.noStart || s.retried;
      case "ask_write":
        return main === "CHECK" || !s.writeAsked;
      case "close":
        return s.writeAsked && s.turn !== null;
      default:
        return true;
    }
  });
  if (rightResult && s.solved === null && acts.includes("accept_answer")) acts = ["accept_answer"];
  acts = [...acts, ...confirm.filter((a) => !acts.includes(a))];
  const why = s.noStart && !s.retried ? " The child could not start: show the whole easier example, then hand the question back." : "";
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
  s.now = event.at;
  const effects: Effect[] = [];

  // Safety first: a safety signal is taken before the clock and before anything else in the same event.
  const raw = event.type === "proposal" ? event.proposal : undefined;
  const shape = event.type === "proposal" ? proposalProblem(raw) : null;
  const reading: Reading = event.type === "proposal" && shape === null ? (raw as Proposal).reading ?? {} : {};
  const proposed = isObject(raw) && isObject(raw.reading) && SEVERITIES.includes(raw.reading.safety as Severity) ? (raw.reading.safety as Severity) : undefined;
  const severity = event.type === "safety" ? event.severity : proposed;
  if (severity) raiseSafety(s, severity, event.at, effects);

  // The child's turn as the model read it: a stop, an unclear number and a no-start hold even if the proposal fails.
  if (s.turn) {
    if (reading.stop) s.turn.stop = true;
    if (reading.unclear) s.turn.uncertain = true;
  }
  if (reading.start === "no_start" && s.state === "ASSESS") s.noStart = true;

  if (s.startedAt !== null) {
    const elapsed = event.at - s.startedAt;
    if (elapsed >= TIME_LIMITS.endAtMs) {
      end(s, "time_limit", effects, true);
      return { session: s, effects, refusal: event.type === "proposal" ? { code: "ended", reason: "The call reached its 10 minutes.", allowed: [] } : null };
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
      // A number form code cannot read is confirmed, never guessed.
      const uncertain = event.uncertain === true || readNumbers(event.text).unreadable;
      s.turn = s.turn
        ? { at: event.at, text: `${s.turn.text} ${event.text}`, uncertain: s.turn.uncertain || uncertain, stop: s.turn.stop }
        : { at: event.at, text: event.text, uncertain, stop: false };
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
    case "maya_said":
      // No math is repaired before the opening, after a safety concern or a content hold, or twice at once.
      if (typeof event.text !== "string") return refuse(session, "invalid_event", "What Maya said needs its text.");
      if (s.package && !["READY", "OPEN", "SAFETY", "CONTENT_HOLD", "REPAIR_MAYA"].includes(s.state) && equationsIn(event.text).some((e) => !e.holds)) {
        effects.push({ kind: "cancel_output" });
        // The repair returns to the teaching state (an interrupt's saved one), or to the closing minute (no resume).
        if (isTeaching(s.state)) s.resume = s.state;
        s.state = "REPAIR_MAYA";
        s.expect = "maya";
        s.turn = null;
      }
      break;
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
      if (shape) return { session: s, effects, refusal: { code: "invalid_proposal", reason: shape, allowed: (gate(s, {}) ?? teachingActs(s, {}, false)).acts } };
      return propose(s, raw as Proposal, effects);
    default:
      return refuse(session, "invalid_event", "Unknown event type.");
  }
  return { session: s, effects, refusal: null };
}

/** A proposal on `base` (the session with the event's own input taken). A refusal returns `base` and its effects. */
function propose(base: Session, p: Proposal, effects: Effect[]): StepResult {
  const no = (code: RefusalCode, reason: string, allowed: Act[]): StepResult => ({ session: base, effects, refusal: { code, reason, allowed } });
  const s = structuredClone(base);
  const reading = p.reading ?? {};
  const pkg = s.package;

  // 1. The priority gates, before any math: safety, content, turn, stop, repair, silence, confirmation.
  const blocked = gate(s, reading);
  if (blocked && !blocked.acts.includes(p.act)) return no(blocked.code, blocked.reason, blocked.acts);

  // 2. Teaching: the child's answers are judged only now, and only for an act that may score them.
  const checked: Checked[] = [];
  if (!blocked && SCORING_ACTS.includes(p.act) && (reading.answers ?? []).length > 0) {
    const problem = checkAnswers(s, reading.answers!, checked);
    if (problem) return no(problem.code, problem.reason, teachingActs(s, reading, false).acts);
  }
  const rightResult = checked.some((c) => c.problem === "target" && c.answer.step === "result" && c.answer.verdict === "right");
  const allowedNow = blocked ? blocked.acts : teachingActs(s, reading, rightResult).acts;
  if (!blocked && !allowedNow.includes(p.act)) {
    const allowed = teachingActs(s, reading, rightResult);
    return no(allowed.code, allowed.reason, allowed.acts);
  }

  // 3. Maya's own words and board: every equation holds, and the answer waits its turn.
  const say = p.say.trim();
  const wrong = p.act === "safety" ? undefined : [say, ...boardTexts(p.board ?? [])].flatMap(equationsIn).find((e) => !e.holds);
  if (wrong) return no("wrong_math", `"${wrong.text}" is not true.`, allowedNow);
  if (say === "" && !["wait", "safety", "give_answer"].includes(p.act)) return no("invalid_proposal", "Maya needs words for this act.", allowedNow);
  let roles: Record<string, Problem> = {};
  if (p.board) {
    if (!BOARD_ACTS.includes(p.act)) return no("board_not_allowed", `Maya does not draw during ${p.act}.`, allowedNow);
    const board = boardRoles(s, p.act === "example_step" ? "example" : "target", p.board);
    if (typeof board === "string") return no("board_wrong_problem", board, allowedNow);
    roles = board;
  }
  const released = s.solved !== null || rightResult || p.act === "give_answer";
  if (pkg && !released && p.act !== "safety" && revealsAnswer(s, p)) return no("reveals_answer", "Maya may not give the answer yet.", allowedNow);

  // 4. The ladder after this reading: failures and requests raise what help is allowed; right steps move on.
  const scoring = !blocked;
  const ladder = { ...s.ladder };
  const done = [...s.done];
  let failed = false;
  if (pkg && scoring) {
    for (const { answer: a, problem } of checked) {
      if (problem !== "target") continue;
      if (a.verdict === "right" && a.step !== "result" && !done.includes(a.step)) done.push(a.step);
      if (a.verdict === "wrong") failed = true;
    }
    const next = currentStep(pkg, done);
    if (next !== ladder.step) Object.assign(ladder, { step: next, hint: -1, unlocked: Math.max(0, ladder.hint - 1), failures: 0 });
    if (failed) {
      ladder.failures += 1;
      ladder.unlocked = Math.max(ladder.unlocked, Math.min(4, ladder.hint + 1));
    }
    if (reading.help === "more") ladder.unlocked = Math.max(ladder.unlocked, Math.min(4, ladder.hint + 1));
    if (reading.help === "show") ladder.unlocked = Math.max(ladder.unlocked, 3);
  }

  // 5. The act.
  let text = say;
  const main = isTeaching(s.state) ? s.state : s.resume;
  switch (p.act) {
    case "open":
      if (!/\bAI\b/.test(say)) return no("missing_disclosure", "The opening says Maya is an AI.", allowedNow);
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
      // A child with a located error can start at H2 at most; otherwise help rises one level per failure or request.
      const cap = (main === "ASSESS" || main === "TRY_TARGET") && ladder.hint === -1 ? Math.max(ladder.unlocked, 2) : ladder.unlocked;
      if (p.level > cap) return no("hint_too_high", `Help may rise to H${cap} now: more help needs a failed attempt or a request, not silence.`, allowedNow);
      if (ladder.failures >= 2 && p.level <= ladder.hint) return no("same_hint_again", `Two attempts failed at H${ladder.hint}: give more help or offer to stop.`, allowedNow);
      if (p.level > ladder.hint) ladder.failures = 0;
      ladder.hint = p.level;
      ladder.unlocked = Math.max(ladder.unlocked, p.level);
      s.highestHint = Math.max(s.highestHint ?? 0, p.level) as HintLevel;
      if (p.level >= 1) {
        s.hints += 1;
        s.stuckStep ??= ladder.step;
        s.assistance.push(p.level >= 3 ? "guided" : "hint");
      }
      moveTo(s, "GUIDE_TARGET");
      break;
    }
    case "accept_answer":
      if (!rightResult) return no("accepts_wrong_answer", "Only a right final answer the child said and kept can be accepted.", allowedNow);
      s.solved ??= "child";
      if (s.state !== "TIME_CLOSE") moveTo(s, "CHECK");
      break;
    case "give_answer": {
      if (s.state !== "TIME_CLOSE" && ladder.unlocked < 4) return no("hint_too_high", `The answer comes after help up to H3 and another failed attempt or request (now H${ladder.unlocked}).`, allowedNow);
      // Code says the answer and asks for it on paper, so both are true.
      const answer = valueText(pkg!.answer.value);
      text = [say, `The answer is ${answer}. Please write ${answer} on your paper.`].filter(Boolean).join(" ");
      if (s.solved === null) {
        s.solved = "maya";
        s.answerGivenFirst = true;
      }
      s.highestHint = 4;
      s.hints += 1;
      s.stuckStep ??= ladder.step;
      s.assistance.push("answer_given");
      s.writeAsked = true;
      if (s.state !== "TIME_CLOSE") moveTo(s, "WRITE_CLOSE");
      break;
    }
    case "ask_write":
      if (main === "CHECK") {
        if (p.understanding === undefined) return no("invalid_proposal", "Say what the check showed: evidence_observed or uncertain.", allowedNow);
        if (p.understanding === "evidence_observed" && (s.answerGivenFirst || s.solved !== "child")) {
          return no("invalid_proposal", "Maya gave the answer, so understanding stays uncertain.", allowedNow);
        }
        s.understanding = p.understanding;
      }
      s.writeAsked = true;
      if (s.state !== "TIME_CLOSE") moveTo(s, "WRITE_CLOSE");
      break;
    case "close":
      break;
    case "safety":
      // The guidance is code's policy message, never the model's words.
      text = SAFETY_GUIDANCE[s.safety.severity!];
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

  // 6. Committed: the reading counts now (its answers only when they were judged).
  if (reading.correctsHearing) s.mishearing.corrections += 1;
  if (reading.paper) s.paper = reading.paper === "written" ? "child_confirmed" : "declined";
  if (scoring) {
    if (failed) s.stuckStep ??= ladder.step;
    for (const { answer: a, problem } of checked) {
      if (problem === "target" && a.step === "result") s.lastResult = a.verdict;
    }
    s.done = done;
    s.ladder = ladder;
  }
  if (p.act !== "confirm" && p.act !== "offer_other_input") {
    s.confirmTries = 0;
    s.offeredOtherInput = false;
  }
  s.boardRoles = { ...s.boardRoles, ...roles };
  s.turn = null;

  if (text !== "") {
    effects.push({ kind: "say", act: p.act, text });
    s.turns.push({ at: s.now!, speaker: "maya", text, state: p.act === "close" ? "CLOSE" : s.state, act: p.act });
  }
  if (p.board) {
    s.batches += 1;
    effects.push({ kind: "board", batch: { transactionId: `${s.callId}-b${s.batches}`, commands: p.board } });
  }

  if (p.act === "close") {
    end(s, closeCause(base), effects, false);
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

/**
 * Checks the child's answers: each was said and kept in this turn (after anything taken back, not offered as a choice;
 * a final answer is the last number kept), and each verdict is what code computes. Fills `checked`; returns the first
 * problem.
 */
function checkAnswers(s: Session, answers: ChildAnswer[], checked: Checked[]): { code: RefusalCode; reason: string } | null {
  const pkg = s.package!;
  if (!s.turn) return { code: "answer_not_heard", reason: "There is no child turn to read an answer from." };
  const committed = committedText(s.turn.text);
  if (offersChoice(committed)) return { code: "answer_not_committed", reason: "The child offered more than one answer: ask which one they mean." };
  const heard = valuesIn(committed);
  for (const a of answers) {
    const problem = a.problem ?? "target";
    const { operation, steps, answer } = problemOf(pkg, problem);
    const at = steps.find((x) => x.id === a.step);
    if (!at) return { code: "wrong_step", reason: `The ${problem} has no step "${a.step}".` };
    if (!heard.some((v) => saidAs(v, a.value))) return { code: "answer_not_heard", reason: `The child did not say ${valueText(a.value)}, or took it back.` };
    if (a.step === "result" && !saidAs(heard[heard.length - 1], a.value)) {
      return { code: "answer_not_committed", reason: `${valueText(a.value)} is not the last answer the child kept: ask which one they mean.` };
    }
    const right = a.step === "result" ? isRightAnswer(operation, answer, a.value) : stepAnswers(at).some((v) => equivalent(v, a.value));
    if (a.verdict === "right" && !right) return { code: "accepts_wrong_answer", reason: `${valueText(a.value)} is not right for ${a.step}: the checked math says otherwise.` };
    if (a.verdict === "wrong" && right) return { code: "rejects_right_answer", reason: `${valueText(a.value)} is right for ${a.step}.` };
    checked.push({ answer: a, problem });
  }
  return null;
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
  if (before.turn?.stop) return "child_stopped";
  if (before.silence === "close_due") return "no_response";
  if (before.state === "TIME_CLOSE") return "time_limit";
  if (before.state === "CONFIRM_HEARD") return "technical_issue";
  return "child_stopped";
}

/** When the call ended, or ends now: never after the 10-minute limit. */
const endTime = (s: Session) => Math.min(s.now!, (s.startedAt ?? s.now!) + TIME_LIMITS.endAtMs);

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

/** The text a board batch writes: `write` texts and `put` values. */
const boardTexts = (board: unknown[]) =>
  (board as Partial<Command>[]).flatMap((c) => ("text" in c && typeof c.text === "string" ? [c.text] : "value" in c && typeof c.value === "string" ? [c.value] : []));

/**
 * Maya's words or board would give the final answer: she says it (unless it is one of the question's own numbers, as
 * in 66 + 0), states the question's equation, or fills the answer row of the question's board in its highest place.
 */
function revealsAnswer(s: Session, p: Proposal): boolean {
  const pkg = s.package!;
  const answer = pkg.answer.value;
  const operands = operandsOf(pkg.operation);
  const texts = [p.say, ...boardTexts(p.board ?? [])];
  const ownNumber = operands.some((n) => equivalent(number(n), answer));
  if (!ownNumber && texts.some((t) => valuesIn(t).some((v) => equivalent(v, answer)))) return true;
  const symbol = SYMBOL[pkg.operation.kind];
  const sameTerms = (terms: number[]) => terms.length === 2 &&
    ((terms[0] === operands[0] && terms[1] === operands[1]) || ((symbol === "+" || symbol === "×") && terms[0] === operands[1] && terms[1] === operands[0]));
  if (texts.flatMap(equationsIn).some((e) => e.ops[0] === symbol && sameTerms(e.terms))) return true;
  const highest = answer.type === "number" ? PLACE_NAMES[String(Math.trunc(Math.abs(answer.value))).length - 1] : undefined;
  return (p.board ?? []).some((raw) => {
    const c = raw as Partial<Command>;
    if (c.op !== "put" || !isObject(c.target)) return false;
    const t = c.target as Target;
    if (s.boardRoles[t.objectId] !== "target" && !createsTarget(p, t.objectId)) return false;
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
    if ((c.op === "columns" || c.op === "write") && typeof c.id === "string") {
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
      const owner = typeof writesOn === "string" ? created[writesOn] ?? s.boardRoles[writesOn] : undefined;
      if (owner === undefined) return `Maya has no board object "${String(writesOn)}".`;
      if (owner !== role) return `This turn is about ${name}: it does not write on the other problem's board.`;
    }
  }
  return created;
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
