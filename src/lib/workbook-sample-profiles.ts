// Made-up children for the sample workbooks (#363): one per curriculum level, each with a level, a main unit (unit A),
// a Unit B gap and a few weak skills, and the planner input (src/lib/workbook-plan.ts) for three kinds of book:
// - "first": workbook 1, made from the assessment: units A and B need attention, earlier levels' units are secure.
// - "second": workbook 2: the first step of each unit A skill passed, and last time's misses on the weak skills come
//   back in Fix it (one miss a skill, with the step's first expected mistake when the curriculum names one).
// - "test": the level's last book: every step passed, so the plan makes the test workbook (level test on Day 7).
// Level samples and personas are made-up. The anonymous acceptance fixture below retains only the required profile
// shape and counts. The sample script uses test families (D-099). Pure: no network, database, clock or randomness.
import { BC_SKILL_MAP, REPORTED_STRAND, strandCertainty, strandStatus, type Grade, type LearnerProfile, type ProfileStandard } from "@/lib/assessment";
import { childProfileFacts, type ChildLearnerProfile } from "@/lib/child-profile";
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
    // An activity skill's one page is on its last step (#489).
    return s.steps.length || (s.delivery === "activity" ? 1 : DEFAULT_STEPS);
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

export type BookPersona = "ahead" | "catch-up" | "on-level" | "rushed";

/** Anonymous shape checked read-only on 2026-11-04. Counts only: no name, live ID or answer text. */
const FIRST_COUNTS: readonly [string, number, number][] = [
  ["4.1",2,2],["4.2",3,3],["4.3",2,2],["4.4",1,1],["4.5",1,1],["4.6",1,1],
  ["4.9",2,2],["4.10",2,2],["4.11",2,2],["4.12",1,1],["4.13",1,1],["4.14",1,1],
  ["4.15",1,1],["4.16",1,1],["4.17",1,1],["4.18",2,2],
  ["5.1",1,1],["5.2",2,2],["5.3",2,2],["5.4",1,1],["5.5",1,1],["5.6",1,1],["5.7",1,1],
  ["5.10",2,2],["5.11",2,2],["5.12",1,1],["5.13",0,1],["5.16",1,1],["5.17",1,1],["5.19",1,1],
];
const sampleStandard = (code: string, correct: number, total: number): ProfileStandard => {
  const s = BC_SKILL_MAP.standards.find(s => s.code === code);
  if (!s) throw new Error(`sample profile: unknown standard ${code}`);
  return { code, text: s.text, grade: s.grade, strand: REPORTED_STRAND[s.strand], aboveGrade: s.grade > 4, correct, total, status: strandStatus(correct, total), certainty: strandCertainty(correct, total) };
};
function learnerShape(counts: readonly (readonly [string, number, number])[] = FIRST_COUNTS): LearnerProfile {
  const standards = counts.map(([code, right, total]) => sampleStandard(code, right, total));
  return {
    schemaVersion: 1,
    test: { grade: 4, province: "BC", route: "up", answered: 42 },
    level: { working: 5, certainty: "clear", confidence: "normal", atCeiling: true },
    strands: (["number","fractions","algebra","shapes"] as const).map(strand => ({ strand, name: strand, correct: 6, total: 6, status: "secure", certainty: "clear", level: 5, levelCertainty: strand === "shapes" ? "early-sign" : "clear" })),
    standards,
    strengths: standards.filter(s => s.status === "secure"),
    struggles: standards.filter(s => !s.aboveGrade && s.status !== "secure").map(s => ({ ...s, wrong: [], misconceptions: [] })),
    facts: { families: ["add20","sub20","mul2510"], seconds: 60, answered: 19, correct: 19, skipped: 0, medianMs: 2620, accuracy: "secure", speed: "quick" },
    behaviour: { medianMs: 63774, veryFast: 0, unreliable: false, rushRuns: 0, leftOut: 0, thirds: { first: { correct: 14, total: 14 }, last: { correct: 6, total: 6 }, drop: false }, whiteboard: { required: 7, requiredWithWork: 1, optionalWithWork: 0 }, readAloud: { recorded: 42, questions: 0, uses: 0 }, away: { recorded: 42, questions: 0, times: 0, ms: 0 }, help: { answer: "no", flags: [], likely: false } },
    preferences: { styles: [], interests: [] },
    parent: { goal: null, feeling: null, weeklyTime: null },
    unknowns: { untested: [], earlySigns: { level: false, strands: [] }, checkNext: [] },
    ai: { nextChallenge: { model: "sample", value: ["5.13","6.12","6.8"] }, workbookPlan: { model: "sample", value: { review: { percent: 20, standards: ["4.14","4.5","4.7","4.8"] }, practise: { percent: 0, standards: [] }, stretch: { percent: 80, standards: ["5.13","6.12","6.8"] } } } },
  };
}
function asChild(profile: LearnerProfile): ChildLearnerProfile {
  // Empty reference fields satisfy the profile contract without retaining real or invented customer identifiers.
  const child = childProfileFacts({ grade: 4, learning: { ...profile.preferences, ...profile.parent }, events: [], assessment: { assessmentId: "", completedAt: null, buildId: null, profile } });
  if (!child) throw new Error("sample assessment profile could not be built");
  return child;
}

