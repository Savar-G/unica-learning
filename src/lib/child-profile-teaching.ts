// The child's teaching evidence (#1145, spec #1137 section 4): the part of the versioned child profile
// (src/lib/child-profile.ts) that tells Maya's next lesson how to teach, built by code from the child's learning events
// on every rebuild. It is not a second memory: nothing here is stored apart from the profile, and a rebuild replaces it.
//
// The events are read in time order; a related question (#1144) shares its call's end time and comes after its call.
// One call is one occasion: its question and its related question together never count twice. The child's own work is
// a call's right answer (code credits it only with no help), a related question right with no help, a marked right
// answer nobody helped with (`markedHelp` "none" from the marking projection; unknown help is not the child's own), and
// a test's right answer.
// - Prerequisite evidence: a call lesson's checked "identify_tens" observation (how many tens a number has, the
//   prerequisite of a regrouping subtraction). Only the child's own answers to that check diagnose: help is not evidence
//   either way, and a right whole answer is evidence for the subtraction, not for the tens (it may come from memory or
//   counting up). After the child's newest own correct tens answer, one own error leaves the view "unsure" (a single
//   error is never a durable diagnosis), errors in two calls make it a "gap"; with no error since, it is "secure". So
//   new independent evidence revises the view both ways. `recheck`: since the gap's last error the child worked with the
//   blocks or with help, so the next call checks the tens again on the child's own.
// - Misconceptions: a call lesson's "reversal" observation (the child took the top digit from the bottom one), and a
//   marked page's known wrong answer (its cause id, "O3"). After the child's newest own work that shows otherwise (an own
//   right answer on the standard, or for "reversal" an own correct ones column or difference), one call "suspected",
//   two or more "likely"; such own work after the last mistake "resolved".
// - Representations: the lesson's correct work observations with the base-ten blocks on the board ("blocks") or
//   without ("words"). "helped" when the newest observation with it is correct, "not_yet" otherwise.
// - Review targets: a standard right only with help since its newest own right answer, a related question not done on
//   the child's own, a prerequisite gap, a likely misconception; each with its sources, uncertainty and route. Routes
//   are existing ones. "workbook_plan": the workbook planner reviews the standard (src/lib/workbook-plan.ts): it is not
//   secure, or the target is a gap or a likely misconception, which the placement hands to the planner as not secure
//   (src/lib/workbook-placement.ts). "next_call": only Maya's next call reads it (the brief): a standard above the
//   school grade (never a weakness, D-084), one the profile has no tally for, or help-only work on a secure standard.
//   No new scheduler exists.
// Each note keeps the evidence that decided its view and the newest other pieces, at most MAX_EVIDENCE, oldest first;
// `since` is its newest evidence and `uncertainty` is high from one occasion, medium from two or three, low from more.
// The teaching brief (teachingBrief): the compact part of one standard's evidence that Maya's next call reads at its start
// (src/lib/maya-call.ts, the `brief` seam): the prerequisite's view and recheck, whether the blocks helped, the open
// misconceptions and the review reasons. The lesson's first step after a stuck child follows it, and a likely reversal
// adds a reminder to the first ones step (stuckStart, src/lib/maya/checked-exchange.ts).
// Pure TypeScript: no Next.js, React, network, database or clock.
import type { LearningEvent, LessonObservation, TransferAssistance } from "@/lib/learning-events";
import type { LessonBrief } from "@/lib/maya/checked-exchange";

/** The most pieces of evidence a note keeps. */
export const MAX_EVIDENCE = 6;

export type Uncertainty = "high" | "medium" | "low";
export type EvidenceSource = "call" | "transfer" | "marking" | "assessment";

/** One piece of a note's evidence: the learning event, where it came from, when, and what it showed. */
export interface TeachingEvidence {
  event: string;
  source: EvidenceSource;
  at: string;
  result: "correct" | "incorrect";
  /** The help the child had; null when the source does not say (a test answer, a mark with unknown help). */
  assistance: TransferAssistance | null;
}

