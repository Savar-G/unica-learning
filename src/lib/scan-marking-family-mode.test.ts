import { createClient } from "@supabase/supabase-js";
import { beforeEach, expect, it, vi } from "vitest";
import type { Database } from "@/lib/database";
import { markingAccess, markingDecision, processScanMarking, recoverScanMarking, scanMarkingServerReadiness, type ChildPlanAccess, type ChildPlanReason } from "./scan-marking-server";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase-auth", () => ({ adminClient: () => null }));
vi.mock("@/lib/child-profile", () => ({ rebuildChildProfile: async () => ({ built: false, reason: "nothing_to_build" }) }));

// A real family with two children: only `running` has a plan that is running.
const parent = "11111111-1111-4111-8111-111111111111", otherParent = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const running = "22222222-2222-4222-8222-222222222222", stopped = "33333333-3333-4333-8333-333333333333";
const photos: Record<string, string> = {
  "44444444-4444-4444-8444-444444444444": running,
  "55555555-5555-4555-8555-555555555555": stopped,
};
const [runningPhoto, stoppedPhoto] = Object.keys(photos);
const missingPhoto = "66666666-6666-4666-8666-666666666666";
const families = { SCAN_MARKING_ENABLED: "families" };

const state = { test: false, admin: false, photoFails: false, queries: [] as string[], recovered: [] as { parent: string; photo: string }[], commands: [] as string[] };
const db = createClient<Database>("https://marking-families.example.test", "synthetic-service-key", {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: async (input, init) => {
    const url = new URL(String(input)); state.queries.push(url.pathname);
    if (url.pathname.endsWith("/test_accounts")) return Response.json(state.test ? [{ parent_id: parent }] : []);
    if (url.pathname.endsWith("/admin_users")) return Response.json(state.admin ? [{ user_id: parent }] : []);
    if (url.pathname.endsWith("/scan_photos")) {
      if (state.photoFails) return Response.json({ message: "read failed" }, { status: 503 });
      const id = url.searchParams.get("id")?.replace(/^eq\./, "") ?? "", owner = url.searchParams.get("parent_id")?.replace(/^eq\./, "");
      return Response.json(owner === parent && photos[id] ? [{ child_id: photos[id] }] : []);
    }
    if (url.pathname.endsWith("/rpc/recover_scan_marking")) return Response.json(state.recovered);
    if (url.pathname.endsWith("/rpc/scan_marking_command")) {
      const body = JSON.parse(String(init?.body)); state.commands.push(body.p_action);
      if (body.p_action === "outbox") return Response.json([]);
      return Response.json(null);
    }
    throw Error(`Unexpected request, including any image or paid dispatch: ${url.pathname}`);
  } },
});

const plans: Record<string, { open: boolean; reason: ChildPlanReason }> = {};
const asked: { parentId: string; childId: string }[] = [];
const gate: ChildPlanAccess = async (input) => {
  asked.push(input);
  return input.parentId === parent && plans[input.childId] ? plans[input.childId] : { open: false, reason: "no_plan" };
};

beforeEach(() => {
  Object.assign(state, { test: false, admin: false, photoFails: false, queries: [], recovered: [], commands: [] });
  for (const key of Object.keys(plans)) delete plans[key];
  plans[running] = { open: true, reason: "open" };
  plans[stopped] = { open: false, reason: "ended" };
  asked.length = 0;
});

it.each([{ open: true, reason: "open" }, { open: true, reason: "ending_until_end" }] as const)("families mode admits a real family whose child's plan is running (%j)", async (plan) => {
  plans[running] = plan;
  expect(await markingAccess(db, parent, families, { child: running }, gate)).toBe(true);
  expect(await markingAccess(db, parent, families, { photo: runningPhoto }, gate)).toBe(true);
  expect(asked).toEqual([{ parentId: parent, childId: running }, { parentId: parent, childId: running }]);
  expect(await markingDecision(db, parent, families, { child: running }, gate)).toEqual({ open: true, reason: plan.reason });
});

it.each(["no_plan", "ended", "payment_failed", "paused", "unknown", "read_failed"] as const)("families mode closes for %s", async (reason) => {
  plans[running] = { open: false, reason };
  expect(await markingAccess(db, parent, families, { child: running }, gate)).toBe(false);
  expect(await markingAccess(db, parent, families, { photo: runningPhoto }, gate)).toBe(false);
  expect(await markingDecision(db, parent, families, { child: running }, gate)).toEqual({ open: false, reason });
});

it.each([
  ["an open flag with a closed reason", { open: true, reason: "ended" }],
  ["a closed flag with an open reason", { open: false, reason: "open" }],
  ["an unknown reason", { open: true, reason: "maybe" }],
  ["no answer", undefined],
  ["a non-object answer", "open"],
])("families mode closes for %s", async (_label, answer) => {
  const odd: ChildPlanAccess = async () => answer as never;
  expect(await markingAccess(db, parent, families, { child: running }, odd)).toBe(false);
  expect((await markingDecision(db, parent, families, { child: running }, odd)).open).toBe(false);
});

