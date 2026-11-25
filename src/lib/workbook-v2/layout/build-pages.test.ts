import { describe, expect, it } from "vitest";
import { planBook } from "../build/build-book";
import { answerLine, type PageModel, type Rect, type Region, type RegionRole } from "../contract";
import wideBook from "../fixtures/book-4-digits.json";
import wideSnapshot from "../fixtures/snapshot-4-digits.json";
import { canonicalJson, sha256 } from "../hash";
import { factsBook, goodPages } from "../testing/sample";
import { SHAPES, shapeLibrary } from "../shapes";
import { wholeNumber } from "../shapes/shape";
import { validateSnapshot } from "../bank/snapshot";
import { sheetItems } from "../build/items";
import factsSnapshot from "../fixtures/snapshot-facts.json";
import { buildPages } from "./build-pages";
import { fitProblem, needsOf, questionText, TEMPLATES } from "./templates";

const pages = () => goodPages();
const regions = (page: PageModel, role: RegionRole) => page.regions.filter((r) => r.role === role);
const texts = (region: Region) => region.ink.flatMap((i) => (i.kind === "text" ? [i.text] : []));
const one = (page: PageModel, role: RegionRole): Region => {
  const found = regions(page, role);
  if (found.length !== 1) throw new Error(`${found.length} ${role}`);
  return found[0];
};
const r = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });

