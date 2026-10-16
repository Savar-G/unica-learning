// The test attempt module's store (src/lib/test-attempt.ts) in memory, for tests. It keeps the database's guards: one
// open test per child (the unique index assessments_one_open_per_child), updates that change a test only while it is
// still open (guarded updates), and reads that return only the given parent's rows. Every operation yields first, so
// two calls started together interleave as two requests would; the check and the write after it happen together, as
// in one database statement. Answers (#147): one answer per place in a test (the unique index on assessment_id and
// position), and the drawings bucket as a map by path. Finish (#150): a test is completed only while it is in progress.
import type { Attempt, HelpAnswer, Placement, Route, StoredTest, Submission } from "@/lib/assessment";
import type { FactsTest } from "@/lib/assessment";
import { StoreError, type AttemptChild, type AttemptStore, type NewAnswer } from "@/lib/test-attempt";
import type { FactsStore, NewFactAnswer } from "@/lib/test-attempt";
import type { QuestionShown, ShownStore } from "@/lib/test-attempt";
import { NO_ROUND, type ExtraRoundRecord, type ExtraRoundStore } from "@/lib/test-attempt";
import { workPath } from "@/lib/work-payload";

/** A row of public.answers. A test can give only what the module reads back (a Submission); the module stores all of it. */
export type MemoryAnswer = Submission & Partial<NewAnswer>;
/**
 * A stored test: one row of public.assessments with its answers, in their places. `route`: none until stage 1 ends.
 * `placement` and `help` (the answer to "Did anyone help?"): none until the test is finished.
 */
export type MemoryTest = Attempt & {
  parentId: string;
  childId: string;
  seed: number;
  test: StoredTest;
  answers: MemoryAnswer[];
  route?: Route | null;
  placement?: Placement | null;
  help?: HelpAnswer | null;
  /** #190: the extra round's record; absent means nothing recorded. */
  extraRound?: ExtraRoundRecord;
};
/** A row of public.children. */
export type MemoryChild = AttemptChild & { parentId: string };
/** A test's facts section: one row of public.assessment_facts with its rows of public.fact_answers (`position` is 0-based). */
export interface MemoryFacts {
  assessmentId: string;
  startedAt: number;
  test: FactsTest;
  answers: NewFactAnswer[];
}

/** When the server first served the question at a place in a test (#184): one row of public.question_shows. */
export type MemoryShown = QuestionShown & { assessmentId: string };

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/** The attempt columns of a stored test, as the database returns them: never `answeredAll`. */
const attemptOf = ({ id, status, startedAt, lastAnswerAt, resumeUntil, completedAt }: MemoryTest): Attempt =>
  ({ id, status, startedAt, lastAnswerAt, resumeUntil, completedAt });

/**
 * A store over `children` and `tests`. The returned arrays are the store's rows, so a test can check what it holds.
 * A new test gets the id "a<n>", counting on from the tests given. `drawings` is the drawings bucket, by path.
 */
