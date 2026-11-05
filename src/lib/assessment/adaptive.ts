// Six-question blocks. All questions are drawn at start; a lock alone advances the search.
import { ALL_TEMPLATES, difficultyOf } from "./bank";
import { atLeast, bandFor, REPORTED_STRAND, STRAND_MINIMUM_QUESTIONS, WORKING_LEVEL_PERCENT } from "./constants";
import { leftOutOfScore } from "./rushing";
import { rngFor } from "./rng";
import { fillTemplate, levelFor, sameQuestion } from "./session";
import type { AdaptiveBlock, AdaptiveTest, ChildProfile, Level, Question, Session, Template } from "./types";

export const BLOCK_SIZE = 6;
export const ADAPTIVE_BREAK_AFTER = 12;
export const SEARCH_QUESTION_LIMIT = 36;
export const ADAPTIVE_QUESTION_LIMIT = 72;
export const LEVEL_EVIDENCE_MINIMUM = 12;
export const UNKNOWN_RESPONSE = "I don't know yet";
export const UNKNOWN_WAIT_MS = 15_000;

export const adaptiveQuestions = (a: AdaptiveTest): Question[] => a.blocks.flatMap(b => b.questions);
export const adaptiveTop = (profile: ChildProfile): Level => profile.grade === 9 ? 9 : 8;

export function createAdaptiveSession(profile: ChildProfile, seed: number, bank: readonly Template[] = ALL_TEMPLATES): Session {
  if (!Number.isInteger(seed)) throw new Error("The seed must be a whole number");
  const rng = rngFor(seed, "blocks");
  const pool = rng.shuffle(bank.filter(t => levelFor(t, profile.province) <= adaptiveTop(profile)))
    .map((t, i) => fillTemplate(t, seed, profile.province, `bq-${i}`));
  const adaptive: AdaptiveTest = { version: 1, pool, blocks: [], locked: 0, complete: false, sufficientEvidence: false };
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

function selectBlock(a: AdaptiveTest, profile: ChildProfile, level: Level, purpose: AdaptiveBlock["purpose"]): AdaptiveBlock {
  const pool = available(a).filter(q => q.level === level);
  const strands = bandFor(profile.grade).strands.filter(s => pool.some(q => REPORTED_STRAND[q.strand] === s));
  const chosen: Question[] = [];
  const rank = { easy: 0, medium: 1, hard: 2 };
  for (let i = 0; i < BLOCK_SIZE; i++) {
    const strand = strands[(i + a.blocks.length * BLOCK_SIZE) % strands.length];
    const q = pool.find(q => REPORTED_STRAND[q.strand] === strand && !chosen.includes(q))
      ?? pool.find(q => !chosen.includes(q));
    if (!q) break;
    chosen.push(q);
  }
  return { level, purpose, questions: chosen.sort((a,b) => rank[difficultyOf(a.templateId)] - rank[difficultyOf(b.templateId)]) };
}

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
    const missing = bandFor(session.profile.grade).strands.flatMap(strand => {
      const required = Math.min(STRAND_MINIMUM_QUESTIONS, a.pool.filter(q => q.level <= session.profile.grade && REPORTED_STRAND[q.strand] === strand).length);
      const count = scoredQuestions.filter(q => q.level <= session.profile.grade && REPORTED_STRAND[q.strand] === strand).length;
      return Array.from({ length: Math.max(0, required - count) }, () => strand);
    });
    if (missing.length) {
      const pool = available(a).filter(q => q.level <= session.profile.grade)
        .sort((x,y) => Math.abs(x.level-evidence.level) - Math.abs(y.level-evidence.level));
      const chosen: Question[] = [];
      for (const strand of missing.slice(0, BLOCK_SIZE)) {
        const q = pool.find(q => REPORTED_STRAND[q.strand] === strand && !chosen.includes(q));
        if (q) chosen.push(q);
      }
      next = { level: evidence.level, purpose: "coverage", questions: chosen };
    }
  }
  if (next?.questions.length && questions.length + next.questions.length <= ADAPTIVE_QUESTION_LIMIT) a.blocks.push(next);
  else {
    a.complete = true;
    a.sufficientEvidence = adaptiveEvidence(session).sufficient && bandFor(session.profile.grade).strands.every(strand =>
      scoredQuestions.filter(q => q.level <= session.profile.grade && REPORTED_STRAND[q.strand] === strand).length >= Math.min(STRAND_MINIMUM_QUESTIONS, a.pool.filter(q => q.level <= session.profile.grade && REPORTED_STRAND[q.strand] === strand).length));
  }
  return { ...session, adaptive: a };
}
