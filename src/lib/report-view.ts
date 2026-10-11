// The parent's report in plain words (#65). The report page and the report email both use this, so they say the same
// thing (spec #54: "the report page in the account and the email show the same report model").
// Pure: no network, database or clock. Every number here comes from the report model or the stored report.
import {
  STRAND_DEVELOPING_PERCENT,
  STRAND_SECURE_PERCENT,
  WORKING_LEVEL_PERCENT,
  type Level,
  type Province,
  type ReportModel,
  type StrandStatus,
} from "@/lib/assessment";
import { CURRICULA } from "@/lib/signup";
import { PLANS } from "@/lib/site";

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
}

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

// The main time zone of each province. "other" is mostly Quebec and the Atlantic provinces.
const TIME_ZONE: Record<Province, string> = {
  BC: "America/Vancouver",
  AB: "America/Edmonton",
  SK: "America/Regina",
  MB: "America/Winnipeg",
  ON: "America/Toronto",
  other: "America/Toronto",
};

/** The day the test finished, in the family's time zone, for example "October 10, 2026". */
export const reportDate = (v: ReportView) =>
  new Intl.DateTimeFormat("en-CA", { dateStyle: "long", timeZone: TIME_ZONE[v.province] }).format(new Date(v.completedAt));

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

export interface NextStep {
  kind: ReportModel["callToAction"];
  title: string;
  text: string;
  /** Until #66 adds plan buttons and one-click waitlist here, the action opens the plans and the reserve form on the home page. */
  action: { label: string; href: string };
}

/** Card for BC families (charged when the first workbook ships, D-053); the waitlist for every other province (D-082). */
export function nextStep(v: ReportView): NextStep {
  const name = v.childName;
  if (v.model.callToAction === "card") {
    return {
      kind: "card",
      title: `Start ${name}'s books`,
      text: `Math is CAD ${PLANS.one.price} a month, or math + reading CAD ${PLANS.both.price} a month, with delivery included. We charge nothing until the first workbook ships. 30-day money-back guarantee from the first payment. Cancel anytime.`,
      action: { label: "Choose a plan", href: "/#price" },
    };
  }
  return {
    kind: "waitlist",
    title: v.province === "other" ? "Books for more provinces are coming" : `Books for the ${CURRICULA[v.province]} curriculum are coming`,
    text: `Join the waitlist and we will email you when they are ready. ${name}'s report stays in your account.`,
    action: { label: "Join the waitlist", href: "/#price" },
  };
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
