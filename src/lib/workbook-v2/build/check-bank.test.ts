import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { PageModel, Rect } from "../contract";
import addSubSnapshot from "../fixtures/snapshot-add-sub.json";
import factsSnapshot from "../fixtures/snapshot-facts.json";
import wideSnapshot from "../fixtures/snapshot-4-digits.json";
import rawSnapshot from "../fixtures/snapshot.json";
import { TEMPLATES, type ColumnPlace, type PageTemplate, type TokenPlace } from "../layout/templates";
import { openRenderer } from "../render/typst";
import { RenderError, type Renderer, type Rendering } from "../renderer";
import { SHAPES, shapeLibrary, type Shape } from "../shapes";
import { pagesPdf } from "../testing/fake-pdf";
import { reportedPositions, reportedTexts } from "../testing/fake-typesetter";
import { drawPage, paint, toPng } from "../testing/raster";
import { stackOf } from "../testing/sample";
import { skipTypstTests, testAssets } from "../testing/typst";
import { BANK_SEEDS, checkBank } from "./check-bank";

type Draw = (pages: readonly PageModel[]) => Promise<Rendering>;
const drawModel: Draw = async (pages) => ({ pdf: pagesPdf(pages), images: pages.map((p) => toPng(drawPage(p))), positions: reportedPositions(pages), texts: reportedTexts(pages) });
const fake = (render: Draw = drawModel): Renderer => ({ identity: { typst: "0", program: "p", template: "t", fonts: {} }, render: vi.fn(render) });
const isAlone = (page: PageModel) => page.regions.every((r) => r.role !== "qr") && page.regions.some((r) => r.role === "slot");

type Snapshot = typeof rawSnapshot;
/** The example level with one row of two questions on each side, and a change. */
const snapshotWith = (change: (s: Snapshot) => unknown = () => {}): Snapshot => {
  const snapshot = structuredClone(rawSnapshot);
  for (const side of [snapshot.sheets[0].front, snapshot.sheets[0].back]) side.rows = [{ ...side.rows[0], items: 2 }];
  change(snapshot);
  return snapshot;
};
const FEW = { seeds: 5 };
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
  const template = structuredClone(TEMPLATES.get(id));
  if (!template) throw new Error("no template");
  for (const side of ["front", "back"] as const) template.sides[side].places.forEach((place, i) => change(place, i, side));
  return new Map([...TEMPLATES, [id, template]]);
}
const moved = (rect: Rect, dx: number, dy = 0): Rect => ({ ...rect, x: rect.x + dx, y: rect.y + dy });

describe("a good bank", () => {
  it("has no problem, and each row is drawn at each place of both sides, together and alone", async () => {
    const renderer = fake();
    const report = await checkBank(snapshotWith(), renderer, FEW);
    expect(report.problems).toEqual([]);
    const drawn = vi.mocked(renderer.render).mock.calls.flatMap(([pages]) => pages);
    const whole = drawn.filter((p) => p.regions.some((r) => r.role === "qr"));
    // Two rows, two sides each, with eight questions on each side. The widest questions of the rows differ, so each is drawn alone.
    expect(whole.map((p) => [p.side, p.regions.filter((r) => r.role === "slot").length])).toEqual([["front", 8], ["back", 8], ["front", 8], ["back", 8]]);
    expect(drawn.filter(isAlone)).toHaveLength(32);
    expect(report.checked).toEqual({ sheets: 1, rows: 2, seeds: 5, questions: 20, pages: whole.length, alone: 32, texts: expect.any(Number) });
  });

  it("asks for 200 seeds", () => expect(BANK_SEEDS).toBe(200));

  it("draws a question alone one time, also when two rows have the same widest question", async () => {
    const renderer = fake();
    const same = snapshotWith((s) => { s.sheets[0].back.rows = [{ ...s.sheets[0].front.rows[0], id: "again" }]; });
    const report = await checkBank(same, renderer, FEW);
    expect(report).toMatchObject({ problems: [], checked: { alone: 16, pages: 4 } });
  });

  it("gives the same report for the same bank", async () => {
    expect(await checkBank(snapshotWith(), fake(), FEW)).toEqual(await checkBank(snapshotWith(), fake(), FEW));
  });
});

