import { beforeEach, expect, it, vi } from "vitest";
import type { AdminSession } from "@/lib/admin-store";
import { firstCustomerProfile } from "@/lib/workbook-sample-profiles";
vi.mock("server-only", () => ({}));
const f = vi.hoisted(() => ({ child: vi.fn(), books: vi.fn(), events: vi.fn(), requireAdmin: vi.fn(), inputs: vi.fn() }));
vi.mock("@/lib/admin-store", () => ({ getChild: f.child, getChildWorkbooks: f.books, requireAdmin: f.requireAdmin }));
vi.mock("@/lib/learning-events-store", () => ({ learningEventStore: () => ({ range: f.events }) }));
vi.mock("@/lib/report-loading", () => ({ loadReportInputs: f.inputs }));
vi.mock("@/lib/report-loading-server", () => ({ adminReportReader: () => ({}) }));
import { loadPreviewPlan } from "./load";
import PreviewPlanPage from "./page";

const id = "00000000-0000-4000-8000-000000000001";
let db: AdminSession["db"];
const reads: string[] = [];
let latest: object | null;
let stored: object | null;
const admin = () => ({ db, userId: "admin", email: "admin@example.test" });

beforeEach(() => {
  vi.clearAllMocks();
  reads.length = 0;
  latest = { id, completed_at: "2026-10-28T00:00:00Z", device: null };
  stored = { profile: firstCustomerProfile().assessment!.profile };
  // No insert, update, delete or run-start method exists in this read-only test client.
  function read(name: string) {
    reads.push(name);
    const chain = {
      select: () => chain, eq: () => chain, order: () => chain, limit: () => chain,
      maybeSingle: async () => ({ data: name === "admin_assessments" ? latest : name === "learner_profiles" ? stored : { minutes: 55, recommendation: "ahead" }, error: null }),
    };
    return chain;
  }
  db = { rpc: read, from: read } as unknown as AdminSession["db"];
  f.child.mockResolvedValue({ child: { id, parent_id: "", first_name: "Example", grade: 4, province: "BC", learning_styles: null, interests: null, math_feeling: null, learning_goal: null, weekly_time: null, learning_note: "PRIVATE_NOTE" }, family: {} });
  f.books.mockResolvedValue([]);
  f.events.mockResolvedValue([]);
  f.requireAdmin.mockResolvedValue(admin());
});

it("runs the public preview loader using only reads and returns U16 with the report check", async () => {
  const detail = await loadPreviewPlan(admin(), id);
  expect(detail?.preview.ok).toBe(true);
  if (!detail?.preview.ok) return;
  expect(detail.preview.plan.level).toBe(16);
  expect(detail.preview.why.inputs.find(i => i.label === "Report recommendation")).toMatchObject({ status: "Used", value: "Move ahead" });
  expect(reads).toEqual(["admin_assessments", "child_profiles", "admin_reports", "learner_profiles"]);
  expect(f.inputs).not.toHaveBeenCalled();
  expect(JSON.stringify(detail.preview)).not.toContain("PRIVATE_NOTE");
});

it("checks admin access before reading child data", async () => {
  f.requireAdmin.mockRejectedValue(new Error("NOT_FOUND"));
  await expect(PreviewPlanPage({ params: Promise.resolve({ id }), searchParams: Promise.resolve({}) })).rejects.toThrow("NOT_FOUND");
  expect(f.child).not.toHaveBeenCalled();
  expect(reads).toEqual([]);
});

it("refuses a malformed child id before any data read", async () => {
  expect(await loadPreviewPlan(admin(), "not-an-id")).toBeNull();
  expect(f.child).not.toHaveBeenCalled();
  expect(reads).toEqual([]);
});

it("does not use an older profile when the latest completed test has no readable profile", async () => {
  stored = null;
  f.inputs.mockResolvedValue(null);
  const detail = await loadPreviewPlan(admin(), id);
  expect(detail?.preview).toMatchObject({ ok: false, reason: expect.stringContaining("test profile could not be built") });
  expect(f.inputs).toHaveBeenCalledOnce();
});

it("keeps grade-only planning when there is no completed test", async () => {
  latest = null;
  const detail = await loadPreviewPlan(admin(), id);
  expect(detail?.preview.ok).toBe(true);
  if (detail?.preview.ok) expect(detail.preview.plan.level).toBe(13);
  expect(reads).toEqual(["admin_assessments", "child_profiles"]);
});
