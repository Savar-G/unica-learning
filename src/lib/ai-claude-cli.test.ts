import { describe, expect, it } from "vitest";
import { claudeCliClient, claudeCliEnv, SubscriptionUnavailable, type SpawnResult, type Spawner } from "@/lib/ai-claude-cli";
import { fallbackAiClient, type AiCallRecord } from "@/lib/ai-fallback";
import { providerWords } from "@/lib/ai-provider-words";
import type { AiJsonRequest } from "@/lib/ai-client";

const request: AiJsonRequest = {
  name: "workbook_page", system: "Write the page.", content: [{ type: "text", text: "day 1" }, { type: "text", text: "page 3" }],
  schema: { type: "object", additionalProperties: false, properties: { items: { type: "array" } }, required: ["items"] }, effort: "low",
};

const envelope = (e: Record<string, unknown>) => JSON.stringify({ type: "result", subtype: "success", is_error: false, api_error_status: null, ...e });

function fakeSpawn(answer: (args: string[]) => Partial<SpawnResult>) {
  const calls: { command: string; args: string[]; input: string; env: Record<string, string>; timeoutMs: number }[] = [];
  const spawn: Spawner = async (command, args, o) => {
    calls.push({ command, args, input: o.input, env: o.env, timeoutMs: o.timeoutMs });
    return { code: 0, stdout: "", stderr: "", ...answer(args) };
  };
  return { spawn, calls };
}

const fail = async (p: Promise<unknown>) => p.then(() => { throw new Error("no error"); }, (e: unknown) => e as Error);
const signal = () => new AbortController().signal;

