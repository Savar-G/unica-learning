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
    checkAndMarkPage({ workDir: work, page: "sample:M:3a", repoRoot: repo });
    checkAndMarkPage({ workDir: work, page: "sample:M:4a", repoRoot: repo });

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
});
