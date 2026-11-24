import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { PageRecord } from "@/lib/reference-record";
import { checkAndMarkPage } from "./check";

const tempDirs: string[] = [];

afterEach(() => {
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

  function setUpWork(page: PageRecord): { repo: string; work: string; finalDir: string } {
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
    return { repo, work, finalDir };
  }

  function expectNothingWritten(finalDir: string, recordBefore: string): void {
    expect(readFileSync(join(finalDir, "sample-M-3a.json"), "utf8")).toBe(recordBefore);
    const status = JSON.parse(readFileSync(join(finalDir, "status.json"), "utf8"));
    expect(status["sample:M:3a"]).toBe("machine_read");
  }

  it("refuses without --photo-compared, names the photo of the page, and writes nothing", () => {
    const { repo, work, finalDir } = setUpWork(makeFinalPage());
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

    checkAndMarkPage({ workDir: work, page: "sample:M:3a", repoRoot: repo, photoCompared: true });
    const saved = JSON.parse(readFileSync(join(finalDir, "sample-M-3a.json"), "utf8"));
    expect(saved.sections[0].items[0].responses[0].answer).toBe("4 R1");
    expect(saved.sections[0].items[0].responses[0].answer_source).toBe("computed");
    expect(saved.sections[0].items[0].responses[1].answer).toBeNull();
    expect(saved.sections[0].items[0].responses[1].answer_source).toBe("unchecked");
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
  });
});
