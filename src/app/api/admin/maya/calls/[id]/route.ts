import { adminSession } from "@/lib/admin-store";
import { isUuid } from "@/lib/assessment-store";
import { boardPlayback, type CallInput } from "@/lib/maya-call";
import { childFirstName, serverMayaCalls } from "@/lib/maya-call-server";

// One input to an admin test call with Maya (#323). Body: { revision, input } where input is { type: "child", text },
// { type: "tick" }, { type: "writing", status } or { type: "end" }. Answers { ok, view, output, board } or
// { ok: false, error }; "conflict" means another request changed the call first (read it again).
export const maxDuration = 300;

export async function POST(request: Request, ctx: RouteContext<"/api/admin/maya/calls/[id]">) {
  const admin = await adminSession();
  if (!admin) return new Response("Not found", { status: 404 });
  if (request.headers.get("origin") !== new URL(request.url).origin) return new Response("Forbidden", { status: 403 });
  const { id } = await ctx.params;
  if (!isUuid(id)) return new Response("Not found", { status: 404 });
  const body = (await request.json().catch(() => null)) as { revision?: unknown; input?: CallInput } | null;
  if (!body || !Number.isInteger(body.revision) || typeof body.input !== "object" || body.input === null) return Response.json({ ok: false, error: "invalid_input" }, { status: 400 });
  const calls = serverMayaCalls();
  if (!calls) return Response.json({ ok: false, error: "unavailable" }, { status: 503 });
  try {
    const view = await calls.view(id.toLowerCase());
    if (!view) return new Response("Not found", { status: 404 });
    const result = await calls.input(view.id, body.revision as number, body.input, await childFirstName(view.childId));
    if (!result.ok) return Response.json(result, { status: result.error === "not_found" ? 404 : result.error === "invalid_input" ? 400 : 409 });
    return Response.json({ ...result, board: boardPlayback(result.view.batches) });
  } catch (e) {
    console.error("[maya call] input failed", id, e instanceof Error ? e.message : String(e));
    return Response.json({ ok: false, error: "failed" }, { status: 500 });
  }
}
