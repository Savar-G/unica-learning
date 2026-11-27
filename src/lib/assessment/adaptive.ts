// Six-question assessment blocks drawn from a stored pool. A lock alone advances the search.
import { placeV2Workbook, workbookStartFromPrerequisites } from "@/lib/workbook-v2-placement";
import { ALL_TEMPLATES, difficultyOf } from "./bank";
import { atLeast, bandFor, REPORTED_STRAND, STRAND_MINIMUM_QUESTIONS, WORKING_LEVEL_PERCENT } from "./constants";
import { leftOutOfScore, paceOf } from "./rushing";
import { rngFor } from "./rng";
import { SKILL_TAGS, tagSkills } from "./skill-tags";
import { fillTemplate, levelFor, sameQuestion } from "./session";
import type { AdaptiveBlock, AdaptiveTest, Answer, ChildProfile, Level, Question, ReportedStrand, Session, StoredTest, Template } from "./types";

export const BLOCK_SIZE = 6;
export const ADAPTIVE_BREAK_AFTER = 12;
export const ADAPTIVE_SECOND_BREAK_AFTER = 36;
const ABOVE_GRADE_COVERAGE_LIMIT = BLOCK_SIZE;
export const SEARCH_QUESTION_LIMIT = 36;
export const ADAPTIVE_QUESTION_LIMIT = 72;
export const LEVEL_EVIDENCE_MINIMUM = 12;
const SECOND_LOOK_MINIMUM = LEVEL_EVIDENCE_MINIMUM + BLOCK_SIZE;
export const UNKNOWN_RESPONSE = "I don't know yet";
export const UNKNOWN_WAIT_MS = 15_000;

export const adaptiveQuestions = (a: AdaptiveTest): Question[] => a.blocks.flatMap(b => b.questions);
export function assessmentQuestionsOnly(a: AdaptiveTest): number {
  const last = a.blocks.at(-1);
  return adaptiveQuestions(a).length - (last?.purpose === "workbook-placement" ? last.questions.length : 0);
}

export const adaptiveTop = (profile: ChildProfile): Level => profile.grade === 9 ? 9 : 8;

export function createAdaptiveSession(
  profile: ChildProfile,
  seed: number,
  bank: readonly Template[] = ALL_TEMPLATES,
  { workbookPlacement = false }: { workbookPlacement?: boolean } = {},
): Session {
  if (!Number.isInteger(seed)) throw new Error("The seed must be a whole number");
  const rng = rngFor(seed, "blocks");
  const pool = rng.shuffle(bank.filter(t => levelFor(t, profile.province) <= adaptiveTop(profile)))
    .map((t, i) => fillTemplate(t, seed, profile.province, `bq-${i}`));
  const adaptive: AdaptiveTest = {
    version: 2, placementRules: "above-grade-confirmation", pool, blocks: [],
    locked: 0, complete: false, sufficientEvidence: false, ...(workbookPlacement && { workbookPlacement: true }),
  };
  const first = selectBlock(adaptive, profile, profile.grade, "search");
  if (first.questions.length !== BLOCK_SIZE) throw new Error("The bank cannot start this assessment");
  adaptive.blocks.push(first);
  return { profile, seed, stage1: [], stage2: { up: [], stay: [], down: [] }, route: "stay", answers: [], adaptive };
}

function available(a: AdaptiveTest): Question[] {
  const asked = adaptiveQuestions(a);
  const ids = new Set(asked.map(q => q.templateId));
  const seen = new Set(asked.map(sameQuestion));
  return a.pool.filter(q => !ids.has(q.templateId) && !seen.has(sameQuestion(q)));
}

/** From this level up, a block asks every skill family once before it repeats one (UNI-221). Lower levels keep their routes. */
export const SKILL_BALANCED_FROM = 10;

