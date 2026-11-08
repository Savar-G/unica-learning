import { after } from "next/server";
import { adminSession } from "@/lib/admin-store";
import { adminClient } from "@/lib/supabase-auth";
import type { Json } from "@/lib/database.types";
import { isUuid } from "@/lib/workbook-content";
import { runWorkbookJobNow } from "@/lib/workbook-job-server";
import { workbookEditProgress } from "@/lib/workbook-edit-progress";
import { commentFromRow, workbookEditStore } from "@/lib/workbook-edit-store";
import { layoutEditPlan } from "@/lib/workbook-layout-edit";
import { toJson } from "@/lib/database";

export const maxDuration = 300;

/** Lightweight, read only polling. Do not load a draft, frame, image, solve ledger or audit history here. */
export async function GET(request: Request, ctx: RouteContext<"/api/admin/workbooks/runs/[id]/edit">) {
  const headers = { "Cache-Control": "private, no-store", "Vary": "Cookie" };
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(8_000)]);
  try {
    const actor = await adminSession(signal);
    if (!actor) return new Response("Not found", { status: 404, headers });
    const { id } = await ctx.params;
    if (!isUuid(id)) return new Response("Not found", { status: 404, headers });
    const run = await actor.db.from("workbook_runs").select("draft_id").eq("id", id).abortSignal(signal).maybeSingle();
    if (run.error) throw new Error("edit_progress_run");
    if (!run.data?.draft_id) return new Response("Not found", { status: 404, headers });
    const batch = await actor.db.from("workbook_edits")
      .select("id,base_revision,status,heartbeat_at,checkpoints,frame").eq("draft_id", run.data.draft_id)
      .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(1).abortSignal(signal).maybeSingle();
    if (batch.error) throw new Error("edit_progress_batch");
    if (!batch.data) return Response.json({ batch: null }, { headers });
    const comments = await actor.db.from("workbook_comments").select("batch_id,page_number", { count: "exact" })
      .eq("batch_id", batch.data.id).limit(501).abortSignal(signal);
    if (comments.error || comments.count === null || !comments.data || comments.count > 500
      || comments.data.length !== comments.count) throw new Error("edit_progress_comments");
    return Response.json({ batch: workbookEditProgress(batch.data, comments.data, Date.now()) }, { headers });
  } catch { return Response.json({ error: "Progress is unavailable. Retrying shortly." }, { status: 503, headers }); }
}

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
  let body: { revision: number; send?: boolean; delete?: boolean; comment?: unknown; layout?: unknown };
  try { body = await request.json(); } catch { return Response.json({ reason: "Check the fields." }, { status: 400 }); }
  if (!body || !Number.isInteger(body.revision) || body.revision < 1) return Response.json({ reason: "Reload the page." }, { status: 400 });
  const runner = process.env.WORKBOOK_RUNNER === "server" ? "server" : "mac";
  let plan = null;
  if (body.layout !== undefined) {
    const build = process.env.VERCEL_GIT_COMMIT_SHA;
    if (!build || !/^[a-f0-9]{40}$/.test(build)) return Response.json({ reason: "The current layout version is unavailable. Try again when its deployment is ready." }, { status: 503 });
    if (!body.layout || typeof body.layout !== "object" || !("reviewed" in body.layout) || body.layout.reviewed !== true) {
      return Response.json({ reason: "Review the layout correction before rendering." }, { status: 400 });
    }
    const snapshot = await workbookEditStore(db).load(run.data.draft_id);
    const comments = await db.from("workbook_comments").select("*", { count: "exact" }).eq("draft_id", run.data.draft_id)
      .in("status", ["pending", "failed"]).order("created_at").limit(501);
    if (!snapshot || snapshot.revision !== body.revision || comments.error || comments.count === null || comments.count > 500
      || !comments.data || comments.data.length !== comments.count) return Response.json({ reason: "Reload the current layout comments." }, { status: 409 });
    plan = layoutEditPlan(body.layout, comments.data.map(commentFromRow), snapshot, build);
    if (!plan) return Response.json({ reason: "Review the template correction, each result and its affected pages before rendering." }, { status: 400 });
  }
  const result = plan ? await db.rpc("queue_workbook_layout_edit", { p_draft: run.data.draft_id, p_revision: body.revision,
    p_plan: toJson({ ...plan, reviewed: true }), p_by: actor.userId, p_email: actor.email })
    : body.send ? await db.rpc("send_workbook_comments", { p_draft: run.data.draft_id, p_revision: body.revision, p_by: actor.userId, p_email: actor.email, p_runner: runner })
      : await db.rpc("save_workbook_comment", { p_draft: run.data.draft_id, p_revision: body.revision, p_comment: body.comment as Json, p_by: actor.userId, p_email: actor.email, p_delete: !!body.delete });
  if (result.error) return Response.json({ reason: "The comments could not be saved. Reload the page and try again." }, { status: 409 });
  const data = result.data as { status?: string; id?: string; runner?: string; reason?: string };
  if (data.status === "queued" && (data.runner ?? runner) === "server") after(async () => { await runWorkbookJobNow(data.id!, { origin: new URL(request.url).origin }); });
  return Response.json(data, { status: data.status === "refused" ? 409 : data.status === "queued" || body.send ? 202 : 200 });
}
