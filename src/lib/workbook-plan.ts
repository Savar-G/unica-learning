// The two-week curriculum plan (#308, spec #296): what a child's next workbook holds, day by day and page by page,
// before any question is written. The generator (#311) fills each planned part with items; the templates (#310) give
// each page type its look. The rules are the curriculum skeleton's (round 2, D-192), written out in
// .design/workbooks/CONTEXT.md (sections 1, 4 and 5) and DESIGN.md (section 7):
//
// - Ten days, five a week. Pages a day by band (D-186): U1 to U3 4 to 6 parent-led pages, U4 to U18 8, U19 to U30 6.
// - The day's parts, with their level gates: page 1 is the warm-up from U8 (fact practice and one In your head item),
//   below U8 a "Remember these?" picture review; the Fix it box sits on page 1 of Days 1 to 5 from workbook 2; Try first
//   from U19 on a day a step starts; New idea only on a day a step starts (a worked example solved two ways, Method 1
//   and Method 2, then one spot-the-error item), otherwise that page is practice; practice that builds (faded: watch one,
//   finish two, then on your own); practice 2 (harder rows, Solve it two ways, spot the error); word problems (from U19
//   Math in the world on Days 4 and 9); Unit B; Remember these? with the Mixed set from U10 (below U10 with picture
//   stories), and on Days 5 and 10 the Friday 5 in its place (five questions from the last 3 weeks, no hints); 1 to 2
//   challenge problems every day. Day 10 of every workbook is Show what you know (one of each step, the hardest again).
// - Units A and B: the main unit A and the next unit of the level that does not depend on A (no B skill needs an A
//   skill, through the skill map's edges), about 2 pages of A to 1 of B a day (A: the new idea or practice, practice,
//   practice 2 and word problems; B: Unit B and the challenge). At most 8 new steps a workbook, A and B together. A
//   step's pages are its skill's pages over its steps; a new step starts at the start of a day, after the last step's
//   pages; once the cap is reached, the pages consolidate. With no unit B, the Unit B page is spaced review.
// - Review share by level (4.3): the share of pages held for review, Fix it, warm-up, Friday 5 and tests. A page counts
//   by its parts (Remember these? with the Mixed set is a review page; with picture stories, half). When the day
//   template holds less than the level's share, Unit B pages become "Remember these?" pages, last days first.
// - Spaced review (4.4): a passed step comes back after 2 practice days, 1 week, 3 weeks and 2 months (2, 5, 15 and 40
//   practice days, five a week), 2 items each time; a miss goes back to 2 days (nextReview). The plan places the reviews
//   due in its ten days, and the first reviews of its own steps; what falls later is carried (reviewsAfter).
// - Fix it (4.6): workbook 1 has none. From workbook 2: last time's standards (not yet secure, with a wrong, blank or
//   right-with-help answer met since the last workbook began), worst first, one new question each, up to 3 a box,
//   spread over page 1 of Days 1 to 5. The profile counts answers over all time, so a standard missed before and met
//   again last time, still not secure, counts too. The box names the mistakes, the stuck steps and the evidence (the
//   test and the event ids) so the generator never asks the same question again. Those with no box are in fixItLater.
// - The test workbook (4.9): when every step of the level is passed, or after the level's workbooks plus 2. Days 1 to 6
//   normal with Remember these? on every unit of the level; Day 7 the level test in one sitting (U1 to U3: two parts),
//   every unit, no hints, a context question; Day 8 light (half the pages, no new idea); Days 9 and 10 mixed practice
//   across the level; Day 10 still Show what you know. No new step after Day 6.
// - Never a weakness above the school grade (D-084): a standard above the school grade that is not secure is never in a
//   Fix it box or a review. The plan never comes back to a standard above the level's grade.
// - Deterministic: the same input gives the same plan; ties go by the level's order, then curriculum order.
//
// The level comes from the curriculum skeleton (G0, #361): PlanLevel is the part the plan reads. Step mastery (4.5) is
// decided from the markings before the plan: `passed` says how many steps of each skill are passed.
// Pure TypeScript: no Next.js, React, network, database, clock or randomness.
import { BC_SKILL_MAP, worstFirst, type Grade } from "@/lib/assessment";
import type { ChildLearnerProfile, ChildStandard } from "@/lib/child-profile";

