// The test attempt module's store (src/lib/test-attempt.ts) in memory, for tests. It keeps the database's guards: one
// open test per child (the unique index assessments_one_open_per_child), updates that change a test only while it is
// still open (guarded updates), and reads that return only the given parent's rows. Every operation yields first, so
// two calls started together interleave as two requests would; the check and the write after it happen together, as
// in one database statement.
import type { Attempt, StoredTest, Submission } from "@/lib/assessment";
import type { AttemptChild, AttemptStore } from "@/lib/test-attempt";

/** A stored test: one row of public.assessments with its answers. */
export type MemoryTest = Attempt & { parentId: string; childId: string; seed: number; test: StoredTest; answers: Submission[] };
/** A row of public.children. */
export type MemoryChild = AttemptChild & { parentId: string };

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/** The attempt columns of a stored test, as the database returns them: never `answeredAll`. */
const attemptOf = ({ id, status, startedAt, lastAnswerAt, resumeUntil, completedAt }: MemoryTest): Attempt =>
  ({ id, status, startedAt, lastAnswerAt, resumeUntil, completedAt });

/**
 * A store over `children` and `tests`. The returned arrays are the store's rows, so a test can check what it holds.
 * A new test gets the id "a<n>", counting on from the tests given.
 */
export function memoryAttemptStore({ children: kids = [], tests: initial = [] }: { children?: MemoryChild[]; tests?: MemoryTest[] } = {}) {
  const children = kids.map((c) => ({ ...c }));
  const tests = initial.map((t) => ({ ...t, answers: [...t.answers] }));
  let next = tests.length;
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
      return row ? { attempt: attemptOf(row), test: row.test, answers: row.answers.map((a) => ({ ...a })) } : null;
    },
    async expire(id, now) {
      await begin("expire");
      const row = tests.find((t) => t.id === id && t.status === "in_progress" && t.resumeUntil < now);
      if (row) row.status = "expired";
    },
    async create(parent, child, { attempt, seed, test }) {
      await begin("create");
      if (tests.some((t) => t.childId === child.id && t.status === "in_progress")) return "taken";
      const id = `a${++next}`;
      tests.push({ ...attempt, id, parentId: parent, childId: child.id, seed, test, answers: [] });
      return { id };
    },
  };
  return { store, children, tests, fail };
}
