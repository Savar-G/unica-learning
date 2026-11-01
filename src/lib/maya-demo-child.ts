// The demo child of Maya's admin test calls (#323): `npm run maya:demo-child -- --parent <test family>` gives a test
// family (D-099) a Grade 2 BC child named DEMO_NAME with one closed Grade 2 test whose first stage includes questions of
// the templates Maya supports (src/lib/question-package-assessment.ts). The test is stored as expired, started 40 days
// ago, so no reminder email is ever due for it (the late reminder stops after 7 days).
//
// The script changes only the child it made. It marks that child when it makes it (public.maya_demo_children), and it
// reuses or renames a marked child only, never a child found by name and shape (review round 2 of PR #385): a test
// family's own "Sam" or "Iris" is never touched. A marked child with an old name ("Maya Demo", then "Sam") is renamed.
// With no marked child, it makes a new one, unless the family already has a child named DEMO_NAME (it refuses then).
// Run again, it changes nothing.
//
// The name: not "Maya" (the AI), not a name the workbooks give their worked examples ("Sam's work" is Spot the error's
// wrong one; also Leah, Kai, Priya, Asha and the sample book's story names), and not another child of the
// workbook-samples test family.
//
// Seams: the store (Supabase: src/lib/maya-demo-child-store.ts; memory: src/lib/maya-demo-child-memory.ts), the clock
// and the seeds. No Next.js, React or network here.
import { createSession, storedTest, type StoredTest } from "@/lib/assessment";
import { SUPPORTED_ASSESSMENT_TEMPLATES } from "@/lib/question-package-assessment";

export const DEMO_NAME = "Iris";
/** How many seeds to try for a first stage with the most supported questions. */
const SEED_TRIES = 300;
const DAY = 86_400_000;

export interface DemoChild {
  id: string;
  firstName: string;
  grade: number;
  province: string;
}

export interface DemoChildStore {
  isTestFamily(parentId: string): Promise<boolean>;
  /** The child this script made in the family (its marker row), or null. */
  markedChild(parentId: string): Promise<DemoChild | null>;
  /** The family's children with this first name. */
  childrenNamed(parentId: string, name: string): Promise<DemoChild[]>;
  /** Makes a Grade 2 BC child and marks it as this script's, in that order. */
  createMarkedChild(parentId: string, name: string): Promise<DemoChild>;
  rename(parentId: string, childId: string, name: string): Promise<void>;
  /** The child's test ids. */
  tests(childId: string): Promise<string[]>;
  createTest(parentId: string, childId: string, test: { seed: number; test: StoredTest; startedAt: string; resumeUntil: string }): Promise<string>;
}

export interface DemoChildResult {
  child: DemoChild;
  testId: string;
  created: boolean;
  renamedFrom: string | null;
  testCreated: boolean;
}

/** Gives the test family its demo child and test, changing only the child this script made. Throws a plain refusal. */
export async function ensureDemoChild(store: DemoChildStore, parentId: string, options: { now: number; seed: () => number }): Promise<DemoChildResult> {
  if (!(await store.isTestFamily(parentId))) throw new Error("the family is not a test family (public.test_accounts)");

  let child = await store.markedChild(parentId);
  let created = false;
  let renamedFrom: string | null = null;
  if (child) {
    if (child.grade !== 2 || child.province !== "BC") throw new Error(`the marked demo child ${child.id} is not a Grade 2 BC child`);
    if (child.firstName !== DEMO_NAME) {
      if ((await store.childrenNamed(parentId, DEMO_NAME)).length > 0) throw new Error(`the family already has a child named ${DEMO_NAME}: the demo child keeps its name ${child.firstName}`);
      renamedFrom = child.firstName;
      await store.rename(parentId, child.id, DEMO_NAME);
      child = { ...child, firstName: DEMO_NAME };
    }
  } else {
    if ((await store.childrenNamed(parentId, DEMO_NAME)).length > 0) {
      throw new Error(`the family has a child named ${DEMO_NAME} that this script did not make: pick another family`);
    }
    child = await store.createMarkedChild(parentId, DEMO_NAME);
    created = true;
  }

  const tests = await store.tests(child.id);
  if (tests.length > 0) return { child, testId: tests[0], created, renamedFrom, testCreated: false };

  const supported = new Set(SUPPORTED_ASSESSMENT_TEMPLATES);
  let best = { seed: 0, count: 0 };
  for (let i = 0; i < SEED_TRIES; i++) {
    const seed = options.seed();
    const count = createSession({ grade: 2, province: "BC" }, seed).stage1.filter((q) => supported.has(q.templateId)).length;
    if (count > best.count) best = { seed, count };
  }
  if (best.count === 0) throw new Error(`no Grade 2 test with a supported question in ${SEED_TRIES} seeds`);
  const testId = await store.createTest(parentId, child.id, {
    seed: best.seed,
    test: storedTest(createSession({ grade: 2, province: "BC" }, best.seed)),
    startedAt: new Date(options.now - 40 * DAY).toISOString(),
    resumeUntil: new Date(options.now - 39 * DAY).toISOString(),
  });
  return { child, testId, created, renamedFrom, testCreated: true };
}
