// The Claude subscription adapter of the AI client (D-200): `claude -p` (Claude Code in print mode) on Savar's Claude
// subscription, for workbook generation on his Mac (the workbook worker and the sample script). Server-side Node only:
// it starts a process, so it never runs in the browser, and it never runs on Vercel (there is no `claude` there).
// One process per request: the instructions go in --system-prompt, the text parts on stdin, the JSON Schema in
// --json-schema (Claude Code checks the output against it and answers it as `structured_output` in the JSON envelope of
// --output-format json). --safe-mode leaves out CLAUDE.md files, hooks, skills, plugins and MCP servers; --tools ""
// leaves Claude nothing to run; --no-session-persistence keeps no transcript.
// Never an API key: the child process gets only a short list of environment variables (no ANTHROPIC_API_KEY, no
// OpenRouter or Supabase key), so `claude` uses its own login. `configDir` (WORKBOOK_CLAUDE_CONFIG_DIR) is passed as
// CLAUDE_CONFIG_DIR to pick which Claude account runs it; none: the normal ~/.claude login.
// Images: `claude -p` reads only text on stdin, so a request with an image part is refused before any process starts
// (SubscriptionUnavailable "images"): the fallback client (src/lib/ai-fallback.ts) sends it to the API. The workbook
// generator and the solve check send text only today.
// Failures: SubscriptionUnavailable when the subscription cannot take the call (a usage limit, no `claude` on PATH, not
// logged in, or a crash): the fallback client then asks the API. Any other failure (the output does not match the
// schema, a refusal, the time limit) is an ordinary error: the caller's own retry and checks handle it, as with OpenRouter.
// The process seam (`spawn`) is passed in, so tests never start the real CLI.
import { spawn as nodeSpawnProcess } from "node:child_process";
import { tmpdir } from "node:os";
import type { AiClient, AiJsonRequest } from "@/lib/ai-client";

/** The page writer's model on the subscription: Claude Sonnet 5.5, the model of the API path (AI_MODEL's default). */
export const CLAUDE_CLI_DEFAULT_MODEL = "claude-sonnet-5-5";
/** The solve check's model on the subscription: Claude Haiku 5.5, as AI_SOLVE_MODEL's default on the API path. */
export const CLAUDE_CLI_SOLVE_DEFAULT_MODEL = "claude-haiku-5-5";
/** One `claude -p` call stops after this long: the process start adds a few seconds to the model's own time. */
export const CLAUDE_CLI_TIMEOUT_MS = 300_000;

/** Why the subscription could not take a call. "limit", "missing" and "logged-out" last for the rest of a run. */
export type UnavailableReason = "limit" | "missing" | "logged-out" | "crash" | "images";

/** The subscription could not take the call: the fallback client asks the API instead. */
export class SubscriptionUnavailable extends Error {
  constructor(readonly reason: UnavailableReason, message: string) {
    super(message);
  }
  /** True when the reason will not go away during a run: the run stays on the API. */
  get lasting(): boolean {
    return this.reason === "limit" || this.reason === "missing" || this.reason === "logged-out";
  }
}

export interface SpawnResult {
  /** The exit code; null when the process was stopped by a signal. */
  code: number | null;
  stdout: string;
  stderr: string;
  /** The process did not start (ENOENT: no such command). */
  error?: { code?: string; message: string };
  /** The time limit stopped it. */
  timedOut?: boolean;
}

/** Starts a process, writes `input` to its stdin and collects its output. Stops it on `signal` or after `timeoutMs`. */
export type Spawner = (command: string, args: string[], o: { input: string; env: Record<string, string>; cwd: string; timeoutMs: number; signal: AbortSignal }) => Promise<SpawnResult>;

/** The most output kept from a process: a workbook page call answers well under 1 MB. */
const MAX_OUTPUT = 32 * 1024 * 1024;

/** The live process seam: node:child_process spawn. */
export const nodeSpawn: Spawner = (command, args, o) => new Promise((resolve) => {
  let stdout = "";
  let stderr = "";
  let timedOut = false;
  let done = false;
  const child = nodeSpawnProcess(command, args, { env: o.env as NodeJS.ProcessEnv, cwd: o.cwd, stdio: ["pipe", "pipe", "pipe"] });
  const stop = () => {
    if (!child.killed) child.kill("SIGTERM");
    setTimeout(() => { if (child.exitCode === null) child.kill("SIGKILL"); }, 5_000).unref();
  };
  const timer = setTimeout(() => { timedOut = true; stop(); }, o.timeoutMs);
  const onAbort = () => stop();
  o.signal.addEventListener("abort", onAbort, { once: true });
  const finish = (r: SpawnResult) => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    o.signal.removeEventListener("abort", onAbort);
    resolve(r);
  };
  child.stdout.setEncoding("utf8").on("data", (d: string) => { if (stdout.length < MAX_OUTPUT) stdout += d; });
  child.stderr.setEncoding("utf8").on("data", (d: string) => { if (stderr.length < MAX_OUTPUT) stderr += d; });
  child.on("error", (e: NodeJS.ErrnoException) => finish({ code: null, stdout, stderr, error: { code: e.code, message: e.message }, timedOut }));
  child.on("close", (code) => finish({ code, stdout, stderr, timedOut }));
  // A process that exits before it reads its input closes stdin early: that is its exit's error, not this one.
  child.stdin.on("error", () => undefined);
  child.stdin.end(o.input);
  if (o.signal.aborted) stop();
});

/** The environment variables `claude` gets: enough to find its login and run, and no key of any kind. */
const PASSED_ENV = ["PATH", "HOME", "USER", "LOGNAME", "SHELL", "TMPDIR", "LANG", "LC_ALL", "LC_CTYPE", "TERM", "CLAUDE_CODE_OAUTH_TOKEN"];

