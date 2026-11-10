import { describe, expect, it } from "vitest";
import { curriculumFor } from "./workbook-curriculum";
import { fakeAiClient } from "./ai-client-fake";
import { fakeWorkbookItems } from "./workbook-ai-fake";
import { generateWorkbook, prepareWorkbookCapacity, workbookCapacityPlan, type FitCheck } from "./workbook-generator";
import { planNextWorkbook } from "./workbook-placement";
import { keySolver } from "./workbook-solve-check";

// #811 (Kai's U10 book 2, run 31757327): a worked example printed its question twice ("Is 240 close to 30 or to 300?"
// over "Is 240 close to 30 or 300?"), and page 77's worked example repeated page 64's, which failed the whole-book check
// instead of the generator choosing another example.

const PANELS = new Set(["worked-example", "watch-one", "reminder"]);

/** A question's words, for comparing two wordings of one question: no "to", brackets, case or spaces. */
const asked = (line: string) => line.toLowerCase().replace(/[[\]]/g, "").replace(/\bto\b/g, "").replace(/[^a-z0-9?]+/g, "");

/** The fake writer, but every worked example it builds itself is the first one it built (Kai's book: page 77's repeated page 64's). */
function sameExample() {
  let repeated: Record<string, unknown> | null = null;
  return (r: Parameters<typeof fakeWorkbookItems>[0]) => {
    const out = fakeWorkbookItems(r) as { items: Record<string, unknown>[] };
    const request = JSON.parse((r.content[0] as { text: string }).text) as { examples?: { slot: string; contract?: unknown }[] };
    const own = new Set((request.examples ?? []).filter((e) => !e.contract).map((e) => e.slot));
    repeated ??= out.items.find((i) => own.has(String(i.slot))) ?? null;
    return { ...out, items: out.items.map((i) => (own.has(String(i.slot)) && repeated ? { ...repeated, slot: i.slot } : i)) };
  };
}

async function book(number: number, answer: (r: Parameters<typeof fakeWorkbookItems>[0]) => unknown = fakeWorkbookItems, compact = false) {
  const curriculum = curriculumFor("bc")!;
  const placed = planNextWorkbook({ curriculum, grade: 3, profile: null, number,
    workbooks: Array.from({ length: number - 1 }, (_, i) => ({ number: i + 1, levels: [10] })) });
  if (!placed.ok) throw new Error(placed.reason);
  const fit: FitCheck = { fits: async () => ({ ok: true }) };
  const base = { workbookId: "00000000-0000-4000-8000-000000000811", childId: "00000000-0000-4000-8000-000000000001", number, profileBuild: null, curriculum, itemPolicy: "approved-v1" as const, book: { child: "Kai" } };
  const plan = await prepareWorkbookCapacity({ ...base, plan: workbookCapacityPlan(curriculum, placed.plan) }, fit);
  if (compact) for (const day of plan.days) for (const page of day.pages) page.compactPanel = true;
  let token = 1;
  const generated = await generateWorkbook({ ...base, plan }, {
    ai: fakeAiClient({ answer }), solver: keySolver(), fit, qrToken: () => `token-${String(++token).padStart(12, "0")}`,
    store: { save: async (draft) => ({ status: "saved", draftId: draft.id }), draft: async () => null },
  });
  if (generated.status !== "stored") throw new Error(`not stored: ${generated.status}`);
  return generated.draft;
}

describe.each([2, 3])("U10 book %i (#811)", (number) => {
  it("prints no worked example's question twice", async () => {
    const draft = await book(number);
    const twice = draft.pages.flatMap((p) => p.content?.kind !== "day" ? [] : p.content.blocks.flatMap((b) => {
      if (!PANELS.has(b.slot)) return [];
      const lines = ((b as { lines?: string[] }).lines ?? []).filter((l) => l.trim().endsWith("?")).map(asked);
      return lines.length !== new Set(lines).size ? [{ page: p.number, lines: (b as { lines?: string[] }).lines }] : [];
    }));
    expect(twice).toEqual([]);
  }, 120_000);

  it("chooses another worked example instead of repeating one from an earlier page", async () => {
    const draft = await book(number, sameExample());
    expect((draft.quality?.issues ?? []).filter((i) => /worked example repeats/.test(i.reason))).toEqual([]);
  }, 120_000);
});

it("prints the replacement example after a repeated Watch one panel becomes a compact reminder", async () => {
  const draft = await book(3, sameExample(), true);
  const checked: number[] = [], mismatches: number[] = [];
  for (const page of draft.pages) {
    const op = page.panelExamples?.[0]?.operation;
    const sign = op?.kind === "add" ? "+" : op?.kind === "subtract" ? "−" : op?.kind === "multiply" ? "×" : null;
    const reminder = page.content?.kind === "day" ? page.content.blocks.find(b => b.slot === "reminder") : null;
    if (!op || !sign || !reminder || typeof op.operands[0] !== "number" || typeof op.operands[1] !== "number") continue;
    checked.push(page.number);
    const printed = (reminder.lines ?? []).join(" ").replace(/[\s[\]]/g, "");
    if (!printed.includes(`${op.operands[0]}${sign}${op.operands[1]}`)) mismatches.push(page.number);
  }
  expect(checked.length).toBeGreaterThan(0);
  expect(mismatches).toEqual([]);
}, 120_000);
