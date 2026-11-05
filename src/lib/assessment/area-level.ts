// A level per reported area for the parent dashboard (D-236, spec #544, #549). Nothing reaches a parent until a UI ticket
// uses it, and the rule must first pass the check on real data (`npm run area-levels:check`).
//
// A bar ends at the highest grade with WORKING_LEVEL_PERCENT right in that area, with at least AREA_MINIMUM_ANSWERS
// answers at that grade. Like the working level, it has no requirement on lower grades. There are three ways to end:
//   "area": a grade clears the bar.
//   "estimate": a grade has enough answers and none clears, so the bar is one grade under the lowest grade with enough
//     answers, as workingLevelOf estimates the overall level. Spec #544 does not name this case. A miss above the school
//     grade never puts the bar under the school grade, so it is never a weakness (D-108).
//   "overall": no grade has enough answers, so the bar shows the overall working level. The UI shows it lighter.
// Only "area" can be Clear. Pure: the caller passes one answer per test question and per marked item's original result.
import { workingLevelOf, type Certainty } from "./certainty";
import { AREA_MINIMUM_ANSWERS, WORKING_LEVEL_PERCENT, atLeast, bandFor } from "./constants";
import type { Grade, Level, LevelResult, ReportedStrand } from "./types";

/** One answer tagged with its reported area and grade. */
export interface AreaAnswer {
  area: ReportedStrand;
  level: Level;
  correct: boolean;
}

export type AreaLabel = "ahead" | "at-grade" | "building-up";
export type AreaBasis = "area" | "estimate" | "overall";

export interface AreaLevel {
  area: ReportedStrand;
  level: Level;
  /** The level against the school grade. Parents see it; the child, printed pages and the desk never do (D-236). */
  label: AreaLabel;
  certainty: Certainty;
  basis: AreaBasis;
}

export interface AreaLevelInput {
  answers: readonly AreaAnswer[];
  schoolGrade: Grade;
  /** The overall working level: the stored result's, not one computed from these answers. */
  workingLevel: Level;
}

/** Whole grades, in level order. */
function tallyByLevel(answers: readonly AreaAnswer[]): LevelResult[] {
  return [...new Set(answers.map((a) => a.level))]
    .sort((a, b) => a - b)
    .map((level) => {
      const at = answers.filter((a) => a.level === level);
      return { level, correct: at.filter((a) => a.correct).length, total: at.length };
    });
}

function barOf(levels: readonly LevelResult[], overall: Level): { level: Level; basis: AreaBasis } {
  const enough = levels.filter((l) => l.total >= AREA_MINIMUM_ANSWERS);
  if (enough.length === 0) return { level: overall, basis: "overall" };
  return {
    level: workingLevelOf(enough),
    basis: enough.some((l) => atLeast(l.correct, l.total, WORKING_LEVEL_PERCENT)) ? "area" : "estimate",
  };
}

/** Clear when one more answer, right or wrong, at any grade the area showed would leave the bar as it is. */
function certaintyOf(levels: readonly LevelResult[], overall: Level, bar: { level: Level; basis: AreaBasis }): Certainty {
  if (bar.basis !== "area") return "early-sign";
  const moves = levels.some((_, i) =>
    [1, 0].some((right) => {
      const next = barOf(levels.map((l, j) => (j === i ? { ...l, correct: l.correct + right, total: l.total + 1 } : l)), overall);
      return next.level !== bar.level || next.basis !== bar.basis;
    }),
  );
  return moves ? "early-sign" : "clear";
}

const labelOf = (level: Level, schoolGrade: Grade): AreaLabel =>
  level > schoolGrade ? "ahead" : level === schoolGrade ? "at-grade" : "building-up";

/** One bar per reported area of the school grade that has answers, in the report's order. An area with none has no bar. */
export function areaLevels({ answers, schoolGrade, workingLevel }: AreaLevelInput): AreaLevel[] {
  return bandFor(schoolGrade).strands.flatMap((area) => {
    const levels = tallyByLevel(answers.filter((a) => a.area === area));
    if (levels.length === 0) return [];
    const bar = barOf(levels, workingLevel);
    return [{ area, level: bar.level, label: labelOf(bar.level, schoolGrade), certainty: certaintyOf(levels, workingLevel, bar), basis: bar.basis }];
  });
}