export type TeachingNote = {
  standard: string;
  uncertainty: Uncertainty;
  /** The time of the newest evidence. */
  since: string;
  /** Oldest first. */
  evidence: TeachingEvidence[];
} & (
  | { kind: "prerequisite"; id: "identify_tens"; view: "unsure" | "gap" | "secure"; recheck: boolean }
  | { kind: "misconception"; id: string; view: "suspected" | "likely" | "resolved" }
  | { kind: "representation"; id: "blocks" | "words"; view: "helped" | "not_yet" }
);

export interface ReviewTarget {
  standard: string;
  reason: "assisted_only" | "transfer_not_independent" | "prerequisite_gap" | "misconception";
  since: string;
  /** The events that show it, oldest first. */
  events: string[];
  /** Where those events came from, each once. */
  sources: EvidenceSource[];
  uncertainty: Uncertainty;
  route: "workbook_plan" | "next_call";
}

export interface TeachingEvidenceSummary {
  /** By standard and kind, in the order the events first showed them. */
  notes: TeachingNote[];
  reviews: ReviewTarget[];
}

/** What a review's route reads about a standard in the profile. */
export interface StandardTally {
  code: string;
  secure: boolean;
  aboveGrade: boolean;
}

type Seen = { e: LearningEvent; o: LessonObservation };

const sourceOf = (e: LearningEvent): EvidenceSource => (e.question.source === "transfer" ? "transfer" : e.source);
/** The help a marked page names, in the evidence's terms. */
const markHelp = (e: LearningEvent): TransferAssistance | null => (e.markedHelp === "none" ? "independent" : e.markedHelp === "math-help" ? "hinted" : null);
const piece = (e: LearningEvent, result: TeachingEvidence["result"], assistance: TransferAssistance | null): TeachingEvidence =>
  ({ event: e.id, source: sourceOf(e), at: e.occurredAt, result, assistance });
const pieceOf = ({ e, o }: Seen) => piece(e, o.result, o.assistance);
const uncertaintyOf = (occasions: number): Uncertainty => (occasions <= 1 ? "high" : occasions <= 3 ? "medium" : "low");
/** One call is one occasion, its related question included; any other event is its own. */
const occasion = (e: LearningEvent) => (e.evidence?.kind === "call" ? `call:${e.evidence.id}` : `event:${e.id}`);
const occasions = (events: readonly LearningEvent[]) => new Set(events.map(occasion)).size;
const lastIndex = <T>(list: readonly T[], test: (item: T) => boolean) => list.reduce((at, item, i) => (test(item) ? i : at), -1);
const unique = (events: readonly LearningEvent[]) => [...new Map(events.map((e) => [e.id, e])).values()];

/** The child's own right answer (see the header). */
function ownRight(e: LearningEvent): boolean {
  if (e.result !== "right") return false;
  if (e.question.source === "transfer") return e.assistance === "independent";
  return e.source !== "marking" || e.markedHelp === "none";
}

/** The events in time order; at the same time, a call's question before its related question, else as read. */
function inOrder(events: readonly LearningEvent[]): LearningEvent[] {
  const related = (e: LearningEvent) => (e.question.source === "transfer" ? 1 : 0);
  return events.map((e, i) => ({ e, i }))
    .sort((a, b) => Date.parse(a.e.occurredAt) - Date.parse(b.e.occurredAt) || related(a.e) - related(b.e) || a.i - b.i)
    .map(({ e }) => e);
}

/** The deciding pieces and the newest others, at most MAX_EVIDENCE, oldest first. */
function kept(all: readonly TeachingEvidence[], deciding: ReadonlySet<TeachingEvidence>): TeachingEvidence[] {
  const keep = new Set([...all].filter((p) => deciding.has(p)).slice(-MAX_EVIDENCE));
  for (const p of [...all].reverse()) if (keep.size < MAX_EVIDENCE) keep.add(p);
  return all.filter((p) => keep.has(p));
}

type Built = { note: TeachingNote; shownBy: LearningEvent[] };

