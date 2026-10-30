// The two-week curriculum plan (#308, spec #296): what a child's next workbook teaches, day by day, before any question
// is written. The generator (#311) fills each planned page with questions; the templates (#310) give each page type its
// look. Input: the child's profile (#303, read with readChildProfile; PlanProfile is the part the plan reads), the
// school grade, the Unica level with its skills, the level's skills earlier workbooks taught, and when the last
// workbook began. Output: ten days, five a week, each a list of planned pages (type, BC standards and skill ids,
// question count with a difficulty for each question, estimated minutes), as plain data.
//
// The rules (the curriculum page, /curriculum):
// - A worked example before practice on each new idea: a new idea opens with a "new-idea" page (worked example, then
//   three easy questions) and is practised the same day. New ideas follow the level's prerequisites (the skill map's
//   edges), ties in the stable order.
// - Easy to harder in small steps: a new idea takes two days, its questions going from difficulty 1 to 3, never down
//   and never up by more than 1 (new idea, practice; then practice, stories, step-up).
// - Earlier skills every day: each day but the level test day opens with a review of skills met before that day: the
//   profile's weak standards first, then the level's skills already taught, then the profile's secure standards, in
//   turn. Never today's new idea or a later one. A child with nothing met before starts the review once there is.
// - A Fix it box: last time's standards (not yet secure, with a wrong, blank or right-with-help answer, met since the
//   last workbook began; on the first workbook, the assessment and every event), worst first, two a day from day 1,
//   each with two new questions. The box names the mistakes, the stuck steps and the evidence (the test and the event
//   ids) so the generator writes new questions, never the same one again. The profile counts answers over all time, so
//   a standard missed before and met again last time, still not secure, counts too. A secure standard is reviewed, not
//   fixed. Last time's standards with no box here are listed in fixItLater, never dropped.
// - A level test: when this workbook teaches the level's last new ideas, day 10 is the level test, in one sitting, on
//   every skill of the level. Five new ideas fill the two weeks; four or fewer leave day 10 for the test.
// - Practice where it is needed: a child with four or more weak standards gets at most three new ideas, and the days
//   after them practise the weak standards, worst first, then the level's skills.
// - About 15 to 30 minutes a day: each page type has its minutes per question; every day adds up to 15 to 30.
// - Never a weakness above the school grade (D-084): the plan reads a standard's grade from the skill map, and a
//   standard above the school grade that is not secure is never in a Fix it box, a practice day or a review. The plan
//   also never comes back to a standard above the level's grade: it comes with its own level.
// - Deterministic: the same input gives the same plan, whatever order its lists come in; ties go by curriculum order
//   (curriculumOrder, shared with the profile), then by the skill's place in its standard.
//
// The level's skills come in as input: the curriculum skeleton that lists each level's skills is not in the code yet.
// Pure TypeScript: no Next.js, React, network, database, clock or randomness.
import { BC_SKILL_MAP, curriculumOrder, worstFirst, type Grade } from "@/lib/assessment";
import type { ChildLearnerProfile, ChildStandard } from "@/lib/child-profile";
import type { Difficulty } from "@/lib/question-package";

/**
 * The page types of a workbook day, a closed list for the generator and the templates. Each planned page is one page
 * of its type ("fix-it" is the Fix it box, which a template may set on the day's first page). The renderer's fixed test
 * template (#309) has "cover" and "practice": "practice" is this "practice"; the cover is not a day's page.
 */
export const PAGE_TYPES = ["fix-it", "review", "new-idea", "practice", "stories", "step-up", "level-test"] as const;
export type PageType = (typeof PAGE_TYPES)[number];

export interface PlannedPage {
  type: PageType;
  /** The BC standards of its skills, in curriculum order. */
  standards: string[];
  /** The skill map's skill ids its questions are on. */
  skills: string[];
  questions: number;
  /** One difficulty for each question (1 easier, 2 core, 3 stretch), in the order the child meets them. */
  difficulty: Difficulty[];
  /** Estimated minutes. */
  minutes: number;
  /** A worked example comes before the questions: only on a "new-idea" page. */
  workedExample: boolean;
  /** On a "fix-it" page: what to fix, by standard, worst first. */
  fixIt?: FixItem[];
}

