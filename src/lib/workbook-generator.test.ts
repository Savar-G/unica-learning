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
import { skillRange } from "@/lib/workbook-book";
import { choiceAsked } from "@/lib/workbook-generator-items";
import { textRoom } from "@/lib/workbook-template";
import { fixedTemplate } from "@/lib/workbook-template-fixed";
import type { SlotName } from "@/lib/workbook-page";

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
const subOp = (a: number, b: number) => ({ kind: "subtract", operands: [num(a), num(b)], expression: null, unit: null, denominator: null, values: [] });

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
    // Each call is sent twice: the page call, then the redo of every question.
    expect(ai.requests.filter((r) => read(r).day === 1 && read(r).pageType === DAY_PAGES[0].type).map((r) => r.name))
      .toEqual(["workbook_page", "workbook_page", "workbook_page_redo", "workbook_page_redo"]);
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
  const onPage = (ai: ReturnType<typeof fakeAiClient>, day = 1) => ai.requests.filter((r) => read(r).day === day && read(r).pageType === DAY_PAGES[0].type);

  it("is written again once, shorter, with the problems; when no question left out makes it fit, it keeps them all, marked failed", async () => {
    const target = 3;
    const sizes: number[] = [];
    const fit: FitCheck = {
      fits: async (page) => {
        if (page.number === target) sizes.push(page.questions.length);
        return page.number === target ? { ok: false, problems: [{ question: 2, reason: "question 2 does not fit its space" }] } : { ok: true };
      },
    };
    const ai = fakeAiClient({ answer: (r) => fill(r) });
    const draft = await generate(deps({ ai, fit }));
    // It tries with fewer questions, down to one, never none: its panels take their sums from its questions.
    expect(Math.min(...sizes)).toBe(1);
    const page = draft.pages[target - 1];
    expect(page.fit).toEqual({ status: "failed", problems: [{ question: 2, reason: "question 2 does not fit its space" }] });
    expect(page.attempts).toBe(2);
    expect(page.questions).toHaveLength(DAY_PAGES[0].parts.reduce((n, p) => n + p.items, 0));
    expect(page.leftOut).toBeUndefined();
    const calls = onPage(ai);
    expect(calls.map((r) => r.name)).toEqual(["workbook_page", "workbook_page_shorter"]);
    expect(read(calls[1]).slots).toHaveLength(page.questions.length);
    expect(read(calls[1]).note).toContain("question 2: question 2 does not fit its space");
    expect(read(calls[1]).note).toContain("slot 1.1: 13 characters");
    expect(draft.counts.failedPages).toBe(1);
    expect(draft.pages.filter((p) => p.number !== target && p.questions.length > 0).every((p) => p.fit.status === "fits" && p.attempts === 1)).toBe(true);
  });

  it("fits on the second try", async () => {
    let tries = 0;
    const fit: FitCheck = { fits: async (page) => (page.number === 3 && ++tries === 1 ? { ok: false, problems: [{ question: null, reason: "the content does not fit the page" }] } : { ok: true }) };
    const page = (await generate(deps({ fit }))).pages[2];
    expect(page).toMatchObject({ fit: { status: "fits" }, attempts: 2 });
    expect(page.leftOut).toBeUndefined();
  });

  it("leaves out questions one at a time until it fits, the last one the fit check names first, and numbers the rest again", async () => {
    const total = DAY_PAGES[0].parts.reduce((n, p) => n + p.items, 0);
    const checked: number[] = [];
    const fit: FitCheck = {
      fits: async (page) => {
        if (page.number !== 3) return { ok: true };
        checked.push(page.questions.length);
        return page.questions.length > total - 2
          ? { ok: false, problems: [{ question: 1, reason: "question 1 is fine" }, { question: 2, reason: "question 2 runs 40 px past the bottom" }, { question: null, reason: "the content does not fit its space" }] }
          : { ok: true };
      },
    };
    const d = deps({ fit });
    const draft = await generate(d);
    const page = draft.pages[2];
    expect(checked).toEqual([total, total, total - 1, total - 2]);
    expect(page.fit).toEqual({ status: "fits" });
    expect(page.questions.map((q) => q.number)).toEqual(Array.from({ length: total - 2 }, (_, i) => i + 1));
    expect(page.questions.map((q) => q.slot).slice(0, 2)).toEqual(["1.1", "1.4"]);
    for (const q of page.questions) expect(q.package!.ref).toEqual({ source: "workbook", workbookId: WORKBOOK, page: 3, question: q.number });
    expect(page.leftOut).toEqual([
      { slot: "1.2", part: DAY_PAGES[0].parts[0].kind, text: "268 + 157 = ?", reason: "question 2 runs 40 px past the bottom" },
      { slot: "1.3", part: DAY_PAGES[0].parts[0].kind, text: "268 + 157 = ?", reason: "question 2 runs 40 px past the bottom" },
    ]);
    expect(page.omissions).toContainEqual(expect.objectContaining({ part: 0, reason: expect.stringContaining("2 questions left out: the page had no room for their text") }));
    expect(draft.counts.questions).toBe(DAY_PAGES.reduce((s, p) => s + p.parts.reduce((t, part) => t + part.items, 0), 0) - 2);
    expect(await d.store.draft(WORKBOOK)).toEqual(draft);
  });

  it("leaves out the page's last question when the fit check names none", async () => {
    const total = DAY_PAGES[0].parts.reduce((n, p) => n + p.items, 0);
    const fit: FitCheck = { fits: async (page) => (page.number === 3 && page.questions.length === total ? { ok: false, problems: [{ question: null, reason: "the slot runs past" }] } : { ok: true }) };
    const page = (await generate(deps({ fit }))).pages[2];
    expect(page.questions).toHaveLength(total - 1);
    const parts = DAY_PAGES[0].parts.filter((p) => p.items > 0);
    const lastSlot = `${DAY_PAGES[0].parts.indexOf(parts.at(-1)!) + 1}.${parts.at(-1)!.items}`;
    expect(page.leftOut).toEqual([expect.objectContaining({ slot: lastSlot, reason: "the slot runs past" })]);
    expect(page.questions.map((q) => q.slot)).not.toContain(lastSlot);
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

describe("the retry budget: one more try for each reason", () => {
  /** An item whose wrong answer is the right answer: the checker fails it. */
  const bad = (s: SlotAsked) => goodItem(s, { wrongAnswers: [{ value: num(425), cause: "O3", description: "Right by mistake.", step: null }] });
  const firstPageCalls = (ai: ReturnType<typeof fakeAiClient>) => ai.requests.filter((r) => read(r).day === 1 && read(r).pageType === DAY_PAGES[0].type);
  const neverFits: FitCheck = { fits: async (page) => (page.number === 3 ? { ok: false, problems: [{ question: null, reason: "the content does not fit the page" }] } : { ok: true }) };
  /** The first page's calls by name, so a test can answer each try differently. */
  const byCall = (make: (call: string, s: SlotAsked) => unknown) => fakeAiClient({
    answer: (r) => fill(r, (s) => (read(r).day === 1 && read(r).pageType === DAY_PAGES[0].type ? make(r.name, s) : goodItem(s))),
  });

  it("writes a question that failed its check twice once more for a page that does not fit, and never a fourth time", async () => {
    const ai = byCall((_, s) => (s.slot === "1.1" ? bad(s) : goodItem(s)));
    const draft = await generate(deps({ ai, fit: neverFits }));
    const calls = firstPageCalls(ai);
    expect(calls.map((r) => r.name)).toEqual(["workbook_page", "workbook_page_redo", "workbook_page_shorter"]);
    expect(calls.filter((r) => read(r).slots.some((s) => s.slot === "1.1"))).toHaveLength(3);
    const page = draft.pages[2];
    expect(page).toMatchObject({ attempts: 2, fit: { status: "failed" } });
    expect(page.questions[0]).toMatchObject({ slot: "1.1", attempts: 3, check: { status: "failed" } });
    expect(page.questions.slice(1).every((q) => q.attempts === 2)).toBe(true);
  });

  it("takes the shorter rewrite of a failed question when it is sound", async () => {
    const ai = byCall((call, s) => (s.slot === "1.1" && call !== "workbook_page_shorter" ? bad(s) : goodItem(s)));
    let tries = 0;
    const fit: FitCheck = { fits: async (page) => (page.number === 3 && ++tries === 1 ? { ok: false, problems: [{ question: null, reason: "the content does not fit the page" }] } : { ok: true }) };
    const page = (await generate(deps({ ai, fit }))).pages[2];
    expect(page.questions[0]).toMatchObject({ attempts: 3, check: { status: "checked" } });
    expect(page.fit).toEqual({ status: "fits" });
  });

  it("keeps a sound question when its shorter version fails the check, and the shorter of two sound versions", async () => {
    const ai = byCall((call, s) => {
      if (call !== "workbook_page_shorter") return goodItem(s);
      if (s.slot === "1.2") return bad(s);
      if (s.slot === "1.3") return goodItem(s, { text: "268 + 157 is what number in all?" });
      if (s.slot === "1.4") return goodItem(s, { text: "268 + 157" });
      return goodItem(s);
    });
    const qs = (await generate(deps({ ai, fit: neverFits }))).pages[2].questions;
    expect(qs[1]).toMatchObject({ slot: "1.2", attempts: 2, check: { status: "checked" } });
    expect(qs[2].package!.text).toBe("268 + 157 = ?");
    expect(qs[3].package!.text).toBe("268 + 157");
    expect(firstPageCalls(ai)).toHaveLength(2);
  });

  it("sends an AI call that throws once more, and fails its questions only when the second throws too", async () => {
    let calls = 0;
    const ai = fakeAiClient({
      answer: (r) => {
        if (read(r).day === 1 && read(r).pageType === DAY_PAGES[0].type && ++calls === 1) throw new Error("the output is not valid JSON");
        return fill(r);
      },
    });
    const draft = await generate(deps({ ai }));
    expect(firstPageCalls(ai).map((r) => r.name)).toEqual(["workbook_page", "workbook_page"]);
    expect(draft.pages[2].questions.every((q) => q.check.status === "checked" && q.attempts === 1)).toBe(true);
    expect(draft.counts.failed).toBe(0);
  });
});

describe("answers code computes beyond addition", () => {
  const frac = (numerator: number, denominator: number) => ({ ...num(0), type: "fraction", value: null, numerator, denominator });
  const op = (kind: string, operands: unknown[]) => ({ kind, operands, expression: null, unit: null, denominator: null, values: [] });
  const wrong = (value: unknown, step: string | null = null) => ({ value, cause: "operation", description: "A mistake a child makes.", step });

  /** The first page's question 1, from an AI item with this operation, wrong answers and easier example. */
  async function question(operation: unknown, wrongAnswers: unknown[], easier: unknown) {
    const ai = fakeAiClient({ answer: (r) => fill(r, (s) => (s.slot === "1.1" ? goodItem(s, { text: "Solve.", operation, wrongAnswers, easier: { text: "Try this first.", operation: easier } }) : goodItem(s))) });
    return firstDayPage(await generate(deps({ ai }))).questions[0];
  }
  const writes = (q: Awaited<ReturnType<typeof question>>) => q.package!.steps.flatMap((s) => ("write" in s ? [s.write] : []));

  it("subtracts with borrowing across a zero: 503 − 278 = 225", async () => {
    const q = await question(op("subtract", [num(503), num(278)]), [wrong(num(375), "ones"), wrong(num(781))], op("subtract", [num(42), num(7)]));
    expect(q.check).toEqual({ status: "checked" });
    expect(q.package!.answer!.value).toEqual({ type: "number", value: 225 });
    expect(writes(q)).toEqual([5, 2, 2]);
    // The ones take a ten from the tens, which have none, so the tens take one from the hundreds first.
    expect(q.package!.steps.find((s) => s.id === "tens")).toMatchObject({ top: 0, bottom: 7, lent: true, regrouped: true, write: 2 });
    expect(q.package!.steps.find((s) => s.id === "hundreds")).toMatchObject({ top: 5, lent: true, regrouped: false, write: 2 });
    expect(q.package!.easierExample!.answer).toEqual({ type: "number", value: 35 });
  });

  it("divides with a remainder: 47 ÷ 5 = 9 R 2", async () => {
    const q = await question(op("divide", [num(47), num(5)]), [wrong(num(9)), wrong(num(42))], op("divide", [num(9), num(2)]));
    expect(q.check).toEqual({ status: "checked" });
    expect(q.package!.answer!.value).toEqual({ type: "remainder", quotient: 9, remainder: 2 });
    expect(q.package!.steps.find((s) => s.id === "ones")).toMatchObject({ current: 47, quotient: 9, product: 45, remainder: 2 });
    expect(q.package!.easierExample!.answer).toEqual({ type: "remainder", quotient: 4, remainder: 1 });
  });

  it("adds and subtracts decimals in columns: 3.75 + 1.5 = 5.25 and 5.2 − 1.75 = 3.45", async () => {
    const add = await question(op("decimal-add", [num(3.75), num(1.5)]), [wrong(num(3.9)), wrong(num(2.25))], op("decimal-add", [num(1.2), num(0.3)]));
    expect(add.check).toEqual({ status: "checked" });
    expect(add.package!.answer!.value).toEqual({ type: "number", value: 5.25 });
    expect(add.package!.steps.find((s) => s.id === "tenths")).toMatchObject({ digits: [7, 5], total: 12, write: 2, carryOut: 1 });
    const sub = await question(op("decimal-subtract", [num(5.2), num(1.75)]), [wrong(num(4.55)), wrong(num(6.95))], op("decimal-subtract", [num(0.9), num(0.4)]));
    expect(sub.check).toEqual({ status: "checked" });
    expect(sub.package!.answer!.value).toEqual({ type: "number", value: 3.45 });
    expect(sub.package!.steps.find((s) => s.id === "hundredths")).toMatchObject({ top: 0, bottom: 5, addedZero: true, write: 5 });
  });

  it("adds fractions over a common denominator: 1/2 + 1/3 = 5/6", async () => {
    const q = await question(op("fraction-add", [frac(1, 2), frac(1, 3)]), [wrong(frac(2, 5)), wrong(frac(1, 6))], op("fraction-add", [frac(1, 5), frac(2, 5)]));
    expect(q.check).toEqual({ status: "checked" });
    expect(q.package!.answer!.value).toEqual({ type: "fraction", numerator: 5, denominator: 6 });
    expect(q.package!.steps.find((s) => s.id === "common")).toMatchObject({ denominator: 6, to: [{ numerator: 3, denominator: 6 }, { numerator: 2, denominator: 6 }] });
    expect(q.package!.easierExample!.answer).toEqual({ type: "fraction", numerator: 3, denominator: 5 });
  });

  it("fails a wrong answer that is really right, in any form (2.50 for 2.5), so a right answer is never marked wrong", async () => {
    const q = await question(op("decimal-add", [num(1.25), num(1.25)]), [wrong(num(2.5))], op("decimal-add", [num(0.2), num(0.3)]));
    expect(q.check.status).toBe("failed");
  });

  it("fails an operation code cannot compute, with no answer: never a guessed one", async () => {
    const q = await question(op("percent-of", [num(20), num(50)]), [wrong(num(1000))], op("percent-of", [num(10), num(20)]));
    expect(q.check.status).toBe("failed");
    expect(q.package).toBeNull();
  });
});

describe("a book laid out for the templates: room, rules and the content left", () => {
  const U3 = (() => {
    const result = planWorkbook({
      profile: { standards: [] }, grade: 0, level: planLevel(BC, "U3")!, passed: {}, workbook: { number: 1, inLevel: 0 },
      reviews: [], missedReviews: [], misses: [], pausedWeeks: 0, support: null, unassessedUnits: [],
    });
    if (!result.ok) throw new Error(result.reason);
    return result.plan;
  })();
  const laid = { ...input, plan: U3, book: { child: "Zoe" } };
  interface LaidSlot extends SlotAsked { place: string; room?: { characters: number; perLine: number; lines: number }; rules: Record<string, string> }
  const slotsOf = (r: AiJsonRequest) => (JSON.parse((r.content[0] as { text: string }).text) as { slots: LaidSlot[] }).slots;
  /** A small sound sum for any U3 slot: 2 + 1 with a wrong answer of 4 and the easier example 1 + 1. */
  const small = (s: SlotAsked, over: Record<string, unknown> = {}) => goodItem(s, {
    text: "2 + 1 = ?", operation: addOp(2, 1), wrongAnswers: [{ value: num(4), cause: "count", description: "Counts one too many.", step: null }],
    easier: { text: "1 + 1 = ?", operation: addOp(1, 1) }, ...over,
  });

  async function laidOut(d: GenerateDeps) {
    const result = await generateWorkbook(laid, d);
    if (result.status !== "stored") throw new Error(result.reason);
    return result.draft;
  }

  it("gives every slot its text room from the template, and its skills' rules in plain words", async () => {
    const ai = fakeAiClient({ answer: (r) => fill(r, (s) => small(s)) });
    await laidOut(deps({ ai }));
    const slots = ai.requests.flatMap(slotsOf);
    expect(slots.length).toBeGreaterThan(0);
    for (const s of slots) {
      const room = textRoom(s.place as SlotName, 3);
      expect(s.room).toEqual({ characters: room!.characters, perLine: room!.perLine, lines: room!.lines });
      expect(Object.keys(s.rules)).toEqual(s.skills);
    }
    // A parent-led card holds 2 lines of about 23 letters; Spot the error, the sum only.
    expect(slots.find((s) => s.place === "already-know-it")!.room).toEqual({ characters: 41, perLine: 23, lines: 2 });
    expect(textRoom("spot-the-error", 3)!.characters).toBe(10);
    const rule = Object.values(slots.find((s) => s.place === "already-know-it")!.rules)[0];
    expect(rule).toContain("a whole number from 0 to 10");
    expect(rule).toContain("every wrong answer");
    expect(rule).toMatch(/never use: .*division \(no divide operation, no ÷ sign/);
    expect(rule).toContain("never the compare format");
    expect(rule).toContain('Never write the word "one"');
  });

  it("tells the check redo what to change: a wrong answer past the limit counts", async () => {
    const ai = fakeAiClient({
      answer: (r) => fill(r, (s) => (r.name === "workbook_page" && s.slot === "1.1" ? small(s, { wrongAnswers: [{ value: num(12), cause: "operation", description: "Adds.", step: null }] }) : small(s))),
    });
    const draft = await laidOut(deps({ ai }));
    const note = read(ai.requests.find((r) => r.name === "workbook_page_redo")!).note!;
    expect(note).toContain("the number 12 is too big for this question: its numbers are at most");
    expect(note).toContain("Leave out a wrong answer past the limit.");
    expect(firstDayPage(draft).questions[0]).toMatchObject({ slot: "1.1", attempts: 2, check: { status: "checked" } });
  });

  it("stores a missing part (2 + ? = 5) with the missing part as its answer, also on a skill before subtraction", async () => {
    const missing = (part: number, total: number) => ({ kind: "missing-addend", operands: [num(part), num(total)], expression: null, unit: null, denominator: null, values: [] });
    const ai = fakeAiClient({
      answer: (r) => fill(r, (s) => small(s, {
        text: "2 and what make 5?", operation: missing(2, 5), easier: { text: "1 and what make 3?", operation: missing(1, 3) },
        wrongAnswers: [{ value: num(5), cause: "total", description: "Writes the total.", step: null }],
      })),
    });
    const draft = await laidOut(deps({ ai }));
    const qs = draft.pages.flatMap((p) => p.questions).filter((q) => q.place !== "spot-the-error");
    expect(qs.length).toBeGreaterThan(0);
    expect(qs.every((q) => q.check.status === "checked" && q.package!.answer!.value.type === "number" && (q.package!.answer!.value as { value: number }).value === 3)).toBe(true);
    // Some of them are on a skill whose level has not met subtraction (K2 and before): a number bond is allowed there.
    expect(qs.some((q) => !skillRange(BC, 3, q.package!.skill.skills[0]).subtraction)).toBe(true);
    const panels = draft.pages.flatMap((p) => (p.content?.kind === "day" ? p.content.blocks : [])).filter((b) => b.slot === "worked-example" || b.slot === "watch-one" || b.slot === "reminder");
    expect(panels.length).toBeGreaterThan(0);
    for (const b of panels) {
      const lines = [...(b.lines ?? []), ...(b.methods ?? []).flatMap((m) => m.lines)];
      expect(lines).toEqual(b.slot === "reminder" ? ["1 + [2] = 3"] : ["Count on from 1 to 3: 2, 3.", "1 + [2] = 3"]);
    }
  });

  it("works the panels' sums by counting on and back at U3, never in columns", async () => {
    const ai = fakeAiClient({ answer: (r) => fill(r, (s) => small(s, { text: "10 - 9 = ?", operation: subOp(10, 9), easier: { text: "9 - 8 = ?", operation: subOp(9, 8) }, wrongAnswers: [{ value: num(2), cause: "count", description: "Counts one too many.", step: null }] })) });
    const draft = await laidOut(deps({ ai }));
    const watch = draft.pages.flatMap((p) => (p.content?.kind === "day" ? p.content.blocks : [])).filter((b) => b.slot === "watch-one" || b.slot === "worked-example");
    expect(watch.length).toBeGreaterThan(0);
    for (const b of watch) {
      const lines = [...(b.lines ?? []), ...(b.methods ?? []).flatMap((m) => m.lines)];
      expect(lines).toEqual(["Count back 8 from 9: 8, 7, 6, 5, 4, 3, 2, 1.", "9 − 8 = [1]"]);
    }
  });

  it("refuses a yes-or-no or either-or question stored with an operation, and tells the redo", async () => {
    const ai = fakeAiClient({
      answer: (r) => fill(r, (s) => (r.name === "workbook_page" && s.slot === "1.1" ? small(s, { text: "Is 3 close to 5 or less than 2?" }) : small(s))),
    });
    const draft = await laidOut(deps({ ai }));
    const note = read(ai.requests.find((r) => r.name === "workbook_page_redo")!).note!;
    expect(note).toContain("the question asks yes or no, but its answer is the operation's number");
    expect(firstDayPage(draft).questions[0]).toMatchObject({ attempts: 2, check: { status: "checked" } });
    expect(choiceAsked("Is 8 close to 10?")).toBe("yes or no");
    expect(choiceAsked("Mia has 4. Are they equal?")).toBe("yes or no");
    expect(choiceAsked("Is it 4 or 7?")).toBe("yes or no");
    expect(choiceAsked("Which is more, 4 or 7?")).toBe("for a choice");
    expect(choiceAsked("Is 8 here. How far is 8 from 10?")).toBeNull();
    expect(choiceAsked("6 + 2 = ?")).toBeNull();
  });

  it("drops a slot from the page's content when every question of it is left out, and keeps the others' numbers in step", async () => {
    const fit: FitCheck = {
      fits: async (p) => {
        const c = p.content;
        if (c?.kind !== "day") return { ok: true };
        // The page fits once its last block is gone.
        const last = c.blocks.filter((b) => b.items.length > 0).at(-1)!;
        return c.blocks.filter((b) => b.items.length > 0).length > 1 ? { ok: false, problems: [{ question: last.items[0], reason: `question ${last.items[0]} runs past the bottom` }] } : { ok: true };
      },
    };
    const draft = await laidOut(deps({ ai: fakeAiClient({ answer: (r) => fill(r, (s) => small(s)) }), fit }));
    const p = draft.pages.find((x) => x.leftOut)!;
    expect(p.fit).toEqual({ status: "fits" });
    expect(p.leftOut!.length).toBeGreaterThan(0);
    const c = p.content!;
    if (c.kind !== "day") throw new Error("not a day page");
    const items = c.blocks.flatMap((b) => b.items);
    expect(items).toEqual(p.questions.map((q) => q.number));
    expect(c.blocks.every((b) => b.items.length > 0 || ["worked-example", "watch-one", "reminder"].includes(b.slot))).toBe(true);
    expect(p.omissions!.some((o) => /left out: the page had no room/.test(o.reason))).toBe(true);
  });
});

describe("the vary number", () => {
  it("gives each laid-out slot a number in its range, fixed by day, page and slot, so pages written apart differ", async () => {
    const U3 = planWorkbook({
      profile: { standards: [] }, grade: 0, level: planLevel(BC, "U3")!, passed: {}, workbook: { number: 1, inLevel: 0 },
      reviews: [], missedReviews: [], misses: [], pausedWeeks: 0, support: null, unassessedUnits: [],
    });
    if (!U3.ok) throw new Error(U3.reason);
    const run = async () => {
      const ai = fakeAiClient({ answer: (r) => fill(r) });
      await generateWorkbook({ ...input, plan: U3.plan, book: { child: "Zoe" } }, deps({ ai }));
      return ai.requests.filter((r) => r.name === "workbook_page").flatMap((r) => (JSON.parse((r.content[0] as { text: string }).text) as { slots: { vary: number; numbers: Record<string, { max: number }> }[] }).slots);
    };
    const slots = await run();
    expect(slots.every((s) => s.vary >= 1 && s.vary <= Math.min(...Object.values(s.numbers).map((n) => n.max)))).toBe(true);
    expect(new Set(slots.map((s) => s.vary)).size).toBeGreaterThan(3);
    expect((await run()).map((s) => s.vary)).toEqual(slots.map((s) => s.vary));
  });
});
