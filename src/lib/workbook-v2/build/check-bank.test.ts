import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PageModel, Rect } from "../contract";
import divisionSnapshot from "../fixtures/snapshot-division.json";
import factsSnapshot from "../fixtures/snapshot-facts.json";
import placesSnapshot from "../fixtures/snapshot-place-value.json";
import wideSnapshot from "../fixtures/snapshot-4-digits.json";
import rawSnapshot from "../fixtures/snapshot.json";
import { TEMPLATES, type ItemPlace, type PageTemplate } from "../layout/templates";
import { RenderError, type Renderer } from "../renderer";
import { SHAPES, shapeLibrary, type Shape } from "../shapes";
import { fakeRenderer } from "../testing/fake-renderer";
import { drawPage, paint, toColourPng, toPng } from "../testing/raster";
import { stackOf } from "../testing/sample";
import { quickRenderer, skipTypstTests, testAssets } from "../testing/typst";
import { BANK_SEEDS, checkBank, FIGURE_SAMPLE_SEEDS } from "./check-bank";
import { capacityOf, contentOf, freezeBank, FULL_LEVEL, UNSEEN_ATTEMPTS } from "./freeze-bank";
import { validateSnapshot } from "../bank/snapshot";
import { storyCombos } from "./story-combos";
import { planBook } from "./build-book";
import { checkDrawing } from "../checks/drawn";
import inventedDraft from "../fixtures/draft-invented-topic.json";
import inventedSnapshot from "../fixtures/snapshot-invented-topic.json";
import { canonicalJson, sha256 } from "../hash";
import { rowTexts } from "./row-texts";

const isWhole = (page: PageModel) => page.regions.some((r) => r.role === "qr");
const pagesOf = (drawings: PageModel[][]) => drawings.flat();

type Snapshot = typeof rawSnapshot;
/** The example level with one row of two questions on each side, and a change. */
const snapshotWith = (change: (s: Snapshot) => unknown = () => {}): Snapshot => {
  const snapshot = structuredClone(rawSnapshot);
  for (const side of [snapshot.sheets[0].front, snapshot.sheets[0].back]) side.rows = [{ ...side.rows[0], items: 2 }];
  change(snapshot);
  return snapshot;
};
/** The templates with two places on each side, because each place costs three drawings. */
const SMALL: ReadonlyMap<string, PageTemplate> = new Map([...TEMPLATES].map(([id, t]) => [id, { ...t, sides: { front: { ...t.sides.front, places: t.sides.front.places.slice(0, 2) }, back: { ...t.sides.back, places: t.sides.back.places.slice(0, 2) } } }]));
const FEW = { seeds: 1, templates: SMALL };
const QUICK_STORY = { seeds: 1, templates: SMALL };
const mul = (): Shape => {
  const shape = SHAPES.get("mul.column");
  if (!shape) throw new Error("no shape");
  return shape;
};
const withShape = (change: (shape: Shape) => Partial<Shape>) => ({ ...FEW, shapes: shapeLibrary([{ ...mul(), ...change(mul()) }]) });
const FRONT = 'Sheet "column-multiplication-1", front side, row "no-carry"';
const BACK_ROW = rawSnapshot.sheets[0].back.rows[0].id;

type StoryLevel = typeof inventedSnapshot & Record<string, unknown>;
/** The sheet of word problems alone: one place a side for the questions of each side, and a change. */
function storyLevel(front: string[], back: string[], change: (s: StoryLevel) => unknown = () => {}): StoryLevel {
  const s = structuredClone(inventedSnapshot) as StoryLevel;
  const sheet = s.sheets[2];
  sheet.front.rows = [{ ...sheet.front.rows[0], items: 1, limits: { questions: front } }];
  sheet.back.rows = [{ ...sheet.back.rows[0], items: 1, limits: { questions: back } }];
  Object.assign(s, { sheets: [sheet], topics: [{ ...s.topics[0], sheets: [sheet.id] }] });
  change(s);
  return s;
}
/** The level with the Canadian region pack only, so that half as much is drawn. */
const canadaOnly = (s: StoryLevel) => {
  s.regionPacks = s.regionPacks.filter((p) => p.id === "CA");
  s.questions = s.questions.filter((q) => (q as { regions?: string[] }).regions?.includes("CA") ?? true);
};
const STORY = 'Sheet "story-problems-1"';

/** A copy of a template in which the places of some sides are changed. */
function templateWith(id: string, change: (place: ItemPlace, index: number, side: "front" | "back") => unknown): ReadonlyMap<string, PageTemplate> {
  const template = structuredClone(SMALL.get(id));
  if (!template) throw new Error("no template");
  for (const side of ["front", "back"] as const) template.sides[side].places.forEach((place, i) => change(place, i, side));
  return new Map([...SMALL, [id, template]]);
}
const moved = (rect: Rect, dx: number, dy = 0): Rect => ({ ...rect, x: rect.x + dx, y: rect.y + dy });

describe("a good bank", () => {
  it("has no problem, and each row is drawn at each place of both sides, together and alone", async () => {
    const renderer = fakeRenderer();
    const report = await checkBank(snapshotWith(), renderer, { seeds: 5 });
    expect(report.problems).toEqual([]);
    const whole = pagesOf(renderer.drawn.render);
    // Two rows, two sides each, with eight questions on each side. The widest questions of the rows differ, so each is drawn alone.
    expect(whole.every(isWhole)).toBe(true);
    expect(whole.map((p) => [p.side, p.regions.filter((r) => r.role === "slot").length])).toEqual([["front", 8], ["back", 8], ["front", 8], ["back", 8]]);
    expect(pagesOf(renderer.drawn.images).map((p) => p.regions.filter((r) => r.role === "slot").length)).toEqual(Array(32).fill(1));
    expect(report.checked).toEqual({ sheets: 1, rows: 2, seeds: 5, questions: 20, pages: whole.length, alone: 32, texts: expect.any(Number), samples: 0 });
    expect(pagesOf(renderer.drawn.report).flatMap((p) => p.regions)).toHaveLength(report.checked.texts);
  });

  it("asks for 200 seeds", () => expect(BANK_SEEDS).toBe(200));

  it("draws a question alone one time, also when two rows have the same widest question", async () => {
    const same = snapshotWith((s) => { s.sheets[0].back.rows = [{ ...s.sheets[0].front.rows[0], id: "again" }]; });
    expect(await checkBank(same, fakeRenderer(), FEW)).toMatchObject({ problems: [], checked: { alone: 4, pages: 4 } });
  });

  it("gives the same report for the same bank", async () => {
    expect(await checkBank(snapshotWith(), fakeRenderer(), FEW)).toEqual(await checkBank(snapshotWith(), fakeRenderer(), FEW));
  });
});

