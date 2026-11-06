import { beforeEach, expect, it, vi } from "vitest";
import { readParentWorkbookAnswers, type ParentWorkbookAnswerSource } from "@/lib/parent-workbook-answers";
import { sampleWorkbook } from "@/lib/workbook-sample";
import { storedQuestion, type Workbook, type WorkbookPage } from "@/lib/workbook-content";
import { operationResult, valueText, workedSteps, type Item, type Operation, type QuestionPackage } from "@/lib/question-package";
import { sampleBook } from "@/lib/workbook-sample-book";
import { workbookTemplate } from "@/lib/workbook-template";
import { regionNames } from "@/lib/workbook-render";
import { storedRegions, storedTeaching, TEACHING_CONTEXT_VERSION } from "@/lib/workbook-print-contract";

const PARENT = "11111111-1111-4111-8111-111111111111", CHILD = "22222222-2222-4222-8222-222222222222", BOOK = "33333333-3333-4333-8333-333333333333", OTHER = "44444444-4444-4444-8444-444444444444";
const NOW = Date.parse("2026-11-06T20:00:00Z");
const request = { parentId: PARENT, childId: CHILD, workbookId: BOOK };
const original = sampleWorkbook({ workbookId: BOOK, parentId: PARENT, childId: CHILD, qrTokens: ["sample-token-00000001", "sample-token-00000002", "sample-token-00000003"] });
const base = original.pages.flatMap(p => p.questions)[0].package;
function question(page: number, number: number, operation: Operation | null = { kind: "add", operands: [24, 18] }, item?: Item) {
  const easier: Operation | null = !operation ? null : operation.kind === "divide" ? { kind: "divide", operands: [8, 3] }
    : operation.kind === "fraction-add" ? { kind: "fraction-add", operands: [{ type: "number", value: 1 }, { type: "number", value: 2 }] }
      : operation.kind === "quantity-add" ? { kind: "quantity-add", operands: [{ type: "quantity", value: 1, unit: "$" }, { type: "quantity", value: 2, unit: "$" }] }
        : operation.kind === "clock-convert" ? { kind: "clock-convert", operands: [{ type: "time", hours: 1, minutes: 15, period: null }] }
          : { kind: "add", operands: [2, 1] };
  const pkg: QuestionPackage = { ...base, item: undefined, id: `question-${page}-${number}`, ref: { source: "workbook", workbookId: BOOK, page, question: number }, text: "PRIVATE WORKSHEET WORDING", wrongAnswers: operation ? [{ value: { type: "number", value: 99999 }, cause: "O3", description: "A different answer", step: null }] : [],
    operation, answer: operation ? { value: operationResult(operation), accepted: [], unit: null } : null, steps: operation ? workedSteps(operation) : [],
    easierExample: easier ? { text: "PRIVATE EXAMPLE", operation: easier, answer: operationResult(easier), steps: workedSteps(easier) } : null, ...(item ? { item } : {}) };
  const stored = storedQuestion({ number, box: { x: 0, y: 0, width: 100, height: 100 }, schemaVersion: 2, package: pkg }, { source: "workbook", workbookId: BOOK, page, question: number });
  if (stored.content.status !== "found") throw new Error(stored.content.detail);
  return stored;
}
const page = (number: number, questions = [question(number, 1)]): WorkbookPage => ({ number, dayLabel: `Day ${number}`, type: "practice", image: { path: "PRIVATE PAGE IMAGE", width: 100, height: 100 }, qrToken: "PRIVATE QR TOKEN", printContract: null, questions });
let book: Workbook, source: ParentWorkbookAnswerSource;
const receipt = { workbookId: BOOK, childId: CHILD, parentId: PARENT, number: 1, deliveredAt: "2026-11-05T20:00:00Z" };
beforeEach(() => {
  book = { id: BOOK, parentId: PARENT, childId: CHILD, number: 1, levels: [2], status: "shipped", pdfPath: "PRIVATE WORKBOOK PDF", profileBuild: "PRIVATE PROFILE", createdAt: "2026-10-01T20:00:00Z", approvedAt: null, printedAt: null, shippedAt: "2026-11-01T20:00:00Z", printedRevision: null, pdfSha256: null, printManifest: null, pages: [page(1)] };
  source = { child: vi.fn().mockResolvedValue({ id: CHILD, parentId: PARENT, firstName: "Leah" }), workbook: vi.fn().mockImplementation(async () => book), delivery: vi.fn().mockResolvedValue(receipt), content: vi.fn().mockImplementation(async () => book) };
});

