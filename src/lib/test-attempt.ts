// One child's test attempt on the server (spec #144, #146): start or continue it ("Start test", "Continue test",
// "Finish test", "Start again", #72), read its next step, answer a question with its whiteboard work (#147), run the
// timed facts section (#148), and finish it: score it once and store the placement (#150).
// The rules come from the assessment core; this runs them against the store and returns a domain result, never an
// HTTP response, so the routes only translate (src/lib/test-api.ts). No Next.js imports.
// The store is one small interface with two adapters: Supabase (src/lib/test-attempt-server.ts), which keeps the guards
// with a unique index and guarded updates, and in-memory (src/lib/test-attempt-memory.ts), which keeps the same guards
// so the races can be tested without a database. Parent access stays in the routes: they pass the signed-in parent, and
// the store reads only that parent's rows.
// Every operation takes one clock reading (`now`, epoch ms, from the server's clock): the expiry check and the guarded
// write in one request use the same time.
import {
  attemptState,
  createSession,
  decideStart,
  finish,
  nextQuestion,
  recordAnswer,
  restoreSession,
  startAttempt,
  startState,
  storedTest,
  submitAnswer,
  testStep,
  workProblem,
  type Answer,
  type Attempt,
  type Grade,
  type HelpAnswer,
  type Placement,
  type Province,
  type Route,
  type Session,
  type StartState,
  type StoredTest,
  type Submission,
  type TestStep,
} from "@/lib/assessment";
import { FACTS_SECONDS, createFacts, factsStep, restoreFacts, storedFacts, submitFact, type FactAnswer, type FactsSession, type FactsStep, type FactsTest, type FactSubmission } from "@/lib/assessment";
import { ANSWER_MAX, QUESTION_TIME_CAP_MS } from "@/lib/test-api";

/** One of the parent's children, as a new test needs them. */
export interface AttemptChild {
  id: string;
  grade: Grade;
  province: Province;
}

/** A stored test without its questions and answers: the attempt, its child, and the seed that drew its questions. */
export type StoredAttempt = Attempt & { childId: string; seed: number };

/** A stored test with its drawn questions and its answers, in the order they were stored. */
export interface LoadedAttempt {
  attempt: Attempt;
  test: StoredTest;
  answers: Submission[];
}

/** A new test to store: its times, the seed, and the questions drawn from it. */
export interface NewAttempt {
  attempt: Attempt;
  seed: number;
  test: StoredTest;
}

/** One answer to store (a row of public.answers): the marked answer, its question, and the work that came with it. */
export interface NewAnswer extends Answer {
  /** Its place in the test, from 0. One answer per place: a second one is "taken". */
  position: number;
  templateId: string;
  values: Record<string, number>;
  /** The question required work on the whiteboard (#67). */
  workRequired: boolean;
  /** Where the drawing is stored, or null when the child did not draw. */
  workPath: string | null;
  /** The typed working, or null when the child typed none. */
  workText: string | null;
}

/**
 * The store seam. Each operation keeps one database guard. Reads return only the given parent's rows. An attempt the
 * store returns has no `answeredAll`: the module works it out from the answers. A database error throws (a StoreError).
 * The operations of the timed facts section are in FactsStore.
 */
