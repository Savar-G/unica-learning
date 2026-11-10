import { createClient } from "@supabase/supabase-js";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import type { Database } from "@/lib/database";
import { expectedItems, firstObservation } from "@/lib/scan-observation";
import { changeScanMarking, markingAccess, processScanMarking, readScanMarking, recoverScanMarking, scanMarkingServerReadiness } from "./scan-marking-server";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase-auth", () => ({ adminClient: () => null }));
// The profile subsystem is outside this gate. Exercise both successful rebuild and durable retry handoff.
const profile = vi.hoisted(() => ({ failed: false, calls: 0 }));
vi.mock("@/lib/child-profile", () => ({ rebuildChildProfile: async () => {
  profile.calls++;
  if (profile.failed) throw Error("synthetic profile interruption");
  return { built: false, reason: "nothing_to_build" };
} }));

const parent = "11111111-1111-4111-8111-111111111111", child = "22222222-2222-4222-8222-222222222222";
const otherParent = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const scopedEnv = (ids: string) => ({ SCAN_MARKING_ENABLED: "test-only", SCAN_MARKING_TEST_PARENT_IDS: ids });
const expected = { ...expectedItems({ workbookId: "book", printedRevision: "print", pageId: "page", questions: [{ number: 1, package: null, teaching: null }] })[0], method: "parent" as const };
const original = { ...firstObservation(expected, "expired-photo"), state: "parent-checked", method: "parent", result: "wrong", actor: "parent", resultVersion: 2 };
const state = { test: false, admin: false, failed: false, wrongParent: false, photo: false, queries: [] as URL[], commands: [] as string[], mark: original };
function persisted() {
  return { id: "item-row", expected, observation: state.mark, original_event: null, event_id: null,
    evidence_at: "2026-11-01T00:00:00.000Z", model: null, prompt: null };
}
const db = createClient<Database>("https://marking-launch.example.test", "synthetic-service-key", {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: async (input, init) => {
    const url = new URL(String(input)); state.queries.push(url);
    if (url.pathname.endsWith("/test_accounts") || url.pathname.endsWith("/admin_users")) {
      if (state.failed) return Response.json({ message: "lookup failed" }, { status: 503 });
      const isTest = url.pathname.endsWith("/test_accounts"), field = isTest ? "parent_id" : "user_id";
      expect(url.searchParams.get(field)).toBe(`eq.${parent}`);
      return Response.json((isTest ? state.test : state.admin) ? [{ [field]: state.wrongParent ? "other-family" : parent }] : []);
    }
    if (url.pathname.endsWith("/scan_photos")) {
      if (!state.photo) return Response.json([]);
      expect(url.searchParams.get("parent_id")).toBe(`eq.${parent}`);
      return Response.json([{ id: "expired-photo", child_id: child, workbook_id: "book", page_id: "page", printed_revision: "print", state: "expired", expires_at: "2026-01-01T00:00:00.000Z" }]);
    }
    if (url.pathname.endsWith("/scan_marking_items")) {
      expect(url.searchParams.get("parent_id")).toBe(`eq.${parent}`); expect(url.searchParams.get("item_id")).toBe(`eq.${expected.identity.itemId}`);
      return Response.json([{ result_version: state.mark.resultVersion, observation: state.mark }]);
    }
    if (url.pathname.endsWith("/rpc/recover_scan_marking_oldest")) return Response.json([{ parent, photo: "expired-photo" }]);
    if (url.pathname.endsWith("/rpc/scan_marking_command")) {
      const body = JSON.parse(String(init?.body));
      expect(body.p_parent).toBe(parent); state.commands.push(body.p_action);
      if (body.p_action === "detail") return Response.json({ job: null });
      if (body.p_action === "effective") return Response.json(body.p_data.after ? [] : [persisted()]);
      if (body.p_action === "outbox") return Response.json([]);
      if (body.p_action === "change") {
        state.mark = { ...state.mark, result: body.p_data.result, resultVersion: state.mark.resultVersion + 1 };
        return Response.json({ status: "saved", mark: persisted() });
      }
    }
    throw Error(`Unexpected request, including any image or paid dispatch: ${url.pathname}`);
  } },
});
beforeEach(() => {
  Object.assign(state, { test: false, admin: false, failed: false, wrongParent: false, photo: false, queries: [], commands: [], mark: { ...original } });
  Object.assign(profile, { failed: false, calls: 0 });
  vi.stubEnv("SCAN_MARKING_ENABLED", "off");
});
afterEach(() => vi.unstubAllEnvs());

it.each([undefined, "", "off", "on", "true", "ON", "test-only "])("keeps marking off for every family with unsupported switch %s", async (flag) => {
  state.test = true; state.admin = true;
  const env = { SCAN_MARKING_ENABLED: flag, SCAN_PAGES_ENABLED: "on", SCAN_MARKING_APPROVED: "true" };
  expect(await markingAccess(db, parent, env)).toBe(false);
  expect(await processScanMarking(db, parent, "expired-photo", env)).toBe("off");
  expect(await recoverScanMarking(db, env)).toEqual({ status: "off" });
  expect(state.queries).toHaveLength(0);
});

