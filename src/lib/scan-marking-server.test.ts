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
    if (url.pathname.endsWith("/rpc/recover_scan_marking")) return Response.json([{ parent, photo: "expired-photo" }]);
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

it.each([false, true])("keeps an expired-photo parent change and its recovery handoff while off (profile interrupted: %s)", async (failed) => {
  state.photo = true; profile.failed = failed;
  expect(await changeScanMarking(db, parent, "expired-photo", { itemId: expected.identity.itemId, version: 2, result: "right" })).toEqual({ status: "saved", recoveryPending: failed });
  expect(state.mark.result).toBe("right"); expect(state.mark.resultVersion).toBe(3);
  expect(state.commands).toEqual(["change", "outbox"]); expect(profile.calls).toBe(1);
  expect(state.queries.some((q) => /test_accounts|admin_users|storage/.test(q.pathname))).toBe(false);
});
