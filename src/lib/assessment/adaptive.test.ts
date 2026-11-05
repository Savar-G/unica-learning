import { describe, expect, it } from "vitest";
import { ADAPTIVE_QUESTION_LIMIT, BLOCK_SIZE, createAdaptiveSession, finish, givenQuestions, lockAdaptiveBlock, nextQuestion, restoreSession, storedTest, submitAnswer, testStep, UNKNOWN_RESPONSE, paceOf, flagsFor, REPORTED_STRAND, type Grade, type Session, type Province } from "@/lib/assessment";

function run(grade: Grade, ability: number, seed: number, province: Province = "BC"): Session {
  let s = createAdaptiveSession({ grade, province }, seed);
  for (let i = 0; i < 100; i++) {
    const step = testStep(s);
    if (step.status === "complete") return s;
    if (step.status === "check") s = lockAdaptiveBlock(s);
    else {
      const q = nextQuestion(s)!;
      s = submitAnswer(s, { questionId: q.id, response: q.level <= ability ? q.answer : UNKNOWN_RESPONSE, timeMs: 20_000 });
    }
    s = restoreSession(JSON.parse(JSON.stringify(storedTest(s))), s.answers);
  }
  throw new Error("Assessment did not stop");
}

describe("six-question assessment blocks", () => {
  it("moves down after six failures and locks review before selecting the next block", () => {
    let s = createAdaptiveSession({ grade: 6, province: "BC" }, 12);
    for (let i = 0; i < BLOCK_SIZE; i++) {
      const q = nextQuestion(s)!;
      s = submitAnswer(s, { questionId: q.id, response: UNKNOWN_RESPONSE, timeMs: 20_000 });
    }
    expect(testStep(s).status).toBe("check");
    expect(s.adaptive!.blocks).toHaveLength(1);
    s = lockAdaptiveBlock(s);
    expect(nextQuestion(s)!.level).toBe(5);
    expect(s.adaptive!.locked).toBe(1);
  });

  it("keeps explicit unknown answers in the score, with no misconception or rushing flag", () => {
    let s = createAdaptiveSession({ grade: 3, province: "BC" }, 1);
    for (let i = 0; i < 3; i++) s = submitAnswer(s, { questionId: nextQuestion(s)!.id, response: UNKNOWN_RESPONSE, timeMs: 100 });
    expect(s.answers.every(a => !a.correct && a.misconception === null)).toBe(true);
    expect(paceOf(s.answers)).toMatchObject({ veryFast: 0, leftOut: [], unreliable: false });
    expect(flagsFor(s.answers, null)).toEqual([]);
  });

  it("withholds placement when the stored bank cannot confirm a level", () => {
    const full = createAdaptiveSession({ grade: 4, province: "BC" }, 1);
    let s = { ...full, adaptive: { ...full.adaptive!, pool: [...full.adaptive!.blocks[0].questions] } };
    for (const q of s.adaptive.blocks[0].questions) s = { ...submitAnswer(s, { questionId: q.id, response: UNKNOWN_RESPONSE, timeMs: 20_000 }), adaptive: s.adaptive };
    const locked = lockAdaptiveBlock(s);
    expect(testStep(locked)).toMatchObject({ status: "complete", sufficientEvidence: false });
    expect(() => finish(locked)).toThrow("not complete");
  });

  for (const rush of ["all", "first block"] as const) {
    it(`does not use ${rush} rushed answers as area evidence`, () => {
      let session = createAdaptiveSession({ grade: 4, province: "BC" }, 1);
      for (let i = 0; i < 100; i++) {
        const step = testStep(session);
        if (step.status === "complete") break;
        if (step.status === "check") session = lockAdaptiveBlock(session);
        else {
          const q = nextQuestion(session)!;
          const fast = rush === "all" || session.answers.length < 6;
          const wrong = rush === "all" ? REPORTED_STRAND[q.strand] === "shapes" : fast;
          session = submitAnswer(session, { questionId: q.id, response: wrong ? q.wrong[0].value : q.answer, timeMs: fast ? 100 : 20_000 });
        }
      }
      expect(testStep(session).status).toBe("complete");
      if (rush === "all") {
        expect(session.adaptive!.sufficientEvidence).toBe(false);
        expect(() => finish(session)).toThrow("not complete");
      } else {
        expect(session.adaptive!.sufficientEvidence).toBe(true);
        expect(finish(session).strands).toHaveLength(4);
        expect(finish(session).strands.every(s => s.total >= 6)).toBe(true);
      }
    });
  }

  for (const province of ["BC", "ON", "AB", "other"] as const) {
    for (const grade of [0,1,2,3,4,5,6,7,8,9] as Grade[]) {
      for (const ability of [-1, 0, 2, 5, 8, 9]) {
        it(`places grade ${grade}, ability ${ability}, ${province} within the cap with saved evidence`, () => {
          for (const seed of [1,17,83]) {
            const s = run(grade, ability, seed, province);
            expect(s.answers.length).toBeLessThanOrEqual(ADAPTIVE_QUESTION_LIMIT);
            expect(s.adaptive!.sufficientEvidence).toBe(true);
            const p = finish(s);
            expect(p.workingLevel).toBe(Math.max(0, Math.min(ability, grade === 9 ? 9 : 8, grade + 5)));
            if (province === "BC" || province === "other" || grade > 0) expect(p.strands.every(x => x.total >= 6)).toBe(true);
            const questions = givenQuestions(s, s.route);
            expect(new Set(questions.map(q => q.templateId)).size).toBe(questions.length);
            expect(questions.every(q => q.level <= (grade === 9 ? 9 : 8))).toBe(true);
          }
        });
      }
    }
  }
});
