// #870 Recovers the Book 1 baseline of one approved Book 1 run that the site could not capture: a frame with no planning
// capture (runs made before #472), or a frame planned on a curriculum version that a later deploy changed. Both need
// the frame's own build: the pinned original planner and its curriculum, built from this repository's Git objects
// (src/lib/workbook-book1-pinned.ts). The record then copies the skills and steps of exactly the version Book 1 was
// planned on. Run it on the Mac, from a checkout that has the frame's build commit.
//
//   npm run workbooks:book1-recover -- --run <run id>          # check only: saves nothing
//   npm run workbooks:book1-recover -- --run <run id> --save   # saves the baseline for the latest approved version
//
// The check runs everything --save runs: it reads the latest approval (its version and its admin), proves or recovers
// the planning input, makes the record (createBook1Baseline), and runs the database save in a transaction that is
// always rolled back, so every SQL precondition is checked and nothing stays. It also says whether book 2 can be
// planned on today's curriculum after this book (nextBookCurriculumCompat, #812). It never replaces a baseline: when
// one binds that version, it prints it and stops. The secret key and the check's database call use the token in
// SUPABASE_ACCESS_TOKEN or the macOS Keychain item "supabase-pagewise" (or SUPABASE_SECRET_KEY for the key).
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { book1BaselineId } from "@/lib/workbook-book1-capture";
import { book1CaptureDeps, book1PendingStore } from "@/lib/workbook-book1-capture-server";
import { loadPinnedPlanningEngine } from "@/lib/workbook-book1-pinned";
import type { Book1RecoverySources, PinnedPlanningEngine } from "@/lib/workbook-book1-recovery";
import { captureBook1Baseline, prepareBook1Baseline, type Book1CaptureDeps } from "@/lib/workbook-book1-store";
import { isUuid } from "@/lib/workbook-content";
import { nextBookCurriculumCompat } from "@/lib/workbook-curriculum/compat";

const PROJECT = "cdjobwsyzndtltzfpyqa";
const accessToken = () => process.env.SUPABASE_ACCESS_TOKEN
  || execFileSync("security", ["find-generic-password", "-s", "supabase-pagewise", "-w"], { encoding: "utf8" }).trim();

async function secretKey(): Promise<string> {
  if (process.env.SUPABASE_SECRET_KEY) return process.env.SUPABASE_SECRET_KEY;
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${accessToken()}` } });
  if (!res.ok) throw new Error(`api keys: HTTP ${res.status}`);
  const keys = await res.json() as { name: string; type: string; api_key: string | null }[];
  const key = keys.find((k) => k.type === "legacy" && k.name === "service_role")?.api_key ?? keys.find((k) => k.type === "secret")?.api_key;
  if (!key) throw new Error("no secret key");
  return key;
}

/** The real save function, in a block that always raises: the database checks every precondition, and nothing stays. */
async function rolledBackSave(a: { actor: string; parent: string; child: string; run: string; draft: string; id: string; payload: string; hash: string }): Promise<unknown> {
  const tag = `$b1_${randomBytes(8).toString("hex")}$`;
  if (a.payload.includes(tag) || ![a.actor, a.parent, a.child, a.run, a.draft, a.id].every(isUuid) || !/^[0-9a-f]{64}$/.test(a.hash)) throw new Error("check-input");
  const query = `do $check$ declare r jsonb; begin
    r := public.workbook_book1_baseline_command('save', '${a.actor}', '${a.parent}', '${a.child}', '${a.run}', '${a.draft}', '${a.id}', ${tag}${a.payload}${tag}, '${a.hash}');
    raise exception 'BOOK1_CHECK %', r; end $check$;`;
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
    method: "POST", headers: { Authorization: `Bearer ${accessToken()}`, "Content-Type": "application/json" }, body: JSON.stringify({ query }) });
  const text = await res.text();
  const found = /BOOK1_CHECK (\{.*?\})(?:\\n|")/.exec(text);
  if (!found) throw new Error(`check: HTTP ${res.status}, no answer`);
  return JSON.parse(found[1].replace(/\\"/g, "\""));
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
const request = { id: book1BaselineId(run.draft_id, revision), actorId: approval.actor_id, parentId: run.parent_id, childId: run.child_id, runId, revision };

const bound = await book1PendingStore(db).existing(run.draft_id, revision);
if (bound) {
  console.log(`A baseline already binds version ${revision}: ${bound.id}. Nothing to do.`);
  process.exit(0);
}
const base = book1CaptureDeps(db);
const framed = await base.frame(runId);
if (!framed) throw new Error("The run has no frame.");
const build = framed.frame.versions.build;
if (!build) throw new Error("The frame names no build: the pinned planner and curriculum cannot be loaded.");
const engine: PinnedPlanningEngine = await loadPinnedPlanningEngine(build, process.cwd());
const profile = (await db.from("child_profiles").select("revision, built_at, profile").eq("child_id", run.child_id).eq("parent_id", run.parent_id).maybeSingle()).data;
const sources: Book1RecoverySources = {
  version: 1, run: { id: runId, number: 1 }, frame: { reference: framed.reference, createdAt: framed.createdAt, value: framed.frame },
  profile: framed.frame.profileRevision === null || !profile ? null
    : { reference: `child_profiles:${run.child_id}:${profile.revision}`, revision: profile.revision, builtAt: profile.built_at, value: profile.profile },
};
const deps: Book1CaptureDeps = {
  ...base,
  recovery: { sources: async () => sources, engine: async (pin) => (pin === build ? engine : null) },
  curricula: { version: (k) => engine.curriculumVersion(k), curriculum: (k) => engine.curriculum?.(k) ?? null },
};

const final = await base.draft(runId);
console.log(`Run ${runId}, frame build ${build}, frame curriculum ${framed.frame.curriculum} / ${framed.frame.versions.curriculum}.`);
console.log(`Target version ${revision} (latest approval); final draft version ${final?.revision ?? "none"}.`);
const compat = nextBookCurriculumCompat(framed.frame.curriculum, framed.frame.versions.curriculum);
console.log(`Book 2 on today's curriculum (#812): ${compat.ok ? (compat.same ? "same version" : "compatible: same structure") : `refused: ${compat.reason}${compat.difference ? ` (${compat.difference})` : ""}`}.`);

if (!values.save) {
  const prepared = await prepareBook1Baseline(deps, request);
  if (prepared.status === "refused") {
    console.log(`createBook1Baseline: refused: ${prepared.reason}.`);
    process.exit(1);
  }
  console.log(`Planning: ${prepared.planning.kind}, input hash ${prepared.planning.inputHash}.`);
  console.log(`createBook1Baseline: ok, record ${request.id}, payload hash ${prepared.record.hash}.`);
  const sql = await rolledBackSave({ actor: request.actorId, parent: request.parentId, child: request.childId, run: runId, draft: prepared.scope.draftId,
    id: request.id, payload: prepared.record.payload, hash: prepared.record.hash });
  console.log(`SQL preconditions (save rolled back): ${JSON.stringify(sql)}.`);
  const saved = (sql as { status?: unknown }).status === "saved";
  console.log(saved ? `Verdict: --save would store the baseline for version ${revision}.` : "Verdict: --save would be refused.");
  process.exit(saved ? 0 : 1);
}
const result = await captureBook1Baseline(deps, request);
console.log(result.status === "refused" ? `Refused: ${result.reason}.` : `${result.status}: baseline ${result.baseline.id} for version ${revision}.`);
process.exit(result.status === "refused" ? 1 : 0);
