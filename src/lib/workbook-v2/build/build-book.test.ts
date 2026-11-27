import { beforeEach, describe, expect, it, vi } from "vitest";
import { tokenText, type Answer, type Face, type PageModel } from "../contract";
import rawBook from "../fixtures/book.json";
import rawSnapshot from "../fixtures/snapshot.json";
import inventedBookFixture from "../fixtures/book-invented-topic.json";
import inventedSnapshotFixture from "../fixtures/snapshot-invented-topic.json";
import { canonicalJson, sha256 } from "../hash";
import factsSnapshotFixture from "../fixtures/snapshot-facts.json";
import { validateSnapshot } from "../bank/snapshot";
import { historyFromBooks, planNextBook } from "../assemble/plan-book";
import { levelOrder, position, type SheetResultRecord } from "../assemble/position";
import { sheetResult, type ItemMark } from "../results/sheet-results";
import { openRenderer } from "../render/typst";
import { RenderError, type Renderer, type Rendering } from "../renderer";
import { SHAPES, shapeLibrary, type Shape } from "../shapes";
import { wholeNumber } from "../shapes/shape";
import { pagesPdf } from "../testing/fake-pdf";
import { fakeRenderer } from "../testing/fake-renderer";
import { drawPage, paint, pagePng, toPng } from "../testing/raster";
import { stackOf } from "../testing/sample";
import type { StoryQuestion } from "../shapes/story";
import { skipTypstTests, testAssets } from "../testing/typst";
import { buildBook, planBook, type BuiltBook } from "./build-book";

// A hook between the layout and the checks: the layout of the engine makes no wrong page, and one must still stop a book.
const layout = vi.hoisted(() => ({ change: (pages: PageModel[]) => pages }));
vi.mock("../layout/build-pages", async (original) => {
  const real = await original<typeof import("../layout/build-pages")>();
  return { ...real, buildPages: (sheets: Parameters<typeof real.buildPages>[0]) => { const r = real.buildPages(sheets); return r.ok ? { ...r, pages: layout.change(r.pages) } : r; } };
});
beforeEach(() => { layout.change = (pages) => pages; });

type Input = { snapshot: typeof rawSnapshot; book: typeof rawBook };
const input = (change: (i: Input) => unknown = () => {}): Input => {
  const i = structuredClone({ snapshot: rawSnapshot, book: rawBook });
  change(i);
  return i;
};
const put = (target: object, key: string, value: unknown) => { Reflect.set(target, key, value); };

const IDENTITY = fakeRenderer().identity;
/** A renderer that draws exactly the model. `drawn` are the books that it drew. */
function fake(change: Partial<Renderer> = {}): Renderer & { drawn: PageModel[][] } {
  const fake = fakeRenderer();
  return { ...fake, ...change, drawn: fake.drawn.render };
}

async function built(i: Input, renderer: Renderer = fake()): Promise<BuiltBook> {
  const result = await buildBook(i, renderer);
  if (result.status !== "built") throw new Error(result.problems.join("\n"));
  return result;
}

/** The book of the plain input, built one time for all the tests that compare with it. */
let plainBook: Promise<BuiltBook> | undefined;
const plain = () => (plainBook ??= built(input()));
/** A book whose bytes are hashes, because a list of bytes takes long to compare. */
const hashed = (book: BuiltBook) => ({ ...book, pdf: sha256(book.pdf), pages: book.pages.map((p) => ({ ...p, image: sha256(p.image) })) });

