import { adminSession } from "@/lib/admin-store";
import { isUuid } from "@/lib/assessment-store";
import { adminClient } from "@/lib/supabase-auth";
import { workbookRunStore } from "@/lib/workbook-job-store";

// The Stop button on a workbook run: an admin ends a queued or running run (migration workbook_run_stop). The job sees it
// within seconds and ends its AI calls and prints; its later writes change nothing. Answers { ok: true } (stopped now, or
// by an admin before), or { ok: false, error } with how the run ended otherwise ("done", "failed", "stale"), or
// "unavailable". Admins only: everyone else gets 404.

export async function POST(request: Request, ctx: RouteContext<"/api/admin/workbook-runs/[id]/stop">) {
  const admin = await adminSession();
  if (!admin) return new Response("Not found", { status: 404 });
  if (request.headers.get("origin") !== new URL(request.url).origin) return new Response("Forbidden", { status: 403 });
  const { id } = await ctx.params;
  if (!isUuid(id)) return new Response("Not found", { status: 404 });
  const db = adminClient();
  if (!db) return Response.json({ ok: false, error: "unavailable" }, { status: 503 });
  try {
    const answer = await workbookRunStore(db).stop(id.toLowerCase(), { id: admin.userId, email: admin.email });
    if (answer === "not_found") return new Response("Not found", { status: 404 });
    if (answer === "stopped" || answer === "already") return Response.json({ ok: true });
    return Response.json({ ok: false, error: answer }, { status: 409 });
  } catch (e) {
    console.error("[workbook job] stop failed", id, e instanceof Error ? e.message : String(e));
    return Response.json({ ok: false, error: "unavailable" }, { status: 503 });
  }
}
