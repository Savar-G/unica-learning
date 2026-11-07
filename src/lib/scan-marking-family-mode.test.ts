import { createClient } from "@supabase/supabase-js";
import { beforeEach, expect, it, vi } from "vitest";
import type { Database } from "@/lib/database";
import { scanChecksAccess, scanChecksDecision } from "./scan-marking-access";
import { markingAccess, markingDecision, processScanMarking, recoverScanMarking, scanMarkingServerReadiness, type ChildPlanAccess, type ChildPlanReason } from "./scan-marking-server";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase-auth", () => ({ adminClient: () => null }));
const profile = vi.hoisted(() => ({ calls: 0 }));
vi.mock("@/lib/child-profile", () => ({ rebuildChildProfile: async () => { profile.calls++; return { built: false, reason: "nothing_to_build" }; } }));

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

const state = { test: false, admin: false, photoFails: false, queries: [] as string[], commands: [] as string[], recoverCalls: 0,
  // Each recovery call returns the next batch; an empty batch ends the pass. `recoverAlways` repeats one batch forever.
  recovered: [] as { parent: string; photo: string }[][], recoverAlways: null as { parent: string; photo: string }[] | null };
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
    if (url.pathname.endsWith("/children")) {
      const id = url.searchParams.get("id")?.replace(/^eq\./, ""), owner = url.searchParams.get("parent_id")?.replace(/^eq\./, "");
      return Response.json(owner === parent && (id === running || id === stopped) ? [{ id }] : []);
    }
    if (url.pathname.endsWith("/rpc/recover_scan_marking")) { state.recoverCalls++; return Response.json(state.recoverAlways ?? state.recovered.shift() ?? []); }
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
  Object.assign(state, { test: false, admin: false, photoFails: false, queries: [], recovered: [], recoverAlways: null, recoverCalls: 0, commands: [] });
  profile.calls = 0;
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
  // Only publication of marks already committed; no new marking for the stopped child.
  expect(state.commands).toEqual(["outbox"]);
});

