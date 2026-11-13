import { describe, expect, it, vi } from "vitest";
import { openRouterClient } from "@/lib/ai-openrouter";
import { callSpend, createSpendLedger, spendConfig, usdToMicros, RESERVATION_TTL_MS, RESERVE_USD, WEEK_MICROS, type Charge, type SpendCall } from "@/lib/maya-spend";
import { meteredAi, SpendRefused } from "@/lib/maya-spend-ai";
import { BLOCK_ATTEMPTS, BLOCK_RENEW_MS, BLOCK_RETIRE_MS, SPECULATIVE_PER_TURN } from "@/lib/maya-spend-block";
import { memorySpendStore } from "@/lib/maya-spend-memory";

// The voice budget block (latency plan V1, 2026-11-13) through the ledger's public interface on the in-memory store,
// whose `log` holds one entry per database request: one atomic reservation of a block of model attempts for a voice
// call, an in-memory gate on each turn, refills off the turn's path, a block retired before 8 minutes and settled once
// with its real total, and the seam the text session gets (agreed with the Maya lead).

const P = "11111111-1111-4111-8111-111111111111";
const C = "22222222-2222-4222-8222-222222222222";
const WEEK = "2026-11-02";
const MONTH = "2026-11-01";
const voice: SpendCall = { id: "55555555-5555-4555-8555-555555555555", kind: "family", parentId: P, childId: C };
const chat: SpendCall = { id: "66666666-6666-4666-8666-666666666666", kind: "chat", parentId: P, childId: C };
const child: Charge = { kind: "child", parentId: P, childId: C };

function setup() {
  let now = Date.parse("2026-11-05T18:00:00Z");
  let n = 0;
  const store = memorySpendStore({ clock: () => now });
  const config = spendConfig({});
  const ledger = createSpendLedger({ store, clock: () => now, config, zone: async () => "America/Vancouver", alert: vi.fn(async () => {}) });
  const newId = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
  const spend = callSpend(ledger, { clock: () => now, newId });
  const m = usdToMicros(RESERVE_USD.model, config);
  /** Leaves `left` micros of the child's week, counting every row as the database does. */
  const leave = (left: number) => {
    const used = store.rows().filter((r) => r.charge === "child" && r.week === WEEK).reduce((s, r) => s + (r.cost ?? r.reserved), 0);
    if (WEEK_MICROS - used - left > 0) store.spent({ charge: "child", parentId: P, childId: C, week: WEEK, month: MONTH }, WEEK_MICROS - used - left);
  };
  const week = async () => (await ledger.week({ parentId: P, childId: C })).usedMicros;
  const blocks = () => store.rows().filter((r) => r.what === "model" && r.callId === voice.id);
  const flush = () => new Promise((r) => setTimeout(r, 0));
  return { store, config, ledger, newId, spend, m, leave, week, blocks, flush, advance: (ms: number) => { now += ms; } };
}

const answer = (cost: number | null) => new Response(JSON.stringify({
  choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ ok: true }) } }],
  ...(cost === null ? {} : { usage: { cost } }),
}), { status: 200 });
const streamed = (cost: number) => new Response(new ReadableStream({
  start(c) {
    for (const e of [
      `data: ${JSON.stringify({ choices: [{ delta: { content: JSON.stringify({ ok: true }) } }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }], usage: { cost } })}\n\n`,
      "data: [DONE]\n\n",
    ]) c.enqueue(new TextEncoder().encode(e));
    c.close();
  },
}), { status: 200, headers: { "content-type": "text/event-stream" } });
const request = { name: "t", system: "s", content: [{ type: "text" as const, text: "x" }], schema: {} };
const signal = () => new AbortController().signal;
/** Maya's model client of a call, as the server builds it. */
const client = (t: ReturnType<typeof setup>, call: SpendCall, fetch: typeof globalThis.fetch, safetyRead = false) =>
  meteredAi((hooks) => openRouterClient({ apiKey: "k", model: "m", ...hooks, maxRetries: 0 }), { ledger: t.ledger, charge: child, callId: call.id, newId: t.newId, safetyRead }, "model", fetch);

describe("the block at the call's open", () => {
  it("reserves 4 model attempts in one request", async () => {
    const t = setup();
    const b = t.spend.budget(voice);
    await b.open();
    expect(t.store.log()).toEqual(["reserve"]);
    expect(t.blocks()).toMatchObject([{ what: "model", charge: "child", reserved: BLOCK_ATTEMPTS * t.m, settled: false }]);
    expect(b.attempts()).toBe(BLOCK_ATTEMPTS);
  });

  it("falls back to a block of 1 when the week covers 1 to 3 attempts", async () => {
    for (const k of [1, 2, 3]) {
      const t = setup();
      t.leave(k * t.m + 1000);
      const b = t.spend.budget(voice);
      await b.open();
      expect(t.blocks()).toMatchObject([{ reserved: t.m }]);
      expect(b.attempts()).toBe(1);
    }
  });

  it("reserves nothing when the week does not cover one attempt", async () => {
    const t = setup();
    t.leave(t.m - 1);
    const b = t.spend.budget(voice);
    await b.open();
    expect(t.blocks()).toEqual([]);
    expect(b.admit(1)).toBeNull();
    expect(await b.ensure()).toBe("week_used");
  });

  it("answers paused when the ledger cannot answer", async () => {
    const t = setup();
    t.store.fail(true);
    const b = t.spend.budget(voice);
    await b.open();
    expect(b.admit(1)).toBeNull();
    expect(await b.ensure()).toBe("paused");
  });
});

