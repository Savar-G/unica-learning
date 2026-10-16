import { describe, expect, it } from "vitest";
import { REPORTED_STRAND, REPORTED_STRAND_NAMES, createSession, nextQuestion, startExtraRound, storedTest, submitAnswer, type Session } from "@/lib/assessment";
import { answerLines, extraRoundFacts, shownWithoutAnswer, type AnswerRecord, type ExtraRoundColumns } from "@/lib/admin-view";

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

// #190, spec #181 story 16: the admin's test page says whether the extra round was offered, skipped or taken, when,
// how many questions it had and on which areas.
describe("the extra round of one test on the admin page", () => {
  const NONE: ExtraRoundColumns = { extra_offered_at: null, extra_skipped_at: null, extra_started_at: null, extra_finished_at: null };
  const COMPLETED = "2026-10-16T19:00:00.000Z";
  const roundTest = () => {
    let session: Session = createSession({ grade: 4, province: "BC" }, 1);
    for (let q = nextQuestion(session); q; q = nextQuestion(session)) {
      session = submitAnswer(session, { questionId: q.id, response: session.answers.length === 0 ? "no idea" : q.answer, timeMs: 20_000 });
    }
    return storedTest(startExtraRound(session));
  };

  it("a round taken during the test and finished: its questions, areas and times", () => {
    const stored = roundTest();
    const facts = extraRoundFacts({ extra_offered_at: "2026-10-16T18:40:00.000Z", extra_skipped_at: null, extra_started_at: "2026-10-16T18:41:00.000Z", extra_finished_at: COMPLETED }, stored, COMPLETED);
    const area = REPORTED_STRAND_NAMES[REPORTED_STRAND[stored.extra![0].strand]];
    expect(facts).toEqual([
      ["Extra round", "Taken during the test"],
      ["Extra questions", `8: ${area}`],
      ["Offered (Pacific)", "2026-10-16 11:40"],
      ["Skipped (Pacific)", "-"],
      ["Started (Pacific)", "2026-10-16 11:41"],
      ["Finished (Pacific)", "2026-10-16 12:00"],
    ]);
  });

  it("a round skipped in the test, then taken from the report and not finished", () => {
    const facts = extraRoundFacts({ ...NONE, extra_offered_at: "2026-10-16T18:40:00.000Z", extra_skipped_at: "2026-10-16T18:41:00.000Z", extra_started_at: "2026-10-18T16:00:00.000Z" }, roundTest(), COMPLETED);
    expect(facts[0]).toEqual(["Extra round", "Taken from the report, not finished"]);
    expect(facts[3]).toEqual(["Skipped (Pacific)", "2026-10-16 11:41"]);
  });

  it("a round offered and skipped, one offered with no choice yet, and a test with none", () => {
    const stored = storedTest(createSession({ grade: 4, province: "BC" }, 1));
    expect(extraRoundFacts({ ...NONE, extra_offered_at: "2026-10-16T18:40:00.000Z", extra_skipped_at: "2026-10-16T18:41:00.000Z" }, stored, COMPLETED).slice(0, 2)).toEqual([["Extra round", "Skipped"], ["Extra questions", "-"]]);
    expect(extraRoundFacts({ ...NONE, extra_offered_at: "2026-10-16T18:40:00.000Z" }, stored, null)[0]).toEqual(["Extra round", "Offered, no choice yet"]);
    expect(extraRoundFacts(NONE, stored, COMPLETED)).toEqual([
      ["Extra round", "Not offered"],
      ["Extra questions", "-"],
      ["Offered (Pacific)", "-"],
      ["Skipped (Pacific)", "-"],
      ["Started (Pacific)", "-"],
      ["Finished (Pacific)", "-"],
    ]);
  });
});
