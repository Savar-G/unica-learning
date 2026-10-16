import { describe, expect, it } from "vitest";
import { createSession, nextQuestion, startExtraRound, storedTest, submitAnswer, type Session } from "@/lib/assessment";
import { answerLines, shownWithoutAnswer, type AnswerRecord } from "@/lib/admin-view";

// #190: the admin's answer table shows each answer of the extra round with its question from the stored round.
describe("the admin's answer lines for a test with an extra round", () => {
  /** Asha's test from seed 1, the first answer wrong (an early sign), with the round taken and its first question answered. */
  const roundTaken = () => {
    let session: Session = createSession({ grade: 4, province: "BC" }, 1);
    for (let q = nextQuestion(session); q; q = nextQuestion(session)) {
      session = submitAnswer(session, { questionId: q.id, response: session.answers.length === 0 ? "no idea" : q.answer, timeMs: 20_000 });
    }
    session = startExtraRound(session);
    return session;
  };

  it("marks an extra-round answer as the extra round, with its question, right answer and template", () => {
    const session = roundTaken();
    const first = session.extra![0];
    const answers: AnswerRecord[] = [{
      position: 42, question_id: first.id, response: first.answer, correct: true, misconception: null, time_ms: 20_000,
      work_required: false, work_path: null, work_text: null, template_id: first.templateId,
    }];
    expect(answerLines(storedTest(session), answers, [])).toMatchObject([{ number: 43, stage: "extra", prompt: first.prompt, rightAnswer: first.answer, templateId: first.templateId, level: first.level }]);
  });

  it("names the round's question the child was shown and did not answer", () => {
    const session = roundTaken();
    const first = session.extra![0];
    expect(shownWithoutAnswer(storedTest(session), [{ position: 42, question_id: first.id, shown_at: "2026-10-16T18:00:00Z" }], [])).toEqual([
      { number: 43, questionId: first.id, prompt: first.prompt, shownAt: "2026-10-16T18:00:00Z" },
    ]);
  });
});
