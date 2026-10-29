// The parent's report in plain words (#65). The report page and the report email both use this, so they say the same
// thing (spec #54: "the report page in the account and the email show the same report model").
// Pure: no network, database or clock. Every number here comes from the report model or the stored report.
import {
  FACT_SPEED_FROM_GRADE,
  FACTS_QUICK_MS,
  FACTS_SECURE_PERCENT,
  REPORT_TEXT_NAME,
  RETAKE_DAYS,
  STRAND_DEVELOPING_PERCENT,
  TOO_FAST_MS,
  STRAND_SECURE_PERCENT,
  TOP_LEVEL,
  UP_ROUTE_TOP,
  WORKING_LEVEL_PERCENT,
  comparedGrade,
  type Certainty,
  type FindingTopic,
  type Level,
  type Province,
  type ReportFindings,
  type ReportModel,
  type ReportedStrand,
  type StrandStatus,
} from "@/lib/assessment";
import type { ReportSrc } from "@/lib/next-step";
import { CURRICULA } from "@/lib/signup";
import { PLANS, cad, type PlanId } from "@/lib/site";

/** One stored report, ready to show. */
export interface ReportView {
  id: string;
  childName: string;
  province: Province;
  /** When the test finished (ISO). */
  completedAt: string;
  /** Questions the child answered. */
  questions: number;
  /** Minutes on the questions, from the answer times. */
  minutes: number;
  model: ReportModel;
  /** Short-lived signed URLs of the work drawings, by stored path (#67). Only the report page has them; the email does not. */
  workImages?: Record<string, string>;
  /**
   * #198: the parent's part of the test's learner profile (reportFindings), read when the report is shown, so it has
   * the AI parts once they exist. Absent or null without a stored profile: a test not scored against BC, or a report
   * shown before its profile was stored. Never the profile itself: its admin-only parts stay on the server.
   */
  findings?: ReportFindings | null;
}

/** "Right answer" or "Not right", under each piece of the child's work (#67, D-087). */
export const workResult = (correct: boolean) => (correct ? "Right answer" : "Not right");

/** The report page in the parent's account. */
export const reportPath = (id: string) => `/account/report/${id}`;

/** "grade 3", or "kindergarten" for level 0. */
export const levelName = (level: Level | number) => (level === 0 ? "kindergarten" : `grade ${level}`);

export const levelSentence = (v: ReportView) => `${v.childName} is working at a ${levelName(v.model.level.working)} level.`;

const COUNT = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];

/**
 * True for a Grade 9 child whose test checked skills up to grade 8 only: a test from before D-158 (D-156). Since D-158
 * a Grade 9 test asks grade 9 questions and is compared with grade 9, like every other grade.
 */
export const aboveTestedGrades = (v: Pick<ReportView, "model">) => v.model.level.grade > comparedGrade(v.model.level);

/**
 * The levels on the report's ruler: K to grade 8, and K to grade 9 when the test asked grade 9 (a Grade 9 child since
 * D-158). A Grade 7 or 8 child's ruler never shows grade 9 (D-153 rule 2).
 */
export const rulerLevels = (v: Pick<ReportView, "model">): Level[] =>
  Array.from({ length: Math.max(comparedGrade(v.model.level), UP_ROUTE_TOP) + 1 }, (_, i) => i as Level);

/**
 * D-156: for a Grade 9 child tested before D-158, what the test checked and how grade 9 work starts, in plain words.
 * The report says it under the level.
 */
export const gradeNineNote = (name: string) =>
  `This test checks math skills up to grade 8, so it does not show grade 9 work. In the program, ${name} starts grade 9 topics by passing level tests on the grade 8 skills each one builds on.`;

