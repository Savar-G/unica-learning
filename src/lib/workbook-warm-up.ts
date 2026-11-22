// Warm-up progression (#1213): rises through the 10-day book from early fluency steps to harder fluency steps and
// eligible earlier-taught steps of the book, while staying a little below the day's main practice and never introducing
// a new skill first in a warm-up. Pure TypeScript: no Next.js, React, network, database, clock or Math.random.
import type { Curriculum, CurriculumStep, TemplateDifficulty } from "@/lib/workbook-curriculum";
import { isChallengeOnly, isTwoStep, templateAtLevel } from "@/lib/workbook-curriculum/house-templates";
import { prepareTemplate, seededRandom } from "@/lib/workbook-curriculum/template";
import { warmUpSkill } from "@/lib/workbook-personal-items";
import type { WorkbookPlan } from "@/lib/workbook-plan";
import {
  cleanTemplateText,
  disallowedFactorOne,
  needsColumnWork,
  NUMERIC,
  printedNumbersOf,
  stepRank,
  stepRangeProblem,
  templateProblem,
} from "@/lib/workbook-step-items";
import { commaNumbers } from "@/lib/workbook-template";

const DIFFICULTY_RANK: Record<TemplateDifficulty, number> = { easy: 0, medium: 1, hard: 2 };
const DIFFICULTY_SCORE: Record<TemplateDifficulty, number> = { easy: 1, medium: 2, hard: 3 };

/** Maximum printed characters (with commas) for a one-line equation in a warm-up `.facts` grid. */
export function warmUpMaxChars(level: number): number {
  return level >= 10 ? 20 : 12;
}

export interface WarmUpTarget {
  skill: string;
  step: number;
  source: "fluency" | "earlier-taught";
  maxDifficulty?: "easy" | "medium";
  noColumnWork?: boolean;
}

export interface WarmUpPrintableStep {
  step: number;
  minDifficulty: number;
  maxDifficulty: number;
  /** Minimum difficulty among templates that require no written column work (null if none). */
  mentalMinDifficulty: number | null;
  rank: number;
}

const PRINTABLE_CACHE = new WeakMap<Curriculum, Map<string, readonly WarmUpPrintableStep[]>>();

/** Inspect which short, numeric, single-box bare/missing templates of `step` fit `.facts`. */
function probeWarmUpStep(
  curriculum: Curriculum,
  step: CurriculumStep,
  level: number,
): { minDifficulty: number; maxDifficulty: number; mentalMinDifficulty: number | null } | null {
  const contexts = curriculum.contexts;
  if (!step.templates?.length || !contexts) return null;
  const maxChars = warmUpMaxChars(level);
  let minDifficulty: number | null = null;
  let maxDifficulty: number | null = null;
  let mentalMinDifficulty: number | null = null;
  for (let index = 0; index < step.templates.length; index++) {
    const t = templateAtLevel(level, step, index, step.templates[index]);
    if (t.format !== "bare" && t.format !== "missing") continue;
    if (templateProblem(t, level) || isChallengeOnly(t) || isTwoStep(t)) continue;
    let prepared;
    try {
      prepared = prepareTemplate(step, t, contexts);
    } catch {
      continue;
    }
    const random = seededRandom(17 + index * 97 + step.number * 31);
    let anyFits = false;
    let mentalFits = false;
    for (let tryNo = 0; tryNo < 12; tryNo++) {
      let filled;
      try {
        filled = prepared.fill(random);
      } catch {
        break;
      }
      if (!NUMERIC.test(filled.answer)) continue;
      const text = cleanTemplateText(filled.text);
      if (templateProblem({ ...t, text }, level)) continue;
      if (disallowedFactorOne(text, level)) continue;
      const roomLimit = level >= 10 && commaNumbers(filled.answer).length >= 4 ? Math.min(maxChars, 19) : maxChars;
      if (commaNumbers(text).length > roomLimit) continue;
      if (stepRangeProblem(step, text) || stepRangeProblem(step, filled.answer)) continue;
      anyFits = true;
      if (!needsColumnWork(text)) {
        mentalFits = true;
        break;
      }
    }
    if (!anyFits) continue;
    const rank = DIFFICULTY_RANK[t.difficulty];
    if (minDifficulty === null || rank < minDifficulty) minDifficulty = rank;
    if (maxDifficulty === null || rank > maxDifficulty) maxDifficulty = rank;
    if (mentalFits && (mentalMinDifficulty === null || rank < mentalMinDifficulty)) mentalMinDifficulty = rank;
  }
  return minDifficulty === null || maxDifficulty === null
    ? null
    : { minDifficulty, maxDifficulty, mentalMinDifficulty };
}

