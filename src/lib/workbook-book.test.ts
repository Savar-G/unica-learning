import { describe, expect, it } from "vitest";
import type { AiJsonRequest } from "@/lib/ai-client";
import { fakeAiClient } from "@/lib/ai-client-fake";
import { fakePrintEngine } from "@/lib/print-engine-fake";
import type { Operation } from "@/lib/question-package";
import { levelMistakes, pageFigure, samProblem, samWork } from "@/lib/workbook-book";
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

async function generate(level: string, kind: "first" | "second" | "test", answer: (s: Asked) => unknown = (s) => item(s)) {
  const child = sampleChild(BC, level)!;
  const planned = planWorkbook(samplePlanInput(BC, child, kind));
  if (!planned.ok) throw new Error(planned.reason);
  const checked: DraftPage[] = [];
  const fit: FitCheck = { fits: async (page) => { checked.push(page); return { ok: true }; } };
  let n = 0;
  const result = await generateWorkbook(
    { workbookId: WORKBOOK, childId: CHILD, number: kind === "first" ? 1 : 2, profileBuild: null, plan: planned.plan, curriculum: BC, book: { child: child.name } },
    {
      ai: fakeAiClient({ answer: (r) => ({ items: read(r).slots.map(answer).filter((x) => x !== undefined) }) }), fit, store: memoryDraftStore({ [CHILD]: PARENT }),
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

describe("Sam's wrong work", () => {
  const n = (value: number) => ({ type: "number" as const, value });

  it("shows a forgotten carry column by column, the mistake in the tens", () => {
    const work = samWork({ kind: "add", operands: [268, 157] }, n(315))!;
    expect(work).toMatchObject({ mistake: "forgot-carry", step: "tens", answer: 315 });
    expect(work.lines).toEqual([
      "Add the ones: 8 + 7 = 15. Write 5.",
      "Add the tens: 6 + 5 = 11. Write 1.",
      "Add the hundreds: 2 + 1 = 3. Write 3.",
      "268 + 157 = [315]",
    ]);
  });

  it("shows the smaller digit taken from the larger, the mistake in the ones", () => {
    expect(samWork({ kind: "subtract", operands: [503, 178] }, n(475))).toMatchObject({ mistake: "smaller-from-larger", step: "ones", answer: 475 });
  });

  it("shows a regroup that does not take 1 from the next column, the mistake in the tens", () => {
    const work = samWork({ kind: "subtract", operands: [62, 28] }, n(44))!;
    expect(work).toMatchObject({ mistake: "regroup-not-taken", step: "tens", answer: 44 });
    expect(work.lines[0]).toBe("Regroup 1 ten as 10 ones: 12 − 8 = 4. Write 4.");
  });

  it.each([
    ["counted one too many (on)", { kind: "add", operands: [5, 3] }, 9, "counted-one-extra", ["Start at 5. Count on 3.", "6, 7, 8, 9", "5 + 3 = [9]"]],
    ["counted one too many (back)", { kind: "subtract", operands: [9, 3] }, 5, "counted-one-extra", ["Start at 9. Count back 3.", "8, 7, 6, 5", "9 − 3 = [5]"]],
    ["counted one too few", { kind: "add", operands: [5, 3] }, 7, "counted-one-short", ["Start at 5. Count on 3.", "6, 7", "5 + 3 = [7]"]],
    ["started at the first number", { kind: "add", operands: [5, 3] }, 7, "wrong-start", ["Start at 5. Count on 3.", "5, 6, 7", "5 + 3 = [7]"]],
    ["started at the first number (back)", { kind: "subtract", operands: [9, 3] }, 7, "wrong-start", ["Start at 9. Count back 3.", "9, 8, 7", "9 − 3 = [7]"]],
  ] as const)("shows %s, the wrong line the count", (_name, op, shown, mistake, lines) => {
    const work = samWork(op as unknown as Operation, n(shown), mistake)!;
    expect(work).toMatchObject({ mistake, step: null, wrongLine: 1, answer: shown });
    expect(work.lines).toEqual(lines);
  });

  it("shows the wrong operation: the other operation's columns under the sum", () => {
    const work = samWork({ kind: "add", operands: [9, 4] }, n(5), "wrong-operation")!;
    expect(work).toMatchObject({ mistake: "wrong-operation", step: null, wrongLine: 0, answer: 5 });
    expect(work.lines).toEqual(["Subtract the ones: 9 − 4 = 5. Write 5.", "9 + 4 = [5]"]);
    expect(samWork({ kind: "subtract", operands: [9, 4] }, n(13), "wrong-operation")).toMatchObject({ answer: 13 });
  });

  it("shows swapped digits: the right columns, then the answer written the other way round", () => {
    const work = samWork({ kind: "add", operands: [7, 5] }, n(21), "swapped-digits")!;
    expect(work).toMatchObject({ mistake: "swapped-digits", step: null, answer: 21 });
    expect(work.wrongLine).toBe(work.lines.length - 1);
    expect(work.lines.at(-1)).toBe("7 + 5 = [21]");
    expect(samWork({ kind: "add", operands: [6, 5] }, n(11), "swapped-digits")).toBeNull();
    expect(samWork({ kind: "add", operands: [20, 10] }, n(3), "swapped-digits")).toBeNull();
  });

  it("refuses a named mistake that does not give the shown answer", () => {
    expect(samWork({ kind: "add", operands: [5, 3] }, n(10), "counted-one-extra")).toBeNull();
    expect(samWork({ kind: "add", operands: [5, 3] }, n(9), "wrong-start")).toBeNull();
    expect(samWork({ kind: "add", operands: [3, 9] }, n(-6), "wrong-operation")).toBeNull();
  });

  it("offers counting and answer mistakes up to U6, column mistakes from U10", () => {
    expect(levelMistakes(2)).toEqual(["counted-one-extra", "counted-one-short", "wrong-start", "wrong-operation", "swapped-digits"]);
    expect(levelMistakes(8)).toHaveLength(8);
    expect(levelMistakes(12)).not.toContain("counted-one-extra");
  });

  it("checks a package: the mistake must be the level's, and its step the mistake's", () => {
    const pkg = (op: Operation, wrong: number, cause: string, step: string | null) => ({
      operation: op, wrongAnswers: [{ value: n(wrong), cause, description: "", step }],
      item: { format: "spot-the-error", scorable: true, parentChecked: false, regions: [], checks: [], error: { answer: n(wrong), step } },
    }) as unknown as Parameters<typeof samProblem>[0];
    expect(samProblem(pkg({ kind: "add", operands: [5, 3] }, 9, "counted-one-extra", null), 2)).toBeNull();
    expect(samProblem(pkg({ kind: "add", operands: [5, 3] }, 9, "counted-one-extra", "ones"), 2)).toContain("set the wrong answer's step to null");
    expect(samProblem(pkg({ kind: "add", operands: [5, 3] }, 9, "counted-one-extra", null), 12)).toContain("cannot show Sam's steps");
    expect(samProblem(pkg({ kind: "add", operands: [268, 157] }, 315, "forgot-carry", "tens"), 12)).toBeNull();
  });

  it("never shows the right answer as Sam's, nor a wrong answer no mistake gives", () => {
    expect(samWork({ kind: "add", operands: [268, 157] }, n(425))).toBeNull();
    expect(samWork({ kind: "add", operands: [268, 157] }, n(400))).toBeNull();
    expect(samWork({ kind: "add", operands: [12, 13] }, n(25))).toBeNull();
    for (const [op, shown] of [[{ kind: "add", operands: [268, 157] }, 315], [{ kind: "subtract", operands: [52, 17] }, 45]] as const) {
      const work = samWork(op as Operation, n(shown))!;
      expect(work.lines.join(" ")).not.toContain(op.kind === "add" ? "[425]" : "[35]");
    }
  });

  it("puts the steps on the page and fails a shown wrong answer code cannot show", async () => {
    const good = await generate("U12", "first");
    const spot = dayPages(good.draft).flatMap((p) => (p.content!.kind === "day" ? p.content!.blocks : [])).find((b) => b.slot === "spot-the-error")!;
    expect(spot.lines![0]).toBe("Add the ones: 8 + 7 = 15. Write 5.");
    expect(spot.lines!.join(" ")).not.toContain("[425]");

    const bad = await generate("U12", "first", (s) => (s.place === "spot-the-error"
      ? { ...item(s), wrongAnswers: [{ value: num(400), cause: "careless", description: "A slip.", step: null }] }
      : item(s)));
    const q = bad.draft.pages.flatMap((p) => p.questions).filter((x) => x.place === "spot-the-error");
    expect(q.length).toBeGreaterThan(0);
    expect(q.every((x) => x.check.status === "failed" && x.check.reason.includes("Sam's steps"))).toBe(true);
  });
});

describe("Spot the error at the early levels", () => {
  it.each(["U2", "U5"])("offers %s only its mistakes and puts Sam's count on the page", async (level) => {
    const asked: string[][] = [];
    const { draft } = await generate(level, "first", (s) => {
      const x = s as Asked & { mistakes?: { name: string }[] };
      if (x.place !== "spot-the-error") return item(s);
      asked.push((x.mistakes ?? []).map((m) => m.name));
      return { ...item(s), text: "5 + 3 = ?", operation: addOp(5, 3), wrongAnswers: [{ value: num(9), cause: "counted-one-extra", description: "Counts one too many.", step: null }], easier: { text: "2 + 1 = ?", operation: addOp(2, 1) }, shownWrong: 0 };
    });
    expect(asked.length).toBeGreaterThan(0);
    expect(asked.every((names) => names.join() === levelMistakes(Number(level.slice(1))).join())).toBe(true);
    const spots = draft.pages.flatMap((p) => p.questions).filter((q) => q.place === "spot-the-error");
    expect(spots.every((q) => q.check.status !== "failed")).toBe(true);
    const block = dayPages(draft).flatMap((p) => (p.content!.kind === "day" ? p.content!.blocks : [])).find((b) => b.slot === "spot-the-error")!;
    expect(block.lines).toEqual(["Start at 5. Count on 3.", "6, 7, 8, 9", "5 + 3 = [9]"]);
  });
});

describe("a failed question with nothing to print", () => {
  it("shows a placeholder with its number and reason on the page", async () => {
    const { draft } = await generate("U12", "first", (s) => (s.place === "now-you" ? undefined : item(s)));
    const page = dayPages(draft).find((p) => p.questions.some((q) => q.place === "now-you" && !q.package))!;
    const lost = page.questions.find((q) => q.place === "now-you" && !q.package)!;
    expect(lost.check.status).toBe("failed");
    const html = workbookTemplate().page(renderableDraft(draft).pages[page.number - 1], { qr: "", qrUrl: "" }, renderableDraft(draft))!;
    expect(html).toContain(`data-failed-question="${lost.number}"`);
    expect(html).toContain(`Question ${lost.number} failed: ${(lost.check as { reason: string }).reason}`);
  });
});
