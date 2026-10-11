// A fake work reviewer (#68): no network. Tests give it their own answers; in development, AI_REVIEW_FAKE=sure or unsure
// (src/lib/work-review.ts, never in a production build) shows a report with AI parts without an API key.
// "sure": every review is sure and the report text passes the checks. "unsure": every review is below the sure score,
// and the report text has a number that is not in the model, so the report keeps only the work and its plain sentences.
import { REPORT_TEXT_NAME, type ReportModel, type ReviewResult } from "@/lib/assessment";
import type { ReviewInput, WorkReviewer } from "@/lib/work-review";

const name = REPORT_TEXT_NAME;

function defaultReview(input: ReviewInput, score: number): ReviewResult {
  if (input.correct) return { errorType: "none", kind: "none", comment: "Wrote each step in order, and the steps lead to the answer.", score };
  if (input.misconception) {
    const mistake = input.misconception.charAt(0).toLowerCase() + input.misconception.slice(1);
    return { errorType: "known mistake", kind: "misunderstanding", comment: `The work matches a common mistake: ${mistake}.`, score };
  }
  return { errorType: "method", kind: "slip", comment: "Started with the right method, then made a small mistake in a later step.", score };
}

/** A report text built from the model, with only its numbers. */
function defaultText(m: ReportModel): string {
  const where = m.howWeHelp === "on-grade" ? "the same as the school grade" : m.howWeHelp === "behind" ? "below the school grade" : "above the school grade";
  const level = m.level.working === 0 ? "kindergarten" : `grade ${m.level.working}`;
  const best = [...m.strands].sort((a, b) => b.correct / Math.max(1, b.total) - a.correct / Math.max(1, a.total))[0];
  const practice = m.strands.filter((s) => s.status !== "secure").map((s) => s.name);
  return [
    `${name} is working at a ${level} level, ${where}.`,
    best ? `${best.name} is the strongest area, with ${best.correct} of ${best.total} right.` : "",
    practice.length > 0 ? `${practice.join(" and ")} ${practice.length === 1 ? "is the area" : "are the areas"} to practise next.` : `Every area is secure.`,
  ].filter(Boolean).join(" ");
}

export function fakeReviewer({
  mode = "sure",
  review,
  reportText,
}: {
  mode?: "sure" | "unsure";
  review?: (input: ReviewInput) => ReviewResult | Promise<ReviewResult>;
  reportText?: (model: ReportModel) => string | Promise<string>;
} = {}): WorkReviewer {
  const score = mode === "sure" ? 0.92 : 0.4;
  return {
    model: "fake",
    review: async (input) => (review ? review(input) : defaultReview(input, score)),
    reportText: async (model) => {
      if (reportText) return reportText(model);
      // 97 is never in a report model (no area has 97 questions): the check rejects this text.
      return mode === "sure" ? defaultText(model) : `${defaultText(model)} Overall, ${name} got 97% right.`;
    },
  };
}
