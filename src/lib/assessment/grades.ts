// The school grades the assessment takes (D-156): Kindergarten (stored as 0) to Grade 9. No imports but types, so the
// account forms (client) can use it without loading the question bank.
import type { Grade, Level } from "./types";

/** Every school grade a parent can choose, in order. 0 is Kindergarten. Stored rows from before D-156 hold 1-7. */
export const GRADES: readonly Grade[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

/** True for a school grade the assessment takes: a whole number from 0 (Kindergarten) to 9. */
export const isGrade = (value: unknown): value is Grade => typeof value === "number" && (GRADES as readonly number[]).includes(value);

/**
 * The highest level the question bank has: grade 8. The assessment never tests grade 9 content (D-153): a Grade 9
 * child's test checks skills up to grade 8, and the program's grade 9 levels are reached by passing level tests.
 */
export const TOP_LEVEL: Level = 8;

/** The level a test starts at (stage 1): the school grade, and grade 8 for a Grade 9 child (D-156). */
export const startLevel = (grade: Grade): Level => Math.min(grade, TOP_LEVEL) as Level;

/** The level a stage 1 score of 80% or more routes to: one above the start, and no higher than grade 8. */
export const upLevel = (grade: Grade): Level => Math.min(startLevel(grade) + 1, TOP_LEVEL) as Level;

/** The level a stage 1 score under 40% routes to: one below the start, and no lower than Kindergarten. */
export const downLevel = (grade: Grade): Level => Math.max(startLevel(grade) - 1, 0) as Level;

/** "Kindergarten" or "Grade 4": a school grade as a label. Never "Grade 0". */
export const gradeLabel = (grade: Grade | number): string => (grade === 0 ? "Kindergarten" : `Grade ${grade}`);

/** "kindergarten" or "grade 4": a school grade inside a sentence. */
export const gradeName = (grade: Grade | number): string => (grade === 0 ? "kindergarten" : `grade ${grade}`);

/** "K" or "4": a school grade where space is tight (a segmented picker, a table cell). */
export const gradeShort = (grade: Grade | number): string => (grade === 0 ? "K" : String(grade));
