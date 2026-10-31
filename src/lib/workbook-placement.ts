// The plan input of a child's next workbook (#312): which level, and what the two-week plan (#308) reads about the
// child. The placement rule is CONTEXT.md section 2, as far as the stored data reaches today:
// - A child with workbooks goes on at the level of the newest one (the level test that moves a child on, 4.9, and the
//   marked pages that fill `passed`, the reviews and the misses are not built yet, so those stay empty).
// - A first workbook starts at the lowest level, at or below the child's school grade, that holds a BC standard the
//   child's profile finds not yet secure; when there is none, at the first level of the child's grade. Kindergarten
//   starts at U1. Never above U27 (D-153). Units of that level the profile has no evidence for get the plan's
//   placement checks (`unassessedUnits`).
// Pure TypeScript: no Next.js, React, network, database or clock.
import type { Grade } from "@/lib/assessment";
import type { ChildLearnerProfile } from "@/lib/child-profile";
import type { Curriculum, CurriculumLevel } from "@/lib/workbook-curriculum";
import { planLevel, planWorkbook, type PlanResult } from "@/lib/workbook-plan";

/** The highest level a placement gives (D-153). */
export const PLACEMENT_CEILING = 27;

export interface PlacementInput {
  curriculum: Curriculum;
  grade: Grade;
  /** The child's current profile, or null when none is stored. */
  profile: ChildLearnerProfile | null;
  /** The child's stored workbooks: their numbers and levels. */
  workbooks: readonly { number: number; levels: readonly number[] }[];
}

/** The level the child's next workbook is at, and how many workbooks of that level came before. */
export function placeChild(o: PlacementInput): { level: CurriculumLevel; inLevel: number; first: boolean } {
  const levels = o.curriculum.levels.filter((l) => l.number <= PLACEMENT_CEILING);
  const newest = [...o.workbooks].sort((a, b) => b.number - a.number)[0];
  if (newest && newest.levels.length > 0) {
    const at = Math.min(Math.max(...newest.levels), PLACEMENT_CEILING);
    const level = levels.find((l) => l.number === at) ?? levels[levels.length - 1];
    return { level, inLevel: o.workbooks.filter((w) => w.levels.includes(level.number)).length, first: false };
  }
  const notSecure = new Set(o.profile?.notYetSecure ?? []);
  const atOrBelow = levels.filter((l) => l.schoolGrade <= o.grade);
  const weak = atOrBelow.find((l) => l.units.some((u) => notSecure.has(u)));
  const level = weak ?? atOrBelow.find((l) => l.schoolGrade === o.grade) ?? atOrBelow[atOrBelow.length - 1] ?? levels[0];
  return { level, inLevel: 0, first: true };
}

/** The two-week plan of the child's next workbook, numbered `number`. */
export function planNextWorkbook(o: PlacementInput & { number: number }): PlanResult & { levelId?: string } {
  const place = placeChild(o);
  const level = planLevel(o.curriculum, place.level.id);
  if (!level) return { ok: false, reason: `the curriculum has no level ${place.level.id}` };
  const known = new Set((o.profile?.standards ?? []).map((s) => s.code));
  const result = planWorkbook({
    profile: { standards: o.profile?.standards ?? [] },
    grade: o.grade,
    level,
    passed: {},
    workbook: { number: o.number, inLevel: place.inLevel },
    reviews: [],
    missedReviews: [],
    misses: [],
    pausedWeeks: 0,
    support: null,
    unassessedUnits: place.first ? place.level.units.filter((u) => !known.has(u)) : [],
  });
  return { ...result, levelId: place.level.id };
}
