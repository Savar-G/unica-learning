import { createClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Database } from "@/lib/database";
import {
  familySlotFree, markSentPhotos, sendMarkingStart, SEND_MARKING_SLOT_WAITS_MS, SEND_MARKING_LIMIT_MS, SEND_MARKING_MARGIN_MS, SEND_MARKING_MAX_PHOTOS, SEND_MARKING_LEASE_MS,
} from "./scan-send-marking";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase-auth", () => ({ adminClient: () => null }));
// Every AI transport the marking lane makes is counted here (it makes one only after its claim, right before a call).
const ai = vi.hoisted(() => ({ transports: 0 }));
vi.mock("@/lib/scan-marking-ai", () => ({ markingClientReady: () => true, markingAiClient: () => () => { ai.transports++; return null; }, markingEscalationClient: () => undefined }));
vi.mock("@/lib/child-profile", () => ({ rebuildChildProfile: async () => ({ built: false, reason: "nothing_to_build" }) }));

const parent = "11111111-1111-4111-8111-111111111111", child = "22222222-2222-4222-8222-222222222222";
const photo = (n: number) => `44444444-4444-4444-8444-${String(n).padStart(12, "0")}`;
// A real Supabase client over a recording fetch: every table read, RPC and Storage request is listed.
// `taken`: what holds the family's one processing slot ("upload", "check" or "job"); `slotDown`: the slot reads fail.
const state = { test: false, plan: { open: true, reason: "open" }, requests: [] as string[], commands: [] as string[], taken: [] as string[], slotDown: false, slotQueries: [] as URL[] };
const SLOT = { scan_photos: "upload", scan_calibrations: "check", scan_marking_jobs: "job" } as const;
const db = createClient<Database>("https://send-marking.example.test", "synthetic-service-key", {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: async (input, init) => {
    const url = new URL(String(input)); state.requests.push(url.pathname);
    if (url.pathname.endsWith("/test_accounts")) return Response.json(state.test ? [{ parent_id: parent }] : []);
    if (url.pathname.endsWith("/admin_users")) return Response.json([]);
    if (url.pathname.endsWith("/children")) return Response.json([{ id: child }]);
    const table = url.pathname.split("/").pop() as keyof typeof SLOT;
    // The slot reads: a lease filter on the family's rows. Answered from `taken`.
    if (table in SLOT && url.searchParams.has("lease_until")) {
      state.slotQueries.push(url);
      if (state.slotDown) return Response.json({ message: "down" }, { status: 503 });
      return Response.json(state.taken.includes(SLOT[table]) ? [{ id: "row", photo_id: "row" }] : []);
    }
    if (url.pathname.endsWith("/scan_photos")) return Response.json([{ child_id: child }]);
    if (url.pathname.endsWith("/scan_marking_revisions")) {
      expect(url.searchParams.get("parent_id")).toBe(`eq.${parent}`);
      expect(url.searchParams.get("child_id")).toBe(`eq.${child}`);
      return Response.json([]);
    }
    if (url.pathname.endsWith("/rpc/scan_marking_command")) {
      const body = JSON.parse(String(init?.body)); state.commands.push(body.p_action);
      if (body.p_action === "outbox") return Response.json([]);
      // The frame is not ready: the lane stops before its claim. Enough to show the gate let the photo through.
      if (body.p_action === "frame") return Response.json("unavailable");
    }
    throw Error(`Unexpected request, including any claim, image read or paid dispatch: ${url.pathname}`);
  } },
});
const plan = async () => state.plan as never;
const clock = (start = 0) => { let t = start; return { now: () => t, advance: (ms: number) => { t += ms; } }; };

beforeEach(() => { Object.assign(state, { test: false, plan: { open: true, reason: "open" }, requests: [], commands: [], taken: [], slotDown: false, slotQueries: [] }); ai.transports = 0; });
const free = async () => true;
afterEach(() => vi.unstubAllEnvs());

it.each([
  ["off", { SCAN_MARKING_ENABLED: "off" }],
  ["unset", {}],
  ["test-only with a real family", { SCAN_MARKING_ENABLED: "test-only" }],
  ["families with a closed plan", { SCAN_MARKING_ENABLED: "families" }],
])("%s: Send starts no marking, and a direct run makes no claim, image read or AI call", async (_name, env) => {
  state.plan = { open: false, reason: "no_plan" };
  expect(await sendMarkingStart(db, parent, child, [photo(1), photo(2)], env, plan)).toEqual([]);
  // Even if a photo reached the run, the lane's own gate (markingDecision in processScanMarking) refuses it.
  const t = clock();
  const results = await markSentPhotos(parent, [photo(1)], 0, { env, plan, db: () => db, now: t.now });
  expect(results).toEqual({ [photo(1)]: "off" });
  expect(state.commands.filter((c) => c !== "outbox")).toEqual([]);
  expect(state.requests.some((p) => p.includes("/storage/"))).toBe(false);
  expect(ai.transports).toBe(0);
});

