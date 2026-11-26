import { createHash } from "node:crypto";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ADAPTIVE_QUESTION_LIMIT, assessmentQuestionsOnly, BLOCK_SIZE, blockQuestions, difficultyOf, skillFamily, createAdaptiveSession, finish, givenQuestions, lockAdaptiveBlock, nextQuestion, restoreSession, storedTest, submitAnswer, testAreaAnswers, testStep, UNKNOWN_RESPONSE, paceOf, flagsFor, REPORTED_STRAND, rescoreAdaptivePlacement, SKILL_TAGS, type Template, type AdaptiveBlock, type Grade, type Session, type Province, type Question } from "@/lib/assessment";

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

function legacyV2(grade: Grade): Session {
  const s = start(grade);
  const adaptive = { ...s.adaptive! };
  delete adaptive.placementRules;
  return restoreSession({ ...storedTest(s), adaptive }, []);
}

function reload(session: Session): Session {
  return restoreSession(JSON.parse(JSON.stringify(storedTest(session))), session.answers);
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

  it("takes a second look on an older v2 attempt after the search budget", () => {
    let s = legacyV2(1);
    for (let i = 0; i < 6; i++) s = scriptBlock(s, 6);
    expect(s.adaptive!.blocks.at(-1)).toMatchObject({ level: 6, purpose: "confirm" });
    expect(testStep(s)).toMatchObject({ status: "question", number: 37, secondBreakAfter: 36 });
    s = scriptBlock(reload(s), 2);
    expect(s.adaptive!.blocks.at(-1)).toMatchObject({ level: 6, purpose: "confirm" });
    const completed = drain(scriptBlock(s, 4), 0);
    expect(finish(reload(completed))).toEqual(finish(completed));
    expect(finish(completed)).toMatchObject({ workingLevel: 6, levelCertainty: "early-sign" });
    expect(rescoreAdaptivePlacement(storedTest(completed), completed.answers).level).not.toBe(6);
  });

  it.each([7, 8])("ends the above-grade check after %i of 12 on a new attempt", first => {
    let s = scriptBlock(start(4), 6);
    s = scriptBlock(s, 4);
    expect(nextQuestion(s)).toMatchObject({ level: 5 });
    s = scriptBlock(reload(s), first - 4);
    expect(nextQuestion(s)).toMatchObject({ level: 4 });
    expect(finish(drain(s, 6))).toMatchObject({ workingLevel: 4, mastered: true, levelCertainty: "clear" });
  });

  it.each([[3, 4], [4, 5]])("places using 9 of 12 above grade followed by %i of 6", (extra, level) => {
    let s = scriptBlock(start(4), 6);
    s = scriptBlock(scriptBlock(s, 4), 5);
    expect(nextQuestion(s)).toMatchObject({ level: 5 });
    s = scriptBlock(reload(s), extra);
    if (level === 4) s = scriptBlock(s, 6);
    const complete = drain(s, 0);
    expect(finish(reload(complete))).toMatchObject({ workingLevel: level, mastered: true });
    expect(rescoreAdaptivePlacement(storedTest(complete), complete.answers)).toMatchObject({ outcome: "placed", level });
  });

  it("passes 10 of the first 12 scored answers above grade and respects the Grade 8 ceiling", () => {
    let s = scriptBlock(start(7), 6);
    s = scriptBlock(scriptBlock(s, 4), 6);
    expect(s.adaptive!.blocks.at(-1)?.purpose).toBe("coverage");
    expect(finish(drain(s, 0))).toMatchObject({ workingLevel: 8, atCeiling: true });
  });

  it("confirms a nine-correct above-grade block after the search budget", () => {
    let s = start(1);
    for (let i = 0; i < 6; i++) s = scriptBlock(s, 6);
    s = scriptBlock(s, 3);
    expect(s.adaptive!.blocks.at(-1)).toMatchObject({ level: 6, purpose: "confirm" });
    expect(finish(drain(scriptBlock(reload(s), 4), 0))).toMatchObject({ workingLevel: 6, mastered: true });
  });

  it("keeps the at-grade second look at the Grade 9 ceiling", () => {
    let s = scriptBlock(scriptBlock(start(9), 4), 4);
    expect(nextQuestion(s)).toMatchObject({ level: 9 });
    s = drain(scriptBlock(s, 4), 0);
    expect(finish(s)).toMatchObject({ workingLevel: 9, mastered: true, atCeiling: true, levelCertainty: "early-sign" });
    expect(givenQuestions(s, s.route).every(q => q.level === 9)).toBe(true);
  });

  it("keeps a locked at-grade pass when the next block extends a rushing run", () => {
    let s = scriptBlock(start(4), 4);
    for (const [i, q] of s.adaptive!.blocks.at(-1)!.questions.entries()) {
      s = submitAnswer(s, { questionId: q.id, response: i === 5 ? q.wrong[0].value : q.answer, timeMs: i === 5 ? 100 : 20_000 });
    }
    const lastAtGrade = s.answers.at(-1)!.questionId;
    s = scriptBlock(lockAdaptiveBlock(s), 0, 2);
    s = drain(reload(s), 0);
    expect(paceOf(s.answers).leftOut).toContain(lastAtGrade);
    expect(finish(s)).toMatchObject({ workingLevel: 4, mastered: true });
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
    delete old.adaptive.placementRules;
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

describe("test-account v2 workbook placement", () => {
  function advance(initial: Session, stopAtPlacement: boolean): Session {
    let session = initial;
    for (let i = 0; i < 100; i++) {
      if (stopAtPlacement && session.adaptive?.blocks.at(-1)?.purpose === "workbook-placement") return session;
      const step = testStep(session);
      if (step.status === "complete") return session;
      if (step.status === "check") session = lockAdaptiveBlock(session);
      else {
        const question = nextQuestion(session)!;
        session = submitAnswer(session, {
          questionId: question.id, response: question.level <= 3 ? question.answer : UNKNOWN_RESPONSE, timeMs: 20_000,
        });
      }
    }
    throw new Error("Assessment did not finish");
  }

  it.each([[2, 2], [3, 3]] as const)("uses %i correct in Level 3 check to place at Level %i without changing the report score", (right, level) => {
    const profile = { grade: 3, province: "BC" } as const;
    const seed = 3;
    const ordinary = advance(createAdaptiveSession(profile, seed), false);
    const checked = advance(createAdaptiveSession(profile, seed, undefined, { workbookPlacement: true }), true);
    expect(checked.adaptive?.blocks.at(-1)?.purpose).toBe("workbook-placement");
    expect(checked.adaptive?.blocks.at(-1)?.questions).toHaveLength(4);
    expect(ordinary.adaptive?.blocks.every(block => block.purpose !== "workbook-placement")).toBe(true);
    const answerCheck = (from: Session, count: number) => {
      let next = from;
      for (let i = 0; i < count; i++) {
        const question = nextQuestion(next)!;
        const done = next.answers.length - assessmentQuestionsOnly(next.adaptive!);
        next = submitAnswer(next, { questionId: question.id, response: done < right ? question.answer : UNKNOWN_RESPONSE, timeMs: 20_000 });
      }
      return next;
    };
    const halfway = answerCheck(checked, 2);
    const resumed = answerCheck(restoreSession(JSON.parse(JSON.stringify(storedTest(halfway))), halfway.answers), 2);
    expect(resumed).toEqual(answerCheck(halfway, 2));
    expect(testStep(resumed).status).toBe("check");
    const completed = lockAdaptiveBlock(resumed);
    expect(testStep(completed).status).toBe("complete");
    expect(finish(completed)).toEqual({ ...finish(ordinary), workbookStart: { level, topic: 1 } });
    expect(testAreaAnswers(completed)).toEqual(testAreaAnswers(ordinary));
  });
});

function play(initial: Session, correct: (index: number, question: Question) => boolean): Session {
  let session = initial;
  for (let i = 0; i < 200; i++) {
    const step = testStep(session);
    if (step.status === "complete") return session;
    if (step.status === "check") session = lockAdaptiveBlock(session);
    else {
      const question = nextQuestion(session)!;
      const index = session.answers.length;
      session = submitAnswer(session, { questionId: question.id, response: correct(index, question) ? question.answer : UNKNOWN_RESPONSE, timeMs: 20_000 });
    }
  }
  throw new Error("Assessment did not finish");
}

describe("test-account workbook check leaves the assessment alone", () => {
  it("asks the same assessment questions and gives the same result, even at the question limit", () => {
    fc.assert(fc.property(fc.constantFrom<Grade>(1, 2, 3, 4, 5, 9), fc.integer({ min: 1, max: 10_000 }), fc.array(fc.boolean(), { minLength: 80, maxLength: 80 }), (grade, seed, script) => {
      const profile = { grade, province: "BC" } as const;
      const ordinary = play(createAdaptiveSession(profile, seed), i => script[i]);
      const checked = play(createAdaptiveSession(profile, seed, undefined, { workbookPlacement: true }), i => script[i]);
      const main = assessmentQuestionsOnly(checked.adaptive!);
      expect(main).toBe(ordinary.answers.length);
      expect(checked.answers.slice(0, main)).toEqual(ordinary.answers);
      if (!ordinary.adaptive!.sufficientEvidence) return;
      const { workbookStart, ...placement } = finish(checked);
      expect(placement).toEqual(finish(ordinary));
      expect(testAreaAnswers(checked)).toEqual(testAreaAnswers(ordinary));
      if (placement.workingLevel !== null && placement.workingLevel >= 2) expect(workbookStart).toBeDefined();
    }), { numRuns: 40 });
  });
});

describe("skill-balanced blocks", () => {
  const strands = ["number", "fractions", "algebra", "shapes"] as const;
  const levelPool = (seed: number, level: number) =>
    createAdaptiveSession({ grade: 9, province: "BC" }, seed).adaptive!.pool.filter(q => q.level === level);

  it("asks each skill family once before repeating one, from any rotation", () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 10_000 }), fc.integer({ min: 0, max: 3 }), fc.constantFrom(7, 8, 9), (seed, offset, level) => {
      const pool = levelPool(seed, level);
      const block = blockQuestions(pool, strands, offset, true);
      const families = new Set(pool.map(skillFamily)).size;
      expect(block).toHaveLength(Math.min(BLOCK_SIZE, pool.length));
      expect(new Set(block.map(skillFamily)).size).toBe(Math.min(block.length, families));
    }), { numRuns: 60 });
  });

  it("puts every skill family's first question before a repeated family, easy first within each", () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 10_000 }), fc.constantFrom(7, 8, 9), fc.integer({ min: 2, max: 4 }), (seed, level, kept) => {
      const all = levelPool(seed, level);
      const few = new Set([...new Set(all.map(skillFamily))].slice(0, kept));
      const block = blockQuestions(all.filter(q => few.has(skillFamily(q))), strands, 0, true);
      const firstOfFamily = block.map((q, i) => block.findIndex(other => skillFamily(other) === skillFamily(q)) === i);
      expect(firstOfFamily.indexOf(false) === -1 || firstOfFamily.slice(firstOfFamily.indexOf(false)).every(first => !first)).toBe(true);
      const rank = { easy: 0, medium: 1, hard: 2 };
      const firsts = block.filter((_, i) => firstOfFamily[i]).map(q => rank[difficultyOf(q.templateId)]);
      expect(firsts).toEqual([...firsts].sort((x, y) => x - y));
    }), { numRuns: 60 });
  });
});

