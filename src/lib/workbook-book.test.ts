import { describe, expect, it } from "vitest";
import type { AiJsonRequest } from "@/lib/ai-client";
import { fakeAiClient } from "@/lib/ai-client-fake";
import { fakePrintEngine } from "@/lib/print-engine-fake";
import type { Operation } from "@/lib/question-package";
import { pageFigure } from "@/lib/workbook-book";
import { curriculumFor } from "@/lib/workbook-curriculum";
import { memoryDraftStore } from "@/lib/workbook-draft-memory";
import { renderableDraft } from "@/lib/workbook-fit";
import { generateWorkbook, type FitCheck, type GeneratedWorkbook } from "@/lib/workbook-generator";
import type { DraftPage } from "@/lib/workbook-render";
import { reviewPrint } from "@/lib/workbook-render";
import { planWorkbook } from "@/lib/workbook-plan";
import { sampleChild, samplePlanInput } from "@/lib/workbook-sample-profiles";
import { slotMax, workbookTemplate } from "@/lib/workbook-template";

// The generated book laid out for the real templates (#363): the generator through its public interface with
// GenerateInput.book, the fake AI client, a fit check that records each page it is given, and the in-memory store;
// the sample profiles (src/lib/workbook-sample-profiles.ts) give the plans; pageFigure maps item pictures.

const BC = curriculumFor("bc")!;
const WORKBOOK = "00000000-0000-4000-8000-0000000003a1";
const CHILD = "00000000-0000-4000-8000-0000000003c1";
const PARENT = "00000000-0000-4000-8000-0000000003f1";

const num = (value: number) => ({
  type: "number", value, numerator: null, denominator: null, whole: null, unit: null, hours: null, minutes: null, period: null, parts: [], text: null,
});
const addOp = (a: number, b: number) => ({ kind: "add", operands: [num(a), num(b)], expression: null, unit: null, denominator: null, values: [] });
interface Asked { slot: string; skills: string[]; place?: string; formats?: string[] | null }
const read = (r: AiJsonRequest) => JSON.parse((r.content[0] as { text: string }).text) as { slots: Asked[] };

/** An item in the first format the slot's place takes (written-reason has no operation). */
function item(s: Asked, format = s.formats?.[0] ?? "write-number") {
  const reason = format === "written-reason";
  return {
    slot: s.slot, skill: s.skills[0], difficulty: 2, text: reason ? "How do you know?" : "268 + 157 = ?", format,
    operation: reason ? null : addOp(268, 157),
    wrongAnswers: reason ? [] : [{ value: num(315), cause: "O3", description: "Forgets to carry.", step: "tens" }],
    easier: reason ? null : { text: "48 + 37 = ?", operation: addOp(48, 37) },
    shownWrong: format === "spot-the-error" ? 0 : null,
    figure: null, numbers: [], places: null, direction: null, sequence: null, pattern: null,
  };
}

async function generate(level: string, kind: "first" | "second" | "test", answer = (s: Asked) => item(s)) {
  const child = sampleChild(BC, level)!;
  const planned = planWorkbook(samplePlanInput(BC, child, kind));
  if (!planned.ok) throw new Error(planned.reason);
  const checked: DraftPage[] = [];
  const fit: FitCheck = { fits: async (page) => { checked.push(page); return { ok: true }; } };
  let n = 0;
  const result = await generateWorkbook(
    { workbookId: WORKBOOK, childId: CHILD, number: kind === "first" ? 1 : 2, profileBuild: null, plan: planned.plan, curriculum: BC, book: { child: child.name } },
    {
      ai: fakeAiClient({ answer: (r) => ({ items: read(r).slots.map(answer) }) }), fit, store: memoryDraftStore({ [CHILD]: PARENT }),
      qrToken: () => `token-${String(++n).padStart(12, "0")}`, concurrency: 4,
    },
  );
  if (result.status !== "stored") throw new Error(result.status === "refused" ? result.reason : "paused");
  return { draft: result.draft, checked, plan: planned.plan };
}

const dayPages = (d: GeneratedWorkbook) => d.pages.filter((p) => p.day !== null);

