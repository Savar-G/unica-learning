// The optional extra round (#190, spec #181): after the last main question, when at least one area's result is an
// early sign, the child can take up to EXTRA_ROUND_QUESTIONS more questions or skip them. The questions are at or
// below the school grade, spread across the early-sign areas, and use no template the child already saw. The round's
// answers then count in the score like main answers. BC selection only, like the strand minimum (D-110): AB, SK, MB
// and ON keep today's test. Pure, like the session: the seed draws the questions, so the same test always gets the
// same round.
import { EXTRA_ROUND_QUESTIONS, REPORTED_STRAND, bandFor } from "./constants";
import { bankFor } from "./bank";
import { rngFor } from "./rng";
import { extraRoundRecord, fillTemplate, finish, levelFor, sameQuestion, scoredAgainst, type SessionOptions } from "./session";
import type { ExtraRoundOffer, Question, Session, Template } from "./types";

/** The questions of the routed main test: stage 1, then the stage 2 form. Empty before routing. */
const mainQuestions = (session: Session): Question[] => (session.route ? [...session.stage1, ...session.stage2[session.route]] : []);

/** True when every question of the main test has an answer. The extra round does not count. */
export const mainAnswered = (session: Session): boolean => session.route !== null && session.answers.length >= mainQuestions(session).length;

/**
 * The round a session would get now: none before every main answer is in, after a round was drawn, outside BC
 * selection, or when no area is an early sign. Up to EXTRA_ROUND_QUESTIONS questions, one area after another in band
 * order; an area with no unused template left gives its turns to the others, so the round can be shorter. In an area:
 * the school grade first, then the next level down; at a level, the least-used BC standard first, as the main test
 * rotates them (D-110).
 */
function drawRound(session: Session, bank: readonly Template[]): Question[] {
  if (session.extra || !mainAnswered(session) || scoredAgainst(session.profile.province) !== "BC") return [];
  const { grade, province } = session.profile;
  const early = new Set(finish(session).strands.filter((s) => s.certainty === "early-sign").map((s) => s.strand));
  if (early.size === 0) return [];

  const main = mainQuestions(session);
  const rng = rngFor(session.seed, "stage:x");
  const byId = new Map(bank.map((t) => [t.id, t]));
  const used = new Set(main.map((q) => q.templateId));
  const key = (t: Template) => `${REPORTED_STRAND[t.strand]}:${t.standard}`;
  const standardUses = new Map<string, number>();
  for (const q of main) {
    const t = byId.get(q.templateId);
    if (t) standardUses.set(key(t), (standardUses.get(key(t)) ?? 0) + 1);
  }
  const pools = bandFor(grade).strands.filter((s) => early.has(s)).map((strand) => ({
    strand,
    templates: rng.shuffle(bank.filter((t) => REPORTED_STRAND[t.strand] === strand && levelFor(t, province) <= grade && !used.has(t.id))),
  }));

  const seen = new Set(main.map(sameQuestion));
  const questions: Question[] = [];
  for (let turn = 0; questions.length < EXTRA_ROUND_QUESTIONS; turn++) {
    const left = pools.map((p) => p.templates.filter((t) => !used.has(t.id)));
    if (left.every((l) => l.length === 0)) break;
    const available = left[turn % pools.length];
    if (available.length === 0) continue;
    const top = Math.max(...available.map((t) => levelFor(t, province)));
    const atTop = available.filter((t) => levelFor(t, province) === top);
    const least = Math.min(...atTop.map((t) => standardUses.get(key(t)) ?? 0));
    const template = atTop.find((t) => (standardUses.get(key(t)) ?? 0) === least)!;
    used.add(template.id);
    standardUses.set(key(template), least + 1);
    const id = `x-${questions.length}`;
    let q = fillTemplate(template, session.seed, province, id);
    for (let retry = 1; seen.has(sameQuestion(q)) && retry < 20; retry++) {
      q = { ...fillTemplate(template, session.seed, province, `${id}.${retry}`), id };
    }
    seen.add(sameQuestion(q));
    // Shown work is required only in the main test (#67): the whiteboard stays open and optional here.
    questions.push({ ...q, showWork: false });
  }
  return questions;
}

/** The extra round the child can take now, or null when none is due (see drawRound). */
export function extraRoundOffer(session: Session, options: SessionOptions = {}): ExtraRoundOffer | null {
  const questions = drawRound(session, options.bank ?? bankFor(session.profile.grade));
  return questions.length > 0 ? extraRoundRecord(session.profile.grade, questions) : null;
}

/** The round the child took: its size and areas, and how many of its questions have an answer. Null when none. */
export function extraRoundTaken(session: Session): (ExtraRoundOffer & { answered: number }) | null {
  if (!session.extra?.length) return null;
  const answered = Math.max(0, session.answers.length - mainQuestions(session).length);
  return { ...extraRoundRecord(session.profile.grade, session.extra), answered };
}

/**
 * The session with its extra round drawn: the offer's questions, asked after the routed form. The server stores them
 * with the test (storedTest), so the round stays the same when the bank changes later. Throws when no round is due.
 */
export function startExtraRound(session: Session, options: SessionOptions = {}): Session {
  const extra = drawRound(session, options.bank ?? bankFor(session.profile.grade));
  if (extra.length === 0) throw new Error("No extra round is due for this test");
  return { ...session, extra };
}
