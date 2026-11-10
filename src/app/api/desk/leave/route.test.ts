import { beforeEach, describe, expect, it, vi } from "vitest";
import { parentPins } from "@/lib/parent-pin";
import { memoryPinStore } from "@/lib/parent-pin-memory";

// Leaving the desk with the PIN (#301), through the route's POST export: one of the ways out of the desk. A right PIN
// clears the desk cookie on this device; a wrong one, a locked PIN or a signed-out device keeps it.

const PARENT = "11111111-1111-4111-8111-111111111111";
const state = vi.hoisted(() => ({ parent: "11111111-1111-4111-8111-111111111111" as string | null }));
const pins = { current: parentPins(memoryPinStore()) };

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase-auth", () => ({ sessionClient: async () => ({}), parentId: async () => state.parent, adminClient: () => null }));
vi.mock("@/lib/parent-pin-server", () => ({ checkParentPin: (parent: string, pin: string) => pins.current.check(parent, pin) }));
vi.mock("@/lib/family-time-server", () => ({ familyRetryTime: async () => ({}) }));

const { POST } = await import("@/app/api/desk/leave/route");
const post = (body: unknown, type = "application/json") => POST(new Request("http://localhost/api/desk/leave", {
  method: "POST", headers: { "Content-Type": type }, body: JSON.stringify(body),
}));
const cleared = (res: Response) => /unica_desk=;/.test(res.headers.get("set-cookie") ?? "");

describe("POST /api/desk/leave", () => {
  beforeEach(async () => {
    state.parent = PARENT;
    pins.current = parentPins(memoryPinStore());
    await pins.current.set(PARENT, "4821");
  });

  it("closes the desk with the right PIN", async () => {
    const res = await post({ pin: "4821" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(cleared(res)).toBe(true);
  });

  it("keeps the desk on a wrong PIN, and counts the try", async () => {
    const res = await post({ pin: "0000" });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ ok: false, error: "wrong" });
    expect(cleared(res)).toBe(false);
  });

  it("keeps the desk once the PIN is locked, even for the right PIN", async () => {
    for (let i = 0; i < 5; i++) await post({ pin: "0000" });
    const res = await post({ pin: "4821" });
    expect(res.status).toBe(429);
    expect(cleared(res)).toBe(false);
  });

  it("keeps the desk for a signed-out device, a missing PIN and a form post", async () => {
    expect(cleared(await post({}))).toBe(false);
    expect((await post({ pin: "4821" }, "application/x-www-form-urlencoded")).status).toBe(415);
    state.parent = null;
    const res = await post({ pin: "4821" });
    expect(res.status).toBe(401);
    expect(cleared(res)).toBe(false);
  });
});
