// Default is read-only. Root may apply retained receipts only after the additive migration is verified.
import { readFile, stat } from "node:fs/promises";
import { parseArgs } from "node:util";
import { insertUsageRow } from "@/lib/ai-usage";
import { parseUsageReceipt } from "@/lib/ai-usage-receipts";

const { values } = parseArgs({ options: { file: { type: "string" }, apply: { type: "boolean", default: false } } });
if (!values.file) throw new Error("Use --file PATH. Add --apply only to import verified receipts.");
if ((await stat(values.file)).size > 50_000_000) throw new Error("Receipt file exceeds 50 MB. Split it before import.");
const receipts = (await readFile(values.file, "utf8")).split("\n").filter((s) => s.trim()).map((s) => parseUsageReceipt(JSON.parse(s)));
const rows = [...new Map(receipts.map((r) => [r.generation_id ? `${r.provider}:${r.generation_id}` : r.receipt_id, r])).values()];
console.log(`${values.apply ? "Import" : "Dry run"}: ${rows.length} distinct receipts. ${receipts.length - rows.length} repeated receipts excluded.`);
if (values.apply) {
  const url = process.env.SUPABASE_URL?.trim(), key = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY are required for import.");
  for (const row of rows) if (!await insertUsageRow(row, { url, key })) throw new Error("Receipt import failed. It is safe to retry the same file.");
  console.log(`Imported ${rows.length} receipts. Previously stored receipts count once.`);
}
