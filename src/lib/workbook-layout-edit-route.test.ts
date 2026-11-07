import { createClient } from "@supabase/supabase-js";
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import type { Database } from "./database";
import type { EditSnapshot } from "./workbook-edit";
import { generateWorkbook } from "./workbook-generator";
import { curriculumFor } from "./workbook-curriculum";
import { planLevel, planWorkbook } from "./workbook-plan";
import { workbookFakeAi } from "./workbook-ai-fake";
import { keySolver } from "./workbook-solve-check";
import { memoryDraftStore } from "./workbook-draft-memory";

vi.mock("server-only", () => ({}));
const h = vi.hoisted(() => ({ admin: true, db: null as unknown, load: vi.fn(), after: vi.fn(), job: vi.fn() }));
vi.mock("@/lib/admin-store", () => ({ adminSession: async () => h.admin ? { db: h.db, userId: "00000000-0000-4000-8000-000000000099", email: "synthetic@example.invalid" } : null }));
vi.mock("@/lib/supabase-auth", () => ({ adminClient: () => h.db }));
vi.mock("@/lib/workbook-job-server", () => ({ runWorkbookJobNow: h.job }));
vi.mock("next/server", () => ({ after: h.after }));
vi.mock("@/lib/workbook-edit-store", async importOriginal => ({ ...await importOriginal<typeof import("./workbook-edit-store")>(), workbookEditStore: () => ({ load: h.load }) }));
import { POST } from "@/app/api/admin/workbooks/runs/[id]/edit/route";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const run = id(1), draft = id(2), parent = id(3), child = id(4), comment = id(5), batch = id(6), build = "a".repeat(40);
let snapshot: EditSnapshot;
beforeAll(async () => {
  const curriculum = curriculumFor("bc")!;
  const planned = planWorkbook({ profile: { standards: [] }, grade: 1, level: planLevel(curriculum, "U3")!, passed: {}, workbook: { number: 1, inLevel: 0 }, reviews: [], missedReviews: [], misses: [], pausedWeeks: 0, support: null, unassessedUnits: [] });
  if (!planned.ok) throw new Error(planned.reason);
  const input = { workbookId: draft, childId: child, number: 1, profileBuild: null, plan: planned.plan, curriculum, book: { child: "Synthetic" } };
  let serial = 0;
  const result = await generateWorkbook(input, { ai: workbookFakeAi({ NODE_ENV: "test", WORKBOOK_AI_FAKE: "on" })!, solver: keySolver(), fit: { fits: async () => ({ ok: true }) }, store: memoryDraftStore({ [child]: parent }), qrToken: () => `synthetic-qr-${++serial}`.padEnd(24, "x") });
  if (result.status !== "stored") throw new Error(JSON.stringify(result));
  snapshot = { draft: result.draft, input, parentId: parent, revision: 1, rendering: { pdfPath: "old.pdf", pages: [] }, problems: [] };
});
type Call = { path: string; params: URLSearchParams; body: Record<string, unknown> | null };
let calls: Call[], rows: Record<string, unknown>, count: number, queued: object;
const context = (key = run) => ({ params: Promise.resolve({ id: key }) });
const body = () => ({ revision: 1, layout: { reviewed: true, pages: [1], results: [{ id: comment, page: 1, status: "partial", note: "The remaining request stays open." }] } });
const request = (value: unknown = body(), origin = "https://synthetic.invalid") => new Request(`https://synthetic.invalid/api/admin/workbooks/runs/${run}/edit`, {
  method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(value),
});
beforeEach(() => {
  h.admin = true;h.load.mockReset().mockResolvedValue(snapshot);h.after.mockReset();h.job.mockReset();
  vi.stubEnv("VERCEL_GIT_COMMIT_SHA", build);vi.stubEnv("WORKBOOK_RUNNER", "server");
  calls = [];count = 1;queued = { status: "queued", id: batch, runner: "mac" };
  rows = { workbook_runs: { status: "done", draft_id: draft }, workbook_comments: [{
    id: comment, draft_id: draft, parent_id: parent, child_id: child, revision: 1, page_number: 1, question_number: null,
    x: .5, y: .5, note: "Make this easier to read.", route: "layout", result_note: null, item: null,
    actor_id: id(99), actor_email: "synthetic@example.invalid", created_at: "2026-11-07T00:00:00Z", status: "pending",
    error: null, batch_id: null, before_value: null, after_value: null, request_key: null, client_request_key: null,
  }] };
  h.db = createClient<Database>("https://synthetic.invalid", "synthetic-service-key", { auth: { persistSession: false, autoRefreshToken: false }, global: {
    fetch: async (input, init) => {
      const url = new URL(String(input));calls.push({ path: url.pathname, params: url.searchParams, body: init?.body ? JSON.parse(String(init.body)) : null });
      if (url.pathname.includes("/rpc/")) return Response.json(queued);
      const table = url.pathname.split("/").at(-1)!;
      if (!(table in rows)) throw new Error(`Unexpected read: ${table}`);
      return Response.json(rows[table], { headers: table === "workbook_comments" ? { "Content-Range": `0-0/${count}` } : {} });
    },
  } });
});
afterEach(() => vi.unstubAllEnvs());

