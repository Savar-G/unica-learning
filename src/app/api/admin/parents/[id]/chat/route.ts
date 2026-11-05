import { adminSession } from "@/lib/admin-store";
import { setChatFamily, type ChatFamilyChange } from "@/lib/admin-maya-chat";
import { isUuid } from "@/lib/assessment-store";

// Adds a family to the Maya chat list or removes it, or marks the rehearsal family (#530). Same checks as the test
// family route: a live admin, the site's own origin, and JSON.
export async function POST(request: Request, ctx: RouteContext<"/api/admin/parents/[id]/chat">) {
  const admin = await adminSession();
  if (!admin) return new Response("Not found", { status: 404 });
  if (request.headers.get("origin") !== new URL(request.url).origin) return new Response("Forbidden", { status: 403 });
  if (!request.headers.get("content-type")?.startsWith("application/json")) return new Response("Unsupported media type", { status: 415 });
  const { id } = await ctx.params;
  if (!isUuid(id)) return new Response("Not found", { status: 404 });
  let body: unknown;
  try { body = await request.json(); }
  catch { return Response.json({ ok: false }, { status: 400 }); }
  const b = (body ?? {}) as Record<string, unknown>;
  const keys = Object.keys(b);
  let change: ChatFamilyChange;
  if (keys.length === 1 && typeof b.listed === "boolean") change = { listed: b.listed };
  else if (keys.length === 1 && typeof b.rehearsal === "boolean") change = { rehearsal: b.rehearsal };
  else return Response.json({ ok: false }, { status: 400 });
  try {
    const result = await setChatFamily(admin, id.toLowerCase(), change);
    return Response.json({ ok: result === "ok", result }, { status: result === "ok" ? 200 : 409 });
  } catch (e) {
    console.error("[admin] chat family failed", e instanceof Error ? e.message : e);
    return Response.json({ ok: false }, { status: 503 });
  }
}