describe("the gate on a turn", () => {
  it("admits synchronously with no request, one attempt per turn in flight", async () => {
    const t = setup();
    const b = t.spend.budget(voice);
    await b.open();
    const before = t.store.log().length;
    const a = b.admit(1);
    const c = b.admit(1);
    expect(a).not.toBeNull();
    expect(c).not.toBeNull();
    expect(b.attempts()).toBe(BLOCK_ATTEMPTS - 2);
    expect(t.store.log().length).toBe(before);
    // A turn whose model was not asked gives its attempt back, in memory.
    b.release(a!);
    expect(b.attempts()).toBe(BLOCK_ATTEMPTS - 1);
    expect(t.store.log().length).toBe(before);
  });

  it("asks a turn with no child words for 2 free attempts, so the last stays for the child", async () => {
    const t = setup();
    t.leave(t.m + 1000);
    const b = t.spend.budget(voice);
    await b.open();
    expect(b.admit(2)).toBeNull();
    expect(b.admit(1)).not.toBeNull();
  });

  it("refills in the background when fewer than 2 attempts are free, one refill at a time", async () => {
    const t = setup();
    const b = t.spend.budget(voice);
    await b.open();
    for (let i = 0; i < BLOCK_ATTEMPTS; i++) expect(b.admit(1)).not.toBeNull();
    // Below 2 free the refill starts in the background: the admits did not wait for it.
    expect(b.admit(1)).toBeNull();
    await t.flush();
    // One refill, though three admits saw fewer than 2 attempts free.
    expect(t.store.log()).toEqual(["reserve", "reserve"]);
    expect(t.blocks()).toHaveLength(2);
    expect(b.admit(1)).not.toBeNull();
  });

  it("runs on what it has when the refill is refused, and sends nothing when the allowance is 0", async () => {
    const t = setup();
    const b = t.spend.budget(voice);
    await b.open();
    t.leave(0);
    // Each attempt costs its reservation: 4 attempts use the block.
    const fetch = vi.fn(async () => answer(RESERVE_USD.model));
    for (let i = 0; i < BLOCK_ATTEMPTS; i++) await client(t, voice, fetch as typeof globalThis.fetch).json(request, signal());
    expect(fetch).toHaveBeenCalledTimes(BLOCK_ATTEMPTS);
    expect(b.admit(1)).toBeNull();
    expect(await b.ensure()).toBe("week_used");
    await expect(client(t, voice, fetch as typeof globalThis.fetch).json(request, signal())).rejects.toBeInstanceOf(SpendRefused);
    expect(fetch).toHaveBeenCalledTimes(BLOCK_ATTEMPTS);
  });
});

describe("paid requests from the block", () => {
  it("sends a turn's model request with no request of its own and adds its real cost", async () => {
    const t = setup();
    const b = t.spend.budget(voice);
    await b.open();
    const ticket = b.admit(1)!;
    const at: string[][] = [];
    const fetch = vi.fn(async () => { at.push(t.store.log()); return answer(0.02); });
    await client(t, voice, fetch as typeof globalThis.fetch).json(request, signal());
    expect(at).toEqual([["reserve"]]);
    b.release(ticket);
    expect(b.totals()).toMatchObject({ model: usdToMicros(0.02, t.config) });
    expect(t.store.log()).toEqual(["reserve"]);
  });

  it("adds a streamed request's cost when its stream ends", async () => {
    const t = setup();
    const b = t.spend.budget(voice);
    await b.open();
    await client(t, voice, vi.fn(async () => streamed(0.0123)) as typeof globalThis.fetch).json({ ...request, onText: () => {} }, signal());
    await vi.waitFor(() => expect(b.totals().model).toBe(usdToMicros(0.0123, t.config)));
    await b.stop();
    expect(t.blocks()).toMatchObject([{ settled: true, cost: usdToMicros(0.0123, t.config) }]);
  });

  it("keeps the safety read outside the block: never refused, off the child's week", async () => {
    const t = setup();
    const b = t.spend.budget(voice);
    await b.open();
    t.leave(0);
    const fetch = vi.fn(async () => answer(0.01));
    await client(t, voice, fetch as typeof globalThis.fetch, true).json(request, signal());
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(t.store.rows().filter((r) => r.charge === "global")).toMatchObject([{ what: "model", settled: true }]);
  });
});

