// The two-week curriculum plan (#308, spec #296): what a child's next workbook holds, day by day and page by page,
// before any question is written. The generator (#311) fills each planned part with items; the templates (#310) give
// each page type its look. The rules are the curriculum skeleton's (round 2, D-192), written out in
// .design/workbooks/CONTEXT.md (sections 1, 2, 4 and 5) and DESIGN.md (section 7). The level comes from the workbook
// curriculum (G0, #361) through planLevel.
//
// - Ten days, five a week. Pages a day by band (D-186): U1 to U3 4 to 6 parent-led pages (6 to 10 items a page, icon
//   instructions read aloud), U4 to U18 8, U19 to U30 6.
// - The day's parts, with their level gates: page 1 is the warm-up from U8 (the grade's fluency skills, from the level
//   or the nearest earlier level that has some, and one In your head item), below U8 a Remember these? picture review;
//   the Fix it box sits on page 1 of Days 1 to 5 from workbook 2; Try first from U19 on a day a step of A or B starts;
//   New idea only on a day a step starts (a worked example solved two ways, Method 1 and Method 2, then one
//   spot-the-error item; a B step's on the Unit B page); practice that builds (faded: watch one, finish two, then
//   alone); practice 2 (harder rows, Solve it two ways, spot the error); word problems; from U19, Math in the world on
//   Days 4 and 9 in place of the practice page; Unit B; Remember these? with the Mixed set from U10 (below U10 with
//   picture stories), and on Days 5 and 10 the Friday 5 in its place (five questions, no hints); 1 to 2 challenge
//   problems every day but the level test day. Day 10 of every workbook is Show what you know. Solve it two ways is one
//   item a day from U4; U1 to U3 leave it out (their answers are a circle, a match, a colour, a line or one numeral).
// - Units A and B: the main unit A and the next unit of the level that does not depend on A (no B skill needs an A
//   skill, through the skill map's edges), about 2 of A to 1 of B a day, counted by the parts of each page (A: page 2,
//   practice, practice 2, word problems; B: Unit B and the challenge, which stretches B's step). At most 8 new steps a
//   workbook. A step's pages are its drafted pages (Grade 3) or its skill's pages split evenly over DEFAULT_STEPS; a
//   step starts at the start of a day once the last step's pages are spent; after the cap the pages consolidate.
// - Review share by level (4.3): review, Fix it, warm-up, Friday 5 and tests, counted by parts. Show what you know is a
//   celebration review: its items count as review. When the day template holds less than the share, spare room on
//   teaching pages gets a Remember these? block (DESIGN 7: spare room goes to spaced review), last days first, only
//   where the day's A to B stays between 1.5 and 2.5.
// - Spaced review (4.4): a passed step comes back after 2 practice days, 1 week, 3 weeks and 2 months (2, 5, 15 and 40
//   practice days), 2 items each; nextReview moves a review on after marking, a miss back to 2 days. The plan places
//   each review due in its ten days with its step and interval (a day that is full moves it on a day) and the first
//   review of each of its own steps 2 days after the step's last day; what falls later is carried (reviewsAfter).
// - Fix it (4.6): workbook 1 has none. From workbook 2: the previous workbook's misses still wrong after any fix in the
//   app, up to the day-7 snapshot (`misses`, built by the caller from learning events), and last time's missed spaced
//   reviews (`missedReviews`); one new question a skill, up to 3 a box, on page 1 of Days 1 to 5; never the same
//   question again (the box names the questions and events to avoid). Those with no room are in fixItLater.
// - After a pause of 2 weeks or more (4.8): Days 1 and 2 are Remember these? days, with no new step (a support unit
//   keeps its page).
// - Pass with support (4.9): the weak unit takes the daily Review slot (the Unit B page) in the first 2 workbooks of the
//   new level, with a 5-item mini-test on Day 6 of the second.
// - The test workbook (4.9): when every step of the level is passed, or after the level's workbooks plus 2. Days 1 to 6
//   with mixed review of every unit (the Unit B page); Day 7 the level test in one sitting (U1 to U3: two parts), every
//   unit, no hints, a context question; Day 8 light; Days 9 and 10 mixed practice across the level. No new step after
//   Day 6.
// - Placement (CONTEXT 2): in the first workbook, a unit of the level the profile finds secure is not taught; it is
//   reviewed. A unit the assessment had no questions for (`unassessedUnits`) gets a 4-item unit check on the
//   Remember these? page, one a day from Day 1, and is not placed as secure before it. In Kindergarten (U1 to U3) every
//   unit gets a 2-page parent-led Already know it? check (pages 1 and 2 of a teaching day, one unit a day from Day 1).
//   A passed check comes back through the next snapshot (the unit's steps passed, or its standard secure).
//   Remember these? reaches back to what the level builds on; with nothing behind the child (U1), to the level's units.
// - Never a weakness above the school grade (D-084): a carried review, a miss or a missed review on a standard above
//   the school grade is left out unless the standard is secure, also in the child's own level (teaching ahead is fine,
//   remedial work above the grade is not); reviews left out are in reviewsSkipped.
// - Every part with items has a skill to aim at, or the plan is refused. Deterministic: the same input gives the same
//   plan; ties go by the level's order, then curriculum order.
// Pure TypeScript: no Next.js, React, network, database, clock or randomness.
import { BC_SKILL_MAP, curriculumOrder, worstFirst, type Grade } from "@/lib/assessment";
import type { ChildStandard } from "@/lib/child-profile";
import type { QuestionRef } from "@/lib/question-package";
import type { Curriculum, CurriculumLevel, Delivery, Range } from "@/lib/workbook-curriculum";

/**
 * The page types of a workbook day (DESIGN.md section 7), a closed list for the generator and the templates. The
 * renderer's fixed test template (#309) has "cover" and "practice": "practice" is this "practice"; the cover, the How +
 * Plan page and the back cover are not day pages. U1 to U3 pages are "parent-led", whatever they hold.
 */
export const PAGE_TYPES = [
  "parent-led", "warm-up", "remember-these", "new-idea", "practice", "practice-2", "word-problems", "math-in-the-world",
  "unit-b", "remember-these-mixed-set", "friday-5", "challenge", "show-what-you-know", "level-test",
] as const;
export type PageType = (typeof PAGE_TYPES)[number];

