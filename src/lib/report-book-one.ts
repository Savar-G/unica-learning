// "What's in workbook 1" on the parent's report (D-305): the first workbook the generator would plan from this test,
// in plain words. It runs the real placement and plan (planNextWorkbook, through previewWorkbook), so the report never
// promises a topic the book does not hold. It replaces the AI's workbook preview (#198), which the generator never read.
// Pure: no network, database, clock or AI. The learning card answers and later learning events are not read here, so a
// parent's goal can still move one support unit in the real book; the units and the start level come from the test.
import type { Grade, LearnerProfile, Level } from "@/lib/assessment";
import { curriculumFor, type Curriculum } from "@/lib/workbook-curriculum";
import type { PartKind, WorkbookPlan } from "@/lib/workbook-plan";
import { planNextWorkbook } from "@/lib/workbook-placement";
import { SKILL_TITLES } from "@/lib/workbook-skill-titles";
import { UNIT_TITLES } from "@/lib/workbook-unit-titles";
import { previewWorkbook } from "@/lib/workbook-why";

/** One BC unit in workbook 1: its short title, its grade, and the skills the book uses from it. */
export interface BookUnit {
  code: string;
  title: string;
  grade: Level;
  skills: string[];
}

/** How workbook 1 covers a BC unit: taught as the main work, or in its review items. */
export type BookCover = "main" | "review";

export interface BookOne {
  days: number;
  /** About this many minutes a day, from the plan's time target; null when the plan has none. */
  minutes: number | null;
  /** The units the book teaches, most of each day. */
  main: BookUnit[];
  /** Earlier units in the review items (Remember these?, Friday 5, unit checks), lowest grade first. */
  review: BookUnit[];
  /** The daily fact warm-up, as skill titles. */
  warmUp: string[];
  /** The book has harder Challenge questions, Solve it two ways and a Show what you know day. */
  challenge: { harder: boolean; twoWays: boolean; showWhatYouKnow: boolean };
  /** The rest of the start level, in teaching order, and its grade: the next books, then the level test. */
  next: { grade: Level; titles: string[] };
  /** The first units of the level after it: "then grade 3: ...". Null after the last level. */
  then: { grade: Level; titles: string[] } | null;
  /** Each BC unit the book covers, by code. */
  covers: Record<string, BookCover>;
  /** The units of the start level the book does not teach yet: a later book of the same level. */
  later: string[];
}

const MAIN_KINDS: ReadonlySet<PartKind> = new Set(["new-idea", "practice", "spot-the-error", "try-first", "word-problems", "picture-stories", "solve-it-two-ways", "challenge", "show-what-you-know", "math-in-the-world"]);
const REVIEW_KINDS: ReadonlySet<PartKind> = new Set(["remember-these", "friday-5", "fix-it", "mixed-set", "mini-test", "unit-check", "already-know-it"]);
const WARM_KINDS: ReadonlySet<PartKind> = new Set(["warm-up", "in-your-head"]);
const THEN_TITLES = 3;

export interface BookOneInput {
  profile: LearnerProfile;
  /** The school grade at the test. */
  grade: Grade;
  assessmentId: string;
  completedAt: string;
  minutes: number;
  howWeHelp: "behind" | "on-grade" | "ahead";
}

/** Workbook 1 from this test, or null when the generator cannot plan one (a curriculum without books, a failed plan). */
export function bookOne(input: BookOneInput, curriculum: Curriculum | null = curriculumFor("bc")): BookOne | null {
  if (!curriculum) return null;
  let preview: ReturnType<typeof previewWorkbook>;
  try {
    preview = previewWorkbook({
      curriculum, grade: input.grade, workbooks: [], report: { minutes: input.minutes, howWeHelp: input.howWeHelp }, device: null, previous: null,
      facts: { grade: input.grade, learning: null, assessment: { assessmentId: input.assessmentId, completedAt: input.completedAt, buildId: null, profile: input.profile }, events: [] },
    }, planNextWorkbook);
  } catch {
    return null;
  }
  if (!preview.ok) return null;
  return describe(preview.plan, curriculum, input.profile);
}