/**
 * Printable warm-up steps of a skill at `level`, ordered from easiest to hardest (minimum printable template
 * difficulty, then maximum difficulty so easy-only steps like 4.7-addition-facts-fluency#3 come before steps with
 * hard 3-term templates, then step number). Returns a fresh array copy so callers cannot mutate the cache.
 */
export function warmUpPrintableSteps(
  curriculum: Curriculum,
  skill: string,
  level: number,
): WarmUpPrintableStep[] {
  let cache = PRINTABLE_CACHE.get(curriculum);
  if (!cache) {
    cache = new Map();
    PRINTABLE_CACHE.set(curriculum, cache);
  }
  const key = `${skill}:${level}`;
  const hit = cache.get(key);
  if (hit) return hit.map((s) => ({ ...s }));
  const steps = curriculum.skillSteps(skill) ?? [];
  const out: WarmUpPrintableStep[] = [];
  for (const step of steps) {
    const probed = probeWarmUpStep(curriculum, step, level);
    if (!probed) continue;
    out.push({
      step: step.number,
      minDifficulty: probed.minDifficulty,
      maxDifficulty: probed.maxDifficulty,
      mentalMinDifficulty: probed.mentalMinDifficulty,
      rank: stepRank(curriculum, skill, step.number) ?? 0,
    });
  }
  out.sort((a, b) => a.minDifficulty - b.minDifficulty || a.maxDifficulty - b.maxDifficulty || a.step - b.step);
  cache.set(key, out);
  return out.map((s) => ({ ...s }));
}

function fluencyWindow(totalSteps: number, day: number): { lo: number; hi: number } {
  if (totalSteps <= 1) return { lo: 0, hi: 0 };
  const t = Math.max(0, Math.min(1, (day - 1) / 9));
  const hi = Math.min(totalSteps - 1, Math.floor(t * totalSteps + (day >= 4 ? 0.01 : 0)));
  const lo = Math.min(hi, Math.floor(Math.max(0, t - 0.25) * totalSteps));
  return { lo, hi };
}

type PlanLike = Pick<WorkbookPlan, "level" | "newSteps" | "personal" | "days">;

function activeStepsOnDay(plan: PlanLike, day: number): { skill: string; step: number }[] {
  const fromNew = plan.newSteps.filter((s) => s.day === day).map((s) => ({ skill: s.skill, step: s.step }));
  const plannedDay = plan.days.find((d) => d.day === day);
  const fromParts = plannedDay
    ? plannedDay.pages.flatMap((p) => p.parts.flatMap((part) => (part.step ? [part.step] : [])))
    : [];
  return [...fromNew, ...fromParts];
}

