import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSession, nextQuestion, recordAnswer, restoreSession, startAttempt, storedTest, submitAnswer, type Attempt, type Grade, type Submission } from "@/lib/assessment";
import { StoreError } from "@/lib/test-attempt";
import { memoryAttemptStore, type MemoryTest } from "@/lib/test-attempt-memory";
import { createFacts } from "@/lib/assessment";

// The start route and the next-step route (#146) only translate: each result of the test attempt module maps to the
// status code and JSON the browser got before the module. The module's store is the in-memory one; the session is a
// signed-in parent id (or none), and the secret key is there or not.
vi.mock("server-only", () => ({}));

let signedIn: string | null;
let secretKey: boolean;
let memory: ReturnType<typeof memoryAttemptStore>;

vi.mock("@/lib/supabase-auth", () => ({
  sessionClient: async () => ({}),
  parentId: async () => signedIn,
  adminClient: () => (secretKey ? {} : null),
}));
vi.mock("@/lib/test-attempt-server", () => ({ attemptStore: () => memory.store }));

const { POST: startRoute } = await import("@/app/api/account/assessments/route");
const { GET: stepRoute } = await import("@/app/api/account/assessments/[id]/route");
const { GET: factsRoute, POST: factsStartRoute } = await import("@/app/api/account/assessments/[id]/facts/route");
const { POST: factAnswerRoute } = await import("@/app/api/account/assessments/[id]/facts/answers/route");

const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;
const T0 = Date.UTC(2026, 9, 10, 18, 0);
const P1 = "5e55a000-0000-4000-8000-000000000001";
const P2 = "5e55a000-0000-4000-8000-000000000002";
const CHILD = "c41d0000-0000-4000-8000-000000000001";
const TEST = "7e57a000-0000-4000-8000-000000000001";
const ASHA = { grade: 4, province: "BC" } as const;

/** Asha's test, with the first `answered` answers right. */
function stored(attempt: Attempt, { parent = P1, answered = 0 } = {}): MemoryTest {
  const test = storedTest(createSession(ASHA, 7));
  let session = restoreSession(test, []);
  const answers: Submission[] = [];
  for (let q = nextQuestion(session); q && answers.length < answered; q = nextQuestion(session)) {
    answers.push({ questionId: q.id, response: q.answer, timeMs: 20_000 });
    session = submitAnswer(session, answers.at(-1)!);
  }
  return { ...attempt, parentId: parent, childId: CHILD, seed: 7, test, answers };
}

/** Parent 1's family, Asha (grade 4, BC) and her tests. */
const family = (...tests: MemoryTest[]) => {
  memory = memoryAttemptStore({ children: [{ id: CHILD, parentId: P1, ...ASHA }], tests });
  return memory;
};

const start = (body: unknown) =>
  startRoute(new Request("https://unica.test/api/account/assessments", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }));
const step = (id: string) => stepRoute(new Request(`https://unica.test/api/account/assessments/${id}`), { params: Promise.resolve({ id }) });

/** The status code and the JSON body. */
const sent = async (res: Response) => ({ status: res.status, body: await res.json() });

