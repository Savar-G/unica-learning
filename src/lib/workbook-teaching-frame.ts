// What approval freezes a question's teaching context from: the run's stored plan, and the unit of each skill in the
// curriculum that plan was made on (#536). Apart from src/lib/workbook-print-contract.ts so that module stays free of
// curriculum data. No Next.js, React, network, database or clock.
import { curriculumFor, curriculumVersion, type Curriculum } from "@/lib/workbook-curriculum";
import type { TeachingFrame } from "@/lib/workbook-print-contract";
import type { WorkbookPlan } from "@/lib/workbook-plan";

/** Each skill's unit in a curriculum. */
export function skillUnits(curriculum: Pick<Curriculum, "levels" | "levelSkills">): Record<string, string> {
  const units: Record<string, string> = {};
  for (const level of curriculum.levels) for (const skill of curriculum.levelSkills(level.id) ?? []) units[skill.id] = skill.unit;
  return units;
}

/**
 * A run's frame as approval reads it. A frame from before the units were stored reads them from today's curriculum only
 * when it is the version the run was planned on. Else there are none, so an item from another skill names no step: a
 * permanent contract never takes a unit from a later curriculum.
 */
export function teachingFrame(f: { curriculum: string; versions: { curriculum: string }; plan: WorkbookPlan; units?: Record<string, string> }): TeachingFrame {
  const curriculum = curriculumFor(f.curriculum);
  const units = f.units ?? (curriculum && curriculumVersion(f.curriculum) === f.versions.curriculum ? skillUnits(curriculum) : {});
  return { curriculum: f.curriculum, curriculumVersion: f.versions.curriculum, plan: f.plan, units };
}
