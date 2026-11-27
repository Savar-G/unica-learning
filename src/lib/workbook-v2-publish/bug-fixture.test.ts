import { execFile } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildBook, PART_OF_BOOK, planBook, wholeBook } from "@/lib/workbook-v2/build/build-book";
import { ENGINE_VERSION } from "@/lib/workbook-v2/contract";
import { sha256 } from "@/lib/workbook-v2/hash";
import { openRenderer } from "@/lib/workbook-v2/render/typst";
import type { Renderer } from "@/lib/workbook-v2/renderer";
import { fakeRenderer } from "@/lib/workbook-v2/testing/fake-renderer";
import { goldenInput, SYNTHETIC_LEVELS } from "@/lib/workbook-v2/testing/golden-books";
import { skipTypstTests, testAssets } from "@/lib/workbook-v2/testing/typst";
import { BUG_FIXTURES_DIR, createBugFixture, readBugFixture, runBugFixture, syntheticProblems, type BugFixtureRequest } from "./bug-fixture";
import { FULL_BOOK_SNAPSHOT } from "./full-book";
import { fontHashes, rendererVersion } from "./contract-writer";
import { SMALL_PLAN } from "./publish.fixtures";
import type { ReplayExpected } from "./replay";

let folder = "";
beforeAll(() => { folder = mkdtempSync(join(tmpdir(), "workbook-v2-bug-fixture-")); });
afterAll(() => rmSync(folder, { recursive: true, force: true }));

/** A git repository (a ".git" folder, or the ".git" file of a worktree) and a folder outside every repository. */
function places(kind: "folder" | "file" = "folder") {
  const root = mkdtempSync(join(folder, "place-"));
  const repo = join(root, "repo");
  mkdirSync(join(repo, "fixtures"), { recursive: true });
  if (kind === "folder") mkdirSync(join(repo, ".git"));
  else writeFileSync(join(repo, ".git"), "gitdir: /elsewhere/.git/worktrees/repo\n");
  const outside = join(root, "outside");
  mkdirSync(outside);
  return { repo, outside, fixtures: join(repo, "fixtures") };
}
const allFiles = (dir: string): string[] => (existsSync(dir) ? readdirSync(dir, { recursive: true, encoding: "utf8" }).sort() : []);

/** An invented book: the weak golden child, with its invented snapshot, ids and history. */
const invented = () => structuredClone(goldenInput(SYNTHETIC_LEVELS[0], "weak")) as { snapshot: { id: string }; book: { bookId: string; childId: string; history: { books: { bookId: string }[] } } };
/** The same book as a real family's would be: a UUID child id. */
const realLooking = () => {
  const input = invented();
  input.book.childId = "4b1f2c3d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
  return input;
};
const request = (outDir: string, change: Partial<BugFixtureRequest> = {}): BugFixtureRequest => ({
  name: "missing-level-name", failure: "The footer does not print the level name.", renderer: "fake",
  input: invented(), expect: { kind: "page-text", page: 1, text: "Level Nine", present: true }, outDir, ...change,
});
async function expectedOf(input: ReturnType<typeof invented>): Promise<ReplayExpected> {
  const renderer = fakeRenderer();
  const built = await buildBook(input, renderer, PART_OF_BOOK);
  if (built.status !== "built") throw new Error(built.problems.join("\n"));
  return {
    inputHash: built.record.inputHash, engineVersion: ENGINE_VERSION, rendererVersion: rendererVersion(renderer.identity), fontHashes: fontHashes(renderer.identity),
    pdfSha256: sha256(built.pdf), pageSha256s: built.pages.map((p) => sha256(p.image)),
  };
}

