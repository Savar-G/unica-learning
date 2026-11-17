import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { readAiCostHistory } from "./ai-cost-history-store";
import { HISTORY_DATABASE, parseHistoryView } from "./ai-cost-history";
import { HISTORY_TEST_ID, historyViewFixture } from "./ai-cost-history.fixtures";
import type { AdminSession } from "./admin-store";
const admin = (token: string | null) => ({ db: { auth: { getSession: async () => ({ data: { session: token ? { access_token: token } : null }, error: null }) } } }) as AdminSession;
beforeEach(() => vi.clearAllMocks());
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it("uses only the verified admin session and fixed project, without period bounds", async () => {
  vi.stubEnv("SUPABASE_SECRET_KEY", "synthetic-unused-service"); vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://wrong.invalid");
  const fetch = vi.fn().mockImplementation(async () => Response.json(historyViewFixture())); vi.stubGlobal("fetch", fetch);
  expect(await readAiCostHistory(admin("synthetic-admin"), HISTORY_TEST_ID)).toEqual(historyViewFixture());
  const [url, options] = fetch.mock.calls[0];
  expect(url).toBe(`${HISTORY_DATABASE}/rest/v1/rpc/admin_ai_cost_history`);
  expect(options.headers.authorization).toBe("Bearer synthetic-admin");
  expect(JSON.parse(options.body)).toEqual({ p_export_id: HISTORY_TEST_ID }); expect(options.cache).toBe("no-store");
  expect(options.signal).toBeInstanceOf(AbortSignal);
});
it.each(["bad", "", [HISTORY_TEST_ID, HISTORY_TEST_ID]])("refuses invalid/ambiguous selection before a request", async (selected) => {
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  await expect(readAiCostHistory(admin("synthetic-admin"), selected)).rejects.toThrow("selection"); expect(fetch).not.toHaveBeenCalled();
});
it("rejects missing auth and private error responses without reading the body", async () => {
  const text = vi.fn(), json = vi.fn(); const fetch = vi.fn().mockResolvedValue({ ok: false, text, json }); vi.stubGlobal("fetch", fetch);
  await expect(readAiCostHistory(admin(null), undefined)).rejects.toThrow("unavailable"); expect(fetch).not.toHaveBeenCalled();
  await expect(readAiCostHistory(admin("synthetic-admin"), undefined)).rejects.toThrow("unavailable");
  expect(text).not.toHaveBeenCalled(); expect(json).not.toHaveBeenCalled();
});
it("does not replace a missing explicit export with the latest one", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(historyViewFixture())));
  await expect(readAiCostHistory(admin("synthetic-admin"), "00000000-0000-4000-8000-000000000099")).rejects.toThrow("unavailable");
});
it("preserves explicit missing, empty and unknown state without inventing zeros", () => {
  const base = { exports: [], omitted_exports: 0, selected: null };
  for (const selection of ["missing", "empty"]) expect(parseHistoryView({ ...base, selection }).selected).toBeNull();
  expect(() => parseHistoryView({ ...base, selection: "ok" })).toThrow();
  const f = historyViewFixture(); f.selected!.known_cost_usd = "999";
  expect(() => parseHistoryView(f)).toThrow();
});
it.each(["number", "count", "array", "difference"])("fails closed on malformed %s fields", (change) => {
  const f = historyViewFixture();
  if (change === "number") Object.assign(f.selected!, { known_cost_usd: 0.3 });
  if (change === "count") f.selected!.unknown_cost_count = 5;
  if (change === "array") Object.assign(f.selected!, { keys: null });
  if (change === "difference") f.selected!.difference_usd = "0";
  expect(() => parseHistoryView(f)).toThrow();
});
