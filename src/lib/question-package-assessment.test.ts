import { describe, expect, it } from "vitest";
import { BANKS, fillTemplate, type Question } from "@/lib/assessment";
import { checkQuestionPackage } from "@/lib/question-package";
import { SUPPORTED_ASSESSMENT_TEMPLATES, assessmentQuestionPackage } from "@/lib/question-package-assessment";

// The assessment adapter (#298): a stored assessment question becomes a question package only for the supported
// templates; every other template is "content unavailable". Expected values are worked by hand.

const TEST = "00000000-0000-4000-8000-000000000001";

/** A stored question as the test keeps it, with the drawn numbers. */
const stored = (templateId: string, values: Record<string, number>, prompt: string, answer: string, wrong: Question["wrong"]): Question => ({
  id: "s1-3", templateId, level: 2, strand: "O", format: "number", whiteboard: true,
  prompt, readAloud: prompt, values, answer, wrong,
});

describe("assessmentQuestionPackage", () => {
  it("gives the full package for a two-digit addition with regrouping", () => {
    const question = stored("2-add-2-digit", { a: 48, b: 37 }, "48 + 37 = ?", "85", [
      { value: "75", misconception: "O3" },
      { value: "11", misconception: "operation" },
    ]);
    const result = assessmentQuestionPackage({ source: "assessment", assessmentId: TEST, questionId: "s1-3" }, question);
    expect(result).toEqual({
      status: "found",
      package: {
        id: `${TEST}:s1-3`,
        ref: { source: "assessment", assessmentId: TEST, questionId: "s1-3" },
        templateId: "2-add-2-digit",
        text: "48 + 37 = ?",
        answer: { value: { type: "number", value: 85 }, accepted: [], unit: null },
        operation: { kind: "add", operands: [48, 37] },
        steps: [
          { id: "ones", kind: "add-column", place: "ones", digits: [8, 7], carryIn: 0, total: 15, write: 5, carryOut: 1 },
          { id: "tens", kind: "add-column", place: "tens", digits: [4, 3], carryIn: 1, total: 8, write: 8, carryOut: 0 },
          { id: "result", kind: "result", value: { type: "number", value: 85 } },
        ],
        skill: { standard: "2.4", skills: ["2.4-add-within-100"] },
        level: 9,
        difficulty: 2,
        wrongAnswers: [
          { value: { type: "number", value: 75 }, cause: "O3", description: "Forgets to carry when adding", step: "tens" },
          { value: { type: "number", value: 11 }, cause: "operation", description: "Uses the wrong operation", step: null },
        ],
        easierExample: {
          text: "26 + 7 = ?",
          operation: { kind: "add", operands: [26, 7] },
          answer: { type: "number", value: 33 },
          steps: [
            { id: "ones", kind: "add-column", place: "ones", digits: [6, 7], carryIn: 0, total: 13, write: 3, carryOut: 1 },
            { id: "tens", kind: "add-column", place: "tens", digits: [2], carryIn: 1, total: 3, write: 3, carryOut: 0 },
            { id: "result", kind: "result", value: { type: "number", value: 33 } },
          ],
        },
      },
    });
  });
  it("gives the full package for a two-digit subtraction with regrouping", () => {
    const question = stored("2-subtract-2-digit", { a: 83, b: 46 }, "83 − 46 = ?", "37", [
      { value: "43", misconception: "O1" },
      { value: "47", misconception: "regroup-forget" },
    ]);
    const result = assessmentQuestionPackage({ source: "assessment", assessmentId: TEST, questionId: "s1-3" }, question);
    if (result.status !== "found") throw new Error(`expected a package, got ${JSON.stringify(result)}`);
    const p = result.package;
    expect(p.answer.value).toEqual({ type: "number", value: 37 });
    expect(p.steps).toEqual([
      { id: "ones", kind: "subtract-column", place: "ones", top: 3, bottom: 6, lent: false, regrouped: true, write: 7 },
      { id: "tens", kind: "subtract-column", place: "tens", top: 8, bottom: 4, lent: true, regrouped: false, write: 3 },
      { id: "result", kind: "result", value: { type: "number", value: 37 } },
    ]);
    expect(p.skill).toEqual({ standard: "2.4", skills: ["2.4-subtract-within-100"] });
    expect(p.wrongAnswers).toEqual([
      { value: { type: "number", value: 43 }, cause: "O1", description: "Subtracts the smaller digit from the larger in each column", step: "ones" },
      { value: { type: "number", value: 47 }, cause: "regroup-forget", description: "Regroups but forgets to take the ten or hundred away from the next place", step: "tens" },
    ]);
    expect(p.easierExample).toEqual({
      text: "42 − 7 = ?",
      operation: { kind: "subtract", operands: [42, 7] },
      answer: { type: "number", value: 35 },
      steps: [
        { id: "ones", kind: "subtract-column", place: "ones", top: 2, bottom: 7, lent: false, regrouped: true, write: 5 },
        { id: "tens", kind: "subtract-column", place: "tens", top: 4, bottom: null, lent: true, regrouped: false, write: 3 },
        { id: "result", kind: "result", value: { type: "number", value: 35 } },
      ],
    });
  });

  it("picks an easier example whose ones differ from the question's", () => {
    // 36 + 17 has the ones 6 and 7, as the first example 26 + 7 does.
    const question = stored("2-add-2-digit", { a: 36, b: 17 }, "36 + 17 = ?", "53", [{ value: "43", misconception: "O3" }]);
    const result = assessmentQuestionPackage({ source: "assessment", assessmentId: TEST, questionId: "s1-3" }, question);
    expect(result.status === "found" && result.package.easierExample.text).toBe("38 + 5 = ?");
  });

  it("says content unavailable for a template that is not supported", () => {
    const question = stored("2-story-add-2-digit", { a: 48, b: 37 }, "A class collects 48 cans on Monday and 37 cans on Tuesday. How many cans is that in all?", "85", [
      { value: "75", misconception: "O3" },
    ]);
    expect(assessmentQuestionPackage({ source: "assessment", assessmentId: TEST, questionId: "s1-3" }, question)).toEqual({
      status: "unavailable", reason: "unsupported-template", detail: "template 2-story-add-2-digit has no question package",
    });
  });

  it("says content unavailable when the stored answer is not what the numbers give", () => {
    const question = stored("2-add-2-digit", { a: 48, b: 37 }, "48 + 37 = ?", "84", [{ value: "75", misconception: "O3" }]);
    expect(assessmentQuestionPackage({ source: "assessment", assessmentId: TEST, questionId: "s1-3" }, question)).toMatchObject({
      status: "unavailable", reason: "invalid-package",
    });
  });

  it("lists the supported templates", () => {
    expect(SUPPORTED_ASSESSMENT_TEMPLATES).toEqual(["2-add-2-digit", "2-subtract-2-digit"]);
  });

  it("gives a valid package for every question the bank draws from a supported template", () => {
    for (const templateId of SUPPORTED_ASSESSMENT_TEMPLATES) {
      const template = BANKS["1-2"].find((t) => t.id === templateId)!;
      for (let seed = 1; seed <= 300; seed++) {
        const question = fillTemplate(template, seed);
        const result = assessmentQuestionPackage({ source: "assessment", assessmentId: TEST, questionId: question.id }, question);
        if (result.status !== "found") throw new Error(`${templateId} seed ${seed}: ${JSON.stringify(result)}`);
        expect(String((result.package.answer.value as { value: number }).value)).toBe(question.answer);
        expect(checkQuestionPackage(result.package)).toEqual({ ok: true, status: "checked", package: result.package });
      }
    }
  });

  it("says content unavailable for every other template in the banks", () => {
    const others = Object.values(BANKS).flat().filter((t) => !SUPPORTED_ASSESSMENT_TEMPLATES.includes(t.id));
    expect(others.length).toBeGreaterThan(100);
    for (const template of others) {
      const question = fillTemplate(template, 7);
      expect(assessmentQuestionPackage({ source: "assessment", assessmentId: TEST, questionId: question.id }, question)).toMatchObject({
        status: "unavailable", reason: "unsupported-template",
      });
    }
  });
});
