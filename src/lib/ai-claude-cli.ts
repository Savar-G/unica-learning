// The Claude subscription adapter of the AI client (2026-11-01): each request is one headless Claude Code call
// (`claude -p`), on Savar's Claude subscription, at no cost per call. For local tools only (the Maya practice suite,
// `npm run maya:practice -- --subscription`). The live site stays on OpenRouter (src/lib/ai-client.ts).
//
// As close to the live call as Claude Code allows:
// - `--system-prompt` replaces Claude Code's own system prompt with the request's instructions;
// - `--json-schema` asks for the request's schema (Claude Code checks it through its structured-output step, not the
//   API's constrained decoding, so the connection is not the live one: see docs/maya-practice.md);
// - `--tools ""` and `--safe-mode`: no tools, hooks, MCP servers, skills or CLAUDE.md files;
// - the call runs in an empty folder, with no session saved.
// ANTHROPIC_API_KEY and ANTHROPIC_AUTH_TOKEN are removed from the call's environment, so it can never bill the API.
// When the subscription's usage limit is met, the client throws UsageLimitReached and calls `onLimit`; it never sends the
// request anywhere else. Text input only: an image part is refused.
// The process runs behind a seam (`spawn`), so the tests never start the real CLI.
import { spawn as nodeSpawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AiClient, AiJsonRequest } from "@/lib/ai-client";

/** What one `claude -p` process gave back. */
export interface ClaudeRun {
  stdout: string;
  stderr: string;
  /** The exit code, or null when the process was killed. */
  status: number | null;
  /** Set when the process could not start (ENOENT: no `claude` on PATH) or was killed at its time limit. */
  error?: { code?: string; message: string };
}

/** Starts `claude` with these arguments, writes `input` to its stdin and waits for it to end. */
export type ClaudeSpawn = (args: string[], options: { input: string; env: Record<string, string | undefined>; cwd: string; timeoutMs: number; signal: AbortSignal }) => Promise<ClaudeRun>;

/** The subscription's usage limit is met: the run stops, and nothing is sent to the paid API instead. */
export class UsageLimitReached extends Error {
  constructor(readonly detail: string) {
    super(`the Claude subscription's usage limit is reached: ${detail}`);
  }
}

const short = (s: unknown, n = 300) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

/** Claude Code's words for a met usage limit ("Claude AI usage limit reached", "You've hit your limit · resets 3pm"). */
const LIMIT_TEXT = /usage limit|hit your (usage |session |weekly )?limit|limit reached|limit will reset|out of (extra )?usage|rate[_ ]limit/i;

/** The environment for `claude -p`: never an API key, so the call runs on the Claude subscription. Exported for tests. */
export function claudeEnv(env: Record<string, string | undefined>, configDir?: string | null): Record<string, string | undefined> {
  const out = { ...env };
  delete out.ANTHROPIC_API_KEY;
  delete out.ANTHROPIC_AUTH_TOKEN;
  // No update checks or other side traffic: a call starts in about 3 s instead of about 8 s (measured 2026-11-01).
  out.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = "1";
  if (configDir) out.CLAUDE_CONFIG_DIR = configDir;
  return out;
}

/** The real process: node's spawn, killed at its time limit or when the signal aborts. */
export const spawnClaude: ClaudeSpawn = (args, { input, env, cwd, timeoutMs, signal }) =>
  new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let error: ClaudeRun["error"];
    const child = nodeSpawn("claude", args, { env: env as NodeJS.ProcessEnv, cwd, stdio: ["pipe", "pipe", "pipe"] });
    const kill = (why: { code: string; message: string }) => {
      error ??= why;
      child.kill("SIGTERM");
    };
    const timer = setTimeout(() => kill({ code: "ETIMEDOUT", message: `no answer in ${Math.round(timeoutMs / 1000)} s` }), timeoutMs);
    const onAbort = () => kill({ code: "ABORT_ERR", message: "aborted" });
    signal.addEventListener("abort", onAbort, { once: true });
    child.stdout.on("data", (d: Buffer) => (stdout += d.toString("utf8")));
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString("utf8")));
    child.on("error", (e: NodeJS.ErrnoException) => (error ??= { code: e.code, message: e.message }));
    child.on("close", (status) => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      resolve({ stdout, stderr, status, error });
    });
    child.stdin.on("error", () => {});
    child.stdin.end(input);
  });

