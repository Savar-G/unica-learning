// The assessment session: pure functions over plain data.
// No network, database, clock or Math.random: the caller passes the seed and every time value.
import {
  REPORTED_STRAND,
  ROUTE_DOWN_BELOW_PERCENT,
  ROUTE_UP_PERCENT,
  STRAND_DEVELOPING_PERCENT,
  STRAND_SECURE_PERCENT,
  WORKING_LEVEL_MIN_QUESTIONS,
  WORKING_LEVEL_PERCENT,
  atLeast,
  bandFor,
} from "./constants";
import { rngFor } from "./rng";
import { SAMPLE_BANK } from "./sample-bank";
import type {
  Answer,
  ChildProfile,
  Level,
  LevelResult,
  Placement,
  Province,
  Question,
  ReportedStrand,
  Route,
  Session,
  StrandResult,
  StrandStatus,
  TaggedProvince,
  Template,
} from "./types";

/** "Another province" is scored against BC (D-083). */
export const scoredAgainst = (province: Province): TaggedProvince => (province === "other" ? "BC" : province);

/** The template's level for a child in this province: that province's grade tag, else BC's. */
export const levelFor = (template: Template, province: Province): Level =>
  template.grades[scoredAgainst(province)] ?? template.grades.BC;

/**
 * Fills a template with numbers from the seed. The same template, seed and province always give the same question.
 * Used by the session, and by the offline template checker (#74).
 */
export function fillTemplate(template: Template, seed: number, province: Province = "BC", id = template.id): Question {
  const rng = rngFor(seed, `fill:${id}`);
  const filled = template.fill(rng);
  return {
    id,
    templateId: template.id,
    level: levelFor(template, province),
    strand: template.strand,
    format: template.format,
    whiteboard: template.whiteboard,
    prompt: filled.prompt,
    readAloud: filled.readAloud,
    choices: template.format === "choice" ? rng.shuffle([filled.answer, ...filled.wrong.map((w) => w.value)]) : undefined,
    values: filled.values,
    answer: filled.answer,
    wrong: filled.wrong,
  };
}

/** What the browser may see: no answer and no coded wrong answers. */
export function toPublicQuestion(q: Question) {
  const { id, level, strand, format, whiteboard, prompt, readAloud, choices } = q;
  return { id, level, strand, format, whiteboard, prompt, readAloud, choices };
}

export interface SessionOptions {
  /** The question bank. Defaults to the sample bank until the full banks land (#74-#76). */
  bank?: readonly Template[];
}

/** Two questions with this key look the same to the child. */
const sameQuestion = (q: Question) => `${q.prompt}|${[...(q.choices ?? [])].sort().join("|")}`;

// One stage: `count` questions at `level`, rotating through the band's strands.
// A strand with no questions at this level (fractions below level 3) gives its turns to the others.
function buildStage(
  bank: readonly Template[],
  profile: ChildProfile,
  strands: readonly ReportedStrand[],
  level: Level,
  count: number,
  seed: number,
  label: string,
  seen: Set<string>,
): Question[] {
  const rng = rngFor(seed, `stage:${label}`);
  const pools = strands
    .map((strand) => ({
      strand,
      templates: rng.shuffle(bank.filter((t) => REPORTED_STRAND[t.strand] === strand && levelFor(t, profile.province) === level)),
    }))
    .filter((p) => p.templates.length > 0);
  if (pools.length === 0) {
    throw new Error(`The question bank has no level ${level} questions for grade ${profile.grade} (${strands.join(", ")})`);
  }

  const used = new Map<ReportedStrand, number>();
  const questions: Question[] = [];
  for (let i = 0; i < count; i++) {
    const pool = pools[i % pools.length];
    const n = used.get(pool.strand) ?? 0;
    used.set(pool.strand, n + 1);
    const template = pool.templates[n % pool.templates.length];
    // A repeated template gets new numbers; retry a few times if it still matches a question already asked.
    let q = fillTemplate(template, seed, profile.province, `${label}-${i}`);
    for (let retry = 1; seen.has(sameQuestion(q)) && retry < 20; retry++) {
      q = { ...fillTemplate(template, seed, profile.province, `${label}-${i}.${retry}`), id: `${label}-${i}` };
    }
    seen.add(sameQuestion(q));
    questions.push(q);
  }
  return questions;
}

/** Starts a test. Every stage 2 form is drawn now, so the session needs no bank after this. */
export function createSession(profile: ChildProfile, seed: number, options: SessionOptions = {}): Session {
  if (!Number.isInteger(seed)) throw new Error("The seed must be a whole number");
  const bank = options.bank ?? SAMPLE_BANK;
  const band = bandFor(profile.grade);
  const grade = profile.grade as Level;
  const seen = new Set<string>();
  const stage1 = buildStage(bank, profile, band.strands, grade, band.stage1, seed, "s1", seen);
  const rest = band.length - band.stage1;
  // Each form only needs to differ from stage 1, not from the forms the child never sees.
  const form = (route: Route, level: number) => buildStage(bank, profile, band.strands, level as Level, rest, seed, route, new Set(seen));
  return {
    profile,
    seed,
    stage1,
    stage2: { up: form("up", grade + 1), stay: form("stay", grade), down: form("down", grade - 1) },
    route: null,
    answers: [],
  };
}