describe("a book laid out for the templates", () => {
  it("gives every page content, in book order, with the child's name in each page ID", async () => {
    const { draft } = await generate("U12", "first");
    expect(draft.pages.every((p) => p.content)).toBe(true);
    expect(draft.pages.map((p) => p.content!.kind).slice(0, 2)).toEqual(["cover", "how-plan"]);
    expect(draft.pages.filter((p) => p.type === "back-cover")).toHaveLength(1);
    expect(draft.pages.length % 4).toBe(0);
    for (const p of dayPages(draft)) {
      expect(p.content!.kind).toBe("day");
      expect(p.content!.id).toMatch(/^UL·[A-Z]+·W01·D\d\d·P\d$/);
    }
  });

  it("names every question with a package in exactly one slot, never more than the slot takes", async () => {
    const { draft } = await generate("U12", "first");
    for (const p of dayPages(draft)) {
      const c = p.content!;
      if (c.kind !== "day") throw new Error("not a day page");
      const named = c.blocks.flatMap((b) => b.items);
      expect(named.sort((a, b) => a - b)).toEqual(p.questions.filter((q) => q.package).map((q) => q.number));
      for (const b of c.blocks) expect(b.items.length).toBeLessThanOrEqual(slotMax(b.slot, c));
      for (const q of p.questions) expect(c.blocks.find((b) => b.items.includes(q.number))?.slot).toBe(q.place);
    }
  });

  it("gives the fit check each page with its content", async () => {
    const { draft, checked } = await generate("U5", "first");
    expect(checked.length).toBe(dayPages(draft).filter((p) => p.questions.length > 0).length);
    expect(checked.every((p) => p.content?.kind === "day")).toBe(true);
  });

  it("writes the worked example from code, with the answer code computed", async () => {
    const { draft } = await generate("U12", "first");
    const blocks = dayPages(draft).flatMap((p) => (p.content!.kind === "day" ? p.content!.blocks : []));
    const worked = blocks.find((b) => b.slot === "worked-example")!;
    expect(worked.items).toEqual([]);
    expect(worked.label).toBe("48 + 37");
    expect(worked.methods![0].lines.at(-1)).toBe("48 + 37 = [85]");
  });

  it("fails a question whose place takes another format, and keeps it marked", async () => {
    const { draft } = await generate("U12", "first", (s) => item(s, s.place === "mixed-set" ? "write-number" : undefined));
    const mixed = draft.pages.flatMap((p) => p.questions).filter((q) => q.place === "mixed-set");
    expect(mixed.length).toBeGreaterThan(0);
    expect(mixed.every((q) => q.check.status === "failed" && q.check.reason.includes("tick-and-number"))).toBe(true);
  });

  it("puts last time's weak skills in Fix it on the second workbook", async () => {
    const child = sampleChild(BC, "U12")!;
    const { draft } = await generate("U12", "second");
    const fix = draft.pages.flatMap((p) => p.questions).filter((q) => q.place === "fix-it");
    expect(fix.length).toBeGreaterThan(0);
    expect(fix.every((q) => child.weakSkills.includes(q.package!.skill.skills[0]))).toBe(true);
  });

  it("makes the test workbook's level test on Day 7", async () => {
    const { draft } = await generate("U12", "test");
    expect(draft.pages.filter((p) => p.type === "level-test").every((p) => p.day === 7)).toBe(true);
    expect(draft.pages.some((p) => p.type === "level-test")).toBe(true);
  });

  it("prints the whole book for review, a failing page included", async () => {
    const { draft } = await generate("U5", "first");
    const page = dayPages(draft).find((p) => p.questions.length > 0)!;
    const out = await reviewPrint({
      draft: renderableDraft(draft), template: workbookTemplate(), engine: fakePrintEngine(),
      problems: [{ page: page.number, question: 1, reason: "question 1 runs past the content area" }],
    });
    expect(out.images).toHaveLength(draft.pages.length);
    expect(out.pdf.length).toBeGreaterThan(0);
  });
});

describe("sample profiles", () => {
  it.each(BC.levels.map((l) => l.id))("plans all three books for %s", (level) => {
    const child = sampleChild(BC, level)!;
    expect(child.mainUnit).toBeTruthy();
    for (const kind of ["first", "second", "test"] as const) {
      const r = planWorkbook(samplePlanInput(BC, child, kind));
      expect(r.ok ? "ok" : r.reason).toBe("ok");
    }
  });
});

describe("pageFigure", () => {
  it("maps each item picture to the template's", () => {
    const add: Operation = { kind: "add", operands: [3, 4] };
    expect(pageFigure({ kind: "dots", groups: [3, 4], takenAway: 1 }, add)).toEqual({ kind: "dots", groups: [3, 4], takenAway: 1 });
    expect(pageFigure({ kind: "ten-frame", counters: [6, 3] }, null)).toEqual({ kind: "ten-frame", filled: 9 });
    expect(pageFigure({ kind: "number-line", from: 0, to: 10, step: 1 }, add)).toEqual({ kind: "number-line", from: 0, to: 10, step: 1, hops: [[3, 7]] });
    expect(pageFigure({ kind: "number-line", from: 0, to: 10, step: 1 }, { kind: "subtract", operands: [9, 4] })).toMatchObject({ hops: [[9, 5]] });
    expect(pageFigure({ kind: "base-ten", hundreds: 1, tens: 2, ones: 3 }, null)).toEqual({ kind: "blocks", hundreds: 1, tens: 2, ones: 3 });
    expect(pageFigure({ kind: "pattern", core: ["circle", "star"], length: 6, blank: 5 }, null)).toEqual({ kind: "pattern", core: ["circle", "star"], length: 6, blank: 5 });
    expect(pageFigure(null, add)).toBeNull();
  });

  it("leaves out a hop off the line", () => {
    expect(pageFigure({ kind: "number-line", from: 0, to: 10, step: 1 }, { kind: "add", operands: [8, 5] })).toMatchObject({ hops: [] });
  });
});