describe("the texts of a row", () => {
  const measured = async (snapshot: Snapshot, options: Parameters<typeof checkBank>[2] = {}) => {
    const renderer = fakeRenderer();
    const report = await checkBank(snapshot, renderer, { ...FEW, ...options, seeds: 1 });
    return { report, texts: new Set(pagesOf(renderer.drawn.report).flatMap((p) => p.regions.flatMap((r) => r.ink.flatMap((i) => (i.kind === "text" ? [i.text] : []))))) };
  };
  const rowOf = (template: string, shape: string, limits: object) => snapshotWith((s) => {
    for (const [i, side] of [s.sheets[0].front, s.sheets[0].back].entries()) Object.assign(side, { template, rows: [{ id: `row-${i}`, shape, limits, items: 1 }] });
  });

  it("are all that its list has, and not only those of the widest question and the seeds", async () => {
    const { report, texts } = await measured(rowOf("facts-2x10", "fact.add", { tables: [1, 7, 10, 20], second: { min: 0, max: 3 }, result: { min: 0, max: 20 }, order: "up" }));
    expect(report.problems).toEqual([]);
    expect([...texts]).toEqual(expect.arrayContaining(["1", "7", "10", "20", "0", "2", "3", "+", "="]));
    expect(texts.has("4") && texts.has("21")).toBe(false);
  });

  it("have every digit in each place of a stack that a shape with no list can fill, on both sides", () => {
    // The widest question is 5 + 5 with the answer 10: another one may be 12 - 5, with a digit in the tens of its top line.
    const shape: Shape = { ...mul(), worstCase: () => ({ question: null, answer: { parts: [{ name: "answer", kind: "whole-number", value: "10" }] } }), face: () => ({ kind: "column", top: "5", sign: "-", bottom: "5" }) };
    const templates = templateWith("columns-2x4", (p, _i, side) => { if ("topCells" in p) p.topCells[1] = { ...p.topCells[1], w: side === "front" ? 23 : 22 }; });
    const template = templates.get("columns-2x4");
    if (!template) throw new Error("no template");
    const { texts, problems } = rowTexts({ id: "row", shape, limits: {}, items: 1 }, template);
    expect(problems).toEqual([]);
    for (const [side, w] of [["front", 23], ["back", 22]] as const) {
      expect(new Set(texts.flatMap((t) => (t.side === side && t.ink.rect.w === w && t.ink.kind === "text" ? [t.ink.text] : [])))).toEqual(new Set("0123456789"));
    }
  });

  it("of a fields row have every digit at each admitted width and every place label on both sides", () => {
    const shape = SHAPES.get("place.value");
    const template = SMALL.get("places-2x2");
    if (!shape || !template) throw new Error("no shape or template");
    const limits = { digits: { min: 2, max: 4 }, number: { min: 10, max: 9999 }, zeros: { min: 0, max: 3 }, zeroInOnes: "allowed", zeroInTens: "allowed", zeroInHundreds: "allowed" };
    const { texts, problems } = rowTexts({ id: "places", shape, limits, items: 1 }, template);
    expect(problems).toEqual([]);
    for (const side of ["front", "back"] as const) {
      const shown = new Set(texts.flatMap((t) => (t.side === side && t.ink.kind === "text" ? [t.ink.text] : [])));
      for (const d of "0123456789") expect([...shown]).toEqual(expect.arrayContaining([d.repeat(2), d.repeat(3), d.repeat(4)]));
      expect([...shown]).toEqual(expect.arrayContaining(["thousands", "hundreds", "tens", "ones"]));
    }
  });

  it("of a shape with no list have as many digits as the longest number of its question, also one that is not printed", async () => {
    const { report, texts } = await measured(rowOf("sequences-2x2", "count.skip", { step: { min: 2, max: 2 }, direction: "up", start: { min: 92, max: 92 }, offStep: "never", terms: { min: 5, max: 5 }, blanks: { min: 1, max: 1 }, places: { min: 5, max: 5 } }));
    expect(report.problems).toEqual([]);
    // 92, 94, 96, 98 and a blank for 100: each place may hold three digits, whichever they are.
    expect(texts.has("100")).toBe(false);
    expect([...texts]).toEqual(expect.arrayContaining(["000", "444", "999"]));
  });

  it("that do not fit name every row that prints them", async () => {
    const renderer = fakeRenderer({ report: ({ texts }) => { for (const t of texts) if (t.text === "3") t.natural.w = 30; } });
    const limits = { tables: [3], second: { min: 0, max: 1 }, result: { min: 0, max: 9 }, order: "up" };
    const { problems } = await checkBank(rowOf("sums-1x10", "fact.add", limits), renderer, { ...FEW, seeds: 1 });
    expect(problems.filter((p) => p.includes('the text "3"') && p.includes("30 points wide and its place is 24"))).toEqual([
      'Sheet "column-multiplication-1", front side, row "row-0": the text "3" of "question-1" of the front side is 30 points wide and its place is 24.',
      'Sheet "column-multiplication-1", back side, row "row-1": the text "3" of "question-1" of the back side is 30 points wide and its place is 24.',
    ]);
  });

  it("of a question of the list that fits no place are a problem", async () => {
    const fact = SHAPES.get("fact.add");
    if (!fact) throw new Error("no shape");
    const shapes = shapeLibrary([{ ...fact, list: (l) => [...(fact.list?.(l) ?? []), { a: 2000, b: 1 }] }]);
    const { report } = await measured(rowOf("facts-2x10", "fact.add", { tables: [3], second: { min: 0, max: 1 }, result: { min: 0, max: 9 }, order: "up" }), { shapes });
    expect(report.problems).toContain('Sheet "column-multiplication-1", front side, row "row-0": the question 2000 + 1 = [2001] needs 4 characters in a number and the template "facts-2x10" has 3.');
  });

  it("of which one was not drawn, or with no report of their size, are a problem of their row", async () => {
    const left = fakeRenderer({ report: (out) => { out.texts = out.texts.filter((t) => t.text !== "="); } });
    const snapshot = rowOf("facts-2x10", "fact.add", { tables: [3], second: { min: 0, max: 1 }, result: { min: 0, max: 9 }, order: "up" });
    expect((await checkBank(snapshot, left, { ...FEW, seeds: 1 })).problems).toContain('Sheet "column-multiplication-1", front side, row "row-0": the text "=" of "question-1" of the front side was not drawn as the model says it.');
    const none = fakeRenderer({ report: (out) => { Reflect.set(out, "texts", undefined); } });
    expect((await checkBank(snapshot, none, { ...FEW, seeds: 1 })).problems[0]).toMatch(/^Sheet "column-multiplication-1", front side, row "row-0": the text .*gave no texts of page 1\.$/);
  });
});

describe("a bank of bar models, and the time log", () => {
  const SMALL_BARS = { groups: { min: 2, max: 3 }, size: { min: 2, max: 20 }, product: { min: 4, max: 60 } };
  const barsOf = (limits: object) => snapshotWith((s) => {
    for (const [i, side] of [s.sheets[0].front, s.sheets[0].back].entries()) Object.assign(side, { template: "figures-1x4", rows: [{ id: `bars-${i}`, shape: "figure.bar", limits, items: 2 }] });
  });
  /** The numbers in the bars of a page. */
  const barTexts = (page: PageModel) => page.regions.filter((r) => r.role === "question").flatMap((r) => {
    const bars = r.ink.filter((i) => i.kind === "outline").length;
    return r.ink.filter((i) => i.kind === "text").slice(0, bars).map((i) => (i.kind === "text" ? i.text : ""));
  });

  it("draws the widest question of each count of bars and the questions of some seeds, each at every place, together and alone", async () => {
    expect(FIGURE_SAMPLE_SEEDS).toBe(5);
    const renderer = fakeRenderer();
    const report = await checkBank(barsOf(SMALL_BARS), renderer, { seeds: 1, templates: SMALL });
    expect(report.problems).toEqual([]);
    const { samples } = report.checked;
    // Each side: 5 seeds, less those that give a question twice or a widest one (bars of 20).
    expect(samples).toBeGreaterThanOrEqual(6);
    expect(samples).toBeLessThanOrEqual(2 * FIGURE_SAMPLE_SEEDS);
    // Each question is drawn on a front and a back page, with every check of a book: 2 widest questions a side, and the samples.
    const whole = pagesOf(renderer.drawn.render);
    expect(whole).toHaveLength(2 * (2 * 2 + samples));
    const numbers = new Set(whole.flatMap(barTexts));
    expect(numbers.has("20")).toBe(true);
    expect([...numbers].filter((n) => n !== "20").length).toBeGreaterThan(2);
    // A question of a seed is drawn alone too, at each place of its side.
    expect(pagesOf(renderer.drawn.images).filter((p) => barTexts(p).some((n) => n !== "20")).length).toBeGreaterThan(4);
  });

  it("draws all five sampled seeds of a figure row when the space is wide enough", async () => {
    const wide = barsOf({ groups: { min: 2, max: 6 }, size: { min: 2, max: 99 }, product: { min: 4, max: 594 } });
    const report = await checkBank(wide, fakeRenderer(), { seeds: 1, templates: SMALL });
    expect(report.problems).toEqual([]);
    expect(report.checked.samples).toBe(2 * FIGURE_SAMPLE_SEEDS);
  });

  it("has every digit in each bar, as many as the largest number of each count of bars, on both sides", () => {
    const shape = SHAPES.get("figure.bar");
    const template = TEMPLATES.get("figures-1x4");
    if (!shape || !template) throw new Error("no shape or template");
    const { texts, problems } = rowTexts({ id: "bars", shape, limits: { groups: { min: 2, max: 6 }, size: { min: 2, max: 99 }, product: { min: 4, max: 594 } }, items: 1 }, template);
    expect(problems).toEqual([]);
    for (const side of ["front", "back"] as const) {
      const shown = texts.filter((t) => t.side === side && t.ink.kind === "text");
      for (const d of "0123456789") {
        // One width of a bar for each count of bars, at each of the four places.
        const widths = new Set(shown.filter((t) => t.ink.kind === "text" && t.ink.text === d.repeat(2)).map((t) => t.ink.rect.w));
        expect(widths.size).toBe(5);
      }
      expect(new Set(shown.map((t) => (t.ink.kind === "text" ? t.ink.text : "")))).toEqual(new Set([..."0123456789"].map((d) => d.repeat(2)).concat(["?", "Total ="])));
    }
  });

  it("checks the front page of each sheet with the time log, and finds ink in its boxes", async () => {
    const marked = fakeRenderer({ render: (out, pages) => { pages.forEach((page, i) => {
      const [capture] = page.captures;
      if (!capture) return;
      const canvas = drawPage(page);
      const { x, y } = capture.fields[0].rect;
      paint(canvas, { x: x + 20, y: y + 10, w: 3, h: 3 });
      out.images[i] = toPng(canvas);
    }); } });
    const { problems } = await checkBank(snapshotWith(), marked, FEW);
    expect(problems.join("\n")).toMatch(/^Sheet "column-multiplication-1", front side, row "no-carry": Page 381: the image has ink that the model does not have, at \(\d+, \d+\) in the box "start" of the time-log\.$/m);
    // A failed drawing is made again row by row, so the same pages come more than once.
    expect(new Set(pagesOf(marked.drawn.render).map((p) => `${p.side} ${p.captures.map((c) => c.kind).join()}`))).toEqual(new Set(["front time-log", "back "]));
    // A question that is drawn alone has no time log.
    expect(pagesOf(marked.drawn.images).every((p) => p.captures.length === 0 && !p.regions.some((r) => r.role === "capture"))).toBe(true);
  });
});