/** One plain sentence against the school grade: below, matches, or above (D-084: say it plainly, never to sell). */
export function verdictSentence(v: ReportView): string {
  const { working, grade } = v.model.level;
  // D-156: a Grade 9 child tested before D-158 is compared with grade 8, the highest level that test checked.
  if (aboveTestedGrades(v)) {
    const top = comparedGrade(v.model.level);
    if (working >= top) return `Grade 8 is the highest level this test checks, so that is as high as it can show.`;
    const gap = top - working;
    return `That is ${COUNT[gap] ?? gap} grade${gap === 1 ? "" : "s"} below grade 8, the highest level this test checks.`;
  }
  if (working === grade) return `That matches ${v.childName}'s school grade.`;
  const gap = Math.abs(working - grade);
  const grades = `${COUNT[gap] ?? gap} grade${gap === 1 ? "" : "s"}`;
  return `That is ${grades} ${working < grade ? "below" : "above"} ${v.childName}'s school grade (${levelName(grade)}).`;
}

/**
 * #68: the paragraph the AI wrote from the report model, with the child's name in place of REPORT_TEXT_NAME. Null when
 * the report has none (the AI is off or failed, or its text broke a rule): the plain sentences then stand alone.
 */
export const summaryText = (v: ReportView): string | null => (v.model.summary ? v.model.summary.replaceAll(REPORT_TEXT_NAME, v.childName) : null);

const BAND_WORDS = { lower: "lower quarter", middle: "middle half", upper: "upper quarter" } as const;
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : n % 10 === 1 ? "st" : n % 10 === 2 ? "nd" : n % 10 === 3 ? "rd" : "th"}`;

/** Same comparison words in account, read-only admin and email. Legacy stage-only models show no invented rank. */
export function comparisonView(v: ReportView): { title: string; text: string; note: string } | null {
  const c = v.model.comparison;
  if (v.model.helpWarning || c.stage === "scale") return null;
  const title = "Among children who took this test";
  const scope = `${c.n} ${levelName(v.model.level.grade)} children who took this test`;
  const source = "Each child counts once, using their latest completed test when this report was made. Tests with signs of help and test accounts are left out.";
  if (c.stage === "bands" && c.band) return {
    title,
    text: `${v.childName}'s result is in the ${BAND_WORDS[c.band]} of ${scope}.`,
    note: `${source} Equal results share the middle rank.`,
  };
  if (c.stage === "percentile" && c.percentile !== undefined) return {
    title,
    text: `${v.childName}'s result is at the ${ordinal(c.percentile)} percentile among ${scope}.`,
    note: `${source} The percentile is the share of results below this one, with half of equal results included.`,
  };
  return null;
}

/** Says when the level is a floor or an estimate, so the parent never reads more into it than the test measured. */
export function levelNotes(v: ReportView): string[] {
  const { working, atCeiling, confidence } = v.model.level;
  const name = v.childName;
  const notes: string[] = [];
  // At the ceiling, the working level is the highest level the test reached.
  if (atCeiling) {
    notes.push(`The test went up to ${levelName(working)}, and ${name} got ${WORKING_LEVEL_PERCENT}% or more of those questions right. ${name} may work above this level.`);
  }
  if (confidence === "low") notes.push(`${name} got under ${WORKING_LEVEL_PERCENT}% right at every level in this test, so ${levelName(working)} is an estimate.`);
  if (aboveTestedGrades(v)) notes.push(gradeNineNote(name));
  return notes;
}

/**
 * What each area covers, under its name in the "By area" table (D-087). It says what the area is, never how the child
 * did: the status and the count say that.
 */
export const AREA_NOTE: Record<ReportedStrand, string> = {
  number: "Counting, place value, and adding, subtracting, multiplying and dividing.",
  fractions: "Fractions and decimals, and in the later grades ratio and percent.",
  algebra: "Patterns, rules and missing numbers.",
  shapes: "Shapes, measuring, time, graphs and chance.",
};

export const STATUS_LABEL: Record<StrandStatus, string> = {
  secure: "Secure",
  developing: "Developing",
  "needs-attention": "Needs attention",
};

/**
 * The legend under the areas: the thresholds, and what the question count can and cannot say (D-084). With the
 * certainty labels (#189), it says what Clear and Early sign mean; a report stored before them keeps the early-signal line.
 */
