import { adminSession } from "@/lib/admin-store";
import { isUuid } from "@/lib/assessment-store";
import { queueFirstPagesNow } from "@/lib/first-pages-server";

// An admin makes the first pages of one finished test (docs/first-pages.md): for a check of a test family before the
// switches go on. The database's checks apply (the plan offered, no workbook, no saved card), not the 48-hour window or
// FIRST_PAGES_ENABLED. No email goes unless FIRST_PAGES_EMAIL_ENABLED is on. Admins only: everyone else gets 404.
export async function POST(request: Request, ctx: RouteContext<"/api/admin/assessments/[id]/first-pages">) {
  const admin = await adminSession();
  if (!admin) return new Response("Not found", { status: 404 });
  if (request.headers.get("origin") !== new URL(request.url).origin) return new Response("Forbidden", { status: 403 });
  const { id } = await ctx.params;
  if (!isUuid(id)) return new Response("Not found", { status: 404 });
  const answer = await queueFirstPagesNow(id.toLowerCase(), new URL(request.url).origin, "admin");
  if (!answer) return Response.json({ ok: false, error: "The database is unavailable. Try again later." }, { status: 503 });
  if (answer.status === "refused") return Response.json({ ok: false, error: `Not possible: ${answer.reason}.` }, { status: 409 });
  if (answer.status === "off") return Response.json({ ok: false, error: "Off." }, { status: 409 });
  return Response.json({ ok: true, status: answer.status, id: answer.id });
}
