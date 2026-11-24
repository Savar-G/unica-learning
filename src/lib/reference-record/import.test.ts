import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  deepEqualJson,
  formatImportResult,
  importReferenceRecords,
  type ExistingReferenceRow,
  type ReferenceRow,
  type ReferenceStore,
} from "./import";
import type { ContentsRecord, PageRecord } from "./types";

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

function makeContents(sourceRef: string): ContentsRecord {
  return {
    kind: "contents",
    source_ref: sourceRef,
    topics: [
      {
        n: 1,
        title: "Counting forward",
        sheets: [1, 10],
        std_time_min: [2, 3],
      },
    ],
  };
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

// A stored row also has the columns the import never sends: id, created_at and updated_at.
type StoredRow = ReferenceRow & { id?: string; created_at?: string; updated_at?: string };

class MemoryReferenceStore implements ReferenceStore {
  rows = new Map<string, StoredRow>();
  objects = new Map<string, { bytes: Uint8Array; contentType: string }>();
  calls: string[] = [];
  // Injected clock: each write takes the next tick as its time.
  private tick = 0;
  private now(): string {
    this.tick += 1;
    return `t${this.tick}`;
  }

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
    const at = this.now();
    this.rows.set(row.source_ref, {
      ...structuredClone(row),
      id: `id-${row.source_ref}`,
      created_at: at,
      updated_at: at,
    });
    return true;
  }

  async updateRow(row: ReferenceRow): Promise<boolean> {
    this.calls.push(`updateRow:${row.source_ref}`);
    const prev = this.rows.get(row.source_ref);
    if (!prev) return false;
    this.rows.set(row.source_ref, {
      ...prev,
      kind: row.kind,
      path: row.path,
      transcript: structuredClone(row.transcript),
      transcript_status: row.transcript_status,
      updated_at: this.now(),
    });
    return true;
  }

  async replaceObject(path: string, bytes: Uint8Array, contentType: string): Promise<void> {
    this.calls.push(`replaceObject:${path}`);
    this.objects.set(path, { bytes: new Uint8Array(bytes), contentType });
  }

  async objectSha256(path: string): Promise<string | null> {
    this.calls.push(`objectSha256:${path}`);
    const existing = this.objects.get(path);
    return existing ? sha256Hex(existing.bytes) : null;
  }

  async uploadObject(path: string, bytes: Uint8Array, contentType: string): Promise<void> {
    this.calls.push(`uploadObject:${path}`);
    if (this.objects.has(path)) {
      throw new Error(`Unexpected overwrite of existing object ${path}`);
    }
    this.objects.set(path, { bytes: new Uint8Array(bytes), contentType });
  }
}

describe("deepEqualJson", () => {
  it("ignores object key order and undefined properties while checking values deeply", () => {
    expect(
      deepEqualJson(
        { b: 2, a: 1, nested: { y: [1, 2], x: true }, opt: undefined },
        { a: 1, b: 2, nested: { x: true, y: [1, 2] } },
      ),
    ).toBe(true);
    expect(deepEqualJson({ a: [1, 2] }, { a: [2, 1] })).toBe(false);
    expect(deepEqualJson({ a: null }, { a: {} })).toBe(false);
  });

  it("is invariant to object key permutation across arbitrary JSON values", () => {
    const shuffleKeys = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(shuffleKeys);
      if (value && typeof value === "object") {
        const entries = Object.entries(value as Record<string, unknown>).reverse();
        return Object.fromEntries(entries.map(([k, v]) => [k, shuffleKeys(v)]));
      }
      return value;
    };

    fc.assert(
      fc.property(fc.jsonValue(), (val) => {
        expect(deepEqualJson(val, shuffleKeys(val))).toBe(true);
      }),
    );
  });
});