/** A question's skill family: the main skill of its template's skill tag, or the template itself when it has no tag. */
export function skillFamily(q: Pick<Question, "templateId">): string {
  const tag = SKILL_TAGS[q.templateId];
  return tag ? tagSkills(tag)[0] : q.templateId;
}

/**
 * Up to one block of questions from a level's pool, rotating the reported strands from `offset`. With `balanceSkills`,
 * a question whose skill family is already in the block is taken only when no other family is left.
 */
export function blockQuestions(pool: readonly Question[], strands: readonly ReportedStrand[], offset: number, balanceSkills: boolean): Question[] {
  const chosen: Question[] = [];
  const families = new Set<string>();
  const repeats = new Set<Question>();
  const open = (q: Question) => !chosen.includes(q);
  const fresh = (q: Question) => open(q) && !(balanceSkills && families.has(skillFamily(q)));
  const inStrand = (strand: ReportedStrand | undefined) => (q: Question) => REPORTED_STRAND[q.strand] === strand;
  for (let i = 0; i < BLOCK_SIZE; i++) {
    const strand = strands[(i + offset) % strands.length];
    const q = pool.find(q => inStrand(strand)(q) && fresh(q)) ?? pool.find(fresh)
      ?? pool.find(q => inStrand(strand)(q) && open(q)) ?? pool.find(open);
    if (!q) break;
    if (balanceSkills && families.has(skillFamily(q))) repeats.add(q);
    chosen.push(q);
    families.add(skillFamily(q));
  }
  // Easy questions first; a repeated skill family stays after every family's first question.
  const rank = (q: Question) => (repeats.has(q) ? 3 : 0) + { easy: 0, medium: 1, hard: 2 }[difficultyOf(q.templateId)];
  return chosen.sort((a, b) => rank(a) - rank(b));
}

function selectBlock(a: AdaptiveTest, profile: ChildProfile, level: Level, purpose: AdaptiveBlock["purpose"]): AdaptiveBlock {
  const pool = available(a).filter(q => q.level === level);
  const strands = bandFor(profile.grade).strands.filter(s => pool.some(q => REPORTED_STRAND[q.strand] === s));
  return { level, purpose, questions: blockQuestions(pool, strands, a.blocks.length * BLOCK_SIZE, level >= SKILL_BALANCED_FROM) };
}

/** Legacy v1 placement, including its coverage answers and 70% bar. */
export function adaptiveEvidence(session: Session): { level: Level; sufficient: boolean } {
  const a = session.adaptive!;
  const questions = adaptiveQuestions(a);
  const out = leftOutOfScore(session.answers);
  const tallies = Array.from({ length: adaptiveTop(session.profile) + 1 }, (_, level) => {
    const answers = session.answers.filter((_, i) => questions[i]?.level === level && !out[i]);
    return { level: level as Level, n: answers.length, right: answers.filter(x => x.correct).length };
  });
  // A few coverage questions must never move placement above a confirmed level.
  const cleared = tallies.filter(t => t.n >= LEVEL_EVIDENCE_MINIMUM && atLeast(t.right, t.n, WORKING_LEVEL_PERCENT));
  const best = cleared.at(-1);
  const floor = tallies[0];
  return best ? { level: best.level, sufficient: true }
    : { level: 0, sufficient: floor.n >= LEVEL_EVIDENCE_MINIMUM };
}