export interface AttemptStore extends FactsStore {
  /** One of the parent's children; null when the parent has no child with this id. */
  child(parent: string, childId: string): Promise<AttemptChild | null>;
  /** The parent's tests: of one child, or of every child. A completed test whose result may not be reliable has `unreliable` (#189). */
  attempts(parent: string, childId?: string): Promise<StoredAttempt[]>;
  /** One of the parent's tests with its questions and answers; null when the parent has no test with this id. */
  load(parent: string, id: string): Promise<LoadedAttempt | null>;
  /** Marks the test expired, only while it is in progress and its deadline ended before `now`. A late answer cannot undo it. */
  expire(id: string, now: number): Promise<void>;
  /**
   * Opens the answer window for an answer at `now`: moves the deadline to `until`, only while the test is in progress
   * and its deadline has not passed. False when the test is no longer open: then nothing may be stored. An expire
   * request at the same moment and this cannot both win.
   */
  openAnswerWindow(id: string, now: number, until: number): Promise<boolean>;
  /** Records the time of a stored answer (the last answer time). It never moves back: two tabs can store answers at once. */
  recordAnswerTime(id: string, at: number): Promise<void>;
  /** Puts the deadline back to `previous` after an answer was not stored, only while it is still `until` (nothing moved it since). */
  undoAnswerWindow(id: string, until: number, previous: number): Promise<void>;
  /** Stores a whiteboard drawing (PNG bytes) for one question of the parent's test, under a new name. Returns its path. */
  storeDrawing(parent: string, id: string, questionId: string, png: Uint8Array): Promise<string>;
  /** Removes a drawing whose answer was not stored. */
  removeDrawing(path: string): Promise<void>;
  /** Stores one answer. "taken": the test already has an answer in this place (another tab answered first). */
  insertAnswer(id: string, answer: NewAnswer): Promise<"stored" | "taken">;
  /** Records the stage 2 route the child was given when stage 1 ended, for the admin view. */
  recordRoute(id: string, route: Route): Promise<void>;
  /**
   * Completes the scored test at `at`: stores the completion time, the placement with its route, and the child's answer
   * to "Did anyone help?". Only while the test is in progress: a second finish at the same moment changes nothing.
   */
  complete(id: string, finished: { at: number; placement: Placement; help: HelpAnswer | null }): Promise<void>;
  /** Stores a new test for the parent's child. "taken": the child already has a test in progress (one open test per child). */
  create(parent: string, child: AttemptChild, test: NewAttempt): Promise<{ id: string } | "taken">;
}

/**
 * A store read or write failed (a database error). The store throws it; the module logs it and refuses with
 * "store_failed". `what` names the step that failed, as the log lines did before the module (#146).
 */
export class StoreError extends Error {
  constructor(readonly what: string, readonly detail: string) {
    super(`${what}: ${detail}`);
    this.name = "StoreError";
  }
}

/**
 * Why the module refused. One closed set for every step of a test (spec #144); the routes map each to the status code
 * and JSON the browser gets (src/lib/test-api.ts refusalResponse).
 */
export type Refusal =
  /** No such test, or child, for this parent. */
  | { ok: false; error: "not_found" }
  /** The test ran out of time: 24 hours passed since the child last worked on it (#72). */
  | { ok: false; error: "expired" }
  /** The test is not in progress, is complete, or the answer was for another question. `step`: where the test is now. */
  | { ok: false; error: "conflict"; step?: TestStep }
  /** The request does not fit the test. `message` says why, when the child can fix it. */
  | { ok: false; error: "invalid"; message?: string }
  /** A show-your-work question was answered with an empty whiteboard (#67). */
  | { ok: false; error: "work_required" }
  /** Typed working in grades 1 and 2, which draw only (#67). */
  | { ok: false; error: "typing_off" }
  /** The drawing or the typed working is over its size limit (#67). `message` says which. */
  | { ok: false; error: "work_too_big"; message: string }
  /** Finish before every answer is in. */
  | { ok: false; error: "incomplete" }
  /** The question bank cannot cover the child's grade. */
  | { ok: false; error: "not_ready" }
  /** Other requests kept opening a test first. */
  | { ok: false; error: "busy" }
  /** A new test opens 30 days after the last completed one (#72). */
  | { ok: false; error: "retake_closed"; opensAt: number }
  /** A store read or write failed. `unreadable`: the stored test cannot be rebuilt from its answers. */
  | StoreFailed;

/** A store read or write failed. `unreadable`: the stored test (or its facts section) cannot be rebuilt from its answers. */
type StoreFailed = { ok: false; error: "store_failed"; unreadable?: true };

const messageOf = (e: unknown) => (e instanceof Error ? e.message : e);

/** Logs a failed store read the way the routes logged it before the module, and refuses. */
function storeFailed(e: unknown): Refusal {
  if (e instanceof StoreError) console.error(`[test] ${e.what}`, e.detail);
  else console.error("[test]", messageOf(e));
  return { ok: false, error: "store_failed" };
}

export type StartOutcome = { ok: true; id: string; resumed: boolean } | Refusal;

/** Reads and decides again when another request opened a test in between. Two rounds settle any double click. */
const ROUNDS = 3;