it.each([null, { ...receipt, deliveredAt: "2026-11-07T20:00:00Z" }, { ...receipt, deliveredAt: "bad time" }])("reads no answers without an effective confirmed delivery: %s", async delivery => {
  vi.mocked(source.delivery).mockResolvedValue(delivery);
  expect(await readParentWorkbookAnswers(source, request, NOW)).toBeNull();
  expect(source.content).not.toHaveBeenCalled();
});

it.each(["parentId", "childId", "workbookId"] as const)("refuses a foreign %s and never reads packages", async field => {
  expect(await readParentWorkbookAnswers(source, { ...request, [field]: OTHER }, NOW)).toBeNull();
  expect(source.content).not.toHaveBeenCalled();
});

it("requires the exact receipt identity, book number, shipped status and child", async () => {
  for (const change of [{ parentId: OTHER }, { childId: OTHER }, { workbookId: OTHER }, { number: 2 }]) {
    vi.mocked(source.delivery).mockResolvedValue({ ...receipt, ...change });
    expect(await readParentWorkbookAnswers(source, request, NOW)).toBeNull();
  }
  vi.mocked(source.delivery).mockResolvedValue(receipt);
  book.status = "printed";
  expect(await readParentWorkbookAnswers(source, request, NOW)).toBeNull();
  expect(source.content).not.toHaveBeenCalled();
});

it("refuses malformed route identities before any read", async () => {
  expect(await readParentWorkbookAnswers(source, { ...request, workbookId: "../workbook.pdf" }, NOW)).toBeNull();
  expect(source.child).not.toHaveBeenCalled();
});

it("rechecks delivery after reading content so a retraction or latest correction closes the key", async () => {
  vi.mocked(source.delivery).mockResolvedValueOnce(receipt).mockResolvedValueOnce(null);
  expect(await readParentWorkbookAnswers(source, request, NOW)).toBeNull();
  vi.mocked(source.delivery).mockResolvedValueOnce(receipt).mockResolvedValueOnce({ ...receipt, deliveredAt: "2026-11-07T20:00:00Z" });
  expect(await readParentWorkbookAnswers(source, request, NOW)).toBeNull();
});

it("shows the entire delivered legacy book without a print revision or any marking read, in printed order", async () => {
  book.pages = [page(8, [question(8, 3), question(8, 1)]), page(1, []), page(4)];
  const view = await readParentWorkbookAnswers(source, request, NOW);
  expect(view?.pages.map(p => p.number)).toEqual([4, 8]);
  expect(view?.pages[1].questions.map(q => q.number)).toEqual([1, 3]);
  expect(view?.pages.flatMap(p => p.questions).flatMap(q => q.answers.map(a => a.value))).toEqual(["42", "42", "42"]);
  const output = JSON.stringify(view);
  for (const hidden of ["PRIVATE", "pdfPath", "image", "qrToken", "steps", "package", "profileBuild", "operation"]) expect(output).not.toContain(hidden);
});

it("uses each stored region answer for multiple answers and choices", async () => {
  const item: Item = { format: "tick-and-number", scorable: true, parentChecked: false, regions: [
    { id: "operation", kind: "choice", mark: "tick", label: "Tick the operation", choices: ["+", "−", "×", "÷"], answer: "+" },
    { id: "answer", kind: "box", label: "Write the answer", answer: { type: "number", value: 42 } },
    { id: "work", kind: "work", label: "Show your work" },
  ], checks: [{ kind: "operation-sign", region: "operation" }, { kind: "operation", region: "answer" }], error: null };
  book.pages = [page(1, [question(1, 1, { kind: "add", operands: [24, 18] }, item)])];
  const q = (await readParentWorkbookAnswers(source, request, NOW))?.pages[0].questions[0];
  expect(q?.answers.map(a => a.value)).toEqual(["+", "42"]);
  expect(q?.hasOpenWork).toBe(true);
});

