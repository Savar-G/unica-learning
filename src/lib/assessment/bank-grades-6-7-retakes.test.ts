import { describe, expect, it } from "vitest";
import { createSession, type Grade, type TaggedProvince } from "@/lib/assessment";

const TAGGED: TaggedProvince[] = ["BC", "AB", "SK", "MB", "ON"];

describe("siblings and retakes in grades 6-7", () => {
  // Stage 1 template share and stage 1 + stay question share between two seeds, 200 pairs. Measured after the #76
  // primary-source retags (scripts/template-check/triage.md): the other provinces stay under 0.6 templates and 0.12
  // questions. Alberta grade 7 is the exception: Alberta's current K-6 program teaches much of BC's grade 7 content
  // earlier, so its level 7 pool is small (measured 0.80 templates, 0.13 questions). Owner decision 2026-10-11:
  // accept that overlap and add no Alberta grade 7 templates. Ontario grade 7 is next for the same reason (Ontario
  // teaches percent, coordinates and two-step equations in grade 6): measured 0.56 templates, 0.14 questions. Owner
  // decision 2026-10-12 (#76): accept that overlap too.
  const limit = (grade: Grade, province: TaggedProvince) =>
    grade === 7 && province === "AB" ? { templates: 0.85, questions: 0.15 }
      : grade === 7 && province === "ON" ? { templates: 0.6, questions: 0.15 }
        : { templates: 0.6, questions: 0.12 };
  it.each([8, 9] as Grade[])("grade %i: BC siblings share few templates and few questions (D-158)", (grade) => {
    let sharedTemplates = 0, templates = 0, sharedQuestions = 0, questions = 0;
    for (let i = 0; i < 200; i++) {
      const [a, b] = [createSession({ grade, province: "BC" }, 2 * i + 1), createSession({ grade, province: "BC" }, 2 * i + 2)];
      const bTemplates = new Set(b.stage1.map((q) => q.templateId));
      for (const t of new Set(a.stage1.map((q) => q.templateId))) { templates++; if (bTemplates.has(t)) sharedTemplates++; }
      const bPrompts = new Set([...b.stage1, ...b.stage2.stay].map((q) => q.prompt));
      for (const q of [...a.stage1, ...a.stage2.stay]) { questions++; if (bPrompts.has(q.prompt)) sharedQuestions++; }
    }
    expect(sharedTemplates / templates, `grade ${grade} templates`).toBeLessThan(0.6);
    expect(sharedQuestions / questions, `grade ${grade} questions`).toBeLessThan(0.12);
   }, 30_000);

  it.each([6, 7] as Grade[])("grade %i: siblings share few templates and few questions, in every province", (grade) => {
    for (const province of TAGGED) {
      let sharedTemplates = 0, templates = 0, sharedQuestions = 0, questions = 0;
      for (let i = 0; i < 200; i++) {
        const [a, b] = [createSession({ grade, province }, 2 * i + 1), createSession({ grade, province }, 2 * i + 2)];
        const bTemplates = new Set(b.stage1.map((q) => q.templateId));
        for (const t of new Set(a.stage1.map((q) => q.templateId))) { templates++; if (bTemplates.has(t)) sharedTemplates++; }
        const bPrompts = new Set([...b.stage1, ...b.stage2.stay].map((q) => q.prompt));
        for (const q of [...a.stage1, ...a.stage2.stay]) { questions++; if (bPrompts.has(q.prompt)) sharedQuestions++; }
      }
      expect(sharedTemplates / templates, `grade ${grade} ${province} templates`).toBeLessThan(limit(grade, province).templates);
      expect(sharedQuestions / questions, `grade ${grade} ${province} questions`).toBeLessThan(limit(grade, province).questions);
    }
   }, 30_000);
});

