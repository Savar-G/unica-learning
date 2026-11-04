import { adminSession, type CardSetupRow } from "@/lib/admin-store";
import { adminClient } from "@/lib/supabase-auth";
import { isUuid } from "@/lib/assessment-store";
import { startPlan, stripe } from "@/lib/stripe";
import { planPrice } from "@/lib/subscription-plan";
import { firstDelivery } from "@/lib/workbook-delivery";
import { workbookDeliveryStore } from "@/lib/workbook-delivery-store";
import { sendPlanStartEmail } from "@/lib/workbook-email-server";
import { workbookStore } from "@/lib/workbook-store";

// D-139: an admin starts a saved card's paid plan when the child's first workbook arrives at your home. Stripe holds the result; the
// dashboard reads it from there, and the parent gets the confirmation email. Answers { ok, firstChargeAt, confirmation }
// or { ok: false, error }.
export async function POST(request: Request, ctx: RouteContext<"/api/admin/cards/[id]/start">) {
  // Checks Auth and live admin membership for every request.
  const admin = await adminSession();
  if (!admin) return new Response("Not found", { status: 404 });
  if (request.headers.get("origin") !== new URL(request.url).origin) return new Response("Forbidden", { status: 403 });
  if (!request.headers.get("content-type")?.startsWith("application/json")) return Response.json({ ok: false, error: "delivery_confirmation_required" }, { status: 415 });
  const { id } = await ctx.params;
  if (!isUuid(id)) return new Response("Not found", { status: 404 });
  let body: unknown;
  try { body = await request.json(); }
  catch { return Response.json({ ok: false, error: "invalid" }, { status: 400 }); }
  if (!body || typeof body !== "object" || !("deliveryConfirmed" in body) || body.deliveryConfirmed !== true) {
    return Response.json({ ok: false, error: "not_delivered" }, { status: 409 });
  }
  const { data, error } = await admin.db.rpc("admin_card_setups").select("*").eq("id", id.toLowerCase()).maybeSingle();
  if (error) return Response.json({ ok: false, error: "unavailable" }, { status: 503 });
  const card = data as CardSetupRow | null;
  if (!card) return new Response("Not found", { status: 404 });
  if (!card.card_saved_at || !card.stripe_customer_id) return Response.json({ ok: false, error: "no_card" }, { status: 409 });
  try {
    const receipt = await firstDelivery(workbookDeliveryStore(admin.db), await workbookStore(admin.db).childWorkbooks(card.child_id), card.parent_id, card.child_id);
    if (!receipt) return Response.json({ ok: false, error: "delivery_receipt_required" }, { status: 409 });
    const s = stripe();
    if (!s) return Response.json({ ok: false, error: "unavailable" }, { status: 503 });
    const price = planPrice(Number(card.price), card.plan);
    const result = await startPlan(s, { cardSetup: card.id, customer: card.stripe_customer_id, price, deliveryConfirmed: true });
    if (!result.ok) return Response.json(result, { status: 409 });
    return Response.json({ ...result, confirmation: await confirm(card.id, price, result.firstChargeAt, new URL(request.url).origin) });
  } catch (e) {
    console.error("[stripe] start plan failed", e instanceof Error ? e.message : "failed");
    return Response.json({ ok: false, error: "failed" }, { status: 502 });
  }
}

/** The plan has started, so a failed email must not read as a failed start. The admin sees the outcome. */
async function confirm(cardId: string, price: number, firstChargeAt: string, origin: string) {
  const db = adminClient();
  if (!db) return "not_sent";
  try {
    return (await sendPlanStartEmail(db, { cardId, price, firstChargeAt, origin })).status;
  } catch (e) {
    console.error("[stripe] plan start email failed", e instanceof Error ? e.message : "failed");
    return "not_sent";
  }
}
