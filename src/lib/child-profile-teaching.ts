// The child's teaching evidence (#1145, spec #1137 section 4): the part of the versioned child profile
// (src/lib/child-profile.ts) that tells Maya's next lesson how to teach, built by code from the child's learning events
// on every rebuild. It is not a second memory: nothing here is stored apart from the profile, and a rebuild replaces it.
//
// From the events (src/lib/learning-events.ts):
// - Prerequisite evidence: a call lesson's checked "identify_tens" observation (how many tens a number has, the
//   prerequisite of a regrouping subtraction). Only the child's own answers diagnose: help is not evidence either way.
//   After the child's newest own correct answer, one own error leaves the view "unsure" (a single error is never a
//   durable diagnosis), two errors in different events make it a "gap"; with no error since that correct answer, it is
//   "secure". So new independent evidence revises the view both ways.
// - Misconceptions: a call lesson's "reversal" observation (the child took the top digit from the bottom one), and a
//   marked page's known wrong answer (its cause id, "O3"). After the child's newest own right answer on the standard,
//   one event "suspected", two or more "likely"; none since that right answer "resolved".
// - Representations: the lesson's correct observations with the base-ten blocks on the board ("blocks") or without
//   ("words"). "helped" when the newest observation with it is correct, "not_yet" otherwise.
// - Review targets: a standard right only with help since its newest own right answer, a related question (#1144)
//   not done on the child's own, a prerequisite gap, a likely misconception. `route` is the existing route of each
//   later review: "workbook_plan" when the standard is not yet secure (the workbook planner already reviews it,
//   src/lib/workbook-plan.ts), else "next_call" (only Maya's next call reads it). No new scheduler exists.
// Each note has the source and time of each piece of evidence (the newest MAX_EVIDENCE), `since` (its newest
// evidence) and `uncertainty`: high from one piece, medium from two or three, low from more.
// Pure TypeScript: no Next.js, React, network, database or clock.
import type { LearningEvent, ObservedSkill, TransferAssistance } from "@/lib/learning-events";

/** The newest pieces of evidence a note keeps. */
export const MAX_EVIDENCE = 6;

export type Uncertainty = "high" | "medium" | "low";
export type EvidenceSource = "call" | "transfer" | "marking" | "assessment";

/** One piece of a note's evidence: the learning event, where it came from, when, and what it showed. */
export interface TeachingEvidence {
  event: string;
  source: EvidenceSource;
  at: string;
  result: "correct" | "incorrect";
  /** The help the child had; null when the source does not say (a marked page, a test answer). */
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
  | { kind: "prerequisite"; id: "identify_tens"; view: "unsure" | "gap" | "secure" }
  | { kind: "misconception"; id: string; view: "suspected" | "likely" | "resolved" }
  | { kind: "representation"; id: "blocks" | "words"; view: "helped" | "not_yet" }
);

export interface ReviewTarget {
  standard: string;
  reason: "assisted_only" | "transfer_not_independent" | "prerequisite_gap" | "misconception";
  since: string;
  /** The events that show it, oldest first. */
  events: string[];
  route: "workbook_plan" | "next_call";
}

export interface TeachingEvidenceSummary {
  /** By standard and kind, in the order the events first showed them. */
  notes: TeachingNote[];
  reviews: ReviewTarget[];
}

const sourceOf = (e: LearningEvent): EvidenceSource => (e.question.source === "transfer" ? "transfer" : e.source);
const piece = (e: LearningEvent, result: TeachingEvidence["result"], assistance: TransferAssistance | null): TeachingEvidence =>
  ({ event: e.id, source: sourceOf(e), at: e.occurredAt, result, assistance });
const uncertaintyOf = (pieces: number): Uncertainty => (pieces <= 1 ? "high" : pieces <= 3 ? "medium" : "low");
const distinct = (pieces: readonly TeachingEvidence[]) => new Set(pieces.map((p) => p.event)).size;
const lastIndex = <T>(list: readonly T[], test: (item: T) => boolean) => list.reduce((at, item, i) => (test(item) ? i : at), -1);

/** The child's own right answer on the question: a call or related question right with no help, or a right marked or test answer. */
const ownRight = (e: LearningEvent) => e.result === "right" && (e.question.source !== "transfer" || e.assistance === "independent");

/** Each checked observation of the events, with its event, in event order. */
function observed(events: readonly LearningEvent[], skill: ObservedSkill) {
  return events.flatMap((e) => (e.observations ?? []).filter((o) => o.skill === skill).map((o) => ({ e, o })));
}

function prerequisite(standard: string, events: readonly LearningEvent[]): TeachingNote | null {
  const seen = observed(events, "identify_tens");
  if (seen.length === 0) return null;
  const own = seen.filter(({ o }) => o.assistance === "independent");
  const lastRight = lastIndex(own, ({ o }) => o.result === "correct");
  const errors = own.slice(lastRight + 1).map(({ e, o }) => piece(e, o.result, o.assistance));
  const view = distinct(errors) >= 2 ? "gap" : errors.length > 0 || lastRight < 0 ? "unsure" : "secure";
  const evidence = seen.map(({ e, o }) => piece(e, o.result, o.assistance)).slice(-MAX_EVIDENCE);
  const deciding = view === "gap" ? distinct(errors) : view === "secure" ? distinct(own.filter(({ o }) => o.result === "correct").map(({ e, o }) => piece(e, o.result, o.assistance))) : 1;
  return { kind: "prerequisite", id: "identify_tens", standard, view, uncertainty: uncertaintyOf(deciding), since: evidence.at(-1)!.at, evidence };
}

