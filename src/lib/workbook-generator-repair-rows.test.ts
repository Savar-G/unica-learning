import { expect, it } from "vitest";
import { curriculumFor } from "./workbook-curriculum";
import { prepareWorkbookCapacity, workbookCapacityPlan, type FitCheck } from "./workbook-generator";
import { planNextWorkbook } from "./workbook-placement";
import { pagePlan } from "./workbook-template";
import { questionWorkSpace } from "./workbook-work-space";
import { firstCustomerProfile } from "./workbook-sample-profiles";

it("closes odd practice groups even when their extra rows overflow", async () => {
  const curriculum = curriculumFor("bc")!;
  const placed = planNextWorkbook({ curriculum, grade: 8, profile: firstCustomerProfile(), workbooks: [], number: 1,
    instructions: { version: 1, startLevel: "U19", teachMore: ["6.4", "6.13"], teachLess: [], addReview: ["5.2", "5.7", "5.15"], difficulty: null } });
  if (!placed.ok) throw new Error(placed.reason);
  const broken = new Set<number>(), repaired = new Set<number>();
  const plan = await prepareWorkbookCapacity({ workbookId: "704684c5-7d3c-46c1-b55b-e13a4ba1b8c4",
    childId: "00000000-0000-4000-8000-000000000001", number: 1, profileBuild: null, curriculum,
    plan: workbookCapacityPlan(curriculum, placed.plan), itemPolicy: "approved-v1", book: { child: "Alex" } }, {
    fits: async page => {
      const holes = pagePlan(page)?.incomplete?.length ?? 0;
      if (page.type === "practice" && holes >= 2) {
        broken.add(page.number);
        return { ok: false, problems: [{ question: null, reason: "the odd groups add rows beyond the content area" }] };
      }
      const fits = page.questions.length <= (page.type === "warm-up" ? 12 : 10);
      if (fits && !holes && broken.has(page.number)) repaired.add(page.number);
      return fits ? { ok: true } : { ok: false, problems: [{ question: null, reason: "test page capacity" }] };
    },
  });
  expect(broken.size).toBeGreaterThan(0);
  expect(repaired.size).toBeGreaterThan(0);
  expect(plan.days).toHaveLength(10);
  for (const day of plan.days) for (const page of day.pages) expect(page.capacityChecked).toBe(true);
}, 60_000);

// U10 book 3, Day 7 page 4 (#728): eight practice rows overflowed while an own-step question needed its 64 px
// calculation space. Shortening took an earlier step's question, which left an empty cell in the own-step rows, and every
// own-step question that closed it was a tall one again, until capacity ran out of rounds. Synthetic data only.
it("closes a practice page's rows by dropping once own-step repairs keep overflowing", async () => {
  const curriculum = curriculumFor("bc")!;
  const placed = planNextWorkbook({ curriculum, grade: 3, profile: null, number: 3,
    workbooks: [{ number: 1, levels: [10] }, { number: 2, levels: [10] }] });
  if (!placed.ok) throw new Error(placed.reason);
  const full = workbookCapacityPlan(curriculum, placed.plan);
  const plan = { ...full, days: full.days.filter(d => d.day === 7) };
  const seen: { rows: number; holes: number; over: boolean }[] = [];
  const fit: FitCheck = { fits: async page => {
    if (page.type !== "practice-2" || page.content?.kind !== "day") return { ok: true };
    const rows = page.content.blocks.find(b => b.items.length >= 6)?.items ?? [];
    const tall = page.questions.filter(q => rows.includes(q.number) && questionWorkSpace(q.package) >= 64).length;
    // (Eight rows fit only with no tall calculation space.)
    const over = rows.length >= 8 && tall >= 1;
    seen.push({ rows: rows.length, holes: pagePlan(page)?.incomplete?.length ?? 0, over });
    return over ? { ok: false, problems: [{ question: null, reason: "the content does not fit its space" }] } : { ok: true };
  } };
  const prepared = await prepareWorkbookCapacity({ workbookId: "00000000-0000-4000-8000-000000000728",
    childId: "00000000-0000-4000-8000-000000000001", number: 3, profileBuild: null, curriculum, plan,
    itemPolicy: "approved-v1", book: { child: "Alex" } }, fit);
  expect(seen.some(m => m.over)).toBe(true);
  const page = prepared.days[0].pages.find(p => p.type === "practice-2")!;
  expect(page.capacityChecked).toBe(true);
  expect(Object.values(page.itemContracts ?? {}).every(c => c !== null)).toBe(true);
  // Its last measurement is the page as planned: complete rows that fit.
  expect(seen.at(-1)).toMatchObject({ holes: 0, over: false });
}, 60_000);
