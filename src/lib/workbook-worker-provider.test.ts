import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { describe, expect, it } from "vitest";

// Run the real worker entry point with a synthetic service client and queue. No hosted access.
async function workerTurn(options: { provider?: string; home?: string; auth?: boolean; unavailable?: "missing" | "config" | "login" | "between-jobs"; resume?: boolean } = {}) {
  const dir = await mkdtemp(join(tmpdir(), "workbook-provider-test-"));
  const bin = join(dir, "bin");
  const account = join(dir, "unify");
  const eventsFile = join(dir, "events");
  await mkdir(bin);
  await mkdir(account);
  await writeFile(eventsFile, "");
  const eventCode = `import { appendFileSync } from "node:fs"; const event = s => appendFileSync(${JSON.stringify(eventsFile)}, s + "\\n");`;
  try {
    if (options.auth !== false) await writeFile(join(account, "auth.json"), JSON.stringify({ auth_mode: "chatgpt", tokens: { access_token: "synthetic" } }));
    const help = "--ignore-user-config --ephemeral --skip-git-repo-check --sandbox --model --config --disable --json --output-schema --output-last-message";
    if (options.unavailable !== "missing") await writeFile(join(bin, "codex"), `#!${process.execPath}
      const fs = require("node:fs");
      fs.appendFileSync(${JSON.stringify(eventsFile)}, "codex " + process.argv.slice(2).join(" ") + "\\n");
      const previous = fs.readFileSync(${JSON.stringify(eventsFile)}, "utf8");
      if (${options.unavailable === "between-jobs"} && previous.includes("client\\n")) process.exit(1);
      if (process.argv.slice(2).join(" ") === "exec --help") console.log(${JSON.stringify(options.unavailable === "config" ? "old CLI" : help)});
      else if (process.argv.slice(2).join(" ") === "login status") console.error(${JSON.stringify(options.unavailable === "login" ? "Not logged in" : "Logged in using ChatGPT")});
      else process.exit(72);
    `, { mode: 0o755 });
    await writeFile(join(bin, "caffeinate"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
    const result = await build({
      absWorkingDir: fileURLToPath(new URL("../../", import.meta.url)), entryPoints: ["scripts/workbook-worker.ts"],
      outfile: join(dir, "worker.mjs"), bundle: true, platform: "node", target: "node22", format: "esm", packages: "external", write: false,
      plugins: [{ name: "synthetic-services", setup(b) {
        const modules: Record<string, string> = {
          "@supabase/supabase-js": `${eventCode} export function createClient() { event("client"); return {}; }`,
          "@/lib/workbook-job-deps": `${eventCode} export async function runWorkbookJobWith(_db, id, _place, options) { event("claim " + id + " " + options.resume); return "done"; }`,
          "@/lib/workbook-job-store": `${eventCode} export function workbookWorkerQueue() { return { candidates: async () => { event("queue"); return [{id: "synthetic-run", resume: ${!!options.resume}}]; }, beat: async () => {} }; }`,
          "@/lib/workbook-job": 'export const STALE_SECONDS = 360;',
        };
        b.onResolve({ filter: /.*/ }, args => modules[args.path] ? { path: args.path, namespace: "synthetic" } : undefined);
        b.onLoad({ filter: /.*/, namespace: "synthetic" }, args => ({ contents: modules[args.path], loader: "js" }));
      } }],
    });
    await writeFile(join(dir, "worker.mjs"), result.outputFiles[0].contents);
    const child = spawn(process.execPath, [join(dir, "worker.mjs"), "--once"], {
      cwd: dir,
      env: {
        NODE_ENV: "test", PATH: `${bin}:/usr/bin:/bin`, HOME: dir, WORKBOOK_WORKER_ENV: join(dir, "absent.env"),
        SUPABASE_SECRET_KEY: "synthetic", OPENROUTER_API_KEY: "synthetic", WORKBOOK_AI_PRIMARY: "api",
        WORKBOOK_SUBSCRIPTION_PROVIDER: options.provider ?? "codex", WORKBOOK_CODEX_HOME: options.home ?? account,
      }, stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", chunk => { output += String(chunk); });
    child.stderr.on("data", chunk => { output += String(chunk); });
    const code = await new Promise<number | null>((resolve, reject) => { child.on("error", reject); child.on("close", resolve); });
    const events = (await readFile(eventsFile, "utf8")).trim().split("\n").filter(Boolean);
    return { code, events, output };
  } finally { await rm(dir, { recursive: true, force: true }); }
}

describe("worker subscription checks before claims", () => {
  it.each([false, true])("checks startup and the selected account again before a job (resume=%s)", async resume => {
    const result = await workerTurn({ resume });
    expect(result.code).toBe(0);
    expect(result.events).toEqual(["codex exec --help", "codex login status", "client", "queue", "codex exec --help", "codex login status", `claim synthetic-run ${resume}`]);
    expect(result.output).toContain("Codex subscription only: API fallback is disabled");
    expect(result.output).toContain("writer codex/gpt-6.1-sol;reasoning=high;auth=chatgpt; solver codex/gpt-6.1-sol;reasoning=high;auth=chatgpt");
  });

  it.each([
    { provider: "invalid" }, { home: "" }, { home: "relative" }, { auth: false },
    { unavailable: "missing" as const }, { unavailable: "config" as const }, { unavailable: "login" as const },
  ])("fails before service access or a claim when configuration is unavailable: %j", async options => {
    const result = await workerTurn(options);
    expect(result.code).not.toBe(0);
    expect(result.events).not.toContain("client");
    expect(result.events.some(event => event.startsWith("claim"))).toBe(false);
  });

  it("does not claim the next run after local availability is lost", async () => {
    const result = await workerTurn({ unavailable: "between-jobs" });
    expect(result.events).toEqual(["codex exec --help", "codex login status", "client", "queue", "codex exec --help"]);
    expect(result.output).toContain("Codex local availability check failed");
  });

  it("preserves the default Claude path and API-first setting", async () => {
    const result = await workerTurn({ provider: "claude", home: "", auth: false });
    expect(result.code).toBe(0);
    expect(result.events).toEqual(["client", "queue", "claim synthetic-run false"]);
    expect(result.output).toContain("the API first");
  });
});
