import { createClient } from "@supabase/supabase-js";
import { expect, it, vi } from "vitest";
import { getChildRuns, listWorkbookArea, type AdminSession } from "@/lib/admin-store";
vi.mock("server-only", () => ({}));
const child = "00000000-0000-4000-8000-000000000001";
const draft = "00000000-0000-4000-8000-000000000002";
it("R428-6 both lists read the latest revision counts and render problems", async () => {
  const asked: string[][] = [];
  const db = createClient("https://example.com", "test", { global: { fetch: async (input, init) => {
    const url = new URL(String(input));
    const table = url.pathname.split("/").at(-1);
    let rows: unknown[] = [];
    if (table === "workbook_runs") rows = [{ id: "run", child_id: child, draft_id: draft, errors: [] }];
    if (table === "workbook_drafts") rows = [{ id: draft, schema_version: 2, pages: 60, questions: 150, failed: 9, not_checked: 4, failed_pages: 3, cover: {} }];
    // admin_latest_draft_revisions answers each draft's latest revision only (its SQL orders by revision, limit 1).
    if (table === "admin_latest_draft_revisions") {
      const ids = (JSON.parse(String(init?.body)) as { p_drafts: string[] }).p_drafts;
      asked.push(ids);
      rows = ids.map((d) => ({ draft_id: d, revision: 2, counts: { pages: 60, questions: 150, failed: 1, notChecked: 2, failedPages: 0 }, render_problems: [] }));
    }
    return Response.json(rows);
  } } });
  const session = { db, userId: "admin", email: "admin@example.com" } as AdminSession;
  for (const rows of [await getChildRuns(session, child), (await listWorkbookArea(session)).runs.rows]) {
    expect(rows[0].counts).toMatchObject({ failed: 1, notChecked: 2, failedPages: 0 });
    expect(rows[0].notRendered).toBe(0);
  }
  expect(asked).toEqual([[draft], [draft]]);
});
