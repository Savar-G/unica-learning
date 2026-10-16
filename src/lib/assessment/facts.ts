// The timed facts section (#70): quick number facts, only the ones BC expects at the child's grade.
// Pure functions over plain data, like the session: the caller passes the seed and every time value.
// The server measures the times (ms since the section started), so the browser clock never decides when the time is up
// or which answers count. Each fact also keeps the browser's time on it, which the speed uses when it is there (#185).
import { atLeast } from "./constants";
import { rngFor, type Rng } from "./rng";
import type { ChildProfile, Grade } from "./types";

export type FactOp = "+" | "-" | "×" | "÷";

/** One fact family, with the BC grade that expects it (bc-math-curriculum-map.md, section 1). */
export type FactFamilyId = "add10" | "sub10" | "add20" | "sub20" | "mul2510" | "mul234510" | "mul100" | "div100";

/** One fact as the server holds it. */
export interface Fact {
  id: string;
  family: FactFamilyId;
  a: number;
  op: FactOp;
  b: number;
  answer: number;
}

interface FactFamily {
  /** The first BC grade that expects this family. */
  bcGrade: Grade;
  /** BC learning standard, for example "4.8". */
  standard: string;
  draw(rng: Rng): Pick<Fact, "a" | "op" | "b" | "answer">;
}

const add = (a: number, b: number) => ({ a, op: "+" as const, b, answer: a + b });
const sub = (a: number, b: number) => ({ a, op: "-" as const, b, answer: a - b });
const mul = (a: number, b: number) => ({ a, op: "×" as const, b, answer: a * b });
/** Either order: 7 × 5 and 5 × 7 are the same fact. */
const either = (rng: Rng, a: number, b: number) => (rng.int(0, 1) ? mul(a, b) : mul(b, a));

const FAMILIES: Record<FactFamilyId, FactFamily> = {
  // 1.3 addition and subtraction to 20 (understanding); facts to 10 come first (K-1, "ways to make 10").
  add10: { bcGrade: 1, standard: "1.3", draw: (rng) => { const a = rng.int(1, 9); return add(a, rng.int(1, 10 - a)); } },
  sub10: { bcGrade: 1, standard: "1.3", draw: (rng) => { const a = rng.int(2, 10); return sub(a, rng.int(1, a)); } },
  // 2.3 addition and subtraction facts to 20.
  add20: { bcGrade: 2, standard: "2.3", draw: (rng) => add(rng.int(2, 10), rng.int(2, 10)) },
  sub20: { bcGrade: 2, standard: "2.3", draw: (rng) => { const b = rng.int(2, 10); return sub(b + rng.int(2, 10), b); } },
  // 4.8: recall 2s, 5s and 10s by the end of grade 4. 3.5 says memorizing multiplication facts is not intended in grade 3.
  mul2510: { bcGrade: 4, standard: "4.8", draw: (rng) => either(rng, rng.pick([2, 5, 10]), rng.int(2, 10)) },
  // 5.9: recall many facts (2s, 3s, 4s, 5s, 10s) by the end of grade 5.
  mul234510: { bcGrade: 5, standard: "5.9", draw: (rng) => either(rng, rng.pick([2, 3, 4, 5, 10]), rng.int(2, 10)) },
  // 6.2 and 7.1: multiplication and division facts to 100 (10 × 10, never 12 × 12).
  mul100: { bcGrade: 6, standard: "6.2", draw: (rng) => mul(rng.int(2, 10), rng.int(2, 10)) },
  div100: { bcGrade: 6, standard: "6.2", draw: (rng) => { const b = rng.int(2, 10); const q = rng.int(2, 10); return { a: b * q, op: "÷" as const, b, answer: q }; } },
};

/** The fact families for each school grade: what BC expects at that grade, never above it. */
export const FACTS_BY_GRADE: Record<Grade, readonly FactFamilyId[]> = {
  1: ["add10", "sub10"],
  2: ["add20", "sub20"],
  3: ["add20", "sub20"],
  4: ["add20", "sub20", "mul2510"],
  5: ["add20", "sub20", "mul234510"],
  6: ["mul100", "div100"],
  7: ["mul100", "div100"],
};

/** How long the section lasts (spec: 60-90 seconds; DESIGN.md: 60). */
export const FACTS_SECONDS = 60;
/** An answer sent just before the end may reach the server this much later and still count. */
export const FACTS_LATE_MS = 3000;

/** Facts drawn for one section: more than any child answers in the time, so the section never runs out. */
export const FACTS_DRAWN = 90;
/** The same fact never comes back within this many facts. */
const NO_REPEAT_WITHIN = 8;

