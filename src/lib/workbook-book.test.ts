import { describe, expect, it } from "vitest";
import type { AiJsonRequest } from "@/lib/ai-client";
import { fakeAiClient } from "@/lib/ai-client-fake";
import { fakePrintEngine } from "@/lib/print-engine-fake";
import type { AnswerValue, Item, ItemFormat, Operation, QuestionPackage } from "@/lib/question-package";
import { levelMistakes, pageFigure, printedNumbers, rangeProblem, samProblem, samWork, skillRange } from "@/lib/workbook-book";
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
  if (result.status !== "stored") throw new Error(result.reason);
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
  it("gives every level's child a different ordinary name, never Maya or Sam", () => {
    const names = BC.levels.map((l) => sampleChild(BC, l.id)!.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).not.toContain("Maya");
    expect(names).not.toContain("Sam");
  });

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
    expect(levelMistakes(2)).toEqual(["counted-one-extra", "counted-one-short", "wrong-start", "wrong-operation"]);
    expect(levelMistakes(5)).toContain("swapped-digits");
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
      return { ...item(s), text: "2 + 2 = ?", operation: addOp(2, 2), wrongAnswers: [{ value: num(5), cause: "counted-one-extra", description: "Counts one too many.", step: null }], easier: { text: "1 + 1 = ?", operation: addOp(1, 1) }, shownWrong: 0 };
    });
    expect(asked.length).toBeGreaterThan(0);
    expect(asked.every((names) => names.join() === levelMistakes(Number(level.slice(1))).join())).toBe(true);
    const spots = draft.pages.flatMap((p) => p.questions).filter((q) => q.place === "spot-the-error");
    expect(spots.every((q) => q.check.status !== "failed")).toBe(true);
    const block = dayPages(draft).flatMap((p) => (p.content!.kind === "day" ? p.content!.blocks : [])).find((b) => b.slot === "spot-the-error")!;
    expect(block.lines).toEqual(["Start at 2. Count on 2.", "3, 4, 5", "2 + 2 = [5]"]);
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

describe("numbers that fit the level", () => {
  const sum = (a: number, b: number) => (s: Asked) => (s.place === "spot-the-error" ? { ...item(s), text: "2 + 2 = ?", operation: addOp(2, 2), wrongAnswers: [{ value: num(5), cause: "counted-one-extra", description: "Counts one too many.", step: null }], easier: { text: "1 + 1 = ?", operation: addOp(1, 1) }, shownWrong: 0 }
    : { ...item(s), text: `${a} + ${b} = ?`, operation: addOp(a, b), easier: { text: "1 + 1 = ?", operation: addOp(1, 1) }, wrongAnswers: [{ value: num(a + b + 1), cause: "count", description: "Counts one too many.", step: null }] });
  const placed = (d: GeneratedWorkbook) => d.pages.flatMap((p) => p.questions).filter((q) => q.place && q.place !== "spot-the-error");

  it("fails an item at U3 with numbers past 10, after its two attempts", async () => {
    const { draft } = await generate("U3", "first", sum(64, 15));
    const qs = placed(draft).filter((q) => q.package?.operation || q.check.status === "failed");
    expect(qs.length).toBeGreaterThan(0);
    expect(qs.every((q) => q.check.status === "failed" && q.attempts === 2)).toBe(true);
    expect((qs[0].check as { reason: string }).reason).toContain("at most 10");
  });

  it("passes an item at U3 with numbers to 5, and tells the AI each slot's range (to 10 at most)", async () => {
    const asked: { place?: string; skills: string[]; numbers?: Record<string, { max: number }> }[] = [];
    const { draft } = await generate("U3", "first", (s) => (asked.push(s as never), sum(1, 3)(s)));
    expect(placed(draft).filter((q) => q.check.status === "failed" && /at most|negative/.test((q.check as { reason: string }).reason))).toEqual([]);
    const told = asked.filter((s) => s.place).flatMap((s) => s.skills.map((k) => [k, s.numbers?.[k]?.max] as const));
    expect(told.length).toBeGreaterThan(0);
    expect(told.filter(([k, max]) => max !== skillRange(BC, 3, k).max || max > 10)).toEqual([]);
  });

  it("keeps a review of an earlier skill to that skill's numbers, and never above the page's level", () => {
    expect(skillRange(BC, 12, "1.1-count-to-20").max).toBe(20);
    expect(skillRange(BC, 12, "K3-ten-frame").max).toBe(10);
    expect(skillRange(BC, 3, "3.3-add-within-1000").max).toBe(10);
    expect(skillRange(BC, 22, "3.3-add-within-1000").negatives).toBe(false);
    expect(skillRange(BC, 12, "3.4-recall-addition-20").max).toBe(20);
    expect(skillRange(BC, 8, "2.3-bridge-10-subtract").max).toBe(100);
  });
});

