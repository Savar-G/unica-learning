import { beforeEach, expect, it, vi } from "vitest";
import { parentDashboard } from "@/lib/parent-dashboard-server";
import { parentSchedule } from "@/lib/parent-schedule-server";
import { listChildren } from "@/lib/parent-view";
import { childStage } from "@/lib/child-stage";

vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ parent: "p1" as string | null, open: true, fail: false, zone: "America/Vancouver" as string | null, cookie: "c2" as string | undefined, fenced: null as string | null, queued: false }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => (state.cookie ? { value: state.cookie } : undefined) }) }));
vi.mock("@/lib/parent-dashboard-access", () => ({ parentDashboardAccess: async () => state.open }));
vi.mock("@/lib/parent-pin-server", () => ({ pinIsSet: async () => true }));
vi.mock("@/lib/parent-schedule-server", () => ({ parentSchedule: vi.fn(async () => ({ kind: "waiting" })) }));
vi.mock("@/lib/parent-view-server", () => ({ parentViewReader: () => ({}) }));
vi.mock("@/lib/parent-view", () => ({ listChildren: vi.fn(async () => { if (state.fail) throw new Error("read failed"); return [{ id: "c1" }]; }) }));
vi.mock("@/lib/supabase-auth", () => ({
  adminClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.queued ? { reason: "request" } : null, error: null }) }) }) }) }) }),
  parentId: async () => state.parent,
  sessionClient: async () => ({ from: () => ({ select: () => ({ maybeSingle: async () => ({ data: { time_zone: state.zone, deletion_requested_at: state.fenced }, error: null }) }) }) }),
}));

beforeEach(() => { state.parent = "p1"; state.open = true; state.fail = false; state.zone = "America/Vancouver"; state.cookie = "c2"; state.fenced = null; state.queued = false; vi.spyOn(console, "error").mockImplementation(() => {}); });

it("gives a family the switch opens to its children, the remembered id and the time zone fact", async () => {
  expect(await parentDashboard()).toEqual({ children: [{ id: "c1" }], remembered: "c2", pinSet: true, timeZoneSaved: true, deletionRequested: false });
  state.zone = null;
  state.cookie = undefined;
  expect(await parentDashboard()).toMatchObject({ remembered: null, timeZoneSaved: false });
});

it("marks a family whose deletion request is queued, and not a family only frozen by the retention check", async () => {
  state.fenced = "2026-11-05T00:00:00Z";
  state.queued = true;
  expect(await parentDashboard()).toMatchObject({ deletionRequested: true });
  state.queued = false;
  expect(await parentDashboard()).toMatchObject({ deletionRequested: false });
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

it("adds Schedule only for a bound printed book and keeps shipment and stage unchanged", async () => {
  const child = { id: "c1", firstName: "Leah", schoolGrade: 3 as const, currentWorkbook: null, reportIds: [], finishedTests: [],
    ...childStage({ test: { state: "none" }, cardSaved: true, delivered: false, plan: "not_started" }, { progress: false, maya: false, scanPages: false }) };
  vi.mocked(listChildren).mockResolvedValueOnce([child]);
  vi.mocked(parentSchedule).mockResolvedValueOnce({ kind: "ready", child: { id: "c1", firstName: "Leah", parentId: "p1" }, book: { id: "b1", number: 1 }, rows: [], dailyTime: "20 minutes" });
  const shown = (await parentDashboard())!.children[0];
  expect(shown.tabs).toEqual(["overview", "workbooks", "schedule", "assessment", "account"]);
  expect(shown.stage).toBe("first_book_coming"); expect(shown.currentWorkbook).toBeNull();
  vi.mocked(listChildren).mockResolvedValueOnce([child]);
  expect((await parentDashboard())!.children[0].tabs).not.toContain("schedule");
});