/** The child process environment: the short list above, plus CLAUDE_CONFIG_DIR when a config folder is given. */
export function claudeCliEnv(env: Record<string, string | undefined>, configDir?: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of PASSED_ENV) if (env[k]) out[k] = env[k]!;
  if (configDir?.trim()) out.CLAUDE_CONFIG_DIR = configDir.trim();
  return out;
}

/** The envelope of `claude -p --output-format json`, the fields this adapter reads. */
interface Envelope {
  type?: string;
  subtype?: string;
  is_error?: boolean;
  api_error_status?: number | null;
  stop_reason?: string | null;
  result?: unknown;
  errors?: string[];
  startup_failure_reason?: string;
  structured_output?: unknown;
}

const short = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, 200);

const LIMIT = /usage limit|limit reached|hit your (usage )?limit|reached your (usage )?limit|out of (extra )?usage|weekly limit|session limit|rate.?limit|too many requests/i;
const LOGGED_OUT = /not logged in|please run \/login|\/login|log ?in again|invalid api key|authentication|unauthori[sz]ed|oauth token|credentials/i;

/** What a failed call's words and status say: a usage limit, a lost login, or neither (null). */
function unavailable(text: string, status: number | null | undefined): SubscriptionUnavailable | null {
  if (status === 429 || LIMIT.test(text)) return new SubscriptionUnavailable("limit", `the Claude subscription hit its usage limit: ${short(text)}`);
  if (status === 401 || status === 403 || LOGGED_OUT.test(text)) return new SubscriptionUnavailable("logged-out", `claude is not logged in: ${short(text)}`);
  return null;
}

/** The JSON output of a successful envelope: structured_output, else the result text parsed. */
function output(envelope: Envelope): unknown {
  if (envelope.structured_output !== undefined && envelope.structured_output !== null) return envelope.structured_output;
  const text = typeof envelope.result === "string" ? envelope.result.trim() : "";
  if (!text) throw new Error("no output");
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("the output is not valid JSON");
  }
}

/** The arguments of one call. */
function cliArgs(model: string, request: AiJsonRequest): string[] {
  return [
    "-p", "--output-format", "json", "--safe-mode", "--tools", "", "--no-session-persistence",
    "--model", model, "--system-prompt", request.system, "--json-schema", JSON.stringify(request.schema),
    ...(request.effort && request.effort !== "none" && request.effort !== "minimal" ? ["--effort", request.effort] : []),
  ];
}

export function claudeCliClient({
  model = CLAUDE_CLI_DEFAULT_MODEL,
  command = "claude",
  spawn = nodeSpawn,
  env = process.env,
  configDir,
  timeout = CLAUDE_CLI_TIMEOUT_MS,
}: {
  model?: string;
  /** The `claude` command: a name on PATH or a full path. */
  command?: string;
  /** For tests: the process seam. */
  spawn?: Spawner;
  /** Where PATH and HOME come from; only the short list is passed on. */
  env?: Record<string, string | undefined>;
  /** CLAUDE_CONFIG_DIR for the child: which Claude login runs it. */
  configDir?: string | null;
  timeout?: number;
} = {}): AiClient {
  const childEnv = claudeCliEnv(env, configDir);
  return {
    model,
    async json(request, signal) {
      if (request.content.some((p) => p.type !== "text")) throw new SubscriptionUnavailable("images", "claude -p takes text only; this request has an image");
      if (signal.aborted) throw new Error("time is up");
      const input = request.content.map((p) => (p.type === "text" ? p.text : "")).join("\n\n");
      const run = await spawn(command, cliArgs(model, request), { input, env: childEnv, cwd: tmpdir(), timeoutMs: timeout, signal });
      if (signal.aborted) throw new Error("time is up");
      if (run.error) {
        if (run.error.code === "ENOENT") throw new SubscriptionUnavailable("missing", `claude is not installed or not on PATH (${short(run.error.message)})`);
        throw new SubscriptionUnavailable("crash", `claude did not start: ${short(run.error.message)}`);
      }
      if (run.timedOut) throw new Error(`claude -p did not answer in time (${timeout} ms)`);
      const out = run.stdout.trim();
      let envelope: Envelope | null = null;
      try {
        envelope = out ? (JSON.parse(out) as Envelope) : null;
      } catch {
        envelope = null;
      }
      if (!envelope || typeof envelope !== "object") {
        const words = `${run.stderr} ${out}`;
        throw unavailable(words, null) ?? new SubscriptionUnavailable("crash", `claude -p ${out ? "answered with something that is not JSON" : "returned no output"} (exit ${run.code ?? "by signal"}): ${short(words)}`);
      }
      if (envelope.is_error || (envelope.subtype && envelope.subtype !== "success")) {
        const words = [envelope.result, ...(Array.isArray(envelope.errors) ? envelope.errors : []), envelope.startup_failure_reason, run.stderr].join(" ");
        if (envelope.stop_reason === "refusal") throw new Error("the model refused");
        if (envelope.subtype === "error_max_structured_output_retries") throw new Error("the output did not match the schema");
        const lost = unavailable(words, envelope.api_error_status);
        if (lost) throw lost;
        if (envelope.subtype === "error_during_execution") throw new SubscriptionUnavailable("crash", `claude -p could not execute: ${short(words)}`);
        const status = envelope.api_error_status ?? 0;
        if (status >= 500) throw new SubscriptionUnavailable("crash", `the Claude service answered ${status}: ${short(envelope.result)}`);
        throw new Error(`claude -p failed (${short(envelope.subtype) || "error"}${status ? `, ${status}` : ""}): ${short(envelope.result)}`);
      }
      if (envelope.stop_reason === "refusal") throw new Error("the model refused");
      return output(envelope);
    },
  };
}
