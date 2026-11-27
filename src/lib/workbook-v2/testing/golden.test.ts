import { execFile } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import fc from "fast-check";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PageModel } from "../contract";
import factsSnapshot from "../fixtures/snapshot-facts.json";
import { sha256 } from "../hash";
import { PINS } from "../render/pins";
import { openRenderer } from "../render/typst";
import { fakeRenderer } from "./fake-renderer";
import { gitRepoOf, pathsOverlap, refuseInsideGit, resolvedPath } from "./git-repo";
import {
  compareGoldenBook, differenceImage, goldenRecord, goldenReport, imageSha256, modelSha256, pixelDifference, readAccepted,
  type AcceptedChange, type ExpectedBook, type GoldenBuild,
} from "./golden";
import { buildGoldenBooks, GOLDEN_CHILDREN, goldenBookName, goldenInput, levelId, SYNTHETIC_LEVELS } from "./golden-books";
import { acceptedFile, committedBaselineFile, GOLDEN_DIR, readAcceptedFile, readBaselineFile, readFullBaseline, writeDifferenceImages, writeFullBaseline } from "./golden-files";
import { drawPage, toColourPng, toPng } from "./raster";
import { skipTypstTests, testAssets } from "./typst";

let folder = "";
let builds: GoldenBuild[] = [];
beforeAll(async () => {
  folder = mkdtempSync(join(tmpdir(), "workbook-v2-golden-"));
  builds = await buildGoldenBooks(SYNTHETIC_LEVELS, fakeRenderer());
});
afterAll(() => rmSync(folder, { recursive: true, force: true }));

const bookOf = (name: string) => builds.find((b) => b.book === name)!;
const FACTS = levelId(SYNTHETIC_LEVELS[0]);
const strong = () => bookOf(goldenBookName(FACTS, "strong"));
/** The full baseline of a build: its record, its page models and its images. */
const full = (build: GoldenBuild): ExpectedBook => ({ record: goldenRecord(build), models: build.pages.map((p) => p.model), images: build.pages.map((p) => p.image) });
/** A copy of a build with one page changed. */
const changePage = (build: GoldenBuild, index: number, change: (page: { model: PageModel; image: Uint8Array }) => { model: PageModel; image: Uint8Array }): GoldenBuild =>
  ({ ...build, pages: build.pages.map((p, i) => (i === index ? change({ model: structuredClone(p.model), image: p.image }) : p)) });
/** The page image with one pixel painted. */
function withPixel(model: PageModel, x: number, y: number, value = 0): Uint8Array {
  const canvas = drawPage(model);
  canvas.grey[y * canvas.width + x] = value;
  return toPng(canvas);
}
const allFiles = (dir: string): string[] => (existsSync(dir) ? readdirSync(dir, { recursive: true, encoding: "utf8" }).sort() : []);

