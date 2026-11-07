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
vi.mock("@/lib/scan-stack-server", () => ({ readScanStack: async (_db: unknown, _parent: string, _child: string, checks: boolean) => ({ photos: [], pages: [], echoed: checks }) }));
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

beforeEach(() => { Object.assign(f, { marked: false, plan: { open: true, reason: "open" }, asked: [] }); vi.stubEnv("SCAN_MARKING_ENABLED", "families"); });
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
