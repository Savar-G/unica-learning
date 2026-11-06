import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { proxy } from "./proxy";

// #556: a family whose deletion is queued keeps no account page, account API or desk, even with an access token that the
// global sign-out could not take back before it expires.
const auth = vi.hoisted(() => ({
  sub: "00000000-0000-4000-8000-000000000001" as string | null, state: null as string | null, fail: false as boolean | "throw", rpc: vi.fn(),
  // The secret key's check, used only when the parent's own read fails. "nokey" is a server without SUPABASE_SECRET_KEY.
  service: { row: false, fail: false, nokey: false, read: vi.fn() },
}));
vi.mock("@/lib/scan-pages-access", () => ({ scanPagesAccess: async () => false }));
vi.mock("@supabase/ssr", () => ({ createServerClient: () => ({
  auth: { getClaims: async () => ({ data: auth.sub ? { claims: { sub: auth.sub } } : null, error: null }) },
  rpc: async (name: string) => {
    auth.rpc(name);
    if (auth.fail === "throw") throw new TypeError("fetch failed");
    return auth.fail ? { data: null, error: { code: "PGRST000" } } : { data: auth.state, error: null };
  },
}) }));
vi.mock("@/lib/supabase-auth", () => ({ adminClient: () => auth.service.nokey ? null : { from: (table: string) => {
  const filters: Record<string, string> = {};
  const query = {
    select: () => query,
    eq: (column: string, value: string) => { filters[column] = value; return query; },
    maybeSingle: async () => {
      auth.service.read(table, filters);
      return auth.service.fail ? { data: null, error: { code: "PGRST000" } } : { data: auth.service.row ? { reason: "request" } : null, error: null };
    },
  };
  return query;
} } }));

const get = (path: string) => proxy(new NextRequest(`https://unicalearning.com${path}`));
beforeEach(() => {
  auth.sub = "00000000-0000-4000-8000-000000000001"; auth.state = null; auth.fail = false; auth.rpc.mockReset();
  auth.service = { row: false, fail: false, nokey: false, read: vi.fn() };
});

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
  for (const path of ["/api/account/children", "/api/account/family/delete", "/api/account/family/delete/code", "/api/account/children/child/delete", "/api/account/children/child/delete/code", "/api/desk/open"]) {
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
it("makes one read for a working account: the secret key is not used when the parent's own read answers", async () => {
  await get("/account");
  await get("/api/account/children");
  expect(auth.rpc).toHaveBeenCalledTimes(2);
  expect(auth.service.read).not.toHaveBeenCalled();
});

// Review round 3: a queued family with an unexpired access token on another device must not get through when its own read fails.
describe("when the parent's own read fails", () => {
  let log: ReturnType<typeof vi.spyOn>;
  beforeEach(() => { log = vi.spyOn(console, "error").mockImplementation(() => {}); auth.fail = true; });
  afterEach(() => log.mockRestore());

  it.each([true, "throw"] as const)("checks with the secret key and refuses a queued family (%s)", async (fail) => {
    auth.fail = fail;
    auth.service.row = true;
    const page = await get("/account/workbooks");
    expect(page.status).toBe(307);
    expect(new URL(page.headers.get("location")!).pathname).toBe("/family-deleted");
    const api = await get("/api/account/workbooks/id/pdf");
    expect(api.status).toBe(410);
    expect(auth.service.read).toHaveBeenCalledWith("family_deletions", { parent_id: "00000000-0000-4000-8000-000000000001", reason: "request" });
  });
  it("lets a family with no request through when the secret key's check answers", async () => {
    expect((await get("/account")).headers.get("x-middleware-next")).toBe("1");
    expect(auth.service.read).toHaveBeenCalledTimes(1);
  });
  it.each(["fail", "nokey"] as const)("answers 503, not the account, when no check can answer (%s)", async (how) => {
    if (how === "fail") auth.service.fail = true;
    else auth.service.nokey = true;
    for (const path of ["/account", "/tutor/p/token"]) {
      const page = await get(path);
      expect(page.status).toBe(503);
      expect(page.headers.get("x-middleware-next")).toBeNull();
      expect(page.headers.get("cache-control")).toContain("no-store");
      expect(await page.text()).toContain("Please try again in a moment.");
    }
    for (const path of ["/api/account/workbooks/id/pdf", "/api/desk/open"]) {
      const api = await get(path);
      expect(api.status).toBe(503);
      expect(await api.json()).toEqual({ ok: false, error: "unavailable" });
    }
  });
});
