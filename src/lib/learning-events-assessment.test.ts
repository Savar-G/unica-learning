import { describe, expect, it } from "vitest";
import { learningEvents } from "@/lib/learning-events";
import { backfillAssessmentEvents, type AssessmentAnswer } from "@/lib/learning-events-assessment";
import { memoryLearningEventStore } from "@/lib/learning-events-memory";

// Events from assessment answers (#302): a finished test's answers become learning events before workbooks or calls
// exist, read back by child and time; a second backfill of the same test adds none.

const TEST = { assessmentId: "00000000-0000-4000-8000-0000000000e1", parentId: "00000000-0000-4000-8000-0000000000a1", childId: "00000000-0000-4000-8000-0000000000c1" };
const DAY = { from: "2026-10-29T00:00:00.000Z", to: "2026-10-30T00:00:00.000Z" };

const answer = (over: Partial<AssessmentAnswer>): AssessmentAnswer => ({
  id: "00000000-0000-4000-8000-000000000101",
  questionId: "s1-1",
  templateId: "2-add-2-digit",
  response: "85",
  correct: true,
  misconception: null,
  timeMs: 21_000,
  answeredAt: "2026-10-29T15:00:21.000Z",
  createdAt: "2026-10-29T15:00:22.000Z",
  ...over,
});

const ANSWERS: AssessmentAnswer[] = [
  answer({}),
  answer({ id: "00000000-0000-4000-8000-000000000102", questionId: "s1-2", templateId: "2-subtract-2-digit", response: "43", correct: false, misconception: "O1", timeMs: 30_000, answeredAt: null, createdAt: "2026-10-29T15:01:00.000Z" }),
  answer({ id: "00000000-0000-4000-8000-000000000103", questionId: "s1-3", response: "", correct: false, timeMs: 5_000, answeredAt: "2026-10-29T15:02:00.000Z" }),
  answer({ id: "00000000-0000-4000-8000-000000000104", questionId: "s1-4", templateId: "no-longer-in-the-bank", answeredAt: "2026-10-29T15:03:00.000Z" }),
  answer({ id: "00000000-0000-4000-8000-000000000105", questionId: "x-0", answeredAt: "2026-10-29T15:04:00.000Z" }),
];

const base = (questionId: string, id: string) => ({
  key: `assessment-answer:${id}`,
  parentId: TEST.parentId,
  childId: TEST.childId,
  source: "assessment",
  question: { source: "assessment", assessmentId: TEST.assessmentId, questionId },
  stuckStep: null,
  hints: 0,
  evidence: { kind: "answer", id },
  id: expect.any(String),
});

describe("events from assessment answers", () => {
  it("writes one event per answer the record can name a skill for, and reads them back by child and time", async () => {
    const events = learningEvents(memoryLearningEventStore());
    const done = await backfillAssessmentEvents(events, TEST, ANSWERS);
    expect(done).toEqual({
      appended: 3,
      alreadyStored: 0,
      skipped: [
        { answerId: "00000000-0000-4000-8000-000000000104", reason: "template no-longer-in-the-bank is not in the bank" },
        { answerId: "00000000-0000-4000-8000-000000000105", reason: "a question of the removed extra round" },
      ],
    });
    expect(await events.read(TEST.childId, DAY)).toEqual([
      { ...base("s1-1", "00000000-0000-4000-8000-000000000101"), skill: { standard: "2.4", skills: ["2.4-add-within-100"] }, result: "right", mistake: null, timeMs: 21_000, occurredAt: "2026-10-29T15:00:21.000Z" },
      // No answered-at time (an answer stored before #184): the time the answer was stored.
      { ...base("s1-2", "00000000-0000-4000-8000-000000000102"), skill: { standard: "2.4", skills: ["2.4-subtract-within-100"] }, result: "wrong", mistake: "O1", timeMs: 30_000, occurredAt: "2026-10-29T15:01:00.000Z" },
      { ...base("s1-3", "00000000-0000-4000-8000-000000000103"), skill: { standard: "2.4", skills: ["2.4-add-within-100"] }, result: "blank", mistake: null, timeMs: 5_000, occurredAt: "2026-10-29T15:02:00.000Z" },
    ]);
  });

  it("adds no event when the same test is backfilled again", async () => {
    const events = learningEvents(memoryLearningEventStore());
    await backfillAssessmentEvents(events, TEST, ANSWERS);
    const again = await backfillAssessmentEvents(events, TEST, ANSWERS);
    expect(again).toEqual(expect.objectContaining({ appended: 0, alreadyStored: 3 }));
    expect(await events.read(TEST.childId, DAY)).toHaveLength(3);
  });

  it("keeps the event with no time spent when the stored time is longer than a day", async () => {
    const events = learningEvents(memoryLearningEventStore());
    await backfillAssessmentEvents(events, TEST, [answer({ timeMs: 90_000_000 })]);
    expect(await events.read(TEST.childId, DAY)).toEqual([expect.objectContaining({ timeMs: null, result: "right" })]);
  });
});
