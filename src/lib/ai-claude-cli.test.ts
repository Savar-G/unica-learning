import { describe, expect, it } from "vitest";
import type { AiJsonRequest } from "@/lib/ai-client";
import { claudeCliClient, UsageLimitReached, type ClaudeRun, type ClaudeSpawn } from "@/lib/ai-claude-cli";

const request: AiJsonRequest = {
  name: "maya_proposal",
  system: "You are Maya.",
  content: [{ type: "text", text: '{"turn":1}' }],
  schema: { type: "object", additionalProperties: false, required: ["say"], properties: { say: { type: "string" } } },
  effort: "low",
  maxTokens: 4_000,
};

const envelope = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({ type: "result", subtype: "success", is_error: false, api_error_status: null, result: '{"say":"Hi"}', structured_output: { say: "Hi" }, total_cost_usd: 0.01, ...extra });

function fake(reply: Partial<ClaudeRun> | (() => Partial<ClaudeRun>)) {
  const calls: { args: string[]; input: string; env: Record<string, string | undefined>; cwd: string; timeoutMs: number }[] = [];
  const spawn: ClaudeSpawn = async (args, o) => {
    calls.push({ args, input: o.input, env: o.env, cwd: o.cwd, timeoutMs: o.timeoutMs });
    const r = typeof reply === "function" ? reply() : reply;
    return { stdout: "", stderr: "", status: 0, ...r };
  };
  return { spawn, calls };
}

const signal = () => new AbortController().signal;
const arg = (args: string[], flag: string) => args[args.indexOf(flag) + 1];

describe("claudeCliClient", () => {
  it("sends the request as one claude -p call with Maya's system prompt, the schema and no tools", async () => {
    const { spawn, calls } = fake({ stdout: envelope() });
    const client = claudeCliClient({ model: "claude-sonnet-5-5", spawn, cwd: "/tmp/x", timeoutMs: 1234, env: { PATH: "/bin" } });
    expect(client.model).toBe("claude-sonnet-5-5");
    await expect(client.json(request, signal())).resolves.toEqual({ say: "Hi" });
    expect(calls).toHaveLength(1);
    const { args, input, cwd, timeoutMs } = calls[0];
    expect(args[0]).toBe("-p");
    expect(arg(args, "--output-format")).toBe("json");
    expect(arg(args, "--model")).toBe("claude-sonnet-5-5");
    expect(arg(args, "--system-prompt")).toBe("You are Maya.");
    expect(JSON.parse(arg(args, "--json-schema"))).toEqual(request.schema);
    expect(arg(args, "--tools")).toBe("");
    expect(arg(args, "--effort")).toBe("low");
    expect(args).toContain("--safe-mode");
    expect(args).toContain("--no-session-persistence");
    expect(input).toBe('{"turn":1}');
    expect(cwd).toBe("/tmp/x");
    expect(timeoutMs).toBe(1234);
  });

  it("removes the API key from the call's environment and passes MAYA_CLAUDE_CONFIG_DIR as CLAUDE_CONFIG_DIR", async () => {
    const { spawn, calls } = fake({ stdout: envelope() });
    await claudeCliClient({ model: "m", spawn, cwd: "/tmp/x", configDir: "/cfg", env: { PATH: "/bin", ANTHROPIC_API_KEY: "sk-ant-x", ANTHROPIC_AUTH_TOKEN: "t" } }).json(request, signal());
    expect(calls[0].env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(calls[0].env.ANTHROPIC_AUTH_TOKEN).toBeUndefined();
    expect(calls[0].env.CLAUDE_CONFIG_DIR).toBe("/cfg");
    expect(calls[0].env.PATH).toBe("/bin");
    expect(calls[0].env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC).toBe("1");
  });

  it("leaves out --effort when the request has none, and CLAUDE_CONFIG_DIR when none is given", async () => {
    const { spawn, calls } = fake({ stdout: envelope() });
    await claudeCliClient({ model: "m", spawn, cwd: "/tmp/x", env: {} }).json({ ...request, effort: undefined }, signal());
    expect(calls[0].args).not.toContain("--effort");
    expect(calls[0].env.CLAUDE_CONFIG_DIR).toBeUndefined();
  });

  it("reads the JSON from the result text when there is no structured output", async () => {
    const { spawn } = fake({ stdout: envelope({ structured_output: undefined, result: 'Here it is: {"say":"Yes"}' }) });
    await expect(claudeCliClient({ model: "m", spawn, cwd: "/tmp/x" }).json(request, signal())).resolves.toEqual({ say: "Yes" });
  });

  it("throws UsageLimitReached and calls onLimit when the usage limit is met", async () => {
    const limits: string[] = [];
    const { spawn } = fake({ stdout: envelope({ is_error: true, subtype: "success", result: "Claude AI usage limit reached|1762000000", structured_output: undefined }) });
    const client = claudeCliClient({ model: "m", spawn, cwd: "/tmp/x", onLimit: (d) => limits.push(d) });
    await expect(client.json(request, signal())).rejects.toBeInstanceOf(UsageLimitReached);
    expect(limits).toHaveLength(1);
    expect(limits[0]).toContain("usage limit");
  });

  it("treats a 429 and a limit message outside the JSON as the usage limit", async () => {
    const a = fake({ stdout: envelope({ is_error: true, api_error_status: 429, result: "Too many requests" }) });
    await expect(claudeCliClient({ model: "m", spawn: a.spawn, cwd: "/tmp/x" }).json(request, signal())).rejects.toBeInstanceOf(UsageLimitReached);
    const b = fake({ stdout: "You've hit your limit · resets 3pm", status: 1 });
    await expect(claudeCliClient({ model: "m", spawn: b.spawn, cwd: "/tmp/x" }).json(request, signal())).rejects.toBeInstanceOf(UsageLimitReached);
  });

  it("fails other errors as ordinary errors, not as the usage limit", async () => {
    const cases: Partial<ClaudeRun>[] = [
      { stdout: envelope({ is_error: true, subtype: "error_during_execution", result: "boom" }) },
      { stdout: "", stderr: "something broke", status: 1 },
      { stdout: "not json", status: 0 },
      { stdout: "", status: null, error: { code: "ENOENT", message: "spawn claude ENOENT" } },
    ];
    for (const reply of cases) {
      const { spawn } = fake(reply);
      const e = await claudeCliClient({ model: "m", spawn, cwd: "/tmp/x" }).json(request, signal()).catch((x: unknown) => x);
      expect(e).toBeInstanceOf(Error);
      expect(e).not.toBeInstanceOf(UsageLimitReached);
    }
  });

  it("says time is up when the call passes its time limit", async () => {
    const { spawn } = fake({ stdout: "", status: null, error: { code: "ETIMEDOUT", message: "no answer in 1 s" } });
    await expect(claudeCliClient({ model: "m", spawn, cwd: "/tmp/x" }).json(request, signal())).rejects.toThrow("time is up");
  });

  it("refuses an image part without starting a process", async () => {
    const { spawn, calls } = fake({ stdout: envelope() });
    const withImage: AiJsonRequest = { ...request, content: [...request.content, { type: "image", mediaType: "image/png", data: new Uint8Array([1]) }] };
    await expect(claudeCliClient({ model: "m", spawn, cwd: "/tmp/x" }).json(withImage, signal())).rejects.toThrow("text only");
    expect(calls).toHaveLength(0);
  });
});
