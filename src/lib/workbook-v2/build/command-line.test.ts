import { execFile } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { answerLine, type Answer, type Step } from "../contract";
import rawSnapshot from "../fixtures/snapshot.json";
import { SHAPES } from "../shapes";
import { fixture, skipTypstTests } from "../testing/typst";

let folder = "";
const run = (args: string[], env: Record<string, string> = {}): Promise<{ code: number; output: string }> => new Promise((resolve) => {
  execFile(process.execPath, args, { env: { ...process.env, ...env } }, (error, stdout, stderr) =>
    resolve({ code: typeof error?.code === "number" ? error.code : error ? 1 : 0, output: stdout + stderr }));
});

/** A snapshot of one question on each side, for the tests that look at the files and not at the pages. */
let short = "";
function writeShort(): void {
  const snapshot = structuredClone(rawSnapshot);
  for (const side of [snapshot.sheets[0].front, snapshot.sheets[0].back]) side.rows = [{ ...side.rows[0], items: 1 }];
  short = join(folder, "short.json");
  writeFileSync(short, JSON.stringify(snapshot));
}

/** The command as npm runs it, which makes its bundle each time. */
const WHOLE = "scripts/workbook-v2.mjs";
/** The same command with a bundle that is made one time for this file: what npm runs, without its first step. */
let bundled = "";
beforeAll(async () => {
  folder = mkdtempSync(join(tmpdir(), "workbook-v2-cli-"));
  writeShort();
  const [bundle, make] = [join(folder, "bundle.mjs"), join(folder, "make.mjs")];
  bundled = join(folder, "command.mjs");
  const runner = JSON.stringify(pathToFileURL(resolve("scripts/run-script.mjs")).href);
  writeFileSync(make, `import { bundleScript } from ${runner}; await bundleScript("scripts/workbook-v2.ts", ${JSON.stringify(bundle)});`);
  writeFileSync(bundled, `import { runBundle } from ${runner}; await runBundle(${JSON.stringify(bundle)});`);
  expect(await run([make])).toEqual({ code: 0, output: "" });
});
afterAll(() => rmSync(folder, { recursive: true, force: true }));

/** Runs the command in a process of its own. `hook` is code that runs there first. */
function command(args: string[], env: Record<string, string> = {}, hook = "", script = bundled) {
  const first = hook ? ["--import", `data:text/javascript,${encodeURIComponent(hook)}`] : [];
  return run([...first, script, ...args], env);
}
const build = (out: string, env?: Record<string, string>, { snapshot = fixture("snapshot.json"), book = fixture("book.json"), hook = "", script = bundled } = {}) =>
  command(["--snapshot", snapshot, "--book", book, "--out", join(folder, out)], env, hook, script);
/** Changes one function of node:fs/promises in the process of the command. */
const hookOn = (name: string, body: string) =>
  `import fs from "node:fs/promises"; import { existsSync, writeFileSync } from "node:fs"; import { syncBuiltinESMExports } from "node:module"; const real = fs.${name}; fs.${name} = async (...args) => { ${body}; return real(...args); }; syncBuiltinESMExports();`;
const files = (out: string) => readdirSync(join(folder, out)).sort();
const bytes = (out: string, file: string) => readFileSync(join(folder, out, file));
const json = (out: string, file: string): unknown => JSON.parse(bytes(out, file).toString());

describe.concurrent("the command, before it builds", () => {
  it.each<[string, string[], RegExp]>([
    ["no argument", [], /Usage: npm run workbook:v2 -- --snapshot FILE --book FILE --out FOLDER/],
    ["an unknown argument", ["--snapshots", "a", "--book", "b", "--out", "c"], /Usage/],
    ["an argument twice", ["--out", "a", "--out", "b", "--book", "c"], /Usage/],
    ["a file that is not there", ["--snapshot", "gone.json", "--book", fixture("book.json"), "--out", "x"], /gone\.json/],
  ])("stops on %s", async (_name, args, message) => {
    const { code, output } = await command(args);
    expect(code).toBe(1);
    expect(output).toMatch(message);
  });
});

