import type { Curriculum } from "./workbook-curriculum";
import { approvedQuestionTypes } from "./workbook-item-plan";
import { planLevel } from "./workbook-plan";
import { templateProblem } from "./workbook-step-items";

export interface BuilderCoverage {
  level: string;
  /** #489: the level's skills whose every step has a template this level can print (their questions come from them). */
  templates: string[];
  /** Skills with #482's hand-built builders: the fluency facts of the warm-up, and skills without printable templates. */
  approved: string[];
  /** Skills with neither: the existing writer keeps them. */
  existing: string[];
  fullyCovered: boolean;
}

/** Level skills and its fluency skills. Personal review can also use the existing writer. */
export function workbookBuilderCoverage(curriculum: Curriculum): BuilderCoverage[] {
  return curriculum.levels.map(level => {
    const own = (curriculum.levelSkills(level.id) ?? []).filter(s => s.delivery !== "warm-up").map(s => s.id);
    const fluency = planLevel(curriculum, level.id)!.fluency;
    const skills = [...new Set([...own, ...(curriculum.levelSkills(level.id) ?? []).map(s => s.id), ...fluency])];
    // The warm-up's facts are a fact grid code builds or the writer fills; templates fill the taught skills only.
    const printable = (skill: string) => own.includes(skill) && (curriculum.skillSteps(skill) ?? []).length > 0
      && (curriculum.skillSteps(skill) ?? []).every(step => (step.templates ?? []).some(t => !templateProblem(t, level.number)));
    const templates = skills.filter(printable);
    const approved = skills.filter(skill => !printable(skill) && approvedQuestionTypes(skill).length > 0);
    const existing = skills.filter(skill => !printable(skill) && approvedQuestionTypes(skill).length === 0);
    return { level: level.id, templates, approved, existing, fullyCovered: existing.length === 0 };
  });
}