interface AnswerOrderCase { name: string; item: Item; values: string[]; slot: "mixed-set" | "on-your-own" | "word-problems" | "warm-up" | "math-in-the-world" | "solve-it-two-ways" | "challenge"; context?: boolean; consistentLayout?: boolean; measured?: boolean }
const answerOrderCases: AnswerOrderCase[] = [
  { name: "Mixed set", slot: "mixed-set", values: ["+", "42"], item: {
    format: "tick-and-number", scorable: true, parentChecked: false, regions: [
      { id: "answer", kind: "box", label: null, answer: { type: "number", value: 42 } },
      { id: "operation", kind: "choice", mark: "tick", label: null, choices: ["+", "−", "×", "÷"], answer: "+" },
    ], checks: [{ kind: "operation", region: "answer" }, { kind: "operation-sign", region: "operation" }], error: null,
  } },
  { name: "sequence", slot: "on-your-own", values: ["27", "31"], item: {
    format: "boxes", scorable: true, parentChecked: false, regions: [
      { id: "last", kind: "box", label: null, answer: { type: "number", value: 31 } },
      { id: "first", kind: "box", label: null, answer: { type: "number", value: 27 } },
    ], checks: [{ kind: "sequence", terms: [{ type: "number", value: 23 }, { type: "number", value: 25 }, { region: "first" }, { type: "number", value: 29 }, { region: "last" }], step: { type: "number", value: 2 } }], error: null,
  } },
  { name: "ordering", slot: "on-your-own", values: ["2", "4", "9"], item: {
    format: "boxes", scorable: true, parentChecked: false, regions: [
      { id: "third", kind: "box", label: null, answer: { type: "number", value: 9 } },
      { id: "first", kind: "box", label: null, answer: { type: "number", value: 2 } },
      { id: "second", kind: "box", label: null, answer: { type: "number", value: 4 } },
    ], checks: [{ kind: "order", numbers: [{ type: "number", value: 9 }, { type: "number", value: 2 }, { type: "number", value: 4 }], direction: "up", regions: ["first", "second", "third"] }], error: null,
  } },
];
const layoutOrderCases: AnswerOrderCase[] = answerOrderCases.flatMap(c => c.name === "Mixed set" ? [c] : [c, { ...c, name: `${c.name} in word problems`, slot: "word-problems", values: c.item.regions.flatMap(r => r.kind === "box" && r.answer ? [valueText(r.answer)] : []), context: true }]);
for (const words of ["ten", "eightbox", "ninewords", "ten red counters"]) {
  layoutOrderCases.push({ name: `${words.length}-character text and an inline number`, slot: "on-your-own", context: true,
    values: words.length > 8 ? ["10", words] : [words, "10"], item: {
      format: "hands-on", scorable: false, parentChecked: true, regions: [
        { id: "words", kind: "box", label: null, answer: { type: "text", value: words } },
        { id: "number", kind: "box", label: null, answer: { type: "number", value: 10 } },
      ], checks: [], error: null,
    } });
}
const longTextCase = layoutOrderCases.find(c => c.values.includes("ten red counters"));
if (!longTextCase) throw new Error("Fixture needs a long text answer");
layoutOrderCases.push({ ...longTextCase, name: "Warm-up omits full-width text", slot: "warm-up", values: ["10"] },
  { ...longTextCase, name: "Math in the world keeps direct box order", slot: "math-in-the-world", values: ["ten red counters", "10"] },
  { ...longTextCase, name: "legacy mixed rows use frozen positions", context: false, measured: true });