it("queues reviewed stored-page rendering on the Mac even when question jobs use the server", async () => {
  const response = await POST(request(), context());
  expect(response.status).toBe(202);
  expect(await response.json()).toEqual(queued);
  const rpc = calls.find(c => c.path.includes("/rpc/"))!;
  expect(rpc.path).toBe("/rest/v1/rpc/queue_workbook_layout_edit");
  expect(rpc.body).toMatchObject({ p_draft: draft, p_revision: 1, p_plan: { reviewed: true, build, pages: [1], results: body().layout.results } });
  expect(calls.find(c => c.path.endsWith("/workbook_comments"))?.params.get("draft_id")).toBe(`eq.${draft}`);
  expect(h.after).not.toHaveBeenCalled();expect(h.job).not.toHaveBeenCalled();
});
it("records unsupported-only review results without starting a renderer", async () => {
  const value = body();value.layout.results[0].status = "unsupported";
  queued = { status: "layout-review", reason: "These comments remain open." };
  const response = await POST(request(value), context());
  expect(response.status).toBe(200);expect(await response.json()).toEqual(queued);expect(h.after).not.toHaveBeenCalled();
});
it("refuses anonymous callers and cross-origin writes before private reads", async () => {
  h.admin = false;expect((await POST(request(), context())).status).toBe(404);expect(calls).toHaveLength(0);
  h.admin = true;expect((await POST(request(body(), "https://foreign.invalid"), context())).status).toBe(403);expect(calls).toHaveLength(0);
});
it.each(["bad", "missing"])("refuses a %s run without a queue request", async state => {
  if (state === "missing") rows.workbook_runs = null;
  const response = await POST(request(), context(state === "bad" ? "invalid" : run));
  expect(response.status).toBe(state === "bad" ? 404 : 409);expect(calls.some(c => c.path.includes("/rpc/"))).toBe(false);
});
it.each(["build", "review"])("refuses a missing %s before loading a whole snapshot", async field => {
  const value = body();if (field === "build") vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "");else value.layout.reviewed = false;
  expect((await POST(request(value), context())).status).toBe(field === "build" ? 503 : 400);
  expect(h.load).not.toHaveBeenCalled();expect(calls).toHaveLength(1);
});
it.each(["revision", "count", "limit", "foreign comment"])("refuses a stale or incomplete %s input", async field => {
  const value = body();
  if (field === "revision") h.load.mockResolvedValue({ ...snapshot, revision: 2 });
  if (field === "count") count = 2;
  if (field === "limit") count = 501;
  if (field === "foreign comment") value.layout.results[0].id = id(88);
  expect((await POST(request(value), context())).status).toBe(field === "foreign comment" ? 400 : 409);
  expect(calls.some(c => c.path.includes("/rpc/"))).toBe(false);
});
it("reports a database refusal without claiming a queued correction", async () => {
  queued = { status: "refused", reason: "This workbook is printed or shipped. It cannot change." };
  const response = await POST(request(), context());
  expect(response.status).toBe(409);expect(await response.json()).toEqual(queued);expect(h.after).not.toHaveBeenCalled();
});
it("retains server admission for the existing question-text path", async () => {
  queued = { status: "queued", id: batch };
  expect((await POST(request({ revision: 1, send: true }), context())).status).toBe(202);
  expect(calls.at(-1)?.path).toBe("/rest/v1/rpc/send_workbook_comments");expect(h.after).toHaveBeenCalledTimes(1);expect(h.load).not.toHaveBeenCalled();
});