// Capture the emitted blocks and complete finish result from 1165f9bf for every generated script.
it.each([
  [0, "c55aa28e085ae41c53d96157b22a7c7cc6b77f2d370018f1c80a02bb88a4a817"],
  [1, "2242a75fb26881c54fee7a52f567bf661d8285e6409251069332b46d166026e4"],
  [2, "dd9c24bdab4d51191c33edf79c9457893d77f6bc6cb4013cab0b9b8314416cc4"],
  [3, "64ae5f2d149e8b477b537b294bd2e176b56a91d59049dbf95d17ba239cd7d0d7"],
  [4, "ac88daea18190f92de553d59cef08609c3f844ead73688ddac2f2ca6744689d3"],
  [5, "8e2402a7208069b0eb225b088b08a2d7983fbd907b2c60e0ef1a9cd96663210a"],
  [6, "021abfdfa67c5e244d9996c3d071d08a5ae3a62aa8ab4d1b535d9dbcc194c7c2"],
  [7, "16640b57a3b7a103682cb51ecfe4d04c79b9b00c8f2c8f4b7b6db7b6a6a1376f"],
  [8, "816fb79600ff8f0b7d59f8f1e46aacd05a389cb71611dcedd96f1f09badf7701"],
  [9, "b1c97a50762e50b531c59534740d51f533fe5ff516768be32a183588913a5139"],
] as const)("replays the parent commit's Grade %i adaptive routes", (grade, expected) => {
  const results = createHash("sha256");
  fc.assert(fc.property(
    fc.integer({ min: 1, max: 10_000 }),
    fc.constantFrom<Province>("BC", "ON", "AB", "SK", "MB", "other"),
    fc.integer({ min: 0, max: 100 }),
    fc.array(fc.integer({ min: 0, max: 99 }), { minLength: 72, maxLength: 72 }),
    (seed, province, accuracy, script) => {
      const session = play(createAdaptiveSession({ grade, province }, seed), i => script[i] < accuracy);
      const placement = session.adaptive!.sufficientEvidence ? finish(session) : null;
      results.update(JSON.stringify([session.adaptive!.blocks, placement]));
    },
  ), { seed: 221, numRuns: 32 });
  expect(results.digest("hex")).toBe(expected);
});

