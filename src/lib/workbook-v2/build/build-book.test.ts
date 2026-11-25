import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PageModel } from "../contract";
import rawBook from "../fixtures/book.json";
import rawSnapshot from "../fixtures/snapshot.json";
import { sha256 } from "../hash";
import { openRenderer } from "../render/typst";
import { RenderError, type Renderer, type Rendering } from "../renderer";
import { SHAPES, shapeLibrary } from "../shapes";
import { pagePng } from "../testing/raster";
import { skipTypstTests, testAssets } from "../testing/typst";
import { buildBook, type BuiltBook } from "./build-book";

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

const IDENTITY: Renderer["identity"] = { typst: "0.0.0", program: "p", template: "t", fonts: { "A.ttf": "a", "B.ttf": "b" } };
/** The image of a page, made one time for all the tests that print the same page. */
const images = new Map<string, Uint8Array>();
function imageOf(page: PageModel): Uint8Array {
  const key = JSON.stringify(page);
  const image = images.get(key) ?? pagePng(page);
  images.set(key, image);
  return Uint8Array.from(image);
}
/** A renderer that draws exactly the model. */
function fake(change: Partial<Renderer> = {}): Renderer & { drawn: PageModel[][] } {
  const drawn: PageModel[][] = [];
  return {
    drawn,
    identity: IDENTITY,
    render: async (pages) => {
      drawn.push([...pages]);
      return {
        pdf: new TextEncoder().encode(`%PDF-${JSON.stringify(pages)}`),
        images: pages.map(imageOf),
        positions: pages.flatMap((p, i) => p.regions.map((r) => ({ id: r.id, sheet: i + 1, rect: r.rect }))),
        texts: pages.flatMap((p, i) => p.regions.flatMap((r) => r.ink.flatMap((ink) => (ink.kind === "text" ? [{ sheet: i + 1, x: ink.rect.x, y: ink.rect.y, text: ink.text }] : [])))),
      };
    },
    ...change,
  };
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
      expect(answer).toEqual({ kind: "whole-number", value: String(Number(face.top) * Number(face.bottom)) });
      expect(steps.at(-1)).toEqual({ text: answer.value, marks: [] });
      expect(shapeVersion).toBe(SHAPES.get(shape)?.version);
    }
    expect(book.record).toMatchObject({ bookId: "example-book", engine: "2.0.0-s3", ...IDENTITY, snapshot: { id: "invented-level-3-v1" } });
    expect(book.record.snapshot.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(book.record.inputHash).toMatch(/^[0-9a-f]{64}$/);
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
    const result = await buildBook(input(), renderer, shapeLibrary([{ ...mul, solveAgain: (rows) => { const r = mul.solveAgain(rows); return r && { ...r, answer: { ...r.answer, value: "7" } }; } }]));
    expect(result.status).toBe("failed");
    if (result.status === "failed") expect(result.problems[0]).toMatch(/question 1 .* by one computation and "7" by another\.$/);
    expect(renderer.drawn).toEqual([]);
  });

  it("a display function that prints another operand", async () => {
    const mul = SHAPES.get("mul.column");
    if (!mul) throw new Error("no shape");
    const renderer = fake();
    const result = await buildBook(input(), renderer, shapeLibrary([{ ...mul, face: (q) => { const f = mul.face(q); return { ...f, bottom: f.bottom === "9" ? "8" : String(Number(f.bottom) + 1) }; } }]));
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
    expect(result).toEqual({ status: "failed", problems: [expect.stringMatching(/the typesetter drew "77"/)] });
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
    ["no texts", (o) => put(o, "texts", undefined), "The typesetter gave no texts of page 381."],
  ])("a typesetter that gives %s", async (_name, change, problem) => {
    expect(await stops(change)).toContain(problem);
  });

  it.each<[string, Change, RegExp]>([
    ["a blank page", (o, pages) => put(o.images, "0", pagePng({ ...pages[0], regions: [] })), /^Page 381: the image has no QR code that can be read in its box\.$/m],
    ["a page with no QR ink", (o, pages) => put(o.images, "1", pagePng({ ...pages[1], regions: pages[1].regions.filter((r) => r.role !== "qr") })), /^Page 382: the image has no QR code that can be read in its box\.$/m],
    ["the images of two pages in each other's place", (o) => o.images.reverse(), /^Page 381: .*QR code[^]*^Page 382: .*QR code/m],
    ["a page with no printed text", (o, pages) => put(o.images, "0", pagePng({ ...pages[0], regions: pages[0].regions.map((r) => ({ ...r, ink: r.ink.filter((i) => i.kind !== "text") })) })), /^Page 381: "heading" must print "3-20 · Multiplying 2 digits by 1 digit" and the image has no ink there\.$/m],
    ["bytes that are not an image", (o) => put(o.images, "0", new TextEncoder().encode("page")), /^Page 381: the page image cannot be read\.$/m],
  ])("a typesetter whose image is %s, with a good report", async (_name, change, problem) => {
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

describe.skipIf(skipTypstTests())("with the real Typst", () => {
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
