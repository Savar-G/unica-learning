// Book instructions (2026-11-08): what an admin sets for a child's next workbooks after a results call with the family,
// one section per kind, so code applies each one with no AI reading step. They stay on the child until an admin changes
// or clears them (public.workbook_instructions), and each run keeps the exact set it used in its plan
// (plan.instructions, inside public.workbook_run_frames).
//
// - Start level: the book's level instead of the automatic placement (P0 to P5), within the curriculum and the U27
//   ceiling (D-153). Kindergarten keeps U1 (P9). The book stays one level (Option A): weak topics below the chosen
//   level, clear or early, get the P6 review checks.
// - Teach more: units of the book's level that go first (after their prerequisites) and take the extra practice page
//   on their first step's day (docs/workbook-personalization.md section 4, item 1). A clear secure unit is taught too.
// - Teach less: units of the book's level that are review only in this book, as a clear secure unit is.
// - Add review: topics below the book's level that get the P6 checks: 2 Remember these items on Days 2 to 4 and 1
//   Friday 5 item on Day 5. Never a topic above the school grade that is not secure (D-084).
// - Difficulty: "harder" starts the day difficulty 2 days ahead and gives the Challenge its hardest questions from
//   Day 1 (section 4, item 2); "usual" turns that stretch off. Both need a finished assessment.
//
// Interests and day length are not sections: the parent's learning card holds them, and the book already reads it.
// Pure TypeScript: no network, database, clock or randomness.
import { BC_SKILL_MAP } from "@/lib/assessment";
import type { Curriculum } from "@/lib/workbook-curriculum";
import { UNIT_TITLES } from "@/lib/workbook-titles";

export const WORKBOOK_INSTRUCTIONS_VERSION = 1;
/** The most topics one list holds. Add review also has room for at most 5 checks (the Friday 5). */
export const INSTRUCTION_TOPICS_MAX = 8;
export const DIFFICULTIES = ["harder", "usual"] as const;
export type InstructionDifficulty = (typeof DIFFICULTIES)[number];

export interface WorkbookInstructions {
  version: typeof WORKBOOK_INSTRUCTIONS_VERSION;
  /** "U19", or null for the automatic placement. */
  startLevel: string | null;
  /** BC standard codes, in the admin's order. */
  teachMore: string[];
  teachLess: string[];
  addReview: string[];
  /** Null: the automatic stretch rules. */
  difficulty: InstructionDifficulty | null;
}

export type InstructionSection = "start-level" | "teach-more" | "teach-less" | "add-review" | "difficulty";
export const SECTION_LABELS: Readonly<Record<InstructionSection, string>> = {
  "start-level": "Start level", "teach-more": "Teach more", "teach-less": "Teach less", "add-review": "Add review", difficulty: "Difficulty",
};

/** What one instruction did to the plan: applied, or not, with the plain reason. */
export interface InstructionOutcome {
  section: InstructionSection;
  /** The level id, the standard code or the difficulty. */
  value: string;
  applied: boolean;
  note: string;
}

/** The instructions a plan was made with, and what each one did. */
export interface InstructionsTrace {
  instructions?: WorkbookInstructions;
  outcomes: InstructionOutcome[];
}

const STANDARDS = new Set(BC_SKILL_MAP.standards.map((s) => s.code));
const LEVEL_ID = /^U([1-9]|[12][0-9]|30)$/;

export const EMPTY_INSTRUCTIONS: WorkbookInstructions = { version: WORKBOOK_INSTRUCTIONS_VERSION, startLevel: null, teachMore: [], teachLess: [], addReview: [], difficulty: null };

/**
 * The instructions in `value` (a stored row or a request body), cleaned: known BC standards only, no repeats, at most
 * INSTRUCTION_TOPICS_MAX a list. Null when the shape is wrong (an unknown field type, level or difficulty).
 */
