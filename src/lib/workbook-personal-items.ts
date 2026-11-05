// Workbook personalization, G1 (docs/workbook-personalization.md section 4, items 2 to 6 and 8): the personal choices
// the generator makes for one printed book, read only from the plan (`plan.personal`, the book signals C3 stored with
// the plan, and each day's `difficulty`). Every choice here only picks among options today's book already allows:
// it never adds a skill, a step, a count or a page, and with no signals (a plan with no `personal`) every function
// gives today's answer. Pure: no network, database, clock or randomness.
import { FACTS_BY_GRADE, factsCoverage, type FactFamilyId } from "@/lib/assessment";
import type { Curriculum, CurriculumStep, ExpectedMistake } from "@/lib/workbook-curriculum";
import { SAM_MISTAKES, levelMistakes, type SamMistake } from "@/lib/workbook-book";
import { WORKBOOK_INTERESTS } from "@/lib/workbook-interests";
import { dayDifficulty, type DayDifficulty, type WorkbookPlan } from "@/lib/workbook-plan";
import { THINGS } from "@/lib/workbook-wording";

type Plan = Pick<WorkbookPlan, "level" | "days" | "personal">;

/** The personal signals of a plan made from an assessment, or null (today's book). */
const signalsOf = (plan: Plan) => (plan.personal?.hasAssessment ? plan.personal : null);

// ---------- Difficulty (item 2) ----------

/**
 * The day whose template difficulty and number range a day's items take: the plan's stretch shift (C3) moves Day 1 to
 * today's Day 3, never past Day 10. Picture help keeps the real day (the plan's `helpLevel`).
 */
export function difficultyDay(plan: Plan, day: number): number {
  const shift = signalsOf(plan)?.adjustments.stretchShift ?? 0;
  return Math.min(10, day + shift);
}

/** A day's schedule: the plan's stored one (C3), else today's. */
export function daySchedule(plan: Plan, day: number): DayDifficulty {
  return plan.days.find((d) => d.day === day)?.difficulty ?? dayDifficulty(plan.level, day);
}

// ---------- Mistakes (item 3) ----------

/** A step mistake's printable pair once C2 (PR #524) lands; only a pair marked verified may ever print. */
interface PairedMistake extends ExpectedMistake {
  watchOut?: { wrong: string; fix: string; verified?: boolean };
}

/** The child's coded mistakes on a standard at or below the school grade (the signals keep only those, D-084). */
function childMisconceptions(plan: Plan, standard: string | null): Set<string> {
  const s = signalsOf(plan);
  if (!s) return new Set();
  return new Set(s.mistakes.filter((m) => standard === null || m.standard === standard).flatMap((m) => m.misconceptions));
}

/**
 * The Watch out pair of the child's own mistake on a step, or null for today's line. Fail closed: a pair prints only
 * when the step's mistake names a misconception the child showed on the step's standard and its pair is marked
 * `verified: true` (C2). Until C2 merges no step has a pair, so this is always null and today's line prints.
 */
export function verifiedWatchOut(curriculum: Curriculum, plan: Plan, skill: string, step: CurriculumStep | undefined): { wrong: string; fix: string } | null {
  if (!step) return null;
  const standard = curriculum.skill(skill)?.unit ?? null;
  const shown = childMisconceptions(plan, standard);
  if (!standard || !shown.size) return null;
  for (const m of step.mistakes as readonly PairedMistake[]) {
    const pair = m.watchOut;
    if (!m.misconception || !shown.has(m.misconception) || pair?.verified !== true) continue;
    if (typeof pair.wrong !== "string" || typeof pair.fix !== "string" || !pair.wrong.trim() || !pair.fix.trim()) continue;
    return { wrong: pair.wrong, fix: pair.fix };
  }
  return null;
}

/**
 * The closed table from the child's misconception ids to the mistakes Sam can show (the entries of C2's
 * `samMistakeFor`, PR #524, plus each Sam mistake's own id). An id not listed maps to nothing: no fallback.
 */
const SAM_TABLE: Readonly<Record<string, SamMistake>> = {
  O3: "forgot-carry",
  "carry-dropped": "forgot-carry",
  O1: "smaller-from-larger",
  O2: "smaller-from-larger",
  "regroup-forget": "regroup-not-taken",
  "count-start": "wrong-start",
  operation: "wrong-operation",
  "operation-swap": "wrong-operation",
  "digit-reversal": "swapped-digits",
};

/** Sam's mistake for a misconception id, or null. */
export function samMistakeOf(misconception: string): SamMistake | null {
  if (Object.hasOwn(SAM_TABLE, misconception)) return SAM_TABLE[misconception];
  // (Read when called, never at load: workbook-book imports this module too.)
  return (SAM_MISTAKES as readonly string[]).includes(misconception) ? misconception as SamMistake : null;
}

/** The Sam mistakes of the child's own coded mistakes that the level allows, in the order of the signals. */
export function childSamMistakes(plan: Plan): SamMistake[] {
  const allowed = new Set(levelMistakes(plan.level));
  return [...new Set([...childMisconceptions(plan, null)].flatMap((m) => { const s = samMistakeOf(m); return s && allowed.has(s) ? [s] : []; }))];
}

