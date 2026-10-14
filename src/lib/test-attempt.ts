// One child's test attempt on the server (spec #144, #146): start or continue it ("Start test", "Continue test",
// "Finish test", "Start again", #72), and read its next step. The rules come from the assessment core; this runs them
// against the store and returns a domain result, never an HTTP response, so the routes only translate
// (src/lib/test-api.ts). No Next.js imports.
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
  restoreSession,
  startAttempt,
  startState,
  storedTest,
  testStep,
  type Attempt,
  type Grade,
  type Province,
  type Session,
  type StartState,
  type StoredTest,
  type Submission,
  type TestStep,
} from "@/lib/assessment";
import { FACTS_SECONDS, createFacts, factsStep, restoreFacts, storedFacts, submitFact, type FactAnswer, type FactsSession, type FactsStep, type FactsTest, type FactSubmission } from "@/lib/assessment";

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

/**
 * The store seam. Each operation keeps one database guard. Reads return only the given parent's rows. An attempt the
 * store returns has no `answeredAll`: the module works it out from the answers. A database error throws (a StoreError).
 * The operations of the timed facts section are in FactsStore.
 */
export interface AttemptStore extends FactsStore {
  /** One of the parent's children; null when the parent has no child with this id. */
  child(parent: string, childId: string): Promise<AttemptChild | null>;
  /** The parent's tests: of one child, or of every child. */
  attempts(parent: string, childId?: string): Promise<StoredAttempt[]>;
  /** One of the parent's tests with its questions and answers; null when the parent has no test with this id. */
  load(parent: string, id: string): Promise<LoadedAttempt | null>;
  /** Marks the test expired, only while it is in progress and its deadline ended before `now`. A late answer cannot undo it. */
  expire(id: string, now: number): Promise<void>;
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
  | Extract<Refusal, { error: "store_failed" }>;

export type FactsOutcome = { ok: true; step: FactsStep } | FactsRefusal;

/** The section rebuilt with the assessment core, and when it started. */
interface Section {
  startedAt: number;
  session: FactsSession;
}

/** Logs a failed facts store step the way the facts routes logged it before the module, and refuses. */
function factsFailed(e: unknown): FactsRefusal {
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
async function readSection(store: AttemptStore, id: string): Promise<{ ok: true; section: Section | null } | FactsRefusal> {
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