export function thresholdsLine(v: ReportView): string {
  const thresholds = `Secure: ${STRAND_SECURE_PERCENT}% or more right. Developing: ${STRAND_DEVELOPING_PERCENT}-${STRAND_SECURE_PERCENT - 1}%. Needs attention: under ${STRAND_DEVELOPING_PERCENT}%.`;
  const labelled = v.model.strands.some((s) => s.certainty);
  return labelled
    ? `${thresholds} Clear: one more right or wrong answer would not change the result. Early sign: one more answer could change it.`
    : `${thresholds} ${v.questions} questions is an early signal, not a final verdict.`;
}

/**
 * How sure one result is (#189, D-108): "Clear", or "Early sign: workbook 1 checks this". A family on the waitlist has
 * no workbook yet, so their early sign names none. Null for a result stored before the labels.
 */
export function certaintyText(v: ReportView, certainty: Certainty | undefined): string | null {
  if (!certainty) return null;
  if (certainty === "clear") return "Clear";
  return v.model.callToAction === "card" ? "Early sign: workbook 1 checks this" : "Early sign";
}

/** #189: wrong answers from a run of very fast answers that left the score; null when there were none. */
export function leftOutLine(v: ReportView): string | null {
  const n = v.model.leftOut ?? 0;
  if (n === 0) return null;
  return n === 1
    ? `1 wrong answer from a run of very fast answers was left out of the score. It looks like a guess, not what ${v.childName} knows.`
    : `${n} wrong answers from a run of very fast answers were left out of the score. They look like guesses, not what ${v.childName} knows.`;
}

/**
 * When the child's next test opens, as the account's start rules say (#189, D-108): "open" now, or it "opens" at `at`
 * (epoch ms). The report page reads it; the email and the admin's copy do not know it, so they pass nothing.
 */
export type RetakeState = { kind: "open" } | { kind: "opens"; at: number };

/** The first whole day a test that opens at `at` is open, in the family's time zone, so the date is true all day. */
const firstWholeDay = (v: ReportView, at: number) => familyDate(v, at + DAY_MS - 1);

/**
 * #189: more than 30% of the answers were very fast, so the result may not be reliable. The offer follows `retake`: a
 * new test now (the bypass of the 30-day wait, at most once per 30 days, D-108), the day it opens, or, when unknown,
 * no time at all. Null at a steady pace, and for reports stored before #189.
 */
/** When the note and the help warning say the next test opens: now, from a day in the family's time zone, or unknown. */
export type RetakeWhen = { kind: "now" } | { kind: "from"; date: string } | { kind: "unknown" };

export function retakeWhen(v: ReportView, retake?: RetakeState): RetakeWhen {
  if (!retake) return { kind: "unknown" };
  return retake.kind === "open" ? { kind: "now" } : { kind: "from", date: firstWholeDay(v, retake.at) };
}

export interface ReliabilityNote {
  title: string;
  text: string;
  offer: string;
  /** The count the text gives. */
  veryFast: number;
  answers: number;
  /** When the offer says the next test opens. */
  when: RetakeWhen;
}

export function reliabilityNote(v: ReportView, retake?: RetakeState): ReliabilityNote | null {
  const r = v.model.reliability;
  if (!r) return null;
  const name = v.childName;
  const when = retakeWhen(v, retake);
  const offer = when.kind === "unknown"
    ? `${name} can take a new test, with new questions. Your account shows when it opens.`
    : when.kind === "now"
      ? `${name} can take a new test now, with new questions. There is no ${RETAKE_DAYS}-day wait.`
      : `${name} can take a new test, with new questions, from ${when.date}.`;
  return {
    title: "This result may not be reliable",
    text: `${name} answered ${r.veryFast} of ${r.answers} questions in under ${TOO_FAST_MS / 1000} seconds. Most questions take longer than that to work out, so this report may not show what ${name} can do.`,
    offer,
    veryFast: r.veryFast,
    answers: r.answers,
    when,
  };
}

/** Share right, in whole percent, for the meter. */
export const sharePercent = (s: { correct: number; total: number }) => (s.total > 0 ? Math.round((s.correct / s.total) * 100) : 0);