describe("a good input", () => {
  it("gives the pages, the answers and the record of what made them", async () => {
    const book = await built(input());
    expect(book.pages.map((p) => [p.model.page, p.model.side])).toEqual([[381, "front"], [382, "back"]]);
    expect(book.items).toHaveLength(16);
    for (const { face, answer, steps, shape, shapeVersion } of book.items) {
      const { top, bottom } = stackOf({ face });
      const value = String(Number(top) * Number(bottom));
      expect(answer).toEqual({ parts: [{ name: "answer", kind: "whole-number", value }] });
      expect(steps.at(-1)).toEqual({ text: value, marks: [] });
      expect(shapeVersion).toBe(SHAPES.get(shape)?.version);
    }
    expect(book.record).toMatchObject({ bookId: "example-book", engine: "2.0.0-s11", ...IDENTITY, snapshot: { id: "invented-level-3-v1" } });
    expect(book.record.snapshot.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(book.record.inputHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("has no notice, and a book with a repeat is built and names its rows", async () => {
    expect((await plain()).notices).toEqual([]);
    const limits = { tables: [3], second: { min: 1, max: 2 }, result: { min: 0, max: 100 }, order: "mixed" };
    const repeats = input((i) => { for (const side of [i.snapshot.sheets[0].front, i.snapshot.sheets[0].back]) { put(side, "template", "facts-2x10"); put(side, "rows", [{ id: side === i.snapshot.sheets[0].front ? "one" : "two", shape: "fact.mul", items: 2, limits }]); } });
    expect((await built(repeats)).notices).toEqual(['Sheet "column-multiplication-1", back side, row "two": 2 questions are on the front side too.']);
  });

  it("passes shapeVersion to items without changing layout or solving", async () => {
    const mul = SHAPES.get("mul.column");
    if (!mul) throw new Error("no shape");
    const one = await plain();
    const result = await buildBook(input(), fake(), shapeLibrary([{ ...mul, version: mul.version + 1 }]));
    if (result.status !== "built") throw new Error(result.problems.join("\n"));
    expect(result.items.every((i) => i.shapeVersion === mul.version + 1)).toBe(true);
    const [before, after] = [hashed(one), hashed(result)];
    expect([after.pages, after.positions, after.pdf]).toEqual([before.pages, before.positions, before.pdf]);
  });

  it("does not change its input, and the same input gives the same book", async () => {
    const i = input();
    const before = structuredClone(i);
    const [one, two] = [await built(i), await plain()];
    expect(i).toEqual(before);
    expect(hashed(two)).toEqual(hashed(one));
  });

  it("records the input that it read, also when the caller changes it during the drawing", async () => {
    const i = input();
    const good = fake();
    const during = await built(i, fake({ render: async (pages) => { put(i.book, "childId", "other-child"); put(i.snapshot, "id", "other"); return good.render(pages); } }));
    expect(hashed(during)).toEqual(hashed(await plain()));
  });

  it("is the same book when a sheet says that it does not start a day, and has a time log on its front page when it does", async () => {
    // The drawing is made from the page models alone, so the same models are the same book.
    const one = await plain();
    const [two, three] = [false, true].map((startsDay) => planBook(input((i) => put(i.book.sheets[0], "startsDay", startsDay))));
    if (!two.ok || !three.ok) throw new Error("no plan");
    expect(two.pages).toEqual(one.pages.map((p) => p.model));
    expect(one.pages.map((p) => p.model.captures)).toEqual([[], []]);
    expect(three.pages.map((p) => p.captures.map((c) => c.kind))).toEqual([["time-log"], []]);
    expect(three.pages[1]).toEqual(one.pages[1].model);
    expect(three.items).toEqual(one.items);
  });

  it("puts a time log on the front of a figure sheet when it starts a day, and ignores inherited startsDay", () => {
    const book = structuredClone(inventedBookFixture);
    book.sheets[1].startsDay = true;
    const planned = planBook({ snapshot: inventedSnapshotFixture, book });
    if (!planned.ok) throw new Error(planned.problems.join("\n"));
    expect(planned.pages.map((p) => p.captures.map((c) => c.kind))).toEqual([["time-log"], [], ["time-log"], [], ["time-log"], []]);

    Object.defineProperty(Object.prototype, "startsDay", { value: true, configurable: true, writable: true });
    try {
      const without = planBook(input());
      if (!without.ok) throw new Error(without.problems.join("\n"));
      expect(without.pages.map((p) => p.captures)).toEqual([[], []]);
    } finally {
      Reflect.deleteProperty(Object.prototype, "startsDay");
    }
  });

  it.each<[string, (i: Input) => unknown]>([
    ["child", (i) => put(i.book, "childId", "other-child")],
    ["attempt", (i) => put(i.book.sheets[0], "attempt", 2)],
    ["QR text", (i) => put(i.book.sheets[0].qr, "front", "https://unicalearning.com/tutor/p/other")],
    ["instruction", (i) => put(i.snapshot.sheets[0].front, "instruction", "Multiply.")],
  ])("gives another book and another input hash for another %s", async (_name, change) => {
    const [one, two] = [await plain(), await built(input(change))];
    expect(two.pdf).not.toEqual(one.pdf);
    expect(two.record.inputHash).not.toBe(one.record.inputHash);
  });
});

describe("a build stops, draws nothing and says why", () => {
  it.each<[string, (i: Input) => unknown, string]>([
    ["a bad snapshot", (i) => put(i.snapshot.sheets[0].front, "rows", []), 'Sheet "column-multiplication-1", front side: rows must have at least 1 entry.'],
    ["no child", (i) => put(i.book, "childId", ""), "The book: childId must use only letters, digits and dashes."],
    ["a child of the wrong type", (i) => put(i.book, "childId", 7), "The book: childId must use only letters, digits and dashes."],
    ["no book id", (i) => put(i.book, "bookId", " "), "The book: bookId must use only letters, digits and dashes."],
    ["no sheet", (i) => put(i.book, "sheets", []), "The book: sheets must have at least 1 entry."],
    ["a sheet that the snapshot does not hold", (i) => put(i.book.sheets[0], "sheetId", "gone"), 'The book, sheet 1: the snapshot has no sheet "gone".'],
    ["attempt 0", (i) => put(i.book.sheets[0], "attempt", 0), "The book, sheet 1: attempt must be a whole number, 1 or more."],
    ["the same sheet and attempt twice", (i) => i.book.sheets.push({ ...structuredClone(i.book.sheets[0]), qr: { front: "a", back: "b" } }), 'The book: the sheet and attempt "column-multiplication-1, attempt 1" is used more than once.'],
    ["one QR text on both sides", (i) => put(i.book.sheets[0].qr, "back", i.book.sheets[0].qr.front), 'The book: the QR text "https://unicalearning.com/tutor/p/example-front-381" is used more than once.'],
    ["no QR text", (i) => put(i.book.sheets[0].qr, "back", ""), "The book, sheet 1: the QR text of the back must be printable text with no space."],
    ["a QR text that is too long to scan", (i) => put(i.book.sheets[0].qr, "back", "x".repeat(100)), "Page 382: the QR code for a text of 100 characters needs squares that are too small to scan."],
    ["an unknown field", (i) => put(i.book, "made", "today"), 'The book: unknown field "made".'],
    ["a sheet that starts a day with a word", (i) => put(i.book.sheets[0], "startsDay", "yes"), "The book, sheet 1: startsDay must be true or false."],
    ["a sheet that starts a day with a number", (i) => put(i.book.sheets[0], "startsDay", 1), "The book, sheet 1: startsDay must be true or false."],
    ["a sheet that starts a day with nothing", (i) => put(i.book.sheets[0], "startsDay", null), "The book, sheet 1: startsDay must be true or false."],
    ["an inherited child", (i) => { Reflect.deleteProperty(i.book, "childId"); Object.setPrototypeOf(i.book, { childId: "other-child" }); }, "The book: this must be a plain object."],
    ["an inherited QR text", (i) => { Reflect.deleteProperty(i.book.sheets[0].qr, "front"); Object.setPrototypeOf(i.book.sheets[0].qr, { front: "x" }); }, "The book, sheets[0].qr: this must be a plain object."],
    ["a computed child", (i) => { Object.defineProperty(i.book, "childId", { get: () => "child", enumerable: true }); }, "The book, childId: this must be a plain value."],
  ])("%s", async (_name, change, problem) => {
    const renderer = fake();
    const result = await buildBook(input(change), renderer);
    expect(result).toEqual({ status: "failed", problems: expect.arrayContaining([problem]) });
    expect(renderer.drawn).toEqual([]);
  });

  it("two computations of an answer that disagree", async () => {
    const mul = SHAPES.get("mul.column");
    if (!mul) throw new Error("no shape");
    const renderer = fake();
    const result = await buildBook(input(), renderer, shapeLibrary([{ ...mul, solveAgain: (rows) => { const r = mul.solveAgain(rows); return r && { ...r, answer: wholeNumber(7) }; } }]));
    expect(result.status).toBe("failed");
    if (result.status === "failed") expect(result.problems[0]).toMatch(/question 1 .* by one computation and "7" by another\.$/);
    expect(renderer.drawn).toEqual([]);
  });

  it.each<[string, unknown, RegExp]>([
    ["an empty value", { name: "answer", kind: "whole-number", value: "" }, /the part "answer" has the value "", which is no whole-number\.$/],
    ["a part that is nothing", null, /has a part that is not a name, a kind and a value\.$/],
    ["a name that marking does not know", { name: "total", kind: "whole-number", value: "72" }, /the name "total", which is not known\.$/],
  ])("an answer with %s in both computations, before the layout reads it", async (_name, part, problem) => {
    const mul = SHAPES.get("mul.column");
    if (!mul) throw new Error("no shape");
    const bad = <T extends { answer: Answer }>(item: T): T => ({ ...item, answer: { parts: [part as Answer["parts"][number]] } });
    const renderer = fake();
    const shape: Shape = { ...mul, generate: (l, seed) => bad(mul.generate(l, seed)), solveAgain: (rows) => { const r = mul.solveAgain(rows); return r && bad(r); } };
    const result = await buildBook(input(), renderer, shapeLibrary([shape]));
    if (result.status !== "failed") throw new Error("the book was built");
    expect(result.problems).toHaveLength(16);
    expect(result.problems[0]).toMatch(/^Sheet "column-multiplication-1", front side, question 1: the answer /);
    for (const text of result.problems) expect(text).toMatch(problem);
    expect(renderer.drawn).toEqual([]);
  });

  it("a display function that prints another operand", async () => {
    const mul = SHAPES.get("mul.column");
    if (!mul) throw new Error("no shape");
    const renderer = fake();
    const result = await buildBook(input(), renderer, shapeLibrary([{ ...mul, face: (q) => { const f = stackOf({ face: mul.face(q) }); return { ...f, bottom: f.bottom === "9" ? "8" : String(Number(f.bottom) + 1) }; } }]));
    expect(result.status).toBe("failed");
    if (result.status === "failed") expect(result.problems[0]).toMatch(/question 1 .* by one computation and "\d+" by another\.$/);
    expect(renderer.drawn).toEqual([]);
  });

  it("a layout that puts two digits in each other's place, in a question and in its rows of ink alike", async () => {
    layout.change = (pages) => pages.map((page) => ({ ...page, regions: page.regions.map((r) => (r.role === "question" ? { ...r, ink: r.ink.map((ink, i) => (i < 2 ? { ...ink, rect: r.ink[1 - i].rect } : ink)) } : r)) }));
    const renderer = fake();
    const result = await buildBook(input(), renderer);
    expect(result.status).toBe("failed");
    expect(renderer.drawn).toEqual([]);
  });

  it("a page that breaks a layout rule", async () => {
    layout.change = (pages) => pages.map((p) => ({ ...p, regions: p.regions.filter((r) => r.role !== "qr") }));
    const renderer = fake();
    expect(await buildBook(input(), renderer)).toEqual({ status: "failed", problems: ["Page 381: there must be one qr, not 0.", "Page 382: there must be one qr, not 0."] });
    expect(renderer.drawn).toEqual([]);
  });

  it("a front page that starts a day whose time log disappears, or one that does not start a day that gains one", async () => {
    const goodWithLog = planBook(input((i) => put(i.book.sheets[0], "startsDay", true)));
    if (!goodWithLog.ok) throw new Error("no plan");
    const [frontWithLog] = goodWithLog.pages;
    const captureRegion = frontWithLog.regions.find((r) => r.role === "capture")!;

    layout.change = (pages) => pages.map((p) => ({ ...p, captures: [], regions: p.regions.filter((r) => r.role !== "capture") }));
    const renderer = fake();
    expect(await buildBook(input((i) => put(i.book.sheets[0], "startsDay", true)), renderer)).toEqual({
      status: "failed",
      problems: ["Page 381: the first page of a day must have a time log."],
    });
    expect(renderer.drawn).toEqual([]);

    layout.change = (pages) => pages.map((p, i) => (i === 0 ? { ...p, captures: structuredClone(frontWithLog.captures), regions: [...p.regions, structuredClone(captureRegion)] } : p));
    expect(await buildBook(input(), renderer)).toEqual({
      status: "failed",
      problems: ["Page 381: a page that does not start a day must not have a time log."],
    });
    expect(renderer.drawn).toEqual([]);
  });

  it("a typesetter that puts a rectangle in another place", async () => {
    const good = fake();
    const renderer = fake({ render: async (pages) => { const out = await good.render(pages); out.positions[4] = { ...out.positions[4], rect: { ...out.positions[4].rect, x: 0 } }; return out; } });
    const result = await buildBook(input(), renderer);
    expect(result).toEqual({ status: "failed", problems: [expect.stringMatching(/heading" is at \(0, .* and the model puts it at/)] });
  });

  it("a typesetter that prints another number", async () => {
    const good = fake();
    const renderer = fake({ render: async (pages) => { const out = await good.render(pages); out.texts[3] = { ...out.texts[3], text: "77" }; return out; } });
    const result = await buildBook(input(), renderer);
    expect(result).toEqual({ status: "failed", problems: expect.arrayContaining([expect.stringMatching(/the typesetter drew "77"/)]) });
  });

  type Change = (out: Rendering, pages: readonly PageModel[]) => unknown;
  const stops = async (change: Change) => {
    const good = fake();
    const result = await buildBook(input(), fake({ render: async (pages) => { const out = await good.render(pages); change(out, pages); return out; } }));
    if (result.status !== "failed") throw new Error("the book was built");
    return result.problems;
  };
  const ONE_EACH = "The typesetter must give one image for each of the 2 pages";
  it.each<[string, Change, string]>([
    ["no PDF", (o) => put(o, "pdf", undefined), "The typesetter gave no PDF."],
    ["an empty PDF", (o) => put(o, "pdf", new Uint8Array()), "The typesetter gave no PDF."],
    ["another file as the PDF", (o) => put(o, "pdf", o.images[0]), "The typesetter gave no PDF."],
    ["no images", (o) => put(o, "images", undefined), `${ONE_EACH}, and it gave 0.`],
    ["an empty list of images", (o) => put(o, "images", []), `${ONE_EACH}, and it gave 0.`],
    ["an image too few", (o) => o.images.pop(), `${ONE_EACH}, and it gave 1.`],
    ["an image too many", (o) => o.images.push(o.images[0]), `${ONE_EACH}, and it gave 3.`],
    ["an empty image", (o) => put(o.images, "1", new Uint8Array()), "The typesetter gave no image of page 382."],
    ["a missing image", (o) => put(o.images, "0", undefined), "The typesetter gave no image of page 381."],
    ["an image that is text", (o) => put(o.images, "0", "page"), "The typesetter gave no image of page 381."],
    ["no positions", (o) => put(o, "positions", undefined), "The typesetter gave no positions of page 381."],
    ["no positions of one page", (o) => put(o, "positions", o.positions.filter((p) => p.sheet === 1)), "The typesetter gave no positions of page 382."],
    ["texts with no size", (o) => put(o.texts[0], "natural", undefined), "The typesetter gave a text with no size or place."],
    ["texts with no line", (o) => put(o.texts[0], "start", { x: 1 }), "The typesetter gave a text with no size or place."],
    ["a text that is nothing", (o) => put(o.texts, "0", null), "The typesetter gave a text with no size or place."],
    ["no texts", (o) => put(o, "texts", undefined), "The typesetter gave no texts of page 381."],
  ])("a typesetter that gives %s", async (_name, change, problem) => {
    expect(await stops(change)).toContain(problem);
  });

  it.each<[string, Change, RegExp]>([
    ["a blank page", (o, pages) => put(o.images, "0", pagePng({ ...pages[0], regions: [] })), /^Page 381: the image has no QR code that can be read in its box\.$/m],
    ["a page with no QR ink", (o, pages) => put(o.images, "1", pagePng({ ...pages[1], regions: pages[1].regions.filter((r) => r.role !== "qr") })), /^Page 382: the image has no QR code that can be read in its box\.$/m],
    ["the images of two pages in each other's place", (o) => o.images.reverse(), /^Page 381: .*QR code[^]*^Page 382: .*QR code/m],
    ["a page with no printed text", (o, pages) => put(o.images, "0", pagePng({ ...pages[0], regions: pages[0].regions.map((r) => ({ ...r, ink: r.ink.filter((i) => i.kind !== "text") })) })), /^Page 381: "heading" must print "3-20 · Multiplying 2 digits by 1 digit" and the image has no ink there\.$/m],
    ["a page with a black square in an answer area", (o, pages) => { const canvas = drawPage(pages[0]); paint(canvas, { x: 150, y: 190, w: 3, h: 3 }); put(o.images, "0", toPng(canvas)); }, /^Page 381: the image has ink that the model does not have, at \(150, 190\) in "answer-1"\.$/m],
    ["bytes that are not an image", (o) => put(o.images, "0", new TextEncoder().encode("page")), /^Page 381: the page image cannot be read\.$/m],
  ])("a typesetter whose image is %s, with a good report", async (_name, change, problem) => {
    expect((await stops(change)).join("\n")).toMatch(problem);
  });

  it.each<[string, Change, RegExp]>([
    ["a text that does not fit its place", (o) => { Object.assign(o.texts[0].natural, { w: 500 }); }, /^Page 381: the text "3-20 · Multiplying 2 digits by 1 digit" of "heading" is 500 points wide and its place is 443\.$/m],
    ["a digit in another place", (o) => { for (const at of [o.texts[6].start, o.texts[6].end]) at.x -= 24; }, /^Page 381: question 1 must have "\d" of its line 2 in the ones, and it stands in the tens\.$/m],
    ["a PDF of other pages", (o, pages) => put(o, "pdf", pagesPdf([...pages].reverse())), /^Page 381: the PDF draws/m],
    ["a PDF that cannot be read", (o) => put(o, "pdf", new TextEncoder().encode("%PDF-1.7")), /^The PDF cannot be read\.$/m],
  ])("a typesetter that gives %s", async (_name, change, problem) => {
    expect((await stops(change)).join("\n")).toMatch(problem);
  });

  it("a typesetter that fails", async () => {
    const renderer = fake({ render: async () => { throw new RenderError("Typst reported: a warning"); } });
    expect(await buildBook(input(), renderer)).toEqual({ status: "failed", problems: ["Typst reported: a warning"] });
  });

  it("but a fault in the code itself is not hidden as a problem of the book", async () => {
    const renderer = fake({ render: async () => { throw new TypeError("a fault"); } });
    await expect(buildBook(input(), renderer)).rejects.toThrow("a fault");
  });
});

describe("a book with the history of the child", () => {
  const empty = { books: [], lastAttempts: [], seenPhrasings: [] };

  it("prints the same questions and pages with an empty history, and the input hash covers the history", () => {
    const [none, nothing] = [planBook(input()), planBook(input((i) => put(i.book, "history", empty)))];
    if (!none.ok || !nothing.ok) throw new Error("no plan");
    expect(nothing.items).toEqual(none.items);
    expect(nothing.pages).toEqual(none.pages);
    expect(nothing.inputHash).not.toBe(none.inputHash);
  });

  it("prints a repeat of a sheet with no question of the attempt before it, when the limits have enough", async () => {
    const one = await plain();
    const history = historyFromBooks([one]);
    const two = planBook(input((i) => { put(i.book.sheets[0], "attempt", 2); put(i.book, "history", history); }));
    if (!two.ok) throw new Error(two.problems.join("\n"));
    const seen = new Set(history.books[0].items.map((item) => item.key));
    expect(two.items.filter((item) => seen.has(canonicalJson(item.question)))).toEqual([]);
    expect(two.pages.map((p) => p.attempt)).toEqual([2, 2]);
  });

  it.each<[string, unknown, RegExp]>([
    ["a history that is no object", "all of it", /The history: this must be an object/],
    ["a history that is null", null, /The history: this must be an object/],
    ["an unknown field", { ...empty, extra: 1 }, /The history: unknown field "extra"/],
    ["a missing list", { books: [], lastAttempts: [] }, /seenPhrasings is missing/],
    ["books that are no list", { ...empty, books: {} }, /books must be a list/],
    ["an item with no key", { ...empty, books: [{ bookId: "b", items: [{ shape: "fact.mul" }] }] }, /book 1, item 1: key is missing/],
    ["an empty key", { ...empty, books: [{ bookId: "b", items: [{ shape: "fact.mul", key: "" }] }] }, /key must be text of 1 to 4096 characters/],
    ["a shape that is no id", { ...empty, books: [{ bookId: "b", items: [{ shape: "Fact Mul", key: "k" }] }] }, /shape must be the id of a shape/],
    ["a book twice", { ...empty, books: [{ bookId: "b", items: [] }, { bookId: "b", items: [] }] }, /the book "b" is used more than once/],
    ["a last attempt on no side", { ...empty, lastAttempts: [{ sheetId: "s", attempt: 1, items: [{ shape: "fact.mul", key: "k", side: "middle", rowId: "r", form: "f" }] }] }, /side must be front or back/],
    ["a last attempt of 0", { ...empty, lastAttempts: [{ sheetId: "s", attempt: 0, items: [] }] }, /attempt must be a whole number, 1 or more/],
    ["two last attempts of one sheet", { ...empty, lastAttempts: [{ sheetId: "s", attempt: 1, items: [] }, { sheetId: "s", attempt: 2, items: [] }] }, /the sheet of a last attempt "s" is used more than once/],
    ["a phrasing that is no id", { ...empty, seenPhrasings: [{ question: "q", phrasing: "Long One" }] }, /phrasing must use only small letters/],
    ["too many books", { ...empty, books: Array.from({ length: 201 }, (_, i) => ({ bookId: `b${i}`, items: [] })) }, /books has 201 entries and the limit is 200/],
  ])("stops a book with %s", (_name, history, problem) => {
    const plan = planBook(input((i) => put(i.book, "history", history)));
    expect(plan.ok).toBe(false);
    if (!plan.ok) expect(plan.problems.join("\n")).toMatch(problem);
  });
});

describe("a book of word problems", () => {
  type StoryInput = { snapshot: typeof inventedSnapshotFixture; book: typeof inventedBookFixture & Record<string, unknown> };
  /** The sheet of word problems alone, for a child, with a change of the book. */
  const storyBook = (change: (book: StoryInput["book"]) => unknown = () => {}, childId = "story-child"): StoryInput => {
    const book = { ...structuredClone(inventedBookFixture), childId, sheets: [structuredClone(inventedBookFixture.sheets[2])] } as StoryInput["book"];
    change(book);
    return { snapshot: inventedSnapshotFixture, book };
  };
  const planned = (i: StoryInput) => {
    const plan = planBook(i);
    if (!plan.ok) throw new Error(plan.problems.join("\n"));
    return plan;
  };
  const storyOf = (item: { question: unknown }) => item.question as StoryQuestion;
  const textOf = (item: { face: Face }) => (item.face.kind === "story" ? `${item.face.tokens.map(tokenText).join(" ")} [${item.face.unit}]` : "");
  const children = Array.from({ length: 10 }, (_, i) => `child-${i}`);

  it("fills every story with the default scenario and the default region when the book names none", () => {
    const plan = planned(storyBook());
    for (const item of plan.items) expect(storyOf(item).region).toBe("CA");
    const words = children.flatMap((child) => planned(storyBook(() => {}, child)).items.map(textOf)).join("\n");
    for (const word of ["muffins", "stickers", "centimetres", "colourful", "litres", "toonies"]) expect(words).toContain(word);
    for (const word of ["moon rocks", "snack bars", "inches", "color", "quarts", "pennies"]) expect(words).not.toContain(word);
  });

  it("takes another approved scenario and another region pack when the book names them", () => {
    const words = (change: (book: StoryInput["book"]) => unknown) => children.flatMap((child) => planned(storyBook(change, child)).items.map(textOf)).join("\n");
    const space = words((b) => { b.scenario = "space"; });
    for (const word of ["moon rocks", "space station", "snack bars", "centimetres"]) expect(space).toContain(word);
    expect(space).not.toMatch(/\bmuffins\b|\bstickers\b/);
    const us = words((b) => { b.region = "US"; });
    for (const word of ["inches", "colorful", "quarts", "pennies", "nickels", "muffins"]) expect(us).toContain(word);
    for (const word of ["centimetres", "colourful", "litres", "toonie"]) expect(us).not.toContain(word);
  });

  it("prints a question of one region only in that region", () => {
    const ids = (region: string) => new Set(children.flatMap((child) => planned(storyBook((b) => { b.region = region; }, child)).items.map((i) => storyOf(i).question)));
    expect([...ids("CA")].sort()).toEqual(["half-of-them", "juice-left", "muffin-boxes", "muffins-left", "ribbon-cut", "toonie-savings"]);
    expect([...ids("US")].sort()).toEqual(["half-of-them", "juice-left", "muffin-boxes", "muffins-left", "nickels-to-pennies", "ribbon-cut"]);
  });

  it.each<[string, (book: StoryInput["book"]) => unknown, string]>([
    ["an unknown region", (b) => { b.region = "UK"; }, 'The book: the snapshot has no region pack "UK".'],
    ["a region that is no text", (b) => { b.region = 5; }, "The book: the snapshot has no region pack 5."],
    ["an unknown scenario", (b) => { b.scenario = "jungle"; }, 'The book: the snapshot has no scenario of the interest "jungle".'],
  ])("stops a book with %s", (_name, change, problem) => {
    expect(planBook(storyBook(change))).toEqual({ ok: false, problems: [problem] });
  });

  it("reads no region, scenario or word problems that an object inherits", () => {
    const names = ["region", "scenario", "questions", "scenarios", "regionPacks", "defaultRegion", "multipleOf", "regions"];
    const values: Record<string, unknown> = { region: "US", scenario: "space", questions: [], scenarios: [], regionPacks: [], defaultRegion: "US", multipleOf: 7, regions: ["US"] };
    for (const name of names) Object.defineProperty(Object.prototype, name, { value: values[name], configurable: true, writable: true });
    try {
      const plan = planned(storyBook());
      expect(plan.items.every((i) => storyOf(i).region === "CA" && !storyOf(i).scenario.includes("station") && !storyOf(i).scenario.includes("rocket"))).toBe(true);
      const plain = planBook(input());
      expect(plain.ok).toBe(true);
    } finally {
      for (const name of names) Reflect.deleteProperty(Object.prototype, name);
    }
  });

  it("stops a region or a scenario for a snapshot with no word problems, and refuses null region or scenario", () => {
    expect(planBook(input((i) => { put(i.book, "region", "CA"); }))).toEqual({ ok: false, problems: ["The book: the snapshot has no word problems, so the book has no region or scenario."] });
    expect(planBook(storyBook((b) => { put(b, "region", null); put(b, "scenario", null); }))).toEqual({
      ok: false,
      problems: [
        "The book: the snapshot has no region pack null.",
        "The book: the snapshot has no scenario of the interest null.",
      ],
    });
  });

  it("prints the half as one piece of math, and the answer is the half with its unit and worked steps", () => {
    const halves = children.flatMap((child) => planned(storyBook(() => {}, child)).items).filter((i) => storyOf(i).question === "half-of-them");
    expect(halves.length).toBeGreaterThan(5);
    for (const item of halves) {
      if (item.face.kind !== "story") throw new Error("not a story");
      const [{ value: count }] = storyOf(item).slots;
      expect(item.face.tokens.filter((t) => tokenText(t).includes("½"))).toEqual([{ kind: "math", pieces: ["½"] }]);
      expect(item.answer).toEqual({ parts: [{ name: "answer", kind: "quantity", value: String(count / 2), unit: item.face.unit }] });
      expect(item.steps).toEqual([{ text: `½ × ${count} = ${count / 2}`, marks: [] }, { text: `${count / 2} ${item.face.unit}`, marks: [] }]);
    }
  });

  it("takes the phrasings and the questions that the child has not read first, and is built when the child has read all", () => {
    // The back row asks for 2 of its 3 questions of the region, so a repeat can print the one that the child has not seen.
    const twoOfThree = (i: StoryInput) => { i.snapshot = structuredClone(i.snapshot); i.snapshot.sheets[2].back.rows[0].items = 2; return i; };
    for (const child of children) {
      const one = planned(twoOfThree(storyBook(() => {}, child)));
      const history = historyFromBooks([{ record: { bookId: "book-1" }, items: one.items }]);
      const two = planned(twoOfThree(storyBook((b) => { b.sheets[0].attempt = 2; b.history = history; }, child)));
      const read = new Set(history.seenPhrasings.map((p) => `${p.question}/${p.phrasing}`));
      expect(two.items.map((i) => `${storyOf(i).question}/${storyOf(i).phrasing}`).filter((p) => read.has(p))).toEqual([]);
      const back = (items: typeof one.items) => items.filter((i) => i.side === "back").map((i) => storyOf(i).question);
      expect(back(two.items)).toContain(["muffins-left", "juice-left", "toonie-savings"].find((q) => !back(one.items).includes(q)));
      const everything = { ...history, seenPhrasings: [...history.seenPhrasings, ...two.items.map((i) => ({ question: storyOf(i).question, phrasing: storyOf(i).phrasing }))] };
      expect(planBook(twoOfThree(storyBook((b) => { b.sheets[0].attempt = 3; b.history = everything; }, child))).ok).toBe(true);
    }
  });

  it("chooses the phrasing from the seed: the same for one child and attempt, both for many children", () => {
    const phrasings = (child: string, attempt = 1) => planned(storyBook((b) => { b.sheets[0].attempt = attempt; }, child)).items.map((i) => `${storyOf(i).question}/${storyOf(i).phrasing}`);
    expect(phrasings("child-1")).toEqual(phrasings("child-1"));
    const all = new Set(children.flatMap((child) => phrasings(child)));
    for (const question of ["muffin-boxes", "half-of-them", "ribbon-cut"]) expect([...all].filter((p) => p.startsWith(`${question}/`))).toHaveLength(2);
  });
});

describe.skipIf(skipTypstTests())("with the real Typst", () => {
  it("builds Book 1, takes invented marks, builds Book 2 from the position with every check, and replays Book 1 to the same bytes", async () => {
    const renderer = await openRenderer(testAssets());
    const bank = validateSnapshot(structuredClone(factsSnapshotFixture));
    if (!bank.ok) throw new Error(bank.problems.join("\n"));
    const [A, B, C, D, E] = levelOrder(bank.snapshot).map((s) => s.id);
    const qr = (book: number, sheet: number) => ({ front: `https://unicalearning.com/tutor/p/repeat-${book}-${sheet}-front`, back: `https://unicalearning.com/tutor/p/repeat-${book}-${sheet}-back` });
    const firstRequest = { bookId: "repeat-book-1", childId: "repeat-child", sheets: [A, B, C, D].map((sheetId, i) => ({ sheetId, attempt: 1, qr: qr(1, i), ...(i % 2 === 0 ? { startsDay: true } : {}) })) };
    const saved = canonicalJson({ snapshot: factsSnapshotFixture, book: firstRequest });
    const one = await built(JSON.parse(saved) as Input, renderer);
    expect(one.pages.map((p) => p.model.attempt)).toEqual(Array(8).fill(1));

    // Invented marks: A all right, B five wrong (of 40: four are allowed), C and D unmarked. Three of the eight pages are scanned.
    const itemsOf = (sheetId: string) => one.items.filter((i) => i.sheetId === sheetId);
    const marks: Record<string, ItemMark[]> = {
      [A]: itemsOf(A).map((i) => ({ itemId: i.id, firstTry: "right" })),
      [B]: itemsOf(B).slice(0, 5).map((i) => ({ itemId: i.id, firstTry: "wrong", correction: "right" })),
    };
    const results = [A, B].map((sheetId): SheetResultRecord => {
      const outcome = sheetResult(itemsOf(sheetId), marks[sheetId], { masteryPercent: 90 });
      if (!outcome.ok) throw new Error(outcome.problems.join("\n"));
      return { bookId: "repeat-book-1", sheetId, attempt: 1, result: outcome.result, itemsScored: outcome.itemsScored, mistakes: outcome.mistakes };
    });
    expect(results.map((r) => r.result)).toEqual(["mastered", "repeat"]);
    const pagesOf = (sheetId: string) => one.pages.filter((p) => p.model.sheetId === sheetId).map((p) => p.model.page) as [number, number];
    const issued = [A, B, C, D].map((sheetId) => ({ bookId: "repeat-book-1", bookNumber: 1, sheetId, attempt: 1, pages: pagesOf(sheetId) }));
    const receipts = [...pagesOf(A), pagesOf(B)[0]].map((pageNumber) => ({ bookId: "repeat-book-1", pageNumber }));
    const where = position({ childId: "repeat-child" }, issued, receipts, results, bank.snapshot);
    if (!where.ok) throw new Error(where.problems.join("\n"));
    expect(where.queue.map((q) => `${q.sheetId}#${q.attempt} ${q.reason}`)).toEqual([`${B}#2 repeat`, `${C}#2 unscanned`, `${D}#2 unscanned`, `${E}#1 new`]);
    expect(where.teamNotices).toHaveLength(2);

    const next = planNextBook({
      bookId: "repeat-book-2", childId: "repeat-child", snapshot: bank.snapshot, position: where, pagesPerDay: 4, days: 2,
      qrTokens: [0, 1, 2, 3].flatMap((i) => [qr(2, i).front, qr(2, i).back]), history: historyFromBooks([one]),
    });
    if (!next.ok) throw new Error(next.problems.join("\n"));
    const two = await built({ snapshot: factsSnapshotFixture, book: next.request } as unknown as Input, renderer);
    expect(two.pages.map((p) => [p.model.sheetId, p.model.attempt])).toEqual([B, B, C, C, D, D, E, E].map((id, i) => [id, i < 6 ? 2 : 1]));
    expect(two.pages.map((p) => p.model.captures.length)).toEqual([1, 0, 0, 0, 1, 0, 0, 0]);
    const footer = (p: PageModel) => p.regions.find((r) => r.role === "footer")?.ink.flatMap((i) => (i.kind === "text" ? [i.text] : []));
    expect(footer(two.pages[0].model)).toEqual([`Level 2 · Page ${pagesOf(B)[0]} · #2`]);
    expect(footer(two.pages[6].model)).toEqual([`Level 2 · Page ${two.pages[6].model.page}`]);
    // The repeat of B prints questions that B did not print, where its rows have them.
    const printed = (book: BuiltBook, sheetId: string) => book.items.filter((i) => i.sheetId === sheetId).map((i) => `${i.shape} ${canonicalJson(i.question)}`);
    expect(printed(two, B).filter((k) => printed(one, B).includes(k)).length).toBeLessThan(printed(two, B).length / 2);

    const again = await built(JSON.parse(saved) as Input, renderer);
    expect(Buffer.compare(again.pdf, one.pdf)).toBe(0);
    expect(again.pages.map((p, i) => Buffer.compare(p.image, one.pages[i].image))).toEqual(Array(8).fill(0));
    expect(again.record).toEqual(one.record);
  });

  it("the same input gives the same bytes, and another child's book has other bytes", async () => {
    const renderer = await openRenderer(testAssets());
    const few = (childId: string) => input((i) => { put(i.book, "childId", childId); for (const side of [i.snapshot.sheets[0].front, i.snapshot.sheets[0].back]) put(side, "rows", [{ ...side.rows[0], items: 2 }]); });
    const [one, two, other] = await Promise.all([built(few("child"), renderer), built(few("child"), renderer), built(few("other-child"), renderer)]);
    expect(Buffer.compare(one.pdf, two.pdf)).toBe(0);
    expect(one.pages.map((p, i) => Buffer.compare(p.image, two.pages[i].image))).toEqual([0, 0]);
    expect(Buffer.compare(one.pdf, other.pdf)).not.toBe(0);
    expect(one.pages.map((p, i) => Buffer.compare(p.image, other.pages[i].image) === 0)).toEqual([false, false]);
  });
});
