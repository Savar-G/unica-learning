import { describe, expect, it } from "vitest";
import { checked } from "@/lib/assessment/scripted-child";
import {
  REPORTED_STRAND,
  bankFor,
  createSession,
  extraRoundOffer,
  finish,
  levelFor,
  nextQuestion,
  restoreSession,
  startExtraRound,
  storedTest,
  submitAnswer,
  testStep,
  type ChildProfile,
  type Question,
  type Session,
} from "@/lib/assessment";

// The optional extra round (#190, spec #181): after the last main question, only when an area's result is an early
// sign, the child can take up to 8 more questions at or below the school grade on the early-sign areas.

type Script = (q: Question, index: number) => boolean;

/** A child answers every main question of the test drawn from `seed`: right when the script says so, in 20 seconds. */
function mainTest(profile: ChildProfile, seed: number, script: Script): Session {
  let session = createSession(profile, seed);
  for (let q = nextQuestion(session); q; q = nextQuestion(session)) {
    session = checked(submitAnswer(session, { questionId: q.id, response: script(q, session.answers.length) ? q.answer : "no idea", timeMs: 20_000 }));
  }
  return session;
}

const ASHA: ChildProfile = { grade: 4, province: "BC" };
/** Asha's test from seed 1 with the first answer wrong: routed up, its area 5 of 6 (Secure, an early sign), every other area 6 of 6. */
const oneWrong = () => mainTest(ASHA, 1, (_, i) => i !== 0);

describe("the extra round offer", () => {
  it("is not made when every area is clear", () => {
    expect(extraRoundOffer(mainTest(ASHA, 1, () => true))).toBeNull();
  });

  it("is made once every main answer is in, for the early-sign areas only, with 8 questions", () => {
    const session = oneWrong();
    const early = REPORTED_STRAND[session.stage1[0].strand];
    expect(extraRoundOffer(session)).toEqual({ questions: 8, strands: [early] });
  });

  it("is not made before the last main answer", () => {
    const session = oneWrong();
    const before: Session = { ...session, answers: session.answers.slice(0, -1) };
    expect(extraRoundOffer(before)).toBeNull();
  });
});

describe("taking the extra round", () => {
  it("asks its questions after the main test, numbered on from it, and marks each as extra-round question n of 8", () => {
    const session = startExtraRound(oneWrong());
    expect(session.answers).toHaveLength(42);
    expect(testStep(session)).toMatchObject({ status: "question", number: 43, total: 50, extra: { number: 1, total: 8 }, question: { id: "x-0", showWork: false } });
    let next = session;
    for (let i = 0; i < 7; i++) next = submitAnswer(next, { questionId: nextQuestion(next)!.id, response: "1", timeMs: 20_000 });
    expect(testStep(next)).toMatchObject({ status: "question", number: 50, total: 50, extra: { number: 8, total: 8 } });
    next = submitAnswer(next, { questionId: nextQuestion(next)!.id, response: "1", timeMs: 20_000 });
    expect(testStep(next)).toEqual({ status: "complete", total: 50 });
  });

  it("main questions carry no extra-round mark", () => {
    expect(testStep(createSession(ASHA, 1))).not.toHaveProperty("extra");
  });

  it("keeps its questions in the stored test, so the session comes back the same from the answers", () => {
    const session = startExtraRound(oneWrong());
    const answers = session.answers.map(({ questionId, response, timeMs }) => ({ questionId, response, timeMs }));
    const restored = restoreSession(storedTest(session), answers);
    expect(nextQuestion(restored)).toEqual(nextQuestion(session));
    expect(restored.extra).toEqual(session.extra);
  });

  it("is refused when no round is due", () => {
    expect(() => startExtraRound(mainTest(ASHA, 1, () => true))).toThrow();
  });

  it("is never offered outside BC selection, which AB, SK, MB and ON keep (D-110)", () => {
    for (const province of ["AB", "SK", "MB", "ON"] as const) {
      expect(extraRoundOffer(mainTest({ grade: 4, province }, 1, (_, i) => i % 3 !== 0)), province).toBeNull();
    }
  });
});