const FACTS_LABEL = { secure: "Secure", quick: "Quick", "needs-practice": "Needs practice" } as const;

/** One facts measure: in words (value), as a label, and as a large number with a line under it (D-087, the report page). */
export interface FactsMeasure {
  value: string;
  label: string;
  big: string;
  detail: string;
}

/**
 * The number facts row (#70): accuracy beside speed, never speed alone. Slow speed needs practice; it is never "behind".
 * Grades 1-4 see accuracy only (FACT_SPEED_FROM_GRADE, D-120).
 */
export interface FactsView {
  scope: string;
  round: string;
  accuracy: FactsMeasure | null;
  /** Set only with accuracy, and only from FACT_SPEED_FROM_GRADE. */
  speed: FactsMeasure | null;
  note: string | null;
  thresholds: string;
}

/**
 * The facts row, or null when the child had no facts section (and for reports stored before #70, which have no facts).
 * `speed`: whether it shows the speed; by default from FACT_SPEED_FROM_GRADE (the parent's report). Savar's alert shows it at every grade.
 */
export function factsView(v: ReportView, { speed: withSpeed = v.model.level.grade >= FACT_SPEED_FROM_GRADE } = {}): FactsView | null {
  const f = v.model.facts ?? null;
  if (!f) return null;
  const base = {
    scope: `${f.scope}.`,
    round: `A ${f.seconds}-second round, only with facts for this grade.`,
    thresholds: `Secure: ${FACTS_SECURE_PERCENT}% or more right.${withSpeed ? ` Quick: ${FACTS_QUICK_MS / 1000} seconds or less a fact.` : ""}`,
  };
  if (f.answered === 0 || !f.accuracy || !f.speed || f.secondsPerFact === null) {
    return { ...base, accuracy: null, speed: null, note: `${v.childName} answered no facts in the ${f.seconds} seconds.` };
  }
  const right = `${f.correct} of ${f.answered} right`;
  const accuracy = { value: right, label: FACTS_LABEL[f.accuracy], big: `${Math.round((f.correct / f.answered) * 100)}%`, detail: right };
  if (!withSpeed) return { ...base, accuracy, speed: null, note: null };
  return {
    ...base,
    accuracy,
    speed: {
      value: `typically ${f.secondsPerFact} second${f.secondsPerFact === 1 ? "" : "s"} a fact`,
      label: FACTS_LABEL[f.speed],
      big: `${f.secondsPerFact} s`,
      detail: "typical time for one fact",
    },
    note: f.speed === "needs-practice" ? `Speed comes with practice. It does not change ${v.childName}'s working level.` : null,
  };
}

// The main time zone of each province. "other" is mostly Quebec and the Atlantic provinces.
const TIME_ZONE: Record<Province, string> = {
  BC: "America/Vancouver",
  AB: "America/Edmonton",
  SK: "America/Regina",
  MB: "America/Winnipeg",
  ON: "America/Toronto",
  other: "America/Toronto",
};

/** A day in the family's time zone, for example "October 10, 2026". */
const familyDate = (v: ReportView, at: number) => new Intl.DateTimeFormat("en-CA", { dateStyle: "long", timeZone: TIME_ZONE[v.province] }).format(new Date(at));

/** The day the test finished, in the family's time zone, for example "October 10, 2026". */
export const reportDate = (v: ReportView) => familyDate(v, Date.parse(v.completedAt));

const DAY_MS = 24 * 60 * 60_000;

/**
 * #71: help was likely, so the level may be too high. The flags behind it never reach the parent. The retake follows
 * the 30-day rule of #72 (RETAKE_DAYS after this test finished): the date is the first whole day the next test is
 * open, in the family's time zone, so it is true all day. The account shows the exact time.
 */