it("rejects an ordinary family in both direct dispatch and recovery despite browser approval claims", async () => {
  const env = { SCAN_MARKING_ENABLED: "test-only", SCAN_PAGES_ENABLED: "on", familyReady: "true", evidence: "approved" };
  const [direct, recovery] = await Promise.all([processScanMarking(db, parent, "expired-photo", env), recoverScanMarking(db, env)]);
  expect(direct).toBe("off"); expect(recovery).toEqual({ status: "processed", results: ["off"] });
  expect(state.queries.filter((q) => q.pathname.endsWith("/scan_photos"))).toHaveLength(0);
  expect(state.commands).toEqual([]); expect(profile.calls).toBe(0);
});

it.each(["test", "admin"] as const)("preserves verified %s admission and rechecks removal before recovery", async (role) => {
  const env = { SCAN_MARKING_ENABLED: "test-only" }; state[role] = true;
  expect(await markingAccess(db, parent, env)).toBe(true);
  expect(await processScanMarking(db, parent, "missing-photo", env)).toBe("terminal");
  state[role] = false;
  expect(await recoverScanMarking(db, env)).toEqual({ status: "processed", results: ["off"] });
  expect(state.commands).toEqual([]);
});

it("rejects failed or mismatched family lookups", async () => {
  state.test = true; state.failed = true;
  expect(await markingAccess(db, parent, { SCAN_MARKING_ENABLED: "test-only" })).toBe(false);
  state.failed = false; state.wrongParent = true;
  expect(await markingAccess(db, parent, { SCAN_MARKING_ENABLED: "test-only" })).toBe(false);
});

it.each(["test", "admin"] as const)("requires a listed parent and a current %s mark", async (role) => {
  const env = scopedEnv(`${otherParent.toUpperCase()},${parent}`);
  expect(await markingAccess(db, parent, env)).toBe(false);
  state[role] = true;
  expect(await markingAccess(db, parent, env)).toBe(true);
  expect(await processScanMarking(db, parent, "missing-photo", env)).toBe("terminal");
  state[role] = false;
  expect(await markingAccess(db, parent, env)).toBe(false);
  expect(state.queries).toHaveLength(9);
});

it("refuses an unlisted marked parent before database access", async () => {
  state.test = true; state.admin = true;
  expect(await markingAccess(db, parent, scopedEnv(otherParent))).toBe(false);
  expect(state.queries).toHaveLength(0);
});

it("refuses unlisted direct work and already-sent recovery work without dispatch", async () => {
  state.test = true; state.admin = true; state.photo = true;
  const env = scopedEnv(otherParent);
  const [direct, recovery] = await Promise.all([
    processScanMarking(db, parent, "expired-photo", env), recoverScanMarking(db, env),
  ]);
  expect(direct).toBe("off");
  expect(recovery).toEqual({ status: "processed", results: ["off"] });
  // The second list answer is the same photo again (the fake never ends), so the run stops there.
  expect(state.queries.map(q => q.pathname)).toEqual(["/rest/v1/rpc/recover_scan_marking_oldest", "/rest/v1/rpc/recover_scan_marking_oldest"]);
  expect(state.commands).toEqual([]); expect(profile.calls).toBe(0);
});

it.each([
  "", " ", "not-a-uuid", `${parent},`, `,${parent}`, `${parent},,${otherParent}`,
  `${parent},broken`, ` ${parent}`, `${parent}\n`, `${parent},${parent}`,
  `${parent},${otherParent},${otherParent.toUpperCase()}`,
  Array.from({ length: 101 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`).join(","),
  "x".repeat(3700),
])("rejects an invalid present list before database access (case %#)", async (ids) => {
  state.test = true; state.admin = true;
  expect(await markingAccess(db, parent, scopedEnv(ids))).toBe(false);
  expect(await processScanMarking(db, parent, "expired-photo", scopedEnv(ids))).toBe("off");
  expect(state.queries).toHaveLength(0);
});

it("accepts the full 100-entry bound and reads the list again on each call", async () => {
  const ids = [parent, ...Array.from({ length: 99 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`)].join(",");
  expect(ids).toHaveLength(3699);
  state.test = true;
  const env = scopedEnv(ids);
  expect(await markingAccess(db, parent, env)).toBe(true);
  env.SCAN_MARKING_TEST_PARENT_IDS = otherParent;
  expect(await markingAccess(db, parent, env)).toBe(false);
  expect(state.queries).toHaveLength(2);
});

