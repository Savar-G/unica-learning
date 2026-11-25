import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ContentsRecord, PageRecord } from "@/lib/reference-record";
import { checkAndMarkPage } from "./check";
import { compareWorkFolder } from "./compare-batch";
import { persistSlotResult } from "./extract-state";
import { addPreparedPhoto, fakePhoto } from "./photo.fixtures";
import { readPhoto } from "./read";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function makePage(overrides?: Partial<PageRecord>): PageRecord {
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
            printed: "12 + 5 =",
            form: "horizontal",
            expr: { kind: "arith", op: "add", operands: [12, 5] },
            responses: [
              { position: "after_equals", cue: null, answer: "17", answer_source: "computed" },
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
    readers: ["claude:test"],
    ...overrides,
  };
}

const SHA_1 = fakePhoto("1").sha256;
const SHA_2 = fakePhoto("2").sha256;
const SHA_3 = fakePhoto("3").sha256;

describe("compareWorkFolder", () => {
  it("writes final records, status.json, report.json, report.md, and final-view markdown when paired by photo_sha256", () => {
    const repo = mkdtempSync(join(tmpdir(), "ref-cmp-repo-"));
    const work = mkdtempSync(join(tmpdir(), "ref-cmp-work-"));
    tempDirs.push(repo, work);

    const dirA = join(work, "reader-a");
    const dirB = join(work, "reader-b");
    mkdirSync(dirA, { recursive: true });
    mkdirSync(dirB, { recursive: true });

    const page1A = makePage({ source_ref: "sample:M:3a" });
    const page1B = makePage({ source_ref: "sample:M:3a" });
    const page2A = makePage({
      source_ref: "sample:M:4a",
      examples: [
        {
          position: "top",
          relation: "compare",
          parts: [{ form: "horizontal", expr: { kind: "arith", op: "add", operands: [1, 2] } }],
        },
      ],
    });

    writeFileSync(join(dirA, "reader.json"), JSON.stringify({ family: "claude", model: "c1" }));
    writeFileSync(join(dirB, "reader.json"), JSON.stringify({ family: "codex", model: "x1" }));
    writeFileSync(join(dirA, "sample-M-3a.json"), JSON.stringify(page1A, null, 2));
    writeFileSync(join(dirA, "sample-M-4a.json"), JSON.stringify(page2A, null, 2));
    writeFileSync(join(dirB, "sample-M-3a.json"), JSON.stringify(page1B, null, 2));

    writeFileSync(
      join(dirA, "run.json"),
      JSON.stringify({
        slot: "a",
        reader: { family: "claude", model: "c1" },
        source: "sample",
        photos: [
          { photo: "p-111111111111.jpg", photo_sha256: SHA_1, status: "ok", source_ref: "sample:M:3a", record_file: "sample-M-3a.json", notes: [] },
          { photo: "p-222222222222.jpg", photo_sha256: SHA_2, status: "ok", source_ref: "sample:M:4a", record_file: "sample-M-4a.json", notes: [] },
        ],
      }),
    );
    writeFileSync(
      join(dirB, "run.json"),
      JSON.stringify({
        slot: "b",
        reader: { family: "codex", model: "x1" },
        source: "sample",
        photos: [
          { photo: "p-111111111111.jpg", photo_sha256: SHA_1, status: "ok", source_ref: "sample:M:3a", record_file: "sample-M-3a.json", notes: [] },
          { photo: "p-222222222222.jpg", photo_sha256: SHA_2, status: "cli_error", reason: "timeout", notes: [] },
        ],
      }),
    );

    const report = compareWorkFolder({ workDir: work, repoRoot: repo });
    expect(report.pages).toHaveLength(2);
    expect(report.failed_photos).toHaveLength(1);

    const finalDir = join(work, "final");
    const viewDir = join(work, "final-view");
    const jsonFiles = readdirSync(finalDir)
      .filter((f) => f.endsWith(".json"))
      .sort();
    expect(jsonFiles).toEqual([
      "report.json",
      "sample-M-3a.json",
      "sample-M-4a.json",
      "status.json",
    ]);

    const status = JSON.parse(readFileSync(join(finalDir, "status.json"), "utf8"));
    expect(status).toEqual({
      "sample:M:3a": "double_read",
      "sample:M:4a": "machine_read",
    });

    const md = readFileSync(join(finalDir, "report.md"), "utf8");
    expect(md).toContain("Has worked examples or prose");
    expect(md).not.toContain("A person must read");
    expect(md).toContain("sample:M:3a");
    expect(md).toContain("sample:M:4a");
    expect(md).toContain("p-222222222222.jpg");

    expect(existsSync(join(viewDir, "sample-M-3a.md"))).toBe(true);
    expect(existsSync(join(viewDir, "sample-M-4a.md"))).toBe(true);
    expect(statSync(join(finalDir, "status.json")).mode & 0o777).toBe(0o600);
  });

  it("refuses double_read when two readings share a filename and source_ref but came from different photo digests", () => {
    const repo = mkdtempSync(join(tmpdir(), "ref-cmp-dig-repo-"));
    const work = mkdtempSync(join(tmpdir(), "ref-cmp-dig-work-"));
    tempDirs.push(repo, work);

    const dirA = join(work, "reader-a");
    const dirB = join(work, "reader-b");
    mkdirSync(dirA, { recursive: true });
    mkdirSync(dirB, { recursive: true });

    const page = makePage({ source_ref: "sample:M:5a" });
    writeFileSync(join(dirA, "reader.json"), JSON.stringify({ family: "claude", model: "c1" }));
    writeFileSync(join(dirB, "reader.json"), JSON.stringify({ family: "codex", model: "x1" }));
    writeFileSync(join(dirA, "sample-M-5a.json"), JSON.stringify(page, null, 2));
    writeFileSync(join(dirB, "sample-M-5a.json"), JSON.stringify(page, null, 2));
    writeFileSync(
      join(dirA, "run.json"),
      JSON.stringify({
        slot: "a",
        reader: { family: "claude", model: "c1" },
        source: "sample",
        photos: [
          { photo: "same.jpg", photo_sha256: SHA_1, status: "ok", source_ref: "sample:M:5a", record_file: "sample-M-5a.json", notes: [] },
        ],
      }),
    );
    writeFileSync(
      join(dirB, "run.json"),
      JSON.stringify({
        slot: "b",
        reader: { family: "codex", model: "x1" },
        source: "sample",
        photos: [
          { photo: "same.jpg", photo_sha256: SHA_2, status: "ok", source_ref: "sample:M:5a", record_file: "sample-M-5a.json", notes: [] },
        ],
      }),
    );

    const report = compareWorkFolder({ workDir: work, repoRoot: repo });
    expect(report.pages).toHaveLength(1);
    expect(report.pages[0].status).toBe("machine_read");
    const status = JSON.parse(readFileSync(join(work, "final", "status.json"), "utf8"));
    expect(status["sample:M:5a"]).toBe("machine_read");
    const md = readFileSync(join(work, "final", "report.md"), "utf8");
    expect(md.toLowerCase()).toContain("digest");
  });

  it("detects when reader b reads a different sheet id for the same photo digest and detects example part order diffs", () => {
    const repo = mkdtempSync(join(tmpdir(), "ref-cmp2-repo-"));
    const work = mkdtempSync(join(tmpdir(), "ref-cmp2-work-"));
    tempDirs.push(repo, work);

    const dirA = join(work, "reader-a");
    const dirB = join(work, "reader-b");
    mkdirSync(dirA, { recursive: true });
    mkdirSync(dirB, { recursive: true });

    const pageA = makePage({
      source_ref: "sample:M:7a",
      examples: [
        {
          position: "top",
          relation: "compare",
          parts: [
            { form: "horizontal", expr: { kind: "arith", op: "add", operands: [1, 2] }, shown_answer: "3" },
            { form: "vertical", expr: { kind: "arith", op: "add", operands: [1, 2] }, shown_answer: "3" },
          ],
        },
      ],
    });
    const pageB = makePage({
      source_ref: "sample:M:7b",
      examples: [
        {
          position: "top",
          relation: "compare",
          parts: [
            { form: "vertical", expr: { kind: "arith", op: "add", operands: [1, 2] }, shown_answer: "3" },
            { form: "horizontal", expr: { kind: "arith", op: "add", operands: [1, 2] }, shown_answer: "3" },
          ],
        },
      ],
    });

    writeFileSync(join(dirA, "reader.json"), JSON.stringify({ family: "claude", model: "c1" }));
    writeFileSync(join(dirB, "reader.json"), JSON.stringify({ family: "codex", model: "x1" }));
    writeFileSync(join(dirA, "sample-M-7a.json"), JSON.stringify(pageA, null, 2));
    writeFileSync(join(dirB, "sample-M-7b.json"), JSON.stringify(pageB, null, 2));
    writeFileSync(
      join(dirA, "run.json"),
      JSON.stringify({
        slot: "a",
        reader: { family: "claude", model: "c1" },
        source: "sample",
        photos: [
          { photo: "p-777777777777.jpg", photo_sha256: SHA_3, status: "ok", source_ref: "sample:M:7a", record_file: "sample-M-7a.json", notes: [] },
        ],
      }),
    );
    writeFileSync(
      join(dirB, "run.json"),
      JSON.stringify({
        slot: "b",
        reader: { family: "codex", model: "x1" },
        source: "sample",
        photos: [
          { photo: "p-777777777777.jpg", photo_sha256: SHA_3, status: "ok", source_ref: "sample:M:7b", record_file: "sample-M-7b.json", notes: [] },
        ],
      }),
    );

    const report = compareWorkFolder({ workDir: work, repoRoot: repo });
    expect(report.pages).toHaveLength(1);
    expect(report.pages[0].status).toBe("machine_read");
    expect(report.pages[0].result_reason).toBe("readers disagree on the page");
    expect(report.pages[0].differences.some((d) => d.path === "source_ref")).toBe(true);
    expect(report.pages[0].differences.some((d) => d.path === "examples[0].parts[0].form")).toBe(
      true,
    );
    const saved7a = JSON.parse(readFileSync(join(work, "final", "sample-M-7a.json"), "utf8")) as PageRecord;
    expect(saved7a.single_read).toBeUndefined();
  });

  it("preserves human_checked pages on re-compare, notes reader differences from kept records, and prunes only stale non-human_checked pages", () => {
    const repo = mkdtempSync(join(tmpdir(), "ref-cmp3-repo-"));
    const work = mkdtempSync(join(tmpdir(), "ref-cmp3-work-"));
    tempDirs.push(repo, work);

    const dirA = join(work, "reader-a");
    const dirB = join(work, "reader-b");
    mkdirSync(dirA, { recursive: true });
    mkdirSync(dirB, { recursive: true });

    const page3a = makePage({ source_ref: "sample:M:3a" });
    const page4a = makePage({ source_ref: "sample:M:4a" });
    const page5a = makePage({ source_ref: "sample:M:5a" });

    writeFileSync(join(dirA, "reader.json"), JSON.stringify({ family: "claude", model: "c1" }));
    writeFileSync(join(dirB, "reader.json"), JSON.stringify({ family: "codex", model: "x1" }));
    writeFileSync(join(dirA, "sample-M-3a.json"), JSON.stringify(page3a, null, 2));
    writeFileSync(join(dirB, "sample-M-3a.json"), JSON.stringify(page3a, null, 2));
    writeFileSync(join(dirA, "sample-M-4a.json"), JSON.stringify(page4a, null, 2));
    writeFileSync(join(dirB, "sample-M-4a.json"), JSON.stringify(page4a, null, 2));
    writeFileSync(join(dirA, "sample-M-5a.json"), JSON.stringify(page5a, null, 2));
    writeFileSync(join(dirB, "sample-M-5a.json"), JSON.stringify(page5a, null, 2));
    writeFileSync(
      join(dirA, "run.json"),
      JSON.stringify({
        slot: "a",
        reader: { family: "claude", model: "c1" },
        source: "sample",
        photos: [
          { photo: "p-1.jpg", photo_sha256: SHA_1, status: "ok", source_ref: "sample:M:3a", record_file: "sample-M-3a.json", notes: [] },
          { photo: "p-2.jpg", photo_sha256: SHA_2, status: "ok", source_ref: "sample:M:4a", record_file: "sample-M-4a.json", notes: [] },
          { photo: "p-3.jpg", photo_sha256: SHA_3, status: "ok", source_ref: "sample:M:5a", record_file: "sample-M-5a.json", notes: [] },
        ],
      }),
    );
    writeFileSync(
      join(dirB, "run.json"),
      JSON.stringify({
        slot: "b",
        reader: { family: "codex", model: "x1" },
        source: "sample",
        photos: [
          { photo: "p-1.jpg", photo_sha256: SHA_1, status: "ok", source_ref: "sample:M:3a", record_file: "sample-M-3a.json", notes: [] },
          { photo: "p-2.jpg", photo_sha256: SHA_2, status: "ok", source_ref: "sample:M:4a", record_file: "sample-M-4a.json", notes: [] },
          { photo: "p-3.jpg", photo_sha256: SHA_3, status: "ok", source_ref: "sample:M:5a", record_file: "sample-M-5a.json", notes: [] },
        ],
      }),
    );

    for (const label of ["1", "2", "3"]) addPreparedPhoto(work, label);
    compareWorkFolder({ workDir: work, repoRoot: repo });

    // Hand-edit 3a (stays in next batch) and 4a (becomes stale in next batch), mark both human_checked.
    // Leave 5a as double_read (becomes stale in next batch -> should be removed).
    const edited3a = makePage({
      source_ref: "sample:M:3a",
      topic: { title: "Hand Corrected Title", number: 1 },
    });
    writeFileSync(join(work, "final", "sample-M-3a.json"), JSON.stringify(edited3a, null, 2));
    checkAndMarkPage({ workDir: work, page: "sample:M:3a", repoRoot: repo, photoCompared: true });
    checkAndMarkPage({ workDir: work, page: "sample:M:4a", repoRoot: repo, photoCompared: true });

    // Next batch contains ONLY 3a (with original unedited reader output) and a new 6a.
    const page6a = makePage({ source_ref: "sample:M:6a" });
    rmSync(join(dirA, "sample-M-4a.json"));
    rmSync(join(dirB, "sample-M-4a.json"));
    rmSync(join(dirA, "sample-M-5a.json"));
    rmSync(join(dirB, "sample-M-5a.json"));
    writeFileSync(join(dirA, "sample-M-6a.json"), JSON.stringify(page6a, null, 2));
    writeFileSync(join(dirB, "sample-M-6a.json"), JSON.stringify(page6a, null, 2));
    writeFileSync(
      join(dirA, "run.json"),
      JSON.stringify({
        slot: "a",
        reader: { family: "claude", model: "c1" },
        source: "sample",
        photos: [
          { photo: "p-1.jpg", photo_sha256: SHA_1, status: "ok", source_ref: "sample:M:3a", record_file: "sample-M-3a.json", notes: [] },
          { photo: "p-4.jpg", photo_sha256: "4".repeat(64), status: "ok", source_ref: "sample:M:6a", record_file: "sample-M-6a.json", notes: [] },
        ],
      }),
    );
    writeFileSync(
      join(dirB, "run.json"),
      JSON.stringify({
        slot: "b",
        reader: { family: "codex", model: "x1" },
        source: "sample",
        photos: [
          { photo: "p-1.jpg", photo_sha256: SHA_1, status: "ok", source_ref: "sample:M:3a", record_file: "sample-M-3a.json", notes: [] },
          { photo: "p-4.jpg", photo_sha256: "4".repeat(64), status: "ok", source_ref: "sample:M:6a", record_file: "sample-M-6a.json", notes: [] },
        ],
      }),
    );

    compareWorkFolder({ workDir: work, repoRoot: repo });

    // 3a kept hand-edited content and human_checked status
    const kept3a = JSON.parse(readFileSync(join(work, "final", "sample-M-3a.json"), "utf8"));
    expect(kept3a.topic.title).toBe("Hand Corrected Title");

    // 4a (stale human_checked) is kept
    expect(existsSync(join(work, "final", "sample-M-4a.json"))).toBe(true);
    expect(existsSync(join(work, "final-view", "sample-M-4a.md"))).toBe(true);

    // 5a (stale non-human_checked) is removed with its view and status entry
    expect(existsSync(join(work, "final", "sample-M-5a.json"))).toBe(false);
    expect(existsSync(join(work, "final-view", "sample-M-5a.md"))).toBe(false);

    const finalStatus = JSON.parse(readFileSync(join(work, "final", "status.json"), "utf8"));
    expect(finalStatus).toEqual({
      "sample:M:3a": "human_checked",
      "sample:M:4a": "human_checked",
      "sample:M:6a": "double_read",
    });

    const md = readFileSync(join(work, "final", "report.md"), "utf8");
    expect(md).toContain("Kept: checked by a person");
    expect(md).toContain("sample:M:3a");
    expect(md).toContain("sample:M:4a");
    expect(md).toContain("sample:M:5a");
  });

  it("refuses to write when two different source_ref values map to the same filename or collide with an existing human_checked record", () => {
    const repo = mkdtempSync(join(tmpdir(), "ref-cmp-col-repo-"));
    const work = mkdtempSync(join(tmpdir(), "ref-cmp-col-work-"));
    tempDirs.push(repo, work);

    const finalDir = join(work, "final");
    const dirA = join(work, "reader-a");
    const dirB = join(work, "reader-b");
    mkdirSync(finalDir, { recursive: true });
    mkdirSync(dirA, { recursive: true });
    mkdirSync(dirB, { recursive: true });

    // Existing human_checked record for demo-x:M:3a stored in demo-x-M-3a.json
    const checkedRecord = makePage({
      source_ref: "demo-x:M:3a",
      topic: { title: "Checked Record Must Survive", number: 1 },
    });
    writeFileSync(join(finalDir, "demo-x-M-3a.json"), JSON.stringify(checkedRecord, null, 2));
    writeFileSync(
      join(finalDir, "status.json"),
      JSON.stringify({ "demo-x:M:3a": "human_checked" }, null, 2),
    );

    // Incoming batch has colliding source_ref demo:x-M:3a -> also maps to demo-x-M-3a.json!
    const collidingPage = makePage({
      source_ref: "demo:x-M:3a",
      topic: { title: "Colliding New Record", number: 2 },
    });
    writeFileSync(join(dirA, "reader.json"), JSON.stringify({ family: "claude", model: "c1" }));
    writeFileSync(join(dirB, "reader.json"), JSON.stringify({ family: "codex", model: "x1" }));
    writeFileSync(join(dirA, "demo-x-M-3a.json"), JSON.stringify(collidingPage, null, 2));
    writeFileSync(join(dirB, "demo-x-M-3a.json"), JSON.stringify(collidingPage, null, 2));
    writeFileSync(
      join(dirA, "run.json"),
      JSON.stringify({
        slot: "a",
        reader: { family: "claude", model: "c1" },
        source: "demo",
        photos: [
          {
            photo: "p-111111111111.jpg",
            photo_sha256: SHA_1,
            status: "ok",
            source_ref: "demo:x-M:3a",
            record_file: "demo-x-M-3a.json",
            notes: [],
          },
        ],
      }),
    );
    writeFileSync(
      join(dirB, "run.json"),
      JSON.stringify({
        slot: "b",
        reader: { family: "codex", model: "x1" },
        source: "demo",
        photos: [
          {
            photo: "p-111111111111.jpg",
            photo_sha256: SHA_1,
            status: "ok",
            source_ref: "demo:x-M:3a",
            record_file: "demo-x-M-3a.json",
            notes: [],
          },
        ],
      }),
    );

    expect(() => compareWorkFolder({ workDir: work, repoRoot: repo })).toThrow(/collid|source_ref|map to/i);

    // The human_checked file on disk MUST remain completely untouched!
    const preserved = JSON.parse(readFileSync(join(finalDir, "demo-x-M-3a.json"), "utf8"));
    expect(preserved.source_ref).toBe("demo-x:M:3a");
    expect(preserved.topic.title).toBe("Checked Record Must Survive");

    // Also refuse when two different source_ref values in the same batch collide on one filename
    const work2 = mkdtempSync(join(tmpdir(), "ref-cmp-col2-work-"));
    tempDirs.push(work2);
    const d2A = join(work2, "reader-a");
    mkdirSync(d2A, { recursive: true });
    writeFileSync(join(d2A, "reader.json"), JSON.stringify({ family: "claude", model: "c1" }));
    writeFileSync(join(d2A, "rec1.json"), JSON.stringify(makePage({ source_ref: "demo-x:M:3a" }), null, 2));
    writeFileSync(join(d2A, "rec2.json"), JSON.stringify(makePage({ source_ref: "demo:x-M:3a" }), null, 2));
    writeFileSync(
      join(d2A, "run.json"),
      JSON.stringify({
        slot: "a",
        reader: { family: "claude", model: "c1" },
        source: "demo",
        photos: [
          { photo: "p-111111111111.jpg", photo_sha256: SHA_1, status: "ok", source_ref: "demo-x:M:3a", record_file: "rec1.json", notes: [] },
          { photo: "p-222222222222.jpg", photo_sha256: SHA_2, status: "ok", source_ref: "demo:x-M:3a", record_file: "rec2.json", notes: [] },
        ],
      }),
    );
    expect(() => compareWorkFolder({ workDir: work2, repoRoot: repo })).toThrow(/collid|map to/i);
  });

  it("compares every valid reading file in reader-a and reader-b even when run.json only lists a subset", () => {
    const repo = mkdtempSync(join(tmpdir(), "ref-cmp-all-repo-"));
    const work = mkdtempSync(join(tmpdir(), "ref-cmp-all-work-"));
    tempDirs.push(repo, work);

    const dirA = join(work, "reader-a");
    const dirB = join(work, "reader-b");
    mkdirSync(dirA, { recursive: true });
    mkdirSync(dirB, { recursive: true });

    const page3a = makePage({ source_ref: "sample:M:3a" });
    const page4a = makePage({ source_ref: "sample:M:4a" });

    writeFileSync(join(dirA, "reader.json"), JSON.stringify({ family: "claude", model: "c1" }));
    writeFileSync(join(dirB, "reader.json"), JSON.stringify({ family: "codex", model: "x1" }));
    writeFileSync(join(dirA, "sample-M-3a.json"), JSON.stringify(page3a, null, 2));
    writeFileSync(join(dirB, "sample-M-3a.json"), JSON.stringify(page3a, null, 2));
    writeFileSync(join(dirA, "sample-M-4a.json"), JSON.stringify(page4a, null, 2));
    writeFileSync(join(dirB, "sample-M-4a.json"), JSON.stringify(page4a, null, 2));

    // run.json only lists 3a, while 4a files also exist in reader-a and reader-b
    writeFileSync(
      join(dirA, "run.json"),
      JSON.stringify({
        slot: "a",
        reader: { family: "claude", model: "c1" },
        source: "sample",
        photos: [
          { photo: "111111111111.jpg", photo_sha256: SHA_1, status: "ok", source_ref: "sample:M:3a", record_file: "sample-M-3a.json", notes: [] },
        ],
      }),
    );
    writeFileSync(
      join(dirB, "run.json"),
      JSON.stringify({
        slot: "b",
        reader: { family: "codex", model: "x1" },
        source: "sample",
        photos: [
          { photo: "111111111111.jpg", photo_sha256: SHA_1, status: "ok", source_ref: "sample:M:3a", record_file: "sample-M-3a.json", notes: [] },
        ],
      }),
    );

    const report = compareWorkFolder({ workDir: work, repoRoot: repo });
    expect(report.pages.map((p) => p.source_ref).sort()).toEqual(["sample:M:3a", "sample:M:4a"]);
    expect(existsSync(join(work, "final", "sample-M-4a.json"))).toBe(true);
  });

  it("never throws when two photos claim the same source_ref: picks the double-agreeing photo (or first by original name), lists losers, clears loser manifest source_ref, and writes a report", () => {
    const repo = mkdtempSync(join(tmpdir(), "ref-cmp-sameid-repo-"));
    const work = mkdtempSync(join(tmpdir(), "ref-cmp-sameid-work-"));
    tempDirs.push(repo, work);

    const dirA = join(work, "reader-a");
    const dirB = join(work, "reader-b");
    const photosDir = join(work, "photos");
    mkdirSync(dirA, { recursive: true });
    mkdirSync(dirB, { recursive: true });
    mkdirSync(photosDir, { recursive: true });

    const page3aPhoto1 = makePage({ source_ref: "sample:M:3a", topic: { title: "Photo 1 A", number: 1 } });
    const page4aPhoto1 = makePage({ source_ref: "sample:M:4a", topic: { title: "Photo 1 B", number: 1 } });
    const page3aPhoto2 = makePage({ source_ref: "sample:M:3a", topic: { title: "Photo 2 Both", number: 1 } });
    const page3aPhoto3 = makePage({ source_ref: "sample:M:3a", topic: { title: "Photo 3 Both", number: 1 } });

    writeFileSync(join(dirA, "reader.json"), JSON.stringify({ family: "codex", model: "x1" }));
    writeFileSync(join(dirB, "reader.json"), JSON.stringify({ family: "claude", model: "c1" }));
    writeFileSync(join(dirA, "sample-M-3a.json"), JSON.stringify(page3aPhoto1, null, 2));
    writeFileSync(join(dirB, "sample-M-4a.json"), JSON.stringify(page4aPhoto1, null, 2));
    writeFileSync(join(dirA, `sample-M-3a-${SHA_2.slice(0, 12)}.json`), JSON.stringify(page3aPhoto2, null, 2));
    writeFileSync(join(dirB, "sample-M-3a.json"), JSON.stringify(page3aPhoto2, null, 2));
    writeFileSync(join(dirA, `sample-M-3a-${SHA_3.slice(0, 12)}.json`), JSON.stringify(page3aPhoto3, null, 2));
    writeFileSync(join(dirB, `sample-M-3a-${SHA_3.slice(0, 12)}.json`), JSON.stringify(page3aPhoto3, null, 2));

    writeFileSync(
      join(photosDir, "photos-manifest.json"),
      JSON.stringify({
        version: 1,
        photos: [
          { file: `${SHA_1.slice(0, 12)}.jpg`, sha256: SHA_1, original_name: "01_mixed.jpg", width: 1600, height: 1200, source_ref: "sample:M:3a" },
          { file: `${SHA_2.slice(0, 12)}.jpg`, sha256: SHA_2, original_name: "02_first_both.jpg", width: 1600, height: 1200, source_ref: "sample:M:3a" },
          { file: `${SHA_3.slice(0, 12)}.jpg`, sha256: SHA_3, original_name: "03_second_both.jpg", width: 1600, height: 1200, source_ref: "sample:M:3a" },
        ],
      }),
    );

    writeFileSync(
      join(dirA, "run.json"),
      JSON.stringify({
        slot: "a",
        reader: { family: "codex", model: "x1" },
        source: "sample",
        photos: [
          { photo: `${SHA_1.slice(0, 12)}.jpg`, original_name: "01_mixed.jpg", photo_sha256: SHA_1, status: "ok", source_ref: "sample:M:3a", record_file: "sample-M-3a.json", notes: [] },
          { photo: `${SHA_2.slice(0, 12)}.jpg`, original_name: "02_first_both.jpg", photo_sha256: SHA_2, status: "ok", source_ref: "sample:M:3a", record_file: `sample-M-3a-${SHA_2.slice(0, 12)}.json`, notes: [] },
          { photo: `${SHA_3.slice(0, 12)}.jpg`, original_name: "03_second_both.jpg", photo_sha256: SHA_3, status: "ok", source_ref: "sample:M:3a", record_file: `sample-M-3a-${SHA_3.slice(0, 12)}.json`, notes: [] },
        ],
      }),
    );
    writeFileSync(
      join(dirB, "run.json"),
      JSON.stringify({
        slot: "b",
        reader: { family: "claude", model: "c1" },
        source: "sample",
        photos: [
          { photo: `${SHA_1.slice(0, 12)}.jpg`, original_name: "01_mixed.jpg", photo_sha256: SHA_1, status: "ok", source_ref: "sample:M:4a", record_file: "sample-M-4a.json", notes: [] },
          { photo: `${SHA_2.slice(0, 12)}.jpg`, original_name: "02_first_both.jpg", photo_sha256: SHA_2, status: "ok", source_ref: "sample:M:3a", record_file: "sample-M-3a.json", notes: [] },
          { photo: `${SHA_3.slice(0, 12)}.jpg`, original_name: "03_second_both.jpg", photo_sha256: SHA_3, status: "ok", source_ref: "sample:M:3a", record_file: `sample-M-3a-${SHA_3.slice(0, 12)}.json`, notes: [] },
        ],
      }),
    );

    const report = compareWorkFolder({ workDir: work, repoRoot: repo });
    // Photo 2 wins (both agree, first by original name among agreeing photos)
    expect(report.pages).toHaveLength(1);
    expect(report.pages[0].source_ref).toBe("sample:M:3a");
    expect(report.pages[0].original_name).toBe("02_first_both.jpg");
    expect(report.pages[0].status).toBe("double_read");

    const final3a = JSON.parse(readFileSync(join(work, "final", "sample-M-3a.json"), "utf8"));
    expect(final3a.topic.title).toBe("Photo 2 Both");
    expect(existsSync(join(work, "final", "sample-M-4a.json"))).toBe(false);

    // Losers keep their readings on disk and are reported under "Same page id for two photos"
    expect(existsSync(join(dirA, "sample-M-3a.json"))).toBe(true);
    expect(existsSync(join(dirB, "sample-M-4a.json"))).toBe(true);
    expect(existsSync(join(dirA, `sample-M-3a-${SHA_3.slice(0, 12)}.json`))).toBe(true);
    expect(report.same_page_id_conflicts).toHaveLength(2);
    expect(report.same_page_id_conflicts.map((c) => c.original_name).sort()).toEqual([
      "01_mixed.jpg",
      "03_second_both.jpg",
    ]);

    const md = readFileSync(join(work, "final", "report.md"), "utf8");
    expect(md).toContain("## Same page id for two photos");
    expect(md).toContain("01_mixed.jpg");
    expect(md).toContain("sample:M:3a");
    expect(md).toContain("sample:M:4a");
    expect(md).toContain("03_second_both.jpg");

    // Manifest has source_ref ONLY on the winner (Photo 2)
    const manifest = JSON.parse(readFileSync(join(photosDir, "photos-manifest.json"), "utf8"));
    const bySha = new Map(manifest.photos.map((p: { sha256: string; source_ref?: string }) => [p.sha256, p.source_ref]));
    expect(bySha.get(SHA_1)).toBeUndefined();
    expect(bySha.get(SHA_2)).toBe("sample:M:3a");
    expect(bySha.get(SHA_3)).toBeUndefined();
  });

  it("keeps a final record that a person changed, and a checked record that is not valid any more", () => {
    const repo = mkdtempSync(join(tmpdir(), "ref-cmp-edit-repo-"));
    const work = mkdtempSync(join(tmpdir(), "ref-cmp-edit-work-"));
    tempDirs.push(repo, work);
    const dirA = join(work, "reader-a");
    const dirB = join(work, "reader-b");
    mkdirSync(dirA, { recursive: true });
    mkdirSync(dirB, { recursive: true });
    const pages = [
      { sha: SHA_1, ref: "sample:M:3a", file: "sample-M-3a.json" },
      { sha: SHA_2, ref: "sample:M:4a", file: "sample-M-4a.json" },
    ];
    for (const [dir, slot, family] of [[dirA, "a", "claude"], [dirB, "b", "codex"]] as const) {
      writeFileSync(join(dir, "reader.json"), JSON.stringify({ family, model: "m1" }));
      for (const p of pages) {
        writeFileSync(join(dir, p.file), JSON.stringify(makePage({ source_ref: p.ref }), null, 2));
      }
      writeFileSync(
        join(dir, "run.json"),
        JSON.stringify({
          slot,
          reader: { family, model: "m1" },
          source: "sample",
          photos: pages.map((p) => ({
            photo: `${p.sha.slice(0, 12)}.jpg`,
            photo_sha256: p.sha,
            status: "ok",
            source_ref: p.ref,
            record_file: p.file,
            notes: [],
          })),
        }),
      );
    }
    for (const label of ["1", "2"]) addPreparedPhoto(work, label);
    const first = compareWorkFolder({ workDir: work, repoRoot: repo });
    expect(first.pages.map((p) => p.status)).toEqual(["double_read", "double_read"]);

    // A person corrects page 3a by hand and does not run the check yet.
    const edited = makePage({ source_ref: "sample:M:3a", topic: { title: "Corrected by hand", number: 1 } });
    const editedText = JSON.stringify(edited, null, 2);
    writeFileSync(join(work, "final", "sample-M-3a.json"), editedText);
    // A person checks page 4a, and a later edit leaves the file broken.
    checkAndMarkPage({ workDir: work, page: "sample:M:4a", repoRoot: repo, photoCompared: true });
    writeFileSync(join(work, "final", "sample-M-4a.json"), "{ not json");

    for (const round of [1, 2]) {
      const again = compareWorkFolder({ workDir: work, repoRoot: repo });
      expect(readFileSync(join(work, "final", "sample-M-3a.json"), "utf8"), `round ${round}`).toBe(editedText);
      const page3a = again.pages.find((p) => p.source_ref === "sample:M:3a");
      expect(page3a?.edited_by_person).toBe(true);
      expect(page3a?.status).toBe("machine_read");
      expect(readFileSync(join(work, "final", "sample-M-4a.json"), "utf8")).toBe("{ not json");
      expect(again.kept_human_checked.find((k) => k.source_ref === "sample:M:4a")?.invalid).toBe(true);
    }
    const status = JSON.parse(readFileSync(join(work, "final", "status.json"), "utf8")) as Record<string, string>;
    expect(status).toEqual({ "sample:M:3a": "machine_read", "sample:M:4a": "machine_read" });
    const reportMd = readFileSync(join(work, "final", "report.md"), "utf8");
    expect(reportMd).toContain("A person changed the final record");
    expect(reportMd).toContain("not a valid record now");

    // After the person checks 3a, the corrected record is the checked record.
    checkAndMarkPage({ workDir: work, page: "sample:M:3a", repoRoot: repo, photoCompared: true });
    const afterCheck = compareWorkFolder({ workDir: work, repoRoot: repo });
    expect(afterCheck.pages.find((p) => p.source_ref === "sample:M:3a")?.status).toBe("human_checked");
    expect(JSON.parse(readFileSync(join(work, "final", "sample-M-3a.json"), "utf8")).topic.title).toBe(
      "Corrected by hand",
    );
  });

  it("names both readers in the final record, locates once-read entries for copying, and blocks double_read on an empty answer place", () => {
    const repo = mkdtempSync(join(tmpdir(), "ref-cmp-both-repo-"));
    const work = mkdtempSync(join(tmpdir(), "ref-cmp-both-work-"));
    tempDirs.push(repo, work);
    const arrow = { kind: "arrow" as const, applies_to: [1], label: "carry" };
    const emptyAnswer = () =>
      makePage({
        source_ref: "sample:M:4a",
        sections: [
          {
            instruction: "Sample instruction.",
            scaffolds: [],
            items: [
              {
                n: 1,
                printed: "x + 2 = 5",
                form: "horizontal",
                expr: { kind: "notation", latex: "x + 2 = 5" },
                responses: [{ position: "box", cue: null, answer: null, answer_source: "unchecked" }],
              },
            ],
          },
        ],
      });
    const readings = {
      a: [
        { sha: SHA_1, rec: makePage({ readers: ["claude:c1"] }) },
        { sha: SHA_2, rec: { ...emptyAnswer(), readers: ["claude:c1"] } },
        { sha: SHA_3, rec: makePage({ source_ref: "sample:M:5a", readers: ["claude:c1"] }) },
      ],
      b: [
        {
          sha: SHA_1,
          rec: makePage({
            readers: ["codex:x1"],
            sections: [{ ...makePage().sections[0], scaffolds: [arrow] }],
          }),
        },
        { sha: SHA_2, rec: { ...emptyAnswer(), readers: ["codex:x1"] } },
      ],
    };
    for (const slot of ["a", "b"] as const) {
      const dir = join(work, `reader-${slot}`);
      mkdirSync(dir, { recursive: true });
      const family = slot === "a" ? "claude" : "codex";
      writeFileSync(join(dir, "reader.json"), JSON.stringify({ family, model: "m1" }));
      const photos = readings[slot].map(({ sha, rec }) => {
        const file = `${rec.source_ref.replace(/:/g, "-")}.json`;
        writeFileSync(join(dir, file), JSON.stringify(rec, null, 2));
        return { photo: `${sha.slice(0, 12)}.jpg`, photo_sha256: sha, status: "ok", source_ref: rec.source_ref, record_file: file, notes: [] };
      });
      writeFileSync(join(dir, "run.json"), JSON.stringify({ slot, reader: { family, model: "m1" }, source: "sample", photos }));
    }

    for (const label of ["1", "2"]) addPreparedPhoto(work, label);
    const report = compareWorkFolder({ workDir: work, repoRoot: repo });
    const finalOf = (slug: string) => JSON.parse(readFileSync(join(work, "final", `${slug}.json`), "utf8")) as PageRecord;

    const page3a = report.pages.find((p) => p.source_ref === "sample:M:3a");
    expect(finalOf("sample-M-3a").readers).toEqual(["claude:c1", "codex:x1"]);
    expect(finalOf("sample-M-3a").sections[0].scaffolds).toEqual([]);
    expect(page3a?.status).toBe("agreement_accepted");
    expect(page3a?.once_read).toEqual([
      { path: "sections[0].scaffolds[b:0]", a: null, b: arrow, kind: "once_read", reader: "b", final_path: "sections[0].scaffolds[]" },
    ]);

    const page4a = report.pages.find((p) => p.source_ref === "sample:M:4a");
    expect(page4a?.differences).toEqual([]);
    expect(page4a?.empty_answer).toEqual([
      { path: "sections[0].items[n=1].responses[0]", a: null, b: null, kind: "empty_answer" },
    ]);
    expect(page4a?.status).toBe("machine_read");

    expect(finalOf("sample-M-5a").readers).toEqual(["claude:c1"]);

    const saved = JSON.parse(readFileSync(join(work, "final", "report.json"), "utf8")) as typeof report;
    expect(saved.pages.find((p) => p.source_ref === "sample:M:4a")?.empty_answer).toHaveLength(1);
    const md = readFileSync(join(work, "final", "report.md"), "utf8");
    expect(md).toContain("only reader b; location in final record `sections[0].scaffolds[]`");
    expect(md).not.toContain("look at the photo; copy an entry");
    expect(md).toContain("Answer places with no answer");
    expect(md).toContain("`sections[0].items[n=1].responses[0]`");
    // A person edits the final record of 3a: kept records never carry final_path or insert_before.
    const edited = finalOf("sample-M-3a");
    edited.sections[0].scaffolds = [{ kind: "caption", applies_to: "all", text: "Sample caption" }, arrow];
    writeFileSync(join(work, "final", "sample-M-3a.json"), JSON.stringify(edited, null, 2));
    const withCopy = compareWorkFolder({ workDir: work, repoRoot: repo }).pages.find((p) => p.source_ref === "sample:M:3a");
    expect(withCopy?.edited_by_person).toBe(true);
    expect(withCopy?.once_read[0].reader).toBe("b");
    expect(withCopy?.once_read[0].final_path).toBeUndefined();
    expect(withCopy?.once_read[0].insert_before).toBeUndefined();
    expect(readFileSync(join(work, "final", "report.md"), "utf8")).toContain("find the place in that record");
    edited.sections[0].scaffolds = [];
    writeFileSync(join(work, "final", "sample-M-3a.json"), JSON.stringify(edited, null, 2));
    const without = compareWorkFolder({ workDir: work, repoRoot: repo }).pages.find((p) => p.source_ref === "sample:M:3a");
    expect(without?.once_read[0].reader).toBe("b");
    expect(without?.once_read[0]).not.toHaveProperty("final_path");
    // Empty answer places follow the record that stays on disk.
    const page4aOf = () =>
      compareWorkFolder({ workDir: work, repoRoot: repo }).pages.find((p) => p.source_ref === "sample:M:4a");
    const record4a = finalOf("sample-M-4a");
    record4a.sections[0].items[0].responses[0] = { position: "box", cue: null, answer: "3", answer_source: "reader" };
    writeFileSync(join(work, "final", "sample-M-4a.json"), JSON.stringify(record4a, null, 2));
    const filled = page4aOf();
    expect(filled?.edited_by_person).toBe(true);
    expect(filled?.empty_answer).toEqual([]);
    expect(readFileSync(join(work, "final", "report.md"), "utf8")).toMatch(
      /\| sample:M:4a \| [^|]+ \| machine_read \| [^|]+ \| [^|]+ \| 0 \| 0 \| 0 \| 0 \|/,
    );

    checkAndMarkPage({ workDir: work, page: "sample:M:4a", repoRoot: repo, photoCompared: true });
    // The person clears the answer of the checked record: compare lists it, and check refuses.
    const cleared = finalOf("sample-M-4a");
    cleared.sections[0].items[0].responses[0] = { position: "box", cue: null, answer: null, answer_source: "unchecked" };
    writeFileSync(join(work, "final", "sample-M-4a.json"), JSON.stringify(cleared, null, 2));
    const afterClear = page4aOf();
    expect(afterClear?.status).toBe("machine_read");
    expect(afterClear?.check_problems).toEqual(["record changed after the check"]);
    expect(afterClear?.empty_answer?.map((d) => d.path)).toEqual(["sections[0].items[n=1].responses[0]"]);
    expect(() =>
      checkAndMarkPage({ workDir: work, page: "sample:M:4a", repoRoot: repo, photoCompared: true }),
    ).toThrow(/Answer places with no answer/);
  });

  it("writes computed answers into the final record, hashes the written bytes, and leaves kept records untouched", () => {
    const repo = mkdtempSync(join(tmpdir(), "ref-cmp-comp-repo-"));
    const work = mkdtempSync(join(tmpdir(), "ref-cmp-comp-work-"));
    tempDirs.push(repo, work);

    const makeNullWorkAreaPage = (sourceRef: string, readerTag: string): PageRecord =>
      makePage({
        source_ref: sourceRef,
        readers: [readerTag],
        sections: [
          {
            instruction: "Add the numbers.",
            scaffolds: [],
            items: [
              {
                n: 1,
                printed: "2 + 3",
                form: "horizontal",
                expr: { kind: "arith", op: "add", operands: [2, 3] },
                responses: [{ position: "work_area", cue: null, answer: null, answer_source: "unchecked" }],
              },
            ],
          },
        ],
      });

    for (const [slot, family, tag] of [
      ["a", "claude", "claude:c1"],
      ["b", "codex", "codex:x1"],
    ] as const) {
      const dir = join(work, `reader-${slot}`);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "reader.json"), JSON.stringify({ family, model: "m1" }));
      writeFileSync(join(dir, "sample-M-3a.json"), JSON.stringify(makeNullWorkAreaPage("sample:M:3a", tag), null, 2));
      writeFileSync(
        join(dir, "run.json"),
        JSON.stringify({
          slot,
          reader: { family, model: "m1" },
          source: "sample",
          photos: [
            {
              photo: `${SHA_1.slice(0, 12)}.jpg`,
              photo_sha256: SHA_1,
              status: "ok",
              source_ref: "sample:M:3a",
              record_file: "sample-M-3a.json",
              notes: [],
            },
          ],
        }),
      );
    }

    const report = compareWorkFolder({ workDir: work, repoRoot: repo });
    expect(report.pages).toHaveLength(1);
    expect(report.pages[0].status).toBe("double_read");
    expect(report.pages[0].empty_answer).toEqual([]);

    const finalPath = join(work, "final", "sample-M-3a.json");
    const writtenBytes = readFileSync(finalPath);
    const writtenRecord = JSON.parse(writtenBytes.toString("utf8")) as PageRecord;
    expect(writtenRecord.sections[0].items[0].responses).toEqual([
      { position: "work_area", cue: null, answer: "5", answer_source: "computed" },
    ]);
    expect(report.pages[0].final_record_sha256).toBe(
      createHash("sha256").update(writtenBytes).digest("hex"),
    );
    expect(readFileSync(join(work, "final-view", "sample-M-3a.md"), "utf8")).toContain("**5** (computed)");

    // Re-running compare recognizes its own written bytes and does not mark the file edited_by_person.
    const second = compareWorkFolder({ workDir: work, repoRoot: repo });
    expect(second.pages[0].edited_by_person).toBeUndefined();
    expect(second.pages[0].status).toBe("double_read");

    // A record edited by a person (even with null answer on a computable item) is never rewritten.
    const edited = makeNullWorkAreaPage("sample:M:3a", "claude:c1");
    const editedText = JSON.stringify(edited, null, 2);
    writeFileSync(finalPath, editedText);
    const afterEdit = compareWorkFolder({ workDir: work, repoRoot: repo });
    expect(afterEdit.pages[0].edited_by_person).toBe(true);
    expect(afterEdit.pages[0].status).toBe("machine_read");
    expect(readFileSync(finalPath, "utf8")).toBe(editedText);
  });

  it("adds computed-answer conflict notes from compare to reader_notes in report.json and report.md without duplicates", () => {
    const repo = mkdtempSync(join(tmpdir(), "ref-cmp-notes-repo-"));
    const work = mkdtempSync(join(tmpdir(), "ref-cmp-notes-work-"));
    tempDirs.push(repo, work);

    const expectedNote = 'sections[0].items[n=1].responses[0]: reader gave "6", computed "5"';
    const makeWrongWorkAreaPage = (sourceRef: string, readerTag: string): PageRecord =>
      makePage({
        source_ref: sourceRef,
        readers: [readerTag],
        sections: [
          {
            instruction: "Add the numbers.",
            scaffolds: [],
            items: [
              {
                n: 1,
                printed: "2 + 3",
                form: "horizontal",
                expr: { kind: "arith", op: "add", operands: [2, 3] },
                responses: [{ position: "work_area", cue: null, answer: "6", answer_source: "reader" }],
              },
            ],
          },
        ],
      });

    const dirA = join(work, "reader-a");
    const dirB = join(work, "reader-b");
    mkdirSync(dirA, { recursive: true });
    mkdirSync(dirB, { recursive: true });
    writeFileSync(join(dirA, "reader.json"), JSON.stringify({ family: "claude", model: "c1" }));
    writeFileSync(join(dirB, "reader.json"), JSON.stringify({ family: "codex", model: "x1" }));
    writeFileSync(join(dirA, "sample-M-3a.json"), JSON.stringify(makeWrongWorkAreaPage("sample:M:3a", "claude:c1"), null, 2));
    writeFileSync(join(dirB, "sample-M-3a.json"), JSON.stringify(makeWrongWorkAreaPage("sample:M:3a", "codex:x1"), null, 2));
    // Page 4a is only in reader B; its note must land on reader_notes.b.
    writeFileSync(join(dirB, "sample-M-4a.json"), JSON.stringify(makeWrongWorkAreaPage("sample:M:4a", "codex:x1"), null, 2));
    // Page 5a already carries the same note in reader A's run.json; compare must not add it twice.
    writeFileSync(join(dirA, "sample-M-5a.json"), JSON.stringify(makeWrongWorkAreaPage("sample:M:5a", "claude:c1"), null, 2));
    writeFileSync(join(dirB, "sample-M-5a.json"), JSON.stringify(makeWrongWorkAreaPage("sample:M:5a", "codex:x1"), null, 2));

    writeFileSync(
      join(dirA, "run.json"),
      JSON.stringify({
        slot: "a",
        reader: { family: "claude", model: "c1" },
        source: "sample",
        photos: [
          { photo: `${SHA_1.slice(0, 12)}.jpg`, photo_sha256: SHA_1, status: "ok", source_ref: "sample:M:3a", record_file: "sample-M-3a.json", notes: [] },
          { photo: `${SHA_3.slice(0, 12)}.jpg`, photo_sha256: SHA_3, status: "ok", source_ref: "sample:M:5a", record_file: "sample-M-5a.json", notes: [expectedNote] },
        ],
      }),
    );
    writeFileSync(
      join(dirB, "run.json"),
      JSON.stringify({
        slot: "b",
        reader: { family: "codex", model: "x1" },
        source: "sample",
        photos: [
          { photo: `${SHA_1.slice(0, 12)}.jpg`, photo_sha256: SHA_1, status: "ok", source_ref: "sample:M:3a", record_file: "sample-M-3a.json", notes: [] },
          { photo: `${SHA_2.slice(0, 12)}.jpg`, photo_sha256: SHA_2, status: "ok", source_ref: "sample:M:4a", record_file: "sample-M-4a.json", notes: [] },
          { photo: `${SHA_3.slice(0, 12)}.jpg`, photo_sha256: SHA_3, status: "ok", source_ref: "sample:M:5a", record_file: "sample-M-5a.json", notes: [] },
        ],
      }),
    );

    const first = compareWorkFolder({ workDir: work, repoRoot: repo });
    const final3a = JSON.parse(readFileSync(join(work, "final", "sample-M-3a.json"), "utf8")) as PageRecord;
    expect(final3a.sections[0].items[0].responses[0].answer).toBe("5");

    expect(first.pages.find((p) => p.source_ref === "sample:M:3a")?.reader_notes).toEqual({
      a: [expectedNote],
      b: [],
    });
    expect(first.pages.find((p) => p.source_ref === "sample:M:4a")?.reader_notes).toEqual({
      a: [],
      b: [expectedNote],
    });
    expect(first.pages.find((p) => p.source_ref === "sample:M:5a")?.reader_notes).toEqual({
      a: [expectedNote],
      b: [],
    });

    const savedReport = JSON.parse(readFileSync(join(work, "final", "report.json"), "utf8")) as typeof first;
    expect(savedReport.pages.find((p) => p.source_ref === "sample:M:3a")?.reader_notes.a).toEqual([expectedNote]);
    const md = readFileSync(join(work, "final", "report.md"), "utf8");
    expect(md).toContain(`- reader a: ${expectedNote}`);
    expect(md).toContain(`- reader b: ${expectedNote}`);

    // A second compare run does not add the note twice.
    const second = compareWorkFolder({ workDir: work, repoRoot: repo });
    expect(second.pages.find((p) => p.source_ref === "sample:M:3a")?.reader_notes.a).toEqual([expectedNote]);
    expect(second.pages.find((p) => p.source_ref === "sample:M:4a")?.reader_notes.b).toEqual([expectedNote]);
    expect(second.pages.find((p) => p.source_ref === "sample:M:5a")?.reader_notes.a).toEqual([expectedNote]);
  });

  it("accepts a page at 90%+ with single_read paths resolving to reader A's values, stops 89% and answer_differs pages, and writes pages_sent_to_person", () => {
    const repo = mkdtempSync(join(tmpdir(), "ref-cmp-agree-repo-"));
    const work = mkdtempSync(join(tmpdir(), "ref-cmp-agree-work-"));
    tempDirs.push(repo, work);

    const make100FieldPage = (sourceRef: string): PageRecord => ({
      ...makePage({ source_ref: sourceRef }),
      sections: [
        {
          instruction: "Add.",
          scaffolds: [{ kind: "number_strip", applies_to: "all", values: [1, 2, 3, 4] }],
          items: Array.from({ length: 10 }, (_, idx) => {
            const n = idx + 1;
            return {
              n,
              printed: `${n} + 1 =`,
              form: "horizontal" as const,
              expr: { kind: "arith" as const, op: "add" as const, operands: [n, 1] },
              responses: [
                {
                  position: "after_equals" as const,
                  cue: null,
                  answer: String(n + 1),
                  answer_source: "computed" as const,
                },
              ],
            };
          }),
        },
      ],
    });

    // 1a: 100% agreement -> double_read (no single_read)
    const p1a = make100FieldPage("sample:M:1a");
    const p1b = structuredClone(p1a);

    // 2a: 90% agreement (10 printed diffs out of 100 fields) -> agreement_accepted with single_read
    const p2a = make100FieldPage("sample:M:2a");
    const p2b = structuredClone(p2a);
    for (let i = 0; i < 10; i += 1) {
      p2b.sections[0].items[i].printed = `${i + 1} + 2 =`;
    }

    // 3a: 89% agreement (11 diffs out of 100 fields) -> machine_read (sent to a person, below 90%)
    const p3a = make100FieldPage("sample:M:3a");
    const p3b = structuredClone(p3a);
    p3b.topic.title = "Other Title";
    for (let i = 0; i < 10; i += 1) {
      p3b.sections[0].items[i].printed = `${i + 1} + 2 =`;
    }

    // 4a: 100% agreement BUT printed answer conflicts with expression (answer_differs) -> machine_read
    const p4a = make100FieldPage("sample:M:4a");
    p4a.sections[0].items[0].responses[0] = {
      position: "after_equals",
      cue: null,
      answer: "99",
      answer_source: "printed",
    };
    const p4b = structuredClone(p4a);

    // 5a: 95% agreement (5 diffs) BUT stored answer conflicts (answer_differs) -> machine_read
    const p5a = make100FieldPage("sample:M:5a");
    p5a.sections[0].items[0].responses[0] = {
      position: "after_equals",
      cue: null,
      answer: "99",
      answer_source: "printed",
    };
    const p5b = structuredClone(p5a);
    for (let i = 1; i <= 5; i += 1) {
      p5b.sections[0].items[i].printed = `${i + 1} + 2 =`;
    }

    const pages = [
      { sha: "a".repeat(64), ref: "sample:M:1a", file: "sample-M-1a.json", a: p1a, b: p1b },
      { sha: "b".repeat(64), ref: "sample:M:2a", file: "sample-M-2a.json", a: p2a, b: p2b },
      { sha: "c".repeat(64), ref: "sample:M:3a", file: "sample-M-3a.json", a: p3a, b: p3b },
      { sha: "d".repeat(64), ref: "sample:M:4a", file: "sample-M-4a.json", a: p4a, b: p4b },
      { sha: "e".repeat(64), ref: "sample:M:5a", file: "sample-M-5a.json", a: p5a, b: p5b },
    ];

    for (const [slot, family] of [["a", "codex"], ["b", "claude"]] as const) {
      const dir = join(work, `reader-${slot}`);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "reader.json"), JSON.stringify({ family, model: "m1" }));
      for (const p of pages) {
        writeFileSync(join(dir, p.file), JSON.stringify(slot === "a" ? p.a : p.b, null, 2));
      }
      writeFileSync(
        join(dir, "run.json"),
        JSON.stringify({
          slot,
          reader: { family, model: "m1" },
          source: "sample",
          photos: pages.map((p) => ({
            photo: `${p.sha.slice(0, 12)}.jpg`,
            photo_sha256: p.sha,
            status: "ok",
            source_ref: p.ref,
            record_file: p.file,
            notes: [],
          })),
        }),
      );
    }

    const report = compareWorkFolder({ workDir: work, repoRoot: repo });
    const statusMap = JSON.parse(readFileSync(join(work, "final", "status.json"), "utf8")) as Record<string, string>;
    expect(statusMap).toEqual({
      "sample:M:1a": "double_read",
      "sample:M:2a": "agreement_accepted",
      "sample:M:3a": "machine_read",
      "sample:M:4a": "machine_read",
      "sample:M:5a": "machine_read",
    });

    // Accepted record keeps reader A's values and lists single_read paths that resolve to them.
    const final2a = JSON.parse(readFileSync(join(work, "final", "sample-M-2a.json"), "utf8")) as PageRecord;
    expect(final2a.single_read).toEqual(
      Array.from({ length: 10 }, (_, i) => `sections[0].items[${i}].printed`),
    );
    for (let i = 0; i < 10; i += 1) {
      expect(final2a.sections[0].items[i].printed).toBe(`${i + 1} + 1 =`);
    }
    const view2a = readFileSync(join(work, "final-view", "sample-M-2a.md"), "utf8");
    expect(view2a).toContain("Single-read (not checked)");
    expect(view2a).toContain("1 + 1 = [not checked]");

    // Non-accepted records omit single_read.
    for (const slug of ["sample-M-1a", "sample-M-3a", "sample-M-4a", "sample-M-5a"]) {
      const rec = JSON.parse(readFileSync(join(work, "final", `${slug}.json`), "utf8")) as PageRecord;
      expect(rec.single_read).toBeUndefined();
    }

    // Re-compare does not treat its own accepted file with single_read as edited_by_person.
    const rerun = compareWorkFolder({ workDir: work, repoRoot: repo });
    const rerun2a = rerun.pages.find((p) => p.source_ref === "sample:M:2a");
    expect(rerun2a?.status).toBe("agreement_accepted");
    expect(rerun2a?.edited_by_person).toBeUndefined();

    // End-of-run list contains 3a (below 90%), 4a (100% + answer_differs), 5a (95% + answer_differs).
    expect(report.pages_sent_to_person).toEqual([
      {
        source_ref: "sample:M:3a",
        agreement_percent: 89,
        agreed: 89,
        compared: 100,
        difference_count: 11,
        reason: null,
      },
      {
        source_ref: "sample:M:4a",
        agreement_percent: 100,
        agreed: 100,
        compared: 100,
        difference_count: 0,
        reason: "stored answer conflicts with computed answer",
      },
      {
        source_ref: "sample:M:5a",
        agreement_percent: 95,
        agreed: 95,
        compared: 100,
        difference_count: 5,
        reason: "stored answer conflicts with computed answer",
      },
    ]);

    const md = readFileSync(join(work, "final", "report.md"), "utf8");
    expect(md).toContain("accepted by the 90% rule");
    expect(md).toContain("## Pages sent to a person");
    expect(md).toContain("- sample:M:3a: 89% agreement, 11 differences");
    expect(md).toContain("- sample:M:4a: 100% agreement, 0 differences (stored answer conflicts with computed answer)");
    expect(md).toContain("- sample:M:5a: 95% agreement, 5 differences (stored answer conflicts with computed answer)");
  });

  it("stores containing list paths in single_read when reader A omitted an item, scaffold, or contents topic without marking the next entry", () => {
    const repo = mkdtempSync(join(tmpdir(), "ref-cmp-absent-repo-"));
    const work = mkdtempSync(join(tmpdir(), "ref-cmp-absent-work-"));
    tempDirs.push(repo, work);

    const makeNumberedPage = (numbers: number[]): PageRecord =>
      makePage({
        source_ref: "sample:M:8a",
        topic: { title: "Adding Practice" },
        sections: [
          {
            instruction: "Add.",
            scaffolds: [],
            items: numbers.map((n) => ({
              n,
              printed: `${n} + 1 =`,
              form: "horizontal" as const,
              expr: { kind: "arith" as const, op: "add" as const, operands: [n, 1] },
              responses: [
                { position: "after_equals" as const, cue: null, answer: String(n + 1), answer_source: "computed" as const },
              ],
            })),
          },
        ],
      });

    const pageA = makeNumberedPage([2, 3]);
    const pageB = makeNumberedPage([2, 3]);
    // Item 1 is an answer-free action item so omitting it tests single_read without triggering the answer stop rule.
    pageB.sections[0].items.unshift({
      n: 1,
      printed: "Read the chart aloud.",
      form: null,
      expr: null,
      responses: [{ position: "checkbox", cue: null, answer: null, answer_source: "unchecked" }],
    });
    pageB.sections[0].scaffolds = [{ kind: "arrow", applies_to: "all", from: "left", to: "right" }];

    const contentsA: ContentsRecord = {
      kind: "contents",
      source_ref: "sample:M:contents",
      topics: [2, 3, 4].map((n) => ({ n, title: `Topic ${n}`, sheets: [n, n], std_time_min: [1, 2] })),
    };
    const contentsB: ContentsRecord = {
      kind: "contents",
      source_ref: "sample:M:contents",
      topics: [1, 2, 3, 4].map((n) => ({ n, title: `Topic ${n}`, sheets: [n, n], std_time_min: [1, 2] })),
    };

    const batch = [
      { sha: SHA_1, ref: "sample:M:8a", file: "sample-M-8a.json", a: pageA, b: pageB },
      { sha: SHA_2, ref: "sample:M:contents", file: "sample-M-contents.json", a: contentsA, b: contentsB },
    ];
    for (const [slot, family] of [["a", "codex"], ["b", "claude"]] as const) {
      const dir = join(work, `reader-${slot}`);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "reader.json"), JSON.stringify({ family, model: "m1" }));
      for (const entry of batch) {
        writeFileSync(join(dir, entry.file), JSON.stringify(slot === "a" ? entry.a : entry.b, null, 2));
      }
      writeFileSync(
        join(dir, "run.json"),
        JSON.stringify({
          slot,
          reader: { family, model: "m1" },
          source: "sample",
          photos: batch.map((entry) => ({
            photo: `${entry.sha.slice(0, 12)}.jpg`,
            photo_sha256: entry.sha,
            status: "ok",
            source_ref: entry.ref,
            record_file: entry.file,
            notes: [],
          })),
        }),
      );
    }

    const report = compareWorkFolder({ workDir: work, repoRoot: repo });
    const pageReport = report.pages.find((p) => p.source_ref === "sample:M:8a");
    expect(pageReport?.status).toBe("agreement_accepted");
    // Report keeps once-read scaffold location and gives reader B's neighbours (no final_path/insert_before) for missing item.
    expect(pageReport?.once_read[0]?.final_path).toBe("sections[0].scaffolds[]");
    expect(pageReport?.differences[0]).toMatchObject({
      path: "sections[0].items[n=1]",
      reader: "b",
      reader_b_after: null,
      reader_b_before: 2,
    });
    expect(pageReport?.differences[0]?.final_path).toBeUndefined();
    expect(pageReport?.differences[0]?.insert_before).toBeUndefined();

    const savedPage = JSON.parse(readFileSync(join(work, "final", "sample-M-8a.json"), "utf8")) as PageRecord;
    expect(savedPage.single_read).toEqual(["sections[0].scaffolds", "sections[0].items"]);
    const pageView = readFileSync(join(work, "final-view", "sample-M-8a.md"), "utf8");
    const item2Row = pageView.split("\n").find((line) => line.startsWith("| 2 "));
    expect(item2Row).toBeDefined();
    expect(item2Row).not.toContain("[not checked]");

    const contentsReport = report.pages.find((p) => p.source_ref === "sample:M:contents");
    expect(contentsReport?.status).toBe("agreement_accepted");
    expect(contentsReport?.differences[0]).toMatchObject({
      path: "topics[n=1]",
      reader: "b",
      reader_b_after: null,
      reader_b_before: 2,
    });
    expect(contentsReport?.differences[0]?.final_path).toBeUndefined();
    expect(contentsReport?.differences[0]?.insert_before).toBeUndefined();
    const savedContents = JSON.parse(
      readFileSync(join(work, "final", "sample-M-contents.json"), "utf8"),
    ) as ContentsRecord;
    expect(savedContents.single_read).toEqual(["topics"]);
    const contentsView = readFileSync(join(work, "final-view", "sample-M-contents.md"), "utf8");
    const topic2Row = contentsView.split("\n").find((line) => line.startsWith("| 2 "));
    expect(topic2Row).toBeDefined();
    expect(topic2Row).not.toContain("[not checked]");

    const md = readFileSync(join(work, "final", "report.md"), "utf8");
    expect(md).toContain("`sections[0].items[n=1]` (value): reader b has it first, before item 2:");
    expect(md).toContain("`topics[n=1]` (value): reader b has it first, before topic 2:");
    expect(md).not.toContain("look at the photo");
    expect(md).not.toContain("insert before");
  });

  it("strips single_read, rewrites the Markdown view, and computes answer conflicts and empty answers from the kept record when an accepted page is edited", () => {
    const repo = mkdtempSync(join(tmpdir(), "ref-cmp-editacc-repo-"));
    const work = mkdtempSync(join(tmpdir(), "ref-cmp-editacc-work-"));
    tempDirs.push(repo, work);

    const makeNumberedPage = (numbers: number[]): PageRecord =>
      makePage({
        source_ref: "sample:M:9a",
        topic: { title: "Adding Practice" },
        sections: [
          {
            instruction: "Add.",
            scaffolds: [],
            items: numbers.map((n) => ({
              n,
              printed: `${n} + 1 =`,
              form: "horizontal" as const,
              expr: { kind: "arith" as const, op: "add" as const, operands: [n, 1] },
              responses: [
                { position: "after_equals" as const, cue: null, answer: String(n + 1), answer_source: "computed" as const },
              ],
            })),
          },
        ],
      });

    const pageA = makeNumberedPage([2, 3]);
    const pageB = makeNumberedPage([2, 3]);
    pageB.sections[0].items.unshift({
      n: 1,
      printed: "Read the chart aloud.",
      form: null,
      expr: null,
      responses: [{ position: "checkbox", cue: null, answer: null, answer_source: "unchecked" }],
    });
    for (const [slot, family, rec] of [
      ["a", "codex", pageA],
      ["b", "claude", pageB],
    ] as const) {
      const dir = join(work, `reader-${slot}`);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "reader.json"), JSON.stringify({ family, model: "m1" }));
      writeFileSync(join(dir, "sample-M-9a.json"), JSON.stringify(rec, null, 2));
      writeFileSync(
        join(dir, "run.json"),
        JSON.stringify({
          slot,
          reader: { family, model: "m1" },
          source: "sample",
          photos: [
            {
              photo: `${SHA_1.slice(0, 12)}.jpg`,
              photo_sha256: SHA_1,
              status: "ok",
              source_ref: "sample:M:9a",
              record_file: "sample-M-9a.json",
              notes: [],
            },
          ],
        }),
      );
    }

    const first = compareWorkFolder({ workDir: work, repoRoot: repo });
    expect(first.pages[0].status).toBe("agreement_accepted");
    const finalPath = join(work, "final", "sample-M-9a.json");
    const viewPath = join(work, "final-view", "sample-M-9a.md");
    const accepted = JSON.parse(readFileSync(finalPath, "utf8")) as PageRecord;
    expect(accepted.single_read).toEqual(["sections[0].items"]);
    expect(readFileSync(viewPath, "utf8")).toContain("**3**");

    // Person edits item 2's answer from "3" to "999" and leaves single_read in the JSON.
    accepted.sections[0].items[0].responses[0].answer = "999";
    writeFileSync(finalPath, JSON.stringify(accepted, null, 2));

    for (const round of [1, 2]) {
      const rerun = compareWorkFolder({ workDir: work, repoRoot: repo });
      const page = rerun.pages[0];
      expect(page.status, `round ${round}`).toBe("machine_read");
      expect(page.edited_by_person, `round ${round}`).toBe(true);
      expect(page.answer_conflicts, `round ${round}`).toEqual([
        'final record: sections[0].items[n=2].responses[0]: record holds "999", computed "3"',
      ]);

      const kept = JSON.parse(readFileSync(finalPath, "utf8")) as PageRecord;
      expect(kept.sections[0].items[0].responses[0].answer, `round ${round}`).toBe("999");
      expect("single_read" in kept, `round ${round}`).toBe(false);

      const view = readFileSync(viewPath, "utf8");
      expect(view, `round ${round}`).toContain("**999**");
      expect(view, `round ${round}`).not.toContain("**3**");
      expect(view, `round ${round}`).not.toContain("Single-read");
      expect(view, `round ${round}`).not.toContain("[not checked]");

      const reportMd = readFileSync(join(work, "final", "report.md"), "utf8");
      expect(reportMd, `round ${round}`).toContain('record holds "999", computed "3"');
    }
  });

  it("treats worked examples and prose as advisory: accepts >= 90% pages with differing prose in single_read and never says a person must read", () => {
    const repo = mkdtempSync(join(tmpdir(), "ref-cmp-prose-repo-"));
    const work = mkdtempSync(join(tmpdir(), "ref-cmp-prose-work-"));
    tempDirs.push(repo, work);

    const makeProsePage = (sourceRef: string): PageRecord =>
      makePage({
        source_ref: sourceRef,
        topic: { title: "Addition practice" },
        examples: [
          {
            position: "top",
            relation: "compare",
            text: "Add the ones first.",
            parts: [{ form: "horizontal", expr: { kind: "arith", op: "add", operands: [1, 2] } }],
          },
        ],
        sections: [
          {
            instruction: "Add.",
            scaffolds: [],
            items: [1, 2].map((n) => ({
              n,
              printed: `${n} + 1 =`,
              form: "horizontal" as const,
              expr: { kind: "arith" as const, op: "add" as const, operands: [n, 1] },
              responses: [
                { position: "after_equals" as const, cue: null, answer: String(n + 1), answer_source: "computed" as const },
              ],
            })),
          },
        ],
      });

    const fullA = makeProsePage("sample:M:10a");
    const fullB = structuredClone(fullA);
    const gapA = makeProsePage("sample:M:11a");
    const gapB = structuredClone(gapA);
    if (Array.isArray(gapB.examples)) {
      gapB.examples[0].text = "Start with the ones column.";
    }

    const batch = [
      { sha: SHA_1, ref: "sample:M:10a", file: "sample-M-10a.json", a: fullA, b: fullB },
      { sha: SHA_2, ref: "sample:M:11a", file: "sample-M-11a.json", a: gapA, b: gapB },
    ];
    for (const [slot, family] of [["a", "codex"], ["b", "claude"]] as const) {
      const dir = join(work, `reader-${slot}`);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "reader.json"), JSON.stringify({ family, model: "m1" }));
      for (const entry of batch) {
        writeFileSync(join(dir, entry.file), JSON.stringify(slot === "a" ? entry.a : entry.b, null, 2));
      }
      writeFileSync(
        join(dir, "run.json"),
        JSON.stringify({
          slot,
          reader: { family, model: "m1" },
          source: "sample",
          photos: batch.map((entry) => ({
            photo: `${entry.sha.slice(0, 12)}.jpg`,
            photo_sha256: entry.sha,
            status: "ok",
            source_ref: entry.ref,
            record_file: entry.file,
            notes: [],
          })),
        }),
      );
    }

    const report = compareWorkFolder({ workDir: work, repoRoot: repo });
    const fullPage = report.pages.find((p) => p.source_ref === "sample:M:10a");
    const gapPage = report.pages.find((p) => p.source_ref === "sample:M:11a");
    expect(fullPage?.status).toBe("double_read");
    expect(fullPage?.needs_person_read).toBe(true);
    expect(gapPage?.status).toBe("agreement_accepted");
    expect(gapPage?.needs_person_read).toBe(true);
    expect(gapPage?.result_reason).toBeNull();
    expect(report.pages_sent_to_person).toEqual([]);

    const savedGap = JSON.parse(readFileSync(join(work, "final", "sample-M-11a.json"), "utf8")) as PageRecord;
    expect(savedGap.single_read).toEqual(["examples[0].text"]);

    const md = readFileSync(join(work, "final", "report.md"), "utf8");
    expect(md).not.toContain("A person must read");
    expect(md).not.toContain("prose must be read by a person");
    expect(md).toContain("Has worked examples or prose. Differing fields are in single_read and show as not checked.");
  });

  it("sends a >= 90% page to a person with reason and answer paths when readers disagree on an item or step answer", () => {
    const repo = mkdtempSync(join(tmpdir(), "ref-cmp-ansstop-repo-"));
    const work = mkdtempSync(join(tmpdir(), "ref-cmp-ansstop-work-"));
    tempDirs.push(repo, work);

    const makeBatchPage = (sourceRef: string): PageRecord =>
      makePage({
        source_ref: sourceRef,
        topic: { title: "Word Problems" },
        sections: [
          {
            instruction: "Solve.",
            scaffolds: [{ kind: "number_strip", applies_to: "all", values: [1, 2, 3, 4] }],
            items: Array.from({ length: 10 }, (_, idx) => ({
              n: idx + 1,
              printed: `Problem ${idx + 1}`,
              form: "horizontal" as const,
              expr: { kind: "notation" as const, latex: `x + ${idx + 1}` },
              responses: [
                {
                  position: "after_equals" as const,
                  cue: null,
                  answer: String(42 + idx),
                  answer_source: "reader" as const,
                },
              ],
            })),
          },
        ],
      });

    // 1a: 100% -> double_read
    const p1a = makeBatchPage("sample:M:1a");
    const p1b = structuredClone(p1a);

    // 2a: 95% non-answer diffs only -> agreement_accepted
    const p2a = makeBatchPage("sample:M:2a");
    const p2b = structuredClone(p2a);
    for (let i = 0; i < 4; i += 1) p2b.sections[0].items[i].printed = `Question ${i + 1}`;

    // 3a: >= 95% with one item answer value diff (42 vs 43) -> machine_read with reason
    const p3a = makeBatchPage("sample:M:3a");
    const p3b = structuredClone(p3a);
    p3b.sections[0].items[0].responses[0].answer = "43";

    // 4a: >= 95% with a worked-example step answer diff -> machine_read with reason
    const p4a = makeBatchPage("sample:M:4a");
    p4a.examples = [
      {
        position: "top",
        relation: "sequence",
        parts: [{ form: "horizontal", expr: { kind: "arith", op: "add", operands: [20, 22] }, shown_answer: "42" }],
        steps: [
          { n: 1, shows: "setup", printed: "20 + 22" },
          { n: 2, shows: "answer", printed: "42" },
        ],
        marks: [],
      },
    ];
    const p4b = structuredClone(p4a);
    if (Array.isArray(p4b.examples) && Array.isArray(p4b.examples[0].steps)) {
      p4b.examples[0].steps[1].printed = "43";
    }

    const batch = [
      { sha: "1".repeat(64), ref: "sample:M:1a", file: "sample-M-1a.json", a: p1a, b: p1b },
      { sha: "2".repeat(64), ref: "sample:M:2a", file: "sample-M-2a.json", a: p2a, b: p2b },
      { sha: "3".repeat(64), ref: "sample:M:3a", file: "sample-M-3a.json", a: p3a, b: p3b },
      { sha: "4".repeat(64), ref: "sample:M:4a", file: "sample-M-4a.json", a: p4a, b: p4b },
    ];
    for (const [slot, family] of [["a", "codex"], ["b", "claude"]] as const) {
      const dir = join(work, `reader-${slot}`);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "reader.json"), JSON.stringify({ family, model: "m1" }));
      for (const entry of batch) {
        writeFileSync(join(dir, entry.file), JSON.stringify(slot === "a" ? entry.a : entry.b, null, 2));
      }
      writeFileSync(
        join(dir, "run.json"),
        JSON.stringify({
          slot,
          reader: { family, model: "m1" },
          source: "sample",
          photos: batch.map((entry) => ({
            photo: `${entry.sha.slice(0, 12)}.jpg`,
            photo_sha256: entry.sha,
            status: "ok",
            source_ref: entry.ref,
            record_file: entry.file,
            notes: [],
          })),
        }),
      );
    }

    const report = compareWorkFolder({ workDir: work, repoRoot: repo });
    const byRef = (ref: string) => report.pages.find((p) => p.source_ref === ref);

    expect(byRef("sample:M:1a")?.status).toBe("double_read");
    expect(byRef("sample:M:2a")?.status).toBe("agreement_accepted");

    const page3a = byRef("sample:M:3a");
    expect(page3a?.status).toBe("machine_read");
    expect(page3a?.result).toBe("sent to a person");
    expect(page3a?.result_reason).toBe("readers disagree on an answer");
    expect(page3a?.answer_disagreements).toEqual(["sections[0].items[n=1].responses[0].answer"]);
    expect(page3a?.agreement?.percent).toBeGreaterThanOrEqual(95);
    const saved3a = JSON.parse(readFileSync(join(work, "final", "sample-M-3a.json"), "utf8")) as PageRecord;
    expect(saved3a.single_read).toBeUndefined();

    const page4a = byRef("sample:M:4a");
    expect(page4a?.status).toBe("machine_read");
    expect(page4a?.result_reason).toBe("readers disagree on an answer");
    expect(page4a?.answer_disagreements).toEqual(["examples[0].steps[n=2].printed"]);

    expect(report.pages_sent_to_person?.map((p) => ({ ref: p.source_ref, reason: p.reason }))).toEqual([
      { ref: "sample:M:3a", reason: "readers disagree on an answer" },
      { ref: "sample:M:4a", reason: "readers disagree on an answer" },
    ]);

    const md = readFileSync(join(work, "final", "report.md"), "utf8");
    expect(md).toContain("sent to a person (readers disagree on an answer)");
    expect(md).toContain("- Answer disagreements (readers disagree on an answer):");
    expect(md).toContain("  - `sections[0].items[n=1].responses[0].answer`");
    expect(md).toContain("  - `examples[0].steps[n=2].printed`");
    expect(md).toContain("sample:M:3a:");
    expect(md).toContain("(readers disagree on an answer)");
  });

  it("decides stops from each reader's raw answer across every fillable answer shape and raw answer pair, plus legacy fallback", async () => {
    const repo = mkdtempSync(join(tmpdir(), "ref-cmp-readconf-repo-"));
    tempDirs.push(repo);

    type RawAnswerKind = "correct" | "wrong" | "unclear" | "null";
    interface FillableShape {
      name: string;
      // Optional pair skip when a shape is conditionally fillable and does not fill on (wrong, wrong).
      skipBothWrong?: boolean;
      buildPayload: (answerKind: RawAnswerKind) => Record<string, unknown>;
      checkFilled: (saved: PageRecord) => void;
    }

    const rawVal = (kind: RawAnswerKind, correct: string, wrong: string): string | null =>
      kind === "correct" ? correct : kind === "wrong" ? wrong : kind === "unclear" ? "unclear" : null;

    const makeBasePage = (
      section: Record<string, unknown>,
      extraItems: Array<Record<string, unknown>> = [],
    ) => ({
      kind: "page",
      level: "M",
      sheet: "3a",
      topic: { title: "Math practice" },
      sections: [
        {
          instruction: "Solve.",
          scaffolds: [],
          ...section,
          items: [
            ...(section.items as Array<Record<string, unknown>>),
            ...extraItems,
            ...[2, 3].map((n) => ({
              n,
              printed: `${n} + 1 =`,
              form: "horizontal",
              expr: { kind: "arith", op: "add", operands: [n, 1] },
              responses: [
                { position: "after_equals", cue: null, answer: String(n + 1), answer_source: "reader" },
              ],
            })),
          ],
        },
      ],
      examples: [],
      score_bands: [[100, 100], [90, 99], [80, 89], [70, 79], [0, 69]],
    });

    const fillableShapes: FillableShape[] = [
      {
        name: "single_unnamed",
        buildPayload: (kind) => {
          const ans = rawVal(kind, "2", "3");
          return makeBasePage({
            items: [
              {
                n: 1,
                printed: "1 + 1 =",
                form: "horizontal",
                expr: { kind: "arith", op: "add", operands: [1, 1] },
                responses: [
                  {
                    position: "after_equals",
                    cue: null,
                    answer: ans,
                    answer_source: ans === null ? "unchecked" : "reader",
                  },
                ],
              },
            ],
          });
        },
        checkFilled: (saved) => {
          expect(saved.sections[0].items[0].responses[0].answer).toBe("2");
          expect(saved.sections[0].items[0].responses[0].answer_source).toBe("computed");
        },
      },
      {
        name: "sole_work_area",
        buildPayload: (kind) => {
          const ans = rawVal(kind, "5", "6");
          return makeBasePage({
            items: [
              {
                n: 1,
                printed: "2 + 3",
                form: "vertical",
                expr: { kind: "arith", op: "add", operands: [2, 3] },
                responses: [
                  {
                    position: "work_area",
                    cue: null,
                    answer: ans,
                    answer_source: ans === null ? "unchecked" : "reader",
                  },
                ],
              },
            ],
          });
        },
        checkFilled: (saved) => {
          expect(saved.sections[0].items[0].responses[0].answer).toBe("5");
          expect(saved.sections[0].items[0].responses[0].answer_source).toBe("computed");
        },
      },
      {
        name: "single_named_place",
        buildPayload: (kind) => {
          const ans = rawVal(kind, "4", "5");
          return makeBasePage({
            items: [
              {
                n: 1,
                printed: "20 + 22 =",
                form: "vertical",
                expr: { kind: "arith", op: "add", operands: [20, 22] },
                responses: [
                  {
                    position: "box",
                    cue: null,
                    place: "tens",
                    answer: ans,
                    answer_source: ans === null ? "unchecked" : "reader",
                  },
                ],
              },
            ],
          });
        },
        checkFilled: (saved) => {
          expect(saved.sections[0].items[0].responses[0].answer).toBe("4");
          expect(saved.sections[0].items[0].responses[0].answer_source).toBe("computed");
        },
      },
      {
        name: "multi_named_places",
        buildPayload: (kind) => {
          const ans = rawVal(kind, "2", "3");
          return makeBasePage({
            items: [
              {
                n: 1,
                printed: "20 + 22 =",
                form: "vertical",
                expr: { kind: "arith", op: "add", operands: [20, 22] },
                responses: [
                  { position: "box", cue: null, place: "tens", answer: "4", answer_source: "reader" },
                  {
                    position: "box",
                    cue: null,
                    place: "ones",
                    answer: ans,
                    answer_source: ans === null ? "unchecked" : "reader",
                  },
                ],
              },
            ],
          });
        },
        checkFilled: (saved) => {
          expect(saved.sections[0].items[0].responses[1].answer).toBe("2");
          expect(saved.sections[0].items[0].responses[1].answer_source).toBe("computed");
        },
      },
      {
        name: "scaffold_places",
        buildPayload: (kind) => {
          const ans = rawVal(kind, "2", "3");
          return makeBasePage({
            scaffolds: [{ kind: "answer_boxes", applies_to: [1], places: ["tens", "ones"] }],
            items: [
              {
                n: 1,
                printed: "20 + 22 =",
                form: "vertical",
                expr: { kind: "arith", op: "add", operands: [20, 22] },
                responses: [
                  { position: "box", cue: null, answer: "4", answer_source: "reader" },
                  {
                    position: "box",
                    cue: null,
                    answer: ans,
                    answer_source: ans === null ? "unchecked" : "reader",
                  },
                ],
              },
            ],
          });
        },
        checkFilled: (saved) => {
          expect(saved.sections[0].items[0].responses[1].answer).toBe("2");
          expect(saved.sections[0].items[0].responses[1].answer_source).toBe("computed");
        },
      },
      {
        name: "multi_value_chain",
        buildPayload: (kind) => {
          const ans = rawVal(kind, "8", "9");
          return makeBasePage({
            items: [
              {
                n: 1,
                printed: "2, _, 6, _",
                form: "horizontal",
                expr: { kind: "chain", terms: [2, null, 6, null], step: 2 },
                responses: [
                  { position: "box", cue: null, answer: "4", answer_source: "reader" },
                  {
                    position: "box",
                    cue: null,
                    answer: ans,
                    answer_source: ans === null ? "unchecked" : "reader",
                  },
                ],
              },
            ],
          });
        },
        checkFilled: (saved) => {
          expect(saved.sections[0].items[0].responses[1].answer).toBe("8");
          expect(saved.sections[0].items[0].responses[1].answer_source).toBe("computed");
        },
      },
      {
        name: "multi_value_linked",
        buildPayload: (kind) => {
          const ans = rawVal(kind, "5", "6");
          return makeBasePage({
            items: [
              {
                n: 1,
                printed: "1 + 2 = _, 2 + 3 = _",
                form: "horizontal",
                expr: {
                  kind: "linked",
                  pair: [
                    { kind: "arith", op: "add", operands: [1, 2] },
                    { kind: "arith", op: "add", operands: [2, 3] },
                  ],
                },
                responses: [
                  { position: "box", cue: null, answer: "3", answer_source: "reader" },
                  {
                    position: "box",
                    cue: null,
                    answer: ans,
                    answer_source: ans === null ? "unchecked" : "reader",
                  },
                ],
              },
            ],
          });
        },
        checkFilled: (saved) => {
          expect(saved.sections[0].items[0].responses[1].answer).toBe("5");
          expect(saved.sections[0].items[0].responses[1].answer_source).toBe("computed");
        },
      },
      {
        name: "multi_unnamed_same_value",
        // When both readers write a wrong concrete answer on unnamed multi-place responses,
        // code intentionally does not fill (places_do_not_fit) because places may be digit boxes.
        skipBothWrong: true,
        buildPayload: (kind) => {
          const ans = rawVal(kind, "24", "25");
          return makeBasePage({
            items: [
              {
                n: 1,
                printed: "Sample word problem",
                form: "horizontal",
                expr: {
                  kind: "word",
                  text: "Sample word problem",
                  expr: { kind: "arith", op: "mul", operands: [6, 4] },
                  unit: "cards",
                },
                responses: [
                  { position: "box", cue: null, answer: "24", answer_source: "reader" },
                  {
                    position: "line_with_unit",
                    cue: "Ans.",
                    unit: "cards",
                    answer: ans,
                    answer_source: ans === null ? "unchecked" : "reader",
                  },
                ],
              },
            ],
          });
        },
        checkFilled: (saved) => {
          expect(saved.sections[0].items[0].responses[1].answer).toBe("24");
          expect(saved.sections[0].items[0].responses[1].answer_source).toBe("computed");
        },
      },
    ];

    const runPair = async (
      name: string,
      payloadA: Record<string, unknown>,
      payloadB: Record<string, unknown>,
      opts?: { omitNoteDetails?: boolean; viaRetry?: boolean },
    ) => {
      const work = mkdtempSync(join(tmpdir(), `ref-cmp-readconf-${name}-`));
      tempDirs.push(work);
      const makeCli = (payload: Record<string, unknown>) => {
        let calls = 0;
        return async () => {
          calls += 1;
          if (opts?.viaRetry && calls === 1) {
            return { code: 0, stdout: "not valid json on first attempt", stderr: "" };
          }
          return { code: 0, stdout: JSON.stringify(payload), stderr: "" };
        };
      };
      const [resA, resB] = await Promise.all([
        readPhoto({
          photoBytes: Uint8Array.of(1),
          source: "sample",
          reader: "codex",
          runCli: makeCli(payloadA),
        }),
        readPhoto({
          photoBytes: Uint8Array.of(1),
          source: "sample",
          reader: "claude",
          runCli: makeCli(payloadB),
        }),
      ]);
      expect(resA.status, `${name} resA`).toBe("ok");
      expect(resB.status, `${name} resB`).toBe("ok");

      for (const [slot, family, res] of [
        ["a", "codex", resA],
        ["b", "claude", resB],
      ] as const) {
        const slotDir = join(work, `reader-${slot}`);
        mkdirSync(slotDir, { recursive: true });
        writeFileSync(join(slotDir, "reader.json"), JSON.stringify({ family, model: "m1" }));
        const entry = persistSlotResult({
          slotDir,
          preparedFile: `${SHA_1.slice(0, 12)}.jpg`,
          originalName: "01.jpg",
          sha256: SHA_1,
          result: res,
          existingEntries: [],
          repoRoot: repo,
        });
        if (opts?.omitNoteDetails) {
          delete entry.note_details;
        }
        writeFileSync(
          join(slotDir, "run.json"),
          JSON.stringify({ slot, reader: { family, model: "m1" }, source: "sample", photos: [entry] }),
        );
      }

      const report = compareWorkFolder({ workDir: work, repoRoot: repo });
      const md = readFileSync(join(work, "final", "report.md"), "utf8");
      const saved = JSON.parse(readFileSync(join(work, "final", "sample-M-3a.json"), "utf8")) as PageRecord;
      return { report, page: report.pages[0], md, saved };
    };

    const rawKinds: RawAnswerKind[] = ["correct", "wrong", "unclear", "null"];
    const tasks: Array<{
      shape: FillableShape;
      aKind: RawAnswerKind;
      bKind: RawAnswerKind;
      viaRetry: boolean;
      shouldPass: boolean;
    }> = [];
    for (const viaRetry of [false, true]) {
      for (const shape of fillableShapes) {
        for (const aKind of rawKinds) {
          for (const bKind of rawKinds) {
            if (shape.skipBothWrong && aKind === "wrong" && bKind === "wrong") continue;
            const shouldPass =
              (aKind === "correct" || aKind === "null") &&
              (bKind === "correct" || bKind === "null");
            tasks.push({ shape, aKind, bKind, viaRetry, shouldPass });
          }
        }
      }
    }

    const results = await Promise.all(
      tasks.map(async (t) => ({
        t,
        out: await runPair(
          `${t.shape.name}-${t.aKind}-${t.bKind}-${t.viaRetry ? "retry" : "direct"}`,
          t.shape.buildPayload(t.aKind),
          t.shape.buildPayload(t.bKind),
          { viaRetry: t.viaRetry },
        ),
      })),
    );

    for (const { t, out } of results) {
      const label = `${t.shape.name} (${t.viaRetry ? "retry" : "direct"}): (${t.aKind}, ${t.bKind})`;
      if (t.shouldPass) {
        t.shape.checkFilled(out.saved);
        expect(out.page.status, label).toBe("double_read");
        expect(out.page.result_reason, label).toBeNull();
        expect(out.page.reader_answer_conflicts, label).toBeUndefined();
        expect(out.page.answer_disagreements, label).toBeUndefined();
        expect(out.report.pages_sent_to_person, label).toEqual([]);
      } else {
        expect(out.page.status, label).toBe("machine_read");
        expect(out.report.pages_sent_to_person, label).toHaveLength(1);
        expect(out.report.pages_sent_to_person![0].source_ref, label).toBe("sample:M:3a");
        expect(out.report.pages_sent_to_person![0].agreement_percent, label).toBe(
          out.page.agreement?.percent ?? null,
        );
        expect(out.report.pages_sent_to_person![0].reason, label).toBe(out.page.result_reason);
        expect(out.page.result_reason, label).not.toBeNull();
        expect(out.md, label).not.toContain("Exact match across both readers.");
        if (!t.shape.skipBothWrong) {
          t.shape.checkFilled(out.saved);
        }
        if (t.aKind === "unclear" || t.bKind === "unclear") {
          expect(out.page.result_reason, label).toContain("readers disagree on an answer");
          expect(out.page.answer_disagreements?.length ?? 0, label).toBeGreaterThan(0);
        }
        if ((t.aKind === "wrong" || t.bKind === "wrong") && !t.shape.skipBothWrong) {
          expect(out.page.result_reason, label).toContain(
            "a reader's answer differs from the computed answer",
          );
          expect(out.page.reader_answer_conflicts?.length ?? 0, label).toBeGreaterThan(0);
        }
      }
    }

    // Legacy run.json without structured note_details falls back to note text format from answers.ts
    // for answer_differs, and has no text fallback for unclear_filled.
    const singleShape = fillableShapes[0];
    const legacy = await runPair(
      "legacy-fallback",
      singleShape.buildPayload("correct"),
      singleShape.buildPayload("wrong"),
      { omitNoteDetails: true },
    );
    expect(legacy.page.status).toBe("machine_read");
    expect(legacy.page.result_reason).toBe("a reader's answer differs from the computed answer");
    expect(legacy.page.reader_answer_conflicts).toEqual([
      'reader b: sections[0].items[n=1].responses[0]: reader gave "3", computed "2"',
    ]);
    expect(legacy.md).toContain(
      'reader b: `sections[0].items[n=1].responses[0]`: reader gave "3", computed "2"',
    );

    // Same path in both readers (different values or different response positions): neither entry is dropped
    const bothWrongSamePath = await runPair(
      "both-wrong-same-path",
      singleShape.buildPayload("wrong"),
      {
        ...singleShape.buildPayload("wrong"),
        sections: [
          {
            instruction: "Solve.",
            scaffolds: [],
            items: [
              {
                n: 1,
                printed: "2 + 3 =",
                form: "horizontal",
                expr: { kind: "arith", op: "add", operands: [2, 3] },
                responses: [
                  { position: "after_equals", cue: null, answer: "88", answer_source: "reader" },
                ],
              },
            ],
          },
        ],
      },
    );
    expect(bothWrongSamePath.page.reader_answer_conflicts).toEqual([
      'reader a: sections[0].items[n=1].responses[0]: reader gave "3", computed "2"',
      'reader b: sections[0].items[n=1].responses[0]: reader gave "88", computed "5"',
    ]);

    // Both readers mark unclear at the same path (e.g. swapped digit places): neither entry is dropped
    const bothUnclearSamePath = await runPair(
      "both-unclear-same-path",
      singleShape.buildPayload("unclear"),
      singleShape.buildPayload("unclear"),
    );
    expect(bothUnclearSamePath.page.answer_disagreements).toEqual([
      "reader a: sections[0].items[n=1].responses[0].answer",
      "reader b: sections[0].items[n=1].responses[0].answer",
    ]);
    expect(bothUnclearSamePath.md).toContain(
      "reader a: `sections[0].items[n=1].responses[0].answer`",
    );
    expect(bothUnclearSamePath.md).toContain(
      "reader b: `sections[0].items[n=1].responses[0].answer`",
    );

    const legacyUnclear = await runPair(
      "legacy-unclear",
      singleShape.buildPayload("correct"),
      singleShape.buildPayload("unclear"),
      { omitNoteDetails: true },
    );
    expect(legacyUnclear.page.status).toBe("double_read");
    expect(legacyUnclear.page.answer_disagreements).toBeUndefined();
  });

  it("sends a page to a person when saved reader metadata names an unknown model family", () => {
    const repo = mkdtempSync(join(tmpdir(), "ref-cmp-unknown-fam-repo-"));
    const work = mkdtempSync(join(tmpdir(), "ref-cmp-unknown-fam-work-"));
    tempDirs.push(repo, work);

    const record: ContentsRecord = {
      kind: "contents",
      source_ref: "sample:M:contents",
      topics: [1, 2, 3].map((n) => ({ n, title: `Topic ${n}`, sheets: [n, n], std_time_min: [1, 2] })),
    };

    for (const [slot, family] of [
      ["a", "codex"],
      ["b", "invented-reader"],
    ] as const) {
      const slotDir = join(work, `reader-${slot}`);
      mkdirSync(slotDir, { recursive: true });
      writeFileSync(join(slotDir, "reader.json"), JSON.stringify({ family, model: "m1" }));
      writeFileSync(join(slotDir, "sample-M-contents.json"), JSON.stringify(record, null, 2));
      writeFileSync(
        join(slotDir, "run.json"),
        JSON.stringify({
          slot,
          reader: { family, model: "m1" },
          source: "sample",
          photos: [
            {
              photo: `${SHA_1.slice(0, 12)}.jpg`,
              photo_sha256: SHA_1,
              status: "ok",
              source_ref: record.source_ref,
              record_file: "sample-M-contents.json",
              notes: [],
            },
          ],
        }),
      );
    }

    const report = compareWorkFolder({ workDir: work, repoRoot: repo });
    expect(report.pages[0].status).toBe("machine_read");
    expect(report.pages[0].result_reason).toBe("same or unknown model family");
    expect(report.pages_sent_to_person).toEqual([
      expect.objectContaining({
        source_ref: "sample:M:contents",
        reason: "same or unknown model family",
      }),
    ]);
  });

  it("gives no final_path or insert_before on kept records (edited, human_checked, invalid) and reports reader B neighbours on every status", () => {
    const repo = mkdtempSync(join(tmpdir(), "ref-cmp-kept-loc-repo-"));
    tempDirs.push(repo);

    const makeTopic = (n: number) => ({ n, title: `Topic ${n}`, sheets: [n, n] as [number, number], std_time_min: [1, 2] as [number, number] });
    const makeContents = (ns: number[]): ContentsRecord => ({
      kind: "contents",
      source_ref: "sample:M:contents",
      topics: ns.map(makeTopic),
    });
    const makeItem = (n: number) => ({
      n,
      printed: `Item ${n}`,
      form: null,
      expr: null,
      responses: [],
    });

    const setupWork = (name: string, recA: ContentsRecord | PageRecord, recB: ContentsRecord | PageRecord) => {
      const work = mkdtempSync(join(tmpdir(), `ref-cmp-kept-loc-${name}-`));
      tempDirs.push(work);
      addPreparedPhoto(work, "1");
      const file = `${recA.source_ref.replace(/:/g, "-")}.json`;
      for (const [slot, family, rec] of [
        ["a", "codex", recA],
        ["b", "claude", recB],
      ] as const) {
        const dir = join(work, `reader-${slot}`);
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, "reader.json"), JSON.stringify({ family, model: "m1" }));
        writeFileSync(join(dir, file), JSON.stringify(rec, null, 2));
        writeFileSync(
          join(dir, "run.json"),
          JSON.stringify({
            slot,
            reader: { family, model: "m1" },
            source: "sample",
            photos: [
              {
                photo: `${SHA_1.slice(0, 12)}.jpg`,
                photo_sha256: SHA_1,
                status: "ok",
                source_ref: rec.source_ref,
                record_file: file,
                notes: [],
              },
            ],
          }),
        );
      }
      return {
        work,
        finalPath: join(work, "final", file),
        reportMdPath: join(work, "final", "report.md"),
      };
    };

    const assertNoKeptLocations = (page: ReturnType<typeof compareWorkFolder>["pages"][number], label: string) => {
      const allDiffs = [
        ...page.differences,
        ...page.once_read,
        ...(page.wording ?? []),
        ...page.both_unclear,
        ...page.one_unclear,
        ...(page.empty_answer ?? []),
      ];
      for (const d of allDiffs) {
        expect(d.final_path, `${label} ${d.path} final_path`).toBeUndefined();
        expect(d.insert_before, `${label} ${d.path} insert_before`).toBeUndefined();
      }
    };

    // 1. Fresh contents page: reader-B-only topic 11 gives reader B neighbours (after 10, before 12),
    // reader-A-only topic 13 gives exact final_path.
    const commonTen = Array.from({ length: 10 }, (_, i) => i + 1);
    const topicWork = setupWork(
      "topics",
      makeContents([...commonTen, 12, 13]),
      makeContents([...commonTen, 11, 12]),
    );
    const freshTopics = compareWorkFolder({ workDir: topicWork.work, repoRoot: repo }).pages[0];
    expect(freshTopics.status).toBe("agreement_accepted");
    const topic11 = freshTopics.differences.find((d) => d.path === "topics[n=11]");
    expect(topic11).toMatchObject({ reader: "b", reader_b_after: 10, reader_b_before: 12 });
    expect(topic11?.final_path).toBeUndefined();
    expect(topic11?.insert_before).toBeUndefined();
    expect(freshTopics.differences.find((d) => d.path === "topics[n=13]")).toMatchObject({
      reader: "a",
      final_path: "topics[11]",
    });
    expect(readFileSync(topicWork.reportMdPath, "utf8")).toContain(
      "`topics[n=11]` (value): reader b has it after topic 10 and before topic 12:",
    );

    // 2. Page with all 6 difference lists populated (differences, once_read, wording, both_unclear,
    // one_unclear, empty_answer): fresh record keeps exact A paths and step/scaffold/mark locations.
    const emptyAnswerItem = {
      n: 4,
      printed: "x + 2 = 5",
      form: "horizontal" as const,
      expr: { kind: "notation" as const, latex: "x + 2 = 5" },
      responses: [{ position: "after_equals" as const, cue: null, answer: null, answer_source: "unchecked" as const }],
    };
    const pageA = makePage({
      source_ref: "sample:M:14a",
      topic: { title: "unclear", number: 1 },
      sections: [
        {
          instruction: "Read.",
          scaffolds: [
            { kind: "caption", text: "Note", applies_to: "all" },
            { kind: "helper_digit", applies_to: [1], description: "Small 1 above tens" },
          ],
          items: [makeItem(1), makeItem(3), emptyAnswerItem, makeItem(5)],
        },
      ],
      examples: [
        {
          position: "top",
          relation: "compare",
          parts: [{ form: "horizontal", expr: null }],
          steps: [
            { n: 1, shows: "setup", printed: "2 + 3" },
            { n: 2, shows: "answer", printed: "5" },
          ],
          marks: [],
        },
      ],
    });
    const pageB = makePage({
      source_ref: "sample:M:14a",
      topic: { title: "unclear", number: 1 },
      sections: [
        {
          instruction: "unclear",
          scaffolds: [
            { kind: "helper_digit", applies_to: [1], description: "Tiny 1 printed above tens" },
          ],
          items: [makeItem(1), makeItem(2), makeItem(3), emptyAnswerItem],
        },
      ],
      examples: [
        {
          position: "top",
          relation: "compare",
          parts: [{ form: "horizontal", expr: null }],
          steps: [
            { n: 1, shows: "setup", printed: "2 + 3" },
            { n: 2, shows: "partial_sum", printed: "2 + 2 + 1" },
            { n: 3, shows: "answer", printed: "5" },
          ],
          marks: [{ kind: "box", step: 2, description: "Box around split" }],
        },
      ],
    });
    const pageWork = setupWork("page-kept", pageA, pageB);
    const freshPage = compareWorkFolder({ workDir: pageWork.work, repoRoot: repo }).pages[0];
    expect(freshPage.differences.length).toBeGreaterThan(0);
    expect(freshPage.once_read.length).toBeGreaterThan(0);
    expect((freshPage.wording ?? []).length).toBeGreaterThan(0);
    expect(freshPage.both_unclear.length).toBeGreaterThan(0);
    expect(freshPage.one_unclear.length).toBeGreaterThan(0);
    expect((freshPage.empty_answer ?? []).length).toBeGreaterThan(0);
    expect(freshPage.differences.find((d) => d.path === "sections[0].items[n=2]")).toMatchObject({
      reader: "b",
      reader_b_after: 1,
      reader_b_before: 3,
    });
    expect(freshPage.differences.find((d) => d.path === "sections[0].items[n=2]")?.final_path).toBeUndefined();
    expect(freshPage.differences.find((d) => d.path === "sections[0].items[n=5]")).toMatchObject({
      reader: "a",
      final_path: "sections[0].items[3]",
    });
    expect(freshPage.once_read.find((d) => d.path === "sections[0].scaffolds[0]")?.final_path).toBe(
      "sections[0].scaffolds[0]",
    );
    expect(freshPage.once_read.find((d) => d.path === "examples[0].steps[b:1]")).toMatchObject({
      reader: "b",
      insert_before: 1,
      final_path: "examples[0].steps[1]",
    });
    expect(freshPage.once_read.find((d) => d.path === "examples[0].marks[b:0]")).toMatchObject({
      reader: "b",
      missing_step: true,
      final_path: "examples[0].marks[]",
    });

    // (a) Person-edited kept record -> no final_path or insert_before anywhere across all 6 lists;
    // machine_read keeps "find the place in that record"; reader-B item keeps same neighbour text.
    const edited = JSON.parse(readFileSync(pageWork.finalPath, "utf8")) as PageRecord;
    edited.topic.title = "Edited heading";
    writeFileSync(pageWork.finalPath, JSON.stringify(edited, null, 2));
    const editedPage = compareWorkFolder({ workDir: pageWork.work, repoRoot: repo }).pages[0];
    expect(editedPage.status).toBe("machine_read");
    expect(editedPage.edited_by_person).toBe(true);
    expect((editedPage.empty_answer ?? []).length).toBeGreaterThan(0);
    assertNoKeptLocations(editedPage, "edited");
    const editedMd = readFileSync(pageWork.reportMdPath, "utf8");
    expect(editedMd).toContain("`sections[0].items[n=2]` (value): reader b has it after item 1 and before item 3:");
    expect(editedMd).toContain("`sections[0].items[n=5]` (value): only reader a has it; a person changed the final record, so find the place in that record:");
    expect(editedMd).toContain("`sections[0].scaffolds[0]`: only reader a has it; a person changed the final record, so find the place in that record:");

    // (b) human_checked kept record -> no final_path or insert_before, no review instructions, same reader-B neighbour text.
    // Fill the empty answer first so reference:check allows marking the page checked.
    edited.sections[0].items[2].responses[0].answer = "3";
    edited.sections[0].items[2].responses[0].answer_source = "reader";
    writeFileSync(pageWork.finalPath, JSON.stringify(edited, null, 2));
    checkAndMarkPage({
      workDir: pageWork.work,
      repoRoot: repo,
      page: "sample:M:14a",
      photoCompared: true,
    });
    const checkedPage = compareWorkFolder({ workDir: pageWork.work, repoRoot: repo }).pages[0];
    expect(checkedPage.status).toBe("human_checked");
    assertNoKeptLocations(checkedPage, "human_checked");
    const checkedMd = readFileSync(pageWork.reportMdPath, "utf8");
    expect(checkedMd).toContain("`sections[0].items[n=2]` (value): reader b has it after item 1 and before item 3:");
    expect(checkedMd).not.toContain("find the place in that record");
    expect(checkedMd).not.toContain("insert before");
    expect(checkedMd).not.toContain("not in kept final record");

    // (c) Invalid kept record of a checked page -> no final_path or insert_before; the check does
    // not count now, so the page is machine_read and names the place as one that a person checked.
    writeFileSync(pageWork.finalPath, "{ invalid json");
    const invalidPage = compareWorkFolder({ workDir: pageWork.work, repoRoot: repo }).pages[0];
    expect(invalidPage.status).toBe("machine_read");
    expect(readFileSync(pageWork.reportMdPath, "utf8")).toContain(
      "only reader a has it; the final record is the one that a person checked, so find the place in that record:",
    );
    assertNoKeptLocations(invalidPage, "invalid");

    // Table check for missing_step wording across fresh and all kept kinds in report.json and report.md
    const missingStepTable: Array<{
      label: string;
      prepare: () => string;
      expectMustAdd: boolean;
      expectFinalPath: string | undefined;
    }> = [
      {
        label: "fresh machine_read",
        prepare: () => {
          const w = setupWork("ms-fresh", pageA, pageB);
          compareWorkFolder({ workDir: w.work, repoRoot: repo });
          return w.work;
        },
        expectMustAdd: true,
        expectFinalPath: "examples[0].marks[]",
      },
      {
        label: "person-edited kept record",
        prepare: () => {
          const w = setupWork("ms-edited", pageA, pageB);
          compareWorkFolder({ workDir: w.work, repoRoot: repo });
          const rec = JSON.parse(readFileSync(w.finalPath, "utf8")) as PageRecord;
          rec.topic.title = "Edited heading";
          writeFileSync(w.finalPath, JSON.stringify(rec, null, 2));
          compareWorkFolder({ workDir: w.work, repoRoot: repo });
          return w.work;
        },
        expectMustAdd: false,
        expectFinalPath: undefined,
      },
      {
        label: "human_checked kept record",
        prepare: () => {
          const w = setupWork("ms-checked", pageA, pageB);
          compareWorkFolder({ workDir: w.work, repoRoot: repo });
          const rec = JSON.parse(readFileSync(w.finalPath, "utf8")) as PageRecord;
          rec.sections[0].items[2].responses[0].answer = "3";
          rec.sections[0].items[2].responses[0].answer_source = "reader";
          writeFileSync(w.finalPath, JSON.stringify(rec, null, 2));
          checkAndMarkPage({
            workDir: w.work,
            repoRoot: repo,
            page: "sample:M:14a",
            photoCompared: true,
          });
          compareWorkFolder({ workDir: w.work, repoRoot: repo });
          return w.work;
        },
        expectMustAdd: false,
        expectFinalPath: undefined,
      },
      {
        label: "invalid kept record of a checked page",
        prepare: () => {
          const w = setupWork("ms-invalid-checked", pageA, pageB);
          compareWorkFolder({ workDir: w.work, repoRoot: repo });
          const rec = JSON.parse(readFileSync(w.finalPath, "utf8")) as PageRecord;
          rec.sections[0].items[2].responses[0].answer = "3";
          rec.sections[0].items[2].responses[0].answer_source = "reader";
          writeFileSync(w.finalPath, JSON.stringify(rec, null, 2));
          checkAndMarkPage({
            workDir: w.work,
            repoRoot: repo,
            page: "sample:M:14a",
            photoCompared: true,
          });
          writeFileSync(w.finalPath, "{ invalid json");
          compareWorkFolder({ workDir: w.work, repoRoot: repo });
          return w.work;
        },
        expectMustAdd: false,
        expectFinalPath: undefined,
      },
      {
        label: "invalid kept person-edited record",
        prepare: () => {
          const w = setupWork("ms-invalid-edited", pageA, pageB);
          compareWorkFolder({ workDir: w.work, repoRoot: repo });
          writeFileSync(w.finalPath, "{ invalid json");
          compareWorkFolder({ workDir: w.work, repoRoot: repo });
          return w.work;
        },
        expectMustAdd: false,
        expectFinalPath: undefined,
      },
    ];
    for (const row of missingStepTable) {
      const workDir = row.prepare();
      const repJson = JSON.parse(
        readFileSync(join(workDir, "final", "report.json"), "utf8"),
      ) as ReturnType<typeof compareWorkFolder>;
      const repMd = readFileSync(join(workDir, "final", "report.md"), "utf8");
      const mark = repJson.pages[0].once_read.find((d) => d.path === "examples[0].marks[b:0]");
      expect(mark?.missing_step, row.label).toBe(true);
      expect(mark?.final_path, row.label).toBe(row.expectFinalPath);
      expect(mark?.insert_before, row.label).toBeUndefined();
      if (row.expectMustAdd) {
        expect(repMd, row.label).toContain(
          "its step is missing from reader A's record and must be added first",
        );
      } else {
        expect(repMd, row.label).toContain("; step absent from reader A's record");
        expect(repMd, row.label).not.toContain("must be added first");
      }
    }
  });

  it("stops a page when a worked-example shown_answer conflicts with its computable expr without mutating shown_answer", () => {
    const repo = mkdtempSync(join(tmpdir(), "ref-cmp-ex-ans-repo-"));
    tempDirs.push(repo);

    const makeExPage = (
      sourceRef: string,
      parts: PageRecord["examples"] extends infer E ? (E extends Array<infer Ex> ? Ex extends { parts: infer P } ? P : never : never) : never,
    ): PageRecord =>
      makePage({
        source_ref: sourceRef,
        examples: [{ position: "top", relation: "compare", parts }],
      });

    const runCase = (name: string, recA: PageRecord, recB: PageRecord) => {
      const work = mkdtempSync(join(tmpdir(), `ref-cmp-ex-ans-${name}-`));
      tempDirs.push(work);
      const file = `${recA.source_ref.replace(/:/g, "-")}.json`;
      for (const [slot, family, rec] of [
        ["a", "codex", recA],
        ["b", "claude", recB],
      ] as const) {
        const dir = join(work, `reader-${slot}`);
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, "reader.json"), JSON.stringify({ family, model: "m1" }));
        writeFileSync(join(dir, file), JSON.stringify(rec, null, 2));
        writeFileSync(
          join(dir, "run.json"),
          JSON.stringify({
            slot,
            reader: { family, model: "m1" },
            source: "sample",
            photos: [
              {
                photo: `${SHA_1.slice(0, 12)}.jpg`,
                photo_sha256: SHA_1,
                status: "ok",
                source_ref: rec.source_ref,
                record_file: file,
                notes: [],
              },
            ],
          }),
        );
      }
      const report = compareWorkFolder({ workDir: work, repoRoot: repo });
      const saved = JSON.parse(readFileSync(join(work, "final", file), "utf8")) as PageRecord;
      const md = readFileSync(join(work, "final", "report.md"), "utf8");
      return { page: report.pages[0], saved, md };
    };

    // 1. A: 2 + 3 shown 6, B: 2 + 4 shown 6 -> final record conflicts, shown_answer preserved
    const aBad = runCase(
      "a-bad",
      makeExPage("sample:M:20a", [
        { form: "horizontal", expr: { kind: "arith", op: "add", operands: [2, 3] }, shown_answer: "6" },
      ]),
      makeExPage("sample:M:20a", [
        { form: "horizontal", expr: { kind: "arith", op: "add", operands: [2, 4] }, shown_answer: "6" },
      ]),
    );
    expect(aBad.page.status).toBe("machine_read");
    expect(aBad.page.result_reason).toBe(
      "stored answer conflicts with computed answer; readers disagree on an expression",
    );
    expect(aBad.page.answer_conflicts).toEqual([
      'final record: examples[0].parts[0].shown_answer: shown "6", computed "5"',
    ]);
    expect(aBad.page.reader_answer_conflicts).toBeUndefined();
    expect(Array.isArray(aBad.saved.examples) && aBad.saved.examples[0].parts[0].shown_answer).toBe("6");

    // 2. Only B in conflict: A: 2 + 4 shown 6, B: 2 + 3 shown 6 -> reader-only answer conflict
    const bBad = runCase(
      "b-bad",
      makeExPage("sample:M:21a", [
        { form: "horizontal", expr: { kind: "arith", op: "add", operands: [2, 4] }, shown_answer: "6" },
      ]),
      makeExPage("sample:M:21a", [
        { form: "horizontal", expr: { kind: "arith", op: "add", operands: [2, 3] }, shown_answer: "6" },
      ]),
    );
    expect(bBad.page.status).toBe("machine_read");
    expect(bBad.page.result_reason).toBe(
      "a reader's answer differs from the computed answer; readers disagree on an expression",
    );
    expect(bBad.page.answer_conflicts).toBeUndefined();
    expect(bBad.page.reader_answer_conflicts).toEqual([
      'reader b: examples[0].parts[0].shown_answer: shown "6", computed "5"',
    ]);
    expect(bBad.md).toContain(
      'reader b: `examples[0].parts[0].shown_answer`: shown "6", computed "5"',
    );

    // 2b. Unrelated conflict in B at the same index as A's conflict: both are listed
    const bothDifferentAtIndex0 = runCase(
      "both-diff-same-idx",
      makeExPage("sample:M:21b", [
        { form: "horizontal", expr: { kind: "arith", op: "add", operands: [2, 3] }, shown_answer: "6" },
      ]),
      makeExPage("sample:M:21b", [
        { form: "horizontal", expr: { kind: "arith", op: "add", operands: [4, 5] }, shown_answer: "10" },
      ]),
    );
    expect(bothDifferentAtIndex0.page.status).toBe("machine_read");
    expect(bothDifferentAtIndex0.page.answer_conflicts).toEqual([
      'final record: examples[0].parts[0].shown_answer: shown "6", computed "5"',
    ]);
    expect(bothDifferentAtIndex0.page.reader_answer_conflicts).toEqual([
      'reader b: examples[0].parts[0].shown_answer: shown "10", computed "9"',
    ]);
    expect(bothDifferentAtIndex0.md).toContain(
      'final record: `examples[0].parts[0].shown_answer`: shown "6", computed "5"',
    );
    expect(bothDifferentAtIndex0.md).toContain(
      'reader b: `examples[0].parts[0].shown_answer`: shown "10", computed "9"',
    );

    // 2c. A Alpha first, B Beta first, same expr and same wrong answer at index 0: both listed
    const alphaBeta = runCase(
      "alpha-beta-same-idx",
      {
        ...makeExPage("sample:M:21c", []),
        examples: [
          {
            position: "top",
            relation: "compare",
            label: "Alpha",
            parts: [{ form: "horizontal", expr: { kind: "arith", op: "add", operands: [2, 3] }, shown_answer: "6" }],
          },
          {
            position: "top",
            relation: "compare",
            label: "Beta",
            parts: [{ form: "horizontal", expr: { kind: "arith", op: "add", operands: [2, 3] }, shown_answer: "5" }],
          },
        ],
      },
      {
        ...makeExPage("sample:M:21c", []),
        examples: [
          {
            position: "top",
            relation: "compare",
            label: "Beta",
            parts: [{ form: "horizontal", expr: { kind: "arith", op: "add", operands: [2, 3] }, shown_answer: "6" }],
          },
          {
            position: "top",
            relation: "compare",
            label: "Alpha",
            parts: [{ form: "horizontal", expr: { kind: "arith", op: "add", operands: [2, 3] }, shown_answer: "5" }],
          },
        ],
      },
    );
    expect(alphaBeta.page.status).toBe("machine_read");
    expect(alphaBeta.page.answer_conflicts).toEqual([
      'final record: examples[0].parts[0].shown_answer: shown "6", computed "5"',
    ]);
    expect(alphaBeta.page.reader_answer_conflicts).toEqual([
      'reader b: examples[0].parts[0].shown_answer: shown "6", computed "5"',
    ]);

    // 3. Both readers have the same conflict at 100% agreement -> still stops, final and reader b both listed
    const bothBad = runCase(
      "both-bad",
      makeExPage("sample:M:22a", [
        { form: "horizontal", expr: { kind: "arith", op: "add", operands: [2, 3] }, shown_answer: "6" },
      ]),
      makeExPage("sample:M:22a", [
        { form: "horizontal", expr: { kind: "arith", op: "add", operands: [2, 3] }, shown_answer: "6" },
      ]),
    );
    expect(bothBad.page.agreement?.percent).toBe(100);
    expect(bothBad.page.status).toBe("machine_read");
    expect(bothBad.page.result_reason).toContain("stored answer conflicts with computed answer");
    expect(bothBad.page.answer_conflicts).toEqual([
      'final record: examples[0].parts[0].shown_answer: shown "6", computed "5"',
    ]);
    expect(bothBad.page.reader_answer_conflicts).toEqual([
      'reader b: examples[0].parts[0].shown_answer: shown "6", computed "5"',
    ]);
    expect(Array.isArray(bothBad.saved.examples) && bothBad.saved.examples[0].parts[0].shown_answer).toBe("6");

    // 4. Passing cases: thousands separators, remainder forms, notation, absent/null/not_stated, linked/chain
    const okParts: PageRecord["examples"] extends infer E ? (E extends Array<infer Ex> ? Ex extends { parts: infer P } ? P : never : never) : never = [
      { form: "horizontal", expr: { kind: "arith", op: "add", operands: [500, 500] }, shown_answer: "1,000" },
      { form: "horizontal", expr: { kind: "arith", op: "div", operands: [13, 3] }, shown_answer: "4r1" },
      { form: "horizontal", expr: { kind: "notation", latex: "x + 2 = 5" }, shown_answer: "99" },
      { form: "horizontal", expr: { kind: "arith", op: "add", operands: [2, 3] } },
      { form: "horizontal", expr: { kind: "arith", op: "add", operands: [2, 3] }, shown_answer: null },
      { form: "horizontal", expr: { kind: "arith", op: "add", operands: [2, 3] }, shown_answer: "not_stated" },
      {
        form: "horizontal",
        expr: {
          kind: "linked",
          pair: [
            { kind: "arith", op: "add", operands: [1, 2] },
            { kind: "arith", op: "add", operands: [2, 3] },
          ],
        },
        shown_answer: "99",
      },
      { form: "horizontal", expr: { kind: "chain", terms: [2, 4, null, 8] }, shown_answer: "99" },
    ];
    const allOk = runCase("all-ok", makeExPage("sample:M:23a", okParts), makeExPage("sample:M:23a", okParts));
    expect(allOk.page.status).toBe("double_read");
    expect(allOk.page.answer_conflicts).toBeUndefined();
    expect(allOk.page.reader_answer_conflicts).toBeUndefined();
  });

  it("lists reader A item conflict once on a fresh record and lists final, reader a, and reader b on an edited record", async () => {
    const repo = mkdtempSync(join(tmpdir(), "ref-cmp-conflict-list-repo-"));
    const work = mkdtempSync(join(tmpdir(), "ref-cmp-conflict-list-work-"));
    tempDirs.push(repo, work);

    const makeRaw = (opts: {
      itemAnswer: string;
      itemSource: "printed" | "reader";
      exShown: string;
    }) => ({
      kind: "page",
      level: "M",
      sheet: "30a",
      topic: { title: "Conflict list test" },
      sections: [
        {
          instruction: "Add.",
          scaffolds: [],
          items: [
            {
              n: 1,
              printed: "2 + 3 =",
              form: "horizontal",
              expr: { kind: "arith", op: "add", operands: [2, 3] },
              responses: [
                {
                  position: "after_equals",
                  cue: null,
                  answer: opts.itemAnswer,
                  answer_source: opts.itemSource,
                },
              ],
            },
          ],
        },
      ],
      examples: [
        {
          position: "top",
          relation: "compare",
          parts: [
            {
              form: "horizontal",
              expr: { kind: "arith", op: "add", operands: [2, 3] },
              shown_answer: opts.exShown,
            },
          ],
        },
      ],
      score_bands: [
        [100, 100],
        [90, 99],
        [80, 89],
        [70, 79],
        [0, 69],
      ],
    });

    const rawA = makeRaw({ itemAnswer: "6", itemSource: "printed", exShown: "6" });
    const rawB = makeRaw({ itemAnswer: "5", itemSource: "reader", exShown: "5" });

    for (const [slot, family, raw] of [
      ["a", "codex", rawA],
      ["b", "claude", rawB],
    ] as const) {
      const res = await readPhoto({
        photoBytes: Uint8Array.of(1),
        source: "sample",
        reader: family,
        runCli: async () => ({ code: 0, stdout: JSON.stringify(raw), stderr: "" }),
      });
      expect(res.status).toBe("ok");
      const dir = join(work, `reader-${slot}`);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "reader.json"), JSON.stringify({ family, model: "m1" }));
      const entry = persistSlotResult({
        slotDir: dir,
        preparedFile: `${SHA_1.slice(0, 12)}.jpg`,
        originalName: "01.jpg",
        sha256: SHA_1,
        result: res,
        existingEntries: [],
        repoRoot: repo,
      });
      writeFileSync(
        join(dir, "run.json"),
        JSON.stringify({ slot, reader: { family, model: "m1" }, source: "sample", photos: [entry] }),
      );
    }

    // Fresh record (= reader A's content): A's printed item conflict and example conflict appear
    // once under answer_conflicts (labelled final record) and NOT again under reader_answer_conflicts.
    const fresh = compareWorkFolder({ workDir: work, repoRoot: repo });
    expect(fresh.pages[0].answer_conflicts).toEqual([
      'final record: sections[0].items[n=1].responses[0]: page prints "6", computed "5"',
      'final record: examples[0].parts[0].shown_answer: shown "6", computed "5"',
    ]);
    expect(fresh.pages[0].reader_answer_conflicts).toBeUndefined();

    // Now give reader B its own conflicts and let a person edit the final record to a third wrong value.
    const workEdited = mkdtempSync(join(tmpdir(), "ref-cmp-conflict-edited-work-"));
    tempDirs.push(workEdited);
    const rawA2 = makeRaw({ itemAnswer: "6", itemSource: "printed", exShown: "6" });
    const rawB2 = makeRaw({ itemAnswer: "7", itemSource: "reader", exShown: "8" });
    for (const [slot, family, raw] of [
      ["a", "codex", rawA2],
      ["b", "claude", rawB2],
    ] as const) {
      const res = await readPhoto({
        photoBytes: Uint8Array.of(2),
        source: "sample",
        reader: family,
        runCli: async () => ({ code: 0, stdout: JSON.stringify(raw), stderr: "" }),
      });
      expect(res.status).toBe("ok");
      const dir = join(workEdited, `reader-${slot}`);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "reader.json"), JSON.stringify({ family, model: "m1" }));
      const entry = persistSlotResult({
        slotDir: dir,
        preparedFile: `${SHA_1.slice(0, 12)}.jpg`,
        originalName: "02.jpg",
        sha256: SHA_1,
        result: res,
        existingEntries: [],
        repoRoot: repo,
      });
      writeFileSync(
        join(dir, "run.json"),
        JSON.stringify({ slot, reader: { family, model: "m1" }, source: "sample", photos: [entry] }),
      );
    }
    compareWorkFolder({ workDir: workEdited, repoRoot: repo });
    const finalPath = join(workEdited, "final", "sample-M-30a.json");
    const edited = JSON.parse(readFileSync(finalPath, "utf8")) as PageRecord;
    edited.sections[0].items[0].responses[0].answer = "9";
    if (Array.isArray(edited.examples)) {
      edited.examples[0].parts[0].shown_answer = "10";
    }
    writeFileSync(finalPath, JSON.stringify(edited, null, 2));

    const afterEdit = compareWorkFolder({ workDir: workEdited, repoRoot: repo });
    expect(afterEdit.pages[0].edited_by_person).toBe(true);
    expect(afterEdit.pages[0].answer_conflicts).toEqual([
      'final record: sections[0].items[n=1].responses[0]: page prints "9", computed "5"',
      'final record: examples[0].parts[0].shown_answer: shown "10", computed "5"',
    ]);
    expect(afterEdit.pages[0].reader_answer_conflicts).toEqual([
      'reader a: sections[0].items[n=1].responses[0]: page prints "6", computed "5"',
      'reader b: sections[0].items[n=1].responses[0]: reader gave "7", computed "5"',
      'reader a: examples[0].parts[0].shown_answer: shown "6", computed "5"',
      'reader b: examples[0].parts[0].shown_answer: shown "8", computed "5"',
    ]);
  });

  it("sends >= 90% pages with expression disagreements (including same answer, combined answer+expr, and one-sided example) to a person and lists expression paths in report.json and report.md", () => {
    const repo = mkdtempSync(join(tmpdir(), "ref-cmp-exprstop-repo-"));
    const work = mkdtempSync(join(tmpdir(), "ref-cmp-exprstop-work-"));
    tempDirs.push(repo, work);

    const makeSized = (ref: string): PageRecord => ({
      kind: "page",
      source_ref: ref,
      topic: { title: "Adding Numbers", number: 1 },
      sections: [
        {
          instruction: "Add the numbers.",
          scaffolds: [],
          items: Array.from({ length: 12 }, (_, idx) => ({
            n: idx + 1,
            printed: idx === 0 ? "2 + 3 =" : `${idx + 1} + 1 =`,
            form: "horizontal" as const,
            expr: {
              kind: "arith" as const,
              op: "add" as const,
              operands: idx === 0 ? [2, 3] : [idx + 1, 1],
            },
            responses: [
              {
                position: "after_equals" as const,
                cue: null,
                answer: idx === 0 ? "5" : String(idx + 2),
                answer_source: "computed" as const,
              },
            ],
          })),
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
    });

    // 1a: control >= 95% with non-expression diff -> agreement_accepted with single_read
    const p1a = makeSized("sample:M:41a");
    const p1b = structuredClone(p1a);
    p1b.topic.title = "Totals";

    // 2a: printed "2 + 3 =", reader A stores 1 x 5, reader B stores 2 + 3, both answers 5 -> machine_read with expression reason
    const p2a = makeSized("sample:M:42a");
    p2a.sections[0].items[0].expr = { kind: "arith", op: "mul", operands: [1, 5] };
    const p2b = makeSized("sample:M:42a");

    // 3a: both answer and expression disagreement on the same page -> shows both reasons
    const p3a = makeSized("sample:M:43a");
    p3a.sections[0].items[0].expr = { kind: "arith", op: "mul", operands: [1, 5] };
    p3a.sections[0].items[1].responses[0] = {
      position: "after_equals",
      cue: null,
      answer: "3",
      answer_source: "reader",
    };
    const p3b = makeSized("sample:M:43a");
    p3b.sections[0].items[1].responses[0] = {
      position: "after_equals",
      cue: null,
      answer: "4",
      answer_source: "reader",
    };

    // 4a: one-sided worked example with an expression and no answer -> machine_read with expression reason only
    const p4a = makeSized("sample:M:44a");
    const p4b = makeSized("sample:M:44a");
    p4b.examples = [
      {
        position: "top",
        relation: "compare",
        parts: [{ form: "horizontal", expr: { kind: "arith", op: "add", operands: [1, 2] } }],
      },
    ];

    const batch = [
      { sha: "a".repeat(64), ref: "sample:M:41a", file: "sample-M-41a.json", a: p1a, b: p1b },
      { sha: "b".repeat(64), ref: "sample:M:42a", file: "sample-M-42a.json", a: p2a, b: p2b },
      { sha: "c".repeat(64), ref: "sample:M:43a", file: "sample-M-43a.json", a: p3a, b: p3b },
      { sha: "d".repeat(64), ref: "sample:M:44a", file: "sample-M-44a.json", a: p4a, b: p4b },
    ];
    for (const [slot, family] of [
      ["a", "codex"],
      ["b", "claude"],
    ] as const) {
      const dir = join(work, `reader-${slot}`);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "reader.json"), JSON.stringify({ family, model: "m1" }));
      for (const entry of batch) {
        writeFileSync(join(dir, entry.file), JSON.stringify(slot === "a" ? entry.a : entry.b, null, 2));
      }
      writeFileSync(
        join(dir, "run.json"),
        JSON.stringify({
          slot,
          reader: { family, model: "m1" },
          source: "sample",
          photos: batch.map((entry) => ({
            photo: `${entry.sha.slice(0, 12)}.jpg`,
            photo_sha256: entry.sha,
            status: "ok",
            source_ref: entry.ref,
            record_file: entry.file,
            notes: [],
          })),
        }),
      );
    }

    const report = compareWorkFolder({ workDir: work, repoRoot: repo });
    const byRef = (ref: string) => report.pages.find((p) => p.source_ref === ref);

    const page41a = byRef("sample:M:41a");
    expect(page41a?.status).toBe("agreement_accepted");
    expect(page41a?.expression_disagreements).toBeUndefined();
    const saved41a = JSON.parse(readFileSync(join(work, "final", "sample-M-41a.json"), "utf8")) as PageRecord;
    expect(saved41a.single_read).toEqual(["topic.title"]);

    const page42a = byRef("sample:M:42a");
    expect(page42a?.status).toBe("machine_read");
    expect(page42a?.result).toBe("sent to a person");
    expect(page42a?.result_reason).toBe("readers disagree on an expression");
    expect(page42a?.expression_disagreements).toEqual([
      "sections[0].items[n=1].expr.op",
      "sections[0].items[n=1].expr.operands[0]",
      "sections[0].items[n=1].expr.operands[1]",
    ]);
    expect(page42a?.answer_disagreements).toBeUndefined();
    expect(page42a?.agreement?.percent).toBeGreaterThanOrEqual(95);
    const saved42a = JSON.parse(readFileSync(join(work, "final", "sample-M-42a.json"), "utf8")) as PageRecord;
    expect(saved42a.single_read).toBeUndefined();

    const page43a = byRef("sample:M:43a");
    expect(page43a?.status).toBe("machine_read");
    expect(page43a?.result_reason).toBe(
      "readers disagree on an answer; readers disagree on an expression",
    );
    expect(page43a?.answer_disagreements).toEqual(["sections[0].items[n=2].responses[0].answer"]);
    expect(page43a?.expression_disagreements).toEqual([
      "sections[0].items[n=1].expr.op",
      "sections[0].items[n=1].expr.operands[0]",
      "sections[0].items[n=1].expr.operands[1]",
    ]);

    const page44a = byRef("sample:M:44a");
    expect(page44a?.status).toBe("machine_read");
    expect(page44a?.result_reason).toBe("readers disagree on an expression");
    expect(page44a?.expression_disagreements).toEqual(["examples[b:0]"]);
    expect(page44a?.answer_disagreements).toBeUndefined();

    expect(report.pages_sent_to_person?.map((p) => ({ ref: p.source_ref, reason: p.reason }))).toEqual([
      { ref: "sample:M:42a", reason: "readers disagree on an expression" },
      {
        ref: "sample:M:43a",
        reason: "readers disagree on an answer; readers disagree on an expression",
      },
      { ref: "sample:M:44a", reason: "readers disagree on an expression" },
    ]);

    const md = readFileSync(join(work, "final", "report.md"), "utf8");
    expect(md).toContain("sent to a person (readers disagree on an expression)");
    expect(md).toContain(
      "sent to a person (readers disagree on an answer; readers disagree on an expression)",
    );
    expect(md).toContain("- Expression disagreements (readers disagree on an expression):");
    expect(md).toContain("  - `sections[0].items[n=1].expr.op`");
    expect(md).toContain("  - `examples[b:0]`");

    const savedReport = JSON.parse(readFileSync(join(work, "final", "report.json"), "utf8")) as typeof report;
    expect(savedReport.pages.find((p) => p.source_ref === "sample:M:42a")?.expression_disagreements).toEqual([
      "sections[0].items[n=1].expr.op",
      "sections[0].items[n=1].expr.operands[0]",
      "sections[0].items[n=1].expr.operands[1]",
    ]);
  });

  it("stops on a malformed previous report.json, naming the file, before it writes or removes anything", () => {
    const setUpEditedWork = () => {
      const repo = mkdtempSync(join(tmpdir(), "ref-cmp-badreport-repo-"));
      const work = mkdtempSync(join(tmpdir(), "ref-cmp-badreport-work-"));
      tempDirs.push(repo, work);
      for (const [slot, family] of [
        ["a", "claude"],
        ["b", "codex"],
      ] as const) {
        const dir = join(work, `reader-${slot}`);
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, "reader.json"), JSON.stringify({ family, model: "m1" }));
        writeFileSync(join(dir, "sample-M-3a.json"), JSON.stringify(makePage()));
        writeFileSync(
          join(dir, "run.json"),
          JSON.stringify({
            slot,
            reader: { family, model: "m1" },
            source: "sample",
            photos: [
              {
                photo: "p-111111111111.jpg",
                photo_sha256: SHA_1,
                status: "ok",
                source_ref: "sample:M:3a",
                record_file: "sample-M-3a.json",
                notes: [],
              },
            ],
          }),
        );
      }
      const first = compareWorkFolder({ workDir: work, repoRoot: repo });
      const finalDir = join(work, "final");
      const recordPath = join(finalDir, "sample-M-3a.json");
      const editedText = JSON.stringify(makePage({ topic: { title: "Corrected by hand" } }));
      writeFileSync(recordPath, editedText);
      const stalePath = join(finalDir, "sample-M-6a.json");
      writeFileSync(stalePath, JSON.stringify(makePage({ source_ref: "sample:M:6a" })));
      const statusPath = join(finalDir, "status.json");
      writeFileSync(
        statusPath,
        JSON.stringify({ "sample:M:3a": "double_read", "sample:M:6a": "machine_read" }),
      );
      const validRow = {
        source_ref: "sample:M:3a",
        final_record_sha256: first.pages[0].final_record_sha256,
      };
      const reportPath = join(finalDir, "report.json");
      const viewPath = join(work, "final-view", "sample-M-3a.md");
      const keptPaths = [recordPath, stalePath, statusPath, reportPath, viewPath, join(finalDir, "report.md")];
      const run = () => compareWorkFolder({ workDir: work, repoRoot: repo });
      return { run, recordPath, editedText, stalePath, reportPath, keptPaths, validRow };
    };
    type Row = ReturnType<typeof setUpEditedWork>["validRow"];

    const stopCases: Array<[string, (valid: Row) => string]> = [
      ["pages = 42", () => JSON.stringify({ pages: 42 })],
      ["pages = {}", () => JSON.stringify({ pages: {} })],
      ["pages = [null]", () => JSON.stringify({ pages: [null] })],
      ["pages = [valid, null]", (valid) => JSON.stringify({ pages: [valid, null] })],
      ["pages = [null, valid]", (valid) => JSON.stringify({ pages: [null, valid] })],
      ['pages = "x"', () => JSON.stringify({ pages: "x" })],
      ["not JSON", () => "{ bad"],
      ["root null", () => "null"],
      ["root is a list", () => "[]"],
      ["pages null", () => JSON.stringify({ pages: null })],
      ["page id that is not a page id", (valid) => JSON.stringify({ pages: [{ ...valid, source_ref: "../../x" }] })],
      ["row is a number", () => JSON.stringify({ pages: [42] })],
      ["row is a list", () => JSON.stringify({ pages: [["sample:M:3a"]] })],
      ["hash with no source_ref", (valid) => JSON.stringify({ pages: [{ ...valid, source_ref: undefined }] })],
      ["source_ref is a number", (valid) => JSON.stringify({ pages: [{ ...valid, source_ref: 3 }] })],
      ["no source_ref and no hash", () => JSON.stringify({ pages: [{}] })],
      ["hash is a number", (valid) => JSON.stringify({ pages: [{ ...valid, final_record_sha256: 7 }] })],
      [
        "two hashes for one page",
        (valid) => JSON.stringify({ pages: [valid, { ...valid, final_record_sha256: "0".repeat(64) }] }),
      ],
    ];
    for (const [name, reportText] of stopCases) {
      const work = setUpEditedWork();
      writeFileSync(work.reportPath, reportText(work.validRow));
      const before = work.keptPaths.map((path) => readFileSync(path));
      let message = "";
      try {
        work.run();
      } catch (err) {
        message = (err as Error).message;
      }
      expect(message, name).toContain(work.reportPath);
      expect(work.keptPaths.map((path) => readFileSync(path)), name).toEqual(before);
    }

    // A report that can be read and names no hash does not stop the run.
    const continueCases: Array<[string, unknown]> = [
      ["pages absent", {}],
      ["pages empty", { pages: [] }],
      ["row without a hash", { pages: [{ source_ref: "sample:M:3a" }] }],
      ["row with a null hash", { pages: [{ source_ref: "sample:M:3a", final_record_sha256: null }] }],
    ];
    for (const [name, report] of continueCases) {
      const work = setUpEditedWork();
      writeFileSync(work.reportPath, JSON.stringify(report));
      expect(work.run().pages[0].edited_by_person, name).toBeUndefined();
    }

    // The control: the valid row keeps the edited record.
    const control = setUpEditedWork();
    writeFileSync(control.reportPath, JSON.stringify({ pages: [control.validRow] }));
    expect(control.run().pages[0].edited_by_person).toBe(true);
    expect(readFileSync(control.recordPath, "utf8")).toBe(control.editedText);
    expect(existsSync(control.stalePath)).toBe(false);
  });
});
