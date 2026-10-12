// The checks on AI text before a parent sees it (#68, D-084). The AI writes the report text from the report model and a
// short comment on each piece of shown work; these rules decide what is kept. Honesty rule (DESIGN.md): every number a
// parent reads is measured, so report text with any number that is not among the report's facts is rejected, and the
// report keeps only its plain sentences. A comment with a number that is not in its question, the answers or the typed
// working is not sure, so the report shows the work without it.
import type { ReportModel, WorkReview } from "./report";

/** Stands for the child's first name in AI text. The report page and the email put the name in (report-view). */
export const REPORT_TEXT_NAME = "{name}";
/** The longest report text kept, in characters: a short paragraph. */
export const REPORT_TEXT_MAX = 600;

/**
 * Why AI text was not kept. "length": empty or too long. "format": markup, a link, or a placeholder other than the name.
 * "voice": first person, or the AI named (D-085: AI is named only in the privacy page and the terms). "pronoun": he or
 * she (the report does not know the child's gender). "number": a number that is not among the report's facts.
 */
export type ReportTextProblem = "length" | "format" | "voice" | "pronoun" | "number";

export type ReportTextCheck = { ok: true; text: string } | { ok: false; problem: ReportTextProblem; detail: string };

/** Single spaces, trimmed, and hyphens for em and en dashes (site copy rule: no em-dash anywhere). */
export const tidyText = (text: string) => text.replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();

