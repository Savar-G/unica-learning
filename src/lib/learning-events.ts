// Learning events (#302, spec #295): the events part of the learning record. One record shape for every signal about a
// child's learning: Maya's calls write them now, marked pages later, and a finished assessment's answers can be written
// as events today (src/lib/learning-events-assessment.ts). An event names the child, where it came from, the question
// (the question package's reference, src/lib/question-package.ts: a workbook page and question, or an assessment
// question), the skill, the result, the step where the child got stuck, the mistake, the hints, the time spent, when it
// happened and its evidence (the call, the scan or the answer).
//
// Append only: every raw event is kept as written; none is changed, merged or filtered at write time. Reads are by
// child and time range; the later per-child profile reads them, never a parent. A retried write of the same logical
// event stores one event: the writer gives each event an idempotency key, and an append of a stored key gives back the
// stored event (created: false). A key reused for a different event is refused (key_conflict) and the first is kept.
//
// The result, for each source:
// - right: the child gave the right answer with no help.
// - right_with_help: the child reached the right answer after help (in a call: a hint, or Maya working a step with the
//   child). It is not yet secure: the profile build counts it so (#295 story 12).
// - wrong: the child's final answer is wrong. The mistake is the cause id of the question's known wrong answer the
//   child gave (WrongAnswer.cause, "O3"), or null when it matches none.
// - blank: no final answer. In marking, the answer space is empty. In a call, a question the call left unfinished (the
//   child stopped, or the call ended before an answer) is blank, with the step where the child stopped as the stuck
//   step and the hints given so far; a wrong answer said during the call that the child then left is still blank, as
//   only the final answer counts.
// - A related question after a call (#1144): right on the child's own; right_with_help after hints, a demonstration or
//   help nobody confirmed; blank when unfinished. Its help is in `assistance`. It names the call question's event
//   (`question.relatedEventId`), never a workbook or assessment question, and the child profile does not count it.
// - A call's checked lesson observations (#1145): each check code made of the child's response in the call's lesson (the
//   prerequisite "identify_tens", the misconception "reversal", the work steps), with its help and whether the blocks
//   were on the board. The child profile reads them as teaching evidence (src/lib/child-profile-teaching.ts).
// The stuck step is the worked step id (WorkedStep.id, "tens") where the child got stuck; a right answer with no help
// has none, and only a wrong answer has a mistake.
//
// Times are ISO strings with a time zone; the record keeps them in UTC. A range is from its start (included) to its end
// (not included). Ids are UUIDs, kept in lower case as Postgres gives them. The store seam (LearningEventStore) has two adapters: Supabase
// (src/lib/learning-events-store.ts, the secret key) and in memory (src/lib/learning-events-memory.ts).
// Pure TypeScript: no Next.js, React, network, database or clock.
import { BC_SKILL_MAP } from "@/lib/assessment";
import type { QuestionRef } from "@/lib/question-package";

/** Where an event came from: a call with Maya, a marked page, or the assessment. */
export type EventSource = "call" | "marking" | "assessment";
/** The result of the child's work on the question (see the header for each source). */
export type EventResult = "right" | "wrong" | "blank" | "right_with_help";
/** What the evidence id names: a call, a scan of a page, or an answer of a test (public.answers). */
export type EvidenceKind = "call" | "scan" | "answer";

/**
 * A related question Maya generated after the call's question (#1144): never a workbook or assessment question. It
 * names the learning event of the call's question it follows (the same child's) and its own text ("63 - 27 = ?").
 */
export interface TransferQuestionRef {
  source: "transfer";
  relatedEventId: string;
  text: string;
}
/** The question an event is about. */
export type EventQuestion = QuestionRef | TransferQuestionRef;
/** The values of public.learning_events.question_source. */
export const QUESTION_SOURCES = ["workbook", "assessment", "transfer"] as const;
/** The help on a related question: uncertain when some voice help may have played but no source confirmed it. */
export const TRANSFER_ASSISTANCE = ["independent", "hinted", "demonstrated", "uncertain"] as const;
export type TransferAssistance = (typeof TRANSFER_ASSISTANCE)[number];
/** The checked lesson steps a call can observe (#1145): the regrouping lesson's prerequisite, misconception and work checks. */
export const OBSERVED_SKILLS = ["identify_tens", "explain_exchange", "perform_exchange", "subtract_ones", "subtract_tens", "difference", "reversal"] as const;
export type ObservedSkill = (typeof OBSERVED_SKILLS)[number];
/** At most this many observations on one event. */
export const MAX_OBSERVATIONS = 20;

/**
 * One checked observation of a call's lesson (#1145), in the order the call made them: what code checked in the child's
 * response, whether it was correct, the help the child had by then, and whether the base-ten blocks were on the board
 * (`board`: the representation the child worked with). Code reads it from the lesson, never from a model.
 */
export interface LessonObservation {
  skill: ObservedSkill;
  result: "correct" | "incorrect";
  assistance: TransferAssistance;
  board: boolean;
}

