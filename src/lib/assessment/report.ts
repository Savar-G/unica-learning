// Turns a placement into everything the report shows. The report page and the email both use this model.
// Honesty rule (DESIGN.md, D-084): every number here is measured or carries its source.
import { statusFor } from "@/lib/signup";
import { REPORT_WORK_MAX, REPORTED_STRAND_NAMES } from "./constants";
import { comparisonFor, type Comparison, type ComparisonInput } from "./comparison";
export type { Comparison } from "./comparison";
import { factsReport, type ReportFacts } from "./facts";
import { helpLikely } from "./flags";
import { checkReportText } from "./ai-checks";
import type { Certainty } from "./certainty";
import type { ExtraRoundOffer, Grade, Level, Placement, Province, StrandResult } from "./types";

/** One AI review of a child's shown work (#68). Built by workReview, which decides the confidence. */
export interface WorkReview {
  questionId: string;
  errorType: string;
  /** "none" when the work shows no error (a right answer). */
  kind: "slip" | "misunderstanding" | "none";
  comment: string;
  /** "high": the report may show the comment. "low": the report shows the work alone. */
  confidence: "high" | "low";
}

/** One answer with work on the whiteboard (#67), as the report job finds it in the stored answers. */
export interface ShownWork {
  questionId: string;
  prompt: string;
  correct: boolean;
  /** True on a show-your-work question (Question.showWork). */
  required: boolean;
  /** The stored drawing (a PNG in private storage), or null when the child only typed. */
  image: string | null;
  /** The typed working, or null when the child only drew. */
  text: string | null;
}

export interface ReportContext {
  /** Legacy callers may supply a raw count. It cannot establish a measured comparison and is ignored. */
  completedTestsInGrade?: number;
  /** The server-only source rows. Only the comparison summary reaches the report model. */
  comparison?: ComparisonInput;
  workReviews: WorkReview[];
  /** Every answer with work on the whiteboard, in test order (#67). None when left out. */
  shownWork?: ShownWork[];
  /**
   * #68: the report text the AI wrote from the model built without it (the same placement and context). Kept as the
   * summary only when it passes checkReportText; otherwise the report keeps only its plain sentences.
   */
  reportText?: string | null;
}

/** One piece of the child's work on the report: the question, right or not, the work, and a comment only when sure. */
export type ReportWork = Omit<ShownWork, "required"> & { comment: string | null };

export interface FsaLine {
  grade: 4 | 7;
  schoolYear: string;
  /** Share of BC students with a result who were On Track or Extending in numeracy. */
  percent: number;
  text: string;
  source: { name: string; url: string };
}

export interface ReportModel {
  /** `certainty` (#189): how sure the working level is. Absent in reports from placements stored before #189. */
  level: { working: Level; grade: Grade; atCeiling: boolean; confidence: Placement["confidence"]; certainty?: Certainty };
  /** Each area; its `certainty` (#189) is absent in reports from placements stored before #189. */
  strands: (StrandResult & { name: string })[];
  comparison: Comparison;
  fsa: FsaLine | null;
  howWeHelp: "behind" | "on-grade" | "ahead";
  callToAction: "card" | "waitlist";
  /**
   * Up to REPORT_WORK_MAX pieces of shown work (#67, D-087), in test order: show-your-work questions first, and among
   * them those with a sure comment; optional work fills up. Each shows its work; the comment only when the review is sure.
   */
  work: ReportWork[];
  /** Number facts (#70): accuracy beside speed, never speed alone. Null when the child had no facts section. */
  facts: ReportFacts | null;
  /**
   * #71: help is likely, so the report says the level may be too high and suggests a retake. Only this yes or no
   * reaches the parent; the flags behind it stay with Savar. Absent in reports stored before #71: read it as false.
   */
  helpWarning?: boolean;
  /**
   * #189: more than UNRELIABLE_FAST_PERCENT of the answers were very fast, so the result may not be reliable and the
   * report offers a new test at once. Absent when the pace was fine, and in reports stored before #189.
   */
  reliability?: { veryFast: number; answers: number };
  /** #189: very fast wrong answers in a run, left out of the score. Absent when there were none, and before #189. */
  leftOut?: number;
  /**
   * #190: the result includes the extra round the child took: how many questions, on which areas. Absent when the child
   * took none. A report built before a round from the report finished lacks it, so the report job builds it again.
   */
  extraRound?: ExtraRoundOffer;
  /**
   * #68: a short paragraph the AI wrote from this model, shown under the verdict. "{name}" stands for the child's first
   * name (REPORT_TEXT_NAME), so neither the stored model nor the AI holds the name. Absent when the AI is off or failed,
   * or when its text broke a rule of checkReportText: then the report has only its plain sentences.
   */
  summary?: string;
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

function workFor({ shownWork = [], workReviews }: ReportContext): ReportWork[] {
  const sure = new Map(workReviews.filter((r) => r.confidence === "high").map((r) => [r.questionId, r.comment]));
  const rank = (w: ShownWork) => (w.required ? 0 : 2) + (sure.has(w.questionId) ? 0 : 1);
  return shownWork
    .map((w, index) => ({ w, index }))
    .sort((a, b) => rank(a.w) - rank(b.w) || a.index - b.index)
    .slice(0, REPORT_WORK_MAX)
    .sort((a, b) => a.index - b.index)
    .map(({ w: { questionId, prompt, correct, image, text } }) => ({ questionId, prompt, correct, image, text, comment: sure.get(questionId) ?? null }));
}

export function reportModel(placement: Placement, context: ReportContext): ReportModel {
  const { workingLevel, grade } = placement;
  const model: ReportModel = {
    level: {
      working: workingLevel,
      grade,
      atCeiling: placement.atCeiling,
      confidence: placement.confidence,
      ...(placement.levelCertainty ? { certainty: placement.levelCertainty } : {}),
    },
    strands: placement.strands.map((s) => ({ ...s, name: REPORTED_STRAND_NAMES[s.strand] })),
    comparison: context.comparison ? comparisonFor(context.comparison) : { stage: "scale" },
    fsa: fsaLine(grade, placement.province),
    howWeHelp: workingLevel === grade ? "on-grade" : workingLevel < grade ? "behind" : "ahead",
    // Card for the curricula we make books for today (D-053); every other province joins the waitlist.
    callToAction: statusFor(placement.province) === "reserved" ? "card" : "waitlist",
    work: workFor(context),
    // Older placements were stored before the facts section existed and have no facts field.
    facts: placement.facts ? factsReport(placement.facts) : null,
    helpWarning: helpLikely(placement.flags),
    ...(placement.pace?.unreliable ? { reliability: { veryFast: placement.pace.veryFast, answers: placement.pace.answers } } : {}),
    ...(placement.pace?.leftOut.length ? { leftOut: placement.pace.leftOut.length } : {}),
    ...(placement.extraRound ? { extraRound: placement.extraRound } : {}),
  };
  if (!context.reportText) return model;
  const check = checkReportText(model, context.reportText);
  return check.ok ? { ...model, summary: check.text } : model;
}