/** The parts of a day (CONTEXT.md section 5): the blocks a page holds. */
export const PART_KINDS = [
  "warm-up", "in-your-head", "fix-it", "remember-these", "try-first", "new-idea", "spot-the-error", "practice",
  "solve-it-two-ways", "word-problems", "picture-stories", "math-in-the-world", "mixed-set", "friday-5", "challenge",
  "show-what-you-know", "level-test", "mini-test", "unit-check", "already-know-it",
] as const;
export type PartKind = (typeof PART_KINDS)[number];

/** One step of a skill: its page budget. */
export interface PlanStep {
  pages: number;
}

/** One skill of a level. */
export interface PlanSkill {
  /** The BC skill map's id. */
  id: string;
  delivery: Delivery;
  /** Its page budget. */
  pages: number;
  /** Its drafted steps (Grade 3 today); none: DEFAULT_STEPS, its pages split evenly. */
  steps: readonly PlanStep[];
}

/** One unit (a BC standard) of a level, its skills in teaching order. */
export interface PlanUnit {
  code: string;
  skills: readonly PlanSkill[];
}

/** A level as the plan reads it: planLevel builds it from the workbook curriculum (G0). */
export interface PlanLevel {
  /** 1 to 30 (U1 to U30). */
  number: number;
  /** The level's workbook budget. */
  workbooks: number;
  pagesPerDay: Range;
  dailyMinutes: Range;
  lead: CurriculumLevel["lead"];
  /** The share of pages held for review, Fix it, warm-up, Friday 5 and tests, 0 to 1. */
  reviewShare: number;
  /** Its units in dependency order. */
  units: readonly PlanUnit[];
  /** The fluency (warm-up) skills of the daily warm-up: the level's, or the nearest earlier level's. */
  fluency: readonly string[];
}

/** The level `levelId` ("U10") of a curriculum as the plan reads it; null when the curriculum has no such level. */
export function planLevel(curriculum: Curriculum, levelId: string): PlanLevel | null {
  const level = curriculum.level(levelId);
  const skills = level && curriculum.levelSkills(level.id);
  if (!level || !skills) return null;
  const warmUp = (l: CurriculumLevel) => (curriculum.levelSkills(l.id) ?? []).filter((s) => s.delivery === "warm-up").map((s) => s.id);
  const fluencyFrom = [...curriculum.levels].filter((l) => l.number <= level.number).reverse().find((l) => warmUp(l).length > 0);
  return {
    number: level.number,
    workbooks: level.workbooks,
    pagesPerDay: { ...level.pagesPerDay },
    dailyMinutes: { ...level.dailyMinutes },
    lead: level.lead,
    reviewShare: level.reviewShare,
    units: level.units.map((code) => ({
      code,
      skills: skills.filter((s) => s.unit === code).map((s) => ({
        id: s.id,
        delivery: s.delivery,
        pages: s.pages,
        steps: (curriculum.skillSteps(s.id) ?? []).map((step) => ({ pages: step.pages })),
      })),
    })),
    fluency: fluencyFrom ? warmUp(fluencyFrom) : [],
  };
}

/** Unit A, the level's main unit of the workbook, or unit B, the one beside it. */
export type Track = "A" | "B";

/** A step: unit, skill and step number (from 1). */
export interface StepRef {
  unit: string;
  skill: string;
  step: number;
}

/** A passed step to bring back: the interval it is on (0 to 3: 2 days, 1 week, 3 weeks, 2 months), when it is due. */
export interface SpacedReview {
  skill: string;
  step: number;
  interval: number;
  /** The practice day it is due, counted from this workbook's Day 1 (1); 1 or less is due on Day 1. */
  due: number;
}

/** A miss of the previous workbook still wrong after any fix in the app, up to the day-7 snapshot. */
export interface UnresolvedMiss {
  skill: string;
  /** The question it was: never asked again. */
  question: QuestionRef;
  /** The learning event it was recorded in. */
  event: string;
  result: "wrong" | "blank" | "right_with_help";
  /** The cause id of the wrong answer ("O3"), if known. */
  mistake: string | null;
  /** The worked step id where the child got stuck, if known. */
  stuckStep: string | null;
}

/** One skill in a Fix it box: a new question on it, with fresh numbers. */
export interface FixItem {
  skill: string;
  standard: string;
  mistakes: string[];
  stuckSteps: string[];
  /** The questions and events of the misses: never asked again. */
  avoid: { questions: QuestionRef[]; events: string[] };
  /** The missed spaced reviews of the skill (step and interval). */
  reviews: { step: number; interval: number }[];
}

export interface PlannedPart {
  kind: PartKind;
  /** The unit track it teaches, or null for review, warm-up, tests and mixed work. */
  unit: Track | null;
  /** The step it teaches, for a unit part; null otherwise. */
  step: StepRef | null;
  /** The skill map's ids its items are on. */
  skills: string[];
  /** How many items (at most). */
  items: number;
  /** False on the Friday 5, the mini-test and the level test. */
  hints: boolean;
  /** A worked example (New idea) or an item (Solve it two ways) done two ways. */
  methods?: ["Method 1", "Method 2"];
  /** Faded practice: a full example to watch, then half-finished ones to finish, then the rest alone. */
  faded?: { watch: number; finish: number };
  /** Remember these?: the spaced reviews placed here, 2 items each, before the rest of its skills. */
  reviews?: { skill: string; step: number; interval: number }[];
  /** A placement check (CONTEXT 2): the unit it checks, and for Already know it? its page (1 or 2). */
  check?: { unit: string; page?: 1 | 2 };
  /** The level test: its units, context questions and sittings. */
  test?: { units: string[]; contextQuestions: number; sittings: 1 | 2 };
  fixIt?: FixItem[];
}

export interface PlannedPage {
  /** The page of the day, from 1. */
  number: number;
  type: PageType;
  /** The track of its teaching parts; null for a page with none. */
  unit: Track | null;
  /** Icon instructions (U1 to U6; read aloud by the parent in U1 to U3) or written ones. */
  instructions: "icons" | "text";
  parts: PlannedPart[];
}

/** A teaching day, a Remember these? day after a pause, or a test workbook's level test, light and mixed days. */
export type DayKind = "teach" | "remember" | "test" | "light" | "mixed";

export interface PlannedDay {
  /** 1 to 10. */
  day: number;
  week: 1 | 2;
  kind: DayKind;
  pages: PlannedPage[];
}

