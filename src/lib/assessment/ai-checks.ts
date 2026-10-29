// The checks on AI text before a parent sees it (#68, D-084). The AI writes the report text from the report model and a
// short comment on each piece of shown work; these rules decide what is kept. Honesty rule (DESIGN.md): every number a
// parent reads is measured, so report text with any number that is not among the report's facts is rejected, and the
// report keeps only its plain sentences. A comment with a number that is not in its question, the answers or the typed
// working is not sure, so the report shows the work without it.
import { FACT_SPEED_FROM_GRADE } from "./facts";
import { TOP_LEVEL } from "./grades";
import type { ReportModel, WorkReview } from "./report";
import type { Grade } from "./types";

/** Stands for the child's first name in AI text. The report page and the email put the name in (report-view). */
export const REPORT_TEXT_NAME = "{name}";
/** The longest report text kept, in characters: a short paragraph. */
export const REPORT_TEXT_MAX = 600;

/**
 * Why AI text was not kept. "length": empty or too long. "format": markup, a link, or a placeholder other than the name.
 * "voice": first person, or the AI named (D-085: AI is named only in the privacy page and the terms). "pronoun": he or
 * she (the report does not know the child's gender). "number": a number that is not among the report's facts.
 * "speed" and "untested": what a parent's AI text about the child may not say (parentTextProblem, #242, #245).
 * "repeat": the summary says the child may work above the level, which the verdict block already says (D-133).
 */
export type ReportTextProblem = "length" | "format" | "voice" | "pronoun" | "number" | "speed" | "untested" | "repeat";

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

/**
 * A statement of how fast the facts were (#242, #245): speed and pace words, the time per fact, the round's length, and
 * comparisons of time. It counts only in a sentence about the facts (FACTS_TOPIC) or the sentence after one, so "a
 * quick picture", "slow down", "a second time", "rushed" or "hesitated" elsewhere are kept. Not "fluency": it is in
 * the BC titles of the facts. Not "prompted", "an efficient strategy" or "read the clock": only "promptly",
 * "efficiently" and racing the clock are about speed.
 */
const TIMING = new RegExp([
  String.raw`\b(?:quick|fast|slow|rapid|swift|speed|instant|immediate|brisk)\w*|\b(?:promptly|efficiently)\b`,
  String.raw`\b(?:pace[ds]?|pacing|hesitat\w*|fluently|automatic\w*|rush\w*|hurr(?:y|ied|ies|ying)|timed|timing|timer|stopwatch|lightning)\b`,
  String.raw`\b(?:beat|beats|beating|against|race|races|raced|racing)\s+the\s+clock\b`,
  String.raw`\bseconds\b|\bsecs?\b|\b(?:a|one|per|each|few|\d+)[\s-]+second\b(?!\s+(?:time|try|look|step|number|question|row))|\b(?:a|one|per|each|the|\d+)[\s-]+minute\b(?!\s+hands?)`,
  String.raw`\b\d+(?:\.\d+)?\s+(?:s|ms)\b|\bmilliseconds?\b`,
  String.raw`\b(?:right away|at once|in a (?:flash|snap)|in no time|no time at all|record time|on the spot|at a glance|without (?:a )?(?:pause|delay|stopping)|with no delay|a while|blink of an eye|good clip|steady rate|within moments|time to spare|(?:the )?time (?:ran|was) (?:out|up)|rattled off)\b`,
  String.raw`\b(?:zip|zoom|breez|rac|flew|fly|flying|sped)\w*\s+(?:through|past)\b`,
  String.raw`\b(?:took|takes?|taking|needs?|needed|needing|spent|spends?|spending)\s+(?:a\s+(?:bit|little)\s+)?(?:longer|(?:more|less|extra)\s+time)\b`,
  String.raw`\b(?:linger\w*|took a moment|more|less|extra|longer|shorter)\s+(?:time\s+)?(?:on|with|for)\s+(?:the\s+|each\s+)?(?:\w+\s+)?facts?\b`,
  String.raw`\btime\s+(?:per|on\s+each|to\s+(?:answer|recall|respond))\b`,
  String.raw`\bper\s+(?:fact|answer|question)\b`,
].join("|"), "i");
/** A sentence about the number facts: the only place a timing word is about the facts. */
const FACTS_TOPIC = /\b(?:facts?|recall\w*|times\s+tables?|sums?|number\s+bonds?|(?:the|this)\s+(?:quick\s+)?round)\b/i;

