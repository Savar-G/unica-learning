import { describe, expect, it } from "vitest";
import { openRouterClient } from "@/lib/ai-openrouter";
import { conversationalMayaModel } from "@/lib/maya-model";
import { reply } from "@/lib/maya-model-fake";
import { SAMPLE_PACKAGES } from "@/lib/maya-samples";
import { spendConfig, type SpendLedger } from "@/lib/maya-spend";
import { meteredAi } from "@/lib/maya-spend-ai";
import { createTextSession } from "@/lib/maya-text";

// A voice turn streams Maya's reply (D-341): her first sentence reaches the voice before the reply is in. The cost of
// that streamed request still settles in the spending ledger (D-290): OpenRouter sends it in the stream's last event,
// and the metered client reads it from a copy of the stream (src/lib/maya-spend-ai.ts).

/** A ledger that records each reservation and how it was settled. */
function recordingLedger() {
  const reserved: string[] = [];
  const settled: { id: string; usd: number | null }[] = [];
  const ledger: SpendLedger = {
    config: spendConfig({}),
    reserve: async ({ id }) => { reserved.push(id); return { ok: true }; },
    settle: async () => {},
    settleUsd: async (id, usd) => { settled.push({ id, usd }); },
    state: async () => "open",
    block: () => { throw new Error("no budget block in this test"); },
    week: async () => ({ usedMicros: 0, weekMicros: 0 }) as never,
  };
  return { ledger, reserved, settled };
}

/** OpenRouter's server-sent events for one reply, a few characters at a time, with the cost in the last event. */
function streamedFetch(say: string, cost: number) {
  let calls = 0;
  const fetch = (async (_url: unknown, init?: RequestInit) => {
    calls++;
    const body = JSON.parse(String(init?.body)) as { stream?: boolean; messages: { content: { text?: string }[] }[] };
    if (!body.stream) throw new Error("this request was not streamed");
    const brief = JSON.parse(body.messages[1].content[0].text ?? "{}") as { help?: { step?: string } };
    const text = JSON.stringify(reply(say, "guide", { step: brief.help?.step ?? "", reading: { answers: [{ value: { type: "number", value: 56 }, step: "result", problem: "target", verdict: "wrong" }] } }));
    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += 6) chunks.push(text.slice(i, i + 6));
    const events = [...chunks.map((c) => `data: ${JSON.stringify({ choices: [{ delta: { content: c } }] })}\n\n`), `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }], usage: { cost, prompt_tokens: 10, completion_tokens: 20 } })}\n\n`, "data: [DONE]\n\n"];
    const stream = new ReadableStream({ start(c) { for (const e of events) c.enqueue(new TextEncoder().encode(e)); c.close(); } });
    return new Response(stream, { status: 200, headers: { "content-type": "text/event-stream" } });
  }) as typeof globalThis.fetch;
  return { fetch, calls: () => calls };
}

describe("a streamed Maya turn and its cost (D-341, D-290)", () => {
  it("streams the first sentence to the voice and settles the request with the cost OpenRouter reported", async () => {
    const t = recordingLedger();
    // Round 4: both sentences are math-only by the closed vocabulary, so they stream with no review.
    const net = streamedFetch("Let's think about the ones together. What do the ones make?", 0.0042);
    let n = 0;
    const client = meteredAi((hooks) => openRouterClient({ apiKey: "k", model: "anthropic/claude-sonnet-5.5", ...hooks, maxRetries: 0 }), {
      ledger: t.ledger, charge: { kind: "child", parentId: "p", childId: "c" }, callId: "call-1", newId: () => `r${++n}`,
    }, "model", net.fetch);
    const parts: string[] = [];
    const session = createTextSession({
      callId: "call-1", package: SAMPLE_PACKAGES["add-27-39"], model: conversationalMayaModel(client), clock: () => Date.UTC(2026, 10, 12), random: 1,
      onSayPart: (sentence) => parts.push(sentence),
    });
    await session.start();
    expect(net.calls()).toBe(0);
    parts.length = 0;
    const out = await session.child("I got 56.");
    expect(net.calls()).toBe(1);
    // The first sentence was streamed while the reply came in (its attempt says when), and the turn holds it.
    expect(parts[0]).toBe("Let's think about the ones together.");
    const attempt = session.trace().turns.at(-1)!;
    expect(attempt.kind === "maya" && attempt.attempts[0].firstSayMs).not.toBeUndefined();
    expect(out.say.join(" ")).toBe("Let's think about the ones together. What do the ones make?");
    // One reservation for the one request, settled with the stream's own cost once the stream ended.
    await new Promise((r) => setTimeout(r, 20));
    expect(t.reserved).toEqual(["r1"]);
    expect(t.settled).toEqual([{ id: "r1", usd: 0.0042 }]);
  });
});
