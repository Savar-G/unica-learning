import { adminSession, setTestAccount } from "@/lib/admin-store";
import { isUuid } from "@/lib/assessment-store";

// Marks or unmarks a family as a test (D-099): the dashboard leaves test families out of its numbers. Same checks as
// the deletion route: a live admin, the site's own origin, and JSON.
export async function POST(request: Request, ctx: RouteContext<"/api/admin/parents/[id]/test">) {
  const admin = await adminSession();
  if (!admin) return new Response("Not found", { status: 404 });
  if (request.headers.get("origin") !== new URL(request.url).origin) return new Response("Forbidden", { status: 403 });
  if (!request.headers.get("content-type")?.startsWith("application/json")) return new Response("Unsupported media type", { status: 415 });
  const { id } = await ctx.params;
  if (!isUuid(id)) return new Response("Not found", { status: 404 });
  let test: unknown;
  try { test = (await request.json()).test; }
  catch { return Response.json({ ok: false }, { status: 400 }); }
  if (typeof test !== "boolean") return Response.json({ ok: false }, { status: 400 });
  try {
    await setTestAccount(admin, id.toLowerCase(), test);
    return Response.json({ ok: true, test });
  } catch (e) {
    console.error("[admin] test account failed", e instanceof Error ? e.message : e);
    return Response.json({ ok: false }, { status: 503 });
  }
}
