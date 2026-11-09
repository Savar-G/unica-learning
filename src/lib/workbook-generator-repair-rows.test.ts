import { expect, it } from "vitest";
import { curriculumFor } from "./workbook-curriculum";
import { prepareWorkbookCapacity, workbookCapacityPlan, type FitCheck } from "./workbook-generator";
import { planNextWorkbook } from "./workbook-placement";
import { pagePlan } from "./workbook-template";
import { questionWorkSpace } from "./workbook-work-space";

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
