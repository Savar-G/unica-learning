// Workbook personalization, G1 (docs/workbook-personalization.md section 4, items 2 to 6 and 8): the personal choices
// the generator makes for one printed book, read only from the plan (`plan.personal`, the book signals C3 stored with
// the plan, and each day's `difficulty`). Every choice here only picks among options today's book already allows:
// it never adds a skill, a step, a count or a page, and with no signals (a plan with no `personal`) every function
// gives today's answer. Pure: no network, database, clock or randomness.
import { FACTS_BY_GRADE, factsCoverage, type FactFamilyId } from "@/lib/assessment";
import type { Curriculum, CurriculumStep } from "@/lib/workbook-curriculum";
import { domainContains } from "@/lib/workbook-curriculum/template";
import type { StepDeclaration } from "@/lib/workbook-print-contract";
import { levelMistakes, samAnswer, type SamMistake } from "@/lib/workbook-book";
import { verifiedWatchOut as acceptedPair } from "@/lib/workbook-curriculum/watch-out";
import { samMistakeFor } from "@/lib/workbook-mistake-map";
import type { Operation } from "@/lib/question-package";
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

/** The child's coded mistakes on a standard at or below the school grade (the signals keep only those, D-084). */
function childMisconceptions(plan: Plan, standard: string | null): Set<string> {
  const s = signalsOf(plan);
  if (!s) return new Set();
  return new Set(s.mistakes.filter((m) => standard === null || m.standard === standard).flatMap((m) => m.misconceptions));
}

/**
 * The Watch out pair of the child's own mistake on a step, or null for today's line. Fail closed: a pair prints only
 * when the step's mistake names a misconception the child showed on the step's standard and C2's loader accepts its
 * pair (`verifiedWatchOut` in workbook-curriculum/watch-out.ts: marked verified by the verifier model, its hash bound
 * to this step and this exact text, and printable). Anything else keeps today's line.
 */
export function verifiedWatchOut(curriculum: Curriculum, plan: Plan, skill: string, step: CurriculumStep | undefined): { wrong: string; fix: string } | null {
  return verifiedMistake(curriculum, plan, skill, step)?.pair ?? null;
}

/** The child's coded mistake on a step with its accepted pair (the same rule as verifiedWatchOut), or null. */
function verifiedMistake(curriculum: Curriculum, plan: Plan, skill: string, step: CurriculumStep | undefined | null): { misconception: string; pair: { wrong: string; fix: string } } | null {
  if (!step) return null;
  const standard = curriculum.skill(skill)?.unit ?? null;
  const shown = childMisconceptions(plan, standard);
  if (!standard || !shown.size) return null;
  for (const m of step.mistakes) {
    if (!m.misconception || !shown.has(m.misconception)) continue;
    const pair = acceptedPair(step, m);
    if (pair) return { misconception: m.misconception, pair: { wrong: pair.wrong, fix: pair.fix } };
  }
  return null;
}

/** Sam's mistake for a misconception id through C2's closed table (workbook-mistake-map.ts), or null. */
export function samMistakeOf(misconception: string): SamMistake | null {
  return samMistakeFor(misconception);
}

/** The Sam mistakes of the child's own coded mistakes that the level allows, in the order of the signals. */
export function childSamMistakes(plan: Plan): SamMistake[] {
  const allowed = new Set(levelMistakes(plan.level));
  return [...new Set([...childMisconceptions(plan, null)].flatMap((m) => { const s = samMistakeOf(m); return s && allowed.has(s) ? [s] : []; }))];
}

/**
 * The wrong answer a step template Spot the error shows for the child's own mistake (item 3), or null for today's
 * plausible one. Fail closed: only for a step whose coded mistake the child showed has a verified C2 pair, only through
 * the closed Sam table and the level's mistakes, and only on a bare sum ("3,456 + 2,789 = ?") the mistake can happen on.
 */