const FORMAT = /[*_#`<>[\]{}|\\]|https?:|www\./i;
const VOICE = /\b(?:I|I'm|I've|I'd|me|my|myself|AI|Claude|Anthropic)\b/i;
const PRONOUN = /\b(?:he|she|him|her|his|hers|himself|herself)\b/i;

/** The rules every AI text follows, report text and work comments alike: the first problem found, or null. */
function textProblem(text: string, max: number): { problem: Exclude<ReportTextProblem, "number">; detail: string } | null {
  if (text.length === 0 || text.length > max) return { problem: "length", detail: `${text.length} characters` };
  for (const [problem, rule] of [["format", FORMAT], ["voice", VOICE], ["pronoun", PRONOUN]] as const) {
    const found = text.replaceAll(REPORT_TEXT_NAME, "").match(rule);
    if (found) return { problem, detail: found[0] };
  }
  return null;
}

const UNITS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
/** Number words, so "ninety" is checked the same as "90". */
const NUMBER_WORDS: Record<string, number> = {
  zero: 0, ...UNITS, ...TENS, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, hundred: 100, thousand: 1000, million: 1_000_000, dozen: 12, twice: 2,
  half: 0.5, halves: 0.5, quarter: 0.25, quarters: 0.25,
};
const COMPOUND = new RegExp(`\\b(${Object.keys(TENS).join("|")})[- ](${Object.keys(UNITS).join("|")})\\b`, "g");

/** Every number in a text: digits (with thousands commas and decimals) and number words ("twenty-five" is 25). */
function numbersIn(text: string): number[] {
  const digits = [...text.matchAll(/\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g)].map((m) => Number(m[0].replaceAll(",", "")));
  const lower = text.toLowerCase();
  const compounds = [...lower.matchAll(COMPOUND)].map((m) => TENS[m[1]] + UNITS[m[2]]);
  const words = [...lower.replace(COMPOUND, " ").matchAll(/[a-z]+/g)].flatMap((m) => (m[0] in NUMBER_WORDS ? [NUMBER_WORDS[m[0]]] : []));
  return [...digits, ...compounds, ...words];
}

/** Every number in a value: its numbers, and the numbers in its texts. */
function numbersOf(value: unknown, into = new Set<number>()): Set<number> {
  if (typeof value === "number") into.add(value);
  else if (typeof value === "string") for (const n of numbersIn(value)) into.add(n);
  else if (Array.isArray(value)) for (const v of value) numbersOf(v, into);
  else if (value && typeof value === "object") for (const v of Object.values(value)) numbersOf(v, into);
  return into;
}

const LEVEL = (level: number) => (level === 0 ? "kindergarten" : `grade ${level}`);
const STATUS = { secure: "Secure", developing: "Developing", "needs-attention": "Needs attention" } as const;
const FACTS = { secure: "Secure", quick: "Quick", "needs-practice": "Needs practice" } as const;

/**
 * The facts of a report that the AI writes the report text from, and the only numbers that text may use: what the report
 * shows a parent, from the model. Never ids, file paths, the child's typed working, the name, or the comparison and FSA
 * lines (the report text does not repeat them). "{name}" stands for the child.
 */
export function reportFacts(m: ReportModel) {
  const f = m.facts;
  return {
    child: REPORT_TEXT_NAME,
    school_grade: LEVEL(m.level.grade),
    working_level: LEVEL(m.level.working),
    working_level_against_school_grade: m.howWeHelp === "on-grade" ? "the same" : m.howWeHelp === "behind" ? "below" : "above",
    level_is_estimate: m.level.confidence === "low",
    may_work_higher: m.level.atCeiling,
    help_warning: m.helpWarning === true,
    areas: m.strands.map((s) => ({ area: s.name, result: STATUS[s.status], right: s.correct, questions: s.total })),
    number_facts:
      f && f.answered > 0 && f.accuracy && f.speed
        ? { what: f.scope, round_seconds: f.seconds, right: f.correct, answered: f.answered, typical_seconds_per_fact: f.secondsPerFact, accuracy: FACTS[f.accuracy], speed: FACTS[f.speed] }
        : null,
    work: (m.work ?? []).map((w) => ({ question: w.prompt, answer: w.correct ? "right" : "not right", comment: w.comment })),
  };
}

/**
 * Checks AI report text against the model it was written from: the text rules, then every number must be among the
 * report's facts (reportFacts; a number word counts as its number). Returns the tidied text to keep, or why it was rejected.
 */
export function checkReportText(model: ReportModel, text: string): ReportTextCheck {
  const tidy = tidyText(text);
  const problem = textProblem(tidy, REPORT_TEXT_MAX);
  if (problem) return { ok: false, ...problem };
  const known = numbersOf(reportFacts(model));
  const unknown = numbersIn(tidy).filter((n) => !known.has(n));
  if (unknown.length > 0) return { ok: false, problem: "number", detail: [...new Set(unknown)].join(", ") };
  return { ok: true, text: tidy };
}

/** A review is sure, so its comment may show, from this score up (the reviewer's own confidence, 0 to 1). Tuned from the first real results. */
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

/** The piece of work a review is about: what its comment may say numbers from, and the mark. */
export interface ReviewedWork {
  questionId: string;
  correct: boolean;
  prompt: string;
  /** The child's answer. */
  answer: string;
  rightAnswer: string;
  /** The typed working, or null. */
  text: string | null;
}

/**
 * True when every number in the comment is in the question, the answers or the typed working. A single digit also counts
 * when it is a digit of one of them (the 1 that was not carried in 715). Numbers the reviewer read only in the drawing
 * cannot be checked, so such a comment is not sure.
 */
function commentNumbersKnown(comment: string, work: ReviewedWork): boolean {
  const sources = [work.prompt, work.answer, work.rightAnswer, work.text ?? ""];
  const known = numbersOf(sources);
  const digits = new Set(sources.join(" ").match(/\d/g)?.map(Number) ?? []);
  return numbersIn(comment).every((n) => known.has(n) || (Number.isInteger(n) && n >= 0 && n <= 9 && digits.has(n)));
}

/**
 * The review the report uses. Sure ("high") only when the score reaches REVIEW_SURE_SCORE, the comment follows the text
 * rules and uses only the work's numbers, and the review does not contradict the mark: a wrong answer reviewed as "no
 * error" is not sure. The review never changes the mark; a review that is not sure keeps the work on the report and
 * drops the comment (reportModel).
 */
export function workReview(work: ReviewedWork, result: ReviewResult): WorkReview {
  const comment = tidyText(result.comment);
  const scored = Number.isFinite(result.score) && result.score >= REVIEW_SURE_SCORE && result.score <= 1;
  const agrees = work.correct || result.kind !== "none";
  const sure = scored && agrees && textProblem(comment, REVIEW_COMMENT_MAX) === null && commentNumbersKnown(comment, work);
  return {
    questionId: work.questionId,
    errorType: tidyText(result.errorType).slice(0, REVIEW_ERROR_TYPE_MAX),
    kind: result.kind,
    comment,
    confidence: sure ? "high" : "low",
  };
}