export function helpWarning(v: ReportView, retake?: RetakeState): { title: string; text: string; retake: string } | null {
  if (!v.model.helpWarning) return null;
  const title = "This level may be too high";
  const text = "We saw signs in this test that can make a level look higher than it is, such as help with some questions or answers given very quickly.";
  const trust = `For a level you can trust, ${v.childName} can take a new test alone, with new questions`;
  // #189: after a result that may not be reliable, the retake line agrees with the reliability note (D-108).
  if (v.model.reliability) {
    const when = retakeWhen(v, retake);
    const tail = when.kind === "unknown" ? ". Your account shows when it opens." : when.kind === "now" ? ". It is open now." : `, from ${when.date}.`;
    return { title, text, retake: `${trust}${tail}` };
  }
  // The last moment of the 24 hours from the opening falls on the day after it, unless it opens at midnight.
  return { title, text, retake: `${trust}, from ${firstWholeDay(v, Date.parse(v.completedAt) + RETAKE_DAYS * DAY_MS)}.` };
}

/** The short curriculum name: "BC", "Ontario". */
const curriculumName = (p: Province) => (p === "BC" ? "BC" : CURRICULA[p]);

/** "36 questions in 34 minutes". */
export const questionsAndMinutes = (v: ReportView) => `${v.questions} questions in ${v.minutes} minute${v.minutes === 1 ? "" : "s"}`;

/** The closing line. Another province is scored against BC with no note (D-083). */
export function metaLine(v: ReportView): string {
  const parts = ["Math placement", reportDate(v), questionsAndMinutes(v)];
  if (v.province !== "other") parts.push(`measured against ${curriculumName(v.province)} grade expectations`);
  return parts.join(" · ");
}

/** The step a report email link opens: the plan choice (BC) or the waitlist (every other province). */
export type NextStepKey = "plan" | "waitlist";

/** One plan a BC family can choose (#66). Prices come from the site's plans. */
export interface PlanOption {
  plan: PlanId;
  /** The subject on the Stripe customer, as the reserve form sends it. */
  subject: "Math";
  price: number;
  label: string;
}

/** The plans offered from a math report: math only, for now (Savar, 2026-10-11). */
export const REPORT_PLANS: readonly PlanOption[] = [
  { plan: "one", subject: "Math", price: PLANS.one.price, label: `Math, CAD ${cad(PLANS.one.price)} a month` },
];

export interface NextStep {
  kind: ReportModel["callToAction"];
  title: string;
  text: string;
  /** The plans to choose on the report page: math for BC, none for the waitlist. */
  plans: readonly PlanOption[];
  /** The report email's button. Emails carry links only, so it opens the report at this step. */
  email: { label: string; step: NextStepKey };
}

/** Card for BC families (charged on day 30, after the free first month, which starts when the first workbook ships, D-139); the waitlist for every other province (D-082). */
export function nextStep(v: ReportView): NextStep {
  const name = v.childName;
  if (v.model.callToAction === "card") {
    return {
      kind: "card",
      title: `Start ${name}'s books`,
      text: `Math is CAD ${cad(PLANS.one.price)} a month, delivery included. The first month is free, starting when the first workbook ships. Cancel anytime.`,
      plans: REPORT_PLANS,
      email: { label: `Choose a plan for ${name}`, step: "plan" },
    };
  }
  return {
    kind: "waitlist",
    title: v.province === "other" ? "Books for more provinces are coming" : `Books for the ${CURRICULA[v.province]} curriculum are coming`,
    text: `Join the waitlist and we will email you when they are ready. ${name}'s report stays in your account.`,
    plans: [],
    email: { label: "Join the waitlist", step: "waitlist" },
  };
}

/** The id of the next step on the report page, so a link can open the page there. */
export const NEXT_STEP_ANCHOR = "rpt-next";

/**
 * The report page as a parent comes back to it: from the email (src), at a step. A signed-out parent signs in first
 * and returns here, so the link still lands on the step.
 */
export function reportReturnPath(id: string, { src, step }: { src: ReportSrc; step: NextStepKey | null }): string {
  const query = new URLSearchParams();
  if (src === "email") query.set("src", "email");
  if (step) query.set("step", step);
  const qs = query.toString();
  return `${reportPath(id)}${qs ? `?${qs}` : ""}${step ? `#${NEXT_STEP_ANCHOR}` : ""}`;
}