function eligibleEarlierTaught(
  curriculum: Curriculum,
  plan: PlanLike,
  day: number,
  fluencySkills: readonly string[],
): WarmUpTarget[] {
  if (day <= 1) return [];
  // Keep personal Days 1-5 on fluency skills only when G1 fact-family balancing is active for this day.
  if (plan.personal?.hasAssessment && day <= 5 && warmUpSkill(curriculum, plan, day, fluencySkills, 0) !== null) return [];
  const fluencySet = new Set(fluencySkills);
  const todaySteps = activeStepsOnDay(plan, day);
  const seen = new Set<string>();
  const eligible: { target: WarmUpTarget; rank: number; taughtDay: number }[] = [];
  for (const s of plan.newSteps) {
    if (s.day >= day || fluencySet.has(s.skill)) continue;
    // Never pull a step that is currently being taught/repeated on `day` (including multi-day or held steps),
    // nor any step at or above today's step of the same skill.
    if (todaySteps.some((m) => m.skill === s.skill && s.step >= m.step)) continue;
    const key = `${s.skill}#${s.step}`;
    if (seen.has(key)) continue;
    const rank = stepRank(curriculum, s.skill, s.step);
    if (rank === null) continue;
    const printable = warmUpPrintableSteps(curriculum, s.skill, plan.level).find((p) => p.step === s.step);
    // Earlier-taught warm-ups must have a mental (no-column-work) easy or medium short template.
    if (!printable || printable.mentalMinDifficulty === null || printable.mentalMinDifficulty > 1) continue;
    seen.add(key);
    eligible.push({
      target: {
        skill: s.skill,
        step: s.step,
        source: "earlier-taught",
        maxDifficulty: printable.mentalMinDifficulty === 0 ? "easy" : "medium",
        noColumnWork: true,
      },
      rank,
      taughtDay: s.day,
    });
  }
  eligible.sort((a, b) => a.taughtDay - b.taughtDay || a.rank - b.rank);
  return eligible.map((x) => x.target);
}

function earlierShare(day: number, slotCount: number): number {
  if (day <= 1 || slotCount < 4) return 0;
  if (day <= 3) return Math.min(2, Math.floor(slotCount / 4));
  if (day <= 6) return Math.min(3, Math.floor(slotCount / 3));
  return Math.min(4, Math.floor(slotCount / 3));
}

/**
 * Planned warm-up targets for each slot on `day` (length `slotCount`), ordered from easier fluency items
 * at the start of the page to harder fluency items and eligible earlier-taught book steps at the end.
 */
export function warmUpDayTargets(
  curriculum: Curriculum,
  plan: PlanLike,
  day: number,
  slotCount: number,
  fluencySkills: readonly string[],
): WarmUpTarget[] {
  if (slotCount <= 0) return [];
  const fluencyBySkill = fluencySkills
    .map((skill) => ({ skill, steps: warmUpPrintableSteps(curriculum, skill, plan.level) }))
    .filter((x) => x.steps.length > 0);
  const earlierAll = eligibleEarlierTaught(curriculum, plan, day, fluencySkills);
  const earlierCount = earlierAll.length ? Math.min(earlierShare(day, slotCount), Math.floor(slotCount / 2)) : 0;
  const fluencyCount = fluencyBySkill.length ? slotCount - earlierCount : 0;
  const effectiveEarlier = fluencyBySkill.length ? earlierCount : earlierAll.length ? slotCount : 0;

  const targets: WarmUpTarget[] = [];
  if (fluencyCount > 0) {
    // Build fluency slots in ascending step tier (lo steps across skills, then higher steps up to hi).
    const tiers: WarmUpTarget[][] = [];
    for (const { skill, steps } of fluencyBySkill) {
      const { lo, hi } = fluencyWindow(steps.length, day);
      const active = steps.slice(lo, hi + 1);
      active.forEach((st, tierIndex) => {
        if (!tiers[tierIndex]) tiers[tierIndex] = [];
        tiers[tierIndex].push({ skill, step: st.step, source: "fluency" });
      });
    }
    const orderedTiers = tiers.filter((t) => t.length > 0);
    if (orderedTiers.length === 1) {
      const tier = orderedTiers[0];
      for (let i = 0; i < fluencyCount; i++) targets.push(tier[i % tier.length]);
    } else {
      // Split fluency slots evenly across tiers, giving any extra slot to the highest (hardest) tier.
      const base = Math.floor(fluencyCount / orderedTiers.length);
      let rem = fluencyCount - base * orderedTiers.length;
      const counts = orderedTiers.map(() => base);
      for (let t = orderedTiers.length - 1; t >= 0 && rem > 0; t--, rem--) counts[t]++;
      orderedTiers.forEach((tier, t) => {
        for (let i = 0; i < counts[t]; i++) targets.push(tier[i % tier.length]);
      });
    }
  }

  if (effectiveEarlier > 0) {
    // Draw from the most recent eligible earlier-taught steps so late days pull later book steps, ordered ascending.
    const recent = earlierAll.slice(-Math.min(effectiveEarlier, Math.max(2, Math.min(3, earlierAll.length))));
    for (let i = 0; i < effectiveEarlier; i++) {
      const idx = Math.floor((i * recent.length) / effectiveEarlier);
      targets.push(recent[idx]);
    }
  }

  return targets.slice(0, slotCount);
}

