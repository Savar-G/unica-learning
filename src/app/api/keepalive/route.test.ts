import { afterEach, beforeEach, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: () => ({ rpc: f.rpc }) }));
import { GET } from "./route";
const call = (authorization?: string) => GET(new Request("https://unica.test/api/keepalive", authorization ? { headers: { authorization } } : undefined));
beforeEach(() => { f.rpc.mockReset(); f.rpc.mockResolvedValue({ error: null }); });
afterEach(() => vi.unstubAllEnvs());
it("answers 503 and does not ping when CRON_SECRET is unset", async () => {
  vi.stubEnv("CRON_SECRET", "");
  expect((await call()).status).toBe(503);
  expect((await call("Bearer ")).status).toBe(503);
  expect(f.rpc).not.toHaveBeenCalled();
});
it("answers 401 for a missing or wrong header", async () => {
  vi.stubEnv("CRON_SECRET", "test-secret");
  expect((await call()).status).toBe(401);
  expect((await call("Bearer wrong-secret")).status).toBe(401);
  expect((await call("Bearer test-secre")).status).toBe(401);
  expect(f.rpc).not.toHaveBeenCalled();
});
it("pings with the secret Vercel's cron sends", async () => {
  vi.stubEnv("CRON_SECRET", "test-secret");
  const res = await call("Bearer test-secret");
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
  expect(f.rpc).toHaveBeenCalledWith("ping");
});
it("answers 502 when the ping fails", async () => {
  vi.stubEnv("CRON_SECRET", "test-secret");
  f.rpc.mockResolvedValue({ error: { message: "down" } });
  expect((await call("Bearer test-secret")).status).toBe(502);
});
