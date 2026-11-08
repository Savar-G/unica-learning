import { writeFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import { excludeRunProvider, loadRunProviderGate } from "@/lib/workbook-job-store";
import type { Spawner } from "@/lib/ai-claude-cli";
import type { AiCallRecord } from "@/lib/ai-fallback";
import { runModelName, summarizeAiCalls, workbookAi, workbookAiPreflight, workbookAiPrimary, workbookModels, workbookRunner, type AiCallKind } from "@/lib/workbook-ai";
import type { SolveLog, SolveRequest } from "@/lib/workbook-solve-check";
import { runWorkbookJob, startWorkbookRun, type WorkbookJobDeps } from "@/lib/workbook-job";
import { memoryRunStore } from "@/lib/workbook-job-memory";
import { memoryDraftStore } from "@/lib/workbook-draft-memory";
import { memoryWorkbookFiles } from "@/lib/workbook-store-memory";
import { fakePrintEngine } from "@/lib/print-engine-fake";
import { workbookTemplate } from "@/lib/workbook-template";

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

describe("edit batch provider dispatches", () => {
  for (const subscription of [false, true]) {
    it(`${subscription ? "Mac" : "server"} makes one API request per edit dispatch, including a 500 response`, async () => {
      const c = cli(() => ({ items: [] }));
      const fetch = vi.fn(async () => new Response('{"error":{"message":"unavailable"}}', {status: 500}));
      const live = workbookAi({ OPENROUTER_API_KEY: "test" }, { subscription, primary: "api", singleDispatch: true, spawn: c.spawn, fetch });
      await expect(live.ai!.json(page, signal())).rejects.toThrow(/500/);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(c.models).toHaveLength(0);
      await expect(live.solve!.solver.solve(solveRequest, signal())).rejects.toThrow(/500/);
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(c.models).toHaveLength(0);
    });
  }
  it("uses the fallback only on the next ledger dispatch after a subscription limit", async () => {
    const c = cli(() => "limit"), api = openRouter(() => ({items: []}));
    const live = workbookAi({ OPENROUTER_API_KEY: "test" }, { subscription: true, singleDispatch: true, spawn: c.spawn, fetch: api.fetch });
    await expect(live.ai!.json(page, signal())).rejects.toThrow(/usage limit/);
    expect(c.models).toHaveLength(1); expect(api.models).toHaveLength(0);
    expect(await live.ai!.json(page, signal())).toEqual({items: []});
    expect(c.models).toHaveLength(1); expect(api.models).toHaveLength(1);
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


describe("explicit Codex workbook subscriptions", () => {
  const env = { WORKBOOK_SUBSCRIPTION_PROVIDER: "codex", WORKBOOK_CODEX_HOME: "/accounts/unify" };
  const model = "codex/gpt-6.1-sol;reasoning=high;auth=chatgpt";

  it.each(["", "relative/account", "~/account"])("refuses a missing or relative account home: %j", home => {
    expect(() => workbookAi({ ...env, WORKBOOK_CODEX_HOME: home }, { subscription: true })).toThrow(/absolute/);
  });

  it("keeps the Claude default and its availability behavior", async () => {
    const spawn = vi.fn<Spawner>();
    await workbookAiPreflight({}, { spawn });
    await workbookAiPreflight({ WORKBOOK_SUBSCRIPTION_PROVIDER: "claude", WORKBOOK_CODEX_HOME: "irrelevant" }, { spawn });
    expect(spawn).not.toHaveBeenCalled();
    expect(workbookModels({ WORKBOOK_SUBSCRIPTION_PROVIDER: "claude" })).toEqual(workbookModels({}));
  });

  it("refuses an unknown provider and refuses Codex where subscriptions cannot run", () => {
    expect(() => workbookAi({ WORKBOOK_SUBSCRIPTION_PROVIDER: "typo" }, { subscription: true })).toThrow(/WORKBOOK_SUBSCRIPTION_PROVIDER/);
    expect(() => workbookAi({ ...env, OPENROUTER_API_KEY: "key" }, { subscription: false })).toThrow(/Codex/);
  });

  it("writes and solves on the selected account only, even with API-first settings and API keys", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const calls: [AiCallKind, AiCallRecord][] = [];
    const spawn = vi.fn<Spawner>(async (command, args, options) => {
      expect(command).toBe("codex");
      expect(options.env).toEqual({ CODEX_HOME: "/accounts/unify", PATH: "/bin", HOME: "/home/test" });
      expect(args[args.indexOf("--model") + 1]).toBe("gpt-6.1-sol");
      expect(args).toContain('model_reasoning_effort="high"');
      expect(args).toContain('forced_login_method="chatgpt"');
      expect(args).toContain("--ignore-user-config");
      await writeFile(args[args.indexOf("--output-last-message") + 1], JSON.stringify(options.input.includes("2 + 3") ? solveAnswer : { items: [] }));
      return { code: 0, stdout: '{"type":"turn.completed"}\n', stderr: "" };
    });
    const settings = { ...env, PATH: "/bin", HOME: "/home/test", CODEX_HOME: "/wrong/account", OPENAI_API_KEY: "key", OPENROUTER_API_KEY: "key", ANTHROPIC_API_KEY: "key", WORKBOOK_AI_PRIMARY: "api" };
    expect(workbookModels(settings)).toMatchObject({ cli: model, cliSolve: model, write: model, solve: model });
    expect(workbookAiPrimary(settings)).toBe("subscription");
    const live = workbookAi(settings, { subscription: true, primary: "api", spawn, fetch, onCall: (k, r) => calls.push([k, r]) });
    expect(live.ai!.model).toBe(model);
    expect(live.solve!.solver.model).toBe(model);
    expect(await live.ai!.json(page, signal())).toEqual({ items: [] });
    expect(await live.solve!.solver.solve(solveRequest, signal())).toEqual(solveAnswer);
    expect(calls.map(([kind, r]) => [kind, r.provider, r.model, r.outcome, r.usd])).toEqual([
      ["write", "subscription", model, "answered", 0], ["solve", "subscription", model, "answered", 0],
    ]);
    expect(spawn).toHaveBeenCalledTimes(2);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    { code: 1, stderr: "usage limit reached" },
    { code: 1, stderr: "401 authentication failed" },
    { code: null, error: { code: "ENOENT", message: "missing" } },
  ])("persists selected-provider unavailability across writer, solver and a restored factory: %j", async failure => {
    const off: Record<string, string> = {};
    const spawn = vi.fn<Spawner>(async () => ({ stdout: "", stderr: "", ...failure }));
    const fetch = vi.fn<typeof globalThis.fetch>();
    const options = { subscription: true, spawn, fetch, onExclude: (p: string, reason: string) => { off[p] = reason; } };
    const first = workbookAi({ ...env, OPENROUTER_API_KEY: "key" }, options);
    await expect(first.ai!.json(page, signal())).rejects.toThrow();
    await expect(first.solve!.solver.solve(solveRequest, signal())).rejects.toThrow(/No AI provider/);
    const restored = workbookAi({ ...env, OPENROUTER_API_KEY: "key" }, { ...options, gate: { off } });
    await expect(restored.ai!.json(page, signal())).rejects.toThrow(/No AI provider/);
    expect(off.subscription).toBeTruthy();
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not record a cancelled Codex call as an answer or send it to the API", async () => {
    const controller = new AbortController();
    const calls: AiCallRecord[] = [];
    const fetch = vi.fn<typeof globalThis.fetch>();
    const spawn: Spawner = async (_command, _args, options) => {
      expect(options.signal).toBe(controller.signal);
      controller.abort();
      return { code: 0, stdout: '{"type":"turn.completed"}\n', stderr: "" };
    };
    const live = workbookAi({ ...env, OPENROUTER_API_KEY: "key" }, { subscription: true, spawn, fetch, onCall: (_k, r) => calls.push(r) });
    await expect(live.ai!.json(page, controller.signal)).rejects.toThrow();
    expect(calls.map(r => r.outcome)).toEqual(["failed"]);
    expect(live.gate.off).toEqual({});
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(["same", "writer", "solver", "effort"])("stores the actual frame identity and checks it on resume: %s", async change => {
    const spawn = vi.fn<Spawner>();
    const fetch = vi.fn<typeof globalThis.fetch>();
    const live = workbookAi(env, { subscription: true, spawn, fetch });
    const childId = crypto.randomUUID(), parentId = crypto.randomUUID();
    const drafts = memoryDraftStore({ [childId]: parentId });
    const now = () => new Date("2026-11-05T12:00:00Z");
    const runs = memoryRunStore({ children: { [childId]: parentId }, now, newId: () => crypto.randomUUID(), drafts });
    const deps: WorkbookJobDeps = {
      itemPolicy: "legacy", runs, drafts, files: memoryWorkbookFiles(),
      ai: live.ai, solver: live.solve!.solver,
      template: workbookTemplate(), fit: () => ({ fits: async () => ({ ok: true }) }), engine: fakePrintEngine(),
      source: {
        inputs: async () => ({ parentId, name: "Synthetic", grade: 3, province: "BC", profile: null, workbooks: [] }),
        prepareProfile: async () => ({ ok: true, profile: null }),
      },
      newId: () => crypto.randomUUID(), qrToken: () => "synthetic-token", fileKey: () => "synthetic",
      now: () => now().getTime(), budgetMs: 1, build: "provider-test",
    };
    const start = await startWorkbookRun(runs, childId, { id: crypto.randomUUID(), email: "synthetic@example.com" });
    if (start.status !== "started") throw new Error(start.status);
    // A short budget stores the frame and yields before any writer, solver or print request.
    const outcome = await runWorkbookJob(start.runId, deps);
    expect(outcome, (await runs.run(start.runId))!.error ?? "").toBe("handed-on");
    expect((await runs.frame(start.runId))!.versions).toMatchObject({ model, solveModel: model });
    const claude = workbookAi({}, { subscription: true, spawn, fetch });
    if (change === "writer") deps.ai = claude.ai;
    if (change === "solver") deps.solver = claude.solve!.solver;
    if (change === "effort") deps.ai = { ...live.ai!, model: model.replace("high", "medium") };
    expect(await runWorkbookJob(start.runId, deps, { resume: true })).toBe(change === "same" ? "handed-on" : "failed");
    if (change !== "same") expect((await runs.run(start.runId))!.error).toMatch(/model changed since it started/);
    expect(spawn).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});
