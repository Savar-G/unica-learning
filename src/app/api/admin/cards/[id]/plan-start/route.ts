import { adminSession, type CardSetupRow } from "@/lib/admin-store";
import { isUuid } from "@/lib/assessment-store";
import { endStuckPlanStart, stripe } from "@/lib/stripe";

// #554: an admin closes a plan start that Stripe never answered, after their own check in Stripe. The one thing that closes an open
// record with no plan found. It reads Stripe's whole list first. Answers { ok: true } or { ok: false, error }.
export async function POST(request: Request, ctx: RouteContext<"/api/admin/cards/[id]/plan-start">) {
  // Checks Auth and live admin membership for every request.
  const admin = await adminSession();
  if (!admin) return new Response("Not found", { status: 404 });
  if (request.headers.get("origin") !== new URL(request.url).origin) return new Response("Forbidden", { status: 403 });
  if (!request.headers.get("content-type")?.startsWith("application/json")) return Response.json({ ok: false, error: "invalid" }, { status: 415 });
  const { id } = await ctx.params;
  if (!isUuid(id)) return new Response("Not found", { status: 404 });
  let body: unknown;
  try { body = await request.json(); }
  catch { return Response.json({ ok: false, error: "invalid" }, { status: 400 }); }
  if (!body || typeof body !== "object" || !("checkedStripe" in body) || body.checkedStripe !== true || !("generation" in body) || typeof body.generation !== "number" || !Number.isInteger(body.generation) || body.generation < 1) {
    return Response.json({ ok: false, error: "invalid" }, { status: 400 });
  }
  const { data, error } = await admin.db.rpc("admin_card_setups").select("*").eq("id", id.toLowerCase()).maybeSingle();
  if (error) return Response.json({ ok: false, error: "unavailable" }, { status: 503 });
  const card = data as CardSetupRow | null;
  if (!card?.stripe_customer_id) return new Response("Not found", { status: 404 });
  const s = stripe();
  if (!s) return Response.json({ ok: false, error: "unavailable" }, { status: 503 });
  try {
    const result = await endStuckPlanStart(s, { cardSetup: card.id, customer: card.stripe_customer_id, generation: body.generation, admin: admin.userId });
    if (!result.ok) return Response.json(result, { status: 409 });
    return Response.json(result);
  } catch (e) {
    console.error("[stripe] closing a plan start failed", e instanceof Error ? e.message : "failed");
    return Response.json({ ok: false, error: "unavailable" }, { status: 502 });
  }
}
