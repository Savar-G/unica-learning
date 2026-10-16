// How sure a result is (#189, spec #181, D-108 updates D-084). A result is "clear" when one more right answer or one
// more wrong answer would not change it, and otherwise an "early sign". Savar tunes this rule after the first reports.
import { STRAND_DEVELOPING_PERCENT, STRAND_SECURE_PERCENT, WORKING_LEVEL_PERCENT, atLeast } from "./constants";
import type { Level, LevelResult, StrandStatus } from "./types";

export type Certainty = "clear" | "early-sign";

/** An area's status from its right answers and its questions (D-084). */
export function strandStatus(correct: number, total: number): StrandStatus {
  if (atLeast(correct, total, STRAND_SECURE_PERCENT)) return "secure";
  if (atLeast(correct, total, STRAND_DEVELOPING_PERCENT)) return "developing";
  return "needs-attention";
}

/** Clear when one more answer, right or wrong, would leave the area's status as it is. */
export function strandCertainty(correct: number, total: number): Certainty {
  const status = strandStatus(correct, total);
  return strandStatus(correct + 1, total + 1) === status && strandStatus(correct, total + 1) === status ? "clear" : "early-sign";
}

/**
 * The working level: the highest level with WORKING_LEVEL_PERCENT right. When no level reaches it, the child works
 * below everything the test showed them: one level under the lowest level seen. `levels` is in level order.
 */
export function workingLevelOf(levels: readonly LevelResult[]): Level {
  const cleared = levels.filter((l) => atLeast(l.correct, l.total, WORKING_LEVEL_PERCENT));
  return cleared.length > 0 ? cleared[cleared.length - 1].level : (Math.max(0, levels[0].level - 1) as Level);
}

/** Clear when one more answer, right or wrong, at any level the test showed would leave the working level as it is. */
export function levelCertainty(levels: readonly LevelResult[]): Certainty {
  if (levels.length === 0) return "early-sign";
  const working = workingLevelOf(levels);
  const changes = levels.some((_, i) =>
    [1, 0].some((right) => workingLevelOf(levels.map((l, j) => (j === i ? { ...l, correct: l.correct + right, total: l.total + 1 } : l))) !== working),
  );
  return changes ? "early-sign" : "clear";
}