/**
 * Starts or continues the parent's child's test at `now`. `restart` is the family's "Start again" after the test
 * expired. Continuing writes nothing: only a stored answer moves the deadline. Two requests at once (a double click,
 * two tabs) end on the same test: the store lets only one test be open, and the request that loses reads again and
 * continues the winner's test.
 */
export async function startTest(
  store: AttemptStore,
  parent: string,
  childId: string,
  now: number,
  { restart, newSeed }: { restart: boolean; newSeed: () => number },
): Promise<StartOutcome> {
  let child: AttemptChild | null;
  try {
    child = await store.child(parent, childId);
  } catch (e) {
    return storeFailed(e);
  }
  if (!child) return { ok: false, error: "not_found" };
  try {
    return await startFor(store, parent, child, now, { restart, newSeed });
  } catch (e) {
    console.error("[test] start failed", messageOf(e));
    return { ok: false, error: "store_failed" };
  }
}

/** The start request for a child the parent has. Throws on a store failure. */
async function startFor(
  store: AttemptStore,
  parent: string,
  child: AttemptChild,
  now: number,
  { restart, newSeed }: { restart: boolean; newSeed: () => number },
): Promise<StartOutcome> {
  for (let round = 0; round < ROUNDS; round++) {
    const attempts = await withAnswers(store, parent, child.id);
    const decision = decideStart(attempts, now, { restart });
    if (decision.action === "refuse") {
      return decision.error === "expired" ? { ok: false, error: "expired" } : { ok: false, error: "retake_closed", opensAt: decision.opensAt };
    }
    // If the test runs out of time before the next answer, the answer route says so and the screen offers Start again.
    if (decision.action === "resume") return { ok: true, id: decision.attemptId, resumed: true };

    if (decision.expire) await store.expire(decision.expire, now);
    // A new test never repeats a seed the child had, so "Start again" and a retake always get new questions.
    const used = new Set(attempts.map((a) => a.seed));
    let seed = newSeed();
    while (used.has(seed)) seed = newSeed();
    let session: Session;
    try {
      session = createSession({ grade: child.grade, province: child.province }, seed);
    } catch (e) {
      console.error("[test] cannot build a test", child.grade, messageOf(e));
      return { ok: false, error: "not_ready" };
    }
    const created = await store.create(parent, child, { attempt: startAttempt("", now), seed, test: storedTest(session) });
    if (created !== "taken") return { ok: true, id: created.id, resumed: false };
    // Another request opened a test first: read again, and continue that one.
  }
  return { ok: false, error: "busy" };
}

/**
 * The parent's tests (of one child, or of all), each one in progress with `answeredAll` from its answers: a test with
 * every answer in waits to be scored, and never expires. Throws on a store failure, once every read has ended, so no
 * read outlives the request.
 */
async function withAnswers(store: AttemptStore, parent: string, childId?: string): Promise<StoredAttempt[]> {
  const attempts = await store.attempts(parent, childId);
  const reads = await Promise.all(attempts.map((a) => (a.status === "in_progress" ? readTest(store, parent, a.id) : null)));
  return attempts.map((a, i) => {
    const read = reads[i];
    if (!read) return a;
    if (!read.ok) throw new Error("open test read failed");
    return { ...a, answeredAll: read.attempt.answeredAll };
  });
}

/**
 * What the start screen of each of the parent's children offers at `now`, by the same rules and reads as the start
 * request, so the screen and the server agree. Pass a child id to read one child. Writes nothing. A read error offers
 * "Start test" (an empty map); the start request checks the rules again.
 */
export async function startStates(store: AttemptStore, parent: string, now: number, childId?: string): Promise<Map<string, StartState>> {
  let attempts: StoredAttempt[];
  try {
    attempts = await withAnswers(store, parent, childId);
  } catch (e) {
    console.error("[test]", messageOf(e));
    return new Map();
  }
  const byChild = new Map<string, Attempt[]>();
  for (const a of attempts) byChild.set(a.childId, [...(byChild.get(a.childId) ?? []), a]);
  return new Map([...byChild].map(([id, list]) => [id, startState(list, now)]));
}

/** A child's start state; a child with no tests can start one. */
export const stateFor = (states: Map<string, StartState>, childId: string): StartState => states.get(childId) ?? { kind: "start", retake: false };

export type StepOutcome = { ok: true; step: TestStep } | Refusal;

