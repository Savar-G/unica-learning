import { after } from "next/server";
import { adminSession } from "@/lib/admin-store";
import { isUuid } from "@/lib/assessment-store";
import { adminClient } from "@/lib/supabase-auth";
import { startWorkbookRun } from "@/lib/workbook-job";
import { workbookRunStore } from "@/lib/workbook-job-store";
import { runWorkbookJobNow } from "@/lib/workbook-job-server";

// #312: "Prepare next workbook" for a child. Starts a run (one at a time per child; a run with no progress for 6
// minutes is stopped first) and answers at once with its id; the job runs after the response (the report job's
// pattern). Answers { ok: true, runId } (started), { ok: false, error: "busy", runId } (a run is active), or
// { ok: false, error }. Admins only: everyone else gets 404.

// The job writes every day page with the AI, then renders: give it the longest time the plan allows.
export const maxDuration = 300;

export async function POST(request: Request, ctx: RouteContext<"/api/admin/children/[id]/workbook-runs">) {
  const admin = await adminSession();
  if (!admin) return new Response("Not found", { status: 404 });
  if (request.headers.get("origin") !== new URL(request.url).origin) return new Response("Forbidden", { status: 403 });
  const { id } = await ctx.params;
  if (!isUuid(id)) return new Response("Not found", { status: 404 });
  const db = adminClient();
  if (!db) return Response.json({ ok: false, error: "unavailable" }, { status: 503 });
  try {
    const start = await startWorkbookRun(workbookRunStore(db), id.toLowerCase(), { id: admin.userId, email: admin.email });
    if (start.status === "refused") return Response.json({ ok: false, error: start.reason }, { status: 409 });
    if (start.status === "busy") return Response.json({ ok: false, error: "busy", runId: start.runId }, { status: 409 });
    after(() => runWorkbookJobNow(start.runId));
    return Response.json({ ok: true, runId: start.runId });
  } catch (e) {
    console.error("[workbook job] start failed", id, e instanceof Error ? e.message : String(e));
    return Response.json({ ok: false, error: "unavailable" }, { status: 503 });
  }
}
