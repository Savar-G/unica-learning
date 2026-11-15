import { createClient } from "@supabase/supabase-js";
import { expect, it, vi } from "vitest";
import type { Database } from "@/lib/database";
import { EXPLANATION_MODEL } from "@/lib/parent-problem-explanation";
import { reverifyParentExplanationPrice } from "@/lib/parent-explanation-price-server";
vi.mock("server-only", () => ({}));
const now = Date.parse("2026-11-15T19:00:00Z");
const pricing = { prompt: "0.0000001", completion: "0.0000005" };
const provider = { provider_name: "Anthropic", tag: "anthropic", pricing, context_length: 1000000, max_completion_tokens: 768,
  supported_parameters: ["reasoning", "max_tokens", "response_format", "structured_outputs"] };
function setup(price = { enabled: true, verified_at: new Date(now - 86400000).toISOString(), last_checked_at: null as string | null }) {
  const writes: unknown[] = [];
  const db = createClient<Database>("https://synthetic.supabase.co", "synthetic", { global: { fetch: async (url, init) => {
    if (String(url).includes("/rpc/")) { writes.push(JSON.parse(String(init?.body))); return Response.json("verified"); }
    return Response.json(price);
  } } });
  const fetch = vi.fn<typeof globalThis.fetch>(async url => Response.json(String(url).endsWith("/endpoints")
    ? { data: { id: EXPLANATION_MODEL, endpoints: [provider] } } : { data: [{ id: EXPLANATION_MODEL, pricing }] }));
  return { db, fetch, writes };
}
it("does only two unauthenticated public GETs and writes observed metadata through the service RPC", async () => {
  const fixture = setup();
  expect(await reverifyParentExplanationPrice(fixture.db, { now, fetch: fixture.fetch })).toBe("verified");
  expect(fixture.fetch).toHaveBeenCalledTimes(2);
  for (const [url, init] of fixture.fetch.mock.calls) {
    expect(String(url)).toMatch(/^https:\/\/openrouter.ai\/api\/v1\/models/);
    expect(init?.headers).toBeUndefined(); expect(init?.body).toBeUndefined(); expect(init?.signal).toBeInstanceOf(AbortSignal);
  }
  expect(fixture.writes).toEqual([{ p_metadata: expect.objectContaining({ provider: "anthropic", providerPricing: pricing }), p_error: "" }]);
});
it.each(["disabled", "fresh"])("%s never reads public prices or writes a verification", async state => {
  const fixture = setup({ enabled: state !== "disabled", verified_at: new Date(now - 1000).toISOString(), last_checked_at: null });
  expect(await reverifyParentExplanationPrice(fixture.db, { now, fetch: fixture.fetch })).toBe(state === "disabled" ? "disabled" : "not_due");
  expect(fixture.fetch).not.toHaveBeenCalled(); expect(fixture.writes).toHaveLength(0);
});
it.each(["http", "network", "json", "metadata"])("records a %s failure without refreshing locally or making a paid call", async failure => {
  const fixture = setup();
  fixture.fetch.mockImplementation(async () => {
    if (failure === "network") throw new Error("private diagnostic");
    if (failure === "http") return new Response("", { status: 503 });
    if (failure === "json") return new Response("invalid");
    return Response.json({});
  });
  await reverifyParentExplanationPrice(fixture.db, { now, fetch: fixture.fetch });
  expect(fixture.writes).toEqual([{ p_metadata: null, p_error: failure === "metadata" ? "incompatible_metadata" : "public_price_read_failed" }]);
});