const HELP_TITLE: Record<ReportModel["howWeHelp"], string> = {
  behind: "Catch up, then move ahead",
  "on-grade": "Get ahead",
  ahead: "Go further",
};

/**
 * What the books do for this child (D-084): behind = catch up, then move ahead; on grade = get ahead; ahead = go further.
 * Extra practice is named only when an area measured below Secure: never invent a weakness.
 */
export function howWeHelp(v: ReportView): { title: string; text: string } {
  const { working, grade } = v.model.level;
  const name = v.childName;
  const practice = v.model.strands.some((s) => s.status !== "secure") ? ", with extra practice in the areas marked Developing or Needs attention" : "";
  const title = HELP_TITLE[v.model.howWeHelp];
  // D-153, D-156: a Grade 8 child (and a Grade 9 child tested before D-158) gets grade 9 topics only through the level
  // tests, never straight from this test.
  const compared = comparedGrade(v.model.level);
  const gradeNine = `grade 9 topics one level at a time, each after ${name} passes the level test on the grade 8 skills it builds on`;
  // D-158: a Grade 9 child tested at grade 9. Grade 9 is the program's last grade, so the books go deeper, not past it.
  if (compared === TOP_LEVEL) {
    switch (v.model.howWeHelp) {
      case "behind":
        return { title, text: `${name}'s first book starts at ${levelName(working)} work${practice}. After each photo check-in, we see what is secure and move the next book on, up to grade 9 work.` };
      case "on-grade":
        return { title, text: `${name}'s books keep grade 9 work steady${practice}, and add harder grade 9 problems when ${name} is ready.` };
      case "ahead":
        break;
    }
  }
  if (grade >= UP_ROUTE_TOP && compared === UP_ROUTE_TOP) {
    switch (v.model.howWeHelp) {
      case "behind":
        return { title, text: `${name}'s first book starts at ${levelName(working)} work${practice}. After each photo check-in, we see what is secure and move the next book on: to grade 8 work, then to ${gradeNine}.` };
      case "on-grade":
        return { title, text: `${name}'s books keep grade 8 work steady${practice}, and bring in ${gradeNine}.` };
      case "ahead":
        break;
    }
  }
  switch (v.model.howWeHelp) {
    case "behind":
      return { title, text: `${name}'s first book starts at ${levelName(working)} work${practice}. After each photo check-in, we see what is secure and move the next book on: to ${levelName(grade)} work, then past it when ${name} is ready.` };
    case "on-grade":
      return { title, text: `${name}'s books keep ${levelName(grade)} work steady${practice}, and bring in ${levelName(grade + 1)} topics when ${name} is ready, so ${name} sees them before the class does.` };
    case "ahead":
      return { title, text: `${name} already does ${levelName(working)} work. The books start there${practice}, so ${name} learns new things instead of repeating known work, and the topics from school stay covered.` };
  }
}

/** "Grade 4", or "Kindergarten" for level 0. */
const gradeLabel = (level: Level) => (level === 0 ? "Kindergarten" : `Grade ${level}`);
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/**
 * #198: a BC standard as a short, plain topic: the curriculum's own words, without the parts in brackets and without
 * the "using ..." or "including ..." part that says how it is taught. "increasing and decreasing patterns, using tables
 * and charts" is "increasing and decreasing patterns".
 */
export const topicName = (text: string) =>
  text.replace(/\s*\([^)]*\)/g, "").replace(/,\s+(using|introducing|including|based on|concretely|both|single)\b.*$/, "").trim();

/**
 * "a", "a and b", "a, b and c"; with semicolons when a topic has a comma of its own. A topic of another grade than
 * `grade` names its grade ("grade 5 addition and subtraction facts to 20"): BC repeats some topics from grade to grade.
 */
