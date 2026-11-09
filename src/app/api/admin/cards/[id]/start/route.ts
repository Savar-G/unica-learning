import { adminSession, type CardSetupRow } from "@/lib/admin-store";
import { adminClient } from "@/lib/supabase-auth";
import { isUuid } from "@/lib/assessment-store";
import { endCardOperation, holdPlanStart } from "@/lib/family-deletion-store";
import { applyPlanStart } from "@/lib/plan-state";
import { livePlanStates } from "@/lib/plan-state-server";
import { startPlan, stripe } from "@/lib/stripe";
import { planPrice } from "@/lib/subscription-plan";
import type { StartPlanError } from "@/lib/plan-start-errors";
import { firstDelivery } from "@/lib/workbook-delivery";
import { workbookDeliveryStore } from "@/lib/workbook-delivery-store";
import { sendPlanStartEmail } from "@/lib/workbook-email-server";
import { workbookStore } from "@/lib/workbook-store";

const fail = (error: StartPlanError, status: number) => Response.json({ ok: false, error }, { status });

// D-139: an admin starts a saved card's paid plan when the child's first workbook arrives at your home. Stripe holds the result; the
// dashboard reads it from there, and the parent gets the confirmation email. This action also opens the product for that child
// (src/lib/plan-access.ts): it writes the plan state at once, before any webhook. Answers { ok, firstChargeAt, access, confirmation }
// or { ok: false, error }. `access` is "open" when the plan state is written, else "pending": see openAccess.
export async function POST(request: Request, ctx: RouteContext<"/api/admin/cards/[id]/start">) {
  // Checks Auth and live admin membership for every request.
  const admin = await adminSession();
  if (!admin) return new Response("Not found", { status: 404 });
  if (request.headers.get("origin") !== new URL(request.url).origin) return new Response("Forbidden", { status: 403 });
  if (!request.headers.get("content-type")?.startsWith("application/json")) return fail("delivery_confirmation_required", 415);
  const { id } = await ctx.params;
  if (!isUuid(id)) return new Response("Not found", { status: 404 });
  let body: unknown;
  try { body = await request.json(); }
  catch { return fail("invalid", 400); }
  if (!body || typeof body !== "object" || !("deliveryConfirmed" in body) || body.deliveryConfirmed !== true) {
    return fail("not_delivered", 409);
  }
  const { data, error } = await admin.db.rpc("admin_card_setups").select("*").eq("id", id.toLowerCase()).maybeSingle();
  if (error) return fail("unavailable", 503);
  const card = data as CardSetupRow | null;
  if (!card) return new Response("Not found", { status: 404 });
  if (!card.card_saved_at || !card.stripe_customer_id) return fail("no_card", 409);
  try {
    const receipt = await firstDelivery(workbookDeliveryStore(admin.db), await workbookStore(admin.db).childWorkbooks(card.child_id), card.parent_id, card.child_id);
    if (!receipt) return fail("delivery_receipt_required", 409);
    const s = stripe();
    if (!s) return fail("unavailable", 503);
    // #556: a family's deletion request reads no plans, so a plan must not start under one. Started first, this hold makes
    // the request wait for a retry that sees the plan. Requested first, the fence refuses the hold, and so does the delete's
    // hold, from before its final plan read. Every exit releases this route hold. An uncertain create keeps its open plan
    // start record, which refuses deletion until recovery or an admin check closes it (#554).
    const service = adminClient();
    if (!service) return fail("unavailable", 503);
    if (await holdPlanStart(service, card.parent_id, card.id) === "fenced") return fail("family_unavailable", 409);
    try {
      const price = planPrice(Number(card.price), card.plan);
      const startedAt = Date.now();
      const result = await startPlan(s, { cardSetup: card.id, customer: card.stripe_customer_id, price, deliveryConfirmed: true });
      if (!result.ok) return Response.json(result, { status: 409 });
      const access = await openAccess({ customer: card.stripe_customer_id, cardSetup: card.id, generation: result.generation, startedAt });
      return Response.json({ ...result, access, confirmation: await confirm(card.id, result.generation, price, result.firstChargeAt, new URL(request.url).origin) });
    } finally {
      await endCardOperation(service, card.id);
    }
  } catch (e) {
    console.error("[stripe] start plan failed", e instanceof Error ? e.message : "failed");
    return fail("failed", 502);
  }
}

/**
 * The plan has started, so a failed write must not read as a failed start. "pending" means only that the write did not answer `stored`:
 * it may have stored and lost its answer. After a real failure the webhook or the daily re-read tries again: the re-read takes a child
 * whose newest plan start is `started` while its row is missing, `not_started` or `ended` (#713, PLAN_START_READ_KINDS in
 * src/lib/plan-state.ts), a few per run, for as long as Stripe answers. The admin card says that access could not be confirmed (StartPlan).
 */
async function openAccess(start: Parameters<typeof applyPlanStart>[0]): Promise<"open" | "pending"> {
  try {
    const states = livePlanStates();
    if (!states) return "pending";
    return await applyPlanStart(start, states) === "no_match" ? "pending" : "open";
  } catch (e) {
    console.error("[stripe] plan state after start failed", e instanceof Error ? e.message : "failed");
    return "pending";
  }
}

/** The plan has started, so a failed email must not read as a failed start. The admin sees the outcome. */
async function confirm(cardId: string, generation: number, price: number, firstChargeAt: string, origin: string) {
  const db = adminClient();
  if (!db) return "not_sent";
  try {
    return (await sendPlanStartEmail(db, { cardId, generation, price, firstChargeAt, origin })).status;
  } catch (e) {
    console.error("[stripe] plan start email failed", e instanceof Error ? e.message : "failed");
    return "not_sent";
  }
}