function describe(plan: WorkbookPlan, c: Curriculum, profile: LearnerProfile): BookOne | null {
  const level = c.levels.find((l) => l.number === plan.level);
  if (!level) return null;
  const gradeOf = (code: string): Level => (c.level(c.unit(code)?.level ?? "")?.schoolGrade ?? level.schoolGrade) as Level;
  const unitOf = (skill: string) => c.skill(skill)?.unit ?? null;
  const teaching = [...plan.units.A, ...(plan.units.B ? [plan.units.B] : [])];
  const mainUnits = new Set(teaching);
  const mainSkills = new Map<string, Set<string>>();
  const reviewSkills = new Map<string, Set<string>>();
  const warm = new Set<string>();
  const kinds = new Set<PartKind>();
  for (const day of plan.days) for (const page of day.pages) for (const part of page.parts) {
    kinds.add(part.kind);
    const skills = "skills" in part && Array.isArray(part.skills) ? (part.skills as string[]) : [];
    for (const skill of skills) {
      const unit = unitOf(skill);
      if (!unit) continue;
      if (WARM_KINDS.has(part.kind)) warm.add(skill);
      else if (mainUnits.has(unit) && MAIN_KINDS.has(part.kind)) add(mainSkills, unit, skill);
      else if (!mainUnits.has(unit) && REVIEW_KINDS.has(part.kind)) add(reviewSkills, unit, skill);
    }
  }
  // Teaching order: the level's skill order; review units lowest grade first, then curriculum order.
  const order = new Map((c.levelSkills(level.id) ?? []).map((s, i) => [s.id, i]));
  const unitList = (map: Map<string, Set<string>>): BookUnit[] =>
    [...map].map(([code, skills]) => ({
      code, title: UNIT_TITLES[code] ?? code, grade: gradeOf(code),
      skills: [...skills].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0)).map((s) => SKILL_TITLES[s] ?? s),
    }));
  const main = unitList(mainSkills).sort((a, b) => teaching.indexOf(a.code) - teaching.indexOf(b.code));
  if (!main.length) return null;
  const review = unitList(reviewSkills).sort((a, b) => a.grade - b.grade || a.code.localeCompare(b.code, undefined, { numeric: true }));
  // P5a: a unit the test found clearly secure is review only, so it is not a later book's main work.
  const clearSecure = new Set(profile.standards.filter((s) => s.status === "secure" && s.certainty === "clear").map((s) => s.code));
  const later = level.units.filter((u) => !mainUnits.has(u) && !clearSecure.has(u));
  const following = c.nextLevel(level.id);
  const covers: Record<string, BookCover> = {};
  for (const u of main) covers[u.code] = "main";
  for (const u of review) covers[u.code] ??= "review";
  return {
    days: plan.days.length,
    minutes: plan.timeTarget ? Math.round(plan.timeTarget.max) : null,
    main,
    review,
    warmUp: [...warm].map((s) => SKILL_TITLES[s] ?? s),
    challenge: { harder: kinds.has("challenge"), twoWays: kinds.has("solve-it-two-ways"), showWhatYouKnow: kinds.has("show-what-you-know") },
    next: { grade: level.schoolGrade as Level, titles: later.map((u) => UNIT_TITLES[u] ?? u) },
    then: following ? { grade: following.schoolGrade as Level, titles: following.units.slice(0, THEN_TITLES).map((u) => UNIT_TITLES[u] ?? u) } : null,
    covers,
    later,
  };
}

function add(map: Map<string, Set<string>>, unit: string, skill: string) {
  const set = map.get(unit) ?? new Set<string>();
  set.add(skill);
  map.set(unit, set);
}
