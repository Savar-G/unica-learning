import { execFile } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readImage } from "../testing/images";
import { fixture, skipTypstTests } from "../testing/typst";

let folder = "";
beforeAll(() => { folder = mkdtempSync(join(tmpdir(), "workbook-v2-cli-")); });
afterAll(() => rmSync(folder, { recursive: true, force: true }));

/** Runs the command in a process of its own. `hook` is code that runs there first. */
function command(args: string[], env: Record<string, string> = {}, hook = ""): Promise<{ code: number; output: string }> {
  const first = hook ? ["--import", `data:text/javascript,${encodeURIComponent(hook)}`] : [];
  return new Promise((resolve) => {
    execFile(process.execPath, [...first, "scripts/workbook-v2.mjs", ...args], { env: { ...process.env, ...env } }, (error, stdout, stderr) =>
      resolve({ code: typeof error?.code === "number" ? error.code : error ? 1 : 0, output: stdout + stderr }));
  });
}
const build = (out: string, env?: Record<string, string>, { snapshot = fixture("snapshot.json"), book = fixture("book.json"), hook = "" } = {}) =>
  command(["--snapshot", snapshot, "--book", book, "--out", join(folder, out)], env, hook);
/** Changes one function of node:fs/promises in the process of the command. */
const hookOn = (name: string, body: string) =>
  `import fs from "node:fs/promises"; import { existsSync, writeFileSync } from "node:fs"; import { syncBuiltinESMExports } from "node:module"; const real = fs.${name}; fs.${name} = async (...args) => { ${body}; return real(...args); }; syncBuiltinESMExports();`;
const files = (out: string) => readdirSync(join(folder, out)).sort();
const bytes = (out: string, file: string) => readFileSync(join(folder, out, file));
const json = (out: string, file: string): unknown => JSON.parse(bytes(out, file).toString());