describe("a bank of word problems", () => {
  it("lists every phrasing of every question of a row with every scenario and region pack, one time for each text", () => {
    const bank = validateSnapshot(inventedSnapshot);
    if (!bank.ok || !bank.snapshot.stories) throw new Error("no stories");
    const sheet = bank.snapshot.sheets.get("story-problems-1")!;
    const labels = (side: "front" | "back") => storyCombos(sheet[side].rows[0], bank.snapshot.stories!).map((c) => c.label);
    // A question with no word of a region prints the same text in both regions, and is drawn one time.
    expect(labels("front")).toEqual([
      ...["bakery-boxes", "station-crates"].flatMap((s) => ["packs", "holds"].map((p) => `question "muffin-boxes", phrasing "${p}", scenario "${s}", region "CA"`)),
      ...["class-stickers", "rocket-snacks"].flatMap((s) => ["takes", "gives"].map((p) => `question "half-of-them", phrasing "${p}", scenario "${s}", region "CA"`)),
      ...["CA", "US"].flatMap((g) => ["cuts", "bow"].map((p) => `question "ribbon-cut", phrasing "${p}", scenario "craft-ribbon", region "${g}"`)),
    ]);
    expect(labels("back")).toEqual([
      ...["bakery-boxes", "station-crates"].flatMap((s) => ["given", "home"].map((p) => `question "muffins-left", phrasing "${p}", scenario "${s}", region "CA"`)),
      ...["CA", "US"].flatMap((g) => ["fills", "spills"].map((p) => `question "juice-left", phrasing "${p}", scenario "picnic-juice", region "${g}"`)),
      ...["saves", "finds"].map((p) => `question "toonie-savings", phrasing "${p}", scenario "piggy-bank", region "CA"`),
      ...["trades", "jar"].map((p) => `question "nickels-to-pennies", phrasing "${p}", scenario "piggy-bank", region "US"`),
    ]);
    // The widest numbers: the largest of each slot inside the limits of the scenario.
    const crates = storyCombos(sheet.front.rows[0], bank.snapshot.stories!).find((c) => c.label.includes('"station-crates"'))!;
    expect(crates.item.question.slots).toEqual([{ name: "groups", value: 6 }, { name: "each", value: 10 }]);
  });

  it("draws each combination at each place of both sides, together and alone, and measures its text with every digit", async () => {
    const renderer = fakeRenderer();
    const report = await checkBank(storyLevel(["muffin-boxes", "ribbon-cut"], ["half-of-them"]), renderer, { seeds: 2, templates: SMALL });
    expect(report.problems).toEqual([]);
    // 4 + 4 combinations on the front and 4 on the back, each on both pages of its side, and alone at each of its 4 places.
    expect(report.checked).toMatchObject({ sheets: 1, rows: 2, pages: 24, alone: 48, questions: 2 * 2 * 4 });
    const flows = pagesOf(renderer.drawn.report).flatMap((p) => p.regions.flatMap((r) => r.ink)).filter((i) => i.kind === "flow");
    const text = (i: (typeof flows)[number]) => (i.kind === "flow" ? i.tokens.map((t) => t.pieces.join("")).join(" ") : "");
    const eights = flows.filter((i) => text(i) === "There are 8 boxes at the bakery. Each one holds 88 muffins. How many muffins are there in all?");
    expect(eights.map((i) => i.rect.w)).toEqual([464 - 0.021 * 12]);
    expect(new Set(flows.filter((i) => text(i).startsWith("There are ") && text(i).includes(" boxes at the bakery.")).map(text)).size).toBe(10);
  });

  it("refuses a phrasing that its place cannot hold, with the sheet, the side, the row, the combination and the place", async () => {
    const long = Array.from({ length: 200 }, () => ({ word: "very" }));
    const draft = storyLevel(["ribbon-cut"], ["ribbon-cut"], (s) => {
      canadaOnly(s);
      const question = s.questions.find((q) => q.id === "ribbon-cut")!;
      question.phrasings[1].tokens.push(...long);
    });
    const result = await freezeBank(draft, fakeRenderer(), { seeds: 1, templates: SMALL });
    expect(result.ok).toBe(false);
    const told = result.ok ? "" : result.problems.join("\n");
    expect(told).toMatch(new RegExp(`^${STORY}, front side, row "one-step", question "ribbon-cut", phrasing "bow", scenario "craft-ribbon", region "CA": Page 385: the token "very" of "question-1" is below its place\\.$`, "m"));
    expect(told).toMatch(new RegExp(`^${STORY}, back side, row "two-steps", question "ribbon-cut", phrasing "bow", scenario "craft-ribbon", region "CA": Page 386: the token "very" of "question-2" is below its place\\.$`, "m"));
    expect(told).toMatch(new RegExp(`^${STORY}, front side, row "one-step", question "ribbon-cut", phrasing "bow", scenario "craft-ribbon", region "CA": the flow text of "question-1" of the front side: the token "very" is below its place\\.$`, "m"));
    expect(told).not.toMatch(/phrasing "cuts"/);
  });

  it("refuses a placeholder that does not fill, before anything is drawn", async () => {
    const renderer = fakeRenderer();
    const draft = storyLevel(["ribbon-cut"], ["ribbon-cut"], (s) => { s.questions.find((q) => q.id === "ribbon-cut")!.phrasings[0].tokens[0] = { word: "[spell.flavour]" }; });
    expect(await freezeBank(draft, renderer, QUICK_STORY)).toEqual({ ok: false, problems: [
      'Question "ribbon-cut", scenario "craft-ribbon", region "CA": phrasing "cuts": the region pack "CA" has no [spell.flavour].',
      'Question "ribbon-cut", scenario "craft-ribbon", region "US": phrasing "cuts": the region pack "US" has no [spell.flavour].',
    ] });
    expect(renderer.drawn).toEqual({ render: [], images: [], report: [] });
  });
});

