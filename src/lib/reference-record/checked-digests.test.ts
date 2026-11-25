import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CHECKED_DIGESTS_FILE,
  findCheckProblems,
  type PagePhoto,
  readCheckedDigests,
  writeCheckedDigests,
} from "./checked-digests";

const A = "a".repeat(64);
const B = "b".repeat(64);

describe("checked digests", () => {
  let rootDir: string;
  let finalDir: string;
  let filePath: string;

  beforeEach(() => {
    rootDir = mkdtempSync(join(tmpdir(), "ref-digests-"));
    finalDir = join(rootDir, "final");
    filePath = join(finalDir, CHECKED_DIGESTS_FILE);
    mkdirSync(finalDir);
  });
  afterEach(() => rmSync(rootDir, { recursive: true, force: true }));

  it("reads a missing file as an older folder, and gives back what it wrote", () => {
    expect(readCheckedDigests(finalDir)).toEqual({ pages: new Map(), checkedBefore: new Set() });

    const hex = fc.stringMatching(/^[0-9a-f]{64}$/);
    const ref = fc.stringMatching(/^[a-z]{1,6}:[A-Z]:([0-9]{1,3}[ab]|contents)$/);
    const digests = fc.record({
      pages: fc
        .array(fc.tuple(ref, fc.record({ record_sha256: hex, photo_sha256: hex })))
        .map((rows) => new Map(rows)),
      checkedBefore: fc.array(ref).map((refs) => new Set(refs)),
    });
    const repo = join(rootDir, "repo");
    mkdirSync(repo);
    fc.assert(
      fc.property(digests, (value) => {
        writeCheckedDigests(finalDir, value, repo);
        expect(readCheckedDigests(finalDir)).toEqual(value);
      }),
      { numRuns: 25 },
    );
  });

  it("stops on a damaged file and names it, and never reads it as a missing file", () => {
    const page = { source_ref: "sample:M:3a", record_sha256: A, photo_sha256: B };
    const file = (over: Record<string, unknown>) =>
      JSON.stringify({ version: 1, pages: [page], checked_before: [], ...over });
    const damaged: Array<[string, string | Buffer]> = [
      ["empty file", ""],
      ["cut JSON", file({}).slice(0, -5)],
      ["invalid UTF-8", Buffer.concat([Buffer.from('{"version":1,"x":"'), Buffer.of(0xff), Buffer.from('"}')])],
      ["null", "null"],
      ["list", "[]"],
      ["text", '"x"'],
      ["no version", JSON.stringify({ pages: [], checked_before: [] })],
      ["other version", file({ version: 2 })],
      ["no pages", JSON.stringify({ version: 1, checked_before: [] })],
      ["pages is an object", file({ pages: {} })],
      ["page is null", file({ pages: [null] })],
      ["page without source_ref", file({ pages: [{ ...page, source_ref: undefined }] })],
      ["page with a blank source_ref", file({ pages: [{ ...page, source_ref: " " }] })],
      ["two entries for a page", file({ pages: [page, page] })],
      ["no record digest", file({ pages: [{ ...page, record_sha256: undefined }] })],
      ["no photo digest", file({ pages: [{ ...page, photo_sha256: undefined }] })],
      ["null digest", file({ pages: [{ ...page, photo_sha256: null }] })],
      ["short digest", file({ pages: [{ ...page, record_sha256: A.slice(1) }] })],
      ["long digest", file({ pages: [{ ...page, photo_sha256: `${A}a` }] })],
      ["upper-case digest", file({ pages: [{ ...page, photo_sha256: A.toUpperCase() }] })],
      ["digest that is not hex", file({ pages: [{ ...page, photo_sha256: "g".repeat(64) }] })],
      ["no checked_before", JSON.stringify({ version: 1, pages: [] })],
      ["checked_before holds a number", file({ checked_before: [1] })],
      ["checked_before holds a blank id", file({ checked_before: [""] })],
      ...["sample:M", "sample:M:3", "sample:M:3A", "sample:M:3a ", "sample:M:3a\n", "sample:M:a/b", "../x:M:3a", "sample:M:3a:4b", "sample"].flatMap(
        (ref): Array<[string, string]> => [
          [`page with the id ${JSON.stringify(ref)}`, file({ pages: [{ ...page, source_ref: ref }] })],
          [`checked_before holds ${JSON.stringify(ref)}`, file({ checked_before: [ref] })],
        ],
      ),
    ];
    for (const [name, content] of damaged) {
      writeFileSync(filePath, content);
      expect(() => readCheckedDigests(finalDir), name).toThrow(filePath);
    }

    rmSync(filePath);
    writeFileSync(join(rootDir, "real"), file({}));
    symlinkSync(join(rootDir, "real"), filePath);
    expect(() => readCheckedDigests(finalDir), "link").toThrow(filePath);
    rmSync(filePath);
    symlinkSync(join(rootDir, "nothing"), filePath);
    expect(() => readCheckedDigests(finalDir), "dangling link").toThrow(filePath);
    rmSync(filePath);
    mkdirSync(filePath);
    expect(() => readCheckedDigests(finalDir), "folder").toThrow(filePath);
  });

  it("never writes a page id that it would refuse to read", () => {
    const repo = join(rootDir, "repo");
    mkdirSync(repo);
    const digest = { record_sha256: A, photo_sha256: B };
    for (const value of [
      { pages: new Map([["sample:M", digest]]), checkedBefore: new Set<string>() },
      { pages: new Map(), checkedBefore: new Set(["sample:M"]) },
    ]) {
      expect(() => writeCheckedDigests(finalDir, value, repo)).toThrow(/sample:M/);
      expect(existsSync(filePath)).toBe(false);
    }
  });

  it("counts a check only when both digests match", () => {
    const digest = { record_sha256: A, photo_sha256: B };
    const rows: Array<[Parameters<typeof findCheckProblems>[0], string, string | null, string[]]> = [
      [digest, A, B, []],
      [digest, B, B, ["record changed after the check"]],
      [digest, A, A, ["photo changed after the check"]],
      [digest, A, null, ["photo of the check is missing"]],
      [digest, B, A, ["record changed after the check", "photo changed after the check"]],
      [digest, B, null, ["record changed after the check", "photo of the check is missing"]],
      [undefined, A, B, ["checked before the photo check was saved"]],
      [undefined, A, null, ["checked before the photo check was saved"]],
    ];
    for (const [d, recordSha256, sha256, expected] of rows) {
      const photo: PagePhoto = sha256 === null ? { problem: "photo of the check is missing" } : { sha256 };
      expect(findCheckProblems(d, { recordSha256, photo })).toEqual(expected);
    }
    const mismatch = { problem: "photo does not match the photo list" } as const;
    expect(findCheckProblems(digest, { recordSha256: A, photo: mismatch })).toEqual([mismatch.problem]);
  });
});
