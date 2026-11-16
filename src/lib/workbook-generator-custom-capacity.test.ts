import { expect, it } from "vitest";
import { curriculumFor } from "./workbook-curriculum";
import { firstCustomerProfile } from "./workbook-sample-profiles";
import { planNextWorkbook } from "./workbook-placement";
import { generateWorkbook, prepareWorkbookCapacity, workbookCapacityPlan, type FitCheck, type GenerateInput } from "./workbook-generator";
import { buildPlannedItem } from "./workbook-item-plan";
import { taskIdentity } from "./workbook-task-identity";
import { fakeAiClient } from "./ai-client-fake";
import { fakeWorkbookItems } from "./workbook-ai-fake";
import { keySolver } from "./workbook-solve-check";
import { workbookQuality } from "./workbook-quality";
import { reviewMasteryStep } from "./workbook-review-level";

// A bounded counting seam isolates contract selection. Real seeded samples prove the physical fit separately.
const capacityFit: FitCheck = { fits: async page => page.questions.length <= (page.type === "warm-up" ? 12 : 10)
  ? { ok: true } : { ok: false, problems: [{ question: null, reason: "test page capacity" }] } };

function customInput(addReview: string[], days = [1, 5, 10]): GenerateInput {
  const curriculum = curriculumFor("bc")!;
  const placed = planNextWorkbook({ curriculum, grade: 4, profile: firstCustomerProfile(), workbooks: [], number: 1,
    instructions: { version: 1, startLevel: "U19", teachMore: ["6.4", "6.13"], teachLess: [],
      addReview, difficulty: null } });
  if (!placed.ok) throw new Error(placed.reason);
  const plan = workbookCapacityPlan(curriculum, placed.plan);
  const workbookId = "17fc5da1-2442-488a-a450-611a471e73e6";
  return { workbookId, childId: "00000000-0000-4000-8000-000000000001",
    number: 1, profileBuild: null, curriculum, itemPolicy: "approved-v1", book: { child: "Synthetic" },
    plan: { ...plan, days: plan.days.filter(d => days.includes(d.day)) } };
}

it.each<[string, string[]]>([
  ["the three applied reviews", ["5.2", "5.7", "5.15"]],
  ["all four requested reviews", ["5.2", "5.7", "5.15", "5.19"]],
])("keeps approved own-step questions in U19's extra angle practice with %s", async (_label, addReview) => {
  const input = customInput(addReview);
  const prepared = await prepareWorkbookCapacity(input, capacityFit);
  const practice = prepared.days.find(d => d.day === 5)!.pages.find(p => p.number === 4)!;
  const contracts = Object.values(practice.itemContracts!);
  expect(contracts).not.toContain(null);
  expect(contracts.filter(c => c?.template?.skill === "6.13-classify-angles" && c.template.step === 1).length).toBeGreaterThanOrEqual(3);
  const tasks = contracts.map((c, i) => {
    if (!c) throw new Error("Missing approved question");
    const built = buildPlannedItem(c, c.item, { id: `custom:${i}`, workbookId: input.workbookId, page: 12, question: i + 1, level: 19, skills: [c.item.skill] });
    expect(built.check.status).toBe("checked");
    expect(built.package).not.toBeNull();
    return taskIdentity(built.package!);
  });
  expect(new Set(tasks).size).toBe(tasks.length);
  const unprovenReviews = prepared.days.flatMap(d => d.pages.flatMap(p => Object.entries(p.itemContracts ?? {}).flatMap(([slot, c]) =>
    c && reviewMasteryStep(input.curriculum, prepared.level, c.item.skill) !== null && !c.template ? [`day ${d.day} page ${p.number} slot ${slot}: ${c.item.skill}`] : [])));
  expect(unprovenReviews).toEqual([]);
  for (const day of prepared.days) for (const page of day.pages) for (const [slot, c] of Object.entries(page.itemContracts ?? {})) {
    const part = page.parts[Number(slot.split(".")[0]) - 1];
    if (part.kind !== "challenge") continue;
    expect(part.step).not.toBeNull();
    expect(c?.template).toMatchObject({ skill: part.step!.skill, step: part.step!.step, difficulty: "hard" });
  }
});

