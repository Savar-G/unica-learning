import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { setProductObserver } from "@/lib/product-monitoring";

vi.mock("server-only", () => ({}));
const CHILD = "22222222-2222-4222-8222-222222222222", OTHER_CHILD = "33333333-3333-4333-8333-333333333333";
const PHOTO = "44444444-4444-4444-8444-444444444444";
const f = vi.hoisted(() => ({ marked: false, plan: { open: true, reason: "open" } as { open: boolean; reason: string }, asked: [] as unknown[], sent: [] as unknown[],
  later: [] as (() => unknown)[], afterFails: false, sendFails: false, readFails: false, rows: ["44444444-4444-4444-8444-444444444444"] as string[], siblingPlan: { open: false, reason: "no_plan" } as { open: boolean; reason: string } }));
// The work after the answer is captured, not run: src/lib/scan-send-marking.test.ts runs it.
vi.mock("next/server", () => ({ after: (task: () => unknown) => { if (f.afterFails) throw Error("no request scope"); f.later.push(task); } }));
vi.mock("@/lib/supabase-auth", () => ({ adminClient: () => null }));
// The real start rule; the run itself is recorded, so a test can read the start time the route gave it.
const runs = vi.hoisted(() => [] as { parent: string; photos: readonly string[]; startedAt: number }[]);
vi.mock("@/lib/scan-send-marking", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/scan-send-marking")>();
  return { ...actual, markSentPhotos: async (parent: string, photos: readonly string[], startedAt: number) => { runs.push({ parent, photos, startedAt }); return {}; } };
});
vi.mock("@/lib/scan-pages-access", () => ({ markedFamily: async () => f.marked }));
// The real admission rule, with the plan gate answered by the test (the dashboard's gate is not on main yet).
vi.mock("@/lib/scan-marking-access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/scan-marking-access")>();
  const gate = async (input: { parentId: string; childId: string }) => {
    f.asked.push(input);
    return input.childId === "22222222-2222-4222-8222-222222222222" ? f.plan as never : input.childId === "55555555-5555-4555-8555-555555555555" ? f.siblingPlan as never : { open: false, reason: "no_plan" } as const;
  };
  return { ...actual, childPlanAccess: gate, scanChecksDecision: (...args: Parameters<typeof actual.scanChecksDecision>) => actual.scanChecksDecision(args[0], args[1], args[2], args[3], gate), scanChecksAccess: (...args: Parameters<typeof actual.scanChecksAccess>) => actual.scanChecksAccess(args[0], args[1], args[2], args[3], gate) };
});
// The family's children: CHILD and SIBLING are this family's (only CHILD's plan is open); each photo is filed with a child.
const SIBLING = "55555555-5555-4555-8555-555555555555", SIBLING_PHOTO = "66666666-6666-4666-8666-666666666666";
const filed = vi.hoisted(() => new Map<string, string>());
const children = { from: (table: string) => ({ select: () => ({ eq: (_c: string, id: string) => ({
  eq: (_p: string, owner: string) => ({
    maybeSingle: async () => ({ data: table === "children" && owner === "family" && ["22222222-2222-4222-8222-222222222222", "55555555-5555-4555-8555-555555555555"].includes(id) ? { id } : null, error: null }),
  }),
  // scan_photos: this family's photos (parent_id "family"), with the child each is filed with.
  in: async (_i: string, ids: string[]) => ({ data: id === "family" ? ids.filter((p) => filed.has(p)).map((p) => ({ id: p, child_id: filed.get(p)! })) : [], error: f.readFails ? { message: "private diagnostic" } : null }),
}) }) }) };
vi.mock("@/lib/scan-photo-server", () => ({
  scanJson: (data: unknown, status = 200) => Response.json(data, { status }),
  scanSession: async () => ({ parent: "family", admin: { ...children, rpc: async (name: string, args: { p_ids: string[] }) => { f.sent.push({ name, args }); return { data: name === "send_scan_photos_receipt" ? [{ sent: f.rows.filter((r) => args.p_ids.includes(r)), newly_sent: f.rows.filter((r) => args.p_ids.includes(r)) }] : f.rows.filter((r) => args.p_ids.includes(r)), error: f.sendFails ? { message: "private diagnostic" } : null }; } } }),
}));
import { maxDuration, POST } from "./route";
import { SEND_MARKING_LIMIT_MS } from "@/lib/scan-send-marking";