/** Locks the current block and selects at most one more. The store commits this with an answer snapshot. */
export function lockAdaptiveBlock(session: Session): Session {
  const current = session.adaptive!;
  if (!current || current.complete || current.locked !== current.blocks.length - 1) throw new Error("No open block");
  const questions = adaptiveQuestions(current);
  if (session.answers.length !== questions.length) throw new Error("The block is not answered");
  const a: AdaptiveTest = { ...current, blocks: [...current.blocks], locked: current.locked + 1 };
  if (a.version === 2) return lockPlacementBlock(session, a, questions);
  const block = a.blocks.at(-1)!;
  const answers = session.answers.slice(-block.questions.length);
  const right = answers.filter(x => x.correct).length;
  const out = leftOutOfScore(session.answers);
  const scoredQuestions = questions.filter((_, i) => !out[i]);
  const tally = (level: number) => session.answers.filter((_, i) => questions[i].level === level && !out[i]);
  const pass = (level: number) => { const rows = tally(level); return atLeast(rows.filter(x => x.correct).length, rows.length, WORKING_LEVEL_PERCENT); };
  const here = tally(block.level);
  const top = adaptiveTop(session.profile);
  const searchCount = a.blocks.filter(b => b.purpose === "search").reduce((n,b) => n + b.questions.length, 0);
  let next: AdaptiveBlock | null = null;
  if (block.purpose === "search" && searchCount < SEARCH_QUESTION_LIMIT) {
    const bracketed = here.length >= LEVEL_EVIDENCE_MINIMUM && pass(block.level)
      && (block.level === top || (tally(block.level + 1).length > 0 && !pass(block.level + 1)));
    const floorFound = block.level === 0 && here.length >= LEVEL_EVIDENCE_MINIMUM && !pass(0);
    if (!bracketed && !floorFound) {
      let level = block.level;
      if (right >= 5 && block.level < top && !tally(block.level + 1).length) level = (block.level + 1) as Level;
      else if (right <= 2 && block.level > 0) level = (block.level - 1) as Level;
      else if (here.length >= LEVEL_EVIDENCE_MINIMUM) {
        if (!pass(block.level) && block.level > 0) level = (block.level - 1) as Level;
        else if (pass(block.level) && block.level < top && !tally(block.level + 1).length) level = (block.level + 1) as Level;
      }
      next = selectBlock(a, session.profile, level, "search");
    }
  }
  if (!next) {
    // At the cap, confirm the highest level with evidence of a pass. If none passed, test K rather than infer a grade.
    const levels = [...new Set(questions.map(q => q.level))].sort((x,y) => y-x);
    const candidate = levels.find(level => pass(level)) ?? Math.max(0, Math.min(...levels) - 1) as Level;
    if (tally(candidate).length < LEVEL_EVIDENCE_MINIMUM) next = selectBlock(a, session.profile, candidate, "confirm");
  }
  if (!next) {
    // Keep the report's six answers per area, all at or below school grade. Prefer work near the confirmed start.
    const evidence = adaptiveEvidence(session);
    next = coverageBlock(a, session.profile, scoredQuestions, evidence.level, BLOCK_SIZE);
  }
  if (next?.questions.length && questions.length + next.questions.length <= ADAPTIVE_QUESTION_LIMIT) a.blocks.push(next);
  else {
    a.complete = true;
    a.sufficientEvidence = adaptiveEvidence(session).sufficient && bandFor(session.profile.grade).strands.every(strand =>
      scoredQuestions.filter(q => q.level <= session.profile.grade && REPORTED_STRAND[q.strand] === strand).length >= Math.min(STRAND_MINIMUM_QUESTIONS, a.pool.filter(q => q.level <= session.profile.grade && REPORTED_STRAND[q.strand] === strand).length));
  }
  return { ...session, adaptive: a };
}

function coverageBlock(a: AdaptiveTest, profile: ChildProfile, scored: readonly Question[], level: Level, limit: number): AdaptiveBlock | null {
  const missing = bandFor(profile.grade).strands.flatMap(strand => {
    const required = Math.min(STRAND_MINIMUM_QUESTIONS, a.pool.filter(q => q.level <= profile.grade && REPORTED_STRAND[q.strand] === strand).length);
    const count = scored.filter(q => q.level <= profile.grade && REPORTED_STRAND[q.strand] === strand).length;
    return Array.from({ length: Math.max(0, required - count) }, () => strand);
  });
  if (!missing.length) return null;
  const pool = available(a).filter(q => q.level <= profile.grade)
    .sort((x, y) => Math.abs(x.level - level) - Math.abs(y.level - level));
  const chosen: Question[] = [];
  for (const strand of missing.slice(0, limit)) {
    const q = pool.find(q => REPORTED_STRAND[q.strand] === strand && !chosen.includes(q));
    if (q) chosen.push(q);
  }
  return { level, purpose: "coverage", questions: chosen };
}

