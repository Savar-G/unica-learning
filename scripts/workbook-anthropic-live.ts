// One explicitly authorized family's Book 1. No global worker, subscription fallback, approval or email.
import { execFileSync } from "node:child_process";
import { readFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { configureAiUsage, flushAiUsage } from "@/lib/ai-usage";
import { runWorkbookJobWith } from "@/lib/workbook-job-deps";
import { startWorkbookRun } from "@/lib/workbook-job";
import { workbookRunStore } from "@/lib/workbook-job-store";
import { workbookAnthropicBudget } from "./workbook-anthropic-budget.mjs";

const PROJECT = "cdjobwsyzndtltzfpyqa";
delete process.env.WORKBOOK_AI_FAKE;
const { values } = parseArgs({ options: { child: { type: "string" }, "resume-run": { type: "string" }, execute: { type: "boolean", default: false }, help: { type: "boolean", default: false } } });
if (values.help) {
  console.log("node scripts/workbook-anthropic-live.mjs --child LABEL [--resume-run ID] [--execute]\nWORKBOOK_LIVE_CONFIG must name the private family config (parentId, actor, surname, children, optional limitUsd). ANTHROPIC_API_KEY_FILE must name the private key file. Read-only preflight is the default. Each child has one persistent ledger (at most $35). --execute creates or resumes Book 1 without approving or shipping it.");
  process.exit(0);
}
// Family identity lives in a private file outside the repo: no child ids, names or admin email in source.
const configFile = process.env.WORKBOOK_LIVE_CONFIG;
if (!configFile) throw new Error("WORKBOOK_LIVE_CONFIG is required; it names the private family config");
const config: unknown = JSON.parse(await readFile(configFile, "utf8"));
const text = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const record = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
if (!record(config) || !text(config.parentId) || !text(config.surname) || !record(config.actor) || !text(config.actor.id) || !text(config.actor.email)
  || !record(config.children) || !Object.values(config.children).every(text)
  || (config.limitUsd !== undefined && (typeof config.limitUsd !== "number" || !(config.limitUsd > 0 && config.limitUsd <= 35)))) throw new Error("The private family config is invalid");
const PARENT = config.parentId;
const ACTOR = { id: config.actor.id, email: config.actor.email };
const CHILDREN = config.children as Record<string, string>;
const limitUsd = typeof config.limitUsd === "number" ? config.limitUsd : 35;
const name = values.child;
if (!name || !Object.hasOwn(CHILDREN, name)) throw new Error(`Choose an authorized child: ${Object.keys(CHILDREN).join(" or ")}`);
const childId = CHILDREN[name];
const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
if (git("status", "--porcelain")) throw new Error("Commit the reviewed code before a live run; the checkout must be clean");
const build = git("rev-parse", "HEAD");
const keyFile = process.env.ANTHROPIC_API_KEY_FILE;
if (!keyFile) throw new Error("ANTHROPIC_API_KEY_FILE is required; never put a key in the command line");
const apiKey = (await readFile(keyFile, "utf8")).trim();
if (!apiKey) throw new Error("The saved Anthropic key is empty");
let serviceKey = process.env.SUPABASE_SECRET_KEY;
if (!serviceKey) {
  const token = process.env.SUPABASE_ACCESS_TOKEN || execFileSync("security", ["find-generic-password", "-s", "supabase-pagewise", "-w"], { encoding: "utf8" }).trim();
  const response = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`Supabase credential lookup failed (${response.status})`);
  const keys: unknown = await response.json();
  if (!Array.isArray(keys)) throw new Error("Supabase returned invalid credentials");
  const found = keys.find((key: unknown) => typeof key === "object" && key !== null && "api_key" in key && typeof key.api_key === "string" && "type" in key && (key.type === "secret" || (key.type === "legacy" && "name" in key && key.name === "service_role")));
  if (!found || typeof found.api_key !== "string") throw new Error("No Supabase service credential is available");
  serviceKey = found.api_key;
}
if (!serviceKey) throw new Error("No Supabase service credential is available");
const url = `https://${PROJECT}.supabase.co`;
const admin = createClient<Database>(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const [child, actor, books, active] = await Promise.all([
  admin.from("children").select("id,parent_id,first_name").eq("id", childId).single(),
  admin.from("admin_users").select("user_id,email").eq("user_id", ACTOR.id).single(),
  admin.from("workbooks").select("id,number,status").eq("child_id", childId),
  admin.from("workbook_runs").select("id,status").eq("child_id", childId).in("status", ["queued", "running"]),
]);
for (const result of [child, actor, books, active]) if (result.error) throw new Error(result.error.message);
if (child.data?.parent_id !== PARENT || child.data.first_name !== `${name} ${config.surname}` || actor.data?.email !== ACTOR.email) throw new Error("The authorized family or admin identity did not match");
if (books.data?.length) throw new Error("A stored workbook already exists; this authorization covers Book 1 only");
if (active.data?.some(run => run.id !== values["resume-run"])) throw new Error("This child already has a queued or running workbook; no duplicate was created");
const runs = workbookRunStore(admin);
const resumeRun = values["resume-run"] ? await runs.run(values["resume-run"]) : null;
if (values["resume-run"]) {
  if (!resumeRun || resumeRun.childId !== childId || resumeRun.parentId !== PARENT || resumeRun.number !== 1 || resumeRun.runner !== "server" || resumeRun.startedBy.id !== ACTOR.id || !["queued", "running"].includes(resumeRun.status)) throw new Error("Only this child's active authorized API Book 1 can resume");
  const frame = await runs.frame(resumeRun.id);
  if (resumeRun.status === "running" && !frame) throw new Error("The running book has no checkpoint; inspect it before resuming");
  if (frame && (frame.versions.build !== build || frame.versions.model !== "claude-sonnet-5-5" || frame.versions.solveModel !== "claude-haiku-5-5")) throw new Error("The checkpoint belongs to another build or provider; no request sent");
}
const stateDir = join(homedir(), ".local/state/unica/workbook-anthropic-live");
await mkdir(stateDir, { recursive: true, mode: 0o700 });
const budget = await workbookAnthropicBudget({ file: join(stateDir, `${childId}.json`), childId, limitUsd });
console.log(JSON.stringify({ child: name, build, budget: await budget.state(), execute: values.execute }));
if (!values.execute) process.exit(0);
// Deliberately isolated env: profile AI and unrelated accounts cannot consume this authorization.
const env = {
  WORKBOOK_API_PROVIDER: "anthropic", WORKBOOK_AI_PRIMARY: "api", WORKBOOK_ANTHROPIC_CHILD_ID: childId,
  ANTHROPIC_API_KEY: apiKey, NODE_ENV: "production", CHROMIUM_PATH: process.env.CHROMIUM_PATH,
};
configureAiUsage({ url, key: serviceKey });
try {
  let run = resumeRun;
  if (!run) {
    const started = await startWorkbookRun(runs, childId, ACTOR);
    if (started.status !== "started") throw new Error(`Workbook start refused: ${started.status}`);
    run = await runs.run(started.runId);
    if (!run || run.childId !== childId || run.parentId !== PARENT || run.number !== 1 || run.runner !== "server") {
      await runs.stop(started.runId, ACTOR);
      throw new Error("The new run did not match the authorized Book 1; it was stopped before generation");
    }
  }
  console.log(JSON.stringify({ child: name, runId: run.id, status: resumeRun ? "resuming" : "started", provider: "anthropic" }));
  const outcome = await runWorkbookJobWith(admin, run.id, {
    subscription: false, primary: "api", env, build, budgetMs: 6 * 3_600_000, timeLimitMs: 10 * 60_000,
    anthropicFetchWrapper: budget.wrap,
  }, { resume: run.status === "running" });
  console.log(JSON.stringify({ child: name, runId: run.id, outcome, budget: await budget.state() }));
  if (outcome !== "done") process.exitCode = 1;
} finally { await flushAiUsage(); }
