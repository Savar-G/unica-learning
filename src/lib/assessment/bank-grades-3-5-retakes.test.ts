import { describe, expect, it } from "vitest";
import { createSession, type Grade, type TaggedProvince } from "@/lib/assessment";

const GRADES: Grade[] = [3, 4, 5];
const TAGGED: TaggedProvince[] = ["BC", "AB", "SK", "MB", "ON"];

describe("siblings and retakes in grades 3-5", () => {
  it.each(GRADES.flatMap((grade) => TAGGED.map((province) => ({ grade, province }))))(
    "grade $grade $province: siblings and retakes share few templates and almost no questions",
    ({ grade, province }) => {
      let sharedTemplates = 0, templates = 0, sharedQuestions = 0, questions = 0;
      for (let i = 0; i < 200; i++) {
        const [a, b] = [createSession({ grade, province }, 2 * i + 1), createSession({ grade, province }, 2 * i + 2)];
        const bTemplates = new Set(b.stage1.map((q) => q.templateId));
        for (const t of new Set(a.stage1.map((q) => q.templateId))) {
          templates++;
          if (bTemplates.has(t)) sharedTemplates++;
        }
        const bPrompts = new Set([...b.stage1, ...b.stage2.stay].map((q) => `${q.prompt} ${JSON.stringify(q.figure ?? null)}`));
        for (const q of [...a.stage1, ...a.stage2.stay]) {
          questions++;
          if (bPrompts.has(`${q.prompt} ${JSON.stringify(q.figure ?? null)}`)) sharedQuestions++;
        }
      }
      expect(sharedTemplates / templates, `grade ${grade} ${province} templates`).toBeLessThan(0.4);
      expect(sharedQuestions / questions, `grade ${grade} ${province} questions`).toBeLessThan(0.1);
    },
  );
});