// G1: two golden books on each synthetic level, a strong and a weak child, that build with every check and match their baselines.
describe("the golden books of the synthetic levels", () => {
  it("are a strong and a weak child on each level: the strong one moves on, the weak one repeats with attempt 2 and its history", () => {
    expect(builds.map((b) => b.book)).toEqual(SYNTHETIC_LEVELS.flatMap((level) => GOLDEN_CHILDREN.map((child) => goldenBookName(levelId(level), child))));
    for (const level of SYNTHETIC_LEVELS) {
      const [one, two] = GOLDEN_CHILDREN.map((child) => bookOf(goldenBookName(levelId(level), child)));
      expect(one.pages.every((p) => p.model.attempt === 1)).toBe(true);
      expect(two.pages.some((p) => p.model.attempt >= 2)).toBe(true);
      const { book } = goldenInput(level, "weak") as { book: { history: { books: unknown[]; lastAttempts: { attempt: number }[] }; sheets: { attempt: number }[] } };
      expect(book.history.books).toHaveLength(1);
      expect(book.history.lastAttempts.length).toBeGreaterThan(0);
      expect(book.sheets[0].attempt).toBe(2);
      // The strong child's book has no sheet of Book 1: Book 1 was mastered.
      const strongBook = goldenInput(level, "strong").book as { history: { lastAttempts: { sheetId: string }[] }; sheets: { sheetId: string }[] };
      const firstBook = strongBook.history.lastAttempts.map((a) => a.sheetId);
      expect(strongBook.sheets.some((s) => firstBook.includes(s.sheetId))).toBe(false);
    }
  });

  it("makes the weak child repeat (attempt 2) at every supported mastery percent, including 1, 50, 90 and 100", () => {
    for (const masteryPercent of [1, 50, 90, 100]) {
      for (const level of SYNTHETIC_LEVELS) {
        const input = goldenInput({ snapshot: level.snapshot, masteryPercent }, "weak");
        const book = input.book as { sheets: { attempt: number }[] };
        expect(book.sheets[0].attempt, `${levelId(level)} at ${masteryPercent}%`).toBe(2);
      }
    }
  });

  it("are the same each time they are built", async () => {
    const again = await buildGoldenBooks(SYNTHETIC_LEVELS, fakeRenderer());
    expect(again.map(goldenRecord)).toEqual(builds.map(goldenRecord));
  });
});

// G1 & G3 with real printed pixels: committed synthetic baselines use pinned Typst so visible heading/font/template changes require Cedric.
describe.skipIf(skipTypstTests())("the committed Typst golden baselines", () => {
  it("match pinned Typst output with the committed accepted list, and require cedric for a visible heading change", async () => {
    const renderer = await openRenderer(testAssets());
    const expectedLabel = `typst@${PINS.version}`;
    const typstBuilds = await buildGoldenBooks(SYNTHETIC_LEVELS, renderer);
    const byName = new Map(typstBuilds.map((b) => [b.book, b]));
    const accepted = readAcceptedFile(acceptedFile(process.cwd()));
    for (const level of SYNTHETIC_LEVELS) {
      const baseline = readBaselineFile(committedBaselineFile(process.cwd(), levelId(level)));
      expect(baseline.renderer).toBe(expectedLabel);
      expect(baseline.books.map((b) => b.book)).toEqual(GOLDEN_CHILDREN.map((child) => goldenBookName(levelId(level), child)));
      for (const record of baseline.books) {
        const comparison = compareGoldenBook({ record }, byName.get(record.book)!, accepted);
        expect(comparison.ok, goldenReport([comparison])).toBe(true);
      }
    }
    // Changing a heading in real Typst changes printed pixels, so savar is refused and cedric is required.
    const baseBook = byName.get(goldenBookName(FACTS, "strong"))!;
    const editedModel = structuredClone(baseBook.pages[0].model);
    editedModel.topicTitle = "Changed Heading";
    for (const region of editedModel.regions) {
      if (region.role !== "heading") continue;
      for (const ink of region.ink) if (ink.kind === "text") ink.text = "Changed Heading";
    }
    const rendered = await renderer.render([editedModel]);
    const mutated: GoldenBuild = { ...baseBook, pages: baseBook.pages.map((p, i) => (i === 0 ? { model: editedModel, image: rendered.images[0] } : p)) };
    const savarEntry: AcceptedChange = {
      book: mutated.book, page: 1, approver: "savar", reason: "heading text",
      modelSha256: modelSha256(mutated.pages[0].model), imageSha256: imageSha256(mutated.pages[0].image),
    };
    const bySavar = compareGoldenBook({ record: goldenRecord(baseBook) }, mutated, [savarEntry]);
    expect(bySavar.ok).toBe(false);
    expect(bySavar.changes[0].childVisible).toBe(true);
    expect(bySavar.changes[0].refused.join("\n")).toMatch(/accepted by cedric/);
    const byCedric = compareGoldenBook({ record: goldenRecord(baseBook) }, mutated, [{ ...savarEntry, approver: "cedric" }]);
    expect(byCedric.ok).toBe(true);
  });
});

