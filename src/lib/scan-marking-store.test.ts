import { createClient } from "@supabase/supabase-js";
import { afterEach, expect, it, vi } from "vitest";
import type { Database } from "@/lib/database";
import type { MarkingFailure } from "@/lib/scan-marking";
import { scanMarkingStore } from "./scan-marking-store";

vi.mock("server-only", () => ({}));

// #868: the store's settle and defer read the answers of `scan_marking_command`. The fake answers what the test sets.
const answers: unknown[] = [], calls: { action: string; data: Record<string, unknown> }[] = [];
const db = createClient<Database>("https://marking-store.example.test", "synthetic-service-key", {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: async (input, init) => {
    const url = new URL(String(input));
    if (!url.pathname.endsWith("/rpc/scan_marking_command")) throw Error(`Unexpected request: ${url.pathname}`);
    const body = JSON.parse(String(init?.body));
    calls.push({ action: body.p_action, data: body.p_data });
    return Response.json(answers.shift() ?? null);
  } },
});
const ref = { parent: "11111111-1111-4111-8111-111111111111", photo: "44444444-4444-4444-8444-444444444444" };
const rateLimit: MarkingFailure = { kind: "rate-limit", retryAfterMs: 1_000, evidence: { status: 429, body: '{"error":{"code":429,"message":"Rate limit exceeded"}}' } };
afterEach(() => { answers.length = 0; calls.length = 0; vi.restoreAllMocks(); });

it("settle is true only when the database answered that it recorded the dispatch as a clean 429", async () => {
  const store = scanMarkingStore(db);
  answers.push("clean");
  expect(await store.settle("d1", null, rateLimit)).toBe(true);
  expect(calls[0].data).toMatchObject({ cost: null, failure: "rate-limit", status: 429, body: rateLimit.evidence.body });
  // The database kept the full hold (it did not accept the body): the dispatch counts.
  answers.push(true);
  expect(await store.settle("d2", null, rateLimit)).toBe(false);
  // A cost is never sent as clean, and an unknown failure sends nothing but the cost.
  answers.push(true, true);
  expect(await store.settle("d3", 2_000, rateLimit)).toBe(false);
  expect(await store.settle("d4", null, null)).toBe(false);
  expect(calls[2].data).toEqual({ cost: 2_000 }); expect(calls[3].data).toEqual({ cost: null });
  answers.push(false);
  await expect(store.settle("d5", null, rateLimit)).rejects.toThrow("marking_cost_reconciliation");
});

it("defer passes on the database's answer and throws (and logs) on any other answer, so the run pauses the job", async () => {
  const store = scanMarkingStore(db), log = vi.spyOn(console, "error").mockImplementation(() => {});
  for (const answer of ["pending", "attempts", "terminal"] as const) { answers.push(answer); expect(await store.defer(ref, "token")).toBe(answer); }
  for (const answer of [null, "finished", true, { status: "pending" }]) {
    answers.push(answer);
    await expect(store.defer(ref, "token")).rejects.toThrow("marking_defer");
  }
  expect(log).toHaveBeenCalledTimes(4);
  // Counts only: no family, photo or token in the log.
  expect(JSON.stringify(log.mock.calls)).not.toContain(ref.photo);
});
