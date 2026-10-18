import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checked } from "@/lib/assessment/scripted-child";
import { createSession, nextQuestion, restoreSession, startAttempt, storedTest, submitAnswer, type Submission } from "@/lib/assessment";
import { memoryAttemptStore, type MemoryTest } from "@/lib/test-attempt-memory";

// The "Done checking" route (#253) only translates: the section goes to the test attempt module, and each result maps
// to a status code and JSON, as the other test routes do. The module's store is the in-memory one.
vi.mock("server-only", () => ({}));

let signedIn: string | null;
let memory: ReturnType<typeof memoryAttemptStore>;

vi.mock("@/lib/supabase-auth", () => ({
  sessionClient: async () => ({}),
  parentId: async () => signedIn,
  adminClient: () => ({}),
}));
vi.mock("@/lib/test-attempt-server", () => ({ attemptStore: () => memory.store }));

const { POST: checkRoute } = await import("@/app/api/account/assessments/[id]/check/route");

const HOUR = 60 * 60_000;
const T0 = Date.UTC(2026, 9, 18, 18, 0);
const P1 = "5e55a000-0000-4000-8000-000000000001";
const CHILD = "c41d0000-0000-4000-8000-000000000001";
const TEST = "7e57a000-0000-4000-8000-000000000001";
const ASHA = { grade: 4, province: "BC" } as const;

/** Asha's open test (seed 7) with every stage 1 answer in, right: on the stage 1 grid. */
function onStage1Grid(): MemoryTest {
  const test = storedTest(createSession(ASHA, 7));
  let session = restoreSession(test, []);
  const answers: Submission[] = [];
  for (let q = nextQuestion(session); q && answers.length < 18; q = nextQuestion(session)) {
    answers.push({ questionId: q.id, response: q.answer, timeMs: 20_000 });
    session = checked(submitAnswer(session, answers.at(-1)!));
  }
  return { ...startAttempt(TEST, T0), parentId: P1, childId: CHILD, seed: 7, test, answers };
}

const done = (body: unknown, id = TEST) =>
  checkRoute(new Request(`https://unica.test/api/account/assessments/${id}/check`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }), { params: Promise.resolve({ id }) });

const sent = async (res: Response) => ({ status: res.status, body: await res.json() });

beforeEach(() => {
  signedIn = P1;
  memory = memoryAttemptStore({ children: [{ id: CHILD, parentId: P1, ...ASHA }], tests: [onStage1Grid()] });
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0 + HOUR);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("POST /api/account/assessments/[id]/check", () => {
  it("locks stage 1: 200 with the first question after halfway, and the route is stored", async () => {
    const res = await done({ section: "stage1" });
    expect(res.headers.get("cache-control")).toBe("no-store");
    const { status, body } = await sent(res);
    expect(status).toBe(200);
    expect(body).toMatchObject({ ok: true, step: { status: "question", number: 19, breakAfter: 18 } });
    expect(JSON.stringify(body)).not.toMatch(/"answer"|"wrong"/);
    expect(memory.tests[0].route).toBe("up");
  });

  it("refuses the other section: 409 with the grid the test is on, and stores nothing", async () => {
    expect(await sent(await done({ section: "stage2" }))).toMatchObject({ status: 409, body: { ok: false, error: "conflict", step: { status: "check", section: "stage1" } } });
    expect(memory.tests[0].route ?? null).toBeNull();
  });

  it("refuses a body without a section, bad JSON, a signed-out parent and another family's test", async () => {
    expect(await sent(await done({}))).toEqual({ status: 400, body: { ok: false, error: "invalid" } });
    expect(await sent(await done("{"))).toEqual({ status: 400, body: { ok: false, error: "bad_json" } });
    expect(await sent(await done({ section: "stage1" }, "not-a-uuid"))).toEqual({ status: 404, body: { ok: false, error: "not_found" } });
    signedIn = "5e55a000-0000-4000-8000-000000000002";
    expect(await sent(await done({ section: "stage1" }))).toEqual({ status: 404, body: { ok: false, error: "not_found" } });
    signedIn = null;
    expect(await sent(await done({ section: "stage1" }))).toEqual({ status: 401, body: { ok: false, error: "signed_out" } });
    expect(memory.tests[0].route ?? null).toBeNull();
  });

  it("answers 502 store_failed when the lock cannot be stored, and the child stays on the grid", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    memory.fail.lockStage1 = new Error("timeout");
    expect(await sent(await done({ section: "stage1" }))).toEqual({ status: 502, body: { ok: false, error: "store_failed" } });
    expect(memory.tests[0].route ?? null).toBeNull();
  });
});