layoutOrderCases.push({ name: "likelihood choice follows an inline number", slot: "on-your-own", context: true, values: ["10", "never"], item: {
  format: "tick-and-number", scorable: false, parentChecked: true, regions: [
    { id: "likelihood", kind: "choice", mark: "tick", label: null, choices: ["never", "sometimes", "always"], answer: "never" },
    { id: "number", kind: "box", label: null, answer: { type: "number", value: 10 } },
  ], checks: [], error: null,
} });
for (const slot of ["math-in-the-world", "solve-it-two-ways"] as const) {
  for (const c of answerOrderCases.filter(c => c.name !== "Mixed set")) {
    layoutOrderCases.push({ ...c, name: `${c.name} in ${slot}`, slot, context: true,
      values: c.item.regions.flatMap(r => r.kind === "box" && r.answer ? [valueText(r.answer)] : []) });
  }
}
for (const consistentLayout of [false, true]) {
  layoutOrderCases.push({ ...longTextCase, name: `Challenge with consistent layout ${consistentLayout}`, slot: "challenge", consistentLayout, measured: true,
    values: consistentLayout ? ["ten red counters", "10"] : ["10", "ten red counters"] });
}
it.each(layoutOrderCases)("matches the printed $name parts when stored regions have another order", async ({ name, item, values, slot, context, consistentLayout, measured }) => {
  const draft = sampleBook({ level: "U16", workbookId: BOOK, childId: CHILD, child: "Leah" }).draft;
  const day = draft.pages.find(p => p.content?.kind === "day");
  if (!day || day.content?.kind !== "day") throw new Error("Fixture needs a day page");
  const stored = question(day.number, 1, name === "Mixed set" ? { kind: "add", operands: [24, 18] } : null, item);
  if (stored.content.status !== "found") throw new Error("Fixture needs a valid stored package");
  if (context) {
    stored.teaching = storedTeaching({ version: TEACHING_CONTEXT_VERSION, curriculum: { key: "bc", version: "synthetic" }, practiceType: slot,
      part: "practice", slot: "practice.1", extra: false, track: null, plannedStep: null, itemStep: null, reviewSteps: [],
      eligibility: { format: item.format, scorable: item.scorable, parentChecked: item.parentChecked, mastery: false, reason: item.scorable ? "no-item-step" : "parent-checked" } });
    expect(stored.teaching?.practiceType).toBe(slot);
  }
  const q = { number: 1, package: stored.content.package };
  const html = workbookTemplate().page({ ...day, questions: [q], content: { ...day.content, ...(consistentLayout === undefined ? {} : { consistentLayout }), blocks: [{ slot, items: [1] }] } }, { qr: "", qrUrl: "" }, draft);
  if (html === null) throw new Error("Fixture needs a printable day page");
  const printed = regionNames(q).map(x => ({ region: x.region, at: html.indexOf(`data-measure="${x.name}"`) })).filter(x => x.at >= 0).sort((a, b) => a.at - b.at);
  expect(printed).toHaveLength(values.length);
  expect(printed.map(x => "answer" in x.region && x.region.answer !== null ? typeof x.region.answer === "string" ? x.region.answer : valueText(x.region.answer) : null)).toEqual(values);
  if (measured) {
    stored.regions = storedRegions(printed.map((x, i) => ({ id: x.region.id, kind: x.region.kind, box: { x: 0, y: i * 40, width: 60, height: 20 } })), { width: 100, height: 100 });
    expect(stored.regions).toHaveLength(printed.length);
  }
  book.pages = [page(day.number, [stored])];
  expect((await readParentWorkbookAnswers(source, request, NOW))?.pages[0].questions[0].answers).toEqual(values.map((value, i) => ({ part: i + 1, value, alternatives: [] })));
  if (slot === "challenge" || (measured && context === false)) {
    stored.regions = null;
    expect((await readParentWorkbookAnswers(source, request, NOW))?.pages[0].questions[0]).toMatchObject({ kind: "unavailable", answers: [] });
  }
});

