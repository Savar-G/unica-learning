import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { workbookAi, summarizeAiCalls } from "@/lib/workbook-ai";
import { runAiCallLog, type RunAiCall } from "@/lib/workbook-job-store";
import { openRouterClient } from "@/lib/ai-openrouter";

const request = { name: "workbook_page", system: "s", schema: {}, content: [{ type: "text" as const, text: "t" }] };
const busy = () => new Response(JSON.stringify({ error: { message: "busy" }, usage: { cost: 0.02 } }), { status: 503 });
const answer = () => new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: "{}" } }], usage: { cost: 0.03 } }));
function barrier() { let resolve!: () => void; const promise = new Promise<void>((r) => { resolve = r; }); return { resolve, promise }; }

describe("R404-8 dispatched API request counts", () => {
  it("does not dispatch if permission finishes after cancellation", async () => {
    const controller = new AbortController();
    const fetch = vi.fn(async () => answer());
    const onDispatch = vi.fn();
    const client = openRouterClient({ apiKey: "fixture", model: "fixture", fetch, onDispatch, onRequest: async () => { controller.abort(); } });
    await expect(client.json(request, controller.signal)).rejects.toThrow("time is up");
    expect(fetch).not.toHaveBeenCalled();
    expect(onDispatch).not.toHaveBeenCalled();
  });

  it.each(["before commit", "after commit"])("does not count a retry when its intent save fails %s", async (phase) => {
    let dispatched = 0;
    let rejected = false;
    const rows = new Map<string, RunAiCall>();
    const log = runAiCallLog(async (calls) => {
      const stop = !rejected && dispatched === 1 && calls.some((c) => c.outcome === "started");
      if (stop) rejected = true;
      if (stop && phase === "before commit") throw new Error("save failed before retry dispatch");
      // The production RPC preserves the highest count on an uncertain replay.
      for (const c of calls) rows.set(c.id!, { ...c, requests: Math.max(rows.get(c.id!)?.requests ?? 0, c.requests ?? 1) });
      if (stop) throw new Error("save response lost before retry dispatch");
    });
    const live = workbookAi({ OPENROUTER_API_KEY: "fixture" }, {
      subscription: false, onStart: log.add, onCall: log.add,
      fetch: async () => { dispatched++; return busy(); },
    });
    await expect(live.ai!.json(request, new AbortController().signal)).rejects.toThrow(/save/);
    await log.flush();
    const saved = [...rows.values()];
    expect(rejected).toBe(true);
    expect(dispatched).toBe(1);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ outcome: "failed", requests: 1, usd: 0.02 });
    expect(summarizeAiCalls(saved)).toMatchObject({ retries: 0, api: { calls: 1, failed: 1, usd: 0.02 } });
  });

  it.each([false, true])("holds dispatch behind its save, then %s cancels the retry", async (cancel) => {
    const entered = barrier(), release = barrier();
    let dispatched = 0;
    const rows = new Map<string, RunAiCall>();
    const controller = new AbortController();
    const log = runAiCallLog(async (calls) => {
      if (dispatched === 1 && calls.some((c) => c.outcome === "started")) { entered.resolve(); await release.promise; }
      for (const c of calls) rows.set(c.id!, { ...c, requests: Math.max(rows.get(c.id!)?.requests ?? 0, c.requests ?? 1) });
    });
    const live = workbookAi({ OPENROUTER_API_KEY: "fixture" }, {
      subscription: false, onStart: log.add, onCall: log.add,
      fetch: async () => { dispatched++; return dispatched === 1 ? busy() : answer(); },
    });
    const pending = live.ai!.json(request, controller.signal).then((value) => ({ value, error: null }), (e: Error) => ({ value: null, error: e.message }));
    await entered.promise;
    expect(dispatched).toBe(1);
    if (cancel) controller.abort();
    release.resolve();
    const result = await pending;
    await log.flush();
    expect(dispatched).toBe(cancel ? 1 : 2);
    expect([...rows.values()]).toHaveLength(1);
    expect([...rows.values()][0]).toMatchObject({ requests: dispatched, usd: cancel ? 0.02 : 0.05 });
    expect(summarizeAiCalls([...rows.values()]).retries).toBe(cancel ? 0 : 1);
    if (cancel) expect(result.error).toBe("time is up");
    else expect(result).toEqual({ value: {}, error: null });
  });
});