describe("upper-grade adaptive placement", () => {
  const levels = [9, 10, 11, 12] as const;
  const variantsPerFamily = 4;
  const strands = ["N", "F", "A", "MG", "N", "A"] as const;
  const bank: readonly Template[] = ([8, ...levels] as const).flatMap(level => strands.flatMap((strand, family) =>
    Array.from({ length: variantsPerFamily }, (_, variant): Template => {
      const id = `fixture-${level}-${family}-${variant}`;
      return {
        id, strand, grades: { BC: level }, standard: "", format: "number", whiteboard: false,
        fill: () => ({ values: {}, prompt: id, readAloud: id, answer: "1", wrong: [] }),
      };
    }),
  ));

  it.each(levels.flatMap(grade => levels.map(ability => [grade, ability] as const)))(
    "starts at school Grade %i and places at demonstrated Level %i within the limit",
    (grade, ability) => {
      try {
        bank.forEach((template, index) => {
          const family = Math.floor(index / variantsPerFamily) % strands.length;
          Object.defineProperty(SKILL_TAGS, template.id, { value: [`fixture-skill-${family}`], configurable: true });
        });
        const profile = { grade, province: "BC" } as const;
        for (const seed of [1, 17, 83]) {
          const initial = createAdaptiveSession(profile, seed, bank, { workbookPlacement: true });
          expect(initial.adaptive!.blocks[0].level).toBe(grade);
          const complete = play(initial, (_, question) => question.level <= ability);
          expect(complete.answers.length).toBeLessThanOrEqual(ADAPTIVE_QUESTION_LIMIT);
          expect(finish(reload(complete))).toMatchObject({
            workingLevel: ability, mastered: true, workbookStart: { level: ability, topic: 1 },
            ...(ability === 12 && { levelCertainty: "clear", atCeiling: true }),
          });
          for (const block of complete.adaptive!.blocks) {
            if (block.level >= 10 && block.purpose !== "coverage") {
              expect(new Set(block.questions.map(skillFamily)).size).toBe(BLOCK_SIZE);
            }
          }
        }
      } finally {
        for (const { id } of bank) Reflect.deleteProperty(SKILL_TAGS, id);
      }
    },
  );

  it("respects a bank ending at Level 10 without treating its endpoint as clear", () => {
    const shortBank = bank.filter(template => template.grades.BC <= 10);
    const complete = play(createAdaptiveSession({ grade: 10, province: "BC" }, 17, shortBank), () => true);
    expect(complete.adaptive!.blocks.every(block => block.level <= 10 && block.questions.length > 0)).toBe(true);
    expect(finish(complete)).toMatchObject({ workingLevel: 10, levelCertainty: "early-sign", atCeiling: true });
  });

  it("can route past a missing level in the bank", () => {
    const sparse = bank.filter(template => template.grades.BC !== 10);
    const complete = play(createAdaptiveSession({ grade: 9, province: "BC" }, 17, sparse), () => true);
    expect(complete.adaptive!.blocks.map(block => block.level)).not.toContain(10);
    expect(finish(complete)).toMatchObject({ workingLevel: 12, levelCertainty: "clear" });
  });

  it.each([10, 11, 12] as const)("cannot start Grade %i before its bank is available", grade => {
    expect(() => createAdaptiveSession({ grade, province: "BC" }, 1)).toThrow("The bank cannot start this assessment");
  });
});