it.each<Operation>([
  { kind: "divide", operands: [27, 4] },
  { kind: "fraction-add", operands: [{ type: "fraction", numerator: 1, denominator: 4 }, { type: "fraction", numerator: 1, denominator: 4 }] },
  { kind: "quantity-add", operands: [{ type: "quantity", value: 4.75, unit: "$" }, { type: "quantity", value: 2.5, unit: "$" }] },
  { kind: "clock-convert", operands: [{ type: "time", hours: 15, minutes: 45, period: null }] },
])("keeps the stored typed answer for $kind", async operation => {
  book.pages = [page(1, [question(1, 1, operation)])];
  const value = (await readParentWorkbookAnswers(source, request, NOW))?.pages[0].questions[0].answers[0].value;
  expect(value).toBe(({ divide: "6 R 3", "fraction-add": "1/2", "quantity-add": "$7.25", "clock-convert": "3:45 p.m." } as Record<string, string>)[operation.kind]);
});

it("identifies a stored example for equations and admits that a drawing has no fixed key", async () => {
  const equation: Item = { format: "boxes", scorable: true, parentChecked: false, regions: [
    { id: "a", kind: "box", label: null, answer: { type: "number", value: 3 } },
    { id: "b", kind: "box", label: null, answer: { type: "number", value: 9 } },
  ], checks: [{ kind: "equations", equations: [{ left: { region: "a" }, op: "+", right: { region: "b" }, result: { type: "number", value: 12 } }], different: false, numbers: "whole" }], error: null };
  const drawing: Item = { format: "draw", scorable: false, parentChecked: true, regions: [{ id: "picture", kind: "picture", label: "Draw" }], checks: [], error: null };
  book.pages = [page(1, [question(1, 1, null, equation), question(1, 2, null, drawing)])];
  const questions = (await readParentWorkbookAnswers(source, request, NOW))!.pages[0].questions;
  expect(questions[0].kind).toBe("example"); expect(questions[0].answers.map(a => a.value)).toEqual(["3", "9"]);
  expect(questions[1]).toMatchObject({ kind: "open", answers: [] });
});

it("keeps an unavailable legacy question visible without internal reasons, and safely handles an empty book", async () => {
  book.pages[0].questions[0].content = { status: "unavailable", reason: "invalid-package", detail: "PRIVATE VALIDATION" };
  expect((await readParentWorkbookAnswers(source, request, NOW))?.pages[0].questions[0]).toMatchObject({ kind: "unavailable", answers: [] });
  expect(JSON.stringify(await readParentWorkbookAnswers(source, request, NOW))).not.toContain("VALIDATION");
  book.pages = [];
  expect((await readParentWorkbookAnswers(source, request, NOW))?.pages).toEqual([]);
});


it("keeps version 1 keys and their accepted forms without inventing a print contract", async () => {
  const q = question(1, 1);
  if (q.content.status !== "found" || !q.content.package.answer) throw new Error("Fixture must have a stored answer");
  q.content.package.answer.accepted = [{ type: "fraction", numerator: 84, denominator: 2 }];
  const legacy = storedQuestion({ number: 1, box: q.box, schemaVersion: 1, package: q.content.package }, { source: "workbook", workbookId: BOOK, page: 1, question: 1 });
  expect(legacy.content.status).toBe("found");
  book.pages = [page(1, [legacy])];
  expect((await readParentWorkbookAnswers(source, request, NOW))?.pages[0].questions[0].answers).toEqual([{ part: 1, value: "42", alternatives: ["84/2"] }]);
});
it("discloses a part with no fixed key even when another part has an answer", async () => {
  const item: Item = { format: "hands-on", scorable: false, parentChecked: true, regions: [
    { id: "open", kind: "box", label: null, answer: null },
    { id: "known", kind: "box", label: null, answer: { type: "number", value: 10 } },
  ], checks: [], error: null };
  book.pages = [page(1, [question(1, 1, null, item)])];
  expect((await readParentWorkbookAnswers(source, request, NOW))?.pages[0].questions[0]).toMatchObject({ answers: [{ part: 2, value: "10" }], hasOpenWork: true });
});
