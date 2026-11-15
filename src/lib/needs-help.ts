import type { SkillMark, SkillState, StandardSkillState } from "@/lib/assessment/skill-state";
import { addDays, localDay, type FamilyZone } from "@/lib/family-time";

// "Needs help" on the parent dashboard (#1025, Cedric 2026-11-14): the one rule Home's three counts and lists and the
// Progress tab's Needs help tile both read. A skill counts as Needs help when
//   - the skill state rule says `needs_review` (it was Mastered, then answered wrong), or
//   - it is `working_on` (Learning) and the child is struggling with it now: fewer than STRUGGLING_BELOW_PERCENT right
//     on at least STRUGGLING_MIN_ANSWERS marked answers in the last STRUGGLING_WINDOW_DAYS days of family time.
//
// A dashboard view rule only. It never changes the skill state rule (src/lib/assessment/skill-state.ts) or what
// `skill_state_history` stores, so a skill that is struggling now but is `working_on` there stays `working_on` in both.
// The marks are the ones the dashboard already reads (`skillMarks`: each marked item's effective original result,
// reviews and page items alike). Pure: no network, database or clock; `now` is passed in. No percent reaches the parent.

/** Fewer than this many percent right counts as struggling; exactly this many does not. */
export const STRUGGLING_BELOW_PERCENT = 60;
/** At least this many marked answers in the window before a skill can count as struggling; fewer is too little to say. */
export const STRUGGLING_MIN_ANSWERS = 4;
/** The window, in family-time calendar days, today included: today and the 13 days before it. */
export const STRUGGLING_WINDOW_DAYS = 14;

/**
 * True when the marks of ONE standard show a child struggling now: at least STRUGGLING_MIN_ANSWERS marks dated in the
 * last STRUGGLING_WINDOW_DAYS family-time days, and fewer than STRUGGLING_BELOW_PERCENT of them right. A mark is dated by
 * the family's local day of its time, so the window follows the family's midnight, not UTC's. A mark with no readable
 * time, or dated after today, is left out. Callers pass only the standard's own marks.
 */
export function isStruggling(marks: readonly SkillMark[], now: number, zone: FamilyZone): boolean {
  const today = localDay(now, zone);
  const first = addDays(today, -(STRUGGLING_WINDOW_DAYS - 1));
  let total = 0;
  let right = 0;
  for (const mark of marks) {
    const at = Date.parse(mark.at);
    if (!Number.isFinite(at)) continue;
    const day = localDay(at, zone);
    if (day < first || day > today) continue;
    total += 1;
    if (mark.right) right += 1;
  }
  // Integer arithmetic, no rounding: 3 of 5 is exactly 60% and does not count; 14 of 24 is 58% and does.
  return total >= STRUGGLING_MIN_ANSWERS && right * 100 < STRUGGLING_BELOW_PERCENT * total;
}

/** True when a skill in `state`, with its own marks, counts as Needs help. Only a Learning skill can newly become one. */
export const countsAsNeedsHelp = (state: SkillState, marks: readonly SkillMark[], now: number, zone: FamilyZone): boolean =>
  state === "needs_review" || (state === "working_on" && isStruggling(marks, now, zone));

/** The standards that count as Needs help, from every standard's state and the child's marks (any order, any standards). */
export function needsHelpStandards(states: readonly StandardSkillState[], marks: readonly SkillMark[], now: number, zone: FamilyZone): Set<string> {
  const byStandard = new Map<string, SkillMark[]>();
  for (const mark of marks) byStandard.set(mark.standard, [...(byStandard.get(mark.standard) ?? []), mark]);
  return new Set(states.filter((s) => countsAsNeedsHelp(s.state, byStandard.get(s.standard) ?? [], now, zone)).map((s) => s.standard));
}
