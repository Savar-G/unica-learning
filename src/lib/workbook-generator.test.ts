import { describe, expect, it } from "vitest";
import type { AiJsonRequest } from "@/lib/ai-client";
import { fakeAiClient } from "@/lib/ai-client-fake";
import { fakePrintEngine } from "@/lib/print-engine-fake";
import { operationResult } from "@/lib/question-package";
import { memoryDraftStore } from "@/lib/workbook-draft-memory";
import { renderFitCheck } from "@/lib/workbook-fit";
import { curriculumFor } from "@/lib/workbook-curriculum";
import { generateWorkbook, type FitCheck, type GenerateDeps, type GeneratedWorkbook } from "@/lib/workbook-generator";
import { planLevel, planWorkbook, type WorkbookPlan } from "@/lib/workbook-plan";
import { fixedTemplate } from "@/lib/workbook-template-fixed";

// The workbook generator (#311, spec #296) through its public interface: a real two-week plan (#308) on the BC
// curriculum, the fake AI client with fixed JSON, a fake fit check, and the in-memory draft store.

const BC = curriculumFor("bc")!;
const WORKBOOK = "00000000-0000-4000-8000-0000000000a1";
const CHILD = "00000000-0000-4000-8000-0000000000c1";
const PARENT = "00000000-0000-4000-8000-0000000000f1";

function plan(): WorkbookPlan {
  const result = planWorkbook({
    profile: { standards: [] }, grade: 3, level: planLevel(BC, "U10")!, passed: {}, workbook: { number: 1, inLevel: 0 },
    reviews: [], missedReviews: [], misses: [], pausedWeeks: 0, support: null, unassessedUnits: [],
  });
  if (!result.ok) throw new Error(result.reason);
  return result.plan;
}
const PLAN = plan();
const DAY_PAGES = PLAN.days.flatMap((d) => d.pages);

const input = { workbookId: WORKBOOK, childId: CHILD, number: 1, profileBuild: null, plan: PLAN, curriculum: BC };

const num = (value: number) => ({
  type: "number", value, numerator: null, denominator: null, whole: null, unit: null, hours: null, minutes: null, period: null, parts: [], text: null,
});
const addOp = (a: number, b: number) => ({ kind: "add", operands: [num(a), num(b)], expression: null, unit: null, denominator: null, values: [] });

interface SlotAsked { slot: string; skills: string[] }
const read = (r: AiJsonRequest) => JSON.parse((r.content[0] as { text: string }).text) as { day: number; pageType: string; slots: SlotAsked[]; note: string | null };

/** A sound item for a slot: an addition with a carry, its wrong answers and an easier example. */
function goodItem(s: SlotAsked, over: Record<string, unknown> = {}) {
  return {
    slot: s.slot, skill: s.skills[0], difficulty: 2, text: "268 + 157 = ?", format: "write-number", operation: addOp(268, 157),
    wrongAnswers: [
      { value: num(315), cause: "O3", description: "Adds each column and forgets to carry.", step: "tens" },
      { value: num(111), cause: "operation", description: "Takes away instead of adding.", step: null },
    ],
    easier: { text: "48 + 37 = ?", operation: addOp(48, 37) },
    shownWrong: null,
    ...over,
  };
}

const fill = (r: AiJsonRequest, make: (s: SlotAsked, r: ReturnType<typeof read>) => unknown = (s) => goodItem(s)) =>
  ({ items: read(r).slots.map((s) => make(s, read(r))).filter((x) => x !== undefined) });

const fits: FitCheck = { fits: async () => ({ ok: true }) };

function deps(over: Partial<GenerateDeps> = {}): GenerateDeps & { store: ReturnType<typeof memoryDraftStore> } {
  let n = 0;
  return {
    ai: fakeAiClient({ answer: (r) => fill(r) }),
    fit: fits,
    store: memoryDraftStore({ [CHILD]: PARENT }),
    qrToken: () => `token-${String(++n).padStart(12, "0")}`,
    ...over,
  } as GenerateDeps & { store: ReturnType<typeof memoryDraftStore> };
}

