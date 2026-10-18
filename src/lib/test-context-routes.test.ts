import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checked } from "@/lib/assessment/scripted-child";
import { createFacts, createSession, nextQuestion, restoreSession, startAttempt, storedTest, submitAnswer, type Attempt, type Submission } from "@/lib/assessment";
import { StoreError } from "@/lib/test-attempt";
import { memoryAttemptStore, type MemoryTest } from "@/lib/test-attempt-memory";
import type { TestDevice } from "@/lib/test-context";

// The test context routes (#185) only translate: the context route (the halfway break and the device) and the browser's
// time sent with each quick fact. The module's store is the in-memory one; the session is a signed-in parent id (or
// none), and the secret key is there or not. The clock is the server's (Date.now()).
vi.mock("server-only", () => ({}));
vi.mock("next/server", async (original) => ({ ...(await original<typeof import("next/server")>()), after: () => {} }));

let signedIn: string | null;
let secretKey: boolean;
let memory: ReturnType<typeof memoryAttemptStore>;

vi.mock("@/lib/supabase-auth", () => ({
  sessionClient: async () => ({}),
  parentId: async () => signedIn,
  adminClient: () => (secretKey ? {} : null),
}));
vi.mock("@/lib/test-attempt-server", () => ({ attemptStore: () => memory.store }));

const { POST: contextRoute } = await import("@/app/api/account/assessments/[id]/context/route");
const { POST: factsStartRoute } = await import("@/app/api/account/assessments/[id]/facts/route");
const { POST: factAnswerRoute } = await import("@/app/api/account/assessments/[id]/facts/answers/route");
const { GET: stepRoute } = await import("@/app/api/account/assessments/[id]/route");
const { POST: answerRoute } = await import("@/app/api/account/assessments/[id]/answers/route");
const { POST: finishRoute } = await import("@/app/api/account/assessments/[id]/finish/route");

const HOUR = 60 * 60_000;
const T0 = Date.UTC(2026, 10, 2, 18, 0);
const P1 = "5e55a000-0000-4000-8000-000000000001";
const P2 = "5e55a000-0000-4000-8000-000000000002";
const TEST = "7e57a000-0000-4000-8000-000000000001";
const ASHA = { grade: 4, province: "BC" } as const;
const IPAD: TestDevice = { deviceClass: "tablet", input: "pen", screenWidth: 1024, screenHeight: 1366, browser: "safari" };

/** Asha's test, with the first `answered` answers right. */
function stored(attempt: Attempt, { parent = P1, answered = 0 } = {}): MemoryTest {
  const test = storedTest(createSession(ASHA, 7));
  let session = restoreSession(test, []);
  const answers: Submission[] = [];
  for (let q = nextQuestion(session); q && answers.length < answered; q = nextQuestion(session)) {
    answers.push({ questionId: q.id, response: q.answer, timeMs: 20_000 });
    session = checked(submitAnswer(session, answers.at(-1)!));
  }
  // #253: past stage 1, its lock record (the route) is stored: 18 answers is the halfway break.
  return { ...attempt, parentId: parent, childId: "c41d0000-0000-4000-8000-000000000001", seed: 7, test, answers, ...(session.route && { route: session.route }) };
}

/** Asha's test with `answered` answers in (18: the halfway break), of parent `parent`, in status `status`. */
const testWith = (answered: number, { parent = P1, status = "in_progress" as MemoryTest["status"] } = {}) => {
  memory = memoryAttemptStore({ tests: [{ ...stored(startAttempt(TEST, T0), { parent, answered }), status }] });
  return memory;
};

const ctxOf = (id: string) => ({ params: Promise.resolve({ id }) });
const postJson = (url: string, body: unknown) =>
  new Request(url, { method: "POST", headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) });
const context = (id: string, body: unknown) => contextRoute(postJson(`https://unica.test/api/account/assessments/${id}/context`, body), ctxOf(id));
/** The status code and the JSON body. */
const sent = async (res: Response) => ({ status: res.status, body: await res.json() });
const OK = { status: 200, body: { ok: true } };
const breakOf = (t: MemoryTest) => ({ startedAt: t.breakStartedAt ?? null, endedAt: t.breakEndedAt ?? null, skipped: t.breakSkipped ?? null, lengthMs: t.breakMs ?? null });
const NO_BREAK = { startedAt: null, endedAt: null, skipped: null, lengthMs: null };