describe("retiring a block", () => {
  it("opens the next block before 8 minutes and settles the old one once with its real total", async () => {
    const t = setup();
    const b = t.spend.budget(voice);
    await b.open();
    const fetch = vi.fn(async () => answer(0.05));
    for (let i = 0; i < 2; i++) await client(t, voice, fetch as typeof globalThis.fetch).json(request, signal());
    t.advance(BLOCK_RENEW_MS);
    b.tick();
    await t.flush();
    expect(t.blocks()).toHaveLength(2);
    t.advance(BLOCK_RETIRE_MS - BLOCK_RENEW_MS);
    b.tick();
    await t.flush();
    b.tick();
    await t.flush();
    const [old, next] = t.blocks();
    expect(old).toMatchObject({ settled: true, cost: 2 * usdToMicros(0.05, t.config) });
    expect(next).toMatchObject({ settled: false });
    expect(t.store.log().filter((x) => x === "settle")).toHaveLength(1);
    expect(BLOCK_RETIRE_MS).toBeLessThan(RESERVATION_TTL_MS);
  });

  it("leaves a block a crash did not settle counted until the 10-minute expiry", async () => {
    const t = setup();
    const b = t.spend.budget(voice);
    await b.open();
    expect(await t.week()).toBe(BLOCK_ATTEMPTS * t.m);
    // The process stops here: nothing settles the block.
    t.advance(RESERVATION_TTL_MS + 1);
    expect(await t.week()).toBe(0);
  });
});

describe("the call's end", () => {
  it("settles the open block with its real total and gives the rest back", async () => {
    const t = setup();
    const b = t.spend.budget(voice);
    await b.open();
    await client(t, voice, vi.fn(async () => answer(0.03)) as typeof globalThis.fetch).json(request, signal());
    expect(await t.week()).toBe(BLOCK_ATTEMPTS * t.m);
    await b.stop();
    expect(t.blocks()).toMatchObject([{ settled: true, cost: usdToMicros(0.03, t.config) }]);
    expect(await t.week()).toBe(usdToMicros(0.03, t.config));
    // After the end the block pays for nothing.
    expect(b.admit(1)).toBeNull();
  });
});

describe("two calls of one child", () => {
  it("cannot together pass the week: a chat sees the voice call's block as used", async () => {
    const t = setup();
    t.leave(BLOCK_ATTEMPTS * t.m + t.m - 1);
    const b = t.spend.budget(voice);
    await b.open();
    expect(t.blocks()).toMatchObject([{ reserved: BLOCK_ATTEMPTS * t.m }]);
    const fetch = vi.fn(async () => answer(0.01));
    await expect(client(t, chat, fetch as typeof globalThis.fetch).json(request, signal())).rejects.toBeInstanceOf(SpendRefused);
    expect(fetch).not.toHaveBeenCalled();
    expect(await t.week()).toBeLessThanOrEqual(WEEK_MICROS);
  });
});

describe("the seam the text session gets (agreed with the Maya lead)", () => {
  it("takes the turn's admitted attempt first, settles its cost and gives back one never sent", async () => {
    const t = setup();
    const b = t.spend.budget(voice);
    await b.open();
    const admitted = b.admit(1)!;
    const h = b.seam.take("model")!;
    expect(b.attempts()).toBe(BLOCK_ATTEMPTS - 1);
    b.seam.settle(h, 0.02);
    b.release(admitted);
    expect(b.totals()).toMatchObject({ model: usdToMicros(0.02, t.config) });
    // The real cost leaves 3 whole attempts of the block.
    expect(b.attempts()).toBe(BLOCK_ATTEMPTS - 1);
    const g = b.seam.take("model")!;
    b.seam.giveBack(g);
    expect(b.attempts()).toBe(BLOCK_ATTEMPTS - 1);
    expect(t.store.log()).toEqual(["reserve"]);
  });

  it("allows at most 3 speculative attempts a turn, never the last 2 live attempts, and keeps their kind", async () => {
    const t = setup();
    const b = t.spend.budget(voice);
    await b.open();
    b.newTurn();
    const s = [b.seam.take("speculative"), b.seam.take("speculative")];
    expect(s.every(Boolean)).toBe(true);
    expect(b.seam.take("model")).not.toBeNull();
    // 1 attempt is free: fewer than 2, so no speculation; the last live attempt is the child's.
    expect(b.attempts()).toBe(1);
    expect(b.seam.take("speculative")).toBeNull();
    expect(b.seam.take("model")).not.toBeNull();
    b.seam.settle(s[0]!, 0.01, { used: true });
    b.seam.settle(s[1]!, 0.01);
    expect(b.totals()).toMatchObject({ speculative: 2 * usdToMicros(0.01, t.config), speculativeUsed: usdToMicros(0.01, t.config) });
  });

  it("counts the speculative attempts per turn", async () => {
    const t = setup();
    const b = t.spend.budget(voice);
    await b.open();
    const takes = () => { const h = b.seam.take("speculative"); if (h) b.seam.giveBack(h); return h !== null; };
    b.newTurn();
    expect([takes(), takes(), takes(), takes()]).toEqual([true, true, true, false]);
    expect(SPECULATIVE_PER_TURN).toBe(3);
    b.newTurn();
    expect(takes()).toBe(true);
  });
});
