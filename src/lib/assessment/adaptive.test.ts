import { describe, expect, it } from "vitest";
import { ADAPTIVE_QUESTION_LIMIT, BLOCK_SIZE, createAdaptiveSession, finish, givenQuestions, lockAdaptiveBlock, nextQuestion, restoreSession, storedTest, submitAnswer, testStep, UNKNOWN_RESPONSE, paceOf, flagsFor, REPORTED_STRAND, rescoreAdaptivePlacement, type AdaptiveBlock, type Grade, type Session, type Province } from "@/lib/assessment";

function run(grade: Grade, ability: number, seed: number, province: Province = "BC"): Session {
  const created = createAdaptiveSession({ grade, province }, seed);
  let s: Session = { ...created, adaptive: { ...created.adaptive!, version: 1 } };
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
    expect(nextQuestion(s)!.level).toBe(4);
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
      const created = createAdaptiveSession({ grade: 4, province: "BC" }, 1);
      let session: Session = { ...created, adaptive: { ...created.adaptive!, version: 1 } };
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

function scriptBlock(session: Session, rights: number, fastWrong = 0): Session {
  const questions = session.adaptive!.blocks.at(-1)!.questions;
  for (const [i, q] of questions.entries()) {
    const fast = i < fastWrong;
    session = submitAnswer(session, {
      questionId: q.id,
      response: fast ? q.wrong[0].value : i < rights + fastWrong ? q.answer : UNKNOWN_RESPONSE,
      timeMs: fast ? 100 : 20_000,
    });
  }
  return lockAdaptiveBlock(session);
}

function start(grade: Grade) {
  return createAdaptiveSession({ grade, province: "BC" }, 1);
}

function drain(session: Session, rights: number): Session {
  while (!session.adaptive!.complete) session = scriptBlock(session, rights);
  return session;
}

describe("placement rules v2", () => {
  it.each([7, 8])("uses a second look after %i of 12 and passes at 12 of 18", first => {
    let s = scriptBlock(start(4), 4);
    s = scriptBlock(s, first - 4);
    expect(s.adaptive!.blocks.at(-1)).toMatchObject({ level: 4, purpose: "search" });
    s = scriptBlock(s, 12 - first);
    s = drain(s, 0);
    expect(finish(s)).toMatchObject({ workingLevel: 4, mastered: true });
    expect(rescoreAdaptivePlacement(storedTest(s), s.answers)).toMatchObject({ outcome: "placed", level: 4 });
  });

  it("takes a second look in confirmation after the search budget", () => {
    let s = start(1);
    for (let i = 0; i < 6; i++) s = scriptBlock(s, 6);
    expect(s.adaptive!.blocks.at(-1)).toMatchObject({ level: 6, purpose: "confirm" });
    expect(testStep(s)).toMatchObject({ status: "question", number: 37, secondBreakAfter: 36 });
    s = scriptBlock(s, 2);
    expect(s.adaptive!.blocks.at(-1)).toMatchObject({ level: 6, purpose: "confirm" });
    expect(finish(drain(scriptBlock(s, 4), 0))).toMatchObject({ workingLevel: 6, levelCertainty: "early-sign" });
  });

  it("keeps a pass when additional coverage at that grade would lower its percentage", () => {
    const s = drain(scriptBlock(scriptBlock(start(4), 4), 5), 0);
    const test = storedTest(s);
    const adaptive = test.adaptive!;
    const asked = new Set(givenQuestions(s, s.route).map(q => q.id));
    const questions = adaptive.pool.filter(q => q.level === 4 && !asked.has(q.id)).slice(0, 6);
    expect(questions).toHaveLength(6);
    const withCoverage = { ...test, adaptive: { ...adaptive, blocks: [...adaptive.blocks, { level: 4, purpose: "coverage", questions } satisfies AdaptiveBlock] } };
    const replay = restoreSession(withCoverage, [...s.answers, ...questions.map(q => ({ questionId: q.id, response: UNKNOWN_RESPONSE, timeMs: 20_000 }))]);
    expect(rescoreAdaptivePlacement(withCoverage, replay.answers)).toMatchObject({ outcome: "placed", level: 4 });
    expect(finish(replay)).toMatchObject({ workingLevel: 4 });
  });

  it("re-asks a grade that was seen for six answers when the grade below passes", () => {
    let s = scriptBlock(start(4), 2);
    expect(nextQuestion(s)!.level).toBe(3);
    s = scriptBlock(scriptBlock(s, 4), 5);
    expect(nextQuestion(s)!.level).toBe(4);
    s = scriptBlock(s, 6);
    expect(nextQuestion(s)!.level).toBe(4);
    expect(finish(drain(scriptBlock(s, 4), 0))).toMatchObject({ workingLevel: 4 });
  });

  it("ignores rushed wrong answers in the probe and withholds the level above 30 percent", () => {
    let s = scriptBlock(start(4), 0, 6);
    expect(nextQuestion(s)!.level).toBe(4);
    s = drain(s, 6);
    const rushed = s.answers.map(a => ({ ...a, timeMs: 100 }));
    const replay = restoreSession(storedTest(s), rushed);
    expect(rescoreAdaptivePlacement(storedTest(s), replay.answers)).toEqual({ outcome: "retake", level: null });
    expect(finish(replay)).toMatchObject({ workingLevel: null, pace: { unreliable: true } });
  });

  it("asks at most six coverage questions after confirming an above-grade level", () => {
    const s = drain(start(3), 6);
    expect(finish(s).workingLevel).toBeGreaterThan(3);
    const count = s.adaptive!.blocks.filter(b => b.purpose === "coverage").reduce((total, b) => total + b.questions.length, 0);
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThanOrEqual(6);
  });

  it("replays a stored v1 form without adopting the v2 step down or placement thresholds", () => {
    const first = start(6);
    const old = { ...storedTest(first), adaptive: { ...first.adaptive!, version: 1 as const } };
    const s = scriptBlock(restoreSession(JSON.parse(JSON.stringify(old)), []), 1);
    expect(nextQuestion(s)!.level).toBe(5);
    expect(testStep(s)).not.toHaveProperty("secondBreakAfter");
    const completed = drain(s, 3);
    expect(finish(restoreSession(storedTest(completed), completed.answers))).toMatchObject({
      workingLevel: 0, confidence: "low", levelCertainty: "early-sign",
    });
    expect(finish(completed)).not.toHaveProperty("adaptiveVersion");
  });
});
