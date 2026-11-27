// The bank import (docs/workbook-v2-bank.md): validates a draft file kept outside every git repository and writes it
// as draft rows of the working copy, then reads it back and compares it with the file field for field.
import { isDeepStrictEqual, parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { formatImport, readDraftFile, runBankImport } from "@/lib/workbook-v2-bank/import-draft";
import { supabaseBankStore } from "@/lib/workbook-v2-bank/supabase-store";

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { draft: { type: "string" } } });
  if (!values.draft) {
    console.error("Usage: npm run workbook:v2:bank:import -- --draft <file outside every git repository>");
    process.exitCode = 1;
    return;
  }
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !key) {
    console.error("Missing SUPABASE_URL or SUPABASE_SECRET_KEY. Set both environment variables before running workbook:v2:bank:import.");
    process.exitCode = 1;
    return;
  }
  const store = supabaseBankStore(createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } }));
  const result = await runBankImport(values.draft, store);
  if (!result.ok) {
    console.error(formatImport(result));
    process.exitCode = 1;
    return;
  }
  const back = await store.exportLevelDraft(result.levelId);
  if (!isDeepStrictEqual(back, readDraftFile(values.draft))) {
    console.error(`Imported level ${result.levelId}, but it reads back different from the file. Run the import again, and report this if it repeats.`);
    process.exitCode = 1;
    return;
  }
  console.log(`${formatImport(result)} It reads back equal to the file.`);
}

await main();