// G2: the page model and the pixels decide; the PDF hash is information only.
describe("a golden comparison", () => {
  it("passes an unchanged book with no changed page", () => {
    const comparison = compareGoldenBook(full(strong()), strong());
    expect(comparison).toMatchObject({ ok: true, changes: [], pdf: { same: true }, inputHash: { same: true }, pages: { expected: 4, actual: 4 } });
  });

  it("names one changed pixel: its count, its change and its box", () => {
    const changed = changePage(strong(), 1, ({ model }) => ({ model, image: withPixel(model, 10, 20) }));
    const comparison = compareGoldenBook(full(strong()), { ...changed, pdf: strong().pdf });
    expect(comparison.ok).toBe(false);
    expect(comparison.pdf.same).toBe(true);
    expect(comparison.changes).toEqual([expect.objectContaining({
      page: 2, what: "changed", model: [], childVisible: true, accepted: null,
      pixels: { kind: "pixels", changed: 1, maxDelta: 255, box: { x: 10, y: 20, w: 1, h: 1 } },
    })]);
    expect(goldenReport([comparison])).toMatch(/page 2 \(printed page \d+\) changed, the child sees it: not accepted\.[\s\S]*1 pixels changed \(largest change 255\) in the box x 10, y 20, 1 × 1/);
  });

  it("names the exact paths of a model change that draws the same pixels, and the parts of the outline with a record alone", () => {
    const changed = changePage(strong(), 0, ({ model, image }) => ({ model: { ...model, topicTitle: "Another title", regions: model.regions.map((r, i) => (i === 0 ? { ...r, item: "moved" } : r)) }, image }));
    const exact = compareGoldenBook(full(strong()), changed);
    const first = strong().pages[0].model;
    expect(exact.changes).toEqual([expect.objectContaining({ page: 1, pixels: null, childVisible: false })]);
    expect(exact.changes[0].model).toEqual([
      { path: "regions[0].item", expected: JSON.stringify(first.regions[0].item), actual: "\"moved\"" },
      { path: "topicTitle", expected: JSON.stringify(first.topicTitle), actual: "\"Another title\"" },
    ]);
    const outline = compareGoldenBook({ record: goldenRecord(strong()) }, changed);
    expect(outline.changes[0].model.map((d) => d.path)).toEqual(expect.arrayContaining(["topicTitle", "regions[moved]"]));
    expect(outline.changes[0].pixels).toBeNull();
  });

  it("reports a PDF-only difference as information and passes", () => {
    const comparison = compareGoldenBook(full(strong()), { ...strong(), pdf: new TextEncoder().encode("%PDF other bytes") });
    expect(comparison).toMatchObject({ ok: true, changes: [], pdf: { same: false } });
    expect(goldenReport([comparison])).toMatch(/PDF \(information only\): [0-9a-f]{64} to [0-9a-f]{64}/);
  });

  it("finds a changed image with a record alone by its hash, a changed size, and an added and a removed page", () => {
    const pixel = changePage(strong(), 3, ({ model }) => ({ model, image: withPixel(model, 1, 1) }));
    expect(compareGoldenBook({ record: goldenRecord(strong()) }, pixel).changes[0].pixels).toEqual({ kind: "hash-only" });
    const small = toPng({ width: 3, height: 2, grey: new Uint8Array(6).fill(255) });
    expect(pixelDifference(strong().pages[0].image, small)).toMatchObject({ kind: "size", actual: { width: 3, height: 2 } });
    const shorter = { ...strong(), pages: strong().pages.slice(0, 3) };
    expect(compareGoldenBook(full(strong()), shorter).changes).toEqual([expect.objectContaining({ page: 4, what: "removed", modelSha256: "none", imageSha256: "none", childVisible: true })]);
    const longer = { ...strong(), pages: [...strong().pages, strong().pages[0]] };
    expect(compareGoldenBook(full(strong()), longer).changes).toEqual([expect.objectContaining({ page: 5, what: "added", modelSha256: modelSha256(strong().pages[0].model) })]);
  });

  it("hashes the picture and not the packing: a grey file and a colour file of the same pixels are the same image", () => {
    const canvas = drawPage(strong().pages[0].model);
    const [grey, colour] = [toPng(canvas), toColourPng(canvas, [])];
    expect(Buffer.compare(grey, colour)).not.toBe(0);
    expect(imageSha256(grey)).toBe(imageSha256(colour));
    expect(pixelDifference(grey, colour)).toEqual({ kind: "pixels", changed: 0, maxDelta: 0, box: null });
    expect(imageSha256(toColourPng(canvas, [{ x: 5, y: 5, colour: [255, 0, 0] }]))).not.toBe(imageSha256(grey));
  });

  it("counts every changed pixel and boxes them exactly, for any set of pixels", () => {
    const size = { width: 23, height: 17 };
    const blank = () => ({ ...size, grey: new Uint8Array(size.width * size.height).fill(255) });
    fc.assert(fc.property(fc.uniqueArray(fc.record({ x: fc.nat(size.width - 1), y: fc.nat(size.height - 1), v: fc.nat(254) }), { selector: (p) => `${p.x},${p.y}`, maxLength: 40 }), (points) => {
      const canvas = blank();
      for (const { x, y, v } of points) canvas.grey[y * size.width + x] = v;
      const result = pixelDifference(toPng(blank()), toPng(canvas));
      const box = points.length === 0 ? null : {
        x: Math.min(...points.map((p) => p.x)), y: Math.min(...points.map((p) => p.y)),
        w: Math.max(...points.map((p) => p.x)) - Math.min(...points.map((p) => p.x)) + 1, h: Math.max(...points.map((p) => p.y)) - Math.min(...points.map((p) => p.y)) + 1,
      };
      expect(result).toEqual({ kind: "pixels", changed: points.length, maxDelta: points.length === 0 ? 0 : Math.max(...points.map((p) => 255 - p.v)), box });
    }), { numRuns: 100 });
  });

  it("refuses a full baseline whose page PNG or model disagrees with its manifest", () => {
    const stalePng = full(strong());
    stalePng.images = stalePng.images!.map((img, i) => (i === 0 ? withPixel(strong().pages[0].model, 4, 4) : img));
    expect(() => compareGoldenBook(stalePng, strong())).toThrow(/image hash.*does not match its manifest/);

    const staleModel = full(strong());
    staleModel.models = staleModel.models!.map((m, i) => (i === 0 ? { ...m, topicTitle: "Tampered" } : m));
    expect(() => compareGoldenBook(staleModel, strong())).toThrow(/model hash.*does not match its manifest/);

    const base = join(mkdtempSync(join(folder, "stale-")), "baseline");
    writeFullBaseline(base, "fake", [strong()]);
    writeFileSync(join(base, `${FACTS}__strong`, "page-1.png"), withPixel(strong().pages[0].model, 8, 8));
    expect(() => readFullBaseline(base)).toThrow(/image hash.*does not match its manifest/);
  });

  it("draws a difference image with each changed pixel black", () => {
    const model = strong().pages[0].model;
    const difference = differenceImage(strong().pages[0].image, withPixel(model, 7, 9, 128));
    const canvas = drawPage(model);
    expect(difference).not.toBeNull();
    expect(pixelDifference(toPng({ ...canvas, grey: new Uint8Array(canvas.grey.length).fill(255) }), difference!)).toMatchObject({ kind: "pixels" });
    const marked = toPng({ ...canvas, grey: canvas.grey.map((g, i) => (i === 9 * canvas.width + 7 ? 0 : 255 - Math.round((255 - g) / 4))) });
    expect(imageSha256(difference!)).toBe(imageSha256(marked));
  });
});

