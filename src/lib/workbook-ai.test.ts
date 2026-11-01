import { describe, expect, it } from "vitest";
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
      subscription: { calls: 2, failed: 1 }, api: { calls: 2, failed: 0, usd: 0.25, noCost: 1 }, unavailable: { subscription: 1, api: 0, last: "usage limit" },
    });
  });
});
