import { NextRequest } from "next/server";
import { beforeEach, expect, it, vi } from "vitest";
import { proxy } from "./proxy";

// #556: a family whose deletion is queued keeps no account page, account API or desk, even with an access token that the
// global sign-out could not take back before it expires.
const auth = vi.hoisted(() => ({ sub: "00000000-0000-4000-8000-000000000001" as string | null, state: null as string | null, fail: false, rpc: vi.fn() }));
vi.mock("@/lib/scan-pages-access", () => ({ scanPagesAccess: async () => false }));
vi.mock("@supabase/ssr", () => ({ createServerClient: () => ({
  auth: { getClaims: async () => ({ data: auth.sub ? { claims: { sub: auth.sub } } : null, error: null }) },
  rpc: async (name: string) => { auth.rpc(name); return auth.fail ? { data: null, error: { code: "PGRST000" } } : { data: auth.state, error: null }; },
}) }));

const get = (path: string) => proxy(new NextRequest(`https://unicalearning.com${path}`));
beforeEach(() => { auth.sub = "00000000-0000-4000-8000-000000000001"; auth.state = null; auth.fail = false; auth.rpc.mockReset(); });

it.each(["queued", "plans_stopped"])("sends a queued family's account pages and desk to the confirmation (%s)", async (state) => {
  auth.state = state;
  for (const path of ["/account", "/account/settings", "/tutor", "/tutor/p/token"]) {
    const response = await get(path);
    expect(response.status).toBe(307);
    expect(new URL(response.headers.get("location")!).pathname).toBe("/family-deleted");
  }
  expect(auth.rpc).toHaveBeenCalledWith("my_family_deletion_state");
});
it("refuses a queued family's account and desk APIs with 410", async () => {
  auth.state = "queued";
  for (const path of ["/api/account/children", "/api/account/family/delete", "/api/desk/open"]) {
    const response = await get(path);
    expect(response.status).toBe(410);
    expect(await response.json()).toEqual({ ok: false, error: "family_deleted" });
  }
});
it("lets a family with no request through, and reads nothing for a signed-out visitor or the admin paths", async () => {
  expect((await get("/account")).headers.get("x-middleware-next")).toBe("1");
  expect((await get("/admin")).headers.get("x-middleware-next")).toBe("1");
  auth.sub = null;
  auth.rpc.mockReset();
  await get("/account");
  expect(auth.rpc).not.toHaveBeenCalled();
});
it("lets the request through when the read fails, so a working account never locks on a failed read", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  auth.fail = true;
  expect((await get("/account")).headers.get("x-middleware-next")).toBe("1");
  log.mockRestore();
});
