// Question banks by grade band, with a separate set of upper-grade placement items in the oldest band.
import { bandFor, type GradeBandId } from "../constants";
import type { Difficulty, Grade, Wording } from "../types";
import type { TaggedTemplate } from "./kit";
import { GRADE_1_2_BANK as GRADES_1_2 } from "./grades-1-2";
import { GRADE_3_5_BANK as GRADES_3_5 } from "./grades-3-5";
import { GRADE_6_7_BANK as GRADES_6_7 } from "./grades-6-7";
import { DIFFICULTY } from "./difficulty";
import { UPPER_TEMPLATES } from "./upper-grades";
import { WORDING } from "./wording";

/** A template as the banks hold it: tagged for every province, and marked as a word problem or not (#187). */
export type BankTemplate = TaggedTemplate & { wording: Wording };

// One flagged object per template, so a template the grades 3-5 bank reuses from the grades 1-2 bank stays the same object.
const flagged = new Map<string, BankTemplate>();
function withWording(template: TaggedTemplate): BankTemplate {
  const wording = WORDING[template.id];
  if (!wording) throw new Error(`Template ${template.id} has no wording in bank/wording.ts`);
  const known = flagged.get(template.id) ?? { ...template, wording };
  flagged.set(template.id, known);
  return known;
}

export const GRADE_1_2_BANK: readonly BankTemplate[] = GRADES_1_2.map(withWording);

export const BANKS: Record<GradeBandId, readonly BankTemplate[]> = {
  "1-2": GRADE_1_2_BANK,
  "3-5": GRADES_3_5.map(withWording),
  "6-7": [...GRADES_6_7, ...UPPER_TEMPLATES].map(withWording),
};

/** The deduplicated pool for adaptive tests and third stages that can cross a grade band. */
export const ALL_TEMPLATES: readonly BankTemplate[] = [...flagged.values()];

/** How hard a template is for a child at its grade (D-282); "medium" for an id no bank holds, as in a test's own bank. */
export const difficultyOf = (templateId: string): Difficulty => DIFFICULTY[templateId] ?? "medium";

/** The bank a test for this school grade draws from. */
export const bankFor = (grade: Grade): readonly BankTemplate[] => BANKS[bandFor(grade).id];

/** Whether a template is a word problem or a bare-number question; undefined for an id no bank holds. */
export const wordingOf = (templateId: string): Wording | undefined => flagged.get(templateId)?.wording;
