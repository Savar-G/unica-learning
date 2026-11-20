// Staged banks by grade band and the catalogue for adaptive assessments.
// Layout: one folder per band (grades-1-2/, then grades-3-5/ for #75 and grades-6-7/ for #76), one file per level.
import { bandFor, type GradeBandId } from "../constants";
import type { Difficulty, Grade, TaggedProvince, Wording } from "../types";
import type { TaggedTemplate } from "./kit";
import { GRADE_1_2_BANK as GRADES_1_2 } from "./grades-1-2";
import { GRADE_3_5_BANK as GRADES_3_5 } from "./grades-3-5";
import { GRADE_6_7_BANK as GRADES_6_7 } from "./grades-6-7";
import { DIFFICULTY } from "./difficulty";
import { visualRevisions, VISUAL_ADDITIONS } from "./visual-calibration";
import { WORDING } from "./wording";
import { BC_DIFFICULTY, BC_RETIRED_TEMPLATES, calibratedTemplates } from "./calibration";

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
  "6-7": GRADES_6_7.map(withWording),
};

/**
 * Every original template of every band, once. The third stage can pass the edge of the child's band,
 * and new adaptive pools start from this catalogue.
 */
export const ALL_TEMPLATES: readonly BankTemplate[] = [...flagged.values()];

const { plainTemplates, revisions } = calibratedTemplates(ALL_TEMPLATES);
const calibrated = [...plainTemplates, ...revisions.map(({ template }) => template)];
const visuals = visualRevisions([...ALL_TEMPLATES, ...calibrated]);
const newTemplates = [...calibrated, ...visuals.values(), ...VISUAL_ADDITIONS];
const newById = new Map(newTemplates.map((t) => [t.id, t]));
const newBySource = new Map(revisions.map((revision) => [revision.source, revision]));

export const ASSESSMENT_TEMPLATES = [...ALL_TEMPLATES, ...newTemplates];
export const CALIBRATION_SKILL_TAGS = Object.fromEntries(newTemplates.map((t) => [t.id, [t.skill]]));

/** Only the BC-scored pool uses the BC curriculum edits. Rounding variants keep every original grade tag. */
export function adaptiveBank(province: TaggedProvince) {
  const active = ALL_TEMPLATES.flatMap((original): typeof ASSESSMENT_TEMPLATES => {
    // Preserve Ontario's distinct Grade 7 filing. The other pools keep the Grade 8 copy.
    if (original.id === "g67-7-cylinder-volume" && province !== "ON") return [];
    if (province === "BC" && BC_RETIRED_TEMPLATES.has(original.id)) return [];
    const revision = newBySource.get(original.id);
    return [revision && (province === "BC" || revision.allProvinces) ? revision.template : original];
  });
  const eligible = province === "BC" ? [...active, ...plainTemplates, ...VISUAL_ADDITIONS] : active;
  return eligible.map((template) => visuals.get(template.id) ?? template);
}

/** How hard a template is for a child at its grade (D-282); "medium" for an id no bank holds, as in a test's own bank. */
export const difficultyOf = (templateId: string): Difficulty => DIFFICULTY[templateId] ?? newById.get(templateId)?.difficulty ?? "medium";

/** The bank a test for this school grade draws from. */
export const bankFor = (grade: Grade): readonly BankTemplate[] => BANKS[bandFor(grade).id];

/** Whether a template is a word problem or a bare-number question; undefined for an id no bank holds. */
export const wordingOf = (templateId: string): Wording | undefined => flagged.get(templateId)?.wording ?? newById.get(templateId)?.wording;

/** Capture this estimate with each new question so later changes cannot affect an in-progress test. */
export const adaptiveDifficultyOf = (id: string, province: TaggedProvince): Difficulty =>
  (province === "BC" ? BC_DIFFICULTY[id] : undefined) ?? difficultyOf(id);