it("families mode closes when the plan gate throws, and reports read_failed", async () => {
  const broken: ChildPlanAccess = async () => { throw Error("private provider detail"); };
  expect(await markingDecision(db, parent, families, { child: running }, broken)).toEqual({ open: false, reason: "read_failed" });
});

it("a family with two children opens marking only for the child with a running plan", async () => {
  expect(await markingAccess(db, parent, families, { child: running }, gate)).toBe(true);
  expect(await markingAccess(db, parent, families, { child: stopped }, gate)).toBe(false);
  expect(await markingAccess(db, parent, families, { photo: runningPhoto }, gate)).toBe(true);
  expect(await markingAccess(db, parent, families, { photo: stoppedPhoto }, gate)).toBe(false);
  expect(await processScanMarking(db, parent, stoppedPhoto, families, gate)).toBe("off");
  expect(state.commands).toEqual([]);
});

it("another family's child or photo stays closed", async () => {
  expect(await markingAccess(db, otherParent, families, { child: running }, gate)).toBe(false);
  expect(await markingAccess(db, otherParent, families, { photo: runningPhoto }, gate)).toBe(false);
  expect(asked).toEqual([{ parentId: otherParent, childId: running }]);
});

it("a real family is closed when the photo's child cannot be resolved, without asking the plan gate", async () => {
  expect(await markingDecision(db, parent, families, { photo: missingPhoto }, gate)).toEqual({ open: false, reason: "child_unknown" });
  state.photoFails = true;
  expect(await markingDecision(db, parent, families, { photo: runningPhoto }, gate)).toEqual({ open: false, reason: "child_unknown" });
  expect(await markingDecision(db, parent, families, { child: "not-a-uuid" }, gate)).toEqual({ open: false, reason: "child_unknown" });
  expect(asked).toEqual([]);
});

it("a real family is closed when no child is named", async () => {
  expect(await markingDecision(db, parent, families, undefined, gate)).toEqual({ open: false, reason: "child_unknown" });
  expect(asked).toEqual([]);
});

it("the default plan gate stays closed until the dashboard's plan access exists", async () => {
  expect(await markingDecision(db, parent, families, { child: running })).toEqual({ open: false, reason: "unknown" });
});

it.each(["test", "admin"] as const)("families mode keeps %s access without a plan", async (role) => {
  state[role] = true;
  plans[running] = { open: false, reason: "no_plan" };
  expect(await markingDecision(db, parent, families, undefined, gate)).toEqual({ open: true, reason: "test_family" });
  expect(await markingAccess(db, parent, families, { child: running }, gate)).toBe(true);
  expect(asked).toEqual([]);
});

it("families mode keeps the test parent list for test families but not for real families", async () => {
  state.test = true;
  const env = { ...families, SCAN_MARKING_TEST_PARENT_IDS: otherParent };
  plans[running] = { open: false, reason: "no_plan" };
  expect(await markingAccess(db, parent, env, { child: running }, gate)).toBe(false);
  plans[running] = { open: true, reason: "open" };
  expect(await markingAccess(db, parent, env, { child: running }, gate)).toBe(true);
});

it("families mode with a malformed test parent list closes for everyone", async () => {
  state.test = true;
  expect(await markingAccess(db, parent, { ...families, SCAN_MARKING_TEST_PARENT_IDS: "broken" }, { child: running }, gate)).toBe(false);
  expect(state.queries).toEqual([]); expect(asked).toEqual([]);
});

it("test-only mode is unchanged: a running plan does not admit a real family", async () => {
  const env = { SCAN_MARKING_ENABLED: "test-only" };
  expect(await markingAccess(db, parent, env, { child: running }, gate)).toBe(false);
  expect(await markingAccess(db, parent, env, { photo: runningPhoto }, gate)).toBe(false);
  expect(await processScanMarking(db, parent, runningPhoto, env, gate)).toBe("off");
  state.test = true;
  expect(await markingAccess(db, parent, env, { child: stopped }, gate)).toBe(true);
  expect(asked).toEqual([]);
});

it.each([undefined, "", "off", "on", "Families", "families "])("mode %s stays off for every family, with no read", async (flag) => {
  state.test = true;
  const env = { SCAN_MARKING_ENABLED: flag };
  expect(await markingAccess(db, parent, env, { child: running }, gate)).toBe(false);
  expect(await processScanMarking(db, parent, runningPhoto, env, gate)).toBe("off");
  expect(await recoverScanMarking(db, env, gate)).toEqual({ status: "off" });
  expect(state.queries).toEqual([]); expect(asked).toEqual([]);
});

it("families mode recovers sent photos only for a child whose plan is running", async () => {
  state.recovered = [{ parent, photo: stoppedPhoto }];
  expect(await recoverScanMarking(db, families, gate)).toEqual({ status: "processed", results: ["off"] });
  expect(state.commands).toEqual([]);
  expect(asked).toEqual([{ parentId: parent, childId: stopped }]);
});

it("readiness reports the families mode and keeps the evidence hold", () => {
  const release = scanMarkingServerReadiness(families, "2026-11-07T20:00:00.000Z");
  expect(release.mode).toBe("families");
  expect(release.familyReady).toBe(false);
});
