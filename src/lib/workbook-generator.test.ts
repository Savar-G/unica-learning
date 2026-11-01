import { describe, expect, it } from "vitest";
import type { AiJsonRequest } from "@/lib/ai-client";
import { fakeAiClient } from "@/lib/ai-client-fake";
import { fakePrintEngine } from "@/lib/print-engine-fake";
import { operationResult } from "@/lib/question-package";
import { memoryDraftStore } from "@/lib/workbook-draft-memory";
import { renderFitCheck } from "@/lib/workbook-fit";
import { curriculumFor } from "@/lib/workbook-curriculum";
import { generateWorkbook, kindsOf, shapeOf, type FitCheck, type GenerateDeps, type GeneratedWorkbook } from "@/lib/workbook-generator";
import { planLevel, planWorkbook, type WorkbookPlan } from "@/lib/workbook-plan";
import { skillRange } from "@/lib/workbook-book";
import { buildQuestion, choiceAsked } from "@/lib/workbook-generator-items";
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

interface SlotAsked { slot: string; skills: string[]; numbers?: Record<string, { max: number }> }
const read = (r: AiJsonRequest) => JSON.parse((r.content[0] as { text: string }).text) as { day: number; page: number; pageType: string; slots: SlotAsked[]; examples?: SlotAsked[]; note: string | null };

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

/** The AI's answer to a request: `make` for each slot, and for each panel's worked example when the page asks for some. */
const fill = (r: AiJsonRequest, make: (s: SlotAsked, r: ReturnType<typeof read>) => unknown = (s) => goodItem(s)) =>
  ({ items: [...read(r).slots, ...(read(r).examples ?? [])].map((s) => make(s, read(r))).filter((x) => x !== undefined) });

const fits: FitCheck = { fits: async () => ({ ok: true }) };

