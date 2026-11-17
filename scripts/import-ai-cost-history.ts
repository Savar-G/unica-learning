// No dotenv loading. Root supplies private input paths and, only for apply, a service credential.
import { readFile, stat } from "node:fs/promises";
import { parseArgs } from "node:util";
import { HISTORY_DATABASE } from "../src/lib/ai-cost-history";
import { importHistoryPackage, type HistoryImportTransport } from "../src/lib/ai-cost-history-package";

const { values } = parseArgs({ options: { csv: { type: "string" }, manifest: { type: "string" }, snapshot: { type: "string", multiple: true }, apply: { type: "boolean", default: false } } });
if (!values.csv || !values.manifest || !values.snapshot?.length || values.snapshot.length > 8) throw new Error("Use --csv PATH --manifest PATH --snapshot PATH. Repeat --snapshot in manifest order. Add --apply only for an authorized import.");
const bounded = async (path: string, max: number) => {
  const info = await stat(path);
  if (!info.isFile() || !info.size || info.size > max) throw new Error("Invalid package file");
  const bytes = await readFile(path);
  if (bytes.length > max) throw new Error("Invalid package file");
  return bytes;
};
const input = { csv: await bounded(values.csv, 50_000_000), manifest: JSON.parse((await bounded(values.manifest, 32_768)).toString("utf8")),
  snapshots: await Promise.all(values.snapshot.map((p) => bounded(p, 50_000_000))) };
let transport: HistoryImportTransport | undefined;
if (values.apply) {
  transport = { async call(name, args) {
    // Called only after full offline package validation. Never use a caller-selected project URL.
    const key = process.env.SUPABASE_SECRET_KEY;
    if (!key || (process.env.SUPABASE_URL && process.env.SUPABASE_URL !== HISTORY_DATABASE)) throw new Error("Historical import unavailable");
    const response = await fetch(`${HISTORY_DATABASE}/rest/v1/rpc/${name}`, { method: "POST", cache: "no-store", signal: AbortSignal.timeout(15_000),
      headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify(args) });
    if (!response.ok) throw new Error("Historical import incomplete");
    return name === "finalize_ai_cost_history" ? await response.json() : null;
  } };
}
const result = await importHistoryPackage(input, transport);
console.log(`${result.applied ? "Completed import" : "Validated dry run"}: ${result.rows} evidence rows. ${result.applied ? "Exact retries are safe." : "No database requests."}`);
