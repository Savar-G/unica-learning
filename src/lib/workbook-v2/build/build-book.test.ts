import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PageModel } from "../contract";
import rawBook from "../fixtures/book.json";
import rawSnapshot from "../fixtures/snapshot.json";
import { openRenderer } from "../render/typst";
import { RenderError, type Renderer } from "../renderer";
import { SHAPES, shapeLibrary } from "../shapes";
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

/** A renderer that says it drew exactly the model. */
function fake(change: Partial<Renderer> = {}): Renderer & { drawn: PageModel[][] } {
  const drawn: PageModel[][] = [];
  return {
    drawn,
    identity: { typst: "none", fonts: "none" },
    render: async (pages) => {
      drawn.push([...pages]);
      return {
        pdf: new TextEncoder().encode(JSON.stringify(pages)),
        images: pages.map((p) => new TextEncoder().encode(p.id)),
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

describe("a good input", () => {
  it("gives the pages, the answers and the record of what made them", async () => {
    const book = await built(input());
    expect(book.pages.map((p) => [p.model.page, p.model.side])).toEqual([[381, "front"], [382, "back"]]);
    expect(book.items).toHaveLength(16);
    for (const { face, answer, steps } of book.items) {
      expect(answer).toEqual({ kind: "whole-number", value: String(Number(face.top) * Number(face.bottom)) });
      expect(steps.at(-1)).toBe(answer.value);
    }
    expect(book.record).toMatchObject({ bookId: "example-book", engine: "2.0.0-s1", typst: "none", snapshot: { id: "invented-level-3-v1" } });
    expect(book.record.snapshot.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(book.record.inputHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("does not change its input, and the same input gives the same book", async () => {
    const i = input();
    const before = structuredClone(i);
    const [one, two] = [await built(i), await built(input())];
    expect(i).toEqual(before);
    expect(two).toEqual(one);
  });

  it.each<[string, (i: Input) => unknown]>([
    ["child", (i) => put(i.book, "childId", "other-child")],
    ["attempt", (i) => put(i.book.sheets[0], "attempt", 2)],
    ["QR text", (i) => put(i.book.sheets[0].qr, "front", "https://unicalearning.com/tutor/p/other")],
    ["instruction", (i) => put(i.snapshot.sheets[0].front, "instruction", "Multiply.")],
  ])("gives another book and another input hash for another %s", async (_name, change) => {
    const [one, two] = [await built(input()), await built(input(change))];
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
    const result = await buildBook(input(), renderer, shapeLibrary([{ ...mul, solveAgain: (q) => ({ ...mul.solveAgain(q), value: "7" }) }]));
    expect(result.status).toBe("failed");
    if (result.status === "failed") expect(result.problems[0]).toMatch(/question 1 .* by one computation and "7" by another\.$/);
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
    const [one, two, other] = await Promise.all([built(input(), renderer), built(input(), renderer), built(input((i) => put(i.book, "childId", "other-child")), renderer)]);
    expect(Buffer.compare(one.pdf, two.pdf)).toBe(0);
    expect(one.pages.map((p, i) => Buffer.compare(p.image, two.pages[i].image))).toEqual([0, 0]);
    expect(Buffer.compare(one.pdf, other.pdf)).not.toBe(0);
    expect(one.pages.map((p, i) => Buffer.compare(p.image, other.pages[i].image) === 0)).toEqual([false, false]);
  });
});