describe("importReferenceRecords", () => {
  let rootDir: string;
  let recordsDir: string;
  let photosDir: string;
  let store: MemoryReferenceStore;

  beforeEach(() => {
    rootDir = mkdtempSync(join(tmpdir(), "unica-ref-import-test-"));
    recordsDir = join(rootDir, "records");
    photosDir = join(rootDir, "photos");
    store = new MemoryReferenceStore();
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

  it("imports page and contents records, ignores status.json and report.json as records, and defaults status to machine_read", async () => {
    writeJson(recordsDir, "sample-M-3a.json", makePage("sample:M:3a"));
    writeJson(recordsDir, "sample-M-contents.json", makeContents("sample:M:contents"));
    writeJson(recordsDir, "report.json", { ignored: true });
    writeJson(recordsDir, "status.json", { "sample:M:contents": "human_checked" });

    const res = await importReferenceRecords({ recordsDir, store });
    expect(res.ok).toBe(true);
    expect(res.counts).toEqual({
      recordsRead: 2,
      inserted: 2,
      replaced: 0,
      skipped: 0,
      skippedDifferent: 0,
      photosUploaded: 0,
    });
    expect(store.rows.get("sample:M:3a")).toMatchObject({
      kind: "page",
      path: null,
      transcript_status: "machine_read",
    });
    expect(store.rows.get("sample:M:contents")).toMatchObject({
      kind: "contents",
      path: null,
      transcript_status: "human_checked",
    });
  });

  it("refuses the whole run and writes nothing when any record fails validation or JSON parsing", async () => {
    writeJson(recordsDir, "good.json", makePage("sample:M:1a"));
    writeJson(recordsDir, "bad.json", { ...makePage("sample:M:2a"), extra_key: "nope" });
    writeFileSync(join(recordsDir, "broken.json"), "{ not valid json", "utf8");

    const res = await importReferenceRecords({ recordsDir, store });
    expect(res.ok).toBe(false);
    expect(res.counts.recordsRead).toBe(3);
    expect(res.counts.inserted).toBe(0);
    expect(store.rows.size).toBe(0);
    expect(store.calls).toEqual([]);
    expect(res.problems.some((p) => p.includes("bad.json") && p.includes("extra_key"))).toBe(true);
    expect(res.problems.some((p) => p.includes("broken.json") && p.includes("invalid JSON"))).toBe(
      true,
    );
  });

  it("refuses the whole run and writes nothing when two files share the same source_ref", async () => {
    writeJson(recordsDir, "a.json", makePage("sample:M:3a"));
    writeJson(recordsDir, "b.json", makePage("sample:M:3a"));

    const res = await importReferenceRecords({ recordsDir, store });
    expect(res.ok).toBe(false);
    expect(store.rows.size).toBe(0);
    expect(store.calls).toEqual([]);
    expect(res.problems.some((p) => p.includes("sample:M:3a"))).toBe(true);
  });

  it("refuses unknown status values or orphan source_ref entries in status.json", async () => {
    writeJson(recordsDir, "sample-M-3a.json", makePage("sample:M:3a"));
    writeJson(recordsDir, "status.json", {
      "sample:M:3a": "verified_by_magic",
      "sample:M:99a": "double_read",
    });

    const res = await importReferenceRecords({ recordsDir, store });
    expect(res.ok).toBe(false);
    expect(store.rows.size).toBe(0);
    expect(store.calls).toEqual([]);
    expect(res.problems.some((p) => p.includes("sample:M:3a"))).toBe(true);
    expect(res.problems.some((p) => p.includes("sample:M:99a"))).toBe(true);
  });

  it("is idempotent on re-run and reports skipped_different without modifying existing rows or uploading photos", async () => {
    const page1 = makePage("sample:M:3a", "First title");
    const page2 = makePage("sample:M:4a", "Second title");
    writeJson(recordsDir, "p1.json", page1);
    writeJson(recordsDir, "p2.json", page2);

    const first = await importReferenceRecords({ recordsDir, store });
    expect(first.ok).toBe(true);
    expect(first.counts.inserted).toBe(2);

    const second = await importReferenceRecords({ recordsDir, store });
    expect(second.ok).toBe(true);
    expect(second.counts).toEqual({
      recordsRead: 2,
      inserted: 0,
      replaced: 0,
      skipped: 2,
      skippedDifferent: 0,
      photosUploaded: 0,
    });

    // Mutate page2 on disk and add a photo for page2 - existing row must not change and photo must not upload.
    writeJson(recordsDir, "p2.json", makePage("sample:M:4a", "Changed title"));
    const img = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    writeBytes(photosDir, "IMG_0002.jpg", img);
    writeJson(photosDir, "photos-manifest.json", {
      version: 1,
      photos: [
        {
          file: "IMG_0002.jpg",
          sha256: sha256Hex(img),
          original_name: "IMG_0002.jpg",
          width: 3024,
          height: 4032,
          source_ref: "sample:M:4a",
        },
      ],
    });

    const third = await importReferenceRecords({ recordsDir, photosDir, store });
    expect(third.ok).toBe(true);
    expect(third.counts).toEqual({
      recordsRead: 2,
      inserted: 0,
      replaced: 0,
      skipped: 1,
      skippedDifferent: 1,
      photosUploaded: 0,
    });
    expect(third.skippedDifferentRefs).toEqual(["sample:M:4a"]);
    expect((store.rows.get("sample:M:4a")?.transcript as PageRecord).topic.title).toBe(
      "Second title",
    );
    expect(store.objects.size).toBe(0);
    expect(formatImportResult(third)).toContain("sample:M:4a");
  });

  it("uploads matched photos before row insert, ignores unmanifested or unidentified photos, and never overwrites existing objects", async () => {
    writeJson(recordsDir, "p1.json", makePage("sample:M:3a"));
    writeJson(recordsDir, "p2.json", makePage("sample:M:3b"));
    writeJson(recordsDir, "p3.json", makePage("sample:M:4a"));

    const img1 = new Uint8Array([1, 2, 3, 4]);
    const img2 = new Uint8Array([5, 6, 7, 8]);
    const other = new Uint8Array([7, 7, 7]);
    const loose = new Uint8Array([9, 9, 9]);
    writeBytes(photosDir, "IMG_0001.jpg", img1);
    writeBytes(photosDir, "IMG_0002.png", img2);
    writeBytes(photosDir, "OTHER.jpg", other);
    writeBytes(photosDir, "UNLISTED.jpg", loose);
    writeJson(photosDir, "photos-manifest.json", {
      version: 1,
      photos: [
        {
          file: "IMG_0001.jpg",
          sha256: sha256Hex(img1),
          original_name: "IMG_0001.jpg",
          width: 3024,
          height: 4032,
          source_ref: "sample:M:3a",
        },
        {
          file: "IMG_0002.png",
          sha256: sha256Hex(img2),
          original_name: "IMG_0002.png",
          width: 3024,
          height: 4032,
          source_ref: "sample:M:3b",
        },
        {
          // Manifest entry for a record not in this batch: ignored
          file: "OTHER.jpg",
          sha256: sha256Hex(other),
          original_name: "OTHER.jpg",
          width: 3024,
          height: 4032,
          source_ref: "sample:M:99a",
        },
        {
          // No source_ref yet: ignored
          file: "UNIDENTIFIED.jpg",
          sha256: "0".repeat(64),
          original_name: "UNIDENTIFIED.jpg",
          width: 3024,
          height: 4032,
        },
      ],
    });

    // Pre-populate matching object for sample/M/3b.png so import reuses it without overwriting.
    store.objects.set("sample/M/3b.png", {
      bytes: new Uint8Array(img2),
      contentType: "image/png",
    });

    const res = await importReferenceRecords({ recordsDir, photosDir, store });
    expect(res.ok).toBe(true);
    expect(res.counts).toEqual({
      recordsRead: 3,
      inserted: 3,
      replaced: 0,
      skipped: 0,
      skippedDifferent: 0,
      photosUploaded: 1,
    });
    expect(store.rows.get("sample:M:3a")?.path).toBe("sample/M/3a.jpg");
    expect(store.rows.get("sample:M:3b")?.path).toBe("sample/M/3b.png");
    expect(store.rows.get("sample:M:4a")?.path).toBeNull();
    expect(store.objects.get("sample/M/3a.jpg")?.contentType).toBe("image/jpeg");
    expect(store.objects.get("sample/M/3b.png")?.bytes).toEqual(img2);
    expect(store.objects.has("sample/M/99a.jpg")).toBe(false);

    // Upload must happen before row insert for sample:M:3a.
    const uploadIdx = store.calls.indexOf("uploadObject:sample/M/3a.jpg");
    const insertIdx = store.calls.indexOf("insertRow:sample:M:3a");
    expect(uploadIdx).toBeGreaterThan(-1);
    expect(insertIdx).toBeGreaterThan(uploadIdx);
  });

  it("refuses the whole run when photo hash mismatches or photo file is missing", async () => {
    writeJson(recordsDir, "p1.json", makePage("sample:M:1a"));
    writeJson(recordsDir, "p3.json", makePage("sample:M:3a"));

    const img1 = new Uint8Array([1, 2, 3]);
    writeBytes(photosDir, "bad-hash.jpg", img1);
    writeJson(photosDir, "photos-manifest.json", {
      version: 1,
      photos: [
        {
          file: "bad-hash.jpg",
          sha256: "a".repeat(64),
          original_name: "bad-hash.jpg",
          width: 3024,
          height: 4032,
          source_ref: "sample:M:1a",
        },
        {
          file: "missing.jpg",
          sha256: "b".repeat(64),
          original_name: "missing.jpg",
          width: 3024,
          height: 4032,
          source_ref: "sample:M:3a",
        },
      ],
    });

    const res = await importReferenceRecords({ recordsDir, photosDir, store });
    expect(res.ok).toBe(false);
    expect(store.rows.size).toBe(0);
    expect(store.objects.size).toBe(0);
    expect(store.calls).toEqual([]);
    expect(res.problems.some((p) => p.includes("sample:M:1a") && p.includes("sha256"))).toBe(true);
    expect(res.problems.some((p) => p.includes("sample:M:3a") && p.includes("missing"))).toBe(true);
  });

  it("refuses when photos-manifest.json is missing, has traversal paths, or has duplicate source_ref entries", async () => {
    writeJson(recordsDir, "p1.json", makePage("sample:M:1a"));
    mkdirSync(photosDir, { recursive: true });

    const missingManifest = await importReferenceRecords({ recordsDir, photosDir, store });
    expect(missingManifest.ok).toBe(false);
    expect(missingManifest.problems.some((p) => p.includes("photos-manifest.json"))).toBe(true);

    writeJson(photosDir, "photos-manifest.json", {
      version: 1,
      photos: [
        {
          file: "../escape.jpg",
          sha256: "a".repeat(64),
          original_name: "escape.jpg",
          width: 3024,
          height: 4032,
          source_ref: "sample:M:1a",
        },
        {
          file: "dup.jpg",
          sha256: "b".repeat(64),
          original_name: "dup.jpg",
          width: 3024,
          height: 4032,
          source_ref: "sample:M:1a",
        },
      ],
    });

    const badManifest = await importReferenceRecords({ recordsDir, photosDir, store });
    expect(badManifest.ok).toBe(false);
    expect(store.calls).toEqual([]);
    expect(badManifest.problems.some((p) => p.includes("outside the photos folder"))).toBe(true);
    expect(badManifest.problems.some((p) => p.includes("duplicate source_ref"))).toBe(true);
  });

  it("refuses dry-run on invalid input and performs no write calls on valid dry-run", async () => {
    writeJson(recordsDir, "p1.json", makePage("sample:M:3a"));
    const img = new Uint8Array([10, 20, 30]);
    writeBytes(photosDir, "IMG_0001.jpg", img);
    writeJson(photosDir, "photos-manifest.json", {
      version: 1,
      photos: [
        {
          file: "IMG_0001.jpg",
          sha256: sha256Hex(img),
          original_name: "IMG_0001.jpg",
          width: 3024,
          height: 4032,
          source_ref: "sample:M:3a",
        },
      ],
    });

    const res = await importReferenceRecords({
      recordsDir,
      photosDir,
      dryRun: true,
      store,
    });
    expect(res.ok).toBe(true);
    expect(res.dryRun).toBe(true);
    expect(res.counts).toEqual({
      recordsRead: 1,
      inserted: 1,
      replaced: 0,
      skipped: 0,
      skippedDifferent: 0,
      photosUploaded: 1,
    });
    expect(store.rows.size).toBe(0);
    expect(store.objects.size).toBe(0);
    expect(store.calls.some((c) => c.startsWith("insertRow:") || c.startsWith("uploadObject:"))).toBe(
      false,
    );
    expect(formatImportResult(res)).toContain("Dry run");
  });

  it("refuses prototype property keys and values in status.json before any write", async () => {
    writeJson(recordsDir, "sample-M-3a.json", makePage("sample:M:3a"));
    writeFileSync(
      join(recordsDir, "status.json"),
      '{"__proto__":"machine_read","constructor":"double_read","toString":"human_checked","sample:M:3a":"toString"}\n',
      "utf8",
    );

    const res = await importReferenceRecords({ recordsDir, store });
    expect(res.ok).toBe(false);
    expect(store.rows.size).toBe(0);
    expect(store.calls).toEqual([]);
    expect(res.problems.some((p) => p.includes("__proto__"))).toBe(true);
    expect(res.problems.some((p) => p.includes("constructor"))).toBe(true);
    expect(res.problems.some((p) => p.includes("toString"))).toBe(true);
  });

  it("refuses every record before any write when one record holds text the database cannot store", async () => {
    // A null character, then half of a two-unit character (what a naive length cut leaves behind).
    for (const badTitle of ["Bad\u0000title", "Compare \u{1D465} and y".slice(0, 9)]) {
      store.rows.clear();
      writeJson(recordsDir, "p1.json", makePage("sample:M:3a"));
      writeJson(recordsDir, "p2.json", makePage("sample:M:3b", badTitle));

      const res = await importReferenceRecords({ recordsDir, store });
      expect(res.ok).toBe(false);
      expect(res.problems.some((p) => p.includes("p2.json") && p.includes("cannot store"))).toBe(
        true,
      );
      expect(store.rows.size).toBe(0);
    }
    // A whole two-unit character is fine.
    store.rows.clear();
    writeJson(recordsDir, "p2.json", makePage("sample:M:3b", "Compare \u{1D465} and y"));
    expect((await importReferenceRecords({ recordsDir, store })).ok).toBe(true);
  });

  it("reclassifies concurrent duplicate inserts as skipped or skipped_different instead of inflating inserted", async () => {
    const page1 = makePage("sample:M:3a", "Same title");
    const page2 = makePage("sample:M:4a", "Local title");
    writeJson(recordsDir, "p1.json", page1);
    writeJson(recordsDir, "p2.json", page2);

    // Simulate another writer inserting both rows after initial findExisting returns empty.
    let initialLookupDone = false;
    const baseFindExisting = store.findExisting.bind(store);
    store.findExisting = async (sourceRefs: string[]) => {
      const result = await baseFindExisting(sourceRefs);
      if (!initialLookupDone) {
        initialLookupDone = true;
        store.rows.set("sample:M:3a", {
          source_ref: "sample:M:3a",
          kind: "page",
          path: null,
          transcript: structuredClone(page1),
          transcript_status: "machine_read",
        });
        store.rows.set("sample:M:4a", {
          source_ref: "sample:M:4a",
          kind: "page",
          path: null,
          transcript: makePage("sample:M:4a", "Concurrent different title"),
          transcript_status: "machine_read",
        });
      }
      return result;
    };

    const res = await importReferenceRecords({ recordsDir, store });
    expect(res.ok).toBe(true);
    expect(res.counts).toEqual({
      recordsRead: 2,
      inserted: 0,
      replaced: 0,
      skipped: 1,
      skippedDifferent: 1,
      photosUploaded: 0,
    });
    expect(res.skippedDifferentRefs).toEqual(["sample:M:4a"]);
  });

  it("CLI fails with a clear error before reading files when SUPABASE_URL or SUPABASE_SECRET_KEY is missing", () => {
    const scriptPath = resolve(process.cwd(), "scripts/reference-import.mjs");
    let failed = false;
    let stderr = "";
    try {
      execFileSync(process.execPath, [scriptPath, "--records", join(rootDir, "does-not-exist")], {
        env: { NODE_ENV: "test", PATH: process.env.PATH ?? "" },
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (err) {
      failed = true;
      const e = err as { status?: number; stderr?: string };
      expect(e.status).not.toBe(0);
      stderr = e.stderr ?? "";
    }
    expect(failed).toBe(true);
    expect(stderr).toContain("SUPABASE_URL");
    expect(stderr).toContain("SUPABASE_SECRET_KEY");
  });

  describe("with replace", () => {
    const WRITE_CALL_RE = /^(insertRow|uploadObject|replaceObject|updateRow):/;
    const oldImg = new Uint8Array([1, 2, 3, 4]);
    const newImg = new Uint8Array([5, 6, 7, 8]);

    function writeCalls(target: MemoryReferenceStore = store): string[] {
      return target.calls.filter((c) => WRITE_CALL_RE.test(c));
    }

    function rowOf(ref: string, target: MemoryReferenceStore = store): StoredRow {
      const row = target.rows.get(ref);
      if (!row) throw new Error(`no row for ${ref}`);
      return row;
    }

    function titleOf(ref: string, target: MemoryReferenceStore = store): string | null {
      return (rowOf(ref, target).transcript as PageRecord).topic.title;
    }

    function writePhotos(entries: Array<{ file: string; bytes: Uint8Array; ref: string }>): void {
      for (const e of entries) writeBytes(photosDir, e.file, e.bytes);
      writeJson(photosDir, "photos-manifest.json", {
        version: 1,
        photos: entries.map((e) => ({
          file: e.file,
          sha256: sha256Hex(e.bytes),
          original_name: e.file,
          width: 3024,
          height: 4032,
          source_ref: e.ref,
        })),
      });
    }

    it("without the flag still counts a different row as skipped_different and writes nothing", async () => {
      writeJson(recordsDir, "p1.json", makePage("sample:M:3a", "First title"));
      await importReferenceRecords({ recordsDir, store });
      writeJson(recordsDir, "p1.json", makePage("sample:M:3a", "Changed title"));
      store.calls = [];

      const res = await importReferenceRecords({ recordsDir, store });
      expect(res.counts).toMatchObject({ replaced: 0, skippedDifferent: 1 });
      expect(res.skippedDifferentRefs).toEqual(["sample:M:3a"]);
      expect(res.replacedRefs).toEqual([]);
      expect(writeCalls()).toEqual([]);
      expect(titleOf("sample:M:3a")).toBe("First title");
      expect(formatImportResult(res)).toContain("inserted=0 replaced=0 skipped=0 skipped_different=1");
    });

    it("replaces a changed transcript in place and keeps id, created_at and note", async () => {
      writeJson(recordsDir, "p1.json", makePage("sample:M:3a", "First title"));
      await importReferenceRecords({ recordsDir, store });
      rowOf("sample:M:3a").note = "kept note";
      const before = { ...rowOf("sample:M:3a") };
      writeJson(recordsDir, "p1.json", makePage("sample:M:3a", "Changed title"));
      store.calls = [];

      const res = await importReferenceRecords({ recordsDir, store, replace: true });
      expect(res.ok).toBe(true);
      expect(res.counts).toEqual({
        recordsRead: 1,
        inserted: 0,
        replaced: 1,
        skipped: 0,
        skippedDifferent: 0,
        photosUploaded: 0,
      });
      expect(res.replacedRefs).toEqual(["sample:M:3a"]);
      expect(res.statusLowered).toEqual([]);
      expect(res.leftoverPhotos).toEqual([]);
      expect(writeCalls()).toEqual(["updateRow:sample:M:3a"]);
      expect(titleOf("sample:M:3a")).toBe("Changed title");
      const after = rowOf("sample:M:3a");
      expect(after).toMatchObject({
        id: before.id,
        created_at: before.created_at,
        note: "kept note",
        path: null,
        transcript_status: "machine_read",
      });
      expect(after.updated_at).not.toBe(before.updated_at);
      expect(formatImportResult(res)).toContain("replaced: sample:M:3a");
    });

    it("replaces a status change up without a list entry, and lists every change down", async () => {
      writeJson(recordsDir, "p1.json", makePage("sample:M:3a"));
      await importReferenceRecords({ recordsDir, store });

      writeJson(recordsDir, "status.json", { "sample:M:3a": "human_checked" });
      const up = await importReferenceRecords({ recordsDir, store, replace: true });
      expect(up.counts.replaced).toBe(1);
      expect(up.statusLowered).toEqual([]);
      expect(rowOf("sample:M:3a").transcript_status).toBe("human_checked");

      writeJson(recordsDir, "status.json", { "sample:M:3a": "double_read" });
      const down = await importReferenceRecords({ recordsDir, store, replace: true });
      expect(down.counts.replaced).toBe(1);
      expect(down.statusLowered).toEqual([
        { ref: "sample:M:3a", from: "human_checked", to: "double_read" },
      ]);
      expect(rowOf("sample:M:3a").transcript_status).toBe("double_read");
      expect(formatImportResult(down)).toContain(
        "status_lowered: sample:M:3a (human_checked -> double_read)",
      );

      // A record left out of status.json is machine_read, which is also a change down.
      rmSync(join(recordsDir, "status.json"));
      const dropped = await importReferenceRecords({ recordsDir, store, replace: true });
      expect(dropped.statusLowered).toEqual([
        { ref: "sample:M:3a", from: "double_read", to: "machine_read" },
      ]);
    });

    it("overwrites the photo when only its bytes changed and touches nothing in the row but updated_at", async () => {
      writeJson(recordsDir, "p1.json", makePage("sample:M:3a"));
      writePhotos([{ file: "IMG_0001.jpg", bytes: oldImg, ref: "sample:M:3a" }]);
      await importReferenceRecords({ recordsDir, photosDir, store });
      const before = { ...rowOf("sample:M:3a") };
      writePhotos([{ file: "IMG_0001.jpg", bytes: newImg, ref: "sample:M:3a" }]);
      store.calls = [];

      const res = await importReferenceRecords({ recordsDir, photosDir, store, replace: true });
      expect(res.ok).toBe(true);
      expect(res.counts).toMatchObject({ replaced: 1, skipped: 0, photosUploaded: 1 });
      expect(writeCalls()).toEqual(["replaceObject:sample/M/3a.jpg", "updateRow:sample:M:3a"]);
      expect(store.objects.get("sample/M/3a.jpg")?.bytes).toEqual(newImg);
      const after = rowOf("sample:M:3a");
      expect({ ...after, updated_at: undefined }).toEqual({ ...before, updated_at: undefined });
      expect(after.updated_at).not.toBe(before.updated_at);
      expect(res.leftoverPhotos).toEqual([]);
    });

    it("moves the row to a new photo path and names the old object as a leftover without deleting it", async () => {
      writeJson(recordsDir, "p1.json", makePage("sample:M:3a"));
      writePhotos([{ file: "IMG_0001.jpg", bytes: oldImg, ref: "sample:M:3a" }]);
      await importReferenceRecords({ recordsDir, photosDir, store });
      writePhotos([{ file: "IMG_0001.png", bytes: newImg, ref: "sample:M:3a" }]);
      store.calls = [];

      const res = await importReferenceRecords({ recordsDir, photosDir, store, replace: true });
      expect(res.ok).toBe(true);
      expect(rowOf("sample:M:3a").path).toBe("sample/M/3a.png");
      expect(store.objects.get("sample/M/3a.jpg")?.bytes).toEqual(oldImg);
      expect(store.objects.get("sample/M/3a.png")?.bytes).toEqual(newImg);
      expect(res.leftoverPhotos).toEqual(["sample/M/3a.jpg"]);
      expect(writeCalls()).toEqual(["replaceObject:sample/M/3a.png", "updateRow:sample:M:3a"]);
      expect(formatImportResult(res)).toContain('leftover_photo: "sample/M/3a.jpg"');
    });

    it("escapes control characters of a stored path in the leftover line", async () => {
      const esc = String.fromCharCode(27);
      writeJson(recordsDir, "p1.json", makePage("sample:M:3a"));
      writePhotos([{ file: "IMG_0001.jpg", bytes: newImg, ref: "sample:M:3a" }]);
      store.rows.set("sample:M:3a", {
        source_ref: "sample:M:3a",
        kind: "page",
        path: `sample/M/3a${esc}[2J.jpg`,
        transcript: makePage("sample:M:3a"),
        transcript_status: "machine_read",
      });

      const res = await importReferenceRecords({ recordsDir, photosDir, store, replace: true });
      const out = formatImportResult(res);
      expect(res.leftoverPhotos).toEqual([`sample/M/3a${esc}[2J.jpg`]);
      expect(out).toContain('leftover_photo: "sample/M/3a\\u001b[2J.jpg"');
      expect(out).not.toContain(esc);
    });

    it("keeps the stored path and touches no object when a record has no planned photo", async () => {
      writeJson(recordsDir, "p1.json", makePage("sample:M:3a", "First title"));
      writeJson(recordsDir, "p2.json", makePage("sample:M:3b", "First title"));
      writePhotos([
        { file: "IMG_0001.jpg", bytes: oldImg, ref: "sample:M:3a" },
        { file: "IMG_0002.jpg", bytes: newImg, ref: "sample:M:3b" },
      ]);
      await importReferenceRecords({ recordsDir, photosDir, store });
      writeJson(recordsDir, "p1.json", makePage("sample:M:3a", "Changed title"));
      writeJson(recordsDir, "p2.json", makePage("sample:M:3b", "Changed title"));

      // The manifest no longer has an entry for sample:M:3b.
      writePhotos([{ file: "IMG_0001.jpg", bytes: oldImg, ref: "sample:M:3a" }]);
      store.calls = [];
      const partial = await importReferenceRecords({ recordsDir, photosDir, store, replace: true });
      expect(partial.counts).toMatchObject({ replaced: 2, photosUploaded: 0 });
      expect(rowOf("sample:M:3b").path).toBe("sample/M/3b.jpg");
      expect(store.calls.some((c) => c.includes("sample/M/3b"))).toBe(false);
      expect(partial.leftoverPhotos).toEqual([]);

      // No --photos at all.
      writeJson(recordsDir, "p1.json", makePage("sample:M:3a", "Third title"));
      store.calls = [];
      const none = await importReferenceRecords({ recordsDir, store, replace: true });
      expect(none.counts).toMatchObject({ replaced: 1, skipped: 1, photosUploaded: 0 });
      expect(rowOf("sample:M:3a").path).toBe("sample/M/3a.jpg");
      expect(
        store.calls.filter((c) => c.startsWith("objectSha256:") || c.startsWith("replaceObject:")),
      ).toEqual([]);
      expect(none.leftoverPhotos).toEqual([]);
    });

    it("skips a row that is the same in transcript, status, path and photo bytes with zero writes", async () => {
      writeJson(recordsDir, "p1.json", makePage("sample:M:3a"));
      writeJson(recordsDir, "p2.json", makePage("sample:M:3b"));
      writeJson(recordsDir, "status.json", { "sample:M:3a": "double_read" });
      writePhotos([{ file: "IMG_0001.jpg", bytes: oldImg, ref: "sample:M:3a" }]);
      await importReferenceRecords({ recordsDir, photosDir, store });
      store.calls = [];

      const res = await importReferenceRecords({ recordsDir, photosDir, store, replace: true });
      expect(res.counts).toEqual({
        recordsRead: 2,
        inserted: 0,
        replaced: 0,
        skipped: 2,
        skippedDifferent: 0,
        photosUploaded: 0,
      });
      expect(writeCalls()).toEqual([]);
    });

    it("inserts new rows, replaces changed rows and skips same rows in one run", async () => {
      writeJson(recordsDir, "p1.json", makePage("sample:M:3a"));
      writeJson(recordsDir, "p2.json", makePage("sample:M:3b", "First title"));
      await importReferenceRecords({ recordsDir, store });
      writeJson(recordsDir, "p2.json", makePage("sample:M:3b", "Changed title"));
      writeJson(recordsDir, "p3.json", makePage("sample:M:4a"));

      const res = await importReferenceRecords({ recordsDir, store, replace: true });
      expect(res.ok).toBe(true);
      expect(res.counts).toEqual({
        recordsRead: 3,
        inserted: 1,
        replaced: 1,
        skipped: 1,
        skippedDifferent: 0,
        photosUploaded: 0,
      });
      expect(res.replacedRefs).toEqual(["sample:M:3b"]);
      expect(titleOf("sample:M:3b")).toBe("Changed title");
      expect(store.rows.has("sample:M:4a")).toBe(true);
      expect(formatImportResult(res).split("\n")[0]).toBe(
        "Import summary: records_read=3 inserted=1 replaced=1 skipped=1 skipped_different=0 photos_uploaded=0",
      );
    });

    it("dry run makes zero write calls and reports the same counts and lists as the real run", async () => {
      writeJson(recordsDir, "p1.json", makePage("sample:M:3a"));
      writeJson(recordsDir, "p2.json", makePage("sample:M:3b", "First title"));
      writeJson(recordsDir, "status.json", { "sample:M:3a": "human_checked" });
      writePhotos([{ file: "IMG_0001.jpg", bytes: oldImg, ref: "sample:M:3a" }]);
      await importReferenceRecords({ recordsDir, photosDir, store });

      writeJson(recordsDir, "status.json", {});
      writeJson(recordsDir, "p2.json", makePage("sample:M:3b", "Changed title"));
      writeJson(recordsDir, "p3.json", makePage("sample:M:4a"));
      writePhotos([{ file: "IMG_0001.png", bytes: newImg, ref: "sample:M:3a" }]);
      const snapshot = () => structuredClone({ rows: [...store.rows], objects: [...store.objects] });
      const before = snapshot();
      store.calls = [];

      const dry = await importReferenceRecords({
        recordsDir,
        photosDir,
        store,
        dryRun: true,
        replace: true,
      });
      expect(dry.ok).toBe(true);
      expect(writeCalls()).toEqual([]);
      expect(snapshot()).toEqual(before);
      expect(formatImportResult(dry)).toContain("Dry run summary");

      const real = await importReferenceRecords({ recordsDir, photosDir, store, replace: true });
      expect(real.counts).toEqual({
        recordsRead: 3,
        inserted: 1,
        replaced: 2,
        skipped: 0,
        skippedDifferent: 0,
        photosUploaded: 1,
      });
      expect(real.statusLowered).toEqual([
        { ref: "sample:M:3a", from: "human_checked", to: "machine_read" },
      ]);
      expect(real.leftoverPhotos).toEqual(["sample/M/3a.jpg"]);
      expect({ ...dry, dryRun: false }).toEqual(real);
    });

    it("still refuses before any write when an object with other bytes is at the path of a ref with no row", async () => {
      writeJson(recordsDir, "p1.json", makePage("sample:M:3a"));
      writePhotos([{ file: "IMG_0001.jpg", bytes: newImg, ref: "sample:M:3a" }]);
      store.objects.set("sample/M/3a.jpg", { bytes: oldImg, contentType: "image/jpeg" });

      const res = await importReferenceRecords({ recordsDir, photosDir, store, replace: true });
      expect(res.ok).toBe(false);
      expect(res.stopped).toBeUndefined();
      expect(writeCalls()).toEqual([]);
      expect(res.problems.some((p) => p.includes("sample/M/3a.jpg") && p.includes("by hand"))).toBe(
        true,
      );
    });

    it("refuses an invalid record before any write", async () => {
      writeJson(recordsDir, "p1.json", makePage("sample:M:3a"));
      await importReferenceRecords({ recordsDir, store });
      writeJson(recordsDir, "p2.json", { ...makePage("sample:M:3b"), extra_key: "nope" });
      store.calls = [];

      const res = await importReferenceRecords({ recordsDir, store, replace: true });
      expect(res.ok).toBe(false);
      expect(store.calls).toEqual([]);
      expect(res.problems.some((p) => p.includes("p2.json"))).toBe(true);
    });

    it("stops when a row update fails after its photo was replaced, and a second run ends like a clean run", async () => {
      const clean = new MemoryReferenceStore();
      writeJson(recordsDir, "p1.json", makePage("sample:M:3a", "First title"));
      writeJson(recordsDir, "p2.json", makePage("sample:M:3b", "First title"));
      writePhotos([{ file: "IMG_0002.jpg", bytes: oldImg, ref: "sample:M:3b" }]);
      await importReferenceRecords({ recordsDir, photosDir, store });
      await importReferenceRecords({ recordsDir, photosDir, store: clean });

      writeJson(recordsDir, "p1.json", makePage("sample:M:3a", "Changed title"));
      writeJson(recordsDir, "p2.json", makePage("sample:M:3b", "Changed title"));
      writePhotos([{ file: "IMG_0002.jpg", bytes: newImg, ref: "sample:M:3b" }]);

      const realUpdate = store.updateRow.bind(store);
      let failNext = true;
      store.updateRow = async (row) => {
        if (row.source_ref === "sample:M:3b" && failNext) {
          failNext = false;
          throw new Error("database is not reachable");
        }
        return realUpdate(row);
      };

      const first = await importReferenceRecords({ recordsDir, photosDir, store, replace: true });
      expect(first.ok).toBe(false);
      expect(first.stopped).toBe(true);
      expect(first.counts).toMatchObject({ replaced: 1, photosUploaded: 1 });
      expect(first.replacedRefs).toEqual(["sample:M:3a"]);
      expect(
        first.problems.some(
          (p) => p.includes('"sample/M/3b.jpg"') && p.includes("already the new one"),
        ),
      ).toBe(true);
      expect(first.problems.some((p) => p.includes("replaced 1"))).toBe(true);
      expect(formatImportResult(first)).toContain("Import stopped after a write error");
      expect(store.objects.get("sample/M/3b.jpg")?.bytes).toEqual(newImg);
      expect(titleOf("sample:M:3b")).toBe("First title");

      const second = await importReferenceRecords({ recordsDir, photosDir, store, replace: true });
      expect(second.ok).toBe(true);
      expect(second.counts).toMatchObject({ replaced: 1, skipped: 1, photosUploaded: 0 });
      expect(second.replacedRefs).toEqual(["sample:M:3b"]);

      const cleanRun = await importReferenceRecords({
        recordsDir,
        photosDir,
        store: clean,
        replace: true,
      });
      expect(cleanRun.ok).toBe(true);
      const endState = (target: MemoryReferenceStore) => ({
        rows: [...target.rows].map(([ref, row]) => [ref, { ...row, updated_at: undefined }]),
        objects: [...target.objects],
      });
      expect(endState(store)).toEqual(endState(clean));
    });

    it("stops with a clear problem when the row to update is no longer there", async () => {
      writeJson(recordsDir, "p1.json", makePage("sample:M:3a", "First title"));
      await importReferenceRecords({ recordsDir, store });
      writeJson(recordsDir, "p1.json", makePage("sample:M:3a", "Changed title"));
      // Another person removes the row after this run read it.
      store.updateRow = async (row) => {
        store.rows.delete(row.source_ref);
        return false;
      };

      const res = await importReferenceRecords({ recordsDir, store, replace: true });
      expect(res.ok).toBe(false);
      expect(res.stopped).toBe(true);
      expect(res.counts.replaced).toBe(0);
      expect(res.replacedRefs).toEqual([]);
      expect(
        res.problems.some((p) => p.includes("sample:M:3a") && p.includes("no row with this source_ref")),
      ).toBe(true);
    });
  });
});
