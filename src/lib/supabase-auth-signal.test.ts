import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: vi.fn() }) }));
vi.mock("@/lib/supabase-public", () => ({ SUPABASE_URL: "https://synthetic.invalid", SUPABASE_PUBLISHABLE_KEY: "synthetic-key" }));
import { sessionClient } from "@/lib/supabase-auth";
afterEach(() => vi.unstubAllGlobals());

describe("bounded visitor session requests through the real Supabase client", () => {
  it("uses the same caller deadline for Auth and the data read without a service credential", async () => {
    const requests: { url: string; signal: AbortSignal | null | undefined; authorization: string | null }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input); requests.push({ url, signal: init?.signal, authorization: new Headers(init?.headers).get("authorization") });
      if (url.includes("/auth/v1/user")) return Response.json({ id: "00000000-0000-4000-8000-000000000001", aud: "authenticated", app_metadata: {}, user_metadata: {} });
      return new Promise<Response>((_resolve, reject) => {
        if (init?.signal?.aborted) reject(init.signal.reason);
        else init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
      });
    }));
    const stop = new AbortController(), db = await sessionClient(stop.signal);
    expect((await db.auth.getUser("synthetic-user-token")).error).toBeNull();
    const pending = db.from("workbook_runs").select("id").limit(1).then(r => r);
    await vi.waitFor(() => expect(requests).toHaveLength(2));
    stop.abort(new DOMException("deadline", "AbortError"));
    expect((await pending).error).not.toBeNull();
    expect(requests.every(r => r.signal?.aborted)).toBe(true);
    expect(requests[0].authorization).toBe("Bearer synthetic-user-token");
    expect(requests[1].authorization).toBe("Bearer synthetic-key");
  });
  it("preserves a query's own cancellation signal", async () => {
    let used: AbortSignal | null | undefined;
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      used = init?.signal;
      return new Promise<Response>((_resolve, reject) => used?.addEventListener("abort", () => reject(used?.reason), { once: true }));
    }));
    const deadline = new AbortController(), query = new AbortController(), db = await sessionClient(deadline.signal);
    const pending = db.from("workbook_runs").select("id").abortSignal(query.signal).then(r => r);
    await vi.waitFor(() => expect(used).toBeDefined()); query.abort(new DOMException("query cancelled", "AbortError"));
    expect((await pending).error).not.toBeNull(); expect(used?.aborted).toBe(true); expect(deadline.signal.aborted).toBe(false);
  });
  it("keeps ordinary callers working without a supplied deadline", async () => {
    const fetch = vi.fn(async () => Response.json([])); vi.stubGlobal("fetch", fetch);
    const db = await sessionClient(), result = await db.from("workbook_runs").select("id").limit(1);
    expect(result.error).toBeNull(); expect(result.data).toEqual([]); expect(fetch).toHaveBeenCalledTimes(1);
  });
});