/**
 * The next question of the parent's test, without its answer, or "complete". A test that ran out of time at `now` is
 * "expired", and is marked expired if it was still in progress. A test with every answer in never expires.
 */
export async function nextStep(store: AttemptStore, parent: string, id: string, now: number): Promise<StepOutcome> {
  const open = await openTest(store, parent, id, now);
  return open.ok ? { ok: true, step: testStep(open.session) } : open;
}

/** The whiteboard work that comes with an answer (#67), as the route parsed it (src/lib/work-payload.ts). */
export interface AnswerWork {
  /** The drawing as PNG bytes, within the size limit; null for an empty board. */
  png: Uint8Array | null;
  /** The typed working, trimmed and within the size limit; "" when the child typed none. */
  text: string;
}

/** A child's answer to the current question, as the route read it from the request. */
export interface AnswerInput {
  /** The question the child answered. Another question than the current one is a conflict. */
  questionId: string;
  /** The response as the child gave it: a choice, or a number up to ANSWER_MAX characters. */
  response: string;
  /** Time on the question in milliseconds, as the browser measured it. */
  timeMs: number;
  work: AnswerWork;
}

/**
 * Marks the child's answer to the current question of the parent's test at `now` with the assessment core, stores
 * it, and sends the next step. The browser learns nothing about whether the answer was right.
 */
export async function answerQuestion(store: AttemptStore, parent: string, id: string, input: AnswerInput, now: number): Promise<StepOutcome> {
  const open = await openTest(store, parent, id, now);
  if (!open.ok) return open;
  const { attempt, session } = open;
  const q = nextQuestion(session);
  // The test is complete or no longer in progress, or a second tab (or a retried request) answered this question already.
  if (attempt.status !== "in_progress" || !q || input.questionId !== q.id) return { ok: false, error: "conflict", step: testStep(session) };
  const response = input.response.trim();
  const valid = q.format === "choice" ? (q.choices ?? []).includes(response) : response.length > 0 && response.length <= ANSWER_MAX;
  if (!valid || !Number.isFinite(input.timeMs) || input.timeMs < 0) return { ok: false, error: "invalid" };
  // #67: a show-your-work question needs work on the whiteboard; grades 1 and 2 draw only.
  const problem = workProblem(session, { drawn: input.work.png !== null, text: input.work.text });
  if (problem) return { ok: false, error: problem };
  const next = submitAnswer(session, { questionId: q.id, response, timeMs: Math.min(Math.round(input.timeMs), QUESTION_TIME_CAP_MS) });
  const marked = next.answers.at(-1)!;
  // #72: the deadline moves to 24 hours from this answer, only if the test is still open now. An answer that arrives
  // after the deadline, or after "Start again" expired the test, stops here and stores nothing.
  const until = recordAnswer(attempt, now).resumeUntil;
  let opened: boolean;
  try {
    opened = await store.openAnswerWindow(id, now, until);
  } catch (e) {
    console.error("[test]", messageOf(e));
    return { ok: false, error: "store_failed" };
  }
  if (!opened) return freshConflict(store, parent, id, now);
  /** An answer that was not stored gives no extra time: the deadline goes back where it was, unless something moved it since. */
  const failed = async (): Promise<Refusal> => {
    await bestEffort("[test] deadline undo failed", () => store.undoAnswerWindow(id, until, attempt.resumeUntil));
    return { ok: false, error: "store_failed" };
  };

  // The drawing first, under a new name, so the answer can point to it. If the answer is not stored, the drawing goes.
  let workPath: string | null = null;
  if (input.work.png) {
    try {
      workPath = await store.storeDrawing(parent, id, q.id, input.work.png);
    } catch (e) {
      logFailure("[work] upload failed", e);
      return failed();
    }
  }
  let inserted: "stored" | "taken";
  try {
    inserted = await store.insertAnswer(id, {
      ...marked,
      position: session.answers.length,
      templateId: q.templateId,
      values: q.values,
      workRequired: q.showWork === true,
      workPath,
      workText: input.work.text || null,
    });
  } catch (e) {
    await removeDrawing(store, workPath);
    logFailure("[test] answer save failed", e);
    return failed();
  }
  if (inserted === "taken") {
    // Another request stored this question's answer first. Send the step after it, read fresh, so the screen moves on.
    await removeDrawing(store, workPath);
    return freshConflict(store, parent, id, now);
  }
  // The answer time is written only once the answer is stored: the reminder emails (#73) count from it.
  await bestEffort("[test] answer time save failed", () => store.recordAnswerTime(id, now));
  // Stage 1 just ended: record the route for the admin view.
  const route = next.route;
  if (!session.route && route) await bestEffort("[test] route save failed", () => store.recordRoute(id, route));
  return { ok: true, step: testStep(next) };
}

