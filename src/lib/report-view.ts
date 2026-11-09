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
  type Level,
  type Province,
  type ReportFindings,
  type ReportModel,
  type ReportedStrand,
  type StrandStatus,
} from "@/lib/assessment";
import { familyPlanWords as w, familyWindowWords, type FamilyPlanOffer } from "@/lib/family-plan-words";
import type { ReportSrc } from "@/lib/next-step";
import type { BookOne } from "@/lib/report-book-one";
import { formatInZone, zoneForProvince, type FamilyZone } from "@/lib/family-time";
import { CURRICULA } from "@/lib/signup";
import { PLANS, cad, type PlanId } from "@/lib/site";
import { UNIT_TITLES } from "@/lib/workbook-unit-titles";

/** One stored report, ready to show. */
export interface ReportView {
  id: string;
  childName: string;
  /** Current family admission terms. Null means the read failed. */
  planOffer?: FamilyPlanOffer | null;
  province: Province;
  /** The family's postal zone. Older saved/demo inputs may have only a province. */
  timeZone?: FamilyZone;
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
  /**
   * D-305: workbook 1 as the generator would plan it from this test (report-book-one.ts). Absent or null for a family
   * on the waitlist, a test without a learner profile, or a plan that failed: the report then shows "How we help".
   */
  bookOne?: BookOne | null;
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
/**
 * #68: the AI paragraph with the child's name. D-305: a summary written before the help warning was removed may still
 * say the level "may be too high"; that sentence is dropped, as the report no longer makes that claim.
 */
export const summaryText = (v: ReportView): string | null => {
  if (!v.model.summary) return null;
  const sentences = v.model.summary.replaceAll(REPORT_TEXT_NAME, v.childName).split(/(?<=[.!?])\s+/);
  return sentences.filter((s) => !/too high/i.test(s)).join(" ").trim() || null;
};

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
    ? `${thresholds} Clear: one more right or wrong answer would not change the result. Early sign: one more answer could change it.${books(v) ? " Workbook 1 checks early signs." : ""}`
    : `${thresholds} ${v.questions} questions is an early signal, not a final verdict.`;
}

/** The family can start the books (BC, D-082): the report may name workbook 1. */
const books = (v: ReportView) => v.model.callToAction === "card";

/**
 * How sure one result is (#189, D-108): "Clear" or "Early sign". D-305: what workbook 1 does about early signs is said
 * once per section (thresholdsLine, earlySignNote), not on every row. Null for a result stored before the labels.
 */
export function certaintyText(_v: ReportView, certainty: Certainty | undefined): string | null {
  if (!certainty) return null;
  return certainty === "clear" ? "Clear" : "Early sign";
}

/** D-305: the one line under a topic list when any of its results is an early sign; null when all are clear. */
export function earlySignNote(v: ReportView, topics: readonly { certainty: Certainty }[]): string | null {
  if (!topics.some((t) => t.certainty !== "clear")) return null;
  return `Topics not marked Clear are early signs: one more answer could change them.${books(v) ? " Workbook 1 checks them." : ""}`;
}

/**
 * D-305 (Cedric's call with a parent, 2026-11-08): "working at a grade 5 level" read as "only grade 5 work". This says
 * what the working level is, under the ruler; for a family that can start the books, that the books cover more.
 */
export function workingLevelNote(v: ReportView): string {
  const name = v.childName;
  const what = `Working level is the grade where ${name}'s answers show secure skills today.`;
  return books(v)
    ? `${what} It is a starting point, not the only grade ${name}'s workbooks cover: each book also reviews earlier skills and adds harder problems.`
    : what;
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

/**
 * D-258 (#579): the one sentence in place of the area bars of a test whose report has the reliability note, on the
 * Overview and in the monthly summary. The report, which this points to, offers the new test.
 */
export const unreliableAreasText = (name: string) => `The last test may not show ${name}'s level reliably, so the report offers ${name} a new test with new questions.`;

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

/** A day in the family's time zone, for example "October 10, 2026". */
const familyDate = (v: ReportView, at: number) => formatInZone(at, v.timeZone ?? zoneForProvince(v.province), { dateStyle: "long" });

/** The day the test finished, in the family's time zone, for example "October 10, 2026". */
export const reportDate = (v: ReportView) => familyDate(v, Date.parse(v.completedAt));

const DAY_MS = 24 * 60 * 60_000;

// D-305: the "This level may be too high" warning (#71) is gone from the report and the email (Savar, 2026-11-08). The
// model keeps helpWarning for admins: the report alert, and the comparison rule above.

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
  /** Approved family terms repeated after the card is saved. */
  familyTerms?: string;
}

