import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PageModel, Rect } from "../contract";
import addSubSnapshot from "../fixtures/snapshot-add-sub.json";
import factsSnapshot from "../fixtures/snapshot-facts.json";
import wideSnapshot from "../fixtures/snapshot-4-digits.json";
import rawSnapshot from "../fixtures/snapshot.json";
import { TEMPLATES, type ColumnPlace, type PageTemplate, type TokenPlace } from "../layout/templates";
import { RenderError, type Renderer } from "../renderer";
import { SHAPES, shapeLibrary, type Shape } from "../shapes";
import { fakeRenderer } from "../testing/fake-renderer";
import { drawPage, paint, toColourPng, toPng } from "../testing/raster";
import { stackOf } from "../testing/sample";
import { quickRenderer, skipTypstTests, testAssets } from "../testing/typst";
import { BANK_SEEDS, checkBank } from "./check-bank";
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
const mul = (): Shape => {
  const shape = SHAPES.get("mul.column");
  if (!shape) throw new Error("no shape");
  return shape;
};
const withShape = (change: (shape: Shape) => Partial<Shape>) => ({ ...FEW, shapes: shapeLibrary([{ ...mul(), ...change(mul()) }]) });
const FRONT = 'Sheet "column-multiplication-1", front side, row "no-carry"';
const BACK_ROW = rawSnapshot.sheets[0].back.rows[0].id;

/** A copy of a template in which the places of some sides are changed. */
function templateWith(id: string, change: (place: ColumnPlace | TokenPlace, index: number, side: "front" | "back") => unknown): ReadonlyMap<string, PageTemplate> {
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
    expect(report.checked).toEqual({ sheets: 1, rows: 2, seeds: 5, questions: 20, pages: whole.length, alone: 32, texts: expect.any(Number) });
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
    const pairs = [[rawSnapshot.sheets[0].front, wideSnapshot.sheets[0].front], [times.front, groups.front], [groups.back, missing.back], [long.front, addSubSnapshot.sheets[1].front]];
    const sheets = pairs.map((pair, i) => {
      const [front, back] = structuredClone(pair).map((side, s) => ({ ...side, rows: side.rows.slice(0, 1).map((row) => ({ ...row, id: `row-${s}`, items: Math.min(row.items, 2), limits: row.shape === "count.skip" ? { ...row.limits, blanks: { min: 1, max: 1 }, places: { min: 3, max: 3 } } : row.shape === "add.repeated" ? { ...row.limits, count: { min: 5, max: 5 } } : row.limits })) }));
      return { id: `sheet-${i}`, firstPage: 2 * i + 1, front, back };
    });
    return { ...rawSnapshot, topics: [{ ...rawSnapshot.topics[0], sheets: sheets.map((s) => s.id) }], sheets };
  }

  it("a level with the seven templates of the example levels has no problem", async () => {
    const snapshot = allTemplates();
    expect(new Set(snapshot.sheets.flatMap((s) => [s.front.template, s.back.template])).size).toBe(7);
    const { problems, checked } = await checkBank(snapshot, await typst(), FEW);
    expect(problems).toEqual([]);
    expect(checked).toMatchObject({ sheets: 4, rows: 8, questions: expect.any(Number) });
  });

  it("a text that is too wide is found: an instruction, a title, and a number that no seed prints but the limits admit", async () => {
    // "10" fits a cell of 20 points and "20" does not.
    const templates = templateWith("facts-2x10", (p) => { if ("forms" in p) for (const form of p.forms) for (const cell of form) if (cell.text && cell.text.w === 33) cell.text = { ...cell.text, w: 20 }; });
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
