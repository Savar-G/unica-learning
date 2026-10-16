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
  breakDue,
  createSession,
  decideStart,
  extraRoundOffer,
  extraRoundTaken,
  finish,
  mainAnswered,
  nextQuestion,
  recordAnswer,
  restoreSession,
  startAttempt,
  startExtraRound,
  startState,
  storedTest,
  submitAnswer,
  testStep,
  withoutRound,
  workProblem,
  type Answer,
  type Attempt,
  type ExtraRoundOffer,
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
import type { AnswerEvents } from "@/lib/answer-events";
import type { BreakRecord, BreakResume, TestDevice } from "@/lib/test-context";

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
  break?: BreakResume;
  /** The child's answer to "Did anyone help?" (#71); null or absent before the test is finished or when it was not asked. */
  help?: HelpAnswer | null;
  /** #190: the extra round's record; absent on tests stored before #190 (read as nothing recorded). */
  extraRound?: ExtraRoundRecord;
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
  /** Where the whiteboard strokes are stored (#186). Left out when the child drew no strokes, or they were not stored. */
  strokesPath?: string;
  /** When the server served the question and received the answer, and what the child did before Next (#184). */
  timeline: AnswerTimeline;
  /** #190: "extra" for an answer to the extra round, else "main". */
  round: AnswerRound;
}

/** #190: which part of the test an answer is for: the main test, or the optional extra round after it. */
export type AnswerRound = "main" | "extra";

/** The answer timeline of one answer (#184). Times are epoch ms by the server's clock. */
export interface AnswerTimeline {
  /** When the server first served the question; null when it has no record (a serve before #184, or a failed write). */
  shownAt: number | null;
  /** When the server received the answer: the clock reading of the answer request. */
  answeredAt: number;
  /** What the browser recorded before Next; null when it sent nothing usable (a screen from before #184). */
  events: AnswerEvents | null;
}

/**
 * The store seam. Each operation keeps one database guard. Reads return only the given parent's rows. An attempt the
 * store returns has no `answeredAll`: the module works it out from the answers. A database error throws (a StoreError).
 * The operations of the timed facts section are in FactsStore; the serve times of the answer timeline in ShownStore;
 * the test context (#185) in ContextStore; the extra round (#190) in ExtraRoundStore.
 */