// G7: one command makes a failing fixture of a synthetic bug, and never writes a real family's book into a git repository.
describe("a bug fixture", () => {
  it("is written for an invented book, as one file that reproduces the failure", async () => {
    const { fixtures } = places();
    const { file, actual } = await createBugFixture(request(fixtures), fakeRenderer());
    expect(file).toBe(join(fixtures, "missing-level-name.json"));
    expect(actual).toBe("page 1 does not print \"Level Nine\"");
    const fixture = readBugFixture(JSON.parse(readFileSync(file, "utf8")));
    if (typeof fixture === "string") throw new Error(fixture);
    expect(fixture).toMatchObject({ format: 1, name: "missing-level-name", failure: "The footer does not print the level name.", input: { format: 1 } });
    expect(await runBugFixture(fixture, fakeRenderer())).toEqual({ ok: false, actual });
    // Once the page prints what the fixture expects, the fixture passes.
    expect(await runBugFixture({ ...fixture, expect: { kind: "page-text", page: 1, text: "Level 2", present: true } }, fakeRenderer())).toMatchObject({ ok: true });
  });

  it.each([
    ["a book that must be refused", { expect: { kind: "refused", problem: "too many questions" } }, "the book builds, and it must be refused"],
    ["a text that must not print", { expect: { kind: "page-text", page: 1, text: "Level 2", present: false } }, "page 1 prints \"Level 2\""],
    ["a page the book does not have", { expect: { kind: "page-text", page: 99, text: "x", present: true } }, "the book has 4 pages, and no page 99"],
  ] as [string, Partial<BugFixtureRequest>, string][])("reproduces %s", async (_case, change, actual) => {
    const { fixtures } = places();
    expect(await createBugFixture(request(fixtures, change), fakeRenderer())).toMatchObject({ actual });
  });

  it("reproduces a replay bundle that does not replay, and names its first difference", async () => {
    const { fixtures } = places();
    const input = invented();
    const expected = { ...(await expectedOf(input)), pdfSha256: "0".repeat(64) };
    const made = await createBugFixture(request(fixtures, { name: "replay-pdf", expect: { kind: "replays" }, expected, input: { format: 1, ...input } }), fakeRenderer());
    expect(made.actual).toMatch(/^pdf: the PDF differs/);
    const good = await expectedOf(input);
    await expect(createBugFixture(request(fixtures, { name: "replay-good", expect: { kind: "replays" }, expected: good }), fakeRenderer())).rejects.toThrow(/passes today/);
  });

  it("keeps the checks of a whole book, so that a fixture reproduces a failure of a whole book only", async () => {
    const { fixtures } = places();
    // The weak child's Book 2 with its new sheet before its repeat: a whole book is refused, a part of a book builds.
    const input = invented() as ReturnType<typeof invented> & { book: { sheets: { sheetId: string; attempt: number }[] } };
    const [a, b] = input.book.sheets;
    [input.book.sheets[0], input.book.sheets[1]] = [{ ...a, sheetId: b.sheetId, attempt: b.attempt }, { ...b, sheetId: a.sheetId, attempt: a.attempt }];
    const made = await createBugFixture(request(fixtures, { name: "new-before-repeat", expect: { kind: "builds" }, input: { ...input, checks: wholeBook(4) } }), fakeRenderer());
    expect(made.actual).toMatch(/^the book does not build: Level check, sheet ".+", page \d+, slot "page": attempt 2 of this sheet comes after a new sheet, and repeats come first\./);
    const fixture = readBugFixture(JSON.parse(readFileSync(made.file, "utf8")));
    if (typeof fixture === "string") throw new Error(fixture);
    expect(fixture.input.checks).toEqual(wholeBook(4));
    expect(await runBugFixture(fixture, fakeRenderer())).toMatchObject({ ok: false });
    // A fixture of a file written before it kept checks is a part of a book, as before.
    const older = { ...fixture.input };
    Reflect.deleteProperty(older, "checks");
    expect(await runBugFixture({ ...fixture, input: older }, fakeRenderer())).toEqual({ ok: true, actual: "the book builds" });
  });

  it("extracts word-problem flow text for both page-text and no-page-text expectations", async () => {
    const storySheet = SMALL_PLAN.find((s) => s.sheetId === "story-problems") ?? SMALL_PLAN[0];
    const storyInput = {
      snapshot: FULL_BOOK_SNAPSHOT,
      book: {
        bookId: "fixture-story-book",
        childId: "fixture-story-child",
        region: "US",
        sheets: [{
          sheetId: storySheet.sheetId,
          attempt: 1,
          startsDay: true,
          qr: { front: "https://unicalearning.com/tutor/p/fixture-story-1", back: "https://unicalearning.com/tutor/p/fixture-story-2" },
        }],
      },
    };
    const baseFixture = {
      format: 1 as const,
      name: "story-flow-text",
      failure: "Word problem text must appear on page 1.",
      renderer: "fake" as const,
      input: { format: 1 as const, ...storyInput },
    };
    const present = await runBugFixture({ ...baseFixture, expect: { kind: "page-text", page: 1, text: "There", present: true } }, fakeRenderer());
    expect(present.ok, present.actual).toBe(true);
    const absent = await runBugFixture({ ...baseFixture, expect: { kind: "page-text", page: 1, text: "There", present: false } }, fakeRenderer());
    expect(absent.ok).toBe(false);
    expect(absent.actual).toBe("page 1 prints \"There\"");
  });

  it("writes nothing when the fixture passes today, when the file exists, or for a bad name or input", async () => {
    const { fixtures } = places();
    await expect(createBugFixture(request(fixtures, { expect: { kind: "builds" } }), fakeRenderer())).rejects.toThrow(/passes today \(the book builds\), so it does not reproduce the bug\. Nothing was written\./);
    expect(allFiles(fixtures)).toEqual([]);
    await createBugFixture(request(fixtures), fakeRenderer());
    const before = readFileSync(join(fixtures, "missing-level-name.json"), "utf8");
    await expect(createBugFixture(request(fixtures, { failure: "another" }), fakeRenderer())).rejects.toThrow(/exists: choose another name/);
    expect(readFileSync(join(fixtures, "missing-level-name.json"), "utf8")).toBe(before);
    await expect(createBugFixture(request(fixtures, { name: "Bad Name" }), fakeRenderer())).rejects.toThrow(/fixture name/);
    await expect(createBugFixture(request(fixtures, { name: "no-book", input: { snapshot: {} } }), fakeRenderer())).rejects.toThrow(/not a book input/);
    expect(allFiles(fixtures)).toEqual(["missing-level-name.json"]);
  });
});

