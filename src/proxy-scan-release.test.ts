import { NextRequest } from "next/server";
import { beforeEach, expect, it, vi } from "vitest";
import { proxy } from "./proxy";

const release = vi.hoisted(() => ({ allowed: false }));
// The secret key is read only when the deletion state read fails, which these tests never do.
vi.mock("@/lib/supabase-auth", () => ({ adminClient: () => null }));
vi.mock("@/lib/scan-pages-access", () => ({ scanPagesAccess: async () => release.allowed }));
vi.mock("@supabase/ssr", () => ({ createServerClient: () => ({ auth: { getClaims: async () => ({ data: { claims: { sub: "00000000-0000-4000-8000-000000000001" } }, error: null }) }, rpc: async () => ({ data: null, error: null }) }) }));

const lockedRequest = (path: string) => new NextRequest(`https://unicalearning.com${path}`, { headers: { Cookie: "unica_desk=00000000-0000-4000-8000-000000000001.00000000-0000-4000-8000-000000000002" } });
beforeEach(() => { release.allowed = false; });

it.each(["/account/scan", "/api/account/scans", "/api/account/scans/id", "/api/account/scans/id/image", "/api/account/scans/notice"])("lets a hidden scan route reach its own 404 check with a desk lock: %s", async (path) => {
  const response = await proxy(lockedRequest(path));
  expect(response.headers.get("x-middleware-next")).toBe("1");
  expect(response.headers.get("location")).toBeNull();
});

it.each(["/account/scan", "/api/account/scans/id/image"])("keeps the desk lock for permitted scanning: %s", async (path) => {
  release.allowed = true;
  const response = await proxy(lockedRequest(path));
  expect(response.status).toBe(path.startsWith("/api/") ? 423 : 307);
});

it.each(["/account", "/account/scanner", "/api/account/children", "/api/account/scans-other"])("keeps the desk lock for unrelated routes: %s", async (path) => {
  const response = await proxy(lockedRequest(path));
  expect(response.status).toBe(path.startsWith("/api/") ? 423 : 307);
});