/** A made-up lowercase word for each number ("qa", "qb", ... "qba"), so each fake question has a shape of its own. */
const tag = (n: number) => `q${n.toString(26).split("").map((d) => String.fromCharCode(97 + parseInt(d, 26))).join("")}`;

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
    expect(q).toMatchObject({ number: 1, slot: "1.1", check: { status: "failed", reason: "the AI wrote nothing for this question (its answer held no items)" }, attempts: 2, package: null });
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
  /**
   * A fake AI that writes as the book asks (round 3): every question different. Each call on a page takes the next pair
   * of the slot's range (a + b + 1 at most its max), and each text a new pair of names, so no question repeats one of
   * the book or of its page. `kind` makes the item from the pair.
   */
  const NAMES = ["Ava", "Ben", "Cal", "Dot", "Eli", "Fay", "Gus", "Hal", "Ivy", "Jo", "Kai", "Liv", "Max", "Ned", "Oli", "Pia", "Quin", "Rex", "Sam", "Tia"];
  function writer(kind: (who: string, a: number, b: number) => Record<string, unknown>) {
    let names = 0;
    const onPage = new Map<string, number>();
    return (s: SlotAsked, r: ReturnType<typeof read>, over: Record<string, unknown> = {}) => {
      const max = Math.min(10, ...Object.values(s.numbers ?? {}).map((n) => n.max));
      const pairs = Array.from({ length: max }, (_, a) => Array.from({ length: max }, (_, b) => [a + 1, b + 1] as const)).flat().filter(([a, b]) => a + b + 1 <= max);
      const key = `${r.day}:${r.page}`;
      const k = onPage.get(key) ?? 0;
      onPage.set(key, k + 1);
      const [a, b] = pairs[k % pairs.length];
      const c = names++;
      return goodItem(s, { ...kind(`${NAMES[c % 20]} and ${NAMES[Math.floor(c / 20) % 20]} ${tag(c)}`, a, b), ...over });
    };
  }
  const adds = () => writer((who, a, b) => ({
    text: `${who} have ${a}. ${b} more come. How many now?`, operation: addOp(a, b),
    wrongAnswers: [{ value: num(a + b + 1), cause: "count", description: "Counts one too many.", step: null }],
    easier: { text: "Try a smaller sum.", operation: addOp(0, Math.min(a, b)) },
  }));

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
    const write = adds();
    const ai = fakeAiClient({
      answer: (r) => fill(r, (s, q) => (r.name === "workbook_page" && s.slot === "1.1" && q.day === 1 && q.page === 1
        ? write(s, q, { wrongAnswers: [{ value: num(12), cause: "operation", description: "Adds.", step: null }] }) : write(s, q))),
    });
    const draft = await laidOut(deps({ ai }));
    const note = read(ai.requests.find((r) => r.name === "workbook_page_redo")!).note!;
    expect(note).toContain("the number 12 is too big for this question: its numbers are at most");
    expect(note).toContain("Leave out a wrong answer past the limit.");
    expect(firstDayPage(draft).questions[0]).toMatchObject({ slot: "1.1", attempts: 2, check: { status: "checked" } });
  });

  it("stores a missing part (2 + ? = 5) with the missing part as its answer, also on a skill before subtraction", async () => {
    const missing = (part: number, total: number) => ({ kind: "missing-addend", operands: [num(part), num(total)], expression: null, unit: null, denominator: null, values: [] });
    const write = writer((who, a, b) => ({
      text: `${who} have ${a}. How many more make ${a + b}?`, operation: missing(a, a + b), easier: { text: "Try a smaller sum.", operation: missing(1, 1) },
      wrongAnswers: [{ value: num(a + b), cause: "total", description: "Writes the total.", step: null }],
    }));
    const ai = fakeAiClient({ answer: (r) => fill(r, (s, q) => write(s, q)) });
    const draft = await laidOut(deps({ ai }));
    const qs = draft.pages.flatMap((p) => p.questions).filter((q) => q.place !== "spot-the-error");
    expect(qs.length).toBeGreaterThan(0);
    expect(qs.every((q) => {
      const op = q.package!.operation as { kind: string; operands: number[] };
      return q.check.status === "checked" && op.kind === "missing-addend" && (q.package!.answer!.value as { value: number }).value === op.operands[1] - op.operands[0];
    })).toBe(true);
    // Some of them are on a skill whose level has not met subtraction (K2 and before): a number bond is allowed there.
    expect(qs.some((q) => !skillRange(BC, 3, q.package!.skill.skills[0]).subtraction)).toBe(true);
    const panels = draft.pages.flatMap((p) => (p.content?.kind === "day" ? p.content.blocks : [])).filter((b) => b.slot === "worked-example" || b.slot === "watch-one" || b.slot === "reminder");
    expect(panels.length).toBeGreaterThan(0);
    for (const b of panels) {
      const lines = [...(b.lines ?? []), ...(b.methods ?? []).flatMap((m) => m.lines)];
      expect(lines.at(-1)).toMatch(/^\d+ \+ \[\d+\] = \d+$/);
      if (b.slot !== "reminder") expect(lines[0]).toMatch(/^Count on from \d+ to \d+: /);
    }
  });

  it("works the panels' sums by counting on and back at U3, never in columns", async () => {
    const write = writer((who, a, b) => ({
      text: `${who} have ${a + b}. ${b} fly away. How many are left?`, operation: subOp(a + b, b), easier: { text: "Try a smaller sum.", operation: subOp(1, 1) },
      wrongAnswers: [{ value: num(a + 1), cause: "count", description: "Counts one too many.", step: null }],
    }));
    const ai = fakeAiClient({ answer: (r) => fill(r, (s, q) => write(s, q)) });
    const draft = await laidOut(deps({ ai }));
    const watch = draft.pages.flatMap((p) => (p.content?.kind === "day" ? p.content.blocks : [])).filter((b) => b.slot === "watch-one" || b.slot === "worked-example");
    expect(watch.length).toBeGreaterThan(0);
    for (const b of watch) {
      const lines = [...(b.lines ?? []), ...(b.methods ?? []).flatMap((m) => m.lines)];
      expect(lines).toHaveLength(2);
      expect(lines[0]).toMatch(/^Count back \d+ from \d+: [\d, ]+\.$/);
      expect(lines[1]).toMatch(/^\d+ − \d+ = \[\d+\]$/);
    }
  });

  it("works a panel's example from a count item's picture when no question has an operation, never an empty panel", async () => {
    const write = writer((who, a, b) => ({ text: `${who} have dots. How many?`, format: "count", operation: null, easier: null, wrongAnswers: [], figure: "dots", numbers: [num(a), num(b)] }));
    const ai = fakeAiClient({ answer: (r) => fill(r, (s, q) => write(s, q)) });
    const draft = await laidOut(deps({ ai }));
    const panels = draft.pages.flatMap((p) => (p.content?.kind === "day" ? p.content.blocks : [])).filter((b) => b.slot === "watch-one" || b.slot === "worked-example");
    expect(panels.length).toBeGreaterThan(0);
    for (const b of panels) {
      const lines = [...(b.lines ?? []), ...(b.methods ?? []).flatMap((m) => m.lines)];
      expect(lines[0]).toMatch(/^Count them: 1(, \d+)*\.$/);
      expect(lines[1]).toMatch(/^There are \[\d+\]\.$/);
      expect(b.label).toBe("Count");
    }
  });

  it("refuses a yes-or-no or either-or question stored with an operation, and tells the redo", async () => {
    const write = adds();
    const ai = fakeAiClient({
      answer: (r) => fill(r, (s, q) => (r.name === "workbook_page" && s.slot === "1.1" && q.day === 1 && q.page === 1 ? write(s, q, { text: "Is 3 close to 5 or less than 2?" }) : write(s, q))),
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

describe("round 3 (#380): repeats, panel examples, items that do not match their text", () => {
  const U3 = (() => {
    const result = planWorkbook({
      profile: { standards: [] }, grade: 0, level: planLevel(BC, "U3")!, passed: {}, workbook: { number: 1, inLevel: 0 },
      reviews: [], missedReviews: [], misses: [], pausedWeeks: 0, support: null, unassessedUnits: [],
    });
    if (!result.ok) throw new Error(result.reason);
    return result.plan;
  })();
  const laid = { ...input, plan: U3, book: { child: "Zoe" } };
  const NAMES = ["Ava", "Ben", "Cal", "Dot", "Eli", "Fay", "Gus", "Hal", "Ivy", "Jo", "Kai", "Liv", "Max", "Ned", "Oli", "Pia", "Quin", "Rex", "Sam", "Tia"];
  type Req = ReturnType<typeof read> & { examples?: (SlotAsked & { panel: string })[] };
  const req = (r: AiJsonRequest) => read(r) as Req;
  /** A fake AI that writes a new question each call, in the slot's range (see the laid-out tests above). */
  function newEach() {
    let c = 0;
    const onPage = new Map<string, number>();
    return (s: SlotAsked, r: Req, over: Record<string, unknown> = {}) => {
      const max = Math.min(10, ...Object.values(s.numbers ?? {}).map((n) => n.max));
      const pairs = Array.from({ length: max }, (_, a) => Array.from({ length: max }, (_, b) => [a + 1, b + 1] as const)).flat().filter(([a, b]) => a + b + 1 <= max);
      const key = `${r.day}:${r.page}`;
      const k = onPage.get(key) ?? 0;
      onPage.set(key, k + 1);
      const [a, b] = pairs[k % pairs.length];
      const n = c++;
      return goodItem(s, {
        text: `${NAMES[n % 20]} and ${NAMES[Math.floor(n / 20) % 20]} ${tag(n)} have ${a}. ${b} more come. How many now?`, operation: addOp(a, b),
        wrongAnswers: [{ value: num(a + b + 1), cause: "count", description: "Counts one too many.", step: null }],
        easier: { text: "Try a smaller sum.", operation: addOp(0, Math.min(a, b)) }, ...over,
      });
    };
  }
  async function book(ai: ReturnType<typeof fakeAiClient>, concurrency = 1) {
    const result = await generateWorkbook(laid, deps({ ai, concurrency }));
    if (result.status !== "stored") throw new Error(result.reason);
    return result.draft;
  }

  it("writes the book day by day: every call of a day comes before the next day's, even with pages at once", async () => {
    const write = newEach();
    const ai = fakeAiClient({ answer: (r) => fill(r, (s, q) => write(s, q as Req)) });
    await book(ai, 6);
    const days = ai.requests.filter((r) => r.name === "workbook_page").map((r) => req(r).day);
    expect(days).toEqual([...days].sort((a, b) => a - b));
  });

  it("tells each page what the book already asked on its skills, and sends a repeat to the redo with the reason", async () => {
    const write = newEach();
    let first: string | null = null;
    const ai = fakeAiClient({
      answer: (r) => fill(r, (s, q) => {
        const item = write(s, q as Req) as { text: string };
        if (r.name !== "workbook_page" || s.slot !== "1.1" || !("place" in s)) return item;
        // Every later page's question 1.1 asks the book's first question again, word for word.
        if (first === null) { first = item.text; return item; }
        return { ...item, text: first };
      }),
    });
    const draft = await book(ai);
    const asked = ai.requests.filter((r) => r.name === "workbook_page" && req(r).day > 1)
      .flatMap((r) => (JSON.parse((r.content[0] as { text: string }).text) as { slots: { asked?: string[] }[] }).slots.flatMap((s) => s.asked ?? []));
    expect(asked).toContain(first);
    const redo = ai.requests.filter((r) => r.name === "workbook_page_redo").map((r) => req(r).note ?? "");
    expect(redo.some((n) => n.includes("it repeats a question already asked on page 3"))).toBe(true);
    expect(redo.some((n) => n.includes("Write a different question"))).toBe(true);
    const texts = draft.pages.flatMap((p) => p.questions).filter((q) => q.check.status !== "failed").map((q) => q.package!.text);
    expect(new Set(texts).size).toBe(texts.length);
  });

  it("on a review place, fails a question that only changes one number of another on its page", async () => {
    const write = newEach();
    const ai = fakeAiClient({
      answer: (r) => fill(r, (s, q) => {
        const r2 = q as Req;
        if (r.name !== "workbook_page" || r2.day !== 1 || r2.page !== 1) return write(s, r2);
        // Day 1 page 1 (Already know it?): "What is 1 more than N?" on every card.
        const n = Number(s.slot.split(".")[1]);
        return write(s, r2, { text: `What is 1 more than ${n + 1}?`, operation: addOp(n + 1, 1), wrongAnswers: [{ value: num(n + 4), cause: "count", description: "Counts on too far.", step: null }] });
      }),
    });
    await book(ai);
    const note = req(ai.requests.find((r) => r.name === "workbook_page_redo" && req(r).day === 1 && req(r).page === 1)!).note!;
    expect(note).toContain("only by one number: ask another kind of question");
  });

  it("asks each panel for a worked example of its own skill and shows it, never a sum of another skill on the page", async () => {
    const write = newEach();
    const asked: { panel: string; skills: string[] }[] = [];
    const ai = fakeAiClient({
      answer: (r) => {
        for (const e of req(r).examples ?? []) asked.push({ panel: e.panel, skills: e.skills });
        // The examples are counts (dots of 2 and 2); the questions are additions.
        return { items: [...req(r).slots.map((s) => write(s, req(r))), ...(req(r).examples ?? []).map((e) => goodItem(e, {
          text: "How many dots?", format: "count", operation: null, easier: null, wrongAnswers: [], figure: "dots", numbers: [num(2), num(2)],
        }))] };
      },
    });
    const draft = await book(ai);
    expect(asked.length).toBeGreaterThan(0);
    expect(asked.every((e) => e.skills.length === 1 && ["worked-example", "watch-one", "reminder"].includes(e.panel))).toBe(true);
    const panels = draft.pages.flatMap((p) => (p.content?.kind === "day" ? p.content.blocks : [])).filter((b) => ["worked-example", "watch-one"].includes(b.slot));
    expect(panels.length).toBeGreaterThan(0);
    for (const b of panels) expect([...(b.lines ?? []), ...(b.methods ?? []).flatMap((m) => m.lines)]).toEqual(["Count them: 1, 2, 3, 4.", "There are [4]."]);
  });

  it("sends an answer that leaves out a slot once more, and keeps what both gave", async () => {
    const write = newEach();
    let calls = 0;
    const ai = fakeAiClient({
      answer: (r) => {
        const first = req(r).day === 1 && req(r).page === 1 && r.name === "workbook_page" && ++calls === 1;
        return fill(r, (s, q) => (first && s.slot === "1.2" ? undefined : write(s, q as Req)));
      },
    });
    const draft = await book(ai);
    expect(ai.requests.filter((r) => r.name === "workbook_page" && req(r).day === 1 && req(r).page === 1)).toHaveLength(2);
    expect(firstDayPage(draft).questions[1]).toMatchObject({ slot: "1.2", attempts: 1, check: { status: "checked" } });
  });

  it("shows the redo the questions its page keeps, and quotes the one a question repeats", async () => {
    const write = newEach();
    const ai = fakeAiClient({
      answer: (r) => fill(r, (s, q) => {
        const item = write(s, q as Req) as { text: string };
        // On day 1 page 1, question 2 is question 1 again, word for word.
        return r.name === "workbook_page" && req(r).day === 1 && req(r).page === 1 && s.slot === "1.2" ? { ...item, text: "Ava and Ava qa have 1. 1 more come. How many now?", operation: addOp(1, 1) } : item;
      }),
    });
    await book(ai);
    const redo = ai.requests.find((r) => r.name === "workbook_page_redo" && req(r).day === 1 && req(r).page === 1)!;
    expect(req(redo).note).toContain(`it is the same as question 1 on this page ("Ava and Ava qa have 1. 1 more come. How many now?")`);
    const asked = (JSON.parse((redo.content[0] as { text: string }).text) as { slots: { asked: string[] }[] }).slots[0].asked;
    expect(asked).toContain("Ava and Ava qa have 1. 1 more come. How many now?");
  });

  it("names the slots the AI answered when it leaves one out", async () => {
    const write = newEach();
    const ai = fakeAiClient({ answer: (r) => fill(r, (s, q) => (s.slot === "1.1" ? undefined : write(s, q as Req))) });
    const draft = await book(ai);
    const q = firstDayPage(draft).questions[0];
    expect(q.check.status === "failed" && q.check.reason).toMatch(/^the AI wrote nothing for this question \((it answered slots .*, not 1\.1|its answer held no items)\)$/);
    const first = ai.requests.find((r) => r.name === "workbook_page_redo")!;
    expect(req(first).note).toMatch(/Slot 1\.1 failed the check: the AI wrote nothing for this question \(it answered slots [\d., e]+, not 1\.1\)/);
  });
});

describe("items whose kind does not match their text (round 3)", () => {
  const place = { id: "q1", workbookId: WORKBOOK, page: 3, question: 1, level: 3, skills: ["K1-number-sequence"] };
  const base = { slot: "1.1", skill: "K1-number-sequence", difficulty: 1, operation: null, wrongAnswers: [], easier: null, shownWrong: null, figure: null, numbers: [], places: null, direction: null, sequence: null, pattern: null };
  const seq = (start: number, terms: number) => ({ start: num(start), step: num(1), terms, blanks: [2] });

  it("makes a count from one number to another a sequence with that start and end", () => {
    expect(buildQuestion({ ...base, text: "Count back from 10 to 1.", format: "draw" }, place).check).toMatchObject({ status: "failed", reason: expect.stringContaining("is a count: write it as the sequence format, from 10 to 1") });
    expect(buildQuestion({ ...base, text: "Count from 1 to 10. Start at 2.", format: "sequence", sequence: seq(2, 6) }, place).check).toMatchObject({ status: "failed", reason: "the text counts from 1 to 10, but the sequence goes from 2 to 7: make them the same" });
    expect(buildQuestion({ ...base, text: "Count from 2 to 7.", format: "sequence", sequence: seq(2, 6) }, place).check.status).toBe("checked");
    expect(buildQuestion({ ...base, text: "Start at 3. Fill the gaps.", format: "sequence", sequence: seq(2, 6) }, place).check).toMatchObject({ reason: "the text starts at 3, but the sequence starts at 2: make them the same" });
  });

  it("fails a question that gives its own answer, or adds 0 to hand one back", () => {
    const sum = (text: string, a: number, b: number) => buildQuestion({
      ...base, skill: "K5-take-away-change", text, format: "write-number", operation: addOp(a, b),
      wrongAnswers: [{ value: num(a + b + 1), cause: "count", description: "One too many.", step: null }], easier: { text: "Try a smaller sum.", operation: addOp(0, 1) },
    }, { ...place, skills: ["K5-take-away-change"] });
    expect(sum("Red 6, blue 4. How many red?", 6, 0).check).toMatchObject({ status: "failed", reason: expect.stringContaining("adding or taking away 0") });
    expect(sum("There are 7 cats: 3 and 4. How many?", 3, 4).check).toMatchObject({ status: "failed", reason: "the question gives its own answer (7) in its text: ask for it instead" });
    expect(sum("3 cats and 4 dogs. How many pets?", 3, 4).check.status).toBe("checked");
  });

  it("fails an order item whose text does not ask for an order", () => {
    const order = (text: string) => buildQuestion({ ...base, skill: "K1-order-numerals", text, format: "order", numbers: [num(4), num(7)], direction: "up" }, { ...place, skills: ["K1-order-numerals"] });
    expect(order("Which is more: 4 or 7?").check).toMatchObject({ status: "failed", reason: expect.stringContaining("an order item asks to put the numbers in order") });
    expect(order("Put 4 and 7 in order, least first.").check.status).toBe("checked");
  });

  it("keeps an order item at U1 to U3 to 4 numbers, the boxes its card has room for", () => {
    const order = (n: number) => buildQuestion({ ...base, skill: "K1-order-numerals", text: "Put in order, least first.", format: "order", numbers: Array.from({ length: n }, (_, i) => num(i + 2)), direction: "up" }, { ...place, skills: ["K1-order-numerals"] });
    expect(order(4).check.status).toBe("checked");
    expect(order(5).check).toMatchObject({ status: "failed", reason: expect.stringContaining("2 to 4 numbers") });
  });
});

describe("a count back (round 3)", () => {
  it("is a sequence from 10 down to 1 whose step of -1 is never printed, so no negative number fails it", async () => {
    const { rangeProblem } = await import("@/lib/workbook-book");
    const built = buildQuestion({
      slot: "1.1", skill: "K1-number-sequence", difficulty: 1, text: "Count back from 10 to 1.", format: "sequence", operation: null, wrongAnswers: [], easier: null,
      shownWrong: null, figure: null, numbers: [], places: null, direction: null, pattern: null, sequence: { start: num(10), step: num(-1), terms: 10, blanks: [3, 7] },
    }, { id: "q1", workbookId: WORKBOOK, page: 3, question: 1, level: 3, skills: ["K1-number-sequence"] });
    expect(built.check.status).toBe("checked");
    expect(rangeProblem(built.package!, BC, 3)).toBeNull();
  });
});

describe("the shorter rewrite and repeats (round 3)", () => {
  it("never keeps two shorter versions that are copies of each other on a review place", async () => {
    const U3 = planWorkbook({
      profile: { standards: [] }, grade: 0, level: planLevel(BC, "U3")!, passed: {}, workbook: { number: 1, inLevel: 0 },
      reviews: [], missedReviews: [], misses: [], pausedWeeks: 0, support: null, unassessedUnits: [],
    });
    if (!U3.ok) throw new Error(U3.reason);
    const NAMES = ["Ava", "Ben", "Cal", "Dot", "Eli", "Fay", "Gus", "Hal", "Ivy", "Jo", "Kai", "Liv"];
    let n = 0;
    let first = true;
    const ai = fakeAiClient({
      answer: (r) => fill(r, (s) => {
        const k = n++;
        // The shorter rewrite of day 1 page 1 writes "Ten-frame: 5 and N more. Add." on every card: one number apart.
        if (r.name === "workbook_page_shorter") { const b = Number(s.slot.split(".")[1]); return goodItem(s, { text: `Ten-frame: 5 and ${b} more. Add.`, operation: addOp(5, b - 1 > 4 ? 4 : b - 1 || 1), easier: { text: "Try a smaller sum.", operation: addOp(0, 1) }, wrongAnswers: [{ value: num(9), cause: "count", description: "x", step: null }] }); }
        return goodItem(s, { text: `${NAMES[k % 12]} and ${NAMES[Math.floor(k / 12) % 12]} ${tag(k)} have 2. 1 more come. How many now?`, operation: addOp(2, 1), easier: { text: "Try a smaller sum.", operation: addOp(0, 1) }, wrongAnswers: [{ value: num(4), cause: "count", description: "x", step: null }] });
      }),
    });
    const fit: FitCheck = { fits: async (p) => (p.number === 3 && first ? ((first = false), { ok: false, problems: [{ question: null, reason: "too long" }] }) : { ok: true }) };
    const result = await generateWorkbook({ ...input, plan: U3.plan, book: { child: "Zoe" } }, deps({ ai, fit }));
    if (result.status !== "stored") throw new Error(result.reason);
    const page = result.draft.pages[2];
    const kept = page.questions.filter((q) => q.check.status !== "failed").map((q) => q.package!.text);
    expect(kept.filter((t) => t.startsWith("Ten-frame: 5 and")).length).toBeLessThanOrEqual(1);
    // No two sound questions of the page are the same words with one number changed.
    const shape = (t: string) => t.replace(/\d+/g, "#");
    const sound = page.questions.filter((q) => q.check.status !== "failed").map((q) => q.package!.text);
    for (const [i, t] of sound.entries()) {
      for (const u of sound.slice(i + 1)) {
        const [a, b] = [t.match(/\d+/g) ?? [], u.match(/\d+/g) ?? []];
        expect(shape(t) === shape(u) && a.filter((x, k) => x !== b[k]).length <= 1, `${t} / ${u}`).toBe(false);
      }
    }
  });
});

describe("round 4 (#380): relations, explicit pictures, kinds in turn, question shapes", () => {
  const at = (skill: string, level = 3) => ({ id: "q1", workbookId: WORKBOOK, page: 3, question: 1, level, skills: [skill] });
  const empty = { difficulty: 1, operation: null, wrongAnswers: [], easier: null, shownWrong: null, figure: null, numbers: [], places: null, direction: null, sequence: null, pattern: null, relation: null, figureShows: null };
  const relation = (text: string, numbers: number[], rel: Record<string, unknown>, skill = "K3-benchmarks-5-10", over: Record<string, unknown> = {}) =>
    buildQuestion({ ...empty, slot: "1.1", skill, text, format: "relation", numbers: numbers.map(num), relation: rel, ...over }, at(skill));

  it("asks less than 5 before < and > are taught: the child circles a choice code writes, checked from the number", async () => {
    const { rangeProblem } = await import("@/lib/workbook-book");
    const seven = relation("Is 7 less than 5?", [7], { kind: "less-than", to: [5], labels: [] });
    expect(seven.check.status).toBe("checked");
    expect(seven.package!.item!.regions[0]).toMatchObject({ kind: "choice", mark: "circle", choices: ["less than 5", "not less than 5"], answer: "not less than 5" });
    expect(rangeProblem(seven.package!, BC, 3)).toBeNull();
    expect(relation("Is 3 less than 5?", [3], { kind: "less-than", to: [5], labels: [] }).package!.item!.regions[0]).toMatchObject({ answer: "less than 5" });
    expect(relation("Is 8 close to 0 or 10?", [8], { kind: "closer", to: [0, 10], labels: [] }).package!.item!.regions[0]).toMatchObject({ choices: ["close to 0", "close to 10"], answer: "close to 10" });
    expect(relation("Is 5 close to 0 or 10?", [5], { kind: "closer", to: [0, 10], labels: [] }).check).toMatchObject({ status: "failed", reason: "5 is halfway between 0 and 10: it is close to neither" });
    expect(relation("Equal or not?", [4, 4], { kind: "equal", to: [], labels: [] }, "K6-equal-sets").package!.item!.regions[0]).toMatchObject({ answer: "equal" });
    const more = relation("Mia has 6 cars. Ben has 9. Who has more?", [6, 9], { kind: "more", to: [], labels: ["Mia", "Ben"] }, "K2-compare-quantities");
    expect(more.package!.item!.regions[0]).toMatchObject({ choices: ["Mia", "Ben"], answer: "Ben" });
    expect(relation("Who has more?", [6, 6], { kind: "more", to: [], labels: ["Mia", "Ben"] }, "K2-compare-quantities").check.status).toBe("failed");
    // A dots picture of the number agrees; one of another number does not.
    expect(relation("Is it less than 5?", [7], { kind: "less-than", to: [5], labels: [] }, "K3-benchmarks-5-10", { figure: "dots" }).check.status).toBe("checked");
  });

  it("refuses a stored relation whose answer is not what its numbers give", async () => {
    const { checkQuestionPackage } = await import("@/lib/question-package");
    const seven = relation("Is 7 less than 5?", [7], { kind: "less-than", to: [5], labels: [] }).package!;
    const wrong = structuredClone(seven);
    (wrong.item!.regions[0] as { answer: string }).answer = "less than 5";
    expect(checkQuestionPackage(wrong)).toMatchObject({ status: "failed", reason: `the region "answer" holds less than 5, but the answer is not less than 5` });
  });

  it("draws a missing part's picture as the item says (the text's number first, else figureShows), and fails one that is not said", () => {
    const missing = (part: number, total: number) => ({ kind: "missing-addend", operands: [num(part), num(total)], expression: null, unit: null, denominator: null, values: [] });
    const item = (text: string, shows: unknown) => buildQuestion({
      ...empty, slot: "1.1", skill: "K3-ten-frame", text, format: "write-number", operation: missing(5, 8), figure: "ten-frame", figureShows: shows,
      wrongAnswers: [{ value: num(8), cause: "total", description: "Writes the total.", step: null }], easier: { text: "Try a smaller sum.", operation: missing(5, 7) },
    }, at("K3-ten-frame"));
    expect(item("Ten-frame: 8 dots. 5 and how many more?", "total").package!.item!.figure).toEqual({ kind: "ten-frame", counters: [8] });
    expect(item("Mia has 5. How many more make 8?", "part").package!.item!.figure).toEqual({ kind: "ten-frame", counters: [5] });
    // The text says 8 dots: the picture shows 8, whatever figureShows says.
    expect(item("Ten-frame: 8 dots. 5 and how many more?", "part").package!.item!.figure).toEqual({ kind: "ten-frame", counters: [8] });
    expect(item("Ten-frame: 5 dots. How many more make 8?", "total").package!.item!.figure).toEqual({ kind: "ten-frame", counters: [5] });
    expect(item("Mia has 5. How many more make 8?", null).check).toMatchObject({ status: "failed", reason: expect.stringContaining("say what the picture of a missing part shows") });
    // Another sum: a number the text says the picture shows must be what it shows.
    const sum = (text: string) => buildQuestion({
      ...empty, slot: "1.1", skill: "K3-ten-frame", text, format: "write-number", operation: addOp(5, 2), figure: "ten-frame",
      wrongAnswers: [{ value: num(8), cause: "count", description: "x", step: null }], easier: { text: "Try a smaller sum.", operation: addOp(1, 1) },
    }, at("K3-ten-frame"));
    expect(sum("Ten-frame: 5 dots and 2 more. How many?").check.status).toBe("checked");
    expect(sum("Ten-frame: 9 dots. How many?").check).toMatchObject({ status: "failed", reason: expect.stringContaining("the text says the picture shows 9, but it shows 5 and 2") });
  });

  it("repairs what code can: a missing part's step and its easier example; a parent card's show-work is write-number", () => {
    const missing = (part: number, total: number) => ({ kind: "missing-addend", operands: [num(part), num(total)], expression: null, unit: null, denominator: null, values: [] });
    const b = buildQuestion({
      ...empty, slot: "1.1", skill: "K3-make-10", text: "Ben has 9. How many more make 10?", format: "show-work", operation: missing(9, 10),
      wrongAnswers: [{ value: num(10), cause: "total", description: "Writes the total.", step: "ones" }], easier: { text: "Try 8.", operation: missing(8, 10) },
    }, at("K3-make-10"));
    expect(b.check.status).toBe("checked");
    expect(b.package!.item!.format).toBe("write-number");
    expect(b.package!.wrongAnswers[0].step).toBeNull();
    expect(b.package!.easierExample!.operation).toEqual({ kind: "missing-addend", operands: [9, 9] });
  });

  it("fails a draw item that asks for a number or a name instead of a drawing", () => {
    const draw = (text: string) => buildQuestion({ ...empty, slot: "1.1", skill: "K1-count-out", text, format: "draw" }, at("K1-count-out"));
    expect(draw("Draw 7 dots.").check.status).toBe("not-checked");
    expect(draw("Draw 7 dots. How many did you draw?").check).toMatchObject({ status: "failed", reason: expect.stringContaining("asks for no number or name") });
    expect(draw("Sam has 6 cars. Mia has 9. Who has more?").check).toMatchObject({ status: "failed", reason: expect.stringContaining("asks the child to draw") });
  });

  it("chooses each slot's kind in turn for its skill, and sends it with what the kind means", async () => {
    const U3 = planWorkbook({
      profile: { standards: [] }, grade: 0, level: planLevel(BC, "U3")!, passed: {}, workbook: { number: 1, inLevel: 0 },
      reviews: [], missedReviews: [], misses: [], pausedWeeks: 0, support: null, unassessedUnits: [],
    });
    if (!U3.ok) throw new Error(U3.reason);
    const ai = fakeAiClient({ answer: () => ({ items: [] }) });
    await generateWorkbook({ ...input, plan: U3.plan, book: { child: "Zoe" } }, deps({ ai }));
    type Aimed = { slot: string; place: string; aim?: { skill: string; kind: string; means: string; orElse: string[] } };
    const slots = ai.requests.filter((r) => r.name === "workbook_page").flatMap((r) => (JSON.parse((r.content[0] as { text: string }).text) as { slots: Aimed[] }).slots);
    const aimed = slots.filter((s) => s.aim);
    expect(aimed.length).toBeGreaterThan(50);
    expect(slots.filter((s) => s.place === "spot-the-error").every((s) => !s.aim)).toBe(true);
    for (const skill of new Set(aimed.map((s) => s.aim!.skill))) {
      const kinds = aimed.filter((s) => s.aim!.skill === skill).map((s) => s.aim!.kind);
      if (kinds.length >= 2 && new Set(kindsOf(BC.skill(skill)?.text ?? skill)).size > 1) expect(new Set(kinds).size, skill).toBeGreaterThan(1);
    }
    expect(kindsOf(BC.skill("K3-benchmarks-5-10")!.text)[0]).toBe("relation");
    expect(aimed.find((s) => s.aim!.kind === "relation")!.aim!.means).toContain("circles one of two choices");
  });

  it("knows a question's shape without its numbers and names, and fails a shape the book asks too often", async () => {
    expect(shapeOf("Mia has 3. How many more make 10?")).toBe(shapeOf("Ben has 6. How many more make 9?"));
    expect(shapeOf("Mia has 3. How many more make 10?")).not.toBe(shapeOf("Mia has 3 cars. 2 drive off. How many are left?"));
    const U3 = planWorkbook({
      profile: { standards: [] }, grade: 0, level: planLevel(BC, "U3")!, passed: {}, workbook: { number: 1, inLevel: 0 },
      reviews: [], missedReviews: [], misses: [], pausedWeeks: 0, support: null, unassessedUnits: [],
    });
    if (!U3.ok) throw new Error(U3.reason);
    const missing = (part: number, total: number) => ({ kind: "missing-addend", operands: [num(part), num(total)], expression: null, unit: null, denominator: null, values: [] });
    let n = 0;
    // Every question: "<Name> <tag> has 2. How many more make 5?" on a new name: one shape, a new question each time.
    const ai = fakeAiClient({
      answer: (r) => fill(r, (s) => {
        const k = n++;
        // A new sum on each slot of a page (2 + ? = 4 to 9), so only the shape repeats.
        const total = 4 + (Number(s.slot.split(".")[1]) % 6);
        return goodItem(s, { text: `Kid${tag(k).toUpperCase()} has 2. How many more make ${total}?`, operation: missing(2, total), easier: { text: "Try a smaller sum.", operation: missing(2, 3) }, wrongAnswers: [{ value: num(total), cause: "total", description: "x", step: null }] });
      }),
    });
    const result = await generateWorkbook({ ...input, plan: U3.plan, book: { child: "Zoe" } }, deps({ ai }));
    if (result.status !== "stored") throw new Error(result.reason);
    const shaped = result.draft.pages.flatMap((p) => p.questions).filter((q) => q.check.status !== "failed" && q.place && !["warm-up", "finish-these", "on-your-own", "practice-row", "unit-b-practice", "now-you"].includes(q.place));
    expect(shaped.length).toBeLessThanOrEqual(3);
    const notes = ai.requests.filter((r) => r.name === "workbook_page_redo").map((r) => read(r).note ?? "");
    expect(notes.some((x) => /asks the same kind of question as question \d+ on this page/.test(x))).toBe(true);
    expect(notes.some((x) => /the book already asks this kind of question 3 times \(pages /.test(x))).toBe(true);
    // A repeat's redo is told the slot's next kind, and later pages are told the shapes used up.
    expect(notes.some((x) => /Write it as an? [a-z-]+ question: /.test(x))).toBe(true);
    const usedUp = ai.requests.flatMap((r) => (JSON.parse((r.content[0] as { text: string }).text) as { usedUp?: string[] }).usedUp ?? []);
    expect(usedUp.some((t) => /^Kid[A-Z]+ has 2\. How many more make \d+\?$/.test(t))).toBe(true);
  });
});

describe("a panel of a relation skill (round 4)", () => {
  it("works its own relation example: 'Is 7 less than 5? 7 comes after 5: not less than 5.'", async () => {
    const U3 = planWorkbook({
      profile: { standards: [] }, grade: 0, level: planLevel(BC, "U3")!, passed: {}, workbook: { number: 1, inLevel: 0 },
      reviews: [], missedReviews: [], misses: [], pausedWeeks: 0, support: null, unassessedUnits: [],
    });
    if (!U3.ok) throw new Error(U3.reason);
    let n = 0;
    const ai = fakeAiClient({
      answer: (r) => {
        const b = JSON.parse((r.content[0] as { text: string }).text) as { slots: SlotAsked[]; examples?: (SlotAsked & { aim: { kind: string } })[] };
        return {
          items: [
            ...b.slots.map((s) => goodItem(s, { text: `Kid${tag(n).toUpperCase()} ${tag(n++)} has 2. 1 more come. How many now?`, operation: addOp(2, 1), easier: { text: "Try a smaller sum.", operation: addOp(0, 1) }, wrongAnswers: [{ value: num(4), cause: "count", description: "x", step: null }] })),
            ...(b.examples ?? []).map((e) => (e.aim.kind === "relation"
              ? { slot: e.slot, skill: e.skills[0], difficulty: 1, text: "Is 7 less than 5?", format: "relation", operation: null, wrongAnswers: [], easier: null, shownWrong: null, figure: null, numbers: [num(7)], places: null, direction: null, sequence: null, pattern: null, relation: { kind: "less-than", to: [5], labels: [] }, figureShows: null }
              : goodItem(e, { text: "2 + 1 = ?", operation: addOp(2, 1), easier: { text: "Try a smaller sum.", operation: addOp(0, 1) }, wrongAnswers: [{ value: num(4), cause: "count", description: "x", step: null }] }))),
          ],
        };
      },
    });
    const result = await generateWorkbook({ ...input, plan: U3.plan, book: { child: "Zoe" } }, deps({ ai }));
    if (result.status !== "stored") throw new Error(result.reason);
    const page = result.draft.pages.find((p) => p.content?.kind === "day" && p.content.topic === BC.skillSteps("K3-benchmarks-5-10")?.[0]?.name && p.content.blocks.some((x) => x.slot === "watch-one"))
      ?? result.draft.pages.find((p) => p.content?.kind === "day" && p.content.blocks.some((x) => x.slot === "watch-one" && (x.lines ?? []).some((l) => l.includes("less than 5"))));
    const watch = page!.content!.kind === "day" ? page!.content!.blocks.find((x) => x.slot === "watch-one")! : null;
    expect(watch).toMatchObject({ label: "7", lines: ["Is 7 less than 5?", "7 comes after 5: [not less than 5]."] });
  });
});