export interface WorkbookPlan {
  level: number;
  lead: PlanLevel["lead"];
  /** Pages a day (D-186) on a teaching day. */
  pagesADay: Range;
  /** The daily time target in minutes: typical, not a limit. */
  timeTarget: Range;
  /** The level's test workbook (4.9). */
  testWorkbook: boolean;
  /** Unit A (in order, when A moves on), unit B, and the unit in the Review slot after a pass with support. */
  units: { A: string[]; B: string | null; support: string | null };
  /** The new steps, in the order they start. */
  newSteps: (StepRef & { day: number; track: Track })[];
  /** The level's review share, and the plan's. */
  reviewShare: { target: number; planned: number };
  /** Skills to fix that had no room in this workbook's boxes. */
  fixItLater: string[];
  /** The spaced reviews due after this workbook (or with no room), counted from the next workbook's Day 1. */
  reviewsAfter: SpacedReview[];
  /** Carried reviews left out: a standard above the school grade that is not secure (D-084). */
  reviewsSkipped: SpacedReview[];
  /**
   * The placement checks of the first workbook (CONTEXT 2): a 4-item unit check for each unit with no assessment
   * evidence, and in Kindergarten (U1 to U3) a 2-page Already know it? check for each unit. A unit counts as secure only
   * when its check comes back passed through the next snapshot.
   */
  checks: { unit: string; kind: "unit-check" | "already-know-it"; day: number }[];
  days: PlannedDay[];
}

/** The part of the child's profile (ChildLearnerProfile) the plan reads: each standard's status. */
export type PlanProfile = {
  standards: readonly Pick<ChildStandard, "code" | "status">[];
};

export interface PlanInput {
  profile: PlanProfile;
  /** The child's school grade now. */
  grade: Grade;
  level: PlanLevel;
  /** Steps passed at 90% or more, by skill id (step mastery, 4.5); a skill not listed has none. */
  passed: Readonly<Record<string, number>>;
  /** The child's workbook number (from 1), and how many workbooks of this level came before this one. */
  workbook: { number: number; inLevel: number };
  /** The spaced reviews carried from earlier workbooks. */
  reviews: readonly SpacedReview[];
  /** Last time's spaced reviews marked below 80%: back in Fix it (4.4). */
  missedReviews: readonly SpacedReview[];
  /** The previous workbook's unresolved misses, up to its day-7 snapshot. */
  misses: readonly UnresolvedMiss[];
  /** Whole weeks the family paused before this workbook. */
  pausedWeeks: number;
  /** The unit the last level test passed with support (4.9), or null. */
  support: string | null;
  /** The units (BC standard codes) the assessment had no questions for: checked in the first workbook (CONTEXT 2). */
  unassessedUnits: readonly string[];
}

export type PlanResult = { ok: true; plan: WorkbookPlan } | { ok: false; reason: string };

const DAYS = 10;
const DAYS_A_WEEK = 5;
const LEVELS = 30;
/** Steps a skill has when the skeleton has none drafted (CONTEXT 2: 3 to 5). */
export const DEFAULT_STEPS = 3;
export const NEW_STEPS_MAX = 8;
/** The spaced review intervals in practice days: 2 days, 1 week, 3 weeks, 2 months (five practice days a week). */
export const SPACED_INTERVALS = [2, 5, 15, 40] as const;
/** The day's A to B, counted by parts: about 2:1. */
export const A_TO_B = { min: 1.5, max: 2.5 };
const FIX_IT_DAYS = 5;
const FIX_IT_PER_BOX = 3;
const FRIDAY_5_DAYS = [5, 10];
const MATH_IN_THE_WORLD_DAYS = [4, 9];
/** A pause this long or longer opens with PAUSE_DAYS Remember these? days (4.8). */
const PAUSE_WEEKS = 2;
const PAUSE_DAYS = 2;
/** Pass with support (4.9): the weak unit's Review slot runs this many workbooks; the mini-test is in the last. */
const SUPPORT_WORKBOOKS = 2;
const MINI_TEST_DAY = 6;
const MINI_TEST_ITEMS = 5;
/** The placement checks (CONTEXT 2): a 4-item unit check; Already know it? pages of 6 items (parent-led: 6 to 10). */
const UNIT_CHECK_ITEMS = 4;
const ALREADY_KNOW_IT_ITEMS = 6;
/** The test workbook's days (4.9). */
const TEST_DAY = 7;
const LIGHT_DAY = 8;
const LAST_START_DAY = { normal: 9, test: 6 };
const REVIEW_ITEMS_EACH = 2;
const FRIDAY_5_ITEMS = 5;
const HARDEST_AGAIN = 3;
/** Parent-led pages hold 6 to 10 items (the skeleton, U1 to U3). */
const PARENT_ITEMS = { min: 6, max: 10 };

// The level gates (CONTEXT section 5).
const ICONS_TO = 6;
const PARENT_LED_TO = 3;
const SOLVE_TWO_WAYS_FROM = 4;
const WARM_UP_FROM = 8;
const MIXED_SET_FROM = 10;
const UPPER_FROM = 19;

/** The parts that count toward the review share (4.3). */
const REVIEW_PARTS = new Set<PartKind>([
  "warm-up", "in-your-head", "fix-it", "remember-these", "friday-5", "show-what-you-know", "level-test", "mini-test", "unit-check", "already-know-it",
]);

const STANDARDS = new Map(BC_SKILL_MAP.standards.map((s) => [s.code, s]));
const MAP_SKILLS = new Map(BC_SKILL_MAP.standards.flatMap((s) => s.skills.map((k, i) => [k.id, { skill: k, standard: s, position: i }] as const)));
const skillOrder = (a: string, b: string) => {
  const x = MAP_SKILLS.get(a)!;
  const y = MAP_SKILLS.get(b)!;
  return curriculumOrder(x.standard, y.standard) || x.position - y.position;
};

/** Every skill a skill needs, through the skill map's edges. */
function prerequisites(id: string, seen = new Set<string>()): Set<string> {
  for (const r of MAP_SKILLS.get(id)?.skill.requires ?? []) {
    if (!seen.has(r)) {
      seen.add(r);
      prerequisites(r, seen);
    }
  }
  return seen;
}

/**
 * The next spaced review after one on `day` (a practice day of the same count as `due`): passed (80% or more), the next
 * interval, or null after the last; missed, back to the 2-day interval.
 */
export function nextReview(review: SpacedReview, day: number, passed: boolean): SpacedReview | null {
  const interval = passed ? review.interval + 1 : 0;
  if (interval >= SPACED_INTERVALS.length) return null;
  return { skill: review.skill, step: review.step, interval, due: day + SPACED_INTERVALS[interval] };
}

