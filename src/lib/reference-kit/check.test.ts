import { execFile, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CHECKED_DIGESTS_FILE, type PageRecord } from "@/lib/reference-record";
import { checkAndMarkPage } from "./check";
import { compareWorkFolder } from "./compare-batch";
import { addPreparedPhoto } from "./photo.fixtures";

// Runs before a written file takes its place. A test that throws here stops the command there.
const fsHook = vi.hoisted(() => ({ rename: null as ((to: string) => void) | null }));

vi.mock("node:fs", async (importOriginal) => {
  const real = await importOriginal<{ renameSync: (from: string, to: string) => void }>();
  return {
    ...real,
    renameSync: (from: string, to: string) => {
      fsHook.rename?.(to);
      real.renameSync(from, to);
    },
  };
});

const tempDirs: string[] = [];

afterEach(() => {
  fsHook.rename = null;
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function makeFinalPage(): PageRecord {
  return {
    kind: "page",
    source_ref: "sample:M:3a",
    topic: { title: "Adding Numbers", number: 1 },
    sections: [
      {
        instruction: "Add the numbers.",
        scaffolds: [],
        items: [
          {
            n: 1,
            printed: "14 + 9 =",
            form: "horizontal",
            expr: { kind: "arith", op: "add", operands: [14, 9] },
            responses: [
              {
                position: "after_equals",
                cue: null,
                answer: null,
                answer_source: "unchecked",
              },
            ],
          },
        ],
      },
    ],
    examples: [],
    score_bands: [
      [100, 100],
      [90, 99],
      [80, 89],
      [70, 79],
      [0, 69],
    ],
  };
}

describe("checkAndMarkPage", () => {
  it("refuses --page all and paths inside the repo", () => {
    const repo = mkdtempSync(join(tmpdir(), "ref-chk-repo-"));
    const work = mkdtempSync(join(tmpdir(), "ref-chk-work-"));
    tempDirs.push(repo, work);

    expect(() =>
      checkAndMarkPage({ workDir: work, page: "all", repoRoot: repo, photoCompared: true }),
    ).toThrow(/not supported/i);

    expect(() =>
      checkAndMarkPage({ workDir: join(repo, "work"), page: "sample:M:3a", repoRoot: repo, photoCompared: true }),
    ).toThrow(/Refusing to write/);
  });

  it("validates, recomputes answers, marks human_checked in status.json, and rewrites view", () => {
    const repo = mkdtempSync(join(tmpdir(), "ref-chk-repo-"));
    const work = mkdtempSync(join(tmpdir(), "ref-chk-work-"));
    tempDirs.push(repo, work);

    const finalDir = join(work, "final");
    mkdirSync(finalDir, { recursive: true });
    writeFileSync(join(finalDir, "sample-M-3a.json"), JSON.stringify(makeFinalPage(), null, 2));
    writeFileSync(
      join(finalDir, "status.json"),
      JSON.stringify({ "sample:M:3a": "machine_read" }, null, 2),
    );

    addPreparedPhoto(work, "photo 3a", "sample:M:3a");

    const result = checkAndMarkPage({ workDir: work, page: "sample:M:3a", repoRoot: repo, photoCompared: true });
    expect(result.sourceRef).toBe("sample:M:3a");
    expect(result.notes).toEqual([]);

    const updatedRecord = JSON.parse(readFileSync(join(finalDir, "sample-M-3a.json"), "utf8"));
    expect(updatedRecord.sections[0].items[0].responses[0].answer).toBe("23");
    expect(updatedRecord.sections[0].items[0].responses[0].answer_source).toBe("computed");

    const updatedStatus = JSON.parse(readFileSync(join(finalDir, "status.json"), "utf8"));
    expect(updatedStatus["sample:M:3a"]).toBe("human_checked");

    const viewMd = readFileSync(join(work, "final-view", "sample-M-3a.md"), "utf8");
    expect(viewMd).toContain("# sample:M:3a");
    expect(viewMd).toContain("**23** (computed)");
  });

  function setUpWork(
    page: PageRecord,
    opts: { photo?: boolean } = {},
  ): { repo: string; work: string; finalDir: string } {
    const repo = mkdtempSync(join(tmpdir(), "ref-chk-repo-"));
    const work = mkdtempSync(join(tmpdir(), "ref-chk-work-"));
    tempDirs.push(repo, work);
    const finalDir = join(work, "final");
    mkdirSync(finalDir, { recursive: true });
    writeFileSync(join(finalDir, "sample-M-3a.json"), JSON.stringify(page, null, 2));
    writeFileSync(
      join(finalDir, "status.json"),
      JSON.stringify({ "sample:M:3a": "machine_read" }, null, 2),
    );
    if (opts.photo !== false) addPreparedPhoto(work, "photo 3a", "sample:M:3a");
    return { repo, work, finalDir };
  }

  function expectNothingWritten(finalDir: string, recordBefore: string): void {
    expect(readFileSync(join(finalDir, "sample-M-3a.json"), "utf8")).toBe(recordBefore);
    const status = JSON.parse(readFileSync(join(finalDir, "status.json"), "utf8"));
    expect(status["sample:M:3a"]).toBe("machine_read");
  }

  it("refuses without --photo-compared, names the photo of the page, and writes nothing", () => {
    const { repo, work, finalDir } = setUpWork(makeFinalPage(), { photo: false });
    const before = readFileSync(join(finalDir, "sample-M-3a.json"), "utf8");

    // No manifest and no report: the photos folder is named.
    expect(() =>
      checkAndMarkPage({ workDir: work, page: "sample:M:3a", repoRoot: repo, photoCompared: false }),
    ).toThrow(new RegExp(`compare the record of sample:M:3a with the photo first[\\s\\S]*${join(work, "photos").replace(/[/\\]/g, ".")}[\\s\\S]*--page sample:M:3a --photo-compared`));

    mkdirSync(join(work, "photos"), { recursive: true });
    writeFileSync(
      join(work, "photos", "photos-manifest.json"),
      JSON.stringify({
        version: 1,
        photos: [
          { file: "abcdefabcdef.jpg", sha256: "abcdef".repeat(10) + "abcd", original_name: "IMG_0042.jpg", width: 3000, height: 4000, source_ref: "sample:M:3a" },
        ],
      }),
    );
    expect(() =>
      checkAndMarkPage({ workDir: work, page: "sample:M:3a", repoRoot: repo, photoCompared: false }),
    ).toThrow(/abcdefabcdef\.jpg \(original name IMG_0042\.jpg\)/);
    expectNothingWritten(finalDir, before);
    expect(existsSync(join(work, "final-view"))).toBe(false);
  });

  it("never overwrites a corrected answer: a stored answer that the expression does not give stops the check", () => {
    const page = makeFinalPage();
    // The person corrected the answer but not the expression (14 + 9 gives 23).
    page.sections[0].items[0].responses[0] = {
      position: "after_equals",
      cue: null,
      answer: "24",
      answer_source: "computed",
    };
    const { repo, work, finalDir } = setUpWork(page);
    const before = readFileSync(join(finalDir, "sample-M-3a.json"), "utf8");

    expect(() =>
      checkAndMarkPage({ workDir: work, page: "sample:M:3a", repoRoot: repo, photoCompared: true }),
    ).toThrow(/sections\[0\]\.items\[n=1\]\.responses\[0\]: record holds "24", computed "23"[\s\S]*correct the expression so that it gives the right answer, or correct the answer/i);
    expectNothingWritten(finalDir, before);
  });

  it("stops on a printed answer that the expression does not give", () => {
    const printed = makeFinalPage();
    printed.sections[0].items[0].responses[0] = {
      position: "after_equals",
      cue: null,
      answer: "32",
      answer_source: "printed",
    };
    const one = setUpWork(printed);
    const beforeOne = readFileSync(join(one.finalDir, "sample-M-3a.json"), "utf8");
    expect(() =>
      checkAndMarkPage({ workDir: one.work, page: "sample:M:3a", repoRoot: one.repo, photoCompared: true }),
    ).toThrow(/page prints "32", computed "23"/);
    expectNothingWritten(one.finalDir, beforeOne);
  });

  it("passes answers that do not fit the answer places, remainder forms, and a digit in a named place, keeping the stored answers", () => {
    const item = (responses: PageRecord["sections"][0]["items"][0]["responses"], operands = [13, 3], op: "div" | "add" = "div") => ({
      n: 1,
      printed: "sample",
      form: "horizontal" as const,
      expr: { kind: "arith" as const, op, operands },
      responses,
    });
    const cases = [
      { name: "quotient and remainder boxes", item: item([
        { position: "box", cue: null, answer: "4", answer_source: "reader" },
        { position: "box", cue: null, answer: "1", answer_source: "reader" },
      ]), answers: ["4", "1"] },
      { name: "remainder without spaces", item: item([
        { position: "after_equals", cue: null, answer: "4r1", answer_source: "reader" },
      ]), answers: ["4 R1"] },
      { name: "ones box", item: item([
        { position: "box", cue: null, answer: "5", answer_source: "reader", place: "ones" },
      ], [10, 5], "add"), answers: ["5"] },
    ];
    for (const c of cases) {
      const page = makeFinalPage();
      page.sections[0].items[0] = c.item;
      const { repo, work, finalDir } = setUpWork(page);
      checkAndMarkPage({ workDir: work, page: "sample:M:3a", repoRoot: repo, photoCompared: true });
      const saved = JSON.parse(readFileSync(join(finalDir, "sample-M-3a.json"), "utf8")) as PageRecord;
      expect(saved.sections[0].items[0].responses.map((r) => r.answer), c.name).toEqual(c.answers);
      const status = JSON.parse(readFileSync(join(finalDir, "status.json"), "utf8"));
      expect(status["sample:M:3a"], c.name).toBe("human_checked");
    }
  });

  it("refuses an empty answer place and lists it, but accepts an answer place marked unclear", () => {
    const page = makeFinalPage();
    page.sections[0].items.push({
      n: 2,
      printed: "Sample text ___ = 5",
      form: "horizontal",
      expr: { kind: "notation", latex: "x = 5" },
      responses: [
        { position: "box", cue: null, answer: null, answer_source: "unchecked" },
        { position: "work_area", cue: null, answer: null, answer_source: "unchecked" },
      ],
    });
    const { repo, work, finalDir } = setUpWork(page);
    const before = readFileSync(join(finalDir, "sample-M-3a.json"), "utf8");
    expect(() =>
      checkAndMarkPage({ workDir: work, page: "sample:M:3a", repoRoot: repo, photoCompared: true }),
    ).toThrow(/Answer places with no answer:\n {2}sections\[0\]\.items\[n=2\]\.responses\[0\]\n/);
    expectNothingWritten(finalDir, before);

    page.sections[0].items[1].responses[0].answer = "unclear";
    writeFileSync(join(finalDir, "sample-M-3a.json"), JSON.stringify(page, null, 2));
    checkAndMarkPage({ workDir: work, page: "sample:M:3a", repoRoot: repo, photoCompared: true });
    const status = JSON.parse(readFileSync(join(finalDir, "status.json"), "utf8"));
    expect(status["sample:M:3a"]).toBe("human_checked");
  });

  it("refuses a sole work_area response with null answer and computes a sole work_area on a computable item", () => {
    const page = makeFinalPage();
    page.sections[0].items = [
      {
        n: 1,
        printed: "14 + 9",
        form: "horizontal",
        expr: { kind: "arith", op: "add", operands: [14, 9] },
        responses: [{ position: "work_area", cue: null, answer: null, answer_source: "unchecked" }],
      },
      {
        n: 2,
        printed: "Simplify 4/6",
        form: "horizontal",
        expr: { kind: "notation", latex: "\\frac{4}{6}" },
        responses: [{ position: "work_area", cue: null, answer: null, answer_source: "unchecked" }],
      },
    ];
    const { repo, work, finalDir } = setUpWork(page);
    const before = readFileSync(join(finalDir, "sample-M-3a.json"), "utf8");
    expect(() =>
      checkAndMarkPage({ workDir: work, page: "sample:M:3a", repoRoot: repo, photoCompared: true }),
    ).toThrow(/Answer places with no answer:\n {2}sections\[0\]\.items\[n=2\]\.responses\[0\]\n/);
    expectNothingWritten(finalDir, before);

    page.sections[0].items[1].responses[0] = {
      position: "work_area",
      cue: null,
      answer: "2/3",
      answer_source: "reader",
    };
    writeFileSync(join(finalDir, "sample-M-3a.json"), JSON.stringify(page, null, 2));
    const result = checkAndMarkPage({ workDir: work, page: "sample:M:3a", repoRoot: repo, photoCompared: true });
    expect(result.notes).toEqual([]);
    const saved = JSON.parse(readFileSync(join(finalDir, "sample-M-3a.json"), "utf8")) as PageRecord;
    expect(saved.sections[0].items[0].responses[0]).toEqual({
      position: "work_area",
      cue: null,
      answer: "23",
      answer_source: "computed",
    });
    expect(saved.sections[0].items[1].responses[0]).toEqual({
      position: "work_area",
      cue: null,
      answer: "2/3",
      answer_source: "reader",
    });
  });

  it("accepts a sole work_area decimal answer on an inexact division and still stops on a wrong exact sum", () => {
    const divPage = makeFinalPage();
    divPage.sections[0].items = [
      {
        n: 1,
        printed: "7 / 2",
        form: "horizontal",
        expr: { kind: "arith", op: "div", operands: [7, 2] },
        responses: [{ position: "work_area", cue: null, answer: "3.5", answer_source: "reader" }],
      },
    ];
    const okRun = setUpWork(divPage);
    const result = checkAndMarkPage({
      workDir: okRun.work,
      page: "sample:M:3a",
      repoRoot: okRun.repo,
      photoCompared: true,
    });
    expect(result.notes).toEqual([]);
    const saved = JSON.parse(readFileSync(join(okRun.finalDir, "sample-M-3a.json"), "utf8")) as PageRecord;
    expect(saved.sections[0].items[0].responses[0]).toEqual({
      position: "work_area",
      cue: null,
      answer: "3.5",
      answer_source: "reader",
    });

    const wrongSumPage = makeFinalPage();
    wrongSumPage.sections[0].items = [
      {
        n: 1,
        printed: "2 + 3",
        form: "horizontal",
        expr: { kind: "arith", op: "add", operands: [2, 3] },
        responses: [{ position: "work_area", cue: null, answer: "6", answer_source: "reader" }],
      },
    ];
    const badRun = setUpWork(wrongSumPage);
    const beforeBad = readFileSync(join(badRun.finalDir, "sample-M-3a.json"), "utf8");
    expect(() =>
      checkAndMarkPage({
        workDir: badRun.work,
        page: "sample:M:3a",
        repoRoot: badRun.repo,
        photoCompared: true,
      }),
    ).toThrow(/reader gave "6", computed "5"/);
    expectNothingWritten(badRun.finalDir, beforeBad);
  });

  it("refuses an invalid edited record without modifying status.json", () => {
    const repo = mkdtempSync(join(tmpdir(), "ref-chk-repo-"));
    const work = mkdtempSync(join(tmpdir(), "ref-chk-work-"));
    tempDirs.push(repo, work);

    const finalDir = join(work, "final");
    mkdirSync(finalDir, { recursive: true });
    writeFileSync(
      join(finalDir, "sample-M-3a.json"),
      JSON.stringify({ ...makeFinalPage(), unknown_key: 123 }, null, 2),
    );
    writeFileSync(
      join(finalDir, "status.json"),
      JSON.stringify({ "sample:M:3a": "machine_read" }, null, 2),
    );

    expect(() =>
      checkAndMarkPage({ workDir: work, page: "sample:M:3a", repoRoot: repo, photoCompared: true }),
    ).toThrow(/Validation failed/);

    const status = JSON.parse(readFileSync(join(finalDir, "status.json"), "utf8"));
    expect(status["sample:M:3a"]).toBe("machine_read");
  });

  it("refuses a page that is not listed in status.json", () => {
    const repo = mkdtempSync(join(tmpdir(), "ref-chk-repo-"));
    const work = mkdtempSync(join(tmpdir(), "ref-chk-work-"));
    tempDirs.push(repo, work);

    const finalDir = join(work, "final");
    mkdirSync(finalDir, { recursive: true });
    writeFileSync(join(finalDir, "sample-M-3a.json"), JSON.stringify(makeFinalPage(), null, 2));
    writeFileSync(
      join(finalDir, "status.json"),
      JSON.stringify({ "sample:M:4a": "double_read" }, null, 2),
    );

    expect(() =>
      checkAndMarkPage({ workDir: work, page: "sample:M:3a", repoRoot: repo, photoCompared: true }),
    ).toThrow(/status\.json/i);
  });

  it("applies the same answer-bearing response rule in reference:check without writing into work_area", () => {
    const repo = mkdtempSync(join(tmpdir(), "ref-chk-repo-"));
    const work = mkdtempSync(join(tmpdir(), "ref-chk-work-"));
    tempDirs.push(repo, work);

    const finalDir = join(work, "final");
    mkdirSync(finalDir, { recursive: true });
    const divPage = makeFinalPage();
    divPage.sections[0].items[0] = {
      n: 1,
      printed: "13 / 3 =",
      form: "horizontal",
      expr: { kind: "arith", op: "div", operands: [13, 3] },
      responses: [
        { position: "after_equals", cue: null, answer: "4 R1", answer_source: "reader" },
        { position: "work_area", cue: null, answer: null, answer_source: "unchecked" },
      ],
    };
    writeFileSync(join(finalDir, "sample-M-3a.json"), JSON.stringify(divPage, null, 2));
    writeFileSync(
      join(finalDir, "status.json"),
      JSON.stringify({ "sample:M:3a": "machine_read" }, null, 2),
    );
    addPreparedPhoto(work, "photo 3a", "sample:M:3a");

    checkAndMarkPage({ workDir: work, page: "sample:M:3a", repoRoot: repo, photoCompared: true });
    const saved = JSON.parse(readFileSync(join(finalDir, "sample-M-3a.json"), "utf8"));
    expect(saved.sections[0].items[0].responses[0].answer).toBe("4 R1");
    expect(saved.sections[0].items[0].responses[0].answer_source).toBe("computed");
    expect(saved.sections[0].items[0].responses[1].answer).toBeNull();
    expect(saved.sections[0].items[0].responses[1].answer_source).toBe("unchecked");
  });

  it("moves an agreement_accepted page to human_checked and removes single_read from the record and view", () => {
    const repo = mkdtempSync(join(tmpdir(), "ref-chk-acc-repo-"));
    const work = mkdtempSync(join(tmpdir(), "ref-chk-acc-work-"));
    tempDirs.push(repo, work);

    const finalDir = join(work, "final");
    mkdirSync(finalDir, { recursive: true });
    const acceptedPage: PageRecord = {
      ...makeFinalPage(),
      single_read: ["topic.title", "sections[0].items[0].printed"],
    };
    writeFileSync(join(finalDir, "sample-M-3a.json"), JSON.stringify(acceptedPage, null, 2));
    addPreparedPhoto(work, "photo 3a", "sample:M:3a");
    writeFileSync(
      join(finalDir, "status.json"),
      JSON.stringify({ "sample:M:3a": "agreement_accepted" }, null, 2),
    );

    const res = checkAndMarkPage({
      workDir: work,
      page: "sample:M:3a",
      repoRoot: repo,
      photoCompared: true,
    });

    const updatedStatus = JSON.parse(readFileSync(res.statusPath, "utf8")) as Record<string, string>;
    expect(updatedStatus["sample:M:3a"]).toBe("human_checked");

    const saved = JSON.parse(readFileSync(res.recordPath, "utf8")) as PageRecord;
    expect(saved.single_read).toBeUndefined();
    expect("single_read" in saved).toBe(false);

    const viewMd = readFileSync(res.viewPath, "utf8");
    expect(viewMd).not.toContain("Single-read");
    expect(viewMd).not.toContain("not checked");
  });

  it("refuses to write when status.json has colliding source_ref values or the file on disk holds a different source_ref", () => {
    const repo = mkdtempSync(join(tmpdir(), "ref-chk-col-repo-"));
    const work = mkdtempSync(join(tmpdir(), "ref-chk-col-work-"));
    tempDirs.push(repo, work);

    const finalDir = join(work, "final");
    mkdirSync(finalDir, { recursive: true });
    const rec = makeFinalPage();
    rec.source_ref = "demo-x:M:3a";
    writeFileSync(join(finalDir, "demo-x-M-3a.json"), JSON.stringify(rec, null, 2));
    writeFileSync(
      join(finalDir, "status.json"),
      JSON.stringify(
        {
          "demo-x:M:3a": "machine_read",
          "demo:x-M:3a": "machine_read",
        },
        null,
        2,
      ),
    );

    expect(() =>
      checkAndMarkPage({ workDir: work, page: "demo-x:M:3a", repoRoot: repo, photoCompared: true }),
    ).toThrow(/map to|collid/i);

    const statusAfter = JSON.parse(readFileSync(join(finalDir, "status.json"), "utf8"));
    expect(statusAfter["demo-x:M:3a"]).toBe("machine_read");

    // Some disks see one file in two names that differ only in letter case.
    addPreparedPhoto(work, "photo 3a", "demo-x:M:3a");
    const aliases = JSON.stringify({ "demo-x:M:3a": "machine_read", "demo-x:m:3a": "machine_read" });
    writeFileSync(join(finalDir, "status.json"), aliases);
    expect(() =>
      checkAndMarkPage({ workDir: work, page: "demo-x:M:3a", repoRoot: repo, photoCompared: true }),
    ).toThrow(/both map to/);
    expect(readFileSync(join(finalDir, "status.json"), "utf8")).toBe(aliases);
  });

  it("allows reference:check to mark a page whose worked-example shown_answer differs from its expr (a person decides)", () => {
    const repo = mkdtempSync(join(tmpdir(), "ref-chk-ex-repo-"));
    const work = mkdtempSync(join(tmpdir(), "ref-chk-ex-work-"));
    tempDirs.push(repo, work);

    const finalDir = join(work, "final");
    mkdirSync(finalDir, { recursive: true });
    const rec: PageRecord = {
      ...makeFinalPage(),
      examples: [
        {
          position: "top",
          relation: "compare",
          parts: [
            { form: "horizontal", expr: { kind: "arith", op: "add", operands: [2, 3] }, shown_answer: "6" },
          ],
        },
      ],
    };
    writeFileSync(join(finalDir, "sample-M-3a.json"), JSON.stringify(rec, null, 2));
    writeFileSync(join(finalDir, "status.json"), JSON.stringify({ "sample:M:3a": "machine_read" }, null, 2));
    addPreparedPhoto(work, "photo 3a", "sample:M:3a");

    const res = checkAndMarkPage({ workDir: work, page: "sample:M:3a", repoRoot: repo, photoCompared: true });
    const saved = JSON.parse(readFileSync(res.recordPath, "utf8")) as PageRecord;
    expect(Array.isArray(saved.examples) && saved.examples[0].parts[0].shown_answer).toBe("6");
    expect(JSON.parse(readFileSync(res.statusPath, "utf8"))["sample:M:3a"]).toBe("human_checked");
  });

  it("refuses invalid UTF-8 bytes in the final record, status.json, or photos-manifest.json, naming the file and writing nothing", () => {
    const repo = mkdtempSync(join(tmpdir(), "ref-chk-utf8-repo-"));
    const work = mkdtempSync(join(tmpdir(), "ref-chk-utf8-work-"));
    tempDirs.push(repo, work);

    const finalDir = join(work, "final");
    mkdirSync(finalDir, { recursive: true });
    const [left, right] = JSON.stringify({ ...makeFinalPage(), topic: { title: "MARK" } }).split("MARK");
    const badRecordPath = join(finalDir, "sample-M-3a.json");
    writeFileSync(
      badRecordPath,
      Buffer.concat([Buffer.from(left, "utf8"), Buffer.of(0xff), Buffer.from(right, "utf8")]),
    );
    writeFileSync(join(finalDir, "status.json"), JSON.stringify({ "sample:M:3a": "machine_read" }));

    expect(() =>
      checkAndMarkPage({ workDir: work, page: "sample:M:3a", repoRoot: repo, photoCompared: true }),
    ).toThrow(/Invalid UTF-8 in .*sample-M-3a\.json/i);
    expect(JSON.parse(readFileSync(join(finalDir, "status.json"), "utf8"))["sample:M:3a"]).toBe(
      "machine_read",
    );
    expect(existsSync(join(work, "final-view"))).toBe(false);

    const validRecordText = JSON.stringify(makeFinalPage());
    writeFileSync(badRecordPath, validRecordText);
    const [sLeft, sRight] = JSON.stringify({ "sample:M:3a": "MARK" }).split("MARK");
    writeFileSync(
      join(finalDir, "status.json"),
      Buffer.concat([Buffer.from(sLeft, "utf8"), Buffer.of(0xff), Buffer.from(sRight, "utf8")]),
    );
    expect(() =>
      checkAndMarkPage({ workDir: work, page: "sample:M:3a", repoRoot: repo, photoCompared: true }),
    ).toThrow(/Invalid UTF-8 in .*status\.json/i);
    expect(readFileSync(badRecordPath, "utf8")).toBe(validRecordText);
    expect(existsSync(join(work, "final-view"))).toBe(false);

    writeFileSync(join(finalDir, "status.json"), JSON.stringify({ "sample:M:3a": "machine_read" }));
    const photosDir = join(work, "photos");
    mkdirSync(photosDir, { recursive: true });
    const [mLeft, mRight] = JSON.stringify({
      version: 1,
      photos: [
        {
          file: "abcdefabcdef.jpg",
          sha256: "a".repeat(64),
          original_name: "MARK",
          width: 3000,
          height: 4000,
          source_ref: "sample:M:3a",
        },
      ],
    }).split("MARK");
    writeFileSync(
      join(photosDir, "photos-manifest.json"),
      Buffer.concat([Buffer.from(mLeft, "utf8"), Buffer.of(0xff), Buffer.from(mRight, "utf8")]),
    );
    expect(() =>
      checkAndMarkPage({ workDir: work, page: "sample:M:3a", repoRoot: repo, photoCompared: false }),
    ).toThrow(/Invalid UTF-8 in .*photos-manifest\.json/i);
    expectNothingWritten(finalDir, validRecordText);
    expect(existsSync(join(work, "final-view"))).toBe(false);
  });

  it("falls back to the folder hint without --photo-compared on malformed report.json shapes, while stopping on a damaged photo list, invalid UTF-8 or JSON", () => {
    const fallbackCases: Array<{
      name: string;
      report?: unknown;
      expectedPhotoPattern?: RegExp;
    }> = [
      { name: "report pages is a string", report: { pages: "not-a-list" } },
      { name: "report pages is an object", report: { pages: {} } },
      { name: "report pages is a number", report: { pages: 42 } },
      { name: "report pages is null", report: { pages: null } },
      { name: "report root is null", report: null },
      { name: "report root is an array", report: [] },
      { name: "report pages contains only null", report: { pages: [null] } },
      {
        name: "report pages contains null before matching entry",
        report: {
          pages: [
            null,
            { source_ref: "sample:M:3a", photo: "111111111111.jpg", original_name: "01.jpg" },
          ],
        },
        expectedPhotoPattern: /111111111111\.jpg \(original name 01\.jpg\)/,
      },
      {
        name: "report matching entry has non-string photo",
        report: { pages: [{ source_ref: "sample:M:3a", photo: 123 }] },
      },
      {
        name: "report matching entry has empty photo string",
        report: { pages: [{ source_ref: "sample:M:3a", photo: "" }] },
      },
      ...[" ", "\t", " \n "].map((blank) => ({
        name: `report matching entry has blank photo ${JSON.stringify(blank)}`,
        report: { pages: [{ source_ref: "sample:M:3a", photo: blank, original_name: "01.jpg" }] },
      })),
      {
        name: "report matching entry has a blank original name",
        report: {
          pages: [{ source_ref: "sample:M:3a", photo: "333333333333.jpg", original_name: " " }],
        },
        expectedPhotoPattern: /333333333333\.jpg\nRecord:/,
      },
    ];

    for (const c of fallbackCases) {
      const { repo, work, finalDir } = setUpWork(makeFinalPage(), { photo: false });
      const before = readFileSync(join(finalDir, "sample-M-3a.json"), "utf8");
      if ("report" in c) {
        writeFileSync(join(finalDir, "report.json"), JSON.stringify(c.report));
      }
      const expected =
        c.expectedPhotoPattern ??
        new RegExp(`the photo of this page in ${join(work, "photos").replace(/[/\\]/g, ".")}`);
      expect(
        () =>
          checkAndMarkPage({
            workDir: work,
            page: "sample:M:3a",
            repoRoot: repo,
            photoCompared: false,
          }),
        c.name,
      ).toThrow(expected);
      expectNothingWritten(finalDir, before);
    }

    const strictFailCases: Array<{
      name: string;
      relPath: string;
      bytes: Buffer;
      expected: RegExp;
    }> = [
      {
        name: "invalid JSON in report.json",
        relPath: join("final", "report.json"),
        bytes: Buffer.from("{ bad", "utf8"),
        expected: /Invalid JSON in .*report\.json/i,
      },
      {
        name: "invalid UTF-8 in report.json",
        relPath: join("final", "report.json"),
        bytes: Buffer.concat([Buffer.from('{"pages":[{"source_ref":"', "utf8"), Buffer.of(0xff), Buffer.from('"}]}', "utf8")]),
        expected: /Invalid UTF-8 in .*report\.json/i,
      },
      {
        name: "invalid JSON in photos-manifest.json",
        relPath: join("photos", "photos-manifest.json"),
        bytes: Buffer.from("{ bad", "utf8"),
        expected: /Invalid JSON in .*photos-manifest\.json/i,
      },
      ...["null", "[]", '{"version":1,"photos":"bad"}', '{"version":1,"photos":[null]}', '{"version":2,"photos":[]}'].map(
        (text) => ({
          name: `photo list of another shape ${text}`,
          relPath: join("photos", "photos-manifest.json"),
          bytes: Buffer.from(text, "utf8"),
          expected: /Damaged file .*photos-manifest\.json/,
        }),
      ),
    ];

    for (const c of strictFailCases) {
      const { repo, work, finalDir } = setUpWork(makeFinalPage(), { photo: false });
      const before = readFileSync(join(finalDir, "sample-M-3a.json"), "utf8");
      mkdirSync(join(work, "photos"), { recursive: true });
      writeFileSync(join(work, c.relPath), c.bytes);
      expect(
        () =>
          checkAndMarkPage({
            workDir: work,
            page: "sample:M:3a",
            repoRoot: repo,
            photoCompared: false,
          }),
        c.name,
      ).toThrow(c.expected);
      expectNothingWritten(finalDir, before);
    }
  });

  // Everything under the work folder, with the bytes of each file, to prove that a stopped check
  // wrote nothing.
  function snapshotFiles(dir: string): Record<string, string> {
    const out: Record<string, string> = {};
    for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true })) {
      const path = join(entry.parentPath, entry.name);
      out[path] = entry.isFile() ? readFileSync(path).toString("base64") : "not a file";
    }
    return out;
  }

  function sha256(bytes: Uint8Array): string {
    return createHash("sha256").update(bytes).digest("hex");
  }

  const check = (work: string, repo: string, beforeWrite?: () => void) =>
    checkAndMarkPage({ workDir: work, page: "sample:M:3a", repoRoot: repo, photoCompared: true, beforeWrite });

  it("saves the SHA-256 of the record bytes that it wrote and of the photo, and a new check replaces them", () => {
    const { repo, work, finalDir } = setUpWork(makeFinalPage());
    const digestsPath = join(finalDir, CHECKED_DIGESTS_FILE);
    const recordPath = join(finalDir, "sample-M-3a.json");
    const photo = addPreparedPhoto(work, "photo 3a", "sample:M:3a");
    const saved = () => JSON.parse(readFileSync(digestsPath, "utf8")) as { pages: unknown[] };

    const res = check(work, repo);
    expect(res.photoPath).toBe(photo.path);
    expect(saved()).toEqual({
      version: 1,
      pages: [
        {
          source_ref: "sample:M:3a",
          record_sha256: sha256(readFileSync(recordPath)),
          photo_sha256: sha256(readFileSync(photo.path)),
        },
      ],
      checked_before: [],
    });

    // The page is marked in status.json, which stays a map of text.
    expect(JSON.parse(readFileSync(join(finalDir, "status.json"), "utf8"))).toEqual({
      "sample:M:3a": "human_checked",
    });

    // The person corrects the record, and a page of an earlier check stays in the file.
    writeFileSync(
      digestsPath,
      JSON.stringify({
        version: 1,
        pages: [
          ...saved().pages,
          { source_ref: "sample:M:4a", record_sha256: "a".repeat(64), photo_sha256: "b".repeat(64) },
        ],
        checked_before: ["sample:M:3a", "sample:M:5a"],
      }),
    );
    const corrected = makeFinalPage();
    corrected.topic.title = "Corrected title";
    writeFileSync(recordPath, JSON.stringify(corrected));
    const before = sha256(readFileSync(recordPath));
    check(work, repo);
    const after = sha256(readFileSync(recordPath));
    expect(after).not.toBe(before);
    expect(saved()).toEqual({
      version: 1,
      pages: [
        { source_ref: "sample:M:3a", record_sha256: after, photo_sha256: photo.sha256 },
        { source_ref: "sample:M:4a", record_sha256: "a".repeat(64), photo_sha256: "b".repeat(64) },
      ],
      checked_before: ["sample:M:5a"],
    });
  });

  it("stops and writes nothing when the photo or the record changes between its read and the write, or when there is no photo to tie", () => {
    const recordOf = (work: string) => join(work, "final", "sample-M-3a.json");
    const manifestOf = (work: string) => join(work, "photos", "photos-manifest.json");
    const photoOf = (work: string) => addPreparedPhoto(work, "photo 3a", "sample:M:3a").path;

    // The change happens after the command read both files.
    const during: Array<{ name: string; change: (work: string) => void; expected: RegExp }> = [
      {
        name: "record changed",
        change: (work) => writeFileSync(recordOf(work), JSON.stringify({ ...makeFinalPage(), readers: ["x:y"] })),
        expected: /record .*sample-M-3a\.json changed while the check ran/i,
      },
      { name: "record removed", change: (work) => rmSync(recordOf(work)), expected: /changed while the check ran/i },
      {
        name: "photo changed",
        change: (work) => writeFileSync(photoOf(work), "other bytes"),
        expected: /photo .*\.jpg/i,
      },
      { name: "photo removed", change: (work) => rmSync(photoOf(work)), expected: /photo .*\.jpg/i },
      {
        name: "the photo list names another photo",
        change: (work) => {
          rmSync(manifestOf(work));
          addPreparedPhoto(work, "another photo", "sample:M:3a");
        },
        expected: /photo of sample:M:3a changed while the check ran/i,
      },
    ];
    for (const c of during) {
      const { repo, work } = setUpWork(makeFinalPage());
      let afterChange: Record<string, string> = {};
      expect(
        () =>
          check(work, repo, () => {
            c.change(work);
            afterChange = snapshotFiles(work);
          }),
        c.name,
      ).toThrow(c.expected);
      expect(snapshotFiles(work), c.name).toEqual(afterChange);
    }

    // There is no photo, or the photo is not the one that the photo list names.
    const before: Array<{ name: string; set: (work: string) => void; expected: RegExp }> = [
      { name: "no manifest", set: (work) => rmSync(manifestOf(work)), expected: /photos-manifest\.json/ },
      {
        name: "manifest names no photo for the page",
        set: (work) => {
          rmSync(manifestOf(work));
          addPreparedPhoto(work, "photo 4a", "sample:M:4a");
        },
        expected: /no photo for sample:M:3a/,
      },
      {
        name: "manifest names two photos for the page",
        set: (work) => {
          addPreparedPhoto(work, "second", "sample:M:3a");
        },
        expected: /more than one photo for sample:M:3a/,
      },
      {
        name: "malformed manifest",
        set: (work) => writeFileSync(manifestOf(work), JSON.stringify({ version: 2 })),
        expected: /photos-manifest\.json/,
      },
      { name: "photo file missing", set: (work) => rmSync(photoOf(work)), expected: /missing/i },
      {
        name: "photo file replaced by hand",
        set: (work) => writeFileSync(photoOf(work), "other bytes"),
        expected: /does not match the photo list/i,
      },
      {
        name: "photo is a link",
        set: (work) => {
          const path = photoOf(work);
          renameSync(path, join(work, "elsewhere.jpg"));
          symlinkSync(join(work, "elsewhere.jpg"), path);
        },
        expected: /symlink/i,
      },
      {
        name: "record is a link",
        set: (work) => {
          renameSync(recordOf(work), join(work, "elsewhere.json"));
          symlinkSync(join(work, "elsewhere.json"), recordOf(work));
        },
        expected: /symlink/i,
      },
      {
        name: "digest file is damaged",
        set: (work) => writeFileSync(join(work, "final", CHECKED_DIGESTS_FILE), "{ bad"),
        expected: new RegExp(CHECKED_DIGESTS_FILE.replace(".", "\\.")),
      },
    ];
    for (const c of before) {
      const { repo, work } = setUpWork(makeFinalPage());
      c.set(work);
      const start = snapshotFiles(work);
      expect(() => check(work, repo), c.name).toThrow(c.expected);
      expect(snapshotFiles(work), c.name).toEqual(start);
    }
  });

  // The command in a process of its own. A reader that waits for a writer of a pipe is killed.
  async function runCheckCommand(work: string, flags: string[]): Promise<{ killed: boolean; stderr: string }> {
    try {
      await promisify(execFile)(
        process.execPath,
        ["scripts/reference-check.mjs", "--work", work, "--page", "sample:M:3a", ...flags],
        { timeout: 45_000, killSignal: "SIGKILL" },
      );
      return { killed: false, stderr: "" };
    } catch (err) {
      const { killed, stderr } = err as { killed: boolean; stderr: string };
      return { killed, stderr };
    }
  }

  it("refuses a link, a folder or a pipe in the place of any file that it reads or writes, and writes nothing", async () => {
    const files = [
      "final/status.json",
      "final/sample-M-3a.json",
      "final/report.json",
      `final/${CHECKED_DIGESTS_FILE}`,
      "final-view/sample-M-3a.md",
      "photos/photos-manifest.json",
      "photos/PHOTO",
    ];
    const kinds: Array<[string, (path: string, away: string) => void]> = [
      [
        "link",
        (path, away) => {
          renameSync(path, away);
          symlinkSync(away, path);
        },
      ],
      [
        "link to nothing",
        (path, away) => {
          rmSync(path);
          symlinkSync(away, path);
        },
      ],
      [
        "folder",
        (path) => {
          rmSync(path);
          mkdirSync(path);
        },
      ],
    ];
    const setUpChecked = () => {
      const { repo, work } = setUpWork(makeFinalPage());
      const photo = addPreparedPhoto(work, "photo 3a", "sample:M:3a");
      writeFileSync(join(work, "final", "report.json"), JSON.stringify({ pages: [] }));
      check(work, repo);
      // A new check would write each file again with other bytes.
      writeFileSync(
        join(work, "final", "sample-M-3a.json"),
        JSON.stringify({ ...makeFinalPage(), topic: { title: "Corrected by a person" } }),
      );
      writeFileSync(join(work, "final", "status.json"), JSON.stringify({ "sample:M:3a": "machine_read" }));
      return { repo, work, photo };
    };
    for (const file of files) {
      for (const [kind, change] of kinds) {
        const name = `${file} is a ${kind}`;
        const { repo, work, photo } = setUpChecked();
        change(join(work, file.replace("PHOTO", photo.file)), join(work, "away"));
        const start = snapshotFiles(work);
        expect(() => check(work, repo), name).toThrow(/symlink|non-regular/i);
        expect(snapshotFiles(work), name).toEqual(start);
        // Without --photo-compared the command names the photo: it reads the photo list and the report.
        if (!/manifest/.test(file) && !/report/.test(file)) continue;
        if (/report/.test(file)) rmSync(join(work, "photos"), { recursive: true });
        expect(
          () => checkAndMarkPage({ workDir: work, page: "sample:M:3a", repoRoot: repo, photoCompared: false }),
          name,
        ).toThrow(/symlink|non-regular/i);
      }
    }

    await Promise.all(
      files.flatMap((file) => {
        const hint = /manifest|report/.test(file) ? [[]] : [];
        return [["--photo-compared"], ...hint].map(async (flags) => {
          const name = `${file} is a pipe ${flags.join("")}`;
          const { work, photo } = setUpChecked();
          const path = join(work, file.replace("PHOTO", photo.file));
          rmSync(path);
          execFileSync("mkfifo", [path]);
          if (flags.length === 0 && /report/.test(file)) rmSync(join(work, "photos"), { recursive: true });
          const start = snapshotFiles(work);
          const { killed, stderr } = await runCheckCommand(work, flags);
          expect(killed, name).toBe(false);
          expect(stderr, name).toMatch(/non-regular/);
          expect(snapshotFiles(work), name).toEqual(start);
        });
      }),
    );

    for (const folder of ["final", "final-view", "photos"]) {
      const { repo, work } = setUpChecked();
      renameSync(join(work, folder), join(work, "away"));
      symlinkSync(join(work, "away"), join(work, folder));
      const start = snapshotFiles(work);
      expect(() => check(work, repo), `${folder} is a link`).toThrow(/not a plain folder/);
      expect(snapshotFiles(work), `${folder} is a link`).toEqual(start);
    }
    const { repo, work } = setUpChecked();
    rmSync(join(work, "final-view"), { recursive: true });
    writeFileSync(join(work, "final-view"), "a file");
    const start = snapshotFiles(work);
    expect(() => check(work, repo)).toThrow(/not a plain folder/);
    expect(snapshotFiles(work)).toEqual(start);
  }, 90_000);

  it("is not checked when the command stops at any write, and stays as before when nothing changed", () => {
    const REF = "sample:M:3a";
    const steps = ["sample-M-3a.json", "sample-M-3a.md", CHECKED_DIGESTS_FILE, "status.json"];
    // The page is already human_checked: the digests are the write that makes the new check count.
    const recheckSteps = steps.slice(0, 3);
    const rows: Array<{ name: string; steps: string[]; setUp: (work: string, repo: string) => void; after: string }> = [
      { name: "first check", steps, setUp: () => {}, after: "machine_read" },
      {
        name: "first check of a record that the person corrected",
        steps,
        setUp: (work) =>
          writeFileSync(
            join(work, "final", "sample-M-3a.json"),
            JSON.stringify({ ...makeFinalPage(), topic: { title: "Corrected by a person" } }),
          ),
        after: "machine_read",
      },
      { name: "checked page, nothing changed", steps: recheckSteps, setUp: check, after: "human_checked" },
      {
        name: "checked page, view lost",
        steps: recheckSteps,
        setUp: (work, repo) => {
          check(work, repo);
          rmSync(join(work, "final-view", "sample-M-3a.md"));
        },
        after: "human_checked",
      },
      {
        name: "checked page, record changed",
        steps: recheckSteps,
        setUp: (work, repo) => {
          check(work, repo);
          const path = join(work, "final", "sample-M-3a.json");
          writeFileSync(path, readFileSync(path, "utf8").replace("Adding Numbers", "Corrected later"));
        },
        after: "machine_read",
      },
      {
        name: "checked page, new photo",
        steps: recheckSteps,
        setUp: (work, repo) => {
          check(work, repo);
          rmSync(join(work, "photos"), { recursive: true });
          addPreparedPhoto(work, "new photo 3a", REF);
        },
        after: "machine_read",
      },
      {
        name: "checked page, record changed, after compare",
        steps,
        setUp: (work, repo) => {
          check(work, repo);
          const path = join(work, "final", "sample-M-3a.json");
          writeFileSync(path, readFileSync(path, "utf8").replace("Adding Numbers", "Corrected later"));
          compareWorkFolder({ workDir: work, repoRoot: repo });
        },
        after: "machine_read",
      },
    ];
    for (const row of rows) {
      for (const stopAt of [...row.steps, null]) {
        const label = `${row.name}, stop at ${stopAt}`;
        const { repo, work, finalDir } = setUpWork(makeFinalPage());
        // The readers read the same page, so that compare keeps a page that is not checked.
        for (const [slot, family] of [["a", "codex"], ["b", "claude"]]) {
          const dir = join(work, `reader-${slot}`);
          mkdirSync(dir);
          writeFileSync(join(dir, "reader.json"), JSON.stringify({ family, model: "m1" }));
          writeFileSync(join(dir, "sample-M-3a.json"), JSON.stringify(makeFinalPage()));
        }
        row.setUp(work, repo);
        const recordPath = join(finalDir, "sample-M-3a.json");
        const viewPath = join(work, "final-view", "sample-M-3a.md");
        const order: string[] = [];
        fsHook.rename = (to) => {
          const name = to.split("/").at(-1) ?? "";
          order.push(name);
          if (name === stopAt) throw new Error("stopped");
        };
        if (stopAt) expect(() => check(work, repo), label).toThrow("stopped");
        else check(work, repo);
        fsHook.rename = null;
        expect(order, label).toEqual(stopAt ? row.steps.slice(0, row.steps.indexOf(stopAt) + 1) : row.steps);

        const viewNow = existsSync(viewPath) ? readFileSync(viewPath, "utf8") : null;
        compareWorkFolder({ workDir: work, repoRoot: repo });
        const status = JSON.parse(readFileSync(join(finalDir, "status.json"), "utf8")) as Record<string, string>;
        expect(status[REF], label).toBe(stopAt ? row.after : "human_checked");
        // A check that is complete has the view of its record.
        if (stopAt === null) {
          const { title } = (JSON.parse(readFileSync(recordPath, "utf8")) as PageRecord).topic;
          expect(viewNow, label).toContain(title as string);
        }
      }
    }
  });
});
