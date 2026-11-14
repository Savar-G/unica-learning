import { adminSession } from "@/lib/admin-store";
import { isUuid } from "@/lib/assessment-store";
import { newMarksView } from "@/lib/next-book-refresh";
import { draftNewMarksOnServer } from "@/lib/next-book-refresh-server";
import { nextBookWiring } from "@/lib/next-book-planner";
import { adminClient } from "@/lib/supabase-auth";

// D-308 (#476): the new marks check of a next-book run's draft (NewMarksView), read by the run page once when it opens
// and again after "Update with new marks", never by the page's own refresh loop: it reads the book's marks with the
// service key. A run that is not a next book answers { state: "none" } after one read. Admins only: everyone else 404.
export async function GET(_request: Request, ctx: RouteContext<"/api/admin/workbooks/runs/[id]/new-marks">) {
  const admin = await adminSession();
  if (!admin) return new Response("Not found", { status: 404 });
  const { id } = await ctx.params;
  if (!isUuid(id)) return new Response("Not found", { status: 404 });
  const db = adminClient();
  const ready = nextBookWiring() !== null;
  if (!db) return Response.json({ state: "unavailable", ready });
  const run = await db.from("workbook_runs").select("draft_id, snapshot_id").eq("id", id.toLowerCase()).maybeSingle();
  if (run.error) return Response.json({ state: "unavailable", ready });
  if (!run.data?.draft_id) return new Response("Not found", { status: 404 });
  if (!run.data.snapshot_id) return Response.json({ state: "none" });
  const marks = await draftNewMarksOnServer(db, run.data.draft_id);
  // The run has a snapshot: a chain the check cannot find is not known to be current.
  return Response.json(marks.kind === "none" ? { state: "unavailable", ready } : newMarksView(marks, ready), { headers: { "cache-control": "no-store" } });
}