const send = (child = CHILD, ids = [PHOTO]) => POST(new Request("https://unicalearning.com/api/account/scans/send", {
  method: "POST", headers: { Origin: "https://unicalearning.com" }, body: JSON.stringify({ child, ids }),
}));

beforeEach(() => {
  vi.clearAllMocks(); setProductObserver(null);
  Object.assign(f, { marked: false, plan: { open: true, reason: "open" }, siblingPlan: { open: false, reason: "no_plan" }, asked: [], sent: [], later: [], afterFails: false, sendFails: false, readFails: false, rows: [PHOTO, SIBLING_PHOTO] });
  filed.clear(); filed.set(PHOTO, CHILD); filed.set(SIBLING_PHOTO, SIBLING);
  runs.length = 0;
  vi.stubEnv("SCAN_MARKING_ENABLED", "families");
});
afterEach(() => { setProductObserver(null); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

it("reports one failure for one failed Send write", async () => {
  const observer = vi.fn(); setProductObserver(observer); f.sendFails = true;
  const response = await send();
  expect(response.status).toBe(503);
  expect(observer).toHaveBeenCalledExactlyOnceWith({ code: "scan.send_failed", attributes: { count: 1 } });
});

it("still reports a photo read failure that no inner operation reported", async () => {
  const observer = vi.fn(); setProductObserver(observer); f.readFails = true;
  expect((await send()).status).toBe(503);
  expect(observer).toHaveBeenCalledExactlyOnceWith({ code: "scan.send_failed", attributes: {} });
});

it("reports an unreadable plan without reporting ordinary access refusals", async () => {
  const observer = vi.fn(); setProductObserver(observer);
  f.plan = { open: false, reason: "read_failed" };
  expect((await send()).status).toBe(404);
  expect(observer).toHaveBeenCalledExactlyOnceWith({ code: "scan.recovery_failed", attributes: { step: "send" } });
  observer.mockClear(); f.plan = { open: false, reason: "no_plan" };
  expect((await send()).status).toBe(404);
  expect(observer).not.toHaveBeenCalled();
});

it.each(["open", "ending_until_end"])("families mode sends a real family's pages while the child's plan is %s", async (reason) => {
  f.plan = { open: true, reason };
  const r = await send();
  expect(r.status).toBe(200); expect(await r.json()).toEqual({ sent: [PHOTO], marking: 1 });
  expect(f.sent).toEqual([{ name: "send_scan_photos_receipt", args: { p_parent: "family", p_child: CHILD, p_ids: [PHOTO] } }]);
  // Send asks the plan gate, then the marking rule asks it again for the same child.
  expect(f.asked).toEqual([{ parentId: "family", childId: CHILD }, { parentId: "family", childId: CHILD }]);
  expect(f.later).toHaveLength(1);
});

it.each(["no_plan", "ended", "payment_failed", "paused", "unknown", "read_failed"])("families mode refuses Send when the plan answer is %s", async (reason) => {
  f.plan = { open: false, reason };
  const r = await send();
  expect(r.status).toBe(404); expect(await r.json()).toEqual({ error: "refused" });
  expect(f.sent).toEqual([]); expect(f.later).toEqual([]);
});

it("families mode refuses Send for another family's photo or a stopped sibling's", async () => {
  // Another family's photo is not read at all; the child the page sends is no longer what decides.
  filed.delete(PHOTO);
  expect((await send(OTHER_CHILD)).status).toBe(404);
  expect((await send(CHILD, [SIBLING_PHOTO])).status).toBe(404);
  expect(f.sent).toEqual([]);
});

it("sends a sibling's page in the same Send, grouped by the child each photo is filed with (#1)", async () => {
  f.siblingPlan = { open: true, reason: "open" };
  const r = await send(CHILD, [PHOTO, SIBLING_PHOTO]);
  expect(r.status).toBe(200); expect(await r.json()).toEqual({ sent: [PHOTO, SIBLING_PHOTO].sort(), marking: 2 });
  expect(f.sent).toEqual([
    { name: "send_scan_photos_receipt", args: { p_parent: "family", p_child: CHILD, p_ids: [PHOTO] } },
    { name: "send_scan_photos_receipt", args: { p_parent: "family", p_child: SIBLING, p_ids: [SIBLING_PHOTO] } },
  ]);
});

it("never sends a page of a sibling whose plan is closed, and still sends this child's (#1)", async () => {
  const r = await send(CHILD, [PHOTO, SIBLING_PHOTO]);
  expect(r.status).toBe(200); expect(await r.json()).toEqual({ sent: [PHOTO], marking: 1 });
  expect(f.sent).toEqual([{ name: "send_scan_photos_receipt", args: { p_parent: "family", p_child: CHILD, p_ids: [PHOTO] } }]);
});

it("still takes Send without the child, as the photos name it", async () => {
  const r = await POST(new Request("https://unicalearning.com/api/account/scans/send", { method: "POST", headers: { Origin: "https://unicalearning.com" }, body: JSON.stringify({ ids: [PHOTO] }) }));
  expect(await r.json()).toEqual({ sent: [PHOTO], marking: 1 });
});

it("families mode keeps Send for test families and admins without a plan", async () => {
  f.marked = true; f.plan = { open: false, reason: "no_plan" };
  const r = await send();
  expect(r.status).toBe(200); expect(await r.json()).toEqual({ sent: [PHOTO], marking: 1 });
  expect(f.asked).toEqual([]);
  expect(f.later).toHaveLength(1);
});

it.each(["test-only", "off"])("with switch %s Send is unchanged: test families and admins only", async (flag) => {
  vi.stubEnv("SCAN_MARKING_ENABLED", flag);
  expect((await send()).status).toBe(404);
  expect(f.later).toEqual([]);
  f.marked = true;
  const r = await send();
  expect(r.status).toBe(200);
  // test-only: marking starts for a test family. off: the pages are sent and no marking starts.
  expect(await r.json()).toEqual({ sent: [PHOTO], marking: flag === "test-only" ? 1 : 0 });
  expect(f.later).toHaveLength(flag === "test-only" ? 1 : 0);
  expect(f.asked).toEqual([]);
});

it("starts no marking when no page was sent", async () => {
  f.rows = [];
  const r = await send();
  expect(await r.json()).toEqual({ sent: [], marking: 0 });
  expect(f.later).toEqual([]);
});

it("keeps the Send answer when the work after it cannot be scheduled, and says no marking started", async () => {
  f.afterFails = true;
  const r = await send();
  expect(r.status).toBe(200); expect(await r.json()).toEqual({ sent: [PHOTO], marking: 0 });
});

it("gives the marking run the time the request started, not the time the work after the answer begins", async () => {
  const clock = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
  await send();
  // The answer has gone; the work after it begins 50 s later.
  clock.mockReturnValue(1_050_000);
  await f.later[0]();
  expect(runs).toEqual([{ parent: "family", photos: [PHOTO], startedAt: 1_000_000 }]);
});

it("the route's time limit is the one the marking run plans with", () => {
  expect(maxDuration * 1000).toBe(SEND_MARKING_LIMIT_MS);
});

it("the work after the answer settles without an error even when it cannot reach the database", async () => {
  await send();
  expect(f.later).toHaveLength(1);
  await expect(Promise.resolve(f.later[0]())).resolves.toBeUndefined();
});
