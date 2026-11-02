import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { excludeRunProvider, loadRunProviderGate } from "@/lib/workbook-job-store";
import type { Spawner } from "@/lib/ai-claude-cli";
import type { AiCallRecord } from "@/lib/ai-fallback";
import { runModelName, summarizeAiCalls, workbookAi, workbookAiPrimary, workbookModels, workbookRunner, type AiCallKind } from "@/lib/workbook-ai";
import type { SolveLog, SolveRequest } from "@/lib/workbook-solve-check";

const signal = () => new AbortController().signal;
const solveRequest: SolveRequest = { questions: [{ id: "question", text: "2 + 3 = ?", boxes: [{ id: "answer" }] }] as unknown as SolveRequest["questions"], key: [] };
const solveAnswer = { answers: [{ question: "question", box: "answer", answer: "5" }], problem: null };
const page = { name: "workbook_page", system: "s", content: [{ type: "text" as const, text: "t" }], schema: { type: "object" } };

/** A fake `claude -p`: answers each call from `answer` with the model it was asked for. */
function cli(answer: (model: string) => unknown | "limit") {
  const models: string[] = [];
  const spawn: Spawner = async (_c, args) => {
    const model = args[args.indexOf("--model") + 1];
    models.push(model);
    const out = answer(model);
    if (out === "limit") return { code: 1, stdout: JSON.stringify({ type: "result", is_error: true, result: "Claude AI usage limit reached" }), stderr: "" };
    return { code: 0, stdout: JSON.stringify({ type: "result", subtype: "success", is_error: false, structured_output: out }), stderr: "" };
  };
  return { spawn, models };
}

/** A fake OpenRouter: answers each request with `out` and its cost. */
function openRouter(out: (model: string) => unknown, cost = 0.03) {
  const models: string[] = [];
  const fetch: typeof globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body)) as { model: string };
    models.push(body.model);
    return new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(out(body.model)) } }], usage: { cost } }), { status: 200 });
  };
  return { fetch, models };
}

describe("the workbook AI settings", () => {
  it("makes runs on the Mac and puts the subscription first unless set otherwise", () => {
    expect(workbookRunner({})).toBe("mac");
    expect(workbookRunner({ WORKBOOK_RUNNER: "server" })).toBe("server");
    expect(workbookRunner({ WORKBOOK_RUNNER: "anything" })).toBe("mac");
    expect(workbookAiPrimary({})).toBe("subscription");
    expect(workbookAiPrimary({ WORKBOOK_AI_PRIMARY: "API" })).toBe("api");
  });

  it("names a run's model the same whichever provider answers, when both are the same model", () => {
    expect(workbookModels({})).toMatchObject({ cli: "claude-sonnet-5-5", cliSolve: "claude-haiku-5-5", write: "anthropic/claude-sonnet-5.5", solve: "anthropic/claude-haiku-5.5" });
    expect(runModelName("claude-opus-5-5", "anthropic/claude-sonnet-5.5")).toBe("claude-opus-5-5 or anthropic/claude-sonnet-5.5");
  });
});

describe("workbookAi", () => {
  it("is off with no subscription here and no API key", () => {
    expect(workbookAi({}, { subscription: false })).toMatchObject({ ai: null, solve: null });
  });

  it("on the Mac, writes and solves on the subscription with its two models, at no cost", async () => {
    const c = cli((model) => (model === "claude-haiku-5-5" ? solveAnswer : { items: [] }));
    const api = openRouter(() => ({}));
    const calls: [AiCallKind, AiCallRecord][] = [];
    const live = workbookAi({ OPENROUTER_API_KEY: "k" }, { subscription: true, spawn: c.spawn, fetch: api.fetch, onCall: (k, r) => calls.push([k, r]) });
    expect(live.ai!.model).toBe("anthropic/claude-sonnet-5.5");
    expect(live.solve!.solver.model).toBe("anthropic/claude-haiku-5.5");
    expect(await live.ai!.json(page, signal())).toEqual({ items: [] });
    expect(await live.solve!.solver.solve(solveRequest, signal())).toEqual(solveAnswer);
    expect(c.models).toEqual(["claude-sonnet-5-5", "claude-haiku-5-5"]);
    expect(api.models).toEqual([]);
    expect(calls.map(([k, r]) => [k, r.provider, r.usd])).toEqual([["write", "subscription", 0], ["solve", "subscription", 0]]);
    expect(live.solve!.cost({ questions: solveRequest.questions } as SolveLog)).toBe(0);
  });

  it("after a usage limit on one, both the writer and the solve check stay on the API, with each check's cost", async () => {
    const c = cli(() => "limit");
    const api = openRouter((model) => (model === "anthropic/claude-haiku-5.5" ? solveAnswer : { items: [1] }), 0.04);
    const calls: [AiCallKind, AiCallRecord][] = [];
    const live = workbookAi({ OPENROUTER_API_KEY: "k" }, { subscription: true, spawn: c.spawn, fetch: api.fetch, onCall: (k, r) => calls.push([k, r]) });
    expect(await live.ai!.json(page, signal())).toEqual({ items: [1] });
    expect(await live.solve!.solver.solve(solveRequest, signal())).toEqual(solveAnswer);
    expect(c.models).toHaveLength(1);
    expect(api.models).toEqual(["anthropic/claude-sonnet-5.5", "anthropic/claude-haiku-5.5"]);
    expect(calls.map(([k, r]) => [k, r.provider, r.outcome])).toEqual([["write", "subscription", "unavailable"], ["write", "api", "answered"], ["solve", "api", "answered"]]);
    expect(live.solve!.cost({ questions: solveRequest.questions } as SolveLog)).toBe(0.04);
  });

  it("on the server, uses the API only (never claude -p)", async () => {
    const c = cli(() => ({ items: [] }));
    const api = openRouter(() => ({ items: [2] }));
    const live = workbookAi({ OPENROUTER_API_KEY: "k", WORKBOOK_AI_PRIMARY: "subscription" }, { subscription: false, spawn: c.spawn, fetch: api.fetch });
    expect(await live.ai!.json(page, signal())).toEqual({ items: [2] });
    expect(c.models).toEqual([]);
  });

  it("with WORKBOOK_AI_PRIMARY=api on the Mac, asks the API first", async () => {
    const c = cli(() => ({ items: [] }));
    const api = openRouter(() => ({ items: [3] }));
    const live = workbookAi({ OPENROUTER_API_KEY: "k", WORKBOOK_AI_PRIMARY: "api" }, { subscription: true, spawn: c.spawn, fetch: api.fetch });
    expect(await live.ai!.json(page, signal())).toEqual({ items: [3] });
    expect(c.models).toEqual([]);
  });
});