function placementEvidence(test: AdaptiveTest, answers: readonly Answer[]) {
  const out = leftOutOfScore(answers);
  const scored: Question[] = [];
  const byLevel = new Map<Level, Answer[]>();
  let position = 0;
  for (const block of test.blocks) {
    for (const question of block.questions) {
      const answer = answers[position];
      const included = !out[position++];
      if (!answer || !included) continue;
      scored.push(question);
      if (block.purpose === "coverage") continue;
      const rows = byLevel.get(question.level) ?? [];
      rows.push(answer);
      byLevel.set(question.level, rows);
    }
  }
  return { scored, byLevel };
}

type GradeCheck = "probe" | "first-look" | "second-look" | "pass" | "fail";

function gradeCheck(answers: readonly Answer[], aboveSchoolGrade: boolean): GradeCheck {
  if (answers.length < BLOCK_SIZE) return "probe";
  if (answers.length < LEVEL_EVIDENCE_MINIMUM) return "first-look";
  const first = answers.slice(0, LEVEL_EVIDENCE_MINIMUM).filter(a => a.correct).length;
  if (aboveSchoolGrade) {
    if (first >= 10) return "pass";
    if (first < 9) return "fail";
    if (answers.length < SECOND_LOOK_MINIMUM) return "second-look";
    return answers.slice(LEVEL_EVIDENCE_MINIMUM, SECOND_LOOK_MINIMUM).filter(a => a.correct).length >= 4 ? "pass" : "fail";
  }
  if (first >= 9) return "pass";
  if (first <= 6) return "fail";
  if (answers.length < SECOND_LOOK_MINIMUM) return "second-look";
  return first + answers.slice(LEVEL_EVIDENCE_MINIMUM, SECOND_LOOK_MINIMUM).filter(a => a.correct).length >= 12 ? "pass" : "fail";
}

type CheckGrade = (level: Level, answers: readonly Answer[]) => GradeCheck;

function gradeCheckFor(test: StoredTest, useCurrent = false): CheckGrade {
  const confirmAboveGrade = useCurrent || test.adaptive?.placementRules === "above-grade-confirmation";
  return (level, answers) => gradeCheck(answers, confirmAboveGrade && level > test.profile.grade);
}

function highestPass(byLevel: ReadonlyMap<Level, Answer[]>, checkGrade: CheckGrade): Level | undefined {
  return [...byLevel.keys()].sort((a, b) => b - a).find(level => checkGrade(level, byLevel.get(level) ?? []) === "pass");
}

/** Locks are final. A later fast answer can extend a rushing run across a block boundary. */
function confirmedGrade(test: AdaptiveTest, answers: readonly Answer[], byLevel: ReadonlyMap<Level, Answer[]>, checkGrade: CheckGrade): Level | undefined {
  let best = highestPass(byLevel, checkGrade);
  let end = 0;
  for (const block of test.blocks.slice(0, test.locked)) {
    end += block.questions.length;
    if (end >= answers.length || block.purpose === "coverage") break;
    const prior = highestPass(placementEvidence(test, answers.slice(0, end)).byLevel, checkGrade);
    if (prior !== undefined && (best === undefined || prior > best)) best = prior;
  }
  return best;
}

export type AdaptivePlacementScore =
  | { outcome: "retake"; level: null }
  | { outcome: "placed" | "insufficient"; level: Level; passed: boolean; clear: boolean };