beforeEach(() => {
  signedIn = P1;
  secretKey = true;
  family();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("POST /api/account/assessments (start or continue)", () => {
  it("starts the first test", async () => {
    expect(await sent(await start({ childId: CHILD }))).toEqual({ status: 200, body: { ok: true, id: "a1", resumed: false } });
    expect(memory.tests).toMatchObject([{ id: "a1", parentId: P1, childId: CHILD, status: "in_progress", startedAt: T0 }]);
  });

  it("continues the open test", async () => {
    family(stored(startAttempt(TEST, T0), { answered: 3 }));
    vi.setSystemTime(T0 + 2 * HOUR);
    expect(await sent(await start({ childId: CHILD }))).toEqual({ status: 200, body: { ok: true, id: TEST, resumed: true } });
  });

  it("answers 410 expired when the open test ran out of time, and 200 with a new test on Start again", async () => {
    family(stored(startAttempt(TEST, T0), { answered: 3 }));
    vi.setSystemTime(T0 + 25 * HOUR);
    expect(await sent(await start({ childId: CHILD }))).toEqual({ status: 410, body: { ok: false, error: "expired" } });
    expect(await sent(await start({ childId: CHILD, restart: true }))).toEqual({ status: 200, body: { ok: true, id: "a2", resumed: false } });
  });

  it("answers 409 retake_closed with the date the next test opens", async () => {
    family({ ...stored(startAttempt(TEST, T0)), status: "completed", completedAt: T0 + HOUR });
    vi.setSystemTime(T0 + 3 * DAY);
    expect(await sent(await start({ childId: CHILD }))).toEqual({ status: 409, body: { ok: false, error: "retake_closed", opensAt: "2026-11-09T19:00:00.000Z" } });
  });

  it("answers 409 not_ready for a grade the question bank cannot cover", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    memory = memoryAttemptStore({ children: [{ id: CHILD, parentId: P1, grade: 9 as Grade, province: "BC" }] });
    expect(await sent(await start({ childId: CHILD }))).toEqual({ status: 409, body: { ok: false, error: "not_ready" } });
  });

  it("answers 503 store_failed when other requests keep opening a test first", async () => {
    // The child's open test is not one the parent can read, so every new test is "taken" and every read finds none.
    family({ ...stored(startAttempt(TEST, T0)), parentId: P2 });
    expect(await sent(await start({ childId: CHILD }))).toEqual({ status: 503, body: { ok: false, error: "store_failed" } });
  });

  it("answers 502 store_failed when the store fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    memory.fail.create = new StoreError("start failed", "down");
    expect(await sent(await start({ childId: CHILD }))).toEqual({ status: 502, body: { ok: false, error: "store_failed" } });
    family();
    memory.fail.child = new StoreError("child load failed", "down");
    expect(await sent(await start({ childId: CHILD }))).toEqual({ status: 502, body: { ok: false, error: "store_failed" } });
  });

  it("answers 404 not_found for a child of another family", async () => {
    signedIn = P2;
    expect(await sent(await start({ childId: CHILD }))).toEqual({ status: 404, body: { ok: false, error: "not_found" } });
    expect(memory.tests).toEqual([]);
  });

  it("answers 400 for a body that is not JSON, or a child id that is not a uuid", async () => {
    expect(await sent(await start("{not json"))).toEqual({ status: 400, body: { ok: false, error: "bad_json" } });
    expect(await sent(await start({ childId: "child-1" }))).toEqual({ status: 400, body: { ok: false, error: "invalid" } });
    expect(await sent(await start(null))).toEqual({ status: 400, body: { ok: false, error: "invalid" } });
  });

  it("answers 401 signed_out without a session, and 503 store_failed without the secret key", async () => {
    signedIn = null;
    expect(await sent(await start({ childId: CHILD }))).toEqual({ status: 401, body: { ok: false, error: "signed_out" } });
    signedIn = P1;
    secretKey = false;
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await sent(await start({ childId: CHILD }))).toEqual({ status: 503, body: { ok: false, error: "store_failed" } });
    expect(memory.tests).toEqual([]);
  });
});

