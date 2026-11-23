import { expect, it } from "vitest";
import { curriculumFor } from "./workbook-curriculum";
import { fakeAiClient } from "./ai-client-fake";
import { fakeWorkbookItems } from "./workbook-ai-fake";
import { generateWorkbook, prepareWorkbookCapacity, workbookCapacityPlan, type FitCheck } from "./workbook-generator";
import type { DraftPage } from "./workbook-render";
import { planNextWorkbook } from "./workbook-placement";
import { keySolver } from "./workbook-solve-check";

// #746: planning measured a worked example the AI writer builds itself (no code contract) with no example at all, so
// the writer's longer example (the #744 review: U10 book 3, p80 printed 4 method lines in a room measured for 2)
// overflowed its page at the final fit check. Planning must measure such a panel at least as tall as it prints.

const PANELS = new Set(["worked-example", "watch-one", "reminder"]);
const PLANNING_TOKEN = "token-000000000001";

/** Each panel block's printed lines (its lines and every method's lines), by block index. */
function panelLines(page: Pick<DraftPage, "content">): Map<number, number> {
  const out = new Map<number, number>();
  if (page.content?.kind !== "day") return out;
  page.content.blocks.forEach((b, i) => {
    if (!PANELS.has(b.slot)) return;
    const methods = (b as { methods?: { lines: string[] }[] }).methods ?? [];
    const lines = (b as { lines?: string[] }).lines ?? [];
    out.set(i, lines.length + methods.reduce((n, m) => n + m.lines.length, 0));
  });
  return out;
}

it.each([2, 3])("U10 book %i: no writer-built worked example prints taller than planning measured it", async (number) => {
  const curriculum = curriculumFor("bc")!;
  const placed = planNextWorkbook({ curriculum, grade: 3, profile: null, number,
    workbooks: Array.from({ length: number - 1 }, (_, i) => ({ number: i + 1, levels: [10] })) });
  if (!placed.ok) throw new Error(placed.reason);
  const measured = new Map<number, Map<number, number>>();
  const fit: FitCheck = { fits: async (page) => {
    // Planning measures its pages with the fixed budget token; the written page has its own.
    if (page.qrToken === PLANNING_TOKEN) {
      const seen = measured.get(page.number) ?? new Map<number, number>();
      for (const [i, n] of panelLines(page)) seen.set(i, Math.max(seen.get(i) ?? 0, n));
      measured.set(page.number, seen);
    }
    return { ok: true };
  } };
  const workbookId = "00000000-0000-4000-8000-000000000746";
  const base = { workbookId, childId: "00000000-0000-4000-8000-000000000001", number, profileBuild: null, curriculum, itemPolicy: "approved-v1" as const, book: { child: "Alex" } };
  const plan = await prepareWorkbookCapacity({ ...base, plan: workbookCapacityPlan(curriculum, placed.plan) }, fit);
  let token = 1;
  const generated = await generateWorkbook({ ...base, plan }, {
    ai: fakeAiClient({ answer: fakeWorkbookItems }), solver: keySolver(), fit,
    qrToken: () => `token-${String(++token).padStart(12, "0")}`,
    store: { save: async (draft) => ({ status: "saved", draftId: draft.id }), draft: async () => null },
  });
  expect(generated.status).toBe("stored");
  if (generated.status !== "stored") return;
  const taller = generated.draft.pages.flatMap((p) => [...panelLines(p)].flatMap(([i, printed]) => {
    const planned = measured.get(p.number)?.get(i);
    // (A panel planning never measured fails too: its room was never kept.)
    return planned === undefined || printed > planned ? [{ page: p.number, block: i, printed, planned: planned ?? null }] : [];
  }));
  expect(taller).toEqual([]);
}, 120_000);

it.each(["fits", "fullness", "overflow"] as const)("rechecks a shorter writer-built example beside code questions, retaining %s", async outcome => {
  const curriculum = curriculumFor("bc")!;
  const placed = planNextWorkbook({ curriculum, grade: 3, profile: null, number: 1, workbooks: [] });
  if (!placed.ok) throw new Error(placed.reason);
  const base = { workbookId: "17fc5da1-2442-488a-a450-611a471e73e6", childId: "00000000-0000-4000-8000-000000000001",
    number: 1, profileBuild: null, curriculum, itemPolicy: "approved-v1" as const, book: { child: "Alex" } };
  const source = workbookCapacityPlan(curriculum, placed.plan);
  const finalChecks: DraftPage[] = [];
  const fit: FitCheck = { fits: async page => {
    if (page.qrToken === PLANNING_TOKEN || page.content?.kind !== "day" || page.content.day !== 8 || page.content.page !== 3 || page.type !== "practice") return { ok: true };
    finalChecks.push(structuredClone(page));
    const gap = page.content.extraGap ?? 0;
    if (gap >= 4 && outcome === "fits") return { ok: true };
    if (gap >= 4 && outcome === "overflow") return { ok: false, problems: [{ question: null, reason: "The content exceeds the page height." }] };
    return { ok: false, problems: [{ question: null, kind: "fullness", reason: "The shorter example leaves room at the bottom." }] };
  } };
  const plan = await prepareWorkbookCapacity({ ...base, plan: { ...source, days: source.days.filter(d => d.day === 8) } }, fit);
  let token = 1;
  const generated = await generateWorkbook({ ...base, plan }, { fit, ai: fakeAiClient({ answer: fakeWorkbookItems }), solver: keySolver(),
    qrToken: () => `token-${String(++token).padStart(12, "0")}`,
    store: { save: async draft => ({ status: "saved", draftId: draft.id }), draft: async () => null } });
  expect(generated.status).toBe("stored");
  if (generated.status !== "stored") return;
  const page = generated.draft.pages.find(p => p.day === 8 && p.type === "practice")!;
  // #1248: room left is a warning on the page; overflow still fails.
  expect(page.fit.status).toBe(outcome === "overflow" ? "failed" : "fits");
  if (outcome === "fullness") expect(page.fit).toMatchObject({ warnings: [{ kind: "fullness" }] });
  expect(finalChecks.length).toBeGreaterThan(1);
  expect(finalChecks.at(-1)?.content).toMatchObject({ fillingComplete: true, extraGap: outcome === "fullness" ? 48 : 4 });
  expect(finalChecks.at(-1)?.questions).toEqual(finalChecks[0].questions);
  expect(page.leftOut ?? []).toEqual([]);
});