const asked = (session: Session): Question[] => (session.route ? [...session.stage1, ...session.stage2[session.route]] : session.stage1);

/** The next question to show, or null when the test is complete. */
export function nextQuestion(session: Session): Question | null {
  return asked(session)[session.answers.length] ?? null;
}

const MINUS = /[−–]/g;
function asNumber(text: string): number | null {
  const clean = text.replace(MINUS, "-").replace(/[,\s]/g, "");
  return /^[-+]?(\d+\.?\d*|\.\d+)$/.test(clean) ? Number(clean) : null;
}

function same(q: Question, a: string, b: string): boolean {
  if (q.format === "number") {
    const [x, y] = [asNumber(a), asNumber(b)];
    return x !== null && y !== null && Math.abs(x - y) < 1e-9;
  }
  return a.trim() === b.trim();
}

function routeFor(correct: number, total: number): Route {
  if (atLeast(correct, total, ROUTE_UP_PERCENT)) return "up";
  if (atLeast(correct, total, ROUTE_DOWN_BELOW_PERCENT)) return "stay";
  return "down";
}

export interface Submission {
  questionId: string;
  response: string;
  /** Time on the question in milliseconds, measured by the caller. */
  timeMs: number;
}

/** Marks the answer to the current question and returns the updated session. */
export function submitAnswer(session: Session, submission: Submission): Session {
  const q = nextQuestion(session);
  if (!q) throw new Error("The test is already complete");
  if (submission.questionId !== q.id) throw new Error(`Expected an answer to ${q.id}, got ${submission.questionId}`);
  if (!Number.isFinite(submission.timeMs) || submission.timeMs < 0) throw new Error("timeMs must be a time in milliseconds");

  const correct = same(q, submission.response, q.answer);
  const answer: Answer = {
    questionId: q.id,
    response: submission.response,
    timeMs: submission.timeMs,
    correct,
    misconception: correct ? null : (q.wrong.find((w) => same(q, submission.response, w.value))?.misconception ?? null),
  };
  const answers = [...session.answers, answer];
  let route = session.route;
  if (answers.length === session.stage1.length) {
    route = routeFor(answers.filter((a) => a.correct).length, answers.length);
  }
  return { ...session, answers, route };
}

function statusFor(correct: number, total: number): StrandStatus {
  if (atLeast(correct, total, STRAND_SECURE_PERCENT)) return "secure";
  if (atLeast(correct, total, STRAND_DEVELOPING_PERCENT)) return "developing";
  return "needs-attention";
}

/** Scores a completed test. */
export function finish(session: Session): Placement {
  const questions = asked(session);
  if (!session.route || session.answers.length < questions.length) {
    throw new Error(`The test is not complete: ${session.answers.length} of ${questions.length} answered`);
  }
  const marked = questions.map((q, i) => ({ q, correct: session.answers[i].correct }));
  const tally = (items: typeof marked) => ({ correct: items.filter((m) => m.correct).length, total: items.length });

  const levels: LevelResult[] = [...new Set(marked.map((m) => m.q.level))]
    .sort((a, b) => a - b)
    .map((level) => ({ level, ...tally(marked.filter((m) => m.q.level === level)) }));
  const cleared = levels.filter((l) => l.total >= WORKING_LEVEL_MIN_QUESTIONS && atLeast(l.correct, l.total, WORKING_LEVEL_PERCENT));
  const highestSeen = levels[levels.length - 1].level;
  // No level cleared: the child works below everything the test showed them.
  const workingLevel = cleared.length > 0 ? cleared[cleared.length - 1].level : (Math.max(0, levels[0].level - 1) as Level);

  const strands: StrandResult[] = bandFor(session.profile.grade)
    .strands.map((strand) => ({ strand, ...tally(marked.filter((m) => REPORTED_STRAND[m.q.strand] === strand)) }))
    .filter((s) => s.total > 0)
    .map((s) => ({ ...s, status: statusFor(s.correct, s.total) }));

  return {
    grade: session.profile.grade,
    province: session.profile.province,
    scoredAgainst: scoredAgainst(session.profile.province),
    workingLevel,
    confidence: cleared.length > 0 ? "normal" : "low",
    atCeiling: cleared.length > 0 && workingLevel === highestSeen,
    route: session.route,
    stage1: tally(marked.slice(0, session.stage1.length)),
    levels,
    strands,
    facts: null,
    flags: [],
  };
}