function misconceptions(standard: string, events: readonly LearningEvent[]): TeachingNote[] {
  const found = new Map<string, { e: LearningEvent; assistance: TransferAssistance | null }[]>();
  const add = (id: string, e: LearningEvent, assistance: TransferAssistance | null) => found.set(id, [...(found.get(id) ?? []), { e, assistance }]);
  for (const e of events) {
    if (e.mistake) add(e.mistake, e, null);
    for (const o of e.observations ?? []) if (o.skill === "reversal" && o.result === "incorrect") add("reversal", e, o.assistance);
  }
  return [...found].map(([id, shown]): TeachingNote => {
    const last = shown.at(-1)!.e;
    const after = events.slice(events.indexOf(last) + 1);
    const fixed = after.filter(ownRight).at(-1);
    const since = events.slice(lastIndex(events, ownRight) + 1);
    const open = new Set(shown.filter(({ e }) => since.includes(e)).map(({ e }) => e.id)).size;
    const view = fixed ? "resolved" : open >= 2 ? "likely" : "suspected";
    const evidence = [...shown.map(({ e, assistance }) => piece(e, "incorrect", assistance)), ...(fixed ? [piece(fixed, "correct", fixed.assistance ?? null)] : [])].slice(-MAX_EVIDENCE);
    return { kind: "misconception", id, standard, view, uncertainty: uncertaintyOf(fixed ? 1 : open), since: evidence.at(-1)!.at, evidence };
  });
}

function representations(standard: string, events: readonly LearningEvent[]): TeachingNote[] {
  const work = events.flatMap((e) => (e.observations ?? []).filter((o) => o.skill !== "identify_tens").map((o) => ({ e, o })));
  return (["blocks", "words"] as const).flatMap((id): TeachingNote[] => {
    const mine = work.filter(({ o }) => o.board === (id === "blocks"));
    const right = mine.filter(({ o }) => o.result === "correct");
    if (right.length === 0) return [];
    const evidence = mine.map(({ e, o }) => piece(e, o.result, o.assistance)).slice(-MAX_EVIDENCE);
    const view = mine.at(-1)!.o.result === "correct" ? "helped" : "not_yet";
    return [{ kind: "representation", id, standard, view, uncertainty: uncertaintyOf(right.length), since: evidence.at(-1)!.at, evidence }];
  });
}

function reviews(standard: string, events: readonly LearningEvent[], notes: readonly TeachingNote[], secure: boolean): ReviewTarget[] {
  const route = secure ? "next_call" : "workbook_plan";
  const target = (reason: ReviewTarget["reason"], shown: readonly LearningEvent[]): ReviewTarget =>
    ({ standard, reason, since: shown.at(-1)!.occurredAt, events: [...new Set(shown.map((e) => e.id))], route });
  const out: ReviewTarget[] = [];
  const own = events.filter((e) => e.question.source !== "transfer");
  const helped = own.slice(lastIndex(own, ownRight) + 1).filter((e) => e.result === "right_with_help");
  if (helped.length > 0) out.push(target("assisted_only", helped));
  const related = events.filter((e) => e.question.source === "transfer").at(-1);
  if (related && !ownRight(related)) out.push(target("transfer_not_independent", [related]));
  const byId = new Map(events.map((e) => [e.id, e]));
  const shownBy = (note: TeachingNote) => note.evidence.filter((p) => p.result === "incorrect").map((p) => byId.get(p.event)!);
  for (const note of notes) {
    if (note.kind === "prerequisite" && note.view === "gap") out.push(target("prerequisite_gap", shownBy(note)));
    if (note.kind === "misconception" && note.view === "likely") out.push(target("misconception", shownBy(note)));
  }
  return out;
}

/**
 * The teaching evidence of the child's events, oldest first, by BC standard. `secure`: the profile's secure standards
 * (the route of a review). Assessment answers the profile already counts may be left out by the caller.
 */
export function teachingEvidence(events: readonly LearningEvent[], secure: readonly string[]): TeachingEvidenceSummary {
  const standards = [...new Set(events.map((e) => e.skill.standard))];
  const notes: TeachingNote[] = [];
  const out: ReviewTarget[] = [];
  for (const standard of standards) {
    const mine = events.filter((e) => e.skill.standard === standard);
    const own = [prerequisite(standard, mine), ...misconceptions(standard, mine), ...representations(standard, mine)].filter((n): n is TeachingNote => n !== null);
    notes.push(...own);
    out.push(...reviews(standard, mine, own, secure.includes(standard)));
  }
  return { notes, reviews: out };
}
