import { after } from "next/server";
import { adminSession } from "@/lib/admin-store";
import { adminClient } from "@/lib/supabase-auth";
import type { Json } from "@/lib/database.types";
import { isUuid } from "@/lib/workbook-content";
import { runWorkbookJobNow } from "@/lib/workbook-job-server";

export const maxDuration = 300;
export async function POST(request: Request, ctx: RouteContext<"/api/admin/workbooks/runs/[id]/edit">) {
  const actor = await adminSession();
  if (!actor) return new Response("Not found", { status: 404 });
  if (request.headers.get("origin") !== new URL(request.url).origin) return new Response("Forbidden", { status: 403 });
  const db = adminClient();
  if (!db) return Response.json({ reason: "The database is unavailable." }, { status: 503 });
  const { id } = await ctx.params;
  if (!isUuid(id)) return new Response("Not found", { status: 404 });
  const run = await db.from("workbook_runs").select("draft_id,status").eq("id", id).maybeSingle();
  if (run.error || !run.data?.draft_id || run.data.status !== "done") return Response.json({ reason: "This draft is unavailable." }, { status: 409 });
  let body: { revision: number; send?: boolean; delete?: boolean; comment?: unknown };
  try { body = await request.json(); } catch { return Response.json({ reason: "Check the fields." }, { status: 400 }); }
  if (!body || !Number.isInteger(body.revision) || body.revision < 1) return Response.json({ reason: "Reload the page." }, { status: 400 });
  const runner = process.env.WORKBOOK_RUNNER === "server" ? "server" : "mac";
  const result = body.send
    ? await db.rpc("send_workbook_comments", { p_draft: run.data.draft_id, p_revision: body.revision, p_by: actor.userId, p_email: actor.email, p_runner: runner })
    : await db.rpc("save_workbook_comment", { p_draft: run.data.draft_id, p_revision: body.revision, p_comment: body.comment as Json, p_by: actor.userId, p_email: actor.email, p_delete: !!body.delete });
  if (result.error) return Response.json({ reason: "The comments could not be saved. Reload the page and try again." }, { status: 409 });
  const data = result.data as { status?: string; id?: string; reason?: string };
  if (data.status === "queued" && runner === "server") after(async () => { await runWorkbookJobNow(data.id!, { origin: new URL(request.url).origin }); });
  return Response.json(data, { status: data.status === "refused" ? 409 : body.send ? 202 : 200 });
}
