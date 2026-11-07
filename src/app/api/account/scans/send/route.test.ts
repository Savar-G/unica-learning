import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const CHILD = "22222222-2222-4222-8222-222222222222", OTHER_CHILD = "33333333-3333-4333-8333-333333333333";
const PHOTO = "44444444-4444-4444-8444-444444444444";
const f = vi.hoisted(() => ({ marked: false, plan: { open: true, reason: "open" } as { open: boolean; reason: string }, asked: [] as unknown[], sent: [] as unknown[] }));
vi.mock("@/lib/scan-pages-access", () => ({ markedFamily: async () => f.marked }));
// The real admission rule, with the plan gate answered by the test (the dashboard's gate is not on main yet).
vi.mock("@/lib/scan-marking-access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/scan-marking-access")>();
  const gate = async (input: { parentId: string; childId: string }) => {
    f.asked.push(input);
    return input.childId === "22222222-2222-4222-8222-222222222222" ? f.plan as never : { open: false, reason: "no_plan" } as const;
  };
  return { ...actual, scanChecksAccess: (...args: Parameters<typeof actual.scanChecksAccess>) => actual.scanChecksAccess(args[0], args[1], args[2], args[3], gate) };
});
// The family's children: only CHILD is this family's.
const children = { from: (table: string) => ({ select: () => ({ eq: (_c: string, id: string) => ({ eq: (_p: string, owner: string) => ({
  maybeSingle: async () => ({ data: table === "children" && owner === "family" && id === "22222222-2222-4222-8222-222222222222" ? { id } : null, error: null }),
}) }) }) }) };
vi.mock("@/lib/scan-photo-server", () => ({
  scanJson: (data: unknown, status = 200) => Response.json(data, { status }),
  scanSession: async () => ({ parent: "family", admin: { ...children, rpc: async (name: string, args: unknown) => { f.sent.push({ name, args }); return { data: 1, error: null }; } } }),
}));
import { POST } from "./route";

const send = (child = CHILD) => POST(new Request("https://unicalearning.com/api/account/scans/send", {
  method: "POST", headers: { Origin: "https://unicalearning.com" }, body: JSON.stringify({ child, ids: [PHOTO] }),
}));

beforeEach(() => { Object.assign(f, { marked: false, plan: { open: true, reason: "open" }, asked: [], sent: [] }); vi.stubEnv("SCAN_MARKING_ENABLED", "families"); });
afterEach(() => vi.unstubAllEnvs());

it.each(["open", "ending_until_end"])("families mode sends a real family's pages while the child's plan is %s", async (reason) => {
  f.plan = { open: true, reason };
  const r = await send();
  expect(r.status).toBe(200); expect(await r.json()).toEqual({ sent: 1 });
  expect(f.sent).toEqual([{ name: "send_scan_photos", args: { p_parent: "family", p_child: CHILD, p_ids: [PHOTO] } }]);
  expect(f.asked).toEqual([{ parentId: "family", childId: CHILD }]);
});

it.each(["no_plan", "ended", "payment_failed", "paused", "unknown", "read_failed"])("families mode refuses Send when the plan answer is %s", async (reason) => {
  f.plan = { open: false, reason };
  const r = await send();
  expect(r.status).toBe(404); expect(await r.json()).toEqual({ error: "refused" });
  expect(f.sent).toEqual([]);
});

it("families mode refuses Send for another family's child or a stopped sibling", async () => {
  expect((await send(OTHER_CHILD)).status).toBe(404);
  expect(f.sent).toEqual([]);
});

it("families mode keeps Send for test families and admins without a plan", async () => {
  f.marked = true; f.plan = { open: false, reason: "no_plan" };
  expect((await send()).status).toBe(200);
  expect(f.asked).toEqual([]);
});

it.each(["test-only", "off"])("with switch %s Send is unchanged: test families and admins only", async (flag) => {
  vi.stubEnv("SCAN_MARKING_ENABLED", flag);
  expect((await send()).status).toBe(404);
  f.marked = true;
  expect((await send()).status).toBe(200);
  expect(f.asked).toEqual([]);
});