async function generate(d = deps()): Promise<GeneratedWorkbook> {
  const result = await generateWorkbook(input, d);
  if (result.status !== "stored") throw new Error(result.reason);
  return result.draft;
}

const firstDayPage = (draft: GeneratedWorkbook) => draft.pages.find((p) => p.questions.length > 0)!;

describe("a full draft", () => {
  it("is stored with the book's page numbers, question numbers that restart on each page and every answer checked", async () => {
    const d = deps();
    const draft = await generate(d);
    expect(await d.store.draft(WORKBOOK)).toEqual(draft);

    const n = draft.pages.length;
    expect(n % 4).toBe(0);
    expect(draft.pages.map((p) => p.number)).toEqual(Array.from({ length: n }, (_, i) => i + 1));
    expect(draft.pages.slice(0, 2).map((p) => p.type)).toEqual(["cover", "how-plan"]);
    const backCover = 3 + DAY_PAGES.length;
    expect(draft.pages[backCover - 1].type).toBe("back-cover");
    expect(draft.pages.slice(backCover).every((p) => p.type === "blank")).toBe(true);
    expect(n - backCover).toBeLessThan(4);

    const dayPages = draft.pages.slice(2, backCover - 1);
    expect(dayPages.map((p) => p.type)).toEqual(DAY_PAGES.map((p) => p.type));
    expect(dayPages.map((p) => p.dayLabel)).toEqual(PLAN.days.flatMap((day) => day.pages.map(() => `Day ${day.day}`)));
    expect(new Set(draft.pages.map((p) => p.qrToken)).size).toBe(n);

    for (const [i, page] of dayPages.entries()) {
      const slots = DAY_PAGES[i].parts.reduce((s, part) => s + part.items, 0);
      expect(page.questions.map((q) => q.number)).toEqual(Array.from({ length: slots }, (_, j) => j + 1));
      for (const q of page.questions) {
        expect(q.check).toEqual({ status: "checked" });
        expect(q.package!.ref).toEqual({ source: "workbook", workbookId: WORKBOOK, page: page.number, question: q.number });
      }
    }
    expect(draft.counts).toMatchObject({ pages: n, failed: 0, notChecked: 0, failedPages: 0 });
    expect(draft.counts.questions).toBe(DAY_PAGES.reduce((s, p) => s + p.parts.reduce((t, part) => t + part.items, 0), 0));
    expect(draft.counts.questions).toBeGreaterThan(0);
  });

  it("makes one AI call per day page with slots, and none for the cover, the plan page and the back cover", async () => {
    const d = deps();
    await generate(d);
    const withSlots = DAY_PAGES.filter((p) => p.parts.some((part) => part.items > 0)).length;
    expect((d.ai as ReturnType<typeof fakeAiClient>).requests.length).toBe(withSlots);
  });

  it("takes every answer and worked step from code, never from the AI", async () => {
    const d = deps({ ai: fakeAiClient({ answer: (r) => fill(r, (s) => ({ ...goodItem(s), answer: num(999), steps: [] })) }) });
    const q = firstDayPage(await generate(d)).questions[0];
    expect(q.package!.answer!.value).toEqual(operationResult({ kind: "add", operands: [268, 157] }));
    expect(q.package!.steps.length).toBeGreaterThan(0);
    expect(q.package!.easierExample!.answer).toEqual({ type: "number", value: 85 });
  });

  it("reports progress after each day page", async () => {
    const seen: number[] = [];
    await generate(deps({ progress: (done, total) => { seen.push(done); expect(total).toBe(DAY_PAGES.length); } }));
    expect(seen).toEqual(DAY_PAGES.map((_, i) => i + 1));
  });
});

