import { adminSession } from "@/lib/admin-store";
import { isUuid } from "@/lib/assessment-store";
import { adminClient } from "@/lib/supabase-auth";
import { markWorkbook } from "@/lib/workbook-ship";
import { workbookShipStore } from "@/lib/workbook-ship-store";

// #314: mark a stored workbook printed (from approved) or shipped (from printed). Body { to }. Answers
// { ok: true, at, firstShipped } (the child's first shipped workbook: the page leads to "Workbook shipped: start plan")
// or { ok: false, reason } (409). Admins only: everyone else gets 404.
export async function POST(request: Request, ctx: RouteContext<"/api/admin/workbooks/[id]/status">) {
  const admin = await adminSession();
  if (!admin) return new Response("Not found", { status: 404 });
  if (request.headers.get("origin") !== new URL(request.url).origin) return new Response("Forbidden", { status: 403 });
  const { id } = await ctx.params;
  if (!isUuid(id)) return new Response("Not found", { status: 404 });
  const to = (await request.json().catch(() => null) as { to?: unknown } | null)?.to;
  if (to !== "printed" && to !== "shipped") return Response.json({ ok: false, reason: "the new status is not printed or shipped" }, { status: 400 });
  const db = adminClient();
  if (!db) return Response.json({ ok: false, error: "unavailable" }, { status: 503 });
  try {
    const result = await markWorkbook(workbookShipStore(db), { workbookId: id.toLowerCase(), to, actor: { id: admin.userId, email: admin.email } });
    if (result.status === "not-found") return new Response("Not found", { status: 404 });
    if (result.status === "refused") return Response.json({ ok: false, reason: result.reason }, { status: 409 });
    return Response.json({ ok: true, at: result.at, firstShipped: result.firstShipped });
  } catch (e) {
    console.error("[workbook ship] mark failed", id, e instanceof Error ? e.message : String(e));
    return Response.json({ ok: false, error: "unavailable" }, { status: 503 });
  }
}
