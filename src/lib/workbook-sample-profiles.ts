// Made-up children for the sample workbooks (#363): one per curriculum level, each with a level, a main unit (unit A),
// a Unit B gap and a few weak skills, and the planner input (src/lib/workbook-plan.ts) for three kinds of book:
// - "first": workbook 1, made from the assessment: units A and B need attention, earlier levels' units are secure.
// - "second": workbook 2: the first step of each unit A skill passed, and last time's misses on the weak skills come
//   back in Fix it (one miss a skill, with the step's first expected mistake when the curriculum names one).
// - "test": the level's last book: every step passed, so the plan makes the test workbook (level test on Day 7).
// These are never a real child's data: the sample script (scripts/workbook-samples.ts) gives them to the children of
// a family marked as a test family (D-099). Pure TypeScript: no Next.js, network, database, clock or randomness.
import type { Grade } from "@/lib/assessment";
import type { Curriculum } from "@/lib/workbook-curriculum";
import { DEFAULT_STEPS, planLevel, type PlanInput, type UnresolvedMiss } from "@/lib/workbook-plan";

export type SampleBookKind = "first" | "second" | "test";

export interface SampleChild {
  /** "U12". */
  level: string;
  /** The first name printed on the book. */
  name: string;
  /** The school grade the level belongs to (internal; 0 is Kindergarten). */
  grade: Grade;
  /** Unit A: the BC standard code the books teach first. */
  mainUnit: string;
  /** The Unit B gap: the next unit, also needing attention; null when the level has one unit. */
  unitB: string | null;
  /** Skills the child got wrong last time: Fix it on the second workbook. */
  weakSkills: string[];
}

// Ordinary first names, all different. Never "Maya" (the teaching assistant), "Sam" (Sam's work on Spot the error) or
// a real customer's name.
const NAMES = [
  "Ava", "Leo", "Zoe", "Noah", "Zara", "Eli", "Priya", "Owen", "Lina", "Jun",
  "Sofia", "Kai", "Amara", "Ravi", "Nora", "Theo", "Isla", "Arjun", "Mila", "Ben",
  "Hana", "Luca", "Aria", "Omar", "Ella", "Kian", "Ruby", "Dev", "Lucy", "Finn",
];

/** The made-up child of a level, or null when the curriculum has no such level. */
export function sampleChild(curriculum: Curriculum, levelId: string): SampleChild | null {
  const level = curriculum.level(levelId);
  const plan = planLevel(curriculum, levelId);
  if (!level || !plan) return null;
  const units = plan.units.filter((u) => u.skills.some((s) => s.delivery !== "warm-up"));
  const main = units[0] ?? plan.units[0];
  const b = units.find((u) => u.code !== main.code) ?? null;
  const taught = (u: typeof main | null) => (u?.skills ?? []).filter((s) => s.delivery !== "warm-up").map((s) => s.id);
  const weakSkills = [...taught(main).slice(0, 2), ...taught(b).slice(0, 1)].slice(0, 3);
  return {
    level: levelId, name: NAMES[(level.number - 1) % NAMES.length], grade: level.schoolGrade as Grade,
    mainUnit: main.code, unitB: b?.code ?? null, weakSkills,
  };
}

/** The planner input for one of the child's books (see the header). */
export function samplePlanInput(curriculum: Curriculum, child: SampleChild, kind: SampleBookKind): PlanInput {
  const level = planLevel(curriculum, child.level);
  if (!level) throw new Error(`sample profile: no level ${child.level}`);
  const own = new Set(level.units.map((u) => u.code));
  // Earlier levels of the same grade are secure; this level's A and B need attention; its other units develop.
  const earlier = Array.from({ length: Math.max(0, level.number - 1) }, (_, i) => curriculum.level(`U${i + 1}`))
    .filter((l) => l && l.schoolGrade === child.grade)
    .flatMap((l) => l!.units)
    .filter((code) => !own.has(code));
  const standards = [
    ...[...new Set(earlier)].map((code) => ({ code, status: "secure" as const })),
    ...level.units.map((u) => ({ code: u.code, status: u.code === child.mainUnit || u.code === child.unitB ? "needs-attention" as const : "developing" as const })),
  ];
  const stepsOf = (id: string) => {
    const s = level.units.flatMap((u) => u.skills).find((x) => x.id === id)!;
    return s.delivery === "activity" ? 1 : s.steps.length || DEFAULT_STEPS;
  };
  const taught = level.units.flatMap((u) => u.skills).filter((s) => s.delivery !== "warm-up");
  const passed: Record<string, number> = kind === "test"
    ? Object.fromEntries(taught.map((s) => [s.id, stepsOf(s.id)]))
    : kind === "second"
      ? Object.fromEntries(taught.filter((s) => level.units.find((u) => u.code === child.mainUnit)?.skills.some((x) => x.id === s.id)).map((s) => [s.id, Math.min(1, stepsOf(s.id))]))
      : {};
  const misses: UnresolvedMiss[] = kind === "second"
    ? child.weakSkills.map((skill, i) => ({
      skill,
      question: { source: "workbook" as const, workbookId: "00000000-0000-4000-8000-000000000363", page: 12 + i * 4, question: 2 },
      event: `sample-miss-${child.level}-${i + 1}`,
      result: "wrong" as const,
      mistake: curriculum.skillSteps(skill)?.[0]?.mistakes.find((m) => m.misconception)?.misconception ?? null,
      stuckStep: null,
    }))
    : [];
  return {
    profile: { standards }, grade: child.grade, level, passed,
    workbook: kind === "first" ? { number: 1, inLevel: 0 } : kind === "second" ? { number: 2, inLevel: 1 } : { number: 3, inLevel: level.workbooks },
    reviews: [], missedReviews: [], misses, pausedWeeks: 0, support: null, unassessedUnits: [],
  };
}