beforeEach(() => {
  signedIn = P1;
  secretKey = true;
  testWith(18);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0 + HOUR);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("POST /api/account/assessments/[id]/context (the halfway break and the device)", () => {
  it("returns a safe pending break state for reload and hides it from another parent", async () => {
    await context(TEST, { break: "shown" });
    const request = () => stepRoute(new Request(`https://unica.test/api/account/assessments/${TEST}`), ctxOf(TEST));
    const response = await request();
    const body = await response.json();
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(Object.keys(body).sort()).toEqual(["break", "ok", "step"]);
    expect(body.break).toEqual({ startedAt: T0 + HOUR, ended: false });
    expect(Object.keys(body.step.question).sort()).toEqual(["choices", "format", "id", "level", "prompt", "readAloud", "say", "showWork", "strand", "whiteboard"]);
    signedIn = P2;
    expect(await sent(await request())).toEqual({ status: 404, body: { ok: false, error: "not_found" } });
  });

  it("accepts an end after a later answer, and concurrent duplicate ends keep the first context", async () => {
    await context(TEST, { break: "shown" });
    const q = nextQuestion(restoreSession(memory.tests[0].test, memory.tests[0].answers, memory.tests[0].route ?? null))!;
    const response = await answerRoute(postJson(`https://unica.test/api/account/assessments/${TEST}/answers`, { questionId: q.id, response: q.answer, timeMs: 5_000, work: { text: "5 + 1" } }), ctxOf(TEST));
    expect(response.status).toBe(200);
    vi.setSystemTime(T0 + HOUR + 8_000);
    expect(await Promise.all([context(TEST, { break: "rested", lengthMs: 1_500 }), context(TEST, { break: "skipped", lengthMs: 8_000 })]).then((rs) => Promise.all(rs.map(sent)))).toEqual([OK, OK]);
    expect(memory.tests[0].answers).toHaveLength(19);
    expect(breakOf(memory.tests[0])).toEqual({ startedAt: T0 + HOUR, endedAt: T0 + HOUR + 8_000, skipped: false, lengthMs: 1_500 });
  });

  it("accepts a captured end after the finish route without changing the score or allowing new context", async () => {
    testWith(42);
    expect((await finishRoute(postJson(`https://unica.test/api/account/assessments/${TEST}/finish`, { help: "no" }), ctxOf(TEST))).status).toBe(200);
    const placement = structuredClone(memory.tests[0].placement);
    vi.setSystemTime(T0 + HOUR + 8_000);
    expect(await sent(await context(TEST, { break: "rested", lengthMs: 1_500 }))).toEqual(OK);
    expect(breakOf(memory.tests[0])).toMatchObject({ endedAt: T0 + HOUR + 8_000, skipped: false, lengthMs: 1_500 });
    expect(memory.tests[0].placement).toEqual(placement);
    expect(await sent(await context(TEST, { break: "shown" }))).toEqual({ status: 409, body: { ok: false, error: "conflict" } });
    expect(await sent(await context(TEST, { device: IPAD }))).toEqual({ status: 409, body: { ok: false, error: "conflict" } });
    vi.setSystemTime(T0 + 25 * HOUR);
    expect(await sent(await context(TEST, { break: "rested", lengthMs: 1_500 }))).toEqual({ status: 409, body: { ok: false, error: "conflict" } });
  });

  it("saves the break when it is shown and when it ends, with the length the browser measured", async () => {
    expect(await sent(await context(TEST, { break: "shown" }))).toEqual(OK);
    vi.setSystemTime(T0 + HOUR + 95_000);
    expect(await sent(await context(TEST, { break: "rested", lengthMs: 94_600.4 }))).toEqual(OK);
    expect(breakOf(memory.tests[0])).toEqual({ startedAt: T0 + HOUR, endedAt: T0 + HOUR + 95_000, skipped: false, lengthMs: 94_600 });
  });

  it("saves a skipped break whose end arrives before its start, and the late start changes nothing", async () => {
    vi.setSystemTime(T0 + HOUR + 1_500);
    expect(await sent(await context(TEST, { break: "skipped", lengthMs: 1_500 }))).toEqual(OK);
    vi.setSystemTime(T0 + HOUR + 8_000);
    expect(await sent(await context(TEST, { break: "shown" }))).toEqual(OK);
    expect(breakOf(memory.tests[0])).toEqual({ startedAt: T0 + HOUR, endedAt: T0 + HOUR + 1_500, skipped: true, lengthMs: 1_500 });
  });

  it("saves the device once per test", async () => {
    testWith(0);
    expect(await sent(await context(TEST, { device: IPAD }))).toEqual(OK);
    expect(await sent(await context(TEST, { device: { ...IPAD, deviceClass: "desktop", input: "mouse" } }))).toEqual(OK);
    expect(memory.tests[0].device).toEqual(IPAD);
  });

  it("answers 409 conflict for a break shown away from the halfway point, and for a test no longer in progress", async () => {
    testWith(5);
    expect(await sent(await context(TEST, { break: "shown" }))).toEqual({ status: 409, body: { ok: false, error: "conflict" } });
    testWith(18, { status: "completed" });
    expect(await sent(await context(TEST, { device: IPAD }))).toEqual({ status: 409, body: { ok: false, error: "conflict" } });
    expect(breakOf(memory.tests[0])).toEqual(NO_BREAK);
    expect(memory.tests[0].device ?? null).toBeNull();
  });

  it("answers 400 for a body that is not JSON, that has neither a device nor a break, or whose device or break does not fit", async () => {
    expect(await sent(await context(TEST, "{not json"))).toEqual({ status: 400, body: { ok: false, error: "bad_json" } });
    for (const body of [{}, null, { break: "lunch" }, { device: { ...IPAD, deviceClass: "watch" } }, { device: "ipad" }, { device: IPAD, break: "shown" }, { break: "skipped" }, { break: "rested", lengthMs: -1 }, { break: "rested", lengthMs: "900" }]) {
      expect(await sent(await context(TEST, body))).toEqual({ status: 400, body: { ok: false, error: "invalid" } });
    }
    expect(breakOf(memory.tests[0])).toEqual(NO_BREAK);
    expect(memory.tests[0].device ?? null).toBeNull();
  });

  it("answers 404 not_found for another family's test, an unknown test, or an id that is not a uuid", async () => {
    testWith(18, { parent: P2 });
    expect(await sent(await context(TEST, { break: "shown" }))).toEqual({ status: 404, body: { ok: false, error: "not_found" } });
    expect(await sent(await context("7e57a000-0000-4000-8000-0000000000ff", { device: IPAD }))).toEqual({ status: 404, body: { ok: false, error: "not_found" } });
    expect(await sent(await context("a1", { device: IPAD }))).toEqual({ status: 404, body: { ok: false, error: "not_found" } });
    expect(breakOf(memory.tests[0])).toEqual(NO_BREAK);
  });

  it("answers 502 store_failed when the store fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    memory.fail.startBreak = new StoreError("break save failed", "down");
    expect(await sent(await context(TEST, { break: "shown" }))).toEqual({ status: 502, body: { ok: false, error: "store_failed" } });
    memory.fail.recordDevice = new StoreError("device save failed", "down");
    expect(await sent(await context(TEST, { device: IPAD }))).toEqual({ status: 502, body: { ok: false, error: "store_failed" } });
  });

  it("answers 401 signed_out without a session, and 503 store_failed without the secret key", async () => {
    signedIn = null;
    expect(await sent(await context(TEST, { break: "shown" }))).toEqual({ status: 401, body: { ok: false, error: "signed_out" } });
    signedIn = P1;
    secretKey = false;
    expect(await sent(await context(TEST, { break: "shown" }))).toEqual({ status: 503, body: { ok: false, error: "store_failed" } });
    expect(breakOf(memory.tests[0])).toEqual(NO_BREAK);
  });
});

