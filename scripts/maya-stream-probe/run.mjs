import { build } from "esbuild";
import { fork, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("../..", import.meta.url));
const project = "https://cdjobwsyzndtltzfpyqa.supabase.co";
const owned = new Set();
const stopOwned = () => { for (const child of owned) child.kill("SIGKILL"); };
process.once("exit", stopOwned);

export async function buildWorker() {
  const directory = await mkdtemp(join(tmpdir(), "maya-stream-probe-"));
  try {
    const built = await build({ absWorkingDir: root, entryPoints: [join(root, "scripts/maya-stream-probe/worker.ts")],
      platform: "node", target: "node22", format: "cjs", bundle: true, write: false, metafile: true, logLevel: "silent",
      alias: { "@": join(root, "src") }, outfile: join(directory, "worker.cjs"),
      plugins: [{ name: "probe-boundaries", setup(b) {
        b.onResolve({ filter: /^server-only$/ }, () => ({ path: "server-only", namespace: "empty" }));
        b.onLoad({ filter: /.*/, namespace: "empty" }, () => ({ contents: "", loader: "js" }));
        // The core imports its timing helpers from ai-client. Compile only those exact function bodies.
        // No client factory, provider, usage adapter or credential lookup enters the process.
        b.onLoad({ filter: /[/\\]src[/\\]lib[/\\]ai-client\.ts$/ }, async ({ path }) => {
          const source = ts.createSourceFile(path, await readFile(path, "utf8"), ts.ScriptTarget.Latest, true);
          const helpers = source.statements.filter(s => ts.isFunctionDeclaration(s) && ["hedged", "withTimeLimit"].includes(s.name?.text));
          if (helpers.length !== 2) throw Error("Timing helper source changed");
          return { contents: helpers.map(s => s.getText(source)).join("\n"), loader: "ts" };
        });
      } }],
    });
    const files = Object.keys(built.metafile.inputs).filter(p => p.startsWith("src/") || p.startsWith("scripts/"));
    if (files.some(p => /(?:ai-openrouter|ai-usage|maya-ai-route|maya-call-seams|maya-chat-server|supabase-auth|email-delivery|stripe)\.ts$/.test(p))) throw Error("A live service adapter entered the probe");
    const digest = createHash("sha256");
    for (const file of files.sort()) { digest.update(file); digest.update(await readFile(join(root, file))); }
    await writeFile(join(directory, "worker.cjs"), built.outputFiles[0].contents);
    return { directory, entry: join(directory, "worker.cjs"), sourceHash: digest.digest("hex"), files };
  } catch (e) { await rm(directory, { recursive: true, force: true }); throw e; }
}

/** One fresh OS process per phase. The writer is killed only after a durable checkpoint response. */
export async function worker(entry, config, boundary = false) {
  const child = fork(entry, [], { env: {}, execArgv: [], stdio: ["ignore", "ignore", "ignore", "ipc"] });
  owned.add(child);
  let answer, failure;
  const timeout = setTimeout(() => { failure = Error("Probe process time limit"); child.kill("SIGKILL"); }, 30_000);
  try {
    return await new Promise((accept, reject) => {
      child.on("error", () => { failure = Error("Probe process failed"); child.kill("SIGKILL"); });
      child.on("message", message => {
        if (message.kind === "boundary" && boundary) { answer = message; child.kill("SIGKILL"); }
        else if (message.kind === "result" && !boundary) answer = message.result;
        else { failure = Error(`Probe worker ${config.role} ${config.index} failed at ${message.stage ?? "process"} (${message.location ?? "no location"})`); child.kill("SIGKILL"); }
      });
      child.once("exit", (code, signal) => {
        if (failure) reject(failure);
        else if (!answer || (boundary ? signal !== "SIGKILL" : code !== 0)) reject(Error("Probe process ended before its required boundary"));
        else accept({ ...answer, pid: child.pid, stopped: true });
      });
      child.send(config);
    });
  } finally { clearTimeout(timeout); owned.delete(child); }
}