describe("the privacy guard of a bug fixture", () => {
  const withHistoryUuid = () => { const i = invented(); i.book.history.books[0].bookId = "4b1f2c3d-5e6f-4a7b-8c9d-0e1f2a3b4c5d"; return i; };
  const realSnapshot = () => { const i = invented(); i.snapshot.id = "level-3-v4"; return i; };
  const unknownInventedSnapshot = () => { const i = invented(); i.snapshot.id = "invented-scrubbed-real-v1"; return i; };
  const tamperedSyntheticSnapshot = () => { const i = invented(); (i.snapshot as Record<string, unknown>).topics = []; return i; };
  const withEmail = () => { const i = invented(); (i.book as Record<string, unknown>).note = "parent@example.com"; return i; };
  const withProductionQr = () => {
    const i = invented() as ReturnType<typeof invented> & { book: { sheets: { qr: { front: string; back: string } }[] } };
    i.book.sheets[0].qr.front = "https://unicalearning.com/tutor/p/aB3dE6fG9hI2jK5lM8nO1pQ";
    return i;
  };

  it.each([
    ["a UUID child id", realLooking, /the childId "4b1f2c3d-.*" is not an invented id/],
    ["a snapshot that is not invented", realSnapshot, /the snapshot "level-3-v4" is not a known invented snapshot/],
    ["an unknown invented snapshot id", unknownInventedSnapshot, /is not a known invented snapshot/],
    ["a tampered synthetic snapshot with an allowed id", tamperedSyntheticSnapshot, /content does not match the committed synthetic snapshot/],
    ["a UUID in the history", withHistoryUuid, /the history names the book "4b1f2c3d-.*", which is not an invented id/],
    ["a production-shaped QR token", withProductionQr, /is not an invented page link/],
    ["an email address", withEmail, /holds an email address/],
  ])("refuses %s inside a git repository and writes nothing", async (_case, input, why) => {
    const { repo, fixtures } = places();
    await expect(createBugFixture(request(fixtures, { input: input() }), fakeRenderer())).rejects.toThrow(why);
    await expect(createBugFixture(request(fixtures, { input: input() }), fakeRenderer())).rejects.toThrow(/^Refused: .* is inside the git repository/);
    expect(allFiles(repo)).toEqual([".git", "fixtures"]);
  });

  it("refuses PII placed in failure or expect fields when writing inside a git repository", async () => {
    const { repo, fixtures } = places();
    await expect(createBugFixture(request(fixtures, { failure: "Bug reported by mom@example.com" }), fakeRenderer())).rejects.toThrow(/holds an email address/);
    await expect(createBugFixture(request(fixtures, { expect: { kind: "page-text", page: 1, text: "https://unicalearning.com/tutor/p/prodTok12345", present: true } }), fakeRenderer())).rejects.toThrow(/non-synthetic page link token/);
    expect(allFiles(repo)).toEqual([".git", "fixtures"]);
  });

  it("refuses through a symbolic link into a repository, and in a worktree, and writes nothing", async () => {
    const { repo, outside, fixtures } = places();
    symlinkSync(fixtures, join(outside, "link"));
    await expect(createBugFixture(request(join(outside, "link", "deeper"), { input: realLooking() }), fakeRenderer())).rejects.toThrow(/Refused/);
    const worktree = places("file");
    await expect(createBugFixture(request(join(worktree.fixtures, "new"), { input: realLooking() }), fakeRenderer())).rejects.toThrow(/Refused/);
    expect([allFiles(repo), allFiles(worktree.repo), allFiles(outside)]).toEqual([[".git", "fixtures"], [".git", "fixtures"], ["link"]]);
  });

  it("writes a real family's book only to a folder outside every git repository", async () => {
    const { outside } = places();
    const { file } = await createBugFixture(request(join(outside, "private"), { input: realLooking() }), fakeRenderer());
    expect(existsSync(file)).toBe(true);
  });

  it("finds an invented book invented and a production book not", async () => {
    expect(syntheticProblems(invented())).toEqual([]);
    expect(syntheticProblems(realLooking()).length).toBeGreaterThan(0);
    expect(syntheticProblems(invented(), { inputHash: "x", engineVersion: "e", rendererVersion: "r", fontHashes: {}, pdfSha256: "p", pageSha256s: ["4b1f2c3d-5e6f-4a7b-8c9d-0e1f2a3b4c5d"] })).toEqual([
      "the fixture holds a UUID, which may be the id of a real family, child or book",
    ]);
  });
});

