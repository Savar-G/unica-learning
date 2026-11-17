import { beforeAll, expect, it } from "vitest";
import { fakeAiClient } from "./ai-client-fake";
import { fakeWorkbookItems } from "./workbook-ai-fake";
import { curriculumFor } from "./workbook-curriculum";
import { generateWorkbook, personalBookIssues, prepareWorkbookCapacity, workbookCapacityPlan, type GenerateInput, type GeneratedPage } from "./workbook-generator";
import { planNextWorkbook } from "./workbook-placement";
import { firstCustomerProfile } from "./workbook-sample-profiles";
import { keySolver } from "./workbook-solve-check";

let input: GenerateInput;
let pages: GeneratedPage[];
beforeAll(async () => {
  const curriculum = curriculumFor("bc")!;
  const placed = planNextWorkbook({ curriculum, grade: 8, profile: firstCustomerProfile(), number: 1, workbooks: [],
    instructions: { version: 1, startLevel: "U19", teachMore: ["6.4", "6.13"], teachLess: [], addReview: ["5.2", "5.7", "5.15"], difficulty: null } });
  if (!placed.ok) throw new Error(placed.reason);
  const full = workbookCapacityPlan(curriculum, placed.plan);
  const day = full.days.find(d => d.day === 2)!;
  const reviewPages = day.pages.filter(p => p.parts.some(part => part.weakChecks?.length));
  expect(reviewPages.flatMap(p => p.parts.flatMap(part => part.weakChecks ?? [])).map(c => c.unit)).toEqual(expect.arrayContaining(["5.2", "5.7", "5.15"]));
  input = { workbookId: "00000000-0000-4000-8000-000000001117", childId: "00000000-0000-4000-8000-000000000071", number: 1,
    profileBuild: null, curriculum, itemPolicy: "approved-v1", book: { child: "Alex" },
    plan: { ...full, days: [{ ...day, pages: reviewPages }], extraPractice: [] } };
  const fit = { fits: async () => ({ ok: true as const }) };
  input = { ...input, plan: await prepareWorkbookCapacity(input, fit) };
  let token = 0;
  const generated = await generateWorkbook(input, { fit, ai: fakeAiClient({ answer: fakeWorkbookItems }), solver: keySolver(),
    qrToken: () => "review-token-" + ++token,
    store: { save: async draft => ({ status: "saved", draftId: draft.id }), draft: async () => null } });
  if (generated.status !== "stored") throw new Error(generated.status);
  pages = generated.draft.pages;
});

it("keeps two questions for each admitted review topic on the requested day", () => {
  const printed = pages.filter(p => p.day === 2).flatMap(p => p.questions);
  for (const unit of ["5.2", "5.7", "5.15"]) expect(printed.filter(q => q.package?.skill.standard === unit).length, unit).toBeGreaterThanOrEqual(2);
  expect(personalBookIssues(input, pages).filter(i => i.kind === "coverage")).toEqual([]);
});

it.each(["5.2", "5.7", "5.15"])("refuses a book whose admitted %s review disappeared despite the saved instruction", unit => {
  const missing = pages.map(p => ({ ...p, questions: p.questions.filter(q => q.package?.skill.standard !== unit) }));
  expect(personalBookIssues(input, missing).some(i => i.kind === "coverage" && i.reason.includes(unit))).toBe(true);
});
