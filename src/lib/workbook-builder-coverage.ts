import type { Curriculum } from "./workbook-curriculum";
import { approvedQuestionTypes } from "./workbook-item-plan";
import { planLevel } from "./workbook-plan";

export interface BuilderCoverage {
  level: string;
  approved: string[];
  existing: string[];
  fullyCovered: boolean;
}

/** Level skills and its fluency skills. Personal review can also use the existing writer. */
export function workbookBuilderCoverage(curriculum: Curriculum): BuilderCoverage[] {
  return curriculum.levels.map(level => {
    const skills = [...new Set([...(curriculum.levelSkills(level.id) ?? []).map(s=>s.id), ...planLevel(curriculum,level.id)!.fluency])];
    const approved = skills.filter(skill=>approvedQuestionTypes(skill).length>0);
    const existing = skills.filter(skill=>approvedQuestionTypes(skill).length===0);
    return {level:level.id,approved,existing,fullyCovered:existing.length===0};
  });
}