function topicList(topics: readonly FindingTopic[], grade: number): string {
  const names = topics.map((t) => `${t.grade === grade ? "" : `${levelName(t.grade)} `}${topicName(t.text)}`);
  if (names.length < 2) return names.join("");
  const comma = names.some((n) => n.includes(",")) ? "; " : ", ";
  return `${names.slice(0, -1).join(comma)}${comma === "; " ? "; and " : " and "}${names[names.length - 1]}`;
}

/** One BC topic of the report, with its result: "Grade 4", "6 of 6 right", and how sure. */
export interface TopicResult {
  code: string;
  title: string;
  grade: string;
  count: string;
  certainty: Certainty;
  /** "Clear", or "Early sign: workbook 1 checks this" (certaintyText). */
  sure: string;
}

const topicResult = (v: ReportView, t: { code: string; text: string; grade: Level; correct: number; total: number; certainty: Certainty }): TopicResult => ({
  code: t.code,
  title: capital(topicName(t.text)),
  grade: gradeLabel(t.grade),
  count: `${t.correct} of ${t.total} right`,
  certainty: t.certainty,
  sure: certaintyText(v, t.certainty) ?? "",
});

/**
 * #198: the report shows this many strengths and struggles in full. The page folds the rest under "Show n more", and
 * the email says the full report has them all: a long list would hide the first ones, which rest on the most answers.
 */
export const STRENGTHS_SHOWN = 6;
export const STRUGGLES_SHOWN = 3;

/** The one-line explanations of the new rows (#198), shared by the page and the email. */
export const strengthsNote = (v: ReportView) => `BC topics where ${v.childName} got ${STRAND_SECURE_PERCENT}% or more right.`;
export const strugglesNote = (v: ReportView) =>
  `BC topics up to ${levelName(v.model.level.grade)} where ${v.childName} got under ${STRAND_SECURE_PERCENT}% right, with one of ${v.childName}'s answers for each.`;
/** "and 4 more", after the shown ones. */
export const moreCount = (n: number) => `${n} more`;

/** #198 (spec story 5): the BC topics the child is secure in, clear ones first; null when there are none. */
export function strengthsView(v: ReportView): TopicResult[] | null {
  const strengths = v.findings?.strengths ?? [];
  return strengths.length ? strengths.map((s) => topicResult(v, s)) : null;
}

/** One struggle: its topic and result, one of the child's wrong answers, and the likely cause. */
export interface StruggleView extends TopicResult {
  status: StrandStatus;
  question: string;
  /** The child's answer, as given. */
  answer: string;
  rightAnswer: string;
  /** In plain words; null when neither the AI nor a known mistake gives one. */
  cause: string | null;
}

/**
 * #198 (spec story 6): each BC topic at or below the school grade that is not secure, with one real wrong answer and the
 * likely cause: the AI's text when it wrote one (#197), else the known mistake the answer matches. Null when none.
 */
export function strugglesView(v: ReportView): StruggleView[] | null {
  const struggles = v.findings?.struggles ?? [];
  if (!struggles.length) return null;
  return struggles.map((s) => ({
    ...topicResult(v, s),
    status: s.status,
    question: s.answer.prompt,
    answer: s.answer.response,
    rightAnswer: s.answer.rightAnswer,
    cause: !s.cause ? null
      : s.cause.source === "ai" ? s.cause.text.replaceAll(REPORT_TEXT_NAME, v.childName)
      : `This answer matches a common mistake, where a child ${lowerFirst(s.cause.text)}.`,
  }));
}

/**
 * #198 (spec story 9): "Workbook 1 focuses on X. We will challenge {child} on Y." Text only, from the AI's workbook
 * plan (#197). Null without it, and for a family on the waitlist, which has no workbook yet.
 */
export function workbookPreview(v: ReportView): string | null {
  const preview = v.findings?.preview;
  if (!preview || v.model.callToAction !== "card") return null;
  const { grade } = v.model.level;
  const focus = preview.focus.length ? `Workbook 1 focuses on ${topicList(preview.focus, grade)}.` : null;
  const challenge = preview.challenge.length ? `We will challenge ${v.childName} on ${topicList(preview.challenge, grade)}.` : null;
  return [focus, challenge].filter(Boolean).join(" ") || null;
}
