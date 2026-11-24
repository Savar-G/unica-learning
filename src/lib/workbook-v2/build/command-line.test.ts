import { execFile } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readImage } from "../testing/images";
import { fixture, skipTypstTests } from "../testing/typst";

let folder = "";
beforeAll(() => { folder = mkdtempSync(join(tmpdir(), "workbook-v2-cli-")); });
afterAll(() => rmSync(folder, { recursive: true, force: true }));

/** Runs the command in a process of its own. */
function command(args: string[], env: Record<string, string> = {}): Promise<{ code: number; output: string }> {
  return new Promise((resolve) => {
    execFile(process.execPath, ["scripts/workbook-v2.mjs", ...args], { env: { ...process.env, ...env } }, (error, stdout, stderr) =>
      resolve({ code: typeof error?.code === "number" ? error.code : error ? 1 : 0, output: stdout + stderr }));
  });
}
const build = (out: string, env?: Record<string, string>, snapshot = fixture("snapshot.json")) =>
  command(["--snapshot", snapshot, "--book", fixture("book.json"), "--out", join(folder, out)], env);
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
    expect(json("one", "answers.json")).toHaveLength(16);
    expect(json("one", "positions.json")).toEqual(expect.arrayContaining([{ id: "column-multiplication-1/1/front/answer-1", sheet: 1, rect: { x: 134, y: 178, w: 72, h: 42 } }]));
    expect(json("one", "record.json")).toMatchObject({ bookId: "example-book", typst: "0.15.1" });
  });

  it("writes nothing for a book that fails, and lists the problems", async () => {
    const bad = join(folder, "bad.json");
    writeFileSync(bad, readFileSync(fixture("snapshot.json"), "utf8").replace('"mul.column"', '"mul.colum"'));
    const { code, output } = await build("bad", {}, bad);
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
});