describe("a failed question", () => {
  /** An item whose wrong answer is the right answer: the checker fails it. */
  const bad = (s: SlotAsked) => goodItem(s, { wrongAnswers: [{ value: num(425), cause: "O3", description: "Right by mistake.", step: null }] });

  it("is written again once, then kept and marked failed with the reason", async () => {
    let page = 0;
    const ai = fakeAiClient({
      answer: (r) => {
        if (r.name === "workbook_page") page++;
        return fill(r, (s) => (page === 1 && s.slot === "1.1" ? bad(s) : goodItem(s)));
      },
    });
    const draft = await generate(deps({ ai }));
    const q = firstDayPage(draft).questions[0];
    expect(q.check.status).toBe("failed");
    expect(q.check.status === "failed" && q.check.reason).toContain("is a right answer");
    expect(q.attempts).toBe(2);
    expect(q.package!.text).toBe("268 + 157 = ?");
    const redo = ai.requests.filter((r) => r.name === "workbook_page_redo");
    expect(redo).toHaveLength(1);
    expect(read(redo[0]).slots.map((s) => s.slot)).toEqual(["1.1"]);
    expect(read(redo[0]).note).toContain("is a right answer");
    expect(firstDayPage(draft).questions.slice(1).every((x) => x.attempts === 1 && x.check.status === "checked")).toBe(true);
    expect(draft.counts.failed).toBe(1);
  });

  it("passes when the second try is sound", async () => {
    const ai = fakeAiClient({ answer: (r) => fill(r, (s) => (r.name === "workbook_page" && s.slot === "1.1" ? bad(s) : goodItem(s))) });
    const draft = await generate(deps({ ai }));
    expect(firstDayPage(draft).questions[0]).toMatchObject({ check: { status: "checked" }, attempts: 2 });
    expect(draft.counts.failed).toBe(0);
  });

  it("tells the redo the operation's worked step names when a wrong answer names a step it does not have", async () => {
    const ai = fakeAiClient({
      answer: (r) => fill(r, (s) => (s.slot === "1.1" ? goodItem(s, { wrongAnswers: [{ value: num(315), cause: "O3", description: "No carry.", step: "carry" }] }) : goodItem(s))),
    });
    await generate(deps({ ai }));
    const note = read(ai.requests.find((r) => r.name === "workbook_page_redo")!).note!;
    expect(note).toContain("names a step the question does not have");
    expect(note).toMatch(/worked steps are named: .*tens/);
  });

  it("is never dropped: a slot the AI leaves out is marked failed", async () => {
    const ai = fakeAiClient({ answer: (r) => fill(r, (s) => (s.slot === "1.1" ? undefined : goodItem(s))) });
    const q = firstDayPage(await generate(deps({ ai }))).questions[0];
    expect(q).toMatchObject({ number: 1, slot: "1.1", check: { status: "failed", reason: "the AI wrote nothing for this question" }, attempts: 2, package: null });
  });

  it("is failed with the error when the AI call throws, and the draft is still stored", async () => {
    const ai = fakeAiClient({ answer: () => { throw new Error("time is up"); } });
    const d = deps({ ai });
    const draft = await generate(d);
    const all = draft.pages.flatMap((p) => p.questions);
    expect(all.every((q) => q.check.status === "failed" && q.check.reason === "the AI gave no answer: time is up" && q.attempts === 2)).toBe(true);
    expect(draft.counts.failed).toBe(all.length);
    expect(await d.store.draft(WORKBOOK)).not.toBeNull();
  });

  it("fails a skill the plan does not name for the slot", async () => {
    const ai = fakeAiClient({ answer: (r) => fill(r, (s) => (s.slot === "1.1" ? goodItem(s, { skill: "9.1-not-a-skill" }) : goodItem(s))) });
    const q = firstDayPage(await generate(deps({ ai }))).questions[0];
    expect(q.check.status === "failed" && q.check.reason).toContain("is not one the plan asks for");
  });
});

