import { beforeEach, describe, expect, it, vi } from "vitest";
import { parentPins } from "@/lib/parent-pin";
import { memoryPinStore } from "@/lib/parent-pin-memory";

// Forgot PIN's route (#301), through its POST export (review R349-1). The reviewer's case: the parent signed in with
// the password moments ago, opened the desk and handed the device over; the child sends only a new PIN. The session's
// fresh password sign-in must not count: the request has to carry the password, which the server checks itself.

const PARENT = "11111111-1111-4111-8111-111111111111";
const pins = { current: parentPins(memoryPinStore()) };
const checked: string[] = [];

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase-auth", () => ({
  sessionClient: async () => ({
    auth: {
      // A session whose password sign-in is 30 seconds old.
      getUser: async () => ({ data: { user: { id: PARENT, email: "parent@example.com" } } }),
      getClaims: async () => ({ data: { claims: { sub: PARENT, amr: [{ method: "password", timestamp: Math.floor(Date.now() / 1000) - 30 }] } } }),
    },
  }),
  adminClient: () => null,
}));
vi.mock("@/lib/parent-pin-server", async (actual) => ({ ...(await actual<object>()), serverPins: () => pins.current }));
vi.mock("@/lib/desk-server", async (actual) => ({
  ...(await actual<object>()),
  passwordProver: () => async (password: string) => { checked.push(password); return password === "right-password" ? "ok" : "wrong"; },
}));

const { POST } = await import("@/app/api/desk/forgot-pin/route");
const post = (body: unknown) => POST(new Request("http://localhost/api/desk/forgot-pin", {
  method: "POST", headers: { "Content-Type": "application/json", cookie: `unica_desk=${PARENT}.x` }, body: JSON.stringify(body),
}));

describe("POST /api/desk/forgot-pin", () => {
  beforeEach(async () => {
    pins.current = parentPins(memoryPinStore());
    checked.length = 0;
    await pins.current.set(PARENT, "4821");
  });

  it("refuses a new PIN sent without the password, even right after a password sign-in, and keeps the desk", async () => {
    const res = await post({ pin: "1111" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "invalid" });
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(await pins.current.check(PARENT, "4821")).toEqual({ ok: true });
    expect(checked).toEqual([]);
  });

  it("refuses a wrong password and counts it", async () => {
    const res = await post({ password: "guess", pin: "1111" });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ ok: false, error: "wrong_password", attemptsLeft: 4 });
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("locks after five wrong passwords, even for the right one", async () => {
    for (let i = 0; i < 5; i++) await post({ password: `guess-${i}`, pin: "1111" });
    const res = await post({ password: "right-password", pin: "1111" });
    expect(res.status).toBe(429);
    expect(checked).toHaveLength(5);
    expect(await pins.current.check(PARENT, "4821")).toEqual({ ok: true });
  });

  it("resets the PIN with the right password and closes the desk", async () => {
    const res = await post({ password: "right-password", pin: "1111" });
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toMatch(/unica_desk=;/);
    expect(await pins.current.check(PARENT, "1111")).toEqual({ ok: true });
  });
});
