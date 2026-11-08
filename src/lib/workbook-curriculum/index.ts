// The workbook curriculum (#361): levels U1 to U30, their units and skills, and the steps inside a skill, per
// curriculum. The data comes from the curriculum skeleton (D-192) through `npm run import:curriculum`. Pure: no
// network, database or clock. The planner and the generator read the content from here.
import { digestOf } from "@/lib/workbook-digest";
import { BC_CURRICULUM as RAW_BC_CURRICULUM } from "./bc";
import { withHouseTemplates } from "./house-templates";
import { verifiedWatchOut } from "./watch-out";
import type { CurriculumData, CurriculumKey, CurriculumLevel, CurriculumSkill, CurriculumStep, CurriculumUnit, TemplateContexts } from "./types";

export type * from "./types";
export { curriculumProblems } from "./check";
function stepForGenerator(step: CurriculumStep): CurriculumStep {
  // Template selection reads a step many times. Filter only when its mistakes are read,
  // against both the source and the view, so a later edit to either cannot expose stale approval.
  const view: CurriculumStep = { ...step, get mistakes() {
    return step.mistakes.map(mistake => {
      const safe = { ...mistake };
      const pair = verifiedWatchOut(step, mistake);
      if (pair && verifiedWatchOut(view, mistake)) safe.watchOut = { ...pair };
      else delete safe.watchOut;
      return safe;
    });
  } };
  return view;
}

/** Imported BC data with every unverified mistake pair removed. Raw authoring data stays in bc.ts. */
export const BC_CURRICULUM: CurriculumData = { ...RAW_BC_CURRICULUM, steps: RAW_BC_CURRICULUM.steps.map(stepForGenerator) };

/** The reads of one curriculum. An unknown level or skill id reads as null. */
export interface Curriculum {
  key: CurriculumKey;
  /** U1 to U30, in order. */
  levels: readonly CurriculumLevel[];
  level(id: string): CurriculumLevel | null;
  /** The level's skills in teaching order: each after its prerequisites, a unit's skills together. */
  levelSkills(levelId: string): readonly CurriculumSkill[] | null;
  /** A unit (one BC standard) by its code, for example "3.3". */
  unit(code: string): CurriculumUnit | null;
  /** The level after this one; null after the last. */
  nextLevel(levelId: string): CurriculumLevel | null;
  /** By BC skill id. */
  skill(id: string): CurriculumSkill | null;
  levelOfSkill(skillId: string): CurriculumLevel | null;
  /** The skill's steps in order, with their number ranges, practice models and templates. */
  skillSteps(skillId: string): readonly CurriculumStep[] | null;
  /** The shared word lists the templates fill (people, things, places, ...); absent for a curriculum without templates. */
  contexts?: TemplateContexts;
}

export function curriculumFromData(data: CurriculumData): Curriculum {
  const byNumber = (a: { number: number }, b: { number: number }) => a.number - b.number;
  const levels = [...data.levels].sort(byNumber);
  const levelById = new Map<string, CurriculumLevel>(levels.map((l) => [l.id, l]));
  const unitByCode = new Map(data.units.map((u) => [u.code, u]));
  const skillById = new Map(data.skills.map((s) => [s.id, s]));
  const skillsOf = new Map<string, CurriculumSkill[]>(levels.map((l) => [l.id, []]));
  for (const s of data.skills) skillsOf.get(s.level)?.push(s);
  for (const list of skillsOf.values()) list.sort((a, b) => a.order - b.order);
  const stepsOf = new Map<string, CurriculumStep[]>(data.skills.map((s) => [s.id, []]));
  for (const step of data.steps) stepsOf.get(step.skill)?.push(stepForGenerator(step));
  for (const list of stepsOf.values()) list.sort(byNumber);

  const level = (id: string) => levelById.get(id) ?? null;
  const skill = (id: string) => skillById.get(id) ?? null;
  return {
    key: data.key,
    levels,
    level,
    levelSkills: (id) => skillsOf.get(id) ?? null,
    unit: (code) => unitByCode.get(code) ?? null,
    nextLevel: (id) => {
      const at = levels.findIndex((l) => l.id === id);
      return at >= 0 ? (levels[at + 1] ?? null) : null;
    },
    skill,
    levelOfSkill: (id) => level(skill(id)?.level ?? ""),
    skillSteps: (id) => stepsOf.get(id) ?? null,
    ...(data.contexts ? { contexts: data.contexts } : {}),
  };
}

// The generator reads every imported step and its templates (#489). The 155 drafted steps it read before are gone.
// (With Unica's own Challenge templates appended to their steps: house-templates.ts.)
const BC_WITH_HOUSE = withHouseTemplates(RAW_BC_CURRICULUM);
const CURRICULA: Record<CurriculumKey, Curriculum> = { bc: curriculumFromData(BC_WITH_HOUSE) };

/** All 1,623 validated BC steps and their template contexts: the same curriculum curriculumFor("bc") gives. */
export function bcStepProgressions(): Curriculum & { readonly contexts: TemplateContexts } {
  return CURRICULA.bc as Curriculum & { readonly contexts: TemplateContexts };
}

/** The curriculum with this key, or null when there is no map for it (only BC today): the caller refuses the child. */
export function curriculumFor(key: string): Curriculum | null {
  return Object.hasOwn(CURRICULA, key) ? CURRICULA[key as CurriculumKey] : null;
}

const DATA: Record<CurriculumKey, CurriculumData> = { bc: BC_WITH_HOUSE };
const versions = new Map<string, string>();

/**
 * The fingerprint of a curriculum's data (#312, R379-8-2), or null for an unknown key: a workbook run stores it when it
 * starts, and a resumed run refuses to go on when the curriculum changed since.
 */
export function curriculumVersion(key: string): string | null {
  if (!Object.hasOwn(DATA, key)) return null;
  if (!versions.has(key)) versions.set(key, digestOf(DATA[key as CurriculumKey]));
  return versions.get(key)!;
}