/** The fixture command, bundled one time for this file. */
let command = "";
const run = (args: string[]): Promise<{ code: number; output: string }> => new Promise((done) => {
  execFile(process.execPath, [command, ...args], (error, stdout, stderr) => done({ code: typeof error?.code === "number" ? error.code : error ? 1 : 0, output: stdout + stderr }));
});

describe("the fixture command", () => {
  beforeAll(async () => {
    const runner = JSON.stringify(pathToFileURL(resolve("scripts/run-script.mjs")).href);
    const bundle = join(folder, "fixture-bundle.mjs");
    const make = join(folder, "make-fixture.mjs");
    writeFileSync(make, `import { bundleScript } from ${runner}; await bundleScript("scripts/workbook-v2-fixture.ts", ${JSON.stringify(bundle)});`);
    command = join(folder, "fixture.mjs");
    writeFileSync(command, `import { runBundle } from ${runner}; await runBundle(${JSON.stringify(bundle)});`);
    expect(await new Promise<number>((done) => execFile(process.execPath, [make], (error) => done(error ? 1 : 0)))).toBe(0);
  });

  it("writes a failing fixture of an invented book in one command, and refuses a real family's book in a repository with nothing written", async () => {
    const { repo, outside, fixtures } = places();
    const [good, real] = [join(outside, "invented.json"), join(outside, "real.json")];
    writeFileSync(good, JSON.stringify(invented()));
    writeFileSync(real, JSON.stringify(realLooking()));
    const made = await run(["--name", "no-level-nine", "--failure", "The footer misses the level.", "--expect", "page-text=1:Level Nine", "--input", good, "--out", fixtures]);
    expect(made.output).toMatch(/Wrote .*no-level-nine\.json\. It fails today: page 1 does not print "Level Nine"\./);
    expect(made.output).toContain("WORKBOOK_V2_FIXTURE=");
    expect(made.code).toBe(0);
    const refused = await run(["--name", "real-book", "--failure", "x", "--expect", "page-text=1:Level Nine", "--input", real, "--out", fixtures]);
    expect(refused.code).toBe(1);
    expect(refused.output).toMatch(/Refused: .* is inside the git repository/);
    expect(allFiles(repo)).toEqual([".git", "fixtures", join("fixtures", "no-level-nine.json")]);
  });
});

