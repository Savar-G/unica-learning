// Starting values from D-083 and D-084. Tune them after the pilot; never inline them.
import type { Grade, ReportedStrand, Strand } from "./types";

export type GradeBandId = "1-2" | "3-5" | "6-7";

export interface GradeBand {
  id: GradeBandId;
  grades: readonly Grade[];
  /** Questions in the whole test. */
  length: number;
  /** Stage 1 questions, all at the school grade. */
  stage1: number;
  /** Questions that require shown work on the whiteboard (#67). */
  whiteboardRequired: number;
  /** Reported strands, in the order the test rotates through them. */
  strands: readonly ReportedStrand[];
}

export const GRADE_BANDS: Record<GradeBandId, GradeBand> = {
  // Grades 1-2 report 3 strands: BC teaches fractions from grade 3.
  "1-2": { id: "1-2", grades: [1, 2], length: 24, stage1: 12, whiteboardRequired: 5, strands: ["number", "algebra", "shapes"] },
  "3-5": { id: "3-5", grades: [3, 4, 5], length: 36, stage1: 18, whiteboardRequired: 7, strands: ["number", "fractions", "algebra", "shapes"] },
  "6-7": { id: "6-7", grades: [6, 7], length: 42, stage1: 21, whiteboardRequired: 10, strands: ["number", "fractions", "algebra", "shapes"] },
};

export function bandFor(grade: Grade): GradeBand {
  const band = Object.values(GRADE_BANDS).find((b) => b.grades.includes(grade));
  if (!band) throw new Error(`No grade band for grade ${grade}`);
  return band;
}

// Thresholds are whole percents, so a boundary compares exactly (0.7 * 10 is not exactly 7 in floating point).

/** Stage 1 score, in percent, that routes stage 2 up one level. */
export const ROUTE_UP_PERCENT = 80;
/** A stage 1 score below this percent routes stage 2 down one level. */
export const ROUTE_DOWN_BELOW_PERCENT = 40;

/** Working level = the highest level with this percent correct. */
export const WORKING_LEVEL_PERCENT = 70;

export const STRAND_SECURE_PERCENT = 80;
export const STRAND_DEVELOPING_PERCENT = 50;

/** True when correct / total is at least `percent`, with no rounding. */
export const atLeast = (correct: number, total: number, percent: number) => total > 0 && correct * 100 >= percent * total;

export const REPORTED_STRAND: Record<Strand, ReportedStrand> = {
  N: "number",
  O: "number",
  F: "fractions",
  A: "algebra",
  MG: "shapes",
  DP: "shapes",
};

export const REPORTED_STRAND_NAMES: Record<ReportedStrand, string> = {
  number: "Number and operations",
  fractions: "Fractions and decimals",
  algebra: "Patterns and algebra",
  shapes: "Shapes, measurement and data",
};

/** Completed tests in a grade before the report shows bands among Unica children (D-084). */
export const COMPARISON_BANDS_FROM = 100;
/** Completed tests in a grade before the report shows a numeric percentile, labelled with n. */
export const COMPARISON_PERCENTILE_FROM = 400;
