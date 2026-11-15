import type { SkillState } from "@/lib/assessment/skill-state";
import { addDays, addMonths, formatCalendarDate, localDateTime, localDay, weekStartFor, type FamilyZone } from "@/lib/family-time";

// The Progress tab's numbers (#1004, Option A v9): the four tiles and the "Skills mastered over time" line, for Week,
// Month and All time. Pure: no network, database or clock; times are instants (ms) and days are family-time calendar dates.
//
// Two sources, on purpose:
// - Now: the skill state rule's current states (`current`), the same ones the Home counts and the skill map read. The
//   history is written by a rebuild, and a rebuild does not run when a workbook ships, so it can lag.
// - Before now: the recorded history (public.skill_state_history), by `changed_at`, the time a rebuild recorded the row,
//   in family time. Never `evidence_at`: a delayed test is dated by its test, but the child's map changed when the
//   rebuild recorded it (src/lib/assessment/skill-state.ts, "History").
//
// The line has one point per WEEK on the Week tab and one per MONTH on Month and All time, never one per day. A skill is
// mastered after at least PAGE_MASTERY_MIN_RESULTS page results at 80% or more and then a right review item, and review
// comes back about 2 days later; the history is dated when a rebuild records it. A daily line would show scan days, not
// learning. A point is the number of skills mastered at the END of its week or month (now, for the current one).

/** How far the Week tab's line goes back: this week and the 5 before it. */
export const WEEK_POINTS = 6;
/** How far the Month tab's line goes back: this month and the 5 before it. All time starts at the child's start month. */
export const MONTH_POINTS = 6;

/** One recorded change of one standard's state. */
export interface StateChange {
  standard: string;
  state: SkillState;
  /** When a rebuild recorded the row (an ISO time). */
  changedAt: string;
}

/**
 * How far along a state is, for "moved up". Needs review is below Not started: a skill that goes from Not started to
 * Needs review got worse, and one that goes from Needs review to Working on got better.
 */
const RANK: Record<SkillState, number> = { needs_review: 0, not_started: 1, working_on: 2, mastered: 3 };

/**
 * "Moved up" (#1004): a skill whose state is higher at the end of the period than at its start, except a change into
 * Working on. That step, from any state, is only the skill entering the current workbook (the rule's "in_workbook"), not
 * something the child did, so a new book does not count its whole skill list as moving up, and a Needs review skill the
 * book comes back to is not "up" until it is Mastered.
 */
export const movedUpBetween = (from: SkillState, to: SkillState): boolean => RANK[to] > RANK[from] && to !== "working_on";

/**
 * When a child's first batch of history rows was recorded: the earliest `changed_at`, as an instant (ms); null with no
 * rows. The table began on 2026-11-04, so a child who started earlier got all their rows at their first rebuild, dated
 * then. That batch is the starting state, not something the child did that day: it is neither a gain nor Moved up, and a
 * skill in it has no "Mastered <date>". Later rows are real changes.
 */
export function firstBatchAt(history: readonly StateChange[]): number | null {
  let first: number | null = null;
  for (const row of history) {
    const at = Date.parse(row.changedAt);
    if (Number.isFinite(at) && (first === null || at < first)) first = at;
  }
  return first;
}

export type Period = "week" | "month" | "all";

export interface ChartPoint {
  /** "Nov 3" (the week's Monday) for a week, "Nov" for a month. */
  label: string;
  /** The number of skills mastered at the end of the week or month; now, for the current one. */
  value: number;
}

export interface PeriodSummary {
  period: Period;
  /** The first day of the period, in family time: this Monday, the 1st of this month, or the child's start day. */
  since: string;
  /**
   * Skills mastered now less skills mastered when the period began; never below 0. Every period begins no earlier than
   * the end of the child's start day and the first batch of history, so Month never exceeds All time and the starting
   * state is never new.
   */
  gain: number;
  /** Skills that moved up since the period began (`movedUpBetween`). */
  movedUp: number;
  points: ChartPoint[];
}

