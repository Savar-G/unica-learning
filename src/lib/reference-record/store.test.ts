import { createClient } from "@supabase/supabase-js";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Database } from "@/lib/database";
import { importReferenceRecords, type ExistingReferenceRow, type ReferenceRow, type ReferenceStore } from "./import";
import { contentPath, MemoryReferenceStore } from "./import-store.fixtures";
import { sha256Hex } from "./read-file";
import { createSupabaseReferenceStore } from "./store";
import { FakeSupabase } from "./store.fixtures";
import type { ContentsRecord } from "./types";

const REF = "demo:Z:contents";
const OLD = new Uint8Array([1, 2, 3]);
const NEW = new Uint8Array([4, 5, 6]);

const makeRecord = (title: string): ContentsRecord => ({
  kind: "contents",
  source_ref: REF,
  topics: [{ n: 1, title, sheets: [1, 10], std_time_min: [2, 3] }],
});

const makeRow = (over: Partial<ReferenceRow> = {}): ReferenceRow => ({
  source_ref: REF,
  kind: "contents",
  path: "demo/Z/new.jpg",
  transcript: makeRecord("New text"),
  transcript_status: "machine_read",
  ...over,
});

const seenRow = (over: Partial<ExistingReferenceRow> = {}): ExistingReferenceRow => ({
  transcript: makeRecord("Old text"),
  path: "demo/Z/old.jpg",
  transcript_status: "double_read",
  updated_at: "2026-01-01T00:00:00.123456+00:00",
  ...over,
});

