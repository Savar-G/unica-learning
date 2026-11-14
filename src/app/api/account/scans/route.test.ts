import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const CHILD = "22222222-2222-4222-8222-222222222222", OTHER_CHILD = "33333333-3333-4333-8333-333333333333";
const f = vi.hoisted(() => ({ marked: false, plan: { open: true, reason: "open" } as { open: boolean; reason: string }, asked: [] as unknown[] }));
vi.mock("@/lib/scan-pages-access", () => ({ markedFamily: async () => f.marked }));
vi.mock("@/lib/scan-marking-access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/scan-marking-access")>();
  const gate = async (input: { parentId: string; childId: string }) => {
    f.asked.push(input);
    return input.childId === "22222222-2222-4222-8222-222222222222" ? f.plan as never : { open: false, reason: "no_plan" } as const;
  };
  return { ...actual, scanChecksAccess: (...args: Parameters<typeof actual.scanChecksAccess>) => actual.scanChecksAccess(args[0], args[1], args[2], args[3], gate) };
});
vi.mock("@/lib/scan-marking-server", () => ({ markingAccess: async () => false }));
// The due sends of a first load (#3): recorded, with what they send.
const due = vi.hoisted(() => ({ asked: [] as unknown[], sent: [] as { parent: string; byChild: { child: string; sent: string[] }[] }[], order: [] as string[] }));
vi.mock("@/lib/scan-send", () => ({ sendDuePhotos: async (_db: unknown, o: unknown) => { due.asked.push(o); due.order.push("due"); return due.sent; } }));
vi.mock("@/lib/scan-send-marking", () => ({ SEND_MARKING_MAX_PHOTOS: 6, sendMarkingStart: async (_db: unknown, _p: string, _c: string, sent: string[]) => sent, markSentPhotos: async () => ({}) }));
const later = vi.hoisted(() => [] as (() => unknown)[]);
vi.mock("next/server", () => ({ after: (task: () => unknown) => { later.push(task); } }));
vi.mock("@/lib/scan-stack-server", () => ({ readScanStack: async (_db: unknown, _parent: string, _child: string, checks: boolean) => { due.order.push("stack"); return { photos: [], pages: [], echoed: checks }; } }));
// The family's children: only CHILD is this family's.
const children = { from: (table: string) => ({ select: () => ({ eq: (_c: string, id: string) => ({ eq: (_p: string, owner: string) => ({
  maybeSingle: async () => ({ data: table === "children" && owner === "family" && id === "22222222-2222-4222-8222-222222222222" ? { id } : null, error: null }),
}) }) }) }) };
vi.mock("@/lib/scan-photo-server", () => ({
  scanJson: (data: unknown, status = 200) => Response.json(data, { status }),
  scanSession: async () => ({ childOpen: async () => true, parent: "family", admin: children }),
}));
import { GET } from "./route";

const stack = async (child = CHILD) => (await GET(new Request(`https://unicalearning.com/api/account/scans?child=${child}`))).json();

beforeEach(() => { Object.assign(f, { marked: false, plan: { open: true, reason: "open" }, asked: [] }); Object.assign(due, { asked: [], sent: [], order: [] }); later.length = 0; vi.stubEnv("SCAN_MARKING_ENABLED", "families"); });
afterEach(() => vi.unstubAllEnvs());

it.each(["open", "ending_until_end"])("families mode gives a real family the checks while the child's plan is %s", async (reason) => {
  f.plan = { open: true, reason };
  expect(await stack()).toMatchObject({ checks: true, echoed: true });
});

it.each(["no_plan", "ended", "payment_failed", "paused", "unknown", "read_failed"])("families mode gives no checks when the plan answer is %s", async (reason) => {
  f.plan = { open: false, reason };
  expect(await stack()).toMatchObject({ checks: false, echoed: false });
});

it("families mode gives no checks for another family's child", async () => {
  expect(await stack(OTHER_CHILD)).toMatchObject({ checks: false, echoed: false });
});

it.each(["test-only", "off"])("with switch %s the checks are unchanged: test families and admins only", async (flag) => {
  vi.stubEnv("SCAN_MARKING_ENABLED", flag);
  expect(await stack()).toMatchObject({ checks: false });
  f.marked = true;
  expect(await stack()).toMatchObject({ checks: true });
  expect(f.asked).toEqual([]);
});

it("the first load sends the family's pages whose Undo passed while nobody was here, before it reads the stack (#3)", async () => {
  due.sent = [{ parent: "family", byChild: [{ child: CHILD, sent: ["a"] }] }];
  await (await GET(new Request(`https://unicalearning.com/api/account/scans?child=${CHILD}&due=1`))).json();
  expect(due.asked).toEqual([{ parent: "family" }]);
  expect(due.order).toEqual(["due", "stack"]);
  // Marking starts on them after the answer, as Send starts it.
  expect(later).toHaveLength(1);
  // The page's polls do not ask again.
  await stack();
  expect(due.asked).toHaveLength(1);
});
