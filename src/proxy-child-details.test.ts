import { NextRequest } from "next/server";
import { expect, it, vi } from "vitest";
import { proxy } from "./proxy";

// While the child's desk is open on this device, the Account tab's name and learning card routes stay closed (#555).
vi.mock("@/lib/scan-pages-access", () => ({ scanPagesAccess: async () => false }));
vi.mock("@supabase/ssr", () => ({ createServerClient: () => ({ auth: { getClaims: async () => ({ data: { claims: { sub: "00000000-0000-4000-8000-000000000001" } }, error: null }) } }) }));

const locked = (path: string, method = "POST") => new NextRequest(`https://unicalearning.com${path}`, { method, headers: { Cookie: "unica_desk=00000000-0000-4000-8000-000000000001.00000000-0000-4000-8000-000000000002" } });

it("answers 423 to a name change and a learning card save while the desk is open", async () => {
  for (const [path, method] of [["/api/account/children/00000000-0000-4000-8000-000000000002", "PATCH"], ["/api/account/learning", "POST"]]) {
    const response = await proxy(locked(path, method));
    expect(response.status, path).toBe(423);
    expect(await response.json()).toEqual({ ok: false, error: "desk_open" });
  }
});

it("sends the Account tab and the learning card page back to the desk", async () => {
  for (const path of ["/account/settings", "/account/learning/00000000-0000-4000-8000-000000000002"]) {
    const response = await proxy(locked(path, "GET"));
    expect(response.status, path).toBe(307);
    expect(response.headers.get("location")).toBe("https://unicalearning.com/tutor");
  }
});

it("lets the routes through when no desk is open", async () => {
  const response = await proxy(new NextRequest("https://unicalearning.com/api/account/children/00000000-0000-4000-8000-000000000002", { method: "PATCH" }));
  expect(response.headers.get("x-middleware-next")).toBe("1");
});