/** Card for BC families (charged on day 30, after the free first month, which starts when the first workbook arrives at your home, D-139); the waitlist for every other province (D-082). */
export function nextStep(v: ReportView): NextStep {
  const name = v.childName;
  if (v.model.callToAction === "card") {
    const offer = v.planOffer ?? null;
    const familyTerms = [offer ? w.monthly(offer.monthly) : "", familyWindowWords(offer), w.siblingPrice].filter(Boolean).join(" ");
    return {
      kind: "card",
      title: w.reportHeading(name),
      text: familyTerms,
      familyTerms,
      plans: offer ? [{ plan: "one", subject: "Math", price: offer.monthly, label: w.monthly(offer.monthly) }] : [],
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
 * D-305: a BC topic in plain words: the unit's short workbook title ("Adding and subtracting"), else the curriculum's
 * own words shortened. The BC wording stays beside it, small (TopicResult.bc).
 */
const plainTopic = (t: { code: string; text: string }) => UNIT_TITLES[t.code] ?? capital(topicName(t.text));

/** One BC topic of the report, with its result: "Grade 4", "6 of 6 right", and "Clear" when it is clear. */
export interface TopicResult {
  code: string;
  /** The plain topic name (plainTopic). */
  title: string;
  /** The BC wording, shortened (topicName). */
  bc: string;
  grade: string;
  level: Level;
  count: string;
  certainty: Certainty;
  /** "Clear", or empty for an early sign: D-305 says that once per section (earlySignNote). */
  sure: string;
}

const topicResult = (t: { code: string; text: string; grade: Level; correct: number; total: number; certainty: Certainty }): TopicResult => ({
  code: t.code,
  title: plainTopic(t),
  bc: capital(topicName(t.text)),
  grade: gradeLabel(t.grade),
  level: t.grade,
  count: `${t.correct} of ${t.total} right`,
  certainty: t.certainty,
  sure: t.certainty === "clear" ? "Clear" : "",
});

/**
 * #198: the report shows this many strengths and gaps in full. The page folds the rest under "Show n more", and the
 * email says the full report has them all: a long list would hide the first ones, which rest on the most answers.
 */
export const STRENGTHS_SHOWN = 6;
export const STRUGGLES_SHOWN = 3;

/** "and 4 more", after the shown ones. */
export const moreCount = (n: number) => `${n} more`;

/** #198 (spec story 5): the BC topics the child is secure in, clear ones first; null when there are none. */
export function strengthsView(v: ReportView): TopicResult[] | null {
  const strengths = v.findings?.strengths ?? [];
  return strengths.length ? strengths.map(topicResult) : null;
}

/** One struggle: its topic and result, one of the child's wrong answers, the likely cause, and where workbook 1 is. */
export interface StruggleView extends TopicResult {
  status: StrandStatus;
  question: string;
  /** The child's answer, as given. */
  answer: string;
  rightAnswer: string;
  /** In plain words; null when neither the AI nor a known mistake gives one. */
  cause: string | null;
  /** D-305: "In workbook 1", "Review in workbook 1" or "In a later book"; null when the report cannot say. */
  cover: string | null;
}

/**
 * D-305: where the books take up a topic the child has not mastered, from workbook 1's real plan (report-book-one.ts):
 * taught or reviewed in workbook 1, or a later book (the rest of its level, or a level above it). Null without a plan,
 * and for a topic below workbook 1's level that it does not review.
 */
function coverOf(v: ReportView, code: string, grade: Level): string | null {
  const book = v.bookOne;
  if (!book) return null;
  if (book.covers[code] === "main") return "In workbook 1";
  if (book.covers[code] === "review") return "Review in workbook 1";
  if (book.later.includes(code) || grade > book.next.grade) return "In a later book";
  return null;
}

/**
 * #198 (spec story 6): each BC topic at or below the school grade that is not secure, with one real wrong answer and the
 * likely cause: the AI's text when it wrote one (#197), else the known mistake the answer matches. Null when none.
 */
function struggles(v: ReportView): StruggleView[] {
  return (v.findings?.struggles ?? []).map((s) => ({
    ...topicResult(s),
    status: s.status,
    question: s.answer.prompt,
    answer: s.answer.response,
    rightAnswer: s.answer.rightAnswer,
    cause: !s.cause ? null
      : s.cause.source === "ai" ? s.cause.text.replaceAll(REPORT_TEXT_NAME, v.childName)
      : `This answer matches a common mistake, where a child ${lowerFirst(s.cause.text)}.`,
    cover: coverOf(v, s.code, s.grade),
  }));
}

/**
 * D-305: "To work on" in two parts. Gaps to fix: topics at or below the working level that the child has not mastered.
 * Next to learn: topics above the working level, up to the school grade. Null when a part is empty.
 */
export function gapsView(v: ReportView): StruggleView[] | null {
  const list = struggles(v).filter((s) => s.level <= v.model.level.working);
  return list.length ? list : null;
}

export function nextView(v: ReportView): StruggleView[] | null {
  const list = struggles(v).filter((s) => s.level > v.model.level.working);
  return list.length ? list : null;
}

/** The one-line explanations of the topic rows, shared by the page and the email. */
export const strengthsNote = (v: ReportView) => `Topics where ${v.childName} got ${STRAND_SECURE_PERCENT}% or more right.`;
export const gapsNote = (v: ReportView) =>
  `Topics at or below ${levelName(v.model.level.working)} that ${v.childName} has not mastered, with one of ${v.childName}'s answers for each.`;
export const nextNote = (v: ReportView) => {
  const { working, grade } = v.model.level;
  const span = grade - working > 1 ? `${levelName(working + 1)} to ${grade}` : levelName(grade);
  return `Topics from ${span} that ${v.childName} has not mastered yet. Later books teach them.`;
};

/** One topic in "Where {child} is": its plain name, and a small line (its grade when it differs, where the books take it up). */
export interface WhereTopic {
  title: string;
  meta: string | null;
}

/** D-305, option B "answer first": every topic the test asked about, in three groups, before the details. */
export interface WhereView {
  secure: WhereTopic[];
  gaps: WhereTopic[];
  next: WhereTopic[];
}

/**
 * Null without findings (no learner profile), or when the test found no topic at all. A topic names its grade when it is
 * not the working level (secure, gaps), or when the next topics span more than one grade.
 */
export function whereView(v: ReportView): WhereView | null {
  if (!v.findings) return null;
  const { working, grade } = v.model.level;
  const meta = (...parts: (string | null)[]) => parts.filter(Boolean).join(" · ") || null;
  const otherGrade = (level: Level) => (level === working ? null : levelName(level));
  const secure = (strengthsView(v) ?? []).map((t) => ({ title: t.title, meta: otherGrade(t.level) }));
  const gaps = (gapsView(v) ?? []).map((t) => ({ title: t.title, meta: meta(otherGrade(t.level), t.cover) }));
  const next = (nextView(v) ?? []).map((t) => ({ title: t.title, meta: grade - working > 1 ? levelName(t.level) : null }));
  return secure.length + gaps.length + next.length ? { secure, gaps, next } : null;
}

/** The three groups' headings and one-line notes, shared by the page and the email. */
export function whereNotes(v: ReportView) {
  const name = v.childName;
  return {
    secure: { title: "Secure", note: `${name} can do these.` },
    gaps: { title: "Gaps to fix", note: `At or below ${levelName(v.model.level.working)}. ${name} should already know these.` },
    next: { title: "Next to learn", note: "For later books." },
  };
}

/** D-305: "What's in workbook 1" in plain words, from the real plan. */
export interface BookOneView {
  note: string;
  main: { title: string; grade: string; skills: string[]; why: string | null };
  review: { title: string; grade: string; items: string[]; why: string | null } | null;
  challenge: { title: string; grade: string; items: string[] } | null;
  path: { title: string; text: string }[];
  footnote: string;
}

const gradeList = (grades: readonly Level[]) => {
  const unique = [...new Set(grades)].sort((a, b) => a - b).map((g) => (g === 0 ? "Kindergarten" : String(g)));
  if (unique.length === 1) return unique[0] === "Kindergarten" ? "Kindergarten" : `Grade ${unique[0]}`;
  return `Grades ${unique.slice(0, -1).join(", ")} and ${unique[unique.length - 1]}`;
};
const join = (items: readonly string[]) => (items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`);
const REVIEW_SKILLS_SHOWN = 3;
/** The review part lists this many units; more say "and n more earlier topics". */
const REVIEW_UNITS_SHOWN = 5;

/** Null without a plan: a family on the waitlist, or a plan that failed. The report then shows "How we help". */
export function bookOneView(v: ReportView): BookOneView | null {
  const book = v.bookOne;
  if (!book || !books(v)) return null;
  const name = v.childName;
  const tally = new Map((v.findings?.struggles ?? []).map((s) => [s.code, s]));
  const mainTitle = book.main.map((u) => u.title).join(" · ");
  const missed = book.main.flatMap((u) => {
    const s = tally.get(u.code);
    return s ? [`${s.correct} of ${s.total}${book.main.length > 1 ? ` in ${u.title}` : ""}`] : [];
  });
  // BC repeats some units from grade to grade ("Facts to 20"): a repeated title names its grade.
  const titles = book.review.map((u) => u.title);
  const reviewTitle = (u: BookOne["review"][number]) => (titles.indexOf(u.title) !== titles.lastIndexOf(u.title) ? `${u.title} (${levelName(u.grade)})` : u.title);
  const reviewItem = (u: BookOne["review"][number]) =>
    `${reviewTitle(u)}: ${u.skills.slice(0, REVIEW_SKILLS_SHOWN).map(lowerFirst).join("; ")}${u.skills.length > REVIEW_SKILLS_SHOWN ? "; and more" : ""}`;
  const moreReview = book.review.length - REVIEW_UNITS_SHOWN;
  const reviewMissed = book.review.some((u) => tally.has(u.code));
  const after: BookOneView["path"] = [{ title: "Workbook 1", text: mainTitle }];
  after.push(book.next.titles.length
    ? { title: "Next books", text: `${book.next.titles.join(" · ")}, then the ${levelName(book.next.grade)} level test` }
    : { title: "Next", text: `The ${levelName(book.next.grade)} level test` });
  if (book.then) {
    after.push({ title: book.then.grade === book.next.grade ? "Then" : `Then ${levelName(book.then.grade)}`, text: book.then.titles.join(" · ") });
  }
  const challenge = [
    ...(book.challenge.harder ? ["Harder questions on the main topic"] : []),
    ...(book.challenge.twoWays ? ["Solve it two ways"] : []),
    ...(book.challenge.showWhatYouKnow ? ["Last day: Show what you know"] : []),
  ];
  return {
    note: `${book.days} days${book.minutes ? `, about ${book.minutes} minutes a day` : ""}. Made from ${name}'s answers.`,
    main: {
      title: mainTitle,
      grade: `${gradeList(book.main.map((u) => u.grade))} · most of each day`,
      skills: book.main.flatMap((u) => u.skills),
      why: missed.length ? `Why: ${name} got ${join(missed)}${book.main.length > 1 ? "" : " of these"} right on the test.` : null,
    },
    review: book.review.length
      ? {
          title: "Earlier skills",
          grade: `${gradeList(book.review.map((u) => u.grade))} · a few questions most days`,
          items: [...book.review.slice(0, REVIEW_UNITS_SHOWN).map(reviewItem), ...(moreReview > 0 ? [`And ${moreReview} more earlier ${moreReview === 1 ? "topic" : "topics"}`] : [])],
          why: reviewMissed ? `Why: ${name} missed some of these on the test.` : null,
        }
      : null,
    challenge: challenge.length ? { title: "Harder problems", grade: "On the main topic", items: challenge } : null,
    path: after,
    footnote: `Each book ends with a photo check-in. What ${name} has mastered drops out, and the next book moves on. ${name} never sees a grade number on the pages.`,
  };
}