/**
 * The page types of a workbook day (DESIGN.md section 7), a closed list for the generator and the templates. The
 * renderer's fixed test template (#309) has "cover" and "practice": "practice" is this "practice"; the cover, the How +
 * Plan page and the back cover are not day pages.
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
  "show-what-you-know", "level-test",
] as const;
export type PartKind = (typeof PART_KINDS)[number];

/** How a skill is taught (the skeleton's Delivery): warm-up skills live in the daily warm-up, activities get 1 page. */
export type Delivery = "new-step" | "warm-up" | "activity" | "parent-checked";

/** One skill of a level, as the skeleton lists it. */
export interface PlanSkill {
  /** The BC skill map's id. */
  id: string;
  delivery: Delivery;
  /** Its page budget. */
  pages: number;
  /** Its drafted steps (Grade 3 only today); none means DEFAULT_STEPS, which the generator drafts. */
  steps?: readonly unknown[];
}

/** One unit (a BC standard) of a level, its skills in order. */
export interface PlanUnit {
  code: string;
  skills: readonly PlanSkill[];
}

/** A Unica level, as the curriculum skeleton gives it (G0, #361): its units in dependency order. */
export interface PlanLevel {
  /** 1 to 30 (U1 to U30). */
  number: number;
  /** The level's workbook budget. */
  workbooks: number;
  units: readonly PlanUnit[];
}

/** A step: unit, skill and step number (from 1). */
export interface StepRef {
  unit: string;
  skill: string;
  step: number;
}

/** A spaced review: a passed step, the interval it is on (0 to 3: 2 days, 1 week, 3 weeks, 2 months), when it is due. */
export interface SpacedReview {
  skill: string;
  step: number;
  interval: number;
  /** The practice day it is due, counted from this workbook's Day 1 (1); 1 or less is due on Day 1. */
  due: number;
}

/** One standard in a Fix it box: a new question on it. */
export interface FixItem {
  standard: string;
  /** The cause ids of the wrong answers the child gave ("O3"). */
  mistakes: string[];
  /** The worked step ids where the child got stuck. */
  stuckSteps: string[];
  /** The test and the events the misses came from: their questions are never asked again. */
  avoid: ChildStandard["evidence"];
}

export interface PlannedPart {
  kind: PartKind;
  /** The unit track it teaches: "A", "B", or null for review, warm-up, tests and mixed work. */
  unit: "A" | "B" | null;
  /** The step it teaches, for a unit part; null otherwise. */
  step: StepRef | null;
  /** The skill map's ids its items are on. */
  skills: string[];
  /** How many items (at most). */
  items: number;
  /** False on the Friday 5 and the level test. */
  hints: boolean;
  /** A new idea: a new step starts here, its worked example solved two ways. */
  methods?: ["Method 1", "Method 2"];
  /** Faded practice: a full example to watch, then half-finished ones to finish, then the rest alone. */
  faded?: { watch: number; finish: number };
  /** The level test: its context questions and its sittings. */
  test?: { units: string[]; contextQuestions: number; sittings: 1 | 2 };
  fixIt?: FixItem[];
}

export interface PlannedPage {
  /** The page of the day, from 1. */
  number: number;
  type: PageType;
  unit: "A" | "B" | null;
  parts: PlannedPart[];
}

export interface PlannedDay {
  /** 1 to 10. */
  day: number;
  week: 1 | 2;
  pages: PlannedPage[];
}

