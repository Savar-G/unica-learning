import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { runAiCallLog, type RunAiCall } from "@/lib/workbook-job-store";
import { fallbackAiClient, type AiCallRecord } from "@/lib/ai-fallback";

const call = (provider: AiCallRecord["provider"], ms = 1234.6): AiCallRecord => ({ name: "workbook_page", provider, model: "m", outcome: "answered", ms, usd: provider === "api" ? 0.1 : 0, note: null });
const request = { name: "workbook_page", system: "s", schema: {}, content: [{ type: "text" as const, text: "t" }] };

describe("runAiCallLog", () => {
  it("R404-6 saves every completed call before returning, including fewer than ten calls", async () => {
    const writes: RunAiCall[][] = [];
    const log = runAiCallLog(async (calls) => { writes.push(calls); });
    for (let i = 0; i < 9; i++) await log.add("write", call("api"));
    expect(writes.flat()).toHaveLength(9);
    expect(new Set(writes.flat().map((r) => r.id)).size).toBe(9);
    expect(writes[0][0]).toMatchObject({ kind: "write", ms: 1235, usd: 0.1 });
  });

  it("R404-6 keeps a failed batch and retries the same durable ids after an uncertain save", async () => {
    const rows = new Map<string, RunAiCall>();
    const attempts: RunAiCall[][] = [];
    const log = runAiCallLog(async (calls) => {
      attempts.push(structuredClone(calls));
      for (const r of calls) rows.set(r.id!, r);
      if (attempts.length === 1) throw new Error("response lost after commit");
    });
    await expect(log.add("write", call("api"))).rejects.toThrow("response lost");
    await log.flush();
    expect(attempts).toHaveLength(2);
    expect(attempts[1]).toEqual(attempts[0]);
    expect(rows.size).toBe(1);
    expect([...rows.values()][0].usd).toBe(0.1);
  });

  it("R404-6 saves intent before the provider and saves accounting before returning its result", async () => {
    const rows = new Map<string, RunAiCall>();
    let release!: () => void;
    let completed!: () => void;
    const completing = new Promise<void>((r) => { completed = r; });
    const log = runAiCallLog(async (calls) => {
      if (calls.some((r) => r.outcome === "answered")) {
        completed();
        await new Promise<void>((r) => { release = r; });
      }
      for (const r of calls) rows.set(r.id!, r);
    });
    const client = fallbackAiClient({
      model: "m", primary: "subscription", api: null,
      subscription: { model: "m", json: async () => {
        expect([...rows.values()].map((r) => r.outcome)).toEqual(["started"]);
        return { items: [] };
      } },
      onStart: (r) => log.add("write", r), onCall: (r) => log.add("write", r),
    });
    let returned = false;
    const running = client.json(request, new AbortController().signal).then((r) => { returned = true; return r; });
    await completing;
    expect(returned).toBe(false);
    expect([...rows.values()].map((r) => r.outcome)).toEqual(["started"]);
    release();
    expect(await running).toEqual({ items: [] });
    expect(rows.size).toBe(1);
    expect([...rows.values()][0].outcome).toBe("answered");
  });

  it("R404-6 does not start a provider when the intent cannot be saved", async () => {
    const json = vi.fn(async () => ({}));
    const log = runAiCallLog(async () => { throw new Error("offline"); });
    const client = fallbackAiClient({ model: "m", primary: "subscription", subscription: { model: "m", json }, api: null, onStart: (r) => log.add("write", r) });
    await expect(client.json(request, new AbortController().signal)).rejects.toThrow("offline");
    expect(json).not.toHaveBeenCalled();
  });
});
