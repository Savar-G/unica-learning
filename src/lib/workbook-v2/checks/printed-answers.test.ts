import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { BookItem, ColumnFace, Ink, PageModel, Region } from "../contract";
import { SHAPES, shapeLibrary, type Shape, type ShapeLibrary } from "../shapes";
import { wholeNumber } from "../shapes/shape";
import { bookOf, factsBook, goodBook, stackOf, type GoodBook } from "../testing/sample";
import { BLANK, checkPrintedAnswers, printedRows, questionRows } from "./printed-answers";

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
  const face = (change: (f: ColumnFace) => ColumnFace) => faulty((s) => ({ face: (q) => change(stackOf({ face: s.face(q) })) }));
  const PLACE = /^Sheet "column-multiplication-1", front side, question 1 \(\d\d ×\d\): the answer is "\d+" by one computation and "\d+" by another\.$/;
  it.each<[string, (f: ColumnFace) => ColumnFace, RegExp]>([
    ["another bottom operand", (f) => ({ ...f, bottom: f.bottom === "9" ? "8" : String(Number(f.bottom) + 1) }), PLACE],
    ["another top operand", (f) => ({ ...f, top: f.top === "99" ? "98" : String(Number(f.top) + 1) }), PLACE],
    ["a wrong operator", (f) => ({ ...f, sign: "+" }), /question 1 \(\d\d \+\d\): the printed question cannot be read as mul\.column\.$/],
    ["no operator", (f) => ({ ...f, sign: "" }), /question 1 \(\d\d \d\): the printed question cannot be read as mul\.column\.$/],
    ["a digit too many", (f) => ({ ...f, top: `1${f.top}` }), /question 1 \(1\d\d ×\d\): the answer is "\d+" by one computation and "\d+" by another\.$/],
    ["a zero in front", (f) => ({ ...f, top: "05" }), /the printed question cannot be read as mul\.column\.$/],
    ["other digits that are not plain digits", (f) => ({ ...f, bottom: "³" }), /the printed question cannot be read as mul\.column\.$/],
  ])("%s", (_name, change, problem) => {
    expect(face(change)[0]).toMatch(problem);
  });

  it("another question with the same product", () => {
    const book = goodBook();
    const item = book.items[0];
    book.items[0] = { ...item, question: { a: 48, b: 2 }, answer: wholeNumber(96), steps: [{ text: "96", marks: [] }] };
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
    const item = book.items.find((i) => i.side === "front" && stackOf(i).top[0] !== stackOf(i).top[1]);
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
  const otherAnswer = wholeNumber(0);
  it.each<[string, (s: Shape) => Partial<Shape>, string]>([
    ["a wrong first computation", (s) => ({ generate: (l, seed) => ({ ...s.generate(l, seed), answer: otherAnswer }) }), "another"],
    ["a wrong second computation", (s) => ({ solveAgain: (rows) => { const r = s.solveAgain(rows); return r && { ...r, answer: otherAnswer }; } }), "another"],
    ["worked steps that end in another number", () => ({ steps: () => ["3 × 4 = 12", "12345"].map((line) => ({ text: line, marks: [] })) }), "the worked steps"],
    ["no worked steps", () => ({ steps: () => [] }), "the worked steps"],
  ])("%s is a problem of every question", (_name, fault, by) => {
    const problems = faulty(fault);
    expect(problems).toHaveLength(16);
    for (const problem of problems) expect(problem).toMatch(new RegExp(`^Sheet "column-multiplication-1", (front|back) side, question \\d \\(\\d\\d ×\\d\\): the answer is "\\d+" by one computation and "\\d*" by ${by}\\.$`));
  });

  it("another kind of answer is a problem of every question", () => {
    const problems = faulty((s) => ({ solveAgain: (rows) => { const r = s.solveAgain(rows); return r && { ...r, answer: { parts: r.answer.parts.map((p) => ({ ...p, kind: "fraction" as "whole-number" })) } }; } }));
    expect(problems).toHaveLength(16);
    for (const problem of problems) expect(problem).toMatch(/: the answer by another computation has a part of the kind "fraction", which is not "whole-number"\.$/);
  });

  it("a last worked step that draws something is a problem of every question", () => {
    const problems = faulty((s) => ({ steps: (q) => s.steps(q).map((step, i, all) => (i === all.length - 1 ? { ...step, marks: [{ mark: "write", place: 0, digit: "1" }] } : step)) }));
    expect(problems).toHaveLength(16);
    for (const problem of problems) expect(problem).toMatch(/: the last worked step is the answer and must draw nothing\.$/);
  });

  it("the second computation never gets the parameters of the question", () => {
    const given: unknown[] = [];
    const shapes = shapeLibrary([{ ...MUL, solveAgain: (...all) => { given.push(...all); return MUL.solveAgain(...all); } }]);
    expect(problemsOf(bookOf({ shapes }), shapes)).toEqual([]);
    expect(given).toHaveLength(16);
    for (const rows of given) expect(rows).toEqual([expect.stringMatching(/^\d\d$/), expect.stringMatching(/^×\d$/)]);
  });
});

