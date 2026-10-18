import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSession, nextQuestion, restoreSession, startAttempt, storedTest, submitAnswer, type Question, type Submission } from "@/lib/assessment";
import { memoryAttemptStore } from "@/lib/test-attempt-memory";

// #249: PUT /api/account/assessments/[id]/answers changes an answer the child went back to. The route reads the same
// body as an answer, with `workChanged`, and only translates the module's result. The module's store is the in-memory one.
vi.mock("server-only", () => ({}));

let memory: ReturnType<typeof memoryAttemptStore>;
vi.mock("@/lib/supabase-auth", () => ({ sessionClient: async () => ({}), parentId: async () => P1, adminClient: () => ({}) }));
vi.mock("@/lib/test-attempt-server", () => ({ attemptStore: () => memory.store }));

const { POST: answerRoute, PUT: changeRoute } = await import("@/app/api/account/assessments/[id]/answers/route");

const HOUR = 60 * 60_000;
const T0 = Date.UTC(2026, 9, 17, 18, 0);
const P1 = "5e55a000-0000-4000-8000-000000000001";
const CHILD = "c41d0000-0000-4000-8000-000000000001";
const TEST = "7e57a000-0000-4000-8000-000000000001";
const ASHA = { grade: 4, province: "BC" } as const;
/** A small PNG drawing, as the screen sends it: base64. */
const DRAWING = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01]).toString("base64");

beforeEach(() => {
  // Asha's test (grade 4, seed 7) with 2 answers in.
  const test = storedTest(createSession(ASHA, 7));
  let session = restoreSession(test, []);
  const answers: Submission[] = [];
  for (let q = nextQuestion(session); q && answers.length < 2; q = nextQuestion(session)) {
    answers.push({ questionId: q.id, response: q.answer, timeMs: 20_000 });
    session = submitAnswer(session, answers.at(-1)!);
  }
  memory = memoryAttemptStore({ children: [{ id: CHILD, parentId: P1, ...ASHA }], tests: [{ ...startAttempt(TEST, T0), parentId: P1, childId: CHILD, seed: 7, test, answers }] });
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0 + HOUR);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const at = (position: number): Question => memory.tests[0].test.stage1[position];
const wrongTo = (q: Question) => (q.format === "choice" ? q.choices!.find((c) => c !== q.answer)! : "9999");
const request = (method: "POST" | "PUT", body: object) =>
  new Request(`https://unica.test/api/account/assessments/${TEST}/answers`, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const params = { params: Promise.resolve({ id: TEST }) };

describe("PUT /api/account/assessments/[id]/answers (#249)", () => {
  it("changes an answered question and sends the step the test is at, with the changed answer", async () => {
    const q = at(1);
    const res = await changeRoute(request("PUT", { questionId: q.id, response: wrongTo(q), timeMs: 3_000 }), params);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, step: { status: "question", number: 3, answered: [{ number: 1 }, { number: 2, response: wrongTo(q) }] } });
    expect(memory.tests[0].answers[1]).toMatchObject({ response: wrongTo(q), correct: false, timeMs: 23_000 });
  });

  it("keeps the stored work unless workChanged is true", async () => {
    const third = nextQuestion(restoreSession(memory.tests[0].test, memory.tests[0].answers))!;
    expect((await answerRoute(request("POST", { questionId: third.id, response: third.answer, timeMs: 20_000, work: { image: DRAWING, text: "3 + 4" } }), params)).status).toBe(200);
    const stored = memory.tests[0].answers[2].workPath;
    expect(stored).toBeTruthy();
    expect((await changeRoute(request("PUT", { questionId: third.id, response: wrongTo(third), timeMs: 1_000, work: { text: "ignored" } }), params)).status).toBe(200);
    expect(memory.tests[0].answers[2]).toMatchObject({ workPath: stored, workText: "3 + 4" });
    expect((await changeRoute(request("PUT", { questionId: third.id, response: wrongTo(third), timeMs: 1_000, work: { text: "4 + 3" }, workChanged: true }), params)).status).toBe(200);
    expect(memory.tests[0].answers[2]).toMatchObject({ workPath: null, workText: "4 + 3" });
    expect(memory.drawings.size).toBe(0);
  });

  it("answers 409 with the step for a question that is not answered", async () => {
    const res = await changeRoute(request("PUT", { questionId: at(2).id, response: at(2).answer, timeMs: 1_000 }), params);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ ok: false, error: "conflict", step: { number: 3 } });
  });
});
