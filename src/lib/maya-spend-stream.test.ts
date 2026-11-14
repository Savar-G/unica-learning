import { describe, expect, it, vi } from "vitest";
import { openRouterClient } from "@/lib/ai-openrouter";
import { createSpendLedger, spendConfig, usdToMicros, type Charge } from "@/lib/maya-spend";
import { meteredAi } from "@/lib/maya-spend-ai";
import { memorySpendStore } from "@/lib/maya-spend-memory";

// D-341, round 3: a streamed Maya model call (stream: true, server-sent events) reports its cost to the spend ledger,
// read from the stream's last event, through the metered client's settle path.

const P = "11111111-1111-4111-8111-111111111111";
const C = "22222222-2222-4222-8222-222222222222";
const child: Charge = { kind: "child", parentId: P, childId: C };

describe("a streamed call", () => {
  it("settles its cost from the stream's last event", async () => {
    const now = Date.parse("2026-11-05T18:00:00Z");
    let n = 0;
    const store = memorySpendStore({ clock: () => now });
    const config = spendConfig({});
    const ledger = createSpendLedger({ store, clock: () => now, config, zone: async () => "America/Vancouver", alert: vi.fn(async () => {}) });
    const settled: [string, number | null][] = [];
    const settleUsd = ledger.settleUsd.bind(ledger);
    ledger.settleUsd = async (id, usd) => { settled.push([id, usd]); return settleUsd(id, usd); };
    const text = JSON.stringify({ say: "Hi.", act: "guide" });
    const events = [`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`, `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }], usage: { cost: 0.0123 } })}\n\n`, "data: [DONE]\n\n"];
    let body: Record<string, unknown> = {};
    const fetch = (async (_u: unknown, init?: RequestInit) => {
      body = JSON.parse(String(init?.body));
      return new Response(new ReadableStream({ start(c) { for (const e of events) c.enqueue(new TextEncoder().encode(e)); c.close(); } }), { status: 200, headers: { "content-type": "text/event-stream" } });
    }) as typeof globalThis.fetch;
    const client = meteredAi((hooks) => openRouterClient({ apiKey: "k", model: "m", maxRetries: 0, ...hooks }), { ledger, charge: child, callId: null, newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}` }, "model", fetch);
    const seen: string[] = [];
    expect(await client.json({ name: "maya_reply", system: "s", content: [], schema: {}, onText: (x) => seen.push(x) }, new AbortController().signal)).toEqual({ say: "Hi.", act: "guide" });
    expect(body).toMatchObject({ stream: true, usage: { include: true } });
    expect(seen).toEqual([text]);
    await vi.waitFor(() => expect(settled).toEqual([[expect.any(String), 0.0123]]));
    expect((await ledger.week({ parentId: P, childId: C })).usedMicros).toBe(usdToMicros(0.0123, config));
  });
});
