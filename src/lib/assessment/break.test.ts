import { describe, expect, it } from "vitest";
import { breakDue, createSession, nextQuestion, submitAnswer, testStep, type Session, type TestStep } from "@/lib/assessment";

// The halfway break and the progress display (#69): the browser learns both from the step it receives.
function steps(session: Session): TestStep[] {
  const seen: TestStep[] = [];
  for (let step = testStep(session); ; step = testStep(session)) {
    seen.push(step);
    if (step.status !== "question") return seen;
    session = submitAnswer(session, { questionId: step.question.id, response: nextQuestion(session)!.answer, timeMs: 5_000 });
  }
}

describe("the halfway break", () => {
  it("comes once, before question 19 of 42: after stage 1, before the routed half", () => {
    const all = steps(createSession({ grade: 4, province: "BC" }, 3));
    const due = all.filter(breakDue);
    expect(due).toHaveLength(1);
    expect(due[0]).toMatchObject({ status: "question", number: 19, total: 42 });
  });

  it("is never due on the first question or when the test is complete", () => {
    const all = steps(createSession({ grade: 3, province: "ON" }, 9));
    expect(breakDue(all[0])).toBe(false);
    expect(breakDue(all[all.length - 1])).toBe(false);
  });

  it("tells the progress display where the break sits on every question", () => {
    for (const step of steps(createSession({ grade: 5, province: "BC" }, 21))) {
      if (step.status === "question") expect(step.breakAfter).toBe(18);
    }
  });
});
