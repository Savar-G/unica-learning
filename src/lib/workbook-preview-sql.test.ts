import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database";
import { describe, expect, it, vi } from "vitest";
import { workbookPreviewRepository, workbookPreviewSql } from "./workbook-preview-store";
import { previewActor, previewSourceFixture } from "./workbook-progress-source.fixture";
import { createWorkbookPreviewRecord } from "./workbook-preview-record";
vi.mock("server-only", () => ({}));

function database(reply: unknown, status = 200) {
  const fetch = vi.fn(async () => new Response(JSON.stringify(reply), { status, headers: { "Content-Type": "application/json" } }));
  const db = createClient<Database>("https://preview.invalid", "synthetic-key", {
    auth: { persistSession: false, autoRefreshToken: false }, global: { fetch },
  });
  return { db, fetch };
}
describe("generated-schema preview RPC adapter", () => {
  it("sends scoped read arguments and explicit null payloads through the real client", async () => {
    const { request } = previewSourceFixture();
    const { db, fetch } = database({ status: "missing" });
    expect(await workbookPreviewRepository(workbookPreviewSql(db)).read(previewActor, request)).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://preview.invalid/rest/v1/rpc/workbook_preview_command");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ p_action: "read", p_actor: previewActor,
      p_parent: request.parentId, p_child: request.childId, p_book: request.workbookId,
      p_revision: request.printedRevision, p_request: request.requestId, p_payload: null, p_hash: null });
  });
  it("sends exact canonical save bytes and the hash without another source read", async () => {
    const f = previewSourceFixture(), record = createWorkbookPreviewRecord(previewActor, f.request, f.frozen);
    const { db, fetch } = database({ status: "saved" });
    expect(await workbookPreviewRepository(workbookPreviewSql(db)).save(previewActor, f.request, record)).toBe("saved");
    expect(fetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body).toMatchObject({ p_action: "save", p_payload: record.payload, p_hash: record.hash });
  });
  it("refuses a denied RPC rather than reporting a missing preview", async () => {
    const { db } = database({ code: "42501", message: "denied" }, 403);
    const { request } = previewSourceFixture();
    await expect(workbookPreviewRepository(workbookPreviewSql(db)).read(previewActor, request))
      .rejects.toThrow("preview-sql-unavailable");
  });
});
