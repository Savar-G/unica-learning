import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSession, nextQuestion, restoreSession, startAttempt, storedTest, submitAnswer, type Submission } from "@/lib/assessment";
import { memoryAttemptStore } from "@/lib/test-attempt-memory";

// The answer route takes what the child did before Next (#184) from the request: the answer changes, the read-aloud
// uses and the time away. It stores them with the answer, with every size bounded, and never refuses an answer for
// them. The module's store is the in-memory one, as in the other route tests.
vi.mock("server-only", () => ({}));

let memory: ReturnType<typeof memoryAttemptStore>;
vi.mock("@/lib/supabase-auth", () => ({ sessionClient: async () => ({}), parentId: async () => P1, adminClient: () => ({}) }));
vi.mock("@/lib/test-attempt-server", () => ({ attemptStore: () => memory.store }));

const { POST: answerRoute } = await import("@/app/api/account/assessments/[id]/answers/route");

const HOUR = 60 * 60_000;
const T0 = Date.UTC(2026, 9, 16, 18, 0);
const P1 = "5e55a000-0000-4000-8000-000000000001";
const CHILD = "c41d0000-0000-4000-8000-000000000001";
const TEST = "7e57a000-0000-4000-8000-000000000001";
const ASHA = { grade: 4, province: "BC" } as const;

beforeEach(() => {
  // Asha's test (grade 4, seed 7) with 2 answers in: question 3 is a choice question that needs no shown work.
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

const third = () => nextQuestion(restoreSession(memory.tests[0].test, memory.tests[0].answers))!;
/** Sends the right answer to question 3 with `events` (left out when undefined). */
const answer = (events?: unknown) =>
  answerRoute(new Request(`https://unica.test/api/account/assessments/${TEST}/answers`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ questionId: third().id, response: third().answer, timeMs: 20_000, ...(events === undefined ? {} : { events }) }),
  }), { params: Promise.resolve({ id: TEST }) });
const storedEvents = () => memory.tests[0].answers[2]?.timeline?.events;

describe("POST /api/account/assessments/[id]/answers with the answer events (#184)", () => {
  it("stores the answer changes, the read-aloud uses and the time away with the answer, at the request's time", async () => {
    const events = { changes: [{ value: "12", atMs: 4_000 }, { value: third().answer, atMs: 9_500 }], readAloud: { count: 2, atMs: [500, 7_000] }, away: { count: 1, ms: 3_000 } };
    expect((await answer(events)).status).toBe(200);
    expect(memory.tests[0].answers[2]).toMatchObject({ timeline: { answeredAt: T0 + HOUR, events } });
  });

  it("bounds every size: the first 50 changes, the first 20 read-aloud times, counts up to 1000, times up to an hour", async () => {
    const changes = Array.from({ length: 80 }, (_, i) => ({ value: String(i), atMs: i * 1000 + 0.4 }));
    const long = "x".repeat(200);
    const events = {
      changes: [{ value: long, atMs: 5 * HOUR }, ...changes],
      readAloud: { count: 5000, atMs: Array.from({ length: 30 }, (_, i) => i * 100) },
      away: { count: 7, ms: 5 * HOUR },
    };
    expect((await answer(events)).status).toBe(200);
    const saved = storedEvents()!;
    expect(saved.changes).toHaveLength(50);
    expect(saved.changes[0]).toEqual({ value: "x".repeat(80), atMs: HOUR });
    expect(saved.changes[1]).toEqual({ value: "0", atMs: 0 });
    expect(saved.changes[49]).toEqual({ value: "48", atMs: 48_000 });
    expect(saved.readAloud).toEqual({ count: 1000, atMs: Array.from({ length: 20 }, (_, i) => i * 100) });
    expect(saved.away).toEqual({ count: 7, ms: HOUR });
  });

  it("counts every read-aloud time it keeps, when the count sent is lower", async () => {
    expect((await answer({ changes: [], readAloud: { count: 0, atMs: [100, 200] }, away: { count: 0, ms: 0 } })).status).toBe(200);
    expect(storedEvents()!.readAloud).toEqual({ count: 2, atMs: [100, 200] });
  });

  it("stores the answer without events when the screen sends none (a screen from before #184)", async () => {
    expect((await answer()).status).toBe(200);
    expect(memory.tests[0].answers[2]).toMatchObject({ timeline: { answeredAt: T0 + HOUR, events: null } });
  });

  it("never refuses an answer for events it cannot use: it stores the answer without them", async () => {
    const unusable = [
      "taps",
      [],
      { changes: "12", readAloud: { count: 1, atMs: [] }, away: { count: 0, ms: 0 } },
      { changes: [{ value: 12, atMs: 1 }], readAloud: { count: 1, atMs: [] }, away: { count: 0, ms: 0 } },
      { changes: [], readAloud: { count: -1, atMs: [] }, away: { count: 0, ms: 0 } },
      { changes: [], readAloud: { count: 1, atMs: ["soon"] }, away: { count: 0, ms: 0 } },
      { changes: [], readAloud: { count: 1, atMs: [] }, away: { count: 0, ms: Number.NaN } },
      { changes: [], readAloud: { count: 1, atMs: [] } },
    ];
    for (const events of unusable) {
      memory.tests[0].answers.splice(2);
      expect((await answer(events)).status).toBe(200);
      expect(memory.tests[0].answers[2]).toMatchObject({ timeline: { events: null } });
    }
  });
});
