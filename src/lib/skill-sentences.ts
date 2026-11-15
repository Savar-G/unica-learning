import { MISCONCEPTIONS } from "@/lib/assessment/misconceptions";
import type { SkillState, SkillStateReason } from "@/lib/assessment/skill-state";
import { addDays, localDay, type FamilyZone } from "@/lib/family-time";
import { STRUGGLING_WINDOW_DAYS, repeatedMistakes, type HelpMark } from "@/lib/needs-help";

// The plain sentence under each skill on the dashboard Home (#989, Option A, 2026-11-14). Written by code from stored
// facts, never by an AI: every sentence is one of the fixed forms below, filled only from the facts passed in, and the
// function also returns its `basis`, the facts and counts it was written from, so a test (or a person reading a row) can
// trace a sentence to the rows behind it. Pure: no database, network or clock; `now` is passed in. The caller reads the
// facts in src/lib/parent-view.ts.
//
// Words, binding (DESIGN.md copy rules, Cedric 2026-11-14):
// - One short line, no more. No percent right and no count of wrong answers; the only numbers are a run of right answers
//   ("right the last 3 times") and a count of workbook days ("tricky on 3 workbook days"), as Highlights already says.
// - Needs help: what goes wrong, then what comes next. A mistake is named only from the misconception table's own text
//   (`MISCONCEPTIONS`), and only when the same cause was recorded on at least MISTAKE_MIN wrong answers in the last
//   STRUGGLING_WINDOW_DAYS days: one slip is not a habit. "Back in the next workbook." is said only when the next
//   workbook, already made and in the mail, really has questions on the skill (the caller's `inNextWorkbook`); with no
//   such book, or a book without the skill, the sentence says what goes wrong and stops.
// - Learning: how it is going, in words. "Getting steadier" needs a run of STEADY_RUN right answers after a wrong one;
//   "Right every time so far" needs at least STEADY_RUN right answers and no wrong one. Otherwise, a skill that has a
//   recorded start says when it started (as the approved prototype does); else there is no sentence.
// - Mastered: when it was mastered, the date the list already shows. Nothing about how: a skill is Mastered from a test
//   or from the practice pages, and the sentence does not say which.
// - When the facts are not enough, no sentence. Never a vague one.
// - A blank answer is an unfinished page, not a wrong answer (src/lib/needs-help.ts): it is in none of the counts.
// - The cause of a mistake comes from the learning events (`mistake`, the cause id of the known wrong answer the child gave).
//   Marked scan pages do not record one today (`originalEvents` in scan-marking.ts), so a cause comes from the test and from
//   Maya's calls; once marking records it, the same sentences use it with no change here. The stuck step of an event
//   (`stuckStep`, a worked-step id such as "tens") has no parent-readable text of its own, so it is not used.

/**
 * One wrong answer of a standard that matched a known wrong answer of its question, from a learning event: the cause id
 * (`MISCONCEPTIONS`) and when it happened (an ISO time). Never the answer or the question.
 */
export interface MistakeFact {
  cause: string;
  at: string;
}

/** Which list the skill is in. */
export type SkillGroup = "mastered" | "learning" | "needs_help";

/** At least this many marked answers with the same wrong-answer cause in the window before a mistake is named. */
export const MISTAKE_MIN = 2;
/** A mistake text longer than this many characters is too long for one short line: the sentence then says something else. */
export const MISTAKE_FIT = 80;
/** A run of this many right answers in a row at the end of a skill's marks counts as steadier. */
export const STEADY_RUN = 3;

export interface SkillSentenceFacts {
  /** The BC standard's code ("2.4"). */
  standard: string;
  group: SkillGroup;
  /** The skill state rule's state and reason for the standard (src/lib/assessment/skill-state.ts). */
  state: SkillState;
  reason: SkillStateReason;
  /** The marks of this one standard (any order). Other standards' marks are not passed. */
  marks: readonly HelpMark[];
  /** The wrong answers of this one standard with a known cause, from its learning events (any order, any time: the window is applied here). */
  mistakes: readonly MistakeFact[];
  /** Mastered only: when its Mastered row was recorded, as the list says it ("Thursday", "Nov 3"); null with no recorded row. */
  masteredOn: string | null;
  /** Learning only: when its first working-on row was recorded, in the same words; null with none. */
  startedOn: string | null;
  /** The next workbook (made, and in the mail) has questions on this skill. Only a Needs help sentence reads it. */
  inNextWorkbook: boolean;
  now: number;
  zone: FamilyZone;
}

/** What a sentence was written from. Stays on the server: only `text` reaches the page. */
export type SentenceBasis =
  | { kind: "mastered"; masteredOn: string }
  | { kind: "started"; startedOn: string }
  | { kind: "steadier"; run: number }
  | { kind: "right_so_far"; answers: number }
  | { kind: "mistake"; cause: string; times: number; next: boolean }
  | { kind: "tricky_days"; days: number; next: boolean }
  | { kind: "failed_review" | "test_weak" | "struggling"; next: boolean };

