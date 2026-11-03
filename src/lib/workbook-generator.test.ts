import { describe, expect, it } from "vitest";
import type { AiJsonRequest } from "@/lib/ai-client";
import { fakeAiClient } from "@/lib/ai-client-fake";
import { keySolver, type SolveLog, type Solver, type SolveVerdict } from "@/lib/workbook-solve-check";
import { fakePrintEngine } from "@/lib/print-engine-fake";
import { operationResult } from "@/lib/question-package";
import { memoryDraftStore } from "@/lib/workbook-draft-memory";
import { renderFitCheck } from "@/lib/workbook-fit";
import { curriculumFor } from "@/lib/workbook-curriculum";
import { bookOutline, generateWorkbook, kindsOf, ResumeMismatch, shapeOf, type FitCheck, type GenerateDeps, type GeneratedPage, type GeneratedWorkbook, type StoredCall } from "@/lib/workbook-generator";
import { planLevel, planWorkbook, type WorkbookPlan } from "@/lib/workbook-plan";
import { skillRange } from "@/lib/workbook-book";
import { buildQuestion, choiceAsked, pictureProblem, type SlotWording } from "@/lib/workbook-generator-items";
import { aiTextProblem } from "@/lib/number-words";
import { FRAMES, storyProblem } from "@/lib/workbook-wording";
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
    solver: keySolver(),
    ...over,
  } as GenerateDeps & { store: ReturnType<typeof memoryDraftStore> };
}