export interface NewLearningEvent {
  /** The writer's id for this logical event, the same on every retry ("assessment-answer:<answer id>"). */
  key: string;
  parentId: string;
  childId: string;
  source: EventSource;
  question: EventQuestion;
  /** A BC standard code ("2.4") and the ids of its smaller skills in the BC skill map, as the question package names them. */
  skill: { standard: string; skills: string[] };
  result: EventResult;
  /** The worked step id where the child got stuck ("tens"), or null. */
  stuckStep: string | null;
  /** The cause id of the known wrong answer the child gave ("O3"), or null. Only on a wrong answer. */
  mistake: string | null;
  /** Hints given, 0 to MAX_HINTS. */
  hints: number;
  /** Time spent on the question in milliseconds, at most MAX_TIME_MS, or null when not known. */
  timeMs: number | null;
  /** When it happened: an ISO time with a time zone; stored in UTC. */
  occurredAt: string;
  evidence: { kind: EvidenceKind; id: string } | null;
  /** Only on a related question (#1144): the help the child had. Its result never makes a standard secure by itself. */
  assistance?: TransferAssistance;
  /** Only from a call (#1145): the lesson's checked observations for this question, 1 to MAX_OBSERVATIONS. */
  observations?: LessonObservation[];
}

export interface LearningEvent extends NewLearningEvent {
  id: string;
  /**
   * Only on a marked page's effective event in memory (effectiveMarkingEvents, src/lib/scan-marking.ts), never stored:
   * whether anyone helped with the math (#1145). A stored marking event read without the projection has none: unknown.
   */
  markedHelp?: "none" | "math-help" | "unknown";
}

export type AppendResult =
  | { ok: true; created: boolean; event: LearningEvent }
  | { ok: false; error: "invalid"; reason: string }
  | { ok: false; error: "key_conflict"; event: LearningEvent }
  /** The child is not under that parent, or the test is another child's, or the family's deletion is requested. */
  | { ok: false; error: "family_refused"; reason: string };

/** From (included) to (not included), ISO times with a time zone. */
export interface TimeRange {
  from: string;
  to: string;
}

/** The store seam. The module checks every event before it calls insert, and every range before range. */
export interface LearningEventStore {
  /**
   * Stores the event, unless an event with its key is stored: then gives that one (created: false) and stores nothing.
   * Refuses an event whose child is not under its parent, whose test is another child's, or whose family's deletion is
   * requested (the family write fence).
   */
  insert(event: NewLearningEvent): Promise<{ created: boolean; event: LearningEvent } | { refused: string }>;
  /** One child's events in the range, by time and then id. */
  range(childId: string, range: TimeRange): Promise<LearningEvent[]>;
}

export interface LearningEvents {
  append(event: NewLearningEvent): Promise<AppendResult>;
  /** One child's events in the range, oldest first. Throws a RangeError for a range that does not end after it starts. */
  read(childId: string, range: TimeRange): Promise<LearningEvent[]>;
}

export function learningEvents(store: LearningEventStore): LearningEvents {
  return {
    async append(input) {
      const checked = checkEvent(input);
      if (typeof checked === "string") return { ok: false, error: "invalid", reason: checked };
      const inserted = await store.insert(checked);
      if ("refused" in inserted) return { ok: false, error: "family_refused", reason: inserted.refused };
      const { created, event: stored } = inserted;
      if (!created && !sameEvent(stored, checked)) return { ok: false, error: "key_conflict", event: stored };
      return { ok: true, created, event: stored };
    },
    async read(childId, range) {
      const [from, to] = [utc(range.from), utc(range.to)];
      if (!from || !to || from >= to) throw new RangeError(`learning events: the range ${range.from} to ${range.to} does not end after it starts`);
      return UUID.test(childId) ? store.range(childId.toLowerCase(), { from, to }) : [];
    },
  };
}

/** The event's content in a fixed order, with its time in one form, so two writes of one event compare equal. */
function content(e: NewLearningEvent) {
  const q = e.question;
  return [
    e.key, e.parentId, e.childId, e.source,
    q.source === "workbook" ? [q.source, q.workbookId, q.page, q.question]
      : q.source === "assessment" ? [q.source, q.assessmentId, q.questionId] : [q.source, q.relatedEventId, q.text],
    e.skill.standard, e.skill.skills, e.result, e.stuckStep, e.mistake, e.hints, e.timeMs, new Date(e.occurredAt).toISOString(),
    e.evidence && [e.evidence.kind, e.evidence.id], e.assistance ?? null,
    (e.observations ?? []).map((o) => [o.skill, o.result, o.assistance, o.board]),
  ];
}

const sameEvent = (a: NewLearningEvent, b: NewLearningEvent) => JSON.stringify(content(a)) === JSON.stringify(content(b));

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** An ISO time with its time zone ("Z" or an offset). */
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/;
const SOURCES: readonly EventSource[] = ["call", "marking", "assessment"];
const RESULTS: readonly EventResult[] = ["right", "wrong", "blank", "right_with_help"];
const EVIDENCE: readonly EvidenceKind[] = ["call", "scan", "answer"];
const STANDARDS = new Set(BC_SKILL_MAP.standards.map((s) => s.code));
const SKILLS = new Set(BC_SKILL_MAP.standards.flatMap((s) => s.skills.map((k) => k.id)));
export const MAX_HINTS = 100;
/** The longest time a question can take: a day. */
export const MAX_TIME_MS = 86_400_000;