// ---------- Facts (item 4) ----------

type FactState = "known" | "needs-practice" | "not-measured";

/** The state of a fluency skill: the worst of the fact families whose asked standards hold the skill's standard. */
function skillFactState(curriculum: Curriculum, plan: Plan, skill: string): FactState {
  const s = signalsOf(plan)!;
  const standard = curriculum.skill(skill)?.unit;
  const families = (Object.values(FACTS_BY_GRADE).flat() as FactFamilyId[]).filter((f, i, all) => all.indexOf(f) === i)
    .filter((f) => { const asks = factsCoverage([f]); return !!standard && (Object.hasOwn(asks, standard) && (asks[standard].length === 0 || asks[standard].includes(skill))); });
  const states = families.map((f) => s.facts.find((x) => x.family === f)?.state ?? "not-measured");
  if (!states.length) return "not-measured";
  if (states.includes("needs-practice")) return "needs-practice";
  return states.every((x) => x === "known") ? "known" : "not-measured";
}

/**
 * The skill a warm-up or In your head slot aims at (item 4), or null for today's turn through the part's skills. On
 * Days 1 to 5, known families take at most a third of a day's slots and the others at least half, needs-practice
 * first; Days 6 to 10 turn through all of them evenly, as today. With one state only, today's turn.
 */
export function warmUpSkill(curriculum: Curriculum, plan: Plan, day: number, skills: readonly string[], ordinal: number, place: "warm-up" | "in-your-head" | string = "warm-up"): string | null {
  if (!signalsOf(plan) || day > 5 || skills.length < 2) return null;
  const state = (s: string) => skillFactState(curriculum, plan, s);
  const practice = skills.filter((s) => state(s) === "needs-practice");
  const unmeasured = skills.filter((s) => state(s) === "not-measured");
  const known = skills.filter((s) => state(s) === "known");
  // In your head takes a needs-practice family first.
  if (place === "in-your-head") return practice.length ? practice[ordinal % practice.length] : null;
  const groups = [practice, unmeasured, known].filter((g) => g.length).length;
  if (groups < 2) return null;
  // Needs practice first, then not measured, in turn; known families take every third slot at most.
  const open = Array.from({ length: Math.max(practice.length, unmeasured.length) * 2 }, (_, i) => (i % 2 === 0 ? practice : unmeasured)[Math.floor(i / 2)]).filter((s): s is string => !!s);
  const pool = open.length ? open : known;
  if (known.length && open.length && ordinal % 3 === 2) return known[Math.floor(ordinal / 3) % known.length];
  const k = known.length && open.length ? ordinal - Math.floor((ordinal + 1) / 3) : ordinal;
  return pool[k % pool.length];
}

// ---------- Interests (item 5) ----------

/** The interest things and places of the parent's interests, in order, or empty for today's lists. */
export function interestWords(plan: Plan): { things: string[]; places: string[] } {
  const s = signalsOf(plan);
  const ids = s?.preferences.interests ?? [];
  return {
    things: [...new Set(ids.flatMap((id) => [...(WORKBOOK_INTERESTS[id]?.things ?? [])]))],
    places: [...new Set(ids.flatMap((id) => [...(WORKBOOK_INTERESTS[id]?.places ?? [])]))],
  };
}

/**
 * The things a book's story slots take in turn: with interests, 3 of every 5 are interest words (60%, inside the
 * spec's half to two thirds), the rest today's list; with none, today's list unchanged.
 */
export function storyThings(plan: Plan): readonly string[] {
  const { things } = interestWords(plan);
  if (!things.length) return THINGS;
  const plain = THINGS.filter((t) => !things.includes(t));
  let interest = 0, other = 0;
  return Array.from({ length: 5 * things.length * Math.max(1, plain.length) }, (_, i) => interestTurn(i) ? things[interest++ % things.length] : plain[other++ % plain.length]);
}

/** Whether the book's story slot at this turn takes an interest word (the same 3 of every 5 as storyThings). */
export const interestTurn = (turn: number): boolean => [0, 1, 3].includes(turn % 5);

// ---------- Reading load (item 8) ----------

/** Whether a day's stories use the short frames (read-aloud on 3 or more questions, C3's `shortStories`). */
export function shortStories(plan: Plan, day: number): boolean {
  return !!signalsOf(plan) && !!plan.days.find((d) => d.day === day)?.shortStories;
}

/** The most words a story may print on a short-story day (the spec's 20). */
export const SHORT_STORY_WORDS = 20;

// ---------- Style (item 6) ----------

/**
 * A kind order with the child's style first, at most once a page (item 6): "pictures" puts picture first where the
 * skill has one; "stories" puts story first. Others, and no style, keep today's order.
 */
export function styleKinds<K extends string>(plan: Plan, kinds: readonly K[], firstOnPage: boolean): K[] {
  const styles = signalsOf(plan)?.preferences.styles ?? [];
  const want = styles.includes("pictures") ? "picture" : styles.includes("stories") ? "story" : null;
  if (!want || !firstOnPage || !kinds.includes(want as K)) return [...kinds];
  return [want as K, ...kinds.filter((k) => k !== want)];
}
