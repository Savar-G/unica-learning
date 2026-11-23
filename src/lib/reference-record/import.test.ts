import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

class MemoryReferenceStore implements ReferenceStore {
  rows = new Map<string, ReferenceRow>();
  objects = new Map<string, { bytes: Uint8Array; contentType: string }>();
  calls: string[] = [];

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
      skipped: 2,
      skippedDifferent: 0,
      photosUploaded: 0,
    });

    // Mutate page2 on disk and add a photo for page2 - existing row must not change and photo must not upload.
    writeJson(recordsDir, "p2.json", makePage("sample:M:4a", "Changed title"));
    const img = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    writeBytes(photosDir, "IMG_0002.jpg", img);
    writeJson(photosDir, "masked-manifest.json", {
      version: 1,
      photos: [
        {
          file: "IMG_0002.jpg",
          sha256: sha256Hex(img),
          confirmed: true,
          confirmed_at: "2026-01-01T00:00:00.000Z",
          source_ref: "sample:M:4a",
        },
      ],
    });

    const third = await importReferenceRecords({ recordsDir, photosDir, store });
    expect(third.ok).toBe(true);
    expect(third.counts).toEqual({
      recordsRead: 2,
      inserted: 0,
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

  it("uploads matched confirmed photos before row insert, ignores unmanifested or unidentified photos, and never overwrites existing objects", async () => {
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
          sha256: sha256Hex(img2),
          confirmed: true,
          confirmed_at: "2026-01-01T00:00:00.000Z",
          source_ref: "sample:M:3b",
        },
        {
          // Manifest entry for a record not in this batch: ignored
          file: "OTHER.jpg",
          sha256: sha256Hex(other),
          confirmed: true,
          confirmed_at: "2026-01-01T00:00:00.000Z",
          source_ref: "sample:M:99a",
        },
        {
          // No source_ref yet: ignored
          file: "UNIDENTIFIED.jpg",
          sha256: "0".repeat(64),
          confirmed: false,
          confirmed_at: null,
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

  it("refuses the whole run when photo hash mismatches, confirmed is not strictly true, or photo file is missing", async () => {
    writeJson(recordsDir, "p1.json", makePage("sample:M:1a"));
    writeJson(recordsDir, "p2.json", makePage("sample:M:2a"));
    writeJson(recordsDir, "p3.json", makePage("sample:M:3a"));

    const img1 = new Uint8Array([1, 2, 3]);
    const img2 = new Uint8Array([4, 5, 6]);
    writeBytes(photosDir, "bad-hash.jpg", img1);
    writeBytes(photosDir, "unconfirmed.jpg", img2);
    writeJson(photosDir, "masked-manifest.json", {
      version: 1,
      photos: [
        {
          file: "bad-hash.jpg",
          sha256: "a".repeat(64),
          confirmed: true,
          confirmed_at: "2026-01-01T00:00:00.000Z",
          source_ref: "sample:M:1a",
        },
        {
          file: "unconfirmed.jpg",
          sha256: sha256Hex(img2),
          confirmed: "true",
          confirmed_at: "2026-01-01T00:00:00.000Z",
          source_ref: "sample:M:2a",
        },
        {
          file: "missing.jpg",
          sha256: "b".repeat(64),
          confirmed: true,
          confirmed_at: "2026-01-01T00:00:00.000Z",
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
    expect(res.problems.some((p) => p.includes("sample:M:2a") && p.includes("confirmed"))).toBe(true);
    expect(res.problems.some((p) => p.includes("sample:M:3a") && p.includes("missing"))).toBe(true);
  });

  it("refuses when masked-manifest.json is missing, has traversal paths, or has duplicate source_ref entries", async () => {
    writeJson(recordsDir, "p1.json", makePage("sample:M:1a"));
    mkdirSync(photosDir, { recursive: true });

    const missingManifest = await importReferenceRecords({ recordsDir, photosDir, store });
    expect(missingManifest.ok).toBe(false);
    expect(missingManifest.problems.some((p) => p.includes("masked-manifest.json"))).toBe(true);

    writeJson(photosDir, "masked-manifest.json", {
      version: 1,
      photos: [
        {
          file: "../escape.jpg",
          sha256: "a".repeat(64),
          confirmed: true,
          confirmed_at: "2026-01-01T00:00:00.000Z",
          source_ref: "sample:M:1a",
        },
        {
          file: "dup.jpg",
          sha256: "b".repeat(64),
          confirmed: true,
          confirmed_at: "2026-01-01T00:00:00.000Z",
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
    writeJson(photosDir, "masked-manifest.json", {
      version: 1,
      photos: [
        {
          file: "IMG_0001.jpg",
          sha256: sha256Hex(img),
          confirmed: true,
          confirmed_at: "2026-01-01T00:00:00.000Z",
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
});

describe("bank_reference_images migration", () => {
  it("forces an existing curriculum-reference bucket to stay private with the same limits on conflict", () => {
    const sql = readFileSync(
      resolve(process.cwd(), "supabase/migrations/20261123170312_bank_reference_images.sql"),
      "utf8",
    );
    expect(sql).toMatch(
      /on conflict\s*\(\s*id\s*\)\s*do update\s+set\s+public\s*=\s*false,\s*file_size_limit\s*=\s*excluded\.file_size_limit,\s*allowed_mime_types\s*=\s*excluded\.allowed_mime_types;/i,
    );
  });
});