// G3: a changed page passes only when it is accepted with the hashes of the new page, by cedric when the child sees it.
describe("accepted changes", () => {
  const pixelChange = () => changePage(strong(), 1, ({ model }) => ({ model, image: withPixel(model, 3, 4) }));
  const modelChange = () => changePage(strong(), 2, ({ model, image }) => ({ model: { ...model, instruction: "Another instruction." }, image }));
  const entryFor = (build: GoldenBuild, page: number, change: Partial<AcceptedChange> = {}): AcceptedChange => ({
    book: build.book, page, approver: "cedric", reason: "The new layout of the bar.", modelSha256: modelSha256(build.pages[page - 1].model), imageSha256: imageSha256(build.pages[page - 1].image), ...change,
  });

  it("fails a changed page that is not accepted, with what to add to accept it", () => {
    const comparison = compareGoldenBook(full(strong()), pixelChange());
    expect(comparison.ok).toBe(false);
    expect(goldenReport([comparison])).toContain(`To accept: {"book":"${strong().book}","page":2,"approver":"cedric"`);
  });

  it("passes a page accepted with the hashes of the new page, and the report says who accepted it", () => {
    const changed = pixelChange();
    const comparison = compareGoldenBook(full(strong()), changed, [entryFor(changed, 2)]);
    expect(comparison.ok).toBe(true);
    expect(comparison.changes[0].accepted).toEqual({ approver: "cedric", reason: "The new layout of the bar." });
    expect(goldenReport([comparison])).toMatch(/page 2 .* accepted by cedric: The new layout of the bar\./);
  });

  it.each([
    ["a stale image hash: the page changed again", (b: GoldenBuild) => entryFor(b, 2, { imageSha256: imageSha256(strong().pages[1].image) }), /its image hash is/],
    ["a stale model hash", (b: GoldenBuild) => entryFor(b, 2, { modelSha256: "0".repeat(64) }), /its model hash is/],
    ["savar for a change the child sees", (b: GoldenBuild) => entryFor(b, 2, { approver: "savar" }), /accepted by cedric/],
    ["an empty reason", (b: GoldenBuild) => entryFor(b, 2, { reason: " " }), /the reason is empty/],
    ["an unknown approver", (b: GoldenBuild) => entryFor(b, 2, { approver: "someone" as AcceptedChange["approver"] }), /must be cedric or savar/],
  ])("fails %s", (_case, entry, why) => {
    const changed = pixelChange();
    const comparison = compareGoldenBook(full(strong()), changed, [entry(changed)]);
    expect(comparison.ok).toBe(false);
    expect(comparison.changes[0].refused.join("\n")).toMatch(why);
  });

  it("lets savar accept a model change that the child does not see, and applies no entry of another book or page", () => {
    const changed = modelChange();
    expect(compareGoldenBook(full(strong()), changed, [entryFor(changed, 3, { approver: "savar" })]).ok).toBe(true);
    expect(compareGoldenBook(full(strong()), changed, [entryFor(changed, 2, { approver: "savar" }), { ...entryFor(changed, 3), book: "another/strong" }]).ok).toBe(false);
  });

  it("accepts a removed page with the hashes none", () => {
    const shorter = { ...strong(), pages: strong().pages.slice(0, 3) };
    const entry: AcceptedChange = { book: shorter.book, page: 4, approver: "cedric", reason: "One sheet less.", modelSha256: "none", imageSha256: "none" };
    expect(compareGoldenBook(full(strong()), shorter, [entry]).ok).toBe(true);
  });

  it("reads only complete accepted entries", () => {
    const good = { book: "a/strong", page: 1, approver: "savar", reason: "r", modelSha256: "a".repeat(64), imageSha256: "none" };
    expect(readAccepted([good])).toEqual([good]);
    expect(readAccepted({})).toEqual(["The accepted list must be a JSON list."]);
    expect(readAccepted([{ ...good, approver: "bob" }, { ...good, reason: "" }, { ...good, page: 0 }, { ...good, imageSha256: "x" }, { ...good, extra: 1 }, 5])).toEqual([
      "Accepted entry 1: approver must be cedric or savar.", "Accepted entry 2: reason must not be empty.", "Accepted entry 3: page must be a whole number, 1 or more.",
      "Accepted entry 4: modelSha256 and imageSha256 must be SHA-256 hashes, or \"none\" for a removed page.",
      "Accepted entry 5 must have exactly book, page, approver, reason, modelSha256 and imageSha256.", "Accepted entry 6 must be an object.",
    ]);
  });
});