/** What the AI may call the test, as the one that asked or left something out. */
const THE_TEST = String.raw`(?:the|this)\s+(?:quick\s+)?(?:(?:number\s+)?facts?\s+)?(?:test|round|quiz|assessment|questions)`;
/** Parts of the child's own answer: "the remainder was not included" is what the answer left out, not the test. */
const CHILD_WORK = String.raw`(?:answers?|remainders?|units?|regrouping|zeros?|zeroes|signs?|steps?|digits?|decimal\s+point|carry|carrying|labels?|working|work|estimates?|pictures?|drawing)`;
/**
 * A statement that something was not tested (#245), however it is worded: the words about testing ("tested",
 * "assessed", "evaluated", "examined") after not or never; something passive that "was not checked", "covered",
 * "included" or "asked"; the test as the one that did not ask, skipped or left out; not on, in, or outside the test;
 * yet or still to be tested; no questions, results or information; not known, unknown so far. Its exceptions for the
 * child's own work ("was not tried by {name}") apply only to what MAIN_UNTESTED lets through.
 */
const NOT = String.raw`(?:\bnot|\bnever|n['’]t)`;
const UNTESTED = new RegExp([
  String.raw`\buntested\b`,
  String.raw`${NOT}\s+(?:yet\s+|really\s+|been\s+|be\s+|even\s+)*(?:tested|assessed|evaluated|examined)\b`,
  String.raw`${NOT}\s+(?:yet\s+|really\s+|been\s+|be\s+|even\s+)*asked\b(?!\s+(?:for\b|to\s+(?!(?:do|answer|try|solve|complete|work)\b)))`,
  String.raw`(?<!\b${CHILD_WORK}(?:\s+(?:in|of|on|for)\s+(?:the\s+)?\w+(?:\s+\w+)?)?\s+)(?:\b(?:is|are|was|were|be|being|been)(?:\s+not|\s+never|n['’]t)|${NOT}\s+(?:yet\s+)?been)\s+(?:yet\s+|really\s+)?(?:checked|measured|covered|included|tried|reached|looked\s+at|shown|given)\b(?!\s+by\b)`,
  String.raw`\b${THE_TEST}\s+(?:(?:did|does|do|has|have|had|could|would)(?:\s+not|n['’]t)|never)\s+(?:yet\s+|really\s+|even\s+)?(?:test|check|measur|assess|evaluat|examin|ask|cover|includ|reach|look|get|got|show|touch|go|went|contain|featur|explor|address)\w*`,
  String.raw`\b${THE_TEST}\s+(?:skipped|skips|left\s+out|leaves\s+out|omitted|missed|excluded|had\s+no|has\s+no|gave\s+no|asked\s+no|included\s+no|showed\s+no)\b`,
  String.raw`\b(?:not|never)\s+(?:on|in|part\s+of|included\s+in|covered\s+by)\s+${THE_TEST}\b`,
  String.raw`\b(?:left\s+out\s+of|missing\s+from|skipped\s+in|outside(?:\s+of)?|absent\s+from)\s+${THE_TEST}\b`,
  String.raw`\b(?:yet|remains?|still\s+needs?|needs?)\s+to\s+be\s+(?:tested|checked|measured|assessed)\b`,
  String.raw`\bno\s+(?:\w+\s+){0,2}questions?\b(?!\s+(?:wrong|right|incorrect|correct)\b)`,
  String.raw`\bno\s+(?:\w+\s+){0,2}facts?\s+(?:on|in)\s+${THE_TEST}\b`,
  String.raw`\bno\s+(?:results?|information|data)\b`,
  String.raw`\b(?:did\s+not|didn['’]t|was\s+not|wasn['’]t)\s+(?:get|given|see|shown|have)\s+(?:any\s+)?(?:\w+\s+){0,2}(?:questions?|facts?)\b(?!\s+(?:wrong|right|incorrect|correct)\b)`,
  String.raw`\bnot\s+(?:yet\s+)?known\b`,
  String.raw`\b(?:is|are|remains?|stays?)\s+unknown\b|\bunknown\s+(?:so\s+far|for\s+now|yet)\b`,
  String.raw`\bdo(?:\s+not|n['’]t)\s+(?:yet\s+)?know\b`,
].join("|"), "i");

