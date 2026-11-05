// The assessment session: pure functions over plain data.
// No network, database, clock or Math.random: the caller passes the seed and every time value.
import {
  QUESTION_TIME_CAP_MS,
  REPORTED_STRAND,
  ROUTE_DOWN_BELOW_PERCENT,
  ROUTE_UP_PERCENT,
  STAGE3_DOWN_BELOW_PERCENT,
  STAGE3_UP_PERCENT,
  STRAND_MINIMUM_QUESTIONS,
  WORKING_LEVEL_PERCENT,
  atLeast,
  bandFor,
} from "./constants";
import { levelCertainty, strandCertainty, strandStatus, workingLevelOf } from "./certainty";
import type { AreaAnswer } from "./area-level";
import { ALL_TEMPLATES, bankFor, difficultyOf } from "./bank";
import { downLevel, stage3Level, startLevel, upLevel } from "./grades";
import { factsResult, type FactsSession } from "./facts";
import { flagsFor, type HelpAnswer } from "./flags";
import { leftOutOfScore, paceOf, takeYourTime } from "./rushing";
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
  Stage3Direction,
  Stage3Route,
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
  fallDown = false,
): Question[] {
  if (scoredAgainst(profile.province) === "BC") {
    return buildBcStage(bank, profile, strands, level, count, seed, label, seen, previous, fallDown);
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
// `fallDown` (D-156): when a strand has no unused template left at `level`, its slot takes an unused template of the
// same strand from the nearest level below. Only the second same-level form of a Grade 8 test (level 8, D-153 rule 2) or
// a Grade 9 test (level 9) may use it. Since D-158 the bank has enough level 8 and level 9 templates that a BC test never
// needs it; it stays as a guard so a later retag cannot break a test.
function buildBcStage(
  bank: readonly Template[], profile: ChildProfile, strands: readonly ReportedStrand[],
  level: Level, count: number, seed: number, label: string, seen: Set<string>, previous: readonly Question[],
  fallDown = false,
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
  const poolAt = (strand: ReportedStrand, at: Level) =>
    rng.shuffle(bank.filter((t) => REPORTED_STRAND[t.strand] === strand && levelFor(t, profile.province) === at));
  const pools = strands.map((strand) => ({ strand, templates: poolAt(strand, level) })).filter((p) => p.templates.length > 0);
  if (!pools.length) throw new Error(`The question bank has no level ${level} questions for grade ${profile.grade} (${strands.join(", ")})`);
  // The lower pools for fallDown, each drawn once, when first needed.
  const lower = new Map<string, Template[]>();
  const unusedFor = (pool: (typeof pools)[number]): Template[] => {
    const here = pool.templates.filter((t) => !used.has(t.id));
    if (here.length || !fallDown) return here;
    for (let at = level - 1; at >= 0; at--) {
      const id = `${pool.strand}:${at}`;
      if (!lower.has(id)) lower.set(id, poolAt(pool.strand, at as Level));
      const below = lower.get(id)!.filter((t) => !used.has(t.id));
      if (below.length) return below;
    }
    return [];
  };
  const questions: Question[] = [];
  for (let i = 0; i < count; i++) {
    const pool = pools[i % pools.length];
    const available = unusedFor(pool);
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
// slot when that level has no strand pool (for example, fractions start at grade 3). The school grade here is the start
// level, the school grade itself (D-158).
function withStrandMinimum(
  bank: readonly Template[], profile: ChildProfile, strands: readonly ReportedStrand[],
  stage1: readonly Question[], form: Question[], route: Route, seed: number,
): Question[] {
  const top = startLevel(profile.grade);
  const questions = [...stage1, ...form];
  const counts = new Map(strands.map((strand) => [strand, questions.filter((q) => q.level <= top && REPORTED_STRAND[q.strand] === strand).length]));
  const seen = new Set(questions.map(sameQuestion));
  const result = [...form];
  for (const strand of strands) {
    const missing = Math.max(0, STRAND_MINIMUM_QUESTIONS - counts.get(strand)!);
    if (!missing) continue;
    const used = new Set([...stage1, ...result].map((q) => q.templateId));
    const pools = new Map<Level, Set<string>>();
    for (const template of bank) {
      const level = levelFor(template, profile.province);
      if (REPORTED_STRAND[template.strand] !== strand || level > top || used.has(template.id)) continue;
      const pool = pools.get(level) ?? new Set<string>();
      pool.add(template.id);
      pools.set(level, pool);
    }
    const level = route === "up" ? top
      : [...pools.keys()].sort((a, b) => a - b).find((level) => pools.get(level)!.size >= missing);
    if (level === undefined) throw new Error(`The BC question bank has too few unused templates at or below grade ${top} for ${strand}`);
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

const DIFFICULTY_RANK = { easy: 0, medium: 1, hard: 2 } as const;

/**
 * D-282: a stage in the order the child gets it: easy to hard, so a child settles in on the easiest questions. Lower
 * levels come first, as the school-grade questions of an up form, then easy, medium and hard. Inside each rating the
 * questions keep their turns through the areas. A question keeps its numbers, and takes the id of its new place, so
 * "s1-0" is still the first question of stage 1.
 */
const easyToHard = (questions: readonly Question[], label: string): Question[] =>
  questions
    .map((q, i) => ({ q, i, rank: DIFFICULTY_RANK[difficultyOf(q.templateId)] }))
    .sort((a, b) => a.q.level - b.q.level || a.rank - b.rank || a.i - b.i)
    .map(({ q }, i) => ({ ...q, id: `${label}-${i}` }));

/**
 * D-282: a third stage form: another grade past the stage 2 form of this route, or none where the bank has no such grade
 * or too few of its questions (no strand minimum: its questions are for the working level). It draws from every band.
 */
function stage3Form(
  bank: readonly Template[], profile: ChildProfile, direction: Stage3Direction, seed: number, seen: Set<string>, previous: readonly Question[],
): Question[] {
  const level = stage3Level(profile.grade, direction);
  if (level === null) return [];
  const band = bandFor(profile.grade);
  try {
    return buildStage(bank, profile, band.strands, level, band.stage3, seed, `s3${direction}`, new Set(seen), previous);
  } catch {
    // A bank gap costs the child this stage, never the test. A test in session.test.ts holds every BC form to full size.
    return [];
  }
}

/**
 * Starts a test. Every stage 2 and stage 3 form is drawn now, so the session needs no bank after this.
 * Stage 1 is at the school grade (D-158). The routed forms stay inside the bank: a Kindergarten child's down form is at
 * level K, like stay; a Grade 8 child's up form is at level 8, like stay (D-153 rule 2: never grade 9); and a Grade 9
 * child's up form is at level 9, like stay, with level 8 for down.
 */
export function createSession(profile: ChildProfile, seed: number, options: SessionOptions = {}): Session {
  if (!Number.isInteger(seed)) throw new Error("The seed must be a whole number");
  const bank = options.bank ?? bankFor(profile.grade);
  const band = bandFor(profile.grade);
  const start = startLevel(profile.grade);
  const seen = new Set<string>();
  const stage1 = buildStage(bank, profile, band.strands, start, band.stage1, seed, "s1", seen);
  const rest = band.length - band.stage1;
  // Each form only needs to differ from stage 1, not from the forms the child never sees.
  const stage2Form = (route: Route, level: Level) => {
    const fallDown = level === start && upLevel(profile.grade) === start;
    const form = buildStage(bank, profile, band.strands, level, rest, seed, route, new Set(seen), stage1, fallDown);
    return scoredAgainst(profile.province) === "BC"
      ? withStrandMinimum(bank, profile, band.strands, stage1, form, route, seed)
      : form;
  };
  const stage2 = { up: stage2Form("up", upLevel(profile.grade)), stay: stage2Form("stay", start), down: stage2Form("down", downLevel(profile.grade)) };

  // #67: exactly band.whiteboardRequired show-your-work questions on every route.
  const inStage1 = shownWorkInStage1(band.whiteboardRequired, stage1, Object.values(stage2));
  const mark = (route: Route) => easyToHard(markShownWork(stage2[route], band.whiteboardRequired - inStage1, seed, route), route);
  // D-282: a third stage asks no question its route already asked. Shown work stays the band's count on every route.
  const third = (direction: Stage3Direction) =>
    easyToHard(stage3Form(options.bank ?? ALL_TEMPLATES, profile, direction, seed, new Set([...stage1, ...stage2[direction]].map(sameQuestion)), [...stage1, ...stage2[direction]]), `s3${direction}`);
  return {
    profile,
    seed,
    stage1: easyToHard(markShownWork(stage1, inStage1, seed, "s1"), "s1"),
    stage2: { up: mark("up"), stay: mark("stay"), down: mark("down") },
    stage3: { up: third("up"), down: third("down") },
    route: null,
    stage3Route: null,
    answers: [],
  };
}

/** D-282: the third stage this lock record means, or none: "none", no record yet, and a test from before D-282. */
const thirdStage = (test: StoredTest, stage3Route: Stage3Route | null | undefined): Question[] =>
  stage3Route === "up" || stage3Route === "down" ? test.stage3?.[stage3Route] ?? [] : [];

/** The questions a child gets, in order: stage 1, the stage 2 form of the route, then the third stage (D-282). */
export const givenQuestions = (test: StoredTest, route: Route | null, stage3Route?: Stage3Route | null): Question[] =>
  route ? [...test.stage1, ...test.stage2[route], ...thirdStage(test, stage3Route)] : test.stage1;

/** Every question a stored test holds, also the forms the child never got. */
export const everyQuestion = (test: StoredTest): Question[] => [
  ...test.stage1, ...test.stage2.up, ...test.stage2.stay, ...test.stage2.down, ...(test.stage3?.up ?? []), ...(test.stage3?.down ?? []),
];

const questionsOnRoute = (session: Session): Question[] => givenQuestions(session, session.route, session.stage3Route);

/**
 * D-282: true when every stage 2 answer is in and stage 2 must lock before the test goes on: the route has a third stage
 * form, and no lock record is stored. A stay route and a test from before D-282 never wait: they end after stage 2.
 */
export function stage3Due(session: Session): boolean {
  const { route } = session;
  if (!route || route === "stay" || session.stage3Route != null || !session.stage3?.[route]?.length) return false;
  return session.answers.length >= session.stage1.length + session.stage2[route].length;
}

/** The next question to show, or null when the test is complete. */
export function nextQuestion(session: Session): Question | null {
  return questionsOnRoute(session)[session.answers.length] ?? null;
}

/** True when every question of the routed test has an answer: the test only waits to be scored. */
export const allAnswered = (session: Session): boolean => session.route !== null && session.answers.length >= questionsOnRoute(session).length;

/**
 * D-145: the optional extra round (#190, D-116) is removed, and migration drop_extra_round_data deleted its answers,
 * serves and stored parts. Its question ids were x-0, x-1 and so on (the main test's are s1-, up-, stay- and down-).
 * Two stored learner profiles still name such questions, so every read keeps leaving them out with this rule.
 */
export const fromRemovedRound = (questionId: string): boolean => questionId.startsWith("x-");

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

/**
 * D-282: the third stage from the final stage 2 answers. Only the questions at the form's own level count: an up form
 * also holds school-grade questions (#188), and those do not show that a child can work two grades up.
 */
function stage3RouteFor(session: Session): Stage3Route {
  const { route, profile, stage1, stage2, answers } = session;
  if (route !== "up" && route !== "down") return "none";
  const level = route === "up" ? upLevel(profile.grade) : downLevel(profile.grade);
  const scored = stage2[route].flatMap((q, i) => (q.level === level ? [answers[stage1.length + i]] : []));
  if (!scored.length) return "none";
  const correct = scored.filter((a) => a.correct).length;
  const goesOn = route === "up"
    ? atLeast(correct, scored.length, STAGE3_UP_PERCENT)
    : !atLeast(correct, scored.length, STAGE3_DOWN_BELOW_PERCENT);
  return goesOn ? route : "none";
}

/**
 * D-282: "Done checking" on the stage 2 grid of a test with a third stage form locks stage 2: the third stage is set from
 * the final stage 2 answers, and stage 2 never opens again. Throws unless stage 2 waits on this lock (stage3Due).
 */
export function lockStage2(session: Session): Session {
  if (!stage3Due(session)) throw new Error("Stage 2 locks only when every stage 2 question is answered and it has no lock record");
  return { ...session, stage3Route: stage3RouteFor(session) };
}

/** #249: the parts of a test the child can go back in: stage 1, stage 2 (the routed form) and stage 3 (D-282). */
export type SectionName = "stage1" | "stage2" | "stage3";

/** #249: an answered question of a section: its place in the test (from 0), the question and the child's answer. */
export interface SectionAnswer {
  position: number;
  question: Question;
  answer: Answer;
}

/**
 * #249: the section the child works in now, from `first` to `end` (places in the test, `end` not included), with its
 * answered questions in order. Stage 1 until it is locked (lockStage1 routes the test, #253), then stage 2, then the
 * third stage when stage 2 locked into one (D-282). The test attempt module closes the last section at the finish.
 */
export interface OpenSection {
  name: SectionName;
  first: number;
  end: number;
  answered: SectionAnswer[];
}

export function openSection(session: Session): OpenSection {
  const questions = questionsOnRoute(session);
  const third = thirdStage(session, session.stage3Route).length;
  const [name, first, end]: [SectionName, number, number] = !session.route
    ? ["stage1", 0, session.stage1.length]
    : third
      ? ["stage3", questions.length - third, questions.length]
      : ["stage2", session.stage1.length, questions.length];
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
  const { profile, seed, stage1, stage2, stage3 } = session;
  return { profile, seed, stage1, stage2, ...(stage3 && { stage3 }) };
}

/**
 * Rebuilds a session from the stored test and the answers in the order given, marking each one again. #253: `route` is
 * the stored route, the stage 1 lock record: stage 1 is locked when it is stored. A test with answers past stage 1 and
 * no stored route (one from before the lock, whose route save failed) is past stage 1, routed by its stage 1 answers.
 * With every stage 1 answer and no stored route, stage 1 is open on its grid. Throws for a route without every stage 1
 * answer. `stage3Route` is the stored stage 2 lock record (D-282). D-145: only the main test's fields are read; a stored
 * `extra` (the removed round, #190) is left behind.
 */
export function restoreSession(stored: StoredTest, submissions: readonly Submission[], route: Route | null = null, stage3Route: Stage3Route | null = null): Session {
  const { profile, seed, stage1, stage2, stage3 } = stored;
  let session: Session = { profile, seed, stage1, stage2, ...(stage3 && { stage3 }), route: null, stage3Route, answers: [] };
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
 * How many questions a stored test has once it is routed: stage 1 plus the stored form of its route, plus the third stage
 * once stage 2 locked into one (D-282). The up route is longer than the grade band's length (#188), so the band is only
 * the answer while the route is not chosen yet.
 */
export function testLength(test: StoredTest, route: Route | null, stage3Route?: Stage3Route | null): number {
  return route ? givenQuestions(test, route, stage3Route).length : bandFor(test.profile.grade).length;
}

/** What the browser gets next: the current question without its answer, the stage 1 grid (#253), or "complete". */
export function testStep(session: Session): TestStep {
  const breakAfter = session.stage1.length;
  // Before routing, use the longest stored form. Once routed, the exact stored form is authoritative.
  const main = session.route
    ? testLength(session, session.route, session.stage3Route)
    : breakAfter + Math.max(...Object.values(session.stage2).map((form) => form.length));
  const total = main;
  // #253: every stage 1 question is answered and stage 1 is not locked: the child checks it on the grid.
  if (!session.route && session.answers.length === breakAfter) {
    return { status: "check", section: "stage1", numbers: Array.from({ length: breakAfter }, (_, i) => i + 1), total, breakAfter };
  }
  // D-282: every stage 2 answer is in and a third stage may come: the grid first, and its lock decides.
  if (stage3Due(session)) {
    const first = breakAfter + 1;
    return { status: "check", section: "stage2", numbers: Array.from({ length: session.answers.length - breakAfter }, (_, i) => first + i), total, breakAfter };
  }
  const q = nextQuestion(session);
  if (!q) return { status: "complete", total };
  const number = session.answers.length + 1;
  const third = thirdStage(session, session.stage3Route).length;
  return {
    status: "question",
    question: toPublicQuestion(q),
    number,
    total,
    breakAfter,
    takeYourTime: takeYourTime(session.answers),
    ...(third > 0 ? { stage3After: total - third } : {}),
  };
}

/** True on the first question after halfway: the browser shows the skippable break screen before it (D-083). */
export const breakDue = (step: TestStep): boolean => step.status === "question" && step.number === step.breakAfter + 1;

/**
 * A completed test's answers for the area rule (D-243): one per question, with what `finish` leaves out of the score
 * (a very fast wrong answer in a run, #189) left out here too.
 */
export function testAreaAnswers(session: Session): AreaAnswer[] {
  const questions = questionsOnRoute(session);
  if (!session.route || session.answers.length < questions.length) {
    throw new Error(`The test is not complete: ${session.answers.length} of ${questions.length} answered`);
  }
  const out = leftOutOfScore(session.answers);
  return questions.flatMap((q, i) => (out[i] ? [] : [{ area: REPORTED_STRAND[q.strand], level: q.level, correct: session.answers[i].correct }]));
}

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
    // Only a child routed up who clears the highest level asked may work above what the test could show. For Grade 8 the
    // up form is at level 8 (D-153 rule 2) and for Grade 9 at level 9, the top of the bank, so clearing it is the ceiling.
    // D-282: with a third stage up, the highest level asked is the third stage's.
    atCeiling: session.route === "up" && workingLevel === (session.stage3Route === "up" ? stage3Level(session.profile.grade, "up") : upLevel(session.profile.grade)),
    route: session.route,
    ...(session.stage3Route && { stage3Route: session.stage3Route }),
    stage1: tally(marked.slice(0, session.stage1.length)),
    levels,
    strands,
    facts: facts ? factsResult(facts) : null,
    flags: flagsFor(session.answers, help),
    pace: paceOf(session.answers),
  };
}