export interface AttemptStore extends FactsStore, ShownStore, ContextStore, ExtraRoundStore {
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
  /** Stores the whiteboard strokes (#186, checked JSON) for one question of the parent's test, under a new name. Returns its path. */
  storeStrokes(parent: string, id: string, questionId: string, json: string): Promise<string>;
  /** Removes strokes whose answer was not stored. */
  removeStrokes(path: string): Promise<void>;
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
function storeFailed(e: unknown): StoreFailed {
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

/** #189: when the child's next test opens, for the report's reliability note: open now (`resume`: one is in progress), or at `at`. */
export type RetakeState = { kind: "open"; resume: boolean } | { kind: "opens"; at: number };

/**
 * The child's next test at `now`, by the same rules and reads as the start screen (D-108: at once at most once per 30
 * days after an unreliable result). Null when the tests cannot be read: unlike the start screen, the report then makes
 * no promise, because "no 30-day wait" could be false. Writes nothing.
 */
export async function retakeState(store: AttemptStore, parent: string, childId: string, now: number): Promise<RetakeState | null> {
  let attempts: StoredAttempt[];
  try {
    attempts = await withAnswers(store, parent, childId);
  } catch (e) {
    console.error("[test]", messageOf(e));
    return null;
  }
  const state = startState(attempts, now);
  if (state.kind === "wait") return { kind: "opens", at: state.opensAt };
  return { kind: "open", resume: state.kind === "resume" || state.kind === "finish" };
}

export type StepOutcome = { ok: true; step: TestStep; break?: BreakResume } | Refusal;

/**
 * The next question of the parent's test, without its answer, or "complete". A test that ran out of time at `now` is
 * "expired", and is marked expired if it was still in progress. A test with every answer in never expires.
 */
export async function nextStep(store: AttemptStore, parent: string, id: string, now: number): Promise<StepOutcome> {
  const open = await openTest(store, parent, id, now);
  if (!open.ok) return open;
  const step = stepOf(open);
  await shown(store, id, open.session, step, now);
  return { ok: true, step, ...(open.break && { break: open.break }) };
}

/** The whiteboard work that comes with an answer (#67), as the route parsed it (src/lib/work-payload.ts). */
export interface AnswerWork {
  /** The drawing as PNG bytes, within the size limit; null for an empty board. */
  png: Uint8Array | null;
  /** The typed working, trimmed and within the size limit; "" when the child typed none. */
  text: string;
  /** The whiteboard strokes (#186) as checked JSON within the size limit; null or left out when there are none. */
  strokes?: string | null;
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
  /** What the child did before Next (#184), as the route bounded it; null or absent when the browser sent none. */
  events?: AnswerEvents | null;
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
  // #190: a question of the extra round. A round taken from the report runs on a completed test, until it is finished.
  const inRound = q !== null && mainAnswered(session);
  // The test is complete or no longer in progress, or a second tab (or a retried request) answered this question already.
  if (!takesAnswers(open) || !q || input.questionId !== q.id) {
    // The screen shows the step that comes with the conflict (#184).
    const step = stepOf(open);
    if (takesAnswers(open)) await shown(store, id, session, step, now);
    return { ok: false, error: "conflict", step };
  }
  const response = input.response.trim();
  const valid = q.format === "choice" ? (q.choices ?? []).includes(response) : response.length > 0 && response.length <= ANSWER_MAX;
  if (!valid || !Number.isFinite(input.timeMs) || input.timeMs < 0) return { ok: false, error: "invalid" };
  // #67: a show-your-work question needs work on the whiteboard; grades 1 and 2 draw only.
  const problem = workProblem(session, { drawn: input.work.png !== null, text: input.work.text });
  if (problem) return { ok: false, error: problem };
  const next = submitAnswer(session, { questionId: q.id, response, timeMs: Math.min(Math.round(input.timeMs), QUESTION_TIME_CAP_MS) });
  const marked = next.answers.at(-1)!;
  // #72: the deadline moves to 24 hours from this answer, only if the test is still open now. An answer that arrives
  // after the deadline, or after "Start again" expired the test, stops here and stores nothing. #190: an answer to the
  // extra round moves no deadline: every main answer is in, so the test never expires. The unique place of each answer
  // still keeps one answer per question.
  const until = inRound ? null : recordAnswer(attempt, now).resumeUntil;
  let questionShown: QuestionShown | null;
  if (until === null) {
    questionShown = await shownOf(store, id, session.answers.length);
  } else {
    let opened: boolean;
    try {
      // #184: the question's serve time is read beside the deadline move. A failed read stores the answer without it.
      [opened, questionShown] = await Promise.all([store.openAnswerWindow(id, now, until), shownOf(store, id, session.answers.length)]);
    } catch (e) {
      console.error("[test]", messageOf(e));
      return { ok: false, error: "store_failed" };
    }
    if (!opened) return freshConflict(store, parent, id, now);
  }
  /** An answer that was not stored gives no extra time: the deadline goes back where it was, unless something moved it since. */
  const failed = async (): Promise<Refusal> => {
    if (until !== null) await bestEffort("[test] deadline undo failed", () => store.undoAnswerWindow(id, until, attempt.resumeUntil));
    return { ok: false, error: "store_failed" };
  };

  // #186: the strokes upload at the same time as the drawing. If the answer is not stored, they go too.
  const strokesUpload = storeStrokes(store, parent, id, q.id, input.work.strokes);
  // The drawing first, under a new name, so the answer can point to it. If the answer is not stored, the drawing goes.
  let workPath: string | null = null;
  if (input.work.png) {
    try {
      workPath = await store.storeDrawing(parent, id, q.id, input.work.png);
    } catch (e) {
      logFailure("[work] upload failed", e);
      await removeStrokes(store, await strokesUpload);
      return failed();
    }
  }
  const strokesPath = await strokesUpload;
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
      strokesPath,
      timeline: { shownAt: questionShown?.questionId === q.id ? questionShown.at : null, answeredAt: now, events: input.events ?? null },
      round: inRound ? "extra" : "main",
    });
  } catch (e) {
    await removeDrawing(store, workPath);
    await removeStrokes(store, strokesPath);
    logFailure("[test] answer save failed", e);
    return failed();
  }
  if (inserted === "taken") {
    // Another request stored this question's answer first. Send the step after it, read fresh, so the screen moves on.
    await removeDrawing(store, workPath);
    await removeStrokes(store, strokesPath);
    return freshConflict(store, parent, id, now);
  }
  const route = next.route;
  const step = stepOf({ ...open, session: next });
  await Promise.all([
    (async () => {
      // The answer time is written only once the answer is stored: the reminder emails (#73) count from it.
      await bestEffort("[test] answer time save failed", () => store.recordAnswerTime(id, now));
      // Stage 1 just ended: record the route for the admin view.
      if (!session.route && route) await bestEffort("[test] route save failed", () => store.recordRoute(id, route));
    })(),
    // #184: the next question goes out in this response; #190: or the offer of the extra round.
    shown(store, id, next, step, now),
  ]);
  return { ok: true, step };
}

