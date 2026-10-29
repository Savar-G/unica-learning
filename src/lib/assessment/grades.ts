// The school grades the assessment takes (D-156): Kindergarten (stored as 0) to Grade 9. No imports but types, so the
// account forms (client) can use it without loading the question bank.
import type { Grade, Level } from "./types";

/** Every school grade a parent can choose, in order. 0 is Kindergarten. Stored rows from before D-156 hold 1-7. */
export const GRADES: readonly Grade[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

/** True for a school grade the assessment takes: a whole number from 0 (Kindergarten) to 9. */
export const isGrade = (value: unknown): value is Grade => typeof value === "number" && (GRADES as readonly number[]).includes(value);

/** The highest level the question bank has: grade 9 (D-158). Only a Grade 9 child's test asks it. */
export const TOP_LEVEL: Level = 9;

/**
 * The highest level a route above the school grade reaches: grade 8. D-153 rule 2: a Grade 7 or 8 child never gets
 * grade 9 work from the assessment; grade 9 work starts through the workbook level tests. So a Grade 8 child's up route
 * is a second level 8 form, and only a Grade 9 child's test reaches level 9.
 */
export const UP_ROUTE_TOP: Level = 8;

/** The level a test starts at (stage 1): the school grade (D-158; grade 8 for a Grade 9 child before it, D-156). */
export const startLevel = (grade: Grade): Level => grade;

/**
 * The level a stage 1 score of 80% or more routes to: one above the start, and no higher than grade 8 (D-153 rule 2).
 * A Grade 9 child's up form is a second level 9 form, the top of the bank: clearing it is the test's ceiling.
 */
export const upLevel = (grade: Grade): Level => (grade === TOP_LEVEL ? TOP_LEVEL : (Math.min(grade + 1, UP_ROUTE_TOP) as Level));

/** The level a stage 1 score under 40% routes to: one below the start, and no lower than Kindergarten. */
export const downLevel = (grade: Grade): Level => Math.max(startLevel(grade) - 1, 0) as Level;

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
  level.testedTo ?? ((level.grade === TOP_LEVEL ? UP_ROUTE_TOP : level.grade) as Level);

/** "Kindergarten" or "Grade 4": a school grade as a label. Never "Grade 0". */
export const gradeLabel = (grade: Grade | number): string => (grade === 0 ? "Kindergarten" : `Grade ${grade}`);

/** "kindergarten" or "grade 4": a school grade inside a sentence. */
export const gradeName = (grade: Grade | number): string => (grade === 0 ? "kindergarten" : `grade ${grade}`);

/** "K" or "4": a school grade where space is tight (a segmented picker, a table cell). */
export const gradeShort = (grade: Grade | number): string => (grade === 0 ? "K" : String(grade));
