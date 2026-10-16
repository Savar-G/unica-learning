// The assessment session: pure functions over plain data.
// No network, database, clock or Math.random: the caller passes the seed and every time value.
import {
  REPORTED_STRAND,
  ROUTE_DOWN_BELOW_PERCENT,
  ROUTE_UP_PERCENT,
  WORKING_LEVEL_PERCENT,
  atLeast,
  bandFor,
} from "./constants";
import { levelCertainty, strandCertainty, strandStatus, workingLevelOf } from "./certainty";
import { bankFor } from "./bank";
import { factsResult, type FactsSession } from "./facts";
import { flagsFor, type HelpAnswer } from "./flags";
import { rngFor } from "./rng";
import type {
  Answer,
  ChildProfile,
  Level,
  LevelResult,
  Placement,
  Province,
  PublicQuestion,
  Question,
  ReportedStrand,
  Route,
  Session,
  StrandResult,
  StoredTest,
  TaggedProvince,
  Template,
  TestStep,
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
    ...(filled.say ? { say: filled.say } : {}),
    ...(filled.figure ? { figure: filled.figure } : {}),
    values: filled.values,
    answer: filled.answer,
    wrong: filled.wrong,
  };
}

/** What the browser may see: no answer and no coded wrong answers. */
export function toPublicQuestion(q: Question): PublicQuestion {
  const { id, level, strand, format, whiteboard, prompt, readAloud, choices, say, figure } = q;
  // Do not expose the server's correct-answer-first map order or speech for undisplayed choices.
  const publicSay = say && format === "choice"
    ? Object.fromEntries([...(choices ?? [])].sort().filter((choice) => Object.hasOwn(say, choice)).map((choice) => [choice, say[choice]]))
    : undefined;
  return { id, level, strand, format, whiteboard, showWork: q.showWork === true, prompt, readAloud, choices, ...(publicSay ? { say: publicSay } : {}), ...(figure ? { figure } : {}) };
}

export interface SessionOptions {
  /** The question bank. Defaults to the bank for the child's grade band (bank/index.ts). */
  bank?: readonly Template[];
}

/** Two questions with this key look the same to the child. */
// A drawn figure (#79) is part of the question: two bar graphs with the same words are different questions.
const sameQuestion = (q: Question) => `${q.prompt}|${[...(q.choices ?? [])].sort().join("|")}|${q.figure ? JSON.stringify(q.figure) : ""}`;

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

/** How many questions have a template that suits required shown work (Template.whiteboard). */
const countSuited = (questions: readonly Question[]) => questions.filter((q) => q.whiteboard).length;

// Marks `count` questions of one stage as "show your work" (#67). The template's flag means "may be required": the
// seed picks `count` of the flagged questions. If the stage has too few, typed-number questions fill the rest, then
// any question, so every route keeps the band's count.
function markShownWork(questions: Question[], count: number, seed: number, label: string): Question[] {
  const rng = rngFor(seed, `work:${label}`);
  const order = [
    ...rng.shuffle(questions.filter((q) => q.whiteboard)),
    ...rng.shuffle(questions.filter((q) => !q.whiteboard && q.format === "number")),
    ...rng.shuffle(questions.filter((q) => !q.whiteboard && q.format !== "number")),
  ];
  const chosen = new Set(order.slice(0, count).map((q) => q.id));
  return questions.map((q) => ({ ...q, showWork: chosen.has(q.id) }));
}

/**
 * How many of the band's shown-work questions go in stage 1; each stage 2 form gets the rest, so every route has the
 * same count. Half in each stage, moved toward the stage with more suited questions when the other runs short.
 */
function shownWorkInStage1(total: number, stage1: readonly Question[], forms: readonly (readonly Question[])[]): number {
  const suitedInStage1 = countSuited(stage1);
  const suitedInForms = Math.min(...forms.map(countSuited));
  let count = Math.ceil(total / 2);
  if (count > suitedInStage1) count = Math.max(suitedInStage1, total - suitedInForms);
  else if (total - count > suitedInForms) count = Math.min(suitedInStage1, total - suitedInForms);
  return Math.min(Math.max(count, 0), total, stage1.length);
}

/** Starts a test. Every stage 2 form is drawn now, so the session needs no bank after this. */
export function createSession(profile: ChildProfile, seed: number, options: SessionOptions = {}): Session {
  if (!Number.isInteger(seed)) throw new Error("The seed must be a whole number");
  const bank = options.bank ?? bankFor(profile.grade);
  const band = bandFor(profile.grade);
  const grade = profile.grade as Level;
  const seen = new Set<string>();
  const stage1 = buildStage(bank, profile, band.strands, grade, band.stage1, seed, "s1", seen);
  const rest = band.length - band.stage1;
  // Each form only needs to differ from stage 1, not from the forms the child never sees.
  const stage2Form = (route: Route, level: number) => buildStage(bank, profile, band.strands, level as Level, rest, seed, route, new Set(seen));
  const stage2 = { up: stage2Form("up", grade + 1), stay: stage2Form("stay", grade), down: stage2Form("down", grade - 1) };

  // #67: exactly band.whiteboardRequired show-your-work questions on every route.
  const inStage1 = shownWorkInStage1(band.whiteboardRequired, stage1, Object.values(stage2));
  const mark = (route: Route) => markShownWork(stage2[route], band.whiteboardRequired - inStage1, seed, route);
  return {
    profile,
    seed,
    stage1: markShownWork(stage1, inStage1, seed, "s1"),
    stage2: { up: mark("up"), stay: mark("stay"), down: mark("down") },
    route: null,
    answers: [],
  };
}

