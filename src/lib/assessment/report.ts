// Turns a placement into everything the report shows. The report page and the email both use this model.
// Honesty rule (DESIGN.md, D-084): every number here is measured or carries its source.
import { statusFor } from "@/lib/signup";
import { COMPARISON_BANDS_FROM, COMPARISON_PERCENTILE_FROM, REPORTED_STRAND_NAMES } from "./constants";
import { factsReport, type ReportFacts } from "./facts";
import { helpLikely } from "./flags";
import type { Grade, Level, Placement, Province, StrandResult } from "./types";

/** One AI review of a child's shown work (#68). */
export interface WorkReview {
  questionId: string;
  errorType: string;
  kind: "slip" | "misunderstanding";
  comment: string;
  confidence: "high" | "low";
}

export interface ReportContext {
  /** Completed tests for the child's school grade, from the assessments table. */
  completedTestsInGrade: number;
  workReviews: WorkReview[];
}

export type Comparison = { stage: "scale" } | { stage: "bands"; n: number } | { stage: "percentile"; n: number };

export interface FsaLine {
  grade: 4 | 7;
  schoolYear: string;
  /** Share of BC students with a result who were On Track or Extending in numeracy. */
  percent: number;
  text: string;
  source: { name: string; url: string };
}

export interface ReportModel {
  level: { working: Level; grade: Grade; atCeiling: boolean; confidence: Placement["confidence"] };
  strands: (StrandResult & { name: string })[];
  comparison: Comparison;
  fsa: FsaLine | null;
  howWeHelp: "behind" | "on-grade" | "ahead";
  callToAction: "card" | "waitlist";
  /** Every reviewed piece of work shows its image; the comment only when the review is sure. */
  work: { questionId: string; comment: string | null }[];
  /** Number facts (#70): accuracy beside speed, never speed alone. Null when the child had no facts section. */
  facts: ReportFacts | null;
  /**
   * #71: help is likely, so the report says the level may be too high and suggests a retake. Only this yes or no
   * reaches the parent; the flags behind it stay with Savar. Absent in reports stored before #71: read it as false.
   */
  helpWarning?: boolean;
}

// BC FSA numeracy, 2025/26, all BC-resident students with a result (research: diagnostics-length-formats.md, section 5.2).
// Check these figures against the dataset before launch (#54).
const FSA_SOURCE = {
  name: "BC Ministry of Education and Child Care, Foundation Skills Assessment open data, 2025/26",
  url: "https://catalogue.data.gov.bc.ca/dataset/5554165d-e365-422f-bf85-4f6e4c9167dc",
};
const FSA_PERCENT: Record<4 | 7, number> = { 4: 66.5, 7: 59.2 };

// BC families only, grades 4 and 7 (D-087). "Another province" is scored against BC but is not a BC family.
function fsaLine(grade: Grade, province: Province): FsaLine | null {
  if (province !== "BC" || (grade !== 4 && grade !== 7)) return null;
  const percent = FSA_PERCENT[grade];
  return {
    grade,
    schoolYear: "2025/26",
    percent,
    text: `In fall 2025, ${percent}% of BC grade ${grade} students who wrote the Foundation Skills Assessment were On Track or Extending in numeracy. The FSA is a different test from this one.`,
    source: FSA_SOURCE,
  };
}

function comparisonFor(n: number): Comparison {
  if (n >= COMPARISON_PERCENTILE_FROM) return { stage: "percentile", n };
  if (n >= COMPARISON_BANDS_FROM) return { stage: "bands", n };
  return { stage: "scale" };
}

export function reportModel(placement: Placement, context: ReportContext): ReportModel {
  const { workingLevel, grade } = placement;
  return {
    level: { working: workingLevel, grade, atCeiling: placement.atCeiling, confidence: placement.confidence },
    strands: placement.strands.map((s) => ({ ...s, name: REPORTED_STRAND_NAMES[s.strand] })),
    comparison: comparisonFor(context.completedTestsInGrade),
    fsa: fsaLine(grade, placement.province),
    howWeHelp: workingLevel === grade ? "on-grade" : workingLevel < grade ? "behind" : "ahead",
    // Card for the curricula we make books for today (D-053); every other province joins the waitlist.
    callToAction: statusFor(placement.province) === "reserved" ? "card" : "waitlist",
    work: context.workReviews.map((r) => ({ questionId: r.questionId, comment: r.confidence === "high" ? r.comment : null })),
    // Older placements were stored before the facts section existed and have no facts field.
    facts: placement.facts ? factsReport(placement.facts) : null,
    helpWarning: helpLikely(placement.flags),
  };
}
