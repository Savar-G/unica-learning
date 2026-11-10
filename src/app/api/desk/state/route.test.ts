import { beforeEach, describe, expect, it, vi } from "vitest";

// What the desk guard asks before it shows a parent page restored by the back button, or a parent tab that comes back
// into view (#301, src/lib/desk-guard.ts), through the route's GET export. The same rule as the proxy: open only for the
// signed-in parent's own desk, and kept closed to the account when the session cannot be read.

const PARENT = "11111111-1111-4111-8111-111111111111";
const OTHER_PARENT = "44444444-4444-4444-8444-444444444444";
const CHILD = "22222222-2222-4222-8222-222222222222";
const state = vi.hoisted(() => ({ cookie: undefined as string | undefined, sub: null as string | null, error: null as { name: string } | null }));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => (state.cookie ? { value: state.cookie } : undefined) }) }));
vi.mock("@/lib/supabase-auth", () => ({
  sessionClient: async () => ({ auth: { getClaims: async () => ({ data: state.sub ? { claims: { sub: state.sub } } : null, error: state.error }) } }),
}));

const { GET } = await import("@/app/api/desk/state/route");
const { lockCookie } = await import("@/lib/desk");
const open = async () => {
  const res = await GET();
  expect(res.headers.get("cache-control")).toBe("no-store");
  return ((await res.json()) as { open: boolean }).open;
};

describe("GET /api/desk/state", () => {
  beforeEach(() => { state.cookie = lockCookie(PARENT, CHILD); state.sub = PARENT; state.error = null; });

  it("says open for the signed-in parent's own desk", async () => {
    expect(await open()).toBe(true);
  });

  it("says closed once the desk cookie is gone (after the PIN or Forgot PIN)", async () => {
    state.cookie = undefined;
    expect(await open()).toBe(false);
  });

  it("says closed for another parent's desk cookie and for a signed-out device", async () => {
    state.sub = OTHER_PARENT;
    expect(await open()).toBe(false);
    state.sub = null;
    state.error = { name: "AuthSessionMissingError" };
    expect(await open()).toBe(false);
  });

  it("says open when the session cannot be read, so a restored page stays on the desk", async () => {
    state.sub = null;
    state.error = { name: "AuthRetryableFetchError" };
    expect(await open()).toBe(true);
  });
});
