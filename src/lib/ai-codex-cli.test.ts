import { access, readFile, writeFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import type { AiJsonRequest } from "@/lib/ai-client";
import { codexCliClient } from "@/lib/ai-codex-cli";
import { fallbackAiClient, newGate } from "@/lib/ai-fallback";
import type { Spawner, SpawnResult } from "@/lib/ai-claude-cli";

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
    expect(client.model).toBe("gpt-6.1-sol");
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
});
