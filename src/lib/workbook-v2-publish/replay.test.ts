import { beforeAll, describe, expect, it } from "vitest";
import { fakeRenderer } from "@/lib/workbook-v2/testing/fake-renderer";
import { publishV2Book } from "./job";
import { memory, deps, request } from "./publish.fixtures";
import { replayBook, type ReplayExpected } from "./replay";

// Replay (R1): the same bytes again from the saved input, or the part that differs, named, with no build.

let saved: unknown;
let expected: ReplayExpected;
beforeAll(async () => {
  const { store, files } = memory();
  const result = await publishV2Book(deps(store, files), request());
  if (result.status !== "published") throw new Error(result.status);
  const book = (await store.storedBook(result.record.workbookId))!;
  saved = JSON.parse(new TextDecoder().decode((await files.get(book.inputPath))!));
  expected = { ...book, pdfSha256: book.pdfSha256!, pageSha256s: book.pages.map((p) => p.imageSha256!) };
});

describe("replay", () => {
  it("builds the same PDF and every page image again", async () => {
    const result = await replayBook(saved, expected, fakeRenderer());
    expect(result).toMatchObject({ ok: true, pdfSha256: expected.pdfSha256, pages: 8 });
  });

  it.each([
    ["a font", (e: ReplayExpected) => ({ ...e, fontHashes: { ...e.fontHashes, "A.ttf": "z" } }), /the hash of A.ttf differs/],
    ["the drawing file", (e: ReplayExpected) => ({ ...e, fontHashes: { ...e.fontHashes, "page.typ": "z" } }), /the hash of page.typ differs/],
    ["a font this computer does not have", (e: ReplayExpected) => ({ ...e, fontHashes: { ...e.fontHashes, "C.ttf": "c" } }), /the hash of C.ttf differs: the book has c, this computer has none/],
    ["the engine", (e: ReplayExpected) => ({ ...e, engineVersion: "2.0.0-old" }), /the engine version differs: the book has 2.0.0-old/],
    ["the renderer", (e: ReplayExpected) => ({ ...e, rendererVersion: "typst@0.14.0" }), /the renderer version differs/],
    ["the input hash", (e: ReplayExpected) => ({ ...e, inputHash: "f".repeat(64) }), /the input hash differs/],
  ])("names a different %s and builds nothing", async (_case, change, difference) => {
    const renderer = fakeRenderer();
    const result = await replayBook(saved, change(expected), renderer);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.differences.join("\n")).toMatch(difference);
    expect(renderer.drawn.render).toHaveLength(0);
  });

  it("names each page whose bytes differ, and the PDF", async () => {
    const pages = [...expected.pageSha256s];
    pages[4] = "0".repeat(64);
    const result = await replayBook(saved, { ...expected, pdfSha256: "1".repeat(64), pageSha256s: pages }, fakeRenderer());
    expect(result).toEqual({ ok: false, differences: [expect.stringMatching(/^the PDF differs/), expect.stringMatching(/^page 5 differs/)] });
  });

  it("refuses a saved input that is not one, and one whose snapshot was changed", async () => {
    expect(await replayBook({ format: 2 }, expected, fakeRenderer())).toEqual({ ok: false, differences: ["the saved input is not a v2 book input of format 1"] });
    const changed = structuredClone(saved) as { snapshot: { id: string } };
    changed.snapshot.id = "another-snapshot";
    const result = await replayBook(changed, expected, fakeRenderer());
    expect(!result.ok && result.differences[0]).toMatch(/the input hash differs/);
  });
});