it("another family's child or photo stays closed", async () => {
  expect(await markingAccess(db, otherParent, families, { child: running }, gate)).toBe(false);
  expect(await markingAccess(db, otherParent, families, { photo: runningPhoto }, gate)).toBe(false);
  // The child is checked against the signed-in parent here, before the plan gate is asked.
  expect(asked).toEqual([]);
  expect(await markingDecision(db, otherParent, families, { child: running }, gate)).toEqual({ open: false, reason: "child_unknown" });
  expect(await scanChecksDecision(db, otherParent, families, { child: running }, gate)).toEqual({ open: false, reason: "child_unknown" });
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

it("the default plan gate is the dashboard's shared childPlanAccess (#705)", async () => {
  const shared = await import("@/lib/plan-access");
  const access = await import("./scan-marking-access");
  expect(access.childPlanAccess).toBe(shared.childPlanAccess);
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
  state.recovered = [[{ parent, photo: stoppedPhoto }]];
  expect(await recoverScanMarking(db, families, gate)).toEqual({ status: "processed", results: ["off"] });
  // Only publication of committed marks: no claim, no paid call.
  expect(state.commands).toEqual(["outbox"]);
  expect(asked).toEqual([{ parentId: parent, childId: stopped }]);
});

it("a closed plan still publishes marks already committed for the photo, with no new marking", async () => {
  expect(await processScanMarking(db, parent, stoppedPhoto, families, gate)).toBe("off");
  expect(state.commands).toEqual(["outbox"]);
  expect(profile.calls).toBe(1);
});

it("a closed plan publishes nothing for a photo that is not this family's", async () => {
  expect(await processScanMarking(db, otherParent, stoppedPhoto, families, gate)).toBe("off");
  expect(await processScanMarking(db, parent, missingPhoto, families, gate)).toBe("off");
  expect(state.commands).toEqual([]); expect(profile.calls).toBe(0);
});

it("test-only mode publishes nothing for a refused family, as before", async () => {
  expect(await processScanMarking(db, parent, stoppedPhoto, { SCAN_MARKING_ENABLED: "test-only" }, gate)).toBe("off");
  expect(state.commands).toEqual([]); expect(profile.calls).toBe(0);
});

it("recovery moves past refused photos in the same run, so they do not hold up other families", async () => {
  state.recovered = [[{ parent, photo: stoppedPhoto }], [{ parent: otherParent, photo: stoppedPhoto }], [{ parent, photo: missingPhoto }]];
  state.test = false;
  const result = await recoverScanMarking(db, families, gate);
  expect(result).toEqual({ status: "processed", results: ["off", "off", "off"] });
  expect(state.recoverCalls).toBe(4);
});

it("recovery stops after the first photo it works on", async () => {
  state.test = true;
  state.recovered = [[{ parent, photo: missingPhoto }], [{ parent, photo: runningPhoto }]];
  expect(await recoverScanMarking(db, families, gate)).toEqual({ status: "processed", results: ["terminal"] });
  expect(state.recoverCalls).toBe(1);
});

it("recovery skips a bounded number of refused photos in one run", async () => {
  state.recoverAlways = [{ parent, photo: stoppedPhoto }];
  const result = await recoverScanMarking(db, families, gate);
  expect(result.results).toHaveLength(10);
  expect(state.recoverCalls).toBe(10);
});

it("the plan gate is given the database client", async () => {
  const seen: unknown[] = [];
  const withDeps: ChildPlanAccess = async (_input, deps) => { seen.push(deps?.db); return { open: true, reason: "open" }; };
  expect(await markingAccess(db, parent, families, { child: running }, withDeps)).toBe(true);
  expect(seen).toEqual([db]);
});

it("readiness reports the families mode and keeps the evidence hold", () => {
  const release = scanMarkingServerReadiness(families, "2026-11-07T20:00:00.000Z");
  expect(release.mode).toBe("families");
  expect(release.familyReady).toBe(false);
});

// Send, the photo checks and the stack's `checks` field: the same rule, without the marking parent list.
const closedReasons = ["no_plan", "ended", "payment_failed", "paused", "unknown", "read_failed"] as const;

it("families mode opens checks and Send for a child whose plan is running, by child and by photo", async () => {
  expect(await scanChecksAccess(db, parent, families, { child: running }, gate)).toBe(true);
  expect(await scanChecksAccess(db, parent, families, { photo: runningPhoto }, gate)).toBe(true);
  expect(await scanChecksAccess(db, parent, families, { child: stopped }, gate)).toBe(false);
  expect(await scanChecksAccess(db, parent, families, { photo: stoppedPhoto }, gate)).toBe(false);
});

it.each(closedReasons)("families mode closes checks and Send for %s, like marking", async (reason) => {
  plans[running] = { open: false, reason };
  expect(await scanChecksDecision(db, parent, families, { child: running }, gate)).toEqual({ open: false, reason });
  expect(await scanChecksAccess(db, parent, families, { photo: runningPhoto }, gate)).toBe(false);
});

it("checks and marking give the same answer for a real family for every plan answer", async () => {
  for (const reason of ["open", "ending_until_end", ...closedReasons] as const) {
    plans[running] = { open: reason === "open" || reason === "ending_until_end", reason };
    for (const scope of [{ child: running }, { photo: runningPhoto }, { photo: missingPhoto }, undefined]) {
      expect(await scanChecksDecision(db, parent, families, scope, gate)).toEqual(await markingDecision(db, parent, families, scope, gate));
    }
  }
});

it("another family's child closes checks and Send", async () => {
  expect(await scanChecksAccess(db, otherParent, families, { child: running }, gate)).toBe(false);
  expect(await scanChecksAccess(db, otherParent, families, { photo: runningPhoto }, gate)).toBe(false);
});

it.each(["test", "admin"] as const)("families mode keeps checks and Send for %s without a plan or a listing", async (role) => {
  state[role] = true; plans[running] = { open: false, reason: "no_plan" };
  const env = { ...families, SCAN_MARKING_TEST_PARENT_IDS: otherParent };
  expect(await scanChecksAccess(db, parent, env, { child: running }, gate)).toBe(true);
  expect(await scanChecksAccess(db, parent, env, undefined, gate)).toBe(true);
  expect(asked).toEqual([]);
});

it.each([undefined, "off", "test-only", "on"])("with switch %s checks and Send stay with test families and admins only", async (flag) => {
  const env = { SCAN_MARKING_ENABLED: flag, SCAN_MARKING_TEST_PARENT_IDS: otherParent };
  expect(await scanChecksAccess(db, parent, env, { child: running }, gate)).toBe(false);
  expect(await scanChecksAccess(db, parent, env, { photo: runningPhoto }, gate)).toBe(false);
  state.admin = true;
  expect(await scanChecksAccess(db, parent, env, { child: stopped }, gate)).toBe(true);
  expect(asked).toEqual([]);
});

it("in families mode a malformed parent list closes checks and Send as it closes marking", async () => {
  state.test = true;
  const env = { ...families, SCAN_MARKING_TEST_PARENT_IDS: "broken" };
  expect(await scanChecksAccess(db, parent, env, { child: running }, gate)).toBe(false);
  expect(await markingAccess(db, parent, env, { child: running }, gate)).toBe(false);
  expect(await scanChecksAccess(db, parent, { SCAN_MARKING_ENABLED: "test-only", SCAN_MARKING_TEST_PARENT_IDS: "broken" }, { child: running }, gate)).toBe(true);
});