describe("a bank with a problem", () => {
  it("that is in the file itself draws nothing", async () => {
    const renderer = fakeRenderer();
    const report = await checkBank(snapshotWith((s) => { s.sheets[0].front.template = "columns-9x9"; }), renderer, FEW);
    expect(report.problems).toEqual(['Sheet "column-multiplication-1", front side: there is no template "columns-9x9".']);
    expect(renderer.drawn).toEqual({ render: [], images: [], report: [] });
  });

  it.each<[string, Parameters<typeof withShape>[0], RegExp]>([
    ["a question that cannot be made", (s) => ({ generate: (l, seed) => { if (JSON.stringify(l).includes('"max":0')) throw new Error("no such number"); return s.generate(l, seed); } }), new RegExp(`^${FRONT}, seed 1: a question cannot be made \\(no such number\\)\\.$`)],
    ["a question that prints another number", (s) => ({ face: (q) => { const f = stackOf({ face: s.face(q) }); return { ...f, bottom: f.bottom === "9" ? "8" : String(Number(f.bottom) + 1) }; } }), new RegExp(`^${FRONT}, seed 1: Sheet "column-multiplication-1", front side, question 1 .*by one computation`)],
    ["a worked step that is not the answer", (s) => ({ steps: (q) => [...s.steps(q).slice(0, -1), { text: "0", marks: [] }] }), /seed 1: .*by one computation and "0" by the worked steps/],
    ["a widest question that cannot be made", () => ({ forms: () => { throw new Error("none"); } }), new RegExp(`^${FRONT}: the shape fails \\(none\\)\\.$`)],
    ["a shape that gives no form", () => ({ forms: () => [] }), new RegExp(`^${FRONT}: the shape gives no form of its questions, so their size is not known\\.$`)],
    ["limits that cannot be read", () => ({ readLimits: () => { throw new Error("none"); } }), new RegExp(`^${FRONT}: the shape fails \\(none\\)\\.$`)],
    ["questions that cannot be counted", () => ({ count: () => { throw new Error("none"); } }), new RegExp(`^${FRONT}: the shape fails \\(none\\)\\.$`)],
    ["a face that cannot be made", () => ({ face: () => { throw new Error("none"); } }), new RegExp(`^${FRONT}: the shape fails \\(none\\)\\.$`)],
  ])("names the sheet, the side and the row: %s", async (_name, change, problem) => {
    const { problems } = await checkBank(snapshotWith(), fakeRenderer(), withShape(change));
    expect(problems.some((p) => problem.test(p))).toBe(true);
  });

  it("in one of two rows of a side names that row and not the other", async () => {
    const two = snapshotWith((s) => { s.sheets[0].front.rows = structuredClone(rawSnapshot.sheets[0].front.rows).map((row) => ({ ...row, items: 1 })); });
    const [first, second] = two.sheets[0].front.rows;
    const bad = JSON.stringify(second.limits);
    expect(JSON.stringify(first.limits)).not.toBe(bad);
    const options = withShape((s) => ({ generate: (l, seed) => { if (JSON.stringify(l) === bad) throw new Error("no such number"); return s.generate(l, seed); } }));
    expect((await checkBank(two, fakeRenderer(), options)).problems).toEqual([`Sheet "column-multiplication-1", front side, row "${second.id}", seed 1: a question cannot be made (no such number).`]);
  });

  it("that only one seed has names the row and the seed", async () => {
    let wrong = "";
    const options = withShape((s) => ({ generate: (l, seed) => { const item = s.generate(l, seed); if (wrong === "" && JSON.stringify(l) !== "") wrong = seed; return seed === wrong ? { ...item, answer: { parts: [{ name: "answer", kind: "whole-number", value: "" }] } } : item; } }));
    expect((await checkBank(snapshotWith(), fakeRenderer(), options)).problems).toEqual([expect.stringMatching(/^Sheet "column-multiplication-1", front side, row "no-carry", seed 1: .*which is no whole-number\.$/)]);
  });

  it.each<[string, ReadonlyMap<string, PageTemplate>, RegExp]>([
    ["a digit in another place, at one place of the other side", templateWith("columns-2x4", (p, i, side) => { if (i === 1 && side === "back" && "bottomCells" in p) p.bottomCells = p.bottomCells.map((c) => moved(c, -24)); }), new RegExp(`^${FRONT}: Page 382: .*question 2 |^${FRONT}: Page 382: the ink of "question-2" is outside it`)],
    ["an answer area in the spine zone, at one place", templateWith("columns-2x4", (p, i, side) => { if (i === 0 && side === "front" && "answer" in p) p.answer = moved(p.answer, -60); }), new RegExp(`^${FRONT}: Page 381: "answer-1" enters the spine zone`)],
  ])("in a template names each row that uses it: %s", async (_name, templates, problem) => {
    const { problems } = await checkBank(snapshotWith(), fakeRenderer(), { ...FEW, templates });
    expect(problems.join("\n")).toMatch(new RegExp(problem.source, "m"));
    expect(problems.join("\n")).toContain(`back side, row "${BACK_ROW}"`);
  });

  it("in one drawing names the rows of that drawing and no other", async () => {
    const wrong = fakeRenderer({ render: (out, pages) => pages.forEach((page, i) => {
      if (page.side !== "back" || page.attempt !== 2) return;
      const canvas = drawPage(page);
      paint(canvas, { x: 20, y: 400, w: 3, h: 3 });
      out.images[i] = toPng(canvas);
    }) });
    expect((await checkBank(snapshotWith(), wrong, FEW)).problems).toEqual([`Sheet "column-multiplication-1", back side, row "${BACK_ROW}": Page 382: the image has ink that the model does not have, at (20, 400) in the margin.`]);
  });

  it("with a shape that has a form at the check of the file and none after it draws nothing for its rows, and says so", async () => {
    let asked = 0;
    const options = withShape((s) => ({ forms: (l) => (asked++ < 2 ? [s.worstCase(l)] : []) }));
    expect((await checkBank(snapshotWith(), fakeRenderer(), options)).problems).toEqual([FRONT, `Sheet "column-multiplication-1", back side, row "${BACK_ROW}"`].map((owner) => `${owner}: nothing was drawn, because the shape gives no form of its questions.`));
  });

  /** The bank check when the image of question 2 of the back side, drawn alone, is another one. */
  const withAlone = async (image: (page: PageModel) => Uint8Array) => (await checkBank(snapshotWith(), fakeRenderer({ images: (out, pages) => {
    const at = pages.findIndex((p) => p.side === "back" && p.regions.some((r) => r.id.endsWith("/slot-2")));
    if (at >= 0) out[at] = image(pages[at]);
  } }), FEW)).problems;
  const ALONE = `${FRONT}: question 2 of the back side, drawn alone:`;
  const without = (role: "question" | "label" | "answer") => (page: PageModel) => toPng(drawPage({ ...page, regions: page.regions.filter((r) => r.role !== role) }));
  it.each<[string, (page: PageModel) => Uint8Array, RegExp]>([
    ["ink outside the slot", (p) => { const canvas = drawPage(p); paint(canvas, { x: 20, y: 60, w: 3, h: 3 }, 244); return toPng(canvas); }, /it has ink outside "slot-2"\.$/],
    ["no ink", (p) => toPng(drawPage({ ...p, regions: [] })), /"label-2" must print "2" and the image has no ink there\.$/],
    ["no question", without("question"), /"question-2" must print "\d" and the image has no ink there\.$/],
    ["no number", without("label"), /"label-2" must print "2" and the image has no ink there\.$/],
    ["no border of its answer area", without("answer"), /the image has no outline of "answer-2"\.$/],
    ["another size", (p) => toPng(drawPage({ ...p, size: { w: p.size.w + 4.8, h: p.size.h } })), /the page image is \d+ by \d+ pixels and must be \d+ by \d+\.$/],
    ["a colour", (p) => { const canvas = drawPage(p); return toColourPng(canvas, [{ x: 200, y: 200, colour: [255, 250, 250] }]); }, /the image has a colour that is not a grey/],
    ["no image that can be read", () => new TextEncoder().encode("page"), /the page image cannot be read\.$/],
  ])("with a question that is drawn alone with %s names its place", async (_name, image, problem) => {
    const problems = await withAlone(image);
    for (const told of problems) expect(told.startsWith(ALONE)).toBe(true);
    expect(problems.some((told) => problem.test(told))).toBe(true);
  });

  it("with a question alone that gives no image names each question", async () => {
    const none = fakeRenderer({ images: (out) => out.splice(0) });
    const { problems } = await checkBank(snapshotWith(), none, FEW);
    expect(problems).toContain(`${ALONE} The typesetter must give one image for each of the 1 pages, and it gave 0.`);
    expect(problems).toContain(`Sheet "column-multiplication-1", back side, row "${BACK_ROW}": question 1 of the front side, drawn alone: The typesetter gave no image of page 381.`);
  });

  it.each<["render" | "images" | "report", RegExp]>([
    ["render", /^Sheet "column-multiplication-1", (front|back) side, row "[a-z-]+": Typst reported: a warning$/],
    ["images", /^Sheet "column-multiplication-1", (front|back) side, row "[a-z-]+": question \d of the (front|back) side, drawn alone: Typst reported: a warning\.$/],
    ["report", /^Sheet "column-multiplication-1", (front|back) side, rows? "[a-z-]+": the text ".*" of "[a-z-]+\d*" of the (front|back) side Typst reported: a warning\.$/],
  ])("with a typesetter that fails (%s) names each row, and a fault in the code is not hidden", async (kind, form) => {
    const fails = fakeRenderer({ [kind]: () => { throw new RenderError("Typst reported: a warning"); } });
    const { problems } = await checkBank(snapshotWith(), fails, FEW);
    expect(problems.length).toBeGreaterThan(1);
    for (const problem of problems) expect(problem).toMatch(form);
    const broken = fakeRenderer({ [kind]: () => { throw new TypeError("a fault"); } });
    await expect(checkBank(snapshotWith(), broken, FEW)).rejects.toThrow("a fault");
  });

  it("with rows that can only be drawn one by one names all rows of the drawing", async () => {
    const together = fakeRenderer({ render: (_out, pages) => { if (pages.length > 2) throw new RenderError("too many pages"); } });
    expect((await checkBank(snapshotWith(), together, FEW)).problems).toEqual([`${FRONT} and Sheet "column-multiplication-1", back side, row "${BACK_ROW}", drawn together: too many pages`]);
  });
});