it("off and test-only with a real family read nothing but the slot and the gate", async () => {
  for (const env of [{ SCAN_MARKING_ENABLED: "off" }, { SCAN_MARKING_ENABLED: "test-only" }]) {
    state.requests = []; state.slotQueries = [];
    await markSentPhotos(parent, [photo(1)], 0, { env, plan, db: () => db, now: clock().now });
    const others = state.requests.filter((p) => !p.endsWith("/test_accounts") && !p.endsWith("/admin_users"));
    expect(others).toHaveLength(state.slotQueries.length);
  }
});

it("test-only with a test family: Send starts marking and the photo reaches the marking lane", async () => {
  state.test = true;
  const env = { SCAN_MARKING_ENABLED: "test-only" };
  expect(await sendMarkingStart(db, parent, child, [photo(2), photo(1), photo(1)], env, plan)).toEqual([photo(1), photo(2)]);
  const results = await markSentPhotos(parent, [photo(1)], 0, { env, plan, db: () => db, now: clock().now });
  // "terminal": the lane read the frame and stopped, so the gate was open. No AI call, as the frame was not ready.
  expect(results).toEqual({ [photo(1)]: "terminal" });
  expect(state.commands).toContain("frame");
  expect(ai.transports).toBe(0);
});

it("a test family not on SCAN_MARKING_TEST_PARENT_IDS gets no marking although Send admits it", async () => {
  state.test = true;
  const env = { SCAN_MARKING_ENABLED: "test-only", SCAN_MARKING_TEST_PARENT_IDS: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" };
  expect(await sendMarkingStart(db, parent, child, [photo(1)], env, plan)).toEqual([]);
  expect(await markSentPhotos(parent, [photo(1)], 0, { env, plan, db: () => db, now: clock().now })).toEqual({ [photo(1)]: "off" });
  expect(state.commands).toEqual([]);
});

it("families mode with a running plan starts marking; a failed rule read starts none", async () => {
  const env = { SCAN_MARKING_ENABLED: "families" };
  expect(await sendMarkingStart(db, parent, child, [photo(1)], env, plan)).toEqual([photo(1)]);
  expect(await sendMarkingStart(db, parent, child, [photo(1)], env, async () => { throw Error("plan read"); })).toEqual([]);
  expect(await sendMarkingStart(db, parent, child, [], env, plan)).toEqual([]);
});

it(`caps the photos marking starts on at ${SEND_MARKING_MAX_PHOTOS}`, async () => {
  state.test = true;
  const ids = Array.from({ length: 9 }, (_, n) => photo(n + 1));
  expect(await sendMarkingStart(db, parent, child, ids, { SCAN_MARKING_ENABLED: "test-only" }, plan)).toEqual(ids.slice(0, SEND_MARKING_MAX_PHOTOS));
});

it("runs photos one at a time; one photo's error does not stop the others", async () => {
  let running = 0, most = 0;
  const seen: string[] = [];
  const mark = vi.fn(async (_db: unknown, _parent: string, id: string) => {
    running++; most = Math.max(most, running); seen.push(id);
    await new Promise((r) => setTimeout(r, 1));
    running--;
    if (id === photo(2)) throw Error("synthetic failure");
    return "finished" as const;
  });
  const results = await markSentPhotos(parent, [photo(1), photo(2), photo(3)], 0, { db: () => db, mark, slot: free, now: clock().now });
  expect(results).toEqual({ [photo(1)]: "finished", [photo(2)]: "error", [photo(3)]: "finished" });
  expect(seen).toEqual([photo(1), photo(2), photo(3)]);
  expect(most).toBe(1);
});

it("starts a photo only while a whole lease plus the margin fits before the time limit; the rest wait for the cron", async () => {
  // The last start is 300 - 15 - 180 = 105 s after the request started.
  expect(SEND_MARKING_LIMIT_MS - SEND_MARKING_MARGIN_MS - SEND_MARKING_LEASE_MS).toBe(105_000);
  const t = clock(1_000);
  // Photo 1 ends at 105 s: photo 2 still starts. Photo 2 ends at 105.001 s: photo 3 does not.
  const lengths = [104_000, 1, 1];
  const mark = vi.fn(async () => { t.advance(lengths.shift()!); return "finished" as const; });
  const results = await markSentPhotos(parent, [photo(1), photo(2), photo(3)], 0, { db: () => db, mark, slot: free, now: t.now });
  expect(results).toEqual({ [photo(1)]: "finished", [photo(2)]: "finished", [photo(3)]: "not-started" });
  expect(mark).toHaveBeenCalledTimes(2);
});

it("the database client stops at the deadline; with no time left nothing starts", async () => {
  const signals: AbortSignal[] = [];
  const mark = vi.fn(async () => "finished" as const);
  await markSentPhotos(parent, [photo(1)], 0, { db: (s) => { signals.push(s); return db; }, mark, slot: free, now: clock().now });
  expect(signals).toHaveLength(1);
  expect(await markSentPhotos(parent, [photo(1)], 0, { db: () => db, mark, slot: free, now: clock(SEND_MARKING_LIMIT_MS).now })).toEqual({ [photo(1)]: "not-started" });
  expect(mark).toHaveBeenCalledTimes(1);
});

it("waits for the family's slot with backoff, then calls the lane once for the photo", async () => {
  const t = clock();
  const waits: number[] = [];
  let reads = 0;
  // An upload holds the slot for the first three reads.
  const slot = vi.fn(async () => ++reads > 3);
  const mark = vi.fn(async () => "finished" as const);
  const results = await markSentPhotos(parent, [photo(1)], 0, { db: () => db, mark, slot, now: t.now, sleep: async (ms) => { waits.push(ms); t.advance(ms); } });
  expect(results).toEqual({ [photo(1)]: "finished" });
  expect(waits).toEqual([1_000, 2_000, 4_000]);
  expect(mark).toHaveBeenCalledTimes(1);
});

it("a slot that never frees stops at the start rule's deadline with no call to the lane", async () => {
  const t = clock();
  const mark = vi.fn(async () => "finished" as const);
  const results = await markSentPhotos(parent, [photo(1), photo(2)], 0, { db: () => db, mark, slot: async () => false, now: t.now, sleep: async (ms) => t.advance(ms) });
  expect(results).toEqual({ [photo(1)]: "not-started", [photo(2)]: "not-started" });
  expect(mark).not.toHaveBeenCalled();
  // It waited until no further wait and lease fit: the last start would be at 105 s.
  expect(t.now()).toBeLessThanOrEqual(105_000);
  expect(t.now() + SEND_MARKING_SLOT_WAITS_MS.at(-1)!).toBeGreaterThan(105_000);
});

it("never calls the lane twice for a photo in one run, even when its claim answers busy", async () => {
  const calls: string[] = [];
  const mark = vi.fn(async (_db: unknown, _parent: string, id: string) => { calls.push(id); return id === photo(1) ? "busy" as const : "finished" as const; });
  const results = await markSentPhotos(parent, [photo(1), photo(2)], 0, { db: () => db, mark, slot: free, now: clock().now, sleep: async () => {} });
  expect(results).toEqual({ [photo(1)]: "busy", [photo(2)]: "finished" });
  expect(calls).toEqual([photo(1), photo(2)]);
});

it("reads the slot as the claim counts it: an upload, a photo check or a marking job with a live lease takes it", async () => {
  const at = "2026-11-07T20:00:00.000Z";
  expect(await familySlotFree(db, parent, at)).toBe(true);
  for (const holder of ["upload", "check", "job"]) {
    state.taken = [holder];
    expect(await familySlotFree(db, parent, at)).toBe(false);
  }
  state.taken = []; state.slotDown = true;
  expect(await familySlotFree(db, parent, at)).toBe(false);
  // Read only, the family's own rows, live leases only, in the states the claim counts.
  for (const q of state.slotQueries) {
    expect(q.searchParams.get("parent_id")).toBe(`eq.${parent}`);
    expect(q.searchParams.get("lease_until")).toBe(`gt.${at}`);
  }
  const states = Object.fromEntries(state.slotQueries.slice(0, 3).map((q) => [q.pathname.split("/").pop(), q.searchParams.get("state")]));
  expect(states).toEqual({ scan_photos: "eq.processing", scan_calibrations: "eq.running", scan_marking_jobs: "in.(running,extracted)" });
  expect(state.commands).toEqual([]);
});
