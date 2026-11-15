// The weekly ad review (docs/ad-tracking.md, "Weekly review"). Reads our own ad tables and prints a Markdown report:
// the funnel of each ad, step rates, cost per signup when spend is given, and a kill / keep / scale proposal with the
// reason. It only reads. It never changes an ad, a budget or a row; a person approves every change in Meta or Google Ads.
//
// Usage: npm run ads:review -- [--days 7] [--spend spend.json] [--out report.md] [--source meta,google|all]
//   --days    the window, counted back from now (default 7).
//   --spend   a JSON file with the spend you typed in by hand, in CAD: an array of
//             { "source": "meta", "campaign": "bc-round-3", "content": "right-level", "amount": 33.33 }
//             (optional "medium" to count it for one placement only). Entries for the same ad add up.
//   --out     also write the report to this file.
//   --source  which utm_source values count as ads (default meta,google; "all" keeps every tagged visit, which
//             includes organic social posts).
// The secret key comes from SUPABASE_SECRET_KEY, else from the Supabase Management API with the token in
// SUPABASE_ACCESS_TOKEN or the macOS Keychain item "supabase-pagewise".
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { renderAdReview, reviewAds, type AdSpendEntry, type AdStep, type AdVisitRecord } from "@/lib/ad-review";

const PROJECT = "cdjobwsyzndtltzfpyqa";
const PAGE = 1000;
/** Tags of the team's own checks (docs/ad-tracking.md query). They are not ad traffic. */
const CHECK_SOURCES = new Set(["reviewcheck"]);
const CHECK_CONTENTS = new Set(["pixel-check"]);

async function secretKey(): Promise<string> {
  if (process.env.SUPABASE_SECRET_KEY) return process.env.SUPABASE_SECRET_KEY;
  const token = process.env.SUPABASE_ACCESS_TOKEN
    || execFileSync("security", ["find-generic-password", "-s", "supabase-pagewise", "-w"], { encoding: "utf8" }).trim();
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`api keys: HTTP ${res.status}`);
  const keys = await res.json() as { name: string; type: string; api_key: string | null }[];
  const key = keys.find((k) => k.type === "legacy" && k.name === "service_role")?.api_key ?? keys.find((k) => k.type === "secret")?.api_key;
  if (!key) throw new Error("no secret key");
  return key;
}

/** Every row of a read, one page at a time (the API returns at most 1000 rows a request). */
async function all<T>(label: string, page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(`${label}: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

function readSpend(raw: unknown): AdSpendEntry[] {
  if (!Array.isArray(raw)) throw new Error("--spend file must hold a JSON array");
  return raw.map((e, i) => {
    const o = e as Record<string, unknown>;
    const text = (k: string) => (typeof o[k] === "string" && (o[k] as string).trim() ? (o[k] as string) : null);
    const source = text("source"), campaign = text("campaign"), content = text("content");
    if (!source || !campaign || !content) throw new Error(`--spend entry ${i + 1} needs source, campaign and content`);
    if (typeof o.amount !== "number" || !Number.isFinite(o.amount) || o.amount < 0) throw new Error(`--spend entry ${i + 1} needs an amount of 0 or more`);
    if (o.medium !== undefined && !text("medium")) throw new Error(`--spend entry ${i + 1}: medium must be a non-empty string`);
    return { source, campaign, content, amount: o.amount, ...(text("medium") ? { medium: text("medium")! } : {}) };
  });
}

async function main() {
  const { values } = parseArgs({ options: { days: { type: "string", default: "7" }, spend: { type: "string" }, out: { type: "string" }, source: { type: "string", default: "meta,google" } } });
  const days = Number(values.days);
  if (!Number.isInteger(days) || days < 1 || days > 365) throw new Error("--days must be a whole number from 1 to 365");
  const spend = values.spend ? readSpend(JSON.parse(await readFile(values.spend, "utf8"))) : undefined;
  const sources = values.source === "all" ? null : new Set(values.source!.split(",").map((s) => s.trim()).filter(Boolean));

  const to = new Date();
  const from = new Date(to.getTime() - days * 86_400_000);
  const db: SupabaseClient<Database> = createClient<Database>(`https://${PROJECT}.supabase.co`, await secretKey(), { auth: { persistSession: false, autoRefreshToken: false } });

  // Reads only. Order by a unique key, so a page never repeats or skips a row.
  const visitRows = (await all("ad_visits", (a, b) => db.from("ad_visits").select("visit_id, utm_source, utm_medium, utm_campaign, utm_content").gte("visited_at", from.toISOString()).lt("visited_at", to.toISOString()).order("id").range(a, b)))
    .filter((v) => !CHECK_SOURCES.has(v.utm_source ?? "") && !CHECK_CONTENTS.has(v.utm_content ?? "") && (sources === null || sources.has(v.utm_source ?? "")));
  const stepRows = await all("ad_visit_steps", (a, b) => db.from("ad_visit_steps").select("visit_id, step").gte("stepped_at", from.toISOString()).order("visit_id").order("step").range(a, b));
  const parentRows = await all("parents", (a, b) => db.from("parents").select("id, source").gte("created_at", from.toISOString()).not("source->>visit_id", "is", null).order("id").range(a, b));
  const testRows = await all("test_accounts", (a, b) => db.from("test_accounts").select("parent_id").order("parent_id").range(a, b));
  const adminRows = await all("admin_users", (a, b) => db.from("admin_users").select("user_id").order("user_id").range(a, b));

  const stepsOf = new Map<string, AdStep[]>();
  for (const s of stepRows) stepsOf.set(s.visit_id, [...(stepsOf.get(s.visit_id) ?? []), s.step as AdStep]);
  const familyOf = new Map<string, string>();
  for (const p of parentRows) { const id = p.source.visit_id; if (id && !familyOf.has(id)) familyOf.set(id, p.id); }

  const visits: AdVisitRecord[] = visitRows.map((v) => ({
    visitId: v.visit_id, source: v.utm_source, medium: v.utm_medium, campaign: v.utm_campaign, content: v.utm_content,
    steps: stepsOf.get(v.visit_id) ?? [], familyId: familyOf.get(v.visit_id) ?? null,
  }));
  const result = reviewAds({ visits, excludedFamilyIds: [...testRows.map((t) => t.parent_id), ...adminRows.map((a) => a.user_id)], spend });
  const report = renderAdReview(result, { window: `last ${days} day${days === 1 ? "" : "s"}`, from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) });
  console.log(report);
  if (values.out) {
    const path = resolve(values.out);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, report + "\n");
    console.error(`wrote ${path}`);
  }
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
