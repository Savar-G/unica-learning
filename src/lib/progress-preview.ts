// The progress preview on the parent's report, the report email and Parent home (round r-progress-preview-5, option P2,
// Savar 2026-11-11): "We predict Leah can reach a grade 3 level by September 2027", the skills today beside the skills
// at that level, and how the books get there. Every date is computed here from the real plan pace; nothing is typed in.
// Pure: no network, database, clock or AI. It reads the BC curriculum (server only: never import it into a browser file).
//
// The rules:
// - The goal: a child below the school grade aims for the school grade; a child at the school grade aims two grades up;
//   a child ahead aims two grades above the working level. Never above grade 9.
// - Book 1 starts at the start level the real planner chose (BookOne.level). The goal is reached when the child starts
//   the first level of the goal grade, so the books are every planned workbook (CurriculumLevel.workbooks) of the
//   levels from the start level up to that one.
// - Pace: every child works 5 days a week (Savar, 2026-11-11). A book is 10 days, so a new book every 2 weeks.
// - Book 1 starts START_LEAD_DAYS after the test (the book is made and mailed). Open decision for Savar: the real
//   delivery date, once one exists, can replace it.
// - When a level has no planned book count the pace cannot be computed: the preview shows the path without dates.
import type { Level } from "@/lib/assessment";
import { formatInZone, zoneForProvince } from "@/lib/family-time";
import type { ReportView } from "@/lib/report-view";
import { curriculumFor, type Curriculum } from "@/lib/workbook-curriculum";

/** A book is 10 practice days, 5 a week (workbook-plan.ts). */
export const DAYS_A_WEEK = 5;
export const BOOK_DAYS = 10;
const BOOK_MS = (BOOK_DAYS / DAYS_A_WEEK) * 7 * 24 * 60 * 60_000;
/** Days from the test to Book 1's first day: the book is planned, printed and mailed. */
export const START_LEAD_DAYS = 35;
const TOP_GRADE = 9;

/** The four areas of the skill table. They line up from grade to grade, so a row compares like with like. */
export const SKILL_AREAS = [
  { key: "num", name: "Numbers" },
  { key: "add", name: "Adding and subtracting" },
  { key: "mul", name: "Multiplying and dividing" },
  { key: "part", name: "Fractions and decimals" },
] as const;
type AreaKey = (typeof SKILL_AREAS)[number]["key"];

/**
 * What a child can do at each grade, in plain words, from the BC curriculum's content for the grade and its unit titles
 * (workbook-unit-titles.ts). Null: the area starts in a later grade. Approved by Savar in round r-progress-preview-5.
 */
export const GRADE_SKILLS: Record<Level, Record<AreaKey, string | null>> = {
  0: { num: "Counts to 10", add: "Adds and takes away to 10, with objects", mul: null, part: null },
  1: { num: "Numbers to 20", add: "Adds and subtracts 1-digit numbers", mul: null, part: null },
  2: { num: "Numbers to 100", add: "Adds and subtracts 2-digit numbers", mul: null, part: null },
  3: { num: "Numbers to 1,000", add: "Adds and subtracts 3-digit numbers", mul: "Multiplies and divides up to 5 × 5", part: "Simple fractions, like ¼ of a group" },
  4: { num: "Numbers to 10,000", add: "Adds and subtracts 4-digit numbers", mul: "Times tables up to 10 × 10", part: "Decimals to hundredths, like $2.75" },
  5: { num: "Numbers to 1,000,000", add: "Adds and subtracts decimals", mul: "Multiplies and divides 3-digit numbers", part: "Equivalent fractions, like ⅔ = 4⁄6" },
  6: { num: "Factors and multiples", add: "Mixed operations in order, like 3 + 4 × 2", mul: "Multiplies and divides decimals", part: "Mixed numbers, ratios and percents" },
  7: { num: "Negative numbers", add: "Adds and subtracts negative numbers", mul: "Multiplies and divides negative numbers", part: "Fractions, decimals and percents together" },
  8: { num: "Squares and square roots", add: "Adds and subtracts fractions", mul: "Multiplies and divides fractions", part: "Percents and proportions" },
  9: { num: "Exponents", add: "Adds and subtracts polynomials", mul: "Multiplies polynomials", part: "Rational numbers" },
};

export interface ProgressPreview {
  name: string;
  /** The working level today and the goal grade. */
  today: Level;
  goal: Level;
  /** "Grade 1 level". */
  todayLabel: string;
  goalLabel: string;
  /** The goal's month in the family's time zone ("September 2027"); null when the pace cannot be computed. */
  goalMonth: string | null;
  /** The prediction, in three parts so the page can set the goal and the month in bold. */
  sentence: { lead: string; goal: string; by: string | null };
  /** One row per area the goal grade has. `today` is null when the area starts after today's grade. */
  rows: { area: string; today: string | null; goal: string }[];
  /** The grade of each book, in order: the strip of small books. */
  books: Level[];
  /** One stage per grade before the goal, with its months; null months when the pace cannot be computed. */
  stages: { grade: Level; label: string; books: number; months: string | null }[];
  /** The three steps of how. */
  steps: { title: string; text: string }[];
  /** How the date was counted. */
  basis: string;
}