it.each([[2, 1], [6, 2]])("keeps three distinct divisibility Challenge contracts on Day %i, step %i", async (day, step) => {
  const input = customInput(["5.2", "5.7", "5.15"], [day]);
  const prepared = await prepareWorkbookCapacity(input, capacityFit);
  const cards = prepared.days[0].pages.flatMap(page => Object.entries(page.itemContracts ?? {}).flatMap(([slot, c]) =>
    page.parts[Number(slot.split(".")[0]) - 1].kind === "challenge" ? [c] : []));
  expect(cards).toHaveLength(3);
  for (const c of cards) expect(c?.template).toMatchObject({ skill: "6.4-divisibility", step, difficulty: "hard" });
  expect(new Set(cards.map(c => c?.template?.index)).size).toBe(3);
});

it("fills all ten U19 days with approved contracts and distinct own-step Challenge questions", async () => {
  const input = customInput(["5.2", "5.7", "5.15"], Array.from({ length: 10 }, (_, i) => i + 1));
  // Page 6 also holds the five Friday checks, three Challenge cards and four unit checks.
  const prepared = await prepareWorkbookCapacity(input, { fits: async page => page.questions.length <= (page.content?.kind === "day" && page.content.page === 6 ? 14 : page.type === "warm-up" ? 12 : 10)
    ? { ok: true } : { ok: false, problems: [{ question: null, reason: "test page capacity" }] } });
  const missing = prepared.days.flatMap(day => day.pages.flatMap(page => Object.entries(page.itemContracts ?? {}).flatMap(([slot, c]) =>
    c === null && !page.existingSlots?.includes(slot) ? [`Day ${day.day} page ${page.number}, ${slot}: missing approved contract`] : [])));
  expect.soft(missing).toEqual([]);
  for (const day of prepared.days) {
    const cards = day.pages.flatMap(page => Object.entries(page.itemContracts ?? {}).flatMap(([slot, c]) => {
      const part = page.parts[Number(slot.split(".")[0]) - 1];
      if (part.kind !== "challenge") return [];
      expect.soft(c?.template, `Day ${day.day}, ${slot}`).toMatchObject({ skill: part.step!.skill, step: part.step!.step, difficulty: "hard" });
      return [c?.template];
    }));
    expect.soft(cards, `Day ${day.day}`).toHaveLength(3);
    expect.soft(new Set(cards.map(c => `${c?.skill}#${c?.step}.${c?.index}`)).size, `Day ${day.day}`).toBe(3);
  }
});

it("keeps the distinct angle task beside its method when practice uses compact reminders", async () => {
  const source = customInput(["5.2", "5.7", "5.15"], Array.from({ length: 10 }, (_, i) => i + 1));
  const input = { ...source, plan: { ...source.plan, days: source.plan.days.map(d => ({ ...d,
    pages: d.pages.map(p => d.day === 5 && p.type === "practice" ? { ...p, compactPanel: true } : p) })) } };
  const fit = capacityFit;
  const plan = await prepareWorkbookCapacity(input, fit);
  let token = 1;
  const generated = await generateWorkbook({ ...input, plan }, { fit, ai: fakeAiClient({ answer: fakeWorkbookItems }), solver: keySolver(),
    qrToken: () => `token-${String(++token).padStart(12, "0")}`,
    store: { save: async draft => ({ status: "saved", draftId: draft.id }), draft: async () => null } });
  expect(generated.status).toBe("stored");
  if (generated.status !== "stored") return;
  const pages = generated.draft.pages.filter(p => p.day === 5 && p.type === "practice");
  expect(pages.length).toBeGreaterThanOrEqual(2);
  let countExamples = 0;
  for (const page of pages) {
    const example = page.panelExamples?.find(e => e?.skill.skills.includes("6.13-classify-angles"));
    expect(example).toBeTruthy();
    const blocks = page.content?.kind === "day" ? page.content.blocks.filter(b => b.slot === "reminder") : [];
    const printed = blocks.flatMap(b => b.lines ?? []).join(" ");
    expect(printed).toContain(example!.text);
    if (example!.text.startsWith("Of ")) {
      countExamples++;
      expect(printed).toContain("Only acute angles");
      expect(printed).not.toContain("Work it out");
    }
  }
  expect(countExamples).toBeGreaterThan(0);
  expect(workbookQuality(pages).issues.filter(i => i.kind === "repeat" && i.reason.startsWith("the teaching panel repeats"))).toEqual([]);
});