/** The time in one form (UTC, milliseconds), or null when it is not an ISO time with its time zone. */
function utc(time: unknown): string | null {
  if (typeof time !== "string" || !ISO_TIME.test(time)) return null;
  const ms = Date.parse(time);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

const text = (v: unknown, max: number): v is string => typeof v === "string" && v.length >= 1 && v.length <= max && !/[\u0000-\u001f]/.test(v);
const whole = (v: unknown, min: number, max: number): v is number => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;

/** The reference with its id in lower case. The reference must be valid (questionProblem). */
const lowerRef = (q: EventQuestion): EventQuestion => (q.source === "workbook" ? { ...q, workbookId: q.workbookId.toLowerCase() }
  : q.source === "assessment" ? { ...q, assessmentId: q.assessmentId.toLowerCase() } : { ...q, relatedEventId: q.relatedEventId.toLowerCase() });

function questionProblem(q: EventQuestion): string | null {
  if (q?.source === "transfer") {
    if (!UUID.test(String(q.relatedEventId))) return "a related question needs the event of the question it follows";
    return text(q.text, 80) ? null : "a related question needs its text";
  }
  if (q?.source === "workbook") {
    if (!UUID.test(String(q.workbookId))) return "a workbook question needs the workbook's id";
    if (!whole(q.page, 1, 9999) || !whole(q.question, 1, 9999)) return "a workbook question needs a page number and a question number from 1";
    return null;
  }
  if (q?.source === "assessment") {
    if (!UUID.test(String(q.assessmentId))) return "an assessment question needs the test's id";
    return text(q.questionId, 40) ? null : "an assessment question needs its question id";
  }
  return "the question reference is not a workbook or an assessment question";
}

/** The event as the record keeps it (its ids in lower case, its time in UTC), or why it cannot be kept. */
function checkEvent(e: NewLearningEvent): NewLearningEvent | string {
  if (!text(e.key, 200)) return "the idempotency key must be 1 to 200 characters";
  if (!UUID.test(String(e.parentId)) || !UUID.test(String(e.childId))) return "the parent and the child need their ids";
  if (!SOURCES.includes(e.source)) return `unknown source ${e.source}`;
  const question = questionProblem(e.question);
  if (question) return question;
  if (e.source === "assessment" && e.question.source !== "assessment") return "an assessment event is on an assessment question";
  const related = e.question.source === "transfer";
  if (related && (e.source !== "call" || e.evidence?.kind !== "call")) return "a related question comes from a call";
  if (related !== (e.assistance !== undefined) || (related && !TRANSFER_ASSISTANCE.includes(e.assistance!))) return "only a related question has its help";
  if (!STANDARDS.has(e.skill?.standard)) return `the BC skill map has no standard ${e.skill?.standard}`;
  if (!Array.isArray(e.skill.skills) || e.skill.skills.length > 20 || !e.skill.skills.every((k) => SKILLS.has(k))) return "every skill must be a skill of the BC skill map";
  if (!RESULTS.includes(e.result)) return `unknown result ${e.result}`;
  if (e.mistake !== null && (e.result !== "wrong" || !text(e.mistake, 40))) return "only a wrong answer has a mistake (a cause id)";
  if (e.stuckStep !== null && (e.result === "right" || !text(e.stuckStep, 40))) return "a right answer with no help has no stuck step";
  if (!whole(e.hints, 0, MAX_HINTS)) return `hints must be a whole number from 0 to ${MAX_HINTS}`;
  if (e.timeMs !== null && !whole(e.timeMs, 0, MAX_TIME_MS)) return "the time spent must be a whole number of milliseconds, at most a day";
  const occurredAt = utc(e.occurredAt);
  if (!occurredAt) return "the time it happened must be an ISO time with its time zone";
  if (e.evidence !== null && (!EVIDENCE.includes(e.evidence?.kind) || !text(e.evidence.id, 100))) return "the evidence needs its kind and its id";
  const observed = e.observations === undefined ? null : observationsProblem(e);
  if (observed) return observed;
  return { ...e, parentId: e.parentId.toLowerCase(), childId: e.childId.toLowerCase(), question: lowerRef(e.question), occurredAt };
}

function observationsProblem(e: NewLearningEvent): string | null {
  const list = e.observations;
  if (e.source !== "call" || !Array.isArray(list) || list.length < 1 || list.length > MAX_OBSERVATIONS) return `only a call has observations, 1 to ${MAX_OBSERVATIONS}`;
  const fine = list.every((o) => typeof o === "object" && o !== null && Object.keys(o).length === 4 && OBSERVED_SKILLS.includes(o.skill) &&
    (o.result === "correct" || o.result === "incorrect") && TRANSFER_ASSISTANCE.includes(o.assistance) && typeof o.board === "boolean");
  return fine ? null : "each observation needs a known skill, its result, its help and whether the board showed the blocks";
}