/** The golden command, bundled one time for this file, and run in a fresh process each time. */
let golden = "";
const run = (args: string[]): Promise<{ code: number; stdout: string; stderr: string }> => new Promise((done) => {
  execFile(process.execPath, [golden, ...args], { maxBuffer: 1 << 24 }, (error, stdout, stderr) =>
    done({ code: typeof error?.code === "number" ? error.code : error ? 1 : 0, stdout, stderr }));
});
beforeAll(async () => {
  const runner = JSON.stringify(pathToFileURL(resolve("scripts/run-script.mjs")).href);
  const bundle = join(folder, "golden-bundle.mjs");
  const make = join(folder, "make-golden.mjs");
  writeFileSync(make, `import { bundleScript } from ${runner}; await bundleScript("scripts/workbook-v2-golden.ts", ${JSON.stringify(bundle)});`);
  golden = join(folder, "golden.mjs");
  writeFileSync(golden, `import { runBundle } from ${runner}; await runBundle(${JSON.stringify(bundle)});`);
  const made = await new Promise<number>((done) => execFile(process.execPath, [make], (error) => done(error ? 1 : 0)));
  expect(made).toBe(0);
});

// G4: one build in two fresh processes gives the same bytes: the PDF and every page PNG.
describe("two fresh processes", () => {
  const typst = !skipTypstTests();
  it(`build every golden book to the same PDF and page PNG bytes${typst ? " with the real Typst" : " (Typst is not installed: the fake renderer)"}`, async () => {
    const args = ["--hashes", "--renderer", typst ? "typst" : "fake"];
    const [one, two] = await Promise.all([run(args), run(args)]);
    expect(one).toMatchObject({ code: 0, stderr: "" });
    expect(two.stdout).toBe(one.stdout);
    const lines = one.stdout.trim().split("\n").map((l) => JSON.parse(l) as { book: string; pdf: string; pages: string[] });
    expect(lines.map((l) => l.book)).toEqual(builds.map((b) => b.book));
    expect(lines.every((l) => /^[0-9a-f]{64}$/.test(l.pdf) && l.pages.length === 4)).toBe(true);
    if (!typst) expect(lines.map((l) => l.pages)).toEqual(builds.map((b) => b.pages.map((p) => sha256(p.image))));
  });
});

