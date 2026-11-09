import { expect, it } from "vitest";
import { curriculumFor } from "./workbook-curriculum";
import { prepareWorkbookCapacity, workbookCapacityPlan, type FitCheck, type GenerateInput } from "./workbook-generator";
import { planNextWorkbook } from "./workbook-placement";
import { pagePlan } from "./workbook-template";
import type { DraftPage } from "./workbook-render";

const fullness = { ok: false as const, problems: [{ question: null, kind: "fullness" as const,
  reason: "The page leaves 70 px empty at the bottom; add a question, or spread the rows evenly." }] };

function input(number: number): GenerateInput {
  const curriculum = curriculumFor("bc")!;
  // Grade 3, no assessment results, and preceding U10 books. No family data.
  const placed = planNextWorkbook({ curriculum, grade: 3, profile: null, number,
    workbooks: Array.from({ length: number - 1 }, (_, i) => ({ number: i + 1, levels: [10] })) });
  if (!placed.ok) throw new Error(placed.reason);
  const plan = workbookCapacityPlan(curriculum, placed.plan);
  return { workbookId: "00000000-0000-4000-8000-000000000728", childId: "00000000-0000-4000-8000-000000000001",
    number, profileBuild: null, curriculum, itemPolicy: "approved-v1", book: { child: "Alex" },
    plan: { ...plan, days: plan.days.filter(d => d.day === 1) } };
}

it.each([2, 3])("spreads the complete U10 book %i fallback grid and checks it again", async number => {
  const measured: DraftPage[] = [];
  const fit: FitCheck = { fits: async page => {
    if (page.type !== "remember-these-mixed-set") return { ok: true };
    measured.push(structuredClone(page));
    return page.content?.kind === "day" && (page.content.extraGap ?? 0) >= 4 ? { ok: true } : fullness;
  } };
  const plan = await prepareWorkbookCapacity(input(number), fit);
  const page = plan.days[0].pages.find(p => p.type === "remember-these-mixed-set")!;
  expect(page).toMatchObject({ capacityChecked: true, fillingComplete: true, extraGap: 4 });
  const retry = measured.findIndex(p => p.content?.kind === "day" && p.content.atMaximum && p.content.extraGap === 4);
  expect(retry).toBeGreaterThan(0);
  const spread = measured[retry];
  expect(pagePlan(spread)?.incomplete).toEqual([]);
  expect(spread.questions).toEqual(measured[retry - 1].questions);
  expect(measured[0].content).toMatchObject({ fillingComplete: true, atMaximum: true, extraGap: 0 });
  expect(spread.content).toMatchObject({ fillingComplete: true, atMaximum: true, extraGap: 4 });
});

it("keeps already fitting U10 grids at zero extra gap", async () => {
  const plan = await prepareWorkbookCapacity(input(2), { fits: async () => ({ ok: true }) });
  expect(plan.days[0].pages.every(p => (p.extraGap ?? 0) === 0)).toBe(true);
});

it("keeps unapproved Challenge slots missing when the fallback checks its grid", async () => {
  const source = input(2);
  const prepared = await prepareWorkbookCapacity(source, { fits: async () => ({ ok: true }) });
  const challenge = prepared.days[0].pages.find(p => p.type === "challenge")!;
  // Keep this failure control independent of the curriculum's available Challenge templates.
  challenge.itemContracts = { ...challenge.itemContracts, "1.2": null, "1.3": null };
  challenge.capacityChecked = false;
  const measured: DraftPage[] = [];
  const plan = await prepareWorkbookCapacity({ ...source, plan: prepared }, { fits: async page => {
    if (page.type !== "challenge") return { ok: true };
    measured.push(structuredClone(page));
    return page.content?.kind === "day" && (page.content.extraGap ?? 0) >= 4 ? { ok: true } : fullness;
  } });
  expect(measured.length).toBeGreaterThan(1);
  expect(measured.every(p => p.questions.length === measured[0].questions.length)).toBe(true);
  const page = plan.days[0].pages.find(p => p.type === "challenge")!;
  const missing = Object.values(page.itemContracts!).filter(c => c === null).length;
  expect(missing).toBeGreaterThan(0);
  const last = measured.at(-1)!;
  expect(last.content?.kind === "day" ? last.content.blocks.flatMap(b => b.missing ?? []) : []).toHaveLength(missing);
});

it("refuses a complete fallback grid when all permitted gaps still fail fullness", async () => {
  const gaps: number[] = [];
  await expect(prepareWorkbookCapacity(input(2), { fits: async page => {
    if (page.type !== "remember-these-mixed-set") return { ok: true };
    if (page.content?.kind === "day") gaps.push(page.content.extraGap ?? 0);
    return fullness;
  } })).rejects.toThrow("its last complete grid does not fit");
  expect(Math.max(...gaps)).toBe(48);
  expect(gaps.every(gap => gap >= 0 && gap <= 48)).toBe(true);
});

it("refuses a fallback grid when spreading its gaps causes overflow", async () => {
  const gaps: number[] = [];
  await expect(prepareWorkbookCapacity(input(2), { fits: async page => {
    if (page.type !== "remember-these-mixed-set") return { ok: true };
    const gap = page.content?.kind === "day" ? page.content.extraGap ?? 0 : 0;
    gaps.push(gap);
    return gap === 0 ? fullness : { ok: false, problems: [{ question: null, reason: "The content exceeds the page height." }] };
  } })).rejects.toThrow("The content exceeds the page height.");
  expect(Math.max(...gaps)).toBe(4);
});
