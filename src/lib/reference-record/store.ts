import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/database";
import {
  REFERENCE_BUCKET,
  REFERENCE_TABLE,
  type ExistingReferenceRow,
  type ReferenceRow,
  type ReferenceStore,
} from "./import";
import { sha256Hex } from "./read-file";

function toJsonValue(value: unknown): Json {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(toJsonValue);
  }
  if (typeof value === "object") {
    const out: { [key: string]: Json | undefined } = {};
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined) {
        out[k] = toJsonValue(v);
      }
    }
    return out;
  }
  throw new Error(`Unsupported value type for JSON column: ${typeof value}`);
}

// The import target: the table and the private bucket. No call writes over an object.
export function createSupabaseReferenceStore(db: SupabaseClient<Database>, now: () => Date): ReferenceStore {
  return {
    async findExisting(sourceRefs: string[]): Promise<Map<string, ExistingReferenceRow>> {
      const existing = new Map<string, ExistingReferenceRow>();
      const chunkSize = 100;
      for (let i = 0; i < sourceRefs.length; i += chunkSize) {
        const chunk = sourceRefs.slice(i, i + chunkSize);
        const { data, error } = await db
          .from(REFERENCE_TABLE)
          .select("source_ref, transcript, path, transcript_status, updated_at")
          .in("source_ref", chunk);
        if (error) {
          throw new Error(`Failed reading existing reference records: ${error.message}`);
        }
        for (const row of data ?? []) {
          existing.set(row.source_ref, {
            transcript: row.transcript,
            path: row.path,
            transcript_status: row.transcript_status,
            updated_at: row.updated_at,
          });
        }
      }
      return existing;
    },

    async insertRow(row: ReferenceRow): Promise<boolean> {
      const { data, error } = await db
        .from(REFERENCE_TABLE)
        .upsert(
          {
            source_ref: row.source_ref,
            kind: row.kind,
            path: row.path,
            transcript: toJsonValue(row.transcript),
            transcript_status: row.transcript_status,
            note: row.note ?? null,
          },
          { onConflict: "source_ref", ignoreDuplicates: true },
        )
        .select("source_ref");
      if (error) {
        throw new Error(`Failed inserting ${row.source_ref}: ${error.message}`);
      }
      return (data?.length ?? 0) > 0;
    },

    async objectSha256(path: string): Promise<string | null> {
      // List the folder instead of a HEAD request: a listing error is an error, never "no object".
      const slash = path.lastIndexOf("/");
      const folder = slash >= 0 ? path.slice(0, slash) : "";
      const name = slash >= 0 ? path.slice(slash + 1) : path;
      // `search` is a substring match, so read every page until the exact name is found or the list ends.
      const pageSize = 1000;
      let found = false;
      for (let offset = 0; !found; offset += pageSize) {
        const { data: listed, error: listError } = await db.storage
          .from(REFERENCE_BUCKET)
          .list(folder, { search: name, limit: pageSize, offset });
        if (listError || !listed) {
          throw new Error(
            `Failed checking for an existing object at ${path}: ${listError?.message ?? "no listing"}`,
          );
        }
        found = listed.some((entry) => entry.name === name);
        if (listed.length < pageSize) break;
      }
      if (!found) return null;
      const { data, error } = await db.storage.from(REFERENCE_BUCKET).download(path);
      if (error || !data) {
        throw new Error(
          `Failed downloading existing object ${path}: ${error?.message ?? "empty body"}`,
        );
      }
      const bytes = new Uint8Array(await data.arrayBuffer());
      return sha256Hex(bytes);
    },

    async uploadObject(path: string, bytes: Uint8Array, contentType: string): Promise<void> {
      const { error } = await db.storage
        .from(REFERENCE_BUCKET)
        .upload(path, bytes, { contentType, upsert: false });
      if (error) {
        throw new Error(`Failed uploading ${path}: ${error.message}`);
      }
    },

    async updateRow(row: ReferenceRow, seen: ExistingReferenceRow): Promise<boolean> {
      // The table has no trigger for updated_at. Always later than the revision that was read, also
      // when two runs have one clock time.
      const next = new Date(Math.max(now().getTime(), Date.parse(seen.updated_at) + 1)).toISOString();
      const update = db
        .from(REFERENCE_TABLE)
        .update({
          kind: row.kind,
          path: row.path,
          transcript: toJsonValue(row.transcript),
          transcript_status: row.transcript_status,
          updated_at: next,
        })
        .eq("source_ref", row.source_ref)
        .eq("transcript_status", seen.transcript_status)
        .eq("updated_at", seen.updated_at);
      const { data, error } = await (
        seen.path === null ? update.is("path", null) : update.eq("path", seen.path)
      ).select("source_ref");
      if (error) {
        throw new Error(`Failed updating ${row.source_ref}: ${error.message}`);
      }
      return (data?.length ?? 0) > 0;
    },

    async refsByPath(paths: string[]): Promise<Map<string, string[]>> {
      const refs = new Map<string, string[]>();
      const pageSize = 1000;
      for (const path of new Set(paths)) {
        const found: string[] = [];
        for (let from = 0; ; from += pageSize) {
          const { data, error } = await db
            .from(REFERENCE_TABLE)
            .select("source_ref")
            .eq("path", path)
            .order("source_ref", { ascending: true })
            .range(from, from + pageSize - 1);
          if (error) {
            throw new Error(`Failed reading which rows use the photo path: ${error.message}`);
          }
          const rows = data ?? [];
          for (const row of rows) found.push(row.source_ref);
          if (rows.length < pageSize) break;
        }
        if (found.length > 0) refs.set(path, found);
      }
      return refs;
    },
  };
}
