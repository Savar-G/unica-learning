import { adminSession } from "@/lib/admin-store";
import { isUuid } from "@/lib/assessment-store";
import { runFamilyDeletion } from "@/lib/family-deletion-store";
import { adminClient } from "@/lib/supabase-auth";

export const maxDuration = 60;

export async function POST(request: Request, ctx: RouteContext<"/api/admin/parents/[id]/delete">) {
  // Checks Auth and live admin membership for every request; includes the pilot gate.
  const admin = await adminSession();
  if (!admin) return new Response("Not found", { status: 404 });
  if (request.headers.get("origin") !== new URL(request.url).origin) return new Response("Forbidden", { status: 403 });
  if (!request.headers.get("content-type")?.startsWith("application/json")) return new Response("Unsupported media type", { status: 415 });
  const { id } = await ctx.params;
  if (!isUuid(id)) return new Response("Not found", { status: 404 });
  let confirmation: unknown;
  try { confirmation = (await request.json()).confirmation; }
  catch { return Response.json({ ok: false, error: "confirmation" }, { status: 400 }); }
  if (typeof confirmation !== "string" || confirmation.length > 200) return Response.json({ ok: false, error: "confirmation" }, { status: 400 });
  const db = adminClient();
  if (!db) return Response.json({ ok: false, error: "unavailable" }, { status: 503 });

  const { data: state, error } = await admin.db.rpc("request_family_deletion", { p: id, confirmation });
  if (error) return Response.json({ ok: false, error: "unavailable" }, { status: 503 });
  if (state === "missing") return new Response("Not found", { status: 404 });
  if (state !== "requested") return Response.json({ ok: false, error: state }, { status: state === "confirmation" ? 400 : 409 });
  try {
    const result = await runFamilyDeletion(db, id);
    if (result.state !== "deleted") return Response.json({ ok: false, error: "pending" }, { status: 409 });
    return Response.json({ ok: true, images: result.images });
  } catch (e) {
    console.error("[deletion] family request incomplete", e instanceof Error ? e.message : "failed");
    return Response.json({ ok: false, error: "pending" }, { status: 503 });
  }
}