/** Logs a failed store write the way the answer route logged it before the module (#147): the line, then the cause. */
function logFailure(line: string, e: unknown): void {
  console.error(line, e instanceof StoreError ? e.detail : messageOf(e));
}

/** Removes a drawing whose answer was not stored, so the bucket holds no drawing without its answer. A failure is logged. */
const removeDrawing = (store: AttemptStore, path: string | null) =>
  path ? bestEffort("[work] remove failed", () => store.removeDrawing(path)) : Promise.resolve();

/**
 * Stores the whiteboard strokes of an answer (#186), if any, and returns their path. Strokes are for admins only, so a
 * failed upload never stops the child's answer: it is logged, and the answer is stored with the drawing alone.
 */
async function storeStrokes(store: AttemptStore, parent: string, id: string, questionId: string, json: string | null | undefined): Promise<string | undefined> {
  if (!json) return undefined;
  try {
    return await store.storeStrokes(parent, id, questionId, json);
  } catch (e) {
    logFailure("[strokes] upload failed", e);
    return undefined;
  }
}

/** Removes strokes whose answer was not stored, so the bucket holds no strokes without their answer. A failure is logged. */
const removeStrokes = (store: AttemptStore, path: string | undefined) =>
  path ? bestEffort("[strokes] remove failed", () => store.removeStrokes(path)) : Promise.resolve();

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
  if (!fresh.ok) return fresh;
  // The screen shows the step that comes with the conflict (#184).
  const step = stepOf(fresh);
  if (takesAnswers(fresh)) await shown(store, id, fresh.session, step, now);
  return { ok: false, error: "conflict", step };
}

/**
 * A stored test as the module reads it: the attempt, its session rebuilt from the answers, the extra round's record
 * (#190) and the stored answer to "Did anyone help?".
 */
interface ReadTest {
  ok: true;
  attempt: Attempt;
  session: Session;
  /** #185: the halfway break as stored, for a resume. */
  break?: BreakResume;
  round: ExtraRoundRecord;
  help: HelpAnswer | null;
}

