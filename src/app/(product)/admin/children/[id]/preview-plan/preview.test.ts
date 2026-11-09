import { beforeEach, expect, it, vi } from "vitest";
import type { AdminSession } from "@/lib/admin-store";
import { firstCustomerProfile } from "@/lib/workbook-sample-profiles";
import { WORKBOOK_LEARNER_DERIVED_VERSION } from "@/lib/workbook-profile-freshness";
import { createSession, storedTest } from "@/lib/assessment";
import { allRight, takeTest } from "@/lib/assessment/scripted-child";
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
let instructions: object | null;
const admin = () => ({ db, userId: "admin", email: "admin@example.test" });

beforeEach(() => {
  vi.clearAllMocks();
  reads.length = 0;
  latest = { id, completed_at: "2026-10-28T00:00:00Z", device: null };
  instructions = null;
  stored = { schema_version: 1, profile: { ...firstCustomerProfile().assessment!.profile, workbookDerivedVersion: WORKBOOK_LEARNER_DERIVED_VERSION } };
  // No insert, update, delete or run-start method exists in this read-only test client.
  function read(name: string) {
    reads.push(name);
    const chain = {
      select: () => chain, eq: () => chain, order: () => chain, limit: () => chain,
      maybeSingle: async () => ({ data: name === "admin_assessments" ? latest : name === "learner_profiles" ? stored : name === "workbook_instructions" ? instructions : { minutes: 55, recommendation: "ahead" }, error: null }),
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
  expect(reads).toEqual(["admin_assessments", "child_profiles", "workbook_instructions", "admin_reports", "learner_profiles"]);
  expect(detail.preview.plan.instructions).toBeUndefined();
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
  expect(reads).toEqual(["admin_assessments", "child_profiles", "workbook_instructions"]);
});

// Codex's public-loader reproduction from /tmp/pr570-review-probes/load.test.ts.
it("refuses an old schema-1 profile with missing facts when the raw assessment cannot be read", async () => {
  const old = structuredClone(firstCustomerProfile().assessment!.profile);
  const { facts: removed, ...withoutFacts } = old;
  expect(removed).toBeTruthy();
  stored = { schema_version: 1, profile: withoutFacts };
  f.inputs.mockResolvedValue(null);
  expect((await loadPreviewPlan(admin(), id))?.preview.ok).toBe(false);
  expect(f.inputs).toHaveBeenCalledOnce();
});

it("gives a plain refusal when reading the raw assessment fails", async () => {
  stored = { schema_version: 1, profile: firstCustomerProfile().assessment!.profile };
  f.inputs.mockRejectedValue(new Error("private database error"));
  expect((await loadPreviewPlan(admin(), id))?.preview).toMatchObject({ ok: false, reason: "The test profile could not be built from the assessment. Check the child's profile before making the book." });
});

it.each(["row schema", "JSON schema", "derived version", "facts"])("rebuilds the same stale learner facts a real run rebuilds: %s", async kind => {
  const old = { ...firstCustomerProfile().assessment!.profile, workbookDerivedVersion: WORKBOOK_LEARNER_DERIVED_VERSION };
  let schemaVersion = 1;
  if (kind === "row schema") schemaVersion = 99;
  if (kind === "JSON schema") old.schemaVersion = 99 as typeof old.schemaVersion;
  if (kind === "derived version") old.workbookDerivedVersion--;
  const value = kind === "facts" ? Object.fromEntries(Object.entries(old).filter(([key]) => key !== "facts")) : old;
  stored = { schema_version: schemaVersion, profile: value };
  const session = createSession({ grade: 4, province: "BC" }, 71);
  const { placement, asked } = takeTest({ grade: 4, province: "BC" }, 71, allRight);
  f.inputs.mockResolvedValue({ assessment: { id, childId: id, placement, help: "no", test: storedTest(session) },
    profileAnswers: () => asked.map(question => ({ question, response: question.answer, correct: true, misconception: null, timeMs: 20_000, work: { required: false, drawing: false, typed: false }, readAloud: null, away: null })) });
  const detail = await loadPreviewPlan(admin(), id);
  expect(f.inputs).toHaveBeenCalledOnce();
  expect(detail?.preview.ok).toBe(true);
  if (detail?.preview.ok) {
    expect(detail.preview.plan.level).toBe(16);
    expect(detail.preview.plan.personal?.working?.working).toBe(5);
    expect(detail.preview.plan.personal?.soft.sources?.test.suggested).toEqual([]);
    expect(detail.preview.why.warnings).toContain("This preview rebuilt older test facts without AI. A real run can add new AI notes after it rebuilds those facts.");
  }
});

it("plans the preview with the child's saved book instructions and shows what each did", async () => {
  instructions = { instructions: { version: 1, startLevel: "U19", teachMore: [], teachLess: [], addReview: ["5.5"], difficulty: null }, updated_at: "2026-11-08T00:00:00Z", updated_by_email: "admin@example.test" };
  const detail = await loadPreviewPlan(admin(), id);
  expect(detail?.preview.ok).toBe(true);
  if (!detail?.preview.ok) return;
  expect(detail.preview.plan.level).toBe(19);
  expect(detail.preview.plan.instructions?.outcomes.map(o => [o.section, o.value, o.applied])).toEqual([["start-level", "U19", true], ["add-review", "5.5", true]]);
  const page = await PreviewPlanPage({ params: Promise.resolve({ id }), searchParams: Promise.resolve({}) });
  const { renderToStaticMarkup } = await import("react-dom/server");
  const html = renderToStaticMarkup(page);
  expect(html).toContain("Book instructions used");
  expect(html).toContain("Applied");
});