describe("summarizeAiCalls", () => {
  it("counts the calls on each provider, the API's cost, and the calls a provider could not take", () => {
    const s = summarizeAiCalls([
      { provider: "subscription", outcome: "answered", usd: 0, note: null },
      { provider: "subscription", outcome: "failed", usd: 0, note: "bad JSON" },
      { provider: "subscription", outcome: "unavailable", usd: 0, note: "usage limit" },
      { provider: "api", outcome: "answered", usd: 0.25, note: null },
      { provider: "api", outcome: "answered", usd: null, note: null },
    ]);
    expect(s).toEqual({
      incomplete: 0, retries: 0, subscription: { calls: 2, failed: 1 }, api: { calls: 2, failed: 0, usd: 0.25, noCost: 1 }, unavailable: { subscription: 1, api: 0, last: "usage limit" },
    });
  });
});


describe("R404 provider persistence and request counts", () => {
  it("R404-4 restores a saved exclusion before a fresh job instance writes or solves", async () => {
    const off: Record<string, { note: string }> = {};
    const db = createClient<Database>("https://example.supabase.co", "test", { global: { fetch: async (url, init) => {
      if (String(url).includes("/rpc/exclude_workbook_run_ai")) {
        const args = JSON.parse(String(init?.body));
        off[args.p_provider] = { note: args.p_note };
        return new Response("true");
      }
      return new Response(JSON.stringify({ ai_off: off }), { headers: { "content-type": "application/json" } });
    } } });
    const c = cli(() => "limit");
    const api = openRouter((model) => model.includes("haiku") ? solveAnswer : { items: [1] });
    const options = { subscription: true, spawn: c.spawn, fetch: api.fetch, onExclude: (p: "api" | "subscription", reason: string) => excludeRunProvider(db, "run", p, reason) };
    const first = workbookAi({ OPENROUTER_API_KEY: "key" }, { ...options, gate: await loadRunProviderGate(db, "run") });
    await first.ai!.json(page, signal());
    expect(off.subscription.note).toMatch(/usage limit/);
    const resumed = workbookAi({ OPENROUTER_API_KEY: "key" }, { ...options, gate: await loadRunProviderGate(db, "run") });
    expect(await resumed.ai!.json(page, signal())).toEqual({ items: [1] });
    expect(await resumed.solve!.solver.solve(solveRequest, signal())).toEqual(solveAnswer);
    expect(c.models).toHaveLength(1);
    expect(api.models).toHaveLength(3);
  });

  it("R404-8 reports both API requests and their costs when one logical call retries", async () => {
    let requests = 0;
    const rows: AiCallRecord[] = [];
    const live = workbookAi({ OPENROUTER_API_KEY: "key" }, { subscription: false, onCall: (_kind, r) => rows.push(r), fetch: async () => {
      requests++;
      return new Response(JSON.stringify(requests === 1
        ? { error: { message: "overloaded" }, usage: { cost: 0.02 } }
        : { choices: [{ finish_reason: "stop", message: { content: "{}" } }], usage: { cost: 0.03 } }), { status: requests === 1 ? 500 : 200 });
    } });
    await live.ai!.json(page, signal());
    expect(requests).toBe(2);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ requests: 2, usd: 0.05 });
    expect(summarizeAiCalls(rows)).toMatchObject({ api: { calls: 1, usd: 0.05 }, retries: 1 });
  });
});


it("keeps known costs for unavailable and unfinished calls, with missing results separate", () => {
  expect(summarizeAiCalls([
    { provider: "api", outcome: "unavailable", usd: 0.02, note: "overloaded", requests: 2 },
    { provider: "api", outcome: "started", usd: 0.03, note: null, requests: 1 },
  ])).toMatchObject({ api: { calls: 0, usd: 0.05 }, unavailable: { api: 1 }, incomplete: 1, retries: 1 });
});
