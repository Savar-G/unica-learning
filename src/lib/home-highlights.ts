import type { WeekProgress } from "@/lib/parent-week";

// The dashboard Home's two plain-language parts (#990, Option A, 2026-11-14): the "On track this week" line under the
// Workbook card, and Highlights at the bottom. Written by code from stored facts, never by an AI; every sentence is built
// from the facts passed in, so each can be traced to its data. Pure: no database, network or clock. The caller reads the
// facts (src/lib/parent-view.ts) from the week rule (parent-week.ts), the skill history (progress-series.ts) and the Needs
// help rule (needs-help.ts).
//
// Words, binding (DESIGN.md copy rules, Cedric 2026-11-14):
// - Plain words. No percent right, no count of wrong answers, no "right on 3 different days".
// - "Mastered" means right on the practice pages, then right again in review; the sentence says so when it names a count.
// - A quiet or late week is said calmly: "A quieter week", "Catching up", never "behind schedule" or "you missed".
// - Only what the facts prove: "Day 3 is ready when Leah is" says only that the book has that day. It never says a later
//   day practises a skill again, because no fact passed in shows it.
// - Show nothing rather than filler: no fact that qualifies means no line and no Highlight.

/** A day count in words the parent reads: "1 day", "3 days". */
const days = (n: number): string => `${n} ${n === 1 ? "day" : "days"}`;

/** The facts of one child's week and skills. A fact that cannot be read is left out (null, 0 or empty), and its sentence with it. */
export interface HomeStoryFacts {
  /** The child's first name. */
  name: string;
  /** This week's book days (src/lib/parent-week.ts `weekProgress`); null before the book, after the plan ended, or with no book day this week. */
  week: WeekProgress | null;
  /** Saved scans of the book taken this week, Monday through today in family time. */
  scansThisWeek: number;
  /**
   * Skills Mastered now that were not on Monday, each as the skill's own words ("addition and subtraction to 1000"). Empty
   * when there are none, and when the skill history could not be read: an empty history would call every skill new.
   */
  newlyMastered: readonly string[];
  /** The Needs help skill that keeps coming up wrong, as its words, with the different days it was wrong on lately; null with none. */
  repeatedMistake: { name: string; days: number } | null;
  /** Days done in a row (`doneStreak`); 0 with none. */
  streak: number;
}

export interface WeekLine {
  /** The bold lead: "On track this week." */
  lead: string;
  /** The rest of the line. */
  text: string;
}

export interface HomeStory {
  line: WeekLine | null;
  /** At most HIGHLIGHT_MAX plain sentences, in priority order. */
  highlights: string[];
}

export const HIGHLIGHT_MAX = 2;
/** Days done in a row before a streak is worth a sentence. */
export const STREAK_MIN = 3;

/** "On track this week." and its kin: the one sentence about the week, or null when the facts say nothing yet. */
export function weekLine({ name, week, scansThisWeek, newlyMastered }: HomeStoryFacts): WeekLine | null {
  // No book day of this week, or no day is behind us yet and none is done (a Monday morning): nothing to say.
  if (!week || (week.due === 0 && week.done === 0)) return null;
  const mastered = newlyMastered.length > 0 ? `, and ${newlyMastered.length} new ${newlyMastered.length === 1 ? "skill" : "skills"} mastered since Monday` : "";
  const ready = week.missed.length > 0 ? ` Day ${week.missed[0]} is ready when ${name} is.` : "";
  if (week.missed.length === 0) return { lead: "On track this week.", text: `${days(week.done)} done${mastered}.` };
  if (week.done === 0) {
    return { lead: "A quiet week so far.", text: `${scansThisWeek === 0 ? "Nothing scanned yet." : "No full day done yet."}${ready}` };
  }
  if (week.catchingUp) return { lead: "Catching up.", text: `${days(week.done)} done${mastered}.${ready}` };
  return { lead: "A quieter week.", text: `${days(week.done)} done${mastered}.${ready}` };
}

/**
 * Up to HIGHLIGHT_MAX sentences by a fixed priority: a new mastery, then a skill that keeps coming up wrong, then a streak
 * of days done. A kind with no fact adds none; with nothing at all there are no Highlights.
 */
export function highlights({ name, newlyMastered, repeatedMistake, streak }: HomeStoryFacts): string[] {
  const out: string[] = [];
  if (newlyMastered.length === 1) out.push(`${name} mastered ${newlyMastered[0]} this week.`);
  else if (newlyMastered.length > 1) out.push(`${name} mastered ${newlyMastered.length} skills this week, each right in practice and again in review.`);
  if (repeatedMistake) out.push(`The one to watch is ${repeatedMistake.name}: it was tricky on ${days(repeatedMistake.days)} in the last two weeks.`);
  if (streak >= STREAK_MIN) out.push(`${name} has done ${days(streak)} in a row.`);
  return out.slice(0, HIGHLIGHT_MAX);
}

export const homeStory = (facts: HomeStoryFacts): HomeStory => ({ line: weekLine(facts), highlights: highlights(facts) });
