import { expect, it } from "vitest";
import { BC_CURRICULUM } from "./workbook-curriculum/bc";
import { HOUSE_TEMPLATES, withHouseTemplates } from "./workbook-curriculum/house-templates";
import { curriculumFor, curriculumFromData, type Curriculum } from "./workbook-curriculum";
import { prepareWorkbookCapacity, workbookCapacityPlan } from "./workbook-generator";
import { planNextWorkbook } from "./workbook-placement";

// #744 review: Unica's Challenge-only templates are the Challenge's cards. They must not make a step a story step for a
// word-problems page or a Solve it two ways step: the steps those slots take are the same without them. (Unica's
// story and practice house templates stay: they are meant for those pages.) Synthetic sample data only.
const withoutChallengeOnly = curriculumFromData(withHouseTemplates(BC_CURRICULUM,
  HOUSE_TEMPLATES.map(h => (h.stories ? h : { ...h, templates: [] }))));

const ROUTED = new Set(["word-problems", "solve-it-two-ways"]);

async function routedSteps(curriculum: Curriculum, plan: Parameters<typeof workbookCapacityPlan>[1], number: number): Promise<string[]> {
  const prepared = await prepareWorkbookCapacity({ workbookId: "00000000-0000-4000-8000-000000000744",
    childId: "00000000-0000-4000-8000-000000000001", number, profileBuild: null, curriculum,
    plan: workbookCapacityPlan(curriculum, plan), itemPolicy: "approved-v1", book: { child: "Alex" } }, { fits: async () => ({ ok: true }) });
  const out: string[] = [];
  for (const day of prepared.days) for (const page of day.pages) {
    // Slot ids are "<part + 1>.<n>", numbered through the part's slots in order.
    const next = new Map<number, number>();
    for (const group of page.capacity ?? []) {
      const first = next.get(group.part) ?? 1;
      next.set(group.part, first + group.items);
      if (!ROUTED.has(group.slot)) continue;
      for (let n = first; n < first + group.items; n++) {
        const t = page.itemContracts?.[`${group.part + 1}.${n}`]?.template;
        out.push(`day ${day.day} page ${page.number} ${group.slot} ${n}: ${t ? `${t.skill}#${t.step}` : "none"}`);
      }
    }
  }
  return out;
}

it.each([
  ["U10 book 1 without assessment results", () => {
    const curriculum = curriculumFor("bc")!;
    const placed = planNextWorkbook({ curriculum, grade: 3, profile: null, number: 1, workbooks: [] });
    if (!placed.ok) throw new Error(placed.reason);
    return { plan: placed.plan, number: 1 };
  }],
] as const)("Challenge-only templates do not change the story or Solve it two ways steps of %s", async (_label, make) => {
  const { plan, number } = make();
  const withHouse = await routedSteps(curriculumFor("bc")!, plan, number);
  expect(withHouse.length).toBeGreaterThan(0);
  expect(withHouse).toEqual(await routedSteps(withoutChallengeOnly, plan, number));
}, 180_000);

it("only the Grade 5 Challenge-only set from before #744 still chooses a page's step", () => {
  const routed = HOUSE_TEMPLATES.filter(h => !h.stories && h.routes).map(h => `${h.skill}#${h.step}`);
  expect(routed).toEqual(["5.1-place-value-million#1", "5.1-place-value-million#2", "5.1-place-value-million#3",
    "5.9-multiply-tens#1", "5.9-multiply-tens#2", "5.9-multiply-tens#3", "5.9-distributive#1", "5.9-distributive#2",
    "5.10-pattern-rule#1"]);
});
