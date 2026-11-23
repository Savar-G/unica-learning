import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { parseArgs } from "node:util";
import type { Database, Json } from "@/lib/database";
import {
  formatImportResult,
  importReferenceRecords,
  REFERENCE_BUCKET,
  REFERENCE_TABLE,
  type ExistingReferenceRow,
  type ReferenceRow,
  type ReferenceStore,
} from "@/lib/reference-record";

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

function createSupabaseReferenceStore(db: SupabaseClient<Database>): ReferenceStore {
  return {
    async findExisting(sourceRefs: string[]): Promise<Map<string, ExistingReferenceRow>> {
      const existing = new Map<string, ExistingReferenceRow>();
      const chunkSize = 100;
      for (let i = 0; i < sourceRefs.length; i += chunkSize) {
        const chunk = sourceRefs.slice(i, i + chunkSize);
        const { data, error } = await db
          .from(REFERENCE_TABLE)
          .select("source_ref, transcript, path, transcript_status")
          .in("source_ref", chunk);
        if (error) {
          throw new Error(`Failed reading existing reference records: ${error.message}`);
        }
        for (const row of data ?? []) {
          existing.set(row.source_ref, {
            transcript: row.transcript,
            path: row.path,
            transcript_status: row.transcript_status,
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
      const { data: exists } = await db.storage.from(REFERENCE_BUCKET).exists(path);
      if (!exists) return null;
      const { data, error } = await db.storage.from(REFERENCE_BUCKET).download(path);
      if (error || !data) {
        throw new Error(
          `Failed downloading existing object ${path}: ${error?.message ?? "empty body"}`,
        );
      }
      const bytes = new Uint8Array(await data.arrayBuffer());
      return createHash("sha256").update(bytes).digest("hex");
    },

    async uploadObject(path: string, bytes: Uint8Array, contentType: string): Promise<void> {
      const { error } = await db.storage
        .from(REFERENCE_BUCKET)
        .upload(path, bytes, { contentType, upsert: false });
      if (error) {
        throw new Error(`Failed uploading ${path}: ${error.message}`);
      }
    },
  };
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      records: { type: "string" },
      photos: { type: "string" },
      "dry-run": { type: "boolean", default: false },
    },
  });

  if (!values.records) {
    console.error(
      "Usage: npm run reference:import -- --records <folder> [--photos <folder>] [--dry-run]",
    );
    process.exitCode = 1;
    return;
  }

  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !key) {
    console.error(
      "Missing SUPABASE_URL or SUPABASE_SECRET_KEY. Set both environment variables before running reference:import.",
    );
    process.exitCode = 1;
    return;
  }

  const db = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const store = createSupabaseReferenceStore(db);

  const result = await importReferenceRecords({
    recordsDir: values.records,
    photosDir: values.photos,
    dryRun: values["dry-run"],
    store,
  });

  const output = formatImportResult(result);
  if (result.ok) {
    console.log(output);
  } else {
    console.error(output);
    process.exitCode = 1;
  }
}

await main();
