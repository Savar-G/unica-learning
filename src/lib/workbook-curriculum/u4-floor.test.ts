import { expect, it } from "vitest";
import { fakeAiClient } from "@/lib/ai-client-fake";
import { fakeWorkbookItems } from "@/lib/workbook-ai-fake";
import { bcStepProgressions } from "@/lib/workbook-curriculum";
import { generateWorkbook } from "@/lib/workbook-generator";
import { planWorkbook } from "@/lib/workbook-plan";
import { sampleChild, samplePlanInput } from "@/lib/workbook-sample-profiles";
import { keySolver } from "@/lib/workbook-solve-check";

it.each([false, true])("keeps eight U4 review questions and reserves spare tasks, recovery=%s", async recover => {
  const curriculum = bcStepProgressions();
  const planned = planWorkbook(samplePlanInput(curriculum, sampleChild(curriculum, "U4")!, "first"));
  if (!planned.ok) throw new Error(planned.reason);
  const day = planned.plan.days[0];
  const review = day.pages.find(p => p.type === "remember-these")!;
  const part = review.parts.find(p => p.kind === "remember-these")!;
  let tokens = 0;
  let roomAvailable = !recover;
  const result = await generateWorkbook({
    workbookId: "1c45456d-0e60-4581-ba41-accde66de3cf",
    childId: "00000000-0000-4000-8000-0000000000c1", number: 1, profileBuild: null,
    curriculum, plan: { ...planned.plan, days: [{ ...day, pages: [{ ...review, parts: [{ ...part, items: 8 }] }] }] },
    book: { child: "Noah" }, itemPolicy: "approved-v1",
  }, {
    ai: fakeAiClient({ answer: fakeWorkbookItems }), solver: keySolver(),
    // This control proves refill selection only. The full seeded CLI checks physical fit.
    fit: { fits: async page => {
      if (page.type !== "remember-these") return { ok: true };
      if (page.questions.length <= 6) roomAvailable = true;
      return roomAvailable ? { ok: true } : { ok: false, problems: [{ question: null, reason: "Control: the initial questions exceed the room" }] };
    } },
    store: { save: async draft => ({ status: "saved", draftId: draft.id }), draft: async () => null },
    qrToken: () => `token-${String(++tokens).padStart(12, "0")}`,
  });
  expect(result.status).toBe("stored");
  if (result.status !== "stored") return;
  const page = result.draft.pages.find(p => p.type === "remember-these")!;
  const questions = page.questions.filter(q => q.package && q.check.status !== "failed");
  expect(roomAvailable).toBe(true);
  expect(questions).toHaveLength(8);
  expect(result.draft.quality?.issues.filter(i => i.kind === "coverage")).toEqual([]);
});
