import { expect, it } from "vitest";
import { curriculumFor } from "./workbook-curriculum";
import { fakeAiClient } from "./ai-client-fake";
import { fakeWorkbookItems } from "./workbook-ai-fake";
import { buildPlannedItem } from "./workbook-item-plan";
import { generateWorkbook, prepareWorkbookCapacity, workbookCapacityPlan } from "./workbook-generator";
import { planNextWorkbook } from "./workbook-placement";
import { keySolver } from "./workbook-solve-check";
import { renderableDraft } from "./workbook-fit";
import { pagePlan } from "./workbook-template";

it.each([2, 3])("plans three checked Challenge cards on every teaching step of U10 book %i without assessment results", async number => {
  const curriculum = curriculumFor("bc")!;
  const placed = planNextWorkbook({ curriculum, grade: 3, profile: null, number,
    workbooks: Array.from({ length: number - 1 }, (_, i) => ({ number: i + 1, levels: [10] })) });
  if (!placed.ok) throw new Error(placed.reason);
  const workbookId = "00000000-0000-4000-8000-000000000728";
  const plan = await prepareWorkbookCapacity({ workbookId, childId: "00000000-0000-4000-8000-000000000001", number,
    profileBuild: null, curriculum, plan: workbookCapacityPlan(curriculum, placed.plan), itemPolicy: "approved-v1", book: { child: "Alex" } },
  { fits: async () => ({ ok: true }) });
  for (const day of plan.days) for (const page of day.pages.filter(p => p.type === "challenge")) {
    for (const group of page.capacity!.filter(s => s.slot === "challenge")) {
      const contracts = Object.entries(page.itemContracts!).filter(([id]) => id.startsWith(`${group.part + 1}.`));
      expect(contracts, `Day ${day.day}`).toHaveLength(3);
      for (const [slot, contract] of contracts) {
        expect(contract, `Day ${day.day}, slot ${slot}`).not.toBeNull();
        if (!contract) continue;
        const step = page.parts[group.part].step!;
        expect(contract.template).toMatchObject({ skill: step.skill, step: step.step, difficulty: "hard" });
        const built = buildPlannedItem(contract, contract.item, { id: `test:${day.day}:${slot}`, workbookId,
          page: page.number, question: Number(slot.split(".")[1]), level: 10, skills: [contract.item.skill] });
        expect(built.check, `Day ${day.day}, slot ${slot}`).toMatchObject({ status: "checked" });
        expect(built.package).not.toBeNull();
      }
    }
  }
  let token = 0;
  const generated = await generateWorkbook({ workbookId, childId: "00000000-0000-4000-8000-000000000001", number,
    profileBuild: null, curriculum, plan, itemPolicy: "approved-v1", book: { child: "Alex" } }, {
    ai: fakeAiClient({ answer: fakeWorkbookItems }), solver: keySolver(), fit: { fits: async () => ({ ok: true }) },
    qrToken: () => `token-${String(++token).padStart(12, "0")}`,
    store: { save: async draft => ({ status: "saved", draftId: draft.id }), draft: async () => null },
  });
  expect(generated.status).toBe("stored");
  if (generated.status !== "stored") return;
  const estimatePages = generated.draft.pages.filter(p => p.type === "new-idea" && p.questions.some(q =>
    q.itemPlan?.template?.skill === "3.1-estimate-quantity" && q.itemPlan.template.step === 3));
  expect(estimatePages.length).toBeGreaterThan(0);
  const printed = renderableDraft(generated.draft).pages;
  for (const page of estimatePages) expect(pagePlan(printed.find(x => x.number === page.number)!)?.incomplete ?? [], `Page ${page.number}`).toEqual([]);
  expect({
    failed: generated.draft.pages.flatMap(p => p.questions.filter(q => q.check.status === "failed").map(q => ({
      page: p.number, question: q.number, place: q.place, text: q.package?.text ?? q.itemPlan?.item.text,
      reason: q.check.status === "failed" ? q.check.reason : "",
    }))),
    issues: generated.draft.quality?.issues,
  }).toEqual({ failed: [], issues: [] });
  expect(generated.draft.quality?.ready).toBe(true);
}, 60_000);