describe("claudeCliClient", () => {
  it("runs claude -p with the schema, the instructions and the text, and answers the structured output", async () => {
    const f = fakeSpawn(() => ({ stdout: envelope({ result: "{\"items\":[1]}", structured_output: { items: [1] } }) }));
    const ai = claudeCliClient({ model: "claude-sonnet-5-5", spawn: f.spawn, env: { PATH: "/bin", HOME: "/Users/s" } });
    expect(await ai.json(request, signal())).toEqual({ items: [1] });
    const { command, args, input } = f.calls[0];
    expect(command).toBe("claude");
    expect(args.slice(0, 7)).toEqual(["-p", "--output-format", "json", "--safe-mode", "--tools", "", "--no-session-persistence"]);
    expect(args[args.indexOf("--model") + 1]).toBe("claude-sonnet-5-5");
    expect(args[args.indexOf("--system-prompt") + 1]).toBe("Write the page.");
    expect(JSON.parse(args[args.indexOf("--json-schema") + 1])).toEqual(request.schema);
    expect(args[args.indexOf("--effort") + 1]).toBe("low");
    expect(input).toBe("day 1\n\npage 3");
  });

  it("never passes an API key, and passes CLAUDE_CONFIG_DIR when a config folder is given", async () => {
    const f = fakeSpawn(() => ({ stdout: envelope({ structured_output: { items: [] } }) }));
    const env = { PATH: "/bin", HOME: "/Users/s", ANTHROPIC_API_KEY: "sk-ant", OPENROUTER_API_KEY: "sk-or", SUPABASE_SECRET_KEY: "sb", ANTHROPIC_AUTH_TOKEN: "t" };
    await claudeCliClient({ spawn: f.spawn, env, configDir: "/Users/s/.claude-work", timeout: 1234 }).json(request, signal());
    expect(f.calls[0].env).toEqual({ PATH: "/bin", HOME: "/Users/s", CLAUDE_CONFIG_DIR: "/Users/s/.claude-work" });
    expect(f.calls[0].timeoutMs).toBe(1234);
    expect(claudeCliEnv(env)).toEqual({ PATH: "/bin", HOME: "/Users/s" });
  });

  it("parses the result text when there is no structured output, and refuses text that is not JSON", async () => {
    const ok = fakeSpawn(() => ({ stdout: envelope({ result: " {\"items\":[2]} " }) }));
    expect(await claudeCliClient({ spawn: ok.spawn }).json(request, signal())).toEqual({ items: [2] });
    const bad = fakeSpawn(() => ({ stdout: envelope({ result: "Here you go" }) }));
    const e = await fail(claudeCliClient({ spawn: bad.spawn }).json(request, signal()));
    expect(e).not.toBeInstanceOf(SubscriptionUnavailable);
    expect(e.message).toBe("the output is not valid JSON");
  });

  it("answers a usage limit, a missing CLI, a lost login and a crash as unavailable, with whether it lasts", async () => {
    const cases: [Partial<SpawnResult>, string, boolean][] = [
      [{ stdout: envelope({ is_error: true, subtype: "error", result: "Claude AI usage limit reached|1762020000" }) }, "limit", true],
      [{ stdout: envelope({ is_error: true, result: "You've hit your limit · resets 3pm" }) }, "limit", true],
      [{ stdout: envelope({ is_error: true, api_error_status: 429, result: "Too busy" }) }, "limit", true],
      [{ code: null, error: { code: "ENOENT", message: "spawn claude ENOENT" } }, "missing", true],
      [{ code: 1, stdout: envelope({ is_error: true, result: "Invalid API key · Please run /login" }) }, "logged-out", true],
      [{ code: 1, stderr: "Not logged in · Please run /login" }, "logged-out", true],
      [{ code: 134, stderr: "Segmentation fault" }, "crash", false],
      [{ code: 0, stdout: "not json" }, "crash", false],
      [{ stdout: envelope({ is_error: true, api_error_status: 529, result: "Overloaded" }) }, "crash", false],
    ];
    for (const [answer, reason, lasting] of cases) {
      const e = await fail(claudeCliClient({ spawn: fakeSpawn(() => answer).spawn }).json(request, signal()));
      expect(e, JSON.stringify(answer)).toBeInstanceOf(SubscriptionUnavailable);
      expect((e as SubscriptionUnavailable).reason).toBe(reason);
      expect((e as SubscriptionUnavailable).lasting).toBe(lasting);
    }
  });

  it("answers a schema miss, a refusal and the time limit as ordinary errors (the caller's retry handles them)", async () => {
    const cases: [Partial<SpawnResult>, string][] = [
      [{ stdout: envelope({ is_error: true, subtype: "error_max_structured_output_retries", result: "" }) }, "the output did not match the schema"],
      [{ stdout: envelope({ stop_reason: "refusal", result: "" }) }, "the model refused"],
      [{ code: null, timedOut: true }, "claude -p did not answer in time (300000 ms)"],
    ];
    for (const [answer, message] of cases) {
      const e = await fail(claudeCliClient({ spawn: fakeSpawn(() => answer).spawn }).json(request, signal()));
      expect(e).not.toBeInstanceOf(SubscriptionUnavailable);
      expect(e.message).toBe(message);
    }
  });

  it("refuses a request with an image before any process starts, so the fallback takes it", async () => {
    const f = fakeSpawn(() => ({ stdout: envelope({ structured_output: {} }) }));
    const e = await fail(claudeCliClient({ spawn: f.spawn }).json({ ...request, content: [{ type: "image", mediaType: "image/png", data: new Uint8Array([1]) }] }, signal()));
    expect((e as SubscriptionUnavailable).reason).toBe("images");
    expect((e as SubscriptionUnavailable).lasting).toBe(false);
    expect(f.calls).toHaveLength(0);
  });

  it("answers 'time is up' when the caller's signal stops the call", async () => {
    const c = new AbortController();
    const spawn: Spawner = async () => { c.abort(); return { code: null, stdout: "", stderr: "" }; };
    const e = await fail(claudeCliClient({ spawn }).json(request, c.signal));
    expect(e.message).toBe("time is up");
    expect(e).not.toBeInstanceOf(SubscriptionUnavailable);
  });
});