const gradeWord = (g: Level) => (g === 0 ? "Kindergarten" : `Grade ${g}`);
const gradeLower = (g: Level) => (g === 0 ? "kindergarten" : `grade ${g}`);
const span = (r: { min: number; max: number }) => (r.min === r.max ? String(r.min) : `${r.min} to ${r.max}`);

/** The goal grade: the school grade below it, two grades up at it, two above the working level ahead of it. */
export function goalGrade(working: Level, grade: Level): Level {
  const goal = working < grade ? grade : working === grade ? grade + 2 : working + 2;
  return Math.min(TOP_GRADE, goal) as Level;
}

/** The skill rows for today and the goal: every area the goal grade has. */
export function skillRows(today: Level, goal: Level): ProgressPreview["rows"] {
  return SKILL_AREAS.flatMap((a) => {
    const goalSkill = GRADE_SKILLS[goal][a.key];
    return goalSkill ? [{ area: a.name, today: GRADE_SKILLS[today][a.key], goal: goalSkill }] : [];
  });
}

/**
 * The preview for one report, or null: no workbook 1 (a family on the waitlist, a failed plan), a start level the
 * curriculum does not hold, or a goal the start level already reaches.
 */
export function progressPreview(v: ReportView, curriculum: Curriculum | null = curriculumFor("bc")): ProgressPreview | null {
  const book = v.bookOne;
  if (!book || !curriculum || v.model.callToAction !== "card") return null;
  const start = curriculum.levels.find((l) => l.number === book.level);
  if (!start) return null;
  const today = v.model.level.working;
  const goal = goalGrade(today, v.model.level.grade);
  const startGrade = start.schoolGrade as Level;
  if (startGrade >= goal) return null;
  const levels = curriculum.levels.filter((l) => l.number >= start.number && l.schoolGrade < goal);
  const books: Level[] = levels.flatMap((l) => Array.from({ length: Math.max(0, l.workbooks) }, () => l.schoolGrade as Level));
  if (!books.length) return null;
  const paced = books.length > 0 && levels.every((l) => Number.isInteger(l.workbooks) && l.workbooks > 0);
  const zone = v.timeZone ?? zoneForProvince(v.province);
  const startAt = Date.parse(v.completedAt) + START_LEAD_DAYS * 24 * 60 * 60_000;
  const month = (n: number) => formatInZone(startAt + n * BOOK_MS, zone, { month: "long", year: "numeric" });
  const short = (n: number) => formatInZone(startAt + n * BOOK_MS, zone, { month: "short" });
  const shortYear = (n: number) => formatInZone(startAt + n * BOOK_MS, zone, { month: "short", year: "numeric" });
  const goalMonth = paced ? month(books.length) : null;
  const name = v.childName;
  const stages: ProgressPreview["stages"] = [];
  for (let g = startGrade; g < goal; g++) {
    const first = books.indexOf(g as Level);
    if (first < 0) continue;
    const count = books.filter((b) => b === g).length;
    const end = first + count;
    stages.push({ grade: g as Level, label: gradeWord(g as Level), books: count, months: paced ? `${short(first)} to ${shortYear(end)}` : null });
  }
  const pages = span(book.pagesADay);
  const minutes = book.minutes ? `About ${book.minutes} minutes a day` : `About ${span(start.dailyMinutes)} minutes a day`;
  return {
    name,
    today,
    goal,
    todayLabel: `${gradeWord(today)} level`,
    goalLabel: `${gradeWord(goal)} level`,
    goalMonth,
    sentence: goalMonth
      ? { lead: `We predict ${name} can reach a `, goal: `${gradeLower(goal)} level`, by: goalMonth }
      : { lead: `We predict ${name} can reach a `, goal: `${gradeLower(goal)} level`, by: null },
    rows: skillRows(today, goal),
    books,
    stages,
    steps: [
      { title: "A new workbook every 2 weeks", text: `Printed for ${name} and mailed home. ${books.length} workbooks take ${name} from ${gradeLower(startGrade)} to ${gradeLower(goal)}.` },
      { title: `${pages} pages a day, ${DAYS_A_WEEK} days a week`, text: `${minutes}, in pencil. Each day mixes new work, practice, review and a challenge problem.` },
      { title: "We mark the finished pages", text: `You scan the pages with your phone. We mark them, and the next workbook adds what ${name} needs and moves on where ${name} is secure.` },
    ],
    basis: paced
      ? `How we count: ${books.length} workbooks of ${BOOK_DAYS} days each, ${DAYS_A_WEEK} days a week, from workbook 1 in ${month(0)}, through the BC curriculum. Each book adapts to ${name}'s marked pages, so the real date can be earlier or later.`
      : `How we count: ${books.length} workbooks of ${BOOK_DAYS} days each, through the BC curriculum. Each book adapts to ${name}'s marked pages.`,
  };
}