/** The parent's test at `now`, or "expired" when it ran out of time: then it is marked expired if still in progress. */
async function openTest(store: AttemptStore, parent: string, id: string, now: number): Promise<ReadTest | Refusal> {
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
async function readTest(store: AttemptStore, parent: string, id: string): Promise<ReadTest | Refusal> {
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
  // A test with every answer in never expires: it only waits to be scored. #190: every main answer counts; an extra
  // round the child is still taking never closes the test.
  return {
    ok: true,
    attempt: { ...loaded.attempt, answeredAll: mainAnswered(session) },
    session,
    ...(loaded.break && { break: loaded.break }),
    round: loaded.extraRound ?? NO_ROUND,
    help: loaded.help ?? null,
  };
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
 * since the section started (its arrival), never earlier than the answer before it. It also stores the time on the fact
 * by the server (since the answer before) and by the browser (`browserMs`, when the screen sent one, #185); the fact
 * speed uses the browser's. Refuses with "conflict" when the
 * test is not in progress or the section has not started. An answer after the time is up, or for a fact already
 * answered, stores nothing: "conflict" with where the section is now. The store keeps one answer per fact, so when
 * another request stored this fact's answer in the same moment, this one gets "conflict" with a fresh step.
 */
export async function answerFact(
  store: AttemptStore,
  parent: string,
  id: string,
  now: number,
  { factId, response, browserMs }: { factId: string; response: string; browserMs?: number | null },
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
    next = submitFact(session, { factId, response, atMs, browserMs });
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
  const { attempt } = open;
  // #190: a round taken from the report finishes on the completed test, and scores it again. A test finished after a
  // stop stays "already" finished until the rest of the round is answered: a repeated finish (a lost response) runs the
  // report job again.
  if (attempt.status === "completed" && open.session.extra && open.round.finishedAt === null) {
    if (stopped(open.round) && testStep(open.session).status !== "complete") return { ok: true, id: attempt.id, finished: "already" };
    return finishRound(store, id, open, now);
  }
  if (attempt.status === "completed") return { ok: true, id: attempt.id, finished: "already" };
  // #190: a round the child stopped part way does not count: the test is scored as if the round had been skipped.
  const session = stopped(open.round) ? withoutRound(open.session) : open.session;
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

// The answer timeline (#184): the server records when it serves each question and when it receives each answer. The
// time the browser measures stays the thinking time; the admin shows both.

/** When the server first served the question at a place in a test (epoch ms, the server's clock). */
export interface QuestionShown {
  position: number;
  questionId: string;
  at: number;
}

/**
 * The store seam's operations for the serve times (#184): one row per place in a test. The module calls them only for
 * a test that `load` returned for the parent, so they take the test's id alone.
 */
export interface ShownStore {
  /** Records when the server first served the question at `shown.position`. A later serve of that place changes nothing. */
  recordShown(id: string, shown: QuestionShown): Promise<void>;
  /** When the server first served the question at `position`; null when it has no record (a serve before #184). */
  shownAt(id: string, position: number): Promise<QuestionShown | null>;
}

/** Records the serve of the question step the browser shows now. A failure is logged, and the request goes on. */
async function served(store: AttemptStore, id: string, session: Session, now: number): Promise<void> {
  const step = testStep(session);
  if (step.status !== "question") return;
  // The first question after halfway shows only after the break and the quick facts (#69, #70). The screen asks for it
  // again once the facts are done, and that serve is the one that counts.
  if (breakDue(step)) {
    const facts = await readSection(store, id);
    if (!facts.ok || !facts.section || stepAt(facts.section, now).status !== "done") return;
  }
  await bestEffort("[test] shown time save failed", () => store.recordShown(id, { position: session.answers.length, questionId: step.question.id, at: now }));
}

/** When the server first served the question at `position`; null when it has none or the read failed (logged). */
async function shownOf(store: AttemptStore, id: string, position: number): Promise<QuestionShown | null> {
  try {
    return await store.shownAt(id, position);
  } catch (e) {
    logFailure("[test] shown time load failed", e);
    return null;
  }
}

// The test context (#185): the halfway break and the device, saved once per test for the admin view and later
// analysis. The screen sends them beside the test and never waits for them, so a failure here never stops the child.
// The break's times are the server's clock: when it got "shown", and when it got the end. Its length is the browser's:
// the screen sends the end at once with the time from the break screen showing to the press, so a slow "shown" save or
// a slow network never makes the break longer.

/**
 * The store seam's operations for the test context. Device and shown writes require an open test. Each writes only
 * fields that are still empty, so the first record wins: a break shown again, or a resume on another device, changes
 * nothing. The module calls them only for a test that `load` returned for the parent, so they take the test's id alone.
 */
export interface ContextStore {
  /** Saves the device, only when the test has none yet. */
  recordDevice(id: string, device: TestDevice): Promise<void>;
  /** Saves when the halfway break was shown, only when the test has no break yet. */
  startBreak(id: string, at: number): Promise<void>;
  /**
   * Saves the end of the break: when it ended (`at`), whether the child skipped it, and its length. Only once: an ended
   * break changes nothing. When the break has no start yet (the end reached the server first, or "shown" was lost),
   * also saves the start, as `at - lengthMs`; a later "shown" then changes nothing. Takes an end after finish too,
   * within the existing resume deadline. Refuses expired rows. Does not change the score or the deadline.
   */
  endBreak(id: string, end: { at: number; skipped: boolean; lengthMs: number }): Promise<void>;
}

/** Why the module refused a context record: a subset of Refusal. */
export type ContextRefusal =
  | { ok: false; error: "not_found" }
  /** The stage, status, deadline or captured timing does not permit this context record. */
  | { ok: false; error: "conflict" }
  | StoreFailed;

export type ContextOutcome = { ok: true } | ContextRefusal;

/** The longest break kept: the test closes 24 hours after the last answer (#72). */
const BREAK_MAX_MS = 24 * 60 * 60_000;

/**
 * Saves the halfway break of the parent's test at `now`. A new screen requires the halfway point. An end is valid
 * from halfway onward, including after finish, until the existing resume deadline. Receipt time stays server time;
 * length stays browser time. An end received before its shown request can supply the missing start.
 */
export async function recordBreak(store: AttemptStore, parent: string, id: string, record: BreakRecord, now: number): Promise<ContextOutcome> {
  const read = await readTest(store, parent, id);
  if (!read.ok) return contextRefusal(read);
  const step = testStep(read.session);
  const pastBreak = step.status === "complete" || (step.status === "question" && step.number > step.breakAfter);
  const { attempt } = read;
  // Context does not extend the answer window. An end can arrive after finish, but cannot reopen an expired test,
  // create a new break screen after finish, or change any score. The store repeats the status/deadline guards.
  const eligible = record.event === "shown"
    ? attempt.status === "in_progress" && breakDue(step)
    : pastBreak && (attempt.status === "in_progress" || (attempt.status === "completed" && step.status === "complete"));
  if (!eligible || now > attempt.resumeUntil) return { ok: false, error: "conflict" };
  if (record.event !== "shown" && (!Number.isFinite(record.lengthMs) || record.lengthMs < 0)) return { ok: false, error: "conflict" };
  try {
    if (record.event === "shown") await store.startBreak(id, now);
    else await store.endBreak(id, { at: now, skipped: record.event === "skipped", lengthMs: Math.min(Math.round(record.lengthMs), BREAK_MAX_MS) });
  } catch (e) {
    return storeFailed(e);
  }
  return { ok: true };
}

/** Saves the device of the parent's test, once per test: a later device (a resume elsewhere) changes nothing. */
export async function recordDevice(store: AttemptStore, parent: string, id: string, device: TestDevice): Promise<ContextOutcome> {
  const read = await readTest(store, parent, id);
  if (!read.ok) return contextRefusal(read);
  if (read.attempt.status !== "in_progress") return { ok: false, error: "conflict" };
  try {
    await store.recordDevice(id, device);
  } catch (e) {
    return storeFailed(e);
  }
  return { ok: true };
}

/** A refused test read as a context refusal: the read refuses only with not_found or store_failed. */
function contextRefusal(refusal: Refusal): ContextRefusal {
  if (refusal.error === "not_found") return refusal;
  return refusal.error === "store_failed" ? refusal : { ok: false, error: "store_failed" };
}

// The optional extra round (#190, spec #181). After the last main question, only when an area's result is an early
// sign, the child can take up to 8 more questions or skip them, before "Did anyone help?". The assessment core draws
// the round and scores it; this stores it. A round taken during the test can be stopped part way: the test then goes on
// to "Did anyone help?" and is scored as if the round had been skipped, and the round's answers so far stay stored. A
// skipped or stopped round is offered again on the report while the test is the child's latest: then the round runs on
// the completed test, and its finish scores the test again (the finish route then runs the report job, which builds
// the report again).

/** #190: when the extra round was offered, skipped, started and finished (epoch ms, the server's clock); null when not. */
export interface ExtraRoundRecord {
  offeredAt: number | null;
  /** When the child skipped the round, or, when after the start, stopped it part way during the test. */
  skippedAt: number | null;
  startedAt: number | null;
  finishedAt: number | null;
}

/** A test with nothing recorded about the extra round. */
export const NO_ROUND: ExtraRoundRecord = { offeredAt: null, skippedAt: null, startedAt: null, finishedAt: null };

/**
 * True when the child stopped the round part way during the test: the store records the stop as a skip after the
 * start. (A skip before a round taken from the report comes before the start.)
 */
const stopped = ({ skippedAt, startedAt }: ExtraRoundRecord): boolean => startedAt !== null && skippedAt !== null && skippedAt >= startedAt;

/**
 * The store seam's operations for the extra round (#190). Each keeps one database guard. The module calls them only for
 * a test that `load` returned for the parent, so they take the test's id alone. `load` returns the round's record.
 */
export interface ExtraRoundStore {
  /** Records when the round was first offered. A later offer changes nothing. */
  recordExtraOffer(id: string, at: number): Promise<void>;
  /** Records the child's skip, only while the test is in progress and the round was neither skipped nor started. */
  skipExtraRound(id: string, at: number): Promise<void>;
  /**
   * Records the child's stop part way (as the skip time), only while the test is in progress and the round started and
   * was neither skipped nor finished.
   */
  stopExtraRound(id: string, at: number): Promise<void>;
  /**
   * Stores the test with its drawn round (`test.extra`) and the start time, only while the round has not started and
   * the test has not expired. "taken": another request started it first (or the test expired): read again.
   */
  startExtraRound(id: string, round: { at: number; test: StoredTest }): Promise<"stored" | "taken">;
  /**
   * A round taken from the report: stores the placement scored again with the round's answers, and the finish time,
   * only while the test is completed and its round started and not finished. False: another request finished it first.
   */
  finishExtraRound(id: string, finished: { at: number; placement: Placement }): Promise<boolean>;
}

/**
 * True while the test takes answers: in progress (until a stop of the round), or completed with a round taken from the
 * report (or stopped during the test) and not finished.
 */
const takesAnswers = ({ attempt, session, round }: ReadTest): boolean =>
  (attempt.status === "in_progress" && !stopped(round)) || (attempt.status === "completed" && !!session.extra && round.finishedAt === null);

/**
 * The step the screen shows next. When every answer of an open test is in and the child neither skipped nor took the
 * round, the step offers the round if an area is an early sign. After a stop, the step goes on to "Did anyone help?"
 * with the main test's total, as after a skip.
 */
function stepOf({ attempt, session, round }: ReadTest): TestStep {
  if (attempt.status === "in_progress" && stopped(round)) return testStep(withoutRound(session));
  const step = testStep(session);
  if (step.status !== "complete" || attempt.status !== "in_progress" || round.skippedAt !== null) return step;
  const offer = extraRoundOffer(session);
  return offer ? { ...step, extraRound: offer } : step;
}

/**
 * The child takes the extra round of the parent's test at `now`: the assessment core draws its questions, and the store
 * keeps them with the test and the start time. Sends the round's next question. Taking a round that has started (a
 * double click, a reload) sends where it is now; two requests at once start it once. "conflict" with the step when no
 * round is due.
 */
export async function takeExtraRound(store: AttemptStore, parent: string, id: string, now: number): Promise<StepOutcome> {
  const open = await openTest(store, parent, id, now);
  if (!open.ok) return open;
  if (open.session.extra) return carryOn(store, id, open, now);
  const refuse: Refusal = { ok: false, error: "conflict", step: stepOf(open) };
  if (open.attempt.status === "completed") {
    // From the report: only while the test is the child's latest.
    let latest: boolean;
    try {
      latest = await latestTest(store, parent, id);
    } catch (e) {
      return storeFailed(e);
    }
    if (!latest) return refuse;
  } else if (open.attempt.status !== "in_progress") {
    return refuse;
  }
  let next: Session;
  try {
    next = startExtraRound(open.session);
  } catch {
    return refuse;
  }
  let started: "stored" | "taken";
  try {
    started = await store.startExtraRound(id, { at: now, test: storedTest(next) });
  } catch (e) {
    return storeFailed(e);
  }
  if (started === "stored") return carryOn(store, id, { ...open, session: next }, now);
  // Another request started the round first: carry on with that one, read fresh.
  const fresh = await openTest(store, parent, id, now);
  if (!fresh.ok) return fresh;
  return fresh.session.extra ? carryOn(store, id, fresh, now) : { ok: false, error: "conflict", step: stepOf(fresh) };
}

/**
 * The child skips the extra round of the parent's test at `now`, during the test: the store records the skip, and the
 * step goes on to "Did anyone help?" without the offer. A second skip changes nothing. "conflict" with the step when no
 * round is due, or the round has started.
 */
export async function skipExtraRound(store: AttemptStore, parent: string, id: string, now: number): Promise<StepOutcome> {
  const open = await openTest(store, parent, id, now);
  if (!open.ok) return open;
  if (open.attempt.status !== "in_progress" || !extraRoundOffer(open.session)) return { ok: false, error: "conflict", step: stepOf(open) };
  try {
    await store.skipExtraRound(id, now);
  } catch (e) {
    return storeFailed(e);
  }
  return { ok: true, step: testStep(open.session) };
}

/**
 * The child stops the extra round part way during the parent's test at `now`: the store records the stop, and the step
 * goes on to "Did anyone help?". The finish then scores the main test alone; the round's answers so far stay stored, and
 * the report offers the rest. A second stop changes nothing. "conflict" with the step when no round taken during the
 * test has questions left. A round taken from the report needs no stop: its answers are saved as they come.
 */
export async function stopExtraRound(store: AttemptStore, parent: string, id: string, now: number): Promise<StepOutcome> {
  const open = await openTest(store, parent, id, now);
  if (!open.ok) return open;
  const { attempt, session, round } = open;
  if (attempt.status === "in_progress" && stopped(round)) return { ok: true, step: stepOf(open) };
  if (attempt.status !== "in_progress" || !session.extra || round.skippedAt !== null || !nextQuestion(session)) return { ok: false, error: "conflict", step: stepOf(open) };
  try {
    await store.stopExtraRound(id, now);
  } catch (e) {
    return storeFailed(e);
  }
  return { ok: true, step: stepOf({ ...open, round: { ...round, skippedAt: now } }) };
}

/**
 * #190: the extra round the child is taking during the parent's open test, for the start screen: taken during the test,
 * with questions left, and not stopped. Null otherwise, and when the test cannot be read. Writes nothing.
 */
export async function roundInProgress(store: AttemptStore, parent: string, id: string): Promise<{ answered: number; questions: number } | null> {
  const read = await readTest(store, parent, id);
  if (!read.ok || read.attempt.status !== "in_progress" || stopped(read.round) || !nextQuestion(read.session)) return null;
  const taken = extraRoundTaken(read.session);
  return taken && { answered: taken.answered, questions: taken.questions };
}

/** True when the parent's test is their child's latest: no other test of the child started after it. Throws on a store failure. */
async function latestTest(store: AttemptStore, parent: string, id: string): Promise<boolean> {
  const all = await store.attempts(parent);
  const test = all.find((a) => a.id === id);
  return !!test && !all.some((a) => a.childId === test.childId && a.id !== id && a.startedAt > test.startedAt);
}

/**
 * Finishes a round taken from the report on the completed test at `now`: scores the test again with the round's
 * answers, the facts section and the stored help answer, and stores the new placement once.
 */
async function finishRound(store: AttemptStore, id: string, read: ReadTest, now: number): Promise<FinishOutcome> {
  if (testStep(read.session).status !== "complete") return { ok: false, error: "incomplete" };
  const facts = await readSection(store, id);
  if (!facts.ok) return facts;
  const placement = finish(read.session, facts.section?.session ?? null, read.help);
  let won: boolean;
  try {
    won = await store.finishExtraRound(id, { at: now, placement });
  } catch (e) {
    return storeFailed(e);
  }
  return { ok: true, id: read.attempt.id, finished: won ? "now" : "already" };
}

/**
 * #190: what the report offers about the extra round: the round of a test whose child skipped it (or never saw the
 * offer), or the rest of a round the child stopped part way (during the test or from the report). Only for a completed
 * test that is the child's latest, with an early-sign area. Null otherwise, and when the test cannot be read. Writes
 * nothing.
 */
export type ExtraRoundState =
  | { kind: "offer"; offer: ExtraRoundOffer }
  | { kind: "continue"; offer: ExtraRoundOffer; answered: number };

export async function extraRoundState(store: AttemptStore, parent: string, id: string): Promise<ExtraRoundState | null> {
  const read = await readTest(store, parent, id);
  if (!read.ok || read.attempt.status !== "completed" || read.round.finishedAt !== null) return null;
  try {
    if (!(await latestTest(store, parent, id))) return null;
  } catch (e) {
    console.error("[test]", messageOf(e));
    return null;
  }
  const taken = extraRoundTaken(read.session);
  if (taken) {
    const { answered, ...offer } = taken;
    return { kind: "continue", offer, answered };
  }
  const offer = extraRoundOffer(read.session);
  return offer ? { kind: "offer", offer } : null;
}

/** Sends the step of a test that takes answers, and records it as shown. */
async function carryOn(store: AttemptStore, id: string, read: ReadTest, now: number): Promise<StepOutcome> {
  const step = stepOf(read);
  await shown(store, id, read.session, step, now);
  return { ok: true, step };
}

/** Records what the screen shows now: the serve of a question (#184), or the offer of the extra round. Failures are logged. */
async function shown(store: AttemptStore, id: string, session: Session, step: TestStep, now: number): Promise<void> {
  if (step.status === "complete") {
    if (step.extraRound) await bestEffort("[test] extra round offer save failed", () => store.recordExtraOffer(id, now));
    return;
  }
  await served(store, id, session, now);
}
