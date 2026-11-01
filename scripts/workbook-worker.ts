// The workbook worker (D-200): a long-running process on Savar's Mac that makes the workbooks "Prepare next workbook"
// queued for the Mac, on his Claude subscription (`claude -p`), with the paid API (OpenRouter) as the fallback. See
// docs/workbook-worker.md for setup (a dedicated checkout that follows origin/main, a LaunchAgent that starts it at
// login and restarts it, logs in ~/Library/Logs).
//
// Usage: npm run workbooks:worker -- [--once] [--follow-main]
//   --once         one turn: make the oldest waiting run (if any), then stop.
//   --follow-main  between runs, every 5 minutes, fetch origin/main; when it moved, exit so the launcher pulls the new
//                  code and starts the worker again (scripts/workbook-worker.sh passes it).
// Settings (environment, or the file WORKBOOK_WORKER_ENV, default ~/.config/unica/workbook-worker.env):
//   SUPABASE_SECRET_KEY: else the Supabase Management API with SUPABASE_ACCESS_TOKEN or the Keychain item
//     "supabase-pagewise". No key is printed.
//   WORKBOOK_AI_PRIMARY (subscription|api), WORKBOOK_CLAUDE_MODEL, WORKBOOK_CLAUDE_SOLVE_MODEL, WORKBOOK_CLAUDE_CONFIG_DIR,
//     WORKBOOK_CLAUDE_COMMAND, WORKBOOK_CLAUDE_TIMEOUT_MS: src/lib/workbook-ai.ts.
//   OPENROUTER_API_KEY (the fallback; without it a subscription failure fails the call), AI_MODEL, AI_SOLVE_MODEL.
//   WORKBOOK_WORKER_ID: the heartbeat's name (default this Mac's host name). CHROMIUM_PATH: else Google Chrome.
import { execFileSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir, hostname } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { workbookAiPrimary } from "@/lib/workbook-ai";
import { runWorkbookJobWith } from "@/lib/workbook-job-deps";
import { workbookWorkerQueue } from "@/lib/workbook-job-store";
import { workbookWorker } from "@/lib/workbook-worker";

const PROJECT = "cdjobwsyzndtltzfpyqa";
const { values } = parseArgs({ options: { once: { type: "boolean", default: false }, "follow-main": { type: "boolean", default: false } } });

const envFile = process.env.WORKBOOK_WORKER_ENV || join(homedir(), ".config/unica/workbook-worker.env");
if (existsSync(envFile)) process.loadEnvFile(envFile);
// The worker never makes a run with the fakes: WORKBOOK_AI_FAKE is for the dev server.
delete process.env.WORKBOOK_AI_FAKE;
// `claude` must use its own login, never an API key (the adapter passes it no key either).
delete process.env.ANTHROPIC_API_KEY;

const log = (line: string) => console.log(`${new Date().toISOString()} ${line}`);

async function secretKey(): Promise<string> {
  if (process.env.SUPABASE_SECRET_KEY) return process.env.SUPABASE_SECRET_KEY;
  const token = process.env.SUPABASE_ACCESS_TOKEN
    || execFileSync("security", ["find-generic-password", "-s", "supabase-pagewise", "-w"], { encoding: "utf8" }).trim();
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Supabase api keys: HTTP ${res.status}`);
  const keys = await res.json() as { name: string; type: string; api_key: string | null }[];
  const key = keys.find((k) => k.type === "secret")?.api_key ?? keys.find((k) => k.type === "legacy" && k.name === "service_role")?.api_key;
  if (!key) throw new Error("no Supabase secret key");
  return key;
}

const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();

/**
 * This checkout's code: its commit when nothing tracked is changed, so a run can go on on the server's deploy of the
 * same commit; else a value of its own (R379-9-1), so a run never goes on across changed code.
 */
function build(): string {
  try {
    const sha = git("rev-parse", "HEAD");
    return git("status", "--porcelain", "--untracked-files=no") ? `local-${randomUUID()}` : sha;
  } catch {
    return `local-${randomUUID()}`;
  }
}

/** Keeps the Mac awake (no idle sleep, no system sleep on power) while a run is made; ends with this process too. */
function keepAwake(): () => void {
  try {
    const child = spawn("caffeinate", ["-i", "-s", "-w", String(process.pid)], { stdio: "ignore" });
    child.on("error", (e) => log(`caffeinate failed: ${e.message}`));
    return () => { child.kill(); };
  } catch (e) {
    log(`caffeinate failed: ${e instanceof Error ? e.message : String(e)}`);
    return () => undefined;
  }
}

/** True when origin/main has a newer commit than this checkout (checked at most every 5 minutes). */
let lastCheck = 0;
async function newerMain(): Promise<boolean> {
  if (!values["follow-main"] || Date.now() - lastCheck < 5 * 60_000) return false;
  lastCheck = Date.now();
  git("fetch", "--quiet", "origin", "main");
  return git("rev-parse", "origin/main") !== git("rev-parse", "HEAD");
}

const code = build();
const primary = workbookAiPrimary();
const id = process.env.WORKBOOK_WORKER_ID?.trim() || hostname().replace(/\.local$/, "");
const url = process.env.SUPABASE_URL || `https://${PROJECT}.supabase.co`;
const admin = createClient<Database>(url, await secretKey(), { auth: { persistSession: false, autoRefreshToken: false } });
if (!process.env.OPENROUTER_API_KEY) log("OPENROUTER_API_KEY is not set: there is no API fallback, so a call the subscription cannot take fails.");
log(`workbook worker ${id} on ${code.slice(0, 12)}: ${primary === "subscription" ? "the Claude subscription first" : "the API first"}`);

const worker = workbookWorker({
  queue: workbookWorkerQueue(admin, { id, build: code, primary }),
  // No Vercel time limit: one job call makes the whole run (6 hours at most, then it is taken up again).
  runJob: (runId, resume) => runWorkbookJobWith(admin, runId, { subscription: true, build: code, budgetMs: 6 * 3_600_000, timeLimitMs: 10 * 60_000 }, { resume }),
  keepAwake,
  shouldExit: newerMain,
  log,
});

if (values.once) {
  const r = await worker.tick();
  log(`one turn: ${typeof r === "string" ? r : `${r.ran} ${r.outcome}`}`);
  worker.setNote("stopped");
  await worker.beat();
  process.exit(0);
}

const stop = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    log(`${signal}: stopping after the current run`);
    stop.abort();
  });
}
const ended = await worker.run({ stop: stop.signal, pollMs: 10_000, heartbeatMs: 30_000 });
log(ended === "exit" ? "origin/main moved: exiting so the launcher starts the new code" : "stopped");
process.exit(0);
