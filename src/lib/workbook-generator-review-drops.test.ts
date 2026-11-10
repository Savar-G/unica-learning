import { expect, it } from "vitest";
import { curriculumFor } from "./workbook-curriculum";
import { prepareWorkbookCapacity, workbookCapacityPlan, type FitCheck } from "./workbook-generator";
import { planNextWorkbook } from "./workbook-placement";

// #759: a page with no room for its rows' gap holds one review question fewer, never one of its own step (the U16 fake
// sample's page 54 gave up two "Find the pattern rule" questions and kept its review). A fit check that refuses a
// Practice 2 page above 6 questions forces the drops.
// Known failure, kept as a record for the capacity fix (#759): the drops today go to own-step questions. Remove `.fails`
// when a squeezed page keeps every own-step question.
it.fails("a Practice 2 page that must give up questions keeps every question on its own step", async () => {
  const curriculum = curriculumFor("bc")!;
  const placed = planNextWorkbook({ curriculum, grade: 5, profile: null, number: 1, workbooks: [] });
  if (!placed.ok) throw new Error(placed.reason);
  expect(placed.plan.level).toBe(16);
  const base = { workbookId: "00000000-0000-4000-8000-000000000759", childId: "00000000-0000-4000-8000-000000000001", number: 1, profileBuild: null, curriculum, itemPolicy: "approved-v1" as const, book: { child: "Theo" } };
  const roomy: FitCheck = { fits: async () => ({ ok: true }) };
  type Plan = Awaited<ReturnType<typeof prepareWorkbookCapacity>>;
  const practice2 = (plan: Plan) => plan.days.flatMap((d) => d.pages.filter((p) => p.type === "practice-2").map((p) => ({ day: d.day, p })));
  const own = (plan: Plan) => new Map(practice2(plan).map(({ day, p }) => {
    const steps = new Set(p.parts.flatMap((x) => (x.step ? [`${x.step.skill}#${x.step.step}`] : [])));
    const count = Object.values(p.itemContracts ?? {}).filter((c) => c?.template && steps.has(`${c.template.skill}#${c.template.step}`)).length;
    return [`day ${day} page ${p.number}`, count] as const;
  }));
  const roomyPlan = await prepareWorkbookCapacity({ ...base, plan: workbookCapacityPlan(curriculum, placed.plan) }, roomy);
  // (Each Practice 2 page with a question to spare above its floor of 8 is one question too full.)
  // (Each Practice 2 page beside Solve it two ways (page 22 and 54) that prints a review question is one question too full: it has a review question to give.)
  const reviewOf = (p: Plan["days"][number]["pages"][number]) => {
    const steps = new Set(p.parts.flatMap((x) => (x.step ? [`${x.step.skill}#${x.step.step}`] : [])));
    return Object.values(p.itemContracts ?? {}).some((c) => c?.template && !steps.has(`${c.template.skill}#${c.template.step}`));
  };
  const held = new Map(practice2(roomyPlan).filter(({ p }) => reviewOf(p) && (p.capacity ?? []).some((s) => s.slot === "solve-it-two-ways") && (p.capacity ?? []).some((s) => s.slot === "practice-row")).map(({ day, p }) => [`${day}:${p.number}`, Object.keys(p.itemContracts ?? {}).length] as const));
  expect(held.size).toBeGreaterThan(0);
  const tight: FitCheck = { fits: async (page) => {
    const n = page.type === "practice-2" && page.content?.kind === "day" ? held.get(`${page.content.day}:${page.content.page}`) : undefined;
    return n !== undefined && page.questions.length >= n ? { ok: false, problems: [{ question: null, reason: "the content does not fit its space" }] } : { ok: true };
  } };
  const before = own(roomyPlan);
  const after = own(await prepareWorkbookCapacity({ ...base, plan: workbookCapacityPlan(curriculum, placed.plan) }, tight));
  const lost = [...before].flatMap(([page, n]) => ((after.get(page) ?? 0) < n ? [`${page}: ${n} own-step questions, then ${after.get(page)}`] : []));
  expect(lost).toEqual([]);
}, 120_000);