export function workbookInstructions(value: unknown): WorkbookInstructions | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (v.version !== undefined && v.version !== WORKBOOK_INSTRUCTIONS_VERSION) return null;
  const start = v.startLevel ?? null;
  if (start !== null && (typeof start !== "string" || !LEVEL_ID.test(start))) return null;
  const difficulty = v.difficulty ?? null;
  if (difficulty !== null && !DIFFICULTIES.includes(difficulty as InstructionDifficulty)) return null;
  const list = (key: string): string[] | null => {
    const raw = v[key] ?? [];
    if (!Array.isArray(raw) || raw.some((c) => typeof c !== "string")) return null;
    const codes = [...new Set(raw as string[])];
    if (codes.some((c) => !STANDARDS.has(c)) || codes.length > INSTRUCTION_TOPICS_MAX) return null;
    return codes;
  };
  const teachMore = list("teachMore"), teachLess = list("teachLess"), addReview = list("addReview");
  if (!teachMore || !teachLess || !addReview) return null;
  return { version: WORKBOOK_INSTRUCTIONS_VERSION, startLevel: start as string | null, teachMore, teachLess, addReview, difficulty: difficulty as InstructionDifficulty | null };
}

/** True when nothing is set: the book is made exactly as without instructions. */
export function instructionsEmpty(i: WorkbookInstructions | null | undefined): boolean {
  return !i || (i.startLevel === null && i.difficulty === null && !i.teachMore.length && !i.teachLess.length && !i.addReview.length);
}

/** Why a set cannot be saved, or null. The level-dependent checks are the planner's (shown on the run page). */
export function instructionsProblem(i: WorkbookInstructions, ceiling: number): string | null {
  if (i.startLevel && Number(i.startLevel.slice(1)) > ceiling) return `The start level can be at most U${ceiling}.`;
  const both = i.teachMore.find((c) => i.teachLess.includes(c));
  if (both) return `${topicName(both)} is in both Teach more and Teach less.`;
  return null;
}

/** "5.9 Multiplication facts". */
export function topicName(code: string): string {
  return UNIT_TITLES[code] ? `${code} ${UNIT_TITLES[code]}` : code;
}

/** One line per section that is set, for the admin's lists. */
export function instructionLines(i: WorkbookInstructions | null | undefined): { section: string; value: string }[] {
  if (!i) return [];
  const topics = (codes: readonly string[]) => codes.map(topicName).join("; ");
  return [
    ...(i.startLevel ? [{ section: SECTION_LABELS["start-level"], value: i.startLevel }] : []),
    ...(i.teachMore.length ? [{ section: SECTION_LABELS["teach-more"], value: topics(i.teachMore) }] : []),
    ...(i.teachLess.length ? [{ section: SECTION_LABELS["teach-less"], value: topics(i.teachLess) }] : []),
    ...(i.addReview.length ? [{ section: SECTION_LABELS["add-review"], value: topics(i.addReview) }] : []),
    ...(i.difficulty ? [{ section: SECTION_LABELS.difficulty, value: difficultyLabel(i.difficulty) }] : []),
  ];
}

export function difficultyLabel(d: InstructionDifficulty): string {
  return d === "harder" ? "Harder from Day 1" : "No extra stretch";
}

export interface PickerUnit {
  code: string;
  title: string;
  /** Some skill has steps with code templates, so the planner can print review items for it below its level. */
  reviewable: boolean;
  /** Some skill is taught in steps; a unit practised only in the daily warm-up cannot be taught more or less. */
  taught: boolean;
}
export interface PickerLevel {
  id: string;
  number: number;
  title: string;
  /** 0 is Kindergarten. Admin pages may name grades; workbook pages never do. */
  schoolGrade: number;
  units: PickerUnit[];
}

/** The levels (up to `ceiling`) and their units, for the admin form's pickers. */
export function instructionPicker(curriculum: Curriculum, ceiling: number): PickerLevel[] {
  return curriculum.levels.filter((l) => l.number <= ceiling).map((l) => {
    const skills = curriculum.levelSkills(l.id) ?? [];
    return {
      id: l.id, number: l.number, title: l.title, schoolGrade: l.schoolGrade,
      units: l.units.map((code) => ({
        code, title: UNIT_TITLES[code] ?? code,
        reviewable: skills.some((s) => s.unit === code && (curriculum.skillSteps(s.id) ?? []).some((step) => !!step.templates?.length)),
        taught: skills.some((s) => s.unit === code && s.delivery !== "warm-up"),
      })),
    };
  });
}

export function gradeName(grade: number): string {
  return grade === 0 ? "Kindergarten" : `Grade ${grade}`;
}
