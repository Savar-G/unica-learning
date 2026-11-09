import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => {} }) }));
vi.mock("./next-book-planner", () => ({
  nextBookPlanner: () => ({ plan: async () => ({ ok: false, reason: "unused" }) }),
  nextBookWiring: (planner: unknown) => ({ planner }),
}));
import { createClient } from "@supabase/supabase-js";
import { createNextBookStepServer } from "./next-book-step-server";
import { NEXT_BOOK_STEP_ANSWER_MS } from "./next-book-step";

// #476, #773: the step on the real service client. A candidate GET that never answers ends at the step's deadline,
// before endAt, and the client does not retry it after the abort (the SDK retries a failed GET after 1, 2 and 4 s).

const T0 = Date.parse("2026-11-08T18:00:00.000Z");
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

/** A fetch that never answers; it rejects only when its signal aborts, as fetch does. */
function stalledFetch() {
  const calls: string[] = [];
  const fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    calls.push(String(input));
    return new Promise<Response>((_, reject) => {
      const signal = init?.signal;
      if (signal?.aborted) return reject(signal.reason);
      signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
    });
  });
  return { fetch, calls };
}

async function runStalled(client?: Parameters<typeof createNextBookStepServer>[1]) {
  const step = createNextBookStepServer({ NEXT_BOOK_PREPARE_ENABLED: "families" }, client)!;
  const endAt = Date.now() + 55_000;
  let returnedAt = 0;
  const running = step.run({ now: () => Date.now(), endAt }).then(r => { returnedAt = Date.now(); return r; });
  await vi.advanceTimersByTimeAsync(55_000);
  const result = await running;
  return { result, returnedAt, endAt };
}

it("a stalled candidate read ends at the deadline with no retry, through adminClient's no-retry client", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"], now: T0 });
  vi.stubEnv("SUPABASE_SECRET_KEY", "synthetic-key");
  const f = stalledFetch();
  vi.stubGlobal("fetch", f.fetch);
  const { result, returnedAt, endAt } = await runStalled();
  expect(result).toMatchObject({ status: "ran", timedOut: true, prepared: 0, due: 0 });
  expect(returnedAt).toBe(endAt - NEXT_BOOK_STEP_ANSWER_MS);
  // Only the first candidate read was sent, and nothing was sent again after the abort.
  expect(f.calls).toHaveLength(1);
  expect(f.calls[0]).toContain("/rest/v1/next_book_snapshots");
  await vi.advanceTimersByTimeAsync(30_000);
  expect(f.calls).toHaveLength(1);
});

it("the same stall on a client that keeps the SDK's retries sends the read again: the setting matters", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"], now: T0 });
  const f = stalledFetch();
  const retrying = (signal: AbortSignal) => createClient("https://fixture.invalid", "synthetic-key", {
    auth: { persistSession: false },
    global: { fetch: (input, init) => f.fetch(input, { ...init, signal: AbortSignal.any([signal, ...(init?.signal ? [init.signal] : [])]) }) },
  });
  await runStalled(retrying as never);
  await vi.advanceTimersByTimeAsync(30_000);
  expect(f.calls.length).toBeGreaterThan(1);
});