/**
 * Target step for one warm-up slot on `day`. Early attempts stay on the slot's planned target; later retries
 * cycle across the day's targets and lower-or-equal fluency steps so unique fills never exhaust without jumping ahead.
 */
export function warmUpStepForSlot(
  curriculum: Curriculum,
  plan: PlanLike,
  day: number,
  slotCount: number,
  ordinal: number,
  attempt: number,
  fluencySkills: readonly string[],
): WarmUpTarget | null {
  const targets = warmUpDayTargets(curriculum, plan, day, slotCount, fluencySkills);
  if (!targets.length) return null;
  const start = ((ordinal % targets.length) + targets.length) % targets.length;
  const primary = targets[start];
  if (attempt < 32) return primary;

  const fallback: WarmUpTarget[] = [primary];
  const seen = new Set<string>([`${primary.skill}#${primary.step}`]);
  const push = (t: WarmUpTarget) => {
    const key = `${t.skill}#${t.step}`;
    if (seen.has(key)) return;
    seen.add(key);
    fallback.push(t);
  };
  // Other targets planned for this day first, then any fluency step at or below today's window hi.
  for (let i = 1; i < targets.length; i++) push(targets[(start + i) % targets.length]);
  for (const skill of fluencySkills) {
    const steps = warmUpPrintableSteps(curriculum, skill, plan.level);
    if (!steps.length) continue;
    const { hi } = fluencyWindow(steps.length, day);
    for (let i = hi; i >= 0; i--) push({ skill, step: steps[i].step, source: "fluency" });
  }
  const round = Math.floor(attempt / 32);
  return fallback[round % fallback.length];
}

/** Every `<skill>#<step>` a warm-up slot on `day` is allowed to print (for `expected.steps` validation). */
export function warmUpAllowedSteps(
  curriculum: Curriculum,
  plan: PlanLike,
  day: number,
  fluencySkills: readonly string[],
): string[] {
  const allowed = new Set<string>();
  for (const skill of fluencySkills) {
    const steps = warmUpPrintableSteps(curriculum, skill, plan.level);
    if (!steps.length) continue;
    const { hi } = fluencyWindow(steps.length, day);
    for (let i = 0; i <= hi; i++) allowed.add(`${skill}#${steps[i].step}`);
  }
  for (const target of eligibleEarlierTaught(curriculum, plan, day, fluencySkills)) {
    allowed.add(`${target.skill}#${target.step}`);
  }
  return [...allowed];
}

export interface WarmUpPageView {
  number: number;
  day: number | null;
  type?: string;
  questions: readonly {
    place?: string | null;
    package: { text: string; difficulty?: number | null } | null;
    itemPlan?: {
      template?: {
        skill: string;
        step: number;
        difficulty: TemplateDifficulty;
        rank: number;
        answer: string;
      };
    } | null;
  }[];
}

export interface WarmUpDaySummary {
  day: number;
  page: number;
  count: number;
  templateCount: number;
  averageStep: number;
  averageRank: number;
  averageDifficulty: number;
  averageMagnitude: number;
  steps: string[];
}

/** Extract prompt numbers after stripping thousands commas ("5,000 − ? = 4,000" -> [5000, 4000]). */
function promptNumbersOf(text: string): number[] {
  return printedNumbersOf(text.replace(/(\d),(\d)/g, "$1$2")).map(Math.abs);
}

