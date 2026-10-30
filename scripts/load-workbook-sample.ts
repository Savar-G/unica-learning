// Loads the sample workbook (#299, src/lib/workbook-sample.ts) for a child of a test family: draws each page, stores
// the page images in the private bucket "workbook-pages", then writes the whole workbook with the workbook store. It
// refuses a family that is not marked as a test family (public.test_accounts). If the write is refused, it removes
// the images it stored.
//
// Usage: node scripts/load-workbook-sample.mjs --child <child id> [--number <n>]
// It builds this file into .workbook-sample/load.mjs and runs it. The secret key comes from SUPABASE_SECRET_KEY, else
// from the Supabase Management API with the token in SUPABASE_ACCESS_TOKEN or the macOS Keychain item
// "supabase-pagewise". No key or token is printed.
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import type { Database } from "@/lib/database";
import { WORKBOOK_FILES_BUCKET } from "@/lib/workbook-content";
import { pageSvg, sampleWorkbook } from "@/lib/workbook-sample";
import { workbookStore } from "@/lib/workbook-store";

const PROJECT = "cdjobwsyzndtltzfpyqa";
const URL = `https://${PROJECT}.supabase.co`;

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

const { values } = parseArgs({ options: { child: { type: "string" }, number: { type: "string" } } });
if (!values.child) throw new Error("usage: --child <child id> [--number <n>]");

const db = createClient<Database>(URL, await secretKey(), { auth: { persistSession: false, autoRefreshToken: false } });
const { data: child, error } = await db.from("children").select("id, parent_id").eq("id", values.child).maybeSingle();
if (error || !child) throw new Error(`child not found${error ? `: ${error.message}` : ""}`);
const { data: test } = await db.from("test_accounts").select("parent_id").eq("parent_id", child.parent_id).maybeSingle();
if (!test) throw new Error("the child's family is not a test family");

const workbook = sampleWorkbook({
  workbookId: randomUUID(), childId: child.id, parentId: child.parent_id, number: values.number ? Number(values.number) : 1,
  qrTokens: [1, 2, 3].map(() => randomBytes(16).toString("base64url")),
});
const stored: string[] = [];
for (const page of workbook.pages) {
  if (!page.image) continue;
  const png = await sharp(Buffer.from(pageSvg(page))).png().toBuffer();
  const up = await db.storage.from(WORKBOOK_FILES_BUCKET).upload(page.image.path, png, { contentType: "image/png", upsert: false });
  if (up.error) throw new Error(`upload page ${page.number}: ${up.error.message}`);
  stored.push(page.image.path);
}
const result = await workbookStore(db).write(workbook);
if (result.status !== "written") {
  await db.storage.from(WORKBOOK_FILES_BUCKET).remove(stored);
  throw new Error(`refused: ${result.reason}`);
}
console.log(JSON.stringify({ workbook: result.workbookId, child: child.id, pages: workbook.pages.length, images: stored.length }));
