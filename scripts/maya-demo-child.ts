// Gives a test family a child Maya can work with in admin (#323): a Grade 2 BC child named "Sam" with one closed
// Grade 2 test whose first stage includes questions of the templates Maya supports (src/lib/question-package-assessment.ts). The test
// is stored as expired, started 40 days ago, so no reminder email is ever due for it (the late reminder stops after 7
// days) and nothing about it counts: the family is a test family (D-099), left out of the dashboard.
//
// Usage: npm run maya:demo-child -- --parent <test family's parent id>
// It refuses a family that is not in public.test_accounts. Run it again and it reuses the child and its test. The child
// was first named "Maya Demo", which reads as Maya, the AI: a run renames that child to "Sam" (in that family only).
// It refuses a "Sam" that is not a Grade 2 BC child, so it never adds a test to another child of the family.
// The secret key comes from SUPABASE_SECRET_KEY, else from the Supabase Management API with the token in
// SUPABASE_ACCESS_TOKEN or the macOS Keychain item "supabase-pagewise".
import { execFileSync } from "node:child_process";
import { randomInt } from "node:crypto";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { createSession, storedTest } from "@/lib/assessment";
import type { Database } from "@/lib/database";
import { SUPPORTED_ASSESSMENT_TEMPLATES } from "@/lib/question-package-assessment";

const PROJECT = "cdjobwsyzndtltzfpyqa";
const NAME = "Sam";
/** Names this script gave the demo child before; a run renames such a child to NAME. */
const OLD_NAMES = ["Maya Demo"];
const DAY = 86_400_000;

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
const parent = values.parent.toLowerCase();
const db = createClient<Database>(`https://${PROJECT}.supabase.co`, await secretKey(), { auth: { persistSession: false, autoRefreshToken: false } });

const { data: marked } = await db.from("test_accounts").select("parent_id").eq("parent_id", parent).maybeSingle();
if (!marked) throw new Error("the family is not a test family (public.test_accounts)");

let { data: child } = await db.from("children").select("id, grade, province").eq("parent_id", parent).eq("first_name", NAME).maybeSingle();
if (child && (child.grade !== 2 || child.province !== "BC")) throw new Error(`the family's "${NAME}" is not a Grade 2 BC child: pick another family`);
if (!child) {
  const { data: old } = await db.from("children").select("id, grade, province").eq("parent_id", parent).in("first_name", OLD_NAMES).maybeSingle();
  if (old) {
    const renamed = await db.from("children").update({ first_name: NAME }).eq("id", old.id).eq("parent_id", parent).select("id, grade, province").single();
    if (renamed.error) throw new Error(`rename: ${renamed.error.message}`);
    child = renamed.data;
    console.log(`renamed the demo child ${child.id} to ${NAME}`);
  }
}
if (!child) {
  const created = await db.from("children").insert({ parent_id: parent, first_name: NAME, grade: 2, province: "BC" }).select("id, grade, province").single();
  if (created.error) throw new Error(`child: ${created.error.message}`);
  child = created.data;
}

const { data: tests } = await db.from("assessments").select("id").eq("child_id", child.id);
if (!tests?.length) {
  // A test whose first stage has the most supported questions in 300 seeds (a Grade 2 first stage has at least one).
  const supported = new Set(SUPPORTED_ASSESSMENT_TEMPLATES);
  let best: { seed: number; count: number } = { seed: 0, count: 0 };
  for (let tries = 0; tries < 300; tries++) {
    const seed = randomInt(1, 2 ** 31);
    const count = createSession({ grade: 2, province: "BC" }, seed).stage1.filter((q) => supported.has(q.templateId)).length;
    if (count > best.count) best = { seed, count };
  }
  if (best.count === 0) throw new Error("no Grade 2 test with a supported question in 300 seeds");
  const seed = best.seed;
  const test = storedTest(createSession({ grade: 2, province: "BC" }, seed));
  const now = Date.now();
  const inserted = await db.from("assessments").insert({
    parent_id: parent, child_id: child.id, seed, grade: 2, province: "BC", test, status: "expired",
    started_at: new Date(now - 40 * DAY).toISOString(), resume_until: new Date(now - 39 * DAY).toISOString(),
  }).select("id").single();
  if (inserted.error) throw new Error(`test: ${inserted.error.message}`);
  console.log(`child ${child.id}, test ${inserted.data.id}`);
} else {
  console.log(`child ${child.id} already has a test: ${tests[0].id}`);
}