function prerequisite(standard: string, events: readonly LearningEvent[]): Built | null {
  const all: Seen[] = events.flatMap((e) => (e.observations ?? []).map((o) => ({ e, o })));
  const seen = all.filter(({ o }) => o.skill === "identify_tens");
  if (seen.length === 0) return null;
  const own = seen.filter(({ o }) => o.assistance === "independent");
  const lastRight = lastIndex(own, ({ o }) => o.result === "correct");
  const errors = own.slice(lastRight + 1);
  const errorCalls = occasions(errors.map(({ e }) => e));
  const view = errorCalls >= 2 ? "gap" : errors.length > 0 || lastRight < 0 ? "unsure" : "secure";
  const deciding = view === "gap" ? errors : view === "secure" ? own.filter(({ o }) => o.result === "correct") : [seen.at(-1)!];
  // Blocks or help after the gap's last error: the next call checks the tens again on the child's own.
  const lastError = errors.at(-1);
  const recheck = view === "gap" && all.slice(all.indexOf(lastError!) + 1).some(({ o }) => o.board || o.assistance === "hinted" || o.assistance === "demonstrated");
  const pieces = seen.map(pieceOf);
  const evidence = kept(pieces, new Set(deciding.map((d) => pieces[seen.indexOf(d)])));
  return {
    note: { kind: "prerequisite", id: "identify_tens", standard, view, recheck, uncertainty: view === "unsure" ? "high" : uncertaintyOf(occasions(deciding.map(({ e }) => e))), since: evidence.at(-1)!.at, evidence },
    shownBy: view === "gap" ? errors.map(({ e }) => e) : [],
  };
}

function misconceptions(standard: string, events: readonly LearningEvent[]): Built[] {
  type Mark = { e: LearningEvent; assistance: TransferAssistance | null; at: number };
  const found = new Map<string, Mark[]>();
  events.forEach((e, at) => {
    const add = (id: string, assistance: TransferAssistance | null) => found.set(id, [...(found.get(id) ?? []), { e, assistance, at }]);
    if (e.mistake) add(e.mistake, markHelp(e));
    for (const o of e.observations ?? []) if (o.skill === "reversal" && o.result === "incorrect") add("reversal", o.assistance);
  });
  return [...found].map(([id, shown]): Built => {
    // The child's own work that shows otherwise: an own right answer, or for a reversal an own correct ones column or difference.
    const counter = (e: LearningEvent) => ownRight(e) || (id === "reversal" && (e.observations ?? []).some((o) =>
      (o.skill === "subtract_ones" || o.skill === "difference") && o.result === "correct" && o.assistance === "independent"));
    const lastCounter = lastIndex(events, counter);
    const fixed = lastCounter > shown.at(-1)!.at ? events[lastCounter] : null;
    const open = shown.filter((m) => m.at > lastCounter);
    const openCalls = occasions(open.map((m) => m.e));
    const view = fixed ? "resolved" : openCalls >= 2 ? "likely" : "suspected";
    const pieces = [...shown.map((m) => piece(m.e, "incorrect", m.assistance)), ...(fixed ? [piece(fixed, "correct", "independent")] : [])];
    const deciding = new Set(fixed ? [pieces.at(-1)!] : pieces.filter((_, i) => i < shown.length && shown[i].at > lastCounter));
    const evidence = kept(pieces, deciding);
    return {
      note: { kind: "misconception", id, standard, view, uncertainty: uncertaintyOf(fixed ? 1 : openCalls), since: evidence.at(-1)!.at, evidence },
      shownBy: view === "likely" ? open.map((m) => m.e) : [],
    };
  });
}

function representations(standard: string, events: readonly LearningEvent[]): Built[] {
  const work: Seen[] = events.flatMap((e) => (e.observations ?? []).filter((o) => o.skill !== "identify_tens").map((o) => ({ e, o })));
  return (["blocks", "words"] as const).flatMap((id): Built[] => {
    const mine = work.filter(({ o }) => o.board === (id === "blocks"));
    const right = mine.filter(({ o }) => o.result === "correct");
    if (right.length === 0) return [];
    const pieces = mine.map(pieceOf);
    const evidence = kept(pieces, new Set());
    const view = mine.at(-1)!.o.result === "correct" ? "helped" : "not_yet";
    return [{ note: { kind: "representation", id, standard, view, uncertainty: uncertaintyOf(right.length), since: evidence.at(-1)!.at, evidence }, shownBy: [] }];
  });
}

