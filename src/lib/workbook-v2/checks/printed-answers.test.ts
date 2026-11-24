import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { BookItem, ColumnFace, Ink, PageModel, Region } from "../contract";
import { SHAPES, shapeLibrary, type Shape, type ShapeLibrary } from "../shapes";
import { bookOf, goodBook, type GoodBook } from "../testing/sample";
import { checkPrintedAnswers, printedRows } from "./printed-answers";

const MUL = SHAPES.get("mul.column");
if (!MUL) throw new Error("no shape");
const problemsOf = ({ pages, items }: GoodBook, shapes: ShapeLibrary = SHAPES) => checkPrintedAnswers(pages, items, shapes);
/** The example book when its one shape has a fault. */
const faulty = (fault: (shape: Shape) => Partial<Shape>) => {
  const shapes = shapeLibrary([{ ...MUL, ...fault(MUL) }]);
  return problemsOf(bookOf({ shapes }), shapes);
};
const questionOf = (page: PageModel, item: BookItem): Region => {
  const found = page.regions.find((r) => r.role === "question" && r.item === item.id);
  if (!found) throw new Error("no question");
  return found;
};

it("the example book answers what it prints", () => {
  expect(problemsOf(goodBook())).toEqual([]);
});

describe("a display function that shows another question stops the book", () => {
  const face = (change: (f: ColumnFace) => ColumnFace) => faulty((s) => ({ face: (q) => change(s.face(q)) }));
  const PLACE = /^Sheet "column-multiplication-1", front side, question 1 \(\d\d ×\d\): the answer is "\d+" by one computation and "\d+" by another\.$/;
  it.each<[string, (f: ColumnFace) => ColumnFace, RegExp]>([
    ["another bottom operand", (f) => ({ ...f, bottom: f.bottom === "9" ? "8" : String(Number(f.bottom) + 1) }), PLACE],
    ["another top operand", (f) => ({ ...f, top: f.top === "99" ? "98" : String(Number(f.top) + 1) }), PLACE],
    ["a wrong operator", (f) => ({ ...f, sign: "+" }), /question 1 \(\d\d \+\d\): the printed question cannot be read as mul\.column\.$/],
    ["no operator", (f) => ({ ...f, sign: "" }), /question 1 \(\d\d \d\): the printed question cannot be read as mul\.column\.$/],
    ["a digit too many", (f) => ({ ...f, top: `1${f.top}` }), /the printed question cannot be read as mul\.column\.$/],
    ["a zero in front", (f) => ({ ...f, top: "05" }), /the printed question cannot be read as mul\.column\.$/],
    ["other digits that are not plain digits", (f) => ({ ...f, bottom: "³" }), /the printed question cannot be read as mul\.column\.$/],
  ])("%s", (_name, change, problem) => {
    expect(face(change)[0]).toMatch(problem);
  });

  it("another question with the same product", () => {
    const book = goodBook();
    const item = book.items[0];
    book.items[0] = { ...item, question: { a: 48, b: 2 }, answer: { kind: "whole-number", value: "96" }, steps: ["96"] };
    const region = questionOf(book.pages[0], item);
    const digits = ["3", "2", "×", "3"];
    region.ink = region.ink.map((ink, i): Ink => (ink.kind === "text" ? { ...ink, text: digits[i] } : ink));
    expect(problemsOf(book)).toEqual(['Sheet "column-multiplication-1", front side, question 1 (32 ×3): the page prints another question than the book holds.']);
  });
});