/** The arguments for one request. */
export function claudeArgs(model: string, request: AiJsonRequest): string[] {
  return [
    "-p", "--output-format", "json", "--safe-mode", "--tools", "", "--no-session-persistence",
    "--model", model, ...(request.effort ? ["--effort", request.effort] : []),
    "--system-prompt", request.system, "--json-schema", JSON.stringify(request.schema),
  ];
}

/** The JSON object in the text: the text itself, else its first "{" to its last "}". */
function jsonIn(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error(`the output is not JSON: ${JSON.stringify(short(text))}`);
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch (e) {
      throw new Error(`the output is not valid JSON (${short(e instanceof Error ? e.message : e, 160)}): ${JSON.stringify(short(text))}`);
    }
  }
}

export function claudeCliClient({
  model,
  spawn = spawnClaude,
  env = process.env,
  configDir = null,
  cwd,
  timeoutMs = 300_000,
  onLimit,
}: {
  /** The Claude model id, such as claude-sonnet-5-5. */
  model: string;
  /** For tests: the process seam. */
  spawn?: ClaudeSpawn;
  env?: Record<string, string | undefined>;
  /** CLAUDE_CONFIG_DIR for the call (MAYA_CLAUDE_CONFIG_DIR): another Claude Code login. */
  configDir?: string | null;
  /** The folder the call runs in; default an empty folder in the temp folder. */
  cwd?: string;
  /** The time limit of one call. */
  timeoutMs?: number;
  /** Called once per call that met the usage limit, before UsageLimitReached is thrown. */
  onLimit?: (detail: string) => void;
}): AiClient {
  const callEnv = claudeEnv(env, configDir);
  let folder = cwd;
  const limit = (detail: string): never => {
    onLimit?.(detail);
    throw new UsageLimitReached(detail);
  };
  return {
    model,
    async json(request: AiJsonRequest, signal: AbortSignal) {
      if (request.content.some((p) => p.type !== "text")) throw new Error("claude -p takes text only: this request has an image");
      if (signal.aborted) throw new Error("time is up");
      if (!folder) {
        folder = join(tmpdir(), "unica-claude-cli");
        mkdirSync(folder, { recursive: true });
      }
      const input = request.content.map((p) => (p.type === "text" ? p.text : "")).join("\n\n");
      const run = await spawn(claudeArgs(model, request), { input, env: callEnv, cwd: folder, timeoutMs, signal });
      if (run.error?.code === "ENOENT") throw new Error("claude did not run: is Claude Code installed and on PATH?");
      if (run.error?.code === "ETIMEDOUT" || run.error?.code === "ABORT_ERR" || signal.aborted) throw new Error("time is up");
      const out = run.stdout.trim();
      let envelope: Record<string, unknown>;
      try {
        envelope = JSON.parse(out) as Record<string, unknown>;
      } catch {
        const said = `${out} ${run.stderr}`;
        if (LIMIT_TEXT.test(said)) limit(short(said));
        if (run.error) throw new Error(`claude did not run: ${short(run.error.message)}`);
        throw new Error(out ? `claude -p output was not JSON: ${short(out)}` : `claude -p returned no output (exit ${run.status}): ${short(run.stderr)}`);
      }
      const result = String(envelope.result ?? "");
      if (envelope.is_error === true || envelope.subtype !== "success") {
        const status = envelope.api_error_status;
        const detail = short(`${result} ${String(envelope.api_error ?? "")}`) || String(envelope.subtype ?? "error");
        if (status === 429 || LIMIT_TEXT.test(`${result} ${String(envelope.api_error ?? "")} ${run.stderr}`)) limit(detail);
        throw new Error(`claude -p failed${status ? ` (${String(status)})` : ""}: ${detail}`);
      }
      if (envelope.structured_output !== undefined && envelope.structured_output !== null) return envelope.structured_output;
      if (!result.trim()) throw new Error("no output");
      return jsonIn(result);
    },
  };
}
