import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSession, nextQuestion, restoreSession, startAttempt, storedTest, submitAnswer, type Question, type Submission } from "@/lib/assessment";
import { memoryAttemptStore, type MemoryTest } from "@/lib/test-attempt-memory";

// The extra round route (#190) only translates: the child's choice goes to the test attempt module, and each result
// maps to a status code and JSON, as the other test routes do. The module's store is the in-memory one; the session is
// a signed-in parent id (or none), and the secret key is there or not.
vi.mock("server-only", () => ({}));

let signedIn: string | null;
let secretKey: boolean;
let memory: ReturnType<typeof memoryAttemptStore>;
let reportJobs: string[];

vi.mock("@/lib/supabase-auth", () => ({
  sessionClient: async () => ({}),
  parentId: async () => signedIn,
  adminClient: () => (secretKey ? {} : null),
}));
vi.mock("@/lib/test-attempt-server", () => ({ attemptStore: () => memory.store }));
vi.mock("next/server", async (original) => ({ ...(await original<typeof import("next/server")>()), after: (task: () => unknown) => void task() }));
vi.mock("@/lib/report-job", () => ({ runReportJob: async (id: string) => void reportJobs.push(id) }));

const { POST: extraRoute } = await import("@/app/api/account/assessments/[id]/extra/route");

const HOUR = 60 * 60_000;
const T0 = Date.UTC(2026, 9, 16, 18, 0);
const P1 = "5e55a000-0000-4000-8000-000000000001";
const CHILD = "c41d0000-0000-4000-8000-000000000001";
const TEST = "7e57a000-0000-4000-8000-000000000001";
const ASHA = { grade: 4, province: "BC" } as const;

const wrongTo = (q: Question) => (q.format === "choice" ? q.choices!.find((c) => c !== q.answer)! : "9999");

/** Asha's test from seed 1 with every main answer in, the first one wrong: one area is an early sign, so the round is due. */
function mainDone(): MemoryTest {
  const test = storedTest(createSession(ASHA, 1));
  let session = restoreSession(test, []);
  const answers: Submission[] = [];
  for (let q = nextQuestion(session); q; q = nextQuestion(session)) {
    answers.push({ questionId: q.id, response: answers.length === 0 ? wrongTo(q) : q.answer, timeMs: 20_000 });
    session = submitAnswer(session, answers.at(-1)!);
  }
  return { ...startAttempt(TEST, T0), parentId: P1, childId: CHILD, seed: 1, test, answers };
}

const choose = (body: unknown, id = TEST) =>
  extraRoute(new Request(`https://unica.test/api/account/assessments/${id}/extra`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }), { params: Promise.resolve({ id }) });

const sent = async (res: Response) => ({ status: res.status, body: await res.json() });

beforeEach(() => {
  signedIn = P1;
  secretKey = true;
  reportJobs = [];
  memory = memoryAttemptStore({ children: [{ id: CHILD, parentId: P1, ...ASHA }], tests: [mainDone()] });
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0 + HOUR);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("POST /api/account/assessments/[id]/extra", () => {
  it("takes the round: 200 with its first question, and the round is stored", async () => {
    const { status, body } = await sent(await choose({ take: true }));
    expect(status).toBe(200);
    expect(body).toMatchObject({ ok: true, step: { status: "question", number: 43, total: 50, extra: { number: 1, total: 8 } } });
    // The browser never gets an answer or the coded wrong answers.
    expect(JSON.stringify(body)).not.toMatch(/"answer"|"wrong"/);
    expect(memory.tests[0].test.extra).toHaveLength(8);
  });

  it("skips the round: 200 with the step to Did anyone help?, and the skip is stored", async () => {
    expect(await sent(await choose({ take: false }))).toEqual({ status: 200, body: { ok: true, step: { status: "complete", total: 42 } } });
    expect(memory.tests[0].extraRound?.skippedAt).toBe(T0 + HOUR);
  });

  it("refuses a skip once the round started: 409 with where the test is", async () => {
    await choose({ take: true });
    expect(await sent(await choose({ take: false }))).toMatchObject({ status: 409, body: { ok: false, error: "conflict", step: { number: 43 } } });
  });

  it("stops a round part way: 200 with the step to Did anyone help?, and the stop is stored", async () => {
    await choose({ take: true });
    vi.setSystemTime(T0 + 2 * HOUR);
    expect(await sent(await choose({ stop: true }))).toEqual({ status: 200, body: { ok: true, step: { status: "complete", total: 42 } } });
    expect(memory.tests[0].extraRound).toMatchObject({ startedAt: T0 + HOUR, skippedAt: T0 + 2 * HOUR });
  });

  it("refuses a stop before the round started: 409 with where the test is", async () => {
    expect(await sent(await choose({ stop: true }))).toMatchObject({ status: 409, body: { ok: false, error: "conflict", step: { status: "complete", extraRound: { questions: 8 } } } });
  });

  it("refuses a body without a yes or no as invalid, and bad JSON as bad_json; nothing is stored", async () => {
    expect(await sent(await choose({ take: "yes" }))).toEqual({ status: 400, body: { ok: false, error: "invalid" } });
    expect(await sent(await choose({ stop: "yes" }))).toEqual({ status: 400, body: { ok: false, error: "invalid" } });
    expect(await sent(await choose("{"))).toEqual({ status: 400, body: { ok: false, error: "bad_json" } });
    expect(memory.tests[0].extraRound?.skippedAt ?? null).toBeNull();
    expect(memory.tests[0].test.extra).toBeUndefined();
  });

  it("is 401 when signed out, 404 for an id that is not a test's, and 503 without the secret key", async () => {
    signedIn = null;
    expect(await sent(await choose({ take: true }))).toEqual({ status: 401, body: { ok: false, error: "signed_out" } });
    signedIn = P1;
    expect(await sent(await choose({ take: true }, "not-a-uuid"))).toEqual({ status: 404, body: { ok: false, error: "not_found" } });
    expect(await sent(await choose({ take: true }, "7e57a000-0000-4000-8000-000000000009"))).toEqual({ status: 404, body: { ok: false, error: "not_found" } });
    secretKey = false;
    expect(await sent(await choose({ take: true }))).toEqual({ status: 503, body: { ok: false, error: "store_failed" } });
    expect(memory.tests[0].test.extra).toBeUndefined();
  });
});