describe("a layout that shows another question stops the book", () => {
  const swap = (region: Region, a: number, b: number) => {
    const rects = region.ink.map((i) => i.rect);
    region.ink = region.ink.map((ink, i): Ink => ({ ...ink, rect: i === a ? rects[b] : i === b ? rects[a] : ink.rect }));
  };
  const withDifferentDigits = () => {
    const book = goodBook();
    const item = book.items.find((i) => i.side === "front" && i.face.top[0] !== i.face.top[1]);
    if (!item) throw new Error("no such question");
    return { book, item, region: questionOf(book.pages[0], item) };
  };
  it.each<[string, number, number]>([["two digits of the top number", 0, 1], ["a top digit and the bottom digit", 0, 3], ["the sign and the bottom digit", 2, 3], ["the sign and a top digit", 0, 2]])("%s in each other's cells", (_name, a, b) => {
    const { book, region, item } = withDifferentDigits();
    const texts = region.ink.flatMap((i) => (i.kind === "text" ? [i.text] : []));
    swap(region, a, b);
    const problems = problemsOf(book);
    expect(problems).toHaveLength(texts[a] === texts[b] ? 0 : 1);
    if (problems.length > 0) expect(problems[0]).toContain(`question ${item.number} (`);
  });

  it("the rows in each other's place", () => {
    const { book, region } = withDifferentDigits();
    region.ink = region.ink.map((ink, i): Ink => ({ ...ink, rect: { ...ink.rect, y: ink.rect.y + (i < 2 ? 28 : i < 4 ? -28 : 0) } }));
    expect(problemsOf(book)[0]).toMatch(/the printed question cannot be read/);
  });

  it("a question with no printed text, and an item with no question", () => {
    const { book, region, item } = withDifferentDigits();
    region.ink = region.ink.filter((i) => i.kind !== "text");
    expect(problemsOf(book)).toEqual([expect.stringMatching(/\(\): the printed question cannot be read as mul\.column\.$/)]);
    book.pages[0].regions = book.pages[0].regions.filter((r) => r !== region);
    expect(problemsOf(book)).toEqual([expect.stringMatching(new RegExp(`question ${item.number} \\(\\): the printed question cannot be read`))]);
  });

  it("an item of a shape that the library does not hold", () => {
    expect(problemsOf(goodBook(), new Map())).toHaveLength(16);
  });
});

describe("the two computations of an answer, and the worked steps", () => {
  const otherAnswer = { kind: "whole-number" as const, value: "0" };
  it.each<[string, (s: Shape) => Partial<Shape>, string]>([
    ["a wrong first computation", (s) => ({ generate: (l, seed) => ({ ...s.generate(l, seed), answer: otherAnswer }) }), "another"],
    ["a wrong second computation", (s) => ({ solveAgain: (rows) => { const r = s.solveAgain(rows); return r && { ...r, answer: otherAnswer }; } }), "another"],
    ["another kind of answer", (s) => ({ solveAgain: (rows) => { const r = s.solveAgain(rows); return r && { ...r, answer: { ...r.answer, kind: "fraction" as "whole-number" } }; } }), "another"],
    ["worked steps that end in another number", () => ({ steps: () => ["3 × 4 = 12", "12345"] }), "the worked steps"],
    ["no worked steps", () => ({ steps: () => [] }), "the worked steps"],
  ])("%s is a problem of every question", (_name, fault, by) => {
    const problems = faulty(fault);
    expect(problems).toHaveLength(16);
    for (const problem of problems) expect(problem).toMatch(new RegExp(`^Sheet "column-multiplication-1", (front|back) side, question \\d \\(\\d\\d ×\\d\\): the answer is "\\d+" by one computation and "\\d*" by ${by}\\.$`));
  });

  it("the second computation never gets the parameters of the question", () => {
    const given: unknown[] = [];
    const shapes = shapeLibrary([{ ...MUL, solveAgain: (...all) => { given.push(...all); return MUL.solveAgain(...all); } }]);
    expect(problemsOf(bookOf({ shapes }), shapes)).toEqual([]);
    expect(given).toHaveLength(16);
    for (const rows of given) expect(rows).toEqual([expect.stringMatching(/^\d\d$/), expect.stringMatching(/^×\d$/)]);
  });
});

describe("the printed rows", () => {
  const text = (value: string, x: number, y: number, h = 28): Ink => ({ kind: "text", rect: { x, y, w: 24, h }, color: "black", text: value, size: 22, weight: 400, align: "center" });
  it("are read from top to bottom and from left to right, whatever the order of the ink", () => {
    const ink = [text("2", 24, 0), text("4", 48, 0), text("×", 24, 28), text("3", 48, 28)];
    fc.assert(fc.property(fc.shuffledSubarray(ink, { minLength: 4 }), (shuffled) => {
      expect(printedRows(shuffled)).toEqual(["24", "×3"]);
    }));
  });
  it.each<[string, Ink[], string[]]>([
    ["nothing", [], []],
    ["lines are not text", [{ kind: "fill", rect: { x: 0, y: 0, w: 9, h: 1 }, color: "black" }], []],
    ["texts of one row may differ a little in height", [text("2", 0, 0), text("4", 24, 3, 22)], ["24"]],
    ["texts that share less than half of their height are two rows", [text("2", 0, 0), text("4", 24, 20)], ["2", "4"]],
  ])("%s", (_name, ink, rows) => expect(printedRows(ink)).toEqual(rows));
});