export interface WorkbookPlan {
  level: number;
  /** Pages a day (D-186). */
  pagesADay: { min: number; max: number };
  /** The daily time target in minutes: typical, not a limit. */
  timeTarget: { min: number; max: number };
  /** The level's test workbook (4.9). */
  testWorkbook: boolean;
  /** Unit A (in order, when A moves on to the next unit) and unit B. */
  units: { A: string[]; B: string | null };
  /** The new steps, in the order they start. */
  newSteps: (StepRef & { day: number; track: "A" | "B" })[];
  /** The level's review share, and the plan's. */
  reviewShare: { target: number; planned: number };
  /** Last time's standards with no Fix it box here, worst first. */
  fixItLater: string[];
  /** The spaced reviews due after this workbook, counted from the next workbook's Day 1. */
  reviewsAfter: SpacedReview[];
  days: PlannedDay[];
}

/** The part of the child's profile (ChildLearnerProfile) the plan reads. */
export type PlanProfile = {
  assessment: Pick<NonNullable<ChildLearnerProfile["assessment"]>, "completedAt"> | null;
  standards: readonly Pick<ChildStandard, "code" | "status" | "assessment" | "events" | "evidence">[];
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
  /** When the last workbook began (ISO 8601): what happened since is last time's. Null for the first workbook. */
  since: string | null;
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
const FIX_IT_DAYS = 5;
const FIX_IT_PER_BOX = 3;
const FRIDAY_5_DAYS = [5, 10];
const MATH_IN_THE_WORLD_DAYS = [4, 9];
/** The test workbook's days (4.9). */
const TEST_DAY = 7;
const LIGHT_DAY = 8;
const LAST_START_DAY = { normal: 9, test: 6 };

// The level gates (CONTEXT section 5).
const WARM_UP_FROM = 8;
const MIXED_SET_FROM = 10;
const UPPER_FROM = 19;
const PARENT_LED_TO = 3;

/** The bands of CONTEXT section 1 and the review share of 4.3, by the first level of each row. */
const BANDS = [
  { from: 1, pages: { min: 4, max: 6 }, time: { min: 15, max: 20 }, share: 0.1 },
  { from: 4, pages: { min: 8, max: 8 }, time: { min: 20, max: 25 }, share: 0.15 },
  { from: 7, pages: { min: 8, max: 8 }, time: { min: 20, max: 25 }, share: 0.2 },
  { from: 10, pages: { min: 8, max: 8 }, time: { min: 25, max: 30 }, share: 0.25 },
  { from: 16, pages: { min: 8, max: 8 }, time: { min: 25, max: 30 }, share: 0.25 },
  { from: 19, pages: { min: 6, max: 6 }, time: { min: 30, max: 35 }, share: 0.3 },
  { from: 22, pages: { min: 6, max: 6 }, time: { min: 30, max: 35 }, share: 0.35 },
  { from: 25, pages: { min: 6, max: 6 }, time: { min: 30, max: 40 }, share: 0.35 },
] as const;

/** The parts that count toward the review share. */
const REVIEW_PARTS = new Set<PartKind>(["warm-up", "in-your-head", "fix-it", "remember-these", "mixed-set", "friday-5", "show-what-you-know", "level-test"]);

const STANDARDS = new Map(BC_SKILL_MAP.standards.map((s) => [s.code, s]));
const MAP_SKILLS = new Map(BC_SKILL_MAP.standards.flatMap((s) => s.skills.map((k) => [k.id, { skill: k, standard: s }] as const)));

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

type Track = "A" | "B";
interface QueuedStep extends StepRef {
  pages: number;
}

const part = (kind: PartKind, items: number, over: Partial<PlannedPart> = {}): PlannedPart => ({
  kind, unit: null, step: null, skills: [], items, hints: true, ...over,
});

/** The child's next two weeks (see the header for the rules), or why the level cannot be planned. */
export function planWorkbook(input: PlanInput): PlanResult {
  const { level } = input;
  if (!Number.isInteger(level.number) || level.number < 1 || level.number > LEVELS) return { ok: false, reason: "the level is not U1 to U30" };
  const levelSkills = level.units.flatMap((u) => u.skills.map((s) => ({ ...s, unit: u.code })));
  if (levelSkills.length === 0) return { ok: false, reason: "the level has no skills" };
  const unknown = levelSkills.find((s) => !MAP_SKILLS.has(s.id));
  if (unknown) return { ok: false, reason: `${unknown.id} is not a skill of the BC skill map` };
  const outside = Object.keys(input.passed).find((id) => !levelSkills.some((s) => s.id === id));
  if (outside) return { ok: false, reason: `${outside} is not a skill of this level` };
  if (!Number.isInteger(input.workbook.number) || input.workbook.number < 1) return { ok: false, reason: "the workbook number is not 1 or more" };
  if (input.since !== null && Number.isNaN(Date.parse(input.since))) return { ok: false, reason: "since is not a date" };

  const n = level.number;
  const band = [...BANDS].reverse().find((b) => n >= b.from)!;
  const parentLed = n <= PARENT_LED_TO;
  const sixPages = n >= UPPER_FROM;
  const levelGrade = Math.max(...levelSkills.map((s) => MAP_SKILLS.get(s.id)!.standard.grade));

  // The steps still to teach, by unit, in the level's order.
  const taught = levelSkills.filter((s) => s.delivery !== "warm-up");
  const stepsOf = (s: PlanSkill) => (s.delivery === "activity" ? 1 : s.steps?.length || DEFAULT_STEPS);
  const remaining = new Map<string, QueuedStep[]>();
  for (const s of taught) {
    const count = stepsOf(s);
    const pages = s.delivery === "activity" ? 1 : Math.max(1, Math.round(s.pages / count));
    for (let step = Math.min(input.passed[s.id] ?? 0, count) + 1; step <= count; step++) {
      remaining.set(s.unit, [...(remaining.get(s.unit) ?? []), { unit: s.unit, skill: s.id, step, pages }]);
    }
  }
  const unitsLeft = level.units.map((u) => u.code).filter((code) => remaining.has(code));
  const testWorkbook = unitsLeft.length === 0 || input.workbook.inLevel >= level.workbooks + 2;

  // Unit A, then unit B: the next unit left that needs no skill of A. A goes on to later units B does not need.
  const skillsOfUnit = (code: string) => taught.filter((s) => s.unit === code).map((s) => s.id);
  const needs = (code: string, others: readonly string[]) =>
    skillsOfUnit(code).some((id) => others.some((o) => prerequisites(id).has(o)));
  const firstA = unitsLeft[0];
  const unitB = firstA === undefined ? null : unitsLeft.slice(1).find((code) => !needs(code, skillsOfUnit(firstA))) ?? null;
  const unitsA: string[] = [];
  for (const code of unitsLeft) {
    if (code === unitB) continue;
    if (unitB && needs(unitB, skillsOfUnit(code))) break;
    unitsA.push(code);
  }
  const queue: Record<Track, QueuedStep[]> = { A: unitsA.flatMap((code) => remaining.get(code)!), B: unitB ? remaining.get(unitB)! : [] };

  // The profile: what the review may come back to, and last time's misses for Fix it.
  const known = input.profile.standards
    .flatMap((s) => {
      const st = STANDARDS.get(s.code);
      return st ? [{ ...s, grade: st.grade, skills: st.skills.map((k) => k.id) }] : [];
    })
    .filter((s) => s.status === "secure" || s.grade <= input.grade)
    .sort(worstFirst);
  // A standard above the level's grade comes with its own level.
  const inReach = known.filter((s) => s.grade <= levelGrade);
  const levelIds = new Set(taught.map((s) => s.id));
  const passedSkills = taught.filter((s) => (input.passed[s.id] ?? 0) > 0).map((s) => s.id);
  /** A skill the child met: outside the level, or a level skill with a passed step. */
  const met = (id: string) => !levelIds.has(id) || passedSkills.includes(id);

  // Fix it: last time's standards, worst first, one item each, spread over page 1 of Days 1 to 5.
  const since = input.since === null ? null : Date.parse(input.since);
  const sinceLastWorkbook = (at: string | null) => since === null || (at !== null && Date.parse(at) >= since);
  const lastTime = input.workbook.number === 1 ? [] : known.filter((s) => {
    if (s.status === "secure") return false;
    const events = s.events.wrong + s.events.rightWithHelp + s.events.blank > 0 && sinceLastWorkbook(s.events.lastAt);
    const test = s.assessment !== null && s.assessment.correct < s.assessment.total && sinceLastWorkbook(input.profile.assessment?.completedAt ?? null);
    return events || test;
  });
  const fixable = lastTime
    .filter((s) => s.grade <= levelGrade)
    .map((s) => ({ ...s, skills: s.skills.filter(met) }))
    .filter((s) => s.skills.length > 0)
    .slice(0, FIX_IT_DAYS * FIX_IT_PER_BOX);
  const fixItLater = lastTime.filter((s) => !fixable.some((f) => f.code === s.code)).map((s) => s.code);
  const boxOn = (day: number) => fixable.filter((_, i) => (i % FIX_IT_DAYS) + 1 === day);

  // The day's shape: page types and part kinds, before any content.
  type Shape = { type: PageType; unit: Track | null; kinds: PartKind[] };
  const dayKind = (day: number) =>
    !testWorkbook ? "normal" : day === TEST_DAY ? "test" : day === LIGHT_DAY ? "light" : day > LIGHT_DAY ? "mixed" : "normal";
  const fixItDay = (day: number) => boxOn(day).length > 0;
  const firstPage = (day: number): Shape =>
    n >= WARM_UP_FROM
      ? { type: "warm-up", unit: null, kinds: ["warm-up", ...(fixItDay(day) ? ["fix-it" as const] : []), "in-your-head"] }
      : { type: parentLed ? "parent-led" : "remember-these", unit: null, kinds: ["remember-these", ...(fixItDay(day) ? ["fix-it" as const] : [])] };
  const reviewPage = (day: number): Shape => {
    const friday = FRIDAY_5_DAYS.includes(day);
    const second: PartKind = friday ? "friday-5" : n >= MIXED_SET_FROM ? "mixed-set" : "picture-stories";
    const type: PageType = parentLed ? "parent-led" : friday ? "friday-5" : n >= MIXED_SET_FROM ? "remember-these-mixed-set" : "remember-these";
    return { type, unit: null, kinds: ["remember-these", second, ...(sixPages || parentLed ? ["challenge" as const] : [])] };
  };

  /** A normal or mixed day: `startsA`, a step of A starts that day; `keepsB`, its Unit B page stays Unit B. */
  const normalShape = (day: number, startsA: boolean, keepsB: boolean): Shape[] => {
    const lead = (type: PageType): PageType => (parentLed ? "parent-led" : type);
    const second: Shape | null =
      day === DAYS ? { type: lead("show-what-you-know"), unit: null, kinds: ["show-what-you-know"] }
      : startsA ? { type: lead("new-idea"), unit: "A", kinds: [...(n >= UPPER_FROM ? ["try-first" as const] : []), "new-idea", "spot-the-error"] }
      : parentLed ? null
      : { type: "practice", unit: "A", kinds: ["practice"] };
    const unitBPage: Shape = keepsB ? { type: lead("unit-b"), unit: "B", kinds: ["practice"] } : { type: lead("remember-these"), unit: null, kinds: ["remember-these"] };
    const story: Shape = sixPages && MATH_IN_THE_WORLD_DAYS.includes(day)
      ? { type: "math-in-the-world", unit: "A", kinds: ["math-in-the-world"] }
      : { type: lead("word-problems"), unit: "A", kinds: [parentLed ? "picture-stories" : "word-problems"] };
    const practice: Shape = { type: lead("practice"), unit: "A", kinds: ["practice"] };
    const practice2: Shape = { type: "practice-2", unit: "A", kinds: ["practice", "solve-it-two-ways", "spot-the-error"] };
    const challenge: Shape = { type: "challenge", unit: "B", kinds: ["challenge"] };
    // The 6-page and parent-led days set the challenge on the review page (DESIGN 7.2).
    const shapes = parentLed || sixPages
      ? [firstPage(day), second, practice, story, unitBPage, reviewPage(day)]
      : [firstPage(day), second, practice, practice2, story, unitBPage, reviewPage(day), challenge];
    return shapes.filter((s): s is Shape => s !== null);
  };

  // When each track starts its steps: at the start of a day, after the last step's pages, up to the cap.
  const lastStart = testWorkbook ? LAST_START_DAY.test : LAST_START_DAY.normal;
  /** The pages a track spends on its step that day; the challenge stretches B's step but spends none of its pages. */
  const trackPages = (shapes: Shape[], track: Track) => shapes.filter((s) => s.unit === track && s.type !== "challenge").length;

  // The review share: Unit B pages become "Remember these?" pages, last days first, until the plan holds the share.
  const weightOf = (s: Shape) => s.kinds.filter((k) => REVIEW_PARTS.has(k)).length / s.kinds.length;
  const shareOf = (all: Shape[][]) => {
    const flat = all.flat();
    return flat.reduce((sum, s) => sum + weightOf(s), 0) / flat.length;
  };
  const kindsByDay = Array.from({ length: DAYS }, (_, i) => dayKind(i + 1));
  const unitBDays = new Set(kindsByDay.flatMap((k, i) => (k === "normal" && unitB ? [i + 1] : [])));
  const shapesFor = (startsA: Set<number>) =>
    kindsByDay.map((k, i) => {
      const day = i + 1;
      if (k === "test") return levelTestShape();
      if (k === "light") return lightShape(day);
      return normalShape(day, k === "normal" && startsA.has(day), unitBDays.has(day));
    });
  function levelTestShape(): Shape[] {
    const count = parentLed ? band.pages.min : band.pages.max;
    return Array.from({ length: count }, (): Shape => ({ type: parentLed ? "parent-led" : "level-test", unit: null, kinds: ["level-test"] }));
  }
  function lightShape(day: number): Shape[] {
    const count = Math.ceil(band.pages.max / 2);
    const review: Shape = { type: parentLed ? "parent-led" : "remember-these", unit: null, kinds: ["remember-these"] };
    return [firstPage(day), ...Array.from({ length: Math.max(0, count - 2) }, () => review), { type: parentLed ? "parent-led" : "challenge", unit: null, kinds: ["challenge"] }];
  }

  // Run both tracks through the days: when each step starts, and which step each day works on.
  const simulate = () => {
    const starts: (StepRef & { day: number; track: Track })[] = [];
    const current: Record<Track, { step: QueuedStep; left: number } | null> = { A: null, B: null };
    const next: Record<Track, number> = { A: 0, B: 0 };
    const stepOn: Record<Track, (QueuedStep | null)[]> = { A: [], B: [] };
    const startsA = new Set<number>();
    for (let day = 1; day <= DAYS; day++) {
      const kind = kindsByDay[day - 1];
      for (const track of ["A", "B"] as const) {
        const cur = current[track];
        const canStart = kind === "normal" && day <= lastStart && starts.length < NEW_STEPS_MAX && next[track] < queue[track].length;
        if (canStart && (cur === null || cur.left <= 0) && (track === "A" || unitBDays.has(day))) {
          const step = queue[track][next[track]++];
          current[track] = { step, left: step.pages };
          starts.push({ unit: step.unit, skill: step.skill, step: step.step, day, track });
          if (track === "A") startsA.add(day);
        }
        stepOn[track][day - 1] = kind === "normal" ? current[track]?.step ?? null : null;
        const shape = shapesFor(startsA)[day - 1];
        if (current[track]) current[track]!.left -= trackPages(shape, track);
      }
    }
    return { starts, startsA, stepOn };
  };

  let sim = simulate();
  const target = band.share;
  // Convert Unit B pages to review while the share is short, last days first; a converted day keeps no B step.
  for (const day of [...unitBDays].sort((a, b) => b - a)) {
    if (shareOf(shapesFor(sim.startsA)) >= target) break;
    unitBDays.delete(day);
    sim = simulate();
  }
  const shapes = shapesFor(sim.startsA);

  // Spaced reviews: those carried in, and each new step's first reviews after its last day.
  const scheduled: SpacedReview[] = [];
  const reviewsAfter: SpacedReview[] = [];
  const place = (r: SpacedReview) => {
    let due = Math.max(1, r.due);
    while (due <= DAYS && kindsByDay[due - 1] === "test") due++;
    if (due > DAYS) {
      reviewsAfter.push({ ...r, due: r.due - DAYS });
      return;
    }
    scheduled.push({ ...r, due });
    const after = nextReview({ ...r, due }, due, true);
    if (after) place(after);
  };
  for (const r of [...input.reviews].sort((a, b) => a.due - b.due || a.skill.localeCompare(b.skill) || a.step - b.step)) place(r);
  for (const track of ["A", "B"] as const) {
    sim.starts.filter((s) => s.track === track).forEach((s, i, all) => {
      const end = (all[i + 1]?.day ?? DAYS + 1) - 1;
      place({ skill: s.skill, step: s.step, interval: 0, due: end + SPACED_INTERVALS[0] });
    });
  }

  const allLevelSkills = taught.map((s) => s.id);
  const warmUpSkills = levelSkills.filter((s) => s.delivery === "warm-up").map((s) => s.id);
  /** The skills to review on a day, by priority: due reviews, every unit (test workbook), weak, then secure standards. */
  const reviewSkills = (day: number) => {
    const due = scheduled.filter((r) => r.due === day).map((r) => r.skill);
    const units = testWorkbook ? level.units.map((u) => u.skills.find((s) => s.delivery !== "warm-up")?.id).filter((x): x is string => !!x) : [];
    const fromProfile = inReach.flatMap((s) => s.skills.filter(met).slice(0, 1));
    const fill = [...due, ...units, ...fromProfile, ...passedSkills];
    return [...new Set(fill)];
  };
  const stepsBefore = (day: number) => sim.starts.filter((s) => s.day < day).map((s) => s.skill);

  const days = shapes.map((dayShapes, i): PlannedDay => {
    const day = i + 1;
    const kind = kindsByDay[i];
    const stepOf = (track: Track) => sim.stepOn[track][i];
    const mixedSkills = kind === "mixed" ? allLevelSkills : null;
    const unitPart = (kindName: PartKind, track: Track, items: number, extra: Partial<PlannedPart> = {}): PlannedPart => {
      const step = mixedSkills ? null : stepOf(track) ?? (track === "B" ? stepOf("A") : null);
      const skills = mixedSkills ?? (step ? [step.skill] : passedSkills.slice(-1));
      return part(kindName, items, { unit: mixedSkills ? null : step ? (step === stepOf(track) ? track : "A") : null, step: step && { unit: step.unit, skill: step.skill, step: step.step }, skills, ...extra });
    };
    const review = reviewSkills(day);
    let remembered = 0;
    const pagesOut = dayShapes.map((shape, p): PlannedPage => {
      const out: PlannedPart[] = shape.kinds.map((k): PlannedPart => {
        switch (k) {
          case "warm-up": return part(k, fixItDay(day) ? 15 : n < 10 ? 8 : 30, { skills: warmUpSkills });
          case "in-your-head": return part(k, 1, { skills: warmUpSkills });
          case "fix-it": {
            const box = boxOn(day);
            return part(k, box.length, {
              skills: box.flatMap((s) => s.skills),
              fixIt: box.map((s) => ({ standard: s.code, mistakes: [...s.events.mistakes], stuckSteps: [...s.events.stuckSteps], avoid: { assessmentId: s.evidence.assessmentId, events: [...s.evidence.events] } })),
            });
          }
          case "remember-these": {
            // Each Remember these? of the day takes the next skills of the list, two items a skill (4.4: 2 to 4).
            const size = sixPages ? 3 : 4;
            const from = (remembered++ * size) % Math.max(1, review.length);
            return part(k, sixPages ? 6 : 8, { skills: [...review, ...review].slice(from, from + Math.min(size, review.length)) });
          }
          case "try-first": return unitPart(k, "A", 1);
          case "new-idea": return unitPart(k, shape.unit ?? "A", parentLed ? 3 : 4, { methods: ["Method 1", "Method 2"] });
          case "spot-the-error": return unitPart(k, shape.unit ?? "A", 1);
          case "practice":
            return unitPart(k, shape.unit ?? "A", shape.type === "practice-2" ? 12 : 8, shape.type === "practice-2" ? {} : { faded: { watch: 1, finish: 2 } });
          case "solve-it-two-ways": return unitPart(k, "A", 1, { methods: ["Method 1", "Method 2"] });
          case "word-problems": return unitPart(k, "A", 3);
          case "picture-stories": return shape.unit ? unitPart(k, "A", 3) : part(k, 3, { skills: [...new Set([...stepsBefore(day + 1), ...passedSkills])].slice(-3) });
          case "math-in-the-world": return unitPart(k, "A", 1);
          case "mixed-set": return part(k, sixPages ? 2 : 4, { skills: [...new Set([...passedSkills, ...stepsBefore(day + 1)])] });
          case "friday-5": {
            const recent = [...new Set([...stepsBefore(day), ...input.reviews.filter((r) => r.interval <= 1).map((r) => r.skill), ...passedSkills])];
            return part(k, 5, { hints: false, skills: recent.length > 0 ? recent : allLevelSkills.slice(0, 1) });
          }
          case "challenge": {
            const track: Track = unitB && kind === "normal" ? "B" : "A";
            return unitPart(k, track, parentLed ? 1 : 2);
          }
          case "show-what-you-know": {
            // One of each step, and the hardest (the last ones) again.
            const skills = sim.starts.length > 0 ? [...new Set(sim.starts.map((s) => s.skill))] : passedSkills.length > 0 ? passedSkills : allLevelSkills;
            const each = Math.max(1, sim.starts.length);
            return part(k, each + Math.min(3, each), { skills });
          }
          case "level-test": {
            // The level's skills dealt over the test's pages, so together they sample every unit.
            const skills = taught.filter((_, s) => s % dayShapes.length === p);
            return part(k, Math.max(1, skills.length), {
              hints: false,
              skills: skills.map((s) => s.id),
              test: { units: [...new Set(skills.map((s) => s.unit))], contextQuestions: p === 0 ? 1 : 0, sittings: parentLed ? 2 : 1 },
            });
          }
        }
      });
      // A unit page's track is its first part's; a Unit B page with no B step left practises A.
      const unit = shape.unit === null ? null : out.find((x) => x.unit !== null)?.unit ?? null;
      return { number: p + 1, type: shape.type, unit, parts: out };
    });
    return { day, week: day <= DAYS_A_WEEK ? 1 : 2, pages: pagesOut };
  });

  const planned = shareOf(shapes);
  return {
    ok: true,
    plan: {
      level: n,
      pagesADay: { ...band.pages },
      timeTarget: { ...band.time },
      testWorkbook,
      units: { A: unitsA.filter((code) => sim.starts.some((s) => s.unit === code) || code === firstA), B: unitB },
      newSteps: sim.starts,
      reviewShare: { target, planned: Math.round(planned * 1000) / 1000 },
      fixItLater,
      reviewsAfter: reviewsAfter.sort((a, b) => a.due - b.due || a.skill.localeCompare(b.skill) || a.step - b.step),
      days,
    },
  };
}
