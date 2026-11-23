import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildReferencePhotoPath,
  formatImportResult,
  importReferenceRecords,
  MAX_REFERENCE_PHOTO_BYTES,
  type ExistingReferenceRow,
  type ReferenceRow,
  type ReferenceStore,
} from "./import";
import type { PageRecord } from "./types";

function makePage(sourceRef: string, topicTitle = "Adding small numbers"): PageRecord {
  return {
    kind: "page",
    source_ref: sourceRef,
    topic: { title: topicTitle, number: 1 },
    sections: [
      {
        instruction: "Find each sum.",
        scaffolds: [],
        items: [
          {
            n: 1,
            printed: "3 + 4 =",
            form: "horizontal",
            expr: { kind: "arith", op: "add", operands: [3, 4] },
            responses: [
              {
                position: "after_equals",
                cue: null,
                answer: "7",
                answer_source: "computed",
              },
            ],
          },
        ],
      },
    ],
    examples: [],
    score_bands: [[0, 0], [1, 1], [2, 2], [3, 3], [4, "open"]],
  };
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

class PhotoMemoryStore implements ReferenceStore {
  rows = new Map<string, ReferenceRow>();
  objects = new Map<string, { bytes: Uint8Array; contentType: string }>();
  calls: string[] = [];
  onBeforeUpload?: () => void;

  async findExisting(sourceRefs: string[]): Promise<Map<string, ExistingReferenceRow>> {
    this.calls.push(`findExisting:${sourceRefs.join(",")}`);
    const out = new Map<string, ExistingReferenceRow>();
    for (const ref of sourceRefs) {
      const row = this.rows.get(ref);
      if (row) {
        out.set(ref, {
          transcript: structuredClone(row.transcript),
          path: row.path,
          transcript_status: row.transcript_status,
        });
      }
    }
    return out;
  }

  async insertRow(row: ReferenceRow): Promise<boolean> {
    this.calls.push(`insertRow:${row.source_ref}`);
    if (this.rows.has(row.source_ref)) {
      return false;
    }
    this.rows.set(row.source_ref, structuredClone(row));
    return true;
  }

  async objectSha256(path: string): Promise<string | null> {
    this.calls.push(`objectSha256:${path}`);
    const existing = this.objects.get(path);
    return existing ? sha256Hex(existing.bytes) : null;
  }

  async uploadObject(path: string, bytes: Uint8Array, contentType: string): Promise<void> {
    this.onBeforeUpload?.();
    this.calls.push(`uploadObject:${path}`);
    if (this.objects.has(path)) {
      throw new Error(`Unexpected overwrite of existing object ${path}`);
    }
    this.objects.set(path, { bytes: new Uint8Array(bytes), contentType });
  }
}

describe("buildReferencePhotoPath", () => {
  it("builds <source>/<level>/<page>.<ext> for jpg, jpeg, png and webp", () => {
    expect(buildReferencePhotoPath("sample:M:3a", "IMG_0001.JPG")).toEqual({
      ok: true,
      path: "sample/M/3a.jpg",
      contentType: "image/jpeg",
    });
    expect(buildReferencePhotoPath("sample:M:3b", "photo.jpeg")).toEqual({
      ok: true,
      path: "sample/M/3b.jpeg",
      contentType: "image/jpeg",
    });
    expect(buildReferencePhotoPath("sample:M:contents", "chart.png")).toEqual({
      ok: true,
      path: "sample/M/contents.png",
      contentType: "image/png",
    });
    expect(buildReferencePhotoPath("sample:M:4a", "scan.webp")).toEqual({
      ok: true,
      path: "sample/M/4a.webp",
      contentType: "image/webp",
    });
  });

  it("rejects invalid path segments, unsupported extensions, and inherited object property extensions", () => {
    expect(buildReferencePhotoPath("sample:../M:3a", "IMG_0001.jpg").ok).toBe(false);
    expect(buildReferencePhotoPath("sample:M:3a/x", "IMG_0001.jpg").ok).toBe(false);
    expect(buildReferencePhotoPath("sample:M:3a", "IMG_0001.gif").ok).toBe(false);
    expect(buildReferencePhotoPath("sample:M:3a", "IMG_0001").ok).toBe(false);
    expect(buildReferencePhotoPath("sample:M:3a", "mask.constructor").ok).toBe(false);
    expect(buildReferencePhotoPath("sample:M:3a", "mask.toString").ok).toBe(false);
    expect(buildReferencePhotoPath("sample:M:3a", "mask.__proto__").ok).toBe(false);
    expect(buildReferencePhotoPath("sample:M:3a", "mask.valueOf").ok).toBe(false);
  });
});

describe("importReferenceRecords photo and file safety", () => {
  let rootDir: string;
  let recordsDir: string;
  let photosDir: string;
  let outsideDir: string;
  let store: PhotoMemoryStore;

  beforeEach(() => {
    rootDir = mkdtempSync(join(tmpdir(), "unica-ref-photo-test-"));
    recordsDir = join(rootDir, "records");
    photosDir = join(rootDir, "photos");
    outsideDir = join(rootDir, "outside");
    store = new PhotoMemoryStore();
  });

  afterEach(() => {
    rmSync(rootDir, { recursive: true, force: true });
  });

  function writeJson(dir: string, name: string, value: unknown): void {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, name), `${JSON.stringify(value, null, 2)}\n`, "utf8");
  }

  function writeBytes(dir: string, name: string, bytes: Uint8Array): void {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, name), bytes);
  }

  it("refuses inherited property extension names such as mask.constructor before any write", async () => {
    writeJson(recordsDir, "p1.json", makePage("sample:M:1a"));
    writeJson(recordsDir, "p2.json", makePage("sample:M:2a"));

    const img1 = new Uint8Array([1, 2, 3]);
    const img2 = new Uint8Array([4, 5, 6]);
    writeBytes(photosDir, "ok.jpg", img1);
    writeBytes(photosDir, "mask.constructor", img2);
    writeJson(photosDir, "masked-manifest.json", {
      version: 1,
      photos: [
        {
          file: "ok.jpg",
          sha256: sha256Hex(img1),
          confirmed: true,
          confirmed_at: "2026-01-01T00:00:00.000Z",
          source_ref: "sample:M:1a",
        },
        {
          file: "mask.constructor",
          sha256: sha256Hex(img2),
          confirmed: true,
          confirmed_at: "2026-01-01T00:00:00.000Z",
          source_ref: "sample:M:2a",
        },
      ],
    });

    const res = await importReferenceRecords({ recordsDir, photosDir, store });
    expect(res.ok).toBe(false);
    expect(store.rows.size).toBe(0);
    expect(store.objects.size).toBe(0);
    expect(store.calls).toEqual([]);
    expect(res.problems.some((p) => p.includes("mask.constructor"))).toBe(true);
  });

  it("refuses an empty photo and a photo above the bucket size limit before any write", async () => {
    writeJson(recordsDir, "p1.json", makePage("sample:M:3a"));
    writeJson(recordsDir, "p2.json", makePage("sample:M:3b"));
    const tooLarge = new Uint8Array(MAX_REFERENCE_PHOTO_BYTES + 1);
    const empty = new Uint8Array(0);
    writeBytes(photosDir, "big.jpg", tooLarge);
    writeBytes(photosDir, "empty.png", empty);
    writeJson(photosDir, "masked-manifest.json", {
      version: 1,
      photos: [
        {
          file: "big.jpg",
          sha256: sha256Hex(tooLarge),
          confirmed: true,
          confirmed_at: "2026-01-01T00:00:00.000Z",
          source_ref: "sample:M:3a",
        },
        {
          file: "empty.png",
          sha256: sha256Hex(empty),
          confirmed: true,
          confirmed_at: "2026-01-01T00:00:00.000Z",
          source_ref: "sample:M:3b",
        },
      ],
    });

    const res = await importReferenceRecords({ recordsDir, photosDir, store, dryRun: true });
    expect(res.ok).toBe(false);
    expect(res.problems.filter((p) => p.includes("file size"))).toHaveLength(2);
    expect(store.calls.some((c) => c.startsWith("insertRow:") || c.startsWith("uploadObject:"))).toBe(
      false,
    );
  });

  it("stops with a plain message when a row insert fails after its photo upload, and a second run finishes the work", async () => {
    writeJson(recordsDir, "p1.json", makePage("sample:M:3a"));
    writeJson(recordsDir, "p2.json", makePage("sample:M:3b"));
    const img1 = new Uint8Array([1, 2, 3, 4]);
    const img2 = new Uint8Array([5, 6, 7, 8]);
    writeBytes(photosDir, "one.jpg", img1);
    writeBytes(photosDir, "two.png", img2);
    writeJson(photosDir, "masked-manifest.json", {
      version: 1,
      photos: [
        {
          file: "one.jpg",
          sha256: sha256Hex(img1),
          confirmed: true,
          confirmed_at: "2026-01-01T00:00:00.000Z",
          source_ref: "sample:M:3a",
        },
        {
          file: "two.png",
          sha256: sha256Hex(img2),
          confirmed: true,
          confirmed_at: "2026-01-01T00:00:00.000Z",
          source_ref: "sample:M:3b",
        },
      ],
    });

    const realInsert = store.insertRow.bind(store);
    store.insertRow = async (row) => {
      if (row.source_ref === "sample:M:3b") throw new Error("database is not reachable");
      return realInsert(row);
    };
    const first = await importReferenceRecords({ recordsDir, photosDir, store });
    expect(first.ok).toBe(false);
    expect(first.stopped).toBe(true);
    expect(first.counts.inserted).toBe(1);
    expect(first.problems.some((p) => p.includes("sample/M/3b.png") && p.includes("reuses"))).toBe(
      true,
    );
    expect(store.objects.has("sample/M/3b.png")).toBe(true);
    expect(store.rows.has("sample:M:3b")).toBe(false);

    store.insertRow = realInsert;
    const second = await importReferenceRecords({ recordsDir, photosDir, store });
    expect(second.ok).toBe(true);
    expect(second.counts).toMatchObject({ inserted: 1, skipped: 1, photosUploaded: 0 });
    expect(store.rows.get("sample:M:3b")?.path).toBe("sample/M/3b.png");
  });

  it("names an uploaded photo that no row points to when another run writes the row first", async () => {
    writeJson(recordsDir, "p1.json", makePage("sample:M:3a"));
    const img = new Uint8Array([1, 2, 3, 4]);
    writeBytes(photosDir, "one.jpg", img);
    writeJson(photosDir, "masked-manifest.json", {
      version: 1,
      photos: [
        {
          file: "one.jpg",
          sha256: sha256Hex(img),
          confirmed: true,
          confirmed_at: "2026-01-01T00:00:00.000Z",
          source_ref: "sample:M:3a",
        },
      ],
    });

    // Another run wins the insert with a photo at a different path.
    store.insertRow = async (row) => {
      store.rows.set(row.source_ref, { ...structuredClone(row), path: "sample/M/3a.png" });
      return false;
    };
    const res = await importReferenceRecords({ recordsDir, photosDir, store });
    expect(res.ok).toBe(true);
    expect(res.counts).toMatchObject({ inserted: 0, skipped: 1, photosUploaded: 1 });
    expect(res.unreferencedPhotos).toEqual(["sample/M/3a.jpg"]);
    expect(formatImportResult(res)).toContain('unreferenced_photo: "sample/M/3a.jpg"');
  });

  it("refuses before any write when a stored object at the planned path has a different sha256", async () => {
    writeJson(recordsDir, "p1.json", makePage("sample:M:3a"));
    writeJson(recordsDir, "p2.json", makePage("sample:M:3b"));

    const img1 = new Uint8Array([1, 2, 3, 4]);
    const img2Old = new Uint8Array([99, 98, 97]);
    const img2New = new Uint8Array([5, 6, 7, 8]);
    writeBytes(photosDir, "IMG_0001.jpg", img1);
    writeBytes(photosDir, "IMG_0002.png", img2New);
    writeJson(photosDir, "masked-manifest.json", {
      version: 1,
      photos: [
        {
          file: "IMG_0001.jpg",
          sha256: sha256Hex(img1),
          confirmed: true,
          confirmed_at: "2026-01-01T00:00:00.000Z",
          source_ref: "sample:M:3a",
        },
        {
          file: "IMG_0002.png",
          sha256: sha256Hex(img2New),
          confirmed: true,
          confirmed_at: "2026-01-01T00:00:00.000Z",
          source_ref: "sample:M:3b",
        },
      ],
    });

    store.objects.set("sample/M/3b.png", {
      bytes: img2Old,
      contentType: "image/png",
    });

    const res = await importReferenceRecords({ recordsDir, photosDir, store });
    expect(res.ok).toBe(false);
    expect(store.rows.size).toBe(0);
    expect(store.objects.has("sample/M/3a.jpg")).toBe(false);
    expect(store.calls.some((c) => c.startsWith("insertRow:") || c.startsWith("uploadObject:"))).toBe(
      false,
    );
    expect(
      res.problems.some(
        (p) => p.includes("sample/M/3b.png") && p.toLowerCase().includes("by hand"),
      ),
    ).toBe(true);
  });

  it("refuses symlinks for record files, status.json, masked-manifest.json, and photos before any write", async () => {
    mkdirSync(recordsDir, { recursive: true });
    mkdirSync(photosDir, { recursive: true });
    mkdirSync(outsideDir, { recursive: true });

    // 1. Symlink record file
    writeJson(outsideDir, "secret-record.json", makePage("sample:M:1a"));
    symlinkSync(join(outsideDir, "secret-record.json"), join(recordsDir, "p1.json"));
    const recRes = await importReferenceRecords({ recordsDir, store });
    expect(recRes.ok).toBe(false);
    expect(store.calls).toEqual([]);
    expect(recRes.problems.some((p) => p.includes("p1.json") && p.includes("symlink"))).toBe(true);
    rmSync(join(recordsDir, "p1.json"));

    // 2. Symlink status.json
    writeJson(recordsDir, "p1.json", makePage("sample:M:1a"));
    writeJson(outsideDir, "status.json", { "sample:M:1a": "human_checked" });
    symlinkSync(join(outsideDir, "status.json"), join(recordsDir, "status.json"));
    const statusRes = await importReferenceRecords({ recordsDir, store });
    expect(statusRes.ok).toBe(false);
    expect(store.calls).toEqual([]);
    expect(statusRes.problems.some((p) => p.includes("status.json") && p.includes("symlink"))).toBe(
      true,
    );
    rmSync(join(recordsDir, "status.json"));

    // 3. Symlink masked-manifest.json
    const img = new Uint8Array([1, 2, 3, 4]);
    writeBytes(photosDir, "IMG_0001.jpg", img);
    writeJson(outsideDir, "masked-manifest.json", {
      version: 1,
      photos: [
        {
          file: "IMG_0001.jpg",
          sha256: sha256Hex(img),
          confirmed: true,
          confirmed_at: "2026-01-01T00:00:00.000Z",
          source_ref: "sample:M:1a",
        },
      ],
    });
    symlinkSync(join(outsideDir, "masked-manifest.json"), join(photosDir, "masked-manifest.json"));
    const manifestRes = await importReferenceRecords({ recordsDir, photosDir, store });
    expect(manifestRes.ok).toBe(false);
    expect(store.calls).toEqual([]);
    expect(
      manifestRes.problems.some(
        (p) => p.includes("masked-manifest.json") && p.includes("symlink"),
      ),
    ).toBe(true);
    rmSync(join(photosDir, "masked-manifest.json"));

    // 4. Symlink photo file (even when target is inside photosDir)
    writeBytes(photosDir, "real.jpg", img);
    symlinkSync(join(photosDir, "real.jpg"), join(photosDir, "link.jpg"));
    writeJson(photosDir, "masked-manifest.json", {
      version: 1,
      photos: [
        {
          file: "link.jpg",
          sha256: sha256Hex(img),
          confirmed: true,
          confirmed_at: "2026-01-01T00:00:00.000Z",
          source_ref: "sample:M:1a",
        },
      ],
    });
    const photoLinkRes = await importReferenceRecords({ recordsDir, photosDir, store });
    expect(photoLinkRes.ok).toBe(false);
    expect(store.calls).toEqual([]);
    expect(
      photoLinkRes.problems.some((p) => p.includes("link.jpg") && p.includes("symlink")),
    ).toBe(true);
  });

  it("refuses manifest file values that contain path separators, double dots, or point to non-regular files", async () => {
    writeJson(recordsDir, "p1.json", makePage("sample:M:1a"));
    writeJson(recordsDir, "p2.json", makePage("sample:M:2a"));
    writeJson(recordsDir, "p3.json", makePage("sample:M:3a"));

    const img = new Uint8Array([1, 2, 3, 4]);
    writeBytes(join(photosDir, "sub"), "nested.jpg", img);
    mkdirSync(join(photosDir, "dir-as-photo.jpg"), { recursive: true });
    writeJson(photosDir, "masked-manifest.json", {
      version: 1,
      photos: [
        {
          file: "sub/nested.jpg",
          sha256: sha256Hex(img),
          confirmed: true,
          confirmed_at: "2026-01-01T00:00:00.000Z",
          source_ref: "sample:M:1a",
        },
        {
          file: "a..b.jpg",
          sha256: sha256Hex(img),
          confirmed: true,
          confirmed_at: "2026-01-01T00:00:00.000Z",
          source_ref: "sample:M:2a",
        },
        {
          file: "dir-as-photo.jpg",
          sha256: sha256Hex(img),
          confirmed: true,
          confirmed_at: "2026-01-01T00:00:00.000Z",
          source_ref: "sample:M:3a",
        },
      ],
    });

    const res = await importReferenceRecords({ recordsDir, photosDir, store });
    expect(res.ok).toBe(false);
    expect(store.calls).toEqual([]);
    expect(res.problems.some((p) => p.includes("sub/nested.jpg"))).toBe(true);
    expect(res.problems.some((p) => p.includes("a..b.jpg"))).toBe(true);
    expect(res.problems.some((p) => p.includes("dir-as-photo.jpg") && p.includes("not a regular file"))).toBe(
      true,
    );
  });

  it("reads each photo once into memory, hashes those bytes, and uploads those same bytes", async () => {
    writeJson(recordsDir, "p1.json", makePage("sample:M:3a"));
    const original = new Uint8Array([11, 22, 33, 44]);
    writeBytes(photosDir, "IMG_0001.jpg", original);
    writeJson(photosDir, "masked-manifest.json", {
      version: 1,
      photos: [
        {
          file: "IMG_0001.jpg",
          sha256: sha256Hex(original),
          confirmed: true,
          confirmed_at: "2026-01-01T00:00:00.000Z",
          source_ref: "sample:M:3a",
        },
      ],
    });

    // Mutate the file on disk after validation read; upload must still send the hashed in-memory bytes.
    store.onBeforeUpload = () => {
      writeBytes(photosDir, "IMG_0001.jpg", new Uint8Array([99, 99, 99, 99]));
    };

    const res = await importReferenceRecords({ recordsDir, photosDir, store });
    expect(res.ok).toBe(true);
    expect(store.objects.get("sample/M/3a.jpg")?.bytes).toEqual(original);
  });

  it("handles prototype property names as manifest source_ref entries without inherited-key collisions", async () => {
    writeJson(recordsDir, "p1.json", makePage("sample:M:1a"));
    writeJson(photosDir, "masked-manifest.json", {
      version: 1,
      photos: [
        {
          file: "a.jpg",
          sha256: "a".repeat(64),
          confirmed: true,
          confirmed_at: "2026-01-01T00:00:00.000Z",
          source_ref: "__proto__",
        },
        {
          file: "b.jpg",
          sha256: "b".repeat(64),
          confirmed: true,
          confirmed_at: "2026-01-01T00:00:00.000Z",
          source_ref: "constructor",
        },
        {
          file: "c.jpg",
          sha256: "c".repeat(64),
          confirmed: true,
          confirmed_at: "2026-01-01T00:00:00.000Z",
          source_ref: "toString",
        },
      ],
    });

    const res = await importReferenceRecords({ recordsDir, photosDir, store });
    expect(res.ok).toBe(true);
    expect(res.counts.inserted).toBe(1);
    expect(store.rows.get("sample:M:1a")?.path).toBeNull();
  });
});
