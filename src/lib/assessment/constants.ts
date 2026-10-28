// Starting values from D-083 and D-084. Tune them from the first real results; never inline them.
import type { Grade, ReportedStrand, Strand } from "./types";

/**
 * A band's id names the bank folder it draws from (bank/grades-1-2 and so on), so stored data and tests keep their keys.
 * Since D-156 the "1-2" band also takes Kindergarten and the "6-7" band also takes grades 8 and 9.
 */
export type GradeBandId = "1-2" | "3-5" | "6-7";

export interface GradeBand {
  id: GradeBandId;
  grades: readonly Grade[];
  /** Questions on stay and down routes. Up routes can add school-grade questions. */
  length: number;
  /** Stage 1 questions, all at the school grade. */
  stage1: number;
  /** Questions marked show-your-work (#67). Since D-125 the mark is not enforced: it only ranks the work the report shows. */
  whiteboardRequired: number;
  /** True when the whiteboard has a text box beside the drawing. Grades 1-2 draw only (#67). */
  whiteboardTyping: boolean;
  /** Reported strands, in the order the test rotates through them. */
  strands: readonly ReportedStrand[];
}

export const GRADE_BANDS: Record<GradeBandId, GradeBand> = {
  // Kindergarten to grade 2 report 3 strands: BC teaches fractions from grade 3. Kindergarten (D-156) takes this band:
  // its bank starts at level K, the child draws and does not type, and the test is the shortest.
  "1-2": { id: "1-2", grades: [0, 1, 2], length: 24, stage1: 12, whiteboardRequired: 5, whiteboardTyping: false, strands: ["number", "algebra", "shapes"] },
  "3-5": { id: "3-5", grades: [3, 4, 5], length: 36, stage1: 18, whiteboardRequired: 7, whiteboardTyping: true, strands: ["number", "fractions", "algebra", "shapes"] },
  // Grades 8 and 9 (D-156) take this band: its bank holds levels 5-8, and both start at level 8 (grades.ts, D-153).
  "6-7": { id: "6-7", grades: [6, 7, 8, 9], length: 42, stage1: 21, whiteboardRequired: 10, whiteboardTyping: true, strands: ["number", "fractions", "algebra", "shapes"] },
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

/** BC selection: questions at or below school grade per reported strand (#188, D-110). */
export const STRAND_MINIMUM_QUESTIONS = 6;

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

/** Pieces of the child's shown work on the report (D-087: three whiteboard images). */
export const REPORT_WORK_MAX = 3;

/**
 * The longest response the answers table takes (`answers.response`, supabase/migrations/20261015_widen_answer_response.sql).
 * A choice answer is stored as the choice text, so every choice in the bank must fit (#165).
 */
export const RESPONSE_MAX = 80;

/**
 * Time on one question is capped here, so a tab left open overnight does not skew the speed data. A changed answer's
 * time (#249), the total of every visit, has the same cap.
 */
export const QUESTION_TIME_CAP_MS = 60 * 60_000;
