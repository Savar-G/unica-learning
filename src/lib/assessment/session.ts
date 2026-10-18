// The assessment session: pure functions over plain data.
// No network, database, clock or Math.random: the caller passes the seed and every time value.
import {
  QUESTION_TIME_CAP_MS,
  REPORTED_STRAND,
  ROUTE_DOWN_BELOW_PERCENT,
  ROUTE_UP_PERCENT,
  STRAND_MINIMUM_QUESTIONS,
  WORKING_LEVEL_PERCENT,
  atLeast,
  bandFor,
} from "./constants";
import { levelCertainty, strandCertainty, strandStatus, workingLevelOf } from "./certainty";
import { bankFor } from "./bank";
import { factsResult, type FactsSession } from "./facts";
import { flagsFor, type HelpAnswer } from "./flags";
import { leftOutOfScore, paceOf, takeYourTime } from "./rushing";
import { rngFor } from "./rng";
import type {
  Answer,
  ChildProfile,
  ExtraRoundOffer,
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
export const sameQuestion = (q: Question) => `${q.prompt}|${[...(q.choices ?? [])].sort().join("|")}|${q.figure ? JSON.stringify(q.figure) : ""}`;

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
  previous: readonly Question[] = [],
): Question[] {
  if (scoredAgainst(profile.province) === "BC") {
    return buildBcStage(bank, profile, strands, level, count, seed, label, seen, previous);
  }
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

// A route keeps one template history and one standard tally across both stages. Exhausted
// standards leave the rotation; another available standard must take its turn before a repeat.
function buildBcStage(
  bank: readonly Template[], profile: ChildProfile, strands: readonly ReportedStrand[],
  level: Level, count: number, seed: number, label: string, seen: Set<string>, previous: readonly Question[],
): Question[] {
  const rng = rngFor(seed, `stage:${label}`);
  const used = new Set(previous.map((q) => q.templateId));
  const byId = new Map(bank.map((t) => [t.id, t]));
  const standardUses = new Map<string, number>();
  const key = (t: Template) => `${REPORTED_STRAND[t.strand]}:${t.standard}`;
  for (const q of previous) {
    const t = byId.get(q.templateId);
    if (t) standardUses.set(key(t), (standardUses.get(key(t)) ?? 0) + 1);
  }
  const pools = strands.map((strand) => ({
    strand,
    templates: rng.shuffle(bank.filter((t) => REPORTED_STRAND[t.strand] === strand && levelFor(t, profile.province) === level)),
  })).filter((p) => p.templates.length > 0);
  if (!pools.length) throw new Error(`The question bank has no level ${level} questions for grade ${profile.grade} (${strands.join(", ")})`);
  const questions: Question[] = [];
  for (let i = 0; i < count; i++) {
    const pool = pools[i % pools.length];
    const available = pool.templates.filter((t) => !used.has(t.id));
    const least = Math.min(...available.map((t) => standardUses.get(key(t)) ?? 0));
    const template = available.find((t) => (standardUses.get(key(t)) ?? 0) === least);
    if (!template) throw new Error(`The BC question bank has too few unused templates at level ${level} for ${pool.strand}`);
    used.add(template.id);
    standardUses.set(key(template), least + 1);
    const id = `${label}-${i}`;
    let q = fillTemplate(template, seed, profile.province, id);
    for (let retry = 1; seen.has(sameQuestion(q)) && retry < 20; retry++) {
      q = { ...fillTemplate(template, seed, profile.province, `${id}.${retry}`), id };
    }
    seen.add(sameQuestion(q));
    questions.push(q);
  }
  return questions;
}

// BC strand evidence is at or below school grade. Up adds those questions; down replaces a routed
// slot when that level has no strand pool (for example, fractions start at grade 3).
function withStrandMinimum(
  bank: readonly Template[], profile: ChildProfile, strands: readonly ReportedStrand[],
  stage1: readonly Question[], form: Question[], route: Route, seed: number,
): Question[] {
  const questions = [...stage1, ...form];
  const counts = new Map(strands.map((strand) => [strand, questions.filter((q) => q.level <= profile.grade && REPORTED_STRAND[q.strand] === strand).length]));
  const seen = new Set(questions.map(sameQuestion));
  const result = [...form];
  for (const strand of strands) {
    const missing = Math.max(0, STRAND_MINIMUM_QUESTIONS - counts.get(strand)!);
    if (!missing) continue;
    const used = new Set([...stage1, ...result].map((q) => q.templateId));
    const pools = new Map<Level, Set<string>>();
    for (const template of bank) {
      const level = levelFor(template, profile.province);
      if (REPORTED_STRAND[template.strand] !== strand || level > profile.grade || used.has(template.id)) continue;
      const pool = pools.get(level) ?? new Set<string>();
      pool.add(template.id);
      pools.set(level, pool);
    }
    const level = route === "up" ? profile.grade as Level
      : [...pools.keys()].sort((a, b) => a - b).find((level) => pools.get(level)!.size >= missing);
    if (level === undefined) throw new Error(`The BC question bank has too few unused templates at or below grade ${profile.grade} for ${strand}`);
    const added = buildStage(bank, profile, [strand], level, missing, seed, `${route}-${strand}`, seen, [...stage1, ...result]);
    for (const q of added) {
      if (route === "up") result.push(q);
      else {
        const index = result.findLastIndex((old) => counts.get(REPORTED_STRAND[old.strand])! > STRAND_MINIMUM_QUESTIONS);
        if (index < 0) throw new Error("The routed form has no slot for the strand minimum");
        const replaced = REPORTED_STRAND[result[index].strand];
        counts.set(replaced, counts.get(replaced)! - 1);
        result[index] = q;
      }
      counts.set(strand, counts.get(strand)! + 1);
    }
  }
  return result;
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
  const stage2Form = (route: Route, level: number) => {
    const form = buildStage(bank, profile, band.strands, level as Level, rest, seed, route, new Set(seen), stage1);
    return scoredAgainst(profile.province) === "BC"
      ? withStrandMinimum(bank, profile, band.strands, stage1, form, route, seed)
      : form;
  };
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

/** Stage 1, then the stage 2 form the child was routed to, then the extra round when the child took one (#190). */
const questionsOnRoute = (session: Session): Question[] =>
  session.route ? [...session.stage1, ...session.stage2[session.route], ...(session.extra ?? [])] : session.stage1;

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

/** The response marked against its question: right or wrong, and the misconception of a coded wrong answer. */
function marked(q: Question, response: string, timeMs: number): Answer {
  if (!Number.isFinite(timeMs) || timeMs < 0) throw new Error("timeMs must be a time in milliseconds");
  const correct = isSameAnswer(q, response, q.answer);
  const misconception = correct ? null : (q.wrong.find((w) => isSameAnswer(q, response, w.value))?.misconception ?? null);
  return {
    questionId: q.id,
    response,
    timeMs,
    correct,
    // Tests started before this ID was shortened must also satisfy the answer table's 20-character limit.
    misconception: misconception === "compensation-direction" ? "compensation-dir" : misconception,
  };
}

/**
 * Marks the answer to the current question and returns the updated session. #253: the last stage 1 answer sets no
 * route: the child checks stage 1 on its grid, and lockStage1 routes the test.
 */
export function submitAnswer(session: Session, submission: Submission): Session {
  const q = nextQuestion(session);
  if (!q) throw new Error("No question takes an answer now: the test is complete, or stage 1 waits on its lock");
  if (submission.questionId !== q.id) throw new Error(`Expected an answer to ${q.id}, got ${submission.questionId}`);
  return { ...session, answers: [...session.answers, marked(q, submission.response, submission.timeMs)] };
}

/**
 * #253: "Done checking" on the stage 1 grid locks stage 1: the route is set from the final stage 1 answers, and stage 1
 * never opens again. Throws before every stage 1 question is answered, and when stage 1 is already locked.
 */
export function lockStage1(session: Session): Session {
  if (session.route) throw new Error("Stage 1 is already locked");
  if (session.answers.length < session.stage1.length) throw new Error("Stage 1 locks only once every stage 1 question is answered");
  const stage1 = session.answers.slice(0, session.stage1.length);
  return { ...session, route: routeFor(stage1.filter((a) => a.correct).length, stage1.length) };
}

/** #249: the parts of a test the child can go back in: stage 1, stage 2 (the routed form), and the extra round (#190). */
export type SectionName = "stage1" | "stage2" | "extra";

/** #249: an answered question of a section: its place in the test (from 0), the question and the child's answer. */
export interface SectionAnswer {
  position: number;
  question: Question;
  answer: Answer;
}

/**
 * #249: the section the child works in now, from `first` to `end` (places in the test, `end` not included), with its
 * answered questions in order. Stage 1 until it is locked (lockStage1 routes the test, #253), then stage 2, then the
 * extra round once the child took one. The test attempt module closes a section that the test moved past by its own
 * records (the round's offer, the finish).
 */
export interface OpenSection {
  name: SectionName;
  first: number;
  end: number;
  answered: SectionAnswer[];
}

export function openSection(session: Session): OpenSection {
  const questions = questionsOnRoute(session);
  const main = session.route ? session.stage1.length + session.stage2[session.route].length : session.stage1.length;
  const [name, first, end]: [SectionName, number, number] = !session.route
    ? ["stage1", 0, session.stage1.length]
    : session.extra
      ? ["extra", main, questions.length]
      : ["stage2", session.stage1.length, main];
  const answered = session.answers.slice(first, end).map((answer, i) => ({ position: first + i, question: questions[first + i], answer }));
  return { name, first, end, answered };
}

/**
 * #249: changes the child's answer to an answered question of the open section, marks it again, and returns the
 * updated session. `timeMs` is the time of this visit: the answer's time becomes the total of every visit, up to
 * QUESTION_TIME_CAP_MS. Throws for a question that is not answered or not in the open section.
 */
export function changeAnswer(session: Session, change: Submission): Session {
  const at = openSection(session).answered.find((a) => a.question.id === change.questionId);
  if (!at) throw new Error(`${change.questionId} is not an answered question of the open section`);
  if (!Number.isFinite(change.timeMs) || change.timeMs < 0) throw new Error("timeMs must be a time in milliseconds");
  const answer = marked(at.question, change.response, Math.min(at.answer.timeMs + change.timeMs, QUESTION_TIME_CAP_MS));
  return { ...session, answers: session.answers.map((a, i) => (i === at.position ? answer : a)) };
}

/** The part of a session the server stores when the test starts. The answers are stored one row at a time. */
export function storedTest(session: Session): StoredTest {
  const { profile, seed, stage1, stage2, extra } = session;
  return { profile, seed, stage1, stage2, ...(extra ? { extra } : {}) };
}

/**
 * Rebuilds a session from the stored test and the answers in the order given, marking each one again. #253: `route` is
 * the stored route, the stage 1 lock record: stage 1 is locked when it is stored. A test with answers past stage 1 and
 * no stored route (one from before the lock, whose route save failed) is past stage 1, routed by its stage 1 answers.
 * With every stage 1 answer and no stored route, stage 1 is open on its grid. Throws for a route without every stage 1
 * answer.
 */
export function restoreSession(stored: StoredTest, submissions: readonly Submission[], route: Route | null = null): Session {
  let session: Session = { ...stored, route: null, answers: [] };
  for (const [i, { questionId, response, timeMs }] of submissions.entries()) {
    if (i === session.stage1.length) session = route ? { ...session, route } : lockStage1(session);
    session = submitAnswer(session, { questionId, response, timeMs });
  }
  if (route && !session.route) {
    if (session.answers.length < session.stage1.length) throw new Error("A stored route needs every stage 1 answer");
    session = { ...session, route };
  }
  return session;
}

/**
 * How many questions a stored test has once it is routed: stage 1 plus the stored form of its route. The up route is
 * longer than the grade band's length (#188), so the band is only the answer while the route is not chosen yet.
 */
export function testLength(test: StoredTest, route: Route | null): number {
  return route ? test.stage1.length + test.stage2[route].length : bandFor(test.profile.grade).length;
}

/** What the browser gets next: the current question without its answer, the stage 1 grid (#253), or "complete". */
export function testStep(session: Session): TestStep {
  const breakAfter = session.stage1.length;
  // Before routing, use the longest stored form. Once routed, the exact stored form is authoritative.
  const main = session.route
    ? testLength(session, session.route)
    : breakAfter + Math.max(...Object.values(session.stage2).map((form) => form.length));
  // #190: the extra round, when the child took one, comes after the main test and counts in its total.
  const extra = session.extra?.length ?? 0;
  const total = main + extra;
  // #253: every stage 1 question is answered and stage 1 is not locked: the child checks it on the grid.
  if (!session.route && session.answers.length === breakAfter) {
    return { status: "check", section: "stage1", numbers: Array.from({ length: breakAfter }, (_, i) => i + 1), total, breakAfter };
  }
  const q = nextQuestion(session);
  if (!q) return { status: "complete", total };
  const number = session.answers.length + 1;
  return {
    status: "question",
    question: toPublicQuestion(q),
    number,
    total,
    breakAfter,
    takeYourTime: takeYourTime(session.answers),
    ...(number > main ? { extra: { number: number - main, total: extra } } : {}),
  };
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
  // #189: a very fast wrong answer inside a run of very fast answers is a guess: it leaves the score, it is not wrong.
  // Every level the test showed keeps its place, even with all its answers left out. Routing is unchanged: it was decided
  // during the test.
  const out = leftOutOfScore(session.answers);
  const scored = marked.filter((_, i) => !out[i]);

  const levels: LevelResult[] = [...new Set(marked.map((m) => m.q.level))]
    .sort((a, b) => a - b)
    .map((level) => ({ level, ...tally(scored.filter((m) => m.q.level === level)) }));
  const workingLevel = workingLevelOf(levels);

  // An area's status counts only the questions at or below the school grade (D-084: never invent a weakness; decision
  // of 2026-10-11 on #65). Harder questions from a stage 2 routed up still count toward the working level above, but a
  // child who misses them is not weak in that area. An area with no such question gets no status and no count.
  const atOrBelowGrade = scored.filter((m) => m.q.level <= session.profile.grade);
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
    pace: paceOf(session.answers),
    // #190: the round's answers count above like main answers; this records that the result includes them.
    ...(session.extra?.length ? { extraRound: extraRoundRecord(session.profile.grade, session.extra) } : {}),
  };
}

/** #190: the extra round as the placement records it: its size and its areas, in band order. */
export function extraRoundRecord(grade: Session["profile"]["grade"], extra: readonly Question[]): ExtraRoundOffer {
  const covered = new Set(extra.map((q) => REPORTED_STRAND[q.strand]));
  return { questions: extra.length, strands: bandFor(grade).strands.filter((s) => covered.has(s)) };
}