/** One standard in a Fix it box: two new questions on it, one easier (difficulty 1) and one core (2). */
export interface FixItem {
  standard: string;
  /** The cause ids of the wrong answers the child gave ("O3"). */
  mistakes: string[];
  /** The worked step ids where the child got stuck. */
  stuckSteps: string[];
  /** The test and the events the misses came from: their questions are never asked again. */
  avoid: ChildStandard["evidence"];
}

export interface PlannedDay {
  /** 1 to 10. */
  day: number;
  week: 1 | 2;
  pages: PlannedPage[];
  /** The pages' minutes added up: 15 to 30. */
  minutes: number;
}

export interface WorkbookPlan {
  /** The Unica level, 1 to 30. */
  level: number;
  /** The skills this workbook introduces, in teaching order: two days each from day 1. */
  newIdeas: string[];
  /** Day 10 is the level test. */
  levelTest: boolean;
  /**
   * Last time's standards with no Fix it box here, worst first: above the level's grade (they come with their level),
   * taught as new ideas in this workbook, or no room left.
   */
  fixItLater: string[];
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
  /** The Unica level (1 to 30, U1 to U30) and its skills (skill map ids). */
  level: { number: number; skills: readonly string[] };
  /** The level's skills that earlier workbooks introduced. */
  taught: readonly string[];
  /** When the last workbook began (ISO 8601): what happened since is last time's. Null for the first workbook. */
  since: string | null;
}

export type PlanResult = { ok: true; plan: WorkbookPlan } | { ok: false; reason: string };

const DAYS = 10;
const DAYS_A_WEEK = 5;
const LEVELS = 30;
const NEW_IDEAS_MAX = 5;
/** New ideas that still leave day 10 for the level test: each takes two days. */
const NEW_IDEAS_BEFORE_TEST = 4;
/** A child with this many weak standards or more gets at most NEW_IDEAS_WHEN_WEAK new ideas, and practice days instead. */
const WEAK_COUNT_FOR_PRACTICE_DAYS = 4;
const NEW_IDEAS_WHEN_WEAK = 3;
const REVIEW_QUESTIONS = 3;
/** Standards in one Fix it box; each gets one easier and one core question. */
const FIX_IT_PER_BOX = 2;
/** The level test: two questions a skill, within these bounds. */
const LEVEL_TEST_QUESTIONS = { min: 12, max: 20 };
/** Minutes for each question, by page type; a worked example adds its own. */
const MINUTES: Record<PageType, number> = { "fix-it": 2, review: 1.5, "new-idea": 1.5, practice: 1.5, stories: 3, "step-up": 2, "level-test": 1.5 };
const WORKED_EXAMPLE_MINUTES = 3;

// The difficulty ladders: a new idea's two days, and a practice day.
const NEW_IDEA_DAY: [PageType, Difficulty[]][] = [["new-idea", [1, 1, 1]], ["practice", [1, 1, 2, 2, 2, 2]]];
const STEP_UP_DAY: [PageType, Difficulty[]][] = [["practice", [2, 2, 2]], ["stories", [2, 2]], ["step-up", [3, 3, 3]]];
const PRACTICE_DAY: [PageType, Difficulty[]][] = [["practice", [1, 1, 2, 2, 2, 2]], ["stories", [2, 2]]];

const STANDARDS = new Map(BC_SKILL_MAP.standards.map((s) => [s.code, s]));

/** Each skill of the map: its standard and its place in the map. */
const SKILLS = new Map(
  BC_SKILL_MAP.standards.flatMap((s) => s.skills.map((k, i) => [k.id, { skill: k, standard: s, position: i }] as const)),
);

/** The stable order of skills: by their standard's curriculum order, then by their place in the standard. */
const skillOrder = (a: string, b: string) => {
  const first = SKILLS.get(a)!;
  const second = SKILLS.get(b)!;
  return curriculumOrder(first.standard, second.standard) || first.position - second.position;
};