async function openFixtureRenderer(name: "fake" | "typst", cache: { typst: Renderer | null }): Promise<Renderer | null> {
  if (name === "fake") return fakeRenderer();
  const requireTypst = process.env.WORKBOOK_V2_REQUIRE_TYPST === "1";
  const hasTypst = existsSync(testAssets().program);
  if (!hasTypst) {
    if (requireTypst) throw new Error("Pinned Typst is required to run Typst bug fixtures (run npm run typst:install).");
    if (!skipTypstTests()) return null;
    return null;
  }
  return (cache.typst ??= await openRenderer(testAssets()));
}

// The committed fixtures (including nested subdirectories): each one fails until its bug is fixed, and its raw JSON is invented.
const committed = existsSync(join(process.cwd(), BUG_FIXTURES_DIR))
  ? readdirSync(join(process.cwd(), BUG_FIXTURES_DIR), { recursive: true, encoding: "utf8" }).filter((f) => f.endsWith(".json")).sort()
  : [];
describe.skipIf(committed.length === 0)("the committed bug fixtures", () => {
  const cache: { typst: Renderer | null } = { typst: null };
  it.each(committed)("%s passes and is invented", async (file) => {
    const raw = JSON.parse(readFileSync(join(process.cwd(), BUG_FIXTURES_DIR, file), "utf8")) as unknown;
    expect(syntheticProblems(raw)).toEqual([]);
    const fixture = readBugFixture(raw);
    if (typeof fixture === "string") throw new Error(`${file}: ${fixture}`);
    expect(syntheticProblems(fixture)).toEqual([]);
    const renderer = await openFixtureRenderer(fixture.renderer, cache);
    if (!renderer) return;
    const result = await runBugFixture(fixture, renderer);
    expect(result.ok, `${fixture.name}: ${fixture.failure} Today: ${result.actual}`).toBe(true);
  });
});

// Explicit private fixture outside the default folder, run via WORKBOOK_V2_FIXTURE=<path>.
const privateFixture = process.env.WORKBOOK_V2_FIXTURE;
describe.skipIf(!privateFixture)("the selected private bug fixture", () => {
  const cache: { typst: Renderer | null } = { typst: null };
  it("passes its expectation", async () => {
    const fixture = readBugFixture(JSON.parse(readFileSync(privateFixture!, "utf8")));
    if (typeof fixture === "string") throw new Error(`${privateFixture}: ${fixture}`);
    const renderer = await openFixtureRenderer(fixture.renderer, cache);
    if (!renderer) throw new Error("Pinned Typst is required to run this Typst fixture (run npm run typst:install).");
    const result = await runBugFixture(fixture, renderer);
    expect(result.ok, `${fixture.name}: ${fixture.failure} Today: ${result.actual}`).toBe(true);
  });
});

describe("a bug fixture of a file", () => {
  it("is refused when it is not complete or has invalid expected replay data", () => {
    expect(readBugFixture({})).toMatch(/not of format 1/);
    expect(readBugFixture({ format: 1, name: "abc", failure: "x", renderer: "other" })).toMatch(/fake or typst/);
    const base = { format: 1, name: "abc", failure: "x", renderer: "fake", input: { format: 1, ...invented() } };
    expect(readBugFixture({ ...base, expect: { kind: "replays" } })).toMatch(/needs the expected replay/);
    expect(readBugFixture({ ...base, expect: { kind: "replays" }, expected: { inputHash: "x" } })).toMatch(/engineVersion/);
    expect(readBugFixture({
      ...base,
      expect: { kind: "replays" },
      expected: { inputHash: "x", engineVersion: "e", rendererVersion: "r", fontHashes: {}, pdfSha256: "p", pageSha256s: ["a", "b"], pageModelSha256s: [] },
    })).toMatch(/pageModelSha256s has 0 entries, and pageSha256s has 2/);
    expect(readBugFixture({ ...base, expect: { kind: "page-text", page: 0, text: "x", present: true } })).toMatch(/expectation must be/);
    expect(typeof readBugFixture({ ...base, expect: { kind: "builds" } })).toBe("object");
    expect(planBook({ snapshot: base.input.snapshot, book: base.input.book }).ok).toBe(true);
  });
});
