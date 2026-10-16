import { describe, expect, it } from "vitest";
import { createSession, nextQuestion, restoreSession, storedTest, submitAnswer, testStep, type Session, type Submission } from "@/lib/assessment";

// The server keeps the drawn test and the answers in the database, then rebuilds the session on every request (#64).
// A child who gets every other question right, so the test routes and marks a mix.
function answerAll(session: Session) {
  const submissions: Submission[] = [];
  for (let step = testStep(session); step.status === "question"; step = testStep(session)) {
    const q = nextQuestion(session)!;
    const sub = { questionId: step.question.id, response: submissions.length % 2 ? q.answer : "0", timeMs: 9_000 };
    submissions.push(sub);
    session = submitAnswer(session, sub);
  }
  return { session, submissions };
}

describe("a session rebuilt from what the server stores", () => {
  it("marks and routes the same as the live session", () => {
    const live = createSession({ grade: 4, province: "BC" }, 11);
    const { session: done, submissions } = answerAll(live);
    const stored = JSON.parse(JSON.stringify(storedTest(live)));
    const rebuilt = restoreSession(stored, submissions);
    expect(rebuilt).toEqual(done);
  });

  it("resumes part way: the next step matches the live session", () => {
    let live = createSession({ grade: 3, province: "ON" }, 5);
    const subs: Submission[] = [];
    for (let i = 0; i < 20; i++) {
      const step = testStep(live);
      if (step.status !== "question") throw new Error("ended early");
      const sub = { questionId: step.question.id, response: "1", timeMs: 4_000 };
      subs.push(sub);
      live = submitAnswer(live, sub);
    }
    expect(testStep(restoreSession(storedTest(live), subs))).toEqual(testStep(live));
  });
});

describe("the step the browser receives", () => {
  it("never carries the answer, the coded wrong answers or their misconceptions", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const { session } = answerAll(createSession({ grade: 3 + (seed % 3) as 3 | 4 | 5, province: "BC" }, seed));
      // Replay to see every step the child saw.
      let s = restoreSession(storedTest(session), []);
      for (const a of session.answers) {
        const step = testStep(s);
        const json = JSON.stringify(step);
        expect(json).not.toMatch(/"answer"|"wrong"|"misconception"|"values"|"templateId"/);
        s = submitAnswer(s, { questionId: a.questionId, response: a.response, timeMs: a.timeMs });
      }
    }
  });

  it("numbers the questions from 1 to the test length, then reports the test complete", () => {
    const live = createSession({ grade: 5, province: "BC" }, 2);
    const first = testStep(live);
    expect(first).toMatchObject({ status: "question", number: 1, total: 42 });
    const { session } = answerAll(live);
    expect(testStep(session)).toEqual({ status: "complete", total: 36 });
  });

  it("gives choices only to multiple-choice questions", () => {
    const { session } = answerAll(createSession({ grade: 4, province: "BC" }, 8));
    let s = restoreSession(storedTest(session), []);
    for (const a of session.answers) {
      const step = testStep(s);
      if (step.status !== "question") throw new Error("ended early");
      expect(Array.isArray(step.question.choices)).toBe(step.question.format === "choice");
      s = submitAnswer(s, a);
    }
  });
});
