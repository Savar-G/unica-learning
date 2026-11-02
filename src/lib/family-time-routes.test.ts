import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const family = vi.hoisted(() => ({ postal: "V3S 1A1" as string | null, timeZone: null as string | null, province: "BC", at: Date.parse("2026-11-18T04:29:00Z") }));
vi.mock("@/lib/supabase-auth", () => ({
  parentId: async () => "p1",
  sessionClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "p1", email: "alex@example.com" } } }) },
    from: (table: string) => ({ select: (columns: string) => {
      const row = table === "parents" ? { postal: family.postal, time_zone: family.timeZone } : { province: family.province };
      const data = Object.fromEntries(Object.entries(row).filter(([key]) => columns.split(/,\s*/).includes(key)));
      const query = { order: () => query, limit: () => query, maybeSingle: async () => ({ data }) };
      return query;
    } }),
  }),
}));
vi.mock("@/lib/parent-pin-server", () => ({
  savePin: async () => ({ status: 429, result: { ok: false, error: "locked", retryAt: family.at } }),
  checkParentPin: async () => ({ ok: false, error: "locked", retryAt: family.at }),
  resetForgottenPin: async () => ({ status: 429, result: { ok: false, error: "locked", retryAt: family.at } }),
  serverPins: () => null,
}));
vi.mock("@/lib/desk-server", () => ({ closeDesk: vi.fn(), passwordProver: vi.fn() }));

const { POST: accountPin } = await import("@/app/api/account/pin/route");
const { POST: leaveDesk } = await import("@/app/api/desk/leave/route");
const { POST: forgotPin } = await import("@/app/api/desk/forgot-pin/route");

beforeEach(() => { family.timeZone = null; family.province = "BC"; family.at = Date.parse("2026-11-18T04:29:00Z"); });

describe.each([
  ["/api/account/pin", accountPin],
  ["/api/desk/leave", leaveDesk],
  ["/api/desk/forgot-pin", forgotPin],
] as const)("server-formatted retry times from %s", (path, post) => {
  it.each([
    ["V3S 1A1", "9:29 p.m."],
    ["M5V 2T6", "11:29 p.m."],
    [null, "9:29 p.m."],
    ["unknown", "9:29 p.m."],
  ])("uses the family's postal code %s", async (postal, clock) => {
    family.postal = postal;
    const response = await post(new Request(`http://localhost${path}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin: "1234", password: "test-password" }),
    }));
    expect(response.status).toBe(429);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body).toMatchObject({ ok: false, error: "locked", retryAt: family.at, retryTime: clock, retryWhen: `${clock} on Tuesday, November 17` });
    expect(body.retryWhen).not.toMatch(/\b(?:UTC|PST|PDT|EST|EDT|GMT)\b/);
  });

  it.each([
    ["America/Toronto", "V3S 1A1", "11:29 p.m."],
    ["Not/AZone", "T2P 1J9", "10:29 p.m."],
    [null, null, "10:29 p.m."],
  ])("uses the shared rule for browser %s and postal %s", async (timeZone, postal, clock) => {
    family.timeZone = timeZone;
    family.postal = postal;
    family.province = "AB";
    const response = await post(new Request(`http://localhost${path}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin: "1234", password: "test-password" }),
    }));
    expect(response.status).toBe(429);
    expect((await response.json()).retryTime).toBe(clock);
  });

  it("uses the offset at the retry time across daylight saving", async () => {
    family.postal = "M5V 2T6";
    const clocks = [];
    for (const iso of ["2026-03-08T06:30:00Z", "2026-03-08T07:30:00Z"]) {
      family.at = Date.parse(iso);
      const response = await post(new Request(`http://localhost${path}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin: "1234", password: "test-password" }),
      }));
      clocks.push((await response.json()).retryTime);
    }
    expect(clocks).toEqual(["1:30 a.m.", "3:30 a.m."]);
  });
});