describe("a bank with a problem", () => {
  it("that is in the file itself draws nothing", async () => {
    const renderer = fake();
    const report = await checkBank(snapshotWith((s) => { s.sheets[0].front.template = "columns-9x9"; }), renderer, FEW);
    expect(report.problems).toEqual(['Sheet "column-multiplication-1", front side: there is no template "columns-9x9".']);
    expect(renderer.render).not.toHaveBeenCalled();
  });

  it.each<[string, Parameters<typeof withShape>[0], RegExp]>([
    ["a question that cannot be made", (s) => ({ generate: (l, seed) => { if (JSON.stringify(l).includes('"max":0')) throw new Error("no such number"); return s.generate(l, seed); } }), new RegExp(`^${FRONT}, seed 1: a question cannot be made \\(no such number\\)\\.$`)],
    ["a question that prints another number", (s) => ({ face: (q) => { const f = stackOf({ face: s.face(q) }); return { ...f, bottom: f.bottom === "9" ? "8" : String(Number(f.bottom) + 1) }; } }), new RegExp(`^${FRONT}, seed 1: Sheet "column-multiplication-1", front side, question 1 .*by one computation`)],
    ["a worked step that is not the answer", (s) => ({ steps: (q) => [...s.steps(q).slice(0, -1), { text: "0", marks: [] }] }), /seed 1: .*by one computation and "0" by the worked steps/],
    ["a widest question that cannot be made", () => ({ forms: () => { throw new Error("none"); } }), /^The snapshot cannot be checked \(none\)\.$/],
  ])("names the sheet, the side and the row: %s", async (_name, change, problem) => {
    const { problems } = await checkBank(snapshotWith(), fake(), withShape(change));
    expect(problems.some((p) => problem.test(p))).toBe(true);
  });

  it("in one of two rows of a side names that row and not the other", async () => {
    const two = snapshotWith((s) => { s.sheets[0].front.rows = structuredClone(rawSnapshot.sheets[0].front.rows).map((row) => ({ ...row, items: 2 })); });
    const [first, second] = two.sheets[0].front.rows;
    const bad = JSON.stringify(second.limits);
    expect(JSON.stringify(first.limits)).not.toBe(bad);
    const options = withShape((s) => ({ generate: (l, seed) => { if (JSON.stringify(l) === bad) throw new Error("no such number"); return s.generate(l, seed); } }));
    expect((await checkBank(two, fake(), options)).problems).toEqual([`Sheet "column-multiplication-1", front side, row "${second.id}", seed 1: a question cannot be made (no such number).`]);
  });

  it("that only one seed has names the row and the seed", async () => {
    let wrong = "";
    const options = withShape((s) => ({ generate: (l, seed) => { const item = s.generate(l, seed); if (wrong === "" && JSON.stringify(l) !== "") wrong = seed; return seed === wrong ? { ...item, answer: { parts: [{ name: "answer", kind: "whole-number", value: "" }] } } : item; } }));
    expect((await checkBank(snapshotWith(), fake(), options)).problems).toEqual([expect.stringMatching(/^Sheet "column-multiplication-1", front side, row "no-carry", seed 1: .*which is no whole-number\.$/)]);
  });

  it.each<[string, ReadonlyMap<string, PageTemplate>, RegExp]>([
    ["a digit in another place, at one place of the other side", templateWith("columns-2x4", (p, i, side) => { if (i === 7 && side === "back" && "bottomCells" in p) p.bottomCells = p.bottomCells.map((c) => moved(c, -24)); }), new RegExp(`^${FRONT}: Page 382: .*question 8 |^${FRONT}: Page 382: the ink of "question-8" is outside it`)],
    ["an answer area in the spine zone, at one place", templateWith("columns-2x4", (p, i, side) => { if (i === 2 && side === "front" && "answer" in p) p.answer = moved(p.answer, -60); }), new RegExp(`^${FRONT}: Page 381: "answer-3" enters the spine zone`)],
  ])("in a template names each row that uses it: %s", async (_name, templates, problem) => {
    const { problems } = await checkBank(snapshotWith(), fake(), { ...FEW, templates });
    expect(problems.join("\n")).toMatch(new RegExp(problem.source, "m"));
    expect(problems.join("\n")).toContain(`back side, row "${BACK_ROW}"`);
  });

  it("in one drawing names the rows of that drawing and no other", async () => {
    const wrong: Draw = async (pages) => {
      const out = await drawModel(pages);
      pages.forEach((page, i) => {
        if (!page.regions.some((r) => r.role === "qr") || page.side !== "back" || page.attempt !== 2) return;
        const canvas = drawPage(page);
        paint(canvas, { x: 20, y: 400, w: 3, h: 3 });
        out.images[i] = toPng(canvas);
      });
      return out;
    };
    expect((await checkBank(snapshotWith(), fake(wrong), FEW)).problems).toEqual([`Sheet "column-multiplication-1", back side, row "${BACK_ROW}": Page 382: the image has ink that the model does not have, at (20, 400) in the margin.`]);
  });

  it("with ink outside the slot of a question that is drawn alone names its place", async () => {
    const wrong: Draw = async (pages) => {
      const out = await drawModel(pages);
      const at = pages.findIndex((p) => isAlone(p) && p.side === "back" && p.regions.some((r) => r.id.endsWith("/slot-6")));
      if (at >= 0) {
        const canvas = drawPage(pages[at]);
        paint(canvas, { x: 20, y: 60, w: 3, h: 3 }, 244);
        out.images[at] = toPng(canvas);
      }
      return out;
    };
    expect((await checkBank(snapshotWith(), fake(wrong), FEW)).problems).toEqual([`${FRONT}: question 6 of the back side, drawn alone, has ink outside "slot-6".`]);
  });

  it("with nothing drawn for a question alone, or an image that cannot be read, is a problem", async () => {
    const blank = (make: () => Uint8Array): Draw => async (pages) => { const out = await drawModel(pages); pages.forEach((p, i) => { if (isAlone(p)) out.images[i] = make(); }); return out; };
    const empty = blank(() => new TextEncoder().encode("page"));
    expect((await checkBank(snapshotWith(), fake(empty), FEW)).problems[0]).toBe(`${FRONT}: question 1 of the front side, drawn alone: the page image cannot be read.`);
    const white: Draw = async (pages) => { const out = await drawModel(pages); pages.forEach((p, i) => { if (isAlone(p)) out.images[i] = toPng(drawPage({ ...p, regions: [] })); }); return out; };
    expect((await checkBank(snapshotWith(), fake(white), FEW)).problems[0]).toBe(`${FRONT}: question 1 of the front side, drawn alone, has no ink.`);
    const none: Draw = async (pages) => { const out = await drawModel(pages); return pages.some(isAlone) ? { ...out, images: out.images.slice(1) } : out; };
    expect((await checkBank(snapshotWith(), fake(none), FEW)).problems.join("\n")).toMatch(/must give one image for each of the \d+ pages/);
  });

  it("with a typesetter that fails is a problem, and a fault in the code is not hidden", async () => {
    const fails = fake(async () => { throw new RenderError("Typst reported: a warning"); });
    expect((await checkBank(snapshotWith(), fails, FEW)).problems).toContain(`${FRONT}: Typst reported: a warning`);
    const broken = fake(async () => { throw new TypeError("a fault"); });
    await expect(checkBank(snapshotWith(), broken, FEW)).rejects.toThrow("a fault");
  });
});

