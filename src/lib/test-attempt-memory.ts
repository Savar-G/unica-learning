// The test attempt module's store (src/lib/test-attempt.ts) in memory, for tests. It keeps the database's guards: one
// open test per child (the unique index assessments_one_open_per_child), updates that change a test only while it is
// still open (guarded updates), and reads that return only the given parent's rows. Every operation yields first, so
// two calls started together interleave as two requests would; the check and the write after it happen together, as
// in one database statement. Answers (#147): one answer per place in a test (the unique index on assessment_id and
// position), and the drawings bucket as a map by path.
import type { Attempt, Route, StoredTest, Submission } from "@/lib/assessment";
import { StoreError, type AttemptChild, type AttemptStore, type NewAnswer } from "@/lib/test-attempt";
import { workPath } from "@/lib/work-payload";

/** A row of public.answers. A test can give only what the module reads back (a Submission); the module stores all of it. */
export type MemoryAnswer = Submission & Partial<NewAnswer>;
/** A stored test: one row of public.assessments with its answers, in their places. `route`: none until stage 1 ends. */
export type MemoryTest = Attempt & { parentId: string; childId: string; seed: number; test: StoredTest; answers: MemoryAnswer[]; route?: Route | null };
/** A row of public.children. */
export type MemoryChild = AttemptChild & { parentId: string };

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

  const store: AttemptStore = {
    async child(parent, childId) {
      await begin("child");
      const row = children.find((c) => c.id === childId && c.parentId === parent);
      return row ? { id: row.id, grade: row.grade, province: row.province } : null;
    },
    async attempts(parent, childId) {
      await begin("attempts");
      return tests
        .filter((t) => t.parentId === parent && (childId === undefined || t.childId === childId))
        .map((t) => ({ ...attemptOf(t), childId: t.childId, seed: t.seed }));
    },
    async load(parent, id) {
      await begin("load");
      const row = tests.find((t) => t.id === id && t.parentId === parent);
      return row ? { attempt: attemptOf(row), test: row.test, answers: row.answers.map(({ questionId, response, timeMs }) => ({ questionId, response, timeMs })) } : null;
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
    async create(parent, child, { attempt, seed, test }) {
      await begin("create");
      if (tests.some((t) => t.childId === child.id && t.status === "in_progress")) return "taken";
      const id = `a${++next}`;
      tests.push({ ...attempt, id, parentId: parent, childId: child.id, seed, test, answers: [] });
      return { id };
    },
  };
  return { store, children, tests, drawings, fail };
}