describe("GET /api/account/assessments/[id] (the next step)", () => {
  it("sends the next question without its answer, never cached", async () => {
    family(stored(startAttempt(TEST, T0), { answered: 3 }));
    const res = await step(TEST);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const { status, body } = await sent(res);
    expect(status).toBe(200);
    expect(body).toMatchObject({ ok: true, step: { status: "question", number: 4, total: 36, breakAfter: 18, question: { id: memory.tests[0].test.stage1[3].id } } });
    expect(body.step.question).not.toHaveProperty("answer");
  });

  it("sends complete when every answer is in, even past the deadline", async () => {
    family(stored(recordAnswer(startAttempt(TEST, T0), T0 + HOUR), { answered: 36 }));
    vi.setSystemTime(T0 + 3 * DAY);
    const res = await step(TEST);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await sent(res)).toEqual({ status: 200, body: { ok: true, step: { status: "complete", total: 36 } } });
  });

  it("answers 410 expired when the test ran out of time, and the test is then expired", async () => {
    family(stored(startAttempt(TEST, T0), { answered: 3 }));
    vi.setSystemTime(T0 + 25 * HOUR);
    expect(await sent(await step(TEST))).toEqual({ status: 410, body: { ok: false, error: "expired" } });
    expect(memory.tests[0].status).toBe("expired");
  });

  it("answers 404 not_found for another family's test, an unknown test, or an id that is not a uuid", async () => {
    family(stored(startAttempt(TEST, T0), { parent: P2 }));
    expect(await sent(await step(TEST))).toEqual({ status: 404, body: { ok: false, error: "not_found" } });
    expect(await sent(await step("7e57a000-0000-4000-8000-0000000000ff"))).toEqual({ status: 404, body: { ok: false, error: "not_found" } });
    expect(await sent(await step("a1"))).toEqual({ status: 404, body: { ok: false, error: "not_found" } });
  });

  it("answers 502 store_failed when the store fails, and 500 when the stored test cannot be rebuilt", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    family(stored(startAttempt(TEST, T0)));
    memory.fail.load = new StoreError("load failed", "down");
    expect(await sent(await step(TEST))).toEqual({ status: 502, body: { ok: false, error: "store_failed" } });
    const broken = stored(startAttempt(TEST, T0), { answered: 2 });
    broken.answers[0].questionId = "not-this-test";
    family(broken);
    expect(await sent(await step(TEST))).toEqual({ status: 500, body: { ok: false, error: "store_failed" } });
  });

  it("answers 401 signed_out without a session, and 503 store_failed without the secret key", async () => {
    family(stored(startAttempt(TEST, T0)));
    signedIn = null;
    expect(await sent(await step(TEST))).toEqual({ status: 401, body: { ok: false, error: "signed_out" } });
    signedIn = P1;
    secretKey = false;
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await sent(await step(TEST))).toEqual({ status: 503, body: { ok: false, error: "store_failed" } });
  });
});

// The three routes of the timed facts section (#148) only translate too: each result of the module's facts section
// maps to the status code and JSON the browser got before the module. The clock is the server's (Date.now()).
const factsUrl = (id: string) => `https://unica.test/api/account/assessments/${id}/facts`;
const ctxOf = (id: string) => ({ params: Promise.resolve({ id }) });
const readFactsRoute = (id: string) => factsRoute(new Request(factsUrl(id)), ctxOf(id));
const startFactsRoute = (id: string) =>
  factsStartRoute(new Request(factsUrl(id), { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }), ctxOf(id));
const answerFactRoute = (id: string, body: unknown) =>
  factAnswerRoute(new Request(`${factsUrl(id)}/answers`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }), ctxOf(id));

/** The facts of Asha's test (seed 7). */
const FACTS = createFacts(ASHA, 7).facts;
/** The facts the browser gets from fact `from` on: never the answers. */
const shown = (from: number) => FACTS.slice(from).map(({ id, a, op, b }) => ({ id, a, op, b }));
/** The right answer to fact `n`. */
const right = (n: number) => ({ factId: FACTS[n].id, response: String(FACTS[n].answer) });
/** Asha's test at the halfway break: the 18 questions of stage 1 are answered. */
const atBreak = (status: MemoryTest["status"] = "in_progress") => family({ ...stored(startAttempt(TEST, T0), { answered: 18 }), status });
/** Asha's test at the break, with the facts section started by the server's clock at T0 + 1 hour. */
const factsStarted = async () => {
  atBreak();
  vi.setSystemTime(T0 + HOUR);
  await startFactsRoute(TEST);
};
/** A stored section the assessment core cannot rebuild: its first answer is for another fact. */
const brokenFacts = () => memory.facts.push({
  assessmentId: TEST,
  startedAt: T0 + HOUR,
  test: { grade: 4, facts: FACTS },
  answers: [{ position: 0, factId: FACTS[5].id, response: "1", correct: false, atMs: 900 }],
});

