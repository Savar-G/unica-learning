import { fitsInSentence } from "@/lib/skill-name";
import type { WeekProgress } from "@/lib/parent-week";

// The dashboard Home's two plain-language parts (#990, Option A, 2026-11-14): the "On track this week" line under the
// Workbook card, and Highlights at the bottom. Written by code from stored facts, never by an AI; every sentence is built
// from the facts passed in, so each can be traced to its data. Pure: no database, network or clock. The caller reads the
// facts (src/lib/parent-view.ts) from the week rule (parent-week.ts), the skill history (progress-series.ts) and the Needs
// help rule (needs-help.ts).
//
// Words, binding (DESIGN.md copy rules, Cedric 2026-11-14):
// - Plain words. No percent right, no count of wrong answers, no "right on 3 different days".
// - "Mastered" is the skill rule's word and nothing more: a skill can be mastered from a test or from the practice pages, so
//   no sentence says how.
// - A skill is named only by its plain name (src/lib/skill-name.ts) and only when that name is short enough for a sentence;
//   else the sentence says a count ("1 new skill"), or, for the one to watch, is left out.
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
  /** Saved scans of any of this child's books taken this week, Monday through today in family time. A new book that came in mid-week does not hide the earlier book's scans. */
  scansThisWeek: number;
  /**
   * The earliest day of the current book, up to today, that still has pages to scan: the day the Workbooks tab's orange
   * row names. Null when there is none, or when the book's days are not known; the line then names the earliest missed day of the week.
   */
  openDay: number | null;
  /**
   * Skills Mastered now that were not on Monday, each by its plain name ("addition and subtraction to 1000"). Empty
   * when there are none, and when the skill history could not be read: an empty history would call every skill new.
   */
  newlyMastered: readonly string[];
  /** The Needs help skill that keeps coming up wrong, by its plain name, with the different workbook days it was wrong on lately; null with none. */
  repeatedMistake: { name: string; days: number } | null;
  /** Workbook days done in a row (`doneStreak`); 0 with none. */
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
export function weekLine({ name, week, scansThisWeek, openDay, newlyMastered }: HomeStoryFacts): WeekLine | null {
  // No book day of this week, or no day is behind us yet and none is done (a Monday morning): nothing to say.
  if (!week || (week.due === 0 && week.done === 0)) return null;
  const mastered = newlyMastered.length > 0 ? `, and ${newlyMastered.length} new ${newlyMastered.length === 1 ? "skill" : "skills"} mastered since Monday` : "";
  // The earliest open day of the book, as the Workbooks tab's orange row says it; the week's own earliest missed day when the book's days are not known.
  const ready = week.missed.length > 0 ? ` Day ${openDay ?? week.missed[0]} is ready when ${name} is.` : "";
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
  if (newlyMastered.length === 1) {
    out.push(fitsInSentence(newlyMastered[0]) ? `${name} mastered ${newlyMastered[0]} this week.` : `${name} mastered 1 new skill this week.`);
  } else if (newlyMastered.length > 1) out.push(`${name} mastered ${newlyMastered.length} skills this week.`);
  // A name too long for a sentence leaves this one out: the skill is still in Needs help, by its whole name.
  if (repeatedMistake && fitsInSentence(repeatedMistake.name)) {
    out.push(`The one to watch is ${repeatedMistake.name}: it was tricky on ${repeatedMistake.days} workbook days in the last two weeks.`);
  }
  if (streak >= STREAK_MIN) out.push(`${name} has done ${streak} workbook days in a row.`);
  return out.slice(0, HIGHLIGHT_MAX);
}

export const homeStory = (facts: HomeStoryFacts): HomeStory => ({ line: weekLine(facts), highlights: highlights(facts) });
