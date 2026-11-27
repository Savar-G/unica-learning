import { beforeAll, describe, expect, it } from "vitest";
import { buildBook, PART_OF_BOOK, planBook, wholeBook } from "@/lib/workbook-v2/build/build-book";
import { canonicalJson, sha256 } from "@/lib/workbook-v2/hash";
import { RenderError } from "@/lib/workbook-v2/renderer";
import { fakeRenderer } from "@/lib/workbook-v2/testing/fake-renderer";
import { publishV2Book } from "./job";
import { memory, deps, request } from "./publish.fixtures";
import { replayBook, type ReplayCause, type ReplayExpected } from "./replay";

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
    expect(result).toEqual({
      ok: false, differences: [expect.stringMatching(/^the PDF differs/), expect.stringMatching(/^page 5 differs/)],
      firstDifference: { kind: "page-pixels", message: expect.stringMatching(/^page 5 differs/), details: { page: 5, expected: "0".repeat(64), actual: expected.pageSha256s[4] } },
    });
  });

  it("refuses a saved input that is not one, and one whose snapshot was changed", async () => {
    const notOne = "the saved input is not a v2 book input of format 1";
    expect(await replayBook({ format: 2 }, expected, fakeRenderer())).toEqual({ ok: false, differences: [notOne], firstDifference: { kind: "input-format", message: notOne } });
    const changed = structuredClone(saved) as { snapshot: { id: string } };
    changed.snapshot.id = "another-snapshot";
    const result = await replayBook(changed, expected, fakeRenderer());
    expect(!result.ok && result.differences[0]).toMatch(/the input hash differs/);
  });

  it("checks a published input as the whole book that it was built as, and an input saved with no checks as a part of a book", async () => {
    expect((saved as { checks: unknown }).checks).toEqual(wholeBook(4));
    // The same sheets with the first two new sheets out of the level order: a part of a book builds, a whole book does not.
    const swapped = structuredClone(saved) as { format: 1; snapshot: unknown; book: { sheets: { sheetId: string; attempt: number }[] }; checks?: unknown };
    const [a, b] = swapped.book.sheets;
    [swapped.book.sheets[0], swapped.book.sheets[1]] = [{ ...a, sheetId: b.sheetId, attempt: b.attempt }, { ...b, sheetId: a.sheetId, attempt: a.attempt }];
    const renderer = fakeRenderer();
    const part = await buildBook({ snapshot: swapped.snapshot, book: swapped.book }, renderer, PART_OF_BOOK);
    if (part.status !== "built") throw new Error(part.problems.join("\n"));
    const same: ReplayExpected = { ...expected, inputHash: part.record.inputHash, pdfSha256: sha256(part.pdf), pageSha256s: part.pages.map((p) => sha256(p.image)) };
    const whole = await replayBook(swapped, same, fakeRenderer());
    expect(whole).toMatchObject({ ok: false, firstDifference: { kind: "build" } });
    expect(!whole.ok && whole.differences.join("\n")).toMatch(/^Level check, sheet ".+", page \d+, slot "page": this new sheet comes after a new sheet that is later in the level\.$/m);
    const older = { ...swapped };
    Reflect.deleteProperty(older, "checks");
    expect(await replayBook(older, same, fakeRenderer())).toMatchObject({ ok: true });
    const bad = { ...swapped, checks: { book: "whole" } };
    expect(await replayBook(bad, same, fakeRenderer())).toMatchObject({ ok: false, firstDifference: { kind: "input-format", message: expect.stringMatching(/^the checks of the saved input are not/) } });
  });
});

