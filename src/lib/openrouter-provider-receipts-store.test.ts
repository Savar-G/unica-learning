import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { insertProviderReceipts, readProviderReceipts } from "./openrouter-provider-receipts-store";
import type { AdminSession } from "./admin-store";

beforeEach(() => vi.clearAllMocks());
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
const period = { from: new Date("2026-11-01T07:00:00Z"), to: new Date("2026-11-17T08:00:00Z") };
const admin = (token: string | null) => ({ db: { auth: { getSession: async () => ({ data: { session: token ? { access_token: token } : null }, error: null }) } } }) as AdminSession;

it("uses the service key only for the atomic ingestion RPC and propagates the deadline", async () => {
  vi.stubEnv("SUPABASE_SECRET_KEY", "local-service-only");
  const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 })); vi.stubGlobal("fetch", fetch);
  const signal = new AbortController().signal;
  await insertProviderReceipts([], signal);
  const [url, options] = fetch.mock.calls[0];
  expect(url).toMatch(/\/rest\/v1\/rpc\/ingest_openrouter_provider_receipts$/);
  expect(options.headers.authorization).toBe("Bearer local-service-only");
  expect(options.signal).toBe(signal); expect(JSON.parse(options.body)).toEqual({ p_rows: [] });
});
it("uses the admin's session for reads and fails missing access before a request", async () => {
  const fetch = vi.fn().mockResolvedValue(new Response("private database error", { status: 500 })); vi.stubGlobal("fetch", fetch);
  await expect(readProviderReceipts(admin(null), period)).rejects.toThrow("Provider receipts unavailable");
  expect(fetch).not.toHaveBeenCalled();
  await expect(readProviderReceipts(admin("local-admin-only"), period)).rejects.toThrow("Provider receipts unavailable");
  expect(fetch.mock.calls[0][1].headers.authorization).toBe("Bearer local-admin-only");
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ p_from: period.from.toISOString(), p_to: period.to.toISOString() });
});
it("does not read or print provider failure bodies", async () => {
  vi.stubEnv("SUPABASE_SECRET_KEY", "local-service-only");
  const text = vi.fn();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, text }));
  await expect(insertProviderReceipts([], new AbortController().signal)).rejects.toThrow("Provider receipts unavailable");
  expect(text).not.toHaveBeenCalled();
});