export interface SkillSentence {
  text: string;
  basis: SentenceBasis;
}

/** The misconception's own text as a sentence, or null when it is unknown or too long for the line. */
function mistakeText(cause: string): string | null {
  if (!Object.hasOwn(MISCONCEPTIONS, cause)) return null;
  const text = MISCONCEPTIONS[cause as keyof typeof MISCONCEPTIONS].description.trim().replace(/\.$/, "");
  return text.length > 0 && text.length <= MISTAKE_FIT ? `${text}.` : null;
}

/**
 * The cause the child keeps making: among the wrong answers of the last STRUGGLING_WINDOW_DAYS family-time days, the cause
 * with the most (at least MISTAKE_MIN), the most recent on a tie, then the cause id. Only a cause with text that fits the
 * line counts. A fact with no readable time, or dated after today, is left out.
 */
function repeatedCause(mistakes: readonly MistakeFact[], now: number, zone: FamilyZone): { cause: string; text: string; times: number } | null {
  const today = localDay(now, zone);
  const first = addDays(today, -(STRUGGLING_WINDOW_DAYS - 1));
  const by = new Map<string, { times: number; lastAt: number }>();
  for (const mistake of mistakes) {
    const at = Date.parse(mistake.at);
    if (!Number.isFinite(at)) continue;
    const day = localDay(at, zone);
    if (day < first || day > today) continue;
    const own = by.get(mistake.cause) ?? { times: 0, lastAt: -Infinity };
    by.set(mistake.cause, { times: own.times + 1, lastAt: Math.max(own.lastAt, at) });
  }
  const ranked = [...by]
    .filter(([cause, { times }]) => times >= MISTAKE_MIN && mistakeText(cause) !== null)
    .sort((a, b) => b[1].times - a[1].times || b[1].lastAt - a[1].lastAt || a[0].localeCompare(b[0]));
  const best = ranked[0];
  return best ? { cause: best[0], text: mistakeText(best[0])!, times: best[1].times } : null;
}

const NEXT = " Back in the next workbook.";

/** Needs help: what goes wrong, then the next workbook when it really has the skill. */
function needsHelpSentence(f: SkillSentenceFacts): SkillSentence {
  const next = f.inNextWorkbook;
  const tail = next ? NEXT : "";
  const cause = repeatedCause(f.mistakes, f.now, f.zone);
  if (cause) return { text: `${cause.text}${tail}`, basis: { kind: "mistake", cause: cause.cause, times: cause.times, next } };
  const days = repeatedMistakes(new Set([f.standard]), f.marks, f.now, f.zone)[0]?.days ?? 0;
  if (days > 0) return { text: `Tricky on ${days} workbook days in the last two weeks.${tail}`, basis: { kind: "tricky_days", days, next } };
  // The skill state rule's own reason, in plain words, when the marks name no habit.
  if (f.state === "needs_review") {
    return f.reason === "failed_review"
      ? { text: `Was right before, then slipped on a later answer.${tail}`, basis: { kind: "failed_review", next } }
      : { text: `Came up tricky on the test.${tail}`, basis: { kind: "test_weak", next } };
  }
  return { text: `Has been tricky on recent pages.${tail}`, basis: { kind: "struggling", next } };
}

/** Learning: how it is going, from the answered marks in time order. */
function learningSentence(f: SkillSentenceFacts): SkillSentence | null {
  const answered = f.marks
    .flatMap((m, i) => (m.blank ? [] : [{ right: m.right, at: Date.parse(m.at), i }]))
    .filter((m) => Number.isFinite(m.at))
    .sort((a, b) => a.at - b.at || a.i - b.i);
  let run = 0;
  while (run < answered.length && answered[answered.length - 1 - run].right) run += 1;
  if (run >= STEADY_RUN) {
    // Every answer right: nothing was wrong to get steadier from.
    if (run === answered.length) return { text: "Right every time so far", basis: { kind: "right_so_far", answers: run } };
    return { text: `Getting steadier: right the last ${run} times`, basis: { kind: "steadier", run } };
  }
  return f.startedOn ? { text: `Started ${f.startedOn}`, basis: { kind: "started", startedOn: f.startedOn } } : null;
}

/** The one sentence under a skill, or null when the facts are not enough. */
export function skillSentence(f: SkillSentenceFacts): SkillSentence | null {
  if (f.group === "mastered") return f.masteredOn ? { text: `Mastered ${f.masteredOn}`, basis: { kind: "mastered", masteredOn: f.masteredOn } } : null;
  if (f.group === "needs_help") return needsHelpSentence(f);
  return learningSentence(f);
}