describe("R404-3 CLI error results", () => {
  it.each([
    ["error_during_execution", ["usage limit reached"], "limit"],
    ["error_during_execution", ["not logged in, please run /login"], "logged-out"],
    ["error_during_execution", ["execution worker crashed"], "crash"],
    ["error_during_execution", ["x".repeat(500), "usage limit reached"], "limit"],
  ])("falls back for %s with errors %j", async (subtype, errors, reason) => {
    const sub = claudeCliClient({ spawn: fakeSpawn(() => ({ code: 1, stdout: envelope({ subtype, is_error: true, errors }) })).spawn });
    const e = await fail(sub.json(request, signal()));
    expect(e).toBeInstanceOf(SubscriptionUnavailable);
    expect((e as SubscriptionUnavailable).reason).toBe(reason);
    let apiCalls = 0;
    const client = fallbackAiClient({ model: "m", primary: "subscription", subscription: sub, api: () => ({ model: "api", json: async () => { apiCalls++; return { items: [] }; } }) });
    expect(await client.json(request, signal())).toEqual({ items: [] });
    expect(apiCalls).toBe(1);
  });

  it.each([
    { subtype: "error_max_structured_output_retries", errors: ["schema mismatch"] },
    { subtype: "error_during_execution", stop_reason: "refusal", errors: ["refused"] },
  ])("keeps schema errors and refusals out of fallback: %j", async (error) => {
    const sub = claudeCliClient({ spawn: fakeSpawn(() => ({ code: 1, stdout: envelope({ ...error, is_error: true }) })).spawn });
    let calls = 0;
    const client = fallbackAiClient({ model: "m", primary: "subscription", subscription: sub, api: () => ({ model: "api", json: async () => { calls++; return {}; } }) });
    await expect(client.json(request, signal())).rejects.toThrow();
    expect(calls).toBe(0);
  });
});

// Codex P2 on #642: what claude -p printed can repeat the request, so it never reaches an error's message, the stored
// call note or the admin run page. The message names the kind and the status; the words stay in providerWords.
describe("the subscription's own words stay private", () => {
  const SENTINEL = "SENTINEL-the-child-wrote-12";
  const cases: [string, Partial<SpawnResult>][] = [
    ["a usage limit", { stdout: envelope({ is_error: true, result: `Claude AI usage limit reached ${SENTINEL}` }) }],
    ["a lost login", { code: 1, stderr: `Not logged in · Please run /login ${SENTINEL}` }],
    ["a missing CLI", { code: null, error: { code: "ENOENT", message: `spawn claude ENOENT ${SENTINEL}` } }],
    ["a process that did not start", { code: null, error: { code: "EACCES", message: `spawn EACCES ${SENTINEL}` } }],
    ["a crash", { code: 134, stderr: `Segmentation fault ${SENTINEL}` }],
    ["output that is not JSON", { code: 0, stdout: `not json ${SENTINEL}` }],
    ["a 5xx", { stdout: envelope({ is_error: true, api_error_status: 529, result: `Overloaded ${SENTINEL}` }) }],
    ["an execution error", { code: 1, stdout: envelope({ subtype: "error_during_execution", is_error: true, errors: [`worker crashed ${SENTINEL}`] }) }],
    ["another error", { stdout: envelope({ is_error: true, subtype: "error", api_error_status: 400, result: `bad request ${SENTINEL}` }) }],
  ];

  it.each(cases)("keeps the words of %s out of the message, in providerWords only", async (_, answer) => {
    const e = await fail(claudeCliClient({ spawn: fakeSpawn(() => answer).spawn }).json(request, signal()));
    expect(e.message).not.toContain(SENTINEL);
    expect(JSON.stringify(e)).not.toContain(SENTINEL);
    expect(providerWords(e)).toContain(SENTINEL);
  });

  it.each(cases)("keeps the words of %s out of the stored call note and the run's error", async (_, answer) => {
    const records: AiCallRecord[] = [];
    const excluded: string[] = [];
    const sub = claudeCliClient({ spawn: fakeSpawn(() => answer).spawn });
    const client = fallbackAiClient({ model: "m", primary: "subscription", subscription: sub, api: null, onCall: (r) => { records.push(r); }, onExclude: (_p, why) => { excluded.push(why); } });
    const e = await fail(client.json(request, signal()));
    expect(records.length).toBeGreaterThan(0);
    expect(records.every((r) => r.note !== null)).toBe(true);
    expect(JSON.stringify([records, excluded])).not.toContain(SENTINEL);
    expect(e.message).not.toContain(SENTINEL);
  });
});