describe("the Supabase store of the reference import", () => {
  let fake: FakeSupabase;
  let store: ReferenceStore;

  beforeEach(() => {
    fake = new FakeSupabase(new MemoryReferenceStore());
    const db = createClient<Database>("http://db.invalid", "key", {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: fake.fetch },
    });
    store = createSupabaseReferenceStore(db, () => new Date("2026-02-03T04:05:06.000Z"));
  });

  const putRow = (row: ExistingReferenceRow) =>
    fake.state.rows.set(REF, {
      ...row,
      source_ref: REF,
      kind: "contents",
      transcript: makeRecord("Old text"),
      note: "kept note",
      id: "id-1",
      created_at: "earlier",
    });

  it.each([seenRow(), seenRow({ path: null })])("updates the row in one call, only while it is the row that was read (path $path)", async (seen) => {
    putRow(seen);
    expect(await store.updateRow(makeRow(), seen)).toBe(true);
    expect(fake.sent).toHaveLength(1);
    const [{ method, path, params, body }] = fake.sent;
    expect([method, path]).toEqual(["PATCH", "/rest/v1/bank_reference_images"]);
    expect(Object.fromEntries(params)).toEqual({
      source_ref: `eq.${REF}`,
      path: seen.path === null ? "is.null" : `eq.${seen.path}`,
      transcript_status: "eq.double_read",
      updated_at: `eq.${seen.updated_at}`,
      select: "source_ref",
    });
    expect(body).toEqual({
      kind: "contents",
      path: "demo/Z/new.jpg",
      transcript: makeRecord("New text"),
      transcript_status: "machine_read",
      updated_at: "2026-02-03T04:05:06.000Z",
    });
    expect(fake.state.rows.get(REF)).toMatchObject({ id: "id-1", created_at: "earlier", note: "kept note", path: "demo/Z/new.jpg" });
  });

  it.each([
    { path: "demo/Z/other.jpg" },
    { path: null },
    { transcript_status: "human_checked" },
    { updated_at: "2026-01-01T00:00:00.123457+00:00" },
  ])("changes nothing when the row has other values: %o", async (over) => {
    putRow(seenRow(over));
    const before = structuredClone(fake.state.rows);
    expect(await store.updateRow(makeRow(), seenRow())).toBe(false);
    expect(fake.state.rows).toEqual(before);
  });

  it("changes nothing when the row is gone, or has a path now where it had none", async () => {
    expect(await store.updateRow(makeRow(), seenRow())).toBe(false);
    putRow(seenRow());
    expect(await store.updateRow(makeRow(), seenRow({ path: null }))).toBe(false);
  });

  it.each(["2026-02-03T04:05:06+00:00", "2026-02-03T04:05:06.000999+00:00", "2030-05-06T07:08:09.123456+00:00"])(
    "gives an update a later updated_at than %s, also when the clock does not",
    async (updated_at) => {
      await store.updateRow(makeRow(), seenRow({ updated_at }));
      expect(Date.parse((fake.sent[0].body as { updated_at: string }).updated_at)).toBeGreaterThan(Date.parse(updated_at));
    },
  );

  it("never sends an upload that can write over an object", async () => {
    await store.uploadObject("demo/Z/a.jpg", OLD, "image/jpeg");
    await expect(store.uploadObject("demo/Z/a.jpg", NEW, "image/jpeg")).rejects.toThrow("already exists");
    expect(fake.sent.map((r) => [r.method, r.headers.get("x-upsert")])).toEqual([["POST", "false"], ["POST", "false"]]);
    expect(fake.state.objects.get("demo/Z/a.jpg")).toEqual({ bytes: OLD, contentType: "image/jpeg" });
  });

  it("gives the digest of an object, null only for a path with no object, and an error when it cannot know", async () => {
    await store.uploadObject("demo/Z/1a.0123.jpg", OLD, "image/jpeg");
    expect(await store.objectSha256("demo/Z/1a.0123.jpg")).toBe(sha256Hex(OLD));
    expect(await store.objectSha256("demo/Z/1a.jpg")).toBeNull();
    expect(await store.objectSha256("demo/Z/a.0123.jpg")).toBeNull();
    fake.failWith = "no listing";
    await expect(store.objectSha256("demo/Z/1a.jpg")).rejects.toThrow("no listing");
  });

  it("reads the rows of every page id and of every path", async () => {
    const refs = Array.from({ length: 250 }, (_, i) => `demo:Z:${i + 1}a`);
    for (const ref of refs) {
      fake.state.rows.set(ref, { source_ref: ref, kind: "page", path: "demo/Z/shared.jpg", transcript: makeRecord(ref), transcript_status: "machine_read", updated_at: ref });
    }
    const found = await store.findExisting([...refs, "demo:Z:999a"]);
    expect([...found.keys()]).toEqual(refs);
    expect(found.get("demo:Z:7a")).toEqual({ transcript: makeRecord("demo:Z:7a"), path: "demo/Z/shared.jpg", transcript_status: "machine_read", updated_at: "demo:Z:7a" });
    expect([...(await store.refsByPath(["demo/Z/shared.jpg", "demo/Z/none.jpg"]))]).toEqual([["demo/Z/shared.jpg", refs]]);
  });

  it("reports an error of each call", async () => {
    fake.failWith = "the database is gone";
    const calls = [
      () => store.findExisting([REF]),
      () => store.insertRow(makeRow()),
      () => store.updateRow(makeRow(), seenRow()),
      () => store.refsByPath(["a"]),
      () => store.uploadObject("demo/Z/a.jpg", OLD, "image/jpeg"),
    ];
    for (const call of calls) await expect(call()).rejects.toThrow("the database is gone");
  });

  describe("in a whole import", () => {
    let root: string;

    beforeEach(() => {
      root = mkdtempSync(join(tmpdir(), "unica-ref-store-"));
    });

    afterEach(() => {
      rmSync(root, { recursive: true, force: true });
    });

    const run = (target: ReferenceStore, title: string, photo: Uint8Array, replace: boolean) => {
      const recordsDir = join(root, "records");
      const photosDir = join(root, "photos");
      for (const dir of [recordsDir, photosDir]) mkdirSync(dir, { recursive: true });
      writeFileSync(join(recordsDir, "p.json"), JSON.stringify(makeRecord(title)));
      writeFileSync(join(photosDir, "p.jpg"), photo);
      writeFileSync(
        join(photosDir, "photos-manifest.json"),
        JSON.stringify({ version: 1, photos: [{ file: "p.jpg", sha256: sha256Hex(photo), source_ref: REF }] }),
      );
      return importReferenceRecords({ recordsDir, photosDir, store: target, replace });
    };
    const held = (state: MemoryReferenceStore) => ({
      rows: [...state.rows].map(([ref, row]) => [ref, { ...row, note: row.note ?? null, created_at: undefined, updated_at: undefined }]),
      objects: [...state.objects],
    });

    it("does what the memory store does, and sends no upload that can write over an object", async () => {
      const memory = new MemoryReferenceStore();
      const pathOf = (photo: Uint8Array) => contentPath(REF, "jpg", photo);
      const rows: Array<[string, Uint8Array, boolean]> = [
        ["Old text", OLD, false],
        ["Old text", OLD, true],
        ["New text", NEW, true],
        ["New text", NEW, true],
        ["Newer text", NEW, true],
        ["Newer text", OLD, true],
      ];
      for (const [title, photo, replace] of rows) {
        const results = [await run(store, title, photo, replace), await run(memory, title, photo, replace)];
        expect(results[0].problems).toEqual([]);
        expect(results[0]).toEqual(results[1]);
        expect(held(fake.state)).toEqual(held(memory));
        expect(fake.state.rows.get(REF)?.path).toBe(pathOf(photo));
      }
      const uploads = fake.sent.filter((r) => r.method === "POST" && r.path.startsWith("/storage/v1/object/curriculum-reference/"));
      expect(uploads.map((r) => [r.path.split("/").at(-1), r.headers.get("x-upsert")])).toEqual(
        [OLD, NEW].map((photo) => [pathOf(photo).split("/").at(-1), "false"]),
      );
      const updates = fake.sent.filter((r) => r.method === "PATCH");
      expect(updates).toHaveLength(3);
      for (const { params } of updates) {
        expect([...params.keys()].sort()).toEqual(["path", "select", "source_ref", "transcript_status", "updated_at"]);
      }
      expect(fake.sent.some((r) => !["GET", "POST", "PATCH"].includes(r.method))).toBe(false);
    });

    it("stops when another run changes the row between the last read and the update", async () => {
      await run(store, "Old text", OLD, false);
      fake.onRequest = ({ method }) => {
        const row = fake.state.rows.get(REF);
        if (method === "PATCH" && row) fake.state.rows.set(REF, { ...row, updated_at: "2026-03-01T00:00:00+00:00" });
      };
      const result = await run(store, "New text", NEW, true);
      expect(result).toMatchObject({ ok: false, stopped: true, counts: { replaced: 0, photosUploaded: 1 } });
      expect(result.problems.join("\n")).toContain(`${REF}: the row changed`);
      expect(result.unreferencedPhotos).toHaveLength(1);
      expect(fake.state.rows.get(REF)).toMatchObject({ transcript: makeRecord("Old text") });
    });
  });
});
