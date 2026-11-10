import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { getChildRuns, listWorkbookArea, type AdminSession } from "@/lib/admin-store";
import { runProgress, type RunActivity } from "@/lib/workbook-run-progress";
import type { WorkbookRun } from "@/lib/workbook-job";
import type { Database } from "@/lib/database";
vi.mock("server-only", () => ({}));

const now = new Date("2026-11-05T12:00:00Z");
const ago = (seconds: number) => new Date(+now - seconds * 1000).toISOString();
const run = (overrides: Partial<WorkbookRun> = {}): WorkbookRun => ({
  id: "00000000-0000-4000-8000-000000000001", childId: "00000000-0000-4000-8000-000000000002", parentId: "parent", number: 1,
  runner: "mac", status: "running", step: "write", createdAt: ago(900), startedAt: ago(800), heartbeatAt: ago(2),
  finishedAt: null, attempts: 1, maxAttempts: 2, donePages: 0, totalPages: 80, errors: [], error: null, resumes: 0,
  draftId: null, draftKey: "draft", startedBy: { id: "admin", email: "admin@example.com" }, ...overrides,
});
const empty: RunActivity = { pageTimes: [], lastWorkAt: null };

describe("saved-work and resume review corrections", () => {
  it("warns about a first writing call with no saved result", () => {
    const result = runProgress(run(), { ...empty, writingStartedAt: ago(180) }, now);
    expect(result.signal.warn).toBe(true);
    expect(result.signal.text).toContain("saved for 3 minutes");
  });
  it("does not include planning time in the first-writing warning", () => {
    const result = runProgress(run(), { ...empty, writingStartedAt: ago(30) }, now);
    expect(result.signal.warn).toBe(false);
    expect(result.signal.text).not.toContain("Last saved work");
  });
  it.each([null, ago(600)])("a retry resets the wait without inventing saved work, saved=%s", (lastWorkAt) => {
    const result = runProgress(run({ attempts: 2, errors: [{ attempt: 1, at: ago(30), error: "timeout" }] }), { ...empty, lastWorkAt }, now);
    expect(result.signal.warn).toBe(false);
    expect(result.signal.text).not.toContain("Last saved work 30 seconds ago");
    expect(result.signal.text).toContain("No new page or AI answer has been saved yet");
  });
  it("reports actual saved work after a retry", () => {
    const result = runProgress(run({ attempts: 2, errors: [{ attempt: 1, at: ago(30), error: "timeout" }] }), { ...empty, lastWorkAt: ago(12) }, now);
    expect(result.signal.text).toBe("Working. Last saved work 12 seconds ago.");
  });
  it("excludes kept pages after a short stored resume", () => {
    const kept = Array.from({ length: 60 }, (_, i) => ago(245 - i));
    const activity = { pageTimes: [...kept, ago(65), ago(35), ago(5)], lastWorkAt: ago(5), resumedAt: ago(125) };
    expect(runProgress(run({ resumes: 1, donePages: 63 }), activity, now).timeLeft).toBe("Working out the time left.");
    const current = Array.from({ length: 8 }, (_, i) => ago(215 - i * 30));
    expect(runProgress(run({ resumes: 2, donePages: 68 }), { pageTimes: [...kept.map(() => ago(600)), ...current], lastWorkAt: ago(5), resumedAt: ago(240) }, now).timeLeft).toBe("About 8 minutes left.");
  });
  it("does not infer a resume boundary from an old page burst", () => {
    const pageTimes = Array.from({ length: 20 }, (_, i) => ago(195 - i * 10));
    expect(runProgress(run({ resumes: 1, donePages: 20 }), { pageTimes, lastWorkAt: ago(5) }, now).timeLeft).toBe("Working out the time left.");
  });
});

it("the public admin lists load the stored resume and writing boundaries", async () => {
  const requested: URL[] = [], r = run({ resumes: 1, donePages: 63 });
  const asked: string[][] = [];
  const db = createClient<Database>("https://example.com", "test", { global: { fetch: async (input, init) => {
    const url = new URL(String(input)); requested.push(url);
    const table = url.pathname.split("/").at(-1);
    let rows: unknown[] = [];
    if (table === "workbook_runs") rows = [{ id: r.id, parent_id: r.parentId, child_id: r.childId, status: "running", step: "write", created_at: r.createdAt, started_at: r.startedAt, heartbeat_at: r.heartbeatAt, attempts: 1, max_attempts: 2, resumes: 1, done_pages: 63, total_pages: 80, errors: [], runner: "mac", draft_id: null }];
    // admin_run_activity: the plan's time, the newest run-resumed audit time and the page times, per run.
    if (table === "admin_run_activity") {
      const ids = (JSON.parse(String(init?.body)) as { p_runs: string[] }).p_runs;
      asked.push(ids);
      rows = ids.map((run_id) => ({ run_id, plan_at: ago(700), resumed_at: ago(125), last_call_at: null, last_solve_at: null,
        page_times: [...Array.from({ length: 60 }, (_, i) => ago(245 - i)), ...[65, 35, 5].map((s) => ago(s))] }));
    }
    return Response.json(rows);
  } } });
  const session: AdminSession = { db, userId: "admin", email: "admin@example.com" };
  for (const rows of [await getChildRuns(session, r.childId), (await listWorkbookArea(session)).runs.rows]) {
    expect(rows[0].activity).toMatchObject({ resumedAt: ago(125), writingStartedAt: ago(700) });
    expect(runProgress(rows[0].run, rows[0].activity, now).timeLeft).toBe("Working out the time left.");
  }
  // One activity request per list, for the running run only.
  expect(asked).toEqual([[r.id], [r.id]]);
  expect(requested.filter((u) => /workbook_(audit|run_pages|run_frames|run_calls|run_solves)$/.test(u.pathname))).toHaveLength(0);
});