/** Logs a failed store write the way the answer route logged it before the module (#147): the line, then the cause. */
function logFailure(line: string, e: unknown): void {
  console.error(line, e instanceof StoreError ? e.detail : messageOf(e));
}

/** Removes a drawing whose answer was not stored, so the bucket holds no drawing without its answer. A failure is logged. */
const removeDrawing = (store: AttemptStore, path: string | null) =>
  path ? bestEffort("[work] remove failed", () => store.removeDrawing(path)) : Promise.resolve();

/** A store write the request does not wait on to succeed: a failure is logged with `line`, and the request goes on. */
async function bestEffort(line: string, write: () => Promise<void>): Promise<void> {
  try {
    await write();
  } catch (e) {
    logFailure(line, e);
  }
}

/** A conflict with the test's step, read fresh after another request changed it; or why it cannot be read. */
async function freshConflict(store: AttemptStore, parent: string, id: string, now: number): Promise<Refusal> {
  const fresh = await openTest(store, parent, id, now);
  return fresh.ok ? { ok: false, error: "conflict", step: testStep(fresh.session) } : fresh;
}

/** The parent's test at `now`, or "expired" when it ran out of time: then it is marked expired if still in progress. */
async function openTest(store: AttemptStore, parent: string, id: string, now: number): Promise<{ ok: true; attempt: Attempt; session: Session } | Refusal> {
  const read = await readTest(store, parent, id);
  if (!read.ok || attemptState(read.attempt, now) !== "expired") return read;
  if (read.attempt.status === "in_progress") {
    try {
      await store.expire(id, now);
    } catch (e) {
      console.error("[test]", messageOf(e));
    }
  }
  return { ok: false, error: "expired" };
}

/** The parent's test and its session, rebuilt from the answers with the assessment core. No time check. */
async function readTest(store: AttemptStore, parent: string, id: string): Promise<{ ok: true; attempt: Attempt; session: Session } | Refusal> {
  let loaded: LoadedAttempt | null;
  try {
    loaded = await store.load(parent, id);
  } catch (e) {
    return storeFailed(e);
  }
  if (!loaded) return { ok: false, error: "not_found" };
  let session: Session;
  try {
    session = restoreSession(loaded.test, loaded.answers);
  } catch (e) {
    console.error("[test] restore failed", id, messageOf(e));
    return { ok: false, error: "store_failed", unreadable: true };
  }
  // A test with every answer in never expires: it only waits to be scored.
  return { ok: true, attempt: { ...loaded.attempt, answeredAll: testStep(session).status === "complete" }, session };
}

// The timed facts section (#70, #148), at the halfway break. The server's clock times it: the section starts at the
// clock reading of the request that starts it, and each fact answer's time is its request's clock reading since then.
// The browser clock never decides a result.

/** A test's facts section as stored: when it started (epoch ms, the server's clock), the drawn facts, and the answers in order. */
export interface LoadedFacts {
  startedAt: number;
  test: FactsTest;
  answers: FactSubmission[];
}

/**
 * The store seam's operations for the timed facts section. Each keeps one database guard. The module calls them only
 * for a test that `load` returned for the parent, so they take the test's id alone.
 */
export interface FactsStore {
  /** The test's facts section with its answers in order; null when it has not started. */
  loadFacts(id: string): Promise<LoadedFacts | null>;
  /** Stores the section when it starts. "taken": the test already has one (one facts section per test). */
  insertFacts(id: string, section: { startedAt: number; test: FactsTest }): Promise<"stored" | "taken">;
  /** Stores one marked fact answer. "taken": the section already has an answer at this position (one per position). */
  insertFactAnswer(id: string, answer: NewFactAnswer): Promise<"stored" | "taken">;
}

/** A marked fact answer to store, at its place in the section (0-based). */
export type NewFactAnswer = FactAnswer & { position: number };

