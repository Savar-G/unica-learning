import { describe, expect, it } from "vitest";
import { checked } from "@/lib/assessment/scripted-child";
import { REPORTED_STRAND, bankFor, bandFor, createSession, nextQuestion, submitAnswer, testStep, type Grade } from "@/lib/assessment";

// D-156: Kindergarten (0) to Grade 9. Each grade starts at its own level (D-158: Grade 9 at level 9).
const GRADES: Grade[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
const ROUTES = ["up", "stay", "down"] as const;

describe("BC selection through the public assessment interface", () => {
  it.each(GRADES)("grade %i gives every reported strand six questions at or below grade on every route", (grade) => {
    for (let seed = 0; seed < 200; seed++) {
      const session = createSession({ grade, province: "BC" }, seed * 7919 + 3);
      for (const route of ROUTES) {
        const questions = [...session.stage1, ...session.stage2[route]];
        for (const strand of bandFor(grade).strands) {
          const count = questions.filter((q) => q.level <= grade && REPORTED_STRAND[q.strand] === strand).length;
          expect(count, `grade ${grade} ${route} seed ${seed} ${strand}`).toBeGreaterThanOrEqual(6);
        }
      }
    }
  });
});

describe("BC template and standard coverage", () => {
  it.each(GRADES)("grade %i uses each template once and rotates available standards across both stages", (grade) => {
    const bank = bankFor(grade);
    const byId = new Map(bank.map((t) => [t.id, t]));
    for (let seed = 0; seed < 200; seed++) {
      const session = createSession({ grade, province: "BC" }, seed * 7919 + 3);
      for (const route of ROUTES) {
        const used = new Set<string>();
        const counts = new Map<string, number>();
        for (const q of [...session.stage1, ...session.stage2[route]]) {
          const label = `grade ${grade} ${route} seed ${seed} ${q.templateId}`;
          expect(used.has(q.templateId), label).toBe(false);
          const template = byId.get(q.templateId)!;
          const available = bank.filter((t) => t.grades.BC === q.level && REPORTED_STRAND[t.strand] === REPORTED_STRAND[q.strand] && !used.has(t.id));
          const key = (standard: string) => `${REPORTED_STRAND[q.strand]}:${standard}`;
          const before = counts.get(key(template.standard)) ?? 0;
          expect(before, label).toBe(Math.min(...available.map((t) => counts.get(key(t.standard)) ?? 0)));
          used.add(q.templateId);
          counts.set(key(template.standard), before + 1);
        }
      }
    }
  });
});

it("never repeats a BC template on any seeded route", () => {
  for (const grade of GRADES) for (let seed = 0; seed < 200; seed++) {
    const session = createSession({ grade, province: "BC" }, seed);
    for (const route of ROUTES) {
      const questions = [...session.stage1, ...session.stage2[route]];
      expect(new Set(questions.map((q) => q.templateId)).size, `${grade} ${route} ${seed}`).toBe(questions.length);
    }
  }
});

describe("BC route lengths sent to the child", () => {
  it.each(GRADES)("grade %i reports the stored length at every step and on completion", (grade) => {
    // Grade 8 routes up to level 8 (D-153 rule 2) and Grade 9 to level 9, their start levels, so the up route adds no
    // school-grade questions (D-156, D-158).
    const lengths = grade <= 2 ? { up: 30, stay: 24, down: 24 } : grade <= 5 ? { up: 42, stay: 36, down: 36 } : grade <= 7 ? { up: 45, stay: 42, down: 42 } : { up: 42, stay: 42, down: 42 };
    for (const route of ROUTES) {
      let session = createSession({ grade, province: "BC" }, 123);
      let answered = 0;
      while (nextQuestion(session)) {
        const q = nextQuestion(session)!;
        const expected = session.route ? lengths[route] : lengths.up;
        expect(testStep(session)).toMatchObject({ status: "question", number: answered + 1, total: expected, breakAfter: grade <= 2 ? 12 : grade <= 5 ? 18 : 21 });
        const right = route === "up" || (route === "stay" && answered % 2 === 0);
        session = checked(submitAnswer(session, { questionId: q.id, response: right ? q.answer : "no idea", timeMs: 20000 }));
        answered++;
      }
      expect(session.route).toBe(route);
      expect(answered).toBe(lengths[route]);
      expect(testStep(session)).toEqual({ status: "complete", total: lengths[route] });
    }
  });
});

it("fails clearly when a BC bank cannot fill a route without repeating a template", () => {
  const pool = bankFor(4);
  const numberIds = new Set(pool.filter((t) => t.grades.BC === 4 && REPORTED_STRAND[t.strand] === "number").slice(0, 9).map((t) => t.id));
  const short = pool.filter((t) => t.grades.BC !== 4 || REPORTED_STRAND[t.strand] !== "number" || numberIds.has(t.id));
  expect(() => createSession({ grade: 4, province: "BC" }, 188, { bank: short })).toThrow(/too few unused templates.*number/);
});

it("uses six grade 3 fraction questions on grade 3 down because BC has no lower fraction pool", () => {
  const session = createSession({ grade: 3, province: "BC" }, 188);
  const fractions = [...session.stage1, ...session.stage2.down].filter((q) => q.strand === "F");
  expect(fractions).toHaveLength(6);
  expect(new Set(fractions.map((q) => q.level))).toEqual(new Set([3]));
  expect([...session.stage1, ...session.stage2.down]).toHaveLength(36);
});

it("fills the strand minimum from a usable fallback when the lowest nonempty pool is too short", () => {
  let kept = 0;
  const bank = bankFor(4).filter((t) => !(REPORTED_STRAND[t.strand] === "algebra" && (t.grades.BC === 3 || (t.grades.BC === 2 && kept++ > 0))));
  const session = createSession({ grade: 4, province: "BC" }, 188, { bank });
  const questions = [...session.stage1, ...session.stage2.down];
  const algebra = questions.filter((q) => REPORTED_STRAND[q.strand] === "algebra" && q.level <= 4);
  expect(algebra).toHaveLength(6);
  expect(session.stage2.down.filter((q) => REPORTED_STRAND[q.strand] === "algebra").map((q) => q.level)).toEqual([4, 4]);
  expect(new Set(questions.map((q) => q.templateId)).size).toBe(36);
  expect(questions).toHaveLength(36);
});

it("uses the lowest permitted fallback when more than one level has enough unused templates", () => {
  const bank = bankFor(4).filter((t) => !(t.grades.BC === 3 && REPORTED_STRAND[t.strand] === "algebra"));
  const session = createSession({ grade: 4, province: "BC" }, 188, { bank });
  const added = session.stage2.down.filter((q) => REPORTED_STRAND[q.strand] === "algebra");
  expect(added.map((q) => q.level)).toEqual([2, 2]);
});

it("fails clearly when permitted algebra pools have too few unused templates even with enough above grade", () => {
  let kept = 0;
  const bank = bankFor(4).filter((t) => REPORTED_STRAND[t.strand] !== "algebra" || t.grades.BC > 4 || (t.grades.BC === 4 && kept++ < 5));
  expect(bank.filter((t) => REPORTED_STRAND[t.strand] === "algebra" && t.grades.BC <= 4)).toHaveLength(5);
  expect(bank.filter((t) => REPORTED_STRAND[t.strand] === "algebra" && t.grades.BC === 5).length).toBeGreaterThanOrEqual(6);
  expect(() => createSession({ grade: 4, province: "BC" }, 188, { bank })).toThrow(/too few unused templates.*algebra/);
});