describe("questions code cannot check", () => {
  it("are kept and marked not checked by code", async () => {
    const ai = fakeAiClient({
      answer: (r) => fill(r, (s) => (s.slot === "1.1" ? goodItem(s, { format: "written-reason", text: "How do you know 268 + 157 is more than 400?", operation: null, easier: null, wrongAnswers: [] }) : goodItem(s))),
    });
    const draft = await generate(deps({ ai }));
    const q = firstDayPage(draft).questions[0];
    expect(q.check).toEqual({ status: "not-checked", reason: "a parent checks the item" });
    expect(q.package!.item!.format).toBe("written-reason");
    expect(draft.counts.notChecked).toBe(draft.pages.filter((p) => p.questions.some((x) => x.slot === "1.1")).length);
  });
});

describe("item formats", () => {
  it("builds every scored region's answer in code", async () => {
    const formats = ["show-work", "two-ways", "tick-and-number", "spot-the-error"];
    const ai = fakeAiClient({
      answer: (r) => fill(r, (s) => {
        const i = Number(s.slot.split(".")[1]) - 1;
        return i < formats.length ? goodItem(s, { format: formats[i], shownWrong: formats[i] === "spot-the-error" ? 0 : null }) : goodItem(s);
      }),
    });
    const all = (await generate(deps({ ai }))).pages.flatMap((p) => p.questions);
    for (const format of formats) {
      const built = all.filter((q) => q.package?.item?.format === format);
      expect(built.length).toBeGreaterThan(0);
      expect(built.every((q) => q.check.status === "checked")).toBe(true);
    }
    const mixed = all.find((q) => q.package?.item?.format === "tick-and-number")!;
    expect(mixed.package!.item!.regions.find((x) => x.kind === "choice")).toMatchObject({ answer: "+" });
    const spot = all.find((q) => q.package?.item?.format === "spot-the-error")!;
    expect(spot.package!.item!.error).toEqual({ answer: { type: "number", value: 315 }, step: "tens" });
  });
});

describe("a page that does not fit", () => {
  it("is written again once with the problems, then kept and marked failed", async () => {
    const target = 3;
    const fit: FitCheck = { fits: async (page) => (page.number === target ? { ok: false, problems: [{ question: 2, reason: "question 2 does not fit its space" }] } : { ok: true }) };
    const ai = fakeAiClient({ answer: (r) => fill(r) });
    const draft = await generate(deps({ ai, fit }));
    const page = draft.pages[target - 1];
    expect(page.fit).toEqual({ status: "failed", problems: [{ question: 2, reason: "question 2 does not fit its space" }] });
    expect(page.attempts).toBe(2);
    expect(page.questions.length).toBeGreaterThan(0);
    const calls = ai.requests.filter((r) => r.name === "workbook_page" && read(r).day === 1 && read(r).pageType === DAY_PAGES[0].type);
    expect(calls).toHaveLength(2);
    expect(read(calls[1]).note).toContain("question 2: question 2 does not fit its space");
    expect(draft.counts.failedPages).toBe(1);
    expect(draft.pages.filter((p) => p.number !== target && p.questions.length > 0).every((p) => p.fit.status === "fits" && p.attempts === 1)).toBe(true);
  });

  it("fits on the second try", async () => {
    let tries = 0;
    const fit: FitCheck = { fits: async (page) => (page.number === 3 && ++tries === 1 ? { ok: false, problems: [{ question: null, reason: "the content does not fit the page" }] } : { ok: true }) };
    const page = (await generate(deps({ fit }))).pages[2];
    expect(page).toMatchObject({ fit: { status: "fits" }, attempts: 2 });
  });

  it("is checked with the page's content and numbers, not the failed questions with no package", async () => {
    const seen: { number: number; questions: number[] }[] = [];
    const fit: FitCheck = { fits: async (page) => { seen.push({ number: page.number, questions: page.questions.map((q) => q.number) }); return { ok: true }; } };
    const ai = fakeAiClient({ answer: (r) => fill(r, (s) => (s.slot === "1.1" ? undefined : goodItem(s))) });
    await generate(deps({ ai, fit }));
    expect(seen[0].number).toBe(3);
    expect(seen[0].questions[0]).toBe(2);
  });
});

