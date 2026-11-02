import { after } from "next/server";
import { adminSession } from "@/lib/admin-store";
import { isUuid } from "@/lib/assessment-store";
import { adminClient } from "@/lib/supabase-auth";
import { routeWorkbookRun } from "@/lib/workbook-job-store";
import { runWorkbookJobNow } from "@/lib/workbook-job-server";

// D-200: "Run on the server with the API" on a run that waits for the Mac (the worker is off or asleep). Moves the run
// to the server (runner 'server', so the worker no longer takes it) when no one is working on it (queued, or running
// with no holder or no progress for 6 minutes), then runs the job here after the response, with the API. Answers
// { ok: true } or { ok: false, error: "busy" } (someone is working on it, or it ended). Admins only: everyone else 404.

export const maxDuration = 300;

export async function POST(request: Request, ctx: RouteContext<"/api/admin/workbook-runs/[id]/server">) {
  const admin = await adminSession();
  if (!admin) return new Response("Not found", { status: 404 });
  if (request.headers.get("origin") !== new URL(request.url).origin) return new Response("Forbidden", { status: 403 });
  const { id } = await ctx.params;
  if (!isUuid(id)) return new Response("Not found", { status: 404 });
  const db = adminClient();
  if (!db) return Response.json({ ok: false, error: "unavailable" }, { status: 503 });
  try {
    const runId = id.toLowerCase();
    const routed = await routeWorkbookRun(db, runId, "server");
    if (!routed) return Response.json({ ok: false, error: "busy" }, { status: 409 });
    const origin = new URL(request.url).origin;
    after(() => runWorkbookJobNow(runId, { origin, resume: routed === "stalled" }));
    return Response.json({ ok: true });
  } catch (e) {
    console.error("[workbook job] server run failed", id, e instanceof Error ? e.message : String(e));
    return Response.json({ ok: false, error: "unavailable" }, { status: 503 });
  }
}
