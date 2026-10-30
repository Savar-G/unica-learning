// The workbook curriculum (#361): levels U1 to U30, their units and skills, and the steps inside a skill, per
// curriculum. The data comes from the curriculum skeleton (D-192) through `npm run import:curriculum`. Pure: no
// network, database or clock. The planner and the generator read the content from here.
import { BC_CURRICULUM } from "./bc";
import type { CurriculumData, CurriculumKey, CurriculumLevel, CurriculumSkill, CurriculumStep, CurriculumUnit } from "./types";

export type * from "./types";
export { curriculumProblems } from "./check";
/** The BC data as the import script wrote it. Read it through curriculumFor("bc"); this is for the data checks. */
export { BC_CURRICULUM };

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
  /** The skill's steps in order; empty where none are drafted yet (outside Grade 3, U10 to U12). */
  skillSteps(skillId: string): readonly CurriculumStep[] | null;
}

function curriculum(data: CurriculumData): Curriculum {
  const byNumber = (a: { number: number }, b: { number: number }) => a.number - b.number;
  const levels = [...data.levels].sort(byNumber);
  const levelById = new Map<string, CurriculumLevel>(levels.map((l) => [l.id, l]));
  const unitByCode = new Map(data.units.map((u) => [u.code, u]));
  const skillById = new Map(data.skills.map((s) => [s.id, s]));
  const skillsOf = new Map<string, CurriculumSkill[]>(levels.map((l) => [l.id, []]));
  for (const s of data.skills) skillsOf.get(s.level)?.push(s);
  for (const list of skillsOf.values()) list.sort((a, b) => a.order - b.order);
  const stepsOf = new Map<string, CurriculumStep[]>(data.skills.map((s) => [s.id, []]));
  for (const s of data.steps) stepsOf.get(s.skill)?.push(s);
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
  };
}

const CURRICULA: Record<CurriculumKey, Curriculum> = { bc: curriculum(BC_CURRICULUM) };

/** The curriculum with this key, or null when there is no map for it (only BC today): the caller refuses the child. */
export function curriculumFor(key: string): Curriculum | null {
  return Object.hasOwn(CURRICULA, key) ? CURRICULA[key as CurriculumKey] : null;
}