describe.skipIf(skipTypstTests())("with the real Typst", () => {
  let opened: Promise<Renderer> | undefined;
  const typst = () => opened ??= openRenderer(testAssets());

  /** A level with a side of each template, with one row on each side. The sequences have few forms. */
  function allTemplates() {
    const [times, , groups, missing, long] = factsSnapshot.sheets;
    const pairs = [[rawSnapshot.sheets[0].front, wideSnapshot.sheets[0].front], [times.front, groups.front], [groups.back, missing.back], [long.front, addSubSnapshot.sheets[1].front]];
    const sheets = pairs.map((pair, i) => {
      const [front, back] = structuredClone(pair).map((side, s) => ({ ...side, rows: side.rows.slice(0, 1).map((row) => ({ ...row, id: `row-${s}`, limits: row.shape === "count.skip" ? { ...row.limits, blanks: { min: 1, max: 1 }, places: { min: 3, max: 3 } } : row.limits })) }));
      return { id: `sheet-${i}`, firstPage: 2 * i + 1, front, back };
    });
    return { ...rawSnapshot, topics: [{ ...rawSnapshot.topics[0], sheets: sheets.map((s) => s.id) }], sheets };
  }

  it("a level with the seven templates of the example levels has no problem", async () => {
    const snapshot = allTemplates();
    expect(new Set(snapshot.sheets.flatMap((s) => [s.front.template, s.back.template])).size).toBe(7);
    const { problems, checked } = await checkBank(snapshot, await typst(), { seeds: 10 });
    expect(problems).toEqual([]);
    expect(checked).toMatchObject({ sheets: 4, rows: 8, questions: expect.any(Number) });
  });

  it("an instruction and a title that are too wide are problems of their sides", async () => {
    const snapshot = snapshotWith((s) => { s.sheets[0].back.instruction = "W".repeat(58); s.topics[0].title = "W".repeat(44); });
    const problems = (await checkBank(snapshot, await typst(), FEW)).problems.join("\n");
    expect(problems).toMatch(new RegExp(`^Sheet "column-multiplication-1", back side, row "${BACK_ROW}": Page 381: the text "${"W".repeat(58)}" of "instruction" is \\d+\\.\\d+ points wide and its place is 486\\.$`, "m"));
    expect(problems).toMatch(new RegExp(`^${FRONT}: Page 382: the text "3-20 · ${"W".repeat(44)}" of "heading" is \\d+\\.\\d+ points wide and its place is 443\\.$`, "m"));
  });

  it("a number that is wider than the widest question, with as many digits, is found by its seed", async () => {
    // "10" fits a cell of 20 points and "20" does not.
    const templates = templateWith("facts-2x10", (p) => { if ("forms" in p) for (const form of p.forms) for (const cell of form) if (cell.text && cell.text.w === 33) cell.text = { ...cell.text, w: 20 }; });
    const limits = { tables: [10, 20], second: { min: 0, max: 0 }, result: { min: 0, max: 20 }, order: "mixed" };
    const snapshot = snapshotWith((s) => { for (const side of [s.sheets[0].front, s.sheets[0].back]) { side.template = "facts-2x10"; side.rows = [{ id: "row", shape: "fact.add", items: 2, limits } as never]; } s.sheets[0].back.rows[0].id = "other"; });
    expect((await checkBank(snapshot, await typst(), { ...FEW, templates })).problems).toContain('Sheet "column-multiplication-1", front side, row "row": Page 381: the text "20" of "question-2" is 23.08 points wide and its place is 20.');
  });

  it("ink that a drawing puts past the slot of a question is found in the page and in the question that is drawn alone", async () => {
    const folder = mkdtempSync(join(tmpdir(), "workbook-v2-bank-"));
    try {
      const source = readFileSync(testAssets().template, "utf8");
      const mark = "      if reports { report(region.id) }";
      const template = join(folder, "page.typ");
      writeFileSync(template, source.replace(mark, `${mark}\n      if region.role == "label" { place(origin, dx: -20 * 1pt, rect(width: 1pt, height: 1pt, fill: luma(240))) }`));
      expect(readFileSync(template, "utf8")).not.toBe(source);
      const one = snapshotWith((s) => { s.sheets[0].back.rows = [{ ...s.sheets[0].front.rows[0], id: "again" }]; });
      const problems = (await checkBank(one, await openRenderer({ ...testAssets(), template }), FEW)).problems.join("\n");
      expect(problems).toMatch(/^Sheet "column-multiplication-1", front side, row "no-carry": Page 381: the image has ink that the model does not have, at \(70, \d+\) in the spine zone\.$/m);
      for (const side of ["front", "back"]) expect(problems).toContain(`${FRONT}: question 8 of the ${side} side, drawn alone, has ink outside "slot-8".`);
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });
});