export function templateSpotShown(curriculum: Curriculum, plan: Plan, skill: string, step: number, text: string): number | null {
  const own = verifiedMistake(curriculum, plan, skill, curriculum.skillSteps(skill)?.find((s) => s.number === step));
  const sum = own ? /^(\d[\d,]*) ([+−-]) (\d[\d,]*) = \?$/.exec(text.trim()) : null;
  if (!own || !sum) return null;
  const value = (x: string) => Number(x.replace(/,/g, ""));
  const op = { kind: sum[2] === "+" ? "add" : "subtract", operands: [value(sum[1]), value(sum[3])] } as unknown as Operation;
  // (C2's table reads the operation: a cause that means adding where a difference is asked needs a subtraction.)
  const mistake = samMistakeFor(own.misconception, op);
  return mistake && levelMistakes(plan.level).includes(mistake) ? samAnswer(op, mistake) : null;
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

/** A fact family's times tables (D-156 facts.ts: 4.8 recalls 2s, 5s and 10s; 5.9 adds 3s and 4s; 6.2 to 10 × 10). */
const FAMILY_TABLES: Partial<Record<FactFamilyId, readonly number[]>> = {
  mul2510: [2, 5, 10], mul234510: [2, 3, 4, 5, 10], mul100: [2, 3, 4, 5, 6, 7, 8, 9, 10], div100: [2, 3, 4, 5, 6, 7, 8, 9, 10],
};
/** Families in the grade order BC first expects them, for a skill's own table. */
const FAMILY_ORDER: readonly FactFamilyId[] = ["add5", "sub5", "add10", "sub10", "add20", "sub20", "mul2510", "mul234510", "mul100", "div100"];

/** The operation a fluency skill's facts take, from its id, or null: then the writer keeps today's choice. */
function factKind(skill: string): "add" | "subtract" | "multiply" | "divide" | "extend" | null {
  if (/divi/.test(skill)) return "divide";
  if (/multipl|recall-facts/.test(skill)) return "multiply";
  if (/extend-facts/.test(skill)) return "extend";
  if (/subtract/.test(skill)) return "subtract";
  if (/add/.test(skill)) return "add";
  return null;
}

/** The tables a multiplication or division skill practises: its first family's, without the ones the child knows. */
function skillTables(curriculum: Curriculum, plan: Plan, skill: string): readonly number[] {
  const s = signalsOf(plan)!;
  const own = FAMILY_ORDER.find((f) => FAMILY_TABLES[f] && Object.values(factsCoverage([f])).some((skills) => skills.includes(skill)));
  const tables = own ? FAMILY_TABLES[own]! : FAMILY_TABLES.mul100!;
  const known = new Set(s.facts.filter((f) => f.state === "known").flatMap((f) => [...(FAMILY_TABLES[f.family] ?? [])]));
  const open = tables.filter((t) => !known.has(t));
  return open.length && skillFactState(curriculum, plan, skill) !== "known" ? open : tables;
}

/** A warm-up fact code chose: its operation and operands, never the writer's (G1, item 4). */
export interface WarmUpFact {
  skill: string;
  kind: "add" | "subtract" | "multiply" | "divide";
  operands: [number, number];
  text: string;
  /** Present only when the step-specific generator constructed this fact from the requested step. */
  declaration?: StepDeclaration;
}

/** Build the requested mixed-multiplication step, using its own operand and result domains. */
function recallMultiplicationFact(step: CurriculumStep, unit: string, tables: readonly number[], seed: number): WarmUpFact | null {
  const { operand1, operand2, result } = step.numbers ?? {};
  if (step.skill !== "5.9-recall-facts" || step.number !== 1 || !operand1 || !operand2 || !result || !tables.length) return null;
  const left = seed % 2 ? operand1 : operand2;
  const right = seed % 2 ? operand2 : operand1;
  const stepTables = tables.filter(t => domainContains(right, BigInt(t)));
  if (!stepTables.length) return null;
  const t = stepTables[seed % stepTables.length];
  const factors = Array.from({ length: 9 }, (_, i) => i + 2).filter(f => domainContains(left, BigInt(f)) && domainContains(result, BigInt(t * f)));
  if (!factors.length) return null;
  const f = factors[Math.floor(seed / stepTables.length) % factors.length];
  const operands: [number, number] = seed % 2 ? [f, t] : [t, f];
  return { skill: step.skill, kind: "multiply", operands, text: `${operands[0]} × ${operands[1]} = ?`,
    declaration: { source: "warm-up", reference: { unit, skill: step.skill, step: step.number } } };
}

/**
 * The fact a personal warm-up slot prints (item 4), chosen by code from the aimed skill's family, or null for today's
 * writer: the slot's turn `seed` picks the table and the other factor; `taken` holds the page's facts so far.
 */
export function warmUpFact(curriculum: Curriculum, plan: Plan, skill: string, seed: number, taken: ReadonlySet<string>): WarmUpFact | null {
  const kind = factKind(skill);
  if (!signalsOf(plan) || !kind) return null;
  const tables = skillTables(curriculum, plan, skill);
  for (let k = 0; k < 90; k++) {
    const n = seed + k;
    const a = 2 + (n % 9), b = 2 + (Math.floor(n / 9) % 9);
    let fact: WarmUpFact;
    if (kind === "multiply" || kind === "divide") {
      const t = tables[n % tables.length], f = 2 + (Math.floor(n / tables.length) % 9);
      fact = kind === "multiply" ? (n % 2 ? { skill, kind, operands: [f, t], text: `${f} × ${t} = ?` } : { skill, kind, operands: [t, f], text: `${t} × ${f} = ?` })
        : { skill, kind, operands: [t * f, t], text: `${t * f} ÷ ${t} = ?` };
      // This branch requests an exact step before construction. Other family builders make no step declaration.
      if (skill === "5.9-recall-facts" && kind === "multiply") {
        const requested = curriculum.skillSteps(skill)?.find(s => s.number === 1);
        const unit = curriculum.skill(skill)?.unit;
        if (requested && unit) fact = recallMultiplicationFact(requested, unit, tables, n) ?? fact;
      }
    } else if (kind === "extend") {
      fact = n % 2 ? { skill, kind: "subtract", operands: [(a + b) * 10, b * 10], text: `${(a + b) * 10} − ${b * 10} = ?` } : { skill, kind: "add", operands: [a * 10, b * 10], text: `${a * 10} + ${b * 10} = ?` };
    } else fact = kind === "add" ? { skill, kind, operands: [a, b], text: `${a} + ${b} = ?` } : { skill, kind, operands: [a + b, b], text: `${a + b} − ${b} = ?` };
    if (!taken.has(fact.text)) return fact;
  }
  return null;
}

/** Whether a printed warm-up operation practises one of the aimed open skills (needs practice or not measured). */
function practisesOpen(curriculum: Curriculum, plan: Plan, open: readonly string[], op: { kind: string; operands: readonly number[] }): boolean {
  return open.some((skill) => {
    const kind = factKind(skill);
    if (!kind) return false;
    if (kind === "multiply") return op.kind === "multiply" && op.operands.some((x) => skillTables(curriculum, plan, skill).includes(x));
    if (kind === "divide") return op.kind === "divide" && skillTables(curriculum, plan, skill).includes(op.operands[1]);
    if (kind === "extend") return (op.kind === "add" || op.kind === "subtract") && op.operands.every((x) => x % 10 === 0);
    return op.kind === kind;
  });
}

/**
 * The book check of item 4 on the PRINTED warm-ups, Days 1 to 5: where the plan splits the fact skills into ones to
 * practise and known ones, at least half of a day's printed warm-up facts practise an open family and at most a third
 * are known ones. One problem per failing day, on its warm-up page; none without signals.
 */
export function warmUpShareProblems(curriculum: Curriculum, plan: Plan, pages: readonly { number: number; day: number | null; questions: readonly { place?: string | null; package: { operation: { kind: string; operands: readonly unknown[] } | null } | null }[] }[]): { page: number; reason: string }[] {
  if (!signalsOf(plan)) return [];
  const problems: { page: number; reason: string }[] = [];
  for (const d of plan.days.filter((x) => x.day <= 5)) {
    const part = d.pages.flatMap((p) => p.parts).find((x) => x.kind === "warm-up");
    if (!part || part.skills.length < 2 || warmUpSkill(curriculum, plan, d.day, part.skills, 0) === null) continue;
    const open = part.skills.filter((x) => skillFactState(curriculum, plan, x) !== "known");
    if (!open.length || open.length === part.skills.length) continue;
    const printed = pages.filter((p) => p.day === d.day).flatMap((p) => p.questions.filter((q) => q.place === "warm-up" && q.package).map((q) => ({ page: p.number, op: q.package!.operation })));
    if (!printed.length) continue;
    const opened = printed.filter((x) => x.op && practisesOpen(curriculum, plan, open, { kind: x.op.kind, operands: x.op.operands.map((v) => Number(typeof v === "object" && v !== null && "value" in v ? (v as { value: unknown }).value : v)) })).length;
    const known = printed.length - opened;
    if (opened * 2 < printed.length || known * 3 > printed.length + 2)
      problems.push({ page: printed[0].page, reason: `Day ${d.day}'s warm-up has ${opened} of ${printed.length} facts the child still needs to practise; at least half must be, and at most a third may be facts the child already knows` });
  }
  return problems;
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

/** Whether a code story has a noun slot interests can fill (item 5): a template with {things} or {places}, or a code frame's thing. */
export function interestEligible(curriculum: Curriculum, c: { source: string; item: { thing?: string | null }; template?: { skill: string; step: number; index: number } } | null | undefined): boolean {
  if (!c) return false;
  if (c.template) return /\{(?:things|places)\}/.test(curriculum.skillSteps(c.template.skill)?.find((s) => s.number === c.template!.step)?.templates?.[c.template.index]?.text ?? "");
  return c.source === "story" && !!c.item.thing;
}

/** Whether a printed text names one of the parent's interest nouns. */
export function printsInterest(plan: Plan, text: string): boolean {
  const { things, places } = interestWords(plan);
  return [...things, ...places].some((w) => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text));
}

/** The share item 5 sets: at least half and at most two thirds of the eligible stories name an interest. */
export const INTEREST_SHARE = { min: 0.5, max: 2 / 3, target: 0.63 } as const;

/** The book check of item 5 on the printed book: the interest share of its eligible code stories (6 or more). */
export function interestShareProblems(curriculum: Curriculum, plan: Plan, pages: readonly { number: number; questions: readonly { itemPlan?: Parameters<typeof interestEligible>[1]; package: { text: string } | null }[] }[]): { page: number; reason: string }[] {
  if (!interestWords(plan).things.length) return [];
  const eligible = pages.flatMap((p) => p.questions.filter((q) => q.package && interestEligible(curriculum, q.itemPlan)).map((q) => ({ page: p.number, interest: printsInterest(plan, q.package!.text) })));
  if (eligible.length < 6) return [];
  const share = eligible.filter((x) => x.interest).length / eligible.length;
  return share >= INTEREST_SHARE.min && share <= INTEREST_SHARE.max ? [] : [{ page: eligible[0].page, reason: `${eligible.filter((x) => x.interest).length} of ${eligible.length} stories with a thing or place name an interest; the book needs half to two thirds` }];
}

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
