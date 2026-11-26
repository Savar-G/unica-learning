// The school grades the assessment takes. No imports but types, so the
// account forms (client) can use it without loading the question bank.
import type { Grade, Level, Stage3Direction } from "./types";

/** Every school grade a parent can choose, in order. 0 is Kindergarten. */
export const PUBLIC_GRADES: readonly Grade[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

/** The Grade 9 ceiling used by original forms and reports (D-158). */
export const LEGACY_TOP_LEVEL = 9;

/** Every grade the assessment can support, including grades reserved for internal testing. */
export const TOP_LEVEL = 12;
export const GRADES: readonly Grade[] = [...PUBLIC_GRADES, 10, 11, TOP_LEVEL];

/** True for a school grade the assessment takes: a whole number from 0 (Kindergarten) to 12. */
export const isGrade = (value: unknown): value is Grade => typeof value === "number" && (GRADES as readonly number[]).includes(value);

/**
 * The highest level an up route for Grades K–8 reaches: Level 8. D-153 rule 2: a Grade 7 or 8 child never gets
 * grade 9 work from the assessment; grade 9 work starts through the workbook level tests. A Grade 8 child gets
 * a second Level 8 form on the staged up route.
 */
export const UP_ROUTE_TOP: Level = 8;

/** The level a test starts at (stage 1): the school grade (D-158; grade 8 for a Grade 9 child before it, D-156). */
export const startLevel = (grade: Grade): Level => grade;

/**
 * The level a stage 1 score of 80% or more routes to, subject to the staged form ceiling.
 * A Grade 9 child's up form stays at Level 9. Grades 10–12 use the upper-grade scale.
 */
export const upLevel = (grade: Grade): Level =>
  grade === LEGACY_TOP_LEVEL ? grade : Math.min(grade + 1, grade < LEGACY_TOP_LEVEL ? UP_ROUTE_TOP : TOP_LEVEL) as Level;

/** The level a stage 1 score under 40% routes to: one below the start, and no lower than Kindergarten. */
export const downLevel = (grade: Grade): Level => Math.max(startLevel(grade) - 1, 0) as Level;

/**
 * The level of the third stage (D-282): one more grade past the stage 2 form in that direction, or null when there is
 * none. A child who reached the bank's edge has no third stage: Kindergarten and Grade 1 going down, and Grades 7, 8 and
 * 9 going up (D-153 rule 2: a Grade 7 or 8 child never gets grade 9 work from the assessment).
 */
export function stage3Level(grade: Grade, direction: Stage3Direction): Level | null {
  if (direction === "up") {
    const up = upLevel(grade);
    const top = grade <= LEGACY_TOP_LEVEL ? UP_ROUTE_TOP : TOP_LEVEL;
    return up > grade && up < top ? ((up + 1) as Level) : null;
  }
  const down = downLevel(grade);
  return down < grade && down > 0 ? ((down - 1) as Level) : null;
}

/**
 * The highest grade a finished test measured against the school grade: the school grade, except a Grade 9 test from
 * before D-158, whose questions stopped at level 8. `levels` are the levels the test asked (Placement.levels).
 */
export const testedGrade = (grade: Grade, levels: readonly { level: Level }[]): Level =>
  (levels.length ? Math.min(grade, Math.max(...levels.map((l) => l.level))) : startLevel(grade)) as Level;

/**
 * The grade a report compares the working level with: the model's `testedTo`, or, in a report made before D-158 (no
 * `testedTo`), grade 8 for a Grade 9 child and the school grade for every other child.
 */
export const comparedGrade = (level: { grade: Grade; testedTo?: Level }): Level =>
  level.testedTo ?? (level.grade === LEGACY_TOP_LEVEL ? UP_ROUTE_TOP : level.grade);

/** "Kindergarten" or "Grade 4": a school grade as a label. Never "Grade 0". */
export const gradeLabel = (grade: Grade | number): string => (grade === 0 ? "Kindergarten" : `Grade ${grade}`);

/** "kindergarten" or "grade 4": a school grade inside a sentence. */
export const gradeName = (grade: Grade | number): string => (grade === 0 ? "kindergarten" : `grade ${grade}`);

/** "K" or "4": a school grade where space is tight (a segmented picker, a table cell). */
export const gradeShort = (grade: Grade | number): string => (grade === 0 ? "K" : String(grade));