/** Why the module refused a step of the facts section: a subset of Refusal, where a conflict comes with the facts step. */
export type FactsRefusal =
  | { ok: false; error: "not_found" }
  /** The test is not in progress, the section has not started, or the answer came late or for another fact. `step`: where the section is now. */
  | { ok: false; error: "conflict"; step?: FactsStep }
  | StoreFailed;

export type FactsOutcome = { ok: true; step: FactsStep } | FactsRefusal;

/** The section rebuilt with the assessment core, and when it started. */
interface Section {
  startedAt: number;
  session: FactsSession;
}

/** Logs a failed facts store step the way the facts routes logged it before the module, and refuses. */
function factsFailed(e: unknown): StoreFailed {
  if (e instanceof StoreError) console.error(`[facts] ${e.what}`, e.detail);
  else console.error("[facts]", messageOf(e));
  return { ok: false, error: "store_failed" };
}

/** The parent's test, for its facts section: the status, and the profile and seed that draw the facts. */
async function parentTest(store: AttemptStore, parent: string, id: string): Promise<{ ok: true; attempt: Attempt; test: StoredTest } | FactsRefusal> {
  let loaded: LoadedAttempt | null;
  try {
    loaded = await store.load(parent, id);
  } catch (e) {
    console.error("[facts] assessment load failed", e instanceof StoreError ? e.detail : messageOf(e));
    return { ok: false, error: "store_failed" };
  }
  return loaded ? { ok: true, attempt: loaded.attempt, test: loaded.test } : { ok: false, error: "not_found" };
}

/** The test's facts section, rebuilt from the stored facts and answers; null when it has not started. */
async function readSection(store: AttemptStore, id: string): Promise<{ ok: true; section: Section | null } | StoreFailed> {
  let loaded: LoadedFacts | null;
  try {
    loaded = await store.loadFacts(id);
  } catch (e) {
    return factsFailed(e);
  }
  if (!loaded) return { ok: true, section: null };
  try {
    return { ok: true, section: { startedAt: loaded.startedAt, session: restoreFacts(loaded.test, loaded.answers) } };
  } catch (e) {
    console.error("[facts] restore failed", id, messageOf(e));
    return { ok: false, error: "store_failed", unreadable: true };
  }
}

/**
 * Where the section is at `now`, by the server's clock. Never before its start: a start request that lost the race to
 * another one can have read the clock a few milliseconds before the winner's start time.
 */
const stepAt = ({ startedAt, session }: Section, now: number): FactsStep => factsStep(session, Math.max(0, now - startedAt));

/**
 * Where the facts section of the parent's test is at `now`: "ready" before it starts; otherwise the facts still to come
 * and the time left, or "done". Writes nothing, and needs no open test.
 */
export async function readFacts(store: AttemptStore, parent: string, id: string, now: number): Promise<FactsOutcome> {
  const owner = await parentTest(store, parent, id);
  if (!owner.ok) return owner;
  const read = await readSection(store, id);
  if (!read.ok) return read;
  return { ok: true, step: read.section ? stepAt(read.section, now) : { status: "ready", seconds: FACTS_SECONDS } };
}

/**
 * Starts the facts section of the parent's test at `now`: draws the facts from the test's grade and seed, and stores
 * them with the start time. When the section already runs (a second click, a reload, or a start that lost a race to
 * another request), carries on with it and never resets its time: the store keeps one section per test.
 */
export async function startFacts(store: AttemptStore, parent: string, id: string, now: number): Promise<FactsOutcome> {
  const owner = await parentTest(store, parent, id);
  if (!owner.ok) return owner;
  if (owner.attempt.status !== "in_progress") return { ok: false, error: "conflict" };
  const existing = await readSection(store, id);
  if (!existing.ok) return existing;
  if (existing.section) return { ok: true, step: stepAt(existing.section, now) };

  const session = createFacts(owner.test.profile, owner.test.seed);
  let inserted: "stored" | "taken";
  try {
    inserted = await store.insertFacts(id, { startedAt: now, test: storedFacts(session) });
  } catch (e) {
    return factsFailed(e);
  }
  if (inserted === "stored") return { ok: true, step: factsStep(session, 0) };
  // Another request started the section first: carry on with that one, timed from its start.
  const raced = await readSection(store, id);
  if (raced.ok && raced.section) return { ok: true, step: stepAt(raced.section, now) };
  console.error("[facts] start failed", "the section another request started cannot be read");
  return { ok: false, error: "store_failed" };
}