describe("GET /api/account/assessments/[id]/facts (where the facts section is)", () => {
  it("sends ready before the section starts, never cached", async () => {
    atBreak();
    const res = await readFactsRoute(TEST);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await sent(res)).toEqual({ status: 200, body: { ok: true, step: { status: "ready", seconds: 60 } } });
  });

  it("sends the facts still to come and the time left by the server's clock, never cached, then done", async () => {
    await factsStarted();
    vi.setSystemTime(T0 + HOUR + 2_000);
    await answerFactRoute(TEST, right(0));
    vi.setSystemTime(T0 + HOUR + 20_000);
    const running = await readFactsRoute(TEST);
    expect(running.headers.get("cache-control")).toBe("no-store");
    expect(await sent(running)).toEqual({ status: 200, body: { ok: true, step: { status: "running", seconds: 60, remainingMs: 40_000, answered: 1, facts: shown(1) } } });
    vi.setSystemTime(T0 + HOUR + 60_000);
    const done = await readFactsRoute(TEST);
    expect(done.headers.get("cache-control")).toBe("no-store");
    expect(await sent(done)).toEqual({ status: 200, body: { ok: true, step: { status: "done", answered: 1 } } });
  });

  it("answers 404 not_found for another family's test, an unknown test, or an id that is not a uuid", async () => {
    family(stored(startAttempt(TEST, T0), { parent: P2, answered: 18 }));
    expect(await sent(await readFactsRoute(TEST))).toEqual({ status: 404, body: { ok: false, error: "not_found" } });
    expect(await sent(await readFactsRoute("7e57a000-0000-4000-8000-0000000000ff"))).toEqual({ status: 404, body: { ok: false, error: "not_found" } });
    expect(await sent(await readFactsRoute("a1"))).toEqual({ status: 404, body: { ok: false, error: "not_found" } });
  });

  it("answers 502 store_failed when the store fails, and 500 when the stored section cannot be rebuilt", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    atBreak();
    memory.fail.load = new StoreError("load failed", "down");
    const failed = await readFactsRoute(TEST);
    expect(failed.headers.get("cache-control")).toBeNull();
    expect(await sent(failed)).toEqual({ status: 502, body: { ok: false, error: "store_failed" } });
    atBreak();
    memory.fail.loadFacts = new StoreError("load failed", "down");
    expect(await sent(await readFactsRoute(TEST))).toEqual({ status: 502, body: { ok: false, error: "store_failed" } });
    atBreak();
    brokenFacts();
    expect(await sent(await readFactsRoute(TEST))).toEqual({ status: 500, body: { ok: false, error: "store_failed" } });
  });

  it("answers 401 signed_out without a session, and 503 store_failed without the secret key", async () => {
    atBreak();
    signedIn = null;
    expect(await sent(await readFactsRoute(TEST))).toEqual({ status: 401, body: { ok: false, error: "signed_out" } });
    signedIn = P1;
    secretKey = false;
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await sent(await readFactsRoute(TEST))).toEqual({ status: 503, body: { ok: false, error: "store_failed" } });
  });
});