interface QueuedStep extends StepRef {
  pages: number;
}
/** A page before its content: its type, its role (stable across days), and each part's kind and track. */
interface Shape {
  type: PageType;
  role: string;
  parts: { kind: PartKind; track: Track | null }[];
}

const part = (kind: PartKind, items: number, over: Partial<PlannedPart> = {}): PlannedPart => ({
  kind, unit: null, step: null, skills: [], items, hints: true, ...over,
});
const stepRef = (s: StepRef): StepRef => ({ unit: s.unit, skill: s.skill, step: s.step });
const byDue = (a: SpacedReview, b: SpacedReview) => a.due - b.due || a.skill.localeCompare(b.skill) || a.step - b.step;
const isCount = (v: unknown) => Number.isInteger(v) && (v as number) >= 0;
const clamp = (v: number, r: Range) => Math.min(r.max, Math.max(r.min, v));
/** The day's A and B, each page split evenly among its parts. */
const tracksOf = (day: readonly Shape[]) => {
  const sum = (t: Track) => day.reduce((n, s) => n + s.parts.filter((p) => p.track === t).length / s.parts.length, 0);
  return { A: sum("A"), B: sum("B") };
};
/** Pages split evenly over steps, the first ones one page more (largest remainder), at least 1 each. */
const evenSteps = (pages: number, count: number) =>
  Array.from({ length: count }, (_, i) => Math.max(1, Math.floor(pages / count) + (i < pages % count ? 1 : 0)));