describe("scoring a test with an extra round", () => {
  /** Asha's one-wrong test with the extra round taken, and its 8 answers right. */
  const withRoundRight = () => {
    let session = startExtraRound(oneWrong());
    for (let q = nextQuestion(session); q; q = nextQuestion(session)) session = checked(submitAnswer(session, { questionId: q.id, response: q.answer, timeMs: 20_000 }));
    return session;
  };

  it("counts the round's answers in its area: 5 of 6 becomes 13 of 14, which is clear", () => {
    const session = withRoundRight();
    const early = REPORTED_STRAND[session.stage1[0].strand];
    expect(finish(oneWrong()).strands.find((s) => s.strand === early)).toMatchObject({ correct: 5, total: 6, status: "secure", certainty: "early-sign" });
    const placement = finish(session);
    expect(placement.strands.find((s) => s.strand === early)).toMatchObject({ correct: 13, total: 14, status: "secure", certainty: "clear" });
    expect(placement.extraRound).toEqual({ questions: 8, strands: [early] });
  });

  it("keeps the route and the stage 1 score, which were decided during the main test", () => {
    const before = finish(oneWrong());
    const after = finish(withRoundRight());
    expect(after.route).toBe(before.route);
    expect(after.stage1).toEqual(before.stage1);
  });

  it("is not scored until every question of the round has an answer", () => {
    const session = startExtraRound(oneWrong());
    expect(() => finish(session)).toThrow();
  });

  it("a test without a round has no extra-round record", () => {
    expect(finish(oneWrong())).not.toHaveProperty("extraRound");
  });
});

// Every BC grade, many seeds and three children, so each route and most areas get early signs.
describe("the questions of an extra round", () => {
  const scripts: Script[] = [(_, i) => i % 3 !== 0, (_, i) => i % 2 === 0, (_, i) => i !== 0, (_, i) => i < 10];
  it.each([1, 2, 3, 4, 5, 6, 7] as const)("grade %i: up to 8, at or below the school grade, spread over the early-sign areas, with no template used before", (grade) => {
    const routes = new Set<string>();
    const bank = bankFor(grade);
    for (let seed = 0; seed < 40; seed++) {
      for (const script of scripts) {
        const main = mainTest({ grade, province: "BC" }, seed, script);
        const offer = extraRoundOffer(main);
        const early = finish(main).strands.filter((s) => s.certainty === "early-sign").map((s) => s.strand);
        const label = `grade ${grade} seed ${seed} route ${main.route}`;
        // Offered exactly when an area is an early sign (each area here has unused templates at or below grade).
        expect(offer === null, label).toBe(early.length === 0);
        if (!offer) continue;
        routes.add(main.route!);
        const round = startExtraRound(main).extra!;
        expect(round.length, label).toBe(offer.questions);
        expect(round.length, label).toBeLessThanOrEqual(8);
        expect(round.every((q) => q.level <= grade), label).toBe(true);
        expect(round.every((q) => early.includes(REPORTED_STRAND[q.strand])), label).toBe(true);
        const seen = new Set([...main.stage1, ...main.stage2[main.route!]].map((q) => q.templateId));
        expect(round.filter((q) => seen.has(q.templateId)), label).toEqual([]);
        expect(new Set(round.map((q) => q.templateId)).size, label).toBe(round.length);
        // Spread: an early area gets fewer than an even share only when it has no unused template left at or below grade.
        const share = Math.floor(8 / early.length);
        for (const strand of early) {
          const got = round.filter((q) => REPORTED_STRAND[q.strand] === strand).length;
          const left = bank.filter((t) => REPORTED_STRAND[t.strand] === strand && levelFor(t, "BC") <= grade && !seen.has(t.id) && !round.some((q) => q.templateId === t.id));
          if (got < share) expect(left, `${label} ${strand}`).toEqual([]);
        }
        // Short only when every early area ran out.
        if (round.length < 8) {
          const left = bank.filter((t) => early.includes(REPORTED_STRAND[t.strand]) && levelFor(t, "BC") <= grade && !seen.has(t.id) && !round.some((q) => q.templateId === t.id));
          expect(left, label).toEqual([]);
        }
      }
    }
    expect(routes.size).toBeGreaterThan(1);
  });
});
