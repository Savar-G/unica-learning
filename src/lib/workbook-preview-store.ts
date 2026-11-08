import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database";
import type { WorkbookPreviewRequest } from "./workbook-progress-source";
import { replayWorkbookPreviewAny, type WorkbookPreviewRecord, type WorkbookPreviewRepository } from "./workbook-preview-record";

/** Dedicated SQL transport contract, bound to the generated schema below. */
export interface WorkbookPreviewSql {
  command(args: { p_action: "read" | "save"; p_actor: string; p_parent: string; p_child: string; p_book: string;
    p_revision: string; p_request: string; p_payload: string | null; p_hash: string | null }): Promise<unknown>;
}
export function workbookPreviewSql(db: SupabaseClient<Database>): WorkbookPreviewSql {
  return { async command(args) {
    const result = await db.rpc("workbook_preview_command", args);
    if (result.error) throw Error("preview-sql-unavailable");
    return result.data;
  } };
}
export function workbookPreviewRepository(sql: WorkbookPreviewSql): WorkbookPreviewRepository {
  async function command(action: "read" | "save", actor: string, r: WorkbookPreviewRequest, record?: WorkbookPreviewRecord) {
    const value = await sql.command({ p_action: action, p_actor: actor, p_parent: r.parentId, p_child: r.childId,
      p_book: r.workbookId, p_revision: r.printedRevision, p_request: r.requestId, p_payload: record?.payload ?? null, p_hash: record?.hash ?? null });
    if (!value || typeof value !== "object") throw Error("preview-sql-answer");
    return value as { status?: unknown; payload?: unknown; hash?: unknown };
  }
  return {
    async read(actor, request) {
      const a = await command("read", actor, request);
      if (a.status === "missing") return null;
      if (a.status !== "found" || typeof a.payload !== "string" || typeof a.hash !== "string") throw Error("preview-unavailable");
      const record = { payload: a.payload, hash: a.hash };
      if (!(await replayWorkbookPreviewAny(record, actor, request))) throw Error("preview-invalid-record");
      return record;
    },
    async save(actor, request, record) {
      if (!(await replayWorkbookPreviewAny(record, actor, request))) return "conflict";
      const a = await command("save", actor, request, record);
      if (!["saved", "duplicate", "conflict", "unavailable"].includes(String(a.status))) throw Error("preview-sql-answer");
      return a.status as "saved" | "duplicate" | "conflict" | "unavailable";
    },
  };
}
