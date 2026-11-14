// #473 (S10b): what the admin reads of a frozen next-book snapshot (#476). One pure function turns the stored row into
// the view, per skill: the plan's next steps, the spaced reviews due and missed, the Fix it items carried over and the
// marks held for a later book, with their reason. It writes nothing and reads no store, clock or provider.
//
// The row stores the planner's input, not its plan. The plan is the planner run again on that input, and it is shown only
// when it hashes to the saved plan hash (the stored contract of planNextBookFromSnapshot): a planner that changed since
// the snapshot never shows other steps as the saved ones.
import "server-only";
import { replaySavedPlan, type NextBookSnapshotRecord, type PlanHeld } from "./next-book-snapshot";
import { SPACED_INTERVALS, type ProgressPlanInput, type UnresolvedMiss } from "./workbook-plan";
import { SKILL_TITLES } from "./workbook-skill-titles";

export interface SkillPlanView {
  skill: string;
  name: string;
  /** The progress decision from the marks, in plain words; null when the plan made none for this skill. */
  decision: string | null;
  /** New steps the plan starts, with their day. Empty when the saved plan could not be shown. */
  newSteps: { step: number; day: number }[];
  /** The plan had no room for its Fix it items in this book. */
  fixItLater: boolean;
  reviewsDue: { step: number; every: string; when: string }[];
  reviewsMissed: { step: number; every: string }[];
  fixIt: { question: string; result: string; mistake: string | null }[];
  held: { step: number | null; reason: string }[];
}
export type SnapshotPlanView =
  | { state: "none" }
  | { state: "held" }
  | { state: "waiting"; revision: number }
  | { state: "no-plan"; revision: number; frozenAt: number }
  | {
    state: "ready";
    revision: number;
    reason: string;
    frozenAt: number;
    /** The plan run again on the saved input gives the saved plan. */
    matchesSaved: boolean;
    days: { used: number[]; later: number[] };
    /** Marks the plan used, and items in the sample still waiting for a mark. */
    used: number;
    pending: number;
    skills: SkillPlanView[];
    /** Held marks the planner did not tie to a skill, counted by reason. */
    otherHeld: { reason: string; count: number }[];
  };

const EVERY: Record<number, string> = { 2: "2 days", 5: "1 week", 15: "3 weeks", 40: "2 months" };
const every = (interval: number) => EVERY[SPACED_INTERVALS[interval]] ?? `interval ${interval + 1}`;
const when = (due: number) => due <= 1 ? "Day 1" : due <= 10 ? `Day ${due}` : "After this book";
const RESULT: Record<UnresolvedMiss["result"], string> = { wrong: "Wrong", blank: "Left blank", right_with_help: "Right with help" };
const REASON: Record<NextBookSnapshotRecord["reason"], string> = {
  day7_scanned: "Day 7 was scanned", delivery_backstop: "21 days after delivery", admin_prepare: "An admin prepared it",
};
const HELD: Record<string, string> = {
  "help": "Had help with the math",
  "not marked": "Not marked yet",
  "no printed question": "No question for it in the scanned days",
  "no review question in selected days": "No question for it in the scanned days",
  "outside selected days": "On a later day, kept for a later book",
  "after cutoff": "Marked after the snapshot",
  "changed after the snapshot": "Mark changed after the snapshot",
  "extra practice": "On an extra practice page",
  "not used in this plan": "Not used in this plan",
  "after-cutoff": "Second try after the snapshot",
  "version-after-cutoff": "Second try on a mark changed after the snapshot",
  "undated-page": "Second try on an extra practice page",
};
const heldReason = (h: PlanHeld) => HELD[h.reason] ?? h.reason.replaceAll("-", " ");

function decisionLine(d: ProgressPlanInput["decision"]): string {
  const n = d.target.step;
  switch (d.action) {
    case "advance": return `Move on to step ${n}`;
    case "skill-complete": return "Skill complete";
    case "retain-unfinished": return `Stay on step ${n}: not enough marks yet`;
    case "repeat-new-numbers": return `Repeat step ${n} with new numbers`;
    case "repeat-check-work": return `Repeat step ${n} and check each answer`;
    case "regress-represent": return `Go back to step ${n} and show it another way`;
    case "retain-review": return `Keep step ${n} in review`;
    case "change-approach": return `Step ${n} again with a new approach`;
  }
}
function questionLine(m: UnresolvedMiss): string {
  return m.question.source === "workbook" ? `Book page ${m.question.page}, question ${m.question.question}` : "A test question";
}
/** The admin's view of one snapshot row: the latest revision of the child's chain, or null when there is none. */
export function snapshotPlanView(row: NextBookSnapshotRecord | null): SnapshotPlanView {
  if (!row) return { state: "none" };
  if (row.held) return { state: "held" };
  if (!row.frozen) return { state: "waiting", revision: row.revision };
  if (!row.plan) return { state: "no-plan", revision: row.revision, frozenAt: row.frozen.frozenAt };
  const input = row.plan.planInput;
  const plan = replaySavedPlan(input, row.plan.planHash);
  const decisions = input.previewDecisions ?? (input.progress ? [input.progress] : []);
  const order = input.level.units.flatMap(u => u.skills.map(s => s.id));
  const skillHeld = row.plan.held.filter(h => h.skill);
  const ids = new Set([
    ...decisions.map(d => d.decision.selection.skill), ...(plan?.newSteps.map(s => s.skill) ?? []),
    ...input.reviews.map(r => r.skill), ...input.missedReviews.map(r => r.skill), ...input.misses.map(m => m.skill),
    ...skillHeld.map(h => h.skill!),
  ]);
  const rank = (id: string) => { const i = order.indexOf(id); return i < 0 ? order.length : i; };
  const skills = [...ids].sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0)).map((skill): SkillPlanView => {
    const decision = decisions.find(d => d.decision.selection.skill === skill);
    return {
      skill, name: SKILL_TITLES[skill] ?? skill,
      decision: decision ? decisionLine(decision.decision) : null,
      newSteps: (plan?.newSteps ?? []).filter(s => s.skill === skill).map(s => ({ step: s.step, day: s.day })),
      fixItLater: !!plan?.fixItLater.includes(skill),
      reviewsDue: input.reviews.filter(r => r.skill === skill).sort((a, b) => a.due - b.due || a.step - b.step)
        .map(r => ({ step: r.step, every: every(r.interval), when: when(r.due) })),
      reviewsMissed: input.missedReviews.filter(r => r.skill === skill).sort((a, b) => a.step - b.step)
        .map(r => ({ step: r.step, every: every(r.interval) })),
      fixIt: input.misses.filter(m => m.skill === skill).map(m => ({ question: questionLine(m), result: RESULT[m.result], mistake: m.mistake })),
      held: skillHeld.filter(h => h.skill === skill).map(h => ({ step: h.step ?? null, reason: heldReason(h) })),
    };
  });
  const other = new Map<string, number>();
  for (const h of row.plan.held) if (!h.skill) other.set(heldReason(h), (other.get(heldReason(h)) ?? 0) + 1);
  return {
    state: "ready", revision: row.revision, reason: REASON[row.reason], frozenAt: row.frozen.frozenAt, matchesSaved: plan !== null,
    days: { used: [...row.frozen.scope.days], later: [...row.frozen.scope.heldDays] },
    used: row.plan.consumed.length, pending: row.frozen.pending.length, skills,
    otherHeld: [...other].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count || (a.reason < b.reason ? -1 : 1)),
  };
}
