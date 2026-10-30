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
// - A Fix it box: the standards not yet secure with a wrong, blank or right-with-help answer last time (since the last
//   workbook began; on the first workbook, the assessment and every event), worst first, two a day from day 1, each
//   with two new questions. The box names the mistakes, the stuck steps and the evidence (the test and the event ids)
//   so the generator writes new questions, never the same one again. What does not fit waits (fixItLater).
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
import { BC_SKILL_MAP, curriculumOrder, type Grade, type StrandStatus } from "@/lib/assessment";
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

/** One standard in a Fix it box: two new questions on it. */
export interface FixItem {
  standard: string;
  /** The cause ids of the wrong answers the child gave ("O3"). */
  mistakes: string[];
  /** The worked step ids where the child got stuck. */
  stuckSteps: string[];
  /** The test and the events the misses came from: their questions are never asked again. */
  avoid: ChildStandard["evidence"];
  newQuestions: true;
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
  /** Last time's standards that did not fit in this workbook's Fix it boxes. */
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
const NEW_IDEAS_MAX = 5;
/** A child with this many weak standards gets at most NEW_IDEAS_WHEN_WEAK new ideas, and practice days instead. */
const WEAK_STANDARDS = 4;
const NEW_IDEAS_WHEN_WEAK = 3;
/** New ideas that still leave day 10 for the level test: each takes two days. */
const NEW_IDEAS_BEFORE_TEST = 4;

const REVIEW_QUESTIONS = 3;
/** Minutes for each question, by page type; a worked example adds its own. */
const MINUTES: Record<PageType, number> = { "fix-it": 2, review: 1.5, "new-idea": 1.5, practice: 1.5, stories: 3, "step-up": 2, "level-test": 1.5 };
const WORKED_EXAMPLE_MINUTES = 3;
const FIX_IT_PER_BOX = 2;
const SEVERITY: Record<StrandStatus, number> = { "needs-attention": 0, developing: 1, secure: 2 };
const STANDARDS = new Map(BC_SKILL_MAP.standards.map((s) => [s.code, s]));

/** Each skill of the map: its standard and its place in the map. */
const SKILLS = new Map(
  BC_SKILL_MAP.standards.flatMap((s) => s.skills.map((k, i) => [k.id, { skill: k, standard: s, position: i }] as const)),
);

/** The stable order of skills: by their standard's curriculum order, then by their place in the standard. */
const skillOrder = (a: string, b: string) => {
  const x = SKILLS.get(a)!;
  const y = SKILLS.get(b)!;
  return curriculumOrder(x.standard, y.standard) || x.position - y.position;
};

/** The skills in teaching order: a skill comes after its prerequisites among them; ties in the stable order. */
function teachingOrder(skills: readonly string[]): string[] {
  const left = new Set(skills);
  const order: string[] = [];
  while (left.size > 0) {
    const ready = [...left].filter((id) => SKILLS.get(id)!.skill.requires.every((r) => !left.has(r))).sort(skillOrder);
    // The skill map has no cycle (skillMapProblems); the fallback keeps this loop finite on any input.
    const next = ready[0] ?? [...left].sort(skillOrder)[0];
    order.push(next);
    left.delete(next);
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
  if (!Number.isInteger(input.level.number) || input.level.number < 1 || input.level.number > 30) return { ok: false, reason: "the level is not U1 to U30" };
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

  // The profile's standards the plan may come back to: up to the level's grade, and never a weakness above the
  // school grade. Not yet secure first (worst first), then secure; each in curriculum order.
  const profileStandards = input.profile.standards
    .map((s) => ({ ...s, standard: STANDARDS.get(s.code)! }))
    .filter((s) => s.standard && s.standard.grade <= levelGrade && (s.status === "secure" || s.standard.grade <= input.grade))
    .sort((a, b) => SEVERITY[a.status] - SEVERITY[b.status] || curriculumOrder(a.standard, b.standard));
  const weak = profileStandards.filter((s) => s.status !== "secure");
  const secure = profileStandards.filter((s) => s.status === "secure");

  const newIdeasMax = weak.length >= WEAK_STANDARDS ? NEW_IDEAS_WHEN_WEAK : NEW_IDEAS_MAX;
  const newIdeas = remaining.slice(0, newIdeasMax);
  const levelTest = remaining.length <= Math.min(NEW_IDEAS_BEFORE_TEST, newIdeasMax);

  /** A skill the child met before a day (from 0): outside the level, taught by an earlier workbook, or introduced on an earlier day. */
  const metBefore = (id: string, day: number) => !levelSkills.includes(id) || taught.has(id) || (newIdeas.includes(id) && newIdeas.indexOf(id) * 2 < day);
  const skillsMet = (s: (typeof profileStandards)[number], day: number) => s.standard.skills.map((k) => k.id).filter((id) => metBefore(id, day));

  // Last time's: the standards not yet secure with a wrong, blank or helped answer since the last workbook began (on
  // the first workbook, since the start: the assessment and every event).
  const since = input.since === null ? null : Date.parse(input.since);
  const lastTime = (at: string | null) => since === null || (at !== null && Date.parse(at) >= since);
  const fixable = weak
    .filter((s) => {
      const events = s.events.wrong + s.events.rightWithHelp + s.events.blank > 0 && lastTime(s.events.lastAt);
      const test = s.assessment !== null && s.assessment.correct < s.assessment.total && lastTime(input.profile.assessment?.completedAt ?? null);
      return events || test;
    })
    .map((s) => ({ ...s, skills: skillsMet(s, 0) }))
    .filter((s) => s.skills.length > 0);
  const boxDays = levelTest ? DAYS - 1 : DAYS;
  const fixItLater = fixable.slice(boxDays * FIX_IT_PER_BOX).map((s) => s.code);

  // Practice days after the new ideas: the weak standards, worst first, then the level's skills.
  const afterNewIdeas = newIdeas.length * 2;
  const practiceTargets = [
    ...weak.map((s) => skillsMet(s, afterNewIdeas)),
    ...levelSkills.filter((id) => metBefore(id, afterNewIdeas)).map((id) => [id]),
  ].filter((skills) => skills.length > 0);

  /** Earlier skills to review on a day: one item each, by priority. */
  const reviewItems = (day: number, today: string | undefined): string[][] =>
    [
      ...weak.map((s) => skillsMet(s, day)),
      ...levelSkills.filter((id) => metBefore(id, day)).map((id) => [id]),
      ...secure.map((s) => skillsMet(s, day)),
    ]
      .map((skills) => skills.filter((id) => id !== today))
      .filter((skills) => skills.length > 0);

  const days = Array.from({ length: DAYS }, (_, i): PlannedDay => {
    const idea = newIdeas[Math.floor(i / 2)];
    let pages: PlannedPage[];
    if (levelTest && i === DAYS - 1) {
      const questions = Math.min(20, Math.max(12, 2 * levelSkills.length));
      pages = [page("level-test", levelSkills, Array(questions).fill(2))];
    } else {
      if (idea === undefined) {
        const target = practiceTargets[(i - afterNewIdeas) % practiceTargets.length];
        pages = [page("practice", target, [1, 1, 2, 2, 2, 2]), page("stories", target, [2, 2])];
      } else if (i % 2 === 0) {
        pages = [page("new-idea", [idea], [1, 1, 1]), page("practice", [idea], [1, 1, 2, 2, 2, 2])];
      } else {
        pages = [page("practice", [idea], [2, 2, 2]), page("stories", [idea], [2, 2]), page("step-up", [idea], [3, 3, 3])];
      }
      const items = reviewItems(i, idea);
      if (items.length > 0) {
        const picked = Array.from({ length: Math.min(REVIEW_QUESTIONS, items.length) }, (_, k) => items[(i * REVIEW_QUESTIONS + k) % items.length]);
        pages.unshift(page("review", [...new Set(picked.flat())], Array(REVIEW_QUESTIONS).fill(2)));
      }
      const box = fixable.slice(i * FIX_IT_PER_BOX, (i + 1) * FIX_IT_PER_BOX);
      if (box.length > 0) {
        pages.unshift({
          ...page("fix-it", box.flatMap((s) => s.skills), box.flatMap((): Difficulty[] => [1, 2])),
          fixIt: box.map((s) => ({ standard: s.code, mistakes: [...s.events.mistakes], stuckSteps: [...s.events.stuckSteps], avoid: { assessmentId: s.evidence.assessmentId, events: [...s.evidence.events] }, newQuestions: true })),
        });
      }
    }
    return { day: i + 1, week: i < 5 ? 1 : 2, pages, minutes: pages.reduce((n, p) => n + p.minutes, 0) };
  });
  return { ok: true, plan: { level: input.level.number, newIdeas, levelTest, fixItLater, days } };
}