export interface ProgressSummary {
  /** Skills mastered now, over every BC standard. */
  mastered: number;
  /** Skills that need help now (`ProgressSeriesInput.needsHelp`). */
  needsHelp: number;
  week: PeriodSummary;
  month: PeriodSummary;
  all: PeriodSummary;
}

export interface ProgressSeriesInput {
  now: number;
  zone: FamilyZone;
  /** The rule's state now, by standard; a standard missing from it is Not started. */
  current: ReadonlyMap<string, SkillState>;
  history: readonly StateChange[];
  /** The family-time day the child started (the day of their first finished test); null with none. */
  startDay: string | null;
  /**
   * The standards that count as Needs help now (`needsHelpStandards`, src/lib/needs-help.ts: the rule's needs_review, and a
   * Learning skill the child is struggling with). Left out, it is the rule's needs_review alone. Only the Needs help tile reads
   * it: gain and moved up stay on the rule's states and the history.
   */
  needsHelp?: ReadonlySet<string>;
}

/** A standard's state at an instant: the last recorded row before it, else Not started. */
function historyAt(rows: readonly (StateChange & { at: number })[] | undefined, instant: number): SkillState {
  let state: SkillState = "not_started";
  for (const row of rows ?? []) {
    if (row.at >= instant) break;
    state = row.state;
  }
  return state;
}

/** The label of a month ("2026-11"): "Nov", with the year when the line spans two years. */
const monthLabel = (month: string, withYear: boolean) =>
  formatCalendarDate(`${month}-01`, withYear ? { month: "short", year: "2-digit" } : { month: "short" });

/** The months from `first` through `last`, oldest first. */
function monthsBetween(first: string, last: string): string[] {
  const months: string[] = [];
  for (let m = first; m <= last; m = addMonths(m, 1)) months.push(m);
  return months;
}