export function memoryAttemptStore({ children: kids = [], tests: initial = [] }: { children?: MemoryChild[]; tests?: MemoryTest[] } = {}) {
  const children = kids.map((c) => ({ ...c }));
  const tests = initial.map((t) => ({ ...t, answers: [...t.answers] }));
  let next = tests.length;
  const drawings = new Map<string, Uint8Array>();
  let drawn = 0;
  /** Set an operation's error to make every call of it throw, as a database error would. */
  const fail: Partial<Record<keyof AttemptStore, Error>> = {};
  const begin = async (operation: keyof AttemptStore) => {
    await tick();
    if (fail[operation]) throw fail[operation];
  };

  /**
   * The facts sections (#148), returned too, so a test can check them. They keep the database's guards: one section per
   * test (the primary key of public.assessment_facts), and one answer per position (unique in public.fact_answers).
   */
  const facts: MemoryFacts[] = [];
  const factsOps: FactsStore = {
    async loadFacts(id) {
      await begin("loadFacts");
      const row = facts.find((f) => f.assessmentId === id);
      if (!row) return null;
      const answers = [...row.answers].sort((x, y) => x.position - y.position).map(({ factId, response, atMs }) => ({ factId, response, atMs }));
      return { startedAt: row.startedAt, test: row.test, answers };
    },
    async insertFacts(id, { startedAt, test }) {
      await begin("insertFacts");
      if (!tests.some((t) => t.id === id)) throw new Error("assessment_facts: no such test"); // the foreign key
      if (facts.some((f) => f.assessmentId === id)) return "taken";
      facts.push({ assessmentId: id, startedAt, test, answers: [] });
      return "stored";
    },
    async insertFactAnswer(id, answer) {
      await begin("insertFactAnswer");
      const row = facts.find((f) => f.assessmentId === id);
      if (!row) throw new Error("fact_answers: the test has no facts section"); // the foreign key
      if (row.answers.some((a) => a.position === answer.position)) return "taken";
      row.answers.push({ ...answer });
      return "stored";
    },
  };

  /**
   * The serve times (#184), returned too, so a test can check them: rows of public.question_shows. They keep the
   * database's guard: one row per place in a test (the primary key), so a later serve changes nothing.
   */
  const shows: MemoryShown[] = [];
  const showsOps: ShownStore = {
    async recordShown(id, shown) {
      await begin("recordShown");
      if (!tests.some((t) => t.id === id)) throw new Error("question_shows: no such test"); // the foreign key
      if (shows.some((s) => s.assessmentId === id && s.position === shown.position)) return;
      shows.push({ assessmentId: id, ...shown });
    },
    async shownAt(id, position) {
      await begin("shownAt");
      const row = shows.find((s) => s.assessmentId === id && s.position === position);
      return row ? { position: row.position, questionId: row.questionId, at: row.at } : null;
    },
  };

  /**
   * The extra round (#190): the columns of public.assessments that record it. They keep the database's guards: an
   * offer is recorded once, a skip only while the test is in progress and the round not skipped or started, a round
   * starts once and not on an expired test, and a round from the report finishes once, on a completed test.
   */
  const roundOf = (row: MemoryTest) => (row.extraRound ??= { ...NO_ROUND });
  const roundOps: ExtraRoundStore = {
    async recordExtraOffer(id, at) {
      await begin("recordExtraOffer");
      const row = tests.find((t) => t.id === id);
      if (row) roundOf(row).offeredAt ??= at;
    },
    async skipExtraRound(id, at) {
      await begin("skipExtraRound");
      const row = tests.find((t) => t.id === id && t.status === "in_progress");
      if (row && roundOf(row).startedAt === null && roundOf(row).skippedAt === null) roundOf(row).skippedAt = at;
    },
    async startExtraRound(id, { at, test }) {
      await begin("startExtraRound");
      const row = tests.find((t) => t.id === id && t.status !== "expired");
      if (!row || roundOf(row).startedAt !== null) return "taken";
      row.test = test;
      roundOf(row).startedAt = at;
      return "stored";
    },
    async finishExtraRound(id, { at, placement }) {
      await begin("finishExtraRound");
      const row = tests.find((t) => t.id === id && t.status === "completed");
      if (!row || roundOf(row).startedAt === null || roundOf(row).finishedAt !== null) return false;
      row.placement = placement;
      roundOf(row).finishedAt = at;
      return true;
    },
  };

  const store: AttemptStore = {
    ...factsOps,
    ...showsOps,
    ...roundOps,
    async child(parent, childId) {
      await begin("child");
      const row = children.find((c) => c.id === childId && c.parentId === parent);
      return row ? { id: row.id, grade: row.grade, province: row.province } : null;
    },
    async attempts(parent, childId) {
      await begin("attempts");
      return tests
        .filter((t) => t.parentId === parent && (childId === undefined || t.childId === childId))
        // #189: a completed test whose stored placement may not be reliable (the database reads placement->pace->unreliable).
        .map((t) => ({ ...attemptOf(t), childId: t.childId, seed: t.seed, ...(t.status === "completed" && t.placement?.pace?.unreliable ? { unreliable: true } : {}) }));
    },
    async load(parent, id) {
      await begin("load");
      const row = tests.find((t) => t.id === id && t.parentId === parent);
      if (!row) return null;
      const answers = row.answers.map(({ questionId, response, timeMs }) => ({ questionId, response, timeMs }));
      // Stored as JSON, as in the database: a later write to the row does not change what was read.
      return { attempt: attemptOf(row), test: structuredClone(row.test), answers, help: row.help ?? null, extraRound: { ...(row.extraRound ?? NO_ROUND) } };
    },
    async expire(id, now) {
      await begin("expire");
      const row = tests.find((t) => t.id === id && t.status === "in_progress" && t.resumeUntil < now);
      if (row) row.status = "expired";
    },
    async openAnswerWindow(id, now, until) {
      await begin("openAnswerWindow");
      const row = tests.find((t) => t.id === id && t.status === "in_progress" && t.resumeUntil >= now);
      if (row) row.resumeUntil = until;
      return row !== undefined;
    },
    async recordAnswerTime(id, at) {
      await begin("recordAnswerTime");
      const row = tests.find((t) => t.id === id && (t.lastAnswerAt === null || t.lastAnswerAt < at));
      if (row) row.lastAnswerAt = at;
    },
    async undoAnswerWindow(id, until, previous) {
      await begin("undoAnswerWindow");
      const row = tests.find((t) => t.id === id && t.resumeUntil === until);
      if (row) row.resumeUntil = previous;
    },
    async storeDrawing(parent, id, questionId, png) {
      await begin("storeDrawing");
      const path = workPath(parent, id, questionId, String(++drawn));
      drawings.set(path, png);
      return path;
    },
    async removeDrawing(path) {
      await begin("removeDrawing");
      drawings.delete(path);
    },
    async insertAnswer(id, answer) {
      await begin("insertAnswer");
      const row = tests.find((t) => t.id === id);
      if (!row) throw new StoreError("answer save failed", "no such test");
      // One answer per place (the unique index on assessment_id and position).
      if (answer.position < row.answers.length) return "taken";
      row.answers.push({ ...answer });
      return "stored";
    },
    async recordRoute(id, route) {
      await begin("recordRoute");
      const row = tests.find((t) => t.id === id);
      if (row) row.route = route;
    },
    async complete(id, { at, placement, help }) {
      await begin("complete");
      const row = tests.find((t) => t.id === id && t.status === "in_progress");
      if (!row) return;
      Object.assign(row, { status: "completed", completedAt: at, route: placement.route, placement, help });
      // #190: a round taken during the test finishes with it.
      if (placement.extraRound) roundOf(row).finishedAt = at;
    },
    async create(parent, child, { attempt, seed, test }) {
      await begin("create");
      if (tests.some((t) => t.childId === child.id && t.status === "in_progress")) return "taken";
      const id = `a${++next}`;
      tests.push({ ...attempt, id, parentId: parent, childId: child.id, seed, test, answers: [] });
      return { id };
    },
  };
  return { store, children, tests, drawings, facts, shows, fail };
}
