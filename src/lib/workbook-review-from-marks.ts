// Review-only scoring. The caller must bind each group and its marks to a validated frozen printed book first.
// This function never establishes mastery. It has no clock, store, network or side effects.
import { observationProblem, type ItemIdentity, type Observation, type TeachingReference } from "./scan-observation";
import { nextReview, SPACED_INTERVALS, type SpacedReview, type UnresolvedMiss } from "./workbook-plan";
import type { WorkbookQuestionRef } from "./question-package";

export interface PrintedReviewQuestion {
  identity: ItemIdentity;
  question: WorkbookQuestionRef;
  teaching: TeachingReference;
  /** Null means the printed question has no captured mark. */
  mark: null | { firstVersion: number; observation: Observation; event: string };
}
export type PrintedReviewEvidence = {
  /** The day the review was printed, in the next plan's practice-day coordinate system. */
  reviewDay: number;
  questions: readonly PrintedReviewQuestion[];
  /** A saved scheduled slot had no matching printed question. */
  missingPrinted?: boolean;
} & ({ review: SpacedReview } | { review: null; skill: string; step: number });
export interface ReviewHeld {
  skill: string;
  step: number;
  identity: ItemIdentity | null;
  reason: "no printed question" | "not marked" | "help";
}
export type ReviewFromMarksResult = { ok: false; reason: "invalid review evidence" } | {
  ok: true;
  reviews: SpacedReview[];
  missedReviews: SpacedReview[];
  misses: UnresolvedMiss[];
  consumed: { identity: ItemIdentity; firstVersion: number; effectiveVersion: number }[];
  held: ReviewHeld[];
};
const key = (i: ItemIdentity) => JSON.stringify([i.workbookId, i.printedRevision, i.pageId, i.itemId]);
const sameTeaching = (a: TeachingReference | null, b: TeachingReference) => !!a && a.curriculum.key === b.curriculum.key
  && a.curriculum.version === b.curriculum.version && a.part === b.part && a.slot === b.slot && a.practiceType === b.practiceType
  && a.itemStep?.unit === b.itemStep?.unit && a.itemStep?.skill === b.itemStep?.skill && a.itemStep?.step === b.itemStep?.step;

/** Put a source book day in the next book's practice-day coordinates. */
export function sourceReviewDay(day: number): number {
  if (!Number.isInteger(day) || day < 1 || day > 10) throw Error("invalid source day");
  return day - 10;
}

/** Score only actual printed questions. Unknown, blank and assisted work never supplies a pass or a miss. */
export function reviewInputsFromMarks(groups: readonly PrintedReviewEvidence[]): ReviewFromMarksResult {
  const invalid = (): ReviewFromMarksResult => ({ ok: false, reason: "invalid review evidence" });
  try {
    if (!Array.isArray(groups) || groups.length > 10000) return invalid();
    const reviews: SpacedReview[] = [], missedReviews: SpacedReview[] = [], misses: UnresolvedMiss[] = [];
    const consumed: Extract<ReviewFromMarksResult, { ok: true }>["consumed"] = [], held: ReviewHeld[] = [];
    const seenGroups = new Set<string>(), seenItems = new Set<string>();
    for (const g of groups) {
      const scheduled = g.review;
      const r: SpacedReview = g.review === null
        ? { skill: g.skill, step: g.step, interval: 0, due: g.reviewDay + SPACED_INTERVALS[0] } : g.review;
      if (!r || typeof r.skill !== "string" || !r.skill.trim() || !Number.isSafeInteger(r.step) || r.step < 1
        || !Number.isInteger(r.interval) || r.interval < 0 || r.interval > 3 || !Number.isSafeInteger(r.due)
        || !Number.isSafeInteger(g.reviewDay) || !Array.isArray(g.questions) || g.questions.length > 10000) return invalid();
      const groupKey = JSON.stringify([r.skill, r.step, r.interval, r.due, g.reviewDay]);
      if (seenGroups.has(groupKey)) return invalid();
      seenGroups.add(groupKey);
      let incomplete = false, wrong = false;
      if (!g.questions.length || g.missingPrinted) { held.push({ skill: r.skill, step: r.step, identity: null, reason: "no printed question" }); incomplete = true; }
      for (const q of g.questions) {
        if (!q?.identity || ![q.identity.workbookId, q.identity.printedRevision, q.identity.pageId, q.identity.itemId].every(x => typeof x === "string" && x.length > 0)
          || !q.teaching || q.teaching.itemStep?.skill !== r.skill || q.teaching.itemStep.step !== r.step
          || !q.question || q.question.source !== "workbook" || q.question.workbookId !== q.identity.workbookId
          || !Number.isSafeInteger(q.question.page) || q.question.page < 1 || !Number.isSafeInteger(q.question.question) || q.question.question < 1) return invalid();
        const k = key(q.identity);
        if (seenItems.has(k)) return invalid();
        seenItems.add(k);
        const m = q.mark;
        if (!m) { held.push({ skill: r.skill, step: r.step, identity: q.identity, reason: "not marked" }); incomplete = true; continue; }
        const o = m.observation;
        if (!o || observationProblem(o) || key(o.identity) !== k || !sameTeaching(o.teaching, q.teaching)
          || !Number.isSafeInteger(m.firstVersion) || m.firstVersion < 1
          || m.firstVersion > o.resultVersion || typeof m.event !== "string" || !m.event.trim()) return invalid();
        if (o.help !== "none") { held.push({ skill: r.skill, step: r.step, identity: q.identity, reason: "help" }); incomplete = true; continue; }
        if (!(o.state === "parent-checked" || o.state === "scored" && o.certainty === "certain") || o.result === null || o.result === "blank") {
          held.push({ skill: r.skill, step: r.step, identity: q.identity, reason: "not marked" }); incomplete = true; continue;
        }
        consumed.push({ identity: q.identity, firstVersion: m.firstVersion, effectiveVersion: o.resultVersion });
        if (o.result === "wrong") {
          wrong = true;
          misses.push({ skill: r.skill, question: q.question, event: m.event, result: "wrong", mistake: null, stuckStep: null });
        }
      }
      if (wrong) missedReviews.push({ ...r });
      if (incomplete) {
        if (scheduled) reviews.push({ ...scheduled });
      } else if (!scheduled && !wrong) {
        // A printed review with no stored interval starts at the first interval (lead decision).
        reviews.push({ ...r });
      } else {
        const next = nextReview(r, g.reviewDay, !wrong);
        if (next) reviews.push(next);
      }
    }
    return structuredClone({ ok: true, reviews, missedReviews, misses, consumed, held });
  } catch { return invalid(); }
}