/** @param {any} config @param {(result: any) => void} [emit] */
export async function runProbe(config, emit = () => {}) {
  if (config.url !== project) throw Error("Wrong probe project URL");
  const built = await buildWorker();
  let expired = false;
  const timeout = setTimeout(() => { expired = true; stopOwned(); }, 180_000);
  const results = [];
  const failures = [];
  try {
    const step = async (role, index = 0, boundary = false) => {
      if (expired) throw Error("Probe run time limit");
      const result = await worker(built.entry, { ...config, role, index }, boundary);
      emit(result); return result;
    };
    if (config.cleanup) return { sourceHash: built.sourceHash, cleanup: await step("cleanup") };
    await step("inspect");
    for (let index = 0; index < 8; index++) {
      try {
        const writer = await step("writer", index, index < 6);
        const reader = index < 6 ? await step("reader", index) : null;
        if (reader && writer.boardHash !== reader.boardHash) throw Error("Recovered drawing differs from the confirmed prefix");
        const verified = await step("verify", index);
        if (writer.pid === reader?.pid || writer.pid === verified.pid || reader?.pid === verified.pid) throw Error("Process boundary missing");
        results.push({ writer, reader, verified });
      } catch (error) {
        const failure = { index, error: error.message };
        failures.push(failure); emit({ failure });
        if (expired) break;
      }
    }
    if (failures.length) throw Object.assign(Error(`Probe failed ${failures.length} cases; activation remains blocked`), { failures, results, sourceHash: built.sourceHash });
    return { sourceHash: built.sourceHash, sourceFiles: built.files.length, rows: results.length, results };
  } finally { clearTimeout(timeout); stopOwned(); await rm(built.directory, { recursive: true, force: true }); }
}

async function main() {
  const args = process.argv.slice(2);
  if (!args.length || args.length === 1 && args[0] === "--help") {
    console.log("Dry run: no request or credential read. Lead only: --run-hosted --source=<full clean HEAD SHA> [--cleanup]. Uses SUPABASE_URL and SUPABASE_SECRET_KEY or SUPABASE_SECRET_KEY_FILE. Fixed probe IDs only. 8 rows maximum; 180 seconds maximum. No production admission RPC or browser proof.");
    return;
  }
  if (args.some(a => a !== "--run-hosted" && a !== "--cleanup" && !/^--source=[a-f0-9]{40}$/.test(a)) || !args.includes("--run-hosted") || args.filter(a => a.startsWith("--source=")).length !== 1) throw Error("Use --run-hosted --source=<full clean HEAD SHA> [--cleanup]");
  const source = args.find(a => a.startsWith("--source=")).slice(9);
  const actual = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const dirty = execFileSync("git", ["status", "--porcelain", "--untracked-files=normal"], { cwd: root, encoding: "utf8" }).trim();
  if (source !== actual || dirty) throw Error("Probe source must match a clean, pinned checkout");
  if (process.env.SUPABASE_URL !== project) throw Error("Set the exact reviewed project URL");
  // Existing secure key/file seam. Nothing reads .env, a keychain or a provider credential.
  const key = process.env.SUPABASE_SECRET_KEY_FILE
    ? (await readFile(process.env.SUPABASE_SECRET_KEY_FILE, "utf8")).trim()
    : process.env.SUPABASE_SECRET_KEY?.trim();
  if (!key) throw Error("Supply the service key through SUPABASE_SECRET_KEY or SUPABASE_SECRET_KEY_FILE");
  const result = await runProbe({ url: project, key, cleanup: args.includes("--cleanup") }, r => console.log(JSON.stringify(r)));
  console.log(JSON.stringify({ proof: "mapped synthetic table only", source, sourceHash: result.sourceHash, sourceFiles: result.sourceFiles, rows: result.rows, cleaned: result.cleanup?.rows }));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => { console.error("Probe stopped. Check the reviewed flags, clean source pin, secure key seam and probe table. No secret or raw response is logged."); process.exitCode = 2; });
}
