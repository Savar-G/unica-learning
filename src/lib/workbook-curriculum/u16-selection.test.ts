import { expect, it } from "vitest";
import { bcStepProgressions } from "@/lib/workbook-curriculum";
import { buildStepItem, stepTemplateItem } from "@/lib/workbook-step-items";
import { largestNumber } from "@/lib/workbook-task-identity";

it("selects a hard upper-range review form before a smaller medium number question", () => {
  const curriculum = bcStepProgressions();
  for (const seed of [1, 3, 19, 71, 409, 997]) for (const attempt of [0, 3, 16, 128, 320]) {
    const filled = stepTemplateItem({ curriculum, skill: "5.9-multiply-tens", step: 1,
      place: "show-what-you-know", level: 16, day: 10, seed, attempt, ordinal: 0, room: 96 });
    expect(filled, `seed ${seed}, attempt ${attempt}`).not.toBeNull();
    expect(filled!.ref.difficulty, filled!.text).toBe("hard");
    const built = buildStepItem(filled!.ref, filled!.text, { id: "review", workbookId: "1c45456d-0e60-4581-ba41-accde66de3cf", page: 76, question: 1, level: 16, skills: [filled!.ref.skill] }, "code");
    expect(built.package, filled!.text).not.toBeNull();
    expect(largestNumber(built.package!), filled!.text).toBeGreaterThanOrEqual(4500);
  }
});

it("keeps the practice page's own step when capacity replaces a long question", async () => {
  const { fakeAiClient } = await import("@/lib/ai-client-fake");
  const { fakeWorkbookItems } = await import("@/lib/workbook-ai-fake");
  const { generateWorkbook } = await import("@/lib/workbook-generator");
  const { planWorkbook } = await import("@/lib/workbook-plan");
  const { sampleChild, samplePlanInput } = await import("@/lib/workbook-sample-profiles");
  const { keySolver } = await import("@/lib/workbook-solve-check");
  const curriculum = bcStepProgressions();
  const planned = planWorkbook(samplePlanInput(curriculum, sampleChild(curriculum, "U16")!, "first"));
  if (!planned.ok) throw new Error(planned.reason);
  let tokens = 0, rejected = 0;
  const result = await generateWorkbook({ workbookId: "6d040b93-bffe-4ccb-b00c-8eaaa92d3a66",
    childId: "00000000-0000-4000-8000-0000000000c1", number: 1, profileBuild: null,
    curriculum, plan: planned.plan, book: { child: "Noah" }, itemPolicy: "approved-v1",
  }, {
    ai: fakeAiClient({ answer: fakeWorkbookItems }), solver: keySolver(),
    fit: { fits: async page => {
      // A binding capacity failure on the long own-step form, rather than a fit stub alone.
      const long = page.number === 62 && rejected === 0 ? page.questions.find(q => /hundreds (?:place|digit)/.test(q.package.text)) : null;
      if (long) { rejected++; return { ok: false, problems: [{ question: long.number, reason: `question ${long.number}'s text takes 4 lines` }] }; }
      return { ok: true };
    } },
    store: { save: async draft => ({ status: "saved", draftId: draft.id }), draft: async () => null },
    qrToken: () => `token-${String(++tokens).padStart(12, "0")}`,
  });
  expect(result.status).toBe("stored");
  if (result.status !== "stored") return;
  expect(rejected).toBeGreaterThan(0);
  const page = result.draft.pages.find(p => p.number === 62)!;
  const own = page.questions.filter(q => q.place === "practice-row" && q.itemPlan?.template?.skill === "5.1-place-value-million" && q.itemPlan.template.step === 3);
  expect(own.length, JSON.stringify({ questions: page.questions.map(q => [q.place, q.itemPlan?.template?.skill, q.itemPlan?.template?.step, q.package?.text]), issues: result.draft.quality?.issues })).toBeGreaterThanOrEqual(3);
  expect(result.draft.quality?.issues.filter(i => i.kind === "step")).toEqual([]);
}, 30_000);