it.each([undefined, "", "off", "on"])("a valid list cannot enable marking with mode %s", async (flag) => {
  state.test = true; state.admin = true;
  const env = { ...scopedEnv(parent), SCAN_MARKING_ENABLED: flag, SCAN_PAGES_ENABLED: "on" };
  expect(await markingAccess(db, parent, env)).toBe(false);
  expect(await processScanMarking(db, parent, "expired-photo", env)).toBe("off");
  expect(await recoverScanMarking(db, env)).toEqual({ status: "off" });
  expect(state.queries).toHaveLength(0);
});

it("a listed parent cannot bypass failed or mismatched database reads", async () => {
  state.test = true; state.admin = true; state.failed = true;
  expect(await markingAccess(db, parent, scopedEnv(parent))).toBe(false);
  state.failed = false; state.wrongParent = true;
  expect(await markingAccess(db, parent, scopedEnv(parent))).toBe(false);
});

it("keeps readiness unchanged and returns no parent list", () => {
  const now = "2026-11-06T20:00:00.000Z";
  const release = scanMarkingServerReadiness(scopedEnv(parent), now);
  expect(release).toEqual(scanMarkingServerReadiness({ SCAN_MARKING_ENABLED: "test-only" }, now));
  expect(release.familyReady).toBe(false);
  expect(JSON.stringify(release)).not.toContain(parent);
});

it("reports the source-controlled hold without treating test access as family approval", () => {
  for (const flag of [undefined, "on", "test-only"]) {
    const release = scanMarkingServerReadiness({ SCAN_MARKING_ENABLED: flag }, "2026-11-06T20:00:00.000Z");
    expect(release.familyReady).toBe(false);
    expect(release.blockers).toEqual(expect.arrayContaining(["provider-policy", "privacy-text", "evaluation-pass", "family-release-held"]));
  }
});

it("reads expired-photo history while marking is off, without image access or family admission", async () => {
  state.photo = true;
  const result = await readScanMarking(db, parent, "expired-photo");
  expect(result?.items).toHaveLength(1); expect(result?.photoAvailable).toBe(false);
  expect(result?.items[0].photoAvailable).toBe(false); expect(result?.marks[0].observation.result).toBe("wrong");
  expect(result?.items[0].canChange).toBe(true);
  expect(state.queries.some((q) => /test_accounts|admin_users|storage/.test(q.pathname))).toBe(false);
});

it("refuses a parent's change of an answer with no mark yet: the AI and our team mark it (#715)", async () => {
  state.photo = true; state.mark = { ...firstObservation(expected, "expired-photo"), resultVersion: 2 } as typeof state.mark;
  expect(await changeScanMarking(db, parent, "expired-photo", { itemId: expected.identity.itemId, version: 2, result: "right" })).toEqual({ status: "refused" });
  expect(state.commands).toEqual([]); expect(state.mark.result).toBeNull(); expect(profile.calls).toBe(0);
  // An older version the parent saw goes to the store, which answers conflict with the current mark.
  state.mark = { ...original, resultVersion: 3 };
  await changeScanMarking(db, parent, "expired-photo", { itemId: expected.identity.itemId, version: 2, result: "right" });
  expect(state.commands).toEqual(["change", "outbox"]);
});

it.each([false, true])("keeps an expired-photo parent change and its recovery handoff while off (profile interrupted: %s)", async (failed) => {
  state.photo = true; profile.failed = failed;
  expect(await changeScanMarking(db, parent, "expired-photo", { itemId: expected.identity.itemId, version: 2, result: "right" })).toEqual({ status: "saved", recoveryPending: failed });
  expect(state.mark.result).toBe("right"); expect(state.mark.resultVersion).toBe(3);
  expect(state.commands).toEqual(["change", "outbox"]); expect(profile.calls).toBe(1);
  expect(state.queries.some((q) => /test_accounts|admin_users|storage/.test(q.pathname))).toBe(false);
});

// #706: an admitted photo with no marking client tells the caller, so a recovery run can stop.
it("tells the caller when an admitted photo has no marking client", async () => {
  state.test = true;
  const onNoClient = vi.fn();
  expect(await processScanMarking(db, parent, "missing-photo", { SCAN_MARKING_ENABLED: "test-only" }, undefined, { onNoClient })).toBe("terminal");
  expect(onNoClient).toHaveBeenCalledOnce();
});

// #706: a closed-plan photo in families mode publishes its committed marks; with nothing in the outbox it rebuilds no profile.
it("rebuilds no profile for a closed-plan photo whose outbox is empty", async () => {
  state.photo = true;
  const closed = async () => ({ open: false, reason: "ended" as const });
  expect(await processScanMarking(db, parent, "33333333-3333-4333-8333-333333333333", { SCAN_MARKING_ENABLED: "families" }, closed as never)).toBe("off");
  expect(state.commands).toEqual(["outbox"]);
  expect(profile.calls).toBe(0);
});