describe("the two pages of a sheet", () => {
  it("print the topic, the instruction, the level and the page number", () => {
    const [front, back] = pages();
    expect(texts(one(front, "heading"))).toEqual(["3-20 · Multiplying 2 digits by 1 digit"]);
    expect(texts(one(front, "instruction"))).toEqual(["Multiply. Start with the ones."]);
    expect(texts(one(front, "footer"))).toEqual(["Level 3 · Page 381"]);
    expect(texts(one(back, "footer"))).toEqual(["Level 3 · Page 382"]);
    expect([front.qr, back.qr]).toEqual(["https://unicalearning.com/tutor/p/example-front-381", "https://unicalearning.com/tutor/p/example-back-382"]);
  });

  it("put the fixed rectangles where the template says, mirrored between the sides", () => {
    const [front, back] = pages();
    expect(one(front, "qr").rect).toEqual(r(496.9, 698.4, 57.6, 57.6));
    expect(one(back, "qr").rect).toEqual(r(57.5, 698.4, 57.6, 57.6));
    const answers = (page: PageModel) => regions(page, "answer").map((a) => [a.rect.x, a.rect.y]);
    expect(answers(front)).toEqual([[134, 178], [384, 178], [134, 326], [384, 326], [134, 474], [384, 474], [134, 622], [384, 622]]);
    expect(answers(back)).toEqual(answers(front).map(([x, y]) => [x - 54, y]));
    expect(regions(front, "answer").every((a) => a.rect.w === 72 && a.rect.h === 42)).toBe(true);
  });

  it("give each question a label, a stack, an answer area, its reach and a work area", () => {
    const [front] = pages();
    for (const role of ["slot", "label", "question", "answer", "reach", "work"] as const) expect(regions(front, role)).toHaveLength(8);
    expect(regions(front, "label").flatMap(texts)).toEqual(["1", "2", "3", "4", "5", "6", "7", "8"]);
  });

  it("line up the digits: ones under ones, and the sign left of the bottom number", () => {
    const [front] = pages();
    const ink = regions(front, "question")[0].ink;
    const digits = ink.flatMap((i) => (i.kind === "text" ? [{ text: i.text, x: i.rect.x - 134, y: i.rect.y }] : []));
    expect(digits.map((d) => d.x)).toEqual([24, 48, 24, 48]);
    expect(digits.map((d) => d.text)).toEqual([expect.stringMatching(/^\d$/), expect.stringMatching(/^\d$/), "×", expect.stringMatching(/^\d$/)]);
    expect(digits[0].y).toBe(digits[1].y);
    expect(digits[2].y).toBe(digits[3].y);
    expect(digits[2].y).toBeGreaterThan(digits[0].y);
  });

  it("never print an answer", () => {
    for (const page of pages()) for (const answer of regions(page, "answer")) expect(answer.ink.map((i) => i.kind)).toEqual(["outline"]);
  });

  it("have ids that no other rectangle of the book has", () => {
    const ids = pages().flatMap((p) => p.regions.map((g) => g.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("a sheet of 4 digits by 1 digit", () => {
  const plan = planBook({ snapshot: wideSnapshot, book: wideBook });
  const wide = plan.ok ? plan.pages : [];

  it("passes every check that needs no drawing, with all places of both sides full", () => {
    expect(plan).toMatchObject({ ok: true });
    expect(wide.map((page) => [page.template, regions(page, "slot").length])).toEqual([["columns-2x4-wide", 8], ["columns-2x4-wide", 8]]);
    if (plan.ok) expect(Math.max(...plan.items.map((i) => answerLine(i.answer).length))).toBe(5);
  });

  it("has answer areas of five digit places in the two columns of the other template, mirrored between the sides", () => {
    const [front, back] = wide;
    const answers = (page: PageModel) => regions(page, "answer").map(({ rect }) => [rect.x, rect.y, rect.w, rect.h]);
    expect(answers(front)).toEqual([178, 326, 474, 622].flatMap((y) => [[134, y, 120, 42], [384, y, 120, 42]]));
    expect(answers(back)).toEqual(answers(front).map(([x, ...more]) => [x - 54, ...more]));
  });

  it("lines up the digits from the right: ones under ones, and the sign left of the bottom number", () => {
    const placed = regions(wide[0], "question")[0].ink.flatMap((i) => (i.kind === "text" ? [[i.text, i.rect.x - 134]] : []));
    expect(placed.map(([, x]) => x)).toEqual([24, 48, 72, 96, 72, 96]);
    expect(placed[4][0]).toBe("×");
  });

  it("leaves a work area beside each stack, outside the reach of its answer", () => {
    expect(wide).toHaveLength(2);
    for (const page of wide) {
      const works = regions(page, "work");
      expect(works).toHaveLength(8);
      works.forEach(({ rect }, i) => {
        const reach = regions(page, "reach")[i].rect;
        expect(rect.x).toBeGreaterThan(reach.x + reach.w);
        expect([rect.w, rect.h]).toEqual([38, 140]);
      });
    }
  });

  it("uses the only template that 5 digit places fit", () => {
    expect([...TEMPLATES.values()].filter((t) => t.faces.includes("column")).map((t) => [t.id, t.holds])).toEqual([["columns-2x4", { "digit places": 3 }], ["columns-2x4-wide", { "digit places": 5 }]]);
  });
});

describe("a question with one answer area", () => {
  // Made with engine 2.0.0-s3, before answers had parts.
  it.each([["the example sheet", goodPages, "e5178d1410a99bedfd236e5646995d0098220db7a76ac3ae041c66ae9634ea40"], ["the sheet of 4 digits by 1 digit", () => { const plan = planBook({ snapshot: wideSnapshot, book: wideBook }); return plan.ok ? plan.pages : []; }, "64247e899f4c41149ba0972ab661f5b12af658adeaee253c88187151c931ace5"]])("is laid out as before answers had parts: %s", (_name, made, hash) => {
    const before = made().map((page) => ({ ...page, regions: page.regions.map(({ part, ...region }) => { expect(part).toBe(region.role === "answer" || region.role === "reach" ? "answer" : null); return region; }) }));
    expect(sha256(canonicalJson(before))).toBe(hash);
  });
});

describe("the templates of tokens", () => {
  const book = factsBook();
  const [facts, , , , sums, blanks, , short, long] = book.pages;
  const corners = (page: PageModel, role: RegionRole) => regions(page, role).map(({ rect }) => [rect.x, rect.y]);
  const columnsOf = (page: PageModel) => [...new Set(regions(page, "answer").map(({ rect }) => rect.x))];

  it("have as many places as the print rules allow", () => {
    expect([...TEMPLATES.values()].map((t) => [t.id, t.sides.front.places.length, t.sides.back.places.length])).toEqual([
      ["columns-2x4", 8, 8], ["columns-2x4-wide", 8, 8], ["facts-2x10", 20, 20], ["sums-1x10", 10, 10], ["blanks-1x10", 10, 10], ["sequences-2x2", 4, 4], ["sequences-2x1", 2, 2],
    ]);
    // One row more would reach the QR code: a row is an answer area with its reach.
    const [qr] = regions(facts, "qr");
    const lowest = Math.max(...regions(facts, "slot").map(({ rect }) => rect.y + rect.h));
    expect(lowest).toBeLessThanOrEqual(qr.rect.y);
    expect(lowest + 61.2).toBeGreaterThan(qr.rect.y + 40);
  });

  it("run down a column, so that a table in order reads down", () => {
    const answers = corners(facts, "answer");
    expect(answers.slice(0, 3).map(([x]) => x)).toEqual([229.2, 229.2, 229.2]);
    expect(answers[10][1]).toBe(answers[0][1]);
    expect(answers[10][0] - answers[0][0]).toBe(246);
  });

  it("keep the answer areas of a side in one or two columns, wherever the blank stands", () => {
    expect([facts, sums, blanks, short, long].map((page) => columnsOf(page).length)).toEqual([2, 1, 1, 2, 2]);
    const kinds = new Set(book.items.filter((i) => i.id.startsWith(`${blanks.id}/`)).map((i) => (i.question as { blank: string }).blank));
    expect([...kinds].sort()).toEqual(["first", "second"]);
  });

  it("give each blank an area and a reach with the name of its part, and no work area", () => {
    const own = short.regions.filter((g) => g.item === `${short.id}/1`).map((g) => [g.id.slice(short.id.length + 1), g.role, g.part]);
    expect(own).toEqual([["slot-1", "slot", null], ["label-1", "label", null], ["question-1", "question", null],
      ...["blank-1", "blank-2", "blank-3"].flatMap((part) => [[`answer-1-${part}`, "answer", part], [`reach-1-${part}`, "reach", part]])]);
    expect(book.pages.flatMap((page) => regions(page, "work"))).toEqual([]);
  });

  it("put a line above the lower of two sequences", () => {
    const lines = regions(short, "question").map((g) => g.ink.filter((i) => i.kind === "fill").length);
    expect(lines).toEqual([0, 1, 0, 1]);
  });

  const equation = (...tokens: string[]) => ({ kind: "equation" as const, tokens: tokens.map((t) => (t === "□" ? { blank: "answer" } : { text: t })) });
  const column = { kind: "column" as const, top: "24", sign: "×", bottom: "3" };
  it.each([
    ["a fact", "facts-2x10", equation("10", "×", "10", "=", "□"), 100, null],
    ["a short sum in a long line", "sums-1x10", equation("4", "+", "4", "=", "□"), 8, null],
    ["a blank in the first place", "blanks-1x10", equation("□", "×", "7", "=", "35"), 5, null],
    ["a blank in the second place", "blanks-1x10", equation("5", "×", "□", "=", "35"), 7, null],
    ["a blank inside, in a template with one at the end", "facts-2x10", equation("5", "×", "□", "=", "35"), 7, 'has its blanks where the template "facts-2x10" has no answer area'],
    ["a blank at the end, in a template with one inside", "blanks-1x10", equation("5", "×", "7", "=", "□"), 35, 'has its blanks where the template "blanks-1x10" has no answer area'],
    ["a line that is too long", "facts-2x10", equation("4", "+", "4", "+", "4", "=", "□"), 12, 'needs 7 places in its line and the template "facts-2x10" has 5'],
    ["a number that is too long", "sums-1x10", equation("100", "+", "100", "=", "□"), 200, 'needs 3 characters in a number and the template "sums-1x10" has 2'],
    ["an answer that is too long", "facts-2x10", equation("5", "×", "7", "=", "□"), 1035, 'needs 4 characters in a number and the template "facts-2x10" has 3'],
    ["a stack", "facts-2x10", column, 72, 'is a column question and the template "facts-2x10" has no place for one'],
    ["an equation in a template of stacks", "columns-2x4", equation("5", "×", "7", "=", "□"), 35, 'is an equation question and the template "columns-2x4" has no place for one'],
    ["a sequence in a template of equations", "facts-2x10", { kind: "sequence" as const, tokens: [{ text: "5" }, { blank: "answer" }] }, 10, 'is a sequence question and the template "facts-2x10" has no place for one'],
  ])("say whether %s fits", (_name, id, face, answer, problem) => {
    const template = TEMPLATES.get(id);
    if (!template) throw new Error("no template");
    expect(fitProblem(template, face, wholeNumber(answer))).toBe(problem);
  });

  it("show a question with its answer, and how large it is", () => {
    expect(questionText(equation("5", "×", "□", "=", "35"), wholeNumber(7))).toBe("5 × [7] = 35");
    expect(questionText(column, wholeNumber(72))).toBe("24 × 3 = 72");
    expect(needsOf({ kind: "sequence", tokens: [{ text: "5" }, { text: "10" }, { blank: "blank-1" }] }, { parts: [{ name: "blank-1", kind: "whole-number", value: "115" }] })).toEqual({ terms: 3, "characters in a number": 3 });
  });

  it.each(["front", "back"] as const)("are looked at on the side and at the place of each question: %s", (side) => {
    const template = TEMPLATES.get("blanks-1x10");
    const sheet = validateSnapshot(factsSnapshot);
    if (!template || !sheet.ok) throw new Error("no sheet");
    const found = sheet.snapshot.sheets.get("equal-groups");
    if (!found) throw new Error("no sheet");
    const row = found.back.rows[0];
    const places = template.sides[side].places.map((place, i) => (i === 3 ? { ...place, forms: [] } : place));
    const broken = { ...template, sides: { ...template.sides, [side]: { ...template.sides[side], places } } };
    const content = { instruction: "Write the missing number.", template: broken, rows: [{ ...row, items: 4 }] };
    const both = { ...found, front: { ...content, rows: [{ ...row, id: "f", items: 4 }] }, back: content };
    const pages = buildPages([{ sheet: both, levelName: "2", attempt: 1, qr: { front: "f", back: "b" }, items: sheetItems(both, "child", 1) }]);
    expect(pages).toEqual({ ok: false, problems: [expect.stringMatching(new RegExp(`^Page ${side === "front" ? 125 : 126}: question 4 has its blanks where the template "blanks-1x10" has no answer area\\.$`))] });
  });

  it("stop a page with a question that has no place, and name it", () => {
    const [sheet] = wideSnapshot.sheets;
    const mul = SHAPES.get("mul.column");
    if (!mul) throw new Error("no shape");
    const odd = shapeLibrary([{ ...mul, worstCase: (l) => ({ ...mul.worstCase(l), question: { a: 1000, b: 2 } }), face: (q) => ((q as { a: number }).a === 1000 ? mul.face(q) : equation("5", "×", "7", "=", "□")) }]);
    expect(planBook({ snapshot: { ...wideSnapshot, sheets: [sheet] }, book: wideBook }, odd)).toEqual({ ok: false, problems: expect.arrayContaining([expect.stringMatching(/^Page \d+: question 1 is an equation question and the template "columns-2x4-wide" has no place for one\.$/)]) });
  });
});