const key = (f: Pick<Fact, "a" | "op" | "b">) => `${f.a}${f.op}${f.b}`;

/** What the server stores when the section starts. Plain data. */
export interface FactsTest {
  grade: Grade;
  facts: Fact[];
}

export interface FactSubmission {
  factId: string;
  /** The typed answer. Empty means the child skipped the fact. */
  response: string;
  /** Milliseconds from the start of the section to when the server received the answer, measured by the server. */
  atMs: number;
  /**
   * #185: the time on this fact as the browser measured it, from when the fact appeared to when the child pressed
   * Enter. It leaves out the time the answer waited to be saved (#122). Absent or null when the screen sent none.
   */
  browserMs?: number | null;
}

export interface FactAnswer extends FactSubmission {
  correct: boolean;
  /** #185: the server's time on this fact: from the answer before it (or the start of the section) to this one's arrival. */
  serverMs: number;
  /** The browser's time on this fact, whole milliseconds, never more than `atMs`; null when there is none. */
  browserMs: number | null;
}

/**
 * The browser's time on a fact as the section keeps it: whole milliseconds, and never more than the time the section
 * had run when the answer arrived (the fact appeared after the start and was answered before its arrival). Null when
 * the browser sent no time, or something that is not a time.
 */
function browserTime(ms: number | null | undefined, atMs: number): number | null {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) return null;
  return Math.min(Math.round(ms), atMs);
}

/** The time on a fact for its speed: the browser's when there is one, else the server's (#185). */
const factTime = (a: FactAnswer) => a.browserMs ?? a.serverMs;

/** Plain data, so the server can store it and pick it up again. */
export interface FactsSession extends FactsTest {
  answers: FactAnswer[];
}

/** A fact as the browser receives it: no answer. */
export type PublicFact = Pick<Fact, "id" | "a" | "op" | "b">;

/**
 * The browser's facts screen. "ready" before the section starts; "running" with the facts still to come
 * (the browser shows them without a wait, so the time between answers is the child's, not the network's);
 * "done" when the time is up or every fact is answered. `answered` counts facts with an answer, not skips.
 */
export type FactsStep =
  | { status: "ready"; seconds: number }
  | { status: "running"; seconds: number; remainingMs: number; answered: number; facts: PublicFact[] }
  | { status: "done"; answered: number };

/** Draws the facts for a section. The same grade and seed always give the same facts; every province gets BC's facts. */
export function createFacts(profile: ChildProfile, seed: number): FactsSession {
  if (!Number.isInteger(seed)) throw new Error("The seed must be a whole number");
  const rng = rngFor(seed, "facts");
  const families = FACTS_BY_GRADE[profile.grade];
  const facts: Fact[] = [];
  for (let i = 0; i < FACTS_DRAWN; i++) {
    const family = families[i % families.length];
    let drawn = FAMILIES[family].draw(rng);
    const recent = new Set(facts.slice(-NO_REPEAT_WITHIN).map(key));
    for (let retry = 0; recent.has(key(drawn)) && retry < 20; retry++) drawn = FAMILIES[family].draw(rng);
    facts.push({ id: `f${i}`, family, ...drawn });
  }
  return { grade: profile.grade, facts, answers: [] };
}

const SECTION_MS = FACTS_SECONDS * 1000;
const isSkip = (response: string) => response.trim() === "";
const nextFact = (session: FactsSession): Fact | null => session.facts[session.answers.length] ?? null;

/** Marks the answer to the current fact. Throws when the time is up or the answer is for another fact. */
export function submitFact(session: FactsSession, submission: FactSubmission): FactsSession {
  const fact = nextFact(session);
  if (!fact) throw new Error("Every fact is answered");
  if (submission.factId !== fact.id) throw new Error(`Expected an answer to ${fact.id}, got ${submission.factId}`);
  const last = session.answers.at(-1)?.atMs ?? 0;
  if (!Number.isFinite(submission.atMs) || submission.atMs < last) throw new Error("atMs must be a time after the last answer");
  if (submission.atMs > SECTION_MS + FACTS_LATE_MS) throw new Error("The time is up");
  const response = submission.response.trim();
  const correct = /^\d+$/.test(response) && Number(response) === fact.answer;
  const { atMs } = submission;
  const answer: FactAnswer = { factId: fact.id, response, atMs, correct, serverMs: atMs - last, browserMs: browserTime(submission.browserMs, atMs) };
  return { ...session, answers: [...session.answers, answer] };
}

