import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSession, nextQuestion, recordAnswer, restoreSession, startAttempt, storedTest, submitAnswer, type Attempt, type Grade, type Submission } from "@/lib/assessment";
import { StoreError } from "@/lib/test-attempt";
import { memoryAttemptStore, type MemoryTest } from "@/lib/test-attempt-memory";

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
const { POST: answerRoute } = await import("@/app/api/account/assessments/[id]/answers/route");

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

describe("POST /api/account/assessments/[id]/answers (answer a question)", () => {
  // Asha's test drawn from seed 7: questions 1 and 2 need shown work; question 3 (a choice question) does not.
  const current = () => nextQuestion(restoreSession(memory.tests[0].test, memory.tests[0].answers))!;
  /** A small PNG drawing in base64: the PNG signature and one byte. */
  const DRAWING = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01]).toString("base64");
  const answer = (body: unknown, { id = TEST, headers = {} }: { id?: string; headers?: Record<string, string> } = {}) =>
    answerRoute(new Request(`https://unica.test/api/account/assessments/${id}/answers`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }), { params: Promise.resolve({ id }) });
  /** The right answer to the current question in 20 seconds, with `work` if given. */
  const right = (work?: unknown) => ({ questionId: current().id, response: current().answer, timeMs: 20_000, ...(work === undefined ? {} : { work }) });

  it("stores the answer with its drawing and sends the next question, without its answer", async () => {
    family(stored(startAttempt(TEST, T0)));
    vi.setSystemTime(T0 + HOUR);
    const { status, body } = await sent(await answer(right({ image: DRAWING, text: "carry the 1" })));
    expect(status).toBe(200);
    expect(body).toMatchObject({ ok: true, step: { status: "question", number: 2, total: 36, breakAfter: 18, question: { id: memory.tests[0].test.stage1[1].id } } });
    expect(body.step.question).not.toHaveProperty("answer");
    expect(memory.tests[0]).toMatchObject({ resumeUntil: T0 + HOUR + DAY, lastAnswerAt: T0 + HOUR });
    expect(memory.tests[0].answers).toMatchObject([{ workPath: [...memory.drawings.keys()][0], workText: "carry the 1", timeMs: 20_000 }]);
  });

  it("caps the time on one question at an hour", async () => {
    family(stored(startAttempt(TEST, T0), { answered: 2 }));
    expect((await answer({ ...right(), timeMs: 5 * HOUR + 0.4 })).status).toBe(200);
    expect(memory.tests[0].answers[2].timeMs).toBe(HOUR);
  });

  it("answers 409 conflict with the current step for an answer to another question, or to a complete test", async () => {
    family(stored(startAttempt(TEST, T0), { answered: 2 }));
    const third = right();
    await answer(third);
    expect(await sent(await answer(third))).toMatchObject({ status: 409, body: { ok: false, error: "conflict", step: { status: "question", number: 4 } } });
    expect(await sent(await answer({ ...right(), questionId: 42 }))).toMatchObject({ status: 409, body: { ok: false, error: "conflict", step: { number: 4 } } });
    family(stored(startAttempt(TEST, T0), { answered: 36 }));
    expect(await sent(await answer({ questionId: "s2-1", response: "1", timeMs: 1 }))).toEqual({ status: 409, body: { ok: false, error: "conflict", step: { status: "complete", total: 36 } } });
  });

  it("answers 410 expired after the deadline, and stores nothing", async () => {
    family(stored(startAttempt(TEST, T0), { answered: 2 }));
    vi.setSystemTime(T0 + 25 * HOUR);
    expect(await sent(await answer(right()))).toEqual({ status: 410, body: { ok: false, error: "expired" } });
    expect(memory.tests[0]).toMatchObject({ status: "expired", resumeUntil: T0 + DAY, lastAnswerAt: null });
    expect(memory.tests[0].answers).toHaveLength(2);
  });

  it("answers 400 invalid for a response or a time that does not fit", async () => {
    family(stored(startAttempt(TEST, T0), { answered: 2 }));
    expect(await sent(await answer({ ...right(), response: "not a choice" }))).toEqual({ status: 400, body: { ok: false, error: "invalid" } });
    expect(await sent(await answer({ ...right(), response: 7 }))).toEqual({ status: 400, body: { ok: false, error: "invalid" } });
    expect(await sent(await answer({ ...right(), timeMs: "soon" }))).toEqual({ status: 400, body: { ok: false, error: "invalid" } });
    expect(await sent(await answer({ ...right(), timeMs: -5 }))).toEqual({ status: 400, body: { ok: false, error: "invalid" } });
    expect(memory.tests[0].answers).toHaveLength(2);
  });

  it("answers 400 with the message for a show-your-work question with an empty board, and for typed working in grade 2", async () => {
    family(stored(startAttempt(TEST, T0)));
    expect(await sent(await answer(right()))).toEqual({ status: 400, body: { ok: false, error: "work_required", message: "This question needs work on the whiteboard." } });
    expect(await sent(await answer(right({ text: "   " })))).toEqual({ status: 400, body: { ok: false, error: "work_required", message: "This question needs work on the whiteboard." } });
    const ben = { grade: 2, province: "BC" } as const;
    memory = memoryAttemptStore({
      children: [{ id: CHILD, parentId: P1, ...ben }],
      tests: [{ ...startAttempt(TEST, T0), parentId: P1, childId: CHILD, seed: 7, test: storedTest(createSession(ben, 7)), answers: [] }],
    });
    expect(await sent(await answer(right({ image: DRAWING, text: "5" })))).toEqual({ status: 400, body: { ok: false, error: "invalid", message: "Grades 1 and 2 draw their work. Typed working is not taken." } });
    expect(memory.tests[0].answers).toEqual([]);
    expect(memory.drawings.size).toBe(0);
  });

  it("answers 413 work_too_big with the message for a drawing, typed working or a request over its limit", async () => {
    family(stored(startAttempt(TEST, T0)));
    const big = Buffer.concat([Buffer.from(DRAWING, "base64"), Buffer.alloc(1_000_000)]).toString("base64");
    expect(await sent(await answer(right({ image: big })))).toEqual({ status: 413, body: { ok: false, error: "work_too_big", message: "The drawing is too big to save. The limit is 1 MB." } });
    expect(await sent(await answer(right({ text: "x".repeat(1001) })))).toEqual({ status: 413, body: { ok: false, error: "work_too_big", message: "The typed working is too long to save. The limit is 1000 characters." } });
    expect(await sent(await answer("{}", { headers: { "content-length": "1500001" } }))).toEqual({ status: 413, body: { ok: false, error: "work_too_big", message: "The answer is too big to save." } });
    expect(await sent(await answer(JSON.stringify({ ...right(), pad: "x".repeat(1_500_000) })))).toEqual({ status: 413, body: { ok: false, error: "work_too_big", message: "The answer is too big to save." } });
    expect(memory.tests[0].answers).toEqual([]);
  });

  it("answers 400 for a body that is not JSON, or work that is not a drawing", async () => {
    family(stored(startAttempt(TEST, T0)));
    expect(await sent(await answer("{not json"))).toEqual({ status: 400, body: { ok: false, error: "bad_json" } });
    expect(await sent(await answer(right("a drawing")))).toEqual({ status: 400, body: { ok: false, error: "invalid", message: "The work must be an object." } });
    expect(await sent(await answer(right({ image: "bm90IGEgcG5n" })))).toEqual({ status: 400, body: { ok: false, error: "invalid", message: "The drawing must be a PNG image." } });
  });

  it("answers 404 not_found for another family's test, an unknown test, or an id that is not a uuid", async () => {
    family(stored(startAttempt(TEST, T0), { parent: P2, answered: 2 }));
    expect(await sent(await answer(right()))).toEqual({ status: 404, body: { ok: false, error: "not_found" } });
    expect(await sent(await answer(right(), { id: "7e57a000-0000-4000-8000-0000000000ff" }))).toEqual({ status: 404, body: { ok: false, error: "not_found" } });
    expect(await sent(await answer(right(), { id: "a1" }))).toEqual({ status: 404, body: { ok: false, error: "not_found" } });
    expect(memory.tests[0].answers).toHaveLength(2);
  });

  it("answers 502 store_failed when storing fails, and 500 when the stored test cannot be rebuilt", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    family(stored(startAttempt(TEST, T0)));
    memory.fail.storeDrawing = new StoreError("upload failed", "down");
    expect(await sent(await answer(right({ image: DRAWING })))).toEqual({ status: 502, body: { ok: false, error: "store_failed" } });
    family(stored(startAttempt(TEST, T0)));
    memory.fail.insertAnswer = new StoreError("answer save failed", "down");
    expect(await sent(await answer(right({ image: DRAWING })))).toEqual({ status: 502, body: { ok: false, error: "store_failed" } });
    expect(memory.drawings.size).toBe(0);
    const broken = stored(startAttempt(TEST, T0), { answered: 2 });
    broken.answers[0].questionId = "not-this-test";
    family(broken);
    expect(await sent(await answer({ questionId: "s1-2", response: "1", timeMs: 1 }))).toEqual({ status: 500, body: { ok: false, error: "store_failed" } });
  });

  it("answers 401 signed_out without a session, and 503 store_failed without the secret key", async () => {
    family(stored(startAttempt(TEST, T0), { answered: 2 }));
    signedIn = null;
    expect(await sent(await answer(right()))).toEqual({ status: 401, body: { ok: false, error: "signed_out" } });
    signedIn = P1;
    secretKey = false;
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await sent(await answer(right()))).toEqual({ status: 503, body: { ok: false, error: "store_failed" } });
    expect(memory.tests[0].answers).toHaveLength(2);
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