export function progressSummary({ now, zone, current, history, startDay, needsHelp }: ProgressSeriesInput): ProgressSummary {
  const byStandard = new Map<string, (StateChange & { at: number })[]>();
  for (const row of history) {
    const at = Date.parse(row.changedAt);
    if (!Number.isFinite(at)) continue;
    const own = byStandard.get(row.standard);
    if (own) own.push({ ...row, at });
    else byStandard.set(row.standard, [{ ...row, at }]);
  }
  for (const rows of byStandard.values()) rows.sort((a, b) => a.at - b.at);
  const standards = [...new Set([...current.keys(), ...byStandard.keys()])];

  const stateAt = (standard: string, instant: number): SkillState =>
    instant > now ? current.get(standard) ?? "not_started" : historyAt(byStandard.get(standard), instant);
  const masteredAt = (instant: number) => standards.filter((s) => stateAt(s, instant) === "mastered").length;
  const today = localDay(now, zone);
  /** The start of a family-time day, as an instant. */
  const startOf = (day: string) => localDateTime(day, zone);

  // The starting state: what the child's starting test showed (everything up to the end of the start day) and the first
  // batch of history rows, whenever it was recorded (`firstBatchAt`). No period counts a change from before it.
  const batch = firstBatchAt(history);
  const startedAt = Math.max(startDay === null ? -Infinity : startOf(addDays(startDay, 1)), batch === null ? -Infinity : batch + 1);

  /** `began`: the instant the period's own start; the change counts from the later of it and the starting state. */
  const summary = (period: Period, since: string, began: number, points: ChartPoint[]): PeriodSummary => {
    const from = Math.max(began, startedAt);
    return {
      period,
      since,
      gain: Math.max(0, masteredAt(now + 1) - masteredAt(from)),
      movedUp: standards.filter((s) => movedUpBetween(stateAt(s, from), stateAt(s, now + 1))).length,
      points,
    };
  };

  // One point per week: the end of week W is the start of the next Monday; the current week's end is now.
  const thisMonday = weekStartFor(today);
  const startMonday = startDay === null ? thisMonday : weekStartFor(startDay);
  // At least two points, so the line has a start: a first week with one week of data gets the week before it.
  const firstMonday = [startMonday, addDays(thisMonday, -7)].reduce((a, b) => (a < b ? a : b));
  const earliest = addDays(thisMonday, -7 * (WEEK_POINTS - 1));
  const weeks: string[] = [];
  for (let m = firstMonday < earliest ? earliest : firstMonday; m <= thisMonday; m = addDays(m, 7)) weeks.push(m);
  const weekPoints = weeks.map((monday): ChartPoint => ({
    label: formatCalendarDate(monday, { month: "short", day: "numeric" }),
    value: masteredAt(monday === thisMonday ? now + 1 : startOf(addDays(monday, 7))),
  }));

  // One point per month, the same way.
  const thisMonth = today.slice(0, 7);
  const startMonth = startDay === null ? thisMonth : startDay.slice(0, 7);
  const firstMonth = [startMonth, addMonths(thisMonth, -1)].reduce((a, b) => (a < b ? a : b));
  const monthPoints = (from: string): ChartPoint[] => {
    const months = monthsBetween(from, thisMonth);
    const withYear = months[0].slice(0, 4) !== thisMonth.slice(0, 4);
    return months.map((month): ChartPoint => ({
      label: monthLabel(month, withYear),
      value: masteredAt(month === thisMonth ? now + 1 : startOf(`${addMonths(month, 1)}-01`)),
    }));
  };
  const recent = addMonths(thisMonth, -(MONTH_POINTS - 1));

  return {
    mastered: standards.filter((s) => stateAt(s, now + 1) === "mastered").length,
    needsHelp: standards.filter((s) => (needsHelp ? needsHelp.has(s) : stateAt(s, now + 1) === "needs_review")).length,
    week: summary("week", thisMonday, startOf(thisMonday), weekPoints),
    month: summary("month", `${thisMonth}-01`, startOf(`${thisMonth}-01`), monthPoints(firstMonth < recent ? recent : firstMonth)),
    // All time begins at the child's start; the others never begin before it either, so Month cannot exceed All time.
    all: summary("all", startDay ?? `${thisMonth}-01`, startOf(startDay ?? `${thisMonth}-01`), monthPoints(firstMonth)),
  };
}

/**
 * The standards that are Mastered now and were not when `since` began (#990): "new skills mastered since Monday". The same
 * boundary as the period summaries: never earlier than the end of the child's start day or the first batch of history
 * rows, so the starting state is not new. A skill that was mastered, lost it and has it again counts once; one that lost it
 * and stays lost does not count. A skill with no recorded row is never new, whatever the rule says now. In the rule's order of `current`.
 */
export function masteredSince({ now, zone, current, history, startDay, since }: Omit<ProgressSeriesInput, "needsHelp"> & { since: string }): string[] {
  const byStandard = new Map<string, (StateChange & { at: number })[]>();
  for (const row of history) {
    const at = Date.parse(row.changedAt);
    if (!Number.isFinite(at)) continue;
    const own = byStandard.get(row.standard);
    if (own) own.push({ ...row, at });
    else byStandard.set(row.standard, [{ ...row, at }]);
  }
  for (const rows of byStandard.values()) rows.sort((a, b) => a.at - b.at);
  const batch = firstBatchAt(history);
  const from = Math.max(
    localDateTime(since, zone),
    startDay === null ? -Infinity : localDateTime(addDays(startDay, 1), zone),
    batch === null ? -Infinity : batch + 1,
  );
  // A skill is new only when a recorded row proves it: the row in effect says Mastered and the state when the week began was
  // not. With no row, the rule's state alone could be a skill mastered before the history began, so it says nothing.
  const recorded = (standard: string) => { const rows = byStandard.get(standard); return rows?.[rows.length - 1].state === "mastered"; };
  return [...current].filter(([standard, state]) => state === "mastered" && from <= now && recorded(standard) && historyAt(byStandard.get(standard), from) !== "mastered").map(([standard]) => standard);
}
