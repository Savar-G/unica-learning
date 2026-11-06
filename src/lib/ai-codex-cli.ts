// Local workbook samples only. Uses the selected ChatGPT subscription through Codex CLI.
// No API keys, service tools, project instructions, hooks, or saved conversations.
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import type { AiClient } from "@/lib/ai-client";
import { nodeSpawn, SubscriptionUnavailable, type Spawner } from "@/lib/ai-claude-cli";

export const CODEX_SAMPLE_MODEL = "gpt-6.1-sol";

/** A text-only, schema-constrained request on an explicitly selected subscription. */
export function codexCliClient({
  configDir, env = process.env, spawn = nodeSpawn, timeout = 300_000,
}: {
  configDir: string;
  env?: Record<string, string | undefined>;
  spawn?: Spawner;
  timeout?: number;
}): AiClient {
  if (!isAbsolute(configDir)) throw new Error("WORKBOOK_CODEX_HOME must be an absolute Codex account directory");
  const childEnv: Record<string, string> = { CODEX_HOME: configDir };
  for (const k of ["PATH", "HOME", "USER", "LOGNAME", "TMPDIR", "LANG", "LC_ALL", "LC_CTYPE"]) {
    if (env[k]) childEnv[k] = env[k]!;
  }
  return {
    model: CODEX_SAMPLE_MODEL,
    async json(request, signal) {
      if (signal.aborted) throw new Error("time is up");
      if (request.content.some(p => p.type !== "text")) throw new Error("Codex workbook samples accept text only");
      const dir = await mkdtemp(join(tmpdir(), "unica-codex-sample-"));
      let response: unknown;
      try {
        const schema = join(dir, "schema.json"), result = join(dir, "result.json");
        await writeFile(schema, JSON.stringify(request.schema));
        if (signal.aborted) throw new Error("time is up");
        const args = [
          "exec", "--ignore-user-config", "--ephemeral", "--skip-git-repo-check", "--sandbox", "read-only",
          "--model", CODEX_SAMPLE_MODEL, "-c", 'model_reasoning_effort="high"',
          "-c", "project_doc_max_bytes=0", "-c", 'web_search="disabled"', "-c", 'forced_login_method="chatgpt"',
          ...["shell_tool", "apps", "plugins", "hooks", "multi_agent"].flatMap(f => ["--disable", f]),
          "--json", "--output-schema", schema, "--output-last-message", result, "-",
        ];
        const input = `${request.system}\n\nReturn only the requested JSON. Do not use tools.\n\n${request.content.map(p => p.type === "text" ? p.text : "").join("\n\n")}`;
        const run = await spawn("codex", args, { input, env: childEnv, cwd: dir, timeoutMs: timeout, signal });
        if (signal.aborted || run.timedOut) throw new Error("Codex sample request did not answer in time");
        if (run.error?.code === "ENOENT") throw new SubscriptionUnavailable("missing", "Codex CLI is not installed");
        const words = `${run.stderr}\n${run.stdout}`;
        if (run.code !== 0 || run.error) {
          if (/usage limit|rate.?limit|limit reached|exceeded.*limit|too many requests/i.test(words)) {
            throw new SubscriptionUnavailable("limit", "The selected Codex subscription reached its usage limit");
          }
          if (/not logged in|unauthori[sz]ed|authentication|log in|login|401|403/i.test(words)) {
            throw new SubscriptionUnavailable("logged-out", "The selected Codex subscription needs a ChatGPT login");
          }
          throw new Error(`Codex sample request failed (exit ${run.code ?? "by signal"})`);
        }
        const events = run.stdout.trim().split("\n").filter(Boolean).map(line => JSON.parse(line) as { type: string; item?: { type: string } });
        if (!events.some(e => e.type === "turn.completed") || events.some(e => e.type === "error" || e.type === "turn.failed")) {
          throw new Error("Codex sample request did not complete");
        }
        if (events.some(e => e.item && !["agent_message", "reasoning"].includes(e.item.type))) {
          throw new Error("Codex sample request attempted to use a tool");
        }
        const text = await readFile(result, { encoding: "utf8", signal });
        signal.throwIfAborted();
        response = JSON.parse(text) as unknown;
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
      signal.throwIfAborted();
      return response;
    },
  };
}
