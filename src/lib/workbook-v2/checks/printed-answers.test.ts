import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Answer, BookItem, ColumnFace, Ink, PageModel, Region } from "../contract";
import { SHAPES, shapeLibrary, type Shape, type ShapeLibrary } from "../shapes";
import { wholeNumber } from "../shapes/shape";
import { bookOf, divisionBook, factsBook, goodBook, inventedBook, stackOf, type GoodBook } from "../testing/sample";
import { answerProblem } from "./answer-form";
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
  type Part = Answer["parts"][number];
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

describe("an answer of digits, one for each place", () => {
  const places = (...values: string[]) => ({ parts: ["thousands", "hundreds", "tens", "ones"].slice(4 - values.length).map((name, i) => ({ name, kind: "digit" as const, value: values[i] })) });
  it.each([["4", "3", "0", "7"], ["9", "0"], ["1", "0", "0"]])("is good with the digits %s", (...values) => expect(answerProblem(places(...values), "digit")).toBeNull());
  it.each<[string, unknown, RegExp]>([
    ["two digits", places("1", "10"), /the part "ones" has the value "10", which is no digit/],
    ["a zero in front", places("4", "00"), /the part "ones" has the value "00", which is no digit/],
    ["no digit", places("4", ""), /has the value "", which is no digit/],
    ["a minus", places("4", "-1"), /has the value "-1", which is no digit/],
    ["a space", places("4", " 3"), /has the value " 3", which is no digit/],
    ["a letter", places("4", "a"), /has the value "a", which is no digit/],
    ["a whole number in a part of digits", { parts: [{ name: "tens", kind: "whole-number", value: "4" }] }, /has a part of the kind "whole-number", which is not "digit"/],
    ["a place that marking does not know", { parts: [{ name: "millions", kind: "digit", value: "4" }] }, /the name "millions", which is not known/],
    ["one place twice", { parts: [{ name: "tens", kind: "digit", value: "4" }, { name: "tens", kind: "digit", value: "3" }] }, /two parts with the name "tens"/],
  ])("refuses %s", (_name, answer, problem) => expect(answerProblem(answer as Answer, "digit")).toMatch(problem));
  it("is no whole number, and a whole number is no digit", () => {
    expect(answerProblem(places("4", "3"), "whole-number")).toMatch(/kind "digit", which is not "whole-number"/);
    expect(answerProblem({ parts: [{ name: "answer", kind: "whole-number", value: "10" }] }, "whole-number")).toBeNull();
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
    const rows = (index: number) => questionRows(regionsOf(good, `${good.pages[index].id}/1`), good.items.find((i) => i.id === `${good.pages[index].id}/1`)!.face);
    expect([rows(0), rows(4), rows(5), rows(7)]).toEqual([[`5×1=${BLANK}`], [`2+2+2=${BLANK}`], [`2×${BLANK}=2`], ["5", "10", BLANK, BLANK, BLANK]]);
    const book = goodBook();
    expect(questionRows(regionsOf(book, book.items[0].id), book.items[0].face).join("")).not.toContain(BLANK);
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

describe("a division", () => {
  // Page 7 has brackets with a remainder, page 9 brackets with one area, page 3 lines with a remainder, page 1 lines.
  const good = divisionBook();
  const after = (number: number, change: (item: BookItem, regions: Region[]) => unknown): string => {
    const page = structuredClone(good.pages[number - 1]);
    const items = structuredClone(good.items.filter((i) => i.id.startsWith(`${page.id}/`)));
    change(items[0], page.regions.filter((r) => r.item === items[0].id));
    return problemsOf({ pages: [page], items }).join("\n");
  };
  const question = (regions: Region[]) => regions.find((r) => r.role === "question")!;
  const textsOf = (regions: Region[]) => question(regions).ink.filter((i) => i.kind === "text");

  it("is read with its areas as blanks, the letter R and the sign of the bracket", () => {
    expect(problemsOf(good)).toEqual([]);
    const rows = (number: number) => questionRows(good.pages[number - 1].regions.filter((r) => r.item === `${good.pages[number - 1].id}/1`), good.items.find((i) => i.id === `${good.pages[number - 1].id}/1`)!.face).join(" ");
    expect([rows(1), rows(3), rows(9), rows(7)]).toEqual([expect.stringMatching(/^\d+÷\d+=□$/), expect.stringMatching(/^\d+÷\d=□R□$/), expect.stringMatching(/^□ \d\)\d\d$/), expect.stringMatching(/^□R□ \d\)\d\d$/)]);
  });

  it.each<[string, number, (item: BookItem, regions: Region[]) => unknown, RegExp]>([
    ["the values in each other's part", 7, ({ answer: { parts } }) => { [parts[0].value, parts[1].value] = [parts[1].value, parts[0].value]; }, /the answer is "quotient \d, remainder \d" by one computation and "quotient \d, remainder \d" by another/],
    ["a remainder that is one more", 7, ({ answer: { parts } }) => { parts[1].value = String(Number(parts[1].value) + 1); }, /by one computation and .* by another/],
    ["a remainder of the divisor and a quotient of one less", 7, ({ answer: { parts }, question: q }) => { parts[0].value = String(Number(parts[0].value) - 1); parts[1].value = String(Number(parts[1].value) + (q as { divisor: number }).divisor); }, /by one computation and .* by another/],
    ["no remainder", 7, ({ answer: { parts } }) => parts.pop(), /by one computation and .* by another/],
    ["an empty remainder", 7, ({ answer: { parts } }) => { parts[1].value = ""; }, /the part "remainder" has the value "", which is no whole-number/],
    ["a page with no remainder area", 7, (_item, regions) => { question(regions).ink = question(regions).ink.filter((i) => i.kind !== "text" || i.text !== "R"); regions.find((r) => r.id.endsWith("answer-1-remainder"))!.rect.y += 400; }, /the printed question cannot be read as div\.remainder/],
    ["another digit inside the bracket", 7, (_item, regions) => { textsOf(regions)[4].text = textsOf(regions)[4].text === "1" ? "2" : "1"; }, /the answer is "quotient \d, remainder \d" by one computation and "quotient \d, remainder \d" by another/],
    ["a divisor of 1", 7, (_item, regions) => { textsOf(regions)[1].text = "1"; }, /cannot be read as div\.remainder/],
    ["a page with one area and something left", 9, (_item, regions) => { textsOf(regions)[3].text = "3"; }, /cannot be read as div\.remainder/],
    ["a bracket with no sign", 9, (_item, regions) => { question(regions).ink = question(regions).ink.filter((i) => i.kind !== "text" || i.text !== ")"); }, /cannot be read as div\.remainder/],
    ["another form in the book than on the page", 9, ({ question: q }) => { (q as { form: string }).form = "line"; }, /the page prints another question than the book holds/],
    ["other areas in the book than on the page", 9, ({ question: q }) => { (q as { parts: number }).parts = 2; }, /the page prints another question than the book holds/],
    ["worked steps that end with a comma", 7, ({ steps, answer: { parts } }) => { steps[steps.length - 1].text = parts.map((p) => p.value).join(", "); }, /"\d, \d" by the worked steps/],
  ])("%s stops the book", (_name, number, change, problem) => expect(after(number, change)).toMatch(problem));
});

describe("a bar model", () => {
  // Pages 3 and 4 of the invented book are bar models: 2 or 3 bars, then 4 to 6 bars on the front.
  const good = inventedBook();
  const page = (number: number) => good.pages[number - 1];
  const regionsOf = (book: GoodBook, number: number, at: number) => book.pages[number - 1].regions.filter((r) => r.item === `${book.pages[number - 1].id}/${at}`);
  const after = (number: number, change: (item: BookItem, regions: Region[]) => unknown): string => {
    const book = structuredClone(good);
    const at = 1;
    const item = book.items.find((i) => i.id === `${book.pages[number - 1].id}/${at}`)!;
    change(item, regionsOf(book, number, at));
    return checkPrintedAnswers([book.pages[number - 1]], [item], SHAPES).join("\n");
  };
  const question = (regions: Region[]) => regions.find((r) => r.role === "question")!;
  const textsOf = (regions: Region[]) => question(regions).ink.filter((i): i is Extract<Ink, { kind: "text" }> => i.kind === "text");

  it("is read as its bars in one row and the total in the next, each text apart, and the other faces as before", () => {
    expect(checkPrintedAnswers(good.pages, good.items, SHAPES)).toEqual([]);
    const rowsOf = (number: number, at: number) => questionRows(regionsOf(good, number, at), good.items.find((i) => i.id === `${page(number).id}/${at}`)!.face);
    for (const [number, at] of [[3, 1], [3, 4], [4, 4]]) {
      const item = good.items.find((i) => i.id === `${page(number).id}/${at}`)!;
      const { groups, size } = item.question as { groups: number; size: number };
      expect(rowsOf(number, at)).toEqual([Array.from({ length: groups }, () => String(size)).join(" | "), `? | Total = | ${BLANK}`]);
    }
    expect(rowsOf(1, 1).every((row) => !row.includes("|"))).toBe(true);
  });

  it.each<[string, number, (item: BookItem, regions: Region[]) => unknown, RegExp]>([
    ["a bar with another number", 3, (_item, regions) => { const t = textsOf(regions)[0]; t.text = String(Number(t.text) + 1); }, /cannot be read as figure\.bar/],
    ["a bar that is not printed", 3, (_item, regions) => { const q = question(regions); q.ink = q.ink.filter((i) => i !== textsOf(regions)[0]); }, /cannot be read as figure\.bar|another question than the book holds/],
    ["a part in the line of the total", 3, (_item, regions) => { const t = textsOf(regions)[0]; t.rect = { ...t.rect, y: t.rect.y + 60 }; }, /cannot be read as figure\.bar/],
    ["no question mark", 3, (_item, regions) => { const q = question(regions); q.ink = q.ink.filter((i) => i.kind !== "text" || i.text !== "?"); }, /cannot be read as figure\.bar/],
    ["another prompt", 3, (_item, regions) => { textsOf(regions).find((t) => t.text === "Total =")!.text = "Sum ="; }, /cannot be read as figure\.bar/],
    ["an answer area below the question", 3, (_item, regions) => { const a = regions.find((r) => r.role === "answer")!; a.rect = { ...a.rect, y: a.rect.y + 400 }; }, /cannot be read as figure\.bar/],
    ["another total in the book", 4, ({ answer: { parts } }) => { parts[0].value = String(Number(parts[0].value) + 1); }, /the answer is "\d+" by one computation and "\d+" by another/],
    ["another question in the book", 4, (item) => { (item.question as { size: number }).size += 1; }, /the page prints another question than the book holds/],
  ])("%s stops the book", (_name, number, change, problem) => expect(after(number, change)).toMatch(problem));
});
