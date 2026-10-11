import { describe, expect, it } from "vitest";
import {
  SAMPLE_BANK,
  bandFor,
  createSession,
  nextQuestion,
  restoreSession,
  storedTest,
  submitAnswer,
  testStep,
  workProblem,
  type ChildProfile,
  type Level,
  type PublicQuestion,
  type Question,
  type Route,
  type Session,
  type Strand,
  type Template,
} from "@/lib/assessment";
import { allRight, allWrong, type Script } from "./scripted-child";

// Shown work on the whiteboard (#67, D-083): required on 5 / 7 / 10 questions by grade band, optional on the rest.

/** Takes a whole test through the public API and returns the questions as the browser saw them. */
function walk(profile: ChildProfile, seed: number, isRight: Script, bank?: readonly Template[]) {
  let session = createSession(profile, seed, { bank });
  const seen: (PublicQuestion & { templateId: string })[] = [];
  for (let q = nextQuestion(session); q; q = nextQuestion(session)) {
    const step = testStep(session);
    if (step.status !== "question") throw new Error("expected a question");
    seen.push({ ...step.question, templateId: q.templateId });
    session = submitAnswer(session, { questionId: q.id, response: isRight(q, seen.length - 1) ? q.answer : "no idea", timeMs: 20_000 });
  }
  return { seen, route: session.route as Route };
}

const staysOnGrade: Script = (_, i) => i % 2 === 0;
const ROUTES = [[allRight, "up"], [staysOnGrade, "stay"], [allWrong, "down"]] as const;

/** Fixture templates at one level, one per strand, so a band the sample bank does not cover can be built. */
const fixtures = (level: Level, strands: readonly Strand[], whiteboard = false): Template[] =>
  strands.map((strand) => ({
    id: `fixture-${level}-${strand}`,
    strand,
    grades: { BC: level },
    format: "number",
    whiteboard,
    standard: `${level}.1`,
    fill: (rng) => {
      const a = rng.int(1, 99), b = rng.int(1, 99);
      return { values: { a, b }, prompt: `${strand}${level}: ${a} + ${b} = ?`, readAloud: `${a} plus ${b}`, answer: String(a + b), wrong: [{ value: String(a + b + 1), misconception: "O3" }] };
    },
  }));

describe("shown work: which questions require it", () => {
  it("grades 3-5: every route requires shown work on exactly 7 questions", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      for (const [script, route] of ROUTES) {
        const { seen, route: taken } = walk({ grade: 4, province: "BC" }, seed, script);
        expect(taken, `seed ${seed}`).toBe(route);
        expect(seen.filter((q) => q.showWork), `seed ${seed}, ${route}`).toHaveLength(7);
      }
    }
  });

  it("grades 1-2: 5 questions, even when few templates suit shown work", () => {
    const bank = [...SAMPLE_BANK, ...fixtures(1, ["N", "A", "MG"])];
    for (const seed of [1, 2, 3]) {
      for (const [script, route] of ROUTES) {
        const { seen } = walk({ grade: 2, province: "BC" }, seed, script, bank);
        expect(seen, `seed ${seed}, ${route}`).toHaveLength(24);
        expect(seen.filter((q) => q.showWork), `seed ${seed}, ${route}`).toHaveLength(5);
      }
    }
  });

  it("grades 6-7: 10 questions", () => {
    const bank = [...SAMPLE_BANK, ...fixtures(7, ["N", "F", "A", "MG"], true)];
    for (const [script, route] of ROUTES) {
      const { seen } = walk({ grade: 6, province: "BC" }, 1, script, bank);
      expect(seen, route).toHaveLength(42);
      expect(seen.filter((q) => q.showWork), route).toHaveLength(10);
    }
  });

  it("reads the template's flag: with enough suited templates, every required question comes from one", () => {
    // Number operations and algebra suit shown work in this bank; nothing else does.
    const bank = SAMPLE_BANK.map((t) => ({ ...t, whiteboard: t.strand === "O" || t.strand === "A" }));
    const suits = new Set(bank.filter((t) => t.whiteboard).map((t) => t.id));
    for (const seed of [1, 2, 3, 4]) {
      for (const [script, route] of ROUTES) {
        const { seen } = walk({ grade: 4, province: "BC" }, seed, script, bank);
        const shown = seen.filter((q) => q.showWork);
        expect(shown, `seed ${seed}, ${route}`).toHaveLength(7);
        expect(shown.every((q) => suits.has(q.templateId)), `seed ${seed}, ${route}`).toBe(true);
      }
    }
  });

  it("a test stored before #67 has no showWork flags, so nothing is required", () => {
    const session = createSession({ grade: 4, province: "BC" }, 1);
    const strip = (qs: Question[]) =>
      qs.map((q) => {
        const old = { ...q };
        delete old.showWork;
        return old;
      });
    const old = restoreSession({ ...storedTest(session), stage1: strip(session.stage1) }, []);
    const step = testStep(old);
    expect(step.status === "question" && step.question.showWork).toBe(false);
  });

  it("the same seed asks for shown work on the same questions; another seed differs", () => {
    const required = (seed: number) => walk({ grade: 4, province: "BC" }, seed, allRight).seen.filter((q) => q.showWork).map((q) => q.prompt);
    expect(required(11)).toEqual(required(11));
    expect(required(12)).not.toEqual(required(11));
  });
});

