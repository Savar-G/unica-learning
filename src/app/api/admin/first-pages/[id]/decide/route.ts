import { adminSession } from "@/lib/admin-store";
import { isUuid } from "@/lib/assessment-store";
import { decideFirstPages } from "@/lib/first-pages-store";
import { adminClient } from "@/lib/supabase-auth";

// The admin's choice after Workbook 1's plan stopped matching the first pages a parent saw (docs/first-pages.md):
// "keep-plan" (the run plans from the first pages' plan) or "drop" (the run makes the book without them; the report
// hides them). Admins only: everyone else gets 404.
export async function POST(request: Request, ctx: RouteContext<"/api/admin/first-pages/[id]/decide">) {
  const admin = await adminSession();
  if (!admin) return new Response("Not found", { status: 404 });
  if (request.headers.get("origin") !== new URL(request.url).origin) return new Response("Forbidden", { status: 403 });
  const { id } = await ctx.params;
  if (!isUuid(id)) return new Response("Not found", { status: 404 });
  const body = await request.json().catch(() => null) as { decision?: unknown } | null;
  const decision = body?.decision === "keep-plan" || body?.decision === "drop" ? body.decision : null;
  if (!decision) return Response.json({ ok: false, error: "Choose keep-plan or drop." }, { status: 400 });
  const db = adminClient();
  if (!db) return Response.json({ ok: false, error: "The database is unavailable. Try again later." }, { status: 503 });
  const answer = await decideFirstPages(db, id.toLowerCase(), decision, { id: admin.userId, email: admin.email });
  if (answer === "not_found") return Response.json({ ok: false, error: "No such first pages." }, { status: 404 });
  if (answer !== "decided") return Response.json({ ok: false, error: `Not possible: ${answer.refused}.` }, { status: 409 });
  return Response.json({ ok: true });
}