describe("an answer that has no good form, in both computations", () => {
  const skip = SHAPES.get("count.skip");
  if (!skip) throw new Error("no shape");
  type Part = { name: string; kind: "whole-number"; value: string };
  const withParts = (change: (parts: Part[]) => unknown[], which: "both" | "first" | "second" = "both") => {
    const changed = <T extends { answer: { parts: Part[] } }>(item: T): T => ({ ...item, answer: { parts: change(item.answer.parts) as Part[] } });
    const shape: Shape = {
      ...skip,
      ...(which === "second" ? {} : { generate: (l: unknown, seed: string) => changed(skip.generate(l, seed)) }),
      ...(which === "first" ? {} : { solveAgain: (rows: readonly string[]) => { const item = skip.solveAgain(rows); return item && changed(item); } }),
    };
    const shapes = new Map(SHAPES).set("count.skip", shape);
    const { pages, items } = factsBook();
    const broken = items.map((item) => (item.shape === "count.skip" && which !== "second" ? changed(item) : item));
    return checkPrintedAnswers(pages, broken, shapes).filter((p) => p.includes("long-counts"));
  };
  it.each<[string, (parts: Part[]) => unknown[], RegExp]>([
    ["an empty value", ([first, ...more]) => [{ ...first, value: "" }, ...more], /the part "blank-1" has the value "", which is no whole-number/],
    ["a word", ([first, ...more]) => [{ ...first, value: "ten" }, ...more], /the part "blank-1" has the value "ten", which is no whole-number/],
    ["a zero in front", ([first, ...more]) => [{ ...first, value: `0${first.value}` }, ...more], /has the value "0\d+", which is no whole-number/],
    ["a value that is not text", ([first, ...more]) => [{ ...first, value: Number(first.value) }, ...more], /which is no whole-number/],
    ["a name that marking does not know", ([first, ...more]) => [{ ...first, name: "first" }, ...more], /has a part with the name "first", which is not known/],
    ["a name with a number 0", ([first, ...more]) => [{ ...first, name: "blank-0" }, ...more], /the name "blank-0", which is not known/],
    ["two parts with one name", (parts) => parts.map((p) => ({ ...p, name: "blank-1" })), /has two parts with the name "blank-1"/],
    ["another kind", ([first, ...more]) => [{ ...first, kind: "fraction" }, ...more], /has a part of the kind "fraction", which is not "whole-number"/],
    ["a field more", ([first, ...more]) => [{ ...first, unit: "cm" }, ...more], /has a part that is not a name, a kind and a value/],
    ["a part that is nothing", ([, ...more]) => [null, ...more], /has a part that is not a name, a kind and a value/],
    ["no part", () => [], /has no part/],
  ])("%s is a problem of the first and of the second one", (_name, change, problem) => {
    expect(withParts(change).join("\n")).toMatch(problem);
    expect(withParts(change, "first").join("\n")).toMatch(problem);
    expect(withParts(change, "second").join("\n")).toMatch(problem);
    for (const text of withParts(change)) expect(text).toMatch(/^Sheet "long-counts", (front|back) side, question \d \(.*\): the answer /);
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

describe("a question with blanks", () => {
  const good = factsBook();
  const sequence = good.items.find((i) => i.answer.parts.length === 3);
  if (!sequence) throw new Error("no sequence");
  const regionsOf = (book: GoodBook, id: string) => book.pages.flatMap((p) => p.regions).filter((r) => r.item === id);
  const after = (change: (item: BookItem, regions: Region[]) => unknown): string => {
    const book = structuredClone(good);
    const item = book.items.find((i) => i.id === sequence.id);
    if (!item) throw new Error("no item");
    change(item, regionsOf(book, item.id));
    return problemsOf(book).join("\n");
  };
  const area = (regions: Region[], part: string): Region => {
    const found = regions.find((r) => r.role === "answer" && r.part === part);
    if (!found) throw new Error("no area");
    return found;
  };

  it("is read with its answer areas as blanks, also inside a line, and a stack with none", () => {
    expect(problemsOf(good)).toEqual([]);
    const rows = (index: number) => questionRows(regionsOf(good, `${good.pages[index].id}/1`));
    expect([rows(0), rows(4), rows(5), rows(7)]).toEqual([[`5×1=${BLANK}`], [`2+2+2=${BLANK}`], [`2×${BLANK}=2`], ["5", "10", BLANK, BLANK, BLANK]]);
    const book = goodBook();
    expect(questionRows(regionsOf(book, book.items[0].id)).join("")).not.toContain(BLANK);
  });

  it.each<[string, (item: BookItem, regions: Region[]) => unknown, RegExp]>([
    ["two values in each other's part", ({ answer: { parts } }) => { [parts[0].value, parts[1].value] = [parts[1].value, parts[0].value]; }, /the answer is "blank-1 20, blank-2 15, blank-3 25" by one computation and "blank-1 15, blank-2 20, blank-3 25" by another/],
    ["two names in each other's part", ({ answer: { parts } }) => { [parts[0].name, parts[1].name] = [parts[1].name, parts[0].name]; }, /"blank-2 15, blank-1 20, blank-3 25" by one computation/],
    ["a part too few", ({ answer: { parts } }) => parts.pop(), /"blank-1 15, blank-2 20" by one computation/],
    ["another kind in one part", ({ answer: { parts } }) => { parts[2].kind = "fraction" as "whole-number"; }, /the answer has a part of the kind "fraction", which is not "whole-number"/],
    ["worked steps that end in one of the values", ({ steps }) => { steps[steps.length - 1].text = "25"; }, /"25" by the worked steps/],
    ["worked steps that end in the values in another order", ({ steps }) => { steps[steps.length - 1].text = "20, 15, 25"; }, /"20, 15, 25" by the worked steps/],
    ["an answer area that stands below the question", (_item, regions) => { const found = area(regions, "blank-3"); found.rect = { ...found.rect, y: found.rect.y + 400 }; }, /the printed question cannot be read as count\.skip/],
    ["an answer area over a printed term", (_item, regions) => { const found = area(regions, "blank-3"); found.rect = { ...area(regions, "blank-2").rect }; }, /the printed question cannot be read as count\.skip/],
  ])("%s stops the book", (_name, change, problem) => expect(after(change)).toMatch(problem));
});