/**
 * The "not tested" check of #242, kept whole as a safety net under UNTESTED (D-124, #245 review round 3): "not" or
 * "never" before "tested", "checked", "measured", "assessed", "asked", "covered" or "included", and "did not" or "does
 * not" before "test", "check", "measure", "assess", "ask", "cover" or "include", whoever is the subject. So it also drops
 * some harmless likely causes about the child's own work ("{name} did not check the answer.", "The remainder was not
 * included in the answer."); the report then shows its own sentence for that mistake.
 */
const MAIN_UNTESTED = new RegExp([
  String.raw`\buntested\b`,
  String.raw`(?:\bnot|\bnever|n['’]t)\s+(?:yet\s+|been\s+|be\s+|really\s+)*(?:tested|checked|measured|assessed|asked|covered|included|part\s+of\s+the\s+(?:test|round))\b`,
  String.raw`\b(?:did\s+not|didn['’]t|does\s+not|doesn['’]t)\s+(?:test|check|measure|assess|ask|cover|include)\b`,
].join("|"), "i");

/**
 * The exact claim the level block already makes when the child cleared the top level (D-133): the child "works" (or may,
 * might, could, can work, or is working) above, beyond or higher than this, that, the, their or the child's level. Only
 * this claim, so the summary does not say it twice. Not other wordings of "ready for more" (a dropped summary costs more
 * than a rare reworded repeat, D-133).
 */
