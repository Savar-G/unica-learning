import { beforeEach, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";

vi.mock("server-only", () => ({}));
const h = vi.hoisted(() => ({ ai: vi.fn(() => { throw new Error("No AI factory may run"); }), layout: vi.fn(async () => "done" as const) }));
vi.mock("@/lib/workbook-ai", () => ({ workbookAi: h.ai }));
vi.mock("@/lib/workbook-layout-edit-deps", () => ({ runWorkbookLayoutEditWith: h.layout }));
import { runWorkbookEditWith } from "./workbook-edit-deps";

beforeEach(() => { h.ai.mockClear(); h.layout.mockClear(); });

it("dispatches a layout batch before constructing any writer, solver or API fallback", async () => {
  const requests: string[] = [];
  const db = createClient<Database>("https://synthetic.invalid", "synthetic-service-key", {
    auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: async input => {
      const url = new URL(String(input));requests.push(url.pathname);
      if (!url.pathname.endsWith("/workbook_edits")) throw new Error("Unexpected service read");
      return Response.json({ draft_id: "00000000-0000-4000-8000-000000000001", parent_id: "00000000-0000-4000-8000-000000000002", edit_kind: "layout" });
    } },
  });
  expect(await runWorkbookEditWith(db, "batch", { subscription: true, build: "source", timeLimitMs: 60_000 })).toBe("done");
  expect(h.layout).toHaveBeenCalledTimes(1);
  expect(h.ai).not.toHaveBeenCalled();
  expect(requests).toEqual(["/rest/v1/workbook_edits"]);
});
