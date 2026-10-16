// Rushing (#189, spec #181, D-108): very fast answers. A run of them gets "Take your time" on the test screen; a very
// fast wrong answer inside such a run is left out of the score, because it is a guess, not a sign of what the child
// knows; very fast right answers still count. When too many answers are very fast, the report says the result may not
// be reliable and offers a new test at once. Pure, like the session: every time comes in with the answers.
// Starting values; Savar tunes them from the first real results. Never inline them.
import { TOO_FAST_MS } from "./flags";
import type { Answer } from "./types";

/** Very fast answers in a row that make a run: the test shows "Take your time", and the run's wrong answers are left out. */
export const RUSH_RUN = 3;
/** Over this share of very fast answers, in whole percent, the result may not be reliable. */
export const UNRELIABLE_FAST_PERCENT = 30;

type Timed = Pick<Answer, "questionId" | "timeMs" | "correct">;

/** How fast the child answered a test, as the placement stores it. */
export interface Pace {
  /** Answers under TOO_FAST_MS. */
  veryFast: number;
  answers: number;
  /** The questions of the very fast wrong answers inside a run of RUSH_RUN or more, in test order: not in the score. */
  leftOut: string[];
  /** More than UNRELIABLE_FAST_PERCENT of the answers were very fast. */
  unreliable: boolean;
}

const veryFast = (a: Pick<Answer, "timeMs">) => a.timeMs < TOO_FAST_MS;

/** For each answer in test order: true when it is very fast and wrong, inside a run of RUSH_RUN or more very fast answers. */
export function leftOutOfScore(answers: readonly Timed[]): boolean[] {
  const out = answers.map(() => false);
  let start = 0;
  for (let i = 0; i <= answers.length; i++) {
    if (i < answers.length && veryFast(answers[i])) continue;
    // answers[start..i) is a run of very fast answers.
    if (i - start >= RUSH_RUN) for (let j = start; j < i; j++) out[j] = !answers[j].correct;
    start = i + 1;
  }
  return out;
}

export function paceOf(answers: readonly Timed[]): Pace {
  const fast = answers.filter(veryFast).length;
  const out = leftOutOfScore(answers);
  return {
    veryFast: fast,
    answers: answers.length,
    leftOut: answers.filter((_, i) => out[i]).map((a) => a.questionId),
    unreliable: fast * 100 > UNRELIABLE_FAST_PERCENT * answers.length,
  };
}

/** True when the last RUSH_RUN answers were all very fast: the next question shows "Take your time". */
export const takeYourTime = (answers: readonly Pick<Answer, "timeMs">[]): boolean =>
  answers.length >= RUSH_RUN && answers.slice(-RUSH_RUN).every(veryFast);