describe("POST /api/account/assessments/[id]/facts (start the section)", () => {
  it("starts the section by the server's clock, and sends every fact without its answer", async () => {
    atBreak();
    vi.setSystemTime(T0 + HOUR);
    expect(await sent(await startFactsRoute(TEST)))
      .toEqual({ status: 200, body: { ok: true, step: { status: "running", seconds: 60, remainingMs: 60_000, answered: 0, facts: shown(0) } } });
    expect(memory.facts).toMatchObject([{ assessmentId: TEST, startedAt: T0 + HOUR, answers: [] }]);
  });

  it("starts once when pressed twice at once, and carries on with the running section on a second Start", async () => {
    atBreak();
    vi.setSystemTime(T0 + HOUR);
    const both = await Promise.all([startFactsRoute(TEST), startFactsRoute(TEST)]);
    const running = { status: 200, body: { ok: true, step: { status: "running", seconds: 60, remainingMs: 60_000, answered: 0, facts: shown(0) } } };
    expect(await Promise.all(both.map(sent))).toEqual([running, running]);
    expect(memory.facts).toHaveLength(1);
    vi.setSystemTime(T0 + HOUR + 25_000);
    expect(await sent(await startFactsRoute(TEST)))
      .toEqual({ status: 200, body: { ok: true, step: { status: "running", seconds: 60, remainingMs: 35_000, answered: 0, facts: shown(0) } } });
    expect(memory.facts).toMatchObject([{ startedAt: T0 + HOUR }]);
  });

  it("answers 409 conflict once the test is completed or expired", async () => {
    atBreak("completed");
    expect(await sent(await startFactsRoute(TEST))).toEqual({ status: 409, body: { ok: false, error: "conflict" } });
    atBreak("expired");
    expect(await sent(await startFactsRoute(TEST))).toEqual({ status: 409, body: { ok: false, error: "conflict" } });
    expect(memory.facts).toEqual([]);
  });

  it("answers 404 not_found for another family's test, an unknown test, or an id that is not a uuid", async () => {
    family(stored(startAttempt(TEST, T0), { parent: P2, answered: 18 }));
    expect(await sent(await startFactsRoute(TEST))).toEqual({ status: 404, body: { ok: false, error: "not_found" } });
    expect(await sent(await startFactsRoute("7e57a000-0000-4000-8000-0000000000ff"))).toEqual({ status: 404, body: { ok: false, error: "not_found" } });
    expect(await sent(await startFactsRoute("a1"))).toEqual({ status: 404, body: { ok: false, error: "not_found" } });
    expect(memory.facts).toEqual([]);
  });

  it("answers 502 store_failed when the store fails, and 500 when the stored section cannot be rebuilt", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    atBreak();
    memory.fail.insertFacts = new StoreError("start failed", "down");
    expect(await sent(await startFactsRoute(TEST))).toEqual({ status: 502, body: { ok: false, error: "store_failed" } });
    atBreak();
    memory.fail.load = new StoreError("load failed", "down");
    expect(await sent(await startFactsRoute(TEST))).toEqual({ status: 502, body: { ok: false, error: "store_failed" } });
    atBreak();
    brokenFacts();
    expect(await sent(await startFactsRoute(TEST))).toEqual({ status: 500, body: { ok: false, error: "store_failed" } });
  });

  it("answers 401 signed_out without a session, and 503 store_failed without the secret key", async () => {
    atBreak();
    signedIn = null;
    expect(await sent(await startFactsRoute(TEST))).toEqual({ status: 401, body: { ok: false, error: "signed_out" } });
    signedIn = P1;
    secretKey = false;
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await sent(await startFactsRoute(TEST))).toEqual({ status: 503, body: { ok: false, error: "store_failed" } });
    expect(memory.facts).toEqual([]);
  });
});

