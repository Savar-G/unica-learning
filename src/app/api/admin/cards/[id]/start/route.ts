import { adminSession, type CardSetupRow } from "@/lib/admin-store";
import { isUuid } from "@/lib/assessment-store";
import { startPlan, stripe } from "@/lib/stripe";
import { planPrice } from "@/lib/subscription-plan";

// D-139: an admin starts a saved card's paid plan when the child's first workbook ships. Stripe holds the result; the
// dashboard reads it from there. Answers { ok, firstChargeAt } or { ok: false, error }.
export async function POST(request: Request, ctx: RouteContext<"/api/admin/cards/[id]/start">) {
  // Checks Auth and live admin membership for every request.
  const admin = await adminSession();
  if (!admin) return new Response("Not found", { status: 404 });
  if (request.headers.get("origin") !== new URL(request.url).origin) return new Response("Forbidden", { status: 403 });
  const { id } = await ctx.params;
  if (!isUuid(id)) return new Response("Not found", { status: 404 });
  const s = stripe();
  if (!s) return Response.json({ ok: false, error: "unavailable" }, { status: 503 });
  const { data, error } = await admin.db.rpc("admin_card_setups").select("*").eq("id", id.toLowerCase()).maybeSingle();
  if (error) return Response.json({ ok: false, error: "unavailable" }, { status: 503 });
  const card = data as CardSetupRow | null;
  if (!card) return new Response("Not found", { status: 404 });
  if (!card.card_saved_at || !card.stripe_customer_id) return Response.json({ ok: false, error: "no_card" }, { status: 409 });
  try {
    const result = await startPlan(s, { cardSetup: card.id, customer: card.stripe_customer_id, price: planPrice(Number(card.price), card.plan) });
    return Response.json(result, { status: result.ok ? 200 : 409 });
  } catch (e) {
    console.error("[stripe] start plan failed", e instanceof Error ? e.message : "failed");
    return Response.json({ ok: false, error: "failed" }, { status: 502 });
  }
}