describe.skipIf(skipTypstTests())("with the real Typst", () => {
  let folder = "";
  let opened: Promise<Renderer> | undefined;
  const typst = () => opened ??= quickRenderer(folder);
  beforeAll(() => { folder = mkdtempSync(join(tmpdir(), "workbook-v2-bank-")); });
  afterAll(() => rmSync(folder, { recursive: true, force: true }));

  /** A level with a side of each template, with one row on each side. The sequences have few forms. */
  function allTemplates() {
    const [times, , groups, missing, long] = factsSnapshot.sheets;
    const pairs = [
      [rawSnapshot.sheets[0].front, wideSnapshot.sheets[0].front], [times.front, groups.front], [groups.back, missing.back],
      [long.front, placesSnapshot.sheets[0].front], ...[1, 3, 5].map((i) => [divisionSnapshot.sheets[i].front, divisionSnapshot.sheets[i + 1].front]),
      [placesSnapshot.sheets[1].back, rawSnapshot.sheets[0].front],
    ];
    const sheets = pairs.map((pair, i) => {
      const [front, back] = structuredClone(pair).map((side, s) => ({ ...side, rows: side.rows.slice(0, 1).map((row) => ({ ...row, id: `row-${s}`, items: Math.min(row.items, 2), limits: row.shape === "count.skip" ? { ...row.limits, blanks: { min: 1, max: 1 }, places: { min: 3, max: 3 } } : row.shape === "add.repeated" ? { ...row.limits, count: { min: 5, max: 5 } } : row.limits })) }));
      return { id: `sheet-${i}`, firstPage: 2 * i + 1, front, back };
    });
    return { ...rawSnapshot, topics: [{ ...rawSnapshot.topics[0], sheets: sheets.map((s) => s.id) }], sheets };
  }

  it("a level with the fifteen templates of the example levels has no problem", async () => {
    const snapshot = allTemplates();
    expect(new Set(snapshot.sheets.flatMap((s) => [s.front.template, s.back.template])).size).toBe(15);
    const { problems, checked } = await checkBank(snapshot, await typst(), FEW);
    expect(problems).toEqual([]);
    expect(checked).toMatchObject({ sheets: 8, rows: 16, questions: expect.any(Number) });
  });

  it("a text that is too wide is found: an instruction, a title, and a number that no seed prints but the limits admit", async () => {
    // "10" fits a cell of 20 points and "20" does not. The cells stay side by side, up to the area.
    const templates = templateWith("facts-2x10", (p) => {
      if (!("forms" in p)) return;
      let { x } = p.forms[0].at(-1)?.area?.reach ?? { x: 0 };
      for (const cell of p.forms[0].slice(0, -1).reverse()) {
        const w = cell.text && cell.text.w > 30 ? 20 : cell.text?.w ?? 0;
        x -= w;
        if (cell.text) cell.text = { ...cell.text, x, w };
      }
    });
    const snapshot = snapshotWith((s) => {
      const { front, back } = s.sheets[0];
      Object.assign(front, { template: "facts-2x10", rows: [{ id: "facts", shape: "fact.add", items: 1, limits: { tables: [10, 20], second: { min: 0, max: 0 }, result: { min: 0, max: 20 }, order: "mixed" } }] });
      back.instruction = "W".repeat(58);
      s.topics[0].title = "W".repeat(44);
    });
    const problems = (await checkBank(snapshot, await typst(), { seeds: 0, templates })).problems.join("\n");
    expect(problems).toContain('Sheet "column-multiplication-1", front side, row "facts": the text "20" of "question-1" of the front side is 23.08 points wide and its place is 20.');
    expect(problems).toMatch(new RegExp(`^Sheet "column-multiplication-1", back side, row "${BACK_ROW}": Page 381: the text "${"W".repeat(58)}" of "instruction" is \\d+\\.\\d+ points wide and its place is 486\\.$`, "m"));
    expect(problems).toMatch(new RegExp(`^Sheet "column-multiplication-1", front side, row "facts": Page 382: the text "3-20 · ${"W".repeat(44)}" of "heading" is \\d+\\.\\d+ points wide and its place is 443\\.$`, "m"));
  });

  it("draws every combination of a word problem with the half as one piece, and passes every check", async () => {
    const renderer = await typst();
    const drawnTexts: string[] = [];
    const watching: Renderer = { ...renderer, render: async (pages) => { const out = await renderer.render(pages); drawnTexts.push(...out.texts.map((t) => t.text)); return out; } };
    const level = storyLevel(["half-of-them"], ["half-of-them"], (s) => {
      canadaOnly(s);
      s.scenarios = s.scenarios.filter((one) => one.interest === "default");
    });
    expect((await checkBank(level, watching, { seeds: 1, templates: SMALL })).problems).toEqual([]);
    expect(drawnTexts.filter((t) => t === "½").length).toBeGreaterThan(0);
    expect(drawnTexts.filter((t) => t.includes("½") && t !== "½")).toEqual([]);
  });

  it("finds a unit that its place beside the answer area cannot hold", async () => {
    const snapshot = storyLevel(["ribbon-cut"], ["ribbon-cut"], (s) => { s.regionPacks[0].units.length.many = "extraordinarily long centimetres"; });
    const book = { bookId: "long-unit", childId: "child", sheets: [{ sheetId: "story-problems-1", attempt: 1, qr: { front: "long-unit-front", back: "long-unit-back" } }] };
    const plan = planBook({ snapshot, book });
    if (!plan.ok) throw new Error(plan.problems.join("\n"));
    const problems = checkDrawing(plan.pages, plan.items, await (await typst()).render(plan.pages)).join("\n");
    expect(problems).toMatch(/^Page 385: the text "extraordinarily long centimetres" of "question-1" is \d+\.\d+ points wide and its place is 118\.$/m);
  });

  it("ink that a drawing puts past the slot of a question is found in the page and in the question that is drawn alone", async () => {
    const source = readFileSync(testAssets().template, "utf8");
    const mark = "      if reports { report(region.id) }";
    const template = join(folder, "page.typ");
    writeFileSync(template, source.replace(mark, `${mark}\n      if region.role == "label" { place(origin, dx: -20 * 1pt, rect(width: 1pt, height: 1pt, fill: luma(240))) }`));
    expect(readFileSync(template, "utf8")).not.toBe(source);
    const one = snapshotWith((s) => { s.sheets[0].back.rows = [{ ...s.sheets[0].front.rows[0], id: "again" }]; });
    const problems = (await checkBank(one, await quickRenderer(folder, { ...testAssets(), template }), FEW)).problems.join("\n");
    expect(problems).toMatch(/^Sheet "column-multiplication-1", front side, row "no-carry": Page 381: the image has ink that the model does not have, at \(70, \d+\) in the spine zone\.$/m);
    for (const side of ["front", "back"]) expect(problems).toContain(`${FRONT}: question 2 of the ${side} side, drawn alone: it has ink outside "slot-2".`);
  });
});

