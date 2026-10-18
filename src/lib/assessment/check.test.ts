import { describe, expect, it } from "vitest";
import {
  changeAnswer,
  createSession,
  lockStage1,
  nextQuestion,
  openSection,
  restoreSession,
  storedTest,
  submitAnswer,
  testStep,
  type Question,
  type Session,
  type Submission,
} from "@/lib/assessment";

// "Check your answers" and the stage 1 lock (#249, #253), in the assessment core. Stage 1 stays open after its last
// answer: the child checks it on the grid, and "Done checking" locks it. The route is set at the lock, from the final
// stage 1 answers. Asha, grade 4 in BC, seed 7: stage 1 has 18 questions; all right goes up, all wrong goes down.
const ASHA = { grade: 4, province: "BC" } as const;
const STAGE1 = 18;

/** A wrong response to a question: another choice, or another number. */
const wrongFor = (q: Question) => (q.format === "choice" ? q.choices!.find((c) => c !== q.answer)! : String(Number(q.answer) + 1));

/** Asha's session with the first `count` questions answered, right unless `wrong` says otherwise, 20 seconds each. */
function answered(count: number, wrong: (index: number) => boolean = () => false): { session: Session; submissions: Submission[] } {
  let session = createSession(ASHA, 7);
  const submissions: Submission[] = [];
  for (let i = 0; i < count; i++) {
    if (i === STAGE1) session = lockStage1(session);
    const q = nextQuestion(session)!;
    const submission = { questionId: q.id, response: wrong(i) ? wrongFor(q) : q.answer, timeMs: 20_000 };
    session = submitAnswer(session, submission);
    submissions.push(submission);
  }
  return { session, submissions };
}

describe("the stage 1 lock (#253)", () => {
  it("the last stage 1 answer sets no route: the test waits on the stage 1 grid", () => {
    const { session } = answered(STAGE1);
    expect(session.route).toBeNull();
    expect(nextQuestion(session)).toBeNull();
    expect(testStep(session)).toMatchObject({ status: "check", section: "stage1", numbers: Array.from({ length: STAGE1 }, (_, i) => i + 1), breakAfter: STAGE1 });
    // Stage 1 is still the open section: every one of its answers can change.
    expect(openSection(session)).toMatchObject({ name: "stage1", first: 0, end: STAGE1 });
    expect(openSection(session).answered).toHaveLength(STAGE1);
  });

  it("the route is set at the lock, from the final stage 1 answers, not from the answers at the last stage 1 answer", () => {
    const { session } = answered(STAGE1);
    // Every answer right would go up. On the grid, the child changes every answer to a wrong one: the lock routes down.
    let checked = session;
    for (const q of session.stage1) checked = changeAnswer(checked, { questionId: q.id, response: wrongFor(q), timeMs: 2_000 });
    expect(lockStage1(session).route).toBe("up");
    const locked = lockStage1(checked);
    expect(locked.route).toBe("down");
    // The test goes on with the first question of the down form.
    expect(nextQuestion(locked)?.id).toBe(session.stage2.down[0].id);
    expect(testStep(locked)).toMatchObject({ status: "question", number: STAGE1 + 1 });
  });

  it("refuses a lock before every stage 1 question is answered, and a second lock", () => {
    expect(() => lockStage1(answered(STAGE1 - 1).session)).toThrow(/every stage 1 question/);
    const locked = lockStage1(answered(STAGE1).session);
    expect(() => lockStage1(locked)).toThrow(/already locked/);
  });

  it("refuses a change in stage 1 once it is locked; stage 2 is the open section", () => {
    const { session } = answered(STAGE1 + 2);
    expect(session.route).toBe("up");
    const q = session.stage1[3];
    expect(() => changeAnswer(session, { questionId: q.id, response: wrongFor(q), timeMs: 1_000 })).toThrow(/not an answered question of the open section/);
    expect(openSection(session)).toMatchObject({ name: "stage2", first: STAGE1 });
    const s2 = session.stage2.up[1];
    expect(changeAnswer(session, { questionId: s2.id, response: wrongFor(s2), timeMs: 1_000 }).answers[STAGE1 + 1].correct).toBe(false);
  });
});

describe("restore takes the lock as input (#253)", () => {
  it("all stage 1 answers and no stored route: stage 1 is open, on its grid", () => {
    const { session, submissions } = answered(STAGE1);
    const restored = restoreSession(storedTest(session), submissions, null);
    expect(restored.route).toBeNull();
    expect(testStep(restored)).toMatchObject({ status: "check", section: "stage1" });
    expect(openSection(restored).name).toBe("stage1");
  });

  it("all stage 1 answers and a stored route: stage 1 is locked, and the stored route is the route", () => {
    // Every answer right would route up; the stored lock record says "stay" (set from the final answers at the lock).
    const { session, submissions } = answered(STAGE1);
    const restored = restoreSession(storedTest(session), submissions, "stay");
    expect(restored.route).toBe("stay");
    expect(nextQuestion(restored)?.id).toBe(session.stage2.stay[0].id);
    expect(openSection(restored).name).toBe("stage2");
  });

  it("a test from before the lock with stage 2 answers and no stored route is past stage 1, routed by its stage 1 answers", () => {
    // Stage 1 all wrong routes down; two stage 2 answers on the down form.
    const { session, submissions } = answered(STAGE1 + 2, (i) => i < STAGE1);
    expect(session.route).toBe("down");
    const restored = restoreSession(storedTest(session), submissions);
    expect(restored.route).toBe("down");
    expect(restored.answers).toEqual(session.answers);
    expect(openSection(restored)).toMatchObject({ name: "stage2", first: STAGE1 });
    expect(testStep(restored)).toMatchObject({ status: "question", number: STAGE1 + 3 });
  });

  it("fewer answers than stage 1: no route, the next stage 1 question", () => {
    const { session, submissions } = answered(5);
    const restored = restoreSession(storedTest(session), submissions);
    expect(restored.route).toBeNull();
    expect(testStep(restored)).toMatchObject({ status: "question", number: 6 });
  });
});
