// The parent's report in plain words (#65). The report page and the report email both use this, so they say the same
// thing (spec #54: "the report page in the account and the email show the same report model").
// Pure: no network, database or clock. Every number here comes from the report model or the stored report.
import {
  FACTS_QUICK_MS,
  FACTS_SECURE_PERCENT,
  RETAKE_DAYS,
  STRAND_DEVELOPING_PERCENT,
  STRAND_SECURE_PERCENT,
  WORKING_LEVEL_PERCENT,
  type Level,
  type Province,
  type ReportModel,
  type StrandStatus,
} from "@/lib/assessment";
import type { ReportSrc } from "@/lib/next-step";
import { CURRICULA } from "@/lib/signup";
import { PLANS, type PlanId } from "@/lib/site";

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
}

/** "Right answer" or "Not right", under each piece of the child's work (#67, D-087). */
export const workResult = (correct: boolean) => (correct ? "Right answer" : "Not right");

/** The report page in the parent's account. */
export const reportPath = (id: string) => `/account/report/${id}`;

/** "grade 3", or "kindergarten" for level 0. */
export const levelName = (level: Level | number) => (level === 0 ? "kindergarten" : `grade ${level}`);

export const levelSentence = (v: ReportView) => `${v.childName} is working at a ${levelName(v.model.level.working)} level.`;

const COUNT = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight"];

/** One plain sentence against the school grade: below, matches, or above (D-084: say it plainly, never to sell). */
export function verdictSentence(v: ReportView): string {
  const { working, grade } = v.model.level;
  if (working === grade) return `That matches ${v.childName}'s school grade.`;
  const gap = Math.abs(working - grade);
  const grades = `${COUNT[gap] ?? gap} grade${gap === 1 ? "" : "s"}`;
  return `That is ${grades} ${working < grade ? "below" : "above"} ${v.childName}'s school grade (${levelName(grade)}).`;
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
  return notes;
}

export const STATUS_LABEL: Record<StrandStatus, string> = {
  secure: "Secure",
  developing: "Developing",
  "needs-attention": "Needs attention",
};

/** The legend under the areas: the thresholds, and what the question count can and cannot say (D-084). */
export const thresholdsLine = (v: ReportView) =>
  `Secure: ${STRAND_SECURE_PERCENT}% or more right. Developing: ${STRAND_DEVELOPING_PERCENT}-${STRAND_SECURE_PERCENT - 1}%. Needs attention: under ${STRAND_DEVELOPING_PERCENT}%. ${v.questions} questions is an early signal, not a final verdict.`;

/** Share right, in whole percent, for the meter. */
export const sharePercent = (s: { correct: number; total: number }) => (s.total > 0 ? Math.round((s.correct / s.total) * 100) : 0);

const FACTS_LABEL = { secure: "Secure", quick: "Quick", "needs-practice": "Needs practice" } as const;

/** The number facts row (#70): accuracy beside speed, never speed alone. Slow speed needs practice; it is never "behind". */
export interface FactsView {
  scope: string;
  round: string;
  /** Both null, or both set: speed never shows without accuracy. */
  accuracy: { value: string; label: string } | null;
  speed: { value: string; label: string } | null;
  note: string | null;
  thresholds: string;
}

/** The facts row, or null when the child had no facts section (and for reports stored before #70, which have no facts). */
export function factsView(v: ReportView): FactsView | null {
  const f = v.model.facts ?? null;
  if (!f) return null;
  const base = {
    scope: `${f.scope}.`,
    round: `A ${f.seconds}-second round, only with facts for this grade.`,
    thresholds: `Secure: ${FACTS_SECURE_PERCENT}% or more right. Quick: ${FACTS_QUICK_MS / 1000} seconds or less a fact.`,
  };
  if (f.answered === 0 || !f.accuracy || !f.speed || f.secondsPerFact === null) {
    return { ...base, accuracy: null, speed: null, note: `${v.childName} answered no facts in the ${f.seconds} seconds.` };
  }
  return {
    ...base,
    accuracy: { value: `${f.correct} of ${f.answered} right`, label: FACTS_LABEL[f.accuracy] },
    speed: { value: `typically ${f.secondsPerFact} second${f.secondsPerFact === 1 ? "" : "s"} a fact`, label: FACTS_LABEL[f.speed] },
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
export function helpWarning(v: ReportView): { title: string; text: string; retake: string } | null {
  if (!v.model.helpWarning) return null;
  const opensAt = Date.parse(v.completedAt) + RETAKE_DAYS * DAY_MS;
  // The last moment of the 24 hours from opensAt falls on the day after it, unless it opens at midnight.
  const firstWholeDay = familyDate(v, opensAt + DAY_MS - 1);
  return {
    title: "This level may be too high",
    text: "We saw signs in this test that can make a level look higher than it is, such as help with some questions or answers given very quickly.",
    retake: `For a level you can trust, ${v.childName} can take a new test alone, with new questions, from ${firstWholeDay}.`,
  };
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
  subject: "Math" | "Math + Reading";
  price: number;
  label: string;
}

/** The plans offered from a math report: math alone (the one-subject plan), or math + reading. */
export const REPORT_PLANS: readonly PlanOption[] = [
  { plan: "one", subject: "Math", price: PLANS.one.price, label: `Math, CAD ${PLANS.one.price} a month` },
  { plan: "both", subject: "Math + Reading", price: PLANS.both.price, label: `Math + reading, CAD ${PLANS.both.price} a month` },
];

export interface NextStep {
  kind: ReportModel["callToAction"];
  title: string;
  text: string;
  /** The plans to choose on the report page: both for BC, none for the waitlist. */
  plans: readonly PlanOption[];
  /** The report email's button. Emails carry links only, so it opens the report at this step. */
  email: { label: string; step: NextStepKey };
}

/** Card for BC families (charged when the first workbook ships, D-053); the waitlist for every other province (D-082). */
export function nextStep(v: ReportView): NextStep {
  const name = v.childName;
  if (v.model.callToAction === "card") {
    return {
      kind: "card",
      title: `Start ${name}'s books`,
      text: `Math is CAD ${PLANS.one.price} a month, or math + reading CAD ${PLANS.both.price} a month, with delivery included. We charge nothing until the first workbook ships. 30-day money-back guarantee from the first payment. Cancel anytime.`,
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
  switch (v.model.howWeHelp) {
    case "behind":
      return { title, text: `${name}'s first book starts at ${levelName(working)} work${practice}. After each photo check-in, we see what is secure and move the next book on: to ${levelName(grade)} work, then past it when ${name} is ready.` };
    case "on-grade":
      return { title, text: `${name}'s books keep ${levelName(grade)} work steady${practice}, and bring in ${levelName(grade + 1)} topics when ${name} is ready, so ${name} sees them before the class does.` };
    case "ahead":
      return { title, text: `${name} already does ${levelName(working)} work. The books start there${practice}, so ${name} learns new things instead of repeating known work, and the topics from school stay covered.` };
  }
}
