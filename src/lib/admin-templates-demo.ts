// Made-up tests for the admin template table in local development only (?demo=1, as the dashboard, D-099). Each test
// is a real session of the assessment core, taken by a seeded child who knows up to a level, sometimes picks a coded
// wrong answer and sometimes types something else. Seeded, so every reload shows the same numbers. Nothing here reads
// or writes the database.
import { createSession, nextQuestion, submitAnswer, type Grade, type Province } from "@/lib/assessment";
import type { AnswerFact } from "@/lib/admin-templates";

// mulberry32: a small seeded generator
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GRADES: readonly Grade[] = [1, 2, 3, 4, 5, 6, 7];

/** Served questions from made-up tests; the first two are test families. Some tests stop before an answer. */
export function demoAnswers(tests = 42): AnswerFact[] {
  const r = rng(199);
  const out: AnswerFact[] = [];
  for (let i = 0; i < tests; i++) {
    const grade = GRADES[i % GRADES.length];
    const province: Province = r() < 0.8 ? "BC" : "AB";
    // knows up to a level near the school grade
    const knows = grade - 1 + Math.floor(r() * 3);
    let session = createSession({ grade, province }, 1000 + i);
    for (let q = nextQuestion(session); q; q = nextQuestion(session)) {
      if (i % 3 === 0 && session.answers.length === 3) {
        out.push({ templateId: q.templateId, correct: null, timeMs: null, response: null, misconception: null, grade, province, testFamily: i < 2 });
        break;
      }
      const right = q.level <= knows ? r() < 0.88 : r() < 0.3;
      const coded = q.wrong.length > 0 && r() < 0.75;
      const response = right ? q.answer : coded ? q.wrong[Math.floor(r() * q.wrong.length)].value : q.format === "choice" ? (q.choices?.find((c) => c !== q.answer) ?? "") : String(Math.floor(r() * 100));
      const timeMs = Math.round(r() < 0.06 ? 900 + r() * 2000 : 4000 + r() * r() * 70_000);
      session = submitAnswer(session, { questionId: q.id, response, timeMs });
      const a = session.answers[session.answers.length - 1];
      out.push({ templateId: q.templateId, correct: a.correct, timeMs, response, misconception: a.misconception, grade, province, testFamily: i < 2 });
    }
  }
  return out;
}