/** The skills in teaching order: a skill comes after its prerequisites among them; ties in the stable order. */
function teachingOrder(skills: readonly string[]): string[] {
  const unordered = new Set(skills);
  const order: string[] = [];
  while (unordered.size > 0) {
    const ready = [...unordered].filter((id) => SKILLS.get(id)!.skill.requires.every((r) => !unordered.has(r))).sort(skillOrder);
    // The skill map has no cycle (skillMapProblems); the fallback keeps this loop finite on any input.
    const next = ready[0] ?? [...unordered].sort(skillOrder)[0];
    order.push(next);
    unordered.delete(next);
  }
  return order;
}

const page = (type: PageType, skills: readonly string[], difficulty: Difficulty[]): PlannedPage => ({
  type,
  standards: [...new Set(skills.map((id) => SKILLS.get(id)!.standard))].sort(curriculumOrder).map((s) => s.code),
  skills: [...skills],
  questions: difficulty.length,
  difficulty,
  minutes: difficulty.length * MINUTES[type] + (type === "new-idea" ? WORKED_EXAMPLE_MINUTES : 0),
  workedExample: type === "new-idea",
});

/** The child's next two weeks (see the header for the rules), or why the level cannot be planned. */
export function planWorkbook(input: PlanInput): PlanResult {
  if (!Number.isInteger(input.level.number) || input.level.number < 1 || input.level.number > LEVELS) return { ok: false, reason: "the level is not U1 to U30" };
  if (input.level.skills.length === 0) return { ok: false, reason: "the level has no skills" };
  const unknown = input.level.skills.find((id) => !SKILLS.has(id));
  if (unknown) return { ok: false, reason: `${unknown} is not a skill of the BC skill map` };
  const outside = input.taught.find((id) => !input.level.skills.includes(id));
  if (outside) return { ok: false, reason: `${outside} is not a skill of this level` };
  if (input.since !== null && Number.isNaN(Date.parse(input.since))) return { ok: false, reason: "since is not a date" };

  const taught = new Set(input.taught);
  const levelSkills = teachingOrder([...new Set(input.level.skills)]);
  const levelGrade = Math.max(...levelSkills.map((id) => SKILLS.get(id)!.standard.grade));
  const remaining = levelSkills.filter((id) => !taught.has(id));

  // The profile's standards the plan may come back to, worst first: never a weakness above the school grade.
  const known = input.profile.standards
    .flatMap((s) => {
      const standard = STANDARDS.get(s.code);
      return standard ? [{ ...s, grade: standard.grade, skills: standard.skills.map((k) => k.id) }] : [];
    })
    .filter((s) => s.status === "secure" || s.grade <= input.grade)
    .sort(worstFirst);
  // A standard above the level's grade comes with its own level.
  const inReach = known.filter((s) => s.grade <= levelGrade);
  const weak = inReach.filter((s) => s.status !== "secure");
  const secure = inReach.filter((s) => s.status === "secure");

  const newIdeasMax = weak.length >= WEAK_COUNT_FOR_PRACTICE_DAYS ? NEW_IDEAS_WHEN_WEAK : NEW_IDEAS_MAX;
  const newIdeas = remaining.slice(0, newIdeasMax);
  const levelTest = remaining.length <= Math.min(NEW_IDEAS_BEFORE_TEST, newIdeasMax);
  const afterNewIdeas = newIdeas.length * 2;

  /** A skill met before a day (from 0): outside the level, taught by an earlier workbook, or a new idea of an earlier day. */
  const metBefore = (id: string, day: number) => !levelSkills.includes(id) || taught.has(id) || (newIdeas.includes(id) && newIdeas.indexOf(id) * 2 < day);
  /** The skills met before a day, as a list of items: each weak standard, then each skill of the level. */
  const weakThenLevel = (day: number) => [
    ...weak.map((s) => s.skills.filter((id) => metBefore(id, day))),
    ...levelSkills.filter((id) => metBefore(id, day)).map((id) => [id]),
  ];

  // Last time's: a standard not yet secure, with a wrong, blank or helped answer on record, that the child met since
  // the last workbook began (on the first workbook: the assessment and every event). The profile counts answers over
  // all time, so a standard met again last time and still not secure counts. The avoid list holds every question
  // its misses came from.
  const since = input.since === null ? null : Date.parse(input.since);
  const sinceLastWorkbook = (at: string | null) => since === null || (at !== null && Date.parse(at) >= since);
  const lastTime = known.filter((s) => {
    if (s.status === "secure") return false;
    const events = s.events.wrong + s.events.rightWithHelp + s.events.blank > 0 && sinceLastWorkbook(s.events.lastAt);
    const test = s.assessment !== null && s.assessment.correct < s.assessment.total && sinceLastWorkbook(input.profile.assessment?.completedAt ?? null);
    return events || test;
  });
  // Fixed now: those in reach with a skill met before. The rest wait: above the level's grade, taught as new here, or no room.
  const fixable = lastTime
    .filter((s) => s.grade <= levelGrade)
    .map((s) => ({ ...s, skills: s.skills.filter((id) => metBefore(id, 0)) }))
    .filter((s) => s.skills.length > 0)
    .slice(0, (levelTest ? DAYS - 1 : DAYS) * FIX_IT_PER_BOX);
  const fixItLater = lastTime.filter((s) => !fixable.some((f) => f.code === s.code)).map((s) => s.code);

  const practiceTargets = weakThenLevel(afterNewIdeas).filter((skills) => skills.length > 0);
  /** Earlier skills to review on a day, one item a question, by priority: weak standards, the level, secure standards. */
  const reviewItems = (day: number, today: string | undefined) =>
    [...weakThenLevel(day), ...secure.map((s) => s.skills.filter((id) => metBefore(id, day)))]
      .map((skills) => skills.filter((id) => id !== today))
      .filter((skills) => skills.length > 0);

  const days = Array.from({ length: DAYS }, (_, i): PlannedDay => {
    const idea = newIdeas[Math.floor(i / 2)];
    let pages: PlannedPage[];
    if (levelTest && i === DAYS - 1) {
      const questions = Math.min(LEVEL_TEST_QUESTIONS.max, Math.max(LEVEL_TEST_QUESTIONS.min, 2 * levelSkills.length));
      pages = [page("level-test", levelSkills, Array(questions).fill(2))];
    } else {
      const skills = idea === undefined ? practiceTargets[(i - afterNewIdeas) % practiceTargets.length] : [idea];
      const ladder = idea === undefined ? PRACTICE_DAY : i % 2 === 0 ? NEW_IDEA_DAY : STEP_UP_DAY;
      pages = ladder.map(([type, difficulty]) => page(type, skills, difficulty));
      const review = reviewItems(i, idea);
      if (review.length > 0) {
        const picked = Array.from({ length: Math.min(REVIEW_QUESTIONS, review.length) }, (_, k) => review[(i * REVIEW_QUESTIONS + k) % review.length]);
        pages.unshift(page("review", [...new Set(picked.flat())], Array(REVIEW_QUESTIONS).fill(2)));
      }
      const box = fixable.slice(i * FIX_IT_PER_BOX, (i + 1) * FIX_IT_PER_BOX);
      if (box.length > 0) {
        pages.unshift({
          ...page("fix-it", box.flatMap((s) => s.skills), [...box.map((): Difficulty => 1), ...box.map((): Difficulty => 2)]),
          fixIt: box.map((s) => ({ standard: s.code, mistakes: [...s.events.mistakes], stuckSteps: [...s.events.stuckSteps], avoid: { assessmentId: s.evidence.assessmentId, events: [...s.evidence.events] } })),
        });
      }
    }
    return { day: i + 1, week: i < DAYS_A_WEEK ? 1 : 2, pages, minutes: pages.reduce((n, p) => n + p.minutes, 0) };
  });
  return { ok: true, plan: { level: input.level.number, newIdeas, levelTest, fixItLater, days } };
}
