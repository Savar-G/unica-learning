// Gives a test family the demo child of Maya's admin test calls (#323): see src/lib/maya-demo-child.ts for what it
// makes and the rule that it changes only the child it made (its marker row in public.maya_demo_children).
//
// Usage: npm run maya:demo-child -- --parent <test family's parent id>
// The secret key comes from SUPABASE_SECRET_KEY, else from the Supabase Management API with the token in
// SUPABASE_ACCESS_TOKEN or the macOS Keychain item "supabase-pagewise".
import { execFileSync } from "node:child_process";
import { randomInt } from "node:crypto";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { ensureDemoChild } from "@/lib/maya-demo-child";
import { demoChildStore } from "@/lib/maya-demo-child-store";

const PROJECT = "cdjobwsyzndtltzfpyqa";

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

const { values } = parseArgs({ options: { parent: { type: "string" } } });
if (!values.parent) throw new Error("usage: --parent <test family's parent id>");
const db = createClient<Database>(`https://${PROJECT}.supabase.co`, await secretKey(), { auth: { persistSession: false, autoRefreshToken: false } });
const r = await ensureDemoChild(demoChildStore(db), values.parent.toLowerCase(), { now: Date.now(), seed: () => randomInt(1, 2 ** 31) });
if (r.created) console.log(`made the demo child ${r.child.id} (${r.child.firstName})`);
if (r.renamedFrom) console.log(`renamed the demo child ${r.child.id} from ${r.renamedFrom} to ${r.child.firstName}`);
console.log(`demo child ${r.child.id} (${r.child.firstName}), test ${r.testId}${r.testCreated ? " (new)" : ""}`);
