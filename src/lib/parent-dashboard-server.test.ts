import { beforeEach, expect, it, vi } from "vitest";
import { parentDashboard } from "@/lib/parent-dashboard-server";

vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ parent: "p1" as string | null, open: true, fail: false, zone: "America/Vancouver" as string | null, cookie: "c2" as string | undefined }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => (state.cookie ? { value: state.cookie } : undefined) }) }));
vi.mock("@/lib/parent-dashboard-access", () => ({ parentDashboardAccess: async () => state.open }));
vi.mock("@/lib/parent-pin-server", () => ({ pinIsSet: async () => true }));
vi.mock("@/lib/parent-view-server", () => ({ parentViewReader: () => ({}) }));
vi.mock("@/lib/parent-view", () => ({ listChildren: async () => { if (state.fail) throw new Error("read failed"); return [{ id: "c1" }]; } }));
vi.mock("@/lib/supabase-auth", () => ({
  adminClient: () => null,
  parentId: async () => state.parent,
  sessionClient: async () => ({ from: () => ({ select: () => ({ maybeSingle: async () => ({ data: { time_zone: state.zone }, error: null }) }) }) }),
}));

beforeEach(() => { state.parent = "p1"; state.open = true; state.fail = false; state.zone = "America/Vancouver"; state.cookie = "c2"; vi.spyOn(console, "error").mockImplementation(() => {}); });

it("gives a family the switch opens to its children, the remembered id and the time zone fact", async () => {
  expect(await parentDashboard()).toEqual({ children: [{ id: "c1" }], remembered: "c2", pinSet: true, timeZoneSaved: true });
  state.zone = null;
  state.cookie = undefined;
  expect(await parentDashboard()).toMatchObject({ remembered: null, timeZoneSaved: false });
});

it("gives today's Parent home to a family the switch does not open to, to no one signed in, and on a failed read", async () => {
  state.open = false;
  expect(await parentDashboard()).toBeNull();
  state.open = true;
  state.parent = null;
  expect(await parentDashboard()).toBeNull();
  state.parent = "p1";
  state.fail = true;
  expect(await parentDashboard()).toBeNull();
});