/** Apply the current placement rules to the stored form, without changing its questions, its version or its answers. */
export function rescoreAdaptivePlacement(test: StoredTest, answers: readonly Answer[]): AdaptivePlacementScore {
  return scorePlacement(test, answers, gradeCheckFor(test, true));
}

/** Score a v2 attempt using the rule it started with, including completed attempts restored for reports. */
export function scoreStoredAdaptivePlacement(session: Session): AdaptivePlacementScore {
  return scorePlacement(session, session.answers, gradeCheckFor(session));
}

function scorePlacement(test: StoredTest, answers: readonly Answer[], checkGrade: CheckGrade): AdaptivePlacementScore {
  if (!test.adaptive) throw new Error("An adaptive test is required");
  const questions = adaptiveQuestions(test.adaptive);
  if (answers.length !== questions.length || answers.some((a, i) => a.questionId !== questions[i].id)) {
    throw new Error("Answers do not fit the stored test");
  }
  const mainAnswers = answers.slice(0, assessmentQuestionsOnly(test.adaptive));
  if (paceOf(mainAnswers).unreliable) return { outcome: "retake", level: null };
  const { byLevel } = placementEvidence(test.adaptive, mainAnswers);
  const best = confirmedGrade(test.adaptive, mainAnswers, byLevel, checkGrade);
  const floorChecked = checkGrade(0, byLevel.get(0) ?? []) === "fail";
  if (best === undefined) return { outcome: floorChecked ? "placed" : "insufficient", level: 0, passed: false, clear: false };
  const aboveLevel = (best + 1) as Level;
  const above = checkGrade(aboveLevel, byLevel.get(aboveLevel) ?? []);
  return { outcome: "placed", level: best, passed: true, clear: above === "pass" || above === "fail" };
}

function searchLevel(here: Level, top: Level, byLevel: ReadonlyMap<Level, Answer[]>, checkGrade: CheckGrade): Level | null {
  const answers = byLevel.get(here) ?? [];
  const check = checkGrade(here, answers);
  const above = Math.min(top, here + 1) as Level;
  const below = Math.max(0, here - 1) as Level;
  if (check === "probe" || check === "second-look") return here;
  if (check === "first-look") {
    const right = answers.slice(0, BLOCK_SIZE).filter(a => a.correct).length;
    const down = Math.max(0, here - (right <= 1 ? 2 : 1)) as Level;
    if (right >= 5 && above !== here && !byLevel.has(above)) return above;
    if (right <= 2 && down !== here && !byLevel.has(down)) return down;
    return here;
  }
  if (check === "pass") {
    return above !== here && checkGrade(above, byLevel.get(above) ?? []) !== "fail" ? above : null;
  }
  if (here === 0 || highestPass(byLevel, checkGrade) !== undefined) return null;
  return below;
}

function completePlacement(session: Session, adaptive: AdaptiveTest, questions: Question[], checkGrade: CheckGrade): Session {
  const score = scorePlacement({ ...session, adaptive }, session.answers, checkGrade);
  if (adaptive.workbookPlacement && score.outcome === "placed") {
    const mainCount = assessmentQuestionsOnly(adaptive);
    const mainAnswers = session.answers.slice(0, mainCount);
    const excluded = leftOutOfScore(mainAnswers);
    const placement = placeV2Workbook(score.level, {
      questions: questions.slice(0, mainCount),
      answers: mainAnswers.filter((_, index) => !excluded[index]),
    }, session.seed);
    if (placement.kind === "needs_level_3_check") {
      adaptive.blocks.push({ level: 2, purpose: "workbook-placement", questions: [...placement.questions] });
      return { ...session, adaptive };
    }
    if (placement.kind === "placed") adaptive.workbookStart = { level: placement.level, topic: placement.topic };
  }
  adaptive.complete = true;
  adaptive.sufficientEvidence = score.outcome !== "insufficient";
  return { ...session, adaptive };
}

