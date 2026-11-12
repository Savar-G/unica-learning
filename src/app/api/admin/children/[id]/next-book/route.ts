import { adminSession } from "@/lib/admin-store";
import { isUuid } from "@/lib/assessment-store";
import { prepareFromSnapshot } from "@/lib/next-book-admin";
import { adminNextBookDeps } from "@/lib/next-book-admin-server";
import { adminClient } from "@/lib/supabase-auth";

// #476: "Prepare from snapshot" on the admin child page. Prepares book 2 from the frozen snapshot of the child's delivered
// book 1 (src/lib/next-book-admin.ts) and answers { ok, line } with one status line in plain words. Re-entrant: press it
// again while the snapshot waits for the last marks. With no planner wired it writes nothing. Admins only: everyone else
// gets 404. A family being deleted is refused.

export async function POST(request: Request, ctx: RouteContext<"/api/admin/children/[id]/next-book">) {
  const admin = await adminSession();
  if (!admin) return new Response("Not found", { status: 404 });
  if (request.headers.get("origin") !== new URL(request.url).origin) return new Response("Forbidden", { status: 403 });
  const { id } = await ctx.params;
  if (!isUuid(id)) return new Response("Not found", { status: 404 });
  const db = adminClient();
  if (!db) return Response.json({ ok: false, line: "The database is unavailable. Try again later." }, { status: 503 });
  const answer = await prepareFromSnapshot({ id: admin.userId, email: admin.email || null }, id.toLowerCase(), adminNextBookDeps(db));
  if (!answer.ok && answer.error === "not-found") return new Response("Not found", { status: 404 });
  if (!answer.ok && answer.error === "unavailable") console.error("[next book] admin prepare failed", id);
  const status = answer.ok || answer.error === "planner-not-ready" ? 200 : answer.error === "unavailable" ? 503 : 409;
  return Response.json({ ok: answer.ok, line: answer.line }, { status });
}