// G5: real-level golden files never go into a git repository; the public repository has synthetic golden fixtures only.
describe("the git repository guard", () => {
  /** A folder that is a git repository (a ".git" folder, or a ".git" file as in a worktree), and a folder outside it. */
  function places(kind: "folder" | "file" = "folder") {
    const root = mkdtempSync(join(folder, "place-"));
    const repo = join(root, "repo");
    mkdirSync(join(repo, "inside"), { recursive: true });
    if (kind === "folder") mkdirSync(join(repo, ".git"));
    else writeFileSync(join(repo, ".git"), "gitdir: /elsewhere/.git/worktrees/repo\n");
    const outside = join(root, "outside");
    mkdirSync(outside);
    return { root, repo, outside };
  }

  it("finds the repository of a path through a .git folder or file, a path that does not exist yet, and symbolic links", () => {
    const repoOf = (path: string) => { const found = gitRepoOf(path); return found && resolvedPath(found); };
    const { root, repo, outside } = places();
    expect(repoOf(join(repo, "inside", "not", "yet"))).toBe(resolvedPath(repo));
    expect(repoOf(outside)).toBeNull();
    symlinkSync(join(repo, "inside"), join(outside, "link"));
    expect(repoOf(join(outside, "link", "new-file.json"))).toBe(resolvedPath(repo));
    symlinkSync(join(repo, "inside", "missing-target"), join(outside, "dangling"));
    expect(repoOf(join(outside, "dangling"))).toBe(resolvedPath(repo));
    symlinkSync(join(outside, "link"), join(root, "chain"));
    expect(repoOf(join(root, "chain", "x"))).toBe(resolvedPath(repo));
    const worktree = places("file");
    expect(repoOf(join(worktree.repo, "inside"))).toBe(resolvedPath(worktree.repo));
    expect(() => refuseInsideGit(join(repo, "inside"), "the baseline")).toThrow(/^Refused: the baseline .* is inside the git repository/);
    expect(gitRepoOf(process.cwd())).not.toBeNull();
  });

  it("writes no full baseline and no difference image inside a repository", () => {
    const { repo } = places("file");
    expect(() => writeFullBaseline(join(repo, "inside", "golden"), "fake", builds)).toThrow(/Refused/);
    expect(() => writeDifferenceImages(join(repo, "inside", "diff"), [], new Map(), builds)).toThrow(/Refused/);
    expect(allFiles(join(repo, "inside"))).toEqual([]);
  });

  it("resolves symlinks before '..' and refuses a symlinked book folder inside an otherwise-outside output folder", () => {
    const { repo, outside } = places();
    const out = join(outside, "trapped-out");
    mkdirSync(out, { recursive: true });
    symlinkSync(join(repo, "inside"), join(out, `${FACTS}__strong`));
    expect(() => writeFullBaseline(out, "fake", builds)).toThrow(/Refused: .* is inside the git repository/);
    expect(allFiles(join(repo, "inside"))).toEqual([]);

    // Symlink before `..`: `outside/hop/..` (un-normalized!) follows `hop -> repo/inside`, then `..` lands in `repo` (NOT `outside`).
    symlinkSync(join(repo, "inside"), join(outside, "hop"));
    const hopParent = `${outside}/hop/..`;
    expect(resolvedPath(hopParent)).toBe(resolvedPath(repo));
    expect(gitRepoOf(hopParent)).not.toBeNull();
    // Missing component followed by `..` must be refused so a later symlink cannot bypass checks.
    expect(() => resolvedPath(`${outside}/missing/../hop/level.json`)).toThrow(/traverses "\.\." through non-existent component/);
    expect(pathsOverlap(out, join(out, "sub"))).toBe(true);
    expect(pathsOverlap(out, join(out, "..output"))).toBe(true);
  });

  it("refuses overlapping --out/--baseline/--snapshot folders and refuses overwriting an existing full baseline", async () => {
    const { outside } = places();
    const privateSnapshot = join(outside, "golden.json");
    writeFileSync(privateSnapshot, JSON.stringify(factsSnapshot));
    const snapOverlap = await run(["--snapshot", privateSnapshot, "--out", outside, "--renderer", "fake"]);
    expect(snapOverlap.code).toBe(1);
    expect(snapOverlap.stderr).toMatch(/Refused: --snapshot .* and --out .* overlap/);

    const base = join(outside, "same-dir");
    expect((await run(["--snapshot", privateSnapshot, "--out", base, "--renderer", "fake"])).code).toBe(0);
    const overlap = await run(["--snapshot", privateSnapshot, "--out", base, "--baseline", base, "--renderer", "fake"]);
    expect(overlap.code).toBe(1);
    expect(overlap.stderr).toMatch(/Refused: --out .* and --baseline .* overlap/);
    expect(() => writeFullBaseline(base, "fake", builds)).toThrow(/already exists/);
  });

  it("refuses a real-level snapshot or output inside a repository, also through a link or a worktree, and writes nothing", async () => {
    const { repo, outside } = places();
    const worktree = places("file");
    const privateSnapshot = join(outside, "level.json");
    writeFileSync(privateSnapshot, JSON.stringify(factsSnapshot));
    writeFileSync(join(repo, "inside", "level.json"), JSON.stringify(factsSnapshot));
    symlinkSync(join(repo, "inside"), join(outside, "into-repo"));
    const before = [allFiles(repo), allFiles(worktree.repo)];
    const refusals = await Promise.all([
      run(["--snapshot", join(repo, "inside", "level.json"), "--out", join(outside, "golden"), "--renderer", "fake"]),
      run(["--snapshot", privateSnapshot, "--out", join(repo, "inside", "golden"), "--renderer", "fake"]),
      run(["--snapshot", privateSnapshot, "--out", join(outside, "into-repo", "golden"), "--renderer", "fake"]),
      run(["--snapshot", privateSnapshot, "--out", join(worktree.repo, "inside", "golden"), "--renderer", "fake"]),
      run(["--snapshot", privateSnapshot, "--baseline", join(outside, "into-repo"), "--renderer", "fake"]),
      run(["--snapshot", privateSnapshot, "--update", "--renderer", "fake"]),
    ]);
    for (const r of refusals) expect(r.code, r.stdout + r.stderr).toBe(1);
    expect(refusals.slice(0, 5).every((r) => /Refused: .* is inside the git repository/.test(r.stderr))).toBe(true);
    expect(refusals[5].stderr).toMatch(/Refused: --update writes the committed synthetic baselines and never a real level/);
    expect([allFiles(repo), allFiles(worktree.repo)]).toEqual(before);
    expect(existsSync(join(outside, "golden"))).toBe(false);
  });

  it("writes a real-level full baseline outside every repository, compares with it, and shows a changed pixel with its images", async () => {
    const { outside } = places();
    const privateSnapshot = join(outside, "level.json");
    writeFileSync(privateSnapshot, JSON.stringify(factsSnapshot));
    const base = join(outside, "baseline");
    expect((await run(["--snapshot", privateSnapshot, "--out", base, "--renderer", "fake"])).code).toBe(0);
    expect(readdirSync(base).sort()).toEqual(["golden.json", `${FACTS}__strong`, `${FACTS}__weak`]);
    const same = await run(["--snapshot", privateSnapshot, "--baseline", base, "--renderer", "fake"]);
    expect(same.code, same.stderr).toBe(0);
    expect(same.stdout).toContain(`${FACTS}/weak: no changed page.`);
    // The baseline image of page 1 of the strong book had one pixel more: the run shows that one pixel.
    const older = withPixel(strong().pages[0].model, 12, 34);
    writeFileSync(join(base, `${FACTS}__strong`, "page-1.png"), older);
    const record = JSON.parse(readFileSync(join(base, "golden.json"), "utf8")) as { books: { pages: { imageSha256: string }[] }[] };
    record.books[0].pages[0].imageSha256 = imageSha256(older);
    writeFileSync(join(base, "golden.json"), JSON.stringify(record));
    const diff = join(outside, "diff");
    const changed = await run(["--snapshot", privateSnapshot, "--baseline", base, "--renderer", "fake", "--diff-dir", diff]);
    expect(changed.code).toBe(1);
    expect(changed.stdout).toMatch(/page 1 .* changed, the child sees it: not accepted\.[\s\S]*1 pixels changed \(largest change 255\) in the box x 12, y 34, 1 × 1/);
    expect(changed.stderr).toContain(`1 changed page is not accepted: ${FACTS}/strong page 1.`);
    expect(readdirSync(join(diff, `${FACTS}__strong`)).sort()).toEqual(["page-1-actual.png", "page-1-difference.png", "page-1-expected.png"]);
  });

  it("keeps only synthetic golden files in the repository: invented snapshots, invented children, and their baselines", () => {
    for (const level of SYNTHETIC_LEVELS) expect(levelId(level)).toMatch(/^invented-/);
    const files = readdirSync(join(process.cwd(), GOLDEN_DIR)).sort();
    expect(files).toEqual(["accepted.json", ...SYNTHETIC_LEVELS.map((l) => `${levelId(l)}.json`)].sort());
    for (const file of files) expect(statSync(join(process.cwd(), GOLDEN_DIR, file)).size).toBeLessThan(40_000);
    const text = files.map((f) => readFileSync(join(process.cwd(), GOLDEN_DIR, f), "utf8")).join("\n");
    expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  });
});
