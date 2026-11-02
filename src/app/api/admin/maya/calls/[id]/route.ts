import { adminSession } from "@/lib/admin-store";
import { isUuid } from "@/lib/assessment-store";
import { boardPlayback, type CallInput } from "@/lib/maya-call";
import { childFirstName, serverMayaCalls } from "@/lib/maya-call-server";

// GET: the call's view and board. POST: one input to an admin test call with Maya (#323). Body: { revision, input } where input is { type: "child", text },
// { type: "tick" }, { type: "writing", status } or { type: "end" }. Answers { ok, view, output, board } or
// { ok: false, error }; "conflict" means another request changed the call first (read it again).
export const maxDuration = 300;

/** The call as the admin screen shows it, with its board: a voice call's screen reads it after each of Maya's turns. */
export async function GET(_request: Request, ctx: RouteContext<"/api/admin/maya/calls/[id]">) {
  const admin = await adminSession();
  if (!admin) return new Response("Not found", { status: 404 });
  const { id } = await ctx.params;
  if (!isUuid(id)) return new Response("Not found", { status: 404 });
  const calls = serverMayaCalls();
  if (!calls) return Response.json({ ok: false, error: "unavailable" }, { status: 503 });
  try {
    const view = await calls.view(id.toLowerCase());
    if (!view) return new Response("Not found", { status: 404 });
    return Response.json({ ok: true, view, board: boardPlayback(view.batches) }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    console.error("[maya call] read failed", id, e instanceof Error ? e.message : String(e));
    return Response.json({ ok: false, error: "failed" }, { status: 500 });
  }
}

export async function POST(request: Request, ctx: RouteContext<"/api/admin/maya/calls/[id]">) {
  const admin = await adminSession();
  if (!admin) return new Response("Not found", { status: 404 });
  if (request.headers.get("origin") !== new URL(request.url).origin) return new Response("Forbidden", { status: 403 });
  const { id } = await ctx.params;
  if (!isUuid(id)) return new Response("Not found", { status: 404 });
  const body = (await request.json().catch(() => null)) as { revision?: unknown; input?: CallInput } | null;
  if (!body || !Number.isInteger(body.revision) || typeof body.input !== "object" || body.input === null) return Response.json({ ok: false, error: "invalid_input" }, { status: 400 });
  const calls = serverMayaCalls(new URL(request.url).origin);
  if (!calls) return Response.json({ ok: false, error: "unavailable" }, { status: 503 });
  try {
    const view = await calls.view(id.toLowerCase());
    if (!view) return new Response("Not found", { status: 404 });
    // Child chat turns must pass the desk's locked message admission. Admin review cannot act as the child.
    if (view.kind === "chat" && (view.status === "live" || body.input.type !== "end")) return Response.json({ ok: false, error: "read_only" }, { status: 403 });
    const result = await calls.input(view.id, body.revision as number, body.input, await childFirstName(view.childId));
    if (!result.ok) return Response.json(result, { status: result.error === "not_found" ? 404 : result.error === "invalid_input" ? 400 : 409 });
    return Response.json({ ...result, board: boardPlayback(result.view.batches) });
  } catch (e) {
    console.error("[maya call] input failed", id, e instanceof Error ? e.message : String(e));
    return Response.json({ ok: false, error: "failed" }, { status: 500 });
  }
}
