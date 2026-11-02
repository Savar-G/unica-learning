import { after } from "next/server";
import { adminSession } from "@/lib/admin-store";
import { isUuid } from "@/lib/assessment-store";
import { adminClient } from "@/lib/supabase-auth";
import { workbookRunner } from "@/lib/workbook-ai";
import { startWorkbookRun } from "@/lib/workbook-job";
import { routeWorkbookRun, workbookRunStore } from "@/lib/workbook-job-store";
import { runWorkbookJobNow } from "@/lib/workbook-job-server";

// #312: "Prepare next workbook" for a child. Starts a run (one at a time per child; a run with no progress for 6
// minutes, or no holder for 2, is taken up again where it stopped) and answers at once with its id. D-200: with
// WORKBOOK_RUNNER "mac" (the default) the run is only queued for the workbook worker on Savar's Mac (runner 'mac'), which
// makes it on his Claude subscription; with "server" the job runs here after the response (the report job's pattern),
// with the API. Answers { ok: true, runId, runner } (started or taken up again), { ok: false, error: "busy", runId } (a
// run is working), or { ok: false, error }. Admins only: everyone else gets 404.

// On the server path the job writes every day page with the AI, then renders: give it the longest time the plan allows.
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
    const runner = workbookRunner();
    if (runner === "mac") {
      // The worker claims a queued run, and takes up a stalled one (no holder, or no progress for 6 minutes).
      await routeWorkbookRun(db, start.runId, "mac");
      return Response.json({ ok: true, runId: start.runId, runner });
    }
    // A run that stopped mid-way is taken up again where it stopped; a new run starts from the plan.
    await routeWorkbookRun(db, start.runId, "server");
    const origin = new URL(request.url).origin;
    after(() => runWorkbookJobNow(start.runId, { origin, resume: start.status === "stalled" }));
    return Response.json({ ok: true, runId: start.runId, runner });
  } catch (e) {
    console.error("[workbook job] start failed", id, e instanceof Error ? e.message : String(e));
    return Response.json({ ok: false, error: "unavailable" }, { status: 503 });
  }
}