/**
 * Marks one fact answer with the assessment core and stores it, then sends the facts still to come. Its time is `now`
 * since the section started (its arrival), never earlier than the answer before it. Refuses with "conflict" when the
 * test is not in progress or the section has not started. An answer after the time is up, or for a fact already
 * answered, stores nothing: "conflict" with where the section is now. The store keeps one answer per fact, so when
 * another request stored this fact's answer in the same moment, this one gets "conflict" with a fresh step.
 */
export async function answerFact(
  store: AttemptStore,
  parent: string,
  id: string,
  now: number,
  { factId, response }: { factId: string; response: string },
): Promise<FactsOutcome> {
  const owner = await parentTest(store, parent, id);
  if (!owner.ok) return owner;
  if (owner.attempt.status !== "in_progress") return { ok: false, error: "conflict" };
  const read = await readSection(store, id);
  if (!read.ok) return read;
  if (!read.section) return { ok: false, error: "conflict" };
  const { session, startedAt } = read.section;
  // Never earlier than the answer before it, in case two server instances' clocks differ by a few milliseconds.
  const atMs = Math.max(now - startedAt, session.answers.at(-1)?.atMs ?? 0);
  let next: FactsSession;
  try {
    next = submitFact(session, { factId, response, atMs });
  } catch {
    // The time is up, or the answer is for a fact already answered (or not yet asked): store nothing, and send where
    // the section is now.
    return { ok: false, error: "conflict", step: factsStep(session, atMs) };
  }
  const marked = next.answers.at(-1)!;
  let inserted: "stored" | "taken";
  try {
    inserted = await store.insertFactAnswer(id, { ...marked, position: session.answers.length });
  } catch (e) {
    return factsFailed(e);
  }
  if (inserted === "stored") return { ok: true, step: factsStep(next, atMs) };
  // Another request stored an answer to this fact in the same moment: send a fresh step.
  const fresh = await readSection(store, id);
  if (fresh.ok && fresh.section) return { ok: false, error: "conflict", step: stepAt(fresh.section, now) };
  console.error("[facts] answer save failed", "the answer another request stored cannot be read");
  return { ok: false, error: "store_failed" };
}

// Finish (#150): the child answered every question, and the screen sends the test with the answer to "Did anyone
// help?". The test is scored once: the store completes it only while it is in progress.

/**
 * The child's answer to "Did anyone help?" (#71), as the route read it from the request: null when the request has
 * none (an older screen did not ask), and "invalid" when it holds something that is not a help answer.
 */
export type HelpInput = HelpAnswer | null | "invalid";

/** "now": this request scored the test. "already": it was scored before. Either way the report job runs (again). */
export type FinishOutcome = { ok: true; id: string; finished: "now" | "already" } | Refusal;

/**
 * Finishes the parent's test at `now`: scores it once with the assessment core, together with its timed facts section
 * and the child's help answer, and stores it as completed. A test scored before is "already" finished, so a second
 * finish answers ok again and its report job can complete a report step that failed before. `id` in the outcome is
 * the test's id as the store holds it.
 */
export async function finishTest(store: AttemptStore, parent: string, id: string, help: HelpInput, now: number): Promise<FinishOutcome> {
  const open = await openTest(store, parent, id, now);
  if (!open.ok) return open;
  const { attempt, session } = open;
  if (attempt.status === "completed") return { ok: true, id: attempt.id, finished: "already" };
  if (attempt.status !== "in_progress" || testStep(session).status !== "complete") return { ok: false, error: "incomplete" };
  // As before the module, the help answer is checked only for a test that can be finished now.
  if (help === "invalid") return { ok: false, error: "invalid" };
  // The timed facts section (#70) goes into the placement beside the test; none when the child had none.
  const facts = await readSection(store, id);
  if (!facts.ok) return facts;
  const placement = finish(session, facts.section?.session ?? null, help);
  try {
    await store.complete(id, { at: now, placement, help });
  } catch (e) {
    return storeFailed(e);
  }
  return { ok: true, id: attempt.id, finished: "now" };
}