/** The child's next two weeks (see the header for the rules), or why it cannot be planned. */
export function planWorkbook(input: PlanInput): PlanResult {
  const { level } = input;
  if (!Number.isInteger(level.number) || level.number < 1 || level.number > LEVELS) return { ok: false, reason: "the level is not U1 to U30" };
  const levelSkills = level.units.flatMap((u) => u.skills.map((s) => ({ ...s, unit: u.code })));
  if (levelSkills.length === 0) return { ok: false, reason: "the level has no skills" };
  const named = [
    ...levelSkills.map((s) => s.id), ...level.fluency, ...input.misses.map((m) => m.skill),
    ...input.reviews.map((r) => r.skill), ...input.missedReviews.map((r) => r.skill),
  ];
  const unknown = named.find((id) => !MAP_SKILLS.has(id));
  if (unknown) return { ok: false, reason: `${unknown} is not a skill of the BC skill map` };
  const outside = Object.keys(input.passed).find((id) => !levelSkills.some((s) => s.id === id));
  if (outside) return { ok: false, reason: `${outside} is not a skill of this level` };
  const notCount = Object.entries(input.passed).find(([, v]) => !isCount(v));
  if (notCount) return { ok: false, reason: `the steps passed of ${notCount[0]} is not a whole number` };
  if (!Number.isInteger(input.workbook.number) || input.workbook.number < 1) return { ok: false, reason: "the workbook number is not 1 or more" };
  if (!isCount(input.workbook.inLevel)) return { ok: false, reason: "the workbooks before in the level is not a whole number" };
  if (!isCount(input.pausedWeeks)) return { ok: false, reason: "the weeks paused is not a whole number" };
  if (input.support !== null && !STANDARDS.has(input.support)) return { ok: false, reason: `${input.support} is not a BC standard` };
  const notUnit = input.unassessedUnits.find((code) => !STANDARDS.has(code));
  if (notUnit) return { ok: false, reason: `${notUnit} is not a BC standard` };

  const n = level.number;
  const parentLed = n <= PARENT_LED_TO;
  const sixPages = n >= UPPER_FROM;
  const instructions = n <= ICONS_TO ? "icons" : "text";
  const pageType = (type: PageType): PageType => (parentLed ? "parent-led" : type);
  const levelGrade = Math.max(...levelSkills.map((s) => MAP_SKILLS.get(s.id)!.standard.grade));
  const levelIds = new Set(levelSkills.map((s) => s.id));
  const firstWorkbook = input.workbook.number === 1;

  // The profile: a standard above the school grade is never a weakness (D-084); one above the level's grade comes with
  // its own level.
  const status = new Map(input.profile.standards.map((s) => [s.code, s.status]));
  const standardOf = (skill: string) => MAP_SKILLS.get(skill)!.standard;
  /**
   * A skill the plan may bring back as review or Fix it: at or below the school grade, or of a secure standard. The
   * current level is no exception: teaching ahead of the grade is fine, remedial work above it is not.
   */
  const eligible = (skill: string) => standardOf(skill).grade <= input.grade || status.get(standardOf(skill).code) === "secure";
  const standards = input.profile.standards
    .flatMap((s) => {
      const known = STANDARDS.get(s.code);
      return known ? [{ ...s, grade: known.grade, skills: known.skills.map((k) => k.id) }] : [];
    })
    .filter((s) => (s.status === "secure" || s.grade <= input.grade) && s.grade <= levelGrade)
    .sort(worstFirst);

  // Placement (CONTEXT 2): in the first workbook, a unit the profile finds secure goes to review, not teaching; a unit
  // with no assessment evidence counts as secure only after its check. In Kindergarten every unit is checked.
  const unassessed = new Set(input.unassessedUnits);
  const secureUnits = firstWorkbook ? level.units.filter((u) => status.get(u.code) === "secure" && !unassessed.has(u.code) && !parentLed).map((u) => u.code) : [];

  // The steps still to teach, by unit, in the level's order.
  const taught = levelSkills.filter((s) => s.delivery !== "warm-up");
  const remaining = new Map<string, QueuedStep[]>();
  for (const s of taught) {
    if (secureUnits.includes(s.unit)) continue;
    const pages = s.delivery === "activity" ? [1] : s.steps.length > 0 ? s.steps.map((x) => Math.max(1, x.pages)) : evenSteps(s.pages, DEFAULT_STEPS);
    for (let step = Math.min(input.passed[s.id] ?? 0, pages.length) + 1; step <= pages.length; step++) {
      remaining.set(s.unit, [...(remaining.get(s.unit) ?? []), { unit: s.unit, skill: s.id, step, pages: pages[step - 1] }]);
    }
  }
  const unitsLeft = level.units.map((u) => u.code).filter((code) => remaining.has(code));
  const testWorkbook = unitsLeft.length === 0 || input.workbook.inLevel >= level.workbooks + 2;
  const support = input.support !== null && input.workbook.inLevel < SUPPORT_WORKBOOKS ? input.support : null;

  // Unit A, then unit B: the next unit left that needs no skill of A; A goes on to later units B does not need. No B in
  // the test workbook (its Review slot reviews every unit) or while a support unit holds the slot.
  const skillsOfUnit = (code: string) => taught.filter((s) => s.unit === code).map((s) => s.id);
  const needs = (code: string, others: readonly string[]) => skillsOfUnit(code).some((id) => others.some((o) => prerequisites(id).has(o)));
  const firstA = unitsLeft[0];
  const unitB = firstA === undefined || testWorkbook || support ? null : unitsLeft.slice(1).find((code) => !needs(code, skillsOfUnit(firstA))) ?? null;
  const unitsA: string[] = [];
  for (const code of unitsLeft) {
    if (code === unitB) continue;
    if (unitB && needs(unitB, skillsOfUnit(code))) break;
    unitsA.push(code);
  }
  const queue: Record<Track, QueuedStep[]> = { A: unitsA.flatMap((code) => remaining.get(code)!), B: unitB ? remaining.get(unitB)! : [] };

  // Fix it: the previous workbook's unresolved misses and last time's missed reviews, one item a skill.
  const fixSkills = firstWorkbook ? [] : [...new Set([...input.misses.map((m) => m.skill), ...input.missedReviews.map((r) => r.skill)])].filter(eligible).sort(skillOrder);
  const fixable = fixSkills.slice(0, FIX_IT_DAYS * FIX_IT_PER_BOX);
  const fixItLater = fixSkills.slice(FIX_IT_DAYS * FIX_IT_PER_BOX);
  const boxOn = (day: number) => fixable.filter((_, i) => (i % FIX_IT_DAYS) + 1 === day);
  const fixItem = (skill: string): FixItem => {
    const misses = input.misses.filter((m) => m.skill === skill);
    return {
      skill,
      standard: standardOf(skill).code,
      mistakes: [...new Set(misses.flatMap((m) => m.mistake ?? []))],
      stuckSteps: [...new Set(misses.flatMap((m) => m.stuckStep ?? []))],
      avoid: { questions: misses.map((m) => m.question), events: misses.map((m) => m.event) },
      reviews: input.missedReviews.filter((r) => r.skill === skill).map((r) => ({ step: r.step, interval: r.interval })).sort((a, b) => a.step - b.step),
    };
  };

  // The days.
  const paused = input.pausedWeeks >= PAUSE_WEEKS;
  const kinds = Array.from({ length: DAYS }, (_, i): DayKind => {
    const day = i + 1;
    if (testWorkbook && day === TEST_DAY) return "test";
    if (testWorkbook && day === LIGHT_DAY) return "light";
    if (testWorkbook && day > LIGHT_DAY) return "mixed";
    return paused && day <= PAUSE_DAYS ? "remember" : "teach";
  });

  // The placement checks: in Kindergarten, two Already know it? pages a unit, one unit a day from Day 1; elsewhere a
  // 4-item unit check on the day's Remember these? page, one unit a day from Day 1.
  const checkDays = kinds.flatMap((k, i) => (k === "teach" || k === "remember" ? [i + 1] : []));
  const knowItUnits = firstWorkbook && parentLed ? level.units.map((u) => u.code) : [];
  // Ruling 2026-10-30: for U1 to U3, the Already know it? pages are the thin-evidence check. The assessment does not
  // serve Kindergarten at all, and the skeleton's Mastery & tests tab defines the Kindergarten check separately (2
  // parent-led pages a unit); the 4-item check covers units of levels the assessment tests. Both would check every
  // Kindergarten unit twice, so a Kindergarten first workbook has exactly one check a unit.
  const unitChecks = firstWorkbook && !parentLed
    ? [...unassessed].filter((code) => STANDARDS.get(code)!.grade <= levelGrade).sort((a, b) => curriculumOrder(STANDARDS.get(a)!, STANDARDS.get(b)!))
    : [];
  const teachDays = kinds.flatMap((k, i) => (k === "teach" ? [i + 1] : []));
  const knowItOn = (day: number) => knowItUnits[teachDays.indexOf(day)] ?? null;
  const checksOn = (day: number) => unitChecks.filter((_, i) => checkDays[i % checkDays.length] === day);

  // The day's shape: page types, roles and parts, before any content.
  const T = (kind: PartKind, track: Track | null = null) => ({ kind, track });
  const bOn = unitB !== null;
  const firstPage = (day: number): Shape => {
    const fixIt = boxOn(day).length > 0 ? [T("fix-it")] : [];
    return n >= WARM_UP_FROM
      ? { type: "warm-up", role: "first", parts: [T("warm-up"), ...fixIt, T("in-your-head")] }
      : { type: pageType("remember-these"), role: "first", parts: [T("remember-these"), ...fixIt] };
  };
  /** Unit B has a page that day: a teaching day. */
  const bDay = (day: number) => bOn && kinds[day - 1] === "teach";
  const challengeTrack = (day: number): Track => (bDay(day) ? "B" : "A");
  const reviewPage = (day: number): Shape => {
    const friday = FRIDAY_5_DAYS.includes(day);
    const second: PartKind = friday ? "friday-5" : n >= MIXED_SET_FROM ? "mixed-set" : "picture-stories";
    const type: PageType = friday ? "friday-5" : n >= MIXED_SET_FROM ? "remember-these-mixed-set" : "remember-these";
    // The 6-page and parent-led days set the challenge on this page (DESIGN 7.2).
    const challenge = sixPages || parentLed ? [T("challenge", challengeTrack(day))] : [];
    const checks = checksOn(day).map(() => T("unit-check"));
    return { type: pageType(type), role: "review", parts: [T("remember-these"), T(second), ...challenge, ...checks] };
  };
  const challengePage = (day: number): Shape => ({ type: pageType("challenge"), role: "challenge", parts: [T("challenge", challengeTrack(day))] });
  const reviewOnly = (role: string): Shape => ({ type: pageType("remember-these"), role, parts: [T("remember-these")] });
  const newIdea = (track: Track) => [...(sixPages ? [T("try-first", track)] : []), T("new-idea", track), T("spot-the-error", track)];
  const twoWays = n >= SOLVE_TWO_WAYS_FROM ? [T("solve-it-two-ways", "A"), T("spot-the-error", "A")] : [];
  const teachDay = (day: number, startsA: boolean, startsB: boolean, extras: Set<string>): Shape[] => {
    const world = sixPages && MATH_IN_THE_WORLD_DAYS.includes(day);
    const second: Shape | null =
      day === DAYS ? { type: pageType("show-what-you-know"), role: "second", parts: [T("show-what-you-know")] }
      : startsA ? { type: pageType("new-idea"), role: "second", parts: newIdea("A") }
      : parentLed ? null
      // On a Math in the world day, Solve it two ways moves to page 2 when it is practice.
      : { type: "practice", role: "second", parts: [T("practice", "A"), ...(world ? twoWays : [])] };
    const practice: Shape = world
      ? { type: "math-in-the-world", role: "practice", parts: [T("math-in-the-world", "A")] }
      : { type: pageType("practice"), role: "practice", parts: [T("practice", "A"), ...(sixPages ? twoWays : [])] };
    // Else on the word problems page.
    const story: Shape = {
      type: pageType("word-problems"), role: "story",
      parts: [T(parentLed ? "picture-stories" : "word-problems", "A"), ...(world && second?.type !== "practice" ? twoWays.slice(0, 1) : [])],
    };
    const slot: Shape = support
      ? input.workbook.inLevel === SUPPORT_WORKBOOKS - 1 && day === MINI_TEST_DAY
        ? { type: pageType("remember-these"), role: "slot", parts: [T("mini-test"), ...(parentLed ? [T("remember-these")] : [])] }
        : reviewOnly("slot")
      : bOn ? { type: pageType("unit-b"), role: "slot", parts: [...(startsB ? newIdea("B") : []), T("practice", "B")] }
      : reviewOnly("slot");
    // A Kindergarten check day: the unit's two Already know it? pages take the review room of page 1 and one of A's
    // pages (A keeps its New idea and practice, or practice and stories); Unit B keeps its page and the challenge, so
    // A to B stays 2 to 1.33 (1.5).
    const knowIt = knowItOn(day);
    if (knowIt) {
      const check = (page: number): Shape => ({ type: "parent-led", role: `check-${page}`, parts: [T("already-know-it")] });
      const teachA = startsA && second ? [second, practice] : [practice, story];
      return [check(1), check(2), ...teachA, slot, reviewPage(day)]
        .map((s) => (extras.has(`${day}:${s.role}`) ? { ...s, parts: [...s.parts, T("remember-these")] } : s));
    }
    const pages: (Shape | null)[] = parentLed || sixPages
      ? [firstPage(day), second, practice, story, slot, reviewPage(day)]
      : [firstPage(day), second, practice, { type: "practice-2", role: "practice-2", parts: [T("practice", "A"), ...twoWays] }, story, slot, reviewPage(day), challengePage(day)];
    return pages.filter((s): s is Shape => s !== null).map((s) => (extras.has(`${day}:${s.role}`) ? { ...s, parts: [...s.parts, T("remember-these")] } : s));
  };
  /** A Remember these? day after a pause: the day's pages, review (the support unit keeps its page) and a challenge. */
  const rememberDay = (day: number): Shape[] => {
    const tail = sixPages || parentLed ? [reviewPage(day)] : [reviewPage(day), challengePage(day)];
    const count = parentLed ? level.pagesPerDay.min + 1 : level.pagesPerDay.max;
    const reviews = Array.from({ length: count - 1 - tail.length }, (_, i) => reviewOnly(`review-${i}`));
    if (support) reviews[reviews.length - 1] = reviewOnly("slot");
    return [firstPage(day), ...reviews, ...tail];
  };
  const levelTestDay = (): Shape[] =>
    Array.from({ length: parentLed ? level.pagesPerDay.min : level.pagesPerDay.max }, (_, i): Shape => ({ type: pageType("level-test"), role: `test-${i}`, parts: [T("level-test")] }));
  /** The light day: half the pages (at least the parent-led minimum), review and a challenge, no new idea. */
  const lightDay = (day: number): Shape[] => {
    const count = Math.max(Math.ceil(level.pagesPerDay.max / 2), parentLed ? level.pagesPerDay.min : 0);
    return [firstPage(day), ...Array.from({ length: count - 2 }, (_, i) => reviewOnly(`review-${i}`)), { ...challengePage(day), parts: [T("remember-these"), T("challenge", "A")] }];
  };

  const extras = new Set<string>();
  const shapesFor = (starts: Record<Track, Set<number>>) =>
    kinds.map((k, i) => {
      const day = i + 1;
      if (k === "test") return levelTestDay();
      if (k === "light") return lightDay(day);
      if (k === "remember") return rememberDay(day);
      return teachDay(day, starts.A.has(day), starts.B.has(day), extras);
    });

  // Run both tracks through the days: a step starts at the start of a teaching day once the last step's pages are
  // spent, up to the cap; the challenge stretches B's step but spends none of its pages.
  const lastStart = testWorkbook ? LAST_START_DAY.test : LAST_START_DAY.normal;
  const simulate = () => {
    const starts: (StepRef & { day: number; track: Track })[] = [];
    const current: Record<Track, { step: QueuedStep; left: number } | null> = { A: null, B: null };
    const next: Record<Track, number> = { A: 0, B: 0 };
    const stepOn: Record<Track, (QueuedStep | null)[]> = { A: [], B: [] };
    const startDays: Record<Track, Set<number>> = { A: new Set(), B: new Set() };
    for (let day = 1; day <= DAYS; day++) {
      const teaching = kinds[day - 1] === "teach";
      for (const track of ["A", "B"] as const) {
        const cur = current[track];
        const canStart = teaching && day <= lastStart && starts.length < NEW_STEPS_MAX && next[track] < queue[track].length;
        if (canStart && (cur === null || cur.left <= 0) && (track === "A" || bDay(day))) {
          const step = queue[track][next[track]++];
          current[track] = { step, left: step.pages };
          starts.push({ ...stepRef(step), day, track });
          startDays[track].add(day);
        }
        stepOn[track][day - 1] = teaching ? current[track]?.step ?? null : null;
        const spent = shapesFor(startDays)[day - 1].filter((s) => s.role !== "challenge" && s.parts.some((p) => p.track === track && p.kind !== "challenge")).length;
        if (current[track] && teaching) current[track]!.left -= spent;
      }
    }
    return { starts, startDays, stepOn };
  };

  // The review share: while short, a Remember these? block goes into spare room on a teaching page, last days first,
  // only where the day's A to B stays about 2:1.
  const weightOf = (s: Shape) => s.parts.filter((p) => REVIEW_PARTS.has(p.kind)).length / s.parts.length;
  const shareOf = (all: Shape[][]) => all.flat().reduce((sum, s) => sum + weightOf(s), 0) / all.flat().length;
  const roles = parentLed || sixPages ? ["practice", "story"] : ["practice-2", "story", "challenge"];
  let sim = simulate();
  for (let day = DAYS; day >= 1 && shareOf(shapesFor(sim.startDays)) < level.reviewShare; day--) {
    if (kinds[day - 1] !== "teach") continue;
    for (const role of roles) {
      if (shareOf(shapesFor(sim.startDays)) >= level.reviewShare) break;
      const page = shapesFor(sim.startDays)[day - 1].find((s) => s.role === role);
      if (!page || page.type === "math-in-the-world") continue;
      extras.add(`${day}:${role}`);
      const { A, B } = tracksOf(shapesFor(sim.startDays)[day - 1]);
      if (B > 0 && (A / B < A_TO_B.min || A / B > A_TO_B.max)) extras.delete(`${day}:${role}`);
    }
  }
  sim = simulate();
  const shapes = shapesFor(sim.startDays);

  // Spaced reviews, with their step and interval, into the day's Remember these? (2 items each, as many as it holds).
  /** Items in a page's Remember these? (DESIGN 7 slot limits; a parent-led page holds 6 to 10 in all). */
  const rememberItems = (shape: Shape) => {
    const alone = shape.parts.length === 1;
    if (shape.role === "review") return parentLed ? (shape.parts.some((p) => p.kind === "friday-5") ? 4 : 6) : sixPages ? 6 : 8;
    if (shape.role === "first") return parentLed ? 6 : 8;
    if (alone) return 8;
    // A block beside other parts: the spare room of a teaching page, the mini-test page or the light day's challenge.
    return parentLed ? (shape.role === "challenge" ? 6 : 2) : 4;
  };
  const room = shapes.map((day) => day.reduce((sum, s) => sum + (s.parts.some((p) => p.kind === "remember-these") && !(s.role === "slot" && support) ? rememberItems(s) / REVIEW_ITEMS_EACH : 0), 0));
  const placed: SpacedReview[] = [];
  const reviewsAfter: SpacedReview[] = [];
  const reviewsSkipped: SpacedReview[] = [];
  const place = (review: SpacedReview) => {
    let due = Math.max(1, review.due);
    while (due <= DAYS && placed.filter((r) => r.due === due).length >= room[due - 1]) due++;
    if (due > DAYS) reviewsAfter.push({ ...review, due: Math.max(1, review.due - DAYS) });
    else placed.push({ ...review, due });
  };
  for (const r of [...input.reviews].sort(byDue)) {
    if (eligible(r.skill)) place(r);
    else reviewsSkipped.push(r);
  }
  for (const track of ["A", "B"] as const) {
    const mine = sim.starts.filter((s) => s.track === track);
    mine.forEach((s, i) => place({ skill: s.skill, step: s.step, interval: 0, due: (mine[i + 1]?.day ?? DAYS + 1) - 1 + SPACED_INTERVALS[0] }));
  }

  // The rest of Remember these?: every unit (test workbook), weak then secure standards, the level's secure units and
  // passed skills, what the level builds on; with nothing behind the child, the "Already know it?" check.
  const teachSkills = taught.map((s) => s.id);
  const passedSkills = teachSkills.filter((id) => (input.passed[id] ?? 0) > 0);
  const buildsOn = [...new Set(levelSkills.flatMap((s) => MAP_SKILLS.get(s.id)!.skill.requires.filter((r) => !levelIds.has(r))))].filter(eligible).sort(skillOrder);
  /** The test workbook's mixed review of every unit, fluency units too: first in each day's Remember these?. */
  const everyUnit = testWorkbook ? level.units.map((u) => u.skills[0]?.id).filter((x): x is string => !!x) : [];
  const filler = [...new Set([
    ...everyUnit,
    ...standards.flatMap((s) => s.skills.filter((id) => !levelIds.has(id) || passedSkills.includes(id)).slice(0, 1)),
    ...levelSkills.filter((s) => secureUnits.includes(s.unit)).map((s) => s.id),
    ...passedSkills,
    ...buildsOn,
  ])];
  // With nothing behind the child (U1), review comes back to the first skill of each of the level's units.
  const earlier = filler.length > 0 ? filler : level.units.map((u) => u.skills[0]?.id).filter((x): x is string => !!x);
  const stepsBefore = (day: number) => sim.starts.filter((s) => s.day < day).map((s) => s.skill);
  const supportSkills = support ? STANDARDS.get(support)!.skills.map((k) => k.id) : [];

  const days = shapes.map((dayShapes, i): PlannedDay => {
    const day = i + 1;
    const kind = kinds[i];
    const stepOf = (track: Track) => sim.stepOn[track][i];
    /** A part on a track's current step (B with no step works on A's); mixed days work on the whole level. */
    const unitPart = (partKind: PartKind, track: Track, items: number, extra: Partial<PlannedPart> = {}): PlannedPart => {
      if (kind === "mixed") return part(partKind, items, { skills: teachSkills, ...extra });
      const own = stepOf(track);
      const step = own ?? stepOf("A");
      return part(partKind, items, {
        unit: step ? (own ? track : "A") : null,
        step: step && stepRef(step),
        skills: step ? [step.skill] : passedSkills.length > 0 ? passedSkills.slice(-1) : earlier.slice(0, 1),
        ...extra,
      });
    };
    const dueHere = placed.filter((r) => r.due === day);
    const turn = (day * 3) % Math.max(1, earlier.length);
    const turned = [...new Set([...everyUnit, ...earlier.slice(turn), ...earlier.slice(0, turn)])];
    let used = 0;
    let fillAt = 0;
    const pagesOut = dayShapes.map((shape, p): PlannedPage => {
      const out = shape.parts.map(({ kind: k, track }, idx): PlannedPart => {
        const t = track ?? "A";
        switch (k) {
          case "warm-up": {
            const facts = n < MIXED_SET_FROM ? 8 : boxOn(day).length > 0 ? 15 : sixPages ? 27 : 30;
            return part(k, facts, { skills: [...level.fluency] });
          }
          case "in-your-head": return part(k, 1, { skills: [...level.fluency] });
          case "fix-it": {
            const box = boxOn(day);
            return part(k, box.length, { skills: [...box], fixIt: box.map(fixItem) });
          }
          case "remember-these": {
            const items = rememberItems(shape);
            if (shape.role === "slot" && support) return part(k, items, { skills: supportSkills });
            const slots = items / REVIEW_ITEMS_EACH;
            const reviews = dueHere.slice(used, used + slots);
            used += reviews.length;
            const fill = turned.length === 0 ? [] : Array.from({ length: slots - reviews.length }, () => turned[fillAt++ % turned.length]);
            return part(k, items, {
              skills: [...new Set([...reviews.map((r) => r.skill), ...fill])],
              reviews: reviews.map((r) => ({ skill: r.skill, step: r.step, interval: r.interval })),
            });
          }
          case "try-first": return unitPart(k, t, 1);
          case "new-idea": return unitPart(k, t, parentLed ? (t === "B" ? 4 : 5) : 4, { methods: ["Method 1", "Method 2"] });
          case "spot-the-error": return unitPart(k, t, 1);
          case "practice": {
            if (shape.role === "practice-2") return unitPart(k, t, 12);
            // A parent-led Unit B page that opens a new step keeps the page within 6 to 10 items.
            const items = parentLed && shape.role === "slot" && shape.parts.length > 1 ? 3 : 8;
            return unitPart(k, t, items, { faded: { watch: 1, finish: 2 } });
          }
          case "solve-it-two-ways": return unitPart(k, "A", 1, { methods: ["Method 1", "Method 2"] });
          case "word-problems": return unitPart(k, "A", 3);
          case "picture-stories":
            // On a story page, A's step; beside Remember these?, the latest steps.
            return track ? unitPart(k, "A", parentLed ? 6 : 3) : part(k, 3, { skills: [...new Set([...stepsBefore(day + 1), ...passedSkills, ...earlier])].slice(0, 3) });
          case "math-in-the-world": return unitPart(k, "A", 1);
          case "mixed-set": return part(k, sixPages ? 3 : 4, { skills: [...new Set([...stepsBefore(day + 1), ...passedSkills, ...earlier])] });
          case "friday-5": {
            // The last 3 weeks: this workbook's steps so far, then the reviews carried at their first intervals.
            const recent = [...new Set([...stepsBefore(day), ...input.reviews.filter((r) => r.interval <= 1 && eligible(r.skill)).map((r) => r.skill)])];
            return part(k, FRIDAY_5_ITEMS, { hints: false, skills: recent.length > 0 ? recent : passedSkills.length > 0 ? passedSkills : earlier });
          }
          case "challenge": return unitPart(k, t, parentLed || shape.parts.length > 1 ? 1 : 2);
          case "show-what-you-know": {
            // One of each step of the workbook (or of each skill passed, when none is new), and the hardest again.
            const skills = sim.starts.length > 0 ? [...new Set(sim.starts.map((s) => s.skill))] : passedSkills.length > 0 ? passedSkills : teachSkills;
            const each = sim.starts.length > 0 ? sim.starts.length : skills.length;
            const items = each + Math.min(HARDEST_AGAIN, each);
            return part(k, parentLed ? clamp(items, PARENT_ITEMS) : items, { skills });
          }
          case "mini-test": return part(k, MINI_TEST_ITEMS, { hints: false, skills: supportSkills });
          case "unit-check": {
            const unit = checksOn(day)[idx - shape.parts.findIndex((x) => x.kind === "unit-check")];
            return part(k, UNIT_CHECK_ITEMS, { hints: false, skills: STANDARDS.get(unit)!.skills.map((x) => x.id), check: { unit } });
          }
          case "already-know-it": {
            // The unit's skills over its two pages: the first half, then the rest.
            const unit = knowItOn(day)!;
            const skills = level.units.find((u) => u.code === unit)!.skills.map((x) => x.id);
            const page = shape.role === "check-1" ? 1 : 2;
            const half = Math.ceil(skills.length / 2);
            const mine = page === 1 ? skills.slice(0, half) : skills.slice(half);
            return part(k, ALREADY_KNOW_IT_ITEMS, { hints: false, skills: mine.length > 0 ? mine : skills, check: { unit, page } });
          }
          case "level-test": {
            // Every skill of the level, fluency too, dealt over the test's pages, so together they sample every unit.
            const mine = levelSkills.filter((_, s) => s % dayShapes.length === p);
            const skills = mine.length > 0 ? mine : [levelSkills[p % levelSkills.length]];
            return part(k, parentLed ? clamp(skills.length, PARENT_ITEMS) : skills.length, {
              hints: false,
              skills: skills.map((s) => s.id),
              test: { units: [...new Set(skills.map((s) => s.unit))], contextQuestions: p === 0 ? 1 : 0, sittings: parentLed ? 2 : 1 },
            });
          }
        }
      });
      const unit = out.find((x) => x.unit !== null)?.unit ?? null;
      return { number: p + 1, type: shape.type, unit, instructions, parts: out };
    });
    return { day, week: day <= DAYS_A_WEEK ? 1 : 2, kind, pages: pagesOut };
  });

  // Every part with items has a skill to aim at.
  for (const d of days) {
    for (const page of d.pages) {
      const empty = page.parts.find((x) => x.items > 0 && x.skills.length === 0);
      if (empty) return { ok: false, reason: `day ${d.day} page ${page.number}: ${empty.kind} has no skill to aim at` };
    }
  }

  return {
    ok: true,
    plan: {
      level: n,
      lead: level.lead,
      pagesADay: { ...level.pagesPerDay },
      timeTarget: { ...level.dailyMinutes },
      testWorkbook,
      units: { A: unitsA.filter((code) => code === firstA || sim.starts.some((s) => s.unit === code)), B: unitB, support },
      newSteps: sim.starts,
      reviewShare: { target: level.reviewShare, planned: Math.round(shareOf(shapes) * 1000) / 1000 },
      fixItLater,
      reviewsAfter: reviewsAfter.sort(byDue),
      reviewsSkipped,
      checks: [
        ...knowItUnits.flatMap((unit, i) => (teachDays[i] ? [{ unit, kind: "already-know-it" as const, day: teachDays[i] }] : [])),
        ...unitChecks.map((unit, i) => ({ unit, kind: "unit-check" as const, day: checkDays[i % checkDays.length] })),
      ],
      days,
    },
  };
}
