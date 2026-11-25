import { createClient } from "@supabase/supabase-js";
import { parseArgs } from "node:util";
import type { Database } from "@/lib/database";
import { formatImportResult, importReferenceRecords } from "@/lib/reference-record";
import { createSupabaseReferenceStore } from "@/lib/reference-record/store";

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      records: { type: "string" },
      photos: { type: "string" },
      "dry-run": { type: "boolean", default: false },
      replace: { type: "boolean", default: false },
    },
  });

  if (!values.records) {
    console.error(
      "Usage: npm run reference:import -- --records <folder> [--photos <folder>] [--dry-run] [--replace]\n" +
        "  --replace  update an existing row when it differs from the files. A changed photo goes to a new object. Never deletes. Run with --dry-run --replace first.",
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
  const store = createSupabaseReferenceStore(db, () => new Date());

  const result = await importReferenceRecords({
    recordsDir: values.records,
    photosDir: values.photos,
    dryRun: values["dry-run"],
    replace: values.replace,
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