describe("POST /api/account/assessments/[id]/facts/answers (answer one fact)", () => {
  it("stores the answer at its arrival time by the server's clock, and sends the facts still to come", async () => {
    await factsStarted();
    vi.setSystemTime(T0 + HOUR + 2_500);
    expect(await sent(await answerFactRoute(TEST, right(0))))
      .toEqual({ status: 200, body: { ok: true, step: { status: "running", seconds: 60, remainingMs: 57_500, answered: 1, facts: shown(1) } } });
    expect(memory.facts[0].answers).toEqual([{ position: 0, factId: FACTS[0].id, response: String(FACTS[0].answer), correct: true, atMs: 2_500 }]);
  });

  it("answers 409 conflict with where the section is now for a fact already answered, and stores it once", async () => {
    await factsStarted();
    vi.setSystemTime(T0 + HOUR + 2_000);
    await answerFactRoute(TEST, right(0));
    vi.setSystemTime(T0 + HOUR + 2_300);
    expect(await sent(await answerFactRoute(TEST, right(0))))
      .toEqual({ status: 409, body: { ok: false, error: "conflict", step: { status: "running", seconds: 60, remainingMs: 57_700, answered: 1, facts: shown(1) } } });
    expect(memory.facts[0].answers).toHaveLength(1);
  });

  it("answers 409 conflict with a done step for an answer after the time is up, and stores nothing", async () => {
    await factsStarted();
    vi.setSystemTime(T0 + HOUR + 63_001);
    expect(await sent(await answerFactRoute(TEST, right(0)))).toEqual({ status: 409, body: { ok: false, error: "conflict", step: { status: "done", answered: 0 } } });
    expect(memory.facts[0].answers).toEqual([]);
  });

  it("answers 409 conflict before the section starts, and once the test is completed or expired", async () => {
    atBreak();
    expect(await sent(await answerFactRoute(TEST, right(0)))).toEqual({ status: 409, body: { ok: false, error: "conflict" } });
    await factsStarted();
    memory.tests[0].status = "completed";
    expect(await sent(await answerFactRoute(TEST, right(0)))).toEqual({ status: 409, body: { ok: false, error: "conflict" } });
    memory.tests[0].status = "expired";
    expect(await sent(await answerFactRoute(TEST, right(0)))).toEqual({ status: 409, body: { ok: false, error: "conflict" } });
    expect(memory.facts[0].answers).toEqual([]);
  });

  it("answers 400 for a body that is not JSON, or that is not a fact id with a response of up to three digits", async () => {
    await factsStarted();
    expect(await sent(await answerFactRoute(TEST, "{not json"))).toEqual({ status: 400, body: { ok: false, error: "bad_json" } });
    for (const body of [{ factId: 0, response: "1" }, { factId: FACTS[0].id, response: "1234" }, { factId: FACTS[0].id, response: "a" }, { factId: FACTS[0].id }]) {
      expect(await sent(await answerFactRoute(TEST, body))).toEqual({ status: 400, body: { ok: false, error: "invalid" } });
    }
    // The body is read before the test: an id that is not a uuid with a body that is not JSON is bad_json.
    expect(await sent(await answerFactRoute("a1", "{not json"))).toEqual({ status: 400, body: { ok: false, error: "bad_json" } });
    expect(memory.facts[0].answers).toEqual([]);
  });

  it("answers 404 not_found for another family's test, an unknown test, or an id that is not a uuid", async () => {
    family(stored(startAttempt(TEST, T0), { parent: P2, answered: 18 }));
    expect(await sent(await answerFactRoute(TEST, right(0)))).toEqual({ status: 404, body: { ok: false, error: "not_found" } });
    expect(await sent(await answerFactRoute("7e57a000-0000-4000-8000-0000000000ff", right(0)))).toEqual({ status: 404, body: { ok: false, error: "not_found" } });
    expect(await sent(await answerFactRoute("a1", right(0)))).toEqual({ status: 404, body: { ok: false, error: "not_found" } });
  });

  it("answers 502 store_failed when the store fails, and 500 when the stored section cannot be rebuilt", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await factsStarted();
    memory.fail.insertFactAnswer = new StoreError("answer save failed", "down");
    expect(await sent(await answerFactRoute(TEST, right(0)))).toEqual({ status: 502, body: { ok: false, error: "store_failed" } });
    expect(memory.facts[0].answers).toEqual([]);
    atBreak();
    memory.fail.load = new StoreError("load failed", "down");
    expect(await sent(await answerFactRoute(TEST, right(0)))).toEqual({ status: 502, body: { ok: false, error: "store_failed" } });
    atBreak();
    brokenFacts();
    expect(await sent(await answerFactRoute(TEST, right(0)))).toEqual({ status: 500, body: { ok: false, error: "store_failed" } });
  });

  it("answers 401 signed_out without a session, and 503 store_failed without the secret key", async () => {
    await factsStarted();
    signedIn = null;
    expect(await sent(await answerFactRoute(TEST, "{not json"))).toEqual({ status: 401, body: { ok: false, error: "signed_out" } });
    signedIn = P1;
    secretKey = false;
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await sent(await answerFactRoute(TEST, right(0)))).toEqual({ status: 503, body: { ok: false, error: "store_failed" } });
    expect(memory.facts[0].answers).toEqual([]);
  });
});
