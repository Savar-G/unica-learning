import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { AiJsonRequest } from "@/lib/ai-client";
import { CODEX_SUBSCRIPTION_MODEL, codexCliClient, codexCliPreflight } from "@/lib/ai-codex-cli";
import { fallbackAiClient, newGate, type AiCallRecord } from "@/lib/ai-fallback";
import type { Spawner, SpawnResult } from "@/lib/ai-claude-cli";
import { sampleAiCache } from "../../scripts/workbook-sample-cache";

const request: AiJsonRequest = {
  name: "sample", system: "Write a sample.", content: [{ type: "text", text: "Two counters." }],
  schema: { type: "object", properties: { text: { type: "string" } }, required: ["text"], additionalProperties: false },
};
const signal = () => new AbortController().signal;
const completed = { code: 0, stdout: '{"type":"turn.completed"}\n', stderr: "" };
function seam(run: Partial<SpawnResult> = {}, text = '{"text":"Two counters."}') {
  return vi.fn<Spawner>(async (_command, args) => {
    await writeFile(args[args.indexOf("--output-last-message") + 1], text);
    return { ...completed, ...run };
  });
}
const make = (spawn: Spawner) => codexCliClient({ configDir: "/accounts/unify", spawn });

describe("Codex sample subscription", () => {
  it("uses only the selected subscription and returns its JSON in concurrent requests", async () => {
    const folders: string[] = [];
    const spawn: Spawner = async (command, args, options) => {
      expect(command).toBe("codex");
      expect(options.env).toEqual({ PATH: "/bin", HOME: "/home/user", CODEX_HOME: "/accounts/unify" });
      expect(args).toContain('forced_login_method="chatgpt"');
      expect(args).toContain('model_reasoning_effort="high"');
      expect(args).toContain("--ignore-user-config");
      expect(args).toContain("read-only");
      for (const feature of ["shell_tool", "apps", "plugins", "hooks", "multi_agent"]) {
        expect(args.some((a, i) => a === "--disable" && args[i + 1] === feature)).toBe(true);
      }
      expect(JSON.parse(await readFile(args[args.indexOf("--output-schema") + 1], "utf8"))).toEqual(request.schema);
      expect(options.input).toContain(request.system);
      expect(options.input).toContain("Two counters.");
      folders.push(options.cwd);
      await writeFile(args[args.indexOf("--output-last-message") + 1], '{"text":"Two counters."}');
      return completed;
    };
    const client = codexCliClient({ configDir: "/accounts/unify", spawn, env: {
      PATH: "/bin", HOME: "/home/user", CODEX_HOME: "/wrong-account", OPENAI_API_KEY: "secret", OPENROUTER_API_KEY: "secret", SUPABASE_SECRET_KEY: "secret",
    } });
    expect(client.model).toBe(CODEX_SUBSCRIPTION_MODEL);
    expect(await Promise.all([client.json(request, signal()), client.json(request, signal())])).toEqual([{ text: "Two counters." }, { text: "Two counters." }]);
    expect(new Set(folders).size).toBe(2);
    for (const folder of folders) await expect(access(folder)).rejects.toThrow();
  });

  it.each([
    { code: 1, stderr: "usage limit reached" }, { code: 1, stderr: "401 authentication failed" },
    { code: null, error: { code: "ENOENT", message: "missing" } }, { code: 1 }, { timedOut: true },
    { stdout: '{"type":"turn.failed"}\n' }, { stdout: "" }, { stdout: "not JSON" },
    { stdout: '{"type":"error"}\n{"type":"turn.completed"}\n' },
    { stdout: '{"type":"item.completed","item":{"type":"command_execution"}}\n{"type":"turn.completed"}\n' },
  ])("rejects failed, missing, late, or tool-using output: %j", async run => {
    await expect(make(seam(run)).json(request, signal())).rejects.toThrow();
  });

  it("rejects invalid result JSON and removes its temporary files", async () => {
    const spawn = seam({}, "not JSON");
    await expect(make(spawn).json(request, signal())).rejects.toThrow();
    await expect(access(spawn.mock.calls[0][2].cwd)).rejects.toThrow();
  });

  it("does not start for images, an aborted request, or an unspecified account", async () => {
    const spawn = seam();
    await expect(make(spawn).json({ ...request, content: [{ type: "image", mediaType: "image/png", data: new Uint8Array() }] }, signal())).rejects.toThrow("text only");
    await expect(make(spawn).json(request, AbortSignal.abort())).rejects.toThrow();
    expect(() => codexCliClient({ configDir: "", spawn })).toThrow();
    expect(spawn).not.toHaveBeenCalled();
  });

  it("shares a usage-limit stop between writing and solving without any API fallback", async () => {
    const spawn = seam({ code: 1, stderr: "usage limit reached" });
    const gate = newGate(), cli = make(spawn);
    const client = () => fallbackAiClient({ primary: "subscription", subscription: cli, api: null, model: cli.model, gate });
    await expect(client().json(request, signal())).rejects.toThrow();
    await expect(client().json(request, signal())).rejects.toThrow();
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  it("does not report or cache an answer cancelled during the result-file read", async () => {
    const dir = await mkdtemp(join(tmpdir(), "unica-codex-cache-test-"));
    const file = join(dir, "sample-ai-cache.jsonl");
    const controller = new AbortController();
    const records: AiCallRecord[] = [];
    let resultDir = "";
    const spawn: Spawner = async (_command, args, options) => {
      resultDir = options.cwd;
      await writeFile(args[args.indexOf("--output-last-message") + 1], JSON.stringify({ text: "x".repeat(1024 * 1024) }));
      setImmediate(() => controller.abort());
      return completed;
    };
    try {
      const cache = await sampleAiCache(file);
      const cli = make(spawn);
      const client = cache.client(fallbackAiClient({
        primary: "subscription", subscription: cli, api: null, model: cli.model,
        onCall: record => { records.push(record); },
      }));
      await expect(client.json(request, controller.signal)).rejects.toThrow();
      expect(controller.signal.aborted).toBe(true);
      expect(records.some(record => record.outcome === "answered")).toBe(false);
      expect(await readFile(file, "utf8")).toBe("");
      await expect(access(resultDir)).rejects.toThrow();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});


describe("Codex local availability check", () => {
  const help = "--ignore-user-config --ephemeral --skip-git-repo-check --sandbox --model --config --disable --json --output-schema --output-last-message";
  const auth = { auth_mode: "chatgpt", tokens: { access_token: "synthetic-token" } };

  async function account(run: (home: string) => Promise<void>, contents: unknown = auth) {
    const home = await mkdtemp(join(tmpdir(), "unica-codex-account-test-"));
    try {
      if (contents !== undefined) await writeFile(join(home, "auth.json"), typeof contents === "string" ? contents : JSON.stringify(contents));
      await run(home);
    } finally { await rm(home, { recursive: true, force: true }); }
  }

  it("checks CLI options and ChatGPT login in the explicit home without a model request", async () => {
    await account(async home => {
      const folders: string[] = [];
      const spawn = vi.fn<Spawner>(async (command, args, options) => {
        expect(command).toBe("codex");
        expect(options.env).toEqual({ CODEX_HOME: home, PATH: "/bin" });
        expect(options.input).toBe("");
        folders.push(options.cwd);
        return { code: 0, stdout: args[0] === "exec" ? help : "", stderr: args[0] === "login" ? "Logged in using ChatGPT" : "" };
      });
      await codexCliPreflight({ configDir: home, spawn, env: { PATH: "/bin", CODEX_HOME: "/wrong", OPENAI_API_KEY: "secret", OPENROUTER_API_KEY: "secret" } });
      expect(spawn.mock.calls.map(c => c[1])).toEqual([["exec", "--help"], ["login", "status"]]);
      for (const folder of folders) await expect(access(folder)).rejects.toThrow();
    });
  });

  it.each([null, "not JSON", { auth_mode: "apikey", OPENAI_API_KEY: "synthetic" }, { auth_mode: "chatgpt" }])("refuses missing, malformed or non-ChatGPT credentials before spawning: %j", async contents => {
    await account(async home => {
      const spawn = vi.fn<Spawner>();
      if (contents === null) await rm(join(home, "auth.json"));
      await expect(codexCliPreflight({ configDir: home, spawn })).rejects.toThrow(/stored ChatGPT login/);
      expect(spawn).not.toHaveBeenCalled();
    }, contents);
  });

  it.each([
    { code: null, error: { code: "ENOENT", message: "missing" } },
    { code: 1 }, { timedOut: true }, { stdout: help.replace("--ignore-user-config", "") },
    { stdout: help.replace("--output-schema", "") },
  ])("fails closed on an unavailable or incompatible CLI: %j", async failure => {
    await account(async home => {
      const spawn = vi.fn<Spawner>(async () => ({ code: 0, stdout: help, stderr: "", ...failure }));
      await expect(codexCliPreflight({ configDir: home, spawn })).rejects.toThrow(/Codex/);
      expect(spawn).toHaveBeenCalledTimes(1);
      await expect(access(spawn.mock.calls[0][2].cwd)).rejects.toThrow();
    });
  });

  it("rejects an API-key login and preserves cancellation", async () => {
    await account(async home => {
      const controller = new AbortController();
      const spawn: Spawner = async (_command, args) => ({ code: 0, stdout: args[0] === "exec" ? help : "Logged in using an API key", stderr: "" });
      await expect(codexCliPreflight({ configDir: home, spawn })).rejects.toThrow(/ChatGPT login/);
      const cancelled = vi.fn<Spawner>(async () => {
        controller.abort();
        return { code: 0, stdout: help, stderr: "" };
      });
      await expect(codexCliPreflight({ configDir: home, spawn: cancelled, signal: controller.signal })).rejects.toThrow();
      expect(cancelled).toHaveBeenCalledTimes(1);
    });
  });
});