// The first difference (G6): the first cause in causal order, so a later difference that follows from it is never named first.
describe("the first difference of a replay", () => {
  type Saved = { format: 1; snapshot: { id: string }; book: { sheets: { sheetId: string }[] } };
  const savedCopy = () => structuredClone(saved) as Saved;
  const snapshotHash = () => {
    const { snapshot, book } = saved as Saved;
    const plan = planBook({ snapshot, book });
    if (!plan.ok) throw new Error(plan.problems.join("\n"));
    return plan.snapshot.hash;
  };
  const otherSnapshot = () => {
    const changed = savedCopy();
    changed.snapshot.id = "another-snapshot";
    return changed;
  };
  const modelHashes = async () => {
    const built = await buildBook({ snapshot: (saved as Saved).snapshot, book: (saved as Saved).book }, fakeRenderer(), PART_OF_BOOK);
    if (built.status !== "built") throw new Error(built.problems.join("\n"));
    return built.pages.map((p) => sha256(canonicalJson(p.model)));
  };
  const zero = "0".repeat(64);
  const withPage = (list: string[], i: number) => list.map((h, j) => (j === i ? zero : h));
  type Case = [string, (e: ReplayExpected) => ReplayExpected | Promise<ReplayExpected>, ReplayCause, (() => unknown)?, string?];
  const cases: Case[] = [
    ["a saved input that is not one", (e) => e, "input-format", () => ({ format: 2 })],
    ["a saved input that does not plan", (e) => e, "plan", () => { const c = savedCopy(); c.book.sheets[0].sheetId = "no-such-sheet"; return c; }],
    ["a changed snapshot", (e) => ({ ...e, expectedSnapshotHash: snapshotHash() }), "snapshot", otherSnapshot],
    ["the input hash", (e) => ({ ...e, inputHash: zero }), "input-hash"],
    ["the engine", (e) => ({ ...e, engineVersion: "2.0.0-old" }), "engine"],
    ["the renderer", (e) => ({ ...e, rendererVersion: "typst@0.14.0" }), "renderer"],
    ["a font", (e) => ({ ...e, fontHashes: { ...e.fontHashes, "A.ttf": "z" } }), "font"],
    ["a build that fails", (e) => e, "build", undefined, "the typesetter stopped"],
    ["the page count", (e) => ({ ...e, pageSha256s: [...e.pageSha256s, zero] }), "page-count"],
    ["a page model", async (e) => ({ ...e, pageModelSha256s: withPage(await modelHashes(), 2) }), "page-model"],
    ["a page's pixels", (e) => ({ ...e, pageSha256s: withPage(e.pageSha256s, 6) }), "page-pixels"],
    ["the PDF alone", (e) => ({ ...e, pdfSha256: zero }), "pdf"],
    // More than one cause: the first in causal order is named.
    ["a changed snapshot and so its input hash", (e) => ({ ...e, expectedSnapshotHash: snapshotHash() }), "snapshot", otherSnapshot],
    ["the input hash and the engine", (e) => ({ ...e, inputHash: zero, engineVersion: "2.0.0-old" }), "input-hash"],
    ["the engine and a font", (e) => ({ ...e, engineVersion: "2.0.0-old", fontHashes: { ...e.fontHashes, "B.ttf": "z" } }), "engine"],
    ["the renderer and a font", (e) => ({ ...e, rendererVersion: "typst@0.14.0", fontHashes: { ...e.fontHashes, "page.typ": "z" } }), "renderer"],
    ["the page count, a page and the PDF", (e) => ({ ...e, pdfSha256: zero, pageSha256s: [...withPage(e.pageSha256s, 1), zero] }), "page-count"],
    ["a later page model, an earlier page's pixels and the PDF", async (e) => ({ ...e, pdfSha256: zero, pageModelSha256s: withPage(await modelHashes(), 6), pageSha256s: withPage(e.pageSha256s, 1) }), "page-model"],
    ["a page's pixels and the PDF", (e) => ({ ...e, pdfSha256: zero, pageSha256s: withPage(e.pageSha256s, 3) }), "page-pixels"],
  ];

  it.each(cases)("names %s", async (_case, change, kind, input = () => saved, stop) => {
    const renderer = fakeRenderer(stop ? { render: () => { throw new RenderError(stop); } } : {});
    const result = await replayBook(input(), await change(expected), renderer);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.firstDifference.kind).toBe(kind);
    expect(result.differences.join("\n")).toContain(result.firstDifference.message);
    const built = ["build", "page-count", "page-model", "page-pixels", "pdf"].includes(kind);
    expect(renderer.drawn.render).toHaveLength(built ? 1 : 0);
  });

  it("names the page of a changed model or pixels, and passes with the right snapshot hash and page models", async () => {
    const pixels = await replayBook(saved, { ...expected, pageSha256s: withPage(expected.pageSha256s, 6) }, fakeRenderer());
    expect(!pixels.ok && pixels.firstDifference.details?.page).toBe(7);
    const model = await replayBook(saved, { ...expected, pageModelSha256s: withPage(await modelHashes(), 2) }, fakeRenderer());
    expect(!model.ok && model.firstDifference).toMatchObject({ kind: "page-model", details: { page: 3, expected: zero } });
    const same = await replayBook(saved, { ...expected, expectedSnapshotHash: snapshotHash(), pageModelSha256s: await modelHashes() }, fakeRenderer());
    expect(same).toMatchObject({ ok: true, pages: 8 });
  });

  it("names the snapshot before the input hash and still lists both", async () => {
    const result = await replayBook(otherSnapshot(), { ...expected, expectedSnapshotHash: snapshotHash() }, fakeRenderer());
    expect(!result.ok && result.differences).toEqual([expect.stringMatching(/^the snapshot differs: the book has [0-9a-f]{64}, the saved input gives [0-9a-f]{64} \(another-snapshot\)$/), expect.stringMatching(/^the input hash differs/)]);
  });

  it("refuses malformed expected replay data (missing pageSha256s or mismatched pageModelSha256s length) without throwing", async () => {
    const emptyModels = await replayBook(saved, { ...expected, pageModelSha256s: [] }, fakeRenderer());
    expect(emptyModels).toMatchObject({ ok: false, firstDifference: { kind: "input-format", message: expect.stringMatching(/pageModelSha256s has 0 entries/) } });
    const extraModel = await replayBook(saved, { ...expected, pageModelSha256s: [...(await modelHashes()), zero] }, fakeRenderer());
    expect(extraModel).toMatchObject({ ok: false, firstDifference: { kind: "input-format", message: expect.stringMatching(/pageModelSha256s has 9 entries/) } });
    const missingPages = await replayBook(saved, { ...expected, pageSha256s: undefined as unknown as string[] }, fakeRenderer());
    expect(missingPages).toMatchObject({ ok: false, firstDifference: { kind: "input-format", message: expect.stringMatching(/pageSha256s/) } });
  });
});
