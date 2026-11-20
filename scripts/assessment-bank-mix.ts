// Offline bank inventory and block mix. Run with bun scripts/assessment-bank-mix.ts [province].
import { createAdaptiveSession, difficultyOf, lockAdaptiveBlock, nextQuestion, submitAnswer } from "../src/lib/assessment";
import type { Grade, Province, Question } from "../src/lib/assessment";
import { adaptiveBank, adaptiveDifficultyOf } from "../src/lib/assessment/bank";
import { levelFor } from "../src/lib/assessment/session";

const provinces = ["BC", "AB", "SK", "MB", "ON"] as const satisfies readonly Province[];
const province = provinces.find((p) => p === (process.argv[2] ?? "BC"));
if (!province) throw new Error("Choose BC, AB, SK, MB or ON");
const grades: Grade[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
const countMix = (items: readonly Pick<Question, "templateId" | "difficulty">[]) => {
  const counts = { easy: 0, medium: 0, hard: 0 };
  for (const item of items) counts[item.difficulty ?? difficultyOf(item.templateId)]++;
  return counts;
};
const mix = ({ easy, medium, hard }: ReturnType<typeof countMix>) => [easy, medium, hard].join("/");
const bank = adaptiveBank(province);
const rows = grades.map((grade) => {
  const groups = new Map<string, Question[][]>();
  for (let i = 1; i <= 120; i++) {
    let session = createAdaptiveSession({ grade, province }, i * 7919);
    const add = (group: string, questions: Question[]) => {
      const blocks = groups.get(group) ?? [];
      blocks.push(questions);
      groups.set(group, blocks);
    };
    add("opening", session.adaptive!.blocks[0].questions);
    for (let block = 0; !session.adaptive!.complete; block++) {
      const part = session.adaptive!.blocks[block];
      if (block > 0) add(part.purpose === "coverage" ? "coverage" : "later grade check", part.questions);
      for (let j = 0; j < part.questions.length; j++) {
        const q = nextQuestion(session)!;
        // Rotate invented records through a high score, a second look, and a downward route.
        const correct = j < (i % 3 === 0 ? 6 : i % 3 === 1 ? 4 : 2);
        session = submitAnswer(session, { questionId: q.id, response: correct ? q.answer : "I don't know yet", timeMs: 15000 });
      }
      session = lockAdaptiveBlock(session);
    }
  }
  return {
    grade,
    inventory: mix(countMix(bank.filter((t) => levelFor(t, province) === grade).map((t) => ({ templateId: t.id, difficulty: adaptiveDifficultyOf(t.id, province) })))),
    ...Object.fromEntries([...groups].map(([group, blocks]) => {
      const full = blocks.filter((qs) => qs.length === 6);
      const counts = full.map(countMix);
      const target = counts.filter(({ easy, medium, hard }) => easy >= 1 && easy <= 2 && medium >= 2 && medium <= 3 && hard <= 2).length;
      const totals = countMix(full.flat());
      const average = Object.values(totals).map((n) => (n / (full.length || 1)).toFixed(2)).join("/");
      return [group, `${target}/${full.length} target, ${average} average, ${blocks.length - full.length} short`];
    })),
  };
});
console.table(rows);
