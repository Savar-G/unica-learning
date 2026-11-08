import type { Curriculum } from "./workbook-curriculum";

/** Known earlier skills and current-level fluency review keep their final step. */
export function reviewMasteryStep(curriculum: Curriculum, level: number, skill: string): number | null {
  const own = curriculum.skill(skill);
  const at = curriculum.levelOfSkill(skill)?.number;
  if (level < 10 || at === undefined || !(at < level || at === level && own?.delivery === "warm-up")) return null;
  return curriculum.skillSteps(skill)?.at(-1)?.number ?? null;
}
