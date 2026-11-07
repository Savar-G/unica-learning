import { createClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Database } from "@/lib/database";
import {
  markSentPhotos, sendMarkingStart, SEND_MARKING_LIMIT_MS, SEND_MARKING_MARGIN_MS, SEND_MARKING_MAX_PHOTOS, SEND_MARKING_LEASE_MS,
} from "./scan-send-marking";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase-auth", () => ({ adminClient: () => null }));
// Every AI transport the marking lane makes is counted here (it makes one only after its claim, right before a call).
const ai = vi.hoisted(() => ({ transports: 0 }));
vi.mock("@/lib/scan-marking-ai", () => ({ markingAiClient: () => () => { ai.transports++; return null; } }));
vi.mock("@/lib/child-profile", () => ({ rebuildChildProfile: async () => ({ built: false, reason: "nothing_to_build" }) }));

const parent = "11111111-1111-4111-8111-111111111111", child = "22222222-2222-4222-8222-222222222222";
const photo = (n: number) => `44444444-4444-4444-8444-${String(n).padStart(12, "0")}`;
// A real Supabase client over a recording fetch: every table read, RPC and Storage request is listed.
const state = { test: false, plan: { open: true, reason: "open" }, requests: [] as string[], commands: [] as string[] };
const db = createClient<Database>("https://send-marking.example.test", "synthetic-service-key", {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: async (input, init) => {
    const url = new URL(String(input)); state.requests.push(url.pathname);
    if (url.pathname.endsWith("/test_accounts")) return Response.json(state.test ? [{ parent_id: parent }] : []);
    if (url.pathname.endsWith("/admin_users")) return Response.json([]);
    if (url.pathname.endsWith("/children")) return Response.json([{ id: child }]);
    if (url.pathname.endsWith("/scan_photos")) return Response.json([{ child_id: child }]);
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

beforeEach(() => { Object.assign(state, { test: false, plan: { open: true, reason: "open" }, requests: [], commands: [] }); ai.transports = 0; });
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

it("off and test-only with a real family read nothing at all", async () => {
  for (const env of [{ SCAN_MARKING_ENABLED: "off" }, { SCAN_MARKING_ENABLED: "test-only" }]) {
    state.requests = [];
    await markSentPhotos(parent, [photo(1)], 0, { env, plan, db: () => db, now: clock().now });
    expect(state.requests.filter((p) => !p.endsWith("/test_accounts") && !p.endsWith("/admin_users"))).toEqual([]);
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
  const results = await markSentPhotos(parent, [photo(1), photo(2), photo(3)], 0, { db: () => db, mark, now: clock().now });
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
  const results = await markSentPhotos(parent, [photo(1), photo(2), photo(3)], 0, { db: () => db, mark, now: t.now });
  expect(results).toEqual({ [photo(1)]: "finished", [photo(2)]: "finished", [photo(3)]: "not-started" });
  expect(mark).toHaveBeenCalledTimes(2);
});

it("the database client stops at the deadline; with no time left nothing starts", async () => {
  const signals: AbortSignal[] = [];
  const mark = vi.fn(async () => "finished" as const);
  await markSentPhotos(parent, [photo(1)], 0, { db: (s) => { signals.push(s); return db; }, mark, now: clock().now });
  expect(signals).toHaveLength(1);
  expect(await markSentPhotos(parent, [photo(1)], 0, { db: () => db, mark, now: clock(SEND_MARKING_LIMIT_MS).now })).toEqual({ [photo(1)]: "not-started" });
  expect(mark).toHaveBeenCalledTimes(1);
});

it("tries a busy photo again after a wait, at most a few times, and never a finished one", async () => {
  const t = clock();
  const calls: string[] = [];
  let busyLeft = 2;
  const mark = vi.fn(async (_db: unknown, _parent: string, id: string) => {
    calls.push(id); t.advance(5_000);
    if (id === photo(1) && busyLeft-- > 0) return "busy" as const;
    return "finished" as const;
  });
  const results = await markSentPhotos(parent, [photo(1), photo(2)], 0, { db: () => db, mark, now: t.now, sleep: async (ms) => t.advance(ms) });
  expect(results).toEqual({ [photo(1)]: "finished", [photo(2)]: "finished" });
  expect(calls).toEqual([photo(1), photo(2), photo(1), photo(1)]);
  const always = vi.fn(async () => { t.advance(1_000); return "busy" as const; });
  expect(await markSentPhotos(parent, [photo(3)], t.now(), { db: () => db, mark: always, now: t.now, sleep: async (ms) => t.advance(ms) })).toEqual({ [photo(3)]: "busy" });
  expect(always).toHaveBeenCalledTimes(4);
});