describe("the command, before it builds", () => {
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

describe.skipIf(skipTypstTests())("the command, with the real Typst", () => {
  it("writes the book, and a second fresh process on a computer with other settings writes the same bytes", async () => {
    const hash = expect.stringMatching(/^[0-9a-f]{64}$/) as unknown;
    const other = join(folder, "other-temporary-folder");
    mkdirSync(other);
    const [one, two] = await Promise.all([build("one"), build("two", { TMPDIR: other, TZ: "Asia/Tokyo", LANG: "de_DE.UTF-8", TYPST_FONT_PATHS: "/System/Library/Fonts", TYPST_ROOT: "/nowhere", SOURCE_DATE_EPOCH: "1234567890" })]);
    expect(one).toMatchObject({ code: 0, output: expect.stringMatching(/2 pages, 16 questions/) });
    expect(two.code).toBe(0);
    expect(files("one")).toEqual(["answers.json", "book.pdf", "page-1.png", "page-2.png", "pages.json", "positions.json", "record.json"]);
    expect(files("two")).toEqual(files("one"));
    for (const file of files("one")) expect(Buffer.compare(bytes("one", file), bytes("two", file)), file).toBe(0);
    expect(bytes("one", "book.pdf").subarray(0, 5).toString()).toBe("%PDF-");
    expect((await readImage(bytes("one", "page-2.png"))).width).toBe(1275);
    const answers = json("one", "answers.json") as { shapeVersion?: unknown }[];
    expect(answers).toHaveLength(16);
    expect(answers.every((item) => item.shapeVersion === 1)).toBe(true);
    expect(json("one", "positions.json")).toEqual(expect.arrayContaining([{ id: "column-multiplication-1/1/front/answer-1", sheet: 1, rect: { x: 134, y: 178, w: 72, h: 42 } }]));
    expect(json("one", "record.json")).toMatchObject({ bookId: "example-book", typst: "0.15.1", program: hash, template: hash, fonts: { "Geist-Regular.ttf": hash, "Geist-SemiBold.ttf": hash } });
    expect(readdirSync(folder).filter((f) => f.startsWith("."))).toEqual([]);
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
    const { code, output } = await build(join(name.replaceAll(" ", "-"), "book"));
    expect(code).toBe(1);
    expect(output).toMatch(message);
    expect(readdirSync(place)).toEqual(["book"]);
  });

  it("writes into an empty folder and into a folder that is not there yet", async () => {
    mkdirSync(join(folder, "empty", "book"), { recursive: true });
    const [empty, deep] = await Promise.all([build("empty/book"), build("new/deep/book")]);
    expect([empty.code, deep.code]).toEqual([0, 0]);
    expect(files("empty/book")).toHaveLength(7);
    expect(files("new/deep/book")).toEqual(files("empty/book"));
    expect([readdirSync(join(folder, "empty")), readdirSync(join(folder, "new/deep"))]).toEqual([["book"], ["book"]]);
    expect(statSync(join(folder, "new/deep/book")).mode & 0o777).toBe(statSync(join(folder, "new")).mode & 0o777);
  });

  it.each(["new", "empty"])("two processes that publish into one %s folder at the same time: one book stays whole, and the other process stops", async (kind) => {
    const place = join(folder, `shared-${kind}`);
    mkdirSync(place);
    if (kind === "empty") mkdirSync(join(place, "book"));
    const otherBook = join(folder, `other-${kind}.json`);
    writeFileSync(otherBook, readFileSync(fixture("book.json"), "utf8").replace("example-book", "other-book").replace("example-child", "other-child"));
    // Each process says that it is ready to publish and waits for the other one.
    const meet = (me: string, peer: string) => hookOn("rename", `if (String(args[1]).endsWith("/book")) { writeFileSync(${JSON.stringify(join(folder, `${kind}-${me}`))}, ""); for (let i = 0; i < 1000 && !existsSync(${JSON.stringify(join(folder, `${kind}-${peer}`))}); i++) await new Promise((r) => setTimeout(r, 10)); }`);
    const both = await Promise.all([
      build(`shared-${kind}/book`, {}, { hook: meet("a", "b") }),
      build(`shared-${kind}/book`, {}, { hook: meet("b", "a"), book: otherBook }),
    ]);
    expect(both.map((b) => b.code).sort()).toEqual([0, 1]);
    const [winner, loser] = both[0].code === 0 ? [0, 1] : [1, 0];
    expect(both[loser].output).toMatch(/is not empty/);
    expect(existsSync(join(folder, `${kind}-a`)) && existsSync(join(folder, `${kind}-b`))).toBe(true);
    expect(readdirSync(place)).toEqual(["book"]);
    expect(files(`shared-${kind}/book`)).toEqual(["answers.json", "book.pdf", "page-1.png", "page-2.png", "pages.json", "positions.json", "record.json"]);
    expect(json(`shared-${kind}/book`, "record.json")).toMatchObject({ bookId: ["example-book", "other-book"][winner] });
    const child = await build(`alone-${kind}`, {}, { book: winner === 0 ? fixture("book.json") : otherBook });
    expect(child.code).toBe(0);
    for (const file of files(`alone-${kind}`)) expect(Buffer.compare(bytes(`alone-${kind}`, file), bytes(`shared-${kind}/book`, file)), file).toBe(0);
  });

  it.each<[string, string, string]>([
    ["a page that cannot be written", "writeFile", 'if (String(args[0]).endsWith("/page-2.png")) throw Object.assign(new Error("the disk is full"), { code: "ENOSPC" })'],
    ["a last file that cannot be written", "writeFile", 'if (String(args[0]).endsWith("/record.json")) throw Object.assign(new Error("the disk is full"), { code: "ENOSPC" })'],
    ["a book that cannot be published", "rename", 'if (String(args[1]).endsWith("/book")) throw new Error("the disk is full")'],
  ])("%s leaves no part of a book and no other folder", async (_name, name, body) => {
    const place = mkdtempSync(join(folder, "error-"));
    const { code, output } = await build(join(basename(place), "book"), {}, { hook: hookOn(name, body) });
    expect(code).toBe(1);
    expect(output).toContain("the disk is full");
    expect(readdirSync(place)).toEqual([]);
  });
});
