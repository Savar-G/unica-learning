// One child's test attempt on the server (spec #144, #146): start or continue it ("Start test", "Continue test",
// "Finish test", "Start again", #72), read its next step, and answer a question with its whiteboard work (#147).
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
  type Province,
  type Route,
  type Session,
  type StartState,
  type StoredTest,
  type Submission,
  type TestStep,
} from "@/lib/assessment";
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
 */
export interface AttemptStore {
  /** One of the parent's children; null when the parent has no child with this id. */
  child(parent: string, childId: string): Promise<AttemptChild | null>;
  /** The parent's tests: of one child, or of every child. */
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
  | { ok: false; error: "store_failed"; unreadable?: true };

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