/** What the browser gets: the facts still to come and the time left, or "done". `elapsedMs` comes from the server. */
export function factsStep(session: FactsSession, elapsedMs: number): FactsStep {
  const answered = session.answers.filter((a) => !isSkip(a.response)).length;
  const remainingMs = SECTION_MS - elapsedMs;
  if (remainingMs <= 0 || !nextFact(session)) return { status: "done", answered };
  const facts = session.facts.slice(session.answers.length).map(({ id, a, op, b }) => ({ id, a, op, b }));
  return { status: "running", seconds: FACTS_SECONDS, remainingMs, answered, facts };
}

/** The part of a section the server stores when it starts. The answers are stored one row at a time. */
export function storedFacts(session: FactsSession): FactsTest {
  return { grade: session.grade, facts: session.facts };
}

// Starting values, tuned from the first real results (spec #54). Speed never says "behind": slow facts need practice.
/** A median time per answered fact at or under this is "quick". */
export const FACTS_QUICK_MS = 3000;
/** Percent of answered facts right for accuracy to be "secure". */
export const FACTS_SECURE_PERCENT = 90;

export type FactsAccuracy = "secure" | "needs-practice";
export type FactsSpeed = "quick" | "needs-practice";

/** The facts section in the placement. Every number is measured; a status is null when nothing was answered. */
export interface FactsResult {
  /** The fact families the section asked. */
  families: FactFamilyId[];
  /** The length of the section. */
  seconds: number;
  /** Facts with an answer (skips not counted). */
  answered: number;
  correct: number;
  skipped: number;
  /** Median time per answered fact: each fact's browser time, or its server time when it has none (#185); null when nothing was answered. */
  medianMs: number | null;
  accuracy: FactsAccuracy | null;
  speed: FactsSpeed | null;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((x, y) => x - y);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Scores the section. The time of a fact is the browser's, from when it appeared to Enter; without one, the server's,
 * from the answer before it (or the start) to its own answer (#185). The browser's time leaves out the save queue, so a
 * fast child's speed is their typing speed, not the network's (#122).
 */
export function factsResult(session: FactsSession): FactsResult {
  const answered = session.answers.filter((a) => !isSkip(a.response));
  const correct = answered.filter((a) => a.correct).length;
  const medianMs = median(answered.map(factTime));
  return {
    families: [...FACTS_BY_GRADE[session.grade]],
    seconds: FACTS_SECONDS,
    answered: answered.length,
    correct,
    skipped: session.answers.length - answered.length,
    medianMs,
    accuracy: answered.length === 0 ? null : atLeast(correct, answered.length, FACTS_SECURE_PERCENT) ? "secure" : "needs-practice",
    speed: medianMs === null ? null : medianMs <= FACTS_QUICK_MS ? "quick" : "needs-practice",
  };
}

const SCOPE: Record<FactFamilyId, string> = {
  add10: "addition and subtraction facts to 10",
  sub10: "addition and subtraction facts to 10",
  add20: "addition and subtraction facts to 20",
  sub20: "addition and subtraction facts to 20",
  mul2510: "multiplication facts for 2, 5 and 10",
  mul234510: "multiplication facts for 2, 3, 4, 5 and 10",
  mul100: "multiplication and division facts to 100",
  div100: "multiplication and division facts to 100",
};

/** The facts row of the report: accuracy beside speed, never speed alone. */
export interface ReportFacts {
  /** What the section asked, in plain words: "Addition and subtraction facts to 20, and multiplication facts for 2, 5 and 10". */
  scope: string;
  seconds: number;
  answered: number;
  correct: number;
  /** Median seconds per answered fact, to one decimal; null when nothing was answered. */
  secondsPerFact: number | null;
  accuracy: FactsAccuracy | null;
  speed: FactsSpeed | null;
}

export function factsReport(result: FactsResult): ReportFacts {
  const scope = [...new Set(result.families.map((f) => SCOPE[f]))].join(", and ");
  return {
    scope: scope.charAt(0).toUpperCase() + scope.slice(1),
    seconds: result.seconds,
    answered: result.answered,
    correct: result.correct,
    secondsPerFact: result.medianMs === null ? null : Math.round(result.medianMs / 100) / 10,
    accuracy: result.accuracy,
    speed: result.speed,
  };
}

/** Rebuilds a section from the stored facts and the answers in order, marking each one again. */
export function restoreFacts(stored: FactsTest, submissions: readonly FactSubmission[]): FactsSession {
  const start: FactsSession = { grade: stored.grade, facts: stored.facts, answers: [] };
  return submissions.reduce((session, { factId, response, atMs, browserMs }) => submitFact(session, { factId, response, atMs, browserMs }), start);
}