function lockPlacementBlock(session: Session, a: AdaptiveTest, questions: Question[]): Session {
  const { profile, answers } = session;
  const block = a.blocks.at(-1)!;
  if (block.purpose === "workbook-placement") {
    const right = answers.slice(-block.questions.length).filter(answer => answer.correct).length;
    a.workbookStart = workbookStartFromPrerequisites(right);
    a.complete = true;
    a.sufficientEvidence = true;
    return { ...session, adaptive: a };
  }
  const { byLevel, scored } = placementEvidence(a, answers);
  const checkGrade = gradeCheckFor(session);
  const best = confirmedGrade(a, answers, byLevel, checkGrade);
  const top = adaptiveTop(profile);
  // The workbook placement check comes after the assessment and outside its limit, so the assessment route never changes.
  const room = ADAPTIVE_QUESTION_LIMIT - questions.length;
  const searchCount = a.blocks.filter(b => b.purpose === "search").reduce((n, b) => n + b.questions.length, 0);
  const select = (level: Level, purpose: "search" | "confirm", limit = BLOCK_SIZE) => {
    const block = selectBlock(a, profile, level, purpose);
    block.questions = block.questions.slice(0, Math.min(limit, room));
    return block;
  };
  let next: AdaptiveBlock | null = null;
  if (block.purpose === "search" && searchCount < SEARCH_QUESTION_LIMIT) {
    const level = searchLevel(block.level, top, byLevel, checkGrade);
    if (level !== null) next = select(level, "search", SEARCH_QUESTION_LIMIT - searchCount);
  }
  if (!next?.questions.length && block.purpose !== "coverage") {
    const checked = [...byLevel.keys()].sort((x, y) => y - x);
    const adjacent = best !== undefined && best < top ? (best + 1) as Level : null;
    const pending = checked.find(level => (best === undefined || level > best) && checkGrade(level, byLevel.get(level) ?? []) === "second-look");
    const promising = checked.find(level => {
      const rows = byLevel.get(level) ?? [];
      return (best === undefined || level > best) && checkGrade(level, rows) === "first-look" && rows.filter(x => x.correct).length >= 3;
    });
    const revisit = adjacent !== null && a.blocks.some(b => b.level === adjacent) && (byLevel.get(adjacent)?.length ?? 0) < LEVEL_EVIDENCE_MINIMUM ? adjacent : null;
    let fallback: Level | undefined;
    if (best === undefined) {
      for (let level = Math.max(0, block.level - 1); level >= 0; level--) {
        const candidate = level as Level;
        if (checkGrade(candidate, byLevel.get(candidate) ?? []) !== "fail") {
          fallback = candidate;
          break;
        }
      }
    }
    const candidate = pending ?? revisit ?? promising ?? fallback;
    if (candidate !== undefined) next = select(candidate, "confirm");
  }
  if (!next?.questions.length && room > 0) {
    const used = a.blocks.filter(b => b.purpose === "coverage").reduce((n, b) => n + b.questions.length, 0);
    const limit = best !== undefined && best > profile.grade ? ABOVE_GRADE_COVERAGE_LIMIT - used : room;
    if (limit > 0) next = coverageBlock(a, profile, scored, best ?? 0, Math.min(room, limit, BLOCK_SIZE));
  }
  if (!next?.questions.length || next.questions.length > room) return completePlacement(session, a, questions, checkGrade);
  a.blocks.push(next);
  return { ...session, adaptive: a };
}

/** Compare a measured level with the school-year expectation in the family's finish month (1–12). */
export function schoolYearPlacement(schoolGrade: Level, workingLevel: Level, finishMonth: number) {
  const beforeFebruary = finishMonth >= 9 || finishMonth === 1;
  const expected = beforeFebruary ? Math.max(0, schoolGrade - 1) : schoolGrade;
  return { gradesBehind: Math.max(0, expected - workingLevel), aboveSchoolGrade: workingLevel > schoolGrade };
}