/** The session at the first question that is (or is not) a show-your-work question. */
function at(profile: ChildProfile, showWork: boolean, bank?: readonly Template[]): Session {
  let session = createSession(profile, 1, { bank });
  for (let q = nextQuestion(session); q; q = nextQuestion(session)) {
    if ((q.showWork ?? false) === showWork) return session;
    session = submitAnswer(session, { questionId: q.id, response: q.answer, timeMs: 20_000 });
  }
  throw new Error("no such question");
}

const grade1Bank = [...SAMPLE_BANK, ...fixtures(0, ["N", "A", "MG"]), ...fixtures(1, ["N", "A", "MG"])];

describe("shown work: what may go with an answer", () => {
  const drawing = { drawn: true, text: "" };
  const typed = { drawn: false, text: "48 + 20 = 68" };
  const empty = { drawn: false, text: "" };

  it("a show-your-work question with an empty board is refused", () => {
    expect(workProblem(at({ grade: 4, province: "BC" }, true), empty)).toBe("work_required");
  });

  it("only spaces and line breaks are not work", () => {
    expect(workProblem(at({ grade: 4, province: "BC" }, true), { drawn: false, text: " \n\t " })).toBe("work_required");
  });

  it("a drawing, typed working, or both count as work", () => {
    const session = at({ grade: 4, province: "BC" }, true);
    expect(workProblem(session, drawing)).toBeNull();
    expect(workProblem(session, typed)).toBeNull();
    expect(workProblem(session, { drawn: true, text: "carry the 1" })).toBeNull();
  });

  it("any other question takes an answer with or without work", () => {
    const session = at({ grade: 4, province: "BC" }, false);
    expect(workProblem(session, empty)).toBeNull();
    expect(workProblem(session, drawing)).toBeNull();
    expect(workProblem(session, typed)).toBeNull();
  });

  it("grades 1-2 draw only: typed working is refused, a drawing is fine", () => {
    for (const grade of [1, 2] as const) {
      expect(bandFor(grade).whiteboardTyping, `grade ${grade}`).toBe(false);
      const session = at({ grade, province: "BC" }, true, grade1Bank);
      expect(workProblem(session, typed), `grade ${grade}`).toBe("typing_off");
      expect(workProblem(session, { drawn: true, text: "5" }), `grade ${grade}`).toBe("typing_off");
      expect(workProblem(session, drawing), `grade ${grade}`).toBeNull();
    }
  });

  it("grades 3-7 can type", () => {
    for (const grade of [3, 4, 5, 6, 7] as const) expect(bandFor(grade).whiteboardTyping, `grade ${grade}`).toBe(true);
  });

  it("a finished test takes no work", () => {
    let session = createSession({ grade: 4, province: "BC" }, 1);
    for (let q = nextQuestion(session); q; q = nextQuestion(session)) session = submitAnswer(session, { questionId: q.id, response: q.answer, timeMs: 1 });
    expect(() => workProblem(session, drawing)).toThrow(/complete/);
  });
});