describe.skipIf(skipTypstTests()).concurrent("the command, with the real Typst", () => {
  /** The example book, made by the whole command in an empty folder and, with other settings, in a folder that is not there yet. */
  let example: Promise<{ code: number; output: string }[]> | undefined;
  const makeExample = () => example ??= (() => {
    const other = join(folder, "other-temporary-folder");
    mkdirSync(other);
    mkdirSync(join(folder, "empty", "book"), { recursive: true });
    const settings = { TMPDIR: other, TZ: "Asia/Tokyo", LANG: "de_DE.UTF-8", TYPST_FONT_PATHS: "/System/Library/Fonts", TYPST_ROOT: "/nowhere", SOURCE_DATE_EPOCH: "1234567890" };
    return Promise.all([build("empty/book", {}, { script: WHOLE }), build("new/deep/book", settings)]);
  })();
  const ALL_FILES = ["answers.json", "book.pdf", "page-1.png", "page-2.png", "pages.json", "positions.json", "record.json"];
  const [ONE, TWO] = ["empty/book", "new/deep/book"];

  it("writes the book, and a second fresh process on a computer with other settings writes the same bytes", async () => {
    const hash = expect.stringMatching(/^[0-9a-f]{64}$/) as unknown;
    const [one, two] = await makeExample();
    expect(one).toMatchObject({ code: 0, output: expect.stringMatching(/2 pages, 16 questions/) });
    expect(two.code).toBe(0);
    expect(files(ONE)).toEqual(ALL_FILES);
    expect(files(TWO)).toEqual(ALL_FILES);
    for (const file of ALL_FILES) expect(Buffer.compare(bytes(ONE, file), bytes(TWO, file)), file).toBe(0);
    expect(bytes(ONE, "book.pdf").subarray(0, 5).toString()).toBe("%PDF-");
    expect(bytes(ONE, "page-2.png").subarray(1, 4).toString()).toBe("PNG");
    expect(bytes(ONE, "page-2.png").readUInt32BE(16)).toBe(1275);
    const answers = json(ONE, "answers.json") as { shape: string; shapeVersion?: unknown; answer: Answer; steps: Step[] }[];
    expect(answers).toHaveLength(16);
    expect(answers.every((item) => typeof item.shapeVersion === "number" && item.shapeVersion === SHAPES.get(item.shape)?.version)).toBe(true);
    for (const { answer, steps } of answers) expect(steps.at(-1)).toEqual({ text: answerLine(answer), marks: [] });
    expect(json(ONE, "positions.json")).toEqual(expect.arrayContaining([{ id: "column-multiplication-1/1/front/answer-1", sheet: 1, rect: { x: 134, y: 178, w: 72, h: 42 } }]));
    expect(json(ONE, "record.json")).toMatchObject({ bookId: "example-book", typst: "0.15.1", program: hash, template: hash, fonts: { "Geist-Regular.ttf": hash, "Geist-SemiBold.ttf": hash } });
  });

  it("says which rows of a good book repeat a question", async () => {
    const file = join(folder, "repeats.json");
    const snapshot = structuredClone(rawSnapshot);
    const row = (id: string) => ({ id, shape: "fact.mul", items: 1, limits: { tables: [3], second: { min: 2, max: 2 }, result: { min: 0, max: 100 }, order: "up" } });
    const [sheet] = snapshot.sheets;
    writeFileSync(file, JSON.stringify({ ...snapshot, sheets: [{ ...sheet, front: { ...sheet.front, template: "facts-2x10", rows: [row("one")] }, back: { ...sheet.back, template: "facts-2x10", rows: [row("two")] } }] }));
    const { code, output } = await build("repeats", {}, { snapshot: file });
    expect(code).toBe(0);
    expect(output).toContain('Notice: Sheet "column-multiplication-1", back side, row "two": 1 question is on the front side too.');
    expect((await makeExample())[0].output).not.toContain("Notice");
  });

  it("writes into an empty folder and into a folder that is not there yet, and leaves nothing beside it", async () => {
    await makeExample();
    expect([readdirSync(join(folder, "empty")), readdirSync(join(folder, "new/deep"))]).toEqual([["book"], ["book"]]);
    expect(statSync(join(folder, TWO)).mode & 0o777).toBe(statSync(join(folder, "new")).mode & 0o777);
  });

  it("writes nothing for a book that fails, and lists the problems", async () => {
    const bad = join(folder, "bad.json");
    writeFileSync(bad, readFileSync(fixture("snapshot.json"), "utf8").replace('"mul.column"', '"mul.colum"'));
    const { code, output } = await build("bad", {}, { snapshot: bad });
    expect(code).toBe(1);
    expect(output).toContain('Sheet "column-multiplication-1", front side, row "no-carry": there is no shape "mul.colum".');
    expect(() => files("bad")).toThrow();
  });

  it("does not write into a folder that holds something", async () => {
    mkdirSync(join(folder, "full"));
    writeFileSync(join(folder, "full", "page-3.png"), "an older book");
    const { code, output } = await build("full");
    expect(code).toBe(1);
    expect(output).toMatch(/is not empty/);
    expect(files("full")).toEqual(["page-3.png"]);
  });

  it.each<[string, (out: string) => void, RegExp]>([
    ["a file", (out) => writeFileSync(out, "a file"), /is not a folder/],
    ["a link to nothing", (out) => symlinkSync(join(folder, "nothing"), out), /is not a folder/],
  ])("does not write where there is %s", async (name, make, message) => {
    const place = join(folder, name.replaceAll(" ", "-"));
    mkdirSync(place);
    make(join(place, "book"));
    const { code, output } = await build(join(name.replaceAll(" ", "-"), "book"), {}, { snapshot: short });
    expect(code).toBe(1);
    expect(output).toMatch(message);
    expect(readdirSync(place)).toEqual(["book"]);
  });

  /** Independent single-process reference books for the race test (one for each book id). */
  let otherBookFile = "";
  let shortRefs: Promise<{ code: number; output: string }[]> | undefined;
  const makeShortRefs = () => shortRefs ??= (() => {
    otherBookFile = join(folder, "other-book.json");
    writeFileSync(otherBookFile, readFileSync(fixture("book.json"), "utf8").replace("example-book", "other-book").replace("example-child", "other-child"));
    return Promise.all([
      build("ref-a/book", {}, { snapshot: short }),
      build("ref-b/book", {}, { snapshot: short, book: otherBookFile }),
    ]);
  })();

  it.each(["new", "empty"])("two processes that publish into one %s folder at the same time: one book stays whole, and the other process stops", async (kind) => {
    const refs = await makeShortRefs();
    expect(refs.map((r) => r.code)).toEqual([0, 0]);
    const place = join(folder, `shared-${kind}`);
    mkdirSync(place);
    if (kind === "empty") mkdirSync(join(place, "book"));
    // Each process says that it is ready to publish and waits for the other one.
    const meet = (me: string, peer: string) => hookOn("rename", `if (String(args[1]).endsWith("/book")) { writeFileSync(${JSON.stringify(join(folder, `${kind}-${me}`))}, ""); for (let i = 0; i < 1000 && !existsSync(${JSON.stringify(join(folder, `${kind}-${peer}`))}); i++) await new Promise((r) => setTimeout(r, 10)); }`);
    const both = await Promise.all([
      build(`shared-${kind}/book`, {}, { snapshot: short, hook: meet("a", "b") }),
      build(`shared-${kind}/book`, {}, { snapshot: short, hook: meet("b", "a"), book: otherBookFile }),
    ]);
    expect(both.map((b) => b.code).sort()).toEqual([0, 1]);
    const [winner, loser] = both[0].code === 0 ? [0, 1] : [1, 0];
    expect(both[loser].output).toMatch(/is not empty/);
    expect(existsSync(join(folder, `${kind}-a`)) && existsSync(join(folder, `${kind}-b`))).toBe(true);
    expect(readdirSync(place)).toEqual(["book"]);
    expect(files(`shared-${kind}/book`)).toEqual(ALL_FILES);
    expect(json(`shared-${kind}/book`, "record.json")).toMatchObject({ bookId: ["example-book", "other-book"][winner] });
    const reference = winner === 0 ? "ref-a/book" : "ref-b/book";
    for (const file of ALL_FILES) expect(Buffer.compare(bytes(reference, file), bytes(`shared-${kind}/book`, file)), file).toBe(0);
  });

  it.each<[string, string, string]>([
    ["a page that cannot be written", "writeFile", 'if (String(args[0]).endsWith("/page-2.png")) throw Object.assign(new Error("the disk is full"), { code: "ENOSPC" })'],
    ["a last file that cannot be written", "writeFile", 'if (String(args[0]).endsWith("/record.json")) throw Object.assign(new Error("the disk is full"), { code: "ENOSPC" })'],
    ["a book that cannot be published", "rename", 'if (String(args[1]).endsWith("/book")) throw new Error("the disk is full")'],
  ])("%s leaves no part of a book and no other folder", async (_name, name, body) => {
    const place = mkdtempSync(join(folder, "error-"));
    const { code, output } = await build(join(basename(place), "book"), {}, { snapshot: short, hook: hookOn(name, body) });
    expect(code).toBe(1);
    expect(output).toContain("the disk is full");
    expect(readdirSync(place)).toEqual([]);
  });
});