function reviews(standard: string, events: readonly LearningEvent[], built: readonly Built[], tally: StandardTally | undefined): ReviewTarget[] {
  const planned = !!tally && !tally.aboveGrade;
  const target = (reason: ReviewTarget["reason"], shown: readonly LearningEvent[]): ReviewTarget => {
    const own = unique(shown);
    // A gap or a likely misconception goes to the planner even on a secure standard; help-only work does not.
    const plan = planned && (!tally!.secure || reason === "prerequisite_gap" || reason === "misconception");
    return { standard, reason, since: own.at(-1)!.occurredAt, events: own.map((e) => e.id), sources: [...new Set(own.map(sourceOf))],
      uncertainty: uncertaintyOf(occasions(own)), route: plan ? "workbook_plan" : "next_call" };
  };
  const out: ReviewTarget[] = [];
  const questions = events.filter((e) => e.question.source !== "transfer");
  const helped = questions.slice(lastIndex(questions, ownRight) + 1).filter((e) => e.result === "right_with_help");
  if (helped.length > 0) out.push(target("assisted_only", helped));
  const related = events.filter((e) => e.question.source === "transfer").at(-1);
  if (related && !ownRight(related)) out.push(target("transfer_not_independent", [related]));
  for (const { note, shownBy } of built) {
    if (shownBy.length === 0) continue;
    out.push(target(note.kind === "prerequisite" ? "prerequisite_gap" : "misconception", shownBy));
  }
  return out;
}

/**
 * The teaching evidence of the child's events, by BC standard. `standards`: the profile's tally of each standard (a
 * review's route). Assessment answers the profile already counts may be left out by the caller.
 */
export function teachingEvidence(events: readonly LearningEvent[], standards: readonly StandardTally[]): TeachingEvidenceSummary {
  const ordered = inOrder(events);
  const notes: TeachingNote[] = [];
  const out: ReviewTarget[] = [];
  for (const standard of [...new Set(ordered.map((e) => e.skill.standard))]) {
    const mine = ordered.filter((e) => e.skill.standard === standard);
    const built = [prerequisite(standard, mine), ...misconceptions(standard, mine), ...representations(standard, mine)].filter((b): b is Built => b !== null);
    notes.push(...built.map((b) => b.note));
    out.push(...reviews(standard, mine, built, standards.find((s) => s.code === standard)));
  }
  return { notes, reviews: out };
}

/** The standards the workbook plan reviews because of the teaching evidence (route "workbook_plan"), for the placement. */
export function plannedReviews(teaching: TeachingEvidenceSummary | undefined): Set<string> {
  return new Set((teaching?.reviews ?? []).filter((r) => r.route === "workbook_plan").map((r) => r.standard));
}

/**
 * The compact brief of one standard for Maya's next call, from a read profile (readChildProfile); null when the profile
 * has no teaching evidence for it.
 */
export function teachingBrief(read: { revision: number; profile: { teaching: TeachingEvidenceSummary } }, standard: string): LessonBrief | null {
  const notes = read.profile.teaching.notes.filter((n) => n.standard === standard);
  const reviews = read.profile.teaching.reviews.filter((r) => r.standard === standard);
  if (notes.length === 0 && reviews.length === 0) return null;
  const prerequisite = notes.find((n) => n.kind === "prerequisite");
  const blocks = notes.find((n) => n.kind === "representation" && n.id === "blocks");
  return {
    standard,
    revision: read.revision,
    prerequisite: prerequisite?.kind === "prerequisite" ? prerequisite.view : null,
    ...(prerequisite?.kind === "prerequisite" && prerequisite.recheck ? { recheck: true } : {}),
    blocks: blocks?.kind === "representation" ? blocks.view : null,
    misconceptions: notes.flatMap((n) => (n.kind === "misconception" && n.view !== "resolved" ? [n.id] : [])),
    reviews: [...new Set(reviews.map((r) => r.reason))],
  };
}
