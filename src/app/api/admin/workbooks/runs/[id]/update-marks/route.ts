import { adminSession } from "@/lib/admin-store";
import { isUuid } from "@/lib/assessment-store";
import { nextBookWiring } from "@/lib/next-book-planner";
import { nextBookSnapshotServer } from "@/lib/next-book-snapshot-server";
import { adminClient } from "@/lib/supabase-auth";

// D-308 (#476): "Update with new marks" on a next-book run's draft, before "Approve for print". Writes the snapshot chain's
// next revision over every marked day of the current book and plans it (src/lib/next-book-refresh.ts). It starts no run
// and does not draw the pages again. Answers { ok, line } with one status line. Admins only: everyone else gets 404.
export async function POST(request: Request, ctx: RouteContext<"/api/admin/workbooks/runs/[id]/update-marks">) {
  const admin = await adminSession();
  if (!admin) return new Response("Not found", { status: 404 });
  if (request.headers.get("origin") !== new URL(request.url).origin) return new Response("Forbidden", { status: 403 });
  const { id } = await ctx.params;
  if (!isUuid(id)) return new Response("Not found", { status: 404 });
  const db = adminClient();
  if (!db) return Response.json({ ok: false, line: "The database is unavailable. Try again later." }, { status: 503 });
  try {
    const run = await db.from("workbook_runs").select("draft_id").eq("id", id.toLowerCase()).maybeSingle();
    if (run.error) throw new Error(run.error.message);
    if (!run.data?.draft_id) return new Response("Not found", { status: 404 });
    const wiring = nextBookWiring();
    const server = wiring ? nextBookSnapshotServer(wiring, db) : null;
    if (!server) return Response.json({ ok: false, line: "The planner is not ready yet." });
    const answer = await server.update(run.data.draft_id, { id: admin.userId, email: admin.email || null });
    if (!answer.ok && answer.error === "not-found") return new Response("Not found", { status: 404 });
    if (!answer.ok && answer.error === "unavailable") console.error("[next book] update with new marks failed", id);
    const status = answer.ok || answer.error === "planner-not-ready" ? 200 : answer.error === "unavailable" ? 503 : 409;
    return Response.json({ ok: answer.ok, line: answer.line }, { status });
  } catch (e) {
    console.error("[next book] update with new marks failed", id, e instanceof Error ? e.message : String(e));
    return Response.json({ ok: false, line: "It could not be updated. Try again later." }, { status: 503 });
  }
}