describe("POST /api/account/assessments/[id]/facts/answers (the browser's time on each fact)", () => {
  const FACTS = createFacts(ASHA, 7).facts;
  const factsUrl = `https://unica.test/api/account/assessments/${TEST}/facts`;
  const answerFact = (body: unknown) => factAnswerRoute(postJson(`${factsUrl}/answers`, body), ctxOf(TEST));
  const right = (n: number) => ({ factId: FACTS[n].id, response: String(FACTS[n].answer) });
  beforeEach(async () => {
    await factsStartRoute(postJson(factsUrl, {}), ctxOf(TEST));
  });

  it("stores the browser's time sent as timeMs beside the server's time, and none when the request has none", async () => {
    vi.setSystemTime(T0 + HOUR + 2_500);
    expect((await answerFact({ ...right(0), timeMs: 1_840.4 })).status).toBe(200);
    vi.setSystemTime(T0 + HOUR + 4_000);
    expect((await answerFact(right(1))).status).toBe(200);
    expect(memory.facts[0].answers.map(({ atMs, serverMs, browserMs }) => ({ atMs, serverMs, browserMs }))).toEqual([
      { atMs: 2_500, serverMs: 2_500, browserMs: 1_840 },
      { atMs: 4_000, serverMs: 1_500, browserMs: null },
    ]);
  });

  it("answers 400 invalid for a time that is not a time, and stores nothing", async () => {
    vi.setSystemTime(T0 + HOUR + 2_500);
    for (const timeMs of ["1840", -1, true]) {
      expect(await sent(await answerFact({ ...right(0), timeMs }))).toEqual({ status: 400, body: { ok: false, error: "invalid" } });
    }
    expect(memory.facts[0].answers).toEqual([]);
  });
});