/** Day-by-day summary of warm-up difficulty (step, rank, difficulty 1-3, magnitude) across a generated book. */
export function warmUpProgression(pages: readonly WarmUpPageView[]): WarmUpDaySummary[] {
  const byDay = new Map<number, { page: number; qs: WarmUpPageView["questions"][number][] }>();
  for (const p of pages) {
    if (p.day === null) continue;
    const qs = p.questions.filter((q) => q.place === "warm-up" && q.package);
    if (!qs.length) continue;
    const entry = byDay.get(p.day);
    if (entry) entry.qs.push(...qs);
    else byDay.set(p.day, { page: p.number, qs: [...qs] });
  }
  return [...byDay.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([day, { page, qs }]) => {
      const templated = qs.filter((q) => q.itemPlan?.template);
      const avg = (nums: number[]) => (nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0);
      const averageStep = avg(templated.map((q) => q.itemPlan!.template!.step));
      const averageRank = avg(templated.map((q) => q.itemPlan!.template!.rank));
      const averageDifficulty = avg(
        qs.map((q) => {
          const t = q.itemPlan?.template;
          return t ? DIFFICULTY_SCORE[t.difficulty] : (q.package!.difficulty ?? 1);
        }),
      );
      // Compare prompt numbers symmetrically across templated and non-templated warm-ups.
      const averageMagnitude = avg(
        qs.map((q) => {
          const nums = promptNumbersOf(q.package!.text);
          return nums.length ? Math.max(...nums) : 0;
        }),
      );
      const steps = [
        ...new Set(
          templated.map((q) => `${q.itemPlan!.template!.skill}#${q.itemPlan!.template!.step}`),
        ),
      ];
      return {
        day,
        page,
        count: qs.length,
        templateCount: templated.length,
        averageStep: Math.round(averageStep * 100) / 100,
        averageRank: Math.round(averageRank * 100) / 100,
        averageDifficulty: Math.round(averageDifficulty * 100) / 100,
        averageMagnitude: Math.round(averageMagnitude * 10) / 10,
        steps,
      };
    });
}

/**
 * Flags a book whose template-backed warm-ups fail to rise in difficulty between early days (<= 3) and
 * late days (>= 8). Returns null when the book has no template warm-ups or does not span early and late days.
 */
export function warmUpProgressionProblem(pages: readonly WarmUpPageView[]): { page: number; reason: string } | null {
  const days = warmUpProgression(pages);
  const early = days.filter((d) => d.day <= 3 && d.count > 0);
  const late = days.filter((d) => d.day >= 8 && d.templateCount > 0);
  if (!early.length || !late.length) return null;
  const mean = (list: WarmUpDaySummary[], pick: (d: WarmUpDaySummary) => number) =>
    list.reduce((sum, d) => sum + pick(d), 0) / list.length;

  const earlyTemplated = early.filter((d) => d.templateCount > 0);
  const earlyDiff = mean(early, (d) => d.averageDifficulty);
  const lateDiff = mean(late, (d) => d.averageDifficulty);
  const earlyMag = mean(early, (d) => d.averageMagnitude);
  const lateMag = mean(late, (d) => d.averageMagnitude);

  const rankRose =
    earlyTemplated.length > 0 &&
    mean(late, (d) => d.averageRank) > mean(earlyTemplated, (d) => d.averageRank) + 0.01;
  const stepRose =
    earlyTemplated.length > 0 &&
    mean(late, (d) => d.averageStep) > mean(earlyTemplated, (d) => d.averageStep) + 0.01;
  const diffRose = lateDiff > earlyDiff + 0.05;
  const magRose = earlyMag > 0 && lateMag > earlyMag * 1.15;
  const diffHeld = lateDiff >= earlyDiff - 0.05;

  if (diffRose || (diffHeld && (rankRose || stepRose || magRose))) return null;
  const last = late.at(-1)!;
  return {
    page: last.page,
    reason: `warm-ups on days 8 to 10 do not get harder than days 1 to 3 (difficulty ${lateDiff.toFixed(2)} vs ${earlyDiff.toFixed(2)}, magnitude ${lateMag.toFixed(1)} vs ${earlyMag.toFixed(1)})`,
  };
}