const ABOVE_LEVEL = new RegExp(
  String.raw`\bwork(?:s|ing)?\s+(?:above|beyond|higher\s+than)\s+(?:this|that|the|their|his|her|\{name\}'s)\s+(?:(?:tested|top|highest|current|working)\s+)?level\b`,
  "gi",
);
/** A negation word: the claim in front of which it stands ("is not yet working above this level") is not made. */
const NEGATION = /^(?:not|never|no|nor|cannot|without|neither)$|n['\u2019]t$/i;
/**
 * How many words before the verb a negation still negates the claim (D-133). Punctuation does not count, so a period in
 * "Gr." or in an initial cannot separate a negation from its claim, as a sentence split would. Ten words reach "is not
 * yet ready, at the current Gr. 3 placement, to work above this level".
 */
const NEGATION_WINDOW = 10;

/** The repeated claim, or null: a match of ABOVE_LEVEL with no negation word among the words just before its verb. */
function repeatedClaim(text: string): string | null {
  for (const claim of text.matchAll(ABOVE_LEVEL)) {
    const before = text.slice(0, claim.index).match(/[\p{L}\p{N}'\u2019]+/gu) ?? [];
    if (!before.slice(-NEGATION_WINDOW).some((word) => NEGATION.test(word))) return claim[0];
  }
  return null;
}

/** Which parent's AI text is checked: the report summary, or a likely cause on the report. */
export type ParentText = "summary" | "likely-cause";

/**
 * What a parent's AI text about the child may not say, beyond the rules every AI text follows (#242, #245): the report
 * summary and the likely causes a parent reads. Not the ways to help, which only the admin reads (spec #181). A safety
 * net: the AI reads no "not tested" label or untested list, and below FACT_SPEED_FROM_GRADE no facts timing (reportFacts,
 * profileAiFacts), so it has nothing true to say on either. "speed", for a school grade under FACT_SPEED_FROM_GRADE
 * (D-120: grades 1-4 see accuracy only): in the summary, any timing word (TIMING), as its facts have no timing of any
 * kind; in a likely cause, a sentence about the facts that states their timing, as the main test's pace is in its facts.
 * "untested": that something was not tested (UNTESTED or MAIN_UNTESTED), at every grade; what the test did not ask is
 * code's to say. "repeat", in the summary only: that the child works or may work above the level (ABOVE_LEVEL, D-133);
 * the level block says it, and the AI is not told it (reportFacts). Null when the text may show. Also for stored text when it is read (storedReportModel, storedProfile).
 */
export function parentTextProblem(text: string, grade: Grade, kind: ParentText = "likely-cause"): { problem: "speed" | "untested" | "repeat"; detail: string } | null {
  const anySpeed = grade < FACT_SPEED_FROM_GRADE && kind === "summary" ? text.match(TIMING) : null;
  if (anySpeed) return { problem: "speed", detail: anySpeed[0] };
  if (grade < FACT_SPEED_FROM_GRADE) {
    // A sentence is about the facts when it names them, or the sentence before it does ("... the facts. It was quick.").
    const sentences = text.split(/(?<=[.!?;])\s+/);
    for (const [i, sentence] of sentences.entries()) {
      const aboutFacts = FACTS_TOPIC.test(sentence) || (i > 0 && FACTS_TOPIC.test(sentences[i - 1]));
      const speed = aboutFacts ? sentence.match(TIMING) : null;
      if (speed) return { problem: "speed", detail: speed[0] };
    }
  }
  const untested = text.match(UNTESTED) ?? text.match(MAIN_UNTESTED);
  if (untested) return { problem: "untested", detail: untested[0] };
  const repeat = kind === "summary" ? repeatedClaim(text) : null;
  if (repeat) return { problem: "repeat", detail: repeat };
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
 * lines (the report text does not repeat them). "{name}" stands for the child. The facts timing (the round's length,
 * the time per fact and the speed) only from FACT_SPEED_FROM_GRADE, as the parent's report shows the speed (D-120, #242).
 */
export function reportFacts(m: ReportModel) {
  const f = m.facts;
  const timed = m.level.grade >= FACT_SPEED_FROM_GRADE;
  return {
    child: REPORT_TEXT_NAME,
    school_grade: LEVEL(m.level.grade),
    working_level: LEVEL(m.level.working),
    // D-156: a Grade 9 child's test checks up to grade 8 (D-153), so the level is compared with grade 8, never grade 9.
    ...(m.level.grade > TOP_LEVEL
      ? { highest_level_the_test_checks: LEVEL(TOP_LEVEL), working_level_against_highest_level_tested: m.howWeHelp === "on-grade" ? "the same" : "below" }
      : { working_level_against_school_grade: m.howWeHelp === "on-grade" ? "the same" : m.howWeHelp === "behind" ? "below" : "above" }),
    level_is_estimate: m.level.confidence === "low",
    help_warning: m.helpWarning === true,
    areas: m.strands.map((s) => ({ area: s.name, result: STATUS[s.status], right: s.correct, questions: s.total })),
    number_facts:
      f && f.answered > 0 && f.accuracy && f.speed
        ? {
            what: f.scope, right: f.correct, answered: f.answered, accuracy: FACTS[f.accuracy],
            ...(timed ? { round_seconds: f.seconds, typical_seconds_per_fact: f.secondsPerFact, speed: FACTS[f.speed] } : {}),
          }
        : null,
    work: (m.work ?? []).map((w) => ({ question: w.prompt, answer: w.correct ? "right" : "not right", comment: w.comment })),
  };
}

/**
 * Checks AI report text against the model it was written from: the text rules, then every number must be among the
 * report's facts (reportFacts; a number word counts as its number), then what a parent's text may not say
 * (parentTextProblem). Returns the tidied text to keep, or why it was rejected.
 */
export function checkReportText(model: ReportModel, text: string): ReportTextCheck {
  const check = checkAiText(text, reportFacts(model), REPORT_TEXT_MAX);
  const problem = check.ok ? parentTextProblem(check.text, model.level.grade, "summary") : null;
  return problem ? { ok: false, ...problem } : check;
}

/**
 * The AI text checks for any AI text (the report text, the learner profile's AI parts, #197): the text rules with at
 * most `max` characters, then every number must be among the numbers of `facts`, the facts the AI wrote from (a number
 * word counts as its number). Returns the tidied text to keep, or why it was rejected.
 */
export function checkAiText(text: string, facts: unknown, max: number): ReportTextCheck {
  const tidy = tidyText(text);
  const problem = textProblem(tidy, max);
  if (problem) return { ok: false, ...problem };
  const known = numbersOf(facts);
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