describe("the AI never sets layout", () => {
  it("asks for content fields only, and ignores any layout the AI writes", async () => {
    const ai = fakeAiClient({
      answer: (r) => ({
        pageType: "cover", font: "Comic Sans", layout: "one-column",
        items: read(r).slots.map((s) => ({ ...goodItem(s), font: "Comic Sans", fontSize: 40, x: 10, y: 20, position: "top", number: 99, page: 7 })),
      }),
    });
    const draft = await generate(deps({ ai }));
    const schema = JSON.stringify(ai.requests[0].schema);
    for (const word of ["font", "layout", "position", "size", "\"x\"", "\"y\"", "width", "height", "page"]) expect(schema).not.toContain(word);
    const stored = JSON.stringify(draft);
    for (const word of ["Comic Sans", "fontSize", "one-column", "\"position\""]) expect(stored).not.toContain(word);
    expect(draft.pages[2].type).toBe(DAY_PAGES[0].type);
    expect(draft.pages[2].questions[0]).toMatchObject({ number: 1 });
    expect(draft.pages[2].questions[0].package!.ref).toMatchObject({ page: 3, question: 1 });
  });
});

describe("refusals", () => {
  it("refuses a workbook id that is not a UUID before any AI call", async () => {
    const d = deps();
    expect(await generateWorkbook({ ...input, workbookId: "nope" }, d)).toEqual({ status: "refused", reason: "the workbook id is not a UUID" });
    expect((d.ai as ReturnType<typeof fakeAiClient>).requests).toHaveLength(0);
  });

  it("answers the store's refusal: an unknown child, or a draft id already used", async () => {
    expect(await generateWorkbook(input, deps({ store: memoryDraftStore({}) }))).toEqual({ status: "refused", reason: "the child is not known" });
    const d = deps();
    await generate(d);
    expect(await generateWorkbook(input, { ...d, qrToken: deps().qrToken })).toEqual({ status: "refused", reason: "the draft id is already used" });
  });

  it("refuses QR tokens that are used twice", async () => {
    expect(await generateWorkbook(input, deps({ qrToken: () => "token-same-0000000" }))).toMatchObject({ status: "refused", reason: expect.stringContaining("QR token") });
  });
});

describe("the fit check on main (the renderer's measure)", () => {
  const book = { id: WORKBOOK, childId: CHILD, number: 1, levels: [10], profileBuild: null };
  const practicePage = async () => {
    const draft = await generate(deps());
    const page = draft.pages.find((p) => p.questions.length > 0)!;
    return { number: page.number, dayLabel: page.dayLabel, type: "practice", qrToken: page.qrToken, questions: page.questions.map((q) => ({ number: q.number, package: q.package! })) };
  };

  it("passes a page that fits the template", async () => {
    const fit = renderFitCheck({ template: fixedTemplate(), engine: fakePrintEngine(), parentId: PARENT });
    expect(await fit.fits(await practicePage(), book)).toEqual({ ok: true });
  });

  it("names a question that overflows, and a page type the template has no layout for", async () => {
    const page = await practicePage();
    const over = renderFitCheck({ template: fixedTemplate(), engine: fakePrintEngine({ overflow: ["1 question-2"] }), parentId: PARENT });
    expect(await over.fits(page, book)).toEqual({ ok: false, problems: [{ question: 2, reason: "question 2 does not fit its space" }] });
    const fit = renderFitCheck({ template: fixedTemplate(), engine: fakePrintEngine(), parentId: PARENT });
    expect(await fit.fits({ ...page, type: "warm-up" }, book)).toEqual({ ok: false, problems: [{ question: null, reason: "the template has no layout for a warm-up page" }] });
  });
});
