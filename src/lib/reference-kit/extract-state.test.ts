import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { PageRecord } from "@/lib/reference-record";
import {
  findHumanCheckedRefs,
  mergeRunEntries,
  persistSlotResult,
  pruneRemovedPhotos,
} from "./extract-state";
import type { PhotosManifest } from "./prepare";
import type { PhotoRunEntry } from "./read";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

const SHA_1 = "1".repeat(64);
const SHA_2 = "2".repeat(64);
const SHA_3 = "3".repeat(64);

function makePage(sourceRef: string): PageRecord {
  return {
    kind: "page",
    source_ref: sourceRef,
    topic: { title: "Adding Numbers", number: 1 },
    sections: [
      {
        instruction: "Add.",
        scaffolds: [],
        items: [
          {
            n: 1,
            printed: "1 + 2 =",
            form: "horizontal",
            expr: { kind: "arith", op: "add", operands: [1, 2] },
            responses: [
              { position: "after_equals", cue: null, answer: "3", answer_source: "computed" },
            ],
          },
        ],
      },
    ],
    examples: [],
    score_bands: [[0, 0], [1, 1], [2, 2], [3, 3], [4, "open"]],
    readers: ["codex"],
  };
}

describe("extract-state", () => {
  it("merges run.json entries by photo_sha256 while keeping untouched digests", () => {
    const existing: PhotoRunEntry[] = [
      { photo: `${SHA_1.slice(0, 12)}.jpg`, photo_sha256: SHA_1, original_name: "01.jpg", status: "cli_error", reason: "timeout", notes: [] },
      { photo: `${SHA_2.slice(0, 12)}.jpg`, photo_sha256: SHA_2, original_name: "02.jpg", status: "ok", source_ref: "sample:M:4a", record_file: "sample-M-4a.json", notes: [] },
    ];
    const updated: PhotoRunEntry[] = [
      { photo: `${SHA_1.slice(0, 12)}.jpg`, photo_sha256: SHA_1, original_name: "01.jpg", status: "ok", source_ref: "sample:M:3a", record_file: "sample-M-3a.json", notes: [] },
      { photo: `${SHA_3.slice(0, 12)}.jpg`, photo_sha256: SHA_3, original_name: "03.jpg", status: "ok", source_ref: "sample:M:5a", record_file: "sample-M-5a.json", notes: [] },
    ];

    const merged = mergeRunEntries(existing, updated);
    expect(merged.map((e) => [e.photo_sha256, e.status, e.source_ref])).toEqual([
      [SHA_1, "ok", "sample:M:3a"],
      [SHA_2, "ok", "sample:M:4a"],
      [SHA_3, "ok", "sample:M:5a"],
    ]);
  });

  it("prunes removed photos completely while keeping human_checked pages and their photos", () => {
    const repo = mkdtempSync(join(tmpdir(), "ref-st-repo-"));
    const workDir = mkdtempSync(join(tmpdir(), "ref-st-work-"));
    tempDirs.push(repo, workDir);

    const preparedPhotosDir = join(workDir, "photos");
    const slotDirA = join(workDir, "reader-a");
    const slotDirB = join(workDir, "reader-b");
    const finalDir = join(workDir, "final");
    const viewDir = join(workDir, "final-view");
    for (const dir of [preparedPhotosDir, slotDirA, slotDirB, finalDir, viewDir]) {
      mkdirSync(dir, { recursive: true });
    }

    const file1 = `${SHA_1.slice(0, 12)}.jpg`;
    const file2 = `${SHA_2.slice(0, 12)}.jpg`;
    writeFileSync(join(preparedPhotosDir, file1), "photo1");
    writeFileSync(join(preparedPhotosDir, file2), "photo2");
    writeFileSync(join(slotDirA, "sample-M-3a.json"), JSON.stringify(makePage("sample:M:3a")));
    writeFileSync(join(slotDirB, "sample-M-3a.json"), JSON.stringify(makePage("sample:M:3a")));
    writeFileSync(join(slotDirA, "sample-M-4a.json"), JSON.stringify(makePage("sample:M:4a")));
    writeFileSync(join(slotDirB, "sample-M-4a.json"), JSON.stringify(makePage("sample:M:4a")));
    writeFileSync(join(finalDir, "sample-M-3a.json"), JSON.stringify(makePage("sample:M:3a")));
    writeFileSync(join(viewDir, "sample-M-3a.md"), "# 3a\n");
    writeFileSync(join(finalDir, "sample-M-4a.json"), JSON.stringify(makePage("sample:M:4a")));
    writeFileSync(join(viewDir, "sample-M-4a.md"), "# 4a\n");
    writeFileSync(
      join(finalDir, "status.json"),
      JSON.stringify({ "sample:M:3a": "double_read", "sample:M:4a": "human_checked" }),
    );

    const manifest: PhotosManifest = {
      version: 1,
      photos: [
        { file: file1, sha256: SHA_1, original_name: "01.jpg", width: 1600, height: 1200, source_ref: "sample:M:3a" },
        { file: file2, sha256: SHA_2, original_name: "02.jpg", width: 1600, height: 1200, source_ref: "sample:M:4a" },
      ],
    };
    const entries: PhotoRunEntry[] = [
      { photo: file1, photo_sha256: SHA_1, original_name: "01.jpg", status: "ok", source_ref: "sample:M:3a", record_file: "sample-M-3a.json", notes: [] },
      { photo: file2, photo_sha256: SHA_2, original_name: "02.jpg", status: "ok", source_ref: "sample:M:4a", record_file: "sample-M-4a.json", notes: [] },
    ];

    const humanCheckedRefs = findHumanCheckedRefs(workDir);
    expect([...humanCheckedRefs]).toEqual(["sample:M:4a"]);

    const pruned = pruneRemovedPhotos({
      presentDigests: new Set<string>(),
      manifest,
      entriesA: entries,
      entriesB: entries,
      humanCheckedRefs,
      workDir,
      preparedPhotosDir,
      slotDirA,
      slotDirB,
      repoRoot: repo,
    });

    // 3a was removed completely
    expect(existsSync(join(preparedPhotosDir, file1))).toBe(false);
    expect(existsSync(join(slotDirA, "sample-M-3a.json"))).toBe(false);
    expect(existsSync(join(slotDirB, "sample-M-3a.json"))).toBe(false);
    expect(existsSync(join(finalDir, "sample-M-3a.json"))).toBe(false);
    expect(existsSync(join(viewDir, "sample-M-3a.md"))).toBe(false);

    // 4a (human_checked) and its prepared photo are kept
    expect(existsSync(join(preparedPhotosDir, file2))).toBe(true);
    expect(existsSync(join(finalDir, "sample-M-4a.json"))).toBe(true);
    expect(existsSync(join(viewDir, "sample-M-4a.md"))).toBe(true);
    expect(pruned.manifest.photos.map((p) => p.sha256)).toEqual([SHA_2]);
    expect(pruned.entriesA.map((e) => e.photo_sha256)).toEqual([SHA_2]);
    expect(pruned.removedPhotos).toEqual([
      {
        original_name: "01.jpg",
        photo: file1,
        photo_sha256: SHA_1,
        source_ref: "sample:M:3a",
        kept_human_checked: false,
      },
      {
        original_name: "02.jpg",
        photo: file2,
        photo_sha256: SHA_2,
        source_ref: "sample:M:4a",
        kept_human_checked: true,
      },
    ]);
  });

  it("writes distinct record files when two photos claim the same source_ref in one slot", () => {
    const repo = mkdtempSync(join(tmpdir(), "ref-st-dup-repo-"));
    const slotDir = mkdtempSync(join(tmpdir(), "ref-st-dup-slot-"));
    tempDirs.push(repo, slotDir);

    const first = persistSlotResult({
      slotDir,
      preparedFile: `${SHA_1.slice(0, 12)}.jpg`,
      originalName: "01.jpg",
      sha256: SHA_1,
      result: { status: "ok", record: makePage("sample:M:3a"), notes: [] },
      existingEntries: [],
      repoRoot: repo,
    });
    const second = persistSlotResult({
      slotDir,
      preparedFile: `${SHA_2.slice(0, 12)}.jpg`,
      originalName: "02.jpg",
      sha256: SHA_2,
      result: { status: "ok", record: makePage("sample:M:3a"), notes: [] },
      existingEntries: [first],
      repoRoot: repo,
    });

    expect(first.status).toBe("ok");
    expect(second.status).toBe("ok");
    expect(first.record_file).toBeDefined();
    expect(second.record_file).toBeDefined();
    expect(first.record_file).not.toBe(second.record_file);
    expect(readFileSync(join(slotDir, first.record_file!), "utf8")).toContain("sample:M:3a");
    expect(readFileSync(join(slotDir, second.record_file!), "utf8")).toContain("sample:M:3a");
  });
});