/** Stage 1, then the stage 2 form the child was routed to. */
const questionsOnRoute = (session: Session): Question[] =>
  session.route ? [...session.stage1, ...session.stage2[session.route]] : session.stage1;

/** The next question to show, or null when the test is complete. */
export function nextQuestion(session: Session): Question | null {
  return questionsOnRoute(session)[session.answers.length] ?? null;
}

const MINUS = /[−–]/g;
// Commas only as thousands separators: "1,200" is 1200, "1,2,0,0" is not a number.
const NUMBER = /^[-+]?(\d{1,3}(,\d{3})+|\d+)?(\.\d+)?$/;
function asNumber(text: string): number | null {
  const clean = text.replace(MINUS, "-").replace(/\s/g, "");
  return /\d/.test(clean) && NUMBER.test(clean) ? Number(clean.replace(/,/g, "")) : null;
}

function isSameAnswer(q: Question, a: string, b: string): boolean {
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

  const correct = isSameAnswer(q, submission.response, q.answer);
  const misconception = correct ? null : (q.wrong.find((w) => isSameAnswer(q, submission.response, w.value))?.misconception ?? null);
  const answer: Answer = {
    questionId: q.id,
    response: submission.response,
    timeMs: submission.timeMs,
    correct,
    // Tests started before this ID was shortened must also satisfy the answer table's 20-character limit.
    misconception: misconception === "compensation-direction" ? "compensation-dir" : misconception,
  };
  const answers = [...session.answers, answer];
  let route = session.route;
  if (answers.length === session.stage1.length) {
    route = routeFor(answers.filter((a) => a.correct).length, answers.length);
  }
  return { ...session, answers, route };
}

/** The part of a session the server stores when the test starts. The answers are stored one row at a time. */
export function storedTest(session: Session): StoredTest {
  const { profile, seed, stage1, stage2 } = session;
  return { profile, seed, stage1, stage2 };
}

/** Rebuilds a session from the stored test and the answers in the order given, marking each one again. */
export function restoreSession(stored: StoredTest, submissions: readonly Submission[]): Session {
  const start: Session = { ...stored, route: null, answers: [] };
  return submissions.reduce((session, { questionId, response, timeMs }) => submitAnswer(session, { questionId, response, timeMs }), start);
}

/** What the browser gets next: the current question without its answer, or "complete". */
export function testStep(session: Session): TestStep {
  const { length: total, stage1: breakAfter } = bandFor(session.profile.grade);
  const q = nextQuestion(session);
  return q
    ? { status: "question", question: toPublicQuestion(q), number: session.answers.length + 1, total, breakAfter }
    : { status: "complete", total };
}

/** True on the first question after halfway: the browser shows the skippable break screen before it (D-083). */
export const breakDue = (step: TestStep): boolean => step.status === "question" && step.number === step.breakAfter + 1;

/**
 * Scores a completed test. The facts section (#70), when the child had one, goes beside it and never changes the working level.
 * `help` is the child's answer to "Did anyone help?" (#71), or null when it was not asked. It only adds flags.
 */
export function finish(session: Session, facts: FactsSession | null = null, help: HelpAnswer | null = null): Placement {
  const questions = questionsOnRoute(session);
  if (!session.route || session.answers.length < questions.length) {
    throw new Error(`The test is not complete: ${session.answers.length} of ${questions.length} answered`);
  }
  const marked = questions.map((q, i) => ({ q, correct: session.answers[i].correct }));
  const tally = (items: typeof marked) => ({ correct: items.filter((m) => m.correct).length, total: items.length });

  const levels: LevelResult[] = [...new Set(marked.map((m) => m.q.level))]
    .sort((a, b) => a - b)
    .map((level) => ({ level, ...tally(marked.filter((m) => m.q.level === level)) }));
  const workingLevel = workingLevelOf(levels);

  // An area's status counts only the questions at or below the school grade (D-084: never invent a weakness; decision
  // of 2026-10-11 on #65). Harder questions from a stage 2 routed up still count toward the working level above, but a
  // child who misses them is not weak in that area. An area with no such question gets no status and no count.
  const atOrBelowGrade = marked.filter((m) => m.q.level <= session.profile.grade);
  const strands: StrandResult[] = bandFor(session.profile.grade)
    .strands.map((strand) => ({ strand, ...tally(atOrBelowGrade.filter((m) => REPORTED_STRAND[m.q.strand] === strand)) }))
    .filter((s) => s.total > 0)
    .map((s) => ({ ...s, status: strandStatus(s.correct, s.total), certainty: strandCertainty(s.correct, s.total) }));

  return {
    grade: session.profile.grade,
    province: session.profile.province,
    scoredAgainst: scoredAgainst(session.profile.province),
    workingLevel,
    confidence: levels.some((l) => atLeast(l.correct, l.total, WORKING_LEVEL_PERCENT)) ? "normal" : "low",
    levelCertainty: levelCertainty(levels),
    // Only a child routed up who clears the higher level may work above what the test could show.
    atCeiling: session.route === "up" && workingLevel === session.profile.grade + 1,
    route: session.route,
    stage1: tally(marked.slice(0, session.stage1.length)),
    levels,
    strands,
    facts: facts ? factsResult(facts) : null,
    flags: flagsFor(session.answers, help),
  };
}