/** The first-customer acceptance fixture. Always returns fresh data. Display only synthetic initials. */
export function firstCustomerProfile(): ChildLearnerProfile {
  return asChild(learnerShape());
}

/** Made-up personas. They share the real profile's structure, not a customer's identity or answer text. */
export function bookPersona(persona: BookPersona): { initials: string; profile: ChildLearnerProfile } {
  // These counts are synthetic, including Ahead. FIRST_COUNTS belongs only to the anonymous acceptance fixture.
  const counts: [string, number, number][] = FIRST_COUNTS.map(([code, correct]) => [code, correct === 0 ? 0 : 2, correct === 0 ? 1 : 2]);
  if (persona === "catch-up") counts.push(["3.3",0,2]);
  const profile = learnerShape(counts.map(row => row[0] === "4.4" && persona === "catch-up" ? ["4.4",0,2] : row[0] === "4.3" && persona === "on-level" ? ["4.3",1,2] : row));
  if (persona === "catch-up") {
    profile.level = { working: 3, certainty: "clear", confidence: "normal", atCeiling: false };
    profile.test.route = "down";
    profile.strands = profile.strands.map(s => ({ ...s, level: 3, levelCertainty: "clear", correct: 3, status: "developing", certainty: "early-sign" }));
    profile.behaviour.readAloud = { recorded: 42, questions: 6, uses: 6 };
    profile.preferences = { styles: ["pictures"], interests: ["animals"] };
    profile.parent = { goal: "catch_up", feeling: "avoids", weeklyTime: "under_1h" };
    const struggle = profile.struggles.find(s => s.code === "4.4")!;
    struggle.wrong = [{ questionId: "", templateId: "", prompt: "", response: "", rightAnswer: "", misconception: "forgot-carry" }];
    struggle.misconceptions = ["forgot-carry"];
  }
  if (persona === "on-level") {
    profile.level = { working: 4, certainty: "clear", confidence: "normal", atCeiling: false };
    profile.strands = profile.strands.map(s => ({ ...s, level: 4 }));
    profile.preferences = { styles: ["stories"], interests: ["sports","space"] };
    profile.parent = { goal: "get_ahead", feeling: "okay", weeklyTime: "2_to_3h" };
    profile.facts = { families: ["mul234510"], seconds: 60, answered: 10, correct: 10, skipped: 0, medianMs: 4200, accuracy: "secure", speed: "needs-practice" };
  }
  if (persona === "rushed") {
    profile.level.certainty = "early-sign";
    profile.behaviour.unreliable = true;
    profile.behaviour.rushRuns = 1;
    profile.behaviour.help.likely = true;
    profile.behaviour.help.answer = "a-little";
  }
  return { initials: { ahead: "A.B.", "catch-up": "C.D.", "on-level": "E.F.", rushed: "G.H." }[persona], profile: asChild(profile) };
}
