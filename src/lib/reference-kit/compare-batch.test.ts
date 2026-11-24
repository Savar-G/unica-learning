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
import type { PageRecord } from "@/lib/reference-record";
import { checkAndMarkPage } from "./check";
import { compareWorkFolder } from "./compare-batch";

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

const SHA_1 = "1".repeat(64);
const SHA_2 = "2".repeat(64);
const SHA_3 = "3".repeat(64);

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
    expect(md).toContain("A person must read the prose on this page");
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
    expect(report.pages[0].differences.some((d) => d.path === "source_ref")).toBe(true);
    expect(report.pages[0].differences.some((d) => d.path === "examples[0].parts[0].form")).toBe(
      true,
    );
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
    expect(status).toEqual({ "sample:M:3a": "machine_read", "sample:M:4a": "human_checked" });
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

    const report = compareWorkFolder({ workDir: work, repoRoot: repo });
    const finalOf = (slug: string) => JSON.parse(readFileSync(join(work, "final", `${slug}.json`), "utf8")) as PageRecord;

    const page3a = report.pages.find((p) => p.source_ref === "sample:M:3a");
    expect(finalOf("sample-M-3a").readers).toEqual(["claude:c1", "codex:x1"]);
    expect(finalOf("sample-M-3a").sections[0].scaffolds).toEqual([]);
    expect(page3a?.status).toBe("machine_read");
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
    expect(md).toContain("only reader b has it; belongs in the final record at `sections[0].scaffolds[]`");
    expect(md).toContain("Answer places with no answer");
    expect(md).toContain("`sections[0].items[n=1].responses[0]`");
    // A person edits the final record of 3a. Its once-read path is given only where the entry is.
    const edited = finalOf("sample-M-3a");
    edited.sections[0].scaffolds = [{ kind: "caption", applies_to: "all", text: "Sample caption" }, arrow];
    writeFileSync(join(work, "final", "sample-M-3a.json"), JSON.stringify(edited, null, 2));
    const withCopy = compareWorkFolder({ workDir: work, repoRoot: repo }).pages.find((p) => p.source_ref === "sample:M:3a");
    expect(withCopy?.edited_by_person).toBe(true);
    expect(withCopy?.once_read[0].final_path).toBe("sections[0].scaffolds[1]");
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
    expect(readFileSync(join(work, "final", "report.md"), "utf8")).toMatch(/\| sample:M:4a \| [^|]+ \| machine_read \| 0 \| 0 \| 0 \| 0 \|/);

    checkAndMarkPage({ workDir: work, page: "sample:M:4a", repoRoot: repo, photoCompared: true });
    // The person clears the answer of the checked record: compare lists it, and check refuses.
    const cleared = finalOf("sample-M-4a");
    cleared.sections[0].items[0].responses[0] = { position: "box", cue: null, answer: null, answer_source: "unchecked" };
    writeFileSync(join(work, "final", "sample-M-4a.json"), JSON.stringify(cleared, null, 2));
    const afterClear = page4aOf();
    expect(afterClear?.status).toBe("human_checked");
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
});

