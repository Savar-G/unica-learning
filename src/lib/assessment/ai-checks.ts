// The checks on AI text before a parent sees it (#68, D-084). The AI writes the report text from the report model and a
// short comment on each piece of shown work; these rules decide what is kept. Honesty rule (DESIGN.md): every number a
// parent reads is measured, so report text with any number that is not in the model is rejected, and the report keeps
// only its plain sentences.
import type { ReportModel, WorkReview } from "./report";

/** Stands for the child's first name in AI text. The report page and the email put the name in (report-view). */
export const REPORT_TEXT_NAME = "{name}";
/** The longest report text kept, in characters: a short paragraph. */
export const REPORT_TEXT_MAX = 600;

/**
 * Why AI text was not kept. "length": empty or too long. "format": markup, a link, or a placeholder other than the name.
 * "voice": first person, or the AI named (D-085: AI is named only in the privacy page and the terms). "pronoun": he or
 * she (the report does not know the child's gender). "number": a number that is not in the report model.
 */
export type ReportTextProblem = "length" | "format" | "voice" | "pronoun" | "number";

export type ReportTextCheck = { ok: true; text: string } | { ok: false; problem: ReportTextProblem; detail: string };

/** Single spaces, trimmed, and hyphens for em and en dashes (site copy rule: no em-dash anywhere). */
export const tidyText = (text: string) => text.replace(/[\u2013\u2014]/g, "-").replace(/\s+/g, " ").trim();

const FORMAT = /[*_#`<>[\]{}|\\]|https?:|www\./i;
const VOICE = /\b(?:I|I'm|I've|I'd|me|my|myself|AI|Claude|Anthropic)\b/i;
const PRONOUN = /\b(?:he|she|him|her|his|hers|himself|herself)\b/i;

/** The rules every AI text follows, report text and work comments alike: the first problem found, or null. */
export function textProblem(text: string, max: number): { problem: Exclude<ReportTextProblem, "number">; detail: string } | null {
  if (text.length === 0 || text.length > max) return { problem: "length", detail: `${text.length} characters` };
  for (const [problem, rule] of [["format", FORMAT], ["voice", VOICE], ["pronoun", PRONOUN]] as const) {
    const found = text.replaceAll(REPORT_TEXT_NAME, "").match(rule);
    if (found) return { problem, detail: found[0] };
  }
  return null;
}

/** A review is sure, so its comment may show, from this score up (the reviewer's own confidence, 0 to 1). Tuned after the pilot. */
export const REVIEW_SURE_SCORE = 0.8;
/** The longest work comment shown, in characters: one or two short sentences. */
export const REVIEW_COMMENT_MAX = 240;
/** The longest error type kept, in characters (a short label for Savar and the admin area). */
export const REVIEW_ERROR_TYPE_MAX = 60;

/** What the AI says about one piece of shown work, before these rules (spec #54, AI work reviewer). */
export interface ReviewResult {
  /** A short label, for example "regrouping in addition"; "none" when there is no error. */
  errorType: string;
  kind: WorkReview["kind"];
  /** One or two short sentences for the parent about what the work shows. */
  comment: string;
  /** How sure the reviewer is that the comment is true, 0 to 1. */
  score: number;
}

/**
 * The review the report uses. Sure ("high") only when the score reaches REVIEW_SURE_SCORE, the comment follows the text
 * rules, and the review does not contradict the mark: a wrong answer reviewed as "no error" is not sure. The review never
 * changes the mark; a review that is not sure keeps the work on the report and drops the comment (reportModel).
 */
export function workReview(questionId: string, correct: boolean, result: ReviewResult): WorkReview {
  const comment = tidyText(result.comment);
  const scored = Number.isFinite(result.score) && result.score >= REVIEW_SURE_SCORE && result.score <= 1;
  const agrees = correct || result.kind !== "none";
  const sure = scored && agrees && textProblem(comment, REVIEW_COMMENT_MAX) === null;
  return {
    questionId,
    errorType: tidyText(result.errorType).slice(0, REVIEW_ERROR_TYPE_MAX),
    kind: result.kind,
    comment,
    confidence: sure ? "high" : "low",
  };
}

/** Number words, so "ninety" is checked the same as "90". */
const NUMBER_WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
  hundred: 100, thousand: 1000, million: 1_000_000, dozen: 12, twice: 2, half: 0.5, halves: 0.5, quarter: 0.25, quarters: 0.25,
};

/** Every number in a text: digits (with thousands commas and decimals) and number words. */
function numbersIn(text: string): number[] {
  const digits = [...text.matchAll(/\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g)].map((m) => Number(m[0].replaceAll(",", "")));
  const words = [...text.toLowerCase().matchAll(/[a-z]+/g)].flatMap((m) => (m[0] in NUMBER_WORDS ? [NUMBER_WORDS[m[0]]] : []));
  return [...digits, ...words];
}

/** Every number the model holds: its numbers, and the numbers inside its texts (the questions, the comments, the FSA line). */
function modelNumbers(value: unknown, into = new Set<number>()): Set<number> {
  if (typeof value === "number") into.add(value);
  else if (typeof value === "string") for (const n of numbersIn(value)) into.add(n);
  else if (Array.isArray(value)) for (const v of value) modelNumbers(v, into);
  else if (value && typeof value === "object") for (const v of Object.values(value)) modelNumbers(v, into);
  return into;
}

/**
 * Checks AI report text against the model it was written from: the text rules, then every number must be one the model
 * holds (a number word counts as its number). Returns the tidied text to keep, or why it was rejected.
 */
export function checkReportText(model: ReportModel, text: string): ReportTextCheck {
  const tidy = tidyText(text);
  const problem = textProblem(tidy, REPORT_TEXT_MAX);
  if (problem) return { ok: false, ...problem };
  const known = modelNumbers(model);
  const unknown = numbersIn(tidy).filter((n) => !known.has(n));
  if (unknown.length > 0) return { ok: false, problem: "number", detail: [...new Set(unknown)].join(", ") };
  return { ok: true, text: tidy };
}
