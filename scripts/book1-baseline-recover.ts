// #870 Recovers the Book 1 baseline of one approved Book 1 run whose frame kept no planning capture (runs made before
// #472). The site cannot: recovery runs the pinned original planner, built from this repository's Git objects
// (src/lib/workbook-book1-pinned.ts). Run it on the Mac, from a checkout that has the frame's build commit.
//
//   npm run workbooks:book1-recover -- --run <run id>          # check only: prints the recovered input hash, saves nothing
//   npm run workbooks:book1-recover -- --run <run id> --save   # saves the baseline for the latest approved version
//
// It takes the run's latest approval (its version and its admin), the run frame and the child's current profile. It
// never replaces a baseline: when one binds that version, it prints it and stops. Recovery refuses (with a reason) when
// anything differs from what planned the book, for example when the child's profile was rebuilt after the frame.
// The secret key comes from SUPABASE_SECRET_KEY, else from the Supabase Management API with the token in
// SUPABASE_ACCESS_TOKEN or the macOS Keychain item "supabase-pagewise".
import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { book1BaselineId } from "@/lib/workbook-book1-capture";
import { book1CaptureDeps, book1PendingStore } from "@/lib/workbook-book1-capture-server";
import { loadPinnedPlanningEngine } from "@/lib/workbook-book1-pinned";
import { recoverBook1PlanningInput, type Book1RecoverySources } from "@/lib/workbook-book1-recovery";
import { captureBook1Baseline } from "@/lib/workbook-book1-store";
import { isUuid } from "@/lib/workbook-content";

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

const { values } = parseArgs({ options: { run: { type: "string" }, save: { type: "boolean", default: false } } });
const runId = values.run?.toLowerCase();
if (!runId || !isUuid(runId)) throw new Error("usage: --run <run id> [--save]");
const db = createClient<Database>(`https://${PROJECT}.supabase.co`, await secretKey(), { auth: { persistSession: false, autoRefreshToken: false } });

const run = (await db.from("workbook_runs").select("parent_id, child_id, number, draft_id").eq("id", runId).maybeSingle()).data;
if (!run?.draft_id || run.number !== 1) throw new Error("No Book 1 run with a draft.");
const approval = (await db.from("workbook_audit").select("actor_id, detail").eq("workbook_id", run.draft_id).eq("action", "workbook-approved")
  .order("id", { ascending: false }).limit(1).maybeSingle()).data;
const revision = (approval?.detail as { revision?: unknown } | null | undefined)?.revision;
if (!approval?.actor_id || typeof revision !== "number") throw new Error("The draft has no approval.");
const target = { runId, draftId: run.draft_id, revision, parentId: run.parent_id, childId: run.child_id, actorId: approval.actor_id };

const bound = await book1PendingStore(db).existing(target.draftId, revision);
if (bound) {
  console.log(`A baseline already binds version ${revision}: ${bound.id}. Nothing to do.`);
  process.exit(0);
}
const deps = book1CaptureDeps(db);
const framed = await deps.frame(runId);
if (!framed) throw new Error("The run has no frame.");
const profile = (await db.from("child_profiles").select("revision, built_at, profile").eq("child_id", run.child_id).eq("parent_id", run.parent_id).maybeSingle()).data;
const sources: Book1RecoverySources = {
  version: 1, run: { id: runId, number: 1 }, frame: { reference: framed.reference, createdAt: framed.createdAt, value: framed.frame },
  profile: framed.frame.profileRevision === null || !profile ? null
    : { reference: `child_profiles:${run.child_id}:${profile.revision}`, revision: profile.revision, builtAt: profile.built_at, value: profile.profile },
};
const engine = (pin: string) => loadPinnedPlanningEngine(pin, process.cwd());
const build = framed.frame.versions.build;
if (!build) throw new Error("The frame names no build: recovery cannot run.");

if (!values.save) {
  const recovered = recoverBook1PlanningInput(sources, await engine(build));
  console.log(recovered.ok ? `Recovered: input hash ${recovered.inputHash}. Run again with --save to store the baseline for version ${revision}.`
    : `Refused: ${recovered.reason}.`);
  process.exit(recovered.ok ? 0 : 1);
}
const result = await captureBook1Baseline({ ...deps, recovery: { sources: async () => sources, engine } },
  { id: book1BaselineId(target.draftId, revision), actorId: target.actorId, parentId: target.parentId, childId: target.childId, runId, revision });
console.log(result.status === "refused" ? `Refused: ${result.reason}.` : `${result.status}: baseline ${result.baseline.id} for version ${revision}.`);
process.exit(result.status === "refused" ? 1 : 0);