describe("every number the child sees fits the range (R380-3-1)", () => {
  // U3, on a skill to 10: every number of the item is at most 10.
  const n = (value: number): Extract<AnswerValue, { type: "number" }> => ({ type: "number", value });
  const pkg = (over: Partial<QuestionPackage>): QuestionPackage => ({
    id: "q", ref: { source: "workbook", workbookId: WORKBOOK, page: 3, question: 1 }, templateId: null, text: "Find the answer.",
    answer: null, operation: null, steps: [], skill: { standard: "K3", skills: ["K3-part-part-whole"] }, level: 3, difficulty: 2,
    wrongAnswers: [], easierExample: null, ...over,
  });
  const sum = (a: number, b: number, over: Partial<QuestionPackage> = {}) => pkg({
    text: `${a} + ${b} = ?`, operation: { kind: "add", operands: [a, b] }, answer: { value: n(a + b), accepted: [], unit: null },
    easierExample: { text: "1 + 1 = ?", operation: { kind: "add", operands: [1, 1] }, answer: n(2), steps: [] }, ...over,
  });
  const item = (over: Partial<Item>): Item => ({ format: "boxes", scorable: true, parentChecked: false, regions: [], checks: [], error: null, ...over });
  const problem = (p: QuestionPackage) => rangeProblem(p, BC, 3);

  it("passes 2 + 2 with small numbers everywhere", () => {
    expect(problem(sum(2, 2, { wrongAnswers: [{ value: n(5), cause: "count", description: "One too many.", step: null }] }))).toBeNull();
  });

  it("fails a wrong answer past the range (2 + 2, wrong answer 99)", () => {
    expect(problem(sum(2, 2, { wrongAnswers: [{ value: n(99), cause: "count", description: "x", step: null }] }))).toContain("99");
  });

  it("fails an easier example past the range (90 + 1)", () => {
    expect(problem(sum(2, 2, { easierExample: { text: "90 + 1 = ?", operation: { kind: "add", operands: [90, 1] }, answer: n(91), steps: [] } }))).toContain("at most 10");
  });

  it("fails a printed sequence term past the range (9, [10], 11), and a blank past it (9, 10, [11])", () => {
    const seq = (terms: ({ region: string } | AnswerValue)[]) => pkg({
      item: item({ regions: [{ id: "b", kind: "box", label: null, answer: n(10) }], checks: [{ kind: "sequence", terms: terms as never, step: n(1) }] }),
    });
    expect(problem(seq([n(9), { region: "b" }, n(11)]))).toContain("11");
    expect(problem(seq([n(8), n(9), { region: "b" }]))).toBeNull();
    expect(problem(seq([n(9), n(10), { region: "b" }]))).toContain("11");
  });

  it("fails a place-value number and a comparison's numbers past the range", () => {
    expect(problem(pkg({ item: item({ checks: [{ kind: "places", number: 64, parts: [] }] }) }))).toContain("64");
    expect(problem(pkg({ item: item({ checks: [{ kind: "compare", left: n(3), right: n(64), region: "c" }] }) }))).toContain("64");
    expect(problem(pkg({ item: item({ checks: [{ kind: "order", numbers: [n(3), n(15)], direction: "up", regions: [] }] }) }))).toContain("15");
    expect(problem(pkg({ item: item({ checks: [{ kind: "yes-no", statement: { kind: "factor", factor: 3, of: 12 }, region: "c", yes: "Yes", no: "No" }] }) }))).toContain("12");
    expect(problem(pkg({ item: item({ checks: [{ kind: "equations", different: true, numbers: "whole", equations: [{ left: { region: "a" }, op: "+", right: { region: "b" }, result: n(12) }] }] }) }))).toContain("12");
  });

  it("fails the question text, a choice and a region label past the range", () => {
    expect(problem(pkg({ text: "Ava has 64 beads. How many?" }))).toContain("64");
    expect(problem(pkg({ item: item({ format: "tick-one", regions: [{ id: "c", kind: "choice", mark: "tick", label: null, choices: ["3", "12"], answer: "3" }] }) }))).toContain("12");
    expect(problem(pkg({ item: item({ regions: [{ id: "w", kind: "work", label: "Make 15" }] }) }))).toContain("15");
  });

  it("fails each figure past the range: dots, a ten-frame's counters in all, base-ten, a number line and its hops, an array", () => {
    const fig = (figure: Item["figure"], over: Partial<QuestionPackage> = {}) => pkg({ ...over, item: item({ figure }) });
    expect(problem(fig({ kind: "dots", groups: [6, 6], takenAway: 0 }))).toContain("12");
    expect(problem(fig({ kind: "ten-frame", counters: [7, 5] }))).toContain("12");
    expect(problem(fig({ kind: "base-ten", hundreds: 0, tens: 2, ones: 0 }))).toContain("20");
    expect(problem(fig({ kind: "number-line", from: 0, to: 20, step: 1 }))).toContain("20");
    expect(problem(fig({ kind: "array", rows: 3, columns: 4 }))).toContain("12");
    expect(problem(fig({ kind: "number-line", from: 0, to: 10, step: 1 }, { operation: { kind: "add", operands: [4, 3] }, answer: { value: n(7), accepted: [], unit: null } }))).toBeNull();
    expect(printedNumbers(fig({ kind: "number-line", from: 0, to: 10, step: 1 }, { operation: { kind: "add", operands: [4, 3] } }))).toEqual(expect.arrayContaining([0, 10, 4, 7]));
  });

  it("fails Sam's answer and reads every number of Sam's steps", () => {
    const spot = sum(8, 2, {
      wrongAnswers: [{ value: n(11), cause: "counted-one-extra", description: "x", step: null }],
      item: item({ format: "spot-the-error", error: { answer: n(11), step: null } }),
    });
    expect(problem(spot)).toContain("11");
    const ok = sum(2, 2, { wrongAnswers: [{ value: n(5), cause: "counted-one-extra", description: "x", step: null }], item: item({ format: "spot-the-error", error: { answer: n(5), step: null } }) });
    expect(printedNumbers(ok)).toEqual(expect.arrayContaining([3, 4, 5]));
    expect(problem(ok)).toBeNull();
  });

  it("reads negatives and coins: −3 fails before U22, 9 − 3 and a 25¢ coin pass", () => {
    expect(problem(pkg({ text: "What is −3 + 5?" }))).toContain("negative");
    expect(problem(pkg({ text: "9 − 3 = ?" }))).toBeNull();
    expect(problem(pkg({ text: "Find 3n − 2 when n is 2." }))).toBeNull();
    expect(problem(pkg({ text: "Circle the 25¢ coin." }))).toBeNull();
    expect(problem(pkg({ text: "Count 10 000 grains." }))).toContain("10000");
  });

  // One item of each format, its number where that format prints it. A new format does not build until it is added.
  const FORMAT_ITEMS: Record<ItemFormat, (x: number) => Partial<Item>> = {
    "write-number": (x) => ({ regions: [{ id: "a", kind: "box", label: null, answer: n(x) }] }),
    "write-words": (x) => ({ regions: [{ id: "a", kind: "box", label: `Write ${x} in words`, answer: { type: "text", value: "some" } }] }),
    boxes: (x) => ({ regions: [{ id: "a", kind: "box", label: null, answer: n(1) }, { id: "b", kind: "box", label: null, answer: n(x) }] }),
    "fill-table": (x) => ({ regions: [{ id: "a", kind: "box", label: `${x}`, answer: n(1) }] }),
    "tick-one": (x) => ({ regions: [{ id: "c", kind: "choice", mark: "tick", label: null, choices: ["1", `${x}`], answer: "1" }] }),
    circle: (x) => ({ regions: [{ id: "c", kind: "choice", mark: "circle", label: null, choices: [`${x}`, "2"], answer: "2" }] }),
    "tick-and-number": (x) => ({ regions: [{ id: "c", kind: "choice", mark: "tick", label: null, choices: ["+", "−"], answer: "+" }, { id: "a", kind: "box", label: null, answer: n(x) }] }),
    "two-ways": (x) => ({ regions: [{ id: "m1", kind: "work", label: "Method 1" }, { id: "a", kind: "box", label: null, answer: n(x) }] }),
    "spot-the-error": (x) => ({ error: { answer: n(x), step: null } }),
    "show-work": (x) => ({ regions: [{ id: "w", kind: "work", label: "Show your work" }, { id: "a", kind: "box", label: null, answer: n(x) }] }),
    "written-reason": (x) => ({ regions: [{ id: "l", kind: "lines", label: `How do you know ${x} is more than 3?` }] }),
    "number-line": (x) => ({ figure: { kind: "number-line", from: 0, to: x, step: 1 } }),
    "colour-or-shade": (x) => ({ regions: [{ id: "p", kind: "picture", label: `Colour ${x} squares` }] }),
    match: (x) => ({ regions: [{ id: "p", kind: "picture", label: `Match ${x} to its dots` }] }),
    draw: (x) => ({ regions: [{ id: "p", kind: "picture", label: `Draw ${x} dots` }] }),
    "hands-on": (x) => ({ regions: [{ id: "w", kind: "work", label: `Make ${x} with cubes` }] }),
  };
  it.each(Object.keys(FORMAT_ITEMS) as ItemFormat[])("checks a %s item's numbers", (format) => {
    const at = (x: number) => pkg({ item: item({ format, ...FORMAT_ITEMS[format](x) }) });
    expect(problem(at(7))).toBeNull();
    expect(problem(at(64))).toContain("64");
  });
});
