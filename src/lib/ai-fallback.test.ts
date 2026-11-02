import { describe, expect, it } from "vitest";
import { SubscriptionUnavailable } from "@/lib/ai-claude-cli";
import type { AiClient, AiJsonRequest } from "@/lib/ai-client";
import { fallbackAiClient, newGate, type AiCallRecord } from "@/lib/ai-fallback";

const request: AiJsonRequest = { name: "workbook_page", system: "s", content: [{ type: "text", text: "t" }], schema: { type: "object" } };
const signal = () => new AbortController().signal;

/** A client that answers from a list of steps: a value, or an error to throw. */
function scripted(model: string, steps: unknown[]) {
  const seen: AiJsonRequest[] = [];
  const client: AiClient = {
    model,
    async json(r) {
      seen.push(r);
      const step = steps.length > 1 ? steps.shift() : steps[0];
      if (step instanceof Error) throw step;
      return step;
    },
  };
  return { client, seen };
}

function setup(o: { sub?: unknown[] | null; api?: unknown[] | null; primary?: "subscription" | "api"; cost?: number }) {
  const sub = o.sub === null ? null : scripted("claude-sonnet-5-5", o.sub ?? [{ by: "sub" }]);
  const api = o.api === null ? null : scripted("anthropic/claude-sonnet-5.5", o.api ?? [{ by: "api" }]);
  const records: AiCallRecord[] = [];
  let t = 0;
  const gate = newGate();
  const client = fallbackAiClient({
    primary: o.primary ?? "subscription", model: "anthropic/claude-sonnet-5.5", gate, now: () => (t += 1000), onCall: (r) => records.push(r),
    subscription: sub?.client ?? null,
    api: api ? (onCost) => ({ model: api.client.model, json: async (r, s) => { const out = await api.client.json(r, s); if (o.cost !== undefined) onCost(o.cost); return out; } }) : null,
  });
  return { client, records, gate, sub, api };
}

const limit = () => new SubscriptionUnavailable("limit", "the Claude subscription hit its usage limit");

describe("fallbackAiClient", () => {
  it("answers from the subscription first, at no cost, under the run's model name", async () => {
    const s = setup({});
    expect(s.client.model).toBe("anthropic/claude-sonnet-5.5");
    expect(await s.client.json(request, signal())).toEqual({ by: "sub" });
    expect(s.api!.seen).toHaveLength(0);
    expect(s.records).toEqual([{ name: "workbook_page", provider: "subscription", model: "claude-sonnet-5-5", outcome: "answered", ms: 1000, usd: 0, note: null }]);
  });

  it("after a usage limit, answers from the API and stays on it for the rest of the run", async () => {
    const s = setup({ sub: [limit(), { by: "sub" }], cost: 0.02 });
    expect(await s.client.json(request, signal())).toEqual({ by: "api" });
    expect(await s.client.json(request, signal())).toEqual({ by: "api" });
    expect(s.sub!.seen).toHaveLength(1);
    expect(s.records.map((r) => [r.provider, r.outcome, r.usd])).toEqual([["subscription", "unavailable", 0], ["api", "answered", 0.02], ["api", "answered", 0.02]]);
    expect(s.gate.off.subscription).toMatch(/usage limit/);
  });

  it("a gate shared by two clients keeps both on the API after one hits the limit", async () => {
    const s = setup({ sub: [limit()] });
    await s.client.json(request, signal());
    const other = scripted("claude-haiku-5-5", [{ by: "sub2" }]);
    const second = fallbackAiClient({ primary: "subscription", model: "m", gate: s.gate, subscription: other.client, api: () => ({ model: "api2", json: async () => ({ by: "api2" }) }) });
    expect(await second.json(request, signal())).toEqual({ by: "api2" });
    expect(other.seen).toHaveLength(0);
  });

  it("after a crash or an image, sends only that call to the API and tries the subscription again next time", async () => {
    const s = setup({ sub: [new SubscriptionUnavailable("crash", "claude -p returned no output"), new SubscriptionUnavailable("images", "image"), { by: "sub" }] });
    expect(await s.client.json(request, signal())).toEqual({ by: "api" });
    expect(await s.client.json(request, signal())).toEqual({ by: "api" });
    expect(await s.client.json(request, signal())).toEqual({ by: "sub" });
    expect(s.gate.off.subscription).toBeUndefined();
  });

  it("leaves an ordinary failure (bad output) to the caller's retry: never sent to the other provider", async () => {
    const s = setup({ sub: [new Error("the output is not valid JSON")] });
    await expect(s.client.json(request, signal())).rejects.toThrow("the output is not valid JSON");
    expect(s.api!.seen).toHaveLength(0);
    expect(s.records.map((r) => [r.provider, r.outcome, r.note])).toEqual([["subscription", "failed", "the output is not valid JSON"]]);
  });

  it("with the API first, answers from it, and goes to the subscription only when the API cannot take the call", async () => {
    const s = setup({ primary: "api", api: [{ by: "api" }, new Error("OpenRouter answered 402: no credits"), { by: "api" }] });
    expect(await s.client.json(request, signal())).toEqual({ by: "api" });
    expect(await s.client.json(request, signal())).toEqual({ by: "sub" });
    // 402 lasts: the API stays off for the run.
    expect(await s.client.json(request, signal())).toEqual({ by: "sub" });
    expect(s.gate.off.api).toMatch(/402/);
  });

  it("with no API key, a usage limit fails the call and says there is no fallback", async () => {
    const s = setup({ sub: [limit()], api: null });
    await expect(s.client.json(request, signal())).rejects.toThrow(/usage limit; no fallback: the API/);
    await expect(s.client.json(request, signal())).rejects.toThrow(/No AI provider can take the call \(the subscription: /);
  });

  it("on the server (no subscription), answers from the API only", async () => {
    const s = setup({ sub: null, cost: 0.5 });
    expect(await s.client.json(request, signal())).toEqual({ by: "api" });
    expect(s.records[0]).toMatchObject({ provider: "api", usd: 0.5, outcome: "answered" });
  });

  it("does not fall back when the caller's time is up", async () => {
    const c = new AbortController();
    const sub: AiClient = { model: "m", json: async () => { c.abort(); throw new SubscriptionUnavailable("crash", "killed"); } };
    let asked = false;
    const client = fallbackAiClient({ primary: "subscription", model: "m", subscription: sub, api: () => ({ model: "a", json: async () => { asked = true; return {}; } }) });
    await expect(client.json(request, c.signal)).rejects.toThrow("killed");
    expect(asked).toBe(false);
  });
});
