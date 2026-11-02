import { describe, expect, it } from "vitest";
import { bandFor, createSession, type Grade, type Province, type Question, type TaggedProvince } from "@/lib/assessment";

const GRADES: Grade[] = [3, 4, 5];
const PROVINCES: Province[] = ["BC", "AB", "SK", "MB", "ON", "other"];
const TAGGED: TaggedProvince[] = ["BC", "AB", "SK", "MB", "ON"];
const ROUTES = ["up", "stay", "down"] as const;

describe("a grade 3-5 test, every route, every province", () => {
  const band = bandFor(3);

  it.each(GRADES.flatMap((grade) => PROVINCES.map((province) => ({ grade, province }))))(
    "grade $grade $province: enough drawings, exactly 7 suitable required drawings, and no repeated question",
    ({ grade, province }) => {
      expect(band.whiteboardRequired).toBe(7);
      // These checks used to generate the same first 150 and first 20 sessions again.
      // Keep all 300/150/20 seeds and all routes, but build each session only once.
      for (let i = 0; i < 300; i++) {
        const s = createSession({ grade, province }, i * 7919 + 11);
        const drawing = (qs: Question[]) => qs.filter((q) => q.whiteboard).length;
        // Stage 1 must work with the route that offers the fewest drawing questions.
        const poorestForm = Math.min(...ROUTES.map((r) => drawing(s.stage2[r])));
        expect(drawing(s.stage1) + poorestForm, `${province} seed ${s.seed}`).toBeGreaterThanOrEqual(band.whiteboardRequired);
        for (const route of ROUTES) {
          if (i < 150) {
            const required = [...s.stage1, ...s.stage2[route]].filter((q) => q.showWork);
            expect(required, `${province} seed ${s.seed} ${route}`).toHaveLength(band.whiteboardRequired);
            expect(required.every((q) => q.whiteboard), `${province} seed ${s.seed} ${route}`).toBe(true);
          }
          if (i < 20) {
            const asked = [...s.stage1, ...s.stage2[route]].map((q) => `${q.prompt} ${[...(q.choices ?? [])].sort()} ${JSON.stringify(q.figure ?? null)}`);
            expect(new Set(asked).size, `grade ${grade} ${province} seed ${s.seed} ${route}`).toBe(asked.length);
          }
        }
      }
    },
  );

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
