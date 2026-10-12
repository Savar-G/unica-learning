// Help flags (#71, D-083): signs that someone may have helped the child. Pure, like the session: every time comes in
// with the answers. The flags go to Savar's alert and the stored placement (the admin area, #77), never to the parent's
// report. The report gets only one thing from them: helpLikely, which says the level may be too high.
// Starting values; tune them from the first real results and never inline them.
import { atLeast } from "./constants";
import type { Answer } from "./types";

/** An answer faster than this, on a test question, is too fast to have been worked out. The facts section is not counted. */
export const TOO_FAST_MS = 3000;

/**
 * A long pause, then perfect answers: time enough to fetch help. The pause is one question that took LONG_PAUSE_MS or
 * more. It counts when that answer and the PAUSE_WINDOW - 1 answers after it are all right, while the PAUSE_WINDOW
 * answers before it had under PAUSE_BEFORE_RIGHT_BELOW_PERCENT right. The "before" part keeps a strong child who took a
 * break mid-question from being flagged: they were right before the pause too. A pause without a full window on each
 * side is not judged.
 */
export const LONG_PAUSE_MS = 3 * 60_000;
export const PAUSE_WINDOW = 4;
export const PAUSE_BEFORE_RIGHT_BELOW_PERCENT = 70;

/** The child's own answer to the last question, "Did anyone help?". */
export type HelpAnswer = "yes" | "a-little" | "no";
export const HELP_ANSWERS: readonly HelpAnswer[] = ["yes", "a-little", "no"];
export const isHelpAnswer = (value: unknown): value is HelpAnswer => HELP_ANSWERS.includes(value as HelpAnswer);

export type Flag =
  /** The child answered "Yes" or "A little" to "Did anyone help?". */
  | { kind: "helped"; answer: Exclude<HelpAnswer, "no"> }
  /** Every answer under TOO_FAST_MS, in test order, and how many of them were right. */
  | { kind: "too-fast"; questionIds: string[]; right: number }
  /** One long pause, then perfect answers: the question it was on, its time, and the answers right in the window before it. */
  | { kind: "pause-then-perfect"; questionId: string; pauseMs: number; rightBefore: number };

/** The flags for the answers of a finished test and the child's answer to "Did anyone help?" (null when not asked). */
export function flagsFor(answers: readonly Answer[], help: HelpAnswer | null): Flag[] {
  const flags: Flag[] = [];
  if (help === "yes" || help === "a-little") flags.push({ kind: "helped", answer: help });
  const fast = answers.filter((a) => a.timeMs < TOO_FAST_MS);
  if (fast.length > 0) flags.push({ kind: "too-fast", questionIds: fast.map((a) => a.questionId), right: fast.filter((a) => a.correct).length });
  answers.forEach((a, i) => {
    if (a.timeMs < LONG_PAUSE_MS || i < PAUSE_WINDOW || i + PAUSE_WINDOW > answers.length) return;
    const after = answers.slice(i, i + PAUSE_WINDOW);
    const rightBefore = answers.slice(i - PAUSE_WINDOW, i).filter((b) => b.correct).length;
    if (after.every((b) => b.correct) && !atLeast(rightBefore, PAUSE_WINDOW, PAUSE_BEFORE_RIGHT_BELOW_PERCENT)) {
      flags.push({ kind: "pause-then-perfect", questionId: a.questionId, pauseMs: a.timeMs, rightBefore });
    }
  });
  return flags;
}

/** Right answers under TOO_FAST_MS that make help likely. */
export const HELP_FAST_RIGHT_MIN = 3;

/**
 * True when help is likely, so the report says the level may be too high (spec story 44): the child said "Yes" or
 * "A little", or a long pause came before perfect answers, or at least HELP_FAST_RIGHT_MIN answers were both right and
 * too fast. Too-fast wrong answers do not count: a fast guess makes the level lower, not higher.
 * Takes the stored flags, so it also reads placements stored before #71 (no flags).
 */
export function helpLikely(flags: readonly Flag[] | undefined): boolean {
  return (flags ?? []).some((f) => f.kind !== "too-fast" || f.right >= HELP_FAST_RIGHT_MIN);
}