describe("the freeze of a draft", () => {
  type Draft = typeof inventedDraft & Record<string, unknown>;
  const draftWith = (change: (d: Draft) => unknown = () => {}): Draft => {
    const draft = structuredClone(inventedDraft) as Draft;
    change(draft);
    return draft;
  };
  /** Both sheets with one row of two questions a side, for the templates of two places: little to draw. */
  /** A row of word problems keeps its first question, which every region has, in one place. */
  const cut = (d: Draft) => {
    for (const sheet of d.sheets) {
      for (const side of [sheet.front, sheet.back] as { rows: { shape: string; limits: unknown; items: number }[] }[]) {
        const [row] = side.rows;
        side.rows = [row.shape === "story" ? { ...row, items: 1, limits: { questions: (row.limits as { questions: string[] }).questions.slice(0, 1) } } : { ...row, items: 2 }];
      }
    }
  };
  // The content is what these tests look at: the drawings of sampled seeds have tests of their own.
  const QUICK = { seeds: 1, figureSamples: 0, templates: SMALL };
  const SENTINEL = "made-up-source-7f3a: page 12 of an invented book";
  /** More notes, with a made-up source: at the level, a topic, a sheet, a side and a row. */
  const notes = (d: Draft) => {
    const [mul, bars] = d.sheets as Record<string, unknown>[];
    Object.assign(d, { basis: { source: SENTINEL } });
    Object.assign(d.topics[0], { basis: SENTINEL });
    Object.assign(mul, { basis: [SENTINEL, { deeper: SENTINEL }] });
    Object.assign((bars as { back: object }).back, { basis: { note: SENTINEL } });
    Object.assign((mul as { front: { rows: object[] } }).front.rows[0], { basis: { photo: SENTINEL, page: 12 } });
    // A question, a scenario and a region pack hold notes of their own.
    Object.assign(d.questions[1], { basis: { source: SENTINEL } });
    Object.assign(d.scenarios[2], { basis: SENTINEL });
    Object.assign(d.regionPacks[1], { basis: [SENTINEL] });
  };

  it("copies the content only: no note and no word of a note is in the frozen snapshot", async () => {
    const draft = draftWith((d) => { cut(d); notes(d); });
    expect(JSON.stringify(draft)).toContain(SENTINEL);
    const result = await freezeBank(draft, fakeRenderer(), QUICK);
    if (!result.ok) throw new Error(result.problems.join("\n"));
    const frozen = JSON.stringify(result.snapshot);
    expect(frozen).not.toContain("basis");
    expect(frozen).not.toContain(SENTINEL);
    expect(frozen).not.toContain("made-up-source");
    const content = draftWith(cut) as Record<string, unknown>;
    expect(result.snapshot).toEqual(contentOf(content));
    expect(result.hash).toBe(sha256(canonicalJson(result.snapshot)));
    expect(result.checked).toMatchObject({ sheets: 3, rows: 6, seeds: 1, samples: 0 });
  });

  it("makes the checked-in snapshot of the checked-in draft, with its notes", () => {
    expect(JSON.stringify(inventedDraft)).toContain('"basis"');
    expect(canonicalJson(contentOf(draftWith()))).toBe(canonicalJson(inventedSnapshot));
    expect(canonicalJson(contentOf(draftWith(notes)))).toBe(canonicalJson(inventedSnapshot));
  });

  it("gives the capacity of each sheet and row", () => {
    const bank = validateSnapshot(inventedSnapshot);
    if (!bank.ok) throw new Error(bank.problems.join("\n"));
    const capacity = capacityOf(bank.snapshot.sheets);
    const bars = capacity.find((c) => c.sheet === "equal-groups-1");
    // Counted by hand: 2 or 3 bars of 2 to 20 with a total up to 60 are 19 + 19; 4 to 6 bars of 2 to 25 are 3 x 24; and so on.
    expect(bars?.rows.map(({ row, side, items, possible, attemptsWithoutRepeat }) => [row, side, items, possible, attemptsWithoutRepeat])).toEqual([
      ["two-or-three-bars", "front", 2, 38, 19], ["four-to-six-bars", "front", 2, 72, 36], ["larger-bars", "back", 2, 123, 61], ["five-or-six-bars", "back", 2, 180, 90],
    ]);
    expect(bars).toMatchObject({ attemptsWithoutRepeat: 19, warnings: [] });
    expect(capacity.map((c) => c.sheet)).toEqual(["column-multiplication-1", "equal-groups-1", "story-problems-1"]);
    // A story counts its defined questions: one with other numbers is the same story. Each region has 3 for 3 places.
    const stories = capacity.find((c) => c.sheet === "story-problems-1");
    expect(stories?.rows.map(({ row, possible, attemptsWithoutRepeat }) => [row, possible, attemptsWithoutRepeat])).toEqual([["one-step", 3, 1], ["two-steps", 3, 1]]);
  });

  it("gives the capacity with the snapshot", async () => {
    const result = await freezeBank(draftWith(cut), fakeRenderer(), QUICK);
    expect(result.ok && result.capacity.map((c) => [c.sheet, c.rows.length])).toEqual([["column-multiplication-1", 2], ["equal-groups-1", 2], ["story-problems-1", 2]]);
  });

  it("warns of a row with less than one full unseen repeat", () => {
    expect(UNSEEN_ATTEMPTS).toBe(2);
    const draft = draftWith((d) => {
      const [, sheet] = d.sheets;
      sheet.front.rows[1].limits = { groups: { min: 6, max: 6 }, size: { min: 98, max: 99 }, product: { min: 4, max: 594 } };
      sheet.back.rows[0].limits = { groups: { min: 2, max: 2 }, size: { min: 10, max: 13 }, product: { min: 20, max: 200 } };
      for (const one of [d, d.topics[0], sheet, sheet.front, sheet.front.rows[0], d.sheets[2], d.sheets[2].front.rows[0], d.regionPacks[0], d.scenarios[0], d.questions[0]]) Reflect.deleteProperty(one, "basis");
    });
    const bank = validateSnapshot(draft);
    if (!bank.ok) throw new Error(bank.problems.join("\n"));
    const [, bars] = capacityOf(bank.snapshot.sheets);
    expect(bars.attemptsWithoutRepeat).toBe(1);
    expect(bars.warnings).toEqual(['Sheet "equal-groups-1", front side, row "four-to-six-bars": its limits allow 2 questions for 2 places, so the next attempt of the sheet repeats questions of this row.']);
    expect(bars.rows.find((r) => r.row === "larger-bars")).toMatchObject({ possible: 4, attemptsWithoutRepeat: 2, warnings: [] });
  });

  it("counts shared questions once across rows of a sheet, whether their limits match or overlap", async () => {
    const fourA = { groups: { min: 2, max: 2 }, size: { min: 2, max: 5 }, product: { min: 4, max: 20 } };
    const fourB = { groups: { min: 2, max: 2 }, size: { min: 3, max: 6 }, product: { min: 4, max: 20 } };
    // Four rows of two places all sharing the same four questions: even one attempt repeats.
    const shared = draftWith((d) => {
      d.topics[0].sheets = ["equal-groups-1"];
      d.sheets = [d.sheets[1]];
      for (const side of [d.sheets[0].front, d.sheets[0].back]) for (const row of side.rows) row.limits = structuredClone(fourA);
    });
    const result = await freezeBank(shared, fakeRenderer(), { seeds: 1, figureSamples: 0 });
    if (!result.ok) throw new Error(result.problems.join("\n"));
    expect(result.capacity).toHaveLength(1);
    expect(result.capacity[0].attemptsWithoutRepeat).toBe(0);
    expect(result.capacity[0].warnings).toEqual(['Sheet "equal-groups-1", rows "two-or-three-bars", "four-to-six-bars", "larger-bars", "five-or-six-bars": together their limits allow 4 questions for 8 places, so one attempt of the sheet repeats a question across these rows.']);

    // Two rows with different but overlapping limits (4 questions each, 5 in their union) for 4 places -> 1 attempt.
    const overlap = draftWith((d) => {
      const [, sheet] = d.sheets;
      sheet.front.rows = [{ ...sheet.front.rows[0], limits: fourA, items: 2 }];
      sheet.back.rows = [{ ...sheet.back.rows[0], limits: fourB, items: 2 }];
    });
    const bank = validateSnapshot(contentOf(overlap));
    if (!bank.ok) throw new Error(bank.problems.join("\n"));
    const [, bars] = capacityOf(bank.snapshot.sheets);
    expect(bars.attemptsWithoutRepeat).toBe(1);
    expect(bars.warnings).toEqual(['Sheet "equal-groups-1", rows "two-or-three-bars", "larger-bars": together their limits allow 5 questions for 4 places, so the next attempt of the sheet repeats questions across these rows.']);

    // Listed shapes (fact.mul) share questions across rows too.
    const listed = structuredClone(factsSnapshot);
    const factsA = { tables: [3], second: { min: 1, max: 4 }, result: { min: 0, max: 100 }, order: "mixed" };
    const factsB = { tables: [3], second: { min: 2, max: 5 }, result: { min: 0, max: 100 }, order: "mixed" };
    listed.sheets[0].front.rows = [{ id: "f", shape: "fact.mul", items: 2, limits: factsA }];
    listed.sheets[0].back.rows = [{ id: "b", shape: "fact.mul", items: 2, limits: factsB }];
    listed.topics = [{ ...listed.topics[0], sheets: [listed.sheets[0].id] }];
    listed.sheets = [listed.sheets[0]];
    const listedBank = validateSnapshot(listed);
    if (!listedBank.ok) throw new Error(listedBank.problems.join("\n"));
    const [facts] = capacityOf(listedBank.snapshot.sheets);
    expect(facts.attemptsWithoutRepeat).toBe(1);
    expect(facts.exact).toBe(true);
    expect(facts.warnings).toEqual(['Sheet "times-facts", rows "f", "b": together their limits allow 5 questions for 4 places, so the next attempt of the sheet repeats questions across these rows.']);

    // Bounded figure.bar pools up to 490 questions are enumerated in full: 490 union / 8 places = 61 exact attempts.
    const wideBars = draftWith((d) => {
      const [, sheet] = d.sheets;
      const mins = [2, 3, 4, 5];
      [...sheet.front.rows, ...sheet.back.rows].forEach((row, i) => {
        row.limits = { groups: { min: 2, max: 6 }, size: { min: mins[i], max: 99 }, product: { min: 4, max: 594 } };
        row.items = 2;
      });
    });
    const wideBank = validateSnapshot(contentOf(wideBars));
    if (!wideBank.ok) throw new Error(wideBank.problems.join("\n"));
    const [, wideBarCap] = capacityOf(wideBank.snapshot.sheets);
    expect(wideBarCap).toMatchObject({ attemptsWithoutRepeat: 61, exact: true, warnings: [] });

    // More than 12 distinct limit groups: exact bipartite solver catches a 3-row bottleneck among 13 groups.
    const thirteen = structuredClone(factsSnapshot);
    const makeRow = (id: string, table: number, min: number, max: number) => ({ id, shape: "fact.mul", items: 1, limits: { tables: [table], second: { min, max }, result: { min: 0, max: 100 }, order: "mixed" } });
    thirteen.sheets[0].front.rows = [
      makeRow("t1-lo", 1, 1, 5),
      makeRow("t2-lo", 2, 1, 5),
      makeRow("t3-a", 3, 1, 4),
      makeRow("t3-b", 3, 1, 5),
      makeRow("t3-c", 3, 2, 5),
      makeRow("t4", 4, 6, 10),
      makeRow("t6", 6, 6, 10),
    ];
    thirteen.sheets[0].back.rows = [
      makeRow("t1-hi", 1, 6, 10),
      makeRow("t2-hi", 2, 6, 10),
      makeRow("t5", 5, 6, 10),
      makeRow("t7", 7, 6, 10),
      makeRow("t8", 8, 6, 10),
      makeRow("t9", 9, 6, 10),
    ];
    thirteen.topics = [{ ...thirteen.topics[0], sheets: [thirteen.sheets[0].id] }];
    thirteen.sheets = [thirteen.sheets[0]];
    const thirteenBank = validateSnapshot(thirteen);
    if (!thirteenBank.ok) throw new Error(thirteenBank.problems.join("\n"));
    const [thirteenCap] = capacityOf(thirteenBank.snapshot.sheets);
    expect(thirteenCap.attemptsWithoutRepeat).toBe(1);
    expect(thirteenCap.exact).toBe(true);
    expect(thirteenCap.warnings).toEqual(['Sheet "times-facts", rows "t3-a", "t3-b", "t3-c": together their limits allow 5 questions for 3 places, so the next attempt of the sheet repeats questions across these rows.']);

    // Huge non-listed overlapping pools (> 500 questions each) report exact: false (upper bound) instead of claiming exact capacity.
    const huge = structuredClone(wideSnapshot);
    const bigLimits = (aMin: number) => ({ digits: { min: 4, max: 4 }, a: { min: aMin, max: 9999 }, b: { min: 2, max: 9 }, carries: { min: 0, max: 3 }, carryIntoTens: { min: 0, max: 8 }, carryIntoHundreds: { min: 0, max: 8 }, carryIntoThousands: { min: 0, max: 8 }, product: { min: 2000, max: 89991 }, zeroInProduct: "allowed", wholeTens: "allowed" });
    huge.sheets[0].front.rows = [{ id: "big-a", shape: "mul.column", items: 2, limits: bigLimits(1000) }];
    huge.sheets[0].back.rows = [{ id: "big-b", shape: "mul.column", items: 2, limits: bigLimits(1001) }];
    const hugeBank = validateSnapshot(huge);
    if (!hugeBank.ok) throw new Error(hugeBank.problems.join("\n"));
    const [hugeCap] = capacityOf(hugeBank.snapshot.sheets);
    expect(hugeCap.exact).toBe(false);

    // An overlapping row with its own warning (A: 3 places from 2..6, 1 attempt alone) must not hide a shared conflict between B and C (1 place each from 1..2).
    const hidden = structuredClone(factsSnapshot);
    hidden.sheets[0].front.rows = [
      { id: "b", shape: "fact.mul", items: 1, limits: { tables: [3], second: { min: 1, max: 2 }, result: { min: 0, max: 100 }, order: "mixed" } },
      { id: "c", shape: "fact.mul", items: 1, limits: { tables: [3], second: { min: 1, max: 2 }, result: { min: 0, max: 100 }, order: "mixed" } },
    ];
    hidden.sheets[0].back.rows = [
      { id: "a", shape: "fact.mul", items: 3, limits: { tables: [3], second: { min: 2, max: 6 }, result: { min: 0, max: 100 }, order: "mixed" } },
    ];
    hidden.topics = [{ ...hidden.topics[0], sheets: [hidden.sheets[0].id] }];
    hidden.sheets = [hidden.sheets[0]];
    const hiddenBank = validateSnapshot(hidden);
    if (!hiddenBank.ok) throw new Error(hiddenBank.problems.join("\n"));
    const [hiddenCap] = capacityOf(hiddenBank.snapshot.sheets);
    expect(hiddenCap.attemptsWithoutRepeat).toBe(1);
    expect(hiddenCap.warnings).toEqual([
      'Sheet "times-facts", back side, row "a": its limits allow 5 questions for 3 places, so the next attempt of the sheet repeats questions of this row.',
      'Sheet "times-facts", rows "b", "c": together their limits allow 2 questions for 2 places, so the next attempt of the sheet repeats questions across these rows.',
    ]);
  });

  it("ignores inherited properties on Object.prototype when copying draft content", async () => {
    const draft = draftWith((d) => {
      cut(d);
      Reflect.deleteProperty(d.sheets[0], "front");
    });
    const fakeFront = structuredClone(inventedDraft.sheets[0].front);
    Object.defineProperty(Object.prototype, "front", { value: fakeFront, configurable: true, writable: true });
    try {
      const stripped = contentOf(draft);
      expect(Object.hasOwn((stripped.sheets as Record<string, unknown>[])[0], "front")).toBe(false);
      const result = await freezeBank(draft, fakeRenderer(), QUICK);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.problems.join("\n")).toMatch(/front is missing/);
    } finally {
      Reflect.deleteProperty(Object.prototype, "front");
    }
  });

  it.each<[string, (d: Draft) => unknown, RegExp]>([
    ["a note in the limits of a row", (d) => { Object.assign(d.sheets[1].front.rows[0].limits, { basis: SENTINEL }); }, /The draft has a note "basis" at sheets\[1\]\.front\.rows\[0\]\.limits, where a draft may not have one/],
    ["a note in the level", (d) => { Object.assign(d.level, { basis: SENTINEL }); }, /The draft has a note "basis" at level, where a draft may not have one/],
    ["a note in a phrasing", (d) => { Object.assign(d.questions[0].phrasings[0], { basis: SENTINEL }); }, /^The draft has a note "basis" at questions\[0\]\.phrasings\[0\], where a draft may not have one: only the level, a topic, a sheet, a side, a row, a question, a scenario and a region pack may\.$/m],
    ["a note in a token", (d) => { Object.assign(d.questions[2].phrasings[1].tokens[3], { basis: SENTINEL }); }, /The draft has a note "basis" at questions\[2\]\.phrasings\[1\]\.tokens\[3\]/],
    ["a note in the limits of a scenario", (d) => { Object.assign(d.scenarios[0].quantityLimits, { basis: SENTINEL }); }, /The draft has a note "basis" at scenarios\[0\]\.quantityLimits, where/],
    ["a note in the units of a region pack", (d) => { Object.assign(d.regionPacks[0].units, { basis: SENTINEL }); }, /The draft has a note "basis" at regionPacks\[0\]\.units, where/],
    ["a note in a formula", (d) => { Object.assign(d.questions[0].solver, { basis: SENTINEL }); }, /The draft has a note "basis" at questions\[0\]\.solver, where/],
    ["a field that is not a note", (d) => { Object.assign(d.sheets[0], { source: SENTINEL }); }, /Sheet "column-multiplication-1": unknown field "source"\./],
    ["a sheet that does not follow the one before it", (d) => { d.sheets[1].firstPage = 387; }, /^Topic "topic-20": the sheet "equal-groups-1" starts on page 387 and must start on page 383, after the sheet "column-multiplication-1"\.$/],
    ["sheets of a topic in another order than their pages", (d) => { d.topics[0].sheets.reverse(); }, /the sheet "column-multiplication-1" starts on page 381 and must start on page 385/],
    ["a template that a row does not fit", (d) => { d.sheets[1].front.template = "places-2x2"; }, /Sheet "equal-groups-1", front side, row "two-or-three-bars": the template "places-2x2" has no place for a figure question/],
    ["a row that asks for more questions than its limits allow", (d) => { d.sheets[1].front.rows[0].limits = { groups: { min: 2, max: 2 }, size: { min: 2, max: 2 }, product: { min: 4, max: 4 } }; }, /row "two-or-three-bars": the row asks for 2 different questions and its limits allow 1/],
    ["a level of one topic when a full level is asked for", (d) => { Object.assign(d, { full: true }); }, /^The level has 1 topic and a full level has 20\.\nTopic "topic-20" has 3 sheets and a topic of a full level has 10\.$/],
  ])("refuses %s and gives no snapshot", async (_name, change, problem) => {
    const draft = draftWith((d) => { cut(d); change(d); });
    const full = Reflect.get(draft, "full") === true;
    Reflect.deleteProperty(draft, "full");
    const renderer = fakeRenderer();
    const result = await freezeBank(draft, renderer, { ...QUICK, requireFullLevel: full });
    expect(result.ok).toBe(false);
    expect("snapshot" in result).toBe(false);
    if (!result.ok) expect(result.problems.join("\n")).toMatch(new RegExp(problem.source, "m"));
    expect(renderer.drawn).toEqual({ render: [], images: [], report: [] });
  });

  it("asks for 20 topics of 10 sheets only for a full level", () => expect(FULL_LEVEL).toEqual({ topics: 20, sheets: 10 }));

  it("refuses a row of an answer kind that marking cannot read", async () => {
    const shapes = shapeLibrary([...SHAPES.values()].map((shape) => (shape.id === "figure.bar" ? { ...shape, answerKind: "time" as "whole-number" } : shape)));
    const kind = await freezeBank(draftWith(cut), fakeRenderer(), { ...QUICK, shapes });
    expect(kind.ok ? [] : kind.problems).toEqual(['Sheet "equal-groups-1", front side, row "two-or-three-bars": the shape "figure.bar" has the answer kind "time", which marking cannot read.', 'Sheet "equal-groups-1", back side, row "larger-bars": the shape "figure.bar" has the answer kind "time", which marking cannot read.']);
  });

  it("refuses a problem of the bank check, with its sheet, side and row", async () => {
    // One sheet of one row a side, so that little is drawn.
    const draft = draftWith((d) => {
      d.topics[0].sheets = ["column-multiplication-1"];
      d.sheets = [d.sheets[0]];
      cut(d);
    });
    const blurred = fakeRenderer({ render: (out) => { out.images = out.images.map(() => new Uint8Array([1])); } });
    const drawn = await freezeBank(draft, blurred, { ...QUICK, templates: SMALL });
    expect(drawn.ok).toBe(false);
    expect(drawn.ok ? "" : drawn.problems[0]).toMatch(/^Sheet "column-multiplication-1", front side, row "no-carry": Page 381: /);
  });

  it("refuses a draft that is no plain data", async () => {
    expect(await freezeBank([], fakeRenderer(), QUICK)).toEqual({ ok: false, problems: ["The draft must be an object."] });
    const computed = draftWith(cut);
    Object.defineProperty(computed, "id", { get: () => "x", enumerable: true });
    expect(await freezeBank(computed, fakeRenderer(), QUICK)).toEqual({ ok: false, problems: ["The draft, id: this must be a plain value."] });
  });
});