async function generate(d = deps()): Promise<GeneratedWorkbook> {
  const result = await generateWorkbook(input, d);
  if (result.status !== "stored") throw new Error(result.status === "refused" ? result.reason : "paused");
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
    expect(draft.pages[backCover - 1].type).toBe("blank");
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

  it("leaves out the last optional drill when the fit check names none", async () => {
    const total = DAY_PAGES[0].parts.reduce((n, p) => n + p.items, 0);
    const fit: FitCheck = { fits: async (page) => (page.number === 3 && page.questions.length === total ? { ok: false, problems: [{ question: null, reason: "the slot runs past" }] } : { ok: true }) };
    const page = (await generate(deps({ fit }))).pages[2];
    expect(page.questions).toHaveLength(total - 1);
    const part = DAY_PAGES[0].parts.findLast(p => ["practice", "warm-up", "remember-these"].includes(p.kind) && p.items > 0)!;
    const lastSlot = `${DAY_PAGES[0].parts.indexOf(part) + 1}.${part.items}`;
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
    // A whole-number sum is printed with its numbers (the text names what the operation works, round 6).
    const o = operation as { kind: string; operands: { type: string; value: number }[] };
    const sign = ({ subtract: "-", divide: "÷", multiply: "×" } as Record<string, string>)[o.kind];
    const text = sign && o.operands.every((x) => x.type === "number") ? `${o.operands[0].value} ${sign} ${o.operands[1].value} = ?` : "Solve.";
    const ai = fakeAiClient({ answer: (r) => fill(r, (s) => (s.slot === "1.1" ? goodItem(s, { text, operation, wrongAnswers, easier: { text: "Try this first.", operation: easier } }) : goodItem(s))) });
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

describe("pages in parallel (#312)", () => {
  it("writes at most `concurrency` pages at a time and makes the same draft as one at a time", async () => {
    let inFlight = 0;
    let most = 0;
    const ai = fakeAiClient({
      answer: async (r) => {
        inFlight++;
        most = Math.max(most, inFlight);
        await new Promise((done) => setTimeout(done, 1));
        inFlight--;
        return fill(r);
      },
    });
    const parallel = await generate(deps({ ai, concurrency: 5 }));
    expect(most).toBe(5);
    const serial = await generate(deps());
    expect(parallel.pages).toEqual(serial.pages);
  });

  it("keeps two AI attempts a question when pages run in parallel", async () => {
    // Every first call fails slot 1.1; the redo fails it again: two attempts, never a third.
    const bad = (s: SlotAsked) => goodItem(s, { wrongAnswers: [{ value: num(425), cause: "O3", description: "Right by mistake.", step: null }] });
    const asked = new Map<string, number>();
    const ai = fakeAiClient({
      answer: (r) => fill(r, (s, req) => {
        const key = `${req.day}:${req.pageType}:${s.slot}`;
        asked.set(key, (asked.get(key) ?? 0) + 1);
        return s.slot === "1.1" ? bad(s) : goodItem(s);
      }),
    });
    const draft = await generate(deps({ ai, concurrency: 6 }));
    const first = draft.pages.flatMap((p) => p.questions.filter((q) => q.slot === "1.1"));
    expect(first.length).toBeGreaterThan(0);
    expect(first.every((q) => q.check.status === "failed" && q.attempts === 2)).toBe(true);
    // Each page: its first call, then one redo; the fit check passes, so no page retry.
    expect(ai.requests.length).toBe(2 * draft.pages.filter((p) => p.questions.some((q) => q.slot === "1.1")).length
      + draft.pages.filter((p) => p.questions.length > 0 && !p.questions.some((q) => q.slot === "1.1")).length);
  });

  it("with an attempt ledger of 2, writes no question a third time: the shorter rewrite asks only those with an attempt left", async () => {
    const bad = (s: SlotAsked) => goodItem(s, { wrongAnswers: [{ value: num(425), cause: "O3", description: "Right by mistake.", step: null }] });
    const ai = fakeAiClient({ answer: (r) => fill(r, (s) => (s.slot === "1.1" && r.name === "workbook_page" ? bad(s) : goodItem(s))) });
    // Every page fails its first fit check, then fits.
    const checked = new Map<number, number>();
    const fit: FitCheck = { fits: async (p) => {
      checked.set(p.number, (checked.get(p.number) ?? 0) + 1);
      return checked.get(p.number) === 1 ? { ok: false, problems: [{ question: null, reason: "too tall" }] } : { ok: true };
    } };
    const counts = new Map<string, number>();
    const attempts = {
      max: 2,
      load: async () => new Map(counts),
      use: async (page: number, slots: string[]) => {
        const refused = slots.filter((x) => (counts.get(`${page}:${x}`) ?? 0) >= 2);
        for (const x of slots) if (!refused.includes(x)) counts.set(`${page}:${x}`, (counts.get(`${page}:${x}`) ?? 0) + 1);
        return { refused };
      },
    };
    const draft = await generate(deps({ ai, fit, attempts }));
    expect(Math.max(...counts.values())).toBe(2);
    const shorter = ai.requests.filter((r) => r.name === "workbook_page_shorter").map(read);
    expect(shorter.length).toBeGreaterThan(0);
    expect(shorter.every((r) => !r.slots.some((x) => x.slot === "1.1"))).toBe(true);
    // 1.1 keeps its redo (sound, 2 attempts); the others were rewritten shorter (2 attempts).
    const q = firstDayPage(draft).questions;
    expect(q.find((x) => x.slot === "1.1")).toMatchObject({ attempts: 2, check: { status: "checked" } });
    expect(q.every((x) => x.attempts === 2)).toBe(true);
  });

  it("resumes from its page store: a kept page is not written again", async () => {
    const kept = new Map<number, GeneratedPage>();
    const pages = { load: async () => [...kept.values()], save: async (p: GeneratedPage) => { kept.set(p.number, p); } };
    let started = 0;
    const paused = await generateWorkbook(input, deps({ pages, concurrency: 2, stop: () => started++ >= 6 }));
    expect(paused).toEqual({ status: "paused", done: kept.size, total: DAY_PAGES.length });
    expect(kept.size).toBeGreaterThan(0);
    const ai = fakeAiClient({ answer: (r) => fill(r) });
    const result = await generateWorkbook(input, deps({ ai, pages, concurrency: 2 }));
    if (result.status !== "stored") throw new Error(result.status === "refused" ? result.reason : result.status);
    expect(ai.requests.length).toBe(DAY_PAGES.length - (paused as { done: number }).done);
    for (const p of kept.values()) expect(result.draft.pages[p.number - 1]).toEqual(p);
  });

  it("makes the same laid-out book (with the book memory) at any concurrency, and after a pause in the middle of a day", async () => {
    const U3 = planWorkbook({
      profile: { standards: [] }, grade: 0, level: planLevel(BC, "U3")!, passed: {}, workbook: { number: 1, inLevel: 0 },
      reviews: [], missedReviews: [], misses: [], pausedWeeks: 0, support: null, unassessedUnits: [],
    });
    if (!U3.ok) throw new Error(U3.reason);
    const laid = { ...input, plan: U3.plan, book: { child: "Zoe" } };
    // An AI whose answer depends only on what it is asked (never on the order of calls): a repeat of the book or of
    // the day's pages before it shows only through the memory each request carries.
    const hash = (t: string) => [...t].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
    const answer = (r: AiJsonRequest) => fill(r, (s) => {
      const max = Math.min(10, ...Object.values(s.numbers ?? {}).map((n) => n.max));
      const h = hash(`${(r.content[0] as { text: string }).text}|${s.slot}`);
      const b = max >= 5 ? 2 : 1;
      const a = 1 + (h % Math.max(1, max - b - 1));
      return goodItem(s, {
        text: `Kim ${tag(h % 40)} has ${a}. ${b} more come. How many now?`, operation: addOp(a, b),
        wrongAnswers: [{ value: num(a + b + 1), cause: "count", description: "Counts one too many.", step: null }],
        easier: { text: "Try a smaller sum.", operation: addOp(0, Math.min(a, b)) },
      });
    });
    const run = (over: Partial<GenerateDeps>) => generateWorkbook(laid, deps({ ai: fakeAiClient({ answer: async (r) => {
      await new Promise((done) => setTimeout(done, hash(JSON.stringify(r.content)) % 3));
      return answer(r);
    } }), ...over }));
    // Tokens are random in live use: a resumed run makes new ones for the pages it writes.
    const pagesOf = (r: Awaited<ReturnType<typeof generateWorkbook>>) => {
      if (r.status !== "stored") throw new Error(r.status === "refused" ? r.reason : r.status);
      return r.draft.pages.map((p) => ({ ...p, qrToken: "" }));
    };
    const one = pagesOf(await run({ concurrency: 1 }));
    expect(pagesOf(await run({ concurrency: 5 }))).toEqual(one);

    const kept = new Map<number, GeneratedPage>();
    const pages = { load: async () => [...kept.values()], save: async (p: GeneratedPage) => { kept.set(p.number, p); } };
    let started = 0;
    const paused = await run({ pages, concurrency: 3, stop: () => started++ >= 5 });
    expect(paused.status).toBe("paused");
    const days = new Set([...kept.values()].map((p) => p.day));
    const firstDay = one.filter((p) => p.day === 1).length;
    expect(kept.size).toBeLessThan(firstDay);
    expect(days).toEqual(new Set([1]));
    expect(pagesOf(await run({ pages, concurrency: 4 }))).toEqual(one);
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
    if (result.status !== "stored") throw new Error(result.status === "refused" ? result.reason : result.status);
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
    // A parent-led card holds 3 lines of about 26 letters (D-201: no read-aloud mark, a story in full sentences);
    // Spot the error, the sum only.
    expect(slots.find((s) => s.place === "already-know-it")!.room).toEqual({ characters: 70, perLine: 26, lines: 3 });
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
    // A writer that gives an earlier page's sum again fails as a repeat (the task is its operation, #482 review).
    expect(qs.filter((q) => q.check.status === "failed").every((q) => /repeats a question|same sum as question|same task as question/.test((q.check as { reason: string }).reason))).toBe(true);
    // (This writer gives every kind of slot a missing part, so at U3's small numbers many sums come back.)
    expect(qs.filter((q) => q.check.status !== "failed").length).toBeGreaterThan(0);
    expect(qs.filter((q) => q.check.status !== "failed").every((q) => {
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
    const write = writer((who, a, b) => ({ text: `Mia ${who} has dots. How many dots?`, format: "count", operation: null, easier: null, wrongAnswers: [], figure: "dots", numbers: [num(a), num(b)] }));
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
    // At U3 code prints its own wording of the sum (round 7): the AI's yes-or-no text is never printed, so no redo.
    const write = adds();
    const ai = fakeAiClient({
      answer: (r) => fill(r, (s, q) => (r.name === "workbook_page" && s.slot === "1.1" && q.day === 1 && q.page === 1 ? write(s, q, { text: "Is 3 close to 5 or less than 2?" }) : write(s, q))),
    });
    const draft = await laidOut(deps({ ai }));
    expect(firstDayPage(draft).questions[0]).toMatchObject({ attempts: 1, check: { status: "checked" } });
    expect(firstDayPage(draft).questions[0].package!.text).not.toMatch(/close|less than/);
    // At U10 the AI's text is printed: a yes-or-no question with an operation fails, with the reason for the redo.
    const at10 = buildQuestion({ ...goodItem({ slot: "1.1", skills: ["K5-take-away-change"] }), text: "Is 3 close to 5 or less than 2?", operation: addOp(3, 2), easier: { text: "1 + 1 = ?", operation: addOp(1, 1) } },
      { id: "q", workbookId: WORKBOOK, page: 3, question: 1, level: 10, skills: ["K5-take-away-change"] });
    expect(at10.check).toMatchObject({ status: "failed", reason: expect.stringContaining("the question asks yes or no, but its answer is the operation's number") });
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
      return ai.requests.filter((r) => r.name === "workbook_page").flatMap((r) => (JSON.parse((r.content[0] as { text: string }).text) as { slots: { vary?: number; planned?: { numbers?: number[] }; numbers: Record<string, { max: number }> }[] }).slots)
        // A slot with planned numbers (round 5) takes them instead.
        .filter((s) => !s.planned?.numbers);
    };
    const slots = await run();
    expect(slots.length).toBeGreaterThan(10);
    expect(slots.every((s) => s.vary! >= 1 && s.vary! <= Math.min(...Object.values(s.numbers).map((n) => n.max)))).toBe(true);
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
  function newEach(kind: "add" | "count" = "add") {
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
      // A count prints the AI's words at U3 (round 7: code words a sum there), so its repeats are the AI's.
      if (kind === "count") return goodItem(s, { text: `${NAMES[n % 20]} ${tag(n)} has dots. How many dots?`, format: "count", operation: null, easier: null, wrongAnswers: [], figure: "dots", numbers: [num(a), num(b)], ...over });
      return goodItem(s, {
        // Within a card's room (41 characters): a longer text goes to the redo to be written shorter (round 5).
        text: `${NAMES[n % 20]} ${tag(n)} has ${a}. ${b} more come. How many?`, operation: addOp(a, b),
        wrongAnswers: [{ value: num(a + b + 1), cause: "count", description: "Counts one too many.", step: null }],
        easier: { text: "Try a smaller sum.", operation: addOp(0, Math.min(a, b)) }, ...over,
      });
    };
  }
  async function book(ai: ReturnType<typeof fakeAiClient>, concurrency = 1) {
    const result = await generateWorkbook(laid, deps({ ai, concurrency }));
    if (result.status !== "stored") throw new Error(result.status === "refused" ? result.reason : result.status);
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
    const write = newEach("count");
    let first: string | null = null;
    let firstItem: Record<string, unknown> | null = null;
    const ai = fakeAiClient({
      answer: (r) => fill(r, (s, q) => {
        const item = write(s, q as Req) as { text: string };
        if (r.name !== "workbook_page" || s.slot !== "1.1" || !("place" in s)) return item;
        // Every later page's question 1.1 asks the book's first question again, word for word, on the same dots.
        if (first === null) { first = item.text; firstItem = item; return item; }
        return { ...firstItem, slot: s.slot, skill: s.skills[0] };
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
        // Day 1 page 1 (Already know it?): "Count on from N. Fill in the boxes." on every card (a sequence: its words
        // are the AI's at U3; a sum's are code's, round 7).
        const n = Number(s.slot.split(".")[1]);
        return write(s, r2, {
          text: `Count on from ${n + 1}. Fill in the boxes.`, format: "sequence", operation: null, easier: null, wrongAnswers: [],
          sequence: { start: num(n + 1), step: num(1), terms: 4, blanks: [2] },
        });
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
          text: "Mia draws dots. How many dots?", format: "count", operation: null, easier: null, wrongAnswers: [], figure: "dots", numbers: [num(2), num(2)],
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
        return r.name === "workbook_page" && req(r).day === 1 && req(r).page === 1 && s.slot === "1.2" ? { ...item, text: "Ava qa has 1. 1 more come. How many?", operation: addOp(1, 1) } : item;
      }),
    });
    const draft = await book(ai);
    // Code words both (round 7): question 2 works question 1's sum, which the redo is told, quoting question 1 as printed.
    const q1 = firstDayPage(draft).questions[0].package!.text;
    const redo = ai.requests.find((r) => r.name === "workbook_page_redo" && req(r).day === 1 && req(r).page === 1)!;
    expect(req(redo).note).toContain(`it works the same sum as question 1 on this page ("${q1}")`);
    const asked = (JSON.parse((redo.content[0] as { text: string }).text) as { slots: { asked: string[] }[] }).slots[0].asked;
    expect(asked).toContain(q1);
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
    }, { ...place, level, skills: ["K5-take-away-change"] });
    let level = 10;
    expect(sum("Red 6, blue 4. How many red?", 6, 0).check).toMatchObject({ status: "failed", reason: expect.stringContaining("adding or taking away 0") });
    expect(sum("There are 7 cats: 3 and 4. How many?", 3, 4).check).toMatchObject({ status: "failed", reason: "the question gives its own answer (7) in its text: ask for it instead" });
    expect(sum("Mia has 3 cats. She gets 4 more. How many cats does she have now?", 3, 4).check.status).toBe("checked");
    // At U3 code writes the text from the sum (round 7): never the answer, and adding 0 still fails.
    level = 3;
    const coded = sum("There are 7 cats: 3 and 4. How many?", 3, 4);
    expect(coded.check.status).toBe("checked");
    expect(coded.package!.text).not.toMatch(/\b7\b/);
    expect(sum("Red 6, blue 4. How many red?", 6, 0).check).toMatchObject({ status: "failed", reason: expect.stringContaining("adding or taking away 0") });
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
    if (result.status !== "stored") throw new Error(result.status === "refused" ? result.reason : result.status);
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
    // At U10, where the AI's text is printed (code words a sum at U1 to U9, round 7).
    const item = (text: string, shows: unknown, level = 10) => buildQuestion({
      ...empty, slot: "1.1", skill: "K3-ten-frame", text, format: "write-number", operation: missing(5, 8), figure: "ten-frame", figureShows: shows,
      wrongAnswers: [{ value: num(8), cause: "total", description: "Writes the total.", step: null }], easier: { text: "Try a smaller sum.", operation: missing(5, 7) },
    }, at("K3-ten-frame", level));
    // At U3 code's wording follows the picture: one that shows the part given (unless the item says the total).
    const coded = item("Ten-frame: 8 dots. 5 and how many more?", null, 3);
    expect(coded.check.status).toBe("checked");
    expect(coded.package!.item!.figure).toEqual({ kind: "ten-frame", counters: [5] });
    expect(coded.package!.text).toMatch(/\b5\b/);
    expect(coded.package!.text).toMatch(/\b8\b/);
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
    }, at("K3-ten-frame", 10));
    expect(sum("Mia has 5 dots on a ten-frame. She adds 2. How many dots now?").check.status).toBe("checked");
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
    // At U10, where the AI's words are printed (round 7: code words a sum at U1 to U9 and prints its least used shape).
    const U3 = planWorkbook({
      profile: { standards: [] }, grade: 3, level: planLevel(BC, "U10")!, passed: {}, workbook: { number: 1, inLevel: 0 },
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
    if (result.status !== "stored") throw new Error(result.status === "refused" ? result.reason : result.status);
    // Of the AI's shape (a repeat whose item is the planned one may take code's planned wording instead, round 6).
    const shaped = result.draft.pages.flatMap((p) => p.questions).filter((q) => q.check.status !== "failed" && q.place && !["warm-up", "finish-these", "on-your-own", "practice-row", "unit-b-practice", "now-you"].includes(q.place)
      && shapeOf(q.package!.text) === "has many more make");
    expect(shaped.length).toBeLessThanOrEqual(3);
    const notes = ai.requests.filter((r) => r.name === "workbook_page_redo").map((r) => read(r).note ?? "");
    expect(notes.some((x) => /asks the same kind of question as question \d+ on this page/.test(x))).toBe(true);
    expect(notes.some((x) => /the book already asks this kind of question 3 times \(pages /.test(x))).toBe(true);
    // A repeat's redo is told the slot's next kind, and later pages are told the shapes used up.
    expect(notes.some((x) => /Write it as an? [a-z-]+ question: /.test(x))).toBe(true);
    const usedUp = ai.requests.flatMap((r) => (JSON.parse((r.content[0] as { text: string }).text) as { usedUp?: { example: string; words: string }[] }).usedUp ?? []);
    expect(usedUp.some((t) => /^Kid[A-Z]+ has 2\. How many more make \d+\?$/.test(t.example) && t.words === "has many more make")).toBe(true);
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
    if (result.status !== "stored") throw new Error(result.status === "refused" ? result.reason : result.status);
    const page = result.draft.pages.find((p) => p.content?.kind === "day" && p.content.topic === BC.skillSteps("K3-benchmarks-5-10")?.[0]?.name && p.content.blocks.some((x) => x.slot === "watch-one"))
      ?? result.draft.pages.find((p) => p.content?.kind === "day" && p.content.blocks.some((x) => x.slot === "watch-one" && (x.lines ?? []).some((l) => l.includes("less than 5"))));
    const watch = page!.content!.kind === "day" ? page!.content!.blocks.find((x) => x.slot === "watch-one")! : null;
    expect(watch).toMatchObject({ label: "Less than 5?", lines: ["Is 7 less than 5?", "7 comes after 5: [not less than 5]."] });
  });
});

describe("round 5 (#380): code plans the book's numbers and names, rooms and rows", () => {
  const U3 = (() => {
    const result = planWorkbook({
      profile: { standards: [] }, grade: 0, level: planLevel(BC, "U3")!, passed: {}, workbook: { number: 1, inLevel: 0 },
      reviews: [], missedReviews: [], misses: [], pausedWeeks: 0, support: null, unassessedUnits: [],
    });
    if (!result.ok) throw new Error(result.reason);
    return result.plan;
  })();
  const laid = { ...input, plan: U3, book: { child: "Zoe" } };
  type Planned = SlotAsked & { place: string; aim?: { skill: string; kind: string }; planned?: { numbers?: number[]; name?: string; say?: string } };
  const body = (r: AiJsonRequest) => JSON.parse((r.content[0] as { text: string }).text) as { day: number; page: number; slots: Planned[]; note: string | null; examples?: SlotAsked[] };
  const empty = { difficulty: 1, operation: null, wrongAnswers: [], easier: null, shownWrong: null, figure: null, numbers: [], places: null, direction: null, sequence: null, pattern: null, relation: null, figureShows: null };
  /** A new short sum each call (within a card's room), tagged so each question has a shape of its own. */
  function short() {
    let c = 0;
    return (s: SlotAsked, over: Record<string, unknown> = {}) => {
      const n = c++;
      const [a, b] = [1 + (n % 4), 1 + (Math.floor(n / 4) % 4)];
      return goodItem(s, {
        text: `Ava ${tag(n)} has ${a}. ${b} more. How many?`, operation: addOp(a, b),
        wrongAnswers: [{ value: num(a + b + 1), cause: "count", description: "Counts one too many.", step: null }],
        easier: { text: "Try a smaller sum.", operation: addOp(0, Math.min(a, b)) }, ...over,
      });
    };
  }
  async function book(ai: ReturnType<typeof fakeAiClient>, over: Partial<GenerateDeps> = {}) {
    const result = await generateWorkbook(laid, deps({ ai, ...over }));
    if (result.status !== "stored") throw new Error(result.status === "refused" ? result.reason : result.status);
    return result.draft;
  }

  it("plans each slot's numbers and person: no pair twice on a page, never Sam or the child's name, the same every run", async () => {
    const run = async () => {
      const ai = fakeAiClient({ answer: () => ({ items: [] }) });
      await generateWorkbook(laid, deps({ ai }));
      // A page with no items is asked once more: one request per page.
      const seen = new Set<string>();
      return ai.requests.filter((r) => r.name === "workbook_page").map(body).filter((b) => !seen.has(`${b.day}.${b.page}`) && !!seen.add(`${b.day}.${b.page}`));
    };
    const pages = await run();
    const bond = (p: number[]) => [...p].sort((a, b) => a - b).join(",");
    let planned = 0;
    for (const p of pages) {
      const pairs = p.slots.flatMap((s) => (s.planned?.numbers ? [bond(s.planned.numbers)] : []));
      planned += pairs.length;
      expect(new Set(pairs).size, `day ${p.day} page ${p.page}`).toBe(pairs.length);
      const names = p.slots.flatMap((s) => (s.planned?.name ? [s.planned.name] : []));
      expect(new Set(names).size).toBe(names.length);
      expect(names.some((n) => n === "Sam" || n === "Zoe")).toBe(false);
      for (const s of p.slots) {
        if (s.place === "spot-the-error") expect(s.planned?.name).toBeUndefined();
        const use = s.planned?.numbers;
        if (!use || s.aim?.kind === "relation") continue;
        const max = Math.max(...Object.values(s.numbers ?? {}).map((n) => n.max));
        expect(use[0] + use[1], `${use}`).toBeLessThanOrEqual(max);
        // On 1 more and 1 less, the pair is a number and 1.
        if (s.aim?.skill === "K5-one-more-less") expect(use[1]).toBe(1);
      }
    }
    expect(planned).toBeGreaterThan(100);
    // Spot the error's sums differ through the book.
    const spots = pages.flatMap((p) => p.slots.filter((s) => s.place === "spot-the-error").map((s) => `${s.planned!.numbers}`));
    expect(spots.length).toBeGreaterThan(3);
    expect(new Set(spots).size).toBe(spots.length);
    expect(await run()).toEqual(pages);
  });

  it("plans each slot's wording: never one twice in the book, within its room, with its numbers and name, no take-away before subtraction", async () => {
    const ai = fakeAiClient({ answer: () => ({ items: [] }) });
    await generateWorkbook(laid, deps({ ai }));
    const seen = new Set<string>();
    const slots = ai.requests.filter((r) => r.name === "workbook_page").map(body)
      .filter((b) => !seen.has(`${b.day}.${b.page}`) && !!seen.add(`${b.day}.${b.page}`))
      .flatMap((b) => b.slots) as (Planned & { room?: { characters: number }; planned?: { say?: string } })[];
    const says = slots.flatMap((s) => (s.planned?.say ? [s] : []));
    expect(says.length).toBeGreaterThan(80);
    expect(says.some((s) => s.aim?.kind === "sequence")).toBe(true);
    // A numbered wording is never planned twice (a sequence's has no numbers: it repeats only with other numbers).
    const numbered = says.filter((s) => s.aim?.kind !== "sequence");
    expect(new Set(numbered.map((s) => s.planned!.say)).size).toBe(numbered.length);
    for (const s of says) {
      const say = s.planned!.say!;
      if (s.room) expect(say.length, say).toBeLessThanOrEqual(s.room.characters);
      expect(say, say).not.toMatch(/[{}]/);
      expect(say).not.toMatch(/\bSam\b/);
      // A sequence's wording names no number (code fits its numbers to the card).
      if (s.aim?.kind === "sequence") {
        expect(say).not.toMatch(/\d/);
        continue;
      }
      const [a, b] = s.planned!.numbers!;
      expect(say.includes(String(a)) || say.includes(String(a + b)), say).toBe(true);
      if (!skillRange(BC, 3, s.aim!.skill).subtraction) expect(say, say).not.toMatch(/left|away|take|less/);
    }
    // The page's shapes differ: no two planned wordings of a page share their words without numbers and names.
    const pages = ai.requests.filter((r) => r.name === "workbook_page").map(body);
    for (const p of pages) {
      const shapes = p.slots.flatMap((s) => (s.planned?.say ? [shapeOf(s.planned.say)] : [])).filter(Boolean);
      expect(new Set(shapes).size, `day ${p.day} page ${p.page}`).toBe(shapes.length);
    }
  });

  it("writes a take-away's or a sum's easier example itself when the AI's has the question's answer or is missing", () => {
    const at = { id: "q1", workbookId: WORKBOOK, page: 3, question: 1, level: 3, skills: ["K3-benchmarks-5-10"] };
    const item = (op: unknown, easier: unknown) => buildQuestion({
      slot: "1.1", skill: "K3-benchmarks-5-10", difficulty: 1, text: "8 boats. Ivy loses 4. How many left?", format: "write-number", operation: op,
      wrongAnswers: [{ value: num(9), cause: "operation", description: "Adds.", step: null }], easier, shownWrong: null, figure: null,
      numbers: [], places: null, direction: null, sequence: null, pattern: null, relation: null, figureShows: null,
    }, at);
    // 6 - 2 is 4 again (run 11): code takes one fewer boat, 7 - 4.
    const same = item(subOp(8, 4), { text: "6 boats. Ivy loses 2. How many left?", operation: subOp(6, 2) });
    expect(same.check.status).toBe("checked");
    expect(same.package!.easierExample).toMatchObject({ text: "7 - 4 = ?", operation: { kind: "subtract", operands: [7, 4] } });
    // 8 - 7: 7 - 7 leaves nothing, so 8 - 6.
    expect(item(subOp(8, 7), { text: "4 - 3 = ?", operation: subOp(4, 3) }).package!.easierExample).toMatchObject({ operation: { operands: [8, 6] } });
    expect(item(addOp(4, 3), null).package!.easierExample).toMatchObject({ text: "3 + 3 = ?" });
    // A sound easier example of the AI's stays.
    expect(item(subOp(8, 4), { text: "7 - 4 = ?", operation: subOp(5, 4) }).package!.easierExample!.operation).toMatchObject({ operands: [5, 4] });
  });

  it("never plans a missing part on 1 more and 1 less (its missing part is the 1 the text names)", () => {
    expect(kindsOf(BC.skill("K5-one-more-less")!.text)).not.toContain("missing-part");
    expect(kindsOf(BC.skill("K3-make-10")?.text ?? "make 10")).toContain("missing-part");
  });

  it("gives a page's skill another kind before the same kind again", async () => {
    const ai = fakeAiClient({ answer: () => ({ items: [] }) });
    await generateWorkbook(laid, deps({ ai }));
    for (const p of ai.requests.filter((r) => r.name === "workbook_page").map(body)) {
      const aimed = p.slots.filter((s) => s.aim);
      for (const skill of new Set(aimed.map((s) => s.aim!.skill))) {
        const kinds = aimed.filter((s) => s.aim!.skill === skill).map((s) => s.aim!.kind);
        const all = new Set(kindsOf(BC.skill(skill)?.text ?? skill).filter((k) => !["picture-stories", "word-problems"].includes(aimed[0].place) || ["story", "picture", "missing-part"].includes(k)));
        if (kinds.length <= all.size) expect(new Set(kinds).size, `${skill} on day ${p.day} page ${p.page}: ${kinds}`).toBe(kinds.length);
      }
    }
  });

  it("sends a repeat's redo the slot's spare numbers and its next kind", async () => {
    const write = short();
    let first: Record<string, unknown> | null = null;
    // A count prints the AI's words at U3 (code words a sum there, round 7): question 1.1 repeats the book's first one.
    const count = (s: SlotAsked) => ({ ...empty, slot: s.slot, skill: s.skills[0], text: "Ava qq has dots. How many dots?", format: "count", figure: "dots", numbers: [num(2), num(3)] });
    const ai = fakeAiClient({
      answer: (r) => fill(r, (s) => {
        const item = write(s) as Record<string, unknown>;
        if (r.name !== "workbook_page" || s.slot !== "1.1" || !("place" in s)) return item;
        if (first === null) { first = count(s); return first; }
        return { ...first, slot: s.slot, skill: item.skill };
      }),
    });
    await book(ai);
    const redo = ai.requests.find((r) => r.name === "workbook_page_redo" && /repeats a question already asked/.test(body(r).note ?? ""))!;
    const page = ai.requests.find((r) => r.name === "workbook_page" && body(r).day === body(redo).day && body(r).page === body(redo).page)!;
    const before = body(page).slots.find((s) => s.slot === "1.1")!;
    const after = body(redo).slots.find((s) => s.slot === "1.1")!;
    expect(before.planned?.numbers).toBeDefined();
    expect(after.planned?.numbers).toBeDefined();
    expect(after.planned!.numbers).not.toEqual(before.planned!.numbers);
    expect(body(redo).note).toContain(`Use the numbers ${after.planned!.numbers!.join(" and ")}`);
    if (before.aim) expect(after.aim!.kind).not.toBe(before.aim.kind);
  });

  it("renames anyone called Sam outside Spot the error, keeping a he a boy's name", async () => {
    // At U10, where the AI's words are printed; at U3 code's wording names only the planned people (round 7).
    let n = 0;
    const ai = fakeAiClient({
      answer: (r) => fill(r, (s) => goodItem(s, {
        text: `Sam ${tag(n++)} has 2. He gets 1. How many?`, operation: addOp(2, 1),
        wrongAnswers: [{ value: num(4), cause: "count", description: "Counts one too many.", step: null }], easier: { text: "Try a smaller sum.", operation: addOp(1, 1) },
      })),
    });
    const result = await generateWorkbook({ ...laid, plan: PLAN }, deps({ ai }));
    if (result.status !== "stored") throw new Error(result.status === "refused" ? result.reason : result.status);
    const draft = result.draft;
    const others = draft.pages.flatMap((p) => p.questions).filter((q) => q.package && q.place !== "spot-the-error" && q.package.operation);
    expect(others.length).toBeGreaterThan(50);
    expect(others.some((q) => /\bSam\b/.test(JSON.stringify(q.package)))).toBe(false);
    const names = new Set(others.map((q) => q.package!.text.split(" ")[0]));
    expect([...names].every((x) => ["Ben", "Leo", "Tom", "Raj", "Eli", "Gus", "Dan", "Kai", "Omar", "Max", "Ian", "Jon", "Ali", "Ned"].includes(x)), [...names].join(",")).toBe(true);
  });

  it("writes a text past its room again, shorter; keeps the first version when the redo is not shorter, never failed for length", async () => {
    const write = short();
    const long = (k: number) => `Ava ${tag(9000 + k)} has ${k + 2} cars and 1 more car in a box. How many cars are in the box?`;
    // A count prints the AI's words at U3 (round 7: code words a sum there, within its room).
    const longItem = (k: number) => ({ text: long(k), format: "count", operation: null, easier: null, wrongAnswers: [], figure: "dots", numbers: [num(k + 2), num(1)] });
    const ai = fakeAiClient({
      answer: (r) => fill(r, (s) => {
        const b = body(r);
        if (b.day !== 1 || b.page !== 1) return write(s);
        if (r.name === "workbook_page" && (s.slot === "1.1" || s.slot === "1.2")) return write(s, longItem(Number(s.slot.split(".")[1]) + 4));
        // The redo: 1.1 comes back short, 1.2 as long again.
        if (r.name === "workbook_page_redo" && s.slot === "1.2") return write(s, longItem(6));
        return write(s);
      }),
    });
    const draft = await book(ai);
    const note = body(ai.requests.find((r) => r.name === "workbook_page_redo" && body(r).day === 1 && body(r).page === 1)!).note!;
    expect(note).toMatch(/Slot 1\.1 is sound but too long for its place: its text has \d+ characters and its room is 70/);
    const [q1, q2] = firstDayPage(draft).questions;
    expect(q1).toMatchObject({ attempts: 2, check: { status: "checked" } });
    expect(q1.package!.text.length).toBeLessThanOrEqual(70);
    expect(q2).toMatchObject({ attempts: 2, check: { status: "checked" } });
    expect(q2.package!.text).toBe(long(6));
  });

  it("cuts a long sequence on a parent-led card to 5 numbers, keeping its blanks; one whose text names numbers is written again", async () => {
    const seq = (text: string) => ({ ...empty, format: "sequence", text, sequence: { start: num(1), step: num(1), terms: 8, blanks: [2, 6] } });
    const write = short();
    const ai = fakeAiClient({
      answer: (r) => fill(r, (s) => {
        const b = body(r);
        if (r.name === "workbook_page" && b.day === 1 && b.page === 1 && s.slot === "1.1") return { ...seq("Fill in the missing numbers."), slot: s.slot, skill: s.skills[0] };
        if (r.name === "workbook_page" && b.day === 1 && b.page === 1 && s.slot === "1.2") return { ...seq("Count from 1 to 8."), slot: s.slot, skill: s.skills[0] };
        return write(s);
      }),
    });
    const draft = await book(ai);
    const [q1, q2] = firstDayPage(draft).questions;
    const terms = (q: typeof q1) => (q.package!.item!.checks[0] as { terms: unknown[] }).terms;
    expect(terms(q1)).toHaveLength(5);
    expect(terms(q1).filter((t) => (t as { region?: string }).region).length).toBeGreaterThanOrEqual(1);
    // "Count from 1 to 8" cannot be cut: it goes to the redo, which here writes a sum.
    const note = body(ai.requests.find((r) => r.name === "workbook_page_redo" && body(r).day === 1 && body(r).page === 1)!).note!;
    expect(note).toContain("Slot 1.2 is sound but too long for its card: its sequence has 8 numbers and a card's line holds 5");
    expect(note).not.toContain("Slot 1.1 is sound");
    expect(q2.package!.operation).not.toBeNull();
  });

  it("pairs a parent-led page's tall cards in rows before it leaves a question out", async () => {
    // A fake fit check: a row of 2 cards with a picture is tall; a slot of cards fits 2 tall rows at most.
    const fit: FitCheck = {
      fits: async (page) => {
        const blocks = page.content?.kind === "day" ? page.content.blocks : [];
        for (const b of blocks) {
          const figures = (b as { figures?: unknown[] }).figures ?? [];
          let tall = 0;
          for (let k = 0; k < figures.length; k += 2) if (figures[k] || figures[k + 1]) tall++;
          if (tall > 2) return { ok: false, problems: [{ question: b.items.at(-1) ?? null, reason: "the last row runs past the bottom" }] };
        }
        return { ok: true };
      },
    };
    let n = 0;
    const write = short();
    // On picture stories, every other card counts dots: the cards in reading order are picture, story, picture, ...
    const ai = fakeAiClient({
      answer: (r) => fill(r, (s) => ((s as Planned).place === "picture-stories" && Number(s.slot.split(".")[1]) % 2 === 1
        ? goodItem(s, { text: `Mia draws dots ${tag(n)}. How many dots does she draw?`, format: "count", operation: null, easier: null, wrongAnswers: [], figure: "dots", numbers: [num(1 + (n++ % 9))] })
        : write(s))),
    });
    const draft = await book(ai, { fit });
    const stories = draft.pages.filter((p) => p.questions.filter((q) => q.place === "picture-stories").length >= 5);
    expect(stories.length).toBeGreaterThan(0);
    for (const p of stories) {
      expect(p.leftOut, `page ${p.number}`).toBeUndefined();
      const figures = (p.content!.kind === "day" ? p.content!.blocks.find((b) => b.slot === "picture-stories")! : null) as { figures: unknown[] };
      expect(figures.figures.slice(0, 2).every(Boolean)).toBe(true);
      expect(p.questions.map((q) => q.number)).toEqual(p.questions.map((_, k) => k + 1));
    }
  });
});

describe("round 6 (#380): the printed question asks what the answer key answers", () => {
  const at = (skill: string, level = 3, over: Record<string, unknown> = {}) => ({ id: "q1", workbookId: WORKBOOK, page: 3, question: 1, level, skills: [skill], ...over });
  const empty = { difficulty: 1, operation: null, wrongAnswers: [], easier: null, shownWrong: null, figure: null, numbers: [], places: null, direction: null, sequence: null, pattern: null, relation: null, figureShows: null };
  const relation = (text: string, numbers: number[], rel: Record<string, unknown>, skill = "K3-benchmarks-5-10", place: Record<string, unknown> = {}) =>
    buildQuestion({ ...empty, slot: "1.1", skill, text, format: "relation", numbers: numbers.map(num), relation: rel }, at(skill, 3, place));
  const choice = (b: ReturnType<typeof relation>) => b.package!.item!.regions[0] as { choices: string[]; answer: string };
  /** The numbers the printed text names, in order. */
  const named = (text: string) => (text.match(/\d+/g) ?? []).map(Number);

  it("writes a relation's text from the same data as its choices and answer: a benchmark the AI's text contradicts", () => {
    // R380-11-1: "Is 7 less than 5?" with the benchmark 10 printed "yes" for a question whose answer is no.
    const b = relation("Is 7 less than 5?", [7], { kind: "less-than", to: [10], labels: [] });
    expect(b.check.status).toBe("checked");
    expect(b.package!.text).not.toBe("Is 7 less than 5?");
    expect(named(b.package!.text)).toEqual([7, 10]);
    expect(b.package!.text).toMatch(/less than 10/);
    expect(choice(b)).toMatchObject({ choices: ["less than 10", "not less than 10"], answer: "less than 10" });
  });

  it("writes a relation's text with each number beside its own label, whatever order the AI's text gave them", () => {
    // The AI's text says Mia has 9, but its data gives Mia 6: the printed text follows the data the answer comes from.
    const people = relation("Mia has 9 cars. Ben has 6. Who has more?", [6, 9], { kind: "more", to: [], labels: ["Mia", "Ben"] }, "K2-compare-quantities");
    expect(people.package!.text).toMatch(/Mia has 6 counters\. Ben has 9\. Who has more counters\?/);
    expect(choice(people).answer).toBe("Ben");
    const things = relation("3 dogs and 5 cats. Which group has fewer?", [5, 3], { kind: "fewer", to: [], labels: ["dogs", "cats"] }, "K2-compare-quantities");
    expect(things.package!.text).toMatch(/^Mia sees 5 dogs and 3 cats\./);
    expect(things.package!.text).toMatch(/fewer/);
    expect(choice(things)).toMatchObject({ choices: ["dogs", "cats"], answer: "cats" });
    expect(relation("x", [1, 4], { kind: "more", to: [], labels: ["cats", "dogs"] }, "K2-compare-quantities").package!.text).toMatch(/^Mia sees 1 cat and 4 dogs/);
  });

  it("writes a relation's text in its own kind when the AI's text asks another relation", () => {
    const less = relation("Is 8 close to 0 or 10?", [8], { kind: "less-than", to: [10], labels: [] });
    expect(less.package!.text).toMatch(/less than 10/);
    expect(less.package!.text).not.toMatch(/close/);
    expect(choice(less).answer).toBe("less than 10");
    const closer = relation("Is 8 less than 10?", [8], { kind: "closer", to: [0, 10], labels: [] });
    expect(closer.package!.text).toMatch(/close to 0 or (close )?to 10/);
    expect(choice(closer).answer).toBe("close to 10");
    const equal = relation("Who has more?", [4, 6], { kind: "equal", to: [], labels: [] }, "K6-equal-sets");
    expect(equal.package!.text).toMatch(/equal/);
    expect(named(equal.package!.text)).toEqual([4, 6]);
    expect(choice(equal).answer).toBe("not equal");
  });

  it("gives two relations of a page different words, within the room", () => {
    const one = relation("?", [7], { kind: "less-than", to: [5], labels: [] }, "K3-benchmarks-5-10", { variant: 0 });
    const two = relation("?", [3], { kind: "less-than", to: [5], labels: [] }, "K3-benchmarks-5-10", { variant: 1 });
    expect(shapeOf(one.package!.text)).not.toBe(shapeOf(two.package!.text));
    const tight = relation("?", [7], { kind: "less-than", to: [5], labels: [] }, "K3-benchmarks-5-10", { variant: 2, room: 18 });
    expect(tight.package!.text.length).toBeLessThanOrEqual(18);
  });

  // At U10, where the AI's words are printed: at U1 to U9 code words a whole-number sum (round 7).
  const sum = (text: string, operation: unknown, over: Record<string, unknown> = {}, skill = "K5-take-away-change", level = 10) => buildQuestion({
    ...empty, slot: "1.1", skill, text, format: "write-number", operation,
    wrongAnswers: [{ value: num(99), cause: "count", description: "x", step: null }], easier: { text: "1 + 1 = ?", operation: addOp(1, 1) }, ...over,
  }, at(skill, level));

  it("fails an operation whose numbers are not the ones its text names", () => {
    // "Gus finds 2 plums, then 5 more" worked as 2 + 6 would print 8 as the answer to 7.
    expect(sum("Gus finds 2 plums. He finds 5 more. How many plums did he find?", addOp(2, 6)).check).toMatchObject({ status: "failed", reason: expect.stringContaining("the text does not name 6") });
    expect(sum("Gus finds 2 plums. He finds 5 more. How many plums did he find?", addOp(2, 5)).check.status).toBe("checked");
    expect(sum("Mia has 8 cups. She takes away 3. How many cups does she have now?", subOp(8, 3)).check.status).toBe("checked");
    expect(sum("8 cups. Mia takes 3. How many are left?", subOp(9, 3)).check).toMatchObject({ status: "failed" });
    // Up to U9 code prints its own wording, which names only the numbers the operation works (round 7).
    const coded = sum("Mia has 3 cups and 2 hats. She gets 4 cups. How many cups?", addOp(3, 4), {}, "K5-take-away-change", 3);
    expect(coded.check.status).toBe("checked");
    expect(named(coded.package!.text).sort()).toEqual([3, 4]);
  });

  it("fails a take-away worded as putting together, and a sum worded as a take-away", () => {
    expect(sum("8 cups. Mia takes 3. How many are left?", addOp(8, 3)).check).toMatchObject({ status: "failed", reason: expect.stringContaining("how many are left") });
    expect(sum("8 cups and 3 more. How many in all?", subOp(8, 3), { wrongAnswers: [{ value: num(9), cause: "count", description: "x", step: null }] }).check).toMatchObject({ status: "failed", reason: expect.stringContaining("how many in all") });
  });

  it("lets a picture show a number its text does not name", () => {
    const missing = (part: number, total: number) => ({ kind: "missing-addend", operands: [num(part), num(total)], expression: null, unit: null, denominator: null, values: [] });
    const b = sum("Mia has dots on a ten-frame. How many more dots make 10?", missing(6, 10), { figure: "ten-frame", figureShows: "part", easier: { text: "6 + ? = 9", operation: missing(6, 9) } }, "K3-make-10");
    expect(b.check.status).toBe("checked");
    expect(sum("How many more make 10?", missing(6, 10), { easier: { text: "6 + ? = 9", operation: missing(6, 9) } }, "K3-make-10").check.status).toBe("failed");
  });

  it("writes an easier example's text from its operation when the AI's names other numbers", () => {
    const b = sum("Mia has 8 cups. She takes away 3. How many cups does she have now?", subOp(8, 3), { easier: { text: "5 cups. Mia takes 2. How many are left?", operation: subOp(7, 3) } });
    expect(b.check.status).toBe("checked");
    expect(b.package!.easierExample).toMatchObject({ text: "7 - 3 = ?", answer: { type: "number", value: 4 } });
    // One that names its own numbers stays (at U10; at U1 to U9 code writes it from its operation, round 7).
    expect(sum("Mia has 8 cups. She takes away 3. How many cups does she have now?", subOp(8, 3), { easier: { text: "7 cups. Mia takes 3. How many are left?", operation: subOp(7, 3) } }).package!.easierExample!.text)
      .toBe("7 cups. Mia takes 3. How many are left?");
    expect(sum("Mia has 8 cups. She takes away 3. How many cups does she have now?", subOp(8, 3), { easier: { text: "7 cups. Mia takes 3. How many are left?", operation: subOp(7, 3) } }, "K5-take-away-change", 3).package!.easierExample!.text)
      .toBe("7 - 3 = ?");
  });

  it("fails a compare, order, places or sequence text that names other numbers or another direction than its data", () => {
    const item = (skill: string, text: string, over: Record<string, unknown>) => buildQuestion({ ...empty, slot: "1.1", skill, text, ...over }, at(skill, 10));
    const compare = (text: string) => item("2.7-greater-less-symbols", text, { format: "compare", numbers: [num(7), num(5)] });
    expect(compare("Compare 7 and 5.").check.status).toBe("checked");
    expect(compare("Compare 5 and 7.").check).toMatchObject({ status: "failed", reason: expect.stringContaining("compares 7 with 5") });
    expect(compare("Circle <, > or =.").check).toMatchObject({ status: "failed", reason: expect.stringContaining("names no numbers") });
    const order = (text: string, direction = "up") => item("2.1-compare-order-100", text, { format: "order", numbers: [num(4), num(9), num(2)], direction });
    expect(order("Put in order, least first.").check.status).toBe("checked");
    expect(order("Put 4, 9 and 2 in order from least to greatest.").check.status).toBe("checked");
    expect(order("Put 4, 8 and 2 in order, least first.").check).toMatchObject({ status: "failed", reason: expect.stringContaining("the numbers to order are 4, 9, 2") });
    expect(order("Order from greatest to least.").check).toMatchObject({ status: "failed", reason: expect.stringContaining("make direction down") });
    expect(order("Order from greatest to least.", "down").check.status).toBe("checked");
    const places = (text: string) => item("2.1-place-value-tens-ones", text, { format: "places", numbers: [num(47)] });
    expect(places("How many tens and ones in 47?").check.status).toBe("checked");
    expect(places("How many tens and ones in 74?").check).toMatchObject({ status: "failed", reason: expect.stringContaining("splits 47") });
    const seq = (text: string, step: number) => item("2.1-number-line-100", text, { format: "sequence", sequence: { start: num(20), step: num(step), terms: 5, blanks: [2] } });
    expect(seq("Count back. Fill in the missing numbers.", -2).check.status).toBe("checked");
    expect(seq("Count back. Fill in the missing numbers.", 2).check).toMatchObject({ status: "failed", reason: expect.stringContaining("counts back") });
    expect(seq("Skip-count by 5s.", 2).check).toMatchObject({ status: "failed", reason: expect.stringContaining("counts by 5") });
  });
});

describe("round 6 (#380): what a parent sees on a page of stories", () => {
  const U3 = (() => {
    const result = planWorkbook({
      profile: { standards: [] }, grade: 0, level: planLevel(BC, "U3")!, passed: {}, workbook: { number: 1, inLevel: 0 },
      reviews: [], missedReviews: [], misses: [], pausedWeeks: 0, support: null, unassessedUnits: [],
    });
    if (!result.ok) throw new Error(result.reason);
    return result.plan;
  })();
  const laid = { ...input, plan: U3, book: { child: "Zoe" } };
  type Does = { operation: { kind: string; operands: [number, number] }; figure: string | null; figureShows: string | null };
  type Planned = SlotAsked & { place: string; room?: { characters: number }; aim?: { skill: string; kind: string }; planned?: { numbers?: number[]; name?: string; say?: string } & Partial<Does> };
  const body = (r: AiJsonRequest) => JSON.parse((r.content[0] as { text: string }).text) as { day: number; page: number; slots: Planned[] };
  const opOf = (d: Does["operation"]) => ({ kind: d.kind, operands: d.operands.map(num), expression: null, unit: null, denominator: null, values: [] });
  const answerOf = ({ kind, operands: [x, y] }: Does["operation"]) => (kind === "add" ? x + y : kind === "subtract" ? x - y : y - x);
  /** The first request of each page: what code planned for it. */
  async function plannedPages() {
    const ai = fakeAiClient({ answer: () => ({ items: [] }) });
    await generateWorkbook(laid, deps({ ai }));
    const seen = new Set<string>();
    return ai.requests.filter((r) => r.name === "workbook_page").map(body).filter((b) => !seen.has(`${b.day}.${b.page}`) && !!seen.add(`${b.day}.${b.page}`));
  }
  /** What a planned wording asks: put together, take away, compare, read the ten-frame, or a missing part. */
  const actionOf = (s: Planned) => {
    const p = s.planned!;
    if (p.operation!.kind === "add") return "join";
    if (p.operation!.kind === "subtract") return "separate";
    if (/How many more .*(does (Ben|Leo) have|than cats does \w+ see|are there)\?$/.test(p.say!)) return "compare";
    if (p.figure === "ten-frame" && p.operation!.operands[1] === 10) return "frame";
    return "part";
  };

  it("spreads a slot of story cards across put together, take away, missing part, compare and the ten-frame: at most 2 of 6 alike", async () => {
    const pages = await plannedPages();
    let slots = 0;
    for (const p of pages) {
      const stories = p.slots.filter((s) => s.place === "picture-stories" && s.planned?.say && s.planned.operation);
      if (stories.length < 6) continue;
      slots++;
      const count = new Map<string, number>();
      for (const s of stories) count.set(actionOf(s), (count.get(actionOf(s)) ?? 0) + 1);
      // A page of stories never takes a bare fact ("9 + ? = 10", "How far is 7 from 10?").
      for (const s of stories) expect(s.planned!.say, s.planned!.say).not.toMatch(/=|^What do you add|^How far is|^\d+ and how many more/);
      expect(Math.max(...count.values()), `day ${p.day} page ${p.page}: ${stories.map((s) => s.planned!.say).join(" | ")}`).toBeLessThanOrEqual(2);
      expect(count.size).toBeGreaterThanOrEqual(3);
    }
    expect(slots).toBeGreaterThan(0);
  });

  it("plans whole questions a parent reads aloud in plain story language: never 'in all', 'altogether', 'total' or 'left over' (D-201)", async () => {
    const pages = await plannedPages();
    const says = pages.flatMap((p) => p.slots.flatMap((s) => (s.planned?.say ? [s.planned.say] : [])));
    expect(says.length).toBeGreaterThan(80);
    for (const say of says) {
      const last = say.match(/[^.?!]*[?.!]$/)?.[0].trim() ?? say;
      expect(last.split(/\s+/).length, say).toBeGreaterThanOrEqual(3);
      expect(say, say).not.toMatch(/\b(in all|altogether|total|left over)\b/i);
    }
    // Every story card: a person, and the question names the planned thing again ("How many plums does Gus have now?").
    const stories = pages.flatMap((p) => p.slots.filter((s) => s.place === "picture-stories" && s.planned?.say));
    expect(stories.length).toBeGreaterThan(10);
    for (const s of stories) expect(storyProblem(s.planned!.say!, { thing: (s.planned as { thing?: string }).thing ?? null }), s.planned!.say!).toBeNull();
    expect(says.some((x) => /have now\?$/.test(x))).toBe(true);
  });

  it("plans each wording with the operation and picture it works: each builds a checked question", async () => {
    let built = 0;
    for (const p of await plannedPages()) {
      for (const s of p.slots) {
        const d = s.planned;
        if (!d?.say || !d.operation) continue;
        const answer = answerOf(d.operation);
        const wrong = [d.operation.operands[0], d.operation.operands[1]].find((x) => x !== answer)!;
        const b = buildQuestion({
          slot: s.slot, skill: s.aim?.skill ?? s.skills[0], difficulty: 1, text: d.say, format: "write-number", operation: opOf(d.operation),
          wrongAnswers: [{ value: num(wrong), cause: "count", description: "x", step: null }], easier: null, shownWrong: null,
          figure: d.figure ?? null, figureShows: d.figureShows ?? null, numbers: [], places: null, direction: null, sequence: null, pattern: null, relation: null,
        }, { id: "q", workbookId: WORKBOOK, page: 3, question: 1, level: 3, skills: [s.aim?.skill ?? s.skills[0]] });
        expect(b.check, `${d.say} ${JSON.stringify(d.operation)}`).toEqual({ status: "checked" });
        built++;
      }
    }
    expect(built).toBeGreaterThan(60);
  });

  it("gives a repeat whose item is the planned one the planned wording from code, with no AI redo", async () => {
    // The AI works each planned operation but words every question alike ("Ava has 3 and 4. How many?").
    const ai = fakeAiClient({
      answer: (r) => ({
        items: body(r).slots.flatMap((s) => {
          const d = s.planned;
          if (!d?.operation) return [];
          const [x, y] = d.operation.operands;
          const answer = answerOf(d.operation);
          return [{
            slot: s.slot, skill: s.aim?.skill ?? s.skills[0], difficulty: 1, text: `Ava has ${x} and ${y}. How many?`, format: "write-number", operation: opOf(d.operation),
            wrongAnswers: [{ value: num(x === answer ? y : x), cause: "count", description: "x", step: null }], easier: null, shownWrong: null,
            figure: d.figure ?? null, figureShows: d.figureShows ?? null, numbers: [], places: null, direction: null, sequence: null, pattern: null, relation: null,
          }];
        }),
      }),
    });
    const result = await generateWorkbook(laid, deps({ ai }));
    if (result.status !== "stored") throw new Error(result.status === "refused" ? result.reason : result.status);
    const planned = new Map<string, string | undefined>(ai.requests.filter((r) => r.name === "workbook_page").map(body).flatMap((b) => b.slots.map((s) => [`${b.day}.${b.page}.${s.slot}`, s.planned?.say] as const)));
    const reworded = result.draft.pages.flatMap((p) => p.questions.filter((q) => q.package && q.package.text === planned.get(`${p.day}.${p.pageOfDay}.${q.slot}`) && !q.package.text.startsWith("Ava")));
    expect(reworded.length).toBeGreaterThan(20);
    expect(reworded.every((q) => q.check.status !== "failed" && q.attempts === 1)).toBe(true);
  });

  it("fails a question whose text is word for word another's on its page, whatever its numbers, and rewrites it once", async () => {
    const asked: string[] = [];
    const ai = fakeAiClient({
      answer: (r) => {
        if (r.name === "workbook_page_redo") asked.push(body(r as AiJsonRequest).slots.length ? (JSON.parse((r.content[0] as { text: string }).text) as { note: string }).note : "");
        return {
          items: body(r).slots.map((s, k) => ({
            slot: s.slot, skill: s.skills[0], difficulty: 1, text: "Fill in the missing numbers.", format: "sequence", operation: null, wrongAnswers: [], easier: null, shownWrong: null,
            figure: null, figureShows: null, numbers: [], places: null, direction: null, pattern: null, relation: null,
            sequence: { start: num(1 + (k % 4)), step: num(1), terms: 4, blanks: [2] },
          })),
        };
      },
    });
    await generateWorkbook(laid, deps({ ai }));
    expect(asked.some((x) => /its text is the same as question \d+'s on this page \("Fill in the missing numbers\."\): word it another way/.test(x))).toBe(true);
  });
});

describe("a ten-frame of two parts (round 6)", () => {
  it("draws each part in its own colour, and one part in one colour", async () => {
    const { figureSvg } = await import("@/lib/workbook-template");
    const fills = (svg: string) => [...svg.matchAll(/<circle [^>]*fill="(#[0-9A-F]+)"/gi)].map((m) => m[1]);
    const two = fills(figureSvg({ kind: "ten-frame", filled: 8, parts: [2, 6] }));
    expect(two).toHaveLength(8);
    expect(new Set(two.slice(0, 2)).size).toBe(1);
    expect(new Set(two.slice(2)).size).toBe(1);
    expect(two[0]).not.toBe(two[2]);
    expect(new Set(fills(figureSvg({ kind: "ten-frame", filled: 7 }))).size).toBe(1);
  });
});

describe("plain story language on a story place (D-201)", () => {
  const empty = { difficulty: 1, shownWrong: null, figure: null, numbers: [], places: null, direction: null, sequence: null, pattern: null, relation: null, figureShows: null };
  const wording: SlotWording = { name: "Gus", thing: "plums", names: ["Gus", "Mia", "Ben"], things: ["plums", "cars", "hats"], kinds: ["story", "picture", "missing-part"], step: false, subtraction: true };
  const story = (text: string, level: number, place: Record<string, unknown> = { story: true }) => buildQuestion({
    ...empty, slot: "1.1", skill: "K5-add-on-change", text, format: "show-work", operation: addOp(3, 4),
    wrongAnswers: [{ value: num(6), cause: "count", description: "x", step: null }], easier: { text: "2 + 4 = ?", operation: addOp(2, 4) },
  }, { id: "q1", workbookId: WORKBOOK, page: 3, question: 1, level, skills: ["K5-add-on-change"], ...(level <= 9 ? { wording } : {}), ...place });

  it("sends an AI story with a banned phrase or no person to be written again (U10 and up: the AI's words print)", () => {
    expect(story("Raj has 3 apples and finds 4 more. How many apples in all?", 12).check).toEqual({ status: "failed", reason: expect.stringMatching(/never says "in all"/) });
    expect(story("3 apples. 4 more. How many apples are there now?", 12).check).toEqual({ status: "failed", reason: expect.stringMatching(/a person with a first name/) });
    expect(story("Raj has 3 apples. He finds 4 more. How many apples does Raj have now?", 12).check).toEqual({ status: "checked" });
    // Quantity questions on practice and review pages use the same checks.
    expect(story("3 apples. 4 more. How many apples are there now?", 12, {}).check).toEqual({ status: "failed", reason: expect.stringMatching(/a person/) });
  });

  it("prints only a code wording with a person and the planned thing named again at U1 to U9", () => {
    const b = story("anything", 3);
    expect(b.check).toEqual({ status: "checked" });
    expect(b.wordings!.length).toBeGreaterThan(2);
    for (const w of b.wordings!) expect(storyProblem(w, { thing: "plums" }), w).toBeNull();
    expect(b.package!.text).toMatch(/^(Gus|Mia|Ben) /);
  });
});

describe("round 7 (#380, R380-12-1): code writes the text where it can, a solve check reads the rest", () => {
  const empty = { difficulty: 1, shownWrong: null, figure: null, numbers: [], places: null, direction: null, sequence: null, pattern: null, relation: null, figureShows: null };
  const missing = (part: number, total: number) => ({ kind: "missing-addend", operands: [num(part), num(total)], expression: null, unit: null, denominator: null, values: [] });
  const op = (kind: string, a: number, b: number) => ({ kind, operands: [num(a), num(b)], expression: null, unit: null, denominator: null, values: [] });
  const wording: SlotWording = { name: "Mia", thing: "shells", names: ["Mia", "Ben", "Ava"], things: ["shells", "cars", "hats"], kinds: ["story", "picture", "missing-part", "fact"], step: false, subtraction: true };
  /** A whole-number item at `level`: the AI's text over `operation`, its easier example over `easier`. */
  const built = (text: string, operation: unknown, level: number, over: Record<string, unknown> = {}, easier: unknown = { text: "6 + 5 = ?", operation: addOp(6, 5) }) => buildQuestion({
    ...empty, slot: "1.1", skill: "K5-take-away-change", text, format: "write-number", operation,
    wrongAnswers: [{ value: num(99), cause: "count", description: "x", step: null }], easier, ...over,
  }, { id: "q1", workbookId: WORKBOOK, page: 3, question: 1, level, skills: ["K5-take-away-change"], wording });
  const TAKES = /\b(away|eats?|fewer|left|takes?|lost|fell|hides|uses|gives|crossed|back|less)\b|-/i;
  /** A reader of the printed words alone: take-away words subtract the first two numbers, else it adds them. */
  const reader = (): Solver => {
    return {
      model: "reader",
      async solve(request) {
        return {
          answers: request.questions.flatMap((q) => {
            const [a, b] = (q.text.match(/\d+/g) ?? []).map(Number);
            const takes = /gives away|eats|fewer|now has|left|take away|-/.test(q.text);
            return q.boxes.map((box) => ({ question: q.id, box: box.id, answer: String(takes ? a - b : a + b) }));
          }),
          problem: null,
        };
      },
    };
  };

  it("never prints the review's example at U3: code words add [7, 5] as a sum, from the same numbers as the key", () => {
    const b = built("Mia has 7 shells. She gives away 5. How many shells does she have now?", addOp(7, 5), 3);
    expect(b.check.status).toBe("checked");
    expect(b.package!.answer!.value).toEqual({ type: "number", value: 12 });
    expect(b.package!.text).not.toBe("Mia has 7 shells. She gives away 5. How many shells does she have now?");
    expect((b.package!.text.match(/\d+/g) ?? []).map(Number).sort((x, y) => x - y)).toEqual([5, 7]);
    // Every wording code may print instead is a putting together of 7 and 5, never a take-away.
    expect(b.wordings!.length).toBeGreaterThan(5);
    for (const w of b.wordings!) expect(w, w).not.toMatch(TAKES);
  });

  it("words the 'eats', 'fewer' and 'now has' variants from the operation too, whatever the AI's words", () => {
    for (const text of ["Mia has 7 plums. She eats 5. How many are there?", "Mia has 7 cars. Ben has 5 fewer. How many has Ben?", "Mia had 7 hats and lost 5. Mia now has how many?"]) {
      const sum = built(text, addOp(7, 5), 3);
      expect(sum.package!.text, text).not.toMatch(TAKES);
      // The same words over subtract [7, 5] are worded as a take-away of 5 from 7: 2.
      const away = built(text, subOp(7, 5), 3);
      expect(away.package!.text, text).toMatch(/\b7\b/);
      expect(away.package!.answer!.value).toEqual({ type: "number", value: 2 });
      for (const w of away.wordings!) expect(w, w).toMatch(/left|away|take|-|less|back|crossed|hides|uses|lost|loses|fell|gives|hop/i);
    }
  });

  it("writes an easier example from its operation at U3, so it never contradicts its key", () => {
    const b = built("Mia has 7 cups and gets 5. How many in all?", addOp(7, 5), 3, {}, { text: "6 - 5 = ?", operation: addOp(6, 5) });
    expect(b.package!.easierExample).toMatchObject({ text: "6 + 5 = ?", answer: { type: "number", value: 11 } });
  });

  it("prints code's words only: the AI may choose the person and the thing from the lists code offers, nothing else", () => {
    // The pronouns code fills in for {He}, {he} and {him} (D-201), and the second person {other}.
    const vocabulary = new Set([...FRAMES.flatMap((f) => f.f.split(/[^A-Za-z]+/)), "Leo", "Ben", "she", "her", "him"].filter(Boolean).map((w) => w.toLowerCase()));
    const ops = [addOp(7, 5), subOp(9, 4), missing(3, 8), missing(4, 10), op("multiply", 3, 4), op("divide", 12, 3), op("divide", 13, 3)];
    let worded = 0;
    for (const operation of ops) {
      for (const format of ["write-number", "show-work", "tick-and-number", "two-ways", "number-line", "spot-the-error"]) {
        // The AI writes a zebra and names Zed (not offered) and cars (offered).
        const b = built("Zed the zebra has 7 shells and a quokka. How many?", operation, 3, { format, name: "Zed", thing: "cars", ...(format === "spot-the-error" ? { shownWrong: 0 } : {}) });
        if (b.check.status === "failed") continue;
        worded += b.wordings!.length;
        expect(b.package!.text).toBe(b.wordings![0]);
        for (const w of b.wordings!) {
          const words = w.split(/[^A-Za-z]+/).filter(Boolean);
          expect(words.filter((x) => !vocabulary.has(x.toLowerCase()) && x !== "Mia" && x !== "cars" && !["shell", "car", "hat", "dot", "cat", "dog", "group", "bag", "row", "box", "plate", "friend", "square", "hop"].includes(x)), w).toEqual([]);
          expect(w).not.toMatch(/Zed|zebra|quokka|shells/);
          expect(aiTextProblem(w, { skill: "K5-take-away-change", money: false }), w).toBeNull();
        }
      }
    }
    expect(worded).toBeGreaterThan(100);
  });

  it("fails the review's example at U10, where the AI's words are printed: written again once with the reason, then marked failed", async () => {
    const solver = reader();
    const logs: SolveLog[] = [];
    const ai = fakeAiClient({
      answer: (r) => fill(r, (s, q) => (q.day === 1 && q.page === 1 && s.slot === "1.1"
        ? goodItem(s, { text: "Mia has 7 shells. She gives away 5. How many shells does she have now?", operation: addOp(7, 5), easier: { text: "6 + 5 = ?", operation: addOp(6, 5) }, wrongAnswers: [{ value: num(2), cause: "operation", description: "x", step: null }] })
        : goodItem(s))),
    });
    const draft = await generate(deps({ ai, solver, onSolve: (l) => logs.push(l) }));
    const q = firstDayPage(draft).questions[0];
    expect(q.check).toMatchObject({ status: "failed", reason: expect.stringContaining("the solve check read the printed question another way") });
    expect(q.check.status === "failed" && q.check.reason).toContain('answers "2", the key says "12"');
    // The check is not a generation attempt: the page call and one redo, as for any failed check.
    expect(q.attempts).toBe(2);
    const calls = ai.requests.filter((r) => read(r).day === 1 && read(r).page === 1).map((r) => r.name);
    expect(calls).toEqual(["workbook_page", "workbook_page_redo"]);
    expect(read(ai.requests.find((r) => r.name === "workbook_page_redo")!).note).toContain("the solve check read the printed question another way");
    // Each check is logged, with its model and verdict; the sound ones agreed.
    expect(logs.some((l) => l.model === "reader" && l.verdict.status === "disagreed")).toBe(true);
    expect(logs.filter((l) => l.verdict.status === "agreed").length).toBeGreaterThan(50);
  });

  it("fails closed when the solve check is malformed or late", async () => {
    const late: Solver = { model: "slow", solve: () => new Promise(() => {}) };
    const draft = await generate(deps({ solver: late, solveTimeLimitMs: 5 }));
    const q = firstDayPage(draft).questions[0];
    expect(q).toMatchObject({ attempts: 2, check: { status: "failed", reason: expect.stringContaining("the solve check was late") } });
    const malformed: Solver = { model: "odd", solve: async () => ({ answer: "12" }) };
    const second = await generate(deps({ solver: malformed }));
    expect(firstDayPage(second).questions[0].check).toMatchObject({ status: "failed", reason: expect.stringContaining("malformed") });
  });

  it("plans a wording for every story, picture, fact and missing-part slot of the book, to its last day", async () => {
    const U3 = planWorkbook({
      profile: { standards: [] }, grade: 0, level: planLevel(BC, "U3")!, passed: {}, workbook: { number: 1, inLevel: 0 },
      reviews: [], missedReviews: [], misses: [], pausedWeeks: 0, support: null, unassessedUnits: [],
    });
    if (!U3.ok) throw new Error(U3.reason);
    const ai = fakeAiClient({ answer: () => ({ items: [] }) });
    await generateWorkbook({ ...input, plan: U3.plan, book: { child: "Zoe" } }, deps({ ai }));
    type Slot = { place: string; aim?: { kind: string }; planned?: { numbers?: number[]; say?: string } };
    const pages = ai.requests.filter((r) => r.name === "workbook_page").map((r) => JSON.parse((r.content[0] as { text: string }).text) as { day: number; slots: Slot[] });
    const numbered = pages.flatMap((p) => p.slots.map((s) => ({ day: p.day, s }))).filter(({ s }) => s.planned?.numbers && ["story", "picture", "fact", "missing-part"].includes(s.aim?.kind ?? ""));
    const late = numbered.filter((x) => x.day >= 9);
    expect(late.length).toBeGreaterThan(10);
    expect(late.filter((x) => !x.s.planned!.say).map((x) => x.s.place)).toEqual([]);
  });
});

describe("a page's AI calls kept for a resume (R379-7-1)", () => {
  const U3 = (() => {
    const result = planWorkbook({
      profile: { standards: [] }, grade: 0, level: planLevel(BC, "U3")!, passed: {}, workbook: { number: 1, inLevel: 0 },
      reviews: [], missedReviews: [], misses: [], pausedWeeks: 0, support: null, unassessedUnits: [],
    });
    if (!result.ok) throw new Error(result.reason);
    return result.plan;
  })();
  const laid = { ...input, plan: U3, book: { child: "Zoe" } };
  const hash = (t: string) => [...t].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);

  /**
   * An AI whose answer depends only on what it is asked, except that a page's first call asked a second time answers
   * every slot with an operation code cannot build (a failed check): what a lost first answer would cost. Slot 1.2 of
   * every third page fails its first answer too, so pages have redos to keep.
   */
  function ai() {
    const firsts = new Set<string>();
    return fakeAiClient({
      answer: async (r) => {
        const req = read(r);
        const again = r.name === "workbook_page" && firsts.has(`${req.day}:${req.page}`);
        if (r.name === "workbook_page") firsts.add(`${req.day}:${req.page}`);
        const text = (r.content[0] as { text: string }).text;
        await new Promise((done) => setTimeout(done, hash(text) % 3));
        return fill(r, (s) => {
          const max = Math.min(10, ...Object.values(s.numbers ?? {}).map((n) => n.max));
          const h = hash(`${text}|${s.slot}`);
          const b = max >= 5 ? 2 : 1;
          const a = 1 + (h % Math.max(1, max - b - 1));
          const item = goodItem(s, {
            text: `Kim ${tag(h % 40)} has ${a}. ${b} more come. How many now?`, operation: addOp(a, b),
            wrongAnswers: [{ value: num(a + b + 1), cause: "count", description: "Counts one too many.", step: null }],
            easier: { text: "Try a smaller sum.", operation: addOp(0, Math.min(a, b)) },
          });
          const bad = again || (r.name === "workbook_page" && s.slot === "1.2" && req.page % 3 === 0);
          return bad ? { ...item, operation: { kind: "add", operands: [], expression: null, unit: null, denominator: null, values: [] } } : item;
        });
      },
    });
  }

  /** The run's stores, kept between tries as the job's run keeps them: pages, the attempt ledger (2) and the calls. */
  function stores() {
    const pages = new Map<number, GeneratedPage>();
    const counts = new Map<string, number>();
    const calls = new Map<string, { page: number; seq: number; call: StoredCall }>();
    // A store keeps JSON, as the database does.
    const copy = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
    const solves = new Map<string, SolveVerdict>();
    let failSave: number[] = [];
    let saves = 0;
    let failSolve: number[] = [];
    let solveSaves = 0;
    return {
      pages, counts, calls, solves,
      /** The page saves (counted over every try) that throw, as a database error or the function's end would stop it. */
      failAt(...at: number[]) { failSave = at; },
      /** The solve check saves (counted over every try) that throw: the try stops in the middle of a call's checks. */
      failSolveAt(...at: number[]) { failSolve = at; },
      deps: {
        pages: {
          load: async () => [...pages.values()].map(copy),
          save: async (p: GeneratedPage) => {
            if (failSave.includes(++saves)) throw new Error("the function stopped");
            if (!pages.has(p.number)) pages.set(p.number, copy(p));
          },
        },
        attempts: {
          max: 2,
          load: async () => new Map(counts),
          use: async (page: number, slots: string[]) => {
            const refused = slots.filter((x) => (counts.get(`${page}:${x}`) ?? 0) >= 2);
            for (const x of slots) if (!refused.includes(x)) counts.set(`${page}:${x}`, (counts.get(`${page}:${x}`) ?? 0) + 1);
            return { refused };
          },
        },
        calls: {
          load: async (wanted: number[]) => [...calls.values()].filter((c) => wanted.includes(c.page)).map(copy),
          save: async (page: number, seq: number, call: StoredCall) => {
            if (!calls.has(`${page}:${seq}`)) calls.set(`${page}:${seq}`, copy({ page, seq, call }));
          },
          solves: async (wanted: number[]) => new Map([...solves].filter(([k]) => wanted.includes(Number(k.split(":")[0]))).map(([k, v]) => [k, copy(v)])),
          saveSolve: async (key: string, log: SolveLog) => {
            if (failSolve.includes(++solveSaves)) throw new Error("the function stopped");
            if (!solves.has(key)) solves.set(key, copy(log.verdict));
          },
        },
      } satisfies Partial<GenerateDeps>,
    };
  }

  const pagesOf = (r: Awaited<ReturnType<typeof generateWorkbook>>) => {
    if (r.status !== "stored") throw new Error(r.status === "refused" ? r.reason : r.status);
    // Tokens are random in live use: a resumed run makes new ones for the pages it writes.
    return r.draft.pages.map((p) => ({ ...p, qrToken: "" }));
  };

  async function uninterrupted() {
    const s = stores();
    const a = ai();
    const pages = pagesOf(await generateWorkbook(laid, deps({ ai: a, concurrency: 4, ...s.deps })));
    return { pages, counts: s.counts, requests: a.requests.length, s };
  }

  it("resumes after a later page's first answer came back but before that page was stored: the same questions and attempts", async () => {
    const one = await uninterrupted();
    // Some question used its redo, so attempt counts of 2 are in the comparison.
    expect([...one.counts.values()]).toContain(2);
    expect(one.pages.flatMap((p) => p.questions).some((q) => q.attempts === 2)).toBe(true);

    const s = stores();
    const a = ai();
    // The first page's save stops the try: the day's later pages have made their first call and are not stored.
    s.failAt(1);
    await expect(generateWorkbook(laid, deps({ ai: a, concurrency: 4, ...s.deps }))).rejects.toThrow("the function stopped");
    expect(s.pages.size).toBe(0);
    const firstDay = one.pages.filter((p) => p.day === 1 && p.questions.length > 0).map((p) => p.number);
    const kept = new Set([...s.calls.values()].filter((c) => c.seq === 0).map((c) => c.page));
    expect(firstDay.filter((n) => kept.has(n)).length).toBeGreaterThan(1);

    const resumed = pagesOf(await generateWorkbook(laid, deps({ ai: a, concurrency: 4, ...s.deps })));
    expect(resumed).toEqual(one.pages);
    expect(s.counts).toEqual(one.counts);
    // No call was asked twice: the AI answered as many calls as the run that was never stopped.
    expect(a.requests.length).toBe(one.requests);
  });

  it("resumes after two stops in a row the same way", async () => {
    const one = await uninterrupted();
    const s = stores();
    const a = ai();
    // The first try stops at its first page save, the second at its second (a page further on); the third finishes.
    s.failAt(1, 3);
    await expect(generateWorkbook(laid, deps({ ai: a, concurrency: 4, ...s.deps }))).rejects.toThrow("the function stopped");
    await expect(generateWorkbook(laid, deps({ ai: a, concurrency: 4, ...s.deps }))).rejects.toThrow("the function stopped");
    expect(s.pages.size).toBe(1);
    const resumed = pagesOf(await generateWorkbook(laid, deps({ ai: a, concurrency: 4, ...s.deps })));
    expect(resumed).toEqual(one.pages);
    expect(s.counts).toEqual(one.counts);
    expect(a.requests.length).toBe(one.requests);
    expect(Math.max(...s.counts.values())).toBe(2);
  });

  it("never tells the AI the child's name, so no kept call holds it", async () => {
    const one = await uninterrupted();
    expect(one.s.calls.size).toBeGreaterThan(0);
    const a = ai();
    await generateWorkbook(laid, deps({ ai: a, ...stores().deps }));
    expect(a.requests.some((r) => JSON.stringify(r).includes("Zoe"))).toBe(false);
    expect(JSON.stringify([...one.s.calls.values()])).not.toContain("Zoe");
  });

  it("stops with nothing more asked when a kept page, attempt or call does not fit the plan (R379-8-2)", async () => {
    const s = stores();
    const a = ai();
    // A try stopped at its third page save: two pages are kept, and the first day's later pages have kept calls.
    s.failAt(3);
    await expect(generateWorkbook(laid, deps({ ai: a, concurrency: 4, ...s.deps }))).rejects.toThrow("the function stopped");
    // Pages still in flight when the try stopped may keep their calls a moment later: let them settle first (R379-9-2).
    for (let quiet = 0, seen = ""; quiet < 3; ) {
      await new Promise((done) => setTimeout(done, 20));
      const now = `${s.calls.size}:${s.solves.size}:${a.requests.length}`;
      quiet = now === seen ? quiet + 1 : 0;
      seen = now;
    }
    expect(s.pages.size).toBe(2);
    const asked = a.requests.length;
    const U4 = planWorkbook({
      profile: { standards: [] }, grade: 0, level: planLevel(BC, "U4")!, passed: {}, workbook: { number: 1, inLevel: 0 },
      reviews: [], missedReviews: [], misses: [], pausedWeeks: 0, support: null, unassessedUnits: [],
    });
    if (!U4.ok) throw new Error(U4.reason);
    // Another plan: the kept pages are of another book.
    await expect(generateWorkbook({ ...laid, plan: U4.plan }, deps({ ai: a, ...s.deps }))).rejects.toThrow(ResumeMismatch);
    // The same plan for another name: the kept pages print the name they were made for.
    await expect(generateWorkbook({ ...laid, book: { child: "Ava" } }, deps({ ai: a, ...s.deps }))).rejects.toThrow(/kept page \d+ was made for another name/);
    // A kept call that asked other slots than the plan's page asks.
    const c = [...s.calls.values()].find((x) => !s.pages.has(x.page) && x.seq === 0 && new Set(x.call.ask.slots).size >= 2)!;
    expect(c).toBeDefined();
    const ask = c.call.ask;
    c.call.ask = { ...ask, slots: [...ask.slots].reverse() };
    await expect(generateWorkbook(laid, deps({ ai: a, ...s.deps }))).rejects.toThrow(`page ${c.page}: its kept call 0 is workbook_page of`);
    c.call.ask = ask;
    // An attempt counted for a slot the plan's page does not have.
    s.counts.set("3:9.9", 1);
    await expect(generateWorkbook(laid, deps({ ai: a, ...s.deps }))).rejects.toThrow("the attempts kept for page 3, slot 9.9 name a slot the plan does not have");
    s.counts.delete("3:9.9");
    // None of them asked the AI anything; with what was kept as it was, the run goes on.
    expect(a.requests.length).toBe(asked);
    expect((await generateWorkbook(laid, deps({ ai: a, concurrency: 4, ...s.deps }))).status).toBe("stored");
  });

  it("fingerprints the planned book without the child's name, and another plan gives another (R379-8-2)", () => {
    // Mia is one of the people the plan names: for a child called Mia the plan names others, yet the fingerprint is the same.
    expect(bookOutline({ ...laid, book: { child: "Mia" } })).toBe(bookOutline(laid));
    expect(bookOutline(laid)).toMatch(/^[0-9a-f]{28}$/);
    const U4 = planWorkbook({
      profile: { standards: [] }, grade: 0, level: planLevel(BC, "U4")!, passed: {}, workbook: { number: 1, inLevel: 0 },
      reviews: [], missedReviews: [], misses: [], pausedWeeks: 0, support: null, unassessedUnits: [],
    });
    if (!U4.ok) throw new Error(U4.reason);
    expect(bookOutline({ ...laid, plan: U4.plan })).not.toBe(bookOutline(laid));
    expect(bookOutline({ ...laid, number: 2 })).not.toBe(bookOutline(laid));
  });
});

describe("quantity card checks at every level (D-201)", () => {
  const raw = (text: string) => ({
    slot: "1.1", skill: "K1-how-many", difficulty: 1, text, format: "count", operation: null, wrongAnswers: [], easier: null,
    figure: "dots", numbers: [num(3)], places: null, direction: null, sequence: null, pattern: null, relation: null,
  });
  it.each(Array.from({ length: 30 }, (_, i) => i + 1))("rejects unsafe picture text at U%i, outside a story place", (level) => {
    const place = { id: "q1", workbookId: WORKBOOK, page: 3, question: 1, level, skills: ["K1-how-many"] };
    for (const text of ["3 dots. How many dots?", "Mia draws 3 dots. How many now?", "Mia draws 3 dots. How many dots in all?"]) {
      expect(buildQuestion(raw(text), place).check.status, text).toBe("failed");
    }
    expect(buildQuestion(raw("Mia draws dots. How many dots did she draw?"), place).check).toEqual({ status: "checked" });
  });

  it("rewrites a failed practice quantity question before it can print", async () => {
    const ai = fakeAiClient({ answer: (r) => fill(r, (s) => s.slot === "1.1" ? {
      ...raw(r.name === "workbook_page" ? "Dots. How many dots?" : "Mia draws dots. How many dots?"),
      slot: s.slot, skill: s.skills[0], numbers: [num(2), num(3)],
    } : goodItem(s)) });
    const result = await generateWorkbook(input, deps({ ai }));
    if (result.status !== "stored") throw new Error(result.status === "refused" ? result.reason : result.status);
    const question = result.draft.pages.find((p) => p.questions.length)!.questions[0];
    expect(question.attempts).toBe(2);
    expect(question.check).toEqual({ status: "checked" });
    expect(question.package!.text).toBe("Mia draws dots. How many dots?");
    expect(read(ai.requests.find((r) => r.name === "workbook_page_redo")!).note).toMatch(/a person with a first name/);
  });

  it("rejects red dots and checks each printed colour's quantity", () => {
    expect(pictureProblem("Mia has 3 blue counters. How many counters?", { kind: "ten-frame", counters: [3] })).toBeNull();
    expect(pictureProblem("Mia has 3 orange counters. How many counters?", { kind: "ten-frame", counters: [3] })).toMatch(/picture shows 0/);
    expect(pictureProblem("Mia has 4 orange and 3 blue counters. How many counters?", { kind: "ten-frame", counters: [3, 4] })).toMatch(/picture shows 3/);
    for (const f of [{ kind: "dots" as const, groups: [3, 4], takenAway: 0 }, { kind: "ten-frame" as const, counters: [3, 4] }]) {
      expect(pictureProblem("Mia draws 3 red dots and 4 blue dots. How many dots?", f)).toMatch(/says red/);
      expect(pictureProblem("Mia draws 4 orange dots and 3 blue dots. How many dots?", f)).toMatch(/picture shows 3/);
      expect(pictureProblem("Mia draws 3 orange dots and 4 blue dots. How many dots?", f)).toBeNull();
    }
  });
});
